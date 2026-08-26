/**
 * escapes text for interpolation into HTML element content or an attribute
 * @param value raw author-supplied text
 * @returns the same text with every HTML-significant character escaped
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
