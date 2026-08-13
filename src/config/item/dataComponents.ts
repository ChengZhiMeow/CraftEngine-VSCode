import { localRegistryDiscriminator } from "../registry/discriminators.js";
import { Messages } from "../../messages.js";
import { isUnknownArray } from "../../util/records.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";

export type DataComponentRootKind =
  | "scalar"
  | "mapping"
  | "list"
  | "unit"
  | "opaque";

export interface DataComponentDefinition {
  readonly id: string;
  readonly detail: string;
  readonly kind: DataComponentRootKind;
}

export interface DataComponentValidationIssue {
  readonly path: readonly string[];
  readonly message: string;
  readonly at?: "key" | "value";
}

export const DATA_COMPONENT_DEFINITIONS: readonly DataComponentDefinition[] = [
  {
    id: "minecraft:additional_trade_cost",
    detail: Messages.src.config.item.dataComponents.text0001,
    kind: "scalar",
  },
  {
    id: "minecraft:attack_range",
    detail: Messages.src.config.item.dataComponents.text0002,
    kind: "mapping",
  },
  {
    id: "minecraft:attribute_modifiers",
    detail: Messages.src.config.item.dataComponents.text0003,
    kind: "list",
  },
  {
    id: "minecraft:axolotl/variant",
    detail: Messages.src.config.item.dataComponents.text0004,
    kind: "scalar",
  },
  {
    id: "minecraft:banner_patterns",
    detail: Messages.src.config.item.dataComponents.text0005,
    kind: "list",
  },
  {
    id: "minecraft:base_color",
    detail: Messages.src.config.item.dataComponents.text0006,
    kind: "scalar",
  },
  {
    id: "minecraft:bees",
    detail: Messages.src.config.item.dataComponents.text0007,
    kind: "list",
  },
  {
    id: "minecraft:block_entity_data",
    detail: Messages.src.config.item.dataComponents.text0008,
    kind: "opaque",
  },
  {
    id: "minecraft:block_state",
    detail: Messages.src.config.item.dataComponents.text0009,
    kind: "mapping",
  },
  {
    id: "minecraft:blocks_attacks",
    detail: Messages.src.config.item.dataComponents.text0010,
    kind: "mapping",
  },
  {
    id: "minecraft:break_sound",
    detail: Messages.src.config.item.dataComponents.text0011,
    kind: "scalar",
  },
  {
    id: "minecraft:bucket_entity_data",
    detail: Messages.src.config.item.dataComponents.text0012,
    kind: "opaque",
  },
  {
    id: "minecraft:bundle_contents",
    detail: Messages.src.config.item.dataComponents.text0013,
    kind: "list",
  },
  {
    id: "minecraft:can_break",
    detail: Messages.src.config.item.dataComponents.text0014,
    kind: "list",
  },
  {
    id: "minecraft:can_place_on",
    detail: Messages.src.config.item.dataComponents.text0015,
    kind: "list",
  },
  {
    id: "minecraft:cat/collar",
    detail: Messages.src.config.item.dataComponents.text0016,
    kind: "scalar",
  },
  {
    id: "minecraft:cat/sound_variant",
    detail: Messages.src.config.item.dataComponents.text0017,
    kind: "scalar",
  },
  {
    id: "minecraft:cat/variant",
    detail: Messages.src.config.item.dataComponents.text0018,
    kind: "scalar",
  },
  {
    id: "minecraft:charged_projectiles",
    detail: Messages.src.config.item.dataComponents.text0019,
    kind: "list",
  },
  {
    id: "minecraft:chicken/sound_variant",
    detail: Messages.src.config.item.dataComponents.text0020,
    kind: "scalar",
  },
  {
    id: "minecraft:chicken/variant",
    detail: Messages.src.config.item.dataComponents.text0021,
    kind: "scalar",
  },
  {
    id: "minecraft:consumable",
    detail: Messages.src.config.item.dataComponents.text0022,
    kind: "mapping",
  },
  {
    id: "minecraft:container",
    detail: Messages.src.config.item.dataComponents.text0023,
    kind: "list",
  },
  {
    id: "minecraft:container_loot",
    detail: Messages.src.config.item.dataComponents.text0024,
    kind: "mapping",
  },
  {
    id: "minecraft:cow/sound_variant",
    detail: Messages.src.config.item.dataComponents.text0025,
    kind: "scalar",
  },
  {
    id: "minecraft:cow/variant",
    detail: Messages.src.config.item.dataComponents.text0026,
    kind: "scalar",
  },
  {
    id: "minecraft:creative_slot_lock",
    detail: Messages.src.config.item.dataComponents.text0027,
    kind: "unit",
  },
  {
    id: "minecraft:custom_data",
    detail: Messages.src.config.item.dataComponents.text0028,
    kind: "opaque",
  },
  {
    id: "minecraft:custom_model_data",
    detail: Messages.src.config.item.dataComponents.text0029,
    kind: "mapping",
  },
  {
    id: "minecraft:custom_name",
    detail: Messages.src.config.item.dataComponents.text0030,
    kind: "opaque",
  },
  {
    id: "minecraft:damage",
    detail: Messages.src.config.item.dataComponents.text0031,
    kind: "scalar",
  },
  {
    id: "minecraft:damage_resistant",
    detail: Messages.src.config.item.dataComponents.text0032,
    kind: "mapping",
  },
  {
    id: "minecraft:damage_type",
    detail: Messages.src.config.item.dataComponents.text0033,
    kind: "scalar",
  },
  {
    id: "minecraft:death_protection",
    detail: Messages.src.config.item.dataComponents.text0034,
    kind: "mapping",
  },
  {
    id: "minecraft:debug_stick_state",
    detail: Messages.src.config.item.dataComponents.text0035,
    kind: "mapping",
  },
  {
    id: "minecraft:dye",
    detail: Messages.src.config.item.dataComponents.text0036,
    kind: "scalar",
  },
  {
    id: "minecraft:dyed_color",
    detail: Messages.src.config.item.dataComponents.text0037,
    kind: "scalar",
  },
  {
    id: "minecraft:enchantable",
    detail: Messages.src.config.item.dataComponents.text0038,
    kind: "mapping",
  },
  {
    id: "minecraft:enchantment_glint_override",
    detail: Messages.src.config.item.dataComponents.text0039,
    kind: "scalar",
  },
  {
    id: "minecraft:enchantments",
    detail: Messages.src.config.item.dataComponents.text0040,
    kind: "mapping",
  },
  {
    id: "minecraft:entity_data",
    detail: Messages.src.config.item.dataComponents.text0041,
    kind: "opaque",
  },
  {
    id: "minecraft:equippable",
    detail: Messages.src.config.item.dataComponents.text0042,
    kind: "mapping",
  },
  {
    id: "minecraft:firework_explosion",
    detail: Messages.src.config.item.dataComponents.text0043,
    kind: "mapping",
  },
  {
    id: "minecraft:fireworks",
    detail: Messages.src.config.item.dataComponents.text0044,
    kind: "mapping",
  },
  {
    id: "minecraft:food",
    detail: Messages.src.config.item.dataComponents.text0045,
    kind: "mapping",
  },
  {
    id: "minecraft:fox/variant",
    detail: Messages.src.config.item.dataComponents.text0046,
    kind: "scalar",
  },
  {
    id: "minecraft:frog/variant",
    detail: Messages.src.config.item.dataComponents.text0047,
    kind: "scalar",
  },
  {
    id: "minecraft:glider",
    detail: Messages.src.config.item.dataComponents.text0048,
    kind: "unit",
  },
  {
    id: "minecraft:horse/variant",
    detail: Messages.src.config.item.dataComponents.text0049,
    kind: "scalar",
  },
  {
    id: "minecraft:instrument",
    detail: Messages.src.config.item.dataComponents.text0050,
    kind: "scalar",
  },
  {
    id: "minecraft:intangible_projectile",
    detail: Messages.src.config.item.dataComponents.text0051,
    kind: "unit",
  },
  {
    id: "minecraft:item_model",
    detail: Messages.src.config.item.dataComponents.text0052,
    kind: "scalar",
  },
  {
    id: "minecraft:item_name",
    detail: Messages.src.config.item.dataComponents.text0053,
    kind: "opaque",
  },
  {
    id: "minecraft:jukebox_playable",
    detail: Messages.src.config.item.dataComponents.text0054,
    kind: "scalar",
  },
  {
    id: "minecraft:kinetic_weapon",
    detail: Messages.src.config.item.dataComponents.text0055,
    kind: "mapping",
  },
  {
    id: "minecraft:llama/variant",
    detail: Messages.src.config.item.dataComponents.text0056,
    kind: "scalar",
  },
  {
    id: "minecraft:lock",
    detail: Messages.src.config.item.dataComponents.text0057,
    kind: "mapping",
  },
  {
    id: "minecraft:lodestone_tracker",
    detail: Messages.src.config.item.dataComponents.text0058,
    kind: "mapping",
  },
  {
    id: "minecraft:lore",
    detail: Messages.src.config.item.dataComponents.text0059,
    kind: "list",
  },
  {
    id: "minecraft:map_color",
    detail: Messages.src.config.item.dataComponents.text0060,
    kind: "scalar",
  },
  {
    id: "minecraft:map_decorations",
    detail: Messages.src.config.item.dataComponents.text0061,
    kind: "mapping",
  },
  {
    id: "minecraft:map_id",
    detail: Messages.src.config.item.dataComponents.text0062,
    kind: "scalar",
  },
  {
    id: "minecraft:map_post_processing",
    detail: Messages.src.config.item.dataComponents.text0063,
    kind: "scalar",
  },
  {
    id: "minecraft:max_damage",
    detail: Messages.src.config.item.dataComponents.text0064,
    kind: "scalar",
  },
  {
    id: "minecraft:max_stack_size",
    detail: Messages.src.config.item.dataComponents.text0065,
    kind: "scalar",
  },
  {
    id: "minecraft:minimum_attack_charge",
    detail: Messages.src.config.item.dataComponents.text0066,
    kind: "scalar",
  },
  {
    id: "minecraft:mooshroom/variant",
    detail: Messages.src.config.item.dataComponents.text0067,
    kind: "scalar",
  },
  {
    id: "minecraft:note_block_sound",
    detail: Messages.src.config.item.dataComponents.text0068,
    kind: "scalar",
  },
  {
    id: "minecraft:ominous_bottle_amplifier",
    detail: Messages.src.config.item.dataComponents.text0069,
    kind: "scalar",
  },
  {
    id: "minecraft:painting/variant",
    detail: Messages.src.config.item.dataComponents.text0070,
    kind: "scalar",
  },
  {
    id: "minecraft:parrot/variant",
    detail: Messages.src.config.item.dataComponents.text0071,
    kind: "scalar",
  },
  {
    id: "minecraft:piercing_weapon",
    detail: Messages.src.config.item.dataComponents.text0072,
    kind: "mapping",
  },
  {
    id: "minecraft:pig/sound_variant",
    detail: Messages.src.config.item.dataComponents.text0073,
    kind: "scalar",
  },
  {
    id: "minecraft:pig/variant",
    detail: Messages.src.config.item.dataComponents.text0074,
    kind: "scalar",
  },
  {
    id: "minecraft:pot_decorations",
    detail: Messages.src.config.item.dataComponents.text0075,
    kind: "list",
  },
  {
    id: "minecraft:potion_contents",
    detail: Messages.src.config.item.dataComponents.text0076,
    kind: "mapping",
  },
  {
    id: "minecraft:potion_duration_scale",
    detail: Messages.src.config.item.dataComponents.text0077,
    kind: "scalar",
  },
  {
    id: "minecraft:profile",
    detail: Messages.src.config.item.dataComponents.text0078,
    kind: "mapping",
  },
  {
    id: "minecraft:provides_banner_patterns",
    detail: Messages.src.config.item.dataComponents.text0079,
    kind: "scalar",
  },
  {
    id: "minecraft:provides_trim_material",
    detail: Messages.src.config.item.dataComponents.text0080,
    kind: "scalar",
  },
  {
    id: "minecraft:rabbit/variant",
    detail: Messages.src.config.item.dataComponents.text0081,
    kind: "scalar",
  },
  {
    id: "minecraft:rarity",
    detail: Messages.src.config.item.dataComponents.text0082,
    kind: "scalar",
  },
  {
    id: "minecraft:recipes",
    detail: Messages.src.config.item.dataComponents.text0083,
    kind: "list",
  },
  {
    id: "minecraft:repair_cost",
    detail: Messages.src.config.item.dataComponents.text0084,
    kind: "scalar",
  },
  {
    id: "minecraft:repairable",
    detail: Messages.src.config.item.dataComponents.text0085,
    kind: "mapping",
  },
  {
    id: "minecraft:salmon/size",
    detail: Messages.src.config.item.dataComponents.text0086,
    kind: "scalar",
  },
  {
    id: "minecraft:sheep/color",
    detail: Messages.src.config.item.dataComponents.text0087,
    kind: "scalar",
  },
  {
    id: "minecraft:shulker/color",
    detail: Messages.src.config.item.dataComponents.text0088,
    kind: "scalar",
  },
  {
    id: "minecraft:stored_enchantments",
    detail: Messages.src.config.item.dataComponents.text0089,
    kind: "mapping",
  },
  {
    id: "minecraft:sulfur_cube_content",
    detail: Messages.src.config.item.dataComponents.text0090,
    kind: "mapping",
  },
  {
    id: "minecraft:suspicious_stew_effects",
    detail: Messages.src.config.item.dataComponents.text0091,
    kind: "list",
  },
  {
    id: "minecraft:swing_animation",
    detail: Messages.src.config.item.dataComponents.text0092,
    kind: "mapping",
  },
  {
    id: "minecraft:tool",
    detail: Messages.src.config.item.dataComponents.text0093,
    kind: "mapping",
  },
  {
    id: "minecraft:tooltip_display",
    detail: Messages.src.config.item.dataComponents.text0094,
    kind: "mapping",
  },
  {
    id: "minecraft:tooltip_style",
    detail: Messages.src.config.item.dataComponents.text0095,
    kind: "scalar",
  },
  {
    id: "minecraft:trim",
    detail: Messages.src.config.item.dataComponents.text0096,
    kind: "mapping",
  },
  {
    id: "minecraft:tropical_fish/base_color",
    detail: Messages.src.config.item.dataComponents.text0097,
    kind: "scalar",
  },
  {
    id: "minecraft:tropical_fish/pattern",
    detail: Messages.src.config.item.dataComponents.text0098,
    kind: "scalar",
  },
  {
    id: "minecraft:tropical_fish/pattern_color",
    detail: Messages.src.config.item.dataComponents.text0099,
    kind: "scalar",
  },
  {
    id: "minecraft:unbreakable",
    detail: Messages.src.config.item.dataComponents.text0100,
    kind: "unit",
  },
  {
    id: "minecraft:use_cooldown",
    detail: Messages.src.config.item.dataComponents.text0101,
    kind: "mapping",
  },
  {
    id: "minecraft:use_effects",
    detail: Messages.src.config.item.dataComponents.text0102,
    kind: "mapping",
  },
  {
    id: "minecraft:use_remainder",
    detail: Messages.src.config.item.dataComponents.text0103,
    kind: "mapping",
  },
  {
    id: "minecraft:villager/variant",
    detail: Messages.src.config.item.dataComponents.text0104,
    kind: "scalar",
  },
  {
    id: "minecraft:weapon",
    detail: Messages.src.config.item.dataComponents.text0105,
    kind: "mapping",
  },
  {
    id: "minecraft:wolf/collar",
    detail: Messages.src.config.item.dataComponents.text0106,
    kind: "scalar",
  },
  {
    id: "minecraft:wolf/sound_variant",
    detail: Messages.src.config.item.dataComponents.text0107,
    kind: "scalar",
  },
  {
    id: "minecraft:wolf/variant",
    detail: Messages.src.config.item.dataComponents.text0108,
    kind: "scalar",
  },
  {
    id: "minecraft:writable_book_content",
    detail: Messages.src.config.item.dataComponents.text0109,
    kind: "mapping",
  },
  {
    id: "minecraft:written_book_content",
    detail: Messages.src.config.item.dataComponents.text0110,
    kind: "mapping",
  },
  {
    id: "minecraft:zombie_nautilus/variant",
    detail: Messages.src.config.item.dataComponents.text0111,
    kind: "scalar",
  },
];

const DEFINITIONS_BY_ID = new Map(
  DATA_COMPONENT_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function dataComponentDefinition(
  id: string,
): DataComponentDefinition | undefined {
  return DEFINITIONS_BY_ID.get(id);
}

interface IntegerRange {
  readonly min: number;
  readonly max?: number;
}

const INTEGER_RANGES = new Map<string, IntegerRange>([
  ["minecraft:max_stack_size", { min: 1, max: 99 }],
]);

const SCALAR_ENUMS = new Map<string, readonly string[]>([
  ["minecraft:rarity", ["common", "uncommon", "rare", "epic"]],
]);

interface ComponentConstraint {
  readonly path: readonly string[];
  readonly required?: boolean;
  readonly accepts: (value: unknown) => boolean;
  readonly message: string;
}

const numberInRange =
  (min?: number, max?: number, integer = false, minExclusive = false) =>
  (value: unknown): boolean =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!integer || Number.isInteger(value)) &&
    (min === undefined || (minExclusive ? value > min : value >= min)) &&
    (max === undefined || value <= max);
const booleanValue = (value: unknown): boolean => typeof value === "boolean";
const enumValue =
  (values: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === "string" && values.includes(value);
const listValue = (value: unknown): boolean => isUnknownArray(value);

const CONSUME_ANIMATIONS = [
  "none",
  "eat",
  "drink",
  "block",
  "bow",
  "trident",
  "crossbow",
  "spyglass",
  "toot_horn",
  "brush",
  "bundle",
  "spear",
] as const;

const COMPONENT_CONSTRAINTS = new Map<string, readonly ComponentConstraint[]>([
  [
    "minecraft:attack_range",
    [
      {
        path: ["min_reach"],
        accepts: numberInRange(0, 64),
        message: Messages.src.config.item.dataComponents.text0112,
      },
      {
        path: ["max_reach"],
        accepts: numberInRange(0, 64),
        message: Messages.src.config.item.dataComponents.text0113,
      },
      {
        path: ["min_creative_reach"],
        accepts: numberInRange(0, 64),
        message: Messages.src.config.item.dataComponents.text0114,
      },
      {
        path: ["max_creative_reach"],
        accepts: numberInRange(0, 64),
        message: Messages.src.config.item.dataComponents.text0115,
      },
      {
        path: ["hitbox_margin"],
        accepts: numberInRange(0, 1),
        message: Messages.src.config.item.dataComponents.text0116,
      },
      {
        path: ["mob_factor"],
        accepts: numberInRange(0, 2),
        message: Messages.src.config.item.dataComponents.text0117,
      },
    ],
  ],
  [
    "minecraft:max_damage",
    [
      {
        path: [],
        accepts: numberInRange(0, undefined, true, true),
        message: Messages.src.config.item.dataComponents.text0118,
      },
    ],
  ],
  [
    "minecraft:damage",
    [
      {
        path: [],
        accepts: numberInRange(0, undefined, true),
        message: Messages.src.config.item.dataComponents.text0119,
      },
    ],
  ],
  [
    "minecraft:minimum_attack_charge",
    [
      {
        path: [],
        accepts: numberInRange(0, 1),
        message: Messages.src.config.item.dataComponents.text0120,
      },
    ],
  ],
  [
    "minecraft:potion_duration_scale",
    [
      {
        path: [],
        accepts: numberInRange(0),
        message: Messages.src.config.item.dataComponents.text0121,
      },
    ],
  ],
  [
    "minecraft:use_cooldown",
    [
      {
        path: ["seconds"],
        required: true,
        accepts: numberInRange(0, undefined, false, true),
        message: Messages.src.config.item.dataComponents.text0122,
      },
    ],
  ],
  [
    "minecraft:use_effects",
    [
      {
        path: ["can_sprint"],
        accepts: booleanValue,
        message: Messages.src.config.item.dataComponents.text0123,
      },
      {
        path: ["interact_vibrations"],
        accepts: booleanValue,
        message: Messages.src.config.item.dataComponents.text0124,
      },
      {
        path: ["speed_multiplier"],
        accepts: numberInRange(0, 1),
        message: Messages.src.config.item.dataComponents.text0125,
      },
    ],
  ],
  [
    "minecraft:swing_animation",
    [
      {
        path: ["type"],
        accepts: enumValue(["none", "whack", "stab"]),
        message: Messages.src.config.item.dataComponents.text0126,
      },
      {
        path: ["duration"],
        accepts: numberInRange(0, undefined, true, true),
        message: Messages.src.config.item.dataComponents.text0127,
      },
    ],
  ],
  [
    "minecraft:consumable",
    [
      {
        path: ["consume_seconds"],
        accepts: numberInRange(0),
        message: Messages.src.config.item.dataComponents.text0128,
      },
      {
        path: ["animation"],
        accepts: enumValue(CONSUME_ANIMATIONS),
        message: Messages.src.config.item.dataComponents.text0129(
          CONSUME_ANIMATIONS.join("、"),
        ),
      },
      {
        path: ["has_consume_particles"],
        accepts: booleanValue,
        message: Messages.src.config.item.dataComponents.text0130,
      },
      {
        path: ["on_consume_effects"],
        accepts: listValue,
        message: Messages.src.config.item.dataComponents.text0131,
      },
    ],
  ],
  [
    "minecraft:tool",
    [
      {
        path: ["rules"],
        required: true,
        accepts: listValue,
        message: Messages.src.config.item.dataComponents.text0132,
      },
      {
        path: ["default_mining_speed"],
        accepts: numberInRange(),
        message: Messages.src.config.item.dataComponents.text0133,
      },
      {
        path: ["damage_per_block"],
        accepts: numberInRange(0, undefined, true),
        message: Messages.src.config.item.dataComponents.text0134,
      },
      {
        path: ["can_destroy_blocks_in_creative"],
        accepts: booleanValue,
        message: Messages.src.config.item.dataComponents.text0135,
      },
    ],
  ],
  [
    "minecraft:enchantable",
    [
      {
        path: ["value"],
        required: true,
        accepts: numberInRange(0, undefined, true, true),
        message: Messages.src.config.item.dataComponents.text0136,
      },
    ],
  ],
  [
    "minecraft:weapon",
    [
      {
        path: ["item_damage_per_attack"],
        accepts: numberInRange(0, undefined, true),
        message: Messages.src.config.item.dataComponents.text0137,
      },
      {
        path: ["disable_blocking_for_seconds"],
        accepts: numberInRange(0),
        message: Messages.src.config.item.dataComponents.text0138,
      },
    ],
  ],
]);

function validateAuditedConstraints(
  componentId: string,
  value: unknown,
): readonly DataComponentValidationIssue[] {
  const constraints = COMPONENT_CONSTRAINTS.get(componentId);
  if (!constraints) return [];
  const record =
    typeof value === "object" && value !== null && !isUnknownArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : undefined;
  const issues: DataComponentValidationIssue[] = [];
  for (const constraint of constraints) {
    const present =
      constraint.path.length === 0 ||
      (record !== undefined && Object.hasOwn(record, constraint.path[0] ?? ""));
    if (!present) {
      if (constraint.required) {
        issues.push({
          path: [],
          message: Messages.src.config.item.dataComponents.text0139(
            componentId,
            constraint.path.join("."),
          ),
          at: "key",
        });
      }
      continue;
    }
    const fieldValue =
      constraint.path.length === 0 ? value : record?.[constraint.path[0] ?? ""];
    if (!constraint.accepts(fieldValue)) {
      issues.push({ path: constraint.path, message: constraint.message });
    }
  }
  return issues;
}

export function validateDataComponentValue(
  componentId: string,
  value: unknown,
): readonly DataComponentValidationIssue[] {
  // 动态编码里的占位符要先替换, 再让 Minecraft 读取结果
  if (typeof value === "string" && /^\((?:json|snbt)\) /u.test(value))
    return [];
  const definition = DEFINITIONS_BY_ID.get(componentId);
  const mappingValue =
    typeof value === "object" && value !== null && !isUnknownArray(value);
  if (definition?.kind === "mapping" && !mappingValue) {
    return [
      {
        path: [],
        message: Messages.src.config.item.dataComponents.text0140(componentId),
      },
    ];
  }
  if (definition?.kind === "list" && !isUnknownArray(value)) {
    return [
      {
        path: [],
        message: Messages.src.config.item.dataComponents.text0141(componentId),
      },
    ];
  }
  if (
    definition?.kind === "unit" &&
    (!mappingValue || Object.keys(value).length !== 0)
  ) {
    return [
      {
        path: [],
        message: Messages.src.config.item.dataComponents.text0142(componentId),
      },
    ];
  }
  if (
    componentId === "minecraft:pot_decorations" &&
    isUnknownArray(value) &&
    value.length > 4
  ) {
    return [
      { path: [], message: Messages.src.config.item.dataComponents.text0143 },
    ];
  }
  if (componentId === "minecraft:container" && isUnknownArray(value)) {
    const issues: DataComponentValidationIssue[] = [];
    if (value.length > 256) {
      issues.push({
        path: [],
        message: Messages.src.config.item.dataComponents.text0144,
      });
    }
    value.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null || isUnknownArray(entry))
        return;
      const slot = entry as Readonly<Record<string, unknown>>;
      if (!numberInRange(0, 255, true)(slot.slot)) {
        issues.push({
          path: [String(index), "slot"],
          message: Messages.src.config.item.dataComponents.text0145(index),
        });
      }
      if (!Object.hasOwn(slot, "item")) {
        issues.push({
          path: [String(index)],
          message: Messages.src.config.item.dataComponents.text0146(index),
          at: "key",
        });
      }
    });
    return issues;
  }
  const integerRange = INTEGER_RANGES.get(componentId);
  if (
    integerRange &&
    (!Number.isInteger(value) ||
      (value as number) < integerRange.min ||
      (integerRange.max !== undefined && (value as number) > integerRange.max))
  ) {
    const range =
      integerRange.max === undefined
        ? Messages.src.config.item.dataComponents.text0147(integerRange.min)
        : `${integerRange.min}..${integerRange.max}`;
    return [
      {
        path: [],
        message: Messages.src.config.item.dataComponents.text0148(
          componentId,
          range,
        ),
      },
    ];
  }
  const enumValues = SCALAR_ENUMS.get(componentId);
  if (
    enumValues &&
    (typeof value !== "string" || !enumValues.includes(value))
  ) {
    return [
      {
        path: [],
        message: Messages.src.config.item.dataComponents.text0149(
          componentId,
          enumValues.join("、"),
        ),
      },
    ];
  }
  const scalarIssue = validateCatalogedScalarValue(componentId, value);
  if (scalarIssue) return [scalarIssue];
  const auditedIssues = validateAuditedConstraints(componentId, value);
  if (auditedIssues.length > 0 || COMPONENT_CONSTRAINTS.has(componentId))
    return auditedIssues;
  if (componentId === "minecraft:fireworks" && mappingValue) {
    const fireworks = value as Readonly<Record<string, unknown>>;
    const issues: DataComponentValidationIssue[] = [];
    if (
      fireworks.flight_duration !== undefined &&
      (!Number.isInteger(fireworks.flight_duration) ||
        (fireworks.flight_duration as number) < 0 ||
        (fireworks.flight_duration as number) > 255)
    ) {
      issues.push({
        path: ["flight_duration"],
        message: Messages.src.config.item.dataComponents.text0150,
      });
    }
    if (
      isUnknownArray(fireworks.explosions) &&
      fireworks.explosions.length > 256
    ) {
      issues.push({
        path: ["explosions"],
        message: Messages.src.config.item.dataComponents.text0151,
      });
    }
    return issues;
  }
  if (componentId !== "minecraft:food" || !mappingValue) return [];
  const food = value as Readonly<Record<string, unknown>>;
  const issues: DataComponentValidationIssue[] = [];
  for (const required of ["nutrition", "saturation"]) {
    if (!Object.hasOwn(food, required)) {
      issues.push({
        path: [],
        message: Messages.src.config.item.dataComponents.text0152(required),
        at: "key",
      });
    }
  }
  if (
    food.nutrition !== undefined &&
    (!Number.isInteger(food.nutrition) || (food.nutrition as number) < 0)
  ) {
    issues.push({
      path: ["nutrition"],
      message: Messages.src.config.item.dataComponents.text0153,
    });
  }
  if (food.saturation !== undefined && typeof food.saturation !== "number") {
    issues.push({
      path: ["saturation"],
      message: Messages.src.config.item.dataComponents.text0154,
    });
  }
  if (
    food.can_always_eat !== undefined &&
    typeof food.can_always_eat !== "boolean"
  ) {
    issues.push({
      path: ["can_always_eat"],
      message: Messages.src.config.item.dataComponents.text0155,
    });
  }
  return issues;
}

export interface DataComponentPathContext {
  readonly containerIndex: number;
  readonly componentId?: string;
  readonly payloadPath: readonly string[];
}

function componentContainerSegment(entry: string): boolean {
  const unsuffixed = entry.split("#", 1)[0]?.replaceAll("-", "_") ?? entry;
  const separator = unsuffixed.indexOf(":");
  const local =
    separator < 0
      ? unsuffixed
      : unsuffixed.slice(0, separator) === "craftengine"
        ? unsuffixed.slice(separator + 1)
        : undefined;
  return local === "components" || local === "component";
}

function canonicalComponentId(value: string | undefined): string | undefined {
  if (value === undefined || DEFINITIONS_BY_ID.has(value)) return value;
  if (!value.includes(":") && DEFINITIONS_BY_ID.has(`minecraft:${value}`))
    return `minecraft:${value}`;
  return value;
}

export function dataComponentPathContext(
  path: readonly string[],
): DataComponentPathContext | undefined {
  const markers = path.flatMap((entry, index) =>
    componentContainerSegment(entry) ? [index] : [],
  );
  const first = markers[0];
  if (first === undefined) return undefined;
  const outerId = canonicalComponentId(path[first + 1]);
  const outerKnown = outerId !== undefined && DEFINITIONS_BY_ID.has(outerId);
  const selected =
    outerKnown && markers.length > 1 ? (markers.at(-1) ?? first) : first;
  const componentId = canonicalComponentId(path[selected + 1]);
  return {
    containerIndex: selected,
    ...(componentId === undefined ? {} : { componentId }),
    payloadPath: componentId === undefined ? [] : path.slice(selected + 2),
  };
}

interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly registry?: string;
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
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  };
}

const mapping = (label: string, detail: string): SchemaField =>
  field(label, detail, { snippet: `${label}:\n  \${0}` });
const list = (label: string, detail: string): SchemaField =>
  field(label, detail, { snippet: `${label}:\n  - \${0}` });
const number = (label: string, detail: string): SchemaField =>
  field(label, detail, { valueProvider: "number" });
const bool = (label: string, detail: string): SchemaField =>
  field(label, detail, {
    valueProvider: "boolean",
    values: ["true", "false"],
  });
const registry = (
  label: string,
  detail: string,
  registryId: string,
): SchemaField =>
  field(label, detail, {
    valueProvider: "registry",
    registry: registryId,
  });

const ITEM_STACK_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.item.dataComponents.text0156, {
    valueProvider: "item-id",
  }),
  number("count", Messages.src.config.item.dataComponents.text0157),
  mapping("components", Messages.src.config.item.dataComponents.text0158),
];
const EFFECT_INSTANCE_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.item.dataComponents.text0159, {
    valueProvider: "effect",
  }),
  number("amplifier", Messages.src.config.item.dataComponents.text0160),
  number("duration", Messages.src.config.item.dataComponents.text0161),
  bool("ambient", Messages.src.config.item.dataComponents.text0162),
  bool("show_particles", Messages.src.config.item.dataComponents.text0163),
  bool("show_icon", Messages.src.config.item.dataComponents.text0164),
  mapping("hidden_effect", Messages.src.config.item.dataComponents.text0165),
];
const FIREWORK_EXPLOSION_FIELDS: readonly SchemaField[] = [
  field("shape", Messages.src.config.item.dataComponents.text0166, {
    values: ["small_ball", "large_ball", "star", "creeper", "burst"],
  }),
  list("colors", Messages.src.config.item.dataComponents.text0167),
  list("fade_colors", Messages.src.config.item.dataComponents.text0168),
  bool("has_trail", Messages.src.config.item.dataComponents.text0169),
  bool("has_twinkle", Messages.src.config.item.dataComponents.text0170),
];
const FILTERABLE_TEXT_FIELDS: readonly SchemaField[] = [
  field("raw", Messages.src.config.item.dataComponents.text0171),
  field("filtered", Messages.src.config.item.dataComponents.text0172),
];

const DYE_COLORS = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black",
] as const;

const SCALAR_VALUE_FIELDS = new Map<string, SchemaField>([
  [
    "minecraft:additional_trade_cost",
    number(
      "minecraft:additional_trade_cost",
      Messages.src.config.item.dataComponents.text0173,
    ),
  ],
  [
    "minecraft:axolotl/variant",
    field(
      "minecraft:axolotl/variant",
      Messages.src.config.item.dataComponents.text0174,
      { values: ["lucy", "wild", "gold", "cyan", "blue"] },
    ),
  ],
  [
    "minecraft:base_color",
    field(
      "minecraft:base_color",
      Messages.src.config.item.dataComponents.text0175,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:break_sound",
    field(
      "minecraft:break_sound",
      Messages.src.config.item.dataComponents.text0176,
      { valueProvider: "sound" },
    ),
  ],
  [
    "minecraft:cat/collar",
    field(
      "minecraft:cat/collar",
      Messages.src.config.item.dataComponents.text0177,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:cat/sound_variant",
    registry(
      "minecraft:cat/sound_variant",
      Messages.src.config.item.dataComponents.text0178,
      "minecraft:cat_sound_variant",
    ),
  ],
  [
    "minecraft:cat/variant",
    registry(
      "minecraft:cat/variant",
      Messages.src.config.item.dataComponents.text0179,
      "minecraft:cat_variant",
    ),
  ],
  [
    "minecraft:chicken/sound_variant",
    registry(
      "minecraft:chicken/sound_variant",
      Messages.src.config.item.dataComponents.text0180,
      "minecraft:chicken_sound_variant",
    ),
  ],
  [
    "minecraft:chicken/variant",
    registry(
      "minecraft:chicken/variant",
      Messages.src.config.item.dataComponents.text0181,
      "minecraft:chicken_variant",
    ),
  ],
  [
    "minecraft:cow/sound_variant",
    registry(
      "minecraft:cow/sound_variant",
      Messages.src.config.item.dataComponents.text0182,
      "minecraft:cow_sound_variant",
    ),
  ],
  [
    "minecraft:cow/variant",
    registry(
      "minecraft:cow/variant",
      Messages.src.config.item.dataComponents.text0183,
      "minecraft:cow_variant",
    ),
  ],
  [
    "minecraft:damage",
    number(
      "minecraft:damage",
      Messages.src.config.item.dataComponents.text0184,
    ),
  ],
  [
    "minecraft:damage_type",
    field(
      "minecraft:damage_type",
      Messages.src.config.item.dataComponents.text0185,
      { valueProvider: "damage-type" },
    ),
  ],
  [
    "minecraft:dye",
    field("minecraft:dye", Messages.src.config.item.dataComponents.text0186, {
      values: DYE_COLORS,
    }),
  ],
  [
    "minecraft:dyed_color",
    number(
      "minecraft:dyed_color",
      Messages.src.config.item.dataComponents.text0187,
    ),
  ],
  [
    "minecraft:enchantment_glint_override",
    bool(
      "minecraft:enchantment_glint_override",
      Messages.src.config.item.dataComponents.text0188,
    ),
  ],
  [
    "minecraft:fox/variant",
    field(
      "minecraft:fox/variant",
      Messages.src.config.item.dataComponents.text0189,
      { values: ["red", "snow"] },
    ),
  ],
  [
    "minecraft:frog/variant",
    registry(
      "minecraft:frog/variant",
      Messages.src.config.item.dataComponents.text0190,
      "minecraft:frog_variant",
    ),
  ],
  [
    "minecraft:horse/variant",
    field(
      "minecraft:horse/variant",
      Messages.src.config.item.dataComponents.text0191,
      {
        values: [
          "white",
          "creamy",
          "chestnut",
          "brown",
          "black",
          "gray",
          "dark_brown",
        ],
      },
    ),
  ],
  [
    "minecraft:instrument",
    registry(
      "minecraft:instrument",
      Messages.src.config.item.dataComponents.text0192,
      "minecraft:instrument",
    ),
  ],
  [
    "minecraft:item_model",
    field(
      "minecraft:item_model",
      Messages.src.config.item.dataComponents.text0193,
      { valueProvider: "item-model" },
    ),
  ],
  [
    "minecraft:jukebox_playable",
    registry(
      "minecraft:jukebox_playable",
      Messages.src.config.item.dataComponents.text0194,
      "minecraft:jukebox_song",
    ),
  ],
  [
    "minecraft:llama/variant",
    field(
      "minecraft:llama/variant",
      Messages.src.config.item.dataComponents.text0195,
      { values: ["creamy", "white", "brown", "gray"] },
    ),
  ],
  [
    "minecraft:map_color",
    number(
      "minecraft:map_color",
      Messages.src.config.item.dataComponents.text0196,
    ),
  ],
  [
    "minecraft:map_id",
    number(
      "minecraft:map_id",
      Messages.src.config.item.dataComponents.text0197,
    ),
  ],
  [
    "minecraft:map_post_processing",
    field(
      "minecraft:map_post_processing",
      Messages.src.config.item.dataComponents.text0198,
      { values: ["lock", "scale"] },
    ),
  ],
  [
    "minecraft:max_damage",
    number(
      "minecraft:max_damage",
      Messages.src.config.item.dataComponents.text0199,
    ),
  ],
  [
    "minecraft:max_stack_size",
    number(
      "minecraft:max_stack_size",
      Messages.src.config.item.dataComponents.text0200,
    ),
  ],
  [
    "minecraft:minimum_attack_charge",
    number(
      "minecraft:minimum_attack_charge",
      Messages.src.config.item.dataComponents.text0201,
    ),
  ],
  [
    "minecraft:mooshroom/variant",
    field(
      "minecraft:mooshroom/variant",
      Messages.src.config.item.dataComponents.text0202,
      { values: ["red", "brown"] },
    ),
  ],
  [
    "minecraft:note_block_sound",
    field(
      "minecraft:note_block_sound",
      Messages.src.config.item.dataComponents.text0203,
      { valueProvider: "sound" },
    ),
  ],
  [
    "minecraft:ominous_bottle_amplifier",
    number(
      "minecraft:ominous_bottle_amplifier",
      Messages.src.config.item.dataComponents.text0204,
    ),
  ],
  [
    "minecraft:painting/variant",
    registry(
      "minecraft:painting/variant",
      Messages.src.config.item.dataComponents.text0205,
      "minecraft:painting_variant",
    ),
  ],
  [
    "minecraft:parrot/variant",
    field(
      "minecraft:parrot/variant",
      Messages.src.config.item.dataComponents.text0206,
      { values: ["red_blue", "blue", "green", "yellow_blue", "gray"] },
    ),
  ],
  [
    "minecraft:pig/sound_variant",
    registry(
      "minecraft:pig/sound_variant",
      Messages.src.config.item.dataComponents.text0207,
      "minecraft:pig_sound_variant",
    ),
  ],
  [
    "minecraft:pig/variant",
    registry(
      "minecraft:pig/variant",
      Messages.src.config.item.dataComponents.text0208,
      "minecraft:pig_variant",
    ),
  ],
  [
    "minecraft:potion_duration_scale",
    number(
      "minecraft:potion_duration_scale",
      Messages.src.config.item.dataComponents.text0209,
    ),
  ],
  [
    "minecraft:provides_banner_patterns",
    registry(
      "minecraft:provides_banner_patterns",
      Messages.src.config.item.dataComponents.text0210,
      "minecraft:banner_pattern",
    ),
  ],
  [
    "minecraft:provides_trim_material",
    registry(
      "minecraft:provides_trim_material",
      Messages.src.config.item.dataComponents.text0211,
      "minecraft:trim_material",
    ),
  ],
  [
    "minecraft:rabbit/variant",
    field(
      "minecraft:rabbit/variant",
      Messages.src.config.item.dataComponents.text0212,
      {
        values: [
          "brown",
          "white",
          "black",
          "white_splotched",
          "gold",
          "salt",
          "evil",
        ],
      },
    ),
  ],
  [
    "minecraft:rarity",
    field(
      "minecraft:rarity",
      Messages.src.config.item.dataComponents.text0213,
      { values: ["common", "uncommon", "rare", "epic"] },
    ),
  ],
  [
    "minecraft:repair_cost",
    number(
      "minecraft:repair_cost",
      Messages.src.config.item.dataComponents.text0214,
    ),
  ],
  [
    "minecraft:salmon/size",
    field(
      "minecraft:salmon/size",
      Messages.src.config.item.dataComponents.text0215,
      { values: ["small", "medium", "large"] },
    ),
  ],
  [
    "minecraft:sheep/color",
    field(
      "minecraft:sheep/color",
      Messages.src.config.item.dataComponents.text0216,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:shulker/color",
    field(
      "minecraft:shulker/color",
      Messages.src.config.item.dataComponents.text0217,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:tooltip_style",
    field(
      "minecraft:tooltip_style",
      Messages.src.config.item.dataComponents.text0218,
      { valueProvider: "tooltip-style" },
    ),
  ],
  [
    "minecraft:tropical_fish/base_color",
    field(
      "minecraft:tropical_fish/base_color",
      Messages.src.config.item.dataComponents.text0219,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:tropical_fish/pattern",
    field(
      "minecraft:tropical_fish/pattern",
      Messages.src.config.item.dataComponents.text0220,
      {
        values: [
          "kob",
          "sunstreak",
          "snooper",
          "dasher",
          "brinely",
          "spotty",
          "flopper",
          "stripey",
          "glitter",
          "blockfish",
          "betty",
          "clayfish",
        ],
      },
    ),
  ],
  [
    "minecraft:tropical_fish/pattern_color",
    field(
      "minecraft:tropical_fish/pattern_color",
      Messages.src.config.item.dataComponents.text0221,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:villager/variant",
    registry(
      "minecraft:villager/variant",
      Messages.src.config.item.dataComponents.text0222,
      "minecraft:villager_type",
    ),
  ],
  [
    "minecraft:wolf/collar",
    field(
      "minecraft:wolf/collar",
      Messages.src.config.item.dataComponents.text0223,
      { values: DYE_COLORS },
    ),
  ],
  [
    "minecraft:wolf/sound_variant",
    registry(
      "minecraft:wolf/sound_variant",
      Messages.src.config.item.dataComponents.text0224,
      "minecraft:wolf_sound_variant",
    ),
  ],
  [
    "minecraft:wolf/variant",
    registry(
      "minecraft:wolf/variant",
      Messages.src.config.item.dataComponents.text0225,
      "minecraft:wolf_variant",
    ),
  ],
  [
    "minecraft:zombie_nautilus/variant",
    registry(
      "minecraft:zombie_nautilus/variant",
      Messages.src.config.item.dataComponents.text0226,
      "minecraft:zombie_nautilus_variant",
    ),
  ],
]);

function validateCatalogedScalarValue(
  componentId: string,
  value: unknown,
): DataComponentValidationIssue | undefined {
  const scalar = SCALAR_VALUE_FIELDS.get(componentId);
  if (!scalar) return undefined;
  if (scalar.valueProvider === "boolean" && typeof value !== "boolean") {
    return {
      path: [],
      message: Messages.src.config.item.dataComponents.text0227(componentId),
    };
  }
  if (
    scalar.valueProvider !== "boolean" &&
    scalar.values &&
    (typeof value !== "string" || !scalar.values.includes(value))
  ) {
    return {
      path: [],
      message: Messages.src.config.item.dataComponents.text0228(
        componentId,
        scalar.values.join("、"),
      ),
    };
  }
  if (
    scalar.valueProvider === "number" &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    return {
      path: [],
      message: Messages.src.config.item.dataComponents.text0229(componentId),
    };
  }
  if (
    scalar.valueProvider !== undefined &&
    scalar.valueProvider !== "boolean" &&
    scalar.valueProvider !== "number" &&
    typeof value !== "string"
  ) {
    return {
      path: [],
      message: Messages.src.config.item.dataComponents.text0230(componentId),
    };
  }
  return undefined;
}

export interface DataComponentDynamicEntry {
  readonly key: SchemaField;
  readonly value: SchemaField;
  readonly snippetForKey?: (key: string) => string;
  readonly valueForKey?: (key: string) => SchemaField;
}

const PARTIAL_COMPONENT_PREDICATES = [
  "minecraft:damage",
  "minecraft:enchantments",
  "minecraft:stored_enchantments",
  "minecraft:potion_contents",
  "minecraft:custom_data",
  "minecraft:container",
  "minecraft:bundle_contents",
  "minecraft:firework_explosion",
  "minecraft:fireworks",
  "minecraft:writable_book_content",
  "minecraft:written_book_content",
  "minecraft:attribute_modifiers",
  "minecraft:trim",
  "minecraft:jukebox_playable",
] as const;

const PARTIAL_COMPONENT_PREDICATE_DETAILS: Readonly<
  Record<(typeof PARTIAL_COMPONENT_PREDICATES)[number], string>
> = {
  "minecraft:damage": Messages.src.config.item.dataComponents.text0231,
  "minecraft:enchantments": Messages.src.config.item.dataComponents.text0232,
  "minecraft:stored_enchantments":
    Messages.src.config.item.dataComponents.text0233,
  "minecraft:potion_contents": Messages.src.config.item.dataComponents.text0234,
  "minecraft:custom_data": Messages.src.config.item.dataComponents.text0235,
  "minecraft:container": Messages.src.config.item.dataComponents.text0236,
  "minecraft:bundle_contents": Messages.src.config.item.dataComponents.text0237,
  "minecraft:firework_explosion":
    Messages.src.config.item.dataComponents.text0238,
  "minecraft:fireworks": Messages.src.config.item.dataComponents.text0239,
  "minecraft:writable_book_content":
    Messages.src.config.item.dataComponents.text0240,
  "minecraft:written_book_content":
    Messages.src.config.item.dataComponents.text0241,
  "minecraft:attribute_modifiers":
    Messages.src.config.item.dataComponents.text0242,
  "minecraft:trim": Messages.src.config.item.dataComponents.text0243,
  "minecraft:jukebox_playable":
    Messages.src.config.item.dataComponents.text0244,
};

const SCALAR_PARTIAL_COMPONENT_PREDICATES = new Set<string>([
  "minecraft:potion_contents",
  "minecraft:custom_data",
  "minecraft:jukebox_playable",
]);

function partialPredicateValueField(key: string): SchemaField {
  if (key === "minecraft:potion_contents")
    return registry(
      Messages.src.config.item.dataComponents.text0245,
      Messages.src.config.item.dataComponents.text0246,
      "minecraft:potion",
    );
  if (key === "minecraft:jukebox_playable")
    return registry(
      Messages.src.config.item.dataComponents.text0247,
      Messages.src.config.item.dataComponents.text0248,
      "minecraft:jukebox_song",
    );
  return field(
    Messages.src.config.item.dataComponents.text0249,
    PARTIAL_COMPONENT_PREDICATE_DETAILS[
      key as keyof typeof PARTIAL_COMPONENT_PREDICATE_DETAILS
    ] ?? Messages.src.config.item.dataComponents.text0250,
  );
}

export function dataComponentValueField(
  componentId: string,
): SchemaField | undefined {
  const definition = DEFINITIONS_BY_ID.get(componentId);
  if (
    !definition ||
    (definition.kind !== "scalar" && definition.kind !== "opaque")
  )
    return undefined;
  return (
    SCALAR_VALUE_FIELDS.get(componentId) ??
    field(componentId, definition.detail)
  );
}

export function dataComponentDynamicEntry(
  componentId: string,
  componentPath: readonly string[],
): DataComponentDynamicEntry | undefined {
  if (
    componentPath.length === 1 &&
    componentPath[0] === "predicates" &&
    (componentId === "minecraft:can_break" ||
      componentId === "minecraft:can_place_on" ||
      componentId === "minecraft:lock")
  ) {
    return {
      key: field(
        Messages.src.config.item.dataComponents.text0251,
        Messages.src.config.item.dataComponents.text0252,
        {
          values: PARTIAL_COMPONENT_PREDICATES,
          valueDetails: PARTIAL_COMPONENT_PREDICATE_DETAILS,
        },
      ),
      value: field(
        Messages.src.config.item.dataComponents.text0253,
        Messages.src.config.item.dataComponents.text0254,
      ),
      snippetForKey: (key) =>
        SCALAR_PARTIAL_COMPONENT_PREDICATES.has(key)
          ? `${key}: \${0}`
          : `${key}:\n  \${0}`,
      valueForKey: partialPredicateValueField,
    };
  }
  if (componentPath.length !== 0) return undefined;
  if (
    componentId === "minecraft:enchantments" ||
    componentId === "minecraft:stored_enchantments"
  ) {
    return {
      key: field(
        Messages.src.config.item.dataComponents.text0255,
        Messages.src.config.item.dataComponents.text0256,
        { valueProvider: "enchantment" },
      ),
      value: number(
        Messages.src.config.item.dataComponents.text0257,
        Messages.src.config.item.dataComponents.text0258,
      ),
    };
  }
  if (componentId === "minecraft:debug_stick_state") {
    return {
      key: registry(
        Messages.src.config.item.dataComponents.text0259,
        Messages.src.config.item.dataComponents.text0260,
        "minecraft:block",
      ),
      value: field(
        Messages.src.config.item.dataComponents.text0261,
        Messages.src.config.item.dataComponents.text0262,
      ),
    };
  }
  return undefined;
}

export function dataComponentListItemField(
  componentId: string,
  componentPath: readonly string[],
): SchemaField | undefined {
  const key = `${componentId}/${componentPath.join("/")}`;
  if (componentPath.length === 0) {
    if (componentId === "minecraft:pot_decorations")
      return field(
        Messages.src.config.item.dataComponents.text0263,
        Messages.src.config.item.dataComponents.text0264,
        { valueProvider: "item-id" },
      );
    if (componentId === "minecraft:recipes")
      return registry(
        Messages.src.config.item.dataComponents.text0265,
        Messages.src.config.item.dataComponents.text0266,
        "minecraft:recipe",
      );
  }
  if (key === "minecraft:tooltip_display/hidden_components")
    return field(
      Messages.src.config.item.dataComponents.text0267,
      Messages.src.config.item.dataComponents.text0268,
      { valueProvider: "component" },
    );
  if (key === "minecraft:equippable/allowed_entities")
    return field(
      Messages.src.config.item.dataComponents.text0269,
      Messages.src.config.item.dataComponents.text0270,
      { valueProvider: "entity-type" },
    );
  if (key === "minecraft:custom_model_data/floats")
    return number(
      Messages.src.config.item.dataComponents.text0271,
      Messages.src.config.item.dataComponents.text0272,
    );
  if (key === "minecraft:custom_model_data/flags")
    return bool(
      Messages.src.config.item.dataComponents.text0273,
      Messages.src.config.item.dataComponents.text0274,
    );
  if (key === "minecraft:custom_model_data/strings")
    return field(
      Messages.src.config.item.dataComponents.text0275,
      Messages.src.config.item.dataComponents.text0276,
    );
  if (
    key === "minecraft:custom_model_data/colors" ||
    key === "minecraft:firework_explosion/colors" ||
    key === "minecraft:firework_explosion/fade_colors" ||
    key === "minecraft:fireworks/explosions/colors" ||
    key === "minecraft:fireworks/explosions/fade_colors"
  )
    return number(
      Messages.src.config.item.dataComponents.text0277,
      Messages.src.config.item.dataComponents.text0278,
    );
  if (key === "minecraft:consumable/on_consume_effects/effects")
    return field(
      Messages.src.config.item.dataComponents.text0279,
      Messages.src.config.item.dataComponents.text0280,
      { valueProvider: "effect" },
    );
  return undefined;
}

const ROOT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:attack_range",
    [
      number("min_reach", Messages.src.config.item.dataComponents.text0281),
      number("max_reach", Messages.src.config.item.dataComponents.text0282),
      number(
        "min_creative_reach",
        Messages.src.config.item.dataComponents.text0283,
      ),
      number(
        "max_creative_reach",
        Messages.src.config.item.dataComponents.text0284,
      ),
      number("hitbox_margin", Messages.src.config.item.dataComponents.text0285),
      number("mob_factor", Messages.src.config.item.dataComponents.text0286),
    ],
  ],
  [
    "minecraft:attribute_modifiers",
    [
      field("type", Messages.src.config.item.dataComponents.text0287, {
        valueProvider: "attribute",
      }),
      field("id", Messages.src.config.item.dataComponents.text0288),
      number("amount", Messages.src.config.item.dataComponents.text0289),
      field("operation", Messages.src.config.item.dataComponents.text0290, {
        values: ["add_value", "add_multiplied_base", "add_multiplied_total"],
      }),
      field("slot", Messages.src.config.item.dataComponents.text0291, {
        values: [
          "any",
          "mainhand",
          "offhand",
          "hand",
          "feet",
          "legs",
          "chest",
          "head",
          "armor",
          "body",
          "saddle",
        ],
      }),
      mapping("display", Messages.src.config.item.dataComponents.text0292),
    ],
  ],
  [
    "minecraft:banner_patterns",
    [
      registry(
        "pattern",
        Messages.src.config.item.dataComponents.text0293,
        "minecraft:banner_pattern",
      ),
      field("color", Messages.src.config.item.dataComponents.text0294),
    ],
  ],
  [
    "minecraft:bees",
    [
      mapping("entity_data", Messages.src.config.item.dataComponents.text0295),
      number("ticks_in_hive", Messages.src.config.item.dataComponents.text0296),
      number(
        "min_ticks_in_hive",
        Messages.src.config.item.dataComponents.text0297,
      ),
    ],
  ],
  [
    "minecraft:blocks_attacks",
    [
      number(
        "block_delay_seconds",
        Messages.src.config.item.dataComponents.text0298,
      ),
      number(
        "disable_cooldown_scale",
        Messages.src.config.item.dataComponents.text0299,
      ),
      list(
        "damage_reductions",
        Messages.src.config.item.dataComponents.text0300,
      ),
      mapping("item_damage", Messages.src.config.item.dataComponents.text0301),
      field("bypassed_by", Messages.src.config.item.dataComponents.text0302, {
        valueProvider: "damage-type",
      }),
      field("block_sound", Messages.src.config.item.dataComponents.text0303, {
        valueProvider: "sound",
      }),
      field(
        "disabled_sound",
        Messages.src.config.item.dataComponents.text0304,
        { valueProvider: "sound" },
      ),
    ],
  ],
  ["minecraft:bundle_contents", ITEM_STACK_FIELDS],
  [
    "minecraft:can_break",
    [
      field("blocks", Messages.src.config.item.dataComponents.text0305),
      mapping("state", Messages.src.config.item.dataComponents.text0306),
      field("nbt", Messages.src.config.item.dataComponents.text0307),
      mapping("components", Messages.src.config.item.dataComponents.text0308),
      mapping("predicates", Messages.src.config.item.dataComponents.text0309),
    ],
  ],
  [
    "minecraft:can_place_on",
    [
      field("blocks", Messages.src.config.item.dataComponents.text0310),
      mapping("state", Messages.src.config.item.dataComponents.text0311),
      field("nbt", Messages.src.config.item.dataComponents.text0312),
      mapping("components", Messages.src.config.item.dataComponents.text0313),
      mapping("predicates", Messages.src.config.item.dataComponents.text0314),
    ],
  ],
  ["minecraft:charged_projectiles", ITEM_STACK_FIELDS],
  [
    "minecraft:food",
    [
      number("nutrition", Messages.src.config.item.dataComponents.text0315),
      number("saturation", Messages.src.config.item.dataComponents.text0316),
      bool("can_always_eat", Messages.src.config.item.dataComponents.text0317),
    ],
  ],
  [
    "minecraft:tool",
    [
      list("rules", Messages.src.config.item.dataComponents.text0318),
      number(
        "default_mining_speed",
        Messages.src.config.item.dataComponents.text0319,
      ),
      number(
        "damage_per_block",
        Messages.src.config.item.dataComponents.text0320,
      ),
      bool(
        "can_destroy_blocks_in_creative",
        Messages.src.config.item.dataComponents.text0321,
      ),
    ],
  ],
  [
    "minecraft:consumable",
    [
      number(
        "consume_seconds",
        Messages.src.config.item.dataComponents.text0322,
      ),
      field("animation", Messages.src.config.item.dataComponents.text0323, {
        values: [
          "none",
          "eat",
          "drink",
          "block",
          "bow",
          "trident",
          "crossbow",
          "spyglass",
          "toot_horn",
          "brush",
          "bundle",
          "spear",
        ],
      }),
      field("sound", Messages.src.config.item.dataComponents.text0324, {
        valueProvider: "sound",
      }),
      bool(
        "has_consume_particles",
        Messages.src.config.item.dataComponents.text0325,
      ),
      list(
        "on_consume_effects",
        Messages.src.config.item.dataComponents.text0326,
      ),
    ],
  ],
  [
    "minecraft:container",
    [
      number("slot", Messages.src.config.item.dataComponents.text0327),
      mapping("item", Messages.src.config.item.dataComponents.text0328),
    ],
  ],
  [
    "minecraft:container_loot",
    [
      field("loot_table", Messages.src.config.item.dataComponents.text0329),
      number("seed", Messages.src.config.item.dataComponents.text0330),
    ],
  ],
  [
    "minecraft:custom_model_data",
    [
      list("floats", Messages.src.config.item.dataComponents.text0331),
      list("flags", Messages.src.config.item.dataComponents.text0332),
      list("strings", Messages.src.config.item.dataComponents.text0333),
      list("colors", Messages.src.config.item.dataComponents.text0334),
    ],
  ],
  [
    "minecraft:damage_resistant",
    [field("types", Messages.src.config.item.dataComponents.text0335)],
  ],
  [
    "minecraft:death_protection",
    [list("death_effects", Messages.src.config.item.dataComponents.text0336)],
  ],
  [
    "minecraft:enchantable",
    [number("value", Messages.src.config.item.dataComponents.text0337)],
  ],
  [
    "minecraft:equippable",
    [
      field("slot", Messages.src.config.item.dataComponents.text0338, {
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
      field("equip_sound", Messages.src.config.item.dataComponents.text0339, {
        valueProvider: "sound",
      }),
      field("asset_id", Messages.src.config.item.dataComponents.text0340, {
        valueProvider: "equipment-id",
      }),
      field(
        "camera_overlay",
        Messages.src.config.item.dataComponents.text0341,
        { valueProvider: "texture" },
      ),
      list(
        "allowed_entities",
        Messages.src.config.item.dataComponents.text0342,
      ),
      bool("dispensable", Messages.src.config.item.dataComponents.text0343),
      bool("swappable", Messages.src.config.item.dataComponents.text0344),
      bool("damage_on_hurt", Messages.src.config.item.dataComponents.text0345),
      bool(
        "equip_on_interact",
        Messages.src.config.item.dataComponents.text0346,
      ),
      bool("can_be_sheared", Messages.src.config.item.dataComponents.text0347),
      field(
        "shearing_sound",
        Messages.src.config.item.dataComponents.text0348,
        { valueProvider: "sound" },
      ),
    ],
  ],
  ["minecraft:firework_explosion", FIREWORK_EXPLOSION_FIELDS],
  [
    "minecraft:fireworks",
    [
      number(
        "flight_duration",
        Messages.src.config.item.dataComponents.text0349,
      ),
      list("explosions", Messages.src.config.item.dataComponents.text0350),
    ],
  ],
  [
    "minecraft:kinetic_weapon",
    [
      number(
        "contact_cooldown_ticks",
        Messages.src.config.item.dataComponents.text0351,
      ),
      number("delay_ticks", Messages.src.config.item.dataComponents.text0352),
      mapping(
        "dismount_conditions",
        Messages.src.config.item.dataComponents.text0353,
      ),
      mapping(
        "knockback_conditions",
        Messages.src.config.item.dataComponents.text0354,
      ),
      mapping(
        "damage_conditions",
        Messages.src.config.item.dataComponents.text0355,
      ),
      number(
        "forward_movement",
        Messages.src.config.item.dataComponents.text0356,
      ),
      number(
        "damage_multiplier",
        Messages.src.config.item.dataComponents.text0357,
      ),
      field("sound", Messages.src.config.item.dataComponents.text0358, {
        valueProvider: "sound",
      }),
      field("hit_sound", Messages.src.config.item.dataComponents.text0359, {
        valueProvider: "sound",
      }),
    ],
  ],
  [
    "minecraft:lock",
    [
      field("items", Messages.src.config.item.dataComponents.text0360),
      mapping("count", Messages.src.config.item.dataComponents.text0361),
      mapping("components", Messages.src.config.item.dataComponents.text0362),
      mapping("predicates", Messages.src.config.item.dataComponents.text0363),
    ],
  ],
  [
    "minecraft:lodestone_tracker",
    [
      mapping("target", Messages.src.config.item.dataComponents.text0364),
      bool("tracked", Messages.src.config.item.dataComponents.text0365),
    ],
  ],
  [
    "minecraft:piercing_weapon",
    [
      bool("deals_knockback", Messages.src.config.item.dataComponents.text0366),
      bool("dismounts", Messages.src.config.item.dataComponents.text0367),
      field("sound", Messages.src.config.item.dataComponents.text0368, {
        valueProvider: "sound",
      }),
      field("hit_sound", Messages.src.config.item.dataComponents.text0369, {
        valueProvider: "sound",
      }),
    ],
  ],
  [
    "minecraft:potion_contents",
    [
      field("potion", Messages.src.config.item.dataComponents.text0370, {
        valueProvider: "potion",
      }),
      number("custom_color", Messages.src.config.item.dataComponents.text0371),
      list("custom_effects", Messages.src.config.item.dataComponents.text0372),
      field("custom_name", Messages.src.config.item.dataComponents.text0373),
    ],
  ],
  [
    "minecraft:profile",
    [
      field("name", Messages.src.config.item.dataComponents.text0374),
      field("id", Messages.src.config.item.dataComponents.text0375),
      list("properties", Messages.src.config.item.dataComponents.text0376),
    ],
  ],
  [
    "minecraft:repairable",
    [field("items", Messages.src.config.item.dataComponents.text0377)],
  ],
  ["minecraft:sulfur_cube_content", ITEM_STACK_FIELDS],
  [
    "minecraft:suspicious_stew_effects",
    [
      field("id", Messages.src.config.item.dataComponents.text0378, {
        valueProvider: "effect",
      }),
      number("duration", Messages.src.config.item.dataComponents.text0379),
    ],
  ],
  [
    "minecraft:swing_animation",
    [
      field("type", Messages.src.config.item.dataComponents.text0380, {
        values: ["none", "whack", "stab"],
      }),
      number("duration", Messages.src.config.item.dataComponents.text0381),
    ],
  ],
  [
    "minecraft:tooltip_display",
    [
      bool("hide_tooltip", Messages.src.config.item.dataComponents.text0382),
      list(
        "hidden_components",
        Messages.src.config.item.dataComponents.text0383,
      ),
    ],
  ],
  [
    "minecraft:trim",
    [
      registry(
        "material",
        Messages.src.config.item.dataComponents.text0384,
        "minecraft:trim_material",
      ),
      registry(
        "pattern",
        Messages.src.config.item.dataComponents.text0385,
        "minecraft:trim_pattern",
      ),
    ],
  ],
  [
    "minecraft:use_cooldown",
    [
      number("seconds", Messages.src.config.item.dataComponents.text0386),
      field("cooldown_group", Messages.src.config.item.dataComponents.text0387),
    ],
  ],
  [
    "minecraft:use_effects",
    [
      bool("can_sprint", Messages.src.config.item.dataComponents.text0388),
      bool(
        "interact_vibrations",
        Messages.src.config.item.dataComponents.text0389,
      ),
      number(
        "speed_multiplier",
        Messages.src.config.item.dataComponents.text0390,
      ),
    ],
  ],
  ["minecraft:use_remainder", ITEM_STACK_FIELDS],
  [
    "minecraft:weapon",
    [
      number(
        "item_damage_per_attack",
        Messages.src.config.item.dataComponents.text0391,
      ),
      number(
        "disable_blocking_for_seconds",
        Messages.src.config.item.dataComponents.text0392,
      ),
    ],
  ],
  [
    "minecraft:writable_book_content",
    [list("pages", Messages.src.config.item.dataComponents.text0393)],
  ],
  [
    "minecraft:written_book_content",
    [
      mapping("title", Messages.src.config.item.dataComponents.text0394),
      field("author", Messages.src.config.item.dataComponents.text0395),
      number("generation", Messages.src.config.item.dataComponents.text0396),
      list("pages", Messages.src.config.item.dataComponents.text0397),
      bool("resolved", Messages.src.config.item.dataComponents.text0398),
    ],
  ],
]);

const NESTED_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:bees/entity_data",
    [
      field("id", Messages.src.config.item.dataComponents.text0399, {
        valueProvider: "entity-type",
      }),
    ],
  ],
  [
    "minecraft:blocks_attacks/damage_reductions",
    [
      number(
        "horizontal_blocking_angle",
        Messages.src.config.item.dataComponents.text0400,
      ),
      field("type", Messages.src.config.item.dataComponents.text0401, {
        valueProvider: "damage-type",
      }),
      number("base", Messages.src.config.item.dataComponents.text0402),
      number("factor", Messages.src.config.item.dataComponents.text0403),
    ],
  ],
  [
    "minecraft:blocks_attacks/item_damage",
    [
      number("threshold", Messages.src.config.item.dataComponents.text0404),
      number("base", Messages.src.config.item.dataComponents.text0405),
      number("factor", Messages.src.config.item.dataComponents.text0406),
    ],
  ],
  ["minecraft:container/item", ITEM_STACK_FIELDS],
  [
    "minecraft:tool/rules",
    [
      field("blocks", Messages.src.config.item.dataComponents.text0407),
      number("speed", Messages.src.config.item.dataComponents.text0408),
      bool(
        "correct_for_drops",
        Messages.src.config.item.dataComponents.text0409,
      ),
    ],
  ],
  ["minecraft:fireworks/explosions", FIREWORK_EXPLOSION_FIELDS],
  [
    "minecraft:kinetic_weapon/dismount_conditions",
    [
      number(
        "max_duration_ticks",
        Messages.src.config.item.dataComponents.text0410,
      ),
      number("min_speed", Messages.src.config.item.dataComponents.text0411),
      number(
        "min_relative_speed",
        Messages.src.config.item.dataComponents.text0412,
      ),
    ],
  ],
  [
    "minecraft:kinetic_weapon/knockback_conditions",
    [
      number(
        "max_duration_ticks",
        Messages.src.config.item.dataComponents.text0413,
      ),
      number("min_speed", Messages.src.config.item.dataComponents.text0414),
      number(
        "min_relative_speed",
        Messages.src.config.item.dataComponents.text0415,
      ),
    ],
  ],
  [
    "minecraft:kinetic_weapon/damage_conditions",
    [
      number(
        "max_duration_ticks",
        Messages.src.config.item.dataComponents.text0416,
      ),
      number("min_speed", Messages.src.config.item.dataComponents.text0417),
      number(
        "min_relative_speed",
        Messages.src.config.item.dataComponents.text0418,
      ),
    ],
  ],
  [
    "minecraft:lodestone_tracker/target",
    [
      registry(
        "dimension",
        Messages.src.config.item.dataComponents.text0419,
        "minecraft:dimension_type",
      ),
      field("pos", Messages.src.config.item.dataComponents.text0420),
    ],
  ],
  ["minecraft:potion_contents/custom_effects", EFFECT_INSTANCE_FIELDS],
  [
    "minecraft:profile/properties",
    [
      field("name", Messages.src.config.item.dataComponents.text0421),
      field("value", Messages.src.config.item.dataComponents.text0422),
      field("signature", Messages.src.config.item.dataComponents.text0423),
    ],
  ],
  ["minecraft:writable_book_content/pages", FILTERABLE_TEXT_FIELDS],
  ["minecraft:written_book_content/title", FILTERABLE_TEXT_FIELDS],
  ["minecraft:written_book_content/pages", FILTERABLE_TEXT_FIELDS],
]);

const MIN_MAX_NUMBER_FIELDS: readonly SchemaField[] = [
  number("min", Messages.src.config.item.dataComponents.text0424),
  number("max", Messages.src.config.item.dataComponents.text0425),
];
const COLLECTION_PREDICATE_FIELDS: readonly SchemaField[] = [
  list("contains", Messages.src.config.item.dataComponents.text0426),
  list("count", Messages.src.config.item.dataComponents.text0427),
  mapping("size", Messages.src.config.item.dataComponents.text0428),
];
const ITEM_PREDICATE_FIELDS: readonly SchemaField[] = [
  field("items", Messages.src.config.item.dataComponents.text0429, {
    valueProvider: "item-id",
  }),
  mapping("count", Messages.src.config.item.dataComponents.text0430),
  mapping("components", Messages.src.config.item.dataComponents.text0431),
  mapping("predicates", Messages.src.config.item.dataComponents.text0432),
];
const ENCHANTMENT_PREDICATE_FIELDS: readonly SchemaField[] = [
  field("enchantments", Messages.src.config.item.dataComponents.text0433, {
    valueProvider: "enchantment",
  }),
  mapping("levels", Messages.src.config.item.dataComponents.text0434),
];
const ATTRIBUTE_PREDICATE_FIELDS: readonly SchemaField[] = [
  field("attribute", Messages.src.config.item.dataComponents.text0435, {
    valueProvider: "attribute",
  }),
  field("id", Messages.src.config.item.dataComponents.text0436),
  mapping("amount", Messages.src.config.item.dataComponents.text0437),
  field("operation", Messages.src.config.item.dataComponents.text0438, {
    values: ["add_value", "add_multiplied_base", "add_multiplied_total"],
  }),
  field("slot", Messages.src.config.item.dataComponents.text0439, {
    values: [
      "any",
      "mainhand",
      "offhand",
      "hand",
      "feet",
      "legs",
      "chest",
      "head",
      "armor",
      "body",
      "saddle",
    ],
  }),
];
const PARTIAL_PREDICATE_ROOT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "minecraft:damage",
    [
      mapping("durability", Messages.src.config.item.dataComponents.text0440),
      mapping("damage", Messages.src.config.item.dataComponents.text0441),
    ],
  ],
  ["minecraft:enchantments", ENCHANTMENT_PREDICATE_FIELDS],
  ["minecraft:stored_enchantments", ENCHANTMENT_PREDICATE_FIELDS],
  [
    "minecraft:container",
    [mapping("items", Messages.src.config.item.dataComponents.text0442)],
  ],
  [
    "minecraft:bundle_contents",
    [mapping("items", Messages.src.config.item.dataComponents.text0443)],
  ],
  [
    "minecraft:firework_explosion",
    [
      field("shape", Messages.src.config.item.dataComponents.text0444, {
        values: ["small_ball", "large_ball", "star", "creeper", "burst"],
      }),
      bool("has_twinkle", Messages.src.config.item.dataComponents.text0445),
      bool("has_trail", Messages.src.config.item.dataComponents.text0446),
    ],
  ],
  [
    "minecraft:fireworks",
    [
      mapping("explosions", Messages.src.config.item.dataComponents.text0447),
      mapping(
        "flight_duration",
        Messages.src.config.item.dataComponents.text0448,
      ),
    ],
  ],
  [
    "minecraft:writable_book_content",
    [mapping("pages", Messages.src.config.item.dataComponents.text0449)],
  ],
  [
    "minecraft:written_book_content",
    [
      mapping("pages", Messages.src.config.item.dataComponents.text0450),
      field("author", Messages.src.config.item.dataComponents.text0451),
      field("title", Messages.src.config.item.dataComponents.text0452),
      mapping("generation", Messages.src.config.item.dataComponents.text0453),
      bool("resolved", Messages.src.config.item.dataComponents.text0454),
    ],
  ],
  [
    "minecraft:attribute_modifiers",
    [mapping("modifiers", Messages.src.config.item.dataComponents.text0455)],
  ],
  [
    "minecraft:trim",
    [
      registry(
        "material",
        Messages.src.config.item.dataComponents.text0456,
        "minecraft:trim_material",
      ),
      registry(
        "pattern",
        Messages.src.config.item.dataComponents.text0457,
        "minecraft:trim_pattern",
      ),
    ],
  ],
]);

function partialComponentPredicateFields(
  predicateId: string,
  path: readonly string[],
): readonly SchemaField[] {
  if (path.length === 0)
    return PARTIAL_PREDICATE_ROOT_FIELDS.get(predicateId) ?? [];
  const key = `${predicateId}/${path.join("/")}`;
  if (
    predicateId === "minecraft:damage" &&
    (key.endsWith("/durability") || key.endsWith("/damage"))
  ) {
    return MIN_MAX_NUMBER_FIELDS;
  }
  if (
    (predicateId === "minecraft:enchantments" ||
      predicateId === "minecraft:stored_enchantments") &&
    key.endsWith("/levels")
  )
    return MIN_MAX_NUMBER_FIELDS;
  if (
    (predicateId === "minecraft:container" ||
      predicateId === "minecraft:bundle_contents") &&
    path[0] === "items"
  ) {
    if (path.length === 1) return COLLECTION_PREDICATE_FIELDS;
    if (path.at(-1) === "contains" || path.at(-1) === "test")
      return ITEM_PREDICATE_FIELDS;
    if (path.at(-1) === "count") {
      if (path.at(-2) === "items")
        return [
          mapping("test", Messages.src.config.item.dataComponents.text0458),
          mapping("count", Messages.src.config.item.dataComponents.text0459),
        ];
      return MIN_MAX_NUMBER_FIELDS;
    }
    if (path.at(-1) === "size") return MIN_MAX_NUMBER_FIELDS;
  }
  if (predicateId === "minecraft:fireworks") {
    if (path[0] === "flight_duration") return MIN_MAX_NUMBER_FIELDS;
    if (path[0] === "explosions") {
      if (path.length === 1) return COLLECTION_PREDICATE_FIELDS;
      if (path.at(-1) === "contains" || path.at(-1) === "test") {
        return (
          PARTIAL_PREDICATE_ROOT_FIELDS.get("minecraft:firework_explosion") ??
          []
        );
      }
      if (path.at(-1) === "count") {
        if (path.at(-2) === "explosions")
          return [
            mapping("test", Messages.src.config.item.dataComponents.text0460),
            mapping("count", Messages.src.config.item.dataComponents.text0461),
          ];
        return MIN_MAX_NUMBER_FIELDS;
      }
      if (path.at(-1) === "size") return MIN_MAX_NUMBER_FIELDS;
    }
  }
  if (
    predicateId === "minecraft:writable_book_content" ||
    predicateId === "minecraft:written_book_content"
  ) {
    if (path[0] === "generation") return MIN_MAX_NUMBER_FIELDS;
    if (path[0] === "pages" && path.length === 1)
      return COLLECTION_PREDICATE_FIELDS;
    if (path[0] === "pages" && path.at(-1) === "count") {
      if (path.length === 2)
        return [
          field("test", Messages.src.config.item.dataComponents.text0462),
          mapping("count", Messages.src.config.item.dataComponents.text0463),
        ];
      return MIN_MAX_NUMBER_FIELDS;
    }
    if (path[0] === "pages" && path.at(-1) === "size")
      return MIN_MAX_NUMBER_FIELDS;
  }
  if (
    predicateId === "minecraft:attribute_modifiers" &&
    path[0] === "modifiers"
  ) {
    if (path.length === 1) return COLLECTION_PREDICATE_FIELDS;
    if (path.at(-1) === "contains" || path.at(-1) === "test")
      return ATTRIBUTE_PREDICATE_FIELDS;
    if (path.at(-1) === "amount") return MIN_MAX_NUMBER_FIELDS;
    if (path.at(-1) === "count") {
      if (path.length === 2)
        return [
          mapping("test", Messages.src.config.item.dataComponents.text0464),
          mapping("count", Messages.src.config.item.dataComponents.text0465),
        ];
      return MIN_MAX_NUMBER_FIELDS;
    }
    if (path.at(-1) === "size") return MIN_MAX_NUMBER_FIELDS;
  }
  return [];
}

const CONSUME_EFFECT_TYPES = [
  "minecraft:apply_effects",
  "minecraft:remove_effects",
  "minecraft:clear_all_effects",
  "minecraft:teleport_randomly",
  "minecraft:play_sound",
] as const;
const CONSUME_EFFECT_DETAILS: Readonly<
  Record<(typeof CONSUME_EFFECT_TYPES)[number], string>
> = {
  "minecraft:apply_effects": Messages.src.config.item.dataComponents.text0466,
  "minecraft:remove_effects": Messages.src.config.item.dataComponents.text0467,
  "minecraft:clear_all_effects":
    Messages.src.config.item.dataComponents.text0468,
  "minecraft:teleport_randomly":
    Messages.src.config.item.dataComponents.text0469,
  "minecraft:play_sound": Messages.src.config.item.dataComponents.text0470,
};
const CONSUME_EFFECT_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "apply_effects",
    [
      list("effects", Messages.src.config.item.dataComponents.text0471),
      number("probability", Messages.src.config.item.dataComponents.text0472),
    ],
  ],
  [
    "remove_effects",
    [list("effects", Messages.src.config.item.dataComponents.text0473)],
  ],
  ["clear_all_effects", []],
  [
    "teleport_randomly",
    [number("diameter", Messages.src.config.item.dataComponents.text0474)],
  ],
  [
    "play_sound",
    [
      field("sound", Messages.src.config.item.dataComponents.text0475, {
        valueProvider: "sound",
      }),
    ],
  ],
]);

export function dataComponentFields(
  component: string,
  componentPath: readonly string[],
  context: Pick<SchemaContext, "siblingValues">,
): readonly SchemaField[] {
  if (componentPath.length === 0) return ROOT_FIELDS.get(component) ?? [];
  const predicateMarker = componentPath.lastIndexOf("predicates");
  if (predicateMarker >= 0) {
    const predicateId = componentPath[predicateMarker + 1];
    if (
      predicateId &&
      (PARTIAL_COMPONENT_PREDICATES as readonly string[]).includes(predicateId)
    ) {
      return partialComponentPredicateFields(
        predicateId,
        componentPath.slice(predicateMarker + 2),
      );
    }
  }
  const key = `${component}/${componentPath.join("/")}`;
  if (
    key === "minecraft:consumable/on_consume_effects" ||
    key === "minecraft:death_protection/death_effects"
  ) {
    const rawType = context.siblingValues.get("type");
    const selected = localRegistryDiscriminator(rawType, "minecraft");
    return [
      field("type", Messages.src.config.item.dataComponents.text0476, {
        values: CONSUME_EFFECT_TYPES,
        valueDetails: CONSUME_EFFECT_DETAILS,
      }),
      ...(!rawType
        ? [...CONSUME_EFFECT_FIELDS.values()].flat()
        : selected
          ? (CONSUME_EFFECT_FIELDS.get(selected) ?? [])
          : []),
    ];
  }
  if (key === "minecraft:attribute_modifiers/display") {
    return [
      field("type", Messages.src.config.item.dataComponents.text0477, {
        values: ["default", "hidden", "override"],
        valueDetails: {
          default: Messages.src.config.item.dataComponents.text0478,
          hidden: Messages.src.config.item.dataComponents.text0479,
          override: Messages.src.config.item.dataComponents.text0480,
        },
      }),
      ...(context.siblingValues.get("type") === "override"
        ? [field("value", Messages.src.config.item.dataComponents.text0481)]
        : []),
    ];
  }
  if (component === "minecraft:map_decorations" && componentPath.length === 1) {
    return [
      registry(
        "type",
        Messages.src.config.item.dataComponents.text0482,
        "minecraft:map_decoration_type",
      ),
      number("x", Messages.src.config.item.dataComponents.text0483),
      number("z", Messages.src.config.item.dataComponents.text0484),
      number("rotation", Messages.src.config.item.dataComponents.text0485),
    ];
  }
  if (
    (component === "minecraft:consumable" ||
      component === "minecraft:death_protection") &&
    componentPath.at(-1) === "effects"
  )
    return EFFECT_INSTANCE_FIELDS;
  if (
    (component === "minecraft:potion_contents" ||
      component === "minecraft:suspicious_stew_effects") &&
    componentPath.at(-1) === "hidden_effect"
  )
    return EFFECT_INSTANCE_FIELDS;
  return NESTED_FIELDS.get(key) ?? [];
}

export function dataComponentRootSnippet(
  definition: DataComponentDefinition,
): string {
  if (definition.kind === "mapping") return `${definition.id}:\n  \${0}`;
  if (definition.kind === "list") return `${definition.id}:\n  - \${0}`;
  if (definition.kind === "unit") return `${definition.id}: {}`;
  return `${definition.id}: \${0}`;
}
