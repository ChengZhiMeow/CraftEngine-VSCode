import {
  Component as RuntimeComponent,
  JsonComponentSerializer as RuntimeJsonComponentSerializer,
  MiniMessage as RuntimeMiniMessage,
  Tag as RuntimeTag,
  TagResolver as RuntimeTagResolver,
} from "minimessage-js/dist/minimessage.esm.js";
import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray, stringValue } from "../shared/runtime.js";

type UnknownRecord = Readonly<Record<string, unknown>>;
type MiniMessageTagResolver = Readonly<Record<string, unknown>>;
type TranslationResolver =
  Readonly<Record<string, string>> | ((key: string) => string | undefined);

export interface TooltipDescriptor {
  readonly id?: string;
  readonly blank?: boolean;
  readonly text?: string;
  readonly value?: unknown;
  readonly color?: string;
}

export interface TooltipShiftPart {
  readonly text?: string;
  readonly shift?: number;
}

export interface TooltipTextStyle {
  readonly color?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underlined?: boolean;
  readonly strikethrough?: boolean;
  readonly obfuscated?: boolean;
}

type MutableTooltipTextStyle = {
  -readonly [Key in keyof TooltipTextStyle]: TooltipTextStyle[Key];
};

export interface TooltipTextRun {
  readonly text?: string;
  readonly shift?: number;
  readonly style: TooltipTextStyle;
}

export interface TooltipGlyph {
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  readonly advance: number;
  readonly boldOffset?: number;
  readonly shadowOffset?: number;
  readonly oversample: number;
  readonly rows: readonly string[];
}

export interface TooltipLayout {
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly outerWidth: number;
  readonly outerHeight: number;
  readonly textX: number;
  readonly textY: number;
  readonly lineY: readonly number[];
}

export interface NineSliceRegion {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
  readonly inner: boolean;
}

interface ShiftArgumentQueue {
  popOr(message: string): Readonly<{ value(): string }>;
}

interface ShiftContext {
  newException(message: string, arguments_: ShiftArgumentQueue): Error;
}

interface ComponentRuntime {
  text(value: string): unknown;
}

interface ComponentDeserializer {
  deserialize(value: unknown, ...resolvers: MiniMessageTagResolver[]): unknown;
}

interface JsonComponentSerializerRuntime {
  json(): ComponentDeserializer;
}

interface MiniMessageRuntime {
  miniMessage(): ComponentDeserializer;
}

interface TagRuntime {
  selfClosingInserting(content: unknown): unknown;
}

interface TagResolverRuntime {
  dynamic(
    name: string,
    handler: (arguments_: ShiftArgumentQueue, context: ShiftContext) => unknown,
  ): MiniMessageTagResolver;
}

const Component = RuntimeComponent as unknown as ComponentRuntime;
const JsonComponentSerializer =
  RuntimeJsonComponentSerializer as unknown as JsonComponentSerializerRuntime;
const MiniMessage = RuntimeMiniMessage as unknown as MiniMessageRuntime;
const Tag = RuntimeTag as unknown as TagRuntime;
const TagResolver = RuntimeTagResolver as unknown as TagResolverRuntime;

function callMethod(value: UnknownRecord, name: string): unknown {
  const method = value[name];
  if (typeof method !== "function") return undefined;
  try {
    return (method as (this: UnknownRecord) => unknown).call(value);
  } catch {
    return undefined;
  }
}

function tooltipDecoration(
  value: string,
): value is keyof Pick<
  TooltipTextStyle,
  "bold" | "italic" | "underlined" | "strikethrough" | "obfuscated"
> {
  return (
    value === "bold" ||
    value === "italic" ||
    value === "underlined" ||
    value === "strikethrough" ||
    value === "obfuscated"
  );
}

const TOOLTIP_INSET = 12;
const TOOLTIP_OUTER_PADDING = 24;
const TOOLTIP_LINE_HEIGHT = 10;
const SLOT_ORDER = [
  "any",
  "mainhand",
  "offhand",
  "hand",
  "feet",
  "legs",
  "chest",
  "head",
  "armor",
  "body",
  "saddle",
];
const ENCHANTMENT_ORDER = [
  "minecraft:binding_curse",
  "minecraft:vanishing_curse",
  "minecraft:riptide",
  "minecraft:channeling",
  "minecraft:wind_burst",
  "minecraft:frost_walker",
  "minecraft:lunge",
  "minecraft:sharpness",
  "minecraft:smite",
  "minecraft:bane_of_arthropods",
  "minecraft:impaling",
  "minecraft:power",
  "minecraft:density",
  "minecraft:breach",
  "minecraft:piercing",
  "minecraft:sweeping_edge",
  "minecraft:multishot",
  "minecraft:fire_aspect",
  "minecraft:flame",
  "minecraft:knockback",
  "minecraft:punch",
  "minecraft:protection",
  "minecraft:blast_protection",
  "minecraft:fire_protection",
  "minecraft:projectile_protection",
  "minecraft:feather_falling",
  "minecraft:fortune",
  "minecraft:looting",
  "minecraft:silk_touch",
  "minecraft:luck_of_the_sea",
  "minecraft:efficiency",
  "minecraft:quick_charge",
  "minecraft:lure",
  "minecraft:respiration",
  "minecraft:aqua_affinity",
  "minecraft:soul_speed",
  "minecraft:swift_sneak",
  "minecraft:depth_strider",
  "minecraft:thorns",
  "minecraft:loyalty",
  "minecraft:unbreaking",
  "minecraft:infinity",
  "minecraft:mending",
];
const ENCHANTMENT_ORDER_INDEX = new Map(
  ENCHANTMENT_ORDER.map((id, index) => [id, index]),
);
const SINGLE_LEVEL_ENCHANTMENTS = new Set([
  "minecraft:aqua_affinity",
  "minecraft:binding_curse",
  "minecraft:channeling",
  "minecraft:flame",
  "minecraft:infinity",
  "minecraft:mending",
  "minecraft:multishot",
  "minecraft:silk_touch",
  "minecraft:vanishing_curse",
]);
const CURSE_ENCHANTMENTS = new Set([
  "minecraft:binding_curse",
  "minecraft:vanishing_curse",
]);
const NEUTRAL_ATTRIBUTES = new Set([
  "gravity",
  "scale",
  "waypoint_transmit_range",
  "waypoint_receive_range",
]);
const NEGATIVE_ATTRIBUTES = new Set(["burning_time", "fall_damage_multiplier"]);
const SHIFT_MARKER_START = "\ufdd0";
const SHIFT_MARKER_END = "\ufdd1";
const SHIFT_MARKER_PATTERN = /\ufdd0([+-]?\d+)\ufdd1/gu;

const imageCache = new Map<string, HTMLImageElement>();

export function tooltipGlyphBoldOffset(glyph: TooltipGlyph): number {
  const offset = Number(glyph.boldOffset);
  return Number.isFinite(offset) ? offset : 1;
}

export function tooltipGlyphShadowOffset(glyph: TooltipGlyph): number {
  const offset = Number(glyph.shadowOffset);
  return Number.isFinite(offset) ? offset : 1;
}

export function tooltipGlyphAdvance(
  glyph: TooltipGlyph,
  bold: boolean,
): number {
  return Number(glyph?.advance) + (bold ? tooltipGlyphBoldOffset(glyph) : 0);
}

export function drawTooltipGlyph(
  context: Pick<
    CanvasRenderingContext2D,
    "fillStyle" | "fillRect" | "restore" | "save" | "transform"
  >,
  glyph: TooltipGlyph,
  x: number,
  y: number,
  color: string,
  style: TooltipTextStyle,
  pixelScale = 2,
): void {
  const sourceScale = pixelScale / glyph.oversample;
  context.fillStyle = color;
  const italic = style.italic === true;
  if (italic) {
    const glyphTop = 7 - glyph.ascent;
    const italicTopOffset = 1 - glyphTop * 0.25;
    context.save();
    context.transform(
      1,
      0,
      -0.25,
      1,
      (italicTopOffset + y * 0.25) * pixelScale,
      0,
    );
  }
  try {
    for (let sourceY = 0; sourceY < glyph.height; sourceY += 1) {
      const bits = BigInt(`0x${glyph.rows[sourceY] || "0"}`);
      const logicalY = sourceY / glyph.oversample;
      for (let sourceX = 0; sourceX < glyph.width; sourceX += 1) {
        if ((bits & (1n << BigInt(glyph.width - sourceX - 1))) === 0n) continue;
        context.fillRect(
          (x + sourceX / glyph.oversample) * pixelScale,
          (y + logicalY) * pixelScale,
          sourceScale,
          sourceScale,
        );
        if (style.bold) {
          context.fillRect(
            (x + sourceX / glyph.oversample + tooltipGlyphBoldOffset(glyph)) *
              pixelScale,
            (y + logicalY) * pixelScale,
            sourceScale,
            sourceScale,
          );
        }
      }
    }
  } finally {
    if (italic) context.restore();
  }
}

export function tooltipShiftMarker(value: number): string {
  const amount = Number(value);
  if (
    !Number.isInteger(amount) ||
    amount < -2_147_483_648 ||
    amount > 2_147_483_647 ||
    amount === 0
  )
    return "";
  return `${SHIFT_MARKER_START}${amount}${SHIFT_MARKER_END}`;
}

export const tooltipShiftTagResolver: MiniMessageTagResolver =
  TagResolver.dynamic("shift", (arguments_, context) => {
    const raw = arguments_
      .popOr(Messages.web.item.tooltip_renderer.text0001)
      .value();
    if (!/^[+-]?\d+$/u.test(raw))
      throw context.newException(
        Messages.web.item.tooltip_renderer.text0002,
        arguments_,
      );
    const amount = Number(raw);
    if (
      !Number.isSafeInteger(amount) ||
      amount < -2_147_483_648 ||
      amount > 2_147_483_647
    ) {
      throw context.newException(
        Messages.web.item.tooltip_renderer.text0003,
        arguments_,
      );
    }
    return Tag.selfClosingInserting(Component.text(tooltipShiftMarker(amount)));
  });

export function splitTooltipShifts(value: string): TooltipShiftPart[] {
  const text = String(value ?? "");
  const result: TooltipShiftPart[] = [];
  let cursor = 0;
  SHIFT_MARKER_PATTERN.lastIndex = 0;
  for (
    let match = SHIFT_MARKER_PATTERN.exec(text);
    match;
    match = SHIFT_MARKER_PATTERN.exec(text)
  ) {
    if (match.index > cursor)
      result.push({ text: text.slice(cursor, match.index) });
    result.push({ shift: Number(match[1]) });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) });
  return result;
}

function translated(
  resolver: TranslationResolver | undefined,
  key: string,
): string | undefined {
  if (typeof resolver === "function") return resolver(key);
  return resolver?.[key];
}

function tooltipComponentText(
  component: unknown,
  translations: TranslationResolver | undefined,
): string {
  if (!isRecord(component)) return "";
  if (component.type === "text") {
    const content = callMethod(component, "content");
    return typeof content === "string" || typeof content === "number"
      ? String(content)
      : "";
  }
  if (component.type === "translatable") {
    const key = callMethod(component, "key");
    if (typeof key !== "string") return "";
    const fallback = callMethod(component, "fallback");
    const translatedText = translated(translations, key);
    const text =
      translatedText || (typeof fallback === "string" && fallback) || key;
    const rawArguments = callMethod(component, "arguments");
    const args: readonly unknown[] = isUnknownArray(rawArguments)
      ? rawArguments
      : [];
    let index = 0;
    return text.replace(
      /%(?:(\d+)\$)?s/gu,
      (_match: string, explicit: string | undefined) => {
        const selected = explicit ? Number(explicit) - 1 : index++;
        const argument = args[selected];
        return typeof argument === "string" || typeof argument === "number"
          ? String(argument)
          : tooltipComponentRuns(argument, {}, translations)
              .map((run) => run.text ?? "")
              .join("");
      },
    );
  }
  if (component.type === "keybind") {
    const keybind = callMethod(component, "keybind");
    return typeof keybind === "string" ? keybind : "";
  }
  if (component.type === "score") {
    const score = callMethod(component, "value");
    return typeof score === "string" || typeof score === "number"
      ? String(score)
      : "";
  }
  if (component.type !== "selector") return "";
  const pattern = callMethod(component, "pattern");
  return typeof pattern === "string" ? pattern : "";
}

function tooltipComponentRuns(
  component: unknown,
  inherited: TooltipTextStyle,
  translations: TranslationResolver | undefined,
  result: TooltipTextRun[] = [],
): TooltipTextRun[] {
  if (!isRecord(component)) return result;
  const style: MutableTooltipTextStyle = { ...inherited };
  const color = callMethod(component, "color");
  if (isRecord(color)) {
    const hex = callMethod(color, "asHexString");
    if (typeof hex === "string") style.color = hex;
  }
  const rawDecorations = callMethod(component, "decorations");
  const decorations = isRecord(rawDecorations) ? rawDecorations : {};
  for (const [key, value] of Object.entries(decorations)) {
    if (!tooltipDecoration(key)) continue;
    if (value === "true") style[key] = true;
    else if (value === "false") style[key] = false;
  }
  const text = tooltipComponentText(component, translations);
  if (text) {
    for (const part of splitTooltipShifts(text)) {
      if (part.text) result.push({ text: part.text, style });
      else if (part.shift !== undefined && Number.isInteger(part.shift))
        result.push({ shift: part.shift, style });
    }
  }
  const children = callMethod(component, "children");
  if (isUnknownArray(children))
    for (const child of children)
      tooltipComponentRuns(child, style, translations, result);
  return result;
}

export function tooltipTextRuns(
  value: unknown,
  inherited: TooltipTextStyle = {},
  translations?: TranslationResolver,
): TooltipTextRun[] | undefined {
  try {
    const component: unknown =
      typeof value === "string"
        ? MiniMessage.miniMessage().deserialize(
            value.includes("<") ? value : value.replaceAll("<", "\\<"),
            tooltipShiftTagResolver,
          )
        : JsonComponentSerializer.json().deserialize(value);
    return tooltipComponentRuns(component, inherited, translations);
  } catch {
    return undefined;
  }
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(2)));
}

function operationId(value: unknown): number {
  const operation = stringValue(value, "add_value")
    .replace(/^minecraft:/u, "")
    .toLowerCase();
  if (
    ["add_multiplied_base", "add_scalar", "multiply_base"].includes(operation)
  )
    return 1;
  if (
    ["add_multiplied_total", "multiply_scalar_1", "multiply_total"].includes(
      operation,
    )
  )
    return 2;
  return 0;
}

function attributePath(value: unknown): string {
  const id = stringValue(value);
  const separator = id.indexOf(":");
  return separator < 0 ? id : id.slice(separator + 1);
}

function attributeName(id: unknown, resolver: TranslationResolver): string {
  const full = stringValue(id);
  const separator = full.indexOf(":");
  const namespace = separator < 0 ? "minecraft" : full.slice(0, separator);
  const path = attributePath(full);
  const candidates =
    namespace === "minecraft"
      ? [
          `attribute.name.${path}`,
          `attribute.name.generic.${path}`,
          `attribute.name.player.${path}`,
          `attribute.name.horse.${path}`,
          `attribute.name.zombie.${path}`,
        ]
      : [`attribute.name.${namespace}.${path}`, `attribute.name.${path}`];
  for (const key of candidates) {
    const value = translated(resolver, key);
    if (typeof value === "string" && value.length > 0) return value;
  }
  return path.replaceAll("_", " ");
}

function formatTemplate(
  template: string,
  ...values: readonly unknown[]
): string {
  let index = 0;
  return template.replace(
    /%(?:(\d+)\$)?s|%%/gu,
    (token: string, explicit: string | undefined) => {
      if (token === "%%") return "%";
      const selected = explicit ? Number(explicit) - 1 : index++;
      const value = values[selected];
      return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
        ? String(value)
        : "";
    },
  );
}

function displayType(value: unknown): string {
  if (typeof value === "string") return value.replace(/^minecraft:/u, "");
  if (isRecord(value) && typeof value.type === "string")
    return value.type.replace(/^minecraft:/u, "");
  return "default";
}

function attributeColor(path: string, positive: boolean): string {
  if (NEUTRAL_ATTRIBUTES.has(path)) return "#aaaaaa";
  const beneficial = NEGATIVE_ATTRIBUTES.has(path) ? !positive : positive;
  return beneficial ? "#5555ff" : "#ff5555";
}

function normalizedId(value: unknown): string {
  const text = stringValue(value).toLowerCase();
  return text.includes(":") ? text : `minecraft:${text}`;
}

function romanNumeral(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const pairs: readonly (readonly [symbol: string, amount: number])[] = [
    ["M", 1000],
    ["CM", 900],
    ["D", 500],
    ["CD", 400],
    ["C", 100],
    ["XC", 90],
    ["L", 50],
    ["XL", 40],
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1],
  ];
  let remaining = Math.floor(value);
  let result = "";
  for (const [symbol, amount] of pairs)
    while (remaining >= amount) {
      result += symbol;
      remaining -= amount;
    }
  return result;
}

function enchantmentLevels(value: unknown): UnknownRecord {
  if (!isRecord(value)) return {};
  const levels = value.levels;
  return isRecord(levels) ? levels : value;
}

export function enchantmentTooltipDescriptors(
  value: unknown,
  translations: TranslationResolver,
): TooltipDescriptor[] {
  const entries = Object.entries(enchantmentLevels(value))
    .map(([rawId, rawLevel], sourceIndex) => ({
      id: normalizedId(rawId),
      level: Number(rawLevel),
      sourceIndex,
    }))
    .filter((entry) => Number.isFinite(entry.level) && entry.level > 0)
    .sort((left, right) => {
      const leftIndex = ENCHANTMENT_ORDER_INDEX.get(left.id);
      const rightIndex = ENCHANTMENT_ORDER_INDEX.get(right.id);
      if (leftIndex !== undefined && rightIndex !== undefined)
        return leftIndex - rightIndex;
      if (leftIndex !== undefined) return -1;
      if (rightIndex !== undefined) return 1;
      return left.sourceIndex - right.sourceIndex;
    });
  return entries.map(({ id, level }) => {
    const [namespace, path] = id.split(":", 2);
    const name =
      translated(translations, `enchantment.${namespace}.${path}`) || id;
    const levelText =
      level === 1 && SINGLE_LEVEL_ENCHANTMENTS.has(id)
        ? ""
        : translated(translations, `enchantment.level.${level}`) ||
          romanNumeral(level);
    return {
      id,
      text: `${name}${levelText ? ` ${levelText}` : ""}`,
      color: CURSE_ENCHANTMENTS.has(id) ? "#ff5555" : "#aaaaaa",
    };
  });
}

export function tooltipDisplayHidden(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.hide_tooltip === true || value.hideTooltip === true)
  );
}

export function tooltipDisplayShows(
  value: unknown,
  componentId: string,
): boolean {
  if (!isRecord(value)) return true;
  const hidden = value.hidden_components ?? value.hiddenComponents;
  const values = isUnknownArray(hidden)
    ? hidden
    : typeof hidden === "string"
      ? [hidden]
      : [];
  const wanted = normalizedId(componentId);
  return !values.some((entry) => normalizedId(entry) === wanted);
}

export function jukeboxTooltipDescription(
  value: unknown,
  customSongs: Readonly<Record<string, unknown>> = {},
): unknown {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const id = normalizedId(value);
  const [namespace, song] = id.split(":", 2);
  return customSongs[id] ?? { translate: `jukebox_song.${namespace}.${song}` };
}

export function rarityTooltipColor(value: unknown, enchanted: boolean): string {
  let rarity = stringValue(value, "common")
    .replace(/^minecraft:/u, "")
    .toLowerCase();
  if (enchanted) {
    if (rarity === "common" || rarity === "uncommon") rarity = "rare";
    else if (rarity === "rare") rarity = "epic";
  }
  const colors: Readonly<Record<string, string>> = {
    common: "#ffffff",
    uncommon: "#ffff55",
    rare: "#55ffff",
    epic: "#ff55ff",
  };
  return colors[rarity] ?? "#ffffff";
}

export function attributeTooltipDescriptors(
  entries: readonly unknown[],
  translations: TranslationResolver,
): TooltipDescriptor[] {
  const grouped = new Map<string, UnknownRecord[]>();
  for (const value of entries || []) {
    if (!isRecord(value) || displayType(value.display) === "hidden") continue;
    const slot = stringValue(value.slot, "any").replace(/^minecraft:/u, "");
    const values = grouped.get(slot) || [];
    values.push(value);
    grouped.set(slot, values);
  }
  const result: TooltipDescriptor[] = [];
  for (const slot of SLOT_ORDER) {
    const values = grouped.get(slot) || [];
    const lines: TooltipDescriptor[] = [];
    for (const entry of values) {
      const customDisplay = displayType(entry.display);
      if (
        customDisplay === "override" &&
        isRecord(entry.display) &&
        entry.display.value !== undefined
      ) {
        lines.push({ value: entry.display.value, color: "#ffffff" });
        continue;
      }
      const amount = Number(entry.amount) || 0;
      if (amount === 0) continue;
      const id = stringValue(entry.type, stringValue(entry.attribute));
      const path = attributePath(id);
      const operation = operationId(entry.operation);
      const displayed =
        operation > 0
          ? amount * 100
          : path === "knockback_resistance"
            ? amount * 10
            : amount;
      const sign = amount > 0 ? "plus" : "take";
      const templateKey = `attribute.modifier.${sign}.${operation}`;
      const fallback =
        sign === "plus"
          ? `+%s${operation > 0 ? "%%" : ""} %s`
          : `-%s${operation > 0 ? "%%" : ""} %s`;
      const template = translated(translations, templateKey) || fallback;
      lines.push({
        text: formatTemplate(
          template,
          formatDecimal(Math.abs(displayed)),
          attributeName(id, translations),
        ),
        color: attributeColor(path, amount > 0),
      });
    }
    if (lines.length === 0) continue;
    const headingKey = `item.modifiers.${slot}`;
    result.push(
      { blank: true },
      {
        text: translated(translations, headingKey) || headingKey,
        color: "#aaaaaa",
      },
      ...lines,
    );
  }
  return result;
}

export function tooltipLayout(
  contentWidth: number,
  lineHeights: readonly number[],
): TooltipLayout {
  const heights = lineHeights.length > 0 ? lineHeights : [TOOLTIP_LINE_HEIGHT];
  const contentHeight = heights.reduce(
    (sum, value) => sum + value,
    heights.length === 1 ? -2 : 0,
  );
  const lineY: number[] = [];
  let y = TOOLTIP_INSET;
  heights.forEach((height, index) => {
    lineY.push(y);
    y += height + (index === 0 ? 2 : 0);
  });
  return {
    contentWidth,
    contentHeight,
    outerWidth: contentWidth + TOOLTIP_OUTER_PADDING,
    outerHeight: contentHeight + TOOLTIP_OUTER_PADDING,
    textX: TOOLTIP_INSET,
    textY: TOOLTIP_INSET,
    lineY,
  };
}

export function nineSliceRegions(
  sourceWidth: number,
  sourceHeight: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  width: number,
  height: number,
): NineSliceRegion[] {
  const borderLeft = Math.min(left, Math.floor(width / 2));
  const borderRight = Math.min(right, Math.floor(width / 2));
  const borderTop = Math.min(top, Math.floor(height / 2));
  const borderBottom = Math.min(bottom, Math.floor(height / 2));
  const middleWidth = width - borderLeft - borderRight;
  const middleHeight = height - borderTop - borderBottom;
  const sourceMiddleWidth = sourceWidth - borderLeft - borderRight;
  const sourceMiddleHeight = sourceHeight - borderTop - borderBottom;
  return [
    {
      sx: 0,
      sy: 0,
      sw: borderLeft,
      sh: borderTop,
      dx: 0,
      dy: 0,
      dw: borderLeft,
      dh: borderTop,
      inner: false,
    },
    {
      sx: borderLeft,
      sy: 0,
      sw: sourceMiddleWidth,
      sh: borderTop,
      dx: borderLeft,
      dy: 0,
      dw: middleWidth,
      dh: borderTop,
      inner: true,
    },
    {
      sx: sourceWidth - borderRight,
      sy: 0,
      sw: borderRight,
      sh: borderTop,
      dx: width - borderRight,
      dy: 0,
      dw: borderRight,
      dh: borderTop,
      inner: false,
    },
    {
      sx: 0,
      sy: sourceHeight - borderBottom,
      sw: borderLeft,
      sh: borderBottom,
      dx: 0,
      dy: height - borderBottom,
      dw: borderLeft,
      dh: borderBottom,
      inner: false,
    },
    {
      sx: borderLeft,
      sy: sourceHeight - borderBottom,
      sw: sourceMiddleWidth,
      sh: borderBottom,
      dx: borderLeft,
      dy: height - borderBottom,
      dw: middleWidth,
      dh: borderBottom,
      inner: true,
    },
    {
      sx: sourceWidth - borderRight,
      sy: sourceHeight - borderBottom,
      sw: borderRight,
      sh: borderBottom,
      dx: width - borderRight,
      dy: height - borderBottom,
      dw: borderRight,
      dh: borderBottom,
      inner: false,
    },
    {
      sx: 0,
      sy: borderTop,
      sw: borderLeft,
      sh: sourceMiddleHeight,
      dx: 0,
      dy: borderTop,
      dw: borderLeft,
      dh: middleHeight,
      inner: true,
    },
    {
      sx: borderLeft,
      sy: borderTop,
      sw: sourceMiddleWidth,
      sh: sourceMiddleHeight,
      dx: borderLeft,
      dy: borderTop,
      dw: middleWidth,
      dh: middleHeight,
      inner: true,
    },
    {
      sx: sourceWidth - borderRight,
      sy: borderTop,
      sw: borderRight,
      sh: sourceMiddleHeight,
      dx: width - borderRight,
      dy: borderTop,
      dw: borderRight,
      dh: middleHeight,
      inner: true,
    },
  ].filter(
    (region) =>
      region.sw > 0 && region.sh > 0 && region.dw > 0 && region.dh > 0,
  );
}

function imageFor(
  source: unknown,
  onReady: () => void,
): HTMLImageElement | undefined {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    typeof Image === "undefined"
  )
    return undefined;
  const existing = imageCache.get(source);
  if (existing)
    return existing.complete && existing.naturalWidth > 0
      ? existing
      : undefined;
  const image = new Image();
  image.decoding = "async";
  image.addEventListener("load", onReady, { once: true });
  image.src = source;
  imageCache.set(source, image);
  return image.complete && image.naturalWidth > 0 ? image : undefined;
}

function tileRegion(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  region: NineSliceRegion,
  sourceScaleX: number,
  sourceScaleY: number,
  pixelScale: number,
): void {
  const tileWidth = region.sw;
  const tileHeight = region.sh;
  for (let y = 0; y < region.dh; y += tileHeight)
    for (let x = 0; x < region.dw; x += tileWidth) {
      const drawnWidth = Math.min(tileWidth, region.dw - x);
      const drawnHeight = Math.min(tileHeight, region.dh - y);
      context.drawImage(
        image,
        region.sx * sourceScaleX,
        region.sy * sourceScaleY,
        drawnWidth * sourceScaleX,
        drawnHeight * sourceScaleY,
        (region.dx + x) * pixelScale,
        (region.dy + y) * pixelScale,
        drawnWidth * pixelScale,
        drawnHeight * pixelScale,
      );
    }
}

function drawSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  asset: UnknownRecord,
  width: number,
  height: number,
  pixelScale: number,
): void {
  const scaling = isRecord(asset.scaling) ? asset.scaling : { type: "stretch" };
  if (scaling.type !== "nine_slice") {
    context.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      0,
      0,
      width * pixelScale,
      height * pixelScale,
    );
    return;
  }
  const sourceWidth = Number(scaling.width) || image.naturalWidth;
  const sourceHeight = Number(scaling.height) || image.naturalHeight;
  const border = isRecord(scaling.border) ? scaling.border : {};
  const regions = nineSliceRegions(
    sourceWidth,
    sourceHeight,
    Number(border.left) || 0,
    Number(border.top) || 0,
    Number(border.right) || 0,
    Number(border.bottom) || 0,
    width,
    height,
  );
  const sourceScaleX = image.naturalWidth / sourceWidth;
  const sourceScaleY = image.naturalHeight / sourceHeight;
  for (const region of regions) {
    if (region.inner && !scaling.stretchInner) {
      tileRegion(
        context,
        image,
        region,
        sourceScaleX,
        sourceScaleY,
        pixelScale,
      );
      continue;
    }
    context.drawImage(
      image,
      region.sx * sourceScaleX,
      region.sy * sourceScaleY,
      region.sw * sourceScaleX,
      region.sh * sourceScaleY,
      region.dx * pixelScale,
      region.dy * pixelScale,
      region.dw * pixelScale,
      region.dh * pixelScale,
    );
  }
}

export function drawTooltipStyle(
  context: CanvasRenderingContext2D,
  layout: TooltipLayout,
  style: unknown,
  pixelScale: number,
  onReady: () => void,
): boolean {
  if (!isRecord(style) || !isRecord(style.background) || !isRecord(style.frame))
    return false;
  const background = imageFor(style.background.source, onReady);
  const frame = imageFor(style.frame.source, onReady);
  if (!background || !frame) return false;
  drawSprite(
    context,
    background,
    style.background,
    layout.outerWidth,
    layout.outerHeight,
    pixelScale,
  );
  drawSprite(
    context,
    frame,
    style.frame,
    layout.outerWidth,
    layout.outerHeight,
    pixelScale,
  );
  return true;
}
