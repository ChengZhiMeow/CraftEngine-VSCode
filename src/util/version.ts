  // 与 CE 的 VersionHelper.parseVersionToInteger 一致:
  // 只取前 3 段数字, 第二段之后的第三个点号起全部丢弃, 再编码成整数
function versionToInteger(source: string): number {
  let major = 0;
  let minor = 0;
  let patch = 0;
  let current = 0;
  let part = 0;
  for (const character of source) {
    if (character >= "0" && character <= "9") {
      current = current * 10 + (character.charCodeAt(0) - 48);
      continue;
    }
    if (character !== ".") continue;
    if (part === 0) major = current;
    else if (part === 1) minor = current;
    part += 1;
    current = 0;
    if (part > 2) break;
  }
  // CE 在 break 之后仍按 part 收尾, 此时被跳过的第三段记录的是 0
  if (part === 0) major = current;
  else if (part === 1) minor = current;
  else if (part === 2) patch = current;
  return major * 10000 + minor * 100 + patch;
}

export function compareMinecraftVersions(left: string, right: string): number {
  return Math.sign(versionToInteger(left) - versionToInteger(right));
}

  // CraftEngine 26.9.2 声明 latest_supported_version=26.3, 配置里的 $$ 版本选择器
  // 按服务端 MC 版本求值, 因此扩展默认模拟 26.3
export const DEFAULT_MINECRAFT_VERSION = "26.3";

export function matchesMinecraftVersion(
  specification: string,
  target = DEFAULT_MINECRAFT_VERSION,
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
