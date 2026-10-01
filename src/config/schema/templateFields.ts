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

  // 同一个静态字段表的合并结果只取决于输入数组本身,
  // 各上下文每查一个字段就会调用一次, 命中缓存可以避免反复重建整个 Map
const MERGED_FIELDS = new WeakMap<
  readonly SchemaField[],
  readonly SchemaField[]
>();

export function withTemplateSchemaFields(
  path: readonly string[],
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  // arguments 本身不是模板调用, 再补模板字段会把参数目录误认成嵌套模板
  if (path.at(-1)?.replaceAll("-", "_") === "arguments") return fields;

  // 空输入与合并结果无关, 调用点传的多是临时数组字面量, 查缓存必然 miss
  if (fields.length === 0) return TEMPLATE_FIELDS;

  const cached = MERGED_FIELDS.get(fields);
  if (cached) return cached;

  const merged = new Map(
    fields.map((candidate) => [candidate.semantic, candidate]),
  );
  for (const candidate of TEMPLATE_FIELDS)
    if (!merged.has(candidate.semantic))
      merged.set(candidate.semantic, candidate);

  const result = [...merged.values()];
  MERGED_FIELDS.set(fields, result);
  return result;
}
