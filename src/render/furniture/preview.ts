import * as ThreeModule from "three";
import { OrbitControls as OrbitControlsModule } from "three/examples/jsm/controls/OrbitControls.js";

import { createPlayerModel } from "../item/player-preview.js";
import {
  applyPassengerPose,
  furniturePlayerRotationY,
} from "../item/player-preview-contract.js";
import { buildFurnitureItemModel } from "./item-model.js";
import {
  applyFurnitureRotationRule,
  furnitureElementPreviewRotationY,
  orientFurniturePreviewVariant,
} from "./rotation.js";
import {
  decodeFurnitureInboundMessage,
  type FurnitureOutboundMessage,
  type FurniturePreviewElement,
  type FurniturePreviewHitbox,
  type FurniturePreviewPayload,
  type FurniturePreviewSeat,
  type FurniturePreviewVariant,
  type FurnitureRotationRule,
} from "../shared/protocol.js";
import { Messages } from "../../messages.js";
import {
  canvasContext,
  element,
  isRecord,
  isUnknownArray,
  stringValue,
} from "../shared/runtime.js";

interface PreviewMetadata extends Record<string, unknown> {
  billboard?: string;
  conditional?: boolean;
  elementType?: string;
  hitboxLabel?: ThreeObject;
  hitboxShape?: ThreeObject;
  modelRendered?: boolean;
  previewLabel?: boolean;
  previewOwned?: boolean;
}

interface ThreeVector {
  x: number;
  y: number;
  z: number;
  add(value: ThreeVector): this;
  clone(): ThreeVector;
  copy(value: ThreeVector): this;
  distanceTo(value: ThreeVector): number;
  multiply(value: ThreeVector): this;
  multiplyScalar(value: number): this;
  set(...values: number[]): this;
  setScalar(value: number): this;
}

interface ThreeEuler {
  x: number;
  y: number;
  z: number;
  order: string;
  set(...values: number[]): this;
}

interface ThreeQuaternion {
  copy(value: ThreeQuaternion): this;
  lengthSq(): number;
  multiply(value: ThreeQuaternion): this;
  normalize(): this;
}

interface ThreeGeometry {
  dispose(): void;
}

interface ThreeTexture {
  colorSpace: unknown;
  generateMipmaps: boolean;
  magFilter: unknown;
  minFilter: unknown;
  userData: PreviewMetadata;
  dispose(): void;
}

interface ThreeColor {
  r: number;
  g: number;
  b: number;
  getHex(): number;
}

interface ThreeMaterial {
  color: ThreeColor;
  map?: ThreeTexture;
  dispose(): void;
}

interface ThreeObject {
  castShadow: boolean;
  children: ThreeObject[];
  geometry?: ThreeGeometry;
  isMesh?: boolean;
  material?: ThreeMaterial | ThreeMaterial[];
  name: string;
  position: ThreeVector;
  quaternion: ThreeQuaternion;
  renderOrder: number;
  rotation: ThreeEuler;
  scale: ThreeVector;
  userData: PreviewMetadata;
  visible: boolean;
  add(...objects: ThreeObject[]): this;
  computeLineDistances(): this;
  lookAt(position: ThreeVector): void;
  remove(...objects: ThreeObject[]): this;
  traverse(callback: (entry: ThreeObject) => void): void;
}

interface ThreeCamera extends ThreeObject {
  aspect: number;
  far: number;
  near: number;
  getWorldPosition(target: ThreeVector): ThreeVector;
  updateProjectionMatrix(): void;
}

interface ThreeRenderer {
  outputColorSpace: unknown;
  readonly shadowMap: { enabled: boolean };
  getPixelRatio(): number;
  render(scene: ThreeObject, camera: ThreeCamera): void;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
}

interface ThreeBox {
  getCenter(target: ThreeVector): ThreeVector;
  getSize(target: ThreeVector): ThreeVector;
  isEmpty(): boolean;
  setFromObject(object: ThreeObject): this;
}

interface ThreeRuntime {
  readonly DoubleSide: unknown;
  readonly NearestFilter: unknown;
  readonly SRGBColorSpace: unknown;
  readonly MathUtils: { degToRad(value: number): number };
  readonly ArrowHelper: new (...values: unknown[]) => ThreeObject;
  readonly Box3: new () => ThreeBox;
  readonly BoxGeometry: new (...values: unknown[]) => ThreeGeometry;
  readonly CanvasTexture: new (canvas: HTMLCanvasElement) => ThreeTexture;
  readonly CircleGeometry: new (...values: unknown[]) => ThreeGeometry;
  readonly Color: new (...values: (string | number)[]) => ThreeColor;
  readonly ConeGeometry: new (...values: unknown[]) => ThreeGeometry;
  readonly DirectionalLight: new (...values: unknown[]) => ThreeObject;
  readonly EdgesGeometry: new (geometry: ThreeGeometry) => ThreeGeometry;
  readonly GridHelper: new (...values: unknown[]) => ThreeObject;
  readonly Group: new () => ThreeObject;
  readonly HemisphereLight: new (...values: unknown[]) => ThreeObject;
  readonly LineBasicMaterial: new (
    parameters?: Readonly<Record<string, unknown>>,
  ) => ThreeMaterial;
  readonly LineDashedMaterial: new (
    parameters?: Readonly<Record<string, unknown>>,
  ) => ThreeMaterial;
  readonly LineSegments: new (
    geometry: ThreeGeometry,
    material: ThreeMaterial,
  ) => ThreeObject;
  readonly Mesh: new (
    geometry: ThreeGeometry,
    material: ThreeMaterial,
  ) => ThreeObject;
  readonly MeshBasicMaterial: new (
    parameters?: Readonly<Record<string, unknown>>,
  ) => ThreeMaterial;
  readonly MeshStandardMaterial: new (
    parameters?: Readonly<Record<string, unknown>>,
  ) => ThreeMaterial;
  readonly PerspectiveCamera: new (...values: unknown[]) => ThreeCamera;
  readonly PlaneGeometry: new (...values: unknown[]) => ThreeGeometry;
  readonly PointLight: new (...values: unknown[]) => ThreeObject;
  readonly Quaternion: new (...values: number[]) => ThreeQuaternion;
  readonly Scene: new () => ThreeObject;
  readonly SphereGeometry: new (...values: unknown[]) => ThreeGeometry;
  readonly Sprite: new (material: ThreeMaterial) => ThreeObject;
  readonly SpriteMaterial: new (
    parameters?: Readonly<Record<string, unknown>>,
  ) => ThreeMaterial;
  readonly TextureLoader: new () => { load(uri: string): ThreeTexture };
  readonly Vector3: new (...values: number[]) => ThreeVector;
  readonly WebGLRenderer: new (
    options: Readonly<Record<string, unknown>>,
  ) => ThreeRenderer;
}

interface PreviewControls {
  enableDamping: boolean;
  readonly target: ThreeVector;
  update(): void;
}

const THREE = ThreeModule as unknown as ThreeRuntime;
const OrbitControls = OrbitControlsModule as unknown as new (
  camera: ThreeCamera,
  canvas: HTMLCanvasElement,
) => PreviewControls;

interface FurniturePreviewState {
  variant?: string;
  seat?: string;
  yaw?: number;
  playerYaw?: number;
  showLabels?: boolean;
  showTextElements?: boolean;
  types?: Record<string, boolean>;
  sources?: Record<string, boolean>;
  instances?: Record<string, boolean>;
  furnitureId?: string;
  locator?: Readonly<{
    id: string;
    root: string;
    source: string;
    offset: number;
  }>;
}

const vscode = acquireVsCodeApi<
  FurniturePreviewState,
  FurnitureOutboundMessage
>();
const canvas = element("canvas", HTMLCanvasElement);
const loading = element("loading", HTMLElement);
let rendererAvailable = true;
let rendererFailureReported = false;
function reportRendererFailure(reason: string): void {
  rendererAvailable = false;
  if (rendererFailureReported) return;
  rendererFailureReported = true;
  const detail = Messages.web.furniture.preview.text0001(reason);
  loading.hidden = false;
  loading.textContent = detail;
  setTimeout(() => vscode.postMessage({ type: "gpu-error", detail }), 0);
}
function createRenderer(): ThreeRenderer {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    reportRendererFailure(
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
const renderer = createRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  reportRendererFailure(Messages.web.furniture.preview.text0002);
});
canvas.addEventListener("webglcontextrestored", () => {
  rendererAvailable = true;
  rendererFailureReported = false;
  void rebuildVariant(selectedVariant?.name);
});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(4.5, 3.4, 5.5);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x283347, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(4, 8, 6);
scene.add(sun);
const grid = new THREE.GridHelper(16, 16, 0x5a6678, 0x394252);
scene.add(grid);

const HITBOX_TYPE_NAMES: Readonly<Record<string, string>> = {
  interaction: Messages.web.furniture.preview.text0003,
  shulker: Messages.web.furniture.preview.text0004,
  happy_ghast: Messages.web.furniture.preview.text0005,
  custom: Messages.web.furniture.preview.text0006,
};
const HITBOX_PART_NAMES: Readonly<Record<string, string>> = {
  physical: Messages.web.furniture.preview.text0007,
  interaction: Messages.web.furniture.preview.text0008,
  entity: Messages.web.furniture.preview.text0009,
  unknown: Messages.web.furniture.preview.text0010,
};
const BEHAVIOR_NAMES: Readonly<Record<string, string>> = {
  simple_storage_furniture: Messages.web.furniture.preview.text0011,
  display_item_furniture: Messages.web.furniture.preview.text0012,
  glowing_furniture: Messages.web.furniture.preview.text0013,
};
const ROTATION_RULE_DETAILS: Readonly<
  Record<
    FurnitureRotationRule,
    Readonly<{
      label: string;
      hint: string;
      step: number;
      fixed?: boolean;
    }>
  >
> = {
  any: {
    label: Messages.web.furniture.preview.text0014,
    hint: Messages.web.furniture.preview.text0015,
    step: 1,
  },
  four: {
    label: Messages.web.furniture.preview.text0016,
    hint: Messages.web.furniture.preview.text0017,
    step: 90,
  },
  eight: {
    label: Messages.web.furniture.preview.text0018,
    hint: Messages.web.furniture.preview.text0019,
    step: 45,
  },
  sixteen: {
    label: Messages.web.furniture.preview.text0020,
    hint: Messages.web.furniture.preview.text0021,
    step: 22.5,
  },
  north: {
    label: Messages.web.furniture.preview.text0022,
    hint: Messages.web.furniture.preview.text0023,
    step: 1,
    fixed: true,
  },
  east: {
    label: Messages.web.furniture.preview.text0024,
    hint: Messages.web.furniture.preview.text0025,
    step: 1,
    fixed: true,
  },
  west: {
    label: Messages.web.furniture.preview.text0026,
    hint: Messages.web.furniture.preview.text0027,
    step: 1,
    fixed: true,
  },
  south: {
    label: Messages.web.furniture.preview.text0028,
    hint: Messages.web.furniture.preview.text0029,
    step: 1,
    fixed: true,
  },
};

let payload: FurniturePreviewPayload | undefined;
let root: ThreeObject | undefined;
let rotatingRoot: ThreeObject | undefined;
let player: ThreeObject | undefined;
let playerGeneration = 0;
let selectedVariant: FurniturePreviewVariant | undefined;
let currentHitboxes: readonly FurniturePreviewHitbox[] = [];
let variantGeneration = 0;
const collisionObjects = new Map<string, ThreeObject>();
const sourceGroups = new Map<string, ThreeObject[]>();
const typeGroups = new Map<string, ThreeObject[]>();
const elementObjects: ThreeObject[] = [];
const seatMarkers: ThreeObject[] = [];
const lightMarkers: ThreeObject[] = [];
const pendingIcons = new Set<string>();
const pendingModels = new Set<string>();
const textureLoader = new THREE.TextureLoader();
const saved: FurniturePreviewState = vscode.getState() ?? {};

function persistState(update: Partial<FurniturePreviewState> = {}): void {
  Object.assign(saved, update);
  if (payload) {
    saved.furnitureId = payload.id;
    saved.locator = payload.locator;
  }
  vscode.setState(saved);
}

function resize(): void {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (
    canvas.width !== Math.round(width * renderer.getPixelRatio()) ||
    canvas.height !== Math.round(height * renderer.getPixelRatio())
  ) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function animate(): void {
  resize();
  controls.update();
  for (const element of elementObjects) {
    const billboard = element.userData.billboard;
    if (!billboard || billboard === "fixed") continue;
    if (billboard === "center") {
      element.quaternion.copy(camera.quaternion);
      continue;
    }

    const world = new THREE.Vector3();
    camera.getWorldPosition(world);
    element.lookAt(world);
    switch (billboard) {
      case "vertical":
        element.rotation.x = element.rotation.z = 0;
        break;
      case "horizontal":
        element.rotation.y = element.rotation.z = 0;
        break;
    }
  }
  if (rendererAvailable) renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function disposeObject(object: ThreeObject): void {
  object.traverse((entry) => {
    entry.geometry?.dispose?.();
    const materials = Array.isArray(entry.material)
      ? entry.material
      : entry.material
        ? [entry.material]
        : [];
    for (const material of materials) {
      if (material.map?.userData?.previewOwned === true) material.map.dispose();
      material.dispose?.();
    }
  });
}

function clearRoot(): void {
  if (root) {
    scene.remove(root);
    disposeObject(root);
  }
  collisionObjects.clear();
  sourceGroups.clear();
  typeGroups.clear();
  elementObjects.length = 0;
  seatMarkers.length = 0;
  lightMarkers.length = 0;
  player = undefined;
  playerGeneration += 1;
  root = new THREE.Group();
  root.name = "FurnitureRoot";
  rotatingRoot = new THREE.Group();
  rotatingRoot.name = "FurnitureYawRoot";
  root.add(rotatingRoot);
  scene.add(root);
}

function labelSprite(
  text: string,
  color = "#ffffff",
  scale = 0.006,
): ThreeObject {
  const surface = document.createElement("canvas");
  const context = canvasContext(surface);
  context.font = "600 24px sans-serif";
  const width = Math.ceil(context.measureText(text).width + 18);
  surface.width = width;
  surface.height = 38;
  context.font = "600 24px sans-serif";
  context.fillStyle = "rgba(20,24,31,.82)";
  context.fillRect(0, 0, width, surface.height);
  context.fillStyle = color;
  context.fillText(text, 9, 27);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.previewOwned = true;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false }),
  );
  sprite.scale.set(width * scale, surface.height * scale, 1);
  sprite.renderOrder = 20;
  sprite.userData.previewLabel = true;
  return sprite;
}

function typeName(type: string): string {
  return (
    HITBOX_TYPE_NAMES[type] || Messages.web.furniture.preview.text0030(type)
  );
}

function sourceName(source: string): string {
  if (source === Messages.web.furniture.preview.text0031)
    return Messages.web.furniture.preview.text0032;
  if (source.startsWith("variant "))
    return Messages.web.furniture.preview.text0033(
      source.slice("variant ".length),
    );
  const [type, variant] = source.split(" · ");
  if (type && BEHAVIOR_NAMES[type])
    return Messages.web.furniture.preview.text0034(
      BEHAVIOR_NAMES[type],
      variant ?? "",
    );
  return source;
}

function colorValue(value: unknown, fallback: string): ThreeColor {
  if (typeof value === "number" && Number.isFinite(value))
    return new THREE.Color(value & 0xffffff);
  if (typeof value !== "string") return new THREE.Color(fallback);
  const text = value.trim();
  if (/^#[\da-f]{8}$/iu.test(text))
    return new THREE.Color(`#${text.slice(-6)}`);
  if (/^#[\da-f]{6}$/iu.test(text)) return new THREE.Color(text);
  const rgb = text.split(",").map(Number);
  if (rgb.length >= 3 && rgb.slice(-3).every(Number.isFinite))
    return new THREE.Color(
      ...rgb.slice(-3).map((entry) => Math.max(0, Math.min(255, entry)) / 255),
    );
  try {
    return new THREE.Color(text);
  } catch {
    return new THREE.Color(fallback);
  }
}

function rawQuaternion(value: unknown): ThreeQuaternion | undefined {
  const parts = isUnknownArray(value)
    ? value.map(Number)
    : typeof value === "string"
      ? value.split(",").map((entry) => Number(entry.trim()))
      : isRecord(value)
        ? [value.x, value.y, value.z, value.w].map(Number)
        : [];
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return undefined;
  const quaternion = new THREE.Quaternion(...parts);
  return quaternion.lengthSq() > 0 ? quaternion.normalize() : undefined;
}

function textDisplayMesh(element: FurniturePreviewElement): ThreeObject {
  const surface = document.createElement("canvas");
  const text = stringValue(element.text);
  const logicalWidth = Math.max(32, Number(element.lineWidth) || 200);
  const fontSize = 28;
  const lines: string[] = [];
  const measure = canvasContext(document.createElement("canvas"));
  measure.font = `${fontSize}px sans-serif`;
  let line = "";
  for (const character of [...text]) {
    if (
      character === "\n" ||
      measure.measureText(line + character).width > logicalWidth
    ) {
      lines.push(line);
      line = character === "\n" ? "" : character;
    } else line += character;
  }
  lines.push(line);
  surface.width = logicalWidth + 16;
  surface.height = Math.max(40, lines.length * (fontSize + 5) + 12);
  const context = canvasContext(surface);
  const background =
    element.useDefaultBackground === true
      ? "#40000000"
      : element.backgroundColor;
  if (background !== undefined) {
    const color = colorValue(background, "#000000");
    const alpha =
      typeof background === "string" && /^#[\da-f]{8}$/iu.test(background)
        ? Number.parseInt(background.slice(1, 3), 16) / 255
        : 0.25;
    context.fillStyle = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
    context.fillRect(0, 0, surface.width, surface.height);
  }
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = "top";
  context.textAlign =
    element.alignment === "left"
      ? "left"
      : element.alignment === "right"
        ? "right"
        : "center";
  const x =
    element.alignment === "left"
      ? 8
      : element.alignment === "right"
        ? surface.width - 8
        : surface.width / 2;
  const textOpacity = Number(element.textOpacity);
  const opacity =
    element.textOpacity === undefined || textOpacity < 0
      ? 1
      : Math.max(0, Math.min(255, textOpacity)) / 255;
  context.fillStyle = `rgba(255,255,255,${opacity})`;
  if (element.hasShadow) {
    context.shadowColor = "rgba(0,0,0,.8)";
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
  }
  lines.forEach((entry, index) =>
    context.fillText(entry, x, 6 + index * (fontSize + 5)),
  );
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.previewOwned = true;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: element.seeThrough !== true,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(surface.width / 160, surface.height / 160),
    material,
  );
}

function itemIconMesh(uri: string, size = 0.62): ThreeObject {
  const texture = textureLoader.load(uri);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.previewOwned = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
    }),
  );
}

function requestItemModel(id: string): void {
  if (!payload || !id || payload.itemModels[id] || pendingModels.has(id))
    return;
  pendingModels.add(id);
  vscode.postMessage({ type: "item-model", id });
}

async function markerElement(
  element: FurniturePreviewElement,
  generation: number,
  targetRoot: ThreeObject,
): Promise<void> {
  const currentPayload = payload;
  if (!currentPayload) return;
  const group = new THREE.Group();
  group.name = element.id;
  group.position.set(...element.position);
  group.rotation.set(
    THREE.MathUtils.degToRad(element.pitch || 0),
    furnitureElementPreviewRotationY(element.yaw || 0),
    0,
  );
  group.userData.billboard = stringValue(
    element.billboard,
    "fixed",
  ).toLowerCase();
  group.userData.conditional = element.conditional === true;
  group.userData.elementType = element.type;
  const color =
    element.type === "text_display"
      ? 0xf2e8c9
      : element.type === "block_display"
        ? 0x78a868
        : element.type === "armor_stand"
          ? 0xc89e72
          : element.external
            ? 0xff7096
            : 0x72a8e8;
  let geometry: ThreeGeometry;
  if (element.type === "item" || element.type === "item_display")
    geometry = new THREE.BoxGeometry(0.55, 0.55, 0.08);
  else if (element.type === "text_display")
    geometry = new THREE.PlaneGeometry(1.2, 0.32);
  else if (element.type === "armor_stand")
    geometry = new THREE.BoxGeometry(0.42, 1.5, 0.42);
  else geometry = new THREE.BoxGeometry(1, 1, 1);
  const brightness = isRecord(element.brightness)
    ? Math.max(
        Number(
          element.brightness.block_light ?? element.brightness["block-light"],
        ) || -1,
        Number(
          element.brightness.sky_light ?? element.brightness["sky-light"],
        ) || -1,
      )
    : -1;
  const glow =
    element.glowColor === undefined
      ? new THREE.Color(0x000000)
      : colorValue(element.glowColor, "#ffffff");
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: element.external ? 0.28 : 0.82,
    roughness: 0.8,
    emissive: glow,
    emissiveIntensity:
      element.glowColor === undefined
        ? Math.max(0, brightness) / 30
        : Math.max(0.25, brightness / 15),
  });
  const item = typeof element.item === "string" ? element.item : undefined;
  const block = typeof element.block === "string" ? element.block : undefined;
  const itemIcon =
    typeof element.itemIcon === "string" ? element.itemIcon : undefined;
  const displayContext =
    typeof element.displayContext === "string"
      ? element.displayContext
      : "none";
  const itemId =
    item ||
    (element.type === "block_display"
      ? block?.replace(/\[.*$/u, "")
      : undefined);
  const modelPayload = itemId ? currentPayload.itemModels[itemId] : undefined;
  if (itemId && !modelPayload) requestItemModel(itemId);
  const renderedModel =
    modelPayload &&
    ["item", "item_display", "block_display"].includes(element.type)
      ? ((await buildFurnitureItemModel(
          modelPayload,
          displayContext,
        )) as unknown as ThreeObject | undefined)
      : undefined;
  if (generation !== variantGeneration) return;
  const mesh =
    element.type === "text_display"
      ? textDisplayMesh(element)
      : (renderedModel ??
        (itemIcon &&
        (element.type === "item" || element.type === "item_display")
          ? itemIconMesh(itemIcon)
          : new THREE.Mesh(geometry, material)));
  mesh.position.set(...element.translation);
  mesh.scale.set(...element.scale);
  const rotation = rawQuaternion(element.rotation);
  if (rotation) mesh.quaternion.multiply(rotation);
  mesh.castShadow = Number(element.shadowRadius) > 0;
  group.add(mesh);
  if (element.type === "armor_stand" && (itemIcon || modelPayload)) {
    const headItem = modelPayload
      ? ((await buildFurnitureItemModel(
          modelPayload,
          typeof element.displayContext === "string"
            ? element.displayContext
            : "head",
        )) as unknown as ThreeObject | undefined)
      : itemIcon
        ? itemIconMesh(itemIcon, 0.42)
        : undefined;
    if (generation !== variantGeneration) return;
    if (!headItem) return;
    if (modelPayload) headItem.scale.multiplyScalar(0.42);
    headItem.position.set(0, 0.58, 0.23);
    group.add(headItem);
  }
  if (Number(element.shadowRadius) > 0) {
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Number(element.shadowRadius), 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity:
          Math.max(0, Math.min(1, Number(element.shadowStrength) || 1)) * 0.45,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -element.position[1] + 0.002;
    group.add(shadow);
  }
  if (element.type !== "text_display") {
    const text =
      item ||
      block ||
      (typeof element.externalModel === "string"
        ? element.externalModel
        : undefined) ||
      element.type;
    const suffix = [
      typeof element.displayContext === "string" ? element.displayContext : "",
      element.conditional ? Messages.web.furniture.preview.text0035 : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const label = labelSprite(
      `${text}${suffix ? ` · ${suffix}` : ""}`,
      element.external ? "#ff8aa8" : "#ffffff",
      0.0042,
    );
    label.position.set(0, Math.max(0.45, element.scale[1] * 0.65), 0);
    group.add(label);
  }
  targetRoot.add(group);
  elementObjects.push(group);
}

function collisionLine(hitbox: FurniturePreviewHitbox): void {
  if (!root) return;
  const group = new THREE.Group();
  group.name = hitbox.id;
  let shape: ThreeObject;
  if (hitbox.size) {
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const material = hitbox.dashed
      ? new THREE.LineDashedMaterial({
          color: hitbox.color,
          dashSize: 0.12,
          gapSize: 0.07,
          depthTest: false,
        })
      : new THREE.LineBasicMaterial({ color: hitbox.color, depthTest: false });
    shape = new THREE.LineSegments(geometry, material);
    if (hitbox.dashed) shape.computeLineDistances();
    shape.renderOrder = 12;
    group.add(shape);
  } else {
    shape = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshBasicMaterial({ color: hitbox.color }),
    );
    group.add(shape);
  }
  const flagText = [
    hitbox.flags.blocksBuilding ? Messages.web.furniture.preview.text0036 : "",
    hitbox.flags.projectile ? Messages.web.furniture.preview.text0037 : "",
    hitbox.flags.interactive ? Messages.web.furniture.preview.text0038 : "",
  ]
    .filter(Boolean)
    .join("·");
  const label = labelSprite(
    `${typeName(hitbox.type)} / ${HITBOX_PART_NAMES[hitbox.part] || hitbox.part}${flagText ? ` · ${flagText}` : ""}`,
    hitbox.color,
    0.0035,
  );
  group.add(label);
  group.userData.hitboxShape = shape;
  group.userData.hitboxLabel = label;
  updateCollisionLine(group, hitbox);
  root.add(group);
  collisionObjects.set(hitbox.id, group);
  const bySource = sourceGroups.get(hitbox.source) || [];
  bySource.push(group);
  sourceGroups.set(hitbox.source, bySource);
  const byType = typeGroups.get(hitbox.type) || [];
  byType.push(group);
  typeGroups.set(hitbox.type, byType);
}

function updateCollisionLine(
  group: ThreeObject,
  hitbox: FurniturePreviewHitbox,
): void {
  group.position.set(...hitbox.position);
  const shape = group.userData.hitboxShape;
  if (hitbox.size && shape) shape.scale.set(...hitbox.size);
  const label = group.userData.hitboxLabel;
  if (label) label.position.y = hitbox.size ? hitbox.size[1] / 2 + 0.14 : 0.16;
}

function seatMarker(seat: FurniturePreviewSeat, index: number): void {
  if (!rotatingRoot) return;
  const group = new THREE.Group();
  group.name = seat.id;
  group.position.set(...seat.position);
  const material = new THREE.MeshBasicMaterial({
    color: seat.limitedRotation ? 0xff6f91 : 0x4dd0e1,
    depthTest: false,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 10), material);
  cone.position.y = 0.125;
  group.add(cone);
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0.25, 0),
    0.42,
    material.color.getHex(),
    0.12,
    0.07,
  );
  arrow.rotation.y = THREE.MathUtils.degToRad(-seat.yaw);
  group.add(arrow);
  const label = labelSprite(
    Messages.web.furniture.preview.text0039(
      index + 1,
      seat.limitedRotation
        ? Messages.preview.furniture.lockedRotation(seat.yaw)
        : Messages.preview.furniture.freeRotation,
    ),
    "#a7f5ff",
    0.0035,
  );
  label.position.y = 0.45;
  group.add(label);
  rotatingRoot.add(group);
  seatMarkers.push(group);
}

function lightMarker(light: FurniturePreviewVariant["lights"][number]): void {
  if (!rotatingRoot) return;
  const group = new THREE.Group();
  group.position.set(...light.position);
  const level = Number(light.level);
  const radius = 0.08 + level / 90;
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(radius, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffef73,
        transparent: true,
        opacity: 0.9,
      }),
    ),
  );
  const point = new THREE.PointLight(
    0xffe781,
    level / 5,
    Math.max(1, level / 2),
  );
  group.add(point);
  const label = labelSprite(
    Messages.web.furniture.preview.text0040(level),
    "#fff4a8",
    0.0035,
  );
  label.position.y = radius + 0.12;
  group.add(label);
  rotatingRoot.add(group);
  lightMarkers.push(group);
}

async function renderPlayer(): Promise<void> {
  const generation = ++playerGeneration;
  if (player) {
    rotatingRoot?.remove(player);
    disposeObject(player);
    player = undefined;
  }
  const seatId = element("seat", HTMLSelectElement).value;
  const seat = selectedVariant?.seats.find((entry) => entry.id === seatId);
  const currentPayload = payload;
  if (!seat || !currentPayload) return;
  try {
    const loadedPlayer = await createPlayerModel(
      document.body.dataset.playerSkin,
      typeof currentPayload.player.model === "string"
        ? currentPayload.player.model
        : undefined,
      undefined,
    );
    if (
      generation !== playerGeneration ||
      root === undefined ||
      rotatingRoot === undefined
    ) {
      disposeObject(loadedPlayer as unknown as ThreeObject);
      return;
    }
    applyPassengerPose(loadedPlayer);
    const nextPlayer = loadedPlayer as unknown as ThreeObject;
    nextPlayer.position.set(...seat.position);
    nextPlayer.name = "ChengZhiYaPassenger";
    player = nextPlayer;
    updatePlayerYaw();
    rotatingRoot.add(nextPlayer);
  } catch (error) {
    console.error(error);
  }
}

function updatePlayerYaw(): void {
  if (!player) return;
  const seatId = element("seat", HTMLSelectElement).value;
  const seat = selectedVariant?.seats.find((entry) => entry.id === seatId);
  const previewYaw = seat?.limitedRotation
    ? seat.yaw
    : Number(element("player-yaw", HTMLInputElement).value) || 0;
  player.rotation.y = furniturePlayerRotationY(previewYaw);
}

function configurePlayerYaw(): void {
  const seatId = element("seat", HTMLSelectElement).value;
  const seat = selectedVariant?.seats.find((entry) => entry.id === seatId);
  const locked = seat?.limitedRotation === true;
  setPairedValue(
    "player-yaw",
    "player-yaw-number",
    locked ? seat.yaw : saved.playerYaw || 0,
  );
  element("player-yaw", HTMLInputElement).disabled = !seat || locked;
  element("player-yaw-number", HTMLInputElement).disabled = !seat || locked;
  element("player-yaw-hint", HTMLElement).textContent = !seat
    ? Messages.web.furniture.preview.text0041
    : locked
      ? Messages.web.furniture.preview.text0042(seat.yaw)
      : Messages.web.furniture.preview.text0043;
  updatePlayerYaw();
}

function updateConfiguredItems(): void {
  const configured = [
    ...new Set(
      (selectedVariant?.elements || []).flatMap((entry) =>
        typeof entry.item === "string" ? [entry.item] : [],
      ),
    ),
  ];
  element("configured-items", HTMLElement).textContent = configured.length
    ? configured.join("、")
    : Messages.web.furniture.preview.text0044;
}

function checkbox(
  container: HTMLElement,
  id: string,
  text: string,
  checked: boolean,
  onChange: (event: Event) => void,
): HTMLInputElement {
  const label = document.createElement("label");
  label.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = checked;
  input.addEventListener("change", onChange);
  label.append(input, document.createTextNode(text));
  container.append(label);
  return input;
}

function rebuildFilters(): void {
  const typeContainer = element("type-filters", HTMLElement);
  const sourceContainer = element("source-filters", HTMLElement);
  const instanceContainer = element("instance-filters", HTMLElement);
  typeContainer.replaceChildren();
  sourceContainer.replaceChildren();
  instanceContainer.replaceChildren();
  for (const [type, objects] of typeGroups)
    checkbox(
      typeContainer,
      `type-${type}`,
      `${typeName(type)}（${objects.length}）`,
      saved.types?.[type] !== false,
      applyFilters,
    );
  for (const [source, objects] of sourceGroups)
    checkbox(
      sourceContainer,
      `source-${source}`,
      `${sourceName(source)}（${objects.length}）`,
      saved.sources?.[source] !== false,
      applyFilters,
    );
  for (const [id] of collisionObjects)
    checkbox(
      instanceContainer,
      `instance-${id}`,
      id.split(":").slice(-2).join(" · "),
      saved.instances?.[id] !== false,
      applyFilters,
    );
}

function applyFilters(): void {
  const types: Record<string, boolean> = {};
  const sources: Record<string, boolean> = {};
  const instances: Record<string, boolean> = {};
  for (const [type] of typeGroups)
    types[type] = element(`type-${type}`, HTMLInputElement).checked;
  for (const [source] of sourceGroups)
    sources[source] = element(`source-${source}`, HTMLInputElement).checked;
  for (const [id, object] of collisionObjects) {
    instances[id] = element(`instance-${id}`, HTMLInputElement).checked;
    const hitbox = currentHitboxes.find((entry) => entry.id === id);
    object.visible =
      instances[id] === true &&
      (!hitbox || types[hitbox.type] !== false) &&
      (!hitbox || sources[hitbox.source] !== false);
  }
  elementObjects.forEach((entry) => {
    entry.visible =
      element("show-elements", HTMLInputElement).checked &&
      (element("show-conditional", HTMLInputElement).checked ||
        entry.userData.conditional !== true) &&
      (element("show-text-elements", HTMLInputElement).checked ||
        entry.userData.elementType !== "text_display");
  });
  seatMarkers.forEach((entry) => {
    entry.visible = element("show-seats", HTMLInputElement).checked;
  });
  lightMarkers.forEach((entry) => {
    entry.visible = element("show-lights", HTMLInputElement).checked;
  });
  const showLabels = element("show-labels", HTMLInputElement).checked;
  root?.traverse((entry) => {
    if (entry.userData.previewLabel === true) entry.visible = showLabels;
  });
  const showTextElements = element(
    "show-text-elements",
    HTMLInputElement,
  ).checked;
  Object.assign(saved, {
    types,
    sources,
    instances,
    showLabels,
    showTextElements,
  });
  persistState({
    ...(selectedVariant ? { variant: selectedVariant.name } : {}),
    seat: element("seat", HTMLSelectElement).value,
    yaw: Number(element("yaw", HTMLInputElement).value),
    playerYaw: saved.playerYaw || 0,
  });
}

function setPairedValue(
  rangeId: string,
  numberId: string,
  value: unknown,
): number {
  const numeric = Math.max(-180, Math.min(180, Number(value) || 0));
  element(rangeId, HTMLInputElement).value = String(numeric);
  element(numberId, HTMLInputElement).value = String(numeric);
  element(`${rangeId}-value`, HTMLElement).textContent = `${numeric}°`;
  return numeric;
}

function configureFurnitureYaw(): number {
  const rule = selectedVariant?.rotationRule || "any";
  const details = ROTATION_RULE_DETAILS[rule] || ROTATION_RULE_DETAILS.any;
  const range = element("yaw", HTMLInputElement);
  const number = element("yaw-number", HTMLInputElement);
  range.step = String(details.step);
  number.step = String(details.step);
  range.disabled = details.fixed === true;
  number.disabled = details.fixed === true;
  element("rotation-rule", HTMLElement).textContent = details.label;
  element("yaw-hint", HTMLElement).textContent = details.hint;
  const yaw = applyFurnitureRotationRule(
    rule,
    saved.yaw ?? (Number(range.value) || 0),
  );
  saved.yaw = setPairedValue("yaw", "yaw-number", yaw);
  return saved.yaw;
}

function configuredFurnitureYaw(value: unknown): number {
  return setPairedValue(
    "yaw",
    "yaw-number",
    applyFurnitureRotationRule(
      selectedVariant?.rotationRule || "any",
      Number(value) || 0,
    ),
  );
}

function rebuildLegend(): void {
  const legend = element("legend", HTMLElement);
  legend.replaceChildren();
  for (const [type, name] of Object.entries(HITBOX_TYPE_NAMES)) {
    const chip = document.createElement("span");
    chip.className = "legend-chip";
    const color = document.createElement("i");
    color.className = "legend-color";
    color.style.backgroundColor =
      selectedVariant?.hitboxes.find((entry) => entry.type === type)?.color ||
      (
        {
          interaction: "#29B6F6",
          shulker: "#AB47BC",
          happy_ghast: "#FFB300",
          custom: "#66BB6A",
        } as Readonly<Record<string, string>>
      )[type] ||
      "#ffffff";
    chip.append(color, document.createTextNode(name));
    legend.append(chip);
  }
  const note = document.createElement("span");
  note.textContent = Messages.web.furniture.preview.text0045;
  legend.append(note);
}

function fit(): void {
  if (!root) return;
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1) * 1.4;
  controls.target.copy(center);
  camera.position
    .copy(center)
    .add(new THREE.Vector3(radius, radius * 0.75, radius));
  camera.near = Math.max(0.01, radius / 100);
  camera.far = Math.max(100, radius * 20);
  camera.updateProjectionMatrix();
  controls.update();
}

async function rebuildVariant(name?: string, fitAfter = true): Promise<void> {
  const currentPayload = payload;
  if (!currentPayload) return;
  const generation = ++variantGeneration;
  selectedVariant =
    currentPayload.variants.find((entry) => entry.name === name) ||
    currentPayload.variants[0];
  const activeVariant = selectedVariant;
  if (!activeVariant) return;
  const yaw = configureFurnitureYaw();
  clearRoot();
  const targetRoot = root;
  const targetRotatingRoot = rotatingRoot;
  if (!targetRoot || !targetRotatingRoot) return;
  targetRotatingRoot.rotation.y = THREE.MathUtils.degToRad(-yaw);
  currentHitboxes = orientFurniturePreviewVariant(activeVariant, yaw).hitboxes;
  await Promise.all(
    activeVariant.elements.map((entry) =>
      markerElement(entry, generation, targetRotatingRoot),
    ),
  );
  if (generation !== variantGeneration) return;
  currentHitboxes.forEach(collisionLine);
  activeVariant.seats.forEach(seatMarker);
  activeVariant.lights.forEach(lightMarker);
  updateConfiguredItems();
  const seatSelect = element("seat", HTMLSelectElement);
  seatSelect.replaceChildren(
    new Option(Messages.web.furniture.preview.text0046, ""),
  );
  activeVariant.seats.forEach((seat, index) =>
    seatSelect.add(
      new Option(
        Messages.web.furniture.preview.text0047(
          index + 1,
          seat.limitedRotation
            ? Messages.preview.furniture.lockedRotation(seat.yaw)
            : Messages.preview.furniture.freeRotation,
        ),
        seat.id,
      ),
    ),
  );
  if (
    saved.seat &&
    activeVariant.seats.some((entry) => entry.id === saved.seat)
  )
    seatSelect.value = saved.seat;
  configurePlayerYaw();
  rebuildFilters();
  applyFilters();
  await renderPlayer();
  loading.hidden = true;
  rebuildLegend();
  vscode.postMessage({
    type: "state",
    variant: activeVariant.name,
    seat: seatSelect.value,
  });
  let modelCount = 0;
  let meshCount = 0;
  targetRoot.traverse((entry) => {
    if (entry.userData.modelRendered === true) modelCount += 1;
    if (entry.isMesh) meshCount += 1;
  });
  vscode.postMessage({
    type: "rendered",
    id: currentPayload.id,
    modelCount,
    meshCount,
    labelsVisible: element("show-labels", HTMLInputElement).checked,
  });
  if (fitAfter) setTimeout(fit, 20);
}

function updateFurnitureYaw(value: number): void {
  saved.yaw = value;
  if (selectedVariant && rotatingRoot) {
    rotatingRoot.rotation.y = THREE.MathUtils.degToRad(-value);
    currentHitboxes = orientFurniturePreviewVariant(
      selectedVariant,
      value,
    ).hitboxes;
    for (const hitbox of currentHitboxes) {
      const object = collisionObjects.get(hitbox.id);
      if (object) updateCollisionLine(object, hitbox);
    }
  }
  persistState({
    ...(selectedVariant ? { variant: selectedVariant.name } : {}),
    seat: element("seat", HTMLSelectElement).value,
  });
}

function setupPayload(value: FurniturePreviewPayload): void {
  payload = value;
  pendingIcons.clear();
  pendingModels.clear();
  element("furniture-id", HTMLElement).textContent = value.id;
  element("meta", HTMLElement).textContent =
    Messages.web.furniture.preview.text0048(
      value.pack,
      value.inline
        ? Messages.web.furniture.preview.text0050
        : Messages.web.furniture.preview.text0051,
      value.variants.length,
    );
  const variant = element("variant", HTMLSelectElement);
  variant.replaceChildren(
    ...value.variants.map((entry) => new Option(entry.name, entry.name)),
  );
  const initial =
    saved.variant &&
    value.variants.some((entry) => entry.name === saved.variant)
      ? saved.variant
      : value.variants[0]?.name;
  if (initial) variant.value = initial;
  element("issues", HTMLElement).replaceChildren(
    ...(value.issues.length
      ? value.issues
      : [Messages.web.furniture.preview.text0049]
    ).map((issue) => {
      const item = document.createElement("li");
      item.textContent = issue;
      return item;
    }),
  );
  setPairedValue("yaw", "yaw-number", saved.yaw || 0);
  setPairedValue("player-yaw", "player-yaw-number", saved.playerYaw || 0);
  element("show-labels", HTMLInputElement).checked = saved.showLabels === true;
  element("show-text-elements", HTMLInputElement).checked =
    saved.showTextElements === true;
  void rebuildVariant(initial);
}

function controlValue(event: Event): string {
  const control = event.currentTarget;
  return control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement
    ? control.value
    : "";
}

element("variant", HTMLSelectElement).addEventListener(
  "change",
  (event) => void rebuildVariant(controlValue(event)),
);
element("yaw", HTMLInputElement).addEventListener("input", (event) => {
  const value = configuredFurnitureYaw(controlValue(event));
  updateFurnitureYaw(value);
});
element("yaw-number", HTMLInputElement).addEventListener("input", (event) => {
  const value = configuredFurnitureYaw(controlValue(event));
  updateFurnitureYaw(value);
});
element("seat", HTMLSelectElement).addEventListener("change", () => {
  configurePlayerYaw();
  void renderPlayer();
  applyFilters();
  vscode.postMessage({
    type: "state",
    ...(selectedVariant ? { variant: selectedVariant.name } : {}),
    seat: element("seat", HTMLSelectElement).value,
  });
});
element("player-yaw", HTMLInputElement).addEventListener("input", (event) => {
  saved.playerYaw = setPairedValue(
    "player-yaw",
    "player-yaw-number",
    controlValue(event),
  );
  updatePlayerYaw();
  applyFilters();
});
element("player-yaw-number", HTMLInputElement).addEventListener(
  "input",
  (event) => {
    saved.playerYaw = setPairedValue(
      "player-yaw",
      "player-yaw-number",
      controlValue(event),
    );
    updatePlayerYaw();
    applyFilters();
  },
);
for (const id of [
  "show-elements",
  "show-conditional",
  "show-text-elements",
  "show-labels",
  "show-seats",
  "show-lights",
]) {
  element(id, HTMLInputElement).addEventListener("change", applyFilters);
}
element("fit", HTMLButtonElement).addEventListener("click", fit);
for (const button of document.querySelectorAll<HTMLElement>("[data-view]"))
  button.addEventListener("click", () => {
    const target = controls.target.clone();
    const distance = Math.max(3, camera.position.distanceTo(target));
    switch (button.dataset.view) {
      case "front":
        camera.position
          .copy(target)
          .add(new THREE.Vector3(0, distance * 0.3, distance));
        break;
      case "left":
        camera.position
          .copy(target)
          .add(new THREE.Vector3(-distance, distance * 0.3, 0));
        break;
      case "top":
        camera.position
          .copy(target)
          .add(new THREE.Vector3(0.01, distance, 0.01));
        break;
    }
    controls.update();
  });
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = decodeFurnitureInboundMessage(event.data);
  if (!message) return;
  switch (message.type) {
    case "preview":
      setupPayload(message.payload);
      return;
    case "item-icon":
      if (!payload) return;
      pendingIcons.delete(message.id);
      payload.itemIcons[message.id] = message.uri;
      void rebuildVariant(selectedVariant?.name);
      return;
    case "item-model":
      if (!payload) return;
      pendingModels.delete(message.id);
      payload.itemModels[message.id] = message.model;
      void rebuildVariant(selectedVariant?.name);
      return;
  }
});
vscode.postMessage({ type: "ready" });
