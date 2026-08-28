export function hasPreviewSource(
  sources: Iterable<string | undefined>,
  documentUri: string,
): boolean {
  for (const source of sources) {
    if (source === documentUri) return true;
  }
  return false;
}
