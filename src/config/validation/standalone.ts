import { configFileFieldsForContext } from "../schema/configFile.js";
import type { ParsedYamlFile } from "../model.js";
import {
  standaloneFileInfo,
  standaloneSchemaForContext,
  type StandaloneValueKind,
} from "../files/standalone.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { appendPath as at } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import {
  finiteSchemaNumber,
  isSchemaBoolean,
  validateSchema,
  type SchemaConstraintProblem,
  type SchemaConstraintResult,
} from "./schema.js";
import {
  booleanConstraint,
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  isScalar,
  issueCodes,
  mappingOrList,
  obviouslyInvalidRegex,
  oneProblem,
  originalSemantic,
  problem,
  valueAt,
  type RootTree,
} from "./shared.js";

import { Messages } from "../../messages.js";
function standaloneRoot(parsed: ParsedYamlFile): RootTree {
  const value: Record<string, unknown> = {};
  const keys = new Map<string, TextRange>();
  const values = new Map<string, TextRange>();
  for (const section of parsed.sections) {
    value[section.key] = section.value;
    keys.set(section.key, section.keyRange);
    values.set(section.key, section.valueRange);
    for (const [path, range] of section.ranges.keys)
      keys.set(at(section.key, path), range);
    for (const [path, range] of section.ranges.values)
      values.set(at(section.key, path), range);
  }
  const fullRange = { start: 0, end: Math.max(parsed.text.length, 1) };
  return {
    value,
    source: {
      uri: parsed.uri,
      idRange: parsed.sections[0]?.keyRange ?? fullRange,
      entryRange: fullRange,
      fieldKeyRanges: keys,
      fieldValueRanges: values,
    },
  };
}

function configDynamicFields(
  root: unknown,
  context: SchemaContext,
): readonly SchemaField[] {
  const base = configFileFieldsForContext(context);
  const placeholders = base.filter((field) => /^<[^>]+>$/u.test(field.label));
  if (placeholders.length === 0) return exactFields(base);
  const fixed = base.filter((field) => !/^<[^>]+>$/u.test(field.label));
  const node = valueAt(root, context.path, 0);
  if (!isRecord(node)) return exactFields(fixed);
  const placeholder = placeholders[0];
  if (!placeholder) return exactFields(fixed);
  return [
    ...exactFields(fixed),
    ...Object.keys(node)
      .filter((key) => !exactFieldForName(key, fixed))
      .map((key) => dynamicValidationField(placeholder, key)),
  ];
}

function configTypeValue(field: SchemaField, value: string): string {
  if ((field.values ?? []).includes(value)) return value;
  if (!value.startsWith("!"))
    return value.startsWith("craftengine:")
      ? value.slice("craftengine:".length)
      : value;
  const body = value.slice(1);
  return `!${body.startsWith("craftengine:") ? body.slice("craftengine:".length) : body}`;
}

function inferredConfigShape(
  field: SchemaField,
  fieldPath: string,
): "mapping" | "list" | "mapping-or-list" | undefined {
  if (fieldPath === "resource-pack.delivery.hosting") return "mapping-or-list";
  if (fieldPath.endsWith(".timeout")) return undefined;
  if (/^[^\n]+:\n\s+-/u.test(field.snippet)) return "list";
  if (/^[^\n]+:\n\s+/u.test(field.snippet)) return "mapping";
  return undefined;
}

function configConstraint(
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const boolean = booleanConstraint("config", context);
  if (boolean) return boolean;
  const semantic = originalSemantic(context.field);
  const configuredKey = dynamicKey(context.field);
  switch (semantic) {
    case "<id_or_range>":
      if (
        configuredKey !== undefined &&
        !/^\d+(?:~\d+)?$/u.test(configuredKey)
      )
        return oneProblem(
          problem(
            "invalid-config-dynamic-key",
            Messages.src.config.validation.standalone.text0001(
              context.fieldPath,
            ),
            "key",
          ),
        );
      break;
    case "<result>":
      if (
        configuredKey !== undefined &&
        finiteSchemaNumber(configuredKey) === undefined
      )
        return oneProblem(
          problem(
            "invalid-config-dynamic-key",
            Messages.src.config.validation.standalone.text0002(
              context.fieldPath,
            ),
            "key",
          ),
        );
      break;
    case "<from>":
      if (
        configuredKey !== undefined &&
        (typeof context.value !== "string" || context.value.trim() === "")
      )
        return oneProblem(
          problem(
            "invalid-config-dynamic-value",
            Messages.src.config.validation.standalone.text0003(
              context.fieldPath,
            ),
          ),
        );
      break;
  }

  if (semantic === "type" && context.field.values) {
    if (typeof context.value !== "string") {
      return oneProblem(
        problem(
          "invalid-config-enum",
          Messages.src.config.validation.standalone.text0004(context.fieldPath),
        ),
        true,
      );
    }
    if (
      !context.field.values.includes(
        configTypeValue(context.field, context.value),
      )
    ) {
      return oneProblem(
        problem(
          "invalid-config-enum",
          Messages.src.config.validation.standalone.text0005(
            context.fieldPath,
            context.field.values.join("、"),
          ),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }

  if (context.fieldPath === "config-version") {
    if (context.value !== "84") {
      return oneProblem(
        problem(
          "invalid-config-version",
          Messages.src.config.validation.standalone.text0006,
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (
    context.fieldPath.endsWith(".port") &&
    context.field.values?.includes("auto")
  ) {
    const port = finiteSchemaNumber(context.value);
    if (
      context.value !== "auto" &&
      (port === undefined ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65_535)
    ) {
      return oneProblem(
        problem(
          "invalid-config-port",
          Messages.src.config.validation.standalone.text0007(context.fieldPath),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (context.fieldPath === "chunk-system.injection.target") {
    if (typeof context.value !== "string") {
      return oneProblem(
        problem(
          "invalid-config-string",
          Messages.src.config.validation.standalone.text0008(context.fieldPath),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (context.fieldPath === "chunk-system.compression-method") {
    const method = finiteSchemaNumber(context.value);
    if (
      method !== undefined &&
      (!Number.isInteger(method) || method < 1 || method > 5)
    ) {
      return oneProblem(
        problem(
          "invalid-config-compression-method",
          Messages.src.config.validation.standalone.text0009,
        ),
      );
    }
  }
  if (
    (context.fieldPath === "resource-pack.supported-version.min" ||
      context.fieldPath === "resource-pack.supported-version.max" ||
      context.fieldPath.endsWith(".region")) &&
    context.field.values
  ) {
    if (typeof context.value !== "string" || context.value.trim() === "") {
      return oneProblem(
        problem(
          "invalid-config-string",
          Messages.src.config.validation.standalone.text0010(context.fieldPath),
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }

  if (
    (semantic === "terms" || semantic === "term") &&
    isRecord(context.value)
  ) {
    return { replaceBuiltIn: true };
  }
  if (
    semantic === "pattern" &&
    typeof context.value === "string" &&
    obviouslyInvalidRegex(context.value)
  ) {
    return oneProblem(
      problem(
        "invalid-config-regex",
        Messages.src.config.validation.standalone.text0011(context.fieldPath),
      ),
    );
  }

  const shape = inferredConfigShape(context.field, context.fieldPath);
  if (shape === "mapping" && !isRecord(context.value)) {
    return oneProblem(
      problem(
        "invalid-config-mapping",
        Messages.src.config.validation.standalone.text0012(context.fieldPath),
      ),
    );
  }
  if (shape === "list" && !isUnknownArray(context.value)) {
    return oneProblem(
      problem(
        "invalid-config-list",
        Messages.src.config.validation.standalone.text0013(context.fieldPath),
      ),
    );
  }
  if (shape === "mapping-or-list" && !mappingOrList(context.value)) {
    return oneProblem(
      problem(
        "invalid-config-hosting",
        Messages.src.config.validation.standalone.text0014,
      ),
    );
  }
  if (shape === undefined && context.fieldPath.endsWith(".timeout")) {
    if (
      !isRecord(context.value) &&
      finiteSchemaNumber(context.value) === undefined
    ) {
      return oneProblem(
        problem(
          "invalid-config-timeout",
          Messages.src.config.validation.standalone.text0015(context.fieldPath),
        ),
      );
    }
    return undefined;
  }
  if (shape === undefined && context.field.detail.includes("NumberProvider")) {
    if (isUnknownArray(context.value)) {
      return oneProblem(
        problem(
          "invalid-config-number-provider",
          Messages.src.config.validation.standalone.text0016(context.fieldPath),
        ),
      );
    }
    return undefined;
  }
  if (
    shape === undefined &&
    context.field.valueProvider !== "boolean" &&
    context.field.valueProvider !== "number" &&
    context.field.values === undefined &&
    context.value !== null &&
    !isScalar(context.value)
  ) {
    return oneProblem(
      problem(
        "invalid-config-scalar",
        Messages.src.config.validation.standalone.text0017(context.fieldPath),
      ),
    );
  }
  return undefined;
}

function validateConfigFile(tree: RootTree): readonly CoreIssue[] {
  return validateSchema({
    value: tree.value,
    source: tree.source,
    domainLabel: "config.yml",
    fieldsForContext: (context) => configDynamicFields(tree.value, context),
    issueCodes: issueCodes("config"),
    unknownField: (context) => {
      const base = configFileFieldsForContext(context);
      if (base.some((field) => /^<[^>]+>$/u.test(field.label))) return "open";
      return base.length === 0 && context.path.length > 0 ? "skip" : "diagnose";
    },
    constraints: configConstraint,
  });
}

function standaloneDynamicFields(
  filePath: string,
  root: unknown,
  context: SchemaContext,
): readonly SchemaField[] {
  const schema = standaloneSchemaForContext(filePath, context);
  if (!schema) return [];
  const base = schema.fields;
  const node = valueAt(root, context.path, 0);
  if (!schema.dynamicKey || !isRecord(node)) return exactFields(base);
  return [
    ...exactFields(base),
    ...Object.keys(node)
      .filter((key) => !exactFieldForName(key, base))
      .map((key) => dynamicValidationField(schema.dynamicKey!, key)),
  ];
}

function valueKindProblem(
  kind: StandaloneValueKind,
  value: unknown,
  fieldPath: string,
): SchemaConstraintProblem | undefined {
  switch (kind) {
    case "mapping":
      return isRecord(value)
        ? undefined
        : problem(
            "invalid-standalone-mapping",
            Messages.src.config.validation.standalone.text0018(fieldPath),
          );
    case "boolean":
      return typeof value === "boolean"
        ? undefined
        : problem(
            "invalid-standalone-boolean",
            Messages.src.config.validation.standalone.text0019(fieldPath),
          );
    case "boolean-like":
      return isSchemaBoolean(value)
        ? undefined
        : problem(
            "invalid-standalone-boolean",
            Messages.src.config.validation.standalone.text0020(fieldPath),
          );
    case "number":
      return finiteSchemaNumber(value) !== undefined
        ? undefined
        : problem(
            "invalid-standalone-number",
            Messages.src.config.validation.standalone.text0021(fieldPath),
          );
    case "string":
      return typeof value === "string"
        ? undefined
        : problem(
            "invalid-standalone-string",
            Messages.src.config.validation.standalone.text0022(fieldPath),
          );
    case "stringifiable":
      return isScalar(value)
        ? undefined
        : problem(
            "invalid-standalone-scalar",
            Messages.src.config.validation.standalone.text0023(fieldPath),
          );
    case "string-list":
      return isUnknownArray(value) &&
        value.every((entry) => typeof entry === "string")
        ? undefined
        : problem(
            "invalid-standalone-string-list",
            Messages.src.config.validation.standalone.text0024(fieldPath),
          );
    case "translation-node":
      return isScalar(value) ||
        isRecord(value) ||
        (isUnknownArray(value) && value.every(isScalar))
        ? undefined
        : problem(
            "invalid-translation-node",
            Messages.src.config.validation.standalone.text0025(fieldPath),
          );
    case "ignored":
      return undefined;
  }
}

function standaloneConstraint(
  filePath: string,
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
): SchemaConstraintResult | undefined {
  const schema = standaloneSchemaForContext(filePath, {
    path: context.path,
    siblingValues: context.siblingValues,
  });
  if (!schema) return undefined;

  if (
    schema.file.kind === "commands" &&
    context.fieldPath === "config-version"
  ) {
    if (context.value !== "84") {
      return oneProblem(
        problem(
          "invalid-commands-version",
          Messages.src.config.validation.standalone.text0026,
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }
  if (
    schema.file.kind === "translation" &&
    context.fieldPath === "lang-version"
  ) {
    if (finiteSchemaNumber(context.value) !== 65) {
      return oneProblem(
        problem(
          "invalid-translation-version",
          Messages.src.config.validation.standalone.text0027,
        ),
        true,
      );
    }
    return { replaceBuiltIn: true };
  }

  const problems: SchemaConstraintProblem[] = [];
  const valueProblem = valueKindProblem(
    schema.valueKind,
    context.value,
    context.fieldPath,
  );
  if (valueProblem) problems.push(valueProblem);

  if (schema.file.kind === "pack" && dynamicKey(context.field) !== undefined) {
    const key = dynamicKey(context.field)!;
    if (
      key === "." ||
      key === ".." ||
      key.includes("/") ||
      key.includes("\\")
    ) {
      problems.push(
        problem(
          "invalid-pack-subpack-id",
          Messages.src.config.validation.standalone.text0028(key),
          "key",
        ),
      );
    }
  }
  if (
    schema.file.kind === "pack" &&
    context.fieldPath === "namespace" &&
    (typeof context.value !== "string" ||
      !/^[a-z0-9_.-]+$/u.test(context.value))
  ) {
    problems.push(
      problem(
        "invalid-pack-namespace",
        Messages.src.config.validation.standalone.text0029,
      ),
    );
  }
  if (
    schema.file.kind === "commands" &&
    context.fieldPath.endsWith(".usage") &&
    isUnknownArray(context.value)
  ) {
    if (
      context.value.some(
        (entry) => typeof entry !== "string" || !entry.startsWith("/"),
      )
    ) {
      problems.push(
        problem(
          "invalid-command-usage",
          Messages.src.config.validation.standalone.text0030(context.fieldPath),
        ),
      );
    }
  }
  if (problems.length === 0) {
    return schema.valueKind === "boolean-like"
      ? { replaceBuiltIn: true }
      : undefined;
  }
  return {
    replaceBuiltIn:
      schema.valueKind === "boolean" ||
      schema.valueKind === "boolean-like" ||
      schema.valueKind === "number",
    problems,
  };
}

function validateKnownStandalone(
  parsed: ParsedYamlFile,
  tree: RootTree,
): readonly CoreIssue[] {
  const file = standaloneFileInfo(parsed.uri);
  if (!file) return [];
  const issues = [
    ...validateSchema({
      value: tree.value,
      source: tree.source,
      domainLabel:
        file.kind === "commands"
          ? "commands.yml"
          : file.kind === "pack"
            ? "pack.yml"
            : Messages.src.config.validation.standalone.text0031(
                file.locale ?? "",
              ),
      fieldsForContext: (context) =>
        standaloneDynamicFields(parsed.uri, tree.value, context),
      issueCodes: issueCodes(file.kind),
      unknownField: (context) => {
        const schema = standaloneSchemaForContext(parsed.uri, context);
        if (schema?.unknownKeys === "arbitrary") return "open";
        if (schema?.unknownKeys === "ignored") return "skip";
        return "diagnose";
      },
      constraints: (context) => standaloneConstraint(parsed.uri, context),
    }),
  ];

  if (file.kind === "commands" && isRecord(tree.value)) {
    const rootSchema = standaloneSchemaForContext(parsed.uri, {
      path: [],
      siblingValues: new Map(),
    });
    for (const [feature, value] of Object.entries(tree.value)) {
      if (
        !rootSchema ||
        !exactFieldForName(feature, rootSchema.fields) ||
        feature === "config-version" ||
        !isRecord(value) ||
        value.enable !== true
      )
        continue;
      for (const required of ["permission", "usage"]) {
        const configured = value[required];
        const missing =
          configured === undefined ||
          configured === null ||
          (typeof configured === "string" && configured.trim() === "") ||
          (isUnknownArray(configured) && configured.length === 0);
        if (!missing) continue;
        issues.push(
          customIssue(
            tree.source,
            "missing-command-field",
            Messages.src.config.validation.standalone.text0032(
              feature,
              required,
            ),
            "error",
            feature,
          ),
        );
      }
    }
  }
  return issues;
}

export function validateStandaloneParsedFile(
  parsed: ParsedYamlFile,
): readonly CoreIssue[] {
  const tree = standaloneRoot(parsed);
  if (parsed.uri.replaceAll("\\", "/").split("/").at(-1) === "config.yml")
    return validateConfigFile(tree);
  return validateKnownStandalone(parsed, tree);
}
