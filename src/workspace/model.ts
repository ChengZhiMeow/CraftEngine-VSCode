import type { BlockDefinition } from "../config/block/model.js";
import type { EquipmentDefinition } from "../config/equipment/model.js";
import type { FurnitureDefinition } from "../config/furniture/model.js";
import type { ImageDefinition, ResolvedImage } from "../config/image/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import type { LootDefinition } from "../config/loot/model.js";
import type {
  ConfigurationTemplateDefinition,
  OpaqueConfigurationSection,
  ParsedYamlFile,
  WorkspaceCrossDomainReference,
} from "../config/model.js";
import type { GenericResourceDefinition } from "../config/resource/model.js";
import type { JukeboxSongDefinition } from "../config/jukebox/model.js";
import type {
  SoundDataReference,
  SoundEventDefinition,
} from "../config/sound/model.js";
import type { CoreIssue } from "../diagnostics/model.js";
import type { ResourceFileCatalog } from "../resources/model.js";
import type {
  BlueprintCatalog,
  BlueprintReference,
  ScriptCatalog,
  ScriptReference,
} from "../references/blueprintScript.js";

  // 按文档切分好的定义与引用, 供 provider 层的 xxxInDocument / xxxAt 直接取用
export interface WorkspaceDocumentIndex {
  readonly images: readonly ImageDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly blocks: readonly BlockDefinition[];
  readonly furniture: readonly FurnitureDefinition[];
  readonly equipments: readonly EquipmentDefinition[];
  readonly jukeboxSongs: readonly JukeboxSongDefinition[];
  readonly lootTables: readonly LootDefinition[];
  readonly genericResources: readonly GenericResourceDefinition[];
  readonly soundEvents: readonly SoundEventDefinition[];
  readonly soundDataReferences: readonly SoundDataReference[];
  readonly crossDomainReferences: readonly WorkspaceCrossDomainReference[];
  readonly blueprintReferences: readonly BlueprintReference[];
  readonly scriptReferences: readonly ScriptReference[];
}

export const EMPTY_DOCUMENT_INDEX: WorkspaceDocumentIndex = {
  images: [],
  items: [],
  blocks: [],
  furniture: [],
  equipments: [],
  jukeboxSongs: [],
  lootTables: [],
  genericResources: [],
  soundEvents: [],
  soundDataReferences: [],
  crossDomainReferences: [],
  blueprintReferences: [],
  scriptReferences: [],
};

export interface WorkspaceIndex {
  readonly templates: readonly ConfigurationTemplateDefinition[];
  readonly images: readonly ImageDefinition[];
  readonly resolved: ReadonlyMap<ImageDefinition, ResolvedImage>;
  readonly items: readonly ItemDefinition[];
  readonly equipments: readonly EquipmentDefinition[];
  readonly jukeboxSongs: readonly JukeboxSongDefinition[];
  readonly blocks: readonly BlockDefinition[];
  readonly soundEvents: readonly SoundEventDefinition[];
  readonly soundDataReferences: readonly SoundDataReference[];
  readonly furniture: readonly FurnitureDefinition[];
  readonly lootTables: readonly LootDefinition[];
  readonly genericResources: readonly GenericResourceDefinition[];
  readonly crossDomainReferences: readonly WorkspaceCrossDomainReference[];
  readonly opaqueSections: readonly OpaqueConfigurationSection[];
  readonly resources: ResourceFileCatalog;
  readonly scripts: ScriptCatalog;
  readonly blueprints: BlueprintCatalog;
  readonly blueprintReferences: readonly BlueprintReference[];
  readonly scriptReferences: readonly ScriptReference[];
  readonly documents: ReadonlyMap<string, WorkspaceDocumentIndex>;
  readonly issues: readonly CoreIssue[];
  readonly parsedFiles: ReadonlyMap<string, ParsedYamlFile>;
  readonly resourceRoots: readonly string[];
  readonly generation: number;
}
