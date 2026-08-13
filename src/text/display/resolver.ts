import type { RootGlobalVariableCatalog } from "../../config/text/globalVariables.js";
import {
  normalizeLanguageLocale,
  type LanguageDomain,
  type LanguageEntry,
  type RootLanguageCatalog,
} from "../../config/text/languageCatalog.js";
import {
  scanMiniMessage,
  type MiniMessageReference,
  type MiniMessageTag,
} from "../minimessage/parser.js";
import type { MiniMessageOccurrence } from "../../config/text/miniMessageScanner.js";
import type { TextRange } from "../../diagnostics/model.js";

export interface TextDisplayConfig {
  readonly displayLanguage: string;
  readonly sourceLanguage: string;
  readonly ignoredLocales: readonly string[];
  readonly annotationInPlace: boolean;
  readonly annotationMaxLength: number;
  readonly annotationDelimiter: string;
}

export const DEFAULT_TEXT_DISPLAY_CONFIG: TextDisplayConfig = {
  displayLanguage: "zh_cn",
  sourceLanguage: "en_us",
  ignoredLocales: [],
  annotationInPlace: true,
  annotationMaxLength: 40,
  annotationDelimiter: "·",
};

export interface TextDisplayReference {
  readonly kind: "language" | "server-language" | "global";
  readonly id: string;
  readonly tagName: string;
  readonly arguments: readonly string[];
  readonly range: TextRange;
  readonly tagRange: TextRange;
}

export interface TextDisplayDeclaration {
  readonly uri: string;
  readonly range: TextRange;
}

export interface TextDisplayResolution {
  readonly value?: string;
  readonly missing: boolean;
  readonly declaration?: TextDisplayDeclaration;
}

export interface TextDisplayLocaleRow {
  readonly locale: string;
  readonly value?: string;
  readonly declaration?: TextDisplayDeclaration;
}

export interface TextDisplayCatalogs {
  readonly languages: RootLanguageCatalog;
  readonly globals: RootGlobalVariableCatalog;
}

interface ResolveState extends TextDisplayCatalogs {
  readonly displayLanguage: string;
  readonly sourceLanguage?: string;
  readonly stack: ReadonlySet<string>;
  readonly depth: number;
  readonly maxDepth: number;
  readonly maxOutputLength: number;
}

interface ResolvedFragment {
  readonly value: string;
  readonly missing: boolean;
}

function displayReference(
  reference: MiniMessageReference,
  tags: readonly MiniMessageTag[],
): TextDisplayReference | undefined {
  if (reference.dynamic) return undefined;
  switch (reference.kind) {
    case "language":
    case "server-language":
    case "global":
      return {
        kind: reference.kind,
        id: reference.id,
        tagName: reference.tagName,
        arguments: tags
          .find(
            (tag) =>
              !tag.closing &&
              tag.name === reference.tagName &&
              tag.range.start === reference.tagRange.start &&
              tag.range.end === reference.tagRange.end,
          )
          ?.arguments.map((argument) => argument.value) ?? [reference.id],
        range: reference.range,
        tagRange: reference.tagRange,
      };
    case "image":
      return undefined;
  }
}

export function collectTextDisplayReferences(
  occurrences: readonly MiniMessageOccurrence[],
): readonly TextDisplayReference[] {
  const references = occurrences
    .flatMap((occurrence) =>
      occurrence.scan.references.flatMap((reference) => {
        const display = displayReference(reference, occurrence.scan.tags);
        return display ? [display] : [];
      }),
    )
    .sort(
      (left, right) =>
        left.tagRange.start - right.tagRange.start ||
        right.tagRange.end - left.tagRange.end,
    );

  const outermost: TextDisplayReference[] = [];
  for (const reference of references) {
    if (
      !outermost.some(
        (selected) =>
          reference.tagRange.start < selected.tagRange.end &&
          selected.tagRange.start < reference.tagRange.end,
      )
    )
      outermost.push(reference);
  }
  return outermost;
}

function languageEntry(
  catalog: RootLanguageCatalog,
  domain: LanguageDomain,
  key: string,
  locale: string,
): LanguageEntry | undefined {
  switch (domain) {
    case "client":
      return catalog.resolveClientEntry(key, locale);
    case "server":
      return catalog.resolveServerEntry(key, locale, false);
  }
}

function printfSubstitutions(
  template: string,
  arguments_: readonly string[],
): string {
  let implicit = 0;
  return template.replace(
    /%(?:(\d+)\$)?s/gu,
    (match, explicit: string | undefined) => {
      const index = explicit === undefined ? implicit++ : Number(explicit) - 1;
      return arguments_[index] ?? match;
    },
  );
}

function indexedSubstitutions(
  template: string,
  arguments_: readonly string[],
): string {
  return template.replace(
    /<arg:(\d+)>/giu,
    (match, indexText: string) => arguments_[Number(indexText)] ?? match,
  );
}

function nextState(
  state: ResolveState,
  token: string,
): ResolveState | undefined {
  if (state.depth >= state.maxDepth || state.stack.has(token)) return undefined;
  return {
    ...state,
    stack: new Set([...state.stack, token]),
    depth: state.depth + 1,
  };
}

function resolveLanguage(
  reference: TextDisplayReference,
  state: ResolveState,
  allowSourceFallback: boolean,
): TextDisplayResolution {
  const domain: LanguageDomain =
    reference.kind === "language" ? "client" : "server";
  const displayLocale = normalizeLanguageLocale(state.displayLanguage);
  const sourceLocale =
    state.sourceLanguage === undefined
      ? undefined
      : normalizeLanguageLocale(state.sourceLanguage);
  let entry = languageEntry(
    state.languages,
    domain,
    reference.id,
    displayLocale,
  );
  let missing = false;
  if (
    !entry &&
    allowSourceFallback &&
    sourceLocale &&
    sourceLocale !== displayLocale
  ) {
    entry = languageEntry(state.languages, domain, reference.id, sourceLocale);
    missing = entry !== undefined;
  }

  if (!entry) {
    if (domain !== "client" || !reference.tagName.endsWith("_or"))
      return { missing: false };
    const fallback = reference.arguments[1];
    if (fallback === undefined) return { missing: false };
    const nested = resolveRawText(fallback, state);
    return { value: nested.value, missing: true };
  }

  const nestedState = nextState(
    state,
    `language:${domain}:${entry.locale}:${reference.id}`,
  );
  if (!nestedState) return { missing };
  let substituted = entry.value;
  if (domain === "client") {
    substituted = printfSubstitutions(
      entry.value,
      reference.arguments.slice(reference.tagName.endsWith("_or") ? 2 : 1),
    );
  } else if (reference.tagName === "l10n") {
    substituted = indexedSubstitutions(
      entry.value,
      reference.arguments.slice(1),
    );
  }
  const nested = resolveRawText(substituted, nestedState);
  return {
    value: nested.value,
    missing: missing || nested.missing,
    ...(entry.source.kind === "vanilla"
      ? {}
      : {
          declaration: { uri: entry.source.uri, range: entry.source.range },
        }),
  };
}

function resolveGlobal(
  reference: TextDisplayReference,
  state: ResolveState,
): TextDisplayResolution {
  const selected = state.globals.resolve(reference.id).selected;
  if (!selected) return { missing: false };
  const nestedState = nextState(state, `global:${selected.id}`);
  if (!nestedState)
    return {
      missing: false,
      declaration: {
        uri: selected.source.uri,
        range: selected.source.valueRange,
      },
    };
  const nested = resolveRawText(
    indexedSubstitutions(selected.value, reference.arguments.slice(1)),
    nestedState,
  );
  return {
    value: nested.value,
    missing: nested.missing,
    declaration: {
      uri: selected.source.uri,
      range: selected.source.valueRange,
    },
  };
}

function resolveReference(
  reference: TextDisplayReference,
  state: ResolveState,
): TextDisplayResolution {
  switch (reference.kind) {
    case "global":
      return resolveGlobal(reference, state);
    case "language":
    case "server-language":
      return resolveLanguage(
        reference,
        state,
        state.sourceLanguage !== undefined,
      );
  }
}

function resolveRawText(text: string, state: ResolveState): ResolvedFragment {
  if (state.depth >= state.maxDepth || !text.includes("<"))
    return { value: text, missing: false };
  const scan = scanMiniMessage(text);
  const references = scan.references
    .flatMap((reference) => {
      const display = displayReference(reference, scan.tags);
      return display ? [display] : [];
    })
    .sort(
      (left, right) =>
        left.tagRange.start - right.tagRange.start ||
        right.tagRange.end - left.tagRange.end,
    );
  const outermost: TextDisplayReference[] = [];
  for (const reference of references) {
    if (
      !outermost.some(
        (selected) =>
          reference.tagRange.start < selected.tagRange.end &&
          selected.tagRange.start < reference.tagRange.end,
      )
    )
      outermost.push(reference);
  }
  if (outermost.length === 0) return { value: text, missing: false };

  let value = text;
  let missing = false;
  for (const reference of outermost.sort(
    (left, right) => right.tagRange.start - left.tagRange.start,
  )) {
    const resolved = resolveReference(reference, state);
    if (resolved.value === undefined) continue;
    value = `${value.slice(0, reference.tagRange.start)}${resolved.value}${value.slice(reference.tagRange.end)}`;
    missing ||= resolved.missing;
    if (value.length > state.maxOutputLength)
      value = value.slice(0, state.maxOutputLength);
  }
  return { value, missing };
}

function resolveState(
  catalogs: TextDisplayCatalogs,
  displayLanguage: string,
  sourceLanguage?: string,
): ResolveState {
  return {
    ...catalogs,
    displayLanguage: normalizeLanguageLocale(displayLanguage),
    ...(sourceLanguage === undefined
      ? {}
      : { sourceLanguage: normalizeLanguageLocale(sourceLanguage) }),
    stack: new Set(),
    depth: 0,
    maxDepth: 16,
    maxOutputLength: 131_072,
  };
}

export function resolveTextDisplay(
  reference: TextDisplayReference,
  catalogs: TextDisplayCatalogs,
  config: Pick<TextDisplayConfig, "displayLanguage" | "sourceLanguage">,
): TextDisplayResolution {
  return resolveReference(
    reference,
    resolveState(catalogs, config.displayLanguage, config.sourceLanguage),
  );
}

function orderedLocales(
  reference: TextDisplayReference,
  catalog: RootLanguageCatalog,
  config: Pick<
    TextDisplayConfig,
    "displayLanguage" | "sourceLanguage" | "ignoredLocales"
  >,
): readonly string[] {
  const ignored = new Set(config.ignoredLocales.map(normalizeLanguageLocale));
  return [
    ...new Set([
      normalizeLanguageLocale(config.displayLanguage),
      normalizeLanguageLocale(config.sourceLanguage),
      ...catalog
        .definitions(reference.id, {
          domain: reference.kind === "language" ? "client" : "server",
        })
        .map((entry) => entry.locale)
        .filter((locale) => locale !== "all" && !ignored.has(locale)),
    ]),
  ];
}

export function textDisplayLocaleRows(
  reference: TextDisplayReference,
  catalogs: TextDisplayCatalogs,
  config: Pick<
    TextDisplayConfig,
    "displayLanguage" | "sourceLanguage" | "ignoredLocales"
  >,
): readonly TextDisplayLocaleRow[] {
  if (reference.kind === "global") {
    const resolved = resolveGlobal(
      reference,
      resolveState(catalogs, config.displayLanguage, config.sourceLanguage),
    );
    return [
      {
        locale: "global",
        ...(resolved.value === undefined ? {} : { value: resolved.value }),
        ...(resolved.declaration === undefined
          ? {}
          : { declaration: resolved.declaration }),
      },
    ];
  }
  const domain: LanguageDomain =
    reference.kind === "language" ? "client" : "server";
  return orderedLocales(reference, catalogs.languages, config).map((locale) => {
    const entry = languageEntry(
      catalogs.languages,
      domain,
      reference.id,
      locale,
    );
    if (!entry) return { locale };
    let substituted = entry.value;
    if (domain === "client") {
      substituted = printfSubstitutions(
        entry.value,
        reference.arguments.slice(reference.tagName.endsWith("_or") ? 2 : 1),
      );
    } else if (reference.tagName === "l10n") {
      substituted = indexedSubstitutions(
        entry.value,
        reference.arguments.slice(1),
      );
    }
    return {
      locale,
      value: resolveRawText(
        substituted,
        resolveState(catalogs, locale, config.sourceLanguage),
      ).value,
      ...(entry.source.kind === "vanilla"
        ? {}
        : {
            declaration: { uri: entry.source.uri, range: entry.source.range },
          }),
    };
  });
}

export function truncateAnnotation(value: string, maximum: number): string {
  return maximum > 0 && value.length > maximum
    ? `${value.slice(0, maximum)}…`
    : value;
}

export function localeFlagRegion(locale: string): string | undefined {
  const parts = locale.trim().toLowerCase().replaceAll("-", "_").split("_");
  const region = parts.length > 1 ? parts.at(-1) : undefined;
  return region && /^[a-z]{2}$/u.test(region) ? region : undefined;
}

export function annotationText(
  value: string,
  inPlace: boolean,
  config: Pick<
    TextDisplayConfig,
    "annotationDelimiter" | "annotationMaxLength"
  >,
): string {
  const text = truncateAnnotation(value, config.annotationMaxLength);
  return inPlace ? text : `${config.annotationDelimiter}${text}`;
}
