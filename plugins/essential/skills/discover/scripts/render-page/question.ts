import { requireOneOf } from "./validate.ts";

import type { Response } from "./types.ts";
import type { Question } from "./vocabulary.ts";

/** the two ways a reply can read an answer. */
const RESPONSES = ["decision", "follow-up"] as const;

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
 * @returns the recommended answers, empty where the page recommends none
 */
export function recommendedOf(block: Question): string[] {
  if (block.type === "decision") return ["Approve"];

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
