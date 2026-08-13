export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

export interface AtlasCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly discardedRight: number;
  readonly discardedBottom: number;
}

export interface GlyphMetrics {
  readonly cell: AtlasCell;
  readonly scale: number;
  readonly drawWidth: number;
  readonly drawHeight: number;
  readonly topOffset: number;
  readonly opaqueWidth: number;
  readonly advance: number;
}

export function atlasCell(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  columns: number,
  row: number,
  column: number,
): AtlasCell {
  const width = Math.floor(imageWidth / columns);
  const height = Math.floor(imageHeight / rows);
  return {
    x: column * width,
    y: row * height,
    width,
    height,
    discardedRight: imageWidth - width * columns,
    discardedBottom: imageHeight - height * rows,
  };
}

export function rightmostOpaqueWidth(
  image: RgbaImage,
  cell: AtlasCell,
): number {
  for (let x = cell.width - 1; x >= 0; x -= 1) {
    for (let y = 0; y < cell.height; y += 1) {
      if (
        (image.data[((cell.y + y) * image.width + cell.x + x) * 4 + 3] ?? 0) !==
        0
      )
        return x + 1;
    }
  }
  return 0;
}

export function glyphMetrics(
  image: RgbaImage,
  rows: number,
  columns: number,
  row: number,
  column: number,
  configuredHeight: number,
  ascent: number,
): GlyphMetrics {
  const cell = atlasCell(image.width, image.height, rows, columns, row, column);
  const scale = configuredHeight / cell.height;
  const opaqueWidth = rightmostOpaqueWidth(image, cell);
  return {
    cell,
    scale,
    drawWidth: cell.width * scale,
    drawHeight: configuredHeight,
    topOffset: 7 - ascent,
    opaqueWidth,
    // Java 浮点转整数要向零截断, 否则负偏移字形宽度会错
    advance: Math.trunc(opaqueWidth * scale + 0.5) + 1,
  };
}
