import {
  CRAFTENGINE_SECTION_FAMILIES,
  getSectionFamily,
} from "../registry/sectionRegistry.js";
import { Messages } from "../../messages.js";
import type { SchemaField } from "../schema/types.js";

export const TEMPLATE_ARGUMENT_TYPE_IDS = [
  "plain",
  "object",
  "null",
  "list",
  "map",
  "condition",
  "when",
  "to_upper_case",
  "to_lower_case",
  "capitalize",
  "self_increase_int",
  "expression",
] as const;

export type TemplateArgumentTypeId =
  (typeof TEMPLATE_ARGUMENT_TYPE_IDS)[number];

function schemaField(
  label: string,
  detail: string,
  options: {
    readonly aliases?: readonly string[];
    readonly snippet?: string;
    readonly values?: readonly string[];
    readonly valueProvider?: SchemaField["valueProvider"];
    readonly required?: boolean;
  } = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_"),
    aliases: options.aliases ?? [],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
    ...(options.required === undefined ? {} : { required: options.required }),
  };
}

const argumentField = (
  label: string,
  detail: string,
  options: Parameters<typeof schemaField>[2] = {},
): SchemaField => schemaField(label, detail, options);

const ARGUMENT_TYPE_FIELD = argumentField(
  "type",
  Messages.src.config.template.schema.text0001,
  {
    required: true,
    values: TEMPLATE_ARGUMENT_TYPE_IDS,
  },
);

const ARGUMENT_FIELDS = new Map<TemplateArgumentTypeId, readonly SchemaField[]>(
  [
    [
      "plain",
      [argumentField("value", Messages.src.config.template.schema.text0002)],
    ],
    [
      "object",
      [argumentField("value", Messages.src.config.template.schema.text0003)],
    ],
    ["null", []],
    [
      "list",
      [
        argumentField("list", Messages.src.config.template.schema.text0004, {
          aliases: ["value"],
          required: true,
        }),
      ],
    ],
    [
      "map",
      [
        argumentField("map", Messages.src.config.template.schema.text0005, {
          aliases: ["value"],
          required: true,
          snippet: "map:\n  ${0}",
        }),
      ],
    ],
    [
      "condition",
      [
        argumentField(
          "condition",
          Messages.src.config.template.schema.text0006,
        ),
        argumentField("on_true", Messages.src.config.template.schema.text0007, {
          aliases: ["on-true"],
        }),
        argumentField(
          "on_false",
          Messages.src.config.template.schema.text0008,
          { aliases: ["on-false"] },
        ),
      ],
    ],
    [
      "when",
      [
        argumentField("source", Messages.src.config.template.schema.text0009),
        argumentField("when", Messages.src.config.template.schema.text0010, {
          snippet: "when:\n  ${0}",
        }),
        argumentField("fallback", Messages.src.config.template.schema.text0011),
      ],
    ],
    [
      "to_upper_case",
      [
        argumentField("value", Messages.src.config.template.schema.text0012, {
          required: true,
        }),
        argumentField("locale", Messages.src.config.template.schema.text0013),
      ],
    ],
    [
      "to_lower_case",
      [
        argumentField("value", Messages.src.config.template.schema.text0014, {
          required: true,
        }),
        argumentField("locale", Messages.src.config.template.schema.text0015),
      ],
    ],
    [
      "capitalize",
      [
        argumentField("value", Messages.src.config.template.schema.text0016, {
          required: true,
        }),
      ],
    ],
    [
      "self_increase_int",
      [
        argumentField("from", Messages.src.config.template.schema.text0017, {
          required: true,
          valueProvider: "number",
        }),
        argumentField("to", Messages.src.config.template.schema.text0018, {
          required: true,
          valueProvider: "number",
        }),
        argumentField("step", Messages.src.config.template.schema.text0019, {
          valueProvider: "number",
        }),
        argumentField(
          "step_interval",
          Messages.src.config.template.schema.text0020,
          { aliases: ["step-interval"], valueProvider: "number" },
        ),
      ],
    ],
    [
      "expression",
      [
        argumentField(
          "expression",
          Messages.src.config.template.schema.text0021,
          { required: true },
        ),
        argumentField(
          "value_type",
          Messages.src.config.template.schema.text0022,
          {
            aliases: ["value-type"],
            values: [
              "int",
              "long",
              "short",
              "double",
              "float",
              "byte",
              "boolean",
            ],
          },
        ),
      ],
    ],
  ],
);

export function normalizeArgumentType(
  rawType: string | undefined,
): TemplateArgumentTypeId | undefined {
  if (rawType === undefined) return undefined;
  const qualified = rawType.includes(":") ? rawType : `craftengine:${rawType}`;
  if (!qualified.startsWith("craftengine:")) return undefined;
  const value = qualified.slice("craftengine:".length);
  return (TEMPLATE_ARGUMENT_TYPE_IDS as readonly string[]).includes(value)
    ? (value as TemplateArgumentTypeId)
    : undefined;
}

export function templateArgumentFieldsForType(
  type: string | undefined,
): readonly SchemaField[] {
  const normalized = normalizeArgumentType(type);
  return [
    ARGUMENT_TYPE_FIELD,
    ...(normalized ? (ARGUMENT_FIELDS.get(normalized) ?? []) : []),
  ];
}

export const CONFIG_FACTORY_ROOT_FIELDS: readonly SchemaField[] = [
  schemaField("instances", Messages.src.config.template.schema.text0023, {
    aliases: ["instance", "inputs", "input"],
    required: true,
    snippet: "instances:\n  - ${0}",
  }),
  schemaField("blueprint", Messages.src.config.template.schema.text0024, {
    aliases: ["prototype", "schema"],
    required: true,
    snippet: "blueprint:\n  ${0}",
  }),
];

export interface ConfigFactoryBlueprintSectionSchema {
  readonly sectionType: string;
  readonly canonical: string;
  readonly alias: boolean;
  readonly semantic: string;
  readonly field: SchemaField;
}

export const CONFIG_FACTORY_BLUEPRINT_SECTION_SCHEMAS: readonly ConfigFactoryBlueprintSectionSchema[] =
  CRAFTENGINE_SECTION_FAMILIES.filter(
    (family) =>
      family.canonical !== "templates" && family.canonical !== "config-factory",
  ).flatMap((family) =>
    [family.canonical, ...family.aliases].map((sectionType) => {
      const alias = sectionType !== family.canonical;
      const field = schemaField(
        sectionType,
        alias
          ? Messages.src.config.template.schema.text0025(
              family.description,
              family.canonical,
            )
          : family.description,
        { snippet: `${sectionType}:\n  \${0}` },
      );
      return {
        sectionType,
        canonical: family.canonical,
        alias,
        semantic: family.canonical.replaceAll("-", "_"),
        field: {
          ...field,
          semantic: family.canonical.replaceAll("-", "_"),
        },
      };
    }),
  );

export const CONFIG_FACTORY_BLUEPRINT_SECTION_FIELDS: readonly SchemaField[] =
  CONFIG_FACTORY_BLUEPRINT_SECTION_SCHEMAS.map((entry) => entry.field);

export function configFactoryBlueprintSectionSemantic(
  sectionKey: string,
): string | undefined {
  const sectionType = sectionKey.split("#", 1)[0] ?? sectionKey;
  const family = getSectionFamily(sectionType);
  if (
    !family ||
    family.canonical === "templates" ||
    family.canonical === "config-factory"
  )
    return undefined;
  return family.canonical.replaceAll("-", "_");
}
