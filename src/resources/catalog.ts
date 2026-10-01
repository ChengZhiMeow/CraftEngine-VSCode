import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { TextureCandidate } from "../config/image/model.js";
import type { PackSource } from "../config/model.js";
import { groupBy } from "../util/collections.js";
import { canonicalPath, samePath } from "../util/paths.js";
import type {
  ResourceFile,
  ResourceFileCatalog,
  ResourceFileKind,
} from "./model.js";

interface FolderSpec {
  readonly folder: string;
  readonly kind: ResourceFileKind;
  readonly extension: string;
}

const FOLDERS: readonly FolderSpec[] = [
  { folder: "textures", kind: "texture", extension: ".png" },
  { folder: "font", kind: "font", extension: ".json" },
  { folder: "models", kind: "model", extension: ".json" },
  { folder: "items", kind: "item-model", extension: ".json" },
  { folder: "blockstates", kind: "blockstate", extension: ".json" },
  { folder: "lang", kind: "language", extension: ".json" },
  { folder: "equipment", kind: "equipment", extension: ".json" },
  { folder: "sounds", kind: "sound-file", extension: ".ogg" },
];

type ResourceTextOverlay = ReadonlyMap<string, string>;

interface ResourceTextInfo {
  readonly text: string;
  readonly hasUtf8Bom: boolean;
}

interface ResourceOverlayDocument {
  readonly languageId: string;
  readonly isDirty: boolean;
  readonly uri: {
    readonly scheme: string;
    readonly fsPath: string;
  };
  getText(): string;
}

  // 只有未保存的本地 JSON 可以覆盖磁盘, 已保存文件不能恢复已删除资源
export function resourceOverlayForDocuments(
  documents: readonly ResourceOverlayDocument[],
): ResourceTextOverlay {
  const result = new Map<string, string>();
  for (const document of documents) {
    if (
      document.languageId !== "json" ||
      !document.isDirty ||
      document.uri.scheme !== "file"
    )
      continue;
    result.set(canonicalPath(document.uri.fsPath), document.getText());
  }
  return result;
}

export function normalizeResourceIdentifier(
  kind: ResourceFileKind,
  identifier: string,
): string {
  const separator = identifier.indexOf(":");
  let value = separator < 0 ? identifier : identifier.slice(separator + 1);
  value = value.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  let folder: string;
  switch (kind) {
    case "texture":
      folder = "textures";
      break;
    case "model":
      folder = "models";
      break;
    case "item-model":
      folder = "items";
      break;
    case "blockstate":
      folder = "blockstates";
      break;
    case "font":
      folder = "font";
      break;
    case "language":
      folder = "lang";
      break;
    case "equipment":
      folder = "equipment";
      break;
    case "sound-file":
      folder = "sounds";
      break;
    case "sounds-json":
      folder = "";
      break;
  }
  if (value.startsWith(`${folder}/`)) value = value.slice(folder.length + 1);
  value = value.replace(
    kind === "texture"
      ? /\.png$/iu
      : kind === "sound-file"
        ? /\.ogg$/iu
        : /\.json$/iu,
    "",
  );
  return `${separator < 0 ? "minecraft" : identifier.slice(0, separator)}:${value}`;
}

function resourceAtPath(
  pack: PackSource,
  filePath: string,
): { kind: ResourceFileKind; id: string } | undefined {
  if (path.basename(filePath).toLowerCase() === "_index.json") return undefined;
  const relative = path.relative(
    path.join(pack.resourcePackRoot, "assets"),
    filePath,
  );
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  const segments = relative.split(path.sep);
  const namespace = segments.shift();
  const folder = segments.shift();
  if (!namespace || !folder) return undefined;
  if (folder.toLowerCase() === "sounds.json" && segments.length === 0) {
    return { kind: "sounds-json", id: `${namespace}:sounds` };
  }
  const spec = FOLDERS.find((entry) => entry.folder === folder);
  const relativeFile = segments.join("/");
  if (!spec || !relativeFile.toLowerCase().endsWith(spec.extension))
    return undefined;
  return {
    kind: spec.kind,
    id: normalizeResourceIdentifier(spec.kind, `${namespace}:${relativeFile}`),
  };
}

async function visit(
  folder: string,
  extension: string,
  result: string[],
): Promise<void> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(folder, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(target, extension, result);
      else if (
        entry.isFile() &&
        path.basename(target).toLowerCase() !== "_index.json" &&
        entry.name.toLowerCase().endsWith(extension)
      )
        result.push(target);
    }),
  );
}

function keyOf(file: ResourceFile): string {
  return `${file.kind}\u0000${normalizeResourceIdentifier(file.kind, file.id)}`;
}

export function resourceFilesForRoot(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  kind?: ResourceFileKind,
): readonly ResourceFile[] {
  // 循环不变量提到遍历外: 原本每条目都要重算两次 canonicalPath
  const canonicalRoot = canonicalPath(resourcesRoot);
  return (
    kind === undefined ? catalog.files : (catalog.byKind.get(kind) ?? [])
  ).filter((file) => canonicalPath(file.pack.resourcesRoot) === canonicalRoot);
}

export function resourceCandidates(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  kind: ResourceFileKind,
  identifier: string,
): readonly ResourceFile[] {
  return (
    catalog.byKey.get(
      `${kind}\u0000${normalizeResourceIdentifier(kind, identifier)}`,
    ) ?? []
  ).filter((file) => samePath(file.pack.resourcesRoot, resourcesRoot));
}

export function effectiveResource(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  kind: ResourceFileKind,
  identifier: string,
): ResourceFile | undefined {
  return resourceCandidates(catalog, resourcesRoot, kind, identifier).find(
    (file) => file.effective,
  );
}

export function preferredResource(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  kind: ResourceFileKind,
  identifier: string,
): ResourceFile | undefined {
  const candidates = resourceCandidates(
    catalog,
    resourcesRoot,
    kind,
    identifier,
  );
  return candidates.find((file) => file.effective) ?? candidates[0];
}

export function resourceIdentifiers(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  kind: ResourceFileKind,
): readonly string[] {
  return [
    ...new Set(
      resourceFilesForRoot(catalog, resourcesRoot, kind).map((file) => file.id),
    ),
  ].sort();
}

export function textureCandidatesForRoot(
  catalog: ResourceFileCatalog,
  resourcesRoot: string,
  identifier: string,
): readonly TextureCandidate[] {
  return resourceCandidates(catalog, resourcesRoot, "texture", identifier).map(
    (file) => ({
      path: file.path,
      resourcePackRoot: file.pack.resourcePackRoot,
      effective: file.effective,
    }),
  );
}

export async function readResourceTextInfo(
  file: ResourceFile,
): Promise<ResourceTextInfo> {
  const text = file.text ?? (await fs.readFile(file.path, "utf8"));
  return {
    text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text,
    hasUtf8Bom: text.charCodeAt(0) === 0xfeff,
  };
}

export async function readResourceText(file: ResourceFile): Promise<string> {
  return (await readResourceTextInfo(file)).text;
}

export async function scanResourceFiles(
  packs: readonly PackSource[],
  overlay: ResourceTextOverlay = new Map(),
): Promise<ResourceFileCatalog> {
  const files: ResourceFile[] = [];
  const paths = new Set<string>();
  const ordered = [...packs].sort(
    (left, right) => left.loadOrder - right.loadOrder,
  );
  for (const pack of ordered) {
    const assetsRoot = path.join(pack.resourcePackRoot, "assets");
    let namespaces: Dirent<string>[];
    try {
      namespaces = await fs.readdir(assetsRoot, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }
    for (const namespace of namespaces) {
      if (!namespace.isDirectory()) continue;
      const soundsJsonPath = path.join(
        assetsRoot,
        namespace.name,
        "sounds.json",
      );
      const soundsJson = await fs.stat(soundsJsonPath).catch(() => undefined);
      if (soundsJson?.isFile()) {
        const overlayText = overlay.get(canonicalPath(soundsJsonPath));
        files.push({
          kind: "sounds-json",
          id: `${namespace.name}:sounds`,
          path: soundsJsonPath,
          pack,
          active: pack.active,
          effective: false,
          ...(overlayText === undefined ? {} : { text: overlayText }),
        });
        paths.add(canonicalPath(soundsJsonPath));
      }
      for (const spec of FOLDERS) {
        const root = path.join(assetsRoot, namespace.name, spec.folder);
        const found: string[] = [];
        await visit(root, spec.extension, found);
        for (const filePath of found.sort()) {
          const relative = path
            .relative(root, filePath)
            .split(path.sep)
            .join("/")
            .slice(0, -spec.extension.length);
          const overlayText = overlay.get(canonicalPath(filePath));
          files.push({
            kind: spec.kind,
            id: normalizeResourceIdentifier(
              spec.kind,
              `${namespace.name}:${relative}`,
            ),
            path: filePath,
            pack,
            active: pack.active,
            effective: false,
            ...(overlayText === undefined ? {} : { text: overlayText }),
          });
          paths.add(canonicalPath(filePath));
        }
      }
    }
  }

  // 未保存的新 JSON 只在已发现的资源包内参与资源层
  for (const [filePath, text] of overlay) {
    if (paths.has(canonicalPath(filePath))) continue;
    const pack = ordered.find(
      (candidate) => resourceAtPath(candidate, filePath) !== undefined,
    );
    if (!pack) continue;
    const parsed = resourceAtPath(pack, filePath);
    if (!parsed || parsed.kind === "texture") continue;
    files.push({
      kind: parsed.kind,
      id: parsed.id,
      path: filePath,
      pack,
      active: pack.active,
      effective: false,
      text,
    });
  }

  files.sort((left, right) => left.pack.loadOrder - right.pack.loadOrder);

  const selected = new Set<ResourceFile>();
  const occupied = new Set<string>();
  for (const file of files) {
    const scoped = `${canonicalPath(file.pack.resourcesRoot)}\u0000${keyOf(file)}`;
    if (!file.active || occupied.has(scoped)) continue;
    occupied.add(scoped);
    selected.add(file);
  }
  const resolved = files.map((file) =>
    selected.has(file) ? { ...file, effective: true } : file,
  );
  return {
    files: resolved,
    byKind: groupBy(resolved, (file) => file.kind),
    byKey: groupBy(resolved, keyOf),
  };
}
