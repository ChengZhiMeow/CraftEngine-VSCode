import type { ConfigurationSource } from "../model.js";

export interface ItemDefinition {
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly material: string;
  readonly clientBoundMaterial: string;
  readonly customModelData?: number;
  readonly itemModel?: string;
  readonly clientBoundModel: boolean;
  readonly model?: unknown;
  readonly legacyModel?: unknown;
  readonly textures: readonly string[];
  readonly data: Readonly<Record<string, unknown>>;
  readonly clientBoundData: Readonly<Record<string, unknown>>;
  readonly equipmentAssetId?: string;
  readonly equipmentSlot?: string;
  readonly behaviors: readonly unknown[];
  readonly claimsModelSlot: boolean;
}
