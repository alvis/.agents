import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import { optionalString, requireString } from "../validate.ts";

import { pinFrame, renderPins } from "./pin.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/** what disqualifies markup from being inlined, and why it is refused. */
const REFUSALS: { pattern: RegExp; because: string }[] = [
  {
    pattern: /<script[\s>]/i,
    because: "carries a <script>, which would run with the page's own origin",
  },
  {
    pattern: /\son\w+\s*=/i,
    because: "carries an inline event handler, which would run with the page's own origin",
  },
  {
    pattern: /<foreignObject[\s>]/i,
    because: "carries a <foreignObject>, which can hold arbitrary markup the rest of these checks do not see",
  },
  {
    pattern: /(?:href|src)\s*=\s*["']?\s*(?:https?:|\/\/)/i,
    because: "references something over the network, and a board must render with no requests at all",
  },
];

/**
 * checks hand-authored markup and returns it ready to inline.
 *
 * shared by the `svg` block and by an `image` block whose file is an SVG,
 * because both put the same bytes into the page as markup and so both face the
 * same question: inlined SVG is same-origin markup, not an isolated image, so
 * anything executable inside it would be the page's problem.
 * @param markup the file's contents, as read by the CLI layer
 * @param src the path the author wrote, named verbatim by every refusal
 * @param path JSON path of the block naming it
 * @returns the markup, trimmed and safe to inline
 */
export function inlineSvg(markup: string, src: string, path: string): string {
  if (!/^\s*(?:<\?xml[^>]*\?>\s*|<!DOCTYPE[^>]*>\s*|<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(markup))
    throw new RenderError(
      `${path}: ${JSON.stringify(src)} does not begin with an <svg> element, so it is not a drawing this can inline`,
    );
  for (const { pattern, because } of REFUSALS)
    if (pattern.test(markup))
      throw new RenderError(`${path}: ${JSON.stringify(src)} ${because}`);

  return markup.trim();
}

/**
 * looks up a file the CLI layer was meant to have read.
 * @param page the files the CLI layer already read, keyed by `src`
 * @param src the path the author wrote
 * @param path JSON path of the block naming it
 * @returns the file's contents
 */
export function fileOf(page: PageContext, src: string, path: string): string {
  const body = page.files[src];
  if (body === undefined)
    throw new RenderError(
      `${path}: no file was read for ${JSON.stringify(src)}; the CLI layer resolves every src before rendering, so this block was rendered from data it was not given`,
    );

  return body;
}

/**
 * inlines a hand-authored SVG as markup.
 *
 * as markup rather than a data URL, so its text inherits the page's tokens,
 * stays selectable, and can be read by a screen reader.
 * @param block the svg block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @param page the files the CLI layer already read, keyed by `src`
 * @returns the figure's HTML, with the drawing inlined
 */
export function renderSvg(
  block: Extract<Block, { type: "svg" }>,
  path: string,
  page: PageContext,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const src = requireString(block.src, `${path}.src`);
  const alt = requireString(block.alt, `${path}.alt`);
  const markup = inlineSvg(fileOf(page, src, `${path}.src`), src, `${path}.src`);
  const slug = slugOf(path, "sv");
  const { layer, cards } = renderPins(block.pins ?? [], `${path}.pins`, slug);
  const label = title
    ? ` aria-labelledby="${slug}-title"`
    : ` aria-label="${escapeHtml(alt)}"`;

  return [
    `<figure class="svg-figure" id="${slug}"${label}>`,
    title ? `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>` : "",
    pinFrame(
      `<div class="svg-frame" role="img" aria-label="${escapeHtml(alt)}">${markup}</div>`,
      layer,
    ),
    cards,
    `</figure>`,
  ].join("");
}
