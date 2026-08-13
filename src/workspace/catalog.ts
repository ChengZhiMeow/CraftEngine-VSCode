import path from "node:path";
import { fileURLToPath } from "node:url";

import type { OpaqueIdDefinition, ResourceKind } from "../config/model.js";
import type { EquipmentDefinition } from "../config/equipment/model.js";
import type {
  GenericResourceDefinition,
  GenericResourceKind,
} from "../config/resource/model.js";
import type { ImageDefinition } from "../config/image/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import type { LootDefinition } from "../config/loot/model.js";
import type { JukeboxSongDefinition } from "../config/jukebox/model.js";
import type { SoundEventDefinition } from "../config/sound/model.js";
import type { CoreIssue } from "../diagnostics/model.js";
import type { ResourceFile, ResourceFileKind } from "../resources/model.js";
import type { WorkspaceIndex } from "./model.js";
import { makeIdentifier } from "../util/identifiers.js";
import { isPathInside, samePath } from "../util/paths.js";
import { isGenericResourceKind } from "../config/resource/parser.js";
import {
  effectiveResource,
  resourceCandidates,
  resourceFilesForRoot,
  resourceIdentifiers,
} from "../resources/catalog.js";

export type CatalogDefinition =
  | ImageDefinition
  | ItemDefinition
  | OpaqueIdDefinition
  | LootDefinition
  | EquipmentDefinition
  | JukeboxSongDefinition
  | SoundEventDefinition
  | GenericResourceDefinition;

export interface CatalogLocation {
  readonly uri: string;
  readonly offset: number;
}

export interface CatalogResolution<
  T extends CatalogDefinition = CatalogDefinition,
> {
  readonly status: "resolved" | "ambiguous" | "missing";
  readonly selected?: T;
  readonly candidates: readonly T[];
}

export interface CatalogCompletion {
  readonly id: string;
  readonly shortId?: string;
  readonly kind: ResourceKind;
  readonly active: boolean;
  readonly definition: CatalogDefinition;
}

export interface ImageComponentReference {
  readonly id: string;
  readonly row?: number;
  readonly column?: number;
  readonly format?: string;
  readonly resolution: CatalogResolution<ImageDefinition>;
}

function imageComponentParts(
  text: string,
): Omit<ImageComponentReference, "resolution"> | undefined {
  const trimmed = text.trim();
  const body =
    trimmed.startsWith("<image:") && trimmed.endsWith(">")
      ? trimmed.slice("<image:".length, -1)
      : trimmed.startsWith("image:")
        ? trimmed.slice("image:".length)
        : undefined;
  if (!body) return undefined;
  const pieces = body.split(":");
  let format: string | undefined;
  let row: number | undefined;
  let column: number | undefined;
  const integer = (value: string | undefined): number | undefined =>
    value !== undefined && /^\d+$/u.test(value) ? Number(value) : undefined;
  if (
    pieces.length >= 4 &&
    integer(pieces.at(-2)) !== undefined &&
    integer(pieces.at(-1)) === undefined
  ) {
    format = pieces.pop();
  }
  if (pieces.length >= 4) {
    column = integer(pieces.at(-1));
    if (column !== undefined) pieces.pop();
  }
  if (pieces.length >= 3) {
    row = integer(pieces.at(-1));
    if (row !== undefined) pieces.pop();
  }
  const id = pieces.join(":");
  if (!id) return undefined;
  return {
    id,
    ...(row === undefined ? {} : { row }),
    ...(column === undefined ? {} : { column }),
    ...(format === undefined ? {} : { format }),
  };
}

function parsedUriBelongsToRoot(uri: string, resourcesRoot: string): boolean {
  let filePath: string;
  try {
    filePath = fileURLToPath(uri);
  } catch {
    return false;
  }
  if (isPathInside(filePath, resourcesRoot)) return true;
  const pluginRoot = path.dirname(resourcesRoot);
  if (
    samePath(filePath, path.join(pluginRoot, "config.yml")) ||
    samePath(filePath, path.join(pluginRoot, "commands.yml"))
  )
    return true;
  return samePath(
    path.dirname(filePath),
    path.join(pluginRoot, "translations"),
  );
}

export class WorkspaceCatalogSnapshot {
  public constructor(public readonly index: WorkspaceIndex) {}

  public forRoot(resourcesRoot: string): DocumentCatalog {
    return new DocumentCatalog(this, resourcesRoot);
  }

  public locate(
    location: CatalogLocation,
    kinds?: readonly ResourceKind[],
  ): readonly CatalogDefinition[] {
    const allowed = kinds ? new Set(kinds) : undefined;
    return this.definitions().filter((definition) => {
      let kind: ResourceKind;
      if ("spec" in definition) kind = "image";
      else if ("material" in definition) kind = "item";
      else if ("layers" in definition && "type" in definition)
        kind = "equipment";
      else if ("sound" in definition && "length" in definition)
        kind = "jukebox-song";
      else kind = definition.kind;
      const source = definition.source;
      return (
        (!allowed || allowed.has(kind)) &&
        source.uri === location.uri &&
        location.offset >= source.entryRange.start &&
        location.offset <= source.entryRange.end
      );
    });
  }

  public issues(uri?: string): readonly CoreIssue[] {
    return uri === undefined
      ? this.index.issues
      : this.index.issues.filter((issue) => issue.uri === uri);
  }

  private definitions(): readonly CatalogDefinition[] {
    return [
      ...this.index.images,
      ...this.index.items,
      ...this.index.blocks,
      ...this.index.furniture,
      ...this.index.lootTables,
      ...(this.index.equipments ?? []),
      ...(this.index.jukeboxSongs ?? []),
      ...this.index.soundEvents,
      ...this.index.genericResources,
    ];
  }
}

export class DocumentCatalog {
  public constructor(
    private readonly snapshot: WorkspaceCatalogSnapshot,
    public readonly resourcesRoot: string,
  ) {}

  public images(activeOnly = false): readonly ImageDefinition[] {
    return this.snapshot.index.images.filter(
      (image) =>
        samePath(image.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || image.source.pack.active),
    );
  }

  public items(activeOnly = false): readonly ItemDefinition[] {
    return this.snapshot.index.items.filter(
      (item) =>
        samePath(item.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || item.source.pack.active),
    );
  }

  public equipments(activeOnly = false): readonly EquipmentDefinition[] {
    return (this.snapshot.index.equipments ?? []).filter(
      (equipment) =>
        samePath(equipment.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || equipment.source.pack.active),
    );
  }

  public jukeboxSongs(activeOnly = false): readonly JukeboxSongDefinition[] {
    return (this.snapshot.index.jukeboxSongs ?? []).filter(
      (song) =>
        samePath(song.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || song.source.pack.active),
    );
  }

  public soundEvents(activeOnly = false): readonly SoundEventDefinition[] {
    return this.snapshot.index.soundEvents.filter(
      (event) =>
        samePath(event.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || event.source.pack.active),
    );
  }

  public lootTables(activeOnly = false): readonly LootDefinition[] {
    return this.snapshot.index.lootTables.filter(
      (loot) =>
        samePath(loot.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || loot.source.pack.active),
    );
  }

  public opaque(
    kind: "block" | "furniture",
    activeOnly = false,
  ): readonly OpaqueIdDefinition[] {
    return (
      kind === "block"
        ? this.snapshot.index.blocks
        : this.snapshot.index.furniture
    ).filter(
      (value) =>
        samePath(value.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || value.source.pack.active),
    );
  }

  public generic(
    kind: GenericResourceKind,
    activeOnly = false,
  ): readonly GenericResourceDefinition[] {
    return this.snapshot.index.genericResources.filter(
      (value) =>
        value.kind === kind &&
        samePath(value.source.pack.resourcesRoot, this.resourcesRoot) &&
        (!activeOnly || value.source.pack.active),
    );
  }

  public resolveImage(id: string): CatalogResolution<ImageDefinition> {
    return this.resolveDefinitions(this.images(), id);
  }

  public resolveImageComponent(
    text: string,
  ): ImageComponentReference | undefined {
    const component = imageComponentParts(text);
    return component === undefined
      ? undefined
      : {
          ...component,
          resolution: this.resolveImage(component.id),
        };
  }

  public resolveItem(id: string): CatalogResolution<ItemDefinition> {
    return this.resolveDefinitions(this.items(), id);
  }

  public resolveEquipment(id: string): CatalogResolution<EquipmentDefinition> {
    return this.resolveDefinitions(this.equipments(), id);
  }

  public resolveJukeboxSong(
    id: string,
  ): CatalogResolution<JukeboxSongDefinition> {
    return this.resolveDefinitions(this.jukeboxSongs(), id);
  }

  public resolveSoundEvent(
    id: string,
  ): CatalogResolution<SoundEventDefinition> {
    return this.resolveDefinitions(this.soundEvents(), id);
  }

  public resolveLoot(id: string): CatalogResolution<LootDefinition> {
    return this.resolveDefinitions(this.lootTables(), id);
  }

  public resolveOpaque(
    kind: "block" | "furniture",
    id: string,
  ): CatalogResolution<OpaqueIdDefinition> {
    return this.resolveDefinitions(this.opaque(kind), id);
  }

  public resolveGeneric(
    kind: GenericResourceKind,
    id: string,
  ): CatalogResolution<GenericResourceDefinition> {
    return this.resolveDefinitions(
      this.generic(kind),
      makeIdentifier(id, "minecraft"),
    );
  }

  public resolve(kind: ResourceKind, id: string): CatalogResolution {
    switch (kind) {
      case "image":
        return this.resolveImage(id);
      case "item":
        return this.resolveItem(id);
      case "equipment":
        return this.resolveEquipment(id);
      case "jukebox-song":
        return this.resolveJukeboxSong(id);
      case "sound-event":
        return this.resolveSoundEvent(id);
      case "loot":
        return this.resolveLoot(id);
      case "vanilla-loot":
        return { status: "missing", candidates: [] };
      case "block":
      case "furniture":
        return this.resolveOpaque(kind, id);
      case "recipe":
      case "category":
      case "emoji":
      case "painting":
      case "configured-feature":
      case "placed-feature":
      case "advancement":
        return this.resolveGeneric(kind, id);
    }
  }

  public resourceFiles(kind?: ResourceFileKind): readonly ResourceFile[] {
    return resourceFilesForRoot(
      this.snapshot.index.resources,
      this.resourcesRoot,
      kind,
    );
  }

  public resourceCandidates(
    kind: ResourceFileKind,
    id: string,
  ): readonly ResourceFile[] {
    return resourceCandidates(
      this.snapshot.index.resources,
      this.resourcesRoot,
      kind,
      id,
    );
  }

  public effectiveResource(
    kind: ResourceFileKind,
    id: string,
  ): ResourceFile | undefined {
    return effectiveResource(
      this.snapshot.index.resources,
      this.resourcesRoot,
      kind,
      id,
    );
  }

  public resourceIdentifiers(kind: ResourceFileKind): readonly string[] {
    return resourceIdentifiers(
      this.snapshot.index.resources,
      this.resourcesRoot,
      kind,
    );
  }

  public complete(
    kind: ResourceKind,
    prefix = "",
    activeOnly = true,
  ): readonly CatalogCompletion[] {
    let values: readonly CatalogDefinition[];
    switch (kind) {
      case "image":
        values = this.images(activeOnly);
        break;
      case "item":
        values = this.items(activeOnly);
        break;
      case "equipment":
        values = this.equipments(activeOnly);
        break;
      case "jukebox-song":
        values = this.jukeboxSongs(activeOnly);
        break;
      case "sound-event":
        values = this.soundEvents(activeOnly);
        break;
      case "loot":
        values = this.lootTables(activeOnly);
        break;
      case "vanilla-loot":
        values = [];
        break;
      case "block":
      case "furniture":
        values = this.opaque(kind, activeOnly);
        break;
      case "recipe":
      case "category":
      case "emoji":
      case "painting":
      case "configured-feature":
      case "placed-feature":
      case "advancement":
        values = this.generic(kind, activeOnly);
        break;
    }
    const normalized = prefix.toLowerCase();
    const genericKind = isGenericResourceKind(kind);
    const shortCounts = new Map<string, number>();
    for (const value of values) {
      if (genericKind && value.id !== makeIdentifier(value.value, "minecraft"))
        continue;
      shortCounts.set(value.value, (shortCounts.get(value.value) ?? 0) + 1);
    }
    return values
      .filter(
        (value) =>
          value.id.toLowerCase().includes(normalized) ||
          value.value.toLowerCase().includes(normalized),
      )
      .map((definition) => ({
        id: definition.id,
        ...(shortCounts.get(definition.value) === 1 &&
        (!genericKind ||
          definition.id === makeIdentifier(definition.value, "minecraft"))
          ? { shortId: definition.value }
          : {}),
        kind,
        active: definition.source.pack.active,
        definition,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  public conflicts(uri?: string): readonly CoreIssue[] {
    const sourceUris = this.definitionSourceUris();
    return this.snapshot
      .issues(uri)
      .filter(
        (issue) =>
          sourceUris.has(issue.uri) &&
          (issue.code.includes("conflict") ||
            issue.code.includes("duplicate") ||
            issue.code.includes("ambiguous")),
      );
  }

  public issues(uri?: string): readonly CoreIssue[] {
    const sourceUris = this.definitionSourceUris();
    for (const parsed of this.snapshot.index.parsedFiles.values()) {
      if (parsedUriBelongsToRoot(parsed.uri, this.resourcesRoot))
        sourceUris.add(parsed.uri);
    }
    return this.snapshot
      .issues(uri)
      .filter((issue) => sourceUris.has(issue.uri));
  }

  private definitionSourceUris(): Set<string> {
    return new Set([
      ...this.images().map((value) => value.source.uri),
      ...this.items().map((value) => value.source.uri),
      ...this.equipments().map((value) => value.source.uri),
      ...this.jukeboxSongs().map((value) => value.source.uri),
      ...this.soundEvents().map((value) => value.source.uri),
      ...this.lootTables().map((value) => value.source.uri),
      ...this.opaque("block").map((value) => value.source.uri),
      ...this.opaque("furniture").map((value) => value.source.uri),
      ...this.snapshot.index.genericResources
        .filter((value) =>
          samePath(value.source.pack.resourcesRoot, this.resourcesRoot),
        )
        .map((value) => value.source.uri),
    ]);
  }

  private resolveDefinitions<T extends CatalogDefinition>(
    values: readonly T[],
    id: string,
  ): CatalogResolution<T> {
    const candidates = values.filter(
      (value) => value.id === id || (!id.includes(":") && value.value === id),
    );
    const active = candidates.filter(
      (candidate) => candidate.source.pack.active,
    );
    return {
      status:
        candidates.length === 0
          ? "missing"
          : candidates.length === 1
            ? "resolved"
            : "ambiguous",
      ...(active[0] !== undefined
        ? { selected: active[0] }
        : candidates[0] === undefined
          ? {}
          : { selected: candidates[0] }),
      candidates,
    };
  }
}
