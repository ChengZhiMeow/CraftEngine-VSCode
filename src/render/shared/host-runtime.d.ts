declare module "@craftengine/host/entity-dimensions" {
  export const MINECRAFT_26_2_ENTITY_DIMENSIONS: Readonly<
    Record<
      string,
      Readonly<{
        width: number;
        height: number;
        fixed: boolean;
        passengerAttachment: number;
      }>
    >
  >;
}

declare module "@craftengine/host/texture-animation" {
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

  export type MinecraftAnimationLayoutResult =
    | Readonly<{ ok: true; layout: MinecraftAnimationLayout }>
    | Readonly<{ ok: false; problem: string }>;

  export function minecraftAnimationLayout(
    metadata: unknown,
    imageWidth: number,
    imageHeight: number,
  ): MinecraftAnimationLayoutResult;

  export function minecraftAnimationState(
    layout: MinecraftAnimationLayout,
    elapsedMilliseconds: number,
  ): Readonly<{
    index: number;
    nextIndex: number;
    subFrame: number;
    duration: number;
    progress: number;
  }>;
}

declare module "minimessage-js/dist/minimessage.esm.js" {
  export * from "minimessage-js";
}
