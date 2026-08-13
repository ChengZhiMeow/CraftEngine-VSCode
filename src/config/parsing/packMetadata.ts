import { isRecord, isUnknownArray } from "../../util/records.js";
import { Messages } from "../../messages.js";
import { parseCraftEngineYamlValue } from "./craftEngineYaml.js";

export interface PackMetadata {
  readonly namespace: string;
  readonly enabled: boolean;
  readonly activeSubpacks: readonly string[];
}

  // 必须先按 Java int 读取再缩成 byte, 顺序反了会改变大数结果
function javaByteValue(value: number): number {
  let integer: number;
  if (Number.isNaN(value)) integer = 0;
  else if (value >= 2_147_483_647) integer = 2_147_483_647;
  else if (value <= -2_147_483_648) integer = -2_147_483_648;
  else integer = Math.trunc(value);
  const unsigned = ((integer % 256) + 256) % 256;
  return unsigned >= 128 ? unsigned - 256 : unsigned;
}

  // 数字布尔值要先缩成 byte, 直接看原数值会得到不同结果
export function craftEngineBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    const byteValue = javaByteValue(value);
    switch (byteValue) {
      case 0:
        return false;
      case 1:
        return true;
      default:
        if (byteValue > 0) return true;
        throw new Error(
          Messages.src.config.parsing.packMetadata.text0001(value),
        );
    }
  }
  if (typeof value === "string") {
    switch (value.toLowerCase()) {
      case "true":
      case "yes":
      case "on":
        return true;
      case "false":
      case "no":
      case "off":
        return false;
    }
  }
  throw new Error(Messages.src.config.parsing.packMetadata.text0002(value));
}

function javaString(value: unknown): string {
  if (isUnknownArray(value)) return `[${value.map(javaString).join(", ")}]`;
  if (isRecord(value))
    return `{${Object.entries(value)
      .map(([key, item]) => `${key}=${javaString(item)}`)
      .join(", ")}}`;
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return "";
  }
}

  // 字段会按顺序逐个写入, 后面转换失败时不能撤回前面写好的值
export function parsePackMetadata(
  text: string,
  folderName: string,
  targetVersion: string,
): PackMetadata {
  let raw: Readonly<Record<string, unknown>> = {};
  try {
    const parsed = parseCraftEngineYamlValue(text, targetVersion);
    if (isRecord(parsed)) raw = parsed;
  } catch {
    return {
      namespace: /^[a-z0-9_.-]*$/u.test(folderName) ? folderName : "minecraft",
      enabled: true,
      activeSubpacks: [],
    };
  }

  let namespace = /^[a-z0-9_.-]*$/u.test(folderName) ? folderName : "minecraft";
  let enabled = true;
  let selected: string[] = [];
  try {
    if (raw.enable !== null && raw.enable !== undefined)
      enabled = craftEngineBoolean(raw.enable);
    if (raw.namespace !== null && raw.namespace !== undefined)
      namespace = javaString(raw.namespace);
    if (isRecord(raw.subpacks)) {
      const parsedSubpacks: string[] = [];
      for (const [id, subpackEnabled] of Object.entries(raw.subpacks)) {
        if (craftEngineBoolean(subpackEnabled)) parsedSubpacks.push(id);
      }
      selected = parsedSubpacks;
    }
  } catch {
    return { namespace, enabled, activeSubpacks: selected };
  }
  return { namespace, enabled, activeSubpacks: selected };
}
