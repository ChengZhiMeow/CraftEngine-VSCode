import { promises as fs } from "node:fs";

import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { readPngDataUrl } from "../shared/assets.js";

import { Messages } from "../../messages.js";
export interface SceneReference {
  readonly model: Readonly<Record<string, unknown>>;
  readonly textures: Readonly<Record<string, string>>;
}

export interface SceneReferences {
  readonly itemFrame?: SceneReference;
  readonly shelf?: SceneReference;
}

const cachedReferences = new WeakMap<
  VanillaAssetStore,
  Promise<SceneReferences>
>();

function resolveTexture(
  model: Readonly<Record<string, unknown>>,
  token: string,
): string | undefined {
  let current = token;
  const seen = new Set<string>();
  while (current.startsWith("#")) {
    const key = current.slice(1);
    if (seen.has(key)) return undefined;
    seen.add(key);
    const textures = isRecord(model.textures) ? model.textures : {};
    const next = textures[key];
    if (typeof next !== "string") return undefined;
    current = next;
  }
  return makeIdentifier(current.toLowerCase(), "minecraft");
}

async function mergedModel(
  assets: VanillaAssetStore,
  id: string,
  stack = new Set<string>(),
): Promise<Readonly<Record<string, unknown>>> {
  const canonical = makeIdentifier(id.toLowerCase(), "minecraft");
  if (stack.has(canonical))
    throw new Error(Messages.src.preview.item.scene.text0001(canonical));
  stack.add(canonical);
  try {
    const own = JSON.parse(
      await fs.readFile(await assets.resource(canonical, "model"), "utf8"),
    ) as unknown;
    if (!isRecord(own))
      throw new Error(Messages.src.preview.item.scene.text0002(canonical));
    if (typeof own.parent !== "string") return own;
    const parent = await mergedModel(assets, own.parent, stack);
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
      elements: isUnknownArray(own.elements) ? own.elements : parent.elements,
    };
  } finally {
    stack.delete(canonical);
  }
}

async function sceneReference(
  assets: VanillaAssetStore,
  modelId: string,
): Promise<SceneReference> {
  const model = await mergedModel(assets, modelId);
  const ids = new Set<string>();
  if (isUnknownArray(model.elements)) {
    for (const element of model.elements) {
      if (!isRecord(element) || !isRecord(element.faces)) continue;
      for (const face of Object.values(element.faces)) {
        if (!isRecord(face) || typeof face.texture !== "string") continue;
        const resolved = resolveTexture(model, face.texture);
        if (resolved) ids.add(resolved);
      }
    }
  }
  const textures: Record<string, string> = {};
  await Promise.all(
    [...ids].map(async (id) => {
      textures[id] = await readPngDataUrl(await assets.resource(id, "texture"));
    }),
  );
  return { model, textures };
}

export function buildSceneReferences(
  assets: VanillaAssetStore,
): Promise<SceneReferences> {
  let pending = cachedReferences.get(assets);
  if (!pending) {
    pending = Promise.all([
      sceneReference(assets, "minecraft:block/item_frame")
        .then((value) => ["itemFrame", value] as const)
        .catch(() => undefined),
      sceneReference(assets, "minecraft:block/oak_shelf_inventory")
        .then((value) => ["shelf", value] as const)
        .catch(() => undefined),
    ]).then((entries) =>
      Object.fromEntries(
        entries.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== undefined,
        ),
      ),
    );
    cachedReferences.set(assets, pending);
  }
  return pending;
}
