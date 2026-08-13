export function compareMinecraftVersions(left: string, right: string): number {
  const a = left.match(/\d+/gu)?.map(Number) ?? [0];
  const b = right.match(/\d+/gu)?.map(Number) ?? [0];
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  return 0;
}

export function matchesMinecraftVersion(
  specification: string,
  target = "26.2",
): boolean {
  const spec = specification.trim();
  if (spec === "fallback") {
    return false;
  }
  const rangeIndex = spec.indexOf("~");
  if (rangeIndex >= 0) {
    const minimum = spec.slice(0, rangeIndex);
    const maximum = spec.slice(rangeIndex + 1);
    return (
      compareMinecraftVersions(target, minimum) >= 0 &&
      compareMinecraftVersions(target, maximum) <= 0
    );
  }
  for (const operator of [">=", "<=", ">", "<"] as const) {
    if (spec.startsWith(operator)) {
      const comparison = compareMinecraftVersions(
        target,
        spec.slice(operator.length),
      );
      switch (operator) {
        case ">=":
          return comparison >= 0;
        case "<=":
          return comparison <= 0;
        case ">":
          return comparison > 0;
        case "<":
          return comparison < 0;
      }
    }
  }
  return compareMinecraftVersions(target, spec) === 0;
}
