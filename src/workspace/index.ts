import { promises as fs } from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

import { Messages } from "../messages.js";

import {
  discoverWorkspace,
  type DiscoveredWorkspace,
  type TextOverlay,
} from "./discovery.js";
import { type DocumentCatalog, WorkspaceCatalogSnapshot } from "./catalog.js";
import type { GlobalVariableCatalog } from "../config/text/globalVariables.js";
import {
  normalizeResourceIdentifier,
  resourceOverlayForDocuments,
  resourceCandidates,
  resourceIdentifiers,
  scanResourceFiles,
  textureCandidatesForRoot,
} from "../resources/catalog.js";
import type {
  ConfigurationTemplateDefinition,
  OpaqueIdDefinition,
  PackSource,
  ParsedYamlFile,
} from "../config/model.js";
import type { EquipmentDefinition } from "../config/equipment/model.js";
import type {
  GenericResourceDefinition,
  GenericResourceKind,
} from "../config/resource/model.js";
import type {
  ImageDefinition,
  TextureCandidate,
} from "../config/image/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import type { JukeboxSongDefinition } from "../config/jukebox/model.js";
import type {
  ResourceFile,
  ResourceFileCatalog,
  ResourceFileKind,
} from "../resources/model.js";
import {
  configurationDocumentKindForWorkspace,
  isCraftEngineSingleConfigurationFile,
  standaloneDescriptorForWorkspace,
  type WorkspaceConfigurationDocumentKind,
  type WorkspaceStandaloneDescriptor,
  type WorkspaceStandaloneKind,
} from "../config/documents/ownership.js";
import {
  blockStatePreviews,
  type BlockStatePreview,
} from "../preview/block/data.js";
import {
  configurationTemplatesForPack,
  type ParsedPackFile,
} from "../config/template/expander.js";
import type { VanillaCatalog } from "../minecraft/catalog.js";
import type { VanillaSoundCatalog } from "../minecraft/catalog.js";
import type { VanillaAssetStore } from "../minecraft/assets/store.js";
import { parseCraftEngineYaml } from "../config/parsing/craftEngineYaml.js";
import {
  materializeStandaloneTranslationFile,
  standaloneTranslationPack,
} from "../config/text/standaloneTranslations.js";
import type { WorkspaceIndex, WorkspaceDocumentIndex } from "./model.js";
import { EMPTY_DOCUMENT_INDEX } from "./model.js";
import { canonicalPath, isPathInside } from "../util/paths.js";
import { CURRENT_CONFIG_VERSION } from "../config/registry/legacyKeys.js";
import type { TextRange } from "../diagnostics/model.js";
import {
  scanBlueprintFiles,
  scanScriptFiles,
  type BlueprintReference,
  type ScriptReference,
} from "../references/blueprintScript.js";
import { publishWorkspaceDiagnostics } from "./diagnosticsPublisher.js";
import { RebuildCoordinator } from "./rebuildCoordinator.js";
import {
  buildWorkspaceSnapshot,
  emptyWorkspaceSnapshot,
  type ParsedWorkspaceStandaloneFile,
} from "./buildSnapshot.js";

interface ParsedCacheEntry {
  readonly text: string;
  readonly parsed: ParsedYamlFile;
}

interface PngCacheEntry {
  readonly modified: number;
  readonly size: number;
  readonly width: number;
  readonly height: number;
}

const WATCHED_GLOB = "**/*.{yml,yaml,png,json,mcmeta,ogg,js,bbmodel}";

type WatchEventKind = "create" | "change" | "delete";

function referenceAtOffset<T extends { readonly range: TextRange }>(
  references: readonly T[],
  offset: number,
): T | undefined {
  return references.find(
    (reference) =>
      offset >= reference.range.start && offset <= reference.range.end,
  );
}

  // 与 config/validation/standalone.ts 的 versionScalarText 同语义: 字符串原样取值,
  // 数字只认 `114` 这类规范十进制标量文本
function declaredConfigVersion(parsed: ParsedYamlFile): number | undefined {
  for (const section of parsed.sections) {
    if (section.key !== "___version___" && section.key !== "config-version")
      continue;
    const value = section.value;
    const text =
      typeof value === "string"
        ? value
        : typeof value === "number"
          ? parsed.text.slice(section.valueRange.start, section.valueRange.end)
          : undefined;
    if (text === undefined || !/^(?:0|[1-9]\d*)$/u.test(text)) return undefined;
    return Number(text);
  }
  return undefined;
}

  // 资源段文件没有版本标记, 用工作区 config.yml 声明的版本; 读不到时按当前版本处理
function workspaceConfigVersion(
  files: readonly ParsedWorkspaceStandaloneFile[],
): number {
  for (const file of files) {
    if (path.basename(file.path) !== "config.yml") continue;
    const version = declaredConfigVersion(file.rawParsed);
    if (version !== undefined) return version;
  }
  return CURRENT_CONFIG_VERSION;
}

export class CraftEngineWorkspaceIndex implements vscode.Disposable {
  private current: WorkspaceIndex = emptyWorkspaceSnapshot();
  private discovered: DiscoveredWorkspace = {
    resourceRoots: [],
    packs: [],
    configurationFiles: [],
  };
  private readonly emitter = new vscode.EventEmitter<WorkspaceIndex>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly rootWatchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly parsedCache = new Map<string, ParsedCacheEntry>();
  private readonly pngCache = new Map<string, PngCacheEntry>();
  private readonly rebuildCoordinator: RebuildCoordinator<WorkspaceIndex>;
  private generation = 0;
  private resourceFilesDirty = true;
  private resourceFilesSignature = "";
  private scriptFilesDirty = true;
  private scriptFilesSignature = "";
  private blueprintFilesDirty = true;
  private blueprintFilesSignature = "";
  private currentGlobalVariables: GlobalVariableCatalog | undefined;
  // 工作区 config.yml 声明的版本, 资源段文件没有版本标记时按它放宽旧键
  private configVersion: number = CURRENT_CONFIG_VERSION;
  private previewGeneration = -1;
  private previewsByUri:
    | ReadonlyMap<string, readonly BlockStatePreview[]>
    | undefined;
  private identifierGeneration = -1;
  private readonly identifierCache = new Map<string, readonly string[]>();

  public readonly onDidChange = this.emitter.event;

    // 文件系统事件与两个根监听器共用的一份脏标记
  private readonly watched = (
    uri: vscode.Uri,
    kind: WatchEventKind,
  ): void => {
    const isBlueprint = /\.bbmodel$/iu.test(uri.path);
    const isScript = /\.js$/iu.test(uri.path);
    // 脚本与蓝图目录快照只保存路径集合, 内容变更不影响任何索引数据
    if (kind === "change" && (isBlueprint || isScript)) return;
    if (uri.path.toLowerCase().endsWith(".png"))
      this.pngCache.delete(canonicalPath(uri.fsPath));
    if (/\.(?:png|json|mcmeta|ogg)$/iu.test(uri.path))
      this.resourceFilesDirty = true;
    if (isBlueprint) this.blueprintFilesDirty = true;
    if (isScript) this.scriptFilesDirty = true;
    this.scheduleRebuild();
  };

  public constructor(
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly vanillaCatalog?: VanillaCatalog,
    private readonly vanillaSoundCatalog?: VanillaSoundCatalog,
    private readonly vanillaAssets?: VanillaAssetStore,
  ) {
    this.rebuildCoordinator = new RebuildCoordinator(
      () => this.build(),
      (error) => console.error(Messages.src.workspace.index.text0001, error),
    );
    const watcher = vscode.workspace.createFileSystemWatcher(WATCHED_GLOB);
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => this.watched(uri, "create")),
      watcher.onDidChange((uri) => this.watched(uri, "change")),
      watcher.onDidDelete((uri) => this.watched(uri, "delete")),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === "json")
          this.resourceFilesDirty = true;
        if (
          event.document.languageId === "yaml" ||
          event.document.languageId === "json"
        )
          this.scheduleRebuild(90);
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === "json") this.resourceFilesDirty = true;
        if (document.languageId === "yaml" || document.languageId === "json")
          this.scheduleRebuild();
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === "json") this.resourceFilesDirty = true;
        if (document.languageId === "yaml" || document.languageId === "json")
          this.scheduleRebuild();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() =>
        this.scheduleRebuild(),
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("craftengineYaml"))
          this.scheduleRebuild();
      }),
    );
  }

  public get index(): WorkspaceIndex {
    return this.current;
  }

  public get catalog(): WorkspaceCatalogSnapshot {
    return new WorkspaceCatalogSnapshot(this.current);
  }

  public forDocument(
    document: vscode.TextDocument,
  ): DocumentCatalog | undefined {
    const root = this.rootForDocument(document);
    return root ? this.catalog.forRoot(root) : undefined;
  }

  public get packs(): readonly PackSource[] {
    return this.discovered.packs;
  }

  public get vanilla(): VanillaCatalog | undefined {
    return this.vanillaCatalog;
  }

  public get vanillaSounds(): VanillaSoundCatalog | undefined {
    return this.vanillaSoundCatalog;
  }

  public get globalVariables(): GlobalVariableCatalog | undefined {
    return this.currentGlobalVariables;
  }

  public standaloneKindForDocument(
    document: vscode.TextDocument,
  ): WorkspaceStandaloneKind | undefined {
    if (document.uri.scheme !== "file") return undefined;
    return this.standaloneDescriptor(document.uri.fsPath)?.kind;
  }

  public configurationDocumentKind(
    document: vscode.TextDocument,
  ): WorkspaceConfigurationDocumentKind | undefined {
    if (document.uri.scheme !== "file") return undefined;
    const owned = configurationDocumentKindForWorkspace(
      document.uri.fsPath,
      this.discovered.resourceRoots,
      this.discovered.packs,
    );
    if (owned !== undefined) return owned;
    if (!/\.(?:ya?ml|json)$/iu.test(path.extname(document.uri.fsPath)))
      return undefined;
    if (
      this.discovered.resourceRoots.some((root) =>
        isPathInside(document.uri.fsPath, root),
      )
    )
      return undefined;
    if (this.discovered.resourceRoots.length > 0) return undefined;
    const parsed = this.parse(document.uri.fsPath, document.getText());
    return isCraftEngineSingleConfigurationFile(parsed)
      ? "configuration"
      : undefined;
  }

  public scheduleRebuild(delay = 180): void {
    this.rebuildCoordinator.schedule(delay);
  }

  public async rebuild(): Promise<WorkspaceIndex> {
    return this.rebuildCoordinator.rebuild();
  }

  public async rebuildFromScratch(): Promise<WorkspaceIndex> {
    return this.rebuildCoordinator.rebuildFromScratch(() => {
      this.parsedCache.clear();
      this.pngCache.clear();
      this.resourceFilesDirty = true;
      this.resourceFilesSignature = "";
      this.scriptFilesDirty = true;
      this.scriptFilesSignature = "";
      this.blueprintFilesDirty = true;
      this.blueprintFilesSignature = "";
      this.discovered = {
        resourceRoots: [],
        packs: [],
        configurationFiles: [],
      };
      this.current = emptyWorkspaceSnapshot();
      this.currentGlobalVariables = undefined;
      this.diagnostics.clear();
      this.emitter.fire(this.current);
    });
  }

  private overlay(): TextOverlay {
    const result = new Map<string, string>();
    for (const document of vscode.workspace.textDocuments) {
      if (
        (document.languageId === "yaml" || document.languageId === "json") &&
        document.uri.scheme === "file"
      ) {
        result.set(canonicalPath(document.uri.fsPath), document.getText());
      }
    }
    return result;
  }

  private resourceOverlay(): ReadonlyMap<string, string> {
    return resourceOverlayForDocuments(vscode.workspace.textDocuments);
  }

  private manualRoots(): string[] {
    const roots: string[] = [];
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const configured = vscode.workspace
        .getConfiguration("craftengineYaml", folder.uri)
        .get<string>("resourcesRoot", "")
        .trim();
      if (configured)
        roots.push(
          path.isAbsolute(configured)
            ? configured
            : path.resolve(folder.uri.fsPath, configured),
        );
    }
    if (folders.length === 0) {
      const configured = vscode.workspace
        .getConfiguration("craftengineYaml")
        .get<string>("resourcesRoot", "")
        .trim();
      if (configured) roots.push(path.resolve(configured));
    }
    return roots;
  }

  private syntheticPack(filePath: string, resourcesRoot?: string): PackSource {
    const folder = resourcesRoot
      ? path.join(resourcesRoot, "__single_file__")
      : path.dirname(filePath);
    const candidate =
      this.discovered.packs.find(
        (pack) =>
          !pack.subpack &&
          resourcesRoot !== undefined &&
          canonicalPath(pack.resourcesRoot) === canonicalPath(resourcesRoot) &&
          pack.active,
      ) ??
      this.discovered.packs.find(
        (pack) =>
          !pack.subpack &&
          resourcesRoot !== undefined &&
          canonicalPath(pack.resourcesRoot) === canonicalPath(resourcesRoot),
      );
    if (candidate)
      return { ...candidate, configurationRoot: path.dirname(filePath) };
    const baseResourcePackRoot = path.join(folder, "resourcepack");
    return {
      resourcesRoot: resourcesRoot ?? path.dirname(filePath),
      folder,
      name: path.basename(folder),
      namespace: "default",
      active: true,
      configurationRoot: path.dirname(filePath),
      resourcePackRoot: baseResourcePackRoot,
      baseResourcePackRoot,
      blueprintRoot: path.join(folder, "blueprint"),
      scriptRoot: path.join(folder, "script"),
      loadOrder: Number.MAX_SAFE_INTEGER,
    };
  }

  private packForOpenFile(filePath: string): PackSource {
    const direct = this.discovered.packs
      .filter((pack) => isPathInside(filePath, pack.configurationRoot))
      .sort(
        (left, right) =>
          right.configurationRoot.length - left.configurationRoot.length,
      )[0];
    if (direct) return direct;
    const root =
      this.discovered.resourceRoots
        .filter((candidate) => isPathInside(filePath, candidate))
        .sort((left, right) => right.length - left.length)[0] ??
      (this.manualRoots().length === 1 ? this.manualRoots()[0] : undefined);
    return this.syntheticPack(filePath, root);
  }

  private parse(filePath: string, text: string): ParsedYamlFile {
    const key = canonicalPath(filePath);
    const cached = this.parsedCache.get(key);
    if (cached?.text === text) return cached.parsed;
    const parsed = parseCraftEngineYaml(
      vscode.Uri.file(filePath).toString(),
      text,
    );
    this.parsedCache.set(key, { text, parsed });
    return parsed;
  }

  // 只读 PNG 头的 IHDR 宽高, 不做完整解码: Minecraft 自己读 PNG 不校验 CRC,
  // CraftEngine 26.7/26.8 默认资源包里就有 IEND CRC 为 0 的 PNG,
  // 用严格解码器会把这些贴图判成不存在并误报 missing-texture。
  private async pngDimensions(
    filePath: string,
  ): Promise<{ width: number; height: number } | undefined> {
    try {
      const stat = await fs.stat(filePath);
      const key = canonicalPath(filePath);
      const cached = this.pngCache.get(key);
      if (
        cached &&
        cached.modified === stat.mtimeMs &&
        cached.size === stat.size
      )
        return cached;
      const header = Buffer.alloc(24);
      const handle = await fs.open(filePath, "r");
      try {
        const { bytesRead } = await handle.read(header, 0, 24, 0);
        if (bytesRead < 24) return undefined;
      } finally {
        await handle.close();
      }
      // PNG 签名 + IHDR 块名
      if (
        header.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        header.subarray(12, 16).toString("latin1") !== "IHDR"
      )
        return undefined;
      const entry = {
        modified: stat.mtimeMs,
        size: stat.size,
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20),
      };
      this.pngCache.set(key, entry);
      return entry;
    } catch {
      return undefined;
    }
  }

  private async textures(
    resources: ResourceFileCatalog,
    namespace: string,
    imagePath: string,
    source: ImageDefinition["source"],
  ): Promise<TextureCandidate[]> {
    const candidates: TextureCandidate[] = [];
    const identifier = `${namespace}:${imagePath.replace(/\.png$/iu, "")}`;
    for (const candidate of textureCandidatesForRoot(
      resources,
      source.pack.resourcesRoot,
      `${namespace}:${imagePath}`,
    )) {
      const dimensions = await this.pngDimensions(candidate.path);
      if (!dimensions) continue;
      candidates.push({
        ...candidate,
        width: dimensions.width,
        height: dimensions.height,
      });
    }
    if (this.vanillaAssets && this.vanillaCatalog?.textures.has(identifier)) {
      try {
        const vanillaPath = await this.vanillaAssets.resource(
          identifier,
          "texture",
        );
        const dimensions = await this.pngDimensions(vanillaPath);
        candidates.push({
          path: vanillaPath,
          resourcePackRoot: this.vanillaAssets.cacheRoot,
          effective: !candidates.some((candidate) => candidate.effective),
          ...(dimensions ?? {}),
        });
      } catch {
        return candidates;
      }
    }
    return candidates;
  }

  private installRootWatchers(): void {
    const wanted = new Set(this.discovered.resourceRoots.map(canonicalPath));
    for (const [root, watcher] of this.rootWatchers) {
      if (!wanted.has(root)) {
        watcher.dispose();
        this.rootWatchers.delete(root);
      }
    }
    for (const resourceRoot of this.discovered.resourceRoots) {
      const key = canonicalPath(resourceRoot);
      if (this.rootWatchers.has(key)) continue;
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(resourceRoot, WATCHED_GLOB),
      );
      watcher.onDidCreate(
        (uri) => this.watched(uri, "create"),
        undefined,
        this.disposables,
      );
      watcher.onDidChange(
        (uri) => this.watched(uri, "change"),
        undefined,
        this.disposables,
      );
      watcher.onDidDelete(
        (uri) => this.watched(uri, "delete"),
        undefined,
        this.disposables,
      );
      this.rootWatchers.set(key, watcher);
    }
  }

  private standaloneDescriptor(
    filePath: string,
  ): WorkspaceStandaloneDescriptor | undefined {
    return standaloneDescriptorForWorkspace(
      filePath,
      this.discovered.resourceRoots,
      this.discovered.packs,
    );
  }

  private async standaloneFiles(
    overlay: TextOverlay,
  ): Promise<readonly ParsedWorkspaceStandaloneFile[]> {
    const paths = new Map<
      string,
      {
        readonly path: string;
        readonly descriptor: WorkspaceStandaloneDescriptor;
      }
    >();
    const add = (filePath: string): void => {
      const descriptor = this.standaloneDescriptor(filePath);
      if (descriptor)
        paths.set(canonicalPath(filePath), { path: filePath, descriptor });
    };
    for (const resourcesRoot of this.discovered.resourceRoots) {
      const pluginRoot = path.dirname(resourcesRoot);
      add(path.join(pluginRoot, "config.yml"));
      add(path.join(pluginRoot, "commands.yml"));
      const translationsRoot = path.join(pluginRoot, "translations");
      for (const entry of await fs
        .readdir(translationsRoot, { withFileTypes: true })
        .catch(() => [])) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".yml"))
          add(path.join(translationsRoot, entry.name));
      }
    }
    for (const pack of this.discovered.packs)
      if (!pack.subpack) add(path.join(pack.folder, "pack.yml"));
    for (const filePath of overlay.keys()) add(filePath);

    const result: ParsedWorkspaceStandaloneFile[] = [];
    for (const candidate of paths.values()) {
      try {
        const text =
          overlay.get(canonicalPath(candidate.path)) ??
          (await fs.readFile(candidate.path, "utf8"));
        const raw = this.parse(candidate.path, text);
        const parsed =
          candidate.descriptor.kind === "translation" &&
          candidate.descriptor.locale
            ? materializeStandaloneTranslationFile(
                raw,
                candidate.descriptor.locale,
              )
            : raw;
        const basePack = this.discovered.packs.find(
          (entry) =>
            !entry.subpack &&
            canonicalPath(entry.resourcesRoot) ===
              canonicalPath(candidate.descriptor.resourcesRoot),
        );
        const pack =
          candidate.descriptor.kind === "translation"
            ? standaloneTranslationPack(
                candidate.descriptor.resourcesRoot,
                this.discovered.packs,
              )
            : basePack;
        result.push({
          path: candidate.path,
          rawParsed: raw,
          parsed,
          ...candidate.descriptor,
          ...(pack === undefined ? {} : { pack }),
        });
      } catch {
        continue;
      }
    }
    return result;
  }

  private async build(): Promise<WorkspaceIndex> {
    const overlay = this.overlay();
    const resourceOverlay = this.resourceOverlay();
    const inputs = [
      ...(vscode.workspace.workspaceFolders ?? []).map(
        (folder) => folder.uri.fsPath,
      ),
      ...vscode.workspace.textDocuments
        .filter(
          (document) =>
            (document.languageId === "yaml" || document.languageId === "json") &&
            document.uri.scheme === "file",
        )
        .map((document) => document.uri.fsPath),
    ];
    this.discovered = await discoverWorkspace(
      inputs,
      this.manualRoots(),
      overlay,
    );
    this.installRootWatchers();
    const standaloneFiles = await this.standaloneFiles(overlay);
    this.configVersion = workspaceConfigVersion(standaloneFiles);
    const files = new Map<string, { path: string; pack: PackSource }>();
    for (const config of this.discovered.configurationFiles)
      files.set(canonicalPath(config.path), config);
    for (const document of vscode.workspace.textDocuments) {
      if (
        (document.languageId !== "yaml" && document.languageId !== "json") ||
        document.uri.scheme !== "file" ||
        this.configurationDocumentKind(document) !== "configuration"
      )
        continue;
      const key = canonicalPath(document.uri.fsPath);
      if (!files.has(key))
        files.set(key, {
          path: document.uri.fsPath,
          pack: this.packForOpenFile(document.uri.fsPath),
        });
    }

    const parsedFiles = new Map<string, ParsedYamlFile>();
    const packed: ParsedPackFile[] = [];
    for (const config of files.values()) {
      try {
        const text =
          overlay.get(canonicalPath(config.path)) ??
          (await fs.readFile(config.path, "utf8"));
        const parsed = this.parse(config.path, text);
        parsedFiles.set(parsed.uri, parsed);
        packed.push({ parsed, pack: config.pack });
      } catch {
        continue;
      }
    }
    for (const standalone of standaloneFiles)
      parsedFiles.set(standalone.parsed.uri, standalone.parsed);
    const configuration = vscode.workspace.getConfiguration("craftengineYaml");
    const includeInactiveDiagnostics = configuration.get<boolean>(
      "diagnostics.includeInactive",
      false,
    );
    const resourceSignature = this.discovered.packs
      .map((pack) =>
        [
          canonicalPath(pack.resourcePackRoot),
          pack.active,
          pack.loadOrder,
        ].join(":"),
      )
      .join("|");
    // 读标记与清标记必须排在 await 之前: 否则扫描期间到达的事件会被扫描结束后的清零吞掉
    const resourceFilesDirty = this.resourceFilesDirty;
    this.resourceFilesDirty = false;
    const resources =
      resourceFilesDirty || resourceSignature !== this.resourceFilesSignature
        ? await scanResourceFiles(this.discovered.packs, resourceOverlay)
        : this.current.resources;
    this.resourceFilesSignature = resourceSignature;
    const scriptSignature = this.discovered.packs
      .map((pack) =>
        [
          canonicalPath(pack.scriptRoot ?? pack.folder),
          pack.namespace,
          pack.active,
          pack.loadOrder,
        ].join(":"),
      )
      .join("|");
    // 同资源扫描: 读-清必须排在 await 之前
    const scriptFilesDirty = this.scriptFilesDirty;
    this.scriptFilesDirty = false;
    const scripts =
      scriptFilesDirty || scriptSignature !== this.scriptFilesSignature
        ? await scanScriptFiles(this.discovered.packs)
        : this.current.scripts;
    this.scriptFilesSignature = scriptSignature;
    const blueprintSignature = this.discovered.packs
      .map((pack) =>
        [
          canonicalPath(pack.blueprintRoot ?? pack.folder),
          pack.loadOrder,
        ].join(":"),
      )
      .join("|");
    // 同资源扫描: 读-清必须排在 await 之前
    const blueprintFilesDirty = this.blueprintFilesDirty;
    this.blueprintFilesDirty = false;
    const blueprints =
      blueprintFilesDirty || blueprintSignature !== this.blueprintFilesSignature
        ? await scanBlueprintFiles(this.discovered.packs)
        : this.current.blueprints;
    this.blueprintFilesSignature = blueprintSignature;
    const { index: next, globalVariables } = await buildWorkspaceSnapshot({
      packed,
      standaloneFiles,
      parsedFiles,
      resources,
      packs: this.discovered.packs,
      scripts,
      blueprints,
      resourceRoots: this.discovered.resourceRoots,
      generation: ++this.generation,
      configVersion: this.configVersion,
      includeInactiveDiagnostics,
      unknownExtensionSyntax: configuration.get<"ignore" | "warning">(
        "diagnostics.unknownExtensionSyntax",
        "ignore",
      ),
      textureResolver: (namespace, imagePath, source) =>
        this.textures(resources, namespace, imagePath, source),
      ...(this.vanillaCatalog ? { vanillaCatalog: this.vanillaCatalog } : {}),
      ...(this.vanillaSoundCatalog
        ? { vanillaSoundCatalog: this.vanillaSoundCatalog }
        : {}),
    });
    this.current = next;
    this.currentGlobalVariables = globalVariables;
    await publishWorkspaceDiagnostics(this.diagnostics, next);
    this.emitter.fire(next);
    return next;
  }

  private documentDefinitions(
    document: vscode.TextDocument,
  ): WorkspaceDocumentIndex {
    return (
      this.current.documents.get(document.uri.toString()) ??
      EMPTY_DOCUMENT_INDEX
    );
  }

  public definitionsInDocument(
    document: vscode.TextDocument,
  ): readonly ImageDefinition[] {
    return this.documentDefinitions(document).images;
  }

  public itemsInDocument(
    document: vscode.TextDocument,
  ): readonly ItemDefinition[] {
    return this.documentDefinitions(document).items;
  }

  public blocksInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["blocks"][number][] {
    return this.documentDefinitions(document).blocks;
  }

  public furnitureInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["furniture"][number][] {
    return this.documentDefinitions(document).furniture;
  }

  public lootTables(
    document?: vscode.TextDocument,
  ): readonly WorkspaceIndex["lootTables"][number][] {
    if (!document) return this.current.lootTables;
    const root = this.rootForDocument(document);
    const canonicalRoot = root === undefined ? undefined : canonicalPath(root);
    return this.current.lootTables.filter(
      (loot) =>
        canonicalRoot === undefined ||
        canonicalPath(loot.source.pack.resourcesRoot) === canonicalRoot,
    );
  }

  public lootTablesInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["lootTables"][number][] {
    return this.documentDefinitions(document).lootTables;
  }

  public genericResources(
    kind?: GenericResourceKind,
    document?: vscode.TextDocument,
  ): readonly GenericResourceDefinition[] {
    const entries =
      kind === undefined
        ? this.current.genericResources
        : this.current.genericResources.filter(
            (entry) => entry.kind === kind,
          );
    if (!document) return entries;
    const root = this.rootForDocument(document);
    const canonicalRoot = root === undefined ? undefined : canonicalPath(root);
    return entries.filter(
      (entry) =>
        canonicalRoot === undefined ||
        canonicalPath(entry.source.pack.resourcesRoot) === canonicalRoot,
    );
  }

  public genericResourcesInDocument(
    document: vscode.TextDocument,
    kind?: GenericResourceKind,
  ): readonly GenericResourceDefinition[] {
    const entries = this.documentDefinitions(document).genericResources;
    return kind === undefined
      ? entries
      : entries.filter((entry) => entry.kind === kind);
  }

  public genericResourceAt(
    document: vscode.TextDocument,
    position: vscode.Position,
    kind?: GenericResourceKind,
  ): GenericResourceDefinition | undefined {
    const offset = document.offsetAt(position);
    return this.genericResourcesInDocument(document, kind)
      .filter(
        (entry) =>
          offset >= entry.source.entryRange.start &&
          offset <= entry.source.entryRange.end,
      )
      .sort(
        (left, right) =>
          left.source.entryRange.end -
          left.source.entryRange.start -
          (right.source.entryRange.end - right.source.entryRange.start),
      )[0];
  }

  public crossDomainReferencesInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["crossDomainReferences"][number][] {
    return this.documentDefinitions(document).crossDomainReferences;
  }

  public blueprintReferencesInDocument(
    document: vscode.TextDocument,
  ): readonly BlueprintReference[] {
    return this.documentDefinitions(document).blueprintReferences;
  }

  public scriptReferencesInDocument(
    document: vscode.TextDocument,
  ): readonly ScriptReference[] {
    return this.documentDefinitions(document).scriptReferences;
  }

  public blueprintReferenceAt(
    document: vscode.TextDocument,
    offset: number,
  ): BlueprintReference | undefined {
    return referenceAtOffset(
      this.blueprintReferencesInDocument(document),
      offset,
    );
  }

  public scriptReferenceAt(
    document: vscode.TextDocument,
    offset: number,
  ): ScriptReference | undefined {
    return referenceAtOffset(this.scriptReferencesInDocument(document), offset);
  }

  public crossDomainReferenceAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): WorkspaceIndex["crossDomainReferences"][number] | undefined {
    const offset = document.offsetAt(position);
    return this.crossDomainReferencesInDocument(document)
      .filter(
        (reference) =>
          offset >= reference.range.start && offset <= reference.range.end,
      )
      .sort(
        (left, right) =>
          left.range.end -
          left.range.start -
          (right.range.end - right.range.start),
      )[0];
  }

  public soundEvents(
    document?: vscode.TextDocument,
  ): readonly WorkspaceIndex["soundEvents"][number][] {
    if (!document) return this.current.soundEvents;
    const root = this.rootForDocument(document);
    const canonicalRoot = root === undefined ? undefined : canonicalPath(root);
    return this.current.soundEvents.filter(
      (event) =>
        canonicalRoot === undefined ||
        canonicalPath(event.source.pack.resourcesRoot) === canonicalRoot,
    );
  }

  public soundEventsInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["soundEvents"][number][] {
    return this.documentDefinitions(document).soundEvents;
  }

  public soundDataInDocument(
    document: vscode.TextDocument,
  ): readonly WorkspaceIndex["soundDataReferences"][number][] {
    return this.documentDefinitions(document).soundDataReferences;
  }

  public blockPreviewsInDocument(
    document: vscode.TextDocument,
  ): readonly BlockStatePreview[] {
    return this.previewsBySourceUri().get(document.uri.toString()) ?? [];
  }

  // 预览只依赖不可变快照, 按代际缓存"按 uri 分桶"的结果, 请求内只查表
  private previewsBySourceUri(): ReadonlyMap<
    string,
    readonly BlockStatePreview[]
  > {
    const generation = this.current.generation;
    if (
      generation > 0 &&
      generation === this.previewGeneration &&
      this.previewsByUri
    )
      return this.previewsByUri;
    const byUri = new Map<string, BlockStatePreview[]>();
    for (const preview of blockStatePreviews(
      this.current.blocks,
      this.current.items,
    )) {
      const bucket = byUri.get(preview.source.uri);
      if (bucket) bucket.push(preview);
      else byUri.set(preview.source.uri, [preview]);
    }
    if (generation > 0) {
      this.previewGeneration = generation;
      this.previewsByUri = byUri;
    }
    return byUri;
  }

  public blockPreviewsAt(
    document: vscode.TextDocument,
    offset: number,
  ): readonly BlockStatePreview[] {
    return this.blockPreviewsInDocument(document).filter(
      (preview) => preview.anchorRange.start === offset,
    );
  }

  public equipmentsInDocument(
    document: vscode.TextDocument,
  ): readonly EquipmentDefinition[] {
    return this.documentDefinitions(document).equipments;
  }

  public jukeboxSongs(
    document?: vscode.TextDocument,
  ): readonly JukeboxSongDefinition[] {
    if (!document) return this.current.jukeboxSongs;
    const root = this.rootForDocument(document);
    const canonicalRoot = root === undefined ? undefined : canonicalPath(root);
    return this.current.jukeboxSongs.filter(
      (song) =>
        canonicalRoot === undefined ||
        canonicalPath(song.source.pack.resourcesRoot) === canonicalRoot,
    );
  }

  public itemAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): ItemDefinition | undefined {
    const offset = document.offsetAt(position);
    return this.itemsInDocument(document)
      .filter(
        (item) =>
          offset >= item.source.entryRange.start &&
          offset <= item.source.entryRange.end,
      )
      .sort(
        (left, right) =>
          left.source.entryRange.end -
          left.source.entryRange.start -
          (right.source.entryRange.end - right.source.entryRange.start),
      )[0];
  }

  public blockAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): WorkspaceIndex["blocks"][number] | undefined {
    const offset = document.offsetAt(position);
    return this.blocksInDocument(document)
      .filter(
        (block) =>
          offset >= block.source.entryRange.start &&
          offset <= block.source.entryRange.end,
      )
      .sort(
        (left, right) =>
          left.source.entryRange.end -
          left.source.entryRange.start -
          (right.source.entryRange.end - right.source.entryRange.start),
      )[0];
  }

  public furnitureAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): WorkspaceIndex["furniture"][number] | undefined {
    const offset = document.offsetAt(position);
    return this.furnitureInDocument(document)
      .filter(
        (entry) =>
          offset >= entry.source.entryRange.start &&
          offset <= entry.source.entryRange.end,
      )
      .sort(
        (left, right) =>
          left.source.entryRange.end -
          left.source.entryRange.start -
          (right.source.entryRange.end - right.source.entryRange.start),
      )[0];
  }

  public opaqueIds(
    kind: "block" | "furniture",
    document?: vscode.TextDocument,
  ): readonly OpaqueIdDefinition[] {
    const entries =
      kind === "block" ? this.current.blocks : this.current.furniture;
    if (!document) return entries;
    const root = this.rootForDocument(document);
    const canonicalRoot = root === undefined ? undefined : canonicalPath(root);
    return entries.filter(
      (entry) =>
        canonicalRoot === undefined ||
        canonicalPath(entry.source.pack.resourcesRoot) === canonicalRoot,
    );
  }

  public imageAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): ImageDefinition | undefined {
    const offset = document.offsetAt(position);
    return this.definitionsInDocument(document)
      .filter(
        (image) =>
          offset >= image.source.entryRange.start &&
          offset <= image.source.entryRange.end,
      )
      .sort(
        (left, right) =>
          left.source.entryRange.end -
          left.source.entryRange.start -
          (right.source.entryRange.end - right.source.entryRange.start),
      )[0];
  }

  public rootForDocument(document: vscode.TextDocument): string | undefined {
    return (
      this.definitionsInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.itemsInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.blocksInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.furnitureInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.soundEventsInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.equipmentsInDocument(document)[0]?.source.pack.resourcesRoot ??
      this.documentDefinitions(document).jukeboxSongs[0]?.source.pack
        .resourcesRoot ??
      this.genericResourcesInDocument(document)[0]?.source.pack.resourcesRoot ??
      (document.uri.scheme === "file"
        ? this.standaloneDescriptor(document.uri.fsPath)?.resourcesRoot
        : undefined) ??
      this.discovered.resourceRoots
        .filter((root) => isPathInside(document.uri.fsPath, root))
        .sort((a, b) => b.length - a.length)[0]
    );
  }

  public templatesForDocument(
    document: vscode.TextDocument,
  ): readonly ConfigurationTemplateDefinition[] {
    const root = this.rootForDocument(document);
    if (!root) return [];
    const owner =
      document.uri.scheme === "file"
        ? this.packForOpenFile(document.uri.fsPath)
        : undefined;
    if (owner)
      return configurationTemplatesForPack(this.current.templates, owner);
    return this.current.templates.filter(
      (template) =>
        template.pack.active &&
        canonicalPath(template.pack.resourcesRoot) === canonicalPath(root),
    );
  }

  public textureIdentifiers(document: vscode.TextDocument): string[] {
    return this.resourceIdentifiers("texture", document);
  }

  public fontIdentifiers(document: vscode.TextDocument): string[] {
    return this.resourceIdentifiers("font", document);
  }

  public resourceIdentifiers(
    kind: ResourceFileKind,
    document: vscode.TextDocument,
  ): string[] {
    const root = this.rootForDocument(document);
    if (!root) return [];
    return [...this.cachedResourceIdentifiers(kind, root)];
  }

  // 同一代快照里同一 resourcesRoot 的同种资源 id 结果不变, 按代际记忆化
  private cachedResourceIdentifiers(
    kind: ResourceFileKind,
    root: string,
  ): readonly string[] {
    const generation = this.current.generation;
    if (generation !== this.identifierGeneration) {
      this.identifierGeneration = generation;
      this.identifierCache.clear();
    }
    const key = `${canonicalPath(root)}\u0000${kind}`;
    const cached = this.identifierCache.get(key);
    if (cached) return cached;
    const identifiers = resourceIdentifiers(this.current.resources, root, kind);
    if (generation > 0) this.identifierCache.set(key, identifiers);
    return identifiers;
  }

  public resourceFiles(
    document: vscode.TextDocument,
    identifier: string,
    requestedKind?: ResourceFileKind,
  ): readonly ResourceFile[] {
    const root = this.rootForDocument(document);
    if (!root) return [];
    const kinds =
      requestedKind === undefined
        ? [...new Set(this.current.resources.files.map((file) => file.kind))]
        : [requestedKind];
    return kinds.flatMap((kind) =>
      resourceCandidates(
        this.current.resources,
        root,
        kind,
        normalizeResourceIdentifier(kind, identifier),
      ),
    );
  }

  public resolvedTexturePaths(
    images: readonly ImageDefinition[],
  ): readonly string[] {
    const paths = new Set<string>();
    for (const image of images) {
      const resolved = this.current.resolved.get(image);
      if (!resolved || resolved.bitmap.spec.kind !== "bitmap") continue;
      const candidates = resolved.bitmap.spec.textureCandidates;
      const effective = candidates.filter((candidate) => candidate.effective);
      for (const candidate of effective.length > 0 ? effective : candidates)
        paths.add(candidate.path);
    }
    return [...paths];
  }

  public dispose(): void {
    this.rebuildCoordinator.dispose();
    for (const watcher of this.rootWatchers.values()) watcher.dispose();
    this.rootWatchers.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.emitter.dispose();
  }
}
