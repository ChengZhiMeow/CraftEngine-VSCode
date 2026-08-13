import type { VanillaSoundCatalog } from "../minecraft/catalog.js";
import type {
  SoundEventDefinition,
  SoundEventEntry,
} from "../config/sound/model.js";
import { makeIdentifier } from "../util/identifiers.js";
import { samePath } from "../util/paths.js";

export interface ResolvedSoundEntry extends Omit<SoundEventEntry, "nameRange"> {
  readonly eventId: string;
  readonly source: "workspace" | "vanilla";
  readonly definition?: SoundEventDefinition;
}

export type SoundEventSource = "workspace" | "vanilla" | "unknown";

export function soundEventSource(
  events: readonly SoundEventDefinition[],
  vanilla: VanillaSoundCatalog,
  resourcesRoot: string,
  eventId: string,
): SoundEventSource {
  const id = makeIdentifier(eventId, "minecraft");
  if (
    events.some(
      (event) =>
        event.id === id &&
        event.source.pack.active &&
        samePath(event.source.pack.resourcesRoot, resourcesRoot),
    )
  )
    return "workspace";
  return vanilla.isVanillaEvent(id) ? "vanilla" : "unknown";
}

export function resolveSoundEvent(
  events: readonly SoundEventDefinition[],
  vanilla: VanillaSoundCatalog,
  resourcesRoot: string,
  eventId: string,
): readonly ResolvedSoundEntry[] {
  const id = makeIdentifier(eventId, "minecraft");
  let result = (vanilla.events.get(id)?.entries ?? []).map(
    (entry): ResolvedSoundEntry => ({
      ...entry,
      eventId: id,
      source: "vanilla",
    }),
  );
  for (const definition of events
    .filter(
      (event) =>
        event.id === id &&
        event.source.pack.active &&
        samePath(event.source.pack.resourcesRoot, resourcesRoot),
    )
    .sort(
      (left, right) => right.source.pack.loadOrder - left.source.pack.loadOrder,
    )) {
    if (definition.replace) result = [];
    result.push(
      ...definition.entries.map((entry) => ({
        name: entry.name,
        type: entry.type,
        volume: entry.volume,
        pitch: entry.pitch,
        weight: entry.weight,
        stream: entry.stream,
        attenuationDistance: entry.attenuationDistance,
        preload: entry.preload,
        eventId: definition.id,
        source: "workspace" as const,
        definition,
      })),
    );
  }
  return result;
}
