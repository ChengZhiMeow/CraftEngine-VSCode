import { isRecord, isUnknownArray } from "../shared/runtime.js";

export interface MergedLegacyModel extends Record<string, unknown> {
  readonly textures?: Readonly<Record<string, unknown>>;
  readonly display?: Readonly<Record<string, unknown>>;
  readonly elements?: readonly unknown[];
  readonly __id: string;
  readonly __generated: boolean;
}

export function namespaced(value: unknown, fallback = "minecraft"): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.includes(":") ? value : `${fallback}:${value}`;
}

export function mergeLegacyModel(
  models: Readonly<Record<string, unknown>> | null | undefined,
  id: string,
  stack: readonly string[] = [],
): MergedLegacyModel | undefined {
  const canonical = namespaced(id);
  if (!canonical || stack.includes(canonical)) return undefined;
  const own = models?.[canonical];
  if (!isRecord(own)) return undefined;

  let parent: Readonly<Record<string, unknown>> | undefined = {};
  if (typeof own.parent === "string") {
    if (own.parent.startsWith("builtin/")) {
      parent = {
        __generated:
          own.parent.includes("generated") || own.parent.includes("handheld"),
      };
    } else {
      parent = mergeLegacyModel(models, namespaced(own.parent), [
        ...stack,
        canonical,
      ]);
      if (!parent) return undefined;
    }
  }

  return {
    ...parent,
    ...own,
    textures: {
      ...(isRecord(parent.textures) ? parent.textures : {}),
      ...(isRecord(own.textures) ? own.textures : {}),
    },
    display: {
      ...(isRecord(parent.display) ? parent.display : {}),
      ...(isRecord(own.display) ? own.display : {}),
    },
    ...(isUnknownArray(own.elements)
      ? { elements: own.elements }
      : isUnknownArray(parent.elements)
        ? { elements: parent.elements }
        : {}),
    __id: canonical,
    __generated:
      (typeof own.parent === "string" &&
        (own.parent.includes("generated") ||
          own.parent.includes("handheld"))) ||
      parent.__generated === true,
  };
}

function textureToken(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (isRecord(value)) return textureToken(value.sprite);
  return undefined;
}

export function resolveTextureReference(
  model: MergedLegacyModel | undefined,
  value: unknown,
  seen = new Set<string>(),
): string | undefined {
  const token = textureToken(value);
  if (!token) return undefined;
  if (!token.startsWith("#")) return namespaced(token);
  const key = token.slice(1);
  if (!key || seen.has(key)) return undefined;
  seen.add(key);
  return resolveTextureReference(model, model?.textures?.[key], seen);
}

const DIRECT_BLOCK_DISPLAY: Readonly<
  Record<string, Readonly<Record<string, readonly number[]>>>
> = Object.freeze({
  gui: {
    rotation: [30, 225, 0],
    translation: [0, 0, 0],
    scale: [0.625, 0.625, 0.625],
  },
  ground: {
    rotation: [0, 0, 0],
    translation: [0, 3, 0],
    scale: [0.25, 0.25, 0.25],
  },
  fixed: {
    rotation: [0, 0, 0],
    translation: [0, 0, 0],
    scale: [0.5, 0.5, 0.5],
  },
  on_shelf: { rotation: [0, 180, 0], translation: [0, 0, 0], scale: [1, 1, 1] },
  thirdperson_righthand: {
    rotation: [75, 45, 0],
    translation: [0, 2.5, 0],
    scale: [0.375, 0.375, 0.375],
  },
  firstperson_righthand: {
    rotation: [0, 45, 0],
    translation: [0, 0, 0],
    scale: [0.4, 0.4, 0.4],
  },
  firstperson_lefthand: {
    rotation: [0, 225, 0],
    translation: [0, 0, 0],
    scale: [0.4, 0.4, 0.4],
  },
});

export function displayTransformFor(
  model: MergedLegacyModel | Readonly<Record<string, unknown>> | undefined,
  context: string,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(model)) return undefined;
  const display = isRecord(model.display) ? model.display : {};
  const direct = display[context];
  if (isRecord(direct)) return direct;
  const rightHandContext =
    context === "thirdperson_lefthand"
      ? "thirdperson_righthand"
      : context === "firstperson_lefthand"
        ? "firstperson_righthand"
        : undefined;
  const rightHand = rightHandContext ? display[rightHandContext] : undefined;
  if (isRecord(rightHand)) return rightHand;
  if (model["craftengine:direct_render"] === true) {
    return (
      DIRECT_BLOCK_DISPLAY[context] ||
      (rightHandContext ? DIRECT_BLOCK_DISPLAY[rightHandContext] : undefined)
    );
  }
  return undefined;
}

  // 模型位移要除以 8, 除以 16 会让模型只移动一半
export function displayTransformValues(
  transform: Readonly<Record<string, unknown>> | undefined,
  leftHand = false,
): Readonly<{
  rotation: readonly number[];
  translation: readonly number[];
  scale: readonly number[];
}> {
  const rotation = isUnknownArray(transform?.rotation)
    ? transform.rotation
    : [0, 0, 0];
  const translation = isUnknownArray(transform?.translation)
    ? transform.translation
    : [0, 0, 0];
  const scale = isUnknownArray(transform?.scale) ? transform.scale : [1, 1, 1];
  return {
    rotation: rotation.map(
      (value, index) => (Number(value) || 0) * (leftHand && index > 0 ? -1 : 1),
    ),
    translation: translation.map((value, index) =>
      Math.max(
        -10,
        Math.min(
          10,
          ((Number(value) || 0) * (leftHand && index === 0 ? -1 : 1)) / 8,
        ),
      ),
    ),
    scale: scale.map((value) => Math.max(-4, Math.min(4, Number(value) || 0))),
  };
}

export function bakedFaceVertices(
  direction: string,
  from: readonly number[],
  to: readonly number[],
): readonly (readonly number[])[] {
  const [x0 = 0, y0 = 0, z0 = 0] = from.map(Number);
  const [x1 = 0, y1 = 0, z1 = 0] = to.map(Number);
  if (direction === "down")
    return [
      [x0, y0, z1],
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
    ];
  if (direction === "up")
    return [
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
    ];
  if (direction === "north")
    return [
      [x1, y1, z0],
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
    ];
  if (direction === "south")
    return [
      [x0, y1, z1],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
    ];
  if (direction === "west")
    return [
      [x0, y1, z0],
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
    ];
  return [
    [x1, y1, z1],
    [x1, y0, z1],
    [x1, y0, z0],
    [x1, y1, z0],
  ];
}

export function bakedFaceUvs(
  uv: readonly number[],
  rotation?: unknown,
): readonly (readonly number[])[] {
  const [u0 = 0, v0 = 0, u1 = 16, v1 = 16] = uv.map(Number);
  const values = [
    [u0, 16 - v0],
    [u0, 16 - v1],
    [u1, 16 - v1],
    [u1, 16 - v0],
  ];
  const turns = ((((Number(rotation) || 0) / 90) % 4) + 4) % 4;
  return values.map((_, index) =>
    values[(index + turns) % 4]!.map((value) => value / 16),
  );
}
