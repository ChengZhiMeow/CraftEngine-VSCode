import { promises as fs } from "node:fs";

import { Messages } from "../messages.js";
import { makeIdentifier } from "../util/identifiers.js";
import { isRecord, isUnknownArray } from "../util/records.js";
import {
  VanillaBlockStateCatalog,
  type VanillaBlockStateReport,
} from "./block/states.js";

export interface VanillaItem {
  readonly id: string;
  readonly name: string;
  readonly itemModel: string;
}

interface VanillaCatalogJson {
  readonly items: readonly VanillaItem[];
  readonly itemModels: readonly string[];
  readonly models: readonly string[];
  readonly textures: readonly string[];
  readonly registries: Readonly<Record<string, readonly string[]>>;
  readonly defaultComponents: Readonly<Record<string, unknown>>;
  readonly blockStates: Readonly<Record<string, VanillaBlockStateReport>>;
  readonly soundEvents: Readonly<Record<string, unknown>>;
  readonly soundFiles: Readonly<Record<string, unknown>>;
}

export interface VanillaSoundEntry {
  readonly name: string;
  readonly type: "file" | "event";
  readonly volume: unknown;
  readonly pitch: unknown;
  readonly weight: number;
  readonly stream: boolean;
  readonly attenuationDistance: number;
  readonly preload: boolean;
}

export interface VanillaSoundEvent {
  readonly id: string;
  readonly replace: boolean;
  readonly subtitle?: string;
  readonly subtitleText?: string;
  readonly entries: readonly VanillaSoundEntry[];
}

export interface VanillaSoundFile {
  readonly id: string;
  readonly hash: string;
  readonly size: number;
}

export class VanillaCatalog {
  public readonly items: readonly VanillaItem[];
  public readonly itemsById: ReadonlyMap<string, VanillaItem>;
  public readonly itemModels: ReadonlySet<string>;
  public readonly models: ReadonlySet<string>;
  public readonly textures: ReadonlySet<string>;
  public readonly components: readonly string[];
  public readonly attributes: readonly string[];
  public readonly effects: readonly string[];
  public readonly sounds: readonly string[];
  public readonly enchantments: readonly string[];
  public readonly particles: readonly string[];
  public readonly entityTypes: readonly string[];
  public readonly blocks: readonly string[];
  public readonly potions: readonly string[];
  public readonly damageTypes: readonly string[];
  public readonly registries: Readonly<Record<string, readonly string[]>>;
  public readonly defaultComponents: Readonly<Record<string, unknown>>;
  public readonly blockStates: VanillaBlockStateCatalog;

  public constructor(data: VanillaCatalogJson) {
    this.items = data.items;
    this.itemsById = new Map(data.items.map((item) => [item.id, item]));
    this.itemModels = new Set(data.itemModels);
    this.models = new Set(data.models);
    this.textures = new Set(data.textures);
    this.components = data.registries["minecraft:data_component_type"] ?? [];
    this.attributes = data.registries["minecraft:attribute"] ?? [];
    this.effects = data.registries["minecraft:mob_effect"] ?? [];
    this.sounds = data.registries["minecraft:sound_event"] ?? [];
    this.enchantments = data.registries["minecraft:enchantment"] ?? [];
    this.particles = data.registries["minecraft:particle_type"] ?? [];
    this.entityTypes = data.registries["minecraft:entity_type"] ?? [];
    this.blocks = data.registries["minecraft:block"] ?? [];
    this.potions = data.registries["minecraft:potion"] ?? [];
    this.damageTypes = data.registries["minecraft:damage_type"] ?? [];
    this.registries = data.registries;
    this.defaultComponents = data.defaultComponents;
    this.blockStates = new VanillaBlockStateCatalog(data.blockStates);
  }
}

export class VanillaSoundCatalog {
  public readonly events: ReadonlyMap<string, VanillaSoundEvent>;
  public readonly eventIds: ReadonlySet<string>;
  public readonly files: ReadonlyMap<string, VanillaSoundFile>;

  public constructor(data: VanillaCatalogJson) {
    const events = new Map<string, VanillaSoundEvent>();
    for (const [rawId, raw] of Object.entries(data.soundEvents)) {
      if (!isRecord(raw)) continue;
      const id = makeIdentifier(rawId, "minecraft");
      const entries: VanillaSoundEntry[] = [];
      if (isUnknownArray(raw.sounds))
        for (const entry of raw.sounds) {
          if (typeof entry === "string") {
            entries.push({
              name: makeIdentifier(entry, "minecraft"),
              type: "file",
              volume: 1,
              pitch: 1,
              weight: 1,
              stream: false,
              attenuationDistance: 16,
              preload: false,
            });
            continue;
          }
          if (!isRecord(entry) || typeof entry.name !== "string") continue;

          entries.push({
            name: makeIdentifier(entry.name, "minecraft"),
            type:
              typeof entry.type === "string" &&
              entry.type.toLowerCase().split(":").at(-1) === "event"
                ? "event"
                : "file",
            volume: entry.volume ?? 1,
            pitch: entry.pitch ?? 1,
            weight:
              typeof entry.weight === "number" && Number.isFinite(entry.weight)
                ? entry.weight
                : 1,
            stream: entry.stream === true,
            attenuationDistance:
              typeof entry.attenuation_distance === "number" &&
              Number.isFinite(entry.attenuation_distance)
                ? entry.attenuation_distance
                : 16,
            preload: entry.preload === true,
          });
        }

      events.set(id, {
        id,
        replace: raw.replace === true,
        ...(typeof raw.subtitle === "string" ? { subtitle: raw.subtitle } : {}),
        ...(typeof raw.subtitleText === "string"
          ? { subtitleText: raw.subtitleText }
          : {}),
        entries,
      });
    }

    const files = new Map<string, VanillaSoundFile>();
    for (const [rawId, raw] of Object.entries(data.soundFiles)) {
      if (
        !isUnknownArray(raw) ||
        typeof raw[0] !== "string" ||
        typeof raw[1] !== "number"
      )
        continue;
      const id = makeIdentifier(rawId, "minecraft");
      files.set(id, { id, hash: raw[0], size: raw[1] });
    }
    this.events = events;
    this.eventIds = new Set(data.registries["minecraft:sound_event"] ?? []);
    this.files = files;
  }

  public describe(eventId: string): string | undefined {
    const event = this.events.get(makeIdentifier(eventId, "minecraft"));
    return event?.subtitleText ?? event?.subtitle;
  }

  public isVanillaEvent(eventId: string): boolean {
    return this.eventIds.has(makeIdentifier(eventId, "minecraft"));
  }
}

export class MinecraftCatalog {
  public constructor(
    public readonly vanilla: VanillaCatalog,
    public readonly sounds: VanillaSoundCatalog,
  ) {}

  public static async load(filePath: string): Promise<MinecraftCatalog> {
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (
      !isRecord(value) ||
      value.minecraftVersion !== "26.2" ||
      value.clientSha1 !== "2dc72797acbc1b63fc16a11c4ac393605f453754" ||
      value.assetIndexSha1 !== "49da57a9512de46382d2fe4b68af047fea7a16f9" ||
      !isRecord(value.soundEvents) ||
      !isRecord(value.soundFiles)
    )
      throw new Error(Messages.src.minecraft.catalog.text0001);

    const strings = (entry: unknown): readonly string[] =>
      isUnknownArray(entry)
        ? entry.filter((item): item is string => typeof item === "string")
        : [];
    const registries: Record<string, readonly string[]> = {};
    if (isRecord(value.registries))
      for (const [key, entry] of Object.entries(value.registries))
        registries[key] = strings(entry);
    if (!registries["minecraft:sound_event"])
      throw new Error(Messages.src.minecraft.catalog.text0001);

    const blockStates: Record<string, VanillaBlockStateReport> = {};
    if (isRecord(value.blockStates))
      for (const [id, rawReport] of Object.entries(value.blockStates)) {
        if (!isRecord(rawReport)) continue;
        const properties: Record<string, readonly string[]> = {};
        if (isRecord(rawReport.properties))
          for (const [name, rawValues] of Object.entries(
            rawReport.properties,
          )) {
            const values = strings(rawValues);
            if (values.length > 0) properties[name] = values;
          }
        const defaults: Record<string, string> = {};
        if (isRecord(rawReport.default))
          for (const [name, rawDefault] of Object.entries(rawReport.default))
            if (typeof rawDefault === "string") defaults[name] = rawDefault;
        blockStates[id] = {
          ...(Object.keys(properties).length === 0 ? {} : { properties }),
          ...(Object.keys(defaults).length === 0 ? {} : { default: defaults }),
          ...(typeof rawReport.stateCount === "number"
            ? { stateCount: rawReport.stateCount }
            : {}),
        };
      }

    const data: VanillaCatalogJson = {
      items: isUnknownArray(value.items)
        ? value.items.filter(
            (entry): entry is VanillaItem =>
              isRecord(entry) &&
              typeof entry.id === "string" &&
              typeof entry.name === "string" &&
              typeof entry.itemModel === "string",
          )
        : [],
      itemModels: strings(value.itemModels),
      models: strings(value.models),
      textures: strings(value.textures),
      registries,
      defaultComponents: isRecord(value.defaultComponents)
        ? value.defaultComponents
        : {},
      blockStates,
      soundEvents: value.soundEvents,
      soundFiles: value.soundFiles,
    };
    return new MinecraftCatalog(
      new VanillaCatalog(data),
      new VanillaSoundCatalog(data),
    );
  }
}

export function splitResourceIdentifier(
  identifier: string,
): [namespace: string, value: string] {
  const separator = identifier.indexOf(":");
  return separator < 0
    ? ["minecraft", identifier]
    : [identifier.slice(0, separator), identifier.slice(separator + 1)];
}

export function resourceLogicalPath(
  identifier: string,
  kind: "item-model" | "model" | "texture" | "font" | "blockstate",
): string {
  const [namespace, value] = splitResourceIdentifier(identifier);
  let folder: string;
  let extension = ".json";
  switch (kind) {
    case "item-model":
      folder = "items";
      break;
    case "model":
      folder = "models";
      break;
    case "texture":
      folder = "textures";
      extension = ".png";
      break;
    case "font":
      folder = "font";
      break;
    case "blockstate":
      folder = "blockstates";
      break;
  }
  return `assets/${namespace}/${folder}/${value.endsWith(extension) ? value : `${value}${extension}`}`;
}
