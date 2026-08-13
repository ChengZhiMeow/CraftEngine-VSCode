export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function nonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 32 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

export function previewStatusPage(
  title: string,
  heading: string,
  message: string,
  footerStyleHref: string,
  footer: string,
): string {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${escapeHtml(footerStyleHref)}"><style>
    html,body{height:100%;margin:0;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font:13px/1.5 var(--vscode-font-family)}
    body{display:flex;flex-direction:column}.editor-preview-status-page{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center}.editor-preview-status-page h2{margin:0 0 8px;font-size:16px}.editor-preview-status-page p{margin:0;color:var(--vscode-descriptionForeground)}
  </style></head><body><main class="editor-preview-status-page"><section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(message)}</p></section></main>${footer}</body></html>`;
}
