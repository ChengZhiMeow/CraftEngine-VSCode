import path from "node:path";

export function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function samePath(left: string, right: string): boolean {
  return canonicalPath(left) === canonicalPath(right);
}

export function isPathInside(candidate: string, parent: string): boolean {
  const relative = path.relative(
    canonicalPath(parent),
    canonicalPath(candidate),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function appendPath(base: string, child: string | number): string {
  return base ? `${base}.${String(child)}` : String(child);
}

export function pathStartsWith(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

export function isListIndex(segment: string | undefined): boolean {
  return segment === "[]" || segment === "-" || /^\d+$/u.test(segment ?? "");
}
