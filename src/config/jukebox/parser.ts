import type { CoreIssue } from "../../diagnostics/model.js";
import { Messages } from "../../messages.js";
import { groupBy } from "../../util/collections.js";
import {
  isValidIdentifier,
  makeIdentifier,
  splitIdentifier,
} from "../../util/identifiers.js";
import { canonicalPath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import type { ConfigurationCandidateInput } from "../model.js";
import type { JukeboxSongBuildResult, JukeboxSongDefinition } from "./model.js";
import { evaluateExpression } from "../expression/evaluator.js";

  // CE 的 getFloat/getAsInt: 字符串可以先删下划线再解析, 失败后按表达式求值
function configNumber(value: unknown): number | undefined {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const literal = Number(value.trim().replaceAll("_", ""));
  if (!Number.isNaN(literal)) return literal;
  try {
    const evaluated = evaluateExpression(value);
    return typeof evaluated === "number" && Number.isFinite(evaluated)
      ? evaluated
      : undefined;
  } catch {
    return undefined;
  }
}

function fieldRange(
  candidate: ConfigurationCandidateInput,
  fieldName: string,
): CoreIssue["range"] {
  return (
    candidate.source.fieldValueRanges.get(fieldName) ??
    candidate.source.fieldKeyRanges.get(fieldName) ??
    candidate.source.idRange
  );
}

function parseSong(
  candidate: ConfigurationCandidateInput,
  issues: CoreIssue[],
): JukeboxSongDefinition | undefined {
  if (candidate.kind !== "jukebox-song" || !isRecord(candidate.value))
    return undefined;
  const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);

  const sound =
    typeof candidate.value.sound === "string"
      ? makeIdentifier(candidate.value.sound.toLowerCase(), "minecraft")
      : undefined;
  const rawLength = candidate.value.length;
  const length = configNumber(rawLength);
  // CE: range 默认 32, comparator_output 默认 15
  const rawRange = candidate.value.range;
  const range = rawRange === undefined ? 32 : configNumber(rawRange);
  const rawComparator =
    candidate.value.comparator_output ?? candidate.value["comparator-output"];
  const comparatorOutput =
    rawComparator === undefined ? 15 : configNumber(rawComparator);

  if (!sound || !isValidIdentifier(sound)) {
    issues.push({
      code: "invalid-jukebox-song-sound",
      message: Messages.src.config.jukebox.parser.text0002,
      severity: "error",
      uri: candidate.source.uri,
      range: fieldRange(candidate, "sound"),
    });
  }
  if (length === undefined) {
    issues.push({
      code: "invalid-jukebox-song-length",
      message: Messages.src.config.jukebox.parser.text0003,
      severity: "error",
      uri: candidate.source.uri,
      range: fieldRange(candidate, "length"),
    });
  }
  if (range === undefined) {
    issues.push({
      code: "invalid-jukebox-song-range",
      message: `唱片机曲目 ${id} 的 range 必须是数字或 CraftEngine 表达式`,
      severity: "error",
      uri: candidate.source.uri,
      range: fieldRange(candidate, "range"),
    });
  }
  if (comparatorOutput === undefined) {
    issues.push({
      code: "invalid-jukebox-song-comparator-output",
      message: `唱片机曲目 ${id} 的 comparator_output 必须是整数或 CraftEngine 表达式`,
      severity: "error",
      uri: candidate.source.uri,
      range: fieldRange(
        candidate,
        Object.hasOwn(candidate.value, "comparator_output")
          ? "comparator_output"
          : "comparator-output",
      ),
    });
  }
  if (
    !sound ||
    !isValidIdentifier(sound) ||
    length === undefined ||
    range === undefined ||
    comparatorOutput === undefined
  )
    return undefined;

  const [namespace, value] = splitIdentifier(
    id,
    candidate.source.pack.namespace,
  );
  return {
    id,
    namespace,
    value,
    source: candidate.source,
    sound,
    description:
      typeof candidate.value.description === "string"
        ? candidate.value.description
        : "",
    length,
    range,
    comparatorOutput: Math.trunc(comparatorOutput),
  };
}

function conflictIssues(songs: readonly JukeboxSongDefinition[]): CoreIssue[] {
  const groups = groupBy(
    songs.filter((song) => song.source.pack.active),
    (song) =>
      `${canonicalPath(song.source.pack.resourcesRoot)}\u0000${song.id}`,
  );
  const issues: CoreIssue[] = [];
  for (const values of groups.values()) {
    if (values.length < 2) continue;
    for (const song of values) {
      issues.push({
        code: "duplicate-jukebox-song-id",
        message: Messages.src.config.jukebox.parser.text0004(song.id),
        severity: "error",
        uri: song.source.uri,
        range: song.source.idRange,
        related: values
          .filter((other) => other !== song)
          .map((other) => ({
            message: Messages.src.config.jukebox.parser.text0005(
              other.source.pack.name,
              other.source.pack.active,
            ),
            uri: other.source.uri,
            range: other.source.idRange,
          })),
      });
    }
  }
  return issues;
}

export function buildJukeboxSongIndex(
  configurations: readonly ConfigurationCandidateInput[],
  inheritedIssues: readonly CoreIssue[],
  includeInactiveDiagnostics: boolean,
): JukeboxSongBuildResult {
  const issues = [...inheritedIssues];
  const songs = configurations
    .map((candidate) => parseSong(candidate, issues))
    .filter((song): song is JukeboxSongDefinition => song !== undefined);
  issues.push(...conflictIssues(songs));

  const activeUris = new Set(
    configurations
      .filter((entry) => entry.source.pack.active)
      .map((entry) => entry.source.uri),
  );

  return {
    songs,
    issues: issues.filter(
      (entry) => includeInactiveDiagnostics || activeUris.has(entry.uri),
    ),
  };
}
