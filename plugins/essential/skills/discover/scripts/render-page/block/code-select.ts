import { RenderError } from "../error.ts";
import { renderInline } from "../inline.ts";
import { requireArray, requireObject, requireString } from "../validate.ts";

import type { CodeSelection } from "../types.ts";

/** a selection once it has been located in the excerpt. */
export interface PlacedSelection {
  /** first character covered, 0-based */
  start: number;
  /** first character past the selection */
  end: number;
  /** the author's note, already drawn */
  note: string;
  /** the ordinal shown on the excerpt and beside the note, 1-based */
  number: number;
}

/** one run of the excerpt a search matched, as raw offsets. */
type Match = [start: number, end: number];

const WHITESPACE = /\s/;

/**
 * finds every place the text appears verbatim.
 * @param code the excerpt to search
 * @param text the run being looked for
 * @returns each match, in order, as raw offsets
 */
function matchExactly(code: string, text: string): Match[] {
  const found: Match[] = [];
  for (
    let at = code.indexOf(text);
    at !== -1;
    at = code.indexOf(text, at + 1)
  )
    found.push([at, at + text.length]);

  return found;
}

/**
 * collapses every run of whitespace to one space, remembering where it was.
 * @param text the text to fold
 * @returns the folded text and the raw offset each of its characters came from
 */
function fold(text: string): { text: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let at = 0;
  while (at < text.length) {
    const start = at;
    if (!WHITESPACE.test(text[at])) {
      out.push(text[at]);
      map.push(start);
      at += 1;
      continue;
    }
    while (at < text.length && WHITESPACE.test(text[at])) at += 1;
    out.push(" ");
    map.push(start);
  }

  return { text: out.join(""), map };
}

/**
 * finds the text again, ignoring how the formatter chose to lay it out.
 *
 * this is what makes D-70 hold. The author names a run by quoting it, usually
 * from the source they were reading rather than from the formatted excerpt, and
 * re-indenting and re-wrapping are the two things a formatter does most. Folding
 * whitespace on both sides makes those invisible, while the map carries every
 * match back to real offsets so the highlight lands on the real characters.
 * @param code the excerpt to search
 * @param text the run being looked for
 * @returns each match, in order, as raw offsets into `code`
 */
function matchLoosely(code: string, text: string): Match[] {
  const needle = fold(text).text.trim();
  const hay = fold(code);
  if (!needle) return [];

  return matchExactly(hay.text, needle).map(([start, end]) => [
    hay.map[start],
    hay.map[end - 1] + 1,
  ]);
}

/**
 * reads one selection and locates it, refusing anything ambiguous by path.
 * @param selection the author-supplied selection
 * @param code the formatted excerpt it is resolved against
 * @param at JSON path of the selection, named verbatim by every refusal
 * @returns the run it covers, as raw offsets
 */
function locate(selection: CodeSelection, code: string, at: string): Match {
  const text = requireString(selection.text, `${at}.text`);
  if (!text.trim())
    throw new RenderError(
      `${at}.text: is only whitespace, so it names no run of the excerpt`,
    );
  const found = matchExactly(code, text);
  const matches = found.length ? found : matchLoosely(code, text);
  if (!matches.length)
    throw new RenderError(
      `${at}.text: not found in the excerpt. selections are matched against the formatted text, so compare against the rendered block rather than the source as it was written`,
    );
  const count = matches.length;
  if (selection.occurrence === undefined) {
    if (count > 1)
      throw new RenderError(
        `${at}.text: matches ${String(count)} runs of the excerpt, so it does not name one; set ${at}.occurrence to a number between 1 and ${String(count)}`,
      );

    return matches[0];
  }
  const which = selection.occurrence;
  if (!Number.isInteger(which) || (which as number) < 1)
    throw new RenderError(
      `${at}.occurrence: required a match number of 1 or more, received ${JSON.stringify(which)}`,
    );
  if ((which as number) > count)
    throw new RenderError(
      `${at}.occurrence: ${String(which)} is past the ${String(count)} match${count === 1 ? "" : "es"} this text has in the excerpt`,
    );

  return matches[which - 1];
}

/**
 * pulls a match in off the whitespace at either end.
 *
 * an author who quotes a whole line usually quotes its newline too, and a run
 * that ends on a line break has its superscript drawn on a character the reader
 * cannot see. Tightening also keeps the highlight off the indentation a
 * formatter chose rather than the author.
 * @param code the excerpt the match was found in
 * @param start first character matched, 0-based
 * @param end first character past the match
 * @returns the same run, without its leading or trailing whitespace
 */
function tighten(code: string, start: number, end: number): Match {
  let from = start;
  let to = end;
  while (from < to && WHITESPACE.test(code[from])) from += 1;
  while (to > from && WHITESPACE.test(code[to - 1])) to -= 1;

  return [from, to];
}

/**
 * locates every selection on an excerpt and numbers them in reading order.
 *
 * the number is the selection's position in the array rather than its position
 * in the text, so the author decides what is read first; a pair of excerpts
 * shares one sequence by continuing the count from `from`.
 * @param selections the author-supplied selections
 * @param code the formatted excerpt they are resolved against
 * @param path JSON path of `selections`, named verbatim by every refusal
 * @param from the number the first selection carries
 * @returns each selection, located and numbered
 */
export function placeSelections(
  selections: unknown,
  code: string,
  path: string,
  from = 1,
): PlacedSelection[] {
  const placed = requireArray<CodeSelection>(selections, path).map(
    (selection, index) => {
      const at = `${path}[${index}]`;
      requireObject<CodeSelection>(selection, at);
      const [start, end] = tighten(code, ...locate(selection, code, at));

      return {
        start,
        end,
        note: renderInline(selection.note, `${at}.note`),
        number: from + index,
      };
    },
  );

  // two selections cannot both wrap the same character, so an overlap has no
  // drawing at all rather than an ugly one; it is refused here, naming both
  // ends, because by this point their real offsets are known and the author's
  // two quoted snippets look nothing like each other
  const order = [...placed.keys()].sort(
    (left, right) => placed[left].start - placed[right].start,
  );
  for (const [rank, index] of order.slice(1).entries()) {
    const before = placed[order[rank]];
    const after = placed[index];
    if (after.start < before.end)
      throw new RenderError(
        `${path}[${String(index)}]: covers characters ${String(after.start)}-${String(after.end)}, overlapping ${path}[${String(order[rank])}] which covers ${String(before.start)}-${String(before.end)}; two selections cannot both wrap the same character`,
      );
  }

  return placed;
}
