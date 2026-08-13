export interface CraftEngineTemplatePlaceholder {
  readonly start: number;
  readonly end: number;
  readonly body: string;
}

// 必须和服务端的参数预处理一致, 没有转义的花括号会影响层级, 没闭合的占位符保留原文
export function craftEngineTemplatePlaceholderAt(
  source: string,
  start: number,
): CraftEngineTemplatePlaceholder | undefined {
  if (source[start] !== "$" || source[start + 1] !== "{") return undefined;
  let depth = 1;
  let body = "";
  for (let cursor = start + 2; cursor < source.length; ) {
    const character = source[cursor] ?? "";
    const next = source[cursor + 1];
    if (character === "\\" && (next === "{" || next === "}")) {
      body += next;
      cursor += 2;
      continue;
    }
    if (character === "{") {
      depth += 1;
      body += character;
      cursor += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      cursor += 1;
      if (depth === 0) return { start, end: cursor, body };
      body += character;
      continue;
    }
    body += character;
    cursor += 1;
  }
  return undefined;
}

export function findCraftEngineTemplatePlaceholders(
  source: string,
): readonly CraftEngineTemplatePlaceholder[] {
  const result: CraftEngineTemplatePlaceholder[] = [];
  for (let index = 0; index < source.length - 1; index += 1) {
  // 转义的美元符号会还原成普通字符, 这里不能把它当成占位符开头
    if (source[index] === "\\" && source[index + 1] === "$") {
      index += 1;
      continue;
    }
    const placeholder = craftEngineTemplatePlaceholderAt(source, index);
    if (!placeholder) continue;
    result.push(placeholder);
    index = placeholder.end - 1;
  }
  return result;
}

export function hasCraftEngineTemplatePlaceholder(source: string): boolean {
  return findCraftEngineTemplatePlaceholders(source).length > 0;
}
