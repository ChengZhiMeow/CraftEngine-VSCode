import {
  fieldsForDiscriminator,
  resolveFunctionOrConditionType,
} from "../item/schema.js";
import { withTemplateSchemaFields } from "../schema/templateFields.js";
import { Messages } from "../../messages.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { schemaFieldForName } from "../schema/types.js";
import {
  numberProviderAllowsNestedField,
  numberProviderFields,
  resolveNumberProviderType,
} from "../number-provider/schema.js";
import { configKeys } from "../../util/configKeys.js";
import { getSectionFamily } from "../registry/sectionRegistry.js";
import {
  localRegistryDiscriminator,
} from "../registry/discriminators.js";

  // 段名与别名统一由 sectionRegistry 提供, 这里只声明本文件实现了哪些段的字段表
export type MiscResourceSection =
  | "emojis"
  | "categories"
  | "paintings"
  | "block-state-mappings"
  | "skip-optimization"
  | "advancements"
  | "entities"
  | "attributes"
  | "attribute-operations"
  | "equipment-sets"
  | "damage-rules"
  | "atlases";

  // 缺一个成员就会与上面的类型不符, 用来保证这里是最新的一份清单
const MISC_RESOURCE_SECTION_TYPE_LIST: readonly MiscResourceSection[] = [
  "emojis",
  "categories",
  "paintings",
  "block-state-mappings",
  "skip-optimization",
  "advancements",
  "entities",
  "attributes",
  "attribute-operations",
  "equipment-sets",
  "damage-rules",
  "atlases",
];

const MISC_RESOURCE_SECTIONS: ReadonlySet<string> = new Set<string>(
  MISC_RESOURCE_SECTION_TYPE_LIST,
);

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
      true: Messages.src.config.resource.schema.text0001,
      false: Messages.src.config.resource.schema.text0002,
    },
  });

const mapping = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, {
    aliases,
    snippet: `${label}:\n  \${0}`,
  });

const number = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField =>
  field(label, detail, { aliases, valueProvider: "number" });

const numberProvider = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
  required = false,
): SchemaField =>
  field(label, detail, {
    aliases,
    required,
    valueProvider: "number-provider",
  });

function patterned(
  pattern: string,
  detail: string,
  options: Omit<FieldOptions, "aliases"> = {},
): SchemaField {
  const [label = pattern, ...aliases] = configKeys(pattern);
  return field(label, detail, { ...options, aliases });
}

const COMMON_ID_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.resource.schema.text0003),
  bool("debug", Messages.src.config.resource.schema.text0004),
];

export const EMOJI_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("permission", Messages.src.config.resource.schema.text0005),
  list("keywords", Messages.src.config.resource.schema.text0006, [], true),
  field("content", Messages.src.config.resource.schema.text0007, {
    aliases: ["format"],
    snippet: "content: '<white><arg:emoji></white>'",
  }),
  field("image", Messages.src.config.resource.schema.text0008, {
    valueProvider: "image-id",
    snippet: "image: ${0:namespace:image}",
  }),
  bool("chat_completion", Messages.src.config.resource.schema.text0009, [
    "chat-completion",
  ]),
  field("content_overrides", Messages.src.config.resource.schema.text0010, {
    aliases: ["content-overrides"],
    snippet: "content_overrides:\n  ${0}",
  }),
];

export const EMOJI_CONTENT_OVERRIDE_FIELDS: readonly SchemaField[] = [
  field("chat", Messages.src.config.resource.schema.text0011),
  field("command", Messages.src.config.resource.schema.text0012),
  field("anvil", Messages.src.config.resource.schema.text0013),
  field("sign", Messages.src.config.resource.schema.text0014),
  field("book", Messages.src.config.resource.schema.text0015),
];

export const CATEGORY_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("name", Messages.src.config.resource.schema.text0016),
  list("lore", Messages.src.config.resource.schema.text0017),
  field("icon", Messages.src.config.resource.schema.text0018, {
    valueProvider: "item-id",
    snippet: "icon: ${0:minecraft:stone}",
  }),
  field("priority", Messages.src.config.resource.schema.text0019, {
    valueProvider: "number",
    snippet: "priority: ${0:0}",
  }),
  bool("hidden", Messages.src.config.resource.schema.text0020),
  list("conditions", Messages.src.config.resource.schema.text0021, [
    "condition",
  ]),
  field("source", "分类成员来源；支持单个来源或来源列表", {
    snippet: "source:\n  type: ${1|all_items,list,regex|}\n  ${0}",
  }),
  list("list", Messages.src.config.resource.schema.text0022),
  bool("all_items", Messages.src.config.resource.schema.text0023, [
    "all-items",
  ]),
];

const CATEGORY_SOURCE_TYPES = ["all_items", "list", "regex"] as const;
const CATEGORY_SOURCE_COMMON_FIELDS: readonly SchemaField[] = [
  field("type", "分类来源类型", {
    values: CATEGORY_SOURCE_TYPES,
    required: true,
  }),
];
const CATEGORY_SOURCE_FIELDS = new Map<string, readonly SchemaField[]>([
  ["all_items", [bool("ignore_vanilla", "是否排除所有原版物品")]],
  ["list", [list("list", "按原顺序加入的物品或分类成员")]],
  ["regex", [list("regex", "完整匹配物品 ID 的 Java 正则表达式")]],
]);

function categorySourceFields(type: string | undefined): readonly SchemaField[] {
  const local = localRegistryDiscriminator(type);
  if (type && (local === undefined || !CATEGORY_SOURCE_FIELDS.has(local)))
    return [];
  const fields = new Map<string, SchemaField>();
  for (const group of [
    CATEGORY_SOURCE_COMMON_FIELDS,
    local
      ? CATEGORY_SOURCE_FIELDS.get(local)!
      : [...CATEGORY_SOURCE_FIELDS.values()].flat(),
  ])
    for (const candidate of group) fields.set(candidate.semantic, candidate);
  return [...fields.values()];
}

export const CATEGORY_BLOCK_PROPERTY_ENTRY_FIELD: SchemaField = field(
  "<block-property>",
  Messages.src.config.resource.schema.text0024,
  { snippet: "${1:property}: ${0:value}" },
);

const PAINTING_DIMENSIONS = Array.from({ length: 16 }, (_, index) =>
  String(index + 1),
);
const PAINTING_DIMENSION_DETAILS = Object.fromEntries(
  PAINTING_DIMENSIONS.map((value) => [
    value,
    Messages.src.config.resource.schema.text0025(value),
  ]),
);

export const PAINTING_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("width", Messages.src.config.resource.schema.text0026, {
    valueProvider: "number",
    values: PAINTING_DIMENSIONS,
    valueDetails: PAINTING_DIMENSION_DETAILS,
    snippet: "width: ${0:1}",
  }),
  field("height", Messages.src.config.resource.schema.text0027, {
    valueProvider: "number",
    values: PAINTING_DIMENSIONS,
    valueDetails: PAINTING_DIMENSION_DETAILS,
    snippet: "height: ${0:1}",
  }),
  field("asset_id", Messages.src.config.resource.schema.text0028, {
    aliases: ["asset-id"],
    snippet: "asset_id: ${0:namespace:path}",
  }),
  field("title", Messages.src.config.resource.schema.text0029),
  field("author", Messages.src.config.resource.schema.text0030),
  bool("show_in_op_tab", Messages.src.config.resource.schema.text0031, [
    "show-in-op-tab",
  ]),
];

export const SKIP_OPTIMIZATION_FIELDS: readonly SchemaField[] = [
  list("texture", Messages.src.config.resource.schema.text0032),
  list("json", Messages.src.config.resource.schema.text0033),
];

export const ADVANCEMENT_ROOT_FIELDS: readonly SchemaField[] = [
  bool("enable", Messages.src.config.resource.schema.text0034),
  bool("debug", Messages.src.config.resource.schema.text0035),
];

export const BLOCK_STATE_MAPPING_ENTRY_FIELD: SchemaField = field(
  "<source-block-state>",
  Messages.src.config.resource.schema.text0036,
  {
    valueProvider: "block-state",
    required: true,
    snippet:
      '"${1:minecraft:block[property=value]}": ${0:minecraft:block[property=value]}',
  },
);

export const BLOCK_STATE_MAPPING_FIELDS: readonly SchemaField[] = [
  BLOCK_STATE_MAPPING_ENTRY_FIELD,
];

const ENTITY_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  mapping("settings", "实体默认属性和自定义标签"),
];

const ENTITY_SETTINGS_FIELDS: readonly SchemaField[] = [
  mapping("attributes", "原版属性 ID 到默认基础值"),
  list("tags", "实体所属的自定义标签"),
];

const ATTRIBUTE_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("base", "固定值或实体原版属性基础值来源"),
  field("derived", "由其他自定义属性计算的派生表达式"),
  mapping("constraint", "最终属性值限制"),
  list("entities", "适用的实体 ID 或 #实体标签", ["entity"]),
  list("operations", "按顺序执行的属性运算阶段", ["operation"]),
  list("sync", "同步到原版属性的修饰器"),
];

const ATTRIBUTE_BASE_TYPE_FIELD = field("type", "基础值来源类型", {
    values: ["constant", "vanilla", "by_entity_type"],
    required: true,
});
const ATTRIBUTE_BASE_VARIANTS = new Map<string, readonly SchemaField[]>([
  ["constant", [number("value", "constant 基础值")]],
  [
    "vanilla",
    [
      field("attribute", "要读取的原版属性 ID", {
        valueProvider: "attribute",
        required: true,
      }),
      number("fallback", "实体没有该原版属性时的备用值"),
      field("transform", "只使用 value 变量的转换表达式"),
      patterned("update_interval", "重新检查原版属性的 tick 间隔", {
        valueProvider: "number",
      }),
    ],
  ],
  [
    "by_entity_type",
    [
      field("attribute", "要读取的原版属性 ID", {
        valueProvider: "attribute",
        required: true,
      }),
      number("fallback", "实体没有该原版属性时的备用值"),
      field("transform", "只使用 value 变量的转换表达式"),
    ],
  ],
]);

function attributeBaseFields(type: string | undefined): readonly SchemaField[] {
  const local = localRegistryDiscriminator(type);
  if (type && (local === undefined || !ATTRIBUTE_BASE_VARIANTS.has(local)))
    return [];
  const variants = local
    ? ATTRIBUTE_BASE_VARIANTS.get(local)!
    : [...ATTRIBUTE_BASE_VARIANTS.values()].flat();
  const fields = new Map<string, SchemaField>([
    [ATTRIBUTE_BASE_TYPE_FIELD.semantic, ATTRIBUTE_BASE_TYPE_FIELD],
  ]);
  for (const candidate of variants)
    if (!fields.has(candidate.semantic)) fields.set(candidate.semantic, candidate);
  return [...fields.values()];
}

const EXPRESSION_VALUE_FIELDS: readonly SchemaField[] = [
  field("type", "表达式值类型", { values: ["expression"] }),
  field("expression", "Sparrow Expression 表达式", { required: true }),
];

function expressionValueFields(type: string | undefined): readonly SchemaField[] {
  const local = type === undefined ? "expression" : localRegistryDiscriminator(type);
  return local === "expression" ? EXPRESSION_VALUE_FIELDS : [];
}

const ATTRIBUTE_CONSTRAINT_FIELDS: readonly SchemaField[] = [
  number("min", "最终属性值的包含下界"),
  number("max", "最终属性值的包含上界"),
];

const ATTRIBUTE_SYNC_FIELDS: readonly SchemaField[] = [
  field("target", "要同步的原版属性 ID", {
    valueProvider: "attribute",
    required: true,
  }),
  field("operation", "原版属性修饰器运算", {
    values: ["add_value", "add_multiplied_base", "add_multiplied_total"],
    required: true,
  }),
  field("value", "value/base 表达式或 delta/ratio provider"),
];

const ATTRIBUTE_SYNC_VALUE_FIELDS: readonly SchemaField[] = [
  field("type", "同步值 provider 类型", {
    values: ["expression", "delta", "ratio"],
  }),
  field("expression", "可使用 value 和 base 的表达式"),
];

function attributeSyncValueFields(
  type: string | undefined,
): readonly SchemaField[] {
  const local = type === undefined ? "expression" : localRegistryDiscriminator(type);
  if (local === "delta" || local === "ratio") return [ATTRIBUTE_SYNC_VALUE_FIELDS[0]!];
  return local === "expression" ? ATTRIBUTE_SYNC_VALUE_FIELDS : [];
}

const ATTRIBUTE_OPERATION_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("expression", "可使用 base、current 和 amount 的运算表达式", {
    required: true,
  }),
];

const ATTRIBUTE_MODIFIER_FIELDS: readonly SchemaField[] = [
  field("type", "要修改的自定义属性 ID", {
    required: true,
    valueProvider: "custom-attribute",
  }),
  field("id", "唯一属性修饰器 ID", { required: true }),
  numberProvider("amount", "交给属性运算的修饰量", [], true),
  field("operation", "属性运算 ID", {
    required: true,
    valueProvider: "attribute-operation",
  }),
  field("scope", "属性修饰器作用域", {
    values: ["entity", "weapon"],
  }),
  patterned("condition(s)", "修饰器生效条件", {
    snippet: "conditions:\n  - type: ${0}",
  }),
  patterned("update_interval", "动态修饰器重新计算间隔", {
    valueProvider: "number",
  }),
];

const POTION_EFFECT_FIELDS: readonly SchemaField[] = [
  field("type", "药水效果 ID", { valueProvider: "effect", required: true }),
  numberProvider("amplifier", "零起始效果等级"),
  bool("ambient", "使用环境效果外观"),
  bool("particles", "显示药水粒子"),
  patterned("show_icon", "显示客户端 HUD 图标", {
    valueProvider: "boolean",
    values: ["true", "false"],
  }),
  patterned("condition(s)", "维持药水效果的条件", {
    snippet: "conditions:\n  - type: ${0}",
  }),
  patterned("update_interval", "重新检查条件的 tick 间隔", {
    valueProvider: "number",
  }),
];

const EQUIPMENT_SET_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  field("pieces", "装备件数到套装层级的映射", {
    required: true,
    snippet: "pieces:\n  ${1:2}:\n    ${0}",
  }),
];

const EQUIPMENT_SET_TIER_FIELDS: readonly SchemaField[] = [
  list("attribute", "当前层级提供的属性修饰器"),
  patterned("potion_effect(s)", "当前层级维持的药水效果", {
    snippet: "potion_effects:\n  - type: ${0:minecraft:night_vision}",
  }),
  mapping("events", "进入或离开层级时执行的函数"),
];

const EQUIPMENT_SET_EVENT_FIELDS: readonly SchemaField[] = [
  list("activate", "进入当前套装层级时执行的函数"),
  list("deactivate", "离开当前套装层级时执行的函数"),
];

const ATLAS_ROOT_FIELDS: readonly SchemaField[] = [
  ...COMMON_ID_FIELDS,
  patterned("source(s)", "按顺序写入 atlas JSON 的 sprite source", {
    snippet: "sources:\n  - type: ${0:directory}",
  }),
];

const ATLAS_SOURCE_TYPES = [
  "directory",
  "single",
  "filter",
  "unstitch",
  "paletted_permutations",
] as const;
const ATLAS_SOURCE_TYPE_FIELD = field("type", "Minecraft atlas source 类型", {
  values: [
    ...ATLAS_SOURCE_TYPES,
    ...ATLAS_SOURCE_TYPES.map((type) => `minecraft:${type}`),
  ],
  required: true,
});
const ATLAS_SOURCE_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "directory",
    [
      field("source", "贴图目录", { required: true }),
      field("prefix", "生成 sprite ID 的前缀", { required: true }),
    ],
  ],
  [
    "single",
    [
      field("resource", "源贴图资源 ID", {
        valueProvider: "texture",
        required: true,
      }),
      field("sprite", "输出 sprite ID", { valueProvider: "texture" }),
    ],
  ],
  ["filter", [mapping("pattern", "filter 的 namespace/path 正则")]],
  [
    "unstitch",
    [
      field("resource", "源贴图资源 ID", {
        valueProvider: "texture",
        required: true,
      }),
      number("divisor_x", "X 坐标除数"),
      number("divisor_y", "Y 坐标除数"),
      list("region", "输出区域", ["regions"]),
    ],
  ],
  [
    "paletted_permutations",
    [
      list("texture", "基础贴图", ["textures"], true),
      field("palette_key", "关键色板贴图", {
        valueProvider: "texture",
        required: true,
      }),
      field("separator", "基础贴图和 permutation 后缀分隔符"),
      mapping("permutation", "后缀到替换色板贴图的映射", [
        "permutations",
      ]),
    ],
  ],
]);

function atlasSourceFields(type: string | undefined): readonly SchemaField[] {
  const normalized = type?.startsWith("minecraft:")
    ? type.slice("minecraft:".length)
    : type;
  const fields = new Map<string, SchemaField>([
    [ATLAS_SOURCE_TYPE_FIELD.semantic, ATLAS_SOURCE_TYPE_FIELD],
  ]);
  const variants = normalized
    ? (ATLAS_SOURCE_FIELDS.get(normalized) ?? [])
    : [...ATLAS_SOURCE_FIELDS.values()].flat();
  for (const candidate of variants)
    if (!fields.has(candidate.semantic)) fields.set(candidate.semantic, candidate);
  return [...fields.values()];
}

const ATLAS_FILTER_PATTERN_FIELDS: readonly SchemaField[] = [
  field("namespace", "要过滤的 sprite namespace Java 正则"),
  field("path", "要过滤的 sprite path Java 正则"),
];

const ATLAS_REGION_FIELDS: readonly SchemaField[] = [
  field("sprite", "区域输出 sprite ID", { required: true }),
  number("x", "区域左上角 X"),
  number("y", "区域左上角 Y"),
  number("width", "区域宽度"),
  number("height", "区域高度"),
];

const DAMAGE_RULE_FIELDS: readonly SchemaField[] = [
  patterned("target(s)", "该规则适用的实体 ID 或 #实体标签"),
  field("formula", "伤害表达式或结构化伤害公式"),
  patterned("effect(s)", "伤害公式执行后的效果", {
    snippet: "effects:\n  - type: ${0}",
  }),
  patterned("post_effect(s)", "伤害公式执行后的效果别名", {
    snippet: "post_effects:\n  - type: ${0}",
  }),
];

const DAMAGE_FORMULA_TYPE_FIELD = field("type", "伤害公式类型", {
  values: ["expression", "composition", "js"],
});
const DAMAGE_FORMULA_VARIANTS = new Map<string, readonly SchemaField[]>([
  ["expression", [field("expression", "伤害表达式", { required: true })]],
  [
    "composition",
    [
      field("parts", "按顺序求值并相加的命名伤害部分", {
        required: true,
        snippet: "parts:\n  ${0}",
      }),
    ],
  ],
  [
    "js",
    [
      field("script", "script 文件夹下的 JavaScript 文件", {
        required: true,
      }),
      field("function", "调用的 JavaScript 函数；默认 main"),
      mapping("args", "传入 JavaScript 函数的附加参数"),
    ],
  ],
]);

function damageFormulaFields(type: string | undefined): readonly SchemaField[] {
  const local = localRegistryDiscriminator(type);
  if (type && (local === undefined || !DAMAGE_FORMULA_VARIANTS.has(local)))
    return [];
  const fields = new Map<string, SchemaField>([
    [DAMAGE_FORMULA_TYPE_FIELD.semantic, DAMAGE_FORMULA_TYPE_FIELD],
  ]);
  const variants = local
    ? DAMAGE_FORMULA_VARIANTS.get(local)!
    : [...DAMAGE_FORMULA_VARIANTS.values()].flat();
  for (const candidate of variants)
    if (!fields.has(candidate.semantic)) fields.set(candidate.semantic, candidate);
  return [...fields.values()];
}

const DAMAGE_EFFECT_TYPE_FIELD = field("type", "伤害后效果类型", {
    values: ["life_steal", "potion_effect", "function"],
    required: true,
});
const DAMAGE_EFFECT_COMMON_FIELDS: readonly SchemaField[] = [
  DAMAGE_EFFECT_TYPE_FIELD,
  patterned("condition(s)", "运行后效果前检查的条件", {
    snippet: "conditions:\n  - type: ${0}",
  }),
  patterned("function(s)", "后效果完成后运行的通用函数", {
    snippet: "functions:\n  - type: ${0}",
  }),
];
const DAMAGE_EFFECT_VARIANTS = new Map<string, readonly SchemaField[]>([
  [
    "life_steal",
    [
      numberProvider("ratio", "最终伤害转化为治疗的比例"),
      numberProvider("amount", "固定治疗量"),
    ],
  ],
  [
    "potion_effect",
    [
      field("target", "药水效果目标", {
        values: [
          "victim",
          "target",
          "attacker",
          "causing_entity",
          "causing-entity",
          "source",
          "direct_entity",
          "direct-entity",
          "direct",
        ],
      }),
      patterned("potion_effect", "药水效果 ID", {
        valueProvider: "effect",
        required: true,
      }),
      numberProvider("duration", "药水效果持续 tick"),
      numberProvider("amplifier", "零起始药水效果等级"),
      bool("ambient", "环境药水效果外观"),
      bool("particles", "显示药水效果粒子"),
      patterned("show_icon", "显示药水效果 HUD 图标", {
        valueProvider: "boolean",
        values: ["true", "false"],
      }),
    ],
  ],
  ["function", []],
]);

function damageEffectFields(type: string | undefined): readonly SchemaField[] {
  const local = localRegistryDiscriminator(type);
  if (type && (local === undefined || !DAMAGE_EFFECT_VARIANTS.has(local)))
    return [];
  const fields = new Map<string, SchemaField>();
  for (const candidate of DAMAGE_EFFECT_COMMON_FIELDS)
    fields.set(candidate.semantic, candidate);
  const variants = local
    ? DAMAGE_EFFECT_VARIANTS.get(local)!
    : [...DAMAGE_EFFECT_VARIANTS.values()].flat();
  for (const candidate of variants)
    if (!fields.has(candidate.semantic)) fields.set(candidate.semantic, candidate);
  return [...fields.values()];
}

export function resolveMiscResourceSection(
  section: string,
): MiscResourceSection | undefined {
  const suffix = section.indexOf("#");
  const family = getSectionFamily(
    suffix < 0 ? section : section.slice(0, suffix),
  );
  if (!family || !MISC_RESOURCE_SECTIONS.has(family.canonical)) return undefined;
  return family.canonical as MiscResourceSection;
}

function compactIdPath(path: readonly string[]): string[] {
  return path
    .slice(1)
    .filter((part) => !/^\d+$/u.test(part))
    .map((part) => part.replaceAll("-", "_"));
}

export function miscResourceFieldsForContext(
  section: string,
  context: SchemaContext,
): readonly SchemaField[] {
  switch (resolveMiscResourceSection(section)) {
    case "emojis": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, EMOJI_ROOT_FIELDS);
      return withTemplateSchemaFields(
        context.path,
        compact.length === 1 && compact[0] === "content_overrides"
          ? EMOJI_CONTENT_OVERRIDE_FIELDS
          : [],
      );
    }
    case "categories": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, CATEGORY_ROOT_FIELDS);
      if (compact[0] === "source")
        return withTemplateSchemaFields(
          context.path,
          categorySourceFields(context.siblingValues.get("type")),
        );

      const propertyIndex = compact.lastIndexOf("properties");
      if (propertyIndex >= 0) {
  // 属性名本身也可能叫 type, 判断类型时只能使用最近的上级 type
        const owner = resolveFunctionOrConditionType(
          "condition",
          context.ancestorTypes?.[0],
        );
        if (
          owner?.external === false &&
          owner.name === "match_block_property"
        ) {
          return withTemplateSchemaFields(
            context.path,
            propertyIndex === compact.length - 1
              ? [CATEGORY_BLOCK_PROPERTY_ENTRY_FIELD]
              : [],
          );
        }
  // 找到上级 type 后, 不要再套用其他 type 的字段规则
        if (context.ancestorTypes !== undefined)
          return withTemplateSchemaFields(context.path, []);
      }

      return withTemplateSchemaFields(
        context.path,
        compact.some(
          (entry) =>
            entry === "conditions" ||
            entry === "condition" ||
            entry === "terms" ||
            entry === "term",
        )
          ? fieldsForDiscriminator(
              "condition",
              context.siblingValues.get("type"),
            )
          : [],
      );
    }
    case "paintings":
      return compactIdPath(context.path).length === 0
        ? withTemplateSchemaFields(context.path, PAINTING_ROOT_FIELDS)
        : withTemplateSchemaFields(context.path, []);
    case "block-state-mappings":
      return context.path.length === 0 ? BLOCK_STATE_MAPPING_FIELDS : [];
    case "skip-optimization":
      return context.path.length === 0 ? SKIP_OPTIMIZATION_FIELDS : [];
    case "advancements":
      return compactIdPath(context.path).length === 0
        ? ADVANCEMENT_ROOT_FIELDS
        : [];
    case "entities": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, ENTITY_ROOT_FIELDS);
      if (compact.length === 1 && compact[0] === "settings")
        return ENTITY_SETTINGS_FIELDS;
      if (compact.at(-1) === "attributes")
        return [
          field("<attribute>", "原版属性 ID 对应的默认基础值", {
            valueProvider: "number",
          }),
        ];
      return [];
    }
    case "attributes": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, ATTRIBUTE_ROOT_FIELDS);
      const tail = compact.at(-1);
      if (tail === "base")
        return attributeBaseFields(context.siblingValues.get("type"));
      if (tail === "transform")
        return expressionValueFields(context.siblingValues.get("type"));
      if (tail === "constraint") return ATTRIBUTE_CONSTRAINT_FIELDS;
      if (tail === "sync") return ATTRIBUTE_SYNC_FIELDS;
      if (tail === "value")
        return attributeSyncValueFields(context.siblingValues.get("type"));
      if (tail === "derived")
        return expressionValueFields(context.siblingValues.get("type"));
      return [];
    }
    case "attribute-operations":
      return compactIdPath(context.path).length === 0
        ? withTemplateSchemaFields(
            context.path,
            ATTRIBUTE_OPERATION_FIELDS,
          )
        : [];
    case "equipment-sets": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(
          context.path,
          EQUIPMENT_SET_ROOT_FIELDS,
        );
      const tail = compact.at(-1);
      const directTail = context.path.at(-1);
      if (tail === "pieces" && directTail === "pieces")
        return [mapping("<piece-count>", "正整数件数对应的套装层级")];
      if (tail === "pieces") return EQUIPMENT_SET_TIER_FIELDS;
      if (tail === "attribute" || tail === "attributes")
        return ATTRIBUTE_MODIFIER_FIELDS;
      if (tail === "potion_effect" || tail === "potion_effects")
        return POTION_EFFECT_FIELDS;
      if (tail === "events") return EQUIPMENT_SET_EVENT_FIELDS;
      if (tail === "activate" || tail === "deactivate")
        return fieldsForDiscriminator(
          "function",
          context.siblingValues.get("type"),
        );
      const provider = resolveNumberProviderType(context.ancestorTypes?.[0]);
      if (provider && !provider.external && tail) {
        return numberProviderAllowsNestedField(
          context.ancestorTypes?.[0],
          tail,
        )
          ? numberProviderFields(context.siblingValues.get("type"))
          : [];
      }
      return [];
    }
    case "atlases": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, ATLAS_ROOT_FIELDS);
      const tail = compact.at(-1);
      if (tail === "source" || tail === "sources")
        return atlasSourceFields(context.siblingValues.get("type"));
      if (tail === "pattern") return ATLAS_FILTER_PATTERN_FIELDS;
      if (tail === "region" || tail === "regions") return ATLAS_REGION_FIELDS;
      if (tail === "permutation" || tail === "permutations")
        return [
          field("<suffix>", "输出后缀对应的替换色板贴图", {
            valueProvider: "texture",
          }),
        ];
      return [];
    }
    case "damage-rules": {
      const withoutIndexes = context.path.filter(
        (part) => !/^\d+$/u.test(part),
      );
      if (withoutIndexes.length === 0) return [];
      if (withoutIndexes.length === 1) return DAMAGE_RULE_FIELDS;
      const tail = withoutIndexes.at(-1)?.replaceAll("-", "_");
      if (tail === "formula")
        return damageFormulaFields(context.siblingValues.get("type"));
      const partsIndex = withoutIndexes.lastIndexOf("parts");
      if (partsIndex === withoutIndexes.length - 1)
        return [field("<part>", "命名伤害部分的表达式或公式")];
      if (partsIndex >= 0)
        return damageFormulaFields(context.siblingValues.get("type"));
      if (
        tail === "effect" ||
        tail === "effects" ||
        tail === "post_effect" ||
        tail === "post_effects"
      )
        return damageEffectFields(context.siblingValues.get("type"));
      if (tail === "condition" || tail === "conditions")
        return fieldsForDiscriminator(
          "condition",
          context.siblingValues.get("type"),
        );
      if (tail === "function" || tail === "functions")
        return fieldsForDiscriminator(
          "function",
          context.siblingValues.get("type"),
        );
      return [];
    }
    default:
      return [];
  }
}

export function miscResourceSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  if (fields === BLOCK_STATE_MAPPING_FIELDS) {
    return {
      ...BLOCK_STATE_MAPPING_ENTRY_FIELD,
      label: name,
      semantic: name,
      snippet: `"${name}": \${0:minecraft:block[property=value]}`,
    };
  }
  const known = schemaFieldForName(name, fields);
  if (known) return known;
  if (fields.includes(CATEGORY_BLOCK_PROPERTY_ENTRY_FIELD)) {
    return {
      ...CATEGORY_BLOCK_PROPERTY_ENTRY_FIELD,
      label: name,
      semantic: name,
      snippet: `${name}: \${0}`,
    };
  }
  if (
    EMOJI_CONTENT_OVERRIDE_FIELDS.every((candidate) =>
      fields.includes(candidate),
    )
  ) {
    return field(name, Messages.src.config.resource.schema.text0037);
  }
  const placeholder = fields.find((candidate) =>
    /^<[^>]+>$/u.test(candidate.label),
  );
  if (placeholder)
    return {
      ...placeholder,
      label: name,
      semantic: name,
      aliases: [],
      snippet: `${name}: \${0}`,
    };
  return undefined;
}

export function miscResourceListItemField(
  section: string,
  path: readonly string[],
): SchemaField | undefined {
  const resolved = resolveMiscResourceSection(section);
  if (resolved === "skip-optimization") {
    const directTail = path
      .filter((part) => !/^\d+$/u.test(part))
      .at(-1)
      ?.replaceAll("-", "_");
    if (directTail === "texture" || directTail === "json") {
      return field(
        "path",
        directTail === "texture"
          ? Messages.src.config.resource.schema.text0038
          : Messages.src.config.resource.schema.text0039,
      );
    }
    return undefined;
  }
  const tail = compactIdPath(path).at(-1);
  switch (resolved) {
    case "emojis":
      if (tail === "keywords")
        return field("keyword", Messages.src.config.resource.schema.text0040, {
          required: true,
        });
      if (tail === "content" || tail === "format") {
        return field("content", Messages.src.config.resource.schema.text0041);
      }
      return undefined;
    case "categories":
      if (tail === "lore")
        return field("lore", Messages.src.config.resource.schema.text0042);
      if (tail === "list")
        return field(
          "item-or-category",
          Messages.src.config.resource.schema.text0043,
          {
            valueProvider: "item-id",
          },
        );
      if (tail === "regex")
        return field("regex", "完整匹配物品 ID 的 Java 正则表达式");
      if (
        tail === "conditions" ||
        tail === "condition" ||
        tail === "terms" ||
        tail === "term"
      ) {
        return fieldsForDiscriminator("condition", undefined).find(
          (candidate) => candidate.label === "type",
        );
      }
      return undefined;
    case "attributes":
      if (tail === "entities")
        return field("entity", "实体 ID 或 #实体标签", {
          valueProvider: "entity-type",
        });
      if (tail === "operations")
        return field("operation", "属性运算 ID", {
          valueProvider: "attribute-operation",
        });
      if (tail === "sync") return ATTRIBUTE_SYNC_FIELDS[0];
      return undefined;
    case "equipment-sets":
      if (tail === "attribute" || tail === "attributes")
        return ATTRIBUTE_MODIFIER_FIELDS[0];
      if (tail === "potion_effect" || tail === "potion_effects")
        return POTION_EFFECT_FIELDS[0];
      if (tail === "activate" || tail === "deactivate")
        return field("type", "通用函数类型", {
          valueProvider: "function-type",
        });
      return undefined;
    case "atlases":
      if (tail === "source" || tail === "sources")
        return ATLAS_SOURCE_TYPE_FIELD;
      if (tail === "region" || tail === "regions")
        return ATLAS_REGION_FIELDS[0];
      if (tail === "texture" || tail === "textures")
        return field("texture", "基础贴图资源 ID", {
          valueProvider: "texture",
        });
      return undefined;
    case "damage-rules": {
      const directTail = path
        .filter((part) => !/^\d+$/u.test(part))
        .at(-1)
        ?.replaceAll("-", "_");
      if (
        directTail === "effect" ||
        directTail === "effects" ||
        directTail === "post_effect" ||
        directTail === "post_effects"
      )
        return DAMAGE_EFFECT_TYPE_FIELD;
      if (directTail === "condition" || directTail === "conditions")
        return field("type", "通用条件类型", {
          valueProvider: "condition-type",
        });
      if (directTail === "function" || directTail === "functions")
        return field("type", "通用函数类型", {
          valueProvider: "function-type",
        });
      return undefined;
    }
    default:
      return undefined;
  }
}

export function miscResourceDynamicKeyField(
  section: string,
  path: readonly string[],
): SchemaField | undefined {
  switch (resolveMiscResourceSection(section)) {
    case "block-state-mappings":
      return path.length === 0
        ? field(
            "source-block-state",
            Messages.src.config.resource.schema.text0044,
            { valueProvider: "block-state", required: true },
          )
        : undefined;
    case "damage-rules":
      return path.length === 0
        ? field("damage-source", "伤害来源 ID", {
            valueProvider: "damage-type",
            snippet: "${1:minecraft:player_attack}:\n  - formula: ${0:damage}",
          })
        : undefined;
    case "entities":
      return path.slice(1).map((part) => part.replaceAll("-", "_")).join(".") ===
        "settings.attributes"
        ? field("attribute", "原版属性 ID", { valueProvider: "attribute" })
        : undefined;
    case "equipment-sets":
      return path.length === 2 && path[1] === "pieces"
        ? field("piece-count", "正整数装备件数", { valueProvider: "number" })
        : undefined;
    case "atlases":
      return compactIdPath(path).at(-1) === "permutations"
        ? field("suffix", "输出贴图后缀")
        : undefined;
    default:
      return undefined;
  }
}

export function miscResourceDynamicValueField(
  section: string,
  path: readonly string[],
  sourceState: string,
): SchemaField | undefined {
  switch (resolveMiscResourceSection(section)) {
    case "block-state-mappings":
      return path.length === 0
        ? field(sourceState, Messages.src.config.resource.schema.text0045, {
            valueProvider: "block-state",
            required: true,
          })
        : undefined;
    case "entities":
      return path.slice(1).map((part) => part.replaceAll("-", "_")).join(".") ===
        "settings.attributes"
        ? number(sourceState, "原版属性默认基础值")
        : undefined;
    case "atlases":
      return compactIdPath(path).at(-1) === "permutations"
        ? field(sourceState, "替换色板贴图", { valueProvider: "texture" })
        : undefined;
    default:
      return undefined;
  }
}
