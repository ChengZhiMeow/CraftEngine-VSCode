import { createHash } from "node:crypto";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";
import type * as vscode from "vscode";

import { isPathInside, samePath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import { Messages } from "../../messages.js";
import { resourceLogicalPath } from "../catalog.js";

const BMCLAPI = "https://bmclapi2.bangbang93.com";
const MINECRAFT_VERSION = "26.2";
const CLIENT_SHA1 = "2dc72797acbc1b63fc16a11c4ac393605f453754";
const ASSET_INDEX_SHA1 = "49da57a9512de46382d2fe4b68af047fea7a16f9";
const BASELINE_HASH = createHash("sha256")
  .update(`${MINECRAFT_VERSION}:${CLIENT_SHA1}:${ASSET_INDEX_SHA1}`)
  .digest("hex");

const BASELINE = {
  clientSize: 39_193_383,
  assetIndexId: "32",
  assetIndexSize: 586_366,
  externalAssets: [
    {
      path: "minecraft/lang/zh_cn.json",
      hash: "d08b7239b6e67d6c2b61809ae2a075df3136f8fb",
      size: 532_430,
    },
    {
      path: "minecraft/font/include/unifont.json",
      hash: "402ded0eebd448033ef415e861a17513075f80e7",
      size: 3_993,
    },
    {
      path: "minecraft/font/include/unifont_pua.json",
      hash: "db5582c177aca966ba1a9b062cead233a262a939",
      size: 136,
    },
    {
      path: "minecraft/font/unifont.zip",
      hash: "ccd5ac4767ce0a9c71d1dd62f2dc25449789b5dd",
      size: 1_559_654,
    },
    {
      path: "minecraft/font/unifont_jp.zip",
      hash: "590470ab0f17afb73a4e41d9cb56fdbe069d275a",
      size: 234_900,
    },
    {
      path: "minecraft/font/unifont_pua.zip",
      hash: "d7caa0e3aa5eb656c51817ae4bfbf3c4d72cdaad",
      size: 100_360,
    },
    {
      path: "minecraft/sounds.json",
      hash: "9ac006d5537ed0fa4a7bcd1eccfc505155847686",
      size: 626_160,
    },
  ],
} as const;

export interface MinecraftDownloadProgress {
  readonly stage:
    "metadata" | "client" | "asset-index" | "objects" | "extract" | "sound";
  readonly message: string;
  readonly file?: string;
  readonly downloaded?: number;
  readonly total?: number;
}

export interface MinecraftDownloadOptions {
  readonly report?: (progress: MinecraftDownloadProgress) => void;
  readonly isCancellationRequested?: () => boolean;
}

export class MinecraftDownloadCancelled extends Error {
  public constructor() {
    super(Messages.src.minecraft.assets.store.text0001);
    this.name = "MinecraftDownloadCancelled";
  }
}

async function fileSha1(filePath: string): Promise<string | undefined> {
  try {
    return createHash("sha1")
      .update(await fs.readFile(filePath))
      .digest("hex");
  } catch {
    return undefined;
  }
}

function safeTarget(root: string, logicalPath: string): string {
  const normalized = logicalPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").includes(".."))
    throw new Error(Messages.src.minecraft.assets.store.text0002(logicalPath));
  const target = path.resolve(root, ...normalized.split("/"));
  if (!isPathInside(target, root))
    throw new Error(Messages.src.minecraft.assets.store.text0003(logicalPath));
  return target;
}

function assertInside(child: string, parent: string): void {
  if (samePath(child, parent) || !isPathInside(child, parent)) {
    throw new Error(Messages.src.minecraft.assets.store.text0004(child));
  }
}

function cancelled(options: MinecraftDownloadOptions): void {
  if (options.isCancellationRequested?.())
    throw new MinecraftDownloadCancelled();
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds))
      return Math.min(30_000, Math.max(250, seconds * 1000));
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp))
      return Math.min(30_000, Math.max(250, timestamp - Date.now()));
  }
  return Math.min(30_000, 500 * 2 ** attempt);
}

async function delay(
  milliseconds: number,
  options: MinecraftDownloadOptions,
): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    cancelled(options);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(250, deadline - Date.now())),
    );
  }
}

async function replaceFile(source: string, target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const old = `${target}.old`;
  await fs.rm(old, { force: true });
  try {
    await fs.rename(target, old);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(source, target);
    await fs.rm(old, { force: true });
  } catch (error) {
    try {
      await fs.rename(old, target);
    } catch {
      // 回滚失败时保留原错误, 下次启动会重新校验文件
    }
    throw error;
  }
}

async function writeAtomic(
  filePath: string,
  value: Buffer | string,
): Promise<void> {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporary, value);
  await replaceFile(temporary, filePath);
}

async function pipeResponse(
  response: Response,
  filePath: string,
  append: boolean,
  initial: number,
  total: number,
  progress: (downloaded: number, total: number) => void,
  options: MinecraftDownloadOptions,
): Promise<void> {
  if (!response.body)
    throw new Error(Messages.src.minecraft.assets.store.text0005);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const output = createWriteStream(filePath, { flags: append ? "a" : "w" });
  const reader = response.body.getReader();
  let downloaded = initial;
  try {
    for (;;) {
      cancelled(options);
      const chunk = await reader.read();
      if (chunk.done) break;
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array))
        throw new Error(Messages.src.minecraft.assets.store.text0006);
      if (!output.write(Buffer.from(value)))
        await new Promise<void>((resolve) => output.once("drain", resolve));
      downloaded += value.byteLength;
      progress(downloaded, total);
    }
    await new Promise<void>((resolve, reject) =>
      output.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    output.destroy();
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

async function downloadChecked(
  url: string,
  target: string,
  expectedSha1: string,
  expectedSize: number | undefined,
  stage: MinecraftDownloadProgress["stage"],
  label: string,
  options: MinecraftDownloadOptions,
  force = false,
): Promise<void> {
  if (!force) {
    const stat = await fs.stat(target).catch(() => undefined);
    if (
      stat &&
      (expectedSize === undefined || stat.size === expectedSize) &&
      (await fileSha1(target)) === expectedSha1
    )
      return;
  }

  const part = `${target}.part`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    cancelled(options);

    let offset = (await fs.stat(part).catch(() => undefined))?.size ?? 0;
    if (expectedSize !== undefined && offset > expectedSize) {
      await fs.rm(part, { force: true });
      offset = 0;
    } else if (
      offset > 0 &&
      (expectedSize === undefined || offset === expectedSize)
    ) {
  // 取消可能发生在写完到替换之间, 先检查本地文件, 避免从文件末尾续传后被服务器拒绝
      if ((await fileSha1(part)) === expectedSha1) {
        await replaceFile(part, target);
        return;
      }
      if (expectedSize !== undefined && offset === expectedSize) {
        await fs.rm(part, { force: true });
        offset = 0;
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "craftengine-yaml/0.3.8 (BMCLAPI)",
          ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}),
        },
      });
    } catch (error) {
      if (error instanceof MinecraftDownloadCancelled || attempt === 5)
        throw error;
      await delay(Math.min(30_000, 500 * 2 ** attempt), options);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      await delay(retryDelay(response, attempt), options);
      continue;
    }
    if (!response.ok && response.status !== 206)
      throw new Error(
        Messages.src.minecraft.assets.store.text0007(response.status, label),
      );
    const append = offset > 0 && response.status === 206;
    if (!append) offset = 0;
    const contentLength = Number(response.headers.get("content-length"));
    const total =
      expectedSize ??
      (Number.isFinite(contentLength) ? offset + contentLength : 0);
    options.report?.({
      stage,
      message: Messages.src.minecraft.assets.store.text0008(label),
      file: label,
      downloaded: offset,
      total,
    });
    try {
      await pipeResponse(
        response,
        part,
        append,
        offset,
        total,
        (downloaded, bytes) => {
          options.report?.({
            stage,
            message: Messages.src.minecraft.assets.store.text0009(label),
            file: label,
            downloaded,
            total: bytes,
          });
        },
        options,
      );
    } catch (error) {
      if (error instanceof MinecraftDownloadCancelled || attempt === 5)
        throw error;
      await delay(Math.min(30_000, 500 * 2 ** attempt), options);
      continue;
    }
    const stat = await fs.stat(part);
    const actual = await fileSha1(part);
    if (
      (expectedSize === undefined || stat.size === expectedSize) &&
      actual === expectedSha1
    ) {
      await replaceFile(part, target);
      return;
    }
    await fs.rm(part, { force: true });
    if (attempt === 5)
      throw new Error(Messages.src.minecraft.assets.store.text0010(label));
  }
  throw new Error(Messages.src.minecraft.assets.store.text0011(label));
}

async function fetchBytesWithRetry(
  url: string,
  label: string,
  options: MinecraftDownloadOptions,
): Promise<Buffer> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    cancelled(options);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "craftengine-yaml/0.3.8 (BMCLAPI)" },
      });
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        await delay(retryDelay(response, attempt), options);
        continue;
      }
      if (!response.ok)
        throw new Error(
          Messages.src.minecraft.assets.store.text0012(response.status, label),
        );
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (
        error instanceof MinecraftDownloadCancelled ||
        attempt === 5 ||
        (error instanceof Error &&
          error.message.startsWith(
            Messages.src.minecraft.assets.store.text0013,
          ))
      )
        throw error;
      await delay(Math.min(30_000, 500 * 2 ** attempt), options);
    }
  }
  throw new Error(Messages.src.minecraft.assets.store.text0014(label));
}

async function runPool<T>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= values.length) return;
        await task(values[index]!);
      }
    }),
  );
}

export class VanillaAssetStore {
  private extractedRoot: string | undefined;
  private extracting: Promise<string> | undefined;
  private readonly verifiedSounds = new Map<
    string,
    {
      readonly hash: string;
      readonly size: number;
      readonly modified: number;
    }
  >();

  public constructor(private readonly globalStorageUri: vscode.Uri) {}

  public get cacheRoot(): string {
    return path.join(
      this.globalStorageUri.fsPath,
      `minecraft-${MINECRAFT_VERSION}`,
      BASELINE_HASH,
    );
  }

  public get globalStorageRoot(): vscode.Uri {
    return this.globalStorageUri;
  }

  public async ensureExtracted(
    options: MinecraftDownloadOptions = {},
  ): Promise<string> {
    if (this.extractedRoot) return this.extractedRoot;
    this.extracting ??= this.ensureBase(options);
    try {
      this.extractedRoot = await this.extracting;
      return this.extractedRoot;
    } finally {
      this.extracting = undefined;
    }
  }

  public async resource(
    identifier: string,
    kind: "item-model" | "model" | "texture" | "font" | "blockstate",
  ): Promise<string> {
    const logical = resourceLogicalPath(identifier, kind);
    let target = safeTarget(await this.ensureExtracted(), logical);
    try {
      await fs.access(target);
      return target;
    } catch {
      this.extractedRoot = undefined;
      target = safeTarget(await this.ensureExtracted({}), logical);
      return target;
    }
  }

  public cachedLogicalPath(logicalPath: string): string | undefined {
    const target = safeTarget(this.cacheRoot, logicalPath);
    return existsSync(target) ? target : undefined;
  }

  public cachedSound(identifier: string): string | undefined {
    const target = this.soundTarget(identifier);
    return existsSync(target) ? target : undefined;
  }

  public async verifiedCachedSound(
    identifier: string,
    hash: string,
    size: number,
  ): Promise<string | undefined> {
    const target = this.soundTarget(identifier);
    try {
      const stat = await fs.stat(target);
      const known = this.verifiedSounds.get(target);
      if (
        known?.hash === hash &&
        known.size === size &&
        known.modified === stat.mtimeMs &&
        stat.size === size
      )
        return target;
      if (stat.size !== size || (await fileSha1(target)) !== hash) {
        this.verifiedSounds.delete(target);
        return undefined;
      }
      this.verifiedSounds.set(target, { hash, size, modified: stat.mtimeMs });
      return target;
    } catch {
      this.verifiedSounds.delete(target);
      return undefined;
    }
  }

  public async sound(
    identifier: string,
    hash: string,
    size: number,
    options: MinecraftDownloadOptions = {},
  ): Promise<string> {
    const cached = await this.verifiedCachedSound(identifier, hash, size);
    if (cached) return cached;
    const target = this.soundTarget(identifier);
    await downloadChecked(
      `${BMCLAPI}/assets/${hash.slice(0, 2)}/${hash}`,
      target,
      hash,
      size,
      "sound",
      `${identifier}.ogg`,
      options,
      true,
    );
    const stat = await fs.stat(target);
    this.verifiedSounds.set(target, { hash, size, modified: stat.mtimeMs });
    return target;
  }

  public async redownload(
    options: MinecraftDownloadOptions = {},
  ): Promise<string> {
    const root = this.cacheRoot;
    assertInside(root, this.globalStorageUri.fsPath);
    this.extractedRoot = undefined;
    this.extracting = undefined;
    this.verifiedSounds.clear();
    await fs.rm(root, { recursive: true, force: true });
    return this.ensureExtracted(options);
  }

  private soundTarget(identifier: string): string {
    const separator = identifier.indexOf(":");
    const namespace =
      separator < 0 ? "minecraft" : identifier.slice(0, separator);
    const value = (
      separator < 0 ? identifier : identifier.slice(separator + 1)
    ).replace(/\.ogg$/iu, "");
    return safeTarget(
      this.cacheRoot,
      `assets/${namespace}/sounds/${value}.ogg`,
    );
  }

  private async markerValid(root: string): Promise<boolean> {
    try {
      const marker: unknown = JSON.parse(
        await fs.readFile(path.join(root, ".complete.json"), "utf8"),
      );
      if (!isRecord(marker)) return false;
      if (
        marker.baselineHash !== BASELINE_HASH ||
        marker.clientSha1 !== CLIENT_SHA1 ||
        marker.assetIndexSha1 !== ASSET_INDEX_SHA1 ||
        marker.externalAssets !== BASELINE.externalAssets.length
      )
        return false;
      const client = path.join(root, "client.jar");
      const index = path.join(root, "asset-index.json");
      if (
        (await fs.stat(client)).size !== BASELINE.clientSize ||
        (await fileSha1(client)) !== CLIENT_SHA1
      )
        return false;
      if (
        (await fs.stat(index)).size !== BASELINE.assetIndexSize ||
        (await fileSha1(index)) !== ASSET_INDEX_SHA1
      )
        return false;
      for (const asset of BASELINE.externalAssets) {
        const target = safeTarget(root, `assets/${asset.path}`);
        if (
          (await fs.stat(target)).size !== asset.size ||
          (await fileSha1(target)) !== asset.hash
        )
          return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private async ensureBase(options: MinecraftDownloadOptions): Promise<string> {
    const root = this.cacheRoot;
    await fs.mkdir(root, { recursive: true });
    if (await this.markerValid(root)) return root;

    options.report?.({
      stage: "metadata",
      message: Messages.src.minecraft.assets.store.text0016,
      file: "26.2.json",
    });
    const versionPath = path.join(root, "version.json");
    const versionBytes = await fetchBytesWithRetry(
      `${BMCLAPI}/version/${MINECRAFT_VERSION}/json`,
      Messages.src.minecraft.assets.store.text0017,
      options,
    );
    const version: unknown = JSON.parse(versionBytes.toString("utf8"));
    if (
      !isRecord(version) ||
      !isRecord(version.downloads) ||
      !isRecord(version.downloads.client) ||
      version.downloads.client.sha1 !== CLIENT_SHA1
    ) {
      throw new Error(Messages.src.minecraft.assets.store.text0018);
    }
    await writeAtomic(versionPath, versionBytes);

    const clientPath = path.join(root, "client.jar");
    await downloadChecked(
      `${BMCLAPI}/version/${MINECRAFT_VERSION}/client`,
      clientPath,
      CLIENT_SHA1,
      BASELINE.clientSize,
      "client",
      Messages.src.minecraft.assets.store.text0019,
      options,
    );
    const indexPath = path.join(root, "asset-index.json");
    await downloadChecked(
      `${BMCLAPI}/v1/packages/${ASSET_INDEX_SHA1}/${BASELINE.assetIndexId}.json`,
      indexPath,
      ASSET_INDEX_SHA1,
      BASELINE.assetIndexSize,
      "asset-index",
      Messages.src.minecraft.assets.store.text0020,
      options,
    );

    await this.extractClient(clientPath, root, options);
    await runPool(BASELINE.externalAssets, 4, async (asset) => {
      await downloadChecked(
        `${BMCLAPI}/assets/${asset.hash.slice(0, 2)}/${asset.hash}`,
        safeTarget(root, `assets/${asset.path}`),
        asset.hash,
        asset.size,
        "objects",
        asset.path,
        options,
      );
    });
    await writeAtomic(
      path.join(root, ".complete.json"),
      JSON.stringify({
        baselineHash: BASELINE_HASH,
        minecraftVersion: MINECRAFT_VERSION,
        clientSha1: CLIENT_SHA1,
        assetIndexSha1: ASSET_INDEX_SHA1,
        externalAssets: BASELINE.externalAssets.length,
        source: "BMCLAPI",
        completedAt: new Date().toISOString(),
      }),
    );
    return root;
  }

  private async extractClient(
    clientPath: string,
    root: string,
    options: MinecraftDownloadOptions,
  ): Promise<void> {
    options.report?.({
      stage: "extract",
      message: Messages.src.minecraft.assets.store.text0021,
    });
    const zip = new AdmZip(clientPath);
    const entries = zip
      .getEntries()
      .filter(
        (entry) => !entry.isDirectory && entry.entryName.startsWith("assets/"),
      );
    let completed = 0;
    for (const entry of entries) {
      cancelled(options);
      await writeAtomic(safeTarget(root, entry.entryName), entry.getData());
      completed += 1;
      if (completed % 64 === 0 || completed === entries.length) {
        options.report?.({
          stage: "extract",
          message: Messages.src.minecraft.assets.store.text0022(
            completed,
            entries.length,
          ),
          file: entry.entryName,
          downloaded: completed,
          total: entries.length,
        });
      }
    }
  }
}
