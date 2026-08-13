import * as vscode from "vscode";

import type { YamlCompletionContext } from "../../config/completion/context.js";
import {
  schemaFieldForName,
  semanticForField,
} from "../../config/schema/types.js";
import { Messages } from "../../messages.js";
import type { SchemaField } from "../../config/schema/types.js";

export interface SchemaCompletionOptions {
  readonly fields: readonly SchemaField[];
  readonly listField?: SchemaField;
  readonly dynamicKey?: SchemaField;
  readonly dynamicValue?: SchemaField;
  readonly fieldForName?: (
    name: string,
    fields: readonly SchemaField[],
  ) => SchemaField | undefined;
  readonly semanticForName?: (name: string) => string | undefined;
  readonly extraListValues?: ReadonlyMap<string, string>;
}

export interface SchemaCompletionRouterContext {
  readonly document: vscode.TextDocument;
  readonly position: vscode.Position;
  readonly replacement: vscode.Range;
  readonly yaml: YamlCompletionContext;
  readonly valuesForField: (field: SchemaField) => Map<string, string>;
  readonly valueItemsForField: (
    field: SchemaField,
    extraValues?: ReadonlyMap<string, string>,
  ) => vscode.CompletionItem[];
}

export function routeSchemaCompletions(
  context: SchemaCompletionRouterContext,
  options: SchemaCompletionOptions,
): vscode.CompletionItem[] {
  const placeholderFields = options.fields.filter((field) =>
    /^<[^>]+>$/u.test(field.label),
  );
  if (!context.yaml.propertyPosition) {
    const fieldName = context.yaml.fieldName;
    if (!fieldName) return [];
    const selected =
      (options.fieldForName ?? schemaFieldForName)(fieldName, options.fields) ??
      placeholderFields[0] ??
      options.dynamicValue;
    return selected ? context.valueItemsForField(selected) : [];
  }
  if (
    context.document
      .lineAt(context.position)
      .text.trimStart()
      .startsWith("-") &&
    options.listField
  ) {
    return context.valueItemsForField(
      options.listField,
      options.extraListValues,
    );
  }
  const existingSemantics = new Set(
    [...context.yaml.existingKeys].map(
      (key) =>
        options.semanticForName?.(key) ?? semanticForField(key, options.fields),
    ),
  );
  const properties = options.fields
    .filter(
      (field) =>
        !/^<[^>]+>$/u.test(field.label) &&
        !existingSemantics.has(field.semantic),
    )
    .map((field) => schemaPropertyCompletion(field, context.replacement));
  const placeholders = placeholderFields.map((field) => {
    const item = new vscode.CompletionItem(
      field.label,
      vscode.CompletionItemKind.Property,
    );
    item.detail = field.detail;
    item.range = context.replacement;
    let sample: string;
    switch (field.label) {
      case "<material>":
        sample = "minecraft:stone";
        break;
      case "<font>":
        sample = "minecraft:default";
        break;
      case "<id-or-range>":
        sample = "0";
        break;
      case "<from>":
        sample = "namespace:source";
        break;
      case "<result>":
        sample = "1.0";
        break;
      default:
        sample = "key";
    }
    item.insertText = new vscode.SnippetString(
      field.snippet.replace(field.label, `\${1:${sample}}`),
    );
    return item;
  });
  if (!options.dynamicKey) return [...properties, ...placeholders];
  const dynamicValues = [...context.valuesForField(options.dynamicKey)];
  const dynamicPlaceholder = /^<[^>]+>$/u.test(options.dynamicKey.label)
    ? schemaPropertyCompletion(options.dynamicKey, context.replacement)
    : undefined;
  if (dynamicValues.length === 0) {
    return [
      ...properties,
      ...placeholders,
      dynamicPlaceholder ??
        schemaPropertyCompletion(options.dynamicKey, context.replacement),
    ];
  }
  const dynamic = dynamicValues
    .filter(([label]) => !context.yaml.existingKeys.has(label))
    .map(([label, detail]) => {
      const item = new vscode.CompletionItem(
        label,
        vscode.CompletionItemKind.Property,
      );
      item.detail = detail;
      item.range = context.replacement;
      item.insertText = new vscode.SnippetString(
        `"${label.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}": \${0}`,
      );
      return item;
    });
  return [
    ...properties,
    ...placeholders,
    ...(dynamicPlaceholder ? [dynamicPlaceholder] : []),
    ...dynamic,
  ];
}

function schemaPropertyCompletion(
  field: SchemaField,
  range: vscode.Range,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    field.label,
    vscode.CompletionItemKind.Property,
  );
  item.detail = Messages.src.providers.completion.schemaRouter.text0001(
    field.detail,
    field.required === true,
    field.optionalDependency,
  );
  item.range = range;
  item.insertText = new vscode.SnippetString(field.snippet);
  return item;
}
