import { evaluateExpression } from "../expression/evaluator.js";
import { dataComponentDefinition } from "../item/dataComponents.js";
import { itemDataProcessorField } from "../item/schema.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import {
  normalizeRecipeType,
  recipeDynamicKeyField,
  recipeDynamicValueField,
  recipeExternalDiscriminatorSubtree,
  recipeFieldsForContext,
  recipeItemDataContext,
  recipeListItemField,
  recipeOpaqueSubtree,
  resolveRecipeDiscriminator,
  type RecipeDiscriminatorRegistry,
  type RecipeSchemaContext,
} from "../recipe/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  finiteSchemaNumber,
  validateSchema,
  type SchemaConstraintResult,
} from "./schema.js";
import {
  booleanConstraint,
  candidateLabel,
  compactPath,
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  firstMapping,
  isScalar,
  issueCodes,
  itemDataProcessorName,
  listItemField,
  mappingOrList,
  oneProblem,
  onlyTemplateControlFields,
  originalSemantic,
  problem,
  resourceLocation,
  resolvedRegisteredFields,
  scalarText,
  suppressUnselectedVariantRequirements,
  valueAt,
  withoutIdControlValidation,
  type RecordValue,
} from "./shared.js";

import { Messages } from "../../messages.js";
function recipeFields(
  root: unknown,
  recipeType: string | undefined,
  hasExplicitResult: boolean,
  context: SchemaContext,
): readonly SchemaField[] {
  const schemaContext: RecipeSchemaContext = {
    ...context,
    ...(recipeType === undefined ? {} : { recipeType }),
    recipeHasExplicitResult: hasExplicitResult,
  };
  const node = valueAt(root, context.path, 1);
  const base = withoutIdControlValidation(
    suppressUnselectedVariantRequirements(
      recipeItemDataContext(schemaContext)?.path.length === 2
        ? resolvedRegisteredFields(node, itemDataProcessorField)
        : recipeFieldsForContext(schemaContext),
      context,
    ),
  );
  const additions: SchemaField[] = [];
  if (isRecord(node)) {
    for (const key of Object.keys(node)) {
      if (exactFieldForName(key, base)) continue;
      const dynamic = recipeDynamicValueField(schemaContext, key);
      if (dynamic) additions.push(dynamicValidationField(dynamic, key));
    }
  }
  return [...exactFields(base), ...additions];
}

function recipeDiscriminatorRegistry(
  context: SchemaContext,
): RecipeDiscriminatorRegistry | undefined {
  const nested = compactPath(context.path);
  if (nested.length === 1 && nested[0] === "type") return "recipe";
  const parent = nested.slice(0, -1);
  const tail = parent.at(-1);
  if (tail === "predicate" || tail === "predicates")
    return "ingredient-predicate";
  if (tail === "transform_processors" || tail === "post_processors") {
    return ["result", "visual_result", "target"].includes(parent[0] ?? "")
      ? "result-post-processor"
      : "transform-processor";
  }
  if (
    tail === "conditions" ||
    tail === "condition" ||
    tail === "terms" ||
    tail === "term"
  )
    return "condition";
  if (tail === "functions" || tail === "function") return "function";
  return undefined;
}

function recipeConstraint(
  rawId: string,
  recipeType: string | undefined,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const boolean = booleanConstraint("recipe", context);
  if (boolean) return boolean;
  const semantic = originalSemantic(context.field);
  const relative = context.path.slice(1);
  const atRecipeRoot = relative.length === 1;

  if (semantic === "type") {
    if (typeof context.value !== "string" || context.value.trim() === "") {
      return oneProblem(
        problem(
          "invalid-recipe-type",
          Messages.src.config.validation.recipe.text0001(rawId),
        ),
        true,
      );
    }
    const registry = recipeDiscriminatorRegistry(context);
    if (registry) {
      const resolved = resolveRecipeDiscriminator(registry, context.value);
      if (
        resolved.kind === "known" ||
        resolved.kind === "external" ||
        resolved.kind === "owned-unknown"
      )
        return { replaceBuiltIn: true };
      return oneProblem(
        problem(
          atRecipeRoot ? "invalid-recipe-type" : "invalid-recipe-enum",
          Messages.src.config.validation.recipe.text0002(
            rawId,
            atRecipeRoot ? "serializer" : context.fieldPath,
            context.value,
          ),
        ),
        true,
      );
    }
  }

  const configuredKey = dynamicKey(context.field);
  const parentTail = relative
    .slice(0, -1)
    .map((part) => part.replaceAll("-", "_"))
    .filter((part) => !/^\d+$/u.test(part))
    .at(-1);
  if (
    configuredKey !== undefined &&
    (parentTail === "ingredients" || parentTail === "ingredient")
  ) {
    const normalized = normalizeRecipeType(recipeType);
    if (
      (normalized === "shaped" || normalized === "shaped_transform") &&
      (configuredKey.length !== 1 || configuredKey === " ")
    ) {
      return oneProblem(
        problem(
          "invalid-recipe-ingredient-key",
          Messages.src.config.validation.recipe.text0003(rawId),
          "key",
        ),
      );
    }
  }

  if (
    configuredKey !== undefined &&
    originalSemantic(context.field) ===
      Messages.src.config.validation.recipe.text0004
  ) {
    const number = finiteSchemaNumber(context.value);
    if (
      number !== undefined &&
      (!Number.isInteger(number) || number < 1 || number > 255)
    ) {
      return oneProblem(
        problem(
          "invalid-recipe-enchantment-level",
          Messages.src.config.validation.recipe.text0005(rawId),
        ),
      );
    }
  }

  if (semantic === "pattern") {
    const rows =
      typeof context.value === "string"
        ? [context.value]
        : isUnknownArray(context.value) &&
            context.value.every((entry) => typeof entry === "string")
          ? context.value
          : undefined;
    if (!rows)
      return oneProblem(
        problem(
          "invalid-recipe-pattern",
          Messages.src.config.validation.recipe.text0006(rawId),
        ),
      );
    if (
      rows.length < 1 ||
      rows.length > 3 ||
      rows.some((row) => row.length < 1 || row.length > 3) ||
      new Set(rows.map((row) => row.length)).size !== 1
    ) {
      return oneProblem(
        problem(
          "invalid-recipe-pattern",
          Messages.src.config.validation.recipe.text0007(rawId),
        ),
      );
    }
  }

  if (
    semantic === "category" &&
    context.field.values &&
    typeof context.value === "string" &&
    context.field.values.includes(context.value.toLowerCase())
  ) {
    return { replaceBuiltIn: true };
  }
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
    semantic === "component" &&
    resolveRecipeDiscriminator(
      "ingredient-predicate",
      context.siblingValues.get("type"),
    ).name === "exact"
  ) {
    if (typeof context.value !== "string" || !resourceLocation(context.value)) {
      return oneProblem(
        problem(
          "invalid-recipe-component",
          Messages.src.config.validation.recipe.text0008(rawId),
        ),
        true,
      );
    }
    const canonical = context.value.includes(":")
      ? context.value
      : `minecraft:${context.value}`;
    if (
      canonical.startsWith("minecraft:") &&
      dataComponentDefinition(canonical) === undefined
    ) {
      return oneProblem(
        problem(
          "unknown-recipe-component",
          Messages.src.config.validation.recipe.text0009(rawId, canonical),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }

  if (
    atRecipeRoot &&
    (semantic === "result" || semantic === "visual_result") &&
    typeof context.value !== "string" &&
    !isRecord(context.value)
  ) {
    return oneProblem(
      problem(
        "invalid-recipe-result",
        Messages.src.config.validation.recipe.text0010(
          rawId,
          context.fieldName,
        ),
      ),
    );
  }
  if (atRecipeRoot && semantic === "ingredients") {
    const normalized = normalizeRecipeType(recipeType);
    const valid =
      normalized === "shaped" || normalized === "shaped_transform"
        ? isRecord(context.value)
        : normalized === "shapeless"
          ? mappingOrList(context.value)
          : normalized === "shapeless_transform"
            ? isScalar(context.value) || mappingOrList(context.value)
            : true;
    if (!valid)
      return oneProblem(
        problem(
          "invalid-recipe-ingredients",
          Messages.src.config.validation.recipe.text0011(rawId),
        ),
      );
  }

  const ingredientSemantics = new Set([
    "ingredient",
    "ingredients",
    "target",
    "dye",
    "template_type",
    "base",
    "addition",
    "container",
    "items",
    "item",
  ]);
  if (semantic === "target" && isRecord(context.value))
    return { replaceBuiltIn: true };
  if (
    semantic === "target" &&
    context.field.values &&
    typeof context.value === "string"
  ) {
    return context.field.values.includes(context.value)
      ? { replaceBuiltIn: true }
      : oneProblem(
          problem(
            "invalid-recipe-enum",
            Messages.src.config.validation.recipe.text0012(
              rawId,
              context.fieldPath,
              context.field.values.join("、"),
            ),
          ),
          true,
        );
  }
  if (
    !atRecipeRoot &&
    ingredientSemantics.has(semantic) &&
    typeof context.value !== "string" &&
    !mappingOrList(context.value)
  ) {
    return oneProblem(
      problem(
        "invalid-recipe-ingredient",
        Messages.src.config.validation.recipe.text0013(
          rawId,
          context.fieldName,
        ),
      ),
    );
  }
  if (
    semantic === "id" &&
    (typeof context.value !== "string" || context.value.trim() === "")
  ) {
    return oneProblem(
      problem(
        "invalid-recipe-result-id",
        Messages.src.config.validation.recipe.text0014(rawId),
      ),
    );
  }
  if (
    ["keep_components", "keep_tags", "keep_custom_data"].includes(
      resolveRecipeDiscriminator(
        "transform-processor",
        context.siblingValues.get("type"),
      ).name ?? "",
    ) &&
    ["components", "tags", "paths"].includes(semantic)
  ) {
    if (
      !isUnknownArray(context.value) ||
      context.value.length === 0 ||
      context.value.some(
        (entry) => typeof entry !== "string" || entry.length === 0,
      )
    ) {
      return oneProblem(
        problem(
          "invalid-recipe-nonempty-string-list",
          Messages.src.config.validation.recipe.text0015(
            rawId,
            context.fieldPath,
          ),
        ),
      );
    }
  }
  if (
    semantic === "predicates" &&
    isUnknownArray(context.value) &&
    context.value.length > 0 &&
    resolveRecipeDiscriminator(
      "ingredient-predicate",
      context.siblingValues.get("type"),
    ).name === "all_of"
  ) {
    return oneProblem(
      problem(
        "known-broken-recipe-all-of",
        Messages.src.config.validation.recipe.text0016(rawId),
      ),
      false,
    );
  }
  if (itemDataProcessorName(context) === "dynamic_lore") {
    const mapping = firstMapping(context.value);
    if (mapping === undefined || Object.keys(mapping).length === 0) {
      return oneProblem(
        problem(
          "invalid-recipe-nonempty-mapping",
          Messages.src.config.validation.recipe.text0017(
            rawId,
            context.fieldPath,
          ),
        ),
        true,
      );
    }
  }
  return undefined;
}

function configuredBooleanTrue(value: unknown): boolean {
  try {
    return craftEngineBoolean(value);
  } catch {
    return false;
  }
}

function recipeTreeIssues(
  candidate: ConfigurationCandidateInput,
  raw: RecordValue,
  recipeType: string | undefined,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const normalized = normalizeRecipeType(recipeType);
  const pattern =
    typeof raw.pattern === "string"
      ? [raw.pattern]
      : isUnknownArray(raw.pattern) &&
          raw.pattern.every((entry) => typeof entry === "string")
        ? raw.pattern
        : [];
  const symbols = pattern
    .join("")
    .split("")
    .filter((character) => character !== " ");
  if (
    (normalized === "shaped" || normalized === "shaped_transform") &&
    pattern.length > 0 &&
    symbols.length === 0
  ) {
    issues.push(
      customIssue(
        candidate.source,
        "invalid-recipe-pattern-symbols",
        Messages.src.config.validation.recipe.text0018(candidate.rawId),
        "error",
        "pattern",
      ),
    );
  }
  if (
    (normalized === "shaped" || normalized === "shaped_transform") &&
    isRecord(raw.ingredients)
  ) {
    for (const symbol of new Set(symbols)) {
      if (Object.hasOwn(raw.ingredients, symbol)) continue;
      issues.push(
        customIssue(
          candidate.source,
          "missing-recipe-pattern-ingredient",
          Messages.src.config.validation.recipe.text0019(
            candidate.rawId,
            symbol,
          ),
          "error",
          "ingredients",
        ),
      );
    }
    for (const key of Object.keys(raw.ingredients)) {
      if (symbols.includes(key)) continue;
      issues.push(
        customIssue(
          candidate.source,
          "unused-recipe-ingredient",
          Messages.src.config.validation.recipe.text0020(candidate.rawId, key),
          "warning",
          `ingredients.${key}`,
          true,
        ),
      );
    }
  }
  if (normalized === "shaped_transform" && isRecord(raw.ingredients)) {
    const sources = Object.entries(raw.ingredients).filter(
      ([, ingredient]) =>
        isRecord(ingredient) && configuredBooleanTrue(ingredient.source),
    );
    if (sources.length !== 1) {
      issues.push(
        customIssue(
          candidate.source,
          "invalid-recipe-transform-source",
          Messages.src.config.validation.recipe.text0021(candidate.rawId),
          "error",
          "ingredients",
        ),
      );
    } else {
      const symbol = sources[0]![0];
      if (
        symbols.filter((candidateSymbol) => candidateSymbol === symbol)
          .length !== 1
      ) {
        issues.push(
          customIssue(
            candidate.source,
            "invalid-recipe-transform-source-count",
            Messages.src.config.validation.recipe.text0022(
              candidate.rawId,
              symbol,
            ),
            "error",
            "pattern",
          ),
        );
      }
    }
  }
  if (normalized === "shapeless_transform" && !isScalar(raw.ingredients)) {
    if (
      (isUnknownArray(raw.ingredients)
        ? raw.ingredients
        : isRecord(raw.ingredients)
          ? Object.values(raw.ingredients)
          : []
      ).filter(
        (ingredient) =>
          isRecord(ingredient) && configuredBooleanTrue(ingredient.source),
      ).length !== 1
    ) {
      issues.push(
        customIssue(
          candidate.source,
          "invalid-recipe-transform-source",
          Messages.src.config.validation.recipe.text0023(candidate.rawId),
          "error",
          "ingredients",
        ),
      );
    }
  }
  if (
    (normalized === "shaped_transform" ||
      normalized === "shapeless_transform") &&
    raw.visual_result !== undefined
  ) {
    issues.push(
      customIssue(
        candidate.source,
        "known-broken-transform-visual-result",
        Messages.src.config.validation.recipe.text0024(candidate.rawId),
        "warning",
        "visual_result",
      ),
    );
  }
  return issues;
}

export function validateRecipe(
  candidate: ConfigurationCandidateInput,
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const raw = isRecord(candidate.value) ? candidate.value : undefined;
  const recipeType = scalarText(raw?.type);
  const hasExplicitResult = raw ? Object.hasOwn(raw, "result") : false;
  const issues = validateSchema({
    value: candidate.value,
    source: candidate.source,
    path: [candidate.rawId],
    domainLabel: candidateLabel(candidate),
    fieldsForContext: (context) =>
      recipeFields(candidate.value, recipeType, hasExplicitResult, context),
    configVersion,
    issueCodes: issueCodes("recipe"),
    unknownField: (context) => {
      const schemaContext: RecipeSchemaContext = {
        ...context,
        ...(recipeType === undefined ? {} : { recipeType }),
        recipeHasExplicitResult: hasExplicitResult,
      };
      switch (resolveRecipeDiscriminator("recipe", recipeType).kind) {
        case "external":
        case "owned-unknown":
          return "skip";
      }
      if (recipeOpaqueSubtree(schemaContext)) return "skip";
      if (recipeExternalDiscriminatorSubtree(schemaContext)) return "skip";
      if (recipeDynamicKeyField(schemaContext)) return "open";
      const fields = recipeFieldsForContext(schemaContext);
      if (fields.length === 0 || onlyTemplateControlFields(fields))
        return "skip";
      const registry = recipeDiscriminatorRegistry({
        ...context,
        path: [...context.path, "type"],
      });
      if (registry) {
        if (
          resolveRecipeDiscriminator(
            registry,
            context.siblingValues.get("type"),
          ).kind !== "known"
        )
          return "skip";
      }
      return "diagnose";
    },
    listItemFieldForContext: (context) =>
      listItemField(recipeListItemField(context.path)),
    constraints: (context) =>
      recipeConstraint(candidate.rawId, recipeType, context),
  });
  return raw === undefined
    ? issues
    : [...issues, ...recipeTreeIssues(candidate, raw, recipeType)];
}
