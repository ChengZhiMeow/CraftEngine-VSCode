import { isRecord } from "../shared/runtime.js";

type ReadonlyVector2 = readonly [number, number];
type ReadonlyVector3 = readonly [number, number, number];
type Vector2 = [number, number];
type Vector3 = [number, number, number];
type RotationAxis = "x" | "y" | "z";

export type PlayerHandSide = "right" | "left";
export type PlayerModelType = "classic" | "slim";
export type FirstPersonItemAnimation =
  "none" | "bow" | "crossbow" | "fishing_rod";
export type ArmorSlot = "head" | "chest" | "legs" | "feet";
export type EquipmentSlot = ArmorSlot | "mainhand" | "offhand";

export interface FirstPersonItemUseState {
  readonly animation?: FirstPersonItemAnimation;
  readonly using?: boolean;
  readonly useTicks?: number;
  readonly pull?: number;
  readonly charged?: boolean;
}

export interface VanillaPlayerPreviewContract {
  readonly playerScale: number;
  readonly previewFacingYaw: number;
  readonly itemModelNormalizationScale: number;
  readonly slimHandPivotCorrection: number;
  readonly heldItem: Readonly<
    Record<
      PlayerHandSide,
      Readonly<{
        translation: ReadonlyVector3;
        rotation: ReadonlyVector3;
      }>
    >
  >;
  readonly heldItemArmPose: Readonly<{
    xRotation: number;
    zRotation: Readonly<Record<PlayerHandSide, number>>;
  }>;
  readonly passengerPose: Readonly<{
    rightArmX: number;
    leftArmX: number;
    rightLegX: number;
    leftLegX: number;
    rightLegY: number;
    leftLegY: number;
    rightLegZ: number;
    leftLegZ: number;
  }>;
  readonly armorDeformation: Readonly<{
    outer: number;
    inner: number;
    legAdjustment: number;
  }>;
  readonly firstPerson: Readonly<{
    item: Readonly<
      Record<PlayerHandSide, Readonly<{ translation: ReadonlyVector3 }>>
    >;
    arm: Readonly<
      Record<
        PlayerHandSide,
        Readonly<{
          translation: ReadonlyVector3;
          yaw: number;
          modelTranslation: ReadonlyVector3;
          rotations: Readonly<{ z: number; x: number; y: number }>;
          finalTranslation: ReadonlyVector3;
          partZRotation: number;
        }>
      >
    >;
  }>;
  readonly elytra: Readonly<{
    dimensions: ReadonlyVector3;
    textureOrigin: ReadonlyVector2;
    deformation: number;
    zOffset: number;
    left: Readonly<{ pivot: ReadonlyVector3; rotation: ReadonlyVector3 }>;
    right: Readonly<{ pivot: ReadonlyVector3; rotation: ReadonlyVector3 }>;
  }>;
}

export interface PlayerModelPartDefinition {
  readonly name: PlayerModelPartName;
  readonly dimensions: ReadonlyVector3;
  readonly cubeOrigin: ReadonlyVector3;
  readonly textureOrigin: ReadonlyVector2;
  readonly overlayOrigin: ReadonlyVector2;
  readonly pivot: ReadonlyVector3;
  readonly overlayInflate: number;
  readonly mirrored: false;
}

export type PlayerModelPartName =
  "head" | "body" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";
export type ModelCubeDirection =
  "down" | "up" | "west" | "north" | "east" | "south";

export interface ModelCubeFace {
  readonly direction: ModelCubeDirection;
  readonly vertices: Vector3[];
  readonly uvs: Vector2[];
}

export interface ArmorModelPartDefinition {
  readonly name: string;
  readonly part: PlayerModelPartName;
  readonly dimensions: ReadonlyVector3;
  readonly cubeOrigin: ReadonlyVector3;
  readonly textureOrigin: ReadonlyVector2;
  readonly inflate: number;
  readonly mirrored: boolean;
}

export type TransformMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface PlayerPartRotation {
  set(x: number, y: number, z: number): void;
}

export interface PlayerModelPart {
  readonly rotation: PlayerPartRotation;
}

export type PlayerModelParts = Readonly<
  Record<PlayerModelPartName, PlayerModelPart>
>;
export type PassengerPoseParts = Readonly<
  Pick<PlayerModelParts, "rightArm" | "leftArm" | "rightLeg" | "leftLeg">
>;

export interface PassengerPosePlayer {
  readonly userData?: Readonly<{ readonly parts?: unknown }>;
}

export interface FirstPersonFramingBounds {
  readonly min: ReadonlyVector3;
  readonly max: ReadonlyVector3;
}

export interface EquipmentDyeableLayer {
  readonly color_when_undyed?: number;
  readonly "color-when-undyed"?: number;
}

export interface EquipmentLayer {
  readonly dyeable?: EquipmentDyeableLayer;
}

function isPlayerModelPart(value: unknown): value is PlayerModelPart {
  if (!isRecord(value) || !isRecord(value.rotation)) return false;
  return typeof value.rotation.set === "function";
}

export function isPassengerPoseParts(
  value: unknown,
): value is PassengerPoseParts {
  if (!isRecord(value)) return false;
  return (
    isPlayerModelPart(value.rightArm) &&
    isPlayerModelPart(value.leftArm) &&
    isPlayerModelPart(value.rightLeg) &&
    isPlayerModelPart(value.leftLeg)
  );
}

function frozenVector3(value: Vector3): ReadonlyVector3 {
  return Object.freeze(value);
}

// 这些数值来自 Minecraft 26_2, 改动会让玩家预览偏位
export const VANILLA_PLAYER_PREVIEW: VanillaPlayerPreviewContract =
  Object.freeze({
    playerScale: 0.9375,
  // 摄像机从 Z 正方向看向玩家, 这里旋转整个玩家才能保留原贴图位置
    previewFacingYaw: 180,
    // 物品已经缩放到负一至一, 手部这里只能再缩放一次
    itemModelNormalizationScale: 0.5,
    slimHandPivotCorrection: 0.5 / 16,
    heldItem: Object.freeze({
      right: Object.freeze({
        translation: frozenVector3([1 / 16, 2 / 16, -10 / 16]),
        rotation: frozenVector3([-90, 180, 0]),
      }),
      left: Object.freeze({
        translation: frozenVector3([-1 / 16, 2 / 16, -10 / 16]),
        rotation: frozenVector3([-90, 180, 0]),
      }),
    }),
    heldItemArmPose: Object.freeze({
      xRotation: -Math.PI / 10,
      zRotation: Object.freeze({ right: 0.1, left: -0.1 }),
    }),
    // 乘客动作要在四肢重置后应用, 提前应用会被覆盖
    passengerPose: Object.freeze({
      rightArmX: -Math.PI / 5,
      leftArmX: -Math.PI / 5,
      rightLegX: -1.4137167,
      leftLegX: -1.4137167,
      rightLegY: Math.PI / 10,
      leftLegY: -Math.PI / 10,
      rightLegZ: Math.PI / 40,
      leftLegZ: -Math.PI / 40,
    }),
    armorDeformation: Object.freeze({
      outer: 1,
      inner: 0.5,
      legAdjustment: -0.1,
    }),
    firstPerson: Object.freeze({
      item: Object.freeze({
        right: Object.freeze({
          translation: frozenVector3([0.56, -0.52, -0.72]),
        }),
        left: Object.freeze({
          translation: frozenVector3([-0.56, -0.52, -0.72]),
        }),
      }),
      arm: Object.freeze({
        right: Object.freeze({
          translation: frozenVector3([0.64000005, -0.6, -0.71999997]),
          yaw: 45,
          modelTranslation: frozenVector3([-1, 3.6, 3.5]),
          rotations: Object.freeze({ z: 120, x: 200, y: -135 }),
          finalTranslation: frozenVector3([5.6, 0, 0]),
          partZRotation: 0.1,
        }),
        left: Object.freeze({
          translation: frozenVector3([-0.64000005, -0.6, -0.71999997]),
          yaw: -45,
          modelTranslation: frozenVector3([1, 3.6, 3.5]),
          rotations: Object.freeze({ z: -120, x: 200, y: 135 }),
          finalTranslation: frozenVector3([-5.6, 0, 0]),
          partZRotation: -0.1,
        }),
      }),
    }),
    elytra: Object.freeze({
      dimensions: frozenVector3([10, 20, 2]),
      textureOrigin: Object.freeze([22, 0] as Vector2),
      deformation: 1,
      zOffset: 0.125,
      left: Object.freeze({
        pivot: frozenVector3([5, 0, 0]),
        rotation: frozenVector3([15, 0, -15]),
      }),
      right: Object.freeze({
        pivot: frozenVector3([-5, 0, 0]),
        rotation: frozenVector3([15, 0, 15]),
      }),
    }),
  });

export function applyPassengerPose(
  player: PassengerPosePlayer | null | undefined,
): boolean {
  const parts = player?.userData?.parts;
  if (!isPassengerPoseParts(parts)) return false;
  const pose = VANILLA_PLAYER_PREVIEW.passengerPose;
  // 这里的 X 和 Y 方向相反, Z 方向不能跟着翻转
  parts.rightArm.rotation.set(
    -pose.rightArmX,
    0,
    VANILLA_PLAYER_PREVIEW.heldItemArmPose.zRotation.right,
  );
  parts.leftArm.rotation.set(
    -pose.leftArmX,
    0,
    VANILLA_PLAYER_PREVIEW.heldItemArmPose.zRotation.left,
  );
  parts.rightLeg.rotation.set(-pose.rightLegX, -pose.rightLegY, pose.rightLegZ);
  parts.leftLeg.rotation.set(-pose.leftLegX, -pose.leftLegY, pose.leftLegZ);
  return true;
}

export function furniturePlayerRotationY(previewYaw: number): number {
  const radians =
    ((VANILLA_PLAYER_PREVIEW.previewFacingYaw -
      (Number(previewYaw) || 0)) *
      Math.PI) /
    180;
  return Object.is(radians, -0) ? 0 : radians;
}

  // 左侧四肢必须使用 64x64 皮肤里的独立区域, 不能复用右侧贴图位置
export function playerModelParts(
  modelType: PlayerModelType = "classic",
): PlayerModelPartDefinition[] {
  const armWidth = modelType === "slim" ? 3 : 4;
  return [
    {
      name: "head",
      dimensions: [8, 8, 8],
      cubeOrigin: [-4, -8, -4],
      textureOrigin: [0, 0],
      overlayOrigin: [32, 0],
      pivot: [0, 0, 0],
      overlayInflate: 0.5,
      mirrored: false,
    },
    {
      name: "body",
      dimensions: [8, 12, 4],
      cubeOrigin: [-4, 0, -2],
      textureOrigin: [16, 16],
      overlayOrigin: [16, 32],
      pivot: [0, 0, 0],
      overlayInflate: 0.25,
      mirrored: false,
    },
    {
      name: "rightArm",
      dimensions: [armWidth, 12, 4],
      cubeOrigin: [modelType === "slim" ? -2 : -3, -2, -2],
      textureOrigin: [40, 16],
      overlayOrigin: [40, 32],
      pivot: [-5, 2, 0],
      overlayInflate: 0.25,
      mirrored: false,
    },
    {
      name: "leftArm",
      dimensions: [armWidth, 12, 4],
      cubeOrigin: [-1, -2, -2],
      textureOrigin: [32, 48],
      overlayOrigin: [48, 48],
      pivot: [5, 2, 0],
      overlayInflate: 0.25,
      mirrored: false,
    },
    {
      name: "rightLeg",
      dimensions: [4, 12, 4],
      cubeOrigin: [-2, 0, -2],
      textureOrigin: [0, 16],
      overlayOrigin: [0, 32],
      pivot: [-1.9, 12, 0],
      overlayInflate: 0.25,
      mirrored: false,
    },
    {
      name: "leftLeg",
      dimensions: [4, 12, 4],
      cubeOrigin: [-2, 0, -2],
      textureOrigin: [16, 48],
      overlayOrigin: [0, 48],
      pivot: [1.9, 12, 0],
      overlayInflate: 0.25,
      mirrored: false,
    },
  ];
}

  // 顶面纵向贴图坐标要反转, 镜像方块要在分配贴图后反转顶点
export function modelCubeFaces(
  cubeOrigin: ReadonlyVector3,
  dimensions: ReadonlyVector3,
  textureOrigin: ReadonlyVector2,
  inflate = 0,
  mirrored = false,
): ModelCubeFace[] {
  const [originX, originY, originZ] = cubeOrigin;
  const [width, height, depth] = dimensions;
  let minX = originX - inflate;
  const minY = originY - inflate;
  const minZ = originZ - inflate;
  let maxX = originX + width + inflate;
  const maxY = originY + height + inflate;
  const maxZ = originZ + depth + inflate;
  if (mirrored) [minX, maxX] = [maxX, minX];

  const t0: Vector3 = [minX, minY, minZ];
  const t1: Vector3 = [maxX, minY, minZ];
  const t2: Vector3 = [maxX, maxY, minZ];
  const t3: Vector3 = [minX, maxY, minZ];
  const l0: Vector3 = [minX, minY, maxZ];
  const l1: Vector3 = [maxX, minY, maxZ];
  const l2: Vector3 = [maxX, maxY, maxZ];
  const l3: Vector3 = [minX, maxY, maxZ];

  const [u, v] = textureOrigin;
  const u0 = u;
  const u1 = u + depth;
  const u2 = u + depth + width;
  const u22 = u + depth + width + width;
  const u3 = u + depth + width + depth;
  const u4 = u + depth + width + depth + width;
  const v0 = v;
  const v1 = v + depth;
  const v2 = v + depth + height;

  const polygon = (
    direction: ModelCubeDirection,
    vertices: Vector3[],
    rectangle: readonly [number, number, number, number],
  ): ModelCubeFace => {
    const [rectangleU0, rectangleV0, rectangleU1, rectangleV1] = rectangle;
    const uvs: Vector2[] = [
      [rectangleU1, rectangleV0],
      [rectangleU0, rectangleV0],
      [rectangleU0, rectangleV1],
      [rectangleU1, rectangleV1],
    ];
    if (mirrored) {
      vertices.reverse();
      uvs.reverse();
    }
    return { direction, vertices, uvs };
  };

  return [
    polygon("down", [l1, l0, t0, t1], [u1, v0, u2, v1]),
    polygon("up", [t2, t3, l3, l2], [u2, v1, u22, v0]),
    polygon("west", [t0, l0, l3, t3], [u0, v1, u1, v2]),
    polygon("north", [t1, t0, t3, t2], [u1, v1, u2, v2]),
    polygon("east", [l1, t1, t2, l2], [u2, v1, u3, v2]),
    polygon("south", [l0, l1, l2, l3], [u3, v1, u4, v2]),
  ];
}

export function armorModelParts(slot: ArmorSlot): ArmorModelPartDefinition[] {
  const outer = VANILLA_PLAYER_PREVIEW.armorDeformation.outer;
  const inner = VANILLA_PLAYER_PREVIEW.armorDeformation.inner;
  const legAdjustment = VANILLA_PLAYER_PREVIEW.armorDeformation.legAdjustment;
  if (slot === "head") {
    return [
      {
        name: "equipmentHead",
        part: "head",
        dimensions: [8, 8, 8],
        cubeOrigin: [-4, -8, -4],
        textureOrigin: [0, 0],
        inflate: outer,
        mirrored: false,
      },
    ];
  }
  if (slot === "chest") {
    return [
      {
        name: "equipmentChest",
        part: "body",
        dimensions: [8, 12, 4],
        cubeOrigin: [-4, 0, -2],
        textureOrigin: [16, 16],
        inflate: outer,
        mirrored: false,
      },
      {
        name: "equipmentRightArm",
        part: "rightArm",
        dimensions: [4, 12, 4],
        cubeOrigin: [-3, -2, -2],
        textureOrigin: [40, 16],
        inflate: outer,
        mirrored: false,
      },
      {
        name: "equipmentLeftArm",
        part: "leftArm",
        dimensions: [4, 12, 4],
        cubeOrigin: [-1, -2, -2],
        textureOrigin: [40, 16],
        inflate: outer,
        mirrored: true,
      },
    ];
  }
  if (slot === "legs") {
    return [
      {
        name: "equipmentWaist",
        part: "body",
        dimensions: [8, 12, 4],
        cubeOrigin: [-4, 0, -2],
        textureOrigin: [16, 16],
        inflate: inner,
        mirrored: false,
      },
      {
        name: "equipmentRightLeg",
        part: "rightLeg",
        dimensions: [4, 12, 4],
        cubeOrigin: [-2, 0, -2],
        textureOrigin: [0, 16],
        inflate: inner + legAdjustment,
        mirrored: false,
      },
      {
        name: "equipmentLeftLeg",
        part: "leftLeg",
        dimensions: [4, 12, 4],
        cubeOrigin: [-2, 0, -2],
        textureOrigin: [0, 16],
        inflate: inner + legAdjustment,
        mirrored: true,
      },
    ];
  }
  return [
    {
      name: "equipmentRightBoot",
      part: "rightLeg",
      dimensions: [4, 12, 4],
      cubeOrigin: [-2, 0, -2],
      textureOrigin: [0, 16],
      inflate: outer + legAdjustment,
      mirrored: false,
    },
    {
      name: "equipmentLeftBoot",
      part: "leftLeg",
      dimensions: [4, 12, 4],
      cubeOrigin: [-2, 0, -2],
      textureOrigin: [0, 16],
      inflate: outer + legAdjustment,
      mirrored: true,
    },
  ];
}

type TransformOperation =
  | Readonly<{ type: "translate" | "scale"; value: ReadonlyVector3 }>
  | Readonly<{ type: "rotate"; axis: RotationAxis; degrees: number }>;

const IDENTITY_MATRIX: Readonly<TransformMatrix> = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function multiplyMatrices(
  left: Readonly<TransformMatrix>,
  right: Readonly<TransformMatrix>,
): TransformMatrix {
  const result: TransformMatrix = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ];
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        const resultIndex = column * 4 + row;
        result[resultIndex] =
          (result[resultIndex] ?? 0) +
          (left[index * 4 + row] ?? 0) * (right[column * 4 + index] ?? 0);
      }
    }
  }
  return result;
}

function translationMatrix([x, y, z]: ReadonlyVector3): TransformMatrix {
  const matrix: TransformMatrix = [...IDENTITY_MATRIX];
  matrix[12] = x;
  matrix[13] = y;
  matrix[14] = z;
  return matrix;
}

function scaleMatrix([x, y, z]: ReadonlyVector3): TransformMatrix {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

function rotationMatrix(axis: RotationAxis, degrees: number): TransformMatrix {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (axis === "x")
    return [1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1];
  if (axis === "y")
    return [cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1];
  return [cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function cleanMatrix(matrix: TransformMatrix): TransformMatrix {
  matrix.forEach((value, index) => {
    matrix[index] =
      Math.abs(value) < 0.0000000005 ? 0 : Number(value.toFixed(9));
  });
  return matrix;
}

function composedMatrix(
  operations: readonly TransformOperation[],
): TransformMatrix {
  let matrix: TransformMatrix = [...IDENTITY_MATRIX];
  for (const operation of operations) {
    let operationMatrix: TransformMatrix;
    switch (operation.type) {
      case "translate":
        operationMatrix = translationMatrix(operation.value);
        break;
      case "scale":
        operationMatrix = scaleMatrix(operation.value);
        break;
      case "rotate":
        operationMatrix = rotationMatrix(operation.axis, operation.degrees);
        break;
    }
    matrix = multiplyMatrices(matrix, operationMatrix);
  }
  return cleanMatrix(matrix);
}

// 纤细手臂的半像素要先加到连接点, 否则手持物会偏位
export function thirdPersonRenderedItemMatrix(
  side: PlayerHandSide,
  slim = false,
  held = true,
): TransformMatrix {
  const sign = side === "left" ? -1 : 1;
  const pivotX = side === "left" ? 5 : -5;
  const pose = VANILLA_PLAYER_PREVIEW.heldItemArmPose;
  return composedMatrix([
    {
      type: "translate",
      value: [(pivotX + (slim ? sign * 0.5 : 0)) / 16, 2 / 16, 0],
    },
    {
      type: "rotate",
      axis: "z",
      degrees: (pose.zRotation[side] * 180) / Math.PI,
    },
    {
      type: "rotate",
      axis: "x",
      degrees: ((held ? pose.xRotation : 0) * 180) / Math.PI,
    },
    {
      type: "rotate",
      axis: "x",
      degrees: VANILLA_PLAYER_PREVIEW.heldItem[side].rotation[0],
    },
    {
      type: "rotate",
      axis: "y",
      degrees: VANILLA_PLAYER_PREVIEW.heldItem[side].rotation[1],
    },
    {
      type: "translate",
      value: VANILLA_PLAYER_PREVIEW.heldItem[side].translation,
    },
  ]);
}

function normalizedPreviewItemMatrix(matrix: TransformMatrix): TransformMatrix {
  const scale = VANILLA_PLAYER_PREVIEW.itemModelNormalizationScale;
  return cleanMatrix(
    multiplyMatrices(matrix, scaleMatrix([scale, scale, scale])),
  );
}

export function thirdPersonPreviewItemMatrix(
  side: PlayerHandSide,
  slim = false,
  held = true,
): TransformMatrix {
  return normalizedPreviewItemMatrix(
    thirdPersonRenderedItemMatrix(side, slim, held),
  );
}

  // 界面整数按当前游戏刻结束时计算, 否则模型和手部动作会错一帧
export function firstPersonUseItemMatrix(
  side: PlayerHandSide,
  state: FirstPersonItemUseState = {},
): TransformMatrix {
  const sign = side === "left" ? -1 : 1;
  const operations: TransformOperation[] = [
    {
      type: "translate",
      value: VANILLA_PLAYER_PREVIEW.firstPerson.item[side].translation,
    },
  ];
  const useTicks = Math.max(0, Number(state.useTicks) || 0);
  if (state.animation === "bow" && state.using === true) {
    let power = useTicks / 20;
    power = Math.min(1, (power * power + power * 2) / 3);
    const shake =
      power > 0.1 ? Math.sin((useTicks - 0.1) * 1.3) * (power - 0.1) : 0;
    operations.push(
      { type: "translate", value: [sign * -0.2785682, 0.18344387, 0.15731531] },
      { type: "rotate", axis: "x", degrees: -13.935 },
      { type: "rotate", axis: "y", degrees: sign * 35.3 },
      { type: "rotate", axis: "z", degrees: sign * -9.785 },
      { type: "translate", value: [0, shake * 0.004, power * 0.04] },
      { type: "scale", value: [1, 1, 1 + power * 0.2] },
      { type: "rotate", axis: "y", degrees: sign * -45 },
    );
  } else if (
    state.animation === "crossbow" &&
    state.using === true &&
    state.charged !== true
  ) {
    const power = Math.max(0, Math.min(1, Number(state.pull) || 0));
    const shake =
      power > 0.1 ? Math.sin((useTicks - 0.1) * 1.3) * (power - 0.1) : 0;
    operations.push(
      { type: "translate", value: [sign * -0.4785682, -0.094387, 0.05731531] },
      { type: "rotate", axis: "x", degrees: -11.935 },
      { type: "rotate", axis: "y", degrees: sign * 65.3 },
      { type: "rotate", axis: "z", degrees: sign * -9.785 },
      { type: "translate", value: [0, shake * 0.004, power * 0.04] },
      { type: "scale", value: [1, 1, 1 + power * 0.2] },
      { type: "rotate", axis: "y", degrees: sign * -45 },
    );
  } else if (state.animation === "crossbow" && state.charged === true) {
    operations.push(
      { type: "translate", value: [sign * -0.641864, 0, 0] },
      { type: "rotate", axis: "y", degrees: sign * 10 },
    );
  }
  const scale = VANILLA_PLAYER_PREVIEW.itemModelNormalizationScale;
  operations.push({ type: "scale", value: [scale, scale, scale] });
  return composedMatrix(operations);
}

export function firstPersonPreviewItemMatrix(
  side: PlayerHandSide,
  state?: FirstPersonItemUseState,
): TransformMatrix {
  return firstPersonUseItemMatrix(side, state);
}

// 只有模型被裁掉时才后移, 否则会改变正常的第一人称位置
export function firstPersonFramingDistance(
  bounds: FirstPersonFramingBounds,
  fovDegrees: number,
  aspect: number,
  margin = 0.88,
  near = 0.02,
): number {
  const tangent = Math.tan((Math.max(1, Number(fovDegrees)) * Math.PI) / 360);
  const safeAspect = Math.max(0.01, Number(aspect) || 1);
  const safeMargin = Math.max(0.1, Math.min(1, Number(margin) || 0.88));
  let distance = 0;
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const currentDepth = -z;
        const requiredDepth = Math.max(
          Math.abs(x) / (tangent * safeAspect * safeMargin),
          Math.abs(y) / (tangent * safeMargin),
          near,
        );
        distance = Math.max(distance, requiredDepth - currentDepth);
      }
    }
  return Math.max(0, distance);
}

export function firstPersonRenderedArmMatrix(
  side: PlayerHandSide,
): TransformMatrix {
  const definition = VANILLA_PLAYER_PREVIEW.firstPerson.arm[side];
  const sign = side === "left" ? 1 : -1;
  return composedMatrix([
    { type: "translate", value: definition.translation },
    { type: "rotate", axis: "y", degrees: definition.yaw },
    { type: "translate", value: definition.modelTranslation },
    { type: "rotate", axis: "z", degrees: definition.rotations.z },
    { type: "rotate", axis: "x", degrees: definition.rotations.x },
    { type: "rotate", axis: "y", degrees: definition.rotations.y },
    { type: "translate", value: definition.finalTranslation },
    { type: "translate", value: [(sign * 5) / 16, 2 / 16, 0] },
    {
      type: "rotate",
      axis: "z",
      degrees: (definition.partZRotation * 180) / Math.PI,
    },
  ]);
}

export function equipmentLayerColor(
  layer: EquipmentLayer | null | undefined,
  dyeColor: number | undefined,
): number | undefined {
  if (!layer?.dyeable) return 0xffffff;
  const configured: unknown =
    dyeColor ??
    layer.dyeable.color_when_undyed ??
    layer.dyeable["color-when-undyed"];
  if (configured === undefined || configured === null || configured === "")
    return undefined;
  const parsed = Number(configured);
  return Number.isFinite(parsed) ? (parsed >>> 0) & 0xffffff : undefined;
}
