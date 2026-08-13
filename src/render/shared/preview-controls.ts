export interface RgbaChannels {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface RgbaColor extends RgbaChannels {
  readonly css: string;
}

export interface RgbaPickerState extends RgbaChannels {
  readonly hex: string;
  readonly alphaPercent: number;
}

export interface BitmapQuad {
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface CropRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createFrameScheduler<Arguments extends readonly unknown[]>(
  requestFrame: (callback: (timestamp: number) => void) => number,
  callback: (...arguments_: Arguments) => void,
  minimumInterval = 0,
): (...arguments_: Arguments) => void {
  const interval = Math.max(0, Number(minimumInterval) || 0);
  let pending = false;
  let latestArguments: Arguments | undefined;
  let lastRun = Number.NEGATIVE_INFINITY;

  const run = (timestamp: number): void => {
    if (timestamp - lastRun < interval) {
      requestFrame(run);
      return;
    }
    pending = false;
    lastRun = timestamp;
    if (latestArguments) callback(...latestArguments);
  };

  return (...arguments_: Arguments): void => {
    latestArguments = arguments_;
    if (pending) return;
    pending = true;
    requestFrame(run);
  };
}

function color(
  r: number,
  g: number,
  b: number,
  a: number,
): RgbaColor | undefined {
  if (![r, g, b, a].every(Number.isFinite)) return undefined;
  if (
    r < 0 ||
    r > 255 ||
    g < 0 ||
    g > 255 ||
    b < 0 ||
    b > 255 ||
    a < 0 ||
    a > 1
  )
    return undefined;
  const rounded = { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  return {
    ...rounded,
    css: `rgba(${rounded.r}, ${rounded.g}, ${rounded.b}, ${rounded.a})`,
  };
}

export function parseRgba(value: unknown): RgbaColor | undefined {
  const source = (typeof value === "string" ? value : "").trim();
  const hexadecimal = source.match(/^#([0-9a-f]{8}|[0-9a-f]{6})$/iu);
  if (hexadecimal) {
    const hex = hexadecimal[1];
    if (!hex) return undefined;
    return color(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    );
  }
  const functional = source.match(/^rgba?\(\s*([^)]*)\s*\)$/iu);
  const components = (functional?.[1] ?? source)
    .split(",")
    .map((part) => part.trim());
  if (components.length !== 4) return undefined;
  const red = Number(components[0]);
  const green = Number(components[1]);
  const blue = Number(components[2]);
  const alphaSource = components[3];
  if (!alphaSource) return undefined;
  const alpha = alphaSource.endsWith("%")
    ? Number(alphaSource.slice(0, -1)) / 100
    : Number(alphaSource);
  return color(red, green, blue, alpha);
}

export function rgbaPickerState(
  value: Partial<RgbaChannels> | undefined,
): RgbaPickerState {
  const effective = color(
    Number(value?.r),
    Number(value?.g),
    Number(value?.b),
    Number(value?.a),
  ) ?? { r: 0, g: 0, b: 0, a: 1, css: "rgba(0, 0, 0, 1)" };
  const hexadecimal = [effective.r, effective.g, effective.b]
    .map((component) => component.toString(16).padStart(2, "0"))
    .join("");
  return {
    hex: `#${hexadecimal}`,
    r: effective.r,
    g: effective.g,
    b: effective.b,
    a: effective.a,
    alphaPercent: Math.round(effective.a * 1000) / 10,
  };
}

export function rgbaText(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): string | undefined {
  const effective = color(
    Number(red),
    Number(green),
    Number(blue),
    Number(alpha),
  );
  if (!effective) return undefined;
  return `rgba(${effective.r}, ${effective.g}, ${effective.b}, ${Math.round(effective.a * 1000) / 1000})`;
}

export function multiplyTextureColor(
  texture: RgbaChannels,
  tint: RgbaChannels,
): RgbaChannels {
  return {
    r: Math.round((texture.r * tint.r) / 255),
    g: Math.round((texture.g * tint.g) / 255),
    b: Math.round((texture.b * tint.b) / 255),
    a: Math.round(texture.a * tint.a),
  };
}

export function bitmapAdvance(opaqueWidth: number, scale: number): number {
  if (!Number.isFinite(opaqueWidth) || !Number.isFinite(scale)) return 1;
  // 这里要像 Java 一样向零取整, 否则负数坐标会差一格
  return Math.trunc(opaqueWidth * scale + 0.5) + 1;
}

export function bitmapQuad(width: number, height: number): BitmapQuad {
  const safeWidth = Number.isFinite(width) ? width : 0;
  const safeHeight = Number.isFinite(height) ? height : 0;
  return {
    width: Math.abs(safeWidth),
    height: Math.abs(safeHeight),
    scaleX: Math.sign(safeWidth),
    scaleY: Math.sign(safeHeight),
  };
}

export function textTintForMode(
  mode: string,
  tint: RgbaColor,
): RgbaColor | undefined {
  return mode === "chat" ? tint : undefined;
}

export function miniMessageChatLayout(
  width: number,
  height: number,
  contentHeight: number,
): Readonly<{
  output: {
    x: number;
    bottom: number;
    width: number;
    paddingX: number;
    contentHeight: number;
  };
  input: {
    x: number;
    y: number;
    width: number;
    height: number;
    paddingLeft: number;
    fontSize: number;
    lineHeight: number;
  };
  messageFontSize: number;
  messageLineHeight: number;
  shadowOffset: number;
}> {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  return {
    output: {
      x: 0,
      bottom: safeHeight - 74,
      width: Math.round(safeWidth * 0.55),
      paddingX: 5,
      contentHeight: Math.max(0, Number(contentHeight) || 0),
    },
    input: {
      x: 5,
      y: safeHeight - 39,
      width: safeWidth - 10,
      height: 34,
      paddingLeft: 5,
      fontSize: 32,
      lineHeight: 32,
    },
    messageFontSize: 28,
    messageLineHeight: 28,
    shadowOffset: 3,
  };
}

export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropRectangle {
  if (
    ![sourceWidth, sourceHeight, targetWidth, targetHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

export function fitScale(
  availableWidth: number,
  availableHeight: number,
  contentWidth: number,
  contentHeight: number,
  padding = 32,
): number {
  if (
    ![availableWidth, availableHeight, contentWidth, contentHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return 1;
  const horizontal = Math.max(1, availableWidth - padding) / contentWidth;
  const vertical = Math.max(1, availableHeight - padding) / contentHeight;
  return (
    Math.round(clamp(Math.min(horizontal, vertical), 0.1, 16) * 1000) / 1000
  );
}

export function wheelScale(current: number, deltaY: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(deltaY)) return 1;
  return (
    Math.round(clamp(current * Math.exp(-deltaY * 0.0015), 0.1, 16) * 1000) /
    1000
  );
}

export function stepZoomPercent(current: number, direction: number): number {
  const value = Number.isFinite(current) ? current : 100;
  return Math.round(clamp(value + Math.sign(direction) * 10, 10, 1600));
}
