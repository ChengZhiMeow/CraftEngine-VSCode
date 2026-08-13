import { evaluateExpression } from "../expression/evaluator.js";
import { resolveFunctionOrConditionType } from "../item/schema.js";
import {
  miscResourceFieldsForContext,
  miscResourceListItemField,
  resolveMiscResourceSection,
} from "../resource/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord } from "../../util/records.js";
import {
  finiteSchemaNumber,
  validateSchema,
  type SchemaConstraintResult,
} from "./schema.js";
import {
  booleanConstraint,
  candidateDomain,
  candidateLabel,
  compactPath,
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  genericField,
  issueCodes,
  javaStringOrList,
  listItemField,
  mappingOrList,
  oneProblem,
  onlyTemplateControlFields,
  originalSemantic,
  prepareDiscriminatorFields,
  problem,
  stringOrStringList,
  valueAt,
  withoutIdControlValidation,
  type ValidatedCandidateKind,
} from "./shared.js";

import { Messages } from "../../messages.js";
export function miscSectionForKind(
  kind: ConfigurationCandidateInput["kind"],
): string | undefined {
  switch (kind) {
    case "emoji":
      return "emojis";
    case "category":
      return "categories";
    case "painting":
      return "paintings";
    case "advancement":
      return "advancements";
    default:
      return undefined;
  }
}

function miscFields(
  section: string,
  root: unknown,
  context: SchemaContext,
  rootSegments: number,
): readonly SchemaField[] {
  const base = prepareDiscriminatorFields(
    miscResourceFieldsForContext(section, context),
    context,
  );
  const node = valueAt(root, context.path, rootSegments);
  const compact = context.path
    .slice(rootSegments)
    .filter((part) => !/^\d+$/u.test(part))
    .map((part) => part.replaceAll("-", "_"));
  const additions: SchemaField[] = [];
  const categoryPropertyIndex = compact.lastIndexOf("properties");
  const categoryPropertyPayload =
    resolveMiscResourceSection(section) === "category" &&
    categoryPropertyIndex >= 0 &&
    compact.length > categoryPropertyIndex + 1 &&
    (context.ancestorTypes ?? []).some(
      (type) =>
        resolveFunctionOrConditionType("condition", type)?.name ===
        "match_block_property",
    );
  if (categoryPropertyPayload) return [];
  if (
    resolveMiscResourceSection(section) === "emoji" &&
    compact.at(-1) === "content_overrides" &&
    isRecord(node)
  ) {
    for (const key of Object.keys(node)) {
      if (!exactFieldForName(key, base)) {
        additions.push(
          dynamicValidationField(
            {
              label: key,
              semantic: key,
              aliases: [],
              detail: Messages.src.config.validation.resource.text0001,
              snippet: `${key}: \${0}`,
            },
            key,
          ),
        );
      }
    }
  }
  if (
    resolveMiscResourceSection(section) === "category" &&
    compact.at(-1) === "properties" &&
    (context.ancestorTypes ?? []).some(
      (type) =>
        resolveFunctionOrConditionType("condition", type)?.name ===
        "match_block_property",
    ) &&
    isRecord(node)
  ) {
    for (const key of Object.keys(node)) {
      additions.push(
        dynamicValidationField(
          genericField(key, Messages.src.config.validation.resource.text0002),
          key,
        ),
      );
    }
  }
  return [...exactFields(withoutIdControlValidation(base)), ...additions];
}

function miscConstraint(
  candidate: ConfigurationCandidateInput,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const boolean = booleanConstraint(
    candidateDomain(candidate.kind as ValidatedCandidateKind),
    context,
  );
  if (boolean) return boolean;
  const semantic = originalSemantic(context.field);
  if (
    semantic === "type" &&
    context.field.values &&
    typeof context.value === "string" &&
    (context.field.values.includes(
      context.value.startsWith("craftengine:")
        ? context.value.slice("craftengine:".length)
        : context.value,
    ) ||
      context.value.includes(":"))
  )
    return { replaceBuiltIn: true };
  if (
    candidate.kind === "painting" &&
    (semantic === "width" || semantic === "height")
  ) {
    const value = finiteSchemaNumber(context.value);
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value < 1 || value > 16)
    ) {
      return oneProblem(
        problem(
          "invalid-painting-dimension",
          Messages.src.config.validation.resource.text0003(
            candidate.rawId,
            semantic,
          ),
        ),
      );
    }
  }
  if (candidate.kind === "emoji") {
    if (dynamicKey(context.field) !== undefined) {
      if (javaStringOrList(context.value)) return undefined;
      return oneProblem(
        problem(
          "invalid-emoji-content-override",
          Messages.src.config.validation.resource.text0008(candidate.rawId),
        ),
      );
    }

    switch (semantic) {
      case "keywords":
        if (javaStringOrList(context.value)) return undefined;
        return oneProblem(
          problem(
            "invalid-emoji-keywords",
            Messages.src.config.validation.resource.text0004(candidate.rawId),
          ),
        );
      case "content":
      case "format":
        if (javaStringOrList(context.value)) return undefined;
        return oneProblem(
          problem(
            "invalid-emoji-content",
            Messages.src.config.validation.resource.text0005(candidate.rawId),
          ),
        );
      case "content_overrides":
        if (isRecord(context.value)) return undefined;
        return oneProblem(
          problem(
            "invalid-emoji-content-overrides",
            Messages.src.config.validation.resource.text0006(candidate.rawId),
          ),
        );
      case "image":
        if (typeof context.value === "string") return undefined;
        return oneProblem(
          problem(
            "invalid-emoji-image",
            Messages.src.config.validation.resource.text0007(candidate.rawId),
          ),
        );
      case "permission":
        if (typeof context.value === "string") return undefined;
        return oneProblem(
          problem(
            "invalid-emoji-permission",
            Messages.src.config.validation.resource.text0009(candidate.rawId),
          ),
        );
    }
  }
  if (candidate.kind === "category") {
    if (context.field.valueProvider === "number") {
      if (
        (typeof context.value === "number" && Number.isFinite(context.value)) ||
        typeof context.value === "boolean"
      ) {
        return { replaceBuiltIn: true };
      }
      if (typeof context.value === "string") {
        let evaluated: unknown;
        try {
          evaluated = evaluateExpression(context.value.replaceAll("_", ""));
        } catch {
          evaluated = undefined;
        }
        if (
          (typeof evaluated === "number" && Number.isFinite(evaluated)) ||
          typeof evaluated === "boolean"
        )
          return { replaceBuiltIn: true };
      }
    }
    if (
      (semantic === "lore" || semantic === "list") &&
      !stringOrStringList(context.value)
    ) {
      return oneProblem(
        problem(
          "invalid-category-list",
          Messages.src.config.validation.resource.text0010(
            candidate.rawId,
            context.fieldName,
          ),
        ),
      );
    }
    if (semantic === "conditions" && !mappingOrList(context.value)) {
      return oneProblem(
        problem(
          "invalid-category-conditions",
          Messages.src.config.validation.resource.text0011(candidate.rawId),
        ),
      );
    }
    if (
      (semantic === "name" || semantic === "icon") &&
      typeof context.value !== "string"
    ) {
      return oneProblem(
        problem(
          "invalid-category-string",
          Messages.src.config.validation.resource.text0012(
            candidate.rawId,
            context.fieldName,
          ),
        ),
      );
    }
  }
  if (
    candidate.kind === "painting" &&
    (semantic === "asset_id" ||
      semantic === "title" ||
      semantic === "author") &&
    typeof context.value !== "string"
  ) {
    return oneProblem(
      problem(
        "invalid-painting-string",
        Messages.src.config.validation.resource.text0013(
          candidate.rawId,
          context.fieldName,
        ),
      ),
    );
  }
  return undefined;
}

export function validateMiscCandidate(
  candidate: ConfigurationCandidateInput,
  section: string,
): readonly CoreIssue[] {
  const issues = [
    ...validateSchema({
      value: candidate.value,
      source: candidate.source,
      path: [candidate.rawId],
      domainLabel: candidateLabel(candidate),
      fieldsForContext: (context) =>
        miscFields(section, candidate.value, context, 1),
      issueCodes: issueCodes(
        candidateDomain(candidate.kind as ValidatedCandidateKind),
      ),
      unknownField: (context) => {
        if (candidate.kind === "advancement") return "skip";
        if (
          candidate.kind === "category" &&
          compactPath(context.path).at(-1) === "properties" &&
          (context.ancestorTypes ?? []).some(
            (type) =>
              resolveFunctionOrConditionType("condition", type)?.name ===
              "match_block_property",
          )
        ) {
          return "open";
        }
        if (
          candidate.kind === "category" &&
          compactPath(context.path).includes("properties") &&
          (context.ancestorTypes ?? []).some(
            (type) =>
              resolveFunctionOrConditionType("condition", type)?.name ===
              "match_block_property",
          )
        ) {
          return "skip";
        }
        const fields = miscResourceFieldsForContext(section, context);
        if (fields.length === 0 || onlyTemplateControlFields(fields))
          return "skip";
        const discriminator = context.siblingValues.get("type");
        if (
          fields.some((field) => field.label === "type" && field.required) &&
          discriminator === undefined
        )
          return "skip";
        if (
          discriminator?.includes(":") &&
          !discriminator.startsWith("craftengine:")
        )
          return "skip";
        return "diagnose";
      },
      listItemFieldForContext: (context) =>
        listItemField(miscResourceListItemField(section, context.path)),
      constraints: (context) => miscConstraint(candidate, context),
    }),
  ];

  if (candidate.kind === "advancement" && isRecord(candidate.value)) {
    const rootFields = miscResourceFieldsForContext(section, {
      path: [candidate.rawId],
      siblingValues: new Map(),
    });
    for (const key of Object.keys(candidate.value)) {
      if (exactFieldForName(key, rootFields)) continue;
      issues.push(
        customIssue(
          candidate.source,
          "advancement-no-op-field",
          Messages.src.config.validation.resource.text0014(
            candidate.rawId,
            key,
          ),
          "information",
          key,
          true,
        ),
      );
    }
  }
  return issues;
}
