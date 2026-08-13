export interface CacheSoundEntry {
  readonly id: string;
  readonly source: "workspace" | "vanilla";
}

export interface CacheSoundMetadata {
  readonly hash: string;
  readonly size: number;
}

export interface CacheSoundDownloadOptions<TProgress> {
  readonly report?: (progress: TProgress) => void;
  readonly isCancellationRequested?: () => boolean;
}

export interface VanillaSoundCacheStore<TProgress> {
  verifiedCachedSound(
    id: string,
    hash: string,
    size: number,
  ): Promise<string | undefined>;
  sound(
    id: string,
    hash: string,
    size: number,
    options: CacheSoundDownloadOptions<TProgress>,
  ): Promise<string>;
}

export interface CacheVanillaSoundOptions<TProgress> {
  readonly isCancellationRequested?: () => boolean;
  readonly downloadOptions?: (
    id: string,
    index: number,
    total: number,
  ) => CacheSoundDownloadOptions<TProgress>;
  readonly onCached?: (
    id: string,
    filePath: string,
    index: number,
    total: number,
    downloaded: boolean,
  ) => void | Promise<void>;
}

export interface CacheVanillaSoundResult {
  readonly total: number;
  readonly cached: readonly string[];
  readonly downloaded: readonly string[];
  readonly missingMetadata: readonly string[];
  readonly cancelled: boolean;
}

// 丢弃工作区声音, 避免把自定义声音交给 Minecraft 资源服务下载
export async function cacheVanillaSoundFiles<TProgress = never>(
  entries: readonly CacheSoundEntry[],
  metadata: ReadonlyMap<string, CacheSoundMetadata>,
  store: VanillaSoundCacheStore<TProgress>,
  options: CacheVanillaSoundOptions<TProgress> = {},
): Promise<CacheVanillaSoundResult> {
  const seen = new Set<string>();
  const vanilla = entries.filter((entry) => {
    if (entry.source !== "vanilla" || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
  const completed = new Array<boolean>(vanilla.length).fill(false);
  const fetched = new Array<boolean>(vanilla.length).fill(false);
  const missing = new Array<boolean>(vanilla.length).fill(false);
  let next = 0;
  let cancelled = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (options.isCancellationRequested?.()) {
        cancelled = true;
        return;
      }
      const index = next;
      next += 1;
      if (index >= vanilla.length) return;
      const entry = vanilla[index]!;
      const file = metadata.get(entry.id);
      if (!file) {
        missing[index] = true;
        continue;
      }
      let filePath = await store.verifiedCachedSound(
        entry.id,
        file.hash,
        file.size,
      );
      const didDownload = filePath === undefined;
      if (!filePath) {
        if (options.isCancellationRequested?.()) {
          cancelled = true;
          return;
        }
        filePath = await store.sound(
          entry.id,
          file.hash,
          file.size,
          options.downloadOptions?.(entry.id, index, vanilla.length) ?? {},
        );
        fetched[index] = true;
      }
      completed[index] = true;
      await options.onCached?.(
        entry.id,
        filePath,
        index,
        vanilla.length,
        didDownload,
      );
    }
  };

  const failed = (
    await Promise.allSettled(
      Array.from({ length: Math.min(4, vanilla.length) }, worker),
    )
  ).find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason as unknown;

  return {
    total: vanilla.length,
    cached: vanilla
      .filter((_, index) => completed[index])
      .map((entry) => entry.id),
    downloaded: vanilla
      .filter((_, index) => fetched[index])
      .map((entry) => entry.id),
    missingMetadata: vanilla
      .filter((_, index) => missing[index])
      .map((entry) => entry.id),
    cancelled,
  };
}
