import {
  isValidRegistryDiscriminator,
  localRegistryDiscriminator,
} from "../registry/discriminators.js";
import { Messages } from "../../messages.js";
import { isRecord } from "../../util/records.js";
import type { SchemaField } from "../schema/types.js";

export const NUMBER_PROVIDER_TYPES = [
  "fixed",
  "constant",
  "uniform",
  "expression",
  "normal",
  "gaussian",
  "log_normal",
  "skew_normal",
  "binomial",
  "weighted",
  "triangle",
  "exponential",
  "beta",
] as const;

export type NumberProviderType = (typeof NUMBER_PROVIDER_TYPES)[number];

export const NUMBER_PROVIDER_TYPE_DETAILS: Readonly<
  Record<NumberProviderType, string>
> = {
  fixed: Messages.src.config.number_provider.schema.text0001,
  constant: Messages.src.config.number_provider.schema.text0002,
  uniform: Messages.src.config.number_provider.schema.text0003,
  expression: Messages.src.config.number_provider.schema.text0004,
  normal: Messages.src.config.number_provider.schema.text0005,
  gaussian: Messages.src.config.number_provider.schema.text0006,
  log_normal: Messages.src.config.number_provider.schema.text0007,
  skew_normal: Messages.src.config.number_provider.schema.text0008,
  binomial: Messages.src.config.number_provider.schema.text0009,
  weighted: Messages.src.config.number_provider.schema.text0010,
  triangle: Messages.src.config.number_provider.schema.text0011,
  exponential: Messages.src.config.number_provider.schema.text0012,
  beta: Messages.src.config.number_provider.schema.text0013,
};

function field(
  label: string,
  detail: string,
  options: {
    readonly aliases?: readonly string[];
    readonly required?: boolean;
    readonly valueProvider?: SchemaField["valueProvider"];
    readonly values?: readonly string[];
    readonly valueDetails?: Readonly<Record<string, string>>;
    readonly snippet?: string;
  } = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_"),
    aliases: options.aliases ?? [],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.required === undefined ? {} : { required: options.required }),
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.valueDetails === undefined
      ? {}
      : { valueDetails: options.valueDetails }),
  };
}

const number = (
  label: string,
  detail: string,
  options: {
    readonly aliases?: readonly string[];
    readonly required?: boolean;
  } = {},
): SchemaField =>
  field(label, detail, {
    ...options,
    valueProvider: "number",
  });

const nestedNumberProvider = (
  label: string,
  detail: string,
  required = false,
): SchemaField =>
  field(label, detail, {
    required,
    valueProvider: "number-provider",
    snippet: `${label}: \${0:1}`,
  });

export const NUMBER_PROVIDER_TYPE_FIELD: SchemaField = field(
  "type",
  Messages.src.config.number_provider.schema.text0014,
  {
    values: [
      ...NUMBER_PROVIDER_TYPES,
      ...NUMBER_PROVIDER_TYPES.map((type) => `craftengine:${type}`),
    ],
    valueDetails: Object.fromEntries([
      ...NUMBER_PROVIDER_TYPES.map(
        (type) => [type, NUMBER_PROVIDER_TYPE_DETAILS[type]] as const,
      ),
      ...NUMBER_PROVIDER_TYPES.map(
        (type) =>
          [
            `craftengine:${type}`,
            Messages.src.config.number_provider.schema.text0015(
              NUMBER_PROVIDER_TYPE_DETAILS[type],
            ),
          ] as const,
      ),
    ]),
    required: true,
  },
);

const NUMBER_PROVIDER_FIELDS = new Map<
  NumberProviderType,
  readonly SchemaField[]
>([
  [
    "fixed",
    [
      field("value", Messages.src.config.number_provider.schema.text0016, {
        required: true,
      }),
    ],
  ],
  [
    "constant",
    [
      field("value", Messages.src.config.number_provider.schema.text0017, {
        required: true,
      }),
    ],
  ],
  [
    "uniform",
    [
      nestedNumberProvider(
        "min",
        Messages.src.config.number_provider.schema.text0018,
        true,
      ),
      nestedNumberProvider(
        "max",
        Messages.src.config.number_provider.schema.text0019,
        true,
      ),
    ],
  ],
  [
    "expression",
    [
      field("expression", Messages.src.config.number_provider.schema.text0020, {
        required: true,
      }),
    ],
  ],
  [
    "normal",
    [
      number("min", Messages.src.config.number_provider.schema.text0021, {
        required: true,
      }),
      number("max", Messages.src.config.number_provider.schema.text0022, {
        required: true,
      }),
      number("mean", Messages.src.config.number_provider.schema.text0023),
      number("std_dev", Messages.src.config.number_provider.schema.text0024, {
        aliases: ["std-dev"],
      }),
      number(
        "max_attempts",
        Messages.src.config.number_provider.schema.text0025,
        { aliases: ["max-attempts"] },
      ),
    ],
  ],
  [
    "gaussian",
    [
      number("min", Messages.src.config.number_provider.schema.text0026, {
        required: true,
      }),
      number("max", Messages.src.config.number_provider.schema.text0027, {
        required: true,
      }),
      number("mean", Messages.src.config.number_provider.schema.text0028),
      number("std_dev", Messages.src.config.number_provider.schema.text0029, {
        aliases: ["std-dev"],
      }),
      number(
        "max_attempts",
        Messages.src.config.number_provider.schema.text0030,
        { aliases: ["max-attempts"] },
      ),
    ],
  ],
  [
    "log_normal",
    [
      number("min", Messages.src.config.number_provider.schema.text0031, {
        required: true,
      }),
      number("max", Messages.src.config.number_provider.schema.text0032, {
        required: true,
      }),
      number("mean", Messages.src.config.number_provider.schema.text0033),
      number("std_dev", Messages.src.config.number_provider.schema.text0034, {
        aliases: ["std-dev"],
      }),
      number("location", Messages.src.config.number_provider.schema.text0035),
      number("scale", Messages.src.config.number_provider.schema.text0036),
      number(
        "max_attempts",
        Messages.src.config.number_provider.schema.text0037,
        { aliases: ["max-attempts"] },
      ),
    ],
  ],
  [
    "skew_normal",
    [
      number("min", Messages.src.config.number_provider.schema.text0038, {
        required: true,
      }),
      number("max", Messages.src.config.number_provider.schema.text0039, {
        required: true,
      }),
      number("mean", Messages.src.config.number_provider.schema.text0040),
      number("std_dev", Messages.src.config.number_provider.schema.text0041, {
        aliases: ["std-dev"],
      }),
      number("skewness", Messages.src.config.number_provider.schema.text0042),
      number(
        "max_attempts",
        Messages.src.config.number_provider.schema.text0043,
        { aliases: ["max-attempts"] },
      ),
    ],
  ],
  [
    "binomial",
    [
      nestedNumberProvider(
        "extra",
        Messages.src.config.number_provider.schema.text0044,
        true,
      ),
      nestedNumberProvider(
        "probability",
        Messages.src.config.number_provider.schema.text0045,
        true,
      ),
    ],
  ],
  [
    "weighted",
    [
      field("weights", Messages.src.config.number_provider.schema.text0046, {
        required: true,
        snippet: "weights:\n  ${0}",
      }),
    ],
  ],
  [
    "triangle",
    [
      number("min", Messages.src.config.number_provider.schema.text0047, {
        required: true,
      }),
      number("max", Messages.src.config.number_provider.schema.text0048, {
        required: true,
      }),
      number("mode", Messages.src.config.number_provider.schema.text0049),
    ],
  ],
  [
    "exponential",
    [
      number("min", Messages.src.config.number_provider.schema.text0050),
      number("max", Messages.src.config.number_provider.schema.text0051),
      number("mean", Messages.src.config.number_provider.schema.text0052),
      number("lambda", Messages.src.config.number_provider.schema.text0053),
      number(
        "max_attempts",
        Messages.src.config.number_provider.schema.text0054,
        { aliases: ["max-attempts"] },
      ),
    ],
  ],
  [
    "beta",
    [
      number("min", Messages.src.config.number_provider.schema.text0055),
      number("max", Messages.src.config.number_provider.schema.text0056),
      number("alpha", Messages.src.config.number_provider.schema.text0057),
      number("beta", Messages.src.config.number_provider.schema.text0058),
    ],
  ],
]);

export interface ResolvedNumberProviderType {
  readonly name: string;
  readonly external: boolean;
}

export function resolveNumberProviderType(
  value: string | undefined,
): ResolvedNumberProviderType | undefined {
  if (!value) return undefined;
  const local = localRegistryDiscriminator(value);
  if (
    local !== undefined &&
    (NUMBER_PROVIDER_TYPES as readonly string[]).includes(local)
  ) {
    return { name: local, external: false };
  }
  return {
    name: local ?? value,
    external: isValidRegistryDiscriminator(value),
  };
}

export function numberProviderFields(
  type: string | undefined,
): readonly SchemaField[] {
  const resolved = resolveNumberProviderType(type);
  if (resolved?.external) return [];
  if (resolved)
    return [
      NUMBER_PROVIDER_TYPE_FIELD,
      ...(NUMBER_PROVIDER_FIELDS.get(resolved.name as NumberProviderType) ??
        []),
    ];
  const merged = new Map<string, SchemaField>([
    [NUMBER_PROVIDER_TYPE_FIELD.semantic, NUMBER_PROVIDER_TYPE_FIELD],
  ]);
  for (const fields of NUMBER_PROVIDER_FIELDS.values()) {
    for (const candidate of fields)
      if (!merged.has(candidate.semantic))
        merged.set(candidate.semantic, candidate);
  }
  return [...merged.values()];
}

export function numberProviderAllowsNestedField(
  parentType: string | undefined,
  fieldName: string,
): boolean {
  const resolved = resolveNumberProviderType(parentType);
  if (!resolved || resolved.external) return false;
  const normalized = fieldName.replaceAll("-", "_");
  return (
    (resolved.name === "uniform" &&
      (normalized === "min" || normalized === "max")) ||
    (resolved.name === "binomial" &&
      (normalized === "extra" || normalized === "probability"))
  );
}

export function numberProviderConsumer(fieldValue: SchemaField): SchemaField {
  return { ...fieldValue, valueProvider: "number-provider" };
}

function javaDouble(value: string): boolean {
  // 这里按 Java 的数字写法读取, 只有读取具体数值时才删除下划线
  return /^[+-]?(?:(?:NaN|Infinity)|(?:(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|0[xX](?:[\da-fA-F]+(?:\.[\da-fA-F]*)?|\.[\da-fA-F]+)[pP][+-]?\d+)[fFdD]?))$/u.test(
    value.trim(),
  );
}

export function isNumberProviderScalar(value: unknown): boolean {
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  if (value.includes("~")) {
    const separator = value.indexOf("~");
    return (
      javaDouble(value.slice(0, separator)) &&
      javaDouble(value.slice(separator + 1))
    );
  }
  if (value.includes("<") && value.includes(">")) return true;
  return javaDouble(value);
}

export type NumberProviderValidationCode =
  | "invalid-value"
  | "missing-type"
  | "unknown-type"
  | "missing-field"
  | "conflicting-alias"
  | "invalid-number"
  | "invalid-weights"
  | "invalid-weight-result"
  | "unsafe-weight"
  | "invalid-range"
  | "invalid-positive"
  | "invalid-mode"
  | "invalid-skewness"
  | "invalid-max-attempts";

export interface NumberProviderValidationProblem {
  readonly code: NumberProviderValidationCode;
  readonly path: readonly string[];
  readonly severity: "error" | "warning";
  readonly message: string;
}

  // 表达式要等游戏运行时计算, 这里算不出来不要报错
function concreteConfigDouble(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const normalized = value.trim().replaceAll("_", "");
  return javaDouble(normalized) ? Number(normalized) : undefined;
}

export function validateNumberProviderValue(
  value: unknown,
): readonly NumberProviderValidationProblem[] {
  const problems: NumberProviderValidationProblem[] = [];
  const add = (
    code: NumberProviderValidationCode,
    path: readonly string[],
    severity: "error" | "warning",
    message: string,
  ): void => {
    problems.push({ code, path, severity, message });
  };

  const visit = (current: unknown, path: readonly string[]): void => {
    if (isNumberProviderScalar(current)) return;
    if (!isRecord(current)) {
      add(
        "invalid-value",
        path,
        "error",
        Messages.src.config.number_provider.schema.text0059,
      );
      return;
    }
    if (typeof current.type !== "string" || current.type.length === 0) {
      add(
        "missing-type",
        path,
        "error",
        Messages.src.config.number_provider.schema.text0060,
      );
      return;
    }
    const resolved = resolveNumberProviderType(current.type);
    if (resolved?.external) return;
    if (
      !resolved ||
      !(NUMBER_PROVIDER_TYPES as readonly string[]).includes(resolved.name)
    ) {
      add(
        "unknown-type",
        [...path, "type"],
        "error",
        Messages.src.config.number_provider.schema.text0061(current.type),
      );
      return;
    }

    const type = resolved.name as NumberProviderType;
    for (const schema of numberProviderFields(current.type).filter(
      (candidate) => candidate.label !== "type",
    )) {
      const present = [schema.label, ...schema.aliases].filter((name) =>
        Object.hasOwn(current, name),
      );
      const name = present[0];
      if (name === undefined) {
        if (schema.required)
          add(
            "missing-field",
            path,
            "error",
            Messages.src.config.number_provider.schema.text0062(
              type,
              schema.label,
            ),
          );
        continue;
      }
      for (const conflict of present.slice(1))
        add(
          "conflicting-alias",
          [...path, conflict],
          "warning",
          Messages.src.config.number_provider.schema.text0063(
            type,
            name,
            conflict,
          ),
        );

      const fieldValue = current[name];
      switch (schema.valueProvider) {
        case "number-provider":
          visit(fieldValue, [...path, name]);
          break;
        case "number":
          if (
            typeof fieldValue !== "number" &&
            typeof fieldValue !== "string" &&
            typeof fieldValue !== "boolean"
          )
            add(
              "invalid-number",
              [...path, name],
              "error",
              Messages.src.config.number_provider.schema.text0064(name),
            );
      }
    }

    if (
      type === "exponential" &&
      current.mean === undefined &&
      current.lambda === undefined
    ) {
      add(
        "missing-field",
        path,
        "error",
        Messages.src.config.number_provider.schema.text0065,
      );
    }

    switch (type) {
      case "weighted": {
        const weights = current.weights;
        if (weights === undefined) break;
        if (!isRecord(weights)) {
          add(
            "invalid-weights",
            [...path, "weights"],
            "error",
            Messages.src.config.number_provider.schema.text0066,
          );
          break;
        }

        const entries = Object.entries(weights);
        if (entries.length === 0) {
          add(
            "invalid-weights",
            [...path, "weights"],
            "error",
            Messages.src.config.number_provider.schema.text0067,
          );
          break;
        }

        let positive = false;
        for (const [result, weight] of entries) {
          if (!javaDouble(result))
            add(
              "invalid-weight-result",
              [...path, "weights", result],
              "error",
              Messages.src.config.number_provider.schema.text0068(result),
            );
          const parsedWeight = concreteConfigDouble(weight);
          if (parsedWeight !== undefined && parsedWeight > 0) positive = true;
          else if (parsedWeight !== undefined)
            add(
              "unsafe-weight",
              [...path, "weights", result],
              "warning",
              Messages.src.config.number_provider.schema.text0069(result),
            );
          else if (typeof weight !== "string")
            add(
              "invalid-number",
              [...path, "weights", result],
              "error",
              Messages.src.config.number_provider.schema.text0070(result),
            );
        }
        if (
          !positive &&
          entries.every(
            ([, weight]) => concreteConfigDouble(weight) !== undefined,
          )
        )
          add(
            "unsafe-weight",
            [...path, "weights"],
            "warning",
            Messages.src.config.number_provider.schema.text0071,
          );
        break;
      }
    }

    const min = concreteConfigDouble(current.min);
    const max = concreteConfigDouble(current.max);
    if (
      min !== undefined &&
      max !== undefined &&
      (type === "log_normal" ? Math.max(min, 1e-6) : min) >= max
    )
      add(
        "invalid-range",
        [...path, "min"],
        "error",
        Messages.src.config.number_provider.schema.text0072(type),
      );
    for (const name of [
      "std_dev",
      "std-dev",
      "scale",
      "lambda",
      "alpha",
      "beta",
    ] as const) {
      const parsed = concreteConfigDouble(current[name]);
      if (parsed !== undefined && parsed <= 0)
        add(
          "invalid-positive",
          [...path, name],
          "error",
          Messages.src.config.number_provider.schema.text0073(type, name),
        );
    }
    if (type === "exponential" && current.mean !== undefined) {
      const mean = concreteConfigDouble(current.mean);
      if (mean !== undefined && mean <= 0)
        add(
          "invalid-positive",
          [...path, "mean"],
          "error",
          Messages.src.config.number_provider.schema.text0074,
        );
    }
    const maxAttemptsName = Object.hasOwn(current, "max_attempts")
      ? "max_attempts"
      : Object.hasOwn(current, "max-attempts")
        ? "max-attempts"
        : undefined;
    if (maxAttemptsName) {
      const attempts = concreteConfigDouble(current[maxAttemptsName]);
      if (attempts !== undefined && Math.trunc(attempts) <= 0)
        add(
          "invalid-max-attempts",
          [...path, maxAttemptsName],
          "error",
          Messages.src.config.number_provider.schema.text0075(
            type,
            maxAttemptsName,
          ),
        );
    }
    switch (type) {
      case "triangle": {
        const mode = concreteConfigDouble(current.mode);
        if (mode !== undefined && min !== undefined && mode < min)
          add(
            "invalid-mode",
            [...path, "mode"],
            "error",
            Messages.src.config.number_provider.schema.text0076,
          );
        if (mode !== undefined && max !== undefined && mode > max)
          add(
            "invalid-mode",
            [...path, "mode"],
            "error",
            Messages.src.config.number_provider.schema.text0077,
          );
        break;
      }
      case "skew_normal": {
        const skewness = concreteConfigDouble(current.skewness);
        if (skewness !== undefined && Math.abs(skewness) > 0.995)
          add(
            "invalid-skewness",
            [...path, "skewness"],
            "error",
            Messages.src.config.number_provider.schema.text0078,
          );
      }
    }
  };

  visit(value, []);
  return problems;
}
