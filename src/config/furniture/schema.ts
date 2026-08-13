import {
  fieldsForDiscriminator,
  itemFieldsForContext,
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
import { Messages } from "../../messages.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { semanticForField } from "../schema/types.js";

interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
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
    valueDetails: {
      true: Messages.src.config.furniture.schema.text0001,
      false: Messages.src.config.furniture.schema.text0002,
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

export const FURNITURE_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.furniture.schema.text0003),
  bool("debug", Messages.src.config.furniture.schema.text0004),
  mapping("settings", Messages.src.config.furniture.schema.text0005),
  mapping("variants", Messages.src.config.furniture.schema.text0006, [
    "variant",
    "placement",
  ]),
  field("entity_culling", Messages.src.config.furniture.schema.text0007, {
    aliases: ["entity-culling"],
  }),
  mapping("events", Messages.src.config.furniture.schema.text0008, ["event"]),
  field("loot", Messages.src.config.furniture.schema.text0009, {
    aliases: ["loots"],
    valueProvider: "loot-id",
    snippet: "loot:\n  ${0}",
  }),
  list("behaviors", Messages.src.config.furniture.schema.text0010, [
    "behavior",
  ]),
];

export const FURNITURE_SETTING_FIELDS: readonly SchemaField[] = [
  field("item", Messages.src.config.furniture.schema.text0011, {
    valueProvider: "item-id",
  }),
  mapping("sounds", Messages.src.config.furniture.schema.text0012),
  number("hit_times", Messages.src.config.furniture.schema.text0013, [
    "hit-times",
  ]),
  bool(
    "adventure_mode_breaking",
    Messages.src.config.furniture.schema.text0014,
    ["adventure-mode-breaking"],
  ),
  field("correct_tools", Messages.src.config.furniture.schema.text0015, {
    aliases: ["correct-tools"],
    valueProvider: "item-id",
    snippet: "correct_tools:\n  - ${0}",
  }),
];

const SOUND_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.furniture.schema.text0016, {
    valueProvider: "sound",
  }),
  numberProvider("volume", Messages.src.config.furniture.schema.text0017),
  numberProvider("pitch", Messages.src.config.furniture.schema.text0018),
];

const FURNITURE_SOUND_CHANNELS: readonly SchemaField[] = [
  field("break", Messages.src.config.furniture.schema.text0019, {
    valueProvider: "sound",
  }),
  field("place", Messages.src.config.furniture.schema.text0020, {
    valueProvider: "sound",
  }),
  field("hit", Messages.src.config.furniture.schema.text0021, {
    valueProvider: "sound",
  }),
];

export const FURNITURE_VARIANT_FIELDS: readonly SchemaField[] = [
  field("loot_spawn_offset", Messages.src.config.furniture.schema.text0022, {
    aliases: ["loot-spawn-offset"],
  }),
  list("elements", Messages.src.config.furniture.schema.text0023),
  list("hitboxes", Messages.src.config.furniture.schema.text0024),
  field("blueprint", Messages.src.config.furniture.schema.text0025, {
    aliases: ["better-model", "model-engine"],
  }),
];

export const FURNITURE_ELEMENT_TYPES = [
  "item_display",
  "text_display",
  "block_display",
  "item",
  "armor_stand",
  "better_model",
  "model_engine",
] as const;

export const FURNITURE_ELEMENT_TYPE_DETAILS: Readonly<Record<string, string>> =
  {
    item_display: Messages.src.config.furniture.schema.text0026,
    text_display: Messages.src.config.furniture.schema.text0027,
    block_display: Messages.src.config.furniture.schema.text0028,
    item: Messages.src.config.furniture.schema.text0029,
    armor_stand: Messages.src.config.furniture.schema.text0030,
    better_model: Messages.src.config.furniture.schema.text0031,
    model_engine: Messages.src.config.furniture.schema.text0032,
  };

const BILLBOARD_VALUES = ["fixed", "vertical", "horizontal", "center"] as const;
const BILLBOARD_DETAILS = {
  fixed: Messages.src.config.furniture.schema.text0033,
  vertical: Messages.src.config.furniture.schema.text0034,
  horizontal: Messages.src.config.furniture.schema.text0035,
  center: Messages.src.config.furniture.schema.text0036,
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
const DISPLAY_CONTEXT_DETAILS: Readonly<Record<string, string>> = {
  none: Messages.src.config.furniture.schema.text0037,
  third_person_left_hand: Messages.src.config.furniture.schema.text0038,
  third_person_right_hand: Messages.src.config.furniture.schema.text0039,
  first_person_left_hand: Messages.src.config.furniture.schema.text0040,
  first_person_right_hand: Messages.src.config.furniture.schema.text0041,
  head: Messages.src.config.furniture.schema.text0042,
  gui: Messages.src.config.furniture.schema.text0043,
  ground: Messages.src.config.furniture.schema.text0044,
  fixed: Messages.src.config.furniture.schema.text0045,
  on_shelf: Messages.src.config.furniture.schema.text0046,
};
const LEGACY_COLOR_VALUES = [
  "black",
  "dark_blue",
  "dark_green",
  "dark_aqua",
  "dark_red",
  "dark_purple",
  "gold",
  "gray",
  "dark_gray",
  "blue",
  "green",
  "aqua",
  "red",
  "light_purple",
  "yellow",
  "white",
] as const;
const LEGACY_COLOR_DETAILS: Readonly<Record<string, string>> = {
  black: Messages.src.config.furniture.schema.text0047,
  dark_blue: Messages.src.config.furniture.schema.text0048,
  dark_green: Messages.src.config.furniture.schema.text0049,
  dark_aqua: Messages.src.config.furniture.schema.text0050,
  dark_red: Messages.src.config.furniture.schema.text0051,
  dark_purple: Messages.src.config.furniture.schema.text0052,
  gold: Messages.src.config.furniture.schema.text0053,
  gray: Messages.src.config.furniture.schema.text0054,
  dark_gray: Messages.src.config.furniture.schema.text0055,
  blue: Messages.src.config.furniture.schema.text0056,
  green: Messages.src.config.furniture.schema.text0057,
  aqua: Messages.src.config.furniture.schema.text0058,
  red: Messages.src.config.furniture.schema.text0059,
  light_purple: Messages.src.config.furniture.schema.text0060,
  yellow: Messages.src.config.furniture.schema.text0061,
  white: Messages.src.config.furniture.schema.text0062,
};

const ELEMENT_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.furniture.schema.text0063, {
    values: FURNITURE_ELEMENT_TYPES,
    valueDetails: FURNITURE_ELEMENT_TYPE_DETAILS,
  }),
  list("conditions", Messages.src.config.furniture.schema.text0064, [
    "condition",
  ]),
];
const DISPLAY_COMMON: readonly SchemaField[] = [
  field("scale", Messages.src.config.furniture.schema.text0065),
  field("position", Messages.src.config.furniture.schema.text0066),
  field("translation", Messages.src.config.furniture.schema.text0067),
  number("pitch", Messages.src.config.furniture.schema.text0068),
  number("yaw", Messages.src.config.furniture.schema.text0069),
  field("rotation", Messages.src.config.furniture.schema.text0070),
  field("billboard", Messages.src.config.furniture.schema.text0071, {
    values: BILLBOARD_VALUES,
    valueDetails: BILLBOARD_DETAILS,
  }),
  number("shadow_radius", Messages.src.config.furniture.schema.text0072, [
    "shadow-radius",
  ]),
  number("shadow_strength", Messages.src.config.furniture.schema.text0073, [
    "shadow-strength",
  ]),
  field("glow_color", Messages.src.config.furniture.schema.text0074, {
    aliases: ["glow-color"],
  }),
  mapping("brightness", Messages.src.config.furniture.schema.text0075),
  number("view_range", Messages.src.config.furniture.schema.text0076, [
    "view-range",
  ]),
];

const ELEMENT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "item_display",
    [
      field("item", Messages.src.config.furniture.schema.text0077, {
        valueProvider: "item-id",
        required: true,
      }),
      bool("apply_dyed_color", Messages.src.config.furniture.schema.text0078, [
        "apply-dyed-color",
      ]),
      field("display_context", Messages.src.config.furniture.schema.text0079, {
        aliases: ["display_transform", "display-context", "display-transform"],
        values: DISPLAY_CONTEXT_VALUES,
        valueDetails: DISPLAY_CONTEXT_DETAILS,
      }),
      mapping("tint_source", Messages.src.config.furniture.schema.text0080, [
        "tint-source",
      ]),
      ...DISPLAY_COMMON,
    ],
  ],
  [
    "text_display",
    [
      field("text", Messages.src.config.furniture.schema.text0081, {
        required: true,
      }),
      number("line_width", Messages.src.config.furniture.schema.text0082, [
        "line-width",
      ]),
      field("background_color", Messages.src.config.furniture.schema.text0083, {
        aliases: ["background-color"],
      }),
      number("text_opacity", Messages.src.config.furniture.schema.text0084, [
        "text-opacity",
      ]),
      bool("has_shadow", Messages.src.config.furniture.schema.text0085, [
        "has-shadow",
      ]),
      bool("is_see_through", Messages.src.config.furniture.schema.text0086, [
        "is-see-through",
      ]),
      bool(
        "use_default_background_color",
        Messages.src.config.furniture.schema.text0087,
        ["use-default-background-color"],
      ),
      field("alignment", Messages.src.config.furniture.schema.text0088, {
        values: ["center", "left", "right"],
        valueDetails: {
          center: Messages.src.config.furniture.schema.text0089,
          left: Messages.src.config.furniture.schema.text0090,
          right: Messages.src.config.furniture.schema.text0091,
        },
      }),
      ...DISPLAY_COMMON,
    ],
  ],
  [
    "block_display",
    [
      field("block", Messages.src.config.furniture.schema.text0092, {
        valueProvider: "block-state",
        required: true,
      }),
      ...DISPLAY_COMMON,
    ],
  ],
  [
    "item",
    [
      field("item", Messages.src.config.furniture.schema.text0093, {
        valueProvider: "item-id",
        required: true,
      }),
      bool("apply_dyed_color", Messages.src.config.furniture.schema.text0094, [
        "apply-dyed-color",
      ]),
      field("position", Messages.src.config.furniture.schema.text0095),
      mapping("tint_source", Messages.src.config.furniture.schema.text0096, [
        "tint-source",
      ]),
    ],
  ],
  [
    "armor_stand",
    [
      field("item", Messages.src.config.furniture.schema.text0097, {
        valueProvider: "item-id",
        required: true,
      }),
      bool("apply_dyed_color", Messages.src.config.furniture.schema.text0098, [
        "apply-dyed-color",
      ]),
      number("scale", Messages.src.config.furniture.schema.text0099),
      field("position", Messages.src.config.furniture.schema.text0100),
      number("pitch", Messages.src.config.furniture.schema.text0101),
      number("yaw", Messages.src.config.furniture.schema.text0102),
      bool("small", Messages.src.config.furniture.schema.text0103),
      field("glow_color", Messages.src.config.furniture.schema.text0104, {
        aliases: ["glow-color"],
        values: LEGACY_COLOR_VALUES,
        valueDetails: LEGACY_COLOR_DETAILS,
      }),
      mapping("tint_source", Messages.src.config.furniture.schema.text0105, [
        "tint-source",
      ]),
    ],
  ],
  [
    "better_model",
    [
      field("model", Messages.src.config.furniture.schema.text0106, {
        required: true,
      }),
      field("position", Messages.src.config.furniture.schema.text0107),
      number("yaw", Messages.src.config.furniture.schema.text0108),
      number("pitch", Messages.src.config.furniture.schema.text0109),
      bool("sight_trace", Messages.src.config.furniture.schema.text0110, [
        "sight-trace",
      ]),
    ],
  ],
  [
    "model_engine",
    [
      field("model", Messages.src.config.furniture.schema.text0111, {
        required: true,
      }),
      field("position", Messages.src.config.furniture.schema.text0112),
      number("yaw", Messages.src.config.furniture.schema.text0113),
      number("pitch", Messages.src.config.furniture.schema.text0114),
    ],
  ],
]);

export const FURNITURE_HITBOX_TYPES = [
  "interaction",
  "shulker",
  "happy_ghast",
  "custom",
] as const;
export const FURNITURE_HITBOX_TYPE_DETAILS: Readonly<Record<string, string>> = {
  interaction: Messages.src.config.furniture.schema.text0115,
  shulker: Messages.src.config.furniture.schema.text0116,
  happy_ghast: Messages.src.config.furniture.schema.text0117,
  custom: Messages.src.config.furniture.schema.text0118,
};
const DIRECTION_VALUES = [
  "down",
  "up",
  "north",
  "south",
  "west",
  "east",
] as const;
const HITBOX_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.furniture.schema.text0119, {
    values: FURNITURE_HITBOX_TYPES,
    valueDetails: FURNITURE_HITBOX_TYPE_DETAILS,
  }),
  field("position", Messages.src.config.furniture.schema.text0120),
  list("seats", Messages.src.config.furniture.schema.text0121),
  bool("can_use_item_on", Messages.src.config.furniture.schema.text0122, [
    "can-use-item-on",
  ]),
  bool("blocks_building", Messages.src.config.furniture.schema.text0123, [
    "blocks-building",
  ]),
  bool(
    "can_be_hit_by_projectile",
    Messages.src.config.furniture.schema.text0124,
    ["can-be-hit-by-projectile"],
  ),
];
const HITBOX_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "interaction",
    [
      number("scale", Messages.src.config.furniture.schema.text0125),
      number("width", Messages.src.config.furniture.schema.text0126),
      number("height", Messages.src.config.furniture.schema.text0127),
      bool("interactive", Messages.src.config.furniture.schema.text0128),
      bool("invisible", Messages.src.config.furniture.schema.text0129),
    ],
  ],
  [
    "shulker",
    [
      number("scale", Messages.src.config.furniture.schema.text0130),
      number("peek", Messages.src.config.furniture.schema.text0131),
      field("direction", Messages.src.config.furniture.schema.text0132, {
        values: DIRECTION_VALUES,
      }),
      bool(
        "interaction_entity",
        Messages.src.config.furniture.schema.text0133,
        ["interaction-entity"],
      ),
      bool("interactive", Messages.src.config.furniture.schema.text0134),
      bool("invisible", Messages.src.config.furniture.schema.text0135),
    ],
  ],
  [
    "happy_ghast",
    [
      number("scale", Messages.src.config.furniture.schema.text0136),
      bool("hard_collision", Messages.src.config.furniture.schema.text0137, [
        "hard-collision",
      ]),
    ],
  ],
  [
    "custom",
    [
      field("entity_type", Messages.src.config.furniture.schema.text0138, {
        aliases: ["entity-type"],
        valueProvider: "entity-type",
        required: true,
      }),
      number("scale", Messages.src.config.furniture.schema.text0139),
    ],
  ],
]);

export const FURNITURE_BEHAVIOR_TYPES = [
  "simple_storage_furniture",
  "display_item_furniture",
  "glowing_furniture",
] as const;
export const FURNITURE_BEHAVIOR_TYPE_DETAILS: Readonly<Record<string, string>> =
  {
    simple_storage_furniture: Messages.src.config.furniture.schema.text0140,
    display_item_furniture: Messages.src.config.furniture.schema.text0141,
    glowing_furniture: Messages.src.config.furniture.schema.text0142,
  };
const BEHAVIOR_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.furniture.schema.text0143, {
    values: FURNITURE_BEHAVIOR_TYPES,
    valueDetails: FURNITURE_BEHAVIOR_TYPE_DETAILS,
    required: true,
  }),
];
const BEHAVIOR_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "simple_storage_furniture",
    [
      field("title", Messages.src.config.furniture.schema.text0144),
      number("rows", Messages.src.config.furniture.schema.text0145),
      field("data_key", Messages.src.config.furniture.schema.text0146, {
        aliases: ["data-key"],
      }),
      mapping("sounds", Messages.src.config.furniture.schema.text0147),
      mapping("variants", Messages.src.config.furniture.schema.text0148),
    ],
  ],
  [
    "display_item_furniture",
    [
      field("data_key", Messages.src.config.furniture.schema.text0149, {
        aliases: ["data-key"],
      }),
      mapping("sounds", Messages.src.config.furniture.schema.text0150),
      mapping("variants", Messages.src.config.furniture.schema.text0151),
    ],
  ],
  [
    "glowing_furniture",
    [
      list("lights", Messages.src.config.furniture.schema.text0152),
      mapping("variants", Messages.src.config.furniture.schema.text0153),
    ],
  ],
]);

const CULLING_FIELDS: readonly SchemaField[] = [
  field("aabb", Messages.src.config.furniture.schema.text0154),
  number("view_distance", Messages.src.config.furniture.schema.text0155, [
    "view-distance",
  ]),
  number("aabb_expansion", Messages.src.config.furniture.schema.text0156, [
    "aabb-expansion",
  ]),
  bool("ray_tracing", Messages.src.config.furniture.schema.text0157, [
    "ray-tracing",
  ]),
];
const BRIGHTNESS_FIELDS: readonly SchemaField[] = [
  number("block_light", Messages.src.config.furniture.schema.text0158, [
    "block-light",
  ]),
  number("sky_light", Messages.src.config.furniture.schema.text0159, [
    "sky-light",
  ]),
];
const TINT_SOURCE_TYPE_FIELD = field(
  "type",
  Messages.src.config.furniture.schema.text0160,
  {
    values: ["default", "craftengine:default"],
    valueDetails: {
      default: Messages.src.config.furniture.schema.text0161,
      "craftengine:default": Messages.src.config.furniture.schema.text0162,
    },
  },
);
const TINT_SOURCE_FIELDS: readonly SchemaField[] = [
  TINT_SOURCE_TYPE_FIELD,
  field("components", Messages.src.config.furniture.schema.text0163, {
    valueProvider: "component",
    snippet: "components:\n  - ${0}",
  }),
];

function tintSourceFields(type: string | undefined): readonly SchemaField[] {
  if (!type || localRegistryDiscriminator(type) === "default")
    return TINT_SOURCE_FIELDS;
  return isValidRegistryDiscriminator(type) ? [] : [TINT_SOURCE_TYPE_FIELD];
}

function mergedFields(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const merged = new Map<string, SchemaField>();
  for (const group of groups)
    for (const candidate of group)
      if (!merged.has(candidate.semantic))
        merged.set(candidate.semantic, candidate);
  return [...merged.values()];
}

function elementFields(type: string | undefined): readonly SchemaField[] {
  const normalized = localRegistryDiscriminator(type);
  if (
    type &&
    (!normalized ||
      !FURNITURE_ELEMENT_TYPES.includes(
        normalized as (typeof FURNITURE_ELEMENT_TYPES)[number],
      ))
  ) {
    return isValidRegistryDiscriminator(type) ? [] : ELEMENT_COMMON.slice(0, 1);
  }
  return mergedFields(
    ELEMENT_COMMON,
    !type
      ? [...ELEMENT_FIELDS.values()].flat()
      : normalized
        ? (ELEMENT_FIELDS.get(normalized) ?? [])
        : [],
  );
}

function hitboxFields(type: string | undefined): readonly SchemaField[] {
  const normalized = type ? localRegistryDiscriminator(type) : "interaction";
  if (
    type &&
    (!normalized ||
      !FURNITURE_HITBOX_TYPES.includes(
        normalized as (typeof FURNITURE_HITBOX_TYPES)[number],
      ))
  ) {
    return isValidRegistryDiscriminator(type) ? [] : HITBOX_COMMON.slice(0, 1);
  }
  return mergedFields(
    HITBOX_COMMON,
    normalized ? (HITBOX_FIELDS.get(normalized) ?? []) : [],
  );
}

function behaviorFields(type: string | undefined): readonly SchemaField[] {
  const normalized = localRegistryDiscriminator(type);
  if (
    type &&
    (!normalized ||
      !FURNITURE_BEHAVIOR_TYPES.includes(
        normalized as (typeof FURNITURE_BEHAVIOR_TYPES)[number],
      ))
  ) {
    return isValidRegistryDiscriminator(type) ? [] : BEHAVIOR_COMMON;
  }
  return mergedFields(
    BEHAVIOR_COMMON,
    !type
      ? [...BEHAVIOR_FIELDS.values()].flat()
      : normalized
        ? (BEHAVIOR_FIELDS.get(normalized) ?? [])
        : [],
  );
}

export function furnitureBehaviorTypeForContext(
  context: SchemaContext,
): string | undefined {
  for (const rawType of [
    context.siblingValues.get("type"),
    ...(context.ancestorTypes ?? []),
  ]) {
    const type = localRegistryDiscriminator(rawType);
    if (type && (FURNITURE_BEHAVIOR_TYPES as readonly string[]).includes(type))
      return type;
  }
  return undefined;
}

function withoutIndexes(path: readonly string[]): string[] {
  return path
    .filter((part) => !/^\d+$/u.test(part))
    .map((part) => part.replaceAll("-", "_"));
}

function furnitureNumberProviderFields(
  compact: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] | undefined {
  const tail = compact.at(-1);
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
  if (compact.includes("sounds") && (tail === "volume" || tail === "pitch")) {
    return numberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

export function furnitureFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = context.path.slice(1).map((part) => part.replaceAll("-", "_"));
  if (nested.length === 0)
    return withTemplateSchemaFields(context.path, FURNITURE_ROOT_FIELDS);
  const compact = withoutIndexes(nested);
  const first = compact[0];
  if (first === "events" || first === "event") {
    return withTemplateSchemaFields(
      context.path,
      itemFieldsForContext({
        ...context,
        path: ["furniture-event", ...nested],
      }),
    );
  }
  const providerFields = furnitureNumberProviderFields(compact, context);
  if (providerFields !== undefined)
    return withTemplateSchemaFields(context.path, providerFields);

  switch (first) {
    case "settings": {
      const settingsPath = compact
        .slice(1)
        .map((value) => value.replace(/#.*$/u, "").replaceAll("-", "_"));
      if (settingsPath.length === 0)
        return withTemplateSchemaFields(context.path, FURNITURE_SETTING_FIELDS);
      return withTemplateSchemaFields(
        context.path,
        settingsPath[0] === "sounds"
          ? settingsPath.length === 1
            ? FURNITURE_SOUND_CHANNELS
            : SOUND_FIELDS
          : [],
      );
    }
    case "entity_culling":
      return withTemplateSchemaFields(context.path, CULLING_FIELDS);
    case "variant":
    case "variants":
    case "placement": {
      if (compact.length === 1)
        return withTemplateSchemaFields(context.path, []);
      if (compact.length === 2)
        return withTemplateSchemaFields(context.path, FURNITURE_VARIANT_FIELDS);
      if (compact[2] === "hitboxes")
        return withTemplateSchemaFields(
          context.path,
          hitboxFields(context.siblingValues.get("type")),
        );
      if (compact[2] !== "elements")
        return withTemplateSchemaFields(context.path, []);
      if (compact.at(-1) === "brightness")
        return withTemplateSchemaFields(context.path, BRIGHTNESS_FIELDS);
      if (compact.at(-1) === "tint_source")
        return withTemplateSchemaFields(
          context.path,
          tintSourceFields(context.siblingValues.get("type")),
        );
      return withTemplateSchemaFields(
        context.path,
        compact.includes("conditions") || compact.includes("condition")
          ? fieldsForDiscriminator(
              "condition",
              context.siblingValues.get("type"),
            )
          : elementFields(context.siblingValues.get("type")),
      );
    }
    case "behavior":
    case "behaviors": {
      const behaviorType = furnitureBehaviorTypeForContext(context);
      if ((context.ancestorTypes?.length ?? 0) > 0 && !behaviorType)
        return withTemplateSchemaFields(context.path, []);
      const behaviorVariantIndex = compact.indexOf("variants");
      if (behaviorVariantIndex >= 0) {
        if (compact.length === behaviorVariantIndex + 1)
          return withTemplateSchemaFields(context.path, []);
        if (compact.length === behaviorVariantIndex + 2)
          return withTemplateSchemaFields(
            context.path,
            behaviorType === "display_item_furniture"
              ? [
                  field(
                    "item_position",
                    Messages.src.config.furniture.schema.text0164,
                    { aliases: ["item-position"] },
                  ),
                  list(
                    "hitboxes",
                    Messages.src.config.furniture.schema.text0165,
                  ),
                ]
              : behaviorType === "glowing_furniture"
                ? []
                : [
                    list(
                      "hitboxes",
                      Messages.src.config.furniture.schema.text0166,
                    ),
                  ],
          );
        if (compact.includes("hitboxes"))
          return withTemplateSchemaFields(
            context.path,
            hitboxFields(context.siblingValues.get("type")),
          );
        return withTemplateSchemaFields(
          context.path,
          compact.includes("lights")
            ? [
                field(
                  "position",
                  Messages.src.config.furniture.schema.text0167,
                ),
                number("level", Messages.src.config.furniture.schema.text0168),
              ]
            : [],
        );
      }
      if (compact.at(-1) === "sounds")
        return withTemplateSchemaFields(
          context.path,
          behaviorType === "display_item_furniture"
            ? [
                field("put", Messages.src.config.furniture.schema.text0169, {
                  valueProvider: "sound",
                }),
                field("take", Messages.src.config.furniture.schema.text0170, {
                  valueProvider: "sound",
                }),
              ]
            : [
                field("open", Messages.src.config.furniture.schema.text0171, {
                  valueProvider: "sound",
                }),
                field("close", Messages.src.config.furniture.schema.text0172, {
                  valueProvider: "sound",
                }),
              ],
        );
      if (compact.includes("sounds"))
        return withTemplateSchemaFields(context.path, SOUND_FIELDS);
      return withTemplateSchemaFields(
        context.path,
        compact.includes("lights")
          ? [
              field("position", Messages.src.config.furniture.schema.text0173),
              number("level", Messages.src.config.furniture.schema.text0174),
            ]
          : behaviorFields(context.siblingValues.get("type")),
      );
    }
    default:
      return withTemplateSchemaFields(context.path, []);
  }
}

export function furnitureSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  if (
    FURNITURE_SETTING_FIELDS.every((candidate) => fields.includes(candidate))
  ) {
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

export function furnitureListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const compact = withoutIndexes(path.slice(1));
  const tail = compact.at(-1);
  if (tail === "correct_tools")
    return field("item", Messages.src.config.furniture.schema.text0175, {
      valueProvider: "item-id",
    });
  if (tail === "seats")
    return field("seat", Messages.src.config.furniture.schema.text0176);
  if (tail === "components" && compact.includes("tint_source"))
    return field("component", Messages.src.config.furniture.schema.text0177, {
      valueProvider: "component",
    });
  if (tail === "conditions" || tail === "condition")
    return field("type", Messages.src.config.furniture.schema.text0178, {
      valueProvider: "condition-type",
    });
  return undefined;
}
