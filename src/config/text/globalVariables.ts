import type { PackSource, ParsedYamlFile } from "../model.js";
import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import { makeIdentifier, splitIdentifier } from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord, isUnknownArray } from "../../util/records.js";
import { expandTemplateIdValueSections } from "../template/expander.js";

export interface ParsedGlobalVariableFile {
  readonly parsed: ParsedYamlFile;
  readonly pack: PackSource;
}

export interface GlobalVariableSource {
  readonly uri: string;
  readonly idRange: TextRange;
  readonly valueRange: TextRange;
  readonly pack: PackSource;
  readonly section: string;
}

export interface GlobalVariableDefinition {
  readonly id: string;
  readonly rawId: string;
  readonly namespace: string;
  readonly valueId: string;
  readonly value: string;
  readonly source: GlobalVariableSource;
}

export interface GlobalVariableResolution {
  readonly selected?: GlobalVariableDefinition;
  readonly candidates: readonly GlobalVariableDefinition[];
}

function javaString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  if (isUnknownArray(value))
    return `[${value.map((entry) => javaString(entry) ?? "null").join(", ")}]`;
  if (isRecord(value))
    return `{${Object.entries(value)
      .map(([key, entry]) => `${key}=${javaString(entry) ?? "null"}`)
      .join(", ")}}`;
  return undefined;
}

export class RootGlobalVariableCatalog {
  public constructor(
    public readonly definitions: readonly GlobalVariableDefinition[],
  ) {}

  public resolve(valueId: string): GlobalVariableResolution {
    const seenFullIds = new Set<string>();
    const candidates = this.definitions.filter((entry) => {
      if (
        entry.valueId !== valueId ||
        !entry.source.pack.active ||
        seenFullIds.has(entry.id)
      )
        return false;
      seenFullIds.add(entry.id);
      return true;
    });
    const selected = candidates.at(-1);
    return selected ? { selected, candidates } : { candidates };
  }
}

export class GlobalVariableCatalog {
  public readonly definitions: readonly GlobalVariableDefinition[];

  public constructor(
    definitions: readonly GlobalVariableDefinition[],
    public readonly issues: readonly CoreIssue[] = [],
  ) {
    this.definitions = definitions;
  }

  public forRoot(resourcesRoot?: string): RootGlobalVariableCatalog {
    if (resourcesRoot === undefined)
      return new RootGlobalVariableCatalog(this.definitions);
    const root = canonicalPath(resourcesRoot);
    return new RootGlobalVariableCatalog(
      this.definitions.filter(
        (entry) => canonicalPath(entry.source.pack.resourcesRoot) === root,
      ),
    );
  }
}

export function buildGlobalVariableCatalog(
  files: readonly ParsedGlobalVariableFile[],
): GlobalVariableCatalog {
  const expanded = expandTemplateIdValueSections(files, "global-variables");
  return new GlobalVariableCatalog(
    expanded.entries.flatMap((entry): GlobalVariableDefinition[] => {
      const value = javaString(entry.value);
      if (value === undefined) return [];
      const id = makeIdentifier(entry.rawId, entry.source.pack.namespace);
      const [namespace, valueId] = splitIdentifier(
        id,
        entry.source.pack.namespace,
      );
      return [
        {
          id,
          rawId: entry.rawId,
          namespace,
          valueId,
          value,
          source: {
            uri: entry.source.uri,
            idRange: entry.source.idRange,
            valueRange: entry.source.entryRange,
            pack: entry.source.pack,
            section: entry.source.sectionKey,
          },
        },
      ];
    }),
    expanded.issues,
  );
}
