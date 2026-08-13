import { schemaFieldForName } from "../schema/types.js";
import { Messages } from "../../messages.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";

export const CONFIGURED_FEATURE_SECTION_ALIASES = [
  "configured-feature",
  "configured-features",
  "configured_feature",
  "configured_features",
] as const;

export const PLACED_FEATURE_SECTION_ALIASES = [
  "placed-feature",
  "placed-features",
  "placed_feature",
  "placed_features",
] as const;

export type WorldgenSectionKind = "configured-feature" | "placed-feature";

  // 游戏原生配置允许当前代码未列出的字段, 不要报错
export type WorldgenAdditionalFields =
  | "closed"
  | "minecraft-runtime-codec"
  | "dynamic-map";

export type WorldgenDynamicValuePolicy =
  | "string"
  | "non-null-to-string"
  | "block-state-dependent";

export interface WorldgenContextSchema {
  readonly fields: readonly SchemaField[];
  readonly additionalFields: WorldgenAdditionalFields;
  readonly detail: string;
  readonly dynamicValues?: WorldgenDynamicValuePolicy;
}

export interface WorldgenSchemaContext extends SchemaContext {
  // 直接写在这里的 feature 没有 type 时, 不要借用外层 type
  readonly featureType?: string;
  readonly providerType?: string;
  // 自定义方块属性可以使用其他值, 原版方块属性只能使用文字
  readonly blockStateKind?: "craftengine" | "vanilla" | "unknown";
}

export const CRAFTENGINE_BLOCK_STATE_REGISTRY = "craftengine:block_state";
export const WORLDGEN_BLOCK_REGISTRY = "minecraft:block";
export const WORLDGEN_BLOCK_OR_TAG_REGISTRY = "minecraft:block_or_tag";

export interface WorldgenFieldConstraint {
  readonly minItems?: number;
  readonly integer?: boolean;
  readonly exclusiveMinimum?: number;
  readonly valueShape?: "scalar-or-mapping";
}

export interface WorldgenSchemaField extends SchemaField {
  readonly worldgenConstraint?: WorldgenFieldConstraint;
}

const INT_PROVIDER_VALUE_CONSTRAINT: WorldgenFieldConstraint = {
  valueShape: "scalar-or-mapping",
};

interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly registry?: string;
  readonly required?: boolean;
  readonly worldgenConstraint?: WorldgenFieldConstraint;
}

function field(
  label: string,
  detail: string,
  options: FieldOptions = {},
): WorldgenSchemaField {
  // 字段名里的连字符会变成下划线, Name 和 Properties 不能改变大小写
  return {
    label,
    semantic: label.replaceAll("-", "_"),
    aliases: [
      ...new Set([
        ...(options.aliases ?? []),
        ...(label.includes("_") ? [label.replaceAll("_", "-")] : []),
      ]),
    ],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.valueDetails === undefined
      ? {}
      : { valueDetails: options.valueDetails }),
    ...(options.registry === undefined ? {} : { registry: options.registry }),
    ...(options.required === undefined ? {} : { required: options.required }),
    ...(options.worldgenConstraint === undefined
      ? {}
      : { worldgenConstraint: options.worldgenConstraint }),
  };
}

const mapping = (
  label: string,
  detail: string,
  required = false,
): SchemaField =>
  field(label, detail, {
    required,
    snippet: `${label}:\n  \${0}`,
  });
const list = (
  label: string,
  detail: string,
  required = false,
  worldgenConstraint?: WorldgenFieldConstraint,
): SchemaField =>
  field(label, detail, {
    required,
    snippet: `${label}:\n  - \${0}`,
    ...(worldgenConstraint === undefined ? {} : { worldgenConstraint }),
  });
const number = (
  label: string,
  detail: string,
  required = false,
  worldgenConstraint?: WorldgenFieldConstraint,
): SchemaField =>
  field(label, detail, {
    required,
    valueProvider: "number",
    ...(worldgenConstraint === undefined ? {} : { worldgenConstraint }),
  });
const bool = (label: string, detail: string, required = false): SchemaField =>
  field(label, detail, {
    required,
    valueProvider: "boolean",
    values: ["true", "false"],
    valueDetails: {
      true: Messages.src.config.worldgen.schema.text0001,
      false: Messages.src.config.worldgen.schema.text0002,
    },
  });

function node(
  fields: readonly SchemaField[],
  additionalFields: WorldgenAdditionalFields,
  detail: string,
  dynamicValues?: WorldgenDynamicValuePolicy,
): WorldgenContextSchema {
  return {
    fields,
    additionalFields,
    detail,
    ...(dynamicValues === undefined ? {} : { dynamicValues }),
  };
}

export function worldgenFieldConstraint(
  field: SchemaField,
): WorldgenFieldConstraint | undefined {
  return (field as WorldgenSchemaField).worldgenConstraint;
}

function blockStatePropertiesSchema(
  context: WorldgenSchemaContext,
): WorldgenContextSchema {
  if (context.blockStateKind === "craftengine") {
    return node(
      [],
      "dynamic-map",
      Messages.src.config.worldgen.schema.text0003,
      "non-null-to-string",
    );
  }
  if (context.blockStateKind === "vanilla") {
    return node(
      [],
      "dynamic-map",
      Messages.src.config.worldgen.schema.text0004,
      "string",
    );
  }
  return node(
    [],
    "dynamic-map",
    Messages.src.config.worldgen.schema.text0005,
    "block-state-dependent",
  );
}

function merged(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const result = new Map<string, SchemaField>();
  for (const group of groups) {
    for (const candidate of group)
      if (!result.has(candidate.semantic))
        result.set(candidate.semantic, candidate);
  }
  return [...result.values()];
}

function resourceType(
  value: string | undefined,
  defaultNamespace = "minecraft",
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.includes(":")
    ? normalized
    : `${defaultNamespace}:${normalized}`;
}

export function worldgenSectionKind(
  sectionName: string,
): WorldgenSectionKind | undefined {
  const suffix = sectionName.indexOf("#");
  const base = suffix < 0 ? sectionName : sectionName.slice(0, suffix);
  if ((CONFIGURED_FEATURE_SECTION_ALIASES as readonly string[]).includes(base))
    return "configured-feature";
  if ((PLACED_FEATURE_SECTION_ALIASES as readonly string[]).includes(base))
    return "placed-feature";
  return undefined;
}

function nestedPath(
  path: readonly string[],
  kind: WorldgenSectionKind,
): readonly string[] {
  const compact = path.filter((part) => !/^\d+$/u.test(part));
  if (compact.length === 0) return [];
  const first = compact[0] ?? "";
  const suffix = first.indexOf("#");
  return (
    (
      (kind === "configured-feature"
        ? CONFIGURED_FEATURE_SECTION_ALIASES
        : PLACED_FEATURE_SECTION_ALIASES) as readonly string[]
    ).includes(suffix < 0 ? first : first.slice(0, suffix))
      ? compact.slice(1)
      : compact
  )
    .slice(1)
    .map((value) => value.replaceAll("-", "_"));
}

export const CONFIGURED_FEATURE_TYPES = [
  "craftengine:simple_block",
  "minecraft:simple_block",
  "minecraft:block_column",
  "minecraft:ore",
  "minecraft:random_patch",
  "minecraft:tree",
] as const;

export const CONFIGURED_FEATURE_TYPE_DETAILS: Readonly<
  Record<(typeof CONFIGURED_FEATURE_TYPES)[number], string>
> = {
  "craftengine:simple_block": Messages.src.config.worldgen.schema.text0006,
  "minecraft:simple_block": Messages.src.config.worldgen.schema.text0007,
  "minecraft:block_column": Messages.src.config.worldgen.schema.text0008,
  "minecraft:ore": Messages.src.config.worldgen.schema.text0009,
  "minecraft:random_patch": Messages.src.config.worldgen.schema.text0010,
  "minecraft:tree": Messages.src.config.worldgen.schema.text0011,
};

export const BLOCK_STATE_PROVIDER_TYPES = [
  "craftengine:simple_state_provider",
  "craftengine:weighted_state_provider",
  "craftengine:rotated_block_provider",
  "craftengine:randomized_int_state_provider",
  "minecraft:simple_state_provider",
  "minecraft:weighted_state_provider",
  "minecraft:rule_based_state_provider",
] as const;

export const BLOCK_STATE_PROVIDER_TYPE_DETAILS: Readonly<
  Record<(typeof BLOCK_STATE_PROVIDER_TYPES)[number], string>
> = {
  "craftengine:simple_state_provider":
    Messages.src.config.worldgen.schema.text0012,
  "craftengine:weighted_state_provider":
    Messages.src.config.worldgen.schema.text0013,
  "craftengine:rotated_block_provider":
    Messages.src.config.worldgen.schema.text0014,
  "craftengine:randomized_int_state_provider":
    Messages.src.config.worldgen.schema.text0015,
  "minecraft:simple_state_provider":
    Messages.src.config.worldgen.schema.text0016,
  "minecraft:weighted_state_provider":
    Messages.src.config.worldgen.schema.text0017,
  "minecraft:rule_based_state_provider":
    Messages.src.config.worldgen.schema.text0018,
};

export const BLOCK_PREDICATE_TYPES = [
  "minecraft:matching_blocks",
  "minecraft:matching_fluids",
  "minecraft:matching_block_tag",
  "minecraft:replaceable",
  "minecraft:would_survive",
  "minecraft:all_of",
  "minecraft:any_of",
  "minecraft:not",
] as const;

export const BLOCK_PREDICATE_TYPE_DETAILS: Readonly<
  Record<(typeof BLOCK_PREDICATE_TYPES)[number], string>
> = {
  "minecraft:matching_blocks": Messages.src.config.worldgen.schema.text0019,
  "minecraft:matching_fluids": Messages.src.config.worldgen.schema.text0020,
  "minecraft:matching_block_tag": Messages.src.config.worldgen.schema.text0021,
  "minecraft:replaceable": Messages.src.config.worldgen.schema.text0022,
  "minecraft:would_survive": Messages.src.config.worldgen.schema.text0023,
  "minecraft:all_of": Messages.src.config.worldgen.schema.text0024,
  "minecraft:any_of": Messages.src.config.worldgen.schema.text0025,
  "minecraft:not": Messages.src.config.worldgen.schema.text0026,
};

export const INT_PROVIDER_TYPES = [
  "minecraft:uniform",
  "minecraft:biased_to_bottom",
  "minecraft:trapezoid",
  "minecraft:weighted_list",
] as const;

export const INT_PROVIDER_TYPE_DETAILS: Readonly<
  Record<(typeof INT_PROVIDER_TYPES)[number], string>
> = {
  "minecraft:uniform": Messages.src.config.worldgen.schema.text0027,
  "minecraft:biased_to_bottom": Messages.src.config.worldgen.schema.text0028,
  "minecraft:trapezoid": Messages.src.config.worldgen.schema.text0029,
  "minecraft:weighted_list": Messages.src.config.worldgen.schema.text0030,
};

export const PLACEMENT_MODIFIER_TYPES = [
  "biome",
  "minecraft:biome",
  "minecraft:in_square",
  "minecraft:rarity_filter",
  "minecraft:height_range",
  "minecraft:count",
  "minecraft:random_offset",
  "minecraft:heightmap",
  "minecraft:block_predicate_filter",
] as const;

export const PLACEMENT_MODIFIER_TYPE_DETAILS: Readonly<
  Record<(typeof PLACEMENT_MODIFIER_TYPES)[number], string>
> = {
  biome: Messages.src.config.worldgen.schema.text0031,
  "minecraft:biome": Messages.src.config.worldgen.schema.text0032,
  "minecraft:in_square": Messages.src.config.worldgen.schema.text0033,
  "minecraft:rarity_filter": Messages.src.config.worldgen.schema.text0034,
  "minecraft:height_range": Messages.src.config.worldgen.schema.text0035,
  "minecraft:count": Messages.src.config.worldgen.schema.text0036,
  "minecraft:random_offset": Messages.src.config.worldgen.schema.text0037,
  "minecraft:heightmap": Messages.src.config.worldgen.schema.text0038,
  "minecraft:block_predicate_filter":
    Messages.src.config.worldgen.schema.text0039,
};

export const DIRECTIONS = [
  "down",
  "up",
  "north",
  "south",
  "west",
  "east",
] as const;
export const HEIGHTMAP_TYPES = [
  "WORLD_SURFACE_WG",
  "WORLD_SURFACE",
  "OCEAN_FLOOR_WG",
  "OCEAN_FLOOR",
  "MOTION_BLOCKING",
  "MOTION_BLOCKING_NO_LEAVES",
] as const;

const CONFIGURED_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0040,
  {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:worldgen/feature",
    values: CONFIGURED_FEATURE_TYPES,
    valueDetails: CONFIGURED_FEATURE_TYPE_DETAILS,
    snippet:
      "type: ${1|craftengine:simple_block,minecraft:simple_block,minecraft:block_column,minecraft:ore,minecraft:random_patch,minecraft:tree|}",
  },
);

const PROVIDER_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0041,
  {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:worldgen/block_state_provider_type",
    values: BLOCK_STATE_PROVIDER_TYPES,
    valueDetails: BLOCK_STATE_PROVIDER_TYPE_DETAILS,
  },
);

const PREDICATE_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0042,
  {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:worldgen/block_predicate_type",
    values: BLOCK_PREDICATE_TYPES,
    valueDetails: BLOCK_PREDICATE_TYPE_DETAILS,
  },
);

const INT_PROVIDER_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0043,
  {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:int_provider_type",
    values: INT_PROVIDER_TYPES,
    valueDetails: INT_PROVIDER_TYPE_DETAILS,
  },
);

const PLACEMENT_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0044,
  {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:worldgen/placement_modifier_type",
    values: PLACEMENT_MODIFIER_TYPES,
    valueDetails: PLACEMENT_MODIFIER_TYPE_DETAILS,
  },
);

export const CONFIGURED_FEATURE_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.worldgen.schema.text0045),
  bool("debug", Messages.src.config.worldgen.schema.text0046),
  CONFIGURED_TYPE_FIELD,
  mapping("config", Messages.src.config.worldgen.schema.text0047, true),
];

const FILTER_BIOME_FIELD = field(
  "biome",
  Messages.src.config.worldgen.schema.text0048,
  {
    aliases: ["biomes"],
    valueProvider: "registry",
    registry: "minecraft:worldgen/biome",
    snippet: "biome:\n  - ${0}",
  },
);
const FILTER_WORLD_FIELD = field(
  "world",
  Messages.src.config.worldgen.schema.text0049,
  {
    aliases: ["worlds"],
    snippet: "world:\n  - ${0}",
  },
);
const FILTER_DIMENSION_FIELD = field(
  "dimension",
  Messages.src.config.worldgen.schema.text0050,
  {
    aliases: ["dimensions"],
    valueProvider: "registry",
    registry: "minecraft:dimension",
    snippet: "dimension:\n  - ${0}",
  },
);
const FILTER_ENVIRONMENT_FIELD = field(
  "environment",
  Messages.src.config.worldgen.schema.text0051,
  {
    aliases: [
      "environments",
      "dimension-type",
      "dimension-types",
      "dimension_type",
      "dimension_types",
    ],
    valueProvider: "registry",
    registry: "minecraft:dimension_type",
    snippet: "environment:\n  - ${0}",
  },
);

export const PLACED_FEATURE_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.worldgen.schema.text0052),
  bool("debug", Messages.src.config.worldgen.schema.text0053),
  field("feature", Messages.src.config.worldgen.schema.text0054, {
    required: true,
    valueProvider: "configured-feature-id",
    registry: "minecraft:worldgen/configured_feature",
  }),
  list("placement", Messages.src.config.worldgen.schema.text0055, true, {
    minItems: 1,
  }),
  FILTER_BIOME_FIELD,
  FILTER_WORLD_FIELD,
  FILTER_DIMENSION_FIELD,
  FILTER_ENVIRONMENT_FIELD,
];

export const BLOCK_STATE_FIELDS: readonly SchemaField[] = [
  field("Name", Messages.src.config.worldgen.schema.text0056, {
    required: true,
    valueProvider: "block-id",
    registry: WORLDGEN_BLOCK_REGISTRY,
  }),
  mapping("Properties", Messages.src.config.worldgen.schema.text0057),
];

const SIMPLE_BLOCK_CONFIG_FIELDS: readonly SchemaField[] = [
  mapping("to_place", Messages.src.config.worldgen.schema.text0058, true),
  bool("schedule_tick", Messages.src.config.worldgen.schema.text0059),
];

const BLOCK_COLUMN_CONFIG_FIELDS: readonly SchemaField[] = [
  list("layers", Messages.src.config.worldgen.schema.text0060, true, {
    minItems: 1,
  }),
  field("direction", Messages.src.config.worldgen.schema.text0061, {
    required: true,
    values: DIRECTIONS,
    valueDetails: {
      down: Messages.src.config.worldgen.schema.text0062,
      up: Messages.src.config.worldgen.schema.text0063,
      north: Messages.src.config.worldgen.schema.text0064,
      south: Messages.src.config.worldgen.schema.text0065,
      west: Messages.src.config.worldgen.schema.text0066,
      east: Messages.src.config.worldgen.schema.text0067,
    },
  }),
  mapping(
    "allowed_placement",
    Messages.src.config.worldgen.schema.text0068,
    true,
  ),
  bool("prioritize_tip", Messages.src.config.worldgen.schema.text0069, true),
];

export const BLOCK_COLUMN_LAYER_FIELDS: readonly SchemaField[] = [
  field("height", Messages.src.config.worldgen.schema.text0070, {
    required: true,
    valueProvider: "number",
    worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
  }),
  mapping("provider", Messages.src.config.worldgen.schema.text0071, true),
];

const ORE_CONFIG_FIELDS: readonly SchemaField[] = [
  list("targets", Messages.src.config.worldgen.schema.text0072, true),
  number("size", Messages.src.config.worldgen.schema.text0073, true),
  number(
    "discard_chance_on_air_exposure",
    Messages.src.config.worldgen.schema.text0074,
    true,
  ),
];

export const ORE_TARGET_FIELDS: readonly SchemaField[] = [
  mapping("target", Messages.src.config.worldgen.schema.text0075, true),
  mapping("state", Messages.src.config.worldgen.schema.text0076, true),
];

const RANDOM_PATCH_CONFIG_FIELDS: readonly SchemaField[] = [
  number("tries", Messages.src.config.worldgen.schema.text0077),
  number("xz_spread", Messages.src.config.worldgen.schema.text0078),
  number("y_spread", Messages.src.config.worldgen.schema.text0079),
  mapping("feature", Messages.src.config.worldgen.schema.text0080, true),
];

export const INLINE_PLACED_FEATURE_FIELDS: readonly SchemaField[] = [
  field("feature", Messages.src.config.worldgen.schema.text0081, {
    required: true,
    valueProvider: "configured-feature-id",
    registry: "minecraft:worldgen/configured_feature",
  }),
  list("placement", Messages.src.config.worldgen.schema.text0082, true),
];

const TREE_CONFIG_FIELDS: readonly SchemaField[] = [
  mapping("trunk_provider", Messages.src.config.worldgen.schema.text0083, true),
  mapping("trunk_placer", Messages.src.config.worldgen.schema.text0084, true),
  mapping(
    "foliage_provider",
    Messages.src.config.worldgen.schema.text0085,
    true,
  ),
  mapping("foliage_placer", Messages.src.config.worldgen.schema.text0086, true),
  mapping("root_placer", Messages.src.config.worldgen.schema.text0087),
  mapping("dirt_provider", Messages.src.config.worldgen.schema.text0088, true),
  mapping("minimum_size", Messages.src.config.worldgen.schema.text0089, true),
  list("decorators", Messages.src.config.worldgen.schema.text0090, true),
  bool("ignore_vines", Messages.src.config.worldgen.schema.text0091),
  bool("force_dirt", Messages.src.config.worldgen.schema.text0092),
  mapping("below_trunk_provider", Messages.src.config.worldgen.schema.text0093),
];

const PROVIDER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "craftengine:simple_state_provider",
    [
      field("state", Messages.src.config.worldgen.schema.text0094, {
        required: true,
        valueProvider: "block-state",
        registry: CRAFTENGINE_BLOCK_STATE_REGISTRY,
        snippet: 'state: "${0}"',
      }),
    ],
  ],
  [
    "craftengine:weighted_state_provider",
    [
      list("entries", Messages.src.config.worldgen.schema.text0095, true, {
        minItems: 1,
      }),
    ],
  ],
  [
    "craftengine:rotated_block_provider",
    [
      field("state", Messages.src.config.worldgen.schema.text0096, {
        required: true,
        valueProvider: "block-state",
        registry: CRAFTENGINE_BLOCK_STATE_REGISTRY,
        snippet: 'state: "${0}"',
      }),
    ],
  ],
  [
    "craftengine:randomized_int_state_provider",
    [
      mapping("source", Messages.src.config.worldgen.schema.text0097, true),
      field("property", Messages.src.config.worldgen.schema.text0098, {
        required: true,
      }),
      field("values", Messages.src.config.worldgen.schema.text0099, {
        required: true,
        snippet: "values: ${0}",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
    ],
  ],
  [
    "minecraft:simple_state_provider",
    [mapping("state", Messages.src.config.worldgen.schema.text0100, true)],
  ],
  [
    "minecraft:weighted_state_provider",
    [
      list("entries", Messages.src.config.worldgen.schema.text0101, true, {
        minItems: 1,
      }),
    ],
  ],
  // 这里只确认 rules 可以使用, 不要添加没有确认过的备用字段
  [
    "minecraft:rule_based_state_provider",
    [list("rules", Messages.src.config.worldgen.schema.text0102, true)],
  ],
]);

export const WEIGHTED_STATE_ENTRY_FIELDS: readonly SchemaField[] = [
  number("weight", Messages.src.config.worldgen.schema.text0103, true, {
    integer: true,
    exclusiveMinimum: 0,
  }),
  mapping("data", Messages.src.config.worldgen.schema.text0104, true),
];

export const CRAFTENGINE_WEIGHTED_STATE_ENTRY_FIELDS: readonly SchemaField[] = [
  number("weight", Messages.src.config.worldgen.schema.text0105, true, {
    integer: true,
    exclusiveMinimum: 0,
  }),
  field("data", Messages.src.config.worldgen.schema.text0106, {
    required: true,
    valueProvider: "block-state",
    registry: CRAFTENGINE_BLOCK_STATE_REGISTRY,
    snippet: 'data: "${0}"',
  }),
];

export const RULE_BASED_STATE_ENTRY_FIELDS: readonly SchemaField[] = [
  mapping("if_true", Messages.src.config.worldgen.schema.text0110, true),
  mapping("then", Messages.src.config.worldgen.schema.text0111, true),
];

const MATCHING_BLOCKS_FIELD = field(
  "blocks",
  Messages.src.config.worldgen.schema.text0112,
  {
    required: true,
    valueProvider: "block-id",
    registry: WORLDGEN_BLOCK_OR_TAG_REGISTRY,
    snippet: "blocks:\n  - ${0}",
  },
);

const PREDICATE_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:matching_blocks",
    [
      MATCHING_BLOCKS_FIELD,
      field("offset", Messages.src.config.worldgen.schema.text0113),
    ],
  ],
  [
    "minecraft:matching_fluids",
    [
      field("fluids", Messages.src.config.worldgen.schema.text0114, {
        required: true,
        valueProvider: "registry",
        registry: "minecraft:fluid",
        snippet: "fluids:\n  - ${0}",
      }),
      field("offset", Messages.src.config.worldgen.schema.text0115),
    ],
  ],
  [
    "minecraft:matching_block_tag",
    [
      field("tag", Messages.src.config.worldgen.schema.text0116, {
        required: true,
        valueProvider: "block-tag",
      }),
      field("offset", Messages.src.config.worldgen.schema.text0117),
    ],
  ],
  [
    "minecraft:replaceable",
    [field("offset", Messages.src.config.worldgen.schema.text0118)],
  ],
  [
    "minecraft:would_survive",
    [
      mapping("state", Messages.src.config.worldgen.schema.text0119, true),
      field("offset", Messages.src.config.worldgen.schema.text0120),
    ],
  ],
  [
    "minecraft:all_of",
    [list("predicates", Messages.src.config.worldgen.schema.text0121, true)],
  ],
  [
    "minecraft:any_of",
    [list("predicates", Messages.src.config.worldgen.schema.text0122, true)],
  ],
  [
    "minecraft:not",
    [mapping("predicate", Messages.src.config.worldgen.schema.text0123, true)],
  ],
]);

const INT_PROVIDER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:uniform",
    [
      field("min_inclusive", Messages.src.config.worldgen.schema.text0124, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
      field("max_inclusive", Messages.src.config.worldgen.schema.text0125, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
    ],
  ],
  [
    "minecraft:biased_to_bottom",
    [
      field("min_inclusive", Messages.src.config.worldgen.schema.text0126, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
      field("max_inclusive", Messages.src.config.worldgen.schema.text0127, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
      field("value", Messages.src.config.worldgen.schema.text0128),
    ],
  ],
  [
    "minecraft:trapezoid",
    [
      number("min", Messages.src.config.worldgen.schema.text0129, true),
      number("max", Messages.src.config.worldgen.schema.text0130, true),
      number("plateau", Messages.src.config.worldgen.schema.text0131, true),
    ],
  ],
  [
    "minecraft:weighted_list",
    [
      list("distribution", Messages.src.config.worldgen.schema.text0132, true, {
        minItems: 1,
      }),
    ],
  ],
]);

export const WEIGHTED_INT_ENTRY_FIELDS: readonly SchemaField[] = [
  number("weight", Messages.src.config.worldgen.schema.text0133, true),
  field("data", Messages.src.config.worldgen.schema.text0134, {
    required: true,
    valueProvider: "number",
    worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
  }),
];

const PLACEMENT_FIELDS = new Map<string, readonly SchemaField[]>([
  ["biome", []],
  ["minecraft:biome", []],
  ["minecraft:in_square", []],
  [
    "minecraft:rarity_filter",
    [number("chance", Messages.src.config.worldgen.schema.text0135, true)],
  ],
  [
    "minecraft:height_range",
    [mapping("height", Messages.src.config.worldgen.schema.text0136, true)],
  ],
  [
    "minecraft:count",
    [
      field("count", Messages.src.config.worldgen.schema.text0137, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
    ],
  ],
  [
    "minecraft:random_offset",
    [
      field("xz_spread", Messages.src.config.worldgen.schema.text0138, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
      field("y_spread", Messages.src.config.worldgen.schema.text0139, {
        required: true,
        valueProvider: "number",
        worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
      }),
    ],
  ],
  [
    "minecraft:heightmap",
    [
      field("heightmap", Messages.src.config.worldgen.schema.text0140, {
        required: true,
        values: HEIGHTMAP_TYPES,
        valueDetails: {
          MOTION_BLOCKING: Messages.src.config.worldgen.schema.text0141,
          WORLD_SURFACE: Messages.src.config.worldgen.schema.text0142,
        },
      }),
    ],
  ],
  [
    "minecraft:block_predicate_filter",
    [mapping("predicate", Messages.src.config.worldgen.schema.text0143, true)],
  ],
]);

export const RULE_TEST_FIELDS: readonly SchemaField[] = [
  field("predicate_type", Messages.src.config.worldgen.schema.text0144, {
    required: true,
    valueProvider: "registry",
    registry: "minecraft:worldgen/rule_test",
    values: ["minecraft:tag_match"],
    valueDetails: {
      "minecraft:tag_match": Messages.src.config.worldgen.schema.text0145,
    },
  }),
  field("tag", Messages.src.config.worldgen.schema.text0146, {
    required: true,
    valueProvider: "block-tag",
  }),
];

const TRUNK_PLACER_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0148,
  {
    required: true,
    values: ["minecraft:straight_trunk_placer"],
    valueDetails: {
      "minecraft:straight_trunk_placer":
        Messages.src.config.worldgen.schema.text0149,
    },
    valueProvider: "registry",
    registry: "minecraft:worldgen/trunk_placer_type",
  },
);
const STRAIGHT_TRUNK_PLACER_FIELDS: readonly SchemaField[] = [
  number("base_height", Messages.src.config.worldgen.schema.text0150, true),
  number("height_rand_a", Messages.src.config.worldgen.schema.text0151, true),
  number("height_rand_b", Messages.src.config.worldgen.schema.text0152, true),
];

const FOLIAGE_PLACER_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0154,
  {
    required: true,
    values: ["minecraft:cherry_foliage_placer"],
    valueDetails: {
      "minecraft:cherry_foliage_placer":
        Messages.src.config.worldgen.schema.text0155,
    },
    valueProvider: "registry",
    registry: "minecraft:worldgen/foliage_placer_type",
  },
);
const CHERRY_FOLIAGE_PLACER_FIELDS: readonly SchemaField[] = [
  field("radius", Messages.src.config.worldgen.schema.text0156, {
    required: true,
    valueProvider: "number",
    worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
  }),
  field("offset", Messages.src.config.worldgen.schema.text0157, {
    required: true,
    valueProvider: "number",
    worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
  }),
  field("height", Messages.src.config.worldgen.schema.text0158, {
    required: true,
    valueProvider: "number",
    worldgenConstraint: INT_PROVIDER_VALUE_CONSTRAINT,
  }),
  number(
    "wide_bottom_layer_hole_chance",
    Messages.src.config.worldgen.schema.text0159,
    true,
  ),
  number(
    "corner_hole_chance",
    Messages.src.config.worldgen.schema.text0160,
    true,
  ),
  number(
    "hanging_leaves_chance",
    Messages.src.config.worldgen.schema.text0161,
    true,
  ),
  number(
    "hanging_leaves_extension_chance",
    Messages.src.config.worldgen.schema.text0162,
    true,
  ),
];

const FEATURE_SIZE_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0164,
  {
    required: true,
    values: ["minecraft:two_layers_feature_size"],
    valueDetails: {
      "minecraft:two_layers_feature_size":
        Messages.src.config.worldgen.schema.text0165,
    },
    valueProvider: "registry",
    registry: "minecraft:worldgen/feature_size_type",
  },
);
const TWO_LAYERS_FEATURE_SIZE_FIELDS: readonly SchemaField[] = [
  number("min_clipped_height", Messages.src.config.worldgen.schema.text0166),
  number("limit", Messages.src.config.worldgen.schema.text0167),
  number("lower_size", Messages.src.config.worldgen.schema.text0168),
  number("upper_size", Messages.src.config.worldgen.schema.text0169),
];

export const VERTICAL_ANCHOR_FIELDS: readonly SchemaField[] = [
  number("absolute", Messages.src.config.worldgen.schema.text0171, true),
];

const HEIGHT_PROVIDER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:uniform",
    [
      mapping(
        "min_inclusive",
        Messages.src.config.worldgen.schema.text0172,
        true,
      ),
      mapping(
        "max_inclusive",
        Messages.src.config.worldgen.schema.text0173,
        true,
      ),
    ],
  ],
]);

const HEIGHT_PROVIDER_TYPE_FIELD = field(
  "type",
  Messages.src.config.worldgen.schema.text0174,
  {
    values: ["minecraft:uniform"],
    valueDetails: {
      "minecraft:uniform": Messages.src.config.worldgen.schema.text0175,
    },
    valueProvider: "registry",
    registry: "minecraft:worldgen/height_provider_type",
  },
);

export function configuredFeatureConfigSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = resourceType(type);
  let fields: readonly SchemaField[];
  switch (selected) {
    case "craftengine:simple_block":
    case "minecraft:simple_block":
      fields = SIMPLE_BLOCK_CONFIG_FIELDS;
      break;
    case "minecraft:block_column":
      fields = BLOCK_COLUMN_CONFIG_FIELDS;
      break;
    case "minecraft:ore":
      fields = ORE_CONFIG_FIELDS;
      break;
    case "minecraft:random_patch":
      fields = RANDOM_PATCH_CONFIG_FIELDS;
      break;
    case "minecraft:tree":
      fields = TREE_CONFIG_FIELDS;
      break;
    default:
      fields = [];
  }
  if (selected === "craftengine:simple_block") {
    return node(fields, "closed", Messages.src.config.worldgen.schema.text0176);
  }
  return node(
    fields,
    "minecraft-runtime-codec",
    selected === undefined || fields.length === 0
      ? Messages.src.config.worldgen.schema.text0177
      : Messages.src.config.worldgen.schema.text0178,
  );
}

export function blockStateProviderSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = resourceType(type);
  const craftEngineType = selected?.startsWith("craftengine:") === true;
  const known = selected !== undefined && PROVIDER_FIELDS.has(selected);
  return node(
    merged(
      [PROVIDER_TYPE_FIELD],
      selected === undefined ? [] : (PROVIDER_FIELDS.get(selected) ?? []),
    ),
    craftEngineType && known ? "closed" : "minecraft-runtime-codec",
    craftEngineType && known
      ? Messages.src.config.worldgen.schema.text0179
      : Messages.src.config.worldgen.schema.text0180,
  );
}

export function blockPredicateSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = resourceType(type);
  return node(
    merged(
      [PREDICATE_TYPE_FIELD],
      selected === undefined ? [] : (PREDICATE_FIELDS.get(selected) ?? []),
    ),
    "minecraft-runtime-codec",
    Messages.src.config.worldgen.schema.text0181,
  );
}

export function intProviderSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = resourceType(type);
  return node(
    merged(
      [INT_PROVIDER_TYPE_FIELD],
      selected === undefined ? [] : (INT_PROVIDER_FIELDS.get(selected) ?? []),
    ),
    "minecraft-runtime-codec",
    Messages.src.config.worldgen.schema.text0182,
  );
}

export function placementModifierSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = type?.trim() === "biome" ? "biome" : resourceType(type);
  return node(
    merged(
      [PLACEMENT_TYPE_FIELD],
      selected === undefined ? [] : (PLACEMENT_FIELDS.get(selected) ?? []),
    ),
    selected === "biome" || selected === "minecraft:biome"
      ? "closed"
      : "minecraft-runtime-codec",
    selected === "biome" || selected === "minecraft:biome"
      ? Messages.src.config.worldgen.schema.text0183
      : Messages.src.config.worldgen.schema.text0184,
  );
}

export function heightProviderSchema(
  type: string | undefined,
): WorldgenContextSchema {
  const selected = resourceType(type);
  return node(
    merged(
      [HEIGHT_PROVIDER_TYPE_FIELD],
      selected === undefined
        ? []
        : (HEIGHT_PROVIDER_FIELDS.get(selected) ?? []),
    ),
    "minecraft-runtime-codec",
    Messages.src.config.worldgen.schema.text0185,
  );
}

function configuredNestedSchema(
  context: WorldgenSchemaContext,
  nested: readonly string[],
): WorldgenContextSchema {
  if (nested.length === 0)
    return node(
      CONFIGURED_FEATURE_ROOT_FIELDS,
      "closed",
      Messages.src.config.worldgen.schema.text0187,
    );
  const tail = nested.at(-1);
  const previous = nested.at(-2);

  if (tail === "config")
    return configuredFeatureConfigSchema(context.featureType);
  if (tail === "Properties") return blockStatePropertiesSchema(context);
  if (tail === "state")
    return node(
      BLOCK_STATE_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0188,
    );
  if (tail === "data" && previous === "distribution")
    return intProviderSchema(context.siblingValues.get("type"));
  if (tail === "data")
    return node(
      BLOCK_STATE_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0189,
    );
  if (tail === "layers")
    return node(
      BLOCK_COLUMN_LAYER_FIELDS,
      "closed",
      Messages.src.config.worldgen.schema.text0190,
    );
  if (tail === "targets")
    return node(
      ORE_TARGET_FIELDS,
      "closed",
      Messages.src.config.worldgen.schema.text0191,
    );
  if (tail === "target")
    return node(
      merged(
        [RULE_TEST_FIELDS[0]!],
        resourceType(context.siblingValues.get("predicate_type")) ===
          "minecraft:tag_match"
          ? RULE_TEST_FIELDS.slice(1)
          : [],
      ),
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0147,
    );
  if (tail === "entries") {
    switch (resourceType(context.providerType)) {
      case "craftengine:weighted_state_provider":
        return node(
          CRAFTENGINE_WEIGHTED_STATE_ENTRY_FIELDS,
          "closed",
          Messages.src.config.worldgen.schema.text0107,
        );
      case "minecraft:weighted_state_provider":
        return node(
          WEIGHTED_STATE_ENTRY_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0108,
        );
      default:
        return node(
          WEIGHTED_STATE_ENTRY_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0109,
        );
    }
  }
  if (tail === "rules")
    return node(
      RULE_BASED_STATE_ENTRY_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0192,
    );
  if (tail === "distribution")
    return node(
      WEIGHTED_INT_ENTRY_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0193,
    );
  if (tail === "trunk_placer")
    return node(
      merged(
        [TRUNK_PLACER_TYPE_FIELD],
        resourceType(context.siblingValues.get("type")) ===
          "minecraft:straight_trunk_placer"
          ? STRAIGHT_TRUNK_PLACER_FIELDS
          : [],
      ),
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0153,
    );
  if (tail === "foliage_placer")
    return node(
      merged(
        [FOLIAGE_PLACER_TYPE_FIELD],
        resourceType(context.siblingValues.get("type")) ===
          "minecraft:cherry_foliage_placer"
          ? CHERRY_FOLIAGE_PLACER_FIELDS
          : [],
      ),
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0163,
    );
  if (tail === "minimum_size")
    return node(
      merged(
        [FEATURE_SIZE_TYPE_FIELD],
        resourceType(context.siblingValues.get("type")) ===
          "minecraft:two_layers_feature_size"
          ? TWO_LAYERS_FEATURE_SIZE_FIELDS
          : [],
      ),
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0170,
    );
  if (tail === "root_placer" || tail === "decorators")
    return node(
      [],
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0194,
    );

  if (
    tail !== undefined &&
    [
      "to_place",
      "provider",
      "trunk_provider",
      "foliage_provider",
      "dirt_provider",
      "below_trunk_provider",
      "source",
      "then",
    ].includes(tail)
  )
    return blockStateProviderSchema(context.siblingValues.get("type"));

  if (
    tail !== undefined &&
    ["allowed_placement", "if_true", "predicate", "predicates"].includes(tail)
  )
    return blockPredicateSchema(context.siblingValues.get("type"));

  if (tail !== undefined && ["values", "count"].includes(tail))
    return intProviderSchema(context.siblingValues.get("type"));
  if (
    (tail === "xz_spread" || tail === "y_spread") &&
    nested.includes("placement")
  ) {
    return intProviderSchema(context.siblingValues.get("type"));
  }
  if (
    (tail === "radius" || tail === "offset") &&
    nested.includes("foliage_placer")
  ) {
    return intProviderSchema(context.siblingValues.get("type"));
  }
  if (tail === "height" && previous === "layers")
    return intProviderSchema(context.siblingValues.get("type"));
  if (tail === "height" && nested.includes("foliage_placer"))
    return intProviderSchema(context.siblingValues.get("type"));
  if (tail === "min_inclusive" || tail === "max_inclusive") {
    const placement = nested.lastIndexOf("placement");
    return placement >= 0 && nested.lastIndexOf("height") > placement
      ? node(
          VERTICAL_ANCHOR_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0195,
        )
      : intProviderSchema(context.siblingValues.get("type"));
  }

  if (tail === "placement")
    return placementModifierSchema(context.siblingValues.get("type"));
  if (tail === "height" && nested.includes("placement"))
    return context.siblingValues.has("absolute")
      ? node(
          VERTICAL_ANCHOR_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0186,
        )
      : heightProviderSchema(context.siblingValues.get("type"));

  if (tail === "feature") {
    if (
      nested.length === 2 &&
      nested[0] === "config" &&
      resourceType(context.featureType) === "minecraft:random_patch"
    ) {
      return node(
        INLINE_PLACED_FEATURE_FIELDS,
        "minecraft-runtime-codec",
        Messages.src.config.worldgen.schema.text0196,
      );
    }
    return node(
      CONFIGURED_FEATURE_ROOT_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0197,
    );
  }

  return node(
    [],
    "minecraft-runtime-codec",
    Messages.src.config.worldgen.schema.text0198,
  );
}

function placedNestedSchema(
  context: WorldgenSchemaContext,
  nested: readonly string[],
): WorldgenContextSchema {
  if (nested.length === 0)
    return node(
      PLACED_FEATURE_ROOT_FIELDS,
      "closed",
      Messages.src.config.worldgen.schema.text0199,
    );
  const tail = nested.at(-1);
  const previous = nested.at(-2);

  const inlineConfigured = nested.indexOf("feature");
  if (inlineConfigured >= 0 && inlineConfigured < nested.length - 1) {
    return configuredNestedSchema(context, nested.slice(inlineConfigured + 1));
  }

  if (tail === "placement")
    return placementModifierSchema(context.siblingValues.get("type"));
  if (tail === "height" && previous === "placement")
    return context.siblingValues.has("absolute")
      ? node(
          VERTICAL_ANCHOR_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0186,
        )
      : heightProviderSchema(context.siblingValues.get("type"));
  if (tail === "height")
    return context.siblingValues.has("absolute")
      ? node(
          VERTICAL_ANCHOR_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0186,
        )
      : heightProviderSchema(context.siblingValues.get("type"));
  if (tail === "predicate" || tail === "predicates")
    return blockPredicateSchema(context.siblingValues.get("type"));
  if (tail === "state")
    return node(
      BLOCK_STATE_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0200,
    );
  if (tail === "data" && previous === "distribution")
    return intProviderSchema(context.siblingValues.get("type"));
  if (tail === "data")
    return node(
      BLOCK_STATE_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0201,
    );
  if (tail === "Properties") return blockStatePropertiesSchema(context);
  if (tail === "count" || tail === "xz_spread" || tail === "y_spread")
    return intProviderSchema(context.siblingValues.get("type"));
  if (tail === "distribution")
    return node(
      WEIGHTED_INT_ENTRY_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0202,
    );
  if (tail === "min_inclusive" || tail === "max_inclusive") {
    const placement = nested.lastIndexOf("placement");
    return placement >= 0 && nested.lastIndexOf("height") > placement
      ? node(
          VERTICAL_ANCHOR_FIELDS,
          "minecraft-runtime-codec",
          Messages.src.config.worldgen.schema.text0203,
        )
      : intProviderSchema(context.siblingValues.get("type"));
  }
  if (tail === "feature")
    return node(
      CONFIGURED_FEATURE_ROOT_FIELDS,
      "minecraft-runtime-codec",
      Messages.src.config.worldgen.schema.text0204,
    );

  return node(
    [],
    "minecraft-runtime-codec",
    Messages.src.config.worldgen.schema.text0205,
  );
}

export function worldgenSchemaForContext(
  sectionName: string,
  context: WorldgenSchemaContext,
): WorldgenContextSchema | undefined {
  switch (worldgenSectionKind(sectionName)) {
    case "configured-feature":
      return configuredNestedSchema(
        context,
        nestedPath(context.path, "configured-feature"),
      );
    case "placed-feature":
      return placedNestedSchema(
        context,
        nestedPath(context.path, "placed-feature"),
      );
    default:
      return undefined;
  }
}

export function worldgenSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  return schemaFieldForName(name, fields);
}

export function worldgenListItemField(
  kind: WorldgenSectionKind,
  path: readonly string[],
): SchemaField | undefined {
  const tail = nestedPath(path, kind).at(-1);
  if (tail === "placement") return PLACEMENT_TYPE_FIELD;
  if (tail === "biome" || tail === "biomes") return FILTER_BIOME_FIELD;
  if (tail === "world" || tail === "worlds") return FILTER_WORLD_FIELD;
  if (tail === "dimension" || tail === "dimensions")
    return FILTER_DIMENSION_FIELD;
  if (
    tail === "environment" ||
    tail === "environments" ||
    tail === "dimension-type" ||
    tail === "dimension-types" ||
    tail === "dimension_type" ||
    tail === "dimension_types"
  ) {
    return FILTER_ENVIRONMENT_FIELD;
  }
  if (tail === "predicates") return PREDICATE_TYPE_FIELD;
  if (tail === "blocks") return MATCHING_BLOCKS_FIELD;
  return undefined;
}
