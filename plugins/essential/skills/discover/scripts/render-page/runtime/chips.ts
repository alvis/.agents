import { dispositionOf } from "./disposition.ts";

import type { AnswerLine } from "./reply.ts";

/**
 * where down the viewport a reader is taken to be reading.
 *
 * a third of the way down rather than the top edge, because a question the
 * reader has just scrolled to sits below the edge rather than on it, and a
 * strip that follows the edge marks the question they have already finished.
 */
const READING_LINE = 0.3;

/**
 * paints the bar's strip of question chips and keeps it on the reader.
 *
 * the strip is built once and repainted in place: the chips are anchors, and
 * rebuilding them on every keystroke would drop the one under the pointer and
 * lose the keyboard from whichever the reader had reached.
 * @param strip the bar's `[data-chip-strip]` element
 * @param fields every question on the page, in reading order
 * @returns a repaint taking the same lines the drawer's summary is drawn from
 */
export function installChips(
  strip: HTMLElement,
  fields: HTMLElement[],
): (lines: AnswerLine[]) => void {
  const chips = fields.map((field) => {
    const ref = field.dataset.questionRef ?? "";
    const chip = document.createElement("a");
    chip.className = "q-chip";
    chip.setAttribute("href", `#qs-${field.dataset.questionId ?? ""}`);
    chip.textContent = ref;
    // the chip shows a citation, which is not a name. The title carries the
    // question itself for a reader who has the pointer on it, while the
    // accessible name stays the two characters the chip actually reads as
    chip.setAttribute("title", `${ref} · ${field.dataset.questionLabel ?? ""}`);

    return chip;
  });
  strip.replaceChildren(...chips);

  /** the chip currently marked as the one being read */
  let current: HTMLElement | null = null;

  /**
   * says which ends of the strip are hiding a chip.
   *
   * the fade is the only sign the strip gives that it runs past its own edge,
   * so it has to appear where a chip is actually cut off and nowhere else.
   * Drawn at both ends unconditionally it lay over the first chip from the
   * moment the page loaded, and a two-character code under a gradient reads as
   * half-drawn rather than as the start of a row.
   */
  function fade(): void {
    const room = strip.scrollWidth - strip.clientWidth;
    // a pixel of slack at each end: a scroll position the browser rounds never
    // quite reaches its own maximum, and a strip scrolled fully to one end
    // would otherwise keep fading the end the reader has already reached
    const before = strip.scrollLeft > 1;
    const after = strip.scrollLeft < room - 1;
    let cut = "none";
    if (before && after) cut = "both";
    else if (before) cut = "start";
    else if (after) cut = "end";

    strip.setAttribute("data-overflow", cut);
  }

  /**
   * brings a chip to the middle of the strip.
   *
   * measured against the two boxes rather than an offset, because the strip is
   * a scroller inside a flex bar: an offset is relative to whichever ancestor
   * happens to be positioned, and the bar's layout decides that, not this.
   * @param chip the chip to centre
   */
  function centre(chip: HTMLElement): void {
    const view = strip.getBoundingClientRect();
    const seat = chip.getBoundingClientRect();

    strip.scrollLeft += seat.left - view.left - (view.width - seat.width) / 2;
    fade();
  }

  /** marks the chip for whichever question the reader is nearest. */
  function follow(): void {
    const line = window.innerHeight * READING_LINE;
    let nearest = -1;
    let best = Infinity;
    for (const [index, field] of fields.entries()) {
      const gap = Math.abs(field.getBoundingClientRect().top - line);
      if (gap >= best) continue;

      best = gap;
      nearest = index;
    }

    const chip = chips[nearest];
    // re-centring a chip that is already the current one fights a reader who
    // has scrolled the strip by hand to look ahead
    if (!chip || chip === current) return;

    current?.removeAttribute("data-current");
    chip.setAttribute("data-current", "true");
    current = chip;
    centre(chip);
  }

  window.addEventListener("scroll", follow, { passive: true });
  // the strip is scrolled by the reader as well as by follow(), and a resize
  // changes how much of it fits without either one happening
  strip.addEventListener("scroll", fade, { passive: true });
  window.addEventListener("resize", fade);
  follow();
  fade();

  return (lines) => {
    for (const [index, line] of lines.entries())
      chips[index]?.setAttribute("data-status", dispositionOf(line));
  };
}
