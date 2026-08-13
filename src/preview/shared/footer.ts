import { escapeHtml } from "./html.js";

import { Messages } from "../../messages.js";
export function editorPreviewFooter(extensionVersion: string): string {
  return Messages.src.preview.shared.footer.text0001(
    escapeHtml(extensionVersion),
  );
}
