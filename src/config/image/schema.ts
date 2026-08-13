import { withTemplateSchemaFields } from "../schema/templateFields.js";
import { Messages } from "../../messages.js";
import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";

interface FieldOptions {
  readonly aliases?: readonly string[];
  readonly snippet?: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly required?: boolean;
  readonly registry?: string;
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
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  };
}

const bool = (label: string, detail: string): SchemaField =>
  field(label, detail, {
    valueProvider: "boolean",
    values: ["true", "false"],
    valueDetails: {
      true: Messages.src.config.image.schema.text0001,
      false: Messages.src.config.image.schema.text0002,
    },
  });

const number = (
  label: string,
  detail: string,
  aliases: readonly string[] = [],
): SchemaField => field(label, detail, { aliases, valueProvider: "number" });

const ENABLE_FIELD = bool("enable", Messages.src.config.image.schema.text0003);
const DEBUG_FIELD = bool("debug", Messages.src.config.image.schema.text0004);
const REF_FIELD = field("ref", Messages.src.config.image.schema.text0005, {
  valueProvider: "image-id",
  registry: "craftengine:image_ref",
});
const ROW_FIELD = number("row", Messages.src.config.image.schema.text0006);
const COL_FIELD = number("col", Messages.src.config.image.schema.text0007);
const FILE_FIELD = field("file", Messages.src.config.image.schema.text0008, {
  valueProvider: "texture",
  required: true,
});
const FONT_FIELD = field("font", Messages.src.config.image.schema.text0009);
const CHAR_FIELD = field("char", Messages.src.config.image.schema.text0010, {
  aliases: ["chars", "unicode"],
  snippet: "char: ${0}",
});
const HEIGHT_FIELD = number(
  "height",
  Messages.src.config.image.schema.text0011,
  ["scale", "scale_ratio"],
);
const ASCENT_FIELD = number(
  "ascent",
  Messages.src.config.image.schema.text0012,
  ["y_position"],
);
const GRID_SIZE_FIELD = field(
  "grid_size",
  Messages.src.config.image.schema.text0013,
  {
    aliases: ["grid-size"],
    snippet: "grid_size: ${1:1},${0:1}",
  },
);

export const IMAGE_ROOT_FIELDS: readonly SchemaField[] = [
  ENABLE_FIELD,
  DEBUG_FIELD,
  REF_FIELD,
  ROW_FIELD,
  COL_FIELD,
  FILE_FIELD,
  FONT_FIELD,
  CHAR_FIELD,
  HEIGHT_FIELD,
  ASCENT_FIELD,
  GRID_SIZE_FIELD,
];

export const IMAGE_REFERENCE_FIELDS: readonly SchemaField[] = [
  ENABLE_FIELD,
  DEBUG_FIELD,
  { ...REF_FIELD, required: true },
  ROW_FIELD,
  COL_FIELD,
];

export function imageFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = context.path.slice(1);
  if (nested.length > 0) return [];
  const fields = context.siblingValues.has("ref")
    ? IMAGE_REFERENCE_FIELDS
    : IMAGE_ROOT_FIELDS;
  return withTemplateSchemaFields(context.path, fields);
}

export function imageSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[] = IMAGE_ROOT_FIELDS,
): SchemaField | undefined {
  return fields.find(
    (candidate) => candidate.label === name || candidate.aliases.includes(name),
  );
}
