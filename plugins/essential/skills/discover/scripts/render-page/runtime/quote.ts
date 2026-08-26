/**
 * a quote identifies the passage a note is about; it is not a copy of it.
 *
 * anything past this is stored truncated, so one careless select-all cannot
 * fill storage with a whole section.
 */
export const MAX_QUOTE = 240;

/**
 * splits text into user-perceived characters.
 *
 * string indices are UTF-16 code units, so cutting on one can land between the
 * surrogates of an emoji and store half of it — the excerpt then shows a
 * replacement character everywhere it is printed. Graphemes keep a flag or a
 * skin-tone sequence whole; code points are the fallback, and are already
 * enough to make a lone surrogate impossible.
 * @param text the text to split
 * @returns the characters, longest-cluster first where the browser can segment
 */
export function characters(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

    return [...segmenter.segment(text)].map(({ segment }) => segment);
  }

  return [...text];
}

/**
 * collapses runs of whitespace so a quote reads as one line
 * @param value the text to collapse
 * @returns the text with every whitespace run reduced to one space, trimmed
 */
export function collapse(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * cuts a quote to length without splitting a character
 * @param text the quote to cut
 * @returns the quote, ellipsised when it was longer than `MAX_QUOTE`
 */
export function truncate(text: string): string {
  const parts = characters(text);
  if (parts.length <= MAX_QUOTE) return text;

  return `${parts.slice(0, MAX_QUOTE - 1).join("").trimEnd()}…`;
}
