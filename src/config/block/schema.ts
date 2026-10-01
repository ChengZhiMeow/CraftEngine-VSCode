import {
  fieldsForDiscriminator,
  itemFieldsForContext,
  particleConfigFieldsForType,
} from "../item/schema.js";
import { withTemplateSchemaFields } from "../schema/templateFields.js";
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
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { semanticForField } from "../schema/types.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

import { Messages } from "../../messages.js";
interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly optionalDependency?: string;
  readonly registry?: string;
  readonly required?: boolean;
}

function field(
  label: string,
  detail: string,
  options: FieldOptions = {},
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
const blockTagList = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    snippet: `${label}:\n  - \${0}`,
    valueProvider: "block-tag",
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
    valueDetails: {
      true: Messages.src.config.block.schema.text0001,
      false: Messages.src.config.block.schema.text0002,
    },
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
): SchemaField => numberProviderConsumer(field(label, detail, { aliases }));

export const AUTO_STATE_GROUPS = [
  "non_tintable_leaves",
  "no_tint_leaves",
  "leaves_no_tint",
  "waterlogged_non_tintable_leaves",
  "waterlogged_no_tint_leaves",
  "waterlogged_leaves_no_tint",
  "tintable_leaves",
  "waterlogged_tintable_leaves",
  "leaves",
  "waterlogged_leaves",
  "lower_tripwire",
  "higher_tripwire",
  "note_block",
  "brown_mushroom_block",
  "red_mushroom_block",
  "mushroom_stem",
  "tripwire",
  "sugar_cane",
  "cactus",
  "cave_vines",
  "cave_vine",
  "weeping_vines",
  "weeping_vine",
  "twisting_vines",
  "twisting_vine",
  "kelp",
  "chorus",
  "pressure_plate",
  "sapling",
  "mushroom",
  "solid",
] as const;

export const AUTO_STATE_DETAILS: Readonly<Record<string, string>> = {
  non_tintable_leaves: Messages.src.config.block.schema.text0003,
  no_tint_leaves: Messages.src.config.block.schema.text0004,
  leaves_no_tint: Messages.src.config.block.schema.text0005,
  waterlogged_non_tintable_leaves: Messages.src.config.block.schema.text0006,
  waterlogged_no_tint_leaves: Messages.src.config.block.schema.text0007,
  waterlogged_leaves_no_tint: Messages.src.config.block.schema.text0008,
  tintable_leaves: Messages.src.config.block.schema.text0009,
  waterlogged_tintable_leaves: Messages.src.config.block.schema.text0010,
  leaves: Messages.src.config.block.schema.text0011,
  waterlogged_leaves: Messages.src.config.block.schema.text0012,
  lower_tripwire: Messages.src.config.block.schema.text0013,
  higher_tripwire: Messages.src.config.block.schema.text0014,
  note_block: Messages.src.config.block.schema.text0015,
  brown_mushroom_block: Messages.src.config.block.schema.text0016,
  red_mushroom_block: Messages.src.config.block.schema.text0017,
  mushroom_stem: Messages.src.config.block.schema.text0018,
  tripwire: Messages.src.config.block.schema.text0019,
  sugar_cane: Messages.src.config.block.schema.text0020,
  cactus: Messages.src.config.block.schema.text0021,
  cave_vines: Messages.src.config.block.schema.text0022,
  cave_vine: Messages.src.config.block.schema.text0023,
  weeping_vines: Messages.src.config.block.schema.text0024,
  weeping_vine: Messages.src.config.block.schema.text0025,
  twisting_vines: Messages.src.config.block.schema.text0026,
  twisting_vine: Messages.src.config.block.schema.text0027,
  kelp: Messages.src.config.block.schema.text0028,
  chorus: Messages.src.config.block.schema.text0029,
  pressure_plate: Messages.src.config.block.schema.text0030,
  sapling: Messages.src.config.block.schema.text0031,
  mushroom: Messages.src.config.block.schema.text0032,
  solid: Messages.src.config.block.schema.text0033,
};

export const BLOCK_PROPERTY_TYPES = [
  "boolean",
  "int",
  "string",
  "axis",
  "horizontal_direction",
  "4-direction",
  "direction",
  "6-direction",
  "single_block_half",
  "double_block_half",
  "hinge",
  "stairs_shape",
  "slab_type",
  "sofa_shape",
  "anchor_type",
  "bed_part",
] as const;

export const BLOCK_PROPERTY_TYPE_DETAILS: Readonly<Record<string, string>> = {
  boolean: Messages.src.config.block.schema.text0034,
  int: Messages.src.config.block.schema.text0035,
  string: Messages.src.config.block.schema.text0036,
  axis: Messages.src.config.block.schema.text0037,
  horizontal_direction: Messages.src.config.block.schema.text0038,
  "4-direction": Messages.src.config.block.schema.text0039,
  direction: Messages.src.config.block.schema.text0040,
  "6-direction": Messages.src.config.block.schema.text0041,
  single_block_half: Messages.src.config.block.schema.text0042,
  double_block_half: Messages.src.config.block.schema.text0043,
  hinge: Messages.src.config.block.schema.text0044,
  stairs_shape: Messages.src.config.block.schema.text0045,
  slab_type: Messages.src.config.block.schema.text0046,
  sofa_shape: Messages.src.config.block.schema.text0047,
  anchor_type: Messages.src.config.block.schema.text0048,
  bed_part: Messages.src.config.block.schema.text0049,
};

export const BLOCK_PROPERTY_VALUE_DETAILS: Readonly<Record<string, string>> = {
  true: Messages.src.config.block.schema.text0050,
  false: Messages.src.config.block.schema.text0051,
  x: Messages.src.config.block.schema.text0052,
  y: Messages.src.config.block.schema.text0053,
  z: Messages.src.config.block.schema.text0054,
  down: Messages.src.config.block.schema.text0055,
  up: Messages.src.config.block.schema.text0056,
  north: Messages.src.config.block.schema.text0057,
  south: Messages.src.config.block.schema.text0058,
  west: Messages.src.config.block.schema.text0059,
  east: Messages.src.config.block.schema.text0060,
  bottom: Messages.src.config.block.schema.text0061,
  top: Messages.src.config.block.schema.text0062,
  upper: Messages.src.config.block.schema.text0063,
  lower: Messages.src.config.block.schema.text0064,
  left: Messages.src.config.block.schema.text0065,
  right: Messages.src.config.block.schema.text0066,
  straight: Messages.src.config.block.schema.text0067,
  inner_left: Messages.src.config.block.schema.text0068,
  inner_right: Messages.src.config.block.schema.text0069,
  outer_left: Messages.src.config.block.schema.text0070,
  outer_right: Messages.src.config.block.schema.text0071,
  double: Messages.src.config.block.schema.text0072,
  floor: Messages.src.config.block.schema.text0073,
  wall: Messages.src.config.block.schema.text0074,
  ceiling: Messages.src.config.block.schema.text0075,
  head: Messages.src.config.block.schema.text0076,
  foot: Messages.src.config.block.schema.text0077,
};

export const BLOCK_PROPERTY_ENUM_VALUES: Readonly<
  Record<string, readonly string[]>
> = {
  boolean: ["true", "false"],
  axis: ["x", "y", "z"],
  horizontal_direction: ["north", "east", "south", "west"],
  "4-direction": ["north", "east", "south", "west"],
  direction: ["down", "up", "north", "south", "west", "east"],
  "6-direction": ["down", "up", "north", "south", "west", "east"],
  single_block_half: ["bottom", "top"],
  double_block_half: ["upper", "lower"],
  hinge: ["left", "right"],
  stairs_shape: [
    "straight",
    "inner_left",
    "inner_right",
    "outer_left",
    "outer_right",
  ],
  slab_type: ["top", "bottom", "double"],
  sofa_shape: ["straight", "inner_left", "inner_right"],
  anchor_type: ["floor", "wall", "ceiling"],
  bed_part: ["head", "foot"],
};

export const BLOCK_INSTRUMENTS = [
  "harp",
  "basedrum",
  "snare",
  "hat",
  "bass",
  "flute",
  "bell",
  "guitar",
  "chime",
  "xylophone",
  "iron_xylophone",
  "cow_bell",
  "didgeridoo",
  "bit",
  "banjo",
  "pling",
  "trumpet",
  "trumpet_exposed",
  "trumpet_weathered",
  "trumpet_oxidized",
  "zombie",
  "skeleton",
  "creeper",
  "dragon",
  "wither_skeleton",
  "piglin",
  "custom_head",
] as const;

export const BLOCK_INSTRUMENT_DETAILS: Readonly<Record<string, string>> = {
  harp: Messages.src.config.block.schema.text0078,
  basedrum: Messages.src.config.block.schema.text0079,
  snare: Messages.src.config.block.schema.text0080,
  hat: Messages.src.config.block.schema.text0081,
  bass: Messages.src.config.block.schema.text0082,
  flute: Messages.src.config.block.schema.text0083,
  bell: Messages.src.config.block.schema.text0084,
  guitar: Messages.src.config.block.schema.text0085,
  chime: Messages.src.config.block.schema.text0086,
  xylophone: Messages.src.config.block.schema.text0087,
  iron_xylophone: Messages.src.config.block.schema.text0088,
  cow_bell: Messages.src.config.block.schema.text0089,
  didgeridoo: Messages.src.config.block.schema.text0090,
  bit: Messages.src.config.block.schema.text0091,
  banjo: Messages.src.config.block.schema.text0092,
  pling: Messages.src.config.block.schema.text0093,
  trumpet: Messages.src.config.block.schema.text0094,
  trumpet_exposed: Messages.src.config.block.schema.text0095,
  trumpet_weathered: Messages.src.config.block.schema.text0096,
  trumpet_oxidized: Messages.src.config.block.schema.text0097,
  zombie: Messages.src.config.block.schema.text0098,
  skeleton: Messages.src.config.block.schema.text0099,
  creeper: Messages.src.config.block.schema.text0100,
  dragon: Messages.src.config.block.schema.text0101,
  wither_skeleton: Messages.src.config.block.schema.text0102,
  piglin: Messages.src.config.block.schema.text0103,
  custom_head: Messages.src.config.block.schema.text0104,
};

const AUTO_STATE_FIELD = field(
  "auto_state",
  Messages.src.config.block.schema.text0105,
  {
    aliases: ["auto-state"],
    values: AUTO_STATE_GROUPS,
    valueDetails: AUTO_STATE_DETAILS,
    snippet:
      "auto_state: ${1|solid,note_block,sugar_cane,tripwire,sapling,leaves|}",
  },
);

  // auto_state 的映射形式: auto_state: { type: solid, id: xxx }
const AUTO_STATE_DETAIL_FIELDS: readonly SchemaField[] = [
  field("type", "自动状态组; 省略时使用 solid", {
    values: AUTO_STATE_GROUPS,
    valueDetails: AUTO_STATE_DETAILS,
    snippet: `type: \${1|${AUTO_STATE_GROUPS.join(",")}|}`,
  }),
  field(
    "id",
    "自定义自动状态缓存 id; 相同 id 的方块共用同一个自动分配的原版方块状态",
  ),
];

const VISUAL_FIELDS: readonly SchemaField[] = [
  AUTO_STATE_FIELD,
  field("state", Messages.src.config.block.schema.text0106, {
    valueProvider: "block-state",
  }),
  bool("transparent", Messages.src.config.block.schema.text0107),
  field("texture", Messages.src.config.block.schema.text0108, {
    aliases: ["textures"],
    valueProvider: "texture",
    snippet: "texture: ${0}",
  }),
  field("model", Messages.src.config.block.schema.text0109, {
    aliases: ["models"],
    valueProvider: "model",
    snippet: "model:\n  path: ${0}",
  }),
  field("blueprint", "blueprint 文件夹内的 .bbmodel 路径"),
  list("entity_renderer", Messages.src.config.block.schema.text0110, [
    "entity-renderer",
    "entity_render",
    "entity-render",
  ]),
];

export const BLOCK_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.block.schema.text0111),
  bool("debug", Messages.src.config.block.schema.text0112),
  mapping("state", Messages.src.config.block.schema.text0113, ["states"]),
  mapping("settings", Messages.src.config.block.schema.text0114),
  list("behavior", Messages.src.config.block.schema.text0115, ["behaviors"]),
  mapping("events", Messages.src.config.block.schema.text0116, ["event"]),
  field("loot", Messages.src.config.block.schema.text0117, {
    valueProvider: "loot-id",
    snippet: "loot:\n  ${0}",
  }),
  mapping("entity_culling", Messages.src.config.block.schema.text0118, [
    "entity-culling",
  ]),
  field("template", Messages.src.config.block.schema.text0120, {
    aliases: ["templates"],
    valueProvider: "template",
  }),
  mapping("arguments", Messages.src.config.block.schema.text0121),
  mapping("overrides", Messages.src.config.block.schema.text0122),
  mapping("merges", Messages.src.config.block.schema.text0123),
];

const STATE_FIELDS: readonly SchemaField[] = [
  number("id", Messages.src.config.block.schema.text0124),
  mapping("properties", Messages.src.config.block.schema.text0125),
  mapping("appearance", Messages.src.config.block.schema.text0126, [
    "appearances",
  ]),
  mapping("variants", Messages.src.config.block.schema.text0127),
  ...VISUAL_FIELDS,
];

const PROPERTY_COMMON_FIELDS: readonly SchemaField[] = [
  field("type", Messages.src.config.block.schema.text0128, {
    values: BLOCK_PROPERTY_TYPES,
    valueDetails: BLOCK_PROPERTY_TYPE_DETAILS,
    snippet: `type: \${1|${BLOCK_PROPERTY_TYPES.join(",")}|}`,
  }),
  field("default", Messages.src.config.block.schema.text0129),
  list("values", Messages.src.config.block.schema.text0130),
];

const MODEL_FIELDS: readonly SchemaField[] = [
  field("path", Messages.src.config.block.schema.text0131, {
    aliases: ["model"],
    valueProvider: "model",
  }),
  field("texture", Messages.src.config.block.schema.text0132, {
    aliases: ["textures"],
    valueProvider: "texture",
  }),
  field("blueprint", "blueprint 文件夹内的 .bbmodel 路径"),
  number("x", Messages.src.config.block.schema.text0133),
  number("y", Messages.src.config.block.schema.text0134),
  number("z", Messages.src.config.block.schema.text0135),
  bool("uvlock", Messages.src.config.block.schema.text0136),
  number("weight", Messages.src.config.block.schema.text0137),
  mapping("generation", Messages.src.config.block.schema.text0138),
];

const DISPLAY_CONTEXT_DETAILS: Readonly<Record<string, string>> = {
  thirdperson_righthand: Messages.src.config.block.schema.text0139,
  thirdperson_lefthand: Messages.src.config.block.schema.text0140,
  firstperson_righthand: Messages.src.config.block.schema.text0141,
  firstperson_lefthand: Messages.src.config.block.schema.text0142,
  gui: Messages.src.config.block.schema.text0143,
  head: Messages.src.config.block.schema.text0144,
  ground: Messages.src.config.block.schema.text0145,
  fixed: Messages.src.config.block.schema.text0146,
  on_shelf: Messages.src.config.block.schema.text0147,
};
const DISPLAY_CONTEXTS = Object.keys(DISPLAY_CONTEXT_DETAILS);

const GENERATION_FIELDS: readonly SchemaField[] = [
  field("parent", Messages.src.config.block.schema.text0148, {
    valueProvider: "model",
  }),
  mapping("textures", Messages.src.config.block.schema.text0149),
  mapping("display", Messages.src.config.block.schema.text0150),
  field("gui_light", Messages.src.config.block.schema.text0151, {
    aliases: ["gui-light"],
    values: ["front", "side"],
    valueDetails: {
      front: Messages.src.config.block.schema.text0152,
      side: Messages.src.config.block.schema.text0153,
    },
  }),
  bool("ambientocclusion", Messages.src.config.block.schema.text0154, [
    "ambient-occlusion",
    "ambient_occlusion",
  ]),
];
const DISPLAY_TRANSFORM_FIELDS: readonly SchemaField[] = [
  field("rotation", Messages.src.config.block.schema.text0155),
  field("translation", Messages.src.config.block.schema.text0156),
  field("scale", Messages.src.config.block.schema.text0157),
];

export const BLOCK_RENDERER_TYPES = [
  "item_display",
  "text_display",
  "block_display",
  "item",
  "armor_stand",
  "better_model",
  "model_engine",
] as const;
export const BLOCK_RENDERER_TYPE_DETAILS: Readonly<Record<string, string>> = {
  item_display: Messages.src.config.block.schema.text0158,
  text_display: Messages.src.config.block.schema.text0159,
  block_display: Messages.src.config.block.schema.text0160,
  item: Messages.src.config.block.schema.text0161,
  armor_stand: Messages.src.config.block.schema.text0162,
  better_model: Messages.src.config.block.schema.text0163,
  model_engine: Messages.src.config.block.schema.text0164,
};
const BILLBOARD_VALUES = ["fixed", "vertical", "horizontal", "center"] as const;
const BILLBOARD_DETAILS = {
  fixed: Messages.src.config.block.schema.text0165,
  vertical: Messages.src.config.block.schema.text0166,
  horizontal: Messages.src.config.block.schema.text0167,
  center: Messages.src.config.block.schema.text0168,
};
const DISPLAY_CONTEXT_VALUES = [
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
] as const;
const DISPLAY_CONTEXT_VALUE_DETAILS: Readonly<Record<string, string>> = {
  none: Messages.src.config.block.schema.text0169,
  third_person_left_hand: Messages.src.config.block.schema.text0170,
  third_person_right_hand: Messages.src.config.block.schema.text0171,
  first_person_left_hand: Messages.src.config.block.schema.text0172,
  first_person_right_hand: Messages.src.config.block.schema.text0173,
  head: Messages.src.config.block.schema.text0174,
  gui: Messages.src.config.block.schema.text0175,
  ground: Messages.src.config.block.schema.text0176,
  fixed: Messages.src.config.block.schema.text0177,
  on_shelf: Messages.src.config.block.schema.text0178,
};
const RENDERER_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.block.schema.text0179, {
    values: BLOCK_RENDERER_TYPES,
    valueDetails: BLOCK_RENDERER_TYPE_DETAILS,
  }),
  field("position", Messages.src.config.block.schema.text0180),
  list("conditions", Messages.src.config.block.schema.text0181, ["condition"]),
];
const DISPLAY_RENDERER_COMMON: readonly SchemaField[] = [
  field("scale", Messages.src.config.block.schema.text0182),
  field("translation", Messages.src.config.block.schema.text0183),
  number("pitch", Messages.src.config.block.schema.text0184),
  number("yaw", Messages.src.config.block.schema.text0185),
  field("rotation", Messages.src.config.block.schema.text0186),
  field("billboard", Messages.src.config.block.schema.text0187, {
    values: BILLBOARD_VALUES,
    valueDetails: BILLBOARD_DETAILS,
  }),
  number("shadow_radius", Messages.src.config.block.schema.text0188, [
    "shadow-radius",
  ]),
  number("shadow_strength", Messages.src.config.block.schema.text0189, [
    "shadow-strength",
  ]),
  field("glow_color", Messages.src.config.block.schema.text0190, {
    aliases: ["glow-color"],
  }),
  mapping("brightness", Messages.src.config.block.schema.text0191),
  number("view_range", Messages.src.config.block.schema.text0192, [
    "view-range",
  ]),
];
const RENDERER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "item_display",
    [
      field("item", Messages.src.config.block.schema.text0193, {
        valueProvider: "item-id",
        required: true,
      }),
      field("display_context", Messages.src.config.block.schema.text0194, {
        aliases: ["display_transform", "display-context", "display-transform"],
        values: DISPLAY_CONTEXT_VALUES,
        valueDetails: DISPLAY_CONTEXT_VALUE_DETAILS,
      }),
      mapping("tint_source", Messages.src.config.block.schema.text0195, [
        "tint-source",
      ]),
      ...DISPLAY_RENDERER_COMMON,
    ],
  ],
  [
    "text_display",
    [
      field("text", Messages.src.config.block.schema.text0196, {
        required: true,
      }),
      number("line_width", Messages.src.config.block.schema.text0197, [
        "line-width",
      ]),
      field("background_color", Messages.src.config.block.schema.text0198, {
        aliases: ["background-color"],
      }),
      number("text_opacity", Messages.src.config.block.schema.text0199, [
        "text-opacity",
      ]),
      bool("has_shadow", Messages.src.config.block.schema.text0200, [
        "has-shadow",
      ]),
      bool("is_see_through", Messages.src.config.block.schema.text0201, [
        "is-see-through",
      ]),
      bool(
        "use_default_background_color",
        Messages.src.config.block.schema.text0202,
        ["use-default-background-color"],
      ),
      field("alignment", Messages.src.config.block.schema.text0203, {
        values: ["center", "left", "right"],
        valueDetails: {
          center: Messages.src.config.block.schema.text0204,
          left: Messages.src.config.block.schema.text0205,
          right: Messages.src.config.block.schema.text0206,
        },
      }),
      ...DISPLAY_RENDERER_COMMON,
    ],
  ],
  [
    "block_display",
    [
      field("block", Messages.src.config.block.schema.text0207, {
        valueProvider: "block-state",
        required: true,
      }),
      ...DISPLAY_RENDERER_COMMON,
    ],
  ],
  [
    "item",
    [
      field("item", Messages.src.config.block.schema.text0208, {
        valueProvider: "item-id",
        required: true,
      }),
      mapping("tint_source", Messages.src.config.block.schema.text0209, [
        "tint-source",
      ]),
    ],
  ],
  [
    "armor_stand",
    [
      field("item", Messages.src.config.block.schema.text0210, {
        valueProvider: "item-id",
        required: true,
      }),
      number("scale", Messages.src.config.block.schema.text0211),
      number("pitch", Messages.src.config.block.schema.text0212),
      number("yaw", Messages.src.config.block.schema.text0213),
      bool("small", Messages.src.config.block.schema.text0214),
      field("glow_color", Messages.src.config.block.schema.text0215, {
        aliases: ["glow-color"],
      }),
      mapping("tint_source", Messages.src.config.block.schema.text0216, [
        "tint-source",
      ]),
    ],
  ],
  [
    "better_model",
    [
      field("model", Messages.src.config.block.schema.text0217),
      number("yaw", Messages.src.config.block.schema.text0218),
      number("pitch", Messages.src.config.block.schema.text0219),
      bool("sight_trace", Messages.src.config.block.schema.text0220, [
        "sight-trace",
      ]),
    ],
  ],
  [
    "model_engine",
    [
      field("model", Messages.src.config.block.schema.text0221),
      number("yaw", Messages.src.config.block.schema.text0222),
      number("pitch", Messages.src.config.block.schema.text0223),
    ],
  ],
]);
const BRIGHTNESS_FIELDS: readonly SchemaField[] = [
  number("block_light", Messages.src.config.block.schema.text0224, [
    "block-light",
  ]),
  number("sky_light", Messages.src.config.block.schema.text0225, ["sky-light"]),
];
const TINT_SOURCE_TYPE_FIELD = field(
  "type",
  Messages.src.config.block.schema.text0226,
  {
    values: ["default", "craftengine:default"],
    valueDetails: {
      default: Messages.src.config.block.schema.text0227,
      "craftengine:default": Messages.src.config.block.schema.text0228,
    },
  },
);
const TINT_SOURCE_FIELDS: readonly SchemaField[] = [
  TINT_SOURCE_TYPE_FIELD,
  list("components", Messages.src.config.block.schema.text0229),
  number("index", Messages.src.config.block.schema.text0230),
];

export const BLOCK_PUSH_REACTIONS = [
  "normal",
  "destroy",
  "block",
  "ignore",
  "push_only",
  "push_pull",
  "push",
  "popped",
  "immoveable",
  "ignore_entity",
] as const;

export const BLOCK_PUSH_REACTION_DETAILS: Readonly<Record<string, string>> = {
  normal: Messages.src.config.block.schema.text0255,
  destroy: Messages.src.config.block.schema.text0256,
  block: Messages.src.config.block.schema.text0257,
  ignore: Messages.src.config.block.schema.text0258,
  push_only: Messages.src.config.block.schema.text0259,
  push_pull: "可被活塞推拉",
  push: "只能被活塞推动",
  popped: "被活塞推动时破坏并掉落",
  immoveable: "不可被活塞移动",
  ignore_entity: "忽略实体与活塞的推动",
};

function tintSourceFields(type: string | undefined): readonly SchemaField[] {
  if (!type || localRegistryDiscriminator(type) === "default")
    return TINT_SOURCE_FIELDS;
  return isValidRegistryDiscriminator(type) ? [] : [TINT_SOURCE_TYPE_FIELD];
}

export const BLOCK_SETTING_FIELDS: readonly SchemaField[] = [
  field("item", Messages.src.config.block.schema.text0231, {
    valueProvider: "item-id",
  }),
  field("name", Messages.src.config.block.schema.text0232),
  field("support_shape", Messages.src.config.block.schema.text0233, {
    valueProvider: "block-state",
  }),
  number("luminance", Messages.src.config.block.schema.text0234),
  field("map_color", Messages.src.config.block.schema.text0235),
  number("burn_chance", Messages.src.config.block.schema.text0236),
  number("fire_spread_chance", Messages.src.config.block.schema.text0237),
  number("block_light", Messages.src.config.block.schema.text0238),
  number("light_block", Messages.src.config.block.schema.text0239),
  number("light_dampening", Messages.src.config.block.schema.text0240),
  number("hardness", Messages.src.config.block.schema.text0241),
  number("friction", Messages.src.config.block.schema.text0242),
  number("speed_factor", Messages.src.config.block.schema.text0243),
  number("jump_factor", Messages.src.config.block.schema.text0244),
  number("resistance", Messages.src.config.block.schema.text0245),
  number("incorrect_tool_dig_speed", Messages.src.config.block.schema.text0246),
  bool("replaceable", Messages.src.config.block.schema.text0247),
  bool("is_redstone_conductor", Messages.src.config.block.schema.text0248),
  bool("is_suffocating", Messages.src.config.block.schema.text0249),
  bool("is_randomly_ticking", Messages.src.config.block.schema.text0250),
  bool("is_view_blocking", Messages.src.config.block.schema.text0251),
  bool("propagate_skylight", Messages.src.config.block.schema.text0252),
  bool("burnable", Messages.src.config.block.schema.text0253),
  field("push_reaction", Messages.src.config.block.schema.text0254, {
    values: BLOCK_PUSH_REACTIONS,
    valueDetails: BLOCK_PUSH_REACTION_DETAILS,
  }),
  field("instrument", Messages.src.config.block.schema.text0260, {
    values: BLOCK_INSTRUMENTS,
    valueDetails: BLOCK_INSTRUMENT_DETAILS,
    snippet: `instrument: \${1|${BLOCK_INSTRUMENTS.join(",")}|}`,
  }),
  mapping("sounds", Messages.src.config.block.schema.text0261),
  field("fluid_state", Messages.src.config.block.schema.text0262, {
    values: ["water", "empty"],
    valueDetails: {
      water: Messages.src.config.block.schema.text0263,
      empty: Messages.src.config.block.schema.text0264,
    },
  }),
  bool("can_occlude", Messages.src.config.block.schema.text0265),
  bool("require_correct_tools", Messages.src.config.block.schema.text0266),
  bool("respect_tool_component", Messages.src.config.block.schema.text0267),
  number("required_break_power", "破坏方块所需的最低工具等级"),
  bool(
    "use_shape_for_light_occlusion",
    Messages.src.config.block.schema.text0268,
  ),
  blockTagList("tags", Messages.src.config.block.schema.text0269),
  list("correct_tools", Messages.src.config.block.schema.text0270),
  blockTagList("client_bound_tags", Messages.src.config.block.schema.text0119, [
    "client-bound-tags",
  ]),
  bool("block_raytrace", Messages.src.config.block.schema.text0271),
  number("bounce_restitution", Messages.src.config.block.schema.text0272),
  mapping("destroy_stages", Messages.src.config.block.schema.text0273),
];

const SOUND_CHANNEL_FIELDS: readonly SchemaField[] = (
  ["break", "step", "place", "hit", "fall"] as const
).map((name) =>
  field(name, Messages.src.config.block.schema.text0274(name), {
    valueProvider: "sound",
  }),
);
const SOUND_DATA_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.block.schema.text0275, {
    valueProvider: "sound",
  }),
  numberProvider("volume", Messages.src.config.block.schema.text0276),
  numberProvider("pitch", Messages.src.config.block.schema.text0277),
];
// CraftEngine 各方块行为 behavior.sounds 的通道, 逐个对应各 BlockBehavior 里 getSection("sounds")
const BEHAVIOR_SOUND_CHANNELS: Readonly<Record<string, readonly string[]>> = {
  button_block: ["on", "off"],
  // ChimeBlockBehavior 用 ConfigKeys.of("chime|projectile_hit")
  chime_block: ["chime", "projectile_hit"],
  display_item_block: ["put", "take"],
  door_block: ["open", "close"],
  drawer_block: ["put", "take"],
  falling_block: ["land", "destroy"],
  fence_gate_block: ["open", "close"],
  item_frame_block: ["put", "take", "rotate"],
  pressure_plate_block: ["on", "off"],
  simple_storage_block: ["open", "close"],
  trapdoor_block: ["open", "close"],
};
const BEHAVIOR_SOUND_CHANNEL_DETAILS: Readonly<Record<string, string>> = {
  open: "打开时的声音",
  close: "关闭时的声音",
  on: "激活时的声音",
  off: "取消激活时的声音",
  put: "放入物品时的声音",
  take: "取出物品时的声音",
  rotate: "旋转时的声音",
  land: "落地时的声音",
  destroy: "落地后销毁时的声音",
  chime: "弹射物命中时的声音",
  projectile_hit: "弹射物命中时的声音",
};
function behaviorSoundChannelFields(
  type: string | undefined,
): readonly SchemaField[] {
  const channels = type === undefined ? undefined : BEHAVIOR_SOUND_CHANNELS[type];
  if (!channels) return [];
  return channels.map((name) =>
    field(
      name,
      BEHAVIOR_SOUND_CHANNEL_DETAILS[name] ?? "声音事件 ID; 也支持 id/volume/pitch",
      { valueProvider: "sound" },
    ),
  );
}
const DESTROY_STAGE_FIELDS: readonly SchemaField[] = [
  list("items", Messages.src.config.block.schema.text0278),
  field("position", Messages.src.config.block.schema.text0279),
  field("translation", Messages.src.config.block.schema.text0280),
  field("scale", Messages.src.config.block.schema.text0281),
  number("pitch", Messages.src.config.block.schema.text0282),
  number("yaw", Messages.src.config.block.schema.text0283),
  field("rotation", Messages.src.config.block.schema.text0284),
  field("display_context", Messages.src.config.block.schema.text0285, {
    aliases: ["display_transform", "display-context", "display-transform"],
    values: DISPLAY_CONTEXT_VALUES,
    valueDetails: DISPLAY_CONTEXT_VALUE_DETAILS,
  }),
  field("billboard", Messages.src.config.block.schema.text0286, {
    values: BILLBOARD_VALUES,
    valueDetails: BILLBOARD_DETAILS,
  }),
  number("view_range", Messages.src.config.block.schema.text0287, [
    "view-range",
  ]),
  mapping("brightness", Messages.src.config.block.schema.text0288),
];
const CULLING_FIELDS: readonly SchemaField[] = [
  field("aabb", Messages.src.config.block.schema.text0289),
  number("view_distance", Messages.src.config.block.schema.text0290, [
    "view-distance",
  ]),
  number("aabb_expansion", Messages.src.config.block.schema.text0291, [
    "aabb-expansion",
  ]),
  bool("ray_tracing", Messages.src.config.block.schema.text0292, [
    "ray-tracing",
  ]),
];

export const BLOCK_BEHAVIOR_TYPES = [
  "empty",
  "bush_block",
  "hanging_block",
  "falling_block",
  "leaves_block",
  "strippable_block",
  "sapling_block",
  "on_liquid_block",
  "near_liquid_block",
  "concrete_powder_block",
  "vertical_crop_block",
  "crop_block",
  "grass_block",
  "lamp_block",
  "trapdoor_block",
  "door_block",
  "stackable_block",
  "sturdy_base_block",
  "fence_gate_block",
  "slab_block",
  "stairs_block",
  "pressure_plate_block",
  "double_high_block",
  "change_over_time_block",
  "simple_storage_block",
  "toggleable_lamp_block",
  "sofa_block",
  "bouncing_block",
  "directional_attached_block",
  "liquid_flowable_block",
  "simple_particle_block",
  "wall_torch_particle_block",
  "fence_block",
  "button_block",
  "face_attached_horizontal_directional_block",
  "stem_block",
  "attached_stem_block",
  "chime_block",
  "budding_block",
  "seat_block",
  "surface_spreading_block",
  "snowy_block",
  "hangable_block",
  "drop_experience_block",
  "drop_exp_block",
  "multi_high_block",
  "spreading_block",
  "item_frame_block",
  "display_item_block",
  "drawer_block",
  "tint_source_block",
  "vine_crop_head_block",
  "vine_crop_body_block",
  "decay_block",
  "seagrass_like_block",
] as const;
type BlockBehaviorType = (typeof BLOCK_BEHAVIOR_TYPES)[number];

export const BLOCK_BEHAVIOR_TYPE_DETAILS: Readonly<Record<string, string>> = {
  empty: Messages.src.config.block.schema.text0293,
  bush_block: Messages.src.config.block.schema.text0294,
  hanging_block: Messages.src.config.block.schema.text0295,
  falling_block: Messages.src.config.block.schema.text0296,
  leaves_block: Messages.src.config.block.schema.text0297,
  strippable_block: Messages.src.config.block.schema.text0298,
  sapling_block: Messages.src.config.block.schema.text0299,
  on_liquid_block: Messages.src.config.block.schema.text0300,
  near_liquid_block: Messages.src.config.block.schema.text0301,
  concrete_powder_block: Messages.src.config.block.schema.text0302,
  vertical_crop_block: Messages.src.config.block.schema.text0303,
  crop_block: Messages.src.config.block.schema.text0304,
  grass_block: Messages.src.config.block.schema.text0305,
  lamp_block: Messages.src.config.block.schema.text0306,
  trapdoor_block: Messages.src.config.block.schema.text0307,
  door_block: Messages.src.config.block.schema.text0308,
  stackable_block: Messages.src.config.block.schema.text0309,
  sturdy_base_block: Messages.src.config.block.schema.text0310,
  fence_gate_block: Messages.src.config.block.schema.text0311,
  slab_block: Messages.src.config.block.schema.text0312,
  stairs_block: Messages.src.config.block.schema.text0313,
  pressure_plate_block: Messages.src.config.block.schema.text0314,
  double_high_block: Messages.src.config.block.schema.text0315,
  change_over_time_block: Messages.src.config.block.schema.text0316,
  simple_storage_block: Messages.src.config.block.schema.text0317,
  toggleable_lamp_block: Messages.src.config.block.schema.text0318,
  sofa_block: Messages.src.config.block.schema.text0319,
  bouncing_block: Messages.src.config.block.schema.text0320,
  directional_attached_block: Messages.src.config.block.schema.text0321,
  liquid_flowable_block: Messages.src.config.block.schema.text0322,
  simple_particle_block: Messages.src.config.block.schema.text0323,
  wall_torch_particle_block: Messages.src.config.block.schema.text0324,
  fence_block: Messages.src.config.block.schema.text0325,
  button_block: Messages.src.config.block.schema.text0326,
  face_attached_horizontal_directional_block:
    Messages.src.config.block.schema.text0327,
  stem_block: Messages.src.config.block.schema.text0328,
  attached_stem_block: Messages.src.config.block.schema.text0329,
  chime_block: Messages.src.config.block.schema.text0330,
  budding_block: Messages.src.config.block.schema.text0331,
  seat_block: Messages.src.config.block.schema.text0332,
  surface_spreading_block: Messages.src.config.block.schema.text0333,
  snowy_block: Messages.src.config.block.schema.text0334,
  hangable_block: Messages.src.config.block.schema.text0335,
  drop_experience_block: Messages.src.config.block.schema.text0336,
  drop_exp_block: Messages.src.config.block.schema.text0337,
  multi_high_block: Messages.src.config.block.schema.text0338,
  spreading_block: Messages.src.config.block.schema.text0339,
  item_frame_block: Messages.src.config.block.schema.text0340,
  display_item_block: Messages.src.config.block.schema.text0341,
  drawer_block: Messages.src.config.block.schema.text0342,
  tint_source_block: Messages.src.config.block.schema.text0343,
  vine_crop_head_block: Messages.src.config.block.schema.text0344,
  vine_crop_body_block: Messages.src.config.block.schema.text0345,
  decay_block: Messages.src.config.block.schema.text0346,
  seagrass_like_block: "要求方块放置在完整水源中的海草式行为",
};

const f = field;
const n = number;
const b = bool;
const l = list;
const blockRef = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
) => f(label, detail, { aliases, valueProvider: "block-id", required });
const VINE_BONE_MEAL_FIELDS: readonly SchemaField[] = [
  field("behavior", Messages.src.config.block.schema.text0347),
  numberProvider("grow_blocks", Messages.src.config.block.schema.text0348, [
    "grow-blocks",
  ]),
];

  // CraftEngine SeatConfig: 座位既支持 "x,y,z [yaw [force]]" 字符串, 也支持映射形式
export const SEAT_FIELDS: readonly SchemaField[] = [
  field("position", "座位相对于家具/方块的位置", { required: true }),
  number("yaw", "座位朝向; 省略时按实体默认朝向"),
  bool(
    "limit_player_rotation",
    "是否限制玩家视角; 默认与是否写了 yaw 一致",
    ["limit-player-rotation"],
  ),
  field(
    "force_player_rotation",
    "强制玩家视角角度; true 表示与 yaw 相同, false 表示不调整",
    { aliases: ["force-player-rotation"] },
  ),
];
const behaviorFields = new Map<string, readonly SchemaField[]>([
  ["empty", []],
  ["seagrass_like_block", []],
  [
    "bush_block",
    [
      n("delay", Messages.src.config.block.schema.text0349),
      b("blacklist", Messages.src.config.block.schema.text0350),
      b("stackable", Messages.src.config.block.schema.text0351),
      n("max_height", Messages.src.config.block.schema.text0352, [
        "max-height",
      ]),
      blockTagList(
        "bottom_block_tags",
        Messages.src.config.block.schema.text0353,
        ["bottom-block-tags"],
      ),
      l("bottom_blocks", Messages.src.config.block.schema.text0354, [
        "bottom-blocks",
      ]),
    ],
  ],
  [
    "hanging_block",
    [
      n("delay", Messages.src.config.block.schema.text0355),
      b("blacklist", Messages.src.config.block.schema.text0356),
      b("stackable", Messages.src.config.block.schema.text0357),
      n("max_height", Messages.src.config.block.schema.text0358, [
        "max-height",
      ]),
      blockTagList(
        "above_block_tags",
        Messages.src.config.block.schema.text0359,
        ["above-block-tags"],
      ),
      l("above_blocks", Messages.src.config.block.schema.text0360, [
        "above-blocks",
      ]),
    ],
  ],
  [
    "falling_block",
    [
      n("hurt_amount", Messages.src.config.block.schema.text0361, [
        "hurt-amount",
      ]),
      n("max_hurt", Messages.src.config.block.schema.text0362, ["max-hurt"]),
      mapping("sounds", Messages.src.config.block.schema.text0363),
    ],
  ],
  ["leaves_block", []],
  [
    "strippable_block",
    [
      blockRef("stripped", Messages.src.config.block.schema.text0364, [], true),
      l("excluded_properties", Messages.src.config.block.schema.text0365, [
        "excluded-properties",
      ]),
      field(
        "tool",
        "可用工具或物品标签(# 开头); 默认 #minecraft:axes",
        {
          aliases: ["tools"],
          valueProvider: "item-id",
        },
      ),
      field("sound", "剥皮时播放的声音", { valueProvider: "sound" }),
    ],
  ],
  [
    "sapling_block",
    [
      f("feature", Messages.src.config.block.schema.text0366, {
        aliases: ["configured_feature", "configured-feature"],
        valueProvider: "configured-feature-id",
        registry: "minecraft:worldgen/configured_feature",
        required: true,
      }),
      f("structure", "原版结构 ID; 与 feature 二选一, 同时存在时优先生成结构", {
        valueProvider: "registry",
        registry: "minecraft:worldgen/structure",
      }),
      n("bone_meal_success_chance", Messages.src.config.block.schema.text0367, [
        "bone-meal-success-chance",
      ]),
      n("grow_speed", Messages.src.config.block.schema.text0368, [
        "grow-speed",
      ]),
      n("light_requirement", Messages.src.config.block.schema.text0369, [
        "light-requirement",
      ]),
      n("max_light_requirement", Messages.src.config.block.schema.text0370, [
        "max-light-requirement",
      ]),
    ],
  ],
  [
    "on_liquid_block",
    [
      l("liquid_type", Messages.src.config.block.schema.text0371, [
        "liquid-type",
      ]),
      n("delay", Messages.src.config.block.schema.text0372),
      b("stackable", Messages.src.config.block.schema.text0373),
    ],
  ],
  [
    "near_liquid_block",
    [
      l("liquid_type", Messages.src.config.block.schema.text0374, [
        "liquid-type",
      ]),
      l("positions", Messages.src.config.block.schema.text0375),
      n("delay", Messages.src.config.block.schema.text0376),
      b("stackable", Messages.src.config.block.schema.text0377),
    ],
  ],
  [
    "concrete_powder_block",
    [
      blockRef(
        "solid_block",
        Messages.src.config.block.schema.text0378,
        ["solid-block"],
        true,
      ),
    ],
  ],
  [
    "vertical_crop_block",
    [
      n("max_height", Messages.src.config.block.schema.text0379, [
        "max-height",
      ]),
      n("grow_speed", Messages.src.config.block.schema.text0380, [
        "grow-speed",
      ]),
      f("direction", Messages.src.config.block.schema.text0381, {
        values: ["up", "down"],
        valueDetails: {
          up: Messages.src.config.block.schema.text0382,
          down: Messages.src.config.block.schema.text0383,
        },
      }),
    ],
  ],
  [
    "crop_block",
    [
      n("grow_speed", Messages.src.config.block.schema.text0384, [
        "grow-speed",
      ]),
      n("light_requirement", Messages.src.config.block.schema.text0385, [
        "light-requirement",
      ]),
      n("max_light_requirement", Messages.src.config.block.schema.text0386, [
        "max-light-requirement",
      ]),
      n("spawn_light_requirement", Messages.src.config.block.schema.text0387, [
        "spawn-light-requirement",
      ]),
      n(
        "max_spawn_light_requirement",
        Messages.src.config.block.schema.text0388,
        ["max-spawn-light-requirement"],
      ),
      b("is_bone_meal_target", Messages.src.config.block.schema.text0389, [
        "is-bone-meal-target",
      ]),
      numberProvider(
        "bone_meal_age_bonus",
        Messages.src.config.block.schema.text0390,
        ["bone-meal-age-bonus"],
      ),
    ],
  ],
  [
    "grass_block",
    [
      f("feature", Messages.src.config.block.schema.text0391, {
        aliases: ["placed_feature", "placed-feature"],
        valueProvider: "placed-feature-id",
        registry: "minecraft:worldgen/placed_feature",
        required: true,
      }),
    ],
  ],
  ["lamp_block", []],
  [
    "trapdoor_block",
    [
      b("can_open_with_hand", Messages.src.config.block.schema.text0392, [
        "can-open-with-hand",
      ]),
      b("can_open_by_wind_charge", Messages.src.config.block.schema.text0393, [
        "can-open-by-wind-charge",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0394),
    ],
  ],
  [
    "door_block",
    [
      b("can_open_with_hand", Messages.src.config.block.schema.text0395, [
        "can-open-with-hand",
      ]),
      b("can_open_by_wind_charge", Messages.src.config.block.schema.text0396, [
        "can-open-by-wind-charge",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0397),
    ],
  ],
  [
    "stackable_block",
    [
      f("property", Messages.src.config.block.schema.text0398),
      l("items", Messages.src.config.block.schema.text0399, ["item"]),
    ],
  ],
  [
    "sturdy_base_block",
    [
      n("delay", Messages.src.config.block.schema.text0400),
      f("direction", Messages.src.config.block.schema.text0401, {
        values: BLOCK_PROPERTY_ENUM_VALUES.direction ?? [],
        valueDetails: BLOCK_PROPERTY_VALUE_DETAILS,
      }),
      b("stackable", Messages.src.config.block.schema.text0402),
      l("support_types", Messages.src.config.block.schema.text0403, [
        "support-types",
      ]),
      n("max_height", Messages.src.config.block.schema.text0404, [
        "max-height",
      ]),
    ],
  ],
  [
    "fence_gate_block",
    [
      b("can_open_with_hand", Messages.src.config.block.schema.text0405, [
        "can-open-with-hand",
      ]),
      b("can_open_by_wind_charge", Messages.src.config.block.schema.text0406, [
        "can-open-by-wind-charge",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0407),
    ],
  ],
  ["slab_block", []],
  ["stairs_block", []],
  [
    "pressure_plate_block",
    [
      f("sensitivity", Messages.src.config.block.schema.text0408, {
        values: ["everything", "all", "mobs", "mob"],
        valueDetails: {
          everything: Messages.src.config.block.schema.text0409,
          all: Messages.src.config.block.schema.text0410,
          mobs: Messages.src.config.block.schema.text0411,
          mob: Messages.src.config.block.schema.text0412,
        },
      }),
      n("pressed_time", Messages.src.config.block.schema.text0413, [
        "pressed-time",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0414),
    ],
  ],
  ["double_high_block", []],
  [
    "change_over_time_block",
    [
      n("change_speed", Messages.src.config.block.schema.text0415, [
        "change-speed",
      ]),
      blockRef(
        "next_block",
        Messages.src.config.block.schema.text0416,
        ["next-block"],
        true,
      ),
      l("excluded_properties", Messages.src.config.block.schema.text0417, [
        "excluded-properties",
      ]),
    ],
  ],
  [
    "simple_storage_block",
    [
      f("title", Messages.src.config.block.schema.text0418),
      n("rows", Messages.src.config.block.schema.text0419),
      mapping("sounds", Messages.src.config.block.schema.text0420),
      b("has_signal", Messages.src.config.block.schema.text0421, [
        "has-signal",
      ]),
      b("allow_input", Messages.src.config.block.schema.text0422, [
        "allow-input",
      ]),
      b("allow_output", Messages.src.config.block.schema.text0423, [
        "allow-output",
      ]),
      f("data_key", Messages.src.config.block.schema.text0424, {
        aliases: ["data-key"],
      }),
    ],
  ],
  [
    "toggleable_lamp_block",
    [
      b("can_open_with_hand", Messages.src.config.block.schema.text0425, [
        "can_toggle_with_hand",
        "can-open-with-hand",
        "can-toggle-with-hand",
      ]),
    ],
  ],
  ["sofa_block", []],
  [
    "bouncing_block",
    [
      n("bounce_height", Messages.src.config.block.schema.text0426, [
        "bounce-height",
      ]),
      b("sync_player_position", Messages.src.config.block.schema.text0427, [
        "sync-player-position",
      ]),
      n("fall_damage_multiplier", Messages.src.config.block.schema.text0428, [
        "fall-damage-multiplier",
      ]),
    ],
  ],
  [
    "directional_attached_block",
    [
      b("blacklist", Messages.src.config.block.schema.text0429),
      blockTagList(
        "attached_block_tags",
        Messages.src.config.block.schema.text0430,
        ["attached-block-tags"],
      ),
      l("attached_blocks", Messages.src.config.block.schema.text0431, [
        "attached-blocks",
      ]),
    ],
  ],
  [
    "liquid_flowable_block",
    [b("drop_item", Messages.src.config.block.schema.text0432, ["drop-item"])],
  ],
  [
    "simple_particle_block",
    [
      list("particles", Messages.src.config.block.schema.text0433, [
        "particle",
      ]),
      n("tick_interval", Messages.src.config.block.schema.text0434, [
        "tick-interval",
      ]),
    ],
  ],
  [
    "wall_torch_particle_block",
    [
      list("particles", Messages.src.config.block.schema.text0435, [
        "particle",
      ]),
      n("tick_interval", Messages.src.config.block.schema.text0436, [
        "tick-interval",
      ]),
    ],
  ],
  [
    "fence_block",
    [
      f("connectable_block_tag", Messages.src.config.block.schema.text0437, {
        aliases: ["connectable-block-tag"],
        valueProvider: "block-tag",
      }),
      b("can_leash", Messages.src.config.block.schema.text0438, ["can-leash"]),
    ],
  ],
  [
    "button_block",
    [
      n("ticks_to_stay_pressed", Messages.src.config.block.schema.text0439, [
        "ticks-to-stay-pressed",
      ]),
      b(
        "can_be_activated_by_arrows",
        Messages.src.config.block.schema.text0440,
        ["can-be-activated-by-arrows"],
      ),
      mapping("sounds", Messages.src.config.block.schema.text0441),
    ],
  ],
  [
    "face_attached_horizontal_directional_block",
    [
      b("blacklist", Messages.src.config.block.schema.text0442),
      blockTagList(
        "attached_block_tags",
        Messages.src.config.block.schema.text0443,
        ["attached-block-tags"],
      ),
      l("attached_blocks", Messages.src.config.block.schema.text0444, [
        "attached-blocks",
      ]),
    ],
  ],
  [
    "stem_block",
    [
      blockRef("fruit", Messages.src.config.block.schema.text0445, [], true),
      blockRef(
        "attached_stem",
        Messages.src.config.block.schema.text0446,
        ["attached-stem"],
        true,
      ),
      n("light_requirement", Messages.src.config.block.schema.text0447, [
        "light-requirement",
      ]),
      n("max_light_requirement", Messages.src.config.block.schema.text0448, [
        "max-light-requirement",
      ]),
      blockTagList(
        "fruit_bottom_block_tags",
        Messages.src.config.block.schema.text0449,
        ["fruit-bottom-block-tags"],
      ),
      l("fruit_bottom_blocks", Messages.src.config.block.schema.text0450, [
        "fruit-bottom-blocks",
      ]),
    ],
  ],
  [
    "attached_stem_block",
    [
      blockRef("fruit", Messages.src.config.block.schema.text0451, [], true),
      blockRef("stem", Messages.src.config.block.schema.text0452, [], true),
    ],
  ],
  [
    "chime_block",
    [mapping("sounds", Messages.src.config.block.schema.text0453)],
  ],
  [
    "budding_block",
    [
      n("growth_chance", Messages.src.config.block.schema.text0454, [
        "growth-chance",
      ]),
      l("blocks", Messages.src.config.block.schema.text0455),
    ],
  ],
  ["seat_block", [l("seats", Messages.src.config.block.schema.text0456)]],
  [
    "surface_spreading_block",
    [
      n("light_requirement", Messages.src.config.block.schema.text0457, [
        "light-requirement",
        "required_light",
        "required-light",
      ]),
      n("max_light_requirement", Messages.src.config.block.schema.text0458, [
        "max-light-requirement",
      ]),
      blockRef("base_block", Messages.src.config.block.schema.text0459, [
        "base-block",
      ]),
    ],
  ],
  ["snowy_block", []],
  ["hangable_block", []],
  [
    "drop_experience_block",
    [
      numberProvider("amount", Messages.src.config.block.schema.text0460, [
        "count",
      ]),
      list("conditions", Messages.src.config.block.schema.text0461, [
        "condition",
      ]),
    ],
  ],
  [
    "drop_exp_block",
    [
      numberProvider("amount", Messages.src.config.block.schema.text0462, [
        "count",
      ]),
      list("conditions", Messages.src.config.block.schema.text0463, [
        "condition",
      ]),
    ],
  ],
  [
    "multi_high_block",
    [
      f("property", Messages.src.config.block.schema.text0464, {
        required: true,
      }),
    ],
  ],
  [
    "spreading_block",
    [
      blockRef(
        "target_block",
        Messages.src.config.block.schema.text0465,
        ["target-block"],
        true,
      ),
    ],
  ],
  [
    "item_frame_block",
    [
      f("position", Messages.src.config.block.schema.text0466),
      b("glow", Messages.src.config.block.schema.text0467),
      b("invisible", Messages.src.config.block.schema.text0468),
      b("render_map_item", Messages.src.config.block.schema.text0469, [
        "render-map-item",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0470),
      f("data_key", Messages.src.config.block.schema.text0471, {
        aliases: ["data-key"],
      }),
    ],
  ],
  [
    "display_item_block",
    [
      f("position", Messages.src.config.block.schema.text0472),
      b("has_signal", Messages.src.config.block.schema.text0473, [
        "has-signal",
      ]),
      b("tint_source", Messages.src.config.block.schema.text0474, [
        "tint-source",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0475),
      f("data_key", Messages.src.config.block.schema.text0476, {
        aliases: ["data-key"],
      }),
    ],
  ],
  [
    "drawer_block",
    [
      b("has_signal", Messages.src.config.block.schema.text0477, [
        "has-signal",
      ]),
      f("item_position", Messages.src.config.block.schema.text0478, {
        aliases: ["item-position"],
      }),
      f("text_position", Messages.src.config.block.schema.text0479, {
        aliases: ["text-position"],
      }),
      f("item_scale", Messages.src.config.block.schema.text0480, {
        aliases: ["item-scale"],
      }),
      f("text_scale", Messages.src.config.block.schema.text0481, {
        aliases: ["text-scale"],
      }),
      n("max_stacks", Messages.src.config.block.schema.text0482, [
        "max-stacks",
      ]),
      b("allow_input", Messages.src.config.block.schema.text0483, [
        "allow-input",
      ]),
      b("allow_output", Messages.src.config.block.schema.text0484, [
        "allow-output",
      ]),
      b("compatible_mode", Messages.src.config.block.schema.text0485, [
        "compatible-mode",
      ]),
      mapping("sounds", Messages.src.config.block.schema.text0486),
      f("data_key", Messages.src.config.block.schema.text0487, {
        aliases: ["data-key"],
      }),
    ],
  ],
  [
    "tint_source_block",
    [
      b("drop_item", Messages.src.config.block.schema.text0488, ["drop-item"]),
      f("data_key", Messages.src.config.block.schema.text0489, {
        aliases: ["data-key"],
      }),
    ],
  ],
  [
    "vine_crop_head_block",
    [
      n("max_height", Messages.src.config.block.schema.text0490, [
        "max-height",
      ]),
      n("grow_speed", Messages.src.config.block.schema.text0491, [
        "grow-speed",
      ]),
      f("direction", Messages.src.config.block.schema.text0492),
      blockRef("body", Messages.src.config.block.schema.text0493, [], true),
      n("delay", Messages.src.config.block.schema.text0494),
      mapping("bone_meal", Messages.src.config.block.schema.text0495, [
        "bone-meal",
      ]),
    ],
  ],
  [
    "vine_crop_body_block",
    [
      f("direction", Messages.src.config.block.schema.text0496),
      blockRef("head", Messages.src.config.block.schema.text0497, [], true),
      n("delay", Messages.src.config.block.schema.text0498),
      mapping("bone_meal", Messages.src.config.block.schema.text0499, [
        "bone-meal",
      ]),
    ],
  ],
  [
    "decay_block",
    [
      numberProvider("delay", Messages.src.config.block.schema.text0500),
      n("required_light", Messages.src.config.block.schema.text0501, [
        "required-light",
      ]),
      blockRef("decay_into", Messages.src.config.block.schema.text0502, [
        "decay-into",
      ]),
      numberProvider("chance", Messages.src.config.block.schema.text0503),
    ],
  ],
]);
  // behaviorFields 与 BLOCK_BEHAVIOR_TYPES 一一对应, 用 Map 自身的键做收窄
function isBlockBehaviorType(type: string): type is BlockBehaviorType {
  return behaviorFields.has(type);
}

const BLOCK_BEHAVIOR_NUMBER_PROVIDER_FIELDS = new Map<
  string,
  ReadonlySet<string>
>([
  ["crop_block", new Set(["bone_meal_age_bonus"])],
  ["drop_experience_block", new Set(["amount", "count"])],
  ["drop_exp_block", new Set(["amount", "count"])],
  ["vine_crop_head_block", new Set(["grow_blocks"])],
  ["vine_crop_body_block", new Set(["grow_blocks"])],
  ["decay_block", new Set(["delay", "chance"])],
]);

function exactCraftEngineType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(":");
  if (separator < 0) return value;
  return value.slice(0, separator) === "craftengine"
    ? value.slice(separator + 1)
    : undefined;
}

function ancestorBlockBehaviorType(context: SchemaContext): string | undefined {
  for (const type of context.ancestorTypes ?? []) {
    const local = exactCraftEngineType(type);
    if (local && (BLOCK_BEHAVIOR_TYPES as readonly string[]).includes(local))
      return local;
  }
  return undefined;
}

function blockNumberProviderFields(
  nested: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] | undefined {
  const tail = nested.at(-1);
  if (!tail) return undefined;
  const parentType = context.ancestorTypes?.[0];
  const resolvedProvider = resolveNumberProviderType(parentType);
  if (
    resolvedProvider &&
    !resolvedProvider.external &&
    (NUMBER_PROVIDER_TYPES as readonly string[]).includes(resolvedProvider.name)
  ) {
    return numberProviderAllowsNestedField(parentType, tail)
      ? numberProviderFields(context.siblingValues.get("type"))
      : [];
  }

  const compact = nested.filter((entry) => !/^\d+$/u.test(entry));
  if (compact.includes("sounds") && (tail === "volume" || tail === "pitch")) {
    return numberProviderFields(context.siblingValues.get("type"));
  }
  if (compact.includes("particles") || compact.includes("particle")) {
    const particleField = particleConfigFieldsForType(undefined).find(
      (candidate) =>
        candidate.label === tail || candidate.aliases.includes(tail),
    );
    if (particleField?.valueProvider === "number-provider") {
      return numberProviderFields(context.siblingValues.get("type"));
    }
  }
  const behaviorType = ancestorBlockBehaviorType(context);
  if (
    behaviorType &&
    BLOCK_BEHAVIOR_NUMBER_PROVIDER_FIELDS.get(behaviorType)?.has(tail)
  ) {
    return numberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

function mergedFields(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const result = new Map<string, SchemaField>();
  for (const group of groups)
    for (const candidate of group) result.set(candidate.semantic, candidate);
  return [...result.values()];
}

function propertyFields(type: string | undefined): readonly SchemaField[] {
  const normalized = localRegistryDiscriminator(type);
  if (
    type !== undefined &&
    (!normalized ||
      !(BLOCK_PROPERTY_TYPES as readonly string[]).includes(normalized))
  ) {
    return isValidRegistryDiscriminator(type)
      ? []
      : PROPERTY_COMMON_FIELDS.slice(0, 1);
  }
  if (normalized === "int")
    return [
      field("type", Messages.src.config.block.schema.text0504, {
        values: BLOCK_PROPERTY_TYPES,
        valueDetails: BLOCK_PROPERTY_TYPE_DETAILS,
      }),
      field("range", Messages.src.config.block.schema.text0505),
      number("min", Messages.src.config.block.schema.text0506),
      number("max", Messages.src.config.block.schema.text0507),
      number("default", Messages.src.config.block.schema.text0508),
    ];
  if (normalized === "boolean")
    return [
      field("type", Messages.src.config.block.schema.text0509, {
        values: BLOCK_PROPERTY_TYPES,
        valueDetails: BLOCK_PROPERTY_TYPE_DETAILS,
      }),
      field("default", Messages.src.config.block.schema.text0510, {
        valueProvider: "boolean",
        values: ["true", "false"],
        valueDetails: BLOCK_PROPERTY_VALUE_DETAILS,
      }),
    ];
  const values = normalized
    ? BLOCK_PROPERTY_ENUM_VALUES[normalized]
    : undefined;
  return PROPERTY_COMMON_FIELDS.map((candidate) =>
    candidate.label === "values" && values
      ? { ...candidate, values, valueDetails: BLOCK_PROPERTY_VALUE_DETAILS }
      : candidate.label === "default" && values
        ? { ...candidate, values, valueDetails: BLOCK_PROPERTY_VALUE_DETAILS }
        : candidate,
  );
}

function rendererFields(type: string | undefined): readonly SchemaField[] {
  const normalized = localRegistryDiscriminator(type);
  if (!type) return mergedFields(RENDERER_COMMON, ...RENDERER_FIELDS.values());
  if (
    !normalized ||
    !BLOCK_RENDERER_TYPES.includes(
      normalized as (typeof BLOCK_RENDERER_TYPES)[number],
    )
  ) {
    return isValidRegistryDiscriminator(type)
      ? []
      : RENDERER_COMMON.slice(0, 1);
  }
  return mergedFields(
    RENDERER_COMMON,
    normalized ? (RENDERER_FIELDS.get(normalized) ?? []) : [],
  );
}

function visualFields(
  path: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] {
  if (path.length === 0) return VISUAL_FIELDS;
  const first = path[0];
  if (first === "auto_state") return AUTO_STATE_DETAIL_FIELDS;
  if (first === "model" || first === "models") {
    const modelPath = path.slice(1).filter((entry) => !/^\d+$/u.test(entry));
    const generationIndex = modelPath.lastIndexOf("generation");
    if (generationIndex >= 0) {
      const generationPath = modelPath.slice(generationIndex + 1);
      if (generationPath.length === 0) return GENERATION_FIELDS;
      if (generationPath.length === 1 && generationPath[0] === "display") {
        return DISPLAY_CONTEXTS.map((name) =>
          mapping(
            name,
            DISPLAY_CONTEXT_DETAILS[name] ??
              Messages.src.config.block.schema.text0511,
          ),
        );
      }
      if (generationPath.length === 2 && generationPath[0] === "display")
        return DISPLAY_TRANSFORM_FIELDS;
      return [];
    }
    return MODEL_FIELDS;
  }
  if (first && ["entity_renderer", "entity_render"].includes(first)) {
    const rendererPath = path.slice(1).filter((entry) => !/^\d+$/u.test(entry));
    const tail = rendererPath.at(-1);
    if (tail === "brightness") return BRIGHTNESS_FIELDS;
    if (tail === "tint_source")
      return tintSourceFields(context.siblingValues.get("type"));
    if (
      rendererPath.includes("conditions") ||
      rendererPath.includes("condition")
    ) {
      return fieldsForDiscriminator(
        "condition",
        context.siblingValues.get("type"),
      );
    }
    return rendererFields(context.siblingValues.get("type"));
  }
  return [];
}

function isSeatEntryPath(nested: readonly string[]): boolean {
  const slot = nested.at(-1);
  return (
    nested.at(-2) === "seats" && slot !== undefined && /^\d+$/u.test(slot)
  );
}

export function blockFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = context.path
    .slice(1)
    .map((entry) => entry.replaceAll("-", "_"));
  if (nested.length === 0) return BLOCK_ROOT_FIELDS;
  const first = nested[0];
  if (
    (first === "behavior" || first === "behaviors") &&
    (context.ancestorTypes?.length ?? 0) > 0
  ) {
  // 遇到没见过的 behavior 时, 不要再补里面的字段
    const localOwner = localRegistryDiscriminator(
      context.ancestorTypes?.at(-1),
    );
    if (
      !localOwner ||
      !(BLOCK_BEHAVIOR_TYPES as readonly string[]).includes(localOwner)
    ) {
      return withTemplateSchemaFields(context.path, []);
    }
  }
  if (first === "events" || first === "event") {
    return itemFieldsForContext({
      ...context,
      path: ["block-event", ...nested],
    });
  }
  const providerFields = blockNumberProviderFields(nested, context);
  if (providerFields !== undefined) return providerFields;
  if (first === "state" || first === "states") {
    if (nested.length === 1) return STATE_FIELDS;
    if (nested[1] === "properties") {
      if (nested.length <= 2) return [];
      return propertyFields(context.siblingValues.get("type"));
    }
    if (nested[1] === "appearance" || nested[1] === "appearances") {
      if (nested.length <= 2) return [];
      return visualFields(nested.slice(3), context);
    }
    if (nested[1] === "variants") {
      if (nested.length <= 2) return [];
      if (nested[3] === "settings")
        return nested.length === 4
          ? BLOCK_SETTING_FIELDS
          : settingNestedFields(
              nested
                .slice(4)
                .map((value) =>
                  value.replace(/#.*$/u, "").replaceAll("-", "_"),
                ),
            );
      return [
        field("appearance", Messages.src.config.block.schema.text0512, {
          aliases: ["appearances"],
        }),
        mapping("settings", Messages.src.config.block.schema.text0513),
      ];
    }
    return visualFields(nested.slice(1), context);
  }
  if (first === "settings")
    return nested.length === 1
      ? BLOCK_SETTING_FIELDS
      : settingNestedFields(
          nested
            .slice(1)
            .map((value) =>
              value.replace(/#.*$/u, "").replaceAll("-", "_"),
            ),
        );
  if (first === "entity_culling") return CULLING_FIELDS;
  if (first === "behavior" || first === "behaviors") {
    const compact = nested.filter((entry) => !/^\d+$/u.test(entry));
    const tail = compact.at(-1);
    if (isSeatEntryPath(nested)) return SEAT_FIELDS;
    if (tail === "particles" || tail === "particle") {
      return particleConfigFieldsForType(context.siblingValues.get("particle"));
    }
    if (tail === "bone_meal") return VINE_BONE_MEAL_FIELDS;
    // behavior.sounds 由该行为自己的通道表接管, 不能再回退成整张 behavior 字段表
    if (tail === "sounds")
      return behaviorSoundChannelFields(ancestorBlockBehaviorType(context));
    if (compact.includes("sounds")) return SOUND_DATA_FIELDS;
    const singleSoundIndex = compact.indexOf("sound");
    if (singleSoundIndex >= 0 && compact.length > singleSoundIndex)
      return SOUND_DATA_FIELDS;
    if (nested.includes("conditions") || nested.includes("condition")) {
      return fieldsForDiscriminator(
        "condition",
        context.siblingValues.get("type"),
      );
    }
    const rawType = context.siblingValues.get("type");
    const type = localRegistryDiscriminator(rawType);
    const common = field("type", Messages.src.config.block.schema.text0514, {
      values: BLOCK_BEHAVIOR_TYPES,
      valueDetails: BLOCK_BEHAVIOR_TYPE_DETAILS,
    });
    if (rawType && (!type || !isBlockBehaviorType(type))) {
      return isValidRegistryDiscriminator(rawType) ? [] : [common];
    }
    const typeFields = type
      ? behaviorFields.get(type)!
      : [...behaviorFields.values()].flat();
      // 写了 structure 时 feature / configured_feature 不再是必填
    const fields =
      type === "sapling_block" && context.siblingValues.has("structure")
        ? typeFields.map((candidate) =>
            candidate.label === "feature"
              ? { ...candidate, required: false }
              : candidate,
          )
        : typeFields;
    return mergedFields([common], fields);
  }
  return [];
}

function settingNestedFields(path: readonly string[]): readonly SchemaField[] {
  const first = path[0];
  if (first === "sounds")
    return path.length === 1 ? SOUND_CHANNEL_FIELDS : SOUND_DATA_FIELDS;
  if (first === "destroy_stages") {
    if (path.at(-1) === "brightness") return BRIGHTNESS_FIELDS;
    return DESTROY_STAGE_FIELDS;
  }
  return [];
}

export function blockListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const nested = path.slice(1).map((entry) => entry.replaceAll("-", "_"));
  const tail = nested.at(-1);
  const compact = nested.filter((entry) => !/^\d+$/u.test(entry));
  if (compact.at(-1) === "seats")
    return field(
      "seat",
      '座位; 支持 "x,y,z [yaw [force]]" 字符串或 position/yaw 映射',
    );
  if (
    tail === "tags" ||
    tail?.endsWith("_block_tags") ||
    tail === "client_bound_tags"
  ) {
    return field(
      Messages.src.config.block.schema.text0515,
      Messages.src.config.block.schema.text0516,
      { valueProvider: "block-tag" },
    );
  }
  if (tail === "texture" || tail === "textures")
    return field("texture", Messages.src.config.block.schema.text0517, {
      valueProvider: "texture",
    });
  if (tail === "tool" || tail === "tools")
    return field("tool", "可用工具或物品标签(# 开头)", {
      valueProvider: "item-id",
    });
  if (tail === "components" && nested.includes("tint_source"))
    return field("component", Messages.src.config.block.schema.text0518, {
      valueProvider: "component",
    });
  if (tail === "items" && nested.includes("destroy_stages"))
    return field("item", Messages.src.config.block.schema.text0519, {
      valueProvider: "item-id",
    });
  if (tail === "items" || tail === "item")
    return field("item", Messages.src.config.block.schema.text0520, {
      valueProvider: "item-id",
    });
  if (tail?.includes("blocks") || tail === "blocks")
    return field("block", Messages.src.config.block.schema.text0521, {
      valueProvider: "block-id",
    });
  return undefined;
}

export function blockGenerationTextureSlotFields(): readonly SchemaField[] {
  const details: Readonly<Record<string, string>> = {
    all: Messages.src.config.block.schema.text0522,
    end: Messages.src.config.block.schema.text0523,
    side: Messages.src.config.block.schema.text0524,
    bottom: Messages.src.config.block.schema.text0525,
    top: Messages.src.config.block.schema.text0526,
    front: Messages.src.config.block.schema.text0527,
    down: Messages.src.config.block.schema.text0528,
    up: Messages.src.config.block.schema.text0529,
    north: Messages.src.config.block.schema.text0530,
    south: Messages.src.config.block.schema.text0531,
    west: Messages.src.config.block.schema.text0532,
    east: Messages.src.config.block.schema.text0533,
    particle: Messages.src.config.block.schema.text0534,
    cross: Messages.src.config.block.schema.text0535,
    crop: Messages.src.config.block.schema.text0536,
  };
  return Object.entries(details).map(([label, detail]) =>
    field(label, detail, { valueProvider: "texture" }),
  );
}

export interface BlockPropertySuggestion {
  readonly name: string;
  readonly type?: string;
  readonly values: readonly string[];
  readonly defaultValue?: string;
}

function rawState(
  raw: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const selected = raw.state ?? raw.states;
  return isRecord(selected) ? selected : undefined;
}

export function blockPropertySuggestions(
  raw: Readonly<Record<string, unknown>>,
): readonly BlockPropertySuggestion[] {
  const properties = rawState(raw)?.properties;
  if (!isRecord(properties)) return [];
  return Object.entries(properties).flatMap(([name, value]) => {
    if (!isRecord(value)) return [{ name, values: [] }];
    const type =
      typeof value.type === "string"
        ? localRegistryDiscriminator(value.type)
        : undefined;
    let values: readonly string[] = [];
    if (type === "int") {
      const range =
        typeof value.range === "string"
          ? /^(-?\d+)~(-?\d+)$/u.exec(value.range.trim())
          : undefined;
      const min = range ? Number(range[1]) : Number(value.min);
      const max = range ? Number(range[2]) : Number(value.max);
      if (
        Number.isInteger(min) &&
        Number.isInteger(max) &&
        min <= max &&
        max - min <= 512
      ) {
        values = Array.from({ length: max - min + 1 }, (_entry, index) =>
          String(min + index),
        );
      }
    } else if (type === "string") {
      values = isUnknownArray(value.values)
        ? value.values.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
    } else if (type) {
      const allowed = BLOCK_PROPERTY_ENUM_VALUES[type] ?? [];
      values = isUnknownArray(value.values)
        ? value.values.filter(
            (entry): entry is string =>
              typeof entry === "string" &&
              allowed.includes(entry.toLowerCase()),
          )
        : allowed;
    }
    const defaultValue =
      typeof value.default === "string" ||
      typeof value.default === "number" ||
      typeof value.default === "boolean"
        ? String(value.default)
        : undefined;
    return [
      {
        name,
        ...(type === undefined ? {} : { type }),
        values,
        ...(defaultValue === undefined ? {} : { defaultValue }),
      },
    ];
  });
}

export function blockAppearanceNames(
  raw: Readonly<Record<string, unknown>>,
): readonly string[] {
  const state = rawState(raw);
  const appearances = state?.appearance ?? state?.appearances;
  return isRecord(appearances) ? Object.keys(appearances) : [];
}

export function blockSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  if (fields === BLOCK_SETTING_FIELDS) {
    const normalized = name.replace(/#.*$/u, "").replaceAll("-", "_");
    return fields.find((candidate) => candidate.semantic === normalized);
  }
  const semantic = semanticForField(name, fields);
  return fields.find(
    (candidate) =>
      candidate.label === name ||
      candidate.aliases.includes(name) ||
      candidate.semantic === semantic,
  );
}
