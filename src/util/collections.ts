export function groupBy<T, K>(
  values: readonly T[],
  keyFor: (value: T) => K,
): Map<K, readonly T[]> {
  const grouped = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const entries = grouped.get(key) ?? [];
    entries.push(value);
    grouped.set(key, entries);
  }
  return grouped;
}
