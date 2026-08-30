import { RenderError } from "../error.ts";
import { escapeHtml } from "../escape.ts";
import { readBoards } from "../set.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/**
 * draws the hub's index of every board the run produced.
 *
 * the block carries no data of its own: the labels, hrefs and blurbs live in
 * the run's set file, which is also what every other board's sidebar list is
 * drawn from. Authoring them twice is how a hub comes to name a board that
 * was renamed or a board that no longer exists.
 * @param block the boards block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param page what the block is rendered into, carrying the run's boards
 * @returns the index as HTML
 */
export function renderBoards(
  block: Extract<Block, { type: "boards" }>,
  path: string,
  page: PageContext,
): string {
  // a hub is an index and nothing else, so a hub with no run behind it is a
  // page with no content — worth refusing by name rather than rendering as an
  // empty list the author has to work backwards from
  if (!page.set)
    throw new RenderError(
      `${path}: a boards block indexes the run this board belongs to, and this board was rendered on its own; render it with a set file so there are boards to index`,
    );
  // unlike the sidebar list, this one draws at any size: it is the page's
  // content rather than a way of leaving it
  const cards = readBoards(page.set, "set")
    .map(({ id, label, href, blurb }) => {
      const current = id === page.id;

      // the whole card is the link, not the heading sitting on it: a reader
      // aiming at a card aims at the box they can see, and a blurb that is not
      // part of the target is a strip of dead space through the middle of it
      return `<li><a class="board-card" data-board-link="${escapeHtml(id)}" href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ""}><span class="board-card-name">${escapeHtml(label)}</span>${blurb ? `<span class="board-card-blurb">${escapeHtml(blurb)}</span>` : ""}</a></li>`;
    })
    .join("");

  return `<ul class="board-index">${cards}</ul>`;
}
