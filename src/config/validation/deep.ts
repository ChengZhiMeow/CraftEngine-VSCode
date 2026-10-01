import {
  blockFieldsForContext,
  blockGenerationTextureSlotFields,
  blockListItemField,
} from "../block/schema.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import { evaluateExpression } from "../expression/evaluator.js";
import {
  furnitureFieldsForContext,
  furnitureListItemField,
  FURNITURE_BEHAVIOR_TYPES,
} from "../furniture/schema.js";
import {
  dataComponentDefinition,
  dataComponentDynamicEntry,
  dataComponentFields,
  dataComponentListItemField,
  dataComponentPathContext,
  dataComponentValueField,
} from "../item/dataComponents.js";
import {
  fieldsForDiscriminator,
  itemDataDynamicValueField,
  itemDataProcessorField,
  itemFieldsForContext,
  itemListItemField,
  itemOpenMappingPath,
  itemSchemaFieldForName,
  itemSettingField,
  resolveFunctionOrConditionType,
} from "../item/schema.js";
import {
  lootFieldsForContext,
  lootListItemField,
  vanillaLootFieldsForContext,
} from "../loot/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import { validateSchemaNumberProviders } from "../number-provider/validation.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
import { parseVanillaBlockState } from "../../minecraft/block/states.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { deduplicateCoreIssues } from "../../util/issues.js";
import { isValidIdentifier, makeIdentifier } from "../../util/identifiers.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { validateSchema, type SchemaConstraintResult } from "./schema.js";
import {
  VANILLA_PARTICLE_PATHS,
  booleanConstraint,
  candidateLabel,
  compactPath,
  customIssue,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  firstMapping,
  genericField,
  hasExternalParticleOwner,
  issueCodes,
  isScalar,
  itemDataProcessorName,
  listItemField,
  localCraftEngineKey,
  localCraftEngineType,
  mappingOrList,
  normalizedPath,
  obviouslyInvalidRegex,
  oneProblem,
  onlyTemplateControlFields,
  originalSemantic,
  passiveKnownFields,
  prepareDiscriminatorFields,
  problem,
  registeredMappingFields,
  resolvedRegisteredFields,
  scalarText,
  stripKeySuffix,
  validCraftEngineColor,
  valueAt,
  withoutIdControlValidation,
  type DeepCandidateKind,
} from "./shared.js";

import { Messages } from "../../messages.js";
function mappedContextWithType(
  context: SchemaContext,
  type: string | undefined,
): SchemaContext {
  if (type === undefined || context.siblingValues.has("type")) return context;
  const siblings = new Map(context.siblingValues);
  siblings.set("type", type);
  return { ...context, siblingValues: siblings };
}

function inferElementType(context: SchemaContext): string | undefined {
  if (context.siblingValues.has("text")) return "text_display";
  if (context.siblingValues.has("item")) return "item_display";
  if (context.siblingValues.has("block")) return "block_display";
  return undefined;
}

function canonicalComponentContext(context: SchemaContext): SchemaContext {
  const path = [...context.path];
  const marker = path.findIndex(
    (part, index) =>
      index > 0 &&
      ["components", "component"].includes(
        stripKeySuffix(part)
          .replaceAll("-", "_")
          .replace(/^craftengine:/u, ""),
      ),
  );
  if (marker >= 0)
    path[marker] = stripKeySuffix(path[marker]!)
      .replace(/^craftengine:/u, "")
      .replaceAll("-", "_");
  const id = marker < 0 ? undefined : path[marker + 1];
  if (id !== undefined && !/^\d+$/u.test(id) && !id.includes(":"))
    path[marker + 1] = `minecraft:${id}`;
  return { ...context, path };
}

function componentSchemaFields(
  root: unknown,
  actualContext: SchemaContext,
  schemaContext: SchemaContext,
): readonly SchemaField[] | undefined {
  const canonical = canonicalComponentContext(schemaContext);
  const component = dataComponentPathContext(canonical.path);
  if (!component) return undefined;
  const node = valueAt(root, actualContext.path, 1);
  if (component.componentId === undefined) {
    if (!isRecord(node)) return [];
    return Object.keys(node).map((key) => {
      const canonicalId = key.includes(":") ? key : `minecraft:${key}`;
      return dynamicValidationField(
        dataComponentValueField(canonicalId) ??
          genericField(
            key,
            dataComponentDefinition(canonicalId)?.detail ??
              Messages.src.config.validation.deep.text0001,
          ),
        key,
      );
    });
  }
  const base = dataComponentFields(
    component.componentId,
    component.payloadPath,
    canonical,
  );
  const dynamic = dataComponentDynamicEntry(
    component.componentId,
    component.payloadPath,
  );
  if (!dynamic || !isRecord(node)) return base;
  return [
    ...base,
    ...Object.keys(node)
      .filter((key) => !exactFieldForName(key, base))
      .map((key) =>
        dynamicValidationField(
          dynamic.valueForKey?.(key) ??
            dynamic.value ??
            genericField(key, Messages.src.config.validation.deep.text0002),
          key,
        ),
      ),
  ];
}

function itemConditionalFields(
  fields: readonly SchemaField[],
  context: SchemaContext,
): readonly SchemaField[] {
  const type = resolveFunctionOrConditionType(
    "function",
    context.siblingValues.get("type"),
  )?.name;
  const required = new Set<string>();
  let all: boolean;
  try {
    all = craftEngineBoolean(context.siblingValues.get("all"));
  } catch {
    all = false;
  }
  if (type === "remove_potion_effect" && !all) required.add("potion_effect");
  if (type === "remove_cooldown" && !all) required.add("id");
  if (type === "set_variable" && !context.siblingValues.has("number"))
    required.add("text");
  const compact = compactPath(context.path);
  if (
    compact.at(-1) === "display" &&
    context.siblingValues.get("type") === "override"
  )
    required.add("value");
  if (compact.at(-1) === "insert_lore" || compact.at(-1) === "fallback") {
    required.add("lore");
    if (
      ["before", "after"].includes(context.siblingValues.get("position") ?? "")
    )
      required.add("pattern");
  }
  if (compact.at(-1) === "remove_lore") required.add("pattern");
  return fields.map((field) =>
    required.has(field.semantic) || required.has(field.label)
      ? { ...field, required: true }
      : field,
  );
}

function mergeFields(
  ...groups: readonly (readonly SchemaField[])[]
): readonly SchemaField[] {
  const merged = new Map<string, SchemaField>();
  for (const group of groups)
    for (const field of group)
      if (!merged.has(field.semantic)) merged.set(field.semantic, field);
  return [...merged.values()];
}

function withEventListEntryFields(
  fields: readonly SchemaField[],
  context: SchemaContext,
): readonly SchemaField[] {
  const nested = normalizedPath(context.path);
  if (
    !["events", "event"].includes(nested[0] ?? "") ||
    nested.length !== 2 ||
    !/^\d+$/u.test(nested[1] ?? "")
  ) {
    return fields;
  }
  const wrapper = itemFieldsForContext({
    ...context,
    path: ["inline:event", "events"],
  }).map((field) =>
    field.label === "type" ? { ...field, required: false } : field,
  );
  return context.siblingValues.get("type") === undefined
    ? wrapper
    : mergeFields(fields, wrapper);
}

function itemMappedFields(
  root: unknown,
  actualContext: SchemaContext,
  schemaContext: SchemaContext,
): readonly SchemaField[] {
  const compact = compactPath(actualContext.path);
  // 内联方块和家具已由各自配置检查, 这里不要重复检查
  if (
    ["behavior", "behaviors"].includes(compact[0] ?? "") &&
    (compact[1] === "block" || compact[1] === "furniture")
  )
    return [];
  const node = valueAt(root, actualContext.path, 1);
  const nested = normalizedPath(schemaContext.path);
  let base: readonly SchemaField[];
  if (
    nested.length === 1 &&
    (nested[0] === "data" || nested[0] === "client_bound_data")
  ) {
    base = resolvedRegisteredFields(node, itemDataProcessorField);
  } else if (nested.length === 1 && nested[0] === "settings") {
    base = resolvedRegisteredFields(node, itemSettingField);
  } else {
    base =
      componentSchemaFields(root, actualContext, schemaContext) ??
      itemFieldsForContext(schemaContext);
  }
  base = withEventListEntryFields(base, schemaContext);
  if (
    nested[0] === "model" ||
    nested[0] === "models" ||
    nested[0] === "legacy_model"
  ) {
    base = passiveKnownFields(base);
  }
  base = itemConditionalFields(
    prepareDiscriminatorFields(base, schemaContext),
    schemaContext,
  );
  const additions: SchemaField[] = [];
  if (isRecord(node)) {
    for (const key of Object.keys(node)) {
      if (exactFieldForName(key, base)) continue;
      const dynamic = itemDataDynamicValueField(schemaContext, key);
      if (dynamic) additions.push(dynamicValidationField(dynamic, key));
    }
  }
  return [...exactFields(withoutIdControlValidation(base)), ...additions];
}

function blockMappedFields(
  candidate: ConfigurationCandidateInput,
  context: SchemaContext,
): readonly SchemaField[] {
  const node = valueAt(candidate.value, context.path, 1);
  const compact = compactPath(context.path);
  const routed =
    compact.at(-1) === "entity_renderer" || compact.at(-1) === "entity_render"
      ? mappedContextWithType(context, inferElementType(context))
      : context;
  let base = blockFieldsForContext(routed);
  base = withEventListEntryFields(base, routed);
  const behaviorEntry = ["behavior", "behaviors"].includes(
    compact.at(-1) ?? "",
  );
  base = prepareDiscriminatorFields(base, routed, behaviorEntry);
  if (behaviorEntry) base = passiveKnownFields(base);
  if (compact.at(-1) === "settings") base = registeredMappingFields(base, node);
  if (
    compact.at(-1) === "textures" &&
    compact.includes("generation") &&
    isRecord(node)
  ) {
    const slots = blockGenerationTextureSlotFields();
    base = Object.keys(node).map((key) =>
      dynamicValidationField(
        exactFieldForName(key, slots) ??
          genericField(
            key,
            Messages.src.config.validation.deep.text0003,
            "texture",
          ),
        key,
      ),
    );
  }
  return exactFields(withoutIdControlValidation(base));
}

function furnitureMappedFields(
  candidate: ConfigurationCandidateInput,
  context: SchemaContext,
): readonly SchemaField[] {
  const node = valueAt(candidate.value, context.path, 1);
  const compact = compactPath(context.path);
  const elementEntry = compact.at(-1) === "elements";
  const routed = elementEntry
    ? mappedContextWithType(context, inferElementType(context))
    : context;
  let base = furnitureFieldsForContext(routed);
  base = withEventListEntryFields(base, routed);
  const behaviorEntry = ["behavior", "behaviors"].includes(
    compact.at(-1) ?? "",
  );
  base = prepareDiscriminatorFields(
    base,
    routed,
    behaviorEntry || (elementEntry && inferElementType(context) === undefined),
  );
  if (behaviorEntry || elementEntry) base = passiveKnownFields(base);
  if (compact.at(-1) === "settings") base = registeredMappingFields(base, node);
  if (["events", "event"].includes(compact.at(-1) ?? "") && isRecord(node)) {
    base = mergeFields(
      base,
      Object.keys(node).map((key) =>
        dynamicValidationField(
          genericField(key, Messages.src.config.validation.deep.text0004),
          key,
        ),
      ),
    );
  }
  return exactFields(withoutIdControlValidation(base));
}

function lootItemDataContext(
  context: SchemaContext,
): SchemaContext | undefined {
  const nested = normalizedPath(context.path);
  const functionIndex = nested.lastIndexOf("functions");
  const dataIndex = nested.indexOf("data", Math.max(functionIndex, 0));
  if (functionIndex < 0 || dataIndex < 0) return undefined;
  return {
    ...context,
    path: ["inline:loot-data", "data", ...context.path.slice(dataIndex + 2)],
  };
}

function lootMappedFields(
  candidate: ConfigurationCandidateInput,
  context: SchemaContext,
): readonly SchemaField[] {
  const itemData = lootItemDataContext(context);
  if (itemData) return itemMappedFields(candidate.value, context, itemData);
  return exactFields(
    withoutIdControlValidation(
      prepareDiscriminatorFields(lootFieldsForContext(context), context),
    ),
  );
}

function vanillaLootMappedFields(
  context: SchemaContext,
): readonly SchemaField[] {
  const compact = compactPath(context.path);
  if (["loot", "loots"].includes(compact[0] ?? "")) return [];
  if (
    compact.some(
      (part) =>
        part === "condition" || part === "conditions" || part === "term" || part === "terms",
    )
  )
    return exactFields(
      prepareDiscriminatorFields(
        fieldsForDiscriminator(
          "condition",
          context.siblingValues.get("type"),
        ),
        context,
      ),
    );
  return exactFields(
    withoutIdControlValidation(
      vanillaLootFieldsForContext(context).map((field) =>
        field.label === "target" || field.label === "loot"
          ? { ...field, required: false }
          : field,
      ),
    ),
  );
}

function ceExternalType(value: string | undefined): boolean {
  if (!value) return false;
  const raw = value.replace(/^!/u, "");
  const separator = raw.indexOf(":");
  return (
    separator >= 0 && raw.slice(0, separator) !== "craftengine"
  );
}

function functionOrConditionOwnedOpenMapping(context: SchemaContext): boolean {
  const compact = compactPath(context.path);
  const functionTypes = (context.ancestorTypes ?? []).map(
    (type) => resolveFunctionOrConditionType("function", type)?.name,
  );
  if (
    compact.includes("properties") &&
    ((context.ancestorTypes ?? [])
      .map((type) => resolveFunctionOrConditionType("condition", type)?.name)
      .includes("match_block_property") ||
      functionTypes.includes("update_block_property") ||
      functionTypes.includes("transform_block"))
  )
    return true;
  return compact.includes("loot") && functionTypes.includes("drop_loot");
}

function deepOpenMapping(
  kind: DeepCandidateKind,
  context: SchemaContext,
): boolean {
  const compact = compactPath(context.path);
  const tail = compact.at(-1);
  if (functionOrConditionOwnedOpenMapping(context)) return true;
  if (kind === "item" || kind === "loot") {
    if (
      itemOpenMappingPath(
        kind === "loot"
          ? (lootItemDataContext(context)?.path ?? context.path)
          : context.path,
      )
    )
      return true;
    if (["tags", "nbt", "pdc"].includes(compact[1] ?? "")) return true;
    const component = dataComponentPathContext(
      canonicalComponentContext(context).path,
    );
    if (
      component?.componentId &&
      dataComponentDefinition(component.componentId)?.kind === "opaque"
    )
      return true;
    if (
      component &&
      (component.componentId === undefined ||
        dataComponentDynamicEntry(component.componentId, component.payloadPath))
    )
      return true;
  }
  if (kind === "block") {
    if (
      ["properties", "appearance", "appearances", "variants"].includes(
        tail ?? "",
      )
    )
      return true;
    if (tail === "arguments" || tail === "overrides" || tail === "merges")
      return true;
  }
  if (kind === "furniture") {
    if (["variant", "variants", "placement"].includes(tail ?? "")) return true;
    if (tail === "arguments" || tail === "overrides" || tail === "merges")
      return true;
    const behavior = context.ancestorTypes?.find(
      (type) =>
        localCraftEngineType(type, FURNITURE_BEHAVIOR_TYPES) !== undefined,
    );
    if (
      behavior &&
      localCraftEngineType(behavior, FURNITURE_BEHAVIOR_TYPES) ===
        "glowing_furniture" &&
      compact.includes("variants")
    )
      return true;
  }
  return false;
}

function deepConstraint(
  candidate: ConfigurationCandidateInput,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const boolean = booleanConstraint(candidate.kind, context);
  if (boolean) return boolean;
  const semantic = originalSemantic(context.field);
  const compact = compactPath(context.path);
  if (
    candidate.kind === "item" &&
    semantic === "gravity" &&
    compact[0] === "settings" &&
    compact[1] === "projectile"
  ) {
  // 布尔值最终会变成 TRUE 或 FALSE
    const valid =
      typeof context.value === "boolean" ||
      (typeof context.value === "string" &&
        ["true", "false", "undefined"].includes(context.value.toLowerCase()));
    return valid
      ? { replaceBuiltIn: true }
      : oneProblem(
          problem(
            "invalid-item-enum",
            Messages.src.config.validation.deep.text0005(
              candidateLabel(candidate),
              context.fieldPath,
            ),
          ),
          true,
        );
  }
  if (
    candidate.kind === "block" &&
    semantic === "auto_state" &&
    isRecord(context.value)
  ) {
    return { replaceBuiltIn: true };
  }
  if (context.field.valueProvider === "particle") {
    if (
      typeof context.value !== "string" ||
      !isValidIdentifier(makeIdentifier(context.value, "minecraft"))
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-particle`,
          Messages.src.config.validation.deep.text0006(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    const particle = makeIdentifier(context.value, "minecraft");
    if (
      particle.startsWith("minecraft:") &&
      !VANILLA_PARTICLE_PATHS.has(particle.slice("minecraft:".length))
    ) {
      return oneProblem(
        problem(
          `unknown-${candidate.kind}-particle`,
          Messages.src.config.validation.deep.text0007(
            candidateLabel(candidate),
            context.fieldPath,
            particle,
          ),
        ),
        true,
      );
    }
  // 游戏运行时可以添加新粒子, 本地列表不能判断其数据是否正确
    return { replaceBuiltIn: true };
  }
  const particle = scalarText(context.siblingValues.get("particle"));
  if (
    particle !== undefined &&
    context.field.valueProvider === "block-state" &&
    (typeof context.value !== "string" ||
      parseVanillaBlockState(context.value) === undefined)
  ) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-block-state`,
        Messages.src.config.validation.deep.text0008(
          candidateLabel(candidate),
          context.fieldPath,
        ),
      ),
      true,
    );
  }
  if (
    particle !== undefined &&
    ["color", "from", "to"].includes(semantic) &&
    !validCraftEngineColor(context.value)
  ) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-color`,
        Messages.src.config.validation.deep.text0009(
          candidateLabel(candidate),
          context.fieldPath,
        ),
      ),
      true,
    );
  }
  if (semantic === "target" && isRecord(context.value))
    return { replaceBuiltIn: true };
  if (
    semantic === "target" &&
    context.field.values &&
    typeof context.value === "string"
  ) {
    return context.field.values.includes(context.value)
      ? { replaceBuiltIn: true }
      : oneProblem(
          problem(
            `invalid-${candidate.kind}-enum`,
            Messages.src.config.validation.deep.text0010(
              candidateLabel(candidate),
              context.fieldPath,
              context.field.values.join("、"),
            ),
          ),
          true,
        );
  }
  const processor = itemDataProcessorName(context);
  if (processor !== undefined) {
  // 空值必须跳过, internal:icon/2d 需要这种处理
    if (context.value === null) return { replaceBuiltIn: true };
    const processorScalar = scalarText(context.value);
    if (
      (processor === "overwritable_item_model" ||
        processor === "overwritable_equippable_asset_id") &&
      processorScalar !== undefined &&
      !isValidIdentifier(makeIdentifier(processorScalar, "minecraft"))
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-identifier`,
          Messages.src.config.validation.deep.text0011(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (
      processor === "overwritable_dyed_color" &&
      !validCraftEngineColor(context.value)
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-color`,
          Messages.src.config.validation.deep.text0012(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    const mappingValue = firstMapping(context.value);
    const mappingProcessors = new Set([
      "arguments",
      "set_arguments",
      "food",
      "external",
      "equippable",
      "enchantments",
      "enchantment",
      "components",
      "component",
      "pdc",
      "tags",
      "nbt",
      "trim",
      "conditional",
      "condition",
      "use_remainder",
      "dynamic_lore",
    ]);
    if (mappingProcessors.has(processor) && mappingValue === undefined) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-processor-shape`,
          Messages.src.config.validation.deep.text0013(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (
      processor === "dynamic_lore" &&
      mappingValue !== undefined &&
      Object.keys(mappingValue).length === 0
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-nonempty-mapping`,
          Messages.src.config.validation.deep.text0014(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    const scalarProcessors = new Set([
      "item_model",
      "overwritable_item_model",
      "id",
      "overwritable_equippable_asset_id",
      "dyed_color",
      "display_name",
      "item_name",
      "custom_name",
      "overwritable_item_name",
      "jukebox_playable",
      "tooltip_style",
      "overwritable_dyed_color",
      "painting_variant",
    ]);
    if (scalarProcessors.has(processor) && !isScalar(context.value)) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-processor-shape`,
          Messages.src.config.validation.deep.text0015(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (
      (processor === "block_state" ||
        processor === "blockstate" ||
        processor === "profile") &&
      typeof context.value !== "string" &&
      !isRecord(context.value)
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-processor-shape`,
          Messages.src.config.validation.deep.text0016(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (
      (processor === "lore" ||
        processor === "overwritable_lore" ||
        processor === "insert_lore") &&
      typeof context.value !== "string" &&
      !isUnknownArray(context.value) &&
      !isRecord(context.value)
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-processor-shape`,
          Messages.src.config.validation.deep.text0017(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
  }
  if (
    (semantic === "behavior" ||
      semantic === "behaviors" ||
      semantic === "particles" ||
      (semantic === "particle" && context.field.snippet.includes("\n"))) &&
    !mappingOrList(context.value)
  ) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-mapping-or-list`,
        Messages.src.config.validation.deep.text0018(
          candidateLabel(candidate),
          context.fieldPath,
        ),
      ),
    );
  }
  if (semantic === "bone_meal" && firstMapping(context.value) === undefined) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-mapping`,
        Messages.src.config.validation.deep.text0019(
          candidateLabel(candidate),
          context.fieldPath,
        ),
      ),
    );
  }
  if (context.field.valueProvider === "number-provider")
    return { replaceBuiltIn: true };
  if (context.field.valueProvider === "number") {
    if (
      (typeof context.value === "number" && Number.isFinite(context.value)) ||
      typeof context.value === "boolean"
    ) {
      return { replaceBuiltIn: true };
    }
    if (typeof context.value === "string" && context.value.trim() !== "") {
      let value: unknown;
      try {
        value = evaluateExpression(context.value.replaceAll("_", ""));
      } catch {
        value = undefined;
      }
      if (
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean"
      )
        return { replaceBuiltIn: true };
    }
  }
  if (semantic === "type" && context.field.values) {
    if (typeof context.value !== "string") {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-type`,
          Messages.src.config.validation.deep.text0020(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    const raw = context.value.startsWith("!")
      ? context.value.slice(1)
      : context.value;
    const known =
      context.field.values.includes(context.value) ||
      context.field.values.includes(raw) ||
      (candidate.kind === "vanilla-loot" &&
        context.field.values.some(
          (value) => value.toLowerCase() === raw.toLowerCase(),
        )) ||
      (localCraftEngineKey(raw) !== undefined &&
        context.field.values.includes(localCraftEngineKey(raw)!));
    if (known || ceExternalType(raw)) return { replaceBuiltIn: true };
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-type`,
        Messages.src.config.validation.deep.text0021(
          candidateLabel(candidate),
          context.fieldPath,
          context.value,
        ),
      ),
      true,
    );
  }
  if (
    semantic !== "type" &&
    context.field.values &&
    semantic === "on"
  ) {
    const triggers = Array.isArray(context.value)
      ? context.value
      : [context.value];
    if (
      triggers.length > 0 &&
      triggers.every(
        (trigger) => typeof trigger === "string" && trigger.trim() !== "",
      )
    )
      // EventTrigger 是可写注册表；除内置 ID 与别名外还允许插件注册的触发器。
      return { replaceBuiltIn: true };
  }
  if (
    semantic !== "type" &&
    context.field.values &&
    typeof context.value === "string"
  ) {
    const configured = context.value;
    if (
      !context.field.values.some(
        (value) => value.toLowerCase() === configured.toLowerCase(),
      )
    )
      return undefined;
    return { replaceBuiltIn: true };
  }
  if (
    semantic === "pattern" &&
    typeof context.value === "string" &&
    (compactPath(context.path).some(
      (part) => part === "insert_lore" || part === "remove_lore",
    ) ||
      context.siblingValues.get("type") === "regex") &&
    obviouslyInvalidRegex(context.value)
  ) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-regex`,
        Messages.src.config.validation.deep.text0022(
          candidateLabel(candidate),
          context.fieldPath,
        ),
      ),
    );
  }
  return undefined;
}

export function validateDeepCandidate(
  candidate: ConfigurationCandidateInput & { readonly kind: DeepCandidateKind },
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const fieldsForContext = (context: SchemaContext): readonly SchemaField[] => {
    if (functionOrConditionOwnedOpenMapping(context)) return [];
    switch (candidate.kind) {
      case "item":
        return itemMappedFields(candidate.value, context, context);
      case "block":
        return blockMappedFields(candidate, context);
      case "furniture":
        return furnitureMappedFields(candidate, context);
      case "loot":
        return lootMappedFields(candidate, context);
      case "vanilla-loot":
        return vanillaLootMappedFields(context);
    }
  };
  const listItemForContext = (
    context: Parameters<
      NonNullable<
        Parameters<typeof validateSchema>[0]["listItemFieldForContext"]
      >
  >[0],
  ): SchemaField | undefined => {
    switch (candidate.kind) {
      case "item": {
        const component = dataComponentPathContext(
          canonicalComponentContext(context).path,
        );
        if (component?.componentId) {
          const field = dataComponentListItemField(
            component.componentId,
            component.payloadPath,
          );
          if (field) return listItemField(field);
        }
        return listItemField(itemListItemField(context.path));
      }
      case "block":
        return listItemField(blockListItemField(context.path));
      case "furniture":
        return listItemField(furnitureListItemField(context.path));
      case "loot":
        return listItemField(lootListItemField(context.path));
      default:
        return undefined;
    }
  };
  const issues = [
    ...validateSchema({
      value: candidate.value,
      source: candidate.source,
      path: [candidate.rawId],
      domainLabel: candidateLabel(candidate),
      fieldsForContext,
      configVersion,
      issueCodes: issueCodes(candidate.kind),
      unknownField: (context) => {
        if (context.path.length === 1) return "skip";
        const compact = compactPath(context.path);
        if (hasExternalParticleOwner(candidate.value, context.path))
          return "skip";
        if (
          candidate.kind === "item" &&
          ["model", "models", "legacy_model"].includes(compact[0] ?? "")
        )
          return "skip";
        if (
          (candidate.kind === "item" ||
            candidate.kind === "block" ||
            candidate.kind === "furniture") &&
          (compact.at(-1) === "event" || compact.at(-1) === "events")
        )
          return "open";
        if (
          (candidate.kind === "block" || candidate.kind === "furniture") &&
          ["behavior", "behaviors", "elements"].includes(compact.at(-1) ?? "")
        )
          return "skip";
        if (deepOpenMapping(candidate.kind, context)) return "open";
        const type = context.siblingValues.get("type");
        if (
          compact.some((part) =>
            [
              "functions",
              "function",
              "conditions",
              "condition",
              "terms",
              "term",
            ].includes(part),
          ) &&
          (resolveFunctionOrConditionType("function", type)?.external ||
            resolveFunctionOrConditionType("condition", type)?.external)
        )
          return "skip";
        if (
          (candidate.kind === "block" || candidate.kind === "furniture") &&
          compact.some((part) => part === "behavior" || part === "behaviors") &&
          ceExternalType(type ?? context.ancestorTypes?.[0])
        )
          return "skip";
        if (
          type === undefined &&
          context.fields.some(
            (field) => originalSemantic(field) === "type" && field.required,
          )
        )
          return "skip";
        if (
          context.fields.length === 0 ||
          onlyTemplateControlFields(context.fields)
        )
          return "skip";
        return "diagnose";
      },
      listItemFieldForContext: listItemForContext,
      constraints: (context) => deepConstraint(candidate, context),
    }),
  ];
  if (candidate.kind !== "loot" && candidate.kind !== "vanilla-loot") {
    issues.push(
      ...validateSchemaNumberProviders({
        value: candidate.value,
        source: candidate.source,
        rootPath: [candidate.kind],
        fieldsForContext:
          candidate.kind === "item"
            ? itemFieldsForContext
            : candidate.kind === "block"
              ? blockFieldsForContext
              : furnitureFieldsForContext,
        ...(candidate.kind === "item"
          ? { fieldForName: itemSchemaFieldForName }
          : {}),
        domain: candidate.kind,
        domainLabel:
          candidate.kind === "item"
            ? Messages.src.config.validation.deep.text0023
            : candidate.kind === "block"
              ? Messages.src.config.validation.deep.text0024
              : Messages.src.config.validation.deep.text0025,
      }),
    );
  }
  if (candidate.kind !== "vanilla-loot" || !isRecord(candidate.value))
    return deduplicateCoreIssues(issues);

  const sourceType =
    typeof candidate.value.type === "string"
      ? candidate.value.type === "block"
        ? "block_break"
        : candidate.value.type === "entity"
          ? "entity_death"
          : candidate.value.type === "shear_block"
            ? "block_shear"
            : candidate.value.type
      : undefined;
  const target = candidate.value.target ?? candidate.value.targets;
  if (
    sourceType !== "fishing" &&
    sourceType !== "piglin_barter" &&
    (target === undefined || (isUnknownArray(target) && target.length === 0))
  ) {
    issues.push(
      customIssue(
        candidate.source,
        "ineffective-vanilla-loot-target",
        Messages.src.config.validation.deep.text0026(candidateLabel(candidate)),
        "warning",
        "target",
      ),
    );
    return deduplicateCoreIssues(issues);
  }
  if (
    candidate.value.loot === undefined &&
    candidate.value.loots === undefined
  )
    issues.push(
      customIssue(
        candidate.source,
        "unsafe-vanilla-loot-missing-loot",
        Messages.src.config.validation.deep.text0027(candidateLabel(candidate)),
        "error",
        "loot",
      ),
    );
  return deduplicateCoreIssues(issues);
}
