import type { PackSource } from "../config/model.js";

export type ResourceFileKind =
  | "texture"
  | "font"
  | "model"
  | "item-model"
  | "blockstate"
  | "language"
  | "equipment"
  | "sound-file"
  | "sounds-json";

export interface ResourceFile {
  readonly kind: ResourceFileKind;
  readonly id: string;
  readonly path: string;
  readonly pack: PackSource;
  readonly active: boolean;
  readonly effective: boolean;
  readonly text?: string;
}

export interface ResourceFileCatalog {
  readonly files: readonly ResourceFile[];
  readonly byKind: ReadonlyMap<ResourceFileKind, readonly ResourceFile[]>;
  readonly byKey: ReadonlyMap<string, readonly ResourceFile[]>;
}
