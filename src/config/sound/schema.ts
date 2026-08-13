import type {
  SchemaContext,
  SchemaField,
  SchemaValueProvider,
} from "../schema/types.js";
import { Messages } from "../../messages.js";
import {
  NUMBER_PROVIDER_TYPES,
  numberProviderAllowsNestedField,
  numberProviderConsumer,
  numberProviderFields,
  resolveNumberProviderType,
} from "../number-provider/schema.js";

function field(
  label: string,
  detail: string,
  options: {
    readonly aliases?: readonly string[];
    readonly values?: readonly string[];
    readonly valueDetails?: Readonly<Record<string, string>>;
    readonly valueProvider?: SchemaValueProvider;
    readonly snippet?: string;
  } = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_"),
    aliases: options.aliases ?? [],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.valueDetails === undefined
      ? {}
      : { valueDetails: options.valueDetails }),
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
  };
}

export const SOUND_EVENT_FIELDS: readonly SchemaField[] = [
  field("replace", Messages.src.config.sound.schema.text0001, {
    values: ["true", "false"],
    valueDetails: {
      true: Messages.src.config.sound.schema.text0002,
      false: Messages.src.config.sound.schema.text0003,
    },
  }),
  field("subtitle", Messages.src.config.sound.schema.text0004),
  field("sounds", Messages.src.config.sound.schema.text0005, {
    aliases: ["sound"],
    snippet:
      "sounds:\n  - name: ${1:namespace:path/to/sound}\n    type: ${2|file,event|}\n    volume: ${3:1}\n    pitch: ${4:1}\n    weight: ${0:1}",
  }),
];

export const SOUND_ENTRY_TYPE_DETAILS: Readonly<Record<string, string>> = {
  file: Messages.src.config.sound.schema.text0006,
  event: Messages.src.config.sound.schema.text0007,
};

export function soundEntryFields(
  type: string | undefined,
): readonly SchemaField[] {
  // 这里按普通选项处理, SoundFile 的类型不能自动补命名空间
  const normalized = type?.toLowerCase();
  return [
    field(
      "name",
      normalized === "event"
        ? Messages.src.config.sound.schema.text0008
        : Messages.src.config.sound.schema.text0009,
      {
        valueProvider: normalized === "event" ? "sound" : "sound-file",
      },
    ),
    field("type", Messages.src.config.sound.schema.text0010, {
      values: ["file", "event"],
      valueDetails: SOUND_ENTRY_TYPE_DETAILS,
    }),
    numberProviderConsumer(
      field("volume", Messages.src.config.sound.schema.text0011, {
        snippet: "volume: ${0:1}",
      }),
    ),
    numberProviderConsumer(
      field("pitch", Messages.src.config.sound.schema.text0012, {
        snippet: "pitch: ${0:1}",
      }),
    ),
    field("weight", Messages.src.config.sound.schema.text0013, {
      snippet: "weight: ${0:1}",
    }),
    field("stream", Messages.src.config.sound.schema.text0014, {
      values: ["true", "false"],
    }),
    field("attenuation_distance", Messages.src.config.sound.schema.text0015, {
      aliases: ["attenuation-distance"],
      snippet: "attenuation_distance: ${0:16}",
    }),
    field("preload", Messages.src.config.sound.schema.text0016, {
      values: ["true", "false"],
    }),
  ];
}

export function soundFieldsForContext(
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = context.path
    .slice(1)
    .map((entry) => entry.replaceAll("-", "_"));
  if (nested.length === 0) return SOUND_EVENT_FIELDS;
  if (nested[0] !== "sounds" && nested[0] !== "sound") return [];
  if (nested.length <= 2)
    return soundEntryFields(context.siblingValues.get("type"));
  const tail = nested.at(-1);
  if (tail === undefined) return [];
  const parentType = context.ancestorTypes?.[0];
  const resolvedParent = resolveNumberProviderType(parentType);
  if (
    resolvedParent &&
    !resolvedParent.external &&
    NUMBER_PROVIDER_TYPES.some((type) => type === resolvedParent.name)
  ) {
    return numberProviderAllowsNestedField(parentType, tail)
      ? numberProviderFields(context.siblingValues.get("type"))
      : [];
  }
  if (tail === "volume" || tail === "pitch")
    return numberProviderFields(context.siblingValues.get("type"));
  return soundEntryFields(context.siblingValues.get("type"));
}

export function soundSchemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  return fields.find(
    (candidate) => candidate.label === name || candidate.aliases.includes(name),
  );
}
