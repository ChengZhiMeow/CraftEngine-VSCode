import type { CoreIssue } from "../../diagnostics/model.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import type {
  ConfigurationCandidateInput,
  ConfigurationSource,
  ResourceKind,
} from "../model.js";
import type {
  GenericResourceDefinition,
  GenericResourceKind,
} from "./model.js";

import { Messages } from "../../messages.js";
export const GENERIC_RESOURCE_KINDS: readonly GenericResourceKind[] = [
  "recipe",
  "category",
  "emoji",
  "painting",
  "configured-feature",
  "placed-feature",
  "advancement",
];

const KIND_LABELS: Readonly<Record<GenericResourceKind, string>> = {
  recipe: Messages.src.config.resource.parser.text0001,
  category: Messages.src.config.resource.parser.text0002,
  emoji: Messages.src.config.resource.parser.text0003,
  painting: Messages.src.config.resource.parser.text0004,
  "configured-feature": Messages.src.references.crossDomain.text0016,
  "placed-feature": Messages.src.references.crossDomain.text0017,
  advancement: Messages.src.config.resource.parser.text0005,
};

export interface GenericResourceBuildResult {
  readonly resources: readonly GenericResourceDefinition[];
  readonly issues: readonly CoreIssue[];
}

export function isGenericResourceKind(
  kind: ResourceKind,
): kind is GenericResourceKind {
  return (GENERIC_RESOURCE_KINDS as readonly ResourceKind[]).includes(kind);
}

function issue(
  source: ConfigurationSource,
  code: string,
  message: string,
  severity: CoreIssue["severity"],
  field?: string,
  key = false,
  related?: CoreIssue["related"],
): CoreIssue {
  return {
    code,
    message,
    severity,
    uri: source.uri,
    range: !field
      ? source.idRange
      : ((key ? source.fieldKeyRanges : source.fieldValueRanges).get(field) ??
        source.fieldKeyRanges.get(field) ??
        source.idRange),
    ...(related === undefined ? {} : { related }),
  };
}

export function buildGenericResourceIndex(
  configurations: readonly ConfigurationCandidateInput[],
  includeInactiveDiagnostics: boolean,
): GenericResourceBuildResult {
  const issues: CoreIssue[] = [];
  const resources = configurations.flatMap((candidate) => {
    if (!isGenericResourceKind(candidate.kind)) return [];
    if (!isRecord(candidate.value)) {
      issues.push(
        issue(
          candidate.source,
          `invalid-${candidate.kind}-entry`,
          Messages.src.config.resource.parser.text0006(
            KIND_LABELS[candidate.kind],
            candidate.rawId,
          ),
          "error",
        ),
      );
      return [];
    }

    const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);
    if (!isValidIdentifier(id)) {
      issues.push(
        issue(
          candidate.source,
          `invalid-${candidate.kind}-id`,
          Messages.src.config.resource.parser.text0007(
            KIND_LABELS[candidate.kind],
            id,
          ),
          "error",
        ),
      );
      return [];
    }

    if (candidate.kind === "advancement") {
      const ignoredField = Object.keys(candidate.value).find(
        (field) => field !== "enable" && field !== "debug",
      );
      issues.push(
        issue(
          candidate.source,
          "advancement-parser-no-op",
          ignoredField === undefined
            ? Messages.src.config.resource.parser.text0008
            : Messages.src.config.resource.parser.text0009(ignoredField),
          "information",
          ignoredField,
          ignoredField !== undefined,
        ),
      );
    }

    const [namespace, value] = splitIdentifier(
      id,
      candidate.source.pack.namespace,
    );
    return [
      {
        kind: candidate.kind,
        id,
        namespace,
        value,
        source: candidate.source,
        raw: candidate.value,
      },
    ];
  });

  for (const values of groupBy(
    resources.filter((resource) => resource.source.pack.active),
    (resource) =>
      `${canonicalPath(resource.source.pack.resourcesRoot)}\u0000${resource.kind}\u0000${resource.id}`,
  ).values()) {
    if (values.length < 2) continue;
    for (const resource of values)
      issues.push(
        issue(
          resource.source,
          `duplicate-${resource.kind}-id`,
          Messages.src.config.resource.parser.text0010(
            KIND_LABELS[resource.kind],
            resource.id,
          ),
          "error",
          undefined,
          false,
          values
            .filter((other) => other !== resource)
            .map((other) => ({
              message: Messages.src.config.resource.parser.text0011(
                other.source.pack.name,
                other.source.pack.active
                  ? Messages.common.active
                  : Messages.common.inactive,
                other.source.kind === "factory"
                  ? Messages.common.sourceKinds.factory
                  : other.source.kind === "template"
                    ? Messages.common.sourceKinds.template
                    : Messages.common.sourceKinds.direct,
              ),
              uri: other.source.uri,
              range: other.source.idRange,
            })),
        ),
      );
  }

  const activeUris = new Set(
    configurations
      .filter((candidate) => candidate.source.pack.active)
      .map((candidate) => candidate.source.uri),
  );
  return {
    resources,
    issues: issues.filter(
      (entry) => includeInactiveDiagnostics || activeUris.has(entry.uri),
    ),
  };
}
