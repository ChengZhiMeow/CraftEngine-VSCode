import * as helpers from "../shared/preview-controls.js";
import {
  decodeImageInboundMessage,
  type ImageOutboundMessage,
  type ImagePreviewPayload,
} from "../shared/protocol.js";
import { canvasContext, element, queryElements } from "../shared/runtime.js";

import { Messages } from "../../messages.js";
type RgbaTarget = "text-rgba" | "background-rgba";
type ChatScene = "grass" | "desert" | "stone" | "water";

interface ImagePreviewState {
  readonly controls?: Readonly<Record<string, string>>;
  readonly fitMode?: boolean;
  readonly identity?: string;
  readonly viewScale?: number;
}

interface SpriteCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly row: number;
  readonly column: number;
}

interface GlyphMetrics {
  readonly cell: SpriteCell;
  readonly height: number;
  readonly ascent: number;
  readonly scale: number;
  readonly width: number;
  readonly topOffset: number;
  readonly advance: number;
}

const vscode = acquireVsCodeApi<ImagePreviewState, ImageOutboundMessage>();
const canvas = element("preview", HTMLCanvasElement);
const ctx = canvasContext(canvas, { alpha: false });
const viewport = element("canvas-viewport", HTMLElement);
const persisted = vscode.getState() ?? {};
const fallbackTextColor: helpers.RgbaColor = {
  r: 255,
  g: 255,
  b: 255,
  a: 1,
  css: "rgba(255, 255, 255, 1)",
};
const fallbackBackgroundColor: helpers.RgbaColor = {
  r: 0,
  g: 0,
  b: 0,
  a: 0.4,
  css: "rgba(0, 0, 0, 0.4)",
};
let payload: ImagePreviewPayload | undefined;
let texture: HTMLImageElement | undefined;
let generic54: HTMLImageElement | undefined;
let anvil: HTMLImageElement | undefined;
let textField: HTMLImageElement | undefined;
let chatBackgrounds: Readonly<Record<ChatScene, HTMLImageElement>> | undefined;
let caretVisible = true;
let identity = persisted.identity;
let viewScale =
  typeof persisted.viewScale === "number" &&
  Number.isFinite(persisted.viewScale)
    ? persisted.viewScale
    : 1;
let fitMode = persisted.fitMode !== false;
let zoomEditing = false;
let loadGeneration = 0;
let savedHeight: number | undefined;
let savedAscent: number | undefined;
let saving = false;
let saveFeedback = "";
let saveFeedbackKind = "";
let activeRgbaTarget: RgbaTarget | undefined;

function inputById(id: string): HTMLInputElement {
  return element(id, HTMLInputElement);
}

function textAreaById(id: string): HTMLTextAreaElement {
  return element(id, HTMLTextAreaElement);
}

function selectById(id: string): HTMLSelectElement {
  return element(id, HTMLSelectElement);
}

function buttonById(id: string): HTMLButtonElement {
  return element(id, HTMLButtonElement);
}

function byId(id: string): HTMLElement {
  return element(id, HTMLElement);
}

function optionalValueControl(
  id: string,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined {
  const value = document.getElementById(id);
  if (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  )
    return value;
  return undefined;
}

function number(id: string): number {
  const value = optionalValueControl(id);
  if (value) return Number(value.value);
  throw new TypeError(Messages.web.image.preview.text0015(id));
}

function integer(id: string): number {
  return Math.trunc(number(id));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

const chatAssetElement = byId("chat-background-assets");
function chatAsset(name: ChatScene): string {
  const url = chatAssetElement.dataset[name];
  if (url) return url;
  throw new Error(Messages.web.image.preview.text0016(name));
}
const chatBackgroundPromise: Promise<
  Readonly<Record<ChatScene, HTMLImageElement>>
> = Promise.all([
  loadImage(chatAsset("grass")),
  loadImage(chatAsset("desert")),
  loadImage(chatAsset("stone")),
  loadImage(chatAsset("water")),
]).then(([grass, desert, stone, water]) => ({ grass, desert, stone, water }));

function setPair(id: string, value: number): void {
  inputById(id).value = String(value);
  inputById(`${id}-range`).value = String(value);
}

function setPairBounds(id: string, minimum: number, maximum: number): void {
  for (const controlId of [id, `${id}-range`]) {
    const control = inputById(controlId);
    control.min = String(minimum);
    control.max = String(maximum);
    control.disabled = minimum === maximum;
  }
  const limit = document.getElementById(`${id}-limit`);
  if (limit) limit.textContent = Messages.web.image.preview.text0001(maximum);
}

function restoreControls(): void {
  if (!persisted.controls) return;
  for (const [id, value] of Object.entries(persisted.controls)) {
    const control = optionalValueControl(id);
    if (!control || control.hasAttribute("data-transient")) continue;
    control.value = id === "chat-scene" && value === "cave" ? "stone" : value;
    const range = optionalValueControl(`${id}-range`);
    if (range) range.value = value;
  }
}

function saveState(): void {
  const controls: Record<string, string> = {};
  const inputs = queryElements(
    'input[id]:not([data-role="range"]):not([data-transient])',
    HTMLInputElement,
  );
  const selects = queryElements("select[id]", HTMLSelectElement);
  const textAreas = queryElements("textarea[id]", HTMLTextAreaElement);
  for (const control of [...inputs, ...selects, ...textAreas])
    controls[control.id] = control.value;
  vscode.setState({
    controls,
    fitMode,
    ...(identity === undefined ? {} : { identity }),
    viewScale,
  });
}

function colorValue(
  id: RgbaTarget,
  fallback: helpers.RgbaColor,
): helpers.RgbaColor {
  const input = inputById(id);
  const parsed = helpers.parseRgba(input.value);
  input.setAttribute("aria-invalid", parsed ? "false" : "true");
  input.title = parsed ? "" : Messages.web.image.preview.text0002;
  const effective = parsed ?? fallback;
  buttonById(`${id}-swatch`).style.setProperty("--swatch", effective.css);
  return effective;
}

function setRgbaPickerState(
  value: Partial<helpers.RgbaChannels> | undefined,
): void {
  const state = helpers.rgbaPickerState(value);
  inputById("rgba-picker-color").value = state.hex;
  inputById("rgba-picker-r").value = String(state.r);
  inputById("rgba-picker-g").value = String(state.g);
  inputById("rgba-picker-b").value = String(state.b);
  inputById("rgba-picker-a").value = String(state.a);
  inputById("rgba-picker-alpha").value = String(state.alphaPercent);
  byId("rgba-picker-alpha-value").textContent = `${state.alphaPercent}%`;
}

function positionRgbaPicker(): void {
  const picker = byId("rgba-picker");
  if (picker.hidden || !activeRgbaTarget) return;
  const anchor = buttonById(
    `${activeRgbaTarget}-swatch`,
  ).getBoundingClientRect();
  const margin = 8;
  const gap = 6;
  const left = helpers.clamp(
    anchor.right - picker.offsetWidth,
    margin,
    Math.max(margin, window.innerWidth - picker.offsetWidth - margin),
  );
  let top = anchor.bottom + gap;
  if (top + picker.offsetHeight > window.innerHeight - margin) {
    top = Math.max(margin, anchor.top - picker.offsetHeight - gap);
  }
  picker.style.left = `${Math.round(left)}px`;
  picker.style.top = `${Math.round(top)}px`;
}

function closeRgbaPicker(): void {
  byId("rgba-picker").hidden = true;
  for (const id of ["text-rgba", "background-rgba"] as const) {
    buttonById(`${id}-swatch`).setAttribute("aria-expanded", "false");
  }
  activeRgbaTarget = undefined;
}

function openRgbaPicker(id: RgbaTarget): void {
  const picker = byId("rgba-picker");
  if (activeRgbaTarget === id && !picker.hidden) {
    closeRgbaPicker();
    return;
  }
  activeRgbaTarget = id;
  for (const target of ["text-rgba", "background-rgba"] as const) {
    buttonById(`${target}-swatch`).setAttribute(
      "aria-expanded",
      String(target === id),
    );
  }
  byId("rgba-picker-title").textContent =
    id === "text-rgba"
      ? Messages.web.image.preview.text0003
      : Messages.web.image.preview.text0004;
  setRgbaPickerState(
    colorValue(
      id,
      id === "background-rgba" ? fallbackBackgroundColor : fallbackTextColor,
    ),
  );
  picker.hidden = false;
  positionRgbaPicker();
  const colorInput = inputById("rgba-picker-color");
  colorInput.focus();
  try {
    colorInput.showPicker();
  } catch {
    return;
  }
}

function updateRgbaTarget(): void {
  if (!activeRgbaTarget) return;
  const redValue = number("rgba-picker-r");
  const greenValue = number("rgba-picker-g");
  const blueValue = number("rgba-picker-b");
  const alphaValue = number("rgba-picker-a");
  if (![redValue, greenValue, blueValue, alphaValue].every(Number.isFinite))
    return;
  const red = Math.round(helpers.clamp(redValue, 0, 255));
  const green = Math.round(helpers.clamp(greenValue, 0, 255));
  const blue = Math.round(helpers.clamp(blueValue, 0, 255));
  const alpha = helpers.clamp(alphaValue, 0, 1);
  const text = helpers.rgbaText(red, green, blue, alpha);
  if (!text) return;
  const input = inputById(activeRgbaTarget);
  input.value = text;
  setRgbaPickerState({ r: red, g: green, b: blue, a: alpha });
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function cell(): SpriteCell {
  if (!payload || !texture)
    throw new Error(Messages.web.image.preview.text0017);
  const columns = Math.max(1, payload.columns);
  const rows = Math.max(1, payload.rows);
  const width = Math.floor(texture.naturalWidth / columns);
  const height = Math.floor(texture.naturalHeight / rows);
  const row = Math.max(0, Math.min(rows - 1, integer("row")));
  const column = Math.max(0, Math.min(columns - 1, integer("col")));
  return { x: column * width, y: row * height, width, height, row, column };
}

function opaqueWidth(currentCell: SpriteCell): number {
  if (!texture) return 0;
  const work = document.createElement("canvas");
  work.width = currentCell.width;
  work.height = currentCell.height;
  const workContext = canvasContext(work, { willReadFrequently: true });
  workContext.drawImage(
    texture,
    currentCell.x,
    currentCell.y,
    currentCell.width,
    currentCell.height,
    0,
    0,
    currentCell.width,
    currentCell.height,
  );
  const pixels = workContext.getImageData(
    0,
    0,
    currentCell.width,
    currentCell.height,
  ).data;
  for (let x = currentCell.width - 1; x >= 0; x -= 1) {
    for (let y = 0; y < currentCell.height; y += 1) {
      if ((pixels[(y * currentCell.width + x) * 4 + 3] ?? 0) !== 0)
        return x + 1;
    }
  }
  return 0;
}

function metrics(): GlyphMetrics {
  const currentCell = cell();
  const height = integer("height");
  const ascent = integer("ascent");
  const scale = height / currentCell.height;
  const visibleWidth = opaqueWidth(currentCell);
  return {
    cell: currentCell,
    height,
    ascent,
    scale,
    width: currentCell.width * scale,
    topOffset: 7 - ascent,
    advance: helpers.bitmapAdvance(visibleWidth, scale),
  };
}

function drawGlyph(
  data: GlyphMetrics,
  x: number,
  y: number,
  overallScale = 1,
  clip?: helpers.CropRectangle,
  tint?: helpers.RgbaColor,
  solidColor?: string,
): void {
  if (!texture) return;
  const targetWidth = data.width * overallScale;
  const targetHeight = data.height * overallScale;
  const quad = helpers.bitmapQuad(targetWidth, targetHeight);
  if (quad.scaleX === 0 || quad.scaleY === 0) return;
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.ceil(quad.width));
  layer.height = Math.max(1, Math.ceil(quad.height));
  const layerContext = canvasContext(layer, {
    willReadFrequently: Boolean(tint),
  });
  layerContext.imageSmoothingEnabled = false;
  layerContext.drawImage(
    texture,
    data.cell.x,
    data.cell.y,
    data.cell.width,
    data.cell.height,
    0,
    0,
    quad.width,
    quad.height,
  );
  if (tint) {
    const image = layerContext.getImageData(0, 0, layer.width, layer.height);
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if ((image.data[offset + 3] ?? 0) === 0) continue;
      const multiplied = helpers.multiplyTextureColor(
        {
          r: image.data[offset] ?? 0,
          g: image.data[offset + 1] ?? 0,
          b: image.data[offset + 2] ?? 0,
          a: image.data[offset + 3] ?? 0,
        },
        tint,
      );
      image.data[offset] = multiplied.r;
      image.data[offset + 1] = multiplied.g;
      image.data[offset + 2] = multiplied.b;
      image.data[offset + 3] = multiplied.a / 255 < 0.1 ? 0 : multiplied.a;
    }
    layerContext.putImageData(image, 0, 0);
  }
  if (solidColor) {
    layerContext.globalCompositeOperation = "source-in";
    layerContext.fillStyle = solidColor;
    layerContext.fillRect(0, 0, layer.width, layer.height);
    layerContext.globalCompositeOperation = "source-over";
  }

  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.width, clip.height);
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = false;
  ctx.translate(x, y);
  ctx.scale(quad.scaleX, quad.scaleY);
  ctx.drawImage(layer, 0, 0, quad.width, quad.height);
  ctx.restore();
}

function clear(width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, width, height);
}

function drawScene(width: number, height: number): void {
  clear(width, height);
  if (!chatBackgrounds) return;
  let image = chatBackgrounds.grass;
  switch (selectById("chat-scene").value) {
    case "desert":
      image = chatBackgrounds.desert;
      break;
    case "stone":
      image = chatBackgrounds.stone;
      break;
    case "water":
      image = chatBackgrounds.water;
      break;
  }
  const crop = helpers.coverCrop(
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
  );
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
}

function drawChatInput(
  layout: ReturnType<typeof helpers.miniMessageChatLayout>,
  background: helpers.RgbaColor,
): void {
  const input = layout.input;
  ctx.fillStyle = background.css;
  ctx.fillRect(input.x, input.y, input.width, input.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(input.x, input.y, input.width, input.height);
  ctx.clip();
  ctx.font = `${input.fontSize}px "MinecraftUnicode"`;
  ctx.textBaseline = "top";
  const rawValue = inputById("chat-input").value;
  const value = rawValue.endsWith("_") ? rawValue.slice(0, -1) : rawValue;
  const text = `${value}${caretVisible ? "_" : " "}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, input.x + input.paddingLeft, input.y + 1);
  ctx.restore();
}

function chatOutputLines(): readonly string[] {
  const value = textAreaById("chat-output").value;
  if (!value) return [];
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function useMinecraftFont(fontSize: number): void {
  ctx.font = `${fontSize}px "MinecraftPreview", "MinecraftUnicode"`;
  ctx.fontKerning = "none";
}

function wrappedChatOutputLines(
  maximumWidth: number,
  fontSize: number,
): readonly string[] {
  const lines = chatOutputLines();
  if (lines.length === 0 || maximumWidth <= 0) return lines;
  ctx.save();
  useMinecraftFont(fontSize);
  const wrapped = lines.flatMap((line) => {
    if (!line) return [""];
    const result: string[] = [];
    let current = "";
    for (const character of line) {
      const candidate = `${current}${character}`;
      if (current && ctx.measureText(candidate).width > maximumWidth) {
        result.push(current);
        current = character;
        continue;
      }
      current = candidate;
    }
    result.push(current);
    return result;
  });
  ctx.restore();
  return wrapped;
}

function drawMinecraftText(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  shadowOffset: number,
  tint: helpers.RgbaColor,
  clip: helpers.CropRectangle,
): void {
  if (!text) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.width, clip.height);
  ctx.clip();
  useMinecraftFont(fontSize);
  ctx.textBaseline = "top";
  ctx.fillStyle = `rgba(${Math.floor(tint.r / 4)}, ${Math.floor(
    tint.g / 4,
  )}, ${Math.floor(tint.b / 4)}, ${tint.a})`;
  ctx.fillText(text, x + shadowOffset, y + shadowOffset);
  ctx.fillStyle = tint.css;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawChat(data: GlyphMetrics, width: number, height: number): void {
  if (!payload) return;
  drawScene(width, height);
  const initialLayout = helpers.miniMessageChatLayout(width, height, 0);
  const lineHeight = initialLayout.messageLineHeight;
  const glyphScale = initialLayout.messageFontSize / 9;
  const localBottom = initialLayout.output.bottom;
  const originY = localBottom - 8 * glyphScale;
  const glyphTop = originY + data.topOffset * glyphScale;
  const glyphBottom = glyphTop + data.height * glyphScale;
  const occupied = Math.max(
    1,
    Math.ceil(
      Math.max(1, localBottom - Math.min(glyphTop, glyphBottom)) / lineHeight,
    ),
  );
  const reservedLines = Math.max(
    0,
    Math.trunc(payload.defaultReservedLines),
  );
  const maximumTextLines = Math.max(
    0,
    Math.floor(localBottom / lineHeight) - reservedLines,
  );
  const glyphX =
    initialLayout.output.x +
    initialLayout.output.paddingX +
    integer("shift") * glyphScale;
  const textX = glyphX + data.advance * glyphScale;
  const textWidth =
    initialLayout.output.x +
    initialLayout.output.width -
    textX -
    initialLayout.shadowOffset;
  const outputLines = wrappedChatOutputLines(
    textWidth,
    initialLayout.messageFontSize,
  ).slice(-maximumTextLines);
  const backgroundLines =
    Math.max(occupied, outputLines.length) + reservedLines;
  const layout = helpers.miniMessageChatLayout(
    width,
    height,
    backgroundLines * lineHeight,
  );
  const background = colorValue("background-rgba", fallbackBackgroundColor);
  ctx.fillStyle = background.css;
  ctx.fillRect(
    layout.output.x,
    layout.output.bottom - layout.output.contentHeight,
    layout.output.width,
    layout.output.contentHeight,
  );
  const tint = helpers.textTintForMode(
    selectById("mode").value,
    colorValue("text-rgba", fallbackTextColor),
  );
  const effectiveTint = tint ?? fallbackTextColor;
  drawGlyph(
    data,
    glyphX + layout.shadowOffset,
    glyphTop + layout.shadowOffset,
    glyphScale,
    undefined,
    undefined,
    `rgba(61, 61, 61, ${tint?.a ?? 1})`,
  );
  drawGlyph(data, glyphX, glyphTop, glyphScale, undefined, tint);
  const outputClip: helpers.CropRectangle = {
    x: layout.output.x,
    y: layout.output.bottom - layout.output.contentHeight,
    width: layout.output.width,
    height: layout.output.contentHeight,
  };
  for (let index = outputLines.length - 1; index >= 0; index -= 1) {
    const line = outputLines[index];
    if (line === undefined) continue;
    const distanceFromBottom = outputLines.length - index;
    drawMinecraftText(
      line,
      textX,
      layout.output.bottom - distanceFromBottom * lineHeight,
      layout.messageFontSize,
      layout.shadowOffset,
      effectiveTint,
      outputClip,
    );
  }
  drawChatInput(layout, background);
}

function drawContainer(
  data: GlyphMetrics,
  width: number,
  height: number,
): void {
  clear(width, height);
  if (!generic54) return;
  const rows = Math.max(1, Math.min(6, integer("container-rows")));
  const guiWidth = 176;
  const guiHeight = 114 + rows * 18;
  const left = Math.floor((width - guiWidth) / 2);
  const top = Math.floor((height - guiHeight) / 2);
  const topHeight = rows * 18 + 17;
  ctx.drawImage(generic54, 0, 0, 176, topHeight, left, top, 176, topHeight);
  ctx.drawImage(generic54, 0, 126, 176, 96, left, top + topHeight, 176, 96);
  const originX = left + 8;
  const originY = top + 6;
  drawGlyph(data, originX + integer("shift"), originY + data.topOffset);
}

function drawAnvil(data: GlyphMetrics, width: number, height: number): void {
  clear(width, height);
  if (!anvil) return;
  const left = Math.floor((width - 176) / 2);
  const top = Math.floor((height - 166) / 2);
  ctx.drawImage(anvil, 0, 0, 176, 166, left, top, 176, 166);
  const rename = selectById("anvil-mode").value === "rename";
  if (rename && textField)
    ctx.drawImage(textField, left + 59, top + 20, 110, 16);
  const originX = left + (rename ? 62 : 60);
  const originY = top + (rename ? 24 : 6);
  const clip = rename
    ? { x: left + 62, y: top + 24, width: 103, height: 12 }
    : undefined;
  drawGlyph(
    data,
    originX + integer("shift"),
    originY + data.topOffset,
    1,
    clip,
  );
}

function updateControlVisibility(): void {
  const mode = selectById("mode").value;
  byId("chat-controls").hidden = mode !== "chat";
  byId("container-controls").hidden = mode !== "container";
  byId("anvil-controls").hidden = mode !== "anvil";
}

function setSaveStatus(message: string, kind = ""): void {
  const status = byId("save-status");
  status.textContent = message;
  status.dataset.kind = kind;
}

function updateSaveState(): void {
  const button = buttonById("save-config");
  const resetButton = buttonById("reset-config");
  const dirty =
    savedHeight !== undefined &&
    savedAscent !== undefined &&
    Number.isFinite(savedHeight) &&
    Number.isFinite(savedAscent) &&
    (integer("height") !== savedHeight || integer("ascent") !== savedAscent);
  resetButton.disabled = saving || !dirty;
  if (!payload?.canSaveConfiguration) {
    button.disabled = true;
    setSaveStatus(
      payload?.saveUnavailableReason || Messages.web.image.preview.text0005,
    );
    return;
  }
  button.disabled = saving || !dirty;
  if (saving) setSaveStatus(Messages.web.image.preview.text0006);
  else if (saveFeedback) setSaveStatus(saveFeedback, saveFeedbackKind);
  else if (dirty) setSaveStatus(Messages.web.image.preview.text0007, "dirty");
  else setSaveStatus("");
}

function updateViewScale(): void {
  if (fitMode) {
    viewScale = helpers.fitScale(
      viewport.clientWidth,
      viewport.clientHeight,
      canvas.width,
      canvas.height,
      36,
    );
  }
  canvas.style.width = `${canvas.width * viewScale}px`;
  canvas.style.height = `${canvas.height * viewScale}px`;
  const percentage = Math.round(viewScale * 100);
  const zoomValue = buttonById("zoom-value");
  zoomValue.textContent = `${percentage}%`;
  zoomValue.title = fitMode
    ? Messages.web.image.preview.text0008(percentage)
    : Messages.web.image.preview.text0009(percentage);
  buttonById("fit-view").setAttribute("aria-pressed", String(fitMode));
  if (!zoomEditing) inputById("zoom-input").value = String(percentage);
}

function endZoomEdit(): void {
  zoomEditing = false;
  byId("zoom-editor").hidden = true;
  buttonById("zoom-value").hidden = false;
}

function fitView(): void {
  endZoomEdit();
  fitMode = true;
  updateViewScale();
  saveState();
}

function setManualScale(scale: number): void {
  fitMode = false;
  viewScale = helpers.clamp(scale, 0.1, 16);
  updateViewScale();
  saveState();
}

function beginZoomEdit(): void {
  zoomEditing = true;
  buttonById("zoom-value").hidden = true;
  byId("zoom-editor").hidden = false;
  const input = inputById("zoom-input");
  input.value = String(Math.round(viewScale * 100));
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function commitZoomEdit(): void {
  if (!zoomEditing) return;
  const percentage = number("zoom-input");
  endZoomEdit();
  if (Number.isFinite(percentage) && percentage > 0)
    setManualScale(percentage / 100);
  else updateViewScale();
}

function cancelZoomEdit(): void {
  if (!zoomEditing) return;
  endZoomEdit();
  updateViewScale();
}

function render(): void {
  if (!payload || !texture) return;
  updateControlVisibility();
  const data = metrics();
  const mode = selectById("mode").value;
  const width = mode === "chat" ? 960 : 320;
  const height = mode === "chat" ? 540 : 240;
  canvas.classList.toggle("chat-render", mode === "chat");
  if (mode === "chat") drawChat(data, width, height);
  else if (mode === "container") drawContainer(data, width, height);
  else drawAnvil(data, width, height);
  updateViewScale();
  updateSaveState();
  saveState();
}

const scheduleRender = helpers.createFrameScheduler(
  (callback) => requestAnimationFrame(callback),
  render,
  32,
);

restoreControls();
for (const control of queryElements("[data-sync]", HTMLInputElement)) {
  control.addEventListener("input", () => {
    const id = control.dataset.sync;
    if (!id) return;
    const other = inputById(
      control.dataset.role === "range" ? id : `${id}-range`,
    );
    if (control.value !== "") other.value = control.value;
    if (id === "height" || id === "ascent") {
      saveFeedback = "";
      saveFeedbackKind = "";
    }
    scheduleRender();
  });
}
for (const control of [
  ...queryElements("select", HTMLSelectElement),
  ...queryElements("textarea", HTMLTextAreaElement),
  ...queryElements(
    "input:not([data-sync]):not([data-transient]):not(#zoom-input)",
    HTMLInputElement,
  ),
]) {
  control.addEventListener("input", scheduleRender);
}
buttonById("text-rgba-swatch").addEventListener("click", () =>
  openRgbaPicker("text-rgba"),
);
buttonById("background-rgba-swatch").addEventListener("click", () =>
  openRgbaPicker("background-rgba"),
);
for (const id of ["text-rgba", "background-rgba"] as const) {
  inputById(id).addEventListener("input", () => {
    if (activeRgbaTarget !== id) return;
    const parsed = helpers.parseRgba(inputById(id).value);
    if (parsed) setRgbaPickerState(parsed);
  });
}
inputById("rgba-picker-color").addEventListener("input", () => {
  const selected = helpers.parseRgba(inputById("rgba-picker-color").value);
  if (!selected) return;
  inputById("rgba-picker-r").value = String(selected.r);
  inputById("rgba-picker-g").value = String(selected.g);
  inputById("rgba-picker-b").value = String(selected.b);
  updateRgbaTarget();
});
for (const channel of ["r", "g", "b", "a"]) {
  inputById(`rgba-picker-${channel}`).addEventListener(
    "change",
    updateRgbaTarget,
  );
}
inputById("rgba-picker-alpha").addEventListener("input", () => {
  inputById("rgba-picker-a").value = String(
    Math.round(number("rgba-picker-alpha") * 10) / 1000,
  );
  updateRgbaTarget();
});
buttonById("rgba-picker-close").addEventListener("click", closeRgbaPicker);
buttonById("rgba-picker-done").addEventListener("click", closeRgbaPicker);
document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const picker = byId("rgba-picker");
  if (!(target instanceof Element) || picker.hidden) return;
  if (!picker.contains(target) && !target.closest(".rgba-swatch"))
    closeRgbaPicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !byId("rgba-picker").hidden) closeRgbaPicker();
});
window.addEventListener("resize", positionRgbaPicker);
const sidebar = document.querySelector("aside");
if (!sidebar) throw new TypeError(Messages.web.image.preview.text0018);
sidebar.addEventListener("scroll", positionRgbaPicker, { passive: true });
buttonById("reset-config").addEventListener("click", () => {
  if (
    savedHeight === undefined ||
    savedAscent === undefined ||
    !Number.isFinite(savedHeight) ||
    !Number.isFinite(savedAscent)
  )
    return;
  setPair("height", savedHeight);
  setPair("ascent", savedAscent);
  saveFeedback = "";
  saveFeedbackKind = "";
  render();
});
buttonById("save-config").addEventListener("click", () => {
  if (!payload?.canSaveConfiguration) return;
  saving = true;
  saveFeedback = "";
  saveFeedbackKind = "";
  updateSaveState();
  vscode.postMessage({
    type: "saveConfig",
    height: integer("height"),
    ascent: integer("ascent"),
  });
});
buttonById("fit-view").addEventListener("click", fitView);
buttonById("zoom-out").addEventListener("click", () => {
  setManualScale(
    helpers.stepZoomPercent(Math.round(viewScale * 100), -1) / 100,
  );
});
buttonById("zoom-in").addEventListener("click", () => {
  setManualScale(helpers.stepZoomPercent(Math.round(viewScale * 100), 1) / 100);
});
buttonById("zoom-value").addEventListener("click", beginZoomEdit);
inputById("zoom-input").addEventListener("blur", commitZoomEdit);
inputById("zoom-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitZoomEdit();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelZoomEdit();
  }
});
buttonById("open-texture").addEventListener("click", () =>
  vscode.postMessage({ type: "openTexture" }),
);
viewport.addEventListener("dblclick", fitView);
viewport.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const oldRect = canvas.getBoundingClientRect();
    const logicalX = (event.clientX - oldRect.left) / viewScale;
    const logicalY = (event.clientY - oldRect.top) / viewScale;
    const next = helpers.wheelScale(viewScale, event.deltaY);
    setManualScale(next);
    requestAnimationFrame(() => {
      const nextRect = canvas.getBoundingClientRect();
      viewport.scrollLeft += nextRect.left + logicalX * next - event.clientX;
      viewport.scrollTop += nextRect.top + logicalY * next - event.clientY;
    });
  },
  { passive: false },
);
new ResizeObserver(() => {
  if (fitMode) updateViewScale();
}).observe(viewport);
window.setInterval(() => {
  caretVisible = !caretVisible;
  if (payload && texture && selectById("mode").value === "chat")
    drawChat(metrics(), 960, 540);
}, 380);

async function receivePreview(nextPayload: ImagePreviewPayload): Promise<void> {
  const generation = ++loadGeneration;
  const nextIdentity = `${nextPayload.source}:${nextPayload.sourceOffset}:${nextPayload.id}`;
  const sameImage = nextIdentity === identity;
  const loaded = await Promise.all([
    loadImage(nextPayload.textureUrl),
    loadImage(nextPayload.vanilla.generic54),
    loadImage(nextPayload.vanilla.anvil),
    loadImage(nextPayload.vanilla.textField),
    chatBackgroundPromise,
    document.fonts.load(
      '32px "MinecraftUnicode"',
      Messages.web.image.preview.text0012,
    ),
    document.fonts.load('28px "MinecraftPreview"', "Steve"),
  ]);
  if (generation !== loadGeneration) return;
  payload = nextPayload;
  [texture, generic54, anvil, textField, chatBackgrounds] = loaded;
  identity = nextIdentity;
  savedHeight = nextPayload.height;
  savedAscent = nextPayload.ascent;
  saving = false;
  saveFeedback = "";
  saveFeedbackKind = "";
  byId("image-id").textContent = nextPayload.id;
  byId("meta").textContent = Messages.web.image.preview.text0013(
    nextPayload.pack,
    nextPayload.font,
  );
  const maxRow = Math.max(0, nextPayload.rows - 1);
  const maxColumn = Math.max(0, nextPayload.columns - 1);
  const dimensionLimit = Math.max(
    512,
    Math.abs(nextPayload.height) * 4,
    Math.abs(nextPayload.ascent),
  );
  setPairBounds("row", 0, maxRow);
  setPairBounds("col", 0, maxColumn);
  setPairBounds("height", -dimensionLimit, dimensionLimit);
  setPairBounds("ascent", -dimensionLimit, dimensionLimit);
  if (!sameImage) {
    setPair("row", nextPayload.row);
    setPair("col", nextPayload.column);
    setPair("height", nextPayload.height);
    setPair("ascent", nextPayload.ascent);
    fitMode = nextPayload.defaultZoom === 0;
    if (!fitMode) viewScale = helpers.clamp(nextPayload.defaultZoom, 0.1, 16);
  } else {
    setPair("row", helpers.clamp(integer("row"), 0, maxRow));
    setPair("col", helpers.clamp(integer("col"), 0, maxColumn));
  }
  render();
  if (fitMode) requestAnimationFrame(fitView);
  const unicodeFontLoaded =
    loaded[5].length > 0 &&
    loaded[6].length > 0 &&
    document.fonts.check(
      '32px "MinecraftUnicode"',
      Messages.web.image.preview.text0014,
    ) &&
    document.fonts.check('28px "MinecraftPreview"', "Steve");
  vscode.postMessage({
    type: "rendered",
    id: nextPayload.id,
    unicodeFontLoaded,
  });
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = decodeImageInboundMessage(event.data);
  if (!message) return;

  switch (message.type) {
    case "saveResult": {
      saving = false;
      saveFeedback =
        message.message ??
        (message.ok
          ? Messages.web.image.preview.text0010
          : Messages.web.image.preview.text0011);
      saveFeedbackKind = message.ok ? "" : "error";
      if (message.ok) {
        savedHeight = Math.trunc(message.height);
        savedAscent = Math.trunc(message.ascent);
      }
      updateSaveState();
      return;
    }
    case "preview":
      void receivePreview(message.payload);
      return;
  }
});

colorValue("text-rgba", fallbackTextColor);
colorValue("background-rgba", fallbackBackgroundColor);
vscode.postMessage({ type: "ready" });
