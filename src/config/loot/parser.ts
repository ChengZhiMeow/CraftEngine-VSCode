import type { CoreIssue } from "../../diagnostics/model.js";
import type { VanillaBlockStateCatalog } from "../../minecraft/block/states.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { appendPath as at, canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { fieldsForDiscriminator, CONDITION_TYPES } from "../item/schema.js";
import type { SchemaField } from "../schema/types.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import {
  LOOT_ENTRY_TYPES,
  LOOT_FORMULA_TYPES,
  LOOT_FUNCTION_TYPES,
  lootFieldsForContext,
  vanillaLootFieldsForContext,
  VANILLA_LOOT_TYPES,
} from "./schema.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import type { LootDefinition } from "./model.js";
import { validateNumberProviderValue } from "../number-provider/schema.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";

import { Messages } from "../../messages.js";
export interface LootBuildOptions {
  readonly includeInactiveDiagnostics: boolean;
  readonly unknownExtensionSyntax?: "ignore" | "warning";
  readonly itemIds?: ReadonlySet<string>;
  readonly vanillaBlocks?: ReadonlySet<string>;
  readonly vanillaBlockStates?: VanillaBlockStateCatalog;
  readonly vanillaEntityTypes?: ReadonlySet<string>;
}

export interface LootBuildResult {
  readonly lootTables: readonly LootDefinition[];
  readonly issues: readonly CoreIssue[];
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  fieldPath = "",
  key = false,
): CoreIssue {
  const range = !fieldPath
    ? source.idRange
    : ((key ? source.fieldKeyRanges : source.fieldValueRanges).get(fieldPath) ??
      source.fieldKeyRanges.get(fieldPath) ??
      source.entryRange);
  return { code, message, severity, uri: source.uri, range };
}

function fieldValue(
  raw: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? [[key, String(value)] as const]
        : [],
    ),
  );
}

function selectedValue(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): readonly [name: string, value: unknown] | undefined {
  for (const name of names) {
    // 只能读自有属性: YAML 映射承载在普通对象上, 原型链上的同名键不是配置
    const value = Object.hasOwn(raw, name) ? raw[name] : undefined;
    if (value !== null && value !== undefined) return [name, value];
  }
  return undefined;
}

function validateKnownFields(
  raw: Readonly<Record<string, unknown>>,
  fields: readonly SchemaField[],
  source: ConfigurationSource,
  fieldPath: string,
  label: string,
  issues: CoreIssue[],
  missingCode = "missing-loot-field",
  extraKnown: readonly string[] = [],
): void {
  const known = new Set([
    ...fields.flatMap((candidate) => [candidate.label, ...candidate.aliases]),
    ...extraKnown,
  ].map((name) => name.replaceAll("-", "_")));
  for (const key of Object.keys(raw)) {
    if (known.has(key.replaceAll("-", "_"))) continue;
    switch (key) {
      case "template":
      case "templates":
      case "arguments":
      case "overrides":
      case "merges":
        continue;
    }
    issues.push(
      issue(
        source,
        "unknown-loot-field",
        Messages.src.config.loot.parser.text0001(label, key),
        "warning",
        at(fieldPath, key),
        true,
      ),
    );
  }
  for (const candidate of fields) {
    const accepted = new Set(
      [candidate.label, ...candidate.aliases].map((name) =>
        name.replaceAll("-", "_"),
      ),
    );
    const present = Object.keys(raw).filter((name) =>
      accepted.has(name.replaceAll("-", "_")),
    );
    if (candidate.required && present.length === 0)
      issues.push(
        issue(
          source,
          missingCode,
          Messages.src.config.loot.parser.text0002(label, candidate.label),
          "error",
          fieldPath,
        ),
      );
    if (present.length > 1)
      issues.push(
        issue(
          source,
          "conflicting-loot-alias",
          Messages.src.config.loot.parser.text0003(label, present.join(", ")),
          "warning",
          at(fieldPath, present.at(-1)!),
          true,
        ),
      );
  }
}

function validateType(
  raw: Readonly<Record<string, unknown>>,
  known: readonly string[],
  source: ConfigurationSource,
  fieldPath: string,
  label: string,
  options: LootBuildOptions,
  issues: CoreIssue[],
  allowNegated = false,
): string | undefined {
  if (typeof raw.type !== "string" || raw.type.trim() === "") {
    issues.push(
      issue(
        source,
        "missing-loot-type",
        Messages.src.config.loot.parser.text0004(label),
        "error",
        fieldPath,
      ),
    );
    return undefined;
  }
  const normalized = allowNegated ? raw.type.replace(/^!/u, "") : raw.type;
  const type = localRegistryDiscriminator(normalized);
  if (type && known.includes(type)) return type;
  const severity = isValidRegistryDiscriminator(normalized)
    ? options.unknownExtensionSyntax === "warning"
      ? "warning"
      : undefined
    : "error";
  if (severity)
    issues.push(
      issue(
        source,
        "unknown-loot-type",
        Messages.src.config.loot.parser.text0005(label, raw.type),
        severity,
        at(fieldPath, "type"),
      ),
    );
  return undefined;
}

function validateList(
  raw: unknown,
  fieldPath: string,
  visit: (entry: unknown, entryPath: string) => void,
): void {
  if (raw === undefined) return;
  if (isUnknownArray(raw)) {
    raw.forEach((entry, index) => visit(entry, at(fieldPath, index)));
  } else {
  // 单个值和对象也会被当成只有一项的列表, 不要只接受数组
    visit(raw, fieldPath);
  }
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value.trim().replaceAll("_", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validateNumberProvider(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  issues: CoreIssue[],
): void {
  for (const problem of validateNumberProviderValue(value)) {
    let code: string;
    switch (problem.code) {
      case "unknown-type":
        code = "unknown-loot-number-provider-type";
        break;
      case "missing-field":
      case "missing-type":
        code = "missing-loot-number-provider-field";
        break;
      default:
        code =
          problem.severity === "warning"
            ? "unsafe-loot-number-provider"
            : "invalid-loot-number-provider";
    }
    issues.push(
      issue(
        source,
        code,
        `${fieldPath}: ${problem.message}`,
        problem.severity,
        problem.path.reduce(
          (result, segment) => at(result, segment),
          fieldPath,
        ),
      ),
    );
  }
}

function validateConditions(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  options: LootBuildOptions,
  issues: CoreIssue[],
): void {
  validateList(
    value,
    fieldPath,
    (entry, entryPath) => {
      if (!isRecord(entry)) {
        issues.push(
          issue(
            source,
            "invalid-loot-condition",
            Messages.src.config.loot.parser.text0009(entryPath),
            "error",
            entryPath,
          ),
        );
        return;
      }
      validateKnownFields(
        entry,
        fieldsForDiscriminator(
          "condition",
          validateType(
            entry,
            CONDITION_TYPES,
            source,
            entryPath,
            Messages.src.config.loot.parser.text0010,
            options,
            issues,
            true,
          ),
        ),
        source,
        entryPath,
        Messages.src.config.loot.parser.text0011,
        issues,
      );
      for (const key of ["terms", "term"])
        if (entry[key] !== undefined)
          validateConditions(
            entry[key],
            source,
            at(entryPath, key),
            options,
            issues,
          );
    },
  );
}

function validateFormula(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  options: LootBuildOptions,
  issues: CoreIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      issue(
        source,
        "invalid-loot-formula",
        Messages.src.config.loot.parser.text0012(fieldPath),
        "error",
        fieldPath,
      ),
    );
    return;
  }
  const type = validateType(
    value,
    LOOT_FORMULA_TYPES,
    source,
    fieldPath,
    Messages.src.config.loot.parser.text0013,
    options,
    issues,
  );
  validateKnownFields(
    value,
    lootFieldsForContext({
      path: ["inline:loot", "formula"],
      siblingValues: fieldValue(value),
    }),
    source,
    fieldPath,
    type
      ? Messages.src.config.loot.parser.text0014(type)
      : Messages.src.config.loot.parser.text0015,
    issues,
  );
  const probability = value.probability ?? value.chance;
  if (
    value.extra !== undefined &&
    (!Number.isInteger(finiteNumber(value.extra)) ||
      finiteNumber(value.extra)! < 0)
  )
    issues.push(
      issue(
        source,
        "invalid-loot-formula-field",
        Messages.src.config.loot.parser.text0016(fieldPath),
        "error",
        at(fieldPath, "extra"),
      ),
    );
  if (probability !== undefined) {
    const parsed = finiteNumber(probability);
    if (parsed === undefined)
      issues.push(
        issue(
          source,
          "invalid-loot-formula-field",
          Messages.src.config.loot.parser.text0017(fieldPath),
          "error",
          at(
            fieldPath,
            value.probability === undefined ? "chance" : "probability",
          ),
        ),
      );
    else if (parsed < 0 || parsed > 1)
      issues.push(
        issue(
          source,
          "unsafe-loot-probability",
          Messages.src.config.loot.parser.text0018(fieldPath),
          "warning",
          at(
            fieldPath,
            value.probability === undefined ? "chance" : "probability",
          ),
        ),
      );
  }
}

function validateFunctions(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  options: LootBuildOptions,
  issues: CoreIssue[],
): void {
  validateList(
    value,
    fieldPath,
    (entry, entryPath) => {
      if (!isRecord(entry)) {
        issues.push(
          issue(
            source,
            "invalid-loot-function",
            Messages.src.config.loot.parser.text0020(entryPath),
            "error",
            entryPath,
          ),
        );
        return;
      }
      const type = validateType(
        entry,
        LOOT_FUNCTION_TYPES,
        source,
        entryPath,
        Messages.src.config.loot.parser.text0021,
        options,
        issues,
      );
      validateKnownFields(
        entry,
        lootFieldsForContext({
          path: ["inline:loot", "functions", "0"],
          siblingValues: fieldValue(entry),
        }),
        source,
        entryPath,
        type
          ? Messages.src.config.loot.parser.text0022(type)
          : Messages.src.config.loot.parser.text0023,
        issues,
      );
      const conditions = selectedValue(entry, ["condition", "conditions"]);
      if (conditions)
        validateConditions(
          conditions[1],
          source,
          at(entryPath, conditions[0]),
          options,
          issues,
        );
      if (type === "apply_bonus" && entry.formula !== undefined)
        validateFormula(
          entry.formula,
          source,
          at(entryPath, "formula"),
          options,
          issues,
        );
      for (const key of ["count", "amount", "min", "max"]) {
        if (entry[key] !== undefined)
          validateNumberProvider(
            entry[key],
            source,
            at(entryPath, key),
            issues,
          );
      }
      if (
        type === "apply_bonus" &&
        entry.enchantment !== undefined &&
        typeof entry.enchantment !== "string"
      )
        issues.push(
          issue(
            source,
            "invalid-loot-function-field",
            Messages.src.config.loot.parser.text0024(entryPath),
            "error",
            at(entryPath, "enchantment"),
          ),
        );
      if (
        type === "apply_data" &&
        entry.data !== undefined &&
        !isRecord(entry.data)
      )
        issues.push(
          issue(
            source,
            "invalid-loot-function-field",
            Messages.src.config.loot.parser.text0025(entryPath),
            "error",
            at(entryPath, "data"),
          ),
        );
      if (
        type === "set_count" &&
        entry.add !== undefined &&
        typeof entry.add !== "boolean"
      )
        issues.push(
          issue(
            source,
            "invalid-loot-function-field",
            Messages.src.config.loot.parser.text0026(entryPath),
            "error",
            at(entryPath, "add"),
          ),
        );
    },
  );
}

function validateEntries(
  value: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  options: LootBuildOptions,
  issues: CoreIssue[],
): void {
  validateList(
    value,
    fieldPath,
    (entry, entryPath) => {
      if (!isRecord(entry)) {
        issues.push(
          issue(
            source,
            "invalid-loot-entry",
            Messages.src.config.loot.parser.text0028(entryPath),
            "error",
            entryPath,
          ),
        );
        return;
      }
      const type = validateType(
        entry,
        LOOT_ENTRY_TYPES,
        source,
        entryPath,
        Messages.src.config.loot.parser.text0029,
        options,
        issues,
      );
      const ignoredItemCounts =
        type === "item"
          ? ["count", "amount"].filter((key) => Object.hasOwn(entry, key))
          : [];
      validateKnownFields(
        entry,
        lootFieldsForContext({
          path: ["inline:loot", "entries", "0"],
          siblingValues: fieldValue(entry),
        }),
        source,
        entryPath,
        type
          ? Messages.src.config.loot.parser.text0030(type)
          : Messages.src.config.loot.parser.text0031,
        issues,
        "missing-loot-field",
        ignoredItemCounts,
      );
      for (const key of ignoredItemCounts)
        issues.push(
          issue(
            source,
            "ignored-loot-item-count",
            Messages.src.config.loot.parser.text0032(entryPath, key),
            "warning",
            at(entryPath, key),
            true,
          ),
        );
      const conditions = selectedValue(entry, ["condition", "conditions"]);
      if (conditions)
        validateConditions(
          conditions[1],
          source,
          at(entryPath, conditions[0]),
          options,
          issues,
        );
      validateFunctions(
        entry.functions,
        source,
        at(entryPath, "functions"),
        options,
        issues,
      );
      if (
        (type === "alternatives" || type === "if_else") &&
        entry.children !== undefined
      )
        validateEntries(
          entry.children,
          source,
          at(entryPath, "children"),
          options,
          issues,
        );
      if (type === "exp")
        for (const key of ["count", "amount", "exp"]) {
          if (entry[key] !== undefined)
            validateNumberProvider(
              entry[key],
              source,
              at(entryPath, key),
              issues,
            );
        }
      // 只有 item / furniture_item 条目里的 item|id 是原版物品 ID;
      // loot_table 的 id 指向战利品表, function 的 run 里才是函数, 都不能按物品校验
      const itemKey =
        type === "item" || type === "furniture_item"
          ? Object.hasOwn(entry, "item")
            ? "item"
            : Object.hasOwn(entry, "id")
              ? "id"
              : undefined
          : undefined;
      if (itemKey) {
        if (typeof entry[itemKey] !== "string")
          issues.push(
            issue(
              source,
              "invalid-loot-item-id",
              Messages.src.config.loot.parser.text0033(entryPath, itemKey),
              "error",
              at(entryPath, itemKey),
            ),
          );
        else {
          const id = makeIdentifier(entry[itemKey].toLowerCase(), "minecraft");
          if (!isValidIdentifier(id))
            issues.push(
              issue(
                source,
                "invalid-loot-item-id",
                Messages.src.config.loot.parser.text0034(id),
                "error",
                at(entryPath, itemKey),
              ),
            );
          else if (options.itemIds && !options.itemIds.has(id))
            issues.push(
              issue(
                source,
                "unknown-loot-item-id",
                Messages.src.config.loot.parser.text0035(id),
                "error",
                at(entryPath, itemKey),
              ),
            );
        }
      }
      for (const key of ["weight", "quality"])
        if (
          entry[key] !== undefined &&
          !Number.isInteger(finiteNumber(entry[key]))
        ) {
          issues.push(
            issue(
              source,
              "invalid-loot-entry-weight",
              Messages.src.config.loot.parser.text0036(entryPath, key),
              "error",
              at(entryPath, key),
            ),
          );
        }
      if (entry.weight !== undefined && (finiteNumber(entry.weight) ?? 1) <= 0)
        issues.push(
          issue(
            source,
            "unsafe-loot-entry-weight",
            Messages.src.config.loot.parser.text0037(entryPath),
            "warning",
            at(entryPath, "weight"),
          ),
        );
    },
  );
}

export function validateLootTable(
  raw: unknown,
  source: ConfigurationSource,
  fieldPath: string,
  options: LootBuildOptions,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  if (!isRecord(raw)) {
    issues.push(
      issue(
        source,
        "invalid-loot-table",
        Messages.src.config.loot.parser.text0038(
          fieldPath || Messages.src.config.loot.parser.text0039,
        ),
        "error",
        fieldPath,
      ),
    );
    return issues;
  }
  // 最外层 type 为 block 或 entity 时只是提示用途, 不要当成未知字段
  validateKnownFields(
    raw,
    lootFieldsForContext({
      path: ["inline:loot"],
      siblingValues: new Map(),
    }),
    source,
    fieldPath,
    Messages.src.config.loot.parser.text0039,
    issues,
    "missing-loot-field",
    typeof raw.type === "string" &&
      ["block", "entity"].includes(raw.type.toLowerCase())
      ? ["type"]
      : [],
  );
  validateList(
    raw.pools,
    at(fieldPath, "pools"),
    (pool, poolPath) => {
      if (!isRecord(pool)) {
        issues.push(
          issue(
            source,
            "invalid-loot-pool",
            Messages.src.config.loot.parser.text0041(poolPath),
            "error",
            poolPath,
          ),
        );
        return;
      }
      validateKnownFields(
        pool,
        lootFieldsForContext({
          path: ["inline:loot", "pools", "0"],
          siblingValues: fieldValue(pool),
        }),
        source,
        poolPath,
        Messages.src.config.loot.parser.text0042,
        issues,
      );
      const conditions = selectedValue(pool, ["condition", "conditions"]);
      if (conditions)
        validateConditions(
          conditions[1],
          source,
          at(poolPath, conditions[0]),
          options,
          issues,
        );
      validateEntries(
        pool.entries,
        source,
        at(poolPath, "entries"),
        options,
        issues,
      );
      validateFunctions(
        pool.functions,
        source,
        at(poolPath, "functions"),
        options,
        issues,
      );
      for (const key of ["rolls", "bonus_rolls", "bonus-rolls"]) {
        if (pool[key] !== undefined)
          validateNumberProvider(pool[key], source, at(poolPath, key), issues);
      }
    },
  );
  validateFunctions(
    raw.functions,
    source,
    at(fieldPath, "functions"),
    options,
    issues,
  );
  return issues;
}

function validateVanillaLoot(
  candidate: ConfigurationCandidateInput,
  options: LootBuildOptions,
): readonly CoreIssue[] {
  if (candidate.kind !== "vanilla-loot") return [];
  const id = candidate.rawId;
  const issues: CoreIssue[] = [];
  if (!isRecord(candidate.value)) {
    issues.push(
      issue(
        candidate.source,
        "invalid-vanilla-loot",
        Messages.src.config.loot.parser.text0044(id),
        "error",
      ),
    );
    return issues;
  }
  const raw = candidate.value;
  validateKnownFields(
    raw,
    vanillaLootFieldsForContext({
      path: [candidate.rawId],
      siblingValues: fieldValue(raw),
    }),
    candidate.source,
    "",
    Messages.src.config.loot.parser.text0045(id),
    issues,
  );
  const parsedType = validateType(
    raw,
    VANILLA_LOOT_TYPES,
    candidate.source,
    "",
    Messages.src.config.loot.parser.text0046,
    options,
    issues,
  );
  const type =
    parsedType === "block"
      ? "block_break"
      : parsedType === "entity"
        ? "entity_death"
        : parsedType === "shear_block"
          ? "block_shear"
          : parsedType;

  if (raw.override !== undefined) {
    try {
      craftEngineBoolean(raw.override);
    } catch {
      issues.push(
        issue(
          candidate.source,
          "invalid-vanilla-loot-override",
          Messages.src.config.loot.parser.text0047,
          "error",
          "override",
        ),
      );
    }
  }

  const overwrite = raw.overwrite;
  if (overwrite !== undefined) {
    const tokens = isUnknownArray(overwrite) ? overwrite : [overwrite];
    tokens.forEach((token, index) => {
      const fieldPath = isUnknownArray(overwrite)
        ? `overwrite.${index}`
        : "overwrite";
      if (
        typeof token !== "string" ||
        !["none", "all", "items", "item", "experience", "exp"].includes(
          token.toLowerCase(),
        )
      )
        issues.push(
          issue(
            candidate.source,
            "invalid-loot-source-overwrite",
            `Loot Source ${id} 的 overwrite 仅支持 none、all、items、item、experience 或 exp`,
            "error",
            fieldPath,
          ),
        );
    });
  }

  const selectedTarget = selectedValue(raw, ["target", "targets"]);
  const targets = selectedTarget
    ? isUnknownArray(selectedTarget[1])
      ? selectedTarget[1]
      : [selectedTarget[1]]
    : [];
  if (
    selectedTarget &&
    (type === "fishing" || type === "piglin_barter")
  )
    issues.push(
      issue(
        candidate.source,
        "loot-source-target-not-allowed",
        `Loot Source 类型 ${type} 不允许配置 target`,
        "error",
        selectedTarget[0],
      ),
    );
  targets.forEach((target, index) => {
    const targetPath =
      selectedTarget && isUnknownArray(selectedTarget[1])
        ? `${selectedTarget[0]}.${index}`
        : (selectedTarget?.[0] ?? "target");
    if (
      !["string", "number", "boolean"].includes(typeof target) ||
      String(target).trim() === ""
    ) {
      issues.push(
        issue(
          candidate.source,
          "invalid-vanilla-loot-target",
          Messages.src.config.loot.parser.text0049,
          "error",
          targetPath,
        ),
      );
      return;
    }
    if (String(target).includes("["))
      issues.push(
        issue(
          candidate.source,
          "invalid-loot-source-target",
          `Loot Source ${id} 的 target 只能是 Key，不能携带方块状态属性`,
          "error",
          targetPath,
        ),
      );
    const targetId = makeIdentifier(String(target).toLowerCase(), "minecraft");
    if (!isValidIdentifier(targetId))
      issues.push(
        issue(
          candidate.source,
          "invalid-loot-source-target",
          Messages.src.config.loot.parser.text0049,
          "error",
          targetPath,
        ),
      );
  });

  const selectedConditions = selectedValue(raw, ["condition", "conditions"]);
  if (selectedConditions)
    validateConditions(
      selectedConditions[1],
      candidate.source,
      selectedConditions[0],
      options,
      issues,
    );

  const lootKey = Object.hasOwn(raw, "loot")
    ? "loot"
    : Object.hasOwn(raw, "loots")
      ? "loots"
      : undefined;
  if (lootKey) {
    const loot = raw[lootKey];
    if (isRecord(loot))
      issues.push(
        ...validateLootTable(loot, candidate.source, lootKey, options),
      );
    else if (
      typeof loot !== "string" &&
      typeof loot !== "number" &&
      typeof loot !== "boolean" &&
      typeof loot !== "bigint"
    )
      issues.push(...validateLootTable(loot, candidate.source, lootKey, options));
    else {
      const lootId = makeIdentifier(String(loot).toLowerCase(), "minecraft");
      if (!isValidIdentifier(lootId))
        issues.push(
          issue(
            candidate.source,
            "invalid-loot-reference",
            Messages.src.config.loot.parser.text0052(lootId),
            "error",
            lootKey,
          ),
        );
    }
  }
  return issues;
}

export function buildLootIndex(
  configurations: readonly ConfigurationCandidateInput[],
  options: LootBuildOptions,
): LootBuildResult {
  const issues: CoreIssue[] = [];
  const lootTables = configurations.flatMap((candidate) => {
    if (candidate.kind !== "loot" || !isRecord(candidate.value)) return [];
    const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);
    issues.push(
      ...validateLootTable(candidate.value, candidate.source, "", options),
    );
    const [namespace, value] = splitIdentifier(
      id,
      candidate.source.pack.namespace,
    );
    return [
      {
        kind: "loot" as const,
        id,
        namespace,
        value,
        source: candidate.source,
        raw: candidate.value,
      },
    ];
  });
  for (const candidate of configurations)
    issues.push(...validateVanillaLoot(candidate, options));
  for (const values of groupBy(
    lootTables.filter((loot) => loot.source.pack.active),
    (loot) => `${canonicalPath(loot.source.pack.resourcesRoot)}\0${loot.id}`,
  ).values()) {
    if (values.length < 2) continue;
    for (const loot of values)
      issues.push({
        code: "duplicate-loot-id",
        message: Messages.src.config.loot.parser.text0054(loot.id),
        severity: "error",
        uri: loot.source.uri,
        range: loot.source.idRange,
        related: values
          .filter((other) => other !== loot)
          .map((other) => ({
            message: Messages.src.config.loot.parser.text0055(
              other.source.pack.name,
              other.source.pack.active
                ? Messages.common.active
                : Messages.common.inactive,
            ),
            uri: other.source.uri,
            range: other.source.idRange,
          })),
      });
  }
  const activeUris = new Set(
    configurations
      .filter((entry) => entry.source.pack.active)
      .map((entry) => entry.source.uri),
  );
  return {
    lootTables,
    issues: issues.filter(
      (entry) =>
        options.includeInactiveDiagnostics || activeUris.has(entry.uri),
    ),
  };
}

export function validateInlineLootValues(
  definitions: readonly Readonly<{
    raw: Readonly<Record<string, unknown>>;
    source: ConfigurationSource;
    namespace: string;
  }>[],
  lootTables: readonly LootDefinition[],
  options: LootBuildOptions,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const knownByRoot = new Map<string, Set<string>>();
  for (const loot of lootTables.filter((entry) => entry.source.pack.active)) {
    const root = canonicalPath(loot.source.pack.resourcesRoot);
    const values = knownByRoot.get(root) ?? new Set<string>();
    values.add(loot.id);
    knownByRoot.set(root, values);
  }
  const walk = (
    value: unknown,
    source: ConfigurationSource,
    fieldPath = "",
  ): void => {
    if (isUnknownArray(value)) {
      value.forEach((entry, index) =>
        walk(entry, source, at(fieldPath, index)),
      );
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = at(fieldPath, key);
      if (key !== "loot" && key !== "loots") {
        walk(child, source, childPath);
        continue;
      }
      if (typeof child !== "string") {
        issues.push(...validateLootTable(child, source, childPath, options));
        continue;
      }

      const id = makeIdentifier(child.toLowerCase(), "minecraft");
      if (!isValidIdentifier(id))
        issues.push(
          issue(
            source,
            "invalid-loot-reference",
            Messages.src.config.loot.parser.text0056(id),
            "error",
            childPath,
          ),
        );
      else if (
        !id.startsWith("minecraft:") &&
        !knownByRoot.get(canonicalPath(source.pack.resourcesRoot))?.has(id)
      )
        issues.push(
          issue(
            source,
            "missing-loot-reference",
            Messages.src.config.loot.parser.text0057(id),
            "error",
            childPath,
          ),
        );
    }
  };
  for (const definition of definitions) walk(definition.raw, definition.source);

  const activeUris = new Set(
    definitions
      .filter((definition) => definition.source.pack.active)
      .map((definition) => definition.source.uri),
  );
  const seen = new Set<string>();
  return issues.filter((entry) => {
    if (!options.includeInactiveDiagnostics && !activeUris.has(entry.uri))
      return false;
    const key = `${entry.uri}\0${entry.range.start}\0${entry.range.end}\0${entry.severity}\0${entry.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
