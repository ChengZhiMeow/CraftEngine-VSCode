import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "./types.js";
import {
  normalizeConfigPath,
  normalizeConfigPathSegment,
} from "../../util/configPath.js";
import { isListIndex, pathStartsWith } from "../../util/paths.js";
import {
  numberProviderAllowsNestedField,
  numberProviderFields as sharedNumberProviderFields,
  resolveNumberProviderType,
} from "../number-provider/schema.js";

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

function mapping(
  label: string,
  detail: string,
  options: FieldOptions = {},
): SchemaField {
  return field(label, detail, {
    ...options,
    snippet: options.snippet ?? `${label}:\n  \${0}`,
  });
}

function list(
  label: string,
  detail: string,
  options: FieldOptions = {},
): SchemaField {
  return field(label, detail, {
    ...options,
    snippet: options.snippet ?? `${label}:\n  - \${0}`,
  });
}

function bool(
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField {
  return field(label, detail, {
    aliases,
    valueProvider: "boolean",
    values: ["true", "false"],
  });
}

function number(
  label: string,
  detail: string,
  options: FieldOptions = {},
): SchemaField {
  return field(label, detail, { ...options, valueProvider: "number" });
}

function enumField(
  label: string,
  detail: string,
  values: readonly string[],
  options: Omit<FieldOptions, "values"> = {},
): SchemaField {
  return field(label, detail, { ...options, values });
}

const requiredMapping = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField => mapping(label, detail, { aliases, required: true });
const requiredString = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField => field(label, detail, { aliases, required: true });

export const CONFIG_FILE_TOP_LEVEL_FIELDS: readonly SchemaField[] = [
  field("config-version", Messages.src.config.schema.configFile.text0001, {
    values: ["84"],
    required: true,
    snippet: 'config-version: "84"',
  }),
  bool("metrics", Messages.src.config.schema.configFile.text0002),
  bool("update-checker", Messages.src.config.schema.configFile.text0003),
  field("forced-locale", Messages.src.config.schema.configFile.text0004),
  mapping("resource-pack", Messages.src.config.schema.configFile.text0005),
  mapping("item", Messages.src.config.schema.configFile.text0006),
  mapping("equipment", Messages.src.config.schema.configFile.text0007),
  mapping("block", Messages.src.config.schema.configFile.text0008),
  mapping("furniture", Messages.src.config.schema.configFile.text0009),
  mapping("emoji", Messages.src.config.schema.configFile.text0010),
  mapping("loot", Messages.src.config.schema.configFile.text0011),
  mapping("image", Messages.src.config.schema.configFile.text0012),
  mapping("network", Messages.src.config.schema.configFile.text0013),
  mapping("recipe", Messages.src.config.schema.configFile.text0014),
  mapping("gui", Messages.src.config.schema.configFile.text0015),
  mapping("chunk-system", Messages.src.config.schema.configFile.text0016),
  mapping(
    "client-optimization",
    Messages.src.config.schema.configFile.text0017,
    { optionalDependency: "Premium" },
  ),
  mapping("misc", Messages.src.config.schema.configFile.text0018),
  mapping("debug", Messages.src.config.schema.configFile.text0019),
  mapping(
    "bedrock-edition-support",
    Messages.src.config.schema.configFile.text0020,
  ),
];

export const CONFIG_HOSTING_TYPES = [
  "none",
  "self",
  "external",
  "lobfile",
  "s3",
  "openlist",
  "alist",
  "dropbox",
  "onedrive",
  "gitlab",
] as const;

export const CONFIG_HOSTING_TYPE_DETAILS = {
  none: Messages.src.config.schema.configFile.text0021,
  self: Messages.src.config.schema.configFile.text0022,
  external: Messages.src.config.schema.configFile.text0023,
  lobfile: Messages.src.config.schema.configFile.text0024,
  s3: Messages.src.config.schema.configFile.text0025,
  openlist: Messages.src.config.schema.configFile.text0026,
  alist: Messages.src.config.schema.configFile.text0027,
  dropbox: Messages.src.config.schema.configFile.text0028,
  onedrive: Messages.src.config.schema.configFile.text0029,
  gitlab: Messages.src.config.schema.configFile.text0030,
} satisfies Readonly<Record<(typeof CONFIG_HOSTING_TYPES)[number], string>>;

export const CONFIG_PATH_MATCHER_TYPES = [
  "any_of",
  "all_of",
  "inverted",
  "contains",
  "exact",
  "filename",
  "pattern",
  "parent_path_suffix",
  "parent_path_prefix",
] as const;

export const CONFIG_PATH_MATCHER_TYPE_DETAILS = {
  any_of: Messages.src.config.schema.configFile.text0031,
  all_of: Messages.src.config.schema.configFile.text0032,
  inverted: Messages.src.config.schema.configFile.text0033,
  contains: Messages.src.config.schema.configFile.text0034,
  exact: Messages.src.config.schema.configFile.text0035,
  filename: Messages.src.config.schema.configFile.text0036,
  pattern: Messages.src.config.schema.configFile.text0037,
  parent_path_suffix: Messages.src.config.schema.configFile.text0038,
  parent_path_prefix: Messages.src.config.schema.configFile.text0039,
} satisfies Readonly<
  Record<(typeof CONFIG_PATH_MATCHER_TYPES)[number], string>
>;

export const CONFIG_CONFLICT_RESOLUTION_TYPES = [
  "retain_matching",
  "merge_json",
  "merge_atlas",
  "merge_font",
  "merge_pack_mcmeta",
  "merge_legacy_model",
  "conditional",
] as const;

export const CONFIG_CONFLICT_RESOLUTION_TYPE_DETAILS = {
  retain_matching: Messages.src.config.schema.configFile.text0040,
  merge_json: Messages.src.config.schema.configFile.text0041,
  merge_atlas: Messages.src.config.schema.configFile.text0042,
  merge_font: Messages.src.config.schema.configFile.text0043,
  merge_pack_mcmeta: Messages.src.config.schema.configFile.text0044,
  merge_legacy_model: Messages.src.config.schema.configFile.text0045,
  conditional: Messages.src.config.schema.configFile.text0046,
} satisfies Readonly<
  Record<(typeof CONFIG_CONFLICT_RESOLUTION_TYPES)[number], string>
>;

const BOOLEAN_FIELDS = (
  names: readonly string[],
  suffix = "",
): readonly SchemaField[] =>
  names.map((name) =>
    bool(name, Messages.src.config.schema.configFile.text0047(name, suffix)),
  );

const RESOURCE_PACK_FIELDS: readonly SchemaField[] = [
  field("path", Messages.src.config.schema.configFile.text0048),
  mapping("supported-version", Messages.src.config.schema.configFile.text0049),
  field("description", Messages.src.config.schema.configFile.text0050),
  field("overlay-format", Messages.src.config.schema.configFile.text0051),
  bool("generate-mod-assets", Messages.src.config.schema.configFile.text0052),
  list(
    "merge-external-folders",
    Messages.src.config.schema.configFile.text0053,
  ),
  list(
    "merge-external-zip-files",
    Messages.src.config.schema.configFile.text0054,
  ),
  list(
    "exclude-file-extensions",
    Messages.src.config.schema.configFile.text0055,
  ),
  bool(
    "remove-tinted-leaves-particle",
    Messages.src.config.schema.configFile.text0056,
  ),
  bool("override-uniform-font", Messages.src.config.schema.configFile.text0057),
  bool("exclude-core-shaders", Messages.src.config.schema.configFile.text0058),
  mapping("validation", Messages.src.config.schema.configFile.text0059),
  mapping("optimization", Messages.src.config.schema.configFile.text0060),
  mapping(
    "map-plugin-compatibility",
    Messages.src.config.schema.configFile.text0061,
  ),
  mapping("pack-squash", Messages.src.config.schema.configFile.text0062),
  mapping("protection", Messages.src.config.schema.configFile.text0063, {
    optionalDependency: "Premium",
  }),
  mapping("delivery", Messages.src.config.schema.configFile.text0064),
  list(
    "duplicated-files-handler",
    Messages.src.config.schema.configFile.text0065,
  ),
];

const DELIVERY_FIELDS: readonly SchemaField[] = [
  field("prompt", Messages.src.config.schema.configFile.text0066),
  bool("send-on-join", Messages.src.config.schema.configFile.text0067),
  bool("kick-if-declined", Messages.src.config.schema.configFile.text0068),
  bool(
    "kick-if-failed-to-apply",
    Messages.src.config.schema.configFile.text0069,
  ),
  bool(
    "strict-player-uuid-validation",
    Messages.src.config.schema.configFile.text0070,
  ),
  bool("auto-upload", Messages.src.config.schema.configFile.text0071),
  bool("resend-on-upload", Messages.src.config.schema.configFile.text0072),
  field("file-to-upload", Messages.src.config.schema.configFile.text0073),
  mapping("proxy", Messages.src.config.schema.configFile.text0074),
  list("hosting", Messages.src.config.schema.configFile.text0075, {
    snippet:
      "hosting:\n  - type: ${1|self,external,lobfile,s3,openlist,alist,dropbox,onedrive,gitlab,none|}\n    ${0}",
  }),
];

const PROTECTION_FIELDS: readonly SchemaField[] = [
  mapping("unprotected-copy", Messages.src.config.schema.configFile.text0076, {
    optionalDependency: "Premium",
  }),
  mapping("crash-tools", Messages.src.config.schema.configFile.text0077),
  bool("incorrect-crc", Messages.src.config.schema.configFile.text0078),
  bool("fake-file-size", Messages.src.config.schema.configFile.text0079),
  bool("escape-json", Messages.src.config.schema.configFile.text0080),
  bool("fake-directory", Messages.src.config.schema.configFile.text0081),
  bool("break-texture", Messages.src.config.schema.configFile.text0082),
  mapping("obfuscation", Messages.src.config.schema.configFile.text0083, {
    optionalDependency: "Premium",
  }),
];

const OBFUSCATION_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.schema.configFile.text0084),
  number("seed", Messages.src.config.schema.configFile.text0085),
  mapping("item-model", Messages.src.config.schema.configFile.text0086),
  mapping("overlay", Messages.src.config.schema.configFile.text0087),
  mapping("namespace", Messages.src.config.schema.configFile.text0088),
  mapping("path", Messages.src.config.schema.configFile.text0089),
  mapping("atlas", Messages.src.config.schema.configFile.text0090),
  list("bypass-textures", Messages.src.config.schema.configFile.text0091),
  list("bypass-models", Messages.src.config.schema.configFile.text0092),
  list("bypass-sounds", Messages.src.config.schema.configFile.text0093),
  list("bypass-item-models", Messages.src.config.schema.configFile.text0094),
  list("bypass-equipments", Messages.src.config.schema.configFile.text0095),
];

const ITEM_FIELDS: readonly SchemaField[] = [
  bool("client-bound-model", Messages.src.config.schema.configFile.text0096),
  bool("always-use-item-model", Messages.src.config.schema.configFile.text0097),
  bool(
    "always-use-custom-model-data",
    Messages.src.config.schema.configFile.text0098,
  ),
  bool(
    "always-generate-model-overrides",
    Messages.src.config.schema.configFile.text0099,
  ),
  bool("non-italic-tag", Messages.src.config.schema.configFile.text0100),
  field("default-material", Messages.src.config.schema.configFile.text0101, {
    valueProvider: "material",
  }),
  mapping("update-triggers", Messages.src.config.schema.configFile.text0102),
  mapping(
    "custom-model-data-starting-value",
    Messages.src.config.schema.configFile.text0103,
  ),
  mapping(
    "default-drop-display",
    Messages.src.config.schema.configFile.text0104,
  ),
  mapping("data-fixer-upper", Messages.src.config.schema.configFile.text0105),
];

const BLOCK_FIELDS: readonly SchemaField[] = [
  number("serverside-blocks", Messages.src.config.schema.configFile.text0106),
  mapping("sound-system", Messages.src.config.schema.configFile.text0107),
  bool(
    "simplify-adventure-break-check",
    Messages.src.config.schema.configFile.text0108,
  ),
  bool(
    "simplify-adventure-place-check",
    Messages.src.config.schema.configFile.text0109,
  ),
  mapping("light-system", Messages.src.config.schema.configFile.text0110),
  mapping(
    "deceive-bukkit-material",
    Messages.src.config.schema.configFile.text0111,
  ),
  bool(
    "inject-bukkit-material",
    Messages.src.config.schema.configFile.text0112,
  ),
  mapping("predict-breaking", Messages.src.config.schema.configFile.text0113),
];

const OFFSET_CHARACTER_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.schema.configFile.text0114),
  field("font", Messages.src.config.schema.configFile.text0115),
  ...[
    "-1",
    "-2",
    "-3",
    "-4",
    "-5",
    "-6",
    "-7",
    "-8",
    "-9",
    "-10",
    "-11",
    "-12",
    "-13",
    "-14",
    "-15",
    "-16",
    "-32",
    "-48",
    "-64",
    "-128",
    "-256",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "32",
    "48",
    "64",
    "128",
    "256",
  ].map((key) =>
    field(key, Messages.src.config.schema.configFile.text0116(key)),
  ),
];

const GUI_PAGE_NAVIGATION_FIELDS: readonly SchemaField[] = [
  requiredMapping("next", Messages.src.config.schema.configFile.text0117),
  requiredMapping("previous", Messages.src.config.schema.configFile.text0118),
];
const GUI_AVAILABLE_FIELDS: readonly SchemaField[] = [
  requiredString("available", Messages.src.config.schema.configFile.text0119),
  requiredString(
    "not-available",
    Messages.src.config.schema.configFile.text0120,
  ),
];

const GUI_RECIPE_KINDS = [
  "none",
  "blasting",
  "smelting",
  "smoking",
  "campfire-cooking",
  "crafting",
  "stonecutting",
  "smithing-transform",
  "brewing",
] as const;

const STATIC_FIELDS = new Map<string, readonly SchemaField[]>([
  ["", CONFIG_FILE_TOP_LEVEL_FIELDS],
  ["resource_pack", RESOURCE_PACK_FIELDS],
  [
    "resource_pack.supported_version",
    [
      enumField("min", Messages.src.config.schema.configFile.text0121, [
        "server",
        "server_version",
        "latest",
        "latest_version",
      ]),
      enumField("max", Messages.src.config.schema.configFile.text0122, [
        "server",
        "server_version",
        "latest",
        "latest_version",
      ]),
    ],
  ],
  [
    "resource_pack.validation",
    [
      bool("enable", Messages.src.config.schema.configFile.text0123),
      bool("fix-atlas", Messages.src.config.schema.configFile.text0124),
      bool(
        "fix-missing-texture",
        Messages.src.config.schema.configFile.text0125,
      ),
      mapping(
        "fallback-models",
        Messages.src.config.schema.configFile.text0126,
      ),
    ],
  ],
  [
    "resource_pack.validation.fallback_models",
    [
      bool(
        "fix-textures-format",
        Messages.src.config.schema.configFile.text0127,
      ),
      bool(
        "fix-element-rotation-angle",
        Messages.src.config.schema.configFile.text0128,
      ),
    ],
  ],
  [
    "resource_pack.optimization",
    [
      bool("enable", Messages.src.config.schema.configFile.text0129),
      mapping("texture", Messages.src.config.schema.configFile.text0130),
      mapping("json", Messages.src.config.schema.configFile.text0131),
    ],
  ],
  [
    "resource_pack.optimization.texture",
    [
      bool("enable", Messages.src.config.schema.configFile.text0132),
      number(
        "zopfli-iterations",
        Messages.src.config.schema.configFile.text0133,
      ),
      list("exclude", Messages.src.config.schema.configFile.text0134),
    ],
  ],
  [
    "resource_pack.optimization.json",
    [
      bool("enable", Messages.src.config.schema.configFile.text0135),
      list("exclude", Messages.src.config.schema.configFile.text0136),
    ],
  ],
  [
    "resource_pack.map_plugin_compatibility",
    [
      bool("enable", Messages.src.config.schema.configFile.text0137),
      field("path", Messages.src.config.schema.configFile.text0138),
    ],
  ],
  [
    "resource_pack.pack_squash",
    [
      bool("enable", Messages.src.config.schema.configFile.text0139),
      field("software-path", Messages.src.config.schema.configFile.text0140),
      field("config-path", Messages.src.config.schema.configFile.text0141),
    ],
  ],
  ["resource_pack.protection", PROTECTION_FIELDS],
  [
    "resource_pack.protection.unprotected_copy",
    [
      bool("enable", Messages.src.config.schema.configFile.text0142, []),
      field("path", Messages.src.config.schema.configFile.text0143),
    ],
  ],
  [
    "resource_pack.protection.crash_tools",
    [
      ...BOOLEAN_FIELDS(
        [
          "method-1",
          "method-2",
          "method-3",
          "method-4",
          "method-5",
          "method-6",
          "method-7",
          "method-8",
        ],
        Messages.src.config.schema.configFile.text0144,
      ),
      bool("method-9", Messages.src.config.schema.configFile.text0145),
    ],
  ],
  ["resource_pack.protection.obfuscation", OBFUSCATION_FIELDS],
  [
    "resource_pack.protection.obfuscation.item_model",
    [
      bool("enable", Messages.src.config.schema.configFile.text0146),
      bool("use-cache", Messages.src.config.schema.configFile.text0147),
    ],
  ],
  [
    "resource_pack.protection.obfuscation.overlay",
    [
      field("length", Messages.src.config.schema.configFile.text0148, {
        snippet: "length: ${1:3~6}",
      }),
    ],
  ],
  [
    "resource_pack.protection.obfuscation.namespace",
    [
      number("amount", Messages.src.config.schema.configFile.text0149),
      field("length", Messages.src.config.schema.configFile.text0150, {
        snippet: "length: ${1:2~6}",
      }),
    ],
  ],
  [
    "resource_pack.protection.obfuscation.path",
    [
      field("depth", Messages.src.config.schema.configFile.text0151, {
        snippet: "depth: ${1:2~6}",
      }),
      field("length", Messages.src.config.schema.configFile.text0152, {
        snippet: "length: ${1:1~4}",
      }),
      bool("anti-unzip", Messages.src.config.schema.configFile.text0153),
      field("block-source", Messages.src.config.schema.configFile.text0154),
      field("item-source", Messages.src.config.schema.configFile.text0155),
    ],
  ],
  [
    "resource_pack.protection.obfuscation.atlas",
    [
      field("prefix", Messages.src.config.schema.configFile.text0156),
      number(
        "images-per-canvas",
        Messages.src.config.schema.configFile.text0157,
      ),
    ],
  ],
  ["resource_pack.delivery", DELIVERY_FIELDS],
  [
    "resource_pack.delivery.proxy",
    [
      bool("enable", Messages.src.config.schema.configFile.text0158),
      field("host", Messages.src.config.schema.configFile.text0159),
      number("port", Messages.src.config.schema.configFile.text0160),
      field("username", Messages.src.config.schema.configFile.text0161),
      field("password", Messages.src.config.schema.configFile.text0162),
      field("scheme", Messages.src.config.schema.configFile.text0163),
    ],
  ],
  ["item", ITEM_FIELDS],
  [
    "item.update_triggers",
    [
      bool(
        "click-in-inventory",
        Messages.src.config.schema.configFile.text0164,
      ),
      bool("drop", Messages.src.config.schema.configFile.text0165),
      bool("pick-up", Messages.src.config.schema.configFile.text0166),
      bool("attack", Messages.src.config.schema.configFile.text0167),
    ],
  ],
  [
    "item.custom_model_data_starting_value",
    [
      number("default", Messages.src.config.schema.configFile.text0168),
      mapping("overrides", Messages.src.config.schema.configFile.text0169),
    ],
  ],
  [
    "item.custom_model_data_starting_value.overrides",
    [number("<material>", Messages.src.config.schema.configFile.text0170)],
  ],
  [
    "item.default_drop_display",
    [
      bool("enable", Messages.src.config.schema.configFile.text0171),
      field("format", Messages.src.config.schema.configFile.text0172),
    ],
  ],
  [
    "item.data_fixer_upper",
    [
      bool("enable", Messages.src.config.schema.configFile.text0173),
      field(
        "fallback-version",
        Messages.src.config.schema.configFile.text0174,
        { values: ["server"] },
      ),
    ],
  ],
  [
    "equipment",
    [
      mapping(
        "sacrificed-vanilla-armor",
        Messages.src.config.schema.configFile.text0175,
      ),
    ],
  ],
  [
    "equipment.sacrificed_vanilla_armor",
    [
      enumField("type", Messages.src.config.schema.configFile.text0176, [
        "chainmail",
        "diamond",
        "gold",
        "iron",
        "netherite",
      ]),
      field("asset-id", Messages.src.config.schema.configFile.text0177),
      field("humanoid", Messages.src.config.schema.configFile.text0178, {
        valueProvider: "texture",
      }),
      field(
        "humanoid-leggings",
        Messages.src.config.schema.configFile.text0179,
        { valueProvider: "texture" },
      ),
    ],
  ],
  ["block", BLOCK_FIELDS],
  [
    "block.sound_system",
    [
      bool("enable", Messages.src.config.schema.configFile.text0180),
      mapping(
        "process-cancelled-events",
        Messages.src.config.schema.configFile.text0181,
      ),
      field(
        "silent-sound-path",
        Messages.src.config.schema.configFile.text0182,
      ),
    ],
  ],
  [
    "block.sound_system.process_cancelled_events",
    [
      bool("step", Messages.src.config.schema.configFile.text0183),
      bool("break", Messages.src.config.schema.configFile.text0184),
    ],
  ],
  [
    "block.light_system",
    [
      bool("enable", Messages.src.config.schema.configFile.text0185),
      bool("async", Messages.src.config.schema.configFile.text0186),
    ],
  ],
  [
    "block.deceive_bukkit_material",
    [
      field("default", Messages.src.config.schema.configFile.text0187, {
        valueProvider: "material",
      }),
      mapping("overrides", Messages.src.config.schema.configFile.text0188),
    ],
  ],
  [
    "block.deceive_bukkit_material.overrides",
    [
      field("<id-or-range>", Messages.src.config.schema.configFile.text0189, {
        valueProvider: "material",
      }),
    ],
  ],
  [
    "block.predict_breaking",
    [
      bool("enable", Messages.src.config.schema.configFile.text0190),
      number("interval", Messages.src.config.schema.configFile.text0191),
      number(
        "extended-interaction-range",
        Messages.src.config.schema.configFile.text0192,
      ),
    ],
  ],
  [
    "furniture",
    [
      bool("hide-base-entity", Messages.src.config.schema.configFile.text0193),
      enumField(
        "collision-entity-type",
        Messages.src.config.schema.configFile.text0194,
        ["interaction", "boat"],
      ),
      mapping("light-system", Messages.src.config.schema.configFile.text0195),
    ],
  ],
  [
    "furniture.light_system",
    [bool("enable", Messages.src.config.schema.configFile.text0196)],
  ],
  [
    "emoji",
    [
      mapping("contexts", Messages.src.config.schema.configFile.text0197),
      number(
        "max-emojis-per-parse",
        Messages.src.config.schema.configFile.text0198,
      ),
    ],
  ],
  ["emoji.contexts", BOOLEAN_FIELDS(["chat", "book", "anvil", "sign"])],
  [
    "loot",
    [list("entity-sources", Messages.src.config.schema.configFile.text0199)],
  ],
  [
    "image",
    [
      mapping(
        "illegal-characters-filter",
        Messages.src.config.schema.configFile.text0200,
      ),
      mapping(
        "codepoint-starting-value",
        Messages.src.config.schema.configFile.text0201,
      ),
      mapping(
        "offset-characters",
        Messages.src.config.schema.configFile.text0202,
      ),
    ],
  ],
  [
    "image.illegal_characters_filter",
    BOOLEAN_FIELDS(["anvil", "book", "chat", "command", "sign"]),
  ],
  [
    "image.codepoint_starting_value",
    [
      number("default", Messages.src.config.schema.configFile.text0203),
      mapping("overrides", Messages.src.config.schema.configFile.text0204),
    ],
  ],
  [
    "image.codepoint_starting_value.overrides",
    [number("<font>", Messages.src.config.schema.configFile.text0205)],
  ],
  ["image.offset_characters", OFFSET_CHARACTER_FIELDS],
]);

const ADDITIONAL_STATIC_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "network",
    [
      bool(
        "disable-chat-report",
        Messages.src.config.schema.configFile.text0206,
      ),
      bool(
        "disable-item-operations",
        Messages.src.config.schema.configFile.text0207,
      ),
      bool(
        "optimize-item-codec",
        Messages.src.config.schema.configFile.text0208,
      ),
      mapping(
        "intercept-packets",
        Messages.src.config.schema.configFile.text0209,
      ),
      mapping("mod-channel", Messages.src.config.schema.configFile.text0210),
      mapping("item-crypto", Messages.src.config.schema.configFile.text0211),
    ],
  ],
  [
    "network.intercept_packets",
    [
      "system-chat",
      "tab-list",
      "player-info",
      "set-score",
      "actionbar",
      "title",
      "bossbar",
      "container",
      "team",
      "scoreboard",
      "entity-name",
      "armor-stand",
      "text-display",
      "item",
      "advancement",
      "player-chat",
      "dialog",
    ].map((name) =>
      bool(name, Messages.src.config.schema.configFile.text0212(name)),
    ),
  ],
  [
    "network.mod_channel",
    [
      bool(
        "requires-permission",
        Messages.src.config.schema.configFile.text0213,
      ),
      bool(
        "logging-permission-denied",
        Messages.src.config.schema.configFile.text0214,
      ),
      number(
        "creative-tab-max-items-per-packet",
        Messages.src.config.schema.configFile.text0215,
      ),
    ],
  ],
  [
    "network.item_crypto",
    [
      bool("enable", Messages.src.config.schema.configFile.text0216),
      enumField("algorithm", Messages.src.config.schema.configFile.text0217, [
        "xor",
        "aes-gcm",
        "aes_gcm",
        "chacha20",
      ]),
      field("key", Messages.src.config.schema.configFile.text0218),
    ],
  ],
  [
    "recipe",
    [
      bool("enable", Messages.src.config.schema.configFile.text0219),
      mapping(
        "disable-vanilla-recipes",
        Messages.src.config.schema.configFile.text0220,
      ),
      list(
        "ingredient-sources",
        Messages.src.config.schema.configFile.text0221,
      ),
      bool(
        "unlock-on-ingredient-obtained",
        Messages.src.config.schema.configFile.text0222,
      ),
      mapping("unlock-on-join", Messages.src.config.schema.configFile.text0223),
      bool(
        "inject-block-entities",
        Messages.src.config.schema.configFile.text0224,
      ),
      list("entity-sources", Messages.src.config.schema.configFile.text0225),
    ],
  ],
  [
    "recipe.disable_vanilla_recipes",
    [
      bool("all", Messages.src.config.schema.configFile.text0226),
      list("list", Messages.src.config.schema.configFile.text0227),
    ],
  ],
  [
    "recipe.unlock_on_join",
    [
      bool("all", Messages.src.config.schema.configFile.text0228),
      list("list", Messages.src.config.schema.configFile.text0229),
    ],
  ],
  ["gui", [mapping("browser", Messages.src.config.schema.configFile.text0230)]],
  [
    "gui.browser",
    [
      requiredMapping("sounds", Messages.src.config.schema.configFile.text0231),
      requiredMapping("main", Messages.src.config.schema.configFile.text0232),
      requiredMapping(
        "category",
        Messages.src.config.schema.configFile.text0233,
      ),
      requiredMapping("recipe", Messages.src.config.schema.configFile.text0234),
    ],
  ],
  [
    "gui.browser.sounds",
    [
      requiredString(
        "change-page",
        Messages.src.config.schema.configFile.text0235,
      ),
      requiredString(
        "return-page",
        Messages.src.config.schema.configFile.text0236,
      ),
      requiredString(
        "pick-item",
        Messages.src.config.schema.configFile.text0237,
      ),
      requiredString(
        "click-button",
        Messages.src.config.schema.configFile.text0238,
      ),
    ],
  ],
  [
    "gui.browser.main",
    [
      requiredString("title", Messages.src.config.schema.configFile.text0239),
      requiredMapping(
        "page-navigation",
        Messages.src.config.schema.configFile.text0240,
      ),
    ],
  ],
  ["gui.browser.main.page_navigation", GUI_PAGE_NAVIGATION_FIELDS],
  ["gui.browser.main.page_navigation.next", GUI_AVAILABLE_FIELDS],
  ["gui.browser.main.page_navigation.previous", GUI_AVAILABLE_FIELDS],
  [
    "gui.browser.category",
    [
      requiredString("title", Messages.src.config.schema.configFile.text0241),
      requiredMapping(
        "page-navigation",
        Messages.src.config.schema.configFile.text0242,
      ),
    ],
  ],
  [
    "gui.browser.category.page_navigation",
    [
      ...GUI_PAGE_NAVIGATION_FIELDS,
      requiredString("return", Messages.src.config.schema.configFile.text0243),
      requiredString("exit", Messages.src.config.schema.configFile.text0244),
    ],
  ],
  ["gui.browser.category.page_navigation.next", GUI_AVAILABLE_FIELDS],
  ["gui.browser.category.page_navigation.previous", GUI_AVAILABLE_FIELDS],
  [
    "gui.browser.recipe",
    [
      requiredString(
        "get-item-icon",
        Messages.src.config.schema.configFile.text0245,
      ),
      requiredString(
        "cooking-information-icon",
        Messages.src.config.schema.configFile.text0246,
      ),
      requiredMapping(
        "page-navigation",
        Messages.src.config.schema.configFile.text0247,
      ),
      ...GUI_RECIPE_KINDS.map((kind) =>
        requiredMapping(
          kind,
          Messages.src.config.schema.configFile.text0248(kind),
        ),
      ),
    ],
  ],
  [
    "gui.browser.recipe.page_navigation",
    [
      ...GUI_PAGE_NAVIGATION_FIELDS,
      requiredString("return", Messages.src.config.schema.configFile.text0249),
      requiredString("exit", Messages.src.config.schema.configFile.text0250),
    ],
  ],
  ["gui.browser.recipe.page_navigation.next", GUI_AVAILABLE_FIELDS],
  ["gui.browser.recipe.page_navigation.previous", GUI_AVAILABLE_FIELDS],
  ...GUI_RECIPE_KINDS.map(
    (kind) =>
      [
        `gui.browser.recipe.${kind.replaceAll("-", "_")}`,
        [
          requiredString(
            "title",
            Messages.src.config.schema.configFile.text0251(kind),
          ),
        ],
      ] as const,
  ),
  [
    "chunk_system",
    [
      enumField(
        "storage-type",
        Messages.src.config.schema.configFile.text0252,
        ["mca", "pdc", "none"],
      ),
      bool("cache-system", Messages.src.config.schema.configFile.text0253),
      enumField(
        "compression-method",
        Messages.src.config.schema.configFile.text0254,
        ["1", "2", "3", "4", "5"],
        {
          valueProvider: "number",
          valueDetails: {
            "1": "NONE",
            "2": "DEFLATE",
            "3": "GZIP",
            "4": "LZ4",
            "5": "ZSTD",
          },
        },
      ),
      mapping("injection", Messages.src.config.schema.configFile.text0255),
      bool(
        "restore-vanilla-blocks-on-chunk-unload",
        Messages.src.config.schema.configFile.text0256,
      ),
      bool(
        "restore-custom-blocks-on-chunk-load",
        Messages.src.config.schema.configFile.text0257,
      ),
      bool(
        "sync-custom-blocks-on-chunk-load",
        Messages.src.config.schema.configFile.text0258,
      ),
      mapping(
        "process-invalid-blocks",
        Messages.src.config.schema.configFile.text0259,
      ),
      mapping(
        "process-invalid-furniture",
        Messages.src.config.schema.configFile.text0260,
      ),
      mapping("generation", Messages.src.config.schema.configFile.text0261),
    ],
  ],
  [
    "chunk_system.injection",
    [
      enumField("target", Messages.src.config.schema.configFile.text0262, [
        "section",
        "palette",
      ]),
    ],
  ],
  [
    "chunk_system.process_invalid_blocks",
    [
      bool("enable", Messages.src.config.schema.configFile.text0263),
      list("remove", Messages.src.config.schema.configFile.text0264),
      mapping("convert", Messages.src.config.schema.configFile.text0265),
    ],
  ],
  [
    "chunk_system.process_invalid_blocks.convert",
    [field("<from>", Messages.src.config.schema.configFile.text0266)],
  ],
  [
    "chunk_system.process_invalid_furniture",
    [
      bool("enable", Messages.src.config.schema.configFile.text0267),
      list("remove", Messages.src.config.schema.configFile.text0268),
      mapping("convert", Messages.src.config.schema.configFile.text0269),
    ],
  ],
  [
    "chunk_system.process_invalid_furniture.convert",
    [field("<from>", Messages.src.config.schema.configFile.text0270)],
  ],
  [
    "chunk_system.generation",
    BOOLEAN_FIELDS(["noise", "surface", "structure", "carver", "feature"]),
  ],
  [
    "client_optimization",
    [
      mapping(
        "entity-culling",
        Messages.src.config.schema.configFile.text0271,
        { optionalDependency: "Premium" },
      ),
    ],
  ],
  [
    "client_optimization.entity_culling",
    [
      bool("enable", Messages.src.config.schema.configFile.text0272),
      bool("ray-tracing", Messages.src.config.schema.configFile.text0273),
      number("view-distance", Messages.src.config.schema.configFile.text0274),
      number("threads", Messages.src.config.schema.configFile.text0275),
      mapping("rate-limiting", Messages.src.config.schema.configFile.text0276),
    ],
  ],
  [
    "client_optimization.entity_culling.rate_limiting",
    [
      bool("enable", Messages.src.config.schema.configFile.text0277),
      number("bucket-size", Messages.src.config.schema.configFile.text0278),
      number(
        "restore-per-tick",
        Messages.src.config.schema.configFile.text0279,
      ),
    ],
  ],
  [
    "misc",
    [
      bool(
        "filter-configuration-phase-disconnect",
        Messages.src.config.schema.configFile.text0280,
      ),
      bool(
        "delay-configuration-load",
        Messages.src.config.schema.configFile.text0281,
      ),
      bool(
        "multi-threaded-configuration-load",
        Messages.src.config.schema.configFile.text0282,
      ),
      bool(
        "inject-packetevents",
        Messages.src.config.schema.configFile.text0283,
      ),
      bool("hook-axiompaper", Messages.src.config.schema.configFile.text0284),
    ],
  ],
  [
    "debug",
    [
      ...BOOLEAN_FIELDS([
        "common",
        "furniture",
        "item",
        "resource-pack",
        "block",
        "entity-culling",
        "chunk",
        "packet",
      ]),
      list("ignored-packets", Messages.src.config.schema.configFile.text0285),
      bool("print-stack-trace", Messages.src.config.schema.configFile.text0286),
    ],
  ],
  [
    "bedrock_edition_support",
    [
      bool("enable", Messages.src.config.schema.configFile.text0287),
      field("player-prefix", Messages.src.config.schema.configFile.text0288),
    ],
  ],
]);

const HOST_TYPE_FIELD = enumField(
  "type",
  Messages.src.config.schema.configFile.text0289,
  CONFIG_HOSTING_TYPES,
  { required: true, valueDetails: CONFIG_HOSTING_TYPE_DETAILS },
);

const HOST_ENVIRONMENT_FIELD = bool(
  "use_environment_variables",
  Messages.src.config.schema.configFile.text0290,
  ["use-environment-variables"],
);

const HOST_CACHE_FIELD = field(
  "cache_file_name",
  Messages.src.config.schema.configFile.text0291,
  { aliases: ["cache-file-name"] },
);

const HOST_FIELDS = new Map<string, readonly SchemaField[]>([
  ["none", []],
  [
    "external",
    [
      requiredString("url", Messages.src.config.schema.configFile.text0292),
      field("uuid", Messages.src.config.schema.configFile.text0293),
      field("sha1", Messages.src.config.schema.configFile.text0294),
    ],
  ],
  [
    "self",
    [
      requiredString("ip", Messages.src.config.schema.configFile.text0295),
      enumField("port", Messages.src.config.schema.configFile.text0296, [
        "auto",
      ]),
      field("url", Messages.src.config.schema.configFile.text0297),
      field("protocol", Messages.src.config.schema.configFile.text0298, {
        values: ["http", "https"],
      }),
      bool(
        "deny_non_minecraft_request",
        Messages.src.config.schema.configFile.text0299,
        ["deny-non-minecraft-request"],
      ),
      bool("one_time_token", Messages.src.config.schema.configFile.text0300, [
        "one-time-token",
      ]),
      bool(
        "strict_validation",
        Messages.src.config.schema.configFile.text0301,
        ["strict-validation"],
      ),
      mapping("rate_limiting", Messages.src.config.schema.configFile.text0302, {
        aliases: ["rate-limiting"],
      }),
      number(
        "max_bandwidth_per_second",
        Messages.src.config.schema.configFile.text0303,
        {
          aliases: ["max-bandwidth-per-second"],
        },
      ),
      number(
        "min_download_speed_per_player",
        Messages.src.config.schema.configFile.text0304,
        {
          aliases: ["min-download-speed-per-player"],
        },
      ),
    ],
  ],
  [
    "lobfile",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "api_key",
        Messages.src.config.schema.configFile.text0305,
        ["api-key"],
      ),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "openlist",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "api_url",
        Messages.src.config.schema.configFile.text0306,
        ["api-url"],
      ),
      requiredString(
        "username",
        Messages.src.config.schema.configFile.text0307,
      ),
      requiredString(
        "password",
        Messages.src.config.schema.configFile.text0308,
      ),
      field("file_password", Messages.src.config.schema.configFile.text0309),
      field("otp_code", Messages.src.config.schema.configFile.text0310, {
        aliases: ["otp-code"],
      }),
      number(
        "jwt_token_expiration",
        Messages.src.config.schema.configFile.text0311,
        { aliases: ["jwt-token-expiration"] },
      ),
      requiredString(
        "upload_path",
        Messages.src.config.schema.configFile.text0312,
        ["upload-path"],
      ),
      bool("disable_upload", Messages.src.config.schema.configFile.text0313, [
        "disable-upload",
      ]),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "alist",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "api_url",
        Messages.src.config.schema.configFile.text0314,
        ["api-url"],
      ),
      requiredString(
        "username",
        Messages.src.config.schema.configFile.text0315,
      ),
      requiredString(
        "password",
        Messages.src.config.schema.configFile.text0316,
      ),
      field("file_password", Messages.src.config.schema.configFile.text0317),
      field("otp_code", Messages.src.config.schema.configFile.text0318, {
        aliases: ["otp-code"],
      }),
      number(
        "jwt_token_expiration",
        Messages.src.config.schema.configFile.text0319,
        { aliases: ["jwt-token-expiration"] },
      ),
      requiredString(
        "upload_path",
        Messages.src.config.schema.configFile.text0320,
        ["upload-path"],
      ),
      bool("disable_upload", Messages.src.config.schema.configFile.text0321, [
        "disable-upload",
      ]),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "dropbox",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "app_key",
        Messages.src.config.schema.configFile.text0322,
        ["app-key"],
      ),
      requiredString(
        "app_secret",
        Messages.src.config.schema.configFile.text0323,
        ["app-secret"],
      ),
      requiredString(
        "refresh_token",
        Messages.src.config.schema.configFile.text0324,
        ["refresh-token"],
      ),
      requiredString(
        "upload_path",
        Messages.src.config.schema.configFile.text0325,
        ["upload-path"],
      ),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "onedrive",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "client_id",
        Messages.src.config.schema.configFile.text0326,
        ["client-id"],
      ),
      requiredString(
        "client_secret",
        Messages.src.config.schema.configFile.text0327,
        ["client-secret"],
      ),
      requiredString(
        "refresh_token",
        Messages.src.config.schema.configFile.text0328,
        ["refresh-token"],
      ),
      field("upload_path", Messages.src.config.schema.configFile.text0329, {
        aliases: ["upload-path"],
      }),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "gitlab",
    [
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "gitlab_url",
        Messages.src.config.schema.configFile.text0330,
        ["gitlab-url"],
      ),
      requiredString(
        "access_token",
        Messages.src.config.schema.configFile.text0331,
        ["access-token"],
      ),
      requiredString(
        "project_id",
        Messages.src.config.schema.configFile.text0332,
        ["project-id"],
      ),
      HOST_CACHE_FIELD,
    ],
  ],
  [
    "s3",
    [
      requiredString(
        "endpoint",
        Messages.src.config.schema.configFile.text0333,
      ),
      field("protocol", Messages.src.config.schema.configFile.text0334, {
        values: ["https", "http"],
      }),
      bool("path_style", Messages.src.config.schema.configFile.text0335, [
        "path-style",
      ]),
      requiredString("bucket", Messages.src.config.schema.configFile.text0336),
      field("region", Messages.src.config.schema.configFile.text0337, {
        values: ["auto"],
      }),
      HOST_ENVIRONMENT_FIELD,
      requiredString(
        "access_key_id",
        Messages.src.config.schema.configFile.text0338,
        ["access-key-id"],
      ),
      requiredString(
        "access_key_secret",
        Messages.src.config.schema.configFile.text0339,
        ["access-key-secret"],
      ),
      field("upload_path", Messages.src.config.schema.configFile.text0340, {
        aliases: ["upload-path"],
      }),
      bool(
        "disable_calculate_sha256",
        Messages.src.config.schema.configFile.text0341,
        ["disable-calculate-sha256"],
      ),
      number("validity", Messages.src.config.schema.configFile.text0342),
      mapping("cdn", Messages.src.config.schema.configFile.text0343),
      field("timeout", Messages.src.config.schema.configFile.text0344, {
        snippet: "timeout:\n  connect: ${1:30}\n  socket: ${0:30}",
      }),
      mapping("rate_map", Messages.src.config.schema.configFile.text0345, {
        aliases: ["rate_limit", "rate-map", "rate-limit"],
      }),
      mapping(
        "multipart_upload",
        Messages.src.config.schema.configFile.text0346,
        {
          aliases: ["multipart-upload"],
        },
      ),
    ],
  ],
]);

const SELF_RATE_LIMIT_FIELDS: readonly SchemaField[] = [
  field("qps_per_ip", Messages.src.config.schema.configFile.text0347, {
    aliases: ["qps-per-ip"],
  }),
  number(
    "max_bandwidth_per_second",
    Messages.src.config.schema.configFile.text0348,
    {
      aliases: ["max-bandwidth-per-second"],
    },
  ),
  number(
    "min_download_speed_per_player",
    Messages.src.config.schema.configFile.text0349,
    {
      aliases: ["min-download-speed-per-player"],
    },
  ),
];

const S3_CDN_FIELDS: readonly SchemaField[] = [
  requiredString("domain", Messages.src.config.schema.configFile.text0350),
  field("protocol", Messages.src.config.schema.configFile.text0351, {
    values: ["https", "http"],
  }),
];
const S3_TIMEOUT_FIELDS: readonly SchemaField[] = [
  number("connect", Messages.src.config.schema.configFile.text0352),
  number("socket", Messages.src.config.schema.configFile.text0353),
  number("api_call", Messages.src.config.schema.configFile.text0354, {
    aliases: ["api-call"],
  }),
  number("api_call_attempt", Messages.src.config.schema.configFile.text0355, {
    aliases: ["api-call-attempt"],
  }),
  number(
    "connection_acquisition",
    Messages.src.config.schema.configFile.text0356,
    { aliases: ["connection-acquisition"] },
  ),
];
const S3_RATE_FIELDS: readonly SchemaField[] = [
  number("max_requests", Messages.src.config.schema.configFile.text0357, {
    aliases: ["max-requests"],
  }),
  number("reset_interval", Messages.src.config.schema.configFile.text0358, {
    aliases: ["reset-interval"],
  }),
];
const S3_MULTIPART_FIELDS: readonly SchemaField[] = [
  number("max_concurrency", Messages.src.config.schema.configFile.text0359, {
    aliases: ["max-concurrency"],
    required: true,
  }),
  number("part_size", Messages.src.config.schema.configFile.text0360, {
    aliases: ["part-size"],
  }),
  number("max_retries", Messages.src.config.schema.configFile.text0361, {
    aliases: ["max-retries"],
  }),
];

const MATCHER_TYPE_FIELD = enumField(
  "type",
  Messages.src.config.schema.configFile.text0363,
  [
    ...CONFIG_PATH_MATCHER_TYPES,
    ...CONFIG_PATH_MATCHER_TYPES.map((type) => `!${type}`),
  ],
  {
    required: true,
    valueDetails: Object.fromEntries([
      ...CONFIG_PATH_MATCHER_TYPES.map(
        (type) => [type, CONFIG_PATH_MATCHER_TYPE_DETAILS[type]] as const,
      ),
      ...CONFIG_PATH_MATCHER_TYPES.map(
        (type) =>
          [
            `!${type}`,
            Messages.src.config.schema.configFile.text0362(
              CONFIG_PATH_MATCHER_TYPE_DETAILS[type],
            ),
          ] as const,
      ),
    ]),
  },
);

const MATCHER_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "any_of",
    [
      list("terms", Messages.src.config.schema.configFile.text0364, {
        aliases: ["term"],
      }),
    ],
  ],
  [
    "all_of",
    [
      list("terms", Messages.src.config.schema.configFile.text0365, {
        aliases: ["term"],
      }),
    ],
  ],
  [
    "inverted",
    [
      list("terms", Messages.src.config.schema.configFile.text0366, {
        aliases: ["term"],
      }),
    ],
  ],
  [
    "contains",
    [requiredString("path", Messages.src.config.schema.configFile.text0367)],
  ],
  [
    "exact",
    [requiredString("path", Messages.src.config.schema.configFile.text0368)],
  ],
  [
    "filename",
    [requiredString("name", Messages.src.config.schema.configFile.text0369)],
  ],
  [
    "pattern",
    [requiredString("pattern", Messages.src.config.schema.configFile.text0370)],
  ],
  [
    "parent_path_suffix",
    [requiredString("suffix", Messages.src.config.schema.configFile.text0371)],
  ],
  [
    "parent_path_prefix",
    [requiredString("prefix", Messages.src.config.schema.configFile.text0372)],
  ],
]);

const RESOLUTION_TYPE_FIELD = enumField(
  "type",
  Messages.src.config.schema.configFile.text0373,
  CONFIG_CONFLICT_RESOLUTION_TYPES,
  { required: true, valueDetails: CONFIG_CONFLICT_RESOLUTION_TYPE_DETAILS },
);

const RESOLUTION_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "retain_matching",
    [requiredMapping("term", Messages.src.config.schema.configFile.text0374)],
  ],
  [
    "merge_json",
    [bool("deeply", Messages.src.config.schema.configFile.text0375)],
  ],
  ["merge_atlas", []],
  ["merge_font", []],
  ["merge_pack_mcmeta", []],
  ["merge_legacy_model", []],
  [
    "conditional",
    [
      requiredMapping("term", Messages.src.config.schema.configFile.text0376),
      requiredMapping(
        "resolution",
        Messages.src.config.schema.configFile.text0377,
      ),
    ],
  ],
]);

const DUPLICATED_HANDLER_ITEM_FIELDS: readonly SchemaField[] = [
  requiredMapping("term", Messages.src.config.schema.configFile.text0378),
  requiredMapping("resolution", Messages.src.config.schema.configFile.text0379),
];

function siblingValue(
  context: SchemaContext,
  key: string,
  aliases: readonly string[] = [],
): string | undefined {
  const semantics = new Set([key, ...aliases].map(normalizeConfigPathSegment));
  for (const [candidate, value] of context.siblingValues) {
    if (semantics.has(normalizeConfigPathSegment(candidate))) return value;
  }
  return undefined;
}

const NUMBER_PROVIDER_ROOTS: readonly (readonly string[])[] = [
  ["resource_pack", "protection", "obfuscation", "overlay", "length"],
  ["resource_pack", "protection", "obfuscation", "namespace", "length"],
  ["resource_pack", "protection", "obfuscation", "path", "depth"],
  ["resource_pack", "protection", "obfuscation", "path", "length"],
];

function numberProviderRelativePath(
  context: SchemaContext,
  path: readonly string[],
): readonly string[] | undefined {
  for (const root of NUMBER_PROVIDER_ROOTS) {
    if (!pathStartsWith(path, root)) continue;
    const relative = path.slice(root.length);
    if (relative.length === 0) return relative;

    for (let offset = 0; offset < relative.length; offset += 1) {
      const relativeIndex = relative.length - offset - 1;
      const segment = relative[relativeIndex];
      const parentType = context.ancestorTypes?.[offset];
      if (segment === undefined) return undefined;

      if (segment === "weights") {
        // weights 只结束内置加权配置, 动态字段不是新的随机值配置
        const resolved = resolveNumberProviderType(parentType);
        if (
          relativeIndex !== relative.length - 1 ||
          !resolved ||
          resolved.external ||
          resolved.name !== "weighted"
        )
          return undefined;
        continue;
      }

      if (!numberProviderAllowsNestedField(parentType, segment))
        return undefined;
    }
    return relative;
  }
  return undefined;
}

function duplicateFields(
  context: SchemaContext,
  path: readonly string[],
): readonly SchemaField[] | undefined {
  if (!pathStartsWith(path, ["resource_pack", "duplicated_files_handler"]))
    return undefined;
  const relative = path.slice(2);
  if (relative.length === 1 && isListIndex(relative[0]))
    return DUPLICATED_HANDLER_ITEM_FIELDS;
  const last = relative.at(-1);
  const beforeLast = relative.at(-2);
  if (
    last === "term" ||
    last === "terms" ||
    (isListIndex(last) && (beforeLast === "term" || beforeLast === "terms"))
  ) {
    const rawType = siblingValue(context, "type");
    const withoutInversion = rawType?.startsWith("!")
      ? rawType.slice(1)
      : rawType;
    const type = withoutInversion?.startsWith("craftengine:")
      ? withoutInversion.slice("craftengine:".length)
      : withoutInversion;
    return [
      MATCHER_TYPE_FIELD,
      ...(type === undefined ? [] : (MATCHER_FIELDS.get(type) ?? [])),
    ];
  }
  if (last === "resolution") {
    const rawType = siblingValue(context, "type");
    const type = rawType?.startsWith("craftengine:")
      ? rawType.slice("craftengine:".length)
      : rawType;
    return [
      RESOLUTION_TYPE_FIELD,
      ...(type === undefined ? [] : (RESOLUTION_FIELDS.get(type) ?? [])),
    ];
  }
  return undefined;
}

export function configFileFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const path = normalizeConfigPath(
    context.path[0]?.toLowerCase() === "config.yml"
      ? context.path.slice(1)
      : context.path,
  );

  if (pathStartsWith(path, ["resource_pack", "delivery", "hosting"])) {
    const relativeWithIndex = path.slice(3);
    const relative = isListIndex(relativeWithIndex[0])
      ? relativeWithIndex.slice(1)
      : relativeWithIndex;
    if (relative.length === 0) {
      const rawType = siblingValue(context, "type");
  // alist 必须保持原样, 加上命名空间后也不能放宽检查
      const type =
        rawType === "craftengine:alist"
          ? "openlist"
          : rawType?.startsWith("craftengine:")
            ? rawType.slice("craftengine:".length)
            : rawType;
      return [
        HOST_TYPE_FIELD,
        ...(type === undefined ? [] : (HOST_FIELDS.get(type) ?? [])),
      ];
    }
    switch (relative.join(".")) {
      case "rate_limiting":
        return SELF_RATE_LIMIT_FIELDS;
      case "cdn":
        return S3_CDN_FIELDS;
      case "timeout":
        return S3_TIMEOUT_FIELDS;
      case "rate_map":
      case "rate_limit":
        return S3_RATE_FIELDS;
      case "multipart_upload":
        return S3_MULTIPART_FIELDS;
      default:
        return [];
    }
  }

  const conflictFields = duplicateFields(context, path);
  if (conflictFields !== undefined) return conflictFields;

  const providerRelative = numberProviderRelativePath(context, path);
  if (providerRelative !== undefined) {
    if (providerRelative.at(-1) === "weights") {
      return [
        number("<result>", Messages.src.config.schema.configFile.text0380),
      ];
    }
    const type = siblingValue(context, "type");
    const fields = sharedNumberProviderFields(type);
    const resolved = resolveNumberProviderType(type);
    if (resolved?.external || resolved?.name !== "exponential") return fields;
    const hasMean = siblingValue(context, "mean") !== undefined;
    return fields.map((candidate) =>
      candidate.label === "lambda" && !hasMean
        ? { ...candidate, required: true }
        : candidate,
    );
  }

  const key = path.join(".");
  return STATIC_FIELDS.get(key) ?? ADDITIONAL_STATIC_FIELDS.get(key) ?? [];
}
