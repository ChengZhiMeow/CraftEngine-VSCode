import * as vscode from "vscode";

import type { ImageDefinition } from "../config/image/model.js";
import type { CraftEngineWorkspaceIndex } from "../workspace/index.js";
import { Messages } from "../messages.js";
import { rangeAt } from "../util/vscode/range.js";
import {
  candidatesForToken,
  commandLink,
  configurationIdReferenceAt,
  configurationKindLabel,
  configurationResourceReferenceAt,
  configurationTargetMetadata,
  furnitureHover,
  genericConfigurationHover,
  imageArgument,
  itemHover,
  offsetIn,
  resolvedTextures,
  selectedConfigurationTarget,
  soundReferenceAt,
  templateInvocationReferenceAt,
  wordAt,
} from "./completion/provider.js";

export class CraftEngineHoverProvider implements vscode.HoverProvider {
  public constructor(
    private readonly workspaceIndex: CraftEngineWorkspaceIndex,
  ) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const offset = document.offsetAt(position);
    const sound = soundReferenceAt(this.workspaceIndex, document, offset);
    if (sound) {
      const markdown = new vscode.MarkdownString(undefined, true);
      markdown.isTrusted = {
        enabledCommands: ["craftengineYaml.previewSound"],
      };
      markdown.appendMarkdown(
        `### ${sound.id}${sound.kind === "file" ? ".ogg" : ""}\n\n`,
      );
      markdown.appendMarkdown(
        Messages.src.providers.hover.text0003(
          sound.kind === "file"
            ? Messages.src.providers.hover.text0001
            : (this.workspaceIndex.vanillaSounds?.describe(sound.id) ??
                Messages.src.providers.hover.text0002),
          commandLink(
            Messages.src.providers.hover.text0006,
            "craftengineYaml.previewSound",
            [sound.argument],
          ),
        ),
      );
      return new vscode.Hover(markdown, rangeAt(document, sound.range));
    }
    const templateReference = templateInvocationReferenceAt(document, offset);
    if (templateReference) {
      const primary = selectedConfigurationTarget(
        this.workspaceIndex,
        document,
        templateReference,
      );
      if (!primary) return undefined;
      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`### ${templateReference.identifier}\n\n`);
      markdown.appendMarkdown(
        `${configurationKindLabel(templateReference.kind)} · ${configurationTargetMetadata(primary)}`,
      );
      return new vscode.Hover(
        markdown,
        rangeAt(document, templateReference.range),
      );
    }
    const generic = genericConfigurationHover(
      this.workspaceIndex,
      document,
      position,
    );
    if (generic) return generic;
    if (this.workspaceIndex.crossDomainReferenceAt(document, position))
      return undefined;
    const configurationReference = configurationIdReferenceAt(
      this.workspaceIndex,
      document,
      offset,
    );
    if (configurationReference) {
      const primary = selectedConfigurationTarget(
        this.workspaceIndex,
        document,
        configurationReference,
      );
      if (!primary) return undefined;
      const markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`### ${configurationReference.identifier}\n\n`);
      markdown.appendMarkdown(
        `${configurationKindLabel(configurationReference.kind)} · ${configurationTargetMetadata(primary)}`,
      );
      return new vscode.Hover(
        markdown,
        rangeAt(document, configurationReference.range),
      );
    }
    if (configurationResourceReferenceAt(this.workspaceIndex, document, offset))
      return undefined;
    const item = itemHover(this.workspaceIndex, document, position);
    if (item) return item;
    const furniture = furnitureHover(this.workspaceIndex, document, position);
    if (furniture) return furniture;
    const at = this.workspaceIndex.imageAt(document, position);
    if (at && offsetIn(offset, at.source.fieldValueRanges.get("file")))
      return undefined;
    let images: ImageDefinition[];
    if (
      at &&
      (offsetIn(offset, at.source.idRange) ||
        offsetIn(offset, at.source.fieldValueRanges.get("ref")))
    )
      images = [at];
    else
      images = candidatesForToken(
        this.workspaceIndex,
        document,
        wordAt(document, position),
      );
    const primary = images[0];
    if (!primary) return undefined;
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = {
      enabledCommands: [
        "craftengineYaml.previewImage",
        "craftengineYaml.openPng",
      ],
    };
    markdown.appendMarkdown(`### ${primary.id}\n\n`);
    markdown.appendMarkdown(
      [
        commandLink(
          Messages.src.providers.hover.text0004,
          "craftengineYaml.previewImage",
          [imageArgument(primary)],
        ),
        ...(resolvedTextures(this.workspaceIndex, [primary]).length > 0
          ? [
              commandLink(
                Messages.src.providers.hover.text0005,
                "craftengineYaml.openPng",
                [imageArgument(primary)],
              ),
            ]
          : []),
      ].join(" · "),
    );
    return new vscode.Hover(markdown);
  }
}
