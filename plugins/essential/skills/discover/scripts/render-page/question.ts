import { RenderError } from "./error.ts";
import { VERDICT_WORDS } from "./runtime/reply.ts";
import {
  optionalString,
  requireObject,
  requireOneOf,
} from "./validate.ts";

import type { VerdictWords } from "./runtime/reply.ts";
import type { Response } from "./types.ts";
import type { Question } from "./vocabulary.ts";

/** the two ways a reply can read an answer. */
const RESPONSES = ["decision", "follow-up"] as const;

/** the buttons a follow-up may declare as its default. */
const DEFAULTS = ["approve"] as const;

/** a decision question, the one kind whose buttons a board may relabel. */
type DecisionQuestion = Extract<Question, { type: "decision" }>;

/** the words a decision draws: its two buttons and the note the second reveals. */
export interface DecisionLabels extends VerdictWords {
  /** the label over the note the change button reveals */
  note: string;
}

/**
 * reads the words a decision draws, each falling back on its own
 * @param block the decision
 * @param path where the decision sits, for a refusal to name
 * @returns every label, the board's where it named one and the default where not
 */
export function labelsOf(block: DecisionQuestion, path: string): DecisionLabels {
  const at = `${path}.labels`;
  const named =
    block.labels === undefined
      ? {}
      : requireObject<Record<string, unknown>>(block.labels, at);

  const labels = {
    approve:
      optionalString(named.approve, `${at}.approve`) ?? VERDICT_WORDS.approve,
    change: optionalString(named.change, `${at}.change`) ?? VERDICT_WORDS.change,
    note: optionalString(named.note, `${at}.note`) ?? "What to change",
  };

  // the reply reads a verdict back from the words it prints, so two buttons
  // saying the same thing would file a change as the approval it looks like
  if (labels.approve === labels.change)
    throw new RenderError(
      `${at}: approve and change must differ, both read ${JSON.stringify(labels.approve)}`,
    );

  return labels;
}

/**
 * reads whether a decision's approve button is what the reader gets untouched.
 *
 * the board declares it, because it reverses what an approve press means: on
 * a follow-up without one, approving still requests the thing offered. Words
 * on the buttons never decide it. A decision cannot have one, since leaving a
 * decision alone settles nothing.
 * @param block the decision
 * @param path where the decision sits, for a refusal to name
 * @returns whether leaving the decision alone, or approving it, asks for nothing
 */
export function defaultsOf(block: DecisionQuestion, path: string): boolean {
  if (block.default === undefined) return false;

  const at = `${path}.default`;
  requireOneOf(block.default, DEFAULTS, at);

  const response = responseOf(block, path);
  if (response !== "follow-up")
    throw new RenderError(
      `${at}: only a "follow-up" may declare a default, this asks a "${response}"`,
    );

  return true;
}

/**
 * reads how the reply should treat a question's answer
 * @param block the question
 * @param path where the question sits, for a refusal to name
 * @returns the declared response kind, defaulting to a decision
 */
export function responseOf(block: Question, path: string): Response {
  if (block.response === undefined) return "decision";

  return requireOneOf(block.response, RESPONSES, `${path}.response`);
}

/**
 * reads which answers the page recommends.
 *
 * a `decision` recommends approval by construction: the page put the proposal
 * in front of the reader and asked them to approve it, so an Approve is the
 * reader agreeing and a Change is the reader not. Nothing else on the page
 * recommends anything unless a `Recommended` badge says so.
 * @param block the question
 * @param path where the question sits, for a refusal to name
 * @returns the recommended answers, empty where the page recommends none
 */
export function recommendedOf(block: Question, path: string): string[] {
  if (block.type === "decision") return [labelsOf(block, path).approve];

  if (block.type !== "choice") return [];

  return (block.choices ?? [])
    .filter((choice) => (choice?.tags ?? []).includes("Recommended"))
    .map((choice) => choice.value);
}

/**
 * writes the attribute telling the runtime how to read an answer
 * @param block the question
 * @param path where the question sits, for a refusal to name
 * @returns the attribute, empty for the decision default so a board that asks
 *   only decisions renders exactly as it did before follow-ups existed
 */
export function responseAttribute(block: Question, path: string): string {
  return responseOf(block, path) === "follow-up"
    ? ' data-response-kind="follow-up"'
    : "";
}
