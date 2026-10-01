import type { IssueSeverity, TextRange } from "../../diagnostics/model.js";
import { Messages } from "../../messages.js";
import {
  craftEngineTemplatePlaceholderAt,
  findCraftEngineTemplatePlaceholders,
  hasCraftEngineTemplatePlaceholder,
} from "../../config/template/stringParser.js";
import { isExpressionSyntax } from "../../config/expression/evaluator.js";

export { hasCraftEngineTemplatePlaceholder } from "../../config/template/stringParser.js";

export interface MiniMessageArgument {
  readonly value: string;
  readonly raw: string;
  readonly range: TextRange;
  readonly quoted: boolean;
  readonly dynamic: boolean;
}

export interface MiniMessageTag {
  readonly name: string;
  readonly family: "standard" | "craftengine" | "external";
  readonly closing: boolean;
  readonly range: TextRange;
  readonly nameRange: TextRange;
  readonly arguments: readonly MiniMessageArgument[];
  readonly dynamic: boolean;
}

export type MiniMessageReferenceKind =
  | "language"
  | "server-language"
  | "global"
  | "image"
  | "attribute";

export interface MiniMessageReference {
  readonly kind: MiniMessageReferenceKind;
  readonly id: string;
  readonly dynamic: boolean;
  readonly range: TextRange;
  readonly tagRange: TextRange;
  readonly tagName: string;
}

export interface MiniMessageIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: IssueSeverity;
  readonly range: TextRange;
}

export interface MiniMessageScanResult {
  readonly tags: readonly MiniMessageTag[];
  readonly references: readonly MiniMessageReference[];
  readonly issues: readonly MiniMessageIssue[];
}

export type MiniMessageArgumentKind =
  | "language-key"
  | "server-language-key"
  | "global-id"
  | "custom-attribute-id"
  | "image-id"
  | "integer"
  | "atlas-coordinate-or-format"
  | "format"
  | "context-key"
  | "placeholder"
  | "expression"
  | "component"
  | "value";

export type MiniMessageCompletionContext =
  | {
      readonly kind: "tag";
      readonly prefix: string;
      readonly closing: boolean;
      readonly range: TextRange;
    }
  | {
      readonly kind: "argument";
      readonly tagName: string;
      readonly tagFamily: MiniMessageTag["family"];
      readonly argumentIndex: number;
      readonly argumentKind: MiniMessageArgumentKind;
      readonly prefix: string;
      readonly quoted: boolean;
      readonly range: TextRange;
    };

export const STANDARD_MINIMESSAGE_TAGS = [
  "black",
  "dark_blue",
  "dark_green",
  "dark_aqua",
  "dark_red",
  "dark_purple",
  "gold",
  "gray",
  "dark_gray",
  "blue",
  "green",
  "aqua",
  "red",
  "light_purple",
  "yellow",
  "white",
  "color",
  "c",
  "bold",
  "b",
  "italic",
  "em",
  "i",
  "underlined",
  "u",
  "strikethrough",
  "st",
  "obfuscated",
  "obf",
  "reset",
  "newline",
  "br",
  "gradient",
  "transition",
  "rainbow",
  "pride",
  "click",
  "hover",
  "insertion",
  "font",
  "keybind",
  "selector",
  "score",
  "nbt",
  "shadow_color",
  "sprite",
  "head",
  "lang",
  "translate",
  "tr",
  "lang_or",
  "translate_or",
  "tr_or",
] as const;

export const CRAFTENGINE_MINIMESSAGE_TAGS = [
  "shift",
  "image",
  "i18n",
  "l10n",
  "arg",
  "papi",
  "expr",
  "global",
  "rel_papi",
  "viewer_papi",
  "viewer_arg",
  "var",
  "random",
  "attacker_attr",
  "victim_attr",
  "background",
  "bubble",
  "nameplate",
] as const;

interface RawPart {
  readonly start: number;
  readonly end: number;
}

function tagEnd(text: string, start: number): number {
  let quote = "";
  let nested = 0;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "$" && text[index - 1] !== "\\") {
      const placeholder = craftEngineTemplatePlaceholderAt(text, index);
      if (placeholder) index = placeholder.end - 1;
    } else if (character === "<") nested += 1;
    else if (character === ">" && nested > 0) nested -= 1;
    else if (character === ">") return index;
  }
  return -1;
}

function escaped(text: string, index: number): boolean {
  let slashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && text[cursor] === "\\";
    cursor -= 1
  )
    slashes += 1;
  return (slashes & 1) === 1;
}

function tagFamily(name: string): MiniMessageTag["family"] {
  if (name.startsWith("!")) {
    switch (name.slice(1)) {
      case "bold":
      case "b":
      case "italic":
      case "em":
      case "i":
      case "underlined":
      case "u":
      case "strikethrough":
      case "st":
      case "obfuscated":
      case "obf":
        return "standard";
    }
  }
  if (
    STANDARD_MINIMESSAGE_TAGS.some((tag) => tag === name) ||
    /^#[0-9a-f]{3,8}$/iu.test(name)
  )
    return "standard";
  if (CRAFTENGINE_MINIMESSAGE_TAGS.some((tag) => tag === name))
    return "craftengine";
  return "external";
}

function argumentKind(tagName: string, index: number): MiniMessageArgumentKind {
  switch (tagName) {
    case "lang":
    case "translate":
    case "tr":
    case "lang_or":
    case "translate_or":
    case "tr_or":
      return index === 0 ? "language-key" : "component";
    case "i18n":
    case "l10n":
      return index === 0 ? "server-language-key" : "component";
    case "global":
      return index === 0 ? "global-id" : "component";
    case "image":
      if (index <= 1) return "image-id";
      if (index === 2) return "atlas-coordinate-or-format";
      if (index === 3) return "integer";
      return "format";
    case "shift":
      return "integer";
    case "arg":
    case "viewer_arg":
      return index === 0 ? "context-key" : "component";
    case "var":
      return index === 0 ? "context-key" : "value";
    case "attacker_attr":
    case "victim_attr":
      return index === 0 ? "custom-attribute-id" : "value";
    case "papi":
    case "rel_papi":
    case "viewer_papi":
      return index === 0 ? "placeholder" : "component";
    case "expr":
      return index === 0 ? "format" : "expression";
    default:
      return "value";
  }
}

function splitParts(text: string, start: number, end: number): RawPart[] {
  const result: RawPart[] = [];
  let partStart = start;
  let quote = "";
  let nested = 0;
  for (let index = start; index < end; index += 1) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "$" && text[index - 1] !== "\\") {
      const placeholder = craftEngineTemplatePlaceholderAt(text, index);
      if (placeholder) index = placeholder.end - 1;
    } else if (character === "<") nested += 1;
    else if (character === ">" && nested > 0) nested -= 1;
    else if (character === ":" && nested === 0) {
      result.push({ start: partStart, end: index });
      partStart = index + 1;
    }
  }
  result.push({ start: partStart, end });
  return result;
}

function trimmedRange(text: string, part: RawPart): RawPart {
  let start = part.start;
  let end = part.end;
  while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
  return { start, end };
}

function argument(
  text: string,
  part: RawPart,
  baseOffset: number,
): MiniMessageArgument {
  let { start, end } = trimmedRange(text, part);
  const raw = text.slice(start, end);
  const quote = text[start];
  const quoted =
    end - start >= 2 &&
    (quote === "'" || quote === '"') &&
    text[end - 1] === quote;
  if (quoted) {
    start += 1;
    end -= 1;
  }
  return {
    value: text.slice(start, end).replace(/\\([\\'"])/gu, "$1"),
    raw,
    range: { start: baseOffset + start, end: baseOffset + end },
    quoted,
    dynamic: hasCraftEngineTemplatePlaceholder(text.slice(start, end)),
  };
}

function referenceFor(tag: MiniMessageTag): MiniMessageReference | undefined {
  if (tag.closing) return undefined;
  const first = tag.arguments[0];
  if (!first) return undefined;
  let kind: MiniMessageReferenceKind;
  let id = first.value;
  let range = first.range;
  switch (tag.name) {
    case "lang":
    case "translate":
    case "tr":
    case "lang_or":
    case "translate_or":
    case "tr_or":
      kind = "language";
      break;
    case "i18n":
    case "l10n":
      kind = "server-language";
      break;
    case "global":
      kind = "global";
      break;
    case "image": {
      kind = "image";
      const second = tag.arguments[1];
      if (second) {
        id = `${first.value}:${second.value}`;
        range = { start: first.range.start, end: second.range.end };
      }
      break;
    }
    case "attacker_attr":
    case "victim_attr": {
      kind = "attribute";
      const second = tag.arguments[1];
      if (second) {
        id = `${first.value}:${second.value}`;
        range = { start: first.range.start, end: second.range.end };
      }
      break;
    }
    default:
      return undefined;
  }
  return {
    kind,
    id,
    dynamic: hasCraftEngineTemplatePlaceholder(id),
    range,
    tagRange: tag.range,
    tagName: tag.name,
  };
}

function warning(
  code: string,
  message: string,
  range: TextRange,
): MiniMessageIssue {
  return { code, message, severity: "warning", range };
}

function validateTag(tag: MiniMessageTag): readonly MiniMessageIssue[] {
  if (!tag.name)
    return [
      warning(
        "minimessage-empty-tag",
        Messages.src.text.minimessage.parser.text0001,
        tag.range,
      ),
    ];
  if (tag.closing)
    return tag.family === "craftengine"
      ? [
          warning(
            "minimessage-unexpected-closing-tag",
            Messages.src.text.minimessage.parser.text0002(tag.name),
            tag.nameRange,
          ),
        ]
      : [];
  let minimum: number | undefined;
  switch (tag.name) {
    case "lang":
    case "translate":
    case "tr":
    case "shift":
    case "image":
    case "i18n":
    case "l10n":
    case "arg":
    case "papi":
    case "global":
    case "rel_papi":
    case "viewer_papi":
    case "viewer_arg":
    case "var":
    case "random":
    case "attacker_attr":
    case "victim_attr":
      minimum = 1;
      break;
    case "lang_or":
    case "translate_or":
    case "tr_or":
    case "expr":
      minimum = 2;
      break;
    case "background":
    case "bubble":
    case "nameplate":
      minimum = 4;
      break;
  }
  if (
    minimum !== undefined &&
    (tag.arguments.length < minimum ||
      tag.arguments.slice(0, minimum).some((value) => value.value.length === 0))
  ) {
    return [
      warning(
        "minimessage-missing-argument",
        Messages.src.text.minimessage.parser.text0003(tag.name),
        tag.nameRange,
      ),
    ];
  }
  const issues: MiniMessageIssue[] = [];
  let maximum: number | undefined;
  switch (tag.name) {
    case "shift":
    case "i18n":
      maximum = 1;
      break;
    case "arg":
    case "papi":
    case "expr":
    case "rel_papi":
    case "viewer_papi":
    case "viewer_arg":
      maximum = 2;
      break;
    case "var":
      maximum = 1;
      break;
    case "attacker_attr":
    case "victim_attr":
      maximum = 2;
      break;
    case "image":
      maximum = 5;
      break;
  }
  if (maximum !== undefined && tag.arguments.length > maximum) {
    const firstExtra = tag.arguments[maximum];
    const lastExtra = tag.arguments.at(-1);
    if (firstExtra && lastExtra) {
      issues.push(
        warning(
          "minimessage-extra-argument",
          Messages.src.text.minimessage.parser.text0004(tag.name),
          {
            start: firstExtra.range.start,
            end: lastExtra.range.end,
          },
        ),
      );
    }
  }
  if (tag.name === "shift") {
    const value = tag.arguments[0];
    if (value && !value.dynamic && !/^[+-]?\d+$/u.test(value.value)) {
      issues.push(
        warning(
          "minimessage-invalid-integer",
          Messages.src.text.minimessage.parser.text0005,
          value.range,
        ),
      );
    }
  }
  if (tag.name === "image" && tag.arguments.length >= 4) {
    issues.push(
      ...[tag.arguments[2], tag.arguments[3]].flatMap((value) =>
        value && !value.dynamic && !/^-?\d+$/u.test(value.value)
          ? [
              warning(
                "minimessage-invalid-integer",
                Messages.src.text.minimessage.parser.text0006,
                value.range,
              ),
            ]
          : [],
      ),
    );
  }
  if (tag.name === "expr") {
    const expression = tag.arguments[1];
    if (
      expression &&
      !expression.dynamic &&
      !isExpressionSyntax(expression.value)
    )
      issues.push(
        warning(
          "minimessage-invalid-expression",
          "expr 标签中的内容不是有效的 Sparrow Expression",
          expression.range,
        ),
      );
  }
  return issues;
}

export function scanMiniMessage(
  text: string,
  baseOffset = 0,
): MiniMessageScanResult {
  const tags: MiniMessageTag[] = [];
  const references: MiniMessageReference[] = [];
  const issues: MiniMessageIssue[] = [];
  const placeholders = findCraftEngineTemplatePlaceholders(text);
  for (let cursor = 0; cursor < text.length; ) {
    const start = text.indexOf("<", cursor);
    if (start < 0) break;
    const containingPlaceholder = placeholders.find(
      (placeholder) => start > placeholder.start && start < placeholder.end,
    );
    if (containingPlaceholder) {
      cursor = containingPlaceholder.end;
      continue;
    }
    if (escaped(text, start)) {
      cursor = start + 1;
      continue;
    }
    if (
      text[start + 1] !== ">" &&
      !/[A-Za-z!#/$]/u.test(text[start + 1] ?? "")
    ) {
      cursor = start + 1;
      continue;
    }
    const end = tagEnd(text, start);
    if (end < 0) {
      issues.push(
        warning(
          "minimessage-unterminated-tag",
          Messages.src.text.minimessage.parser.text0007,
          {
            start: baseOffset + start,
            end: baseOffset + text.length,
          },
        ),
      );
      break;
    }
    let contentStart = start + 1;
    const closing = text[contentStart] === "/";
    if (closing) contentStart += 1;
    const parts = splitParts(text, contentStart, end);
    const namePart = trimmedRange(
      text,
      parts.shift() ?? { start: contentStart, end },
    );
    const name = text.slice(namePart.start, namePart.end).toLowerCase();
    const tagArguments = parts.map((part) => argument(text, part, baseOffset));
    const tag: MiniMessageTag = {
      name,
      family: tagFamily(name),
      closing,
      range: { start: baseOffset + start, end: baseOffset + end + 1 },
      nameRange: {
        start: baseOffset + namePart.start,
        end: baseOffset + namePart.end,
      },
      arguments: tagArguments,
      dynamic:
        hasCraftEngineTemplatePlaceholder(name) ||
        tagArguments.some((value) => value.dynamic),
    };
    tags.push(tag);
    issues.push(...validateTag(tag));
    const reference = referenceFor(tag);
    if (reference) references.push(reference);
    for (const tagArgument of tag.arguments) {
      const nestedText = text.slice(
        tagArgument.range.start - baseOffset,
        tagArgument.range.end - baseOffset,
      );
      if (!nestedText.includes("<")) continue;
      const nested = scanMiniMessage(nestedText, tagArgument.range.start);
      tags.push(...nested.tags);
      references.push(...nested.references);
      issues.push(...nested.issues);
    }
    cursor = end + 1;
  }
  return { tags, references, issues };
}

export function miniMessageCompletionContext(
  text: string,
  cursor = text.length,
  baseOffset = 0,
): MiniMessageCompletionContext | undefined {
  const bounded = Math.max(0, Math.min(cursor, text.length));
  let start = text.lastIndexOf("<", bounded - 1);
  while (start >= 0 && escaped(text, start))
    start = text.lastIndexOf("<", start - 1);
  if (start < 0) return undefined;
  let quote = "";
  for (let index = start + 1; index < bounded; index += 1) {
    const character = text[index] ?? "";
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === ">") return undefined;
  }
  let contentStart = start + 1;
  const closing = text[contentStart] === "/";
  if (closing) contentStart += 1;
  const parts = splitParts(text, contentStart, bounded);
  const namePart = trimmedRange(
    text,
    parts[0] ?? { start: contentStart, end: bounded },
  );
  const name = text.slice(namePart.start, namePart.end).toLowerCase();
  if (parts.length <= 1) {
    return {
      kind: "tag",
      prefix: text.slice(namePart.start, bounded),
      closing,
      range: { start: baseOffset + namePart.start, end: baseOffset + bounded },
    };
  }
  const currentPart = parts.at(-1);
  if (!currentPart) return undefined;
  let prefixStart = trimmedRange(text, currentPart).start;
  const openingQuote = text[prefixStart];
  const quoted = openingQuote === "'" || openingQuote === '"';
  if (quoted) prefixStart += 1;
  return {
    kind: "argument",
    tagName: name,
    tagFamily: tagFamily(name),
    argumentIndex: parts.length - 2,
    argumentKind: argumentKind(name, parts.length - 2),
    prefix: text.slice(prefixStart, bounded),
    quoted,
    range: { start: baseOffset + prefixStart, end: baseOffset + bounded },
  };
}
