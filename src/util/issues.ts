import type { CoreIssue } from "../diagnostics/model.js";

export function deduplicateCoreIssues(
  issues: readonly CoreIssue[],
): readonly CoreIssue[] {
  const templateArgumentLocations = new Set(
    issues
      .filter((issue) => issue.code === "template-argument")
      .map((issue) =>
        JSON.stringify([issue.uri, issue.range.start, issue.range.end]),
      ),
  );
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (
      issue.code === "unresolved-template-variable" &&
      templateArgumentLocations.has(
        JSON.stringify([issue.uri, issue.range.start, issue.range.end]),
      )
    )
      return false;
    const key = JSON.stringify([
      issue.uri,
      issue.range.start,
      issue.range.end,
      issue.code,
      issue.message,
      issue.severity,
      (issue.related ?? []).map((related) => [
        related.uri,
        related.range.start,
        related.range.end,
        related.message,
      ]),
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
