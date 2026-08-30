// the inline vocabulary: what a styled span inside a sentence can be.

/**
 * one span of a rich-text value.
 *
 * a run states what a span *is*, never what it should look like: there is no
 * markup pass-through anywhere in this format, so a data file can describe an
 * inline citation or a glossary term without being able to author HTML. A bare
 * string is shorthand for a `text` run.
 */
export type Run =
  | string
  /** plain text, escaped and otherwise unstyled */
  | { kind: "text"; text: string }
  /** an identifier, path, or fragment of code, set in the mono face */
  | { kind: "code"; text: string }
  /** a passage the page is drawing the reader's eye to */
  | { kind: "mark"; text: string }
  /** a qualifier that should read quieter than the sentence around it */
  | { kind: "dim"; text: string }
  /** a secondary label under a table cell's own value */
  | { kind: "sub"; text: string }
  /**
   * a term the board defines rather than assumes.
   *
   * the run lights its glossary entry, and is lit by it. The tie is derived
   * from the words, so `for` is needed only when the sentence's wording is not
   * the glossary's own.
   */
  | { kind: "term"; text: string; definition: string; for?: string }
  /**
   * a span tied to a region of a code block that produces it.
   *
   * this is what turns a specimen into a map: hovering the thing on screen
   * lights the lines that make it, and hovering the lines lights the thing.
   */
  | { kind: "tie"; text: string; key: string }
  /** a link; only http, https and mailto schemes are accepted */
  | { kind: "link"; text: string; href: string }
  /** a citation naming where the surrounding claim came from */
  | { kind: "source"; text: string; ref: string }
  /** a figure, tagged with how far the author stands behind it */
  | {
      kind: "provenance";
      text: string;
      level: "measured" | "estimated" | "assumed" | "invented";
    };

/** text that may carry styled spans, written as a string or as runs. */
export type Rich = string | Run[];
