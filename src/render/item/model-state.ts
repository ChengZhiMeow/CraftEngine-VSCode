import { isRecord, isUnknownArray } from "../shared/runtime.js";

export type ItemModelNode = Readonly<Record<string, unknown>>;
export interface BooleanModelStateControl {
  readonly kind: "boolean";
  readonly key: string;
  readonly property: string;
  readonly node: ItemModelNode;
}
export interface RangeModelStateControl {
  readonly kind: "range";
  readonly key: string;
  readonly property: string;
  readonly node: ItemModelNode;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
}
export interface SelectModelStateControl {
  readonly kind: "select";
  readonly key: string;
  readonly property: string;
  readonly node: ItemModelNode;
  readonly values: readonly string[];
}
export type ItemModelStateControl =
  BooleanModelStateControl | RangeModelStateControl | SelectModelStateControl;

export function itemModelNodeType(node: unknown): string {
  if (!isRecord(node) || typeof node.type !== "string") return "";
  const separator = node.type.indexOf(":");
  return separator < 0 ? node.type : node.type.slice(separator + 1);
}

function stableValue(value: unknown): unknown {
  if (isUnknownArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function modelStateValueKey(value: unknown): string {
  if (value !== null && typeof value === "object")
    return `json:${JSON.stringify(stableValue(value))}`;
  return String(value);
}

const STRUCTURAL_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  condition: new Set([
    "type",
    "property",
    "on_true",
    "on-true",
    "on_false",
    "on-false",
    "transformation",
  ]),
  range_dispatch: new Set([
    "type",
    "property",
    "scale",
    "entries",
    "fallback",
    "transformation",
  ]),
  select: new Set(["type", "property", "cases", "fallback", "transformation"]),
};

export function modelPropertyKey(node: unknown): string {
  const type = itemModelNodeType(node);
  const record = isRecord(node) ? node : {};
  const property =
    typeof record.property === "string"
      ? record.property
      : typeof record.component === "string"
        ? record.component
        : type;
  const ignored =
    STRUCTURAL_FIELDS[type] || new Set(["type", "property", "transformation"]);
  const details = Object.fromEntries(
    Object.entries(isRecord(node) ? node : {}).filter(
      ([key]) => !ignored.has(key),
    ),
  );
  const suffix =
    Object.keys(details).length === 0
      ? ""
      : `|${JSON.stringify(stableValue(details))}`;
  return `${type}:${property}${suffix}`;
}

function finiteScale(node: unknown) {
  const scale = Number(isRecord(node) ? (node.scale ?? 1) : 1);
  return Number.isFinite(scale) && scale !== 0 ? scale : 1;
}

function rangeEntries(node: unknown): Record<string, unknown>[] {
  const entries: readonly unknown[] =
    isRecord(node) && isUnknownArray(node.entries) ? node.entries : [];
  return entries
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && Number.isFinite(Number(entry.threshold)),
    )
    .sort((left, right) => Number(left.threshold) - Number(right.threshold));
}

export function rangeControlDefinition(node: unknown): {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
} {
  const record = isRecord(node) ? node : {};
  const property = typeof record.property === "string" ? record.property : "";
  const scale = finiteScale(node);
  const thresholds = rangeEntries(node).map(
    (entry) => Number(entry.threshold) / scale,
  );
  const useDuration = property === "minecraft:use_duration";
  const useCyclePeriod =
    property === "minecraft:use_cycle"
      ? Number(record.period ?? record.source)
      : Number.NaN;
  const baseMaximum = useDuration
    ? 20
    : Number.isFinite(useCyclePeriod) && useCyclePeriod > 0
      ? useCyclePeriod
      : 1;
  const rawSpan =
    Math.max(baseMaximum, ...thresholds) - Math.min(0, ...thresholds);
  const step = useDuration || rawSpan > 100 ? 1 : 0.01;
  const candidates = [0, baseMaximum, ...thresholds];
  if (record.fallback !== undefined && thresholds.length > 0) {
    const firstScaledThreshold = Number(rangeEntries(node)[0]!.threshold);
    candidates.push((firstScaledThreshold - Math.abs(scale) * step) / scale);
  }
  return {
    minimum: Math.min(...candidates),
    maximum: Math.max(...candidates),
    step,
  };
}

export function selectControlValues(node: unknown): string[] {
  const values: string[] = [];
  const cases: readonly unknown[] =
    isRecord(node) && isUnknownArray(node.cases) ? node.cases : [];
  for (const entry of cases) {
    if (!isRecord(entry)) continue;
    const entries: readonly unknown[] = isUnknownArray(entry.when)
      ? entry.when
      : [entry.when];
    for (const value of entries)
      if (value !== undefined) values.push(modelStateValueKey(value));
  }
  return [...new Set(values)];
}

export function conditionModelBranch(
  node: ItemModelNode,
  selected: boolean,
): unknown {
  return selected
    ? (node.on_true ?? node["on-true"])
    : (node.on_false ?? node["on-false"]);
}

export function rangeModelBranch(
  node: ItemModelNode,
  rawValue: number,
): unknown {
  const value = Number(rawValue) * finiteScale(node);
  let selected = node.fallback;
  for (const entry of rangeEntries(node))
    if (value >= Number(entry.threshold)) selected = entry.model;
  return selected;
}

export function selectModelBranch(
  node: ItemModelNode,
  selectedValue: string,
): unknown {
  if (selectedValue === "__fallback__") return node.fallback;
  const cases: readonly unknown[] = isUnknownArray(node.cases)
    ? node.cases
    : [];
  for (const entry of cases) {
    if (!isRecord(entry)) continue;
    const values: readonly unknown[] = isUnknownArray(entry.when)
      ? entry.when
      : [entry.when];
    if (values.some((value) => modelStateValueKey(value) === selectedValue))
      return entry.model;
  }
  return node.fallback;
}

export function collectItemModelStateControls(
  value: unknown,
  options: Readonly<{ includeDisplayContext?: boolean }> = {},
): ItemModelStateControl[] {
  const controls = new Map<string, ItemModelStateControl>();
  const visit = (node: unknown): void => {
    if (isUnknownArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) return;
    const kind = itemModelNodeType(node);
    const property =
      typeof node.property === "string"
        ? node.property
        : typeof node.component === "string"
          ? node.component
          : "";
    const key = modelPropertyKey(node);
    switch (kind) {
      case "condition":
        if (!controls.has(key))
          controls.set(key, { kind: "boolean", key, property, node });
        break;
      case "range_dispatch": {
        const definition = rangeControlDefinition(node);
        const previous = controls.get(key);
        controls.set(
          key,
          previous?.kind === "range"
            ? {
                ...previous,
                minimum: Math.min(previous.minimum, definition.minimum),
                maximum: Math.max(previous.maximum, definition.maximum),
                step: Math.min(previous.step, definition.step),
              }
            : { kind: "range", key, property, node, ...definition },
        );
        break;
      }
      case "select": {
        if (
          options.includeDisplayContext !== true &&
          node.property === "minecraft:display_context"
        )
          break;
        const values = selectControlValues(node);
        const previous = controls.get(key);
        controls.set(
          key,
          previous?.kind === "select"
            ? {
                ...previous,
                values: [...new Set([...previous.values, ...values])],
              }
            : { kind: "select", key, property, node, values },
        );
        break;
      }
      default:
        break;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "generation" && key !== "transformation") visit(child);
    }
  };
  visit(value);
  return [...controls.values()];
}
