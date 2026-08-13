import * as vscode from "vscode";

import { Messages } from "../messages.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";

interface CraftEngineMenuPick extends vscode.QuickPickItem {
  readonly command: string;
}

export function registerIndexCommands(
  manager: CraftEngineWorkspaceIndex,
  statusBar: vscode.StatusBarItem,
): readonly vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("craftengineYaml.showMenu", async () => {
      const selected = await vscode.window.showQuickPick(
        [
          {
            label: Messages.src.commands.index.text0001,
            detail: Messages.src.commands.index.text0002,
            command: "craftengineYaml.rebuildIndex",
          },
          {
            label: Messages.src.commands.index.text0003,
            detail: Messages.src.commands.index.text0004,
            command: "craftengineYaml.bindResourcesRoot",
          },
          {
            label: Messages.src.commands.index.text0005,
            detail: Messages.src.commands.index.text0006,
            command: "craftengineYaml.redownloadMinecraftAssets",
          },
        ] satisfies readonly CraftEngineMenuPick[],
        {
          title: Messages.common.brand,
          placeHolder: Messages.src.commands.index.text0007,
        },
      );
      if (selected) await vscode.commands.executeCommand(selected.command);
    }),
    vscode.commands.registerCommand(
      "craftengineYaml.rebuildIndex",
      async () => {
        statusBar.text = Messages.common.statusBarBusyText;
        statusBar.tooltip = Messages.src.commands.index.text0008;
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: Messages.src.commands.index.text0009,
            },
            () => manager.rebuildFromScratch(),
          );
          void vscode.window.showInformationMessage(
            Messages.src.commands.index.text0010(
              manager.index.items.length,
              manager.index.blocks.length,
              manager.index.furniture.length,
              manager.index.lootTables.length,
            ),
          );
        } finally {
          statusBar.text = Messages.common.statusBarText;
          statusBar.tooltip = Messages.src.commands.index.text0011;
        }
      },
    ),
  ];
}
