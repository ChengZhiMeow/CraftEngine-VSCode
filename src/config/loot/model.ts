import type { ConfigurationSource } from "../model.js";

export interface LootDefinition {
  readonly kind: "loot";
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly raw: Readonly<Record<string, unknown>>;
}
