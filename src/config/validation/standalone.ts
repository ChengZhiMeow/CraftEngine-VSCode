import { configFileFieldsForContext } from "../schema/configFile.js";
import type { ParsedYamlFile } from "../model.js";
import {
  COMMANDS_CONFIG_VERSION,
  LEGACY_CONFIG_VERSION,
  LEGACY_LANG_VERSION,
  SUPPORTED_CONFIG_VERSIONS,
  SUPPORTED_LANG_VERSIONS,
  TRANSLATION_LANG_VERSION,
  standaloneFileInfo,
  standaloneSchemaForContext,
  type StandaloneValueKind,
} from "../files/standalone.js";
import type { SchemaContext, SchemaField } from "../schema/types.js";
import { CURRENT_CONFIG_VERSION } from "../registry/legacyKeys.js";
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
  customIssue,
  dynamicKey,
  dynamicValidationField,
  exactFieldForName,
  exactFields,
  isScalar,
  issueCodes,
  obviouslyInvalidRegex,
  oneProblem,
  originalSemantic,
  problem,
  valueAt,
  type RootTree,
} from "./shared.js";

import { Messages } from "../../messages.js";
import { craftEngineBoolean } from "../parsing/packMetadata.js";
import { evaluateExpression } from "../expression/evaluator.js";
interface StandaloneTree extends RootTree {
  readonly text: string;
}

function standaloneRoot(parsed: ParsedYamlFile): StandaloneTree {
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
    text: parsed.text,
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
): "mapping" | "list" | undefined {
  if (fieldPath.endsWith(".timeout")) return undefined;
  if (/^[^\n]+:\n\s+-/u.test(field.snippet)) return "list";
  if (/^[^\n]+:\n\s+/u.test(field.snippet)) return "mapping";
  return undefined;
}

function sparrowConfigBoolean(value: unknown): boolean {
  try {
    craftEngineBoolean(value);
    return true;
  } catch {
    return false;
  }
}

function sparrowConfigNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const normalized = value.trim().replaceAll("_", "");
  if (normalized === "NaN") return Number.NaN;
  const parsed = Number(normalized);
  if (!Number.isNaN(parsed)) return parsed;
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" ? evaluated : undefined;
  } catch {
    return undefined;
  }
}

// CE 的版本校验是字符串等值: Config.java:307,329 拿 craft-engine.properties 里的
// "114"/"83" 和提取值比较, 提取值由 ConfigVersionExtractor.java:18-24 取标量、
// sparrow-yaml 的 FieldVersionExtractor.java:34-56 对数字做 String.valueOf 得到。
// sparrow-yaml 用的 SnakeYAML 只把规范的十进制整数写法当数字:
// `114` 解析成 Integer 得到 "114", `"114"` 是字符串原样取出,
// 而 `114.0`/`1.14e2` 是 Double 得到 "114.0", `+114`/`0114`/`0x72`/`114_0` 连数字都不是,
// 会按原样字符串取出, 所以这些写法都不等于 "114"。
function versionScalarText(
  tree: StandaloneTree,
  fieldPath: string,
  value: unknown,
): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value !== "number") return undefined;
  // 数字只能靠原始标量文本区分 `114` 与 `114.0`/`+114`/`0114`
  const range = tree.source.fieldValueRanges.get(fieldPath);
  const raw =
    range === undefined ? undefined : tree.text.slice(range.start, range.end);
  if (raw !== undefined) return /^(?:0|[1-9]\d*)$/u.test(raw) ? raw : undefined;
  return Number.isInteger(value) ? String(value) : undefined;
}

  // CraftEngine 会把版本不等于当前的文件整体升级(Config.java:329-331),
  // 所以旧版本号的文件依然可用; 只有区间外的写法才算写错
function versionSupported(
  tree: StandaloneTree,
  fieldPath: string,
  value: unknown,
  supported: ReadonlySet<string>,
): boolean {
  const text = versionScalarText(tree, fieldPath, value);
  return text !== undefined && supported.has(text);
}

  // 老版本 config.yml/commands.yml 用的是 config-version 这个键名
function isVersionField(fieldPath: string): boolean {
  return fieldPath === "___version___" || fieldPath === "config-version";
}

  // 文件自己声明的版本, 用于放宽旧键校验; 读不到 (缺失或写法不是规范十进制) 时返回 undefined
function declaredConfigVersion(tree: StandaloneTree): number | undefined {
  const root = tree.value;
  if (!isRecord(root)) return undefined;
  for (const key of ["___version___", "config-version"]) {
    const text = versionScalarText(tree, key, root[key]);
    if (text === undefined) continue;
    return /^(?:0|[1-9]\d*)$/u.test(text) ? Number(text) : undefined;
  }
  return undefined;
}

function configConstraint(
  context: Parameters<
    NonNullable<Parameters<typeof validateSchema>[0]["constraints"]>
  >[0],
  tree: StandaloneTree,
): SchemaConstraintResult | undefined {
  if (context.field.valueProvider === "boolean") {
    return sparrowConfigBoolean(context.value)
      ? { replaceBuiltIn: true }
      : oneProblem(
          problem(
            "invalid-config-boolean",
            Messages.src.config.validation.shared.text0003(
              "config.yml",
              context.fieldPath,
            ),
          ),
          true,
        );
  }
  if (context.field.valueProvider === "number") {
    return sparrowConfigNumber(context.value) !== undefined
      ? { replaceBuiltIn: true }
      : oneProblem(
          problem(
            "invalid-config-number",
            `${context.fieldPath} 必须是数字或普通数字字符串`,
          ),
          true,
        );
  }
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
    if (!isScalar(context.value)) {
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
        configTypeValue(context.field, String(context.value)),
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

  if (isVersionField(context.fieldPath)) {
    if (
      !versionSupported(
        tree,
        context.fieldPath,
        context.value,
        SUPPORTED_CONFIG_VERSIONS,
      )
    ) {
      return oneProblem(
        problem(
          "invalid-config-version",
          Messages.src.config.validation.standalone.text0033(
            LEGACY_CONFIG_VERSION,
            COMMANDS_CONFIG_VERSION,
          ),
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
    context.fieldPath.startsWith("resource-pack.workflows.") &&
    context.fieldPath.endsWith(".trigger")
  ) {
    // resource-pack.workflows.<name>.trigger 接受单个字符串或字符串列表
    if (
      !isScalar(context.value) &&
      !(
        isUnknownArray(context.value) &&
        context.value.every((entry) => isScalar(entry))
      )
    ) {
      return oneProblem(
        problem(
          "invalid-config-list",
          `config.yml 的 ${context.fieldPath} 必须是字符串或字符串列表`,
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

function validateConfigFile(
  tree: StandaloneTree,
  configVersion: number,
): readonly CoreIssue[] {
  return validateSchema({
    value: tree.value,
    source: tree.source,
    domainLabel: "config.yml",
    fieldsForContext: (context) => configDynamicFields(tree.value, context),
    configVersion,
    issueCodes: issueCodes("config"),
    unknownField: (context) => {
      const base = configFileFieldsForContext(context);
      if (base.some((field) => /^<[^>]+>$/u.test(field.label))) return "open";
      return base.length === 0 && context.path.length > 0 ? "skip" : "diagnose";
    },
    constraints: (context) => configConstraint(context, tree),
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
  tree: StandaloneTree,
): SchemaConstraintResult | undefined {
  const schema = standaloneSchemaForContext(filePath, {
    path: context.path,
    siblingValues: context.siblingValues,
  });
  if (!schema) return undefined;

  if (schema.file.kind === "commands" && isVersionField(context.fieldPath)) {
    if (
      !versionSupported(
        tree,
        context.fieldPath,
        context.value,
        SUPPORTED_CONFIG_VERSIONS,
      )
    ) {
      return oneProblem(
        problem(
          "invalid-commands-version",
          Messages.src.config.validation.standalone.text0034(
            LEGACY_CONFIG_VERSION,
            COMMANDS_CONFIG_VERSION,
          ),
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
    // CE 同样按字符串比较翻译版本: TranslationManagerImpl.java:282-283
    if (
      !versionSupported(
        tree,
        context.fieldPath,
        context.value,
        SUPPORTED_LANG_VERSIONS,
      )
    ) {
      return oneProblem(
        problem(
          "invalid-translation-version",
          Messages.src.config.validation.standalone.text0027(
            String(LEGACY_LANG_VERSION),
            String(TRANSLATION_LANG_VERSION),
          ),
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
  tree: StandaloneTree,
  configVersion: number,
): readonly CoreIssue[] {
  const file = standaloneFileInfo(parsed.uri);
  if (!file) return [];
  // commands.yml 用文件自己声明的版本, pack.yml 与翻译文件没有版本标记, 用工作区版本
  const effectiveVersion =
    file.kind === "commands"
      ? (declaredConfigVersion(tree) ?? configVersion)
      : configVersion;
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
      configVersion: effectiveVersion,
      issueCodes: issueCodes(file.kind),
      unknownField: (context) => {
        const schema = standaloneSchemaForContext(parsed.uri, context);
        if (schema?.unknownKeys === "arbitrary") return "open";
        if (schema?.unknownKeys === "ignored") return "skip";
        return "diagnose";
      },
      constraints: (context) => standaloneConstraint(parsed.uri, context, tree),
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
        feature === "___version___" ||
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
  configVersion: number = CURRENT_CONFIG_VERSION,
): readonly CoreIssue[] {
  const tree = standaloneRoot(parsed);
  if (parsed.uri.replaceAll("\\", "/").split("/").at(-1) === "config.yml")
    // config.yml 用自己的声明版本, 读不到时退回工作区版本
    return validateConfigFile(tree, declaredConfigVersion(tree) ?? configVersion);
  return validateKnownStandalone(parsed, tree, configVersion);
}
