import type { TextRange } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type {
  ConfigurationSource,
  OpaqueConfigurationSection,
  ParsedSection,
  ParsedYamlFile,
  PathRanges,
} from "../model.js";

function generatedSectionRanges(
  value: unknown,
  source: ConfigurationSource,
  prefix = "",
  keys = new Map<string, TextRange>(),
  values = new Map<string, TextRange>(),
): PathRanges {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      keys.set(
        fieldPath,
        source.fieldKeyRanges.get(fieldPath) ?? source.idRange,
      );
      values.set(
        fieldPath,
        source.fieldValueRanges.get(fieldPath) ?? source.entryRange,
      );
      generatedSectionRanges(child, source, fieldPath, keys, values);
    }
    return { keys, values };
  }
  if (!isUnknownArray(value)) return { keys, values };
  value.forEach((child, index) => {
    const fieldPath = prefix ? `${prefix}.${index}` : String(index);
    values.set(
      fieldPath,
      source.fieldValueRanges.get(fieldPath) ?? source.entryRange,
    );
    generatedSectionRanges(child, source, fieldPath, keys, values);
  });
  return { keys, values };
}

export function materializeOpaqueConfigurationSections(
  parsedFiles: ReadonlyMap<string, ParsedYamlFile>,
  opaqueSections: readonly OpaqueConfigurationSection[],
): Map<string, ParsedYamlFile> {
  const result = new Map(parsedFiles);
  for (const generated of opaqueSections) {
    const existing = result.get(generated.source.uri) ?? {
      uri: generated.source.uri,
      text: "",
      sections: [],
      issues: [],
    };
    result.set(existing.uri, {
      ...existing,
      sections: [
        ...existing.sections,
        {
          key: generated.sectionKey,
          type: generated.sectionType,
          value: generated.value,
          keyRange: generated.source.idRange,
          valueRange: generated.source.entryRange,
          ranges: generatedSectionRanges(generated.value, generated.source),
          generated: "factory",
        } satisfies ParsedSection,
      ],
    });
  }
  return result;
}
