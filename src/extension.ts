import { promises as fs } from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

import { CompletionDescriptionCatalog } from "./providers/completion/descriptions.js";
import { MinecraftCatalog } from "./minecraft/catalog.js";
import { CraftEngineItemPreviewPanel } from "./preview/item/panel.js";
import { ItemPreviewDataBuilder } from "./preview/item/data.js";
import { CraftEngineItemIconDecorations } from "./providers/itemIcons.js";
import { MaterialIconService } from "./preview/item/materialIcons.js";
import { CraftEngineCodeLensProvider } from "./providers/codeLens.js";
import { CraftEngineCompletionProvider } from "./providers/completion/provider.js";
import { CraftEngineDefinitionProvider } from "./providers/definition.js";
import { CraftEngineDocumentLinkProvider } from "./providers/documentLinks.js";
import { CraftEngineHoverProvider } from "./providers/hover.js";
import { CraftEnginePreviewPanel } from "./preview/image/panel.js";
import { CraftEngineWorkspaceIndex } from "./workspace/index.js";
import {
  MinecraftDownloadCancelled,
  VanillaAssetStore,
  type MinecraftDownloadProgress,
} from "./minecraft/assets/store.js";
import { CraftEngineTextFeatures } from "./providers/text/features.js";
import {
  CraftEngineTextDisplay,
  type OpenTextDeclarationArgument,
} from "./providers/text/display.js";
import { WorkspaceTextCatalog } from "./providers/text/workspaceCatalog.js";
import { CraftEngineColorProvider } from "./providers/color.js";
import { CraftEngineSoundPreviewPanel } from "./preview/sound/panel.js";
import { CraftEngineFurniturePreviewPanel } from "./preview/furniture/panel.js";
import { resolveBlockStatePreviewItem } from "./preview/block/resolver.js";
import { registerPreviewCommands } from "./commands/preview.js";
import { registerResourcesRootCommand } from "./commands/resourcesRoot.js";
import { registerMaterialCommand } from "./commands/material.js";
import { registerIndexCommands } from "./commands/index.js";
import { isRecord } from "./util/records.js";

import { Messages } from "./messages.js";
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const minecraft = await MinecraftCatalog.load(
    path.join(context.extensionUri.fsPath, "resources", "minecraft-26.2.json"),
  );
  const vanillaCatalog = minecraft.vanilla;
  const vanillaSounds = minecraft.sounds;
  const vanillaAssets = new VanillaAssetStore(context.globalStorageUri);
  const materialIcons = new MaterialIconService(
    vanillaAssets,
    context.globalStorageUri,
  );
  const diagnostics =
    vscode.languages.createDiagnosticCollection("craftengine-yaml");
  const manager = new CraftEngineWorkspaceIndex(
    diagnostics,
    vanillaCatalog,
    vanillaSounds,
    vanillaAssets,
  );
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.name = Messages.common.brand;
  statusBar.text = Messages.common.statusBarText;
  statusBar.tooltip = Messages.src.extension.text0001;
  statusBar.command = "craftengineYaml.showMenu";
  statusBar.show();

  const downloadAssets = async (force: boolean): Promise<string | undefined> =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: Messages.src.extension.text0002,
        cancellable: true,
      },
      async (progress, token) => {
        let lastStage = "";
        let lastPercent = 0;
        const report = (entry: MinecraftDownloadProgress): void => {
          const stage = entry.stage;
          if (stage !== lastStage) {
            lastStage = stage;
            lastPercent = 0;
          }
          const percent =
            entry.total && entry.downloaded !== undefined && entry.total > 0
              ? Math.max(
                  0,
                  Math.min(100, (entry.downloaded / entry.total) * 100),
                )
              : lastPercent;
          progress.report({
            message: `${entry.message}${entry.total && entry.downloaded !== undefined && entry.total > 0 ? Messages.src.extension.text0007(entry.downloaded, entry.total) : ""}`,
            increment: Math.max(0, percent - lastPercent),
          });
          lastPercent = percent;
        };
        try {
          return force
            ? await vanillaAssets.redownload({
                report,
                isCancellationRequested: () => token.isCancellationRequested,
              })
            : await vanillaAssets.ensureExtracted({
                report,
                isCancellationRequested: () => token.isCancellationRequested,
              });
        } catch (error) {
          if (error instanceof MinecraftDownloadCancelled) return undefined;
          const choice = await vscode.window.showWarningMessage(
            Messages.src.extension.text0003(
              error instanceof Error ? error.message : String(error),
            ),
            Messages.src.extension.text0004,
          );
          if (choice)
            void vscode.commands.executeCommand(
              "craftengineYaml.redownloadMinecraftAssets",
            );
          return undefined;
        }
      },
    );
  // 命令注册完成后再启动读写, 下载失败时才能安全调用重试命令
  const initialAssets = Promise.resolve().then(() => downloadAssets(false));
  const vanillaTranslations = initialAssets
    .then(async (root): Promise<Readonly<Record<string, string>>> => {
      if (!root) return {};
      const value: unknown = JSON.parse(
        await fs.readFile(
          path.join(root, "assets", "minecraft", "lang", "zh_cn.json"),
          "utf8",
        ),
      );
      if (!isRecord(value)) return {};
      return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) =>
          typeof entry === "string" ? [[key, entry]] : [],
        ),
      );
    })
    .catch((): Readonly<Record<string, string>> => ({}));
  const completionDescriptions = new CompletionDescriptionCatalog(
    vanillaCatalog,
    {},
  );
  void vanillaTranslations.then((translations) =>
    completionDescriptions.updateTranslations(translations),
  );
  const textCatalogs = new WorkspaceTextCatalog(manager, vanillaTranslations);
  const textFeatures = new CraftEngineTextFeatures(manager, textCatalogs);
  const textDisplay = new CraftEngineTextDisplay(
    context.extensionUri,
    manager,
    textCatalogs,
  );
  const extensionPackage = context.extension.packageJSON as {
    readonly version?: unknown;
  };
  const extensionVersion =
    typeof extensionPackage.version === "string"
      ? extensionPackage.version
      : Messages.src.extension.text0005;
  const preview = new CraftEnginePreviewPanel(
    context.extensionUri,
    context.workspaceState,
    () => manager.index,
    vanillaAssets,
    extensionVersion,
  );
  const itemPreviewBuilder = new ItemPreviewDataBuilder(
    manager,
    vanillaCatalog,
    vanillaAssets,
  );
  const itemPreview = new CraftEngineItemPreviewPanel(
    context.extensionUri,
    itemPreviewBuilder,
    context.workspaceState,
    () => manager.index,
    (block, index) => resolveBlockStatePreviewItem(block, index, vanillaAssets),
    vanillaAssets,
    extensionVersion,
  );
  const furniturePreview = new CraftEngineFurniturePreviewPanel(
    context.extensionUri,
    context.workspaceState,
    () => manager.index,
    itemPreviewBuilder,
    materialIcons,
    context.globalStorageUri,
    extensionVersion,
  );
  const soundPreview = new CraftEngineSoundPreviewPanel(
    context.extensionUri,
    manager,
    vanillaAssets,
    extensionVersion,
  );
  const yamlSelector: vscode.DocumentSelector = [
    { language: "yaml", scheme: "file" },
  ];
  // JSON 只用于跳转和行内按钮, 只有 YAML 需要读取缩进
  const indexedConfigurationSelector: vscode.DocumentSelector = [
    ...yamlSelector,
    { language: "json", scheme: "file" },
    { language: "jsonc", scheme: "file" },
  ];
  const codeLens = new CraftEngineCodeLensProvider(manager);
  const itemIcons = new CraftEngineItemIconDecorations(manager, materialIcons);
  const documentLinks = new CraftEngineDocumentLinkProvider(
    manager,
    vanillaAssets,
  );
  const indexListener = manager.onDidChange((index) => {
    codeLens.refresh();
    itemIcons.refresh(index);
    documentLinks.refresh();
    void preview.refresh(index);
    void itemPreview.refresh(index);
    void furniturePreview.refresh(index);
  });
  const previewSaveListener = vscode.workspace.onDidSaveTextDocument(
    (document) => {
      const source = document.uri.toString();
      if (
        !preview.hasSource(source) &&
        !itemPreview.hasSource(source) &&
        !furniturePreview.hasSource(source) &&
        !soundPreview.hasSource(source)
      )
        return;
      void manager
        .rebuild()
        .then(() => soundPreview.refresh(source))
        .catch((error: unknown) =>
          console.error(Messages.src.workspace.index.text0001, error),
        );
    },
  );

  context.subscriptions.push(
    diagnostics,
    manager,
    statusBar,
    preview,
    itemPreview,
    furniturePreview,
    soundPreview,
    codeLens,
    itemIcons,
    documentLinks,
    textFeatures,
    textDisplay,
    indexListener,
    previewSaveListener,
    vscode.window.registerWebviewPanelSerializer(
      CraftEnginePreviewPanel.viewType,
      preview,
    ),
    vscode.window.registerWebviewPanelSerializer(
      CraftEngineItemPreviewPanel.viewType,
      itemPreview,
    ),
    vscode.window.registerWebviewPanelSerializer(
      CraftEngineFurniturePreviewPanel.viewType,
      furniturePreview,
    ),
    vscode.languages.registerCompletionItemProvider(
      yamlSelector,
      new CraftEngineCompletionProvider(manager, completionDescriptions),
      ":",
      " ",
      "$",
      "<",
    ),
    vscode.languages.registerCompletionItemProvider(
      yamlSelector,
      textFeatures,
      ":",
      "<",
      "_",
    ),
    vscode.languages.registerHoverProvider(
      indexedConfigurationSelector,
      new CraftEngineHoverProvider(manager),
    ),
    vscode.languages.registerHoverProvider(yamlSelector, textDisplay),
    vscode.languages.registerDefinitionProvider(
      indexedConfigurationSelector,
      new CraftEngineDefinitionProvider(manager, vanillaAssets),
    ),
    vscode.languages.registerDefinitionProvider(yamlSelector, textFeatures),
    vscode.languages.registerDocumentLinkProvider(
      indexedConfigurationSelector,
      documentLinks,
    ),
    vscode.languages.registerDocumentLinkProvider(yamlSelector, textFeatures),
    vscode.languages.registerColorProvider(
      yamlSelector,
      new CraftEngineColorProvider(),
    ),
    vscode.languages.registerCodeLensProvider(
      indexedConfigurationSelector,
      codeLens,
    ),
    ...registerPreviewCommands({
      manager,
      preview,
      itemPreview,
      furniturePreview,
      soundPreview,
      vanillaAssets,
    }),
    registerResourcesRootCommand(manager),
    registerMaterialCommand(vanillaCatalog, materialIcons),
    ...registerIndexCommands(manager, statusBar),
    vscode.commands.registerCommand(
      "craftengineYaml.redownloadMinecraftAssets",
      async () => {
        const root = await downloadAssets(true);
        if (root)
          await vscode.window.showInformationMessage(
            Messages.src.extension.text0006,
          );
      },
    ),
    vscode.commands.registerCommand("craftengineYaml.itemIconStatus", () =>
      itemIcons.status(),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.openTextReference",
      (argument?: { readonly uri: string; readonly offset: number }) =>
        textFeatures.openReference(argument),
    ),
    vscode.commands.registerCommand(
      "craftengineYaml.openTextDeclaration",
      (argument?: OpenTextDeclarationArgument) =>
        textDisplay.openDeclaration(argument),
    ),
  );

  await manager.rebuild();
}
