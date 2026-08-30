/**
 * the blocks that ask the reader something.
 *
 * held apart from the rest of the union because they are the half of the
 * format with a contract behind it: each carries an `id` the store keys by, a
 * `ref` the reply cites, and a `response` that decides which half of the reply
 * it prints under. A block that only states something has none of those, and
 * reading the two sets together made it easy to add a question that looked
 * like one and was saved like nothing.
 */

import type {
  Choice,
  Observation,
  Option,
  QuizOption,
  ScalePoint,
} from "./answer.ts";

/**
 * how the reply reads a question's answer.
 *
 * a decision is something the reader settles; a follow-up is something they may
 * ask for. The reply keeps them apart so an untouched optional question is
 * never reported as a refusal, nor an unasked follow-up as an instruction.
 */
export type Response = "decision" | "follow-up";

/** every question a section body can hold, whichever affordance it uses. */
export type QuestionBlock =
  /**
   * a single-answer question; `id` names its radio group and must be unique.
   * `recommendation` states which answer the page recommends and why —
   * `questions.md` requires a material decision to explain the recommendation,
   * and a `Recommended` badge states which without stating why
   */
  | {
      type: "choice";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      choices: Choice[];
      recommendation?: string;
    }
  /**
   * a yes/no or single-option question, answered by pressing Approve or
   * Change; `id` becomes the note textarea's document id
   */
  | {
      type: "decision";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      placeholder?: string;
    }
  /** a free-text question; `id` becomes the textarea's document id */
  | {
      type: "note";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      placeholder?: string;
    }
  /** a multi-select question; its answer is a set, joined by `", "` */
  | {
      type: "checklist";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      options: Option[];
    }
  /**
   * numbered cards the reader ticks where one lands, each naming what was
   * seen, where, and what it costs
   */
  | {
      type: "observations";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `O2` */
      ref: string;
      label: string;
      ask: string;
      items: Observation[];
    }
  /**
   * a question with a right answer, asked of whoever is about to merge.
   *
   * it saves as a `choice` and reaches the reply like any other question; what
   * it adds is `correct`, which nothing in the answer store reads. Only the
   * `gate` block reads it: a wrong answer is never reported to the disposition
   * machinery as a disagreement, because the reader was not being asked what
   * they preferred.
   */
  | {
      type: "quiz";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `Q2` */
      ref: string;
      label: string;
      ask: string;
      /**
       * the id of the section that explains this, linked from a wrong answer.
       *
       * refused when the page holds no section by that name, because a
       * link-back that scrolls nowhere is worse than none: it tells a reader
       * who got the answer wrong that there is nothing more to read.
       */
      explains: string;
      options: QuizOption[];
    }
  /** an ordered scale; its answer carries the chosen ordinal position */
  | {
      type: "scale";
      response?: Response;
      id: string;
      /** the citation code drawn on its chip and beside it, e.g. `D4` */
      ref: string;
      label: string;
      ask: string;
      points: ScalePoint[];
    };
