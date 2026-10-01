import type { SchemaContext, SchemaField } from "../schema/types.js";

import { Messages } from "../../messages.js";
export const COMMANDS_CONFIG_VERSION = "114";
export const TRANSLATION_LANG_VERSION = 83;
  // CraftEngine 只把"版本不等于当前"的文件拿去自动升级(Config.java:329-331),
  // 旧版本号的文件本身仍然可用, 所以校验放行扩展支持过的整段版本区间
export const LEGACY_CONFIG_VERSION = "82";
export const LEGACY_LANG_VERSION = 62;

function versionRange(from: number, to: number): readonly string[] {
  const values: string[] = [];
  for (let version = from; version <= to; version += 1)
    values.push(String(version));
  return values;
}

export const SUPPORTED_CONFIG_VERSIONS: ReadonlySet<string> = new Set(
  versionRange(Number(LEGACY_CONFIG_VERSION), Number(COMMANDS_CONFIG_VERSION)),
);
export const SUPPORTED_LANG_VERSIONS: ReadonlySet<string> = new Set(
  versionRange(LEGACY_LANG_VERSION, TRANSLATION_LANG_VERSION),
);
export const TRANSLATION_LIST_SEPARATOR = "<reset><newline>";

export type StandaloneFileKind = "commands" | "pack" | "translation";

export interface StandaloneFileInfo {
  readonly kind: StandaloneFileKind;
  readonly locale?: string;
}

export interface CommandFeatureDefinition {
  readonly id: string;
  readonly defaultEnabled: boolean;
  readonly defaultPermission: string;
  readonly defaultUsage: readonly string[];
}

export type StandaloneValueKind =
  | "mapping"
  | "boolean"
  | "boolean-like"
  | "number"
  | "stringifiable"
  | "string"
  | "string-list"
  | "translation-node"
  | "ignored";

export type StandaloneUnknownKeyPolicy = "fixed" | "ignored" | "arbitrary";

export interface StandaloneContextSchema {
  readonly file: StandaloneFileInfo;
  readonly fields: readonly SchemaField[];
  readonly valueKind: StandaloneValueKind;
  readonly unknownKeys: StandaloneUnknownKeyPolicy;
  readonly dynamicKey?: SchemaField;
  readonly listSeparator?: string;
}

interface SchemaFieldOptions {
  readonly snippet?: string;
  readonly valueProvider?: SchemaField["valueProvider"];
  readonly values?: readonly string[];
  readonly required?: boolean;
  readonly aliases?: readonly string[];
}

function field(
  label: string,
  detail: string,
  options: SchemaFieldOptions = {},
): SchemaField {
  return {
    label,
    semantic: label.replaceAll("-", "_").replace(/#.*$/u, ""),
    aliases: options.aliases ?? [],
    detail,
    snippet: options.snippet ?? `${label}: \${0}`,
    ...(options.valueProvider === undefined
      ? {}
      : { valueProvider: options.valueProvider }),
    ...(options.values === undefined ? {} : { values: options.values }),
    ...(options.required === undefined ? {} : { required: options.required }),
  };
}

export const COMMAND_FEATURES: readonly CommandFeatureDefinition[] = [
  {
    id: "reload",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.reload",
    defaultUsage: ["/craftengine reload", "/ce reload"],
  },
  {
    id: "pack_workflow",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.pack_workflow",
    defaultUsage: ["/craftengine workflow", "/ce workflow"],
  },
  {
    id: "send_resource_pack",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.send_resource_pack",
    defaultUsage: ["/craftengine feature send-pack", "/ce feature send-pack"],
  },
  {
    id: "get_item",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.get_item",
    defaultUsage: ["/craftengine item get", "/ce item get"],
  },
  {
    id: "give_item",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.give_item",
    defaultUsage: ["/craftengine item give", "/ce item give"],
  },
  {
    id: "clear_item",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.clear_item",
    defaultUsage: ["/craftengine item clear", "/ce item clear"],
  },
  {
    id: "item_browser_player",
    defaultEnabled: true,
    defaultPermission: "ce.command.player.item_browser",
    defaultUsage: ["/ce"],
  },
  {
    id: "item_browser_admin",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.item_browser",
    defaultUsage: ["/craftengine item browser", "/ce item browser"],
  },
  {
    id: "pack_preference_admin",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.pack_preference",
    defaultUsage: [
      "/craftengine feature pack-preference",
      "/ce feature pack-preference",
    ],
  },
  {
    id: "pack_preset_admin",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.pack_preset",
    defaultUsage: [
      "/craftengine feature pack-preset",
      "/ce feature pack-preset",
    ],
  },
  {
    id: "pack_preference_player",
    defaultEnabled: true,
    defaultPermission: "ce.command.player.pack_preference",
    defaultUsage: ["/pack"],
  },
  {
    id: "pack_preset_player",
    defaultEnabled: true,
    defaultPermission: "ce.command.player.pack_preset",
    defaultUsage: ["/pack preset"],
  },
  {
    id: "search_usage_player",
    defaultEnabled: true,
    defaultPermission: "ce.command.player.search_usage",
    defaultUsage: ["/search-usage"],
  },
  {
    id: "search_recipe_player",
    defaultEnabled: true,
    defaultPermission: "ce.command.player.search_recipe",
    defaultUsage: ["/search-recipe"],
  },
  {
    id: "search_usage_admin",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.search_usage",
    defaultUsage: ["/craftengine item search-usage", "/ce item search-usage"],
  },
  {
    id: "search_recipe_admin",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.search_recipe",
    defaultUsage: ["/craftengine item search-recipe", "/ce item search-recipe"],
  },
  {
    id: "totem_animation",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.totem_animation",
    defaultUsage: [
      "/craftengine feature totem-animation",
      "/ce feature totem-animation",
    ],
  },
  {
    id: "enchant",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.enchant",
    defaultUsage: ["/craftengine feature enchant", "/ce feature enchant"],
  },
  {
    id: "toast",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.toast",
    defaultUsage: ["/craftengine feature toast", "/ce feature toast"],
  },
  {
    id: "enable_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: ["/craftengine resource enable", "/ce resource enable"],
  },
  {
    id: "disable_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: ["/craftengine resource disable", "/ce resource disable"],
  },
  {
    id: "list_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: ["/craftengine resource list", "/ce resource list"],
  },
  {
    id: "create_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: ["/craftengine resource create", "/ce resource create"],
  },
  {
    id: "save_default_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: [
      "/craftengine resource save-default",
      "/ce resource save-default",
    ],
  },
  {
    id: "search_resource",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.resource",
    defaultUsage: [
      "/craftengine resource search",
      "/ce resource search",
    ],
  },
  {
    id: "set_locale",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.set_locale",
    defaultUsage: ["/craftengine feature locale set", "/ce feature locale set"],
  },
  {
    id: "unset_locale",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.unset_locale",
    defaultUsage: [
      "/craftengine feature locale unset",
      "/ce feature locale unset",
    ],
  },
  {
    id: "clean_cache",
    defaultEnabled: true,
    defaultPermission: "ce.command.clean_cache",
    defaultUsage: ["/craftengine clean-cache", "/ce clean-cache"],
  },
  {
    id: "set_display_entity_view_distance_scale",
    defaultEnabled: true,
    defaultPermission:
      "ce.command.admin.set_display_entity_view_distance_scale",
    defaultUsage: [
      "/craftengine feature display-entity-view-distance-scale set",
      "/ce feature display-entity-view-distance-scale set",
    ],
  },
  {
    id: "set_entity_culling_distance_scale",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.set_entity_culling_distance_scale",
    defaultUsage: [
      "/craftengine feature entity-culling-distance-scale set",
      "/ce feature entity-culling-distance-scale set",
    ],
  },
  {
    id: "toggle_entity_culling",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.toggle_entity_culling",
    defaultUsage: [
      "/craftengine feature toggle-entity-culling",
      "/ce feature toggle-entity-culling",
    ],
  },
  {
    id: "set_damage_visibility",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.set_damage_visibility",
    defaultUsage: [
      "/craftengine feature damage-visibility set",
      "/ce feature damage-visibility set",
    ],
  },
  {
    id: "place_feature",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.place_feature",
    defaultUsage: [
      "/craftengine feature place-feature",
      "/ce feature place-feature",
    ],
  },
  {
    id: "item_component_add",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.item.component.add",
    defaultUsage: [
      "/craftengine item component add",
      "/ce item component add",
    ],
  },
  {
    id: "item_component_remove",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.item.component.remove",
    defaultUsage: [
      "/craftengine item component remove",
      "/ce item component remove",
    ],
  },
  {
    id: "item_component_reset",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.item.component.reset",
    defaultUsage: [
      "/craftengine item component reset",
      "/ce item component reset",
    ],
  },
  {
    id: "migrate_world_storage",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.migrate_world_storage",
    defaultUsage: [
      "/craftengine feature migrate-world-storage",
      "/ce feature migrate-world-storage",
    ],
  },
  {
    id: "clear_world_storage",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.clear_world_storage",
    defaultUsage: [
      "/craftengine feature clear-world-storage",
      "/ce feature clear-world-storage",
    ],
  },
  {
    id: "world_settings",
    defaultEnabled: true,
    defaultPermission: "ce.command.admin.world_settings",
    defaultUsage: [
      "/craftengine feature world-settings",
      "/ce feature world-settings",
    ],
  },
  {
    id: "debug_set_block",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.setblock",
    defaultUsage: ["/craftengine debug setblock", "/ce debug setblock"],
  },
  {
    id: "debug_fill_section",
    defaultEnabled: false,
    defaultPermission: "ce.command.debug.fill_section",
    defaultUsage: [
      "/craftengine debug fill-section",
      "/ce debug fill-section",
    ],
  },
  {
    id: "debug_spawn_furniture",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.spawn_furniture",
    defaultUsage: [
      "/craftengine debug spawn-furniture",
      "/ce debug spawn-furniture",
    ],
  },
  {
    id: "debug_get_block_state_registry_id",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.get_block_state_registry_id",
    defaultUsage: [
      "/craftengine debug get-block-state-registry-id",
      "/ce debug get-block-state-registry-id",
    ],
  },
  {
    id: "debug_internal_block_state",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.internal_block_state",
    defaultUsage: [
      "/craftengine debug internal-block-state",
      "/ce debug internal-block-state",
    ],
  },
  {
    id: "debug_export_block_state_mappings",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.export_block_state_mappings",
    defaultUsage: [
      "/craftengine debug export-block-state-mappings",
      "/ce debug export-block-state-mappings",
    ],
  },
  {
    id: "debug_get_block_internal_id",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.get_block_internal_id",
    defaultUsage: [
      "/craftengine debug get-block-internal-id",
      "/ce debug get-block-internal-id",
    ],
  },
  {
    id: "debug_visual_state_usage",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.state_usage",
    defaultUsage: [
      "/craftengine debug visual-state-usage",
      "/craftengine debug appearance-state-usage",
      "/craftengine debug clientside-state-usage",
      "/ce debug visual-state-usage",
      "/ce debug appearance-state-usage",
      "/ce debug clientside-state-usage",
    ],
  },
  {
    id: "debug_auto_state_usage",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.state_usage",
    defaultUsage: [
      "/craftengine debug auto-state-usage",
      "/ce debug auto-state-usage",
    ],
  },
  {
    id: "debug_real_state_usage",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.state_usage",
    defaultUsage: [
      "/craftengine debug real-state-usage",
      "/craftengine debug serverside-state-usage",
      "/ce debug real-state-usage",
      "/ce debug serverside-state-usage",
    ],
  },
  {
    id: "debug_item_id",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.item_id",
    defaultUsage: [
      "/craftengine debug item-id",
      "/ce debug item-id",
    ],
  },
  {
    id: "debug_item_data",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.item_data",
    defaultUsage: [
      "/craftengine debug item-data",
      "/ce debug item-data",
      "/craftengine item debug",
      "/ce item debug",
    ],
  },
  {
    id: "debug_item_component",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.item_component",
    defaultUsage: [
      "/craftengine debug item-component",
      "/ce debug item-component",
    ],
  },
  {
    id: "debug_item_sources",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.item_sources",
    defaultUsage: [
      "/craftengine debug item-sources",
      "/ce debug item-sources",
    ],
  },
  {
    id: "debug_target_block",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.target_block",
    defaultUsage: ["/craftengine debug target-block", "/ce debug target-block"],
  },
  {
    id: "debug_is_section_injected",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.is_section_injected",
    defaultUsage: [
      "/craftengine debug is-section-injected",
      "/ce debug is-section-injected",
    ],
  },
  {
    id: "debug_clear_cooldown",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.clear_cooldown",
    defaultUsage: [
      "/craftengine debug clear-cooldown",
      "/ce debug clear-cooldown",
    ],
  },
  {
    id: "debug_pack_states",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.pack_states",
    defaultUsage: [
      "/craftengine debug pack-states",
      "/ce debug pack-states",
    ],
  },
  {
    id: "debug_expression",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.expression",
    defaultUsage: [
      "/craftengine debug expression",
      "/ce debug expression",
    ],
  },
  {
    id: "debug_is_chunk_persistent_loaded",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.is_chunk_persistent_loaded",
    defaultUsage: [
      "/craftengine debug is-chunk-persistent-loaded",
      "/ce debug is-chunk-persistent-loaded",
    ],
  },
  {
    id: "debug_entity_id",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.entity_id",
    defaultUsage: ["/craftengine debug entity-id", "/ce debug entity-id"],
  },
  {
    id: "debug_dimension",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.dimension",
    defaultUsage: [
      "/craftengine debug dimension",
      "/ce debug dimension",
    ],
  },
  {
    id: "debug_custom_model_data",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.custom_model_data",
    defaultUsage: [
      "/craftengine debug custom-model-data",
      "/ce debug custom-model-data",
    ],
  },
  {
    id: "debug_item_model",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.item_model",
    defaultUsage: ["/craftengine debug item-model", "/ce debug item-model"],
  },
  {
    id: "debug_image",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.image",
    defaultUsage: ["/craftengine debug image", "/ce debug image"],
  },
  {
    id: "debug_generate_internal_assets",
    defaultEnabled: false,
    defaultPermission: "ce.command.debug.generate_internal_assets",
    defaultUsage: [
      "/craftengine debug generate-internal-assets",
      "/ce debug generate-internal-assets",
    ],
  },
  {
    id: "debug_furniture",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.furniture",
    defaultUsage: ["/craftengine debug furniture", "/ce debug furniture"],
  },
  {
    id: "debug_optimize_furniture_structure",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.optimize_furniture_structure",
    defaultUsage: [
      "/craftengine debug optimize-furniture-structure",
      "/ce debug optimize-furniture-structure",
    ],
  },
  {
    id: "debug_test",
    defaultEnabled: true,
    defaultPermission: "ce.command.debug.test",
    defaultUsage: ["/craftengine debug test", "/ce debug test"],
  },
];

export const COMMAND_ROOT_FIELDS: readonly SchemaField[] = [
  field("___version___", "命令配置版本；旧版本号会被 CraftEngine 自动升级", {
    aliases: ["config-version"],
    snippet: `___version___: "${COMMANDS_CONFIG_VERSION}"`,
    values: [COMMANDS_CONFIG_VERSION, LEGACY_CONFIG_VERSION],
  }),
  ...COMMAND_FEATURES.map((feature) =>
    field(
      feature.id,
      Messages.src.config.files.standalone.text0002(
        feature.defaultPermission,
        feature.defaultUsage.length,
      ),
      {
        snippet: `${feature.id}:\n  enable: ${feature.defaultEnabled}\n  permission: ${feature.defaultPermission}\n  usage:\n${feature.defaultUsage.map((entry) => `    - ${entry}`).join("\n")}`,
      },
    ),
  ),
];

export const PACK_ROOT_FIELDS: readonly SchemaField[] = [
  field("enable", Messages.src.config.files.standalone.text0006, {
    snippet: "enable: ${0|true,false|}",
    valueProvider: "boolean",
    values: ["true", "false"],
  }),
  field("namespace", Messages.src.config.files.standalone.text0007),
  field("description", Messages.src.config.files.standalone.text0008),
  field("version", Messages.src.config.files.standalone.text0009, {
    snippet: 'version: "${0:1.0.0}"',
  }),
  field("author", Messages.src.config.files.standalone.text0010),
  field("subpacks", Messages.src.config.files.standalone.text0011, {
    snippet: "subpacks:\n  ${1:modern}: ${0|true,false|}",
  }),
];

export const TRANSLATION_ROOT_FIELDS: readonly SchemaField[] = [
  field("lang-version", Messages.src.config.files.standalone.text0012, {
    snippet: `lang-version: ${TRANSLATION_LANG_VERSION}`,
    valueProvider: "number",
    values: [String(TRANSLATION_LANG_VERSION)],
  }),
];

export const TRANSLATION_DYNAMIC_FIELD: SchemaField = field(
  "<translation-key>",
  Messages.src.config.files.standalone.text0013(TRANSLATION_LIST_SEPARATOR),
  { snippet: "${1:translation.key}: ${0}" },
);

export function standaloneFileInfo(
  filePath: string,
): StandaloneFileInfo | undefined {
  const parts = filePath
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part.length > 0);
  const fileName = parts.at(-1);
  if (fileName === undefined) return undefined;

  if (
    parts.at(-2) === "translations" &&
    fileName.endsWith(".yml") &&
    fileName.length > ".yml".length
  ) {
    if (parts.slice(0, parts.length - 2).includes("configuration"))
      return undefined;
    return { kind: "translation", locale: fileName.slice(0, -".yml".length) };
  }
  if (fileName === "commands.yml") return { kind: "commands" };
  if (fileName === "pack.yml") return { kind: "pack" };
  return undefined;
}

export function standaloneSchemaForContext(
  filePath: string,
  context: SchemaContext,
): StandaloneContextSchema | undefined {
  const file = standaloneFileInfo(filePath);
  if (file === undefined) return undefined;
  const path = context.path;
  switch (file.kind) {
    case "commands": {
      if (path.length === 0)
        return {
          file,
          fields: COMMAND_ROOT_FIELDS,
          valueKind: "mapping",
          unknownKeys: "ignored",
        };
      if (path[0] === "___version___")
        return { file, fields: [], valueKind: "string", unknownKeys: "fixed" };

      const feature = COMMAND_FEATURES.find(
        (candidate) => candidate.id === (path[0] ?? ""),
      );
      if (feature === undefined)
        return {
          file,
          fields: [],
          valueKind: "ignored",
          unknownKeys: "ignored",
        };
      if (path.length === 1)
        return {
          file,
          fields: [
            field("enable", Messages.src.config.files.standalone.text0003, {
              snippet: `enable: ${feature.defaultEnabled}`,
              valueProvider: "boolean",
              values: ["true", "false"],
            }),
            field("permission", Messages.src.config.files.standalone.text0004, {
              snippet: `permission: ${feature.defaultPermission}`,
            }),
            field("usage", Messages.src.config.files.standalone.text0005, {
              snippet: `usage:\n${feature.defaultUsage.map((entry) => `  - ${entry}`).join("\n")}`,
            }),
          ],
          valueKind: "mapping",
          unknownKeys: "ignored",
        };
      switch (path[1]) {
        case "enable":
          return {
            file,
            fields: [],
            valueKind: "boolean",
            unknownKeys: "fixed",
          };
        case "permission":
          return {
            file,
            fields: [],
            valueKind: "string",
            unknownKeys: "fixed",
          };
        case "usage":
          return {
            file,
            fields: [],
            valueKind: "string-list",
            unknownKeys: "fixed",
          };
        default:
          return {
            file,
            fields: [],
            valueKind: "ignored",
            unknownKeys: "ignored",
          };
      }
    }
    case "pack":
      if (path.length === 0)
        return {
          file,
          fields: PACK_ROOT_FIELDS,
          valueKind: "mapping",
          unknownKeys: "ignored",
        };
      switch (path[0]) {
        case "subpacks":
          if (path.length > 1)
            return {
              file,
              fields: [],
              valueKind: "boolean-like",
              unknownKeys: "fixed",
            };
          return {
            file,
            fields: [],
            valueKind: "mapping",
            unknownKeys: "arbitrary",
            dynamicKey: field(
              "<subpack-id>",
              Messages.src.config.files.standalone.text0014,
              {
                snippet: "${1:subpack}: ${0|true,false|}",
                valueProvider: "boolean",
                values: ["true", "false"],
              },
            ),
          };
        case "enable":
          if (path.length === 1)
            return {
              file,
              fields: [],
              valueKind: "boolean-like",
              unknownKeys: "fixed",
            };
          return {
            file,
            fields: [],
            valueKind: "ignored",
            unknownKeys: "ignored",
          };
        case "namespace":
          if (path.length === 1)
            return {
              file,
              fields: [],
              valueKind: "string",
              unknownKeys: "fixed",
            };
          return {
            file,
            fields: [],
            valueKind: "ignored",
            unknownKeys: "ignored",
          };
        case "description":
        case "version":
        case "author":
          if (path.length === 1)
            return {
              file,
              fields: [],
              valueKind: "stringifiable",
              unknownKeys: "fixed",
            };
          return {
            file,
            fields: [],
            valueKind: "ignored",
            unknownKeys: "ignored",
          };
        default:
          return {
            file,
            fields: [],
            valueKind: "ignored",
            unknownKeys: "ignored",
          };
      }
    case "translation":
      if (path.length === 1 && path[0] === "lang-version")
        return { file, fields: [], valueKind: "number", unknownKeys: "fixed" };
      return {
        file,
        fields: path.length === 0 ? TRANSLATION_ROOT_FIELDS : [],
        valueKind: path.length === 0 ? "mapping" : "translation-node",
        unknownKeys: "arbitrary",
        dynamicKey: TRANSLATION_DYNAMIC_FIELD,
        listSeparator: TRANSLATION_LIST_SEPARATOR,
      };
  }
}
