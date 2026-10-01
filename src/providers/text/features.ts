import * as vscode from "vscode";

import {
  miniMessageCompletionContext,
  type MiniMessageReference,
} from "../../text/minimessage/parser.js";
import { MINI_MESSAGE_COMPLETIONS } from "../../text/minimessage/completions.js";
import { scanMiniMessageDocument } from "../../config/text/miniMessageScanner.js";
import type {
  LanguageEntry,
  LanguageDomain,
  RootLanguageCatalog,
} from "../../config/text/languageCatalog.js";
import type { GlobalVariableDefinition } from "../../config/text/globalVariables.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import type { ImageDefinition } from "../../config/image/model.js";
import type { GenericResourceDefinition } from "../../config/resource/model.js";
import { deduplicateCoreIssues } from "../../util/issues.js";
import { isRecord } from "../../util/records.js";
import { rangeAt } from "../../util/vscode/range.js";
import type {
  TextWorkspaceIndex,
  WorkspaceTextCatalog,
  WorkspaceTextSnapshot,
} from "./workspaceCatalog.js";

import { Messages } from "../../messages.js";

interface TextReferenceArgument {
  readonly uri: string;
  readonly offset: number;
}

interface ReferenceTarget {
  readonly uri: string;
  readonly range: TextRange;
  readonly label: string;
  readonly description: string;
}

function shortText(value: string, maximum = 64): string {
  const plain = value
    .replace(/<[^<>]*>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return plain.length <= maximum ? plain : `${plain.slice(0, maximum - 1)}…`;
}

function languagePreviewValues(
  catalog: RootLanguageCatalog,
  key: string,
  domain: LanguageDomain,
): readonly (readonly [locale: string, value: string])[] {
  return [
    ...new Set(
      catalog.definitions(key, { domain }).map((entry) => entry.locale),
    ),
  ]
    .sort()
    .flatMap((locale) => {
      const value =
        domain === "client"
          ? catalog.resolveClient(key, locale)
          : catalog.resolveServer(key, locale);
      return value === undefined ? [] : [[locale, value] as const];
    });
}

function languageTargets(
  entries: readonly LanguageEntry[],
): readonly ReferenceTarget[] {
  return entries.flatMap((entry) =>
    entry.source.kind !== "vanilla"
      ? [
          {
            uri: entry.source.uri,
            range: entry.source.range,
            label: `${entry.locale} · ${entry.key}`,
            description: shortText(entry.value),
          },
        ]
      : [],
  );
}

function isImageDefinition(value: unknown): value is ImageDefinition {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isRecord(value.source) &&
    isRecord(value.spec)
  );
}

function isAttributeDefinition(
  value: unknown,
): value is GenericResourceDefinition {
  return (
    isRecord(value) &&
    value.kind === "attribute" &&
    typeof value.id === "string" &&
    isRecord(value.source)
  );
}

function miniMessageOccurrences(snapshot: WorkspaceTextSnapshot) {
  return scanMiniMessageDocument(
    snapshot.parsed,
    snapshot.defaultNamespace === undefined
      ? {}
      : { defaultNamespace: snapshot.defaultNamespace },
  );
}

export class CraftEngineTextFeatures
  implements
    vscode.CompletionItemProvider,
    vscode.DefinitionProvider,
    vscode.DocumentLinkProvider,
    vscode.Disposable
{
  private readonly linksEmitter = new vscode.EventEmitter<void>();
  private readonly diagnostics = vscode.languages.createDiagnosticCollection(
    "craftengine-yaml-text",
  );
  private readonly disposables: vscode.Disposable[];
  private readonly revisions = new Map<string, number>();

  public readonly onDidChangeDocumentLinks = this.linksEmitter.event;

  public constructor(
    private readonly index: TextWorkspaceIndex,
    private readonly catalogs: WorkspaceTextCatalog,
  ) {
    const refresh = (document?: vscode.TextDocument): void => {
      if (document?.languageId === "yaml")
        void this.refreshDiagnostics(document);
      this.linksEmitter.fire();
    };
    this.disposables = [
      this.diagnostics,
      this.linksEmitter,
      vscode.workspace.onDidOpenTextDocument((document) => refresh(document)),
      vscode.workspace.onDidChangeTextDocument((event) =>
        refresh(event.document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) =>
        this.diagnostics.delete(document.uri),
      ),
      this.index.onDidChange(() => {
        for (const document of vscode.workspace.textDocuments)
          if (document.languageId === "yaml")
            void this.refreshDiagnostics(document);
        refresh();
      }),
    ];
    for (const document of vscode.workspace.textDocuments)
      if (document.languageId === "yaml")
        void this.refreshDiagnostics(document);
  }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const offset = document.offsetAt(position);
    const snapshot = await this.catalogs.forDocument(document);
    if (
      !miniMessageOccurrences(snapshot).some(
        (entry) => offset >= entry.range.start && offset <= entry.range.end,
      )
    )
      return [];
    const context = miniMessageCompletionContext(document.getText(), offset);
    if (!context) return [];
    const replace = rangeAt(document, context.range);
    if (context.kind === "tag") {
      const prefix = context.prefix.toLowerCase();
      return MINI_MESSAGE_COMPLETIONS
        .filter((definition) => definition.tag.startsWith(prefix))
        .map((definition) => {
          const item = new vscode.CompletionItem(
            { label: definition.tag, description: definition.detail },
            vscode.CompletionItemKind.Function,
          );
          item.detail = definition.detail;
          item.documentation = new vscode.MarkdownString(
            Messages.src.providers.text.features.text0002(definition.detail),
          );
          item.range = replace;
          item.insertText = new vscode.SnippetString(definition.snippet);
          item.filterText = `${definition.tag} ${definition.detail}`;
          return item;
        });
    }
    if (
      context.argumentKind === "language-key" ||
      context.argumentKind === "server-language-key"
    ) {
      const domain: LanguageDomain =
        context.argumentKind === "language-key" ? "client" : "server";
      return snapshot.languages
        .complete(context.prefix, domain)
        .map((entry) => {
          const previews = languagePreviewValues(
            snapshot.languages,
            entry.key,
            domain,
          )
            .map(([locale, value]) => `${locale}：${shortText(value)}`)
            .join(" ｜ ");
          const item = new vscode.CompletionItem(
            entry.key,
            vscode.CompletionItemKind.Reference,
          );
          item.detail =
            previews || Messages.src.providers.text.features.text0003;
          item.documentation = new vscode.MarkdownString(
            previews || Messages.src.providers.text.features.text0004,
          );
          item.range = replace;
          item.insertText = entry.key;
          item.filterText = `${entry.key} ${previews}`;
          return item;
        });
    }
    if (context.argumentKind === "global-id") {
      return snapshot.globals.definitions
        .filter(
          (entry, index, values) =>
            entry.valueId.includes(context.prefix) &&
            values.findIndex(
              (candidate) => candidate.valueId === entry.valueId,
            ) === index,
        )
        .map((entry) => {
          const item = new vscode.CompletionItem(
            entry.valueId,
            vscode.CompletionItemKind.Variable,
          );
          item.detail = Messages.src.providers.text.features.text0005(
            shortText(entry.value),
          );
          item.documentation = new vscode.MarkdownString(
            Messages.src.providers.text.features.text0006(
              entry.value.replaceAll("`", "\\`"),
            ),
          );
          item.range = replace;
          item.insertText = entry.valueId;
          item.filterText = `${entry.valueId} ${entry.value}`;
          return item;
        });
    }
    if (context.argumentKind === "image-id") {
      const seen = new Set<string>();
      return (
        this.index.forDocument(document)?.complete("image") ?? []
      ).flatMap((entry) => {
        if (!isImageDefinition(entry.definition)) return [];
        const image = entry.definition;
        if (seen.has(image.id) || !image.id.includes(context.prefix)) return [];
        seen.add(image.id);
        const item = new vscode.CompletionItem(
          image.id,
          vscode.CompletionItemKind.Reference,
        );
        item.detail = Messages.src.providers.text.features.text0007(
          image.source.pack.name,
        );
        item.range = replace;
        item.insertText = image.id;
        return [item];
      });
    }
    if (context.argumentKind === "custom-attribute-id") {
      return (
        this.index.forDocument(document)?.complete("attribute") ?? []
      ).flatMap((entry) => {
        if (
          !isAttributeDefinition(entry.definition) ||
          !entry.id.includes(context.prefix)
        )
          return [];
          const item = new vscode.CompletionItem(
            entry.id,
            vscode.CompletionItemKind.Reference,
          );
          item.detail = `${entry.definition.source.pack.name} — 自定义属性`;
          item.range = replace;
          item.insertText = entry.id;
          return [item];
        });
    }
    return [];
  }

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition> {
    const snapshot = await this.catalogs.forDocument(document);
    const reference = this.referenceAt(document, position, snapshot);
    if (!reference) return [];
    const catalog = this.index.forDocument(document);
    return Promise.all(
      this.targets(catalog, snapshot, reference).map(async (target) => {
        const uri = vscode.Uri.parse(target.uri);
        return new vscode.Location(
          uri,
          rangeAt(
            vscode.workspace.textDocuments.find(
              (entry) => entry.uri.toString() === target.uri,
            ) ?? (await vscode.workspace.openTextDocument(uri)),
            target.range,
          ),
        );
      }),
    );
  }

  public async provideDocumentLinks(
    document: vscode.TextDocument,
  ): Promise<vscode.DocumentLink[]> {
    const snapshot = await this.catalogs.forDocument(document);
    const catalog = this.index.forDocument(document);
    const links: vscode.DocumentLink[] = [];
    for (const occurrence of miniMessageOccurrences(snapshot)) {
      for (const reference of occurrence.scan.references) {
        if (this.targets(catalog, snapshot, reference).length === 0) continue;
        const link = new vscode.DocumentLink(
          rangeAt(document, reference.tagRange),
          vscode.Uri.parse(
            `command:craftengineYaml.openTextReference?${encodeURIComponent(
              JSON.stringify([
                {
                  uri: document.uri.toString(),
                  offset: reference.range.start,
                } satisfies TextReferenceArgument,
              ]),
            )}`,
          ),
        );
        link.tooltip = Messages.src.providers.text.features.text0008;
        links.push(link);
      }
    }
    return links;
  }

  public async openReference(
    argument: TextReferenceArgument | undefined,
  ): Promise<void> {
    if (!argument) return;
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(argument.uri),
    );
    const snapshot = await this.catalogs.forDocument(document);
    const reference = this.referenceAt(
      document,
      document.positionAt(argument.offset),
      snapshot,
    );
    if (!reference) return;
    const targets = this.targets(
      this.index.forDocument(document),
      snapshot,
      reference,
    );
    let target: ReferenceTarget | undefined = targets[0];
    if (targets.length > 1) {
      const selected = await vscode.window.showQuickPick(
        targets.map((entry) => ({
          label: entry.label,
          description: entry.description,
          target: entry,
        })),
        {
          title: Messages.src.providers.text.features.text0009,
          matchOnDescription: true,
        },
      );
      target = selected?.target;
    }
    if (!target) return;
    const targetDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(target.uri),
    );
    const editor = await vscode.window.showTextDocument(targetDocument);
    const targetRange = rangeAt(targetDocument, target.range);
    editor.selection = new vscode.Selection(targetRange.start, targetRange.end);
    editor.revealRange(
      targetRange,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }

  public dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.revisions.clear();
  }

  private async refreshDiagnostics(
    document: vscode.TextDocument,
  ): Promise<void> {
    if (document.languageId !== "yaml" || document.uri.scheme !== "file")
      return;
    const key = document.uri.toString();
    const revision = (this.revisions.get(key) ?? 0) + 1;
    this.revisions.set(key, revision);
    const snapshot = await this.catalogs.forDocument(document);
    const diagnostics: vscode.Diagnostic[] = [];
    const occurrences = miniMessageOccurrences(snapshot);
    const catalog = this.index.forDocument(document);
    for (const issue of deduplicateCoreIssues([
      ...this.index.index.issues.filter(
        (issue) => issue.uri === key && issue.code === "template-argument",
      ),
      ...occurrences.flatMap((occurrence) =>
        occurrence.scan.issues.map(
          (issue): CoreIssue => ({
            ...issue,
            uri: key,
          }),
        ),
      ),
    ]).filter((issue) => issue.code !== "template-argument")) {
      const diagnostic = new vscode.Diagnostic(
        rangeAt(document, issue.range),
        issue.message,
        vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = Messages.common.diagnosticSource;
      diagnostic.code = issue.code;
      diagnostics.push(diagnostic);
    }
    for (const occurrence of occurrences) {
      for (const reference of occurrence.scan.references) {
        if (this.referenceExists(catalog, snapshot, reference)) continue;
        let label: string;
        switch (reference.kind) {
          case "global":
            label = Messages.src.providers.text.features.text0010;
            break;
          case "image":
            label = Messages.src.providers.text.features.text0011;
            break;
          case "language":
            label = Messages.src.providers.text.features.text0012;
            break;
          case "server-language":
            label = Messages.src.providers.text.features.text0013;
            break;
          case "attribute":
            label = "自定义属性";
            break;
        }
        const diagnostic = new vscode.Diagnostic(
          rangeAt(document, reference.range),
          Messages.src.providers.text.features.text0014(label, reference.id),
          vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = Messages.common.diagnosticSource;
        diagnostic.code = `unknown-minimessage-${reference.kind}`;
        diagnostics.push(diagnostic);
      }
    }
    if (this.revisions.get(key) === revision)
      this.diagnostics.set(document.uri, diagnostics);
  }

  private referenceAt(
    document: vscode.TextDocument,
    position: vscode.Position,
    snapshot: WorkspaceTextSnapshot,
  ): MiniMessageReference | undefined {
    const offset = document.offsetAt(position);
    return miniMessageOccurrences(snapshot)
      .flatMap((entry) => entry.scan.references)
      .find(
        (reference) =>
          offset >= reference.tagRange.start &&
          offset <= reference.tagRange.end,
      );
  }

  private referenceExists(
    catalog: ReturnType<TextWorkspaceIndex["forDocument"]>,
    snapshot: WorkspaceTextSnapshot,
    reference: MiniMessageReference,
  ): boolean {
    if (reference.dynamic) return true;
    switch (reference.kind) {
      case "language":
        return (
          snapshot.languages.definitions(reference.id, { domain: "client" })
            .length > 0
        );
      case "server-language":
        return (
          snapshot.languages.definitions(reference.id, { domain: "server" })
            .length > 0
        );
      case "global":
        return snapshot.globals.resolve(reference.id).candidates.length > 0;
      case "image":
        return (catalog?.resolveImage(reference.id).candidates.length ?? 0) > 0;
      case "attribute":
        return (
          catalog?.resolveGeneric("attribute", reference.id).candidates.length ??
          0
        ) > 0;
    }
  }

  private targets(
    catalog: ReturnType<TextWorkspaceIndex["forDocument"]>,
    snapshot: WorkspaceTextSnapshot,
    reference: MiniMessageReference,
  ): readonly ReferenceTarget[] {
    if (reference.dynamic) return [];
    switch (reference.kind) {
      case "language":
        return languageTargets(
          snapshot.languages.definitions(reference.id, { domain: "client" }),
        );
      case "server-language":
        return languageTargets(
          snapshot.languages.definitions(reference.id, { domain: "server" }),
        );
      case "global":
        return snapshot.globals
          .resolve(reference.id)
          .candidates.map((entry: GlobalVariableDefinition) => ({
            uri: entry.source.uri,
            range: entry.source.idRange,
            label: entry.id,
            description: shortText(entry.value),
          }));
      case "image":
        return (catalog?.resolveImage(reference.id).candidates ?? []).map(
          (entry: ImageDefinition) => ({
            uri: entry.source.uri,
            range: entry.source.idRange,
            label: entry.id,
            description: Messages.src.providers.text.features.text0001(
              entry.source.pack.name,
              entry.source.kind === "direct"
                ? Messages.src.providers.text.features.text0015
                : entry.source.kind === "template"
                  ? Messages.src.providers.text.features.text0016
                  : Messages.src.providers.text.features.text0017,
            ),
          }),
        );
      case "attribute":
        return (
          catalog?.resolveGeneric("attribute", reference.id).candidates ?? []
        ).flatMap((entry) =>
          isAttributeDefinition(entry)
            ? [
                {
                  uri: entry.source.uri,
                  range: entry.source.idRange,
                  label: entry.id,
                  description: `${entry.source.pack.name} — 自定义属性`,
                },
              ]
            : [],
        );
    }
  }
}
