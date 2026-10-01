import {
  CONDITION_TYPES,
  FUNCTION_TYPES,
  ITEM_BEHAVIOR_TYPES,
  itemFieldsForContext,
  itemListItemField,
  itemSchemaFieldForName,
} from "../config/item/schema.js";
import {
  BLOCK_BEHAVIOR_TYPES,
  BLOCK_PROPERTY_TYPES,
  BLOCK_RENDERER_TYPES,
  blockFieldsForContext,
  blockListItemField,
  blockSchemaFieldForName,
} from "../config/block/schema.js";
import {
  FURNITURE_BEHAVIOR_TYPES,
  FURNITURE_ELEMENT_TYPES,
  FURNITURE_HITBOX_TYPES,
  furnitureFieldsForContext,
  furnitureListItemField,
  furnitureSchemaFieldForName,
} from "../config/furniture/schema.js";
import {
  LOOT_ENTRY_TYPES,
  LOOT_FORMULA_TYPES,
  LOOT_FUNCTION_TYPES,
  VANILLA_LOOT_TYPES,
  lootFieldsForContext,
  lootListItemField,
  lootSchemaFieldForName,
} from "../config/loot/schema.js";
import type { BlockDefinition } from "../config/block/model.js";
import type { FurnitureDefinition } from "../config/furniture/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import type { LootDefinition } from "../config/loot/model.js";
import type { GenericResourceDefinition } from "../config/resource/model.js";
import {
  miscResourceFieldsForContext,
  miscResourceListItemField,
  miscResourceSchemaFieldForName,
} from "../config/resource/schema.js";
import { NUMBER_PROVIDER_TYPES } from "../config/number-provider/schema.js";
import { localRegistryDiscriminator } from "../config/registry/discriminators.js";
import type { SchemaValueProvider } from "../config/schema/types.js";
import type { TextRange } from "../diagnostics/model.js";
import { configValueAt } from "../util/configPath.js";
import { isValidIdentifier, makeIdentifier } from "../util/identifiers.js";
import { isRecord, isUnknownArray } from "../util/records.js";

export interface ConfigurationResourceReference {
  readonly kind: "texture" | "model";
  readonly identifier: string;
  readonly range: TextRange;
}

export type ConfigurationIdReferenceKind =
  | "item"
  | "block"
  | "furniture"
  | "loot"
  | "equipment"
  | "jukebox-song"
  | "entity"
  | "attribute"
  | "attribute-operation"
  | "equipment-set"
  | "template";

export interface ConfigurationIdReference {
  readonly kind: ConfigurationIdReferenceKind;
  readonly identifier: string;
  readonly range: TextRange;
}

function siblingValues(value: unknown): ReadonlyMap<string, string> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
        ? [[key, String(entry)] as const]
        : [],
    ),
  );
}

function recordInArrayForSegment(
  values: readonly unknown[],
  segment: string,
): Readonly<Record<string, unknown>> | undefined {
  const normalized = segment.split("#", 1)[0]?.replaceAll("-", "_");
  const records = values.filter(isRecord);
  return (
    records
      .filter((record) =>
        Object.keys(record).some(
          (key) => key.split("#", 1)[0]?.replaceAll("-", "_") === normalized,
        ),
      )
      .at(-1) ?? records.at(-1)
  );
}

function ancestorTypesForPath(
  raw: Readonly<Record<string, unknown>>,
  configurationPath: readonly string[],
): readonly string[] {
  const types: string[] = [];
  let current: unknown = raw;
  for (const segment of configurationPath.slice(1)) {
    if (isUnknownArray(current)) {
      if (/^\d+$/u.test(segment)) {
        current = current[Number(segment)];
        continue;
      }
      current = recordInArrayForSegment(current, segment);
    }
    if (!isRecord(current)) break;
    if (typeof current.type === "string") types.push(current.type);
    const exact = current[segment];
    if (exact !== undefined) current = exact;
    else {
      const normalized = segment.replaceAll("-", "_");
      const matchingKey = Object.keys(current).find(
        (key) =>
          key.split("#", 1)[0]?.replaceAll("-", "_") ===
          normalized.split("#", 1)[0],
      );
      current = matchingKey === undefined ? undefined : current[matchingKey];
    }
  }
  return types.reverse();
}

const ITEM_CRAFTENGINE_TYPES = new Set<string>([
  ...ITEM_BEHAVIOR_TYPES,
  ...FUNCTION_TYPES,
  ...CONDITION_TYPES,
  ...NUMBER_PROVIDER_TYPES,
]);
const BLOCK_CRAFTENGINE_TYPES = new Set<string>([
  ...BLOCK_BEHAVIOR_TYPES,
  ...BLOCK_PROPERTY_TYPES,
  ...BLOCK_RENDERER_TYPES,
  ...FUNCTION_TYPES,
  ...CONDITION_TYPES,
  ...NUMBER_PROVIDER_TYPES,
  "default",
]);
const FURNITURE_CRAFTENGINE_TYPES = new Set<string>([
  ...FURNITURE_BEHAVIOR_TYPES,
  ...FURNITURE_ELEMENT_TYPES,
  ...FURNITURE_HITBOX_TYPES,
  ...FUNCTION_TYPES,
  ...CONDITION_TYPES,
  ...NUMBER_PROVIDER_TYPES,
]);
const LOOT_CRAFTENGINE_TYPES = new Set<string>([
  ...LOOT_ENTRY_TYPES,
  ...LOOT_FUNCTION_TYPES,
  ...LOOT_FORMULA_TYPES,
  ...FUNCTION_TYPES,
  ...CONDITION_TYPES,
  ...NUMBER_PROVIDER_TYPES,
]);

function knownCraftEngineAncestor(
  rawType: string,
  known: ReadonlySet<string>,
): boolean {
  const local = localRegistryDiscriminator(
    rawType.startsWith("!") ? rawType.slice(1) : rawType,
  );
  return local !== undefined && known.has(local);
}

function normalizedItemPath(path: readonly string[]): readonly string[] {
  const result = path.map((entry) => entry.replaceAll("-", "_"));
  if (
    !["data", "client_bound_data"].includes(result[0] ?? "") ||
    result[1] === undefined
  )
    return result;
  const processor = localRegistryDiscriminator(
    result[1].replace(/#.*$/u, ""),
    "craftengine",
  );
  return processor === undefined
    ? result
    : [result[0]!, processor, ...result.slice(2)];
}

function opaqueItemListPath(
  path: readonly string[],
  ancestorTypes: readonly string[],
): boolean {
  const normalized = normalizedItemPath(path);
  const first = normalized[0];
  if (
    (first === "behavior" ||
      first === "behaviors" ||
      first === "event" ||
      first === "events") &&
    ancestorTypes.some(
      (type) => !knownCraftEngineAncestor(type, ITEM_CRAFTENGINE_TYPES),
    )
  )
    return true;
  if (
    (first === "data" || first === "client_bound_data") &&
    ["nbt", "tags"].includes(normalized[1] ?? "")
  )
    return true;
  const components = normalized.findIndex(
    (entry) => entry === "component" || entry === "components",
  );
  return (
    components >= 0 &&
    localRegistryDiscriminator(
      normalized[components + 1]?.replace(/#.*$/u, ""),
      "minecraft",
    ) === "custom_data"
  );
}

function opaqueBlockListPath(
  path: readonly string[],
  ancestorTypes: readonly string[],
): boolean {
  const first = path[0]?.replaceAll("-", "_");
  if (
    first !== "behavior" &&
    first !== "behaviors" &&
    first !== "state" &&
    first !== "states"
  )
    return false;
  return ancestorTypes.some(
    (type) => !knownCraftEngineAncestor(type, BLOCK_CRAFTENGINE_TYPES),
  );
}

function opaqueFurnitureListPath(
  path: readonly string[],
  ancestorTypes: readonly string[],
): boolean {
  const first = path[0]?.replaceAll("-", "_");
  if (first !== "behavior" && first !== "behaviors") return false;
  return ancestorTypes.some(
    (type) => !knownCraftEngineAncestor(type, FURNITURE_CRAFTENGINE_TYPES),
  );
}

function itemListProviderForPath(
  item: ItemDefinition,
  parent: readonly string[],
  ancestorTypes: readonly string[],
): SchemaValueProvider | undefined {
  if (opaqueItemListPath(parent, ancestorTypes)) return undefined;
  const fieldName = parent.at(-1);
  if (!fieldName) return undefined;
  const owner = parent.slice(0, -1);
  const ownerPath = [item.id, ...owner];
  const context = {
    path: ownerPath,
    siblingValues: siblingValues(configValueAt(item.raw, owner)),
    ancestorTypes: ancestorTypesForPath(item.raw, ownerPath),
  };
  if (
    !itemSchemaFieldForName(context, fieldName, itemFieldsForContext(context))
  )
    return undefined;
  return itemListItemField([item.id, ...parent])?.valueProvider;
}

function blockListProviderForPath(
  block: BlockDefinition,
  parent: readonly string[],
  ancestorTypes: readonly string[],
): SchemaValueProvider | undefined {
  if (opaqueBlockListPath(parent, ancestorTypes)) return undefined;
  const fieldName = parent.at(-1);
  if (!fieldName) return undefined;
  const owner = parent.slice(0, -1);
  const ownerPath = [block.id, ...owner];
  if (
    !blockSchemaFieldForName(
      fieldName,
      blockFieldsForContext({
        path: ownerPath,
        siblingValues: siblingValues(configValueAt(block.raw, owner)),
        ancestorTypes: ancestorTypesForPath(block.raw, ownerPath),
      }),
    )
  )
    return undefined;
  return blockListItemField([block.id, ...parent])?.valueProvider;
}

function furnitureListProviderForPath(
  furniture: FurnitureDefinition,
  parent: readonly string[],
  ancestorTypes: readonly string[],
): SchemaValueProvider | undefined {
  if (opaqueFurnitureListPath(parent, ancestorTypes)) return undefined;
  const fieldName = parent.at(-1);
  if (!fieldName) return undefined;
  const owner = parent.slice(0, -1);
  const ownerPath = [furniture.id, ...owner];
  if (
    !furnitureSchemaFieldForName(
      fieldName,
      furnitureFieldsForContext({
        path: ownerPath,
        siblingValues: siblingValues(configValueAt(furniture.raw, owner)),
        ancestorTypes: ancestorTypesForPath(furniture.raw, ownerPath),
      }),
    )
  )
    return undefined;
  return furnitureListItemField([furniture.id, ...parent])?.valueProvider;
}

function lootListProviderForPath(
  loot: LootDefinition,
  parent: readonly string[],
  ancestorTypes: readonly string[],
): SchemaValueProvider | undefined {
  if (
    ancestorTypes.some(
      (type) =>
        !(VANILLA_LOOT_TYPES as readonly string[]).includes(
          type.toLowerCase(),
        ) && !knownCraftEngineAncestor(type, LOOT_CRAFTENGINE_TYPES),
    )
  )
    return undefined;
  const fieldName = parent.at(-1);
  if (!fieldName) return undefined;
  const owner = parent.slice(0, -1);
  const ownerPath = [loot.id, ...owner];
  if (
    !lootSchemaFieldForName(
      fieldName,
      lootFieldsForContext({
        path: ownerPath,
        siblingValues: siblingValues(configValueAt(loot.raw, owner)),
        ancestorTypes: ancestorTypesForPath(loot.raw, ownerPath),
      }),
    )
  )
    return undefined;
  return lootListItemField([loot.id, ...parent])?.valueProvider;
}

function itemGenerationTextureProvider(
  item: ItemDefinition,
  parent: readonly string[],
): SchemaValueProvider | undefined {
  const normalized = parent.map((entry) => entry.replaceAll("-", "_"));
  const generation = normalized.lastIndexOf("generation");
  if (
    generation < 0 ||
    normalized[generation + 1] !== "textures" ||
    generation + 2 !== normalized.length
  ) {
    return undefined;
  }
  const owner = parent.slice(0, generation);
  const ownerPath = [item.id, ...owner];
  const context = {
    path: ownerPath,
    siblingValues: siblingValues(configValueAt(item.raw, owner)),
    ancestorTypes: ancestorTypesForPath(item.raw, ownerPath),
  };
  return itemSchemaFieldForName(
    context,
    parent[generation]!,
    itemFieldsForContext(context),
  )
    ? "texture"
    : undefined;
}

function blockGenerationTextureProvider(
  block: BlockDefinition,
  parent: readonly string[],
): SchemaValueProvider | undefined {
  const normalized = parent.map((entry) => entry.replaceAll("-", "_"));
  const generation = normalized.lastIndexOf("generation");
  if (
    generation < 0 ||
    normalized[generation + 1] !== "textures" ||
    generation + 2 !== normalized.length
  ) {
    return undefined;
  }
  const owner = parent.slice(0, generation);
  const ownerPath = [block.id, ...owner];
  return blockSchemaFieldForName(
    parent[generation]!,
    blockFieldsForContext({
      path: ownerPath,
      siblingValues: siblingValues(configValueAt(block.raw, owner)),
      ancestorTypes: ancestorTypesForPath(block.raw, ownerPath),
    }),
  )
    ? "texture"
    : undefined;
}

function keyOfReference(raw: string): string | undefined {
  const identifier = makeIdentifier(raw, "minecraft");
  return isValidIdentifier(identifier) ? identifier : undefined;
}

  // arranger 末尾的数字只是位置编号, 不是方块 ID
function blockStateReference(raw: string): string | undefined {
  const withoutProperties = raw.replace(/\[[^\]]*\]$/u, "");
  const parts = withoutProperties.split(":");
  return keyOfReference(
    parts.length >= 2 && /^\d+$/u.test(parts.at(-1) ?? "")
      ? parts.slice(0, -1).join(":")
      : withoutProperties,
  );
}

function configurationIdentifier(
  provider: SchemaValueProvider,
  raw: string,
  path: readonly string[],
): string | undefined {
  const normalizedPath = path.map((entry) => entry.replaceAll("-", "_"));
  if (provider === "item-id") {
    if (
      normalizedPath.at(-1) === "id" &&
      (normalizedPath[0] === "data" ||
        normalizedPath[0] === "client_bound_data" ||
        (normalizedPath[0] === "updater" && normalizedPath.includes("data")))
    )
      return undefined;
    if (raw.startsWith("#")) return undefined;
    if (normalizedPath.includes("list"))
      return makeIdentifier(raw, "minecraft");
    if (normalizedPath.includes("correct_tools")) return keyOfReference(raw);
  }

  if (
    (provider === "attribute-operation" &&
      normalizedPath.includes("operations")) ||
    (provider === "entity-type" && normalizedPath.includes("entities")) ||
    (provider === "attribute" &&
      (normalizedPath.includes("base") || normalizedPath.includes("sync")))
  )
    return makeIdentifier(raw, "minecraft");

  let value = raw;
  switch (provider) {
    case "jukebox-song":
  // 裸唱片机歌曲值没有默认命名空间, 不能生成可靠链接
      return raw.includes(":") && isValidIdentifier(raw.toLowerCase())
        ? raw.toLowerCase()
        : undefined;
    case "block-state":
      return blockStateReference(raw);
    case "block-id": {
      value = raw.replace(/\[[^\]]*\]$/u, "");
      if (path[0] === "events" || path[0] === "event")
        return keyOfReference(value);
      break;
    }
  }

  const identifier = makeIdentifier(value.toLowerCase(), "minecraft");
  return isValidIdentifier(identifier) ? identifier : undefined;
}

const TEMPLATE_INVOCATION_RANGES = new WeakMap<
  Readonly<{ fieldValueRanges: ReadonlyMap<string, TextRange> }>,
  ReadonlySet<string>
>();

function templateInvocationRangeKeys(
  source: Readonly<{ fieldValueRanges: ReadonlyMap<string, TextRange> }>,
): ReadonlySet<string> {
  const cached = TEMPLATE_INVOCATION_RANGES.get(source);
  if (cached) return cached;

  const result = new Set<string>();
  for (const [fieldPath, range] of source.fieldValueRanges) {
    if (!/(?:^|\.)(?:template|templates)(?:\.\d+)?$/u.test(fieldPath)) continue;
    result.add(`${range.start}:${range.end}`);
  }
  TEMPLATE_INVOCATION_RANGES.set(source, result);
  return result;
}

function providerForPath(
  item: ItemDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  const leaf = path.at(-1);
  if (!leaf) return undefined;
  const normalizedPath = path.map((entry) => entry.replaceAll("-", "_"));
  const legacyOverrides =
    normalizedPath[0] === "legacy_model"
      ? normalizedPath.indexOf("overrides", 1)
      : -1;
  if (
    legacyOverrides >= 0 &&
    normalizedPath.indexOf("predicate", legacyOverrides + 1) >= 0
  )
    return undefined;
  const parent = path.slice(0, -1);
  const contextPath = [item.id, ...parent];
  const ancestorTypes = ancestorTypesForPath(item.raw, contextPath);
  if (/^\d+$/u.test(leaf))
    return itemListProviderForPath(item, parent, ancestorTypes);

  const generationTexture = itemGenerationTextureProvider(item, parent);
  if (generationTexture) return generationTexture;

  const context = {
    path: contextPath,
    siblingValues: siblingValues(configValueAt(item.raw, parent)),
    ancestorTypes,
  };
  return itemSchemaFieldForName(context, leaf, itemFieldsForContext(context))
    ?.valueProvider;
}

function blockProviderForPath(
  block: BlockDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  const leaf = path.at(-1);
  if (!leaf) return undefined;
  const parent = path.slice(0, -1);
  const contextPath = [block.id, ...parent];
  const ancestorTypes = ancestorTypesForPath(block.raw, contextPath);
  if (/^\d+$/u.test(leaf))
    return blockListProviderForPath(block, parent, ancestorTypes);

  const generationTexture = blockGenerationTextureProvider(block, parent);
  if (generationTexture) return generationTexture;

  return blockSchemaFieldForName(
    leaf,
    blockFieldsForContext({
      path: contextPath,
      siblingValues: siblingValues(configValueAt(block.raw, parent)),
      ancestorTypes,
    }),
  )?.valueProvider;
}

function furnitureProviderForPath(
  furniture: FurnitureDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  const leaf = path.at(-1);
  if (!leaf) return undefined;
  const parent = path.slice(0, -1);
  const contextPath = [furniture.id, ...parent];
  const ancestorTypes = ancestorTypesForPath(furniture.raw, contextPath);
  if (/^\d+$/u.test(leaf))
    return furnitureListProviderForPath(furniture, parent, ancestorTypes);
  return furnitureSchemaFieldForName(
    leaf,
    furnitureFieldsForContext({
      path: contextPath,
      siblingValues: siblingValues(configValueAt(furniture.raw, parent)),
      ancestorTypes,
    }),
  )?.valueProvider;
}

function lootProviderForPath(
  loot: LootDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  const leaf = path.at(-1);
  if (!leaf) return undefined;
  const parent = path.slice(0, -1);
  const contextPath = [loot.id, ...parent];
  const ancestorTypes = ancestorTypesForPath(loot.raw, contextPath);
  if (/^\d+$/u.test(leaf))
    return lootListProviderForPath(loot, parent, ancestorTypes);
  return lootSchemaFieldForName(
    leaf,
    lootFieldsForContext({
      path: contextPath,
      siblingValues: siblingValues(configValueAt(loot.raw, parent)),
      ancestorTypes,
    }),
  )?.valueProvider;
}

function genericSection(kind: GenericResourceDefinition["kind"]): string {
  switch (kind) {
    case "recipe":
      return "recipes";
    case "category":
      return "categories";
    case "emoji":
      return "emojis";
    case "painting":
      return "paintings";
    case "configured-feature":
      return "configured-features";
    case "placed-feature":
      return "placed-features";
    case "advancement":
      return "advancements";
    case "entity":
      return "entities";
    case "attribute":
      return "attributes";
    case "attribute-operation":
      return "attribute-operations";
    case "equipment-set":
      return "equipment-sets";
    case "atlas":
      return "atlases";
  }
}

  // 同一个 definition 的 provider 只取决于字段路径,
  // resource 与 id 两条链会对同一路径各查一次, 这里按 definition 记忆化
const GENERIC_PROVIDER_CACHE = new WeakMap<
  GenericResourceDefinition,
  Map<string, SchemaValueProvider | undefined>
>();

function genericProviderFor(
  definition: GenericResourceDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  let cache = GENERIC_PROVIDER_CACHE.get(definition);
  if (!cache) {
    cache = new Map();
    GENERIC_PROVIDER_CACHE.set(definition, cache);
  }
  const key = path.join(".");
  if (cache.has(key)) return cache.get(key);
  const provider = genericProviderForPath(definition, path);
  cache.set(key, provider);
  return provider;
}

function genericProviderForPath(
  resource: GenericResourceDefinition,
  path: readonly string[],
): SchemaValueProvider | undefined {
  const leaf = path.at(-1);
  if (!leaf) return undefined;
  const parent = path.slice(0, -1);
  const contextPath = [resource.id, ...parent];
  const ancestorTypes = ancestorTypesForPath(resource.raw, contextPath);
  const context = {
    path: contextPath,
    siblingValues: siblingValues(configValueAt(resource.raw, parent)),
    ancestorTypes,
  };
  const section = genericSection(resource.kind);
  if (/^\d+$/u.test(leaf)) {
    const fieldName = parent.at(-1);
    if (!fieldName) return undefined;
    const owner = parent.slice(0, -1);
    // ancestorTypes 已经沿 contextPath 收集过, 前缀的切片可以复用同一份结果
    const ownerContext = {
      path: [resource.id, ...owner],
      siblingValues: siblingValues(configValueAt(resource.raw, owner)),
      ancestorTypes: ancestorTypes.slice(parent.length - owner.length),
    };
    if (
      !miscResourceSchemaFieldForName(
        fieldName,
        miscResourceFieldsForContext(section, ownerContext),
      )
    )
      return undefined;
    return miscResourceListItemField(section, [resource.id, ...parent])
      ?.valueProvider;
  }
  return miscResourceSchemaFieldForName(
    leaf,
    miscResourceFieldsForContext(section, context),
  )?.valueProvider;
}

function referencesForDefinitions<
  T extends
    | ItemDefinition
    | BlockDefinition
    | FurnitureDefinition
    | LootDefinition
    | GenericResourceDefinition,
>(
  definitions: readonly T[],
  providerFor: (
    definition: T,
    path: readonly string[],
  ) => SchemaValueProvider | undefined,
): readonly ConfigurationResourceReference[] {
  const references: ConfigurationResourceReference[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    const templateRanges = templateInvocationRangeKeys(definition.source);
    for (const [fieldPath, range] of definition.source.fieldValueRanges) {
      if (templateRanges.has(`${range.start}:${range.end}`)) continue;
      const path = fieldPath.split(".");
      const raw = configValueAt(definition.raw, path);
      if (typeof raw !== "string") continue;
      const provider = providerFor(definition, path);
      const kind =
        provider === "texture" || provider === "model" ? provider : undefined;
      if (!kind) continue;
      const identifier = kind === "texture" ? raw.replace(/^\^/u, "") : raw;
      if (!identifier) continue;
      const key = `${kind}:${range.start}:${range.end}:${identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ kind, identifier, range });
    }
  }
  return references;
}

export function blockResourceReferences(
  blocks: readonly BlockDefinition[],
): readonly ConfigurationResourceReference[] {
  return referencesForDefinitions(blocks, blockProviderForPath);
}

export function configurationResourceReferences(
  items: readonly ItemDefinition[],
  blocks: readonly BlockDefinition[],
  furniture: readonly FurnitureDefinition[] = [],
  lootTables: readonly LootDefinition[] = [],
  genericResources: readonly GenericResourceDefinition[] = [],
): readonly ConfigurationResourceReference[] {
  return [
    ...referencesForDefinitions(items, providerForPath),
    ...blockResourceReferences(blocks),
    ...referencesForDefinitions(furniture, furnitureProviderForPath),
    ...referencesForDefinitions(lootTables, lootProviderForPath),
    ...referencesForDefinitions(genericResources, genericProviderFor),
  ];
}

function idReferencesForDefinitions<
  T extends
    | ItemDefinition
    | BlockDefinition
    | FurnitureDefinition
    | LootDefinition
    | GenericResourceDefinition,
>(
  definitions: readonly T[],
  providerFor: (
    definition: T,
    path: readonly string[],
  ) => SchemaValueProvider | undefined,
): readonly ConfigurationIdReference[] {
  const references: ConfigurationIdReference[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    const templateRanges = templateInvocationRangeKeys(definition.source);
    for (const [fieldPath, range] of definition.source.fieldValueRanges) {
      if (templateRanges.has(`${range.start}:${range.end}`)) continue;
      const path = fieldPath.split(".");
      const raw = configValueAt(definition.raw, path);
      if (typeof raw !== "string" || raw.includes("${")) continue;
      const provider = providerFor(definition, path);
      if (!provider) continue;
      let kind: ConfigurationIdReferenceKind | undefined;
      switch (provider) {
        case "item-id":
          kind = "item";
          break;
        case "block-id":
        case "block-state":
          kind = "block";
          break;
        case "furniture-id":
          kind = "furniture";
          break;
        case "loot-id":
          kind = "loot";
          break;
        case "equipment-id":
          kind = "equipment";
          break;
        case "jukebox-song":
          kind = "jukebox-song";
          break;
        case "entity-type":
          kind = "entity";
          break;
        case "custom-attribute":
          kind = "attribute";
          break;
        case "attribute-operation":
          kind = "attribute-operation";
          break;
        case "equipment-set":
          kind = "equipment-set";
          break;
      }
      if (!kind) continue;
      const identifier = configurationIdentifier(provider, raw, path);
      if (!identifier) continue;
      const key = `${kind}:${range.start}:${range.end}:${identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ kind, identifier, range });
    }
  }
  return references;
}

export function configurationIdReferences(
  items: readonly ItemDefinition[],
  blocks: readonly BlockDefinition[],
  furniture: readonly FurnitureDefinition[] = [],
  lootTables: readonly LootDefinition[] = [],
  genericResources: readonly GenericResourceDefinition[] = [],
): readonly ConfigurationIdReference[] {
  return [
    ...idReferencesForDefinitions(items, providerForPath),
    ...idReferencesForDefinitions(blocks, blockProviderForPath),
    ...idReferencesForDefinitions(furniture, furnitureProviderForPath),
    ...idReferencesForDefinitions(lootTables, lootProviderForPath),
    ...idReferencesForDefinitions(genericResources, genericProviderFor),
  ];
}
