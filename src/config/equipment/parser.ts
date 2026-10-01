import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import { evaluateExpression } from "../expression/evaluator.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import type {
  EquipmentDefinition,
  EquipmentLayer,
  GeneratedEquipmentAsset,
} from "./model.js";
import type { ItemDefinition } from "../item/model.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { resourceCandidates } from "../../resources/catalog.js";
import type { ResourceFileCatalog } from "../../resources/model.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

import { Messages } from "../../messages.js";
export const EQUIPMENT_LAYER_TYPES = [
  "wolf_body",
  "horse_body",
  "llama_body",
  "humanoid",
  "humanoid_leggings",
  "wings",
  "pig_saddle",
  "strider_saddle",
  "camel_saddle",
  "camel_husk_saddle",
  "horse_saddle",
  "donkey_saddle",
  "mule_saddle",
  "nautilus_body",
  "skeleton_horse_saddle",
  "zombie_horse_saddle",
  "happy_ghast_body",
  "humanoid_baby",
] as const;

export type EquipmentLayerType = (typeof EQUIPMENT_LAYER_TYPES)[number];

export const EQUIPMENT_TYPES = ["component", "trim"] as const;

export const TRIM_EQUIPMENT_LAYER_TYPES = [
  "humanoid",
  "humanoid_leggings",
] as const;
export type TrimEquipmentLayerType =
  (typeof TRIM_EQUIPMENT_LAYER_TYPES)[number];

export const TRIM_EQUIPMENT_LAYER_ALIASES: Readonly<
  Record<TrimEquipmentLayerType, readonly string[]>
> = {
  humanoid: ["layer0"],
  humanoid_leggings: ["humanoid-leggings", "layer1"],
};

export interface EquipmentBuildResult {
  readonly equipments: readonly EquipmentDefinition[];
  readonly issues: readonly CoreIssue[];
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  field?: string,
  key = false,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range:
      field === undefined
        ? source.idRange
        : ((key
            ? source.fieldKeyRanges.get(field)
            : source.fieldValueRanges.get(field)) ??
          source.fieldKeyRanges.get(field) ??
          source.idRange),
  };
}

function integer(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value !== "string") return undefined;
  const literal = value.replaceAll("_", "");
  if (/^[-+]?\d+$/u.test(literal)) return Number(literal);
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" && Number.isFinite(evaluated)
      ? Math.trunc(evaluated)
      : undefined;
  } catch {
    return undefined;
  }
}

function identifier(value: unknown): string | undefined {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean" &&
    typeof value !== "bigint"
  )
    return undefined;
  const normalized = value.toString().toLowerCase();
  const id = makeIdentifier(normalized, "minecraft");
  return isValidIdentifier(id) ? id : undefined;
}

function selectedField(
  raw: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): [key: string, value: unknown] | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== null && value !== undefined) return [key, value];
  }
  return undefined;
}

function textureIdentifiers(
  layer: EquipmentLayerType,
  input: string,
): { texture: string; resourceTexture: string } {
  const [namespace, rawValue] = splitIdentifier(input, "minecraft");
  const prefix = `entity/equipment/${layer}/`;
  const value = rawValue.startsWith(prefix)
    ? rawValue.slice(prefix.length)
    : rawValue;
  return {
    texture: `${namespace}:${value}`,
    resourceTexture: `${namespace}:${prefix}${value}`,
  };
}

function layerEntry(
  value: unknown,
  layerType: EquipmentLayerType,
  source: ConfigurationSource,
  resources: ResourceFileCatalog,
  pathName: string,
  issues: CoreIssue[],
): EquipmentLayer | undefined {
  if (!isRecord(value)) {
    const texture = identifier(value);
    if (!texture) {
      issues.push(
        issue(
          source,
          "invalid-equipment-layer-texture",
          Messages.src.config.equipment.parser.text0001(pathName),
          "error",
          pathName,
        ),
      );
      return undefined;
    }
    const ids = textureIdentifiers(layerType, texture);
    return {
      ...ids,
      candidates: resourceCandidates(
        resources,
        source.pack.resourcesRoot,
        "texture",
        ids.resourceTexture,
      ),
    };
  }

  for (const key of Object.keys(value)) {
    switch (key) {
      case "texture":
      case "dyeable":
      case "use_player_texture":
      case "use-player-texture":
        continue;
      default:
        issues.push(
          issue(
            source,
            "unknown-equipment-layer-field",
            Messages.src.config.equipment.parser.text0002(pathName, key),
            "warning",
            `${pathName}.${key}`,
            true,
          ),
        );
    }
  }

  const rawTexture = value.texture;
  if (rawTexture === null || rawTexture === undefined) {
    issues.push(
      issue(
        source,
        "missing-equipment-layer-texture",
        Messages.src.config.equipment.parser.text0003(pathName),
        "error",
        pathName,
      ),
    );
  }
  const texture = identifier(rawTexture);
  if (rawTexture !== null && rawTexture !== undefined && !texture) {
    issues.push(
      issue(
        source,
        "invalid-equipment-layer-texture",
        Messages.src.config.equipment.parser.text0004(pathName),
        "error",
        `${pathName}.texture`,
      ),
    );
  }

  let color: number | undefined;
  if (value.dyeable !== null && value.dyeable !== undefined) {
    if (!isRecord(value.dyeable)) {
      issues.push(
        issue(
          source,
          "invalid-equipment-layer-dyeable",
          Messages.src.config.equipment.parser.text0005(pathName),
          "error",
          `${pathName}.dyeable`,
        ),
      );
    } else {
      for (const key of Object.keys(value.dyeable)) {
        switch (key) {
          case "color_when_undyed":
          case "color-when-undyed":
            continue;
          default:
            issues.push(
              issue(
                source,
                "unknown-equipment-dyeable-field",
                Messages.src.config.equipment.parser.text0006(pathName, key),
                "warning",
                `${pathName}.dyeable.${key}`,
                true,
              ),
            );
        }
      }
      const selectedColor = selectedField(value.dyeable, [
        "color_when_undyed",
        "color-when-undyed",
      ]);
      if (selectedColor) {
        color = integer(selectedColor[1]);
        if (color === undefined) {
          issues.push(
            issue(
              source,
              "invalid-equipment-dyeable-color",
              Messages.src.config.equipment.parser.text0007(
                pathName,
                selectedColor[0],
              ),
              "error",
              `${pathName}.dyeable.${selectedColor[0]}`,
            ),
          );
        }
      }
    }
  }

  let usePlayerTexture: boolean | undefined;
  const selectedUsePlayerTexture = selectedField(value, [
    "use_player_texture",
    "use-player-texture",
  ]);
  if (selectedUsePlayerTexture) {
    try {
      usePlayerTexture = craftEngineBoolean(selectedUsePlayerTexture[1]);
    } catch {
      issues.push(
        issue(
          source,
          "invalid-equipment-use-player-texture",
          Messages.src.config.equipment.parser.text0008(
            pathName,
            selectedUsePlayerTexture[0],
          ),
          "error",
          `${pathName}.${selectedUsePlayerTexture[0]}`,
        ),
      );
    }
  }

  if (!texture) return undefined;
  const ids = textureIdentifiers(layerType, texture);
  return {
    ...ids,
    ...(color === undefined ? {} : { dyeable: { color_when_undyed: color } }),
    ...(usePlayerTexture === true ? { use_player_texture: true } : {}),
    candidates: resourceCandidates(
      resources,
      source.pack.resourcesRoot,
      "texture",
      ids.resourceTexture,
    ),
  };
}

function componentLayerEntries(
  rawValue: unknown,
  layerType: EquipmentLayerType,
  source: ConfigurationSource,
  resources: ResourceFileCatalog,
  pathName: string,
  issues: CoreIssue[],
): readonly EquipmentLayer[] {
  if (rawValue === null || rawValue === undefined) {
    issues.push(
      issue(
        source,
        "missing-equipment-layer-value",
        Messages.src.config.equipment.parser.text0009(pathName),
        "error",
        pathName,
      ),
    );
    return [];
  }
  if (!isUnknownArray(rawValue)) {
    const layer = layerEntry(
      rawValue,
      layerType,
      source,
      resources,
      pathName,
      issues,
    );
    return layer ? [layer] : [];
  }
  const layers: EquipmentLayer[] = [];
  for (const [index, entry] of rawValue.entries()) {
    const entryPath = `${pathName}.${index}`;
  // CE 要求每一项都是一组配置, 单个值不能用
    if (!isRecord(entry)) {
      issues.push(
        issue(
          source,
          "invalid-equipment-layer-entry",
          Messages.src.config.equipment.parser.text0010(entryPath),
          "error",
          entryPath,
        ),
      );
      continue;
    }
    const layer = layerEntry(
      entry,
      layerType,
      source,
      resources,
      entryPath,
      issues,
    );
    if (layer) layers.push(layer);
  }
  return layers;
}

function layersFor(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  resources: ResourceFileCatalog,
  issues: CoreIssue[],
): Readonly<Record<string, readonly EquipmentLayer[]>> {
  const result: Record<string, readonly EquipmentLayer[]> = {};
  // CE 只处理连字符和后缀, 不会改变大小写
  for (const [pathName, rawValue] of Object.entries(raw)) {
    const hash = pathName.indexOf("#");
    const normalizedLayerType = pathName
      .slice(0, hash < 0 ? pathName.length : hash)
      .replaceAll("-", "_");
    if (
      !(EQUIPMENT_LAYER_TYPES as readonly string[]).includes(
        normalizedLayerType,
      )
    )
      continue;
    const layerType = normalizedLayerType as EquipmentLayerType;
    const layers = componentLayerEntries(
      rawValue,
      layerType,
      source,
      resources,
      pathName,
      issues,
    );
    if (layers.length > 0) result[layerType] = layers;
    else delete result[layerType];
  }
  return result;
}

function trimLayerEntry(
  value: unknown,
  source: ConfigurationSource,
  resources: ResourceFileCatalog,
  pathName: string,
  issues: CoreIssue[],
): EquipmentLayer | undefined {
  // trim 只能写纹理 ID, component 还可以写其他内容
  if (isRecord(value) || isUnknownArray(value)) {
    issues.push(
      issue(
        source,
        "invalid-trim-equipment-layer",
        Messages.src.config.equipment.parser.text0011(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  const texture = identifier(value);
  if (!texture) {
    issues.push(
      issue(
        source,
        "invalid-trim-equipment-layer",
        Messages.src.config.equipment.parser.text0012(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  return {
    texture,
    resourceTexture: texture,
    candidates: resourceCandidates(
      resources,
      source.pack.resourcesRoot,
      "texture",
      texture,
    ),
  };
}

function trimLayersFor(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  resources: ResourceFileCatalog,
  issues: CoreIssue[],
): Readonly<Record<string, readonly EquipmentLayer[]>> {
  const result: Partial<
    Record<TrimEquipmentLayerType, readonly EquipmentLayer[]>
  > = {};
  for (const layerType of TRIM_EQUIPMENT_LAYER_TYPES) {
    const selected = selectedField(raw, [
      layerType,
      ...TRIM_EQUIPMENT_LAYER_ALIASES[layerType],
    ]);
    if (!selected) continue;
    const layer = trimLayerEntry(
      selected[1],
      source,
      resources,
      selected[0],
      issues,
    );
    if (layer) result[layerType] = [layer];
  }
  return result;
}

function generatedJson(
  layers: Readonly<Record<string, readonly EquipmentLayer[]>>,
): GeneratedEquipmentAsset {
  return {
    layers: Object.fromEntries(
      Object.entries(layers).map(([type, entries]) => [
        type,
        entries.map((entry) => ({
          texture: entry.texture,
          ...(entry.dyeable === undefined ? {} : { dyeable: entry.dyeable }),
          ...(entry.use_player_texture === undefined
            ? {}
            : { use_player_texture: entry.use_player_texture }),
        })),
      ]),
    ),
  };
}

function parseEquipment(
  candidate: ConfigurationCandidateInput,
  resources: ResourceFileCatalog,
  issues: CoreIssue[],
): EquipmentDefinition | undefined {
  if (candidate.kind !== "equipment" || !isRecord(candidate.value))
    return undefined;
  const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);
  const [namespace, value] = splitIdentifier(
    id,
    candidate.source.pack.namespace,
  );
  const rawType =
    typeof candidate.value.type === "string" ? candidate.value.type : "";
  if (!rawType) {
    issues.push({
      code: "missing-equipment-type",
      message: Messages.src.config.equipment.parser.text0014(id),
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldKeyRanges.get("type") ?? candidate.source.idRange,
    });
  }
  const normalizedType = localRegistryDiscriminator(rawType);
  if (
    rawType &&
    (!normalizedType ||
      !(EQUIPMENT_TYPES as readonly string[]).includes(normalizedType)) &&
    !isValidRegistryDiscriminator(rawType)
  ) {
    issues.push({
      code: "unknown-equipment-type",
      message: Messages.src.config.equipment.parser.text0015(id, rawType),
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldValueRanges.get("type") ??
        candidate.source.idRange,
    });
  }
  const layers =
    normalizedType === "component"
      ? layersFor(candidate.value, candidate.source, resources, issues)
      : normalizedType === "trim"
        ? trimLayersFor(candidate.value, candidate.source, resources, issues)
        : {};
  return {
    kind: "equipment",
    id,
    namespace,
    value,
    source: candidate.source,
    raw: candidate.value,
    layers,
    ...(normalizedType === "component"
      ? { generatedJson: generatedJson(layers) }
      : {}),
  };
}

function conflictIssues(
  equipments: readonly EquipmentDefinition[],
): CoreIssue[] {
  const result: CoreIssue[] = [];
  for (const values of groupBy(
    equipments.filter((equipment) => equipment.source.pack.active),
    (equipment) =>
      `${canonicalPath(equipment.source.pack.resourcesRoot)}\u0000${equipment.id}`,
  ).values()) {
    if (values.length < 2) continue;
    for (const equipment of values) {
      result.push({
        code: "duplicate-equipment-id",
        message: Messages.src.config.equipment.parser.text0016(equipment.id),
        severity: "error",
        uri: equipment.source.uri,
        range: equipment.source.idRange,
        related: values
          .filter((other) => other !== equipment)
          .map((other) => ({
            message: Messages.src.config.equipment.parser.text0017(
              other.source.pack.name,
              other.source.pack.active,
              other.source.kind,
            ),
            uri: other.source.uri,
            range: other.source.idRange,
          })),
      });
    }
  }
  return result;
}

export function validateEquipmentReferences(
  items: readonly ItemDefinition[],
  equipments: readonly EquipmentDefinition[],
  includeInactiveDiagnostics: boolean,
): readonly CoreIssue[] {
  const byRootAndId = groupBy(
    equipments.filter((equipment) => equipment.source.pack.active),
    (equipment) =>
      `${canonicalPath(equipment.source.pack.resourcesRoot)}\u0000${equipment.id}`,
  );
  const issues: CoreIssue[] = [];
  for (const item of items) {
    if (
      !item.equipmentAssetId ||
      (!includeInactiveDiagnostics && !item.source.pack.active)
    )
      continue;
    if (
      (byRootAndId.get(
        `${canonicalPath(item.source.pack.resourcesRoot)}\u0000${item.equipmentAssetId}`,
      )?.length ?? 0) > 0
    )
      continue;
    const field = item.source.fieldValueRanges.has(
      "settings.equipment.asset_id",
    )
      ? "settings.equipment.asset_id"
      : item.source.fieldValueRanges.has("settings.equipment.asset-id")
        ? "settings.equipment.asset-id"
        : "settings.equipment";
    issues.push({
      code: "unknown-equipment-id",
      message: Messages.src.config.equipment.parser.text0018(
        item.equipmentAssetId,
      ),
      severity: "error",
      uri: item.source.uri,
      range:
        item.source.fieldValueRanges.get(field) ??
        item.source.fieldKeyRanges.get(field) ??
        item.source.idRange,
    });
  }
  return issues;
}

export function buildEquipmentIndex(
  configurations: readonly ConfigurationCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  resources: ResourceFileCatalog,
  includeInactiveDiagnostics: boolean,
): EquipmentBuildResult {
  const issues = [...inheritedIssues];
  const equipments = configurations
    .map((candidate) => parseEquipment(candidate, resources, issues))
    .filter(
      (equipment): equipment is EquipmentDefinition => equipment !== undefined,
    );
  issues.push(...conflictIssues(equipments));
  const activeUris = new Set(
    configurations
      .filter((entry) => entry.source.pack.active)
      .map((entry) => entry.source.uri),
  );
  return {
    equipments,
    issues: issues.filter(
      (issue) => includeInactiveDiagnostics || activeUris.has(issue.uri),
    ),
  };
}
