import { pathToFileURL } from "node:url";

import {
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";

import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import type { VanillaSoundCatalog } from "../../minecraft/catalog.js";
import {
  readResourceText,
  resourceCandidates,
} from "../../resources/catalog.js";
import type {
  ResourceFile,
  ResourceFileCatalog,
} from "../../resources/model.js";
import { groupBy } from "../../util/collections.js";
import {
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { evaluateExpression } from "../expression/evaluator.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import {
  NUMBER_PROVIDER_TYPES,
  validateNumberProviderValue,
} from "../number-provider/schema.js";
import type {
  SoundDataReference,
  SoundEventDefinition,
  SoundEventEntry,
  SoundIndexResult,
} from "./model.js";
import { Messages } from "../../messages.js";
import { collectSoundReferences } from "./references.js";

export { NUMBER_PROVIDER_TYPES };

function rangeFor(
  source: ConfigurationSource,
  pathName?: string,
  key = false,
): TextRange {
  if (pathName) {
    const range = key
      ? source.fieldKeyRanges.get(pathName)
      : source.fieldValueRanges.get(pathName);
    if (range) return range;
    const alternate = key
      ? source.fieldValueRanges.get(pathName)
      : source.fieldKeyRanges.get(pathName);
    if (alternate) return alternate;
  }
  return source.idRange;
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  pathName?: string,
  key = false,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: rangeFor(source, pathName, key),
  };
}

function normalizeEventOrFileId(value: string): string {
  // 没写命名空间的声音 ID 要补 minecraft, 这样查找结果才和资源包一致
  return makeIdentifier(value.replace(/\.ogg$/iu, ""), "minecraft");
}

  // CE 的 getAsInt: 字符串可以先删下划线再解析, 失败后按表达式求值, 没有下限
function configInt(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const literal = Number(value.trim().replaceAll("_", ""));
  if (!Number.isNaN(literal)) return Math.trunc(literal);
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" && Number.isFinite(evaluated)
      ? Math.trunc(evaluated)
      : undefined;
  } catch {
    return undefined;
  }
}

// Java 的 Float.parseFloat 认这些写法, 也允许 f/F/d/D 后缀与 Infinity/NaN
const JAVA_FLOAT_LITERAL =
  /^[+-]?(?:Infinity|NaN|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?)$/u;

// CE 的 getFloat: 数字直接转 float, 字符串先删下划线再按 Java 浮点写法读,
// 失败后按 CraftEngine 表达式求值(ConfigValue.java:159-179)
function configFloat(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const normalized = value.trim().replaceAll("_", "");
  if (JAVA_FLOAT_LITERAL.test(normalized))
    return Number(
      /[fFdD]$/u.test(normalized) ? normalized.slice(0, -1) : normalized,
    );
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" ? evaluated : undefined;
  } catch {
    return undefined;
  }
}

function validateNumberProvider(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  label: string,
  issues: CoreIssue[],
  exactRange?: TextRange,
): void {
  for (const problem of validateNumberProviderValue(value)) {
    const problemPath = problem.path.reduce(
      (result, segment) => (result ? `${result}.${segment}` : segment),
      pathName,
    );
    let code: string;
    switch (problem.code) {
      case "unknown-type":
        code = "unknown-number-provider-type";
        break;
      case "missing-field":
      case "missing-type":
        code = "missing-number-provider-field";
        break;
      default:
        code =
          problem.severity === "warning"
            ? "unsafe-sound-number-provider"
            : "invalid-sound-number-provider";
        break;
    }
    const diagnostic = issue(
      source,
      code,
      `${label}: ${problem.message}`,
      problem.severity,
      problemPath,
    );
    issues.push(
      exactRange === undefined
        ? diagnostic
        : { ...diagnostic, range: exactRange },
    );
  }
}

function parseEntry(
  raw: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): SoundEventEntry | undefined {
  if (typeof raw === "string") {
    return {
      name: normalizeEventOrFileId(raw),
      type: "file",
      volume: 1,
      pitch: 1,
      weight: 1,
      stream: false,
      attenuationDistance: 16,
      preload: false,
      nameRange: rangeFor(source, pathName),
    };
  }
  if (!isRecord(raw)) {
    issues.push(
      issue(
        source,
        "invalid-sound-entry",
        Messages.src.config.sound.parser.text0001(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  for (const key of Object.keys(raw)) {
    switch (key) {
      case "name":
      case "volume":
      case "pitch":
      case "weight":
      case "stream":
      case "attenuation_distance":
      case "attenuation-distance":
      case "preload":
      case "type":
        break;
      default:
        issues.push(
          issue(
            source,
            "unknown-sound-entry-field",
            Messages.src.config.sound.parser.text0002(key),
            "warning",
            `${pathName}.${key}`,
            true,
          ),
        );
    }
  }
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    issues.push(
      issue(
        source,
        "missing-sound-entry-name",
        Messages.src.config.sound.parser.text0003(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  // SoundFile 类型不带命名空间, 只判断 file 或 event, 大小写不限
  let type = "file";
  if (raw.type !== undefined)
    type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  if (type !== "file" && type !== "event") {
    issues.push(
      issue(
        source,
        "invalid-sound-entry-type",
        Messages.src.config.sound.parser.text0004(pathName),
        "error",
        `${pathName}.type`,
      ),
    );
  }
  for (const key of ["volume", "pitch"] as const) {
    // CE 的 volume/pitch 走 getFloat(Sound.java:57-58), 只接受数字标量与 CraftEngine 表达式;
    // a~b 区间是 SoundData 的语义(SoundData.java:47-59), 声音文件写区间会抛 PARSE_FLOAT_FAILED
    if (raw[key] === undefined || configFloat(raw[key]) !== undefined) continue;
    issues.push(
      issue(
        source,
        "invalid-sound-scalar",
        `声音文件 ${pathName}.${key} 必须是数字或 CraftEngine 表达式`,
        "error",
        `${pathName}.${key}`,
      ),
    );
  }
  // CE 的 weight 走 getInt, 字符串数字与表达式都合法, 也没有正数限制
  const weight = raw.weight === undefined ? 1 : configInt(raw.weight);
  if (raw.weight !== undefined && weight === undefined)
    issues.push(
      issue(
        source,
        "invalid-sound-weight",
        `${pathName}.weight 必须是整数或整数表达式`,
        "error",
        `${pathName}.weight`,
      ),
    );
  for (const key of ["stream", "preload"] as const)
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") {
      issues.push(
        issue(
          source,
          "invalid-sound-boolean",
          Messages.src.config.sound.parser.text0008(pathName, key),
          "error",
          `${pathName}.${key}`,
        ),
      );
    }
  const attenuation = raw.attenuation_distance ?? raw["attenuation-distance"];
  const attenuationDistance =
    attenuation === undefined ? 16 : configInt(attenuation);
  if (attenuation !== undefined && attenuationDistance === undefined) {
    issues.push(
      issue(
        source,
        "invalid-sound-attenuation",
        `${pathName}.attenuation_distance 必须是整数或整数表达式`,
        "error",
        `${pathName}.${Object.hasOwn(raw, "attenuation_distance") ? "attenuation_distance" : "attenuation-distance"}`,
      ),
    );
  }
  return {
    name: normalizeEventOrFileId(raw.name),
    type: type === "event" ? "event" : "file",
    volume: raw.volume ?? 1,
    pitch: raw.pitch ?? 1,
    weight: weight ?? 1,
    stream: raw.stream === true,
    attenuationDistance: attenuationDistance ?? 16,
    preload: raw.preload === true,
    nameRange: rangeFor(source, `${pathName}.name`),
  };
}

function parseEvent(
  rawId: string,
  rawValue: unknown,
  source: ConfigurationSource,
  origin: SoundEventDefinition["origin"],
  issues: CoreIssue[],
): SoundEventDefinition | undefined {
  const id = makeIdentifier(rawId, source.pack.namespace);
  if (!isRecord(rawValue)) {
    issues.push(
      issue(
        source,
        "invalid-sound-event",
        Messages.src.config.sound.parser.text0011(id),
        "error",
      ),
    );
    return undefined;
  }
  for (const key of Object.keys(rawValue)) {
    switch (key) {
      // CE 的 IdSectionConfigParser 统一处理 enable/debug
      case "enable":
      case "debug":
      case "replace":
      case "subtitle":
      case "sounds":
      case "sound":
      case "template":
      case "templates":
      case "arguments":
      case "overrides":
      case "merges":
        break;
      default:
        issues.push(
          issue(
            source,
            "unknown-sound-event-field",
            Messages.src.config.sound.parser.text0012(key),
            "warning",
            key,
            true,
          ),
        );
    }
  }
  if (rawValue.replace !== undefined && typeof rawValue.replace !== "boolean") {
    issues.push(
      issue(
        source,
        "invalid-sound-replace",
        Messages.src.config.sound.parser.text0013,
        "error",
        "replace",
      ),
    );
  }
  if (
    rawValue.subtitle !== undefined &&
    typeof rawValue.subtitle !== "string"
  ) {
    issues.push(
      issue(
        source,
        "invalid-sound-subtitle",
        Messages.src.config.sound.parser.text0014,
        "error",
        "subtitle",
      ),
    );
  }
  if (rawValue.sounds !== undefined && rawValue.sound !== undefined) {
    issues.push(
      issue(
        source,
        "duplicate-sound-list-alias",
        Messages.src.config.sound.parser.text0015,
        "warning",
        "sound",
        true,
      ),
    );
  }
  let selectedKey: "sounds" | "sound" = "sounds";
  if (rawValue.sounds === undefined && rawValue.sound !== undefined)
    selectedKey = "sound";
  const selected = rawValue[selectedKey];
  if (selected === undefined) {
    issues.push(
      issue(
        source,
        "missing-sound-list",
        Messages.src.config.sound.parser.text0016(id),
        "error",
      ),
    );
  }
  let rawEntries: readonly unknown[] = [];
  if (selected !== undefined)
    rawEntries = isUnknownArray(selected) ? selected : [selected];
  const [namespace, value] = splitIdentifier(id, source.pack.namespace);
  const entries = rawEntries
    .map((entry, index) =>
      parseEntry(
        entry,
        source,
        isUnknownArray(selected) ? `${selectedKey}.${index}` : selectedKey,
        issues,
      ),
    )
    .filter((entry): entry is SoundEventEntry => entry !== undefined);
  return {
    kind: "sound-event",
    id,
    namespace,
    value,
    source,
    origin,
    replace: rawValue.replace === true,
    ...(typeof rawValue.subtitle === "string"
      ? { subtitle: rawValue.subtitle }
      : {}),
    entries,
  };
}

function jsonRange(node: JsonNode | undefined, trimQuotes = false): TextRange {
  if (!node) return { start: 0, end: 1 };
  const trim = trimQuotes && node.type === "string" ? 1 : 0;
  return { start: node.offset + trim, end: node.offset + node.length - trim };
}

function collectJsonRanges(
  node: JsonNode,
  prefix: string,
  keys: Map<string, TextRange>,
  values: Map<string, TextRange>,
): void {
  switch (node.type) {
    case "object":
      for (const property of node.children ?? []) {
        const keyNode = property.children?.[0];
        const valueNode = property.children?.[1];
        const key: unknown = keyNode ? getNodeValue(keyNode) : undefined;
        if (typeof key !== "string" || !valueNode) continue;
        const pathName = prefix ? `${prefix}.${key}` : key;
        keys.set(pathName, jsonRange(keyNode, true));
        values.set(pathName, jsonRange(valueNode));
        collectJsonRanges(valueNode, pathName, keys, values);
      }
      return;
    case "array":
      (node.children ?? []).forEach((child, index) => {
        const pathName = prefix ? `${prefix}.${index}` : String(index);
        values.set(pathName, jsonRange(child));
        collectJsonRanges(child, pathName, keys, values);
      });
      return;
  }
}

async function eventsFromSoundsJson(
  file: ResourceFile,
  issues: CoreIssue[],
): Promise<SoundEventDefinition[]> {
  const uri = pathToFileURL(file.path).toString();
  const text = await readResourceText(file);
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, {
    allowTrailingComma: false,
    disallowComments: true,
  });

  if (!root || errors.length > 0) {
    for (const error of errors.length > 0
      ? errors
      : [{ error: 1, offset: 0, length: 1 }]) {
      issues.push({
        code: "invalid-sounds-json",
        message: Messages.src.config.sound.parser.text0017(
          printParseErrorCode(error.error),
        ),
        severity: "error",
        uri,
        range: {
          start: error.offset,
          end: error.offset + Math.max(1, error.length),
        },
      });
    }
    return [];
  }
  if (root.type !== "object") {
    issues.push({
      code: "invalid-sounds-json-root",
      message: Messages.src.config.sound.parser.text0018,
      severity: "error",
      uri,
      range: jsonRange(root),
    });
    return [];
  }

  const result: SoundEventDefinition[] = [];
  for (const property of root.children ?? []) {
    const keyNode = property.children?.[0];
    const valueNode = property.children?.[1];
    const rawId: unknown = keyNode ? getNodeValue(keyNode) : undefined;
    if (typeof rawId !== "string" || !valueNode) continue;
    const fieldKeyRanges = new Map<string, TextRange>();
    const fieldValueRanges = new Map<string, TextRange>();
    collectJsonRanges(valueNode, "", fieldKeyRanges, fieldValueRanges);

    const source: ConfigurationSource = {
      uri,
      idRange: jsonRange(keyNode, true),
      entryRange: jsonRange(valueNode),
      fieldKeyRanges,
      fieldValueRanges,
      pack: file.pack,
      kind: "direct",
      sectionKey: Messages.common.soundsJson,
    };

    const parsed = parseEvent(
      rawId,
      getNodeValue(valueNode) as unknown,
      source,
      "resourcepack-json",
      issues,
    );
    if (parsed) result.push(parsed);
  }
  return result;
}

function conflictIssues(events: readonly SoundEventDefinition[]): CoreIssue[] {
  const grouped = groupBy(
    events.filter((event) => event.source.pack.active),
    (event) => `${canonicalPath(event.source.pack.resourcesRoot)}\0${event.id}`,
  );
  const issues: CoreIssue[] = [];
  for (const definitions of grouped.values()) {
    if (definitions.length < 2) continue;
    for (const definition of definitions) {
      issues.push({
        ...issue(
          definition.source,
          "duplicate-sound-event-override",
          Messages.src.config.sound.parser.text0019(definition.id),
          "warning",
        ),
        related: definitions
          .filter((other) => other !== definition)
          .map((other) => ({
            message: `${other.source.pack.name} · ${other.origin === "resourcepack-json" ? Messages.common.soundsJson : Messages.common.diagnosticSource}`,
            uri: other.source.uri,
            range: other.source.idRange,
          })),
      });
    }
  }
  return issues;
}

function referenceIssues(
  events: readonly SoundEventDefinition[],
  resources: ResourceFileCatalog,
  vanilla: VanillaSoundCatalog,
): CoreIssue[] {
  const issues: CoreIssue[] = [];
  const roots = new Set(
    events.map((event) => canonicalPath(event.source.pack.resourcesRoot)),
  );
  for (const root of roots) {
    const rootEvents = events.filter(
      (event) =>
        canonicalPath(event.source.pack.resourcesRoot) === root &&
        event.source.pack.active,
    );
    const knownEvents = new Set([
      ...vanilla.eventIds,
      ...rootEvents.map((event) => event.id),
    ]);
    const edges = new Map<
      string,
      Array<{
        target: string;
        definition: SoundEventDefinition;
        entry: SoundEventEntry;
      }>
    >();
    for (const definition of rootEvents)
      for (const entry of definition.entries) {
        if (entry.type === "file") {
          const hasWorkspace = resourceCandidates(
            resources,
            definition.source.pack.resourcesRoot,
            "sound-file",
            entry.name,
          ).some((file) => file.active);
          const hasVanilla = vanilla.files.has(entry.name);
          if (!hasWorkspace && !hasVanilla) {
            issues.push({
              code: "missing-sound-file",
              message: Messages.src.config.sound.parser.text0020(
                definition.id,
                entry.name,
              ),
              severity: "error",
              uri: definition.source.uri,
              range: entry.nameRange,
            });
          }
          continue;
        }

        if (!knownEvents.has(entry.name)) {
          issues.push({
            code: "missing-sound-event",
            message: Messages.src.config.sound.parser.text0021(
              definition.id,
              entry.name,
            ),
            severity: "error",
            uri: definition.source.uri,
            range: entry.nameRange,
          });
        }
        const values = edges.get(definition.id) ?? [];
        values.push({ target: entry.name, definition, entry });
        edges.set(definition.id, values);
      }

    const visiting: string[] = [];
    const visited = new Set<string>();
    const emitted = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      const existing = visiting.indexOf(id);
      if (existing >= 0) return;
      visiting.push(id);
      for (const edge of edges.get(id) ?? []) {
        const cycle = visiting.indexOf(edge.target);
        if (cycle < 0) {
          visit(edge.target);
          continue;
        }

        const chain = [...visiting.slice(cycle), edge.target];
        const key = chain.join("→");
        if (emitted.has(key)) continue;
        emitted.add(key);
        issues.push({
          code: "sound-event-cycle",
          message: Messages.src.config.sound.parser.text0022(chain.join(" → ")),
          severity: "error",
          uri: edge.definition.source.uri,
          range: edge.entry.nameRange,
        });
      }
      visiting.pop();
      visited.add(id);
    };
    for (const id of edges.keys()) visit(id);
  }
  return issues;
}

function validateSoundDataReferences(
  references: readonly SoundDataReference[],
  knownEvents: ReadonlySet<string>,
): CoreIssue[] {
  const issues: CoreIssue[] = [];
  for (const reference of references) {
    if (!knownEvents.has(reference.eventId)) {
      issues.push({
        code: "missing-sound-event",
        message: Messages.src.config.sound.parser.text0023(reference.eventId),
        severity: "error",
        uri: reference.source.uri,
        range: reference.idRange,
      });
    }
    validateNumberProvider(
      reference.volume,
      reference.source,
      "",
      Messages.src.config.sound.parser.text0024,
      issues,
      reference.volumeRange,
    );
    validateNumberProvider(
      reference.pitch,
      reference.source,
      "",
      Messages.src.config.sound.parser.text0025,
      issues,
      reference.pitchRange,
    );
  }
  return issues;
}

export async function buildSoundIndex(
  configurations: readonly ConfigurationCandidateInput[],
  resources: ResourceFileCatalog,
  vanilla: VanillaSoundCatalog,
  includeInactiveDiagnostics: boolean,
): Promise<SoundIndexResult> {
  const issues: CoreIssue[] = [];
  const yamlEvents = configurations.flatMap((candidate) => {
    if (candidate.kind !== "sound-event") return [];
    const parsed = parseEvent(
      candidate.rawId,
      candidate.value,
      candidate.source,
      "craftengine-yaml",
      issues,
    );
    return parsed ? [parsed] : [];
  });
  const jsonEvents = (
    await Promise.all(
      (resources.byKind.get("sounds-json") ?? []).map((file) =>
        eventsFromSoundsJson(file, issues),
      ),
    )
  ).flat();
  const events = [...yamlEvents, ...jsonEvents];
  const references = configurations.flatMap(collectSoundReferences);

  issues.push(
    ...conflictIssues(events),
    ...referenceIssues(events, resources, vanilla),
  );
  const known = new Set([
    ...vanilla.eventIds,
    ...events
      .filter((event) => event.source.pack.active)
      .map((event) => event.id),
  ]);
  issues.push(...validateSoundDataReferences(references, known));

  const activeUris = new Set(
    configurations
      .filter((candidate) => candidate.source.pack.active)
      .map((candidate) => candidate.source.uri),
  );
  for (const file of resources.byKind.get("sounds-json") ?? [])
    if (file.active) {
      activeUris.add(pathToFileURL(file.path).toString());
    }
  for (const event of events)
    if (event.source.pack.active) activeUris.add(event.source.uri);

  return {
    events,
    references,
    issues: issues.filter(
      (entry) => includeInactiveDiagnostics || activeUris.has(entry.uri),
    ),
  };
}
