import type { TextRange } from "../../diagnostics/model.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { appendPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import { localRegistryDiscriminator } from "../registry/discriminators.js";
import type { SoundDataReference } from "./model.js";

function normalizeSoundDataId(value: string): string {
  return makeIdentifier(value.replaceAll("\\", "/").toLowerCase(), "minecraft");
}

interface SoundDefaults {
  readonly volume: unknown;
  readonly pitch: unknown;
}

interface SoundReferenceCollector {
  readonly source: ConfigurationSource;
  readonly result: SoundDataReference[];
}

const DEFAULT_SOUND: SoundDefaults = { volume: 1, pitch: 1 };
function selectedField(
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): readonly [name: string, value: unknown] | undefined {
  for (const name of names) {
    if (
      Object.hasOwn(value, name) &&
      value[name] !== null &&
      value[name] !== undefined
    )
      return [name, value[name]];
  }
  return undefined;
}

function sectionKey(value: string): string {
  const marker = value.indexOf("#");
  return value.slice(0, marker < 0 ? value.length : marker);
}

function exactValueRange(
  source: ConfigurationSource,
  pathName: string,
  fallbackPath?: string,
): TextRange {
  const direct =
    source.fieldValueRanges.get(pathName) ??
    source.fieldKeyRanges.get(pathName);
  if (direct) return direct;
  if (fallbackPath !== undefined) {
    const fallback =
      source.fieldValueRanges.get(fallbackPath) ??
      source.fieldKeyRanges.get(fallbackPath);
    if (fallback) return fallback;
  }
  return source.entryRange;
}

function pushScalarReference(
  collector: SoundReferenceCollector,
  value: string,
  pathName: string,
  defaults: SoundDefaults = DEFAULT_SOUND,
  volume = defaults.volume,
  pitch = defaults.pitch,
  volumePath?: string,
  pitchPath?: string,
): void {
  const valueRange = exactValueRange(collector.source, pathName);
  collector.result.push({
    eventId: normalizeSoundDataId(value),
    path: pathName,
    volume,
    pitch,
    source: collector.source,
    range: valueRange,
    idRange: valueRange,
    volumeRange:
      volumePath === undefined
        ? valueRange
        : exactValueRange(collector.source, volumePath, pathName),
    pitchRange:
      pitchPath === undefined
        ? valueRange
        : exactValueRange(collector.source, pitchPath, pathName),
  });
}

function collectSoundData(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
  defaults: SoundDefaults = DEFAULT_SOUND,
): void {
  if (typeof value === "string") {
    pushScalarReference(collector, value, pathName, defaults);
    return;
  }
  if (!isRecord(value) || typeof value.id !== "string") return;
  const idPath = appendPath(pathName, "id");
  const containerRange = exactValueRange(collector.source, pathName);
  const volumePath = appendPath(pathName, "volume");
  const pitchPath = appendPath(pathName, "pitch");
  collector.result.push({
    eventId: normalizeSoundDataId(value.id),
    path: pathName,
    volume: value.volume ?? defaults.volume,
    pitch: value.pitch ?? defaults.pitch,
    source: collector.source,
    range: containerRange,
    idRange: exactValueRange(collector.source, idPath, pathName),
    volumeRange:
      value.volume === undefined
        ? containerRange
        : exactValueRange(collector.source, volumePath, pathName),
    pitchRange:
      value.pitch === undefined
        ? containerRange
        : exactValueRange(collector.source, pitchPath, pathName),
  });
}

function collectComponentSound(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (typeof value === "string") {
    pushScalarReference(collector, value, pathName);
    return;
  }
  if (!isRecord(value)) return;
  const selected = selectedField(value, ["sound_id", "sound-id"]);
  if (!selected || typeof selected[1] !== "string") return;
  const idPath = appendPath(pathName, selected[0]);
  const idRange = exactValueRange(collector.source, idPath, pathName);
  collector.result.push({
    eventId: normalizeSoundDataId(selected[1]),
    path: pathName,
    volume: 1,
    pitch: 1,
    source: collector.source,
    range: exactValueRange(collector.source, pathName),
    idRange,
    volumeRange: idRange,
    pitchRange: idRange,
  });
}

function collectSoundChannels(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
  channels: Readonly<Record<string, SoundDefaults>>,
): void {
  if (!isRecord(value)) return;
  for (const [channel, defaults] of Object.entries(channels))
    if (Object.hasOwn(value, channel)) {
      collectSoundData(
        collector,
        value[channel],
        appendPath(pathName, channel),
        defaults,
      );
    }
}

function collectItemData(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (!isRecord(value)) return;
  for (const [rawProcessor, processorValue] of Object.entries(value)) {
    const processor = localRegistryDiscriminator(
      sectionKey(rawProcessor).replaceAll("-", "_"),
      "craftengine",
    );
    const processorPath = appendPath(pathName, rawProcessor);
    if (!isRecord(processorValue)) continue;

    switch (processor) {
      case "equippable":
        for (const names of [
          ["equip_sound", "equip-sound"],
          ["shearing_sound", "shearing-sound"],
        ] as const) {
          const selected = selectedField(processorValue, names);
          if (selected)
            collectComponentSound(
              collector,
              selected[1],
              appendPath(processorPath, selected[0]),
            );
        }
        break;
      case "conditional":
      case "condition":
        collectItemData(
          collector,
          processorValue.data,
          appendPath(processorPath, "data"),
        );
        break;
    }
  // 不再读取 tags nbt pdc 和原始组件, 里面的 sound 不是这里要找的声音配置
  }
}

function collectItemUpdater(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (!isRecord(value)) return;
  for (const [version, rawOperations] of Object.entries(value)) {
    if (!/^[+-]?\d+$/u.test(version)) continue;
    const operations = isUnknownArray(rawOperations)
      ? rawOperations
      : [rawOperations];
    operations.forEach((operation, index) => {
      if (!isRecord(operation) || typeof operation.type !== "string") return;
      if (
        localRegistryDiscriminator(operation.type, "craftengine") !==
        "apply_data"
      )
        return;
      collectItemData(
        collector,
        operation.data,
        appendPath(
          isUnknownArray(rawOperations)
            ? appendPath(appendPath(pathName, version), index)
            : appendPath(pathName, version),
          "data",
        ),
      );
    });
  }
}

function collectTargetSound(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (!isRecord(value) || !Object.hasOwn(value, "default")) {
    collectSoundData(collector, value, pathName);
    return;
  }
  collectSoundData(collector, value.default, appendPath(pathName, "default"));
  if (!isRecord(value.overrides)) return;
  for (const [target, sound] of Object.entries(value.overrides)) {
    collectSoundData(
      collector,
      sound,
      appendPath(appendPath(pathName, "overrides"), target),
    );
  }
}

function collectProjectileSounds(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (!isRecord(value)) return;
  if (Object.hasOwn(value, "throw"))
    collectSoundData(collector, value.throw, appendPath(pathName, "throw"));
  for (const names of [
    ["hit_entity", "hit-entity"],
    ["hit_block", "hit-block"],
  ] as const) {
    const selected = selectedField(value, names);
    if (selected)
      collectTargetSound(
        collector,
        selected[1],
        appendPath(pathName, selected[0]),
      );
  }
}

function collectFunctionSound(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  if (typeof value.sound !== "string") return;
  const soundPath = appendPath(pathName, "sound");
  const volumePath = appendPath(pathName, "volume");
  const pitchPath = appendPath(pathName, "pitch");
  pushScalarReference(
    collector,
    value.sound,
    soundPath,
    DEFAULT_SOUND,
    value.volume ?? 1,
    value.pitch ?? 1,
    value.volume === undefined ? undefined : volumePath,
    value.pitch === undefined ? undefined : pitchPath,
  );
}

function collectFunctionRules(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  (isUnknownArray(value) ? value : [value]).forEach((rule, index) => {
    if (!isRecord(rule)) return;
    collectFunctions(
      collector,
      rule.functions,
      appendPath(
        isUnknownArray(value) ? appendPath(pathName, index) : pathName,
        "functions",
      ),
    );
  });
}

function collectFunctionCases(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  (isUnknownArray(value) ? value : [value]).forEach((entry, index) => {
    if (!isRecord(entry)) return;
    collectFunctions(
      collector,
      entry.functions,
      appendPath(
        isUnknownArray(value) ? appendPath(pathName, index) : pathName,
        "functions",
      ),
    );
  });
}

function collectFunctions(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  (isUnknownArray(value) ? value : [value]).forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.type !== "string") return;
    const type = localRegistryDiscriminator(entry.type, "craftengine");
    if (type === undefined) return;
    const functionPath = isUnknownArray(value)
      ? appendPath(pathName, index)
      : pathName;
    switch (type) {
      case "play_sound":
      case "play_totem_animation":
        collectFunctionSound(collector, entry, functionPath);
        return;
      case "run":
        collectFunctions(
          collector,
          entry.functions,
          appendPath(functionPath, "functions"),
        );
        return;
      case "rotate_furniture":
        for (const names of [
          ["on_success", "on-success"],
          ["on_failure", "on-failure"],
        ] as const) {
          const selected = selectedField(entry, names);
          if (selected)
            collectFunctions(
              collector,
              selected[1],
              appendPath(functionPath, selected[0]),
            );
        }
        return;
      case "if_else":
      case "alternatives": {
        const selected = selectedField(entry, ["rules", "rule"]);
        if (selected)
          collectFunctionRules(
            collector,
            selected[1],
            appendPath(functionPath, selected[0]),
          );
        return;
      }
      case "when": {
        const selected = selectedField(entry, ["cases", "case"]);
        if (selected)
          collectFunctionCases(
            collector,
            selected[1],
            appendPath(functionPath, selected[0]),
          );
        collectFunctions(
          collector,
          entry.fallback,
          appendPath(functionPath, "fallback"),
        );
        return;
      }
      case "drop_loot": {
        const selected = selectedField(entry, ["loot", "loots"]);
        if (selected && isRecord(selected[1])) {
          collectLootTable(
            collector,
            selected[1],
            appendPath(functionPath, selected[0]),
          );
        }
        return;
      }
      default:
        return;
    }
  });
}

// CE 的触发器不是任意字符串: CommonFunctions.parseEvents 逐个用 EventTriggerResolver 解析
// (CommonFunctions.java:109-140), 解析不到就抛 PARSE_ENUM_FAILED 且不解析它的函数。
// 可用触发器是 EventTrigger 注册的名字与别名(EventTrigger.java:16-27), 查找前整体转小写
// (EventTrigger.java:81-101); block/furniture/item 各自再把 break 映射成对应的 *_break
// (AbstractBlockManager.java:61、AbstractFurnitureManager.java:41、AbstractItemManager.java:49)。
const EVENT_TRIGGERS = new Set([
  "left_click",
  "right_click",
  "use_on",
  "use",
  "use_item_on",
  "attack",
  "hit",
  "consume",
  "eat",
  "drink",
  "block_break",
  "dig",
  "item_break",
  "furniture_break",
  "place",
  "build",
  "pick_up",
  "pick",
  "step",
  "fall",
  "shoot",
  "break",
]);

// 和采集函数类型一样, 扩展插件注册的触发器在这里分辨不了, 一律跳过
function isEventTrigger(value: string): boolean {
  return EVENT_TRIGGERS.has(
    localRegistryDiscriminator(value.toLowerCase(), "craftengine") ?? "",
  );
}

function collectEvents(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  const selected = selectedField(value, ["event", "events"]);
  if (!selected) return;
  const eventsPath = appendPath(pathName, selected[0]);
  if (isRecord(selected[1])) {
    for (const [trigger, functions] of Object.entries(selected[1])) {
      if (!isEventTrigger(trigger)) continue;
      collectFunctions(collector, functions, appendPath(eventsPath, trigger));
    }
    return;
  }
  if (!isUnknownArray(selected[1])) return;
  selected[1].forEach((event, index) => {
    if (!isRecord(event)) return;
    if (
      !(isUnknownArray(event.on) ? event.on : [event.on]).some(
        (trigger) => typeof trigger === "string" && isEventTrigger(trigger),
      )
    )
      return;
    const eventPath = appendPath(eventsPath, index);
    if (typeof event.type === "string")
      collectFunctions(collector, event, eventPath);
    else
      collectFunctions(
        collector,
        event.functions,
        appendPath(eventPath, "functions"),
      );
  });
}

function collectBlockBehaviors(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  const selected = selectedField(value, ["behavior", "behaviors"]);
  if (!selected) return;
  const basePath = appendPath(pathName, selected[0]);
  (isUnknownArray(selected[1]) ? selected[1] : [selected[1]]).forEach(
    (behavior, index) => {
      if (!isRecord(behavior) || typeof behavior.type !== "string") return;
      const type = localRegistryDiscriminator(behavior.type, "craftengine");
      let channels: readonly string[];
      switch (type) {
        case "button_block":
        case "pressure_plate_block":
          channels = ["on", "off"];
          break;
        case "door_block":
        case "trapdoor_block":
        case "fence_gate_block":
        case "simple_storage_block":
          channels = ["open", "close"];
          break;
        case "falling_block":
          channels = ["land", "destroy"];
          break;
        case "chime_block":
          channels = ["chime", "projectile_hit", "projectile-hit"];
          break;
        case "display_item_block":
        case "drawer_block":
          channels = ["put", "take"];
          break;
        case "item_frame_block":
          channels = ["put", "take", "rotate"];
          break;
        default:
          return;
      }
      if (!isRecord(behavior.sounds)) return;
      const sounds = behavior.sounds;
      const behaviorPath = isUnknownArray(selected[1])
        ? appendPath(basePath, index)
        : basePath;
      const defaults =
        type === "simple_storage_block"
          ? { volume: 0.5, pitch: "0.9~1.0" }
          : { volume: 1, pitch: "0.9~1.0" };
      const soundPath = appendPath(behaviorPath, "sounds");
      if (type === "chime_block") {
        const channel = channels.find((candidate) =>
          Object.hasOwn(sounds, candidate),
        );
        if (channel !== undefined)
          collectSoundData(
            collector,
            sounds[channel],
            appendPath(soundPath, channel),
            defaults,
          );
        return;
      }
      for (const channel of channels)
        if (Object.hasOwn(sounds, channel)) {
          collectSoundData(
            collector,
            sounds[channel],
            appendPath(soundPath, channel),
            defaults,
          );
        }
    },
  );
}

function collectFurnitureBehaviors(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  const selected = selectedField(value, ["behavior", "behaviors"]);
  if (!selected) return;
  const basePath = appendPath(pathName, selected[0]);
  (isUnknownArray(selected[1]) ? selected[1] : [selected[1]]).forEach(
    (behavior, index) => {
      if (!isRecord(behavior) || typeof behavior.type !== "string") return;
      const type = localRegistryDiscriminator(behavior.type, "craftengine");
      let channels: readonly string[];
      switch (type) {
        case "simple_storage_furniture":
          channels = ["open", "close"];
          break;
        case "display_item_furniture":
          channels = ["put", "take"];
          break;
        default:
          return;
      }
      if (!isRecord(behavior.sounds)) return;
      const behaviorPath = isUnknownArray(selected[1])
        ? appendPath(basePath, index)
        : basePath;
      const soundPath = appendPath(behaviorPath, "sounds");
      for (const channel of channels)
        if (Object.hasOwn(behavior.sounds, channel)) {
          collectSoundData(
            collector,
            behavior.sounds[channel],
            appendPath(soundPath, channel),
            { volume: 0.5, pitch: "0.9~1.0" },
          );
        }
    },
  );
}

function collectLootFunctions(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  (isUnknownArray(value) ? value : [value]).forEach((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.type !== "string" ||
      localRegistryDiscriminator(entry.type, "craftengine") !== "apply_data"
    )
      return;
    collectItemData(
      collector,
      entry.data,
      appendPath(
        isUnknownArray(value) ? appendPath(pathName, index) : pathName,
        "data",
      ),
    );
  });
}

function collectLootEntries(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  (isUnknownArray(value) ? value : [value]).forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.type !== "string") return;
    const type = localRegistryDiscriminator(entry.type, "craftengine");
    const entryPath = isUnknownArray(value)
      ? appendPath(pathName, index)
      : pathName;

    switch (type) {
      case "item":
      case "furniture_item":
      case "empty":
        collectLootFunctions(
          collector,
          entry.functions,
          appendPath(entryPath, "functions"),
        );
        return;
      case "alternatives":
      case "if_else":
        if (entry.children !== undefined)
          collectLootEntries(
            collector,
            entry.children,
            appendPath(entryPath, "children"),
          );
        return;
    }
  });
}

function collectLootTable(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  collectLootFunctions(
    collector,
    value.functions,
    appendPath(pathName, "functions"),
  );
  if (!isUnknownArray(value.pools) && !isRecord(value.pools)) return;
  (isUnknownArray(value.pools) ? value.pools : [value.pools]).forEach(
    (pool, index) => {
      if (!isRecord(pool)) return;
      const poolPath = isUnknownArray(value.pools)
        ? appendPath(appendPath(pathName, "pools"), index)
        : appendPath(pathName, "pools");
      collectLootFunctions(
        collector,
        pool.functions,
        appendPath(poolPath, "functions"),
      );
      collectLootEntries(
        collector,
        pool.entries,
        appendPath(poolPath, "entries"),
      );
    },
  );
}

function collectInlineLoot(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  const selected = selectedField(value, ["loot", "loots"]);
  if (!selected || !isRecord(selected[1])) return;
  collectLootTable(collector, selected[1], appendPath(pathName, selected[0]));
}

function collectBlockSettings(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
): void {
  if (!isRecord(value)) return;
  for (const [key, setting] of Object.entries(value)) {
    if (sectionKey(key).replaceAll("-", "_") !== "sounds") continue;
    collectSoundChannels(collector, setting, appendPath(pathName, key), {
      break: { volume: 1, pitch: 0.8 },
      step: { volume: 0.15, pitch: 1 },
      place: { volume: 1, pitch: 0.8 },
      hit: { volume: 0.5, pitch: 0.5 },
      fall: { volume: 0.5, pitch: 0.75 },
    });
  }
}

function collectBlock(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  collectBlockSettings(
    collector,
    value.settings,
    appendPath(pathName, "settings"),
  );
  const state = selectedField(value, ["state", "states"]);
  if (state && isRecord(state[1]) && isRecord(state[1].variants)) {
    const variantsPath = appendPath(appendPath(pathName, state[0]), "variants");
    for (const [selector, variant] of Object.entries(state[1].variants)) {
      if (!isRecord(variant)) continue;
      collectBlockSettings(
        collector,
        variant.settings,
        appendPath(appendPath(variantsPath, selector), "settings"),
      );
    }
  }
  collectBlockBehaviors(collector, value, pathName);
  collectEvents(collector, value, pathName);
  collectInlineLoot(collector, value, pathName);
}

function collectFurniture(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  if (isRecord(value.settings))
    for (const [key, setting] of Object.entries(value.settings)) {
      if (sectionKey(key).replaceAll("-", "_") !== "sounds") continue;
      collectSoundChannels(
        collector,
        setting,
        appendPath(appendPath(pathName, "settings"), key),
        {
          break: { volume: 1, pitch: 0.8 },
          place: { volume: 1, pitch: 0.8 },
          hit: { volume: 1, pitch: 0.5 },
        },
      );
    }
  collectFurnitureBehaviors(collector, value, pathName);
  collectEvents(collector, value, pathName);
  collectInlineLoot(collector, value, pathName);
}

function collectItemBehaviors(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
  pathName: string,
): void {
  const selected = selectedField(value, ["behavior", "behaviors"]);
  if (!selected) return;
  const basePath = appendPath(pathName, selected[0]);
  (isUnknownArray(selected[1]) ? selected[1] : [selected[1]]).forEach(
    (behavior, index) => {
      if (!isRecord(behavior) || typeof behavior.type !== "string") return;
      const type = localRegistryDiscriminator(behavior.type, "craftengine");
      if (type === undefined) return;
      const behaviorPath = isUnknownArray(selected[1])
        ? appendPath(basePath, index)
        : basePath;
      switch (type) {
        case "block_item":
        case "liquid_collision_block_item":
        case "double_high_block_item":
        case "wall_block_item":
        case "ceiling_block_item":
        case "ground_block_item":
        case "multi_high_block_item":
          if (isRecord(behavior.block))
            collectBlock(
              collector,
              behavior.block,
              appendPath(behaviorPath, "block"),
            );
          break;
        case "furniture_item":
        case "liquid_collision_furniture_item":
          if (isRecord(behavior.furniture))
            collectFurniture(
              collector,
              behavior.furniture,
              appendPath(behaviorPath, "furniture"),
            );
          break;
      }
    },
  );
}

function collectItem(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
): void {
  if (isRecord(value.settings))
    for (const [key, setting] of Object.entries(value.settings)) {
      const type = localRegistryDiscriminator(
        sectionKey(key).replaceAll("-", "_"),
        "craftengine",
      );
      const settingPath = appendPath("settings", key);
      if (
        (type === "equipment" || type === "equippable") &&
        isRecord(setting)
      ) {
        for (const names of [
          ["equip_sound", "equip-sound"],
          ["shearing_sound", "shearing-sound"],
        ] as const) {
          const selected = selectedField(setting, names);
          if (selected)
            collectComponentSound(
              collector,
              selected[1],
              appendPath(settingPath, selected[0]),
            );
        }
      } else if (type === "projectile" && isRecord(setting)) {
        collectProjectileSounds(
          collector,
          setting.sounds,
          appendPath(settingPath, "sounds"),
        );
      } else if (type === "drag_repair_item") {
        (isUnknownArray(setting) ? setting : [setting]).forEach(
          (entry, index) => {
            if (!isRecord(entry) || entry.sound === undefined) return;
            const entryPath = isUnknownArray(setting)
              ? appendPath(settingPath, index)
              : settingPath;
            collectSoundData(
              collector,
              entry.sound,
              appendPath(entryPath, "sound"),
            );
          },
        );
      }
    }
  collectItemData(collector, value.data, "data");
  const clientData = selectedField(value, [
    "client_bound_data",
    "client-bound-data",
  ]);
  if (clientData) collectItemData(collector, clientData[1], clientData[0]);
  const overrideData = selectedField(value, ["override_data", "override-data"]);
  if (overrideData)
    collectItemData(collector, overrideData[1], overrideData[0]);
  collectItemUpdater(collector, value.updater, "updater");
  collectItemBehaviors(collector, value, "");
  collectEvents(collector, value, "");
}

function recipeType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const separator = value.indexOf(":");
  const local =
    separator < 0
      ? value
      : value.slice(0, separator) === "minecraft"
        ? value.slice(separator + 1)
        : undefined;
  switch (local) {
    case "crafting_shaped":
      return "shaped";
    case "crafting_shapeless":
      return "shapeless";
    case "crafting_dye":
      return "dye";
    case "smelting":
    case "blasting":
    case "smoking":
    case "campfire_cooking":
      return "cooking";
    default:
      return local;
  }
}

function collectRecipeProcessors(
  collector: SoundReferenceCollector,
  value: unknown,
  pathName: string,
  names: readonly string[],
): void {
  if (!isRecord(value)) return;
  const selected = selectedField(value, names);
  if (!selected) return;
  const processorsPath = appendPath(pathName, selected[0]);
  (isUnknownArray(selected[1]) ? selected[1] : [selected[1]]).forEach(
    (processor, index) => {
      if (
        !isRecord(processor) ||
        typeof processor.type !== "string" ||
        localRegistryDiscriminator(processor.type, "craftengine") !==
          "apply_data"
      )
        return;
      const processorPath = isUnknownArray(selected[1])
        ? appendPath(processorsPath, index)
        : processorsPath;
      collectItemData(
        collector,
        processor.data,
        appendPath(processorPath, "data"),
      );
    },
  );
}

function collectRecipe(
  collector: SoundReferenceCollector,
  value: Readonly<Record<string, unknown>>,
): void {
  const type = recipeType(value.type);
  if (type === undefined) return;
  switch (type) {
    case "shaped":
    case "shaped_transform":
    case "shapeless":
    case "shapeless_transform":
    case "dye":
    case "smithing_transform":
    case "smithing_trim": {
      const selected = selectedField(value, ["functions", "function"]);
      if (selected) collectFunctions(collector, selected[1], selected[0]);
      break;
    }
  }

  switch (type) {
    case "shaped":
    case "shaped_transform":
    case "shapeless":
    case "shapeless_transform":
    case "cooking":
    case "stonecutting":
    case "smithing_transform":
    case "brewing":
      if (isRecord(value.result))
        collectRecipeProcessors(collector, value.result, "result", [
          "post_processors",
          "transform_processors",
          "transform-processors",
          "post-processors",
        ]);
      break;
  }

  switch (type) {
    case "shaped":
    case "shaped_transform":
    case "shapeless":
    case "shapeless_transform":
    case "smithing_transform": {
      const visualResult = selectedField(value, [
        "visual_result",
        "visual-result",
      ]);
      if (visualResult && isRecord(visualResult[1]))
        collectRecipeProcessors(collector, visualResult[1], visualResult[0], [
          "post_processors",
          "transform_processors",
          "transform-processors",
          "post-processors",
        ]);
      break;
    }
  }

  if (type === "dye" && isRecord(value.target))
    collectRecipeProcessors(collector, value.target, "target", [
      "post_processors",
      "transform_processors",
      "transform-processors",
      "post-processors",
    ]);

  switch (type) {
    case "shaped_transform":
    case "shapeless_transform":
    case "smithing_transform":
      collectRecipeProcessors(collector, value, "", [
        "transform_processors",
        "transform-processors",
        "post_processors",
        "post-processors",
      ]);
      break;
  }
}

export function collectSoundReferences(
  candidate: ConfigurationCandidateInput,
): SoundDataReference[] {
  if (!isRecord(candidate.value)) return [];
  const collector: SoundReferenceCollector = {
    source: candidate.source,
    result: [],
  };
  switch (candidate.kind) {
    case "item":
      collectItem(collector, candidate.value);
      return collector.result;
    case "block":
      collectBlock(collector, candidate.value, "");
      return collector.result;
    case "furniture":
      collectFurniture(collector, candidate.value, "");
      return collector.result;
    case "loot":
      collectLootTable(collector, candidate.value, "");
      return collector.result;
    case "vanilla-loot":
      collectInlineLoot(collector, candidate.value, "");
      return collector.result;
    case "recipe":
      collectRecipe(collector, candidate.value);
      return collector.result;
    case "jukebox-song":
      if (typeof candidate.value.sound === "string")
        pushScalarReference(collector, candidate.value.sound, "sound");
      return collector.result;
    default:
      return collector.result;
  }
}
