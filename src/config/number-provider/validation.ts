import type { CoreIssue } from "../../diagnostics/model.js";
import { appendPath as at } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type { ConfigurationSource } from "../model.js";
import {
  schemaFieldForName,
  type SchemaContext,
  type SchemaField,
} from "../schema/types.js";
import { validateNumberProviderValue } from "./schema.js";

export interface SchemaNumberProviderValidationRequest {
  readonly value: unknown;
  readonly source: ConfigurationSource;
  readonly rootPath: readonly string[];
  readonly fieldsForContext: (context: SchemaContext) => readonly SchemaField[];
  readonly fieldForName?: (
    context: SchemaContext,
    name: string,
    fields: readonly SchemaField[],
  ) => SchemaField | undefined;
  readonly domain: string;
  readonly domainLabel: string;
}

function opaqueExternalDiscriminator(
  type: unknown,
  fields: readonly SchemaField[],
): boolean {
  if (typeof type !== "string") return false;
  const normalized = type.replace(/^!/u, "");
  const separator = normalized.indexOf(":");
  if (separator < 0) return false;
  const namespace = normalized.slice(0, separator);
  if (namespace.toLowerCase() === "craftengine" && namespace !== "craftengine")
    return true;
  const typeField = schemaFieldForName("type", fields);
  if (typeField?.values) {
    return (
      !typeField.values.includes(normalized) &&
      !typeField.values.includes(
        namespace === "craftengine"
          ? normalized.slice(separator + 1)
          : normalized,
      )
    );
  }
  return namespace !== "craftengine" && fields.length === 0;
}

export function validateSchemaNumberProviders(
  request: SchemaNumberProviderValidationRequest,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const walk = (
    value: unknown,
    path: readonly string[],
    fieldPath: string,
    ancestorTypes: readonly string[],
  ): void => {
    if (isUnknownArray(value)) {
      value.forEach((entry, index) =>
        walk(
          entry,
          [...path, String(index)],
          at(fieldPath, index),
          ancestorTypes,
        ),
      );
      return;
    }
    if (!isRecord(value)) return;

    const schemaContext: SchemaContext = {
      path,
      siblingValues: new Map(
        Object.entries(value).flatMap(([key, child]) =>
          typeof child === "string" ||
          typeof child === "number" ||
          typeof child === "boolean"
            ? [[key, String(child)] as const]
            : [],
        ),
      ),
      ancestorTypes,
    };
    const fields = request.fieldsForContext(schemaContext);
    const ownType = typeof value.type === "string" ? value.type : undefined;
  // 外部插件的数据格式不固定, 不要把同名字段误认成随机数配置
    if (opaqueExternalDiscriminator(ownType, fields)) return;
    const childAncestorTypes =
      ownType === undefined ? ancestorTypes : [ownType, ...ancestorTypes];
    for (const [name, child] of Object.entries(value)) {
      const childFieldPath = at(fieldPath, name);
      if (
        (
          request.fieldForName?.(schemaContext, name, fields) ??
          schemaFieldForName(name, fields)
        )?.valueProvider === "number-provider"
      ) {
        for (const problem of validateNumberProviderValue(child)) {
          const problemPath = problem.path.reduce(
            (result, segment) => at(result, segment),
            childFieldPath,
          );
          let code: string;
          switch (problem.code) {
            case "unknown-type":
              code = `unknown-${request.domain}-number-provider-type`;
              break;
            case "missing-type":
            case "missing-field":
              code = `missing-${request.domain}-number-provider-field`;
              break;
            case "conflicting-alias":
              code = `unsafe-${request.domain}-number-provider`;
              break;
            default:
              code =
                problem.severity === "warning"
                  ? `unsafe-${request.domain}-number-provider`
                  : `invalid-${request.domain}-number-provider`;
          }
          issues.push({
            code,
            message: `${request.domainLabel} ${childFieldPath}: ${problem.message}`,
            severity: problem.severity,
            uri: request.source.uri,
            range:
              request.source.fieldValueRanges.get(problemPath) ??
              request.source.fieldKeyRanges.get(problemPath) ??
              request.source.entryRange,
          });
        }
        continue;
      }
      walk(child, [...path, name], childFieldPath, childAncestorTypes);
    }
  };

  walk(request.value, request.rootPath, "", []);
  return issues;
}
