import * as vscode from "vscode";

import type { FurnitureDefinition } from "../../config/furniture/model.js";
import { canonicalPath, samePath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type { WorkspaceIndex } from "../../workspace/model.js";
import {
  buildFurniturePreviewPayload,
  furniturePreviewRotationRules,
  type FurnitureItemModelPayload,
  type FurniturePreviewPayload,
  type FurnitureRotationRule,
} from "./data.js";
import type { ItemPreviewDataBuilder } from "../item/data.js";
import type { MaterialIconService } from "../item/materialIcons.js";
import { editorPreviewFooter } from "../shared/footer.js";
import { Messages } from "../../messages.js";
import { nonce, previewStatusPage } from "../shared/html.js";
import { PLAYER_SKIN_DATA_URL } from "../shared/playerSkin.js";
import { hasPreviewSource } from "../shared/source.js";

interface SelectedFurniture {
  readonly id: string;
  readonly root: string;
  readonly source: string;
  readonly offset: number;
}

interface FurniturePreviewInstance {
  readonly panel: vscode.WebviewPanel;
  readonly disposables: vscode.Disposable[];
  selected: SelectedFurniture | undefined;
  payload: FurniturePreviewPayload | undefined;
  ready: boolean;
  rendered: boolean;
  selectedVariant: string | undefined;
  selectedSeat: string | undefined;
  renderedModelCount: number;
  renderedMeshCount: number;
  labelsVisible: boolean;
  contentVisible: boolean;
  revision: number;
}

const STATE_KEY = "craftengineYaml.preview.furnitureSelections";

function isSelected(value: unknown): value is SelectedFurniture {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectedFurniture>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.offset === "number"
  );
}

export class CraftEngineFurniturePreviewPanel
  implements vscode.Disposable, vscode.WebviewPanelSerializer
{
  public static readonly viewType = "craftengineYaml.furniturePreview";

  private readonly instances = new Set<FurniturePreviewInstance>();
  private readonly selections = new Map<string, SelectedFurniture>();
  private active: FurniturePreviewInstance | undefined;
  private stateUpdate: Promise<void> = Promise.resolve();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: vscode.Memento,
    private readonly indexProvider: () => WorkspaceIndex,
    private readonly itemPreviewBuilder: ItemPreviewDataBuilder,
    private readonly materialIcons: MaterialIconService,
    private readonly globalStorageUri: vscode.Uri,
    private readonly extensionVersion: string = Messages.src.preview.furniture
      .panel.text0001,
  ) {
    const stored = this.state.get<unknown>(STATE_KEY);
    if (isUnknownArray(stored))
      for (const value of stored)
        if (isSelected(value)) this.selections.set(this.key(value), value);
  }

  public status(): Readonly<{
    open: boolean;
    ready: boolean;
    rendered: boolean;
    furnitureId?: string;
    variant?: string;
    rotationRule?: FurnitureRotationRule;
    seat?: string;
    elementCount?: number;
    hitboxCount?: number;
    seatCount?: number;
    lightCount?: number;
    displayItemCount?: number;
    itemIconCount?: number;
    itemModelCount?: number;
    renderedModelCount?: number;
    renderedMeshCount?: number;
    labelsVisible?: boolean;
  }> {
    const current = this.active;
    const variant =
      current?.payload?.variants.find(
        (entry) => entry.name === current.selectedVariant,
      ) ?? current?.payload?.variants[0];
    return {
      open: current !== undefined,
      ready: current?.ready ?? false,
      rendered: current?.rendered ?? false,
      ...(current?.rendered
        ? {
            renderedModelCount: current.renderedModelCount,
            renderedMeshCount: current.renderedMeshCount,
            labelsVisible: current.labelsVisible,
          }
        : {}),
      ...(current?.payload ? { furnitureId: current.payload.id } : {}),
      ...(variant
        ? {
            variant: variant.name,
            rotationRule: variant.rotationRule,
            elementCount: variant.elements.length,
            hitboxCount: variant.hitboxes.length,
            seatCount: variant.seats.length,
            lightCount: variant.lights.length,
            displayItemCount: variant.displayItems.length,
            itemIconCount: Object.keys(current?.payload?.itemIcons ?? {})
              .length,
            itemModelCount: Object.keys(current?.payload?.itemModels ?? {})
              .length,
          }
        : {}),
      ...(current?.selectedSeat ? { seat: current.selectedSeat } : {}),
    };
  }

  public hasSource(source: string): boolean {
    return hasPreviewSource(
      [...this.instances].map((instance) => instance.selected?.source),
      source,
    );
  }

  public async show(furniture: FurnitureDefinition): Promise<void> {
    const instance = this.attachPanel(
      vscode.window.createWebviewPanel(
        CraftEngineFurniturePreviewPanel.viewType,
        Messages.src.preview.furniture.panel.text0007,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.extensionUri, "resources"),
            vscode.Uri.joinPath(this.extensionUri, "target", "dist"),
            this.globalStorageUri,
          ],
        },
      ),
    );
    await this.render(instance, furniture, true);
  }

  public async refresh(index: WorkspaceIndex): Promise<void> {
    await Promise.all(
      [...this.instances].map((instance) =>
        this.refreshInstance(instance, index),
      ),
    );
  }

  public async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: unknown,
  ): Promise<void> {
    const instance = this.attachPanel(panel);
    const direct = isSelected(state)
      ? state
      : isRecord(state) && isSelected(state.locator)
        ? state.locator
        : undefined;
    if (direct) {
      instance.selected = direct;
    } else {
      const occupied = new Set(
        [...this.instances]
          .filter((candidate) => candidate !== instance)
          .map((candidate) => candidate.selected)
          .filter(
            (selected): selected is SelectedFurniture => selected !== undefined,
          )
          .map((selected) => this.key(selected)),
      );
      instance.selected =
        [...this.selections.values()].find(
          (selected) => !occupied.has(this.key(selected)),
        ) ?? [...this.selections.values()].at(-1);
    }
    if (!instance.selected) {
      this.unavailable(instance, Messages.src.preview.furniture.panel.text0002);
      return;
    }
    panel.title = Messages.src.preview.furniture.panel.text0003(
      instance.selected.id,
    );
    const index = this.indexProvider();
    if (index.generation > 0) await this.refreshInstance(instance, index);
  }

  private async render(
    instance: FurniturePreviewInstance,
    furniture: FurnitureDefinition,
    reveal: boolean,
  ): Promise<void> {
    const revision = ++instance.revision;
    if (reveal) instance.panel.reveal(vscode.ViewColumn.Beside, true);
    instance.panel.title = Messages.src.preview.furniture.panel.text0004(
      furniture.id,
    );
    const selected: SelectedFurniture = {
      id: furniture.id,
      root: furniture.source.pack.resourcesRoot,
      source: furniture.source.uri,
      offset: furniture.source.idRange.start,
    };
    instance.selected = selected;
    this.selections.set(this.key(selected), selected);
    const pending = this.stateUpdate.then(() =>
      this.state.update(STATE_KEY, [...this.selections.values()]),
    );
    this.stateUpdate = pending.catch(() => undefined);
    await pending.catch(() => undefined);
    if (revision !== instance.revision) return;

    try {
      const index = this.indexProvider();
      const payload = buildFurniturePreviewPayload(
        furniture,
        0,
        furniturePreviewRotationRules(
          furniture,
          index.items,
          samePath,
        ),
      );

      const ids = new Set<string>();
      for (const variant of payload.variants) {
        for (const element of variant.elements) {
          if (element.item) ids.add(element.item);
          if (element.block) ids.add(element.block.replace(/\[.*$/u, ""));
        }
      }
      const assets = await Promise.all(
        [...ids].map(async (id) => {
          const [icon, model] = await Promise.all([
            this.itemIcon(
              id,
              furniture.source.pack.resourcesRoot,
              instance.panel.webview,
              index,
            ),
            this.itemModel(id, furniture.source.pack.resourcesRoot, index),
          ]);
          return { id, icon, model };
        }),
      );
      if (revision !== instance.revision) return;

      const itemIcons: Record<string, string> = {};
      const itemModels: Record<string, FurnitureItemModelPayload> = {};
      for (const asset of assets) {
        if (asset.icon !== undefined) itemIcons[asset.id] = asset.icon;
        if (asset.model !== undefined) itemModels[asset.id] = asset.model;
      }
      const finalPayload: FurniturePreviewPayload = {
        ...payload,
        itemIcons,
        itemModels,
        variants: payload.variants.map((variant) => ({
          ...variant,
          elements: variant.elements.map((element) => {
            const itemIcon =
              element.item === undefined ? undefined : itemIcons[element.item];
            return itemIcon === undefined ? element : { ...element, itemIcon };
          }),
        })),
      };
      if (!instance.contentVisible) {
        instance.ready = false;
        instance.contentVisible = true;
        instance.panel.webview.html = this.html(instance.panel.webview);
      }
      instance.payload = finalPayload;
      instance.selectedVariant = finalPayload.variants[0]?.name;
      instance.rendered = false;
      instance.renderedModelCount = 0;
      instance.renderedMeshCount = 0;
      instance.labelsVisible = false;
      await this.post(instance);
    } catch (error) {
      if (revision !== instance.revision) return;
      this.unavailable(
        instance,
        Messages.src.preview.furniture.panel.text0005(
          furniture.id,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  private async refreshInstance(
    instance: FurniturePreviewInstance,
    index: WorkspaceIndex,
  ): Promise<void> {
    const selected = instance.selected;
    if (!selected) return;
    const furniture =
      index.furniture.find(
        (entry) =>
          entry.id === selected.id &&
          entry.source.uri === selected.source &&
          entry.source.idRange.start === selected.offset,
      ) ??
      index.furniture.find(
        (entry) =>
          entry.id === selected.id &&
          samePath(entry.source.pack.resourcesRoot, selected.root),
      );
    if (furniture) {
      await this.render(instance, furniture, false);
      return;
    }
    if (index.generation > 0)
      this.unavailable(
        instance,
        Messages.src.preview.furniture.panel.text0006(selected.id),
      );
  }

  private attachPanel(panel: vscode.WebviewPanel): FurniturePreviewInstance {
    const instance: FurniturePreviewInstance = {
      panel,
      disposables: [],
      selected: undefined,
      payload: undefined,
      ready: false,
      rendered: false,
      selectedVariant: undefined,
      selectedSeat: undefined,
      renderedModelCount: 0,
      renderedMeshCount: 0,
      labelsVisible: false,
      contentVisible: true,
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
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [resourceRoot, distRoot, this.globalStorageUri],
    };
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(
      () => {
        instance.revision += 1;
        this.instances.delete(instance);
        for (const disposable of instance.disposables) disposable.dispose();
        if (this.active === instance) this.active = [...this.instances].at(-1);
      },
      undefined,
      instance.disposables,
    );
    panel.onDidChangeViewState(
      () => {
        if (panel.active) this.active = instance;
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
            await this.post(instance);
            return;
          case "gpu-error":
            if (typeof message.detail !== "string") return;
            console.warn(
              Messages.src.preview.furniture.panel.text0008(message.detail),
            );
            void vscode.window.showWarningMessage(message.detail);
            return;
          case "rendered":
            if (message.id !== instance.payload?.id) return;
            instance.rendered = true;
            instance.renderedModelCount =
              typeof message.modelCount === "number" &&
              Number.isInteger(message.modelCount) &&
              message.modelCount >= 0
                ? message.modelCount
                : 0;
            instance.renderedMeshCount =
              typeof message.meshCount === "number" &&
              Number.isInteger(message.meshCount) &&
              message.meshCount >= 0
                ? message.meshCount
                : 0;
            instance.labelsVisible = message.labelsVisible === true;
            return;
          case "state":
            if (
              typeof message.variant === "string" &&
              instance.payload?.variants.some(
                (variant) => variant.name === message.variant,
              )
            )
              instance.selectedVariant = message.variant;
            instance.selectedSeat =
              typeof message.seat === "string" &&
              instance.payload?.variants
                .find((variant) => variant.name === instance.selectedVariant)
                ?.seats.some((seat) => seat.id === message.seat)
                ? message.seat
                : undefined;
            return;
          case "item-icon": {
            if (typeof message.id !== "string" || !instance.selected) return;
            if (
              !instance.payload?.variants.some((variant) =>
                variant.elements.some(
                  (element) =>
                    element.item === message.id ||
                    element.block?.replace(/\[.*$/u, "") === message.id,
                ),
              )
            )
              return;
            const revision = instance.revision;
            const id = message.id;
            const uri = await this.itemIcon(
              id,
              instance.selected.root,
              panel.webview,
            );
            if (uri && revision === instance.revision)
              await panel.webview.postMessage({ type: "item-icon", id, uri });
            return;
          }
          case "item-model": {
            if (typeof message.id !== "string" || !instance.selected) return;
            if (
              !instance.payload?.variants.some((variant) =>
                variant.elements.some(
                  (element) =>
                    element.item === message.id ||
                    element.block?.replace(/\[.*$/u, "") === message.id,
                ),
              )
            )
              return;
            const revision = instance.revision;
            const id = message.id;
            const model = await this.itemModel(id, instance.selected.root);
            if (model && revision === instance.revision)
              await panel.webview.postMessage({
                type: "item-model",
                id,
                model,
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

  private async post(instance: FurniturePreviewInstance): Promise<void> {
    if (!instance.contentVisible || !instance.ready || !instance.payload)
      return;
    await instance.panel.webview.postMessage({
      type: "preview",
      payload: instance.payload,
    });
  }

  private unavailable(
    instance: FurniturePreviewInstance,
    message: string,
  ): void {
    instance.revision += 1;
    instance.ready = false;
    instance.contentVisible = false;
    instance.payload = undefined;
    instance.rendered = false;
    instance.renderedModelCount = 0;
    instance.renderedMeshCount = 0;
    instance.labelsVisible = false;
    const footerStyle = instance.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    instance.panel.webview.html = previewStatusPage(
      Messages.src.preview.furniture.panel.text0009,
      Messages.src.preview.furniture.panel.text0010,
      message,
      footerStyle.toString(),
      editorPreviewFooter(this.extensionVersion),
    );
  }

  private key(selected: SelectedFurniture): string {
    return `${canonicalPath(selected.root)}\0${selected.source}\0${selected.offset}\0${selected.id}`;
  }

  private async itemIcon(
    id: string,
    resourcesRoot: string,
    webview: vscode.Webview,
    index: WorkspaceIndex = this.indexProvider(),
  ): Promise<string | undefined> {
    const item = index.items.find(
      (entry) =>
        entry.id === id &&
        entry.source.pack.active &&
        samePath(entry.source.pack.resourcesRoot, resourcesRoot),
    );
    try {
      const icon = item
        ? await this.materialIcons.iconForItem(
            item,
            index.resources,
            index.generation,
            96,
          )
        : await this.materialIcons.icon(id, 96);
      return webview.asWebviewUri(icon).toString();
    } catch {
      return undefined;
    }
  }

  private async itemModel(
    id: string,
    resourcesRoot: string,
    index: WorkspaceIndex = this.indexProvider(),
  ): Promise<FurnitureItemModelPayload | undefined> {
    const item = index.items.find(
      (entry) =>
        entry.id === id &&
        entry.source.pack.active &&
        samePath(entry.source.pack.resourcesRoot, resourcesRoot),
    );
    if (!item) return undefined;
    try {
      const payload = await this.itemPreviewBuilder.build(item);
      return {
        model: payload.client.model,
        components: payload.client.components,
        models: payload.models,
        textures: payload.textures,
        textureMetadata: payload.textureMetadata,
        missingTexture: payload.missingTexture,
        missingModel: payload.missingModel,
        issues: payload.issues,
      };
    } catch {
      return undefined;
    }
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const sharedStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "resources", "preview.css"),
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "furniture-preview.css",
      ),
    );
    const footerStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "target",
        "dist",
        "furniture-preview.js",
      ),
    );
    return Messages.src.preview.furniture.panel.text0011(
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
    for (const instance of [...this.instances]) {
      instance.revision += 1;
      instance.panel.dispose();
    }
    this.instances.clear();
  }
}
