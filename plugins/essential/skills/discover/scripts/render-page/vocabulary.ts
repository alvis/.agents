import type { Block } from "./types.ts";

/** every presentation kind the renderer accepts. */
export const PAGE_KINDS = [
  "ranked-options",
  "guided-interview",
  "risk-context-report",
  "architecture-board",
] as const;

/** the judgements a table cell may carry. */
export const VERDICTS = ["good", "mixed", "bad"] as const;

/**
 * the judgement each verdict carries, as text. The table draws a glyph and a
 * colour too, but only this reaches assistive technology.
 */
export const VERDICT_LABEL: Record<(typeof VERDICTS)[number], string> = {
  good: "clean",
  mixed: "acceptable",
  bad: "costly",
};

/** the progress a step may report, and the word each one shows. */
export const STEP_STATE_LABEL = {
  done: "Done",
  current: "In progress",
  todo: "Not started",
} as const;

/** the severities a finding may carry, and the word each one shows. */
export const SEVERITY_LABEL = {
  critical: "Critical",
  elevated: "Elevated",
  watch: "Watch",
  clear: "Clear",
} as const;

/** every block type whose answer reaches the reply, in `answerOf`'s order. */
export const QUESTION_TYPES = [
  "choice",
  "note",
  "checklist",
  "scale",
  "decision",
] as const;

/** a question block, whichever affordance it uses. */
export type Question = Extract<Block, { type: (typeof QUESTION_TYPES)[number] }>;

/**
 * how bad a risk would be, and the word each rating shows.
 *
 * the word is drawn, not just the pill colour, because a risk matrix read in
 * greyscale is exactly the case where the rating matters most.
 */
export const RISK_SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

/** the progress a timeline moment may report, and the word each one shows. */
export const MOMENT_STATE_LABEL = {
  done: "Done",
  active: "In progress",
  pending: "Not started",
} as const;

/**
 * the stances a callout may take, and what each one announces.
 *
 * the label is emitted as visible text beside the heading, so the difference
 * between a warning and a reassurance is a word before it is a colour.
 */
export const CALLOUT_TONE_LABEL = {
  neutral: "Note",
  good: "Working",
  bad: "Watch out",
} as const;

/** text alignments a table column may request. */
export const COLUMN_ALIGNMENTS = ["left", "center", "right"] as const;

/**
 * how far the author stands behind a figure, weakest claim last.
 *
 * the order is the scale itself: anything below `measured` is a claim the
 * reader is being asked to accept on the author's word, and `invented` marks
 * a number that stands in for one nobody has yet.
 */
export const PROVENANCE = [
  "measured",
  "estimated",
  "assumed",
  "invented",
] as const;

/** how far the author stands behind one claim. */
export type Provenance = (typeof PROVENANCE)[number];
