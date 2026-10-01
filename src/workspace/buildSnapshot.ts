import {
  buildEquipmentIndex,
  validateEquipmentReferences,
} from "../config/equipment/parser.js";
import { materializeOpaqueConfigurationSections } from "../config/factory/materialize.js";
import {
  buildGlobalVariableCatalog,
  type GlobalVariableCatalog,
} from "../config/text/globalVariables.js";
import { buildImageIndex, type ImageBuildOptions } from "../config/image/parser.js";
import { buildItemIndex } from "../config/item/parser.js";
import { validateTooltipStyles } from "../resources/tooltipStyles.js";
import { buildJukeboxSongIndex } from "../config/jukebox/parser.js";
import {
  buildLootIndex,
  validateInlineLootValues,
} from "../config/loot/parser.js";
import type { PackSource, ParsedYamlFile } from "../config/model.js";
import { applyIdSectionSemantics } from "../config/parsing/idSectionSemantics.js";
import { buildGenericResourceIndex } from "../config/resource/parser.js";
import { buildSoundIndex } from "../config/sound/parser.js";
import {
  expandConfigurations,
  type ParsedPackFile,
} from "../config/template/expander.js";
import { languageConflictIssues } from "../config/text/languageCatalog.js";
import {
  validateDirectParsedConfigurationSections,
  validateExpandedConfigurationSchemas,
  validateStandaloneParsedFile,
} from "../config/validation/complete.js";
import type { WorkspaceStandaloneDescriptor } from "../config/documents/ownership.js";
import type { VanillaCatalog, VanillaSoundCatalog } from "../minecraft/catalog.js";
import {
  analyzeCrossDomainReferences,
  type CrossDomainReferenceInput,
} from "../references/crossDomain.js";
import {
  blueprintIssues,
  collectBlueprintReferences,
  collectScriptReferences,
  emptyBlueprintCatalog,
  emptyScriptCatalog,
  scriptIssues,
  type BlueprintCatalog,
  type ScriptCatalog,
} from "../references/blueprintScript.js";
import { validateBlockResources } from "../resources/block.js";
import { validateItemResources } from "../resources/item.js";
import type { ResourceFileCatalog } from "../resources/model.js";
import { deduplicateCoreIssues } from "../util/issues.js";
import type { WorkspaceDocumentIndex, WorkspaceIndex } from "./model.js";

export interface ParsedWorkspaceStandaloneFile
  extends WorkspaceStandaloneDescriptor {
  readonly path: string;
  readonly rawParsed: ParsedYamlFile;
  readonly parsed: ParsedYamlFile;
  readonly pack?: PackSource;
}

export interface WorkspaceSnapshotBuildInput {
  readonly packed: readonly ParsedPackFile[];
  readonly standaloneFiles: readonly ParsedWorkspaceStandaloneFile[];
  readonly parsedFiles: ReadonlyMap<string, ParsedYamlFile>;
  readonly resources: ResourceFileCatalog;
  readonly packs: readonly PackSource[];
  readonly scripts: ScriptCatalog;
  readonly blueprints: BlueprintCatalog;
  readonly resourceRoots: readonly string[];
  readonly generation: number;
  // 工作区 config.yml 声明的版本, 用于放宽老版本里被删掉的键
  readonly configVersion: number;
  readonly includeInactiveDiagnostics: boolean;
  readonly unknownExtensionSyntax: "ignore" | "warning";
  readonly textureResolver: ImageBuildOptions["textureResolver"];
  readonly vanillaCatalog?: VanillaCatalog;
  readonly vanillaSoundCatalog?: VanillaSoundCatalog;
}

export interface WorkspaceSnapshotBuildResult {
  readonly index: WorkspaceIndex;
  readonly globalVariables: GlobalVariableCatalog;
}

export function emptyWorkspaceSnapshot(): WorkspaceIndex {
  return {
    templates: [],
    images: [],
    resolved: new Map(),
    items: [],
    equipments: [],
    jukeboxSongs: [],
    blocks: [],
    soundEvents: [],
    soundDataReferences: [],
    furniture: [],
    lootTables: [],
    genericResources: [],
    crossDomainReferences: [],
    opaqueSections: [],
    resources: { files: [], byKind: new Map(), byKey: new Map() },
    scripts: emptyScriptCatalog(),
    blueprints: emptyBlueprintCatalog(),
    blueprintReferences: [],
    scriptReferences: [],
    documents: new Map(),
    issues: [],
    parsedFiles: new Map(),
    resourceRoots: [],
    generation: 0,
  };
}

type MutableDocumentIndex = {
  -readonly [Key in keyof WorkspaceDocumentIndex]: WorkspaceDocumentIndex[Key] extends
    readonly (infer Entry)[]
    ? Entry[]
    : never;
};

function emptyDocumentBuckets(): MutableDocumentIndex {
  return {
    images: [],
    items: [],
    blocks: [],
    furniture: [],
    equipments: [],
    jukeboxSongs: [],
    lootTables: [],
    genericResources: [],
    soundEvents: [],
    soundDataReferences: [],
    crossDomainReferences: [],
    blueprintReferences: [],
    scriptReferences: [],
  };
}

  // 每个文档一份, 避免所有 xxxInDocument 访问器都整仓过一遍
function documentsByUri(index: WorkspaceIndex): ReadonlyMap<
  string,
  WorkspaceDocumentIndex
> {
  const documents = new Map<string, MutableDocumentIndex>();
  const forUri = (uri: string): MutableDocumentIndex => {
    const existing = documents.get(uri);
    if (existing) return existing;
    const created = emptyDocumentBuckets();
    documents.set(uri, created);
    return created;
  };
  for (const entry of index.images) forUri(entry.source.uri).images.push(entry);
  for (const entry of index.items) forUri(entry.source.uri).items.push(entry);
  for (const entry of index.blocks) forUri(entry.source.uri).blocks.push(entry);
  for (const entry of index.furniture)
    forUri(entry.source.uri).furniture.push(entry);
  for (const entry of index.equipments)
    forUri(entry.source.uri).equipments.push(entry);
  for (const entry of index.jukeboxSongs)
    forUri(entry.source.uri).jukeboxSongs.push(entry);
  for (const entry of index.lootTables)
    forUri(entry.source.uri).lootTables.push(entry);
  for (const entry of index.genericResources)
    forUri(entry.source.uri).genericResources.push(entry);
  for (const entry of index.soundEvents)
    forUri(entry.source.uri).soundEvents.push(entry);
  for (const entry of index.soundDataReferences)
    forUri(entry.source.uri).soundDataReferences.push(entry);
  for (const entry of index.crossDomainReferences)
    forUri(entry.uri).crossDomainReferences.push(entry);
  for (const entry of index.blueprintReferences)
    forUri(entry.uri).blueprintReferences.push(entry);
  for (const entry of index.scriptReferences)
    forUri(entry.uri).scriptReferences.push(entry);
  return documents;
}

export async function buildWorkspaceSnapshot(
  input: WorkspaceSnapshotBuildInput,
): Promise<WorkspaceSnapshotBuildResult> {
  const expanded = expandConfigurations(input.packed);
  const idSections = applyIdSectionSemantics(expanded.configurations, {
    mode: "accurate",
  });
  const configurations = idSections.candidates;
  const parsedFiles = materializeOpaqueConfigurationSections(
    input.parsedFiles,
    expanded.opaqueSections,
  );
  const packedWithOpaque = input.packed.map((file) => ({
    ...file,
    parsed: parsedFiles.get(file.parsed.uri) ?? file.parsed,
  }));
  const activeUris = new Set(
    input.packed
      .filter((file) => file.pack.active)
      .map((file) => file.parsed.uri),
  );
  const visibleIssue = (uri: string): boolean =>
    input.includeInactiveDiagnostics || activeUris.has(uri);
  const inheritedIssues = [
    ...input.packed.flatMap((file) => file.parsed.issues),
    ...expanded.issues,
    ...idSections.issues,
  ]
    .filter((issue) => visibleIssue(issue.uri))
    .concat(
      input.standaloneFiles.flatMap((file) => file.parsed.issues),
    );
  const globalVariables = buildGlobalVariableCatalog(packedWithOpaque);

  const vanillaItems = input.vanillaCatalog
    ? new Set(input.vanillaCatalog.items.map((item) => item.id))
    : undefined;
  const vanillaBlocks = input.vanillaCatalog
    ? new Set(input.vanillaCatalog.blocks)
    : undefined;
  const vanillaEntityTypes = input.vanillaCatalog
    ? new Set(input.vanillaCatalog.entityTypes)
    : undefined;
  const registry = (id: string): ReadonlySet<string> | undefined =>
    input.vanillaCatalog &&
    Object.hasOwn(input.vanillaCatalog.registries, id)
      ? new Set(input.vanillaCatalog.registries[id])
      : undefined;

  const soundIndex = input.vanillaSoundCatalog
    ? await buildSoundIndex(
        configurations,
        input.resources,
        input.vanillaSoundCatalog,
        input.includeInactiveDiagnostics,
      )
    : ({
        events: [],
        references: [],
        issues: [],
      } satisfies Awaited<ReturnType<typeof buildSoundIndex>>);
  const imageIndex = await buildImageIndex(
    configurations
      .filter((candidate) => candidate.kind === "image")
      .map(({ rawId, value, source }) => ({ rawId, value, source })),
    inheritedIssues,
    {
      includeInactiveDiagnostics: input.includeInactiveDiagnostics,
      textureResolver: input.textureResolver,
      configVersion: input.configVersion,
      knownTexture: (namespace, imagePath) =>
        input.vanillaCatalog?.textures.has(
          `${namespace}:${imagePath.replace(/\.png$/iu, "")}`,
        ) === true,
    },
  );
  const jukeboxSongIndex = buildJukeboxSongIndex(
    configurations,
    [],
    input.includeInactiveDiagnostics,
  );
  const itemIndex = buildItemIndex(configurations, [], {
    includeInactiveDiagnostics: input.includeInactiveDiagnostics,
    unknownExtensionSyntax: input.unknownExtensionSyntax,
    configVersion: input.configVersion,
    ...(vanillaItems ? { vanillaMaterials: vanillaItems } : {}),
    ...(input.vanillaCatalog
      ? {
          vanillaComponents: new Set(input.vanillaCatalog.components),
          vanillaBlockStates: input.vanillaCatalog.blockStates,
          vanillaJukeboxSongs: new Set(
            input.vanillaCatalog.registries["minecraft:jukebox_song"] ?? [],
          ),
        }
      : {}),
    ...(vanillaBlocks ? { vanillaBlocks } : {}),
    ...(vanillaEntityTypes ? { vanillaEntityTypes } : {}),
    jukeboxSongs: jukeboxSongIndex.songs,
  });
  const lootOptions = {
    includeInactiveDiagnostics: input.includeInactiveDiagnostics,
    unknownExtensionSyntax: input.unknownExtensionSyntax,
    itemIds: new Set([
      ...itemIndex.items.map((item) => item.id),
      ...(vanillaItems ?? []),
    ]),
    ...(vanillaBlocks ? { vanillaBlocks } : {}),
    ...(input.vanillaCatalog
      ? { vanillaBlockStates: input.vanillaCatalog.blockStates }
      : {}),
    ...(vanillaEntityTypes ? { vanillaEntityTypes } : {}),
  } as const;
  const lootIndex = buildLootIndex(configurations, lootOptions);
  const genericResourceIndex = buildGenericResourceIndex(
    configurations,
    input.includeInactiveDiagnostics,
  );
  const equipmentIndex = buildEquipmentIndex(
    configurations,
    [],
    input.resources,
    input.includeInactiveDiagnostics,
  );

  const crossDomainInput: CrossDomainReferenceInput = {
    images: imageIndex.images,
    items: itemIndex.items,
    blocks: itemIndex.blocks,
    genericResources: genericResourceIndex.resources,
    vanilla: {
      ...(vanillaItems ? { items: vanillaItems } : {}),
      ...(vanillaBlocks ? { blocks: vanillaBlocks } : {}),
      ...(registry("minecraft:recipe")
        ? { recipes: registry("minecraft:recipe") }
        : {}),
      ...(registry("minecraft:painting_variant")
        ? { paintingVariants: registry("minecraft:painting_variant") }
        : {}),
      ...(registry("minecraft:worldgen/configured_feature")
        ? {
            configuredFeatures: registry(
              "minecraft:worldgen/configured_feature",
            ),
          }
        : {}),
      ...(registry("minecraft:worldgen/placed_feature")
        ? {
            placedFeatures: registry("minecraft:worldgen/placed_feature"),
          }
        : {}),
    },
    includeInactiveDiagnostics: input.includeInactiveDiagnostics,
  };

  const packs = input.packs;
  const scripts = input.scripts;
  const blueprints = input.blueprints;
  const blueprintReferences = collectBlueprintReferences({
    items: itemIndex.items,
    blocks: itemIndex.blocks,
    furniture: itemIndex.furniture,
  });
  const scriptReferences = collectScriptReferences([
    ...itemIndex.items,
    ...itemIndex.blocks,
    ...itemIndex.furniture,
    ...lootIndex.lootTables,
    ...genericResourceIndex.resources,
  ]);

  // 引用与诊断来自同一趟 cross-domain 遍历, 重建时只分析一次
  const crossDomain = analyzeCrossDomainReferences(crossDomainInput);

  const index: WorkspaceIndex = {
    images: imageIndex.images,
    resolved: imageIndex.resolved,
    parsedFiles,
    resourceRoots: input.resourceRoots,
    generation: input.generation,
    templates: expanded.templates,
    items: itemIndex.items,
    equipments: equipmentIndex.equipments,
    jukeboxSongs: jukeboxSongIndex.songs,
    blocks: itemIndex.blocks,
    soundEvents: soundIndex.events,
    soundDataReferences: soundIndex.references,
    furniture: itemIndex.furniture,
    lootTables: lootIndex.lootTables,
    genericResources: genericResourceIndex.resources,
    crossDomainReferences: crossDomain.references,
    opaqueSections: expanded.opaqueSections,
    resources: input.resources,
    scripts,
    blueprints,
    blueprintReferences,
    scriptReferences,
    documents: new Map(),
    issues: deduplicateCoreIssues([
      ...imageIndex.issues,
      ...itemIndex.issues,
      ...equipmentIndex.issues,
      ...jukeboxSongIndex.issues,
      ...validateEquipmentReferences(
        itemIndex.items,
        equipmentIndex.equipments,
        input.includeInactiveDiagnostics,
      ),
      ...(await validateItemResources(
        itemIndex.items,
        input.resources,
        input.vanillaCatalog,
        input.includeInactiveDiagnostics,
        [...itemIndex.blocks, ...itemIndex.furniture],
      )),
      ...(await validateBlockResources(
        itemIndex.blocks,
        input.resources,
        input.vanillaCatalog,
        input.includeInactiveDiagnostics,
      )),
      ...soundIndex.issues,
      ...lootIndex.issues,
      ...genericResourceIndex.issues,
      ...crossDomain.issues,
      ...blueprintIssues(blueprintReferences, blueprints).filter((issue) =>
        visibleIssue(issue.uri),
      ),
      ...scriptIssues(scriptReferences, packs, scripts).filter((issue) =>
        visibleIssue(issue.uri),
      ),
      ...validateExpandedConfigurationSchemas(
        configurations,
        expanded.opaqueSections,
        input.configVersion,
      ).filter((issue) => visibleIssue(issue.uri)),
      ...validateDirectParsedConfigurationSections(
        input.packed,
        input.configVersion,
      ).filter((issue) => visibleIssue(issue.uri)),
      ...input.standaloneFiles.flatMap((file) =>
        validateStandaloneParsedFile(file.rawParsed, input.configVersion),
      ),
      ...globalVariables.issues.filter((issue) => visibleIssue(issue.uri)),
      ...validateInlineLootValues(
        [...itemIndex.items, ...itemIndex.blocks, ...itemIndex.furniture],
        lootIndex.lootTables,
        lootOptions,
      ),
      ...validateTooltipStyles(
        itemIndex.items,
        input.resources,
        input.includeInactiveDiagnostics,
      ),
      ...languageConflictIssues(
        [
          ...packedWithOpaque,
          ...input.standaloneFiles.flatMap((file) =>
            file.kind === "translation" && file.pack
              ? [{ parsed: file.parsed, pack: file.pack }]
              : [],
          ),
        ],
        input.includeInactiveDiagnostics,
      ),
    ]),
  };
  return {
    index: { ...index, documents: documentsByUri(index) },
    globalVariables,
  };
}
