import * as vscode from "vscode";

import {
  blueprintLookup,
  scriptLookup,
} from "../references/blueprintScript.js";
import { rangeAt } from "../util/vscode/range.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";

export interface PackFileTarget {
  readonly range: vscode.Range;
  readonly target: vscode.Uri;
  readonly tooltip: string;
}

  // 引用本身由索引层按文档分好, 这里只把 range 映射成 vscode 类型
export function blueprintFileTargets(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): readonly PackFileTarget[] {
  const targets: PackFileTarget[] = [];
  const seen = new Set<string>();
  for (const reference of index.blueprintReferencesInDocument(document)) {
    const lookup = blueprintLookup(index.index.blueprints, reference);
    if (lookup === undefined || !lookup.exists) continue;
    const key = `${reference.range.start}:${reference.range.end}:${lookup.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: vscode.Uri.file(lookup.file),
      tooltip: `blueprint 文件 ${lookup.file}`,
    });
  }
  return targets;
}

export function scriptFileTargets(
  index: CraftEngineWorkspaceIndex,
  document: vscode.TextDocument,
): readonly PackFileTarget[] {
  const targets: PackFileTarget[] = [];
  const seen = new Set<string>();
  const catalog = index.index.scripts;
  for (const reference of index.scriptReferencesInDocument(document)) {
    const script = scriptLookup(catalog, reference.value);
    if (!script) continue;
    const key = `${reference.range.start}:${reference.range.end}:${script.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      range: rangeAt(document, reference.range),
      target: vscode.Uri.file(script.path),
      tooltip: `js 脚本 ${script.id}`,
    });
  }
  return targets;
}
