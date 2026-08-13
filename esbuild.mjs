import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const webOnly = process.argv.includes("--web-only");
const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "target/dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  // 优先使用模块入口, 否则配置解析库无法合成单个文件
  mainFields: ["module", "main"],
  sourcemap: watch ? true : "external",
};

const webviewOptions = {
  alias: {
    "@craftengine/host/entity-dimensions":
      "./src/generated/minecraft26_2EntityDimensions.ts",
    "@craftengine/host/texture-animation":
      "./src/minecraft/texture/animation.ts",
  },
  entryPoints: {
    "image-preview": "src/render/image/preview.ts",
    "item-preview": "src/render/item/preview.ts",
    "sound-preview": "src/render/sound/preview.ts",
    "furniture-preview": "src/render/furniture/preview.ts",
  },
  bundle: true,
  outdir: "target/dist",
  format: "iife",
  platform: "browser",
  target: "chrome124",
  sourcemap: watch ? true : "external",
};

const buildOptions = webOnly
  ? [webviewOptions]
  : [extensionOptions, webviewOptions];

if (!webOnly) await rm("target/dist", { recursive: true, force: true });

if (watch) {
  const contexts = await Promise.all(
    buildOptions.map((options) => esbuild.context(options)),
  );

  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(buildOptions.map((options) => esbuild.build(options)));
}
