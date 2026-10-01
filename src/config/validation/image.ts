import { imageFieldsForContext } from "../image/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { validateSchema } from "./schema.js";
import { evaluateExpression } from "../expression/evaluator.js";
import { isUnknownArray } from "../../util/records.js";
import {
  booleanConstraint,
  candidateLabel,
  exactFields,
  issueCodes,
  oneProblem,
  originalSemantic,
  problem,
  withoutIdControlValidation,
} from "./shared.js";

import { Messages } from "../../messages.js";

// CE 的 getAsInt: 数字截断, 字符串先删下划线再解析, 失败后按表达式求值
function imageInteger(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text === "") return undefined;
  const literal = Number(text.replaceAll("_", ""));
  if (Number.isFinite(literal)) return Math.trunc(literal);
  try {
    const evaluated = evaluateExpression(text);
    return typeof evaluated === "number" && Number.isFinite(evaluated)
      ? Math.trunc(evaluated)
      : undefined;
  } catch {
    return undefined;
  }
}

function imageCharValue(value: unknown): boolean {
  // CE: Number 走固定码位, 其余标量按字符串处理, 列表元素会被 toString
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return true;
  return (
    isUnknownArray(value) &&
    value.every((entry) => entry !== null && entry !== undefined)
  );
}

export function validateImage(
  candidate: ConfigurationCandidateInput,
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  return validateSchema({
    value: candidate.value,
    source: candidate.source,
    path: [candidate.rawId],
    domainLabel: candidateLabel(candidate),
    fieldsForContext: (context) =>
      exactFields(withoutIdControlValidation(imageFieldsForContext(context))),
    configVersion,
    issueCodes: issueCodes("image"),
    unknownField: ({ fields }) => (fields.length === 0 ? "skip" : "diagnose"),
    constraints: (context) => {
      const boolean = booleanConstraint("image", context);
      if (boolean) return boolean;
      switch (originalSemantic(context.field)) {
        case "grid_size": {
          if (typeof context.value !== "string")
            return oneProblem(
              problem(
                "invalid-image-grid-size",
                Messages.src.config.validation.image.text0001(candidate.rawId),
              ),
            );
          const parts = context.value.split(",");
          const rows =
            parts.length === 2 ? imageInteger(parts[0]?.trim()) : undefined;
          const columns =
            parts.length === 2 ? imageInteger(parts[1]?.trim()) : undefined;
          if (
            rows === undefined ||
            columns === undefined ||
            rows < 1 ||
            columns < 1
          )
            return oneProblem(
              problem(
                "invalid-image-grid-size",
                Messages.src.config.validation.image.text0002(candidate.rawId),
              ),
            );
          return undefined;
        }
        case "row":
        case "col":
        case "height":
        case "ascent": {
          const semantic = originalSemantic(context.field);
          const value = imageInteger(context.value);
          // CE 的 row/col/height/ascent 都走 getInt, 支持 _ 与表达式, 也没有下限
          if (value === undefined)
            return oneProblem(
              problem(
                `invalid-image-${semantic}`,
                `图片 ${candidate.rawId} 的 ${semantic} 必须是整数或整数表达式`,
              ),
              true,
            );
          if (semantic !== "ascent") return { replaceBuiltIn: true };
          const height = imageInteger(context.siblingValues.get("height"));
          if (height === undefined || value <= height)
            return { replaceBuiltIn: true };
          return oneProblem(
            problem(
              "invalid-image-ascent",
              Messages.src.config.validation.image.text0004(candidate.rawId),
            ),
            true,
          );
        }
        case "file":
        case "font":
        case "ref":
          if (typeof context.value === "string" && context.value.trim() !== "")
            return undefined;
          return oneProblem(
            problem(
              "invalid-image-string",
              Messages.src.config.validation.image.text0005(
                candidate.rawId,
                context.fieldName,
              ),
            ),
          );
        case "char":
          if (imageCharValue(context.value)) return undefined;
          return oneProblem(
            problem(
              "invalid-image-char",
              `图片 ${candidate.rawId} 的 char 必须是字符串、数字或列表`,
            ),
          );
        default:
          return undefined;
      }
    },
  });
}
