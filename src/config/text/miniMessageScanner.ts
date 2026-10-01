import type {
  MiniMessageArgument,
  MiniMessageIssue,
  MiniMessageReference,
  MiniMessageScanResult,
  MiniMessageTag,
} from "../../text/minimessage/parser.js";
import { scanMiniMessage } from "../../text/minimessage/parser.js";
import type { ParsedSection, ParsedYamlFile } from "../model.js";
import type { TextRange } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  CONDITION_TYPES,
  FUNCTION_TYPES,
  resolveFunctionOrConditionType,
} from "../item/schema.js";
import { resolveRecipeDiscriminator } from "../recipe/schema.js";
import {
  getSectionFamily,
  normalizeSectionType,
} from "../registry/sectionRegistry.js";
import { standaloneFileInfo } from "../files/standalone.js";
import type { ResolvedTemplateString } from "../template/expander.js";
import { resolveTemplateStringForEntry } from "../template/expander.js";
import { Messages } from "../../messages.js";
import { parseLooseScalar } from "../parsing/craftEngineYaml.js";

export interface MiniMessageOccurrence {
  readonly range: TextRange;
  readonly raw: string;
  readonly scan: MiniMessageScanResult;
}

export interface MiniMessageDocumentScanOptions {
  readonly defaultNamespace?: string;
}

interface EntryTemplateContext {
  readonly rawId: string;
  readonly range: TextRange;
  readonly argumentLayers: readonly Readonly<{
    range: TextRange;
    arguments: Readonly<Record<string, unknown>>;
  }>[];
}

type MiniMessageConsumerKind = "component" | "text-provider";

interface MiniMessageConsumer {
  readonly range: TextRange;
  readonly kind: MiniMessageConsumerKind;
  readonly section: ParsedSection;
}

interface ConsumerCollector {
  readonly section: ParsedSection;
  readonly uri: string;
  readonly consumers: Map<string, MiniMessageConsumer>;
}

const FUNCTION_TYPE_SET: ReadonlySet<string> = new Set(FUNCTION_TYPES);
const CONDITION_TYPE_SET: ReadonlySet<string> = new Set(CONDITION_TYPES);

function semantic(name: string): string {
  return (name.split("#", 1)[0] ?? name).replaceAll("-", "_");
}

function values(value: unknown): readonly unknown[] {
  return isUnknownArray(value) ? value : [value];
}

function fieldEntry(
  value: Readonly<Record<string, unknown>>,
  wanted: string,
): readonly [key: string, value: unknown] | undefined {
  return Object.entries(value).find(([key]) => semantic(key) === wanted);
}

  // 同一对象要按多个候选名查找时, 只展开一次条目;
  // 候选名按调用方给出的顺序保留优先级, 命中的键名仍取自对象自身
function entriesField(
  entries: readonly (readonly [string, unknown])[],
  wanted: string | readonly string[],
): readonly [string, unknown] | undefined {
  for (const name of typeof wanted === "string" ? [wanted] : wanted)
    for (const entry of entries)
      if (semantic(entry[0]) === name) return entry;
  return undefined;
}

function scalarConsumer(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
  kind: MiniMessageConsumerKind,
): void {
  if (typeof value !== "string") return;
  const range = collector.section.ranges.values.get(path.join("."));
  if (!range) return;
  collector.consumers.set(`${range.start}:${range.end}`, {
    range,
    kind,
    section: collector.section,
  });
}

function scalarConsumerAtRange(
  collector: ConsumerCollector,
  value: unknown,
  range: TextRange,
  kind: MiniMessageConsumerKind,
): void {
  if (typeof value !== "string") return;
  collector.consumers.set(`${range.start}:${range.end}`, {
    range,
    kind,
    section: collector.section,
  });
}

function scalarConsumers(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
  kind: MiniMessageConsumerKind,
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      scalarConsumers(collector, entry, [...path, String(index)], kind),
    );
    return;
  }
  scalarConsumer(collector, value, path, kind);
}

function leafConsumers(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
  kind: MiniMessageConsumerKind,
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      leafConsumers(collector, entry, [...path, String(index)], kind),
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value))
      leafConsumers(collector, entry, [...path, key], kind);
    return;
  }
  scalarConsumer(collector, value, path, kind);
}

function localType(value: unknown, namespace: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const separator = value.indexOf(":");
  if (separator < 0) return value;
  return value.slice(0, separator) === namespace
    ? value.slice(separator + 1)
    : undefined;
}

function collectConditions(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectConditions(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const typeEntry = fieldEntry(value, "type");
  if (!typeEntry) {
    for (const [key, entry] of Object.entries(value))
      collectConditions(collector, entry, [...path, key]);
    return;
  }
  const resolved = resolveFunctionOrConditionType(
    "condition",
    typeof typeEntry[1] === "string" ? typeEntry[1] : undefined,
  );
  if (!resolved || resolved.external || !CONDITION_TYPE_SET.has(resolved.name))
    return;
  switch (resolved.name) {
    case "equals":
    case "string_equals":
    case "string_contains":
      for (const field of ["value1", "value2"]) {
        const entry = fieldEntry(value, field);
        if (entry)
          scalarConsumers(
            collector,
            entry[1],
            [...path, entry[0]],
            "text-provider",
          );
      }
      break;
    case "regex":
      for (const field of ["value", "regex"]) {
        const entry = fieldEntry(value, field);
        if (entry)
          scalarConsumers(
            collector,
            entry[1],
            [...path, entry[0]],
            "text-provider",
          );
      }
      break;
    case "expression":
      for (const field of ["expression", "expr"]) {
        const entry = fieldEntry(value, field);
        if (entry)
          scalarConsumers(
            collector,
            entry[1],
            [...path, entry[0]],
            "text-provider",
          );
      }
      break;
  }
  for (const [key, entry] of Object.entries(value)) {
    const name = semantic(key);
    if (
      name === "terms" ||
      name === "term" ||
      name === "conditions" ||
      name === "condition"
    ) {
      collectConditions(collector, entry, [...path, key]);
    }
  }
}

function collectFunctions(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectFunctions(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const typeEntry = fieldEntry(value, "type");
  if (!typeEntry) {
    for (const [key, entry] of Object.entries(value)) {
      const name = semantic(key);
      if (name === "conditions" || name === "condition")
        collectConditions(collector, entry, [...path, key]);
      else collectFunctions(collector, entry, [...path, key]);
    }
    return;
  }
  const resolved = resolveFunctionOrConditionType(
    "function",
    typeof typeEntry[1] === "string" ? typeEntry[1] : undefined,
  );
  // 已注册类型会接管整个内容, 未知类型不能继续扫描任意字段
  if (!resolved || resolved.external || !FUNCTION_TYPE_SET.has(resolved.name))
    return;
  const entryList = Object.entries(value);
  const collectFields = (
    names: readonly string[],
    kind: MiniMessageConsumerKind,
  ): void => {
    for (const field of names) {
      const entry = entriesField(entryList, field);
      if (entry)
        scalarConsumers(collector, entry[1], [...path, entry[0]], kind);
    }
  };
  switch (resolved.name) {
    case "message":
      collectFields(["messages", "message"], "component");
      break;
    case "actionbar":
      collectFields(["actionbar", "message"], "component");
      break;
    case "title":
      collectFields(["title", "subtitle"], "component");
      break;
    case "open_window":
    case "merchant_trade":
      collectFields(["title"], "component");
      break;
    case "toast":
      collectFields(["toast", "message"], "component");
      break;
  }
  switch (resolved.name) {
    case "command":
      collectFields(["command", "commands"], "text-provider");
      break;
    case "set_cooldown":
    case "set_item_cooldown":
      collectFields(["time"], "text-provider");
      break;
    case "teleport":
      collectFields(["world"], "text-provider");
      break;
    case "set_variable":
      collectFields(["text"], "text-provider");
      break;
    case "when":
      collectFields(["source"], "text-provider");
      break;
    case "mythic_mobs_skill":
    case "cast_mythic_skill":
      collectFields(["skill"], "text-provider");
      break;
    case "spawn_mythic_mob":
      collectFields(["mob", "world"], "text-provider");
      break;
  }
  for (const [key, entry] of Object.entries(value)) {
    switch (semantic(key)) {
      case "conditions":
      case "condition":
        collectConditions(collector, entry, [...path, key]);
        break;
      case "functions":
      case "function":
      case "on_success":
      case "on_failure":
      case "fallback":
      case "rules":
      case "rule":
      case "cases":
      case "case":
        collectFunctions(collector, entry, [...path, key]);
        break;
    }
  }
}

function collectLore(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectLore(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) {
    scalarConsumer(collector, value, path, "component");
    return;
  }
  const content = fieldEntry(value, "content");
  if (content)
    scalarConsumers(collector, content[1], [...path, content[0]], "component");
  const conditions = entriesField(Object.entries(value), [
    "conditions",
    "condition",
  ]);
  if (conditions)
    collectConditions(collector, conditions[1], [...path, conditions[0]]);
}

function collectInsertLore(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) {
    collectLore(collector, value, path);
    return;
  }
  const lore = fieldEntry(value, "lore");
  if (lore) collectLore(collector, lore[1], [...path, lore[0]]);
  const fallback = fieldEntry(value, "fallback");
  if (fallback)
    collectInsertLore(collector, fallback[1], [...path, fallback[0]]);
}

function collectAttributeDisplays(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectAttributeDisplays(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const display = fieldEntry(value, "display");
  if (display && isRecord(display[1])) {
    if (fieldEntry(display[1], "type")?.[1] === "override") {
      const text = fieldEntry(display[1], "value");
      if (text)
        scalarConsumer(
          collector,
          text[1],
          [...path, display[0], text[0]],
          "component",
        );
    }
  }
}

function collectFilterableBookText(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isRecord(value)) {
    for (const name of ["raw", "filtered"]) {
      const selected = fieldEntry(value, name);
      if (selected)
        scalarConsumers(
          collector,
          selected[1],
          [...path, selected[0]],
          "component",
        );
    }
    return;
  }
  scalarConsumers(collector, value, path, "component");
}

function collectItemData(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];
    switch (semantic(key)) {
      case "components":
      case "component":
      case "tags":
      case "nbt":
      case "pdc":
      case "external":
        continue;
      case "display_name":
      case "item_name":
      case "custom_name":
      case "overwritable_item_name":
        scalarConsumer(collector, entry, entryPath, "component");
        break;
      case "lore":
      case "overwritable_lore":
        collectLore(collector, entry, entryPath);
        break;
      case "dynamic_lore":
        if (!isRecord(entry)) break;
        for (const [context, lore] of Object.entries(entry))
          collectLore(collector, lore, [...entryPath, context]);
        break;
      case "insert_lore":
        collectInsertLore(collector, entry, entryPath);
        break;
      case "arguments":
      case "set_arguments":
        if (!isRecord(entry)) break;
        for (const [argument, argumentValue] of Object.entries(entry)) {
          scalarConsumer(
            collector,
            argumentValue,
            [...entryPath, argument],
            "text-provider",
          );
        }
        break;
      case "attribute_modifiers":
      case "attributes":
        collectAttributeDisplays(collector, entry, entryPath);
        break;
      case "profile": {
        if (!isRecord(entry)) break;
        const profileName = fieldEntry(entry, "name");
        if (profileName)
          scalarConsumer(
            collector,
            profileName[1],
            [...entryPath, profileName[0]],
            "text-provider",
          );
        break;
      }
      case "written_book_content": {
        if (!isRecord(entry)) break;
        const title = fieldEntry(entry, "title");
        if (title)
          collectFilterableBookText(collector, title[1], [
            ...entryPath,
            title[0],
          ]);
        const pages = fieldEntry(entry, "pages");
        if (pages)
          values(pages[1]).forEach((page, index) =>
            collectFilterableBookText(collector, page, [
              ...entryPath,
              pages[0],
              ...(isUnknownArray(pages[1]) ? [String(index)] : []),
            ]),
          );
        break;
      }
      case "conditional":
      case "condition": {
        if (!isRecord(entry)) break;
        const conditions =
          fieldEntry(entry, "conditions") ?? fieldEntry(entry, "condition");
        if (conditions)
          collectConditions(collector, conditions[1], [
            ...entryPath,
            conditions[0],
          ]);
        const data = fieldEntry(entry, "data");
        if (data) collectItemData(collector, data[1], [...entryPath, data[0]]);
        break;
      }
      case "functions":
      case "function":
        collectFunctions(collector, entry, entryPath);
        break;
    }
  }
  collectTemplateOverlays(collector, value, path, collectItemData);
}

function collectTemplateOverlays(
  collector: ConsumerCollector,
  value: Readonly<Record<string, unknown>>,
  path: readonly string[],
  collect: (
    collector: ConsumerCollector,
    value: unknown,
    path: readonly string[],
  ) => void,
): void {
  for (const [key, entry] of Object.entries(value)) {
    switch (semantic(key)) {
      case "merges":
      case "overrides":
        collect(collector, entry, [...path, key]);
        break;
    }
  }
}

function collectItem(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];
    switch (semantic(key)) {
      case "data":
      case "client_bound_data":
      case "override_data":
        collectItemData(collector, entry, entryPath);
        break;
      case "events":
      case "event":
        collectFunctions(collector, entry, entryPath);
        break;
      case "updater": {
        if (!isRecord(entry)) break;
        const data = fieldEntry(entry, "data");
        if (data) collectItemData(collector, data[1], [...entryPath, data[0]]);
        break;
      }
      case "settings": {
        if (!isRecord(entry)) break;
        const dropDisplay = fieldEntry(entry, "drop_display");
        if (!dropDisplay) break;
        scalarConsumer(
          collector,
          dropDisplay[1],
          [...entryPath, dropDisplay[0]],
          "component",
        );
        break;
      }
    }
  }
  collectTemplateOverlays(collector, value, path, collectItem);
}

function collectTypedDisplays(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectTypedDisplays(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const type = fieldEntry(value, "type");
  const name = localType(type?.[1], "craftengine");
  if (type && name === undefined) return;
  const text = name === "text_display" ? fieldEntry(value, "text") : undefined;
  if (text) {
    scalarConsumer(collector, text[1], [...path, text[0]], "component");
  }
    // 找到渲染器或元素类型后不要再往里找, 只有外层容器继续
  if (type) return;
  for (const [key, entry] of Object.entries(value)) {
    if (semantic(key) !== "text")
      collectTypedDisplays(collector, entry, [...path, key]);
  }
}

function collectLootNode(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectLootNode(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const type = fieldEntry(value, "type");
  const rawType = typeof type?.[1] === "string" ? type[1] : undefined;
  const local = localType(rawType, "craftengine");
  if (type && local === undefined) return;
  if (local === "apply_data") {
    const data = fieldEntry(value, "data");
    if (data) collectItemData(collector, data[1], [...path, data[0]]);
  }
  const condition =
    rawType === undefined
      ? undefined
      : resolveFunctionOrConditionType("condition", rawType);
  if (
    condition &&
    !condition.external &&
    CONDITION_TYPE_SET.has(condition.name)
  ) {
    collectConditions(collector, value, path);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    switch (semantic(key)) {
      case "conditions":
      case "condition":
        collectConditions(collector, entry, [...path, key]);
        break;
      case "data":
      case "components":
      case "component":
      case "tags":
      case "nbt":
      case "pdc":
      case "external":
        break;
      default:
        collectLootNode(collector, entry, [...path, key]);
    }
  }
}

function collectTypedBehaviors(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
  storageType: "simple_storage_block" | "simple_storage_furniture",
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectTypedBehaviors(
        collector,
        entry,
        [...path, String(index)],
        storageType,
      ),
    );
    return;
  }
  if (!isRecord(value)) return;
  const type = fieldEntry(value, "type");
  const name = localType(type?.[1], "craftengine");
  if (type && name === undefined) return;
  if (name === storageType) {
    const title = fieldEntry(value, "title");
    if (title)
      scalarConsumer(collector, title[1], [...path, title[0]], "component");
  }
}

function collectBlock(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];
    switch (semantic(key)) {
      case "events":
      case "event":
        collectFunctions(collector, entry, entryPath);
        break;
      case "behaviors":
      case "behavior":
        collectTypedBehaviors(
          collector,
          entry,
          entryPath,
          "simple_storage_block",
        );
        break;
      case "states":
      case "state":
      case "appearances":
      case "appearance":
        collectTypedDisplays(collector, entry, entryPath);
        break;
      case "loot":
      case "loots":
        collectLootNode(collector, entry, entryPath);
        break;
    }
  }
  collectTemplateOverlays(collector, value, path, collectBlock);
}

function collectFurniture(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];
    switch (semantic(key)) {
      case "events":
      case "event":
        collectFunctions(collector, entry, entryPath);
        break;
      case "behaviors":
      case "behavior":
        collectTypedBehaviors(
          collector,
          entry,
          entryPath,
          "simple_storage_furniture",
        );
        break;
      case "variants":
      case "variant":
      case "placement":
        collectTypedDisplays(collector, entry, entryPath);
        break;
      case "loot":
      case "loots":
        collectLootNode(collector, entry, entryPath);
        break;
    }
  }
  collectTemplateOverlays(collector, value, path, collectFurniture);
}

function collectRecipeProcessors(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectRecipeProcessors(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  const type = fieldEntry(value, "type");
  const typeName = typeof type?.[1] === "string" ? type[1] : undefined;
  const resultKind = resolveRecipeDiscriminator(
    "result-post-processor",
    typeName,
  );
  const transformKind = resolveRecipeDiscriminator(
    "transform-processor",
    typeName,
  );
  const resolved = resultKind.kind === "known" ? resultKind : transformKind;
  if (
    resolved.kind === "external" ||
    resolved.kind === "owned-unknown" ||
    resolved.kind === "invalid"
  )
    return;
  if (resolved.kind === "known" && resolved.name === "apply_data") {
    const data = fieldEntry(value, "data");
    if (data) collectItemData(collector, data[1], [...path, data[0]]);
  }
}

function collectRecipe(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (!isRecord(value)) return;
  const type = fieldEntry(value, "type");
  const resolution = resolveRecipeDiscriminator(
    "recipe",
    typeof type?.[1] === "string" ? type[1] : undefined,
  );
  if (
    resolution.kind === "external" ||
    resolution.kind === "owned-unknown" ||
    resolution.kind === "invalid"
  )
    return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = [...path, key];
    switch (semantic(key)) {
      case "conditions":
      case "condition":
        collectConditions(collector, entry, entryPath);
        break;
      case "functions":
      case "function":
        collectFunctions(collector, entry, entryPath);
        break;
      case "transform_processors":
      case "post_processors":
        collectRecipeProcessors(collector, entry, entryPath);
        break;
      case "result":
      case "visual_result": {
        if (!isRecord(entry)) break;
        const processors =
          fieldEntry(entry, "post_processors") ??
          fieldEntry(entry, "transform_processors");
        if (processors)
          collectRecipeProcessors(collector, processors[1], [
            ...entryPath,
            processors[0],
          ]);
        break;
      }
    }
  }
  collectTemplateOverlays(collector, value, path, collectRecipe);
}

function collectIdEntries(
  collector: ConsumerCollector,
  value: unknown,
  collect: (
    collector: ConsumerCollector,
    value: unknown,
    path: readonly string[],
  ) => void,
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value))
    collect(collector, entry, [id]);
}

function collectMiscIdText(
  collector: ConsumerCollector,
  value: unknown,
  fields: ReadonlySet<string>,
  dynamicMappings: ReadonlySet<string> = new Set(),
  prefix: readonly string[] = [],
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    const entryPath = [...prefix, id];
    for (const [key, fieldValue] of Object.entries(entry)) {
      const name = semantic(key);
      if (fields.has(name))
        scalarConsumers(
          collector,
          fieldValue,
          [...entryPath, key],
          "component",
        );
      else if (dynamicMappings.has(name))
        leafConsumers(collector, fieldValue, [...entryPath, key], "component");
    }
    collectTemplateOverlays(
      collector,
      entry,
      entryPath,
      (nextCollector, overlay, overlayPath) => {
        if (isRecord(overlay)) {
          for (const [overlayKey, overlayValue] of Object.entries(overlay)) {
            const name = semantic(overlayKey);
            if (fields.has(name))
              scalarConsumers(
                nextCollector,
                overlayValue,
                [...overlayPath, overlayKey],
                "component",
              );
            else if (dynamicMappings.has(name))
              leafConsumers(
                nextCollector,
                overlayValue,
                [...overlayPath, overlayKey],
                "component",
              );
          }
        }
      },
    );
  }
}

function collectFactoryBlueprint(
  collector: ConsumerCollector,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  const blueprint = entriesField(Object.entries(value), [
    "blueprint",
    "prototype",
    "schema",
  ]);
  if (!blueprint || !isRecord(blueprint[1])) return;
  for (const [sectionKey, sectionValue] of Object.entries(blueprint[1])) {
    collectSectionValue(
      collector,
      normalizeSectionType(sectionKey.split("#", 1)[0] ?? sectionKey),
      sectionValue,
      [blueprint[0], sectionKey],
    );
  }
}

function collectTemplateBlueprint(
  collector: ConsumerCollector,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
  // 模板没有固定类型, 只查看确定会显示文字的位置
    collectItem(collector, entry, [id]);
    collectBlock(collector, entry, [id]);
    collectFurniture(collector, entry, [id]);
  }
}

function collectGlobalVariables(
  collector: ConsumerCollector,
  value: unknown,
  prefix: readonly string[] = [],
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
    const path = [...prefix, id];
    // 同一对象要分三次查找, 展开一次后复用
    const entryList = Object.entries(isRecord(entry) ? entry : {});
    if (
      !isRecord(entry) ||
      (!entriesField(entryList, "template") &&
        !entriesField(entryList, "templates"))
    ) {
      leafConsumers(collector, entry, path, "component");
      continue;
    }
    const direct = entriesField(entryList, "value");
    if (direct)
      leafConsumers(collector, direct[1], [...path, direct[0]], "component");
    collectTemplateOverlays(
      collector,
      entry,
      path,
      (nextCollector, overlay, overlayPath) => {
        if (!isRecord(overlay)) return;
        const valueEntry = fieldEntry(overlay, "value");
        if (valueEntry)
          leafConsumers(
            nextCollector,
            valueEntry[1],
            [...overlayPath, valueEntry[0]],
            "component",
          );
      },
    );
  }
}

function collectExpressionValue(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[],
): void {
  if (typeof value === "string") {
    scalarConsumer(collector, value, path, "text-provider");
    return;
  }
  if (!isRecord(value)) return;
  const expression = fieldEntry(value, "expression");
  if (expression)
    scalarConsumer(
      collector,
      expression[1],
      [...path, expression[0]],
      "text-provider",
    );
}

function collectAttributes(
  collector: ConsumerCollector,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    for (const name of ["derived", "base"] as const) {
      const selected = fieldEntry(entry, name);
      if (!selected) continue;
      if (name === "derived")
        collectExpressionValue(collector, selected[1], [id, selected[0]]);
      else if (isRecord(selected[1])) {
        const transform = fieldEntry(selected[1], "transform");
        if (transform)
          collectExpressionValue(collector, transform[1], [
            id,
            selected[0],
            transform[0],
          ]);
      }
    }
    const sync = fieldEntry(entry, "sync");
    if (sync)
      (isUnknownArray(sync[1]) ? sync[1] : [sync[1]]).forEach(
        (target, index) => {
          if (!isRecord(target)) return;
          const provider = fieldEntry(target, "value");
          if (provider)
            collectExpressionValue(collector, provider[1], [
              id,
              sync[0],
              ...(isUnknownArray(sync[1]) ? [String(index)] : []),
              provider[0],
            ]);
        },
      );
  }
}

function collectAttributeOperations(
  collector: ConsumerCollector,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    const expression = fieldEntry(entry, "expression");
    if (expression)
      scalarConsumer(
        collector,
        expression[1],
        [id, expression[0]],
        "text-provider",
      );
  }
}

function collectEquipmentSets(
  collector: ConsumerCollector,
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry) || !isRecord(entry.pieces)) continue;
    for (const [pieces, tier] of Object.entries(entry.pieces)) {
      if (!isRecord(tier)) continue;
      for (const name of ["attribute", "potion_effect", "potion_effects"])
        for (const [index, modifier] of values(tier[name]).entries()) {
          if (!isRecord(modifier)) continue;
          // 每个档位都按这两个名字查一次, 展开一次后复用
          const condition = entriesField(Object.entries(modifier), [
            "condition",
            "conditions",
          ]);
          if (condition)
            collectConditions(collector, condition[1], [
              id,
              "pieces",
              pieces,
              name,
              ...(isUnknownArray(tier[name]) ? [String(index)] : []),
              condition[0],
            ]);
        }
      if (!isRecord(tier.events)) continue;
      for (const event of ["activate", "deactivate"])
        if (tier.events[event] !== undefined)
          collectFunctions(collector, tier.events[event], [
            id,
            "pieces",
            pieces,
            "events",
            event,
          ]);
    }
  }
}

function collectDamageRules(
  collector: ConsumerCollector,
  value: unknown,
  path: readonly string[] = [],
): void {
  if (typeof value === "string" && path.includes("parts")) {
    scalarConsumer(collector, value, path, "text-provider");
    return;
  }
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      collectDamageRules(collector, entry, [...path, String(index)]),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const child = [...path, key];
    switch (semantic(key)) {
      case "formula":
        collectExpressionValue(collector, entry, child);
        collectDamageRules(collector, entry, child);
        break;
      case "condition":
      case "conditions":
        collectConditions(collector, entry, child);
        break;
      case "function":
      case "functions":
        collectFunctions(collector, entry, child);
        break;
      default:
        collectDamageRules(collector, entry, child);
    }
  }
}

function collectSectionValue(
  collector: ConsumerCollector,
  type: ReturnType<typeof normalizeSectionType>,
  value: unknown,
  prefix: readonly string[] = [],
): void {
  if (!type) return;
  switch (type) {
    case "items":
      if (prefix.length === 0) collectIdEntries(collector, value, collectItem);
      else if (isRecord(value))
        for (const [id, entry] of Object.entries(value))
          collectItem(collector, entry, [...prefix, id]);
      return;
    case "blocks":
      if (prefix.length === 0) collectIdEntries(collector, value, collectBlock);
      else if (isRecord(value))
        for (const [id, entry] of Object.entries(value))
          collectBlock(collector, entry, [...prefix, id]);
      return;
    case "furniture":
      if (prefix.length === 0)
        collectIdEntries(collector, value, collectFurniture);
      else if (isRecord(value))
        for (const [id, entry] of Object.entries(value))
          collectFurniture(collector, entry, [...prefix, id]);
      return;
    case "recipes":
      if (prefix.length === 0)
        collectIdEntries(collector, value, collectRecipe);
      else if (isRecord(value))
        for (const [id, entry] of Object.entries(value))
          collectRecipe(collector, entry, [...prefix, id]);
      return;
    case "categories":
      collectMiscIdText(
        collector,
        value,
        new Set(["name", "lore"]),
        new Set(),
        prefix,
      );
      return;
    case "emojis":
      collectMiscIdText(
        collector,
        value,
        new Set(["content", "format"]),
        new Set(["content_overrides"]),
        prefix,
      );
      return;
    case "paintings":
      collectMiscIdText(
        collector,
        value,
        new Set(["title", "author"]),
        new Set(),
        prefix,
      );
      return;
    case "jukebox-songs":
      collectMiscIdText(
        collector,
        value,
        new Set(["description"]),
        new Set(),
        prefix,
      );
      return;
    case "loot":
    case "loot-sources":
      if (isRecord(value))
        for (const [id, entry] of Object.entries(value))
          collectLootNode(collector, entry, [...prefix, id]);
      return;
    case "global-variables":
      collectGlobalVariables(collector, value, prefix);
      return;
    case "attributes":
      collectAttributes(collector, value);
      return;
    case "attribute-operations":
      collectAttributeOperations(collector, value);
      return;
    case "equipment-sets":
      collectEquipmentSets(collector, value);
      return;
    case "damage-rules":
      collectDamageRules(collector, value, prefix);
      return;
    case "translations":
    case "lang":
      leafConsumers(collector, value, prefix, "component");
      return;
    case "templates":
      collectTemplateBlueprint(collector, value);
      return;
    case "config-factory":
      collectFactoryBlueprint(collector, value);
      return;
  }
}

function collectConfigFileText(collector: ConsumerCollector): void {
  const fileName = collector.uri.split(/[\\/]/u).at(-1)?.toLowerCase();
  if (fileName !== "config.yml" && fileName !== "config.yaml") return;
  const section = collector.section;
  const visit = (value: unknown, path: readonly string[]): void => {
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      const child = [...path, key];
      const normalized = child.map(semantic).join(".");
      if (
        normalized === "resource_pack.description" ||
        normalized === "resource_pack.delivery.prompt" ||
        normalized === "item.default_drop_display.format" ||
        (normalized.startsWith("gui.browser.") && semantic(key) === "title")
      )
        scalarConsumer(collector, entry, child.slice(1), "component");
      else visit(entry, child);
    }
  };
  visit({ [section.key]: section.value }, []);
}

function collectStandaloneText(collector: ConsumerCollector): void {
  const standalone = standaloneFileInfo(collector.uri);
  if (!standalone) return;
  const section = collector.section;
  if (standalone.kind === "pack") {
    if (semantic(section.key) === "description") {
      scalarConsumerAtRange(
        collector,
        section.value,
        section.valueRange,
        "component",
      );
    }
    return;
  }
  if (
    standalone.kind !== "translation" ||
    semantic(section.key) === "lang_version"
  )
    return;
  if (isUnknownArray(section.value)) {
    section.value.forEach((entry, index) =>
      leafConsumers(collector, entry, ["", String(index)], "component"),
    );
    return;
  }
  if (isRecord(section.value)) {
    leafConsumers(collector, section.value, [], "component");
    return;
  }
  scalarConsumerAtRange(
    collector,
    section.value,
    section.valueRange,
    "component",
  );
}

function miniMessageConsumers(
  parsed: ParsedYamlFile,
): readonly MiniMessageConsumer[] {
  const consumers = new Map<string, MiniMessageConsumer>();
  for (const section of parsed.sections) {
    const collector: ConsumerCollector = {
      section,
      uri: parsed.uri,
      consumers,
    };
    collectSectionValue(
      collector,
      normalizeSectionType(section.type),
      section.value,
    );
    collectConfigFileText(collector);
    collectStandaloneText(collector);
  }
  return [...consumers.values()].sort(
    (left, right) => left.range.start - right.range.start,
  );
}

function entryContexts(
  section: ParsedSection,
): readonly EntryTemplateContext[] {
  switch (section.type) {
    case "templates":
    case "template":
    case "config-factory":
    case "config_factory":
    case "config-factories":
    case "config_factories":
    case "lang":
    case "language":
    case "languages":
    case "translations":
    case "translation":
    case "l10n":
    case "localization":
    case "i18n":
    case "internationalization":
    case "block-state-mappings":
    case "block-state-mapping":
    case "block_state_mappings":
    case "block_state_mapping":
    case "skip-optimization":
    case "skip_optimization":
      return [];
  }
  const family = getSectionFamily(section.type);
  if (!family || family.kind === "section" || !isRecord(section.value)) {
    return [];
  }
  return Object.entries(section.value).flatMap(([rawId, value]) => {
    const range = section.ranges.values.get(rawId);
    if (!range) return [];
    const argumentLayers: Array<{
      range: TextRange;
      arguments: Readonly<Record<string, unknown>>;
    }> = [];
    const collectLayers = (current: unknown, path: string): void => {
      if (isUnknownArray(current)) {
        current.forEach((child, index) =>
          collectLayers(child, `${path}.${index}`),
        );
        return;
      }
      if (!isRecord(current)) return;
      const currentRange = section.ranges.values.get(path);
      if (
        (Object.hasOwn(current, "template") ||
          Object.hasOwn(current, "templates")) &&
        isRecord(current.arguments) &&
        currentRange
      ) {
        argumentLayers.push({
          range: currentRange,
          arguments: current.arguments,
        });
      }
      for (const [key, child] of Object.entries(current))
        collectLayers(child, `${path}.${key}`);
    };
    collectLayers(value, rawId);
    return [
      {
        rawId,
        range,
        argumentLayers,
      },
    ];
  });
}

function argumentsForRange(
  context: EntryTemplateContext,
  range: TextRange,
): Readonly<Record<string, unknown>> | undefined {
  const result: Record<string, unknown> = {};
  for (const layer of context.argumentLayers
    .filter(
      (layer) =>
        range.start >= layer.range.start && range.end <= layer.range.end,
    )
    .sort(
      (left, right) =>
        right.range.end -
        right.range.start -
        (left.range.end - left.range.start),
    )) {
    for (const [name, value] of Object.entries(layer.arguments)) {
  // 参数重名时保留外层参数
      if (!Object.hasOwn(result, name)) result[name] = value;
    }
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

function sourceRange(
  range: TextRange,
  resolution: ResolvedTemplateString,
  baseOffset: number,
): TextRange {
  const sourceMap = resolution.sourceMap;
  if (sourceMap.length === 0) return { start: baseOffset, end: baseOffset };
  if (range.end <= range.start) {
    const point =
      range.start < sourceMap.length
        ? sourceMap[Math.min(range.start, sourceMap.length - 1)]?.start
        : sourceMap[
            Math.min(Math.max(0, range.start - 1), sourceMap.length - 1)
          ]?.end;
    return {
      start: baseOffset + (point ?? 0),
      end: baseOffset + (point ?? 0),
    };
  }
  const first = sourceMap[Math.min(range.start, sourceMap.length - 1)];
  return {
    start: baseOffset + (first?.start ?? 0),
    end:
      baseOffset +
      (sourceMap[Math.min(range.end - 1, sourceMap.length - 1)]?.end ??
        first?.end ??
        0),
  };
}

function scanResolvedMiniMessage(
  source: string,
  baseOffset: number,
  context: EntryTemplateContext,
  sourceValueRange: TextRange,
  defaultNamespace: string,
): MiniMessageScanResult {
  const resolution = resolveTemplateStringForEntry(
    source,
    context.rawId,
    defaultNamespace,
    argumentsForRange(context, sourceValueRange),
  );
  const scan = scanMiniMessage(resolution.value);

  return {
    tags: scan.tags.map(
      (tag): MiniMessageTag => ({
        ...tag,
        range: sourceRange(tag.range, resolution, baseOffset),
        nameRange: sourceRange(tag.nameRange, resolution, baseOffset),
        arguments: tag.arguments.map(
          (argument): MiniMessageArgument => ({
            ...argument,
            range: sourceRange(argument.range, resolution, baseOffset),
          }),
        ),
      }),
    ),
    references: scan.references.map(
      (reference): MiniMessageReference => ({
        ...reference,
        range: sourceRange(reference.range, resolution, baseOffset),
        tagRange: sourceRange(reference.tagRange, resolution, baseOffset),
      }),
    ),
    issues: [
      ...scan.issues.map(
        (issue): MiniMessageIssue => ({
          ...issue,
          range: sourceRange(issue.range, resolution, baseOffset),
        }),
      ),
      ...resolution.unresolved.map(
        (variable): MiniMessageIssue => ({
          code: "unresolved-template-variable",
          message: Messages.src.config.text.miniMessageScanner.text0001(
            variable.name,
          ),
          severity: "warning",
          range: {
            start: baseOffset + variable.range.start,
            end: baseOffset + variable.range.end,
          },
        }),
      ),
    ].sort((left, right) => left.range.start - right.range.start),
  };
}

export function scanMiniMessageDocument(
  parsed: ParsedYamlFile,
  options: MiniMessageDocumentScanOptions = {},
): readonly MiniMessageOccurrence[] {
  const result: MiniMessageOccurrence[] = [];
  const contexts = new Map<ParsedSection, readonly EntryTemplateContext[]>();

  for (const consumer of miniMessageConsumers(parsed)) {
    const { range } = consumer;
    const raw = parsed.text.slice(range.start, range.end);
    if (!raw.includes("<") || typeof parseLooseScalar(raw) !== "string")
      continue;
    const quote = raw[0];
    const quoted =
      raw.length >= 2 &&
      (quote === "'" || quote === '"') &&
      raw.at(-1) === quote;
    const scanText = quoted ? raw.slice(1, -1) : raw;
  // 内容同时出现左右尖括号时, 才把它当成 MiniMessage
    if (consumer.kind === "text-provider" && !scanText.includes(">")) continue;

    const baseOffset = range.start + (quoted ? 1 : 0);
    const sectionContexts =
      contexts.get(consumer.section) ?? entryContexts(consumer.section);
    contexts.set(consumer.section, sectionContexts);
    const context = sectionContexts.find(
      (entry) =>
        range.start >= entry.range.start && range.end <= entry.range.end,
    );
    const defaultNamespace =
      options.defaultNamespace ??
      (context?.rawId.includes(":")
        ? context.rawId.split(":", 1)[0]
        : undefined);
    const scan =
      context && defaultNamespace
        ? scanResolvedMiniMessage(
            scanText,
            baseOffset,
            context,
            range,
            defaultNamespace,
          )
        : scanMiniMessage(scanText, baseOffset);
    if (scan.tags.length === 0 && scan.issues.length === 0) continue;

    result.push({ range, raw, scan });
  }
  return result.sort((left, right) => left.range.start - right.range.start);
}
