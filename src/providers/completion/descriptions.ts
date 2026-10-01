import { dataComponentDefinition } from "../../config/item/dataComponents.js";
import { fieldsForDiscriminator } from "../../config/item/schema.js";
import type {
  SchemaField,
  SchemaValueProvider,
} from "../../config/schema/types.js";
import { Messages } from "../../messages.js";
import {
  splitResourceIdentifier,
  type VanillaCatalog,
} from "../../minecraft/catalog.js";

export type CompletionDescriptionKind =
  | SchemaValueProvider
  | "item"
  | "block"
  | "entity"
  | "action"
  | "condition"
  | "model-type";

export interface CompletionDescription {
  readonly detail: string;
  readonly documentation: string;
  readonly source: "official-translation" | "schema" | "derived";
  readonly translationKey?: string;
}

export interface CompletionDescriptionOptions {
  readonly field?: SchemaField;
  readonly registry?: string;
}

interface TranslatedName {
  readonly name: string;
  readonly key?: string;
}

const HAN = /[\u3400-\u9fff\uf900-\ufaff]/u;

const KIND_LABELS: Readonly<Record<CompletionDescriptionKind, string>> = {
  boolean: Messages.src.providers.completion.descriptions.text0001,
  number: Messages.src.providers.completion.descriptions.text0002,
  "number-provider": Messages.src.providers.completion.descriptions.text0003,
  "custom-attribute": "CraftEngine 自定义属性",
  "attribute-operation": "属性操作",
  "equipment-set": "装备套装",
  material: Messages.src.providers.completion.descriptions.text0004,
  "item-id": Messages.src.providers.completion.descriptions.text0005,
  "category-id": Messages.src.providers.completion.descriptions.text0006,
  "painting-id": Messages.src.providers.completion.descriptions.text0007,
  "image-id": Messages.src.providers.completion.descriptions.text0008,
  "recipe-id": Messages.src.providers.completion.descriptions.text0009,
  "configured-feature-id":
    Messages.src.providers.completion.descriptions.text0158,
  "placed-feature-id": Messages.src.providers.completion.descriptions.text0159,
  "block-id": Messages.src.providers.completion.descriptions.text0010,
  "block-state": Messages.src.providers.completion.descriptions.text0011,
  "block-tag": Messages.src.providers.completion.descriptions.text0012,
  "furniture-id": Messages.src.providers.completion.descriptions.text0013,
  "equipment-id": Messages.src.providers.completion.descriptions.text0014,
  "item-model": Messages.src.providers.completion.descriptions.text0015,
  model: Messages.src.providers.completion.descriptions.text0016,
  texture: Messages.src.providers.completion.descriptions.text0017,
  component: Messages.src.providers.completion.descriptions.text0018,
  attribute: Messages.src.providers.completion.descriptions.text0019,
  enchantment: Messages.src.providers.completion.descriptions.text0020,
  effect: Messages.src.providers.completion.descriptions.text0021,
  sound: Messages.src.providers.completion.descriptions.text0022,
  "sound-file": Messages.src.providers.completion.descriptions.text0023,
  particle: Messages.src.providers.completion.descriptions.text0024,
  "entity-type": Messages.src.providers.completion.descriptions.text0025,
  potion: Messages.src.providers.completion.descriptions.text0026,
  "damage-type": Messages.src.providers.completion.descriptions.text0027,
  "function-type": Messages.src.providers.completion.descriptions.text0028,
  "condition-type": Messages.src.providers.completion.descriptions.text0029,
  "item-model-type": Messages.src.providers.completion.descriptions.text0030,
  registry: Messages.src.providers.completion.descriptions.text0031,
  "tooltip-style": Messages.src.providers.completion.descriptions.text0032,
  "jukebox-song": Messages.src.providers.completion.descriptions.text0033,
  "loot-id": Messages.src.providers.completion.descriptions.text0034,
  template: Messages.src.providers.completion.descriptions.text0035,
  item: Messages.src.providers.completion.descriptions.text0036,
  block: Messages.src.providers.completion.descriptions.text0037,
  entity: Messages.src.providers.completion.descriptions.text0038,
  action: Messages.src.providers.completion.descriptions.text0039,
  condition: Messages.src.providers.completion.descriptions.text0040,
  "model-type": Messages.src.providers.completion.descriptions.text0041,
};

const WORDS: Readonly<Record<string, string>> = {
  additions: Messages.src.providers.completion.descriptions.text0042,
  ambient: Messages.src.providers.completion.descriptions.text0043,
  angry: Messages.src.providers.completion.descriptions.text0044,
  attack: Messages.src.providers.completion.descriptions.text0045,
  basalt: Messages.src.providers.completion.descriptions.text0046,
  block: Messages.src.providers.completion.descriptions.text0047,
  break: Messages.src.providers.completion.descriptions.text0048,
  bubble: Messages.src.providers.completion.descriptions.text0049,
  campfire: Messages.src.providers.completion.descriptions.text0050,
  charge: Messages.src.providers.completion.descriptions.text0051,
  click: Messages.src.providers.completion.descriptions.text0052,
  close: Messages.src.providers.completion.descriptions.text0053,
  cloud: Messages.src.providers.completion.descriptions.text0054,
  complete: Messages.src.providers.completion.descriptions.text0055,
  crit: Messages.src.providers.completion.descriptions.text0056,
  damage: Messages.src.providers.completion.descriptions.text0057,
  death: Messages.src.providers.completion.descriptions.text0058,
  destroy: Messages.src.providers.completion.descriptions.text0059,
  drip: Messages.src.providers.completion.descriptions.text0060,
  dripping: Messages.src.providers.completion.descriptions.text0061,
  eat: Messages.src.providers.completion.descriptions.text0062,
  effect: Messages.src.providers.completion.descriptions.text0063,
  entity: Messages.src.providers.completion.descriptions.text0064,
  equip: Messages.src.providers.completion.descriptions.text0065,
  explosion: Messages.src.providers.completion.descriptions.text0066,
  fall: Messages.src.providers.completion.descriptions.text0067,
  fire: Messages.src.providers.completion.descriptions.text0068,
  flame: Messages.src.providers.completion.descriptions.text0069,
  forest: Messages.src.providers.completion.descriptions.text0070,
  generic: Messages.src.providers.completion.descriptions.text0071,
  hit: Messages.src.providers.completion.descriptions.text0072,
  hurt: Messages.src.providers.completion.descriptions.text0073,
  item: Messages.src.providers.completion.descriptions.text0074,
  lava: Messages.src.providers.completion.descriptions.text0075,
  leaves: Messages.src.providers.completion.descriptions.text0076,
  loop: Messages.src.providers.completion.descriptions.text0077,
  magic: Messages.src.providers.completion.descriptions.text0078,
  mood: Messages.src.providers.completion.descriptions.text0079,
  music: Messages.src.providers.completion.descriptions.text0080,
  nether: Messages.src.providers.completion.descriptions.text0081,
  open: Messages.src.providers.completion.descriptions.text0082,
  particle: Messages.src.providers.completion.descriptions.text0083,
  pickup: Messages.src.providers.completion.descriptions.text0084,
  place: Messages.src.providers.completion.descriptions.text0085,
  player: Messages.src.providers.completion.descriptions.text0086,
  pop: Messages.src.providers.completion.descriptions.text0087,
  rare: Messages.src.providers.completion.descriptions.text0088,
  shoot: Messages.src.providers.completion.descriptions.text0089,
  smoke: Messages.src.providers.completion.descriptions.text0090,
  soul: Messages.src.providers.completion.descriptions.text0091,
  splash: Messages.src.providers.completion.descriptions.text0092,
  step: Messages.src.providers.completion.descriptions.text0093,
  swim: Messages.src.providers.completion.descriptions.text0094,
  throw: Messages.src.providers.completion.descriptions.text0095,
  ui: Messages.src.providers.completion.descriptions.text0096,
  underwater: Messages.src.providers.completion.descriptions.text0097,
  use: Messages.src.providers.completion.descriptions.text0098,
  villager: Messages.src.providers.completion.descriptions.text0099,
  warped: Messages.src.providers.completion.descriptions.text0100,
  water: Messages.src.providers.completion.descriptions.text0101,
  weather: Messages.src.providers.completion.descriptions.text0102,
};

const SOUND_ACTIONS: Readonly<Record<string, string>> = {
  additions: Messages.src.providers.completion.descriptions.text0103,
  ambient: Messages.src.providers.completion.descriptions.text0104,
  break: Messages.src.providers.completion.descriptions.text0105,
  charge: Messages.src.providers.completion.descriptions.text0106,
  click: Messages.src.providers.completion.descriptions.text0107,
  close: Messages.src.providers.completion.descriptions.text0108,
  death: Messages.src.providers.completion.descriptions.text0109,
  drink: Messages.src.providers.completion.descriptions.text0110,
  eat: Messages.src.providers.completion.descriptions.text0111,
  equip: Messages.src.providers.completion.descriptions.text0112,
  fall: Messages.src.providers.completion.descriptions.text0113,
  hit: Messages.src.providers.completion.descriptions.text0114,
  hurt: Messages.src.providers.completion.descriptions.text0115,
  loop: Messages.src.providers.completion.descriptions.text0116,
  mood: Messages.src.providers.completion.descriptions.text0117,
  open: Messages.src.providers.completion.descriptions.text0118,
  pickup: Messages.src.providers.completion.descriptions.text0119,
  place: Messages.src.providers.completion.descriptions.text0120,
  shoot: Messages.src.providers.completion.descriptions.text0121,
  step: Messages.src.providers.completion.descriptions.text0122,
  swim: Messages.src.providers.completion.descriptions.text0123,
  throw: Messages.src.providers.completion.descriptions.text0124,
  use: Messages.src.providers.completion.descriptions.text0125,
};

const DISCRIMINATOR_DETAILS = {
  function: discriminatorDetails("function"),
  condition: discriminatorDetails("condition"),
  "item-model": discriminatorDetails("item-model"),
} as const;

export class CompletionDescriptionCatalog {
  private readonly itemModelsToNames: ReadonlyMap<string, string>;
  private zhCn: Readonly<Record<string, string>>;

  public constructor(
    private readonly vanilla: VanillaCatalog,
    zhCn: Readonly<Record<string, string>>,
  ) {
    this.zhCn = zhCn;
    const names = new Map<string, string>();
    for (const item of vanilla.items) {
      if (!names.has(item.itemModel)) names.set(item.itemModel, item.name);
    }
    this.itemModelsToNames = names;
  }

  public updateTranslations(zhCn: Readonly<Record<string, string>>): void {
    this.zhCn = zhCn;
  }

  public describe(
    kind: CompletionDescriptionKind,
    identifier: string,
    options: CompletionDescriptionOptions = {},
  ): CompletionDescription {
    let normalizedKind: CompletionDescriptionKind;
    switch (kind) {
      case "action":
        normalizedKind = "function-type";
        break;
      case "condition":
        normalizedKind = "condition-type";
        break;
      case "model-type":
        normalizedKind = "item-model-type";
        break;
      case "registry": {
        const registry = options.registry;
        if (!registry) {
          normalizedKind = kind;
          break;
        }
        switch (asIdentifier(registry)) {
          case "minecraft:item":
            normalizedKind = "item";
            break;
          case "minecraft:block":
            normalizedKind = "block";
            break;
          case "minecraft:entity_type":
            normalizedKind = "entity-type";
            break;
          case "minecraft:attribute":
            normalizedKind = "attribute";
            break;
          case "minecraft:mob_effect":
            normalizedKind = "effect";
            break;
          case "minecraft:enchantment":
            normalizedKind = "enchantment";
            break;
          case "minecraft:data_component_type":
            normalizedKind = "component";
            break;
          case "minecraft:sound_event":
            normalizedKind = "sound";
            break;
          case "minecraft:particle_type":
            normalizedKind = "particle";
            break;
          case "minecraft:potion":
            normalizedKind = "potion";
            break;
          case "minecraft:damage_type":
            normalizedKind = "damage-type";
            break;
          default:
            normalizedKind = kind;
        }
        break;
      }
      default:
        normalizedKind = kind;
    }
    const schemaDetail = options.field?.valueDetails?.[identifier];
    if (schemaDetail)
      return this.schemaDescription(normalizedKind, identifier, schemaDetail);

    if (normalizedKind === "function-type") {
      return this.schemaDescription(
        normalizedKind,
        identifier,
        DISCRIMINATOR_DETAILS.function[identifier],
      );
    }
    if (normalizedKind === "condition-type") {
      const detail =
        DISCRIMINATOR_DETAILS.condition[identifier] ??
        DISCRIMINATOR_DETAILS.condition[
          identifier.startsWith("!") ? identifier.slice(1) : identifier
        ];
      return this.schemaDescription(
        normalizedKind,
        identifier,
        identifier.startsWith("!") && detail
          ? Messages.src.providers.completion.descriptions.text0126(detail)
          : detail,
      );
    }
    if (normalizedKind === "item-model-type") {
      return this.schemaDescription(
        normalizedKind,
        identifier,
        DISCRIMINATOR_DETAILS["item-model"][identifier],
      );
    }
    if (normalizedKind === "component") {
      const detail = dataComponentDefinition(asIdentifier(identifier))?.detail;
      if (detail)
        return this.schemaDescription(normalizedKind, identifier, detail);
    }

    const translated = this.translatedName(normalizedKind, identifier);
    if (translated) {
      return {
        detail: `${translated.name} · ${KIND_LABELS[normalizedKind]}`,
        documentation: Messages.src.providers.completion.descriptions.text0156(
          identifier,
          translated.name,
          KIND_LABELS[normalizedKind],
        ),
        source: translated.key ? "official-translation" : "derived",
        ...(translated.key === undefined
          ? {}
          : { translationKey: translated.key }),
      };
    }

    return this.derivedDescription(normalizedKind, identifier, options.field);
  }

  public describeSchemaValue(
    field: SchemaField,
    identifier: string,
  ): CompletionDescription {
    return this.describe(field.valueProvider ?? "registry", identifier, {
      field,
      ...(field.registry === undefined ? {} : { registry: field.registry }),
    });
  }

  private schemaDescription(
    kind: CompletionDescriptionKind,
    identifier: string,
    semantic: string | undefined,
  ): CompletionDescription {
    const actual =
      semantic && HAN.test(semantic)
        ? semantic
        : Messages.src.providers.completion.descriptions.text0127(
            identifier,
            KIND_LABELS[kind],
          );
    return {
      detail: `${actual} · ${KIND_LABELS[kind]}`,
      documentation: Messages.src.providers.completion.descriptions.text0128(
        identifier,
        actual,
      ),
      source: semantic ? "schema" : "derived",
    };
  }

  private translatedName(
    kind: CompletionDescriptionKind,
    identifier: string,
  ): TranslatedName | undefined {
    const id = asIdentifier(identifier);
    const [namespace, path] = splitResourceIdentifier(id);
    if (namespace !== "minecraft") return undefined;

    if (kind === "item" || kind === "material" || kind === "item-id") {
      const catalogName = this.vanilla.itemsById.get(id)?.name;
      if (catalogName)
        return { name: catalogName, key: `item.${namespace}.${path}` };
      return this.firstTranslation([
        `item.${namespace}.${path}`,
        `block.${namespace}.${path}`,
      ]);
    }
    if (kind === "block" || kind === "block-id") {
      const direct = this.firstTranslation([
        `block.${namespace}.${path}`,
        `item.${namespace}.${path}`,
      ]);
      if (direct) return direct;
      if (path.endsWith("_wall_banner")) {
        const base = path.replace(/_wall_banner$/u, "_banner");
        const banner = this.firstTranslation([
          `block.${namespace}.${base}`,
          `item.${namespace}.${base}`,
        ]);
        if (banner)
          return {
            name: Messages.src.providers.completion.descriptions.text0129(
              banner.name,
            ),
            ...(banner.key === undefined ? {} : { key: banner.key }),
          };
      }
      return undefined;
    }
    if (kind === "entity" || kind === "entity-type") {
      return this.firstTranslation([`entity.${namespace}.${path}`]);
    }
    if (kind === "effect")
      return this.firstTranslation([`effect.${namespace}.${path}`]);
    if (kind === "enchantment")
      return this.firstTranslation([`enchantment.${namespace}.${path}`]);
    if (kind === "jukebox-song") {
      const key = `jukebox_song.${namespace}.${path}`;
      return this.zhCn[key] ? { name: this.zhCn[key], key } : undefined;
    }
    if (kind === "attribute") {
      return this.firstTranslation([
        `attribute.name.${path}`,
        `attribute.name.generic.${path}`,
        `attribute.name.player.${path}`,
      ]);
    }
    if (kind === "potion") return this.potionName(path);
    if (kind === "damage-type") return this.damageTypeName(path);
    if (kind === "sound") return this.soundName(path);
    if (kind === "particle") return undefined;
    if (kind === "item-model") {
      const name = this.itemModelsToNames.get(id);
      if (name)
        return {
          name: Messages.src.providers.completion.descriptions.text0130(name),
        };
      return this.modelResourceName(
        path,
        Messages.src.providers.completion.descriptions.text0131,
      );
    }
    if (kind === "model")
      return this.modelResourceName(
        path,
        Messages.src.providers.completion.descriptions.text0132,
      );
    if (kind === "texture")
      return this.modelResourceName(
        path.replace(/\.png$/iu, ""),
        Messages.src.providers.completion.descriptions.text0133,
      );
    return undefined;
  }

  private modelResourceName(
    path: string,
    resourceLabel: string,
  ): TranslatedName | undefined {
    const [folder, ...rest] = path.split("/");
    const value = rest.join("/");
    if (!value) return undefined;
    const translation =
      folder === "block"
        ? this.firstTranslation([
            `block.minecraft.${value}`,
            `item.minecraft.${value}`,
          ])
        : folder === "item"
          ? this.firstTranslation([
              `item.minecraft.${value}`,
              `block.minecraft.${value}`,
            ])
          : undefined;
    return translation
      ? {
          name: Messages.src.providers.completion.descriptions.text0134(
            translation.name,
            resourceLabel,
          ),
          ...(translation.key === undefined ? {} : { key: translation.key }),
        }
      : undefined;
  }

  private potionName(path: string): TranslatedName | undefined {
    const base = path.replace(/^(?:strong|long)_/u, "");
    const translation = this.firstTranslation([
      `item.minecraft.potion.effect.${base}`,
      `item.minecraft.tipped_arrow.effect.${base}`,
    ]);
    if (!translation) return undefined;
    return {
      name: Messages.src.providers.completion.descriptions.text0137(
        path.startsWith("strong_")
          ? Messages.src.providers.completion.descriptions.text0135
          : path.startsWith("long_")
            ? Messages.src.providers.completion.descriptions.text0136
            : "",
        translation.name
          .replace(
            new RegExp(
              `^${Messages.src.providers.completion.descriptions.text0160}|${Messages.src.providers.completion.descriptions.text0161}`,
              "u",
            ),
            "",
          )
          .replace(
            new RegExp(
              `${Messages.src.providers.completion.descriptions.text0160}$`,
              "u",
            ),
            "",
          ) || translation.name,
      ),
      ...(translation.key === undefined ? {} : { key: translation.key }),
    };
  }

  private damageTypeName(path: string): TranslatedName | undefined {
    const keyPath = path.replace(/_([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    );
    const translation = this.firstTranslation([
      `death.attack.${keyPath}`,
      `death.attack.${keyPath}.message`,
      `death.attack.${path}`,
    ]);
    if (!translation) return undefined;
    return {
      name: Messages.src.providers.completion.descriptions.text0139(
        translation.name
          .replace(
            /%\d+\$s/gu,
            Messages.src.providers.completion.descriptions.text0138,
          )
          .replace(/<[^>]+>/gu, "")
          .trim(),
      ),
      ...(translation.key === undefined ? {} : { key: translation.key }),
    };
  }

  private soundName(path: string): TranslatedName | undefined {
    const subtitle = this.firstTranslation([`subtitles.${path}`]);
    if (subtitle) return subtitle;

    const parts = path.split(".");
    const category = parts[0] ?? "";
    const action = parts.at(-1) ?? "";
    const actionName =
      SOUND_ACTIONS[action] ??
      Messages.src.providers.completion.descriptions.text0140(
        humanizeWords(action),
      );
    if (category === "block" && parts.length >= 3) {
      const subject = parts.slice(1, -1).join("_");
      return {
        name: `${
          this.firstTranslation([
            `block.minecraft.${subject}`,
            `item.minecraft.${subject}`,
          ])?.name ?? humanizeWords(subject)
        }${actionName}`,
      };
    }
    if (category === "entity" && parts.length >= 3) {
      const subject = parts[1] ?? "";
      const remainder = parts.slice(2).join("_");
      return {
        name: Messages.src.providers.completion.descriptions.text0141(
          this.firstTranslation([`entity.minecraft.${subject}`])?.name ??
            humanizeWords(subject),
          SOUND_ACTIONS[remainder] ?? humanizeWords(remainder),
        ),
      };
    }
    if (category === "item" && parts.length >= 3) {
      const subject = parts.slice(1, -1).join("_");
      return {
        name: Messages.src.providers.completion.descriptions.text0142(
          this.firstTranslation([
            `item.minecraft.${subject}`,
            `block.minecraft.${subject}`,
          ])?.name ?? humanizeWords(subject),
          actionName,
        ),
      };
    }
    return {
      name: Messages.src.providers.completion.descriptions.text0143(
        humanizeWords(path.replaceAll(".", "_")),
      ),
    };
  }

  private firstTranslation(
    keys: readonly string[],
  ): TranslatedName | undefined {
    for (const key of keys) {
      const name = this.zhCn[key];
      if (name && HAN.test(name)) return { name, key };
    }
    return undefined;
  }

  private derivedDescription(
    kind: CompletionDescriptionKind,
    identifier: string,
    field: SchemaField | undefined,
  ): CompletionDescription {
    const semantic =
      (field?.detail && HAN.test(field.detail) ? field.detail : undefined) ??
      `${humanizeWords(splitResourceIdentifier(asIdentifier(identifier))[1].replaceAll("/", "_").replaceAll(".", "_"))}${KIND_LABELS[kind]}`;
    return {
      detail: `${semantic} · ${KIND_LABELS[kind]}`,
      documentation: Messages.src.providers.completion.descriptions.text0144(
        identifier,
        semantic,
      ),
      source: "derived",
    };
  }
}

function discriminatorDetails(
  kind: "function" | "condition" | "item-model",
): Readonly<Record<string, string>> {
  return (
    fieldsForDiscriminator(kind, undefined).find(
      (candidate) => candidate.label === "type",
    )?.valueDetails ?? {}
  );
}

function asIdentifier(identifier: string): string {
  return identifier.includes(":") ? identifier : `minecraft:${identifier}`;
}

function humanizeWords(value: string): string {
  const result = value
    .split(/[_./-]+/u)
    .filter(Boolean)
    .map((word) => WORDS[word] ?? `“${word}”`)
    .join("");
  return HAN.test(result)
    ? result
    : Messages.src.providers.completion.descriptions.text0157(value);
}
