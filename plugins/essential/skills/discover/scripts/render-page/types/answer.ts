import type { Rich } from "./inline.ts";

// the shapes a question is built from: the answers it offers and the cards it
// asks about. Held apart from the rest of the content vocabulary because they
// are the half a reader writes back to, and a shape used only for display can
// change without anything having to restore an answer saved against it.

/**
 * the closed tag vocabulary `questions.md` defines for a choice title, in the
 * order that reference lists them. A tag outside this set is refused rather
 * than drawn, because an unrecognised word in a badge reads as an endorsement
 * the page never made.
 */
export const CHOICE_TAGS = [
  "Architectural",
  "Ideal",
  "Recommended",
  "Pragmatic",
  "Hotfix",
  "Workaround",
] as const;

/** one tag from `questions.md`'s closed vocabulary. */
export type Tag = (typeof CHOICE_TAGS)[number];

/** one selectable answer of a `choice` block. */
export interface Choice {
  /** the answer text, used both as the visible label and the recorded value */
  value: string;
  /** one sentence on when this answer is the right one */
  summary?: string;
  /**
   * every applicable tag from `questions.md`'s vocabulary, drawn as badges
   * beside the answer text in the order given
   */
  tags?: Tag[];
  /** what choosing this answer buys, one clause per entry */
  pros?: string[];
  /** what choosing this answer costs, one clause per entry */
  cons?: string[];
}

/** one selectable answer of a `checklist` block. */
export interface Option {
  /** the answer text, used both as the visible label and the recorded value */
  value: string;
  /** one sentence on what selecting this commits to */
  summary?: string;
}

/**
 * one observation card a reader may tick.
 *
 * a finding states a risk the author already judged; an observation states
 * something they noticed and are asking the reader whether it lands. That is
 * why it carries no severity and does carry a tick: the reader's agreement is
 * the missing half of it.
 */
export interface Observation {
  /** the one-line claim, drawn as the card's title and recorded by a tick */
  title: string;
  /** the file it was noticed in, drawn as a mono chip */
  file?: string;
  /** what the code actually does, under `Found in code` */
  found: Rich;
  /** what that costs, under `Impact` */
  impact: Rich;
  /** who or what noticed it, drawn as a small round badge of its initials */
  source?: string;
}

/** one position on a `scale` block's ordered scale. */
export interface ScalePoint {
  /** the recorded value for this position */
  value: string;
  /** the wording shown for this position; defaults to `value` */
  label?: string;
}

/**
 * one answer offered by a quiz question.
 *
 * `correct` is the whole difference between this and a `Choice`: a quiz is
 * not asking the reader's preference, it is checking whether they read the
 * board, so exactly one option is the answer the change actually has.
 */
export interface QuizOption {
  /** the answer as the reader reads it, and as the reply records it */
  value: string;
  /** whether this is the answer the change actually has */
  correct?: boolean;
  /** why it holds, or why it does not; revealed once this question is answered */
  because?: string;
}
