import * as vscode from "vscode";

import type { ItemDefinition } from "../config/item/model.js";
import { parseLooseScalar } from "../config/parsing/craftEngineYaml.js";
import type { TextRange } from "../diagnostics/model.js";
import type { MaterialIconService } from "../preview/item/materialIcons.js";
import { makeIdentifier } from "../util/identifiers.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import { Messages } from "../messages.js";
import type { WorkspaceIndex } from "../workspace/model.js";

interface MaterialArgument {
  readonly uri: string;
  readonly start: number;
  readonly end: number;
}

interface ItemIconTarget {
  readonly id: string;
  readonly material: string;
  readonly materialRange: TextRange;
  readonly materialArgument: MaterialArgument;
}

export interface ItemIconDecorationStatus {
  readonly count: number;
  readonly entries: readonly {
    readonly uri: string;
    readonly id: string;
    readonly material: string;
    readonly clickable: boolean;
  }[];
}

export function editorLineHeightFromSettings(
  fontSize: number,
  configuredLineHeight: number,
  platform = process.platform,
): number {
  let lineHeight = configuredLineHeight;
  if (lineHeight === 0)
    lineHeight = fontSize * (platform === "darwin" ? 1.5 : 1.35);
  else if (lineHeight < 8) lineHeight *= fontSize;
  return Math.max(8, Math.round(lineHeight));
}

export function editorLineHeight(editor: vscode.TextEditor): number {
  const configuration = vscode.workspace.getConfiguration(
    "editor",
    editor.document.uri,
  );
  return editorLineHeightFromSettings(
    configuration.get<number>("fontSize", 14),
    configuration.get<number>("lineHeight", 0),
  );
}

export function editorIconAttachmentStyle(
  lineHeight: number,
  iconUrl?: string,
): {
  readonly slotSize: number;
  readonly imageSize: number;
  readonly width: string;
  readonly height: string;
  readonly margin: string;
  readonly textDecoration: string;
} {
  const slotSize = Math.max(10, Math.round(lineHeight));
  const imageSize = Math.max(8, slotSize - 2);
  return {
    slotSize,
    imageSize,
    width: `${imageSize}px`,
    height: `${slotSize}px`,
    margin: "0 1px 0 0",
// 背景图用来固定图标大小, 避免高分屏把尺寸放大
    textDecoration:
      [
        "none",
        "display: inline-block",
        "box-sizing: border-box",
        "vertical-align: top",
        "line-height: 0",
        "image-rendering: pixelated",
        ...(iconUrl === undefined
          ? []
          : [
              `background-image: url("${iconUrl
                .replaceAll("\\", "\\\\")
                .replaceAll('"', '\\"')
                .replace(/[\r\n\f]/gu, "")}")`,
              "background-position: center",
              "background-repeat: no-repeat",
              `background-size: ${imageSize}px ${imageSize}px`,
            ]),
      ].join("; ") + ";",
  };
}

export class CraftEngineItemIconDecorations implements vscode.Disposable {
  private readonly decorationTypes = new Map<
    string,
    vscode.TextEditorDecorationType
  >();
  private readonly clickTargets = new Map<
    string,
    ReadonlyMap<number, ItemIconTarget>
  >();
  private readonly entries = new Map<string, ItemIconTarget[]>();
  private readonly disposables: vscode.Disposable[];
  private revision = 0;
  private lastClick = { key: "", at: 0 };

  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
    private readonly icons: MaterialIconService,
  ) {
    this.disposables = [
      vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()),
      vscode.window.onDidChangeTextEditorSelection((event) =>
        this.handleSelection(event),
      ),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("editor.fontSize") ||
          event.affectsConfiguration("editor.lineHeight") ||
          event.affectsConfiguration("window.zoomLevel")
        )
          this.refresh();
      }),
    ];
  }

  public refresh(_index?: WorkspaceIndex): void {
    const revision = ++this.revision;
    for (const editor of vscode.window.visibleTextEditors) {
      if (
        editor.document.languageId === "yaml" &&
        editor.document.uri.scheme === "file"
      ) {
        void this.refreshEditor(editor, revision);
      } else {
        this.clearEditor(editor);
      }
    }
  }

  public status(): ItemIconDecorationStatus {
    const entries = [...this.entries.entries()].flatMap(([uri, values]) =>
      values.map((value) => ({
        uri,
        id: value.id,
        material: value.material,
        clickable: true,
      })),
    );
    return { count: entries.length, entries };
  }

  private async refreshEditor(
    editor: vscode.TextEditor,
    revision: number,
  ): Promise<void> {
    const document = editor.document;
    const materialRanges = new Set<string>();
    const grouped = new Map<string, ItemDefinition[]>();
    for (const item of this.workspaceIndex.itemsInDocument(document)) {
      const key = `${item.source.idRange.start}:${item.source.idRange.end}`;
      const values = grouped.get(key) ?? [];
      values.push(item);
      grouped.set(key, values);
    }
    const targets = [...grouped.values()].flatMap((items): ItemIconTarget[] => {
      const item = items[0];
      if (!item) return [];
      if (item.material === "minecraft:air") return [];
      let materialRange: TextRange | undefined;
      for (const key of ["material", "overrides.material", "merges.material"]) {
        const range = item.source.fieldValueRanges.get(key);
        const keyRange = item.source.fieldKeyRanges.get(key);
        if (
          !range ||
          !keyRange ||
          range.start < item.source.entryRange.start ||
          range.end > item.source.entryRange.end ||
          keyRange.start < item.source.entryRange.start ||
          keyRange.end > item.source.entryRange.end
        )
          continue;
        const sourceKey = parseLooseScalar(
          document
            .getText(
              new vscode.Range(
                document.positionAt(keyRange.start),
                document.positionAt(keyRange.end),
              ),
            )
            .trim(),
        );
        if (sourceKey !== "material") continue;
        materialRange = range;
        break;
      }
      if (!materialRange && item.source.kind !== "factory") {
        for (const [key, range] of item.source.fieldValueRanges) {
          if (!key.startsWith("arguments.")) continue;
          const text = document.getText(
            new vscode.Range(
              document.positionAt(range.start),
              document.positionAt(range.end),
            ),
          );
          if (text.includes("\n") || text.includes("\r")) continue;
          const value = parseLooseScalar(text.trim());
          if (
            typeof value !== "string" ||
            makeIdentifier(value, "minecraft") !== item.material
          )
            continue;
          materialRange = range;
          break;
        }
      }
      if (!materialRange) return [];
      const materialRangeKey = `${materialRange.start}:${materialRange.end}`;
      if (materialRanges.has(materialRangeKey)) return [];
      materialRanges.add(materialRangeKey);
      return [
        {
          id: item.id,
          material: item.material,
          materialRange,
          materialArgument: {
            uri: item.source.uri,
            start: materialRange.start,
            end: materialRange.end,
          },
        },
      ];
    });
    const layout = editorIconAttachmentStyle(editorLineHeight(editor));
    if (
      revision !== this.revision ||
      !vscode.window.visibleTextEditors.includes(editor)
    )
      return;

    this.clearEditor(editor);
    const decorations = new Map<
      vscode.TextEditorDecorationType,
      vscode.DecorationOptions[]
    >();
    const clicks = new Map<number, ItemIconTarget>();
    for (const target of targets) {
      clicks.set(target.materialRange.start, target);
    }
    this.clickTargets.set(document.uri.toString(), clicks);
    this.entries.set(document.uri.toString(), targets);

    // 首次生成图标时会逐个显示, 每次更新都要检查编号, 防止旧结果覆盖新装饰
    await Promise.all(
      targets.map(async (target) => {
        const icon = await this.icons.editorIconCssUrl(
          target.material,
          layout.imageSize,
        );
        if (
          revision !== this.revision ||
          !vscode.window.visibleTextEditors.includes(editor)
        )
          return;
        const type = this.decorationType(icon, layout);
        const values = decorations.get(type) ?? [];
        const position = document.positionAt(target.materialRange.start);
        const hoverMessage = new vscode.MarkdownString(undefined, true);
        hoverMessage.appendMarkdown(
          Messages.src.providers.itemIcons.text0001(target.id, target.material),
        );
        hoverMessage.appendMarkdown(
          Messages.src.providers.itemIcons.text0002(
            encodeURIComponent(JSON.stringify([target.materialArgument])),
          ),
        );
        hoverMessage.isTrusted = {
          enabledCommands: ["craftengineYaml.selectMaterial"],
        };
        values.push({
          range: new vscode.Range(position, position),
          hoverMessage,
        });
        decorations.set(type, values);
        editor.setDecorations(type, values);
      }),
    );
  }

  private decorationType(
    icon: string,
    layout: ReturnType<typeof editorIconAttachmentStyle>,
  ): vscode.TextEditorDecorationType {
    const key = `${layout.slotSize}:${layout.imageSize}:${icon}`;
    const cached = this.decorationTypes.get(key);
    if (cached) return cached;
    const attachment = editorIconAttachmentStyle(layout.slotSize, icon);
    const type = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      before: {
        contentText: "",
        width: attachment.width,
        height: attachment.height,
        margin: attachment.margin,
        textDecoration: attachment.textDecoration,
      },
    });
    this.decorationTypes.set(key, type);
    return type;
  }

  private handleSelection(event: vscode.TextEditorSelectionChangeEvent): void {
    if (
      event.kind !== vscode.TextEditorSelectionChangeKind.Mouse ||
      event.selections.length !== 1
    )
      return;
    const selection = event.selections[0];
    if (!selection?.isEmpty) return;
    const target = this.clickTargets
      .get(event.textEditor.document.uri.toString())
      ?.get(event.textEditor.document.offsetAt(selection.active));
    if (!target) return;
    const key = `${target.materialArgument.uri}:${target.materialRange.start}`;
    const now = Date.now();
    if (this.lastClick.key === key && now - this.lastClick.at < 500) return;
    this.lastClick = { key, at: now };
    void vscode.commands.executeCommand(
      "craftengineYaml.selectMaterial",
      target.materialArgument,
    );
  }

  private clearEditor(editor: vscode.TextEditor): void {
    for (const type of this.decorationTypes.values())
      editor.setDecorations(type, []);
    const uri = editor.document.uri.toString();
    this.clickTargets.delete(uri);
    this.entries.delete(uri);
  }

  public dispose(): void {
    this.revision += 1;
    for (const disposable of this.disposables) disposable.dispose();
    for (const type of this.decorationTypes.values()) type.dispose();
    this.decorationTypes.clear();
    this.clickTargets.clear();
    this.entries.clear();
  }
}
