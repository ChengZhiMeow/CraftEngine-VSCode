import path from "node:path";
import { fileURLToPath } from "node:url";

import * as vscode from "vscode";

import {
  imageCompletionContext,
  yamlCompletionContext,
} from "../../config/completion/context.js";
import {
  BLOCK_PROPERTY_VALUE_DETAILS,
  blockAppearanceNames,
  blockFieldsForContext,
  blockGenerationTextureSlotFields,
  blockListItemField,
  blockPropertySuggestions,
  blockSchemaFieldForName,
} from "../../config/block/schema.js";
import type { CompletionDescriptionCatalog } from "./descriptions.js";
import { addSchemaValues } from "./valueResolver.js";
import {
  routeSchemaCompletions,
  type SchemaCompletionOptions,
} from "./schemaRouter.js";
import {
  dataComponentDefinition,
  dataComponentDynamicEntry,
  dataComponentListItemField,
  dataComponentPathContext,
  dataComponentRootSnippet,
  dataComponentValueField,
} from "../../config/item/dataComponents.js";
import {
  EQUIPMENT_LAYER_TYPES,
  TRIM_EQUIPMENT_LAYER_ALIASES,
  TRIM_EQUIPMENT_LAYER_TYPES,
} from "../../config/equipment/parser.js";
import {
  furnitureFieldsForContext,
  furnitureListItemField,
  furnitureSchemaFieldForName,
} from "../../config/furniture/schema.js";
import { furnitureVariantNames } from "../../config/furniture/parser.js";
import {
  buildLanguageCatalog,
  CLIENT_LANGUAGE_SECTIONS,
  completeLanguageKeys,
  languageJsonFilesFromCatalog,
  type LanguageCatalog,
  SERVER_LANGUAGE_SECTIONS,
} from "../../config/text/languageCatalog.js";
import {
  itemFieldsForContext,
  itemDataDynamicKeyField,
  itemDataDynamicValueField,
  ITEM_GENERATION_TEXTURE_KEY_FIELD,
  ITEM_GENERATION_TEXTURE_VALUE_FIELD,
  itemListItemField,
  itemGenerationTextureMapping,
  itemSchemaFieldForName,
  resolveFunctionOrConditionType,
  type SchemaField,
} from "../../config/item/schema.js";
import { semanticForField } from "../../config/schema/types.js";
import { withTemplateSchemaFields } from "../../config/schema/templateFields.js";
import {
  recipeDynamicKeyField,
  recipeDynamicValueField,
  recipeFieldsForContext,
  recipeListItemField,
  recipeSchemaFieldForName,
} from "../../config/recipe/schema.js";
import {
  miscResourceDynamicKeyField,
  miscResourceDynamicValueField,
  miscResourceFieldsForContext,
  miscResourceListItemField,
  miscResourceSchemaFieldForName,
  resolveMiscResourceSection,
} from "../../config/resource/schema.js";
import {
  worldgenListItemField,
  worldgenSchemaFieldForName,
  worldgenSchemaForContext,
  worldgenSectionKind,
} from "../../config/worldgen/schema.js";
import { configFileFieldsForContext } from "../../config/schema/configFile.js";
import { standaloneSchemaForContext } from "../../config/files/standalone.js";
import {
  CRAFTENGINE_ROOT_SECTION_COMPLETIONS,
  getSectionFamily,
  normalizeSectionType,
} from "../../config/registry/sectionRegistry.js";
import {
  CONFIG_FACTORY_BLUEPRINT_SECTION_FIELDS,
  CONFIG_FACTORY_ROOT_FIELDS,
  configFactoryBlueprintSectionSemantic,
  templateArgumentFieldsForType,
} from "../../config/template/schema.js";
import {
  imageFieldsForContext,
  imageSchemaFieldForName,
} from "../../config/image/schema.js";
import {
  lootFieldsForContext,
  lootListItemField,
  lootSchemaFieldForName,
  vanillaLootFieldsForContext,
} from "../../config/loot/schema.js";
import {
  blockResourceReferences,
  configurationIdReferences,
  configurationResourceReferences,
  type ConfigurationIdReference,
  type ConfigurationResourceReference,
} from "../../references/configuration.js";
import { JUKEBOX_SONG_FIELDS } from "../../config/jukebox/schema.js";
import {
  soundFieldsForContext,
  soundSchemaFieldForName,
} from "../../config/sound/schema.js";
import { withEnableDebugSchemaFields } from "../../config/validation/schema.js";
import type {
  ConfigurationTemplateDefinition,
  PackSource,
  ParsedSection,
  ParsedYamlFile,
  WorkspaceCrossDomainReference,
} from "../../config/model.js";
import type { BlockDefinition } from "../../config/block/model.js";
import type { EquipmentDefinition } from "../../config/equipment/model.js";
import type { FurnitureDefinition } from "../../config/furniture/model.js";
import type { GenericResourceDefinition } from "../../config/resource/model.js";
import type { ImageDefinition } from "../../config/image/model.js";
import type { ItemDefinition } from "../../config/item/model.js";
import type { TextRange } from "../../diagnostics/model.js";
import type { BlockStatePreview } from "../../preview/block/data.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { isValidIdentifier, makeIdentifier } from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { rangeAt } from "../../util/vscode/range.js";
import {
  parseCraftEngineYaml,
  parseLooseScalar,
} from "../../config/parsing/craftEngineYaml.js";
import type { VanillaCatalog } from "../../minecraft/catalog.js";
import type { CraftEngineWorkspaceIndex } from "../../workspace/index.js";
import { Messages } from "../../messages.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import { collectBlockGeneratedModels } from "../../resources/blockGeneration.js";

export function offsetIn(
  offset: number,
  range: TextRange | undefined,
): boolean {
  return range !== undefined && offset >= range.start && offset <= range.end;
}

export function wordAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): string {
  const line = document.lineAt(position.line).text;
  let start = position.character;
  let end = position.character;
  const allowed = /[A-Za-z0-9_.:/-]/u;
  while (start > 0 && allowed.test(line[start - 1] ?? "")) start -= 1;
  while (end < line.length && allowed.test(line[end] ?? "")) end += 1;
  return line
    .slice(start, end)
    .replace(/^<image:/u, "")
    .replace(/:$/u, "");
}

function sourceKindLabel(kind: ImageDefinition["source"]["kind"]): string {
  if (kind === "template")
    return Messages.src.providers.completion.provider.text0001;
  if (kind === "factory")
    return Messages.src.providers.completion.provider.text0002;
  return Messages.src.providers.completion.provider.text0003;
}

export function candidatesForToken(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  token: string,
): ImageDefinition[] {
  return [
    ...(index.forDocument(document)?.resolveImage(token).candidates ?? []),
  ];
}

export function resolvedTextures(
  index: CraftEngineWorkspaceIndex,
  images: readonly ImageDefinition[],
): string[] {
  return [...index.resolvedTexturePaths(images)];
}

export function imageTargetsAt(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): ImageDefinition[] {
  const offset = document.offsetAt(position);
  if (
    index
      .definitionsInDocument(document)
      .some((definition) => offsetIn(offset, definition.source.idRange))
  )
    return [];
  const current = index.imageAt(document, position);
  if (current) {
    if (offsetIn(offset, current.source.fieldValueRanges.get("file")))
      return [];
    if (
      offsetIn(offset, current.source.fieldValueRanges.get("ref")) &&
      current.spec.kind === "reference"
    ) {
      return candidatesForToken(index, document, current.spec.ref);
    }
    return [];
  }
  return candidatesForToken(index, document, wordAt(document, position));
}

export function commandLink(
  label: string,
  command: string,
  arguments_: readonly unknown[],
): string {
  return `[${label}](command:${command}?${encodeURIComponent(JSON.stringify(arguments_))})`;
}

export function imageArgument(definition: ImageDefinition): {
  uri: string;
  offset: number;
} {
  return {
    uri: definition.source.uri,
    offset: definition.source.idRange.start,
  };
}

export function itemArgument(definition: ItemDefinition): {
  uri: string;
  offset: number;
} {
  return {
    uri: definition.source.uri,
    offset: definition.source.idRange.start,
  };
}

export function furnitureArgument(definition: FurnitureDefinition): {
  id: string;
  uri: string;
  offset: number;
} {
  return {
    id: definition.id,
    uri: definition.source.uri,
    offset: definition.source.idRange.start,
  };
}

export function itemsForToken(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  token: string,
): ItemDefinition[] {
  return [
    ...(index.forDocument(document)?.resolveItem(token).candidates ?? []),
  ];
}

export function itemHover(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const offset = document.offsetAt(position);
  const containing = index.itemAt(document, position);
  let items: ItemDefinition[];
  if (
    containing &&
    (offsetIn(offset, containing.source.idRange) ||
      offsetIn(
        offset,
        containing.source.fieldValueRanges.get("custom_model_data"),
      ) ||
      offsetIn(
        offset,
        containing.source.fieldValueRanges.get("custom-model-data"),
      ))
  ) {
    items = [
      ...(index.forDocument(document)?.resolveItem(containing.id).candidates ??
        []),
    ];
  } else {
    items = itemsForToken(index, document, wordAt(document, position));
  }
  const primary = items[0];
  if (!primary) return undefined;
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = { enabledCommands: ["craftengineYaml.previewItem"] };
  markdown.appendMarkdown(`### ${primary.id}\n\n`);
  markdown.appendMarkdown(
    commandLink(
      Messages.src.providers.completion.provider.text0004,
      "craftengineYaml.previewItem",
      [itemArgument(primary)],
    ),
  );
  if (items.length > 1) {
    markdown.appendMarkdown(
      Messages.src.providers.completion.provider.text0005,
    );
    for (const item of items) {
      markdown.appendMarkdown(
        `- ${item.source.pack.name} · ${item.source.pack.active ? Messages.src.providers.completion.provider.text0006 : Messages.src.providers.completion.provider.text0007} · ${sourceKindLabel(item.source.kind)} · ${item.clientBoundMaterial}` +
          `${item.customModelData === undefined ? "" : ` · CMD ${item.customModelData}`}\n`,
      );
    }
  }
  return new vscode.Hover(markdown);
}

export function furnitureHover(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const containing = index.furnitureAt(document, position);
  const values: readonly FurnitureDefinition[] =
    containing &&
    offsetIn(document.offsetAt(position), containing.source.idRange)
      ? (index
          .forDocument(document)
          ?.resolveOpaque("furniture", containing.id)
          .candidates.filter(
            (entry): entry is FurnitureDefinition =>
              entry.kind === "furniture" &&
              entry.raw !== null &&
              typeof entry.raw === "object",
          ) ?? [])
      : (index
          .forDocument(document)
          ?.resolveOpaque("furniture", wordAt(document, position))
          .candidates.filter(
            (entry): entry is FurnitureDefinition =>
              entry.kind === "furniture" &&
              entry.raw !== null &&
              typeof entry.raw === "object",
          ) ?? []);
  const primary = values[0];
  if (!primary) return undefined;
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = {
    enabledCommands: ["craftengineYaml.previewFurniture"],
  };
  markdown.appendMarkdown(`### ${primary.id}\n\n`);
  markdown.appendMarkdown(
    Messages.src.providers.completion.provider.text0008(
      primary.source.pack.name,
      primary.variants.size,
      primary.inlineOwnerItemId
        ? ` · ${Messages.src.providers.completion.provider.text0145}`
        : "",
    ),
  );
  markdown.appendMarkdown(
    commandLink(
      Messages.src.providers.completion.provider.text0009,
      "craftengineYaml.previewFurniture",
      [furnitureArgument(primary)],
    ),
  );
  return new vscode.Hover(markdown, rangeAt(document, primary.source.idRange));
}

export function genericConfigurationHover(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const reference = index.crossDomainReferenceAt(document, position);
  if (reference) {
    const primary =
      selectedCrossDomainTarget(index, document, reference) ??
      crossDomainTargets(index, document, reference)[0];
    if (!primary) return undefined;
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`### ${primary.id}\n\n`);
    markdown.appendMarkdown(
      `${crossDomainKindLabel(reference.kind)} · ${primary.source.pack.name}` +
        Messages.src.providers.completion.provider.text0010(
          primary.source.pack.active
            ? Messages.src.providers.completion.provider.text0006
            : Messages.src.providers.completion.provider.text0007,
          sourceKindLabel(primary.source.kind),
        ),
    );
    return new vscode.Hover(markdown, rangeAt(document, reference.range));
  }

  const definition = index.genericResourceAt(document, position);
  if (
    !definition ||
    !offsetIn(document.offsetAt(position), definition.source.idRange)
  )
    return undefined;
  const markdown = new vscode.MarkdownString();
  markdown.appendMarkdown(`### ${definition.id}\n\n`);
  markdown.appendMarkdown(
    `${crossDomainKindLabel(definition.kind)} · ${definition.source.pack.name}` +
      Messages.src.providers.completion.provider.text0011(
        definition.source.pack.active
          ? Messages.src.providers.completion.provider.text0006
          : Messages.src.providers.completion.provider.text0007,
        sourceKindLabel(definition.source.kind),
      ),
  );
  return new vscode.Hover(
    markdown,
    rangeAt(document, definition.source.idRange),
  );
}

export function configurationResourceReferenceAt(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  offset: number,
): ConfigurationResourceReference | undefined {
  return configurationResourceReferences(
    index.itemsInDocument(document),
    index.blocksInDocument(document),
    index.furnitureInDocument(document),
    index.lootTablesInDocument(document),
  ).find((reference) => offsetIn(offset, reference.range));
}

export function configurationIdReferenceAt(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  offset: number,
): ConfigurationIdReference | undefined {
  return configurationIdReferences(
    index.itemsInDocument(document),
    index.blocksInDocument(document),
    index.furnitureInDocument(document),
    index.lootTablesInDocument(document),
  ).find((reference) => offsetIn(offset, reference.range));
}

function templateInvocationReferences(
  document: vscode.TextDocument,
): readonly ConfigurationIdReference[] {
  const parsed = parseCraftEngineYaml(
    document.uri.toString(),
    document.getText(),
  );
  const references: ConfigurationIdReference[] = [];
  const seen = new Set<string>();
  for (const section of parsed.sections)
    for (const [fieldPath, range] of section.ranges.values) {
      if (!/(?:^|\.)(?:template|templates)(?:\.\d+)?$/u.test(fieldPath))
        continue;
      const raw = parseLooseScalar(
        document.getText().slice(range.start, range.end),
      );
      if (typeof raw !== "string" || raw.includes("${")) continue;
      const identifier = makeIdentifier(raw, "minecraft");
      if (!isValidIdentifier(identifier)) continue;
      const key = `${range.start}:${range.end}:${identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ kind: "template", identifier, range });
    }
  return references;
}

export function templateInvocationReferenceAt(
  document: vscode.TextDocument,
  offset: number,
): ConfigurationIdReference | undefined {
  return templateInvocationReferences(document).find((reference) =>
    offsetIn(offset, reference.range),
  );
}

interface EquipmentTextureReference {
  readonly identifier: string;
  readonly range: TextRange;
}

function equipmentLayerTypeForKey(
  rawKey: string | undefined,
): (typeof EQUIPMENT_LAYER_TYPES)[number] | undefined {
  if (rawKey === undefined) return undefined;
  const hash = rawKey.indexOf("#");
  const normalized = rawKey
    .slice(0, hash < 0 ? rawKey.length : hash)
    .replaceAll("-", "_");
  return (EQUIPMENT_LAYER_TYPES as readonly string[]).includes(normalized)
    ? (normalized as (typeof EQUIPMENT_LAYER_TYPES)[number])
    : undefined;
}

function equipmentTextureReferences(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): readonly EquipmentTextureReference[] {
  const references: EquipmentTextureReference[] = [];
  const seen = new Set<string>();
  const add = (
    equipment: EquipmentDefinition,
    rawKey: string,
    rawValue: unknown,
    layerType: string,
  ): void => {
    const values: readonly unknown[] = isUnknownArray(rawValue)
      ? rawValue
      : [rawValue];
    let parsedIndex = 0;
    for (let rawIndex = 0; rawIndex < values.length; rawIndex += 1) {
      const value = values[rawIndex];
      if (isUnknownArray(rawValue) && !isRecord(value)) continue;
      const texture = isRecord(value) ? value.texture : value;
      if (
        typeof texture !== "string" &&
        typeof texture !== "number" &&
        typeof texture !== "boolean" &&
        typeof texture !== "bigint"
      )
        continue;
      const identifier = makeIdentifier(
        texture.toString().toLowerCase(),
        "minecraft",
      );
      if (!isValidIdentifier(identifier)) continue;
      const layer = equipment.layers[layerType]?.[parsedIndex];
      parsedIndex += 1;
      if (!layer) continue;
      const range = equipment.source.fieldValueRanges.get(
        isRecord(value)
          ? `${isUnknownArray(rawValue) ? `${rawKey}.${rawIndex}` : rawKey}.texture`
          : isUnknownArray(rawValue)
            ? `${rawKey}.${rawIndex}`
            : rawKey,
      );
      if (!range) continue;
      const key = `${range.start}:${range.end}:${layer.resourceTexture}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ identifier: layer.resourceTexture, range });
    }
  };

  for (const equipment of index.equipmentsInDocument(document)) {
    if (equipment.generatedJson !== undefined) {
      const selectedKeys = new Map<string, string>();
      for (const rawKey of Object.keys(equipment.raw)) {
        const layerType = equipmentLayerTypeForKey(rawKey);
        if (layerType !== undefined) selectedKeys.set(layerType, rawKey);
      }
      for (const [layerType, rawKey] of selectedKeys) {
        add(equipment, rawKey, equipment.raw[rawKey], layerType);
      }
      continue;
    }
    for (const layerType of TRIM_EQUIPMENT_LAYER_TYPES) {
      const rawKey = [
        layerType,
        ...TRIM_EQUIPMENT_LAYER_ALIASES[layerType],
      ].find((candidate) => Object.hasOwn(equipment.raw, candidate));
      if (rawKey === undefined) continue;
      add(equipment, rawKey, equipment.raw[rawKey], layerType);
    }
  }
  return references;
}

export function equipmentTextureReferenceAt(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  offset: number,
): EquipmentTextureReference | undefined {
  return equipmentTextureReferences(index, document).find((reference) =>
    offsetIn(offset, reference.range),
  );
}

type ConfigurationTarget =
  | ItemDefinition
  | ReturnType<CraftEngineWorkspaceIndex["opaqueIds"]>[number]
  | ReturnType<
      NonNullable<
        ReturnType<CraftEngineWorkspaceIndex["forDocument"]>
      >["equipments"]
    >[number]
  | ReturnType<CraftEngineWorkspaceIndex["jukeboxSongs"]>[number]
  | ReturnType<CraftEngineWorkspaceIndex["lootTables"]>[number]
  | ConfigurationTemplateDefinition;

type CrossDomainTarget =
  | ImageDefinition
  | ItemDefinition
  | BlockDefinition
  | GenericResourceDefinition;

function crossDomainKindLabel(
  kind:
    | WorkspaceCrossDomainReference["kind"]
    | GenericResourceDefinition["kind"],
): string {
  switch (kind) {
    case "image":
      return Messages.src.providers.completion.provider.text0012;
    case "item":
      return Messages.src.providers.completion.provider.text0013;
    case "block":
      return Messages.src.providers.completion.provider.text0014;
    case "recipe":
      return Messages.src.providers.completion.provider.text0015;
    case "category":
      return Messages.src.providers.completion.provider.text0016;
    case "emoji":
      return Messages.src.providers.completion.provider.text0147;
    case "painting":
      return Messages.src.providers.completion.provider.text0017;
    case "configured-feature":
      return Messages.src.providers.completion.provider.text0148;
    case "placed-feature":
      return Messages.src.providers.completion.provider.text0149;
    case "advancement":
      return Messages.src.providers.completion.provider.text0150;
  }
}

export function crossDomainTargets(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  reference: WorkspaceCrossDomainReference,
): readonly CrossDomainTarget[] {
  if (!reference.valid) return [];
  const catalog = index.forDocument(document);
  if (!catalog) return [];
  if (reference.kind === "image")
    return catalog.resolveImage(reference.identifier).candidates;
  if (reference.kind === "item")
    return catalog.resolveItem(reference.identifier).candidates;
  if (reference.kind === "block") {
    return catalog
      .resolveOpaque("block", reference.identifier)
      .candidates.filter(
        (candidate): candidate is BlockDefinition =>
          candidate.kind === "block" && isRecord(candidate.raw),
      );
  }
  return catalog.resolveGeneric(reference.kind, reference.identifier)
    .candidates;
}

function selectedCrossDomainTarget(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  reference: WorkspaceCrossDomainReference,
): CrossDomainTarget | undefined {
  if (!reference.valid) return undefined;
  const catalog = index.forDocument(document);
  if (!catalog) return undefined;
  if (reference.kind === "image")
    return catalog.resolveImage(reference.identifier).selected;
  if (reference.kind === "item")
    return catalog.resolveItem(reference.identifier).selected;
  if (reference.kind === "block") {
    const selected = catalog.resolveOpaque(
      "block",
      reference.identifier,
    ).selected;
    return selected?.kind === "block" && isRecord(selected.raw)
      ? (selected as BlockDefinition)
      : undefined;
  }
  return catalog.resolveGeneric(reference.kind, reference.identifier).selected;
}

export function configurationTargets(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  reference: ConfigurationIdReference,
): readonly ConfigurationTarget[] {
  if (reference.kind === "template") {
    return index
      .templatesForDocument(document)
      .filter((template) => template.id === reference.identifier);
  }
  const catalog = index.forDocument(document);
  if (!catalog) return [];
  if (reference.kind === "item")
    return catalog.resolveItem(reference.identifier).candidates;
  if (reference.kind === "equipment")
    return catalog.resolveEquipment(reference.identifier).candidates;
  if (reference.kind === "jukebox-song")
    return catalog.resolveJukeboxSong(reference.identifier).candidates;
  if (reference.kind === "loot")
    return catalog.resolveLoot(reference.identifier).candidates;
  return catalog.resolveOpaque(reference.kind, reference.identifier).candidates;
}

export function selectedConfigurationTarget(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  reference: ConfigurationIdReference,
): ConfigurationTarget | undefined {
  if (reference.kind === "template") {
    const candidates = index
      .templatesForDocument(document)
      .filter((template) => template.id === reference.identifier);
    return candidates.find((template) => template.pack.active) ?? candidates[0];
  }
  const catalog = index.forDocument(document);
  if (!catalog) return undefined;
  if (reference.kind === "item")
    return catalog.resolveItem(reference.identifier).selected;
  if (reference.kind === "equipment")
    return catalog.resolveEquipment(reference.identifier).selected;
  if (reference.kind === "jukebox-song")
    return catalog.resolveJukeboxSong(reference.identifier).selected;
  if (reference.kind === "loot")
    return catalog.resolveLoot(reference.identifier).selected;
  return catalog.resolveOpaque(reference.kind, reference.identifier).selected;
}

export function configurationKindLabel(
  kind: ConfigurationIdReference["kind"],
): string {
  switch (kind) {
    case "item":
      return Messages.src.providers.completion.provider.text0018;
    case "block":
      return Messages.src.providers.completion.provider.text0019;
    case "furniture":
      return Messages.src.providers.completion.provider.text0020;
    case "loot":
      return Messages.src.providers.completion.provider.text0021;
    case "equipment":
      return Messages.src.providers.completion.provider.text0022;
    case "jukebox-song":
      return Messages.src.providers.completion.provider.text0023;
    case "template":
      return Messages.src.providers.completion.provider.text0024;
  }
}

export function configurationTargetMetadata(
  target: ConfigurationTarget,
): string {
  if ("source" in target) {
    return Messages.src.providers.completion.provider.text0025(
      target.source.pack.name,
      target.source.pack.active
        ? Messages.src.providers.completion.provider.text0006
        : Messages.src.providers.completion.provider.text0007,
      sourceKindLabel(target.source.kind),
    );
  }
  return Messages.src.providers.completion.provider.text0026(
    target.pack.name,
    target.pack.active
      ? Messages.src.providers.completion.provider.text0006
      : Messages.src.providers.completion.provider.text0007,
  );
}

export function targetSource(target: ConfigurationTarget | CrossDomainTarget): {
  readonly uri: string;
  readonly range: TextRange;
  readonly active: boolean;
} {
  if ("source" in target)
    return {
      uri: target.source.uri,
      range: target.source.idRange,
      active: target.source.pack.active,
    };
  return {
    uri: target.uri,
    range: target.keyRange,
    active: target.pack.active,
  };
}

interface SoundReferenceAt {
  readonly kind: "event" | "file";
  readonly id: string;
  readonly previewEventId: string;
  readonly range: TextRange;
  readonly argument: {
    readonly eventId: string;
    readonly uri: string;
    readonly offset: number;
  };
}

export function soundReferenceAt(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  offset: number,
): SoundReferenceAt | undefined {
  for (const reference of index.soundDataInDocument(document))
    if (offsetIn(offset, reference.idRange)) {
      return {
        kind: "event",
        id: reference.eventId,
        previewEventId: reference.eventId,
        range: reference.idRange,
        argument: {
          eventId: reference.eventId,
          uri: reference.source.uri,
          offset: reference.idRange.start,
        },
      };
    }
  for (const event of index.soundEventsInDocument(document)) {
    if (offsetIn(offset, event.source.idRange)) {
      return {
        kind: "event",
        id: event.id,
        previewEventId: event.id,
        range: event.source.idRange,
        argument: {
          eventId: event.id,
          uri: event.source.uri,
          offset: event.source.idRange.start,
        },
      };
    }
    for (const entry of event.entries)
      if (offsetIn(offset, entry.nameRange)) {
        return {
          kind: entry.type,
          id: entry.name,
          previewEventId: event.id,
          range: entry.nameRange,
          argument: {
            eventId: event.id,
            uri: event.source.uri,
            offset: event.source.idRange.start,
          },
        };
      }
  }
  return undefined;
}

function completion(
  label: string | vscode.CompletionItemLabel,
  detail: string,
  kind = vscode.CompletionItemKind.Property,
  range?: vscode.Range,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(label, kind);
  item.detail = detail;
  if (range) item.range = range;
  return item;
}

interface BlockVariantEditContext {
  readonly selector: string;
  readonly replacement: vscode.Range;
  readonly hasColon: boolean;
}

function mappingKeyColon(text: string): number | undefined {
  let single = false;
  let double = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "'" && !double) {
      if (single && text[index + 1] === "'") {
        index += 1;
        continue;
      }
      single = !single;
      continue;
    }
    if (character === '"' && !single && text[index - 1] !== "\\") {
      double = !double;
      continue;
    }
    if (
      character === ":" &&
      !single &&
      !double &&
      (index + 1 === text.length || /\s/u.test(text[index + 1] ?? ""))
    ) {
      return index;
    }
  }
  return undefined;
}

function unquoteSelector(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;
}

function blockVariantEditContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): BlockVariantEditContext | undefined {
  const line = document.lineAt(position.line);
  const text = line.text;
  if (text.trimStart().startsWith("#")) return undefined;
  const start = text.match(/^\s*/u)?.[0].length ?? 0;
  const colon = mappingKeyColon(text);
  if (colon === undefined) {
    return {
      selector: unquoteSelector(text.slice(start, position.character)),
      replacement: new vscode.Range(
        position.line,
        start,
        position.line,
        position.character,
      ),
      hasColon: false,
    };
  }
  if (
    position.character > colon &&
    text.slice(colon + 1, position.character).trim() !== ""
  )
    return undefined;
  return {
    selector: unquoteSelector(text.slice(start, colon)),
    replacement: new vscode.Range(
      position.line,
      start,
      position.line,
      Math.max(position.character, colon + 1),
    ),
    hasColon: true,
  };
}

function blockVariantSelectorCompletions(
  raw: Readonly<Record<string, unknown>> | undefined,
  existing: ReadonlySet<string>,
  replacement: vscode.Range,
  typedSelector = "",
  hasColon = false,
): vscode.CompletionItem[] {
  if (!raw) return [];
  const properties = blockPropertySuggestions(raw);
  const selectors = new Map<string, string>();
  const byName = new Map(
    properties.map((property) => [property.name, property]),
  );
  const parts = typedSelector.split(",");
  const current = parts.pop()?.trim() ?? "";
  const completed = parts.flatMap(
    (part): ReadonlyArray<readonly [string, string]> => {
      const equals = part.indexOf("=");
      if (equals <= 0) return [];
      const property = part.slice(0, equals).trim();
      const propertyValue = part.slice(equals + 1).trim();
      return property && propertyValue ? [[property, propertyValue]] : [];
    },
  );
  const used = new Set(completed.map(([name]) => name));
  const add = (property: string, value: string): void => {
    const assignments = [...completed, [property, value] as const];
    selectors.set(
      assignments
        .map(([name, assignment]) => `${name}=${assignment}`)
        .join(","),
      assignments
        .map(([name, assignment]) =>
          Messages.src.providers.completion.provider.text0033(
            name,
            BLOCK_PROPERTY_VALUE_DETAILS[assignment] ?? assignment,
          ),
        )
        .join("；"),
    );
  };
  if (
    completed.every(([name, value]) => byName.get(name)?.values.includes(value))
  ) {
    const equals = current.indexOf("=");
    if (equals >= 0) {
      const propertyName = current.slice(0, equals).trim();
      const valuePrefix = current.slice(equals + 1).trim();
      const property = byName.get(propertyName);
      if (property && !used.has(propertyName)) {
        for (const value of property.values)
          if (!valuePrefix || value.startsWith(valuePrefix))
            add(propertyName, value);
      }
    } else {
      for (const property of properties) {
        if (
          used.has(property.name) ||
          (current && !property.name.startsWith(current))
        )
          continue;
        for (const value of property.values) add(property.name, value);
      }
    }
  }
  if (!typedSelector.trim()) {
    const defaults = properties.flatMap((property) =>
      property.defaultValue === undefined
        ? []
        : [`${property.name}=${property.defaultValue}`],
    );
    if (defaults.length > 1)
      selectors.set(
        defaults.join(","),
        Messages.src.providers.completion.provider.text0034,
      );
  }
  return [...selectors]
    .filter(
      ([selector]) => !existing.has(selector) || selector === typedSelector,
    )
    .map(([selector, detail]) => {
      const item = completion(
        selector,
        detail,
        vscode.CompletionItemKind.EnumMember,
        replacement,
      );
      item.insertText = new vscode.SnippetString(
        hasColon ? `${selector}:` : `${selector}:\n  appearance: \${0}`,
      );
      return item;
    });
}

function vanillaBlockStateCompletions(
  typedValue: string,
  vanilla: VanillaCatalog | undefined,
  replacement: vscode.Range,
): vscode.CompletionItem[] {
  if (!vanilla) return [];
  const typed = typedValue.trim().replace(/^(['"])(.*)\1$/u, "$2");
  const bracket = typed.indexOf("[");
  if (bracket < 0) return [];
  const id = makeIdentifier(typed.slice(0, bracket).trim(), "minecraft");
  const properties = vanilla.blockStates.properties(id);
  if (!properties) return [];
  const parts = typed
    .slice(bracket + 1)
    .replace(/\]$/u, "")
    .split(",");
  const current = parts.pop()?.trim() ?? "";
  const completed = parts.map((entry) => entry.trim()).filter(Boolean);
  const used = new Set(
    completed.map((entry) => entry.slice(0, entry.indexOf("=")).trim()),
  );
  const [rawProperty, rawValue] = current.includes("=")
    ? [
        current.slice(0, current.indexOf("=")).trim(),
        current.slice(current.indexOf("=") + 1).trim(),
      ]
    : [current, undefined];
  const results: vscode.CompletionItem[] = [];
  const add = (property: string, value: string): void => {
    const state = `${id}[${[...completed, `${property}=${value}`].join(",")}]`;
    let propertyDetail: string;
    switch (property) {
      case "facing":
        propertyDetail = Messages.src.providers.completion.provider.text0035;
        break;
      case "axis":
        propertyDetail = Messages.src.providers.completion.provider.text0036;
        break;
      case "waterlogged":
        propertyDetail = Messages.src.providers.completion.provider.text0037;
        break;
      case "powered":
        propertyDetail = Messages.src.providers.completion.provider.text0038;
        break;
      case "lit":
        propertyDetail = Messages.src.providers.completion.provider.text0039;
        break;
      case "open":
        propertyDetail = Messages.src.providers.completion.provider.text0040;
        break;
      case "half":
        propertyDetail = Messages.src.providers.completion.provider.text0041;
        break;
      case "shape":
        propertyDetail = Messages.src.providers.completion.provider.text0042;
        break;
      case "type":
        propertyDetail = Messages.src.providers.completion.provider.text0043;
        break;
      case "age":
        propertyDetail = Messages.src.providers.completion.provider.text0044;
        break;
      case "level":
        propertyDetail = Messages.src.providers.completion.provider.text0045;
        break;
      case "rotation":
        propertyDetail = Messages.src.providers.completion.provider.text0046;
        break;
      case "hinge":
        propertyDetail = Messages.src.providers.completion.provider.text0047;
        break;
      case "part":
        propertyDetail = Messages.src.providers.completion.provider.text0048;
        break;
      case "distance":
        propertyDetail = Messages.src.providers.completion.provider.text0049;
        break;
      case "persistent":
        propertyDetail = Messages.src.providers.completion.provider.text0050;
        break;
      case "conditional":
        propertyDetail = Messages.src.providers.completion.provider.text0051;
        break;
      case "mode":
        propertyDetail = Messages.src.providers.completion.provider.text0052;
        break;
      default:
        propertyDetail = property;
    }
    const item = identifierCompletion(
      state,
      Messages.src.providers.completion.provider.text0053(
        vanilla.itemsById.get(id)?.name ?? id,
        propertyDetail,
        value,
      ),
      replacement,
    );
    item.filterText = `${state} ${property} ${value}`;
    results.push(item);
  };
  if (
    rawValue !== undefined &&
    properties.has(rawProperty) &&
    !used.has(rawProperty)
  ) {
    for (const value of properties.get(rawProperty) ?? [])
      if (!rawValue || value.startsWith(rawValue)) add(rawProperty, value);
    return results;
  }
  for (const [property, values] of properties) {
    if (
      used.has(property) ||
      (rawProperty && !property.startsWith(rawProperty))
    )
      continue;
    for (const value of values) add(property, value);
  }
  return results;
}

function sectionAt(
  parsed: ParsedYamlFile,
  documentLength: number,
  offset: number,
): ParsedSection | undefined {
  const direct = parsed?.sections.find(
    (section) =>
      offset >= section.valueRange.start && offset <= section.valueRange.end,
  );
  if (direct) return direct;
  const ordered = [...parsed.sections].sort(
    (left, right) => left.keyRange.start - right.keyRange.start,
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const section = ordered[index];
    if (!section) continue;
    const next = ordered[index + 1];
    if (
      offset >= section.keyRange.start &&
      (next ? offset < next.keyRange.start : offset <= documentLength)
    )
      return section;
  }
  return undefined;
}

type RootSectionCompletion =
  (typeof CRAFTENGINE_ROOT_SECTION_COMPLETIONS)[number];

export function availableRootSectionCompletions(
  existingTypes: ReadonlySet<string>,
): readonly RootSectionCompletion[] {
  const existingFamilies = new Set(
    [...existingTypes]
      .map((type) => normalizeSectionType(type))
      .filter(
        (type): type is NonNullable<ReturnType<typeof normalizeSectionType>> =>
          type !== undefined,
      ),
  );
  return CRAFTENGINE_ROOT_SECTION_COMPLETIONS.filter(
    (candidate) => !existingFamilies.has(candidate.canonical),
  );
}

function rootSectionSnippet(
  candidate: RootSectionCompletion,
): vscode.SnippetString {
  const label = candidate.sectionType;
  switch (candidate.canonical) {
    case "config-factory":
      return new vscode.SnippetString(
        `${label}:\n  instances:\n    - \${1:name}: \${2:value}\n  blueprint:\n    \${0}`,
      );
    case "global-variables":
      return new vscode.SnippetString(
        Messages.src.providers.completion.provider.text0054(label),
      );
    case "translations":
      return new vscode.SnippetString(
        `${label}:\n  \${1:zh_cn}:\n    \${2:translation.key}: \${0}`,
      );
    case "lang":
      return new vscode.SnippetString(
        `${label}:\n  \${1:zh_cn}:\n    \${2:translation.key}: \${0}`,
      );
    case "block-state-mappings":
      return new vscode.SnippetString(
        `${label}:\n  "\${1:minecraft:stone}": \${0:minecraft:stone}`,
      );
    case "skip-optimization":
      return new vscode.SnippetString(
        `${label}:\n  texture:\n    - \${0:assets/namespace/textures/path.png}`,
      );
    case "templates":
      return new vscode.SnippetString(
        `${label}:\n  \${1:${"${TM_FILENAME_BASE}"}}:\n    \${0}`,
      );
    default:
      return new vscode.SnippetString(
        `${label}:\n  \${1:${"${TM_FILENAME_BASE}"}}:\n    \${0}`,
      );
  }
}

function documentFilePath(document: vscode.TextDocument): string {
  if (document.uri.scheme === "file") return document.uri.fsPath;
  try {
    return fileURLToPath(document.uri.toString());
  } catch {
    return document.uri.path;
  }
}

function standaloneOwnerPath(
  document: vscode.TextDocument,
  position: vscode.Position,
  section: ParsedSection | undefined,
  yamlPath: readonly string[],
  propertyPosition: boolean,
): readonly string[] {
  if (
    propertyPosition &&
    (document.lineAt(position.line).text.match(/^\s*/u)?.[0].length ?? 0) === 0
  )
    return [];
  if (
    !section ||
    document.positionAt(section.keyRange.start).line === position.line
  )
    return [];
  return [section.key, ...yamlPath];
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
  raw: Readonly<Record<string, unknown>> | undefined,
  configurationPath: readonly string[],
): readonly string[] {
  if (!raw) return [];
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
    if (isRecord(current)) {
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
    } else break;
  }
  return types.reverse();
}

function languagePacks(
  index: CraftEngineWorkspaceIndex,
): readonly PackSource[] {
  return [
    ...new Map(
      [
        ...(index.packs ?? []),
        ...(index.index.items ?? []).map((item) => item.source.pack),
        ...(index.index.images ?? []).map((image) => image.source.pack),
        ...(index.index.blocks ?? []).map((block) => block.source.pack),
        ...(index.index.furniture ?? []).map(
          (furniture) => furniture.source.pack,
        ),
      ].map((pack) => [
        `${canonicalPath(pack.resourcesRoot)}\u0000${canonicalPath(pack.configurationRoot)}`,
        pack,
      ]),
    ).values(),
  ];
}

function packForParsedFile(
  uri: string,
  packs: readonly PackSource[],
  fallbackRoot?: string,
): PackSource | undefined {
  let filePath: string;
  try {
    filePath = fileURLToPath(uri);
  } catch {
    return undefined;
  }
  const direct = packs
    .filter((pack) => {
      const relative = path.relative(pack.configurationRoot, filePath);
      return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      );
    })
    .sort(
      (left, right) =>
        right.configurationRoot.length - left.configurationRoot.length,
    )[0];
  if (direct) return direct;
  return packs.find(
    (pack) =>
      fallbackRoot !== undefined &&
      canonicalPath(pack.resourcesRoot) === canonicalPath(fallbackRoot),
  );
}

function collectPlaceholderNames(value: unknown, result: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/gu)) {
      const name = match[1];
      if (name && name !== "__NAMESPACE__" && name !== "__ID__")
        result.add(name);
    }
    return;
  }
  if (isUnknownArray(value)) {
    for (const item of value) collectPlaceholderNames(item, result);
    return;
  }
  if (isRecord(value))
    for (const [key, item] of Object.entries(value)) {
      collectPlaceholderNames(key, result);
      collectPlaceholderNames(item, result);
    }
}

function templateNames(value: Readonly<Record<string, unknown>>): string[] {
  const names: string[] = [];
  for (const key of ["template", "templates"]) {
    const selected = value[key];
    if (typeof selected === "string") names.push(selected);
    else if (isUnknownArray(selected))
      names.push(
        ...selected.filter((item): item is string => typeof item === "string"),
      );
  }
  return names;
}

function templateArgumentNames(
  imageSection: ParsedSection,
  imageId: string,
  catalog: readonly ConfigurationTemplateDefinition[],
): string[] {
  if (!isRecord(imageSection.value)) return [];
  return templateArgumentNamesForValue(imageSection.value[imageId], catalog);
}

function templateArgumentNamesForValue(
  value: unknown,
  catalog: readonly ConfigurationTemplateDefinition[],
): string[] {
  if (!isRecord(value)) return [];
  const templates = new Map<string, Readonly<Record<string, unknown>>>();
  for (const template of catalog)
    if (isRecord(template.value)) templates.set(template.id, template.value);
  const result = new Set<string>();
  const visited = new Set<string>();
  const visit = (rawName: string): void => {
    const exact = rawName.includes(":")
      ? makeIdentifier(rawName, "minecraft")
      : undefined;
    const shortMatches = exact
      ? []
      : [...templates.keys()].filter((candidate) =>
          candidate.endsWith(`:${rawName}`),
        );
    const name =
      exact ??
      (shortMatches.length === 1
        ? shortMatches[0]!
        : makeIdentifier(rawName, "minecraft"));
    if (visited.has(name)) return;
    visited.add(name);
    const template = templates.get(name);
    if (!template) return;
    for (const inherited of templateNames(template)) visit(inherited);
    collectPlaceholderNames(template, result);
  };
  for (const name of templateNames(value)) visit(name);
  return [...result].sort();
}

function valueAtConfigurationPath(
  section: ParsedSection,
  path: readonly string[],
): unknown {
  let current: unknown = section.value;
  for (const segment of path) {
    if (isUnknownArray(current) && /^\d+$/u.test(segment))
      current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment];
    else return undefined;
  }
  return current;
}

function valueAtRecordPath(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const segment of path) {
    if (isUnknownArray(current) && /^\d+$/u.test(segment))
      current = current[Number(segment)];
    else if (isRecord(current)) {
      const exact = current[segment];
      if (exact !== undefined) current = exact;
      else {
        const normalized = segment.replaceAll("-", "_");
        const matchingKey = Object.keys(current).find(
          (key) => key.replaceAll("-", "_") === normalized,
        );
        current = matchingKey === undefined ? undefined : current[matchingKey];
      }
    } else return undefined;
  }
  return current;
}

function schemaPropertyCompletion(
  field: SchemaField,
  range: vscode.Range,
): vscode.CompletionItem {
  const item = completion(
    field.label,
    Messages.src.providers.completion.provider.text0055(
      field.detail,
      field.required === true,
      field.optionalDependency,
    ),
    vscode.CompletionItemKind.Property,
    range,
  );
  item.insertText = new vscode.SnippetString(field.snippet);
  return item;
}

function identifierCompletion(
  label: string,
  detail: string,
  range: vscode.Range,
  kind = vscode.CompletionItemKind.Value,
): vscode.CompletionItem {
  const item = completion(label, detail, kind, range);
  item.insertText = label;
  item.filterText = label;
  return item;
}

export class CraftEngineCompletionProvider
  implements vscode.CompletionItemProvider
{
  private languageGeneration = -1;
  private languageCatalogPromise: Promise<LanguageCatalog> | undefined;

  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
    private readonly descriptions?: CompletionDescriptionCatalog,
  ) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const documentKind =
      this.workspaceIndex.configurationDocumentKind(document);
    if (documentKind === undefined) return [];
    const offset = document.offsetAt(position);
    const text = document.getText();
    const parsed = parseCraftEngineYaml(document.uri.toString(), text);
    const section = sectionAt(parsed, text.length, offset);
    const context = imageCompletionContext(text, offset, section);
    const yamlContext = yamlCompletionContext(text, offset, section);
    const schemaSiblingValues = yamlContext.siblingValues;
    const replacement = new vscode.Range(
      document.positionAt(yamlContext.replaceStart),
      document.positionAt(yamlContext.replaceEnd),
    );
    const linePrefix = document
      .lineAt(position.line)
      .text.slice(0, position.character);
    const results: vscode.CompletionItem[] = [];
    const valuesForField = (field: SchemaField): Map<string, string> => {
      const values = new Map<string, string>();
      for (const value of field.values ?? [])
        values.set(value, field.valueDetails?.[value] ?? field.detail);
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        field,
        document,
      );
      return values;
    };
    const valueItemsForField = (
      field: SchemaField,
      extraValues: ReadonlyMap<string, string> = new Map(),
    ): vscode.CompletionItem[] => {
      const values = valuesForField(field);
      for (const [label, detail] of extraValues) values.set(label, detail);
      return [...values].map(([label, detail]) =>
        identifierCompletion(
          label,
          detail,
          replacement,
          field.valueProvider === "model" ||
            field.valueProvider === "texture" ||
            field.valueProvider === "sound-file"
            ? vscode.CompletionItemKind.File
            : field.valueProvider?.endsWith("-id") === true ||
                field.valueProvider === "template"
              ? vscode.CompletionItemKind.Reference
              : vscode.CompletionItemKind.Value,
        ),
      );
    };
    const schemaCompletions = (
      options: SchemaCompletionOptions,
    ): vscode.CompletionItem[] =>
      routeSchemaCompletions(
        {
          document,
          position,
          replacement,
          yaml: yamlContext,
          valuesForField,
          valueItemsForField,
        },
        options,
      );

    const filePath = documentFilePath(document);
    const standalonePath = standaloneOwnerPath(
      document,
      position,
      section,
      yamlContext.path,
      yamlContext.propertyPosition,
    );
    const standaloneKind =
      documentKind === "configuration" ? undefined : documentKind;
    const standalone =
      standaloneKind === undefined || standaloneKind === "config"
        ? undefined
        : standaloneSchemaForContext(filePath, {
            path: standalonePath,
            siblingValues: schemaSiblingValues,
          });
    if (standalone || standaloneKind === "config") {
      const fields =
        standalone?.fields ??
        configFileFieldsForContext({
          path: standalonePath,
          siblingValues: schemaSiblingValues,
          ancestorTypes: ancestorTypesForPath(
            isRecord(section?.value) ? section.value : undefined,
            standalonePath,
          ),
        });
      const standaloneDynamicKey = standalone?.dynamicKey;
      const dynamicKey: SchemaField | undefined =
        standaloneDynamicKey === undefined
          ? undefined
          : {
              label: standaloneDynamicKey.label,
              semantic: standaloneDynamicKey.semantic,
              aliases: standaloneDynamicKey.aliases,
              detail: standaloneDynamicKey.detail,
              snippet: standaloneDynamicKey.snippet,
              ...(standaloneDynamicKey.optionalDependency === undefined
                ? {}
                : {
                    optionalDependency: standaloneDynamicKey.optionalDependency,
                  }),
              ...(standaloneDynamicKey.required === undefined
                ? {}
                : { required: standaloneDynamicKey.required }),
            };
      return schemaCompletions({
        fields,
        ...(dynamicKey === undefined ? {} : { dynamicKey }),
        ...(!yamlContext.propertyPosition && standaloneDynamicKey !== undefined
          ? { dynamicValue: standaloneDynamicKey }
          : {}),
      });
    }

    const indentation = linePrefix.match(/^\s*/u)?.[0].length ?? 0;
    if (!section || (yamlContext.propertyPosition && indentation === 0)) {
      if (
        indentation !== 0 ||
        (!this.workspaceIndex.rootForDocument(document) &&
          !/^\s*[^:]*$/u.test(linePrefix))
      )
        return [];
      const existingTypes = new Set(
        parsed.sections.map((candidate) => candidate.type),
      );
      for (const candidate of availableRootSectionCompletions(existingTypes)) {
        const item = completion(
          candidate.sectionType,
          Messages.src.providers.completion.provider.text0151(
            candidate.description,
            candidate.noOp
              ? Messages.src.providers.completion.provider.text0058
              : "",
            candidate.alias
              ? Messages.src.providers.completion.provider.text0056(
                  candidate.canonical,
                )
              : Messages.src.providers.completion.provider.text0057,
          ),
          vscode.CompletionItemKind.Module,
          replacement,
        );
        item.insertText = rootSectionSnippet(candidate);
        results.push(item);
      }
      return results;
    }

    const languageDomain = (
      CLIENT_LANGUAGE_SECTIONS as readonly string[]
    ).includes(section.type)
      ? "client"
      : (SERVER_LANGUAGE_SECTIONS as readonly string[]).includes(section.type)
        ? "server"
        : undefined;
    if (languageDomain && yamlContext.propertyPosition) {
      if (yamlContext.path.length === 0) {
        const sectionLocales =
          section.value &&
          typeof section.value === "object" &&
          !isUnknownArray(section.value)
            ? new Set(Object.keys(section.value))
            : new Set<string>();
        return (
          languageDomain === "client"
            ? ["zh_cn", "en_us", "zh_tw", "all"]
            : ["zh_cn", "en_us", "zh_tw", "en", "zh"]
        )
          .filter(
            (locale) =>
              !yamlContext.existingKeys.has(locale) &&
              !sectionLocales.has(locale),
          )
          .map((locale) => {
            const item = completion(
              locale,
              languageDomain === "client"
                ? Messages.src.providers.completion.provider.text0059
                : Messages.src.providers.completion.provider.text0060,
              vscode.CompletionItemKind.EnumMember,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${locale}:\n  \${0}`);
            return item;
          });
      }
      const languages = await this.languageCatalog(document, parsed);
      const parentKey = yamlContext.path.slice(1).join(".");
      const resourcesRoot = this.workspaceIndex.rootForDocument(document);
      return completeLanguageKeys(languages, {
        ...(resourcesRoot === undefined ? {} : { resourcesRoot }),
        domain: languageDomain,
      }).flatMap((entry) => {
        if (parentKey && !entry.key.startsWith(`${parentKey}.`)) return [];
        const label = parentKey
          ? entry.key.slice(parentKey.length + 1)
          : entry.key;
        if (!label || yamlContext.existingKeys.has(label)) return [];
        const item = completion(
          label,
          Messages.src.providers.completion.provider.text0061(
            entry.value ?? Messages.src.providers.completion.provider.text0146,
            entry.locales.join(", "),
          ),
          vscode.CompletionItemKind.Property,
          replacement,
        );
        item.insertText = new vscode.SnippetString(`${label}: \${0}`);
        item.filterText = `${label} ${entry.key}`;
        return [item];
      });
    }

    if (linePrefix.includes("${")) {
      const names = new Set(["__NAMESPACE__", "__ID__"]);
      for (const match of document
        .getText()
        .matchAll(/^\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s*:/gmu))
        names.add(match[1] as string);
      return [...names].map((name) =>
        completion(
          name,
          Messages.src.providers.completion.provider.text0062,
          vscode.CompletionItemKind.Variable,
        ),
      );
    }
    if (linePrefix.includes("<image:")) {
      for (const image of this.workspaceIndex.index.images.filter(
        (candidate) => candidate.source.pack.active,
      )) {
        results.push(
          completion(
            image.id,
            `${image.source.pack.name} — ${sourceKindLabel(image.source.kind)}`,
            vscode.CompletionItemKind.Reference,
          ),
        );
      }
      return results;
    }

    const sectionFamily = getSectionFamily(section.type);
    if (
      sectionFamily?.idSection === true &&
      yamlContext.path.length === 0 &&
      yamlContext.entryId === undefined &&
      yamlContext.propertyPosition
    ) {
      const item = completion(
        "namespace:id",
        Messages.src.providers.completion.provider.text0063(
          sectionFamily.description,
        ),
        vscode.CompletionItemKind.Module,
        replacement,
      );
      item.insertText = new vscode.SnippetString(
        '"${1:namespace:id}":\n  ${0}',
      );
      return [item];
    }
    if (
      sectionFamily?.kind === "id-value" &&
      yamlContext.path.length === 0 &&
      yamlContext.entryId === undefined &&
      yamlContext.propertyPosition
    ) {
      const item = completion(
        "name",
        Messages.src.providers.completion.provider.text0064(
          sectionFamily.description,
        ),
        vscode.CompletionItemKind.Module,
        replacement,
      );
      item.insertText = new vscode.SnippetString(
        sectionFamily.canonical === "templates"
          ? "${1:name}:\n  ${0}"
          : "${1:name}: ${0}",
      );
      return [item];
    }
    const factoryBlueprintSection = [
      "blueprint",
      "prototype",
      "schema",
    ].includes(yamlContext.path[0]?.replaceAll("-", "_") ?? "")
      ? yamlContext.path[1]?.split("#", 1)[0]
      : undefined;
    const factoryBlueprintFamily = factoryBlueprintSection
      ? getSectionFamily(factoryBlueprintSection)
      : undefined;
    const templatableSection =
      (sectionFamily?.idSection === true && !sectionFamily.noOp) ||
      sectionFamily?.canonical === "templates" ||
      sectionFamily?.canonical === "global-variables" ||
      (sectionFamily?.canonical === "config-factory" &&
        (factoryBlueprintFamily?.idSection === true ||
          factoryBlueprintFamily?.kind === "id-value") &&
        factoryBlueprintFamily.noOp !== true);
    const templateCatalog = templatableSection
      ? this.workspaceIndex.templatesForDocument(document)
      : [];
    const normalizedTail = yamlContext.path.at(-1)?.replaceAll("-", "_");
    if (
      templatableSection &&
      yamlContext.propertyPosition &&
      normalizedTail === "arguments"
    ) {
      const owner = valueAtConfigurationPath(
        section,
        yamlContext.path.slice(0, -1),
      );
      const names = templateArgumentNamesForValue(owner, templateCatalog);
      if (isRecord(owner) && templateNames(owner).length > 0) {
        return names
          .filter((name) => !yamlContext.existingKeys.has(name))
          .map((name) => {
            const item = completion(
              name,
              Messages.src.providers.completion.provider.text0065,
              vscode.CompletionItemKind.Variable,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${name}: \${0}`);
            return item;
          });
      }
    }
    if (
      templatableSection &&
      !yamlContext.propertyPosition &&
      ["template", "templates"].includes(
        yamlContext.fieldName?.replaceAll("-", "_") ?? "",
      )
    ) {
      return templateCatalog.map((template) =>
        identifierCompletion(
          template.id,
          Messages.src.providers.completion.provider.text0066(
            template.pack.name,
          ),
          replacement,
          vscode.CompletionItemKind.Reference,
        ),
      );
    }
    const templatePropertyItems = (): vscode.CompletionItem[] => {
      if (
        !templatableSection ||
        !yamlContext.propertyPosition ||
        normalizedTail === "arguments"
      )
        return [];
      const fields = withTemplateSchemaFields(yamlContext.path, []);
      const existingSemantics = new Set(
        [...yamlContext.existingKeys].map((key) =>
          semanticForField(key, fields),
        ),
      );
      return fields
        .filter((field) => !existingSemantics.has(field.semantic))
        .map((field) => schemaPropertyCompletion(field, replacement));
    };
    const withTemplateItems = (
      items: readonly vscode.CompletionItem[],
    ): vscode.CompletionItem[] => {
      const merged = new Map<string, vscode.CompletionItem>();
      for (const item of [...items, ...templatePropertyItems()]) {
        const label =
          typeof item.label === "string" ? item.label : item.label.label;
        if (!merged.has(label)) merged.set(label, item);
      }
      return [...merged.values()];
    };
    const directEntry = (): Readonly<Record<string, unknown>> | undefined => {
      if (!yamlContext.entryId || !isRecord(section.value)) return undefined;
      const value = section.value[yamlContext.entryId];
      return isRecord(value) ? value : undefined;
    };
    const mappingAtPath = (
      raw: unknown,
      configurationPath: readonly string[],
      inspect: (value: Readonly<Record<string, unknown>>) => void,
    ): void => {
      let current = raw;
      if (isRecord(current)) inspect(current);
      for (const segment of configurationPath.slice(1)) {
        if (isUnknownArray(current)) {
          if (/^\d+$/u.test(segment)) {
            current = current[Number(segment)];
            if (isRecord(current)) inspect(current);
            continue;
          }
          current = recordInArrayForSegment(current, segment);
          if (isRecord(current)) inspect(current);
        }
        if (isRecord(current)) {
          const exact = current[segment];
          if (exact !== undefined) current = exact;
          else {
            const normalized = segment.replaceAll("-", "_");
            const matchingKey = Object.keys(current).find(
              (key) =>
                key.split("#", 1)[0]?.replaceAll("-", "_") ===
                normalized.split("#", 1)[0],
            );
            current =
              matchingKey === undefined ? undefined : current[matchingKey];
          }
        } else break;
        if (isRecord(current)) inspect(current);
      }
    };
    const nearestProviderType = (
      raw: Readonly<Record<string, unknown>> | undefined,
      configurationPath: readonly string[],
    ): string | undefined => {
      let selected: string | undefined;
      mappingAtPath(raw, configurationPath, (current) => {
        const type = current.type;
        if (typeof type === "string" && type.toLowerCase().includes("provider"))
          selected = type;
      });
      return selected;
    };
    const nearestFeatureType = (
      raw: Readonly<Record<string, unknown>> | undefined,
      configurationPath: readonly string[],
    ): string | undefined => {
      let selected: string | undefined;
      mappingAtPath(raw, configurationPath, (current) => {
        if (Object.hasOwn(current, "config")) {
          selected =
            typeof current.type === "string" ? current.type : undefined;
        }
      });
      return selected;
    };
    const recipeCompletions = (
      recipePath: readonly string[] = yamlContext.path,
      rawOverride?: Readonly<Record<string, unknown>>,
    ): vscode.CompletionItem[] => {
      const indexed = rawOverride
        ? undefined
        : this.workspaceIndex.genericResourceAt(document, position, "recipe");
      const raw =
        rawOverride ?? (isRecord(indexed?.raw) ? indexed.raw : directEntry());
      const schemaContext = {
        path: recipePath,
        siblingValues: schemaSiblingValues,
        ancestorTypes: ancestorTypesForPath(raw, recipePath),
        ...(typeof raw?.type === "string" ? { recipeType: raw.type } : {}),
        ...(raw === undefined
          ? {}
          : { recipeHasExplicitResult: Object.hasOwn(raw, "result") }),
      };
      const fields = recipeFieldsForContext(schemaContext);
      const dynamicKey = recipeDynamicKeyField(schemaContext);
      const dynamicValue = recipeDynamicValueField(
        schemaContext,
        yamlContext.fieldName ?? "",
      );
      const listField = document
        .lineAt(position)
        .text.trimStart()
        .startsWith("-")
        ? recipeListItemField(recipePath)
        : undefined;
      return schemaCompletions({
        fields,
        fieldForName: recipeSchemaFieldForName,
        ...(listField === undefined ? {} : { listField }),
        ...(dynamicKey === undefined ? {} : { dynamicKey }),
        ...(dynamicValue === undefined ? {} : { dynamicValue }),
      });
    };
    const miscCompletions = (
      sectionType: string = section.type,
      miscPath: readonly string[] = yamlContext.path,
      rawOverride?: Readonly<Record<string, unknown>>,
    ): vscode.CompletionItem[] => {
      const indexed = rawOverride
        ? undefined
        : this.workspaceIndex.genericResourceAt(document, position);
      const raw =
        rawOverride ?? (isRecord(indexed?.raw) ? indexed.raw : directEntry());
      const fields = miscResourceFieldsForContext(sectionType, {
        path: miscPath,
        siblingValues: schemaSiblingValues,
        ancestorTypes: ancestorTypesForPath(raw, miscPath),
      });
      const listField = miscResourceListItemField(sectionType, miscPath);
      const dynamicKey = miscResourceDynamicKeyField(sectionType, miscPath);
      const dynamicValue = yamlContext.fieldName
        ? miscResourceDynamicValueField(
            sectionType,
            miscPath,
            yamlContext.fieldName,
          )
        : undefined;
      const extraListValues = new Map<string, string>();
      if (
        resolveMiscResourceSection(sectionType) === "category" &&
        listField?.label === "item-or-category"
      ) {
        for (const entry of this.workspaceIndex
          .forDocument(document)
          ?.complete("category") ?? []) {
          extraListValues.set(
            `#${entry.id}`,
            Messages.src.providers.completion.provider.text0067(entry.id),
          );
          if (entry.definition.namespace === "minecraft" && entry.shortId) {
            extraListValues.set(
              `#${entry.shortId}`,
              Messages.src.providers.completion.provider.text0068(entry.id),
            );
          }
        }
      }
      return schemaCompletions({
        fields,
        fieldForName: miscResourceSchemaFieldForName,
        ...(listField === undefined ? {} : { listField }),
        ...(dynamicKey === undefined ? {} : { dynamicKey }),
        ...(dynamicValue === undefined ? {} : { dynamicValue }),
        ...(extraListValues.size === 0 ? {} : { extraListValues }),
      });
    };
    const worldgenCompletions = (
      sectionType: string = section.type,
      worldgenPath: readonly string[] = yamlContext.path,
      rawOverride?: Readonly<Record<string, unknown>>,
    ): vscode.CompletionItem[] => {
      const kind = worldgenSectionKind(sectionType);
      if (!kind) return [];
      const indexed = rawOverride
        ? undefined
        : this.workspaceIndex.genericResourceAt(document, position, kind);
      const raw =
        rawOverride ?? (isRecord(indexed?.raw) ? indexed.raw : directEntry());
      const featureType = nearestFeatureType(raw, worldgenPath);
      const providerType = nearestProviderType(raw, worldgenPath);
      const schema = worldgenSchemaForContext(sectionType, {
        path: worldgenPath,
        siblingValues: schemaSiblingValues,
        ...(featureType === undefined ? {} : { featureType }),
        ...(providerType === undefined ? {} : { providerType }),
      });
      if (!schema) return [];
      if (
        schema.fields.length === 0 &&
        schema.additionalFields === "minecraft-runtime-codec"
      )
        return [];
      const listField = document
        .lineAt(position)
        .text.trimStart()
        .startsWith("-")
        ? worldgenListItemField(kind, worldgenPath)
        : undefined;
      return schemaCompletions({
        fields: withTemplateSchemaFields(worldgenPath, schema.fields),
        fieldForName: worldgenSchemaFieldForName,
        ...(listField === undefined ? {} : { listField }),
      });
    };
    const lootCompletions = (
      lootPath: readonly string[],
      idSectionEntry = false,
    ): vscode.CompletionItem[] => {
      const fields = lootFieldsForContext({
        path: lootPath,
        siblingValues: schemaSiblingValues,
      });
      const schemaFields =
        idSectionEntry && lootPath.length === 1
          ? withEnableDebugSchemaFields(fields)
          : fields;
      if (yamlContext.propertyPosition) {
        const listField = document
          .lineAt(position)
          .text.trimStart()
          .startsWith("-")
          ? lootListItemField(lootPath)
          : undefined;
        if (listField) {
          const values = new Map<string, string>();
          for (const value of listField.values ?? [])
            values.set(
              value,
              listField.valueDetails?.[value] ?? listField.detail,
            );
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            listField,
            document,
          );
          if (values.size > 0)
            return [...values].map(([label, detail]) =>
              identifierCompletion(label, detail, replacement),
            );
        }
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) =>
            semanticForField(key, schemaFields),
          ),
        );
        return withTemplateItems(
          schemaFields
            .filter((candidate) => !existingSemantics.has(candidate.semantic))
            .map((candidate) =>
              schemaPropertyCompletion(candidate, replacement),
            ),
        );
      }
      const fieldName = yamlContext.fieldName;
      if (!fieldName) return [];
      const selected = lootSchemaFieldForName(fieldName, schemaFields);
      if (!selected) return [];
      const values = new Map<string, string>();
      for (const value of selected.values ?? [])
        values.set(value, selected.valueDetails?.[value] ?? selected.detail);
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        selected,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(label, detail, replacement),
      );
    };
    const vanillaLootCompletions = (
      vanillaLootPath: readonly string[],
      idSectionEntry = false,
    ): vscode.CompletionItem[] => {
      const nested = vanillaLootPath
        .slice(1)
        .map((entry) => entry.replaceAll("-", "_"));
      const lootIndex = nested.findIndex(
        (entry) => entry === "loot" || entry === "loots",
      );
      if (lootIndex >= 0)
        return lootCompletions([
          `${vanillaLootPath[0] ?? "vanilla-loot"}#loot`,
          ...vanillaLootPath.slice(lootIndex + 2),
        ]);
      const fields = vanillaLootFieldsForContext({
        path: vanillaLootPath,
        siblingValues: schemaSiblingValues,
      });
      const schemaFields =
        idSectionEntry && vanillaLootPath.length === 1
          ? withEnableDebugSchemaFields(fields)
          : fields;
      if (yamlContext.propertyPosition) {
        if (
          nested.includes("target") &&
          document.lineAt(position).text.trimStart().startsWith("-")
        ) {
          const target = lootSchemaFieldForName("target", schemaFields);
          if (target) {
            const values = new Map<string, string>();
            addSchemaValues(
              this.workspaceIndex,
              this.descriptions,
              values,
              target,
              document,
            );
            return [...values].map(([label, detail]) =>
              identifierCompletion(label, detail, replacement),
            );
          }
        }
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) =>
            semanticForField(key, schemaFields),
          ),
        );
        return withTemplateItems(
          schemaFields
            .filter((candidate) => !existingSemantics.has(candidate.semantic))
            .map((candidate) =>
              schemaPropertyCompletion(candidate, replacement),
            ),
        );
      }
      const fieldName = yamlContext.fieldName;
      if (!fieldName) return [];
      const selected = lootSchemaFieldForName(fieldName, schemaFields);
      if (!selected) return [];
      const values = new Map<string, string>();
      for (const value of selected.values ?? [])
        values.set(value, selected.valueDetails?.[value] ?? selected.detail);
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        selected,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(label, detail, replacement),
      );
    };
    const blockCompletions = (
      raw: Readonly<Record<string, unknown>> | undefined,
      blockPath: readonly string[],
    ): vscode.CompletionItem[] => {
      const schemaBlockPath = blockPath;
      const nested = schemaBlockPath
        .slice(1)
        .map((entry) => entry.replaceAll("-", "_"));
      const lootIndex = nested.findIndex(
        (entry) => entry === "loot" || entry === "loots",
      );
      if (lootIndex >= 0)
        return lootCompletions([
          `${blockPath[0] ?? "block"}#loot`,
          ...blockPath.slice(lootIndex + 2),
        ]);
      const schemaFields = blockFieldsForContext({
        path: schemaBlockPath,
        siblingValues: schemaSiblingValues,
        ancestorTypes: ancestorTypesForPath(raw, blockPath),
      });
      const variantsContainer =
        nested.length === 2 &&
        nested[0] &&
        ["state", "states"].includes(nested[0]) &&
        nested[1] === "variants";
      const variantEdit = variantsContainer
        ? blockVariantEditContext(document, position)
        : undefined;
      if (variantsContainer && (yamlContext.propertyPosition || variantEdit)) {
        return withTemplateItems(
          blockVariantSelectorCompletions(
            raw,
            yamlContext.existingKeys,
            variantEdit?.replacement ?? replacement,
            variantEdit?.selector ?? "",
            variantEdit?.hasColon ?? false,
          ),
        );
      }
      if (yamlContext.propertyPosition) {
        if (
          nested.length === 2 &&
          nested[0] &&
          ["state", "states"].includes(nested[0]) &&
          ["appearance", "appearances"].includes(nested[1] ?? "")
        ) {
          const item = completion(
            "<appearance-name>",
            Messages.src.providers.completion.provider.text0069,
            vscode.CompletionItemKind.Property,
            replacement,
          );
          item.insertText = new vscode.SnippetString(
            "${1:default}:\n  auto_state: solid\n  texture: ${0:namespace:block/path}",
          );
          return withTemplateItems([item]);
        }
        const listField = document
          .lineAt(position)
          .text.trimStart()
          .startsWith("-")
          ? blockListItemField(schemaBlockPath)
          : undefined;
        if (listField) {
          const values = new Map<string, string>();
          for (const value of listField.values ?? [])
            values.set(
              value,
              listField.valueDetails?.[value] ?? listField.detail,
            );
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            listField,
            document,
          );
          if (values.size > 0)
            return [...values].map(([label, detail]) =>
              identifierCompletion(
                label,
                detail,
                replacement,
                listField.valueProvider === "model" ||
                  listField.valueProvider === "texture"
                  ? vscode.CompletionItemKind.File
                  : vscode.CompletionItemKind.Value,
              ),
            );
        }
        if (
          nested.length === 2 &&
          nested[0] &&
          ["state", "states"].includes(nested[0]) &&
          nested[1] === "properties"
        ) {
          return withTemplateItems(
            [
              {
                label: "facing",
                detail: Messages.src.providers.completion.provider.text0027,
                snippet:
                  "facing:\n  type: horizontal_direction\n  default: north",
              },
              {
                label: "axis",
                detail: Messages.src.providers.completion.provider.text0028,
                snippet: "axis:\n  type: axis\n  default: y",
              },
              {
                label: "waterlogged",
                detail: Messages.src.providers.completion.provider.text0029,
                snippet: "waterlogged:\n  type: boolean\n  default: false",
              },
              {
                label: "powered",
                detail: Messages.src.providers.completion.provider.text0030,
                snippet: "powered:\n  type: boolean\n  default: false",
              },
              {
                label: "rotation",
                detail: Messages.src.providers.completion.provider.text0031,
                snippet: "rotation:\n  type: int\n  range: 0~15\n  default: 0",
              },
              {
                label: "facing_clockwise",
                detail: Messages.src.providers.completion.provider.text0032,
                snippet:
                  "facing_clockwise:\n  type: horizontal_direction\n  default: north",
              },
            ]
              .filter(
                (candidate) => !yamlContext.existingKeys.has(candidate.label),
              )
              .map((candidate) => {
                const item = completion(
                  candidate.label,
                  candidate.detail,
                  vscode.CompletionItemKind.Property,
                  replacement,
                );
                item.insertText = new vscode.SnippetString(candidate.snippet);
                return item;
              }),
          );
        }
        const candidateFields =
          nested.at(-1) === "textures" && nested.includes("generation")
            ? blockGenerationTextureSlotFields()
            : schemaFields;
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) =>
            semanticForField(key, candidateFields),
          ),
        );
        return withTemplateItems(
          candidateFields
            .filter((candidate) => !existingSemantics.has(candidate.semantic))
            .map((candidate) =>
              schemaPropertyCompletion(candidate, replacement),
            ),
        );
      }

      const fieldName = yamlContext.fieldName;
      if (!fieldName) return [];
      if (
        nested.includes("variants") &&
        ["appearance", "appearances"].includes(fieldName.replaceAll("-", "_"))
      ) {
        return blockAppearanceNames(raw ?? {}).map((name) =>
          identifierCompletion(
            name,
            Messages.src.providers.completion.provider.text0070,
            replacement,
          ),
        );
      }
      const propertiesIndex = nested.indexOf("properties");
      if (propertiesIndex >= 0) {
        const property = blockPropertySuggestions(raw ?? {}).find(
          (candidate) => candidate.name === nested[propertiesIndex + 1],
        );
        if (property && (fieldName === "default" || fieldName === "values")) {
          return property.values.map((value) =>
            identifierCompletion(
              value,
              BLOCK_PROPERTY_VALUE_DETAILS[value] ??
                Messages.src.providers.completion.provider.text0071(
                  property.name,
                ),
              replacement,
            ),
          );
        }
      }
      const schemaField = blockSchemaFieldForName(fieldName, schemaFields);
      if (!schemaField) return [];
      if (schemaField.valueProvider === "block-state") {
        const dynamic = vanillaBlockStateCompletions(
          document.getText(replacement),
          this.workspaceIndex.vanilla,
          replacement,
        );
        if (dynamic.length > 0) return dynamic;
      }
      const values = new Map<string, string>();
      for (const value of schemaField.values ?? [])
        values.set(
          value,
          schemaField.valueDetails?.[value] ?? schemaField.detail,
        );
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        schemaField,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(
          label,
          detail,
          replacement,
          schemaField.valueProvider === "model" ||
            schemaField.valueProvider === "texture"
            ? vscode.CompletionItemKind.File
            : vscode.CompletionItemKind.Value,
        ),
      );
    };

    const furnitureCompletions = (
      raw: Readonly<Record<string, unknown>> | undefined,
      furniturePath: readonly string[],
    ): vscode.CompletionItem[] => {
      const schemaFurniturePath = furniturePath;
      const nested = schemaFurniturePath
        .slice(1)
        .map((entry) => entry.replaceAll("-", "_"));
      const lootIndex = nested.findIndex(
        (entry) => entry === "loot" || entry === "loots",
      );
      if (lootIndex >= 0)
        return lootCompletions([
          `${furniturePath[0] ?? "furniture"}#loot`,
          ...furniturePath.slice(lootIndex + 2),
        ]);
      const schemaFields = furnitureFieldsForContext({
        path: schemaFurniturePath,
        siblingValues: schemaSiblingValues,
        ancestorTypes: ancestorTypesForPath(raw, furniturePath),
      });
      const compact = nested.filter((entry) => !/^\d+$/u.test(entry));
      if (
        yamlContext.propertyPosition &&
        compact.length === 1 &&
        ["variant", "variants", "placement"].includes(compact[0] ?? "")
      ) {
        const item = completion(
          "<variant-name>",
          Messages.src.providers.completion.provider.text0072,
          vscode.CompletionItemKind.Property,
          replacement,
        );
        item.insertText = new vscode.SnippetString(
          "${1:default}:\n  elements:\n    - type: item_display\n      item: ${0:minecraft:stone}",
        );
        return withTemplateItems([item]);
      }
      if (
        yamlContext.propertyPosition &&
        (compact[0] === "behavior" || compact[0] === "behaviors") &&
        compact.at(-1) === "variants"
      ) {
        return withTemplateItems(
          furnitureVariantNames(raw ?? {})
            .filter((name) => !yamlContext.existingKeys.has(name))
            .map((name) => {
              const item = completion(
                name,
                Messages.src.providers.completion.provider.text0073,
                vscode.CompletionItemKind.EnumMember,
                replacement,
              );
              item.insertText = new vscode.SnippetString(`${name}:\n  \${0}`);
              return item;
            }),
        );
      }
      if (yamlContext.propertyPosition) {
        const listField = document
          .lineAt(position)
          .text.trimStart()
          .startsWith("-")
          ? furnitureListItemField(schemaFurniturePath)
          : undefined;
        if (listField) {
          const values = new Map<string, string>();
          for (const value of listField.values ?? [])
            values.set(
              value,
              listField.valueDetails?.[value] ?? listField.detail,
            );
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            listField,
            document,
          );
          if (values.size > 0)
            return [...values].map(([label, detail]) =>
              identifierCompletion(label, detail, replacement),
            );
        }
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) =>
            semanticForField(key, schemaFields),
          ),
        );
        return withTemplateItems(
          schemaFields
            .filter((candidate) => !existingSemantics.has(candidate.semantic))
            .map((candidate) =>
              schemaPropertyCompletion(candidate, replacement),
            ),
        );
      }
      const fieldName = yamlContext.fieldName;
      if (!fieldName) return [];
      const schemaField = furnitureSchemaFieldForName(fieldName, schemaFields);
      if (!schemaField) return [];
      const values = new Map<string, string>();
      for (const value of schemaField.values ?? [])
        values.set(
          value,
          schemaField.valueDetails?.[value] ?? schemaField.detail,
        );
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        schemaField,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(
          label,
          detail,
          replacement,
          schemaField.valueProvider === "model" ||
            schemaField.valueProvider === "texture"
            ? vscode.CompletionItemKind.File
            : vscode.CompletionItemKind.Value,
        ),
      );
    };

    if (sectionFamily?.canonical === "config-factory") {
      const factoryPath = yamlContext.path.map((entry) =>
        entry.replaceAll("-", "_"),
      );
      const first = factoryPath[0];
      const blueprintRoot =
        first === "blueprint" || first === "prototype" || first === "schema";
      if (factoryPath.length === 0)
        return schemaCompletions({ fields: CONFIG_FACTORY_ROOT_FIELDS });
      if (blueprintRoot && factoryPath.length === 1) {
        return schemaCompletions({
          fields: CONFIG_FACTORY_BLUEPRINT_SECTION_FIELDS,
          semanticForName: configFactoryBlueprintSectionSemantic,
        });
      }
      if (
        (first === "instances" ||
          first === "instance" ||
          first === "inputs" ||
          first === "input") &&
        factoryPath.length >= 2
      ) {
        return schemaCompletions({
          fields: templateArgumentFieldsForType(
            schemaSiblingValues.get("type"),
          ),
        });
      }
      if (!blueprintRoot) return [];

      const blueprintSectionKey = yamlContext.path[1];
      const exactBlueprintType = blueprintSectionKey?.split("#", 1)[0];
      const blueprintFamily =
        blueprintSectionKey &&
        configFactoryBlueprintSectionSemantic(blueprintSectionKey) &&
        exactBlueprintType
          ? getSectionFamily(exactBlueprintType)
          : undefined;
      if (!blueprintFamily) return [];

      const blueprintPath = yamlContext.path.slice(2);
      if (
        blueprintFamily.idSection === true &&
        blueprintPath.length === 0 &&
        yamlContext.propertyPosition
      ) {
        const item = completion(
          "namespace:id",
          Messages.src.providers.completion.provider.text0074(
            blueprintFamily.description,
          ),
          vscode.CompletionItemKind.Module,
          replacement,
        );
        item.insertText = new vscode.SnippetString(
          '"${1:namespace:id}":\n  ${0}',
        );
        return [item];
      }

      const rawValue =
        blueprintPath.length > 0
          ? valueAtConfigurationPath(section, yamlContext.path.slice(0, 3))
          : undefined;
      const blueprintRaw = isRecord(rawValue) ? rawValue : undefined;
      switch (blueprintFamily.canonical) {
        case "items": {
          const nested = blueprintPath
            .slice(1)
            .map((entry) => entry.replaceAll("-", "_"));
          const inlineBlockIndex = nested.lastIndexOf("block");
          if (inlineBlockIndex >= 0) {
            const inline = valueAtRecordPath(
              blueprintRaw,
              blueprintPath.slice(1, inlineBlockIndex + 2),
            );
            return blockCompletions(isRecord(inline) ? inline : undefined, [
              `${blueprintPath[0] ?? "item"}#block`,
              ...blueprintPath.slice(inlineBlockIndex + 2),
            ]);
          }
          const inlineFurnitureIndex = nested.lastIndexOf("furniture");
          if (inlineFurnitureIndex >= 0) {
            const inline = valueAtRecordPath(
              blueprintRaw,
              blueprintPath.slice(1, inlineFurnitureIndex + 2),
            );
            return furnitureCompletions(isRecord(inline) ? inline : undefined, [
              `${blueprintPath[0] ?? "item"}#furniture`,
              ...blueprintPath.slice(inlineFurnitureIndex + 2),
            ]);
          }
          const inlineLootIndex = nested.findIndex(
            (entry) => entry === "loot" || entry === "loots",
          );
          if (inlineLootIndex >= 0) {
            return lootCompletions([
              `${blueprintPath[0] ?? "item"}#loot`,
              ...blueprintPath.slice(inlineLootIndex + 2),
            ]);
          }
          const itemContext = {
            path: blueprintPath,
            siblingValues: schemaSiblingValues,
            ancestorTypes: ancestorTypesForPath(blueprintRaw, blueprintPath),
          };
          const fields = withTemplateSchemaFields(
            blueprintPath,
            itemFieldsForContext(itemContext),
          );
          const listField = document
            .lineAt(position)
            .text.trimStart()
            .startsWith("-")
            ? itemListItemField(blueprintPath)
            : undefined;
          const generationTextures =
            itemGenerationTextureMapping(blueprintPath);
          const dynamicKey = generationTextures
            ? ITEM_GENERATION_TEXTURE_KEY_FIELD
            : itemDataDynamicKeyField(itemContext);
          const dynamicValue = generationTextures
            ? ITEM_GENERATION_TEXTURE_VALUE_FIELD
            : yamlContext.fieldName
              ? itemDataDynamicValueField(itemContext, yamlContext.fieldName)
              : undefined;
          return schemaCompletions({
            fields,
            fieldForName: (name, candidates) =>
              itemSchemaFieldForName(itemContext, name, candidates),
            ...(listField === undefined ? {} : { listField }),
            ...(dynamicKey === undefined ? {} : { dynamicKey }),
            ...(dynamicValue === undefined ? {} : { dynamicValue }),
          });
        }
        case "blocks":
          return blockCompletions(blueprintRaw, blueprintPath);
        case "furniture":
          return furnitureCompletions(blueprintRaw, blueprintPath);
        case "recipes":
          return recipeCompletions(blueprintPath, blueprintRaw);
        case "loot":
          return lootCompletions(blueprintPath, true);
        case "vanilla-loots":
          return vanillaLootCompletions(blueprintPath, true);
        case "configured-feature":
        case "placed-feature":
          return worldgenCompletions(
            exactBlueprintType ?? blueprintFamily.canonical,
            blueprintPath,
            blueprintRaw,
          );
        case "images":
          return schemaCompletions({
            fields: imageFieldsForContext({
              path: blueprintPath,
              siblingValues: schemaSiblingValues,
            }),
            fieldForName: imageSchemaFieldForName,
          });
        case "sounds":
          return schemaCompletions({
            fields:
              blueprintPath.length === 1
                ? withEnableDebugSchemaFields(
                    soundFieldsForContext({
                      path: blueprintPath,
                      siblingValues: schemaSiblingValues,
                    }),
                  )
                : soundFieldsForContext({
                    path: blueprintPath,
                    siblingValues: schemaSiblingValues,
                  }),
            fieldForName: soundSchemaFieldForName,
          });
        case "emojis":
        case "categories":
        case "block-state-mappings":
        case "skip-optimization":
        case "paintings":
        case "advancements":
          return miscCompletions(
            exactBlueprintType ?? blueprintFamily.canonical,
            blueprintPath,
            blueprintRaw,
          );
        case "equipments": {
          const relative = blueprintPath
            .slice(1)
            .map((entry) => entry.replaceAll("-", "_"));
          let fields: readonly SchemaField[] = [];
          if (relative.length === 0) {
            fields = withEnableDebugSchemaFields([
              {
                label: "type",
                semantic: "type",
                aliases: [],
                detail: Messages.src.providers.completion.provider.text0075,
                snippet: "type: ${1|component,trim|}",
                values: ["component", "trim"],
              },
              ...EQUIPMENT_LAYER_TYPES.map(
                (layer): SchemaField => ({
                  label: layer,
                  semantic: layer,
                  aliases: [],
                  detail:
                    Messages.src.providers.completion.provider.text0076(layer),
                  snippet: `${layer}: \${0:minecraft:entity/equipment/${layer}/texture}`,
                  valueProvider: "texture",
                }),
              ),
            ]);
          } else if (equipmentLayerTypeForKey(relative[0]) !== undefined) {
            fields =
              relative.at(-1) === "dyeable"
                ? [
                    {
                      label: "color_when_undyed",
                      semantic: "color_when_undyed",
                      aliases: [],
                      detail:
                        Messages.src.providers.completion.provider.text0077,
                      snippet: "color_when_undyed: ${0:16777215}",
                      valueProvider: "number",
                    },
                  ]
                : [
                    {
                      label: "texture",
                      semantic: "texture",
                      aliases: [],
                      detail:
                        Messages.src.providers.completion.provider.text0078,
                      snippet: "texture: ${0}",
                      valueProvider: "texture",
                    },
                    {
                      label: "dyeable",
                      semantic: "dyeable",
                      aliases: [],
                      detail:
                        Messages.src.providers.completion.provider.text0079,
                      snippet: "dyeable:\n  color_when_undyed: ${0:16777215}",
                    },
                    {
                      label: "use_player_texture",
                      semantic: "use_player_texture",
                      aliases: [],
                      detail:
                        Messages.src.providers.completion.provider.text0080,
                      snippet: "use_player_texture: ${1|true,false|}",
                      values: ["true", "false"],
                      valueProvider: "boolean",
                    },
                  ];
          }
          return schemaCompletions({
            fields: withTemplateSchemaFields(blueprintPath, fields),
          });
        }
        case "jukebox-songs": {
          const fields: readonly SchemaField[] =
            blueprintPath.length === 1
              ? withEnableDebugSchemaFields(
                  JUKEBOX_SONG_FIELDS.map(
                    (field): SchemaField => ({
                      label: field.label,
                      semantic: field.label.replaceAll("-", "_"),
                      aliases: field.aliases ?? [],
                      detail: field.detail,
                      snippet: `${field.label}: \${0}`,
                      ...(field.kind === "sound"
                        ? { valueProvider: "sound" as const }
                        : {}),
                    }),
                  ),
                )
              : [];
          return schemaCompletions({
            fields: withTemplateSchemaFields(blueprintPath, fields),
          });
        }
        case "global-variables": {
          if (!yamlContext.propertyPosition) return [];
          const item = completion(
            "name",
            Messages.src.providers.completion.provider.text0081,
            vscode.CompletionItemKind.Property,
            replacement,
          );
          item.insertText = new vscode.SnippetString("${1:name}: ${0}");
          return [item];
        }
        case "translations":
        case "lang": {
          if (!yamlContext.propertyPosition) return [];
          if (blueprintPath.length === 0) {
            return (
              blueprintFamily.canonical === "lang"
                ? ["zh_cn", "en_us", "zh_tw", "all"]
                : ["zh_cn", "en_us", "zh_tw", "en", "zh"]
            ).map((locale) => {
              const item = completion(
                locale,
                Messages.src.providers.completion.provider.text0082,
                vscode.CompletionItemKind.EnumMember,
                replacement,
              );
              item.insertText = new vscode.SnippetString(`${locale}:\n  \${0}`);
              return item;
            });
          }
          const item = completion(
            "<translation-key>",
            Messages.src.providers.completion.provider.text0083,
            vscode.CompletionItemKind.Property,
            replacement,
          );
          item.insertText = new vscode.SnippetString(
            "${1:translation.key}: ${0}",
          );
          return [item];
        }
        default:
          return [];
      }
    }

    if (sectionFamily?.canonical === "recipes") return recipeCompletions();
    if (resolveMiscResourceSection(section.type)) return miscCompletions();
    if (worldgenSectionKind(section.type)) return worldgenCompletions();

    if (section.type === "sounds" || section.type === "sound") {
      const soundFields = soundFieldsForContext({
        path: yamlContext.path,
        siblingValues: schemaSiblingValues,
      });
      const fields =
        yamlContext.path.length === 1
          ? withEnableDebugSchemaFields(soundFields)
          : soundFields;
      const nested = yamlContext.path
        .slice(1)
        .map((entry) => entry.replaceAll("-", "_"));
      if (yamlContext.propertyPosition) {
        if (
          (nested[0] === "sounds" || nested[0] === "sound") &&
          document.lineAt(position).text.trimStart().startsWith("-") &&
          nested.length <= 2
        ) {
          const values = new Map<string, string>();
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            {
              label: "name",
              semantic: "name",
              aliases: [],
              detail: Messages.src.providers.completion.provider.text0084,
              snippet: "name: ${0}",
              valueProvider: "sound-file",
            },
            document,
          );
          return [...values].map(([label, detail]) =>
            identifierCompletion(
              label,
              detail,
              replacement,
              vscode.CompletionItemKind.File,
            ),
          );
        }
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) => key.replaceAll("-", "_")),
        );
        return withTemplateItems(
          fields
            .filter((field) => !existingSemantics.has(field.semantic))
            .map((field) => schemaPropertyCompletion(field, replacement)),
        );
      }
      const fieldName = yamlContext.fieldName;
      if (!fieldName) return [];
      const selected = soundSchemaFieldForName(fieldName, fields);
      if (!selected) return [];
      const values = new Map<string, string>();
      for (const value of selected.values ?? [])
        values.set(value, selected.valueDetails?.[value] ?? selected.detail);
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        selected,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(
          label,
          detail,
          replacement,
          selected.valueProvider === "sound-file"
            ? vscode.CompletionItemKind.File
            : vscode.CompletionItemKind.Value,
        ),
      );
    }

    if (section.type === "loots" || section.type === "loot") {
      return lootCompletions(yamlContext.path, true);
    }

    if (sectionFamily?.canonical === "vanilla-loots") {
      return vanillaLootCompletions(yamlContext.path, true);
    }

    switch (section.type) {
      case "jukebox-songs":
      case "jukebox-song":
      case "jukebox_songs":
      case "jukebox_song": {
        if (
          yamlContext.path.length === 2 &&
          yamlContext.path[1] === "arguments" &&
          yamlContext.propertyPosition &&
          yamlContext.entryId
        ) {
          return templateArgumentNames(
            section,
            yamlContext.entryId,
            this.workspaceIndex.templatesForDocument(document),
          )
            .filter((name) => !yamlContext.existingKeys.has(name))
            .map((name) => {
              const item = completion(
                name,
                Messages.src.providers.completion.provider.text0085,
                vscode.CompletionItemKind.Variable,
                replacement,
              );
              item.insertText = new vscode.SnippetString(`${name}: \${0}`);
              return item;
            });
        }
        if (yamlContext.path.length === 1 && yamlContext.propertyPosition) {
          const existing = new Set(
            [...yamlContext.existingKeys].map((key) =>
              key.replaceAll("_", "-"),
            ),
          );
          return withTemplateItems(
            [
              ...withEnableDebugSchemaFields([]).map((field) => ({
                label: field.label,
                detail: field.detail,
                kind: "text" as const,
                aliases: field.aliases,
              })),
              ...JUKEBOX_SONG_FIELDS,
              {
                label: "template",
                detail: Messages.src.providers.completion.provider.text0086,
                kind: "text" as const,
              },
              {
                label: "arguments",
                detail: Messages.src.providers.completion.provider.text0087,
                kind: "text" as const,
              },
              {
                label: "overrides",
                detail: Messages.src.providers.completion.provider.text0088,
                kind: "text" as const,
              },
              {
                label: "merges",
                detail: Messages.src.providers.completion.provider.text0089,
                kind: "text" as const,
              },
            ]
              .filter(
                (field) =>
                  !existing.has(field.label) &&
                  !(field.aliases ?? []).some((alias) =>
                    existing.has(alias.replaceAll("_", "-")),
                  ),
              )
              .map((field) => {
                const item = completion(
                  field.label,
                  field.detail,
                  vscode.CompletionItemKind.Property,
                  replacement,
                );
                item.insertText = new vscode.SnippetString(
                  field.label === "arguments" ||
                    field.label === "overrides" ||
                    field.label === "merges"
                    ? `${field.label}:\n  \${0}`
                    : field.label === "template"
                      ? "template: ${0}"
                      : field.label === "enable" || field.label === "debug"
                        ? `${field.label}: \${1|true,false|}`
                        : `${field.label}: \${0}`,
                );
                return item;
              }),
          );
        }
        const fieldName = yamlContext.fieldName?.replaceAll("_", "-");
        if (fieldName === "enable" || fieldName === "debug") {
          return ["true", "false"].map((value) =>
            identifierCompletion(
              value,
              fieldName === "enable"
                ? Messages.src.providers.completion.provider.text0090
                : Messages.src.providers.completion.provider.text0091,
              replacement,
            ),
          );
        }
        const selectedField = JUKEBOX_SONG_FIELDS.find(
          (field) =>
            field.label === fieldName ||
            (field.aliases ?? []).some(
              (alias) => alias.replaceAll("_", "-") === fieldName,
            ),
        );
        if (selectedField?.kind === "sound") {
          const values = new Map<string, string>();
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            {
              label: "sound",
              semantic: "sound",
              aliases: [],
              detail: Messages.src.providers.completion.provider.text0092,
              snippet: "sound: ${0}",
              valueProvider: "sound",
            },
            document,
          );
          return [...values].map(([id, detail]) =>
            identifierCompletion(id, detail, replacement),
          );
        }
        if (fieldName === "template") {
          return this.workspaceIndex
            .templatesForDocument(document)
            .map((template) =>
              identifierCompletion(
                template.id,
                Messages.src.providers.completion.provider.text0093(
                  template.pack.name,
                ),
                replacement,
              ),
            );
        }
        return [];
      }
    }

    if (section.type === "equipments" || section.type === "equipment") {
      if (
        yamlContext.path.length === 2 &&
        yamlContext.path[1] === "arguments" &&
        yamlContext.propertyPosition &&
        yamlContext.entryId
      ) {
        return templateArgumentNames(
          section,
          yamlContext.entryId,
          this.workspaceIndex.templatesForDocument(document),
        )
          .filter((name) => !yamlContext.existingKeys.has(name))
          .map((name) => {
            const item = completion(
              name,
              Messages.src.providers.completion.provider.text0094,
              vscode.CompletionItemKind.Variable,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${name}: \${0}`);
            return item;
          });
      }
      if (yamlContext.path.length === 1 && yamlContext.propertyPosition) {
        const fields = [
          ["enable", Messages.src.providers.completion.provider.text0095],
          ["debug", Messages.src.providers.completion.provider.text0096],
          ["type", Messages.src.providers.completion.provider.text0097],
          ...EQUIPMENT_LAYER_TYPES.map(
            (layer) =>
              [
                layer,
                Messages.src.providers.completion.provider.text0098(layer),
              ] as const,
          ),
          ["template", Messages.src.providers.completion.provider.text0099],
          ["arguments", Messages.src.providers.completion.provider.text0100],
          ["overrides", Messages.src.providers.completion.provider.text0101],
          ["merges", Messages.src.providers.completion.provider.text0102],
        ] as const;
        const existing = new Set(
          [...yamlContext.existingKeys].map((key) => key.replaceAll("-", "_")),
        );
        return withTemplateItems(
          fields
            .filter(([label]) => !existing.has(label.replaceAll("-", "_")))
            .map(([label, detail]) => {
              const item = completion(
                label,
                detail,
                vscode.CompletionItemKind.Property,
                replacement,
              );
              item.insertText = new vscode.SnippetString(
                EQUIPMENT_LAYER_TYPES.includes(
                  label as (typeof EQUIPMENT_LAYER_TYPES)[number],
                )
                  ? `${label}: \${0:minecraft:entity/equipment/${label}/texture}`
                  : label === "type"
                    ? "type: ${1|component,trim|}"
                    : label === "enable" || label === "debug"
                      ? `${label}: \${1|true,false|}`
                      : label === "template"
                        ? "template: ${0}"
                        : `${label}:\n  \${0}`,
              );
              return item;
            }),
        );
      }
      const equipmentPath = yamlContext.path.map((entry) =>
        entry.replaceAll("-", "_"),
      );
      if (
        yamlContext.propertyPosition &&
        equipmentLayerTypeForKey(equipmentPath[1]) !== undefined
      ) {
        const nestedFields =
          equipmentPath[2] === "dyeable"
            ? ([
                [
                  "color_when_undyed",
                  Messages.src.providers.completion.provider.text0103,
                ],
              ] as const)
            : ([
                [
                  "texture",
                  Messages.src.providers.completion.provider.text0104,
                ],
                [
                  "dyeable",
                  Messages.src.providers.completion.provider.text0105,
                ],
                [
                  "use_player_texture",
                  Messages.src.providers.completion.provider.text0106,
                ],
              ] as const);
        const existing = new Set(
          [...yamlContext.existingKeys].map((key) => key.replaceAll("-", "_")),
        );
        return withTemplateItems(
          nestedFields
            .filter(([label]) => !existing.has(label))
            .map(([label, detail]) => {
              const item = completion(
                label,
                detail,
                vscode.CompletionItemKind.Property,
                replacement,
              );
              item.insertText = new vscode.SnippetString(
                label === "dyeable"
                  ? "dyeable:\n  color_when_undyed: ${0:16777215}"
                  : label === "use_player_texture"
                    ? "use_player_texture: ${1|true,false|}"
                    : `${label}: \${0}`,
              );
              return item;
            }),
        );
      }
      const fieldName = yamlContext.fieldName?.replaceAll("-", "_");
      if (fieldName === "type") {
        const equipmentTypeDetails = new Map([
          ["component", Messages.src.providers.completion.provider.text0107],
          ["trim", Messages.src.providers.completion.provider.text0108],
        ]);
        return [...equipmentTypeDetails].map(([value, detail]) =>
          identifierCompletion(value, detail, replacement),
        );
      }
      if (fieldName === "use_player_texture") {
        return ["true", "false"].map((value) =>
          identifierCompletion(
            value,
            Messages.src.providers.completion.provider.text0109,
            replacement,
          ),
        );
      }
      if (fieldName === "enable" || fieldName === "debug") {
        return ["true", "false"].map((value) =>
          identifierCompletion(
            value,
            fieldName === "enable"
              ? Messages.src.providers.completion.provider.text0110
              : Messages.src.providers.completion.provider.text0111,
            replacement,
          ),
        );
      }
      if (fieldName === "template") {
        return this.workspaceIndex
          .templatesForDocument(document)
          .map((template) =>
            identifierCompletion(
              template.id,
              Messages.src.providers.completion.provider.text0112(
                template.pack.name,
              ),
              replacement,
            ),
          );
      }
      if (
        equipmentLayerTypeForKey(fieldName) !== undefined ||
        fieldName === "texture"
      ) {
        return this.workspaceIndex
          .textureIdentifiers(document)
          .map((id) =>
            identifierCompletion(
              id,
              Messages.src.providers.completion.provider.text0113,
              replacement,
              vscode.CompletionItemKind.File,
            ),
          );
      }
      return [];
    }

    if (section.type === "blocks" || section.type === "block") {
      if (
        yamlContext.path.length === 2 &&
        yamlContext.path[1] === "arguments" &&
        yamlContext.propertyPosition &&
        yamlContext.entryId
      ) {
        return templateArgumentNames(
          section,
          yamlContext.entryId,
          this.workspaceIndex.templatesForDocument(document),
        )
          .filter((name) => !yamlContext.existingKeys.has(name))
          .map((name) => {
            const item = completion(
              name,
              Messages.src.providers.completion.provider.text0114,
              vscode.CompletionItemKind.Variable,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${name}: \${0}`);
            return item;
          });
      }
      const indexed = this.workspaceIndex.blockAt(document, position);
      if (indexed) return blockCompletions(indexed.raw, yamlContext.path);
      if (!yamlContext.entryId || !isRecord(section.value))
        return blockCompletions(undefined, yamlContext.path);
      const direct = section.value[yamlContext.entryId];
      return blockCompletions(
        isRecord(direct) ? direct : undefined,
        yamlContext.path,
      );
    }

    if (section.type === "furniture") {
      if (
        yamlContext.path.length === 2 &&
        yamlContext.path[1] === "arguments" &&
        yamlContext.propertyPosition &&
        yamlContext.entryId
      ) {
        return templateArgumentNames(
          section,
          yamlContext.entryId,
          this.workspaceIndex.templatesForDocument(document),
        )
          .filter((name) => !yamlContext.existingKeys.has(name))
          .map((name) => {
            const item = completion(
              name,
              Messages.src.providers.completion.provider.text0115,
              vscode.CompletionItemKind.Variable,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${name}: \${0}`);
            return item;
          });
      }
      const indexed = this.workspaceIndex.furnitureAt(document, position);
      if (indexed) return furnitureCompletions(indexed.raw, yamlContext.path);
      if (!yamlContext.entryId || !isRecord(section.value))
        return furnitureCompletions(undefined, yamlContext.path);
      const direct = section.value[yamlContext.entryId];
      return furnitureCompletions(
        isRecord(direct) ? direct : undefined,
        yamlContext.path,
      );
    }

    if (section.type === "items" || section.type === "item") {
      if (
        yamlContext.path.length === 2 &&
        yamlContext.path[1] === "arguments" &&
        yamlContext.propertyPosition &&
        yamlContext.entryId
      ) {
        return templateArgumentNames(
          section,
          yamlContext.entryId,
          this.workspaceIndex.templatesForDocument(document),
        )
          .filter((name) => !yamlContext.existingKeys.has(name))
          .map((name) => {
            const item = completion(
              name,
              Messages.src.providers.completion.provider.text0116,
              vscode.CompletionItemKind.Variable,
              replacement,
            );
            item.insertText = new vscode.SnippetString(`${name}: \${0}`);
            return item;
          });
      }
      const nested = yamlContext.path
        .slice(1)
        .map((entry) => entry.replaceAll("-", "_"));
      const indexedItem = this.workspaceIndex.itemAt(document, position);
      const itemRaw = isRecord(indexedItem?.raw)
        ? indexedItem.raw
        : directEntry();
      const inlineBlock = this.workspaceIndex.blockAt(document, position);
      const inlineBlockIndex = nested.lastIndexOf("block");
      if (
        inlineBlock?.source.sectionKey.endsWith(":inline-block") &&
        inlineBlockIndex >= 0
      ) {
        return blockCompletions(inlineBlock.raw, [
          inlineBlock.id,
          ...yamlContext.path.slice(inlineBlockIndex + 2),
        ]);
      }
      const inlineFurniture = this.workspaceIndex.furnitureAt(
        document,
        position,
      );
      const inlineFurnitureIndex = nested.lastIndexOf("furniture");
      if (
        inlineFurniture?.source.sectionKey.endsWith(":inline-furniture") &&
        inlineFurnitureIndex >= 0
      ) {
        return furnitureCompletions(inlineFurniture.raw, [
          inlineFurniture.id,
          ...yamlContext.path.slice(inlineFurnitureIndex + 2),
        ]);
      }
      const compactItemPath = nested.filter((entry) => !/^\d+$/u.test(entry));
      const inlineLootIndex = nested.findIndex(
        (entry) => entry === "loot" || entry === "loots",
      );
      if (inlineLootIndex >= 0) {
        return lootCompletions([
          `${yamlContext.entryId ?? "item"}#loot`,
          ...yamlContext.path.slice(inlineLootIndex + 2),
        ]);
      }
      if (
        yamlContext.propertyPosition &&
        compactItemPath.at(-1) === "rules" &&
        (compactItemPath[0] === "behavior" ||
          compactItemPath[0] === "behaviors")
      ) {
        const behavior = valueAtConfigurationPath(
          section,
          yamlContext.path.slice(0, -1),
        );
        const names = new Set<string>();
        if (isRecord(behavior)) {
          if (isRecord(behavior.furniture))
            for (const name of furnitureVariantNames(behavior.furniture))
              names.add(name);
          else if (typeof behavior.furniture === "string") {
            const currentItem = this.workspaceIndex.itemAt(document, position);
            const possibleIds = new Set([
              makeIdentifier(
                behavior.furniture,
                currentItem?.namespace ?? "minecraft",
              ),
              makeIdentifier(behavior.furniture, "minecraft"),
            ]);
            for (const furniture of this.workspaceIndex.opaqueIds(
              "furniture",
              document,
            )) {
              if (!possibleIds.has(furniture.id) || !isRecord(furniture.raw))
                continue;
              for (const name of furnitureVariantNames(furniture.raw))
                names.add(name);
            }
          }
        }
        return withTemplateItems(
          [...names]
            .filter((name) => !yamlContext.existingKeys.has(name))
            .map((name) => {
              const item = completion(
                name,
                Messages.src.providers.completion.provider.text0117,
                vscode.CompletionItemKind.EnumMember,
                replacement,
              );
              item.insertText = new vscode.SnippetString(
                `${name}:\n  alignment: \${1|any,corner,center,half,quarter,center_quarter|}\n  rotation: \${2|any,four,eight,sixteen,north,east,west,south|}`,
              );
              return item;
            }),
        );
      }
      const conditionContext = compactItemPath.some(
        (entry) =>
          entry === "conditions" ||
          entry === "condition" ||
          entry === "terms" ||
          entry === "term",
      );
      const typedContext = conditionContext
        ? resolveFunctionOrConditionType(
            "condition",
            schemaSiblingValues.get("type"),
          )
        : compactItemPath[0] === "events" || compactItemPath[0] === "event"
          ? resolveFunctionOrConditionType(
              "function",
              schemaSiblingValues.get("type"),
            )
          : undefined;
      if (typedContext?.external) return [];
      const itemSchemaPath = yamlContext.path;
      const itemSchemaContext = {
        path: itemSchemaPath,
        siblingValues: schemaSiblingValues,
        ancestorTypes: ancestorTypesForPath(itemRaw, yamlContext.path),
      };
      const schemaFields = itemFieldsForContext(itemSchemaContext);
      const generationTextures = itemGenerationTextureMapping(yamlContext.path);
      const componentContext =
        nested[0] === "data" || nested[0] === "client_bound_data"
          ? dataComponentPathContext(nested)
          : undefined;
      if (yamlContext.propertyPosition) {
        if (generationTextures) {
          const item = completion(
            ITEM_GENERATION_TEXTURE_KEY_FIELD.label,
            ITEM_GENERATION_TEXTURE_KEY_FIELD.detail,
            vscode.CompletionItemKind.Property,
            replacement,
          );
          item.insertText = new vscode.SnippetString(
            ITEM_GENERATION_TEXTURE_KEY_FIELD.snippet,
          );
          return withTemplateItems([item]);
        }
        const itemListField = document
          .lineAt(position)
          .text.trimStart()
          .startsWith("-")
          ? itemListItemField(itemSchemaPath)
          : undefined;
        if (itemListField) {
          const values = new Map<string, string>();
          for (const value of itemListField.values ?? [])
            values.set(
              value,
              itemListField.valueDetails?.[value] ?? itemListField.detail,
            );
          addSchemaValues(
            this.workspaceIndex,
            this.descriptions,
            values,
            itemListField,
            document,
          );
          if (values.size > 0)
            return [...values].map(([label, detail]) =>
              identifierCompletion(
                label,
                detail,
                replacement,
                itemListField.valueProvider === "model" ||
                  itemListField.valueProvider === "texture"
                  ? vscode.CompletionItemKind.File
                  : vscode.CompletionItemKind.Value,
              ),
            );
        }
        if (componentContext && componentContext.componentId === undefined) {
          return withTemplateItems(
            (this.workspaceIndex.vanilla?.components ?? [])
              .filter((id) => !yamlContext.existingKeys.has(id))
              .map((id) => {
                const definition = dataComponentDefinition(id);
                const item = completion(
                  id,
                  definition?.detail ??
                    Messages.src.providers.completion.provider.text0118,
                  vscode.CompletionItemKind.Property,
                  replacement,
                );
                item.insertText = new vscode.SnippetString(
                  definition
                    ? dataComponentRootSnippet(definition)
                    : `${id}: \${0}`,
                );
                return item;
              }),
          );
        }
        if (componentContext?.componentId) {
          const listItemField = document
            .lineAt(position)
            .text.trimStart()
            .startsWith("-")
            ? dataComponentListItemField(
                componentContext.componentId,
                componentContext.payloadPath,
              )
            : undefined;
          if (listItemField) {
            const values = new Map<string, string>();
            for (const value of listItemField.values ?? []) {
              values.set(
                value,
                listItemField.valueDetails?.[value] ?? listItemField.detail,
              );
            }
            addSchemaValues(
              this.workspaceIndex,
              this.descriptions,
              values,
              listItemField,
              document,
            );
            if (values.size > 0) {
              return [...values].map(([label, detail]) =>
                identifierCompletion(label, detail, replacement),
              );
            }
          }
          const dynamic = dataComponentDynamicEntry(
            componentContext.componentId,
            componentContext.payloadPath,
          );
          if (dynamic) {
            const values = new Map<string, string>();
            for (const value of dynamic.key.values ?? []) {
              values.set(
                value,
                dynamic.key.valueDetails?.[value] ?? dynamic.key.detail,
              );
            }
            addSchemaValues(
              this.workspaceIndex,
              this.descriptions,
              values,
              dynamic.key,
              document,
            );
            return withTemplateItems(
              [...values]
                .filter(([label]) => !yamlContext.existingKeys.has(label))
                .map(([label, detail]) => {
                  const item = completion(
                    label,
                    detail,
                    vscode.CompletionItemKind.Property,
                    replacement,
                  );
                  item.insertText = new vscode.SnippetString(
                    dynamic.snippetForKey?.(label) ?? `${label}: \${0}`,
                  );
                  return item;
                }),
            );
          }
        }
        const existingSemantics = new Set(
          [...yamlContext.existingKeys].map((key) =>
            semanticForField(key, schemaFields),
          ),
        );
        const properties = schemaFields
          .filter((field) => !existingSemantics.has(field.semantic))
          .map((field) => schemaPropertyCompletion(field, replacement));
        const itemDynamic = itemDataDynamicKeyField(itemSchemaContext);
        if (!itemDynamic) return withTemplateItems(properties);
        const values = new Map<string, string>();
        for (const value of itemDynamic.values ?? []) {
          values.set(
            value,
            itemDynamic.valueDetails?.[value] ?? itemDynamic.detail,
          );
        }
        addSchemaValues(
          this.workspaceIndex,
          this.descriptions,
          values,
          itemDynamic,
          document,
        );
        const placeholder = /^<[^>]+>$/u.test(itemDynamic.label)
          ? (() => {
              const item = completion(
                itemDynamic.label,
                itemDynamic.detail,
                vscode.CompletionItemKind.Property,
                replacement,
              );
              item.insertText = new vscode.SnippetString(itemDynamic.snippet);
              return item;
            })()
          : undefined;
        return withTemplateItems([
          ...properties,
          ...(placeholder ? [placeholder] : []),
          ...[...values]
            .filter(([label]) => !yamlContext.existingKeys.has(label))
            .map(([label, detail]) => {
              const item = completion(
                label,
                detail,
                vscode.CompletionItemKind.Property,
                replacement,
              );
              item.insertText = new vscode.SnippetString(`${label}: \${0:1}`);
              return item;
            }),
        ]);
      }

      const fieldName = yamlContext.fieldName;
      if (generationTextures && fieldName) {
        const values = new Map<string, string>();
        addSchemaValues(
          this.workspaceIndex,
          this.descriptions,
          values,
          ITEM_GENERATION_TEXTURE_VALUE_FIELD,
          document,
        );
        return [...values].map(([label, detail]) =>
          identifierCompletion(
            label,
            detail,
            replacement,
            vscode.CompletionItemKind.File,
          ),
        );
      }
      let schemaField = fieldName
        ? itemSchemaFieldForName(itemSchemaContext, fieldName, schemaFields)
        : undefined;
      if (
        !schemaField &&
        fieldName &&
        componentContext?.componentId === undefined
      ) {
        schemaField = dataComponentValueField(fieldName);
      }
      if (!schemaField && fieldName && componentContext?.componentId) {
        const dynamic = dataComponentDynamicEntry(
          componentContext.componentId,
          componentContext.payloadPath,
        );
        schemaField = dynamic?.valueForKey?.(fieldName) ?? dynamic?.value;
      }
      if (!schemaField && fieldName) {
        schemaField = itemDataDynamicValueField(itemSchemaContext, fieldName);
      }
      if (!schemaField) return [];
      const values = new Map<string, string>();
      for (const value of schemaField.values ?? []) {
        values.set(
          value,
          schemaField.valueDetails?.[value] ?? schemaField.detail,
        );
      }
      const provider = schemaField.valueProvider;
      if (provider === "material") {
        const current = document.getText(replacement);
        const search = new vscode.CompletionItem(
          {
            label: Messages.src.providers.completion.provider.text0119,
            description: Messages.src.providers.completion.provider.text0120,
          },
          vscode.CompletionItemKind.Reference,
        );
        search.range = replacement;
        search.insertText = current;
        search.filterText =
          Messages.src.providers.completion.provider.text0121(current);
        search.sortText = "0-search";
        search.command = {
          command: "craftengineYaml.selectMaterial",
          title: Messages.src.providers.completion.provider.text0122,
          arguments: [
            {
              uri: document.uri.toString(),
              start: document.offsetAt(replacement.start),
              end: document.offsetAt(replacement.end),
            },
          ],
        };
        const materialItems = (this.workspaceIndex.vanilla?.items ?? [])
          .filter((material) => material.id !== "minecraft:air")
          .map((material) => {
            const item = new vscode.CompletionItem(
              `${material.id}（${material.name}）`,
              vscode.CompletionItemKind.Value,
            );
            item.range = replacement;
            item.insertText = material.id;
            item.filterText = `${material.id} ${material.name}`;
            item.sortText = `1-${material.id}`;
            return item;
          });
        return [search, ...materialItems];
      }
      addSchemaValues(
        this.workspaceIndex,
        this.descriptions,
        values,
        schemaField,
        document,
      );
      return [...values].map(([label, detail]) =>
        identifierCompletion(
          label,
          detail,
          replacement,
          provider === "model" || provider === "texture"
            ? vscode.CompletionItemKind.File
            : vscode.CompletionItemKind.Value,
        ),
      );
    }

    if (
      context.level === "template-argument" &&
      context.propertyPosition &&
      context.imageId
    ) {
      return templateArgumentNames(
        section,
        context.imageId,
        this.workspaceIndex.templatesForDocument(document),
      )
        .filter((name) => !context.existingKeys.has(name))
        .map((name) => {
          const item = completion(
            name,
            Messages.src.providers.completion.provider.text0123,
            vscode.CompletionItemKind.Variable,
            replacement,
          );
          item.insertText = new vscode.SnippetString(`${name}: \${0}`);
          return item;
        });
    }

    const fieldName = context.fieldName;
    if (
      sectionFamily?.canonical === "images" &&
      context.level === "image-field"
    ) {
      const fields = imageFieldsForContext({
        path: yamlContext.path,
        siblingValues: schemaSiblingValues,
      });
      if (context.propertyPosition) {
        return schemaCompletions({ fields });
      }
      const selected = fieldName
        ? imageSchemaFieldForName(fieldName, fields)
        : undefined;
      const semantic = selected?.semantic;
      if (semantic === "ref" && selected) {
        results.push(...valueItemsForField(selected));
      } else if (semantic === "file") {
        for (const identifier of this.workspaceIndex.textureIdentifiers(
          document,
        )) {
          const fileIdentifier = identifier.toLowerCase().endsWith(".png")
            ? identifier
            : `${identifier}.png`;
          const item = completion(
            fileIdentifier,
            Messages.src.providers.completion.provider.text0124,
            vscode.CompletionItemKind.File,
            replacement,
          );
          item.insertText = fileIdentifier;
          item.filterText = fileIdentifier;
          item.sortText = `0-${fileIdentifier}`;
          results.push(item);
        }
      } else if (semantic === "font") {
        const fonts = new Set(
          this.workspaceIndex.index.images.flatMap((image) =>
            image.spec.kind === "bitmap" ? [image.spec.font] : [],
          ),
        );
        for (const pack of this.workspaceIndex.packs)
          fonts.add(`${pack.namespace}:default`);
        for (const font of this.workspaceIndex.fontIdentifiers(document))
          fonts.add(font);
        for (const font of fonts)
          results.push(
            completion(
              font,
              Messages.src.providers.completion.provider.text0125,
              vscode.CompletionItemKind.Value,
              replacement,
            ),
          );
      } else if (semantic === "row" || semantic === "col") {
        const image = this.workspaceIndex.imageAt(document, position);
        const resolved = image
          ? this.workspaceIndex.index.resolved.get(image)
          : undefined;
        const bitmap = resolved?.bitmap.spec;
        const maximum =
          bitmap?.kind === "bitmap"
            ? semantic === "row"
              ? bitmap.rows
              : bitmap.columns
            : 1;
        for (let value = 0; value < maximum; value += 1) {
          results.push(
            completion(
              String(value),
              Messages.src.providers.completion.provider.text0126,
              vscode.CompletionItemKind.Value,
              replacement,
            ),
          );
        }
      } else if (semantic === "height" || semantic === "ascent") {
        const image = this.workspaceIndex.imageAt(document, position);
        if (image?.spec.kind === "bitmap") {
          const texture =
            image.spec.textureCandidates.find(
              (candidate) => candidate.effective,
            ) ?? image.spec.textureCandidates[0];
          const derivedHeight =
            texture?.height === undefined
              ? undefined
              : Math.floor(texture.height / image.spec.rows);
          const value =
            semantic === "height"
              ? derivedHeight
              : derivedHeight === undefined
                ? undefined
                : derivedHeight - 1;
          if (value !== undefined)
            results.push(
              completion(
                String(value),
                Messages.src.providers.completion.provider.text0127,
                vscode.CompletionItemKind.Value,
                replacement,
              ),
            );
        }
      }
      if (semantic === "template") {
        for (const template of this.workspaceIndex.templatesForDocument(
          document,
        )) {
          results.push(
            completion(
              template.id,
              Messages.src.providers.completion.provider.text0128(
                template.pack.name,
              ),
              vscode.CompletionItemKind.Reference,
              replacement,
            ),
          );
        }
      }
      if (selected && results.length === 0)
        results.push(...valueItemsForField(selected));
    } else if (fieldName === "template") {
      for (const template of this.workspaceIndex.templatesForDocument(
        document,
      )) {
        results.push(
          completion(
            template.id,
            Messages.src.providers.completion.provider.text0129(
              template.pack.name,
            ),
            vscode.CompletionItemKind.Reference,
          ),
        );
      }
    }
    return yamlContext.propertyPosition ? withTemplateItems(results) : results;
  }

  private languageCatalog(
    document: vscode.TextDocument,
    current: ParsedYamlFile,
  ): Promise<LanguageCatalog> {
    const generation = this.workspaceIndex.index.generation;
    const currentIsLanguage = current.sections.some(
      (section) =>
        (CLIENT_LANGUAGE_SECTIONS as readonly string[]).includes(
          section.type,
        ) ||
        (SERVER_LANGUAGE_SECTIONS as readonly string[]).includes(section.type),
    );
    if (
      !currentIsLanguage &&
      this.languageCatalogPromise &&
      this.languageGeneration === generation
    ) {
      return this.languageCatalogPromise;
    }
    const packs = languagePacks(this.workspaceIndex);
    const parsedFiles = new Map(this.workspaceIndex.index.parsedFiles);
    parsedFiles.set(current.uri, current);
    const fallbackRoot = this.workspaceIndex.rootForDocument(document);
    const yamlFiles = [...parsedFiles.values()].flatMap((parsed) => {
      const pack = packForParsedFile(
        parsed.uri,
        packs,
        parsed.uri === current.uri ? fallbackRoot : undefined,
      );
      return pack ? [{ parsed, pack }] : [];
    });
    const promise = languageJsonFilesFromCatalog(
      this.workspaceIndex.index.resources,
    ).then((resourceJson) => buildLanguageCatalog(yamlFiles, { resourceJson }));
    if (!currentIsLanguage) {
      this.languageGeneration = generation;
      this.languageCatalogPromise = promise;
    }
    return promise;
  }
}

export function groupedDefinitions(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): ImageDefinition[][] {
  const grouped = new Map<string, ImageDefinition[]>();
  for (const image of workspaceIndex.definitionsInDocument(document)) {
    const key = `${image.source.idRange.start}:${image.source.idRange.end}`;
    const values = grouped.get(key) ?? [];
    values.push(image);
    grouped.set(key, values);
  }
  return [...grouped.values()];
}

export function groupedItemDefinitions(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): ItemDefinition[][] {
  const grouped = new Map<string, ItemDefinition[]>();
  for (const item of workspaceIndex.itemsInDocument(document)) {
    const key = `${item.source.idRange.start}:${item.source.idRange.end}`;
    const values = grouped.get(key) ?? [];
    values.push(item);
    grouped.set(key, values);
  }
  return [...grouped.values()];
}

export function groupedFurnitureDefinitions(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): FurnitureDefinition[][] {
  const grouped = new Map<string, FurnitureDefinition[]>();
  for (const furniture of workspaceIndex.furnitureInDocument(document)) {
    const key = `${furniture.source.idRange.start}:${furniture.source.idRange.end}`;
    const values = grouped.get(key) ?? [];
    values.push(furniture);
    grouped.set(key, values);
  }
  return [...grouped.values()];
}

export function groupedBlockPreviews(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): BlockStatePreview[][] {
  const grouped = new Map<string, BlockStatePreview[]>();
  for (const preview of workspaceIndex.blockPreviewsInDocument(document)) {
    const key = `${preview.anchorRange.start}:${preview.anchorRange.end}`;
    const values = grouped.get(key) ?? [];
    values.push(preview);
    grouped.set(key, values);
  }
  return [...grouped.values()];
}

export function editableMaterialRange(
  document: vscode.TextDocument,
  item: ItemDefinition,
): TextRange | undefined {
  for (const key of ["material", "overrides.material", "merges.material"]) {
    const range = item.source.fieldValueRanges.get(key);
    const keyRange = item.source.fieldKeyRanges.get(key);
    if (!range || !keyRange) continue;
    const insideEntry = (candidate: TextRange): boolean =>
      candidate.start >= item.source.entryRange.start &&
      candidate.end <= item.source.entryRange.end;
    if (!insideEntry(range) || !insideEntry(keyRange)) continue;
    if (
      parseLooseScalar(document.getText(rangeAt(document, keyRange)).trim()) ===
      "material"
    )
      return range;
  }
  if (item.source.kind === "factory") return undefined;
  for (const [key, range] of item.source.fieldValueRanges) {
    if (!key.startsWith("arguments.")) continue;
    const text = document.getText(rangeAt(document, range));
    if (text.includes("\n") || text.includes("\r")) continue;
    const value = parseLooseScalar(text.trim());
    if (
      typeof value === "string" &&
      makeIdentifier(value, "minecraft") === item.material
    )
      return range;
  }
  return undefined;
}

interface ExistingFileTarget {
  readonly range: vscode.Range;
  readonly target: vscode.Uri;
  readonly tooltip: string;
}

function sourceDocumentUri(
  workspaceIndex: CraftEngineWorkspaceIndex,
  target: ConfigurationTarget | CrossDomainTarget,
): vscode.Uri {
  const source = targetSource(target);
  const parsed = workspaceIndex.index.parsedFiles.get(source.uri);
  if (!parsed) return vscode.Uri.parse(source.uri);
  const lines = parsed.text
    .slice(0, Math.max(0, Math.min(source.range.start, parsed.text.length)))
    .split(/\r?\n/u);
  return vscode.Uri.parse(source.uri).with({
    fragment: `L${lines.length},${(lines.at(-1)?.length ?? 0) + 1}`,
  });
}

function generatedModelTargets(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): ReadonlyMap<
  string,
  Readonly<{ uri: string; range: TextRange; active: boolean; loadOrder: number }>
> {
  const root = workspaceIndex.rootForDocument(document);
  const targets = new Map<
    string,
    Readonly<{
      uri: string;
      range: TextRange;
      active: boolean;
      loadOrder: number;
    }>
  >();
  if (!root) return targets;

  for (const block of workspaceIndex.index.blocks) {
    if (
      canonicalPath(block.source.pack.resourcesRoot) !== canonicalPath(root)
    )
      continue;
    const generated = new Map<string, unknown>();
    collectBlockGeneratedModels(block.raw, generated);
    if (generated.size === 0) continue;

    for (const reference of blockResourceReferences([block])) {
      if (reference.kind !== "model") continue;
      const identifier = makeIdentifier(reference.identifier, "minecraft");
      if (!generated.has(identifier)) continue;
      const current = targets.get(identifier);
      const replace =
        !current ||
        (block.source.pack.active && !current.active) ||
        (block.source.pack.active === current.active &&
          block.source.pack.loadOrder > current.loadOrder);
      if (!replace)
        continue;
      targets.set(identifier, {
        uri: block.source.uri,
        range: reference.range,
        active: block.source.pack.active,
        loadOrder: block.source.pack.loadOrder,
      });
    }
  }
  return targets;
}

export function existingFileTargets(
  workspaceIndex: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
  vanillaAssets?: VanillaAssetStore,
): ExistingFileTarget[] {
  const targets: ExistingFileTarget[] = [];
  const seen = new Set<string>();
  const crossReferences =
    workspaceIndex.crossDomainReferencesInDocument(document);
  const templateReferences = templateInvocationReferences(document);
  const templateReferenceRanges = templateReferences.map(
    (reference) => reference.range,
  );
  const overlapsTemplateReference = (range: TextRange): boolean =>
    templateReferenceRanges.some(
      (templateRange) =>
        range.start < templateRange.end && templateRange.start < range.end,
    );
  const reservedReferenceRanges = new Set(
    crossReferences.map(
      (reference) => `${reference.range.start}:${reference.range.end}`,
    ),
  );
  const generatedModels = generatedModelTargets(workspaceIndex, document);
  for (const image of workspaceIndex.definitionsInDocument(document)) {
    if (image.spec.kind !== "bitmap") continue;
    const valueRange = image.source.fieldValueRanges.get("file");
    const texture =
      image.spec.textureCandidates.find((candidate) => candidate.effective) ??
      image.spec.textureCandidates[0];
    if (!valueRange || !texture) continue;
    if (overlapsTemplateReference(valueRange)) continue;
    const key = `${valueRange.start}:${valueRange.end}:${texture.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, valueRange),
      target: vscode.Uri.file(texture.path),
      tooltip: Messages.src.providers.completion.provider.text0130,
    });
  }
  for (const reference of equipmentTextureReferences(
    workspaceIndex,
    document,
  )) {
    if (overlapsTemplateReference(reference.range)) continue;
    const candidates = workspaceIndex.resourceFiles(
      document,
      reference.identifier,
      "texture",
    );
    const resource =
      candidates.find((candidate) => candidate.effective) ?? candidates[0];
    if (!resource) continue;
    const key = `${reference.range.start}:${reference.range.end}:${resource.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: vscode.Uri.file(resource.path),
      tooltip: Messages.src.providers.completion.provider.text0131(
        reference.identifier,
      ),
    });
  }
  for (const reference of configurationResourceReferences(
    workspaceIndex.itemsInDocument(document),
    workspaceIndex.blocksInDocument(document),
    workspaceIndex.furnitureInDocument(document),
    workspaceIndex.lootTablesInDocument(document),
  )) {
    if (
      reservedReferenceRanges.has(
        `${reference.range.start}:${reference.range.end}`,
      ) ||
      overlapsTemplateReference(reference.range)
    )
      continue;
    const candidates = workspaceIndex.resourceFiles(
      document,
      reference.identifier,
      reference.kind,
    );
    const resource =
      candidates.find((candidate) => candidate.effective) ?? candidates[0];
    if (!resource && reference.kind === "model") {
      const generated = generatedModels.get(
        makeIdentifier(reference.identifier, "minecraft"),
      );
      if (
        generated &&
        (generated.uri !== document.uri.toString() ||
          generated.range.start !== reference.range.start ||
          generated.range.end !== reference.range.end)
      ) {
        const parsed = workspaceIndex.index.parsedFiles.get(generated.uri);
        const lines = parsed?.text
          .slice(0, generated.range.start)
          .split(/\r?\n/u);
        const target = vscode.Uri.parse(generated.uri).with({
          fragment: `L${lines?.length ?? 1},${(lines?.at(-1)?.length ?? 0) + 1}`,
        });
        const key = `${reference.range.start}:${reference.range.end}:${target.toString()}`;
        if (!seen.has(key)) {
          seen.add(key);
          targets.push({
            range: rangeAt(document, reference.range),
            target,
            tooltip:
              Messages.src.providers.completion.provider.text0152,
          });
        }
      }
      continue;
    }
    if (!resource) continue;
    const key = `${reference.range.start}:${reference.range.end}:${resource.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: vscode.Uri.file(resource.path),
      tooltip:
        reference.kind === "texture"
          ? Messages.src.providers.completion.provider.text0132
          : Messages.src.providers.completion.provider.text0133,
    });
  }
  for (const reference of configurationIdReferences(
    workspaceIndex.itemsInDocument(document),
    workspaceIndex.blocksInDocument(document),
    workspaceIndex.furnitureInDocument(document),
    workspaceIndex.lootTablesInDocument(document),
  )) {
    if (
      reservedReferenceRanges.has(
        `${reference.range.start}:${reference.range.end}`,
      ) ||
      overlapsTemplateReference(reference.range)
    )
      continue;
    const candidates = configurationTargets(
      workspaceIndex,
      document,
      reference,
    );
    const target =
      candidates.find((candidate) => targetSource(candidate).active) ??
      candidates[0];
    if (!target) continue;
    const source = targetSource(target);
    const key = `${reference.range.start}:${reference.range.end}:${source.uri}:${source.range.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind =
      reference.kind === "item"
        ? Messages.src.providers.completion.provider.text0134
        : reference.kind === "block"
          ? Messages.src.providers.completion.provider.text0135
          : reference.kind === "furniture"
            ? Messages.src.providers.completion.provider.text0136
            : reference.kind === "loot"
              ? Messages.src.providers.completion.provider.text0137
              : reference.kind === "equipment"
                ? Messages.src.providers.completion.provider.text0138
                : reference.kind === "jukebox-song"
                  ? Messages.src.providers.completion.provider.text0139
                  : Messages.src.providers.completion.provider.text0140;
    targets.push({
      range: rangeAt(document, reference.range),
      target: sourceDocumentUri(workspaceIndex, target),
      tooltip: Messages.src.providers.completion.provider.text0141(
        kind,
        reference.identifier,
      ),
    });
  }
  for (const reference of templateReferences) {
    const candidates = configurationTargets(
      workspaceIndex,
      document,
      reference,
    );
    const target =
      candidates.find((candidate) => targetSource(candidate).active) ??
      candidates[0];
    if (!target) continue;
    const source = targetSource(target);
    const key = `${reference.range.start}:${reference.range.end}:${source.uri}:${source.range.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: sourceDocumentUri(workspaceIndex, target),
      tooltip: Messages.src.providers.completion.provider.text0142(
        reference.identifier,
      ),
    });
  }
  for (const reference of crossReferences) {
    if (overlapsTemplateReference(reference.range)) continue;
    const candidates = crossDomainTargets(workspaceIndex, document, reference);
    const target =
      candidates.find((candidate) => candidate.source.pack.active) ??
      candidates[0];
    if (!target) continue;
    const key = `${reference.range.start}:${reference.range.end}:${target.source.uri}:${target.source.idRange.start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: sourceDocumentUri(workspaceIndex, target),
      tooltip: Messages.src.providers.completion.provider.text0143(
        crossDomainKindLabel(reference.kind),
        reference.identifier,
      ),
    });
  }
  for (const event of workspaceIndex.soundEventsInDocument(document))
    for (const entry of event.entries) {
      if (entry.type !== "file") continue;
      if (overlapsTemplateReference(entry.nameRange)) continue;
      const candidates = workspaceIndex.resourceFiles(
        document,
        entry.name,
        "sound-file",
      );
      const resource =
        candidates.find((candidate) => candidate.effective) ?? candidates[0];
      const target = resource?.path ?? vanillaAssets?.cachedSound(entry.name);
      if (!target) continue;
      const key = `${entry.nameRange.start}:${entry.nameRange.end}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        range: rangeAt(document, entry.nameRange),
        target: vscode.Uri.file(target),
        tooltip: Messages.src.providers.completion.provider.text0144,
      });
    }
  return targets;
}
