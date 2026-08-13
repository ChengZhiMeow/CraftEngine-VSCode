import * as vscode from "vscode";

import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import { findResourcesRoot } from "../workspace/discovery.js";

import { Messages } from "../messages.js";
export function registerResourcesRootCommand(
  manager: CraftEngineWorkspaceIndex,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "craftengineYaml.bindResourcesRoot",
    async () => {
      const selected = await vscode.window.showOpenDialog({
        title: Messages.src.commands.resourcesRoot.text0001,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: Messages.src.commands.resourcesRoot.text0002,
      });
      const folder = selected?.[0];
      if (!folder) return;
      const root = await findResourcesRoot(folder.fsPath);
      if (!root) {
        await vscode.window.showErrorMessage(
          Messages.src.commands.resourcesRoot.text0003,
        );
        return;
      }
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const workspaceFolder = activeUri
        ? vscode.workspace.getWorkspaceFolder(activeUri)
        : undefined;
      const configuration = vscode.workspace.getConfiguration(
        "craftengineYaml",
        workspaceFolder?.uri,
      );
      await configuration.update(
        "resourcesRoot",
        root,
        workspaceFolder
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : vscode.ConfigurationTarget.Workspace,
      );
      await manager.rebuild();
      await vscode.window.showInformationMessage(
        Messages.src.commands.resourcesRoot.text0004(root),
      );
    },
  );
}
