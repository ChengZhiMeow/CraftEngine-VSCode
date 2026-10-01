import type * as vscode from "vscode";

import { fieldsForDiscriminator } from "../../config/item/schema.js";
import { tooltipStyleCompletionCandidates } from "../../resources/tooltipStyles.js";
import type {
  SchemaField,
  SchemaValueProvider,
} from "../../config/schema/types.js";
import {
  VANILLA_BLOCK_TAG_DETAILS,
  VANILLA_BLOCK_TAGS,
} from "../../minecraft/block/tags.js";
import { isRecord } from "../../util/records.js";
import type { CraftEngineWorkspaceIndex } from "../../workspace/index.js";
import { Messages } from "../../messages.js";
import type { CompletionDescriptionCatalog } from "./descriptions.js";

export function addSchemaValues(
  workspaceIndex: CraftEngineWorkspaceIndex,
  descriptions: CompletionDescriptionCatalog | undefined,
  values: Map<string, string>,
  field: SchemaField,
  document: vscode.TextDocument,
): void {
  const provider = field.valueProvider;
  const vanilla = workspaceIndex.vanilla;
  if (provider)
    switch (provider) {
      case "material":
        for (const item of vanilla?.items ?? [])
          values.set(
            item.id,
            Messages.src.providers.completion.valueResolver.text0001(item.name),
          );
        break;
      case "item-id":
        for (const item of workspaceIndex.forDocument(document)?.items(true) ??
          []) {
          values.set(
            item.id,
            Messages.src.providers.completion.valueResolver.text0002(
              item.source.pack.name,
            ),
          );
        }
        for (const item of vanilla?.items ?? [])
          values.set(
            item.id,
            Messages.src.providers.completion.valueResolver.text0003(item.name),
          );
        break;
      case "image-id": {
        const images = workspaceIndex.forDocument(document)?.images(true) ?? [];
        const valueCounts = new Map<string, number>();
        for (const image of images)
          valueCounts.set(image.value, (valueCounts.get(image.value) ?? 0) + 1);
        for (const image of images) {
          values.set(
            image.id,
            Messages.src.providers.completion.valueResolver.text0004(
              image.source.pack.name,
            ),
          );
          if (field.registry !== "craftengine:image_ref") continue;
          values.set(
            image.value,
            (valueCounts.get(image.value) ?? 0) > 1
              ? Messages.src.providers.completion.valueResolver.text0005(
                  image.value,
                  image.id,
                )
              : Messages.src.providers.completion.valueResolver.text0006(
                  image.id,
                ),
          );
        }
        break;
      }
      case "category-id":
      case "painting-id":
      case "recipe-id":
      case "configured-feature-id":
      case "placed-feature-id": {
        let kind:
          | "category"
          | "painting"
          | "recipe"
          | "configured-feature"
          | "placed-feature";
        let label: string;
        switch (provider) {
          case "category-id":
            kind = "category";
            label = Messages.src.providers.completion.valueResolver.text0007;
            break;
          case "painting-id":
            kind = "painting";
            label = Messages.src.providers.completion.valueResolver.text0008;
            break;
          case "recipe-id":
            kind = "recipe";
            label = Messages.src.providers.completion.valueResolver.text0009;
            break;
          case "configured-feature-id":
            kind = "configured-feature";
            label = Messages.src.providers.completion.valueResolver.text0045;
            break;
          case "placed-feature-id":
            kind = "placed-feature";
            label = Messages.src.providers.completion.valueResolver.text0046;
            break;
        }
        for (const entry of workspaceIndex
          .forDocument(document)
          ?.complete(kind) ?? []) {
          values.set(
            entry.id,
            Messages.src.providers.completion.valueResolver.text0047(
              entry.definition.source.pack.name,
              label,
            ),
          );
          if (entry.definition.namespace === "minecraft" && entry.shortId) {
            values.set(
              entry.shortId,
              Messages.src.providers.completion.valueResolver.text0010(
                entry.id,
              ),
            );
          }
        }
        if (field.registry)
          for (const id of vanilla?.registries[field.registry] ?? []) {
            if (!values.has(id))
              values.set(
                id,
                Messages.src.providers.completion.valueResolver.text0048(
                  field.detail,
                ),
              );
          }
        break;
      }
      case "block-id":
      case "furniture-id":
        for (const value of workspaceIndex.opaqueIds(
          provider === "block-id" ? "block" : "furniture",
          document,
        )) {
          values.set(
            value.id,
            Messages.src.providers.completion.valueResolver.text0011(
              value.source.pack.name,
              provider === "block-id"
                ? Messages.src.providers.completion.valueResolver.text0041
                : Messages.src.providers.completion.valueResolver.text0042,
            ),
          );
        }
        if (
          provider !== "block-id" ||
          (field.registry !== "minecraft:block" &&
            field.registry !== "minecraft:block_or_tag")
        )
          break;
        for (const id of vanilla?.blocks ?? []) {
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0012(
              vanilla?.itemsById.get(id)?.name ?? id,
            ),
          );
        }
        if (field.registry === "minecraft:block_or_tag")
          for (const id of VANILLA_BLOCK_TAGS) {
            values.set(
              `#${id}`,
              VANILLA_BLOCK_TAG_DETAILS[id] ??
                Messages.src.providers.completion.valueResolver.text0013,
            );
          }
        break;
      case "block-state":
        if (field.registry === "craftengine:block_state") {
          for (const entry of workspaceIndex
            .forDocument(document)
            ?.complete("block") ?? []) {
            values.set(
              entry.id,
              Messages.src.providers.completion.valueResolver.text0014(
                entry.definition.source.pack.name,
              ),
            );
            if (entry.definition.namespace === "minecraft" && entry.shortId) {
              values.set(
                entry.shortId,
                Messages.src.providers.completion.valueResolver.text0015(
                  entry.id,
                ),
              );
            }
          }
        }
        for (const id of vanilla?.blocks ?? []) {
          const name =
            vanilla?.itemsById.get(id)?.name ??
            id.slice("minecraft:".length).replaceAll("_", " ");
          const count = vanilla?.blockStates.stateCount(id);
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0016(
              name,
              count === undefined
                ? ""
                : Messages.src.providers.completion.valueResolver.text0043(
                    count,
                  ),
            ),
          );
          const defaultState = vanilla?.blockStates.defaultState(id);
          if (defaultState && defaultState !== id)
            values.set(
              defaultState,
              Messages.src.providers.completion.valueResolver.text0017(name),
            );
        }
        break;
      case "block-tag":
        for (const id of VANILLA_BLOCK_TAGS) {
          values.set(
            id,
            VANILLA_BLOCK_TAG_DETAILS[id] ??
              Messages.src.providers.completion.valueResolver.text0018,
          );
        }
        break;
      case "equipment-id":
        for (const equipment of workspaceIndex
          .forDocument(document)
          ?.equipments(true) ?? []) {
          values.set(
            equipment.id,
            Messages.src.providers.completion.valueResolver.text0019(
              equipment.source.pack.name,
            ),
          );
        }
        break;
      case "item-model":
        for (const id of workspaceIndex.resourceIdentifiers(
          "item-model",
          document,
        ))
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0020,
          );
        for (const id of vanilla?.itemModels ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0021,
          );
        break;
      case "model":
        for (const id of workspaceIndex.resourceIdentifiers("model", document))
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0022,
          );
        for (const id of vanilla?.models ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0023,
          );
        break;
      case "texture":
        for (const id of workspaceIndex.textureIdentifiers(document))
          values.set(
            id.replace(/\.png$/iu, ""),
            Messages.src.providers.completion.valueResolver.text0024,
          );
        for (const id of vanilla?.textures ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0025,
          );
        break;
      case "tooltip-style": {
        const root = workspaceIndex.rootForDocument(document);
        if (root)
          for (const candidate of tooltipStyleCompletionCandidates(
            workspaceIndex.index.resources,
            root,
            vanilla?.textures,
          )) {
            values.set(candidate.id, candidate.detail);
          }
        break;
      }
      case "jukebox-song":
        for (const song of workspaceIndex.jukeboxSongs(document)) {
          if (song.source.pack.active)
            values.set(
              song.id,
              Messages.src.providers.completion.valueResolver.text0026(
                song.source.pack.name,
              ),
            );
        }
        for (const id of vanilla?.registries["minecraft:jukebox_song"] ?? []) {
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0027,
          );
        }
        break;
      case "loot-id":
        for (const loot of workspaceIndex.lootTables(document)) {
          if (loot.source.pack.active)
            values.set(
              loot.id,
              Messages.src.providers.completion.valueResolver.text0028(
                loot.source.pack.name,
              ),
            );
        }
        break;
      case "component":
        for (const id of vanilla?.components ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0049,
          );
        break;
      case "condition-type":
      case "function-type": {
        const discriminator = fieldsForDiscriminator(
          provider === "condition-type" ? "condition" : "function",
          undefined,
        ).find((candidate) => candidate.label === "type");
        for (const value of discriminator?.values ?? []) {
          values.set(
            value,
            discriminator?.valueDetails?.[value] ??
              discriminator?.detail ??
              field.detail,
          );
        }
        break;
      }
      case "attribute":
        for (const id of vanilla?.attributes ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0029,
          );
        break;
      case "custom-attribute":
      case "attribute-operation":
      case "equipment-set": {
        const kind =
          provider === "custom-attribute"
            ? "attribute"
            : provider === "attribute-operation"
              ? "attribute-operation"
              : "equipment-set";
        for (const entry of workspaceIndex
          .forDocument(document)
          ?.complete(kind) ?? []) {
          values.set(
            entry.id,
            `${entry.definition.source.pack.name} — ${field.detail}`,
          );
        }
        if (provider === "attribute-operation") {
          values.set("minecraft:add_value", "原版固定值加法运算");
          values.set(
            "minecraft:add_multiplied_base",
            "按阶段基础值相乘后相加",
          );
          values.set(
            "minecraft:add_multiplied_total",
            "按当前总值连续相乘",
          );
        }
        break;
      }
      case "effect":
        for (const id of vanilla?.effects ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0030,
          );
        break;
      case "sound":
        for (const event of workspaceIndex.soundEvents(document))
          if (event.source.pack.active) {
            values.set(
              event.id,
              Messages.src.providers.completion.valueResolver.text0031(
                event.subtitleText ?? event.subtitle ?? event.source.pack.name,
              ),
            );
          }
        for (const id of vanilla?.sounds ?? [])
          if (!values.has(id)) {
            values.set(
              id,
              Messages.src.providers.completion.valueResolver.text0032(
                workspaceIndex.vanillaSounds?.describe(id) ??
                  Messages.src.providers.completion.valueResolver.text0044,
              ),
            );
          }
        break;
      case "sound-file":
        for (const id of workspaceIndex.resourceIdentifiers(
          "sound-file",
          document,
        )) {
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0033,
          );
        }
        break;
      case "enchantment":
        for (const id of vanilla?.enchantments ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0034,
          );
        break;
      case "particle":
        for (const id of vanilla?.particles ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0035,
          );
        break;
      case "entity-type":
        for (const entry of workspaceIndex
          .forDocument(document)
          ?.complete("entity") ?? [])
          values.set(
            entry.id,
            `${entry.definition.source.pack.name} — 自定义实体`,
          );
        for (const id of vanilla?.entityTypes ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0036,
          );
        break;
      case "potion":
        for (const id of vanilla?.potions ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0037,
          );
        break;
      case "damage-type":
        for (const id of vanilla?.damageTypes ?? [])
          values.set(
            id,
            Messages.src.providers.completion.valueResolver.text0038,
          );
        break;
      case "registry":
        if (field.registry)
          for (const id of vanilla?.registries[field.registry] ?? []) {
            values.set(
              id,
              Messages.src.providers.completion.valueResolver.text0048(
                field.detail,
              ),
            );
          }
        break;
      case "template":
        for (const template of workspaceIndex.templatesForDocument(document)) {
          values.set(
            template.id,
            Messages.src.providers.completion.valueResolver.text0039(
              template.pack.name,
            ),
          );
        }
        break;
      case "boolean":
      case "number":
      case "number-provider":
      case "item-model-type":
        break;
      default: {
        const exhaustive: never = provider;
        return exhaustive;
      }
    }
  if (field.label.startsWith("minecraft:")) {
    for (const itemDefaults of Object.values(
      vanilla?.defaultComponents ?? {},
    )) {
      if (!isRecord(itemDefaults) || !isRecord(itemDefaults.components))
        continue;
      const value = itemDefaults.components[field.label];
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        values.set(
          String(value),
          Messages.src.providers.completion.valueResolver.text0040(
            field.detail,
          ),
        );
      }
    }
  }
  if (!descriptions || !provider || descriptionIsHandledLocally(provider))
    return;
  for (const identifier of values.keys()) {
    if (field.valueDetails?.[identifier] !== undefined) continue;
    values.set(
      identifier,
      descriptions.describeSchemaValue(field, identifier).detail,
    );
  }
}

function descriptionIsHandledLocally(provider: SchemaValueProvider): boolean {
  switch (provider) {
    case "material":
    case "template":
    case "block-tag":
    case "sound":
    case "sound-file":
      return true;
    default:
      return false;
  }
}
