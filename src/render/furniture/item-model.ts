import * as ThreeModule from "three";

import {
  bakedFaceUvs,
  bakedFaceVertices,
  displayTransformFor,
  displayTransformValues,
  mergeLegacyModel,
  namespaced,
  resolveTextureReference,
  type MergedLegacyModel,
} from "../item/model-core.js";
import {
  isRecord,
  isStringRecord,
  isUnknownArray,
  stringValue,
  type UnknownRecord,
} from "../shared/runtime.js";

interface ThreeVector {
  x: number;
  y: number;
  z: number;
  add(value: ThreeVector): this;
  multiply(value: ThreeVector): this;
  set(...values: number[]): this;
}

interface ThreeEuler {
  x: number;
  y: number;
  z: number;
  order: string;
  set(...values: number[]): this;
}

interface ThreeQuaternion {
  setFromAxisAngle(axis: ThreeVector, angle: number): this;
}

interface ThreeMatrix {
  compose(
    position: ThreeVector,
    quaternion: ThreeQuaternion,
    scale: ThreeVector,
  ): this;
  decompose(
    position: ThreeVector,
    quaternion: ThreeQuaternion,
    scale: ThreeVector,
  ): this;
  makeRotationFromQuaternion(quaternion: ThreeQuaternion): this;
  multiply(matrix: ThreeMatrix): this;
  set(...values: number[]): this;
}

interface ThreeTexture {
  colorSpace: unknown;
  generateMipmaps: boolean;
  magFilter: unknown;
  minFilter: unknown;
  wrapS: unknown;
  wrapT: unknown;
}

interface ThreeGeometry {
  computeVertexNormals(): void;
  setAttribute(name: string, attribute: unknown): void;
  setIndex(indices: readonly number[]): void;
}

interface ThreeMaterial {
  readonly opacity?: number;
}

interface ThreeObject {
  readonly children: ThreeObject[];
  readonly matrix: ThreeMatrix;
  matrixWorldNeedsUpdate: boolean;
  readonly position: ThreeVector;
  readonly quaternion: ThreeQuaternion;
  readonly rotation: ThreeEuler;
  readonly scale: ThreeVector;
  readonly userData: UnknownRecord;
  readonly isMesh?: boolean;
  add(...children: ThreeObject[]): this;
  traverse(visitor: (entry: ThreeObject) => void): void;
  updateMatrix(): void;
}

type ThreeMaterialConstructor = new (
  parameters?: Readonly<Record<string, unknown>>,
) => ThreeMaterial;

interface ThreeRuntime {
  readonly DoubleSide: unknown;
  readonly NearestFilter: unknown;
  readonly RepeatWrapping: unknown;
  readonly SRGBColorSpace: unknown;
  readonly MathUtils: { degToRad(value: number): number };
  readonly BoxGeometry: new (...values: number[]) => ThreeGeometry;
  readonly BufferGeometry: new () => ThreeGeometry;
  readonly Float32BufferAttribute: new (
    values: readonly number[],
    itemSize: number,
  ) => unknown;
  readonly Group: new () => ThreeObject;
  readonly Matrix4: new () => ThreeMatrix;
  readonly Mesh: new (
    geometry: ThreeGeometry,
    material: ThreeMaterial | readonly ThreeMaterial[],
  ) => ThreeObject;
  readonly MeshBasicMaterial: ThreeMaterialConstructor;
  readonly MeshLambertMaterial: ThreeMaterialConstructor;
  readonly Quaternion: new (...values: number[]) => ThreeQuaternion;
  readonly TextureLoader: new () => {
    loadAsync(source: string): Promise<ThreeTexture>;
  };
  readonly Vector3: new (...values: number[]) => ThreeVector;
}

interface FurnitureItemModelPayload {
  readonly model: unknown;
  readonly components: Readonly<UnknownRecord>;
  readonly models: Readonly<Record<string, unknown>>;
  readonly textures: Readonly<Record<string, string>>;
  readonly missingTexture: string;
}

interface ModelLeaf {
  readonly model: string;
  readonly tints: readonly unknown[];
  readonly transformations: readonly unknown[];
}

const THREE = ThreeModule as unknown as ThreeRuntime;

const textureCache = new Map<string, Promise<ThreeTexture>>();

function modelType(value: unknown): string {
  if (!isRecord(value) || typeof value.type !== "string") return "";
  const normalized = value.type.toLowerCase();
  return normalized.slice(normalized.indexOf(":") + 1);
}

function normalizedDisplayContext(value: unknown): string {
  const raw = stringValue(value, "none").toLowerCase();
  return (
    (
      {
        third_person_left_hand: "thirdperson_lefthand",
        third_person_right_hand: "thirdperson_righthand",
        first_person_left_hand: "firstperson_lefthand",
        first_person_right_hand: "firstperson_righthand",
      } as Readonly<Record<string, string>>
    )[raw] || raw
  );
}

function selectCase(node: UnknownRecord, context: string): unknown {
  const cases = isUnknownArray(node.cases) ? node.cases : [];
  if (stringValue(node.property).endsWith("display_context")) {
    for (const entry of cases) {
      if (!isRecord(entry)) continue;
      const values = isUnknownArray(entry.when) ? entry.when : [entry.when];
      if (values.some((value) => normalizedDisplayContext(value) === context))
        return entry.model;
    }
  }
  return node.fallback ?? (isRecord(cases[0]) ? cases[0].model : undefined);
}

function collectLeaves(
  node: unknown,
  context: string,
  result: ModelLeaf[],
  transformations: readonly unknown[] = [],
): void {
  if (typeof node === "string") {
    result.push({ model: node, tints: [], transformations });
    return;
  }
  if (isUnknownArray(node)) {
    node.forEach((entry) =>
      collectLeaves(entry, context, result, transformations),
    );
    return;
  }
  if (!isRecord(node)) return;
  const type = modelType(node);
  const next =
    node.transformation === undefined
      ? transformations
      : [...transformations, node.transformation];
  switch (type) {
    case "model": {
      const model = node.model ?? node.path;
      if (typeof model === "string")
        result.push({
          model,
          tints: isUnknownArray(node.tints) ? node.tints : [],
          transformations: next,
        });
      return;
    }
    case "composite":
      collectLeaves(node.models, context, result, next);
      return;
    case "condition":
      collectLeaves(
        node.on_false ?? node["on-false"] ?? node.on_true ?? node["on-true"],
        context,
        result,
        next,
      );
      return;
    case "select":
      collectLeaves(selectCase(node, context), context, result, next);
      return;
    case "range_dispatch": {
      const firstEntry = isUnknownArray(node.entries)
        ? node.entries[0]
        : undefined;
      collectLeaves(
        node.fallback ?? (isRecord(firstEntry) ? firstEntry.model : undefined),
        context,
        result,
        next,
      );
      return;
    }
    case "special": {
      const nestedModel = isRecord(node.model) ? node.model : undefined;
      const model = node.base ?? node.path ?? nestedModel?.base;
      if (typeof model === "string")
        result.push({
          model,
          tints: isUnknownArray(node.tints) ? node.tints : [],
          transformations: next,
        });
      return;
    }
    case "empty":
    case "bundle/selected_item":
      return;
    default:
      if (typeof node.model === "string")
        result.push({ model: node.model, tints: [], transformations: next });
  }
}

async function textureFor(
  payload: FurnitureItemModelPayload,
  id: unknown,
): Promise<ThreeTexture> {
  const canonical = namespaced(id);
  const source = payload.textures[canonical] || payload.missingTexture;
  const cached = textureCache.get(source);
  if (cached) return cached;
  const pending = new THREE.TextureLoader()
    .loadAsync(source)
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = false;
      return texture;
    });
  textureCache.set(source, pending);
  return pending;
}

function tintValue(
  payload: FurnitureItemModelPayload,
  tints: readonly unknown[],
  index: number,
): number {
  const tint = tints[index];
  if (!isRecord(tint)) return 0xffffff;
  const type = modelType(tint);
  if (type === "constant") {
    if (typeof tint.value === "number") return tint.value & 0xffffff;
    if (isUnknownArray(tint.value) && tint.value.length >= 3) {
      const multiplier = tint.value.some((value) => Number(value) > 1)
        ? 1
        : 255;
      return (
        ((Number(tint.value[0]) * multiplier) << 16) |
        ((Number(tint.value[1]) * multiplier) << 8) |
        (Number(tint.value[2]) * multiplier)
      );
    }
  }
  if (type === "dye") {
    const dyed = payload.components["minecraft:dyed_color"];
    if (typeof dyed === "number") return dyed & 0xffffff;
    if (isRecord(dyed) && typeof dyed.rgb === "number")
      return dyed.rgb & 0xffffff;
  }
  if (type === "firework") return 0xb030d0;
  if (type === "potion") return 0x385dc6;
  if (type === "grass") return 0x7cbd6b;
  return 0xffffff;
}

function defaultUv(
  direction: string,
  from: readonly number[],
  to: readonly number[],
): readonly number[] {
  const [fromX = 0, fromY = 0, fromZ = 0] = from;
  const [toX = 0, toY = 0, toZ = 0] = to;
  if (direction === "up" || direction === "down")
    return [fromX, fromZ, toX, toZ];
  if (direction === "east" || direction === "west")
    return [fromZ, 16 - toY, toZ, 16 - fromY];
  return [fromX, 16 - toY, toX, 16 - fromY];
}

async function elementGroup(
  payload: FurnitureItemModelPayload,
  model: MergedLegacyModel,
  element: UnknownRecord,
  tints: readonly unknown[],
): Promise<ThreeObject> {
  const group = new THREE.Group();
  const from = isUnknownArray(element.from)
    ? element.from.map(Number)
    : [0, 0, 0];
  const to = isUnknownArray(element.to) ? element.to.map(Number) : [16, 16, 16];
  for (const [direction, face] of Object.entries(
    isRecord(element.faces) ? element.faces : {},
  )) {
    if (!isRecord(face) || typeof face.texture !== "string") continue;
    const textureId = resolveTextureReference(model, face.texture);
    const texture = await textureFor(payload, textureId || "__missing__");
    const geometry = new THREE.BufferGeometry();
    // 家具模型要按十六分之一缩放, 否则 32 像素不会等于两个方块
    const positions = bakedFaceVertices(direction, from, to)
      .map(([x = 0, y = 0, z = 0]) => [
        (x - 8) / 16,
        (y - 8) / 16,
        (z - 8) / 16,
      ])
      .flat();
    const uv = bakedFaceUvs(
      isUnknownArray(face.uv)
        ? face.uv.map(Number)
        : defaultUv(direction, from, to),
      face.rotation,
    );
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv.flat(), 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const MaterialType =
      element.shade === false
        ? THREE.MeshBasicMaterial
        : THREE.MeshLambertMaterial;
    group.add(
      new THREE.Mesh(
        geometry,
        new MaterialType({
          map: texture,
          transparent: true,
          alphaTest: 0.01,
          side: THREE.DoubleSide,
          color: tintValue(payload, tints, Number(face.tintindex)),
        }),
      ),
    );
  }
  if (!isRecord(element.rotation)) return group;
  const rotation = element.rotation;
  const origin = isUnknownArray(rotation.origin)
    ? rotation.origin.map((value) => (Number(value) - 8) / 16)
    : [0, 0, 0];
  const pivot = new THREE.Group();
  pivot.position.set(...origin);
  group.position.set(...origin.map((value) => -value));
  const angle = THREE.MathUtils.degToRad(Number(rotation.angle) || 0);
  if (rotation.axis === "x") pivot.rotation.x = angle;
  if (rotation.axis === "y") pivot.rotation.y = angle;
  if (rotation.axis === "z") pivot.rotation.z = angle;
  if (rotation.rescale === true && Math.abs(Math.cos(angle)) > 1e-6) {
    const factor = 1 / Math.abs(Math.cos(angle));
    if (rotation.axis === "x") pivot.scale.set(1, factor, factor);
    if (rotation.axis === "y") pivot.scale.set(factor, 1, factor);
    if (rotation.axis === "z") pivot.scale.set(factor, factor, 1);
  }
  pivot.add(group);
  return pivot;
}

function addQuad(
  positions: number[],
  uvs: number[],
  indices: number[],
  vertices: readonly (readonly number[])[],
  coordinates: readonly (readonly number[])[],
): void {
  const base = positions.length / 3;
  positions.push(...vertices.flat());
  uvs.push(...coordinates.flat());
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function generatedLayerGeometry(): ThreeGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const front = 1 / 64;
  const back = -front;
  addQuad(
    positions,
    uvs,
    indices,
    [
      [-0.5, -0.5, front],
      [0.5, -0.5, front],
      [0.5, 0.5, front],
      [-0.5, 0.5, front],
    ],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  );
  addQuad(
    positions,
    uvs,
    indices,
    [
      [0.5, -0.5, back],
      [-0.5, -0.5, back],
      [-0.5, 0.5, back],
      [0.5, 0.5, back],
    ],
    [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

async function generatedGroup(
  payload: FurnitureItemModelPayload,
  model: MergedLegacyModel,
  tints: readonly unknown[],
): Promise<ThreeObject> {
  const group = new THREE.Group();
  const layers = Object.keys(model.textures || {})
    .filter((key) => /^layer\d+$/u.test(key))
    .sort();
  for (const [index, layer] of layers.entries()) {
    const textureId = resolveTextureReference(model, `#${layer}`);
    const texture = await textureFor(payload, textureId || "__missing__");
    const mesh = new THREE.Mesh(
      generatedLayerGeometry(),
      new THREE.MeshLambertMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.01,
        side: THREE.DoubleSide,
        color: tintValue(payload, tints, index),
      }),
    );
    mesh.position.z = index / 320;
    group.add(mesh);
  }
  return group;
}

async function missingModelGroup(
  payload: FurnitureItemModelPayload,
): Promise<ThreeObject> {
  const texture = await textureFor(payload, "__missing__");
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    Array.from(
      { length: 6 },
      () =>
        new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
    ),
  );
}

function quaternion(value: unknown): ThreeQuaternion {
  if (isUnknownArray(value) && value.length === 4)
    return new THREE.Quaternion(...value.map(Number));
  if (typeof value === "number")
    return new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, -1, 0),
      THREE.MathUtils.degToRad(value),
    );
  return new THREE.Quaternion();
}

function vector(value: unknown, fallback: readonly number[]): ThreeVector {
  if (typeof value === "number") return new THREE.Vector3(value, value, value);
  if (isUnknownArray(value) && value.length >= 3)
    return new THREE.Vector3(
      Number(value[0]),
      Number(value[1]),
      Number(value[2]),
    );
  return new THREE.Vector3(...fallback);
}

function applyModernTransformation(
  group: ThreeObject,
  transformation: unknown,
): void {
  let matrix: ThreeMatrix;
  if (isUnknownArray(transformation) && transformation.length === 16) {
    matrix = new THREE.Matrix4().set(...transformation.map(Number));
  } else if (isRecord(transformation)) {
    matrix = new THREE.Matrix4().compose(
      vector(transformation.translation, [0, 0, 0]),
      quaternion(
        transformation.left_rotation ?? transformation["left-rotation"],
      ),
      vector(transformation.scale, [1, 1, 1]),
    );
    matrix.multiply(
      new THREE.Matrix4().makeRotationFromQuaternion(
        quaternion(
          transformation.right_rotation ?? transformation["right-rotation"],
        ),
      ),
    );
  } else return;
  group.updateMatrix();
  group.matrix.multiply(matrix);
  group.matrix.decompose(group.position, group.quaternion, group.scale);
  group.matrixWorldNeedsUpdate = true;
}

function applyDisplayTransform(
  group: ThreeObject,
  model: MergedLegacyModel,
  context: string,
): void {
  if (context === "none") return;
  const transform = displayTransformFor(model, context);
  if (!transform) return;
  const leftHand = context.endsWith("_lefthand");
  const values = displayTransformValues(transform, leftHand);
  group.rotation.order = "XYZ";
  group.rotation.set(
    ...values.rotation.map((value) => THREE.MathUtils.degToRad(value)),
  );
  // 家具使用十六分之一大小, 这里的位移要比物品预览减半
  group.position.add(
    new THREE.Vector3(...values.translation.map((value) => value / 2)),
  );
  group.scale.multiply(new THREE.Vector3(...values.scale));
}

async function legacyGroup(
  payload: FurnitureItemModelPayload,
  leaf: ModelLeaf,
  context: string,
): Promise<ThreeObject> {
  const model = mergeLegacyModel(payload.models, leaf.model);
  if (!model) return missingModelGroup(payload);
  let group: ThreeObject;
  if (model.__generated || !isUnknownArray(model.elements))
    group = await generatedGroup(payload, model, leaf.tints);
  else {
    group = new THREE.Group();
    for (const element of model.elements)
      if (isRecord(element))
        group.add(await elementGroup(payload, model, element, leaf.tints));
  }
  applyDisplayTransform(group, model, context);
  for (const transformation of leaf.transformations)
    applyModernTransformation(group, transformation);
  return group;
}

export async function buildFurnitureItemModel(
  payload: unknown,
  displayContext: unknown = "none",
): Promise<ThreeObject | undefined> {
  if (
    !isRecord(payload) ||
    !isRecord(payload.components) ||
    !isRecord(payload.models) ||
    !isStringRecord(payload.textures) ||
    typeof payload.missingTexture !== "string"
  )
    return undefined;
  const itemPayload: FurnitureItemModelPayload = {
    model: payload.model,
    components: payload.components,
    models: payload.models,
    textures: payload.textures,
    missingTexture: payload.missingTexture,
  };
  const context = normalizedDisplayContext(displayContext);
  const leaves: ModelLeaf[] = [];
  collectLeaves(itemPayload.model, context, leaves);
  if (leaves.length === 0) return undefined;
  const root = new THREE.Group();
  for (const leaf of leaves)
    root.add(await legacyGroup(itemPayload, leaf, context));
  if (root.children.length === 0) return undefined;
  let meshCount = 0;
  root.traverse((entry) => {
    if (entry.isMesh) meshCount += 1;
  });
  root.userData.modelRendered = true;
  root.userData.meshCount = meshCount;
  return root;
}
