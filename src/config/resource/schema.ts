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

export type MiscResourceSection =
  | "emoji"
  | "category"
  | "painting"
  | "block-state-mapping"
  | "skip-optimization"
  | "advancement";

export const MISC_RESOURCE_SECTION_ALIASES = {
  emoji: ["emojis", "emoji"],
  category: ["categories", "category"],
  painting: ["paintings", "painting"],
  "block-state-mapping": [
    "block-state-mappings",
    "block-state-mapping",
    "block_state_mappings",
    "block_state_mapping",
  ],
  "skip-optimization": ["skip-optimization", "skip_optimization"],
  advancement: ["advancements", "advancement"],
} as const satisfies Readonly<Record<MiscResourceSection, readonly string[]>>;

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
  list("conditions", Messages.src.config.resource.schema.text0021),
  list("list", Messages.src.config.resource.schema.text0022),
  bool("all_items", Messages.src.config.resource.schema.text0023, [
    "all-items",
  ]),
];

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

export function resolveMiscResourceSection(
  section: string,
): MiscResourceSection | undefined {
  const suffix = section.indexOf("#");
  for (const [canonical, aliases] of Object.entries(
    MISC_RESOURCE_SECTION_ALIASES,
  )) {
    if (
      (aliases as readonly string[]).includes(
        suffix < 0 ? section : section.slice(0, suffix),
      )
    )
      return canonical as MiscResourceSection;
  }
  return undefined;
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
    case "emoji": {
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
    case "category": {
      const compact = compactIdPath(context.path);
      if (compact.length === 0)
        return withTemplateSchemaFields(context.path, CATEGORY_ROOT_FIELDS);

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
    case "painting":
      return compactIdPath(context.path).length === 0
        ? withTemplateSchemaFields(context.path, PAINTING_ROOT_FIELDS)
        : withTemplateSchemaFields(context.path, []);
    case "block-state-mapping":
      return context.path.length === 0 ? BLOCK_STATE_MAPPING_FIELDS : [];
    case "skip-optimization":
      return context.path.length === 0 ? SKIP_OPTIMIZATION_FIELDS : [];
    case "advancement":
      return compactIdPath(context.path).length === 0
        ? ADVANCEMENT_ROOT_FIELDS
        : [];
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
    case "emoji":
      if (tail === "keywords")
        return field("keyword", Messages.src.config.resource.schema.text0040, {
          required: true,
        });
      if (tail === "content" || tail === "format") {
        return field("content", Messages.src.config.resource.schema.text0041);
      }
      return undefined;
    case "category":
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
    default:
      return undefined;
  }
}

export function miscResourceDynamicKeyField(
  section: string,
  path: readonly string[],
): SchemaField | undefined {
  if (
    resolveMiscResourceSection(section) !== "block-state-mapping" ||
    path.length !== 0
  )
    return undefined;
  return field(
    "source-block-state",
    Messages.src.config.resource.schema.text0044,
    {
      valueProvider: "block-state",
      required: true,
    },
  );
}

export function miscResourceDynamicValueField(
  section: string,
  path: readonly string[],
  sourceState: string,
): SchemaField | undefined {
  if (
    resolveMiscResourceSection(section) !== "block-state-mapping" ||
    path.length !== 0
  )
    return undefined;
  return field(sourceState, Messages.src.config.resource.schema.text0045, {
    valueProvider: "block-state",
    required: true,
  });
}
