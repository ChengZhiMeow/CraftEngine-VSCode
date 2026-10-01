import type {
  BitmapImageSpec,
  ImageDefinition,
  ImageSource,
  ReferenceImageSpec,
  ResolvedImage,
  TextureCandidate,
} from "./model.js";
import type { ImageCandidateInput } from "../model.js";
import { legacyKeyAccepted } from "../registry/legacyKeys.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { Messages } from "../../messages.js";
import { imageSchemaFieldForName } from "./schema.js";
import { evaluateExpression } from "../expression/evaluator.js";

export interface ImageBuildOptions {
  readonly includeInactiveDiagnostics?: boolean;
  readonly textureResolver: (
    namespace: string,
    path: string,
    source: ImageSource,
  ) => Promise<readonly TextureCandidate[]>;
  readonly knownTexture?: (
    namespace: string,
    path: string,
    source: ImageSource,
  ) => boolean;
  readonly codepointStart?: number;
  readonly minecraftDefaultCodepointStart?: number;
  // 资源段没有版本标记, 用工作区 config.yml 声明的版本放宽旧键
  readonly configVersion?: number;
}

export interface ImageBuildResult {
  readonly images: readonly ImageDefinition[];
  readonly resolved: ReadonlyMap<ImageDefinition, ResolvedImage>;
  readonly issues: readonly CoreIssue[];
}

interface ParsedGrid {
  readonly rows: number;
  readonly columns: number;
  readonly codepoints: readonly (readonly (number | undefined)[])[];
}

function sourceRange(
  source: ImageSource,
  field?: string,
  key = false,
): TextRange {
  if (!field) return source.idRange;
  return (
    (key ? source.fieldKeyRanges : source.fieldValueRanges).get(field) ??
    source.fieldKeyRanges.get(field) ??
    source.idRange
  );
}

function issue(
  source: ImageSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"] = "error",
  field?: string,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: sourceRange(source, field),
  };
}

function field(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): [string, unknown] | undefined {
  for (const name of names) {
    if (
      Object.prototype.hasOwnProperty.call(raw, name) &&
      raw[name] !== null &&
      raw[name] !== undefined
    )
      return [name, raw[name]];
  }
  return undefined;
}

// CE 的 getAsInt: 数字截断, 字符串先删下划线再解析, 失败后按表达式求值
function integer(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text === "") return undefined;
  const literal = Number(text.replaceAll("_", ""));
  if (Number.isFinite(literal)) return Math.trunc(literal);
  try {
    const evaluated = evaluateExpression(text);
    return typeof evaluated === "number" && Number.isFinite(evaluated)
      ? Math.trunc(evaluated)
      : undefined;
  } catch {
    return undefined;
  }
}

function decodeCodepoint(value: unknown): number | undefined {
  // CE 只有 Number 才是固定码位, 字符串一律按字符序列处理
  if (typeof value === "number") {
    // CE 的码位走 getAsInt, Number 直接 intValue() 截断(ConfigValue.java:119-139), 65.7 就是 65
    const truncated = Math.trunc(value);
    return truncated >= 0 && truncated <= 0x10ffff ? truncated : undefined;
  }
  if (typeof value !== "string") return undefined;
  const escaped = value.match(/^\\u\{?([0-9a-fA-F]{4,6})\}?$/u)?.[1];
  if (escaped) return Number.parseInt(escaped, 16);
  const characters = Array.from(value);
  return characters.length === 1 ? characters[0]?.codePointAt(0) : undefined;
}

function listRowText(value: unknown): string {
  // CE 的 getAsStringList 会把元素 toString: chars: [65, 66] 是 "65"/"66"
  // 两个字符行, 不是码位 65/66
  return typeof value === "string" ? value : String(value);
}

function codepointRow(
  value: unknown,
): readonly (number | undefined)[] | undefined {
  if (typeof value === "string") {
    const escapes = [
      ...value.matchAll(/\\u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/gu),
    ];
    if (
      escapes.length > 0 &&
      escapes.map((match) => match[0]).join("") === value
    ) {
      return escapes.map((match) =>
        Number.parseInt(match[1] ?? match[2] ?? "", 16),
      );
    }
    const escaped = decodeCodepoint(value);
    if (
      escaped !== undefined &&
      (value.startsWith("\\u") || Array.from(value).length === 1)
    )
      return [escaped];
    return Array.from(value).map((character) => character.codePointAt(0));
  }
  // CE 的 getAsStringList 会把元素 toString, 所以列表里的元素一律按字符串处理
  if (isUnknownArray(value))
    return value.flatMap((entry) => codepointRow(listRowText(entry)) ?? []);
  // CE 只有 Number 是固定码位, 其它标量会先 toString 再按字符行处理
  if (typeof value !== "number") return codepointRow(listRowText(value));
  const single = decodeCodepoint(value);
  return single === undefined ? undefined : [single];
}

function parseGridSize(
  value: unknown,
): [rows: number, columns: number] | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",");
  if (parts.length !== 2) return undefined;
  const rows = integer(parts[0]?.trim());
  const columns = integer(parts[1]?.trim());
  return rows !== undefined && columns !== undefined
    ? [rows, columns]
    : undefined;
}

function parseGrid(
  raw: Readonly<Record<string, unknown>>,
  source: ImageSource,
  issues: CoreIssue[],
): ParsedGrid {
  const charsEntry = field(raw, ["char", "chars", "unicode"]);
  if (charsEntry) {
    const [fieldName, value] = charsEntry;
    let rows: Array<readonly (number | undefined)[]>;
    if (isUnknownArray(value)) {
      // chars 的每个元素是一行, 元素先按 CE 的 toString 语义转成字符串
      rows = value.map((row) => codepointRow(listRowText(row)) ?? []);
    } else {
      rows = [codepointRow(value) ?? []];
    }
    const width = rows[0]?.length ?? 0;
    if (
      width === 0 ||
      rows.some(
        (row) =>
          row.length !== width || row.some((point) => point === undefined),
      )
    ) {
      issues.push(
        issue(
          source,
          "invalid-chars",
          Messages.src.config.image.parser.text0001,
          "error",
          fieldName,
        ),
      );
    }
    return {
      rows: Math.max(1, rows.length),
      columns: Math.max(1, width),
      codepoints: rows,
    };
  }

  const gridEntry = field(raw, ["grid_size", "grid-size"]);
  if (gridEntry) {
    const parsed = parseGridSize(gridEntry[1]);
    if (!parsed || parsed[0] <= 0 || parsed[1] <= 0) {
      issues.push(
        issue(
          source,
          "invalid-grid",
          Messages.src.config.image.parser.text0002,
          "error",
          gridEntry[0],
        ),
      );
      return {
        rows: 1,
        columns: 1,
        codepoints: [[undefined]],
      };
    }
    const [rows, columns] = parsed;
    return {
      rows,
      columns,
      codepoints: Array.from({ length: rows }, () =>
        Array<number | undefined>(columns).fill(undefined),
      ),
    };
  }
  return { rows: 1, columns: 1, codepoints: [[undefined]] };
}

function parseReference(
  raw: Readonly<Record<string, unknown>>,
  source: ImageSource,
  issues: CoreIssue[],
): ReferenceImageSpec {
  const ref = typeof raw.ref === "string" ? raw.ref.trim() : "";
  const pieces = ref.split(":");
  let target = ref;
  let rowFromRef: number | undefined;
  let columnFromRef: number | undefined;
  let shortReference = pieces.length === 1;
  if (pieces.length >= 3) {
    const maybeRow = integer(pieces.at(-2));
    const maybeColumn = integer(pieces.at(-1));
    if (
      maybeRow !== undefined &&
      maybeColumn !== undefined &&
      pieces.length >= 4
    ) {
      rowFromRef = maybeRow;
      columnFromRef = maybeColumn;
      target = pieces.slice(0, -2).join(":");
    } else {
      const final = integer(pieces.at(-1));
      if (final !== undefined) {
        rowFromRef = final;
        target = pieces.slice(0, -1).join(":");
      }
    }
    shortReference = !target.includes(":");
  }
  const row = integer(raw.row) ?? rowFromRef ?? 0;
  const column = integer(raw.col) ?? columnFromRef ?? 0;
  // CE: row/col 走 getInt, 没有下限, 负数不报错
  if (!target) {
    issues.push(
      issue(
        source,
        "invalid-ref",
        Messages.src.config.image.parser.text0004,
        "error",
        "ref",
      ),
    );
  }
  return { kind: "reference", ref: target, shortReference, row, column };
}

async function parseBitmap(
  raw: Readonly<Record<string, unknown>>,
  source: ImageSource,
  imageNamespace: string,
  options: ImageBuildOptions,
  issues: CoreIssue[],
): Promise<BitmapImageSpec> {
  const rawFile =
    typeof raw.file === "string" ? raw.file.trim().replaceAll("\\", "/") : "";
  if (!rawFile)
    issues.push(
      issue(
        source,
        "missing-file",
        Messages.src.config.image.parser.text0005,
        "error",
        "file",
      ),
    );
  const [fileNamespace, unnormalizedPath] = splitIdentifier(
    rawFile || "missing.png",
    "minecraft",
  );
  // CE 直接拼 assets/<ns>/textures/<value>, 不剥离开头的 textures/
  let filePath = unnormalizedPath;
  if (!filePath.endsWith(".png")) filePath += ".png";
  const file = `${fileNamespace}:${filePath}`;
  const rawFont =
    typeof raw.font === "string" && raw.font.trim()
      ? raw.font.trim()
      : `${source.pack.namespace}:default`;
  const font = makeIdentifier(rawFont, imageNamespace);
  if (rawFile && !isValidIdentifier(file)) {
    issues.push(
      issue(
        source,
        "invalid-file-id",
        Messages.src.config.image.parser.text0006(file),
        "error",
        "file",
      ),
    );
  }
  if (!isValidIdentifier(font)) {
    issues.push(
      issue(
        source,
        "invalid-font-id",
        Messages.src.config.image.parser.text0007(font),
        "error",
        "font",
      ),
    );
  }
  const grid = parseGrid(raw, source, issues);
  const candidates = rawFile
    ? await options.textureResolver(fileNamespace, filePath, source)
    : [];
  if (
    rawFile &&
    candidates.length === 0 &&
    options.knownTexture?.(fileNamespace, filePath, source) !== true
  ) {
    issues.push(
      issue(
        source,
        "missing-texture",
        Messages.src.config.image.parser.text0008(file),
        "error",
        "file",
      ),
    );
  }

  const heightEntry = field(raw, ["height", "scale", "scale_ratio"]);
  let height = heightEntry ? integer(heightEntry[1]) : undefined;
  if (heightEntry && height === undefined) {
    issues.push(
      issue(
        source,
        "invalid-height",
        Messages.src.config.image.parser.text0009,
        "error",
        heightEntry[0],
      ),
    );
    height = undefined;
  }
  if (height === undefined) {
    const base = candidates.find(
      (candidate) =>
        candidate.resourcePackRoot === source.pack.baseResourcePackRoot,
    );
    if (base?.height !== undefined)
      height = Math.floor(base.height / grid.rows);
    else
      issues.push(
        issue(
          source,
          "height-required",
          Messages.src.config.image.parser.text0010,
          "error",
          "height",
        ),
      );
  }
  const ascentEntry = field(raw, ["ascent", "y_position"]);
  const ascent = ascentEntry
    ? integer(ascentEntry[1])
    : height === undefined
      ? undefined
      : height - 1;
  if (ascentEntry && ascent === undefined) {
    issues.push(
      issue(
        source,
        "invalid-ascent",
        Messages.src.config.image.parser.text0011,
        "error",
        ascentEntry[0],
      ),
    );
  }
  if (height !== undefined && ascent !== undefined && height < ascent) {
    issues.push(
      issue(
        source,
        "ascent-over-height",
        Messages.src.config.image.parser.text0012,
        "error",
        ascentEntry?.[0] ?? heightEntry?.[0],
      ),
    );
  }

  return {
    kind: "bitmap",
    file,
    font,
    ...(height === undefined ? {} : { height }),
    ...(ascent === undefined ? {} : { ascent }),
    rows: grid.rows,
    columns: grid.columns,
    codepoints: grid.codepoints,
    textureCandidates: candidates,
  };
}

function related(
  definitions: readonly ImageDefinition[],
  current: ImageDefinition,
): NonNullable<CoreIssue["related"]> {
  return definitions
    .filter((definition) => definition !== current)
    .map((definition) => ({
      message: Messages.src.config.image.parser.text0014(
        definition.source.pack.name,
        definition.source.pack.namespace,
        definition.source.kind,
      ),
      uri: definition.source.uri,
      range: definition.source.idRange,
    }));
}

function allocateCodepoints(
  images: ImageDefinition[],
  options: ImageBuildOptions,
  issues: CoreIssue[],
): void {
  const used = new Map<string, Map<number, ImageDefinition>>();
  const explicitUses = new Map<string, Map<number, ImageDefinition[]>>();
  for (const image of images) {
    if (image.spec.kind !== "bitmap") continue;
    const scope = `${image.source.pack.resourcesRoot}\0${image.spec.font}`;
    const fontUsed = used.get(scope) ?? new Map<number, ImageDefinition>();
    used.set(scope, fontUsed);
    const scopedUses =
      explicitUses.get(scope) ?? new Map<number, ImageDefinition[]>();
    explicitUses.set(scope, scopedUses);
    for (const row of image.spec.codepoints) {
      for (const point of row) {
        if (point === undefined || point === 0) continue;
        if (!fontUsed.has(point)) fontUsed.set(point, image);
        if (image.source.pack.active) {
          const pointUses = scopedUses.get(point) ?? [];
          pointUses.push(image);
          scopedUses.set(point, pointUses);
        }
      }
    }
  }

  for (const [scope, scopedUses] of explicitUses) {
    for (const [point, pointUses] of scopedUses) {
      if (pointUses.length < 2) continue;
      const definitions = [...new Set(pointUses)];
      for (const definition of definitions) {
        issues.push({
          ...issue(
            definition.source,
            "codepoint-conflict",
            Messages.src.config.image.parser.text0015(
              scope.slice(scope.indexOf("\0") + 1),
              point.toString(16).toUpperCase().padStart(4, "0"),
            ),
            "error",
            field(definition.raw, ["char", "chars", "unicode"])?.[0],
          ),
          related: definitions
            .filter((other) => other !== definition)
            .map((other) => ({
              message: other.id,
              uri: other.source.uri,
              range: sourceRange(
                other.source,
                field(other.raw, ["char", "chars", "unicode"])?.[0],
              ),
            })),
        });
      }
    }
  }

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image || image.spec.kind !== "bitmap") continue;
    const fontUsed =
      used.get(`${image.source.pack.resourcesRoot}\0${image.spec.font}`) ??
      new Map<number, ImageDefinition>();
    let next =
      image.spec.font === "minecraft:default"
        ? (options.minecraftDefaultCodepointStart ?? 57_344)
        : (options.codepointStart ?? 19_968);
    const codepoints = image.spec.codepoints.map((row) =>
      row.map((point) => {
        if (point !== undefined) return point;
        while (fontUsed.has(next) && next <= 0x10ffff) next += 1;
        const allocated = next;
        fontUsed.set(allocated, image);
        next += 1;
        return allocated;
      }),
    );
    images[index] = { ...image, spec: { ...image.spec, codepoints } };
  }
}

function groupKey(definition: ImageDefinition, id = definition.id): string {
  return `${definition.source.pack.resourcesRoot}\0${id}`;
}

function addCollisionIssues(
  images: readonly ImageDefinition[],
  issues: CoreIssue[],
): void {
  for (const definitions of groupBy(
    images.filter((image) => image.source.pack.active),
    (image) => groupKey(image),
  ).values()) {
    if (definitions.length < 2) continue;
    for (const definition of definitions) {
      issues.push({
        ...issue(
          definition.source,
          "duplicate-image-id",
          Messages.src.config.image.parser.text0016(
            definition.id,
            definitions.length,
          ),
          "error",
        ),
        related: related(definitions, definition),
      });
    }
  }

  for (const definitions of groupBy(
    images.filter((image) => image.source.pack.active),
    (image) => groupKey(image, image.value),
  ).values()) {
    if (new Set(definitions.map((definition) => definition.id)).size < 2)
      continue;
    for (const definition of definitions) {
      issues.push({
        ...issue(
          definition.source,
          "ambiguous-short-id",
          Messages.src.config.image.parser.text0017(definition.value),
          "warning",
        ),
        related: related(definitions, definition),
      });
    }
  }
}

function resolveReferences(
  images: readonly ImageDefinition[],
  issues: CoreIssue[],
  includeInactiveDiagnostics: boolean,
): Map<ImageDefinition, ResolvedImage> {
  const byFull = groupBy(images, (image) => groupKey(image));
  const byShort = groupBy(images, (image) => groupKey(image, image.value));
  const result = new Map<ImageDefinition, ResolvedImage>();
  const resolving = new Set<ImageDefinition>();
  const report = (definition: ImageDefinition, value: CoreIssue): void => {
    if (definition.source.pack.active || includeInactiveDiagnostics)
      issues.push(value);
  };

  const resolve = (definition: ImageDefinition): ResolvedImage | undefined => {
    const cached = result.get(definition);
    if (cached) return cached;
    if (resolving.has(definition)) {
      report(
        definition,
        issue(
          definition.source,
          "ref-cycle",
          Messages.src.config.image.parser.text0018(definition.id),
          "error",
          "ref",
        ),
      );
      return undefined;
    }
    resolving.add(definition);
    if (definition.spec.kind === "bitmap") {
      const resolved = {
        bitmap: definition,
        row: 0,
        column: 0,
        chain: [definition],
      } satisfies ResolvedImage;
      result.set(definition, resolved);
      resolving.delete(definition);
      return resolved;
    }
    const spec = definition.spec;
    const key = groupKey(
      definition,
      spec.shortReference
        ? spec.ref
        : makeIdentifier(spec.ref, definition.namespace),
    );
    const matches = (spec.shortReference ? byShort : byFull).get(key) ?? [];
    const active = matches.filter((candidate) => candidate.source.pack.active);
    const candidates = active.length > 0 ? active : matches;
    if (candidates.length === 0) {
      report(
        definition,
        issue(
          definition.source,
          "unknown-ref",
          Messages.src.config.image.parser.text0019(spec.ref),
          "error",
          "ref",
        ),
      );
      resolving.delete(definition);
      return undefined;
    }
    if (candidates.length > 1) {
      report(definition, {
        ...issue(
          definition.source,
          "ambiguous-ref",
          Messages.src.config.image.parser.text0020(spec.ref),
          "warning",
          "ref",
        ),
        related: candidates.map((candidate) => ({
          message: candidate.id,
          uri: candidate.source.uri,
          range: candidate.source.idRange,
        })),
      });
    }
    const [candidate] = candidates;
    if (!candidate) {
      resolving.delete(definition);
      return undefined;
    }
    const target = resolve(candidate);
    if (!target || target.bitmap.spec.kind !== "bitmap") {
      resolving.delete(definition);
      return undefined;
    }
    if (
      spec.row >= target.bitmap.spec.rows ||
      spec.column >= target.bitmap.spec.columns
    ) {
      report(
        definition,
        issue(
          definition.source,
          "ref-out-of-bounds",
          Messages.src.config.image.parser.text0021(
            spec.row,
            spec.column,
            target.bitmap.spec.rows,
            target.bitmap.spec.columns,
          ),
          "error",
          "ref",
        ),
      );
    }
    const resolved = {
      bitmap: target.bitmap,
      row: spec.row,
      column: spec.column,
      chain: [definition, ...target.chain],
    } satisfies ResolvedImage;
    result.set(definition, resolved);
    resolving.delete(definition);
    return resolved;
  };
  for (const image of images) resolve(image);
  return result;
}

export async function buildImageIndex(
  candidates: readonly ImageCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  options: ImageBuildOptions,
): Promise<ImageBuildResult> {
  const issues = [...inheritedIssues];
  const images: ImageDefinition[] = [];
  for (const candidate of candidates) {
    const { source } = candidate;
    if (!isRecord(candidate.value)) continue;
    const id = makeIdentifier(candidate.rawId, source.pack.namespace);
    const [namespace, value] = splitIdentifier(id, source.pack.namespace);
    const localIssues: CoreIssue[] = [];
    for (const key of Object.keys(candidate.value)) {
      if (imageSchemaFieldForName(key)) continue;
      // 文件声明版本早于该键被删除的版本时, 当时合法的旧键不算未知字段
      if (legacyKeyAccepted(key, options.configVersion)) continue;
      localIssues.push(
        issue(
          source,
          "unknown-image-field",
          Messages.src.config.image.parser.text0023(key),
          "warning",
          key,
        ),
      );
    }
    const spec =
      typeof candidate.value.ref === "string"
        ? parseReference(candidate.value, source, localIssues)
        : await parseBitmap(
            candidate.value,
            source,
            namespace,
            options,
            localIssues,
          );
    if (source.pack.active || options.includeInactiveDiagnostics)
      issues.push(...localIssues);
    images.push({ id, namespace, value, source, raw: candidate.value, spec });
  }

  allocateCodepoints(images, options, issues);
  addCollisionIssues(images, issues);
  const resolved = resolveReferences(
    images,
    issues,
    options.includeInactiveDiagnostics ?? false,
  );
  return {
    images,
    resolved,
    issues,
  };
}
