import { isValidIdentifier, makeIdentifier } from "../../util/identifiers.js";

  // 名称区分大小写, 把扩展插件的名称当成内置名称会匹配错对象
export function localRegistryDiscriminator(
  value: string | undefined,
  namespace: "craftengine" | "minecraft" = "craftengine",
): string | undefined {
  if (!value) return undefined;
  if (!value.includes(":")) return value;
  return value.startsWith(`${namespace}:`)
    ? value.slice(namespace.length + 1)
    : undefined;
}

export function isRegistryDiscriminatorSyntax(
  value: string,
  namespace: "craftengine" | "minecraft",
): boolean {
  return (
    !value.includes(":") || value.toLowerCase().startsWith(`${namespace}:`)
  );
}

  // 这里只能判断 ID 写法对不对, 不能判断它是否已在游戏中注册
export function isValidRegistryDiscriminator(
  value: string,
  defaultNamespace: "craftengine" | "minecraft" = "craftengine",
): boolean {
  return (
    value.trim() === value &&
    isValidIdentifier(makeIdentifier(value, defaultNamespace))
  );
}
