import type { CoreIssue } from "../diagnostics/model.js";
import type { BlockDefinition } from "../config/block/model.js";
import { evaluateExpression } from "../config/expression/evaluator.js";
import type { ImageDefinition } from "../config/image/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import type {
  ConfigurationSource,
  WorkspaceCrossDomainReference,
  WorkspaceCrossDomainReferenceKind,
} from "../config/model.js";
import { normalizeRecipeType } from "../config/recipe/schema.js";
import type {
  GenericResourceDefinition,
  GenericResourceKind,
} from "../config/resource/model.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../util/identifiers.js";
import { appendPath as at, canonicalPath } from "../util/paths.js";
import { isRecord, isUnknownArray } from "../util/records.js";

import { Messages } from "../messages.js";
export interface CrossDomainVanillaRegistries {
// undefined 表示没有提供这份名称列表, 和空列表含义不同
  readonly items?: ReadonlySet<string> | undefined;
  readonly blocks?: ReadonlySet<string> | undefined;
  readonly recipes?: ReadonlySet<string> | undefined;
  readonly paintingVariants?: ReadonlySet<string> | undefined;
  readonly configuredFeatures?: ReadonlySet<string> | undefined;
  readonly placedFeatures?: ReadonlySet<string> | undefined;
}

export interface CrossDomainReferenceInput {
  readonly images: readonly ImageDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly blocks: readonly BlockDefinition[];
  readonly genericResources: readonly GenericResourceDefinition[];
  readonly vanilla: CrossDomainVanillaRegistries;
  readonly includeInactiveDiagnostics?: boolean;
}

type IndexedKind = "image" | "item" | "block" | GenericResourceKind;

interface ReferenceTarget {
  readonly kind: WorkspaceCrossDomainReferenceKind;
  readonly label: string;
  readonly invalidCode: string;
  readonly unknownCode: string;
  readonly severity: CoreIssue["severity"];
  readonly vanilla?: ReadonlySet<string> | undefined;
  readonly allowUnknownExternalNamespace?: boolean;
  readonly normalize?: (value: string) => string | undefined;
}

interface ReferenceIndex {
  readonly ids: ReadonlyMap<
    IndexedKind,
    ReadonlyMap<string, ReadonlySet<string>>
  >;
  readonly packNamespaces: ReadonlyMap<string, ReadonlySet<string>>;
}

interface ValidationContext {
  readonly index: ReferenceIndex;
  readonly vanilla: CrossDomainVanillaRegistries;
  readonly issues: CoreIssue[];
  readonly references: WorkspaceCrossDomainReference[];
  readonly reportIssues: boolean;
}

function issue(
  source: ConfigurationSource,
  fieldPath: string,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range:
      source.fieldValueRanges.get(fieldPath) ??
      source.fieldKeyRanges.get(fieldPath) ??
      source.entryRange,
  };
}

function normalizedRegistry(
  values: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined {
  if (values === undefined) return undefined;
  const result = new Set<string>();
  for (const value of values) {
    const id = makeIdentifier(value.toLowerCase(), "minecraft");
    if (isValidIdentifier(id)) result.add(id);
  }
  return result;
}

function buildReferenceIndex(input: CrossDomainReferenceInput): ReferenceIndex {
  const mutableIds = new Map<IndexedKind, Map<string, Set<string>>>();
  const mutablePackNamespaces = new Map<string, Set<string>>();
  const add = (
    kind: IndexedKind,
    definition: Pick<
      | ImageDefinition
      | ItemDefinition
      | BlockDefinition
      | GenericResourceDefinition,
      "id" | "source"
    >,
  ): void => {
    const root = canonicalPath(definition.source.pack.resourcesRoot);
    const namespaces = mutablePackNamespaces.get(root) ?? new Set<string>();
    namespaces.add(definition.source.pack.namespace.toLowerCase());
    mutablePackNamespaces.set(root, namespaces);
    if (!definition.source.pack.active) return;
    const byRoot = mutableIds.get(kind) ?? new Map<string, Set<string>>();
    const ids = byRoot.get(root) ?? new Set<string>();
    ids.add(definition.id.toLowerCase());
    byRoot.set(root, ids);
    mutableIds.set(kind, byRoot);
  };
  for (const image of input.images) add("image", image);
  for (const item of input.items) add("item", item);
  for (const block of input.blocks) add("block", block);
  for (const resource of input.genericResources) add(resource.kind, resource);
  return { ids: mutableIds, packNamespaces: mutablePackNamespaces };
}

function validateReference(
  source: ConfigurationSource,
  fieldPath: string,
  rawValue: unknown,
  target: ReferenceTarget,
  context: ValidationContext,
): void {
  if (typeof rawValue !== "string" || rawValue.includes("${")) return;
  const id =
    target.normalize === undefined
      ? makeIdentifier(rawValue.toLowerCase(), "minecraft")
      : target.normalize(rawValue);
  if (id === undefined) return;
  const valid = isValidIdentifier(id);
  context.references.push({
    kind: target.kind,
    identifier: id,
    valid,
    uri: source.uri,
    range:
      source.fieldValueRanges.get(fieldPath) ??
      source.fieldKeyRanges.get(fieldPath) ??
      source.entryRange,
  });
  if (!valid) {
    if (!context.reportIssues) return;
    context.issues.push(
      issue(
        source,
        fieldPath,
        target.invalidCode,
        Messages.src.references.crossDomain.text0001(target.label, rawValue),
        "error",
      ),
    );
    return;
  }
  if (
    context.index.ids
      .get(target.kind)
      ?.get(canonicalPath(source.pack.resourcesRoot))
      ?.has(id) === true ||
    target.vanilla?.has(id) === true
  )
    return;
  if (
    Object.hasOwn(target, "vanilla") &&
    target.vanilla === undefined &&
    splitIdentifier(id, "minecraft")[0] === "minecraft"
  )
    return;
  if (target.allowUnknownExternalNamespace === true) {
    const [namespace] = splitIdentifier(id, "minecraft");
    if (
      namespace !== "minecraft" &&
      context.index.packNamespaces
        .get(canonicalPath(source.pack.resourcesRoot))
        ?.has(namespace) !== true
    )
      return;
  }
  if (!context.reportIssues) return;
  context.issues.push(
    issue(
      source,
      fieldPath,
      target.unknownCode,
      Messages.src.references.crossDomain.text0002(target.label, id),
      target.severity,
    ),
  );
}

function values(value: unknown): readonly unknown[] {
  return isUnknownArray(value) ? value : [value];
}

function selectedField(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): readonly [name: string, value: unknown] | undefined {
  for (const name of names)
    if (Object.hasOwn(raw, name)) return [name, raw[name]];
  return undefined;
}

function normalizedCraftEngineKey(value: string): string | undefined {
  const [namespace, name] = splitIdentifier(
    (value.split("#", 1)[0] ?? value).replaceAll("-", "_"),
    "craftengine",
  );
  return namespace === "craftengine" ? name : undefined;
}

function typeInNamespace(
  value: unknown,
  defaultNamespace: string,
): readonly [namespace: string, name: string] | undefined {
  if (typeof value !== "string" || value.includes("${")) return undefined;
  return splitIdentifier(value, defaultNamespace);
}

function validateItemReferences(
  item: ItemDefinition,
  context: ValidationContext,
): void {
  if (Object.hasOwn(item.raw, "category"))
    values(item.raw.category).forEach((value, index) =>
      validateReference(
        item.source,
        isUnknownArray(item.raw.category) ? at("category", index) : "category",
        value,
        {
          kind: "category",
          label: Messages.src.references.crossDomain.text0003,
          invalidCode: "invalid-category-reference",
          unknownCode: "unknown-category-reference",
          severity: "warning",
        },
        context,
      ),
    );

  if (isRecord(item.raw.data))
    for (const [key, value] of Object.entries(item.raw.data)) {
      if (normalizedCraftEngineKey(key) !== "painting_variant") continue;
      validateReference(
        item.source,
        at("data", key),
        value,
        {
          kind: "painting",
          label: Messages.src.references.crossDomain.text0004,
          invalidCode: "invalid-painting-reference",
          unknownCode: "unknown-painting-reference",
          severity: "error",
          vanilla: context.vanilla.paintingVariants,
        },
        context,
      );
    }

  if (isRecord(item.raw.settings))
    for (const [key, value] of Object.entries(item.raw.settings)) {
      const normalized = normalizedCraftEngineKey(key);
      if (
        normalized !== "craft_remainder" &&
        normalized !== "craft_remaining_item"
      )
        continue;
      validateCraftRemainder(value, item.source, at("settings", key), context);
    }
}

function validateCraftRemainder(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      validateCraftRemainder(entry, source, at(fieldPath, index), context),
    );
    return;
  }
  if (!isRecord(value)) return;
  const type = typeInNamespace(value.type, "craftengine");
  if (!type || type[0] !== "craftengine" || type[1] !== "recipe_based") return;
  const termsValue = value.terms;
  values(termsValue).forEach((term, termIndex) => {
    if (!isRecord(term)) return;
    const termPath = isUnknownArray(termsValue)
      ? at(at(fieldPath, "terms"), termIndex)
      : at(fieldPath, "terms");
    const recipes = term.recipes;
    values(recipes).forEach((recipe, recipeIndex) =>
      validateReference(
        source,
        isUnknownArray(recipes)
          ? at(at(termPath, "recipes"), recipeIndex)
          : at(termPath, "recipes"),
        recipe,
        {
          kind: "recipe",
          label: Messages.src.references.crossDomain.text0005,
          invalidCode: "invalid-recipe-reference",
          unknownCode: "unknown-recipe-reference",
          severity: "error",
          vanilla: context.vanilla.recipes,
        },
        context,
      ),
    );
    const nested = selectedField(term, [
      "craft_remainder",
      "craft_remaining_item",
      "craft-remainder",
      "craft-remaining-item",
    ]);
    if (nested)
      validateCraftRemainder(
        nested[1],
        source,
        at(termPath, nested[0]),
        context,
      );
  });
  if (Object.hasOwn(value, "fallback"))
    validateCraftRemainder(
      value.fallback,
      source,
      at(fieldPath, "fallback"),
      context,
    );
}

function validateBlockReferences(
  block: BlockDefinition,
  context: ValidationContext,
): void {
  const selected = selectedField(block.raw, ["behavior", "behaviors"]);
  if (!selected) return;
  values(selected[1]).forEach((behavior, index) => {
    if (!isRecord(behavior)) return;
    const behaviorPath = isUnknownArray(selected[1])
      ? at(selected[0], index)
      : selected[0];
    const type = typeInNamespace(behavior.type, "craftengine");
    if (!type || type[0] !== "craftengine") return;
    if (type[1] === "sapling_block") {
      const feature = selectedField(behavior, [
        "feature",
        "configured_feature",
        "configured-feature",
      ]);
      if (feature)
        validateReference(
          block.source,
          at(behaviorPath, feature[0]),
          feature[1],
          {
            kind: "configured-feature",
            label: Messages.src.references.crossDomain.text0016,
            invalidCode: "invalid-configured-feature-reference",
            unknownCode: "unknown-configured-feature-reference",
            severity: "warning",
            vanilla: context.vanilla.configuredFeatures,
            allowUnknownExternalNamespace: true,
          },
          context,
        );
    } else if (type[1] === "grass_block") {
      const feature = selectedField(behavior, [
        "feature",
        "placed_feature",
        "placed-feature",
      ]);
      if (feature)
        validateReference(
          block.source,
          at(behaviorPath, feature[0]),
          feature[1],
          {
            kind: "placed-feature",
            label: Messages.src.references.crossDomain.text0017,
            invalidCode: "invalid-placed-feature-reference",
            unknownCode: "unknown-placed-feature-reference",
            severity: "warning",
            vanilla: context.vanilla.placedFeatures,
            allowUnknownExternalNamespace: true,
          },
          context,
        );
    }
  });
}

function validateCategoryReferences(
  resource: GenericResourceDefinition,
  context: ValidationContext,
): void {
  if (Object.hasOwn(resource.raw, "icon"))
    validateReference(
      resource.source,
      "icon",
      resource.raw.icon,
      {
        kind: "item",
        label: Messages.src.references.crossDomain.text0006,
        invalidCode: "invalid-item-reference",
        unknownCode: "unknown-item-reference",
        severity: "warning",
        vanilla: context.vanilla.items,
      },
      context,
    );
  if (!Object.hasOwn(resource.raw, "list")) return;
  const members = resource.raw.list;
  values(members).forEach((member, index) => {
    const memberPath = isUnknownArray(members) ? at("list", index) : "list";
    if (typeof member === "string" && member.startsWith("#")) {
      validateReference(
        resource.source,
        memberPath,
        member.slice(1),
        {
          kind: "category",
          label: Messages.src.references.crossDomain.text0007,
          invalidCode: "invalid-category-reference",
          unknownCode: "unknown-category-reference",
          severity: "warning",
        },
        context,
      );
      return;
    }
    validateReference(
      resource.source,
      memberPath,
      member,
      {
        kind: "item",
        label: Messages.src.references.crossDomain.text0008,
        invalidCode: "invalid-item-reference",
        unknownCode: "unknown-item-reference",
        severity: "warning",
        vanilla: context.vanilla.items,
      },
      context,
    );
  });
}

function craftEngineInteger(value: string): boolean {
  if (/^[+-]?\d+$/u.test(value.replaceAll("_", ""))) return true;
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" && Number.isFinite(evaluated);
  } catch {
    return false;
  }
}

function emojiImageIdentifier(value: string): string | undefined {
  const parts = value.split(":");
  if (parts.length !== 2 && parts.length !== 4) return undefined;
  if (
    parts.length === 4 &&
    (!craftEngineInteger(parts[2] ?? "") || !craftEngineInteger(parts[3] ?? ""))
  ) {
    return undefined;
  }
  return `${parts[0]?.toLowerCase() ?? ""}:${parts[1]?.toLowerCase() ?? ""}`;
}

function validateEmojiReferences(
  resource: GenericResourceDefinition,
  context: ValidationContext,
): void {
  if (
    !Object.hasOwn(resource.raw, "image") ||
    typeof resource.raw.image !== "string"
  )
    return;
  const raw = resource.raw.image;
  if (raw.includes("${")) return;
  if (emojiImageIdentifier(raw) === undefined) {
    if (!context.reportIssues) return;
    context.issues.push(
      issue(
        resource.source,
        "image",
        "invalid-image-reference",
        Messages.src.references.crossDomain.text0009(raw),
        "error",
      ),
    );
    return;
  }
  validateReference(
    resource.source,
    "image",
    raw,
    {
      kind: "image",
      label: Messages.src.references.crossDomain.text0010,
      invalidCode: "invalid-image-reference",
      unknownCode: "unknown-image-reference",
      severity: "error",
      normalize: emojiImageIdentifier,
    },
    context,
  );
}

function validateIngredient(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      validateIngredient(entry, source, at(fieldPath, index), context),
    );
    return;
  }
  if (typeof value === "string") {
    if (value.startsWith("#")) return;
    validateReference(
      source,
      fieldPath,
      value,
      {
        kind: "item",
        label: Messages.src.references.crossDomain.text0011,
        invalidCode: "invalid-item-reference",
        unknownCode: "unknown-item-reference",
        severity: "error",
        vanilla: context.vanilla.items,
      },
      context,
    );
    return;
  }
  if (!isRecord(value)) return;
  const item = selectedField(value, ["items", "item"]);
  if (!item) return;
  const itemPath = at(fieldPath, item[0]);
  values(item[1]).forEach((entry, index) => {
    if (typeof entry === "string" && entry.startsWith("#")) return;
    validateReference(
      source,
      isUnknownArray(item[1]) ? at(itemPath, index) : itemPath,
      entry,
      {
        kind: "item",
        label: Messages.src.references.crossDomain.text0012,
        invalidCode: "invalid-item-reference",
        unknownCode: "unknown-item-reference",
        severity: "error",
        vanilla: context.vanilla.items,
      },
      context,
    );
  });
}

function validateIngredientCollection(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  mappingEntries: boolean,
  context: ValidationContext,
): void {
  if (mappingEntries && isRecord(value)) {
    for (const [key, ingredient] of Object.entries(value)) {
      validateIngredient(ingredient, source, at(fieldPath, key), context);
    }
    return;
  }
  if (mappingEntries && isUnknownArray(value)) {
    value.forEach((ingredient, index) =>
      validateIngredient(ingredient, source, at(fieldPath, index), context),
    );
    return;
  }
  validateIngredient(value, source, fieldPath, context);
}

function validateResult(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (isRecord(value)) {
    if (Object.hasOwn(value, "id"))
      validateReference(
        source,
        at(fieldPath, "id"),
        value.id,
        {
          kind: "item",
          label: Messages.src.references.crossDomain.text0013,
          invalidCode: "invalid-item-reference",
          unknownCode: "unknown-item-reference",
          severity: "error",
          vanilla: context.vanilla.items,
        },
        context,
      );
    return;
  }
  validateReference(
    source,
    fieldPath,
    value,
    {
      kind: "item",
      label: Messages.src.references.crossDomain.text0014,
      invalidCode: "invalid-item-reference",
      unknownCode: "unknown-item-reference",
      severity: "error",
      vanilla: context.vanilla.items,
    },
    context,
  );
}

function validateRecipeReferences(
  resource: GenericResourceDefinition,
  context: ValidationContext,
): void {
  const recipeType =
    typeof resource.raw.type === "string"
      ? normalizeRecipeType(resource.raw.type)
      : undefined;
  if (recipeType === undefined) return;
  const ingredientFields: string[] = [];
  let collection = false;
  let acceptsResult = false;
  let acceptsVisualResult = false;
  switch (recipeType) {
    case "shaped":
    case "shaped_transform":
    case "shapeless":
    case "shapeless_transform":
      ingredientFields.push("ingredients", "ingredient");
      collection = true;
      acceptsResult = true;
      acceptsVisualResult = true;
      break;
    case "dye":
      ingredientFields.push("target", "dye");
      acceptsResult = true;
      break;
    case "cooking":
    case "stonecutting":
      ingredientFields.push("ingredients", "ingredient");
      acceptsResult = true;
      break;
    case "smithing_transform":
      ingredientFields.push(
        "template_type",
        "template-type",
        "base",
        "addition",
      );
      acceptsResult = true;
      acceptsVisualResult = true;
      break;
    case "smithing_trim":
      ingredientFields.push(
        "template_type",
        "template-type",
        "base",
        "addition",
      );
      break;
    case "brewing":
      ingredientFields.push("ingredients", "ingredient", "container");
      acceptsResult = true;
      break;
    default:
      return;
  }

  const processedAliases = new Set<string>();
  for (const fieldName of ingredientFields) {
    const semantic =
      fieldName === "ingredient"
        ? "ingredients"
        : fieldName === "template-type"
          ? "template_type"
          : fieldName;
    if (processedAliases.has(semantic)) continue;
    processedAliases.add(semantic);
    const selected = selectedField(
      resource.raw,
      semantic === "ingredients"
        ? ["ingredients", "ingredient"]
        : semantic === "template_type"
          ? ["template_type", "template-type"]
          : [fieldName],
    );
    if (!selected) continue;
    validateIngredientCollection(
      selected[1],
      resource.source,
      selected[0],
      collection &&
        (recipeType === "shaped" ||
          recipeType === "shaped_transform" ||
          recipeType === "shapeless" ||
          recipeType === "shapeless_transform"),
      context,
    );
  }
  if (acceptsResult && Object.hasOwn(resource.raw, "result")) {
    validateResult(resource.raw.result, resource.source, "result", context);
  }
  if (acceptsVisualResult) {
    const visual = selectedField(resource.raw, [
      "visual_result",
      "visual-result",
    ]);
    if (visual) validateResult(visual[1], resource.source, visual[0], context);
  }
}

function blockStateIdentifier(value: string): string | undefined {
  const properties = value.indexOf("[");
  return makeIdentifier(
    properties === -1 ? value : value.slice(0, properties),
    "minecraft",
  );
}

function validateWorldgenBlockReference(
  source: ConfigurationSource,
  fieldPath: string,
  value: unknown,
  context: ValidationContext,
  state: boolean,
): void {
  validateReference(
    source,
    fieldPath,
    value,
    {
      kind: "block",
      label: Messages.src.references.crossDomain.text0015,
      invalidCode: "invalid-block-reference",
      unknownCode: "unknown-block-reference",
      severity: "error",
      vanilla: context.vanilla.blocks,
      allowUnknownExternalNamespace: true,
      normalize: state
        ? blockStateIdentifier
        : (candidate) => makeIdentifier(candidate, "minecraft"),
    },
    context,
  );
}

function validateBlockStateValue(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
  allowDirectState: boolean,
): void {
  if (typeof value === "string") {
    if (allowDirectState)
      validateWorldgenBlockReference(source, fieldPath, value, context, true);
    return;
  }
  if (!isRecord(value) || !Object.hasOwn(value, "Name")) return;
  validateWorldgenBlockReference(
    source,
    at(fieldPath, "Name"),
    value.Name,
    context,
    false,
  );
}

function validateMatchingBlocks(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  values(value).forEach((entry, index) => {
    // 方块标签交给世界生成配置自己检查, 不当作方块定义引用
    if (typeof entry === "string" && entry.startsWith("#")) return;
    validateWorldgenBlockReference(
      source,
      isUnknownArray(value) ? at(fieldPath, index) : fieldPath,
      entry,
      context,
      false,
    );
  });
}

function validateBlockPredicate(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (!isRecord(value)) return;
  const type = typeInNamespace(value.type, "minecraft");
  if (!type || type[0] !== "minecraft") return;
  switch (type[1]) {
    case "matching_blocks": {
      if (Object.hasOwn(value, "blocks")) {
        validateMatchingBlocks(
          value.blocks,
          source,
          at(fieldPath, "blocks"),
          context,
        );
      }
      break;
    }
    case "would_survive": {
      if (Object.hasOwn(value, "state")) {
        validateBlockStateValue(
          value.state,
          source,
          at(fieldPath, "state"),
          context,
          false,
        );
      }
      break;
    }
    case "all_of":
    case "any_of": {
      if (!Object.hasOwn(value, "predicates")) break;
      const predicates = value.predicates;
      values(predicates).forEach((predicate, index) =>
        validateBlockPredicate(
          predicate,
          source,
          isUnknownArray(predicates)
            ? at(at(fieldPath, "predicates"), index)
            : at(fieldPath, "predicates"),
          context,
        ),
      );
      break;
    }
    case "not": {
      if (Object.hasOwn(value, "predicate")) {
        validateBlockPredicate(
          value.predicate,
          source,
          at(fieldPath, "predicate"),
          context,
        );
      }
      break;
    }
    default:
      break;
  }
}

function validatePlacementModifiers(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  values(value).forEach((modifier, index) => {
    if (!isRecord(modifier)) return;
    const type = typeInNamespace(modifier.type, "minecraft");
    if (
      !type ||
      type[0] !== "minecraft" ||
      type[1] !== "block_predicate_filter"
    )
      return;
    if (Object.hasOwn(modifier, "predicate")) {
      validateBlockPredicate(
        modifier.predicate,
        source,
        at(
          isUnknownArray(value) ? at(fieldPath, index) : fieldPath,
          "predicate",
        ),
        context,
      );
    }
  });
}

function validateBlockStateProvider(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (!isRecord(value)) return;
  const type = typeInNamespace(value.type, "minecraft");
  if (!type) return;
  const selected = `${type[0]}:${type[1]}`;
  if (
    selected === "craftengine:simple_state_provider" ||
    selected === "craftengine:rotated_block_provider"
  ) {
    if (Object.hasOwn(value, "state")) {
      validateBlockStateValue(
        value.state,
        source,
        at(fieldPath, "state"),
        context,
        true,
      );
    }
    return;
  }
  if (
    selected === "craftengine:weighted_state_provider" ||
    selected === "minecraft:weighted_state_provider"
  ) {
    if (!Object.hasOwn(value, "entries")) return;
    const entries = value.entries;
    values(entries).forEach((entry, index) => {
      if (!isRecord(entry) || !Object.hasOwn(entry, "data")) return;
      validateBlockStateValue(
        entry.data,
        source,
        at(
          isUnknownArray(entries)
            ? at(at(fieldPath, "entries"), index)
            : at(fieldPath, "entries"),
          "data",
        ),
        context,
        selected === "craftengine:weighted_state_provider",
      );
    });
    return;
  }
  if (selected === "craftengine:randomized_int_state_provider") {
    if (Object.hasOwn(value, "source")) {
      validateBlockStateProvider(
        value.source,
        source,
        at(fieldPath, "source"),
        context,
      );
    }
    return;
  }
  if (selected === "minecraft:simple_state_provider") {
    if (Object.hasOwn(value, "state")) {
      validateBlockStateValue(
        value.state,
        source,
        at(fieldPath, "state"),
        context,
        false,
      );
    }
    return;
  }
  if (
    selected !== "minecraft:rule_based_state_provider" ||
    !Object.hasOwn(value, "rules")
  )
    return;
  const rules = value.rules;
  values(rules).forEach((rule, index) => {
    if (!isRecord(rule)) return;
    const rulePath = isUnknownArray(rules)
      ? at(at(fieldPath, "rules"), index)
      : at(fieldPath, "rules");
    const predicate = selectedField(rule, ["if_true", "if-true"]);
    if (predicate)
      validateBlockPredicate(
        predicate[1],
        source,
        at(rulePath, predicate[0]),
        context,
      );
    if (Object.hasOwn(rule, "then")) {
      validateBlockStateProvider(
        rule.then,
        source,
        at(rulePath, "then"),
        context,
      );
    }
  });
}

function validateConfiguredFeatureBlockReferences(
  type: readonly [namespace: string, name: string],
  config: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  const selected = `${type[0]}:${type[1]}`;
  if (
    selected === "craftengine:simple_block" ||
    selected === "minecraft:simple_block"
  ) {
    const provider = selectedField(config, ["to_place", "to-place"]);
    if (provider)
      validateBlockStateProvider(
        provider[1],
        source,
        at(fieldPath, provider[0]),
        context,
      );
    return;
  }
  if (selected === "minecraft:block_column") {
    if (Object.hasOwn(config, "layers")) {
      const layers = config.layers;
      values(layers).forEach((layer, index) => {
        if (!isRecord(layer) || !Object.hasOwn(layer, "provider")) return;
        validateBlockStateProvider(
          layer.provider,
          source,
          at(
            isUnknownArray(layers)
              ? at(at(fieldPath, "layers"), index)
              : at(fieldPath, "layers"),
            "provider",
          ),
          context,
        );
      });
    }
    const predicate = selectedField(config, [
      "allowed_placement",
      "allowed-placement",
    ]);
    if (predicate)
      validateBlockPredicate(
        predicate[1],
        source,
        at(fieldPath, predicate[0]),
        context,
      );
    return;
  }
  if (selected === "minecraft:ore") {
    if (!Object.hasOwn(config, "targets")) return;
    const targets = config.targets;
    values(targets).forEach((target, index) => {
      if (!isRecord(target) || !Object.hasOwn(target, "state")) return;
      validateBlockStateValue(
        target.state,
        source,
        at(
          isUnknownArray(targets)
            ? at(at(fieldPath, "targets"), index)
            : at(fieldPath, "targets"),
          "state",
        ),
        context,
        false,
      );
    });
    return;
  }
  if (selected !== "minecraft:tree") return;
  for (const canonical of [
    "trunk_provider",
    "foliage_provider",
    "dirt_provider",
    "below_trunk_provider",
  ]) {
    const provider = selectedField(config, [
      canonical,
      canonical.replaceAll("_", "-"),
    ]);
    if (provider)
      validateBlockStateProvider(
        provider[1],
        source,
        at(fieldPath, provider[0]),
        context,
      );
  }
}

function validateConfiguredFeatureObject(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  const type = typeInNamespace(raw.type, "minecraft");
  if (!type || !isRecord(raw.config)) return;
  const configPath = at(fieldPath, "config");
  if (
    type[0] === "minecraft" &&
    type[1] === "random_patch" &&
    Object.hasOwn(raw.config, "feature")
  ) {
    validatePlacedFeatureValue(
      raw.config.feature,
      source,
      at(configPath, "feature"),
      context,
    );
  }
  // 只读取已经认识的字段, 其他游戏字段和扩展插件字段保持原样
  validateConfiguredFeatureBlockReferences(
    type,
    raw.config,
    source,
    configPath,
    context,
  );
}

function validatePlacedFeatureValue(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (!isRecord(value)) {
    validateReference(
      source,
      fieldPath,
      value,
      {
        kind: "placed-feature",
        label: Messages.src.references.crossDomain.text0017,
        invalidCode: "invalid-placed-feature-reference",
        unknownCode: "unknown-placed-feature-reference",
        severity: "error",
        vanilla: context.vanilla.placedFeatures,
        allowUnknownExternalNamespace: true,
      },
      context,
    );
    return;
  }
  const configured = value.feature;
  const configuredPath = at(fieldPath, "feature");
  if (isRecord(configured)) {
    validateConfiguredFeatureObject(
      configured,
      source,
      configuredPath,
      context,
    );
  } else {
    validateReference(
      source,
      configuredPath,
      configured,
      {
        kind: "configured-feature",
        label: Messages.src.references.crossDomain.text0016,
        invalidCode: "invalid-configured-feature-reference",
        unknownCode: "unknown-configured-feature-reference",
        severity: "error",
        vanilla: context.vanilla.configuredFeatures,
        allowUnknownExternalNamespace: true,
      },
      context,
    );
  }
  if (Object.hasOwn(value, "placement")) {
    validatePlacementModifiers(
      value.placement,
      source,
      at(fieldPath, "placement"),
      context,
    );
  }
}

function validateConfiguredFeatureValue(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  context: ValidationContext,
): void {
  if (isRecord(value)) {
    validateConfiguredFeatureObject(value, source, fieldPath, context);
    return;
  }
  validateReference(
    source,
    fieldPath,
    value,
    {
      kind: "configured-feature",
      label: Messages.src.references.crossDomain.text0016,
      invalidCode: "invalid-configured-feature-reference",
      unknownCode: "unknown-configured-feature-reference",
      severity: "error",
      vanilla: context.vanilla.configuredFeatures,
      allowUnknownExternalNamespace: true,
    },
    context,
  );
}

function validatePlacedFeatureReferences(
  resource: GenericResourceDefinition,
  context: ValidationContext,
): void {
  if (Object.hasOwn(resource.raw, "feature")) {
    validateConfiguredFeatureValue(
      resource.raw.feature,
      resource.source,
      "feature",
      context,
    );
  }
  if (Object.hasOwn(resource.raw, "placement")) {
    validatePlacementModifiers(
      resource.raw.placement,
      resource.source,
      "placement",
      context,
    );
  }
}

function analyzeCrossDomainReferences(
  input: CrossDomainReferenceInput,
): ValidationContext {
  const context: ValidationContext = {
    index: buildReferenceIndex(input),
    vanilla: {
      items: normalizedRegistry(input.vanilla.items),
      blocks: normalizedRegistry(input.vanilla.blocks),
      recipes: normalizedRegistry(input.vanilla.recipes),
      paintingVariants: normalizedRegistry(input.vanilla.paintingVariants),
      configuredFeatures: normalizedRegistry(input.vanilla.configuredFeatures),
      placedFeatures: normalizedRegistry(input.vanilla.placedFeatures),
    },
    issues: [],
    references: [],
    reportIssues: true,
  };
  const includeInactive = input.includeInactiveDiagnostics === true;
  for (const item of input.items) {
    validateItemReferences(
      item,
      includeInactive || item.source.pack.active
        ? context
        : { ...context, reportIssues: false },
    );
  }
  for (const block of input.blocks) {
    validateBlockReferences(
      block,
      includeInactive || block.source.pack.active
        ? context
        : { ...context, reportIssues: false },
    );
  }
  for (const resource of input.genericResources) {
    const ownerContext =
      includeInactive || resource.source.pack.active
        ? context
        : { ...context, reportIssues: false };
    switch (resource.kind) {
      case "category":
        validateCategoryReferences(resource, ownerContext);
        break;
      case "emoji":
        validateEmojiReferences(resource, ownerContext);
        break;
      case "recipe":
        validateRecipeReferences(resource, ownerContext);
        break;
      case "configured-feature":
        validateConfiguredFeatureObject(
          resource.raw,
          resource.source,
          "",
          ownerContext,
        );
        break;
      case "placed-feature":
        validatePlacedFeatureReferences(resource, ownerContext);
        break;
      default:
        break;
    }
  }
  return context;
}

export function collectCrossDomainReferences(
  input: CrossDomainReferenceInput,
): readonly WorkspaceCrossDomainReference[] {
  return analyzeCrossDomainReferences(input).references;
}

export function validateCrossDomainReferences(
  input: CrossDomainReferenceInput,
): readonly CoreIssue[] {
  return analyzeCrossDomainReferences(input).issues;
}
