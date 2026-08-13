import * as vscode from "vscode";

import type { FurnitureDefinition } from "../config/furniture/model.js";
import type { ImageDefinition } from "../config/image/model.js";
import type { ItemDefinition } from "../config/item/model.js";
import { planImageDimensionEdit } from "../config/edit/imageDimensions.js";
import {
  blockStatePreviews,
  type BlockStatePreview,
} from "../preview/block/data.js";
import { resolveBlockStatePreviewItem } from "../preview/block/resolver.js";
import type { CraftEngineFurniturePreviewPanel } from "../preview/furniture/panel.js";
import type { CraftEnginePreviewPanel } from "../preview/image/panel.js";
import type { CraftEngineItemPreviewPanel } from "../preview/item/panel.js";
import type {
  CraftEngineSoundPreviewPanel,
  SoundPreviewArgument,
} from "../preview/sound/panel.js";
import type { VanillaAssetStore } from "../minecraft/assets/store.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";

import { Messages } from "../messages.js";
export interface PreviewArgument {
  readonly id?: string;
  readonly uri?: string;
  readonly offset?: number;
}

export interface DimensionSaveResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface PreviewCommandDependencies {
  readonly manager: CraftEngineWorkspaceIndex;
  readonly preview: CraftEnginePreviewPanel;
  readonly itemPreview: CraftEngineItemPreviewPanel;
  readonly furniturePreview: CraftEngineFurniturePreviewPanel;
  readonly soundPreview: CraftEngineSoundPreviewPanel;
  readonly vanillaAssets: VanillaAssetStore;
}

function sourceKind(kind: ImageDefinition["source"]["kind"]): string {
  switch (kind) {
    case "template":
      return Messages.src.commands.preview.text0001;
    case "factory":
      return Messages.src.commands.preview.text0002;
    case "direct":
      return Messages.src.commands.preview.text0003;
  }
}

async function chooseImage(
  manager: CraftEngineWorkspaceIndex,
  argument?: PreviewArgument,
): Promise<ImageDefinition | undefined> {
  let candidates: ImageDefinition[] = [];
  if (argument?.uri !== undefined && argument.offset !== undefined) {
    candidates = manager.index.images.filter(
      (image) =>
        image.source.uri === argument.uri &&
        image.source.idRange.start === argument.offset,
    );
  }
  if (candidates.length === 0 && argument?.id)
    candidates = manager.index.images.filter((image) => image.id === argument.id);
  const editor = vscode.window.activeTextEditor;
  if (candidates.length === 0 && editor?.document.languageId === "yaml") {
    const at = manager.imageAt(editor.document, editor.selection.active);
    if (at)
      candidates = manager
        .definitionsInDocument(editor.document)
        .filter(
          (image) => image.source.idRange.start === at.source.idRange.start,
        );
  }
  if (candidates.length === 0) {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0004,
    );
    return undefined;
  }
  if (candidates.length === 1) return candidates[0];
  const selected = await vscode.window.showQuickPick(
    candidates.map((image) => ({
      label: image.id,
      description:
        Messages.src.commands.preview.text0005(
          image.source.pack.name,
          image.source.pack.subpack
            ? Messages.common.subpack(image.source.pack.subpack)
            : "",
        ) +
        Messages.src.commands.preview.text0006(
          image.source.pack.active
            ? Messages.common.active
            : Messages.common.inactive,
        ),
      detail: `${sourceKind(image.source.kind)} · ${vscode.Uri.parse(image.source.uri).fsPath}`,
      image,
    })),
    {
      title: Messages.src.commands.preview.text0007,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return selected?.image;
}

async function chooseItem(
  manager: CraftEngineWorkspaceIndex,
  argument?: PreviewArgument,
): Promise<ItemDefinition | undefined> {
  let candidates: ItemDefinition[] = [];
  if (argument?.uri !== undefined && argument.offset !== undefined) {
    candidates = manager.index.items.filter(
      (item) =>
        item.source.uri === argument.uri &&
        item.source.idRange.start === argument.offset,
    );
  }
  if (candidates.length === 0 && argument?.id)
    candidates = manager.index.items.filter((item) => item.id === argument.id);
  const editor = vscode.window.activeTextEditor;
  if (candidates.length === 0 && editor?.document.languageId === "yaml") {
    const at = manager.itemAt(editor.document, editor.selection.active);
    if (at)
      candidates = manager
        .itemsInDocument(editor.document)
        .filter(
          (item) => item.source.idRange.start === at.source.idRange.start,
        );
  }
  if (candidates.length === 0) {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0008,
    );
    return undefined;
  }
  if (candidates.length === 1) return candidates[0];
  const selected = await vscode.window.showQuickPick(
    candidates.map((item) => ({
      label: item.id,
      description:
        Messages.src.commands.preview.text0009(
          item.source.pack.name,
          item.source.pack.subpack
            ? Messages.common.subpack(item.source.pack.subpack)
            : "",
        ) +
        Messages.src.commands.preview.text0010(
          item.source.pack.active
            ? Messages.common.active
            : Messages.common.inactive,
        ),
      detail: `${sourceKind(item.source.kind)} · ${item.clientBoundMaterial}`,
      item,
    })),
    {
      title: Messages.src.commands.preview.text0011,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return selected?.item;
}

async function chooseFurniture(
  manager: CraftEngineWorkspaceIndex,
  argument?: PreviewArgument,
): Promise<FurnitureDefinition | undefined> {
  let candidates: FurnitureDefinition[] = [];
  if (argument?.uri !== undefined && argument.offset !== undefined) {
    candidates = manager.index.furniture.filter(
      (entry) =>
        entry.source.uri === argument.uri &&
        entry.source.idRange.start === argument.offset,
    );
  }
  if (candidates.length === 0 && argument?.id)
    candidates = manager.index.furniture.filter(
      (entry) => entry.id === argument.id,
    );
  const editor = vscode.window.activeTextEditor;
  if (candidates.length === 0 && editor?.document.languageId === "yaml") {
    const at = manager.furnitureAt(editor.document, editor.selection.active);
    if (at)
      candidates = manager
        .furnitureInDocument(editor.document)
        .filter(
          (entry) => entry.source.idRange.start === at.source.idRange.start,
        );
  }
  if (candidates.length === 0) {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0012,
    );
    return undefined;
  }
  if (candidates.length === 1) return candidates[0];
  const selected = await vscode.window.showQuickPick(
    candidates.map((furniture) => ({
      label: furniture.id,
      description: Messages.src.commands.preview.text0013(
        furniture.source.pack.name,
        furniture.source.pack.active
          ? Messages.common.active
          : Messages.common.inactive,
      ),
      detail:
        (furniture.inlineOwnerItemId
          ? Messages.src.commands.preview.text0030
          : sourceKind(furniture.source.kind)) +
        Messages.src.commands.preview.text0015(furniture.variants.size),
      furniture,
    })),
    {
      title: Messages.src.commands.preview.text0016,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return selected?.furniture;
}

async function chooseBlockPreview(
  manager: CraftEngineWorkspaceIndex,
  argument?: PreviewArgument,
): Promise<BlockStatePreview | undefined> {
  const all = blockStatePreviews(manager.index.blocks, manager.index.items);
  let candidates: readonly BlockStatePreview[] = [];
  if (argument?.uri !== undefined && argument.offset !== undefined) {
    candidates = all.filter(
      (preview) =>
        preview.source.uri === argument.uri &&
        preview.anchorRange.start === argument.offset,
    );
  }
  if (candidates.length === 0 && argument?.id)
    candidates = all.filter((preview) => preview.blockId === argument.id);
  const editor = vscode.window.activeTextEditor;
  if (candidates.length === 0 && editor?.document.languageId === "yaml") {
    const offset = editor.document.offsetAt(editor.selection.active);
    candidates = all.filter(
      (preview) =>
        preview.source.uri === editor.document.uri.toString() &&
        offset >= preview.source.entryRange.start &&
        offset <= preview.source.entryRange.end,
    );
  }
  if (candidates.length === 0) {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0017,
    );
    return undefined;
  }
  if (candidates.length === 1) return candidates[0];
  const selected = await vscode.window.showQuickPick(
    candidates.map((preview) => ({
      label: Messages.src.commands.preview.text0029(
        preview.blockId,
        preview.label,
      ),
      description: Messages.src.commands.preview.text0018(
        preview.source.pack.name,
        preview.source.pack.active
          ? Messages.common.active
          : Messages.common.inactive,
      ),
      detail: Messages.src.commands.preview.text0019(
        sourceKind(preview.source.kind),
      ),
      preview,
    })),
    {
      title: Messages.src.commands.preview.text0020,
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );
  return selected?.preview;
}

async function openPng(
  manager: CraftEngineWorkspaceIndex,
  argument?: PreviewArgument,
): Promise<void> {
  const image = await chooseImage(manager, argument);
  if (!image) return;
  const bitmap = manager.index.resolved.get(image)?.bitmap.spec;
  if (!bitmap || bitmap.kind !== "bitmap") {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0021(image.id),
    );
    return;
  }
  const texture =
    bitmap.textureCandidates.find((candidate) => candidate.effective) ??
    bitmap.textureCandidates[0];
  if (!texture) {
    await vscode.window.showWarningMessage(
      Messages.src.commands.preview.text0022(bitmap.file),
    );
    return;
  }
  await vscode.commands.executeCommand(
    "vscode.open",
    vscode.Uri.file(texture.path),
  );
}

async function saveImageDimensions(
  manager: CraftEngineWorkspaceIndex,
  argument: PreviewArgument | undefined,
  height: number,
  ascent: number,
): Promise<DimensionSaveResult> {
  const image = await chooseImage(manager, argument);
  if (!image)
    return { ok: false, message: Messages.src.commands.preview.text0023 };
  try {
    const resolved = manager.index.resolved.get(image);
    if (image.spec.kind === "reference" && !resolved)
      return { ok: false, message: Messages.src.commands.preview.text0024 };
    const target = resolved?.bitmap ?? image;
    const uri = vscode.Uri.parse(target.source.uri);
    const document = await vscode.workspace.openTextDocument(uri);
    const plan = planImageDimensionEdit(
      document.getText(),
      target.source,
      height,
      ascent,
    );
    if (!plan.ok) return { ok: false, message: plan.message };
    const edit = new vscode.WorkspaceEdit();
    for (const replacement of plan.replacements) {
      edit.replace(
        uri,
        new vscode.Range(
          document.positionAt(replacement.start),
          document.positionAt(replacement.end),
        ),
        replacement.text,
      );
    }
    if (!(await vscode.workspace.applyEdit(edit)))
      return { ok: false, message: Messages.src.commands.preview.text0025 };
    if (!(await document.save()))
      return { ok: false, message: Messages.src.commands.preview.text0026 };
    return { ok: true, message: Messages.src.commands.preview.text0027 };
  } catch (error) {
    return {
      ok: false,
      message: Messages.src.commands.preview.text0028(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

export function registerPreviewCommands(
  dependencies: PreviewCommandDependencies,
): readonly vscode.Disposable[] {
  const {
    manager,
    preview,
    itemPreview,
    furniturePreview,
    soundPreview,
    vanillaAssets,
  } = dependencies;
  return [
    vscode.commands.registerCommand(
      "craftengineYaml.previewImage",
      async (argument?: PreviewArgument) => {
        const image = await chooseImage(manager, argument);
        if (image) await preview.show(image, manager.index);
      },
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.previewItem",
      async (argument?: PreviewArgument) => {
        const item = await chooseItem(manager, argument);
        if (item) await itemPreview.show(item);
      },
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.previewFurniture",
      async (argument?: PreviewArgument) => {
        const furniture = await chooseFurniture(manager, argument);
        if (furniture) await furniturePreview.show(furniture);
      },
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.previewSound",
      (argument?: SoundPreviewArgument) => soundPreview.show(argument),
    ),
    vscode.commands.registerCommand("craftengineYaml.soundPreviewPlay", () =>
      soundPreview.play(),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.soundPreviewPlayFile",
      (index: number) => soundPreview.playFile(index),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.soundPreviewSelectTarget",
      (index: number) => soundPreview.selectTarget(index),
    ),
    vscode.commands.registerCommand("craftengineYaml.soundPreviewStatus", () =>
      soundPreview.status(),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.previewBlockState",
      async (argument?: PreviewArgument) => {
        const block = await chooseBlockPreview(manager, argument);
        if (!block) return;
        const item = await resolveBlockStatePreviewItem(
          block,
          manager.index,
          vanillaAssets,
        );
        await itemPreview.show(item, {
          kind: "block-state",
          label: block.label,
          locatorOffset: block.anchorRange.start,
          initialVariant: "client",
          allowedVariants: ["client"],
          initialContext: "ground",
          allowedContexts: ["ground"],
          title: Messages.src.commands.preview.text0029(
            block.blockId,
            block.label,
          ),
        });
      },
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.openPng",
      (argument?: PreviewArgument) => openPng(manager, argument),
    ),
    vscode.commands.registerCommand("craftengineYaml.previewStatus", () =>
      preview.status(),
    ),
    vscode.commands.registerCommand("craftengineYaml.itemPreviewStatus", () =>
      itemPreview.status(),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.furniturePreviewStatus",
      () => furniturePreview.status(),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.saveImageDimensions",
      (argument: PreviewArgument | undefined, height: number, ascent: number) =>
        saveImageDimensions(manager, argument, height, ascent),
    ),
  ];
}
