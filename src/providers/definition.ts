import * as vscode from "vscode";

import type { TextRange } from "../diagnostics/model.js";
import type { VanillaAssetStore } from "../minecraft/assets/store.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import { rangeAt } from "../util/vscode/range.js";
import {
  configurationIdReferenceAt,
  configurationResourceReferenceAt,
  configurationTargets,
  crossDomainTargets,
  equipmentTextureReferenceAt,
  imageTargetsAt,
  itemsForToken,
  offsetIn,
  resolvedTextures,
  soundReferenceAt,
  targetSource,
  templateInvocationReferenceAt,
  wordAt,
} from "./completion/provider.js";

export class CraftEngineDefinitionProvider
  implements vscode.DefinitionProvider
{
  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
    private readonly vanillaAssets?: VanillaAssetStore,
  ) {}

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Definition> {
    const crossReference = this.workspaceIndex.crossDomainReferenceAt(
      document,
      position,
    );
    if (crossReference) {
      const locations: vscode.Location[] = [];
      for (const target of crossDomainTargets(
        this.workspaceIndex,
        document,
        crossReference,
      )) {
        const uri = vscode.Uri.parse(target.source.uri);
        const targetDocument =
          vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === target.source.uri,
          ) ?? (await vscode.workspace.openTextDocument(uri));
        locations.push(
          new vscode.Location(
            uri,
            rangeAt(targetDocument, target.source.idRange),
          ),
        );
      }
      return locations;
    }
    const templateReference = templateInvocationReferenceAt(
      document,
      document.offsetAt(position),
    );
    if (templateReference) {
      const locations: vscode.Location[] = [];
      for (const target of configurationTargets(
        this.workspaceIndex,
        document,
        templateReference,
      )) {
        const source = targetSource(target);
        const uri = vscode.Uri.parse(source.uri);
        const targetDocument =
          vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === source.uri,
          ) ?? (await vscode.workspace.openTextDocument(uri));
        locations.push(
          new vscode.Location(uri, rangeAt(targetDocument, source.range)),
        );
      }
      return locations;
    }
    const equipmentTexture = equipmentTextureReferenceAt(
      this.workspaceIndex,
      document,
      document.offsetAt(position),
    );
    if (equipmentTexture) {
      return this.workspaceIndex
        .resourceFiles(document, equipmentTexture.identifier, "texture")
        .map(
          (file) =>
            new vscode.Location(
              vscode.Uri.file(file.path),
              new vscode.Position(0, 0),
            ),
        );
    }
    const images = resolvedTextures(
      this.workspaceIndex,
      imageTargetsAt(this.workspaceIndex, document, position),
    ).map(
      (filePath) =>
        new vscode.Location(
          vscode.Uri.file(filePath),
          new vscode.Position(0, 0),
        ),
    );
    if (images.length > 0) return images;
    const offset = document.offsetAt(position);
    const sound = soundReferenceAt(this.workspaceIndex, document, offset);
    if (sound?.kind === "file") {
      const files = this.workspaceIndex
        .resourceFiles(document, sound.id, "sound-file")
        .map(
          (file) =>
            new vscode.Location(
              vscode.Uri.file(file.path),
              new vscode.Position(0, 0),
            ),
        );
      const cached = this.vanillaAssets?.cachedSound(sound.id);
      if (cached)
        files.push(
          new vscode.Location(
            vscode.Uri.file(cached),
            new vscode.Position(0, 0),
          ),
        );
      return files;
    }
    if (sound) {
      const locations: vscode.Location[] = [];
      for (const definition of this.workspaceIndex
        .soundEvents(document)
        .filter((event) => event.id === sound.id)) {
        const uri = vscode.Uri.parse(definition.source.uri);
        const targetDocument =
          vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === definition.source.uri,
          ) ?? (await vscode.workspace.openTextDocument(uri));
        locations.push(
          new vscode.Location(
            uri,
            rangeAt(targetDocument, definition.source.idRange),
          ),
        );
      }
      if (locations.length > 0) return locations;
      const cachedSounds = this.vanillaAssets?.cachedLogicalPath(
        "assets/minecraft/sounds.json",
      );
      return cachedSounds
        ? [
            new vscode.Location(
              vscode.Uri.file(cachedSounds),
              new vscode.Position(0, 0),
            ),
          ]
        : [];
    }
    const configurationReference = configurationIdReferenceAt(
      this.workspaceIndex,
      document,
      offset,
    );
    if (configurationReference) {
      const locations: vscode.Location[] = [];
      for (const target of configurationTargets(
        this.workspaceIndex,
        document,
        configurationReference,
      )) {
        const source = targetSource(target);
        const uri = vscode.Uri.parse(source.uri);
        const targetDocument =
          vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === source.uri,
          ) ?? (await vscode.workspace.openTextDocument(uri));
        locations.push(
          new vscode.Location(uri, rangeAt(targetDocument, source.range)),
        );
      }
      return locations;
    }
    const image = this.workspaceIndex.imageAt(document, position);
    if (
      image &&
      (offsetIn(offset, image.source.idRange) ||
        offsetIn(offset, image.source.fieldValueRanges.get("file")))
    )
      return [];
    const resourceReference = configurationResourceReferenceAt(
      this.workspaceIndex,
      document,
      offset,
    );
    if (resourceReference) {
      return this.workspaceIndex
        .resourceFiles(
          document,
          resourceReference.identifier,
          resourceReference.kind,
        )
        .map(
          (file) =>
            new vscode.Location(
              vscode.Uri.file(file.path),
              new vscode.Position(0, 0),
            ),
        );
    }
    if (
      this.workspaceIndex
        .itemsInDocument(document)
        .some((item) => offsetIn(offset, item.source.idRange))
    )
      return [];
    const token = wordAt(document, position);
    const locations: vscode.Location[] = [];
    const sourceTargets: Array<{
      readonly uri: string;
      readonly range: TextRange;
    }> = [];
    const seen = new Set<string>();
    const addSource = (uri: string, range: TextRange): void => {
      const key = `${uri}:${range.start}:${range.end}`;
      if (seen.has(key)) return;
      seen.add(key);
      sourceTargets.push({ uri, range });
    };
    for (const item of itemsForToken(this.workspaceIndex, document, token))
      addSource(item.source.uri, item.source.idRange);
    const catalog = this.workspaceIndex.forDocument(document);
    for (const kind of ["block", "furniture"] as const) {
      for (const entry of catalog?.resolveOpaque(kind, token).candidates ?? [])
        addSource(entry.source.uri, entry.source.idRange);
    }
    for (const song of catalog?.resolveJukeboxSong(token).candidates ?? [])
      addSource(song.source.uri, song.source.idRange);
    for (const file of this.workspaceIndex.resourceFiles(document, token)) {
      const key = `file:${file.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      locations.push(
        new vscode.Location(
          vscode.Uri.file(file.path),
          new vscode.Position(0, 0),
        ),
      );
    }
    for (const target of sourceTargets) {
      const uri = vscode.Uri.parse(target.uri);
      const targetDocument =
        vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.toString() === target.uri,
        ) ?? (await vscode.workspace.openTextDocument(uri));
      locations.push(
        new vscode.Location(uri, rangeAt(targetDocument, target.range)),
      );
    }
    return locations;
  }
}
