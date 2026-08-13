import { promises as fs } from "node:fs";

import type { ItemDefinition } from "../../config/item/model.js";
import type { EquipmentDefinition } from "../../config/equipment/model.js";
import { samePath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import { pngDataUrl } from "../shared/assets.js";

export interface PreviewEquipmentLayer {
  readonly texture: string;
  readonly dyeable?: Readonly<{ color_when_undyed?: number }>;
  readonly use_player_texture?: boolean;
}

export interface PreviewEquipmentAsset {
  readonly layers: Readonly<Record<string, readonly PreviewEquipmentLayer[]>>;
}

export interface PreviewEquipmentSelection {
  readonly assetId: string;
  readonly slot: "head" | "chest" | "legs" | "feet" | "mainhand" | "offhand";
  readonly dyeColor?: number;
}

export interface EquipmentPreviewData {
  readonly equipmentAssets: Readonly<Record<string, PreviewEquipmentAsset>>;
  readonly equipmentTextures: Readonly<Record<string, string>>;
  readonly equipmentSelection?: PreviewEquipmentSelection;
}

function slot(value: unknown): PreviewEquipmentSelection["slot"] | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.toLowerCase().replaceAll("-", "_")) {
    case "head":
      return "head";
    case "chest":
      return "chest";
    case "legs":
      return "legs";
    case "feet":
      return "feet";
    case "mainhand":
    case "main_hand":
      return "mainhand";
    case "offhand":
    case "off_hand":
      return "offhand";
    default:
      return undefined;
  }
}

export async function buildEquipmentPreviewData(
  item: ItemDefinition,
  components: Readonly<Record<string, unknown>>,
  equipments: readonly EquipmentDefinition[],
  vanillaTexture: (id: string) => Promise<string | undefined>,
): Promise<EquipmentPreviewData> {
  const visible = equipments.filter(
    (equipment) =>
      equipment.source.pack.active &&
      samePath(
        equipment.source.pack.resourcesRoot,
        item.source.pack.resourcesRoot,
      ) &&
      equipment.generatedJson !== undefined,
  );
  const selected = new Map<string, EquipmentDefinition>();
  for (const equipment of visible)
    if (!selected.has(equipment.id)) selected.set(equipment.id, equipment);

  const equipmentAssets: Record<string, PreviewEquipmentAsset> = {};
  const equipmentTextures: Record<string, string> = {};
  for (const equipment of selected.values()) {
    if (!equipment.generatedJson) continue;
    equipmentAssets[equipment.id] = equipment.generatedJson;
    for (const [layerType, layers] of Object.entries(equipment.layers)) {
      for (const layer of layers) {
        const key = `${layerType}|${layer.texture}`;
        if (equipmentTextures[key]) continue;
        const candidate = layer.candidates.find((entry) => entry.effective);
        try {
          if (candidate) {
            equipmentTextures[key] = pngDataUrl(
              await fs.readFile(candidate.path),
            );
            continue;
          }
          const fallback = await vanillaTexture(layer.resourceTexture);
          if (fallback) equipmentTextures[key] = fallback;
        } catch {
          continue;
        }
      }
    }
  }
  const equippableValue = components["minecraft:equippable"];
  const equippable = isRecord(equippableValue) ? equippableValue : undefined;
  const assetId =
    item.equipmentAssetId ??
    (typeof equippable?.asset_id === "string"
      ? equippable.asset_id
      : undefined);
  const dyedColor = components["minecraft:dyed_color"];
  const nestedColor = isRecord(dyedColor)
    ? (dyedColor.rgb ?? dyedColor.color)
    : undefined;
  const dyeColor =
    typeof dyedColor === "number" && Number.isInteger(dyedColor)
      ? dyedColor
      : typeof nestedColor === "number" && Number.isInteger(nestedColor)
        ? nestedColor
        : undefined;
  const equipmentSelection: PreviewEquipmentSelection | undefined =
    assetId === undefined
      ? undefined
      : {
          assetId,
          slot:
            slot(item.equipmentSlot) ?? slot(equippable?.slot) ?? "mainhand",
          ...(dyeColor === undefined ? {} : { dyeColor }),
        };
  return {
    equipmentAssets,
    equipmentTextures,
    ...(equipmentSelection === undefined ? {} : { equipmentSelection }),
  };
}
