import { promises as fs } from "node:fs";

export function pngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function readPngDataUrl(filePath: string): Promise<string> {
  return pngDataUrl(await fs.readFile(filePath));
}
