import { pathToFileURL } from "node:url";

import type { PackSource, ParsedYamlFile } from "../model.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import type { ResourceFileCatalog } from "../../resources/model.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { readResourceText } from "../../resources/catalog.js";
import { Messages } from "../../messages.js";

export type LanguageDomain = "client" | "server";

export const CLIENT_LANGUAGE_SECTIONS = [
  "lang",
  "language",
  "languages",
] as const;
export const SERVER_LANGUAGE_SECTIONS = [
  "translations",
  "translation",
  "l10n",
  "localization",
  "i18n",
  "internationalization",
] as const;

export interface ParsedLanguagePackFile {
  readonly parsed: ParsedYamlFile;
  readonly pack: PackSource;
}

export interface LanguageJsonFile {
  readonly uri: string;
  readonly locale: string;
  readonly namespace: string;
  readonly value: unknown;
  readonly ranges?: ReadonlyMap<string, TextRange>;
  readonly pack: PackSource;
}

export interface LanguageSource {
  readonly kind: "yaml" | "resource-json" | "vanilla";
  readonly uri: string;
  readonly range: TextRange;
  readonly keyRange?: TextRange;
  readonly pack?: PackSource;
  readonly section?: string;
}

export interface LanguageEntry {
  readonly domain: LanguageDomain;
  readonly locale: string;
  readonly key: string;
  readonly value: string;
  readonly source: LanguageSource;
}

export interface LanguageCompletion {
  readonly key: string;
  readonly domain: LanguageDomain;
  readonly value?: string;
  readonly locales: readonly string[];
}

export interface LanguageDefinitionOptions {
  readonly domain?: LanguageDomain;
  readonly locale?: string;
  readonly includeInactive?: boolean;
}

export interface LanguageCatalogBuildOptions {
  readonly resourceJson?: readonly LanguageJsonFile[];
  readonly vanillaClient?: Readonly<Record<string, string>>;
  readonly vanillaLocale?: string;
}

export function normalizeLanguageLocale(locale: string): string {
  return locale.trim().replaceAll("-", "_").toLowerCase();
}

function javaScalar(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  if (isUnknownArray(value))
    return `[${value.map((entry) => javaScalar(entry) ?? "null").join(", ")}]`;
  return undefined;
}

function flattenLeaves(
  value: unknown,
  prefix: string,
  visit: (key: string, value: string, pathKey: string) => void,
): void {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenLeaves(child, prefix ? `${prefix}.${key}` : key, visit);
    }
    return;
  }
  const scalar = javaScalar(value);
  if (scalar !== undefined && prefix) visit(prefix, scalar, prefix);
}

function yamlEntries(file: ParsedLanguagePackFile): LanguageEntry[] {
  const entries: LanguageEntry[] = [];
  for (const section of file.parsed.sections) {
    let domain: LanguageDomain | undefined;
    switch (section.type) {
      case "lang":
      case "language":
      case "languages":
        domain = "client";
        break;
      case "translations":
      case "translation":
      case "l10n":
      case "localization":
      case "i18n":
      case "internationalization":
        domain = "server";
        break;
    }
    if (!domain || !isRecord(section.value)) continue;
    for (const [rawLocale, translations] of Object.entries(section.value)) {
      if (!isRecord(translations)) continue;
      const locale = normalizeLanguageLocale(rawLocale);
      if (
        domain === "server" &&
        !/^[a-z]{2,8}(?:[_-][a-z0-9]{2,8})?$/iu.test(locale)
      )
        continue;
      flattenLeaves(translations, "", (key, value, flatPath) => {
        const sourcePath = `${rawLocale}.${flatPath}`;
        entries.push({
          domain,
          locale,
          key,
          value,
          source: {
            kind: "yaml",
            uri: file.parsed.uri,
            range:
              section.ranges.values.get(sourcePath) ??
              section.ranges.keys.get(sourcePath) ??
              section.valueRange,
            keyRange:
              section.ranges.keys.get(sourcePath) ??
              section.ranges.values.get(sourcePath) ??
              section.valueRange,
            pack: file.pack,
            section: section.key,
          },
        });
      });
    }
  }
  return entries;
}

export function languageConflictIssues(
  files: readonly ParsedLanguagePackFile[],
  includeInactive = false,
): readonly CoreIssue[] {
  const physicalDeclarations = new Set<string>();
  const groups = new Map<string, LanguageEntry[]>();
  for (const entry of files.flatMap(yamlEntries).filter((entry) => {
    if (!includeInactive && entry.source.pack?.active === false) return false;
    const range = entry.source.keyRange ?? entry.source.range;
    const declaration = `${entry.domain}\u0000${entry.locale}\u0000${entry.key}\u0000${entry.source.uri}\u0000${range.start}\u0000${range.end}`;
    if (physicalDeclarations.has(declaration)) return false;
    physicalDeclarations.add(declaration);
    return true;
  })) {
    const pack = entry.source.pack;
    if (!pack) continue;
    const key = `${canonicalPath(pack.resourcesRoot)}\u0000${entry.domain}\u0000${entry.locale}\u0000${entry.key}`;
    const values = groups.get(key) ?? [];
    values.push(entry);
    groups.set(key, values);
  }
  const issues: CoreIssue[] = [];
  for (const values of groups.values()) {
    if (values.length < 2) continue;
    for (const entry of values) {
      issues.push({
        code: "duplicate-language-key",
        message: Messages.src.config.text.languageCatalog.text0001(
          entry.locale,
          entry.key,
        ),
        severity: "error",
        uri: entry.source.uri,
        range: entry.source.keyRange ?? entry.source.range,
        related: values
          .filter((other) => other !== entry)
          .map((other) => ({
            message: Messages.src.config.text.languageCatalog.text0002(
              other.source.section ??
                Messages.src.config.text.languageCatalog.text0003,
            ),
            uri: other.source.uri,
            range: other.source.keyRange ?? other.source.range,
          })),
      });
    }
  }
  return issues;
}

function jsonEntries(file: LanguageJsonFile): LanguageEntry[] {
  if (!isRecord(file.value)) return [];
  const entries: LanguageEntry[] = [];
  for (const [key, value] of Object.entries(file.value)) {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    )
      continue;
    entries.push({
      domain: "client",
      locale: normalizeLanguageLocale(file.locale),
      key,
      value: String(value),
      source: {
        kind: "resource-json",
        uri: file.uri,
        range: file.ranges?.get(key) ?? { start: 0, end: 0 },
        pack: file.pack,
      },
    });
  }
  return entries;
}

function jsonStringEnd(text: string, start: number): number | undefined {
  if (text[start] !== '"') return undefined;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  return undefined;
}

function skipJsonWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && /[\s\uFEFF]/u.test(text[index] ?? ""))
    index += 1;
  return index;
}

function languageJsonRanges(text: string): ReadonlyMap<string, TextRange> {
  const ranges = new Map<string, TextRange>();
  let index = skipJsonWhitespace(text, 0);
  if (text[index] !== "{") return ranges;
  index += 1;
  while (index < text.length) {
    index = skipJsonWhitespace(text, index);
    if (text[index] === "}") break;
    const keyEnd = jsonStringEnd(text, index);
    if (keyEnd === undefined) break;
    let key: unknown;
    try {
      key = JSON.parse(text.slice(index, keyEnd)) as unknown;
    } catch {
      break;
    }
    index = skipJsonWhitespace(text, keyEnd);
    if (text[index] !== ":") break;
    index = skipJsonWhitespace(text, index + 1);
    const valueStart = index;
    let valueEnd: number;
    let range: TextRange;
    if (text[index] === '"') {
      const stringEnd = jsonStringEnd(text, index);
      if (stringEnd === undefined) break;
      valueEnd = stringEnd;
      range = { start: index + 1, end: stringEnd - 1 };
    } else {
      let nested = 0;
      let quote = false;
      for (; index < text.length; index += 1) {
        const character = text[index] ?? "";
        if (quote) {
          if (character === "\\") index += 1;
          else if (character === '"') quote = false;
        } else if (character === '"') quote = true;
        else if (character === "{" || character === "[") nested += 1;
        else if (character === "}" || character === "]") {
          if (nested === 0) break;
          nested -= 1;
        } else if (character === "," && nested === 0) break;
      }
      valueEnd = index;
      while (valueEnd > valueStart && /\s/u.test(text[valueEnd - 1] ?? ""))
        valueEnd -= 1;
      range = { start: valueStart, end: valueEnd };
    }
    if (typeof key === "string") ranges.set(key, range);
    index = skipJsonWhitespace(text, valueEnd);
    if (text[index] !== ",") break;
    index += 1;
  }
  return ranges;
}

function entryOrder(left: LanguageEntry, right: LanguageEntry): number {
  const leftOrder =
    left.source.kind === "vanilla"
      ? Number.MIN_SAFE_INTEGER
      : (left.source.pack?.loadOrder ?? Number.MAX_SAFE_INTEGER);
  const rightOrder =
    right.source.kind === "vanilla"
      ? Number.MIN_SAFE_INTEGER
      : (right.source.pack?.loadOrder ?? Number.MAX_SAFE_INTEGER);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (left.source.kind !== right.source.kind) {
  // 先加载资源包 JSON, 再用 CE YAML 覆盖同名内容
    return left.source.kind === "resource-json"
      ? -1
      : right.source.kind === "resource-json"
        ? 1
        : 0;
  }
  return (
    left.source.uri.localeCompare(right.source.uri) ||
    left.source.range.start - right.source.range.start
  );
}

function isActive(entry: LanguageEntry): boolean {
  return entry.source.pack?.active !== false;
}

export class LanguageCatalog {
  private readonly roots = new Map<string, readonly LanguageEntry[]>();

  public constructor(private readonly entries: readonly LanguageEntry[]) {
    const grouped = new Map<string, LanguageEntry[]>();
    for (const entry of entries) {
      const root = entry.source.pack
        ? canonicalPath(entry.source.pack.resourcesRoot)
        : "*";
      const values = grouped.get(root) ?? [];
      values.push(entry);
      grouped.set(root, values);
    }
    for (const [root, values] of grouped)
      this.roots.set(root, values.sort(entryOrder));
  }

  public forRoot(resourcesRoot?: string): RootLanguageCatalog {
    return new RootLanguageCatalog(
      resourcesRoot === undefined
        ? [...this.entries].sort(entryOrder)
        : [
            ...(this.roots.get("*") ?? []),
            ...(this.roots.get(canonicalPath(resourcesRoot)) ?? []),
          ],
    );
  }

}

export class RootLanguageCatalog {
  public constructor(private readonly entries: readonly LanguageEntry[]) {}

  public definitions(
    key: string,
    options: LanguageDefinitionOptions = {},
  ): readonly LanguageEntry[] {
    const locale =
      options.locale === undefined
        ? undefined
        : normalizeLanguageLocale(options.locale);
    return this.entries.filter(
      (entry) =>
        entry.key === key &&
        (options.domain === undefined || entry.domain === options.domain) &&
        (locale === undefined || entry.locale === locale) &&
        (options.includeInactive === true || isActive(entry)),
    );
  }

  public resolveClientEntry(
    key: string,
    locale = "zh_cn",
  ): LanguageEntry | undefined {
    const normalized = normalizeLanguageLocale(locale);
    let selected: LanguageEntry | undefined;
  // 资源包 JSON 使用第一个启用项, CE YAML 使用最后一个匹配项
    let hasResourceJson = false;
    for (const entry of this.entries.filter(
      (value) => value.domain === "client" && isActive(value),
    )) {
      if (entry.key !== key) continue;
      if (
        !(entry.source.kind === "yaml"
          ? entry.locale === "all" ||
            entry.locale === (normalized.split("_", 1)[0] ?? normalized) ||
            entry.locale === normalized
          : entry.locale === normalized)
      )
        continue;
      if (entry.source.kind === "resource-json") {
        if (!hasResourceJson) {
          selected = entry;
          hasResourceJson = true;
        }
      } else {
        selected = entry;
      }
    }
    return selected;
  }

  public resolveClient(key: string, locale = "zh_cn"): string | undefined {
    return this.resolveClientEntry(key, locale)?.value;
  }

  public resolveServerEntry(
    key: string,
    locale = "zh_cn",
    fallbackToEnglish = true,
  ): LanguageEntry | undefined {
    const normalized = normalizeLanguageLocale(locale);
  // 相同语言和相同 key 重复时保留第一项
    const first = (target: string): LanguageEntry | undefined =>
      this.entries.find(
        (entry) =>
          entry.domain === "server" &&
          isActive(entry) &&
          entry.locale === target &&
          entry.key === key,
      );
    return (
      first(normalized) ??
      first(normalized.split("_", 1)[0] ?? normalized) ??
      (fallbackToEnglish ? first("en") : undefined)
    );
  }

  public resolveServer(key: string, locale = "zh_cn"): string | undefined {
    return this.resolveServerEntry(key, locale)?.value;
  }

  public translations(
    locale = "zh_cn",
    domain: LanguageDomain = "client",
  ): Readonly<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const key of new Set(
      this.entries
        .filter((entry) => entry.domain === domain)
        .map((entry) => entry.key),
    )) {
      const value =
        domain === "client"
          ? this.resolveClient(key, locale)
          : this.resolveServer(key, locale);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  public complete(
    prefix = "",
    domain?: LanguageDomain,
  ): readonly LanguageCompletion[] {
    const normalizedPrefix = prefix.toLowerCase();
    const grouped = new Map<string, LanguageEntry[]>();
    for (const entry of this.entries) {
      if (!isActive(entry)) continue;
      if (domain && entry.domain !== domain) continue;
      if (!entry.key.toLowerCase().includes(normalizedPrefix)) continue;
      const groupKey = `${entry.domain}\u0000${entry.key}`;
      const values = grouped.get(groupKey) ?? [];
      values.push(entry);
      grouped.set(groupKey, values);
    }
    return [...grouped.values()]
      .flatMap((values) => {
        const first = values[0];
        if (!first) return [];
        const value =
          first.domain === "client"
            ? this.resolveClient(first.key)
            : this.resolveServer(first.key);
        return [
          {
            key: first.key,
            domain: first.domain,
            ...(value === undefined ? {} : { value }),
            locales: [...new Set(values.map((value) => value.locale))].sort(),
          },
        ];
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  }
}

export function buildLanguageCatalog(
  yamlFiles: readonly ParsedLanguagePackFile[],
  options: LanguageCatalogBuildOptions = {},
): LanguageCatalog {
  const vanillaLocale = normalizeLanguageLocale(
    options.vanillaLocale ?? "zh_cn",
  );
  return new LanguageCatalog([
    ...(options.resourceJson ?? []).flatMap(jsonEntries),
    ...yamlFiles.flatMap(yamlEntries),
    ...Object.entries(options.vanillaClient ?? {}).map(
      ([key, value]): LanguageEntry => ({
        domain: "client",
        locale: vanillaLocale,
        key,
        value,
        source: {
          kind: "vanilla",
          uri: `builtin:minecraft/${vanillaLocale}`,
          range: { start: 0, end: 0 },
        },
      }),
    ),
  ]);
}

export async function languageJsonFilesFromCatalog(
  resources: ResourceFileCatalog,
  resourcesRoot?: string,
): Promise<readonly LanguageJsonFile[]> {
  const result: LanguageJsonFile[] = [];
  const root =
    resourcesRoot === undefined ? undefined : canonicalPath(resourcesRoot);
  for (const file of (resources.byKind.get("language") ?? [])
    .filter(
      (file) =>
        root === undefined || canonicalPath(file.pack.resourcesRoot) === root,
    )
    .sort(
      (left, right) =>
        left.pack.loadOrder - right.pack.loadOrder ||
        left.path.localeCompare(right.path),
    )) {
    const separator = file.id.indexOf(":");
    try {
      const text = await readResourceText(file);
      result.push({
        uri: pathToFileURL(file.path).toString(),
        locale: separator < 0 ? file.id : file.id.slice(separator + 1),
        namespace: separator < 0 ? "minecraft" : file.id.slice(0, separator),
        value: JSON.parse(text) as unknown,
        ranges: languageJsonRanges(text),
        pack: file.pack,
      });
    } catch {
      continue;
    }
  }
  return result;
}

export function completeLanguageKeys(
  catalog: LanguageCatalog | RootLanguageCatalog,
  options: {
    readonly resourcesRoot?: string;
    readonly prefix?: string;
    readonly domain?: LanguageDomain;
  } = {},
): readonly LanguageCompletion[] {
  return (
    catalog instanceof LanguageCatalog
      ? catalog.forRoot(options.resourcesRoot)
      : catalog
  ).complete(options.prefix, options.domain);
}
