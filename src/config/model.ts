import type { CoreIssue, TextRange } from "../diagnostics/model.js";

export interface PathRanges {
  readonly keys: ReadonlyMap<string, TextRange>;
  readonly values: ReadonlyMap<string, TextRange>;
}

export interface ParsedSection {
  readonly key: string;
  readonly type: string;
  readonly value: unknown;
  readonly keyRange: TextRange;
  readonly valueRange: TextRange;
  readonly ranges: PathRanges;
  readonly generated?: "factory" | "standalone-translation";
}

export interface ParsedYamlFile {
  readonly uri: string;
  readonly text: string;
  readonly sections: readonly ParsedSection[];
  readonly issues: readonly CoreIssue[];
}

export interface PackSource {
  readonly resourcesRoot: string;
  readonly folder: string;
  readonly name: string;
  readonly namespace: string;
  readonly active: boolean;
  readonly subpack?: string;
  readonly configurationRoot: string;
  readonly resourcePackRoot: string;
  readonly baseResourcePackRoot: string;
  readonly loadOrder: number;
}

export interface ConfigurationTemplateDefinition {
  readonly id: string;
  readonly value: unknown;
  readonly uri: string;
  readonly keyRange: TextRange;
  readonly entryRange: TextRange;
  readonly pack: PackSource;
}

export type ConfigurationSourceKind = "direct" | "template" | "factory";

export type ResourceKind =
  | "image"
  | "item"
  | "block"
  | "furniture"
  | "loot"
  | "vanilla-loot"
  | "equipment"
  | "jukebox-song"
  | "sound-event"
  | "recipe"
  | "category"
  | "emoji"
  | "painting"
  | "configured-feature"
  | "placed-feature"
  | "advancement";

export interface ConfigurationSource {
  readonly uri: string;
  readonly idRange: TextRange;
  readonly entryRange: TextRange;
  readonly fieldKeyRanges: ReadonlyMap<string, TextRange>;
  readonly fieldValueRanges: ReadonlyMap<string, TextRange>;
  readonly pack: PackSource;
  readonly kind: ConfigurationSourceKind;
  readonly sectionKey: string;
}

export interface OpaqueConfigurationSection {
  readonly sectionType: string;
  readonly sectionKey: string;
  readonly value: Readonly<Record<string, unknown>>;
  readonly source: ConfigurationSource;
}

export type WorkspaceCrossDomainReferenceKind =
  | "image"
  | "item"
  | "block"
  | "recipe"
  | "category"
  | "painting"
  | "configured-feature"
  | "placed-feature";

export interface WorkspaceCrossDomainReference {
  readonly kind: WorkspaceCrossDomainReferenceKind;
  readonly identifier: string;
  readonly valid: boolean;
  readonly uri: string;
  readonly range: TextRange;
}

export interface OpaqueIdDefinition {
  readonly kind: "block" | "furniture";
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly raw: Readonly<Record<string, unknown>>;
}

export interface ImageCandidateInput {
  readonly rawId: string;
  readonly value: unknown;
  readonly source: ConfigurationSource;
}

export interface ConfigurationCandidateInput {
  readonly kind: ResourceKind;
  readonly rawId: string;
  readonly value: unknown;
  readonly source: ConfigurationSource;
}
