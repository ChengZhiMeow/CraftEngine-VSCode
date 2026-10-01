export function splitIdentifier(
  identifier: string,
  defaultNamespace: string,
): [namespace: string, value: string] {
  const separator = identifier.indexOf(":");
  if (separator < 0) return [defaultNamespace, identifier];
  return [
    separator === 0 ? defaultNamespace : identifier.slice(0, separator),
    identifier.slice(separator + 1),
  ];
}

export function makeIdentifier(
  identifier: string,
  defaultNamespace: string,
): string {
  const [namespace, value] = splitIdentifier(identifier, defaultNamespace);
  return `${namespace}:${value}`;
}

export function isValidIdentifier(identifier: string): boolean {
  const [namespace, value] = splitIdentifier(identifier, "minecraft");
  return (
    /^[a-z0-9_.-]*$/u.test(namespace) &&
    /^[a-z0-9_.\-/]*$/u.test(value)
  );
}
