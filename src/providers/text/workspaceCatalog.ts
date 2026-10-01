import path from "node:path";
import { fileURLToPath } from "node:url";

import type * as vscode from "vscode";

import {
  buildGlobalVariableCatalog,
  type GlobalVariableCatalog,
  type ParsedGlobalVariableFile,
  type RootGlobalVariableCatalog,
} from "../../config/text/globalVariables.js";
import {
  buildLanguageCatalog,
  CLIENT_LANGUAGE_SECTIONS,
  languageJsonFilesFromCatalog,
  SERVER_LANGUAGE_SECTIONS,
  type LanguageCatalog,
  type ParsedLanguagePackFile,
  type RootLanguageCatalog,
} from "../../config/text/languageCatalog.js";
import type { ImageDefinition } from "../../config/image/model.js";
import type { PackSource, ParsedYamlFile } from "../../config/model.js";
import type { WorkspaceIndex } from "../../workspace/model.js";
import { parseCraftEngineYaml } from "../../config/parsing/craftEngineYaml.js";
import { canonicalPath } from "../../util/paths.js";
import {
  mergeParsedFileWithGeneratedSections,
  standaloneTranslationPack,
} from "../../config/text/standaloneTranslations.js";

export interface WorkspaceTextSnapshot {
  readonly resourcesRoot?: string;
  readonly defaultNamespace?: string;
  readonly parsed: ParsedYamlFile;
  readonly languages: RootLanguageCatalog;
  readonly globals: RootGlobalVariableCatalog;
}

interface TextDocumentCatalog {
  complete(kind: "image" | "attribute"): readonly {
    readonly id: string;
    readonly definition: unknown;
  }[];
  resolveImage(id: string): { readonly candidates: readonly ImageDefinition[] };
  resolveGeneric(
    kind: "attribute",
    id: string,
  ): { readonly candidates: readonly unknown[] };
}

type TextWorkspaceSnapshot = Pick<
  WorkspaceIndex,
  | "resourceRoots"
  | "items"
  | "images"
  | "blocks"
  | "furniture"
  | "equipments"
  | "genericResources"
  | "opaqueSections"
  | "parsedFiles"
  | "resources"
  | "issues"
  | "generation"
>;

export interface TextWorkspaceIndex {
  readonly packs: readonly PackSource[];
  readonly index: TextWorkspaceSnapshot;
  readonly globalVariables: GlobalVariableCatalog | undefined;
  readonly onDidChange: (listener: () => void) => vscode.Disposable;
  rootForDocument(document: vscode.TextDocument): string | undefined;
  forDocument(document: vscode.TextDocument): TextDocumentCatalog | undefined;
}

function packForFile(
  uri: string,
  candidates: readonly PackSource[],
  fallbackRoot?: string,
): PackSource | undefined {
  let filePath: string;
  try {
    filePath = fileURLToPath(uri);
  } catch {
    return undefined;
  }
  const direct = candidates
    .filter((pack) => {
      const relative = path.relative(pack.configurationRoot, filePath);
      return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      );
    })
    .sort(
      (left, right) =>
        right.configurationRoot.length - left.configurationRoot.length,
    )[0];
  if (direct) return direct;
  const fileDirectory = canonicalPath(path.dirname(filePath));
  const translationPack = candidates.find(
    (pack) =>
      !pack.subpack &&
      canonicalPath(
        path.resolve(path.dirname(pack.resourcesRoot), "translations"),
      ) === fileDirectory,
  );
  if (translationPack)
    return standaloneTranslationPack(translationPack.resourcesRoot, candidates);
  if (fallbackRoot === undefined) return undefined;
  const root = canonicalPath(fallbackRoot);
  return candidates.find(
    (pack) => canonicalPath(pack.resourcesRoot) === root,
  );
}

export class WorkspaceTextCatalog {
  private languageGeneration = -1;
  private languageCatalogPromise: Promise<LanguageCatalog> | undefined;
  private globalGeneration = -1;
  private globalCatalog: GlobalVariableCatalog | undefined;
  private packsGeneration = -1;
  private packsCache: readonly PackSource[] | undefined;

  public constructor(
    private readonly index: TextWorkspaceIndex,
    private readonly vanillaClient: Promise<Readonly<Record<string, string>>>,
  ) {}

  public async forDocument(
    document: vscode.TextDocument,
  ): Promise<WorkspaceTextSnapshot> {
    const parsed = parseCraftEngineYaml(
      document.uri.toString(),
      document.getText(),
    );
    const resourcesRoot = this.index.rootForDocument(document);
    const inputPacks = this.packs();
    const currentPack = packForFile(parsed.uri, inputPacks, resourcesRoot);
    const parsedFiles = new Map(this.index.index.parsedFiles);
    const catalogParsed = mergeParsedFileWithGeneratedSections(
      parsed,
      parsedFiles.get(parsed.uri),
    );
    parsedFiles.set(parsed.uri, catalogParsed);
    const files = [...parsedFiles.values()].flatMap((candidate) => {
      const pack = packForFile(
        candidate.uri,
        inputPacks,
        candidate.uri === parsed.uri ? resourcesRoot : undefined,
      );
      return pack ? [{ parsed: candidate, pack }] : [];
    });
    const languages = this.languages(files, catalogParsed);
    const globals = this.globalVariables(files, catalogParsed);
    return {
      ...(resourcesRoot === undefined ? {} : { resourcesRoot }),
      ...(currentPack === undefined
        ? {}
        : { defaultNamespace: currentPack.namespace }),
      parsed,
      languages: (await languages).forRoot(resourcesRoot),
      globals: globals.forRoot(resourcesRoot),
    };
  }

  // packs 只依赖不可变快照, 按代际记忆化; 未自增 generation 的快照不缓存
  private packs(): readonly PackSource[] {
    const generation = this.index.index.generation;
    if (generation > 0 && generation === this.packsGeneration && this.packsCache)
      return this.packsCache;
    const packs = [
      ...new Map(
        [
          ...this.index.packs,
          ...this.index.index.resourceRoots.map((root) =>
            standaloneTranslationPack(root, this.index.packs),
          ),
          ...this.index.index.items.map((entry) => entry.source.pack),
          ...this.index.index.images.map((entry) => entry.source.pack),
          ...this.index.index.blocks.map((entry) => entry.source.pack),
          ...this.index.index.furniture.map((entry) => entry.source.pack),
          ...this.index.index.equipments.map((entry) => entry.source.pack),
          ...this.index.index.genericResources.map(
            (entry) => entry.source.pack,
          ),
          ...this.index.index.opaqueSections.map((entry) => entry.source.pack),
        ].map((pack) => [
          `${canonicalPath(pack.resourcesRoot)}\u0000${canonicalPath(pack.configurationRoot)}`,
          pack,
        ]),
      ).values(),
    ];
    if (generation > 0) {
      this.packsGeneration = generation;
      this.packsCache = packs;
    }
    return packs;
  }

  private languages(
    files: readonly ParsedLanguagePackFile[],
    current: ParsedYamlFile,
  ): Promise<LanguageCatalog> {
    const generation = this.index.index.generation;
    const currentIsTextCatalog = current.sections.some(
      (section) =>
        CLIENT_LANGUAGE_SECTIONS.some((type) => type === section.type) ||
        SERVER_LANGUAGE_SECTIONS.some((type) => type === section.type),
    );
    if (
      !currentIsTextCatalog &&
      this.languageCatalogPromise &&
      this.languageGeneration === generation
    ) {
      return this.languageCatalogPromise;
    }
    const promise = Promise.all([
      languageJsonFilesFromCatalog(this.index.index.resources),
      this.vanillaClient,
    ]).then(([resourceJson, vanillaClient]) =>
      buildLanguageCatalog(files, {
        resourceJson,
        vanillaClient,
        vanillaLocale: "zh_cn",
      }),
    );
    if (!currentIsTextCatalog) {
      this.languageGeneration = generation;
      this.languageCatalogPromise = promise;
    }
    return promise;
  }

  private globalVariables(
    files: readonly ParsedGlobalVariableFile[],
    current: ParsedYamlFile,
  ): GlobalVariableCatalog {
    const generation = this.index.index.generation;
    const currentIsGlobals = current.sections.some((section) =>
      [
        "global-variables",
        "global-variable",
        "global_variables",
        "global_variable",
      ].includes(section.type),
    );
    if (
      !currentIsGlobals &&
      this.globalCatalog &&
      this.globalGeneration === generation
    )
      return this.globalCatalog;
    const catalog =
      !currentIsGlobals && this.index.globalVariables
        ? this.index.globalVariables
        : buildGlobalVariableCatalog(files);
    if (!currentIsGlobals) {
      this.globalGeneration = generation;
      this.globalCatalog = catalog;
    }
    return catalog;
  }
}
