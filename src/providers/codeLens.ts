import * as vscode from "vscode";

import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import { rangeAt } from "../util/vscode/range.js";
import {
  editableMaterialRange,
  furnitureArgument,
  groupedBlockPreviews,
  groupedDefinitions,
  groupedFurnitureDefinitions,
  groupedItemDefinitions,
  imageArgument,
  itemArgument,
  resolvedTextures,
} from "./completion/provider.js";

import { Messages } from "../messages.js";
export class CraftEngineCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.emitter.event;

  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
  ) {}

  public refresh(): void {
    this.emitter.fire();
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (
      !vscode.workspace
        .getConfiguration("craftengineYaml", document.uri)
        .get<boolean>("preview.showInlineButton", true)
    )
      return [];
    const lenses: vscode.CodeLens[] = [];
    for (const images of groupedDefinitions(this.workspaceIndex, document)) {
      const first = images[0];
      if (!first) continue;
      const range = rangeAt(document, first.source.idRange);
      const argument = imageArgument(first);
      lenses.push(
        new vscode.CodeLens(range, {
          command: "craftengineYaml.previewImage",
          title:
            images.length > 1
              ? Messages.src.providers.codeLens.text0001(images.length)
              : Messages.src.providers.codeLens.text0002,
          tooltip: Messages.src.providers.codeLens.text0003,
          arguments: [argument],
        }),
      );
      if (resolvedTextures(this.workspaceIndex, images).length === 0) continue;
      lenses.push(
        new vscode.CodeLens(range, {
          command: "craftengineYaml.openPng",
          title: Messages.src.providers.codeLens.text0004,
          tooltip: Messages.src.providers.codeLens.text0005,
          arguments: [argument],
        }),
      );
    }
    const materialRanges = new Set<string>();
    for (const items of groupedItemDefinitions(this.workspaceIndex, document)) {
      const first = items[0];
      if (!first) continue;
      const range = rangeAt(document, first.source.idRange);
      lenses.push(
        new vscode.CodeLens(range, {
          command: "craftengineYaml.previewItem",
          title:
            items.length > 1
              ? Messages.src.providers.codeLens.text0006(items.length)
              : Messages.src.providers.codeLens.text0007,
          tooltip: Messages.src.providers.codeLens.text0008,
          arguments: [itemArgument(first)],
        }),
      );
      const materialRange = editableMaterialRange(document, first);
      if (!materialRange) continue;
      const materialKey = `${materialRange.start}:${materialRange.end}`;
      if (materialRanges.has(materialKey)) continue;
      materialRanges.add(materialKey);
      lenses.push(
        new vscode.CodeLens(rangeAt(document, materialRange), {
          command: "craftengineYaml.selectMaterial",
          title: Messages.src.providers.codeLens.text0009,
          tooltip: Messages.src.providers.codeLens.text0010,
          arguments: [
            {
              uri: first.source.uri,
              start: materialRange.start,
              end: materialRange.end,
            },
          ],
        }),
      );
    }
    for (const furniture of groupedFurnitureDefinitions(
      this.workspaceIndex,
      document,
    )) {
      const first = furniture[0];
      if (!first) continue;
      lenses.push(
        new vscode.CodeLens(rangeAt(document, first.source.idRange), {
          command: "craftengineYaml.previewFurniture",
          title:
            furniture.length > 1
              ? Messages.src.providers.codeLens.text0011(furniture.length)
              : Messages.src.providers.codeLens.text0012,
          tooltip: Messages.src.providers.codeLens.text0013,
          arguments: [furnitureArgument(first)],
        }),
      );
    }
    for (const previews of groupedBlockPreviews(
      this.workspaceIndex,
      document,
    )) {
      const first = previews[0];
      if (!first) continue;
      lenses.push(
        new vscode.CodeLens(rangeAt(document, first.anchorRange), {
          command: "craftengineYaml.previewBlockState",
          title:
            previews.length > 1
              ? Messages.src.providers.codeLens.text0014(previews.length)
              : Messages.src.providers.codeLens.text0015,
          tooltip: Messages.src.providers.codeLens.text0016,
          arguments: [
            {
              id: first.blockId,
              uri: first.source.uri,
              offset: first.anchorRange.start,
            },
          ],
        }),
      );
    }
    const soundRanges = new Set<string>();
    for (const event of this.workspaceIndex.soundEventsInDocument(document)) {
      const key = `${event.source.idRange.start}:${event.source.idRange.end}`;
      if (soundRanges.has(key)) continue;
      soundRanges.add(key);
      lenses.push(
        new vscode.CodeLens(rangeAt(document, event.source.idRange), {
          command: "craftengineYaml.previewSound",
          title: Messages.src.providers.codeLens.text0017,
          tooltip: Messages.src.providers.codeLens.text0018,
          arguments: [
            {
              eventId: event.id,
              uri: event.source.uri,
              offset: event.source.idRange.start,
            },
          ],
        }),
      );
    }
    for (const reference of this.workspaceIndex.soundDataInDocument(document)) {
      const key = `${reference.idRange.start}:${reference.idRange.end}`;
      if (soundRanges.has(key)) continue;
      soundRanges.add(key);
      lenses.push(
        new vscode.CodeLens(rangeAt(document, reference.idRange), {
          command: "craftengineYaml.previewSound",
          title: Messages.src.providers.codeLens.text0019,
          tooltip: Messages.src.providers.codeLens.text0020,
          arguments: [
            {
              eventId: reference.eventId,
              uri: reference.source.uri,
              offset: reference.idRange.start,
            },
          ],
        }),
      );
    }
    return lenses;
  }

  public dispose(): void {
    this.emitter.dispose();
  }
}
