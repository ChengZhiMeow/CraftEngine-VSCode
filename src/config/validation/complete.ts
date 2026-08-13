import type { ConfigurationCandidateInput } from "../model.js";
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
import { miscSectionForKind, validateMiscCandidate } from "./resource.js";
import type {
  DeepCandidateKind,
  OpaqueSectionValidationInput,
} from "./shared.js";
import { validateWorldgen } from "./worldgen.js";

export function validateExpandedConfigurationSchemas(
  configurations: readonly ConfigurationCandidateInput[],
  opaqueSections: readonly GeneratedOpaqueSection[] = [],
): readonly CoreIssue[] {
  const customBlockIds = new Set(
    configurations
      .filter((candidate) => candidate.kind === "block")
      .map((candidate) => candidate.rawId),
  );
  return [
    ...configurations.flatMap((candidate) => {
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
          );
        case "image":
          return validateImage(candidate);
        case "recipe":
          return validateRecipe(candidate);
        case "emoji":
        case "category":
        case "painting":
        case "advancement": {
          const section = miscSectionForKind(candidate.kind);
          return section === undefined
            ? []
            : validateMiscCandidate(candidate, section);
        }
        case "configured-feature":
          return validateWorldgen(
            candidate,
            "configured-feature",
            customBlockIds,
          );
        case "placed-feature":
          return validateWorldgen(candidate, "placed-feature", customBlockIds);
        default:
          return [];
      }
    }),
    ...opaqueSections.flatMap(validateOpaqueSection),
  ];
}

export function validateDirectParsedConfigurationSections(
  files: readonly ParsedPackFile[],
): readonly CoreIssue[] {
  const sections: OpaqueSectionValidationInput[] = [];
  for (const file of files) {
    for (const section of file.parsed.sections) {
      const resolved = resolveMiscResourceSection(section.type);
      if (
        resolved !== "block-state-mapping" &&
        resolved !== "skip-optimization"
      )
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
  return sections.flatMap(validateOpaqueSection);
}

export { validateStandaloneParsedFile } from "./standalone.js";
