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

function parseSong(
  candidate: ConfigurationCandidateInput,
  issues: CoreIssue[],
): JukeboxSongDefinition | undefined {
  if (candidate.kind !== "jukebox-song" || !isRecord(candidate.value))
    return undefined;
  const id = makeIdentifier(candidate.rawId, candidate.source.pack.namespace);
  if (!isValidIdentifier(id)) {
    issues.push({
      code: "invalid-jukebox-song-id",
      message: Messages.src.config.jukebox.parser.text0001(id),
      severity: "error",
      uri: candidate.source.uri,
      range: candidate.source.idRange,
    });
    return undefined;
  }

  // 声音名称要先转小写, 再补 minecraft 命名空间
  const sound =
    typeof candidate.value.sound === "string"
      ? makeIdentifier(candidate.value.sound.toLowerCase(), "minecraft")
      : undefined;
  const rawLength = candidate.value.length;
  let length: number | undefined;
  if (typeof rawLength === "number" && Number.isFinite(rawLength)) {
    length = rawLength;
  } else if (
    typeof rawLength === "string" &&
    rawLength.trim() !== "" &&
    Number.isFinite(Number(rawLength))
  ) {
    length = Number(rawLength);
  }

  if (!sound || !isValidIdentifier(sound)) {
    issues.push({
      code: "invalid-jukebox-song-sound",
      message: Messages.src.config.jukebox.parser.text0002,
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldValueRanges.get("sound") ??
        candidate.source.fieldKeyRanges.get("sound") ??
        candidate.source.idRange,
    });
  }
  if (length === undefined) {
    issues.push({
      code: "invalid-jukebox-song-length",
      message: Messages.src.config.jukebox.parser.text0003,
      severity: "error",
      uri: candidate.source.uri,
      range:
        candidate.source.fieldValueRanges.get("length") ??
        candidate.source.fieldKeyRanges.get("length") ??
        candidate.source.idRange,
    });
  }
  if (!sound || !isValidIdentifier(sound) || length === undefined)
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
