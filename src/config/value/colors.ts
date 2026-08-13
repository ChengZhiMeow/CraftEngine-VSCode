import type { ParsedSection, ParsedYamlFile } from "../model.js";
import type { TextRange } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export type CraftEngineColorFormat =
  | "decimal"
  | "rgb-decimal"
  | "hex"
  | "rgb"
  | "argb";

export interface ParsedCraftEngineColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  readonly format: CraftEngineColorFormat;
}

export interface NormalizedColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export interface CraftEngineColorOccurrence extends ParsedCraftEngineColor {
  readonly range: TextRange;
}

function channels(
  argb: number,
  format: CraftEngineColorFormat,
): ParsedCraftEngineColor {
  const value = argb | 0;
  return {
    alpha: value >>> 24,
    red: (value >>> 16) & 0xff,
    green: (value >>> 8) & 0xff,
    blue: value & 0xff,
    format,
  };
}

function hexByte(value: string): number {
  return Number.parseInt(value, 16);
}

export function parseCraftEngineColor(
  value: unknown,
  numericFormat: "decimal" | "rgb-decimal" = "decimal",
): ParsedCraftEngineColor | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numericFormat === "rgb-decimal"
      ? channels((0xff << 24) | (Math.trunc(value) & 0xffffff), numericFormat)
      : channels(Math.trunc(value), numericFormat);
  }
  if (typeof value !== "string") return undefined;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(hex))
      return undefined;
    if (hex.length === 3) {
      const [r = "0", g = "0", b = "0"] = hex;
      return channels(
        (0xff << 24) |
          (hexByte(r + r) << 16) |
          (hexByte(g + g) << 8) |
          hexByte(b + b),
        "hex",
      );
    }
    if (hex.length === 4) {
      const [a = "0", r = "0", g = "0", b = "0"] = hex;
      return channels(
        (hexByte(a + a) << 24) |
          (hexByte(r + r) << 16) |
          (hexByte(g + g) << 8) |
          hexByte(b + b),
        "hex",
      );
    }
    if (hex.length === 6) return channels((0xff << 24) | hexByte(hex), "hex");
    return channels(hexByte(hex.slice(0, 8)), "hex");
  }
  const parts = value.split(",", 4);
  if (
    (parts.length !== 3 && parts.length !== 4) ||
    parts.some((part) => !/^[+-]?\d+$/u.test(part))
  )
    return undefined;
  const numbers = parts.map(Number);
  if (numbers.length === 4) {
    const [alpha = 0, red = 0, green = 0, blue = 0] = numbers;
    return channels((alpha << 24) | (red << 16) | (green << 8) | blue, "argb");
  }
  const [red = 0, green = 0, blue = 0] = numbers;
  return channels((0xff << 24) | (red << 16) | (green << 8) | blue, "rgb");
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function hexadecimal(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function formatCraftEngineColor(
  color: NormalizedColor,
  format: CraftEngineColorFormat,
): string {
  const alpha = byte(color.alpha);
  const red = byte(color.red);
  const green = byte(color.green);
  const blue = byte(color.blue);
  switch (format) {
    case "hex": {
      return `'${
        alpha === 255
          ? `#${hexadecimal(red)}${hexadecimal(green)}${hexadecimal(blue)}`
          : `#${hexadecimal(alpha)}${hexadecimal(red)}${hexadecimal(green)}${hexadecimal(blue)}`
      }'`;
    }
    case "rgb":
      return `'${red},${green},${blue}'`;
    case "argb":
      return `'${alpha},${red},${green},${blue}'`;
    case "rgb-decimal":
      return String((red << 16) | (green << 8) | blue);
    case "decimal":
      return String((alpha << 24) | (red << 16) | (green << 8) | blue | 0);
  }
}

function colorFormatAtPath(
  path: readonly string[],
): "decimal" | "rgb-decimal" | undefined {
  const normalized = path.map((part) => part.replaceAll("-", "_"));
  const last = normalized.at(-1) ?? "";
  if (
    last === "color_when_undyed" ||
    ["custom_color", "map_color"].includes(last)
  )
    return "rgb-decimal";
  if (
    /^\d+$/u.test(last) &&
    ["colors", "fade_colors"].includes(normalized.at(-2) ?? "")
  )
    return "rgb-decimal";
  if (
    last === "dyed_color" &&
    normalized.some((part) => part === "components" || part === "component")
  )
    return "rgb-decimal";
  if (
    [
      "dye_color",
      "firework_color",
      "dyed_color",
      "overwritable_dyed_color",
    ].includes(last)
  )
    return "decimal";
  return undefined;
}

function walkColors(
  section: ParsedSection,
  value: unknown,
  path: readonly string[],
  output: CraftEngineColorOccurrence[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      walkColors(section, entry, [...path, String(index)], output),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value))
      walkColors(section, child, [...path, key], output);
    return;
  }
  const numericFormat = colorFormatAtPath(path);
  if (!numericFormat) return;
  const parsed = parseCraftEngineColor(value, numericFormat);
  const range = section.ranges.values.get(path.join("."));
  if (!parsed || !range) return;
  output.push({ ...parsed, range });
}

export function craftEngineColors(
  parsed: ParsedYamlFile,
): readonly CraftEngineColorOccurrence[] {
  const output: CraftEngineColorOccurrence[] = [];
  for (const section of parsed.sections)
    walkColors(section, section.value, [], output);
  return output.sort((left, right) => left.range.start - right.range.start);
}
