import type { ConfigurationCandidateInput } from "../model.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
import { resolveMiscResourceSection } from "../resource/schema.js";
import type {
  GeneratedOpaqueSection,
  ParsedPackFile,
} from "../template/expander.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { validateDeepCandidate } from "./deep.js";
import { validateImage } from "./image.js";
import { validateOpaqueSection } from "./opaque.js";
import { validateRecipe } from "./recipe.js";
import { miscSectionForKind, MISC_OPAQUE_SECTIONS, validateMiscCandidate } from "./resource.js";
import type {
  DeepCandidateKind,
  OpaqueSectionValidationInput,
} from "./shared.js";
import { validateWorldgen } from "./worldgen.js";

export function validateExpandedConfigurationSchemas(
  configurations: readonly ConfigurationCandidateInput[],
  opaqueSections: readonly GeneratedOpaqueSection[] = [],
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const customBlockIds = new Set(
    configurations
      .filter((candidate) => candidate.kind === "block")
      .map((candidate) => candidate.rawId),
  );
  return [
    ...configurations.flatMap((candidate) => {
      // miscSectionForKind 对 misc 组的 9 个 kind 都返回已定义的 section
      const section = miscSectionForKind(candidate.kind);
      switch (candidate.kind) {
        case "item":
        case "block":
        case "furniture":
        case "loot":
        case "vanilla-loot":
          return validateDeepCandidate(
            candidate as ConfigurationCandidateInput & {
              readonly kind: DeepCandidateKind;
            },
            configVersion,
          );
        case "image":
          return validateImage(candidate, configVersion);
        case "recipe":
          return validateRecipe(candidate, configVersion);
        case "emoji":
        case "category":
        case "painting":
        case "advancement":
        case "entity":
        case "attribute":
        case "attribute-operation":
        case "equipment-set":
        case "atlas":
          return validateMiscCandidate(candidate, section!, configVersion);
        case "configured-feature":
          return validateWorldgen(
            candidate,
            "configured-feature",
            customBlockIds,
            configVersion,
          );
        case "placed-feature":
          return validateWorldgen(
            candidate,
            "placed-feature",
            customBlockIds,
            configVersion,
          );
        default:
          return [];
      }
    }),
    ...opaqueSections.flatMap((section) =>
      validateOpaqueSection(section, configVersion),
    ),
  ];
}

export function validateDirectParsedConfigurationSections(
  files: readonly ParsedPackFile[],
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const sections: OpaqueSectionValidationInput[] = [];
  for (const file of files) {
    for (const section of file.parsed.sections) {
      const resolved = resolveMiscResourceSection(section.type);
      if (resolved === undefined || !MISC_OPAQUE_SECTIONS.has(resolved))
        continue;
      sections.push({
        sectionType: section.type,
        sectionKey: section.key,
        value: section.value,
        source: {
          uri: file.parsed.uri,
          idRange: section.keyRange,
          entryRange: section.valueRange,
          fieldKeyRanges: section.ranges.keys,
          fieldValueRanges: section.ranges.values,
          pack: file.pack,
          kind: "direct",
          sectionKey: section.key,
        },
      });
    }
  }
  return sections.flatMap((section) =>
    validateOpaqueSection(section, configVersion),
  );
}

export { validateStandaloneParsedFile } from "./standalone.js";
