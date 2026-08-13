import type { ConfigurationCandidateInput, ResourceKind } from "../model.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord } from "../../util/records.js";
import { canonicalPath } from "../../util/paths.js";
import { craftEngineBoolean } from "./packMetadata.js";
import { Messages } from "../../messages.js";
import type { CraftEngineCanonicalSectionType } from "../registry/sectionRegistry.js";

export type IdSectionSemanticsMode = "accurate" | "safer-preview";

export interface IdSectionSemanticsOptions {
  readonly mode?: IdSectionSemanticsMode;
}

export interface IdSectionSemanticsResult {
  readonly candidates: readonly ConfigurationCandidateInput[];
  readonly issues: readonly CoreIssue[];
}

export const ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND = {
  image: "images",
  item: "items",
  block: "blocks",
  furniture: "furniture",
  loot: "loot",
  "vanilla-loot": "vanilla-loots",
  equipment: "equipments",
  "jukebox-song": "jukebox-songs",
  "sound-event": "sounds",
  recipe: "recipes",
  category: "categories",
  emoji: "emojis",
  painting: "paintings",
  "configured-feature": "configured-feature",
  "placed-feature": "placed-feature",
  advancement: "advancements",
} as const satisfies Readonly<
  Record<ResourceKind, CraftEngineCanonicalSectionType>
>;

type IdSectionField = "enable" | "debug";

function booleanField(
  candidate: ConfigurationCandidateInput,
  field: IdSectionField,
  issues: CoreIssue[],
): boolean | undefined {
  if (!isRecord(candidate.value) || !Object.hasOwn(candidate.value, field))
    return undefined;
  try {
    return craftEngineBoolean(candidate.value[field]);
  } catch {
    issues.push({
      code: `invalid-id-section-${field}`,
      message: Messages.src.config.parsing.idSectionSemantics.text0001(
        ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND[candidate.kind],
        candidate.rawId,
        field,
      ),
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldValueRanges.get(field) ??
        candidate.source.fieldKeyRanges.get(field) ??
        candidate.source.entryRange,
    });
    return undefined;
  }
}

  // 同一资源目录里有禁用项时, CE 会停止读取这一类配置
export function applyIdSectionSemantics(
  configurations: readonly ConfigurationCandidateInput[],
  options: IdSectionSemanticsOptions = {},
): IdSectionSemanticsResult {
  const mode = options.mode ?? "accurate";
  const issues: CoreIssue[] = [];
  const abortedBatches = new Set<string>();
  const disabledCandidates = new Set<ConfigurationCandidateInput>();

  for (const candidate of configurations) {
    if (!isRecord(candidate.value)) continue;
    if (booleanField(candidate, "enable", issues) ?? true) {
      booleanField(candidate, "debug", issues);
      continue;
    }
    booleanField(candidate, "debug", issues);
    disabledCandidates.add(candidate);
    let consequence: string;
    if (!candidate.source.pack.active) {
      consequence = Messages.src.config.parsing.idSectionSemantics.text0002;
    } else {
      switch (candidate.kind) {
        case "advancement":
          consequence =
            mode === "accurate"
              ? Messages.src.config.parsing.idSectionSemantics.text0003
              : Messages.src.config.parsing.idSectionSemantics.text0004;
          break;
        default:
          consequence =
            mode === "accurate"
              ? Messages.src.config.parsing.idSectionSemantics.text0005(
                  ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND[candidate.kind],
                )
              : Messages.src.config.parsing.idSectionSemantics.text0006;
      }
    }
    issues.push({
      code: "id-section-enable-aborts-family",
      message: Messages.src.config.parsing.idSectionSemantics.text0007(
        ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND[candidate.kind],
        candidate.rawId,
        typeof candidate.value.enable === "string"
          ? JSON.stringify(candidate.value.enable)
          : String(candidate.value.enable),
        consequence,
      ),
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldValueRanges.get("enable") ??
        candidate.source.fieldKeyRanges.get("enable") ??
        candidate.source.entryRange,
    });
    if (candidate.source.pack.active) {
      abortedBatches.add(
        `${canonicalPath(candidate.source.pack.resourcesRoot)}\u0000${ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND[candidate.kind]}`,
      );
    }
  }

  return {
    candidates: configurations.filter((candidate) => {
      if (!candidate.source.pack.active) return true;
      if (
        !abortedBatches.has(
          `${canonicalPath(candidate.source.pack.resourcesRoot)}\u0000${ID_SECTION_PARSER_FAMILY_BY_RESOURCE_KIND[candidate.kind]}`,
        )
      )
        return true;
      return mode === "safer-preview" && !disabledCandidates.has(candidate);
    }),
    issues,
  };
}
