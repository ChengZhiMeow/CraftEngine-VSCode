import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputRoot = path.join(workspace, "target");
const bundle = path.join(outputRoot, "offline-assets-builder.cjs");
await mkdir(outputRoot, { recursive: true });
try {
  await build({
    entryPoints: [
      path.join(workspace, "src", "minecraft", "assets", "offlineCli.ts"),
    ],
    outfile: bundle,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
  });
  const result = spawnSync(
    process.execPath,
    [bundle, ...process.argv.slice(2)],
    { cwd: workspace, stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(bundle, { force: true });
}
