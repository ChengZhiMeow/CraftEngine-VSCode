import * as vscode from "vscode";

import type { VanillaItem } from "../minecraft/catalog.js";
import type { VanillaCatalog } from "../minecraft/catalog.js";
import { Messages } from "../messages.js";
import type { MaterialIconService } from "../preview/item/materialIcons.js";

interface MaterialArgument {
  readonly uri: string;
  readonly start: number;
  readonly end: number;
}

interface MaterialPick extends vscode.QuickPickItem {
  readonly material: VanillaItem;
}

export function registerMaterialCommand(
  catalog: VanillaCatalog,
  icons: MaterialIconService,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    "craftengineYaml.selectMaterial",
    async (argument?: MaterialArgument) => {
      const editor = vscode.window.activeTextEditor;
      if (
        !argument ||
        !editor ||
        editor.document.uri.toString() !== argument.uri
      ) {
        await vscode.window.showWarningMessage(
          Messages.src.commands.material.text0001,
        );
        return;
      }
      const picker = vscode.window.createQuickPick<MaterialPick>();
      picker.title = Messages.src.commands.material.text0002;
      picker.placeholder = Messages.src.commands.material.text0003;
      picker.matchOnDescription = true;
      picker.matchOnDetail = true;
      picker.busy = true;
      picker.show();
      let disposed = false;
      picker.onDidHide(() => {
        disposed = true;
        picker.dispose();
      });
      picker.onDidAccept(async () => {
        const selected = picker.selectedItems[0];
        if (!selected) return;
        const document = editor.document;
        const start = Math.max(
          0,
          Math.min(argument.start, document.getText().length),
        );
        const end = Math.max(
          start,
          Math.min(argument.end, document.getText().length),
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(start),
            document.positionAt(end),
          ),
          selected.material.id,
        );
        if (!(await vscode.workspace.applyEdit(edit)))
          await vscode.window.showErrorMessage(
            Messages.src.commands.material.text0004,
          );
        picker.hide();
      });
      const items: MaterialPick[] = [];
      const selectableItems = catalog.items.filter(
        (item) => item.id !== "minecraft:air",
      );
      for (
        let start = 0;
        start < selectableItems.length && !disposed;
        start += 48
      ) {
        const prepared = await Promise.all(
          selectableItems
            .slice(start, start + 48)
            .map(async (item) => ({ item, icon: await icons.icon(item.id) })),
        );
        for (const { item, icon } of prepared) {
          items.push({
            label: item.id,
            description: Messages.src.commands.material.text0006(item.name),
            detail: Messages.src.commands.material.text0005,
            iconPath: icon,
            material: item,
          });
        }
        picker.items = [...items];
      }
      if (!disposed) picker.busy = false;
    },
  );
}
