import { escapeHtml } from "../escape.ts";
import { requireFreshId } from "../id.ts";
import { requireFilledArray, requireString } from "../validate.ts";

import type { PageIds } from "../id.ts";
import type { Block } from "../types.ts";

/**
 * draws the two controls that reorder an item without a pointer.
 *
 * a drag handle is the whole affordance in most implementations, and a reader
 * who cannot drag is then shown a list they can read but never answer. These
 * buttons are the same capability offered plainly, and they are what a touch
 * reader uses too — a long-press drag on a phone fights the page's own scroll.
 * @param label the item's text, so each button names what it moves
 * @returns the pair as HTML
 */
function moves(label: string): string {
  const named = escapeHtml(label);

  return `<span class="probe-moves"><button type="button" class="probe-move" data-probe-move="up" aria-label="Move ${named} earlier">↑</button><button type="button" class="probe-move" data-probe-move="down" aria-label="Move ${named} later">↓</button></span>`;
}

/**
 * draws an ordering probe: a list the reader ranks by dragging or by key.
 *
 * the authored order is the page's own proposal, and the reply reports the
 * reader's order only once it differs from it — a list left as drawn is not an
 * answer, and reporting it as one would put a ranking nobody made into the
 * reply.
 * @param block the probe block
 * @param path JSON path of `block`, named verbatim by any refusal
 * @param ids every id the page has claimed, extended in place
 * @returns the probe as HTML
 */
export function renderProbe(
  block: Extract<Block, { type: "probe" }>,
  path: string,
  ids: PageIds,
): string {
  const id = requireFreshId(block.id, path, "probe", ids);
  const label = requireString(block.label, `${path}.label`);
  const items = requireFilledArray<unknown>(block.items, `${path}.items`).map(
    (item, index) => ({
      // the id is the authored position, not the text: two items reading the
      // same would otherwise share one saved slot and collapse into one
      key: `${id}-${index}`,
      text: requireString(item, `${path}.items[${index}]`),
    }),
  );

  const list = items
    .map(
      ({ key, text }) =>
        `<li class="probe-item" data-probe-item="${escapeHtml(key)}" data-probe-label="${escapeHtml(text)}" draggable="true" tabindex="0"><span class="probe-text">${escapeHtml(text)}</span>${moves(text)}</li>`,
    )
    .join("");

  return `<div class="probe" data-probe data-probe-id="${escapeHtml(id)}" data-probe-label="${escapeHtml(label)}"><p class="probe-title">${escapeHtml(label)}</p><p class="probe-hint">Drag an item, or focus one and press the arrow keys, to reorder.</p><ol class="probe-list">${list}</ol></div>`;
}
