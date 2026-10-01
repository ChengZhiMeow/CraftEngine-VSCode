import * as vscode from "vscode";

import type { VanillaAssetStore } from "../minecraft/assets/store.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import {
  blueprintFileTargets,
  scriptFileTargets,
} from "./blueprintScriptTargets.js";
import { existingFileTargets } from "./completion/provider.js";

export class CraftEngineDocumentLinkProvider
  implements vscode.DocumentLinkProvider, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeDocumentLinks = this.emitter.event;

  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
    private readonly vanillaAssets?: VanillaAssetStore,
  ) {}

  public refresh(): void {
    this.emitter.fire();
  }

  public provideDocumentLinks(
    document: vscode.TextDocument,
  ): vscode.DocumentLink[] {
    const targets: Array<{
      readonly range: vscode.Range;
      readonly target: vscode.Uri;
      readonly tooltip: string;
    }> = [
      ...existingFileTargets(
        this.workspaceIndex,
        document,
        this.vanillaAssets,
      ),
      ...blueprintFileTargets(this.workspaceIndex, document),
      ...scriptFileTargets(this.workspaceIndex, document),
    ];
    return targets.map(({ range, target, tooltip }) => {
      const link = new vscode.DocumentLink(range, target);
      link.tooltip = tooltip;
      return link;
    });
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}
