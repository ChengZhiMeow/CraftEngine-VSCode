import {
  AUTO_STATE_GROUPS,
  BLOCK_BEHAVIOR_TYPES,
  BLOCK_PROPERTY_ENUM_VALUES,
  BLOCK_PROPERTY_TYPES,
  BLOCK_RENDERER_TYPES,
  BLOCK_ROOT_FIELDS,
  BLOCK_SETTING_FIELDS,
  blockFieldsForContext,
  blockSchemaFieldForName,
} from "./schema.js";
import type { BlockDefinition } from "./model.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import { isNumberProviderScalar } from "../number-provider/schema.js";
import { validateSchemaNumberProviders } from "../number-provider/validation.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import type { SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import {
  validateVanillaBlockState,
  type VanillaBlockStateCatalog,
} from "../../minecraft/block/states.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export interface BlockBuildOptions {
  readonly includeInactiveDiagnostics: boolean;
  readonly unknownExtensionSyntax?: "ignore" | "warning";
  readonly vanillaBlocks?: ReadonlySet<string>;
  readonly vanillaBlockStates?: VanillaBlockStateCatalog;
}

export interface BlockBuildResult {
  readonly blocks: readonly BlockDefinition[];
  readonly issues: readonly CoreIssue[];
}

interface BlockPropertyDefinition {
  readonly values: readonly string[];
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  fieldName?: string,
  key = false,
  related?: CoreIssue["related"],
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range:
      fieldName === undefined
        ? source.idRange
        : ((key
            ? source.fieldKeyRanges.get(fieldName)
            : source.fieldValueRanges.get(fieldName)) ??
          source.fieldKeyRanges.get(fieldName) ??
          source.idRange),
    ...(related === undefined ? {} : { related }),
  };
}

function field(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): [string, unknown] | undefined {
  for (const name of names)
    if (Object.hasOwn(raw, name)) return [name, raw[name]];
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  try {
    return craftEngineBoolean(value);
  } catch {
    return undefined;
  }
}

function isBoolean(value: unknown): boolean {
  return booleanValue(value) !== undefined;
}

function validateTintSourceType(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): void {
  if (!isRecord(value) || value.type === undefined) return;
  if (typeof value.type !== "string" || value.type.trim() === "") {
    issues.push(
      issue(
        source,
        "unknown-block-tint-source-type",
        Messages.src.config.block.parser.text0001(pathName),
        "error",
        `${pathName}.type`,
      ),
    );
    return;
  }
  if (localRegistryDiscriminator(value.type) === "default") return;
  const registeredSyntax = isValidRegistryDiscriminator(value.type);
  const severity = registeredSyntax
    ? options.unknownExtensionSyntax === "warning"
      ? "warning"
      : undefined
    : "error";
  if (severity)
    issues.push(
      issue(
        source,
        "unknown-block-tint-source-type",
        Messages.src.config.block.parser.text0002(registeredSyntax, value.type),
        severity,
        `${pathName}.type`,
      ),
    );
}

function scalarText(value: unknown): string | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? String(value)
    : undefined;
}

function displayUnknown(value: unknown): string {
  const scalar = scalarText(value);
  if (scalar !== undefined) return scalar;
  try {
    return JSON.stringify(value) ?? Messages.src.config.block.parser.text0003;
  } catch {
    return Messages.src.config.block.parser.text0004;
  }
}

function integerLiteral(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  )
    return value;
  if (typeof value === "string" && /^[-+]?\d+$/u.test(value.trim()))
    return Number(value);
  return undefined;
}

function valuesFrom(raw: unknown): readonly string[] | undefined {
  if (typeof raw === "string") return [raw];
  if (!isUnknownArray(raw)) return undefined;
  return raw
    .filter(
      (entry): entry is string | number | boolean =>
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean",
    )
    .map(String);
}

function stateSection(
  raw: Readonly<Record<string, unknown>>,
): [string, Readonly<Record<string, unknown>>] | undefined {
  const selected = field(raw, ["state", "states"]);
  return selected && isRecord(selected[1])
    ? [selected[0], selected[1]]
    : undefined;
}

function parseIntRange(
  property: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): readonly string[] {
  let minimum: number | undefined;
  let maximum: number | undefined;
  if (typeof property.range === "string") {
    const match = /^\s*(-?\d+)\s*~\s*(-?\d+)\s*$/u.exec(property.range);
    if (match) {
      minimum = Number(match[1]);
      maximum = Number(match[2]);
    } else {
      issues.push(
        issue(
          source,
          "invalid-block-property-range",
          Messages.src.config.block.parser.text0005(pathName),
          "error",
          `${pathName}.range`,
        ),
      );
    }
  } else {
    minimum = integerLiteral(property.min);
    maximum = integerLiteral(property.max);
    if (minimum === undefined)
      issues.push(
        issue(
          source,
          "missing-block-property-min",
          Messages.src.config.block.parser.text0006(pathName),
          "error",
          pathName,
          true,
        ),
      );
    if (maximum === undefined)
      issues.push(
        issue(
          source,
          "missing-block-property-max",
          Messages.src.config.block.parser.text0007(pathName),
          "error",
          pathName,
          true,
        ),
      );
  }
  if (minimum === undefined || maximum === undefined) return [];
  if (minimum > maximum) {
    issues.push(
      issue(
        source,
        "invalid-block-property-range",
        Messages.src.config.block.parser.text0008(pathName),
        "error",
        typeof property.range === "string"
          ? `${pathName}.range`
          : `${pathName}.min`,
      ),
    );
    return [];
  }
  const count = maximum - minimum + 1;
  if (!Number.isSafeInteger(count) || count > 100_000) {
    issues.push(
      issue(
        source,
        "block-property-range-too-large",
        Messages.src.config.block.parser.text0009(pathName),
        "error",
        pathName,
      ),
    );
    return [];
  }
  return Array.from({ length: count }, (_entry, index) =>
    String(minimum + index),
  );
}

function parseProperty(
  name: string,
  raw: unknown,
  source: ConfigurationSource,
  stateKey: string,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): BlockPropertyDefinition | undefined {
  const pathName = `${stateKey}.properties.${name}`;
  if (!isRecord(raw)) {
    issues.push(
      issue(
        source,
        "invalid-block-property",
        Messages.src.config.block.parser.text0010(name),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  if (!/^[a-z0-9_.-]+$/u.test(name)) {
    issues.push(
      issue(
        source,
        "invalid-block-property-name",
        Messages.src.config.block.parser.text0011(name),
        "warning",
        pathName,
        true,
      ),
    );
  }
  if (typeof raw.type !== "string") {
    issues.push(
      issue(
        source,
        "missing-block-property-type",
        Messages.src.config.block.parser.text0012(name),
        "error",
        pathName,
        true,
      ),
    );
    return undefined;
  }
  const type = localRegistryDiscriminator(raw.type);
  if (!type || !(BLOCK_PROPERTY_TYPES as readonly string[]).includes(type)) {
    const registeredSyntax = isValidRegistryDiscriminator(raw.type);
    const severity = registeredSyntax
      ? options.unknownExtensionSyntax === "warning"
        ? "warning"
        : undefined
      : "error";
    if (severity)
      issues.push(
        issue(
          source,
          "unknown-block-property-type",
          Messages.src.config.block.parser.text0013(raw.type),
          severity,
          `${pathName}.type`,
        ),
      );
    return registeredSyntax ? { values: [] } : undefined;
  }

  switch (type) {
    case "boolean": {
      if (raw.default !== undefined && booleanValue(raw.default) === undefined)
        issues.push(
          issue(
            source,
            "invalid-block-property-default",
            Messages.src.config.block.parser.text0014(pathName),
            "error",
            `${pathName}.default`,
          ),
        );
      return { values: ["true", "false"] };
    }
    case "int": {
      const values = parseIntRange(raw, source, pathName, issues);
      const parsedDefault = integerLiteral(raw.default);
      if (
        raw.default !== undefined &&
        parsedDefault === undefined &&
        typeof raw.default !== "string"
      ) {
        issues.push(
          issue(
            source,
            "invalid-block-property-default",
            Messages.src.config.block.parser.text0015(pathName),
            "error",
            `${pathName}.default`,
          ),
        );
      } else if (
        parsedDefault !== undefined &&
        values.length > 0 &&
        !values.includes(String(parsedDefault))
      ) {
        issues.push(
          issue(
            source,
            "clamped-block-property-default",
            Messages.src.config.block.parser.text0016(pathName),
            "warning",
            `${pathName}.default`,
          ),
        );
      }
      return { values };
    }
    case "string": {
      const values = valuesFrom(raw.values) ?? [];
      if (values.length === 0)
        issues.push(
          issue(
            source,
            "missing-block-property-values",
            Messages.src.config.block.parser.text0017(pathName),
            "error",
            `${pathName}.values`,
          ),
        );
      if (new Set(values).size !== values.length)
        issues.push(
          issue(
            source,
            "duplicate-block-property-value",
            Messages.src.config.block.parser.text0018(pathName),
            "error",
            `${pathName}.values`,
          ),
        );
      const configuredDefault = scalarText(raw.default);
      const defaultValue =
        raw.default === undefined
          ? (values[0] ?? "")
          : (configuredDefault ?? values[0] ?? "");
      if (raw.default !== undefined && configuredDefault === undefined)
        issues.push(
          issue(
            source,
            "invalid-block-property-default",
            Messages.src.config.block.parser.text0019(pathName),
            "error",
            `${pathName}.default`,
          ),
        );
      if (values.length > 0 && !values.includes(defaultValue))
        issues.push(
          issue(
            source,
            "fallback-block-property-default",
            Messages.src.config.block.parser.text0020(pathName),
            "warning",
            `${pathName}.default`,
          ),
        );
      return { values };
    }
    default: {
      const allowed = BLOCK_PROPERTY_ENUM_VALUES[type] ?? [];
      const normalized =
        valuesFrom(raw.values)?.map((value) => value.toLowerCase()) ?? allowed;
      const invalid = normalized.filter((value) => !allowed.includes(value));
      if (invalid.length > 0)
        issues.push(
          issue(
            source,
            "invalid-block-property-value",
            Messages.src.config.block.parser.text0021(
              pathName,
              invalid.join("、"),
            ),
            "error",
            `${pathName}.values`,
          ),
        );
      const values = [
        ...new Set(normalized.filter((value) => allowed.includes(value))),
      ];
      if (values.length === 0)
        issues.push(
          issue(
            source,
            "empty-block-property-values",
            Messages.src.config.block.parser.text0022(pathName),
            "error",
            `${pathName}.values`,
          ),
        );
      const configuredDefault = scalarText(raw.default);
      const defaultValue =
        raw.default === undefined
          ? (values[0] ?? "")
          : (configuredDefault ?? values[0] ?? "");
      if (raw.default !== undefined && configuredDefault === undefined)
        issues.push(
          issue(
            source,
            "invalid-block-property-default",
            Messages.src.config.block.parser.text0023(pathName),
            "error",
            `${pathName}.default`,
          ),
        );
      if (
        raw.default !== undefined &&
        defaultValue !== defaultValue.toLowerCase()
      )
        issues.push(
          issue(
            source,
            "case-sensitive-block-property-default",
            Messages.src.config.block.parser.text0024(pathName),
            "warning",
            `${pathName}.default`,
          ),
        );
      if (values.length > 0 && !values.includes(defaultValue))
        issues.push(
          issue(
            source,
            "fallback-block-property-default",
            Messages.src.config.block.parser.text0025(pathName),
            "warning",
            `${pathName}.default`,
          ),
        );
      return { values };
    }
  }
}

function validateVisual(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(
      issue(
        source,
        "invalid-block-appearance",
        Messages.src.config.block.parser.text0026(pathName),
        "error",
        pathName,
      ),
    );
    return;
  }
    // 值为 null 时还会继续找其他写法, auto_state 为空时使用 state
  const auto: [string, unknown] | undefined =
    Object.hasOwn(value, "auto_state") &&
    value.auto_state !== null &&
    value.auto_state !== undefined
      ? ["auto_state", value.auto_state]
      : Object.hasOwn(value, "auto-state") &&
          value["auto-state"] !== null &&
          value["auto-state"] !== undefined
        ? ["auto-state", value["auto-state"]]
        : undefined;
  const exact = value.state;
  if (auto) {
    if (exact !== undefined) {
      issues.push(
        issue(
          source,
          "shadowed-block-visual-state",
          Messages.src.config.block.parser.text0027(pathName),
          "warning",
          `${pathName}.state`,
          true,
        ),
      );
    }
    if (typeof auto[1] !== "string" && !isRecord(auto[1])) {
      issues.push(
        issue(
          source,
          "invalid-auto-state",
          Messages.src.config.block.parser.text0028(pathName, auto[0]),
          "error",
          `${pathName}.${auto[0]}`,
        ),
      );
    }
    const rawType =
      typeof auto[1] === "string"
        ? auto[1]
        : isRecord(auto[1]) && typeof auto[1].type === "string"
          ? auto[1].type
          : "solid";
    if (!(AUTO_STATE_GROUPS as readonly string[]).includes(rawType)) {
      issues.push(
        issue(
          source,
          "unknown-auto-state-group",
          Messages.src.config.block.parser.text0029(rawType),
          "error",
          `${pathName}.${auto[0]}`,
        ),
      );
    }
    if (
      isRecord(auto[1]) &&
      auto[1].id !== undefined &&
      typeof auto[1].id !== "string"
    ) {
      issues.push(
        issue(
          source,
          "invalid-auto-state-id",
          Messages.src.config.block.parser.text0030(pathName, auto[0]),
          "error",
          `${pathName}.${auto[0]}.id`,
        ),
      );
    }
  } else if (typeof exact === "string") {
    if (options.vanillaBlocks) {
      for (const problem of validateVanillaBlockState(
        exact,
        options.vanillaBlocks,
        options.vanillaBlockStates,
      )) {
        issues.push(
          issue(
            source,
            problem.code,
            problem.message,
            "error",
            `${pathName}.state`,
          ),
        );
      }
    }
  } else if (exact !== undefined) {
    issues.push(
      issue(
        source,
        "invalid-block-visual-state",
        Messages.src.config.block.parser.text0031(pathName),
        "error",
        `${pathName}.state`,
      ),
    );
  } else {
    issues.push(
      issue(
        source,
        "missing-block-visual-state",
        Messages.src.config.block.parser.text0032(pathName),
        "error",
        pathName,
        true,
      ),
    );
  }

  if (value.transparent !== undefined && !isBoolean(value.transparent)) {
    issues.push(
      issue(
        source,
        "invalid-block-transparent",
        Messages.src.config.block.parser.text0033(pathName),
        "error",
        `${pathName}.transparent`,
      ),
    );
  }
  validateVisualModels(value, source, pathName, issues);

  const renderer = field(value, [
    "entity_renderer",
    "entity-renderer",
    "entity_render",
    "entity-render",
  ]);
  (renderer
    ? isUnknownArray(renderer[1])
      ? renderer[1]
      : [renderer[1]]
    : []
  ).forEach((entry, index) => {
    if (!isRecord(entry)) {
      issues.push(
        issue(
          source,
          "invalid-block-renderer",
          Messages.src.config.block.parser.text0034(
            pathName,
            renderer?.[0] ?? "entity_renderer",
            index,
          ),
          "error",
          `${pathName}.${renderer?.[0] ?? "entity_renderer"}.${index}`,
        ),
      );
      return;
    }
    const inferred =
      typeof entry.type === "string"
        ? entry.type
        : entry.text !== undefined
          ? "text_display"
          : entry.item !== undefined
            ? "item_display"
            : undefined;
    if (!inferred) {
      issues.push(
        issue(
          source,
          "invalid-block-renderer",
          Messages.src.config.block.parser.text0035(
            pathName,
            renderer?.[0] ?? "entity_renderer",
            index,
          ),
          "error",
          `${pathName}.${renderer?.[0] ?? "entity_renderer"}.${index}`,
        ),
      );
      return;
    }
    const type = localRegistryDiscriminator(inferred);
    if (!type || !(BLOCK_RENDERER_TYPES as readonly string[]).includes(type)) {
      const severity = isValidRegistryDiscriminator(inferred)
        ? options.unknownExtensionSyntax === "warning"
          ? "warning"
          : undefined
        : "error";
      if (severity)
        issues.push(
          issue(
            source,
            "unknown-block-renderer",
            Messages.src.config.block.parser.text0036(inferred),
            severity,
            `${pathName}.${renderer?.[0] ?? "entity_renderer"}.${index}.type`,
          ),
        );
      return;
    }
    const required =
      type === "text_display"
        ? "text"
        : type === "block_display"
          ? "block"
          : ["item_display", "item", "armor_stand"].includes(type)
            ? "item"
            : ["better_model", "model_engine"].includes(type)
              ? "model"
              : undefined;
    if (
      required &&
      (typeof entry[required] !== "string" || entry[required] === "")
    ) {
      issues.push(
        issue(
          source,
          "missing-block-renderer-field",
          Messages.src.config.block.parser.text0037(type, required),
          "error",
          `${pathName}.${renderer?.[0] ?? "entity_renderer"}.${index}.${required}`,
        ),
      );
    }
    if (["item_display", "item", "armor_stand"].includes(type)) {
      const tintSource = field(entry, ["tint_source", "tint-source"]);
      if (tintSource) {
        const entryPath = isUnknownArray(renderer?.[1])
          ? `${pathName}.${renderer?.[0] ?? "entity_renderer"}.${index}`
          : `${pathName}.${renderer?.[0] ?? "entity_renderer"}`;
        validateTintSourceType(
          tintSource[1],
          source,
          `${entryPath}.${tintSource[0]}`,
          options,
          issues,
        );
      }
    }
  });
}

function resourceId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    isValidIdentifier(makeIdentifier(value.replace(/^\^/u, ""), "minecraft"))
  );
}

function vector3(value: unknown): boolean {
  const entries =
    typeof value === "number"
      ? [value]
      : typeof value === "string"
        ? value.split(",").map((entry) => Number(entry.trim()))
        : isUnknownArray(value)
          ? value
          : [];
  return (
    (entries.length === 1 || entries.length === 3) &&
    entries.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
  );
}

function validateGeneration(
  raw: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): void {
  if (!isRecord(raw)) {
    issues.push(
      issue(
        source,
        "invalid-block-model-generation",
        Messages.src.config.block.parser.text0038(pathName),
        "error",
        pathName,
      ),
    );
    return;
  }
  for (const key of Object.keys(raw)) {
    switch (key) {
      case "parent":
      case "textures":
      case "display":
      case "gui_light":
      case "gui-light":
      case "ambientocclusion":
      case "ambient-occlusion":
      case "ambient_occlusion":
        break;
      default:
        issues.push(
          issue(
            source,
            "unknown-block-model-generation-field",
            Messages.src.config.block.parser.text0039(key),
            "warning",
            `${pathName}.${key}`,
            true,
          ),
        );
    }
  }
  if (!resourceId(raw.parent)) {
    issues.push(
      issue(
        source,
        "invalid-block-model-parent",
        Messages.src.config.block.parser.text0040(pathName),
        "error",
        `${pathName}.parent`,
      ),
    );
  }
  if (raw.textures !== undefined) {
    if (!isRecord(raw.textures)) {
      issues.push(
        issue(
          source,
          "invalid-block-generation-textures",
          Messages.src.config.block.parser.text0041(pathName),
          "error",
          `${pathName}.textures`,
        ),
      );
    } else
      for (const [slot, texture] of Object.entries(raw.textures)) {
        if (
          !/^[a-zA-Z0-9_.-]+$/u.test(slot) ||
          typeof texture !== "string" ||
          (!texture.startsWith("#") && !resourceId(texture))
        ) {
          issues.push(
            issue(
              source,
              "invalid-block-generation-texture",
              Messages.src.config.block.parser.text0042(pathName, slot),
              "error",
              `${pathName}.textures.${slot}`,
            ),
          );
        }
      }
  }
  const guiLight = raw.gui_light ?? raw["gui-light"];
  if (guiLight !== undefined && guiLight !== "front" && guiLight !== "side") {
    issues.push(
      issue(
        source,
        "invalid-block-model-gui-light",
        Messages.src.config.block.parser.text0043(pathName),
        "error",
        `${pathName}.${Object.hasOwn(raw, "gui_light") ? "gui_light" : "gui-light"}`,
      ),
    );
  }
  const ambient =
    raw.ambientocclusion ?? raw["ambient-occlusion"] ?? raw.ambient_occlusion;
  if (ambient !== undefined && !isBoolean(ambient)) {
    issues.push(
      issue(
        source,
        "invalid-block-model-ambient-occlusion",
        Messages.src.config.block.parser.text0044(pathName),
        "error",
        pathName,
      ),
    );
  }
  if (raw.display !== undefined) {
    if (!isRecord(raw.display)) {
      issues.push(
        issue(
          source,
          "invalid-block-model-display",
          Messages.src.config.block.parser.text0045(pathName),
          "error",
          `${pathName}.display`,
        ),
      );
    } else
      for (const [context, transform] of Object.entries(raw.display)) {
        const transformPath = `${pathName}.display.${context}`;
        switch (context) {
          case "thirdperson_righthand":
          case "thirdperson_lefthand":
          case "firstperson_righthand":
          case "firstperson_lefthand":
          case "gui":
          case "head":
          case "ground":
          case "fixed":
          case "on_shelf":
            break;
          default:
            issues.push(
              issue(
                source,
                "unknown-block-model-display-context",
                Messages.src.config.block.parser.text0046(context),
                "warning",
                transformPath,
                true,
              ),
            );
            continue;
        }
        if (!isRecord(transform)) {
          issues.push(
            issue(
              source,
              "invalid-block-model-display-transform",
              Messages.src.config.block.parser.text0047(transformPath),
              "error",
              transformPath,
            ),
          );
          continue;
        }
        for (const key of Object.keys(transform))
          if (!["rotation", "translation", "scale"].includes(key)) {
            issues.push(
              issue(
                source,
                "unknown-block-model-display-field",
                Messages.src.config.block.parser.text0048(key),
                "warning",
                `${transformPath}.${key}`,
                true,
              ),
            );
          }
        for (const key of ["rotation", "translation", "scale"])
          if (transform[key] !== undefined && !vector3(transform[key])) {
            issues.push(
              issue(
                source,
                "invalid-block-model-display-vector",
                Messages.src.config.block.parser.text0049(transformPath, key),
                "error",
                `${transformPath}.${key}`,
              ),
            );
          }
      }
  }
}

function validateModel(
  raw: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): void {
  if (typeof raw === "string") {
    if (!resourceId(raw))
      issues.push(
        issue(
          source,
          "invalid-block-model-id",
          Messages.src.config.block.parser.text0050(pathName),
          "error",
          pathName,
        ),
      );
    return;
  }
  if (!isRecord(raw)) {
    issues.push(
      issue(
        source,
        "invalid-block-model",
        Messages.src.config.block.parser.text0051(pathName),
        "error",
        pathName,
      ),
    );
    return;
  }
  for (const key of Object.keys(raw)) {
    switch (key) {
      case "path":
      case "model":
      case "texture":
      case "textures":
      case "x":
      case "y":
      case "z":
      case "uvlock":
      case "weight":
      case "generation":
        break;
      default:
        issues.push(
          issue(
            source,
            "unknown-block-model-field",
            Messages.src.config.block.parser.text0052(key),
            "warning",
            `${pathName}.${key}`,
            true,
          ),
        );
    }
  }
  const selectedPath = raw.path ?? raw.model;
  const textures = raw.texture ?? raw.textures;
  const textureValues = isUnknownArray(textures)
    ? textures
    : textures === undefined
      ? []
      : [textures];
  if (selectedPath === undefined && textureValues.length !== 1) {
    issues.push(
      issue(
        source,
        "missing-block-model-path",
        Messages.src.config.block.parser.text0053(pathName),
        "error",
        pathName,
      ),
    );
  } else if (selectedPath !== undefined && !resourceId(selectedPath)) {
    issues.push(
      issue(
        source,
        "invalid-block-model-id",
        Messages.src.config.block.parser.text0054(pathName),
        "error",
        `${pathName}.${Object.hasOwn(raw, "path") ? "path" : "model"}`,
      ),
    );
  }
  for (const [index, texture] of textureValues.entries())
    if (!resourceId(texture)) {
      issues.push(
        issue(
          source,
          "invalid-block-texture-id",
          Messages.src.config.block.parser.text0055(pathName),
          "error",
          `${pathName}.${Object.hasOwn(raw, "texture") ? "texture" : "textures"}.${index}`,
        ),
      );
    }
  for (const key of ["x", "y", "z"])
    if (raw[key] !== undefined) {
      const rotation = integerLiteral(raw[key]);
      if (rotation === undefined || rotation % 90 !== 0) {
        issues.push(
          issue(
            source,
            "invalid-block-model-rotation",
            Messages.src.config.block.parser.text0056(pathName, key),
            "error",
            `${pathName}.${key}`,
          ),
        );
      }
    }
  if (raw.uvlock !== undefined && !isBoolean(raw.uvlock)) {
    issues.push(
      issue(
        source,
        "invalid-block-model-uvlock",
        Messages.src.config.block.parser.text0057(pathName),
        "error",
        `${pathName}.uvlock`,
      ),
    );
  }
  if (raw.weight !== undefined) {
    const weight = integerLiteral(raw.weight);
    if (weight === undefined || weight <= 0) {
      issues.push(
        issue(
          source,
          "invalid-block-model-weight",
          Messages.src.config.block.parser.text0058(pathName),
          "warning",
          `${pathName}.weight`,
        ),
      );
    }
  }
  if (raw.generation !== undefined)
    validateGeneration(
      raw.generation,
      source,
      `${pathName}.generation`,
      issues,
    );
}

function validateVisualModels(
  value: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): void {
  const textures = field(value, ["texture", "textures"]);
  const models = field(value, ["model", "models"]);
  if (textures) {
    const values = isUnknownArray(textures[1]) ? textures[1] : [textures[1]];
    if (values.length === 0)
      issues.push(
        issue(
          source,
          "empty-block-textures",
          Messages.src.config.block.parser.text0059(pathName, textures[0]),
          "error",
          `${pathName}.${textures[0]}`,
        ),
      );
    values.forEach((texture, index) => {
      if (!resourceId(texture))
        issues.push(
          issue(
            source,
            "invalid-block-texture-id",
            Messages.src.config.block.parser.text0060(pathName, textures[0]),
            "error",
            `${pathName}.${textures[0]}.${index}`,
          ),
        );
    });
    if (values.length > 1 && (!models || typeof models[1] !== "string")) {
      issues.push(
        issue(
          source,
          "missing-block-texture-model-path",
          Messages.src.config.block.parser.text0061(pathName),
          "error",
          `${pathName}.${textures[0]}`,
        ),
      );
    }
    if (models && typeof models[1] !== "string") {
      issues.push(
        issue(
          source,
          "conflicting-block-texture-model",
          Messages.src.config.block.parser.text0062(pathName),
          "error",
          `${pathName}.${models[0]}`,
        ),
      );
    } else if (models)
      validateModel(models[1], source, `${pathName}.${models[0]}`, issues);
    return;
  }
  if (!models) return;
  if (isUnknownArray(models[1])) {
    if (models[1].length === 0)
      issues.push(
        issue(
          source,
          "empty-block-models",
          Messages.src.config.block.parser.text0063(pathName, models[0]),
          "error",
          `${pathName}.${models[0]}`,
        ),
      );
    models[1].forEach((model, index) => {
      if (!isRecord(model)) {
        issues.push(
          issue(
            source,
            "invalid-random-block-model",
            Messages.src.config.block.parser.text0064(
              pathName,
              models[0],
              index,
            ),
            "error",
            `${pathName}.${models[0]}.${index}`,
          ),
        );
      } else
        validateModel(
          model,
          source,
          `${pathName}.${models[0]}.${index}`,
          issues,
        );
    });
  } else validateModel(models[1], source, `${pathName}.${models[0]}`, issues);
}

function parseVariantSelector(
  selector: string,
  properties: ReadonlyMap<string, BlockPropertyDefinition>,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): string | undefined {
  if (selector.trim() === "") {
    issues.push(
      issue(
        source,
        "empty-block-variant-selector",
        Messages.src.config.block.parser.text0065,
        "error",
        pathName,
        true,
      ),
    );
    return undefined;
  }
  const seen = new Set<string>();
  const canonical: string[] = [];
  let valid = true;
  for (const assignment of selector.split(",")) {
    const separator = assignment.indexOf("=");
    if (separator <= 0 || separator === assignment.length - 1) {
      issues.push(
        issue(
          source,
          "invalid-block-variant-selector",
          Messages.src.config.block.parser.text0066(assignment),
          "error",
          pathName,
          true,
        ),
      );
      valid = false;
      continue;
    }
    const name = assignment.slice(0, separator).trim();
    const value = assignment.slice(separator + 1).trim();
    if (seen.has(name)) {
      issues.push(
        issue(
          source,
          "duplicate-block-variant-property",
          Messages.src.config.block.parser.text0067(name),
          "error",
          pathName,
          true,
        ),
      );
      valid = false;
    }
    seen.add(name);
    canonical.push(`${name}=${value}`);
    const property = properties.get(name);
    if (!property) {
      issues.push(
        issue(
          source,
          "unknown-block-variant-property",
          Messages.src.config.block.parser.text0068(name),
          "error",
          pathName,
          true,
        ),
      );
      valid = false;
    } else if (property.values.length > 0 && !property.values.includes(value)) {
      issues.push(
        issue(
          source,
          "invalid-block-variant-value",
          Messages.src.config.block.parser.text0069(
            name,
            value,
            property.values.join("、"),
          ),
          "error",
          pathName,
          true,
        ),
      );
      valid = false;
    }
  }
  return valid ? canonical.sort().join(",") : undefined;
}

function validateKnownFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly SchemaField[],
  source: ConfigurationSource,
  pathName: string,
  code: string,
  label: string,
  issues: CoreIssue[],
  extraKnown: readonly string[] = [],
): void {
  for (const key of Object.keys(value)) {
    if (
      blockSchemaFieldForName(key, fields) === undefined &&
      !extraKnown.includes(key)
    ) {
      issues.push(
        issue(
          source,
          code,
          Messages.src.config.block.parser.text0070(label, key),
          "warning",
          pathName ? `${pathName}.${key}` : key,
          true,
        ),
      );
    }
  }
}

function validateBehaviors(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): void {
  const selected = field(raw, ["behavior", "behaviors"]);
  if (!selected) return;
  (isUnknownArray(selected[1]) ? selected[1] : [selected[1]]).forEach(
    (value, index) => {
      const basePath = isUnknownArray(selected[1])
        ? `${selected[0]}.${index}`
        : selected[0];
      if (!isRecord(value) || typeof value.type !== "string") {
        issues.push(
          issue(
            source,
            "invalid-block-behavior",
            Messages.src.config.block.parser.text0071(basePath),
            "error",
            basePath,
          ),
        );
        return;
      }
      const type = localRegistryDiscriminator(value.type);
      if (
        !type ||
        !(BLOCK_BEHAVIOR_TYPES as readonly string[]).includes(type)
      ) {
        const severity = isValidRegistryDiscriminator(value.type)
          ? options.unknownExtensionSyntax === "warning"
            ? "warning"
            : undefined
          : "error";
        if (severity)
          issues.push(
            issue(
              source,
              "unknown-block-behavior",
              Messages.src.config.block.parser.text0072(value.type),
              severity,
              `${basePath}.type`,
            ),
          );
        return;
      }
      const fields = blockFieldsForContext({
        path: [
          "block",
          selected[0],
          ...(isUnknownArray(selected[1]) ? [String(index)] : []),
        ],
        siblingValues: new Map([["type", value.type]]),
      });
      validateKnownFields(
        value,
        fields,
        source,
        basePath,
        "unknown-block-behavior-field",
        Messages.src.config.block.parser.text0073,
        issues,
        type === "on_liquid_block" && Object.hasOwn(value, "positions")
          ? ["positions"]
          : [],
      );
      validateSchemaValues(value, fields, source, basePath, issues);
    },
  );
}

function validateSchemaValues(
  value: Readonly<Record<string, unknown>>,
  fields: readonly SchemaField[],
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): void {
  for (const schema of fields) {
    if (!schema.required) continue;
    const present = [schema.label, ...schema.aliases].some(
      (name) =>
        Object.hasOwn(value, name) &&
        value[name] !== null &&
        value[name] !== undefined &&
        (typeof value[name] !== "string" || value[name].trim() !== ""),
    );
    if (!present) {
      issues.push(
        issue(
          source,
          "missing-block-behavior-field",
          Messages.src.config.block.parser.text0074(pathName, schema.label),
          "error",
          Object.hasOwn(value, "type") ? `${pathName}.type` : pathName,
        ),
      );
    }
  }
  for (const [key, raw] of Object.entries(value)) {
    const schema = blockSchemaFieldForName(key, fields);
    if (!schema || key === "type") continue;
    const fieldPath = `${pathName}.${key}`;
    if (schema.valueProvider === "boolean" && !isBoolean(raw)) {
      issues.push(
        issue(
          source,
          "invalid-block-behavior-field",
          Messages.src.config.block.parser.text0075(fieldPath),
          "error",
          fieldPath,
        ),
      );
    } else if (
      schema.valueProvider === "number" &&
      typeof raw !== "number" &&
      typeof raw !== "string" &&
      typeof raw !== "boolean"
    ) {
      issues.push(
        issue(
          source,
          "invalid-block-behavior-field",
          Messages.src.config.block.parser.text0076(fieldPath),
          "error",
          fieldPath,
        ),
      );
    } else if (
      schema.valueProvider === "number-provider" &&
      !isNumberProviderScalar(raw) &&
      !isRecord(raw)
    ) {
      issues.push(
        issue(
          source,
          "invalid-block-behavior-field",
          Messages.src.config.block.parser.text0077(fieldPath),
          "error",
          fieldPath,
        ),
      );
    } else if (
      schema.values &&
      schema.valueProvider !== "boolean" &&
      schema.valueProvider !== "number" &&
      schema.valueProvider !== "number-provider" &&
      (typeof raw !== "string" || !schema.values.includes(raw))
    ) {
      issues.push(
        issue(
          source,
          "invalid-block-behavior-field",
          Messages.src.config.block.parser.text0078(
            fieldPath,
            schema.values.join("、"),
          ),
          "error",
          fieldPath,
        ),
      );
    }
  }
}

function validateSettings(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): void {
  if (!isRecord(raw.settings)) {
    if (raw.settings !== undefined)
      issues.push(
        issue(
          source,
          "invalid-block-settings",
          Messages.src.config.block.parser.text0079,
          "error",
          "settings",
        ),
      );
    return;
  }
  if (options.unknownExtensionSyntax === "warning") {
    validateKnownFields(
      raw.settings,
      BLOCK_SETTING_FIELDS,
      source,
      "settings",
      "unknown-block-setting-field",
      Messages.src.config.block.parser.text0080,
      issues,
    );
  }
  for (const key of [
    "burnable",
    "replaceable",
    "can_occlude",
    "can-occlude",
    "is_redstone_conductor",
    "is-redstone-conductor",
    "is_suffocating",
    "is-suffocating",
    "is_randomly_ticking",
    "is-randomly-ticking",
    "is_view_blocking",
    "is-view-blocking",
    "propagate_skylight",
    "propagate-skylight",
    "require_correct_tools",
    "require-correct-tools",
    "respect_tool_component",
    "respect-tool-component",
    "use_shape_for_light_occlusion",
    "use-shape-for-light-occlusion",
    "block_raytrace",
    "block-raytrace",
  ]) {
    if (raw.settings[key] !== undefined && !isBoolean(raw.settings[key])) {
      issues.push(
        issue(
          source,
          "invalid-block-setting-value",
          Messages.src.config.block.parser.text0081(key),
          "error",
          `settings.${key}`,
        ),
      );
    }
  }
  for (const key of [
    "luminance",
    "burn_chance",
    "burn-chance",
    "fire_spread_chance",
    "fire-spread-chance",
    "block_light",
    "block-light",
    "light_block",
    "light-block",
    "light_dampening",
    "light-dampening",
    "hardness",
    "friction",
    "speed_factor",
    "speed-factor",
    "jump_factor",
    "jump-factor",
    "resistance",
    "incorrect_tool_dig_speed",
    "incorrect-tool-dig-speed",
    "bounce_restitution",
    "bounce-restitution",
  ]) {
    const value = raw.settings[key];
    if (
      value !== undefined &&
      typeof value !== "number" &&
      typeof value !== "string" &&
      typeof value !== "boolean"
    ) {
      issues.push(
        issue(
          source,
          "invalid-block-setting-value",
          Messages.src.config.block.parser.text0082(key),
          "error",
          `settings.${key}`,
        ),
      );
    }
  }
  const pushReaction = field(raw.settings, ["push_reaction", "push-reaction"]);
  if (pushReaction) {
    const value = scalarText(pushReaction[1])?.toLowerCase();
    const allowed = ["normal", "destroy", "block", "ignore", "push_only"];
    if (value === undefined || !allowed.includes(value)) {
      issues.push(
        issue(
          source,
          "invalid-block-setting-value",
          Messages.src.config.block.parser.text0083(
            pushReaction[0],
            allowed.join("、"),
          ),
          "error",
          `settings.${pushReaction[0]}`,
        ),
      );
    }
  }
}

function parseBlock(
  candidate: ConfigurationCandidateInput,
  options: BlockBuildOptions,
  issues: CoreIssue[],
): BlockDefinition | undefined {
  if (candidate.kind !== "block" || !isRecord(candidate.value))
    return undefined;
  const source = candidate.source;
  const id = makeIdentifier(candidate.rawId, source.pack.namespace);
  if (!isValidIdentifier(id)) {
    issues.push(
      issue(
        source,
        "invalid-block-id",
        Messages.src.config.block.parser.text0084(id),
        "error",
      ),
    );
    return undefined;
  }
  const [namespace, value] = splitIdentifier(id, source.pack.namespace);
  const raw = candidate.value;
  validateKnownFields(
    raw,
    BLOCK_ROOT_FIELDS,
    source,
    "",
    "unknown-block-field",
    Messages.src.config.block.parser.text0085,
    issues,
  );
  issues.push(
    ...validateSchemaNumberProviders({
      value: raw,
      source,
      rootPath: ["block"],
      fieldsForContext: blockFieldsForContext,
      domain: "block",
      domainLabel: Messages.src.config.block.parser.text0086,
    }),
  );
  if (raw.state !== undefined && raw.states !== undefined) {
    issues.push(
      issue(
        source,
        "duplicate-block-state-alias",
        Messages.src.config.block.parser.text0087,
        "warning",
        "states",
        true,
      ),
    );
  }
  const selectedState = stateSection(raw);
  if (!selectedState) {
    if (!options.vanillaBlocks?.has(id)) {
      issues.push(
        issue(
          source,
          "missing-block-state",
          Messages.src.config.block.parser.text0088(id),
          "error",
        ),
      );
    }
    return {
      kind: "block",
      id,
      namespace,
      value,
      source,
      raw,
    };
  }
  const [stateKey, state] = selectedState;
  const properties = new Map<string, BlockPropertyDefinition>();
  if (state.properties !== undefined && !isRecord(state.properties)) {
    issues.push(
      issue(
        source,
        "invalid-block-properties",
        Messages.src.config.block.parser.text0089(stateKey),
        "error",
        `${stateKey}.properties`,
      ),
    );
  } else if (isRecord(state.properties)) {
    for (const [name, property] of Object.entries(state.properties)) {
      const parsed = parseProperty(
        name,
        property,
        source,
        stateKey,
        options,
        issues,
      );
      if (parsed) properties.set(name, parsed);
    }
  }
  let stateCount = 1;
  for (const property of properties.values()) {
    stateCount *= property.values.length;
    if (!Number.isSafeInteger(stateCount)) {
      issues.push(
        issue(
          source,
          "block-state-count-overflow",
          Messages.src.config.block.parser.text0090(id),
          "error",
          `${stateKey}.properties`,
        ),
      );
      break;
    }
  }
  const fixedId = state.id;
  if (fixedId !== undefined) {
    const parsed = integerLiteral(fixedId);
    if (parsed === undefined || parsed < 0)
      issues.push(
        issue(
          source,
          "invalid-block-state-id",
          Messages.src.config.block.parser.text0091(stateKey),
          "error",
          `${stateKey}.id`,
        ),
      );
  }

  if (properties.size === 0) {
    validateVisual(state, source, stateKey, options, issues);
  } else {
    let appearances: readonly string[] = [];
    const appearanceField = field(state, ["appearance", "appearances"]);
    if (
      !appearanceField ||
      !isRecord(appearanceField[1]) ||
      Object.keys(appearanceField[1]).length === 0
    ) {
      issues.push(
        issue(
          source,
          "missing-block-appearances",
          Messages.src.config.block.parser.text0092(id),
          "error",
          stateKey,
          true,
        ),
      );
    } else {
      appearances = Object.keys(appearanceField[1]);
      for (const [name, visual] of Object.entries(appearanceField[1])) {
        validateVisual(
          visual,
          source,
          `${stateKey}.${appearanceField[0]}.${name}`,
          options,
          issues,
        );
      }
    }
    const variants = state.variants;
    if (variants !== undefined && !isRecord(variants)) {
      issues.push(
        issue(
          source,
          "invalid-block-variants",
          Messages.src.config.block.parser.text0093(stateKey),
          "error",
          `${stateKey}.variants`,
        ),
      );
    } else if (isRecord(variants)) {
      const normalizedSelectors = new Map<string, string>();
      for (const [selector, variant] of Object.entries(variants)) {
        const variantPath = `${stateKey}.variants.${selector}`;
        const normalized = parseVariantSelector(
          selector,
          properties,
          source,
          variantPath,
          issues,
        );
        const prior =
          normalized === undefined
            ? undefined
            : normalizedSelectors.get(normalized);
        if (prior !== undefined) {
          issues.push(
            issue(
              source,
              "duplicate-block-variant-selector",
              Messages.src.config.block.parser.text0094(selector, prior),
              "warning",
              variantPath,
              true,
            ),
          );
        } else if (normalized !== undefined)
          normalizedSelectors.set(normalized, selector);
        if (!isRecord(variant)) {
          issues.push(
            issue(
              source,
              "invalid-block-variant",
              Messages.src.config.block.parser.text0095(selector),
              "error",
              variantPath,
            ),
          );
          continue;
        }
        const appearance = variant.appearance ?? variant.appearances;
        if (
          appearance !== undefined &&
          (typeof appearance !== "string" || !appearances.includes(appearance))
        ) {
          issues.push(
            issue(
              source,
              "unknown-block-appearance",
              Messages.src.config.block.parser.text0096(
                selector,
                displayUnknown(appearance),
              ),
              "error",
              `${variantPath}.${Object.hasOwn(variant, "appearance") ? "appearance" : "appearances"}`,
            ),
          );
        }
        if (variant.settings !== undefined && !isRecord(variant.settings)) {
          issues.push(
            issue(
              source,
              "invalid-block-variant-settings",
              Messages.src.config.block.parser.text0097(selector),
              "error",
              `${variantPath}.settings`,
            ),
          );
        }
      }
    } else if (appearances.length > 1) {
      issues.push(
        issue(
          source,
          "unused-block-appearances",
          Messages.src.config.block.parser.text0098(id),
          "warning",
          stateKey,
        ),
      );
    }
  }
  validateSettings(raw, source, options, issues);
  validateBehaviors(raw, source, options, issues);
  return {
    kind: "block",
    id,
    namespace,
    value,
    source,
    raw,
  };
}

function conflictIssues(blocks: readonly BlockDefinition[]): CoreIssue[] {
  const issues: CoreIssue[] = [];
  for (const values of groupBy(
    blocks.filter((block) => block.source.pack.active),
    (block) =>
      `${canonicalPath(block.source.pack.resourcesRoot)}\u0000${block.id}`,
  ).values()) {
    if (values.length < 2) continue;
    for (const block of values) {
      issues.push(
        issue(
          block.source,
          "duplicate-block-id",
          Messages.src.config.block.parser.text0099(block.id),
          "error",
          undefined,
          false,
          values
            .filter((other) => other !== block)
            .map((other) => ({
              message: Messages.src.config.block.parser.text0100(
                other.source.pack.name,
                other.source.pack.active,
              ),
              uri: other.source.uri,
              range: other.source.idRange,
            })),
        ),
      );
    }
  }
  return issues;
}

export function buildBlockIndex(
  configurations: readonly ConfigurationCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  options: BlockBuildOptions,
): BlockBuildResult {
  const issues = [...inheritedIssues];
  const blocks = configurations
    .map((candidate) => parseBlock(candidate, options, issues))
    .filter((block): block is BlockDefinition => block !== undefined);
  issues.push(...conflictIssues(blocks));
  const activeUris = new Set(
    configurations
      .filter((candidate) => candidate.source.pack.active)
      .map((candidate) => candidate.source.uri),
  );
  return {
    blocks,
    issues: issues.filter(
      (entry) =>
        options.includeInactiveDiagnostics || activeUris.has(entry.uri),
    ),
  };
}
