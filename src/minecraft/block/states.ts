import { makeIdentifier } from "../../util/identifiers.js";
import { Messages } from "../../messages.js";
import { isRecord, isUnknownArray } from "../../util/records.js";

export interface VanillaBlockStateSource {
  readonly id: string;
  readonly value: unknown;
}

export interface VanillaBlockStateReport {
  readonly properties?: Readonly<Record<string, readonly string[]>>;
  readonly default?: Readonly<Record<string, string>>;
  readonly stateCount?: number;
}

export interface ParsedVanillaBlockState {
  readonly id: string;
  readonly properties: ReadonlyMap<string, string>;
  readonly arrangerIndex?: number;
}

export interface VanillaBlockStateProblem {
  readonly code: string;
  readonly message: string;
}

function addProperty(
  properties: Map<string, Set<string>>,
  name: string,
  rawValue: unknown,
): void {
  if (typeof rawValue !== "string" || name === "") return;
  const values = properties.get(name) ?? new Set<string>();
  for (const value of rawValue.split("|")) if (value !== "") values.add(value);
  properties.set(name, values);
}

function collectConditionProperties(
  value: unknown,
  properties: Map<string, Set<string>>,
): void {
  if (isUnknownArray(value)) {
    for (const entry of value) collectConditionProperties(entry, properties);
    return;
  }
  if (!isRecord(value)) return;
  for (const [name, entry] of Object.entries(value)) {
    if (name === "OR" || name === "AND")
      collectConditionProperties(entry, properties);
    else addProperty(properties, name, entry);
  }
}

function collectVariantProperties(
  key: string,
  properties: Map<string, Set<string>>,
): void {
  if (key === "") return;
  for (const assignment of key.split(",")) {
    const separator = assignment.indexOf("=");
    if (separator <= 0) continue;
    addProperty(
      properties,
      assignment.slice(0, separator),
      assignment.slice(separator + 1),
    );
  }
}

export class VanillaBlockStateCatalog {
  private readonly byId: ReadonlyMap<
    string,
    ReadonlyMap<string, readonly string[]>
  >;
  private readonly defaultsById: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  >;
  private readonly stateCountsById: ReadonlyMap<string, number>;

  public constructor(
    sources:
      | readonly VanillaBlockStateSource[]
      | Readonly<Record<string, VanillaBlockStateReport>>,
  ) {
    const definitions = new Map<
      string,
      ReadonlyMap<string, readonly string[]>
    >();
    const defaults = new Map<string, Readonly<Record<string, string>>>();
    const stateCounts = new Map<string, number>();
    if (isUnknownArray(sources)) {
      for (const source of sources) {
        if (
          !isRecord(source) ||
          typeof source.id !== "string" ||
          !isRecord(source.value)
        )
          continue;
        const properties = new Map<string, Set<string>>();
        if (isRecord(source.value.variants)) {
          for (const key of Object.keys(source.value.variants))
            collectVariantProperties(key, properties);
        }
        if (isUnknownArray(source.value.multipart)) {
          for (const entry of source.value.multipart) {
            if (isRecord(entry) && entry.when !== undefined)
              collectConditionProperties(entry.when, properties);
          }
        }
        definitions.set(
          makeIdentifier(source.id, "minecraft"),
          new Map(
            [...properties].map(
              ([name, values]) => [name, [...values].sort()] as const,
            ),
          ),
        );
      }
    } else {
      for (const [rawId, source] of Object.entries(sources)) {
        const id = makeIdentifier(rawId, "minecraft");
        const properties = new Map<string, readonly string[]>();
        if (isRecord(source.properties)) {
          for (const [name, rawValues] of Object.entries(source.properties)) {
            const values = isUnknownArray(rawValues)
              ? rawValues.filter(
                  (value): value is string => typeof value === "string",
                )
              : [];
            properties.set(name, values);
          }
        }
        definitions.set(id, properties);
        if (isRecord(source.default)) {
          defaults.set(
            id,
            Object.fromEntries(
              Object.entries(source.default).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
          );
        }
        if (
          typeof source.stateCount === "number" &&
          Number.isInteger(source.stateCount)
        ) {
          stateCounts.set(id, source.stateCount);
        }
      }
    }
    this.byId = definitions;
    this.defaultsById = defaults;
    this.stateCountsById = stateCounts;
  }

  public properties(
    blockId: string,
  ): ReadonlyMap<string, readonly string[]> | undefined {
    return this.byId.get(makeIdentifier(blockId, "minecraft"));
  }

  public defaultProperties(blockId: string): Readonly<Record<string, string>> {
    return this.defaultsById.get(makeIdentifier(blockId, "minecraft")) ?? {};
  }

  public stateCount(blockId: string): number | undefined {
    return this.stateCountsById.get(makeIdentifier(blockId, "minecraft"));
  }

  public defaultState(blockId: string): string {
    const id = makeIdentifier(blockId, "minecraft");
    const properties = this.defaultProperties(id);
    const entries = Object.entries(properties);
    return entries.length === 0
      ? id
      : `${id}[${entries.map(([name, value]) => `${name}=${value}`).join(",")}]`;
  }
}

export function parseVanillaBlockState(
  value: string,
): ParsedVanillaBlockState | undefined {
  const text = value.trim().toLowerCase();
  if (text === "") return undefined;
  const arranger =
    /^(?:(?<namespace>[a-z0-9_.-]+):)?(?<block>[a-z0-9_.\-/]+):(?<index>-?\d+)$/u.exec(
      text,
    );
  if (arranger?.groups?.block && arranger.groups.index !== undefined) {
    return {
      id: makeIdentifier(
        `${arranger.groups.namespace ? `${arranger.groups.namespace}:` : ""}${arranger.groups.block}`,
        "minecraft",
      ),
      properties: new Map(),
      arrangerIndex: Number(arranger.groups.index),
    };
  }
  const match =
    /^(?<id>(?:[a-z0-9_.-]+:)?[a-z0-9_.\-/]+)(?:\[(?<properties>[^\]]*)\])?$/u.exec(
      text,
    );
  if (!match?.groups?.id) return undefined;
  const properties = new Map<string, string>();
  const body = match.groups.properties;
  if (body !== undefined && body !== "") {
    for (const assignment of body.split(",")) {
      const separator = assignment.indexOf("=");
      if (separator <= 0 || separator === assignment.length - 1)
        return undefined;
      const name = assignment.slice(0, separator).trim();
      const propertyValue = assignment.slice(separator + 1).trim();
      if (!name || !propertyValue || properties.has(name)) return undefined;
      properties.set(name, propertyValue);
    }
  }
  return { id: makeIdentifier(match.groups.id, "minecraft"), properties };
}

export function validateVanillaBlockState(
  value: string,
  blocks: ReadonlySet<string>,
  catalog?: VanillaBlockStateCatalog,
): readonly VanillaBlockStateProblem[] {
  const parsed = parseVanillaBlockState(value);
  if (!parsed)
    return [
      {
        code: "invalid-vanilla-block-state",
        message: Messages.src.minecraft.block.states.text0001(value),
      },
    ];
  if (!blocks.has(parsed.id)) {
    return [
      {
        code: "unknown-vanilla-block",
        message: Messages.src.minecraft.block.states.text0002(parsed.id),
      },
    ];
  }
  if (parsed.arrangerIndex !== undefined) {
    return parsed.arrangerIndex < 0
      ? [
          {
            code: "invalid-block-state-arranger-index",
            message: Messages.src.minecraft.block.states.text0003,
          },
        ]
      : [];
  }
  const known = catalog?.properties(parsed.id);
  if (!known) return [];
  const problems: VanillaBlockStateProblem[] = [];
  for (const [name, propertyValue] of parsed.properties) {
    const values = known.get(name);
    if (!values) {
      problems.push({
        code: "unknown-vanilla-block-property",
        message: Messages.src.minecraft.block.states.text0004(parsed.id, name),
      });
      continue;
    }
    if (!values.includes(propertyValue)) {
      problems.push({
        code: "invalid-vanilla-block-property-value",
        message: Messages.src.minecraft.block.states.text0005(
          parsed.id,
          name,
          propertyValue,
          values.join("、"),
        ),
      });
    }
  }
  return problems;
}
