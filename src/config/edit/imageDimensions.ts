import type { TextRange } from "../../diagnostics/model.js";
import { matchesMinecraftVersion } from "../../util/version.js";
import type { ImageSource } from "../image/model.js";

import { Messages } from "../../messages.js";
export interface TextReplacement extends TextRange {
  readonly text: string;
}

export type ImageDimensionEditPlan =
  | {
      readonly ok: true;
      readonly replacements: readonly TextReplacement[];
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly replacements: readonly [];
    };

export function planImageDimensionEdit(
  text: string,
  source: ImageSource,
  height: number,
  ascent: number,
): ImageDimensionEditPlan {
  if (source.kind !== "direct") {
    return {
      ok: false,
      message: Messages.src.config.edit.imageDimensions.text0001,
      replacements: [],
    };
  }
  if (
    !Number.isInteger(height) ||
    !Number.isInteger(ascent) ||
    ascent > height
  ) {
    return {
      ok: false,
      message: Messages.src.config.edit.imageDimensions.text0002,
      replacements: [],
    };
  }
  const [heightRange, ascentRange] = (
    [
      ["height", "scale", "scale_ratio"],
      ["ascent", "y_position"],
    ] as const
  ).map((fields): TextRange | undefined => {
    for (const field of fields) {
      let valueFallback: TextRange | undefined;
      let outerFallback: TextRange | undefined;
      for (const [path, range] of source.fieldValueRanges) {
        const valueSelectorPrefix = `${field}.$$`;
        if (path.startsWith(valueSelectorPrefix)) {
          const selector = path.slice(valueSelectorPrefix.length);
          if (selector === "fallback") valueFallback = range;
          else if (matchesMinecraftVersion(selector)) return range;
          continue;
        }

        const outerSuffix = `.${field}`;
        if (!path.startsWith("$$") || !path.endsWith(outerSuffix)) continue;

        const selector = path.slice(2, -outerSuffix.length);
        if (selector === "fallback") outerFallback = range;
        else if (matchesMinecraftVersion(selector)) return range;
      }
      const selected =
        valueFallback ?? outerFallback ?? source.fieldValueRanges.get(field);
      if (selected) return selected;
    }
    return undefined;
  });
  const replacements: TextReplacement[] = [];
  if (heightRange) replacements.push({ ...heightRange, text: String(height) });
  if (ascentRange) replacements.push({ ...ascentRange, text: String(ascent) });
  const missing = [
    ...(heightRange ? [] : [`height: ${height}`]),
    ...(ascentRange ? [] : [`ascent: ${ascent}`]),
  ];
  if (missing.length === 0) return { ok: true, replacements };

  const opening = text.indexOf("{", source.entryRange.start);
  const closing = text.lastIndexOf("}", source.entryRange.end);
  if (
    opening >= source.entryRange.start &&
    closing > opening &&
    closing <= source.entryRange.end
  ) {
    let insertion = closing;
    while (insertion > opening + 1 && /\s/u.test(text[insertion - 1] ?? ""))
      insertion -= 1;
    replacements.push({
      start: insertion,
      end: insertion,
      text: `${text.slice(opening + 1, insertion).trim().length > 0 ? ", " : " "}${missing.join(", ")}`,
    });
    return { ok: true, replacements };
  }

  const firstField = [...source.fieldKeyRanges.values()].sort(
    (left, right) => left.start - right.start,
  )[0];
  const indent = firstField
    ? (text
        .slice(
          text.lastIndexOf("\n", Math.max(0, firstField.start - 1)) + 1,
          firstField.start,
        )
        .match(/^\s*/u)?.[0] ?? "")
    : `${
        text
          .slice(
            text.lastIndexOf("\n", Math.max(0, source.idRange.start - 1)) + 1,
            source.idRange.start,
          )
          .match(/^\s*/u)?.[0] ?? ""
      }  `;
  const end = source.entryRange.end;
  const lineStart = text.lastIndexOf("\n", Math.max(0, end - 1)) + 1;
  const body = missing.map((field) => `${indent}${field}`).join("\n");
  if (end > 0 && text[end - 1] === "\n") {
    replacements.push({ start: end, end, text: `${body}\n` });
    return { ok: true, replacements };
  }
  if (
    /^\s*$/u.test(text.slice(lineStart, end)) &&
    end < text.length &&
    text[end] !== "\n"
  ) {
    replacements.push({
      start: lineStart,
      end: lineStart,
      text: `${body}\n`,
    });
    return { ok: true, replacements };
  }

  replacements.push({ start: end, end, text: `\n${body}` });
  return { ok: true, replacements };
}
