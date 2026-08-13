import type { BlockDefinition } from "../config/block/model.js";
import type { CoreIssue, TextRange } from "../diagnostics/model.js";
import { Messages } from "../messages.js";
import type { VanillaCatalog } from "../minecraft/catalog.js";
import { blockResourceReferences } from "../references/configuration.js";
import { makeIdentifier } from "../util/identifiers.js";
import { canonicalPath } from "../util/paths.js";
import { isRecord } from "../util/records.js";
import { collectBlockGeneratedModels } from "./blockGeneration.js";
import { preferredResource, readResourceTextInfo } from "./catalog.js";
import type { ResourceFileCatalog } from "./model.js";

function issue(
  block: BlockDefinition,
  range: TextRange,
  code: string,
  message: string,
  severity: CoreIssue["severity"] = "error",
): CoreIssue {
  return { code, message, severity, uri: block.source.uri, range };
}

function exists(
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog,
  block: BlockDefinition,
  kind: "texture" | "model",
  id: string,
): boolean {
  if (preferredResource(resources, block.source.pack.resourcesRoot, kind, id))
    return true;
  return kind === "texture" ? vanilla.textures.has(id) : vanilla.models.has(id);
}

async function validateModel(
  block: BlockDefinition,
  modelId: string,
  range: TextRange,
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog,
  generated: ReadonlyMap<string, unknown>,
  issues: CoreIssue[],
  visiting: readonly string[] = [],
): Promise<void> {
  if (vanilla.models.has(modelId) || generated.has(modelId)) return;
  if (visiting.includes(modelId)) {
    issues.push(
      issue(
        block,
        range,
        "block-model-parent-cycle",
        Messages.src.resources.block.text0001(
          [...visiting, modelId].join(" → "),
        ),
      ),
    );
    return;
  }
  const file = preferredResource(
    resources,
    block.source.pack.resourcesRoot,
    "model",
    modelId,
  );
  if (!file) return;
  let value: unknown;
  try {
    const resourceText = await readResourceTextInfo(file);
    if (resourceText.hasUtf8Bom) {
      issues.push(
        issue(
          block,
          range,
          "utf8-bom",
          Messages.src.resources.block.text0002(modelId),
          "warning",
        ),
      );
    }
    value = JSON.parse(resourceText.text) as unknown;
  } catch {
    issues.push(
      issue(
        block,
        range,
        "invalid-block-model-json",
        Messages.src.resources.block.text0003(modelId),
      ),
    );
    return;
  }
  if (!isRecord(value)) {
    issues.push(
      issue(
        block,
        range,
        "invalid-block-model-json",
        Messages.src.resources.block.text0004(modelId),
      ),
    );
    return;
  }
  if (isRecord(value.textures)) {
    for (const rawTexture of Object.values(value.textures)) {
      if (typeof rawTexture !== "string" || rawTexture.startsWith("#"))
        continue;
      const texture = makeIdentifier(rawTexture, "minecraft");
      if (!exists(resources, vanilla, block, "texture", texture)) {
        issues.push(
          issue(
            block,
            range,
            "missing-block-model-texture",
            Messages.src.resources.block.text0005(modelId, texture),
          ),
        );
      }
    }
  }
  if (typeof value.parent !== "string" || value.parent.startsWith("builtin/"))
    return;
  const parent = makeIdentifier(value.parent, "minecraft");
  if (
    !exists(resources, vanilla, block, "model", parent) &&
    !generated.has(parent)
  ) {
    issues.push(
      issue(
        block,
        range,
        "missing-block-model-parent",
        Messages.src.resources.block.text0006(modelId, parent),
      ),
    );
    return;
  }
  await validateModel(
    block,
    parent,
    range,
    resources,
    vanilla,
    generated,
    issues,
    [...visiting, modelId],
  );
}

export async function validateBlockResources(
  blocks: readonly BlockDefinition[],
  resources: ResourceFileCatalog,
  vanilla: VanillaCatalog | undefined,
  includeInactive: boolean,
): Promise<readonly CoreIssue[]> {
  if (!vanilla) return [];
  const issues: CoreIssue[] = [];
  const generatedByRoot = new Map<string, Map<string, unknown>>();
  for (const block of blocks) {
    if (!includeInactive && !block.source.pack.active) continue;
    const root = canonicalPath(block.source.pack.resourcesRoot);
    const generated = generatedByRoot.get(root) ?? new Map<string, unknown>();
    collectBlockGeneratedModels(block.raw, generated);
    generatedByRoot.set(root, generated);
  }
  for (const block of blocks) {
    if (!includeInactive && !block.source.pack.active) continue;
    const generated =
      generatedByRoot.get(canonicalPath(block.source.pack.resourcesRoot)) ??
      new Map<string, unknown>();
    for (const reference of blockResourceReferences([block])) {
      const id = makeIdentifier(reference.identifier, "minecraft");
      if (reference.kind === "texture") {
        if (!exists(resources, vanilla, block, "texture", id)) {
          issues.push(
            issue(
              block,
              reference.range,
              "missing-block-texture",
              Messages.src.resources.block.text0007(id),
            ),
          );
        }
        continue;
      }
      if (
        !exists(resources, vanilla, block, "model", id) &&
        !generated.has(id)
      ) {
        issues.push(
          issue(
            block,
            reference.range,
            "missing-block-model",
            Messages.src.resources.block.text0008(id),
          ),
        );
        continue;
      }
      await validateModel(
        block,
        id,
        reference.range,
        resources,
        vanilla,
        generated,
        issues,
      );
    }
  }
  return issues;
}
