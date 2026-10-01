import { Messages } from "../../messages.js";
import { configKeys } from "../../util/configKeys.js";

export type CraftEngineSectionDomain =
  | "template"
  | "text"
  | "font"
  | "item"
  | "furniture"
  | "block"
  | "recipe"
  | "item-browser"
  | "locale"
  | "sound"
  | "loot"
  | "resource-pack"
  | "worldgen"
  | "painting"
  | "advancement"
  | "entity"
  | "attribute"
  | "atlas";

export type CraftEngineSectionParserKind =
  | "id-section"
  | "id-value"
  | "section";

export type CraftEngineCanonicalSectionType =
  | "templates"
  | "config-factory"
  | "global-variables"
  | "images"
  | "emojis"
  | "equipments"
  | "items"
  | "furniture"
  | "block-state-mappings"
  | "blocks"
  | "recipes"
  | "categories"
  | "translations"
  | "lang"
  | "sounds"
  | "jukebox-songs"
  | "loot"
  | "loot-sources"
  | "skip-optimization"
  | "configured-feature"
  | "placed-feature"
  | "paintings"
  | "advancements"
  | "entities"
  | "attributes"
  | "attribute-operations"
  | "equipment-sets"
  | "damage-rules"
  | "atlases";

export interface CraftEngineSectionFamily {
  readonly canonical: CraftEngineCanonicalSectionType;
  readonly aliases: readonly string[];
  readonly domain: CraftEngineSectionDomain;
  readonly kind: CraftEngineSectionParserKind;
  readonly description: string;
  readonly idSection: boolean;
  readonly noOp: boolean;
}

export interface CraftEngineRootSectionCompletion {
  readonly sectionType: string;
  readonly canonical: CraftEngineCanonicalSectionType;
  readonly description: string;
  readonly domain: CraftEngineSectionDomain;
  readonly kind: CraftEngineSectionParserKind;
  readonly alias: boolean;
  readonly noOp: boolean;
}

export const CRAFTENGINE_SECTION_FAMILIES = [
  {
    canonical: "templates",
    aliases: ["template"],
    domain: "template",
    kind: "id-value",
    description: Messages.src.config.registry.sectionRegistry.text0001,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "config-factory",
    aliases: ["config_factory", "config-factories", "config_factories"],
    domain: "template",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0002,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "global-variables",
    aliases: ["global-variable", "global_variables", "global_variable"],
    domain: "text",
    kind: "id-value",
    description: Messages.src.config.registry.sectionRegistry.text0003,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "images",
    aliases: ["image"],
    domain: "font",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0004,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "emojis",
    aliases: ["emoji"],
    domain: "font",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0005,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "equipments",
    aliases: ["equipment"],
    domain: "item",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0006,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "items",
    aliases: ["item"],
    domain: "item",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0007,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "furniture",
    aliases: [],
    domain: "furniture",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0008,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "block-state-mappings",
    aliases: [
      "block-state-mapping",
      "block_state_mappings",
      "block_state_mapping",
    ],
    domain: "block",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0009,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "blocks",
    aliases: ["block"],
    domain: "block",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0010,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "recipes",
    aliases: ["recipe"],
    domain: "recipe",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0011,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "categories",
    aliases: ["category"],
    domain: "item-browser",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0012,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "translations",
    aliases: [
      "translation",
      "l10n",
      "localization",
      "i18n",
      "internationalization",
    ],
    domain: "locale",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0013,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "lang",
    aliases: ["language", "languages"],
    domain: "locale",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0014,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "sounds",
    aliases: ["sound"],
    domain: "sound",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0015,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "jukebox-songs",
    aliases: ["jukebox-song", "jukebox_songs", "jukebox_song"],
    domain: "sound",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0016,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "loot",
    aliases: ["loots"],
    domain: "loot",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0017,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "loot-sources",
    aliases: configKeys("loot_source(s)|vanilla_loot(s)").filter(
      (key) => key !== "loot-sources",
    ),
    domain: "loot",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0018,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "skip-optimization",
    aliases: ["skip_optimization"],
    domain: "resource-pack",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0019,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "configured-feature",
    aliases: [
      "configured-features",
      "configured_feature",
      "configured_features",
    ],
    domain: "worldgen",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0020,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "placed-feature",
    aliases: ["placed-features", "placed_feature", "placed_features"],
    domain: "worldgen",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0021,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "paintings",
    aliases: ["painting"],
    domain: "painting",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0022,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "advancements",
    aliases: ["advancement"],
    domain: "advancement",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0023,
    idSection: true,
    noOp: true,
  },
  {
    canonical: "entities",
    aliases: ["entity"],
    domain: "entity",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0024,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "attribute-operations",
    aliases: configKeys("attribute_operation(s)").filter(
      (key) => key !== "attribute-operations",
    ),
    domain: "attribute",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0025,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "attributes",
    aliases: ["attribute"],
    domain: "attribute",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0026,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "equipment-sets",
    aliases: configKeys("equipment_set(s)").filter(
      (key) => key !== "equipment-sets",
    ),
    domain: "attribute",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0027,
    idSection: true,
    noOp: false,
  },
  {
    canonical: "damage-rules",
    aliases: configKeys("damage_rule(s)").filter(
      (key) => key !== "damage-rules",
    ),
    domain: "attribute",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0028,
    idSection: false,
    noOp: false,
  },
  {
    canonical: "atlases",
    aliases: ["atlas"],
    domain: "atlas",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0029,
    idSection: true,
    noOp: false,
  },
] as const satisfies readonly CraftEngineSectionFamily[];

const FAMILY_BY_SECTION_TYPE: ReadonlyMap<string, CraftEngineSectionFamily> =
  new Map(
    CRAFTENGINE_SECTION_FAMILIES.flatMap((family) =>
      [family.canonical, ...family.aliases].map(
        (sectionType) => [sectionType, family] as const,
      ),
    ),
  );

export const CRAFTENGINE_ROOT_SECTION_COMPLETIONS: readonly CraftEngineRootSectionCompletion[] =
  CRAFTENGINE_SECTION_FAMILIES.flatMap((family) =>
    [family.canonical, ...family.aliases].map((sectionType) => ({
      sectionType,
      canonical: family.canonical,
      description: family.description,
      domain: family.domain,
      kind: family.kind,
      alias: sectionType !== family.canonical,
      noOp: family.noOp,
    })),
  );

// 这里只做完全相同的匹配, 改空格大小写或井号后缀会接受本来无效的写法
export function normalizeSectionType(
  sectionType: string,
): CraftEngineCanonicalSectionType | undefined {
  return FAMILY_BY_SECTION_TYPE.get(sectionType)?.canonical;
}

export function getSectionFamily(
  sectionType: string,
): CraftEngineSectionFamily | undefined {
  return FAMILY_BY_SECTION_TYPE.get(sectionType);
}
