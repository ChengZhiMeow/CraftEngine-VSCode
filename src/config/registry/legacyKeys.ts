export interface LegacyKeyRule {
  readonly path: string;
  readonly removedIn: number;
  readonly replacement?: string;
}

// CraftEngine 26.9.2 的 config.yml 版本, 与 files/standalone.ts 的 COMMANDS_CONFIG_VERSION 同步
export const CURRENT_CONFIG_VERSION = 114;

// CraftEngine 历史上存在、之后被删掉的键: 文件声明版本低于 removedIn 时,
// 这些键在当时合法, 不再按「未知字段」报错。
// removedIn 取「已知第一个不再读取该键的 config_version」(由 D:\Projects\craft-engine 的
// git show <ref>:<file> 在各版本快照上夹逼得到, 见每条注释里的 ref), 因此中间未发布版本
// 的写法可能偏严, 但不会把新版写错的键放行。
// path 按原配置里的写法 (比较时会把 `-` 归一成 `_`), 资源段的 path 只要命中字段路径结尾即可。
export const LEGACY_KEYS: readonly LegacyKeyRule[] = [
  // config.yml: 战利品配置整段删除, 实体来源改名 entity.id-sources
  // 26.7 (config 82) 仍在读 (Config.java:667), 26.8 (config 90) 起无
  { path: "loot", removedIn: 90, replacement: "entity.id-sources" },
  // config.yml: 资源包 zip 输出路径改由工作流的 zip 步骤指定
  // 26.8 (90) 仍在读 (Config.java:430), cd30c02a1 删除
  {
    path: "resource-pack.path",
    removedIn: 96,
    replacement: "resource-pack.workflows.<name>.steps[type=zip].path",
  },
  // config.yml: 校验改由工作流的 validate 步骤触发; 92246810b (96) 后删除
  {
    path: "resource-pack.validation.enable",
    removedIn: 97,
    replacement: "resource-pack.workflows.<name>.steps[type=validate]",
  },
  // config.yml: 优化总开关删除, 只剩 texture / json 两级; 92246810b (96) 后删除
  {
    path: "resource-pack.optimization.enable",
    removedIn: 97,
    replacement: "resource-pack.optimization.texture.enable",
  },
  // config.yml: 地图插件兼容项已删除; 4c813520f (96) 后无
  { path: "resource-pack.map-plugin-compatibility", removedIn: 97 },
  // config.yml: 保护开关改由工作流 zip 步骤的 protection 指定; 4c813520f (96) 后无
  {
    path: "resource-pack.protection.unprotected-copy",
    removedIn: 97,
    replacement: "resource-pack.workflows.<name>.steps[type=zip].protection",
  },
  // config.yml: 自动上传改由工作流的 upload 步骤完成; 0280070b0 (95) 后 cd30c02a1 删除
  {
    path: "resource-pack.delivery.auto-upload",
    removedIn: 96,
    replacement: "resource-pack.workflows.<name>.steps[type=upload]",
  },
  // config.yml: 上传后重发改由工作流的 send_pack 步骤完成; 4c813520f (96) 后无
  {
    path: "resource-pack.delivery.resend-on-upload",
    removedIn: 97,
    replacement: "resource-pack.workflows.<name>.steps[type=send_pack]",
  },
  // config.yml: 待上传文件改由工作流 upload 步骤的 path 指定; 0280070b0 (95) 后 cd30c02a1 删除
  {
    path: "resource-pack.delivery.file-to-upload",
    removedIn: 96,
    replacement: "resource-pack.workflows.<name>.steps[type=upload].path",
  },
  // config.yml: 托管设置改到 self-host 与 packs; 26.8 (90) 仍在读 (AbstractPackManager.java:296)
  {
    path: "resource-pack.delivery.hosting",
    removedIn: 96,
    replacement: "resource-pack.self-host",
  },
  // config.yml: 物品编解码优化项已删除; e85a721c1 (107) 仍在读, 108 起无
  { path: "network.optimize-item-codec", removedIn: 108 },
  // config.yml: 实体名称拦截并入 entity-data; e85a721c1 (107) 仍在读
  {
    path: "network.intercept-packets.entity-name",
    removedIn: 108,
    replacement: "network.intercept-packets.entity-data",
  },
  // config.yml: 盔甲架拦截并入 entity-data; e85a721c1 (107) 仍在读
  {
    path: "network.intercept-packets.armor-stand",
    removedIn: 108,
    replacement: "network.intercept-packets.entity-data",
  },
  // config.yml: 文本展示实体拦截并入 entity-data; e85a721c1 (107) 仍在读
  {
    path: "network.intercept-packets.text-display",
    removedIn: 108,
    replacement: "network.intercept-packets.entity-data",
  },
  // 资源段: 条件 random 的持久随机组改用 id; 26.7 (82) 仍在读 (RandomCondition.java:40)
  { path: "use_last", removedIn: 90, replacement: "id" },
  // 资源段: 物品根级跳过混淆改由资源包配置的 bypass-item-models 指定;
  // 26.8 (90) 仍在读 (AbstractItemManager.java:504), fc3fc9687 (96) 后删除
  {
    path: "skip_obfuscation",
    removedIn: 97,
    replacement: "resource-pack.protection.obfuscation.bypass-item-models",
  },
  // config.yml: 反序列化组件缓存整段删除; 26.9 (109) 默认配置里还有 cache.json-to-component,
  // 26.9.2 (114) 的 Config.java 已无读取点
  { path: "cache", removedIn: 114 },
];

function normalizedKeyPath(path: string): string {
  return path.replaceAll("-", "_");
}

// 命中规则的条件: configVersion 早于该键被删除的版本。
// configVersion 为 undefined 时按当前版本处理, 等于不做任何放宽。
// 路径按「段序列」匹配: 命中结尾 (资源段的字段路径带条目 ID 前缀) 或中间段
// (config.yml 的旧段下面还有子键) 都算, 但不做同前缀匹配 (hosting2 不会命中 hosting)。
export function legacyKeyAccepted(
  fieldPath: string,
  configVersion: number | undefined,
): boolean {
  const version = configVersion ?? CURRENT_CONFIG_VERSION;
  const normalized = `.${normalizedKeyPath(fieldPath)}.`;
  for (const rule of LEGACY_KEYS) {
    if (version >= rule.removedIn) continue;
    if (normalized.includes(`.${normalizedKeyPath(rule.path)}.`)) return true;
  }
  return false;
}
