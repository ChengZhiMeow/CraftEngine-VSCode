import { promises as fs } from "node:fs";

import { PNG } from "pngjs";

import type { ItemDefinition } from "../../config/item/model.js";
import { atlasCell, glyphMetrics } from "../image/rendering.js";
import { pngDataUrl } from "../shared/assets.js";
import type { ImageComponentNode } from "../../text/componentResolver.js";
import type { CraftEngineWorkspaceIndex } from "../../workspace/index.js";

import { Messages } from "../../messages.js";
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

interface PendingImage {
  readonly token: string;
  readonly node: ImageComponentNode;
}

export class InlineImageCollector {
  private readonly pending = new Map<string, PendingImage>();
  private nextCodepoint = 0xf0000;

  public constructor(
    private readonly index: CraftEngineWorkspaceIndex,
    private readonly item: ItemDefinition,
  ) {}

  public readonly resolver = (node: ImageComponentNode): string => {
    const key = `${node.id}\u0000${node.row}\u0000${node.column}`;
    let pending = this.pending.get(key);
    if (!pending) {
      const token = String.fromCodePoint(this.nextCodepoint++);
      pending = { token, node };
      this.pending.set(key, pending);
    }
    return `${node.format ?? ""}${pending.token}`;
  };

  public async build(): Promise<{
    readonly glyphs: Readonly<Record<string, InlineImageGlyph>>;
    readonly issues: readonly string[];
  }> {
    const glyphs: Record<string, InlineImageGlyph> = {};
    const issues: string[] = [];
    await Promise.all(
      [...this.pending.values()].map(async (pending) => {
        const result = await this.load(pending);
        glyphs[pending.token] = result.glyph;
        if (result.issue) issues.push(result.issue);
      }),
    );
    return { glyphs, issues: [...new Set(issues)] };
  }

  private async load(
    pending: PendingImage,
  ): Promise<{ readonly glyph: InlineImageGlyph; readonly issue?: string }> {
    const resolution = this.index.catalog
      .forRoot(this.item.source.pack.resourcesRoot)
      .resolveImage(pending.node.id);
    const issue =
      resolution.candidates.length === 0
        ? Messages.src.preview.item.inlineImages.text0001(pending.node.id)
        : pending.node.shortId && resolution.candidates.length !== 1
          ? Messages.src.preview.item.inlineImages.text0002(pending.node.id)
          : undefined;
    const definition = issue === undefined ? resolution.selected : undefined;
    const resolved = definition
      ? this.index.index.resolved.get(definition)
      : undefined;
    if (!definition || !resolved || resolved.bitmap.spec.kind !== "bitmap") {
      return this.missing(
        pending,
        issue ??
          Messages.src.preview.item.inlineImages.text0003(pending.node.id),
      );
    }
    const bitmap = resolved.bitmap.spec;
    const row =
      definition.spec.kind === "reference" ? resolved.row : pending.node.row;
    const column =
      definition.spec.kind === "reference"
        ? resolved.column
        : pending.node.column;
    if (
      row < 0 ||
      row >= bitmap.rows ||
      column < 0 ||
      column >= bitmap.columns
    ) {
      return this.missing(
        pending,
        Messages.src.preview.item.inlineImages.text0004(
          definition.id,
          row,
          column,
        ),
      );
    }
    const texture =
      bitmap.textureCandidates.find((candidate) => candidate.effective) ??
      bitmap.textureCandidates[0];
    if (!texture)
      return this.missing(
        pending,
        Messages.src.preview.item.inlineImages.text0005(
          definition.id,
          bitmap.file,
        ),
      );
    try {
      const source = PNG.sync.read(await fs.readFile(texture.path));
      const cell = atlasCell(
        source.width,
        source.height,
        bitmap.rows,
        bitmap.columns,
        row,
        column,
      );
      if (cell.width <= 0 || cell.height <= 0)
        return this.missing(
          pending,
          Messages.src.preview.item.inlineImages.text0006(definition.id),
        );
      const configuredHeight = bitmap.height ?? cell.height;
      const ascent = bitmap.ascent ?? configuredHeight - 1;
      const metrics = glyphMetrics(
        source,
        bitmap.rows,
        bitmap.columns,
        row,
        column,
        configuredHeight,
        ascent,
      );
      const cellPng = new PNG({ width: cell.width, height: cell.height });
      PNG.bitblt(
        source,
        cellPng,
        cell.x,
        cell.y,
        cell.width,
        cell.height,
        0,
        0,
      );
      return {
        glyph: {
          token: pending.token,
          id: definition.id,
          row,
          column,
          source: pngDataUrl(PNG.sync.write(cellPng)),
          sourceWidth: cell.width,
          sourceHeight: cell.height,
          width: metrics.drawWidth,
          height: metrics.drawHeight,
          ascent,
          advance: metrics.advance,
          missing: false,
        },
      };
    } catch {
      return this.missing(
        pending,
        Messages.src.preview.item.inlineImages.text0007(
          definition.id,
          bitmap.file,
        ),
      );
    }
  }

  private missing(
    pending: PendingImage,
    issue: string,
  ): { readonly glyph: InlineImageGlyph; readonly issue: string } {
    const png = new PNG({ width: 16, height: 16 });
    for (let y = 0; y < 16; y += 1)
      for (let x = 0; x < 16; x += 1) {
        const bright = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 0;
        const offset = (y * 16 + x) * 4;
        png.data[offset] = bright ? 248 : 20;
        png.data[offset + 1] = 0;
        png.data[offset + 2] = bright ? 248 : 20;
        png.data[offset + 3] = 255;
      }
    return {
      glyph: {
        token: pending.token,
        id: pending.node.id,
        row: pending.node.row,
        column: pending.node.column,
        source: pngDataUrl(PNG.sync.write(png)),
        sourceWidth: 16,
        sourceHeight: 16,
        width: 8,
        height: 8,
        ascent: 7,
        advance: 9,
        missing: true,
      },
      issue,
    };
  }
}
