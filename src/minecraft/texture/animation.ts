import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export interface MinecraftAnimationFrame {
  readonly index: number;
  readonly time: number;
}

export interface MinecraftAnimationLayout {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly frames: readonly MinecraftAnimationFrame[];
  readonly interpolate: boolean;
}

export interface MinecraftAnimationState {
  readonly index: number;
  readonly nextIndex: number;
  readonly subFrame: number;
  readonly duration: number;
  readonly progress: number;
}

export type MinecraftAnimationLayoutResult =
  | { readonly ok: true; readonly layout: MinecraftAnimationLayout }
  | { readonly ok: false; readonly problem: string };

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

// 按客户端规则校验, 避免预览接受游戏会拒绝的动画配置
export function minecraftAnimationMetadataProblem(
  metadata: unknown,
): string | undefined {
  if (!isRecord(metadata))
    return Messages.src.minecraft.texture.animation.text0001;
  for (const key of ["width", "height", "frametime"] as const) {
    if (metadata[key] !== undefined && !positiveInteger(metadata[key]))
      return Messages.src.minecraft.texture.animation.text0002(key);
  }
  if (
    metadata.interpolate !== undefined &&
    typeof metadata.interpolate !== "boolean"
  )
    return Messages.src.minecraft.texture.animation.text0003;
  if (metadata.frames === undefined) return undefined;
  if (!isUnknownArray(metadata.frames))
    return Messages.src.minecraft.texture.animation.text0004;
  for (let index = 0; index < metadata.frames.length; index += 1) {
    const frame = metadata.frames[index];
    if (nonNegativeInteger(frame)) continue;
    if (!isRecord(frame))
      return Messages.src.minecraft.texture.animation.text0005(index);
    if (!nonNegativeInteger(frame.index))
      return Messages.src.minecraft.texture.animation.text0006(index);
    if (frame.time !== undefined && !positiveInteger(frame.time))
      return Messages.src.minecraft.texture.animation.text0007(index);
  }
  return undefined;
}

// 帧尺寸和过滤顺序必须与客户端一致, 否则预览会选错帧
export function minecraftAnimationLayout(
  metadata: unknown,
  imageWidth: number,
  imageHeight: number,
): MinecraftAnimationLayoutResult {
  const problem = minecraftAnimationMetadataProblem(metadata);
  if (problem) return { ok: false, problem };
  if (!isRecord(metadata))
    return {
      ok: false,
      problem: Messages.src.minecraft.texture.animation.text0008,
    };
  if (!positiveInteger(imageWidth) || !positiveInteger(imageHeight)) {
    return {
      ok: false,
      problem: Messages.src.minecraft.texture.animation.text0009,
    };
  }

  const configuredWidth = positiveInteger(metadata.width)
    ? metadata.width
    : undefined;
  const configuredHeight = positiveInteger(metadata.height)
    ? metadata.height
    : undefined;
  const squareSize = Math.min(imageWidth, imageHeight);
  const frameWidth =
    configuredWidth ??
    (configuredHeight === undefined ? squareSize : imageWidth);
  const frameHeight =
    configuredHeight ??
    (configuredWidth === undefined ? squareSize : imageHeight);
  if (imageWidth % frameWidth !== 0 || imageHeight % frameHeight !== 0) {
    return {
      ok: false,
      problem: Messages.src.minecraft.texture.animation.text0010(
        imageWidth,
        imageHeight,
        frameWidth,
        frameHeight,
      ),
    };
  }

  const frameCount = (imageWidth / frameWidth) * (imageHeight / frameHeight);
  const defaultFrameTime = positiveInteger(metadata.frametime)
    ? metadata.frametime
    : 1;
  const rawFrames: readonly unknown[] | undefined = isUnknownArray(
    metadata.frames,
  )
    ? metadata.frames
    : undefined;
  let frames: MinecraftAnimationFrame[];
  if (rawFrames === undefined) {
    frames = Array.from({ length: frameCount }, (_, index) => ({
      index,
      time: defaultFrameTime,
    }));
  } else {
    frames = rawFrames
      .map((frame) =>
        isRecord(frame)
          ? {
              index: nonNegativeInteger(frame.index) ? frame.index : 0,
              time: positiveInteger(frame.time) ? frame.time : defaultFrameTime,
            }
          : {
              index: nonNegativeInteger(frame) ? frame : 0,
              time: defaultFrameTime,
            },
      )
      .filter((frame) => frame.index < frameCount);
  }
  // 没有可用帧时仍保留左上角帧, 与客户端静态显示一致
  if (frames.length === 0) frames = [{ index: 0, time: defaultFrameTime }];
  return {
    ok: true,
    layout: {
      frameWidth,
      frameHeight,
      columns: imageWidth / frameWidth,
      rows: imageHeight / frameHeight,
      frames,
      interpolate: metadata.interpolate === true,
    },
  };
}

  // 每 50 毫秒推进一次, 和游戏每秒更新 20 次保持一致
export function minecraftAnimationState(
  layout: MinecraftAnimationLayout,
  elapsedMilliseconds: number,
): MinecraftAnimationState {
  const cycleDuration = layout.frames.reduce(
    (sum, frame) => sum + frame.time,
    0,
  );
  let cycleTick =
    cycleDuration > 0
      ? Math.floor(Math.max(0, Number(elapsedMilliseconds) || 0) / 50) %
        cycleDuration
      : 0;
  let framePosition = 0;
  for (; framePosition < layout.frames.length - 1; framePosition += 1) {
    const duration = layout.frames[framePosition]?.time ?? 1;
    if (cycleTick < duration) break;
    cycleTick -= duration;
  }
  const current = layout.frames[framePosition] ?? { index: 0, time: 1 };
  return {
    index: current.index,
    nextIndex: (
      layout.frames[(framePosition + 1) % layout.frames.length] ?? current
    ).index,
    subFrame: cycleTick,
    duration: current.time,
    progress: cycleTick / current.time,
  };
}
