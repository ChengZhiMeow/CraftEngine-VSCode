import {
  BLOCK_STATE_PROVIDER_TYPES,
  CRAFTENGINE_BLOCK_STATE_REGISTRY,
  worldgenFieldConstraint,
  worldgenListItemField,
  worldgenSchemaForContext,
  worldgenSectionKind,
  type WorldgenSchemaContext,
} from "../worldgen/schema.js";
import type { ConfigurationCandidateInput } from "../model.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue } from "../../diagnostics/model.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  finiteSchemaNumber,
  validateSchema,
  type SchemaConstraintResult,
} from "./schema.js";
import {
  booleanConstraint,
  candidateLabel,
  compactPath,
  dynamicKey,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  issueCodes,
  isScalar,
  listItemField,
  mappingOrList,
  oneProblem,
  originalSemantic,
  problem,
  resourceLocation,
  scalarText,
  suppressUnselectedVariantRequirements,
  valueAt,
  withoutIdControlValidation,
  type ValidationField,
} from "./shared.js";

import { Messages } from "../../messages.js";
function nearestFeatureType(
  root: unknown,
  path: readonly string[],
): string | undefined {
  let current = root;
  let selected: string | undefined;
  const inspect = (value: unknown): void => {
    if (!isRecord(value) || !Object.hasOwn(value, "config")) return;
    // 内联功能配置离 config 最近, 缺少 type 时不能借用外层 type
    selected = scalarText(value.type);
  };
  inspect(current);
  for (const segment of path.slice(1)) {
    if (isUnknownArray(current)) current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment];
    else break;
    inspect(current);
  }
  return selected;
}

function nearestProviderType(
  root: unknown,
  path: readonly string[],
): string | undefined {
  let current = root;
  let selected: string | undefined;
  const known = new Set<string>(BLOCK_STATE_PROVIDER_TYPES);
  const inspect = (value: unknown): void => {
    if (!isRecord(value)) return;
    const type = scalarText(value.type);
    const normalized =
      type === undefined
        ? undefined
        : type.includes(":")
          ? type
          : `minecraft:${type}`;
    if (normalized !== undefined && known.has(normalized)) {
      selected = type;
      return;
    }
    // 有 entries 就表示加权随机值, 缺少 type 时不能借用外层 type
    if (Object.hasOwn(value, "entries")) selected = undefined;
  };
  inspect(current);
  for (const segment of path.slice(1)) {
    if (isUnknownArray(current)) current = current[Number(segment)];
    else if (isRecord(current)) current = current[segment];
    else break;
    inspect(current);
  }
  return selected;
}

function worldgenBlockStateKind(
  root: unknown,
  path: readonly string[],
  customBlockIds: ReadonlySet<string>,
): WorldgenSchemaContext["blockStateKind"] {
  if (compactPath(path).at(-1) !== "Properties") return undefined;
  const owner = valueAt(root, path.slice(0, -1), 1);
  if (!isRecord(owner)) return "unknown";
  const name = scalarText(owner.Name);
  if (!name) return "unknown";
  if (customBlockIds.has(name)) return "craftengine";
  return name.startsWith("minecraft:") ? "vanilla" : "unknown";
}

function worldgenFields(
  candidate: ConfigurationCandidateInput,
  section: string,
  context: SchemaContext,
  customBlockIds: ReadonlySet<string>,
): readonly SchemaField[] {
  const featureType = nearestFeatureType(candidate.value, context.path);
  const providerType = nearestProviderType(candidate.value, context.path);
  const blockStateKind = worldgenBlockStateKind(
    candidate.value,
    context.path,
    customBlockIds,
  );
  const schema = worldgenSchemaForContext(section, {
    ...context,
    ...(featureType === undefined ? {} : { featureType }),
    ...(providerType === undefined ? {} : { providerType }),
    ...(blockStateKind === undefined ? {} : { blockStateKind }),
  });
  const base = withoutIdControlValidation(
    suppressUnselectedVariantRequirements(schema?.fields ?? [], context),
  );
  const node = valueAt(candidate.value, context.path, 1);
  if (schema?.additionalFields !== "dynamic-map" || !isRecord(node))
    return exactFields(base);
  return [
    ...exactFields(base),
    ...Object.keys(node)
      .filter((key) => !exactFieldForName(key, base))
      .map((key) =>
        dynamicValidationField(
          {
            label: key,
            semantic: key,
            aliases: [],
            detail: Messages.src.config.validation.worldgen.text0001,
            snippet: `${key}: \${0}`,
            ...(schema.dynamicValues === undefined
              ? {}
              : { validationWorldgenDynamic: schema.dynamicValues }),
          },
          key,
        ),
      ),
  ];
}

function worldgenConstraint(
  candidate: ConfigurationCandidateInput,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const boolean = booleanConstraint(candidate.kind, context);
  if (boolean) return boolean;
  const semantic = originalSemantic(context.field);
  const dynamicPolicy = (context.field as ValidationField)
    .validationWorldgenDynamic;
  if (dynamicKey(context.field) !== undefined && dynamicPolicy !== undefined) {
    if (context.value === null) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-dynamic-value`,
          Messages.src.config.validation.worldgen.text0002(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (dynamicPolicy === "string" && typeof context.value !== "string") {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-dynamic-value`,
          Messages.src.config.validation.worldgen.text0003(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    if (
      dynamicPolicy === "block-state-dependent" &&
      typeof context.value !== "string"
    ) {
      return oneProblem(
        {
          code: `ambiguous-${candidate.kind}-dynamic-value`,
          message: Messages.src.config.validation.worldgen.text0004(
            candidateLabel(candidate),
            context.fieldPath,
          ),
          severity: "warning",
        },
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  const metadata = worldgenFieldConstraint(context.field);
  if (metadata?.minItems !== undefined) {
    if (
      (isUnknownArray(context.value)
        ? context.value.length
        : isRecord(context.value)
          ? 1
          : 0) < metadata.minItems
    ) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-nonempty-list`,
          Messages.src.config.validation.worldgen.text0005(
            candidateLabel(candidate),
            context.fieldPath,
            metadata.minItems,
          ),
        ),
      );
    }
  }
  if (metadata?.valueShape === "scalar-or-mapping") {
    if (!isScalar(context.value) && !isRecord(context.value)) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-int-provider`,
          Messages.src.config.validation.worldgen.text0006(
            candidateLabel(candidate),
            context.fieldPath,
          ),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (metadata?.integer || metadata?.exclusiveMinimum !== undefined) {
    const value = finiteSchemaNumber(context.value);
    const invalid =
      value === undefined ||
      (metadata.integer === true && !Number.isInteger(value)) ||
      (metadata.exclusiveMinimum !== undefined &&
        value <= metadata.exclusiveMinimum);
    if (invalid) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-number`,
          Messages.src.config.validation.worldgen.text0007(
            candidateLabel(candidate),
            context.fieldPath,
            metadata.integer === true,
            metadata.exclusiveMinimum,
          ),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (context.field.registry) {
    if (context.field.values && typeof context.value === "string") {
      if (
        context.field.values.includes(context.value) ||
        context.field.values.includes(
          context.value.includes(":")
            ? context.value
            : `minecraft:${context.value}`,
        )
      ) {
        return { replaceBuiltIn: true };
      }
      if (!resourceLocation(context.value)) {
        return oneProblem(
          problem(
            `invalid-${candidate.kind}-registry-value`,
            Messages.src.config.validation.worldgen.text0008(
              candidateLabel(candidate),
              context.fieldPath,
            ),
          ),
          true,
        );
      }
    }
    const valid =
      (typeof context.value === "string" && context.value.trim() !== "") ||
      (isUnknownArray(context.value) &&
        context.value.every(
          (entry) => typeof entry === "string" && entry.trim() !== "",
        )) ||
      ((semantic === "feature" ||
        context.field.registry === CRAFTENGINE_BLOCK_STATE_REGISTRY) &&
        isRecord(context.value));
    if (!valid) {
      return oneProblem(
        problem(
          `invalid-${candidate.kind}-registry-value`,
          Messages.src.config.validation.worldgen.text0009(
            candidateLabel(candidate),
            context.fieldPath,
            semantic === "feature",
          ),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (semantic === "config" && !isRecord(context.value)) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-config`,
        Messages.src.config.validation.worldgen.text0010(
          candidateLabel(candidate),
        ),
      ),
    );
  }
  if (semantic === "placement" && !mappingOrList(context.value)) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-placement`,
        Messages.src.config.validation.worldgen.text0011(
          candidateLabel(candidate),
        ),
      ),
    );
  }
  if (semantic === "Properties" && !isRecord(context.value)) {
    return oneProblem(
      problem(
        `invalid-${candidate.kind}-properties`,
        Messages.src.config.validation.worldgen.text0012(
          candidateLabel(candidate),
        ),
      ),
    );
  }
  return undefined;
}

export function validateWorldgen(
  candidate: ConfigurationCandidateInput,
  section: string,
  customBlockIds: ReadonlySet<string>,
): readonly CoreIssue[] {
  const kind = worldgenSectionKind(section);
  if (!kind) return [];
  return validateSchema({
    value: candidate.value,
    source: candidate.source,
    path: [candidate.rawId],
    domainLabel: candidateLabel(candidate),
    fieldsForContext: (context) =>
      worldgenFields(candidate, section, context, customBlockIds),
    issueCodes: issueCodes(candidate.kind),
    unknownField: (context) => {
      const featureType = nearestFeatureType(candidate.value, context.path);
      const providerType = nearestProviderType(candidate.value, context.path);
      const blockStateKind = worldgenBlockStateKind(
        candidate.value,
        context.path,
        customBlockIds,
      );
      const schema = worldgenSchemaForContext(section, {
        ...context,
        ...(featureType === undefined ? {} : { featureType }),
        ...(providerType === undefined ? {} : { providerType }),
        ...(blockStateKind === undefined ? {} : { blockStateKind }),
      });
      if (schema?.additionalFields === "minecraft-runtime-codec") return "skip";
      if (schema?.additionalFields === "dynamic-map") return "open";
      return "diagnose";
    },
    listItemFieldForContext: (context) =>
      listItemField(worldgenListItemField(kind, context.path)),
    constraints: (context) => worldgenConstraint(candidate, context),
  });
}
