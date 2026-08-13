import * as THREE from "three";

import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../shared/runtime.js";
import {
  armorModelParts,
  equipmentLayerColor,
  firstPersonPreviewItemMatrix,
  firstPersonRenderedArmMatrix,
  modelCubeFaces,
  playerModelParts,
  thirdPersonPreviewItemMatrix,
  type ArmorModelPartDefinition,
  type ArmorSlot,
  type EquipmentLayer,
  type EquipmentSlot,
  type FirstPersonItemUseState,
  type PlayerHandSide,
  type PlayerModelPartDefinition,
  type PlayerModelPartName,
  VANILLA_PLAYER_PREVIEW,
} from "./player-preview-contract.js";

const SKIN_SIZE = 64;
const MODEL_PIXEL = 1 / 16;

type Vector2 = readonly [number, number];
type Vector3 = readonly [number, number, number];

interface EquipmentAsset {
  readonly layers: Readonly<Record<string, readonly EquipmentAssetLayer[]>>;
}

interface EquipmentAssetLayer extends EquipmentLayer {
  readonly texture: string;
}

type EquipmentTextures = Readonly<Record<string, string>>;
type PlayerParts = Record<PlayerModelPartName, THREE.Group>;

function isGroup(value: unknown): value is THREE.Group {
  return value instanceof THREE.Group;
}

function isEquipmentLayer(value: unknown): value is EquipmentAssetLayer {
  if (!isRecord(value) || typeof value.texture !== "string") return false;
  if (value.dyeable === undefined) return true;
  if (!isRecord(value.dyeable)) return false;
  const snake = value.dyeable.color_when_undyed;
  const kebab = value.dyeable["color-when-undyed"];
  return (
    (snake === undefined || typeof snake === "number") &&
    (kebab === undefined || typeof kebab === "number")
  );
}

function isEquipmentAsset(value: unknown): value is EquipmentAsset {
  if (!isRecord(value) || !isRecord(value.layers)) return false;
  return Object.values(value.layers).every(
    (layers) => isUnknownArray(layers) && layers.every(isEquipmentLayer),
  );
}

function playerParts(player: THREE.Object3D): PlayerParts | undefined {
  const userData: unknown = player.userData;
  if (!isRecord(userData) || !isRecord(userData.parts)) return undefined;
  const parts = userData.parts;
  if (
    !isGroup(parts.head) ||
    !isGroup(parts.body) ||
    !isGroup(parts.rightArm) ||
    !isGroup(parts.leftArm) ||
    !isGroup(parts.rightLeg) ||
    !isGroup(parts.leftLeg)
  )
    return undefined;
  return {
    head: parts.head,
    body: parts.body,
    rightArm: parts.rightArm,
    leftArm: parts.leftArm,
    rightLeg: parts.rightLeg,
    leftLeg: parts.leftLeg,
  };
}

function modelCubeGeometry(
  cubeOrigin: Vector3,
  dimensions: Vector3,
  textureOrigin: Vector2,
  inflate: number,
  textureSize: Vector2,
  mirrored: boolean,
  playerAxes: boolean,
): THREE.BufferGeometry {
  const [textureWidth, textureHeight] = textureSize;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const face of modelCubeFaces(
    cubeOrigin,
    dimensions,
    textureOrigin,
    inflate,
    mirrored,
  )) {
    const offset = positions.length / 3;
    for (const [x, y, z] of face.vertices)
      positions.push(
        (playerAxes ? -x : x) * MODEL_PIXEL,
        (playerAxes ? -y : y) * MODEL_PIXEL,
        z * MODEL_PIXEL,
      );
    for (const [u, v] of face.uvs)
      uvs.push(u / textureWidth, 1 - v / textureHeight);
    // 同时翻转 X 和 Y 不会改变面的正反, 这里不能再反转顶点
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
    );
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

function skinBox(
  source: THREE.Texture,
  dimensions: Vector3,
  textureOrigin: Vector2,
  cubeOrigin: Vector3,
  inflate = 0,
  transparent = false,
  textureSize: Vector2 = [SKIN_SIZE, SKIN_SIZE],
  mirrored = false,
  color = 0xffffff,
  playerAxes = true,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  return new THREE.Mesh(
    modelCubeGeometry(
      cubeOrigin,
      dimensions,
      textureOrigin,
      inflate,
      textureSize,
      mirrored,
      playerAxes,
    ),
    new THREE.MeshLambertMaterial({
      map: source,
      color,
      transparent,
      alphaTest: transparent ? 1 / 255 : 0,
      side: THREE.FrontSide,
    }),
  );
}

function bodyPart(
  source: THREE.Texture,
  definition: PlayerModelPartDefinition,
  playerAxes = true,
): THREE.Group {
  const {
    name,
    dimensions,
    cubeOrigin,
    textureOrigin,
    overlayOrigin,
    overlayInflate,
    mirrored,
  } = definition;
  const pivot = new THREE.Group();
  pivot.name = name;
  const base = skinBox(
    source,
    dimensions,
    textureOrigin,
    cubeOrigin,
    0,
    false,
    [SKIN_SIZE, SKIN_SIZE],
    mirrored,
    0xffffff,
    playerAxes,
  );
  base.name = name;
  pivot.add(base);
  const overlay = skinBox(
    source,
    dimensions,
    overlayOrigin,
    cubeOrigin,
    overlayInflate,
    true,
    [SKIN_SIZE, SKIN_SIZE],
    mirrored,
    0xffffff,
    playerAxes,
  );
  overlay.name = `${name}Overlay`;
  overlay.renderOrder = 1;
  pivot.add(overlay);
  return pivot;
}

function createHeldItemAnchor(
  player: THREE.Group,
  side: PlayerHandSide,
  slim: boolean,
  held: boolean,
): THREE.Group {
  // 纤细手臂的半像素要先加到连接点, 否则旋转后会偏位
  const anchor = new THREE.Group();
  anchor.name = `${side}HeldItemAnchor`;
  anchor.matrixAutoUpdate = false;
  anchor.matrix.fromArray(thirdPersonPreviewItemMatrix(side, slim, held));
  anchor.matrix.premultiply(new THREE.Matrix4().makeScale(-1, -1, 1));
  anchor.matrix.premultiply(
    new THREE.Matrix4().makeTranslation(0, 24 * MODEL_PIXEL, 0),
  );
  player.add(anchor);
  return anchor;
}

function createPartAnchor(
  part: THREE.Group,
  name: string,
  position: Vector3 = [0, 0, 0],
): THREE.Group {
  const anchor = new THREE.Group();
  anchor.name = name;
  anchor.position.set(...position);
  part.add(anchor);
  return anchor;
}

async function loadPixelTexture(url: string): Promise<THREE.Texture> {
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export async function createPlayerModel(
  skinUrl: string | undefined,
  rawModelType: string | undefined = "classic",
  heldSide?: PlayerHandSide,
): Promise<THREE.Group> {
  if (!skinUrl) throw new Error(Messages.web.item.player_preview.text0001);
  const modelType = rawModelType === "slim" ? "slim" : "classic";
  const skin = await loadPixelTexture(skinUrl);
  const root = new THREE.Group();
  root.name = "ChengZhiYa";
  root.scale.setScalar(VANILLA_PLAYER_PREVIEW.playerScale);
  root.rotation.y = THREE.MathUtils.degToRad(
    VANILLA_PLAYER_PREVIEW.previewFacingYaw,
  );

  const resolvedParts = new Map(
    playerModelParts(modelType).map((definition) => {
      const part = bodyPart(skin, definition);
      const [x, y, z] = definition.pivot;
      part.position.set(
        -x * MODEL_PIXEL,
        (24 - y) * MODEL_PIXEL,
        z * MODEL_PIXEL,
      );
      return [definition.name, part];
    }),
  );
  const head = resolvedParts.get("head");
  const body = resolvedParts.get("body");
  const rightArm = resolvedParts.get("rightArm");
  const leftArm = resolvedParts.get("leftArm");
  const rightLeg = resolvedParts.get("rightLeg");
  const leftLeg = resolvedParts.get("leftLeg");
  if (!head || !body || !rightArm || !leftArm || !rightLeg || !leftLeg) {
    throw new Error(Messages.web.item.player_preview.text0002(modelType));
  }

  root.add(head, body, rightArm, leftArm, rightLeg, leftLeg);
  rightArm.rotation.z = VANILLA_PLAYER_PREVIEW.heldItemArmPose.zRotation.right;
  leftArm.rotation.z = VANILLA_PLAYER_PREVIEW.heldItemArmPose.zRotation.left;
  if (heldSide === "right")
    rightArm.rotation.x = -VANILLA_PLAYER_PREVIEW.heldItemArmPose.xRotation;
  if (heldSide === "left")
    leftArm.rotation.x = -VANILLA_PLAYER_PREVIEW.heldItemArmPose.xRotation;
  const equipmentAnchors = {
    mainhand: createHeldItemAnchor(
      root,
      "right",
      modelType === "slim",
      heldSide === "right",
    ),
    offhand: createHeldItemAnchor(
      root,
      "left",
      modelType === "slim",
      heldSide === "left",
    ),
    head: createPartAnchor(head, "headEquipmentAnchor"),
    chest: createPartAnchor(body, "chestEquipmentAnchor"),
    legs: createPartAnchor(body, "legsEquipmentAnchor", [
      0,
      -6 * MODEL_PIXEL,
      0,
    ]),
    feet: createPartAnchor(rightLeg, "feetEquipmentAnchor", [
      0,
      -12 * MODEL_PIXEL,
      0,
    ]),
  };
  const metadata = (root as unknown as { userData: Record<string, unknown> })
    .userData;
  metadata.parts = { head, body, rightArm, leftArm, rightLeg, leftLeg };
  metadata.equipmentAnchors = equipmentAnchors;
  metadata.skin = {
    username: "ChengZhiYa",
    model: modelType,
    width: 64,
    height: 64,
  };
  return root;
}

function attachArmorBox(
  pivot: THREE.Group,
  source: THREE.Texture,
  definition: ArmorModelPartDefinition,
  color: number,
): void {
  const mesh = skinBox(
    source,
    definition.dimensions,
    definition.textureOrigin,
    definition.cubeOrigin,
    definition.inflate,
    true,
    [64, 32],
    definition.mirrored,
    color,
  );
  mesh.name = definition.name;
  mesh.renderOrder = 3;
  pivot.add(mesh);
}

function attachHumanoidLayer(
  parts: PlayerParts,
  source: THREE.Texture,
  slot: ArmorSlot,
  color: number,
): void {
  for (const definition of armorModelParts(slot))
    attachArmorBox(parts[definition.part], source, definition, color);
}

function attachWings(
  player: THREE.Group,
  source: THREE.Texture,
  color: number,
): void {
  const definition = VANILLA_PLAYER_PREVIEW.elytra;
  for (const side of ["left", "right"]) {
    if (side !== "left" && side !== "right") continue;
    const pose = definition[side];
    const pivot = new THREE.Group();
    pivot.name = `equipment${side === "left" ? "Left" : "Right"}Wing`;
    // 模型原点在脚上方 24 像素, 这里要反转 Y 才能落在地面
    pivot.position.set(
      pose.pivot[0] * MODEL_PIXEL,
      (24 - pose.pivot[1]) * MODEL_PIXEL,
      pose.pivot[2] * MODEL_PIXEL + definition.zOffset,
    );
    pivot.rotation.set(
      THREE.MathUtils.degToRad(pose.rotation[0]),
      THREE.MathUtils.degToRad(pose.rotation[1]),
      THREE.MathUtils.degToRad(pose.rotation[2]),
    );
    const wing = skinBox(
      source,
      definition.dimensions,
      definition.textureOrigin,
      [
        -definition.dimensions[0] / 2,
        -definition.dimensions[1] / 2,
        -definition.dimensions[2] / 2,
      ],
      definition.deformation,
      true,
      [64, 32],
      side === "right",
      color,
    );
    wing.position.set(
      (side === "left" ? -5 : 5) * MODEL_PIXEL,
      -10 * MODEL_PIXEL,
      MODEL_PIXEL,
    );
    wing.renderOrder = 2;
    pivot.add(wing);
    player.add(pivot);
  }
}

export async function applyEquipmentLayers(
  player: THREE.Group,
  asset: unknown,
  textures: EquipmentTextures | undefined,
  slot: EquipmentSlot,
  dyeColor: number | undefined,
): Promise<boolean> {
  if (!isEquipmentAsset(asset) || slot === "mainhand" || slot === "offhand")
    return false;
  const parts = playerParts(player);
  if (!parts) return false;
  let rendered = false;
  const layerType = slot === "legs" ? "humanoid_leggings" : "humanoid";
  for (const layer of asset.layers[layerType] ?? []) {
    const sourceUrl =
      textures?.[`${layerType}|${layer.texture}`] || textures?.[layer.texture];
    if (!sourceUrl) continue;
    const color = equipmentLayerColor(layer, dyeColor);
    if (color === undefined) continue;
    attachHumanoidLayer(parts, await loadPixelTexture(sourceUrl), slot, color);
    rendered = true;
  }
  if (slot === "chest") {
    for (const layer of asset.layers.wings ?? []) {
      const sourceUrl =
        textures?.[`wings|${layer.texture}`] || textures?.[layer.texture];
      if (!sourceUrl) continue;
      const color = equipmentLayerColor(layer, dyeColor);
      if (color === undefined) continue;
      attachWings(player, await loadPixelTexture(sourceUrl), color);
      rendered = true;
    }
  }
  return rendered;
}

export function equipmentAnchor(slot: EquipmentSlot): {
  readonly context: string;
} {
  switch (slot) {
    case "offhand":
      return { context: "thirdperson_lefthand" };
    case "head":
      return { context: "head" };
    case "chest":
    case "legs":
    case "feet":
      return { context: "fixed" };
    case "mainhand":
    default:
      return { context: "thirdperson_righthand" };
  }
}

export async function createFirstPersonArm(
  skinUrl: string | undefined,
  rawModelType: string | undefined = "classic",
  leftHand: boolean,
): Promise<THREE.Group> {
  if (!skinUrl) throw new Error(Messages.web.item.player_preview.text0003);
  const modelType = rawModelType === "slim" ? "slim" : "classic";
  const skin = await loadPixelTexture(skinUrl);
  const side = leftHand ? "left" : "right";
  const armDefinition = playerModelParts(modelType).find(
    (part) => part.name === (leftHand ? "leftArm" : "rightArm"),
  );
  if (!armDefinition)
    throw new Error(Messages.web.item.player_preview.text0004(modelType));
  const root = new THREE.Group();
  root.name = `${side}FirstPersonReference`;
  const renderedArm = new THREE.Group();
  renderedArm.name = `${side}FirstPersonArm`;
  renderedArm.matrixAutoUpdate = false;
  renderedArm.matrix.fromArray(firstPersonRenderedArmMatrix(side));
  const arm = bodyPart(skin, armDefinition, false);
  renderedArm.add(arm);
  const itemAnchor = new THREE.Group();
  itemAnchor.name = `${side}FirstPersonItemAnchor`;
  itemAnchor.matrixAutoUpdate = false;
  itemAnchor.matrix.fromArray(firstPersonPreviewItemMatrix(side));
  root.add(renderedArm, itemAnchor);
  Object.assign(
    (root as unknown as { userData: Record<string, unknown> }).userData,
    { itemAnchor, side },
  );
  return root;
}

export function updateFirstPersonItemAnchor(
  reference: THREE.Object3D | undefined,
  state?: FirstPersonItemUseState,
): THREE.Group | undefined {
  if (!reference) return undefined;
  const userData: unknown = reference.userData;
  if (!isRecord(userData) || !(userData.itemAnchor instanceof THREE.Group))
    return undefined;
  const itemAnchor = userData.itemAnchor;
  const side = userData.side;
  if (side !== "left" && side !== "right") return undefined;
  itemAnchor.matrix.fromArray(firstPersonPreviewItemMatrix(side, state));
  itemAnchor.matrixWorldNeedsUpdate = true;
  reference.updateMatrixWorld(true);
  return itemAnchor;
}
