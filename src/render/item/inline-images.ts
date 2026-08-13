import type {
  InlineImageGlyph,
  ItemPreviewPayload,
} from "../shared/protocol.js";

interface InlineImageEntry {
  readonly glyph: InlineImageGlyph;
  readonly image: HTMLImageElement;
  ready: boolean;
}

const images = new Map<string, InlineImageEntry>();

export function prepareInlineImages(
  payload: ItemPreviewPayload | undefined,
  onLoad?: () => void,
): void {
  images.clear();
  for (const [token, glyph] of Object.entries(payload?.inlineImages ?? {})) {
    const image = new Image();
    const entry: InlineImageEntry = { glyph, image, ready: false };
    image.addEventListener(
      "load",
      () => {
        entry.ready = true;
        onLoad?.();
      },
      { once: true },
    );
    image.src = glyph.source;
    images.set(token, entry);
  }
}

export function inlineImage(character: string): InlineImageEntry | undefined {
  return images.get(character);
}

export function inlineAdvance(character: string): number | undefined {
  const advance = inlineImage(character)?.glyph.advance;
  return advance === undefined ? undefined : Number(advance);
}

function shadowImage(
  context: CanvasRenderingContext2D,
  entry: InlineImageEntry,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!entry.ready) return;
  context.save();
  context.globalAlpha = 0.75;
  context.filter = "brightness(25%)";
  context.drawImage(entry.image, x + 2, y + 2, width, height);
  context.restore();
}

export function drawInlineImage(
  context: CanvasRenderingContext2D,
  character: string,
  x: number,
  textOriginY: number,
  pixelScale = 2,
): number | undefined {
  const entry = inlineImage(character);
  if (!entry) return undefined;
  const { glyph } = entry;
  const width = glyph.width * pixelScale;
  const height = glyph.height * pixelScale;
  const top = (textOriginY + 7 - glyph.ascent) * pixelScale;
  const left = x * pixelScale;
  shadowImage(context, entry, left, top, width, height);
  if (entry.ready) {
    context.imageSmoothingEnabled = false;
    context.drawImage(entry.image, left, top, width, height);
  }
  return glyph.advance;
}
