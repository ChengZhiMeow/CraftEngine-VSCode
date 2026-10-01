import {
  FURNITURE_BEHAVIOR_TYPES,
  FURNITURE_ELEMENT_TYPES,
  FURNITURE_HITBOX_TYPES,
  furnitureFieldsForContext,
} from "./schema.js";
import type { BlockDefinition } from "../block/model.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
} from "../model.js";
import { validateSchemaNumberProviders } from "../number-provider/validation.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import type {
  FurnitureBehaviorDefinition,
  FurnitureDefinition,
  FurnitureElementDefinition,
  FurnitureHitboxDefinition,
  FurnitureSeatDefinition,
  FurnitureVariantDefinition,
  FurnitureVector3,
} from "./model.js";
import type { ItemDefinition } from "../item/model.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

import { Messages } from "../../messages.js";
export interface FurnitureBuildOptions {
  readonly includeInactiveDiagnostics: boolean;
  readonly unknownExtensionSyntax?: "ignore" | "warning";
  readonly vanillaItems?: ReadonlySet<string>;
  readonly vanillaBlocks?: ReadonlySet<string>;
  readonly vanillaEntityTypes?: ReadonlySet<string>;
  readonly items?: readonly ItemDefinition[];
  readonly blocks?: readonly BlockDefinition[];
}

export interface FurnitureBuildResult {
  readonly furniture: readonly FurnitureDefinition[];
  readonly issues: readonly CoreIssue[];
}

type FurnitureHitboxSource = "variant" | "behavior" | "implicit";

const ROOT_FIELDS = new Set([
  "enable",
  "debug",
  "settings",
  "variant",
  "variants",
  "placement",
  "entity_culling",
  "entity-culling",
  "events",
  "event",
  "loots",
  "loot",
  "behaviors",
  "behavior",
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
]);
const VARIANT_FIELDS = new Set([
  "loot_spawn_offset",
  "loot-spawn-offset",
  "elements",
  "hitboxes",
  "blueprint",
  "better-model",
  "model-engine",
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
]);
const ELEMENT_COMMON = new Set([
  "type",
  "conditions",
  "condition",
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
]);
const DISPLAY_ELEMENT_FIELDS = [
  "position",
  "scale",
  "translation",
  "pitch",
  "yaw",
  "rotation",
  "billboard",
  "shadow_radius",
  "shadow-radius",
  "shadow_strength",
  "shadow-strength",
  "glow_color",
  "glow-color",
  "brightness",
  "view_range",
  "view-range",
] as const;
const ELEMENT_FIELDS = new Map<string, ReadonlySet<string>>([
  [
    "item_display",
    new Set([
      "item",
      "apply_dyed_color",
      "apply-dyed-color",
      "display_context",
      "display_transform",
      "display-context",
      "display-transform",
      "tint_source",
      "tint-source",
      "tint_sources",
      "tint-sources",
      "copy_data",
      "copy-data",
      ...DISPLAY_ELEMENT_FIELDS,
    ]),
  ],
  [
    "text_display",
    new Set([
      "text",
      "line_width",
      "line-width",
      "background_color",
      "background-color",
      "text_opacity",
      "text-opacity",
      "has_shadow",
      "has-shadow",
      "is_see_through",
      "is-see-through",
      "use_default_background_color",
      "use-default-background-color",
      "alignment",
      ...DISPLAY_ELEMENT_FIELDS,
    ]),
  ],
  ["block_display", new Set(["block", ...DISPLAY_ELEMENT_FIELDS])],
  [
    "item",
    new Set([
      "item",
      "position",
      "apply_dyed_color",
      "apply-dyed-color",
      "tint_source",
      "tint-source",
      "tint_sources",
      "tint-sources",
      "copy_data",
      "copy-data",
    ]),
  ],
  [
    "armor_stand",
    new Set([
      "item",
      "scale",
      "position",
      "pitch",
      "yaw",
      "glow_color",
      "glow-color",
      "apply_dyed_color",
      "apply-dyed-color",
      "small",
      "tint_source",
      "tint-source",
      "tint_sources",
      "tint-sources",
      "copy_data",
      "copy-data",
    ]),
  ],
  [
    "better_model",
    new Set([
      "model",
      "position",
      "yaw",
      "pitch",
      "sight_trace",
      "sight-trace",
      "tint",
      "tints",
      "tint_source",
      "tint-source",
      "tint_bone",
      "tint-bone",
      "tint_bones",
      "tint-bones",
      "tint_children",
      "tint-children",
    ]),
  ],
  ["model_engine", new Set(["model", "position", "yaw", "pitch"])],
]);
const HITBOX_COMMON = new Set([
  "type",
  "position",
  "seats",
  "can_use_item_on",
  "can-use-item-on",
  "blocks_building",
  "blocks-building",
  "can_be_hit_by_projectile",
  "can-be-hit-by-projectile",
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
]);
const HITBOX_FIELDS = new Map<string, ReadonlySet<string>>([
  [
    "interaction",
    new Set(["scale", "width", "height", "interactive", "invisible"]),
  ],
  [
    "shulker",
    new Set([
      "scale",
      "peek",
      "direction",
      "interaction_entity",
      "interaction-entity",
      "interactive",
      "invisible",
    ]),
  ],
  ["happy_ghast", new Set(["scale", "hard_collision", "hard-collision"])],
  ["custom", new Set(["entity_type", "entity-type", "scale"])],
]);
const BEHAVIOR_COMMON = new Set([
  "type",
  "template",
  "templates",
  "arguments",
  "overrides",
  "merges",
]);
const BEHAVIOR_FIELDS = new Map<string, ReadonlySet<string>>([
  [
    "simple_storage_furniture",
    new Set(["title", "rows", "data_key", "data-key", "sounds", "variants"]),
  ],
  [
    "display_item_furniture",
    new Set(["data_key", "data-key", "sounds", "variants"]),
  ],
  ["glowing_furniture", new Set(["lights", "variants"])],
]);
const CULLING_FIELDS = new Set([
  "aabb",
  "view_distance",
  "view-distance",
  "aabb_expansion",
  "aabb-expansion",
  "ray_tracing",
  "ray-tracing",
]);
function field(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
): [string, unknown] | undefined {
  for (const name of names) {
    if (
      Object.hasOwn(raw, name) &&
      raw[name] !== null &&
      raw[name] !== undefined
    )
      return [name, raw[name]];
  }
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
  pathName?: string,
  key = false,
  related?: CoreIssue["related"],
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: sourceRange(source, pathName, key),
    ...(related === undefined ? {} : { related }),
  };
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value.replaceAll("_", "")))
  ) {
    return Number(value.replaceAll("_", ""));
  }
  return fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  try {
    return craftEngineBoolean(value);
  } catch {
    return fallback;
  }
}

function vector3(value: unknown): FurnitureVector3 | undefined {
  let values: readonly unknown[];
  if (typeof value === "number") values = [value];
  else if (typeof value === "string")
    values = value
      .replaceAll("_", "")
      .split(",")
      .map((entry) => entry.trim());
  else if (isUnknownArray(value)) values = value;
  else return undefined;
  if (values.length !== 1 && values.length !== 3) return undefined;
  const numbers = values.map((entry) =>
    typeof entry === "number"
      ? entry
      : typeof entry === "string"
        ? Number(entry)
        : Number.NaN,
  );
  if (!numbers.every(Number.isFinite)) return undefined;
  return numbers.length === 1
    ? [numbers[0]!, numbers[0]!, numbers[0]!]
    : [numbers[0]!, numbers[1]!, numbers[2]!];
}

function checkedVector(
  value: unknown,
  fallback: FurnitureVector3,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): FurnitureVector3 {
  if (value === undefined) return fallback;
  const parsed = vector3(value);
  if (parsed) return parsed;
  issues.push(
    issue(
      source,
      "invalid-furniture-vector",
      Messages.src.config.furniture.parser.text0003(pathName),
      "error",
      pathName,
    ),
  );
  return fallback;
}

function warnUnknownFields(
  raw: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  source: ConfigurationSource,
  pathName: string,
  code: string,
  label: string,
  issues: CoreIssue[],
): void {
  for (const key of Object.keys(raw))
    if (!allowed.has(key)) {
      issues.push(
        issue(
          source,
          code,
          Messages.src.config.furniture.parser.text0004(label, key),
          "warning",
          pathName ? `${pathName}.${key}` : key,
          true,
        ),
      );
    }
}

function warnAliasShadow(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
  source: ConfigurationSource,
  basePath: string,
  label: string,
  issues: CoreIssue[],
): void {
  const present = names.filter(
    (name) => raw[name] !== undefined && raw[name] !== null,
  );
  if (present.length < 2) return;
  for (const shadowed of present.slice(1))
    issues.push(
      issue(
        source,
        "shadowed-furniture-alias",
        Messages.src.config.furniture.parser.text0005(
          label,
          present.join("、"),
          present[0] ?? "",
        ),
        "warning",
        basePath ? `${basePath}.${shadowed}` : shadowed,
        true,
      ),
    );
}

  // CraftEngine SeatConfig 映射形式: position/yaw/limit_player_rotation/force_player_rotation
function parseSeatMapping(
  value: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): FurnitureSeatDefinition | undefined {
  const positionField = field(value, ["position"]);
  const position = positionField ? vector3(positionField[1]) : undefined;
  if (!position) {
    issues.push(
      issue(
        source,
        "invalid-furniture-seat-position",
        `${pathName}.position 必须是 "x,y,z" 坐标`,
        "error",
        `${pathName}.position`,
      ),
    );
    return undefined;
  }
  const yawField = value.yaw;
  const yaw = yawField === undefined ? 0 : numberValue(yawField, Number.NaN);
  if (!Number.isFinite(yaw)) {
    issues.push(
      issue(
        source,
        "invalid-furniture-seat-yaw",
        `${pathName}.yaw 必须是数值`,
        "error",
        `${pathName}.yaw`,
      ),
    );
    return undefined;
  }
  let limitedRotation = yawField !== undefined;
  const limit = field(value, [
    "limit_player_rotation",
    "limit-player-rotation",
  ]);
  if (limit) {
    try {
      limitedRotation = craftEngineBoolean(limit[1]);
    } catch {
      issues.push(
        issue(
          source,
          "invalid-furniture-seat-limit-rotation",
          `${pathName}.${limit[0]} 必须是布尔值`,
          "error",
          `${pathName}.${limit[0]}`,
        ),
      );
    }
  }
  const force = field(value, [
    "force_player_rotation",
    "force-player-rotation",
  ]);
  const forcedRotation = force
    ? parseForcedRotation(force[1], yaw)
    : Number.NaN;
  if (force && forcedRotation === undefined)
    issues.push(
      issue(
        source,
        "invalid-furniture-seat-force-rotation",
        `${pathName}.${force[0]} 必须是布尔值或角度数值`,
        "error",
        `${pathName}.${force[0]}`,
      ),
    );
  return {
    position,
    yaw,
    limitedRotation,
    forcePlayerRotation: forcedRotation ?? Number.NaN,
    path: pathName,
  };
}

// CraftEngine SeatConfig#parseForcePlayerRotation: 忽略大小写的 true 等于 yaw, false 为不调整
function parseForcedRotation(value: unknown, yaw: number): number | undefined {
  const text =
    typeof value === "boolean"
      ? String(value)
      : typeof value === "string"
        ? value
        : undefined;
  if (text !== undefined) {
    const lowered = text.toLowerCase();
    if (lowered === "true") return yaw;
    if (lowered === "false") return Number.NaN;
  }
  const parsed = numberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// Java 的 String.split(regex, 0) 只丢掉尾部的空段, 前导空格会留下一个空的首段
function splitJava(text: string, separator: string): string[] {
  const parts = text.split(separator);
  while (parts.length > 1 && parts.at(-1) === "") parts.pop();
  return parts;
}

function parseSeat(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): FurnitureSeatDefinition | undefined {
  if (isRecord(value))
    return parseSeatMapping(value, source, pathName, issues);
  if (typeof value !== "string") {
    issues.push(
      issue(
        source,
        "invalid-furniture-seat",
        `座位 ${pathName} 必须是 "x,y,z [yaw [force]]" 字符串或 position/yaw 映射`,
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  // CraftEngine SeatConfig#fromConfig: 按单个空格切段, 坐标段用 splitValuesRestrict(",", 3) 要求正好 3 段。
  // CE 不做 trim, 带前导空格时首段是空串, 坐标段只有 1 段会抛 PARSE_SPLIT_FAILED(ConfigValue.java:624-635)
  const parts = splitJava(value, " ");
  const coordinates = (parts[0] ?? "").split(",");
  const position = coordinates.length === 3 ? vector3(parts[0]) : undefined;
  const hasYaw = parts.length > 1;
  const yaw = hasYaw ? numberValue(parts[1], Number.NaN) : 0;
  if (!position || !Number.isFinite(yaw)) {
    issues.push(
      issue(
        source,
        "invalid-furniture-seat",
        Messages.src.config.furniture.parser.text0007(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  // 第 3 段以后 CE 不读取, 这里同样忽略
  const forcedRotation =
    parts.length > 2 ? parseForcedRotation(parts[2], yaw) : Number.NaN;
  if (forcedRotation === undefined)
    issues.push(
      issue(
        source,
        "invalid-furniture-seat-force-rotation",
        `座位 ${pathName} 的第 3 段必须是布尔值或角度数值`,
        "error",
        pathName,
      ),
    );
  return {
    position,
    yaw,
    limitedRotation: hasYaw,
    forcePlayerRotation: forcedRotation ?? Number.NaN,
    path: pathName,
  };
}

function parseSeats(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): FurnitureSeatDefinition[] {
  if (value === undefined) return [];
  const values = isUnknownArray(value) ? value : [value];
  return values.flatMap((entry, index) => {
    const parsed = parseSeat(
      entry,
      source,
      isUnknownArray(value) ? `${pathName}.${index}` : pathName,
      issues,
    );
    return parsed ? [parsed] : [];
  });
}

function validAabb(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  const values = isUnknownArray(value)
    ? value.map((entry) =>
        typeof entry === "number"
          ? entry
          : Number(String(entry).replaceAll("_", "")),
      )
    : typeof value === "string"
      ? value
          .replaceAll("_", "")
          .split(",")
          .map((entry) => Number(entry.trim()))
      : [];
  return [1, 2, 3, 6].includes(values.length) && values.every(Number.isFinite);
}

function validateCulling(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  issues: CoreIssue[],
): void {
  const selected = field(raw, ["entity_culling", "entity-culling"]);
  if (
    !selected ||
    selected[1] === undefined ||
    selected[1] === true ||
    selected[1] === false
  )
    return;
  const pathName = selected[0];
  if (!isRecord(selected[1])) {
    issues.push(
      issue(
        source,
        "invalid-furniture-culling",
        Messages.src.config.furniture.parser.text0008(pathName),
        "error",
        pathName,
      ),
    );
    return;
  }
  const culling = selected[1];
  warnUnknownFields(
    culling,
    CULLING_FIELDS,
    source,
    pathName,
    "unknown-furniture-culling-field",
    Messages.src.config.furniture.parser.text0009,
    issues,
  );
  warnAliasShadow(
    culling,
    ["view_distance", "view-distance"],
    source,
    pathName,
    "view_distance",
    issues,
  );
  warnAliasShadow(
    culling,
    ["aabb_expansion", "aabb-expansion"],
    source,
    pathName,
    "aabb_expansion",
    issues,
  );
  warnAliasShadow(
    culling,
    ["ray_tracing", "ray-tracing"],
    source,
    pathName,
    "ray_tracing",
    issues,
  );
  if (culling.aabb !== undefined && !validAabb(culling.aabb))
    issues.push(
      issue(
        source,
        "invalid-furniture-culling-aabb",
        Messages.src.config.furniture.parser.text0010(pathName),
        "error",
        `${pathName}.aabb`,
      ),
    );
  const viewDistance = field(culling, ["view_distance", "view-distance"]);
  if (viewDistance) {
    const parsed = numberValue(viewDistance[1], Number.NaN);
    if (!Number.isInteger(parsed))
      issues.push(
        issue(
          source,
          "invalid-furniture-culling-view-distance",
          Messages.src.config.furniture.parser.text0011(
            pathName,
            viewDistance[0],
          ),
          "error",
          `${pathName}.${viewDistance[0]}`,
        ),
      );
    else if (parsed <= 0)
      issues.push(
        issue(
          source,
          "non-positive-furniture-culling-view-distance",
          Messages.src.config.furniture.parser.text0012(
            pathName,
            viewDistance[0],
          ),
          "warning",
          `${pathName}.${viewDistance[0]}`,
        ),
      );
  }
  const expansion = field(culling, ["aabb_expansion", "aabb-expansion"]);
  if (expansion) {
    const parsed = numberValue(expansion[1], Number.NaN);
    if (!Number.isFinite(parsed))
      issues.push(
        issue(
          source,
          "invalid-furniture-culling-aabb-expansion",
          Messages.src.config.furniture.parser.text0013(pathName, expansion[0]),
          "error",
          `${pathName}.${expansion[0]}`,
        ),
      );
    else if (parsed < 0)
      issues.push(
        issue(
          source,
          "negative-furniture-culling-aabb-expansion",
          Messages.src.config.furniture.parser.text0014(pathName, expansion[0]),
          "warning",
          `${pathName}.${expansion[0]}`,
        ),
      );
  }
  const rayTracing = field(culling, ["ray_tracing", "ray-tracing"]);
  if (rayTracing && typeof rayTracing[1] !== "boolean")
    issues.push(
      issue(
        source,
        "invalid-furniture-culling-ray-tracing",
        Messages.src.config.furniture.parser.text0015(pathName, rayTracing[0]),
        "error",
        `${pathName}.${rayTracing[0]}`,
      ),
    );
}

function parseHitbox(
  rawValue: unknown,
  source: ConfigurationSource,
  pathName: string,
  sourceKind: FurnitureHitboxSource,
  sourceLabel: string,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureHitboxDefinition | undefined {
  if (!isRecord(rawValue)) {
    issues.push(
      issue(
        source,
        "invalid-furniture-hitbox",
        Messages.src.config.furniture.parser.text0016(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  const rawType =
    typeof rawValue.type === "string" && rawValue.type !== ""
      ? rawValue.type
      : "interaction";
  const builtInType = localRegistryDiscriminator(rawType);
  const type = builtInType ?? rawType;
  const known =
    builtInType !== undefined &&
    (FURNITURE_HITBOX_TYPES as readonly string[]).includes(builtInType);
  if (!known) {
    const severity = isValidRegistryDiscriminator(rawType)
      ? options.unknownExtensionSyntax === "warning"
        ? "warning"
        : undefined
      : "error";
    if (severity)
      issues.push(
        issue(
          source,
          "unknown-furniture-hitbox-type",
          Messages.src.config.furniture.parser.text0017(rawType),
          severity,
          `${pathName}.type`,
        ),
      );
  } else {
    const knownFields = new Set([
      ...HITBOX_COMMON,
      ...(HITBOX_FIELDS.get(builtInType) ?? []),
    ]);
    const ignoredInteractionEntity =
      builtInType === "interaction"
        ? field(rawValue, ["interaction_entity", "interaction-entity"])
        : undefined;
    if (ignoredInteractionEntity) {
      knownFields.add("interaction_entity");
      knownFields.add("interaction-entity");
      issues.push(
        issue(
          source,
          "ignored-furniture-interaction-entity",
          Messages.src.config.furniture.parser.text0018(
            pathName,
            ignoredInteractionEntity[0],
          ),
          "warning",
          `${pathName}.${ignoredInteractionEntity[0]}`,
          true,
        ),
      );
    }
    warnUnknownFields(
      rawValue,
      knownFields,
      source,
      pathName,
      "unknown-furniture-hitbox-field",
      Messages.src.config.furniture.parser.text0019,
      issues,
    );
  }
  const position = checkedVector(
    rawValue.position,
    [0, 0, 0],
    source,
    `${pathName}.position`,
    issues,
  );
  const seats = parseSeats(rawValue.seats, source, `${pathName}.seats`, issues);
  let width: number | undefined;
  let height: number | undefined;
  let scale: number | undefined;
  let entityType: string | undefined;
  if (builtInType === "interaction") {
    if (rawValue.scale !== undefined) {
      if (typeof rawValue.scale === "string" && rawValue.scale.includes(",")) {
        const parts = rawValue.scale.split(",").map(Number);
        if (parts.length >= 2 && parts.slice(0, 2).every(Number.isFinite)) {
          [width, height] = parts as [number, number];
          if (parts.length > 2)
            issues.push(
              issue(
                source,
                "ignored-furniture-hitbox-scale-components",
                Messages.src.config.furniture.parser.text0020(
                  pathName,
                  parts.length - 2,
                ),
                "warning",
                `${pathName}.scale`,
              ),
            );
        } else
          issues.push(
            issue(
              source,
              "invalid-furniture-hitbox-scale",
              Messages.src.config.furniture.parser.text0021(pathName),
              "error",
              `${pathName}.scale`,
            ),
          );
      } else {
        const parsed = numberValue(rawValue.scale, Number.NaN);
        if (Number.isFinite(parsed)) width = height = parsed;
        else
          issues.push(
            issue(
              source,
              "invalid-furniture-hitbox-scale",
              Messages.src.config.furniture.parser.text0022(pathName),
              "error",
              `${pathName}.scale`,
            ),
          );
      }
    } else {
      width = numberValue(rawValue.width, 1);
      height = numberValue(rawValue.height, 1);
    }
  } else {
    scale = numberValue(rawValue.scale, 1);
  }
  if (builtInType === "custom") {
    const selected = field(rawValue, ["entity_type", "entity-type"]);
    if (!selected || typeof selected[1] !== "string" || selected[1] === "") {
      issues.push(
        issue(
          source,
          "missing-furniture-entity-type",
          Messages.src.config.furniture.parser.text0023(pathName),
          "error",
          pathName,
          true,
        ),
      );
    } else {
      entityType = makeIdentifier(selected[1].toLowerCase(), "minecraft");
      if (!isValidIdentifier(entityType))
        issues.push(
          issue(
            source,
            "invalid-furniture-entity-type",
            Messages.src.config.furniture.parser.text0024(selected[1]),
            "error",
            `${pathName}.${selected[0]}`,
          ),
        );
      else if (
        entityType.startsWith("minecraft:") &&
        options.vanillaEntityTypes &&
        !options.vanillaEntityTypes.has(entityType)
      ) {
        issues.push(
          issue(
            source,
            "unknown-furniture-entity-type",
            Messages.src.config.furniture.parser.text0025(entityType),
            "error",
            `${pathName}.${selected[0]}`,
          ),
        );
      }
    }
  }
  if (builtInType === "shulker") {
    const peek = numberValue(rawValue.peek, 0);
    if (!Number.isInteger(peek))
      issues.push(
        issue(
          source,
          "invalid-furniture-shulker-peek",
          Messages.src.config.furniture.parser.text0026(pathName),
          "error",
          `${pathName}.peek`,
        ),
      );
    else if (peek < 0 || peek > 100)
      issues.push(
        issue(
          source,
          "unsafe-furniture-shulker-peek",
          Messages.src.config.furniture.parser.text0027(pathName),
          "warning",
          `${pathName}.peek`,
        ),
      );
    if (rawValue.direction !== undefined) {
      switch (
        typeof rawValue.direction === "string"
          ? rawValue.direction.toLowerCase()
          : ""
      ) {
        case "down":
        case "up":
        case "north":
        case "south":
        case "west":
        case "east":
          break;
        default:
          issues.push(
            issue(
              source,
              "invalid-furniture-shulker-direction",
              Messages.src.config.furniture.parser.text0028(pathName),
              "error",
              `${pathName}.direction`,
            ),
          );
      }
    }
  }
  if (
    [width, height, scale]
      .filter((entry): entry is number => entry !== undefined)
      .some((entry) => entry <= 0)
  )
    issues.push(
      issue(
        source,
        "non-positive-furniture-hitbox-size",
        Messages.src.config.furniture.parser.text0029(pathName),
        "warning",
        pathName,
      ),
    );
  return {
    type,
    path: pathName,
    raw: rawValue,
    position,
    seats,
    sourceLabel,
    behaviorGenerated: sourceKind === "behavior",
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(scale === undefined ? {} : { scale }),
    ...(entityType === undefined ? {} : { entityType }),
    blocksBuilding: booleanValue(
      field(rawValue, ["blocks_building", "blocks-building"])?.[1],
      true,
    ),
    canUseItemOn: booleanValue(
      field(rawValue, ["can_use_item_on", "can-use-item-on"])?.[1],
      true,
    ),
    canBeHitByProjectile: booleanValue(
      field(rawValue, [
        "can_be_hit_by_projectile",
        "can-be-hit-by-projectile",
      ])?.[1],
      true,
    ),
    interactive: booleanValue(rawValue.interactive, true),
  };
}

function parseHitboxes(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  sourceKind: FurnitureHitboxSource,
  sourceLabel: string,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureHitboxDefinition[] {
  const values = isUnknownArray(value) ? value : [value];
  return values.flatMap((entry, index) => {
    const parsed = parseHitbox(
      entry,
      source,
      isUnknownArray(value) ? `${pathName}.${index}` : pathName,
      sourceKind,
      sourceLabel,
      options,
      issues,
    );
    return parsed ? [parsed] : [];
  });
}

function parseElement(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureElementDefinition | undefined {
  if (!isRecord(value)) {
    issues.push(
      issue(
        source,
        "invalid-furniture-element",
        Messages.src.config.furniture.parser.text0030(pathName),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  const rawType =
    typeof value.type === "string" && value.type !== ""
      ? value.type
      : value.text !== undefined
        ? "text_display"
        : value.item !== undefined
          ? "item_display"
          : value.block !== undefined
            ? "block_display"
            : undefined;
  if (!rawType) {
    issues.push(
      issue(
        source,
        "missing-furniture-element-type",
        Messages.src.config.furniture.parser.text0031(pathName),
        "error",
        pathName,
        true,
      ),
    );
    return undefined;
  }
  const builtInType = localRegistryDiscriminator(rawType);
  const type = builtInType ?? rawType;
  const known =
    builtInType !== undefined &&
    (FURNITURE_ELEMENT_TYPES as readonly string[]).includes(builtInType);
  if (!known) {
    const severity = isValidRegistryDiscriminator(rawType)
      ? options.unknownExtensionSyntax === "warning"
        ? "warning"
        : undefined
      : "error";
    if (severity)
      issues.push(
        issue(
          source,
          "unknown-furniture-element-type",
          Messages.src.config.furniture.parser.text0032(rawType),
          severity,
          `${pathName}.type`,
        ),
      );
  } else {
    warnUnknownFields(
      value,
      new Set([
        ...ELEMENT_COMMON,
        ...(ELEMENT_FIELDS.get(builtInType) ?? []),
      ]),
      source,
      pathName,
      "unknown-furniture-element-field",
      Messages.src.config.furniture.parser.text0033,
      issues,
    );
  }
  const required =
    builtInType === "text_display"
      ? "text"
      : builtInType === "block_display"
        ? "block"
        : builtInType &&
            ["item_display", "item", "armor_stand"].includes(builtInType)
          ? "item"
          : builtInType &&
              ["better_model", "model_engine"].includes(builtInType)
            ? "model"
            : undefined;
  if (
    required &&
    (typeof value[required] !== "string" || value[required] === "")
  ) {
    issues.push(
      issue(
        source,
        "missing-furniture-element-field",
        Messages.src.config.furniture.parser.text0034(pathName, type, required),
        "error",
        pathName,
        true,
      ),
    );
  }
  const item =
    typeof value.item === "string" && value.item !== ""
      ? makeIdentifier(value.item.toLowerCase(), "minecraft")
      : undefined;
  const block =
    typeof value.block === "string" && value.block !== ""
      ? value.block
      : undefined;
  if (item && !isValidIdentifier(item))
    issues.push(
      issue(
        source,
        "invalid-furniture-element-item",
        Messages.src.config.furniture.parser.text0035(
          typeof value.item === "string" ? value.item : "",
        ),
        "error",
        `${pathName}.item`,
      ),
    );
  if (block) {
    const base = block.replace(/\[.*$/u, "");
    if (!isValidIdentifier(makeIdentifier(base, "minecraft")))
      issues.push(
        issue(
          source,
          "invalid-furniture-element-block",
          Messages.src.config.furniture.parser.text0036(block),
          "error",
          `${pathName}.block`,
        ),
      );
  }
  return {
    type,
    path: pathName,
    raw: value,
    position: checkedVector(
      value.position,
      [0, 0, 0],
      source,
      `${pathName}.position`,
      issues,
    ),
    scale: checkedVector(
      value.scale,
      [1, 1, 1],
      source,
      `${pathName}.scale`,
      issues,
    ),
    translation: checkedVector(
      value.translation,
      [0, 0, 0],
      source,
      `${pathName}.translation`,
      issues,
    ),
    pitch: numberValue(value.pitch, 0),
    yaw: numberValue(value.yaw, 0),
    ...(item === undefined ? {} : { item }),
    ...(block === undefined ? {} : { block }),
    ...(typeof value.text !== "string" ? {} : { text: value.text }),
    ...(!builtInType ||
    !["better_model", "model_engine"].includes(builtInType) ||
    typeof value.model !== "string"
      ? {}
      : { externalModel: value.model }),
    external:
      (builtInType !== undefined &&
        ["better_model", "model_engine"].includes(builtInType)) ||
      !known,
  };
}

function implicitHitbox(pathName: string): FurnitureHitboxDefinition {
  return {
    type: "interaction",
    path: pathName,
    raw: {},
    position: [0, 0, 0],
    seats: [],
    sourceLabel: Messages.src.config.furniture.parser.text0037,
    behaviorGenerated: false,
    width: 1,
    height: 1,
    blocksBuilding: false,
    canUseItemOn: false,
    canBeHitByProjectile: false,
    interactive: true,
  };
}

function parseVariant(
  name: string,
  value: unknown,
  source: ConfigurationSource,
  variantsKey: string,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureVariantDefinition | undefined {
  const pathName = `${variantsKey}.${name}`;
  if (!isRecord(value)) {
    issues.push(
      issue(
        source,
        "invalid-furniture-variant",
        Messages.src.config.furniture.parser.text0038(name),
        "error",
        pathName,
      ),
    );
    return undefined;
  }
  const fields =
    variantsKey === "placement" &&
    source.sectionKey.includes(":inline-furniture")
      ? new Set([...VARIANT_FIELDS, "rules"])
      : VARIANT_FIELDS;
  warnUnknownFields(
    value,
    fields,
    source,
    pathName,
    "unknown-furniture-variant-field",
    Messages.src.config.furniture.parser.text0039,
    issues,
  );
  warnAliasShadow(
    value,
    ["loot_spawn_offset", "loot-spawn-offset"],
    source,
    pathName,
    "loot_spawn_offset",
    issues,
  );
  warnAliasShadow(
    value,
    ["blueprint", "better-model", "model-engine"],
    source,
    pathName,
    "blueprint",
    issues,
  );
  const elementsValue = value.elements;
  const elements =
    elementsValue === undefined
      ? []
      : (isUnknownArray(elementsValue)
          ? elementsValue
          : [elementsValue]
        ).flatMap((entry, index) => {
          const parsed = parseElement(
            entry,
            source,
            isUnknownArray(elementsValue)
              ? `${pathName}.elements.${index}`
              : `${pathName}.elements`,
            options,
            issues,
          );
          return parsed ? [parsed] : [];
        });
  const hitboxesValue = value.hitboxes;
  const hitboxes =
    hitboxesValue === undefined
      ? [implicitHitbox(`${pathName}.hitboxes`)]
      : parseHitboxes(
          hitboxesValue,
          source,
          `${pathName}.hitboxes`,
          "variant",
          `variant ${name}`,
          options,
          issues,
        );
  const blueprint = field(value, ["blueprint", "better-model", "model-engine"]);
  if (blueprint && typeof blueprint[1] !== "string") {
    issues.push(
      issue(
        source,
        "invalid-furniture-blueprint",
        Messages.src.config.furniture.parser.text0040(pathName, blueprint[0]),
        "error",
        `${pathName}.${blueprint[0]}`,
      ),
    );
  }
  checkedVector(
    field(value, ["loot_spawn_offset", "loot-spawn-offset"])?.[1],
    [0, 0, 0],
    source,
    `${pathName}.loot_spawn_offset`,
    issues,
  );
  return {
    name,
    elements,
    hitboxes,
    ...(typeof blueprint?.[1] !== "string" ? {} : { blueprint: blueprint[1] }),
  };
}

function behaviorVariantHitboxes(
  raw: Readonly<Record<string, unknown>>,
  type: string,
  source: ConfigurationSource,
  pathName: string,
  variantNames: ReadonlySet<string>,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureHitboxDefinition[] {
  if (!isRecord(raw.variants)) return [];
  const result: FurnitureHitboxDefinition[] = [];
  for (const [variantName, value] of Object.entries(raw.variants)) {
    const variantPath = `${pathName}.variants.${variantName}`;
    if (!variantNames.has(variantName))
      issues.push(
        issue(
          source,
          "unknown-furniture-behavior-variant",
          Messages.src.config.furniture.parser.text0041(variantPath),
          "warning",
          variantPath,
          true,
        ),
      );
    if (type === "glowing_furniture") {
      validateLights(value, source, variantPath, issues);
      continue;
    }
    if (!isRecord(value)) {
      issues.push(
        issue(
          source,
          "invalid-furniture-behavior-variant",
          Messages.src.config.furniture.parser.text0042(variantPath),
          "error",
          variantPath,
        ),
      );
      continue;
    }
    if (value.hitboxes !== undefined)
      result.push(
        ...parseHitboxes(
          value.hitboxes,
          source,
          `${variantPath}.hitboxes`,
          "behavior",
          `${type} · ${variantName}`,
          options,
          issues,
        ),
      );
    const itemPosition = field(value, ["item_position", "item-position"]);
    if (
      type === "display_item_furniture" &&
      itemPosition &&
      !vector3(itemPosition[1])
    ) {
      issues.push(
        issue(
          source,
          "invalid-furniture-item-position",
          Messages.src.config.furniture.parser.text0043(
            variantPath,
            itemPosition[0],
          ),
          "error",
          `${variantPath}.${itemPosition[0]}`,
        ),
      );
    }
  }
  return result;
}

function validateLights(
  value: unknown,
  source: ConfigurationSource,
  pathName: string,
  issues: CoreIssue[],
): void {
  if (value === undefined) return;
  const values = isUnknownArray(value) ? value : [value];
  values.forEach((entry, index) => {
    const currentPath = isUnknownArray(value)
      ? `${pathName}.${index}`
      : pathName;
    let level: number | undefined;
    if (typeof entry === "string") {
      const match = /^(.*?)\s+(-?\d+)\s*$/u.exec(entry);
      if (!match || !vector3(match[1])) {
        issues.push(
          issue(
            source,
            "invalid-furniture-light",
            Messages.src.config.furniture.parser.text0044(currentPath),
            "error",
            currentPath,
          ),
        );
        return;
      }
      level = Number(match[2]);
    } else if (isRecord(entry)) {
      if (!vector3(entry.position))
        issues.push(
          issue(
            source,
            "invalid-furniture-light-position",
            Messages.src.config.furniture.parser.text0045(currentPath),
            "error",
            `${currentPath}.position`,
          ),
        );
      level = numberValue(entry.level, Number.NaN);
    } else {
      issues.push(
        issue(
          source,
          "invalid-furniture-light",
          Messages.src.config.furniture.parser.text0046(currentPath),
          "error",
          currentPath,
        ),
      );
      return;
    }
    if (!Number.isInteger(level) || level < 1 || level > 15)
      issues.push(
        issue(
          source,
          "invalid-furniture-light-level",
          Messages.src.config.furniture.parser.text0047(currentPath),
          "error",
          currentPath,
        ),
      );
  });
}

function parseBehaviors(
  raw: Readonly<Record<string, unknown>>,
  source: ConfigurationSource,
  variantNames: ReadonlySet<string>,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureBehaviorDefinition[] {
  warnAliasShadow(
    raw,
    ["behavior", "behaviors"],
    source,
    "",
    Messages.src.config.furniture.parser.text0048,
    issues,
  );
  const selected = field(raw, ["behavior", "behaviors"]);
  if (!selected) return [];
  const values = isUnknownArray(selected[1]) ? selected[1] : [selected[1]];
  return values.flatMap((entry, index) => {
    const pathName = isUnknownArray(selected[1])
      ? `${selected[0]}.${index}`
      : selected[0];
    if (!isRecord(entry)) {
      issues.push(
        issue(
          source,
          "invalid-furniture-behavior",
          Messages.src.config.furniture.parser.text0049(pathName),
          "error",
          pathName,
        ),
      );
      return [];
    }
    if (typeof entry.type !== "string" || entry.type === "") {
      issues.push(
        issue(
          source,
          "missing-furniture-behavior-type",
          Messages.src.config.furniture.parser.text0050(pathName),
          "error",
          pathName,
          true,
        ),
      );
      return [];
    }
    const builtInType = localRegistryDiscriminator(entry.type);
    const type = builtInType ?? entry.type;
    const known =
      builtInType !== undefined &&
      (FURNITURE_BEHAVIOR_TYPES as readonly string[]).includes(builtInType);
    if (!known) {
      const severity = isValidRegistryDiscriminator(entry.type)
        ? options.unknownExtensionSyntax === "warning"
          ? "warning"
          : undefined
        : "error";
      if (severity)
        issues.push(
          issue(
            source,
            "unknown-furniture-behavior-type",
            Messages.src.config.furniture.parser.text0051(entry.type),
            severity,
            `${pathName}.type`,
          ),
        );
      return [
        { type, path: pathName, raw: entry, variantNames: [], hitboxes: [] },
      ];
    }
    warnUnknownFields(
      entry,
      new Set([
        ...BEHAVIOR_COMMON,
        ...(BEHAVIOR_FIELDS.get(builtInType) ?? []),
      ]),
      source,
      pathName,
      "unknown-furniture-behavior-field",
      Messages.src.config.furniture.parser.text0052,
      issues,
    );
    const dataKey = field(entry, ["data_key", "data-key"]);
    warnAliasShadow(
      entry,
      ["data_key", "data-key"],
      source,
      pathName,
      "data_key",
      issues,
    );
    if (
      builtInType === "simple_storage_furniture" &&
      entry.rows !== undefined
    ) {
      const rows = numberValue(entry.rows, Number.NaN);
      if (!Number.isInteger(rows))
        issues.push(
          issue(
            source,
            "invalid-furniture-storage-rows",
            Messages.src.config.furniture.parser.text0053(pathName),
            "error",
            `${pathName}.rows`,
          ),
        );
      else if (rows < 1 || rows > 6)
        issues.push(
          issue(
            source,
            "unsafe-furniture-storage-rows",
            Messages.src.config.furniture.parser.text0054(pathName),
            "warning",
            `${pathName}.rows`,
          ),
        );
    }
    if (builtInType === "glowing_furniture")
      validateLights(entry.lights, source, `${pathName}.lights`, issues);
    const hitboxes = behaviorVariantHitboxes(
      entry,
      type,
      source,
      pathName,
      variantNames,
      options,
      issues,
    );
    const configuredVariants = isRecord(entry.variants)
      ? Object.keys(entry.variants)
      : [];
    if (builtInType === "display_item_furniture")
      for (const name of variantNames)
        if (!configuredVariants.includes(name)) {
          issues.push(
            issue(
              source,
              "uncovered-display-furniture-variant",
              Messages.src.config.furniture.parser.text0055(pathName, name),
              "warning",
              `${pathName}.variants`,
            ),
          );
        }
    return [
      {
        type,
        path: pathName,
        raw: entry,
        ...(typeof dataKey?.[1] !== "string" ? {} : { dataKey: dataKey[1] }),
        variantNames: configuredVariants,
        hitboxes,
      },
    ];
  });
}

function validateReferences(
  definition: FurnitureDefinition,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): void {
  const root = canonicalPath(definition.source.pack.resourcesRoot);
  const itemExists = (id: string): boolean =>
    (options.vanillaItems?.has(id) ?? false) ||
    (options.items ?? []).some(
      (item) =>
        item.id === id &&
        item.source.pack.active &&
        canonicalPath(item.source.pack.resourcesRoot) === root,
    );
  if (!/\$\{/u.test(definition.item) && !itemExists(definition.item))
    issues.push(
      issue(
        definition.source,
        "unknown-furniture-settings-item",
        Messages.src.config.furniture.parser.text0056(definition.item),
        "error",
        definition.settingsItemPath ?? "settings.item",
      ),
    );
  for (const variant of definition.variants.values())
    for (const element of variant.elements) {
      if (
        element.item &&
        !/\$\{/u.test(element.item) &&
        !itemExists(element.item)
      )
        issues.push(
          issue(
            definition.source,
            "unknown-furniture-element-item",
            Messages.src.config.furniture.parser.text0057(element.item),
            "error",
            `${element.path}.item`,
          ),
        );
      if (element.block && !/\$\{/u.test(element.block)) {
        const base = makeIdentifier(
          element.block.replace(/\[.*$/u, ""),
          "minecraft",
        );
        const exists =
          options.vanillaBlocks?.has(base) ||
          (options.blocks ?? []).some(
            (block) =>
              block.id === base &&
              block.source.pack.active &&
              canonicalPath(block.source.pack.resourcesRoot) === root,
          );
        if (!exists)
          issues.push(
            issue(
              definition.source,
              "unknown-furniture-element-block",
              Messages.src.config.furniture.parser.text0058(base),
              "error",
              `${element.path}.block`,
            ),
          );
      }
    }
}

function parseFurniture(
  candidate: ConfigurationCandidateInput,
  options: FurnitureBuildOptions,
  issues: CoreIssue[],
): FurnitureDefinition | undefined {
  const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);
  if (!isRecord(candidate.value)) {
    issues.push(
      issue(
        candidate.source,
        "invalid-furniture-definition",
        Messages.src.config.furniture.parser.text0060(id),
        "error",
      ),
    );
    return undefined;
  }
  const source = candidate.source;
  const raw = candidate.value;
  warnUnknownFields(
    raw,
    ROOT_FIELDS,
    source,
    "",
    "unknown-furniture-field",
    Messages.src.config.furniture.parser.text0061,
    issues,
  );
  issues.push(
    ...validateSchemaNumberProviders({
      value: raw,
      source,
      rootPath: ["furniture"],
      fieldsForContext: furnitureFieldsForContext,
      domain: "furniture",
      domainLabel: Messages.src.config.furniture.parser.text0062,
    }),
  );
  warnAliasShadow(
    raw,
    ["variant", "variants", "placement"],
    source,
    "",
    Messages.src.config.furniture.parser.text0063,
    issues,
  );
  warnAliasShadow(
    raw,
    ["entity_culling", "entity-culling"],
    source,
    "",
    "entity_culling",
    issues,
  );
  warnAliasShadow(raw, ["event", "events"], source, "", "events", issues);
  warnAliasShadow(raw, ["loots", "loot"], source, "", "loot", issues);
  validateCulling(raw, source, issues);
  const variantsField = field(raw, ["variant", "variants", "placement"]);
  if (!variantsField || !isRecord(variantsField[1])) {
    issues.push(
      issue(
        source,
        "missing-furniture-variants",
        Messages.src.config.furniture.parser.text0064(id),
        "error",
        variantsField?.[0],
        variantsField === undefined,
      ),
    );
    return undefined;
  }
  const variantEntries = Object.entries(variantsField[1]);
  if (variantEntries.length === 0)
    issues.push(
      issue(
        source,
        "empty-furniture-variants",
        Messages.src.config.furniture.parser.text0065(id),
        "error",
        variantsField[0],
      ),
    );
  const variants = new Map<string, FurnitureVariantDefinition>();
  for (const [name, value] of variantEntries) {
    if (name === "") {
      issues.push(
        issue(
          source,
          "empty-furniture-variant-name",
          Messages.src.config.furniture.parser.text0066(id),
          "error",
          `${variantsField[0]}.${name}`,
          true,
        ),
      );
      continue;
    }
    const parsed = parseVariant(
      name,
      value,
      source,
      variantsField[0],
      options,
      issues,
    );
    if (parsed) variants.set(name, parsed);
  }
  const settings = isRecord(raw.settings) ? raw.settings : {};
  if (raw.settings !== undefined && !isRecord(raw.settings))
    issues.push(
      issue(
        source,
        "invalid-furniture-settings",
        Messages.src.config.furniture.parser.text0067,
        "error",
        "settings",
      ),
    );
  warnAliasShadow(
    settings,
    ["hit_times", "hit-times"],
    source,
    "settings",
    "hit_times",
    issues,
  );
  warnAliasShadow(
    settings,
    ["adventure_mode_breaking", "adventure-mode-breaking"],
    source,
    "settings",
    "adventure_mode_breaking",
    issues,
  );
  warnAliasShadow(
    settings,
    ["correct_tools", "correct-tools"],
    source,
    "settings",
    "correct_tools",
    issues,
  );
  let item = id;
  let settingsItemPath: string | undefined;
  for (const [settingKey, settingValue] of Object.entries(settings)) {
    const settingPath = `settings.${settingKey}`;
    switch (settingKey.replace(/#.*$/u, "").replaceAll("-", "_")) {
      case "item": {
        settingsItemPath = settingPath;
        if (typeof settingValue !== "string") {
          issues.push(
            issue(
              source,
              "invalid-furniture-settings-item",
              Messages.src.config.furniture.parser.text0068(settingPath),
              "error",
              settingPath,
            ),
          );
          break;
        }
        const parsedItem = makeIdentifier(
          settingValue.toLowerCase(),
          "minecraft",
        );
        if (!isValidIdentifier(parsedItem)) {
          issues.push(
            issue(
              source,
              "invalid-furniture-settings-item",
              Messages.src.config.furniture.parser.text0069(settingPath),
              "error",
              settingPath,
            ),
          );
          break;
        }
        item = parsedItem;
        break;
      }
      case "sounds":
        if (!isRecord(settingValue))
          issues.push(
            issue(
              source,
              "invalid-furniture-settings-sounds",
              Messages.src.config.furniture.parser.text0070(settingPath),
              "error",
              settingPath,
            ),
          );
        break;
      case "hit_times":
        if (
          typeof settingValue !== "boolean" &&
          !(
            typeof settingValue === "number" && Number.isFinite(settingValue)
          ) &&
          !(
            typeof settingValue === "string" &&
            /^[+-]?\d[\d_]*$/u.test(settingValue)
          )
        ) {
          issues.push(
            issue(
              source,
              "invalid-furniture-settings-hit-times",
              Messages.src.config.furniture.parser.text0071(settingPath),
              "error",
              settingPath,
            ),
          );
          break;
        }
        if (typeof settingValue === "number" && !Number.isInteger(settingValue))
          issues.push(
            issue(
              source,
              "truncated-furniture-settings-hit-times",
              Messages.src.config.furniture.parser.text0072(
                settingPath,
                Math.trunc(settingValue),
              ),
              "warning",
              settingPath,
            ),
          );
        break;
      case "adventure_mode_breaking":
        try {
          craftEngineBoolean(settingValue);
        } catch {
          issues.push(
            issue(
              source,
              "invalid-furniture-settings-adventure-mode-breaking",
              Messages.src.config.furniture.parser.text0073(settingPath),
              "error",
              settingPath,
            ),
          );
        }
        break;
      case "correct_tools":
        (isUnknownArray(settingValue) ? settingValue : [settingValue]).forEach(
          (tool, index) => {
            const toolPath = isUnknownArray(settingValue)
              ? `${settingPath}.${index}`
              : settingPath;
            const text =
              typeof tool === "string"
                ? tool
                : isUnknownArray(tool)
                  ? tool.join(",")
                  : undefined;
            if (
              tool === null ||
              tool === undefined ||
              text === "" ||
              text === "#"
            )
              issues.push(
                issue(
                  source,
                  "invalid-furniture-settings-correct-tool",
                  Messages.src.config.furniture.parser.text0074(toolPath),
                  "error",
                  toolPath,
                ),
              );
          },
        );
    }
  }
  const behaviors = parseBehaviors(
    raw,
    source,
    new Set(variants.keys()),
    options,
    issues,
  );
  const dataKeys = new Map<string, FurnitureBehaviorDefinition[]>();
  for (const behavior of behaviors)
    if (behavior.dataKey) {
      const entries = dataKeys.get(behavior.dataKey) ?? [];
      entries.push(behavior);
      dataKeys.set(behavior.dataKey, entries);
    }
  for (const [dataKey, entries] of dataKeys)
    if (entries.length > 1)
      for (const behavior of entries)
        issues.push(
          issue(
            source,
            "duplicate-furniture-data-key",
            Messages.src.config.furniture.parser.text0075(dataKey),
            "warning",
            `${behavior.path}.data_key`,
          ),
        );
  const seats = [...variants.values()]
    .flatMap((variant) => variant.hitboxes.flatMap((hitbox) => hitbox.seats))
    .concat(
      behaviors.flatMap((behavior) =>
        behavior.hitboxes.flatMap((hitbox) => hitbox.seats),
      ),
    );
  const seatGroups = new Map<string, FurnitureSeatDefinition[]>();
  for (const seat of seats) {
    const key = seat.position.join(",");
    const entries = seatGroups.get(key) ?? [];
    entries.push(seat);
    seatGroups.set(key, entries);
  }
  for (const [key, entries] of seatGroups)
    if (entries.length > 1)
      for (const seat of entries.slice(1))
        issues.push(
          issue(
            source,
            "duplicate-furniture-seat",
            Messages.src.config.furniture.parser.text0076(key),
            "warning",
            seat.path,
          ),
        );
  const [namespace, value] = splitIdentifier(id, source.pack.namespace);
  const definition: FurnitureDefinition = {
    kind: "furniture",
    id,
    namespace,
    value,
    source,
    raw,
    item,
    ...(settingsItemPath === undefined ? {} : { settingsItemPath }),
    variants,
    behaviors,
    ...(source.sectionKey.includes(":inline-furniture")
      ? { inlineOwnerItemId: id }
      : {}),
  };
  validateReferences(definition, options, issues);
  return definition;
}

function related(
  values: readonly FurnitureDefinition[],
  current: FurnitureDefinition,
): NonNullable<CoreIssue["related"]> {
  return values
    .filter((entry) => entry !== current)
    .map((entry) => ({
      message: Messages.src.config.furniture.parser.text0077(
        entry.source.pack.name,
        entry.source.pack.active,
        entry.inlineOwnerItemId ? "inline" : entry.source.kind,
      ),
      uri: entry.source.uri,
      range: entry.source.idRange,
    }));
}

export function buildFurnitureIndex(
  configurations: readonly ConfigurationCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  options: FurnitureBuildOptions,
): FurnitureBuildResult {
  const issues = [...inheritedIssues];
  const furniture = configurations.flatMap((candidate) => {
    if (candidate.kind !== "furniture") return [];
    const parsed = parseFurniture(candidate, options, issues);
    return parsed ? [parsed] : [];
  });
  for (const values of groupBy(
    furniture.filter((entry) => entry.source.pack.active),
    (entry) =>
      `${canonicalPath(entry.source.pack.resourcesRoot)}\u0000${entry.id}`,
  ).values())
    if (values.length > 1)
      for (const entry of values)
        issues.push(
          issue(
            entry.source,
            "duplicate-furniture-id",
            Messages.src.config.furniture.parser.text0078(entry.id),
            "error",
            undefined,
            false,
            related(values, entry),
          ),
        );
  return {
    furniture,
    issues: issues.filter(
      (entry) =>
        options.includeInactiveDiagnostics ||
        configurations.some(
          (candidate) =>
            candidate.source.uri === entry.uri && candidate.source.pack.active,
        ),
    ),
  };
}

export function furnitureVariantNames(
  raw: Readonly<Record<string, unknown>>,
): readonly string[] {
  const selected = field(raw, ["variant", "variants", "placement"]);
  return selected && isRecord(selected[1]) ? Object.keys(selected[1]) : [];
}
