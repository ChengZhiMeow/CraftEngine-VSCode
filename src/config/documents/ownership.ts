import path from "node:path";

import { isPathInside, samePath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import type { PackSource, ParsedYamlFile } from "../model.js";
import { getSectionFamily } from "../registry/sectionRegistry.js";

export type WorkspaceStandaloneKind =
  | "config"
  | "commands"
  | "pack"
  | "translation";
export type WorkspaceConfigurationDocumentKind =
  | "configuration"
  | WorkspaceStandaloneKind;

export interface WorkspaceStandaloneDescriptor {
  readonly kind: WorkspaceStandaloneKind;
  readonly resourcesRoot: string;
  readonly locale?: string;
}

export function standaloneDescriptorForWorkspace(
  filePath: string,
  resourceRoots: readonly string[],
  packs: readonly PackSource[],
): WorkspaceStandaloneDescriptor | undefined {
  for (const resourcesRoot of resourceRoots) {
    const pluginRoot = path.dirname(resourcesRoot);
    if (samePath(filePath, path.join(pluginRoot, "config.yml")))
      return { kind: "config", resourcesRoot };
    if (samePath(filePath, path.join(pluginRoot, "commands.yml")))
      return { kind: "commands", resourcesRoot };
    if (
      samePath(path.dirname(filePath), path.join(pluginRoot, "translations")) &&
      path.extname(filePath).toLowerCase() === ".yml"
    ) {
      return {
        kind: "translation",
        resourcesRoot,
        locale: path.basename(filePath, path.extname(filePath)),
      };
    }
  }
  for (const pack of packs) {
    if (
      !pack.subpack &&
      samePath(filePath, path.join(pack.folder, "pack.yml"))
    ) {
      return { kind: "pack", resourcesRoot: pack.resourcesRoot };
    }
  }
  return undefined;
}

export function configurationDocumentKindForWorkspace(
  filePath: string,
  resourceRoots: readonly string[],
  packs: readonly PackSource[],
): WorkspaceConfigurationDocumentKind | undefined {
  const standalone = standaloneDescriptorForWorkspace(
    filePath,
    resourceRoots,
    packs,
  );
  if (standalone) return standalone.kind;
  if (!/\.(?:ya?ml|json)$/iu.test(path.extname(filePath))) return undefined;
  return packs.some((pack) => isPathInside(filePath, pack.configurationRoot))
    ? "configuration"
    : undefined;
}

export function isCraftEngineSingleConfigurationFile(
  parsed: ParsedYamlFile,
): boolean {
  return parsed.sections.some(
    (section) =>
      getSectionFamily(section.type) !== undefined && isRecord(section.value),
  );
}
