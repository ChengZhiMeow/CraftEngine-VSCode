import { promises as fs } from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";
import { PNG } from "pngjs";

import { isRecord, isUnknownArray } from "../../util/records.js";
import { Messages } from "../../messages.js";
import type { VanillaAssetStore } from "../assets/store.js";

export interface VanillaGlyph {
  readonly codepoint: number;
  readonly width: number;
  readonly height: number;
  readonly ascent: number;
  readonly advance: number;
  readonly boldOffset: number;
  readonly shadowOffset: number;
  readonly oversample: number;
  readonly rows: readonly string[];
}

interface BitmapProvider {
  readonly type: "bitmap";
  readonly file: string;
  readonly height?: number;
  readonly ascent: number;
  readonly chars: readonly string[];
}

function isBitmapProvider(value: unknown): value is BitmapProvider {
  return (
    isRecord(value) &&
    value.type === "bitmap" &&
    typeof value.file === "string" &&
    typeof value.ascent === "number" &&
    isUnknownArray(value.chars) &&
    value.chars.every((row) => typeof row === "string") &&
    (value.height === undefined || typeof value.height === "number")
  );
}

function packedRows(
  width: number,
  height: number,
  pixel: (x: number, y: number) => boolean,
): string[] {
  return Array.from({ length: height }, (_, y) => {
    let row = 0n;
    for (let x = 0; x < width; x += 1)
      if (pixel(x, y)) row |= 1n << BigInt(width - x - 1);
    return row.toString(16).padStart(Math.ceil(width / 4), "0");
  });
}

function parseUnihexLine(
  line: string,
): { readonly codepoint: number; readonly hex: string } | undefined {
  const separator = line.indexOf(":");
  if (separator < 1) return undefined;
  const codepoint = Number.parseInt(line.slice(0, separator), 16);
  const hex = line.slice(separator + 1).trim();
  if (!Number.isFinite(codepoint) || hex.length === 0 || hex.length % 16 !== 0)
    return undefined;
  return { codepoint, hex };
}

export class VanillaFontStore {
  private bitmapGlyphs: ReadonlyMap<number, VanillaGlyph> | undefined;
  private unihexLines: ReadonlyMap<number, string> | undefined;

  public constructor(private readonly assets: VanillaAssetStore) {}

  public async glyphs(
    codepoints: readonly number[],
  ): Promise<Readonly<Record<string, VanillaGlyph>>> {
    await this.ensureLoaded();
    const result: Record<string, VanillaGlyph> = {};
    for (const codepoint of new Set(codepoints)) {
      const glyph =
        this.bitmapGlyphs?.get(codepoint) ??
        this.unihexGlyph(codepoint) ??
        this.bitmapGlyphs?.get(0xfffd);
      if (glyph) result[String(codepoint)] = glyph;
    }
    return result;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.bitmapGlyphs && this.unihexLines) return;
    const root = await this.assets.ensureExtracted();
    const definition: unknown = JSON.parse(
      await fs.readFile(
        path.join(
          root,
          "assets",
          "minecraft",
          "font",
          "include",
          "default.json",
        ),
        "utf8",
      ),
    );
    if (!isRecord(definition) || !isUnknownArray(definition.providers)) {
      throw new Error(Messages.src.minecraft.font.store.text0001);
    }
    const bitmapGlyphs = new Map<number, VanillaGlyph>();
    for (const rawProvider of definition.providers) {
      if (!isRecord(rawProvider) || rawProvider.type !== "bitmap") continue;
      if (!isBitmapProvider(rawProvider))
        throw new Error(Messages.src.minecraft.font.store.text0002);
      const provider = rawProvider;
      const providerPath = provider.file.includes(":")
        ? provider.file.slice(provider.file.indexOf(":") + 1)
        : provider.file;
      const bytes = await fs.readFile(
        path.join(
          root,
          "assets",
          "minecraft",
          "textures",
          providerPath.endsWith(".png") ? providerPath : `${providerPath}.png`,
        ),
      );
      const png = PNG.sync.read(bytes);
      const rows = provider.chars.length;
      const cellWidth = Math.floor(
        png.width /
          Math.max(1, ...provider.chars.map((row) => [...row].length)),
      );
      const cellHeight = Math.floor(png.height / rows);
      const oversample = cellHeight / (provider.height ?? 8);
      for (let row = 0; row < rows; row += 1) {
        const characters = [...(provider.chars[row] ?? "")];
        for (let column = 0; column < characters.length; column += 1) {
          const codepoint = characters[column]?.codePointAt(0);
          if (
            codepoint === undefined ||
            codepoint === 0 ||
            bitmapGlyphs.has(codepoint)
          )
            continue;
          let right = -1;
          for (let y = 0; y < cellHeight; y += 1)
            for (let x = 0; x < cellWidth; x += 1) {
              if (
                (png.data[
                  ((row * cellHeight + y) * png.width +
                    column * cellWidth +
                    x) *
                    4 +
                    3
                ] ?? 0) > 0
              )
                right = Math.max(right, x);
            }
          const sourceWidth = Math.max(1, right + 1);
          bitmapGlyphs.set(codepoint, {
            codepoint,
            width: sourceWidth,
            height: cellHeight,
            ascent: provider.ascent,
            advance: Math.ceil(sourceWidth / oversample) + 1,
            boldOffset: 1,
            shadowOffset: 1,
            oversample,
            rows: packedRows(
              sourceWidth,
              cellHeight,
              (x, y) =>
                (png.data[
                  ((row * cellHeight + y) * png.width +
                    column * cellWidth +
                    x) *
                    4 +
                    3
                ] ?? 0) > 0,
            ),
          });
        }
      }
    }

    const unihexArchive = new AdmZip(
      path.join(root, "assets", "minecraft", "font", "unifont.zip"),
    );
    const hexEntry = unihexArchive
      .getEntries()
      .find((entry) => !entry.isDirectory && entry.entryName.endsWith(".hex"));
    if (!hexEntry) throw new Error(Messages.src.minecraft.font.store.text0003);
    const unihexLines = new Map<number, string>();
    for (const line of hexEntry.getData().toString("utf8").split(/\r?\n/u)) {
      const parsed = parseUnihexLine(line);
      if (parsed) unihexLines.set(parsed.codepoint, parsed.hex);
    }
    this.bitmapGlyphs = bitmapGlyphs;
    this.unihexLines = unihexLines;
  }

  private unihexGlyph(codepoint: number): VanillaGlyph | undefined {
    const hex = this.unihexLines?.get(codepoint);
    if (!hex) return undefined;
    const width = (hex.length / 16) * 4;
    const digits = width / 4;
    const rows = Array.from({ length: 16 }, (_, row) =>
      hex.slice(row * digits, (row + 1) * digits).toLowerCase(),
    );
    let left = width;
    let right = -1;
    for (const row of rows) {
      for (let x = 0; x < width; x += 1)
        if ((BigInt(`0x${row}`) & (1n << BigInt(width - x - 1))) !== 0n) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
    }
    if (
      (codepoint >= 0x3200 && codepoint <= 0x9fff) ||
      (codepoint >= 0xf900 && codepoint <= 0xfaff)
    ) {
      left = 0;
      right = 15;
    }
    if (right < left) {
      left = 0;
      right = 0;
    }
    const croppedWidth = right - left + 1;
    const croppedRows = rows.map((row) => {
      const bits = BigInt(`0x${row}`) >> BigInt(width - right - 1);
      return (bits & ((1n << BigInt(croppedWidth)) - 1n))
        .toString(16)
        .padStart(Math.ceil(croppedWidth / 4), "0");
    });
    return {
      codepoint,
      width: croppedWidth,
      height: 16,
      ascent: 7,
      advance: Math.floor(croppedWidth / 2) + 1,
      boldOffset: 0.5,
      shadowOffset: 0.5,
      oversample: 2,
      rows: croppedRows,
    };
  }
}
