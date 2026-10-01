import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
  ConfigurationSourceKind,
  ConfigurationTemplateDefinition,
  ImageCandidateInput,
  PackSource,
  ParsedSection,
  ParsedYamlFile,
} from "../model.js";
import {
  evaluateExpression,
  expressionTruthy,
  ExpressionError,
} from "../expression/evaluator.js";
import type { ImageSource } from "../image/model.js";
import { getSectionFamily } from "../registry/sectionRegistry.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { makeIdentifier, splitIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { parseLooseScalar } from "../parsing/craftEngineYaml.js";
import { findCraftEngineTemplatePlaceholders } from "./stringParser.js";
import {
  normalizeArgumentType,
  type TemplateArgumentTypeId,
} from "./schema.js";

import { Messages } from "../../messages.js";

export interface ParsedPackFile {
  readonly parsed: ParsedYamlFile;
  readonly pack: PackSource;
}

export interface ExpansionResult {
  readonly templates: readonly ConfigurationTemplateDefinition[];
  readonly candidates: readonly ImageCandidateInput[];
  readonly configurations: readonly ConfigurationCandidateInput[];
  readonly opaqueSections: readonly GeneratedOpaqueSection[];
  readonly issues: readonly CoreIssue[];
}

export interface GeneratedOpaqueSection {
  readonly sectionType: string;
  readonly sectionKey: string;
  readonly value: Readonly<Record<string, unknown>>;
  readonly source: ConfigurationSource;
}

export interface ExpandedTemplateIdValueEntry {
  readonly rawId: string;
  readonly value: unknown;
  readonly source: ConfigurationSource;
}

export interface ExpandedTemplateIdValueResult {
  readonly entries: readonly ExpandedTemplateIdValueEntry[];
  readonly issues: readonly CoreIssue[];
}

interface TemplateDefinition extends ConfigurationTemplateDefinition {
  readonly rawId: string;
  readonly file: ParsedPackFile;
  readonly section: ParsedSection;
}

interface TemplateCatalog {
  readonly definitions: readonly TemplateDefinition[];
}

interface PlaceholderContext {
  readonly values: Map<string, unknown>;
  readonly dynamicValues: Map<string, (context: PlaceholderContext) => unknown>;
  readonly origins: Map<string, readonly string[]>;
  readonly report: TemplateArgumentReporter;
}

interface TemplateArgumentIssueLocation {
  readonly uri: string;
  readonly range: TextRange;
}

type TemplateArgumentReporter = (
  message: string,
  location?: TemplateArgumentIssueLocation,
) => void;

interface TemplateArgumentSource {
  readonly source: ConfigurationSource;
  readonly text: string;
}

type PlaceholderLocationResolver = (
  range: TextRange,
) => TemplateArgumentIssueLocation | undefined;

interface TemplateSubstitutionTrace {
  readonly fieldKeys: Map<string, readonly string[]>;
  readonly fieldValues: Map<string, readonly string[]>;
}

const DYNAMIC_ARGUMENT = Symbol("dynamic-template-argument");

interface DynamicArgument {
  readonly [DYNAMIC_ARGUMENT]: (context: PlaceholderContext) => unknown;
}

export interface UnresolvedTemplateVariable {
  readonly name: string;
  readonly raw: string;
  readonly range: TextRange;
}

export interface ResolvedTemplateString {
  readonly value: string;
  readonly sourceMap: readonly TextRange[];
  readonly unresolved: readonly UnresolvedTemplateVariable[];
}

function splitDefault(body: string): [name: string, fallback?: string] {
  const index = body.indexOf(":-");
  if (index >= 0) return [body.slice(0, index), body.slice(index + 2)];
  return [body];
}

function placeholderName(rawBody: string): string {
  const [rawName] = splitDefault(rawBody);
  const name = rawName.endsWith("^^")
    ? rawName.slice(0, -2)
    : rawName.endsWith("^")
      ? rawName.slice(0, -1)
      : rawName;
  return name.trim();
}

function templateArgumentText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return `${value}`;
  if (isUnknownArray(value))
    return `[${value.map((entry) => templateArgumentText(entry)).join(", ")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .map(([key, entry]) => `${key}=${templateArgumentText(entry)}`)
      .join(", ")}}`;
  }
  return "";
}

interface ParsedTemplateDefault {
  readonly value: unknown;
  readonly location: PlaceholderLocationResolver | undefined;
}

  // 默认值先读取标签再找占位符, 同时保留原文位置方便定位报错
function parseTemplateDefault(
  source: string,
  location?: PlaceholderLocationResolver,
): ParsedTemplateDefault {
  const start = source.search(/\S/u);
  if (start < 0) return { value: "", location };
  let end = source.length;
  while (end > start && /\s/u.test(source[end - 1] ?? "")) end -= 1;
  const quote = source[start];
  if ((quote === "'" || quote === '"') && source[end - 1] === quote) {
    let value = "";
    const sourceMap: TextRange[] = [];
    for (let index = start + 1; index < end - 1; ) {
      const character = source[index] ?? "";
      if (character === "\\") {
        const escaped = source[index + 1];
        if (escaped !== quote && escaped !== "\\")
          return { value: parseLooseScalar(source), location };
        value += escaped;
        sourceMap.push({ start: index, end: index + 2 });
        index += 2;
        continue;
      }
      if (character === quote)
        return { value: parseLooseScalar(source), location };
      value += character;
      sourceMap.push({ start: index, end: index + 1 });
      index += 1;
    }
    const parsedLocation =
      location === undefined
        ? undefined
        : (range: TextRange): TemplateArgumentIssueLocation | undefined => {
            const first = sourceMap[range.start];
            const last = sourceMap[Math.max(range.start, range.end - 1)];
            if (first && last)
              return location({ start: first.start, end: last.end });
            const boundary = range.start <= 0 ? start + 1 : end - 1;
            return location({ start: boundary, end: boundary });
          };
    return { value, location: parsedLocation };
  }
  return { value: parseLooseScalar(source), location };
}

function titleCase(value: unknown): string {
  return templateArgumentText(value)
    .split(/[_ ]/u)
    .map((part) =>
      part.length === 0
        ? ""
        : `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function getArgument(
  context: PlaceholderContext,
  rawBody: string,
  onArgument?: (name: string) => void,
  location?: TemplateArgumentIssueLocation,
  fallbackLocation?: PlaceholderLocationResolver,
): unknown {
  const [rawName, fallback] = splitDefault(rawBody);
  let name = rawName;
  let modifier: "^" | "^^" | undefined;
  if (name.endsWith("^^")) {
    modifier = "^^";
    name = name.slice(0, -2);
  } else if (name.endsWith("^")) {
    modifier = "^";
    name = name.slice(0, -1);
  }
  name = name.trim();
  onArgument?.(name);

  let value: unknown;
  const dynamic = context.dynamicValues.get(name);
  if (dynamic) {
    value = dynamic(context);
  } else if (context.values.has(name)) {
    value = context.values.get(name);
  } else if (fallback !== undefined) {
    const parsed = parseTemplateDefault(fallback, fallbackLocation);
    value =
      typeof parsed.value === "string"
        ? substituteString(parsed.value, context, onArgument, parsed.location)
        : parsed.value;
  } else {
    context.report(
      Messages.src.config.template.expander.text0001(name),
      location,
    );
    return `\${${rawBody}}`;
  }

  if (modifier === "^^") return String(value).toUpperCase();
  if (modifier === "^") return titleCase(value);
  return value;
}

export function substituteString(
  source: string,
  context: PlaceholderContext,
  onArgument?: (name: string) => void,
  placeholderLocation?: PlaceholderLocationResolver,
): unknown {
  const placeholders = findCraftEngineTemplatePlaceholders(source);
  if (placeholders.length === 0) return source.replace(/\\\$/gu, "$");
  if (
    placeholders.length === 1 &&
    placeholders[0]?.start === 0 &&
    placeholders[0].end === source.length
  ) {
    const placeholder = placeholders[0];
    const fallbackIndex = placeholder.body.indexOf(":-");
    const nestedLocation =
      fallbackIndex < 0 || !placeholderLocation
        ? undefined
        : (range: TextRange) =>
            placeholderLocation({
              start: placeholder.start + 2 + fallbackIndex + 2 + range.start,
              end: placeholder.start + 2 + fallbackIndex + 2 + range.end,
            });
    return getArgument(
      context,
      placeholder.body,
      onArgument,
      placeholderLocation?.(placeholder),
      nestedLocation,
    );
  }
  let result = "";
  let cursor = 0;
  let hasNonNullPart = false;
  for (const placeholder of placeholders) {
    const literal = source.slice(cursor, placeholder.start);
    result += literal;
    if (literal.length > 0) hasNonNullPart = true;
    const fallbackIndex = placeholder.body.indexOf(":-");
    const nestedLocation =
      fallbackIndex < 0 || !placeholderLocation
        ? undefined
        : (range: TextRange) =>
            placeholderLocation({
              start: placeholder.start + 2 + fallbackIndex + 2 + range.start,
              end: placeholder.start + 2 + fallbackIndex + 2 + range.end,
            });
    const replacement = getArgument(
      context,
      placeholder.body,
      onArgument,
      placeholderLocation?.(placeholder),
      nestedLocation,
    );
    if (replacement !== null && replacement !== undefined) {
      result += templateArgumentText(replacement);
      hasNonNullPart = true;
    }
    cursor = placeholder.end;
  }
  const tail = source.slice(cursor);
  result += tail;
  if (tail.length > 0) hasNonNullPart = true;
  if (!hasNonNullPart) return null;
  return result.replace(/\\\$/gu, "$");
}

export function resolveTemplateStringForEntry(
  source: string,
  rawId: string,
  defaultNamespace: string,
  suppliedArguments?: unknown,
): ResolvedTemplateString {
  const reports: string[] = [];
  const [namespace, value] = splitIdentifier(rawId, defaultNamespace);
  const context = createContext(
    { __NAMESPACE__: namespace, __ID__: value },
    suppliedArguments,
    (message) => reports.push(message),
  );
  const placeholders = findCraftEngineTemplatePlaceholders(source);
  const sourceMap: TextRange[] = [];
  const unresolved: UnresolvedTemplateVariable[] = [];
  const escapedLiteralStarts = new Set<number>();
  let result = "";

  const appendLiteral = (start: number, end: number): void => {
    for (let index = start; index < end; ) {
      if (source[index] === "\\" && source[index + 1] === "$") {
        escapedLiteralStarts.add(result.length);
        result += "$";
        sourceMap.push({ start: index, end: index + 2 });
        index += 2;
      } else {
        result += source[index] ?? "";
        sourceMap.push({ start: index, end: index + 1 });
        index += 1;
      }
    }
  };
  const appendReplacement = (replacement: string, range: TextRange): void => {
    result += replacement;
    for (let index = 0; index < replacement.length; index += 1)
      sourceMap.push(range);
  };

  let cursor = 0;
  for (const placeholder of placeholders) {
    appendLiteral(cursor, placeholder.start);
    const reportsBefore = reports.length;
    const replacement = getArgument(context, placeholder.body);
    const range = { start: placeholder.start, end: placeholder.end };
    if (reports.length > reportsBefore) {
      const raw = source.slice(placeholder.start, placeholder.end);
      unresolved.push({ name: placeholderName(placeholder.body), raw, range });
      appendReplacement(raw, range);
    } else if (replacement !== null && replacement !== undefined) {
      appendReplacement(templateArgumentText(replacement), range);
    }
    cursor = placeholder.end;
  }
  appendLiteral(cursor, source.length);
  for (const placeholder of findCraftEngineTemplatePlaceholders(result)) {
    if (escapedLiteralStarts.has(placeholder.start)) continue;
    const first = sourceMap[placeholder.start];
    const last = sourceMap[placeholder.end - 1];
    if (!first || !last) continue;
    const range = { start: first.start, end: last.end };
    if (
      unresolved.some(
        (variable) =>
          variable.range.start === range.start &&
          variable.range.end === range.end,
      )
    )
      continue;
    unresolved.push({
      name: placeholderName(placeholder.body),
      raw: source.slice(range.start, range.end),
      range,
    });
  }
  return { value: result, sourceMap, unresolved };
}

export function substituteTree(
  value: unknown,
  context: PlaceholderContext,
  onArgument?: (name: string) => void,
  argumentSource?: TemplateArgumentSource,
  argumentPath = "",
): unknown {
  if (typeof value === "string") {
    return substituteString(
      value,
      context,
      onArgument,
      placeholderResolver(argumentSource, argumentPath, value, false),
    );
  }
  if (isUnknownArray(value))
    return value.map((item, index) =>
      substituteTree(
        item,
        context,
        onArgument,
        argumentSource,
        outputPath(argumentPath, index),
      ),
    );
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const childPath = outputPath(argumentPath, key);
    const expandedKey = templateScalarString(
      substituteString(
        key,
        context,
        onArgument,
        placeholderResolver(argumentSource, childPath, key, true),
      ),
    );
    if (expandedKey === undefined) continue;
    result[expandedKey] = substituteTree(
      item,
      context,
      onArgument,
      argumentSource,
      childPath,
    );
  }
  return result;
}

function dynamicArgument(
  get: (context: PlaceholderContext) => unknown,
): DynamicArgument {
  return { [DYNAMIC_ARGUMENT]: get };
}

function isDynamicArgument(value: unknown): value is DynamicArgument {
  return isRecord(value) && DYNAMIC_ARGUMENT in value;
}

function firstNonNull(
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): { readonly name: string; readonly value: unknown } | undefined {
  for (const name of names) {
    if (
      Object.hasOwn(value, name) &&
      value[name] !== null &&
      value[name] !== undefined
    ) {
      return { name, value: value[name] };
    }
  }
  return undefined;
}

function requiredArgumentField(
  definition: Readonly<Record<string, unknown>>,
  type: TemplateArgumentTypeId,
  names: readonly string[],
  context: PlaceholderContext,
): unknown {
  const selected = firstNonNull(definition, names);
  if (selected) return selected.value;
  context.report(
    Messages.src.config.template.expander.text0002(type, names[0] ?? "value"),
  );
  return undefined;
}

function javaIntValue(value: number | bigint): number {
  if (typeof value === "bigint") return Number(BigInt.asIntN(32, value));
  if (Number.isNaN(value)) return 0;
  if (value === Number.POSITIVE_INFINITY) return 2_147_483_647;
  if (value === Number.NEGATIVE_INFINITY) return -2_147_483_648;
  return Number(BigInt.asIntN(32, BigInt(Math.trunc(value))));
}

function integerValue(
  value: unknown,
  fallback: number,
  context: PlaceholderContext,
  field: string,
): number {
  try {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" || typeof value === "bigint")
      return javaIntValue(value);
    if (typeof value !== "string" || value.length === 0)
      throw new Error(Messages.src.config.template.expander.text0037);
    const compact = value.replaceAll("_", "");
    if (/^[+-]?\d+$/u.test(compact)) return javaIntValue(BigInt(compact));
    const evaluated = evaluateExpression(value);
    if (typeof evaluated === "boolean") return evaluated ? 1 : 0;
    if (typeof evaluated === "number" || typeof evaluated === "bigint")
      return javaIntValue(evaluated);
    throw new Error(Messages.src.config.template.expander.text0037);
  } catch {
    context.report(Messages.src.config.template.expander.text0003(field));
    return fallback;
  }
}

function booleanLike(value: unknown, context: PlaceholderContext): boolean {
  try {
    return craftEngineBoolean(value);
  } catch {
    context.report(
      Messages.src.config.template.expander.text0004(
        templateArgumentText(value),
      ),
    );
    return false;
  }
}

function evaluateNestedArgument(
  name: string,
  definition: unknown,
  context: PlaceholderContext,
  argumentSource?: TemplateArgumentSource,
  argumentPath = "",
): unknown {
  return evaluateArgumentDefinition(
    name,
    definition,
    context,
    argumentSource,
    argumentPath,
  );
}

function evaluateArgumentDefinition(
  name: string,
  definition: unknown,
  context: PlaceholderContext,
  argumentSource?: TemplateArgumentSource,
  argumentPath = "",
): unknown {
  if (
    !isRecord(definition) ||
    typeof definition.type !== "string" ||
    Object.hasOwn(definition, "__skip_template_argument__")
  ) {
    return definition;
  }

  const type = normalizeArgumentType(definition.type);
  if (!type) {
    context.report(
      Messages.src.config.template.expander.text0005(definition.type),
    );
    return null;
  }
  if (type === "null") return null;
  if (type === "plain") {
    return templateArgumentText(definition.value ?? "");
  }
  if (type === "object") return definition.value ?? null;
  if (type === "list") {
    const rawValue = requiredArgumentField(
      definition,
      type,
      ["list", "value"],
      context,
    );
    if (rawValue === undefined) return [];
    return isUnknownArray(rawValue) ? rawValue : [rawValue];
  }
  if (type === "map") {
    const rawValue = requiredArgumentField(
      definition,
      type,
      ["map", "value"],
      context,
    );
    if (isRecord(rawValue)) return rawValue;
    context.report(Messages.src.config.template.expander.text0006);
    return {};
  }
  if (type === "condition") {
    const condition = booleanLike(definition.condition ?? false, context);
    const selected = condition
      ? firstNonNull(definition, ["on_true", "on-true"])?.value
      : firstNonNull(definition, ["on_false", "on-false"])?.value;
    const selectedField = condition
      ? (firstNonNull(definition, ["on_true", "on-true"])?.name ?? "on_true")
      : (firstNonNull(definition, ["on_false", "on-false"])?.name ??
        "on_false");
    return evaluateNestedArgument(
      name,
      selected ?? null,
      context,
      argumentSource,
      outputPath(argumentPath, selectedField),
    );
  }
  if (type === "when") {
    const source = Object.hasOwn(definition, "source")
      ? definition.source
      : null;
    if (source === null || source === undefined) {
      return evaluateNestedArgument(
        name,
        definition.fallback ?? null,
        context,
        argumentSource,
        outputPath(argumentPath, "fallback"),
      );
    }
    if (!isRecord(definition.when)) {
      context.report(Messages.src.config.template.expander.text0007);
      return evaluateNestedArgument(
        name,
        definition.fallback ?? null,
        context,
        argumentSource,
        outputPath(argumentPath, "fallback"),
      );
    }
    const sourceKey = templateArgumentText(source);
    const matched = Object.hasOwn(definition.when, sourceKey);
    const branch = matched ? definition.when[sourceKey] : definition.fallback;
    return evaluateNestedArgument(
      name,
      branch ?? null,
      context,
      argumentSource,
      matched
        ? outputPath(outputPath(argumentPath, "when"), sourceKey)
        : outputPath(argumentPath, "fallback"),
    );
  }
  if (
    type === "to_upper_case" ||
    type === "to_lower_case" ||
    type === "capitalize"
  ) {
    const rawValue = requiredArgumentField(
      definition,
      type,
      ["value"],
      context,
    );
    if (rawValue === undefined || rawValue === null) return "";
    if (type === "capitalize") return titleCase(rawValue);
    const localeValue =
      definition.locale === null || definition.locale === undefined
        ? undefined
        : definition.locale;
    const locale =
      localeValue === null || localeValue === undefined
        ? undefined
        : templateArgumentText(localeValue).replaceAll("_", "-");
    const text = templateArgumentText(rawValue);
    if (type === "to_upper_case") {
      try {
        return locale ? text.toLocaleUpperCase(locale) : text.toUpperCase();
      } catch {
        return text.toUpperCase();
      }
    }
    try {
      return locale ? text.toLocaleLowerCase(locale) : text.toLowerCase();
    } catch {
      return text.toLowerCase();
    }
  }
  if (type === "self_increase_int") {
    const rawStart = requiredArgumentField(definition, type, ["from"], context);
    const rawMaximum = requiredArgumentField(definition, type, ["to"], context);
    const start = integerValue(rawStart, 0, context, "from");
    const maximum = integerValue(rawMaximum, 0, context, "to");
    const step = integerValue(definition.step ?? 1, 1, context, "step");
    const interval = integerValue(
      firstNonNull(definition, ["step_interval", "step-interval"])?.value ?? 1,
      1,
      context,
      "step_interval",
    );
    let current = start;
    let calls = 0;
    return dynamicArgument(() => {
      const output = String(current);
      calls = javaIntValue(calls + 1);
      if (interval <= 0 || calls % interval === 0) {
        current = Math.min(maximum, javaIntValue(current + step));
      }
      return output;
    });
  }

  const rawExpression = requiredArgumentField(
    definition,
    type,
    ["expression"],
    context,
  );
  const expression = typeof rawExpression === "string" ? rawExpression : "";
  if (expression.length === 0)
    context.report(Messages.src.config.template.expander.text0008);
  const rawValueType = firstNonNull(definition, [
    "value_type",
    "value-type",
  ])?.value;
  const valueType =
    typeof rawValueType === "string" ? rawValueType.toLowerCase() : "double";
  if (
    !["int", "long", "short", "double", "float", "byte", "boolean"].includes(
      valueType,
    )
  ) {
    context.report(
      Messages.src.config.template.expander.text0009(String(rawValueType)),
    );
  }
  return dynamicArgument((activeContext) => {
    try {
      const expanded = substituteString(
        expression,
        activeContext,
        undefined,
        placeholderResolver(
          argumentSource,
          outputPath(argumentPath, "expression"),
          expression,
          false,
        ),
      );
      if (expanded === null || expanded === undefined) return null;
      const evaluated = evaluateExpression(templateArgumentText(expanded));
      if (valueType === "boolean") return expressionTruthy(evaluated);
      const number = Number(evaluated);
      if (!Number.isFinite(number))
        throw new ExpressionError(
          Messages.src.config.template.expander.text0010(valueType),
          0,
        );
      const integer = Math.trunc(number);
      if (valueType === "byte") {
        const narrowed = ((integer % 256) + 256) % 256;
        return narrowed >= 128 ? narrowed - 256 : narrowed;
      }
      if (valueType === "short") {
        const narrowed = ((integer % 65_536) + 65_536) % 65_536;
        return narrowed >= 32_768 ? narrowed - 65_536 : narrowed;
      }
      if (valueType === "int" || valueType === "long") return integer;
      if (valueType === "float") return Math.fround(number);
      return number;
    } catch (error) {
      context.report(
        error instanceof ExpressionError
          ? Messages.src.config.template.expander.text0011(error.message)
          : Messages.src.config.template.expander.text0012,
      );
      return null;
    }
  });
}

function createContext(
  builtins: Readonly<Record<string, unknown>>,
  supplied: unknown,
  report: TemplateArgumentReporter,
  parent?: PlaceholderContext,
  preprocessSupplied = true,
  argumentSource?: TemplateArgumentSource,
  argumentPath = "",
): PlaceholderContext {
  const context: PlaceholderContext = {
    values: new Map(parent?.values ?? []),
    dynamicValues: new Map(parent?.dynamicValues ?? []),
    origins: new Map(parent?.origins ?? []),
    report,
  };
  for (const [name, value] of Object.entries(builtins)) {
    context.values.set(name, value);
    context.dynamicValues.delete(name);
    context.origins.delete(name);
  }
  if (isRecord(supplied)) {
  // 普通参数只替换一次, 工厂生成的内容跳过这里, 同级字段不能互相传值
    const prepared = new Map<
      string,
      {
        readonly definition: unknown;
        readonly origins: readonly string[];
        readonly path: string;
      }
    >();
    for (const [rawName, rawDefinition] of Object.entries(supplied)) {
      const definitionPath = outputPath(argumentPath, rawName);
      const origins = new Set<string>();
      const recordOrigin = (name: string): void => {
        for (const origin of context.origins.get(name) ?? [])
          origins.add(origin);
      };
      const expandedName = preprocessSupplied
        ? templateScalarString(
            substituteString(
              rawName,
              context,
              recordOrigin,
              placeholderResolver(
                argumentSource,
                definitionPath,
                rawName,
                true,
              ),
            ),
          )
        : rawName;
      if (expandedName === undefined) continue;
      const definition = preprocessSupplied
        ? substituteTree(
            rawDefinition,
            context,
            recordOrigin,
            argumentSource,
            definitionPath,
          )
        : rawDefinition;
      prepared.set(expandedName, {
        definition,
        origins: preprocessSupplied ? [...origins] : [rawName],
        path: definitionPath,
      });
    }
    for (const [name, { definition, origins, path }] of prepared) {
      if (context.values.has(name) || context.dynamicValues.has(name)) continue;
      const value = evaluateArgumentDefinition(
        name,
        definition,
        context,
        argumentSource,
        path,
      );
      if (isDynamicArgument(value))
        context.dynamicValues.set(name, value[DYNAMIC_ARGUMENT]);
      else context.values.set(name, value);
      if (origins.length > 0) context.origins.set(name, origins);
      else context.origins.delete(name);
    }
  }
  return context;
}

function sourceFor(
  file: ParsedPackFile,
  section: ParsedSection,
  rawId: string,
  kind: ConfigurationSourceKind,
): ConfigurationSource {
  const keyRange = section.ranges.keys.get(rawId) ?? section.keyRange;
  const entryRange = section.ranges.values.get(rawId) ?? section.valueRange;
  const fieldKeyRanges = new Map<string, TextRange>();
  const fieldValueRanges = new Map<string, TextRange>();
  for (const [path, range] of section.ranges.keys) {
    if (path.startsWith(`${rawId}.`))
      fieldKeyRanges.set(path.slice(rawId.length + 1), range);
  }
  for (const [path, range] of section.ranges.values) {
    if (path.startsWith(`${rawId}.`))
      fieldValueRanges.set(path.slice(rawId.length + 1), range);
  }
  return {
    uri: file.parsed.uri,
    idRange: keyRange,
    entryRange,
    fieldKeyRanges,
    fieldValueRanges,
    pack: file.pack,
    kind,
    sectionKey: section.key,
  };
}

function factoryInstanceSource(
  file: ParsedPackFile,
  section: ParsedSection,
  instancePath: string,
): ConfigurationSource {
  const keyEntries = [...section.ranges.keys]
    .filter(
      ([path]) => path === instancePath || path.startsWith(`${instancePath}.`),
    )
    .sort((left, right) => left[1].start - right[1].start);
  const valueEntries = [...section.ranges.values]
    .filter(
      ([path]) => path === instancePath || path.startsWith(`${instancePath}.`),
    )
    .sort((left, right) => left[1].start - right[1].start);
  const exactKey = section.ranges.keys.get(instancePath);
  const exactValue = section.ranges.values.get(instancePath);
  const idRange = exactKey ?? keyEntries[0]?.[1] ?? section.keyRange;
  const allRanges = [
    ...keyEntries.map(([, range]) => range),
    ...valueEntries.map(([, range]) => range),
  ];
  const entryRange =
    exactValue ??
    (allRanges.length === 0
      ? idRange
      : {
          start: Math.min(...allRanges.map((range) => range.start)),
          end: Math.max(...allRanges.map((range) => range.end)),
        });
  const fieldKeyRanges = new Map<string, TextRange>();
  const fieldValueRanges = new Map<string, TextRange>();
  for (const [path, range] of keyEntries) {
    if (path.startsWith(`${instancePath}.`))
      fieldKeyRanges.set(path.slice(instancePath.length + 1), range);
  }
  for (const [path, range] of valueEntries) {
    if (path.startsWith(`${instancePath}.`))
      fieldValueRanges.set(path.slice(instancePath.length + 1), range);
  }
  return {
    uri: file.parsed.uri,
    idRange,
    entryRange,
    fieldKeyRanges,
    fieldValueRanges,
    pack: file.pack,
    kind: "factory",
    sectionKey: section.key,
  };
}

function factoryBlueprintSource(
  file: ParsedPackFile,
  section: ParsedSection,
  blueprintRoot: string,
  blueprintSectionKey: string,
  rawId?: string,
): ConfigurationSource {
  const root = [blueprintRoot, blueprintSectionKey, rawId]
    .filter((entry) => entry !== undefined)
    .join(".");
  const keyRange =
    section.ranges.keys.get(root) ??
    section.ranges.keys.get(`${blueprintRoot}.${blueprintSectionKey}`) ??
    section.keyRange;
  const entryRange =
    section.ranges.values.get(root) ??
    section.ranges.values.get(`${blueprintRoot}.${blueprintSectionKey}`) ??
    section.valueRange;
  const fieldKeyRanges = new Map<string, TextRange>();
  const fieldValueRanges = new Map<string, TextRange>();
  for (const [path, range] of section.ranges.keys) {
    if (path.startsWith(`${root}.`))
      fieldKeyRanges.set(path.slice(root.length + 1), range);
  }
  for (const [path, range] of section.ranges.values) {
    if (path.startsWith(`${root}.`))
      fieldValueRanges.set(path.slice(root.length + 1), range);
  }
  return {
    uri: file.parsed.uri,
    idRange: keyRange,
    entryRange,
    fieldKeyRanges,
    fieldValueRanges,
    pack: file.pack,
    kind: "factory",
    sectionKey: blueprintSectionKey,
  };
}

function factoryResourceSource(
  file: ParsedPackFile,
  section: ParsedSection,
  blueprintRoot: string,
  blueprintSectionKey: string,
  rawId: string,
  instanceSource: ConfigurationSource,
): ConfigurationSource {
  const blueprint = factoryBlueprintSource(
    file,
    section,
    blueprintRoot,
    blueprintSectionKey,
    rawId,
  );
  for (const placeholder of findCraftEngineTemplatePlaceholders(rawId)) {
    const name = placeholderName(placeholder.body);
    const range =
      instanceSource.fieldKeyRanges.get(name) ??
      instanceSource.fieldValueRanges.get(name);
    if (range) return { ...blueprint, idRange: range };
  }
  return blueprint;
}

function issueAt(
  source: ImageSource,
  code: string,
  message: string,
  location?: TextRange | string,
): CoreIssue {
  const range =
    typeof location === "string"
      ? (source.fieldValueRanges.get(location) ??
        source.fieldKeyRanges.get(location) ??
        source.entryRange)
      : (location ?? source.entryRange);
  return { code, message, severity: "error", uri: source.uri, range };
}

function templateKey(resourcesRoot: string, id: string): string {
  return `${canonicalTemplatePath(resourcesRoot)}\u0000${id}`;
}

function canonicalTemplatePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}

function sameTemplatePackContext(left: PackSource, right: PackSource): boolean {
  return (
    canonicalTemplatePath(left.resourcesRoot) ===
      canonicalTemplatePath(right.resourcesRoot) &&
    canonicalTemplatePath(left.configurationRoot) ===
      canonicalTemplatePath(right.configurationRoot)
  );
}

function templateDefinitionScope(pack: PackSource): string {
  const root = canonicalTemplatePath(pack.resourcesRoot);
  return pack.active
    ? `${root}\u0000active`
    : `${root}\u0000inactive\u0000${canonicalTemplatePath(pack.configurationRoot)}`;
}

  // 未启用的文件可以使用同包模板, 但不能把自己的模板提供给已启用配置
export function configurationTemplateVisibleToPack(
  template: ConfigurationTemplateDefinition,
  owner: PackSource,
): boolean {
  if (
    canonicalTemplatePath(template.pack.resourcesRoot) !==
    canonicalTemplatePath(owner.resourcesRoot)
  )
    return false;
  return (
    template.pack.active ||
    (!owner.active && sameTemplatePackContext(template.pack, owner))
  );
}

export function configurationTemplatesForPack(
  templates: readonly ConfigurationTemplateDefinition[],
  owner: PackSource,
): readonly ConfigurationTemplateDefinition[] {
  const effective = new Map<string, ConfigurationTemplateDefinition>();
  for (const template of templates) {
    if (
      !template.pack.active ||
      !configurationTemplateVisibleToPack(template, owner)
    )
      continue;
    const key = templateKey(template.pack.resourcesRoot, template.id);
    if (!effective.has(key)) effective.set(key, template);
  }
  if (!owner.active) {
    for (const template of templates) {
      if (
        template.pack.active ||
        !sameTemplatePackContext(template.pack, owner)
      )
        continue;
      effective.set(
        templateKey(template.pack.resourcesRoot, template.id),
        template,
      );
    }
  }
  return [...effective.values()];
}

function templateDirectoryForOwner(
  catalog: TemplateCatalog,
  owner: PackSource,
): ReadonlyMap<string, TemplateDefinition> {
  const visible = new Map<string, TemplateDefinition>();
  for (const definition of configurationTemplatesForPack(
    catalog.definitions,
    owner,
  )) {
    visible.set(
      templateKey(definition.pack.resourcesRoot, definition.id),
      definition as TemplateDefinition,
    );
  }
  return visible;
}

function mergeTemplateMaps(
  target: Record<string, unknown>,
  addition: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  for (const [rawKey, value] of Object.entries(addition)) {
    if (rawKey.length > 2 && rawKey.startsWith("$$")) {
      target[rawKey.slice(1)] = value;
      continue;
    }
    const previous = target[rawKey];
    if (isRecord(previous) && isRecord(value)) {
      mergeTemplateMaps(previous, value);
    } else if (isUnknownArray(previous) && isUnknownArray(value)) {
      (previous as unknown[]).push(...(value as unknown[]));
    } else {
      target[rawKey] = value;
    }
  }
  return target;
}

function templateScalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  return undefined;
}

function outputPath(parent: string, child: string | number): string {
  return parent ? `${parent}.${child}` : String(child);
}

function scalarRangeForArgument(
  argumentSource: TemplateArgumentSource,
  path: string,
  key: boolean,
): TextRange | undefined {
  if (path.length === 0)
    return key
      ? argumentSource.source.idRange
      : argumentSource.source.entryRange;
  return key
    ? argumentSource.source.fieldKeyRanges.get(path)
    : argumentSource.source.fieldValueRanges.get(path);
}

function placeholderResolver(
  argumentSource: TemplateArgumentSource | undefined,
  path: string,
  scalar: string,
  key: boolean,
): PlaceholderLocationResolver | undefined {
  if (!argumentSource) return undefined;
  const scalarRange = scalarRangeForArgument(argumentSource, path, key);
  if (!scalarRange) return undefined;
  const rawScalar = argumentSource.text.slice(
    scalarRange.start,
    scalarRange.end,
  );
  return (relativeRange): TemplateArgumentIssueLocation | undefined => {
    const needle = scalar.slice(relativeRange.start, relativeRange.end);
    if (needle.length === 0) return undefined;
    let ordinal = 0;
    let decodedCursor = 0;
    while (decodedCursor < relativeRange.start) {
      const occurrence = scalar.indexOf(needle, decodedCursor);
      if (occurrence < 0 || occurrence >= relativeRange.start) break;
      ordinal += 1;
      decodedCursor = occurrence + needle.length;
    }
    let rawOffset = -1;
    let cursor = 0;
    for (let index = 0; index <= ordinal; index += 1) {
      rawOffset = rawScalar.indexOf(needle, cursor);
      if (rawOffset < 0) break;
      cursor = rawOffset + needle.length;
    }
    if (rawOffset < 0) return undefined;
    return {
      uri: argumentSource.source.uri,
      range: {
        start: scalarRange.start + rawOffset,
        end: scalarRange.start + rawOffset + needle.length,
      },
    };
  };
}

function tracedSubstitution(
  source: string,
  context: PlaceholderContext,
  placeholderLocation?: PlaceholderLocationResolver,
): { readonly value: unknown; readonly origins: readonly string[] } {
  const origins = new Set<string>();
  const value = substituteString(
    source,
    context,
    (name) => {
      for (const origin of context.origins.get(name) ?? []) origins.add(origin);
    },
    placeholderLocation,
  );
  return { value, origins: [...origins] };
}

function recordSubstitution(
  target: Map<string, readonly string[]> | undefined,
  path: string,
  origins: readonly string[],
): void {
  if (!target || path.length === 0 || origins.length === 0) return;
  target.set(path, origins);
}

function processTemplateValue(
  rawId: string,
  raw: unknown,
  source: ImageSource,
  templates: ReadonlyMap<string, TemplateDefinition>,
  issues: CoreIssue[],
  context: PlaceholderContext,
  stack: readonly string[] = [],
  node = rawId,
  trace?: TemplateSubstitutionTrace,
  fieldPath = "",
  sourcePath = fieldPath,
  invocationFallbackRange?: TextRange,
  argumentSource?: TemplateArgumentSource,
  argumentPath = sourcePath,
): unknown {
  if (typeof raw === "string") {
    const processed = tracedSubstitution(
      raw,
      context,
      placeholderResolver(argumentSource, argumentPath, raw, false),
    );
    recordSubstitution(trace?.fieldValues, fieldPath, processed.origins);
    return processed.value;
  }
  if (isUnknownArray(raw)) {
    return raw.map((value, index) =>
      processTemplateValue(
        rawId,
        value,
        source,
        templates,
        issues,
        context,
        stack,
        `${node}[${index}]`,
        trace,
        outputPath(fieldPath, index),
        outputPath(sourcePath, index),
        invocationFallbackRange,
        argumentSource,
        outputPath(argumentPath, index),
      ),
    );
  }
  if (!isRecord(raw)) return raw;

  const rawTemplate = raw.template ?? raw.templates;
  if (rawTemplate === null || rawTemplate === undefined) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const rawChildPath = outputPath(argumentPath, key);
      const processedKey = tracedSubstitution(
        key,
        context,
        placeholderResolver(argumentSource, rawChildPath, key, true),
      );
      const outputKey = templateScalarString(processedKey.value);
      if (outputKey === undefined) continue;
      const childPath = outputPath(fieldPath, outputKey);
      recordSubstitution(trace?.fieldKeys, childPath, processedKey.origins);
      result[outputKey] = processTemplateValue(
        rawId,
        value,
        source,
        templates,
        issues,
        context,
        stack,
        `${node}.${key}`,
        trace,
        childPath,
        outputPath(sourcePath, key),
        invocationFallbackRange,
        argumentSource,
        rawChildPath,
      );
    }
    return result;
  }

  const templateField =
    raw.template !== null && raw.template !== undefined
      ? "template"
      : "templates";
  const templatePath = outputPath(sourcePath, templateField);
  const argumentTemplatePath = outputPath(argumentPath, templateField);
  const childContext = createContext(
    {},
    raw.arguments,
    context.report,
    context,
    true,
    argumentSource,
    outputPath(argumentPath, "arguments"),
  );
  const processedTemplates: unknown[] = [];
  for (const [index, rawName] of (isUnknownArray(rawTemplate)
    ? rawTemplate
    : rawTemplate === null || rawTemplate === undefined
      ? []
      : [rawTemplate]
  ).entries()) {
    const invocationPath = isUnknownArray(rawTemplate)
      ? outputPath(templatePath, index)
      : templatePath;
    const invocationRange =
      source.fieldValueRanges.get(invocationPath) ??
      source.fieldKeyRanges.get(invocationPath) ??
      invocationFallbackRange ??
      source.entryRange;
    const processedName = processTemplateValue(
      rawId,
      rawName,
      source,
      templates,
      issues,
      childContext,
      stack,
      `${node}.template[${index}]`,
      undefined,
      "",
      "",
      undefined,
      argumentSource,
      isUnknownArray(rawTemplate)
        ? outputPath(argumentTemplatePath, index)
        : argumentTemplatePath,
    );
    const outputName = templateScalarString(processedName);
    if (outputName === undefined) continue;
    const name = makeIdentifier(outputName, "minecraft");
    if (stack.includes(name)) {
      issues.push(
        issueAt(
          source,
          "template-cycle",
          Messages.src.config.template.expander.text0013(
            [...stack, name].join(" -> "),
          ),
          invocationRange,
        ),
      );
      continue;
    }
    const definition = templates.get(
      templateKey(source.pack.resourcesRoot, name),
    );
    if (!definition) {
      issues.push(
        issueAt(
          source,
          "unknown-template",
          Messages.src.config.template.expander.text0014(name),
          invocationRange,
        ),
      );
      continue;
    }
    const processed = processTemplateValue(
      rawId,
      definition.value,
      source,
      templates,
      issues,
      childContext,
      [...stack, name],
      `${node}.template[${index}]`,
      trace,
      fieldPath,
      sourcePath,
      invocationRange,
      {
        source: sourceFor(
          definition.file,
          definition.section,
          definition.rawId,
          "template",
        ),
        text: definition.file.parsed.text,
      },
      "",
    );
    if (processed !== null && processed !== undefined)
      processedTemplates.push(processed);
  }

  const rawOverride = raw.overrides;
  const override =
    rawOverride === undefined
      ? undefined
      : processTemplateValue(
          rawId,
          rawOverride,
          source,
          templates,
          issues,
          childContext,
          stack,
          `${node}.overrides`,
          trace,
          fieldPath,
          outputPath(sourcePath, "overrides"),
          invocationFallbackRange,
          argumentSource,
          outputPath(argumentPath, "overrides"),
        );
  const rawMerge = raw.merges;
  let merge =
    rawMerge === undefined
      ? undefined
      : processTemplateValue(
          rawId,
          rawMerge,
          source,
          templates,
          issues,
          childContext,
          stack,
          `${node}.merges`,
          trace,
          fieldPath,
          outputPath(sourcePath, "merges"),
          invocationFallbackRange,
          argumentSource,
          outputPath(argumentPath, "merges"),
        );

  const ordinaryRaw = Object.fromEntries(
    Object.entries(raw).filter(
      ([key]) =>
        key !== "template" &&
        key !== "templates" &&
        key !== "arguments" &&
        key !== "overrides" &&
        key !== "merges",
    ),
  );
  if (Object.keys(ordinaryRaw).length > 0) {
    const ordinary: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(ordinaryRaw)) {
  // 合并后的键按调用处读取, 值可以使用当前参数
      const rawChildPath = outputPath(argumentPath, key);
      const processedKey = tracedSubstitution(
        key,
        context,
        placeholderResolver(argumentSource, rawChildPath, key, true),
      );
      const outputKey = templateScalarString(processedKey.value);
      if (outputKey === undefined) continue;
      const childPath = outputPath(fieldPath, outputKey);
      recordSubstitution(trace?.fieldKeys, childPath, processedKey.origins);
      ordinary[outputKey] = processTemplateValue(
        rawId,
        value,
        source,
        templates,
        issues,
        childContext,
        stack,
        `${node}.${key}`,
        trace,
        childPath,
        outputPath(sourcePath, key),
        invocationFallbackRange,
        argumentSource,
        rawChildPath,
      );
    }
    if (isRecord(merge)) Object.assign(ordinary, merge);
    merge = ordinary;
  }

  if (processedTemplates.length === 0) {
    if (isRecord(override)) {
      const result = { ...override };
      if (isRecord(merge)) mergeTemplateMaps(result, merge);
      return result;
    }
    if (isUnknownArray(override)) {
      const overrideValues = override;
      return isUnknownArray(merge)
        ? [...overrideValues, ...merge]
        : [...overrideValues];
    }
    return override ?? merge ?? null;
  }

  const first = processedTemplates[0];
  if (isRecord(first)) {
    const result: Record<string, unknown> = {};
    for (const processed of processedTemplates)
      if (isRecord(processed)) mergeTemplateMaps(result, processed);
    if (isRecord(override)) Object.assign(result, override);
    if (isRecord(merge)) mergeTemplateMaps(result, merge);
    return result;
  }
  if (isUnknownArray(first)) {
    const result: unknown[] = [];
    for (const processed of processedTemplates)
      if (isUnknownArray(processed)) result.push(...processed);
    if (isUnknownArray(override)) result.splice(0, result.length, ...override);
    if (isUnknownArray(merge)) result.push(...merge);
    return result;
  }
  return override ?? merge ?? processedTemplates.at(-1);
}

function resolveTemplateValueEntry(
  rawId: string,
  raw: unknown,
  source: ImageSource,
  templates: ReadonlyMap<string, TemplateDefinition>,
  issues: CoreIssue[],
  parentContext?: PlaceholderContext,
  trace?: TemplateSubstitutionTrace,
  argumentSource?: TemplateArgumentSource,
): unknown {
  const [namespace, value] = splitIdentifier(rawId, source.pack.namespace);
  const report: TemplateArgumentReporter = (message, location): void => {
    const issue = issueAt(
      source,
      "template-argument",
      message,
      location?.range,
    );
    issues.push(location ? { ...issue, uri: location.uri } : issue);
  };
  const context = createContext(
    { __NAMESPACE__: namespace, __ID__: value },
    undefined,
    report,
    parentContext,
  );
  return processTemplateValue(
    rawId,
    raw,
    source,
    templates,
    issues,
    context,
    [],
    rawId,
    trace,
    "",
    "",
    undefined,
    argumentSource,
    "",
  );
}

function resolveTemplateEntry(
  rawId: string,
  raw: Readonly<Record<string, unknown>>,
  source: ImageSource,
  templates: ReadonlyMap<string, TemplateDefinition>,
  issues: CoreIssue[],
  parentContext?: PlaceholderContext,
  trace?: TemplateSubstitutionTrace,
  argumentSource?: TemplateArgumentSource,
): Readonly<Record<string, unknown>> {
  const processed = resolveTemplateValueEntry(
    rawId,
    raw,
    source,
    templates,
    issues,
    parentContext,
    trace,
    argumentSource,
  );
  return isRecord(processed) ? processed : {};
}

function resourceKind(
  sectionType: string,
): ConfigurationCandidateInput["kind"] | undefined {
  switch (getSectionFamily(sectionType)?.canonical) {
    case "images":
      return "image";
    case "items":
      return "item";
    case "blocks":
      return "block";
    case "furniture":
      return "furniture";
    case "loot":
      return "loot";
    case "loot-sources":
      return "vanilla-loot";
    case "equipments":
      return "equipment";
    case "jukebox-songs":
      return "jukebox-song";
    case "sounds":
      return "sound-event";
    case "recipes":
      return "recipe";
    case "categories":
      return "category";
    case "emojis":
      return "emoji";
    case "paintings":
      return "painting";
    case "configured-feature":
      return "configured-feature";
    case "placed-feature":
      return "placed-feature";
    case "advancements":
      return "advancement";
    case "entities":
      return "entity";
    case "attributes":
      return "attribute";
    case "attribute-operations":
      return "attribute-operation";
    case "equipment-sets":
      return "equipment-set";
    case "atlases":
      return "atlas";
    default:
      return undefined;
  }
}

function expandedPaths(
  value: unknown,
  prefix = "",
  result = new Set<string>(),
): ReadonlySet<string> {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      result.add(path);
      expandedPaths(child, path, result);
    }
  } else if (isUnknownArray(value)) {
    value.forEach((child, index) =>
      expandedPaths(child, `${prefix}.${index}`, result),
    );
  }
  return result;
}

function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (isRecord(current)) current = current[part];
    else if (isUnknownArray(current) && /^\d+$/u.test(part))
      current = current[Number(part)];
    else return undefined;
  }
  return current;
}

function sameTemplateValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (isUnknownArray(left) && isUnknownArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => sameTemplateValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && sameTemplateValue(left[key], right[key]),
      )
    );
  }
  return false;
}

interface TemplateInvocationSource {
  readonly path: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly range: TextRange;
}

function collectTemplateInvocationSources(
  value: unknown,
  source: ConfigurationSource,
  path = "",
  result: TemplateInvocationSource[] = [],
): readonly TemplateInvocationSource[] {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectTemplateInvocationSources(
        entry,
        source,
        path ? `${path}.${index}` : String(index),
        result,
      ),
    );
    return result;
  }
  if (!isRecord(value)) return result;
  const templateField = Object.hasOwn(value, "template")
    ? "template"
    : Object.hasOwn(value, "templates")
      ? "templates"
      : undefined;
  if (templateField) {
    const templatePath = path ? `${path}.${templateField}` : templateField;
    const templateValue = value[templateField];
    const range =
      isUnknownArray(templateValue) && templateValue.length === 1
        ? (source.fieldValueRanges.get(`${templatePath}.0`) ??
          source.fieldValueRanges.get(templatePath))
        : source.fieldValueRanges.get(templatePath);
    if (range) result.push({ path, raw: value, range });
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "template" || key === "templates") continue;
    collectTemplateInvocationSources(
      child,
      source,
      path ? `${path}.${key}` : key,
      result,
    );
  }
  return result;
}

function prefixedPath(prefix: string, suffix: string): string {
  return prefix && suffix ? `${prefix}.${suffix}` : prefix || suffix;
}

function remapExpandedSource(
  source: ConfigurationSource,
  raw: Readonly<Record<string, unknown>>,
  expanded: Readonly<Record<string, unknown>>,
): ConfigurationSource {
  const keyRanges = new Map(source.fieldKeyRanges);
  const valueRanges = new Map(source.fieldValueRanges);
  const invocations = collectTemplateInvocationSources(raw, source)
    .slice()
    .sort((left, right) => right.path.length - left.path.length);
  for (const outputPath of expandedPaths(expanded)) {
    if (keyRanges.has(outputPath) || valueRanges.has(outputPath)) continue;
    const leaf = outputPath.split(".").at(-1) ?? outputPath;
    const expandedValue = valueAtPath(expanded, outputPath);
    const candidates = invocations
      .filter(
        (invocation) =>
          invocation.path === "" ||
          outputPath === invocation.path ||
          outputPath.startsWith(`${invocation.path}.`),
      )
      .flatMap((invocation) => {
        const relativePath =
          invocation.path === ""
            ? outputPath
            : outputPath === invocation.path
              ? ""
              : outputPath.slice(invocation.path.length + 1);
        const argumentsValue = isRecord(invocation.raw.arguments)
          ? invocation.raw.arguments
          : undefined;
        const matchingArguments = argumentsValue
          ? Object.entries(argumentsValue)
              .filter(([, argument]) =>
                sameTemplateValue(argument, expandedValue),
              )
              .map(([name]) =>
                prefixedPath(invocation.path, `arguments.${name}`),
              )
          : [];
        return [
          prefixedPath(
            invocation.path,
            prefixedPath("overrides", relativePath),
          ),
          prefixedPath(invocation.path, prefixedPath("merges", relativePath)),
          ...(argumentsValue && Object.hasOwn(argumentsValue, leaf)
            ? [prefixedPath(invocation.path, `arguments.${leaf}`)]
            : []),
          ...matchingArguments,
        ];
      });
    const keySource = candidates.find((candidate) =>
      source.fieldKeyRanges.has(candidate),
    );
    const valueSource = candidates.find((candidate) =>
      source.fieldValueRanges.has(candidate),
    );
    const keyRange = keySource
      ? source.fieldKeyRanges.get(keySource)
      : undefined;
    const valueRange = valueSource
      ? source.fieldValueRanges.get(valueSource)
      : undefined;
    if (keyRange) keyRanges.set(outputPath, keyRange);
    if (valueRange) valueRanges.set(outputPath, valueRange);
  }

  const templateFallbacks = new Map<string, TextRange>();
  const invocationRoots = new Set<string>();
  for (const invocation of [...invocations].reverse()) {
    const output = invocation.path
      ? valueAtPath(expanded, invocation.path)
      : expanded;
    if (output === undefined) continue;
    if (invocation.path) {
      templateFallbacks.set(invocation.path, invocation.range);
      invocationRoots.add(invocation.path);
    }
    for (const outputPath of expandedPaths(output, invocation.path)) {
      templateFallbacks.set(outputPath, invocation.range);
    }
  }
  for (const [outputPath, range] of templateFallbacks) {
    if (invocationRoots.has(outputPath) || !keyRanges.has(outputPath))
      keyRanges.set(outputPath, range);
    if (invocationRoots.has(outputPath) || !valueRanges.has(outputPath))
      valueRanges.set(outputPath, range);
  }
  return {
    ...source,
    fieldKeyRanges: keyRanges,
    fieldValueRanges: valueRanges,
  };
}

function overlayFactoryArgumentRanges(
  source: ConfigurationSource,
  trace: TemplateSubstitutionTrace,
  instanceSource: ConfigurationSource,
): ConfigurationSource {
  const fieldKeyRanges = new Map(source.fieldKeyRanges);
  const fieldValueRanges = new Map(source.fieldValueRanges);
  const rangeFor = (origins: readonly string[]): TextRange | undefined => {
    for (const origin of origins) {
      const range =
        instanceSource.fieldValueRanges.get(origin) ??
        instanceSource.fieldKeyRanges.get(origin);
      if (range) return range;
    }
    return undefined;
  };
  for (const [path, origins] of trace.fieldKeys) {
    const range = rangeFor(origins);
    if (range) fieldKeyRanges.set(path, range);
  }
  for (const [path, origins] of trace.fieldValues) {
    const range = rangeFor(origins);
    if (range) fieldValueRanges.set(path, range);
  }
  return { ...source, fieldKeyRanges, fieldValueRanges };
}

function addConfigurationMap(
  map: unknown,
  file: ParsedPackFile,
  section: ParsedSection,
  kind: ConfigurationSourceKind,
  resource: ConfigurationCandidateInput["kind"],
  templates: ReadonlyMap<string, TemplateDefinition>,
  configurations: ConfigurationCandidateInput[],
  issues: CoreIssue[],
  sourceOverride?:
    | ConfigurationSource
    | ((rawId: string) => ConfigurationSource),
  parentContext?: PlaceholderContext,
  argumentSource?: ConfigurationSource,
  idSourceOverride?:
    | ConfigurationSource
    | ((rawId: string) => ConfigurationSource),
): void {
  if (!isRecord(map)) return;
  for (const [sourceRawId, raw] of Object.entries(map)) {
    const overrideSource =
      typeof sourceOverride === "function"
        ? sourceOverride(sourceRawId)
        : sourceOverride;
    const fallbackSource =
      overrideSource ?? sourceFor(file, section, sourceRawId, kind);
    const idSource =
      typeof idSourceOverride === "function"
        ? idSourceOverride(sourceRawId)
        : (idSourceOverride ?? fallbackSource);
    const hasFactoryArguments =
      parentContext &&
      (parentContext.values.size > 0 || parentContext.dynamicValues.size > 0);
    const expandedId = hasFactoryArguments
      ? substituteString(
          sourceRawId,
          parentContext,
          undefined,
          placeholderResolver(
            { source: idSource, text: file.parsed.text },
            "",
            sourceRawId,
            true,
          ),
        )
      : sourceRawId;
    const rawId = templateScalarString(expandedId);
    if (rawId === undefined) {
      issues.push(
        issueAt(
          fallbackSource,
          `${resource}-id`,
          Messages.src.config.template.expander.text0015(resource),
        ),
      );
      continue;
    }
    const rawTemplates = isRecord(raw)
      ? (raw.template ?? raw.templates)
      : undefined;
    const sourceKind =
      kind === "factory"
        ? "factory"
        : typeof rawTemplates === "string" ||
            (isUnknownArray(rawTemplates) &&
              rawTemplates.some((item) => typeof item === "string"))
          ? "template"
          : kind;
    const source =
      overrideSource ?? sourceFor(file, section, sourceRawId, sourceKind);
    if (!isRecord(raw)) {
      const labels: Readonly<
        Record<ConfigurationCandidateInput["kind"], string>
      > = {
        image: Messages.src.config.template.expander.text0016,
        item: Messages.src.config.template.expander.text0017,
        block: Messages.src.config.template.expander.text0018,
        furniture: Messages.src.config.template.expander.text0019,
        loot: Messages.src.config.template.expander.text0020,
        "vanilla-loot": Messages.src.config.template.expander.text0021,
        equipment: Messages.src.config.template.expander.text0022,
        "jukebox-song": Messages.src.config.template.expander.text0023,
        "sound-event": Messages.src.config.template.expander.text0024,
        recipe: Messages.src.config.template.expander.text0025,
        category: Messages.src.config.template.expander.text0026,
        emoji: Messages.src.config.template.expander.text0038,
        painting: Messages.src.config.template.expander.text0027,
        "configured-feature": Messages.src.config.template.expander.text0039,
        "placed-feature": Messages.src.config.template.expander.text0040,
        advancement: Messages.src.config.template.expander.text0041,
        entity: "实体",
        attribute: "自定义属性",
        "attribute-operation": "属性操作",
        "equipment-set": "装备套装",
        atlas: "纹理图集",
      };
      issues.push(
        issueAt(
          source,
          `${resource}-map`,
          Messages.src.config.template.expander.text0028(
            labels[resource],
            rawId,
          ),
        ),
      );
      continue;
    }
    const trace: TemplateSubstitutionTrace | undefined = argumentSource
      ? { fieldKeys: new Map(), fieldValues: new Map() }
      : undefined;
    const value = resolveTemplateEntry(
      rawId,
      raw,
      source,
      templates,
      issues,
      parentContext,
      trace,
      { source, text: file.parsed.text },
    );
    const remapped = remapExpandedSource(source, raw, value);
    configurations.push({
      kind: resource,
      rawId,
      value,
      source:
        trace && argumentSource
          ? overlayFactoryArgumentRanges(remapped, trace, argumentSource)
          : remapped,
    });
  }
}

interface ExpandedIdValueMap {
  readonly value: Readonly<Record<string, unknown>>;
  readonly sources: ReadonlyMap<string, ConfigurationSource>;
}

function expandIdValueMap(
  map: Readonly<Record<string, unknown>>,
  file: ParsedPackFile,
  section: ParsedSection,
  templates: ReadonlyMap<string, TemplateDefinition>,
  issues: CoreIssue[],
  context: PlaceholderContext | undefined,
  sourceOverride?:
    | ConfigurationSource
    | ((rawId: string) => ConfigurationSource),
): ExpandedIdValueMap {
  const result: Record<string, unknown> = {};
  const sources = new Map<string, ConfigurationSource>();
  for (const [sourceRawId, raw] of Object.entries(map)) {
    const source =
      typeof sourceOverride === "function"
        ? sourceOverride(sourceRawId)
        : (sourceOverride ?? sourceFor(file, section, sourceRawId, "direct"));
    const hasFactoryArguments =
      context && (context.values.size > 0 || context.dynamicValues.size > 0);
    const expandedId = hasFactoryArguments
      ? substituteString(
          sourceRawId,
          context,
          undefined,
          placeholderResolver(
            { source, text: file.parsed.text },
            "",
            sourceRawId,
            true,
          ),
        )
      : sourceRawId;
    const rawId = templateScalarString(expandedId);
    if (rawId === undefined) {
      issues.push(
        issueAt(
          source,
          "global-variable-id",
          Messages.src.config.template.expander.text0029,
        ),
      );
      continue;
    }
    result[rawId] = resolveTemplateValueEntry(
      rawId,
      raw,
      source,
      templates,
      issues,
      context,
      undefined,
      { source, text: file.parsed.text },
    );
    sources.set(rawId, source);
  }
  return { value: result, sources };
}

function opaqueIdValueSource(
  sectionSource: ConfigurationSource,
  sources: ReadonlyMap<string, ConfigurationSource>,
): ConfigurationSource {
  const fieldKeyRanges = new Map(sectionSource.fieldKeyRanges);
  const fieldValueRanges = new Map(sectionSource.fieldValueRanges);
  for (const [rawId, source] of sources) {
    fieldKeyRanges.set(rawId, source.idRange);
    fieldValueRanges.set(rawId, source.entryRange);
    for (const [path, range] of source.fieldKeyRanges)
      fieldKeyRanges.set(`${rawId}.${path}`, range);
    for (const [path, range] of source.fieldValueRanges)
      fieldValueRanges.set(`${rawId}.${path}`, range);
  }
  return { ...sectionSource, fieldKeyRanges, fieldValueRanges };
}

function collectTemplates(
  files: readonly ParsedPackFile[],
  issues: CoreIssue[],
): TemplateCatalog {
  const scopedTemplates = new Map<string, Map<string, TemplateDefinition>>();
  const definitions: TemplateDefinition[] = [];
  for (const file of files) {
    for (const section of file.parsed.sections) {
      if (
        getSectionFamily(section.type)?.canonical !== "templates" ||
        !isRecord(section.value)
      )
        continue;
      for (const [rawId, value] of Object.entries(section.value)) {
        const id = makeIdentifier(rawId, file.pack.namespace);
        const entryRange =
          section.ranges.values.get(rawId) ?? section.valueRange;
        const key = templateKey(file.pack.resourcesRoot, id);
        const scope = templateDefinitionScope(file.pack);
        let templates = scopedTemplates.get(scope);
        if (!templates) {
          templates = new Map();
          scopedTemplates.set(scope, templates);
        }
        const previous = templates.get(key);
        if (previous) {
          issues.push({
            code: "duplicate-template-id",
            message: Messages.src.config.template.expander.text0031(id),
            severity: "warning",
            uri: file.parsed.uri,
            range: section.ranges.keys.get(rawId) ?? section.keyRange,
            related: [
              {
                message: previous.file.pack.name,
                uri: previous.file.parsed.uri,
                range: previous.entryRange,
              },
            ],
          });
          continue;
        }
        const definition: TemplateDefinition = {
          rawId,
          id,
          value,
          uri: file.parsed.uri,
          keyRange: section.ranges.keys.get(rawId) ?? section.keyRange,
          entryRange,
          pack: file.pack,
          file,
          section,
        };
        templates.set(key, definition);
        definitions.push(definition);
      }
    }
  }
  return { definitions };
}

  // 工厂条目已在工作区展开, 不能再次使用会变化的参数
export function expandTemplateIdValueSections(
  files: readonly ParsedPackFile[],
  canonicalSection: string,
): ExpandedTemplateIdValueResult {
  const ordered = [...files].sort(
    (left, right) =>
      left.pack.loadOrder - right.pack.loadOrder ||
      left.parsed.uri.localeCompare(right.parsed.uri),
  );
  const issues: CoreIssue[] = [];
  const templateCatalog = collectTemplates(ordered, issues);
  const entries: ExpandedTemplateIdValueEntry[] = [];
  const seen = new Map<string, ExpandedTemplateIdValueEntry>();
  const matching = ordered.flatMap((file) =>
    file.parsed.sections
      .filter(
        (section) =>
          getSectionFamily(section.type)?.canonical === canonicalSection &&
          isRecord(section.value),
      )
      .map((section) => ({ file, section })),
  );

  for (const generated of [false, true]) {
    for (const { file, section } of matching) {
      if (
        (section.generated === "factory") !== generated ||
        !isRecord(section.value)
      )
        continue;
      const templates = templateDirectoryForOwner(templateCatalog, file.pack);
      for (const [rawId, raw] of Object.entries(section.value)) {
        const source = sourceFor(
          file,
          section,
          rawId,
          generated ? "factory" : "direct",
        );
        const id = makeIdentifier(rawId, file.pack.namespace);
        const duplicateKey = `${templateDefinitionScope(file.pack)}\u0000${templateKey(file.pack.resourcesRoot, id)}`;
        const previous = seen.get(duplicateKey);
        if (previous) {
          issues.push({
            code: "duplicate-id-value",
            message: Messages.src.config.template.expander.text0032(
              canonicalSection,
              id,
            ),
            severity: "error",
            uri: source.uri,
            range: source.idRange,
            related: [
              {
                message: Messages.src.config.template.expander.text0033,
                uri: previous.source.uri,
                range: previous.source.idRange,
              },
            ],
          });
          continue;
        }
        const issueCount = issues.length;
        const value = generated
          ? raw
          : resolveTemplateValueEntry(
              rawId,
              raw,
              source,
              templates,
              issues,
              undefined,
              undefined,
              { source, text: file.parsed.text },
            );
        if (issues.length !== issueCount) continue;
        const entry = { rawId, value, source };
        seen.set(duplicateKey, entry);
        entries.push(entry);
      }
    }
  }
  return { entries, issues };
}

export function expandConfigurations(
  files: readonly ParsedPackFile[],
): ExpansionResult {
  const issues: CoreIssue[] = [];
  const configurations: ConfigurationCandidateInput[] = [];
  const opaqueSections: GeneratedOpaqueSection[] = [];

  const templateCatalog = collectTemplates(files, issues);

  for (const file of files) {
    const templates = templateDirectoryForOwner(templateCatalog, file.pack);
    for (const section of file.parsed.sections) {
      const directKind = resourceKind(section.type);
      if (directKind) {
        addConfigurationMap(
          section.value,
          file,
          section,
          "direct",
          directKind,
          templates,
          configurations,
          issues,
        );
      }
      if (getSectionFamily(section.type)?.canonical !== "config-factory")
        continue;
      if (!isRecord(section.value)) continue;
      const factory = section.value;
      const blueprintEntry = firstNonNull(factory, [
        "blueprint",
        "prototype",
        "schema",
      ]);
      const blueprint = blueprintEntry?.value;
      const blueprintRoot = blueprintEntry?.name ?? "blueprint";
      const instanceEntry = firstNonNull(factory, [
        "instances",
        "instance",
        "inputs",
        "input",
      ]);
      const instances = instanceEntry?.value;
      const instanceRoot = instanceEntry?.name ?? "instances";
      const rows: { readonly value: unknown; readonly path: string }[] =
        isUnknownArray(instances)
          ? instances.map((value, index) => ({
              value,
              path: `${instanceRoot}.${index}`,
            }))
          : isRecord(instances)
            ? [{ value: instances, path: instanceRoot }]
            : [];
      if (!isRecord(blueprint)) {
        const source = sourceFor(file, section, section.key, "factory");
        issues.push(
          issueAt(
            source,
            "factory-blueprint",
            Messages.src.config.template.expander.text0034,
          ),
        );
        continue;
      }
      if (rows.length === 0) {
        const source = sourceFor(file, section, section.key, "factory");
        issues.push(
          issueAt(
            source,
            "factory-instances",
            Messages.src.config.template.expander.text0035,
          ),
        );
      }
      let stopFactory = false;
      for (const row of rows) {
        const instance = row.value;
        if (!isRecord(instance)) {
          const source = sourceFor(file, section, section.key, "factory");
          issues.push(
            issueAt(
              source,
              "factory-instance-map",
              Messages.src.config.template.expander.text0036,
            ),
          );
          break;
        }
        const instanceSource = factoryInstanceSource(file, section, row.path);
        let invalidArguments = false;
        let creatingArguments = true;
        const report: TemplateArgumentReporter = (message, location): void => {
          if (creatingArguments) invalidArguments = true;
          const issue = issueAt(
            instanceSource,
            "factory-argument",
            message,
            location?.range,
          );
          issues.push(location ? { ...issue, uri: location.uri } : issue);
        };
        const context = createContext({}, instance, report, undefined, false, {
          source: instanceSource,
          text: file.parsed.text,
        });
        creatingArguments = false;
        if (invalidArguments) break;
        for (const [key, value] of Object.entries(blueprint)) {
          const type = key.split("#", 1)[0] ?? key;
          const family = getSectionFamily(type);
          if (!family || !isRecord(value)) continue;
          const generatedKind = resourceKind(type);
          if (generatedKind) {
            addConfigurationMap(
              value,
              file,
              section,
              "factory",
              generatedKind,
              templates,
              configurations,
              issues,
              (rawId) =>
                factoryResourceSource(
                  file,
                  section,
                  blueprintRoot,
                  key,
                  rawId,
                  instanceSource,
                ),
              context,
              instanceSource,
              (rawId) =>
                factoryBlueprintSource(
                  file,
                  section,
                  blueprintRoot,
                  key,
                  rawId,
                ),
            );
          } else if (
            family.canonical !== "templates" &&
            family.canonical !== "config-factory"
          ) {
            const sectionSource = factoryBlueprintSource(
              file,
              section,
              blueprintRoot,
              key,
            );
            const idValue =
              family.kind === "id-value"
                ? expandIdValueMap(
                    value,
                    file,
                    section,
                    templates,
                    issues,
                    context,
                    (rawId) =>
                      factoryBlueprintSource(
                        file,
                        section,
                        blueprintRoot,
                        key,
                        rawId,
                      ),
                  )
                : undefined;
            opaqueSections.push({
              sectionType: type,
              sectionKey: key,
              value: idValue?.value ?? value,
              source: idValue
                ? opaqueIdValueSource(sectionSource, idValue.sources)
                : sectionSource,
            });
          }
          if (invalidArguments) {
            stopFactory = true;
            break;
          }
        }
        if (stopFactory) break;
      }
    }
  }
  const candidates: ImageCandidateInput[] = configurations
    .filter((candidate) => candidate.kind === "image")
    .map(({ rawId, value, source }) => ({ rawId, value, source }));
  return {
    templates: templateCatalog.definitions,
    candidates,
    configurations,
    opaqueSections,
    issues,
  };
}
