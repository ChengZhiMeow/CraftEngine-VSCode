import type {
  ConfigurationSource,
  OpaqueIdDefinition,
} from "../../config/model.js";
import type { ItemDefinition } from "../../config/item/model.js";
import type { TextRange } from "../../diagnostics/model.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

import { Messages } from "../../messages.js";
export interface BlockStatePreview {
  readonly blockId: string;
  readonly label: string;
  readonly source: ConfigurationSource;
  readonly anchorRange: TextRange;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly model?: Readonly<Record<string, unknown>>;
  readonly texture?: string;
  readonly material: string;
  readonly referencedItemId?: string;
}

interface BlockCandidate {
  readonly id: string;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly source: ConfigurationSource;
  readonly prefix: string;
}

function namespaced(value: string, namespace: string): string {
  return makeIdentifier(value.toLowerCase(), namespace);
}

function radians(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? (number * Math.PI) / 180 : 0;
}

/** 方块模型要先转 X 再转 Y, 调换顺序会改变朝向 */
function blockRotation(
  x: unknown,
  y: unknown,
): readonly [number, number, number, number] | undefined {
  const halfX = radians(x) / 2;
  const halfY = radians(y) / 2;
  if (halfX === 0 && halfY === 0) return undefined;
  const sinX = Math.sin(halfX);
  const cosX = Math.cos(halfX);
  const sinY = Math.sin(halfY);
  const cosY = Math.cos(halfY);
  return [cosY * sinX, sinY * cosX, -sinY * sinX, cosY * cosX];
}

export function blockModelNode(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value === "string")
    return { type: "minecraft:model", model: namespaced(value, "minecraft") };
  if (!isRecord(value)) return undefined;
  const rawPath = value.path ?? value.model;
  if (typeof rawPath !== "string") return undefined;
  const rotation = blockRotation(value.x, value.y);
  return {
    ...value,
    type: "minecraft:model",
    model: namespaced(rawPath, "minecraft"),
    ...(rotation === undefined
      ? {}
      : {
          transformation: {
            ...(isRecord(value.transformation) ? value.transformation : {}),
            left_rotation: rotation,
          },
        }),
  };
}

function previewFromState(
  candidate: BlockCandidate,
  label: string,
  raw: Readonly<Record<string, unknown>>,
  path: string,
): BlockStatePreview {
  const rawEntityRenderer =
    raw.entity_renderer ??
    raw["entity-renderer"] ??
    raw.entity_render ??
    raw["entity-render"];
  const entityRenderer = isRecord(rawEntityRenderer)
    ? rawEntityRenderer
    : isUnknownArray(rawEntityRenderer)
      ? rawEntityRenderer.find(isRecord)
      : undefined;
  const referencedItemId =
    typeof entityRenderer?.item === "string"
      ? namespaced(entityRenderer.item, candidate.source.pack.namespace)
      : undefined;
  const modelValue = raw.model ?? raw.models;
  const model = blockModelNode(
    isUnknownArray(modelValue) ? modelValue[0] : modelValue,
  );
  const textureValue = raw.texture ?? raw.textures;
  const rawTexture =
    typeof textureValue === "string"
      ? textureValue
      : isUnknownArray(textureValue)
        ? textureValue.find(
            (entry): entry is string => typeof entry === "string",
          )
        : undefined;
  const texture =
    rawTexture === undefined
      ? undefined
      : namespaced(
          rawTexture.startsWith("^") ? rawTexture.slice(1) : rawTexture,
          "minecraft",
        );
  return {
    blockId: candidate.id,
    label,
    source: candidate.source,
    anchorRange:
      candidate.source.kind === "factory"
        ? candidate.source.idRange
        : (candidate.source.fieldKeyRanges.get(
            candidate.prefix ? `${candidate.prefix}.${path}` : path,
          ) ??
          candidate.source.fieldValueRanges.get(
            candidate.prefix ? `${candidate.prefix}.${path}` : path,
          ) ??
          candidate.source.idRange),
    raw,
    ...(model === undefined ? {} : { model }),
    ...(texture === undefined ? {} : { texture }),
    material:
      typeof raw.state === "string"
        ? namespaced(
            raw.state.slice(
              0,
              raw.state.indexOf("[") < 0 ? undefined : raw.state.indexOf("["),
            ),
            "minecraft",
          )
        : "minecraft:stone",
    ...(referencedItemId === undefined ? {} : { referencedItemId }),
  };
}

function previewsForCandidate(candidate: BlockCandidate): BlockStatePreview[] {
  const result: BlockStatePreview[] = [];
  const stateKey = isRecord(candidate.raw.state)
    ? "state"
    : isRecord(candidate.raw.states)
      ? "states"
      : undefined;
  if (!stateKey) return result;
  const state = candidate.raw[stateKey] as Readonly<Record<string, unknown>>;
  const appearanceKey = isRecord(state.appearance)
    ? "appearance"
    : isRecord(state.appearances)
      ? "appearances"
      : undefined;
  if (appearanceKey) {
    const appearances = state[appearanceKey] as Readonly<
      Record<string, unknown>
    >;
    for (const [name, value] of Object.entries(appearances)) {
      if (isRecord(value))
        result.push(
          previewFromState(
            candidate,
            name,
            value,
            `${stateKey}.${appearanceKey}.${name}`,
          ),
        );
    }
  } else {
    result.push(
      previewFromState(
        candidate,
        Messages.src.preview.block.data.text0001,
        state,
        stateKey,
      ),
    );
  }
  return result;
}

function inlineBlockCandidates(
  items: readonly ItemDefinition[],
): BlockCandidate[] {
  const result: BlockCandidate[] = [];
  for (const item of items) {
    for (const [field, value] of [
      ["behavior", item.raw.behavior],
      ["behaviors", item.raw.behaviors],
    ] as const) {
      (isUnknownArray(value) ? value : [value]).forEach((behavior, index) => {
        if (
          !isRecord(behavior) ||
          typeof behavior.type !== "string" ||
          !behavior.type
            .slice(behavior.type.indexOf(":") + 1)
            .toLowerCase()
            .endsWith("block_item") ||
          !isRecord(behavior.block)
        )
          return;
        result.push({
          id: item.id,
          raw: behavior.block,
          source: item.source,
          prefix: isUnknownArray(value)
            ? `${field}.${index}.block`
            : `${field}.block`,
        });
      });
    }
  }
  return result;
}

export function blockStatePreviews(
  blocks: readonly OpaqueIdDefinition[],
  items: readonly ItemDefinition[],
): readonly BlockStatePreview[] {
  const indexedRaw = new Set(
    blocks
      .filter((block) => block.kind === "block" && isRecord(block.raw))
      .map((block) => block.raw),
  );
  const candidates: BlockCandidate[] = blocks
    .filter((block) => block.kind === "block" && isRecord(block.raw))
    .map((block) => ({
      id: block.id,
      raw: block.raw,
      source: block.source,
      prefix: "",
    }));
  candidates.push(
    ...inlineBlockCandidates(items).filter(
      (candidate) => !indexedRaw.has(candidate.raw),
    ),
  );
  return candidates.flatMap(previewsForCandidate);
}

export function previewItemForBlockState(
  preview: BlockStatePreview,
  items: readonly ItemDefinition[] = [],
): ItemDefinition {
  const referenced = preview.referencedItemId
    ? (items.find(
        (item) =>
          item.id === preview.referencedItemId && item.source.pack.active,
      ) ?? items.find((item) => item.id === preview.referencedItemId))
    : undefined;
  if (referenced)
    return {
      ...referenced,
      id: preview.blockId,
      namespace: preview.blockId.slice(0, preview.blockId.indexOf(":")),
      value: preview.blockId.slice(preview.blockId.indexOf(":") + 1),
      source: preview.source,
      clientBoundModel: true,
    };

  const separator = preview.blockId.indexOf(":");
  const namespace =
    separator < 0
      ? preview.source.pack.namespace
      : preview.blockId.slice(0, separator);
  const value =
    separator < 0 ? preview.blockId : preview.blockId.slice(separator + 1);
  const raw: Readonly<Record<string, unknown>> =
    preview.model !== undefined
      ? { model: preview.model }
      : preview.texture !== undefined
        ? { texture: preview.texture }
        : {};
  return {
    id: preview.blockId,
    namespace,
    value,
    source: preview.source,
    raw,
    material: preview.material,
    clientBoundMaterial: preview.material,
    clientBoundModel: true,
    ...(preview.model === undefined ? {} : { model: preview.model }),
    textures: preview.texture === undefined ? [] : [preview.texture],
    data: {},
    clientBoundData: {},
    behaviors: [],
    claimsModelSlot:
      preview.model !== undefined || preview.texture !== undefined,
  };
}
