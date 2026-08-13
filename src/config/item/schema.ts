import {
  dataComponentFields,
  dataComponentPathContext,
} from "./dataComponents.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import {
  NUMBER_PROVIDER_TYPES,
  numberProviderAllowsNestedField,
  numberProviderConsumer,
  numberProviderFields,
  resolveNumberProviderType,
} from "../number-provider/schema.js";
import { Messages } from "../../messages.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { schemaFieldForName } from "../schema/types.js";

export type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";

function field(
  label: string,
  detail: string,
  options: {
    readonly aliases?: readonly string[];
    readonly snippet?: string;
    readonly valueProvider?: SchemaValueProvider;
    readonly values?: readonly string[];
    readonly valueDetails?: Readonly<Record<string, string>>;
    readonly optionalDependency?: string;
    readonly registry?: string;
    readonly required?: boolean;
  } = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_").replace(/#.*$/u, ""),
    aliases: options.aliases ?? [],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.valueDetails === undefined
      ? {}
      : { valueDetails: options.valueDetails }),
    ...(options.optionalDependency === undefined
      ? {}
      : { optionalDependency: options.optionalDependency }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.required === undefined ? {} : { required: options.required }),
  };
}

const mapping = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    snippet: `${label}:\n  \${0}`,
  });
const list = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    snippet: `${label}:\n  - \${0}`,
  });
const bool = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    valueProvider: "boolean",
    values: ["true", "false"],
  });
const number = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    valueProvider: "number",
  });
const numberProvider = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
): SchemaField =>
  numberProviderConsumer(field(label, detail, { aliases, required }));

export const ITEM_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.item.schema.text0005),
  bool("debug", Messages.src.config.item.schema.text0006),
  field("material", Messages.src.config.item.schema.text0007, {
    valueProvider: "material",
  }),
  field("client_bound_material", Messages.src.config.item.schema.text0008, {
    aliases: ["client-bound-material"],
    valueProvider: "material",
    optionalDependency: "Premium",
  }),
  number("custom_model_data", Messages.src.config.item.schema.text0009, [
    "custom-model-data",
  ]),
  field("item_model", Messages.src.config.item.schema.text0010, {
    aliases: ["item-model"],
    valueProvider: "item-model",
  }),
  bool("client_bound_model", Messages.src.config.item.schema.text0011, [
    "client-bound-model",
  ]),
  field("model", Messages.src.config.item.schema.text0012, {
    aliases: ["models"],
    valueProvider: "model",
    snippet: "model:\n  type: ${1:minecraft:model}\n  path: ${0}",
  }),
  field("texture", Messages.src.config.item.schema.text0013, {
    aliases: ["textures"],
    valueProvider: "texture",
  }),
  mapping("legacy_model", Messages.src.config.item.schema.text0014, [
    "legacy-model",
  ]),
  mapping("data", Messages.src.config.item.schema.text0015),
  mapping("client_bound_data", Messages.src.config.item.schema.text0016, [
    "client-bound-data",
  ]),
  mapping("settings", Messages.src.config.item.schema.text0017),
  list("behaviors", Messages.src.config.item.schema.text0018, ["behavior"]),
  mapping("events", Messages.src.config.item.schema.text0019, ["event"]),
  mapping("updater", Messages.src.config.item.schema.text0020),
  field("category", Messages.src.config.item.schema.text0021, {
    valueProvider: "category-id",
  }),
  bool("skip_obfuscation", Messages.src.config.item.schema.text0022, [
    "skip-obfuscation",
  ]),
  bool("hand_animation_on_swap", Messages.src.config.item.schema.text0023, [
    "hand-animation-on-swap",
  ]),
  bool("oversized_in_gui", Messages.src.config.item.schema.text0024, [
    "oversized-in-gui",
  ]),
  number("swap_animation_scale", Messages.src.config.item.schema.text0025, [
    "swap-animation-scale",
  ]),
  field("template", Messages.src.config.item.schema.text0026, {
    aliases: ["templates"],
    valueProvider: "template",
  }),
  mapping("arguments", Messages.src.config.item.schema.text0027),
  mapping("overrides", Messages.src.config.item.schema.text0028),
  mapping("merges", Messages.src.config.item.schema.text0029),
];

export const ITEM_DATA_FIELDS: readonly SchemaField[] = [
  field("item_model", Messages.src.config.item.schema.text0030, {
    valueProvider: "item-model",
  }),
  mapping("arguments", Messages.src.config.item.schema.text0031),
  mapping("set_arguments", Messages.src.config.item.schema.text0032),
  field("get_arguments", Messages.src.config.item.schema.text0033),
  field("overwritable_item_model", Messages.src.config.item.schema.text0034, {
    valueProvider: "item-model",
  }),
  field("id", Messages.src.config.item.schema.text0035, {
    valueProvider: "item-id",
  }),
  list("hide_tooltip", Messages.src.config.item.schema.text0036),
  mapping("food", Messages.src.config.item.schema.text0037),
  mapping("external", Messages.src.config.item.schema.text0038),
  mapping("equippable", Messages.src.config.item.schema.text0039),
  field(
    "overwritable_equippable_asset_id",
    Messages.src.config.item.schema.text0040,
    { valueProvider: "equipment-id" },
  ),
  mapping("enchantments", Messages.src.config.item.schema.text0041),
  mapping("enchantment", Messages.src.config.item.schema.text0042),
  field("dyed_color", Messages.src.config.item.schema.text0043),
  field("display_name", Messages.src.config.item.schema.text0044),
  field("item_name", Messages.src.config.item.schema.text0045),
  field("custom_name", Messages.src.config.item.schema.text0046),
  numberProvider("custom_model_data", Messages.src.config.item.schema.text0047),
  numberProvider(
    "overwritable_custom_model_data",
    Messages.src.config.item.schema.text0048,
  ),
  mapping("components", Messages.src.config.item.schema.text0049),
  mapping("component", Messages.src.config.item.schema.text0050),
  list("attribute_modifiers", Messages.src.config.item.schema.text0051),
  list("attributes", Messages.src.config.item.schema.text0052),
  mapping("pdc", Messages.src.config.item.schema.text0053),
  field("overwritable_item_name", Messages.src.config.item.schema.text0054),
  field("jukebox_playable", Messages.src.config.item.schema.text0055, {
    valueProvider: "jukebox-song",
  }),
  list("remove_components", Messages.src.config.item.schema.text0056),
  list("remove_component", Messages.src.config.item.schema.text0057),
  mapping("tags", Messages.src.config.item.schema.text0058),
  mapping("nbt", Messages.src.config.item.schema.text0059),
  field("tooltip_style", Messages.src.config.item.schema.text0060, {
    valueProvider: "tooltip-style",
  }),
  mapping("trim", Messages.src.config.item.schema.text0061),
  list("lore", Messages.src.config.item.schema.text0062),
  bool("unbreakable", Messages.src.config.item.schema.text0063),
  mapping("dynamic_lore", Messages.src.config.item.schema.text0064),
  mapping("insert_lore", Messages.src.config.item.schema.text0065),
  mapping("remove_lore", Messages.src.config.item.schema.text0066),
  list("overwritable_lore", Messages.src.config.item.schema.text0067),
  numberProvider("max_damage", Messages.src.config.item.schema.text0068),
  mapping("block_state", Messages.src.config.item.schema.text0069),
  mapping("blockstate", Messages.src.config.item.schema.text0070),
  mapping("conditional", Messages.src.config.item.schema.text0071),
  mapping("condition", Messages.src.config.item.schema.text0072),
  mapping("profile", Messages.src.config.item.schema.text0073),
  field("overwritable_dyed_color", Messages.src.config.item.schema.text0074),
  mapping("use_remainder", Messages.src.config.item.schema.text0075),
  field("process_written_book_tags", Messages.src.config.item.schema.text0076),
  field("painting_variant", Messages.src.config.item.schema.text0077, {
    valueProvider: "painting-id",
  }),
];

export const ITEM_SETTING_FIELDS: readonly SchemaField[] = [
  mapping("repairable", Messages.src.config.item.schema.text0078),
  bool("enchantable", Messages.src.config.item.schema.text0079),
  number("keep_on_death_chance", Messages.src.config.item.schema.text0080, [
    "keep-on-death-chance",
  ]),
  number("destroy_on_death_chance", Messages.src.config.item.schema.text0081, [
    "destroy-on-death-chance",
  ]),
  bool("renameable", Messages.src.config.item.schema.text0082),
  field("drop_display", Messages.src.config.item.schema.text0083, {
    aliases: ["drop-display"],
  }),
  field("glow_color", Messages.src.config.item.schema.text0084, {
    aliases: ["glow-color"],
  }),
  list("anvil_repair_item", Messages.src.config.item.schema.text0085, [
    "anvil-repair-item",
  ]),
  number("fuel_time", Messages.src.config.item.schema.text0086, ["fuel-time"]),
  field("consume_replacement", Messages.src.config.item.schema.text0087, {
    aliases: ["consume-replacement"],
    valueProvider: "item-id",
  }),
  field("craft_remaining_item", Messages.src.config.item.schema.text0088, {
    aliases: ["craft-remaining-item"],
    valueProvider: "item-id",
  }),
  field("craft_remainder", Messages.src.config.item.schema.text0089, {
    aliases: ["craft-remainder"],
    valueProvider: "item-id",
  }),
  list("tags", Messages.src.config.item.schema.text0090),
  mapping("equippable", Messages.src.config.item.schema.text0091),
  mapping("equipment", Messages.src.config.item.schema.text0092),
  bool("can_place", Messages.src.config.item.schema.text0093, ["can-place"]),
  bool("trigger_advancement", Messages.src.config.item.schema.text0094, [
    "trigger-advancement",
  ]),
  bool("disable_vanilla_behavior", Messages.src.config.item.schema.text0095, [
    "disable-vanilla-behavior",
  ]),
  mapping("projectile", Messages.src.config.item.schema.text0096),
  number("compost_probability", Messages.src.config.item.schema.text0097, [
    "compost-probability",
  ]),
  bool("dyeable", Messages.src.config.item.schema.text0098),
  bool(
    "respect_repairable_component",
    Messages.src.config.item.schema.text0099,
    ["respect-repairable-component"],
  ),
  field("dye_color", Messages.src.config.item.schema.text0100, {
    aliases: ["dye-color"],
  }),
  field("firework_color", Messages.src.config.item.schema.text0101, {
    aliases: ["firework-color"],
  }),
  mapping("food", Messages.src.config.item.schema.text0102),
  list("invulnerable", Messages.src.config.item.schema.text0103),
  list("ingredient_substitute", Messages.src.config.item.schema.text0104, [
    "ingredient-substitute",
  ]),
  field("fuel_remainder", Messages.src.config.item.schema.text0105, {
    aliases: ["fuel-remainder"],
    valueProvider: "item-id",
  }),
  list("allowed_projectiles", Messages.src.config.item.schema.text0106, [
    "allowed-projectiles",
  ]),
  number("hat_height", Messages.src.config.item.schema.text0107, [
    "hat-height",
  ]),
];

export const CRAFT_REMAINDER_TYPES = [
  "fixed",
  "recipe_based",
  "hurt_and_break",
] as const;
export type CraftRemainderType = (typeof CRAFT_REMAINDER_TYPES)[number];

export const CRAFT_REMAINDER_TYPE_DETAILS: Readonly<
  Record<CraftRemainderType, string>
> = {
  fixed: Messages.src.config.item.schema.text0108,
  recipe_based: Messages.src.config.item.schema.text0109,
  hurt_and_break: Messages.src.config.item.schema.text0110,
};

const CRAFT_REMAINDER_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0111, {
    values: CRAFT_REMAINDER_TYPES,
    valueDetails: CRAFT_REMAINDER_TYPE_DETAILS,
    required: true,
  }),
];
const CRAFT_REMAINDER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "fixed",
    [
      field("item", Messages.src.config.item.schema.text0112, {
        valueProvider: "item-id",
        required: true,
      }),
      numberProvider("count", Messages.src.config.item.schema.text0113, [
        "amount",
      ]),
    ],
  ],
  [
    "hurt_and_break",
    [number("damage", Messages.src.config.item.schema.text0114)],
  ],
  [
    "recipe_based",
    [
      field("terms", Messages.src.config.item.schema.text0115, {
        snippet:
          "terms:\n  - recipes:\n      - ${1:namespace:recipe}\n    craft_remainder: ${0}",
        required: true,
      }),
      field("fallback", Messages.src.config.item.schema.text0116, {
        valueProvider: "item-id",
      }),
    ],
  ],
]);

const CRAFT_REMAINDER_TERM_FIELDS: readonly SchemaField[] = [
  field("recipes", Messages.src.config.item.schema.text0117, {
    valueProvider: "recipe-id",
    snippet: "recipes:\n  - ${0}",
    required: true,
  }),
  field("craft_remainder", Messages.src.config.item.schema.text0118, {
    aliases: [
      "craft_remaining_item",
      "craft-remainder",
      "craft-remaining-item",
    ],
    valueProvider: "item-id",
  }),
];

const SETTINGS_EQUIPMENT_FIELDS: readonly SchemaField[] = [
  field("asset_id", Messages.src.config.item.schema.text0119, {
    aliases: ["asset-id"],
    valueProvider: "equipment-id",
  }),
  field("slot", Messages.src.config.item.schema.text0120, {
    values: ["head", "chest", "legs", "feet", "mainhand", "offhand", "body"],
  }),
  bool("client_bound_model", Messages.src.config.item.schema.text0121, [
    "client-bound-model",
  ]),
  bool("dispensable", Messages.src.config.item.schema.text0122),
  bool("swappable", Messages.src.config.item.schema.text0123),
  bool("damage_on_hurt", Messages.src.config.item.schema.text0124, [
    "damage-on-hurt",
  ]),
  bool("equip_on_interact", Messages.src.config.item.schema.text0125, [
    "equip-on-interact",
  ]),
  bool("can_be_sheared", Messages.src.config.item.schema.text0126, [
    "can-be-sheared",
  ]),
  field("camera_overlay", Messages.src.config.item.schema.text0127, {
    aliases: ["camera-overlay"],
    valueProvider: "texture",
  }),
  field("equip_sound", Messages.src.config.item.schema.text0128, {
    aliases: ["equip-sound"],
    valueProvider: "sound",
  }),
  field("shearing_sound", Messages.src.config.item.schema.text0129, {
    aliases: ["shearing-sound"],
    valueProvider: "sound",
  }),
];

  // equippable 会直接创建或合并 equipment, 不会去顶层查找
const SETTINGS_EQUIPPABLE_FIELDS: readonly SchemaField[] = [
  field("asset_id", Messages.src.config.item.schema.text0130, {
    aliases: ["asset-id"],
  }),
  ...SETTINGS_EQUIPMENT_FIELDS.slice(1),
];

export const PROJECTILE_DISPLAY_FIELDS: readonly SchemaField[] = [
  field("item", Messages.src.config.item.schema.text0131, {
    valueProvider: "item-id",
    required: true,
  }),
  field("display_transform", Messages.src.config.item.schema.text0132, {
    aliases: ["display-transform"],
    values: [
      "none",
      "third_person_left_hand",
      "third_person_right_hand",
      "first_person_left_hand",
      "first_person_right_hand",
      "head",
      "gui",
      "ground",
      "fixed",
      "on_shelf",
    ],
  }),
  field("billboard", Messages.src.config.item.schema.text0133, {
    values: ["fixed", "vertical", "horizontal", "center"],
  }),
  field("scale", Messages.src.config.item.schema.text0134),
  field("translation", Messages.src.config.item.schema.text0135),
  field("rotation", Messages.src.config.item.schema.text0136),
];
const PROJECTILE_LEGACY_DISPLAY_FIELDS: readonly SchemaField[] = [
  field("item", Messages.src.config.item.schema.text0137, {
    valueProvider: "item-id",
  }),
  ...PROJECTILE_DISPLAY_FIELDS.slice(1),
];

const SETTINGS_NESTED_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "repairable",
    [
      bool("crafting_table", Messages.src.config.item.schema.text0138, [
        "crafting-table",
      ]),
      bool("anvil_repair", Messages.src.config.item.schema.text0139, [
        "anvil-repair",
      ]),
      bool("anvil_combine", Messages.src.config.item.schema.text0140, [
        "anvil-combine",
      ]),
    ],
  ],
  [
    "anvil_repair_item",
    [
      list("target", Messages.src.config.item.schema.text0141),
      number("amount", Messages.src.config.item.schema.text0142),
      number("percent", Messages.src.config.item.schema.text0143),
    ],
  ],
  [
    "food",
    [
      number("nutrition", Messages.src.config.item.schema.text0144),
      number("saturation", Messages.src.config.item.schema.text0145),
    ],
  ],
  [
    "projectile",
    [
      ...PROJECTILE_LEGACY_DISPLAY_FIELDS,
      field("gravity", Messages.src.config.item.schema.text0146, {
        values: ["true", "false", "undefined"],
      }),
      bool(
        "ignore_infinity_enchantment",
        Messages.src.config.item.schema.text0147,
        ["ignore-infinity-enchantment"],
      ),
      bool("remove_on_hit", Messages.src.config.item.schema.text0148, [
        "remove-on-hit",
      ]),
      bool("pickupable", Messages.src.config.item.schema.text0149),
      number("velocity", Messages.src.config.item.schema.text0150),
      number("damage", Messages.src.config.item.schema.text0151),
      number("pierce_level", Messages.src.config.item.schema.text0152, [
        "pierce-level",
      ]),
      mapping("sounds", Messages.src.config.item.schema.text0153),
      mapping("display", Messages.src.config.item.schema.text0154),
    ],
  ],
]);

const SOUND_DATA_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.item.schema.text0155, {
    valueProvider: "sound",
  }),
  numberProvider("volume", Messages.src.config.item.schema.text0156),
  numberProvider("pitch", Messages.src.config.item.schema.text0157),
];
const PROJECTILE_SOUND_FIELDS: readonly SchemaField[] = [
  field("throw", Messages.src.config.item.schema.text0158, {
    valueProvider: "sound",
  }),
  field("hit_entity", Messages.src.config.item.schema.text0159, {
    aliases: ["hit-entity"],
    valueProvider: "sound",
  }),
  field("hit_block", Messages.src.config.item.schema.text0160, {
    aliases: ["hit-block"],
    valueProvider: "sound",
  }),
];
const TARGET_SOUND_FIELDS: readonly SchemaField[] = [
  ...SOUND_DATA_FIELDS,
  field("default", Messages.src.config.item.schema.text0161, {
    valueProvider: "sound",
  }),
  mapping("overrides", Messages.src.config.item.schema.text0162),
];

export const ITEM_BEHAVIOR_TYPES = [
  "empty",
  "block_item",
  "liquid_collision_block_item",
  "furniture_item",
  "liquid_collision_furniture_item",
  "flint_and_steel_item",
  "compostable_item",
  "axe_item",
  "double_high_block_item",
  "wall_block_item",
  "ceiling_block_item",
  "ground_block_item",
  "multi_high_block_item",
  "range_mining_item",
] as const;

const ITEM_BEHAVIOR_TYPE_DETAILS = {
  empty: Messages.src.config.item.schema.text0163,
  block_item: Messages.src.config.item.schema.text0164,
  liquid_collision_block_item: Messages.src.config.item.schema.text0165,
  furniture_item: Messages.src.config.item.schema.text0166,
  liquid_collision_furniture_item: Messages.src.config.item.schema.text0167,
  flint_and_steel_item: Messages.src.config.item.schema.text0168,
  compostable_item: Messages.src.config.item.schema.text0169,
  axe_item: Messages.src.config.item.schema.text0170,
  double_high_block_item: Messages.src.config.item.schema.text0171,
  wall_block_item: Messages.src.config.item.schema.text0172,
  ceiling_block_item: Messages.src.config.item.schema.text0173,
  ground_block_item: Messages.src.config.item.schema.text0174,
  multi_high_block_item: Messages.src.config.item.schema.text0175,
  range_mining_item: Messages.src.config.item.schema.text0176,
} satisfies Readonly<Record<(typeof ITEM_BEHAVIOR_TYPES)[number], string>>;

const BEHAVIOR_FIELDS = new Map<string, readonly SchemaField[]>([
  ["empty", []],
  [
    "block_item",
    [
      field("block", Messages.src.config.item.schema.text0177, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "ground_block_item",
    [
      field("block", Messages.src.config.item.schema.text0178, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "wall_block_item",
    [
      field("block", Messages.src.config.item.schema.text0179, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "ceiling_block_item",
    [
      field("block", Messages.src.config.item.schema.text0180, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "double_high_block_item",
    [
      field("block", Messages.src.config.item.schema.text0181, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "multi_high_block_item",
    [
      field("block", Messages.src.config.item.schema.text0182, {
        valueProvider: "block-id",
        required: true,
      }),
    ],
  ],
  [
    "liquid_collision_block_item",
    [
      field("block", Messages.src.config.item.schema.text0183, {
        valueProvider: "block-id",
        required: true,
      }),
      number("y_offset", Messages.src.config.item.schema.text0184, [
        "y-offset",
      ]),
    ],
  ],
  ["furniture_item", furnitureBehaviorFields(false)],
  ["liquid_collision_furniture_item", furnitureBehaviorFields(true)],
  ["flint_and_steel_item", []],
  [
    "compostable_item",
    [number("chance", Messages.src.config.item.schema.text0185)],
  ],
  ["axe_item", []],
  [
    "range_mining_item",
    [
      list("conditions", Messages.src.config.item.schema.text0186, [
        "condition",
      ]),
      list("range", Messages.src.config.item.schema.text0187),
    ],
  ],
]);

function furnitureBehaviorFields(liquid: boolean): readonly SchemaField[] {
  return [
    field("furniture", Messages.src.config.item.schema.text0188, {
      valueProvider: "furniture-id",
      required: true,
    }),
    mapping("rules", Messages.src.config.item.schema.text0189),
    bool("ignore_placer", Messages.src.config.item.schema.text0190, [
      "ignore-placer",
    ]),
    bool("ignore_entities", Messages.src.config.item.schema.text0191, [
      "ignore-entities",
    ]),
    list("against_blocks", Messages.src.config.item.schema.text0192, [
      "against-blocks",
    ]),
    field("against_block_tags", Messages.src.config.item.schema.text0193, {
      aliases: ["against-block-tags"],
      valueProvider: "block-tag",
      snippet: "against_block_tags:\n  - ${0}",
    }),
    bool("blacklist", Messages.src.config.item.schema.text0194),
    ...(liquid
      ? [
          bool("source_only", Messages.src.config.item.schema.text0195, [
            "source-only",
          ]),
          field("liquid_type", Messages.src.config.item.schema.text0196, {
            aliases: ["liquid-type"],
            snippet: "liquid_type:\n  - ${1|water,lava|}",
          }),
        ]
      : []),
  ];
}

export const CONDITION_TYPES = [
  "has_player",
  "has_item",
  "match_item",
  "match_entity",
  "match_block",
  "match_block_property",
  "table_bonus",
  "survives_explosion",
  "any_of",
  "all_of",
  "enchantment",
  "inverted",
  "falling_block",
  "random",
  "distance",
  "permission",
  "equals",
  "string_equals",
  "regex",
  "string_contains",
  "expression",
  "is_null",
  "hand",
  "on_cooldown",
  "inventory_has_item",
  "match_furniture_variant",
  "is_bedrock_player",
  "test_flag",
  "worldguard:region",
] as const;

const CONDITION_TYPE_DETAILS = {
  has_player: Messages.src.config.item.schema.text0197,
  has_item: Messages.src.config.item.schema.text0198,
  match_item: Messages.src.config.item.schema.text0199,
  match_entity: Messages.src.config.item.schema.text0200,
  match_block: Messages.src.config.item.schema.text0201,
  match_block_property: Messages.src.config.item.schema.text0202,
  table_bonus: Messages.src.config.item.schema.text0203,
  survives_explosion: Messages.src.config.item.schema.text0204,
  any_of: Messages.src.config.item.schema.text0205,
  all_of: Messages.src.config.item.schema.text0206,
  enchantment: Messages.src.config.item.schema.text0207,
  inverted: Messages.src.config.item.schema.text0208,
  falling_block: Messages.src.config.item.schema.text0209,
  random: Messages.src.config.item.schema.text0210,
  distance: Messages.src.config.item.schema.text0211,
  permission: Messages.src.config.item.schema.text0212,
  equals: Messages.src.config.item.schema.text0213,
  string_equals: Messages.src.config.item.schema.text0214,
  regex: Messages.src.config.item.schema.text0215,
  string_contains: Messages.src.config.item.schema.text0216,
  expression: Messages.src.config.item.schema.text0217,
  is_null: Messages.src.config.item.schema.text0218,
  hand: Messages.src.config.item.schema.text0219,
  on_cooldown: Messages.src.config.item.schema.text0220,
  inventory_has_item: Messages.src.config.item.schema.text0221,
  match_furniture_variant: Messages.src.config.item.schema.text0222,
  is_bedrock_player: Messages.src.config.item.schema.text0223,
  test_flag: Messages.src.config.item.schema.text0224,
  "worldguard:region": Messages.src.config.item.schema.text0225,
} satisfies Readonly<Record<(typeof CONDITION_TYPES)[number], string>>;

const CONDITION_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "match_item",
    [
      field("id", Messages.src.config.item.schema.text0226, {
        aliases: ["item", "items"],
        required: true,
        snippet: "id:\n  - ${0}",
      }),
      bool("regex", Messages.src.config.item.schema.text0227),
    ],
  ],
  [
    "match_entity",
    [
      field("id", Messages.src.config.item.schema.text0228, {
        aliases: ["entity", "entities"],
        required: true,
        snippet: "id:\n  - ${0}",
      }),
      bool("regex", Messages.src.config.item.schema.text0229),
    ],
  ],
  [
    "match_block",
    [
      field("id", Messages.src.config.item.schema.text0230, {
        aliases: ["block", "blocks"],
        required: true,
        snippet: "id:\n  - ${0}",
      }),
      bool("regex", Messages.src.config.item.schema.text0231),
      numberProvider("x", Messages.src.config.item.schema.text0232),
      numberProvider("y", Messages.src.config.item.schema.text0233),
      numberProvider("z", Messages.src.config.item.schema.text0234),
    ],
  ],
  [
    "match_block_property",
    [
      field("properties", Messages.src.config.item.schema.text0235, {
        required: true,
        snippet: "properties:\n  ${0}",
      }),
    ],
  ],
  [
    "match_furniture_variant",
    [list("variant", Messages.src.config.item.schema.text0236, ["variants"])],
  ],
  [
    "enchantment",
    [
      field("predicate", Messages.src.config.item.schema.text0237, {
        required: true,
      }),
    ],
  ],
  [
    "table_bonus",
    [
      field("enchantment", Messages.src.config.item.schema.text0238, {
        valueProvider: "enchantment",
        required: true,
      }),
      field("chances", Messages.src.config.item.schema.text0239, {
        required: true,
        snippet: "chances:\n  - ${0}",
      }),
    ],
  ],
  [
    "permission",
    [
      field("permission", Messages.src.config.item.schema.text0240, {
        required: true,
      }),
    ],
  ],
  [
    "hand",
    [
      field("hand", Messages.src.config.item.schema.text0241, {
        values: ["main_hand", "off_hand"],
      }),
    ],
  ],
  [
    "on_cooldown",
    [field("id", Messages.src.config.item.schema.text0242, { required: true })],
  ],
  [
    "inventory_has_item",
    [
      field("id", Messages.src.config.item.schema.text0243, {
        aliases: ["item"],
        valueProvider: "item-id",
        required: true,
      }),
      numberProvider("count", Messages.src.config.item.schema.text0244, [
        "amount",
      ]),
    ],
  ],
  [
    "random",
    [
      numberProvider("value", Messages.src.config.item.schema.text0245),
      bool("use-last", Messages.src.config.item.schema.text0246, ["use_last"]),
    ],
  ],
  [
    "distance",
    [
      numberProvider("min", Messages.src.config.item.schema.text0247),
      numberProvider("max", Messages.src.config.item.schema.text0248),
    ],
  ],
  [
    "equals",
    [
      field("value1", Messages.src.config.item.schema.text0249, {
        required: true,
      }),
      field("value2", Messages.src.config.item.schema.text0250, {
        required: true,
      }),
    ],
  ],
  [
    "string_equals",
    [
      field("value1", Messages.src.config.item.schema.text0251, {
        required: true,
      }),
      field("value2", Messages.src.config.item.schema.text0252, {
        required: true,
      }),
    ],
  ],
  [
    "string_contains",
    [
      field("value1", Messages.src.config.item.schema.text0253, {
        required: true,
      }),
      field("value2", Messages.src.config.item.schema.text0254, {
        required: true,
      }),
    ],
  ],
  [
    "regex",
    [
      field("value", Messages.src.config.item.schema.text0255, {
        required: true,
      }),
      field("regex", Messages.src.config.item.schema.text0256, {
        required: true,
      }),
    ],
  ],
  [
    "expression",
    [
      field("expression", Messages.src.config.item.schema.text0257, {
        aliases: ["expr"],
        required: true,
      }),
    ],
  ],
  [
    "is_null",
    [
      field("argument", Messages.src.config.item.schema.text0258, {
        aliases: ["arg"],
        required: true,
      }),
    ],
  ],
  [
    "any_of",
    [list("terms", Messages.src.config.item.schema.text0259, ["term"])],
  ],
  [
    "all_of",
    [list("terms", Messages.src.config.item.schema.text0260, ["term"])],
  ],
  [
    "inverted",
    [list("terms", Messages.src.config.item.schema.text0261, ["term"])],
  ],
  [
    "test_flag",
    [
      field("flag", Messages.src.config.item.schema.text0262, {
        values: ["break", "place", "interact", "open_container"],
      }),
    ],
  ],
  [
    "worldguard:region",
    [
      number("mode", Messages.src.config.item.schema.text0263),
      list("regions", Messages.src.config.item.schema.text0264),
    ],
  ],
]);

export const FUNCTION_TYPES = [
  "command",
  "message",
  "actionbar",
  "title",
  "open_window",
  "close_inventory",
  "cancel_event",
  "run",
  "place_block",
  "update_block_property",
  "transform_block",
  "break_block",
  "update_interaction_tick",
  "set_count",
  "drop_loot",
  "swing_hand",
  "damage_item",
  "clear_item",
  "set_food",
  "set_saturation",
  "play_sound",
  "particle",
  "potion_effect",
  "remove_potion_effect",
  "leveler_exp",
  "set_cooldown",
  "set_item_cooldown",
  "remove_cooldown",
  "spawn_furniture",
  "remove_furniture",
  "replace_furniture",
  "rotate_furniture",
  "set_furniture_variant",
  "teleport",
  "set_variable",
  "toast",
  "damage",
  "heal",
  "merchant_trade",
  "remove_entity",
  "if_else",
  "alternatives",
  "when",
  "cycle_block_property",
  "set_exp",
  "set_level",
  "play_totem_animation",
  "mythic_mobs_skill",
  "cast_mythic_skill",
  "spawn_mythic_mob",
] as const;

const FUNCTION_TYPE_DETAILS = {
  command: Messages.src.config.item.schema.text0265,
  message: Messages.src.config.item.schema.text0266,
  actionbar: Messages.src.config.item.schema.text0267,
  title: Messages.src.config.item.schema.text0268,
  open_window: Messages.src.config.item.schema.text0269,
  close_inventory: Messages.src.config.item.schema.text0270,
  cancel_event: Messages.src.config.item.schema.text0271,
  run: Messages.src.config.item.schema.text0272,
  place_block: Messages.src.config.item.schema.text0273,
  update_block_property: Messages.src.config.item.schema.text0274,
  transform_block: Messages.src.config.item.schema.text0275,
  break_block: Messages.src.config.item.schema.text0276,
  update_interaction_tick: Messages.src.config.item.schema.text0277,
  set_count: Messages.src.config.item.schema.text0278,
  drop_loot: Messages.src.config.item.schema.text0279,
  swing_hand: Messages.src.config.item.schema.text0280,
  damage_item: Messages.src.config.item.schema.text0281,
  clear_item: Messages.src.config.item.schema.text0282,
  set_food: Messages.src.config.item.schema.text0283,
  set_saturation: Messages.src.config.item.schema.text0284,
  play_sound: Messages.src.config.item.schema.text0285,
  particle: Messages.src.config.item.schema.text0286,
  potion_effect: Messages.src.config.item.schema.text0287,
  remove_potion_effect: Messages.src.config.item.schema.text0288,
  leveler_exp: Messages.src.config.item.schema.text0289,
  set_cooldown: Messages.src.config.item.schema.text0290,
  set_item_cooldown: Messages.src.config.item.schema.text0291,
  remove_cooldown: Messages.src.config.item.schema.text0292,
  spawn_furniture: Messages.src.config.item.schema.text0293,
  remove_furniture: Messages.src.config.item.schema.text0294,
  replace_furniture: Messages.src.config.item.schema.text0295,
  rotate_furniture: Messages.src.config.item.schema.text0296,
  set_furniture_variant: Messages.src.config.item.schema.text0297,
  teleport: Messages.src.config.item.schema.text0298,
  set_variable: Messages.src.config.item.schema.text0299,
  toast: Messages.src.config.item.schema.text0300,
  damage: Messages.src.config.item.schema.text0301,
  heal: Messages.src.config.item.schema.text0302,
  merchant_trade: Messages.src.config.item.schema.text0303,
  remove_entity: Messages.src.config.item.schema.text0304,
  if_else: Messages.src.config.item.schema.text0305,
  alternatives: Messages.src.config.item.schema.text0306,
  when: Messages.src.config.item.schema.text0307,
  cycle_block_property: Messages.src.config.item.schema.text0308,
  set_exp: Messages.src.config.item.schema.text0309,
  set_level: Messages.src.config.item.schema.text0310,
  play_totem_animation: Messages.src.config.item.schema.text0311,
  mythic_mobs_skill: Messages.src.config.item.schema.text0312,
  cast_mythic_skill: Messages.src.config.item.schema.text0313,
  spawn_mythic_mob: Messages.src.config.item.schema.text0314,
} satisfies Readonly<Record<(typeof FUNCTION_TYPES)[number], string>>;

export const PLAYER_SELECTOR_TYPES = ["all", "self"] as const;

const PLAYER_SELECTOR_TYPE_DETAILS = {
  all: Messages.src.config.item.schema.text0315,
  self: Messages.src.config.item.schema.text0316,
  "craftengine:all": Messages.src.config.item.schema.text0317,
  "craftengine:self": Messages.src.config.item.schema.text0318,
} satisfies Readonly<Record<string, string>>;

const TARGET = field("target", Messages.src.config.item.schema.text0319, {
  values: ["self", "all", "@s", "@a"],
});
const RUNTIME_UNSAFE_TARGET = field(
  "target",
  Messages.src.config.item.schema.text0320,
  {
    values: ["self", "all", "@s", "@a"],
  },
);
const TARGET_MAPPING_FIELDS: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0321, {
    values: ["all", "self", "craftengine:all", "craftengine:self"],
    valueDetails: PLAYER_SELECTOR_TYPE_DETAILS,
    required: true,
  }),
];

const BLOCK_PARTICLE_DATA_FIELDS: readonly SchemaField[] = [
  field("blockstate", Messages.src.config.item.schema.text0322, {
    aliases: ["block_state", "block-state"],
    valueProvider: "block-state",
    required: true,
  }),
];
const PARTICLE_COLOR = (): SchemaField =>
  field("color", Messages.src.config.item.schema.text0323, { required: true });
const PARTICLE_TARGET_POSITION: readonly SchemaField[] = [
  numberProvider("target_x", Messages.src.config.item.schema.text0324, [
    "target-x",
  ]),
  numberProvider("target_y", Messages.src.config.item.schema.text0325, [
    "target-y",
  ]),
  numberProvider("target_z", Messages.src.config.item.schema.text0326, [
    "target-z",
  ]),
];
const PARTICLE_DATA_FIELDS = new Map<string, readonly SchemaField[]>([
  ["block", BLOCK_PARTICLE_DATA_FIELDS],
  ["falling_dust", BLOCK_PARTICLE_DATA_FIELDS],
  ["dust_pillar", BLOCK_PARTICLE_DATA_FIELDS],
  ["block_crumble", BLOCK_PARTICLE_DATA_FIELDS],
  ["block_marker", BLOCK_PARTICLE_DATA_FIELDS],
  ["entity_effect", [PARTICLE_COLOR()]],
  ["tinted_leaves", [PARTICLE_COLOR()]],
  [
    "sculk_charge",
    [number("roll", Messages.src.config.item.schema.text0327, ["charge"])],
  ],
  [
    "geyser",
    [
      number("blocks", Messages.src.config.item.schema.text0328, [
        "water_blocks",
        "water-blocks",
      ]),
    ],
  ],
  [
    "geyser_plume",
    [
      number("blocks", Messages.src.config.item.schema.text0329, [
        "water_blocks",
        "water-blocks",
      ]),
    ],
  ],
  [
    "geyser_base",
    [
      number("blocks", Messages.src.config.item.schema.text0330, [
        "water_blocks",
        "water-blocks",
      ]),
      number("base", Messages.src.config.item.schema.text0331, [
        "burst_impulse_base",
        "burst-impulse-base",
      ]),
    ],
  ],
  [
    "geyser_poof",
    [
      number("blocks", Messages.src.config.item.schema.text0332, [
        "water_blocks",
        "water-blocks",
      ]),
      number("base", Messages.src.config.item.schema.text0333, [
        "burst_impulse_base",
        "burst-impulse-base",
      ]),
    ],
  ],
  ["shriek", [number("shriek", Messages.src.config.item.schema.text0334)]],
  [
    "dust",
    [
      PARTICLE_COLOR(),
      number("scale", Messages.src.config.item.schema.text0335),
    ],
  ],
  [
    "dust_color_transition",
    [
      field("from", Messages.src.config.item.schema.text0336, {
        required: true,
      }),
      field("to", Messages.src.config.item.schema.text0337, { required: true }),
      number("scale", Messages.src.config.item.schema.text0338),
    ],
  ],
  [
    "item",
    [
      field("item", Messages.src.config.item.schema.text0339, {
        valueProvider: "item-id",
        required: true,
      }),
    ],
  ],
  [
    "vibration",
    [
      ...PARTICLE_TARGET_POSITION,
      numberProvider("arrival_time", Messages.src.config.item.schema.text0340, [
        "arrival-time",
      ]),
    ],
  ],
  [
    "trail",
    [
      ...PARTICLE_TARGET_POSITION,
      PARTICLE_COLOR(),
      numberProvider("duration", Messages.src.config.item.schema.text0341),
    ],
  ],
  [
    "spell",
    [
      PARTICLE_COLOR(),
      number("power", Messages.src.config.item.schema.text0342),
    ],
  ],
]);

export function particleDataFieldsForType(
  particle: string | undefined,
): readonly SchemaField[] {
  if (particle === undefined) {
    const result = new Map<string, SchemaField>();
    for (const fields of PARTICLE_DATA_FIELDS.values()) {
      for (const candidate of fields) result.set(candidate.semantic, candidate);
    }
    return [...result.values()];
  }
  const separator = particle.indexOf(":");
  if (separator >= 0 && particle.slice(0, separator) !== "minecraft") return [];
  const name = separator < 0 ? particle : particle.slice(separator + 1);
  return PARTICLE_DATA_FIELDS.get(name) ?? [];
}

const POSITION = [
  numberProvider("x", Messages.src.config.item.schema.text0343),
  numberProvider("y", Messages.src.config.item.schema.text0344),
  numberProvider("z", Messages.src.config.item.schema.text0345),
];
const FUNCTION_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "command",
    [
      field("command", Messages.src.config.item.schema.text0346, {
        aliases: ["commands"],
        required: true,
        snippet: "command:\n  - ${0}",
      }),
      bool("as_player", Messages.src.config.item.schema.text0347, [
        "as-player",
      ]),
      bool("as_event", Messages.src.config.item.schema.text0348, ["as-event"]),
      bool("as_op", Messages.src.config.item.schema.text0349, ["as-op"]),
      TARGET,
    ],
  ],
  [
    "message",
    [
      field("messages", Messages.src.config.item.schema.text0350, {
        aliases: ["message"],
        required: true,
        snippet: "messages:\n  - ${0}",
      }),
      bool("overlay", Messages.src.config.item.schema.text0351),
      TARGET,
    ],
  ],
  [
    "actionbar",
    [
      field("actionbar", Messages.src.config.item.schema.text0352, {
        aliases: ["message"],
        required: true,
      }),
      TARGET,
    ],
  ],
  [
    "title",
    [
      field("title", Messages.src.config.item.schema.text0353),
      field("subtitle", Messages.src.config.item.schema.text0354),
      numberProvider("fade_in", Messages.src.config.item.schema.text0355, [
        "fade-in",
      ]),
      numberProvider("stay", Messages.src.config.item.schema.text0356),
      numberProvider("fade_out", Messages.src.config.item.schema.text0357, [
        "fade-out",
      ]),
      TARGET,
    ],
  ],
  [
    "open_window",
    [
      field("gui_type", Messages.src.config.item.schema.text0358, {
        aliases: ["gui-type"],
        values: [
          "anvil",
          "cartography",
          "enchantment",
          "grindstone",
          "loom",
          "smithing",
          "crafting",
        ],
        required: true,
      }),
      field("title", Messages.src.config.item.schema.text0359),
      TARGET,
    ],
  ],
  ["close_inventory", [TARGET]],
  ["cancel_event", []],
  [
    "run",
    [
      list("functions", Messages.src.config.item.schema.text0360),
      numberProvider("delay", Messages.src.config.item.schema.text0361),
    ],
  ],
  [
    "place_block",
    [
      field("block_state", Messages.src.config.item.schema.text0362, {
        aliases: ["block-state"],
        required: true,
      }),
      ...POSITION,
      numberProvider("update_flags", Messages.src.config.item.schema.text0363, [
        "update-flags",
      ]),
    ],
  ],
  [
    "update_block_property",
    [
      field("properties", Messages.src.config.item.schema.text0364, {
        required: true,
        snippet: "properties:\n  ${0}",
      }),
      ...POSITION,
      numberProvider("update_flags", Messages.src.config.item.schema.text0365, [
        "update-flags",
      ]),
    ],
  ],
  [
    "transform_block",
    [
      field("block", Messages.src.config.item.schema.text0366, {
        valueProvider: "block-id",
        required: true,
      }),
      mapping("properties", Messages.src.config.item.schema.text0367),
      ...POSITION,
      numberProvider("update_flags", Messages.src.config.item.schema.text0368, [
        "update-flags",
      ]),
    ],
  ],
  ["break_block", [...POSITION]],
  ["update_interaction_tick", []],
  [
    "set_count",
    [
      numberProvider(
        "count",
        Messages.src.config.item.schema.text0369,
        ["amount"],
        true,
      ),
      bool("add", Messages.src.config.item.schema.text0370),
    ],
  ],
  [
    "swing_hand",
    [
      field("hand", Messages.src.config.item.schema.text0371, {
        values: ["main_hand", "off_hand"],
      }),
    ],
  ],
  [
    "drop_loot",
    [
      field("loot", Messages.src.config.item.schema.text0372, {
        aliases: ["loots"],
        valueProvider: "loot-id",
        snippet: "loot:\n  ${0}",
      }),
      bool("to_inventory", Messages.src.config.item.schema.text0373, [
        "to-inventory",
      ]),
      ...POSITION,
    ],
  ],
  [
    "damage_item",
    [
      numberProvider("amount", Messages.src.config.item.schema.text0374, [
        "damage",
      ]),
      field("slot", Messages.src.config.item.schema.text0375, {
        values: [
          "mainhand",
          "offhand",
          "feet",
          "legs",
          "chest",
          "head",
          "body",
          "saddle",
        ],
      }),
    ],
  ],
  [
    "clear_item",
    [
      field("item", Messages.src.config.item.schema.text0376, {
        aliases: ["id"],
        valueProvider: "item-id",
        required: true,
      }),
      numberProvider("count", Messages.src.config.item.schema.text0377, [
        "amount",
      ]),
    ],
  ],
  [
    "set_food",
    [
      numberProvider(
        "food",
        Messages.src.config.item.schema.text0378,
        [],
        true,
      ),
      bool("add", Messages.src.config.item.schema.text0379),
      TARGET,
    ],
  ],
  [
    "set_saturation",
    [
      numberProvider(
        "saturation",
        Messages.src.config.item.schema.text0380,
        [],
        true,
      ),
      bool("add", Messages.src.config.item.schema.text0381),
      TARGET,
    ],
  ],
  [
    "play_sound",
    [
      field("sound", Messages.src.config.item.schema.text0382, {
        valueProvider: "sound",
        required: true,
      }),
      field("source", Messages.src.config.item.schema.text0383),
      numberProvider("volume", Messages.src.config.item.schema.text0384),
      numberProvider("pitch", Messages.src.config.item.schema.text0385),
      TARGET,
      ...POSITION,
    ],
  ],
  [
    "particle",
    [
      field("particle", Messages.src.config.item.schema.text0386, {
        valueProvider: "particle",
        required: true,
      }),
      numberProvider("count", Messages.src.config.item.schema.text0387),
      numberProvider("offset_x", Messages.src.config.item.schema.text0388, [
        "offset-x",
      ]),
      numberProvider("offset_y", Messages.src.config.item.schema.text0389, [
        "offset-y",
      ]),
      numberProvider("offset_z", Messages.src.config.item.schema.text0390, [
        "offset-z",
      ]),
      numberProvider("speed", Messages.src.config.item.schema.text0391),
      ...POSITION,
    ],
  ],
  [
    "potion_effect",
    [
      field("potion_effect", Messages.src.config.item.schema.text0392, {
        aliases: ["potion-effect"],
        valueProvider: "effect",
        required: true,
      }),
      numberProvider("duration", Messages.src.config.item.schema.text0393),
      numberProvider("amplifier", Messages.src.config.item.schema.text0394),
      bool("ambient", Messages.src.config.item.schema.text0395),
      bool("particles", Messages.src.config.item.schema.text0396),
      bool("show_icon", Messages.src.config.item.schema.text0397, [
        "show-icon",
      ]),
      TARGET,
    ],
  ],
  [
    "remove_potion_effect",
    [
      field("potion_effect", Messages.src.config.item.schema.text0398, {
        aliases: ["potion-effect"],
        valueProvider: "effect",
      }),
      bool("all", Messages.src.config.item.schema.text0399),
      TARGET,
    ],
  ],
  [
    "leveler_exp",
    [
      field("plugin", Messages.src.config.item.schema.text0731, {
        required: true,
      }),
      field("leveler", Messages.src.config.item.schema.text0400, {
        aliases: ["skill", "job"],
        required: true,
      }),
      numberProvider(
        "count",
        Messages.src.config.item.schema.text0401,
        ["exp", "amount"],
        true,
      ),
      TARGET,
    ],
  ],
  [
    "set_cooldown",
    [
      field("id", Messages.src.config.item.schema.text0402, { required: true }),
      field("time", Messages.src.config.item.schema.text0403, {
        required: true,
      }),
      bool("add", Messages.src.config.item.schema.text0404),
      TARGET,
    ],
  ],
  [
    "set_item_cooldown",
    [
      field("id", Messages.src.config.item.schema.text0405, {
        valueProvider: "item-id",
        required: true,
      }),
      field("time", Messages.src.config.item.schema.text0406, {
        required: true,
      }),
      bool("add", Messages.src.config.item.schema.text0407),
      TARGET,
    ],
  ],
  [
    "remove_cooldown",
    [
      bool("all", Messages.src.config.item.schema.text0408),
      field("id", Messages.src.config.item.schema.text0409),
      TARGET,
    ],
  ],
  [
    "spawn_furniture",
    [
      field("furniture_id", Messages.src.config.item.schema.text0410, {
        aliases: ["furniture-id", "furniture", "id"],
        valueProvider: "furniture-id",
        required: true,
      }),
      field("variant", Messages.src.config.item.schema.text0411, {
        aliases: ["anchor_type", "anchor-type"],
        required: true,
      }),
      ...POSITION,
      numberProvider("pitch", Messages.src.config.item.schema.text0412),
      numberProvider("yaw", Messages.src.config.item.schema.text0413),
      bool("play_sound", Messages.src.config.item.schema.text0414, [
        "play-sound",
      ]),
    ],
  ],
  [
    "remove_furniture",
    [
      bool("play_sound", Messages.src.config.item.schema.text0415, [
        "play-sound",
      ]),
      bool("drop_loot", Messages.src.config.item.schema.text0416, [
        "drop-loot",
      ]),
    ],
  ],
  [
    "replace_furniture",
    [
      field("furniture_id", Messages.src.config.item.schema.text0417, {
        aliases: ["furniture-id", "furniture", "id"],
        valueProvider: "furniture-id",
        required: true,
      }),
      field("variant", Messages.src.config.item.schema.text0418, {
        aliases: ["anchor_type", "anchor-type"],
        required: true,
      }),
      ...POSITION,
      numberProvider("pitch", Messages.src.config.item.schema.text0419),
      numberProvider("yaw", Messages.src.config.item.schema.text0420),
      bool("drop_loot", Messages.src.config.item.schema.text0421, [
        "drop-loot",
      ]),
      bool("play_sound", Messages.src.config.item.schema.text0422, [
        "play-sound",
      ]),
    ],
  ],
  [
    "rotate_furniture",
    [
      numberProvider("degree", Messages.src.config.item.schema.text0423),
      list("on_success", Messages.src.config.item.schema.text0424, [
        "on-success",
      ]),
      list("on_failure", Messages.src.config.item.schema.text0425, [
        "on-failure",
      ]),
    ],
  ],
  [
    "set_furniture_variant",
    [
      field("variant", Messages.src.config.item.schema.text0426, {
        aliases: ["anchor_type", "anchor-type"],
        required: true,
      }),
    ],
  ],
  [
    "teleport",
    [
      field("world", Messages.src.config.item.schema.text0427),
      ...POSITION.map((candidate) => ({ ...candidate, required: true })),
      numberProvider("pitch", Messages.src.config.item.schema.text0428),
      numberProvider("yaw", Messages.src.config.item.schema.text0429),
      TARGET,
    ],
  ],
  [
    "set_variable",
    [
      field("name", Messages.src.config.item.schema.text0430, {
        aliases: ["var"],
        required: true,
      }),
      numberProvider("number", Messages.src.config.item.schema.text0431),
      field("text", Messages.src.config.item.schema.text0432),
      bool("as_int", Messages.src.config.item.schema.text0433, ["as-int"]),
    ],
  ],
  [
    "toast",
    [
      field("item", Messages.src.config.item.schema.text0434, {
        aliases: ["icon"],
        valueProvider: "item-id",
        required: true,
      }),
      field("toast", Messages.src.config.item.schema.text0435, {
        aliases: ["message"],
        required: true,
      }),
      field("advancement_type", Messages.src.config.item.schema.text0436, {
        aliases: ["advancement-type"],
        values: ["task", "challenge", "goal"],
      }),
      TARGET,
    ],
  ],
  [
    "damage",
    [
      numberProvider("amount", Messages.src.config.item.schema.text0437, [
        "damage",
      ]),
      field("damage_type", Messages.src.config.item.schema.text0438, {
        aliases: ["damage-type"],
        valueProvider: "damage-type",
      }),
      TARGET,
    ],
  ],
  [
    "heal",
    [
      numberProvider("amount", Messages.src.config.item.schema.text0439, [
        "heal",
      ]),
      TARGET,
    ],
  ],
  [
    "merchant_trade",
    [
      field("title", Messages.src.config.item.schema.text0440),
      list("offers", Messages.src.config.item.schema.text0441, ["offer"]),
      TARGET,
    ],
  ],
  ["remove_entity", []],
  [
    "if_else",
    [list("rules", Messages.src.config.item.schema.text0442, ["rule"])],
  ],
  [
    "alternatives",
    [list("rules", Messages.src.config.item.schema.text0443, ["rule"])],
  ],
  [
    "when",
    [
      field("source", Messages.src.config.item.schema.text0444, {
        required: true,
      }),
      list("cases", Messages.src.config.item.schema.text0445, ["case"]),
      list("fallback", Messages.src.config.item.schema.text0446),
    ],
  ],
  [
    "cycle_block_property",
    [
      field("property", Messages.src.config.item.schema.text0447, {
        required: true,
      }),
      mapping("rules", Messages.src.config.item.schema.text0448),
      numberProvider("inverse", Messages.src.config.item.schema.text0449),
      ...POSITION,
      numberProvider("update_flags", Messages.src.config.item.schema.text0450, [
        "update-flags",
      ]),
    ],
  ],
  [
    "set_exp",
    [
      numberProvider(
        "exp",
        Messages.src.config.item.schema.text0451,
        ["count", "value"],
        true,
      ),
      bool("add", Messages.src.config.item.schema.text0452),
      RUNTIME_UNSAFE_TARGET,
    ],
  ],
  [
    "set_level",
    [
      numberProvider(
        "level",
        Messages.src.config.item.schema.text0453,
        ["count"],
        true,
      ),
      bool("add", Messages.src.config.item.schema.text0454),
      TARGET,
    ],
  ],
  [
    "play_totem_animation",
    [
      field("item", Messages.src.config.item.schema.text0455, {
        valueProvider: "item-id",
        required: true,
      }),
      field("sound", Messages.src.config.item.schema.text0456, {
        valueProvider: "sound",
      }),
      numberProvider("volume", Messages.src.config.item.schema.text0457),
      numberProvider("pitch", Messages.src.config.item.schema.text0458),
      bool("silent", Messages.src.config.item.schema.text0459),
      RUNTIME_UNSAFE_TARGET,
    ],
  ],
  [
    "mythic_mobs_skill",
    [
      field("skill", Messages.src.config.item.schema.text0460, {
        required: true,
      }),
      numberProvider("power", Messages.src.config.item.schema.text0461),
    ],
  ],
  [
    "cast_mythic_skill",
    [
      field("skill", Messages.src.config.item.schema.text0462, {
        required: true,
      }),
      numberProvider("power", Messages.src.config.item.schema.text0463),
    ],
  ],
  [
    "spawn_mythic_mob",
    [
      field("mob", Messages.src.config.item.schema.text0464, {
        required: true,
      }),
      numberProvider("level", Messages.src.config.item.schema.text0465),
      field("world", Messages.src.config.item.schema.text0466),
      ...POSITION,
      numberProvider("pitch", Messages.src.config.item.schema.text0467),
      numberProvider("yaw", Messages.src.config.item.schema.text0468),
    ],
  ],
]);

export function particleConfigFieldsForType(
  particle: string | undefined,
): readonly SchemaField[] {
  return mergedFields(
    FUNCTION_FIELDS.get("particle") ?? [],
    particleDataFieldsForType(particle),
  );
}

export const ITEM_MODEL_TYPES = [
  "minecraft:empty",
  "minecraft:model",
  "minecraft:composite",
  "minecraft:condition",
  "minecraft:range_dispatch",
  "minecraft:select",
  "minecraft:special",
  "minecraft:bundle/selected_item",
] as const;
const ITEM_MODEL_TYPE_DETAILS = {
  "minecraft:empty": Messages.src.config.item.schema.text0469,
  "minecraft:model": Messages.src.config.item.schema.text0470,
  "minecraft:composite": Messages.src.config.item.schema.text0471,
  "minecraft:condition": Messages.src.config.item.schema.text0472,
  "minecraft:range_dispatch": Messages.src.config.item.schema.text0473,
  "minecraft:select": Messages.src.config.item.schema.text0474,
  "minecraft:special": Messages.src.config.item.schema.text0475,
  "minecraft:bundle/selected_item": Messages.src.config.item.schema.text0476,
} satisfies Readonly<Record<(typeof ITEM_MODEL_TYPES)[number], string>>;
export const MODEL_CONDITION_PROPERTIES = [
  "minecraft:broken",
  "minecraft:bundle/has_selected_item",
  "minecraft:carried",
  "minecraft:component",
  "minecraft:damaged",
  "minecraft:extended_view",
  "minecraft:fishing_rod/cast",
  "minecraft:has_component",
  "minecraft:keybind_down",
  "minecraft:selected",
  "minecraft:using_item",
  "minecraft:view_entity",
  "minecraft:custom_model_data",
] as const;
export const MODEL_RANGE_PROPERTIES = [
  "minecraft:bundle/fullness",
  "minecraft:compass",
  "minecraft:cooldown",
  "minecraft:count",
  "minecraft:crossbow/pull",
  "minecraft:damage",
  "minecraft:time",
  "minecraft:use_cycle",
  "minecraft:use_duration",
  "minecraft:custom_model_data",
] as const;
export const MODEL_SELECT_PROPERTIES = [
  "minecraft:block_state",
  "minecraft:charge_type",
  "minecraft:component",
  "minecraft:context_dimension",
  "minecraft:context_entity_type",
  "minecraft:display_context",
  "minecraft:local_time",
  "minecraft:main_hand",
  "minecraft:trim_material",
  "minecraft:custom_model_data",
] as const;
export const MODEL_TINT_TYPES = [
  "minecraft:constant",
  "minecraft:custom_model_data",
  "minecraft:dye",
  "minecraft:firework",
  "minecraft:grass",
  "minecraft:map_color",
  "minecraft:potion",
  "minecraft:team",
] as const;
const MODEL_TINT_TYPE_DETAILS = {
  "minecraft:constant": Messages.src.config.item.schema.text0477,
  "minecraft:custom_model_data": Messages.src.config.item.schema.text0478,
  "minecraft:dye": Messages.src.config.item.schema.text0479,
  "minecraft:firework": Messages.src.config.item.schema.text0480,
  "minecraft:grass": Messages.src.config.item.schema.text0481,
  "minecraft:map_color": Messages.src.config.item.schema.text0482,
  "minecraft:potion": Messages.src.config.item.schema.text0483,
  "minecraft:team": Messages.src.config.item.schema.text0484,
} satisfies Readonly<Record<(typeof MODEL_TINT_TYPES)[number], string>>;
export const SPECIAL_MODEL_TYPES = [
  "minecraft:banner",
  "minecraft:bed",
  "minecraft:bell",
  "minecraft:book",
  "minecraft:chest",
  "minecraft:conduit",
  "minecraft:copper_golem_statue",
  "minecraft:decorated_pot",
  "minecraft:end_cube",
  "minecraft:head",
  "minecraft:hanging_sign",
  "minecraft:player_head",
  "minecraft:shield",
  "minecraft:shulker_box",
  "minecraft:standing_sign",
  "minecraft:trident",
] as const;
const SPECIAL_MODEL_TYPE_DETAILS = {
  "minecraft:banner": Messages.src.config.item.schema.text0485,
  "minecraft:bed": Messages.src.config.item.schema.text0486,
  "minecraft:bell": Messages.src.config.item.schema.text0487,
  "minecraft:book": Messages.src.config.item.schema.text0488,
  "minecraft:chest": Messages.src.config.item.schema.text0489,
  "minecraft:conduit": Messages.src.config.item.schema.text0490,
  "minecraft:copper_golem_statue": Messages.src.config.item.schema.text0491,
  "minecraft:decorated_pot": Messages.src.config.item.schema.text0492,
  "minecraft:end_cube": Messages.src.config.item.schema.text0493,
  "minecraft:head": Messages.src.config.item.schema.text0494,
  "minecraft:hanging_sign": Messages.src.config.item.schema.text0495,
  "minecraft:player_head": Messages.src.config.item.schema.text0496,
  "minecraft:shield": Messages.src.config.item.schema.text0497,
  "minecraft:shulker_box": Messages.src.config.item.schema.text0498,
  "minecraft:standing_sign": Messages.src.config.item.schema.text0499,
  "minecraft:trident": Messages.src.config.item.schema.text0500,
} satisfies Readonly<Record<(typeof SPECIAL_MODEL_TYPES)[number], string>>;

const ITEM_MODEL_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0501, {
    valueProvider: "item-model-type",
    values: ITEM_MODEL_TYPES,
    valueDetails: ITEM_MODEL_TYPE_DETAILS,
  }),
];
const ITEM_MODEL_FIELDS = new Map<string, readonly SchemaField[]>([
  ["empty", []],
  [
    "model",
    [
      field("path", Messages.src.config.item.schema.text0502, {
        aliases: ["model"],
        valueProvider: "model",
        required: true,
      }),
      list("tints", Messages.src.config.item.schema.text0503),
      mapping("generation", Messages.src.config.item.schema.text0504),
      mapping("transformation", Messages.src.config.item.schema.text0505),
    ],
  ],
  [
    "composite",
    [
      list("models", Messages.src.config.item.schema.text0506),
      mapping("transformation", Messages.src.config.item.schema.text0507),
    ],
  ],
  [
    "condition",
    [
      field("property", Messages.src.config.item.schema.text0508, {
        values: MODEL_CONDITION_PROPERTIES,
        required: true,
      }),
      field("on_true", Messages.src.config.item.schema.text0509, {
        aliases: ["on-true"],
        required: true,
        snippet: "on_true:\n  ${0}",
      }),
      field("on_false", Messages.src.config.item.schema.text0510, {
        aliases: ["on-false"],
        required: true,
        snippet: "on_false:\n  ${0}",
      }),
      mapping("transformation", Messages.src.config.item.schema.text0511),
    ],
  ],
  [
    "range_dispatch",
    [
      field("property", Messages.src.config.item.schema.text0512, {
        values: MODEL_RANGE_PROPERTIES,
        required: true,
      }),
      number("scale", Messages.src.config.item.schema.text0513),
      mapping("fallback", Messages.src.config.item.schema.text0514),
      field("entries", Messages.src.config.item.schema.text0515, {
        required: true,
        snippet: "entries:\n  - threshold: ${1:0}\n    model: ${0}",
      }),
      mapping("transformation", Messages.src.config.item.schema.text0516),
    ],
  ],
  [
    "select",
    [
      field("property", Messages.src.config.item.schema.text0517, {
        values: MODEL_SELECT_PROPERTIES,
        required: true,
      }),
      mapping("fallback", Messages.src.config.item.schema.text0518),
      field("cases", Messages.src.config.item.schema.text0519, {
        required: true,
        snippet: "cases:\n  - when: ${1}\n    model: ${0}",
      }),
      mapping("transformation", Messages.src.config.item.schema.text0520),
    ],
  ],
  [
    "special",
    [
      field("base", Messages.src.config.item.schema.text0521, {
        aliases: ["path"],
        valueProvider: "model",
        required: true,
      }),
      field("model", Messages.src.config.item.schema.text0732, {
        required: true,
        snippet: "model:\n  type: ${0:minecraft:chest}",
      }),
      mapping("generation", Messages.src.config.item.schema.text0522),
      mapping("transformation", Messages.src.config.item.schema.text0523),
    ],
  ],
  ["bundle/selected_item", []],
]);

const MODEL_CONDITION_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "component",
    [
      field("predicate", Messages.src.config.item.schema.text0524, {
        required: true,
      }),
      field("value", Messages.src.config.item.schema.text0525, {
        required: true,
      }),
    ],
  ],
  [
    "has_component",
    [
      field("component", Messages.src.config.item.schema.text0526, {
        valueProvider: "component",
        required: true,
      }),
      bool("ignore_default", Messages.src.config.item.schema.text0527, [
        "ignore-default",
      ]),
    ],
  ],
  [
    "keybind_down",
    [
      field("keybind", Messages.src.config.item.schema.text0528, {
        required: true,
      }),
    ],
  ],
  [
    "custom_model_data",
    [number("index", Messages.src.config.item.schema.text0529)],
  ],
]);

const MODEL_RANGE_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "compass",
    [
      field("target", Messages.src.config.item.schema.text0530, {
        required: true,
      }),
      bool("wobble", Messages.src.config.item.schema.text0531),
    ],
  ],
  ["count", [bool("normalize", Messages.src.config.item.schema.text0532)]],
  ["damage", [bool("normalize", Messages.src.config.item.schema.text0533)]],
  [
    "time",
    [
      field("source", Messages.src.config.item.schema.text0534, {
        required: true,
      }),
      bool("wobble", Messages.src.config.item.schema.text0535),
    ],
  ],
  ["use_cycle", [number("source", Messages.src.config.item.schema.text0536)]],
  [
    "use_duration",
    [bool("remaining", Messages.src.config.item.schema.text0537)],
  ],
  [
    "custom_model_data",
    [number("index", Messages.src.config.item.schema.text0538)],
  ],
]);

const MODEL_SELECT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "block_state",
    [
      field("block_state_property", Messages.src.config.item.schema.text0539, {
        aliases: ["block-state-property"],
        required: true,
      }),
    ],
  ],
  [
    "component",
    [
      field("component", Messages.src.config.item.schema.text0540, {
        valueProvider: "component",
        required: true,
      }),
    ],
  ],
  [
    "local_time",
    [
      field("pattern", Messages.src.config.item.schema.text0541, {
        required: true,
      }),
      field("locale", Messages.src.config.item.schema.text0542),
      field("time-zone", Messages.src.config.item.schema.text0543, {
        aliases: ["time_zone"],
      }),
    ],
  ],
  [
    "custom_model_data",
    [number("index", Messages.src.config.item.schema.text0544)],
  ],
]);

const MODEL_TINT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "constant",
    [
      field("value", Messages.src.config.item.schema.text0545, {
        aliases: ["default"],
      }),
    ],
  ],
  [
    "custom_model_data",
    [
      field("default", Messages.src.config.item.schema.text0546, {
        aliases: ["value"],
      }),
      number("index", Messages.src.config.item.schema.text0547),
    ],
  ],
  [
    "dye",
    [
      field("default", Messages.src.config.item.schema.text0548, {
        aliases: ["value"],
      }),
    ],
  ],
  [
    "firework",
    [
      field("default", Messages.src.config.item.schema.text0549, {
        aliases: ["value"],
      }),
    ],
  ],
  [
    "grass",
    [
      number("temperature", Messages.src.config.item.schema.text0550),
      number("downfall", Messages.src.config.item.schema.text0551),
    ],
  ],
  [
    "map_color",
    [
      field("default", Messages.src.config.item.schema.text0552, {
        aliases: ["value"],
      }),
    ],
  ],
  [
    "potion",
    [
      field("default", Messages.src.config.item.schema.text0553, {
        aliases: ["value"],
      }),
    ],
  ],
  [
    "team",
    [
      field("default", Messages.src.config.item.schema.text0554, {
        aliases: ["value"],
      }),
    ],
  ],
]);

const SPECIAL_MODEL_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "banner",
    [
      field("color", Messages.src.config.item.schema.text0555, {
        required: true,
      }),
    ],
  ],
  [
    "bed",
    [
      field("part", Messages.src.config.item.schema.text0556, {
        values: ["head", "foot"],
        required: true,
      }),
      field("texture", Messages.src.config.item.schema.text0557, {
        valueProvider: "texture",
        required: true,
      }),
    ],
  ],
  ["bell", []],
  [
    "book",
    [
      number("open_angle", Messages.src.config.item.schema.text0558, [
        "open-angle",
      ]),
      number("page1", Messages.src.config.item.schema.text0559),
      number("page2", Messages.src.config.item.schema.text0560),
    ],
  ],
  [
    "chest",
    [
      field("texture", Messages.src.config.item.schema.text0561, {
        valueProvider: "texture",
        required: true,
      }),
      number("openness", Messages.src.config.item.schema.text0562),
      field("chest_type", Messages.src.config.item.schema.text0563, {
        aliases: ["chest-type"],
      }),
    ],
  ],
  ["conduit", []],
  [
    "copper_golem_statue",
    [
      field("pose", Messages.src.config.item.schema.text0564, {
        required: true,
      }),
      field("texture", Messages.src.config.item.schema.text0565, {
        valueProvider: "texture",
        required: true,
      }),
    ],
  ],
  ["decorated_pot", []],
  [
    "end_cube",
    [
      field("effect", Messages.src.config.item.schema.text0566, {
        required: true,
      }),
    ],
  ],
  [
    "head",
    [
      field("kind", Messages.src.config.item.schema.text0567, {
        required: true,
      }),
      field("texture", Messages.src.config.item.schema.text0568, {
        valueProvider: "texture",
      }),
      number("animation", Messages.src.config.item.schema.text0569),
    ],
  ],
  [
    "hanging_sign",
    [
      field("wood_type", Messages.src.config.item.schema.text0570, {
        aliases: ["wood-type"],
        required: true,
      }),
      field("attachment", Messages.src.config.item.schema.text0571),
      field("texture", Messages.src.config.item.schema.text0572, {
        valueProvider: "texture",
      }),
    ],
  ],
  ["player_head", []],
  ["shield", []],
  [
    "shulker_box",
    [
      field("texture", Messages.src.config.item.schema.text0573, {
        valueProvider: "texture",
        required: true,
      }),
      number("openness", Messages.src.config.item.schema.text0574),
      field("orientation", Messages.src.config.item.schema.text0575, {
        values: ["down", "up", "north", "south", "west", "east"],
      }),
    ],
  ],
  [
    "standing_sign",
    [
      field("wood_type", Messages.src.config.item.schema.text0576, {
        aliases: ["wood-type"],
        required: true,
      }),
      field("attachment", Messages.src.config.item.schema.text0577),
      field("texture", Messages.src.config.item.schema.text0578, {
        valueProvider: "texture",
      }),
    ],
  ],
  ["trident", []],
]);

const MODEL_GENERATION_FIELDS: readonly SchemaField[] = [
  field("parent", Messages.src.config.item.schema.text0579, {
    valueProvider: "model",
    required: true,
  }),
  mapping("textures", Messages.src.config.item.schema.text0580),
  mapping("display", Messages.src.config.item.schema.text0581),
  field("gui_light", Messages.src.config.item.schema.text0582, {
    aliases: ["gui-light"],
    values: ["front", "side"],
  }),
  bool("ambientocclusion", Messages.src.config.item.schema.text0583, [
    "ambient-occlusion",
    "ambient_occlusion",
  ]),
];

export const ITEM_GENERATION_TEXTURE_KEY_FIELD: SchemaField = field(
  "<texture-slot>",
  Messages.src.config.item.schema.text0584,
  { snippet: "${1:layer0}: ${0}" },
);

export const ITEM_GENERATION_TEXTURE_VALUE_FIELD: SchemaField = {
  ...ITEM_GENERATION_TEXTURE_KEY_FIELD,
  valueProvider: "texture",
};

export function itemGenerationTextureMapping(path: readonly string[]): boolean {
  const nested = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  const generation = nested.lastIndexOf("generation");
  return (
    generation >= 0 &&
    ["model", "models", "legacy_model"].includes(nested[0] ?? "") &&
    nested.length === generation + 2 &&
    nested[generation + 1] === "textures"
  );
}

const MODEL_TRANSFORMATION_FIELDS: readonly SchemaField[] = [
  field("right_rotation", Messages.src.config.item.schema.text0585, {
    aliases: ["right-rotation"],
  }),
  field("left_rotation", Messages.src.config.item.schema.text0586, {
    aliases: ["left-rotation"],
  }),
  field("scale", Messages.src.config.item.schema.text0587),
  field("translation", Messages.src.config.item.schema.text0588),
];

const DISPLAY_TRANSFORM_FIELDS: readonly SchemaField[] = [
  field("rotation", Messages.src.config.item.schema.text0589),
  field("translation", Messages.src.config.item.schema.text0590),
  field("scale", Messages.src.config.item.schema.text0591),
];

const DISPLAY_CONTEXT_FIELDS: readonly SchemaField[] = [
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "firstperson_righthand",
  "firstperson_lefthand",
  "gui",
  "head",
  "ground",
  "fixed",
  "on_shelf",
].map((name) => mapping(name, Messages.src.config.item.schema.text0592));

export const ITEM_DYNAMIC_LORE_CONTEXT_KEY_FIELD: SchemaField = field(
  "<display-context>",
  Messages.src.config.item.schema.text0593,
  {
    values: [
      "default",
      "gui",
      "firstperson_righthand",
      "firstperson_lefthand",
      "thirdperson_righthand",
      "thirdperson_lefthand",
      "head",
      "ground",
      "fixed",
      "on_shelf",
      "shop",
    ],
    snippet: "${1:default}:\n  - ${0}",
  },
);

export const ITEM_DYNAMIC_LORE_CONTEXT_VALUE_FIELD: SchemaField = field(
  "<lore>",
  Messages.src.config.item.schema.text0594,
  { snippet: "${1:default}:\n  - ${0}" },
);

export const EVENT_TRIGGERS = [
  "left_click",
  "right_click",
  "use_on",
  "use",
  "use_item_on",
  "attack",
  "hit",
  "eat",
  "consume",
  "drink",
  "break",
  "dig",
  "place",
  "build",
  "pick_up",
  "pick",
  "step",
  "fall",
  "shoot",
] as const;

const DATA_NESTED = new Map<string, readonly SchemaField[]>([
  [
    "food",
    [
      number("nutrition", Messages.src.config.item.schema.text0595),
      number("saturation", Messages.src.config.item.schema.text0596),
      bool("can_always_eat", Messages.src.config.item.schema.text0597, [
        "can-always-eat",
      ]),
    ],
  ],
  [
    "external",
    [
      field("plugin", Messages.src.config.item.schema.text0598, {
        aliases: ["source"],
        required: true,
        values: [
          "advanceditems",
          "azureflow",
          "baikiruto",
          "crazyvouchers",
          "customcrafting",
          "customfishing",
          "dragonarmourers",
          "emakiitem",
          "executableblocks",
          "executableitems",
          "hmccosmetics",
          "headdatabase",
          "itemedit",
          "itemsadder",
          "itemsxl",
          "mmoitems",
          "magicgem",
          "mythicmobs",
          "neigeitems",
          "nexo",
          "nova",
          "oraxen",
          "pxrpg",
          "ratziel",
          "sxitem",
          "sertraline",
          "slimefun",
          "zaphkiel",
        ],
        valueDetails: {
          advanceditems: "AdvancedItems",
          azureflow: "AzureFlow",
          baikiruto: "Baikiruto",
          crazyvouchers: "CrazyVouchers",
          customcrafting: "CustomCrafting",
          customfishing: "CustomFishing",
          dragonarmourers: "DragonArmourers",
          emakiitem: "EmakiItem",
          executableblocks: "ExecutableBlocks",
          executableitems: "ExecutableItems",
          hmccosmetics: "HMCCosmetics",
          headdatabase: "HeadDatabase",
          itemedit: "ItemEdit",
          itemsadder: "ItemsAdder",
          itemsxl: "ItemsXL",
          mmoitems: "MMOItems",
          magicgem: "MagicGem",
          mythicmobs: "MythicMobs",
          neigeitems: "NeigeItems",
          nexo: "Nexo",
          nova: "Nova",
          oraxen: "Oraxen",
          pxrpg: "PxRpg",
          ratziel: "Ratziel",
          sxitem: "SXItem",
          sertraline: "Sertraline",
          slimefun: "Slimefun",
          zaphkiel: "Zaphkiel",
        },
      }),
      field("id", Messages.src.config.item.schema.text0599, { required: true }),
    ],
  ],
  [
    "equippable",
    [
      field("slot", Messages.src.config.item.schema.text0600, {
        values: [
          "mainhand",
          "main_hand",
          "hand",
          "offhand",
          "off_hand",
          "feet",
          "boots",
          "boot",
          "shoes",
          "legs",
          "leg",
          "leggings",
          "chest",
          "chestplate",
          "head",
          "helmet",
          "hat",
          "body",
          "saddle",
        ],
        required: true,
      }),
      field("asset_id", Messages.src.config.item.schema.text0601, {
        aliases: ["asset-id"],
        valueProvider: "equipment-id",
      }),
      field("camera_overlay", Messages.src.config.item.schema.text0602, {
        aliases: ["camera-overlay"],
        valueProvider: "texture",
      }),
      bool("dispensable", Messages.src.config.item.schema.text0603),
      bool("swappable", Messages.src.config.item.schema.text0604),
      bool("damage_on_hurt", Messages.src.config.item.schema.text0605, [
        "damage-on-hurt",
      ]),
      bool("equip_on_interact", Messages.src.config.item.schema.text0606, [
        "equip-on-interact",
      ]),
      bool("can_be_sheared", Messages.src.config.item.schema.text0607, [
        "can-be-sheared",
      ]),
      field("equip_sound", Messages.src.config.item.schema.text0608, {
        aliases: ["equip-sound"],
        valueProvider: "sound",
      }),
      field("shearing_sound", Messages.src.config.item.schema.text0609, {
        aliases: ["shearing-sound"],
        valueProvider: "sound",
      }),
    ],
  ],
  [
    "attribute_modifiers",
    [
      field("type", Messages.src.config.item.schema.text0610, {
        aliases: ["attribute"],
        valueProvider: "attribute",
        required: true,
      }),
      field("id", Messages.src.config.item.schema.text0611),
      numberProvider(
        "amount",
        Messages.src.config.item.schema.text0612,
        [],
        true,
      ),
      field("operation", Messages.src.config.item.schema.text0613, {
        values: ["add_value", "add_multiplied_base", "add_multiplied_total"],
      }),
      field("slot", Messages.src.config.item.schema.text0614, {
        values: [
          "any",
          "mainhand",
          "main_hand",
          "offhand",
          "off_hand",
          "hand",
          "feet",
          "boots",
          "boot",
          "shoes",
          "legs",
          "leg",
          "leggings",
          "chest",
          "chestplate",
          "head",
          "helmet",
          "hat",
          "armor",
          "body",
          "saddle",
        ],
        required: true,
      }),
      mapping("display", Messages.src.config.item.schema.text0615),
    ],
  ],
  [
    "trim",
    [
      field("material", Messages.src.config.item.schema.text0616, {
        valueProvider: "registry",
        registry: "minecraft:trim_material",
        required: true,
      }),
      field("pattern", Messages.src.config.item.schema.text0617, {
        valueProvider: "registry",
        registry: "minecraft:trim_pattern",
        required: true,
      }),
    ],
  ],
  [
    "profile",
    [
      field("base64", Messages.src.config.item.schema.text0618),
      field("url", Messages.src.config.item.schema.text0619),
      field("texture", Messages.src.config.item.schema.text0620, {
        valueProvider: "texture",
      }),
      field("name", Messages.src.config.item.schema.text0621),
    ],
  ],
  [
    "conditional",
    [
      list("conditions", Messages.src.config.item.schema.text0622, [
        "condition",
      ]),
      field("data", Messages.src.config.item.schema.text0623, {
        required: true,
        snippet: "data:\n  ${0}",
      }),
    ],
  ],
  [
    "use_remainder",
    [
      field("id", Messages.src.config.item.schema.text0624, {
        valueProvider: "item-id",
        required: true,
      }),
      number("count", Messages.src.config.item.schema.text0625),
    ],
  ],
]);

const ATTRIBUTE_DISPLAY_FIELDS: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0626, {
    values: ["default", "hidden", "override"],
    required: true,
  }),
  field("value", Messages.src.config.item.schema.text0627),
];

const LORE_MODIFICATION_FIELDS: readonly SchemaField[] = [
  list("content", Messages.src.config.item.schema.text0628),
  field("operation", Messages.src.config.item.schema.text0629, {
    values: ["append", "prepend"],
    valueDetails: {
      append: Messages.src.config.item.schema.text0630,
      prepend: Messages.src.config.item.schema.text0631,
    },
  }),
  number("priority", Messages.src.config.item.schema.text0632),
  bool("split_lines", Messages.src.config.item.schema.text0633, [
    "split-lines",
  ]),
  list("conditions", Messages.src.config.item.schema.text0634),
];

const INSERT_LORE_FIELDS: readonly SchemaField[] = [
  list("lore", Messages.src.config.item.schema.text0635),
  field("position", Messages.src.config.item.schema.text0636, {
    values: ["head", "tail", "before", "after"],
    valueDetails: {
      head: Messages.src.config.item.schema.text0637,
      tail: Messages.src.config.item.schema.text0638,
      before: Messages.src.config.item.schema.text0639,
      after: Messages.src.config.item.schema.text0640,
    },
  }),
  field("pattern", Messages.src.config.item.schema.text0641),
  mapping("fallback", Messages.src.config.item.schema.text0642),
];

const ENCHANTMENT_FIELDS: readonly SchemaField[] = [
  bool("merge", Messages.src.config.item.schema.text0643),
  mapping("enchantments", Messages.src.config.item.schema.text0644),
];

const SOUND_EVENT_FIELDS: readonly SchemaField[] = [
  field("sound_id", Messages.src.config.item.schema.text0645, {
    aliases: ["sound-id"],
    valueProvider: "sound",
    required: true,
  }),
  number("range", Messages.src.config.item.schema.text0646),
];

const ITEM_DATA_PROCESSOR_FAMILIES = new Map<string, string>([
  ["set_arguments", "arguments"],
  ["enchantment", "enchantments"],
  ["display_name", "item_name"],
  ["component", "components"],
  ["attributes", "attribute_modifiers"],
  ["remove_component", "remove_components"],
  ["nbt", "tags"],
  ["blockstate", "block_state"],
  ["condition", "conditional"],
]);

function itemDataProcessorFamily(name: string | undefined): string | undefined {
  return name === undefined
    ? undefined
    : (ITEM_DATA_PROCESSOR_FAMILIES.get(name) ?? name);
}

function localItemRegistryName(name: string): string | undefined {
  return localRegistryDiscriminator(
    name.replace(/#.*$/u, "").replaceAll("-", "_"),
    "craftengine",
  );
}

export function itemDataProcessorField(name: string): SchemaField | undefined {
  const local = localItemRegistryName(name);
  const selected =
    local === undefined
      ? undefined
      : ITEM_DATA_FIELDS.find((candidate) => candidate.label === local);
  if (selected === undefined || name === selected.label) return selected;
  // 处理器的不同写法可以同时存在, 不要合并
  return { ...selected, semantic: name };
}

export function itemSettingField(name: string): SchemaField | undefined {
  const local = localItemRegistryName(name);
  const selected =
    local === undefined
      ? undefined
      : ITEM_SETTING_FIELDS.find((candidate) => candidate.label === local);
  if (selected === undefined || name === selected.label) return selected;
  return { ...selected, semantic: name };
}

export function itemSchemaFieldForName(
  context: SchemaContext,
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  const parent = context.path
    .slice(1)
    .map((entry) => entry.replaceAll("-", "_"))
    .at(-1);
  if (parent === "data" || parent === "client_bound_data")
    return itemDataProcessorField(name);
  if (parent === "settings") return itemSettingField(name);
  return schemaFieldForName(name, fields);
}

export function resolveFunctionOrConditionType(
  kind: "function" | "condition",
  value: string | undefined,
): Readonly<{ name: string; external: boolean }> | undefined {
  if (!value) return undefined;
  const normalized = kind === "condition" ? value.replace(/^!/u, "") : value;
  const known = kind === "function" ? FUNCTION_TYPES : CONDITION_TYPES;
  const local = localRegistryDiscriminator(normalized);
  if (local !== undefined && (known as readonly string[]).includes(local))
    return { name: local, external: false };
  return {
    name: local ?? normalized,
    external: isValidRegistryDiscriminator(normalized),
  };
}

const NEGATED_CONDITION_TYPES = CONDITION_TYPES.map((value) => `!${value}`);
const CONDITION_VALUE_DETAILS: Readonly<Record<string, string>> = {
  ...CONDITION_TYPE_DETAILS,
  ...Object.fromEntries(
    CONDITION_TYPES.map((value) => [
      `!${value}`,
      Messages.src.config.item.schema.text0647(CONDITION_TYPE_DETAILS[value]),
    ]),
  ),
};
const CONDITION_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0648, {
    valueProvider: "condition-type",
    values: [...CONDITION_TYPES, ...NEGATED_CONDITION_TYPES],
    valueDetails: CONDITION_VALUE_DETAILS,
    required: true,
  }),
];
const FUNCTION_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.item.schema.text0649, {
    valueProvider: "function-type",
    values: FUNCTION_TYPES,
    valueDetails: FUNCTION_TYPE_DETAILS,
    required: true,
  }),
  list("condition", Messages.src.config.item.schema.text0650, ["conditions"]),
];

function mergedFields(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const result = new Map<string, SchemaField>();
  for (const fieldGroup of groups)
    for (const candidate of fieldGroup)
      result.set(candidate.semantic, candidate);
  return [...result.values()];
}

function conditionFields(type: string | undefined): readonly SchemaField[] {
  const resolved = resolveFunctionOrConditionType("condition", type);
  return resolved?.external
    ? []
    : typedFieldsExact(CONDITION_COMMON, CONDITION_FIELDS, resolved?.name);
}

function functionFields(
  type: string | undefined,
  particle?: string,
): readonly SchemaField[] {
  const resolved = resolveFunctionOrConditionType("function", type);
  if (resolved?.external) return [];
  const base = typedFieldsExact(
    FUNCTION_COMMON,
    FUNCTION_FIELDS,
    resolved?.name,
  );
  return resolved?.name === "particle"
    ? mergedFields(base, particleDataFieldsForType(particle))
    : base;
}

function modelFields(
  type: string | undefined,
  property: string | undefined,
): readonly SchemaField[] {
  // 遇到外部插件的类型时, 不要补里面的字段
  const nodeType = localRegistryDiscriminator(type, "minecraft");
  if (type !== undefined && nodeType === undefined) return [];
  const base = typedFields(
    ITEM_MODEL_COMMON,
    ITEM_MODEL_FIELDS,
    type,
    "minecraft",
  );
  const propertyType = localRegistryDiscriminator(property, "minecraft");
  if (nodeType === "condition")
    return mergedFields(
      base,
      MODEL_CONDITION_FIELDS.get(propertyType ?? "") ?? [],
    );
  if (nodeType === "range_dispatch")
    return mergedFields(base, MODEL_RANGE_FIELDS.get(propertyType ?? "") ?? []);
  if (nodeType === "select")
    return mergedFields(
      base,
      MODEL_SELECT_FIELDS.get(propertyType ?? "") ?? [],
    );
  return base;
}

function typedFields(
  common: readonly SchemaField[],
  table: ReadonlyMap<string, readonly SchemaField[]>,
  selected: string | undefined,
  namespace: "craftengine" | "minecraft" = "craftengine",
): readonly SchemaField[] {
  if (selected !== undefined) {
    const name = localRegistryDiscriminator(
      selected.replace(/^!/u, ""),
      namespace,
    );
    return name === undefined ? [] : [...common, ...(table.get(name) ?? [])];
  }
  const result = new Map<string, SchemaField>();
  for (const candidate of [...common, ...[...table.values()].flat()])
    result.set(candidate.semantic, candidate);
  return [...result.values()];
}

function typedFieldsExact(
  common: readonly SchemaField[],
  table: ReadonlyMap<string, readonly SchemaField[]>,
  selected: string | undefined,
): readonly SchemaField[] {
  if (selected !== undefined)
    return [...common, ...(table.get(selected) ?? [])];
  const result = new Map<string, SchemaField>();
  for (const candidate of [...common, ...[...table.values()].flat()])
    result.set(candidate.semantic, candidate);
  return [...result.values()];
}

function registryTypeKnown(
  value: string,
  namespace: "craftengine" | "minecraft",
  known: readonly string[],
): boolean {
  const normalized = value.replace(/^!/u, "");
  if (known.includes(normalized)) return true;
  const local = localRegistryDiscriminator(normalized, namespace);
  if (local === undefined) return false;
  return known.some(
    (candidate) =>
      candidate === local ||
      localRegistryDiscriminator(candidate, namespace) === local,
  );
}

  // 遇到没见过的类型时, 里面的 type 不能再套用内置规则
function opaqueRegistryAncestor(
  context: SchemaContext,
  namespace: "craftengine" | "minecraft",
  known: readonly string[],
  oldestOnly = false,
): boolean {
  const ancestors = context.ancestorTypes ?? [];
  const candidates =
    oldestOnly && ancestors.length > 0 ? [ancestors.at(-1)!] : ancestors;
  return candidates.some((type) => !registryTypeKnown(type, namespace, known));
}

const UPDATER_TYPES = ["apply_data", "transmute", "reset"] as const;
const UPDATER_TYPE_DETAILS = {
  apply_data: Messages.src.config.item.schema.text0651,
  transmute: Messages.src.config.item.schema.text0652,
  reset: Messages.src.config.item.schema.text0653,
} satisfies Readonly<Record<(typeof UPDATER_TYPES)[number], string>>;
const UPDATER_COMMON = [
  field("type", Messages.src.config.item.schema.text0654, {
    values: UPDATER_TYPES,
    valueDetails: UPDATER_TYPE_DETAILS,
  }),
] as const;
const UPDATER_FIELDS = new Map<string, readonly SchemaField[]>([
  ["apply_data", [mapping("data", Messages.src.config.item.schema.text0655)]],
  [
    "transmute",
    [
      field("material", Messages.src.config.item.schema.text0656, {
        valueProvider: "material",
      }),
    ],
  ],
  [
    "reset",
    [
      field("keep_components", Messages.src.config.item.schema.text0657, {
        aliases: ["keep-components"],
        valueProvider: "component",
        snippet: "keep_components:\n  - ${0}",
      }),
      list("keep_tags", Messages.src.config.item.schema.text0658, [
        "keep-tags",
      ]),
    ],
  ],
]);

function itemDataFields(
  nested: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] {
  const routed = normalizedItemDataPath(["item", ...nested]);
  if (routed.length === 1) return ITEM_DATA_FIELDS;
  const componentContext = dataComponentPathContext(routed);
  if (componentContext) {
    return componentContext.componentId === undefined
      ? []
      : dataComponentFields(
          componentContext.componentId,
          componentContext.payloadPath,
          context,
        );
  }
  if (
    routed
      .slice(2)
      .some(
        (entry) =>
          entry === "conditions" ||
          entry === "condition" ||
          entry === "terms" ||
          entry === "term",
      )
  ) {
    if (
      opaqueRegistryAncestor(context, "craftengine", [
        ...CONDITION_TYPES,
        ...NUMBER_PROVIDER_TYPES,
      ])
    )
      return [];
    return conditionFields(context.siblingValues.get("type"));
  }
  const conditionalIndex = routed.findIndex(
    (entry) => entry === "conditional" || entry === "condition",
  );
  if (
    conditionalIndex >= 0 &&
    routed.slice(conditionalIndex + 1).includes("data")
  )
    return ITEM_DATA_FIELDS;
  const processor = itemDataProcessorFamily(routed[1]?.replace(/#.*$/u, ""));
  if (processor === "lore" || processor === "overwritable_lore")
    return LORE_MODIFICATION_FIELDS;
  if (processor === "dynamic_lore")
    return routed.length >= 3 ? LORE_MODIFICATION_FIELDS : [];
  if (processor === "insert_lore") {
    if (routed.includes("lore")) return LORE_MODIFICATION_FIELDS;
    return INSERT_LORE_FIELDS;
  }
  if (processor === "remove_lore")
    return [field("pattern", Messages.src.config.item.schema.text0659)];
  if (processor === "enchantments" || processor === "enchantment")
    return ENCHANTMENT_FIELDS;
  if (processor === "attribute_modifiers" && routed.at(-1) === "display")
    return ATTRIBUTE_DISPLAY_FIELDS;
  if (
    processor === "equippable" &&
    ["equip_sound", "shearing_sound"].includes(routed.at(-1) ?? "")
  )
    return SOUND_EVENT_FIELDS;
  return DATA_NESTED.get(processor ?? "") ?? [];
}

export function itemDataDynamicKeyField(
  context: SchemaContext,
): SchemaField | undefined {
  if (itemGenerationTextureMapping(context.path))
    return ITEM_GENERATION_TEXTURE_KEY_FIELD;
  const nested = normalizedItemDataPath(context.path);
  if (!["data", "client_bound_data"].includes(nested[0] ?? ""))
    return undefined;
  if (nested.length === 2 && nested[1] === "dynamic_lore")
    return ITEM_DYNAMIC_LORE_CONTEXT_KEY_FIELD;
  if (!["enchantments", "enchantment"].includes(nested[1] ?? ""))
    return undefined;
  if (nested.length === 2) {
    if (
      context.siblingValues.has("merge") ||
      context.siblingValues.has("enchantments")
    )
      return undefined;
  } else if (!(nested.length === 3 && nested[2] === "enchantments"))
    return undefined;
  return field(
    Messages.src.config.item.schema.text0660,
    Messages.src.config.item.schema.text0661,
    { valueProvider: "enchantment" },
  );
}

export function itemDataListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const fullPath = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  if (fullPath[0] === "updater" && fullPath.includes("keep_components")) {
    return field(
      Messages.src.config.item.schema.text0662,
      Messages.src.config.item.schema.text0663,
      { valueProvider: "component" },
    );
  }
  const nested = normalizedItemDataPath(path);
  if (!["data", "client_bound_data"].includes(nested[0] ?? ""))
    return undefined;
  const processor = nested[1];
  if (
    processor === "hide_tooltip" ||
    processor === "remove_components" ||
    processor === "remove_component"
  ) {
    return field(
      Messages.src.config.item.schema.text0664,
      processor === "hide_tooltip"
        ? Messages.src.config.item.schema.text0665
        : Messages.src.config.item.schema.text0666,
      { valueProvider: "component" },
    );
  }
  return undefined;
}

export function itemListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const nested = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  const tail = nested.at(-1);
  if (tail === "category") {
    return field(
      Messages.src.config.item.schema.text0667,
      Messages.src.config.item.schema.text0668,
      { valueProvider: "category-id" },
    );
  }
  if (
    tail === "recipes" &&
    nested.some((entry) => CRAFT_REMAINDER_KEYS.has(entry))
  ) {
    return field(
      Messages.src.config.item.schema.text0669,
      Messages.src.config.item.schema.text0670,
      { valueProvider: "recipe-id" },
    );
  }
  if (
    (tail === "fallback" || CRAFT_REMAINDER_KEYS.has(tail ?? "")) &&
    nested[0] === "settings"
  ) {
    return field(
      Messages.src.config.item.schema.text0671,
      Messages.src.config.item.schema.text0672,
      { valueProvider: "item-id" },
    );
  }
  if (nested.at(-1) === "against_block_tags") {
    return field(
      Messages.src.config.item.schema.text0673,
      Messages.src.config.item.schema.text0674,
      { valueProvider: "block-tag" },
    );
  }
  if (nested.at(-1) === "against_blocks") {
    return field(
      Messages.src.config.item.schema.text0675,
      Messages.src.config.item.schema.text0676,
      { valueProvider: "block-state" },
    );
  }
  if (nested.at(-1) === "liquid_type") {
    return field(
      Messages.src.config.item.schema.text0677,
      Messages.src.config.item.schema.text0678,
      {
        values: ["water", "lava"],
        valueDetails: {
          water: Messages.src.config.item.schema.text0679,
          lava: Messages.src.config.item.schema.text0680,
        },
      },
    );
  }
  if (
    nested.length === 1 &&
    (nested[0] === "texture" || nested[0] === "textures")
  ) {
    return field("texture", Messages.src.config.item.schema.text0681, {
      valueProvider: "texture",
    });
  }
  if (
    nested.length === 1 &&
    (nested[0] === "model" || nested[0] === "models")
  ) {
    return field("model", Messages.src.config.item.schema.text0682, {
      valueProvider: "model",
    });
  }
  return itemDataListItemField(path);
}

export function itemDataDynamicValueField(
  context: SchemaContext,
  fieldName: string,
): SchemaField | undefined {
  if (itemGenerationTextureMapping(context.path))
    return ITEM_GENERATION_TEXTURE_VALUE_FIELD;
  const nested = normalizedItemDataPath(context.path);
  if (nested.length === 2 && nested[1] === "dynamic_lore")
    return {
      ...ITEM_DYNAMIC_LORE_CONTEXT_VALUE_FIELD,
      label: fieldName,
      semantic: fieldName,
      snippet: `${fieldName}:\n  - \${0}`,
    };
  return itemDataDynamicKeyField(context) &&
    !["merge", "enchantments"].includes(fieldName)
    ? number(
        Messages.src.config.item.schema.text0683,
        Messages.src.config.item.schema.text0684,
      )
    : undefined;
}

export function itemOpenMappingPath(path: readonly string[]): boolean {
  const nested = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  if (itemGenerationTextureMapping(path)) return true;
  const dataPath = normalizedItemDataPath(path);
  if (
    ["data", "client_bound_data"].includes(dataPath[0] ?? "") &&
    dataPath.length === 2 &&
    dataPath[1] === "dynamic_lore"
  )
    return true;
  const overrides = nested.indexOf("overrides");
  return (
    nested[0] === "legacy_model" &&
    overrides >= 0 &&
    nested.slice(overrides + 1).some((entry) => entry === "predicate")
  );
}

function normalizedItemDataPath(path: readonly string[]): readonly string[] {
  const nested = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  const dataPath =
    nested[0] !== "updater"
      ? nested
      : (() => {
          const dataIndex = nested.indexOf("data", 1);
          return dataIndex < 0 ? nested : nested.slice(dataIndex);
        })();
  if (
    (dataPath[0] === "data" || dataPath[0] === "client_bound_data") &&
    dataPath[1] !== undefined
  ) {
    const local = localRegistryDiscriminator(dataPath[1], "craftengine");
    if (local !== undefined)
      return [dataPath[0], local.replace(/#.*$/u, ""), ...dataPath.slice(2)];
  }
  return dataPath;
}

const CRAFT_REMAINDER_KEYS = new Set([
  "craft_remainder",
  "craft_remaining_item",
]);
function itemNumberProviderFields(
  type: string | undefined,
): readonly SchemaField[] {
  return numberProviderFields(type);
}

const EVENT_NUMBER_PROVIDER_FALLBACK_KEYS = new Set([
  "x",
  "y",
  "z",
  "count",
  "amount",
  "food",
  "saturation",
  "volume",
  "pitch",
  "duration",
  "amplifier",
  "exp",
  "level",
  "degree",
  "delay",
  "update_flags",
  "offset_x",
  "offset_y",
  "offset_z",
  "speed",
  "target_x",
  "target_y",
  "target_z",
  "arrival_time",
  "inverse",
  "number",
  "fade_in",
  "stay",
  "fade_out",
  "power",
  "min",
  "max",
  "value",
  "probability",
  "extra",
]);

  // 只看最近一层的随机数配置, normal 里的 min 仍是普通数字
function nestedNumberProviderDecision(
  context: SchemaContext,
  fieldName: string,
): boolean | undefined {
  const parentType = context.ancestorTypes?.[0];
  const resolved = resolveNumberProviderType(parentType);
  if (
    !resolved ||
    resolved.external ||
    !(NUMBER_PROVIDER_TYPES as readonly string[]).includes(resolved.name)
  ) {
    return undefined;
  }
  return numberProviderAllowsNestedField(parentType, fieldName);
}

function numberProviderMappingFields(
  context: SchemaContext,
  parentFields: readonly SchemaField[],
  fallback = false,
): readonly SchemaField[] | undefined {
  const tail = context.path.at(-1)?.replaceAll("-", "_");
  if (!tail) return undefined;
  const nestedDecision = nestedNumberProviderDecision(context, tail);
  if (nestedDecision !== undefined) {
    return nestedDecision
      ? itemNumberProviderFields(context.siblingValues.get("type"))
      : [];
  }
  if (
    schemaFieldForName(tail, parentFields)?.valueProvider ===
      "number-provider" ||
    fallback
  ) {
    return itemNumberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

function eventNumberProviderFields(
  nested: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] | undefined {
  const tail = nested.at(-1);
  if (!tail) return undefined;
  const parentType = context.ancestorTypes?.find((type) => {
    const functionType = resolveFunctionOrConditionType("function", type);
    const conditionType = resolveFunctionOrConditionType("condition", type);
    return (
      (functionType &&
        !functionType.external &&
        (FUNCTION_TYPES as readonly string[]).includes(functionType.name)) ||
      (conditionType &&
        !conditionType.external &&
        (CONDITION_TYPES as readonly string[]).includes(conditionType.name))
    );
  });
  const parentFields = nested.some((entry) =>
    ["conditions", "condition", "terms", "term"].includes(entry),
  )
    ? conditionFields(parentType)
    : functionFields(parentType);
  const direct = numberProviderMappingFields(context, parentFields);
  if (direct !== undefined) return direct;

  // merchant offer 和 temp item 没有单独的 type
  const merchant =
    resolveFunctionOrConditionType("function", parentType)?.name ===
    "merchant_trade";
  if (
    merchant &&
    (tail === "exp" ||
      tail === "experience" ||
      tail === "count" ||
      tail === "amount")
  ) {
    return itemNumberProviderFields(context.siblingValues.get("type"));
  }

  // 找不到上级信息时, 只有 events 使用备用规则
  if (
    context.ancestorTypes === undefined &&
    EVENT_NUMBER_PROVIDER_FALLBACK_KEYS.has(tail)
  ) {
    return itemNumberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

function itemDataNumberProviderFields(
  nested: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] | undefined {
  const normalized = normalizedItemDataPath(["item", ...nested]);
  const tail = normalized.at(-1);
  if (!tail) return undefined;
  const nestedDecision = nestedNumberProviderDecision(context, tail);
  if (nestedDecision !== undefined) {
    return nestedDecision
      ? itemNumberProviderFields(context.siblingValues.get("type"))
      : [];
  }
  const direct = new Set([
    "custom_model_data",
    "overwritable_custom_model_data",
    "max_damage",
  ]);
  if (
    direct.has(tail) ||
    (tail === "amount" && normalized.includes("attribute_modifiers"))
  ) {
    return itemNumberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

function craftRemainderFields(
  relativePath: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] {
  if (
    opaqueRegistryAncestor(context, "craftengine", [
      ...CRAFT_REMAINDER_TYPES,
      ...NUMBER_PROVIDER_TYPES,
    ])
  )
    return [];
  const tail = relativePath.at(-1);
  const countIndex = Math.max(
    relativePath.lastIndexOf("count"),
    relativePath.lastIndexOf("amount"),
  );
  if (countIndex >= 0) {
    const providerPath = relativePath
      .slice(countIndex + 1)
      .filter((entry) => !/^\d+$/u.test(entry));
    if (
      providerPath.length === 0 ||
      (providerPath.length === 1 &&
        (numberProviderAllowsNestedField(
          context.ancestorTypes?.[0],
          providerPath[0]!,
        ) ||
          (context.ancestorTypes === undefined &&
            ["min", "max", "extra", "probability"].includes(providerPath[0]!))))
    ) {
      return itemNumberProviderFields(context.siblingValues.get("type"));
    }
  }
  if (
    tail === "terms" ||
    (/^\d+$/u.test(tail ?? "") && relativePath.at(-2) === "terms")
  ) {
    return CRAFT_REMAINDER_TERM_FIELDS;
  }
  if (
    relativePath.length === 0 ||
    tail === "fallback" ||
    CRAFT_REMAINDER_KEYS.has(tail ?? "") ||
    /^\d+$/u.test(tail ?? "")
  ) {
    return typedFields(
      CRAFT_REMAINDER_COMMON,
      CRAFT_REMAINDER_FIELDS,
      context.siblingValues.get("type"),
    );
  }
  return [];
}

function modelGenerationFields(
  nested: readonly string[],
): readonly SchemaField[] | undefined {
  const generation = nested.lastIndexOf("generation");
  if (generation < 0) return undefined;
  const relative = nested
    .slice(generation + 1)
    .filter((entry) => !/^\d+$/u.test(entry));
  if (relative.length === 0) return MODEL_GENERATION_FIELDS;
  if (relative[0] === "textures") return [];
  if (relative[0] !== "display") return [];
  if (relative.length === 1) return DISPLAY_CONTEXT_FIELDS;
  if (relative.length === 2) return DISPLAY_TRANSFORM_FIELDS;
  return [];
}

const LEGACY_MODEL_FIELDS: readonly SchemaField[] = [
  field("path", Messages.src.config.item.schema.text0685, {
    aliases: ["model"],
    valueProvider: "model",
    required: true,
  }),
  mapping("generation", Messages.src.config.item.schema.text0686),
  list("overrides", Messages.src.config.item.schema.text0687),
];

const LEGACY_MODEL_OVERRIDE_FIELDS: readonly SchemaField[] = [
  field("predicate", Messages.src.config.item.schema.text0688, {
    required: true,
    snippet: "predicate:\n  ${0}",
  }),
  field("path", Messages.src.config.item.schema.text0689, {
    aliases: ["model"],
    valueProvider: "model",
    required: true,
  }),
  mapping("generation", Messages.src.config.item.schema.text0690),
];

function itemFieldsForContextBase(
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = context.path
    .slice(1)
    .map((entry) => entry.replaceAll("-", "_"));
  if (nested.length === 0) return ITEM_ROOT_FIELDS;
  const first = nested[0];
  if (first === "data" || first === "client_bound_data") {
    const dataPath = normalizedItemDataPath(context.path);
    const providerFields = itemDataNumberProviderFields(dataPath, context);
    if (providerFields !== undefined) return providerFields;
    return itemDataFields(dataPath, context);
  }
  if (first === "settings") {
    if (nested.length === 1) return ITEM_SETTING_FIELDS;
    const setting = localItemRegistryName(nested[1] ?? "");
    if (setting === undefined) return [];
    if (CRAFT_REMAINDER_KEYS.has(setting)) {
      return craftRemainderFields(nested.slice(2), context);
    }
    if (setting === "equipment") return SETTINGS_EQUIPMENT_FIELDS;
    if (setting === "equippable") return SETTINGS_EQUIPPABLE_FIELDS;
    if (setting === "projectile" && nested[2] === "display")
      return PROJECTILE_DISPLAY_FIELDS;
    if (setting === "projectile" && nested[2] === "sounds") {
      const soundProvider = numberProviderMappingFields(
        context,
        SOUND_DATA_FIELDS,
      );
      if (soundProvider !== undefined) return soundProvider;
      if (nested.length === 3) return PROJECTILE_SOUND_FIELDS;
      if (nested.includes("overrides")) return SOUND_DATA_FIELDS;
      if (nested[3] === "hit_entity" || nested[3] === "hit_block")
        return TARGET_SOUND_FIELDS;
      return SOUND_DATA_FIELDS;
    }
    return SETTINGS_NESTED_FIELDS.get(setting) ?? [];
  }
  if (first === "behaviors" || first === "behavior") {
    if (
      opaqueRegistryAncestor(context, "craftengine", [
        ...ITEM_BEHAVIOR_TYPES,
        ...CONDITION_TYPES,
        ...NUMBER_PROVIDER_TYPES,
      ])
    )
      return [];
    if (
      nested.some(
        (entry) =>
          entry === "conditions" ||
          entry === "condition" ||
          entry === "terms" ||
          entry === "term",
      )
    ) {
      return conditionFields(context.siblingValues.get("type"));
    }
    const compact = nested.filter((entry) => !/^\d+$/u.test(entry));
    const rulesIndex = compact.indexOf("rules");
    if (rulesIndex >= 0) {
      if (compact.length === rulesIndex + 1) return [];
      return [
        field("alignment", Messages.src.config.item.schema.text0691, {
          values: [
            "any",
            "corner",
            "center",
            "half",
            "quarter",
            "center_quarter",
          ],
          valueDetails: {
            any: Messages.src.config.item.schema.text0692,
            corner: Messages.src.config.item.schema.text0693,
            center: Messages.src.config.item.schema.text0694,
            half: Messages.src.config.item.schema.text0695,
            quarter: Messages.src.config.item.schema.text0696,
            center_quarter: Messages.src.config.item.schema.text0697,
          },
        }),
        field("rotation", Messages.src.config.item.schema.text0698, {
          values: [
            "any",
            "four",
            "eight",
            "sixteen",
            "north",
            "east",
            "west",
            "south",
          ],
          valueDetails: {
            any: Messages.src.config.item.schema.text0699,
            four: Messages.src.config.item.schema.text0700,
            eight: Messages.src.config.item.schema.text0701,
            sixteen: Messages.src.config.item.schema.text0702,
            north: Messages.src.config.item.schema.text0703,
            east: Messages.src.config.item.schema.text0704,
            west: Messages.src.config.item.schema.text0705,
            south: Messages.src.config.item.schema.text0706,
          },
        }),
      ];
    }
    const selected = context.siblingValues.get("type");
    const selectedName = localRegistryDiscriminator(selected, "craftengine");
    if (
      selectedName &&
      !(ITEM_BEHAVIOR_TYPES as readonly string[]).includes(selectedName)
    )
      return [];
    return typedFields(
      [
        field("type", Messages.src.config.item.schema.text0707, {
          values: ITEM_BEHAVIOR_TYPES,
          valueDetails: ITEM_BEHAVIOR_TYPE_DETAILS,
          required: true,
        }),
      ],
      BEHAVIOR_FIELDS,
      selected,
    );
  }
  if (first === "events" || first === "event") {
    if (nested.length === 1)
      return [
        ...EVENT_TRIGGERS.map((trigger) =>
          list(
            trigger,
            trigger === "fall"
              ? Messages.src.config.item.schema.text0708
              : Messages.src.config.item.schema.text0709,
          ),
        ),
        field("on", Messages.src.config.item.schema.text0710, {
          values: EVENT_TRIGGERS,
        }),
        list("functions", Messages.src.config.item.schema.text0711),
        ...FUNCTION_COMMON,
        number("delay", Messages.src.config.item.schema.text0712),
      ];
    if (
      opaqueRegistryAncestor(context, "craftengine", [
        ...FUNCTION_TYPES,
        ...CONDITION_TYPES,
        ...NUMBER_PROVIDER_TYPES,
        ...PLAYER_SELECTOR_TYPES,
      ])
    )
      return [];
    const providerFields = eventNumberProviderFields(nested, context);
    if (providerFields !== undefined) return providerFields;
    if (
      nested.some(
        (entry) =>
          entry === "conditions" ||
          entry === "condition" ||
          entry === "terms" ||
          entry === "term",
      )
    ) {
      return conditionFields(context.siblingValues.get("type"));
    }
    const tail = nested.filter((entry) => !/^\d+$/u.test(entry)).at(-1);
    if (tail === "target") return TARGET_MAPPING_FIELDS;
    if (tail === "offers" || tail === "offer")
      return [
        field("cost_1", Messages.src.config.item.schema.text0713, {
          aliases: ["cost-1"],
          required: true,
          snippet: "cost_1:\n  ${0}",
        }),
        mapping("cost_2", Messages.src.config.item.schema.text0714, ["cost-2"]),
        field("result", Messages.src.config.item.schema.text0715, {
          required: true,
          snippet: "result:\n  ${0}",
        }),
        numberProvider("exp", Messages.src.config.item.schema.text0716, [
          "experience",
        ]),
      ];
    if (tail === "cost_1" || tail === "cost_2" || tail === "result")
      return [
        field("item", Messages.src.config.item.schema.text0717, {
          aliases: ["id"],
          valueProvider: "item-id",
          required: true,
        }),
        numberProvider("count", Messages.src.config.item.schema.text0718, [
          "amount",
        ]),
        mapping("components", Messages.src.config.item.schema.text0719, [
          "component",
        ]),
        mapping("nbt", Messages.src.config.item.schema.text0720, ["tags"]),
      ];
    if (tail === "rules" || tail === "rule")
      return [
        list("condition", Messages.src.config.item.schema.text0721, [
          "conditions",
        ]),
        list("functions", Messages.src.config.item.schema.text0722),
      ];
    if (tail === "cases" || tail === "case")
      return [
        list("when", Messages.src.config.item.schema.text0723),
        list("functions", Messages.src.config.item.schema.text0724),
      ];
    return functionFields(
      context.siblingValues.get("type"),
      context.siblingValues.get("particle"),
    );
  }
  if (first === "model" || first === "models") {
    if (
      opaqueRegistryAncestor(context, "minecraft", [
        ...ITEM_MODEL_TYPES,
        ...MODEL_TINT_TYPES,
        ...SPECIAL_MODEL_TYPES,
      ])
    )
      return [];
    const modelPath = nested.filter((entry) => !/^\d+$/u.test(entry));
    const tail = modelPath.at(-1);
    const selectedType = context.siblingValues.get("type");
    if (tail === "tints") {
      return typedFields(
        [
          field("type", Messages.src.config.item.schema.text0725, {
            values: MODEL_TINT_TYPES,
            valueDetails: MODEL_TINT_TYPE_DETAILS,
            required: true,
          }),
        ],
        MODEL_TINT_FIELDS,
        selectedType,
        "minecraft",
      );
    }
    const selectedSpecial = localRegistryDiscriminator(
      selectedType,
      "minecraft",
    );
    if (
      tail === "model" &&
      selectedSpecial !== undefined &&
      SPECIAL_MODEL_TYPES.some(
        (type) =>
          localRegistryDiscriminator(type, "minecraft") === selectedSpecial,
      )
    ) {
      return typedFields(
        [
          field("type", Messages.src.config.item.schema.text0726, {
            values: SPECIAL_MODEL_TYPES,
            valueDetails: SPECIAL_MODEL_TYPE_DETAILS,
            required: true,
          }),
        ],
        SPECIAL_MODEL_FIELDS,
        selectedType,
        "minecraft",
      );
    }
    const generationFields = modelGenerationFields(nested);
    if (generationFields !== undefined) return generationFields;
    if (tail === "transformation") return MODEL_TRANSFORMATION_FIELDS;
    if (tail === "entries")
      return [
        field("threshold", Messages.src.config.item.schema.text0727, {
          valueProvider: "number",
          required: true,
        }),
        field("model", Messages.src.config.item.schema.text0728, {
          snippet: "model:\n  ${0}",
        }),
      ];
    if (tail === "cases")
      return [
        field("when", Messages.src.config.item.schema.text0729, {
          required: true,
          snippet: "when: ${0}",
        }),
        field("model", Messages.src.config.item.schema.text0730, {
          required: true,
          snippet: "model:\n  ${0}",
        }),
      ];
    return modelFields(selectedType, context.siblingValues.get("property"));
  }
  if (first === "legacy_model") {
    const generationFields = modelGenerationFields(nested);
    if (generationFields !== undefined) return generationFields;
    const overrides = nested.indexOf("overrides", 1);
    if (overrides >= 0) {
      const relative = nested
        .slice(overrides + 1)
        .filter((entry) => !/^\d+$/u.test(entry));
      if (relative.length === 0) return LEGACY_MODEL_OVERRIDE_FIELDS;
      if (relative[0] === "predicate") return [];
      return [];
    }
    return nested.length === 1 ? LEGACY_MODEL_FIELDS : [];
  }
  if (first === "updater") {
  // 只看最外层更新器的 type, apply_data 里面的 type 不参与判断
    if (opaqueRegistryAncestor(context, "craftengine", UPDATER_TYPES, true))
      return [];
    const dataIndex = nested.indexOf("data", 1);
    if (dataIndex >= 0) {
      const dataPath = nested.slice(dataIndex);
      const providerFields = itemDataNumberProviderFields(dataPath, context);
      return providerFields ?? itemDataFields(dataPath, context);
    }
    return typedFields(
      UPDATER_COMMON,
      UPDATER_FIELDS,
      context.siblingValues.get("type"),
    );
  }
  return [];
}

export function itemFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  return itemFieldsForContextBase(context);
}

export function fieldsForDiscriminator(
  kind: "function" | "condition" | "item-model",
  type: string | undefined,
): readonly SchemaField[] {
  if (kind === "function") return functionFields(type);
  if (kind === "condition") return conditionFields(type);
  return modelFields(type, undefined);
}
