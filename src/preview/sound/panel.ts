import { readFile } from "node:fs/promises";
import * as vscode from "vscode";

import type {
  SoundDataReference,
  SoundEventDefinition,
} from "../../config/sound/model.js";
import { sampleSoundNumber } from "../../config/sound/numbers.js";
import { cacheVanillaSoundFiles } from "../../minecraft/sound/cache.js";
import { resourceCandidates } from "../../resources/catalog.js";
import {
  resolveSoundEvent,
  soundEventSource,
  type ResolvedSoundEntry,
} from "../../sound/resolve.js";
import { makeIdentifier } from "../../util/identifiers.js";
import { samePath } from "../../util/paths.js";
import { isRecord } from "../../util/records.js";
import type { CraftEngineWorkspaceIndex } from "../../workspace/index.js";
import { editorPreviewFooter } from "../shared/footer.js";
import { escapeHtml, nonce } from "../shared/html.js";
import { hasPreviewSource } from "../shared/source.js";
import {
  MinecraftDownloadCancelled,
  type MinecraftDownloadProgress,
  type VanillaAssetStore,
} from "../../minecraft/assets/store.js";

import { Messages } from "../../messages.js";
export interface SoundPreviewArgument {
  readonly eventId?: string;
  readonly uri?: string;
  readonly offset?: number;
}

export interface SoundPreviewStatus {
  readonly open: boolean;
  readonly ready: boolean;
  readonly decoded: boolean;
  readonly started: boolean;
  readonly playing: boolean;
  readonly eventId?: string;
  readonly availableEvents?: readonly {
    readonly label: string;
    readonly eventId: string;
  }[];
  readonly selectedEventIndex?: number;
  readonly concreteFiles?: readonly {
    readonly id: string;
    readonly source: "workspace" | "vanilla";
    readonly cached: boolean;
  }[];
  readonly fileId?: string;
  readonly audioContextState?: string;
  readonly error?: string;
  readonly phase:
    | "closed"
    | "opening"
    | "ready"
    | "resolving"
    | "posted"
    | "loading"
    | "decoded"
    | "ended"
    | "error";
}

interface SoundTarget {
  readonly eventId: string;
  readonly label: string;
  readonly resourcesRoot: string;
  readonly volume: unknown;
  readonly pitch: unknown;
  readonly sourceLabel: string;
  readonly source?: string;
  readonly sourceOffset?: number;
  readonly sourcePath?: string;
}

interface SoundTargetContext {
  readonly targets: readonly SoundTarget[];
  readonly selectedIndex: number;
}

interface SoundLayer {
  readonly eventId: string;
  readonly volume: unknown;
  readonly pitch: unknown;
}

interface ConcreteSound {
  readonly id: string;
  readonly weight: number;
  readonly layers: readonly SoundLayer[];
  readonly source: "workspace" | "vanilla";
}

function displayValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  try {
    return JSON.stringify(value) ?? "1";
  } catch {
    return "1";
  }
}

const SOUND_ROLE_NAMES: Readonly<Record<string, string>> = {
  ambient: Messages.src.preview.sound.panel.text0001,
  attack: Messages.src.preview.sound.panel.text0002,
  break: Messages.src.preview.sound.panel.text0003,
  cast: Messages.src.preview.sound.panel.text0004,
  click: Messages.src.preview.sound.panel.text0005,
  close: Messages.src.preview.sound.panel.text0006,
  death: Messages.src.preview.sound.panel.text0007,
  equip: Messages.src.preview.sound.panel.text0008,
  fail: Messages.src.preview.sound.panel.text0009,
  fall: Messages.src.preview.sound.panel.text0010,
  hit: Messages.src.preview.sound.panel.text0011,
  hit_block: Messages.src.preview.sound.panel.text0012,
  hit_entity: Messages.src.preview.sound.panel.text0013,
  hurt: Messages.src.preview.sound.panel.text0014,
  loop: Messages.src.preview.sound.panel.text0015,
  open: Messages.src.preview.sound.panel.text0016,
  place: Messages.src.preview.sound.panel.text0017,
  shoot: Messages.src.preview.sound.panel.text0018,
  put: Messages.src.preview.sound.panel.text0019,
  sound: Messages.src.preview.sound.panel.text0020,
  start: Messages.src.preview.sound.panel.text0021,
  step: Messages.src.preview.sound.panel.text0022,
  stop: Messages.src.preview.sound.panel.text0023,
  success: Messages.src.preview.sound.panel.text0024,
  take: Messages.src.preview.sound.panel.text0025,
  throw: Messages.src.preview.sound.panel.text0026,
  unequip: Messages.src.preview.sound.panel.text0027,
  use: Messages.src.preview.sound.panel.text0028,
};

function soundRole(pathName: string): string {
  const key =
    pathName
      .split(".")
      .filter((entry) => !/^\d+$/u.test(entry))
      .at(-1) ?? "sound";
  return (
    SOUND_ROLE_NAMES[
      key
        .toLowerCase()
        .replaceAll("-", "_")
        .replace(/^sound_/u, "")
        .replace(/_sound$/u, "")
    ] ?? key
  );
}

function weighted(
  entries: readonly ResolvedSoundEntry[],
): ResolvedSoundEntry | undefined {
  if (entries.length === 0) return undefined;
  const total = entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.weight),
    0,
  );
  if (total <= 0) return entries[0];
  let selected = Math.random() * total;
  for (const entry of entries) {
    selected -= Math.max(0, entry.weight);
    if (selected <= 0) return entry;
  }
  return entries.at(-1);
}

export class CraftEngineSoundPreviewPanel implements vscode.Disposable {
  public static readonly viewType = "craftengineYaml.soundPreview";
  private panel: vscode.WebviewPanel | undefined;
  private target: SoundTarget | undefined;
  private targets: readonly SoundTarget[] = [];
  private selectedTargetIndex = 0;
  private ready = false;
  private decoded = false;
  private started = false;
  private playing = false;
  private fileId: string | undefined;
  private audioContextState: string | undefined;
  private error: string | undefined;
  private phase: SoundPreviewStatus["phase"] = "closed";

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly manager: CraftEngineWorkspaceIndex,
    private readonly assets: VanillaAssetStore,
    private readonly extensionVersion: string = Messages.src.preview.sound.panel
      .text0029,
  ) {}

  public async show(argument: SoundPreviewArgument = {}): Promise<void> {
    const context = this.resolveTargetContext(argument);
    if (!context) {
      await vscode.window.showWarningMessage(
        Messages.src.preview.sound.panel.text0030,
      );
      return;
    }
    this.targets = context.targets;
    this.selectedTargetIndex = context.selectedIndex;
    const target = context.targets[context.selectedIndex]!;
    this.resetTarget(target);

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        CraftEngineSoundPreviewPanel.viewType,
        Messages.src.preview.sound.panel.text0031,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this.extensionUri],
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.ready = false;
        this.playing = false;
        this.phase = "closed";
      });
      this.panel.webview.onDidReceiveMessage(
        (message: unknown) => void this.receive(message),
      );
    }
    this.panel.title = Messages.src.preview.sound.panel.text0032(
      target.eventId,
    );
    this.panel.webview.html = this.html(this.panel.webview, target);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
    await this.prefetchVanillaFiles(target);
  }

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  public status(): SoundPreviewStatus {
    const target = this.target;
    const concreteFiles =
      target === undefined
        ? []
        : this.concrete(target.eventId, target.resourcesRoot).map(
            (entry) => {
              const workspace = this.workspaceSoundFile(target, entry.id);
              const source: "workspace" | "vanilla" =
                workspace || entry.source === "workspace"
                  ? "workspace"
                  : "vanilla";
              return {
                id: entry.id,
                source,
                cached:
                  source === "workspace" ||
                  this.assets.cachedSound(entry.id) !== undefined,
              };
            },
          );
    return {
      open: this.panel !== undefined,
      ready: this.ready,
      decoded: this.decoded,
      started: this.started,
      playing: this.playing,
      ...(this.target === undefined ? {} : { eventId: this.target.eventId }),
      ...(this.targets.length === 0
        ? {}
        : {
            availableEvents: this.targets.map((target) => ({
              label: target.label,
              eventId: target.eventId,
            })),
            selectedEventIndex: this.selectedTargetIndex,
          }),
      ...(concreteFiles.length === 0 ? {} : { concreteFiles }),
      ...(this.fileId === undefined ? {} : { fileId: this.fileId }),
      ...(this.audioContextState === undefined
        ? {}
        : { audioContextState: this.audioContextState }),
      ...(this.error === undefined ? {} : { error: this.error }),
      phase: this.phase,
    };
  }

  public hasSource(source: string): boolean {
    if (!this.panel) return false;
    return hasPreviewSource(
      this.targets.map((target) => target.source),
      source,
    );
  }

  public async refresh(source: string): Promise<void> {
    if (!this.panel || !this.hasSource(source)) return;
    const previous = this.targets[this.selectedTargetIndex] ?? this.target;
    if (!previous) return;
    const context = this.refreshTargetContext(previous);
    if (!context) return;

    this.targets = context.targets;
    this.selectedTargetIndex = context.selectedIndex;
    const target = context.targets[context.selectedIndex];
    if (!target) return;
    this.resetTarget(target);
    this.panel.title = Messages.src.preview.sound.panel.text0032(
      target.eventId,
    );
    this.panel.webview.html = this.html(this.panel.webview, target);
    await this.prefetchVanillaFiles(target);
  }

  public async play(): Promise<void> {
    await this.receive({ type: "play" });
  }

  public async playFile(index: number): Promise<void> {
    await this.receive({ type: "play-file", index });
  }

  public async selectTarget(index: number): Promise<void> {
    await this.receive({ type: "select-target", index });
  }

  private resolveTargetContext(
    argument: SoundPreviewArgument,
  ): SoundTargetContext | undefined {
    const { uri, offset, eventId } = argument;
    if (uri !== undefined && offset !== undefined) {
      const direct = this.targetContextAt(uri, offset);
      if (direct) return direct;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const offset = editor.document.offsetAt(editor.selection.active);
      const reference = this.manager
        .soundDataInDocument(editor.document)
        .find(
          (candidate) =>
            offset >= candidate.range.start && offset <= candidate.range.end,
        );
      if (reference) return this.contextFromReference(reference);
      const definition = this.manager
        .soundEventsInDocument(editor.document)
        .find(
          (candidate) =>
            offset >= candidate.source.entryRange.start &&
            offset <= candidate.source.entryRange.end,
        );
      if (definition)
        return this.singleton(this.targetFromDefinition(definition));
    }
    if (!eventId) return undefined;

    const definition = this.manager.index.soundEvents.find(
      (candidate) => candidate.id === eventId && candidate.source.pack.active,
    );
    if (definition)
      return this.singleton(this.targetFromDefinition(definition));
    const root = editor
      ? this.manager.rootForDocument(editor.document)
      : this.manager.index.resourceRoots[0];
    if (!root) return undefined;

    const identifier = makeIdentifier(eventId, "minecraft");
    return this.singleton({
      eventId: identifier,
      label: this.soundTargetLabel(identifier, root),
      resourcesRoot: root,
      volume: 1,
      pitch: 1,
      sourceLabel: this.soundEventSourceLabel(identifier, root),
    });
  }

  private targetContextAt(
    uri: string,
    offset: number,
  ): SoundTargetContext | undefined {
    const reference = this.manager.index.soundDataReferences.find(
      (candidate) =>
        candidate.source.uri === uri &&
        offset >= candidate.idRange.start &&
        offset <= candidate.idRange.end,
    );
    if (reference) return this.contextFromReference(reference);
    const definition = this.manager.index.soundEvents.find(
      (candidate) =>
        candidate.source.uri === uri &&
        candidate.source.idRange.start === offset,
    );
    if (!definition) return undefined;
    return this.singleton(this.targetFromDefinition(definition));
  }

  private refreshTargetContext(
    target: SoundTarget,
  ): SoundTargetContext | undefined {
    const source = target.source;
    if (!source) return undefined;
    if (target.sourceOffset !== undefined) {
      const direct = this.targetContextAt(source, target.sourceOffset);
      if (direct) return direct;
    }
    if (target.sourcePath !== undefined) {
      const reference = this.manager.index.soundDataReferences.find(
        (candidate) =>
          candidate.source.uri === source &&
          candidate.eventId === target.eventId &&
          candidate.path === target.sourcePath,
      );
      if (reference) return this.contextFromReference(reference);
    }
    const definition = this.manager.index.soundEvents.find(
      (candidate) =>
        candidate.source.uri === source && candidate.id === target.eventId,
    );
    if (!definition) return undefined;
    return this.singleton(this.targetFromDefinition(definition));
  }

  private singleton(target: SoundTarget): SoundTargetContext {
    return { targets: [target], selectedIndex: 0 };
  }

  private workspaceSoundDefinition(
    eventId: string,
    resourcesRoot: string,
  ): SoundEventDefinition | undefined {
    return this.manager.index.soundEvents.find(
      (definition) =>
        definition.id === eventId &&
        definition.source.pack.active &&
        samePath(definition.source.pack.resourcesRoot, resourcesRoot),
    );
  }

  private soundEventSourceLabel(
    eventId: string,
    resourcesRoot: string,
  ): string {
    const vanilla = this.manager.vanillaSounds;
    if (!vanilla) return Messages.src.preview.sound.panel.text0033;
    const source = soundEventSource(
      this.manager.index.soundEvents,
      vanilla,
      resourcesRoot,
      eventId,
    );
    if (source === "workspace") {
      const definition = this.workspaceSoundDefinition(eventId, resourcesRoot);
      const kind = vanilla.isVanillaEvent(eventId)
        ? Messages.src.preview.sound.panel.text0034
        : Messages.src.preview.sound.panel.text0035;
      return definition ? `${kind} · ${definition.source.pack.name}` : kind;
    }
    return source === "vanilla"
      ? Messages.src.preview.sound.panel.text0036
      : Messages.src.preview.sound.panel.text0037;
  }

  private soundTargetLabel(
    eventId: string,
    resourcesRoot: string,
    role?: string,
  ): string {
    const definition = this.workspaceSoundDefinition(eventId, resourcesRoot);
    return [
      role,
      definition?.subtitleText ??
        this.manager.vanillaSounds?.describe(eventId) ??
        definition?.subtitle,
      eventId,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(" · ");
  }

  private contextFromReference(
    reference: SoundDataReference,
  ): SoundTargetContext {
    const source = reference.source;
    const key = (candidate: SoundDataReference): string =>
      `${candidate.idRange.start}:${candidate.idRange.end}:${candidate.path}:${candidate.eventId}`;
    const seen = new Set<string>();
    const siblings = this.manager.index.soundDataReferences
      .filter(
        (candidate) =>
          candidate.source.uri === source.uri &&
          candidate.source.entryRange.start === source.entryRange.start &&
          candidate.source.entryRange.end === source.entryRange.end,
      )
      .sort((left, right) => left.idRange.start - right.idRange.start)
      .filter((candidate) => {
        const value = key(candidate);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    const references = siblings.length === 0 ? [reference] : siblings;
    const selectedIndex = Math.max(
      0,
      references.findIndex((candidate) => key(candidate) === key(reference)),
    );
    return {
      targets: references.map((candidate) =>
        this.targetFromReference(candidate),
      ),
      selectedIndex,
    };
  }

  private targetFromReference(reference: SoundDataReference): SoundTarget {
    const resourcesRoot = reference.source.pack.resourcesRoot;
    return {
      eventId: reference.eventId,
      label: this.soundTargetLabel(
        reference.eventId,
        resourcesRoot,
        soundRole(reference.path),
      ),
      resourcesRoot,
      volume: reference.volume,
      pitch: reference.pitch,
      sourceLabel: `${reference.source.pack.name} · SoundData · ${this.soundEventSourceLabel(reference.eventId, resourcesRoot)}`,
      source: reference.source.uri,
      sourceOffset: reference.idRange.start,
      sourcePath: reference.path,
    };
  }

  private targetFromDefinition(definition: SoundEventDefinition): SoundTarget {
    const resourcesRoot = definition.source.pack.resourcesRoot;
    return {
      eventId: definition.id,
      label: this.soundTargetLabel(definition.id, resourcesRoot),
      resourcesRoot,
      volume: 1,
      pitch: 1,
      sourceLabel: `${this.soundEventSourceLabel(definition.id, resourcesRoot)} · ${definition.origin === "resourcepack-json" ? Messages.common.soundsJson : Messages.common.diagnosticSource}`,
      source: definition.source.uri,
      sourceOffset: definition.source.idRange.start,
    };
  }

  private entries(
    eventId: string,
    root: string,
  ): readonly ResolvedSoundEntry[] {
    const vanilla = this.manager.vanillaSounds;
    return vanilla
      ? resolveSoundEvent(
          this.manager.index.soundEvents,
          vanilla,
          root,
          eventId,
        )
      : [];
  }

  private concrete(
    eventId: string,
    root: string,
    weight = 1,
    layers: readonly SoundLayer[] = [],
    visiting: readonly string[] = [],
  ): readonly ConcreteSound[] {
    if (visiting.includes(eventId)) return [];
    return this.entries(eventId, root).flatMap((entry) => {
      const nextLayers = [
        ...layers,
        { eventId, volume: entry.volume, pitch: entry.pitch },
      ];
      return entry.type === "file"
        ? [
            {
              id: entry.name,
              weight: weight * entry.weight,
              layers: nextLayers,
              source: entry.source,
            },
          ]
        : this.concrete(entry.name, root, weight * entry.weight, nextLayers, [
            ...visiting,
            eventId,
          ]);
    });
  }

  private choose(
    eventId: string,
    root: string,
    weight = 1,
    layers: readonly SoundLayer[] = [],
    visiting: readonly string[] = [],
  ): ConcreteSound | undefined {
    if (visiting.includes(eventId)) return undefined;
    const selected = weighted(this.entries(eventId, root));
    if (!selected) return undefined;
    const nextLayers = [
      ...layers,
      { eventId, volume: selected.volume, pitch: selected.pitch },
    ];
    return selected.type === "file"
      ? {
          id: selected.name,
          weight: weight * selected.weight,
          layers: nextLayers,
          source: selected.source,
        }
      : this.choose(selected.name, root, weight * selected.weight, nextLayers, [
          ...visiting,
          eventId,
        ]);
  }

  private async receive(message: unknown): Promise<void> {
    if (!this.panel || !this.target || !isRecord(message)) return;
    const record = message;
    switch (record.type) {
      case "ready":
        this.ready = true;
        this.phase = "ready";
        for (const entry of this.vanillaFiles(this.target)) {
          if (this.assets.cachedSound(entry.id))
            await this.postCacheState(this.target, entry.id);
        }
        return;
      case "select-target": {
        if (typeof record.index !== "number") return;
        const index = Math.trunc(record.index);
        const target = this.targets[index];
        if (!target) return;
        this.selectedTargetIndex = index;
        this.resetTarget(target);
        this.panel.title = Messages.src.preview.sound.panel.text0038(
          target.eventId,
        );
        this.panel.webview.html = this.html(this.panel.webview, target);
        await this.prefetchVanillaFiles(target);
        return;
      }
      case "loading":
        this.phase = "loading";
        this.fileId = typeof record.id === "string" ? record.id : this.fileId;
        return;
      case "decoded":
        this.decoded = true;
        this.started = true;
        this.playing = true;
        this.fileId = typeof record.id === "string" ? record.id : undefined;
        this.audioContextState =
          typeof record.state === "string" ? record.state : undefined;
        this.phase = "decoded";
        return;
      case "playback-error":
        this.error =
          typeof record.message === "string"
            ? record.message
            : Messages.src.preview.sound.panel.text0039;
        this.playing = false;
        this.phase = "error";
        return;
      case "ended":
      case "stop":
        this.playing = false;
        this.phase = "ended";
        return;
      case "play":
      case "play-file":
        break;
      default:
        return;
    }

    this.decoded = false;
    this.playing = false;
    this.error = undefined;
    this.phase = "resolving";
    const selected =
      record.type === "play-file" && typeof record.index === "number"
        ? this.concrete(this.target.eventId, this.target.resourcesRoot)[
            Math.trunc(record.index)
          ]
        : this.choose(this.target.eventId, this.target.resourcesRoot);
    if (!selected) {
      this.error = Messages.src.preview.sound.panel.text0040;
      this.phase = "error";
      await this.panel.webview.postMessage({
        type: "error",
        message: Messages.src.preview.sound.panel.text0041,
      });
      return;
    }

    const soundPath = await this.resolveFile(selected);
    if (!soundPath) {
      this.error ??= Messages.src.preview.sound.panel.text0042(selected.id);
      this.phase = "error";
      return;
    }

    await this.panel.webview.postMessage({
      type: "cache-state",
      id: selected.id,
      label: this.concreteFileSource(selected),
    });
    this.fileId = selected.id;
    const volume = [
      this.target.volume,
      ...selected.layers.map((layer) => layer.volume),
    ].reduce<number>(
      (result, value) => result * sampleSoundNumber(value, 1),
      1,
    );
    const pitch = [
      this.target.pitch,
      ...selected.layers.map((layer) => layer.pitch),
    ].reduce<number>(
      (result, value) => result * sampleSoundNumber(value, 1),
      1,
    );
    if (pitch <= 0) {
      this.error = Messages.src.preview.sound.panel.text0043(pitch);
      this.phase = "error";
      await this.panel.webview.postMessage({
        type: "error",
        message: Messages.src.preview.sound.panel.text0044(pitch),
      });
      return;
    }

    let bytes: Buffer;
    try {
      bytes = await readFile(soundPath);
    } catch (error) {
      this.error = Messages.src.preview.sound.panel.text0045(
        selected.id,
        error instanceof Error ? error.message : String(error),
      );
      this.phase = "error";
      await this.panel.webview.postMessage({
        type: "error",
        message: this.error,
      });
      return;
    }

    const delivered = await this.panel.webview.postMessage({
      type: "play",
      id: selected.id,
      oggBase64: bytes.toString("base64"),
      volume,
      pitch,
    });
    if (delivered) this.phase = "posted";
    else {
      this.error = Messages.src.preview.sound.panel.text0046;
      this.phase = "error";
    }
  }

  private async resolveFile(entry: ConcreteSound): Promise<string | undefined> {
    const target = this.target;
    if (!target) return undefined;
    const workspace = this.workspaceSoundFile(target, entry.id);
    if (workspace) return workspace;
    if (entry.source !== "vanilla") {
      await vscode.window.showErrorMessage(
        Messages.src.preview.sound.panel.text0047(entry.id),
      );
      return undefined;
    }
    const metadata = this.manager.vanillaSounds?.files.get(entry.id);
    if (!metadata) {
      await vscode.window.showErrorMessage(
        Messages.src.preview.sound.panel.text0048(entry.id),
      );
      return undefined;
    }
    const cached = await this.assets.verifiedCachedSound(
      entry.id,
      metadata.hash,
      metadata.size,
    );
    if (cached) return cached;
    try {
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: Messages.src.preview.sound.panel.text0049(entry.id),
          cancellable: true,
        },
        async (progress, token) =>
          this.assets.sound(entry.id, metadata.hash, metadata.size, {
            isCancellationRequested: () => token.isCancellationRequested,
            report: (value: MinecraftDownloadProgress) =>
              progress.report({
                message:
                  value.total && value.downloaded !== undefined
                    ? `${value.message} · ${(value.downloaded / 1024).toFixed(0)}/${(value.total / 1024).toFixed(0)} KiB`
                    : value.message,
              }),
          }),
      );
    } catch (error) {
      if (error instanceof MinecraftDownloadCancelled) return undefined;
      await vscode.window.showErrorMessage(
        Messages.src.preview.sound.panel.text0050(
          error instanceof Error ? error.message : String(error),
        ),
      );
      return undefined;
    }
  }

  private workspaceSoundFile(
    target: SoundTarget,
    id: string,
  ): string | undefined {
    const candidates = resourceCandidates(
      this.manager.index.resources,
      target.resourcesRoot,
      "sound-file",
      id,
    );
    return (candidates.find((file) => file.effective) ?? candidates[0])?.path;
  }

  private vanillaFiles(target: SoundTarget): readonly ConcreteSound[] {
    return this.concrete(target.eventId, target.resourcesRoot).filter(
      (entry) =>
        entry.source === "vanilla" &&
        this.workspaceSoundFile(target, entry.id) === undefined,
    );
  }

  private async prefetchVanillaFiles(target: SoundTarget): Promise<void> {
    const catalog = this.manager.vanillaSounds;
    if (!catalog) return;
    const seen = new Set<string>();
    const entries = this.vanillaFiles(target).filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    const uncached: ConcreteSound[] = [];
    const missing: string[] = [];
    for (const entry of entries) {
      const metadata = catalog.files.get(entry.id);
      if (!metadata) {
        missing.push(entry.id);
        continue;
      }
      const cached = await this.assets.verifiedCachedSound(
        entry.id,
        metadata.hash,
        metadata.size,
      );
      if (cached) await this.postCacheState(target, entry.id);
      else uncached.push(entry);
    }
    if (missing.length > 0) {
      await vscode.window.showWarningMessage(
        Messages.src.preview.sound.panel.text0051(
          missing.map((id) => `${id}.ogg`).join("、"),
        ),
      );
    }
    if (uncached.length === 0) return;
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: Messages.src.preview.sound.panel.text0052(target.eventId),
          cancellable: true,
        },
        async (progress, token) =>
          cacheVanillaSoundFiles(uncached, catalog.files, this.assets, {
            isCancellationRequested: () => token.isCancellationRequested,
            downloadOptions: (id, index, total) => ({
              isCancellationRequested: () => token.isCancellationRequested,
              report: (value: MinecraftDownloadProgress) =>
                progress.report({
                  message:
                    value.total && value.downloaded !== undefined
                      ? `${index + 1}/${total} · ${id}.ogg · ${(value.downloaded / 1024).toFixed(0)}/${(value.total / 1024).toFixed(0)} KiB`
                      : `${index + 1}/${total} · ${id}.ogg`,
                }),
            }),
            onCached: async (id) => this.postCacheState(target, id),
          }),
      );
    } catch (error) {
      if (error instanceof MinecraftDownloadCancelled) return;
      await vscode.window.showErrorMessage(
        Messages.src.preview.sound.panel.text0053(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  private async postCacheState(target: SoundTarget, id: string): Promise<void> {
    if (!this.panel || this.target !== target) return;
    await this.panel.webview.postMessage({
      type: "cache-state",
      id,
      label: Messages.src.preview.sound.panel.text0054,
    });
  }

  private concreteFileSource(entry: ConcreteSound): string {
    if (entry.source !== "vanilla")
      return Messages.src.preview.sound.panel.text0055;
    return this.assets.cachedSound(entry.id)
      ? Messages.src.preview.sound.panel.text0056
      : Messages.src.preview.sound.panel.text0057;
  }

  private resetTarget(target: SoundTarget): void {
    this.target = target;
    this.ready = false;
    this.decoded = false;
    this.started = false;
    this.playing = false;
    this.fileId = undefined;
    this.audioContextState = undefined;
    this.error = undefined;
    this.phase = "opening";
  }

  private html(webview: vscode.Webview, target: SoundTarget): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "target",
        "dist",
        "sound-preview.js",
      ),
    );
    const footerStyle = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "resources",
        "editor-preview-footer.css",
      ),
    );
    const token = nonce();
    const concrete = this.concrete(target.eventId, target.resourcesRoot);
    const subtitle =
      this.manager.vanillaSounds?.describe(target.eventId) ??
      this.manager.index.soundEvents.find(
        (event) => event.id === target.eventId && event.subtitle,
      )?.subtitle ??
      Messages.src.preview.sound.panel.text0058;
    const targetSelector =
      this.targets.length <= 1
        ? ""
        : Messages.src.preview.sound.panel.text0059(
            this.targets
              .map(
                (candidate, index) =>
                  `<option value="${index}"${index === this.selectedTargetIndex ? " selected" : ""}>${escapeHtml(candidate.label)}</option>`,
              )
              .join(""),
          );
    const rows =
      concrete.length === 0
        ? Messages.src.preview.sound.panel.text0060
        : concrete
            .map((entry, index) => {
              const volumeChain = entry.layers
                .map((layer) => displayValue(layer.volume))
                .join(" × ");
              const pitchChain = entry.layers
                .map((layer) => displayValue(layer.pitch))
                .join(" × ");
              return Messages.src.preview.sound.panel.text0061(
                escapeHtml(entry.id),
                index,
                entry.weight,
                escapeHtml(volumeChain || "1"),
                escapeHtml(pitchChain || "1"),
                escapeHtml(entry.id),
                escapeHtml(this.concreteFileSource(entry)),
              );
            })
            .join("");
    return Messages.src.preview.sound.panel.text0062(
      webview.cspSource,
      webview.cspSource,
      token,
      webview.cspSource,
      token,
      footerStyle.toString(),
      token,
      targetSelector,
      escapeHtml(target.eventId),
      escapeHtml(subtitle),
      escapeHtml(target.sourceLabel),
      escapeHtml(displayValue(target.volume)),
      escapeHtml(displayValue(target.pitch)),
      concrete.length,
      rows,
      editorPreviewFooter(this.extensionVersion),
      token,
      script.toString(),
    );
  }
}
