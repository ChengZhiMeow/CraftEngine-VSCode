import * as vscode from "vscode";

import { Messages } from "../messages.js";

import type { CoreIssue } from "../diagnostics/model.js";
import { rangeAt } from "../util/vscode/range.js";
import type { WorkspaceIndex } from "./model.js";

function diagnosticSeverity(
  severity: CoreIssue["severity"],
): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "information":
      return vscode.DiagnosticSeverity.Information;
  }
}

async function documentForUri(
  uri: vscode.Uri,
): Promise<vscode.TextDocument | undefined> {
  const open = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === uri.toString(),
  );
  if (open) return open;
  try {
    return await vscode.workspace.openTextDocument(uri);
  } catch {
    return undefined;
  }
}

export async function publishWorkspaceDiagnostics(
  collection: vscode.DiagnosticCollection,
  index: WorkspaceIndex,
): Promise<void> {
  collection.clear();
  const grouped = new Map<string, CoreIssue[]>();
  for (const issue of index.issues) {
    const values = grouped.get(issue.uri) ?? [];
    values.push(issue);
    grouped.set(issue.uri, values);
  }
  for (const [uriText, issues] of grouped) {
    const uri = vscode.Uri.parse(uriText);
    const document = await documentForUri(uri);
    if (!document) continue;
    const relatedDocuments = new Map<string, vscode.TextDocument>();
    for (const related of issues.flatMap((issue) => issue.related ?? [])) {
      if (relatedDocuments.has(related.uri)) continue;
      const target = await documentForUri(vscode.Uri.parse(related.uri));
      if (target) relatedDocuments.set(related.uri, target);
    }
    collection.set(
      uri,
      issues.map((core) => {
        const diagnostic = new vscode.Diagnostic(
          rangeAt(document, core.range),
          core.message,
          diagnosticSeverity(core.severity),
        );
        diagnostic.source = Messages.common.diagnosticSource;
        diagnostic.code = core.code;
        if (core.related) {
          diagnostic.relatedInformation = core.related.map((related) => {
            const targetUri = vscode.Uri.parse(related.uri);
            const targetDocument = relatedDocuments.get(related.uri);
            return new vscode.DiagnosticRelatedInformation(
              new vscode.Location(
                targetUri,
                targetDocument
                  ? rangeAt(targetDocument, related.range)
                  : new vscode.Range(0, 0, 0, 0),
              ),
              related.message,
            );
          });
        }
        return diagnostic;
      }),
    );
  }
}
