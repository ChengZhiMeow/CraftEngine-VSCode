import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PackSource, ParsedYamlFile } from "../model.js";
import { TRANSLATION_LIST_SEPARATOR } from "../files/standalone.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { normalizeLanguageLocale } from "./languageCatalog.js";

export function standaloneTranslationPack(
  resourcesRoot: string,
  candidates: readonly PackSource[],
): PackSource {
  const canonicalRoot = canonicalPath(resourcesRoot);
  const base = candidates.find(
    (pack) =>
      !pack.subpack &&
      canonicalPath(pack.resourcesRoot) === canonicalRoot,
  );
  const translationsRoot = path.join(
    path.dirname(resourcesRoot),
    "translations",
  );
  if (base) {
    return {
      ...base,
      active: true,
      configurationRoot: translationsRoot,
      loadOrder: Number.MIN_SAFE_INTEGER,
    };
  }
  const folder = path.join(resourcesRoot, "__standalone_translations__");
  return {
    resourcesRoot,
    folder,
    name: "__craftengine_translations__",
    namespace: "minecraft",
    active: true,
    configurationRoot: translationsRoot,
    resourcePackRoot: path.join(folder, "resourcepack"),
    baseResourcePackRoot: path.join(folder, "resourcepack"),
    loadOrder: Number.MIN_SAFE_INTEGER,
  };
}

export function mergeParsedFileWithGeneratedSections(
  parsed: ParsedYamlFile,
  indexed?: ParsedYamlFile,
): ParsedYamlFile {
  const factory =
    indexed?.sections.filter((section) => section.generated === "factory") ??
    [];
  const merged =
    factory.length === 0
      ? parsed
      : { ...parsed, sections: [...parsed.sections, ...factory] };
  const standalone = indexed?.sections.find(
    (section) => section.generated === "standalone-translation",
  );
  if (!standalone) return merged;
  if (isRecord(standalone.value)) {
    const locale = Object.keys(standalone.value)[0];
    if (locale) return materializeStandaloneTranslationFile(merged, locale);
  }
  try {
    const filePath = fileURLToPath(parsed.uri);
    return materializeStandaloneTranslationFile(
      merged,
      path.basename(filePath, path.extname(filePath)),
    );
  } catch {
    return merged;
  }
}

function standaloneTranslationValue(value: unknown): unknown {
  if (isUnknownArray(value)) {
    return value
      .map(standaloneTranslationString)
      .join(TRANSLATION_LIST_SEPARATOR);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        standaloneTranslationValue(entry),
      ]),
    );
  }
  return value;
}

function standaloneTranslationString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (isUnknownArray(value))
    return `[${value.map(standaloneTranslationString).join(", ")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .map(([key, entry]) => `${key}=${standaloneTranslationString(entry)}`)
      .join(", ")}}`;
  }
  return "";
}

export function materializeStandaloneTranslationFile(
  parsed: ParsedYamlFile,
  locale: string,
): ParsedYamlFile {
  const sourceSections = parsed.sections.filter(
    (section) =>
      section.generated === undefined && section.key !== "lang-version",
  );
  const normalizedLocale = normalizeLanguageLocale(locale);
  const keys = new Map<
    string,
    { readonly start: number; readonly end: number }
  >();
  const values = new Map<
    string,
    { readonly start: number; readonly end: number }
  >();
  for (const section of sourceSections) {
    const root = `${normalizedLocale}.${section.key}`;
    keys.set(root, section.keyRange);
    values.set(root, section.valueRange);
    for (const [fieldPath, range] of section.ranges.keys)
      keys.set(`${root}.${fieldPath}`, range);
    for (const [fieldPath, range] of section.ranges.values)
      values.set(`${root}.${fieldPath}`, range);
  }
  const first = sourceSections[0];
  const fallback = parsed.sections[0]?.keyRange ?? { start: 0, end: 0 };
  return {
    ...parsed,
    sections: [
      {
        key: "translations#standalone",
        type: "translations",
        value: {
          [normalizedLocale]: Object.fromEntries(
            sourceSections.map((section) => [
              section.key,
              standaloneTranslationValue(section.value),
            ]),
          ),
        },
        keyRange: first?.keyRange ?? fallback,
        valueRange: {
          start: first?.valueRange.start ?? fallback.start,
          end: sourceSections.at(-1)?.valueRange.end ?? fallback.end,
        },
        ranges: { keys, values },
        generated: "standalone-translation" as const,
      },
    ],
  };
}
