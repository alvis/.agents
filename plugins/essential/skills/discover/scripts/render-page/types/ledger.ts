// the ledger vocabulary: grouped records that open for their own detail.

import type { Rich } from "./inline.ts";

/**
 * one named fact in a `ledger` row's detail.
 *
 * a label and a value rather than a sentence, because detail is read by
 * looking for one field: who holds a row, or what it waits on, is found by its
 * name and never by reading a paragraph it might have been written into.
 */
export interface LedgerFact {
  /** what the fact is called */
  label: string;
  /** what the record says it is */
  value: Rich;
}

/** how much of a `ledger` group is finished. */
export interface LedgerProgress {
  /** how many of its rows are done */
  done: number;
  /** how many rows it has in total */
  of: number;
}

/**
 * one row of a `ledger` block, which opens for the whole of its record.
 *
 * the closed row carries what somebody scanning needs — a code, what it is,
 * and the state it is in — and holds everything else until it is asked for.
 * That division is the block: a table wide enough for nine columns cannot be
 * read, and a table narrow enough to read has dropped the columns the reader
 * came for.
 */
export interface LedgerEntry {
  /** the short code the row is cited by, set in the mono face */
  code: string;
  /** what the row is */
  title: Rich;
  /** the state the record puts it in, drawn as a word beside the code */
  status: string;
  /** which family the row's pill and edge take; neutral where unstated */
  tone?: "good" | "busy" | "bad" | "neutral";
  /** everything else the record holds about it, revealed when it opens */
  facts: LedgerFact[];
}

/**
 * one group of rows in a `ledger` block, which opens for its own detail.
 *
 * a group is a subject in its own right rather than a heading over its rows:
 * it reports its own progress and carries its own facts, which is what lets a
 * reader answer a question about the group without opening a row under it.
 */
export interface LedgerGroup {
  /** the group's name */
  label: string;
  /** a line drawn beside the name, whether the group is open or closed */
  note?: Rich;
  /** how far it has run, drawn as a bar that also states its numbers */
  progress?: LedgerProgress;
  /** what the group itself records, revealed when the group opens */
  facts: LedgerFact[];
  /** its rows, in the order the record holds them */
  entries: LedgerEntry[];
  /** what to draw in place of rows where the group has none */
  empty?: string;
}
