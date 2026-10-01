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
    !value.includes(":") || value.startsWith(`${namespace}:`)
  );
}

  // 判别式字符串本身没有字符集限制: CE 先拼 Key 再查注册表(CommonFunctions.java:96-101),
  // 空值会被 getNonEmptyString 直接拦下; 只有标识符形态的取值会走
  // ConfigValue.getAsIdentifier 的先转小写再按 Identifier.isValid 校验(ConfigValue.java:363-378,
  // Identifier.java:6-26)。这里用同一套写法规则区分「写法像合法 ID 但没注册」与「写法本身就不对」,
  // 只影响诊断的严重程度, 不代表能否注册。
export function isValidRegistryDiscriminator(
  value: string,
  defaultNamespace: "craftengine" | "minecraft" = "craftengine",
): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    isValidIdentifier(makeIdentifier(value, defaultNamespace))
  );
}
