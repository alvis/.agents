import { renderInline } from "../inline.ts";
import { syncAttribute } from "../sync.ts";
import {
  requireArray,
  requireObject,
  requirePercent,
} from "../validate.ts";

import type { Pin } from "../types.ts";

/** what a figure needs to draw its pins and their cards. */
export interface PinnedFigure {
  /** the pins, in the order they are numbered */
  layer: string;
  /** the cards each pin describes */
  cards: string;
}

/**
 * draws an author's numbered pins and the cards they point at.
 *
 * there is deliberately no leader line. A line to a pin in the *interior* of a
 * picture cannot reach it without crossing the picture it annotates, which
 * would cover the very thing being explained; the shared number and the
 * synchronized highlight carry the same relationship without that cost. This
 * is the ruled design, not a stopgap.
 *
 * the layer sits beside the picture rather than around the cards, so a pin's
 * percentage always means a position within the picture; the cards are the
 * picture's sibling, so a pin can never land on one.
 * @param pins the author-supplied pins
 * @param path JSON path of `pins`, named verbatim by any refusal
 * @param slug the figure's own id, which every pin's key is scoped by
 * @returns the layer and the cards, or empty strings when there are no pins
 */
export function renderPins(
  pins: unknown,
  path: string,
  slug: string,
): PinnedFigure {
  const held = requireArray<Pin>(pins, path);
  if (!held.length) return { layer: "", cards: "" };

  const drawn = held.map((pin, index) => {
    const at = `${path}[${index}]`;
    requireObject<Pin>(pin, at);
    const number = index + 1;
    // scoped by the figure, so two annotated pictures on one page do not both
    // claim pin 1 and light each other's cards
    const tie = syncAttribute("pin", `${slug}:${String(number)}`);
    const id = `${slug}-pin-${String(number)}`;
    const x = requirePercent(pin.x, `${at}.x`);
    const y = requirePercent(pin.y, `${at}.y`);

    return {
      pin: `<button type="button" class="pin"${tie} style="--pin-x:${String(x)}%;--pin-y:${String(y)}%" aria-describedby="${id}">${String(number)}</button>`,
      card: `<li class="pin-note" id="${id}"${tie} data-pin="${String(number)}">${renderInline(pin.text, `${at}.text`)}</li>`,
    };
  });

  return {
    layer: `<div class="pin-layer" aria-hidden="false">${drawn.map((one) => one.pin).join("")}</div>`,
    cards: `<ol class="pin-notes">${drawn.map((one) => one.card).join("")}</ol>`,
  };
}

/**
 * wraps a picture so its pins can be positioned against it
 * @param picture the picture's own HTML
 * @param layer the pin layer, or an empty string when there are no pins
 * @returns the picture, framed only when it carries pins
 */
export function pinFrame(picture: string, layer: string): string {
  if (!layer) return picture;

  return `<div class="pin-frame">${picture}${layer}</div>`;
}
