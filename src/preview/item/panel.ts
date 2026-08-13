import * as vscode from "vscode";

import type { ItemDefinition } from "../../config/item/model.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import { canonicalPath, samePath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type { WorkspaceIndex } from "../../workspace/model.js";
import {
  blockStatePreviews,
  previewItemForBlockState,
  type BlockStatePreview,
} from "../block/data.js";
import { editorPreviewFooter } from "../shared/footer.js";
import { nonce, previewStatusPage } from "../shared/html.js";
import { PLAYER_SKIN_DATA_URL } from "../shared/playerSkin.js";
import { Messages } from "../../messages.js";
import type {
  ItemPreviewDataBuilder,
  ItemPreviewLaunchOptions,
  ItemPreviewPayload,
} from "./data.js";

interface SelectedItem {
  readonly id: string;
  readonly root: string;
  readonly source: string;
  readonly offset: number;
  readonly options?: ItemPreviewLaunchOptions;
}

interface PersistedItemPreviewState {
  readonly locator?: SelectedItem;
  readonly itemId?: string;
}

const ITEM_PREVIEW_STATE_KEY = "craftengineYaml.preview.itemSelection";
const ITEM_PREVIEW_STATES_KEY = "craftengineYaml.preview.itemSelections";

interface ItemPreviewInstance {
  readonly panel: vscode.WebviewPanel;
  readonly disposables: vscode.Disposable[];
  selected: SelectedItem | undefined;
  payload: ItemPreviewPayload | undefined;
  ready: boolean;
  contentVisible: boolean;
  renderedItemId: string | undefined;
  options: ItemPreviewLaunchOptions | undefined;
  revision: number;
}

function isSelectedItem(value: unknown): value is SelectedItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectedItem>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.offset === "number"
  );
}

export class CraftEngineItemPreviewPanel
  implements vscode.Disposable, vscode.WebviewPanelSerializer
{
  public static readonly viewType = "craftengineYaml.itemPreview";

  private readonly instances = new Set<ItemPreviewInstance>();
  private readonly selections = new Map<string, SelectedItem>();
  private active: ItemPreviewInstance | undefined;
  private stateUpdate: Promise<void> = Promise.resolve();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly builder: ItemPreviewDataBuilder,
    private readonly state: vscode.Memento,
    private readonly indexProvider: () => WorkspaceIndex,
    private readonly resolveBlockPreview?: (
      preview: BlockStatePreview,
      index: WorkspaceIndex,
    ) => Promise<ItemDefinition>,
    private readonly vanillaAssets?: VanillaAssetStore,
    private readonly extensionVersion: string = Messages.src.preview.item.panel
      .text0001,
  ) {
    const stored = this.state.get<unknown>(ITEM_PREVIEW_STATES_KEY);
    if (isUnknownArray(stored)) {
      for (const value of stored) {
        if (isSelectedItem(value))
          this.selections.set(this.selectionKey(value), value);
      }
    }
    const legacy = this.state.get<unknown>(ITEM_PREVIEW_STATE_KEY);
    if (isSelectedItem(legacy))
      this.selections.set(this.selectionKey(legacy), legacy);
  }

  public status(): {
    readonly open: boolean;
    readonly ready: boolean;
    readonly rendered: boolean;
    readonly itemId?: string;
  } {
    const current = this.active;
    return current?.payload
      ? {
          open: true,
          ready: current.ready,
          rendered: current.renderedItemId === current.payload.id,
          itemId: current.payload.id,
        }
      : {
          open: current !== undefined,
          ready: current?.ready ?? false,
          rendered: false,
          ...(current?.selected ? { itemId: current.selected.id } : {}),
        };
  }

  public async show(
    item: ItemDefinition,
    options?: ItemPreviewLaunchOptions,
  ): Promise<void> {
    const resourceRoot = vscode.Uri.joinPath(this.extensionUri, "resources");
    const instance = this.attachPanel(
      vscode.window.createWebviewPanel(
        CraftEngineItemPreviewPanel.viewType,
        Messages.src.preview.item.panel.text0010,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            resourceRoot,
            vscode.Uri.joinPath(this.extensionUri, "target", "dist"),
            this.vanillaAssets?.globalStorageRoot ?? resourceRoot,
          ],
        },
      ),
    );
    instance.options = options;
    await this.render(instance, item, true, true);
  }

  private async render(
    instance: ItemPreviewInstance,
    item: ItemDefinition,
    reveal: boolean,
    notifyFailure: boolean,
  ): Promise<void> {
    const revision = ++instance.revision;
    if (reveal) instance.panel.reveal(vscode.ViewColumn.Beside, true);
    instance.panel.title =
      instance.options?.title ??
      Messages.src.preview.item.panel.text0002(item.id);
    instance.selected = {
      id: item.id,
      root: item.source.pack.resourcesRoot,
      source: item.source.uri,
      offset: instance.options?.locatorOffset ?? item.source.idRange.start,
      ...(instance.options === undefined ? {} : { options: instance.options }),
    };
    await this.rememberSelection(instance.selected);
    if (revision !== instance.revision) return;

    try {
      const payload = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: Messages.src.preview.item.panel.text0003(item.id),
        },
        () => this.builder.build(item),
      );
      if (revision !== instance.revision) return;
      if (!instance.contentVisible) {
        instance.ready = false;
        instance.contentVisible = true;
        instance.panel.webview.html = this.html(instance.panel.webview);
      }
      instance.payload =
        instance.options === undefined
          ? payload
          : { ...payload, launchOptions: instance.options };
      instance.renderedItemId = undefined;
      await this.postPayload(instance);
    } catch (error) {
      if (revision !== instance.revision) return;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(Messages.src.preview.item.panel.text0004, error);
      this.showUnavailable(
        instance,
        Messages.src.preview.item.panel.text0005(item.id, detail),
      );
      if (notifyFailure)
        void vscode.window.showErrorMessage(
          Messages.src.preview.item.panel.text0006(detail),
        );
    }
  }

  public async refresh(index: WorkspaceIndex): Promise<void> {
    await Promise.all(
      [...this.instances].map((instance) =>
        this.refreshInstance(instance, index),
      ),
    );
  }

  private async refreshInstance(
    instance: ItemPreviewInstance,
    index: WorkspaceIndex,
  ): Promise<void> {
    if (!instance.selected) return;
    const revision = ++instance.revision;
    const selected = instance.selected;
    instance.options = selected.options;

    let item: ItemDefinition | BlockStatePreview | undefined;
    if (selected.options?.kind === "block-state") {
      const previews = blockStatePreviews(index.blocks, index.items);
      item =
        previews.find(
          (candidate) =>
            candidate.blockId === selected.id &&
            candidate.source.uri === selected.source &&
            candidate.anchorRange.start === selected.offset,
        ) ??
        previews.find(
          (candidate) =>
            candidate.blockId === selected.id &&
            samePath(candidate.source.pack.resourcesRoot, selected.root) &&
            (selected.options?.label === undefined ||
              candidate.label === selected.options.label),
        );
    } else {
      item =
        index.items.find(
          (candidate) =>
            candidate.id === selected.id &&
            candidate.source.uri === selected.source &&
            candidate.source.idRange.start === selected.offset,
        ) ??
        index.items.find(
          (candidate) =>
            candidate.id === selected.id &&
            samePath(candidate.source.pack.resourcesRoot, selected.root),
        );
    }
    if (!item) {
      if (revision === instance.revision && index.generation > 0)
        this.showUnavailable(
          instance,
          Messages.src.preview.item.panel.text0007(selected.id),
        );
      return;
    }

    const resolved =
      "blockId" in item
        ? await (this.resolveBlockPreview?.(item, index) ??
            Promise.resolve(previewItemForBlockState(item, index.items)))
        : item;
    if (revision !== instance.revision) return;
    await this.render(instance, resolved, false, false);
  }

  public async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: unknown,
  ): Promise<void> {
    const instance = this.attachPanel(panel);
    const serialized =
      state && typeof state === "object"
        ? (state as PersistedItemPreviewState)
        : undefined;
    instance.selected = this.restoreSelection(serialized);
    if (!instance.selected) {
      this.showUnavailable(instance, Messages.src.preview.item.panel.text0008);
      return;
    }
    instance.options = instance.selected.options;
    panel.title =
      instance.options?.title ??
      Messages.src.preview.item.panel.text0009(instance.selected.id);
    const index = this.indexProvider();
    if (index.generation > 0) await this.refreshInstance(instance, index);
  }

  private attachPanel(panel: vscode.WebviewPanel): ItemPreviewInstance {
    const instance: ItemPreviewInstance = {
      panel,
      disposables: [],
      selected: undefined,
      payload: undefined,
      ready: false,
      contentVisible: true,
      renderedItemId: undefined,
      options: undefined,
      revision: 0,
    };
    this.instances.add(instance);
    this.active = instance;
    const resourceRoot = vscode.Uri.joinPath(this.extensionUri, "resources");
    const distRoot = vscode.Uri.joinPath(
      this.extensionUri,
      "target",
      "dist",
    );
    const guiRoot = this.vanillaAssets?.globalStorageRoot ?? resourceRoot;
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [resourceRoot, distRoot, guiRoot],
    };
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(
      () => {
        this.removeInstance(instance);
      },
      undefined,
      instance.disposables,
    );
    panel.onDidChangeViewState(
      ({ webviewPanel }) => {
        if (webviewPanel.active) this.active = instance;
      },
      undefined,
      instance.disposables,
    );
    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (!isRecord(message) || typeof message.type !== "string") return;
        switch (message.type) {
          case "ready":
            instance.ready = true;
            await this.postPayload(instance);
            return;
          case "rendered":
            if (
              typeof message.id === "string" &&
              message.id === instance.payload?.id
            )
              instance.renderedItemId = message.id;
            return;
          case "gpu-error":
            if (typeof message.detail !== "string") return;
            console.warn(
              Messages.src.preview.item.panel.text0011(message.detail),
            );
            void vscode.window.showWarningMessage(message.detail);
            return;
          case "error":
            if (typeof message.detail === "string")
              console.error(
                Messages.src.preview.item.panel.text0012(message.detail),
              );
            return;
          case "glyphs": {
            if (!isUnknownArray(message.codepoints)) return;
            const codepoints = [
              ...new Set(
                message.codepoints.filter(
                  (entry): entry is number =>
                    typeof entry === "number" &&
                    Number.isInteger(entry) &&
                    entry >= 0 &&
                    entry <= 0x10ffff,
                ),
              ),
            ].slice(0, 4096);
            const revision = instance.revision;
            const glyphs = await this.builder.glyphs(codepoints);
            if (revision === instance.revision)
              await instance.panel.webview.postMessage({
                type: "fontGlyphs",
                glyphs,
              });
            return;
          }
        }
      },
      undefined,
      instance.disposables,
    );
    return instance;
  }

  private showUnavailable(
    instance: ItemPreviewInstance,
    message: string,
  ): void {
    instance.revision += 1;
    instance.ready = false;
    instance.contentVisible = false;
    instance.payload = undefined;
    instance.renderedItemId = undefined;
    const footerStyle = instance.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    instance.panel.webview.html = previewStatusPage(
      Messages.src.preview.item.panel.text0013,
      Messages.src.preview.item.panel.text0014,
      message,
      footerStyle.toString(),
      editorPreviewFooter(this.extensionVersion),
    );
  }

  private selectionKey(selected: SelectedItem): string {
    return `${canonicalPath(selected.root)}\0${selected.source}\0${selected.offset}\0${selected.id}`;
  }

  private async rememberSelection(selected: SelectedItem): Promise<void> {
    this.selections.set(this.selectionKey(selected), selected);
    const pending = this.stateUpdate.then(async () => {
      await Promise.all([
        this.state.update(ITEM_PREVIEW_STATE_KEY, selected),
        this.state.update(ITEM_PREVIEW_STATES_KEY, [
          ...this.selections.values(),
        ]),
      ]);
    });
    this.stateUpdate = pending.catch(() => undefined);
    await pending;
  }

  private restoreSelection(
    serialized: PersistedItemPreviewState | undefined,
  ): SelectedItem | undefined {
    if (isSelectedItem(serialized?.locator)) return serialized.locator;
    if (typeof serialized?.itemId === "string") {
      const candidates = [...this.selections.values()].filter(
        (selected) => selected.id === serialized.itemId,
      );
      const occupied = new Set(
        [...this.instances]
          .map((instance) => instance.selected)
          .filter(
            (selected): selected is SelectedItem => selected !== undefined,
          )
          .map((selected) => this.selectionKey(selected)),
      );
      const available = candidates.find(
        (selected) => !occupied.has(this.selectionKey(selected)),
      );
      if (available) return available;
      if (candidates.length > 0) return candidates.at(-1);
    }
    if (this.selections.size === 1)
      return this.selections.values().next().value;
    return undefined;
  }

  private removeInstance(instance: ItemPreviewInstance): void {
    if (!this.instances.delete(instance)) return;
    for (const disposable of instance.disposables.splice(0))
      disposable.dispose();
    instance.revision += 1;
    instance.ready = false;
    instance.contentVisible = false;
    instance.payload = undefined;
    instance.renderedItemId = undefined;
    if (this.active === instance) this.active = [...this.instances].at(-1);
  }

  private async postPayload(instance: ItemPreviewInstance): Promise<void> {
    if (!instance.ready || !instance.payload) return;
    await instance.panel.webview.postMessage({
      type: "preview",
      payload: instance.payload,
    });
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const sharedStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "resources", "preview.css"),
    );
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "target",
        "dist",
        "item-preview.js",
      ),
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "resources", "item-preview.css"),
    );
    const footerStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    return Messages.src.preview.item.panel.text0015(
      webview.cspSource.toString(),
      webview.cspSource.toString(),
      webview.cspSource.toString(),
      token,
      sharedStyle.toString(),
      style.toString(),
      footerStyle.toString(),
      PLAYER_SKIN_DATA_URL,
      editorPreviewFooter(this.extensionVersion),
      token,
      script.toString(),
    );
  }

  public dispose(): void {
    for (const instance of [...this.instances]) instance.panel.dispose();
    for (const instance of [...this.instances]) this.removeInstance(instance);
  }
}
