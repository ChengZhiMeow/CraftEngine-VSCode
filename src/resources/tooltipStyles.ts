import type { ItemDefinition } from "../config/item/model.js";
import type { CoreIssue } from "../diagnostics/model.js";
import type { ResourceFileCatalog } from "./model.js";
import { makeIdentifier } from "../util/identifiers.js";
import { isRecord } from "../util/records.js";
import { Messages } from "../messages.js";
import {
  normalizeResourceIdentifier,
  preferredResource,
  resourceFilesForRoot,
} from "./catalog.js";

export interface TooltipStyleCompletionCandidate {
  readonly id: string;
  readonly background: boolean;
  readonly frame: boolean;
  readonly complete: boolean;
  readonly detail: string;
}

interface MutableTooltipStyleCandidate {
  background: boolean;
  frame: boolean;
  workspace: boolean;
  vanilla: boolean;
}

interface TooltipStyleReference {
  readonly id: string;
  readonly path: string;
}

function styleSprite(
  identifier: string,
): { readonly id: string; readonly part: "background" | "frame" } | undefined {
  const normalized = normalizeResourceIdentifier(
    "texture",
    identifier,
  ).toLowerCase();
  const separator = normalized.indexOf(":");
  const match = /^gui\/sprites\/tooltip\/(.+)_(background|frame)$/u.exec(
    normalized.slice(separator + 1),
  );
  if (!match?.[1] || (match[2] !== "background" && match[2] !== "frame"))
    return undefined;
  return {
    id: `${normalized.slice(0, separator)}:${match[1]}`,
    part: match[2],
  };
}

export function tooltipStyleCompletionCandidates(
  resources: ResourceFileCatalog,
  resourcesRoot: string,
  vanillaTextureIdentifiers: Iterable<string> = [],
): readonly TooltipStyleCompletionCandidate[] {
  const byId = new Map<string, MutableTooltipStyleCandidate>();
  const add = (identifier: string, source: "workspace" | "vanilla"): void => {
    const sprite = styleSprite(identifier);
    if (!sprite) return;
    const candidate = byId.get(sprite.id) ?? {
      background: false,
      frame: false,
      workspace: false,
      vanilla: false,
    };
    candidate[sprite.part] = true;
    candidate[source] = true;
    byId.set(sprite.id, candidate);
  };
  for (const file of resourceFilesForRoot(
    resources,
    resourcesRoot,
    "texture",
  )) {
    if (file.active) add(file.id, "workspace");
  }
  for (const identifier of vanillaTextureIdentifiers)
    add(identifier, "vanilla");
  return [...byId]
    .map(([id, candidate]) => {
      return {
        id,
        background: candidate.background,
        frame: candidate.frame,
        complete: candidate.background && candidate.frame,
        detail: Messages.src.config.item.tooltipStyles.text0004(
          candidate.background
            ? Messages.src.config.item.tooltipStyles.text0006
            : Messages.src.config.item.tooltipStyles.text0007,
          candidate.frame
            ? Messages.src.config.item.tooltipStyles.text0006
            : Messages.src.config.item.tooltipStyles.text0007,
          candidate.workspace && candidate.vanilla
            ? Messages.src.config.item.tooltipStyles.text0001
            : candidate.workspace
              ? Messages.src.config.item.tooltipStyles.text0002
              : Messages.src.config.item.tooltipStyles.text0003,
        ),
      };
    })
    .sort(
      (left, right) =>
        Number(right.complete) - Number(left.complete) ||
        left.id.localeCompare(right.id),
    );
}

function references(item: ItemDefinition): TooltipStyleReference[] {
  const result: TooltipStyleReference[] = [];
  for (const rootKey of ["data", "client_bound_data", "client-bound-data"]) {
    const root = item.raw[rootKey];
    if (!isRecord(root)) continue;
    for (const key of ["tooltip_style", "tooltip-style"]) {
      if (typeof root[key] === "string")
        result.push({
          id: makeIdentifier(root[key], "minecraft"),
          path: `${rootKey}.${key}`,
        });
    }
    for (const componentKey of ["components", "component"]) {
      const components = root[componentKey];
      if (!isRecord(components)) continue;
      const value =
        components["minecraft:tooltip_style"] ?? components.tooltip_style;
      if (typeof value === "string") {
        result.push({
          id: makeIdentifier(value, "minecraft"),
          path: `${rootKey}.${componentKey}.${Object.hasOwn(components, "minecraft:tooltip_style") ? "minecraft:tooltip_style" : "tooltip_style"}`,
        });
      }
    }
  }
  return result;
}

export function validateTooltipStyles(
  items: readonly ItemDefinition[],
  resources: ResourceFileCatalog,
  includeInactive: boolean,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  for (const item of items) {
    if (!includeInactive && !item.source.pack.active) continue;
    for (const reference of references(item)) {
      const separator = reference.id.indexOf(":");
      const missing = (["background", "frame"] as const)
        .map((part) => ({
          part,
          id: `${reference.id.slice(0, separator)}:gui/sprites/tooltip/${reference.id.slice(separator + 1)}_${part}`,
        }))
        .filter(
          ({ id }) =>
            !preferredResource(
              resources,
              item.source.pack.resourcesRoot,
              "texture",
              id,
            ),
        );
      if (missing.length === 0) continue;
      issues.push({
        code: "missing-tooltip-style-sprite",
        message: Messages.src.config.item.tooltipStyles.text0005(
          reference.id,
          missing
            .map(({ part, id }) =>
              Messages.src.config.item.tooltipStyles.text0010(
                part === "background"
                  ? Messages.src.config.item.tooltipStyles.text0008
                  : Messages.src.config.item.tooltipStyles.text0009,
                id,
              ),
            )
            .join("、"),
        ),
        severity: "error",
        uri: item.source.uri,
        range:
          item.source.fieldValueRanges.get(reference.path) ??
          item.source.fieldKeyRanges.get(reference.path) ??
          item.source.idRange,
      });
    }
  }
  return issues;
}
