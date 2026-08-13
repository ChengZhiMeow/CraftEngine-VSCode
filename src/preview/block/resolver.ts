import { promises as fs } from "node:fs";

import {
  blockModelNode,
  previewItemForBlockState,
  type BlockStatePreview,
} from "./data.js";
import type { ItemDefinition } from "../../config/item/model.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import {
  preferredResource,
  readResourceText,
} from "../../resources/catalog.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type { WorkspaceIndex } from "../../workspace/model.js";

type BlockPreviewIndex = Pick<WorkspaceIndex, "items" | "resources">;

interface ParsedBlockState {
  readonly id: string;
  readonly properties: Readonly<Record<string, string>>;
}

function parseBlockState(value: string): ParsedBlockState {
  const opening = value.indexOf("[");
  const rawId = opening < 0 ? value : value.slice(0, opening);
  const properties: Record<string, string> = {};
  if (opening >= 0 && value.endsWith("]")) {
    for (const entry of value.slice(opening + 1, -1).split(",")) {
      const separator = entry.indexOf("=");
      if (separator > 0)
        properties[entry.slice(0, separator).trim()] = entry
          .slice(separator + 1)
          .trim();
    }
  }
  return { id: makeIdentifier(rawId.toLowerCase(), "minecraft"), properties };
}

function variantMatches(
  key: string,
  properties: Readonly<Record<string, string>>,
): boolean {
  if (key === "") return true;
  return key.split(",").every((entry) => {
    const separator = entry.indexOf("=");
    if (separator < 0) return false;
    const name = entry.slice(0, separator).trim();
    const expected = entry
      .slice(separator + 1)
      .trim()
      .split("|");
    return expected.includes(properties[name] ?? "");
  });
}

function multipartMatches(
  value: unknown,
  properties: Readonly<Record<string, string>>,
): boolean {
  if (isUnknownArray(value))
    return value.some((entry) => multipartMatches(entry, properties));
  if (!isRecord(value)) return true;
  if (isUnknownArray(value.OR))
    return value.OR.some((entry) => multipartMatches(entry, properties));
  if (isUnknownArray(value.AND))
    return value.AND.every((entry) => multipartMatches(entry, properties));
  return Object.entries(value).every(([name, expected]) => {
    if (typeof expected !== "string") return false;
    const actual = properties[name] ?? "";
    return expected.startsWith("!")
      ? !expected.slice(1).split("|").includes(actual)
      : expected.split("|").includes(actual);
  });
}

function blockStateModels(
  json: unknown,
  properties: Readonly<Record<string, string>>,
): unknown[] {
  if (!isRecord(json)) return [];
  if (isRecord(json.variants)) {
    const exact = Object.entries(json.variants)
      .filter(([key]) => variantMatches(key, properties))
      .sort(
        (left, right) =>
          right[0].split(",").filter(Boolean).length -
          left[0].split(",").filter(Boolean).length,
      )[0];
    const application = exact?.[1];
    const node = blockModelNode(
      isUnknownArray(application) ? application[0] : application,
    );
    return node === undefined ? [] : [node];
  }
  if (!isUnknownArray(json.multipart)) return [];
  const result: unknown[] = [];
  for (const part of json.multipart) {
    if (!isRecord(part) || !multipartMatches(part.when, properties)) continue;
    const node = blockModelNode(
      isUnknownArray(part.apply) ? part.apply[0] : part.apply,
    );
    if (node !== undefined) result.push(node);
  }
  return result;
}

async function blockStateJson(
  preview: BlockStatePreview,
  state: ParsedBlockState,
  index: BlockPreviewIndex,
  assets: VanillaAssetStore,
): Promise<unknown> {
  const workspace = preferredResource(
    index.resources,
    preview.source.pack.resourcesRoot,
    "blockstate",
    state.id,
  );
  const text = workspace
    ? await readResourceText(workspace)
    : await fs.readFile(await assets.resource(state.id, "blockstate"), "utf8");
  return JSON.parse(text) as unknown;
}

export async function resolveBlockStatePreviewItem(
  preview: BlockStatePreview,
  index: BlockPreviewIndex,
  assets: VanillaAssetStore,
): Promise<ItemDefinition> {
  const fallback = previewItemForBlockState(preview, index.items);
  if (
    preview.referencedItemId ||
    preview.model !== undefined ||
    preview.texture !== undefined
  )
    return fallback;
  const stateValue =
    typeof preview.raw.state === "string" ? preview.raw.state : undefined;
  if (!stateValue) return fallback;
  try {
    const state = parseBlockState(stateValue);
    const models = blockStateModels(
      await blockStateJson(preview, state, index, assets),
      state.properties,
    );
    if (models.length === 0) return fallback;
    const model: unknown = models.length === 1 ? models[0] : models;
    return {
      ...fallback,
      raw: { model },
      model,
      textures: [],
      claimsModelSlot: true,
    };
  } catch {
    return fallback;
  }
}
