import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import type { ItemDefinition } from "../../config/item/model.js";
import type { JukeboxSongDefinition } from "../../config/jukebox/model.js";
import {
  buildLanguageCatalog,
  languageJsonFilesFromCatalog,
  type LanguageCatalog,
} from "../../config/text/languageCatalog.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import type { VanillaCatalog } from "../../minecraft/catalog.js";
import {
  VanillaFontStore,
  type VanillaGlyph,
} from "../../minecraft/font/store.js";
import { derivePalettedTexture } from "../../minecraft/texture/paletted.js";
import {
  preferredResource,
  readResourceText,
} from "../../resources/catalog.js";
import type { ResourceFileKind } from "../../resources/model.js";
import { resolveTextComponent } from "../../text/componentResolver.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { canonicalPath, isPathInside, samePath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type { CraftEngineWorkspaceIndex } from "../../workspace/index.js";
import { pngDataUrl } from "../shared/assets.js";
import {
  buildEquipmentPreviewData,
  type PreviewEquipmentAsset,
  type PreviewEquipmentSelection,
} from "./equipment.js";
import { InlineImageCollector, type InlineImageGlyph } from "./inlineImages.js";
import { buildSceneReferences, type SceneReferences } from "./scene.js";
import {
  minecraftAnimationLayout,
  minecraftAnimationMetadataProblem,
} from "../../minecraft/texture/animation.js";
import { collectBlockGeneratedModels } from "../../resources/blockGeneration.js";

import { Messages } from "../../messages.js";
export interface PreviewItemVariant {
  readonly material: string;
  readonly itemModel: string;
  readonly model: unknown;
  readonly components: Readonly<Record<string, unknown>>;
  readonly tooltipStyle?: string;
  readonly oversizedInGui?: boolean;
}

export interface TooltipSpriteScaling {
  readonly type: "stretch" | "tile" | "nine_slice";
  readonly width?: number;
  readonly height?: number;
  readonly border?: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly stretchInner?: boolean;
}

export interface TooltipSpriteAsset {
  readonly source: string;
  readonly scaling: TooltipSpriteScaling;
}

export interface TooltipStyleAsset {
  readonly id?: string;
  readonly background: TooltipSpriteAsset;
  readonly frame: TooltipSpriteAsset;
  readonly fallback: boolean;
  readonly missingParts?: readonly ("background" | "frame")[];
}

export interface ItemPreviewPayload {
  readonly kind: "item";
  readonly id: string;
  readonly pack: string;
  readonly source: string;
  readonly sourceOffset: number;
  readonly server: PreviewItemVariant;
  readonly client: PreviewItemVariant;
  readonly models: Readonly<Record<string, unknown>>;
  readonly textures: Readonly<Record<string, string>>;
  readonly textureMetadata: Readonly<Record<string, unknown>>;
  readonly inventoryTexture?: string;
  readonly missingTexture: string;
  readonly missingModel: boolean;
  readonly issues: readonly string[];
  readonly translations: Readonly<Record<string, string>>;
  readonly jukeboxSongs: Readonly<Record<string, unknown>>;
  readonly inlineImages: Readonly<Record<string, InlineImageGlyph>>;
  readonly tooltipStyles: Readonly<Record<string, TooltipStyleAsset>> & {
    readonly default: TooltipStyleAsset;
  };
  readonly equipmentAssets: Readonly<Record<string, PreviewEquipmentAsset>>;
  readonly equipmentTextures: Readonly<Record<string, string>>;
  readonly equipmentSelection?: PreviewEquipmentSelection;
  readonly sceneReferences: SceneReferences;
  readonly defaultDisplayContext: "player_equipment" | "ground" | "gui";
  readonly launchOptions?: ItemPreviewLaunchOptions;
  readonly variables: readonly string[];
  readonly displayContexts: readonly string[];
}

export interface ItemPreviewLaunchOptions {
  readonly initialVariant?: "server" | "client";
  readonly allowedVariants?: readonly ("server" | "client")[];
  readonly initialContext?: string;
  readonly allowedContexts?: readonly string[];
  readonly title?: string;
  readonly kind?: "item" | "block-state";
  readonly label?: string;
  readonly locatorOffset?: number;
}

function blockBehavior(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const type =
    typeof value.type === "string"
      ? (value.type.toLowerCase().split(":").pop() ?? "")
      : "";
  return (
    type === "block_item" ||
    type === "real_block_item" ||
    type === "furniture_item" ||
    typeof value.block === "string" ||
    typeof value.furniture === "string"
  );
}

export function defaultDisplayContextForItem(
  item: ItemDefinition,
  vanilla: VanillaCatalog,
  clientComponents?: Readonly<Record<string, unknown>>,
): "player_equipment" | "ground" | "gui" {
  const defaults = vanilla.defaultComponents[item.clientBoundMaterial];
  const components =
    clientComponents ??
    (isRecord(defaults) && isRecord(defaults.components)
      ? defaults.components
      : {});
  if (
    isRecord(components["minecraft:equippable"]) ||
    item.equipmentAssetId !== undefined ||
    item.equipmentSlot !== undefined
  ) {
    return "player_equipment";
  }
  if (item.behaviors.some(blockBehavior)) return "ground";
  const itemName = components["minecraft:item_name"];
  if (
    isRecord(itemName) &&
    typeof itemName.translate === "string" &&
    itemName.translate.startsWith("block.")
  )
    return "ground";
  return "gui";
}

function pngDimensions(
  bytes: Buffer,
): { readonly width: number; readonly height: number } | undefined {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG")
    return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function identifier(value: string, fallbackNamespace = "minecraft"): string {
  return makeIdentifier(value.toLowerCase(), fallbackNamespace);
}

function textureSprite(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isRecord(value)) return textureSprite(value.sprite);
  return undefined;
}

function modelType(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== "string") return "";
  const normalized = value.type.toLowerCase();
  const separator = normalized.indexOf(":");
  return separator < 0 ? normalized : normalized.slice(separator + 1);
}

function generatedParent(material: string): string {
  if (material.endsWith("_mace")) return "minecraft:item/handheld_mace";
  if (
    /(?:_sword|_pickaxe|_axe|_shovel|_hoe|trident|fishing_rod)$/u.test(material)
  )
    return "minecraft:item/handheld";
  return "minecraft:item/generated";
}

interface PreviewLoreModification {
  readonly lines: readonly string[];
  readonly operation: "append" | "prepend";
  readonly priority: number;
  readonly order: number;
}

function previewLoreLines(value: unknown): readonly string[] {
  const values = isUnknownArray(value) ? value : [value];
  if (!values.some(isRecord)) {
    return values
      .filter((entry) => entry !== null && entry !== undefined)
      .map(String);
  }

  let previousPriority = 0;
  const modifications = values
    .map((entry, order): PreviewLoreModification => {
      if (!isRecord(entry)) {
        const lines: string[] = [];
        switch (typeof entry) {
          case "string":
            lines.push(entry);
            break;
          case "number":
          case "bigint":
          case "boolean":
          case "symbol":
            lines.push(String(entry));
            break;
          case "function":
            lines.push(Function.prototype.toString.call(entry));
            break;
          case "object":
            if (isUnknownArray(entry)) lines.push(entry.join(","));
            break;
        }
        return {
          lines,
          operation: "append",
          priority: previousPriority,
          order,
        };
      }
      const rawPriority = Number(entry.priority);
      const priority = Number.isFinite(rawPriority)
        ? Math.trunc(rawPriority)
        : previousPriority;
      previousPriority = priority;
      const content = isUnknownArray(entry.content)
        ? entry.content
        : entry.content === undefined
          ? []
          : [entry.content];
      const lines = content
        .filter((line) => line !== null && line !== undefined)
        .map(String)
        .flatMap((line) =>
          entry.split_lines === true || entry["split-lines"] === true
            ? line.split(/\r?\n/u)
            : [line],
        );
      return {
        lines,
        operation: entry.operation === "prepend" ? "prepend" : "append",
        priority,
        order,
      };
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.order - right.order,
    );

  const result: string[] = [];
  for (const modification of modifications) {
    if (modification.operation === "prepend")
      result.unshift(...modification.lines);
    else result.push(...modification.lines);
  }
  return result;
}

export function previewComponents(
  defaults: Readonly<Record<string, unknown>>,
  processors: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const components: Record<string, unknown> = { ...defaults };
  if (isRecord(processors.components))
    Object.assign(components, processors.components);
  if (isRecord(processors.component))
    Object.assign(components, processors.component);
  const processorValue = (key: string): unknown =>
    processors[key] ?? processors[key.replaceAll("_", "-")];
  for (const [processor, component] of [
    ["item_name", "minecraft:item_name"],
    ["display_name", "minecraft:item_name"],
    ["custom_name", "minecraft:custom_name"],
    ["enchantments", "minecraft:enchantments"],
    ["enchantment", "minecraft:enchantments"],
    ["attribute_modifiers", "minecraft:attribute_modifiers"],
    ["attributes", "minecraft:attribute_modifiers"],
    ["unbreakable", "minecraft:unbreakable"],
    ["max_damage", "minecraft:max_damage"],
    ["dyed_color", "minecraft:dyed_color"],
    ["tooltip_style", "minecraft:tooltip_style"],
    ["jukebox_playable", "minecraft:jukebox_playable"],
  ] as const) {
    const value = processorValue(processor);
    if (value !== undefined) components[component] = value;
  }
  if (processors.lore !== undefined)
    components["minecraft:lore"] = previewLoreLines(processors.lore);

  const removed =
    processorValue("remove_components") ?? processorValue("remove_component");
  for (const raw of isUnknownArray(removed)
    ? removed
    : removed === undefined
      ? []
      : [removed]) {
    if (typeof raw === "string") delete components[identifier(raw)];
  }

  const hidden = processorValue("hide_tooltip");
  const hiddenIds = (
    isUnknownArray(hidden) ? hidden : hidden === undefined ? [] : [hidden]
  )
    .filter((value): value is string => typeof value === "string")
    .map((value) => identifier(value));
  if (hiddenIds.length > 0 || isUnknownArray(hidden)) {
    const display = isRecord(components["minecraft:tooltip_display"])
      ? components["minecraft:tooltip_display"]
      : {};
    const previous = display.hidden_components ?? display.hiddenComponents;
    const previousIds = (
      isUnknownArray(previous)
        ? previous
        : typeof previous === "string"
          ? [previous]
          : []
    )
      .filter((value): value is string => typeof value === "string")
      .map((value) => identifier(value));
    components["minecraft:tooltip_display"] = {
      ...display,
      hidden_components: [...new Set([...previousIds, ...hiddenIds])],
    };
  }
  return components;
}

export function previewJukeboxDescriptions(
  songs: readonly JukeboxSongDefinition[],
  resourcesRoot: string,
  render: (description: string) => unknown,
): Record<string, unknown> {
  return Object.fromEntries(
    songs
      .filter(
        (song) =>
          song.source.pack.active &&
          samePath(song.source.pack.resourcesRoot, resourcesRoot),
      )
      .map((song) => [song.id, render(song.description)]),
  );
}

function identifierValue(value: string): string {
  const separator = value.indexOf(":");
  return separator < 0 ? value : value.slice(separator + 1);
}

function modelLeafIds(value: unknown, result: string[] = []): string[] {
  if (isUnknownArray(value)) {
    for (const entry of value) modelLeafIds(entry, result);
    return result;
  }
  if (!isRecord(value)) return result;
  if (
    modelType(value) === "model" &&
    typeof (value.model ?? value.path) === "string"
  ) {
    const model = String(value.model ?? value.path);
    if (!result.includes(model)) result.push(model);
  }
  for (const child of Object.values(value)) modelLeafIds(child, result);
  return result;
}

export function simplifiedModelLeafIds(
  material: string,
  value: unknown,
): string[] {
  const leaves = modelLeafIds(value);
  const expected: readonly string[] | undefined = (
    {
      bow: [
        "minecraft:item/bow",
        "minecraft:item/bow_pulling_0",
        "minecraft:item/bow_pulling_1",
        "minecraft:item/bow_pulling_2",
      ],
      crossbow: [
        "minecraft:item/crossbow",
        "minecraft:item/crossbow_pulling_0",
        "minecraft:item/crossbow_pulling_1",
        "minecraft:item/crossbow_pulling_2",
        "minecraft:item/crossbow_arrow",
        "minecraft:item/crossbow_firework",
      ],
      fishing_rod: [
        "minecraft:item/fishing_rod",
        "minecraft:item/fishing_rod_cast",
      ],
    } as Readonly<Record<string, readonly string[]>>
  )[identifierValue(material)];
  if (!expected) return leaves;
  const byIdentifier = new Map(leaves.map((leaf) => [identifier(leaf), leaf]));
  const ordered = expected
    .map((leaf) => byIdentifier.get(leaf))
    .filter((leaf): leaf is string => leaf !== undefined);
  return ordered.length === expected.length ? ordered : leaves;
}

function replaceModelLeaves(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (isUnknownArray(value))
    return value.map((entry) => replaceModelLeaves(entry, replacements));
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    result[key] = replaceModelLeaves(entry, replacements);
  if (modelType(value) === "model") {
    const old = value.model ?? value.path;
    if (typeof old === "string") {
      const replacement = replacements.get(old);
      if (replacement) result.model = replacement;
    }
  }
  return result;
}

function automaticModelPath(
  item: ItemDefinition,
  material: string,
  originalLeaf: string | undefined,
  index: number,
): string {
  const base = `${item.namespace}:item/${item.value}`;
  if (!originalLeaf || index === 0) return base;
  const materialValue = identifierValue(material);
  const leafValue = identifierValue(originalLeaf).replace(/^item\//u, "");
  if (leafValue.startsWith(materialValue))
    return `${base}${leafValue.slice(materialValue.length)}`;
  return `${base}_${index}`;
}

function normalizeModelNode(value: unknown): unknown {
  if (typeof value === "string")
    return { type: "minecraft:model", model: identifier(value) };
  if (isUnknownArray(value))
    return {
      type: "minecraft:composite",
      models: value.map(normalizeModelNode),
    };
  if (!isRecord(value)) return { type: "minecraft:empty" };
  const result: Record<string, unknown> = { ...value };
  if (
    typeof result.type !== "string" &&
    typeof (result.model ?? result.path) === "string"
  ) {
    result.type = "minecraft:model";
  }
  if (typeof result.type === "string") result.type = identifier(result.type);
  if (typeof result.property === "string")
    result.property = identifier(result.property);
  const type = modelType(result);
  if (type === "model" && typeof (result.model ?? result.path) === "string") {
    result.model = identifier(String(result.model ?? result.path));
  }
  if (type === "condition") {
    result.on_true = normalizeModelNode(result.on_true ?? result["on-true"]);
    result.on_false = normalizeModelNode(result.on_false ?? result["on-false"]);
  } else if (type === "range_dispatch") {
    if (result.fallback !== undefined)
      result.fallback = normalizeModelNode(result.fallback);
    if (isUnknownArray(result.entries))
      result.entries = result.entries.map((entry: unknown) =>
        isRecord(entry)
          ? { ...entry, model: normalizeModelNode(entry.model) }
          : entry,
      );
  } else if (type === "select") {
    if (result.fallback !== undefined)
      result.fallback = normalizeModelNode(result.fallback);
    if (isUnknownArray(result.cases))
      result.cases = result.cases.map((entry: unknown) =>
        isRecord(entry)
          ? { ...entry, model: normalizeModelNode(entry.model) }
          : entry,
      );
  } else if (type === "composite" && isUnknownArray(result.models)) {
    result.models = result.models.map(normalizeModelNode);
  } else if (type === "special") {
    const base = result.base ?? result.path;
    if (typeof base === "string") result.base = identifier(base);
    if (isRecord(result.model) && typeof result.model.type === "string") {
      result.model = { ...result.model, type: identifier(result.model.type) };
    }
  }
  return result;
}

function collectVariables(value: unknown, result: Set<string>): void {
  if (typeof value === "string") {
    for (const pattern of [
      /\$\{([A-Za-z_][A-Za-z0-9_.-]*)/gu,
      /<arg:([^:>]+)/gu,
      /%([A-Za-z_][A-Za-z0-9_.-]*)%/gu,
    ]) {
      for (const match of value.matchAll(pattern))
        if (match[1]) result.add(match[1]);
    }
    return;
  }
  if (isUnknownArray(value))
    for (const entry of value) collectVariables(entry, result);
  else if (isRecord(value))
    for (const [key, entry] of Object.entries(value)) {
      collectVariables(key, result);
      collectVariables(entry, result);
    }
}

function defaultMissingTexture(): string {
  const png = new PNG({ width: 16, height: 16 });
  for (let y = 0; y < 16; y += 1)
    for (let x = 0; x < 16; x += 1) {
      const bright = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 1;
      const offset = (y * 16 + x) * 4;
      png.data[offset] = bright ? 248 : 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = bright ? 248 : 0;
      png.data[offset + 3] = 255;
    }
  return pngDataUrl(PNG.sync.write(png));
}

function borderValue(
  value: unknown,
): TooltipSpriteScaling["border"] | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return { left: value, top: value, right: value, bottom: value };
  }
  if (!isRecord(value)) return undefined;
  const left = Number(value.left);
  const top = Number(value.top);
  const right = Number(value.right);
  const bottom = Number(value.bottom);
  if (
    ![left, top, right, bottom].every(
      (entry) => Number.isInteger(entry) && entry >= 0,
    )
  )
    return undefined;
  return { left, top, right, bottom };
}

function spriteScaling(metadata: unknown): TooltipSpriteScaling {
  const scaling =
    isRecord(metadata) &&
    isRecord(metadata.gui) &&
    isRecord(metadata.gui.scaling)
      ? metadata.gui.scaling
      : undefined;
  if (!scaling || typeof scaling.type !== "string") return { type: "stretch" };
  const type = scaling.type.replace(/^minecraft:/u, "");
  if (type === "tile") {
    const width = Number(scaling.width);
    const height = Number(scaling.height);
    return Number.isInteger(width) &&
      width > 0 &&
      Number.isInteger(height) &&
      height > 0
      ? { type, width, height }
      : { type: "stretch" };
  }
  if (type !== "nine_slice") return { type: "stretch" };
  const width = Number(scaling.width);
  const height = Number(scaling.height);
  const border = borderValue(scaling.border);
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0 ||
    !border
  )
    return { type: "stretch" };
  return {
    type,
    width,
    height,
    border,
    stretchInner: scaling.stretch_inner === true,
  };
}

export class ItemPreviewDataBuilder {
  private translations: Readonly<Record<string, string>> | undefined;
  private languages: LanguageCatalog | undefined;
  private languageGeneration = -1;
  private readonly font: VanillaFontStore;

  public constructor(
    private readonly index: CraftEngineWorkspaceIndex,
    private readonly vanilla: VanillaCatalog,
    private readonly assets: VanillaAssetStore,
  ) {
    this.font = new VanillaFontStore(assets);
  }

  public async glyphs(
    codepoints: readonly number[],
  ): Promise<Readonly<Record<string, VanillaGlyph>>> {
    return this.font.glyphs(codepoints);
  }

  public async build(item: ItemDefinition): Promise<ItemPreviewPayload> {
    const issues: string[] = [];
    const languages = await this.languageCatalog();
    const rootLanguages = languages.forRoot(item.source.pack.resourcesRoot);
    const inlineImages = new InlineImageCollector(this.index, item);
    const generatedModels = new Map<string, unknown>();
    const resourcesRoot = canonicalPath(item.source.pack.resourcesRoot);
    for (const block of this.index.index.blocks) {
      if (
        canonicalPath(block.source.pack.resourcesRoot) === resourcesRoot &&
        block.source.pack.active === item.source.pack.active
      )
        collectBlockGeneratedModels(block.raw, generatedModels);
    }
    const rawServer = await this.variant(item, false, generatedModels, issues);
    const rawClient = await this.variant(item, true, generatedModels, issues);
    const server = {
      ...rawServer,
      components: resolveTextComponent(rawServer.components, rootLanguages, {
        imageResolver: inlineImages.resolver,
      }) as Readonly<Record<string, unknown>>,
    };
    const client = {
      ...rawClient,
      components: resolveTextComponent(rawClient.components, rootLanguages, {
        imageResolver: inlineImages.resolver,
      }) as Readonly<Record<string, unknown>>,
    };
    const resolvedInlineImages = await inlineImages.build();
    issues.push(...resolvedInlineImages.issues);
    const models = new Map<string, unknown>(generatedModels);
    const textureIds = new Set<string>();
    const visitedModels = new Set<string>();
    for (const node of [server.model, client.model])
      await this.collectModelNode(
        item,
        node,
        models,
        textureIds,
        visitedModels,
        issues,
      );
    for (const [id, model] of [...models])
      await this.collectLegacyModel(
        item,
        id,
        model,
        models,
        textureIds,
        visitedModels,
        issues,
      );
    const missingTexture = defaultMissingTexture();
    const textures: Record<string, string> = {};
    const textureMetadata: Record<string, unknown> = {};
    const palettedAssets = new Map<string, Promise<Buffer | undefined>>();
    const readPalettedAsset = (
      logicalPath: string,
    ): Promise<Buffer | undefined> => {
      const key = `${canonicalPath(item.source.pack.resourcesRoot)}\u0000${logicalPath}`;
      let pending = palettedAssets.get(key);
      if (!pending) {
        pending = this.readPalettedAsset(item, logicalPath);
        palettedAssets.set(key, pending);
      }
      return pending;
    };
    for (const textureId of textureIds) {
      const filePath = await this.resourcePath(item, "texture", textureId);
      if (!filePath) {
        const derived = await derivePalettedTexture(
          textureId,
          ["minecraft:items", "minecraft:armor_trims"],
          readPalettedAsset,
        );
        if (derived) {
          textures[textureId] = pngDataUrl(derived);
          continue;
        }
        issues.push(Messages.src.preview.item.data.text0001(textureId));
        continue;
      }
      try {
        const bytes = await fs.readFile(filePath);
        textures[textureId] = pngDataUrl(bytes);
        try {
          const metadata: unknown = JSON.parse(
            await fs.readFile(`${filePath}.mcmeta`, "utf8"),
          );
          if (isRecord(metadata) && metadata.animation !== undefined) {
            const problem = minecraftAnimationMetadataProblem(
              metadata.animation,
            );
            const dimensions = pngDimensions(bytes);
            const layout =
              problem || !dimensions
                ? undefined
                : minecraftAnimationLayout(
                    metadata.animation,
                    dimensions.width,
                    dimensions.height,
                  );
            const layoutProblem =
              layout?.ok === false ? layout.problem : undefined;
            if (problem || layoutProblem) {
              issues.push(
                Messages.src.preview.item.data.text0003(
                  textureId,
                  problem ??
                    layoutProblem ??
                    Messages.src.preview.item.data.text0002,
                ),
              );
              textures[textureId] = missingTexture;
            } else {
              textureMetadata[textureId] = metadata.animation;
            }
          }
        } catch (error) {
          if (!isRecord(error) || error.code !== "ENOENT")
            issues.push(Messages.src.preview.item.data.text0004(textureId));
        }
      } catch {
        issues.push(Messages.src.preview.item.data.text0005(textureId));
      }
    }
    const defaultTooltipStyle = await this.loadTooltipStyle(
      item,
      undefined,
      missingTexture,
    );
    const tooltipStyles: Record<string, TooltipStyleAsset> & {
      default: TooltipStyleAsset;
    } = { default: defaultTooltipStyle };
    for (const styleId of new Set(
      [server.tooltipStyle, client.tooltipStyle].filter(
        (value): value is string => typeof value === "string",
      ),
    )) {
      const loaded = await this.loadTooltipStyle(item, styleId, missingTexture);
      if (loaded.missing.length > 0) {
        issues.push(
          Messages.src.preview.item.data.text0006(
            styleId,
            loaded.missing.join("、"),
          ),
        );
      }
      tooltipStyles[styleId] = {
        id: styleId,
        background: loaded.background,
        frame: loaded.frame,
        fallback: false,
        ...(loaded.missingParts.length > 0
          ? { missingParts: loaded.missingParts }
          : {}),
      };
    }
    const variables = new Set<string>();
    collectVariables(item.raw, variables);
    const equipment = await buildEquipmentPreviewData(
      item,
      client.components,
      this.index.index.equipments ?? [],
      async (id) => {
        try {
          const filePath = await this.assets.resource(id, "texture");
          return pngDataUrl(await fs.readFile(filePath));
        } catch {
          return undefined;
        }
      },
    );
    const sceneReferences = await buildSceneReferences(this.assets);
    const inventoryTexture = await this.loadInventoryTexture();
    const jukeboxSongs = previewJukeboxDescriptions(
      this.index.index.jukeboxSongs ?? [],
      item.source.pack.resourcesRoot,
      (description) =>
        resolveTextComponent(description, rootLanguages, {
          imageResolver: inlineImages.resolver,
        }),
    );
    return {
      kind: "item",
      id: item.id,
      pack: item.source.pack.name,
      source: item.source.uri,
      sourceOffset: item.source.idRange.start,
      server,
      client,
      models: Object.fromEntries(models),
      textures,
      textureMetadata,
      ...(inventoryTexture ? { inventoryTexture } : {}),
      missingTexture,
      missingModel: issues.some(
        (entry) =>
          entry.startsWith(Messages.src.preview.item.data.text0007) ||
          entry.startsWith(Messages.src.preview.item.data.text0008),
      ),
      issues: [...new Set(issues)],
      translations: rootLanguages.translations("zh_cn", "client"),
      jukeboxSongs,
      inlineImages: resolvedInlineImages.glyphs,
      tooltipStyles,
      ...equipment,
      sceneReferences,
      defaultDisplayContext: defaultDisplayContextForItem(
        item,
        this.vanilla,
        client.components,
      ),
      variables: [...variables].sort(),
      displayContexts: [
        "none",
        "thirdperson_lefthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "firstperson_righthand",
        "head",
        "player_equipment",
        "gui",
        "ground",
        "fixed",
        "on_shelf",
      ],
    };
  }

  private async variant(
    item: ItemDefinition,
    client: boolean,
    generatedModels: Map<string, unknown>,
    issues: string[],
  ): Promise<PreviewItemVariant> {
    const material = client ? item.clientBoundMaterial : item.material;
    const defaultData = this.vanilla.defaultComponents[material];
    const defaults =
      isRecord(defaultData) && isRecord(defaultData.components)
        ? defaultData.components
        : {};
    const processors = client
      ? { ...item.data, ...item.clientBoundData }
      : item.data;
    const components = previewComponents(defaults, processors);
    if (item.equipmentAssetId) {
      const equippable = isRecord(components["minecraft:equippable"])
        ? components["minecraft:equippable"]
        : {};
      components["minecraft:equippable"] = {
        ...equippable,
        asset_id: item.equipmentAssetId,
        ...(item.equipmentSlot === undefined
          ? {}
          : { slot: item.equipmentSlot }),
      };
    }
    const hasConfiguredModel =
      item.model !== undefined ||
      item.textures.length > 0 ||
      item.legacyModel !== undefined;
    const rootItemModel = item.itemModel;
    const itemModel =
      (typeof processors.item_model === "string"
        ? identifier(processors.item_model)
        : undefined) ??
      rootItemModel ??
      (hasConfiguredModel ? item.id : material);
    const applyRootModel = client
      ? item.clientBoundModel
      : !item.clientBoundModel;
    if (applyRootModel) {
      if (item.customModelData !== undefined)
        components["minecraft:custom_model_data"] = {
          floats: [item.customModelData],
        };
      if (rootItemModel || hasConfiguredModel)
        components["minecraft:item_model"] = itemModel;
    }

    const configuredOversizedInGui =
      item.raw.oversized_in_gui ?? item.raw["oversized-in-gui"];
    let oversizedInGui = configuredOversizedInGui === true;
    let model: unknown;
    const customModelForVariant =
      hasConfiguredModel && (client || !item.clientBoundModel);
    if (
      customModelForVariant &&
      (item.textures.length > 0 || isUnknownArray(item.model))
    ) {
      model = await this.simplifiedModel(
        item,
        material,
        generatedModels,
        issues,
      );
    } else if (customModelForVariant && item.model !== undefined) {
      model = normalizeModelNode(item.model);
    } else {
      const defaultModel = applyRootModel ? itemModel : material;
      const itemDefinition = await this.readJson(
        item,
        "item-model",
        defaultModel,
      );
      if (isRecord(itemDefinition) && itemDefinition.model !== undefined) {
        model = normalizeModelNode(itemDefinition.model);
        if (typeof configuredOversizedInGui !== "boolean")
          oversizedInGui = itemDefinition.oversized_in_gui === true;
      } else {
        issues.push(Messages.src.preview.item.data.text0009(defaultModel));
        model = { type: "minecraft:model", model: "minecraft:builtin/missing" };
      }
    }
    const tooltipStyleValue = components["minecraft:tooltip_style"];
    const tooltipStyle =
      typeof tooltipStyleValue === "string"
        ? identifier(tooltipStyleValue, "minecraft")
        : undefined;
    if (tooltipStyle) components["minecraft:tooltip_style"] = tooltipStyle;
    return {
      material,
      itemModel,
      model,
      components,
      ...(tooltipStyle ? { tooltipStyle } : {}),
      ...(oversizedInGui ? { oversizedInGui: true } : {}),
    };
  }

  private async simplifiedModel(
    item: ItemDefinition,
    material: string,
    generatedModels: Map<string, unknown>,
    issues: string[],
  ): Promise<unknown> {
    const rawModels = item.raw.model ?? item.raw.models;
    const configuredModels =
      typeof rawModels === "string"
        ? [rawModels]
        : isUnknownArray(rawModels)
          ? rawModels.filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [];
    const materialValue = identifierValue(material);
    const fixedCount: number | undefined = (
      {
        bow: 4,
        crossbow: 6,
        fishing_rod: 2,
        elytra: 2,
        shield: 2,
        wooden_spear: 2,
        copper_spear: 2,
        stone_spear: 2,
        iron_spear: 2,
        golden_spear: 2,
        diamond_spear: 2,
        netherite_spear: 2,
      } as Readonly<Record<string, number>>
    )[materialValue];
    if (fixedCount === undefined) {
      if (item.textures.length === 0) {
        if (configuredModels.length === 0) return { type: "minecraft:empty" };
        if (configuredModels.length === 1)
          return { type: "minecraft:model", model: configuredModels[0] };
        return {
          type: "minecraft:composite",
          models: configuredModels.map((model) => ({
            type: "minecraft:model",
            model,
          })),
        };
      }
      if (configuredModels.length > 1)
        issues.push(Messages.src.preview.item.data.text0010(material));
      const modelId = configuredModels[0]
        ? identifier(configuredModels[0])
        : `${item.namespace}:item/${item.value}`;
      generatedModels.set(modelId, {
        parent: generatedParent(material),
        textures: Object.fromEntries(
          item.textures.map((texture, index) => [
            `layer${index}`,
            identifier(texture),
          ]),
        ),
      });
      return { type: "minecraft:model", model: modelId };
    }

    const supplied =
      item.textures.length > 0 ? item.textures : configuredModels;
    if (supplied.length !== fixedCount) {
      issues.push(
        Messages.src.preview.item.data.text0011(
          material,
          fixedCount,
          item.textures.length > 0,
          supplied.length,
        ),
      );
    }
    if (
      item.textures.length > 0 &&
      configuredModels.length > 0 &&
      configuredModels.length !== fixedCount
    ) {
      issues.push(
        Messages.src.preview.item.data.text0012(material, fixedCount),
      );
    }
    const presetId =
      item.itemModel && this.vanilla.itemModels.has(item.itemModel)
        ? item.itemModel
        : material;
    const definition = await this.readJson(item, "item-model", presetId);
    if (!isRecord(definition) || definition.model === undefined) {
      issues.push(Messages.src.preview.item.data.text0013(presetId));
      return { type: "minecraft:model", model: "minecraft:builtin/missing" };
    }
    const normalized = normalizeModelNode(definition.model);
    const leaves = simplifiedModelLeafIds(materialValue, normalized);
    const replacements = new Map<string, string>();
    leaves.slice(0, fixedCount).forEach((leaf, index) => {
      const configured = configuredModels[index];
      replacements.set(
        leaf,
        configured
          ? identifier(configured)
          : automaticModelPath(item, material, leaf, index),
      );
    });
    if (item.textures.length > 0) {
      for (
        let index = 0;
        index < Math.min(fixedCount, item.textures.length);
        index += 1
      ) {
        const originalLeaf = leaves[index];
        const modelId =
          replacements.get(originalLeaf ?? "") ??
          automaticModelPath(item, material, originalLeaf, index);
        let parent = generatedParent(material);
        if (originalLeaf) {
          const originalModel = await this.readJson(
            item,
            "model",
            identifier(originalLeaf),
          );
          if (
            isRecord(originalModel) &&
            typeof originalModel.parent === "string"
          )
            parent = identifier(originalModel.parent);
        }
        generatedModels.set(modelId, {
          parent,
          textures: { layer0: identifier(item.textures[index]!) },
        });
      }
    }
    return replaceModelLeaves(normalized, replacements);
  }

  private async collectModelNode(
    item: ItemDefinition,
    node: unknown,
    models: Map<string, unknown>,
    textures: Set<string>,
    visited: Set<string>,
    issues: string[],
  ): Promise<void> {
    if (isUnknownArray(node)) {
      for (const entry of node)
        await this.collectModelNode(
          item,
          entry,
          models,
          textures,
          visited,
          issues,
        );
      return;
    }
    if (!isRecord(node)) return;
    const type = modelType(node);
    if (type === "model") {
      const rawId = node.model ?? node.path;
      if (typeof rawId === "string") {
        const id = identifier(rawId);
        if (isRecord(node.generation)) models.set(id, node.generation);
        if (!models.has(id)) {
          const model = await this.readJson(item, "model", id);
          if (model) models.set(id, model);
          else issues.push(Messages.src.preview.item.data.text0014(id));
        }
      }
    } else if (type === "special") {
      const rawId = node.base ?? node.path;
      if (typeof rawId === "string") {
        const id = identifier(rawId);
        if (isRecord(node.generation)) models.set(id, node.generation);
        if (!models.has(id)) {
          const model = await this.readJson(item, "model", id);
          if (model) models.set(id, model);
          else issues.push(Messages.src.preview.item.data.text0015(id));
        }
      }
      if (isRecord(node.model) && typeof node.model.texture === "string")
        textures.add(identifier(node.model.texture));
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "generation" && key !== "tints" && key !== "transformation")
        await this.collectModelNode(
          item,
          child,
          models,
          textures,
          visited,
          issues,
        );
    }
  }

  private async collectLegacyModel(
    item: ItemDefinition,
    id: string,
    model: unknown,
    models: Map<string, unknown>,
    textures: Set<string>,
    visited: Set<string>,
    issues: string[],
    stack: readonly string[] = [],
  ): Promise<void> {
    if (visited.has(id) || !isRecord(model)) return;
    if (
      id !== "minecraft:block/block" &&
      typeof model.parent !== "string" &&
      (!isUnknownArray(model.elements) || model.elements.length === 0)
    ) {
      issues.push(Messages.src.preview.item.data.text0016(id));
    }
    if (stack.includes(id)) {
      issues.push(
        Messages.src.preview.item.data.text0017([...stack, id].join(" -> ")),
      );
      return;
    }
    const nextStack = [...stack, id];
    if (isRecord(model.textures))
      for (const value of Object.values(model.textures)) {
        const sprite = textureSprite(value);
        if (sprite && !sprite.startsWith("#")) textures.add(identifier(sprite));
      }
    if (
      typeof model.parent === "string" &&
      !model.parent.startsWith("builtin/")
    ) {
      const parent = identifier(model.parent, "minecraft");
      if (nextStack.includes(parent)) {
        issues.push(
          Messages.src.preview.item.data.text0018(
            [...nextStack, parent].join(" -> "),
          ),
        );
      } else {
        let parentModel = models.get(parent);
        if (!parentModel) {
          parentModel = await this.readJson(item, "model", parent);
          if (parentModel) models.set(parent, parentModel);
          else issues.push(Messages.src.preview.item.data.text0019(parent));
        }
        if (parentModel)
          await this.collectLegacyModel(
            item,
            parent,
            parentModel,
            models,
            textures,
            visited,
            issues,
            nextStack,
          );
      }
    }
    visited.add(id);
  }

  private async readJson(
    item: ItemDefinition,
    kind: "model" | "item-model",
    id: string,
  ): Promise<unknown> {
    const workspace = preferredResource(
      this.index.index.resources,
      item.source.pack.resourcesRoot,
      kind,
      id,
    );
    try {
      if (workspace)
        return JSON.parse(await readResourceText(workspace)) as unknown;
      const filePath = await this.resourcePath(item, kind, id);
      return filePath
        ? (JSON.parse(await fs.readFile(filePath, "utf8")) as unknown)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async resourcePath(
    item: ItemDefinition,
    kind: ResourceFileKind,
    id: string,
  ): Promise<string | undefined> {
    const workspace = preferredResource(
      this.index.index.resources,
      item.source.pack.resourcesRoot,
      kind,
      id,
    );
    if (workspace) return workspace.path;
    if (
      kind === "texture" ||
      kind === "model" ||
      kind === "item-model" ||
      kind === "font" ||
      kind === "blockstate"
    ) {
      const filePath = await this.assets.resource(id, kind);
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private async readPalettedAsset(
    item: ItemDefinition,
    logicalPath: string,
  ): Promise<Buffer | undefined> {
    const packs = this.index.packs
      .filter(
        (pack) =>
          pack.active &&
          samePath(pack.resourcesRoot, item.source.pack.resourcesRoot),
      )
      .sort((left, right) => left.loadOrder - right.loadOrder);
    for (const pack of packs) {
      try {
        return await fs.readFile(
          path.join(pack.resourcePackRoot, ...logicalPath.split("/")),
        );
      } catch {
        continue;
      }
    }
    try {
      return await fs.readFile(
        path.join(
          await this.assets.ensureExtracted(),
          ...logicalPath.split("/"),
        ),
      );
    } catch {
      return undefined;
    }
  }

  private async loadTooltipSprite(
    item: ItemDefinition,
    style: string | undefined,
    part: "background" | "frame",
  ): Promise<{ readonly id: string; readonly asset?: TooltipSpriteAsset }> {
    const normalizedStyle = style
      ? makeIdentifier(style, "minecraft")
      : undefined;
    const separator = normalizedStyle?.indexOf(":") ?? -1;
    const id = normalizedStyle
      ? `${normalizedStyle.slice(0, separator)}:gui/sprites/tooltip/${normalizedStyle.slice(separator + 1)}_${part}`
      : `minecraft:gui/sprites/tooltip/${part}`;
    const filePath = await this.resourcePath(item, "texture", id);
    if (!filePath) return { id };
    try {
      const bytes = await fs.readFile(filePath);
      let metadata: unknown;
      try {
        metadata = JSON.parse(
          await fs.readFile(`${filePath}.mcmeta`, "utf8"),
        ) as unknown;
      } catch {
        metadata = undefined;
      }
      return {
        id,
        asset: { source: pngDataUrl(bytes), scaling: spriteScaling(metadata) },
      };
    } catch {
      return { id };
    }
  }

  private async loadTooltipStyle(
    item: ItemDefinition,
    style: undefined,
    missingTexture: string,
  ): Promise<TooltipStyleAsset>;
  private async loadTooltipStyle(
    item: ItemDefinition,
    style: string,
    missingTexture: string,
  ): Promise<{
    readonly background: TooltipSpriteAsset;
    readonly frame: TooltipSpriteAsset;
    readonly missing: readonly string[];
    readonly missingParts: readonly ("background" | "frame")[];
  }>;
  private async loadTooltipStyle(
    item: ItemDefinition,
    style: string | undefined,
    missingTexture: string,
  ): Promise<
    | TooltipStyleAsset
    | {
        readonly background: TooltipSpriteAsset;
        readonly frame: TooltipSpriteAsset;
        readonly missing: readonly string[];
        readonly missingParts: readonly ("background" | "frame")[];
      }
  > {
    const [background, frame] = await Promise.all([
      this.loadTooltipSprite(item, style, "background"),
      this.loadTooltipSprite(item, style, "frame"),
    ]);
    const missingAsset: TooltipSpriteAsset = {
      source: missingTexture,
      scaling: { type: "stretch" },
    };
    if (!style) {
      return {
        background: background.asset ?? missingAsset,
        frame: frame.asset ?? missingAsset,
        fallback: false,
        ...(!background.asset || !frame.asset
          ? {
              missingParts: [
                ...(background.asset ? [] : ["background" as const]),
                ...(frame.asset ? [] : ["frame" as const]),
              ],
            }
          : {}),
      };
    }
    const missing = [
      ...(background.asset
        ? []
        : [Messages.src.preview.item.data.text0020(background.id)]),
      ...(frame.asset
        ? []
        : [Messages.src.preview.item.data.text0021(frame.id)]),
    ];
    return {
      background: background.asset ?? missingAsset,
      frame: frame.asset ?? missingAsset,
      missing,
      missingParts: [
        ...(background.asset ? [] : ["background" as const]),
        ...(frame.asset ? [] : ["frame" as const]),
      ],
    };
  }

  private async loadTranslations(): Promise<Readonly<Record<string, string>>> {
    if (this.translations) return this.translations;
    const filePath = path.join(
      await this.assets.ensureExtracted(),
      "assets",
      "minecraft",
      "lang",
      "zh_cn.json",
    );
    const value: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    this.translations = isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
    return this.translations;
  }

  private async loadInventoryTexture(): Promise<string | undefined> {
    try {
      const filePath = await this.assets.resource(
        "minecraft:gui/container/inventory",
        "texture",
      );
      return pngDataUrl(await fs.readFile(filePath));
    } catch {
      return undefined;
    }
  }

  private async languageCatalog(): Promise<LanguageCatalog> {
    const generation = this.index.index.generation;
    if (this.languages && this.languageGeneration === generation)
      return this.languages;
    const parsed = [...this.index.index.parsedFiles.values()];
    const packs = [
      ...new Map(
        [
          ...(this.index.packs ?? []),
          ...(this.index.index.items ?? []).map((item) => item.source.pack),
          ...(this.index.index.images ?? []).map((image) => image.source.pack),
          ...(this.index.index.blocks ?? []).map((block) => block.source.pack),
          ...(this.index.index.furniture ?? []).map(
            (furniture) => furniture.source.pack,
          ),
        ].map((pack) => [
          `${canonicalPath(pack.resourcesRoot)}\u0000${canonicalPath(pack.configurationRoot)}`,
          pack,
        ]),
      ).values(),
    ];
    const yamlFiles = parsed.flatMap((file) => {
      let filePath: string;
      try {
        filePath = fileURLToPath(file.uri);
      } catch {
        return [];
      }
      const pack = packs
        .filter((candidate) => {
          return isPathInside(filePath, candidate.configurationRoot);
        })
        .sort(
          (left, right) =>
            right.configurationRoot.length - left.configurationRoot.length,
        )[0];
      return pack ? [{ parsed: file, pack }] : [];
    });
    const [resourceJson, vanillaClient] = await Promise.all([
      languageJsonFilesFromCatalog(this.index.index.resources),
      this.loadTranslations(),
    ]);
    this.languages = buildLanguageCatalog(yamlFiles, {
      resourceJson,
      vanillaClient,
      vanillaLocale: "zh_cn",
    });
    this.languageGeneration = generation;
    return this.languages;
  }
}
