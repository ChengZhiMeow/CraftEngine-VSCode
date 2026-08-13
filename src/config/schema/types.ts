export type SchemaValueProvider =
  | "boolean"
  | "number"
  | "number-provider"
  | "material"
  | "item-id"
  | "category-id"
  | "painting-id"
  | "image-id"
  | "recipe-id"
  | "configured-feature-id"
  | "placed-feature-id"
  | "block-id"
  | "block-state"
  | "block-tag"
  | "furniture-id"
  | "equipment-id"
  | "item-model"
  | "model"
  | "texture"
  | "component"
  | "attribute"
  | "enchantment"
  | "effect"
  | "sound"
  | "sound-file"
  | "particle"
  | "entity-type"
  | "potion"
  | "damage-type"
  | "function-type"
  | "condition-type"
  | "item-model-type"
  | "registry"
  | "tooltip-style"
  | "jukebox-song"
  | "loot-id"
  | "template";

export interface SchemaField {
  readonly label: string;
  readonly semantic: string;
  readonly aliases: readonly string[];
  readonly detail: string;
  readonly snippet: string;
  readonly valueProvider?: SchemaValueProvider;
  readonly values?: readonly string[];
  readonly valueDetails?: Readonly<Record<string, string>>;
  readonly optionalDependency?: string;
  readonly registry?: string;
  readonly required?: boolean;
}

export interface SchemaContext {
  readonly path: readonly string[];
  readonly siblingValues: ReadonlyMap<string, string>;
  // 上级 type 从近到远排列, 顺序反了会选错类型
  readonly ancestorTypes?: readonly string[];
}

export function semanticForField(
  name: string,
  fields: readonly SchemaField[],
): string {
  return schemaFieldForName(name, fields)?.semantic ?? name;
}

export function schemaFieldForName(
  name: string,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  return fields.find(
    (candidate) => candidate.label === name || candidate.aliases.includes(name),
  );
}
