function addSnakeAndKebab(key: string, result: string[]): void {
  result.push(key);
  const kebab = key.replaceAll("_", "-");
  if (kebab !== key) result.push(kebab);
}

function expandPattern(pattern: string, result: string[]): void {
  let depth = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "|" && depth === 0) {
      expandPattern(pattern.slice(0, index), result);
      expandPattern(pattern.slice(index + 1), result);
      return;
    }
  }

  const open = pattern.indexOf("(");
  const close = open < 0 ? -1 : pattern.indexOf(")", open);
  if (close < 0) {
    addSnakeAndKebab(pattern, result);
    return;
  }

  const prefix = pattern.slice(0, open);
  const body = pattern.slice(open + 1, close);
  const suffix = pattern.slice(close + 1);
  if (body.includes("|")) {
    for (const alternative of body.split("|"))
      expandPattern(`${prefix}${alternative}${suffix}`, result);
    return;
  }
  expandPattern(`${prefix}${suffix}`, result);
  expandPattern(`${prefix}${body}${suffix}`, result);
}

export function configKeys(...patterns: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const pattern of patterns) expandPattern(pattern, result);
  return result;
}
