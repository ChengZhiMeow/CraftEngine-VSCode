import { schemaFieldForName, semanticForField } from "../schema/types.js";
import { isNumberProviderScalar } from "../number-provider/schema.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import type { ConfigurationSource } from "../model.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type {
  CoreIssue,
  IssueSeverity,
  TextRange,
} from "../../diagnostics/model.js";
import { appendPath as at } from "../../util/paths.js";
import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export interface SchemaValidationSource extends Pick<
  ConfigurationSource,
  "uri" | "idRange" | "entryRange" | "fieldKeyRanges" | "fieldValueRanges"
> {
  readonly pack?: ConfigurationSource["pack"];
  readonly kind?: ConfigurationSource["kind"];
  readonly sectionKey?: ConfigurationSource["sectionKey"];
}

export interface SchemaValidationIssueCodes {
  readonly unknownField: string;
  readonly conflictingAlias: string;
  readonly missingRequired: string;
  readonly invalidBoolean: string;
  readonly invalidNumber: string;
  readonly invalidEnum: string;
  readonly invalidValue: string;
  readonly invalidRoot: string;
}

export const DEFAULT_SCHEMA_VALIDATION_ISSUE_CODES: SchemaValidationIssueCodes =
  {
    unknownField: "unknown-schema-field",
    conflictingAlias: "conflicting-schema-alias",
    missingRequired: "missing-schema-field",
    invalidBoolean: "invalid-schema-boolean",
    invalidNumber: "invalid-schema-number",
    invalidEnum: "invalid-schema-enum",
    invalidValue: "invalid-schema-value",
    invalidRoot: "invalid-schema-root",
  };

export const ENABLE_DEBUG_SCHEMA_FIELDS: readonly SchemaField[] = [
  {
    label: "enable",
    semantic: "enable",
    aliases: [],
    detail: Messages.src.config.validation.schema.text0001,
    snippet: "enable: ${1|true,false|}",
    valueProvider: "boolean",
    values: ["true", "false"],
  },
  {
    label: "debug",
    semantic: "debug",
    aliases: [],
    detail: Messages.src.config.validation.schema.text0002,
    snippet: "debug: ${1|true,false|}",
    valueProvider: "boolean",
    values: ["true", "false"],
  },
];

export function withEnableDebugSchemaFields(
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  const merged = new Map<string, SchemaField>();
  for (const field of ENABLE_DEBUG_SCHEMA_FIELDS)
    merged.set(field.semantic, field);
  for (const field of fields) merged.set(field.semantic, field);
  return [...merged.values()];
}

export type UnknownSchemaFieldAction = "diagnose" | "open" | "skip";
export type SchemaRootKind = "mapping" | "list" | "any";

export interface SchemaNodeValidationContext extends SchemaContext {
  readonly value: unknown;
  readonly fieldPath: string;
  readonly source: SchemaValidationSource;
  readonly domainLabel: string;
}

export interface UnknownSchemaFieldContext extends SchemaNodeValidationContext {
  readonly path: readonly string[];
  readonly fieldPath: string;
  readonly key: string;
  readonly fieldValue: unknown;
  readonly childPath: readonly string[];
  readonly childFieldPath: string;
  readonly fields: readonly SchemaField[];
}

export interface SchemaListItemContext extends SchemaNodeValidationContext {
  readonly index: number;
}

export interface SchemaValueValidationContext extends SchemaContext {
  readonly field: SchemaField;
  readonly fieldName: string;
  readonly value: unknown;
  readonly fieldPath: string;
  readonly source: SchemaValidationSource;
  readonly domainLabel: string;
  readonly listIndex?: number;
}

export interface SchemaConstraintProblem {
  readonly message: string;
  readonly code?: string;
  readonly severity?: IssueSeverity;
  readonly fieldPath?: string;
  readonly range?: "key" | "value";
}

export interface SchemaConstraintResult {
  readonly replaceBuiltIn?: boolean;
  readonly problems?: readonly SchemaConstraintProblem[];
}

export type SchemaFieldsForContext = (
  context: SchemaContext,
) => readonly SchemaField[];
export type SchemaUnknownFieldResolver = (
  context: UnknownSchemaFieldContext,
) => UnknownSchemaFieldAction | undefined;
export type SchemaListItemFieldResolver = (
  context: SchemaListItemContext,
) => SchemaField | undefined;
export type SchemaConstraintValidator = (
  context: SchemaValueValidationContext,
) => SchemaConstraintResult | undefined;

export interface SchemaValidationRequest {
  readonly value: unknown;
  readonly source: SchemaValidationSource;
  readonly fieldsForContext: SchemaFieldsForContext;
  readonly path?: readonly string[];
  readonly fieldPath?: string;
  readonly domainLabel: string;
  readonly rootKind?: SchemaRootKind;
  readonly issueCodes?: Partial<SchemaValidationIssueCodes>;
  // open 会继续检查里面, skip 会直接停止, diagnose 会报一次并停止后续报错
  readonly unknownField?: SchemaUnknownFieldResolver;
  readonly listItemFieldForContext?: SchemaListItemFieldResolver;
  readonly constraints?: SchemaConstraintValidator;
}

function resolveFields(
  value: Readonly<Record<string, unknown>>,
  path: readonly string[],
  resolver: SchemaFieldsForContext,
  ancestorTypes: readonly string[],
): Readonly<{
  fields: readonly SchemaField[];
  siblingValues: ReadonlyMap<string, string>;
}> {
  const scalarEntries: [string, string][] = [];
  for (const [key, candidate] of Object.entries(value)) {
    switch (typeof candidate) {
      case "string":
      case "number":
      case "boolean":
        scalarEntries.push([key, String(candidate)]);
    }
  }
  const siblingValues = new Map(scalarEntries);
  for (const [key, text] of scalarEntries) {
    const semantic = key.replace(/#.*$/u, "").replaceAll("-", "_");
    if (!siblingValues.has(semantic)) siblingValues.set(semantic, text);
  }
  let fields = resolver({ path, siblingValues, ancestorTypes });

  // 其他写法最多查找四轮, 不限制次数会反复读取同一组字段
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const [key, text] of scalarEntries) {
      const selected = schemaFieldForName(key, fields);
      if (!selected) continue;
      for (const name of [
        selected.label,
        ...selected.aliases,
        selected.semantic,
      ]) {
        if (siblingValues.has(name)) continue;
        siblingValues.set(name, text);
        changed = true;
      }
    }
    if (!changed) break;
    fields = resolver({ path, siblingValues, ancestorTypes });
  }
  return { fields, siblingValues };
}

export function schemaSourceRange(
  source: SchemaValidationSource,
  fieldPath = "",
  key = false,
): TextRange {
  let candidate = fieldPath;
  while (candidate) {
    const selected =
      (key ? source.fieldKeyRanges : source.fieldValueRanges).get(candidate) ??
      (key ? source.fieldValueRanges : source.fieldKeyRanges).get(candidate);
    if (selected) return selected;
    const separator = candidate.lastIndexOf(".");
    candidate = separator < 0 ? "" : candidate.slice(0, separator);
  }
  return source.entryRange ?? source.idRange;
}

export function isSchemaBoolean(value: unknown): boolean {
  try {
    craftEngineBoolean(value);
    return true;
  } catch {
    return false;
  }
}

export function finiteSchemaNumber(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value.trim().replaceAll("_", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function issue(
  source: SchemaValidationSource,
  code: string,
  message: string,
  severity: IssueSeverity,
  fieldPath: string,
  key = false,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: schemaSourceRange(source, fieldPath, key),
  };
}

function nodeLabel(domainLabel: string, fieldPath: string): string {
  return fieldPath ? `${domainLabel} ${fieldPath}` : domainLabel;
}

function builtInProblem(
  context: SchemaValueValidationContext,
  codes: SchemaValidationIssueCodes,
): Readonly<{ code: string; message: string }> | undefined {
  const subject = nodeLabel(context.domainLabel, context.fieldPath);
  if (
    context.field.valueProvider === "boolean" &&
    !isSchemaBoolean(context.value)
  ) {
    return {
      code: codes.invalidBoolean,
      message: Messages.src.config.validation.schema.text0003(subject),
    };
  }
  if (
    context.field.valueProvider === "number" &&
    finiteSchemaNumber(context.value) === undefined
  ) {
    return {
      code: codes.invalidNumber,
      message: Messages.src.config.validation.schema.text0004(subject),
    };
  }
  if (
    context.field.valueProvider === "number-provider" &&
    !isNumberProviderScalar(context.value) &&
    !isRecord(context.value)
  ) {
    return {
      code: codes.invalidNumber,
      message: Messages.src.config.validation.schema.text0005(subject),
    };
  }
  if (
    context.field.valueProvider !== "boolean" &&
    context.field.valueProvider !== "number" &&
    context.field.valueProvider !== "number-provider" &&
    context.field.values &&
    (typeof context.value !== "string" ||
      !context.field.values.includes(context.value))
  ) {
    return {
      code: codes.invalidEnum,
      message: Messages.src.config.validation.schema.text0006(
        subject,
        context.field.values.join("、"),
      ),
    };
  }
  return undefined;
}

function validateKnownValue(
  request: SchemaValidationRequest,
  codes: SchemaValidationIssueCodes,
  field: SchemaField,
  fieldName: string,
  value: unknown,
  path: readonly string[],
  fieldPath: string,
  siblingValues: ReadonlyMap<string, string>,
  ancestorTypes: readonly string[],
  issues: CoreIssue[],
  listIndex?: number,
): void {
  const context: SchemaValueValidationContext = {
    field,
    fieldName,
    value,
    path,
    fieldPath,
    siblingValues,
    ancestorTypes,
    source: request.source,
    domainLabel: request.domainLabel,
    ...(listIndex === undefined ? {} : { listIndex }),
  };
  const constrained = request.constraints?.(context);
  if (!constrained?.replaceBuiltIn) {
    const problem = builtInProblem(context, codes);
    if (problem)
      issues.push(
        issue(
          request.source,
          problem.code,
          problem.message,
          "error",
          fieldPath,
        ),
      );
  }
  for (const problem of constrained?.problems ?? []) {
    issues.push(
      issue(
        request.source,
        problem.code ?? codes.invalidValue,
        problem.message,
        problem.severity ?? "error",
        problem.fieldPath ?? fieldPath,
        problem.range === "key",
      ),
    );
  }
}

function validateMapping(
  request: SchemaValidationRequest,
  codes: SchemaValidationIssueCodes,
  value: Readonly<Record<string, unknown>>,
  path: readonly string[],
  fieldPath: string,
  ancestorTypes: readonly string[],
  issues: CoreIssue[],
  walk: (
    value: unknown,
    path: readonly string[],
    fieldPath: string,
    ancestorTypes: readonly string[],
  ) => void,
): void {
  const resolved = resolveFields(
    value,
    path,
    request.fieldsForContext,
    ancestorTypes,
  );
  const ownType = resolved.siblingValues.get("type");
  const childAncestorTypes =
    ownType === undefined ? ancestorTypes : [ownType, ...ancestorTypes];
  const groups = new Map<string, SchemaField[]>();
  for (const field of resolved.fields) {
    const group = groups.get(field.semantic) ?? [];
    group.push(field);
    groups.set(field.semantic, group);
  }

  const configured = new Map<
    string,
    Array<Readonly<{ key: string; value: unknown; field: SchemaField }>>
  >();
  const actions = new Map<string, UnknownSchemaFieldAction>();
  for (const [key, fieldValue] of Object.entries(value)) {
    const selected = schemaFieldForName(key, resolved.fields);
    if (selected) {
      const semantic = semanticForField(key, resolved.fields);
      const entries = configured.get(semantic) ?? [];
      entries.push({ key, value: fieldValue, field: selected });
      configured.set(semantic, entries);
      continue;
    }
    const childFieldPath = at(fieldPath, key);
    const action =
      request.unknownField?.({
        value,
        path,
        fieldPath,
        siblingValues: resolved.siblingValues,
        ancestorTypes,
        source: request.source,
        domainLabel: request.domainLabel,
        key,
        fieldValue,
        childPath: [...path, key],
        childFieldPath,
        fields: resolved.fields,
      }) ?? "diagnose";
    actions.set(key, action);
    if (action === "diagnose") {
      issues.push(
        issue(
          request.source,
          codes.unknownField,
          Messages.src.config.validation.schema.text0007(
            nodeLabel(request.domainLabel, fieldPath),
            key,
          ),
          "warning",
          childFieldPath,
          true,
        ),
      );
    }
  }

  for (const [semantic, fields] of groups) {
    const entries = configured.get(semantic) ?? [];
    if (entries.length > 1) {
      issues.push(
        issue(
          request.source,
          codes.conflictingAlias,
          Messages.src.config.validation.schema.text0008(
            nodeLabel(request.domainLabel, fieldPath),
            entries.map((entry) => entry.key).join(", "),
          ),
          "warning",
          at(fieldPath, entries.at(-1)!.key),
          true,
        ),
      );
    }
    // 只要字段存在就算满足要求, 空字符串由对应功能自己检查
    if (
      fields.some((field) => field.required) &&
      !entries.some(
        (entry) => entry.value !== undefined && entry.value !== null,
      )
    ) {
      issues.push(
        issue(
          request.source,
          codes.missingRequired,
          Messages.src.config.validation.schema.text0009(
            nodeLabel(request.domainLabel, fieldPath),
            (fields.find((field) => field.required) ?? fields[0]!).label,
          ),
          "error",
          fieldPath,
        ),
      );
    }
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    const selected = schemaFieldForName(key, resolved.fields);
    const childPath = [...path, key];
    const childFieldPath = at(fieldPath, key);
    if (selected) {
      validateKnownValue(
        request,
        codes,
        selected,
        key,
        fieldValue,
        childPath,
        childFieldPath,
        resolved.siblingValues,
        ancestorTypes,
        issues,
      );
      walk(fieldValue, childPath, childFieldPath, childAncestorTypes);
    } else if (actions.get(key) === "open") {
      walk(fieldValue, childPath, childFieldPath, childAncestorTypes);
    }
  }
}

export function validateSchema(
  request: SchemaValidationRequest,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const codes: SchemaValidationIssueCodes = {
    ...DEFAULT_SCHEMA_VALIDATION_ISSUE_CODES,
    ...request.issueCodes,
  };
  const rootFieldPath = request.fieldPath ?? "";
  const rootKind = request.rootKind ?? "mapping";
  if (rootKind === "mapping" && !isRecord(request.value)) {
    issues.push(
      issue(
        request.source,
        codes.invalidRoot,
        Messages.src.config.validation.schema.text0010(
          nodeLabel(request.domainLabel, rootFieldPath),
        ),
        "error",
        rootFieldPath,
      ),
    );
    return issues;
  }
  if (rootKind === "list" && !isUnknownArray(request.value)) {
    issues.push(
      issue(
        request.source,
        codes.invalidRoot,
        Messages.src.config.validation.schema.text0011(
          nodeLabel(request.domainLabel, rootFieldPath),
        ),
        "error",
        rootFieldPath,
      ),
    );
    return issues;
  }

  const walk = (
    value: unknown,
    path: readonly string[],
    fieldPath: string,
    ancestorTypes: readonly string[],
  ): void => {
    if (isRecord(value)) {
      validateMapping(
        request,
        codes,
        value,
        path,
        fieldPath,
        ancestorTypes,
        issues,
        walk,
      );
      return;
    }
    if (!isUnknownArray(value)) return;
    value.forEach((entry, index) => {
      const itemPath = [...path, String(index)];
      const itemFieldPath = at(fieldPath, index);
      if (!isRecord(entry) && !isUnknownArray(entry)) {
        const siblingValues = new Map<string, string>();
        const itemField = request.listItemFieldForContext?.({
          value: entry,
          path: itemPath,
          fieldPath: itemFieldPath,
          siblingValues,
          ancestorTypes,
          source: request.source,
          domainLabel: request.domainLabel,
          index,
        });
        if (itemField)
          validateKnownValue(
            request,
            codes,
            itemField,
            String(index),
            entry,
            itemPath,
            itemFieldPath,
            siblingValues,
            ancestorTypes,
            issues,
            index,
          );
      }
      walk(entry, itemPath, itemFieldPath, ancestorTypes);
    });
  };
  walk(request.value, request.path ?? [], rootFieldPath, []);
  return issues;
}
