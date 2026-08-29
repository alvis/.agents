import type { Block } from "./types.ts";

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
  "observations",
  "quiz",
] as const;

/** a question block, whichever affordance it uses. */
export type Question = Extract<Block, { type: (typeof QUESTION_TYPES)[number] }>;

/**
 * the answer contract each kind is saved, restored and read back through.
 *
 * a kind is not always its own contract. `observations` asks which of a set of
 * cards land, and an answer to that is a set of ticked values — the exact shape
 * a checklist already saves, restores, and joins into the reply; a `quiz` asks
 * for one of several answers, which is a choice however differently it is
 * scored. Saying so here is what keeps `runtime/answer.ts` at the branches it
 * has: a branch of its own would be a copy of an existing one, and two copies
 * of a serialisation have to stay identical forever or a saved answer stops
 * restoring.
 *
 * the map is read at render time and emitted as `data-question-kind`, so the
 * runtime never consults it; every kind is listed, so a new one cannot inherit
 * a contract by default and be discovered as a silent answer that never saved.
 */
export const ANSWER_KIND: Record<(typeof QUESTION_TYPES)[number], string> = {
  choice: "choice",
  note: "note",
  checklist: "checklist",
  scale: "scale",
  decision: "decision",
  observations: "checklist",
  quiz: "choice",
};

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
 * what a build-log entry is, and the word each classification shows.
 *
 * the four are not a scale and are not ranked: they say where an entry came
 * from. `plan-confirmed` is the plan holding, `discovery` is what the code
 * turned out to say, `deviation` is a departure the entry owes an account of,
 * and `todo` is work the change is knowingly leaving behind.
 */
export const MOMENT_KIND_LABEL = {
  "plan-confirmed": "Plan confirmed",
  discovery: "Discovery",
  deviation: "Deviation",
  todo: "Still owed",
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
