import { makeIdentifier } from "../util/identifiers.js";
import { isRecord, isUnknownArray } from "../util/records.js";

function selectedValue(
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): unknown {
  for (const name of names) {
    if (Object.hasOwn(value, name) && value[name] !== null) return value[name];
  }
  return undefined;
}

export function generatedModelFromTextures(
  textures: unknown,
): Readonly<Record<string, unknown>> {
  if (isRecord(textures)) return { textures };
  if (!isUnknownArray(textures)) return { textures: { layer0: textures } };

  return {
    textures: Object.fromEntries(
      textures.map((texture, index) => [`layer${index}`, texture]),
    ),
  };
}

export function collectBlockGeneratedModels(
  raw: Readonly<Record<string, unknown>>,
  generatedModels: Map<string, unknown>,
): void {
  const state = selectedValue(raw, ["state", "states"]);
  if (!isRecord(state)) return;

  // 只解析 CE 会注册模型的 state 和 appearance 路径, 其他插件数据不能展开
  const appearances = selectedValue(state, ["appearance", "appearances"]);
  const visuals = isRecord(appearances) ? Object.values(appearances) : [state];

  for (const visual of visuals) {
    if (!isRecord(visual) || visual.transparent === true) continue;

    const textures = selectedValue(visual, ["texture", "textures"]);
    const models = selectedValue(visual, ["model", "models"]);

    if (textures !== undefined) {
      const texturePaths =
        typeof textures === "string"
          ? [textures]
          : isUnknownArray(textures)
            ? textures.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [];
      const rawPath =
        typeof models === "string"
          ? models
          : texturePaths.length === 1
            ? texturePaths[0]!.replace(/^\^/u, "")
            : undefined;

      if (rawPath) {
        generatedModels.set(
          makeIdentifier(rawPath, "minecraft"),
          generatedModelFromTextures(textures),
        );
      }
      continue;
    }

    for (const model of isUnknownArray(models) ? models : [models]) {
      if (!isRecord(model) || Object.hasOwn(model, "type")) continue;

      const modelTextures = selectedValue(model, ["texture", "textures"]);
      const texturePaths =
        typeof modelTextures === "string"
          ? [modelTextures]
          : isUnknownArray(modelTextures)
            ? modelTextures.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [];
      const rawPath =
        (typeof model.path === "string"
          ? model.path
          : typeof model.model === "string"
            ? model.model
            : undefined) ??
        (texturePaths.length === 1
          ? texturePaths[0]!.replace(/^\^/u, "")
          : undefined);
      const generation = isRecord(model.generation)
        ? model.generation
        : modelTextures === undefined
          ? undefined
          : generatedModelFromTextures(modelTextures);

      if (rawPath && generation) {
        generatedModels.set(makeIdentifier(rawPath, "minecraft"), generation);
      }
    }
  }
}
