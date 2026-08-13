import {
  isRecord,
  isStringRecord,
  isUnknownArray,
  type UnknownRecord,
} from "./runtime.js";

export interface VsCodeApi<State, OutboundMessage> {
  postMessage(message: OutboundMessage): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare global {
  function acquireVsCodeApi<
    State = unknown,
    OutboundMessage = unknown,
  >(): VsCodeApi<State, OutboundMessage>;
}

export interface ImagePreviewPayload {
  readonly id: string;
  readonly pack: string;
  readonly source: string;
  readonly sourceOffset: number;
  readonly texturePath: string;
  readonly textureUrl: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly rows: number;
  readonly columns: number;
  readonly row: number;
  readonly column: number;
  readonly height: number;
  readonly ascent: number;
  readonly font: string;
  readonly canSaveConfiguration: boolean;
  readonly saveUnavailableReason: string;
  readonly defaultZoom: number;
  readonly defaultReservedLines: number;
  readonly vanilla: Readonly<{
    generic54: string;
    anvil: string;
    textField: string;
  }>;
}

export type ImageInboundMessage =
  | Readonly<{ type: "preview"; payload: ImagePreviewPayload }>
  | Readonly<{
      type: "saveResult";
      ok: boolean;
      message?: string;
      height: number;
      ascent: number;
    }>;

export type ImageOutboundMessage =
  | Readonly<{ type: "ready" | "openTexture" }>
  | Readonly<{ type: "saveConfig"; height: number; ascent: number }>
  | Readonly<{ type: "rendered"; id: string; unicodeFontLoaded: boolean }>;

export interface ItemPreviewVariant {
  readonly material: string;
  readonly itemModel: string;
  readonly model: unknown;
  readonly components: Readonly<Record<string, unknown>>;
  readonly tooltipStyle?: string;
  readonly oversizedInGui?: boolean;
}

export interface InlineImageGlyph {
  readonly token: string;
  readonly id: string;
  readonly row: number;
  readonly column: number;
  readonly source: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  readonly advance: number;
  readonly missing: boolean;
}

export interface VanillaGlyph {
  readonly codepoint: number;
  readonly ascent: number;
  readonly advance: number;
  readonly boldOffset: number;
  readonly shadowOffset: number;
  readonly width: number;
  readonly height: number;
  readonly oversample: number;
  readonly rows: readonly string[];
}

export interface ItemPreviewPayload {
  readonly kind: "item";
  readonly id: string;
  readonly pack: string;
  readonly server: ItemPreviewVariant;
  readonly client: ItemPreviewVariant;
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
  readonly tooltipStyles: Readonly<Record<string, unknown>>;
  readonly equipmentAssets: Readonly<Record<string, unknown>>;
  readonly equipmentTextures: Readonly<Record<string, string>>;
  readonly equipmentSelection?: UnknownRecord;
  readonly sceneReferences: Readonly<Record<string, unknown>>;
  readonly defaultDisplayContext: string;
  readonly launchOptions?: Readonly<{
    initialVariant?: "server" | "client";
    allowedVariants?: readonly ("server" | "client")[];
    initialContext?: string;
    allowedContexts?: readonly string[];
    label?: string;
  }>;
  readonly variables: readonly string[];
  readonly displayContexts: readonly string[];
}

export type ItemInboundMessage =
  | Readonly<{ type: "preview"; payload: ItemPreviewPayload }>
  | Readonly<{
      type: "fontGlyphs";
      glyphs: Readonly<Record<string, VanillaGlyph>>;
    }>;

export type ItemOutboundMessage =
  | Readonly<{ type: "ready" }>
  | Readonly<{ type: "gpu-error" | "error"; detail: string }>
  | Readonly<{ type: "rendered"; id: string }>
  | Readonly<{ type: "glyphs"; codepoints: readonly number[] }>;

export type Vector3Tuple = readonly [number, number, number];
export type FurnitureRotationRule =
  "any" | "four" | "eight" | "sixteen" | "north" | "east" | "west" | "south";

export interface FurniturePreviewElement extends UnknownRecord {
  readonly id: string;
  readonly type: string;
  readonly position: Vector3Tuple;
  readonly scale: Vector3Tuple;
  readonly translation: Vector3Tuple;
  readonly pitch: number;
  readonly yaw: number;
  readonly external: boolean;
  readonly conditional: boolean;
}

export interface FurniturePreviewHitbox extends UnknownRecord {
  readonly id: string;
  readonly parentId: string;
  readonly type: string;
  readonly part: "physical" | "interaction" | "entity" | "unknown";
  readonly position: Vector3Tuple;
  readonly size?: Vector3Tuple;
  readonly color: string;
  readonly dashed: boolean;
  readonly source: string;
  readonly flags: Readonly<{
    blocksBuilding: boolean;
    projectile: boolean;
    interactive: boolean;
    canUseItemOn: boolean;
  }>;
  readonly unknownDimensions?: boolean;
  readonly entityType?: string;
}

export interface FurnitureHitboxDefinition extends UnknownRecord {
  readonly type: string;
  readonly path: string;
  readonly raw: UnknownRecord;
  readonly position: Vector3Tuple;
  readonly sourceLabel: string;
  readonly behaviorGenerated: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
  readonly entityType?: string;
  readonly blocksBuilding: boolean;
  readonly canUseItemOn: boolean;
  readonly canBeHitByProjectile: boolean;
  readonly interactive: boolean;
}

export interface FurniturePreviewSeat extends UnknownRecord {
  readonly id: string;
  readonly position: Vector3Tuple;
  readonly mountPosition: Vector3Tuple;
  readonly carrierPosition: Vector3Tuple;
  readonly yaw: number;
  readonly limitedRotation: boolean;
  readonly carrier: "item_display" | "small_armor_stand";
  readonly carrierOffset: number;
  readonly source: string;
}

export interface FurniturePreviewVariant extends UnknownRecord {
  readonly name: string;
  readonly rotationRule: FurnitureRotationRule;
  readonly elements: readonly FurniturePreviewElement[];
  readonly hitboxes: readonly FurniturePreviewHitbox[];
  readonly hitboxDefinitions: readonly FurnitureHitboxDefinition[];
  readonly seats: readonly FurniturePreviewSeat[];
  readonly lights: readonly (UnknownRecord &
    Readonly<{ position: Vector3Tuple }>)[];
  readonly displayItems: readonly (UnknownRecord &
    Readonly<{ position: Vector3Tuple }>)[];
}

export interface FurniturePreviewPayload {
  readonly kind: "furniture";
  readonly id: string;
  readonly pack: string;
  readonly source: string;
  readonly sourceOffset: number;
  readonly locator: Readonly<{
    id: string;
    root: string;
    source: string;
    offset: number;
  }>;
  readonly inline: boolean;
  readonly variants: readonly FurniturePreviewVariant[];
  readonly itemIcons: Record<string, string>;
  readonly itemModels: Record<string, UnknownRecord>;
  readonly issues: readonly string[];
  readonly player: UnknownRecord;
}

export type FurnitureInboundMessage =
  | Readonly<{ type: "preview"; payload: FurniturePreviewPayload }>
  | Readonly<{ type: "item-icon"; id: string; uri: string }>
  | Readonly<{ type: "item-model"; id: string; model: UnknownRecord }>;

export type FurnitureOutboundMessage =
  | Readonly<{ type: "ready" }>
  | Readonly<{ type: "gpu-error"; detail: string }>
  | Readonly<{ type: "item-icon" | "item-model"; id: string }>
  | Readonly<{ type: "state"; variant?: string; seat: string }>
  | Readonly<{
      type: "rendered";
      id: string;
      modelCount: number;
      meshCount: number;
      labelsVisible: boolean;
    }>;

export type SoundInboundMessage =
  | Readonly<{ type: "cache-state"; id: string; label: string }>
  | Readonly<{ type: "error"; message: string }>
  | Readonly<{
      type: "play";
      id: string;
      oggBase64: string;
      volume: number;
      pitch: number;
    }>;

export type SoundOutboundMessage =
  | Readonly<{ type: "ready" | "play" | "stop" }>
  | Readonly<{ type: "select-target" | "play-file"; index: number }>
  | Readonly<{ type: "loading" | "ended"; id: string }>
  | Readonly<{ type: "decoded"; id: string; state: AudioContextState }>
  | Readonly<{ type: "playback-error"; message: string }>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    isUnknownArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isRecordOf<Value>(
  value: unknown,
  isValue: (entry: unknown) => entry is Value,
): value is Record<string, Value> {
  return isRecord(value) && Object.values(value).every(isValue);
}

function isImagePreviewPayload(value: unknown): value is ImagePreviewPayload {
  if (!isRecord(value) || !isRecord(value.vanilla)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.pack === "string" &&
    typeof value.source === "string" &&
    isFiniteNumber(value.sourceOffset) &&
    typeof value.texturePath === "string" &&
    typeof value.textureUrl === "string" &&
    isFiniteNumber(value.textureWidth) &&
    isFiniteNumber(value.textureHeight) &&
    isFiniteNumber(value.rows) &&
    isFiniteNumber(value.columns) &&
    isFiniteNumber(value.row) &&
    isFiniteNumber(value.column) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.ascent) &&
    typeof value.font === "string" &&
    typeof value.canSaveConfiguration === "boolean" &&
    typeof value.saveUnavailableReason === "string" &&
    isFiniteNumber(value.defaultZoom) &&
    isFiniteNumber(value.defaultReservedLines) &&
    typeof value.vanilla.generic54 === "string" &&
    typeof value.vanilla.anvil === "string" &&
    typeof value.vanilla.textField === "string"
  );
}

function isItemVariant(value: unknown): value is ItemPreviewVariant {
  return (
    isRecord(value) &&
    typeof value.material === "string" &&
    typeof value.itemModel === "string" &&
    isRecord(value.components) &&
    (value.tooltipStyle === undefined ||
      typeof value.tooltipStyle === "string") &&
    (value.oversizedInGui === undefined ||
      typeof value.oversizedInGui === "boolean")
  );
}

function isInlineImageGlyph(value: unknown): value is InlineImageGlyph {
  return (
    isRecord(value) &&
    typeof value.token === "string" &&
    typeof value.id === "string" &&
    isFiniteNumber(value.row) &&
    isFiniteNumber(value.column) &&
    typeof value.source === "string" &&
    isFiniteNumber(value.sourceWidth) &&
    isFiniteNumber(value.sourceHeight) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.ascent) &&
    isFiniteNumber(value.advance) &&
    typeof value.missing === "boolean"
  );
}

function isVanillaGlyph(value: unknown): value is VanillaGlyph {
  return (
    isRecord(value) &&
    isFiniteNumber(value.codepoint) &&
    isFiniteNumber(value.ascent) &&
    isFiniteNumber(value.advance) &&
    isFiniteNumber(value.boldOffset) &&
    isFiniteNumber(value.shadowOffset) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.oversample) &&
    isStringArray(value.rows)
  );
}

function isItemPreviewPayload(value: unknown): value is ItemPreviewPayload {
  return (
    isRecord(value) &&
    value.kind === "item" &&
    typeof value.id === "string" &&
    typeof value.pack === "string" &&
    isItemVariant(value.server) &&
    isItemVariant(value.client) &&
    isRecord(value.models) &&
    isStringRecord(value.textures) &&
    isRecord(value.textureMetadata) &&
    (value.inventoryTexture === undefined ||
      typeof value.inventoryTexture === "string") &&
    typeof value.missingTexture === "string" &&
    typeof value.missingModel === "boolean" &&
    isStringArray(value.issues) &&
    isStringRecord(value.translations) &&
    isRecord(value.jukeboxSongs) &&
    isRecordOf(value.inlineImages, isInlineImageGlyph) &&
    isRecord(value.tooltipStyles) &&
    isRecord(value.equipmentAssets) &&
    isStringRecord(value.equipmentTextures) &&
    (value.equipmentSelection === undefined ||
      isRecord(value.equipmentSelection)) &&
    isRecord(value.sceneReferences) &&
    typeof value.defaultDisplayContext === "string" &&
    (value.launchOptions === undefined ||
      (isRecord(value.launchOptions) &&
        (value.launchOptions.initialVariant === undefined ||
          value.launchOptions.initialVariant === "server" ||
          value.launchOptions.initialVariant === "client") &&
        (value.launchOptions.allowedVariants === undefined ||
          (isUnknownArray(value.launchOptions.allowedVariants) &&
            value.launchOptions.allowedVariants.every(
              (entry) => entry === "server" || entry === "client",
            ))) &&
        (value.launchOptions.initialContext === undefined ||
          typeof value.launchOptions.initialContext === "string") &&
        (value.launchOptions.allowedContexts === undefined ||
          isStringArray(value.launchOptions.allowedContexts)) &&
        (value.launchOptions.label === undefined ||
          typeof value.launchOptions.label === "string"))) &&
    isStringArray(value.variables) &&
    isStringArray(value.displayContexts)
  );
}

function isVector(value: unknown): value is Vector3Tuple {
  return (
    isUnknownArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isFurnitureElement(value: unknown): value is FurniturePreviewElement {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isVector(value.position) &&
    isVector(value.scale) &&
    isVector(value.translation) &&
    isFiniteNumber(value.pitch) &&
    isFiniteNumber(value.yaw) &&
    typeof value.external === "boolean" &&
    typeof value.conditional === "boolean"
  );
}

function isFurnitureHitbox(value: unknown): value is FurniturePreviewHitbox {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.parentId === "string" &&
    typeof value.type === "string" &&
    (value.part === "physical" ||
      value.part === "interaction" ||
      value.part === "entity" ||
      value.part === "unknown") &&
    isVector(value.position) &&
    (value.size === undefined || isVector(value.size)) &&
    typeof value.color === "string" &&
    typeof value.dashed === "boolean" &&
    typeof value.source === "string" &&
    isRecord(value.flags) &&
    typeof value.flags.blocksBuilding === "boolean" &&
    typeof value.flags.projectile === "boolean" &&
    typeof value.flags.interactive === "boolean" &&
    typeof value.flags.canUseItemOn === "boolean" &&
    (value.unknownDimensions === undefined ||
      typeof value.unknownDimensions === "boolean") &&
    (value.entityType === undefined || typeof value.entityType === "string")
  );
}

function isFurnitureHitboxDefinition(
  value: unknown,
): value is FurnitureHitboxDefinition {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.path === "string" &&
    isRecord(value.raw) &&
    isVector(value.position) &&
    typeof value.sourceLabel === "string" &&
    typeof value.behaviorGenerated === "boolean" &&
    typeof value.blocksBuilding === "boolean" &&
    typeof value.canUseItemOn === "boolean" &&
    typeof value.canBeHitByProjectile === "boolean" &&
    typeof value.interactive === "boolean" &&
    (value.width === undefined || isFiniteNumber(value.width)) &&
    (value.height === undefined || isFiniteNumber(value.height)) &&
    (value.scale === undefined || isFiniteNumber(value.scale)) &&
    (value.entityType === undefined || typeof value.entityType === "string")
  );
}

function isFurnitureSeat(value: unknown): value is FurniturePreviewSeat {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isVector(value.position) &&
    isVector(value.mountPosition) &&
    isVector(value.carrierPosition) &&
    isFiniteNumber(value.yaw) &&
    typeof value.limitedRotation === "boolean" &&
    (value.carrier === "item_display" ||
      value.carrier === "small_armor_stand") &&
    isFiniteNumber(value.carrierOffset) &&
    typeof value.source === "string"
  );
}

function isFurnitureVariant(value: unknown): value is FurniturePreviewVariant {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.rotationRule === "any" ||
      value.rotationRule === "four" ||
      value.rotationRule === "eight" ||
      value.rotationRule === "sixteen" ||
      value.rotationRule === "north" ||
      value.rotationRule === "east" ||
      value.rotationRule === "west" ||
      value.rotationRule === "south") &&
    isUnknownArray(value.elements) &&
    value.elements.every(isFurnitureElement) &&
    isUnknownArray(value.hitboxes) &&
    value.hitboxes.every(isFurnitureHitbox) &&
    isUnknownArray(value.seats) &&
    value.seats.every(isFurnitureSeat) &&
    isUnknownArray(value.hitboxDefinitions) &&
    value.hitboxDefinitions.every(isFurnitureHitboxDefinition) &&
    isUnknownArray(value.lights) &&
    value.lights.every(
      (entry) => isRecord(entry) && isVector(entry.position),
    ) &&
    isUnknownArray(value.displayItems) &&
    value.displayItems.every(
      (entry) => isRecord(entry) && isVector(entry.position),
    )
  );
}

function isFurniturePreviewPayload(
  value: unknown,
): value is FurniturePreviewPayload {
  return (
    isRecord(value) &&
    value.kind === "furniture" &&
    typeof value.id === "string" &&
    typeof value.pack === "string" &&
    typeof value.source === "string" &&
    isFiniteNumber(value.sourceOffset) &&
    isRecord(value.locator) &&
    typeof value.locator.id === "string" &&
    typeof value.locator.root === "string" &&
    typeof value.locator.source === "string" &&
    isFiniteNumber(value.locator.offset) &&
    typeof value.inline === "boolean" &&
    isUnknownArray(value.variants) &&
    value.variants.every(isFurnitureVariant) &&
    isStringRecord(value.itemIcons) &&
    isRecordOf(value.itemModels, isRecord) &&
    isStringArray(value.issues) &&
    isRecord(value.player)
  );
}

export function decodeImageInboundMessage(
  value: unknown,
): ImageInboundMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "preview":
      return isImagePreviewPayload(value.payload)
        ? { type: "preview", payload: value.payload }
        : undefined;
    case "saveResult":
      return typeof value.ok === "boolean" &&
        isFiniteNumber(value.height) &&
        isFiniteNumber(value.ascent)
        ? {
            type: "saveResult",
            ok: value.ok,
            height: value.height,
            ascent: value.ascent,
            ...(typeof value.message === "string"
              ? { message: value.message }
              : {}),
          }
        : undefined;
    default:
      return undefined;
  }
}

export function decodeItemInboundMessage(
  value: unknown,
): ItemInboundMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "preview":
      return isItemPreviewPayload(value.payload)
        ? { type: "preview", payload: value.payload }
        : undefined;
    case "fontGlyphs":
      return isRecordOf(value.glyphs, isVanillaGlyph)
        ? {
            type: "fontGlyphs",
            glyphs: value.glyphs,
          }
        : undefined;
    default:
      return undefined;
  }
}

export function decodeFurnitureInboundMessage(
  value: unknown,
): FurnitureInboundMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "preview":
      return isFurniturePreviewPayload(value.payload)
        ? { type: "preview", payload: value.payload }
        : undefined;
    case "item-icon":
      return typeof value.id === "string" && typeof value.uri === "string"
        ? { type: "item-icon", id: value.id, uri: value.uri }
        : undefined;
    case "item-model":
      return typeof value.id === "string" && isRecord(value.model)
        ? { type: "item-model", id: value.id, model: value.model }
        : undefined;
    default:
      return undefined;
  }
}

export function decodeSoundInboundMessage(
  value: unknown,
): SoundInboundMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "cache-state":
      return typeof value.id === "string" && typeof value.label === "string"
        ? { type: "cache-state", id: value.id, label: value.label }
        : undefined;
    case "error":
      return typeof value.message === "string"
        ? { type: "error", message: value.message }
        : undefined;
    case "play":
      return typeof value.id === "string" &&
        typeof value.oggBase64 === "string" &&
        isFiniteNumber(value.volume) &&
        isFiniteNumber(value.pitch)
        ? {
            type: "play",
            id: value.id,
            oggBase64: value.oggBase64,
            volume: value.volume,
            pitch: value.pitch,
          }
        : undefined;
    default:
      return undefined;
  }
}
