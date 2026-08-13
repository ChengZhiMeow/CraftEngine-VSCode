import type { ConfigurationSource, ResourceKind } from "../model.js";

export type GenericResourceKind = Extract<
  ResourceKind,
  | "recipe"
  | "category"
  | "emoji"
  | "painting"
  | "configured-feature"
  | "placed-feature"
  | "advancement"
>;

export interface GenericResourceDefinition {
  readonly kind: GenericResourceKind;
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly raw: Readonly<Record<string, unknown>>;
}
