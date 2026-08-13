import type {
  FurnitureDefinition,
  FurnitureElementDefinition,
  FurnitureHitboxDefinition,
  FurnitureSeatDefinition,
  FurnitureVector3,
} from "../../config/furniture/model.js";
import type { ItemDefinition } from "../../config/item/model.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  MINECRAFT_26_2_ENTITY_DIMENSIONS,
  MINECRAFT_26_2_PLAYER_VEHICLE_ATTACHMENT,
} from "../../generated/minecraft26_2EntityDimensions.js";

import { Messages } from "../../messages.js";
export const FURNITURE_HITBOX_COLORS = Object.freeze({
  interaction: "#29B6F6",
  shulker: "#AB47BC",
  happy_ghast: "#FFB300",
  custom: "#66BB6A",
});

export const FURNITURE_ROTATION_RULES = [
  "any",
  "four",
  "eight",
  "sixteen",
  "north",
  "east",
  "west",
  "south",
] as const;

export type FurnitureRotationRule = (typeof FURNITURE_ROTATION_RULES)[number];

export {
  MINECRAFT_26_2_ENTITY_DIMENSIONS,
  MINECRAFT_26_2_PLAYER_VEHICLE_ATTACHMENT,
};

export interface FurniturePreviewElement {
  readonly id: string;
  readonly type: string;
  readonly position: FurnitureVector3;
  readonly scale: FurnitureVector3;
  readonly translation: FurnitureVector3;
  readonly pitch: number;
  readonly yaw: number;
  readonly rotation?: unknown;
  readonly displayContext?: unknown;
  readonly item?: string;
  readonly block?: string;
  readonly text?: string;
  readonly externalModel?: string;
  readonly external: boolean;
  readonly glowColor?: unknown;
  readonly brightness?: unknown;
  readonly billboard?: unknown;
  readonly shadowRadius?: number;
  readonly shadowStrength?: number;
  readonly viewRange?: number;
  readonly applyDyedColor?: boolean;
  readonly tintSource?: unknown;
  readonly lineWidth?: number;
  readonly backgroundColor?: unknown;
  readonly textOpacity?: number;
  readonly hasShadow?: boolean;
  readonly seeThrough?: boolean;
  readonly useDefaultBackground?: boolean;
  readonly alignment?: unknown;
  readonly conditional: boolean;
  readonly itemIcon?: string;
}

export interface FurniturePreviewHitbox {
  readonly id: string;
  readonly parentId: string;
  readonly type: string;
  readonly part: "physical" | "interaction" | "entity" | "unknown";
  readonly position: FurnitureVector3;
  readonly size?: FurnitureVector3;
  readonly color: string;
  readonly dashed: boolean;
  readonly source: string;
  readonly flags: Readonly<{
    blocksBuilding: boolean;
    projectile: boolean;
    interactive: boolean;
    canUseItemOn: boolean;
  }>;
  readonly unknownDimensions?: boolean;
  readonly entityType?: string;
}

export interface FurniturePreviewSeat {
  readonly id: string;
  /** 玩家脚的位置, 已扣除载具偏移 */
  readonly position: FurnitureVector3;
  /** 座位安装位置, 已加上 BukkitSeat 的零点六偏移 */
  readonly mountPosition: FurnitureVector3;
  readonly carrierPosition: FurnitureVector3;
  readonly yaw: number;
  readonly limitedRotation: boolean;
  readonly carrier: "item_display" | "small_armor_stand";
  readonly carrierOffset: number;
  readonly source: string;
}

export interface FurniturePreviewLight {
  readonly position: FurnitureVector3;
  readonly level: number;
  readonly source: string;
}

export interface FurniturePreviewDisplayItem {
  readonly id: string;
  readonly position: FurnitureVector3;
  readonly dataKey: string;
  readonly source: string;
}

export interface FurniturePreviewVariant {
  readonly name: string;
  readonly rotationRule: FurnitureRotationRule;
  readonly elements: readonly FurniturePreviewElement[];
  readonly hitboxes: readonly FurniturePreviewHitbox[];
  /** 保留原始碰撞范围, 转动家具时要重新计算 */
  readonly hitboxDefinitions: readonly FurnitureHitboxDefinition[];
  readonly seats: readonly FurniturePreviewSeat[];
  readonly lights: readonly FurniturePreviewLight[];
  readonly displayItems: readonly FurniturePreviewDisplayItem[];
  readonly externalBlueprint?: string;
}

export interface FurnitureItemModelPayload {
  readonly model: unknown;
  readonly components: Readonly<Record<string, unknown>>;
  readonly models: Readonly<Record<string, unknown>>;
  readonly textures: Readonly<Record<string, string>>;
  readonly textureMetadata: Readonly<Record<string, unknown>>;
  readonly missingTexture: string;
  readonly missingModel: boolean;
  readonly issues: readonly string[];
}

export interface FurniturePreviewPayload {
  readonly kind: "furniture";
  readonly id: string;
  readonly pack: string;
  readonly source: string;
  readonly sourceOffset: number;
  readonly locator: Readonly<{
    id: string;
    root: string;
    source: string;
    offset: number;
  }>;
  readonly inline: boolean;
  readonly variants: readonly FurniturePreviewVariant[];
  readonly itemIcons: Readonly<Record<string, string>>;
  readonly itemModels: Readonly<Record<string, FurnitureItemModelPayload>>;
  readonly issues: readonly string[];
  readonly player: Readonly<{
    name: "ChengZhiYa";
    model: "slim";
    passengerPose: Readonly<{
      rightArmX: number;
      leftArmX: number;
      rightLegX: number;
      leftLegX: number;
      rightLegY: number;
      leftLegY: number;
      rightLegZ: number;
      leftLegZ: number;
    }>;
  }>;
}

function cleanPreviewNumber(value: number): number {
  const cleaned = Number(value.toFixed(12));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

function normalizeYaw(yaw: number): number {
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

/** 这里要照搬 CE 的取整方式, 否则临界角度会选错方向 */
export function applyFurnitureRotationRule(
  rule: FurnitureRotationRule,
  yaw: number,
): number {
  const value = Number.isFinite(yaw) ? yaw : 0;
  let result: number;
  switch (rule) {
    case "four":
      result = Math.round(value / 90) * 90;
      break;
    case "eight":
      result = Math.round(value / 45) * 45;
      break;
    case "sixteen":
      result = Math.round(value / 22.5) * 22.5;
      break;
    case "north":
      return 180;
    case "east":
      return -90;
    case "west":
      return 90;
    case "south":
      return 0;
    default:
      return value;
  }
  return Object.is(result, -0) ? 0 : result;
}

function behaviorTargetsFurniture(
  behavior: Readonly<Record<string, unknown>>,
  item: ItemDefinition,
  furniture: FurnitureDefinition,
): boolean {
  if (typeof behavior.type !== "string") return false;
  switch (behavior.type.toLowerCase().split(":").at(-1)) {
    case "furniture_item":
    case "liquid_collision_furniture_item":
      break;
    default:
      return false;
  }
  if (isRecord(behavior.furniture))
    return furniture.inlineOwnerItemId === item.id;
  return (
    typeof behavior.furniture === "string" &&
    makeIdentifier(behavior.furniture, item.namespace) === furniture.id
  );
}

function configuredRotationRule(
  behavior: Readonly<Record<string, unknown>>,
  variant: string,
): FurnitureRotationRule {
  let value: unknown;
  if (isRecord(behavior.rules)) {
    const rule = behavior.rules[variant];
    value = isRecord(rule) ? rule.rotation : undefined;
  } else if (
    isRecord(behavior.furniture) &&
    isRecord(behavior.furniture.placement)
  ) {
    const placement = behavior.furniture.placement[variant];
    const rules = isRecord(placement) ? placement.rules : undefined;
    value = isRecord(rules) ? rules.rotation : undefined;
  }
  if (typeof value !== "string") return "any";
  const normalized = value.toLowerCase();
  return (FURNITURE_ROTATION_RULES as readonly string[]).includes(normalized)
    ? (normalized as FurnitureRotationRule)
    : "any";
}

export function furniturePreviewRotationRules(
  furniture: FurnitureDefinition,
  items: readonly ItemDefinition[],
  sameRoot: (left: string, right: string) => boolean = (left, right) =>
    left === right,
): ReadonlyMap<string, FurnitureRotationRule> {
  const candidates = items
    .filter(
      (item) =>
        item.source.pack.active &&
        sameRoot(
          item.source.pack.resourcesRoot,
          furniture.source.pack.resourcesRoot,
        ),
    )
    .flatMap((item) =>
      item.behaviors.flatMap((value) =>
        isRecord(value) && behaviorTargetsFurniture(value, item, furniture)
          ? [{ item, behavior: value }]
          : [],
      ),
    );
  const selected =
    candidates.find(
      (entry) =>
        entry.item.id === (furniture.inlineOwnerItemId ?? furniture.item),
    ) ?? candidates[0];
  return new Map(
    [...furniture.variants.keys()].map((variant) => [
      variant,
      variant === "wall"
        ? "four"
        : selected
          ? configuredRotationRule(selected.behavior, variant)
          : "any",
    ]),
  );
}

/** 显示实体的模型正面相反, yaw 为零时要转半圈 */
export function furnitureElementPreviewRotationY(elementYaw: number): number {
  return ((180 - elementYaw) * Math.PI) / 180;
}

/** 按 CE 的坐标算法换算, Z 方向不能直接照抄 */
export function furnitureRelativePreviewPosition(
  position: FurnitureVector3,
  yaw = 0,
): FurnitureVector3 {
  const radians = ((yaw - 180) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cleanPreviewNumber(position[0] * cosine + position[2] * sine),
    cleanPreviewNumber(position[1]),
    cleanPreviewNumber(position[0] * sine - position[2] * cosine),
  ];
}

function rotateYawZeroPreviewPosition(
  position: FurnitureVector3,
  yaw: number,
): FurnitureVector3 {
  const radians = (-yaw * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cleanPreviewNumber(position[0] * cosine + position[2] * sine),
    cleanPreviewNumber(position[1]),
    cleanPreviewNumber(-position[0] * sine + position[2] * cosine),
  ];
}

export function furnitureSeatPreview(
  seat: FurnitureSeatDefinition,
  furnitureYaw = 0,
): FurniturePreviewSeat {
  const offset = furnitureRelativePreviewPosition(seat.position, furnitureYaw);
  const carrierPassengerAttachment = seat.limitedRotation
    ? (MINECRAFT_26_2_ENTITY_DIMENSIONS["minecraft:armor_stand"]
        ?.passengerAttachment ?? 1.975) * 0.5
    : (MINECRAFT_26_2_ENTITY_DIMENSIONS["minecraft:item_display"]
        ?.passengerAttachment ?? 0);
  const carrierOffset = -carrierPassengerAttachment;
  const mountPosition: FurnitureVector3 = [
    offset[0],
    cleanPreviewNumber(offset[1] + 0.6),
    offset[2],
  ];
  const carrierPosition: FurnitureVector3 = [
    mountPosition[0],
    cleanPreviewNumber(mountPosition[1] + carrierOffset),
    mountPosition[2],
  ];
  const position: FurnitureVector3 = [
    cleanPreviewNumber(
      carrierPosition[0] - MINECRAFT_26_2_PLAYER_VEHICLE_ATTACHMENT[0],
    ),
    cleanPreviewNumber(
      carrierPosition[1] +
        carrierPassengerAttachment -
        MINECRAFT_26_2_PLAYER_VEHICLE_ATTACHMENT[1],
    ),
    cleanPreviewNumber(
      carrierPosition[2] - MINECRAFT_26_2_PLAYER_VEHICLE_ATTACHMENT[2],
    ),
  ];
  return {
    id: `${seat.path}:${seat.position.join(",")}`,
    position,
    mountPosition,
    carrierPosition,
    yaw: normalizeYaw(seat.yaw + furnitureYaw),
    limitedRotation: seat.limitedRotation,
    carrier: seat.limitedRotation ? "small_armor_stand" : "item_display",
    carrierOffset,
    source: seat.path,
  };
}

type HorizontalDirection = "north" | "south" | "west" | "east";
type FurnitureDirection = HorizontalDirection | "up" | "down";

function directionFromYaw(yaw: number): HorizontalDirection {
  const normalized = normalizeYaw(yaw);
  if (normalized < 45) {
    if (normalized > -45) return "north";
    if (normalized > -135) return "east";
    return "south";
  }
  return normalized < 135 ? "west" : "south";
}

function originalShulkerAnchor(
  direction: HorizontalDirection,
  furnitureDirection: HorizontalDirection,
): HorizontalDirection {
  if (direction === "north") {
    if (furnitureDirection === "north" || furnitureDirection === "south")
      return furnitureDirection;
    return furnitureDirection === "west" ? "east" : "west";
  }
  if (direction === "south") {
    if (furnitureDirection === "south") return "north";
    if (furnitureDirection === "north") return "south";
    return furnitureDirection;
  }
  if (direction === "west") {
    if (furnitureDirection === "south") return "east";
    if (furnitureDirection === "west") return "north";
    if (furnitureDirection === "east") return "south";
    return "west";
  }
  if (furnitureDirection === "south") return "west";
  if (furnitureDirection === "west") return "south";
  if (furnitureDirection === "east") return "north";
  return "east";
}

function shulkerPreviewStep(
  rawDirection: unknown,
  furnitureYaw: number,
): FurnitureVector3 {
  const configured =
    typeof rawDirection === "string"
      ? (rawDirection.toLowerCase() as FurnitureDirection)
      : "up";
  const valid: FurnitureDirection = [
    "up",
    "down",
    "north",
    "south",
    "west",
    "east",
  ].includes(configured)
    ? configured
    : "up";
  let actual: FurnitureDirection = valid;
  if (valid !== "up" && valid !== "down") {
    switch (originalShulkerAnchor(valid, directionFromYaw(furnitureYaw))) {
      case "north":
        actual = "south";
        break;
      case "south":
        actual = "north";
        break;
      case "west":
        actual = "east";
        break;
      case "east":
        actual = "west";
        break;
    }
  }
  switch (actual) {
    case "up":
      return [0, 1, 0];
    case "down":
      return [0, -1, 0];
    case "north":
      return [0, 0, -1];
    case "south":
      return [0, 0, 1];
    case "west":
      return [-1, 0, 0];
    case "east":
      return [1, 0, 0];
  }
}

function part(
  hitbox: FurnitureHitboxDefinition,
  index: number,
  suffix: string,
  type: string,
  kind: FurniturePreviewHitbox["part"],
  position: FurnitureVector3,
  size: FurnitureVector3 | undefined,
  unknownDimensions = false,
): FurniturePreviewHitbox {
  return {
    id: `${hitbox.path}:${index}:${suffix}`,
    parentId: hitbox.path,
    type,
    part: kind,
    position,
    ...(size === undefined ? {} : { size }),
    color:
      FURNITURE_HITBOX_COLORS[type as keyof typeof FURNITURE_HITBOX_COLORS] ??
      "#FFFFFF",
    dashed: hitbox.behaviorGenerated,
    source: hitbox.sourceLabel,
    flags: {
      blocksBuilding: hitbox.blocksBuilding,
      projectile: hitbox.canBeHitByProjectile,
      interactive: hitbox.interactive,
      canUseItemOn: hitbox.canUseItemOn,
    },
    ...(unknownDimensions ? { unknownDimensions: true } : {}),
    ...(hitbox.entityType === undefined
      ? {}
      : { entityType: hitbox.entityType }),
  };
}

export function furnitureHitboxGeometry(
  hitbox: FurnitureHitboxDefinition,
  index: number,
  furnitureYaw = 0,
): readonly FurniturePreviewHitbox[] {
  const [x, y, z] = furnitureRelativePreviewPosition(
    hitbox.position,
    furnitureYaw,
  );
  switch (hitbox.type) {
    case "interaction": {
      const width = hitbox.width ?? 1;
      const height = hitbox.height ?? 1;
      return [
        part(
          hitbox,
          index,
          "interaction",
          "interaction",
          "interaction",
          [x, y + height / 2, z],
          [width, height, width],
        ),
      ];
    }
    case "happy_ghast": {
      const size = 4 * (hitbox.scale ?? 1);
      return [
        part(
          hitbox,
          index,
          "entity",
          "happy_ghast",
          "entity",
          [x, y + size / 2, z],
          [size, size, size],
        ),
      ];
    }
    case "custom": {
      const dimensions = hitbox.entityType
        ? MINECRAFT_26_2_ENTITY_DIMENSIONS[hitbox.entityType]
        : undefined;
      if (!dimensions)
        return [
          part(
            hitbox,
            index,
            "unknown",
            "custom",
            "unknown",
            [x, y, z],
            undefined,
            true,
          ),
        ];

      const scale = hitbox.scale ?? 1;
      const width = dimensions.fixed
        ? dimensions.width
        : dimensions.width * scale;
      const height = dimensions.fixed
        ? dimensions.height
        : dimensions.height * scale;
      return [
        part(
          hitbox,
          index,
          "entity",
          "custom",
          "entity",
          [x, y + height / 2, z],
          [width, height, width],
        ),
      ];
    }
    case "shulker": {
      const scale = hitbox.scale ?? 1;
      const integer = Math.trunc(Number(hitbox.raw.peek) || 0);
      const byte = ((((integer + 128) % 256) + 256) % 256) - 128;
      const peek =
        (0.5 - Math.sin((0.5 + byte * 0.01) * Math.PI) * 0.5) * scale;
      const step = shulkerPreviewStep(hitbox.raw.direction, furnitureYaw);
      const size: FurnitureVector3 = [
        scale + Math.abs(step[0]) * peek,
        scale + Math.abs(step[1]) * peek,
        scale + Math.abs(step[2]) * peek,
      ];
      const center: FurnitureVector3 = [
        x + (step[0] * peek) / 2,
        y + scale / 2 + (step[1] * peek) / 2,
        z + (step[2] * peek) / 2,
      ];
      const result: FurniturePreviewHitbox[] = [
        part(hitbox, index, "physical", "shulker", "physical", center, size),
      ];
      if (
        hitbox.raw.interaction_entity === false ||
        hitbox.raw["interaction-entity"] === false
      )
        return result;
      if (step[1] !== 0) {
        result.push(
          part(
            hitbox,
            index,
            "interaction-0",
            "shulker",
            "interaction",
            center,
            size,
          ),
        );
        return result;
      }

      result.push(
        part(
          hitbox,
          index,
          "interaction-0",
          "shulker",
          "interaction",
          [x, y + scale / 2, z],
          [scale, scale, scale],
        ),
        part(
          hitbox,
          index,
          "interaction-1",
          "shulker",
          "interaction",
          [x + step[0] * peek, y + scale / 2, z + step[2] * peek],
          [scale, scale, scale],
        ),
      );
      return result;
    }
    default:
      return [
        part(
          hitbox,
          index,
          "unknown",
          hitbox.type,
          "unknown",
          [x, y, z],
          undefined,
          true,
        ),
      ];
  }
}

function previewElement(
  element: FurnitureElementDefinition,
  index: number,
  furnitureYaw = 0,
): FurniturePreviewElement {
  const raw = element.raw;
  const displayContext =
    raw.display_context ??
    raw.display_transform ??
    raw["display-context"] ??
    raw["display-transform"];
  const shadowRadius = Number(raw.shadow_radius ?? raw["shadow-radius"]);
  const shadowStrength = Number(raw.shadow_strength ?? raw["shadow-strength"]);
  const viewRange = Number(raw.view_range ?? raw["view-range"]);
  const lineWidth = Number(raw.line_width ?? raw["line-width"]);
  const textOpacity = Number(raw.text_opacity ?? raw["text-opacity"]);
  const applyDyedColor = raw.apply_dyed_color ?? raw["apply-dyed-color"];
  const hasShadow = raw.has_shadow ?? raw["has-shadow"];
  const seeThrough = raw.is_see_through ?? raw["is-see-through"];
  const useDefaultBackground =
    raw.use_default_background_color ?? raw["use-default-background-color"];
  return {
    id: `${element.path}:${index}`,
    type: element.type,
    position: furnitureRelativePreviewPosition(element.position, furnitureYaw),
    scale: element.scale,
    translation: [
      element.translation[0],
      element.translation[1],
      element.translation[2] === 0 ? 0 : -element.translation[2],
    ],
    pitch: element.pitch,
    yaw: normalizeYaw(element.yaw + furnitureYaw),
    ...(raw.rotation === undefined ? {} : { rotation: raw.rotation }),
    ...(displayContext === undefined ? {} : { displayContext }),
    ...(element.item === undefined ? {} : { item: element.item }),
    ...(element.block === undefined ? {} : { block: element.block }),
    ...(element.text === undefined ? {} : { text: element.text }),
    ...(element.externalModel === undefined
      ? {}
      : { externalModel: element.externalModel }),
    external: element.external,
    ...(raw.glow_color === undefined && raw["glow-color"] === undefined
      ? {}
      : { glowColor: raw.glow_color ?? raw["glow-color"] }),
    ...(raw.brightness === undefined ? {} : { brightness: raw.brightness }),
    ...(raw.billboard === undefined ? {} : { billboard: raw.billboard }),
    ...(Number.isFinite(shadowRadius) ? { shadowRadius } : {}),
    ...(Number.isFinite(shadowStrength) ? { shadowStrength } : {}),
    ...(Number.isFinite(viewRange) ? { viewRange } : {}),
    ...(typeof applyDyedColor !== "boolean" ? {} : { applyDyedColor }),
    ...(raw.tint_source === undefined && raw["tint-source"] === undefined
      ? {}
      : { tintSource: raw.tint_source ?? raw["tint-source"] }),
    ...(Number.isFinite(lineWidth) ? { lineWidth } : {}),
    ...(raw.background_color === undefined &&
    raw["background-color"] === undefined
      ? {}
      : { backgroundColor: raw.background_color ?? raw["background-color"] }),
    ...(Number.isFinite(textOpacity) ? { textOpacity } : {}),
    ...(typeof hasShadow !== "boolean" ? {} : { hasShadow }),
    ...(typeof seeThrough !== "boolean" ? {} : { seeThrough }),
    ...(typeof useDefaultBackground !== "boolean"
      ? {}
      : { useDefaultBackground }),
    ...(raw.alignment === undefined ? {} : { alignment: raw.alignment }),
    conditional: raw.conditions !== undefined || raw.condition !== undefined,
  };
}

function parseLights(
  value: unknown,
  source: string,
  furnitureYaw = 0,
): FurniturePreviewLight[] {
  const values = isUnknownArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  return values.flatMap((entry) => {
    if (typeof entry === "string") {
      const match = /^(.*?)\s+(-?\d+)\s*$/u.exec(entry);
      if (!match) return [];
      const vector = match[1]!.split(",").map(Number);
      return vector.length === 3 && vector.every(Number.isFinite)
        ? [
            {
              position: furnitureRelativePreviewPosition(
                [vector[0]!, vector[1]!, vector[2]!],
                furnitureYaw,
              ),
              level: Number(match[2]),
              source,
            },
          ]
        : [];
    }
    if (!isRecord(entry)) return [];
    const raw =
      typeof entry.position === "string"
        ? entry.position.split(",").map(Number)
        : isUnknownArray(entry.position)
          ? entry.position.map(Number)
          : [];
    const level = Number(entry.level);
    return raw.length === 3 &&
      raw.every(Number.isFinite) &&
      Number.isFinite(level)
      ? [
          {
            position: furnitureRelativePreviewPosition(
              [raw[0]!, raw[1]!, raw[2]!],
              furnitureYaw,
            ),
            level,
            source,
          },
        ]
      : [];
  });
}

function behaviorLights(
  furniture: FurnitureDefinition,
  variant: string,
  furnitureYaw = 0,
): FurniturePreviewLight[] {
  const result: FurniturePreviewLight[] = [];
  for (const behavior of furniture.behaviors) {
    if (behavior.type !== "glowing_furniture") continue;
    const variants = isRecord(behavior.raw.variants)
      ? behavior.raw.variants
      : undefined;
    const overridden =
      variants !== undefined && Object.hasOwn(variants, variant);
    result.push(
      ...parseLights(
        overridden ? variants[variant] : behavior.raw.lights,
        overridden
          ? `${behavior.path}.variants.${variant}`
          : `${behavior.path}.lights`,
        furnitureYaw,
      ),
    );
  }
  return result;
}

function behaviorDisplayItems(
  furniture: FurnitureDefinition,
  variant: string,
  furnitureYaw = 0,
): FurniturePreviewDisplayItem[] {
  const result: FurniturePreviewDisplayItem[] = [];
  for (const behavior of furniture.behaviors) {
    if (
      behavior.type !== "display_item_furniture" ||
      !isRecord(behavior.raw.variants)
    )
      continue;
    const rule = behavior.raw.variants[variant];
    if (!isRecord(rule)) continue;
    const value = rule.item_position ?? rule["item-position"] ?? [0, 0, 0];
    const position =
      typeof value === "string"
        ? value.split(",").map(Number)
        : isUnknownArray(value)
          ? value.map(Number)
          : [];
    if (position.length !== 3 || !position.every(Number.isFinite)) continue;
    result.push({
      id: `${behavior.path}.variants.${variant}.item_position`,
      position: furnitureRelativePreviewPosition(
        [position[0]!, position[1]!, position[2]!],
        furnitureYaw,
      ),
      dataKey: behavior.dataKey ?? "craftengine:display_item",
      source: behavior.path,
    });
  }
  return result;
}

export function buildFurniturePreviewPayload(
  furniture: FurnitureDefinition,
  furnitureYaw = 0,
  rotationRules: ReadonlyMap<string, FurnitureRotationRule> = new Map(),
): FurniturePreviewPayload {
  const issues: string[] = [];
  const variants: FurniturePreviewVariant[] = [];
  for (const variant of furniture.variants.values()) {
    const elements = variant.elements.map((element, index) =>
      previewElement(element, index, furnitureYaw),
    );
    if (variant.blueprint)
      issues.push(
        Messages.src.preview.furniture.data.text0001(variant.blueprint),
      );
    for (const element of elements) {
      if (!element.external) continue;
      issues.push(
        Messages.src.preview.furniture.data.text0002(
          element.type,
          element.externalModel ?? Messages.src.preview.furniture.data.text0005,
        ),
      );
    }

    const hitboxDefinitions = [
      ...variant.hitboxes,
      ...furniture.behaviors.flatMap((entry) =>
        entry.variantNames.includes(variant.name)
          ? entry.hitboxes.filter((hitbox) =>
              hitbox.sourceLabel.endsWith(` · ${variant.name}`),
            )
          : [],
      ),
    ];
    const hitboxes = hitboxDefinitions.flatMap((hitbox, index) =>
      furnitureHitboxGeometry(hitbox, index, furnitureYaw),
    );
    for (const hitbox of hitboxes) {
      if (!hitbox.unknownDimensions) continue;
      issues.push(
        hitbox.entityType
          ? Messages.src.preview.furniture.data.text0003(hitbox.entityType)
          : Messages.src.preview.furniture.data.text0004(hitbox.type),
      );
    }

    const seenSeats = new Set<string>();
    const seats: FurniturePreviewSeat[] = [];
    for (const seat of hitboxDefinitions.flatMap((hitbox) => hitbox.seats)) {
      const key = seat.position.join(",");
      if (seenSeats.has(key)) continue;
      seenSeats.add(key);
      seats.push(furnitureSeatPreview(seat, furnitureYaw));
    }

    variants.push({
      name: variant.name,
      rotationRule:
        rotationRules.get(variant.name) ??
        (variant.name === "wall" ? "four" : "any"),
      elements,
      hitboxes,
      hitboxDefinitions,
      seats,
      lights: behaviorLights(furniture, variant.name, furnitureYaw),
      displayItems: behaviorDisplayItems(
        furniture,
        variant.name,
        furnitureYaw,
      ),
      ...(variant.blueprint === undefined
        ? {}
        : { externalBlueprint: variant.blueprint }),
    });
  }

  return {
    kind: "furniture",
    id: furniture.id,
    pack: furniture.source.pack.name,
    source: furniture.source.uri,
    sourceOffset: furniture.source.idRange.start,
    inline: furniture.inlineOwnerItemId !== undefined,
    locator: {
      id: furniture.id,
      root: furniture.source.pack.resourcesRoot,
      source: furniture.source.uri,
      offset: furniture.source.idRange.start,
    },
    variants,
    itemIcons: {},
    itemModels: {},
    issues: [...new Set(issues)],
    player: {
      name: "ChengZhiYa",
      model: "slim",
      passengerPose: {
        rightArmX: -Math.PI / 5,
        leftArmX: -Math.PI / 5,
        rightLegX: -1.4137167,
        leftLegX: -1.4137167,
        rightLegY: Math.PI / 10,
        leftLegY: -Math.PI / 10,
        rightLegZ: Math.PI / 40,
        leftLegZ: -Math.PI / 40,
      },
    },
  };
}

/** 家具转向时用原始数据重算碰撞范围, 直接旋转现有范围会错 */
export function orientFurniturePreviewVariant(
  variant: FurniturePreviewVariant,
  furnitureYaw: number,
): FurniturePreviewVariant {
  return {
    ...variant,
    elements: variant.elements.map((element) => ({
      ...element,
      position: rotateYawZeroPreviewPosition(element.position, furnitureYaw),
      yaw: normalizeYaw(element.yaw + furnitureYaw),
    })),
    hitboxes: variant.hitboxDefinitions.flatMap((hitbox, index) =>
      furnitureHitboxGeometry(hitbox, index, furnitureYaw),
    ),
    seats: variant.seats.map((seat) => ({
      ...seat,
      position: rotateYawZeroPreviewPosition(seat.position, furnitureYaw),
      mountPosition: rotateYawZeroPreviewPosition(
        seat.mountPosition,
        furnitureYaw,
      ),
      carrierPosition: rotateYawZeroPreviewPosition(
        seat.carrierPosition,
        furnitureYaw,
      ),
      yaw: normalizeYaw(seat.yaw + furnitureYaw),
    })),
    lights: variant.lights.map((light) => ({
      ...light,
      position: rotateYawZeroPreviewPosition(light.position, furnitureYaw),
    })),
    displayItems: variant.displayItems.map((displayItem) => ({
      ...displayItem,
      position: rotateYawZeroPreviewPosition(
        displayItem.position,
        furnitureYaw,
      ),
    })),
  };
}
