import * as vscode from "vscode";

import {
  craftEngineColors,
  formatCraftEngineColor,
  parseCraftEngineColor,
  type CraftEngineColorFormat,
} from "../config/value/colors.js";
import {
  parseCraftEngineYaml,
  parseLooseScalar,
} from "../config/parsing/craftEngineYaml.js";

export class CraftEngineColorProvider implements vscode.DocumentColorProvider {
  public provideDocumentColors(
    document: vscode.TextDocument,
  ): vscode.ColorInformation[] {
    return craftEngineColors(
      parseCraftEngineYaml(document.uri.toString(), document.getText()),
    ).map(
      (entry) =>
        new vscode.ColorInformation(
          new vscode.Range(
            document.positionAt(entry.range.start),
            document.positionAt(entry.range.end),
          ),
          new vscode.Color(
            entry.red / 255,
            entry.green / 255,
            entry.blue / 255,
            entry.alpha / 255,
          ),
        ),
    );
  }

  public provideColorPresentations(
    color: vscode.Color,
    context: {
      readonly document: vscode.TextDocument;
      readonly range: vscode.Range;
    },
  ): vscode.ColorPresentation[] {
    const occurrence = craftEngineColors(
      parseCraftEngineYaml(
        context.document.uri.toString(),
        context.document.getText(),
      ),
    ).find(
      (entry) =>
        entry.range.start === context.document.offsetAt(context.range.start) &&
        entry.range.end === context.document.offsetAt(context.range.end),
    );
    const original =
      occurrence ??
      parseCraftEngineColor(
        parseLooseScalar(context.document.getText(context.range)),
      );
    let formats: readonly CraftEngineColorFormat[] = [
      "hex",
      "rgb",
      "argb",
      "decimal",
    ];
    if (original?.format === "rgb-decimal") formats = ["rgb-decimal"];
    else if (original)
      formats = [
        original.format,
        ...(["hex", "rgb", "argb", "decimal"] as const).filter(
          (format) => format !== original.format,
        ),
      ];
    return formats.map((format) => {
      const label = formatCraftEngineColor(color, format);
      const presentation = new vscode.ColorPresentation(label);
      presentation.textEdit = vscode.TextEdit.replace(context.range, label);
      return presentation;
    });
  }
}
