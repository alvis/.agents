import type { Anchor } from "./store.ts";

/** the mark a truncated quote ends with, which the page's text never holds. */
const ELLIPSIS = "…";

/** one text node's share of a span: its index and the characters covered. */
export interface Piece {
  /** which text node, in document order */
  index: number;
  /** the first character covered inside it */
  from: number;
  /** the first character past the covered run inside it */
  to: number;
}

/** one text node of a section body, as marking reads it. */
export interface TextRun {
  /** the node's text */
  text: string;
  /** whether its parent is a table or list container, whose own whitespace is no place for a mark */
  structural: boolean;
}

/**
 * finds a saved passage in a section's text.
 *
 * where the passage was saved wins while its text still reads there, which is
 * what tells two equal passages apart; once the page has moved under it, the
 * nearest occurrence of the quote stands in, so a note is marked rather than
 * lost. A truncated quote matches by the start it kept.
 * @param text the section body's text, its nodes joined in document order
 * @param quote the passage as saved
 * @param hint where it was saved, if anywhere
 * @returns the span to mark, or null where the passage no longer reads
 */
export function findPassage(text: string, quote: string, hint?: Anchor): Anchor | null {
  const truncated = quote.endsWith(ELLIPSIS);
  const core = squeeze(truncated ? quote.slice(0, -ELLIPSIS.length) : quote).text;
  if (!core) return null;

  if (hint && hint.end <= text.length) {
    const held = squeeze(text.slice(hint.start, hint.end)).text;
    if (truncated ? held.startsWith(core) : held === core) return hint;
  }

  const flat = squeeze(text);
  let best: Anchor | null = null;
  for (let found = flat.text.indexOf(core); found >= 0; found = flat.text.indexOf(core, found + 1)) {
    const span = { start: flat.at[found]!, end: flat.at[found + core.length - 1]! + 1 };
    if (!hint) return span;
    if (!best || Math.abs(span.start - hint.start) < Math.abs(best.start - hint.start)) best = span;
  }

  return best;
}

/**
 * drops every whitespace character, remembering where each kept one came from.
 *
 * the browser's selection text puts a tab between table cells and a newline
 * between blocks that the text nodes themselves never held, so whitespace is
 * the one thing a quote and the page cannot be compared on. Indices are code
 * units, as the DOM counts offsets, so an astral character never shifts a mark
 * @param text the text to squeeze
 * @returns the text without whitespace, and each kept unit's original index
 */
function squeeze(text: string): { text: string; at: number[] } {
  const at: number[] = [];
  let kept = "";
  for (let index = 0; index < text.length; index++) {
    const unit = text[index]!;
    if (/\s/u.test(unit)) continue;
    kept += unit;
    at.push(index);
  }

  return { text: kept, at };
}

/**
 * splits a span across the text nodes it covers
 * @param lengths each text node's length, in document order
 * @param span the span to split
 * @returns each node's covered run, leaving out nodes it covers none of
 */
export function piecesOf(lengths: number[], span: Anchor): Piece[] {
  const pieces: Piece[] = [];
  let offset = 0;
  for (const [index, length] of lengths.entries()) {
    const from = Math.max(span.start - offset, 0);
    const to = Math.min(span.end - offset, length);
    if (to > from) pieces.push({ index, from, to });
    offset += length;
  }

  return pieces;
}

/**
 * turns a position inside one text node into an offset into the joined text
 * @param lengths each text node's length, in document order
 * @param index the node the position is in
 * @param offset the position inside that node
 * @returns the offset into the joined text
 */
export function offsetOf(lengths: number[], index: number, offset: number): number {
  return lengths.slice(0, index).reduce((total, length) => total + length, 0) + offset;
}

/**
 * splits a span into the runs a mark may wrap.
 *
 * whitespace between table cells or list items is no place for an inline
 * element; everywhere else whitespace is part of the passage and stays marked
 * @param runs the body's text nodes, in document order
 * @param span the span to mark
 * @returns each run's covered characters, leaving out structural whitespace
 */
export function markPieces(runs: TextRun[], span: Anchor): Piece[] {
  return piecesOf(runs.map(({ text }) => text.length), span).filter(
    ({ index, from, to }) => !runs[index]!.structural || runs[index]!.text.slice(from, to).trim() !== "",
  );
}

/**
 * counts the characters before an element boundary, which no text node holds
 * @param lengths each text node's length, in document order
 * @param ends where each node's end sits against the boundary, as `Range.comparePoint` reports it: -1 before, 0 at, 1 after
 * @returns the offset into the joined text
 */
export function offsetBefore(lengths: number[], ends: number[]): number {
  // a node ending exactly at the boundary lies wholly before it
  return lengths.reduce((total, length, index) => (ends[index]! <= 0 ? total + length : total), 0);
}
