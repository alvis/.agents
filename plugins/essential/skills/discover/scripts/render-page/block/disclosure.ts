import { escapeHtml } from "../escape.ts";
import { requireFilledArray, requireString } from "../validate.ts";

import type { Block } from "../types.ts";

/**
 * draws content the reader opens for themselves.
 *
 * a native `<details>`, so it opens with no runtime at all, prints open on a
 * browser that expands them, and is already what a screen reader announces as
 * a disclosure. Its contents are whole blocks rather than text, because the
 * thing worth folding away is usually a table or an excerpt, not a sentence.
 * the inner blocks are drawn by the caller rather than by an import, because
 * the dispatcher already draws every block type and importing it back here
 * would put the two modules in a cycle for the sake of one call.
 * @param block the disclosure block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param draw how a held block is drawn
 * @returns the disclosure as HTML
 */
export function renderDisclosure(
  block: Extract<Block, { type: "disclosure" }>,
  path: string,
  draw: (block: Block, path: string) => string,
): string {
  const summary = requireString(block.summary, `${path}.summary`);
  const inner = requireFilledArray<Block>(block.blocks, `${path}.blocks`)
    .map((held, index) => draw(held, `${path}.blocks[${index}]`))
    .join("");

  return `<details class="disclosure"${block.open ? " open" : ""}><summary>${escapeHtml(summary)}</summary><div class="disclosure-body">${inner}</div></details>`;
}
