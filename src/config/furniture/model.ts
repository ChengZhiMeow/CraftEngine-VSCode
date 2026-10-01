import type { OpaqueIdDefinition } from "../model.js";

export type FurnitureVector3 = readonly [x: number, y: number, z: number];

export interface FurnitureSeatDefinition {
  readonly position: FurnitureVector3;
  readonly yaw: number;
  readonly limitedRotation: boolean;
  // CraftEngine SeatConfig#forcePlayerRotation: NaN 表示不调整玩家视角
  readonly forcePlayerRotation: number;
  readonly path: string;
}

export interface FurnitureElementDefinition {
  readonly type: string;
  readonly path: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly position: FurnitureVector3;
  readonly scale: FurnitureVector3;
  readonly translation: FurnitureVector3;
  readonly pitch: number;
  readonly yaw: number;
  readonly item?: string;
  readonly block?: string;
  readonly text?: string;
  readonly externalModel?: string;
  readonly external: boolean;
}

export interface FurnitureHitboxDefinition {
  readonly type: string;
  readonly path: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly position: FurnitureVector3;
  readonly seats: readonly FurnitureSeatDefinition[];
  readonly sourceLabel: string;
  readonly behaviorGenerated: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly entityType?: string;
  readonly blocksBuilding: boolean;
  readonly canUseItemOn: boolean;
  readonly canBeHitByProjectile: boolean;
  readonly interactive: boolean;
}

export interface FurnitureVariantDefinition {
  readonly name: string;
  readonly elements: readonly FurnitureElementDefinition[];
  readonly hitboxes: readonly FurnitureHitboxDefinition[];
  readonly blueprint?: string;
}

export interface FurnitureBehaviorDefinition {
  readonly type: string;
  readonly path: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly dataKey?: string;
  readonly variantNames: readonly string[];
  readonly hitboxes: readonly FurnitureHitboxDefinition[];
}

export interface FurnitureDefinition extends OpaqueIdDefinition {
  readonly kind: "furniture";
  readonly raw: Readonly<Record<string, unknown>>;
  readonly item: string;
  readonly settingsItemPath?: string;
  readonly variants: ReadonlyMap<string, FurnitureVariantDefinition>;
  readonly behaviors: readonly FurnitureBehaviorDefinition[];
  readonly inlineOwnerItemId?: string;
}
