import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  applyEquipmentLayers,
  createFirstPersonArm,
  createPlayerModel,
  equipmentAnchor,
  updateFirstPersonItemAnchor,
} from "./player-preview.js";
import {
  firstPersonFramingDistance,
  type FirstPersonItemAnimation,
  type FirstPersonItemUseState,
} from "./player-preview-contract.js";
import {
  drawInlineImage,
  inlineAdvance,
  inlineImage,
  prepareInlineImages,
} from "./inline-images.js";
import {
  DEFAULT_MINECRAFT_INVENTORY_SLOT_ID,
  MINECRAFT_INVENTORY_GUI,
  MINECRAFT_INVENTORY_SLOTS,
  minecraftGuiCameraZoom,
  minecraftGuiLighting,
  minecraftInventoryLayout,
  minecraftInventorySlot,
  type MinecraftInventoryLayout,
} from "./gui-rendering.js";
import {
  bakedFaceUvs,
  bakedFaceVertices,
  displayTransformFor,
  displayTransformValues,
  mergeLegacyModel,
  namespaced,
  resolveTextureReference,
  type MergedLegacyModel,
} from "./model-core.js";
import {
  collectItemModelStateControls,
  conditionModelBranch,
  itemModelNodeType,
  modelPropertyKey,
  modelStateValueKey,
  rangeModelBranch,
  selectModelBranch,
  type ItemModelNode,
  type ItemModelStateControl,
} from "./model-state.js";
import {
  attributeTooltipDescriptors,
  drawTooltipGlyph,
  drawTooltipStyle,
  enchantmentTooltipDescriptors,
  jukeboxTooltipDescription,
  rarityTooltipColor,
  tooltipDisplayHidden,
  tooltipDisplayShows,
  tooltipGlyphAdvance,
  tooltipGlyphShadowOffset,
  tooltipLayout,
  tooltipTextRuns,
  type TooltipTextRun,
  type TooltipTextStyle,
} from "./tooltip-renderer.js";
import {
  minecraftAnimationLayout,
  minecraftAnimationState,
  type MinecraftAnimationLayout,
} from "@craftengine/host/texture-animation";
import { stepZoomPercent, wheelScale } from "../shared/preview-controls.js";
import {
  decodeItemInboundMessage,
  type ItemOutboundMessage,
  type ItemPreviewPayload,
  type VanillaGlyph,
} from "../shared/protocol.js";
import {
  canvasContext,
  element,
  isRecord,
  isUnknownArray,
  queryElements,
  stringValue,
  type UnknownRecord,
} from "../shared/runtime.js";

import { Messages } from "../../messages.js";
type ItemVariantName = "server" | "client";
type EquipmentSlot =
  "mainhand" | "offhand" | "head" | "chest" | "legs" | "feet";
type VectorTuple = [number, number, number];
type TransformKey = "rotation" | "translation" | "scale";

interface PreviewTransform {
  rotation: VectorTuple;
  translation: VectorTuple;
  scale: VectorTuple;
}

interface PersistedTooltipState {
  visible?: boolean;
  advanced?: boolean;
  custom?: boolean;
  name?: string;
  lore?: string;
  glint?: boolean;
}

interface PersistedState {
  itemId?: string;
  variantName?: ItemVariantName;
  displayContext?: string;
  equipmentSlot?: EquipmentSlot;
  inventorySlotId?: string;
  zoom?: number;
  autoZoom?: boolean;
  stateValues?: Record<string, unknown>;
  variableValues?: Record<string, string>;
  previewTransform?: PreviewTransform;
  tooltip?: PersistedTooltipState;
}

interface ThreeVector {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): this;
  setScalar(value: number): this;
  fromArray(values: readonly number[]): this;
  toArray(): number[];
  clone(): ThreeVector;
  copy(value: ThreeVector): this;
  add(value: ThreeVector): this;
  sub(value: ThreeVector): this;
  multiply(value: ThreeVector): this;
  multiplyScalar(value: number): this;
  normalize(): this;
  distanceTo(value: ThreeVector): number;
}

interface ThreeEuler {
  x: number;
  y: number;
  z: number;
  order: string;
  set(x: number, y: number, z: number, order?: string): this;
}

interface ThreeQuaternion {
  copy(value: ThreeQuaternion): this;
}

type ThreeMatrix = InstanceType<typeof THREE.Matrix4>;

interface ThreeMaterial {
  opacity: number;
  dispose(): void;
}

interface ThreeGeometry {
  dispose(): void;
}

interface ThreeObjectShape {
  name: string;
  renderOrder: number;
  visible: boolean;
  matrixAutoUpdate: boolean;
  matrixWorldNeedsUpdate: boolean;
  readonly isMesh?: boolean;
  readonly position: ThreeVector;
  readonly rotation: ThreeEuler;
  readonly scale: ThreeVector;
  readonly quaternion: ThreeQuaternion;
  readonly matrix: ThreeMatrix;
  readonly matrixWorld: ThreeMatrix;
  readonly userData: UnknownRecord & { firstPersonBaseZ?: number };
  parent: ThreeObject | null;
  add(...children: ThreeObject[]): this;
  remove(...children: ThreeObject[]): this;
  traverse(visitor: (entry: ThreeObject) => void): void;
  updateMatrix(): void;
  updateMatrixWorld(force?: boolean): void;
  applyMatrix4(matrix: ThreeMatrix): void;
}

type ThreeObject = InstanceType<typeof THREE.Object3D> & ThreeObjectShape;

type ThreeMesh = ThreeObject &
  InstanceType<typeof THREE.Mesh> & {
    readonly isMesh: true;
    geometry: ThreeGeometry;
    material: ThreeMaterial | ThreeMaterial[];
    clone(): ThreeMesh;
  };

type ThreeCamera = ThreeObject &
  InstanceType<typeof THREE.Camera> & {
    readonly isPerspectiveCamera: boolean;
    readonly isOrthographicCamera: boolean;
    fov: number;
    aspect: number;
    zoom: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
    readonly up: ThreeVector;
    updateProjectionMatrix(): void;
  };

type ThreeLight = ThreeObject & {
  intensity: number;
  readonly color: { set(value: number): void };
};

type FirstPersonReference = ThreeObject & {
  readonly userData: ThreeObject["userData"] & {
    readonly itemAnchor?: Readonly<{ matrix: ThreeMatrix }>;
  };
};

interface TextureImage {
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly width?: number;
  readonly height?: number;
}

type TextureLike = Omit<
  InstanceType<typeof THREE.Texture>,
  "image" | "userData"
> & {
  image: (CanvasImageSource & TextureImage) | undefined;
  readonly userData: UnknownRecord & {
    animationLayout?: MinecraftAnimationLayout;
    animationStartedAt?: number;
    animationFrame?: number;
  };
};

interface ResolvedModelLayerBase {
  readonly tints: readonly unknown[];
  readonly transformations: readonly unknown[];
}

type ResolvedModelLayer =
  | (ResolvedModelLayerBase & Readonly<{ type: "model"; model: string }>)
  | (ResolvedModelLayerBase &
      Readonly<{ type: "special"; model: string; special: unknown }>)
  | (ResolvedModelLayerBase & Readonly<{ type: "missing" }>);

interface StateControlView {
  readonly label: string;
  readonly detail: string;
  readonly defaultValue: unknown;
}

type RenderedStateControl = ItemModelStateControl & StateControlView;

interface TooltipLine {
  readonly runs: readonly TooltipTextRun[];
}

function threeObject(value: object): ThreeObject {
  return value as ThreeObject;
}

function threeMesh(value: object): ThreeMesh {
  return value as ThreeMesh;
}

function htmlElement(id: string): HTMLElement {
  return element(id, HTMLElement);
}

function inputElement(id: string): HTMLInputElement {
  return element(id, HTMLInputElement);
}

function textAreaElement(id: string): HTMLTextAreaElement {
  return element(id, HTMLTextAreaElement);
}

function buttonElement(id: string): HTMLButtonElement {
  return element(id, HTMLButtonElement);
}

function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return (
    value === "mainhand" ||
    value === "offhand" ||
    value === "head" ||
    value === "chest" ||
    value === "legs" ||
    value === "feet"
  );
}

function numericVector(value: unknown, fallback: VectorTuple): VectorTuple {
  if (!isUnknownArray(value)) return [...fallback];
  const number = (entry: unknown, defaultValue: number): number => {
    const parsed = Number(entry);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };
  return [
    number(value[0], fallback[0]),
    number(value[1], fallback[1]),
    number(value[2], fallback[2]),
  ];
}

function persistedState(value: unknown): PersistedState {
  if (!isRecord(value)) return {};
  const result: PersistedState = {};
  if (typeof value.itemId === "string") result.itemId = value.itemId;
  if (value.variantName === "server" || value.variantName === "client")
    result.variantName = value.variantName;
  if (typeof value.displayContext === "string")
    result.displayContext = value.displayContext;
  if (isEquipmentSlot(value.equipmentSlot))
    result.equipmentSlot = value.equipmentSlot;
  if (typeof value.inventorySlotId === "string")
    result.inventorySlotId = value.inventorySlotId;
  if (typeof value.zoom === "number" && Number.isFinite(value.zoom))
    result.zoom = value.zoom;
  if (typeof value.autoZoom === "boolean") result.autoZoom = value.autoZoom;
  if (isRecord(value.stateValues))
    result.stateValues = { ...value.stateValues };
  if (
    isRecord(value.variableValues) &&
    Object.values(value.variableValues).every(
      (entry) => typeof entry === "string",
    )
  ) {
    result.variableValues = Object.fromEntries(
      Object.entries(value.variableValues).map(([key, entry]) => [
        key,
        String(entry),
      ]),
    );
  }
  if (isRecord(value.previewTransform)) {
    result.previewTransform = {
      rotation: numericVector(value.previewTransform.rotation, [0, 0, 0]),
      translation: numericVector(value.previewTransform.translation, [0, 0, 0]),
      scale: numericVector(value.previewTransform.scale, [1, 1, 1]),
    };
  }
  if (isRecord(value.tooltip)) {
    const tooltip: PersistedTooltipState = {};
    if (typeof value.tooltip.visible === "boolean")
      tooltip.visible = value.tooltip.visible;
    if (typeof value.tooltip.advanced === "boolean")
      tooltip.advanced = value.tooltip.advanced;
    if (typeof value.tooltip.custom === "boolean")
      tooltip.custom = value.tooltip.custom;
    if (typeof value.tooltip.name === "string")
      tooltip.name = value.tooltip.name;
    if (typeof value.tooltip.lore === "string")
      tooltip.lore = value.tooltip.lore;
    if (typeof value.tooltip.glint === "boolean")
      tooltip.glint = value.tooltip.glint;
    result.tooltip = tooltip;
  }
  return result;
}

const vscode = acquireVsCodeApi<PersistedState, ItemOutboundMessage>();
let persisted = persistedState(vscode.getState());
const canvas = element("model-canvas", HTMLCanvasElement);
const stage = htmlElement("stage");
const inventoryBackground = htmlElement("inventory-background");
const inventorySlotSelector = htmlElement("inventory-slot-selector");
const loading = htmlElement("loading");
const tooltip = element("tooltip-canvas", HTMLCanvasElement);
const tooltipContext = canvasContext(tooltip, { alpha: true });
let rendererAvailable = true;
let rendererFailureReported = false;
function reportRendererFailure(reason: string): void {
  rendererAvailable = false;
  if (rendererFailureReported) return;
  rendererFailureReported = true;
  const detail = Messages.web.item.preview.text0001(reason);
  loading.hidden = false;
  loading.textContent = detail;
  setTimeout(() => vscode.postMessage({ type: "gpu-error", detail }), 0);
}
function createRenderer() {
  try {
    return new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    reportRendererFailure(
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
const renderer = createRenderer();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  reportRendererFailure(Messages.web.item.preview.text0002);
});
canvas.addEventListener("webglcontextrestored", () => {
  rendererAvailable = true;
  rendererFailureReported = false;
  void rebuildModel();
});

const scene = new THREE.Scene();
const ambient = new THREE.AmbientLight(0xffffff, 1.8);
const keyLight = new THREE.DirectionalLight(
  0xffffff,
  2.2,
) as unknown as ThreeLight;
keyLight.position.set(-3, 5, 6);
const fillLight = new THREE.DirectionalLight(
  0xb9c8ff,
  0.7,
) as unknown as ThreeLight;
fillLight.position.set(5, 1, -4);
scene.add(ambient, keyLight, fillLight);

const orthographicCamera = new THREE.OrthographicCamera(
  -1.5,
  1.5,
  1.5,
  -1.5,
  0.01,
  100,
) as unknown as ThreeCamera;
const perspectiveCamera = new THREE.PerspectiveCamera(
  38,
  1,
  0.01,
  100,
) as unknown as ThreeCamera;
orthographicCamera.position.set(0, 0, 3.4);
perspectiveCamera.position.set(0, 0, 3.4);
let camera: ThreeCamera = orthographicCamera;
let controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.target.set(0, 0, 0);

let payload: ItemPreviewPayload | undefined;
let variantName: ItemVariantName = "client";
let displayContext = "gui";
let zoom = 1;
let autoZoom = true;
let modelRoot: ThreeObject | undefined;
let modelGeneration = 0;
let stateValues: Record<string, unknown> = {};
let variableValues: Record<string, string> = {};
let textureCache = new Map<string, Promise<TextureLike>>();
let referenceTextureCache = new Map<string, Promise<TextureLike>>();
let animatedTextures = new Set<TextureLike>();
let glintMeshes: ThreeMesh[] = [];
let frame = 0;
let referenceRoot: ThreeObject | undefined;
let referenceGeneration = 0;
let perspectiveMode = false;
let equipmentSlot: EquipmentSlot = "mainhand";
let inventorySlotId = DEFAULT_MINECRAFT_INVENTORY_SLOT_ID;
let equipmentLayerRendered = false;
let referenceItemAnchorMatrix: ThreeMatrix | undefined;
let firstPersonReference: FirstPersonReference | undefined;
let firstPersonFrameDistance = 0;
let inventoryLayout: MinecraftInventoryLayout | undefined;
let previewTransform: PreviewTransform = {
  rotation: [0, 0, 0],
  translation: [0, 0, 0],
  scale: [1, 1, 1],
};
let previewTransformDefault: PreviewTransform = {
  rotation: [0, 0, 0],
  translation: [0, 0, 0],
  scale: [1, 1, 1],
};
const fontGlyphs = new Map<number, VanillaGlyph>();
const requestedGlyphs = new Set<number>();

function saveUiState() {
  persisted = {
    ...(payload ? { itemId: payload.id } : {}),
    variantName,
    displayContext,
    equipmentSlot,
    inventorySlotId,
    zoom,
    autoZoom,
    stateValues,
    variableValues,
    previewTransform,
    tooltip: {
      visible: inputElement("show-tooltip").checked,
      advanced: inputElement("advanced-tooltip").checked,
      custom: inputElement("custom-tooltip").checked,
      name: inputElement("custom-tooltip-name").value,
      lore: textAreaElement("custom-tooltip-lore").value,
      glint: inputElement("show-glint").checked,
    },
  };
  vscode.setState(persisted);
}

const contextNames: Readonly<Record<string, string>> = {
  none: Messages.web.item.preview.text0003,
  thirdperson_lefthand: Messages.web.item.preview.text0004,
  thirdperson_righthand: Messages.web.item.preview.text0005,
  firstperson_lefthand: Messages.web.item.preview.text0006,
  firstperson_righthand: Messages.web.item.preview.text0007,
  head: Messages.web.item.preview.text0008,
  gui: Messages.web.item.preview.text0009,
  ground: Messages.web.item.preview.text0010,
  fixed: Messages.web.item.preview.text0011,
  on_shelf: Messages.web.item.preview.text0012,
  player_equipment: Messages.web.item.preview.text0013,
};

const contextDescriptions: Readonly<Record<string, string>> = {
  none: Messages.web.item.preview.text0014,
  thirdperson_lefthand: Messages.web.item.preview.text0015,
  thirdperson_righthand: Messages.web.item.preview.text0016,
  firstperson_lefthand: Messages.web.item.preview.text0017,
  firstperson_righthand: Messages.web.item.preview.text0018,
  head: Messages.web.item.preview.text0019,
  gui: Messages.web.item.preview.text0020,
  ground: Messages.web.item.preview.text0021,
  fixed: Messages.web.item.preview.text0022,
  on_shelf: Messages.web.item.preview.text0023,
  player_equipment: Messages.web.item.preview.text0024,
};

interface CameraPreset {
  readonly perspective: boolean;
  readonly fov?: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

const cameraPresets: Readonly<Record<string, CameraPreset>> = {
  none: { perspective: false, position: [0, 0, 3.4], target: [0, 0, 0] },
  thirdperson_righthand: {
    perspective: true,
    position: [-3.1, 2.8, -3.1],
    target: [0, 0.5, 0],
  },
  thirdperson_lefthand: {
    perspective: true,
    position: [3.1, 2.8, -3.1],
    target: [0, 0.5, 0],
  },
  firstperson_righthand: {
    perspective: true,
    fov: 70,
    position: [0, 0, 0],
    target: [0, 0, -1],
  },
  firstperson_lefthand: {
    perspective: true,
    fov: 70,
    position: [0, 0, 0],
    target: [0, 0, -1],
  },
  head: { perspective: true, position: [-2.8, 3.6, -2.8], target: [0, 1.8, 0] },
  gui: { perspective: false, position: [0, 0, 3.4], target: [0, 0, 0] },
  ground: {
    perspective: true,
    position: [-3.2, 2.8, -3.2],
    target: [0, 0.15, 0],
  },
  fixed: {
    perspective: true,
    position: [-2.4, 1.8, -5],
    target: [0, 0.1, -0.5],
  },
  on_shelf: { perspective: true, position: [-3, 2.5, -3], target: [0, 0.8, 0] },
  player_equipment: {
    perspective: true,
    position: [-3.2, 2.4, 4.2],
    target: [0, 1, 0],
  },
};

function updateInventorySlotSelector(
  layout: MinecraftInventoryLayout | undefined,
  visible: boolean,
): void {
  const section = htmlElement("inventory-slot-section");
  section.hidden = displayContext !== "gui";
  inventorySlotSelector.hidden = !visible;
  if (!layout) return;
  inventorySlotSelector.style.left = `${layout.guiLeft}px`;
  inventorySlotSelector.style.top = `${layout.guiTop}px`;
  inventorySlotSelector.style.width = `${layout.guiWidth}px`;
  inventorySlotSelector.style.height = `${layout.guiHeight}px`;
  for (const button of queryElements(
    "[data-inventory-slot]",
    HTMLButtonElement,
  )) {
    const slot = minecraftInventorySlot(button.dataset.inventorySlot);
    button.style.left = `${(slot.x - MINECRAFT_INVENTORY_GUI.slotSize / 2) * layout.scale}px`;
    button.style.top = `${(slot.y - MINECRAFT_INVENTORY_GUI.slotSize / 2) * layout.scale}px`;
    button.style.width = `${layout.slotSize}px`;
    button.style.height = `${layout.slotSize}px`;
    const selected = slot.id === layout.slotId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  htmlElement("inventory-slot-label").textContent = minecraftInventorySlot(
    layout.slotId,
  ).label;
}

function updateInventoryBackground(): MinecraftInventoryLayout | undefined {
  const source = payload?.inventoryTexture;
  const gui = displayContext === "gui";
  const hasTexture = typeof source === "string" && source.length > 0;
  inventoryBackground.hidden = !gui || !hasTexture;
  if (!gui) {
    inventoryLayout = undefined;
    canvas.style.transform = "";
    canvas.style.clipPath = "";
    updateInventorySlotSelector(undefined, false);
    return undefined;
  }
  inventoryLayout = minecraftInventoryLayout(
    stage.clientWidth,
    stage.clientHeight,
    inventorySlotId,
  );
  inventorySlotId = inventoryLayout.slotId;
  inventoryBackground.style.left = `${inventoryLayout.guiLeft}px`;
  inventoryBackground.style.top = `${inventoryLayout.guiTop}px`;
  inventoryBackground.style.width = `${inventoryLayout.guiWidth}px`;
  inventoryBackground.style.height = `${inventoryLayout.guiHeight}px`;
  if (hasTexture) {
    inventoryBackground.style.backgroundImage = `url("${source}")`;
    inventoryBackground.style.backgroundSize = `${MINECRAFT_INVENTORY_GUI.atlasSize * inventoryLayout.scale}px ${MINECRAFT_INVENTORY_GUI.atlasSize * inventoryLayout.scale}px`;
  }
  canvas.style.transform = `translate(${inventoryLayout.canvasTranslateX}px, ${inventoryLayout.canvasTranslateY}px)`;
  canvas.style.clipPath =
    payload?.[variantName]?.oversizedInGui === true
      ? ""
      : inventoryLayout.clipPath;
  updateInventorySlotSelector(inventoryLayout, hasTexture);
  return inventoryLayout;
}

function buildInventorySlotSelector(): void {
  const fragment = document.createDocumentFragment();
  for (const slot of MINECRAFT_INVENTORY_SLOTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-slot-button";
    button.dataset.inventorySlot = slot.id;
    button.title = slot.label;
    button.setAttribute("aria-label", slot.label);
    button.addEventListener("click", () => {
      inventorySlotId = slot.id;
      updateInventoryBackground();
      saveUiState();
    });
    fragment.append(button);
  }
  inventorySlotSelector.replaceChildren(fragment);
}

function updatePreviewLighting(
  layers: readonly ResolvedModelLayer[] = [],
): void {
  if (displayContext === "gui") {
    // GUI 光照只看第一个活动模型, 读取其他层会选错光照模式
    const firstModel =
      layers[0]?.type === "missing" ? undefined : mergedModel(layers[0]?.model);
    const guiLight = firstModel?.gui_light ?? firstModel?.["gui-light"];
    const lighting = minecraftGuiLighting(
      guiLight === "front" ? "front" : "side",
    );
    ambient.color.set(0xffffff);
    ambient.intensity = lighting.ambient;
    keyLight.color.set(0xffffff);
    keyLight.intensity = lighting.directional;
    keyLight.position.fromArray(lighting.directions[0] ?? [0, 0, 1]);
    fillLight.color.set(0xffffff);
    fillLight.intensity = lighting.directional;
    fillLight.position.fromArray(lighting.directions[1] ?? [0, 0, -1]);
    return;
  }
  ambient.color.set(0xffffff);
  ambient.intensity = 1.8;
  keyLight.color.set(0xffffff);
  keyLight.intensity = 2.2;
  keyLight.position.set(-3, 5, 6);
  fillLight.color.set(0xb9c8ff);
  fillLight.intensity = 0.7;
  fillLight.position.set(5, 1, -4);
}

function isObject(value: unknown): value is UnknownRecord {
  return isRecord(value);
}

function applyVariables(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let result = value;
  for (const [name, replacement] of Object.entries(variableValues)) {
    result = result
      .replaceAll(`\${${name}}`, replacement)
      .replaceAll(`<arg:${name}>`, replacement)
      .replaceAll(`%${name}%`, replacement);
  }
  return result;
}

function collectStateControls(
  node: unknown,
  _path: string,
  found: Map<string, RenderedStateControl>,
): void {
  for (const control of collectItemModelStateControls(node)) {
    const defaultValue =
      control.kind === "boolean"
        ? conditionFromComponents(control.node)
        : control.kind === "range"
          ? rangeFromComponents(control.node)
          : selectFromComponents(control.node);
    found.set(control.key, {
      ...control,
      label:
        control.property ||
        (control.kind === "boolean"
          ? Messages.web.item.preview.text0025
          : control.kind === "range"
            ? Messages.web.item.preview.text0026
            : Messages.web.item.preview.text0027),
      detail:
        control.kind === "boolean"
          ? Messages.web.item.preview.text0028
          : control.kind === "range"
            ? Messages.web.item.preview.text0029
            : Messages.web.item.preview.text0030,
      defaultValue,
    });
  }
}

function buildStateControls(): void {
  const container = htmlElement("model-states");
  container.replaceChildren();
  const found = new Map<string, RenderedStateControl>();
  if (payload) {
    collectStateControls(
      (variantName === "client" ? payload.client : payload.server).model,
      variantName,
      found,
    );
  }
  if (found.size === 0) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = Messages.web.item.preview.text0031;
    container.append(hint);
    return;
  }
  for (const control of found.values()) {
    if (stateValues[control.key] === undefined) {
      stateValues[control.key] = control.defaultValue;
    }
    const label = document.createElement("label");
    label.className = "state-control";
    const heading = document.createElement("span");
    const title = document.createElement("span");
    title.textContent = readableProperty(control.label);
    title.title = control.label;
    const detail = document.createElement("small");
    detail.textContent = control.detail;
    heading.append(title, detail);
    label.append(heading);
    if (control.kind === "boolean") {
      const select = document.createElement("select");
      select.append(
        option("false", Messages.web.item.preview.text0032),
        option("true", Messages.web.item.preview.text0033),
      );
      select.value = String(stateValues[control.key]);
      select.addEventListener("change", () => {
        stateValues[control.key] = select.value === "true";
        resetPreviewTransformToModel();
        saveUiState();
        void rebuildModel();
      });
      label.append(select);
    } else if (control.kind === "select") {
      const select = document.createElement("select");
      select.append(
        option(
          "__fallback__",
          control.property === "minecraft:charge_type"
            ? Messages.web.item.preview.text0034
            : Messages.web.item.preview.text0035,
        ),
      );
      for (const value of control.values)
        select.append(
          option(
            value,
            control.property === "minecraft:charge_type"
              ? value === "arrow"
                ? Messages.web.item.preview.text0066
                : value === "rocket"
                  ? Messages.web.item.preview.text0067
                  : value
              : value,
          ),
        );
      select.value = String(stateValues[control.key]);
      select.addEventListener("change", () => {
        stateValues[control.key] = select.value;
        resetPreviewTransformToModel();
        saveUiState();
        void rebuildModel();
      });
      label.append(select);
    } else {
      const pair = document.createElement("span");
      pair.className = "range-pair";
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(control.minimum);
      range.max = String(control.maximum);
      range.step = String(control.step);
      range.value = String(stateValues[control.key]);
      const number = document.createElement("input");
      number.type = "number";
      number.min = range.min;
      number.max = range.max;
      number.step = range.step;
      number.value = range.value;
      const update = (value: string): void => {
        const parsed = Math.max(
          control.minimum,
          Math.min(control.maximum, Number(value) || 0),
        );
        stateValues[control.key] = parsed;
        range.value = String(parsed);
        number.value = String(parsed);
        resetPreviewTransformToModel();
        saveUiState();
        void rebuildModel();
      };
      range.addEventListener("input", () => update(range.value));
      number.addEventListener("change", () => update(number.value));
      pair.append(range, number);
      label.append(pair);
    }
    container.append(label);
  }
}

function readableProperty(value: unknown): string {
  const raw = String(value).replace(/^minecraft:/u, "");
  const translations: Readonly<Record<string, string>> = {
    broken: Messages.web.item.preview.text0036,
    "bundle/has_selected_item": Messages.web.item.preview.text0037,
    carried: Messages.web.item.preview.text0038,
    component: Messages.web.item.preview.text0039,
    damaged: Messages.web.item.preview.text0040,
    extended_view: Messages.web.item.preview.text0041,
    "fishing_rod/cast": Messages.web.item.preview.text0042,
    has_component: Messages.web.item.preview.text0043,
    keybind_down: Messages.web.item.preview.text0044,
    selected: Messages.web.item.preview.text0045,
    using_item: Messages.web.item.preview.text0046,
    view_entity: Messages.web.item.preview.text0047,
    custom_model_data: Messages.web.item.preview.text0048,
    "bundle/fullness": Messages.web.item.preview.text0049,
    compass: Messages.web.item.preview.text0050,
    cooldown: Messages.web.item.preview.text0051,
    count: Messages.web.item.preview.text0052,
    "crossbow/pull": Messages.web.item.preview.text0053,
    damage: Messages.web.item.preview.text0054,
    time: Messages.web.item.preview.text0055,
    use_cycle: Messages.web.item.preview.text0056,
    use_duration: Messages.web.item.preview.text0057,
    block_state: Messages.web.item.preview.text0058,
    charge_type: Messages.web.item.preview.text0059,
    context_dimension: Messages.web.item.preview.text0060,
    context_entity_type: Messages.web.item.preview.text0061,
    display_context: Messages.web.item.preview.text0062,
    local_time: Messages.web.item.preview.text0063,
    main_hand: Messages.web.item.preview.text0064,
    trim_material: Messages.web.item.preview.text0065,
  };
  return translations[raw] || raw;
}

function option(value: string, label: string): HTMLOptionElement {
  const result = document.createElement("option");
  result.value = value;
  result.textContent = label;
  return result;
}

function resolveNode(
  node: unknown,
  path: string,
  result: ResolvedModelLayer[],
  transformations: readonly unknown[] = [],
): void {
  if (typeof node === "string") {
    result.push({ type: "model", model: node, tints: [], transformations });
    return;
  }
  if (isUnknownArray(node)) {
    node.forEach((entry, index) =>
      resolveNode(entry, `${path}.${index}`, result, transformations),
    );
    return;
  }
  if (!isObject(node)) return;
  const type = itemModelNodeType(node);
  const nextTransforms =
    node.transformation === undefined
      ? transformations
      : [...transformations, node.transformation];
  const key = modelPropertyKey(node);
  switch (type) {
    case "model": {
      const model =
        typeof node.model === "string"
          ? node.model
          : typeof node.path === "string"
            ? node.path
            : undefined;
      if (model)
        result.push({
          type: "model",
          model,
          tints: isUnknownArray(node.tints) ? node.tints : [],
          transformations: nextTransforms,
        });
      return;
    }
    case "condition": {
      const defaultValue = conditionFromComponents(node);
      const selected =
        stateValues[key] === undefined
          ? defaultValue
          : Boolean(stateValues[key]);
      resolveNode(
        conditionModelBranch(node, selected),
        `${path}.${selected ? "on_true" : "on_false"}`,
        result,
        nextTransforms,
      );
      return;
    }
    case "range_dispatch":
      resolveNode(
        rangeModelBranch(
          node,
          Number(stateValues[key] ?? rangeFromComponents(node)),
        ),
        `${path}.range`,
        result,
        nextTransforms,
      );
      return;
    case "select": {
      const selectedValue =
        node.property === "minecraft:display_context"
          ? modelStateValueKey(itemDisplayContext())
          : (stateValues[key] ?? selectFromComponents(node));
      resolveNode(
        selectModelBranch(
          node,
          typeof selectedValue === "string"
            ? selectedValue
            : typeof selectedValue === "number" ||
                typeof selectedValue === "boolean"
              ? String(selectedValue)
              : "",
        ),
        `${path}.select`,
        result,
        nextTransforms,
      );
      return;
    }
    case "composite":
      resolveNode(node.models, `${path}.models`, result, nextTransforms);
      return;
    case "special": {
      const special = isObject(node.model) ? node.model : {};
      const base =
        typeof node.base === "string"
          ? node.base
          : typeof node.path === "string"
            ? node.path
            : typeof special.base === "string"
              ? special.base
              : undefined;
      result.push(
        base
          ? {
              type: "special",
              model: base,
              special,
              tints: isUnknownArray(node.tints) ? node.tints : [],
              transformations: nextTransforms,
            }
          : { type: "missing", tints: [], transformations: nextTransforms },
      );
      return;
    }
    case "empty":
    case "bundle/selected_item":
      return;
    default:
      if (typeof node.model === "string")
        result.push({
          type: "model",
          model: node.model,
          tints: [],
          transformations: nextTransforms,
        });
  }
}

function activeComponents(): Readonly<Record<string, unknown>> {
  return payload?.[variantName]?.components || {};
}

function conditionFromComponents(node: ItemModelNode): boolean {
  const components = activeComponents();
  const property = stringValue(node.property);
  if (property.endsWith("has_component") && typeof node.component === "string")
    return components[node.component] !== undefined;
  if (property.endsWith("damaged"))
    return Number(components["minecraft:damage"] || 0) > 0;
  if (property.endsWith("broken"))
    return (
      Number(components["minecraft:damage"] || 0) >=
      Number(components["minecraft:max_damage"] || Infinity)
    );
  if (property === "minecraft:custom_model_data") {
    const cmd = components["minecraft:custom_model_data"];
    return isObject(cmd) && isUnknownArray(cmd.flags)
      ? Boolean(cmd.flags[Number(node.index) || 0])
      : false;
  }
  if (property === "minecraft:fishing_rod/cast") return false;
  return false;
}

function selectFromComponents(node: ItemModelNode): string {
  const property = stringValue(node.property);
  if (property === "minecraft:charge_type") {
    const projectiles = activeComponents()["minecraft:charged_projectiles"];
    if (!isUnknownArray(projectiles) || projectiles.length === 0)
      return "__fallback__";
    const hasRocket = projectiles.some((projectile) => {
      const id =
        typeof projectile === "string"
          ? projectile
          : isObject(projectile)
            ? projectile.id
            : "";
      return String(id).endsWith("firework_rocket");
    });
    return hasRocket ? "rocket" : "arrow";
  }
  if (
    property === "minecraft:component" &&
    typeof node.component === "string"
  ) {
    const value = activeComponents()[node.component];
    return value === undefined ? "__fallback__" : modelStateValueKey(value);
  }
  if (property === "minecraft:trim_material") {
    const trim = activeComponents()["minecraft:trim"];
    return isObject(trim) && trim.material !== undefined
      ? modelStateValueKey(trim.material)
      : "__fallback__";
  }
  if (property === "minecraft:custom_model_data") {
    const cmd = activeComponents()["minecraft:custom_model_data"];
    const value =
      isObject(cmd) && isUnknownArray(cmd.strings)
        ? cmd.strings[Number(node.index) || 0]
        : undefined;
    return value === undefined ? "__fallback__" : modelStateValueKey(value);
  }
  if (property === "minecraft:block_state") {
    const states = activeComponents()["minecraft:block_state"];
    const rawKey = node.block_state_property ?? node["block-state-property"];
    const value =
      isObject(states) && typeof rawKey === "string"
        ? states[rawKey]
        : undefined;
    return value === undefined ? "__fallback__" : modelStateValueKey(value);
  }
  if (property === "minecraft:main_hand") return "right";
  if (property === "minecraft:context_dimension") return "minecraft:overworld";
  if (property === "minecraft:context_entity_type") return "minecraft:player";
  return "__fallback__";
}

function stateProperty(
  kind: string,
  property: string,
  fallback: unknown,
): unknown {
  const key = modelPropertyKey({ type: `minecraft:${kind}`, property });
  const value = stateValues[key] ?? stateValues[property];
  return value === undefined ? fallback : value;
}

function firstPersonItemUseState(): FirstPersonItemUseState {
  const material = String(payload?.[variantName]?.material || "").replace(
    /^minecraft:/u,
    "",
  );
  let animation: FirstPersonItemAnimation;
  switch (material) {
    case "bow":
    case "crossbow":
    case "fishing_rod":
      animation = material;
      break;
    default:
      animation = "none";
  }
  const chargeType = String(
    stateProperty("select", "minecraft:charge_type", "__fallback__"),
  );
  const pull =
    Number(stateProperty("range_dispatch", "minecraft:crossbow/pull", 0)) || 0;
  const explicitUseTicks = stateProperty(
    "range_dispatch",
    "minecraft:use_duration",
    undefined,
  );
  return {
    animation,
    using: Boolean(stateProperty("condition", "minecraft:using_item", false)),
  // 没有时长时用默认 25 游戏刻从拉弦值还原, 否则弩的手部动作不同步
    useTicks:
      Number(explicitUseTicks ?? (animation === "crossbow" ? pull * 25 : 0)) ||
      0,
    pull,
    charged: chargeType === "arrow" || chargeType === "rocket",
  };
}

function rangeFromComponents(node: ItemModelNode): number {
  const property = stringValue(node.property);
  const components = activeComponents();
  if (property.endsWith("damage")) {
    const damage = Number(components["minecraft:damage"] || 0);
    const maximum = Number(components["minecraft:max_damage"] || 1);
    return node.normalize === false ? damage : damage / Math.max(1, maximum);
  }
  if (property.endsWith("custom_model_data")) {
    const cmd = components["minecraft:custom_model_data"];
    if (isObject(cmd) && isUnknownArray(cmd.floats))
      return Number(cmd.floats[Number(node.index) || 0] || 0);
  }
  return 0;
}

function mergedModel(id: string | undefined): MergedLegacyModel | undefined {
  if (!id) return undefined;
  return mergeLegacyModel(payload?.models, id);
}

function resolvedTexture(
  model: MergedLegacyModel | Readonly<UnknownRecord> | undefined,
  token: unknown,
): string | undefined {
  if (!model) return undefined;
  return resolveTextureReference(
    {
      __id: typeof model.__id === "string" ? model.__id : "",
      __generated: model.__generated === true,
      ...(isObject(model.textures) ? { textures: model.textures } : {}),
    },
    token,
  );
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

function generatedLayerGeometry(texture: TextureLike) {
  const width =
    Number(texture.image?.naturalWidth || texture.image?.width) || 16;
  const height =
    Number(texture.image?.naturalHeight || texture.image?.height) || 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const front = 0.03125;
  const back = -front;
  addQuad(
    positions,
    uvs,
    indices,
    [
      [-1, -1, front],
      [1, -1, front],
      [1, 1, front],
      [-1, 1, front],
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
      [1, -1, back],
      [-1, -1, back],
      [-1, 1, back],
      [1, 1, back],
    ],
    [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  );

  let pixels: Uint8ClampedArray | undefined;
  try {
    const pixelCanvas = document.createElement("canvas");
    pixelCanvas.width = width;
    pixelCanvas.height = height;
    const context = canvasContext(pixelCanvas, { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    if (!texture.image) throw new Error(Messages.web.item.preview.text0086);
    context.drawImage(texture.image, 0, 0, width, height);
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    pixels = undefined;
  }
  if (pixels) {
    const opaque = (x: number, y: number): boolean =>
      x >= 0 &&
      x < width &&
      y >= 0 &&
      y < height &&
      (pixels[(y * width + x) * 4 + 3] ?? 0) > 0;
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        if (!opaque(x, y)) continue;
        const x0 = -1 + (x * 2) / width;
        const x1 = -1 + ((x + 1) * 2) / width;
        const y1 = 1 - (y * 2) / height;
        const y0 = 1 - ((y + 1) * 2) / height;
        const u0 = x / width;
        const u1 = (x + 1) / width;
        const v0 = 1 - (y + 1) / height;
        const v1 = 1 - y / height;
        if (!opaque(x - 1, y))
          addQuad(
            positions,
            uvs,
            indices,
            [
              [x0, y0, back],
              [x0, y0, front],
              [x0, y1, front],
              [x0, y1, back],
            ],
            [
              [u0, v0],
              [u1, v0],
              [u1, v1],
              [u0, v1],
            ],
          );
        if (!opaque(x + 1, y))
          addQuad(
            positions,
            uvs,
            indices,
            [
              [x1, y0, front],
              [x1, y0, back],
              [x1, y1, back],
              [x1, y1, front],
            ],
            [
              [u0, v0],
              [u1, v0],
              [u1, v1],
              [u0, v1],
            ],
          );
        if (!opaque(x, y - 1))
          addQuad(
            positions,
            uvs,
            indices,
            [
              [x0, y1, front],
              [x1, y1, front],
              [x1, y1, back],
              [x0, y1, back],
            ],
            [
              [u0, v0],
              [u1, v0],
              [u1, v1],
              [u0, v1],
            ],
          );
        if (!opaque(x, y + 1))
          addQuad(
            positions,
            uvs,
            indices,
            [
              [x0, y0, back],
              [x1, y0, back],
              [x1, y0, front],
              [x0, y0, front],
            ],
            [
              [u0, v0],
              [u1, v0],
              [u1, v1],
              [u0, v1],
            ],
          );
      }
  }
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

async function loadTexture(
  id: string,
  sourceOverrides?: UnknownRecord,
): Promise<TextureLike> {
  const canonical = namespaced(id);
  const cache = isObject(sourceOverrides)
    ? referenceTextureCache
    : textureCache;
  const cached = cache.get(canonical);
  if (cached) return cached;
  const override = sourceOverrides?.[canonical];
  const source =
    typeof override === "string"
      ? override
      : (payload?.textures?.[canonical] ?? payload?.missingTexture ?? "");
  const promise = new THREE.TextureLoader()
    .loadAsync(source)
    .then((texture) => {
      const result = texture as TextureLike;
      result.colorSpace = THREE.SRGBColorSpace;
      result.magFilter = THREE.NearestFilter;
      result.minFilter = THREE.NearestFilter;
      result.wrapS = THREE.RepeatWrapping;
      result.wrapT = THREE.RepeatWrapping;
      result.generateMipmaps = false;
      const animation = payload?.textureMetadata?.[canonical];
      if (isObject(animation)) {
        const width = Number(result.image?.naturalWidth || result.image?.width);
        const height = Number(
          result.image?.naturalHeight || result.image?.height,
        );
        const layout = minecraftAnimationLayout(animation, width, height);
        if (layout.ok) {
          result.userData.animationLayout = layout.layout;
          result.userData.animationStartedAt = performance.now();
          animateTexture(result, 0);
          animatedTextures.add(result);
        }
      }
      return result;
    });
  cache.set(canonical, promise);
  return promise;
}

function tintValue(tints: readonly unknown[], index: number): number {
  const tint = tints[index];
  if (!isObject(tint)) return 0xffffff;
  const type = itemModelNodeType(tint);
  if (type === "constant") {
    const value = tint.value;
    if (typeof value === "number") return value & 0xffffff;
    if (isUnknownArray(value) && value.length >= 3) {
      const scale = value.some((entry) => Number(entry) > 1) ? 1 : 255;
      return (
        ((Number(value[0]) * scale) << 16) |
        ((Number(value[1]) * scale) << 8) |
        (Number(value[2]) * scale)
      );
    }
  }
  if (type === "dye") {
    const dyed = activeComponents()["minecraft:dyed_color"];
    if (typeof dyed === "number") return dyed & 0xffffff;
    if (isObject(dyed) && typeof dyed.rgb === "number")
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
): number[] {
  const [fromX = 0, fromY = 0, fromZ = 0] = from;
  const [toX = 16, toY = 16, toZ = 16] = to;
  if (direction === "up" || direction === "down")
    return [fromX, fromZ, toX, toZ];
  if (direction === "east" || direction === "west")
    return [fromZ, 16 - toY, toZ, 16 - fromY];
  return [fromX, 16 - toY, toX, 16 - fromY];
}

async function elementGroup(
  model: MergedLegacyModel | Readonly<UnknownRecord>,
  elementValue: UnknownRecord,
  tints: readonly unknown[],
  sourceOverrides?: UnknownRecord,
): Promise<ThreeObject> {
  const group = threeObject(new THREE.Group());
  const element = elementValue;
  const from = isUnknownArray(element.from)
    ? element.from.map(Number)
    : [0, 0, 0];
  const to = isUnknownArray(element.to) ? element.to.map(Number) : [16, 16, 16];
  for (const [direction, face] of Object.entries(
    isObject(element.faces) ? element.faces : {},
  )) {
    if (!isObject(face) || typeof face.texture !== "string") continue;
    const textureId = resolvedTexture(model, face.texture);
    const texture = await loadTexture(
      textureId || "__missing__",
      sourceOverrides,
    );
    const geometry = new THREE.BufferGeometry();
    const positions = bakedFaceVertices(direction, from, to)
      .map((vertex) => [
        ((vertex[0] ?? 0) - 8) / 8,
        ((vertex[1] ?? 0) - 8) / 8,
        ((vertex[2] ?? 0) - 8) / 8,
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
  // shade 只影响方块光照, 物品面仍使用物品着色
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      color: tintValue(tints, Number(face.tintindex)),
    });
    group.add(threeMesh(new THREE.Mesh(geometry, material)));
  }
  if (isObject(element.rotation)) {
    const origin = isUnknownArray(element.rotation.origin)
      ? element.rotation.origin.map((value) => (Number(value) - 8) / 8)
      : [0, 0, 0];
    const [originX = 0, originY = 0, originZ = 0] = origin;
    const pivot = threeObject(new THREE.Group());
    pivot.position.set(originX, originY, originZ);
    group.position.set(-originX, -originY, -originZ);
    const angle = THREE.MathUtils.degToRad(Number(element.rotation.angle) || 0);
    if (element.rotation.axis === "x") pivot.rotation.x = angle;
    if (element.rotation.axis === "y") pivot.rotation.y = angle;
    if (element.rotation.axis === "z") pivot.rotation.z = angle;
    if (element.rotation.rescale === true && Math.abs(Math.cos(angle)) > 1e-6) {
      const factor = 1 / Math.abs(Math.cos(angle));
      if (element.rotation.axis === "x") pivot.scale.set(1, factor, factor);
      if (element.rotation.axis === "y") pivot.scale.set(factor, 1, factor);
      if (element.rotation.axis === "z") pivot.scale.set(factor, factor, 1);
    }
    pivot.add(group);
    return pivot;
  }
  return group;
}

async function referenceModelGroup(name: string): Promise<ThreeObject> {
  const reference = payload?.sceneReferences?.[name];
  if (
    !isObject(reference) ||
    !isObject(reference.model) ||
    !isUnknownArray(reference.model.elements)
  ) {
    return missingModelGroup();
  }
  const group = threeObject(new THREE.Group());
  group.name =
    name === "itemFrame"
      ? Messages.web.item.preview.text0068
      : Messages.web.item.preview.text0069;
  for (const element of reference.model.elements) {
    if (isObject(element))
      group.add(
        await elementGroup(
          reference.model,
          element,
          [],
          isObject(reference.textures) ? reference.textures : undefined,
        ),
      );
  }
  return group;
}

async function generatedGroup(
  model: MergedLegacyModel,
  tints: readonly unknown[],
): Promise<ThreeObject> {
  const group = threeObject(new THREE.Group());
  const layers = Object.keys(model.textures || {})
    .filter((key) => /^layer\d+$/u.test(key))
    .sort();
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    if (!layer) continue;
    const textureId = resolvedTexture(model, `#${layer}`);
    const texture = await loadTexture(textureId || "__missing__");
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      color: tintValue(tints, index),
    });
    const geometry = generatedLayerGeometry(texture);
    const mesh = threeMesh(new THREE.Mesh(geometry, material));
    mesh.position.z = index * 0.005;
    group.add(mesh);
  }
  return group;
}

async function missingModelGroup(): Promise<ThreeObject> {
  const texture = await loadTexture("__missing__");
  const materials = Array.from(
    { length: 6 },
    () =>
      new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  return threeMesh(
    new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), materials),
  );
}

function itemDisplayContext(): string {
  if (displayContext !== "player_equipment") return displayContext;
  const anchor = equipmentAnchor(equipmentSlot);
  return isObject(anchor) && typeof anchor.context === "string"
    ? anchor.context
    : displayContext;
}

async function buildLegacyModel(
  layer: Exclude<
    ResolvedModelLayer,
    Readonly<{ type: "missing" }> & ResolvedModelLayerBase
  >,
): Promise<ThreeObject> {
  const model = mergedModel(layer.model);
  if (!model) return missingModelGroup();
  let group: ThreeObject;
  if (model.__generated || !isUnknownArray(model.elements))
    group = await generatedGroup(model, layer.tints || []);
  else {
    group = threeObject(new THREE.Group());
    for (const element of model.elements)
      if (isObject(element))
        group.add(await elementGroup(model, element, layer.tints || []));
  }
  const transform = displayTransformFor(model, itemDisplayContext());
  if (isObject(transform)) applyDisplayTransform(group, transform);
  for (const transformation of layer.transformations || [])
    applyModernTransformation(group, transformation);
  if (layer.type === "special") applySpecialTransform(group, layer.special);
  return group;
}

function quaternion(value: unknown): InstanceType<typeof THREE.Quaternion> {
  if (isUnknownArray(value) && value.length === 4)
    return new THREE.Quaternion(...value.map(Number));
  if (typeof value === "number")
    return new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, -1, 0),
      THREE.MathUtils.degToRad(value),
    );
  return new THREE.Quaternion();
}

function vector(
  value: unknown,
  fallback: readonly [number, number, number],
): InstanceType<typeof THREE.Vector3> {
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
  if (isUnknownArray(transformation) && transformation.length === 16) {
    const matrix = new THREE.Matrix4();
    const values = transformation.map(Number);
    matrix.set(
      values[0] ?? 0,
      values[1] ?? 0,
      values[2] ?? 0,
      values[3] ?? 0,
      values[4] ?? 0,
      values[5] ?? 0,
      values[6] ?? 0,
      values[7] ?? 0,
      values[8] ?? 0,
      values[9] ?? 0,
      values[10] ?? 0,
      values[11] ?? 0,
      values[12] ?? 0,
      values[13] ?? 0,
      values[14] ?? 0,
      values[15] ?? 0,
    );
    multiplyLocalTransformation(group, matrix);
    return;
  }
  if (!isObject(transformation)) return;
  const matrix = new THREE.Matrix4().compose(
    vector(transformation.translation, [0, 0, 0]),
    quaternion(transformation.left_rotation ?? transformation["left-rotation"]),
    vector(transformation.scale, [1, 1, 1]),
  );
  const right = new THREE.Matrix4().makeRotationFromQuaternion(
    quaternion(
      transformation.right_rotation ?? transformation["right-rotation"],
    ),
  );
  matrix.multiply(right);
  multiplyLocalTransformation(group, matrix);
}

function multiplyLocalTransformation(
  group: ThreeObject,
  matrix: ThreeMatrix,
): void {
  // 展示变换必须先做, 交换顺序会改变旋转和位移结果
  group.updateMatrix();
  group.matrix.multiply(matrix);
  group.matrix.decompose(group.position, group.quaternion, group.scale);
  group.matrixWorldNeedsUpdate = true;
}

function applyDisplayTransform(
  group: ThreeObject,
  transform: Readonly<UnknownRecord>,
): void {
  const leftHand = itemDisplayContext().endsWith("_lefthand");
  const { rotation, translation, scale } = displayTransformValues(
    transform,
    leftHand,
  );
  group.rotation.order = "XYZ";
  group.rotation.set(
    THREE.MathUtils.degToRad(rotation[0] ?? 0),
    THREE.MathUtils.degToRad(rotation[1] ?? 0),
    THREE.MathUtils.degToRad(rotation[2] ?? 0),
  );
  group.position.add(
    new THREE.Vector3(
      translation[0] ?? 0,
      translation[1] ?? 0,
      translation[2] ?? 0,
    ),
  );
  group.scale.multiply(
    new THREE.Vector3(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1),
  );
}

function applyPreviewTransform(group: ThreeObject): void {
  const leftHand = itemDisplayContext().endsWith("_lefthand");
  const matrix = (
    value: PreviewTransform,
  ): InstanceType<typeof THREE.Matrix4> => {
    const resolved = displayTransformValues(
      {
        rotation: value.rotation,
        translation: value.translation,
        scale: value.scale,
      },
      leftHand,
    );
    return new THREE.Matrix4().compose(
      new THREE.Vector3(
        resolved.translation[0] ?? 0,
        resolved.translation[1] ?? 0,
        resolved.translation[2] ?? 0,
      ),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(resolved.rotation[0] ?? 0),
          THREE.MathUtils.degToRad(resolved.rotation[1] ?? 0),
          THREE.MathUtils.degToRad(resolved.rotation[2] ?? 0),
          "XYZ",
        ),
      ),
      new THREE.Vector3(
        resolved.scale[0] ?? 1,
        resolved.scale[1] ?? 1,
        resolved.scale[2] ?? 1,
      ),
    );
  };
  const delta = matrix(previewTransform).multiply(
    matrix(previewTransformDefault).invert(),
  );
  group.applyMatrix4(delta);
}

async function buildReferenceScene() {
  const generation = ++referenceGeneration;
  if (referenceRoot) {
    scene.remove(referenceRoot);
    disposeObject(referenceRoot);
    referenceRoot = undefined;
  }
  referenceItemAnchorMatrix = undefined;
  firstPersonReference = undefined;
  const root = threeObject(new THREE.Group());
  let renderedEquipment = false;
  let nextItemAnchorMatrix: ThreeMatrix | undefined;
  root.renderOrder = -10;
  if (
    displayContext === "head" ||
    displayContext.startsWith("thirdperson_") ||
    displayContext === "player_equipment"
  ) {
    const heldSide =
      displayContext.endsWith("_lefthand") ||
      (displayContext === "player_equipment" && equipmentSlot === "offhand")
        ? "left"
        : displayContext.endsWith("_righthand") ||
            (displayContext === "player_equipment" &&
              equipmentSlot === "mainhand")
          ? "right"
          : undefined;
    const player = await createPlayerModel(
      document.body.dataset.playerSkin,
      document.body.dataset.playerModel,
      heldSide,
    );
    root.add(player);
    if (
      displayContext === "player_equipment" &&
      payload?.equipmentSelection?.slot === equipmentSlot
    ) {
      const selection = payload.equipmentSelection;
      renderedEquipment = await applyEquipmentLayers(
        player,
        typeof selection.assetId === "string"
          ? payload.equipmentAssets?.[selection.assetId]
          : undefined,
        payload.equipmentTextures,
        equipmentSlot,
        typeof selection.dyeColor === "number" ? selection.dyeColor : undefined,
      );
    }
    const anchorSlot =
      displayContext === "player_equipment"
        ? equipmentSlot
        : displayContext === "head"
          ? "head"
          : displayContext.endsWith("_lefthand")
            ? "offhand"
            : "mainhand";
    root.updateMatrixWorld(true);
    const equipmentAnchors = (player as unknown as ThreeObjectShape).userData
      .equipmentAnchors;
    const anchor = isObject(equipmentAnchors)
      ? equipmentAnchors[anchorSlot]
      : undefined;
    const matrixWorld = isObject(anchor) ? anchor.matrixWorld : undefined;
    if (isObject(matrixWorld))
      nextItemAnchorMatrix = matrixWorld as unknown as ThreeMatrix;
  } else if (displayContext.startsWith("firstperson_")) {
    const firstPerson = (await createFirstPersonArm(
      document.body.dataset.playerSkin,
      document.body.dataset.playerModel,
      displayContext.endsWith("lefthand"),
    )) as unknown as FirstPersonReference;
    firstPersonReference = firstPerson;
    updateFirstPersonItemAnchor(
      firstPersonReference,
      firstPersonItemUseState(),
    );
    root.add(firstPerson);
    root.updateMatrixWorld(true);
    // 这里只保存手部里的位置, 保存自动取景位移会在重建时重复偏移
    nextItemAnchorMatrix = firstPerson.userData.itemAnchor?.matrix.clone();
  } else if (displayContext === "ground") {
    const grid = threeObject(new THREE.GridHelper(8, 16, 0x6c6c6c, 0x424242));
    grid.position.y = -0.72;
    root.add(grid);
  } else if (displayContext === "fixed") {
    root.add(await referenceModelGroup("itemFrame"));
  } else if (displayContext === "on_shelf") {
    root.add(await referenceModelGroup("shelf"));
  }
  if (generation !== referenceGeneration) {
    disposeObject(root);
    return;
  }
  equipmentLayerRendered =
    displayContext === "player_equipment" && renderedEquipment;
  referenceItemAnchorMatrix = nextItemAnchorMatrix;
  if (modelRoot)
    modelRoot.visible =
      displayContext !== "player_equipment" || !equipmentLayerRendered;
  referenceRoot = root;
  referenceRoot.userData.firstPersonBaseZ = referenceRoot.position.z;
  scene.add(root);
  htmlElement("first-person-crosshair").hidden =
    !displayContext.startsWith("firstperson_");
  htmlElement("reference-label").textContent =
    displayContext === "player_equipment"
      ? `${contextNames[displayContext] ?? displayContext} · ${element("equipment-slot", HTMLSelectElement).selectedOptions[0]?.textContent || ""}`
      : contextNames[displayContext] || displayContext;
  if (
    autoZoom &&
    ["head", "fixed", "on_shelf", "player_equipment"].includes(
      displayContext,
    ) &&
    modelRoot
  )
    fitModel();
  if (displayContext.includes("person_") && modelRoot) void rebuildModel();
}

function applySpecialTransform(group: ThreeObject, special: unknown): void {
  switch (itemModelNodeType(special)) {
    case "shield":
      group.scale.setScalar(0.9);
      return;
    case "trident":
      group.rotation.z -= Math.PI / 4;
      return;
    case "head":
    case "player_head":
      group.scale.setScalar(0.8);
      return;
    case "banner":
      group.scale.set(0.72, 0.72, 0.72);
  }
}

function disposeObject(root: ThreeObject | undefined): void {
  root?.traverse((entry: ThreeObject) => {
    if (entry.isMesh !== true) return;
    const mesh = threeMesh(entry);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material))
      mesh.material.forEach((material) => material.dispose());
    else mesh.material.dispose();
  });
}

function addGlint(root: ThreeObject): void {
  glintMeshes = [];
  const enchantments = activeComponents()["minecraft:enchantments"];
  if (
    !inputElement("show-glint").checked ||
    !enchantments ||
    (isObject(enchantments) && Object.keys(enchantments).length === 0)
  )
    return;
  root.traverse((entry: ThreeObject) => {
    if (entry.isMesh !== true) return;
    const mesh = threeMesh(entry);
    const sourceMaterials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const clone = threeMesh(mesh.clone());
    clone.material = sourceMaterials.map(
      () =>
        new THREE.MeshBasicMaterial({
          color: 0x8155d9,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    );
    if (!Array.isArray(mesh.material)) {
      const material = clone.material[0];
      if (material) clone.material = material;
    }
    clone.scale.multiplyScalar(1.004);
    entry.parent?.add(clone);
    glintMeshes.push(clone);
  });
}

function placeInReference(root: ThreeObject): void {
  if (displayContext.startsWith("firstperson_") && firstPersonReference) {
    const anchor = updateFirstPersonItemAnchor(
      firstPersonReference,
      firstPersonItemUseState(),
    );
    referenceRoot?.updateMatrixWorld(true);
    const matrix = isObject(anchor) ? anchor.matrix : undefined;
    if (isObject(matrix))
      referenceItemAnchorMatrix = (matrix as unknown as ThreeMatrix).clone();
  }
  if (
    displayContext === "head" ||
    displayContext.includes("person_") ||
    displayContext === "player_equipment"
  ) {
    if (referenceItemAnchorMatrix) root.applyMatrix4(referenceItemAnchorMatrix);
    return;
  }

  switch (displayContext) {
    case "ground":
      root.position.y -= 0.52;
      return;
    case "fixed":
      // 预览坐标放大了两倍, 这里要还原展示框的位移和缩放
      root.position.z += 0.875;
      root.scale.multiplyScalar(0.5);
      return;
    case "on_shelf": {
      // 书架中槽要先垂直居中, 再向前移动并缩小到四分之一
      const centerY = new THREE.Box3()
        .setFromObject(root)
        .getCenter(new THREE.Vector3()).y;
      root.position.y -= centerY * 0.25;
      root.position.z -= 0.5;
      root.scale.multiplyScalar(0.25);
    }
  }
}

function frameFirstPersonReference(): void {
  if (!displayContext.startsWith("firstperson_") || !camera.isPerspectiveCamera)
    return;
  const roots = [referenceRoot, modelRoot].filter(
    (root): root is ThreeObject => root !== undefined,
  );
  if (roots.length === 0) return;
  for (const root of roots) {
    if (
      typeof root.userData.firstPersonBaseZ !== "number" ||
      !Number.isFinite(root.userData.firstPersonBaseZ)
    )
      root.userData.firstPersonBaseZ = root.position.z;
    root.position.z = root.userData.firstPersonBaseZ;
    root.updateMatrixWorld(true);
  }
  if (autoZoom) {
    const box = new THREE.Box3();
    box.makeEmpty();
    for (const root of roots) box.union(new THREE.Box3().setFromObject(root));
    if (!box.isEmpty()) {
      firstPersonFrameDistance = firstPersonFramingDistance(
        {
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        },
        camera.fov,
        camera.aspect,
        0.88,
      );
    }
  }
  for (const root of roots) {
    if (typeof root.userData.firstPersonBaseZ !== "number") continue;
    root.position.z = root.userData.firstPersonBaseZ - firstPersonFrameDistance;
    root.updateMatrixWorld(true);
  }
}

async function rebuildModel(): Promise<void> {
  if (!payload) return;
  const generation = ++modelGeneration;
  loading.hidden = false;
  loading.textContent = Messages.web.item.preview.text0070;
  const layers: ResolvedModelLayer[] = [];
  resolveNode(payload[variantName].model, variantName, layers);
  updatePreviewLighting(layers);
  updateInventoryBackground();
  const root = threeObject(new THREE.Group());
  try {
    if (layers.length === 0)
      loading.textContent = Messages.web.item.preview.text0071;
    else
      for (const layer of layers)
        root.add(
          layer.type === "missing"
            ? await missingModelGroup()
            : await buildLegacyModel(layer),
        );
    const finalSceneTransform = displayContext.includes("person_");
    if (!finalSceneTransform) applyPreviewTransform(root);
    placeInReference(root);
    if (generation !== modelGeneration) {
      disposeObject(root);
      return;
    }
    if (modelRoot) {
      scene.remove(modelRoot);
      disposeObject(modelRoot);
    }
    modelRoot = root;
    modelRoot.userData.firstPersonBaseZ = modelRoot.position.z;
    modelRoot.visible =
      displayContext !== "player_equipment" || !equipmentLayerRendered;
    scene.add(modelRoot);
    addGlint(modelRoot);
    if (autoZoom && !displayContext.startsWith("firstperson_")) fitModel();
    frameFirstPersonReference();
    if (finalSceneTransform) applyPreviewTransform(root);
    let meshCount = 0;
    root.traverse((entry: ThreeObject) => {
      if (entry.isMesh) meshCount += 1;
    });
    if (layers.length > 0 && meshCount === 0) {
      loading.hidden = false;
      loading.textContent = Messages.web.item.preview.text0072;
    } else {
      loading.hidden = true;
    }
    updateTooltip();
    vscode.postMessage({ type: "rendered", id: payload.id });
  } catch (error) {
    root.add(await missingModelGroup());
    if (modelRoot) scene.remove(modelRoot);
    modelRoot = root;
    scene.add(root);
    loading.textContent = Messages.web.item.preview.text0073;
    vscode.postMessage({
      type: "error",
      detail:
        error instanceof Error ? error.stack || error.message : String(error),
    });
  }
}

function fitModel(): void {
  if (!modelRoot) return;
  const inventory = updateInventoryBackground();
  if (displayContext === "gui" && inventory && camera.isOrthographicCamera) {
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0, 3.4);
    camera.up.set(0, 1, 0);
    zoom = minecraftGuiCameraZoom(stage.clientHeight, inventory.scale);
    autoZoom = true;
    updateCameraZoom();
    controls.update();
    saveUiState();
    return;
  }
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (
    (["head", "fixed", "on_shelf", "player_equipment"].includes(
      displayContext,
    ) ||
      displayContext.startsWith("thirdperson_")) &&
    referenceRoot
  ) {
    box.union(new THREE.Box3().setFromObject(referenceRoot));
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maximum = Math.max(size.x, size.y, size.z, 0.01);
  controls.target.copy(center);
  const direction = camera.position.clone().sub(controls.target).normalize();
  camera.position
    .copy(center)
    .add(
      direction.multiplyScalar(
        camera.isPerspectiveCamera ? maximum * 2.7 : 3.4,
      ),
    );
  zoom = Math.min(8, Math.max(0.15, 1.85 / maximum));
  autoZoom = true;
  updateCameraZoom();
  controls.update();
  saveUiState();
}

function updateCameraZoom(): void {
  if (displayContext === "gui") {
    const inventory = inventoryLayout ?? updateInventoryBackground();
    if (inventory)
      zoom = minecraftGuiCameraZoom(stage.clientHeight, inventory.scale);
  }
  if (camera.isOrthographicCamera) camera.zoom = zoom;
  else
    camera.fov = Math.max(
      8,
      Math.min(90, (cameraPresets[displayContext]?.fov ?? 38) / zoom),
    );
  camera.updateProjectionMatrix();
  frameFirstPersonReference();
  htmlElement("zoom-value").textContent =
    displayContext === "gui"
      ? Messages.web.item.preview.text0074
      : `${Math.round(zoom * 100)}%`;
}

function setZoom(value: number): void {
  if (displayContext === "gui") return;
  zoom = Math.max(0.1, Math.min(16, value));
  autoZoom = false;
  updateCameraZoom();
  saveUiState();
}

function setView(name: string): void {
  if (displayContext === "gui") return;
  const center = controls.target.clone();
  const distance = camera.position.distanceTo(center) || 3.4;
  const directions: Readonly<
    Record<string, readonly [number, number, number]>
  > = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 1, 0.001],
    bottom: [0, -1, 0.001],
  };
  const direction = directions[name] ?? [0, 0, 1];
  camera.position
    .copy(center)
    .add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
  camera.up.set(0, 1, 0);
  if (name === "top" || name === "bottom")
    camera.up.set(0, 0, name === "top" ? -1 : 1);
  controls.update();
}

function replaceCamera(next: ThreeCamera): void {
  if (displayContext === "gui" && next !== orthographicCamera) return;
  const position = camera.position.clone();
  const target = controls.target.clone();
  controls.dispose();
  camera = next;
  camera.position.copy(position);
  camera.aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  const replacement = new OrbitControls(camera, canvas);
  replacement.enableDamping = true;
  replacement.dampingFactor = 0.08;
  replacement.enablePan = false;
  replacement.enableZoom = false;
  replacement.target.copy(target);
  controls = replacement;
  updateSize();
  updateCameraZoom();
}

function applyContextPreset(): void {
  const preset = cameraPresets[displayContext] ?? {
    perspective: false,
    position: [0, 0, 3.4],
    target: [0, 0, 0],
  };
  updateInventoryBackground();
  updatePreviewLighting();
  if (!displayContext.startsWith("firstperson_")) firstPersonFrameDistance = 0;
  perspectiveMode = displayContext === "gui" ? false : preset.perspective;
  const wanted = perspectiveMode ? perspectiveCamera : orthographicCamera;
  if (camera !== wanted) replaceCamera(wanted);
  perspectiveCamera.fov = preset.fov ?? 38;
  camera.position.set(...preset.position);
  controls.target.set(...preset.target);
  controls.enabled = displayContext !== "gui";
  controls.enableDamping = displayContext !== "gui";
  controls.enableRotate =
    displayContext !== "gui" && !displayContext.startsWith("firstperson_");
  if (displayContext === "gui") autoZoom = true;
  updateCameraZoom();
  controls.update();
  updateGuiControlState();
  htmlElement("context-description").textContent =
    contextDescriptions[displayContext] || "";
  for (const button of queryElements("[data-context]", HTMLButtonElement)) {
    button.classList.toggle(
      "selected",
      button.dataset.context === displayContext,
    );
  }
  htmlElement("equipment-field").hidden = displayContext !== "player_equipment";
  equipmentLayerRendered = false;
  void buildReferenceScene().catch((error: unknown) => {
    vscode.postMessage({
      type: "error",
      detail: Messages.web.item.preview.text0075(
        error instanceof Error ? error.message : String(error),
      ),
    });
  });
}

function updateGuiControlState(): void {
  const locked = displayContext === "gui";
  const cameraMode = buttonElement("camera-mode");
  cameraMode.disabled = locked;
  cameraMode.innerHTML = Messages.web.item.preview.text0076(
    perspectiveMode ? "◈" : "◫",
    perspectiveMode
      ? Messages.web.item.preview.text0084
      : Messages.web.item.preview.text0085,
  );
  for (const control of queryElements(
    "[data-view], #fit-model, #zoom-out, #zoom-in, #zoom-value",
    HTMLButtonElement,
  )) {
    control.disabled = locked;
  }
  htmlElement("interaction-hint").textContent = locked
    ? Messages.web.item.preview.text0077
    : Messages.web.item.preview.text0078;
  if (locked) {
    htmlElement("zoom-editor").hidden = true;
    htmlElement("zoom-value").hidden = false;
  }
}

function buildTransformControls(): void {
  const container = htmlElement("transform-controls");
  container.replaceChildren();
  const definitions: readonly Readonly<{
    key: TransformKey;
    label: string;
    minimum: number;
    maximum: number;
    step: number;
  }>[] = [
    {
      key: "rotation",
      label: Messages.web.item.preview.text0079,
      minimum: -180,
      maximum: 180,
      step: 1,
    },
    {
      key: "translation",
      label: Messages.web.item.preview.text0080,
      minimum: -80,
      maximum: 80,
      step: 0.25,
    },
    {
      key: "scale",
      label: Messages.web.item.preview.text0081,
      minimum: 0,
      maximum: 4,
      step: 0.01,
    },
  ];
  for (const definition of definitions) {
    const group = document.createElement("div");
    group.className = "transform-group";
    const heading = document.createElement("div");
    heading.className = "transform-heading";
    const title = document.createElement("span");
    title.textContent = definition.label;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = Messages.web.item.preview.text0082;
    heading.append(title, reset);
    group.append(heading);
    const inputs: {
      range: HTMLInputElement;
      number: HTMLInputElement;
      index: 0 | 1 | 2;
    }[] = [];
    const axes: readonly (readonly [0 | 1 | 2, "x" | "y" | "z"])[] = [
      [0, "x"],
      [1, "y"],
      [2, "z"],
    ];
    axes.forEach(([index, axis]) => {
      const row = document.createElement("label");
      row.className = "axis-control";
      row.dataset.axis = axis;
      const axisLabel = document.createElement("span");
      axisLabel.textContent = axis.toUpperCase();
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(definition.minimum);
      range.max = String(definition.maximum);
      range.step = String(definition.step);
      const number = document.createElement("input");
      number.type = "number";
      number.min = range.min;
      number.max = range.max;
      number.step = range.step;
      const update = (raw: string): void => {
        const value = Math.max(
          definition.minimum,
          Math.min(definition.maximum, Number(raw) || 0),
        );
        previewTransform[definition.key][index] = value;
        range.value = String(value);
        number.value = String(value);
        saveUiState();
        void rebuildModel();
      };
      range.value = String(previewTransform[definition.key][index]);
      number.value = range.value;
      range.addEventListener("input", () => update(range.value));
      number.addEventListener("change", () => update(number.value));
      row.append(axisLabel, range, number);
      group.append(row);
      inputs.push({ range, number, index });
    });
    reset.addEventListener("click", () => {
      previewTransform[definition.key] = [
        ...previewTransformDefault[definition.key],
      ];
      for (const input of inputs) {
        const value = previewTransformDefault[definition.key][input.index];
        input.range.value = String(value);
        input.number.value = String(value);
      }
      saveUiState();
      void rebuildModel();
    });
    container.append(group);
  }
}

function modelTransformDefaults(): PreviewTransform {
  const layers: ResolvedModelLayer[] = [];
  if (payload) resolveNode(payload[variantName].model, variantName, layers);
  for (const layer of layers) {
    if (layer.type === "missing") continue;
    const model = mergedModel(layer.model);
    const transform = displayTransformFor(model, itemDisplayContext());
    if (!isObject(transform)) continue;
    return {
      rotation: numericVector(transform.rotation, [0, 0, 0]),
      translation: numericVector(transform.translation, [0, 0, 0]),
      scale: numericVector(transform.scale, [1, 1, 1]),
    };
  }
  return { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] };
}

function resetPreviewTransformToModel(): void {
  previewTransformDefault = modelTransformDefaults();
  previewTransform = {
    rotation: [...previewTransformDefault.rotation],
    translation: [...previewTransformDefault.translation],
    scale: [...previewTransformDefault.scale],
  };
  buildTransformControls();
}

function updateSize(): void {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  const aspect = width / height;
  orthographicCamera.left = -1.5 * aspect;
  orthographicCamera.right = 1.5 * aspect;
  orthographicCamera.top = 1.5;
  orthographicCamera.bottom = -1.5;
  orthographicCamera.updateProjectionMatrix();
  perspectiveCamera.aspect = aspect;
  perspectiveCamera.updateProjectionMatrix();
  const inventory = updateInventoryBackground();
  if (inventory) updateCameraZoom();
  frameFirstPersonReference();
}

function buildVariables(): void {
  const section = htmlElement("variable-section");
  const container = htmlElement("variables");
  container.replaceChildren();
  const variables = payload?.variables || [];
  section.hidden = variables.length === 0;
  for (const name of variables) {
    if (variableValues[name] === undefined) variableValues[name] = name;
    const label = document.createElement("label");
    label.className = "control-field";
    const title = document.createElement("span");
    title.textContent = name;
    const input = document.createElement("input");
    input.value = variableValues[name];
    input.addEventListener("input", () => {
      variableValues[name] = input.value;
      saveUiState();
      updateTooltip();
    });
    label.append(title, input);
    container.append(label);
  }
}

function deepReplace(value: unknown): unknown {
  if (typeof value === "string") return applyVariables(value);
  if (isUnknownArray(value)) return value.map(deepReplace);
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepReplace(entry)]),
    );
  return value;
}

function tooltipLine(
  value: unknown,
  color?: string,
  baseStyle: TooltipTextStyle = {},
): TooltipLine {
  const resolved = deepReplace(value);
  const inherited: TooltipTextStyle = {
    ...baseStyle,
    ...(color === undefined ? {} : { color }),
  };
  const runs = tooltipTextRuns(resolved, inherited, payload?.translations) ?? [
    {
      text:
        typeof resolved === "string"
          ? resolved
          : (JSON.stringify(resolved) ?? String(resolved)),
      style: inherited,
    },
  ];
  return { runs };
}

function tooltipLines(): TooltipLine[] {
  if (!payload) return [];
  if (inputElement("custom-tooltip").checked) {
    const lore = textAreaElement("custom-tooltip-lore").value.split(/\r?\n/u);
    return [
      tooltipLine(
        inputElement("custom-tooltip-name").value ||
          Messages.web.item.preview.text0083,
        "#ffffff",
      ),
      ...lore.map((line) => tooltipLine(line, "#aaaaaa")),
    ];
  }
  const variant = payload[variantName];
  const components = variant.components || {};
  const tooltipDisplay = components["minecraft:tooltip_display"];
  if (tooltipDisplayHidden(tooltipDisplay)) return [];
  const configuredEnchantments = components["minecraft:enchantments"];
  const enchantments =
    isObject(configuredEnchantments) && isObject(configuredEnchantments.levels)
      ? configuredEnchantments.levels
      : configuredEnchantments;
  const rarity = stringValue(components["minecraft:rarity"], "common");
  const nameColor = rarityTooltipColor(
    rarity,
    isObject(enchantments) &&
      Object.values(enchantments).some((level) => Number(level) > 0),
  );
  const [materialNamespace = "minecraft", materialPath = variant.material] =
    variant.material.includes(":")
      ? variant.material.split(":", 2)
      : ["minecraft", variant.material];
  const defaultName = {
    translate: `item.${materialNamespace}.${materialPath}`,
  };
  const customName = components["minecraft:custom_name"];
  const lines = [
    customName !== undefined
      ? tooltipLine(customName, nameColor, { italic: true })
      : tooltipLine(
          components["minecraft:item_name"] || defaultName,
          nameColor,
        ),
  ];
  if (tooltipDisplayShows(tooltipDisplay, "minecraft:jukebox_playable")) {
    const description = jukeboxTooltipDescription(
      components["minecraft:jukebox_playable"],
      payload.jukeboxSongs,
    );
    if (description !== undefined)
      lines.push(tooltipLine(description, "#aaaaaa"));
  }
  if (tooltipDisplayShows(tooltipDisplay, "minecraft:stored_enchantments")) {
    for (const descriptor of enchantmentTooltipDescriptors(
      components["minecraft:stored_enchantments"],
      payload.translations,
    )) {
      lines.push(tooltipLine(descriptor.text, descriptor.color));
    }
  }
  if (tooltipDisplayShows(tooltipDisplay, "minecraft:enchantments")) {
    for (const descriptor of enchantmentTooltipDescriptors(
      enchantments,
      payload.translations,
    )) {
      lines.push(tooltipLine(descriptor.text, descriptor.color));
    }
  }
  const lore = components["minecraft:lore"];
  if (
    tooltipDisplayShows(tooltipDisplay, "minecraft:lore") &&
    isUnknownArray(lore)
  ) {
    for (const entry of lore)
      lines.push(tooltipLine(entry, "#aa00aa", { italic: true }));
  }
  const attributes = components["minecraft:attribute_modifiers"];
  const entries = isUnknownArray(attributes)
    ? attributes
    : isObject(attributes) && isUnknownArray(attributes.modifiers)
      ? attributes.modifiers
      : [];
  if (tooltipDisplayShows(tooltipDisplay, "minecraft:attribute_modifiers")) {
    for (const descriptor of attributeTooltipDescriptors(
      entries,
      payload.translations,
    )) {
      if (descriptor.blank) lines.push({ runs: [] });
      else
        lines.push(
          tooltipLine(
            descriptor.value ?? descriptor.text ?? "",
            descriptor.color || "#ffffff",
          ),
        );
    }
  }
  if (
    tooltipDisplayShows(tooltipDisplay, "minecraft:unbreakable") &&
    components["minecraft:unbreakable"] !== undefined
  ) {
    lines.push(tooltipLine({ translate: "item.unbreakable" }, "#5555ff"));
  }
  if (inputElement("advanced-tooltip").checked) {
    const damage = Number(components["minecraft:damage"]);
    const maximumDamage = Number(components["minecraft:max_damage"]);
    if (
      tooltipDisplayShows(tooltipDisplay, "minecraft:damage") &&
      Number.isFinite(damage) &&
      damage > 0 &&
      Number.isFinite(maximumDamage) &&
      maximumDamage > 0
    ) {
      lines.push(
        tooltipLine(
          {
            translate: "item.durability",
            with: [Math.max(0, maximumDamage - damage), maximumDamage],
          },
          "#ffffff",
        ),
      );
    }
    lines.push(tooltipLine(variant.material, "#555555"));
    const componentCount = Object.keys(components).length;
    if (componentCount > 0)
      lines.push(
        tooltipLine(
          { translate: "item.components", with: [componentCount] },
          "#555555",
        ),
      );
  }
  return lines;
}

function requestedCodepoints(lines: readonly TooltipLine[]): void {
  const codepoints = new Set([0xfffd]);
  for (const line of lines)
    for (const run of line.runs)
      for (const character of run.text || "") {
        const codepoint = character.codePointAt(0);
        if (!inlineImage(character) && codepoint !== undefined)
          codepoints.add(codepoint);
      }
  const missing = [...codepoints].filter(
    (codepoint) =>
      !fontGlyphs.has(codepoint) && !requestedGlyphs.has(codepoint),
  );
  if (missing.length > 0) {
    missing.forEach((codepoint) => requestedGlyphs.add(codepoint));
    vscode.postMessage({ type: "glyphs", codepoints: missing });
  }
}

function glyphFor(character: string): VanillaGlyph | undefined {
  const codepoint = character.codePointAt(0);
  if (codepoint === undefined) return fontGlyphs.get(0xfffd);
  return fontGlyphs.get(codepoint) || fontGlyphs.get(0xfffd);
}

function runWidth(run: TooltipTextRun): number {
  if (typeof run.shift === "number" && Number.isInteger(run.shift))
    return run.shift;
  let width = 0;
  for (const character of run.text ?? "") {
    const imageWidth = inlineAdvance(character);
    if (imageWidth !== undefined) {
      width += imageWidth;
      continue;
    }
    const glyph = glyphFor(character);
    width += glyph ? tooltipGlyphAdvance(glyph, run.style.bold === true) : 9;
  }
  return width;
}

function colorValue(value: unknown, fallback = "#ffffff"): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
    ? value
    : fallback;
}

function shadowColor(value: unknown): string {
  const number = Number.parseInt(colorValue(value).slice(1), 16);
  const red = ((number >> 16) & 0xff) >> 2;
  const green = ((number >> 8) & 0xff) >> 2;
  const blue = (number & 0xff) >> 2;
  return `rgb(${red}, ${green}, ${blue})`;
}

function drawRun(run: TooltipTextRun, startX: number, y: number): number {
  if (typeof run.shift === "number" && Number.isInteger(run.shift))
    return startX + run.shift;
  let x = startX;
  const color = colorValue(run.style.color);
  for (const character of run.text ?? "") {
    const imageAdvance = drawInlineImage(tooltipContext, character, x, y, 2);
    if (imageAdvance !== undefined) {
      x += imageAdvance;
      continue;
    }
    const glyph = glyphFor(character);
    if (!glyph) {
      x += 9;
      continue;
    }
    const top = y + 7 - glyph.ascent;
    const shadowOffset = tooltipGlyphShadowOffset(glyph);
    drawTooltipGlyph(
      tooltipContext,
      glyph,
      x + shadowOffset,
      top + shadowOffset,
      shadowColor(color),
      run.style,
    );
    drawTooltipGlyph(tooltipContext, glyph, x, top, color, run.style);
    const advance = tooltipGlyphAdvance(glyph, run.style.bold === true);
    if (run.style.underlined) {
      tooltipContext.fillStyle = color;
      tooltipContext.fillRect(x * 2, (y + 8) * 2, advance * 2, 2);
    }
    if (run.style.strikethrough) {
      tooltipContext.fillStyle = color;
      tooltipContext.fillRect(x * 2, (y + 4) * 2, advance * 2, 2);
    }
    x += advance;
  }
  return x;
}

function updateTooltip(): void {
  tooltip.hidden = !inputElement("show-tooltip").checked || !payload;
  if (tooltip.hidden || !payload) return;
  const lines = tooltipLines();
  if (lines.length === 0) {
    tooltip.hidden = true;
    return;
  }
  requestedCodepoints(lines);
  const contentWidth = Math.max(
    1,
    ...lines.map((line) =>
      line.runs.reduce((width, run) => width + runWidth(run), 0),
    ),
  );
  const layout = tooltipLayout(
    contentWidth,
    lines.map(() => 10),
  );
  tooltip.width = layout.outerWidth * 2;
  tooltip.height = layout.outerHeight * 2;
  tooltip.style.width = `${layout.outerWidth * 2}px`;
  tooltip.style.height = `${layout.outerHeight * 2}px`;
  tooltipContext.imageSmoothingEnabled = false;
  tooltipContext.clearRect(0, 0, tooltip.width, tooltip.height);
  const activeVariant = payload[variantName];
  const componentStyle = activeVariant.components?.["minecraft:tooltip_style"];
  const styleId =
    activeVariant.tooltipStyle ||
    (typeof componentStyle === "string" ? componentStyle : undefined);
  const style = styleId
    ? payload.tooltipStyles?.[styleId]
    : payload.tooltipStyles?.default;
  if (!drawTooltipStyle(tooltipContext, layout, style, 2, updateTooltip)) {
    tooltip.style.visibility = "hidden";
    return;
  }
  tooltip.style.visibility = "";
  lines.forEach((line, index) => {
    let x = layout.textX;
    const y = layout.lineY[index];
    if (y === undefined) return;
    for (const run of line.runs) x = drawRun(run, x, y);
  });
}

function showIssues(): void {
  const section = htmlElement("issue-section");
  const list = htmlElement("issues");
  list.replaceChildren();
  section.hidden = !payload?.issues?.length;
  for (const issue of payload?.issues || []) {
    const entry = document.createElement("li");
    entry.textContent = issue;
    list.append(entry);
  }
}

function inferredEquipmentSlot(): EquipmentSlot {
  const selected = payload?.equipmentSelection?.slot;
  if (isEquipmentSlot(selected)) return selected;
  const equippable = payload?.client?.components?.["minecraft:equippable"];
  const configured =
    isObject(equippable) && typeof equippable.slot === "string"
      ? equippable.slot.replace(/^minecraft:/u, "")
      : "";
  if (isEquipmentSlot(configured)) return configured;
  if (configured === "body") return "chest";
  return "mainhand";
}

function receivePreview(next: ItemPreviewPayload): void {
  payload = next;
  prepareInlineImages(payload, updateTooltip);
  const restored = persisted.itemId === next.id ? persisted : {};
  const configuredVariants = payload.launchOptions?.allowedVariants;
  const allowedVariants: readonly ItemVariantName[] = isUnknownArray(
    configuredVariants,
  )
    ? configuredVariants.filter(
        (value): value is ItemVariantName =>
          value === "server" || value === "client",
      )
    : ["server", "client"];
  const requestedVariant =
    restored.variantName ?? payload.launchOptions?.initialVariant ?? "client";
  variantName = allowedVariants.includes(requestedVariant)
    ? requestedVariant
    : (allowedVariants[0] ?? "client");
  stateValues = restored.stateValues ? { ...restored.stateValues } : {};
  variableValues = restored.variableValues
    ? { ...restored.variableValues }
    : {};
  previewTransform = restored.previewTransform
    ? {
        rotation: [...restored.previewTransform.rotation],
        translation: [...restored.previewTransform.translation],
        scale: [...restored.previewTransform.scale],
      }
    : { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] };
  textureCache = new Map();
  referenceTextureCache = new Map();
  animatedTextures = new Set();
  equipmentSlot = isEquipmentSlot(restored.equipmentSlot)
    ? restored.equipmentSlot
    : inferredEquipmentSlot();
  inventorySlotId = minecraftInventorySlot(restored.inventorySlotId).id;
  const restoredZoom = restored.zoom;
  zoom =
    typeof restoredZoom === "number" && Number.isFinite(restoredZoom)
      ? Math.max(0.1, Math.min(16, restoredZoom))
      : 1;
  autoZoom = restored.autoZoom !== false;
  element("equipment-slot", HTMLSelectElement).value = equipmentSlot;
  htmlElement("item-id").textContent = payload.id;
  htmlElement("item-meta").textContent = `${payload.pack} · Minecraft 26.2`;
  queryElements("[data-variant]", HTMLButtonElement).forEach((button) => {
    const candidate = button.dataset.variant;
    button.hidden = !(
      (candidate === "server" || candidate === "client") &&
      allowedVariants.includes(candidate)
    );
    button.classList.toggle("selected", button.dataset.variant === variantName);
  });
  const configuredAllowedContexts = payload.launchOptions?.allowedContexts;
  const allowedContexts = (
    isUnknownArray(configuredAllowedContexts)
      ? payload.displayContexts.filter((context) =>
          configuredAllowedContexts.includes(context),
        )
      : payload.displayContexts
  ).filter(
    (context) =>
      context !== "player_equipment" ||
      isObject(payload?.client?.components?.["minecraft:equippable"]) ||
      isObject(payload?.equipmentSelection),
  );
  const requestedContext =
    restored.displayContext ??
    payload.launchOptions?.initialContext ??
    payload.defaultDisplayContext;
  displayContext = allowedContexts.includes(requestedContext)
    ? requestedContext
    : allowedContexts.includes("gui")
      ? "gui"
      : (allowedContexts[0] ?? "gui");
  previewTransformDefault = modelTransformDefaults();
  if (!restored.previewTransform) {
    previewTransform = {
      rotation: [...previewTransformDefault.rotation],
      translation: [...previewTransformDefault.translation],
      scale: [...previewTransformDefault.scale],
    };
  }
  queryElements("[data-context]", HTMLButtonElement).forEach((button) => {
    button.hidden = !allowedContexts.includes(button.dataset.context ?? "");
  });
  buildTransformControls();
  applyContextPreset();
  updateCameraZoom();
  buildStateControls();
  buildVariables();
  const tooltipState = restored.tooltip ?? {};
  inputElement("show-tooltip").checked = tooltipState.visible !== false;
  inputElement("advanced-tooltip").checked = tooltipState.advanced === true;
  inputElement("custom-tooltip").checked = tooltipState.custom === true;
  htmlElement("custom-tooltip-fields").hidden = tooltipState.custom !== true;
  if (typeof tooltipState.name === "string")
    inputElement("custom-tooltip-name").value = tooltipState.name;
  if (typeof tooltipState.lore === "string")
    textAreaElement("custom-tooltip-lore").value = tooltipState.lore;
  inputElement("show-glint").checked = tooltipState.glint !== false;
  showIssues();
  updateTooltip();
  saveUiState();
  void rebuildModel();
}

function bindControls(): void {
  queryElements("[data-variant]", HTMLButtonElement).forEach((button) =>
    button.addEventListener("click", () => {
      const selected = button.dataset.variant;
      if (selected !== "server" && selected !== "client") return;
      variantName = selected;
      queryElements("[data-variant]", HTMLButtonElement).forEach((entry) =>
        entry.classList.toggle("selected", entry === button),
      );
      buildStateControls();
      resetPreviewTransformToModel();
      saveUiState();
      void rebuildModel();
    }),
  );
  queryElements("[data-context]", HTMLButtonElement).forEach((button) =>
    button.addEventListener("click", () => {
      const selected = button.dataset.context;
      if (!selected) return;
      displayContext = selected;
      applyContextPreset();
      resetPreviewTransformToModel();
      saveUiState();
      void rebuildModel();
    }),
  );
  const equipmentSelect = document.getElementById("equipment-slot");
  if (!(equipmentSelect instanceof HTMLSelectElement))
    throw new TypeError(Messages.web.item.preview.text0087);
  equipmentSelect.addEventListener("change", () => {
    const selected = equipmentSelect.value;
    if (!isEquipmentSlot(selected)) return;
    equipmentSlot = selected;
    applyContextPreset();
    buildStateControls();
    resetPreviewTransformToModel();
    autoZoom = true;
    saveUiState();
    void rebuildModel();
  });
  buttonElement("camera-mode").addEventListener("click", () => {
    if (displayContext === "gui") return;
    perspectiveMode = !perspectiveMode;
    replaceCamera(perspectiveMode ? perspectiveCamera : orthographicCamera);
    updateGuiControlState();
    saveUiState();
  });
  queryElements("[data-view]", HTMLButtonElement).forEach((button) =>
    button.addEventListener("click", () =>
      setView(button.dataset.view ?? "front"),
    ),
  );
  buttonElement("fit-model").addEventListener("click", fitModel);
  buttonElement("reset-view").addEventListener("click", () => {
    stateValues = {};
    buildStateControls();
    resetPreviewTransformToModel();
    applyContextPreset();
    autoZoom = true;
    saveUiState();
    void rebuildModel();
  });
  stage.addEventListener("dblclick", fitModel);
  stage.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (displayContext === "gui") return;
      setZoom(wheelScale(zoom, event.deltaY));
    },
    { passive: false },
  );
  buttonElement("zoom-out").addEventListener("click", () => {
    setZoom(stepZoomPercent(Math.round(zoom * 100), -1) / 100);
  });
  buttonElement("zoom-in").addEventListener("click", () => {
    setZoom(stepZoomPercent(Math.round(zoom * 100), 1) / 100);
  });
  const nativeZoomValue = document.getElementById("zoom-value");
  if (!(nativeZoomValue instanceof HTMLButtonElement))
    throw new TypeError(Messages.web.item.preview.text0088);
  const zoomValue = buttonElement("zoom-value");
  const zoomEditor = htmlElement("zoom-editor");
  const zoomInput = inputElement("zoom-input");
  zoomValue.addEventListener("click", () => {
    if (displayContext === "gui") return;
    zoomInput.value = String(Math.round(zoom * 100));
    zoomEditor.hidden = false;
    zoomValue.hidden = true;
    zoomInput.focus();
    zoomInput.select();
  });
  const finishZoom = () => {
    setZoom(Number(zoomInput.value) / 100);
    zoomEditor.hidden = true;
    zoomValue.hidden = false;
  };
  zoomInput.addEventListener("change", finishZoom);
  zoomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finishZoom();
    if (event.key === "Escape") {
      zoomEditor.hidden = true;
      zoomValue.hidden = false;
    }
  });
  inputElement("show-tooltip").addEventListener("change", () => {
    saveUiState();
    updateTooltip();
  });
  inputElement("advanced-tooltip").addEventListener("change", () => {
    saveUiState();
    updateTooltip();
  });
  const customTooltip = inputElement("custom-tooltip");
  customTooltip.addEventListener("change", () => {
    htmlElement("custom-tooltip-fields").hidden = !customTooltip.checked;
    saveUiState();
    updateTooltip();
  });
  inputElement("custom-tooltip-name").addEventListener("input", () => {
    saveUiState();
    updateTooltip();
  });
  textAreaElement("custom-tooltip-lore").addEventListener("input", () => {
    saveUiState();
    updateTooltip();
  });
  inputElement("show-glint").addEventListener("change", () => {
    saveUiState();
    void rebuildModel();
  });
}

function animate(): void {
  frame += 1;
  controls.update();
  const now = performance.now();
  for (const texture of animatedTextures)
    animateTexture(texture, now - (texture.userData.animationStartedAt ?? now));
  for (const mesh of glintMeshes) {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials)
      material.opacity = 0.13 + Math.sin(frame * 0.035) * 0.045;
  }
  const layout = inventoryLayout;
  const clipToGuiSlot =
    displayContext === "gui" &&
    layout !== undefined &&
    payload?.[variantName]?.oversizedInGui !== true;
  if (rendererAvailable) {
    renderer.setScissorTest(Boolean(clipToGuiSlot));
    if (clipToGuiSlot && layout) {
      const left = Math.floor(
        (Math.max(1, stage.clientWidth) - layout.slotSize) / 2,
      );
      const bottom = Math.floor(
        (Math.max(1, stage.clientHeight) - layout.slotSize) / 2,
      );
      renderer.setScissor(left, bottom, layout.slotSize, layout.slotSize);
    }
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
  }
  requestAnimationFrame(animate);
}

function animateTexture(
  texture: TextureLike,
  elapsedMilliseconds: number,
): void {
  const layout = texture.userData.animationLayout;
  if (!layout || !texture.image?.width || !texture.image?.height) return;
  const state = minecraftAnimationState(layout, elapsedMilliseconds);
  if (texture.userData.animationFrame === state.index) return;
  texture.userData.animationFrame = state.index;
  texture.repeat.set(
    layout.frameWidth / texture.image.width,
    layout.frameHeight / texture.image.height,
  );
  texture.offset.set(
    (state.index % layout.columns) / layout.columns,
    1 - (Math.floor(state.index / layout.columns) + 1) / layout.rows,
  );
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = decodeItemInboundMessage(event.data);
  if (!message) return;
  switch (message.type) {
    case "preview":
      receivePreview(message.payload);
      return;
    case "fontGlyphs":
      for (const [codepoint, glyph] of Object.entries(message.glyphs))
        fontGlyphs.set(Number(codepoint), glyph);
      updateTooltip();
      return;
  }
});
new ResizeObserver(updateSize).observe(stage);
bindControls();
buildInventorySlotSelector();
updateSize();
updateCameraZoom();
animate();
vscode.postMessage({ type: "ready" });
