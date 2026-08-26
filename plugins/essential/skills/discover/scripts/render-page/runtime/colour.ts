/**
 * resolves a CSS colour to `#rrggbb`.
 *
 * the page's tokens are authored in `oklch`, and Mermaid's theme variables are
 * handed to a library that parses colours itself and does not understand it.
 * Reading the value back off a canvas context does not help — a context hands
 * back what it was given, not what it resolved. So the colour is painted and
 * the pixel is read, which is the only place the browser has actually done the
 * conversion.
 * @param value any colour the browser can parse, including `oklch()`
 * @returns the colour as a hex triple, or `#000000` when it cannot be painted
 */
export function toHex(value: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "#000000";
  // the fill starts opaque and is overpainted, so a token the browser cannot
  // parse leaves the sentinel behind rather than the previous token's colour
  context.fillStyle = "#000000";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * reads a custom property off an element and resolves it to hex
 * @param root the element the tokens hang off
 * @param token the custom property's name, including its leading dashes
 * @returns the resolved colour
 */
export function tokenHex(root: Element, token: string): string {
  return toHex(getComputedStyle(root).getPropertyValue(token).trim());
}
