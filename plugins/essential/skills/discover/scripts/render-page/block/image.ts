import { escapeHtml } from "../escape.ts";
import { slugOf } from "../id.ts";
import { RenderError } from "../error.ts";
import { isSvgPath } from "../reference.ts";
import { optionalString, requireString } from "../validate.ts";

import { pinFrame, renderPins } from "./pin.ts";
import { fileOf, inlineSvg } from "./svg.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/**
 * draws a picture the board carries inside itself.
 *
 * an SVG arrives as markup and is inlined as markup — smaller than base64 and
 * themeable, so its own text picks up the page's tokens. Anything else arrives
 * as a data URL the CLI layer already encoded. Either way the board stays one
 * file: there is no path left in the output for a reader's browser to fetch.
 * @param block the image block as the author wrote it
 * @param path JSON path of the block, named verbatim by every refusal
 * @param page the files the CLI layer already read, keyed by `src`
 * @returns the figure's HTML
 */
export function renderImage(
  block: Extract<Block, { type: "image" }>,
  path: string,
  page: PageContext,
): string {
  const title = optionalString(block.title, `${path}.title`);
  const src = requireString(block.src, `${path}.src`);
  const alt = requireString(block.alt, `${path}.alt`);
  const caption = optionalString(block.caption, `${path}.caption`);
  const body = fileOf(page, src, `${path}.src`);
  const slug = slugOf(path, "im");

  let picture: string;
  if (isSvgPath(src)) {
    const markup = inlineSvg(body, src, `${path}.src`);
    picture = `<div class="image-drawing" role="img" aria-label="${escapeHtml(alt)}">${markup}</div>`;
  } else {
    if (!body.startsWith("data:"))
      throw new RenderError(
        `${path}.src: ${JSON.stringify(src)} was handed to the renderer as something other than a data URL, so it would leave a path in the page for a reader's browser to fetch`,
      );
    picture = `<img class="image-shot" src="${escapeHtml(body)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
  }

  const { layer, cards } = renderPins(block.pins ?? [], `${path}.pins`, slug);

  return [
    `<figure class="image-figure" id="${slug}">`,
    title ? `<h3 class="diagram-title" id="${slug}-title">${escapeHtml(title)}</h3>` : "",
    pinFrame(picture, layer),
    cards,
    caption ? `<figcaption class="image-caption">${escapeHtml(caption)}</figcaption>` : "",
    `</figure>`,
  ].join("");
}
