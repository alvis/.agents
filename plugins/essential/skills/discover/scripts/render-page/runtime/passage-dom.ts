import { findPassage, markPieces, offsetBefore, offsetOf } from "./passage.ts";

import type { Anchor, SavedExcerpt } from "./store.ts";

/** how the notes feature reaches the passages its excerpts are about. */
export interface Passages {
  /**
   * measures where a selection sits in its section
   * @param section the section holding the selection's start
   * @param range the selection, already cut to the section
   * @returns the span, or undefined where the selection starts outside the body
   */
  anchor: (section: HTMLElement, range: Range) => Anchor | undefined;
  /**
   * redraws a section's marks to match its excerpts
   * @param section the section to mark
   * @param excerpts every excerpt it holds
   */
  paint: (section: HTMLElement, excerpts: SavedExcerpt[]) => void;
  /**
   * brings an excerpt's passage into view, opening any disclosure hiding it
   * @param section the section the passage sits in
   * @param excerptId the excerpt to show
   */
  reveal: (section: HTMLElement, excerptId: string) => void;
}

/** the elements whose own whitespace a mark may not sit in. */
const STRUCTURAL = "table, thead, tbody, tfoot, tr, ul, ol, dl";

/** the elements whose text cannot carry a mark, and so is never counted. */
const UNMARKABLE = "svg, script, style, textarea";

/**
 * finds the body of a section, which is all a passage is ever measured against.
 *
 * the heading's control and the note list both change text as notes change,
 * so counting them would move every saved offset whenever a note was added
 * @param section the section to read
 * @returns its body, or null on a page drawn without one
 */
function bodyOf(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>("[data-section-body]");
}

/**
 * lists the text nodes of a body a mark can wrap, in document order
 * @param body the section body
 * @returns the text nodes
 */
function textsOf(body: HTMLElement): Text[] {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(UNMARKABLE)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    texts.push(node as Text);

  return texts;
}

/**
 * turns a range boundary into an offset into the body's joined text
 * @param texts the body's text nodes
 * @param container the boundary's node
 * @param offset the boundary's offset in that node
 * @returns the offset
 */
function boundaryOf(texts: Text[], container: Node, offset: number): number {
  const lengths = texts.map((text) => text.length);
  const own = texts.indexOf(container as Text);
  if (own >= 0) return offsetOf(lengths, own, offset);

  // an element boundary: every text node ending at or before it counts whole
  const point = document.createRange();
  point.setStart(container, offset);

  return offsetBefore(
    lengths,
    texts.map((text) => point.comparePoint(text, text.length)),
  );
}

/**
 * unwraps every mark in a body, leaving its text exactly as drawn
 * @param body the body to clear
 */
function clearMarks(body: HTMLElement): void {
  for (const mark of body.querySelectorAll<HTMLElement>("mark[data-note-mark]"))
    mark.replaceWith(...mark.childNodes);
  // splitting for a mark left neighbouring text nodes behind, and merging them
  // keeps the next paint from wrapping a node at a time
  body.normalize();
}

/**
 * wraps one excerpt's passage in marks, one per text node it covers
 * @param body the body the passage sits in
 * @param excerpt the excerpt to mark
 */
function markOne(body: HTMLElement, excerpt: SavedExcerpt): void {
  const texts = textsOf(body);
  const span = findPassage(texts.map(({ data }) => data).join(""), excerpt.quote, excerpt.at);
  if (!span) return;

  const pieces = markPieces(
    texts.map((text) => ({ text: text.data, structural: text.parentElement?.matches(STRUCTURAL) ?? false })),
    span,
  );
  for (const [order, { index, from, to }] of pieces.entries()) {
    let node = texts[index]!;
    if (from > 0) node = node.splitText(from);
    if (to - from < node.length) node.splitText(to - from);
    const mark = document.createElement("mark");
    mark.className = "note-mark";
    mark.dataset.noteMark = excerpt.id;
    mark.title = excerpt.note.trim() || "Highlighted, no note";
    // one stop per passage rather than one per node it spans: a passage across
    // a table row would otherwise cost the keyboard a stop per cell
    if (order === 0) {
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      mark.setAttribute("aria-label", `Edit note: ${mark.title}`);
    }
    node.before(mark);
    mark.append(node);
  }
}

/** the passages as the live page holds them. */
export const domPassages: Passages = {
  anchor(section, range) {
    const body = bodyOf(section);
    if (!body?.contains(range.startContainer)) return undefined;

    const texts = textsOf(body);
    const start = boundaryOf(texts, range.startContainer, range.startOffset);
    const end = body.contains(range.endContainer)
      ? boundaryOf(texts, range.endContainer, range.endOffset)
      : texts.reduce((total, text) => total + text.length, 0);

    return end > start ? { start, end } : undefined;
  },

  paint(section, excerpts) {
    const body = bodyOf(section);
    if (!body) return;

    clearMarks(body);
    for (const excerpt of excerpts) markOne(body, excerpt);
  },

  reveal(section, excerptId) {
    const mark = section.querySelector<HTMLElement>(
      `mark[data-note-mark="${CSS.escape(excerptId)}"]`,
    );
    if (!mark) return;

    for (let held = mark.closest("details"); held; held = held.parentElement?.closest("details") ?? null)
      held.open = true;
    mark.scrollIntoView({ block: "center" });
  },
};
