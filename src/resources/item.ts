import type { ItemDefinition } from "../config/item/model.js";
import type {
  ConfigurationSource,
  OpaqueIdDefinition,
} from "../config/model.js";
import { localRegistryDiscriminator } from "../config/registry/discriminators.js";
import type { CoreIssue, TextRange } from "../diagnostics/model.js";
import { Messages } from "../messages.js";
import type { VanillaCatalog } from "../minecraft/catalog.js";
import { makeIdentifier } from "../util/identifiers.js";
import { canonicalPath } from "../util/paths.js";
import { isRecord, isUnknownArray } from "../util/records.js";
import {
  collectBlockGeneratedModels,
  generatedModelFromTextures,
} from "./blockGeneration.js";
import { preferredResource, readResourceTextInfo } from "./catalog.js";
import type { ResourceFileCatalog } from "./model.js";

interface References {
  readonly models: Set<string>;
  readonly textures: Set<string>;
  readonly generatedModels: Map<string, unknown>;
}

const INLINE_BLOCK_BEHAVIOR_TYPES = new Set([
  "block_item",
  "liquid_collision_block_item",
  "double_high_block_item",
  "wall_block_item",
  "ceiling_block_item",
  "ground_block_item",
  "multi_high_block_item",
]);

// 客户端会在图集中生成这些纹理, 资源包中没有独立图片文件
const ITEM_TRIM_PALETTE_PERMUTATIONS = new Set([
  "amethyst",
  "copper",
  "copper_darker",
  "diamond",
  "diamond_darker",
  "emerald",
  "gold",
  "gold_darker",
  "iron",
  "iron_darker",
  "lapis",
  "netherite",
  "netherite_darker",
  "quartz",
  "redstone",
  "resin",
]);

function assetIdentifier(value: string): string {
  return makeIdentifier(value, "minecraft");
}

function valueRange(
  source: ConfigurationSource,
  names: readonly string[],
): TextRange {
  for (const name of names) {
    const range =
      source.fieldValueRanges.get(name) ?? source.fieldKeyRanges.get(name);
    if (range) return range;
  }
  return source.idRange;
}

function issue(
  item: ItemDefinition,
  code: string,
  message: string,
  names: readonly string[],
  severity: CoreIssue["severity"] = "error",
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: item.source.uri,
    range: valueRange(item.source, names),
  };
}

function collectGeneration(
  value: unknown,
  references: References,
  modelId?: string,
): void {
  if (!isRecord(value)) return;
  if (modelId) references.generatedModels.set(assetIdentifier(modelId), value);
}

function collectModelTree(value: unknown, references: References): void {
  if (typeof value === "string") {
    references.models.add(assetIdentifier(value));
    return;
  }
  if (isUnknownArray(value)) {
    for (const entry of value) collectModelTree(entry, references);
    return;
  }
  if (!isRecord(value)) return;
  const type =
    typeof value.type === "string"
      ? localRegistryDiscriminator(value.type, "minecraft")
      : undefined;

  switch (type) {
    case "model":
    case undefined: {
      if (type === undefined && Object.hasOwn(value, "type")) return;
      const rawModel = value.path ?? value.model;
      if (typeof rawModel !== "string") return;

      const model = assetIdentifier(rawModel);
      collectGeneration(value.generation, references, model);
      references.models.add(model);
      return;
    }
    case "special": {
      const rawModel = value.base ?? value.path;
      if (typeof rawModel !== "string") return;

      const model = assetIdentifier(rawModel);
      collectGeneration(value.generation, references, model);
      references.models.add(model);
      return;
    }
    case "composite":
      collectModelTree(value.models, references);
      return;
    case "condition":
      collectModelTree(value.on_true ?? value["on-true"], references);
      collectModelTree(value.on_false ?? value["on-false"], references);
      return;
    case "range_dispatch":
      collectModelTree(value.fallback, references);
      for (const entry of isUnknownArray(value.entries)
        ? value.entries
        : value.entries === undefined
          ? []
          : [value.entries]) {
        if (isRecord(entry)) collectModelTree(entry.model, references);
      }
      return;
    case "select":
      collectModelTree(value.fallback, references);
      for (const entry of isUnknownArray(value.cases)
        ? value.cases
        : value.cases === undefined
          ? []
          : [value.cases]) {
        if (isRecord(entry)) collectModelTree(entry.model, references);
      }
      return;
  }
}

function collectLegacy(value: unknown, references: References): void {
  if (!isRecord(value)) return;
  const base = value.path ?? value.model;
  if (typeof base === "string") {
    const id = assetIdentifier(base);
    if (isRecord(value.generation)) {
      collectGeneration(value.generation, references, id);
      references.models.add(id);
    } else references.models.add(id);
  }
  for (const entry of isUnknownArray(value.overrides)
    ? value.overrides
    : value.overrides === undefined
      ? []
      : [value.overrides])
    if (isRecord(entry)) {
      const rawModel = entry.path ?? entry.model;
      if (typeof rawModel !== "string") continue;
      const id = assetIdentifier(rawModel);
      if (isRecord(entry.generation)) {
        collectGeneration(entry.generation, references, id);
        references.models.add(id);
      } else references.models.add(id);
    }
}

function selectedValue(
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): unknown {
  for (const name of names)
    if (Object.hasOwn(value, name) && value[name] !== null) return value[name];
  return undefined;
}

function collectImplicitItemModel(
  item: ItemDefinition,
  generatedModels: Map<string, unknown>,
): void {
  const textures = selectedValue(item.raw, ["texture", "textures"]);
  const explicitModel = selectedValue(item.raw, ["model", "models"]);
  if (textures === undefined || explicitModel !== undefined) return;
  // 只有省略输出路径时才继承物品命名空间, 显式资源 ID 仍按 minecraft 解析
  generatedModels.set(
    makeIdentifier(`item/${item.value}`, item.namespace),
    generatedModelFromTextures(textures),
  );
}

function collectItemGeneratedModels(
  item: ItemDefinition,
  generatedModels: Map<string, unknown>,
): void {
  const references: References = {
    models: new Set(),
    textures: new Set(),
    generatedModels,
  };
  const textures = selectedValue(item.raw, ["texture", "textures"]);
  if (textures === undefined) {
    collectModelTree(item.model, references);
  } else {
  // 同时有 path 和 model 时优先使用 path
    for (const output of isUnknownArray(item.model)
      ? item.model
      : [item.model]) {
      const rawPath =
        typeof output === "string"
          ? output
          : isRecord(output)
            ? typeof output.path === "string"
              ? output.path
              : typeof output.model === "string"
                ? output.model
                : undefined
            : undefined;
      if (rawPath)
        generatedModels.set(
          assetIdentifier(rawPath),
          generatedModelFromTextures(textures),
        );
    }
  }
  collectLegacy(item.legacyModel, references);
  collectImplicitItemModel(item, generatedModels);

  const behaviors = selectedValue(item.raw, ["behaviors", "behavior"]);
  for (const behavior of isUnknownArray(behaviors) ? behaviors : [behaviors]) {
    if (!isRecord(behavior) || typeof behavior.type !== "string") continue;
    const type = localRegistryDiscriminator(behavior.type, "craftengine");
    if (
      !type ||
      !INLINE_BLOCK_BEHAVIOR_TYPES.has(type) ||
      !isRecord(behavior.block)
    )
      continue;
    collectBlockGeneratedModels(behavior.block, generatedModels);
  }
}

function generatedModelsByRoot(
  items: readonly ItemDefinition[],
  includeInactive: boolean,
  supplementalDefinitions: readonly OpaqueIdDefinition[],
): ReadonlyMap<string, ReadonlyMap<string, unknown>> {
  const byRoot = new Map<string, Map<string, unknown>>();
  for (const item of items) {
    if (!includeInactive && !item.source.pack.active) continue;
    const root = canonicalPath(item.source.pack.resourcesRoot);
    const generated = byRoot.get(root) ?? new Map<string, unknown>();
    collectItemGeneratedModels(item, generated);
    byRoot.set(root, generated);
  }
  for (const definition of supplementalDefinitions) {
    if (!includeInactive && !definition.source.pack.active) continue;
    const root = canonicalPath(definition.source.pack.resourcesRoot);
    const generated = byRoot.get(root) ?? new Map<string, unknown>();
    if (definition.kind === "block" && isRecord(definition.raw)) {
      collectBlockGeneratedModels(definition.raw, generated);
    }
    byRoot.set(root, generated);
  }
  return byRoot;
}

function referencesFor(
  item: ItemDefinition,
  sharedGeneratedModels: ReadonlyMap<string, unknown>,
): References {
  const references: References = {
    models: new Set(),
    textures: new Set(),
    generatedModels: new Map(sharedGeneratedModels),
  };
  for (const texture of item.textures)
    references.textures.add(assetIdentifier(texture));
  if (item.textures.length === 0 && item.model !== undefined)
    collectModelTree(item.model, references);
  else if (isRecord(item.model)) collectModelTree(item.model, references);
  collectLegacy(item.legacyModel, references);
  return references;
}

function exists(
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog,
  item: ItemDefinition,
  kind: "model" | "texture" | "item-model",
  id: string,
): boolean {
  if (preferredResource(resources, item.source.pack.resourcesRoot, kind, id))
    return true;
  if (kind === "model") return vanilla.models.has(id);
  if (kind === "texture") {
    if (vanilla.textures.has(id)) return true;
    const trim =
      /^minecraft:trims\/items\/(helmet|chestplate|leggings|boots)_trim_(.+)$/u.exec(
        id,
      );
    return (
      trim !== null &&
      ITEM_TRIM_PALETTE_PERMUTATIONS.has(trim[2]!) &&
      vanilla.textures.has(`minecraft:trims/items/${trim[1]}_trim`)
    );
  }
  return vanilla.itemModels.has(id);
}

async function validateModelGraph(
  item: ItemDefinition,
  startingModel: string,
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog,
  references: References,
  issues: CoreIssue[],
  visiting: string[] = [],
  visited = new Set<string>(),
  overriddenTextureKeys = new Set<string>(),
): Promise<void> {
  const cycleStart = visiting.indexOf(startingModel);
  if (cycleStart >= 0) {
    issues.push(
      issue(
        item,
        "item-model-parent-cycle",
        Messages.src.resources.item.text0001(
          [...visiting.slice(cycleStart), startingModel].join(" → "),
        ),
        ["model", "models", "legacy_model", "legacy-model"],
      ),
    );
    return;
  }
  if (visited.has(startingModel) || vanilla.models.has(startingModel)) return;
  let model = references.generatedModels.get(startingModel);
  if (model === undefined) {
    const file = preferredResource(
      resources,
      item.source.pack.resourcesRoot,
      "model",
      startingModel,
    );
    if (!file) return;
    try {
      const resourceText = await readResourceTextInfo(file);
      if (resourceText.hasUtf8Bom) {
        issues.push(
          issue(
            item,
            "utf8-bom",
            Messages.src.resources.item.text0002(startingModel),
            ["model", "models", "legacy_model", "legacy-model"],
            "warning",
          ),
        );
      }
      model = JSON.parse(resourceText.text) as unknown;
    } catch {
      issues.push(
        issue(
          item,
          "invalid-model-json",
          Messages.src.resources.item.text0003(startingModel),
          ["model", "models", "legacy_model", "legacy-model"],
        ),
      );
      return;
    }
  }
  if (!isRecord(model)) {
    issues.push(
      issue(
        item,
        "invalid-model-json",
        Messages.src.resources.item.text0004(startingModel),
        ["model", "models", "legacy_model", "legacy-model"],
      ),
    );
    return;
  }
  visited.add(startingModel);
  const modelTextures = new Set<string>();
  const nextOverriddenTextureKeys = new Set(overriddenTextureKeys);
  if (isRecord(model.textures))
    for (const [key, texture] of Object.entries(model.textures)) {
      if (overriddenTextureKeys.has(key)) continue;
      nextOverriddenTextureKeys.add(key);
      if (typeof texture !== "string" || texture.startsWith("#")) continue;
      modelTextures.add(makeIdentifier(texture, "minecraft"));
    }
  for (const id of modelTextures) {
    if (!exists(resources, vanilla, item, "texture", id)) {
      issues.push(
        issue(
          item,
          "missing-item-texture",
          Messages.src.resources.item.text0005(startingModel, id),
          ["model", "models", "texture", "textures"],
        ),
      );
    }
  }
  if (typeof model.parent !== "string" || model.parent.startsWith("builtin/"))
    return;
  const parent = makeIdentifier(model.parent, "minecraft");
  if (
    !exists(resources, vanilla, item, "model", parent) &&
    !references.generatedModels.has(parent)
  ) {
    issues.push(
      issue(
        item,
        "missing-model-parent",
        Messages.src.resources.item.text0006(startingModel, parent),
        ["model", "models", "legacy_model", "legacy-model"],
      ),
    );
    return;
  }
  await validateModelGraph(
    item,
    parent,
    resources,
    vanilla,
    references,
    issues,
    [...visiting, startingModel],
    visited,
    nextOverriddenTextureKeys,
  );
}

export async function validateItemResources(
  items: readonly ItemDefinition[],
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog | undefined,
  includeInactive: boolean,
  supplementalDefinitions: readonly OpaqueIdDefinition[] = [],
): Promise<readonly CoreIssue[]> {
  if (!vanilla) return [];
  const issues: CoreIssue[] = [];
  const generatedByRoot = generatedModelsByRoot(
    items,
    includeInactive,
    supplementalDefinitions,
  );
  for (const item of items) {
    if (!includeInactive && !item.source.pack.active) continue;
    const references = referencesFor(
      item,
      generatedByRoot.get(canonicalPath(item.source.pack.resourcesRoot)) ??
        new Map(),
    );
    if (
      item.itemModel &&
      item.model === undefined &&
      item.textures.length === 0 &&
      !exists(resources, vanilla, item, "item-model", item.itemModel)
    ) {
      issues.push(
        issue(
          item,
          "missing-item-model",
          Messages.src.resources.item.text0007(item.itemModel),
          ["item_model", "item-model"],
        ),
      );
    }
    for (const texture of references.textures)
      if (!exists(resources, vanilla, item, "texture", texture)) {
        issues.push(
          issue(
            item,
            "missing-item-texture",
            Messages.src.resources.item.text0008(texture),
            ["texture", "textures", "model", "models"],
          ),
        );
      }
    for (const model of references.models) {
      if (
        !exists(resources, vanilla, item, "model", model) &&
        !references.generatedModels.has(model)
      ) {
        issues.push(
          issue(
            item,
            "missing-item-model-file",
            Messages.src.resources.item.text0009(model),
            ["model", "models", "legacy_model", "legacy-model"],
          ),
        );
        continue;
      }
      await validateModelGraph(
        item,
        model,
        resources,
        vanilla,
        references,
        issues,
      );
    }
  }
  return issues;
}
