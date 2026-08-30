/**
 * the vocabulary a source excerpt is annotated with.
 *
 * kept beside the block union rather than inside it because four of these five
 * shapes are what an author writes about code, and the fifth is what the
 * builder measures of it: one place to read for anything to do with an excerpt.
 */

import type { Rich } from "./inline.ts";

/** a run of lines tied to a partner elsewhere on the page. */
export interface CodeTie {
  /** the name this end and its partner share */
  key: string;
  /** the 1-based lines the tie covers */
  lines: number[];
}

/** a reviewer note anchored to one line of an excerpt. */
export interface CodeComment {
  /** the 1-based line the note reads under */
  line: number;
  /** what the reviewer said */
  text: Rich;
  /** how much the note matters, drawn as a word as well as a colour */
  severity?: "critical" | "high" | "medium" | "low";
  /** where the line lives, when the excerpt is not the whole file */
  at?: string;
}

/** a run of the excerpt the author is annotating, named by its own text. */
export interface CodeSelection {
  /** the covered code, verbatim, exactly as it reads after formatting */
  text: string;
  /** which match to take, 1-based, when the text appears more than once */
  occurrence?: number;
  /** what the author wants said about it, drawn in the list below */
  note: Rich;
}

/**
 * one coloured run of an excerpt, measured by the builder.
 *
 * offsets are into the excerpt as the block carries it, so they are recomputed
 * whenever the text is: the CLI layer formats first and tokenises after, and
 * overwrites this field on every excerpt so an authored value never survives.
 */
export interface TokenSpan {
  /** first character covered, 0-based */
  start: number;
  /** first character past the run */
  end: number;
  /** the grammar's name for it, drawn as a class and nothing else */
  kind: string;
}

/**
 * a source excerpt, held verbatim.
 *
 * every span the builder emits wraps text that is already escaped: the excerpt
 * is sliced on raw offsets and each slice is escaped as it is written, so no
 * author byte can become markup, and no entity can be cut in half by a span
 * boundary. Colour arrives as measured ranges, never as markup, and the page
 * carries no parser.
 */
export interface CodeExcerpt {
  /** the language, which decides both the formatter and the grammar */
  language: string;
  /** the excerpt itself */
  code: string;
  /** where the excerpt lives, drawn as a path chip above it */
  label?: string;
  /** a caption read as the excerpt's title */
  caption?: string;
  /** 1-based lines the author is drawing the reader's eye to */
  highlight?: number[];
  /** lines tied to whatever else on the page shares their key */
  ties?: CodeTie[];
  /** reviewer notes, each reading directly under the line it is about */
  comments?: CodeComment[];
  /** runs of the excerpt the author has something to say about */
  selections?: CodeSelection[];
  /** colour ranges, written by the CLI layer and never by the author */
  tokens?: TokenSpan[];
}
