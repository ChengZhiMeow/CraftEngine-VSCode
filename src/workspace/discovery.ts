import { promises as fs, type Stats } from "node:fs";
import path from "node:path";

import type { PackSource } from "../config/model.js";
import { parsePackMetadata } from "../config/parsing/packMetadata.js";
import { canonicalPath } from "../util/paths.js";

export interface DiscoveredWorkspace {
  readonly resourceRoots: readonly string[];
  readonly packs: readonly PackSource[];
  readonly configurationFiles: readonly {
    readonly path: string;
    readonly pack: PackSource;
  }[];
}

export type TextOverlay = ReadonlyMap<string, string>;

async function directory(value: string): Promise<boolean> {
  try {
    return (await fs.stat(value)).isDirectory();
  } catch {
    return false;
  }
}

async function file(value: string): Promise<boolean> {
  try {
    return (await fs.stat(value)).isFile();
  } catch {
    return false;
  }
}

async function hasPackDirectories(value: string): Promise<boolean> {
  try {
    const children = await fs.readdir(value, { withFileTypes: true });
    for (const child of children) {
      if (child.name.startsWith(".")) continue;
      const candidate = path.join(value, child.name);
      if (!(await directory(candidate))) continue;
      if (
        (await file(path.join(candidate, "pack.yml"))) ||
        (await directory(path.join(candidate, "configuration"))) ||
        (await directory(path.join(candidate, "resourcepack"))) ||
        (await directory(path.join(candidate, "subpacks")))
      )
        return true;
    }
  } catch {
    return false;
  }
  return false;
}

async function findNestedResourcesRoot(
  input: string,
): Promise<string | undefined> {
  const start = path.resolve(input);
  if (!(await directory(start))) return undefined;
  const pending = [start];
  const visited = new Set<string>();
  for (let index = 0; index < pending.length; index += 1) {
    const folder = pending[index];
    if (folder === undefined) continue;
    let realFolder: string;
    try {
      realFolder = await fs.realpath(folder);
    } catch {
      continue;
    }
    const realKey = canonicalPath(realFolder);
    if (visited.has(realKey)) continue;
    visited.add(realKey);
    let entries: Array<{
      readonly name: string;
      isDirectory(): boolean;
    }>;
    try {
      entries = await fs.readdir(folder, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }
    const directories: typeof entries = [];
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )) {
      if (await directory(path.join(folder, entry.name)))
        directories.push(entry);
    }
    for (const entry of directories) {
      if (entry.name.toLowerCase() !== "resources") continue;
      const candidate = path.join(folder, entry.name);
      if (
        path.basename(folder).toLowerCase() === "craftengine" ||
        (await hasPackDirectories(candidate))
      ) {
        return path.resolve(candidate);
      }
    }
    for (const entry of directories) {
      switch (entry.name.toLowerCase()) {
        case ".git":
        case ".hg":
        case ".svn":
        case "node_modules":
          continue;
        default:
          pending.push(path.join(folder, entry.name));
      }
    }
  }
  return undefined;
}

export async function findResourcesRoot(
  input: string,
): Promise<string | undefined> {
  const resolvedInput = path.resolve(input);
  let cursor = resolvedInput;
  if (await file(cursor)) cursor = path.dirname(cursor);

  for (const candidate of [
    path.join(cursor, "plugins", "CraftEngine", "resources"),
    path.join(cursor, "resources"),
    cursor,
  ]) {
    if (!(await directory(candidate))) continue;
    if (
      path.basename(candidate).toLowerCase() === "resources" ||
      (await hasPackDirectories(candidate))
    )
      return path.resolve(candidate);
  }

  while (true) {
    if (
      path.basename(cursor).toLowerCase() === "resources" &&
      (await directory(cursor))
    )
      return cursor;
    if (await file(path.join(cursor, "pack.yml"))) {
      const parent = path.dirname(cursor);
      if (path.basename(parent).toLowerCase() === "resources") return parent;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return findNestedResourcesRoot(resolvedInput);
}

export async function discoverResourcesRoots(
  inputs: readonly string[],
  manualRoots: readonly string[] = [],
): Promise<string[]> {
  const result = new Map<string, string>();
  for (const input of [...manualRoots, ...inputs]) {
    const root = await findResourcesRoot(input);
    if (root) result.set(canonicalPath(root), root);
  }
  return [...result.values()];
}

async function readText(
  filePath: string,
  overlay: TextOverlay,
): Promise<string> {
  return overlay.get(canonicalPath(filePath)) ?? fs.readFile(filePath, "utf8");
}

async function listConfigurationFiles(root: string): Promise<string[]> {
  if (!(await directory(root))) return [];
  const result: string[] = [];
  const visited = new Set<string>();
  const visit = async (folder: string): Promise<void> => {
    let realFolder: string;
    try {
      realFolder = await fs.realpath(folder);
    } catch {
      return;
    }
    const realKey = canonicalPath(realFolder);
    if (visited.has(realKey)) return;
    visited.add(realKey);
    let entries: Array<{
      readonly name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = await fs.readdir(folder, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(folder, entry.name);
      let stats: Stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stats.isDirectory()) await visit(fullPath);
      else if (stats.isFile() && /\.(?:ya?ml|json)$/iu.test(entry.name))
        result.push(fullPath);
    }
  };
  await visit(root);
  return result;
}

async function scanPack(
  resourcesRoot: string,
  folderName: string,
  packOrder: number,
  overlay: TextOverlay,
  targetVersion: string,
): Promise<{
  packs: PackSource[];
  files: Array<{ path: string; pack: PackSource }>;
}> {
  const folder = path.join(resourcesRoot, folderName);
  const metadataText = await readText(
    path.join(folder, "pack.yml"),
    overlay,
  ).catch(() => "");
  const {
    namespace,
    enabled,
    activeSubpacks: selected,
  } = parsePackMetadata(metadataText, folderName, targetVersion);
  const selectedSet = new Set(selected);
  const baseResourcePackRoot = path.join(folder, "resourcepack");
  const base: PackSource = {
    resourcesRoot,
    folder,
    name: folderName,
    namespace,
    active: enabled,
    configurationRoot: path.join(folder, "configuration"),
    resourcePackRoot: baseResourcePackRoot,
    baseResourcePackRoot,
    loadOrder: packOrder * 1000,
  };
  const packs: PackSource[] = [base];
  const files = (await listConfigurationFiles(base.configurationRoot)).map(
    (filePath) => ({ path: filePath, pack: base }),
  );

  const subpacksRoot = path.join(folder, "subpacks");
  if (await directory(subpacksRoot)) {
    const entries = await fs.readdir(subpacksRoot, { withFileTypes: true });
    const declarationOrder = new Map(selected.map((id, index) => [id, index]));
    const filesystemOrder = new Map(
      entries.map((entry, index) => [entry.name, index]),
    );
    entries.sort(
      (left, right) =>
        (declarationOrder.get(left.name) ??
          selected.length + (filesystemOrder.get(left.name) ?? 0)) -
        (declarationOrder.get(right.name) ??
          selected.length + (filesystemOrder.get(right.name) ?? 0)),
    );
    let subpackOrder = 1;
    for (const entry of entries) {
      if (!(await directory(path.join(subpacksRoot, entry.name)))) continue;
      const subpackFolder = path.join(subpacksRoot, entry.name);
      const pack: PackSource = {
        resourcesRoot,
        folder,
        name: folderName,
        namespace,
        active: enabled && selectedSet.has(entry.name),
        subpack: entry.name,
        configurationRoot: path.join(subpackFolder, "configuration"),
        resourcePackRoot: path.join(subpackFolder, "resourcepack"),
        baseResourcePackRoot,
        loadOrder: packOrder * 1000 + subpackOrder,
      };
      subpackOrder += 1;
      packs.push(pack);
      files.push(
        ...(await listConfigurationFiles(pack.configurationRoot)).map(
          (filePath) => ({ path: filePath, pack }),
        ),
      );
    }
  }
  return { packs, files };
}

export async function scanResources(
  resourceRoots: readonly string[],
  overlay: TextOverlay = new Map(),
  targetVersion = "26.2",
): Promise<DiscoveredWorkspace> {
  const packs: PackSource[] = [];
  const configurationFiles: Array<{ path: string; pack: PackSource }> = [];
  for (const resourcesRoot of resourceRoots) {
    let entries: Array<{
      readonly name: string;
      isDirectory(): boolean;
    }>;
    try {
      entries = await fs.readdir(resourcesRoot, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }
    let order = 0;
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        !(await directory(path.join(resourcesRoot, entry.name)))
      )
        continue;
      const scanned = await scanPack(
        resourcesRoot,
        entry.name,
        order,
        overlay,
        targetVersion,
      );
      packs.push(...scanned.packs);
      configurationFiles.push(...scanned.files);
      order += 1;
    }
  }
  return { resourceRoots: [...resourceRoots], packs, configurationFiles };
}

export async function discoverWorkspace(
  inputs: readonly string[],
  manualRoots: readonly string[] = [],
  overlay: TextOverlay = new Map(),
  targetVersion = "26.2",
): Promise<DiscoveredWorkspace> {
  const roots = await discoverResourcesRoots(inputs, manualRoots);
  return scanResources(roots, overlay, targetVersion);
}
