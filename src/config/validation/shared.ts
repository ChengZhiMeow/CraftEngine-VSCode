import { parseCraftEngineColor } from "../value/colors.js";
import type { ConfigurationCandidateInput } from "../model.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isValidIdentifier, makeIdentifier } from "../../util/identifiers.js";
import {
  compactConfigPath,
  configValueAt,
  normalizeConfigPath,
} from "../../util/configPath.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  isSchemaBoolean,
  schemaSourceRange,
  type SchemaConstraintProblem,
  type SchemaConstraintResult,
  type SchemaValidationIssueCodes,
  type SchemaValidationSource,
} from "./schema.js";
import type { validateSchema } from "./schema.js";
import { Messages } from "../../messages.js";
import type { WorldgenDynamicValuePolicy } from "../worldgen/schema.js";

export type RecordValue = Readonly<Record<string, unknown>>;

export type ValidatedCandidateKind = Extract<
  ConfigurationCandidateInput["kind"],
  | "item"
  | "block"
  | "furniture"
  | "loot"
  | "vanilla-loot"
  | "image"
  | "recipe"
  | "category"
  | "emoji"
  | "painting"
  | "configured-feature"
  | "placed-feature"
  | "advancement"
>;

export type DeepCandidateKind = Extract<
  ValidatedCandidateKind,
  "item" | "block" | "furniture" | "loot" | "vanilla-loot"
>;

export interface ValidationField extends SchemaField {
  readonly validationOriginalSemantic?: string;
  readonly validationDynamicKey?: string;
  readonly validationWorldgenDynamic?: WorldgenDynamicValuePolicy;
}

export interface RootTree {
  readonly value: unknown;
  readonly source: SchemaValidationSource;
}

export interface OpaqueSectionValidationInput {
  readonly sectionType: string;
  readonly sectionKey: string;
  readonly value: unknown;
  readonly source: SchemaValidationSource;
}

export function scalarText(value: unknown): string | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : undefined;
}

export function isScalar(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean")
  );
}

export function originalSemantic(field: SchemaField): string {
  return (
    (field as ValidationField).validationOriginalSemantic ?? field.semantic
  );
}

export function dynamicKey(field: SchemaField): string | undefined {
  return (field as ValidationField).validationDynamicKey;
}

  // 给内部标记一个不会命中的值, 否则会接受未登记的其他写法
export function exactField(field: SchemaField): ValidationField {
  return {
    ...field,
    semantic: `__ce_exact__:${field.semantic}`,
    validationOriginalSemantic: field.semantic,
  };
}

export function dynamicValidationField(
  field: SchemaField,
  key: string,
): ValidationField {
  return {
    ...field,
    label: key,
    aliases: [],
    semantic: `__ce_dynamic__:${key}`,
    required: false,
    validationOriginalSemantic: field.semantic,
    validationDynamicKey: key,
  };
}

export function exactFields(
  fields: readonly SchemaField[],
): readonly ValidationField[] {
  return fields.map(exactField);
}

export function withoutScalarValidation(field: SchemaField): SchemaField {
  const { valueProvider: _valueProvider, values: _values, ...rest } = field;
  void _valueProvider;
  void _values;
  return rest;
}

export function withoutIdControlValidation(
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  return fields.map((field) =>
    field.label === "enable" || field.label === "debug"
      ? withoutScalarValidation(field)
      : field,
  );
}

export function normalizedPath(path: readonly string[]): readonly string[] {
  return normalizeConfigPath(path, 1);
}

export function compactPath(path: readonly string[]): readonly string[] {
  return compactConfigPath(path, 1);
}

export function stripKeySuffix(value: string): string {
  return value.replace(/#.*$/u, "");
}

export function localCraftEngineKey(value: string): string | undefined {
  const raw = stripKeySuffix(value);
  const separator = raw.indexOf(":");
  if (separator >= 0 && raw.slice(0, separator) !== "craftengine")
    return undefined;
  return (separator < 0 ? raw : raw.slice(separator + 1)).replaceAll("-", "_");
}

export function localCraftEngineType(
  value: string | undefined,
  values: readonly string[],
): string | undefined {
  if (!value) return undefined;
  const local = localCraftEngineKey(value);
  return local !== undefined && values.includes(local) ? local : undefined;
}

export function genericField(
  label: string,
  detail: string,
  valueProvider?: SchemaField["valueProvider"],
): SchemaField {
  return {
    label,
    semantic: label,
    aliases: [],
    detail,
    snippet: `${label}: \${0}`,
    ...(valueProvider === undefined ? {} : { valueProvider }),
  };
}

export function registeredMappingFields(
  fields: readonly SchemaField[],
  node: unknown,
  acceptExternal = true,
): readonly SchemaField[] {
  if (!isRecord(node)) return [];
  const result: SchemaField[] = [];
  for (const key of Object.keys(node)) {
    const local = localCraftEngineKey(key);
    const selected =
      local === undefined
        ? undefined
        : fields.find((field) =>
            [field.label, ...field.aliases].some(
              (name) => localCraftEngineKey(name) === local,
            ),
          );
    if (selected) {
      result.push(dynamicValidationField(selected, key));
      continue;
    }
    if (
      acceptExternal &&
      isValidIdentifier(
        makeIdentifier(stripKeySuffix(key).replaceAll("-", "_"), "craftengine"),
      )
    ) {
      result.push(
        dynamicValidationField(
          genericField(key, Messages.src.config.validation.shared.text0001),
          key,
        ),
      );
    }
  }
  return result;
}

export function resolvedRegisteredFields(
  node: unknown,
  resolver: (name: string) => SchemaField | undefined,
): readonly SchemaField[] {
  if (!isRecord(node)) return [];
  return Object.keys(node).flatMap((key) => {
    const selected = resolver(key);
    if (selected) return [dynamicValidationField(selected, key)];
    return isValidIdentifier(
      makeIdentifier(stripKeySuffix(key).replaceAll("-", "_"), "craftengine"),
    )
      ? [
          dynamicValidationField(
            genericField(key, Messages.src.config.validation.shared.text0002),
            key,
          ),
        ]
      : [];
  });
}

export function isNumberProviderFields(
  fields: readonly SchemaField[],
): boolean {
  const type = fields.find((field) => field.label === "type");
  return (
    type?.values?.includes("fixed") === true && type.values.includes("weighted")
  );
}

export function suppressUnselectedVariantRequirements(
  fields: readonly SchemaField[],
  context: SchemaContext,
): readonly SchemaField[] {
  if (
    isNumberProviderFields(fields) &&
    context.siblingValues.get("type") === undefined
  ) {
    return fields.map((field) =>
      field.required ? { ...field, required: false } : field,
    );
  }
  if (
    fields.find((field) => field.label === "type")?.required &&
    context.siblingValues.get("type") === undefined
  ) {
    return fields.map((field) =>
      field.label !== "type" && field.required
        ? { ...field, required: false }
        : field,
    );
  }
  return fields;
}

export function exactFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  return fields.find(
    (field) => field.label === name || field.aliases.includes(name),
  );
}

export function onlyTemplateControlFields(
  fields: readonly SchemaField[],
): boolean {
  const controls = new Set(["template", "arguments", "overrides", "merges"]);
  return (
    fields.length > 0 && fields.every((field) => controls.has(field.label))
  );
}

export function valueAt(
  root: unknown,
  path: readonly string[],
  rootSegments: number,
): unknown {
  return configValueAt(root, path, rootSegments);
}

export function issueCodes(
  domain: string,
): Partial<SchemaValidationIssueCodes> {
  return {
    unknownField: `unknown-${domain}-field`,
    conflictingAlias: `conflicting-${domain}-alias`,
    missingRequired: `missing-${domain}-field`,
    invalidBoolean: `invalid-${domain}-boolean`,
    invalidNumber: `invalid-${domain}-number`,
    invalidEnum: `invalid-${domain}-enum`,
    invalidValue: `invalid-${domain}-value`,
    invalidRoot: `invalid-${domain}-root`,
  };
}

export function customIssue(
  source: SchemaValidationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  fieldPath = "",
  key = false,
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: schemaSourceRange(source, fieldPath, key),
  };
}

export function problem(
  code: string,
  message: string,
  range: "key" | "value" = "value",
): SchemaConstraintProblem {
  return { code, message, range };
}

export function oneProblem(
  problemValue: SchemaConstraintProblem,
  replaceBuiltIn = false,
): SchemaConstraintResult {
  return { replaceBuiltIn, problems: [problemValue] };
}

export function booleanConstraint(
  domain: string,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  if (context.field.valueProvider !== "boolean") return undefined;
  if (isSchemaBoolean(context.value)) return { replaceBuiltIn: true };
  return oneProblem(
    problem(
      `invalid-${domain}-boolean`,
      Messages.src.config.validation.shared.text0003(
        context.domainLabel,
        context.fieldPath,
      ),
    ),
    true,
  );
}

export function resourceLocation(value: string): boolean {
  return /^(?:[a-z0-9_.-]+:)?[a-z0-9_.\-/]+$/u.test(value) && value.length > 0;
}

export function stringOrStringList(value: unknown): boolean {
  return (
    typeof value === "string" ||
    (isUnknownArray(value) && value.every((entry) => typeof entry === "string"))
  );
}

export function javaStringOrList(value: unknown): boolean {
  return (
    value !== null &&
    (!isUnknownArray(value) || value.every((entry) => entry !== null))
  );
}

export function mappingOrList(value: unknown): boolean {
  return isRecord(value) || isUnknownArray(value);
}

export function firstMapping(value: unknown): RecordValue | undefined {
  if (isRecord(value)) return value;
  return isUnknownArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

export const VANILLA_PARTICLE_PATHS = new Set(
  `
  angry_villager ash block block_crumble block_marker bubble bubble_column_up bubble_pop
  campfire_cosy_smoke campfire_signal_smoke cherry_leaves cloud composter copper_fire_flame
  crimson_spore crit current_down damage_indicator dolphin dragon_breath dripping_dripstone_lava
  dripping_dripstone_water dripping_honey dripping_lava dripping_obsidian_tear dripping_water dust
  dust_color_transition dust_pillar dust_plume effect egg_crack elder_guardian electric_spark enchant
  enchanted_hit end_rod entity_effect explosion explosion_emitter falling_dripstone_lava
  falling_dripstone_water falling_dust falling_honey falling_lava falling_nectar
  falling_obsidian_tear falling_spore_blossom falling_water firefly firework fishing flame flash geyser
  geyser_base geyser_plume geyser_poof glow glow_squid_ink gust gust_emitter_large gust_emitter_small
  happy_villager heart infested instant_effect item item_cobweb item_slime item_snowball landing_honey
  landing_lava landing_obsidian_tear large_smoke lava mycelium nautilus note noxious_gas
  noxious_gas_cloud ominous_spawning pale_oak_leaves pause_mob_growth poof portal raid_omen rain
  reset_mob_growth reverse_portal scrape sculk_charge sculk_charge_pop sculk_soul shriek small_flame
  small_gust smoke sneeze snowflake sonic_boom soul soul_fire_flame spit splash spore_blossom_air
  squid_ink sulfur_bubbles sulfur_cube_goo sweep_attack tinted_leaves totem_of_undying trail trial_omen
  trial_spawner_detection trial_spawner_detection_ominous underwater vault_connection vibration
  warped_spore wax_off wax_on white_ash white_smoke witch
`
    .trim()
    .split(/\s+/u),
);

export function validCraftEngineColor(value: unknown): boolean {
  return (
    parseCraftEngineColor(value) !== undefined ||
    (typeof value === "string" && /^[+-]?\d+$/u.test(value))
  );
}

  // 这里只拒绝确定缺少结尾的 Java 正则符号或转义
export function obviouslyInvalidRegex(value: string): boolean {
  let escaped = false;
  let quoted = false;
  let characterClass = false;
  let parentheses = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (escaped) {
      if (!quoted && char === "Q") quoted = true;
      else if (quoted && char === "E") quoted = false;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quoted) continue;
    if (char === "[" && !characterClass) characterClass = true;
    else if (char === "]" && characterClass) characterClass = false;
    else if (!characterClass && char === "(") parentheses += 1;
    else if (!characterClass && char === ")") {
      parentheses -= 1;
      if (parentheses < 0) return true;
    }
  }
  return escaped || characterClass || parentheses !== 0;
}

export function listItemField(
  field: SchemaField | undefined,
): SchemaField | undefined {
  return field === undefined ? undefined : exactField(field);
}

export function candidateDomain(kind: ValidatedCandidateKind): string {
  switch (kind) {
    case "configured-feature":
      return "configured-feature";
    case "placed-feature":
      return "placed-feature";
    default:
      return kind;
  }
}

export function candidateLabel(candidate: ConfigurationCandidateInput): string {
  switch (candidate.kind) {
    case "image":
      return Messages.src.config.validation.shared.text0004(candidate.rawId);
    case "recipe":
      return Messages.src.config.validation.shared.text0005(candidate.rawId);
    case "category":
      return Messages.src.config.validation.shared.text0006(candidate.rawId);
    case "emoji":
      return Messages.src.config.validation.shared.text0008(candidate.rawId);
    case "painting":
      return Messages.src.config.validation.shared.text0007(candidate.rawId);
    case "configured-feature":
      return Messages.src.config.validation.shared.text0009(candidate.rawId);
    case "placed-feature":
      return Messages.src.config.validation.shared.text0010(candidate.rawId);
    case "advancement":
      return Messages.src.config.validation.shared.text0011(candidate.rawId);
    default:
      return Messages.src.config.validation.shared.text0012(
        candidate.kind,
        candidate.rawId,
      );
  }
}

export function hasExternalParticleOwner(
  root: unknown,
  path: readonly string[],
): boolean {
  let current = root;
  let external = false;
  const inspect = (value: unknown): void => {
    if (external) return;
    if (
      !isRecord(value) ||
      localCraftEngineKey(scalarText(value.type) ?? "") !== "particle"
    )
      return;
    const particle = scalarText(value.particle);
    if (
      particle === undefined ||
      !isValidIdentifier(makeIdentifier(particle, "minecraft"))
    )
      return;
    external = !makeIdentifier(particle, "minecraft").startsWith("minecraft:");
  };
  inspect(current);
  for (const segment of path.slice(1)) {
    if (isUnknownArray(current)) current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment];
    else break;
    inspect(current);
  }
  return external;
}

export function passiveKnownFields(
  fields: readonly SchemaField[],
): readonly SchemaField[] {
  return fields.map((field) => ({
    ...withoutScalarValidation(field),
    required: false,
  }));
}

export function prepareDiscriminatorFields(
  fields: readonly SchemaField[],
  context: SchemaContext,
  requireType = false,
): readonly SchemaField[] {
  if (isNumberProviderFields(fields)) return passiveKnownFields(fields);
  const rawType = context.siblingValues.get("type");
  const typeField = fields.find((field) => field.label === "type");
  const container = compactPath(context.path).at(-1);
  let withRequired =
    requireType && typeField !== undefined
      ? fields.map((field) =>
          field === typeField ? { ...field, required: true } : field,
        )
      : fields;
  if (container === "events" || container === "event") {
    withRequired = withRequired.map((field) =>
      field.label === "type" && field.required
        ? { ...field, required: false }
        : field,
    );
  }
  if (
    typeField !== undefined &&
    (typeField.required || requireType) &&
    rawType === undefined &&
    container !== "events" &&
    container !== "event"
  ) {
    return withRequired.filter(
      (field) =>
        field.label === "type" ||
        ["template", "arguments", "overrides", "merges"].includes(field.label),
    );
  }
  if (
    fields.some((field) => field.label === "particle" && field.required) &&
    context.siblingValues.get("particle") === undefined
  ) {
    return withRequired.map((field) =>
      field.label !== "particle" && field.required
        ? { ...field, required: false }
        : field,
    );
  }
  if (
    rawType === "particle" &&
    context.siblingValues.get("particle") === undefined
  ) {
    return withRequired.map((field) =>
      field.label !== "type" && field.label !== "particle" && field.required
        ? { ...field, required: false }
        : field,
    );
  }
  return withRequired;
}

export function itemDataProcessorName(
  context: SchemaContext,
): string | undefined {
  const nested = normalizedPath(context.path);
  const dataIndex = nested.lastIndexOf("data");
  if (dataIndex < 0 || nested.length !== dataIndex + 2) return undefined;
  return localCraftEngineKey(nested[dataIndex + 1]!);
}
