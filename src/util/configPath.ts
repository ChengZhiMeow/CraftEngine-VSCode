import { isRecord } from "./records.js";

export function normalizeConfigPathSegment(segment: string): string {
  return segment.replaceAll("-", "_");
}

export function normalizeConfigPath(
  path: readonly string[],
  rootSegments = 0,
): readonly string[] {
  return path.slice(rootSegments).map(normalizeConfigPathSegment);
}

export function compactConfigPath(
  path: readonly string[],
  rootSegments = 0,
): readonly string[] {
  return normalizeConfigPath(path, rootSegments).filter(
    (segment) => !/^\d+$/u.test(segment),
  );
}

export function configValueAt(
  root: unknown,
  path: readonly string[],
  rootSegments = 0,
): unknown {
  let current = root;
  for (const segment of path.slice(rootSegments)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}
