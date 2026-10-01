import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fieldsForDiscriminator } from "../config/item/schema.js";
import type { ConfigurationSource, PackSource } from "../config/model.js";
import { localRegistryDiscriminator } from "../config/registry/discriminators.js";
import type { CoreIssue, TextRange } from "../diagnostics/model.js";
import { Messages } from "../messages.js";
import {
  configValueAt,
  normalizeConfigPathSegment,
} from "../util/configPath.js";
import { canonicalPath, isPathInside } from "../util/paths.js";
import { isRecord } from "../util/records.js";

const BLUEPRINT_EXTENSION = ".bbmodel";
const SCRIPT_EXTENSION = ".js";
const LIST_INDEX = /^\d+$/u;
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/gu;

  // 这些键下面的同名项只是普通数据, 不是 blueprint 引用
const OPAQUE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  "data",
  "client_bound_data",
  "override_data",
  "nbt",
  "components",
  "component",
  "tags",
]);

  // blueprint 只出现在模型 / 外观 / 变体定义里
const MODEL_CONTAINER_SEGMENTS: ReadonlySet<string> = new Set([
  "model",
  "models",
  "appearance",
  "appearances",
  "variant",
  "variants",
  "legacy_model",
]);

  // 与 blueprint 并列的模型键, 用来确认父级确实是模型定义
const MODEL_SIBLING_KEYS: readonly string[] = [
  "path",
  "model",
  "models",
  "texture",
  "textures",
  "generation",
  "base",
  "tints",
  "transformation",
  "elements",
  "hitboxes",
];

const BLUEPRINT_FIELDS: ReadonlySet<string> = new Set(["blueprint"]);

  // FurnitureVariantDefinition 同时接受这三个键
const FURNITURE_BLUEPRINT_FIELDS: ReadonlySet<string> = new Set([
  "blueprint",
  "better_model",
  "model_engine",
]);

  // js function / condition 的字段名取自 schema, 避免和配置字段脱节
function jsScriptFieldNames(): ReadonlySet<string> {
  const names = new Set<string>(["script"]);
  for (const field of [
    ...fieldsForDiscriminator("function", "js"),
    ...fieldsForDiscriminator("condition", "js"),
  ]) {
    if (field.semantic !== "script") continue;
    for (const name of [field.label, ...field.aliases])
      names.add(fieldKeyPart(name));
  }
  return names;
}

const JS_SCRIPT_FIELDS = jsScriptFieldNames();

export interface PackScriptFile {
  readonly id: string;
  readonly namespace: string;
  readonly value: string;
  readonly path: string;
  readonly pack: PackSource;
}

export interface ScriptCatalog {
  readonly files: readonly PackScriptFile[];
  readonly byId: ReadonlyMap<string, PackScriptFile>;
  readonly byPath: ReadonlyMap<string, PackScriptFile>;
  // 枚举失败的脚本根 canonical 路径, 见 scanScriptFiles
  readonly incompleteRoots: readonly string[];
}

export function emptyScriptCatalog(): ScriptCatalog {
  return {
    files: [],
    byId: new Map(),
    byPath: new Map(),
    incompleteRoots: [],
  };
}

interface DirectoryScan<T> {
  readonly files: T;
  // readdir 失败 (IO 错误 / 权限 / 路径不是目录) 时为 true, 这时的结果不代表
  // 目录的真实内容, 上层不能当成 "枚举成功且目录里没有文件"
  readonly failed: boolean;
}

async function listScriptFiles(
  root: string,
): Promise<DirectoryScan<string[]>> {
  const result: string[] = [];
  let failed = false;
  const visit = async (folder: string): Promise<void> => {
    let entries: Array<{
      readonly name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = await fs.readdir(folder, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      failed = true;
      return;
    }
    for (const entry of entries) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(SCRIPT_EXTENSION))
        result.push(target);
    }
  };
  await visit(root);
  return { files: result, failed };
}

  // 与 CE ScriptManagerImpl 一致: 脚本 id 由包 namespace 与 script 目录内的
  // 相对路径 (去掉 .js) 组成, 重复 id 先到先得; 裸名表按相对路径写入并覆盖,
  // 同名脚本取最后加载的那个
  // 枚举失败的根不写缓存 (漏掉的脚本会被判成不存在), 只记进 incompleteRoots
export async function scanScriptFiles(
  packs: readonly PackSource[],
): Promise<ScriptCatalog> {
  const files: PackScriptFile[] = [];
  const byId = new Map<string, PackScriptFile>();
  const byPath = new Map<string, PackScriptFile>();
  const incompleteRoots: string[] = [];
  const scanned = new Set<string>();
  const ordered = [...packs].sort(
    (left, right) => left.loadOrder - right.loadOrder,
  );
  for (const pack of ordered) {
    const root = pack.scriptRoot;
    if (!pack.active || root === undefined) continue;
    const key = `${pack.namespace}\u0000${canonicalPath(root)}`;
    if (scanned.has(key)) continue;
    scanned.add(key);
    const listing = await listScriptFiles(root);
    if (listing.failed) {
      incompleteRoots.push(canonicalPath(root));
      continue;
    }
    for (const filePath of listing.files.sort()) {
      const relative = path
        .relative(root, filePath)
        .split(path.sep)
        .join("/")
        .slice(0, -SCRIPT_EXTENSION.length);
      if (!relative) continue;
      const id = `${pack.namespace}:${relative}`;
      if (byId.has(id)) continue;
      const entry: PackScriptFile = {
        id,
        namespace: pack.namespace,
        value: relative,
        path: filePath,
        pack,
      };
      files.push(entry);
      byId.set(id, entry);
      byPath.set(relative, entry);
    }
  }
  return { files, byId, byPath, incompleteRoots };
}

export interface PackReferenceDefinition {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly source: ConfigurationSource;
}

interface PackPathReferenceBase {
  readonly uri: string;
  readonly filePath: string;
  readonly range: TextRange;
  readonly value: string;
  readonly pack: PackSource;
  // 模板 / 工厂展开出来的取值可能是别处生成的, 只用于跳转, 不参与诊断
  readonly generated: boolean;
}

export type BlueprintReference = PackPathReferenceBase;
export type ScriptReference = PackPathReferenceBase;

  // 配置键可能带 "#类型" 后缀或写成连字符, 比较前都要归一
function fieldKeyPart(name: string): string {
  const separator = name.indexOf("#");
  return normalizeConfigPathSegment(
    separator < 0 ? name : name.slice(0, separator),
  );
}

function compactPath(segments: readonly string[]): readonly string[] {
  return segments
    .map(fieldKeyPart)
    .filter((segment) => !LIST_INDEX.test(segment));
}

function referenceValue(
  definition: PackReferenceDefinition,
  segments: readonly string[],
): string | undefined {
  const raw = configValueAt(definition.raw, segments);
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  // 模板变量与生成出来的取值无法确定, 不参与解析
  if (!value || value.includes("${")) return undefined;
  return value;
}

  // 取值可能在列表元素上 (blueprint.0), 索引段只是数组下标, 不是字段名
function namedSegmentIndex(segments: readonly string[]): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment === undefined || LIST_INDEX.test(segment)) continue;
    return index;
  }
  return -1;
}

interface FieldValuePath {
  readonly segments: readonly string[];
  // 去掉索引段后的路径; 最后一段是字段名
  readonly compact: readonly string[];
  // 字段名所在段, 取值是列表元素时还有索引段跟在它后面
  readonly nameIndex: number;
}

interface FieldMatcher {
  // 在原串上做的段级粗筛, 不分配新串
  readonly screen: RegExp;
  readonly names: ReadonlySet<string>;
}

function fieldMatcher(fields: ReadonlySet<string>): FieldMatcher {
  const alternatives = [...fields].map((field) =>
    field.replace(REGEXP_SPECIALS, "\\$&").replaceAll("_", "[-_]"),
  );
  return {
    // 段名后面允许跟 "#类型" 后缀或列表下标, 归一化与判定留给后面
    screen: new RegExp(
      `(?:^|\\.)(?:${alternatives.join("|")})(?=[.#]|$)`,
      "u",
    ),
    names: fields,
  };
}

const BLUEPRINT_MATCHER = fieldMatcher(BLUEPRINT_FIELDS);
const FURNITURE_BLUEPRINT_MATCHER = fieldMatcher(FURNITURE_BLUEPRINT_FIELDS);
const JS_SCRIPT_MATCHER = fieldMatcher(JS_SCRIPT_FIELDS);

function blueprintPathAllowed(
  definition: PackReferenceDefinition,
  path: FieldValuePath,
): boolean {
  const head = path.compact.slice(0, -1);
  if (head.some((segment) => OPAQUE_PATH_SEGMENTS.has(segment))) return false;
  if (head.length === 0) return true;
  if (head.some((segment) => MODEL_CONTAINER_SEGMENTS.has(segment))) return true;
  const parent = configValueAt(
    definition.raw,
    path.segments.slice(0, path.nameIndex),
  );
  return (
    isRecord(parent) &&
    MODEL_SIBLING_KEYS.some((key) => parent[key] !== undefined)
  );
}

function pushReference(
  references: PackPathReferenceBase[],
  seen: Set<string>,
  definition: PackReferenceDefinition,
  range: TextRange,
  value: string,
): void {
  const filePath = fileURLToPath(definition.source.uri);
  const key = `${definition.source.uri}:${range.start}:${range.end}:${value}`;
  if (seen.has(key)) return;
  seen.add(key);
  references.push({
    uri: definition.source.uri,
    filePath,
    range,
    value,
    pack: definition.source.pack,
    generated: definition.source.kind !== "direct",
  });
}

function collectFields(
  definitions: readonly PackReferenceDefinition[],
  matcher: FieldMatcher,
  accept: (
    definition: PackReferenceDefinition,
    path: FieldValuePath,
  ) => boolean,
): readonly PackPathReferenceBase[] {
  const references: PackPathReferenceBase[] = [];
  const seen = new Set<string>();
  for (const definition of definitions)
    for (const [fieldPath, range] of definition.source.fieldValueRanges) {
      // 先按原串粗筛, 绝大多数字段在这里就被排掉, 不做 split 与归一化
      if (!matcher.screen.test(fieldPath)) continue;
      const segments = fieldPath.split(".");
      const nameIndex = namedSegmentIndex(segments);
      if (nameIndex < 0) continue;
      const rawName = segments[nameIndex];
      if (rawName === undefined || !matcher.names.has(fieldKeyPart(rawName)))
        continue;
      const path: FieldValuePath = {
        segments,
        compact: compactPath(segments),
        nameIndex,
      };
      if (!accept(definition, path)) continue;
      const value = referenceValue(definition, segments);
      if (value === undefined) continue;
      pushReference(references, seen, definition, range, value);
    }
  return references;
}

export function collectBlueprintReferences(input: {
  readonly items: readonly PackReferenceDefinition[];
  readonly blocks: readonly PackReferenceDefinition[];
  readonly furniture: readonly PackReferenceDefinition[];
}): readonly BlueprintReference[] {
  return [
    ...collectFields(input.items, BLUEPRINT_MATCHER, blueprintPathAllowed),
    ...collectFields(input.blocks, BLUEPRINT_MATCHER, blueprintPathAllowed),
    ...collectFields(
      input.furniture,
      FURNITURE_BLUEPRINT_MATCHER,
      blueprintPathAllowed,
    ),
  ];
}

function jsConditionOrFunction(
  definition: PackReferenceDefinition,
  path: FieldValuePath,
): boolean {
  const owner = configValueAt(
    definition.raw,
    path.segments.slice(0, path.nameIndex),
  );
  if (!isRecord(owner)) return false;
  const type = owner.type;
  return (
    typeof type === "string" &&
    localRegistryDiscriminator(type, "craftengine") === "js"
  );
}

export function collectScriptReferences(
  definitions: readonly PackReferenceDefinition[],
): readonly ScriptReference[] {
  return collectFields(definitions, JS_SCRIPT_MATCHER, jsConditionOrFunction);
}

export interface BlueprintCatalog {
  // blueprint 根 canonical 路径 -> 根内所有 .bbmodel 的相对路径
  readonly files: ReadonlyMap<string, ReadonlySet<string>>;
  // 包目录 canonical 路径 -> 该目录的基础包, 供子包回退查找 blueprint 根
  readonly basePackOf: ReadonlyMap<string, PackSource>;
  // 枚举失败的 blueprint 根 canonical 路径, 这些根刻意不写进 files, 见 scanBlueprintFiles
  readonly incompleteRoots: readonly string[];
}

export function emptyBlueprintCatalog(): BlueprintCatalog {
  return { files: new Map(), basePackOf: new Map(), incompleteRoots: [] };
}

function relativeBlueprintKey(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^(?:\.\/)+/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function listBlueprintFiles(
  root: string,
): Promise<DirectoryScan<Set<string>>> {
  const files = new Set<string>();
  let failed = false;
  const visit = async (folder: string): Promise<void> => {
    let entries: Array<{
      readonly name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;
    try {
      entries = await fs.readdir(folder, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      failed = true;
      return;
    }
    for (const entry of entries) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(BLUEPRINT_EXTENSION))
        files.add(relativeBlueprintKey(path.relative(root, target)));
    }
  };
  await visit(root);
  return { files, failed };
}

  // 重建时按 blueprint 根一次性枚举目录并缓存, 之后的存在性判断都走内存查表
  // 枚举失败的根不写缓存, 查找方会退回磁盘判断, 同时由 incompleteRoots 报给上层
export async function scanBlueprintFiles(
  packs: readonly PackSource[],
): Promise<BlueprintCatalog> {
  const files = new Map<string, ReadonlySet<string>>();
  const basePackOf = new Map<string, PackSource>();
  const incompleteRoots: string[] = [];
  for (const pack of packs) {
    if (pack.subpack !== undefined) continue;
    const folder = canonicalPath(pack.folder);
    if (!basePackOf.has(folder)) basePackOf.set(folder, pack);
  }
  for (const pack of packs) {
    const root = pack.blueprintRoot;
    if (root === undefined) continue;
    const key = canonicalPath(root);
    if (files.has(key) || incompleteRoots.includes(key)) continue;
    const listing = await listBlueprintFiles(root);
    if (listing.failed) {
      incompleteRoots.push(key);
      continue;
    }
    files.set(key, listing.files);
  }
  return { files, basePackOf, incompleteRoots };
}

  // 配置文件所在的包决定它用哪个 blueprint 目录: 同下标的 configuration 与
  // blueprint 一一对应, 找不到对应目录时退回该包的基础 blueprint 目录
export function blueprintRootFor(
  catalog: BlueprintCatalog,
  reference: BlueprintReference,
): string | undefined {
  const owner = reference.pack;
  if (isPathInside(reference.filePath, owner.configurationRoot))
    return owner.blueprintRoot;
  const base = catalog.basePackOf.get(canonicalPath(owner.folder));
  return base?.blueprintRoot ?? owner.blueprintRoot;
}

export interface PackFileLookup {
  readonly file: string;
  readonly root: string;
  readonly exists: boolean;
}

  // 与 BBModelConverter.resolveBlueprint 一致: 值不以 .bbmodel 结尾时补上
export function blueprintFileName(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.endsWith(BLUEPRINT_EXTENSION)
    ? normalized
    : `${normalized}${BLUEPRINT_EXTENSION}`;
}

export function blueprintLookup(
  catalog: BlueprintCatalog,
  reference: BlueprintReference,
): PackFileLookup | undefined {
  const root = blueprintRootFor(catalog, reference);
  if (root === undefined) return undefined;
  const name = blueprintFileName(reference.value);
  if (path.isAbsolute(name)) {
    const file = path.normalize(name);
    return { file, root, exists: existsSync(file) };
  }
  const file = path.join(root, name);
  const files = catalog.files.get(canonicalPath(root));
  // 目录快照只覆盖 blueprint 根内部, 越出根或没枚举过 (含枚举失败的根) 时才查磁盘
  if (files === undefined || name.split("/").includes(".."))
    return { file, root, exists: existsSync(file) };
  if (!files.has(relativeBlueprintKey(name))) return { file, root, exists: false };
  // watcher 只按扩展名匹配文件, 删掉或改名目录不一定逐文件上报, 快照会留着死链接;
  // 命中的引用很少, 每个命中各付一次 stat 复核, 未命中的引用不查磁盘
  return { file, root, exists: existsSync(file) };
}

  // 与 CE ScriptManagerImpl.script 一致 (ScriptManagerImpl.java:108-116): 带冒号的值
  // 先在 Key 表 (namespace:script 目录内相对路径) 精确匹配 scripts, 查不到时继续用
  // 整串查 scriptsByName — 那张表的键是去掉命名空间的相对路径 (:228), 所以裸名与
  // 带冒号的值最后都会落到相对路径表上; 另外脚本目录内的相对路径也接受 .js 后缀
export function scriptLookup(
  catalog: ScriptCatalog,
  value: string,
): PackScriptFile | undefined {
  const normalized = value.replaceAll("\\", "/");
  const id = (normalized.endsWith(SCRIPT_EXTENSION)
    ? normalized.slice(0, -SCRIPT_EXTENSION.length)
    : normalized
  );
  if (id.includes(":")) {
    const keyed = catalog.byId.get(id);
    if (keyed !== undefined) return scriptFileIfPresent(keyed);
  }
  return scriptFileIfPresent(catalog.byPath.get(id));
}

  // 枚举快照可能停在旧状态 (删掉脚本后 watcher 不一定上报), 命中时按磁盘复核,
  // 已经不在磁盘上的脚本按不存在处理, 调用方 (诊断与跳转) 都跟着当不存在
function scriptFileIfPresent(
  file: PackScriptFile | undefined,
): PackScriptFile | undefined {
  if (file === undefined) return undefined;
  return existsSync(file.path) ? file : undefined;
}

export function scriptSearchRoots(
  packs: readonly PackSource[],
): readonly string[] {
  const roots = new Map<string, string>();
  for (const pack of [...packs].sort(
    (left, right) => left.loadOrder - right.loadOrder,
  )) {
    if (!pack.active || pack.scriptRoot === undefined) continue;
    roots.set(canonicalPath(pack.scriptRoot), pack.scriptRoot);
  }
  return [...roots.values()];
}

function scriptSearchMessage(packs: readonly PackSource[]): string {
  const roots = scriptSearchRoots(packs);
  if (roots.length === 0)
    return Messages.src.references.blueprintScript.text0003;
  if (roots.length <= 2)
    return Messages.src.references.blueprintScript.text0004(roots.join(", "));
  return Messages.src.references.blueprintScript.text0005(
    roots.slice(0, 2).join(", "),
    String(roots.length),
  );
}

export function blueprintIssues(
  references: readonly BlueprintReference[],
  catalog: BlueprintCatalog,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const seen = new Set<string>();
  // 枚举失败的根下面漏了哪些文件是未知的, 该根上的 "找不到文件" 不可信, 不输出诊断
  const incomplete = new Set(catalog.incompleteRoots);
  for (const reference of references) {
    if (reference.generated) continue;
    const key = `${reference.uri}:${reference.range.start}:${reference.range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lookup = blueprintLookup(catalog, reference);
    if (lookup === undefined || lookup.exists) continue;
    if (incomplete.has(canonicalPath(lookup.root))) continue;
    issues.push({
      code: "unresolved-blueprint",
      message: Messages.src.references.blueprintScript.text0001(
        path.basename(lookup.file),
        lookup.root,
      ),
      severity: "warning",
      uri: reference.uri,
      range: reference.range,
    });
  }
  return issues;
}

export function scriptIssues(
  references: readonly ScriptReference[],
  packs: readonly PackSource[],
  catalog: ScriptCatalog,
): readonly CoreIssue[] {
  const issues: CoreIssue[] = [];
  const seen = new Set<string>();
  const location = scriptSearchMessage(packs);
  // 枚举失败的根会漏掉脚本, 而裸名查找没法把一次缺失归到某个根上, 只要有根枚举失败,
  // "找不到脚本" 就不可信, 一律不输出
  const incomplete = catalog.incompleteRoots.length > 0;
  for (const reference of references) {
    if (reference.generated) continue;
    const key = `${reference.uri}:${reference.range.start}:${reference.range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (scriptLookup(catalog, reference.value)) continue;
    if (incomplete) continue;
    const id = reference.value.endsWith(SCRIPT_EXTENSION)
      ? reference.value.slice(0, -SCRIPT_EXTENSION.length)
      : reference.value;
    issues.push({
      code: "unresolved-script",
      message: Messages.src.references.blueprintScript.text0002(id, location),
      severity: "warning",
      uri: reference.uri,
      range: reference.range,
    });
  }
  return issues;
}
