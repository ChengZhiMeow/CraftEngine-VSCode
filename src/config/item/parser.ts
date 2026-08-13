import { validateDataComponentValue } from "./dataComponents.js";
import { buildBlockIndex } from "../block/parser.js";
import type { BlockDefinition } from "../block/model.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import {
  isRegistryDiscriminatorSyntax,
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import { validateSchemaNumberProviders } from "../number-provider/validation.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import { buildFurnitureIndex } from "../furniture/parser.js";
import type { FurnitureDefinition } from "../furniture/model.js";
import type { JukeboxSongDefinition } from "../jukebox/model.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import type { VanillaBlockStateCatalog } from "../../minecraft/block/states.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { semanticForField, type SchemaField } from "../schema/types.js";
import type { ItemDefinition } from "./model.js";
import {
  CONDITION_TYPES,
  EVENT_TRIGGERS,
  FUNCTION_TYPES,
  ITEM_BEHAVIOR_TYPES,
  ITEM_DATA_FIELDS,
  ITEM_MODEL_TYPES,
  ITEM_ROOT_FIELDS,
  ITEM_SETTING_FIELDS,
  MODEL_CONDITION_PROPERTIES,
  MODEL_RANGE_PROPERTIES,
  MODEL_SELECT_PROPERTIES,
  MODEL_TINT_TYPES,
  SPECIAL_MODEL_TYPES,
  itemFieldsForContext,
  itemSchemaFieldForName,
  resolveFunctionOrConditionType,
} from "./schema.js";

import { Messages } from "../../messages.js";
export interface ItemBuildOptions {
  readonly includeInactiveDiagnostics: boolean;
  readonly unknownExtensionSyntax?: "ignore" | "warning";
  readonly vanillaMaterials?: ReadonlySet<string>;
  readonly vanillaComponents?: ReadonlySet<string>;
  readonly jukeboxSongs?: readonly JukeboxSongDefinition[];
  readonly vanillaJukeboxSongs?: ReadonlySet<string>;
  readonly vanillaBlocks?: ReadonlySet<string>;
  readonly vanillaBlockStates?: VanillaBlockStateCatalog;
  readonly vanillaEntityTypes?: ReadonlySet<string>;
}

export interface ItemBuildResult {
  readonly items: readonly ItemDefinition[];
  readonly blocks: readonly BlockDefinition[];
  readonly furniture: readonly FurnitureDefinition[];
  readonly issues: readonly CoreIssue[];
}

const BLOCK_ITEM_BEHAVIOR_TYPES = new Set([
  "block_item",
  "liquid_collision_block_item",
  "double_high_block_item",
  "wall_block_item",
  "ceiling_block_item",
  "ground_block_item",
  "multi_high_block_item",
]);

const FURNITURE_ITEM_BEHAVIOR_TYPES = new Set([
  "furniture_item",
  "liquid_collision_furniture_item",
]);

const ITEM_UPDATER_TYPES = [
  "craftengine:apply_data",
  "craftengine:transmute",
  "craftengine:reset",
] as const;

const BEHAVIOR_TEMPLATE_FIELDS = [
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
] as const;
const ITEM_BEHAVIOR_FIELDS = new Map<string, ReadonlySet<string>>([
  ["empty", new Set(["type", ...BEHAVIOR_TEMPLATE_FIELDS])],
  ["block_item", new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS])],
  [
    "ground_block_item",
    new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS]),
  ],
  ["wall_block_item", new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS])],
  [
    "ceiling_block_item",
    new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS]),
  ],
  [
    "double_high_block_item",
    new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS]),
  ],
  [
    "multi_high_block_item",
    new Set(["type", "block", ...BEHAVIOR_TEMPLATE_FIELDS]),
  ],
  [
    "liquid_collision_block_item",
    new Set([
      "type",
      "block",
      "y_offset",
      "y-offset",
      ...BEHAVIOR_TEMPLATE_FIELDS,
    ]),
  ],
  [
    "furniture_item",
    new Set([
      "type",
      "furniture",
      "rules",
      "ignore_placer",
      "ignore-placer",
      "ignore_entities",
      "ignore-entities",
      "against_blocks",
      "against-blocks",
      "against_block_tags",
      "against-block-tags",
      "blacklist",
      ...BEHAVIOR_TEMPLATE_FIELDS,
    ]),
  ],
  [
    "liquid_collision_furniture_item",
    new Set([
      "type",
      "furniture",
      "rules",
      "ignore_placer",
      "ignore-placer",
      "ignore_entities",
      "ignore-entities",
      "against_blocks",
      "against-blocks",
      "against_block_tags",
      "against-block-tags",
      "blacklist",
      "source_only",
      "source-only",
      "liquid_type",
      "liquid-type",
      ...BEHAVIOR_TEMPLATE_FIELDS,
    ]),
  ],
  ["flint_and_steel_item", new Set(["type", ...BEHAVIOR_TEMPLATE_FIELDS])],
  [
    "compostable_item",
    new Set(["type", "chance", ...BEHAVIOR_TEMPLATE_FIELDS]),
  ],
  ["axe_item", new Set(["type", ...BEHAVIOR_TEMPLATE_FIELDS])],
  [
    "range_mining_item",
    new Set([
      "type",
      "conditions",
      "condition",
      "range",
      ...BEHAVIOR_TEMPLATE_FIELDS,
    ]),
  ],
]);

function field(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): [name: string, value: unknown] | undefined {
  for (const name of names)
    if (Object.hasOwn(raw, name)) return [name, raw[name]];
  return undefined;
}

function sourceRange(
  source: ConfigurationSource,
  fieldName?: string,
  key = false,
): TextRange {
  if (!fieldName) return source.idRange;
  return (
    (key ? source.fieldKeyRanges : source.fieldValueRanges).get(fieldName) ??
    source.fieldKeyRanges.get(fieldName) ??
    source.idRange
  );
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  fieldName?: string,
  related?: CoreIssue["related"],
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: sourceRange(source, fieldName, fieldName === undefined),
    ...(related === undefined ? {} : { related }),
  };
}

function issueAtKey(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  pathName: string,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: source.fieldKeyRanges.get(pathName) ?? source.idRange,
  };
}

function issueAtValue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  pathName: string,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range:
      source.fieldValueRanges.get(pathName) ??
      source.fieldKeyRanges.get(pathName) ??
      source.idRange,
  };
}

function issueAtMappingContent(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  pathName: string,
): CoreIssue {
  const prefix = `${pathName}.`;
  const descendantKeys = [...source.fieldKeyRanges]
    .filter(([fieldPath]) => fieldPath.startsWith(prefix))
    .map(([, range]) => range);
  const descendantValues = [...source.fieldValueRanges]
    .filter(([fieldPath]) => fieldPath.startsWith(prefix))
    .map(([, range]) => range);
  if (descendantKeys.length === 0 || descendantValues.length === 0) {
    return issueAtValue(source, code, message, severity, pathName);
  }
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: {
      start: Math.min(...descendantKeys.map((range) => range.start)),
      end: Math.max(...descendantValues.map((range) => range.end)),
    },
  };
}

function knownField(
  name: string,
  fields: readonly SchemaField[],
  normalized = false,
): boolean {
  const candidate = (normalized ? name.replaceAll("-", "_") : name).replace(
    /#.*$/u,
    "",
  );
  return fields.some(
    (entry) =>
      entry.label === candidate ||
      entry.aliases.includes(candidate) ||
      (normalized && semanticForField(candidate, fields) === entry.semantic),
  );
}

function localCraftEngineType(value: string): string | undefined {
  return localRegistryDiscriminator(
    value.replace(/#.*$/u, "").replaceAll("-", "_"),
    "craftengine",
  );
}

function registryName(value: string, builtinNamespace = "minecraft"): string {
  const separator = value.indexOf(":");
  if (separator < 0) return value;
  return value.slice(0, separator) === builtinNamespace
    ? value.slice(separator + 1)
    : value;
}

function registeredDiscriminator(
  value: string,
  builtinNamespace: "craftengine" | "minecraft",
  known: readonly string[],
  label: string,
  code: string,
  source: ConfigurationSource,
  pathName: string,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): string | undefined {
  const key = makeIdentifier(value, builtinNamespace);
  if (known.includes(key)) return key;
  const registeredSyntax = isValidRegistryDiscriminator(
    value,
    builtinNamespace,
  );
  const severity = registeredSyntax
    ? options.unknownExtensionSyntax === "warning"
      ? "warning"
      : undefined
    : "error";
  if (severity)
    issues.push(
      issueAtValue(
        source,
        code,
        Messages.src.config.item.parser.text0001(registeredSyntax, label, key),
        severity,
        pathName,
      ),
    );
  return undefined;
}

function isCraftEngineBoolean(value: unknown): boolean {
  try {
    craftEngineBoolean(value);
    return true;
  } catch {
    return false;
  }
}

function validateItemSettingValues(
  settings: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  issues: CoreIssue[],
): void {
  for (const [rawKey, value] of Object.entries(settings)) {
    const key = localCraftEngineType(rawKey);
    if (key === undefined) continue;
    switch (key) {
      case "enchantable":
      case "renameable":
      case "can_place":
      case "trigger_advancement":
      case "disable_vanilla_behavior":
      case "dyeable":
      case "respect_repairable_component":
        if (isCraftEngineBoolean(value)) break;
        issues.push(
          issueAtValue(
            source,
            "invalid-item-setting-value",
            Messages.src.config.item.parser.text0002(key),
            "error",
            `settings.${rawKey}`,
          ),
        );
        break;
      case "drop_display":
        if (
          typeof value === "string" ||
          typeof value === "boolean" ||
          typeof value === "number"
        )
          break;
        issues.push(
          issueAtValue(
            source,
            "invalid-item-setting-value",
            Messages.src.config.item.parser.text0003,
            "error",
            `settings.${rawKey}`,
          ),
        );
        break;
      case "fuel_time":
        if (
          typeof value === "number" ||
          typeof value === "string" ||
          typeof value === "boolean"
        )
          break;
        issues.push(
          issueAtValue(
            source,
            "invalid-item-setting-value",
            Messages.src.config.item.parser.text0004,
            "error",
            `settings.${rawKey}`,
          ),
        );
        break;
      case "keep_on_death_chance":
      case "destroy_on_death_chance":
      case "compost_probability":
        if (
          typeof value === "number" ||
          typeof value === "string" ||
          typeof value === "boolean"
        )
          break;
        issues.push(
          issueAtValue(
            source,
            "invalid-item-setting-value",
            Messages.src.config.item.parser.text0005(key),
            "error",
            `settings.${rawKey}`,
          ),
        );
    }
  }
}

function validateTypedTree(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  type: "function" | "condition",
  issues: CoreIssue[],
  options: ItemBuildOptions,
  expectType = true,
): void {
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      validateTypedTree(
        entry,
        source,
        `${pathName}.${index}`,
        type,
        issues,
        options,
        expectType,
      ),
    );
    return;
  }
  if (!isRecord(value)) return;
  const rawType = value.type;
  if (expectType && (typeof rawType !== "string" || rawType.length === 0)) {
    issues.push(
      issueAtMappingContent(
        source,
        `missing-${type}-type`,
        Messages.src.config.item.parser.text0006(pathName),
        "error",
        Object.hasOwn(value, "type") ? `${pathName}.type` : pathName,
      ),
    );
  }
  if (typeof rawType === "string") {
    const resolved = resolveFunctionOrConditionType(type, rawType);
    if (resolved?.external) {
      if (options.unknownExtensionSyntax === "warning")
        issues.push(
          issueAtValue(
            source,
            `unknown-${type}-type`,
            Messages.src.config.item.parser.text0007(
              type === "function" ? "Function" : "Condition",
              rawType,
            ),
            "warning",
            `${pathName}.type`,
          ),
        );
      return;
    }
    const normalized =
      resolved?.name ?? registryName(rawType.replace(/^!/u, ""), "craftengine");
    const allowed = type === "function" ? FUNCTION_TYPES : CONDITION_TYPES;
    if (!(allowed as readonly string[]).includes(normalized)) {
      issues.push(
        issueAtValue(
          source,
          `unknown-${type}-type`,
          Messages.src.config.item.parser.text0008(
            type === "function" ? "Function" : "Condition",
            rawType,
          ),
          "error",
          `${pathName}.type`,
        ),
      );
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (["conditions", "condition", "terms", "term"].includes(key))
      validateTypedTree(
        child,
        source,
        `${pathName}.${key}`,
        "condition",
        issues,
        options,
      );
    else if (
      [
        "functions",
        "function",
        "fallback",
        "on_success",
        "on-success",
        "on_failure",
        "on-failure",
      ].includes(key)
    )
      validateTypedTree(
        child,
        source,
        `${pathName}.${key}`,
        "function",
        issues,
        options,
      );
    else if (key === "rules" || key === "cases" || key === "case")
      validateTypedTree(
        child,
        source,
        `${pathName}.${key}`,
        type,
        issues,
        options,
        false,
      );
  }
}

function validateItemModel(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  if (typeof value === "string") return;
  if (isUnknownArray(value)) {
    value.forEach((entry, index) =>
      validateItemModel(entry, source, `${pathName}.${index}`, options, issues),
    );
    return;
  }
  if (!isRecord(value)) return;
  const explicitType = typeof value.type === "string" ? value.type : undefined;
  const type = registeredDiscriminator(
    explicitType ?? "minecraft:model",
    "minecraft",
    ITEM_MODEL_TYPES,
    Messages.src.config.item.parser.text0009,
    "unknown-item-model-type",
    source,
    `${pathName}.type`,
    options,
    issues,
  );
  if (!type) {
    // 遇到外部插件的类型时, 不要再套用内置规则
    return;
  }
  const local = registryName(type);
  const hasValue = (names: readonly string[]): boolean =>
    names.some(
      (name) =>
        Object.hasOwn(value, name) &&
        value[name] !== null &&
        value[name] !== undefined &&
        (typeof value[name] !== "string" || value[name].trim() !== ""),
    );
  const missing = (name: string, anchor = `${pathName}.type`): void => {
    issues.push(
      issueAtValue(
        source,
        "missing-item-model-field",
        Messages.src.config.item.parser.text0010(pathName, name),
        "error",
        anchor,
      ),
    );
  };
  const validateGeneration = (
    generation: unknown,
    generationPath: string,
  ): void => {
    if (!isRecord(generation)) {
      issues.push(
        issueAtValue(
          source,
          "invalid-item-model-generation",
          Messages.src.config.item.parser.text0011(generationPath),
          "error",
          generationPath,
        ),
      );
    } else if (!hasOwnNonEmpty(generation, ["parent"])) {
      issues.push(
        issueAtKey(
          source,
          "missing-item-model-field",
          Messages.src.config.item.parser.text0012(generationPath),
          "error",
          generationPath,
        ),
      );
    }
  };

  switch (local) {
    case "model": {
      if (!hasValue(["path", "model"]))
        missing("path/model", explicitType ? `${pathName}.type` : pathName);
      if (value.generation !== undefined)
        validateGeneration(value.generation, `${pathName}.generation`);
      if (isUnknownArray(value.tints))
        value.tints.forEach((tint, index) => {
        const tintPath = `${pathName}.tints.${index}`;
        if (!isRecord(tint)) {
          issues.push(
            issueAtValue(
              source,
              "invalid-model-tint",
              Messages.src.config.item.parser.text0013(tintPath),
              "error",
              tintPath,
            ),
          );
          return;
        }
        if (tint.type === null || tint.type === undefined) {
          issues.push(
            issueAtValue(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0014(tintPath),
              "error",
              tintPath,
            ),
          );
          return;
        }
        if (typeof tint.type !== "string") {
          issues.push(
            issueAtValue(
              source,
              "unknown-model-tint",
              Messages.src.config.item.parser.text0015(tintPath),
              "error",
              `${tintPath}.type`,
            ),
          );
          return;
        }
        registeredDiscriminator(
          tint.type,
          "minecraft",
          MODEL_TINT_TYPES,
          Messages.src.config.item.parser.text0016,
          "unknown-model-tint",
          source,
          `${tintPath}.type`,
          options,
          issues,
        );
        });
      return;
    }
    case "condition": {
    const rawProperty =
      typeof value.property === "string" ? value.property : undefined;
    const property =
      rawProperty !== undefined
        ? registeredDiscriminator(
            rawProperty,
            "minecraft",
            MODEL_CONDITION_PROPERTIES,
            Messages.src.config.item.parser.text0017,
            "unknown-model-condition",
            source,
            `${pathName}.property`,
            options,
            issues,
          )
        : undefined;
    if (rawProperty === undefined) missing("property");
    if (!hasValue(["on_true", "on-true"])) missing("on_true");
    if (!hasValue(["on_false", "on-false"])) missing("on_false");
    if (property) {
      const propertyName = registryName(property);
      const required =
        propertyName === "component"
          ? ["predicate", "value"]
          : propertyName === "has_component"
            ? ["component"]
            : propertyName === "keybind_down"
              ? ["keybind"]
              : [];
      for (const name of required)
        if (!hasValue([name])) missing(name, `${pathName}.property`);
    }
    validateItemModel(
      value.on_true ?? value["on-true"],
      source,
      `${pathName}.on_true`,
      options,
      issues,
    );
    validateItemModel(
      value.on_false ?? value["on-false"],
      source,
      `${pathName}.on_false`,
      options,
      issues,
    );
      return;
    }
    case "range_dispatch": {
    const rawProperty =
      typeof value.property === "string" ? value.property : undefined;
    const property =
      rawProperty !== undefined
        ? registeredDiscriminator(
            rawProperty,
            "minecraft",
            MODEL_RANGE_PROPERTIES,
            Messages.src.config.item.parser.text0018,
            "unknown-model-range",
            source,
            `${pathName}.property`,
            options,
            issues,
          )
        : undefined;
    if (rawProperty === undefined) missing("property");
    if (property) {
      const propertyName = registryName(property);
      const required =
        propertyName === "compass"
          ? ["target"]
          : propertyName === "time"
            ? ["source"]
            : [];
      for (const name of required)
        if (!hasValue([name])) missing(name, `${pathName}.property`);
    }
    validateItemModel(
      value.fallback,
      source,
      `${pathName}.fallback`,
      options,
      issues,
    );
    if (!isUnknownArray(value.entries)) {
      if (value.entries === undefined) missing("entries");
      else
        issues.push(
          issueAtValue(
            source,
            "invalid-item-model-field",
            Messages.src.config.item.parser.text0019(pathName),
            "error",
            `${pathName}.entries`,
          ),
        );
    } else
      value.entries.forEach((entry, index) => {
        const entryPath = `${pathName}.entries.${index}`;
        if (!isRecord(entry)) {
          issues.push(
            issueAtValue(
              source,
              "invalid-item-model-field",
              Messages.src.config.item.parser.text0020(entryPath),
              "error",
              entryPath,
            ),
          );
          return;
        }
        if (!hasOwnNonEmpty(entry, ["threshold"])) {
          issues.push(
            issueAtKey(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0021(entryPath),
              "error",
              entryPath,
            ),
          );
        }
        if (!hasOwnNonEmpty(entry, ["model"]) && value.fallback === undefined) {
          issues.push(
            issueAtKey(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0022(entryPath),
              "error",
              entryPath,
            ),
          );
        }
        validateItemModel(
          entry.model,
          source,
          `${entryPath}.model`,
          options,
          issues,
        );
        });
      return;
    }
    case "select": {
    const rawProperty =
      typeof value.property === "string" ? value.property : undefined;
    const property =
      rawProperty !== undefined
        ? registeredDiscriminator(
            rawProperty,
            "minecraft",
            MODEL_SELECT_PROPERTIES,
            Messages.src.config.item.parser.text0023,
            "unknown-model-select",
            source,
            `${pathName}.property`,
            options,
            issues,
          )
        : undefined;
    if (rawProperty === undefined) missing("property");
    if (property) {
      const propertyName = registryName(property);
      const required =
        propertyName === "block_state"
          ? ["block_state_property", "block-state-property"]
          : propertyName === "component"
            ? ["component"]
            : propertyName === "local_time"
              ? ["pattern"]
              : [];
      if (required.length > 0 && !hasValue(required))
        missing(required[0]!, `${pathName}.property`);
    }
    validateItemModel(
      value.fallback,
      source,
      `${pathName}.fallback`,
      options,
      issues,
    );
    if (!isUnknownArray(value.cases)) {
      if (value.cases === undefined) missing("cases");
      else
        issues.push(
          issueAtValue(
            source,
            "invalid-item-model-field",
            Messages.src.config.item.parser.text0024(pathName),
            "error",
            `${pathName}.cases`,
          ),
        );
    } else
      value.cases.forEach((entry, index) => {
        const casePath = `${pathName}.cases.${index}`;
        if (!isRecord(entry)) {
          issues.push(
            issueAtValue(
              source,
              "invalid-item-model-field",
              Messages.src.config.item.parser.text0025(casePath),
              "error",
              casePath,
            ),
          );
          return;
        }
        const when = entry.when;
        if (
          when === undefined ||
          when === null ||
          (isUnknownArray(when) && when.length === 0) ||
          (typeof when === "string" && when.trim() === "")
        ) {
          issues.push(
            issueAtKey(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0026(casePath),
              "error",
              casePath,
            ),
          );
        }
        if (!hasOwnNonEmpty(entry, ["model"])) {
          issues.push(
            issueAtKey(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0027(casePath),
              "error",
              casePath,
            ),
          );
        }
        validateItemModel(
          entry.model,
          source,
          `${casePath}.model`,
          options,
          issues,
        );
        });
      return;
    }
    case "composite": {
      validateItemModel(
        value.models,
        source,
        `${pathName}.models`,
        options,
        issues,
      );
      return;
    }
    case "special": {
    if (!hasValue(["base", "path"])) missing("base/path");
    if (value.generation !== undefined)
      validateGeneration(value.generation, `${pathName}.generation`);
    if (!isRecord(value.model)) {
      if (value.model === undefined) missing("model");
      else
        issues.push(
          issueAtValue(
            source,
            "invalid-item-model-field",
            Messages.src.config.item.parser.text0028(pathName),
            "error",
            `${pathName}.model`,
          ),
        );
      return;
    }
    const special =
      typeof value.model.type === "string"
        ? registeredDiscriminator(
            value.model.type,
            "minecraft",
            SPECIAL_MODEL_TYPES,
            Messages.src.config.item.parser.text0029,
            "unknown-special-model",
            source,
            `${pathName}.model.type`,
            options,
            issues,
          )
        : undefined;
    if (!special) {
      if (typeof value.model.type !== "string") {
        issues.push(
          issueAtKey(
            source,
            "missing-item-model-field",
            Messages.src.config.item.parser.text0030(pathName),
            "error",
            `${pathName}.model`,
          ),
        );
      }
      return;
    }
      const specialName = registryName(special);
      let required: readonly (readonly [string, ...string[]])[];
      switch (specialName) {
        case "banner":
          required = [["color"]];
          break;
        case "bed":
          required = [["part"], ["texture"]];
          break;
        case "chest":
        case "shulker_box":
          required = [["texture"]];
          break;
        case "copper_golem_statue":
          required = [["pose"], ["texture"]];
          break;
        case "end_cube":
          required = [["effect"]];
          break;
        case "head":
          required = [["kind"]];
          break;
        case "hanging_sign":
        case "standing_sign":
          required = [["wood_type", "wood-type"]];
          break;
        default:
          required = [];
      }
      for (const aliases of required)
        if (!hasOwnNonEmpty(value.model, aliases))
          issues.push(
            issueAtValue(
              source,
              "missing-item-model-field",
              Messages.src.config.item.parser.text0031(pathName, aliases[0]),
              "error",
              `${pathName}.model.type`,
            ),
          );
      return;
    }
  }
}

function hasOwnNonEmpty(
  value: Readonly<Record<string, unknown>>,
  names: readonly string[],
): boolean {
  return names.some(
    (name) =>
      Object.hasOwn(value, name) &&
      value[name] !== null &&
      value[name] !== undefined &&
      (typeof value[name] !== "string" || value[name].trim() !== ""),
  );
}

function validateLegacyItemModel(
  value: unknown,
  source: ConfigurationSource,
  pathName: "legacy_model" | "legacy-model",
  issues: CoreIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      issueAtValue(
        source,
        "invalid-legacy-item-model",
        Messages.src.config.item.parser.text0032(pathName),
        "error",
        pathName,
      ),
    );
    return;
  }
  if (!hasOwnNonEmpty(value, ["path", "model"])) {
    issues.push(
      issueAtKey(
        source,
        "missing-item-model-field",
        Messages.src.config.item.parser.text0033(pathName),
        "error",
        pathName,
      ),
    );
  }
  const validateGeneration = (generation: unknown, pathName: string): void => {
    if (!isRecord(generation)) {
      issues.push(
        issueAtValue(
          source,
          "invalid-item-model-generation",
          Messages.src.config.item.parser.text0034(pathName),
          "error",
          pathName,
        ),
      );
    } else if (!hasOwnNonEmpty(generation, ["parent"])) {
      issues.push(
        issueAtKey(
          source,
          "missing-item-model-field",
          Messages.src.config.item.parser.text0035(pathName),
          "error",
          pathName,
        ),
      );
    }
  };
  if (value.generation !== undefined)
    validateGeneration(value.generation, `${pathName}.generation`);
  if (value.overrides === undefined) return;
  if (!isUnknownArray(value.overrides)) {
    issues.push(
      issueAtValue(
        source,
        "invalid-legacy-item-model",
        Messages.src.config.item.parser.text0036(pathName),
        "error",
        `${pathName}.overrides`,
      ),
    );
    return;
  }
  value.overrides.forEach((entry, index) => {
    const overridePath = `${pathName}.overrides.${index}`;
    if (!isRecord(entry)) {
      issues.push(
        issueAtValue(
          source,
          "invalid-legacy-item-model",
          Messages.src.config.item.parser.text0037(overridePath),
          "error",
          overridePath,
        ),
      );
      return;
    }
    for (const [aliases, label] of [
      [["path", "model"], "path/model"],
      [["predicate"], "predicate"],
    ] as const) {
      if (!hasOwnNonEmpty(entry, aliases))
        issues.push(
          issueAtKey(
            source,
            "missing-item-model-field",
            Messages.src.config.item.parser.text0038(overridePath, label),
            "error",
            overridePath,
          ),
        );
    }
    if (entry.generation !== undefined)
      validateGeneration(entry.generation, `${overridePath}.generation`);
  });
}

function validateItemConfiguration(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  for (const key of Object.keys(raw)) {
    if (!knownField(key, ITEM_ROOT_FIELDS))
      issues.push(
        issueAtKey(
          source,
          "unknown-item-field",
          Messages.src.config.item.parser.text0039(key),
          "warning",
          key,
        ),
      );
  }
  for (const [containerName, fields] of [
    ["data", ITEM_DATA_FIELDS],
    ["client_bound_data", ITEM_DATA_FIELDS],
    ["client-bound-data", ITEM_DATA_FIELDS],
  ] as const) {
    const container = raw[containerName];
    if (!isRecord(container)) continue;
    for (const key of Object.keys(container)) {
      const local = localCraftEngineType(key);
      if (local !== undefined && knownField(local, fields, true)) continue;
      const registeredSyntax = isValidRegistryDiscriminator(
        key.replace(/#.*$/u, "").replaceAll("-", "_"),
        "craftengine",
      );
      if (registeredSyntax && options.unknownExtensionSyntax !== "warning")
        continue;
      issues.push(
        issueAtKey(
          source,
          `unknown-item-${containerName.replaceAll("_", "-")}-field`,
          Messages.src.config.item.parser.text0040(
            registeredSyntax,
            containerName,
            key,
          ),
          registeredSyntax ? "warning" : "error",
          `${containerName}.${key}`,
        ),
      );
    }
  }
  const settings = raw.settings;
  if (isRecord(settings)) {
    validateItemSettingValues(settings, source, issues);
    for (const key of Object.keys(settings)) {
      const local = localCraftEngineType(key);
      if (local !== undefined && knownField(local, ITEM_SETTING_FIELDS, true))
        continue;
      const registeredSyntax = isValidRegistryDiscriminator(
        key.replace(/#.*$/u, "").replaceAll("-", "_"),
        "craftengine",
      );
      if (registeredSyntax && options.unknownExtensionSyntax !== "warning")
        continue;
      issues.push(
        issueAtKey(
          source,
          "unknown-item-settings-field",
          Messages.src.config.item.parser.text0041(registeredSyntax, key),
          registeredSyntax ? "warning" : "error",
          `settings.${key}`,
        ),
      );
    }
  }
  for (const containerName of [
    "data",
    "client_bound_data",
    "client-bound-data",
  ]) {
    const container = raw[containerName];
    if (!isRecord(container)) continue;
    validateItemDataContainer(
      container,
      containerName,
      source,
      options,
      issues,
    );
  }
  if (raw.updater !== undefined)
    validateItemUpdater(raw.updater, source, options, issues);
  const behaviors = raw.behaviors ?? raw.behavior;
  const behaviorName = Object.hasOwn(raw, "behaviors")
    ? "behaviors"
    : "behavior";
  const behaviorList = isUnknownArray(behaviors);
  for (const [index, behavior] of records(behaviors).entries()) {
    const behaviorPath = behaviorList
      ? `${behaviorName}.${index}`
      : behaviorName;
    if (!isRecord(behavior)) {
      issues.push(
        issueAtValue(
          source,
          "invalid-item-behavior",
          Messages.src.config.item.parser.text0042(behaviorPath),
          "error",
          behaviorPath,
        ),
      );
      continue;
    }
    if (typeof behavior.type !== "string" || behavior.type.trim() === "") {
      issues.push(
        issueAtKey(
          source,
          "missing-item-behavior-type",
          Messages.src.config.item.parser.text0043(behaviorPath),
          "error",
          behaviorPath,
        ),
      );
      continue;
    }
    const type = localRegistryDiscriminator(behavior.type, "craftengine");
    if (!type || !(ITEM_BEHAVIOR_TYPES as readonly string[]).includes(type)) {
      const registeredSyntax = isValidRegistryDiscriminator(
        behavior.type,
        "craftengine",
      );
      const severity = registeredSyntax
        ? options.unknownExtensionSyntax === "warning"
          ? "warning"
          : undefined
        : "error";
      if (severity)
        issues.push(
          issueAtValue(
            source,
            "unknown-item-behavior",
            Messages.src.config.item.parser.text0044(
              registeredSyntax,
              behavior.type,
            ),
            severity,
            `${behaviorPath}.type`,
          ),
        );
      continue;
    }
    const allowedFields = ITEM_BEHAVIOR_FIELDS.get(type);
    if (allowedFields)
      for (const key of Object.keys(behavior))
        if (!allowedFields.has(key)) {
          issues.push(
            issueAtKey(
              source,
              "unknown-item-behavior-field",
              Messages.src.config.item.parser.text0045(type, key),
              "warning",
              `${behaviorPath}.${key}`,
            ),
          );
        }
    if (BLOCK_ITEM_BEHAVIOR_TYPES.has(type)) {
      if (!Object.hasOwn(behavior, "block")) {
        issues.push(
          issueAtKey(
            source,
            "missing-item-behavior-field",
            Messages.src.config.item.parser.text0046(behaviorPath),
            "error",
            behaviorPath,
          ),
        );
      } else if (
        typeof behavior.block !== "string" &&
        !isRecord(behavior.block)
      ) {
        issues.push(
          issueAtValue(
            source,
            "invalid-item-behavior-field",
            Messages.src.config.item.parser.text0047(behaviorPath),
            "error",
            `${behaviorPath}.block`,
          ),
        );
      }
    } else if (FURNITURE_ITEM_BEHAVIOR_TYPES.has(type)) {
      if (!Object.hasOwn(behavior, "furniture")) {
        issues.push(
          issueAtKey(
            source,
            "missing-item-behavior-field",
            Messages.src.config.item.parser.text0048(behaviorPath),
            "error",
            behaviorPath,
          ),
        );
      } else if (
        typeof behavior.furniture !== "string" &&
        !isRecord(behavior.furniture)
      ) {
        issues.push(
          issueAtValue(
            source,
            "invalid-item-behavior-field",
            Messages.src.config.item.parser.text0049(behaviorPath),
            "error",
            `${behaviorPath}.furniture`,
          ),
        );
      }
      if (behavior.rules !== undefined && !isRecord(behavior.rules)) {
        issues.push(
          issueAtValue(
            source,
            "invalid-furniture-placement-rules",
            Messages.src.config.item.parser.text0050(behaviorPath),
            "error",
            `${behaviorPath}.rules`,
          ),
        );
      } else if (isRecord(behavior.rules))
        for (const [variant, rule] of Object.entries(behavior.rules)) {
          const rulePath = `${behaviorPath}.rules.${variant}`;
          if (!isRecord(rule)) {
            issues.push(
              issueAtValue(
                source,
                "invalid-furniture-placement-rule",
                Messages.src.config.item.parser.text0051(rulePath),
                "error",
                rulePath,
              ),
            );
            continue;
          }
          for (const key of Object.keys(rule))
            if (
              !["alignment", "rotation", ...BEHAVIOR_TEMPLATE_FIELDS].includes(
                key,
              )
            ) {
              issues.push(
                issueAtKey(
                  source,
                  "unknown-furniture-placement-rule-field",
                  Messages.src.config.item.parser.text0052(rulePath, key),
                  "warning",
                  `${rulePath}.${key}`,
                ),
              );
            }
          const alignments = [
            "any",
            "corner",
            "center",
            "half",
            "quarter",
            "center_quarter",
          ];
          const rotations = [
            "any",
            "four",
            "eight",
            "sixteen",
            "north",
            "east",
            "west",
            "south",
          ];
          if (
            rule.alignment !== undefined &&
            (typeof rule.alignment !== "string" ||
              !alignments.includes(rule.alignment.toLowerCase()))
          ) {
            issues.push(
              issueAtValue(
                source,
                "invalid-furniture-alignment-rule",
                Messages.src.config.item.parser.text0053(
                  rulePath,
                  alignments.join("、"),
                ),
                "error",
                `${rulePath}.alignment`,
              ),
            );
          }
          if (
            rule.rotation !== undefined &&
            (typeof rule.rotation !== "string" ||
              !rotations.includes(rule.rotation.toLowerCase()))
          ) {
            issues.push(
              issueAtValue(
                source,
                "invalid-furniture-rotation-rule",
                Messages.src.config.item.parser.text0054(
                  rulePath,
                  rotations.join("、"),
                ),
                "error",
                `${rulePath}.rotation`,
              ),
            );
          }
        }
      const againstBlocks = field(behavior, [
        "against_blocks",
        "against-blocks",
      ]);
      if (
        againstBlocks &&
        !isUnknownArray(againstBlocks[1]) &&
        typeof againstBlocks[1] !== "string"
      ) {
        issues.push(
          issueAtValue(
            source,
            "invalid-furniture-against-blocks",
            Messages.src.config.item.parser.text0055(
              behaviorPath,
              againstBlocks[0],
            ),
            "error",
            `${behaviorPath}.${againstBlocks[0]}`,
          ),
        );
      }
      const againstTags = field(behavior, [
        "against_block_tags",
        "against-block-tags",
      ]);
      if (
        againstTags &&
        !isUnknownArray(againstTags[1]) &&
        typeof againstTags[1] !== "string"
      ) {
        issues.push(
          issueAtValue(
            source,
            "invalid-furniture-against-tags",
            Messages.src.config.item.parser.text0056(
              behaviorPath,
              againstTags[0],
            ),
            "error",
            `${behaviorPath}.${againstTags[0]}`,
          ),
        );
      }
      if (type === "liquid_collision_furniture_item") {
        const liquids = field(behavior, ["liquid_type", "liquid-type"]);
        const values =
          typeof liquids?.[1] === "string"
            ? [liquids[1]]
            : isUnknownArray(liquids?.[1])
              ? liquids[1]
              : [];
        if (
          liquids &&
          ((!isUnknownArray(liquids[1]) && typeof liquids[1] !== "string") ||
            values.some(
              (value) =>
                typeof value !== "string" ||
                !["water", "lava"].includes(value.toLowerCase()),
            ))
        ) {
          issues.push(
            issueAtValue(
              source,
              "invalid-furniture-liquid-type",
              Messages.src.config.item.parser.text0057(
                behaviorPath,
                liquids[0],
              ),
              "error",
              `${behaviorPath}.${liquids[0]}`,
            ),
          );
        }
      }
    } else if (type === "compostable_item" && behavior.chance !== undefined) {
      const chance =
        typeof behavior.chance === "number"
          ? behavior.chance
          : Number(behavior.chance);
      if (!Number.isFinite(chance))
        issues.push(
          issueAtValue(
            source,
            "invalid-compostable-chance",
            Messages.src.config.item.parser.text0058(behaviorPath),
            "error",
            `${behaviorPath}.chance`,
          ),
        );
      else if (chance < 0 || chance > 1)
        issues.push(
          issueAtValue(
            source,
            "unsafe-compostable-chance",
            Messages.src.config.item.parser.text0059(behaviorPath),
            "warning",
            `${behaviorPath}.chance`,
          ),
        );
    } else if (type === "range_mining_item") {
      if (!isUnknownArray(behavior.range))
        issues.push(
          issueAtValue(
            source,
            "invalid-range-mining-range",
            Messages.src.config.item.parser.text0060(behaviorPath),
            "error",
            `${behaviorPath}.range`,
          ),
        );
      else
        behavior.range.forEach((value, rangeIndex) => {
          const parts =
            typeof value === "string"
              ? value.split(",").map((part) => Number(part.trim()))
              : isUnknownArray(value)
                ? value
                : [];
          if (
            parts.length !== 3 ||
            !parts.every((part) => Number.isInteger(part))
          )
            issues.push(
              issueAtValue(
                source,
                "invalid-range-mining-offset",
                Messages.src.config.item.parser.text0061(
                  behaviorPath,
                  rangeIndex,
                ),
                "error",
                `${behaviorPath}.range.${rangeIndex}`,
              ),
            );
        });
    }
    const conditions = behavior.conditions ?? behavior.condition;
    validateTypedTree(
      conditions,
      source,
      `${behaviorPath}.${Object.hasOwn(behavior, "conditions") ? "conditions" : "condition"}`,
      "condition",
      issues,
      options,
    );
  }
  const eventName = Object.hasOwn(raw, "events") ? "events" : "event";
  const events = raw[eventName];
  if (isRecord(events))
    for (const [trigger, functions] of Object.entries(events)) {
      if (
        !(EVENT_TRIGGERS as readonly string[]).includes(
          trigger.replaceAll("-", "_").toLowerCase(),
        )
      ) {
        issues.push(
          issueAtKey(
            source,
            "unknown-item-event",
            Messages.src.config.item.parser.text0062(trigger),
            "warning",
            `${eventName}.${trigger}`,
          ),
        );
      }
      validateTypedTree(
        functions,
        source,
        `${eventName}.${trigger}`,
        "function",
        issues,
        options,
      );
    }
  else if (isUnknownArray(events))
    for (const [index, entry] of events.entries()) {
      if (!isRecord(entry)) continue;
      for (const trigger of records(entry.on).filter(
        (value): value is string => typeof value === "string",
      )) {
        if (
          !(EVENT_TRIGGERS as readonly string[]).includes(
            trigger.replaceAll("-", "_").toLowerCase(),
          )
        ) {
          issues.push(
            issueAtKey(
              source,
              "unknown-item-event",
              Messages.src.config.item.parser.text0063(trigger),
              "warning",
              `${eventName}.${index}.on`,
            ),
          );
        }
      }
      validateTypedTree(
        entry.conditions ?? entry.condition,
        source,
        `${eventName}.${index}.conditions`,
        "condition",
        issues,
        options,
      );
      if (typeof entry.type === "string")
        validateTypedTree(
          entry,
          source,
          `${eventName}.${index}`,
          "function",
          issues,
          options,
        );
      else
        validateTypedTree(
          entry.functions,
          source,
          `${eventName}.${index}.functions`,
          "function",
          issues,
          options,
        );
    }
  const modelField = Object.hasOwn(raw, "model")
    ? "model"
    : Object.hasOwn(raw, "models")
      ? "models"
      : undefined;
  if (modelField)
    validateItemModel(raw[modelField], source, modelField, options, issues);
  const legacyField = Object.hasOwn(raw, "legacy_model")
    ? "legacy_model"
    : Object.hasOwn(raw, "legacy-model")
      ? "legacy-model"
      : undefined;
  if (legacyField)
    validateLegacyItemModel(raw[legacyField], source, legacyField, issues);
  issues.push(
    ...validateSchemaNumberProviders({
      value: raw,
      source,
      rootPath: ["item"],
      fieldsForContext: itemFieldsForContext,
      fieldForName: itemSchemaFieldForName,
      domain: "item",
      domainLabel: Messages.src.config.item.parser.text0064,
    }),
  );
}

function records(value: unknown): readonly unknown[] {
  if (isUnknownArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (/^(?:true|yes|on)$/iu.test(value)) return true;
    if (/^(?:false|no|off)$/iu.test(value)) return false;
  }
  return fallback;
}

function integerValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[-+]?\d+$/u.test(value.trim()))
    return Number(value);
  return undefined;
}

function craftEngineIntegerValue(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value))
    return Math.trunc(value);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replaceAll("_", "");
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/iu.test(normalized))
    return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function sectionValue(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (isRecord(value)) return value;
  const first: unknown = isUnknownArray(value) ? value.at(0) : undefined;
  return isRecord(first) ? first : undefined;
}

function validateExternalProcessor(
  value: unknown,
  source: ConfigurationSource,
  processorPath: string,
  issues: CoreIssue[],
): void {
  const section = sectionValue(value);
  if (!section) return;
  if (section.plugin === null || section.plugin === undefined) {
    if (section.source === null || section.source === undefined) {
      issues.push(
        issueAtKey(
          source,
          "invalid-item-data-value",
          Messages.src.config.item.parser.text0065(processorPath),
          "error",
          processorPath,
        ),
      );
    }
  }
  if (section.id === null || section.id === undefined) {
    issues.push(
      issueAtKey(
        source,
        "invalid-item-data-value",
        Messages.src.config.item.parser.text0066(processorPath),
        "error",
        processorPath,
      ),
    );
  }
}

function validateItemUpdater(
  value: unknown,
  source: ConfigurationSource,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  const updater = sectionValue(value);
  if (!updater) return;
  for (const [version, rawOperations] of Object.entries(updater)) {
    if (!/^[+-]?\d+$/u.test(version)) continue;
    const operations: readonly unknown[] = isUnknownArray(rawOperations)
      ? rawOperations
      : [rawOperations];
    for (const [index, rawOperation] of operations.entries()) {
      const operation = sectionValue(rawOperation);
      if (!operation || typeof operation.type !== "string") continue;
      const operationPath = isUnknownArray(rawOperations)
        ? `updater.${version}.${index}`
        : `updater.${version}`;
      const type = registeredDiscriminator(
        operation.type,
        "craftengine",
        ITEM_UPDATER_TYPES,
        Messages.src.config.item.parser.text0067,
        "unknown-item-updater-type",
        source,
        `${operationPath}.type`,
        options,
        issues,
      );
      if (!type) continue;
      if (type === "craftengine:apply_data") {
        if (!Object.hasOwn(operation, "data")) {
          issues.push(
            issueAtValue(
              source,
              "invalid-item-updater-value",
              Messages.src.config.item.parser.text0068(operationPath),
              "error",
              `${operationPath}.type`,
            ),
          );
        } else if (!sectionValue(operation.data)) {
          issues.push(
            issueAtValue(
              source,
              "invalid-item-updater-value",
              Messages.src.config.item.parser.text0069(operationPath),
              "error",
              `${operationPath}.data`,
            ),
          );
        } else {
          validateItemDataContainer(
            sectionValue(operation.data)!,
            `${operationPath}.data`,
            source,
            options,
            issues,
          );
        }
      } else if (type === "craftengine:reset") {
        const keepComponents = field(operation, [
          "keep_components",
          "keep-components",
        ]);
        if (!keepComponents) continue;
        const [fieldName, fieldValue] = keepComponents;
        const values: readonly unknown[] = isUnknownArray(fieldValue)
          ? fieldValue
          : [fieldValue];
        for (const [componentIndex, component] of values.entries()) {
          const id = makeIdentifier(
            String(component).toLowerCase(),
            "minecraft",
          );
          if (
            component !== null &&
            component !== undefined &&
            isValidIdentifier(id)
          )
            continue;
          const componentPath = `${operationPath}.${fieldName}${isUnknownArray(fieldValue) ? `.${componentIndex}` : ""}`;
          issues.push(
            issueAtValue(
              source,
              "invalid-item-updater-value",
              Messages.src.config.item.parser.text0070(componentPath),
              "error",
              componentPath,
            ),
          );
        }
      }
    }
  }
}

function validateEnchantmentProcessor(
  value: unknown,
  source: ConfigurationSource,
  processorPath: string,
  issues: CoreIssue[],
): void {
  const section = sectionValue(value);
  if (!section) return;
  const extended =
    Object.hasOwn(section, "merge") || Object.hasOwn(section, "enchantments");
  if (
    extended &&
    Object.hasOwn(section, "merge") &&
    !isCraftEngineBoolean(section.merge)
  ) {
    issues.push(
      issueAtValue(
        source,
        "invalid-item-data-value",
        Messages.src.config.item.parser.text0071(processorPath),
        "error",
        `${processorPath}.merge`,
      ),
    );
  }
  if (extended && !Object.hasOwn(section, "enchantments")) {
    issues.push(
      issueAtKey(
        source,
        "invalid-item-data-value",
        Messages.src.config.item.parser.text0072(processorPath),
        "error",
        processorPath,
      ),
    );
    return;
  }
  const enchantments = extended ? sectionValue(section.enchantments) : section;
  if (!enchantments) return;
  const enchantmentPath = extended
    ? `${processorPath}.enchantments`
    : processorPath;
  for (const [id, rawLevel] of Object.entries(enchantments)) {
    const level = craftEngineIntegerValue(rawLevel);
    if (level !== undefined && level >= 1 && level <= 255) continue;
  // 不是固定文字时, 可能需要按计算式处理
    if (typeof rawLevel === "string" && level === undefined) continue;
    issues.push(
      issueAtValue(
        source,
        "invalid-item-data-value",
        Messages.src.config.item.parser.text0073(enchantmentPath, id),
        "error",
        `${enchantmentPath}.${id}`,
      ),
    );
  }
}

function validateJukeboxPlayableProcessor(
  value: unknown,
  processorPath: string,
  source: ConfigurationSource,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(
      issueAtValue(
        source,
        "invalid-jukebox-playable",
        Messages.src.config.item.parser.text0074,
        "error",
        processorPath,
      ),
    );
    return;
  }
  const id = makeIdentifier(value.toLowerCase(), "minecraft");
  if (!isValidIdentifier(id)) {
    issues.push(
      issueAtValue(
        source,
        "invalid-jukebox-playable",
        Messages.src.config.item.parser.text0075(value),
        "error",
        processorPath,
      ),
    );
    return;
  }
  const root = canonicalPath(source.pack.resourcesRoot);
  const customExists =
    options.jukeboxSongs?.some(
      (song) =>
        song.source.pack.active &&
        canonicalPath(song.source.pack.resourcesRoot) === root &&
        song.id === id,
    ) ?? false;
  const referenceCatalogAvailable =
    options.jukeboxSongs !== undefined ||
    options.vanillaJukeboxSongs !== undefined;
  if (
    referenceCatalogAvailable &&
    !customExists &&
    !options.vanillaJukeboxSongs?.has(id)
  ) {
    issues.push(
      issueAtValue(
        source,
        "unknown-jukebox-song",
        Messages.src.config.item.parser.text0076(id),
        "warning",
        processorPath,
      ),
    );
  }
}

function validateComponentsProcessor(
  value: unknown,
  processorPath: string,
  source: ConfigurationSource,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  if (!isRecord(value) || !options.vanillaComponents) return;
  for (const [key, component] of Object.entries(value)) {
    // 组件 ID 不能改变大小写
    const id = makeIdentifier(key, "minecraft");
    const componentPath = `${processorPath}.${key}`;
    if (options.vanillaComponents.has(id)) {
      for (const componentIssue of validateDataComponentValue(id, component)) {
        const issuePath =
          componentIssue.path.length === 0
            ? componentPath
            : `${componentPath}.${componentIssue.path.join(".")}`;
        issues.push(
          (componentIssue.at === "key" ? issueAtKey : issueAtValue)(
            source,
            "invalid-data-component-value",
            componentIssue.message,
            "error",
            issuePath,
          ),
        );
      }
      continue;
    }
    if (isRegistryDiscriminatorSyntax(key, "minecraft")) {
      issues.push(
        issueAtKey(
          source,
          "unknown-data-component",
          Messages.src.config.item.parser.text0077(id),
          "error",
          componentPath,
        ),
      );
    } else if (options.unknownExtensionSyntax === "warning") {
      issues.push(
        issueAtKey(
          source,
          "unknown-data-component",
          Messages.src.config.item.parser.text0078(id),
          "warning",
          componentPath,
        ),
      );
    }
  }
}

function validateItemDataContainer(
  container: Readonly<Record<string, unknown>>,
  containerPath: string,
  source: ConfigurationSource,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): void {
  for (const [rawProcessorName, value] of Object.entries(container)) {
    const processorName = localCraftEngineType(rawProcessorName);
    if (processorName === undefined) continue;
    const processorPath = `${containerPath}.${rawProcessorName}`;
    if (processorName === "enchantments" || processorName === "enchantment") {
      validateEnchantmentProcessor(value, source, processorPath, issues);
    } else if (processorName === "external") {
      validateExternalProcessor(value, source, processorPath, issues);
    } else if (processorName === "jukebox_playable") {
      validateJukeboxPlayableProcessor(
        value,
        processorPath,
        source,
        options,
        issues,
      );
    } else if (
      processorName === "components" ||
      processorName === "component"
    ) {
      validateComponentsProcessor(
        value,
        processorPath,
        source,
        options,
        issues,
      );
    }
  }
}

function rebasedSource(
  source: ConfigurationSource,
  prefix: string,
): ConfigurationSource {
  const keyRanges = new Map<string, TextRange>();
  const valueRanges = new Map<string, TextRange>();
  const childPrefix = `${prefix}.`;
  for (const [fieldPath, range] of source.fieldKeyRanges) {
    if (fieldPath.startsWith(childPrefix))
      keyRanges.set(fieldPath.slice(childPrefix.length), range);
  }
  for (const [fieldPath, range] of source.fieldValueRanges) {
    if (fieldPath.startsWith(childPrefix))
      valueRanges.set(fieldPath.slice(childPrefix.length), range);
  }
  return {
    ...source,
    entryRange: source.fieldValueRanges.get(prefix) ?? source.entryRange,
    fieldKeyRanges: keyRanges,
    fieldValueRanges: valueRanges,
    sectionKey: `${source.sectionKey}:inline-block`,
  };
}

function inlineBlockConfigurations(
  configurations: readonly ConfigurationCandidateInput[],
): ConfigurationCandidateInput[] {
  const result: ConfigurationCandidateInput[] = [];
  for (const candidate of configurations) {
    if (candidate.kind !== "item" || !isRecord(candidate.value)) continue;
    const selected = field(candidate.value, ["behaviors", "behavior"]);
    if (!selected) continue;
    const values = isUnknownArray(selected[1]) ? selected[1] : [selected[1]];
    values.forEach((behavior, index) => {
      if (
        !isRecord(behavior) ||
        typeof behavior.type !== "string" ||
        !BLOCK_ITEM_BEHAVIOR_TYPES.has(
          registryName(behavior.type, "craftengine"),
        ) ||
        !isRecord(behavior.block)
      )
        return;
      const prefix = isUnknownArray(selected[1])
        ? `${selected[0]}.${index}.block`
        : `${selected[0]}.block`;
      result.push({
        kind: "block",
        rawId: candidate.rawId,
        value: behavior.block,
        source: rebasedSource(candidate.source, prefix),
      });
    });
  }
  return result;
}

function inlineFurnitureConfigurations(
  configurations: readonly ConfigurationCandidateInput[],
): ConfigurationCandidateInput[] {
  const result: ConfigurationCandidateInput[] = [];
  for (const candidate of configurations) {
    if (candidate.kind !== "item" || !isRecord(candidate.value)) continue;
    const selected = field(candidate.value, ["behaviors", "behavior"]);
    if (!selected) continue;
    const values = isUnknownArray(selected[1]) ? selected[1] : [selected[1]];
    values.forEach((behavior, index) => {
      if (
        !isRecord(behavior) ||
        typeof behavior.type !== "string" ||
        !FURNITURE_ITEM_BEHAVIOR_TYPES.has(
          registryName(behavior.type, "craftengine"),
        ) ||
        !isRecord(behavior.furniture)
      )
        return;
      const prefix = isUnknownArray(selected[1])
        ? `${selected[0]}.${index}.furniture`
        : `${selected[0]}.furniture`;
      result.push({
        kind: "furniture",
        rawId: candidate.rawId,
        value: behavior.furniture,
        source: {
          ...rebasedSource(candidate.source, prefix),
          sectionKey: `${candidate.source.sectionKey}:inline-furniture`,
        },
      });
    });
  }
  return result;
}

function validateFurnitureItemReferences(
  items: readonly ItemDefinition[],
  furniture: readonly FurnitureDefinition[],
  issues: CoreIssue[],
): void {
  for (const item of items) {
    const selected = field(item.raw, ["behaviors", "behavior"]);
    if (!selected) continue;
    const values = isUnknownArray(selected[1]) ? selected[1] : [selected[1]];
    values.forEach((behavior, index) => {
      if (
        !isRecord(behavior) ||
        typeof behavior.type !== "string" ||
        !FURNITURE_ITEM_BEHAVIOR_TYPES.has(
          registryName(behavior.type, "craftengine"),
        ) ||
        typeof behavior.furniture !== "string"
      )
        return;
      const fieldPath = isUnknownArray(selected[1])
        ? `${selected[0]}.${index}.furniture`
        : `${selected[0]}.furniture`;
  // 直接写名称时使用 minecraft 命名空间, 只有声明键使用当前包
      const id = makeIdentifier(behavior.furniture.toLowerCase(), "minecraft");
      if (!isValidIdentifier(id)) {
        issues.push(
          issueAtValue(
            item.source,
            "invalid-furniture-item-reference",
            Messages.src.config.item.parser.text0079(behavior.furniture),
            "error",
            fieldPath,
          ),
        );
        return;
      }
      if (/\$\{/u.test(behavior.furniture)) return;
      const root = canonicalPath(item.source.pack.resourcesRoot);
      if (
        !furniture.some(
          (entry) =>
            entry.id === id &&
            canonicalPath(entry.source.pack.resourcesRoot) === root &&
            entry.source.pack.active,
        )
      )
        issues.push(
          issueAtValue(
            item.source,
            "unknown-furniture-item-reference",
            Messages.src.config.item.parser.text0080(id),
            "error",
            fieldPath,
          ),
        );
      const target = furniture.find(
        (entry) =>
          entry.id === id &&
          canonicalPath(entry.source.pack.resourcesRoot) === root &&
          entry.source.pack.active,
      );
      if (target && isRecord(behavior.rules))
        for (const variant of Object.keys(behavior.rules)) {
          if (!target.variants.has(variant))
            issues.push(
              issueAtKey(
                item.source,
                "unknown-furniture-placement-variant",
                Messages.src.config.item.parser.text0081(
                  fieldPath.replace(/\.furniture$/u, ".rules"),
                  variant,
                  id,
                ),
                "warning",
                fieldPath.replace(/\.furniture$/u, `.rules.${variant}`),
              ),
            );
        }
    });
  }
}

function validateBlockItemReferences(
  items: readonly ItemDefinition[],
  blocks: readonly BlockDefinition[],
  issues: CoreIssue[],
): void {
  for (const item of items) {
    const selected = field(item.raw, ["behaviors", "behavior"]);
    if (!selected) continue;
    const values = isUnknownArray(selected[1]) ? selected[1] : [selected[1]];
    values.forEach((behavior, index) => {
      if (
        !isRecord(behavior) ||
        typeof behavior.type !== "string" ||
        !BLOCK_ITEM_BEHAVIOR_TYPES.has(
          registryName(behavior.type, "craftengine"),
        ) ||
        typeof behavior.block !== "string"
      )
        return;
      const fieldPath = isUnknownArray(selected[1])
        ? `${selected[0]}.${index}.block`
        : `${selected[0]}.block`;
      const id = makeIdentifier(behavior.block.toLowerCase(), "minecraft");
      if (!isValidIdentifier(id)) {
        issues.push(
          issueAtValue(
            item.source,
            "invalid-block-item-reference",
            Messages.src.config.item.parser.text0082(behavior.block),
            "error",
            fieldPath,
          ),
        );
        return;
      }
      if (/\$\{/u.test(behavior.block)) return;
      const root = canonicalPath(item.source.pack.resourcesRoot);
      if (
        !blocks.some(
          (block) =>
            block.id === id &&
            canonicalPath(block.source.pack.resourcesRoot) === root &&
            block.source.pack.active,
        )
      ) {
        issues.push(
          issueAtValue(
            item.source,
            "unknown-block-item-reference",
            Messages.src.config.item.parser.text0083(id),
            "error",
            fieldPath,
          ),
        );
      }
    });
  }
}

function relatedItems(
  values: readonly ItemDefinition[],
  current: ItemDefinition,
  fieldName?: string,
): NonNullable<CoreIssue["related"]> {
  return values
    .filter((value) => value !== current)
    .map((value) => ({
      message: Messages.src.config.item.parser.text0084(
        value.source.pack.name,
        value.source.pack.active,
        value.source.kind,
      ),
      uri: value.source.uri,
      range: sourceRange(value.source, fieldName, fieldName === undefined),
    }));
}

function parseItem(
  candidate: ConfigurationCandidateInput,
  options: ItemBuildOptions,
  issues: CoreIssue[],
): ItemDefinition | undefined {
  if (!isRecord(candidate.value)) return undefined;
  const source = candidate.source;
  const id = makeIdentifier(candidate.rawId, source.pack.namespace);
  if (!isValidIdentifier(id)) {
    issues.push(
      issue(
        source,
        "invalid-item-id",
        Messages.src.config.item.parser.text0085(id),
        "error",
      ),
    );
    return undefined;
  }
  const [namespace, value] = splitIdentifier(id, source.pack.namespace);
  const raw = candidate.value;
  validateItemConfiguration(raw, source, options, issues);
  const vanillaOverride = options.vanillaMaterials?.has(id) ?? false;
  const materialField = field(raw, ["material"]);
  const materialRaw = vanillaOverride
    ? id
    : typeof materialField?.[1] === "string"
      ? materialField[1]
      : "minecraft:nether_brick";
  const material = makeIdentifier(materialRaw.toLowerCase(), "minecraft");
  if (!isValidIdentifier(material)) {
    issues.push(
      issue(
        source,
        "invalid-material",
        Messages.src.config.item.parser.text0086(materialRaw),
        "error",
        materialField?.[0],
      ),
    );
  } else if (material === "minecraft:air") {
    issues.push(
      issue(
        source,
        "unknown-material",
        Messages.src.config.item.parser.text0087(material),
        "error",
        materialField?.[0],
      ),
    );
  }

  const clientMaterialField = field(raw, [
    "client_bound_material",
    "client-bound-material",
  ]);
  const clientMaterialRaw =
    typeof clientMaterialField?.[1] === "string"
      ? clientMaterialField[1]
      : material;
  const clientBoundMaterial = makeIdentifier(
    clientMaterialRaw.toLowerCase(),
    "minecraft",
  );
  if (!isValidIdentifier(clientBoundMaterial)) {
    issues.push(
      issue(
        source,
        "invalid-client-material",
        Messages.src.config.item.parser.text0088(clientMaterialRaw),
        "error",
        clientMaterialField?.[0],
      ),
    );
  } else if (clientBoundMaterial === "minecraft:air") {
    issues.push(
      issue(
        source,
        "unknown-client-material",
        Messages.src.config.item.parser.text0089(clientBoundMaterial),
        "error",
        clientMaterialField?.[0],
      ),
    );
  }

  const cmdField = field(raw, ["custom_model_data", "custom-model-data"]);
  let customModelData: number | undefined;
  if (cmdField && !vanillaOverride) {
    const parsed = integerValue(cmdField[1]);
    if (parsed === undefined) {
      issues.push(
        issue(
          source,
          "invalid-custom-model-data",
          Messages.src.config.item.parser.text0090,
          "error",
          cmdField[0],
        ),
      );
    } else if (parsed > 16_777_216) {
      issues.push(
        issue(
          source,
          "custom-model-data-range",
          Messages.src.config.item.parser.text0091,
          "error",
          cmdField[0],
        ),
      );
    } else if (parsed > 0) {
      customModelData = parsed;
    }
  }

  const itemModelField = field(raw, ["item_model", "item-model"]);
  const itemModel =
    !vanillaOverride && typeof itemModelField?.[1] === "string"
      ? makeIdentifier(itemModelField[1].toLowerCase(), "minecraft")
      : undefined;
  if (!vanillaOverride && itemModelField && itemModel === undefined) {
    issues.push(
      issue(
        source,
        "invalid-item-model",
        Messages.src.config.item.parser.text0092,
        "error",
        itemModelField[0],
      ),
    );
  } else if (itemModel && !isValidIdentifier(itemModel)) {
    issues.push(
      issue(
        source,
        "invalid-item-model",
        Messages.src.config.item.parser.text0093(itemModel),
        "error",
        itemModelField?.[0],
      ),
    );
  }

  const modelField = field(raw, ["model", "models"]);
  const legacyModelField = field(raw, ["legacy_model", "legacy-model"]);
  const textureField = field(raw, ["texture", "textures"]);
  const data = isRecord(raw.data) ? raw.data : {};
  const clientDataField = field(raw, [
    "client_bound_data",
    "client-bound-data",
  ]);
  const settings = isRecord(raw.settings) ? raw.settings : {};
    // equipment 要去自己的列表里查, equippable 仍直接读取当前配置
  const equipmentSettings = isRecord(settings.equipment)
    ? settings.equipment
    : undefined;
  const equipmentAssetRaw =
    equipmentSettings?.asset_id ?? equipmentSettings?.["asset-id"];
  const equipmentAssetId =
    typeof equipmentAssetRaw === "string"
      ? makeIdentifier(equipmentAssetRaw.toLowerCase(), "minecraft")
      : undefined;
  const equipmentSlot =
    typeof equipmentSettings?.slot === "string"
      ? equipmentSettings.slot.toLowerCase()
      : undefined;
  const behaviorsField = field(raw, ["behaviors", "behavior"]);
  const clientBoundModelField = field(raw, [
    "client_bound_model",
    "client-bound-model",
  ]);

  return {
    id,
    namespace,
    value,
    source,
    raw,
    material,
    clientBoundMaterial,
    ...(customModelData === undefined ? {} : { customModelData }),
    ...(itemModel === undefined ? {} : { itemModel }),
    clientBoundModel: booleanValue(clientBoundModelField?.[1], true),
    ...(modelField === undefined ? {} : { model: modelField[1] }),
    ...(legacyModelField === undefined
      ? {}
      : { legacyModel: legacyModelField[1] }),
    textures:
      typeof textureField?.[1] === "string"
        ? [textureField[1]]
        : isUnknownArray(textureField?.[1])
          ? textureField[1].filter(
              (entry): entry is string => typeof entry === "string",
            )
          : [],
    data,
    clientBoundData: isRecord(clientDataField?.[1]) ? clientDataField[1] : {},
    ...(equipmentAssetId === undefined ? {} : { equipmentAssetId }),
    ...(equipmentSlot === undefined ? {} : { equipmentSlot }),
    behaviors: records(behaviorsField?.[1]),
    claimsModelSlot:
      Object.hasOwn(raw, "model") ||
      Object.hasOwn(raw, "models") ||
      Object.hasOwn(raw, "texture") ||
      Object.hasOwn(raw, "textures") ||
      Object.hasOwn(raw, "legacy_model") ||
      Object.hasOwn(raw, "legacy-model"),
  };
}

function addItemConflicts(
  items: readonly ItemDefinition[],
  issues: CoreIssue[],
): void {
  const active = items.filter((item) => item.source.pack.active);
  const byId = groupBy(
    active,
    (item) =>
      `${canonicalPath(item.source.pack.resourcesRoot)}\u0000${item.id}`,
  );
  for (const values of byId.values()) {
    if (values.length < 2) continue;
    for (const item of values) {
      issues.push(
        issue(
          item.source,
          "duplicate-item-id",
          Messages.src.config.item.parser.text0094(item.id),
          "error",
          undefined,
          relatedItems(values, item),
        ),
      );
    }
  }

  const claims = active.filter(
    (item) => item.customModelData !== undefined && item.claimsModelSlot,
  );
  const byCmd = groupBy(
    claims,
    (item) =>
      `${canonicalPath(item.source.pack.resourcesRoot)}\u0000${item.clientBoundMaterial}\u0000${item.customModelData ?? 0}`,
  );
  for (const values of byCmd.values()) {
    if (values.length < 2) continue;
    for (const item of values) {
      issues.push(
        issue(
          item.source,
          "custom-model-data-conflict",
          Messages.src.config.item.parser.text0095(
            item.clientBoundMaterial,
            item.customModelData ?? 0,
          ),
          "error",
          item.source.fieldValueRanges.has("custom_model_data")
            ? "custom_model_data"
            : "custom-model-data",
          relatedItems(
            values,
            item,
            item.source.fieldValueRanges.has("custom_model_data")
              ? "custom_model_data"
              : "custom-model-data",
          ),
        ),
      );
    }
  }
}

export function buildItemIndex(
  configurations: readonly ConfigurationCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  options: ItemBuildOptions,
): ItemBuildResult {
  const issues = [...inheritedIssues];
  const items: ItemDefinition[] = [];
  for (const candidate of configurations) {
    if (candidate.kind === "item") {
      const item = parseItem(candidate, options, issues);
      if (item) items.push(item);
    }
  }
  const blockIndex = buildBlockIndex(
    [...configurations, ...inlineBlockConfigurations(configurations)],
    [],
    {
      includeInactiveDiagnostics: options.includeInactiveDiagnostics,
      ...(options.unknownExtensionSyntax === undefined
        ? {}
        : { unknownExtensionSyntax: options.unknownExtensionSyntax }),
      ...(options.vanillaBlocks === undefined
        ? {}
        : { vanillaBlocks: options.vanillaBlocks }),
      ...(options.vanillaBlockStates === undefined
        ? {}
        : { vanillaBlockStates: options.vanillaBlockStates }),
    },
  );
  issues.push(...blockIndex.issues);
  const furnitureIndex = buildFurnitureIndex(
    [...configurations, ...inlineFurnitureConfigurations(configurations)],
    [],
    {
      includeInactiveDiagnostics: options.includeInactiveDiagnostics,
      ...(options.unknownExtensionSyntax === undefined
        ? {}
        : { unknownExtensionSyntax: options.unknownExtensionSyntax }),
      ...(options.vanillaMaterials === undefined
        ? {}
        : { vanillaItems: options.vanillaMaterials }),
      ...(options.vanillaBlocks === undefined
        ? {}
        : { vanillaBlocks: options.vanillaBlocks }),
      ...(options.vanillaEntityTypes === undefined
        ? {}
        : { vanillaEntityTypes: options.vanillaEntityTypes }),
      items,
      blocks: blockIndex.blocks,
    },
  );
  issues.push(...furnitureIndex.issues);
  validateBlockItemReferences(items, blockIndex.blocks, issues);
  validateFurnitureItemReferences(items, furnitureIndex.furniture, issues);
  addItemConflicts(items, issues);
  const visibleIssues = issues.filter(
    (entry) =>
      options.includeInactiveDiagnostics ||
      configurations.some(
        (candidate) =>
          candidate.source.uri === entry.uri && candidate.source.pack.active,
      ),
  );
  return {
    items,
    blocks: blockIndex.blocks,
    furniture: furnitureIndex.furniture,
    issues: visibleIssues,
  };
}
