import { MINECRAFT_26_2_ENTITY_DIMENSIONS } from "@craftengine/host/entity-dimensions";

import type {
  FurnitureHitboxDefinition,
  FurniturePreviewHitbox,
  FurniturePreviewVariant,
  FurnitureRotationRule,
  Vector3Tuple,
} from "../shared/protocol.js";

const HITBOX_COLORS: Readonly<Record<string, string>> = Object.freeze({
  interaction: "#29B6F6",
  shulker: "#AB47BC",
  happy_ghast: "#FFB300",
  custom: "#66BB6A",
});

function cleanPreviewNumber(value: number): number {
  const cleaned = Number(value.toFixed(12));
  return Object.is(cleaned, -0) ? 0 : cleaned;
}

function normalizeYaw(yaw: number): number {
  return ((((yaw + 180) % 360) + 360) % 360) - 180;
}

  // 这里要和 Java 的取整结果一致, 否则两个方向之间的角度会转错
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
    case "any":
      return value;
  }
  return Object.is(result, -0) ? 0 : result;
}

// 零偏航的展示实体朝向相反的 X 和 Z 方向, 不反转会背对预期方向
export function furnitureElementPreviewRotationY(elementYaw: number): number {
  return ((180 - elementYaw) * Math.PI) / 180;
}

function furnitureRelativePreviewPosition(
  position: Vector3Tuple,
  yaw: number,
): Vector3Tuple {
  const radians = ((yaw - 180) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cleanPreviewNumber(position[0] * cosine + position[2] * sine),
    cleanPreviewNumber(position[1]),
    cleanPreviewNumber(-(-position[0] * sine + position[2] * cosine)),
  ];
}

function rotateYawZeroPreviewPosition(
  position: Vector3Tuple,
  yaw: number,
): Vector3Tuple {
  const radians = (-yaw * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cleanPreviewNumber(position[0] * cosine + position[2] * sine),
    cleanPreviewNumber(position[1]),
    cleanPreviewNumber(-position[0] * sine + position[2] * cosine),
  ];
}

function physicalPeek(peek: number): number {
  return 0.5 - Math.sin((0.5 + peek * 0.01) * Math.PI) * 0.5;
}

type HorizontalDirection = "north" | "south" | "west" | "east";
type FurnitureDirection = HorizontalDirection | "up" | "down";

function directionFromYaw(yaw: number): HorizontalDirection {
  const normalized = normalizeYaw(yaw);
  if (normalized >= 45) return normalized < 135 ? "west" : "south";
  if (normalized > -45) return "north";
  return normalized > -135 ? "east" : "south";
}

function originalShulkerAnchor(
  direction: HorizontalDirection,
  furnitureDirection: HorizontalDirection,
): HorizontalDirection {
  switch (direction) {
    case "north":
      if (furnitureDirection === "north" || furnitureDirection === "south")
        return furnitureDirection;
      return furnitureDirection === "west" ? "east" : "west";
    case "south":
      if (furnitureDirection === "south") return "north";
      if (furnitureDirection === "north") return "south";
      return furnitureDirection;
    case "west":
      if (furnitureDirection === "south") return "east";
      if (furnitureDirection === "west") return "north";
      if (furnitureDirection === "east") return "south";
      return "west";
    case "east":
      if (furnitureDirection === "south") return "west";
      if (furnitureDirection === "west") return "south";
      if (furnitureDirection === "east") return "north";
      return "east";
  }
}

function oppositeDirection(direction: FurnitureDirection): FurnitureDirection {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "north":
      return "south";
    case "south":
      return "north";
    case "west":
      return "east";
    case "east":
      return "west";
  }
}

function shulkerPreviewStep(
  rawDirection: unknown,
  furnitureYaw: number,
): Vector3Tuple {
  const configured =
    typeof rawDirection === "string" ? rawDirection.toLowerCase() : "up";
  const valid: FurnitureDirection =
    configured === "up" ||
    configured === "down" ||
    configured === "north" ||
    configured === "south" ||
    configured === "west" ||
    configured === "east"
      ? configured
      : "up";
  const actual =
    valid === "up" || valid === "down"
      ? valid
      : oppositeDirection(
          originalShulkerAnchor(valid, directionFromYaw(furnitureYaw)),
        );
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

function javaByte(value: unknown): number {
  const integer = Math.trunc(Number(value) || 0);
  return ((((integer + 128) % 256) + 256) % 256) - 128;
}

function hitboxPart(
  hitbox: FurnitureHitboxDefinition,
  index: number,
  suffix: string,
  type: string,
  part: FurniturePreviewHitbox["part"],
  position: Vector3Tuple,
  size?: Vector3Tuple,
  unknownDimensions = false,
): FurniturePreviewHitbox {
  return {
    id: `${hitbox.path}:${index}:${suffix}`,
    parentId: hitbox.path,
    type,
    part,
    position,
    ...(size ? { size } : {}),
    color: HITBOX_COLORS[type] ?? "#FFFFFF",
    dashed: hitbox.behaviorGenerated,
    source: hitbox.sourceLabel,
    flags: {
      blocksBuilding: hitbox.blocksBuilding,
      projectile: hitbox.canBeHitByProjectile,
      interactive: hitbox.interactive,
      canUseItemOn: hitbox.canUseItemOn,
    },
    ...(unknownDimensions ? { unknownDimensions: true } : {}),
    ...(hitbox.entityType ? { entityType: hitbox.entityType } : {}),
  };
}

function furnitureHitboxGeometry(
  hitbox: FurnitureHitboxDefinition,
  index: number,
  furnitureYaw: number,
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
        hitboxPart(
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
        hitboxPart(
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
          hitboxPart(
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
        hitboxPart(
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
      const peek = physicalPeek(javaByte(hitbox.raw.peek)) * scale;
      const step = shulkerPreviewStep(hitbox.raw.direction, furnitureYaw);
      const size: Vector3Tuple = [
        scale + Math.abs(step[0]) * peek,
        scale + Math.abs(step[1]) * peek,
        scale + Math.abs(step[2]) * peek,
      ];
      const center: Vector3Tuple = [
        x + (step[0] * peek) / 2,
        y + scale / 2 + (step[1] * peek) / 2,
        z + (step[2] * peek) / 2,
      ];
      const result = [
        hitboxPart(
          hitbox,
          index,
          "physical",
          "shulker",
          "physical",
          center,
          size,
        ),
      ];
      if (
        hitbox.raw.interaction_entity === false ||
        hitbox.raw["interaction-entity"] === false
      )
        return result;
      if (step[1] !== 0) {
        result.push(
          hitboxPart(
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
        hitboxPart(
          hitbox,
          index,
          "interaction-0",
          "shulker",
          "interaction",
          [x, y + scale / 2, z],
          [scale, scale, scale],
        ),
      );
      result.push(
        hitboxPart(
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
        hitboxPart(
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

  // 这里不能直接旋转碰撞范围, 否则会和已保存的数据错位
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
