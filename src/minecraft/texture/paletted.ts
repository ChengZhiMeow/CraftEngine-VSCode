import { PNG } from "pngjs";

import { makeIdentifier, splitIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export type PalettedAssetReader = (
  logicalPath: string,
) => Promise<Buffer | undefined>;

interface PalettedPermutationSource {
  readonly textures: readonly string[];
  readonly paletteKey: string;
  readonly permutations: Readonly<Record<string, string>>;
  readonly separator: string;
}

function assetPath(identifier: string, folder: "atlases" | "textures"): string {
  const [namespace, value] = splitIdentifier(
    makeIdentifier(identifier, "minecraft"),
    "minecraft",
  );
  return `assets/${namespace}/${folder}/${value}.${folder === "textures" ? "png" : "json"}`;
}

function parseSource(value: unknown): PalettedPermutationSource | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const normalizedType = value.type.toLowerCase();
  const typeSeparator = normalizedType.indexOf(":");
  if (
    (typeSeparator < 0
      ? normalizedType
      : normalizedType.slice(typeSeparator + 1)) !== "paletted_permutations"
  )
    return undefined;
  if (
    !isUnknownArray(value.textures) ||
    typeof value.palette_key !== "string" ||
    !isRecord(value.permutations)
  )
    return undefined;
  const textures = value.textures.filter(
    (entry): entry is string => typeof entry === "string",
  );
  const permutations = Object.fromEntries(
    Object.entries(value.permutations).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  if (textures.length === 0 || Object.keys(permutations).length === 0)
    return undefined;
  return {
    textures,
    paletteKey: value.palette_key,
    permutations,
    separator: typeof value.separator === "string" ? value.separator : "_",
  };
}

function requestedPermutation(
  requestedId: string,
  source: PalettedPermutationSource,
): { readonly texture: string; readonly palette: string } | undefined {
  const requested = makeIdentifier(requestedId, "minecraft");
  for (const rawTexture of source.textures) {
    const texture = makeIdentifier(rawTexture, "minecraft");
    for (const [suffix, rawPalette] of Object.entries(source.permutations)) {
      if (`${texture}${source.separator}${suffix}` === requested) {
        return { texture, palette: makeIdentifier(rawPalette, "minecraft") };
      }
    }
  }
  return undefined;
}

  // 查找颜色时忽略源透明度, 输出透明度按游戏的整数规则合成
export function applyPalettedPermutation(
  sourceBytes: Buffer,
  paletteKeyBytes: Buffer,
  targetPaletteBytes: Buffer,
): Buffer | undefined {
  let source: PNG;
  let paletteKey: PNG;
  let targetPalette: PNG;
  try {
    source = PNG.sync.read(sourceBytes);
    paletteKey = PNG.sync.read(paletteKeyBytes);
    targetPalette = PNG.sync.read(targetPaletteBytes);
  } catch {
    return undefined;
  }
  if (
    paletteKey.width * paletteKey.height !==
    targetPalette.width * targetPalette.height
  )
    return undefined;

  const palette = new Map<
    number,
    readonly [red: number, green: number, blue: number, alpha: number]
  >();
  for (let offset = 0; offset < paletteKey.data.length; offset += 4) {
    if (paletteKey.data[offset + 3] === 0) continue;
    const key =
      (paletteKey.data[offset]! << 16) |
      (paletteKey.data[offset + 1]! << 8) |
      paletteKey.data[offset + 2]!;
    palette.set(key, [
      targetPalette.data[offset]!,
      targetPalette.data[offset + 1]!,
      targetPalette.data[offset + 2]!,
      targetPalette.data[offset + 3]!,
    ]);
  }

  const output = new PNG({ width: source.width, height: source.height });
  source.data.copy(output.data);
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const sourceAlpha = source.data[offset + 3]!;
    if (sourceAlpha === 0) continue;
    const key =
      (source.data[offset]! << 16) |
      (source.data[offset + 1]! << 8) |
      source.data[offset + 2]!;
    const replacement = palette.get(key);
    if (!replacement) continue;
    output.data[offset] = replacement[0];
    output.data[offset + 1] = replacement[1];
    output.data[offset + 2] = replacement[2];
    output.data[offset + 3] = Math.floor((sourceAlpha * replacement[3]) / 255);
  }
  return PNG.sync.write(output);
}

export async function derivePalettedTexture(
  requestedId: string,
  atlasIds: readonly string[],
  readAsset: PalettedAssetReader,
): Promise<Buffer | undefined> {
  for (const atlasId of atlasIds) {
    const atlasBytes = await readAsset(assetPath(atlasId, "atlases"));
    if (!atlasBytes) continue;
    let atlas: unknown;
    try {
      atlas = JSON.parse(atlasBytes.toString("utf8"));
    } catch {
      continue;
    }
    if (!isRecord(atlas) || !isUnknownArray(atlas.sources)) continue;
    for (const rawSource of atlas.sources) {
      const source = parseSource(rawSource);
      if (!source) continue;
      const match = requestedPermutation(requestedId, source);
      if (!match) continue;
      const [sourceBytes, paletteKeyBytes, targetPaletteBytes] =
        await Promise.all([
          readAsset(assetPath(match.texture, "textures")),
          readAsset(assetPath(source.paletteKey, "textures")),
          readAsset(assetPath(match.palette, "textures")),
        ]);
      if (!sourceBytes || !paletteKeyBytes || !targetPaletteBytes)
        return undefined;
      return applyPalettedPermutation(
        sourceBytes,
        paletteKeyBytes,
        targetPaletteBytes,
      );
    }
  }
  return undefined;
}
