import { Messages } from "../../messages.js";

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
  | "advancement";

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
  | "vanilla-loots"
  | "skip-optimization"
  | "configured-feature"
  | "placed-feature"
  | "paintings"
  | "advancements";

export interface CraftEngineSectionFamily {
  readonly canonical: CraftEngineCanonicalSectionType;
  readonly aliases: readonly string[];
  readonly domain: CraftEngineSectionDomain;
  readonly kind: CraftEngineSectionParserKind;
  readonly description: string;
  readonly idSection: boolean;
  readonly noOp: boolean;
  readonly dependencies: readonly CraftEngineCanonicalSectionType[];
  readonly order: number;
}

export interface CraftEngineRootSectionCompletion {
  readonly sectionType: string;
  readonly canonical: CraftEngineCanonicalSectionType;
  readonly description: string;
  readonly domain: CraftEngineSectionDomain;
  readonly kind: CraftEngineSectionParserKind;
  readonly alias: boolean;
  readonly noOp: boolean;
  readonly order: number;
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
    dependencies: [],
    order: 1,
  },
  {
    canonical: "config-factory",
    aliases: ["config_factory", "config-factories", "config_factories"],
    domain: "template",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0002,
    idSection: false,
    noOp: false,
    dependencies: ["templates"],
    order: 2,
  },
  {
    canonical: "global-variables",
    aliases: ["global-variable", "global_variables", "global_variable"],
    domain: "text",
    kind: "id-value",
    description: Messages.src.config.registry.sectionRegistry.text0003,
    idSection: false,
    noOp: false,
    dependencies: [],
    order: 3,
  },
  {
    canonical: "images",
    aliases: ["image"],
    domain: "font",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0004,
    idSection: true,
    noOp: false,
    dependencies: [],
    order: 4,
  },
  {
    canonical: "emojis",
    aliases: ["emoji"],
    domain: "font",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0005,
    idSection: true,
    noOp: false,
    dependencies: ["images"],
    order: 5,
  },
  {
    canonical: "equipments",
    aliases: ["equipment"],
    domain: "item",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0006,
    idSection: true,
    noOp: false,
    dependencies: [],
    order: 6,
  },
  {
    canonical: "items",
    aliases: ["item"],
    domain: "item",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0007,
    idSection: true,
    noOp: false,
    dependencies: ["equipments"],
    order: 7,
  },
  {
    canonical: "furniture",
    aliases: [],
    domain: "furniture",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0008,
    idSection: true,
    noOp: false,
    dependencies: ["items"],
    order: 8,
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
    dependencies: [],
    order: 9,
  },
  {
    canonical: "blocks",
    aliases: ["block"],
    domain: "block",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0010,
    idSection: true,
    noOp: false,
    dependencies: ["block-state-mappings", "items"],
    order: 10,
  },
  {
    canonical: "recipes",
    aliases: ["recipe"],
    domain: "recipe",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0011,
    idSection: true,
    noOp: false,
    dependencies: ["items"],
    order: 11,
  },
  {
    canonical: "categories",
    aliases: ["category"],
    domain: "item-browser",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0012,
    idSection: true,
    noOp: false,
    dependencies: ["items"],
    order: 12,
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
    dependencies: [],
    order: 13,
  },
  {
    canonical: "lang",
    aliases: ["language", "languages"],
    domain: "locale",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0014,
    idSection: false,
    noOp: false,
    dependencies: ["images"],
    order: 14,
  },
  {
    canonical: "sounds",
    aliases: ["sound"],
    domain: "sound",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0015,
    idSection: true,
    noOp: false,
    dependencies: [],
    order: 15,
  },
  {
    canonical: "jukebox-songs",
    aliases: ["jukebox-song", "jukebox_songs", "jukebox_song"],
    domain: "sound",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0016,
    idSection: true,
    noOp: false,
    dependencies: ["sounds"],
    order: 16,
  },
  {
    canonical: "loot",
    aliases: ["loots"],
    domain: "loot",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0017,
    idSection: true,
    noOp: false,
    dependencies: [],
    order: 17,
  },
  {
    canonical: "vanilla-loots",
    aliases: ["vanilla-loot", "vanilla_loots", "vanilla_loot"],
    domain: "loot",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0018,
    idSection: true,
    noOp: false,
    dependencies: ["loot"],
    order: 18,
  },
  {
    canonical: "skip-optimization",
    aliases: ["skip_optimization"],
    domain: "resource-pack",
    kind: "section",
    description: Messages.src.config.registry.sectionRegistry.text0019,
    idSection: false,
    noOp: false,
    dependencies: [],
    order: 19,
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
    dependencies: ["blocks"],
    order: 20,
  },
  {
    canonical: "placed-feature",
    aliases: ["placed-features", "placed_feature", "placed_features"],
    domain: "worldgen",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0021,
    idSection: true,
    noOp: false,
    dependencies: ["configured-feature"],
    order: 21,
  },
  {
    canonical: "paintings",
    aliases: ["painting"],
    domain: "painting",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0022,
    idSection: true,
    noOp: false,
    dependencies: [],
    order: 22,
  },
  {
    canonical: "advancements",
    aliases: ["advancement"],
    domain: "advancement",
    kind: "id-section",
    description: Messages.src.config.registry.sectionRegistry.text0023,
    idSection: true,
    noOp: true,
    dependencies: ["items", "blocks"],
    order: 23,
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
      order: family.order,
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
