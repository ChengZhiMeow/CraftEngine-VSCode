import * as vscode from "vscode";

import type { TextRange } from "../../diagnostics/model.js";

export function rangeAt(
  document: vscode.TextDocument,
  range: TextRange,
): vscode.Range {
  const length = document.getText().length;
  const start = Math.max(0, Math.min(range.start, length));
  const end = Math.max(start, Math.min(range.end, length));
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}
