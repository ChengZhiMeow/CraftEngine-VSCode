import {
  miscResourceDynamicValueField,
  miscResourceFieldsForContext,
  miscResourceListItemField,
  resolveMiscResourceSection,
} from "../resource/schema.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { validateSchema } from "./schema.js";
import { Messages } from "../../messages.js";
import {
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFields,
  issueCodes,
  listItemField,
  oneProblem,
  problem,
  type OpaqueSectionValidationInput,
} from "./shared.js";

function validateSkipValues(
  section: OpaqueSectionValidationInput,
  issues: CoreIssue[],
): void {
  if (!isRecord(section.value)) return;
  for (const key of ["texture", "json"]) {
    const value = section.value[key];
    if (value === undefined) continue;
    const list = isUnknownArray(value);
    for (const [index, entry] of (list ? value : [value]).entries()) {
      const path = list ? `${key}.${index}` : key;
      if (entry === null && list) {
        issues.push(
          customIssue(
            section.source,
            "invalid-skip-optimization-null",
            Messages.src.config.validation.opaque.text0001(key),
            "error",
            path,
          ),
        );
        continue;
      }
  // 其他非空值会被转成文字, 不要当成配置错误
      if (typeof entry !== "string") continue;
      const normalized = entry.trim();
      if (
        normalized !== "" &&
        !normalized.startsWith("/") &&
        !normalized.startsWith("\\") &&
        !/^[a-z]:/iu.test(normalized) &&
        !normalized.includes("\\") &&
        !normalized.includes(":") &&
        !/[*?]/u.test(normalized) &&
        !normalized.split("/").some((part) => part === "." || part === "..")
      )
        continue;
      issues.push(
        customIssue(
          section.source,
          "ineffective-skip-optimization-path",
          Messages.src.config.validation.opaque.text0002(key),
          "warning",
          path,
        ),
      );
    }
  }
}

export function validateOpaqueSection(
  section: OpaqueSectionValidationInput,
): readonly CoreIssue[] {
  const resolved = resolveMiscResourceSection(section.sectionType);
  if (resolved !== "block-state-mapping" && resolved !== "skip-optimization")
    return [];
  const fieldsForContext = (context: SchemaContext): readonly SchemaField[] => {
    if (resolved !== "block-state-mapping" || context.path.length !== 0)
      return exactFields(
        miscResourceFieldsForContext(section.sectionType, context),
      );
    return (isRecord(section.value) ? Object.keys(section.value) : []).map(
      (key) => {
        return dynamicValidationField(
          miscResourceDynamicValueField(
            section.sectionType,
            context.path,
            key,
          ) ?? {
            label: key,
            semantic: key,
            aliases: [],
            detail: Messages.src.config.validation.opaque.text0003,
            snippet: `${key}: \${0}`,
          },
          key,
        );
      },
    );
  };
  const issues = [
    ...validateSchema({
      value: section.value,
      source: section.source,
      domainLabel:
        resolved === "block-state-mapping"
          ? Messages.src.config.validation.opaque.text0004
          : Messages.src.config.validation.opaque.text0005,
      fieldsForContext,
      issueCodes: issueCodes(resolved),
      unknownField: (context) => {
        if (resolved === "skip-optimization") return "skip";
        if (context.path.length === 0) return "open";
        return context.fields.length === 0 ? "skip" : "diagnose";
      },
      listItemFieldForContext: (context) =>
        listItemField(
          miscResourceListItemField(section.sectionType, context.path),
        ),
      constraints: (context) => {
        if (
          resolved === "block-state-mapping" &&
          dynamicKey(context.field) !== undefined &&
          (typeof context.value !== "string" || context.value.trim() === "")
        ) {
          return oneProblem(
            problem(
              "invalid-block-state-mapping-value",
              Messages.src.config.validation.opaque.text0006(context.fieldName),
            ),
          );
        }
        return undefined;
      },
    }),
  ];
  if (resolved !== "block-state-mapping") {
    validateSkipValues(section, issues);
    return issues;
  }
  if (!isRecord(section.value)) return issues;

  for (const key of Object.keys(section.value)) {
    if (key.trim() !== "") continue;
    issues.push(
      customIssue(
        section.source,
        "invalid-block-state-mapping-key",
        Messages.src.config.validation.opaque.text0007,
        "error",
        key,
        true,
      ),
    );
  }
  return issues;
}
