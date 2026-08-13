import { isRecord, isUnknownArray } from "../util/records.js";
import {
  LanguageCatalog,
  normalizeLanguageLocale,
  type RootLanguageCatalog,
} from "../config/text/languageCatalog.js";

export interface ResolveTextOptions {
  readonly clientLocale?: string;
  readonly serverLocale?: string;
  readonly maxDepth?: number;
  readonly maxOutputLength?: number;
  readonly variables?: Readonly<Record<string, string | number | boolean>>;
  readonly imageResolver?: (image: ImageComponentNode) => string | undefined;
}

export interface ImageComponentNode {
  readonly kind: "image";
  readonly id: string;
  readonly shortId: boolean;
  readonly row: number;
  readonly column: number;
  readonly format?: string;
  readonly raw: string;
}

function substitutions(
  template: string,
  arguments_: readonly string[],
  indexedTags: boolean,
): string {
  if (indexedTags) {
    return template.replace(/<arg:(\d+)>/giu, (match, indexText: string) => {
      const argument = arguments_[Number(indexText)];
      return argument === undefined ? match : argument;
    });
  }
  let implicit = 0;
  return template.replace(
    /%(?:(\d+)\$)?s/gu,
    (match, explicit: string | undefined) => {
      const index = explicit === undefined ? implicit++ : Number(explicit) - 1;
      return arguments_[index] ?? match;
    },
  );
}

interface ParsedTag {
  readonly name: string;
  readonly arguments: readonly string[];
}

function parseTag(body: string): ParsedTag | undefined {
  const parts: string[] = [];
  let start = 0;
  let quote = "";
  let nested = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "<") nested += 1;
    else if (character === ">" && nested > 0) nested -= 1;
    else if (character === ":" && nested === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  const name = parts.shift()?.trim().toLowerCase();
  if (!name) return undefined;
  return {
    name,
    arguments: parts.map((value) => {
      const trimmed = value.trim();
      if (
        trimmed.length >= 2 &&
        ((trimmed[0] === "'" && trimmed.at(-1) === "'") ||
          (trimmed[0] === '"' && trimmed.at(-1) === '"'))
      )
        return trimmed.slice(1, -1).replace(/\\([\\'"])/gu, "$1");
      return trimmed;
    }),
  };
}

function imageNode(
  parsed: ParsedTag,
  raw: string,
): ImageComponentNode | undefined {
  if (parsed.name !== "image" || parsed.arguments.length === 0)
    return undefined;
  const [first = "", second, rowOrFormat, columnText, explicitFormat] =
    parsed.arguments;
  const id = second === undefined ? first : `${first}:${second}`;
  if (!id) return undefined;
  const rowIsInteger =
    rowOrFormat === undefined || /^-?\d+$/u.test(rowOrFormat);
  const format = rowIsInteger ? explicitFormat : rowOrFormat;
  return {
    kind: "image",
    id,
    shortId: second === undefined,
    row: rowIsInteger ? Number(rowOrFormat ?? 0) : 0,
    column:
      rowIsInteger && columnText !== undefined && /^-?\d+$/u.test(columnText)
        ? Number(columnText)
        : 0,
    ...(format === undefined ? {} : { format }),
    raw,
  };
}

function matchingTagEnd(text: string, start: number): number {
  let quote = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === ">") return index;
  }
  return -1;
}

function resolveString(
  value: string,
  catalog: RootLanguageCatalog,
  options: Required<
    Pick<
      ResolveTextOptions,
      "clientLocale" | "serverLocale" | "maxDepth" | "maxOutputLength"
    >
  > &
    ResolveTextOptions,
  depth: number,
): string {
  if (depth >= options.maxDepth) return value.slice(0, options.maxOutputLength);
  let result = "";
  let cursor = 0;
  while (cursor < value.length && result.length < options.maxOutputLength) {
    const start = value.indexOf("<", cursor);
    if (start < 0) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, start);
    const end = matchingTagEnd(value, start);
    if (end < 0) {
      result += value.slice(start);
      break;
    }
    const raw = value.slice(start, end + 1);
    const parsed = parseTag(value.slice(start + 1, end));
    let replacement: string | undefined;
    if (parsed) {
      switch (parsed.name) {
        case "lang":
        case "translate":
        case "tr":
        case "lang_or":
        case "translate_or":
        case "tr_or": {
          const [key, fallback, ...arguments_] = parsed.arguments;
          if (!key) break;
          const fallbackTag = parsed.name.endsWith("_or");
          const translated =
            catalog.resolveClient(key, options.clientLocale) ??
            (fallbackTag ? fallback : undefined) ??
            key;
          const args = fallbackTag ? arguments_ : parsed.arguments.slice(1);
          replacement = substitutions(
            translated,
            args.map((argument) =>
              resolveString(argument, catalog, options, depth + 1),
            ),
            false,
          );
          break;
        }
        case "i18n": {
          const key = parsed.arguments[0];
          if (key)
            replacement =
              catalog.resolveServer(key, options.serverLocale) ?? key;
          break;
        }
        case "l10n": {
          const [key, ...arguments_] = parsed.arguments;
          if (!key) break;
          replacement = substitutions(
            catalog.resolveServer(key, options.serverLocale) ?? key,
            arguments_.map((argument) =>
              resolveString(argument, catalog, options, depth + 1),
            ),
            true,
          );
          break;
        }
        case "arg": {
          const [key, fallback] = parsed.arguments;
          if (!key) break;
          const variable = options.variables?.[key];
          if (variable !== undefined) replacement = String(variable);
          else if (fallback !== undefined)
            replacement = resolveString(fallback, catalog, options, depth + 1);
          break;
        }
        case "image": {
          const image = imageNode(parsed, raw);
          if (image) replacement = options.imageResolver?.(image);
          break;
        }
      }
    }
    result +=
      replacement === undefined
        ? raw
        : resolveString(replacement, catalog, options, depth + 1);
    cursor = end + 1;
  }
  return result.slice(0, options.maxOutputLength);
}

function resolveJsonComponent(
  value: Record<string, unknown>,
  catalog: RootLanguageCatalog,
  options: Required<
    Pick<
      ResolveTextOptions,
      "clientLocale" | "serverLocale" | "maxDepth" | "maxOutputLength"
    >
  > &
    ResolveTextOptions,
  depth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    result[key] = resolveValue(entry, catalog, options, depth + 1);
  const translationKey =
    typeof value.translate === "string" ? value.translate : undefined;
  if (!translationKey) return result;
  const arguments_ = isUnknownArray(value.with)
    ? value.with.map((entry) =>
        plainComponent(resolveValue(entry, catalog, options, depth + 1)),
      )
    : [];
  const translated =
    catalog.resolveClient(translationKey, options.clientLocale) ??
    (typeof value.fallback === "string" ? value.fallback : undefined) ??
    translationKey;
  delete result.translate;
  delete result.with;
  delete result.fallback;
  result.text = substitutions(translated, arguments_, false);
  return result;
}

function plainComponent(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (isUnknownArray(value)) return value.map(plainComponent).join("");
  if (isRecord(value))
    return `${typeof value.text === "string" ? value.text : ""}${plainComponent(value.extra ?? [])}`;
  return "";
}

function resolveValue(
  value: unknown,
  catalog: RootLanguageCatalog,
  options: Required<
    Pick<
      ResolveTextOptions,
      "clientLocale" | "serverLocale" | "maxDepth" | "maxOutputLength"
    >
  > &
    ResolveTextOptions,
  depth: number,
): unknown {
  if (depth >= options.maxDepth) return value;
  if (typeof value === "string")
    return resolveString(value, catalog, options, depth);
  if (isUnknownArray(value))
    return value.map((entry) =>
      resolveValue(entry, catalog, options, depth + 1),
    );
  if (isRecord(value))
    return resolveJsonComponent(value, catalog, options, depth);
  return value;
}

export function resolveTextComponent(
  value: unknown,
  catalog: LanguageCatalog | RootLanguageCatalog,
  options: ResolveTextOptions & { readonly resourcesRoot?: string } = {},
): unknown {
  const resolvedOptions = {
    ...options,
    clientLocale: normalizeLanguageLocale(options.clientLocale ?? "zh_cn"),
    serverLocale: normalizeLanguageLocale(options.serverLocale ?? "zh_cn"),
    maxDepth: Math.max(1, Math.min(options.maxDepth ?? 16, 64)),
    maxOutputLength: Math.max(
      128,
      Math.min(options.maxOutputLength ?? 131_072, 1_048_576),
    ),
  };
  return resolveValue(
    value,
    catalog instanceof LanguageCatalog
      ? catalog.forRoot(options.resourcesRoot)
      : catalog,
    resolvedOptions,
    0,
  );
}
