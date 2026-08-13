import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";
import * as vscode from "vscode";

import type { ItemDefinition } from "../../config/item/model.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import type {
  ResourceFile,
  ResourceFileCatalog,
  ResourceFileKind,
} from "../../resources/model.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { PLAYER_SKIN_PNG } from "../shared/playerSkin.js";

const ICON_SIZE = 32;
const ICON_RENDERER_REVISION = "7";

type Vector3 = [number, number, number];
type Vector2 = [number, number];

interface ModelLayer {
  readonly model: string;
  readonly tints: readonly unknown[];
  readonly special?: Readonly<Record<string, unknown>>;
  /** 先应用内层变换再应用外层变换, 反过来会改变模型位置 */
  readonly transformations: readonly unknown[];
}

interface WorkspaceIconSource {
  readonly key: string;
  readonly item: ItemDefinition;
  readonly resources: ResourceFileCatalog;
}

interface MergedModel {
  readonly id: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly display: Readonly<Record<string, unknown>>;
  readonly elements?: readonly unknown[];
  readonly generated: boolean;
  readonly guiLight: string;
}

interface ProjectedVertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly u: number;
  readonly v: number;
}

function modelType(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== "string") return "";
  const separator = value.type.indexOf(":");
  return separator < 0 ? value.type : value.type.slice(separator + 1);
}

function defaultLayers(
  value: unknown,
  outerTransformations: readonly unknown[] = [],
): ModelLayer[] {
  if (isUnknownArray(value))
    return value.flatMap((entry) => defaultLayers(entry, outerTransformations));
  if (typeof value === "string")
    return [{ model: value, tints: [], transformations: outerTransformations }];
  if (!isRecord(value)) return [];
  const transformations =
    value.transformation === undefined
      ? outerTransformations
      : [value.transformation, ...outerTransformations];
  const type = modelType(value);
  switch (type) {
    case "model": {
      const model = value.model ?? value.path;
      return typeof model === "string"
        ? [
            {
              model,
              tints: isUnknownArray(value.tints) ? value.tints : [],
              transformations,
            },
          ]
        : [];
    }
    case "special": {
      const model = value.base ?? value.path;
      return typeof model === "string"
        ? [
            {
              model,
              tints: [],
              transformations,
              ...(isRecord(value.model) ? { special: value.model } : {}),
            },
          ]
        : [];
    }
    case "condition":
      return defaultLayers(
        value.on_false ??
          value["on-false"] ??
          value.on_true ??
          value["on-true"],
        transformations,
      );
    case "range_dispatch":
      return defaultLayers(
        value.fallback ??
          (isUnknownArray(value.entries) && isRecord(value.entries[0])
            ? value.entries[0].model
            : undefined),
        transformations,
      );
    case "select": {
      if (
        String(value.property).endsWith("display_context") &&
        isUnknownArray(value.cases)
      ) {
        const selected = value.cases.find(
          (entry) =>
            isRecord(entry) &&
            (entry.when === "gui" ||
              (isUnknownArray(entry.when) && entry.when.includes("gui"))),
        );
        if (isRecord(selected))
          return defaultLayers(selected.model, transformations);
      }
      return defaultLayers(
        value.fallback ??
          (isUnknownArray(value.cases) && isRecord(value.cases[0])
            ? value.cases[0].model
            : undefined),
        transformations,
      );
    }
    case "composite": {
      const models = isUnknownArray(value.models)
        ? value.models
        : [value.models];
      return models.flatMap((entry) => defaultLayers(entry, transformations));
    }
    default:
      return [];
  }
}

function resolveTextureReference(
  textures: Readonly<Record<string, string>>,
  value: string,
): string | undefined {
  let current =
    !value.startsWith("#") && Object.hasOwn(textures, value)
      ? `#${value}`
      : value;
  const visited = new Set<string>();
  while (current.startsWith("#")) {
    const key = current.slice(1);
    if (visited.has(key)) return undefined;
    visited.add(key);
    const next = textures[key];
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function vector(value: unknown, fallback: Vector3): Vector3 {
  return isUnknownArray(value) && value.length >= 3
    ? [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0]
    : fallback;
}

function rotateX([x, y, z]: Vector3, angle: number): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [x, y * cosine - z * sine, y * sine + z * cosine];
}

function rotateY([x, y, z]: Vector3, angle: number): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [x * cosine + z * sine, y, -x * sine + z * cosine];
}

function rotateZ([x, y, z]: Vector3, angle: number): Vector3 {
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  return [x * cosine - y * sine, x * sine + y * cosine, z];
}

function rotateEuler(vectorValue: Vector3, degrees: Vector3): Vector3 {
  const radians: Vector3 = [
    (degrees[0] * Math.PI) / 180,
    (degrees[1] * Math.PI) / 180,
    (degrees[2] * Math.PI) / 180,
  ];
  return rotateZ(
    rotateY(rotateX(vectorValue, radians[0]), radians[1]),
    radians[2],
  );
}

function rotateElement(point: Vector3, rotation: unknown): Vector3 {
  if (!isRecord(rotation)) return point;
  const origin = vector(rotation.origin, [8, 8, 8]);
  const relative: Vector3 = [
    point[0] - origin[0],
    point[1] - origin[1],
    point[2] - origin[2],
  ];
  const angle = ((Number(rotation.angle) || 0) * Math.PI) / 180;
  let rotated =
    rotation.axis === "x"
      ? rotateX(relative, angle)
      : rotation.axis === "y"
        ? rotateY(relative, angle)
        : rotateZ(relative, angle);
  if (rotation.rescale === true) {
    const factor =
      Math.abs(Math.cos(angle)) < 0.0001 ? 1 : 1 / Math.abs(Math.cos(angle));
    if (rotation.axis !== "x")
      rotated = [rotated[0] * factor, rotated[1], rotated[2]];
    if (rotation.axis !== "y")
      rotated = [rotated[0], rotated[1] * factor, rotated[2]];
    if (rotation.axis !== "z")
      rotated = [rotated[0], rotated[1], rotated[2] * factor];
  }
  return [
    rotated[0] + origin[0],
    rotated[1] + origin[1],
    rotated[2] + origin[2],
  ];
}

function transformForGui(point: Vector3, transform: unknown): Vector3 {
  const normalized: Vector3 = [
    (point[0] - 8) / 8,
    (point[1] - 8) / 8,
    (point[2] - 8) / 8,
  ];
  if (!isRecord(transform)) return normalized;
  const scale = vector(transform.scale, [1, 1, 1]);
  const scaled: Vector3 = [
    normalized[0] * scale[0],
    normalized[1] * scale[1],
    normalized[2] * scale[2],
  ];
  const rotated = rotateEuler(scaled, vector(transform.rotation, [0, 0, 0]));
  const translation = vector(transform.translation, [0, 0, 0]);
  return [
    rotated[0] + translation[0] / 8,
    rotated[1] + translation[1] / 8,
    rotated[2] + translation[2] / 8,
  ];
}

function rotateQuaternion([x, y, z]: Vector3, value: unknown): Vector3 {
  if (!isUnknownArray(value) || value.length < 4) return [x, y, z];
  const qx = Number(value[0]) || 0;
  const qy = Number(value[1]) || 0;
  const qz = Number(value[2]) || 0;
  const qw = Number(value[3]) || 0;
  const length = Math.hypot(qx, qy, qz, qw);
  if (length < 0.000001) return [x, y, z];
  const nx = qx / length;
  const ny = qy / length;
  const nz = qz / length;
  const nw = qw / length;
  const tx = 2 * (ny * z - nz * y);
  const ty = 2 * (nz * x - nx * z);
  const tz = 2 * (nx * y - ny * x);
  return [
    x + nw * tx + (ny * tz - nz * ty),
    y + nw * ty + (nz * tx - nx * tz),
    z + nw * tz + (nx * ty - ny * tx),
  ];
}

/** 先平移, 再左旋转, 再缩放, 最后右旋转 */
function transformSpecialPoint(
  point: Vector3,
  transformation: unknown,
): Vector3 {
  if (isUnknownArray(transformation) && transformation.length === 16) {
    const matrix = transformation.map(Number);
    const x = point[0] / 16;
    const y = point[1] / 16;
    const z = point[2] / 16;
    return [
      ((matrix[0] ?? 1) * x +
        (matrix[1] ?? 0) * y +
        (matrix[2] ?? 0) * z +
        (matrix[3] ?? 0)) *
        16,
      ((matrix[4] ?? 0) * x +
        (matrix[5] ?? 1) * y +
        (matrix[6] ?? 0) * z +
        (matrix[7] ?? 0)) *
        16,
      ((matrix[8] ?? 0) * x +
        (matrix[9] ?? 0) * y +
        (matrix[10] ?? 1) * z +
        (matrix[11] ?? 0)) *
        16,
    ];
  }
  if (!isRecord(transformation)) return point;
  let transformed: Vector3 = [point[0] / 16, point[1] / 16, point[2] / 16];
  transformed = rotateQuaternion(
    transformed,
    transformation.right_rotation ?? transformation["right-rotation"],
  );
  const scale = vector(transformation.scale, [1, 1, 1]);
  transformed = [
    transformed[0] * scale[0],
    transformed[1] * scale[1],
    transformed[2] * scale[2],
  ];
  transformed = rotateQuaternion(
    transformed,
    transformation.left_rotation ?? transformation["left-rotation"],
  );
  const translation = vector(transformation.translation, [0, 0, 0]);
  return [
    (transformed[0] + translation[0]) * 16,
    (transformed[1] + translation[1]) * 16,
    (transformed[2] + translation[2]) * 16,
  ];
}

function transformLayerPoint(
  point: Vector3,
  transformations: readonly unknown[],
): Vector3 {
  let transformed = point;
  for (const transformation of transformations)
    transformed = transformSpecialPoint(transformed, transformation);
  return transformed;
}

function defaultUv(
  direction: string,
  from: Vector3,
  to: Vector3,
): [number, number, number, number] {
  if (direction === "up" || direction === "down")
    return [from[0], from[2], to[0], to[2]];
  if (direction === "east" || direction === "west")
    return [from[2], 16 - to[1], to[2], 16 - from[1]];
  return [from[0], 16 - to[1], to[0], 16 - from[1]];
}

function faceVertices(
  direction: string,
  from: Vector3,
  to: Vector3,
): Vector3[] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  // 顶点顺序要和游戏生成方块面时一致, 否则方块面会镜像
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

function rotatedUv(uv: readonly number[], rotation: unknown): Vector2[] {
  const [u0 = 0, v0 = 0, u1 = 16, v1 = 16] = uv.map(Number);
  // 贴图四角按左上 左下 右下 右上排列, 采样从左下开始所以纵向坐标要反转
  const values: Vector2[] = [
    [u0, 16 - v0],
    [u0, 16 - v1],
    [u1, 16 - v1],
    [u1, 16 - v0],
  ];
  const turns = ((((Number(rotation) || 0) / 90) % 4) + 4) % 4;
  return values.map((_, index) => {
    const selected = values[(index + turns) % 4] ?? values[0]!;
    return [selected[0] / 16, selected[1] / 16];
  });
}

function tintColor(tint: unknown): number {
  if (!isRecord(tint)) return 0xffffff;
  const type = modelType(tint);
  const candidate = type === "constant" ? tint.value : tint.default;
  if (typeof candidate === "number") return candidate & 0xffffff;
  if (isUnknownArray(candidate) && candidate.length >= 3) {
    const multiplier = candidate.some((entry) => Number(entry) > 1) ? 1 : 255;
    return (
      ((Math.round(Number(candidate[0]) * multiplier) & 0xff) << 16) |
      ((Math.round(Number(candidate[1]) * multiplier) & 0xff) << 8) |
      (Math.round(Number(candidate[2]) * multiplier) & 0xff)
    );
  }
  if (type === "grass") return 0x7cbd6b;
  if (type === "potion") return 0x385dc6;
  if (type === "firework") return 0xb030d0;
  return 0xffffff;
}

function dyeColor(value: unknown): number {
  const colors: Readonly<Record<string, number>> = {
    white: 0xf9fffe,
    orange: 0xf9801d,
    magenta: 0xc74ebd,
    light_blue: 0x3ab3da,
    yellow: 0xfed83d,
    lime: 0x80c71f,
    pink: 0xf38baa,
    gray: 0x474f52,
    light_gray: 0x9d9d97,
    cyan: 0x169c9c,
    purple: 0x8932b8,
    blue: 0x3c44aa,
    brown: 0x835432,
    green: 0x5e7c16,
    red: 0xb02e26,
    black: 0x1d1d21,
  };
  return typeof value === "string" ? (colors[value] ?? 0xffffff) : 0xffffff;
}

function multiplyColor(
  red: number,
  green: number,
  blue: number,
  tint: number,
  shade = 1,
): [number, number, number] {
  return [
    Math.round(((red * ((tint >> 16) & 0xff)) / 255) * shade),
    Math.round(((green * ((tint >> 8) & 0xff)) / 255) * shade),
    Math.round(((blue * (tint & 0xff)) / 255) * shade),
  ];
}

function shadeFor(direction: string, guiLight: string): number {
  if (guiLight === "front") return 1;
  if (direction === "up") return 1;
  if (direction === "down") return 0.5;
  if (direction === "north" || direction === "south") return 0.8;
  return 0.6;
}

function blendPixel(
  target: PNG,
  x: number,
  y: number,
  color: readonly number[],
): void {
  const offset = (y * target.width + x) * 4;
  const sourceAlpha = (color[3] ?? 255) / 255;
  if (sourceAlpha <= 0) return;
  const targetAlpha = (target.data[offset + 3] ?? 0) / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    target.data[offset + channel] = Math.round(
      ((color[channel] ?? 0) * sourceAlpha +
        (target.data[offset + channel] ?? 0) *
          targetAlpha *
          (1 - sourceAlpha)) /
        outputAlpha,
    );
  }
  target.data[offset + 3] = Math.round(outputAlpha * 255);
}

function sampleTexture(
  texture: PNG,
  u: number,
  v: number,
): [number, number, number, number] {
  const frameHeight = Math.min(texture.width, texture.height);
  const normalizedU = ((u % 1) + 1) % 1;
  const normalizedV = ((v % 1) + 1) % 1;
  const x = Math.min(
    texture.width - 1,
    Math.floor(normalizedU * texture.width),
  );
  const y = Math.min(
    frameHeight - 1,
    Math.floor((1 - normalizedV) * frameHeight),
  );
  const offset = (y * texture.width + x) * 4;
  return [
    texture.data[offset] ?? 0,
    texture.data[offset + 1] ?? 0,
    texture.data[offset + 2] ?? 0,
    texture.data[offset + 3] ?? 0,
  ];
}

function triangleArea(
  first: ProjectedVertex,
  second: ProjectedVertex,
  third: ProjectedVertex,
): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function drawTriangle(
  target: PNG,
  depth: Float64Array,
  texture: PNG,
  vertices: readonly [ProjectedVertex, ProjectedVertex, ProjectedVertex],
  tint: number,
  shade: number,
): void {
  const [first, second, third] = vertices;
  const area = triangleArea(first, second, third);
  if (Math.abs(area) < 0.00001) return;
  const minimumX = Math.max(
    0,
    Math.floor(Math.min(first.x, second.x, third.x)),
  );
  const maximumX = Math.min(
    target.width - 1,
    Math.ceil(Math.max(first.x, second.x, third.x)),
  );
  const minimumY = Math.max(
    0,
    Math.floor(Math.min(first.y, second.y, third.y)),
  );
  const maximumY = Math.min(
    target.height - 1,
    Math.ceil(Math.max(first.y, second.y, third.y)),
  );
  for (let y = minimumY; y <= maximumY; y += 1)
    for (let x = minimumX; x <= maximumX; x += 1) {
      const point = { x: x + 0.5, y: y + 0.5, z: 0, u: 0, v: 0 };
      const firstWeight = triangleArea(second, third, point) / area;
      const secondWeight = triangleArea(third, first, point) / area;
      const thirdWeight = 1 - firstWeight - secondWeight;
      if (
        firstWeight < -0.0001 ||
        secondWeight < -0.0001 ||
        thirdWeight < -0.0001
      )
        continue;
      const z =
        first.z * firstWeight + second.z * secondWeight + third.z * thirdWeight;
      const depthOffset = y * target.width + x;
      if (z < (depth[depthOffset] ?? Number.NEGATIVE_INFINITY) - 0.00001)
        continue;
      const u =
        first.u * firstWeight + second.u * secondWeight + third.u * thirdWeight;
      const v =
        first.v * firstWeight + second.v * secondWeight + third.v * thirdWeight;
      const sampled = sampleTexture(texture, u, v);
      if (sampled[3] === 0) continue;
      const color = multiplyColor(
        sampled[0],
        sampled[1],
        sampled[2],
        tint,
        shade,
      );
      blendPixel(target, x, y, [...color, sampled[3]]);
      depth[depthOffset] = z;
    }
}

function drawFlatLayer(target: PNG, texture: PNG, tint: number): void {
  const frameHeight = Math.min(texture.width, texture.height);
  for (let y = 0; y < target.height; y += 1)
    for (let x = 0; x < target.width; x += 1) {
      const sourceX = Math.min(
        texture.width - 1,
        Math.floor((x * texture.width) / target.width),
      );
      const sourceY = Math.min(
        frameHeight - 1,
        Math.floor((y * frameHeight) / target.height),
      );
      const offset = (sourceY * texture.width + sourceX) * 4;
      const color = multiplyColor(
        texture.data[offset] ?? 0,
        texture.data[offset + 1] ?? 0,
        texture.data[offset + 2] ?? 0,
        tint,
      );
      blendPixel(target, x, y, [...color, texture.data[offset + 3] ?? 0]);
    }
}

type AtlasRectangle = readonly [number, number, number, number];

function cuboidAtlasFaces(
  textureX: number,
  textureY: number,
  width: number,
  height: number,
  depth: number,
): Readonly<Record<string, AtlasRectangle>> {
  return {
    west: [
      textureX,
      textureY + depth,
      textureX + depth,
      textureY + depth + height,
    ],
    north: [
      textureX + depth,
      textureY + depth,
      textureX + depth + width,
      textureY + depth + height,
    ],
    east: [
      textureX + depth + width,
      textureY + depth,
      textureX + depth + width + depth,
      textureY + depth + height,
    ],
    south: [
      textureX + depth + width + depth,
      textureY + depth,
      textureX + depth + width + depth + width,
      textureY + depth + height,
    ],
    down: [
      textureX + depth,
      textureY,
      textureX + depth + width,
      textureY + depth,
    ],
    up: [
      textureX + depth + width,
      textureY + depth,
      textureX + depth + width + width,
      textureY,
    ],
  };
}

function entityFaceVertices(
  direction: string,
  from: Vector3,
  to: Vector3,
): Vector3[] {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  // 实体面和方块面的顶点顺序不同, 混用会让实体面翻转
  if (direction === "down")
    return [
      [x1, y0, z1],
      [x0, y0, z1],
      [x0, y0, z0],
      [x1, y0, z0],
    ];
  if (direction === "up")
    return [
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y1, z1],
      [x1, y1, z1],
    ];
  if (direction === "west")
    return [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
    ];
  if (direction === "north")
    return [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0],
    ];
  if (direction === "east")
    return [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
    ];
  return [
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
}

function entityAtlasUvs(texture: PNG, rectangle: AtlasRectangle): Vector2[] {
  const [u0, v0, u1, v1] = rectangle;
  // 实体多边形按右上 左上 左下 右下取点, 顺序改了贴图会翻转
  return [
    [u1 / texture.width, 1 - v0 / texture.height],
    [u0 / texture.width, 1 - v0 / texture.height],
    [u0 / texture.width, 1 - v1 / texture.height],
    [u1 / texture.width, 1 - v1 / texture.height],
  ];
}

function transformModelPart(
  point: Vector3,
  offset: Vector3,
  rotation: Vector3 = [0, 0, 0],
): Vector3 {
  const rotated = rotateZ(
    rotateY(rotateX(point, rotation[0]), rotation[1]),
    rotation[2],
  );
  return [
    rotated[0] + offset[0],
    rotated[1] + offset[1],
    rotated[2] + offset[2],
  ];
}

function drawEntityFace(
  target: PNG,
  depthBuffer: Float64Array,
  texture: PNG,
  from: Vector3,
  to: Vector3,
  textureOffset: Vector2,
  direction: string,
  transform: unknown,
  guiLight = "side",
  atlasDimensions?: Vector3,
  localTransformations: readonly unknown[] = [],
  partTransformation?: (point: Vector3) => Vector3,
  tint = 0xffffff,
): void {
  const textureDimensions = atlasDimensions ?? [
    Math.abs(to[0] - from[0]),
    Math.abs(to[1] - from[1]),
    Math.abs(to[2] - from[2]),
  ];
  const rectangle = cuboidAtlasFaces(
    textureOffset[0],
    textureOffset[1],
    textureDimensions[0],
    textureDimensions[1],
    textureDimensions[2],
  )[direction];
  if (!rectangle) return;
  const uvs = entityAtlasUvs(texture, rectangle);
  const projected = entityFaceVertices(direction, from, to).map(
    (point, index): ProjectedVertex => {
      const posed = partTransformation ? partTransformation(point) : point;
      const transformed = transformForGui(
        transformLayerPoint(posed, localTransformations),
        transform,
      );
      const uv = uvs[index] ?? [0, 0];
      return {
        x: target.width / 2 + (transformed[0] * target.width * 7) / 16,
        y: target.height / 2 - (transformed[1] * target.height * 7) / 16,
        z: transformed[2],
        u: uv[0],
        v: uv[1],
      };
    },
  );
  const [first, second, third, fourth] = projected;
  if (!first || !second || !third || !fourth) return;
  const shade = shadeFor(direction, guiLight);
  drawTriangle(
    target,
    depthBuffer,
    texture,
    [first, second, third],
    tint,
    shade,
  );
  drawTriangle(
    target,
    depthBuffer,
    texture,
    [first, third, fourth],
    tint,
    shade,
  );
}

function drawEntityCuboid(
  target: PNG,
  depthBuffer: Float64Array,
  texture: PNG,
  from: Vector3,
  to: Vector3,
  textureOffset: Vector2,
  transform: unknown,
  guiLight = "side",
  atlasDimensions?: Vector3,
  localTransformations: readonly unknown[] = [],
  partTransformation?: (point: Vector3) => Vector3,
  tint = 0xffffff,
): void {
  for (const direction of ["down", "up", "north", "south", "west", "east"]) {
    drawEntityFace(
      target,
      depthBuffer,
      texture,
      from,
      to,
      textureOffset,
      direction,
      transform,
      guiLight,
      atlasDimensions,
      localTransformations,
      partTransformation,
      tint,
    );
  }
}

export class MaterialIconService {
  private readonly cache = new Map<string, vscode.Uri>();
  private readonly modelCache = new Map<string, Promise<MergedModel>>();
  private readonly textureCache = new Map<string, Promise<PNG>>();
  private readonly missing = new Map<number, vscode.Uri>();
  private readonly empty = new Map<number, vscode.Uri>();
  private playerSkinCache: PNG | undefined;

  public constructor(
    private readonly assets: VanillaAssetStore,
    private readonly storageUri: vscode.Uri,
  ) {}

  public async icon(itemId: string, size = ICON_SIZE): Promise<vscode.Uri> {
    const normalizedSize = Math.max(8, Math.round(size));
    const canonical = makeIdentifier(itemId, "minecraft");
    if (canonical === "minecraft:air") return this.emptyIcon(normalizedSize);
    if (normalizedSize !== ICON_SIZE)
      return this.sizedVanillaIcon(canonical, normalizedSize);
    const cached = this.cache.get(canonical);
    if (cached) return cached;
    const icon =
      (await this.resolveIcon(canonical)) ?? (await this.missingIcon());
    this.cache.set(canonical, icon);
    return icon;
  }

/** 高分屏会按设备像素显示位图, 用固定大小的矢量图才能让图标和行高一致 */
  public async editorIcon(
    itemId: string,
    slotSize: number,
  ): Promise<vscode.Uri> {
    const size = Math.max(10, Math.round(slotSize));
    const innerSize = size - 2;
    const source = await this.icon(itemId, innerSize);
    const key = `editor-svg:${makeIdentifier(itemId, "minecraft")}:${size}:${source.toString()}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const digest = createHash("sha1").update(key).digest("hex").slice(0, 12);
    const output = path.join(
      this.storageUri.fsPath,
      "editor-item-icons",
      ICON_RENDERER_REVISION,
      `${size}.${digest}.svg`,
    );
    try {
      await fs.access(output);
    } catch {
      const encoded = (await fs.readFile(source.fsPath)).toString("base64");
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
        `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="#808080"/>`,
        `<image x="1" y="1" width="${innerSize}" height="${innerSize}" image-rendering="pixelated" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${encoded}"/>`,
        "</svg>",
      ].join("");
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, svg, "utf8");
    }
    const icon = vscode.Uri.file(output);
    this.cache.set(key, icon);
    return icon;
  }

  public async editorIconCssUrl(
    itemId: string,
    slotSize: number,
  ): Promise<string> {
    const icon = await this.editorIcon(itemId, slotSize);
    const logicalPath = encodeURI(icon.path.replace(/^\/+/u, ""));
    return `vscode-file://vscode-app/${logicalPath}`;
  }

  public async iconForItem(
    item: ItemDefinition,
    resources: ResourceFileCatalog,
    generation: number,
    size = ICON_SIZE,
  ): Promise<vscode.Uri> {
    const normalizedSize = Math.max(8, Math.round(size));
    if (
      item.model === undefined &&
      item.legacyModel === undefined &&
      item.textures.length === 0 &&
      item.itemModel === undefined
    )
      return this.sizedVanillaIcon(item.clientBoundMaterial, normalizedSize);
    const identity = JSON.stringify({
      id: item.id,
      material: item.clientBoundMaterial,
      itemModel: item.itemModel,
      model: item.model,
      legacyModel: item.legacyModel,
      textures: item.textures,
      root: canonicalPath(item.source.pack.resourcesRoot),
      generation,
      size: normalizedSize,
    });
    const digest = createHash("sha1").update(identity).digest("hex");
    const key = `workspace:${digest}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const icon =
      (await this.resolveWorkspaceIcon(
        { key, item, resources },
        digest,
        normalizedSize,
      )) ?? (await this.missingIcon(normalizedSize));
    this.cache.set(key, icon);
    return icon;
  }

  private async sizedVanillaIcon(
    itemId: string,
    size: number,
  ): Promise<vscode.Uri> {
    const source = await this.icon(itemId);
    if (size === ICON_SIZE) return source;
    const canonical = makeIdentifier(itemId, "minecraft");
    const key = `editor:${canonical}:${size}:${source.toString()}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const bytes = await fs.readFile(source.fsPath);
      const original = PNG.sync.read(bytes);
      const resized = new PNG({ width: size, height: size });
      const scale = Math.min(size / original.width, size / original.height);
      const width = Math.max(1, Math.round(original.width * scale));
      const height = Math.max(1, Math.round(original.height * scale));
      const left = Math.floor((size - width) / 2);
      const top = Math.floor((size - height) / 2);
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
          const sourceX = Math.min(
            original.width - 1,
            Math.floor((x * original.width) / width),
          );
          const sourceY = Math.min(
            original.height - 1,
            Math.floor((y * original.height) / height),
          );
          const sourceOffset = (sourceY * original.width + sourceX) * 4;
          const targetOffset = ((top + y) * size + left + x) * 4;
          original.data.copy(
            resized.data,
            targetOffset,
            sourceOffset,
            sourceOffset + 4,
          );
        }
      const digest = createHash("sha1").update(key).digest("hex").slice(0, 12);
      const output = path.join(
        this.storageUri.fsPath,
        "editor-item-icons",
        ICON_RENDERER_REVISION,
        `${size}.${digest}.png`,
      );
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, PNG.sync.write(resized));
      const icon = vscode.Uri.file(output);
      this.cache.set(key, icon);
      return icon;
    } catch {
      return this.missingIcon(size);
    }
  }

  private async resolveIcon(itemId: string): Promise<vscode.Uri | undefined> {
    try {
      const output = this.outputPath(itemId);
      if (await fs.access(output).then(() => true, () => false))
        return vscode.Uri.file(output);
      const itemPath = await this.assets.resource(itemId, "item-model");
      const itemJson: unknown = JSON.parse(await fs.readFile(itemPath, "utf8"));
      const layers = isRecord(itemJson) ? defaultLayers(itemJson.model) : [];
      if (layers.length === 0) return undefined;
      const icon = new PNG({ width: ICON_SIZE, height: ICON_SIZE });
      const depth = new Float64Array(icon.width * icon.height);
      depth.fill(Number.NEGATIVE_INFINITY);
      let rendered = false;
      for (const layer of layers)
        rendered =
          (await this.renderLayer(icon, layer, undefined, depth)) || rendered;
      if (!rendered) return undefined;
      await fs.mkdir(path.dirname(output), { recursive: true });
      const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, PNG.sync.write(icon));
      try {
        await fs.rename(temporary, output);
      } catch {
        await fs.rm(temporary, { force: true });
      }
      return vscode.Uri.file(output);
    } catch {
      return undefined;
    }
  }

  private async resolveWorkspaceIcon(
    source: WorkspaceIconSource,
    digest: string,
    size: number,
  ): Promise<vscode.Uri | undefined> {
    try {
      const output = this.workspaceOutputPath(source.item.id, digest, size);
      if (await fs.access(output).then(() => true, () => false))
        return vscode.Uri.file(output);
      const icon = new PNG({ width: size, height: size });
      let rendered = false;
      if (source.item.textures.length > 0) {
        for (const rawTexture of source.item.textures) {
          const texture = await this.loadTexture(
            makeIdentifier(rawTexture, source.item.namespace),
            source,
          );
          drawFlatLayer(icon, texture, 0xffffff);
          rendered = true;
        }
      } else {
        const layers = await this.workspaceLayers(source);
        const depth = new Float64Array(icon.width * icon.height);
        depth.fill(Number.NEGATIVE_INFINITY);
        for (const layer of layers)
          rendered =
            (await this.renderLayer(icon, layer, source, depth)) || rendered;
      }
      if (!rendered) return undefined;
      await fs.mkdir(path.dirname(output), { recursive: true });
      const temporary = `${output}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, PNG.sync.write(icon));
      try {
        await fs.rename(temporary, output);
      } catch {
        await fs.rm(temporary, { force: true });
      }
      return vscode.Uri.file(output);
    } catch {
      return undefined;
    }
  }

  private async workspaceLayers(
    source: WorkspaceIconSource,
  ): Promise<ModelLayer[]> {
    const item = source.item;
    if (item.model !== undefined) return defaultLayers(item.model);
    if (item.legacyModel !== undefined) {
      const layers = defaultLayers(item.legacyModel);
      if (layers.length > 0) return layers;
      if (isRecord(item.legacyModel)) {
        const model = item.legacyModel.model ?? item.legacyModel.path;
        if (typeof model === "string")
          return [{ model, tints: [], transformations: [] }];
      }
    }
    if (item.itemModel) {
      const filePath = await this.resourcePath(
        item.itemModel,
        "item-model",
        source,
      );
      const itemJson: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
      return isRecord(itemJson) ? defaultLayers(itemJson.model) : [];
    }
    return [];
  }

  private async renderLayer(
    target: PNG,
    layer: ModelLayer,
    source?: WorkspaceIconSource,
    sharedDepth?: Float64Array,
  ): Promise<boolean> {
    const model = await this.loadModel(
      makeIdentifier(layer.model, source?.item.namespace ?? "minecraft"),
      [],
      source,
    );
    if (layer.special)
      return this.renderSpecial(target, model, layer, source, sharedDepth);
    const layerKeys = Object.keys(model.textures)
      .filter((key) => /^layer\d+$/u.test(key))
      .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)));
    if (model.generated || (!model.elements && layerKeys.length > 0)) {
      let rendered = false;
      for (const key of layerKeys) {
        const textureId = this.textureId(model, `#${key}`);
        if (!textureId) continue;
        const texture = await this.loadTexture(textureId, source);
        drawFlatLayer(
          target,
          texture,
          tintColor(layer.tints[Number(key.slice(5))]),
        );
        rendered = true;
      }
      return rendered;
    }
    if (!model.elements) return false;
    const depth = sharedDepth ?? new Float64Array(target.width * target.height);
    if (!sharedDepth) depth.fill(Number.NEGATIVE_INFINITY);
    let rendered = false;
    for (const rawElement of model.elements) {
      if (!isRecord(rawElement)) continue;
      const from = vector(rawElement.from, [0, 0, 0]);
      const to = vector(rawElement.to, [16, 16, 16]);
      if (!isRecord(rawElement.faces)) continue;
      for (const [direction, rawFace] of Object.entries(rawElement.faces)) {
        if (!isRecord(rawFace) || typeof rawFace.texture !== "string") continue;
        const textureId = this.textureId(model, rawFace.texture);
        if (!textureId) continue;
        const texture = await this.loadTexture(textureId, source);
        const rawUv = isUnknownArray(rawFace.uv)
          ? rawFace.uv.map(Number)
          : defaultUv(direction, from, to);
        const uvs = rotatedUv(rawUv, rawFace.rotation);
        const transform = model.display.gui;
        const projected = faceVertices(direction, from, to).map(
          (point, index): ProjectedVertex => {
            const transformed = transformForGui(
              transformLayerPoint(
                rotateElement(point, rawElement.rotation),
                layer.transformations,
              ),
              transform,
            );
            const uv = uvs[index] ?? [0, 0];
            return {
              x: target.width / 2 + (transformed[0] * target.width * 7) / 16,
              y: target.height / 2 - (transformed[1] * target.height * 7) / 16,
              z: transformed[2],
              u: uv[0],
              v: uv[1],
            };
          },
        );
        const [first, second, third, fourth] = projected;
        if (!first || !second || !third || !fourth) continue;
        const tintIndex = Number(rawFace.tintindex);
        const tint =
          Number.isInteger(tintIndex) && tintIndex >= 0
            ? tintColor(layer.tints[tintIndex])
            : 0xffffff;
        const shade = shadeFor(direction, model.guiLight);
        drawTriangle(
          target,
          depth,
          texture,
          [first, second, third],
          tint,
          shade,
        );
        drawTriangle(
          target,
          depth,
          texture,
          [first, third, fourth],
          tint,
          shade,
        );
        rendered = true;
      }
    }
    return rendered;
  }

  private async renderSpecial(
    target: PNG,
    baseModel: MergedModel,
    layer: ModelLayer,
    source?: WorkspaceIconSource,
    sharedDepth?: Float64Array,
  ): Promise<boolean> {
    const special = layer.special;
    if (!special) return false;
    const type = modelType(special);
    const depthBuffer =
      sharedDepth ?? new Float64Array(target.width * target.height);
    if (!sharedDepth) depthBuffer.fill(Number.NEGATIVE_INFINITY);
    const transform = baseModel.display.gui;
    switch (type) {
      case "chest": {
        if (typeof special.texture !== "string") return false;
        const texture = await this.loadTexture(
          this.entityTextureId(special.texture, "chest"),
          source,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [1, 0, 1],
          [15, 10, 15],
          [0, 19],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [1, 9, 1],
          [15, 14, 15],
          [0, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [7, 7, 15],
          [9, 11, 16],
          [0, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        return true;
      }
      case "shulker_box": {
        if (typeof special.texture !== "string") return false;
        const texture = await this.loadTexture(
          this.entityTextureId(special.texture, "shulker"),
          source,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-8, 16, -8],
          [8, 24, 8],
          [0, 28],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-8, 8, -8],
          [8, 20, 8],
          [0, 0],
          transform,
          baseModel.guiLight,
          [16, 12, 16],
          layer.transformations,
        );
        return true;
      }
      case "player_head": {
        const texture = this.playerSkin();
        // 头颅和完整玩家预览要用同一皮肤, 否则两个预览会不一致
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-4, -8, -4],
          [4, 0, 4],
          [0, 0],
          transform,
          "front",
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-4.25, -8.25, -4.25],
          [4.25, 0.25, 4.25],
          [32, 0],
          transform,
          "front",
          [8, 8, 8],
          layer.transformations,
        );
        return true;
      }
      case "head": {
        if (typeof special.kind !== "string") return false;
        const kind = special.kind.replace(/^minecraft:/u, "");
        const textureIds: Readonly<Record<string, string>> = {
          skeleton: "minecraft:entity/skeleton/skeleton",
          wither_skeleton: "minecraft:entity/skeleton/wither_skeleton",
          zombie: "minecraft:entity/zombie/zombie",
          creeper: "minecraft:entity/creeper/creeper",
          piglin: "minecraft:entity/piglin/piglin",
          dragon: "minecraft:entity/enderdragon/dragon",
        };
        const textureId = textureIds[kind];
        if (!textureId) return false;
        const texture = await this.loadTexture(textureId, source);
        if (kind === "piglin") {
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-5, -8, -4],
            [5, 0, 4],
            [0, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-2, -4, -5],
            [2, 0, -4],
            [31, 1],
            transform,
            "front",
            undefined,
            layer.transformations,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [2, -2, -5],
            [3, 0, -4],
            [2, 4],
            transform,
            "front",
            undefined,
            layer.transformations,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-3, -2, -5],
            [-2, 0, -4],
            [2, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [0, 0, -2],
            [1, 5, 2],
            [51, 6],
            transform,
            "front",
            undefined,
            layer.transformations,
            (point) =>
              transformModelPart(point, [4.5, -6, 0], [0, 0, -Math.PI / 6]),
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-1, 0, -2],
            [0, 5, 2],
            [39, 6],
            transform,
            "front",
            undefined,
            layer.transformations,
            (point) =>
              transformModelPart(point, [-4.5, -6, 0], [0, 0, Math.PI / 6]),
          );
        } else if (kind === "dragon") {
          const rootPose = (point: Vector3): Vector3 => [
            point[0] * 0.75,
            point[1] * 0.75 - 7.986_666,
            point[2] * 0.75,
          ];
          const jawPose = (point: Vector3): Vector3 =>
            rootPose(transformModelPart(point, [0, 4, -8], [0.2, 0, 0]));
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-6, -1, -24],
            [6, 4, -8],
            [176, 44],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-8, -8, -10],
            [8, 8, 6],
            [112, 30],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-5, -12, -4],
            [-3, -8, 2],
            [0, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [3, -12, -4],
            [5, -8, 2],
            [0, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-5, -3, -22],
            [-3, -1, -18],
            [112, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [3, -3, -22],
            [5, -1, -18],
            [112, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
            rootPose,
          );
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-6, 0, -16],
            [6, 4, 0],
            [176, 65],
            transform,
            "front",
            undefined,
            layer.transformations,
            jawPose,
          );
        } else {
          drawEntityCuboid(
            target,
            depthBuffer,
            texture,
            [-4, -8, -4],
            [4, 0, 4],
            [0, 0],
            transform,
            "front",
            undefined,
            layer.transformations,
          );
        }
        return true;
      }
      case "shield": {
        const texture = await this.loadTexture(
          "minecraft:entity/shield/shield_base_nopattern",
          source,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-6, -11, -2],
          [6, 11, -1],
          [0, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-1, -3, -1],
          [1, 3, 5],
          [26, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        return true;
      }
      case "copper_golem_statue": {
        if (typeof special.texture !== "string") return false;
        const texture = await this.loadTexture(
          this.specialTextureId(special.texture),
          source,
        );
        const rootPose = (point: Vector3): Vector3 => rotateZ(point, Math.PI);
        const bodyPose = (point: Vector3): Vector3 =>
          rootPose(transformModelPart(point, [0, -5, 0]));
        const headPose = (point: Vector3): Vector3 =>
          bodyPose(transformModelPart(point, [0, -6, 0]));
        const rightArmPose = (point: Vector3): Vector3 =>
          bodyPose(transformModelPart(point, [-4, -6, 0]));
        const leftArmPose = (point: Vector3): Vector3 =>
          bodyPose(transformModelPart(point, [4, -6, 0]));
        const rightLegPose = (point: Vector3): Vector3 =>
          rootPose(transformModelPart(point, [0, -5, 0]));
        const leftLegPose = rightLegPose;
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-4, -6, -3],
          [4, 0, 3],
          [0, 15],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          bodyPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-4.015, -5.015, -5.015],
          [4.015, 0.015, 5.015],
          [0, 0],
          transform,
          baseModel.guiLight,
          [8, 5, 10],
          layer.transformations,
          headPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-1, -2, -6],
          [1, 1, -4],
          [56, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          headPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-0.985, -8.985, -0.985],
          [0.985, -5.015, 0.985],
          [37, 8],
          transform,
          baseModel.guiLight,
          [2, 4, 2],
          layer.transformations,
          headPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-1.985, -12.985, -1.985],
          [1.985, -9.015, 1.985],
          [37, 0],
          transform,
          baseModel.guiLight,
          [4, 4, 4],
          layer.transformations,
          headPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-3, -1, -2],
          [0, 9, 2],
          [36, 16],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          rightArmPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [0, -1, -2],
          [3, 9, 2],
          [50, 16],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          leftArmPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-4, 0, -2],
          [0, 5, 2],
          [0, 27],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          rightLegPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [0, 0, -2],
          [4, 5, 2],
          [16, 27],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
          leftLegPose,
        );
        return true;
      }
      case "decorated_pot": {
        const baseTexture = await this.loadTexture(
          "minecraft:entity/decorated_pot/decorated_pot_base",
          source,
        );
        const sideTexture = await this.loadTexture(
          "minecraft:entity/decorated_pot/decorated_pot_side",
          source,
        );
        const neckPose = (point: Vector3): Vector3 =>
          transformModelPart(point, [0, 37, 16], [Math.PI, 0, 0]);
        drawEntityCuboid(
          target,
          depthBuffer,
          baseTexture,
          [3.9, 16.9, 3.9],
          [12.1, 20.1, 12.1],
          [0, 0],
          transform,
          "front",
          [8, 3, 8],
          layer.transformations,
          neckPose,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          baseTexture,
          [4.8, 19.8, 4.8],
          [11.2, 21.2, 11.2],
          [0, 5],
          transform,
          "front",
          [6, 1, 6],
          layer.transformations,
          neckPose,
        );
        drawEntityFace(
          target,
          depthBuffer,
          baseTexture,
          [0, 0, 0],
          [14, 0, 14],
          [-14, 13],
          "up",
          transform,
          "front",
          undefined,
          layer.transformations,
          (point) => transformModelPart(point, [1, 16, 1]),
        );
        drawEntityFace(
          target,
          depthBuffer,
          baseTexture,
          [0, 0, 0],
          [14, 0, 14],
          [-14, 13],
          "down",
          transform,
          "front",
          undefined,
          layer.transformations,
          (point) => transformModelPart(point, [1, 0, 1]),
        );

  // 四个面共用北面的贴图坐标, 分别建面会让贴图方向不一致
        const sideFrom: Vector3 = [0, 0, 0];
        const sideTo: Vector3 = [14, 16, 0];
        const sideAtlas: Vector3 = [14, 16, 0];
        const sides: readonly [Vector3, Vector3][] = [
          [
            [15, 16, 1],
            [0, 0, Math.PI],
          ],
          [
            [1, 16, 1],
            [0, -Math.PI / 2, Math.PI],
          ],
          [
            [15, 16, 15],
            [0, Math.PI / 2, Math.PI],
          ],
          [
            [1, 16, 15],
            [Math.PI, 0, 0],
          ],
        ];
        for (const [offset, rotation] of sides) {
          drawEntityFace(
            target,
            depthBuffer,
            sideTexture,
            sideFrom,
            sideTo,
            [1, 0],
            "north",
            transform,
            "front",
            sideAtlas,
            layer.transformations,
            (point) => transformModelPart(point, offset, rotation),
          );
        }
        return true;
      }
      case "conduit": {
        const texture = await this.loadTexture(
          "minecraft:entity/conduit/base",
          source,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-3, -3, -3],
          [3, 3, 3],
          [0, 0],
          transform,
          baseModel.guiLight,
          undefined,
          layer.transformations,
        );
        return true;
      }
      case "banner": {
        const texture = await this.loadTexture(
          "minecraft:entity/banner/banner_base",
          source,
        );
        // 只给布面着色, 旗杆也着色会和游戏内不同
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-1, -42, -1],
          [1, 0, 1],
          [44, 0],
          transform,
          "front",
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-10, -44, -1],
          [10, -42, 1],
          [0, 42],
          transform,
          "front",
          undefined,
          layer.transformations,
        );
        drawEntityCuboid(
          target,
          depthBuffer,
          texture,
          [-10, -44, -2],
          [10, -4, -1],
          [0, 0],
          transform,
          "front",
          undefined,
          layer.transformations,
          undefined,
          dyeColor(special.color),
        );
        return true;
      }
      default:
        return false;
    }
  }

  private entityTextureId(rawId: string, directory: string): string {
    const canonical = makeIdentifier(rawId, "minecraft");
    const separator = canonical.indexOf(":");
    const value = canonical.slice(separator + 1);
    return `${canonical.slice(0, separator)}:${value.startsWith("entity/") ? value : `entity/${directory}/${value}`}`;
  }

  private specialTextureId(rawId: string): string {
    const canonical = makeIdentifier(rawId, "minecraft");
    const separator = canonical.indexOf(":");
    const value = canonical
      .slice(separator + 1)
      .replace(/^textures\//u, "")
      .replace(/\.png$/u, "");
    return `${canonical.slice(0, separator)}:${value}`;
  }

  private playerSkin(): PNG {
    this.playerSkinCache ??= PNG.sync.read(PLAYER_SKIN_PNG);
    return this.playerSkinCache;
  }

  private async loadModel(
    id: string,
    stack: readonly string[] = [],
    source?: WorkspaceIconSource,
  ): Promise<MergedModel> {
    const canonical = makeIdentifier(id, "minecraft");
    const cacheKey = `${source?.key ?? "vanilla"}\0${canonical}`;
    const cached = this.modelCache.get(cacheKey);
    if (cached) return cached;
    const promise = this.readModel(canonical, stack, source);
    this.modelCache.set(cacheKey, promise);
    return promise;
  }

  private async readModel(
    id: string,
    stack: readonly string[],
    source?: WorkspaceIconSource,
  ): Promise<MergedModel> {
    if (stack.includes(id))
      throw new Error(
        Messages.src.preview.item.materialIcons.text0001(
          [...stack, id].join(" -> "),
        ),
      );
    const filePath = await this.resourcePath(id, "model", source);
    const own: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (!isRecord(own))
      throw new Error(Messages.src.preview.item.materialIcons.text0002(id));
    const parentId = typeof own.parent === "string" ? own.parent : undefined;
    const parent =
      parentId && !parentId.startsWith("builtin/")
        ? await this.loadModel(
            makeIdentifier(parentId, "minecraft"),
            [...stack, id],
            source,
          )
        : undefined;
    const ownTextures: Record<string, string> = {};
    if (isRecord(own.textures))
      for (const [key, value] of Object.entries(own.textures)) {
        if (typeof value === "string") ownTextures[key] = value;
        else if (isRecord(value) && typeof value.sprite === "string")
          ownTextures[key] = value.sprite;
      }
    const elements = isUnknownArray(own.elements)
      ? own.elements
      : parent?.elements;
    return {
      id,
      textures: { ...(parent?.textures ?? {}), ...ownTextures },
      display: {
        ...(parent?.display ?? {}),
        ...(isRecord(own.display) ? own.display : {}),
      },
      ...(elements ? { elements } : {}),
      generated:
        parent?.generated === true ||
        parentId?.includes("generated") === true ||
        parentId?.includes("handheld") === true,
      guiLight:
        typeof own.gui_light === "string"
          ? own.gui_light
          : (parent?.guiLight ?? "side"),
    };
  }

  private textureId(model: MergedModel, token: string): string | undefined {
    const resolved = resolveTextureReference(model.textures, token);
    if (!resolved) return undefined;
    const separator = model.id.indexOf(":");
    return makeIdentifier(
      resolved,
      separator < 0 ? "minecraft" : model.id.slice(0, separator),
    );
  }

  private loadTexture(id: string, source?: WorkspaceIconSource): Promise<PNG> {
    const canonical = makeIdentifier(id, "minecraft");
    const cacheKey = `${source?.key ?? "vanilla"}\0${canonical}`;
    let cached = this.textureCache.get(cacheKey);
    if (!cached) {
      cached = this.resourcePath(canonical, "texture", source)
        .then((filePath) => fs.readFile(filePath))
        .then((bytes) => PNG.sync.read(bytes));
      this.textureCache.set(cacheKey, cached);
    }
    return cached;
  }

  private async resourcePath(
    id: string,
    kind: "item-model" | "model" | "texture",
    source?: WorkspaceIconSource,
  ): Promise<string> {
    const workspace = source
      ? this.workspaceResource(source, kind, id)
      : undefined;
    return workspace?.path ?? this.assets.resource(id, kind);
  }

  private workspaceResource(
    source: WorkspaceIconSource,
    kind: ResourceFileKind,
    rawId: string,
  ): ResourceFile | undefined {
    const id = makeIdentifier(
      rawId.replace(/\.png$/iu, ""),
      source.item.namespace,
    );
    const root = canonicalPath(source.item.source.pack.resourcesRoot);
    const candidates = (
      kind === "texture"
        ? [`${kind}\0${id}`, `${kind}\0${id}.png`]
        : [`${kind}\0${id}`]
    )
      .flatMap((key) => source.resources.byKey.get(key) ?? [])
      .filter((file) => canonicalPath(file.pack.resourcesRoot) === root);
    return candidates.find((file) => file.effective) ?? candidates[0];
  }

  private outputPath(itemId: string): string {
    const canonical = makeIdentifier(itemId, "minecraft");
    const separator = canonical.indexOf(":");
    const namespace = canonical.slice(0, separator);
    const value = canonical.slice(separator + 1);
    const safeValue = value.replaceAll(/[^a-z0-9_./-]/gu, "_");
    const digest = createHash("sha1")
      .update(canonical)
      .digest("hex")
      .slice(0, 8);
    return path.join(
      this.storageUri.fsPath,
      "material-icons",
      ICON_RENDERER_REVISION,
      namespace,
      `${safeValue}.${digest}.png`,
    );
  }

  private workspaceOutputPath(
    itemId: string,
    digest: string,
    size: number,
  ): string {
    const canonical = makeIdentifier(itemId, "minecraft");
    const separator = canonical.indexOf(":");
    const namespace = canonical.slice(0, separator);
    const value = canonical.slice(separator + 1);
    const safeValue = value.replaceAll(/[^a-z0-9_./-]/gu, "_");
    return path.join(
      this.storageUri.fsPath,
      "workspace-item-icons",
      ICON_RENDERER_REVISION,
      namespace,
      `${safeValue}.${size}.${digest.slice(0, 12)}.png`,
    );
  }

  private async missingIcon(size = ICON_SIZE): Promise<vscode.Uri> {
    const normalizedSize = Math.max(8, Math.round(size));
    const cached = this.missing.get(normalizedSize);
    if (cached) return cached;
    const filePath = path.join(
      this.storageUri.fsPath,
      "material-icons",
      ICON_RENDERER_REVISION,
      `missing-item-icon-${normalizedSize}.png`,
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      const png = new PNG({ width: normalizedSize, height: normalizedSize });
      for (let y = 0; y < png.height; y += 1)
        for (let x = 0; x < png.width; x += 1) {
          const cell = Math.max(1, Math.ceil(normalizedSize / 2));
          const purple =
            ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) !== 0;
          const offset = (y * png.width + x) * 4;
          png.data[offset] = purple ? 248 : 0;
          png.data[offset + 1] = 0;
          png.data[offset + 2] = purple ? 248 : 0;
          png.data[offset + 3] = 255;
        }
      await fs.writeFile(filePath, PNG.sync.write(png));
    }
    const icon = vscode.Uri.file(filePath);
    this.missing.set(normalizedSize, icon);
    return icon;
  }

  private async emptyIcon(size = ICON_SIZE): Promise<vscode.Uri> {
    const normalizedSize = Math.max(8, Math.round(size));
    const cached = this.empty.get(normalizedSize);
    if (cached) return cached;
    const filePath = path.join(
      this.storageUri.fsPath,
      "material-icons",
      ICON_RENDERER_REVISION,
      `empty-item-icon-${normalizedSize}.png`,
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(
        filePath,
        PNG.sync.write(
          new PNG({ width: normalizedSize, height: normalizedSize }),
        ),
      );
    }
    const icon = vscode.Uri.file(filePath);
    this.empty.set(normalizedSize, icon);
    return icon;
  }
}
