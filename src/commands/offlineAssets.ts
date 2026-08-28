import * as vscode from "vscode";

import { Messages } from "../messages.js";
import {
  MinecraftDownloadCancelled,
  type MinecraftDownloadProgress,
  type MinecraftOfflineSoundFile,
  type VanillaAssetStore,
} from "../minecraft/assets/store.js";

export function registerOfflineAssetsCommand(
  assets: VanillaAssetStore,
  soundFiles: readonly MinecraftOfflineSoundFile[],
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "craftengineYaml.importMinecraftAssets",
    async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: Messages.src.commands.offlineAssets.text0001,
        title: Messages.src.commands.offlineAssets.text0003,
        filters: {
          [Messages.src.commands.offlineAssets.text0002]: ["zip"],
        },
      });
      const archive = selected?.[0];
      if (!archive) return;

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: Messages.src.commands.offlineAssets.text0004,
            cancellable: true,
          },
          async (progress, token) => {
            let lastStage = "";
            let lastPercent = 0;
            const report = (entry: MinecraftDownloadProgress): void => {
              if (entry.stage !== lastStage) {
                lastStage = entry.stage;
                lastPercent = 0;
              }
              const percent =
                entry.total &&
                entry.downloaded !== undefined &&
                entry.total > 0
                  ? Math.max(
                      0,
                      Math.min(100, (entry.downloaded / entry.total) * 100),
                    )
                  : lastPercent;
              const bytes =
                entry.total &&
                entry.downloaded !== undefined &&
                entry.total > 0
                  ? Messages.src.extension.text0007(
                      entry.downloaded,
                      entry.total,
                    )
                  : "";
              progress.report({
                message: `${entry.message}${bytes}`,
                increment: Math.max(0, percent - lastPercent),
              });
              lastPercent = percent;
            };
            await assets.importOfflinePackage(archive.fsPath, soundFiles, {
              report,
              isCancellationRequested: () => token.isCancellationRequested,
            });
          },
        );
      } catch (error) {
        if (error instanceof MinecraftDownloadCancelled) return;
        await vscode.window.showErrorMessage(
          Messages.src.commands.offlineAssets.text0007(
            error instanceof Error ? error.message : String(error),
          ),
        );
        return;
      }

      const action = await vscode.window.showInformationMessage(
        Messages.src.commands.offlineAssets.text0005,
        Messages.src.commands.offlineAssets.text0006,
      );
      if (action !== Messages.src.commands.offlineAssets.text0006) return;
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    },
  );
}
