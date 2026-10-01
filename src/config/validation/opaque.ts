import {
  miscResourceDynamicValueField,
  miscResourceFieldsForContext,
  miscResourceListItemField,
  resolveMiscResourceSection,
} from "../resource/schema.js";
import { MISC_OPAQUE_SECTIONS } from "./resource.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { validateSchema } from "./schema.js";
import { Messages } from "../../messages.js";
import { isExpressionSyntax } from "../expression/evaluator.js";
import {
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFields,
  issueCodes,
  listItemField,
  oneProblem,
  originalSemantic,
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
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const resolved = resolveMiscResourceSection(section.sectionType);
  // 兜底判断: 调用方按白名单收集, 但校验器本身仍要拒绝其他 section
  if (resolved === undefined || !MISC_OPAQUE_SECTIONS.has(resolved)) return [];
  const fieldsForContext = (context: SchemaContext): readonly SchemaField[] => {
    if (resolved === "damage-rules" && context.path.length === 0) {
      return (isRecord(section.value) ? Object.keys(section.value) : []).map(
        (key) =>
          dynamicValidationField(
            {
              label: key,
              semantic: key,
              aliases: [],
              detail: "伤害来源对应的规则列表",
              snippet: `${key}:\n  - formula: \${0:damage}`,
            },
            key,
          ),
      );
    }
    if (resolved !== "block-state-mappings" || context.path.length !== 0)
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
        resolved === "block-state-mappings"
          ? Messages.src.config.validation.opaque.text0004
          : resolved === "damage-rules"
            ? "伤害规则"
            : Messages.src.config.validation.opaque.text0005,
      fieldsForContext,
      configVersion,
      issueCodes: issueCodes(resolved),
      unknownField: (context) => {
        if (resolved === "skip-optimization") return "skip";
        if (resolved === "damage-rules" && context.path.length === 0)
          return "open";
        if (context.path.length === 0) return "open";
        return context.fields.length === 0 ? "skip" : "diagnose";
      },
      listItemFieldForContext: (context) =>
        listItemField(
          miscResourceListItemField(section.sectionType, context.path),
        ),
      constraints: (context) => {
        if (
          resolved === "block-state-mappings" &&
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
        if (resolved === "damage-rules" && typeof context.value === "string") {
          const semantic = originalSemantic(context.field);
          const expressionField =
            semantic === "expression" ||
            semantic === "formula" ||
            (dynamicKey(context.field) !== undefined &&
              context.path.some((part) => part === "parts"));
          if (
            expressionField &&
            !isExpressionSyntax(context.value, {
              damage: 0,
              is_critical: 0,
              is_sweep: 0,
              attack_strength: 0,
              shoot_force: 0,
              is_attack_ready: 0,
            })
          )
            return oneProblem(
              problem(
                "invalid-damage-formula-expression",
                `伤害规则 ${context.fieldPath} 不是有效的 Sparrow Expression`,
              ),
            );
        }
        return undefined;
      },
    }),
  ];
  if (resolved !== "block-state-mappings") {
    if (resolved === "damage-rules") return issues;
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
