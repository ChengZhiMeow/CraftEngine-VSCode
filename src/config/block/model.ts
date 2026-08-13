import type { OpaqueIdDefinition } from "../model.js";

export interface BlockDefinition extends OpaqueIdDefinition {
  readonly kind: "block";
  readonly raw: Readonly<Record<string, unknown>>;
}
