import { Messages } from "../../messages.js";
export interface MinecraftInventoryGui {
  readonly atlasSize: number;
  readonly width: number;
  readonly height: number;
  readonly slotX: number;
  readonly slotY: number;
  readonly slotSize: number;
  readonly maximumScale: number;
}

export interface MinecraftInventoryLayout {
  readonly scale: number;
  readonly guiWidth: number;
  readonly guiHeight: number;
  readonly guiLeft: number;
  readonly guiTop: number;
  readonly slotSize: number;
  readonly slotId: string;
  readonly canvasTranslateX: number;
  readonly canvasTranslateY: number;
  readonly clipPath: string;
}

export interface MinecraftInventorySlot {
  readonly id: string;
  readonly label: string;
  readonly group: "armor" | "crafting" | "offhand" | "inventory" | "hotbar";
  readonly x: number;
  readonly y: number;
}

export interface MinecraftGuiLighting {
  readonly ambient: number;
  readonly directional: number;
  readonly directions: readonly (readonly [number, number, number])[];
}

export const MINECRAFT_INVENTORY_GUI: Readonly<MinecraftInventoryGui> =
  Object.freeze({
    atlasSize: 256,
    width: 176,
    height: 166,
    slotX: 88,
    slotY: 110,
    slotSize: 16,
    maximumScale: 4,
  });

export const DEFAULT_MINECRAFT_INVENTORY_SLOT_ID = "inventory-22";

const visibleInventorySlots: MinecraftInventorySlot[] = [
  {
    id: "armor-head",
    label: Messages.web.item.gui_rendering.text0001,
    group: "armor",
    x: 16,
    y: 16,
  },
  {
    id: "armor-chest",
    label: Messages.web.item.gui_rendering.text0002,
    group: "armor",
    x: 16,
    y: 34,
  },
  {
    id: "armor-legs",
    label: Messages.web.item.gui_rendering.text0003,
    group: "armor",
    x: 16,
    y: 52,
  },
  {
    id: "armor-feet",
    label: Messages.web.item.gui_rendering.text0004,
    group: "armor",
    x: 16,
    y: 70,
  },
  {
    id: "craft-0",
    label: Messages.web.item.gui_rendering.text0005,
    group: "crafting",
    x: 106,
    y: 26,
  },
  {
    id: "craft-1",
    label: Messages.web.item.gui_rendering.text0006,
    group: "crafting",
    x: 124,
    y: 26,
  },
  {
    id: "craft-2",
    label: Messages.web.item.gui_rendering.text0007,
    group: "crafting",
    x: 106,
    y: 44,
  },
  {
    id: "craft-3",
    label: Messages.web.item.gui_rendering.text0008,
    group: "crafting",
    x: 124,
    y: 44,
  },
  {
    id: "craft-result",
    label: Messages.web.item.gui_rendering.text0009,
    group: "crafting",
    x: 162,
    y: 36,
  },
  {
    id: "offhand",
    label: Messages.web.item.gui_rendering.text0010,
    group: "offhand",
    x: 85,
    y: 70,
  },
  ...Array.from({ length: 27 }, (_, index) => ({
    id: `inventory-${index + 9}`,
    label: Messages.web.item.gui_rendering.text0011(index + 1),
    group: "inventory" as const,
    x: 16 + (index % 9) * 18,
    y: 92 + Math.floor(index / 9) * 18,
  })),
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `hotbar-${index}`,
    label: Messages.web.item.gui_rendering.text0012(index + 1),
    group: "hotbar" as const,
    x: 16 + index * 18,
    y: 150,
  })),
];

export const MINECRAFT_INVENTORY_SLOTS = Object.freeze(
  visibleInventorySlots.map((slot) => Object.freeze(slot)),
);

const inventorySlotsById = new Map(
  MINECRAFT_INVENTORY_SLOTS.map((slot) => [slot.id, slot]),
);

export function minecraftInventorySlot(
  slotId: unknown,
): Readonly<MinecraftInventorySlot> {
  return (
    (typeof slotId === "string" ? inventorySlotsById.get(slotId) : undefined) ??
    inventorySlotsById.get(DEFAULT_MINECRAFT_INVENTORY_SLOT_ID)!
  );
}

// 这里按 16 除以 2 再乘 3 缩放, 否则 GUI 里的大小会不对
export function minecraftGuiCameraZoom(
  stageHeight: number,
  guiScale: number,
): number {
  return (24 * guiScale) / Math.max(1, stageHeight);
}

export function minecraftInventoryLayout(
  stageWidth: number,
  stageHeight: number,
  slotId = DEFAULT_MINECRAFT_INVENTORY_SLOT_ID,
): MinecraftInventoryLayout {
  const width = Math.max(1, stageWidth);
  const height = Math.max(1, stageHeight);
  const availableScale = Math.floor(
    Math.min(
      MINECRAFT_INVENTORY_GUI.maximumScale,
      width / MINECRAFT_INVENTORY_GUI.width,
      height / MINECRAFT_INVENTORY_GUI.height,
    ),
  );
  const scale = Math.max(1, availableScale);
  const guiWidth = MINECRAFT_INVENTORY_GUI.width * scale;
  const guiHeight = MINECRAFT_INVENTORY_GUI.height * scale;
  const guiLeft = Math.floor((width - guiWidth) / 2);
  const guiTop = Math.floor((height - guiHeight) / 2);
  const slotSize = MINECRAFT_INVENTORY_GUI.slotSize * scale;
  const slot = minecraftInventorySlot(slotId);
  const slotCenterX = guiLeft + slot.x * scale;
  const slotCenterY = guiTop + slot.y * scale;
  const clipTop = Math.max(0, (height - slotSize) / 2);
  const clipRight = Math.max(0, (width - slotSize) / 2);
  return {
    scale,
    guiWidth,
    guiHeight,
    guiLeft,
    guiTop,
    slotSize,
    slotId: slot.id,
    canvasTranslateX: slotCenterX - width / 2,
    canvasTranslateY: slotCenterY - height / 2,
    clipPath: `inset(${clipTop}px ${clipRight}px ${clipTop}px ${clipRight}px)`,
  };
}

  // 这里要用 26_2 客户端的两组物品光照方向, 否则明暗会反
const FLAT_DIRECTIONS = [
  [-0.222518981, -0.171498585, 0.959725762],
  [-0.215012134, -0.971825316, 0.096567789],
] as const;
const BLOCK_DIRECTIONS = [
  [-0.933439291, -0.262694713, -0.24430018],
  [-0.10357137, -0.976606837, 0.188446429],
] as const;

export function minecraftGuiLighting(guiLight: string): MinecraftGuiLighting {
  return {
    ambient: 0.4,
    directional: 0.6,
    directions: guiLight === "front" ? FLAT_DIRECTIONS : BLOCK_DIRECTIONS,
  };
}
