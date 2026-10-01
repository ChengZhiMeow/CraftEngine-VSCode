import {
  CONDITION_TYPES,
  fieldsForDiscriminator,
  FUNCTION_TYPES,
  ITEM_DATA_FIELDS,
} from "../item/schema.js";
import { withTemplateSchemaFields } from "../schema/templateFields.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { semanticForField } from "../schema/types.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import { Messages } from "../../messages.js";
import {
  NUMBER_PROVIDER_TYPES,
  NUMBER_PROVIDER_TYPE_DETAILS,
  numberProviderAllowsNestedField,
  numberProviderConsumer,
  numberProviderFields as sharedNumberProviderFields,
  resolveNumberProviderType,
} from "../number-provider/schema.js";

export { NUMBER_PROVIDER_TYPES, NUMBER_PROVIDER_TYPE_DETAILS };

interface Options {
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
  options: Options = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_"),
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

const list = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
): SchemaField =>
  field(label, detail, {
    aliases,
    required,
    snippet: `${label}:\n  - \${0}`,
  });
const number = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
): SchemaField =>
  field(label, detail, {
    aliases,
    required,
    valueProvider: "number",
  });
const numberProvider = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
): SchemaField =>
  numberProviderConsumer(field(label, detail, { aliases, required }));
export const LOOT_ENTRY_TYPES = [
  "alternatives",
  "if_else",
  "item",
  "exp",
  "furniture_item",
  "empty",
  "function",
  "loot_table",
] as const;
export const LOOT_ENTRY_TYPE_DETAILS: Readonly<
  Record<(typeof LOOT_ENTRY_TYPES)[number], string>
> = {
  alternatives: Messages.src.config.loot.schema.text0003,
  if_else: Messages.src.config.loot.schema.text0004,
  item: Messages.src.config.loot.schema.text0005,
  exp: Messages.src.config.loot.schema.text0006,
  furniture_item: Messages.src.config.loot.schema.text0007,
  empty: Messages.src.config.loot.schema.text0008,
  function: "执行一个通用函数, 用 run 指定",
  loot_table: "引用另一个战利品表",
};

export const LOOT_FUNCTION_TYPES = [
  "apply_bonus",
  "apply_data",
  "set_count",
  "explosion_decay",
  "drop_exp",
  "limit_count",
] as const;
export const LOOT_FUNCTION_TYPE_DETAILS: Readonly<
  Record<(typeof LOOT_FUNCTION_TYPES)[number], string>
> = {
  apply_bonus: Messages.src.config.loot.schema.text0009,
  apply_data: Messages.src.config.loot.schema.text0010,
  set_count: Messages.src.config.loot.schema.text0011,
  explosion_decay: Messages.src.config.loot.schema.text0012,
  drop_exp: Messages.src.config.loot.schema.text0013,
  limit_count: Messages.src.config.loot.schema.text0014,
};

export const LOOT_FORMULA_TYPES = [
  "ore_drops",
  "binomial_with_bonus_count",
] as const;
export const LOOT_FORMULA_TYPE_DETAILS: Readonly<
  Record<(typeof LOOT_FORMULA_TYPES)[number], string>
> = {
  ore_drops: Messages.src.config.loot.schema.text0015,
  binomial_with_bonus_count: Messages.src.config.loot.schema.text0016,
};

const ENTRY_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.loot.schema.text0017, {
    values: LOOT_ENTRY_TYPES,
    valueDetails: LOOT_ENTRY_TYPE_DETAILS,
    required: true,
  }),
  list("conditions", Messages.src.config.loot.schema.text0018, ["condition"]),
];
// CE 的 empty 只读 condition(s)/weight/quality, 不接受 functions
const EMPTY_ENTRY_COMMON: readonly SchemaField[] = [
  ...ENTRY_COMMON,
  number("weight", Messages.src.config.loot.schema.text0019),
  number("quality", Messages.src.config.loot.schema.text0020),
];
const SINGLE_ENTRY_COMMON: readonly SchemaField[] = [
  ...EMPTY_ENTRY_COMMON,
  list("functions", Messages.src.config.loot.schema.text0021),
];
const ENTRY_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "alternatives",
    [list("children", Messages.src.config.loot.schema.text0022)],
  ],
  ["if_else", [list("children", Messages.src.config.loot.schema.text0023)]],
  [
    "item",
    [
      field("item", Messages.src.config.loot.schema.text0024, {
        aliases: ["id"],
        valueProvider: "item-id",
        required: true,
      }),
    ],
  ],
  [
    "exp",
    [
      numberProvider(
        "count",
        Messages.src.config.loot.schema.text0025,
        ["amount", "exp"],
        true,
      ),
    ],
  ],
  [
    "furniture_item",
    [
      field("item", Messages.src.config.loot.schema.text0026, {
        valueProvider: "item-id",
      }),
    ],
  ],
  ["empty", []],
  [
    "function",
    [
      field("run", "要执行的通用函数", {
        required: true,
        snippet: "run:\n  type: ${0}",
      }),
    ],
  ],
  [
    "loot_table",
    [
      field("id", "引用的战利品表 ID", {
        aliases: ["table", "name"],
        valueProvider: "loot-id",
        required: true,
      }),
    ],
  ],
]);

// CE: alternatives/if_else 只读 condition(s)/children, exp 只读 count/condition(s),
// empty 额外读 weight/quality, 其余类型都读 condition(s)/functions/weight/quality。
// type 缺失或写成空串时 CE 直接报错, 这里仍按最宽松的并集处理。
const ENTRY_COMMON_BY_TYPE: Readonly<Record<string, readonly SchemaField[]>> = {
  alternatives: ENTRY_COMMON,
  if_else: ENTRY_COMMON,
  exp: ENTRY_COMMON,
  empty: EMPTY_ENTRY_COMMON,
  item: SINGLE_ENTRY_COMMON,
  furniture_item: SINGLE_ENTRY_COMMON,
  function: SINGLE_ENTRY_COMMON,
  loot_table: SINGLE_ENTRY_COMMON,
};

function entryCommonFor(type: string | undefined): readonly SchemaField[] {
  if (type === undefined) return SINGLE_ENTRY_COMMON;
  return ENTRY_COMMON_BY_TYPE[type] ?? SINGLE_ENTRY_COMMON;
}

const FUNCTION_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.loot.schema.text0027, {
    values: LOOT_FUNCTION_TYPES,
    valueDetails: LOOT_FUNCTION_TYPE_DETAILS,
    required: true,
  }),
  list("conditions", Messages.src.config.loot.schema.text0028, ["condition"]),
];
const FUNCTION_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "apply_bonus",
    [
      field("enchantment", Messages.src.config.loot.schema.text0029, {
        valueProvider: "enchantment",
        required: true,
      }),
      field("formula", Messages.src.config.loot.schema.text0030, {
        required: true,
        snippet: "formula:\n  ${0}",
      }),
    ],
  ],
  [
    "apply_data",
    [
      field("data", Messages.src.config.loot.schema.text0031, {
        required: true,
        snippet: "data:\n  ${0}",
      }),
    ],
  ],
  [
    "set_count",
    [
      numberProvider(
        "count",
        Messages.src.config.loot.schema.text0032,
        ["amount"],
        true,
      ),
      field("add", Messages.src.config.loot.schema.text0033, {
        valueProvider: "boolean",
        values: ["true", "false"],
        valueDetails: {
          true: Messages.src.config.loot.schema.text0001,
          false: Messages.src.config.loot.schema.text0002,
        },
      }),
    ],
  ],
  ["explosion_decay", []],
  [
    "drop_exp",
    [
      numberProvider(
        "count",
        Messages.src.config.loot.schema.text0034,
        ["amount"],
        true,
      ),
    ],
  ],
  [
    "limit_count",
    [
      numberProvider("min", Messages.src.config.loot.schema.text0035),
      numberProvider("max", Messages.src.config.loot.schema.text0036),
    ],
  ],
]);

const FORMULA_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.loot.schema.text0037, {
    values: LOOT_FORMULA_TYPES,
    valueDetails: LOOT_FORMULA_TYPE_DETAILS,
    required: true,
  }),
];
const FORMULA_FIELDS = new Map<string, readonly SchemaField[]>([
  ["ore_drops", []],
  [
    "binomial_with_bonus_count",
    [
      number("extra", Messages.src.config.loot.schema.text0038),
      number("probability", Messages.src.config.loot.schema.text0039, [
        "chance",
      ]),
    ],
  ],
]);

export const VANILLA_LOOT_TYPES = [
  "fishing",
  "piglin_barter",
  "block_break",
  "entity_death",
  "container",
  "archaeology",
  "entity_drop",
  "harvest",
  "block_shear",
  "entity_shear",
  "vault",
  "advancement",
  // 最新源码仍显式保留这些旧版 type 别名。
  "block",
  "entity",
  "shear_block",
] as const;
export const VANILLA_LOOT_TYPE_DETAILS: Readonly<
  Record<(typeof VANILLA_LOOT_TYPES)[number], string>
> = {
  fishing: "注入钓鱼掉落",
  piglin_barter: "注入猪灵交易掉落",
  block_break: "注入指定方块的破坏掉落",
  entity_death: "注入指定实体的死亡掉落",
  container: "注入指定容器战利品表",
  archaeology: "注入指定考古战利品表",
  entity_drop: "注入指定实体的普通掉落",
  harvest: "注入指定方块的收获掉落",
  block_shear: "注入指定方块的剪取掉落",
  entity_shear: "注入指定实体的剪取掉落",
  vault: "注入指定宝库战利品表",
  advancement: "注入指定进度奖励",
  block: Messages.src.config.loot.schema.text0040,
  entity: Messages.src.config.loot.schema.text0041,
  shear_block: "block_shear 的旧版别名",
};

const WILDCARD_LOOT_SOURCE_TYPES = new Set(["fishing", "piglin_barter"]);

function typed(
  common: readonly SchemaField[],
  variants: ReadonlyMap<string, readonly SchemaField[]>,
  type: string | undefined,
): readonly SchemaField[] {
  const normalized = localRegistryDiscriminator(type);
  if (type && (!normalized || !variants.has(normalized))) {
    return isValidRegistryDiscriminator(type)
      ? []
      : common.filter((candidate) => candidate.semantic === "type");
  }
  const fields = new Map<string, SchemaField>();
  for (const group of [
    common,
    !type
      ? [...variants.values()].flat()
      : normalized
        ? (variants.get(normalized) ?? [])
        : [],
  ]) {
    for (const candidate of group)
      if (!fields.has(candidate.semantic))
        fields.set(candidate.semantic, candidate);
  }
  return [...fields.values()];
}

export function vanillaLootFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const type = context.siblingValues.get("type")?.toLowerCase();
  const canonicalType =
    type === "block"
      ? "block_break"
      : type === "entity"
        ? "entity_death"
        : type === "shear_block"
          ? "block_shear"
          : type;
  const targeted =
    canonicalType === undefined || !WILDCARD_LOOT_SOURCE_TYPES.has(canonicalType);
  const targetProvider: SchemaValueProvider | undefined =
    canonicalType === "block_break" ||
    canonicalType === "harvest" ||
    canonicalType === "block_shear"
      ? "block-id"
      : canonicalType === "entity_death" ||
          canonicalType === "entity_drop" ||
          canonicalType === "entity_shear"
        ? "entity-type"
        : undefined;
  return withTemplateSchemaFields(context.path, [
    field("type", Messages.src.config.loot.schema.text0042, {
      values: VANILLA_LOOT_TYPES,
      valueDetails: VANILLA_LOOT_TYPE_DETAILS,
      required: true,
    }),
    ...(targeted
      ? [
          field("target", "要匹配的目标 Key；可填写单值或列表", {
            aliases: ["targets"],
            snippet: "target:\n  - ${0}",
            ...(targetProvider === undefined
              ? {}
              : { valueProvider: targetProvider }),
          }),
        ]
      : []),
    list("condition", "Loot Source 生效条件", ["conditions"]),
    field("overwrite", "覆写原掉落的部分；支持 none/all/items/item/experience/exp", {
      snippet: "overwrite: ${1|none,all,items,experience|}",
    }),
    field("override", Messages.src.config.loot.schema.text0045, {
      valueProvider: "boolean",
      values: ["true", "false"],
      valueDetails: {
        true: Messages.src.config.loot.schema.text0001,
        false: Messages.src.config.loot.schema.text0002,
      },
    }),
    field("loot", Messages.src.config.loot.schema.text0046, {
      aliases: ["loots"],
      snippet: "loot:\n  ${0}",
      valueProvider: "loot-id",
      required: true,
    }),
  ]);
}

function compactPath(path: readonly string[]): string[] {
  return path
    .slice(1)
    .filter((part) => !/^\d+$/u.test(part))
    .map((part) => part.replaceAll("-", "_"));
}

function knownLootAncestorType(rawType: string): boolean {
  if ((VANILLA_LOOT_TYPES as readonly string[]).includes(rawType.toLowerCase()))
    return true;
  const local = localRegistryDiscriminator(rawType);
  if (
    local &&
    ((LOOT_ENTRY_TYPES as readonly string[]).includes(local) ||
      (LOOT_FUNCTION_TYPES as readonly string[]).includes(local) ||
      (LOOT_FORMULA_TYPES as readonly string[]).includes(local) ||
      (NUMBER_PROVIDER_TYPES as readonly string[]).includes(local))
  )
    return true;
  const localCondition = localRegistryDiscriminator(
    rawType.startsWith("!") ? rawType.slice(1) : rawType,
  );
  return (
    localCondition !== undefined &&
    ((CONDITION_TYPES as readonly string[]).includes(localCondition) ||
      (FUNCTION_TYPES as readonly string[]).includes(localCondition))
  );
}

function lootNumberProviderFields(
  compact: readonly string[],
  context: SchemaContext,
): readonly SchemaField[] | undefined {
  const tail = compact.at(-1);
  if (!tail) return undefined;
  const nearestType = context.ancestorTypes?.[0];
  const resolvedProvider = resolveNumberProviderType(nearestType);
  if (
    resolvedProvider &&
    !resolvedProvider.external &&
    (NUMBER_PROVIDER_TYPES as readonly string[]).includes(resolvedProvider.name)
  ) {
    return numberProviderAllowsNestedField(nearestType, tail)
      ? sharedNumberProviderFields(context.siblingValues.get("type"))
      : [];
  }

  if (tail === "rolls" || tail === "bonus_rolls") {
    return sharedNumberProviderFields(context.siblingValues.get("type"));
  }
  for (const ancestorType of context.ancestorTypes ?? []) {
    if (
      [
        ...fieldsForDiscriminator("condition", ancestorType),
        ...fieldsForDiscriminator("function", ancestorType),
        ...typed(FUNCTION_COMMON, FUNCTION_FIELDS, ancestorType),
        ...typed(ENTRY_COMMON, ENTRY_FIELDS, ancestorType),
      ].some(
        (candidate) =>
          (candidate.label === tail || candidate.aliases.includes(tail)) &&
          candidate.valueProvider === "number-provider",
      )
    ) {
      return sharedNumberProviderFields(context.siblingValues.get("type"));
    }
  }

  if (
    context.ancestorTypes === undefined &&
    !compact.includes("formula") &&
    ((compact.includes("pools") && ["rolls", "bonus_rolls"].includes(tail)) ||
      (compact.includes("entries") &&
        ["count", "amount", "exp"].includes(tail)) ||
      (compact.includes("functions") &&
        ["count", "amount", "min", "max"].includes(tail)) ||
      ((compact.includes("conditions") || compact.includes("condition")) &&
        ["x", "y", "z", "count", "value", "min", "max"].includes(tail)))
  ) {
    return sharedNumberProviderFields(context.siblingValues.get("type"));
  }
  return undefined;
}

export function lootFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const compact = compactPath(context.path);
  if (compact.length === 0)
    return withTemplateSchemaFields(context.path, [
      list("pools", Messages.src.config.loot.schema.text0047),
      list("functions", Messages.src.config.loot.schema.text0048),
    ]);
  if (
    (context.ancestorTypes ?? []).some((type) => !knownLootAncestorType(type))
  )
    return withTemplateSchemaFields(context.path, []);
  const tail = compact.at(-1);
  const providerFields = lootNumberProviderFields(compact, context);
  if (providerFields !== undefined)
    return withTemplateSchemaFields(context.path, providerFields);
  let fields: readonly SchemaField[] = [];
  if (tail === "pools")
    fields = [
      numberProvider("rolls", Messages.src.config.loot.schema.text0049),
      numberProvider("bonus_rolls", Messages.src.config.loot.schema.text0050, [
        "bonus-rolls",
      ]),
      list("conditions", Messages.src.config.loot.schema.text0051, [
        "condition",
      ]),
      list("entries", Messages.src.config.loot.schema.text0052),
      list("functions", Messages.src.config.loot.schema.text0053),
    ];
  else if (tail === "entries" || tail === "children") {
    const rawType = context.siblingValues.get("type");
    const type = localRegistryDiscriminator(rawType);
    fields = typed(entryCommonFor(type), ENTRY_FIELDS, rawType);
  } else if (tail === "functions")
    fields = typed(
      FUNCTION_COMMON,
      FUNCTION_FIELDS,
      context.siblingValues.get("type"),
    );
  else if (tail === "run")
    // type: function 的 run 用的是通用函数, 不是战利品函数
    fields = fieldsForDiscriminator(
      "function",
      context.siblingValues.get("type"),
    );
  else if (
    tail === "conditions" ||
    tail === "condition" ||
    tail === "terms" ||
    tail === "term"
  )
    fields = fieldsForDiscriminator(
      "condition",
      context.siblingValues.get("type"),
    );
  else if (tail === "formula")
    fields = typed(
      FORMULA_COMMON,
      FORMULA_FIELDS,
      context.siblingValues.get("type"),
    );
  else if (tail === "data") fields = ITEM_DATA_FIELDS;
  return withTemplateSchemaFields(context.path, fields);
}

export function lootSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  const semantic = semanticForField(name, fields);
  return fields.find(
    (candidate) =>
      candidate.label === name ||
      candidate.aliases.includes(name) ||
      candidate.semantic === semantic,
  );
}

export function lootListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const tail = compactPath(path).at(-1);
  if (
    tail === "conditions" ||
    tail === "condition" ||
    tail === "terms" ||
    tail === "term"
  ) {
    return field("type", Messages.src.config.loot.schema.text0054, {
      valueProvider: "condition-type",
    });
  }
  if (tail === "entries" || tail === "children") {
    return field("type", Messages.src.config.loot.schema.text0055, {
      values: LOOT_ENTRY_TYPES,
      valueDetails: LOOT_ENTRY_TYPE_DETAILS,
    });
  }
  if (tail === "functions") {
    return field("type", Messages.src.config.loot.schema.text0056, {
      values: LOOT_FUNCTION_TYPES,
      valueDetails: LOOT_FUNCTION_TYPE_DETAILS,
    });
  }
  return undefined;
}
