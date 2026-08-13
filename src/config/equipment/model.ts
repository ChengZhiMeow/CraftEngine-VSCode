import type { ResourceFile } from "../../resources/model.js";
import type { ConfigurationSource } from "../model.js";

export interface EquipmentLayer {
  readonly texture: string;
  readonly resourceTexture: string;
  readonly dyeable?: Readonly<{ color_when_undyed?: number }>;
  readonly use_player_texture?: boolean;
  readonly candidates: readonly ResourceFile[];
}

export interface GeneratedEquipmentAsset {
  readonly layers: Readonly<
    Record<
      string,
      readonly Readonly<{
        readonly texture: string;
        readonly dyeable?: Readonly<{ color_when_undyed?: number }>;
        readonly use_player_texture?: boolean;
      }>[]
    >
  >;
}

export interface EquipmentDefinition {
  readonly kind: "equipment";
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly layers: Readonly<Record<string, readonly EquipmentLayer[]>>;
  readonly generatedJson?: GeneratedEquipmentAsset;
}
