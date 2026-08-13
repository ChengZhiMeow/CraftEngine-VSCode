import * as vscode from "vscode";

import { scanMiniMessageDocument } from "../../config/text/miniMessageScanner.js";
import { rangeAt } from "../../util/vscode/range.js";
import {
  annotationText,
  collectTextDisplayReferences,
  DEFAULT_TEXT_DISPLAY_CONFIG,
  localeFlagRegion,
  resolveTextDisplay,
  textDisplayLocaleRows,
  truncateAnnotation,
  type TextDisplayConfig,
  type TextDisplayReference,
  type TextDisplayResolution,
} from "../../text/display/resolver.js";
import type {
  TextWorkspaceIndex,
  WorkspaceTextCatalog,
  WorkspaceTextSnapshot,
} from "./workspaceCatalog.js";

import { Messages } from "../../messages.js";
const OPEN_DECLARATION_COMMAND = "craftengineYaml.openTextDeclaration";

interface ThemeConfig {
  readonly annotation: string;
  readonly annotationMissing: string;
  readonly annotationBorder: string;
  readonly annotationMissingBorder: string;
}

interface DisplayConfiguration extends TextDisplayConfig {
  readonly showAnnotations: boolean;
  readonly theme: ThemeConfig;
}

interface CachedReference {
  readonly reference: TextDisplayReference;
  readonly resolution: TextDisplayResolution;
  readonly hover: vscode.MarkdownString;
}

interface DocumentDisplayState {
  readonly version: number;
  readonly configuration: DisplayConfiguration;
  readonly references: readonly CachedReference[];
}

export interface OpenTextDeclarationArgument {
  readonly uri: string;
  readonly start: number;
  readonly end: number;
}

interface ThrottledOperation extends vscode.Disposable {
  (): void;
}

function leadingTrailingThrottle(
  callback: () => void,
  delay: number,
): ThrottledOperation {
  let lastRun = 0;
  let timer: NodeJS.Timeout | undefined;
  const invoke = (): void => {
    timer = undefined;
    lastRun = Date.now();
    callback();
  };
  const throttled = (): void => {
    const remaining = delay - (Date.now() - lastRun);
    if (lastRun === 0 || remaining <= 0) {
      if (timer) clearTimeout(timer);
      invoke();
    } else if (!timer) {
      timer = setTimeout(invoke, remaining);
    }
  };
  return Object.assign(throttled, {
    dispose: (): void => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  });
}

function readConfiguration(
  document: vscode.TextDocument,
): DisplayConfiguration {
  const configuration = vscode.workspace.getConfiguration(
    "craftengineYaml",
    document.uri,
  );
  return {
    showAnnotations: configuration.get<boolean>(
      "text.showTranslationAnnotations",
      true,
    ),
    displayLanguage: configuration.get<string>(
      "text.displayLanguage",
      DEFAULT_TEXT_DISPLAY_CONFIG.displayLanguage,
    ),
    sourceLanguage: configuration.get<string>(
      "text.sourceLanguage",
      DEFAULT_TEXT_DISPLAY_CONFIG.sourceLanguage,
    ),
    ignoredLocales: configuration.get<readonly string[]>(
      "text.ignoredLocales",
      DEFAULT_TEXT_DISPLAY_CONFIG.ignoredLocales,
    ),
    annotationInPlace: configuration.get<boolean>(
      "text.annotationInPlace",
      DEFAULT_TEXT_DISPLAY_CONFIG.annotationInPlace,
    ),
    annotationMaxLength: configuration.get<number>(
      "text.annotationMaxLength",
      DEFAULT_TEXT_DISPLAY_CONFIG.annotationMaxLength,
    ),
    annotationDelimiter: configuration.get<string>(
      "text.annotationDelimiter",
      DEFAULT_TEXT_DISPLAY_CONFIG.annotationDelimiter,
    ),
    theme: {
      annotation: configuration.get<string>(
        "text.theme.annotation",
        "rgba(153, 153, 153, .8)",
      ),
      annotationMissing: configuration.get<string>(
        "text.theme.annotationMissing",
        "rgba(153, 153, 153, .3)",
      ),
      annotationBorder: configuration.get<string>(
        "text.theme.annotationBorder",
        "rgba(153, 153, 153, .2)",
      ),
      annotationMissingBorder: configuration.get<string>(
        "text.theme.annotationMissingBorder",
        "rgba(153, 153, 153, .2)",
      ),
    },
  };
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/[\s]+/gu, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\|*`[\]~])/gu, "\\$1");
}

function createHover(
  reference: TextDisplayReference,
  snapshot: WorkspaceTextSnapshot,
  configuration: DisplayConfiguration,
  extensionUri: vscode.Uri,
): vscode.MarkdownString {
  const rows = textDisplayLocaleRows(reference, snapshot, configuration);
  const table = [
    "| | | | | |",
    "|---|:---|---|---|---:|",
    ...rows.map((row) => {
      const region = localeFlagRegion(row.locale);
      const value = escapeMarkdown(
        row.value === undefined
          ? "-"
          : truncateAnnotation(row.value, configuration.annotationMaxLength),
      );
      const command = row.declaration
        ? Messages.src.providers.text.display.text0001(
            `command:${OPEN_DECLARATION_COMMAND}?${encodeURIComponent(
              JSON.stringify([
                {
                  uri: row.declaration.uri,
                  start: row.declaration.range.start,
                  end: row.declaration.range.end,
                } satisfies OpenTextDeclarationArgument,
              ]),
            )}`,
          )
        : "";
      return `| | ![${region?.toUpperCase() ?? Messages.src.providers.text.display.text0002}](resources/flags/${region && ["cn", "fr", "hk", "kr", "tw", "us"].includes(region) ? `${region}.svg` : "globe.svg"}) **${escapeMarkdown(row.locale)}** | | ${value} | ${command} |`;
    }),
    "| | | | | |",
  ].join("\n");
  const markdown = new vscode.MarkdownString(table, true);
  markdown.baseUri = extensionUri.with({
    path: `${extensionUri.path.replace(/\/$/u, "")}/`,
  });
  markdown.supportHtml = true;
  markdown.isTrusted = { enabledCommands: [OPEN_DECLARATION_COMMAND] };
  return markdown;
}

function selectedLines(editor: vscode.TextEditor): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const selection of editor.selections) {
    for (let line = selection.start.line; line <= selection.end.line; line += 1)
      lines.add(line);
  }
  return lines;
}

export class CraftEngineTextDisplay
  implements vscode.HoverProvider, vscode.Disposable
{
  private readonly gutterNone = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly gutterMissing: vscode.TextEditorDecorationType;
  private readonly underline = vscode.window.createTextEditorDecorationType({
    textDecoration: "underline",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly disappear = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; display: none;",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });
  private readonly states = new Map<string, DocumentDisplayState>();
  private readonly disposables: vscode.Disposable[];
  private readonly throttledUpdate: ThrottledOperation;
  private revision = 0;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly index: TextWorkspaceIndex,
    private readonly catalogs: WorkspaceTextCatalog,
  ) {
    this.gutterMissing = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.joinPath(
        extensionUri,
        "resources",
        "empty.svg",
      ),
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    this.throttledUpdate = leadingTrailingThrottle(
      () => void this.updateVisibleEditors(),
      800,
    );
    const invalidate = (): void => {
      this.revision += 1;
      this.throttledUpdate();
    };
    this.disposables = [
      this.gutterNone,
      this.gutterMissing,
      this.underline,
      this.disappear,
      this.throttledUpdate,
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === "yaml") invalidate();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === "yaml") invalidate();
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.states.delete(document.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("craftengineYaml.text")) invalidate();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => invalidate()),
      vscode.window.onDidChangeVisibleTextEditors(() => invalidate()),
      vscode.window.onDidChangeTextEditorSelection((event) =>
        this.refreshEditor(event.textEditor),
      ),
      this.index.onDidChange(invalidate),
    ];
    void this.updateVisibleEditors();
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    if (document.languageId !== "yaml" || document.uri.scheme !== "file")
      return undefined;
    let state = this.states.get(document.uri.toString());
    if (!state || state.version !== document.version) {
      state = await this.scanDocument(document);
      if (!state) return undefined;
    }
    const offset = document.offsetAt(position);
    const selected = state.references.find(
      ({ reference }) =>
        offset >= reference.tagRange.start && offset <= reference.tagRange.end,
    );
    return selected
      ? new vscode.Hover(
          selected.hover,
          rangeAt(document, selected.reference.tagRange),
        )
      : undefined;
  }

  public async openDeclaration(
    argument: OpenTextDeclarationArgument | undefined,
  ): Promise<void> {
    if (!argument) return;
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(argument.uri),
    );
    const target = rangeAt(document, {
      start: argument.start,
      end: argument.end,
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(target.start, target.end);
    editor.revealRange(
      target,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }

  public dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.states.clear();
  }

  private async updateVisibleEditors(): Promise<void> {
    const revision = this.revision;
    const documents = [
      ...new Map(
        vscode.window.visibleTextEditors
          .filter(
            (editor) =>
              editor.document.languageId === "yaml" &&
              editor.document.uri.scheme === "file",
          )
          .map((editor) => [editor.document.uri.toString(), editor.document]),
      ).values(),
    ];
    await Promise.all(
      documents.map(async (document) => {
        const state = await this.scanDocument(document);
        if (
          !state ||
          revision !== this.revision ||
          state.version !== document.version
        )
          return;
        this.states.set(document.uri.toString(), state);
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document.uri.toString() === document.uri.toString())
            this.refreshEditor(editor);
        }
      }),
    );
    for (const editor of vscode.window.visibleTextEditors) {
      if (
        editor.document.languageId !== "yaml" ||
        editor.document.uri.scheme !== "file"
      )
        this.clearEditor(editor);
    }
  }

  private async scanDocument(
    document: vscode.TextDocument,
  ): Promise<DocumentDisplayState | undefined> {
    const version = document.version;
    try {
      const snapshot = await this.catalogs.forDocument(document);
      if (version !== document.version) return undefined;
      const configuration = readConfiguration(document);
      return {
        version,
        configuration,
        references: collectTextDisplayReferences(
          scanMiniMessageDocument(
            snapshot.parsed,
            snapshot.defaultNamespace === undefined
              ? {}
              : { defaultNamespace: snapshot.defaultNamespace },
          ),
        ).map((reference) => ({
          reference,
          resolution: resolveTextDisplay(reference, snapshot, configuration),
          hover: createHover(
            reference,
            snapshot,
            configuration,
            this.extensionUri,
          ),
        })),
      };
    } catch {
      return undefined;
    }
  }

  private refreshEditor(editor: vscode.TextEditor): void {
    const state = this.states.get(editor.document.uri.toString());
    if (
      !state ||
      state.version !== editor.document.version ||
      !state.configuration.showAnnotations
    ) {
      this.clearEditor(editor);
      return;
    }
    const normal: vscode.DecorationOptions[] = [];
    const missing: vscode.DecorationOptions[] = [];
    const underlines: vscode.DecorationOptions[] = [];
    const inPlaceRanges: vscode.DecorationOptions[] = [];
    const selections = selectedLines(editor);
    for (const entry of state.references) {
      const range = rangeAt(editor.document, entry.reference.tagRange);
      const editing = [...selections].some(
        (line) => line >= range.start.line && line <= range.end.line,
      );
      const inPlace =
        state.configuration.annotationInPlace &&
        entry.resolution.value !== undefined &&
        !editing;
      if (inPlace) inPlaceRanges.push({ range });
      else underlines.push({ range });
      if (entry.resolution.value === undefined && !editing) continue;
      const decoration: vscode.DecorationOptions = {
        range,
        renderOptions: {
          before: {
            color: entry.resolution.missing
              ? state.configuration.theme.annotationMissing
              : state.configuration.theme.annotation,
            contentText:
              inPlace && !editing && entry.resolution.value !== undefined
                ? annotationText(
                    entry.resolution.value,
                    true,
                    state.configuration,
                  )
                : "",
            fontStyle: "normal",
            border: inPlace
              ? `0.5px solid ${
                  entry.resolution.missing
                    ? state.configuration.theme.annotationMissingBorder
                    : state.configuration.theme.annotationBorder
                }; border-radius: 2px;`
              : "",
            textDecoration: "none",
          },
          after: {
            color: entry.resolution.missing
              ? state.configuration.theme.annotationMissing
              : state.configuration.theme.annotation,
            contentText:
              !inPlace && !editing && entry.resolution.value !== undefined
                ? annotationText(
                    entry.resolution.value,
                    false,
                    state.configuration,
                  )
                : "",
            fontStyle: "normal",
            border: "",
            textDecoration: "none",
          },
        },
      };
      (entry.resolution.missing ? missing : normal).push(decoration);
    }
    editor.setDecorations(this.gutterNone, normal);
    editor.setDecorations(this.gutterMissing, missing);
    editor.setDecorations(this.underline, underlines);
    editor.setDecorations(this.disappear, inPlaceRanges);
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.gutterNone, []);
    editor.setDecorations(this.gutterMissing, []);
    editor.setDecorations(this.underline, []);
    editor.setDecorations(this.disappear, []);
  }
}
