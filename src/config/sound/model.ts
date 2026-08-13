import type { CoreIssue, TextRange } from "../../diagnostics/model.js";
import type { ConfigurationSource } from "../model.js";

export interface SoundIndexResult {
  readonly events: readonly SoundEventDefinition[];
  readonly references: readonly SoundDataReference[];
  readonly issues: readonly CoreIssue[];
}

export interface SoundEventEntry {
  readonly name: string;
  readonly type: "file" | "event";
  readonly volume: unknown;
  readonly pitch: unknown;
  readonly weight: number;
  readonly stream: boolean;
  readonly attenuationDistance: number;
  readonly preload: boolean;
  readonly nameRange: TextRange;
}

export interface SoundEventDefinition {
  readonly kind: "sound-event";
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly source: ConfigurationSource;
  readonly origin: "craftengine-yaml" | "resourcepack-json";
  readonly replace: boolean;
  readonly subtitle?: string;
  readonly subtitleText?: string;
  readonly entries: readonly SoundEventEntry[];
}

export interface SoundDataReference {
  readonly eventId: string;
  readonly path: string;
  readonly volume: unknown;
  readonly pitch: unknown;
  readonly source: ConfigurationSource;
  readonly range: TextRange;
  readonly idRange: TextRange;
  readonly volumeRange: TextRange;
  readonly pitchRange: TextRange;
}
