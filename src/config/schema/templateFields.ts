import { Messages } from "../../messages.js";
import type { SchemaField } from "./types.js";

const TEMPLATE_FIELDS = [
  {
    label: "template",
    semantic: "template",
    aliases: ["templates"],
    detail: Messages.src.config.item.schema.text0001,
    snippet: "template: ${0}",
    valueProvider: "template",
  },
  {
    label: "arguments",
    semantic: "arguments",
    aliases: [],
    detail: Messages.src.config.item.schema.text0002,
    snippet: "arguments:\n  ${0}",
  },
  {
    label: "overrides",
    semantic: "overrides",
    aliases: [],
    detail: Messages.src.config.item.schema.text0003,
    snippet: "overrides:\n  ${0}",
  },
  {
    label: "merges",
    semantic: "merges",
    aliases: [],
    detail: Messages.src.config.item.schema.text0004,
    snippet: "merges:\n  ${0}",
  },
] as const satisfies readonly SchemaField[];

export function withTemplateSchemaFields(
  path: readonly string[],
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  // arguments 本身不是模板调用, 再补模板字段会把参数目录误认成嵌套模板
  if (path.at(-1)?.replaceAll("-", "_") === "arguments") return fields;

  const merged = new Map(
    fields.map((candidate) => [candidate.semantic, candidate]),
  );
  for (const candidate of TEMPLATE_FIELDS)
    if (!merged.has(candidate.semantic))
      merged.set(candidate.semantic, candidate);

  return [...merged.values()];
}
