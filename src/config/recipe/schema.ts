import {
  CONDITION_TYPES,
  FUNCTION_TYPES,
  fieldsForDiscriminator,
  itemDataDynamicKeyField,
  itemDataDynamicValueField,
  itemDataListItemField,
  itemFieldsForContext,
} from "../item/schema.js";
import { withTemplateSchemaFields } from "../schema/templateFields.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { schemaFieldForName } from "../schema/types.js";
import {
  DATA_COMPONENT_DEFINITIONS,
  dataComponentDefinition,
  dataComponentDynamicEntry,
  dataComponentListItemField,
  dataComponentPathContext,
  dataComponentValueField,
} from "../item/dataComponents.js";
import { Messages } from "../../messages.js";
import {
  isRegistryDiscriminatorSyntax,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";

interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly registry?: string;
  readonly required?: boolean;
}

export interface RecipeSchemaContext extends SchemaContext {
  readonly recipeType?: string;
  readonly recipeHasExplicitResult?: boolean;
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
    ...(options.registry === undefined ? {} : { registry: options.registry }),
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
      true: Messages.src.config.recipe.schema.text0001,
      false: Messages.src.config.recipe.schema.text0002,
    },
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

export const RECIPE_TYPES = [
  "shaped",
  "crafting_shaped",
  "shaped_transform",
  "shapeless",
  "crafting_shapeless",
  "shapeless_transform",
  "dye",
  "crafting_dye",
  "smelting",
  "blasting",
  "smoking",
  "campfire_cooking",
  "stonecutting",
  "smithing_transform",
  "smithing_trim",
  "brewing",
] as const;

export const RECIPE_TYPE_DETAILS: Readonly<
  Record<(typeof RECIPE_TYPES)[number], string>
> = {
  shaped: Messages.src.config.recipe.schema.text0003,
  crafting_shaped: Messages.src.config.recipe.schema.text0004,
  shaped_transform: Messages.src.config.recipe.schema.text0005,
  shapeless: Messages.src.config.recipe.schema.text0006,
  crafting_shapeless: Messages.src.config.recipe.schema.text0007,
  shapeless_transform: Messages.src.config.recipe.schema.text0008,
  dye: Messages.src.config.recipe.schema.text0009,
  crafting_dye: Messages.src.config.recipe.schema.text0010,
  smelting: Messages.src.config.recipe.schema.text0011,
  blasting: Messages.src.config.recipe.schema.text0012,
  smoking: Messages.src.config.recipe.schema.text0013,
  campfire_cooking: Messages.src.config.recipe.schema.text0014,
  stonecutting: Messages.src.config.recipe.schema.text0015,
  smithing_transform: Messages.src.config.recipe.schema.text0016,
  smithing_trim: Messages.src.config.recipe.schema.text0017,
  brewing: Messages.src.config.recipe.schema.text0018,
};

  // 外部插件可以添加配方类型, 不要检查没见过类型里的字段
export function normalizeRecipeType(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(":");
  switch (
    separator < 0
      ? value
      : value.slice(0, separator) === "minecraft"
        ? value.slice(separator + 1)
        : undefined
  ) {
    case "shaped":
    case "crafting_shaped":
      return "shaped";
    case "shaped_transform":
      return "shaped_transform";
    case "shapeless":
    case "crafting_shapeless":
      return "shapeless";
    case "shapeless_transform":
      return "shapeless_transform";
    case "dye":
    case "crafting_dye":
      return "dye";
    case "smelting":
    case "blasting":
    case "smoking":
    case "campfire_cooking":
      return "cooking";
    case "stonecutting":
    case "smithing_transform":
    case "smithing_trim":
    case "brewing":
      return separator < 0 ? value : value.slice(separator + 1);
    default:
      return undefined;
  }
}

export const INGREDIENT_PREDICATE_TYPES = [
  "enchantment",
  "all_of",
  "exact",
] as const;
export const INGREDIENT_PREDICATE_TYPE_DETAILS: Readonly<
  Record<(typeof INGREDIENT_PREDICATE_TYPES)[number], string>
> = {
  enchantment: Messages.src.config.recipe.schema.text0019,
  all_of: Messages.src.config.recipe.schema.text0020,
  exact: Messages.src.config.recipe.schema.text0021,
};

export const RESULT_POST_PROCESSOR_TYPES = ["apply_data"] as const;
export const RESULT_POST_PROCESSOR_TYPE_DETAILS: Readonly<
  Record<(typeof RESULT_POST_PROCESSOR_TYPES)[number], string>
> = {
  apply_data: Messages.src.config.recipe.schema.text0022,
};

export const TRANSFORM_PROCESSOR_TYPES = [
  "keep_components",
  "keep_tags",
  "keep_custom_data",
  "merge_enchantments",
  "apply_data",
] as const;
export const TRANSFORM_PROCESSOR_TYPE_DETAILS: Readonly<
  Record<(typeof TRANSFORM_PROCESSOR_TYPES)[number], string>
> = {
  keep_components: Messages.src.config.recipe.schema.text0023,
  keep_tags: Messages.src.config.recipe.schema.text0024,
  keep_custom_data: Messages.src.config.recipe.schema.text0025,
  merge_enchantments: Messages.src.config.recipe.schema.text0026,
  apply_data: Messages.src.config.recipe.schema.text0027,
};

export const CRAFTING_RECIPE_CATEGORIES = [
  "building",
  "redstone",
  "equipment",
  "misc",
] as const;
export const COOKING_RECIPE_CATEGORIES = ["food", "blocks", "misc"] as const;

export type RecipeDiscriminatorRegistry =
  | "recipe"
  | "ingredient-predicate"
  | "result-post-processor"
  | "transform-processor"
  | "function"
  | "condition";

export type RecipeDiscriminatorResolution = Readonly<{
  readonly kind: "missing" | "known" | "owned-unknown" | "external" | "invalid";
  readonly name?: string;
}>;

export function resolveRecipeDiscriminator(
  registry: RecipeDiscriminatorRegistry,
  value: string | undefined,
): RecipeDiscriminatorResolution {
  if (!value) return { kind: "missing" };
  let namespace: "craftengine" | "minecraft";
  let values: readonly string[];
  switch (registry) {
    case "recipe":
      namespace = "minecraft";
      values = RECIPE_TYPES;
      break;
    case "ingredient-predicate":
      namespace = "craftengine";
      values = INGREDIENT_PREDICATE_TYPES;
      break;
    case "result-post-processor":
      namespace = "craftengine";
      values = RESULT_POST_PROCESSOR_TYPES;
      break;
    case "transform-processor":
      namespace = "craftengine";
      values = TRANSFORM_PROCESSOR_TYPES;
      break;
    case "function":
      namespace = "craftengine";
      values = FUNCTION_TYPES;
      break;
    case "condition":
      namespace = "craftengine";
      values = CONDITION_TYPES;
      break;
  }
  const raw =
    registry === "condition" && value.startsWith("!") ? value.slice(1) : value;
  if (!raw) return { kind: "invalid" };

  if (values.includes(raw)) return { kind: "known", name: raw };
  if (!isRegistryDiscriminatorSyntax(raw, namespace))
    return { kind: "external", name: raw };
  const local = localRegistryDiscriminator(raw, namespace);
  if (local === undefined) return { kind: "invalid" };
  if (!values.includes(local)) return { kind: "owned-unknown", name: local };
  return { kind: "known", name: local };
}

const COMMON_RECIPE_FIELDS: readonly SchemaField[] = [
  field("type", Messages.src.config.recipe.schema.text0028, {
    values: RECIPE_TYPES,
    valueDetails: RECIPE_TYPE_DETAILS,
    required: true,
  }),
  bool("show_notification", Messages.src.config.recipe.schema.text0029, [
    "show-notification",
  ]),
  bool(
    "unlock_on_ingredient_obtained",
    Messages.src.config.recipe.schema.text0030,
    ["unlock-on-ingredient-obtained"],
  ),
  bool("unlock_on_join", Messages.src.config.recipe.schema.text0031, [
    "unlock-on-join",
  ]),
  bool("enable", Messages.src.config.recipe.schema.text0032),
  bool("debug", Messages.src.config.recipe.schema.text0033),
];

const CRAFTING_CATEGORY = field(
  "category",
  Messages.src.config.recipe.schema.text0034,
  {
    values: CRAFTING_RECIPE_CATEGORIES,
    valueDetails: {
      building: Messages.src.config.recipe.schema.text0035,
      redstone: Messages.src.config.recipe.schema.text0036,
      equipment: Messages.src.config.recipe.schema.text0037,
      misc: Messages.src.config.recipe.schema.text0038,
    },
  },
);
const GROUP = field("group", Messages.src.config.recipe.schema.text0043);
const CONDITIONS = list(
  "conditions",
  Messages.src.config.recipe.schema.text0044,
  ["condition"],
);
const FUNCTIONS = list(
  "functions",
  Messages.src.config.recipe.schema.text0045,
  ["function"],
);
const RESULT = field("result", Messages.src.config.recipe.schema.text0046, {
  valueProvider: "item-id",
  required: true,
  snippet: "result:\n  id: ${0}",
});
const VISUAL_RESULT = field(
  "visual_result",
  Messages.src.config.recipe.schema.text0048,
  {
    aliases: ["visual-result"],
    valueProvider: "item-id",
    snippet: "visual_result:\n  id: ${0}",
  },
);
const ALWAYS_REBUILD = bool(
  "always_rebuild_result",
  Messages.src.config.recipe.schema.text0049,
  ["always-rebuild-result"],
);
const INGREDIENTS = field(
  "ingredients",
  Messages.src.config.recipe.schema.text0050,
  {
    aliases: ["ingredient"],
    required: true,
    snippet: "ingredients:\n  ${0}",
  },
);
const SINGLE_INGREDIENT = field(
  "ingredient",
  Messages.src.config.recipe.schema.text0051,
  {
    aliases: ["ingredients"],
    valueProvider: "item-id",
    required: true,
    snippet: "ingredient: ${0}",
  },
);
const TRANSFORM_PROCESSORS = list(
  "transform_processors",
  Messages.src.config.recipe.schema.text0052,
  ["transform-processors", "post_processors", "post-processors"],
);
const MERGE_COMPONENTS = bool(
  "merge_components",
  Messages.src.config.recipe.schema.text0053,
  ["merge-components"],
);

const RECIPE_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "shaped",
    [
      field("pattern", Messages.src.config.recipe.schema.text0054, {
        required: true,
        snippet: 'pattern:\n  - "${1:AAA}"\n  - "${2: B }"\n  - "${0: B }"',
      }),
      INGREDIENTS,
      RESULT,
      CRAFTING_CATEGORY,
      GROUP,
      VISUAL_RESULT,
      CONDITIONS,
      FUNCTIONS,
      ALWAYS_REBUILD,
    ],
  ],
  [
    "shaped_transform",
    [
      field("pattern", Messages.src.config.recipe.schema.text0055, {
        required: true,
        snippet: 'pattern:\n  - "${1:A}"\n  - "${0:B}"',
      }),
      INGREDIENTS,
      RESULT,
      CRAFTING_CATEGORY,
      GROUP,
      VISUAL_RESULT,
      CONDITIONS,
      FUNCTIONS,
      MERGE_COMPONENTS,
      TRANSFORM_PROCESSORS,
    ],
  ],
  [
    "shapeless",
    [
      INGREDIENTS,
      RESULT,
      CRAFTING_CATEGORY,
      GROUP,
      VISUAL_RESULT,
      CONDITIONS,
      FUNCTIONS,
      ALWAYS_REBUILD,
    ],
  ],
  [
    "shapeless_transform",
    [
      INGREDIENTS,
      RESULT,
      CRAFTING_CATEGORY,
      GROUP,
      VISUAL_RESULT,
      CONDITIONS,
      FUNCTIONS,
      MERGE_COMPONENTS,
      TRANSFORM_PROCESSORS,
    ],
  ],
  [
    "dye",
    [
      field("target", Messages.src.config.recipe.schema.text0056, {
        valueProvider: "item-id",
        required: true,
      }),
      field("dye", Messages.src.config.recipe.schema.text0057, {
        valueProvider: "item-id",
        required: true,
      }),
      field("result", Messages.src.config.recipe.schema.text0047, {
        valueProvider: "item-id",
        snippet: "result:\n  id: ${0}",
      }),
      CRAFTING_CATEGORY,
      GROUP,
      CONDITIONS,
      FUNCTIONS,
      ALWAYS_REBUILD,
    ],
  ],
  [
    "cooking",
    [
      SINGLE_INGREDIENT,
      RESULT,
      number("time", Messages.src.config.recipe.schema.text0058),
      number("exp", Messages.src.config.recipe.schema.text0059, ["experience"]),
      field("category", Messages.src.config.recipe.schema.text0039, {
        values: COOKING_RECIPE_CATEGORIES,
        valueDetails: {
          food: Messages.src.config.recipe.schema.text0040,
          blocks: Messages.src.config.recipe.schema.text0041,
          misc: Messages.src.config.recipe.schema.text0042,
        },
      }),
      GROUP,
      CONDITIONS,
    ],
  ],
  ["stonecutting", [SINGLE_INGREDIENT, RESULT, GROUP, CONDITIONS, FUNCTIONS]],
  [
    "smithing_transform",
    [
      field("template_type", Messages.src.config.recipe.schema.text0060, {
        aliases: ["template-type"],
        valueProvider: "item-id",
      }),
      field("base", Messages.src.config.recipe.schema.text0061, {
        valueProvider: "item-id",
        required: true,
      }),
      field("addition", Messages.src.config.recipe.schema.text0062, {
        valueProvider: "item-id",
      }),
      RESULT,
      VISUAL_RESULT,
      MERGE_COMPONENTS,
      TRANSFORM_PROCESSORS,
      CONDITIONS,
      FUNCTIONS,
    ],
  ],
  [
    "smithing_trim",
    [
      field("template_type", Messages.src.config.recipe.schema.text0063, {
        aliases: ["template-type"],
        valueProvider: "item-id",
        required: true,
      }),
      field("base", Messages.src.config.recipe.schema.text0064, {
        valueProvider: "item-id",
        required: true,
      }),
      field("addition", Messages.src.config.recipe.schema.text0065, {
        valueProvider: "item-id",
        required: true,
      }),
      field("pattern", Messages.src.config.recipe.schema.text0066, {
        valueProvider: "registry",
        registry: "minecraft:trim_pattern",
        required: true,
      }),
      CONDITIONS,
      FUNCTIONS,
    ],
  ],
  [
    "brewing",
    [
      // CE: ingredient(s)|reagent / result|output / container|input
      field("ingredient", Messages.src.config.recipe.schema.text0051, {
        aliases: ["ingredients", "reagent"],
        valueProvider: "item-id",
        required: true,
        snippet: "ingredient: ${0}",
      }),
      field("container", Messages.src.config.recipe.schema.text0067, {
        aliases: ["input"],
        valueProvider: "item-id",
        required: true,
      }),
      field("result", Messages.src.config.recipe.schema.text0046, {
        aliases: ["output"],
        valueProvider: "item-id",
        required: true,
        snippet: "result:\n  id: ${0}",
      }),
    ],
  ],
]);

export const INGREDIENT_FIELDS: readonly SchemaField[] = [
  field("items", Messages.src.config.recipe.schema.text0068, {
    aliases: ["item"],
    valueProvider: "item-id",
    required: true,
    snippet: "items:\n  - ${0}",
  }),
  number("count", Messages.src.config.recipe.schema.text0069),
  field("predicate", Messages.src.config.recipe.schema.text0070, {
    snippet: "predicate:\n  type: ${0}",
  }),
];
const INGREDIENT_SOURCE = bool(
  "source",
  Messages.src.config.recipe.schema.text0071,
);

const INGREDIENT_PREDICATE_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.recipe.schema.text0072, {
    values: INGREDIENT_PREDICATE_TYPES,
    valueDetails: INGREDIENT_PREDICATE_TYPE_DETAILS,
    required: true,
  }),
];
const INGREDIENT_PREDICATE_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "enchantment",
    [
      field("enchantments", Messages.src.config.recipe.schema.text0073, {
        snippet: "enchantments:\n  ${0}",
      }),
    ],
  ],
  ["all_of", [list("predicates", Messages.src.config.recipe.schema.text0074)]],
  [
    "exact",
    [
      field("component", Messages.src.config.recipe.schema.text0075, {
        valueProvider: "component",
        required: true,
      }),
      field("value", Messages.src.config.recipe.schema.text0076, {
        required: true,
      }),
    ],
  ],
]);

export const RESULT_FIELDS: readonly SchemaField[] = [
  field("id", Messages.src.config.recipe.schema.text0077, {
    valueProvider: "item-id",
    required: true,
  }),
  number("count", Messages.src.config.recipe.schema.text0078),
  list("post_processors", Messages.src.config.recipe.schema.text0079, [
    "transform_processors",
    "transform-processors",
    "post-processors",
  ]),
];

const RESULT_POST_PROCESSOR_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.recipe.schema.text0080, {
    values: RESULT_POST_PROCESSOR_TYPES,
    valueDetails: RESULT_POST_PROCESSOR_TYPE_DETAILS,
    required: true,
  }),
];
const RESULT_POST_PROCESSOR_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "apply_data",
    [
      field("data", Messages.src.config.recipe.schema.text0081, {
        required: true,
        snippet: "data:\n  ${0}",
      }),
    ],
  ],
]);

const TRANSFORM_PROCESSOR_COMMON: readonly SchemaField[] = [
  field("type", Messages.src.config.recipe.schema.text0082, {
    values: TRANSFORM_PROCESSOR_TYPES,
    valueDetails: TRANSFORM_PROCESSOR_TYPE_DETAILS,
    required: true,
  }),
];
const TRANSFORM_PROCESSOR_FIELDS = new Map<string, readonly SchemaField[]>([
  [
    "keep_components",
    [list("components", Messages.src.config.recipe.schema.text0083, [], true)],
  ],
  [
    "keep_tags",
    [list("tags", Messages.src.config.recipe.schema.text0084, [], true)],
  ],
  [
    "keep_custom_data",
    [list("tags", Messages.src.config.recipe.schema.text0085, ["paths"], true)],
  ],
  ["merge_enchantments", []],
  [
    "apply_data",
    [
      field("data", Messages.src.config.recipe.schema.text0086, {
        required: true,
        snippet: "data:\n  ${0}",
      }),
    ],
  ],
]);

function merged(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const result = new Map<string, SchemaField>();
  for (const group of groups)
    for (const candidate of group) result.set(candidate.semantic, candidate);
  return [...result.values()];
}

function typedFields(
  common: readonly SchemaField[],
  variants: ReadonlyMap<string, readonly SchemaField[]>,
  type: string | undefined,
  registry: Extract<
    RecipeDiscriminatorRegistry,
    "ingredient-predicate" | "result-post-processor" | "transform-processor"
  >,
): readonly SchemaField[] {
  const resolved = resolveRecipeDiscriminator(registry, type);
  if (resolved.kind === "external" || resolved.kind === "owned-unknown")
    return [];
  return merged(
    common,
    resolved.kind === "known" ? (variants.get(resolved.name ?? "") ?? []) : [],
  );
}

function normalizedPath(path: readonly string[]): string[] {
  return path.slice(1).map((part) => part.replaceAll("-", "_"));
}

function compactPath(path: readonly string[]): string[] {
  return normalizedPath(path).filter((part) => !/^\d+$/u.test(part));
}

function isProcessorSegment(value: string): boolean {
  return value === "transform_processors" || value === "post_processors";
}

function itemSchemaAncestorTypes(types: readonly string[]): readonly string[] {
  return types.filter((type) => normalizeRecipeType(type) === undefined);
}

export function recipeItemDataContext(
  context: RecipeSchemaContext,
): SchemaContext | undefined {
  const nested = normalizedPath(context.path);
  const processorIndex = nested.findIndex(isProcessorSegment);
  if (processorIndex < 0) return undefined;
  const dataIndex = nested.indexOf("data", processorIndex + 1);
  if (dataIndex < 0) return undefined;
  const dataPath = nested.slice(dataIndex + 1);
  const rawProcessor = dataPath[0];
  if (rawProcessor !== undefined) {
    const localProcessor = localRegistryDiscriminator(
      rawProcessor,
      "craftengine",
    );
    if (localProcessor !== undefined)
      dataPath[0] = localProcessor.replace(/#.*$/u, "");
  }
  return {
    path: ["inline:recipe-result", "data", ...dataPath],
    siblingValues: context.siblingValues,
    ...(context.ancestorTypes === undefined
      ? {}
      : { ancestorTypes: itemSchemaAncestorTypes(context.ancestorTypes) }),
  };
}

function nearestKnownDiscriminator(
  context: RecipeSchemaContext,
  registry: Exclude<RecipeDiscriminatorRegistry, "recipe">,
): RecipeDiscriminatorResolution | undefined {
  const compact = compactPath(context.path);
  const tail = compact.at(-1);
  const direct = (
    registry === "function"
      ? tail === "functions" || tail === "function"
      : registry === "condition"
        ? tail === "conditions" ||
          tail === "condition" ||
          tail === "terms" ||
          tail === "term"
        : registry === "ingredient-predicate"
          ? tail === "predicate" || tail === "predicates"
          : tail === "post_processors" || tail === "transform_processors"
  )
    ? context.siblingValues.get("type")
    : undefined;
  if (direct !== undefined) {
    const resolved = resolveRecipeDiscriminator(registry, direct);
    if (
      resolved.kind === "known" ||
      resolved.kind === "external" ||
      resolved.kind === "owned-unknown"
    )
      return resolved;
  }
  // 不要使用更外层的配方类型, 否则会把内部字段当成外部插件数据
  for (const type of itemSchemaAncestorTypes(context.ancestorTypes ?? [])) {
    const resolved = resolveRecipeDiscriminator(registry, type);
    if (
      resolved.kind === "known" ||
      resolved.kind === "external" ||
      resolved.kind === "owned-unknown"
    )
      return resolved;
  }
  return undefined;
}

export function recipeExternalDiscriminatorSubtree(
  context: RecipeSchemaContext,
): boolean {
  const opaque = (
    resolution: RecipeDiscriminatorResolution | undefined,
  ): boolean =>
    resolution?.kind === "external" || resolution?.kind === "owned-unknown";
  const compact = compactPath(context.path);
  const first = compact[0];
  if (first === "conditions" || first === "condition") {
    return opaque(nearestKnownDiscriminator(context, "condition"));
  }
  if (first === "functions" || first === "function") {
    return opaque(
      nearestKnownDiscriminator(
        context,
        compact.some((part) =>
          ["conditions", "condition", "terms", "term"].includes(part),
        )
          ? "condition"
          : "function",
      ),
    );
  }
  if (
    Math.max(
      compact.lastIndexOf("predicate"),
      compact.lastIndexOf("predicates"),
    ) >= 0
  ) {
    return opaque(nearestKnownDiscriminator(context, "ingredient-predicate"));
  }
  if (compact.findIndex(isProcessorSegment) >= 0) {
    return opaque(
      nearestKnownDiscriminator(
        context,
        first === "result" || first === "visual_result" || first === "target"
          ? "result-post-processor"
          : "transform-processor",
      ),
    );
  }
  return false;
}

  // 游戏原生数据和插件数据格式不固定, 不要检查没见过的字段
export function recipeOpaqueSubtree(context: RecipeSchemaContext): boolean {
  const compact = compactPath(context.path);
  const predicateIndex = Math.max(
    compact.lastIndexOf("predicate"),
    compact.lastIndexOf("predicates"),
  );
  if (
    predicateIndex >= 0 &&
    compact.slice(predicateIndex + 1).includes("value")
  ) {
    return (
      nearestKnownDiscriminator(context, "ingredient-predicate")?.name ===
      "exact"
    );
  }

  const itemData = recipeItemDataContext(context);
  if (!itemData) return false;
  const dataPath = itemData.path
    .slice(1)
    .map((part) => part.replaceAll("-", "_"));
  if (["tags", "nbt", "pdc"].includes(dataPath[1] ?? "")) return true;
  const component = dataComponentPathContext(itemData.path);
  return (
    component?.componentId !== undefined &&
    dataComponentDefinition(component.componentId)?.kind === "opaque"
  );
}

function fieldsWithRequiredType(
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  return fields.map((candidate) =>
    candidate.semantic === "type"
      ? { ...candidate, required: true }
      : candidate,
  );
}

function commonConditionFields(
  context: RecipeSchemaContext,
  nested: readonly string[],
): readonly SchemaField[] {
  const compact = nested.filter((part) => !/^\d+$/u.test(part));
  const conditionIndex = Math.max(
    compact.lastIndexOf("conditions"),
    compact.lastIndexOf("condition"),
    compact.lastIndexOf("terms"),
    compact.lastIndexOf("term"),
  );
  const directType =
    conditionIndex >= 0 && conditionIndex === compact.length - 1
      ? context.siblingValues.get("type")
      : undefined;
  const resolved =
    directType === undefined
      ? (itemSchemaAncestorTypes(context.ancestorTypes ?? [])
          .map((type) => resolveRecipeDiscriminator("condition", type))
          .find(
            (candidate) =>
              candidate.kind === "known" ||
              candidate.kind === "external" ||
              candidate.kind === "owned-unknown",
          ) ?? resolveRecipeDiscriminator("condition", undefined))
      : resolveRecipeDiscriminator("condition", directType);
  if (resolved.kind === "external" || resolved.kind === "owned-unknown")
    return [];
  if (resolved.kind !== "known") {
    return fieldsWithRequiredType(
      fieldsForDiscriminator("condition", undefined),
    ).filter((candidate) => candidate.semantic === "type");
  }
  const firstConditionIndex = nested.findIndex((part) =>
    ["conditions", "condition", "terms", "term"].includes(part),
  );
  return fieldsWithRequiredType(
    itemFieldsForContext({
      path: [
        "inline:recipe-condition",
        "events",
        "right_click",
        "functions",
        "0",
        "conditions",
        ...(firstConditionIndex < 0
          ? []
          : nested.slice(firstConditionIndex + 1)),
      ],
      siblingValues: context.siblingValues,
      ...(context.ancestorTypes === undefined
        ? {}
        : { ancestorTypes: itemSchemaAncestorTypes(context.ancestorTypes) }),
    }),
  );
}

function commonFunctionFields(
  context: RecipeSchemaContext,
  nested: readonly string[],
): readonly SchemaField[] {
  const compact = nested.filter((part) => !/^\d+$/u.test(part));
  const functionIndex = Math.max(
    compact.lastIndexOf("functions"),
    compact.lastIndexOf("function"),
  );
  const directType =
    functionIndex >= 0 && functionIndex === compact.length - 1
      ? context.siblingValues.get("type")
      : undefined;
  const resolved =
    directType === undefined
      ? (itemSchemaAncestorTypes(context.ancestorTypes ?? [])
          .map((type) => resolveRecipeDiscriminator("function", type))
          .find(
            (candidate) =>
              candidate.kind === "known" ||
              candidate.kind === "external" ||
              candidate.kind === "owned-unknown",
          ) ?? resolveRecipeDiscriminator("function", undefined))
      : resolveRecipeDiscriminator("function", directType);
  if (resolved.kind === "external" || resolved.kind === "owned-unknown")
    return [];
  if (resolved.kind !== "known") {
    return fieldsWithRequiredType(
      fieldsForDiscriminator("function", undefined),
    ).filter((candidate) => candidate.semantic === "type");
  }
  const firstFunctionIndex = nested.findIndex(
    (part) => part === "functions" || part === "function",
  );
  return fieldsWithRequiredType(
    itemFieldsForContext({
      path: [
        "inline:recipe-function",
        "events",
        "right_click",
        "functions",
        ...(firstFunctionIndex < 0 ? [] : nested.slice(firstFunctionIndex + 1)),
      ],
      siblingValues: context.siblingValues,
      ...(context.ancestorTypes === undefined
        ? {}
        : { ancestorTypes: itemSchemaAncestorTypes(context.ancestorTypes) }),
    }),
  );
}

function dyeTargetFields(
  context: RecipeSchemaContext,
  recipeType: string | undefined,
): readonly SchemaField[] {
  if (
    normalizeRecipeType(recipeType) !== "dye" ||
    context.recipeHasExplicitResult === true
  )
    return INGREDIENT_FIELDS;
  return merged(
    INGREDIENT_FIELDS,
    RESULT_FIELDS.map((candidate) => {
      if (candidate.label === "id")
        return {
          ...candidate,
          required: context.recipeHasExplicitResult === false,
          detail: Messages.src.config.recipe.schema.text0087,
        };
      if (candidate.label === "count")
        return {
          ...candidate,
          detail: Messages.src.config.recipe.schema.text0088,
        };
      return candidate;
    }),
  );
}

export function recipeFieldsForContext(
  context: RecipeSchemaContext,
): readonly SchemaField[] {
  const nested = normalizedPath(context.path);
  const compact = compactPath(context.path);
  const recipeType =
    context.recipeType ??
    (nested.length === 0 ? context.siblingValues.get("type") : undefined);
  const normalizedRecipeType = normalizeRecipeType(recipeType);

  if (nested.length === 0) {
    if (!recipeType)
      return withTemplateSchemaFields(context.path, COMMON_RECIPE_FIELDS);
    return withTemplateSchemaFields(
      context.path,
      merged(
        COMMON_RECIPE_FIELDS,
        RECIPE_FIELDS.get(normalizedRecipeType ?? "") ?? [],
      ),
    );
  }
  if (
    recipeOpaqueSubtree(context) ||
    recipeExternalDiscriminatorSubtree(context)
  )
    return withTemplateSchemaFields(context.path, []);

  const itemData = recipeItemDataContext(context);
  if (itemData)
    return withTemplateSchemaFields(
      context.path,
      itemFieldsForContext(itemData),
    );
  if (recipeFunctionDynamicKeyField(context))
    return withTemplateSchemaFields(context.path, []);

  const first = compact[0];

  switch (first) {
    case "conditions":
    case "condition":
      return withTemplateSchemaFields(
        context.path,
        commonConditionFields(context, nested),
      );
    case "functions":
    case "function":
      return withTemplateSchemaFields(
        context.path,
        compact.some(
          (part) =>
            part === "conditions" ||
            part === "condition" ||
            part === "terms" ||
            part === "term",
        )
          ? commonConditionFields(context, nested)
          : commonFunctionFields(context, nested),
      );
    case "result":
    case "visual_result":
      return withTemplateSchemaFields(
        context.path,
        compact.findIndex(isProcessorSegment) < 0
          ? RESULT_FIELDS
          : typedFields(
              RESULT_POST_PROCESSOR_COMMON,
              RESULT_POST_PROCESSOR_FIELDS,
              context.siblingValues.get("type"),
              "result-post-processor",
            ),
      );
    case "transform_processors":
    case "post_processors":
      return withTemplateSchemaFields(
        context.path,
        typedFields(
          TRANSFORM_PROCESSOR_COMMON,
          TRANSFORM_PROCESSOR_FIELDS,
          context.siblingValues.get("type"),
          "transform-processor",
        ),
      );
  }

  const predicateIndex = Math.max(
    compact.lastIndexOf("predicate"),
    compact.lastIndexOf("predicates"),
  );
  if (predicateIndex >= 0)
    return withTemplateSchemaFields(
      context.path,
      compact.slice(predicateIndex + 1).includes("enchantments")
        ? []
        : typedFields(
            INGREDIENT_PREDICATE_COMMON,
            INGREDIENT_PREDICATE_FIELDS,
            context.siblingValues.get("type"),
            "ingredient-predicate",
          ),
    );

  if (
    first === "target" &&
    normalizedRecipeType === "dye" &&
    context.recipeHasExplicitResult !== true &&
    compact.some(isProcessorSegment)
  )
    return withTemplateSchemaFields(
      context.path,
      typedFields(
        RESULT_POST_PROCESSOR_COMMON,
        RESULT_POST_PROCESSOR_FIELDS,
        context.siblingValues.get("type"),
        "result-post-processor",
      ),
    );

  switch (first) {
    case "ingredient":
    case "ingredients":
      if (
        [
          "shaped",
          "shaped_transform",
          "shapeless",
          "shapeless_transform",
        ].includes(normalizedRecipeType ?? "") &&
        nested.length <= 1
      )
        return withTemplateSchemaFields(context.path, []);
      return withTemplateSchemaFields(
        context.path,
        recipeType === undefined ||
          normalizedRecipeType === "shaped_transform" ||
          normalizedRecipeType === "shapeless_transform"
          ? [...INGREDIENT_FIELDS, INGREDIENT_SOURCE]
          : INGREDIENT_FIELDS,
      );
    case "target":
      return withTemplateSchemaFields(
        context.path,
        dyeTargetFields(context, recipeType),
      );
    case "dye":
    case "template_type":
    case "base":
    case "addition":
    case "container":
      return withTemplateSchemaFields(context.path, INGREDIENT_FIELDS);
    default:
      return withTemplateSchemaFields(context.path, []);
  }
}

export function recipeSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  return schemaFieldForName(name, fields);
}

const DATA_COMPONENT_IDS = DATA_COMPONENT_DEFINITIONS.map(
  (definition) => definition.id,
);
const DATA_COMPONENT_DETAILS = Object.fromEntries(
  DATA_COMPONENT_DEFINITIONS.map((definition) => [
    definition.id,
    definition.detail,
  ]),
);

export function recipeDataDynamicKeyField(
  context: RecipeSchemaContext,
): SchemaField | undefined {
  const itemData = recipeItemDataContext(context);
  if (!itemData) return undefined;
  const dataPath = itemData.path
    .slice(1)
    .map((part) => part.replaceAll("-", "_"));
  if (["tags", "nbt", "pdc"].includes(dataPath[1] ?? "")) {
    return field(
      Messages.src.config.recipe.schema.text0117,
      Messages.src.config.recipe.schema.text0089,
    );
  }

  const component = dataComponentPathContext(itemData.path);
  if (
    component?.componentId === undefined &&
    (dataPath[1] === "components" || dataPath[1] === "component")
  ) {
    return field(
      Messages.src.config.recipe.schema.text0119,
      Messages.src.config.recipe.schema.text0120,
      {
        valueProvider: "component",
        values: DATA_COMPONENT_IDS,
        valueDetails: DATA_COMPONENT_DETAILS,
        snippet: "${1:minecraft:custom_name}: ${0}",
      },
    );
  }
  if (component?.componentId !== undefined) {
    return dataComponentDynamicEntry(
      component.componentId,
      component.payloadPath,
    )?.key;
  }
  return itemDataDynamicKeyField(itemData);
}

export function recipeDataDynamicValueField(
  context: RecipeSchemaContext,
  fieldName: string,
): SchemaField | undefined {
  const itemData = recipeItemDataContext(context);
  if (!itemData) return undefined;
  const dataPath = itemData.path
    .slice(1)
    .map((part) => part.replaceAll("-", "_"));
  if (["tags", "nbt", "pdc"].includes(dataPath[1] ?? "")) {
    return field(
      Messages.src.config.recipe.schema.text0118,
      Messages.src.config.recipe.schema.text0090,
    );
  }

  const component = dataComponentPathContext(itemData.path);
  if (
    component?.componentId === undefined &&
    (dataPath[1] === "components" || dataPath[1] === "component")
  ) {
    return (
      dataComponentValueField(fieldName) ??
      field(
        fieldName,
        dataComponentDefinition(fieldName)?.detail ??
          Messages.src.config.recipe.schema.text0091,
      )
    );
  }
  if (component?.componentId !== undefined) {
    const dynamic = dataComponentDynamicEntry(
      component.componentId,
      component.payloadPath,
    );
    return dynamic?.valueForKey?.(fieldName) ?? dynamic?.value;
  }
  return itemDataDynamicValueField(itemData, fieldName);
}

function recipeFunctionDynamicKeyField(
  context: RecipeSchemaContext,
): SchemaField | undefined {
  const tail = compactPath(context.path).at(-1);
  const functionType = nearestKnownDiscriminator(context, "function")?.name;
  if (
    tail === "properties" &&
    (functionType === "update_block_property" ||
      functionType === "transform_block" ||
      nearestKnownDiscriminator(context, "condition")?.name ===
        "match_block_property")
  ) {
    return field(
      Messages.src.config.recipe.schema.text0092,
      Messages.src.config.recipe.schema.text0093,
    );
  }
  if (tail === "rules" && functionType === "cycle_block_property") {
    return field(
      Messages.src.config.recipe.schema.text0094,
      Messages.src.config.recipe.schema.text0095,
    );
  }
  return undefined;
}

export function recipeListItemField(
  path: readonly string[],
): SchemaField | undefined {
  const dataContext = recipeItemDataContext({ path, siblingValues: new Map() });
  if (dataContext) {
    const component = dataComponentPathContext(dataContext.path);
    if (component?.componentId !== undefined) {
      const item = dataComponentListItemField(
        component.componentId,
        component.payloadPath,
      );
      if (item) return item;
    }
    const item = itemDataListItemField(dataContext.path);
    if (item) return item;
  }
  const compact = compactPath(path);
  const tail = compact.at(-1);
  if (tail === "pattern")
    return field(
      Messages.src.config.recipe.schema.text0121,
      Messages.src.config.recipe.schema.text0096,
    );
  if (
    tail === "ingredients" ||
    tail === "ingredient" ||
    tail === "items" ||
    tail === "item"
  ) {
    return field("item", Messages.src.config.recipe.schema.text0097, {
      valueProvider: "item-id",
    });
  }
  if (
    tail === "conditions" ||
    tail === "condition" ||
    tail === "terms" ||
    tail === "term"
  ) {
    return field("type", Messages.src.config.recipe.schema.text0098, {
      valueProvider: "condition-type",
    });
  }
  if (tail === "functions" || tail === "function") {
    return field("type", Messages.src.config.recipe.schema.text0099, {
      valueProvider: "function-type",
    });
  }
  if (tail === "predicate" || tail === "predicates") {
    return field("type", Messages.src.config.recipe.schema.text0100, {
      values: INGREDIENT_PREDICATE_TYPES,
      valueDetails: INGREDIENT_PREDICATE_TYPE_DETAILS,
    });
  }
  if (tail !== undefined && isProcessorSegment(tail)) {
    return compact[0] === "result" || compact[0] === "visual_result"
      ? field("type", Messages.src.config.recipe.schema.text0101, {
          values: RESULT_POST_PROCESSOR_TYPES,
          valueDetails: RESULT_POST_PROCESSOR_TYPE_DETAILS,
        })
      : field("type", Messages.src.config.recipe.schema.text0102, {
          values: TRANSFORM_PROCESSOR_TYPES,
          valueDetails: TRANSFORM_PROCESSOR_TYPE_DETAILS,
        });
  }
  if (tail === "components")
    return field("component", Messages.src.config.recipe.schema.text0119, {
      valueProvider: "component",
    });
  if (tail === "tags" || tail === "paths")
    return field("path", Messages.src.config.recipe.schema.text0103);
  return undefined;
}

export function recipeDynamicKeyField(
  context: RecipeSchemaContext,
): SchemaField | undefined {
  const compact = compactPath(context.path);
  const tail = compact.at(-1);
  const selected = normalizeRecipeType(context.recipeType);

  const dataDynamic = recipeDataDynamicKeyField(context);
  if (dataDynamic) return dataDynamic;
  const functionDynamic = recipeFunctionDynamicKeyField(context);
  if (functionDynamic) return functionDynamic;
  if (recipeOpaqueSubtree(context))
    return field(
      Messages.src.config.recipe.schema.text0122,
      Messages.src.config.recipe.schema.text0104,
    );

  if (
    (tail === "ingredients" || tail === "ingredient") &&
    !/^\d+$/u.test(normalizedPath(context.path).at(-1) ?? "")
  ) {
    if (selected === "shaped" || selected === "shaped_transform") {
      return field(
        Messages.src.config.recipe.schema.text0105,
        Messages.src.config.recipe.schema.text0106,
        {
          snippet: "${1:A}: ${0:minecraft:stick}",
        },
      );
    }
    if (selected === "shapeless" || selected === "shapeless_transform") {
      return field(
        Messages.src.config.recipe.schema.text0107,
        Messages.src.config.recipe.schema.text0108,
        {
          snippet: "${1:ingredient}: ${0:minecraft:stick}",
        },
      );
    }
  }

  const predicateIndex = Math.max(
    compact.lastIndexOf("predicate"),
    compact.lastIndexOf("predicates"),
  );
  if (
    tail === "enchantments" ||
    (predicateIndex >= 0 &&
      predicateIndex === compact.length - 1 &&
      resolveRecipeDiscriminator(
        "ingredient-predicate",
        context.siblingValues.get("type"),
      ).name === "enchantment")
  ) {
    return field(
      Messages.src.config.recipe.schema.text0109,
      Messages.src.config.recipe.schema.text0110,
      {
        valueProvider: "enchantment",
        snippet: "${1:minecraft:efficiency}: ${0:1}",
      },
    );
  }
  return undefined;
}

export function recipeDynamicValueField(
  context: RecipeSchemaContext,
  fieldName = "",
): SchemaField | undefined {
  const dataDynamic = recipeDataDynamicValueField(context, fieldName);
  if (dataDynamic) return dataDynamic;
  const dynamic = recipeDynamicKeyField(context);
  if (!dynamic) return undefined;
  if (dynamic.valueProvider === "enchantment")
    return number(
      Messages.src.config.recipe.schema.text0111,
      Messages.src.config.recipe.schema.text0112,
    );
  if (
    dynamic.label === Messages.src.config.recipe.schema.text0113 ||
    dynamic.label === Messages.src.config.recipe.schema.text0114
  ) {
    return field("ingredient", Messages.src.config.recipe.schema.text0115, {
      valueProvider: "item-id",
    });
  }
  return field(
    Messages.src.config.recipe.schema.text0123,
    Messages.src.config.recipe.schema.text0116,
  );
}
