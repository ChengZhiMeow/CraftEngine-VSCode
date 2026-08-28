import { promises as fs } from "node:fs";
import path from "node:path";
import type * as vscode from "vscode";

import { MinecraftCatalog } from "../catalog.js";
import {
  type MinecraftDownloadProgress,
  VanillaAssetStore,
} from "./store.js";

async function main(): Promise<void> {
  const workspace = process.cwd();
  const outputPath = path.resolve(
    workspace,
    process.argv[2] ??
      path.join("target", "craftengine-minecraft-26.2-offline-assets.zip"),
  );
  const storagePath = path.join(workspace, "target", "offline-assets-cache");
  const catalog = await MinecraftCatalog.load(
    path.join(workspace, "resources", "minecraft-26.2.json"),
  );
  const soundFiles = [...catalog.sounds.files.values()];
  const assets = new VanillaAssetStore(
    { fsPath: storagePath } as vscode.Uri,
    "https://resources.download.minecraft.net",
  );
  let lastStage = "";
  let lastPercent = -1;
  const report = (entry: MinecraftDownloadProgress): void => {
    const percent =
      entry.total && entry.downloaded !== undefined && entry.total > 0
        ? Math.floor((entry.downloaded / entry.total) * 100)
        : -1;
    if (entry.stage === lastStage && percent >= 0 && percent === lastPercent)
      return;
    lastStage = entry.stage;
    lastPercent = percent;
    const suffix = percent < 0 ? "" : ` ${percent}%`;
    process.stdout.write(`[${entry.stage}] ${entry.message}${suffix}\n`);
  };

  await assets.createOfflinePackage(soundFiles, outputPath, { report });
  const stat = await fs.stat(outputPath);
  process.stdout.write(
    `Offline package: ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MiB)\n`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
