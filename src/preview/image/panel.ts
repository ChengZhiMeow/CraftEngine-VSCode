import * as vscode from "vscode";

import type { ImageDefinition } from "../../config/image/model.js";
import type { VanillaAssetStore } from "../../minecraft/assets/store.js";
import { samePath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import type { WorkspaceIndex } from "../../workspace/model.js";
import { readPngDataUrl } from "../shared/assets.js";
import { editorPreviewFooter } from "../shared/footer.js";
import { nonce, previewStatusPage } from "../shared/html.js";

import { Messages } from "../../messages.js";
interface PreviewPayload {
  readonly id: string;
  readonly pack: string;
  readonly source: string;
  readonly sourceOffset: number;
  readonly texturePath: string;
  readonly textureUrl: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly rows: number;
  readonly columns: number;
  readonly row: number;
  readonly column: number;
  readonly height: number;
  readonly ascent: number;
  readonly font: string;
  readonly canSaveConfiguration: boolean;
  readonly saveUnavailableReason: string;
  readonly defaultZoom: number;
  readonly defaultReservedLines: number;
  readonly vanilla: {
    readonly generic54: string;
    readonly anvil: string;
    readonly textField: string;
  };
}

interface SelectedImage {
  readonly id: string;
  readonly root: string;
  readonly source: string;
  readonly offset: number;
}

interface PersistedImagePreviewState {
  readonly locator?: SelectedImage;
}

const IMAGE_PREVIEW_STATE_KEY = "craftengineYaml.preview.imageSelection";

function isSelectedImage(value: unknown): value is SelectedImage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SelectedImage>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.root === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.offset === "number"
  );
}

function pairedSlider(
  id: string,
  label: string,
  minimum: number,
  maximum: number,
  step: number,
  value: number,
  suffix = "",
  showMaximum = false,
): string {
  return `<label class="control-field"><span class="control-title"><span>${label}</span>${showMaximum ? `<small id="${id}-limit"></small>` : ""}</span><span class="paired-control">
    <input id="${id}-range" data-sync="${id}" data-role="range" type="range" min="${minimum}" max="${maximum}" step="${step}" value="${value}">
    <span class="number-box"><input id="${id}" data-sync="${id}" data-role="number" type="number" min="${minimum}" max="${maximum}" step="${step}" value="${value}">${suffix ? `<span>${suffix}</span>` : ""}</span>
  </span></label>`;
}

export class CraftEnginePreviewPanel
  implements vscode.Disposable, vscode.WebviewPanelSerializer
{
  public static readonly viewType = "craftengineYaml.preview";

  private panel: vscode.WebviewPanel | undefined;
  private selected: SelectedImage | undefined;
  private payload: PreviewPayload | undefined;
  private ready = false;
  private contentVisible = false;
  private renderedImageId: string | undefined;
  private unicodeFontLoaded = false;
  private readonly disposables: vscode.Disposable[] = [];
  private vanillaAssets: PreviewPayload["vanilla"] | undefined;
  private revision = 0;
  private stateUpdate: Promise<void> = Promise.resolve();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: vscode.Memento,
    private readonly indexProvider: () => WorkspaceIndex,
    private readonly assetStore?: VanillaAssetStore,
    private readonly extensionVersion: string = Messages.src.preview.image.panel
      .text0001,
  ) {}

  public status(): {
    readonly open: boolean;
    readonly ready: boolean;
    readonly rendered: boolean;
    readonly unicodeFontLoaded: boolean;
    readonly imageId?: string;
  } {
    return this.payload
      ? {
          open: this.panel !== undefined,
          ready: this.ready,
          rendered:
            this.renderedImageId === this.payload.id && this.unicodeFontLoaded,
          unicodeFontLoaded: this.unicodeFontLoaded,
          imageId: this.payload.id,
        }
      : {
          open: this.panel !== undefined,
          ready: this.ready,
          rendered: false,
          unicodeFontLoaded: false,
          ...(this.selected ? { imageId: this.selected.id } : {}),
        };
  }

  public async show(
    image: ImageDefinition,
    index: WorkspaceIndex,
  ): Promise<void> {
    await this.render(image, index, true, true);
  }

  private async render(
    image: ImageDefinition,
    index: WorkspaceIndex,
    reveal: boolean,
    notifyFailure: boolean,
  ): Promise<void> {
    if (!this.panel) {
      const resourceRoot = vscode.Uri.joinPath(this.extensionUri, "resources");
      const distRoot = vscode.Uri.joinPath(
        this.extensionUri,
        "target",
        "dist",
      );
      this.attachPanel(
        vscode.window.createWebviewPanel(
          CraftEnginePreviewPanel.viewType,
          Messages.src.preview.image.panel.text0013,
          { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [resourceRoot, distRoot],
          },
        ),
      );
    }

    const revision = ++this.revision;
    if (reveal) this.panel?.reveal(vscode.ViewColumn.Beside, true);
    const selected: SelectedImage = {
      id: image.id,
      root: image.source.pack.resourcesRoot,
      source: image.source.uri,
      offset: image.source.idRange.start,
    };
    this.selected = selected;
    const stateUpdate = this.stateUpdate.then(() =>
      this.state.update(IMAGE_PREVIEW_STATE_KEY, selected),
    );
    this.stateUpdate = stateUpdate.catch(() => undefined);
    await stateUpdate.catch(() => undefined);
    if (revision !== this.revision || !this.panel) return;

    const resolved = index.resolved.get(image);
    if (!resolved || resolved.bitmap.spec.kind !== "bitmap") {
      this.showUnavailable(Messages.src.preview.image.panel.text0002(image.id));
      if (notifyFailure)
        await vscode.window.showErrorMessage(
          Messages.src.preview.image.panel.text0003(image.id),
        );
      return;
    }
    const bitmap = resolved.bitmap.spec;
    const texture =
      bitmap.textureCandidates.find((candidate) => candidate.effective) ??
      bitmap.textureCandidates[0];
    if (
      !texture ||
      texture.width === undefined ||
      texture.height === undefined
    ) {
      this.showUnavailable(
        Messages.src.preview.image.panel.text0004(image.id, bitmap.file),
      );
      if (notifyFailure)
        await vscode.window.showErrorMessage(
          Messages.src.preview.image.panel.text0005(bitmap.file),
        );
      return;
    }
    try {
      const [vanilla, textureUrl] = await Promise.all([
        this.loadVanillaAssets(),
        readPngDataUrl(texture.path),
      ]);
      if (revision !== this.revision || !this.panel) return;

      const payload: PreviewPayload = {
        id: image.id,
        pack: image.source.pack.name,
        source: image.source.uri,
        sourceOffset: image.source.idRange.start,
        texturePath: texture.path,
        textureUrl,
        textureWidth: texture.width,
        textureHeight: texture.height,
        rows: bitmap.rows,
        columns: bitmap.columns,
        row: resolved.row,
        column: resolved.column,
        height: bitmap.height ?? Math.floor(texture.height / bitmap.rows),
        ascent:
          bitmap.ascent ??
          (bitmap.height ?? Math.floor(texture.height / bitmap.rows)) - 1,
        font: bitmap.font,
        canSaveConfiguration: resolved.bitmap.source.kind === "direct",
        saveUnavailableReason:
          resolved.bitmap.source.kind === "direct"
            ? ""
            : Messages.src.preview.image.panel.text0006,
        defaultZoom: vscode.workspace
          .getConfiguration("craftengineYaml")
          .get<number>("preview.defaultZoom", 0),
        defaultReservedLines: 1,
        vanilla,
      };
      if (!this.contentVisible) {
        this.ready = false;
        this.contentVisible = true;
        this.panel.webview.html = this.html(this.panel.webview);
      }
      this.payload = payload;
    } catch (error) {
      if (revision !== this.revision) return;
      const detail = error instanceof Error ? error.message : String(error);
      this.showUnavailable(
        Messages.src.preview.image.panel.text0007(image.id, detail),
      );
      if (notifyFailure)
        await vscode.window.showErrorMessage(
          Messages.src.preview.image.panel.text0008(detail),
        );
      return;
    }
    this.renderedImageId = undefined;
    this.unicodeFontLoaded = false;
    await this.postPayload();
  }

  public async refresh(index: WorkspaceIndex): Promise<void> {
    if (!this.selected || !this.panel) return;
    const selected = this.selected;
    const image =
      index.images.find(
        (candidate) =>
          candidate.id === selected.id &&
          candidate.source.uri === selected.source &&
          candidate.source.idRange.start === selected.offset,
      ) ??
      index.images.find(
        (candidate) =>
          candidate.id === selected.id &&
          samePath(candidate.source.pack.resourcesRoot, selected.root),
      );
    if (image) {
      await this.render(image, index, false, false);
      return;
    }
    if (index.generation > 0)
      this.showUnavailable(
        Messages.src.preview.image.panel.text0009(selected.id),
      );
  }

  public async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: unknown,
  ): Promise<void> {
    this.attachPanel(panel);
    const serialized =
      state && typeof state === "object"
        ? (state as PersistedImagePreviewState)
        : undefined;
    const stored = this.state.get<unknown>(IMAGE_PREVIEW_STATE_KEY);
    this.selected = isSelectedImage(serialized?.locator)
      ? serialized.locator
      : isSelectedImage(stored)
        ? stored
        : undefined;
    if (!this.selected) {
      this.showUnavailable(Messages.src.preview.image.panel.text0010);
      return;
    }
    panel.title = Messages.src.preview.image.panel.text0011(this.selected.id);
    const index = this.indexProvider();
    if (index.generation > 0) await this.refresh(index);
  }

  private async loadVanillaAssets(): Promise<PreviewPayload["vanilla"]> {
    if (this.vanillaAssets) return this.vanillaAssets;
    if (!this.assetStore)
      throw new Error(Messages.src.preview.image.panel.text0012);
    this.vanillaAssets = {
      generic54: await readPngDataUrl(
        await this.assetStore.resource(
          "minecraft:gui/container/generic_54",
          "texture",
        ),
      ),
      anvil: await readPngDataUrl(
        await this.assetStore.resource(
          "minecraft:gui/container/anvil",
          "texture",
        ),
      ),
      textField: await readPngDataUrl(
        await this.assetStore.resource(
          "minecraft:gui/sprites/container/anvil/text_field",
          "texture",
        ),
      ),
    };
    return this.vanillaAssets;
  }

  private attachPanel(panel: vscode.WebviewPanel): void {
    this.revision += 1;
    this.panel = panel;
    this.ready = false;
    this.contentVisible = true;
    const resourceRoot = vscode.Uri.joinPath(this.extensionUri, "resources");
    const distRoot = vscode.Uri.joinPath(
      this.extensionUri,
      "target",
      "dist",
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [resourceRoot, distRoot],
    };
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(
      () => {
        this.revision += 1;
        this.panel = undefined;
        this.ready = false;
        this.contentVisible = false;
        this.payload = undefined;
        this.renderedImageId = undefined;
        this.unicodeFontLoaded = false;
      },
      undefined,
      this.disposables,
    );
    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (!isRecord(message) || typeof message.type !== "string") return;
        switch (message.type) {
          case "ready":
            this.ready = true;
            await this.postPayload();
            return;
          case "rendered":
            if (
              typeof message.id !== "string" ||
              message.id !== this.payload?.id
            )
              return;
            this.renderedImageId = message.id;
            this.unicodeFontLoaded = message.unicodeFontLoaded === true;
            return;
          case "openTexture":
            if (this.payload)
              await vscode.commands.executeCommand(
                "vscode.open",
                vscode.Uri.file(this.payload.texturePath),
              );
            return;
          case "saveConfig": {
            if (!this.payload) return;
            const revision = this.revision;
            const panel = this.panel;
            const payload = this.payload;
            const height = Number(message.height);
            const ascent = Number(message.ascent);
            if (
              !Number.isInteger(height) ||
              !Number.isInteger(ascent) ||
              height < -512 ||
              height > 512 ||
              ascent < -512 ||
              ascent > 512
            ) {
              await panel?.webview.postMessage({
                type: "saveResult",
                ok: false,
                message: Messages.src.preview.image.panel.text0014,
                height,
                ascent,
              });
              return;
            }
            const result = (await vscode.commands.executeCommand<{
              readonly ok: boolean;
              readonly message: string;
            }>(
              "craftengineYaml.saveImageDimensions",
              { uri: payload.source, offset: payload.sourceOffset },
              height,
              ascent,
            )) ?? {
              ok: false,
              message: Messages.src.preview.image.panel.text0015,
            };
            if (revision === this.revision && panel === this.panel) {
              await panel?.webview.postMessage({
                type: "saveResult",
                ...result,
                height,
                ascent,
              });
            }
            return;
          }
        }
      },
      undefined,
      this.disposables,
    );
  }

  private showUnavailable(message: string): void {
    this.revision += 1;
    if (!this.panel) return;
    this.ready = false;
    this.contentVisible = false;
    this.payload = undefined;
    this.renderedImageId = undefined;
    this.unicodeFontLoaded = false;
    const footerStyle = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    this.panel.webview.html = previewStatusPage(
      Messages.src.preview.image.panel.text0016,
      Messages.src.preview.image.panel.text0017,
      message,
      footerStyle.toString(),
      editorPreviewFooter(this.extensionVersion),
    );
  }

  private async postPayload(): Promise<void> {
    if (!this.panel || !this.ready || !this.payload) return;
    await this.panel.webview.postMessage({
      type: "preview",
      payload: this.payload,
    });
  }

  private html(webview: vscode.Webview): string {
    const token = nonce();
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "target",
        "dist",
        "image-preview.js",
      ),
    );
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "resources", "preview.css"),
    );
    const footerStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    const chatImage = (name: string): string =>
      webview
        .asWebviewUri(
          vscode.Uri.joinPath(
            this.extensionUri,
            "resources",
            "chat",
            `${name}.jpg`,
          ),
        )
        .toString();
    return Messages.src.preview.image.panel.text0018(
      webview.cspSource.toString(),
      webview.cspSource.toString(),
      webview.cspSource.toString(),
      token,
      style.toString(),
      footerStyle.toString(),
      pairedSlider(
        "row",
        Messages.preview.image.controls.row,
        0,
        0,
        1,
        0,
        "",
        true,
      ),
      pairedSlider(
        "col",
        Messages.preview.image.controls.column,
        0,
        0,
        1,
        0,
        "",
        true,
      ),
      pairedSlider(
        "height",
        Messages.preview.image.controls.height,
        -512,
        512,
        1,
        8,
      ),
      pairedSlider(
        "ascent",
        Messages.preview.image.controls.ascent,
        -512,
        512,
        1,
        7,
      ),
      pairedSlider(
        "shift",
        Messages.preview.image.controls.shift,
        -256,
        256,
        1,
        0,
      ),
      pairedSlider(
        "container-rows",
        Messages.preview.image.controls.containerRows,
        1,
        6,
        1,
        6,
      ),
      editorPreviewFooter(this.extensionVersion),
      chatImage("grass"),
      chatImage("desert"),
      chatImage("stone"),
      chatImage("water"),
      token,
      script.toString(),
    );
  }

  public dispose(): void {
    this.revision += 1;
    this.panel?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
