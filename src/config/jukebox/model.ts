import type { CoreIssue } from "../../diagnostics/model.js";
import type { ConfigurationSource } from "../model.js";

export interface JukeboxSongBuildResult {
  readonly songs: readonly JukeboxSongDefinition[];
  readonly issues: readonly CoreIssue[];
}

export interface JukeboxSongDefinition {
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly sound: string;
  readonly description: string;
  readonly length: number;
  // CE: JukeboxSong(range, comparatorOutput), 默认 32/15
  readonly range: number;
  readonly comparatorOutput: number;
}
