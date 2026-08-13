import { imageFieldsForContext } from "../image/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { finiteSchemaNumber, validateSchema } from "./schema.js";
import {
  booleanConstraint,
  candidateLabel,
  exactFields,
  issueCodes,
  oneProblem,
  originalSemantic,
  problem,
  stringOrStringList,
  withoutIdControlValidation,
} from "./shared.js";

import { Messages } from "../../messages.js";
export function validateImage(
  candidate: ConfigurationCandidateInput,
): readonly CoreIssue[] {
  return validateSchema({
    value: candidate.value,
    source: candidate.source,
    path: [candidate.rawId],
    domainLabel: candidateLabel(candidate),
    fieldsForContext: (context) =>
      exactFields(withoutIdControlValidation(imageFieldsForContext(context))),
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
          const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/u.exec(context.value);
          if (!match || Number(match[1]) < 1 || Number(match[2]) < 1)
            return oneProblem(
              problem(
                "invalid-image-grid-size",
                Messages.src.config.validation.image.text0002(candidate.rawId),
              ),
            );
          return undefined;
        }
        case "row":
        case "col": {
          const semantic = originalSemantic(context.field);
          const value = finiteSchemaNumber(context.value);
          if (value === undefined || (Number.isInteger(value) && value >= 0))
            return undefined;
          return oneProblem(
            problem(
              `invalid-image-${semantic}`,
              Messages.src.config.validation.image.text0003(
                candidate.rawId,
                semantic,
              ),
            ),
          );
        }
        case "ascent": {
          const ascent = finiteSchemaNumber(context.value);
          const height = finiteSchemaNumber(
            context.siblingValues.get("height"),
          );
          if (ascent === undefined || height === undefined || ascent <= height)
            return undefined;
          return oneProblem(
            problem(
              "invalid-image-ascent",
              Messages.src.config.validation.image.text0004(candidate.rawId),
            ),
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
          if (stringOrStringList(context.value)) return undefined;
          return oneProblem(
            problem(
              "invalid-image-char",
              Messages.src.config.validation.image.text0006(candidate.rawId),
            ),
          );
        default:
          return undefined;
      }
    },
  });
}
