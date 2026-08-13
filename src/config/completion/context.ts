import type { ParsedSection } from "../model.js";

export type ImageCompletionLevel =
  | "image-field"
  | "template-argument"
  | "other";

export interface ImageCompletionContext {
  readonly level: ImageCompletionLevel;
  readonly imageId?: string;
  readonly fieldName?: string;
  readonly existingKeys: ReadonlySet<string>;
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly propertyPosition: boolean;
}

export interface YamlCompletionContext {
  readonly sectionType?: string;
  readonly entryId?: string;
  readonly path: readonly string[];
  readonly fieldName?: string;
  readonly existingKeys: ReadonlySet<string>;
  readonly siblingValues: ReadonlyMap<string, string>;
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly propertyPosition: boolean;
}

interface SourceLine {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly indent: number;
  readonly key?: string;
  readonly colon?: number;
}

function mappingColon(text: string): number | undefined {
  let single = false;
  let double = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "'" && !double) {
      if (single && text[index + 1] === "'") {
        index += 1;
        continue;
      }
      single = !single;
      continue;
    }
    if (character === '"' && !single && text[index - 1] !== "\\") {
      double = !double;
      continue;
    }
    if (
      character === "#" &&
      !single &&
      !double &&
      (index === 0 || /\s/u.test(text[index - 1] ?? ""))
    )
      break;
    if (
      character === ":" &&
      !single &&
      !double &&
      (index + 1 === text.length || /\s/u.test(text[index + 1] ?? ""))
    )
      return index;
  }
  return undefined;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let index = 0;
  while (start <= text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    const raw = text.slice(start, end).replace(/\r$/u, "");
    const rawIndent = raw.match(/^\s*/u)?.[0].length ?? 0;
    const colon = mappingColon(raw);
    let indent = rawIndent;
    let rawKey = colon === undefined ? undefined : raw.slice(indent, colon);
    if (rawKey?.startsWith("- ")) {
      rawKey = rawKey.slice(2);
      indent += 2;
    } else if (colon === undefined && raw.slice(rawIndent).startsWith("- ")) {
      indent += 2;
    }
    const key =
      rawKey === undefined || rawKey.trim() === ""
        ? undefined
        : unquote(rawKey);
    lines.push({
      index,
      start,
      end,
      text: raw,
      indent,
      ...(key === undefined ? {} : { key }),
      ...(colon === undefined ? {} : { colon }),
    });
    if (newline < 0) break;
    start = newline + 1;
    index += 1;
  }
  return lines;
}

function lineAt(lines: readonly SourceLine[], offset: number): SourceLine {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && offset >= line.start) return line;
  }
  return lines[0] ?? { index: 0, start: 0, end: 0, text: "", indent: 0 };
}

function parentOf(
  lines: readonly SourceLine[],
  from: SourceLine,
  indentation: number,
): SourceLine | undefined {
  for (let index = from.index - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (
      !line ||
      line.text.trim() === "" ||
      line.text.trimStart().startsWith("#")
    )
      continue;
    if (line.indent < indentation && line.key !== undefined) return line;
  }
  return undefined;
}

function directKeys(
  lines: readonly SourceLine[],
  parent: SourceLine,
  current: SourceLine,
  childIndent: number,
): ReadonlySet<string> {
  const result = new Set<string>();
  let start = parent.index + 1;
  for (let index = parent.index + 1; index <= current.index; index += 1) {
    const line = lines[index];
    if (line?.indent === childIndent && /^\s*-\s+/u.test(line.text))
      start = index;
  }
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      !line ||
      line.text.trim() === "" ||
      line.text.trimStart().startsWith("#")
    )
      continue;
    if (line.indent <= parent.indent) break;
    if (
      (start > parent.index + 1 ||
        /^\s*-\s+/u.test(lines[start]?.text ?? "")) &&
      index > start &&
      line.indent === childIndent &&
      /^\s*-\s+/u.test(line.text)
    )
      break;
    if (line.indent === childIndent && line.key !== undefined)
      result.add(line.key);
  }
  return result;
}

function siblingValues(
  lines: readonly SourceLine[],
  current: SourceLine,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  let start = current.index;
  for (let index = current.index; index >= 0; index -= 1) {
    const line = lines[index];
    if (
      !line ||
      line.text.trim() === "" ||
      line.text.trimStart().startsWith("#")
    )
      continue;
    if (line.indent < current.indent) break;
    if (
      line.indent === current.indent &&
      /^\s*-\s+/u.test(line.text) &&
      index !== current.index
    ) {
      start = index;
      break;
    }
    start = index;
  }
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      !line ||
      line.text.trim() === "" ||
      line.text.trimStart().startsWith("#")
    )
      continue;
    if (line.indent < current.indent) break;
    if (
      index > start &&
      line.indent === current.indent &&
      /^\s*-\s+/u.test(line.text)
    )
      break;
    if (
      line.indent !== current.indent ||
      !line.key ||
      line.colon === undefined
    )
      continue;
    const value = line.text
      .slice(line.colon + 1)
      .replace(/\s+#.*$/u, "")
      .trim();
    if (value !== "") result.set(line.key, unquote(value));
  }
  // 先保留原本带下划线的键, 否则连字符写法会把它覆盖
  for (const [key, value] of [...result]) {
    const normalized = key.replaceAll("-", "_");
    if (normalized !== key && !result.has(normalized))
      result.set(normalized, value);
  }
  return result;
}

function flowSequenceScalarReplacement(
  line: SourceLine,
  cursor: number,
  valueStart: number,
): { start: number; end: number } | undefined {
  const cursorInLine = cursor - line.start;
  const valueStartInLine = valueStart - line.start;
  if (line.text[valueStartInLine] !== "[") return undefined;
  let depth = 0;
  let single = false;
  let double = false;
  let itemStart = valueStartInLine;
  for (let index = valueStartInLine; index < cursorInLine; index += 1) {
    const character = line.text[index];
    if (character === "'" && !double) {
      if (single && line.text[index + 1] === "'") {
        index += 1;
        continue;
      }
      single = !single;
      continue;
    }
    if (character === '"' && !single && line.text[index - 1] !== "\\") {
      double = !double;
      continue;
    }
    if (single || double) continue;
    if (character === "[") {
      depth += 1;
      itemStart = index + 1;
    } else if (character === "]") {
      depth -= 1;
    } else if (character === "," && depth > 0) {
      itemStart = index + 1;
    }
  }
  if (depth <= 0) return undefined;
  while (/\s/u.test(line.text[itemStart] ?? "")) itemStart += 1;
  const quote =
    line.text[itemStart] === '"' || line.text[itemStart] === "'"
      ? line.text[itemStart]
      : undefined;
  const scalarStart = quote ? itemStart + 1 : itemStart;
  let scalarEnd = scalarStart;
  while (scalarEnd < line.text.length) {
    const character = line.text[scalarEnd];
    if (quote) {
      if (
        character === quote &&
        (quote === "'" || line.text[scalarEnd - 1] !== "\\")
      )
        break;
    } else if (
      character === "," ||
      character === "]" ||
      /\s|#/u.test(character ?? "")
    ) {
      break;
    }
    scalarEnd += 1;
  }
  if (cursorInLine < scalarStart || cursorInLine > scalarEnd) return undefined;
  return { start: line.start + scalarStart, end: line.start + scalarEnd };
}

function replacement(
  line: SourceLine,
  offset: number,
): { start: number; end: number; property: boolean } {
  const cursor = Math.max(line.start, Math.min(offset, line.end));
  if (line.colon === undefined || line.start + line.colon >= cursor) {
    return { start: line.start + line.indent, end: cursor, property: true };
  }
  let start = line.start + line.colon + 1;
  while (start < line.end && /\s/u.test(line.text[start - line.start] ?? ""))
    start += 1;
  const flowScalar = flowSequenceScalarReplacement(line, cursor, start);
  if (flowScalar) return { ...flowScalar, property: false };
  const quote = line.text[start - line.start];
  if (quote === '"' || quote === "'") start += 1;
  let end = Math.max(start, cursor);
  while (end < line.end) {
    const character = line.text[end - line.start];
    if (
      character === undefined ||
      /\s|#/u.test(character) ||
      character === quote
    )
      break;
    end += 1;
  }
  return { start, end, property: false };
}

export function yamlCompletionContext(
  text: string,
  offset: number,
  section: ParsedSection | undefined,
): YamlCompletionContext {
  const lines = sourceLines(text);
  const current = lineAt(lines, offset);
  const replace = replacement(current, offset);
  const empty: YamlCompletionContext = {
    path: [],
    existingKeys: new Set(),
    siblingValues: siblingValues(lines, current),
    replaceStart: replace.start,
    replaceEnd: replace.end,
    propertyPosition: replace.property,
    ...(current.key === undefined ? {} : { fieldName: current.key }),
  };
  if (!section) return empty;
  const sectionLine = lineAt(lines, section.keyRange.start);
  const ancestors: SourceLine[] = [];
  let child = current;
  let indentation = current.indent;
  while (true) {
    const parent = parentOf(lines, child, indentation);
    if (!parent) break;
    ancestors.push(parent);
    if (parent.index === sectionLine.index) break;
    child = parent;
    indentation = parent.indent;
  }
  const sectionDepth = ancestors.findIndex(
    (line) => line.index === sectionLine.index,
  );
  if (sectionDepth < 1) return { ...empty, sectionType: section.type };
  const parents = ancestors
    .slice(0, sectionDepth)
    .reverse()
    .filter((line) => !line.key?.startsWith("$$"));
  const entry = parents[0];
  if (!entry?.key) return { ...empty, sectionType: section.type };
  return {
    ...empty,
    sectionType: section.type,
    entryId: entry.key,
    path: parents
      .map((line) => line.key)
      .filter((key): key is string => key !== undefined),
    existingKeys: directKeys(
      lines,
      parents.at(-1) ?? entry,
      current,
      current.indent,
    ),
  };
}

export function imageCompletionContext(
  text: string,
  offset: number,
  section: ParsedSection | undefined,
): ImageCompletionContext {
  const generic = yamlCompletionContext(text, offset, section);
  const empty: ImageCompletionContext = {
    level: "other",
    existingKeys: generic.existingKeys,
    replaceStart: generic.replaceStart,
    replaceEnd: generic.replaceEnd,
    propertyPosition: generic.propertyPosition,
    ...(generic.fieldName === undefined
      ? {}
      : { fieldName: generic.fieldName }),
  };
  if (generic.sectionType !== "images" && generic.sectionType !== "image")
    return empty;
  if (generic.path.length === 1 && generic.entryId)
    return { ...empty, level: "image-field", imageId: generic.entryId };
  if (
    generic.path.length !== 2 ||
    generic.path[1] !== "arguments" ||
    !generic.entryId
  )
    return empty;
  return {
    ...empty,
    level: "template-argument",
    imageId: generic.entryId,
  };
}
