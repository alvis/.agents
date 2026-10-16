import { collectClaims, formatCaveats, formatClaims } from "./claim.ts";
import { defaultsOf, recommendedOf, responseOf } from "./question.ts";
import { formatAnswers, summarise } from "./runtime/disposition.ts";
import { fillReply, fillTemplate } from "./runtime/reply.ts";
import { requireString } from "./validate.ts";
import { QUESTION_TYPES } from "./vocabulary.ts";
import { walkBlocks } from "./walk.ts";

import type { AnswerLine } from "./runtime/reply.ts";
import type { Block, PageData, Section } from "./types.ts";
import type { Question } from "./vocabulary.ts";

/**
 * collects every question a list of blocks holds, including the ones a
 * container nests, in reading order.
 *
 * the runtime counts every `[data-question]` field in the document, so the
 * count and the reply drawn before it runs have to look as deep as the
 * markup does: a decision inside a disclosure is as much a question as one
 * beside it, and a page that read only the top level opened at one number
 * and corrected itself to another once the script ran. Walking the blocks
 * outermost first is what makes this the document's order too, because a
 * container draws what it holds where it sits.
 * @param blocks the blocks to search
 * @param at JSON path of `blocks`
 * @returns every `choice`, `note`, `checklist`, `scale`, `decision`,
 *   `observations`, and `quiz` block, none of which is answered in a freshly
 *   rendered page
 */
export function questionsIn(blocks: Block[], at: string): Question[] {
  return walkBlocks(blocks, at)
    .map(({ block }) => block)
    .filter((block): block is Question =>
      QUESTION_TYPES.some((type) => type === block.type),
    );
}

/**
 * collects every question block on a page, in reading order
 * @param sections the page's sections
 * @returns every question the sections hold at any depth
 */
export function questionsOf(sections: Section[]): Question[] {
  return sections.flatMap((section, index) =>
    questionsIn(section.blocks, `sections[${index}].blocks`),
  );
}

/**
 * fills every reply marker that does not move as the reader answers.
 *
 * the page's provenance and its caveats are fixed the moment it is rendered,
 * so they are filled once here and stored already filled. That is what lets
 * the runtime refill `{{answers}}` on each keystroke without re-deriving
 * anything, and what keeps a reader with JavaScript off reading the same
 * caveats as one with it on.
 * @param data the parsed presentation data
 * @returns the template with only `{{answers}}` left to fill
 */
export function replyTemplate(data: PageData): string {
  const claims = collectClaims(data.sections).concat(
    collectClaims(data.sources),
  );

  return fillTemplate(requireString(data.reply.template, "reply.template"), {
    provenance: formatClaims(claims),
    caveats: formatCaveats(claims),
  });
}

/**
 * fills the reply template with the unanswered state a fresh page opens in
 * @param data the parsed presentation data
 * @returns the reply body the runtime would produce before any answer, so the
 *   drawer reads correctly on first paint and without JavaScript
 */
export function renderReply(data: PageData): string {
  // the same grouping the runtime writes, from the same function, so a reader
  // with scripting off is not handed a differently shaped reply from one with
  // it on — and so the two can never drift apart as the grouping changes
  const lines: AnswerLine[] = questionsOf(data.sections).map((block, index) => ({
    ref: block.ref,
    label: block.label,
    value: "",
    response: responseOf(block, `question[${index}]`),
    recommended: recommendedOf(block, `question[${index}]`),
    touched: false,
    defaults:
      block.type === "decision" && defaultsOf(block, `question[${index}]`),
  }));

  // a fresh page holds no notes, and leaving the marker unfilled would print
  // the literal {{notes}} to a reader with scripting off
  return fillReply(replyTemplate(data), {
    summary: summarise(lines, 0),
    answers: formatAnswers(lines),
    notes: [],
  });
}
