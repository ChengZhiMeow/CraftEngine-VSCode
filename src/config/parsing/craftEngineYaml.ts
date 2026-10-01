import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type Node,
  type Pair,
  type ScalarTag,
  type CollectionTag,
  type YAMLMap,
} from "yaml";

import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  DEFAULT_MINECRAFT_VERSION,
  matchesMinecraftVersion,
} from "../../util/version.js";
import type { ParsedSection, ParsedYamlFile } from "../model.js";

import { Messages } from "../../messages.js";

function parseDecimalInteger(
  source: string,
  minimum: bigint,
  maximum: bigint,
): number {
  if (!/^[+-]?\d+$/u.test(source))
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0002(source),
    );
  const parsed = BigInt(source);
  if (parsed < minimum || parsed > maximum)
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0003(source),
    );
  return Number(parsed);
}

function parseJavaInt(source: string): bigint {
  let value = source;
  let sign = 1n;
  if (value.startsWith("-")) {
    sign = -1n;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (value.length === 0)
    throw new Error(Messages.src.config.parsing.craftEngineYaml.text0004);
  let radix = 10;
  if (value.startsWith("0x")) {
    radix = 16;
    value = value.slice(2);
  } else if (value.startsWith("0o")) {
    radix = 8;
    value = value.slice(2);
  }
  if (
    !(
      radix === 16 ? /^[0-9a-fA-F]+$/u : radix === 8 ? /^[0-7]+$/u : /^\d+$/u
    ).test(value)
  )
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0005(source),
    );
  return (
    sign *
    (radix === 16
      ? BigInt(`0x${value}`)
      : radix === 8
        ? BigInt(`0o${value}`)
        : BigInt(value))
  );
}

function parseJavaLong(source: string): number {
  if (source.length === 0)
    throw new Error(Messages.src.config.parsing.craftEngineYaml.text0006);
  let offset = 0;
  let negative = false;
  const first = source[0] ?? "";
  if (first < "0") {
    if (first === "-") {
      negative = true;
      offset = 1;
    } else if (first === "+") {
      offset = 1;
    } else {
    // 标点会直接结束数字读取, 这里要和 CE 保持一致
      return 0;
    }
  }
  let radix = 10;
  if (offset + 1 < source.length && source[offset] === "0") {
    const marker = source[offset + 1];
    if (marker === "x" || marker === "X") {
      radix = 16;
      offset += 2;
    } else if (marker === "o" || marker === "O") {
      radix = 8;
      offset += 2;
    }
  }
  const digits = source.slice(offset);
  if (
    !(
      radix === 16 ? /^[0-9a-fA-F]+$/u : radix === 8 ? /^[0-7]+$/u : /^\d+$/u
    ).test(digits)
  )
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0007(source),
    );
  const magnitude =
    radix === 16
      ? BigInt(`0x${digits}`)
      : radix === 8
        ? BigInt(`0o${digits}`)
        : BigInt(digits);
  // CE 先读取正数再加负号, 所以最小的 long 也不能用
  if (magnitude > 9_223_372_036_854_775_807n)
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0008(source),
    );
  return Number(negative ? -magnitude : magnitude);
}

function parseJavaDouble(source: string): number {
  const normalized = source.trim();
  if (
    normalized === ".inf" ||
    normalized === "Infinity" ||
    normalized === "+Infinity"
  )
    return Number.POSITIVE_INFINITY;
  if (normalized === "-.inf" || normalized === "-Infinity")
    return Number.NEGATIVE_INFINITY;
  if (normalized === ".nan" || /^[+-]?NaN$/u.test(normalized))
    return Number.NaN;
  if (normalized.length === 0)
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0009(source),
    );
  const withoutSuffix = /[fFdD]$/u.test(normalized)
    ? normalized.slice(0, -1)
    : normalized;
  const hexadecimal = withoutSuffix.match(
    /^([+-]?)0[xX]([0-9a-fA-F]+(?:\.[0-9a-fA-F]*)?|\.[0-9a-fA-F]+)[pP]([+-]?\d+)$/u,
  );
  if (hexadecimal) {
    const [whole = "", fraction = ""] = (hexadecimal[2] ?? "").split(".");
    let mantissa = whole.length > 0 ? Number.parseInt(whole, 16) : 0;
    for (let index = 0; index < fraction.length; index += 1) {
      mantissa +=
        Number.parseInt(fraction[index] ?? "0", 16) / 16 ** (index + 1);
    }
    return (
      (hexadecimal[1] === "-" ? -1 : 1) * mantissa * 2 ** Number(hexadecimal[3])
    );
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(withoutSuffix)) {
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0009(source),
    );
  }
  const parsed = Number(withoutSuffix);
  if (Number.isNaN(parsed))
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0009(source),
    );
  return parsed;
}

function parseJavaUuid(source: string): string {
  if (source.length > 36)
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0010(source),
    );
  const parts = source.split("-");
  if (
    parts.length !== 5 ||
    parts.some((part) => !/^\+?[0-9a-fA-F]+$/u.test(part))
  ) {
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0010(source),
    );
  }
  const values = parts.map((part) =>
    BigInt(`0x${part.startsWith("+") ? part.slice(1) : part}`),
  );
  if (values.some((value) => value > 9_223_372_036_854_775_807n))
    throw new Error(
      Messages.src.config.parsing.craftEngineYaml.text0010(source),
    );
  const widths = [8, 4, 4, 4, 12] as const;
  return values
    .map((value, index) => {
      const width = widths[index] ?? 0;
      return (value & ((1n << BigInt(width * 4)) - 1n))
        .toString(16)
        .padStart(width, "0");
    })
    .join("-");
}

function scalarTag(
  tag: string,
  parser: (source: string) => unknown,
): ScalarTag {
  return {
    tag: `tag:yaml.org,2002:${tag}`,
    resolve: (source, onError) => {
      try {
        return parser(source);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
        return source;
      }
    },
  };
}

function collectionTag(
  tag: string,
  parser: (source: string) => unknown,
): CollectionTag {
  return {
    tag: `tag:yaml.org,2002:${tag}`,
    collection: "seq",
    resolve: (value, onError) => {
      if (!isSeq(value)) {
        onError(Messages.src.config.parsing.craftEngineYaml.text0012(tag));
        return nodeToPlainValue(value);
      }
      const sequence = value;
      const result: unknown[] = [];
      for (let index = 0; index < sequence.items.length; index += 1) {
        const item = sequence.items[index];
        if (!isScalar(item)) {
          onError(
            Messages.src.config.parsing.craftEngineYaml.text0013(tag, index),
          );
          return sequence.items.map(nodeToPlainValue);
        }
        const source =
          item.source !== undefined ||
          typeof item.value === "string" ||
          typeof item.value === "number" ||
          typeof item.value === "boolean" ||
          typeof item.value === "bigint"
            ? String(item.source ?? item.value)
            : "";
        if (source.length === 0) {
          onError(
            Messages.src.config.parsing.craftEngineYaml.text0014(tag, index),
          );
          return sequence.items.map(nodeToPlainValue);
        }
        try {
          result.push(parser(source));
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
          return sequence.items.map(nodeToPlainValue);
        }
      }
      return result;
    },
  };
}

const customTags: Array<ScalarTag | CollectionTag> = [
  scalarTag("int", (source) => Number(parseJavaInt(source))),
  scalarTag("float", (source) => Math.fround(parseJavaDouble(source))),
  scalarTag("byte", (source) => parseDecimalInteger(source, -128n, 127n)),
  scalarTag("short", (source) =>
    parseDecimalInteger(source, -32_768n, 32_767n),
  ),
  scalarTag("long", parseJavaLong),
  scalarTag("double", parseJavaDouble),
  scalarTag("java.util.UUID", parseJavaUuid),
  collectionTag("ByteArray", (source) =>
    parseDecimalInteger(source, -128n, 127n),
  ),
  collectionTag("IntArray", (source) =>
    Number(BigInt.asIntN(32, parseJavaInt(source))),
  ),
  collectionTag("LongArray", parseJavaLong),
  collectionTag("DoubleArray", parseJavaDouble),
  collectionTag("IntList", (source) =>
    Number(BigInt.asIntN(32, parseJavaInt(source))),
  ),
  collectionTag("LongList", parseJavaLong),
  collectionTag("DoubleList", parseJavaDouble),
];

function unresolvedTagFailure(message: string): boolean {
  return (
    message.includes("Unresolved tag:") ||
    customTags.some((tag) => message.includes(tag.tag))
  );
}

// __proto__ 不是普通数据键: 直接赋值会改写原型或丢键, 必须建成自有属性
function setOwn(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (key !== "__proto__") {
    target[key] = value;
    return;
  }
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function nodeToPlainValue(value: unknown): unknown {
  if (isScalar(value)) {
    return value.value;
  }
  if (isSeq(value)) {
    return value.items.map(nodeToPlainValue);
  }
  if (isMap(value)) {
    const result: Record<string, unknown> = {};
    for (const pair of value.items) {
      setOwn(
        result,
        String(nodeToPlainValue(pair.key)),
        nodeToPlainValue(pair.value),
      );
    }
    return result;
  }
  return value;
}

function rangeOf(
  value: unknown,
  fallback: TextRange = { start: 0, end: 0 },
): TextRange {
  if (isNode(value) && value.range) {
    return { start: value.range[0], end: value.range[1] };
  }
  return fallback;
}

function valueFromNode(
  node: Node | null | undefined,
  document: Document,
): unknown {
  if (!node) return null;
  if (isMap(node)) {
    const result: Record<string, unknown> = {};
    for (const pair of node.items) {
      setOwn(
        result,
        scalarKey(pair.key),
        valueFromNode(pair.value as Node | null | undefined, document),
      );
    }
    return result;
  }
  if (isSeq(node))
    return node.items.map((item) =>
      valueFromNode(item as Node | null | undefined, document),
    );
  try {
    return node.toJS(document, { maxAliasCount: 10_000 });
  } catch {
    return nodeToPlainValue(node);
  }
}

function deepMerge(
  target: Record<string, unknown>,
  addition: Record<string, unknown>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(addition)) {
    const previous = target[key];
    if (isRecord(previous) && isRecord(value)) {
      setOwn(target, key, deepMerge({ ...previous }, value));
    } else {
      setOwn(target, key, value);
    }
  }
  return target;
}

function setDeepKey(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const path = key.split("::");
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const part = path[index];
    if (!part) {
      continue;
    }
    // __proto__ 走原型链读到的不是本层的容器, 必须按自有属性判断
    if (!Object.hasOwn(cursor, part) || !isRecord(cursor[part])) {
      setOwn(cursor, part, {});
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  const finalPart = path.at(-1);
  if (finalPart) {
    // 只有自有属性才算上一层留下的容器, __proto__ 继承到的是原型
    const previous = Object.hasOwn(cursor, finalPart)
      ? cursor[finalPart]
      : undefined;
    setOwn(
      cursor,
      finalPart,
      isRecord(previous) && isRecord(value)
        ? deepMerge({ ...previous }, value)
        : value,
    );
  }
}

function versionSpecification(key: string): string {
  return key.slice(2).split("#", 1)[0] ?? "";
}

export function normalizeCraftEngineValue(
  value: unknown,
  targetVersion = DEFAULT_MINECRAFT_VERSION,
): unknown {
  if (isUnknownArray(value)) {
    return value.map((item) => normalizeCraftEngineValue(item, targetVersion));
  }
  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value);
  // 只有版本选项时使用最后一个匹配项, 值为空时改用备用项
  if (
    entries.length > 0 &&
    entries.filter(([key]) => !key.startsWith("$$")).length === 0
  ) {
    let selected: unknown = null;
    let fallback: unknown = null;
    for (const [key, item] of entries) {
      if (versionSpecification(key) === "fallback") {
        fallback = normalizeCraftEngineValue(item, targetVersion);
      } else if (
        matchesMinecraftVersion(versionSpecification(key), targetVersion)
      ) {
        selected = normalizeCraftEngineValue(item, targetVersion);
      }
    }
    return selected ?? fallback;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (key.startsWith("$$")) {
      if (
        versionSpecification(key) === "fallback" ||
        !matchesMinecraftVersion(versionSpecification(key), targetVersion)
      )
        continue;
      const normalized = normalizeCraftEngineValue(item, targetVersion);
      if (isRecord(normalized)) deepMerge(result, normalized);
    } else {
      setDeepKey(result, key, normalizeCraftEngineValue(item, targetVersion));
    }
  }
  return result;
}

function scalarKey(value: unknown): string {
  if (isScalar(value)) {
    if (value.source !== undefined) return String(value.source);
    const scalar = value.value;
    return typeof scalar === "string" ||
      typeof scalar === "number" ||
      typeof scalar === "boolean"
      ? String(scalar)
      : "";
  }
  return String(nodeToPlainValue(value));
}

function collectRanges(
  node: unknown,
  prefix: string,
  keys: Map<string, TextRange>,
  values: Map<string, TextRange>,
  targetVersion: string,
  yamlExtensions: boolean,
): void {
  if (isAlias(node)) {
    return;
  }
  if (isMap(node)) {
    const entries = node.items.map((pair) => ({
      pair,
      key: scalarKey(pair.key),
    }));
    if (!yamlExtensions) {
      for (const { pair, key } of entries) {
        const path = [...(prefix ? [prefix] : []), key].join(".");
        if (!path) continue;
        keys.set(path, rangeOf(pair.key));
        values.set(path, rangeOf(pair.value, rangeOf(pair.key)));
        collectRanges(pair.value, path, keys, values, targetVersion, false);
      }
      return;
    }
    if (
      entries.length > 0 &&
      entries.filter(({ key }) => !key.startsWith("$$")).length === 0
    ) {
      let selected: { pair: Pair; key: string } | undefined;
      let fallback: { pair: Pair; key: string } | undefined;
      for (const selector of entries.filter(({ key }) =>
        key.startsWith("$$"),
      )) {
        if (versionSpecification(selector.key) === "fallback")
          fallback = selector;
        else if (
          matchesMinecraftVersion(
            versionSpecification(selector.key),
            targetVersion,
          )
        )
          selected = selector;
      }
      if (
        selected &&
        isScalar(selected.pair.value) &&
        selected.pair.value.value === null
      )
        selected = undefined;
      selected ??= fallback;
      if (!selected) return;
      if (prefix) values.set(prefix, rangeOf(selected.pair.value));
      collectRanges(
        selected.pair.value,
        prefix,
        keys,
        values,
        targetVersion,
        true,
      );
      return;
    }
    for (const { pair, key } of entries) {
      if (key.startsWith("$$")) {
        if (
          versionSpecification(key) !== "fallback" &&
          matchesMinecraftVersion(versionSpecification(key), targetVersion)
        ) {
          collectRanges(pair.value, prefix, keys, values, targetVersion, true);
        }
        continue;
      }
      const path = [
        ...(prefix ? [prefix] : []),
        ...key.split("::").filter(Boolean),
      ].join(".");
      if (!path) continue;
      keys.set(path, rangeOf(pair.key));
      values.set(path, rangeOf(pair.value, rangeOf(pair.key)));
      collectRanges(pair.value, path, keys, values, targetVersion, true);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      const path = `${prefix}.${index}`;
      values.set(path, rangeOf(item));
      collectRanges(item, path, keys, values, targetVersion, yamlExtensions);
    });
  }
}

function sectionFromPair(
  pair: Pair,
  document: Document,
  targetVersion: string,
  yamlExtensions: boolean,
): ParsedSection | undefined {
  const key = scalarKey(pair.key);
  if (!key || (yamlExtensions && key.startsWith("$$"))) {
    return undefined;
  }
  const rawValue = valueFromNode(
    pair.value as Node | null | undefined,
    document,
  );
  const keys = new Map<string, TextRange>();
  const values = new Map<string, TextRange>();
  collectRanges(pair.value, "", keys, values, targetVersion, yamlExtensions);
  const sectionValue = yamlExtensions
    ? normalizeCraftEngineValue(rawValue, targetVersion)
    : rawValue;
  return {
    key,
    type: key.split("#", 1)[0] ?? key,
    value: sectionValue,
    keyRange: rangeOf(pair.key),
    valueRange: rangeOf(pair.value, rangeOf(pair.key)),
    ranges: { keys, values },
  };
}

function collectSelectedRootSections(
  map: YAMLMap,
  document: Document,
  targetVersion: string,
  sections: ParsedSection[],
  yamlExtensions: boolean,
): void {
  if (!yamlExtensions) {
    for (const pair of map.items) {
      const section = sectionFromPair(pair, document, targetVersion, false);
      if (section) appendSection(sections, section);
    }
    return;
  }

  const entries = map.items.map((pair) => ({ pair, key: scalarKey(pair.key) }));
  if (entries.length > 0 && entries.every(({ key }) => key.startsWith("$$"))) {
    let selected: Pair | undefined;
    let fallback: Pair | undefined;
    for (const { pair, key } of entries) {
      if (versionSpecification(key) === "fallback") fallback = pair;
      else if (
        matchesMinecraftVersion(versionSpecification(key), targetVersion)
      )
        selected = pair;
    }
    if (selected && isScalar(selected.value) && selected.value.value === null)
      selected = undefined;
    const branch = selected ?? fallback;
    if (branch && isMap(branch.value)) {
      collectSelectedRootSections(
        branch.value,
        document,
        targetVersion,
        sections,
        true,
      );
    }
    return;
  }

  for (const pair of map.items) {
    const key = scalarKey(pair.key);
    if (!key.startsWith("$$")) {
      const section = sectionFromPair(pair, document, targetVersion, true);
      if (section) {
        appendSection(sections, section);
      }
      continue;
    }
    if (versionSpecification(key) === "fallback") continue;
    if (
      matchesMinecraftVersion(versionSpecification(key), targetVersion) &&
      isMap(pair.value)
    ) {
      collectSelectedRootSections(
        pair.value,
        document,
        targetVersion,
        sections,
        true,
      );
    }
  }
}

function appendSection(
  sections: ParsedSection[],
  section: ParsedSection,
): void {
  const index = sections.findIndex((existing) => existing.key === section.key);
  if (index < 0) {
    sections.push(section);
    return;
  }
  const existing = sections[index];
  if (!existing) return;
  const keys = new Map(existing.ranges.keys);
  const values = new Map(existing.ranges.values);
  for (const [path, range] of section.ranges.keys) keys.set(path, range);
  for (const [path, range] of section.ranges.values) values.set(path, range);
  sections[index] = {
    ...existing,
    value:
      isRecord(existing.value) && isRecord(section.value)
        ? deepMerge({ ...existing.value }, section.value)
        : section.value,
    ranges: { keys, values },
  };
}

function issueFromYamlError(
  uri: string,
  error: { message: string; pos?: readonly number[] },
  warning: boolean,
): CoreIssue {
  const start = error.pos?.[0] ?? 0;
  return {
    code: warning ? "yaml-warning" : "yaml-error",
    message: error.message,
    severity: warning ? "warning" : "error",
    uri,
    range: { start, end: error.pos?.[1] ?? start + 1 },
  };
}

export function parseCraftEngineYaml(
  uri: string,
  text: string,
  targetVersion = DEFAULT_MINECRAFT_VERSION,
): ParsedYamlFile {
  const document = parseDocument(text, {
    customTags,
    keepSourceTokens: true,
    merge: false,
    prettyErrors: false,
    uniqueKeys: false,
  });
  const issues: CoreIssue[] = [
    ...document.errors.map((error) => issueFromYamlError(uri, error, false)),
    ...document.warnings
      .filter(
        (warning) =>
          !warning.message.includes(
            "Keys with collection values will be stringified",
          ),
      )
      .map((warning) =>
        issueFromYamlError(
          uri,
          warning,
          !unresolvedTagFailure(warning.message),
        ),
      ),
  ];
  const sections: ParsedSection[] = [];
  if (isMap(document.contents)) {
    collectSelectedRootSections(
      document.contents,
      document,
      targetVersion,
      sections,
      !/\.json(?:$|[?#])/iu.test(uri),
    );
  } else if (document.contents !== null) {
    issues.push({
      code: "yaml-root-map",
      message: Messages.src.config.parsing.craftEngineYaml.text0001,
      severity: "error",
      uri,
      range: rangeOf(document.contents),
    });
  }
  return { uri, text, sections, issues };
}

export function parseCraftEngineYamlValue(
  text: string,
  targetVersion = DEFAULT_MINECRAFT_VERSION,
): unknown {
  const document = parseDocument(text, {
    customTags,
    keepSourceTokens: true,
    merge: false,
    prettyErrors: false,
    uniqueKeys: false,
  });
  const fatalWarning = document.warnings.find((warning) =>
    unresolvedTagFailure(warning.message),
  );
  if (document.errors.length > 0 || fatalWarning) {
    throw new Error(
      document.errors[0]?.message ??
        fatalWarning?.message ??
        Messages.src.config.parsing.craftEngineYaml.text0011,
    );
  }
  return normalizeCraftEngineValue(
    document.contents ? valueFromNode(document.contents, document) : null,
    targetVersion,
  );
}

export function parseLooseScalar(source: string): unknown {
  const text = source.trim();
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[bBsSlLdDfF]?$/u.test(text)
  ) {
    return Number(text.replace(/[bBsSlLdDfF]$/u, ""));
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    try {
      return parseDocument(text, { customTags, prettyErrors: false }).toJS({
        maxAliasCount: 10,
      });
    } catch {
      return text.slice(1, -1);
    }
  }
  return text;
}
