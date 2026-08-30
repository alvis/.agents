import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import { readMarkup, writeMarkup } from "../markup.ts";
import { optionalString, requireString } from "../validate.ts";

import { cleanDrawing } from "./drawing.ts";
import { pinFrame, renderPins } from "./pin.ts";

import type { PageContext } from "../context.ts";
import type { MarkupNode } from "../markup.ts";
import type { Block } from "../types.ts";

/**
 * names what a reader found sitting beside the drawing.
 * @param node the node that should not have been there
 * @returns a short description for the refusal
 */
function describe(node: MarkupNode): string {
  if (node.kind !== "tag") return `the text ${JSON.stringify(node.text.trim().slice(0, 30))}`;

  return `${/^[aeiou]/i.test(node.name) ? "an" : "a"} <${node.name}> element`;
}

/**
 * checks hand-authored markup and returns it ready to inline.
 *
 * shared by the `svg` block and by an `image` block whose file is an SVG,
 * because both put the same bytes into the page as markup and so both face the
 * same question: inlined SVG is same-origin markup, not an isolated image, so
 * anything executable inside it would be the page's problem.
 *
 * The drawing is parsed, judged, and written back out rather than scanned and
 * passed through. A scan can only ever describe the bytes; three separate ways
 * past one were found in a single read of the previous version, all of them the
 * same mistake — an attribute the parser sees and the pattern does not, a
 * character reference the parser resolves and the pattern does not, and markup
 * after the drawing that the check never looked at. What goes into the page now
 * is built from what was judged, so there is nothing left for those to be a gap
 * between.
 * @param markup the file's contents, as read by the CLI layer
 * @param src the path the author wrote, named verbatim by every refusal
 * @param path JSON path of the block naming it
 * @returns the drawing, rebuilt and safe to inline
 */
export function inlineSvg(markup: string, src: string, path: string): string {
  const refuse = (because: string): never => {
    throw new RenderError(`${path}: ${JSON.stringify(src)} ${because}`);
  };
  const [root, ...beside] = readMarkup(markup, refuse).filter(
    (node) => node.kind === "tag" || node.text.trim() !== "",
  );
  if (root?.kind !== "tag" || root.name.toLowerCase() !== "svg")
    refuse(
      "does not begin with an <svg> element, so it is not a drawing this can inline",
    );
  // a document is one drawing, so anything after the root is markup the author
  // put where nothing checked it — which is how an <iframe> holding an escaped
  // <script> reached the page verbatim
  if (beside.length)
    refuse(
      `carries ${describe(beside[0])} after its </svg>, and an inlined drawing is one element with nothing beside it`,
    );

  return writeMarkup(cleanDrawing([root], refuse));
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
