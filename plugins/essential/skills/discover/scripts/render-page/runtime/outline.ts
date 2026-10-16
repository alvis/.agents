import { dispositionOf } from "./disposition.ts";

import type { Disposition } from "./disposition.ts";
import type { AnswerLine } from "./reply.ts";

/**
 * the word a question's state is shown with outside the reply.
 *
 * the five dispositions are finer than a reader scanning a section needs: a
 * suggestion nobody has agreed to and a question nobody has touched are both
 * simply still open, so they share a word. The word is text on purpose, so a
 * state never rests on a colour alone.
 */
export const STATE_WORD: Record<Disposition, string> = {
  confirmed: "confirmed",
  changed: "changed",
  answered: "answered",
  suggested: "open",
  unanswered: "open",
};

/** where a section stands: something left to settle, all of it settled, or nothing asked. */
export type SectionState = "open" | "settled" | "none";

/** a section's state, with the short text a reader sees for it. */
export interface Standing {
  /** whether anything is left to settle */
  state: SectionState;
  /** how many are open, the word settled, or nothing for a section that asks nothing */
  tally: string;
}

/**
 * says where a section stands from where its questions stand.
 *
 * a declared default counts as settled because `dispositionOf` already reads it
 * as confirmed, so a section is judged by the same model the reply is and the
 * two cannot disagree about whether a question is still open.
 * @param dispositions where each of the section's questions stands
 * @returns the state and its tally
 */
export function sectionState(dispositions: Disposition[]): Standing {
  if (!dispositions.length) return { state: "none", tally: "" };

  const open = dispositions.filter(
    (disposition) => STATE_WORD[disposition] === STATE_WORD.unanswered,
  ).length;

  return open
    ? { state: "open", tally: `${open} ${STATE_WORD.unanswered}` }
    : { state: "settled", tally: "settled" };
}

/**
 * keeps the page's outline in step with the answers: the chips under each
 * section's heading, and each section's state in the drawer's navigation.
 *
 * both are drawn by the renderer from the fresh dispositions and repainted
 * here from the lines the drawer is drawn from, so a question can never read
 * one way in its heading and another in the drawer. The elements are found by
 * the attributes the renderer put on them and repainted in place, because the
 * chips are links and rebuilding one under the pointer would drop it.
 * @param fields every question on the page, in reading order
 * @returns a repaint taking the same lines the drawer's summary is drawn from
 */
export function installOutline(
  fields: HTMLElement[],
): (lines: AnswerLine[]) => void {
  const chips = new Map(
    [...document.querySelectorAll<HTMLElement>("[data-heading-chip]")].map(
      (chip) => [chip.dataset.headingChip ?? "", chip],
    ),
  );
  const links = [...document.querySelectorAll<HTMLElement>("[data-nav-section]")];
  // a question belongs to the section whose element holds it, which is what
  // places one nested inside a container the same as one beside it
  const sectionOf = fields.map(
    (field) => field.closest<HTMLElement>("[data-section]")?.dataset.sectionId,
  );

  return (lines) => {
    const dispositions: Disposition[] = lines.map(dispositionOf);

    for (const [index, field] of fields.entries()) {
      const chip = chips.get(field.dataset.questionId ?? "");
      const disposition = dispositions[index];
      if (!chip || !disposition) continue;

      chip.setAttribute("data-status", disposition);
      const word = chip.querySelector<HTMLElement>(".q-chip-state");
      if (word) word.textContent = STATE_WORD[disposition];
    }

    for (const link of links) {
      const held = dispositions.filter(
        (_, index) => sectionOf[index] === link.dataset.navSection,
      );
      const { state, tally } = sectionState(held);

      link.setAttribute("data-nav-state", state);
      const text = link.querySelector<HTMLElement>(".nav-tally");
      if (text) text.textContent = tally;
    }
  };
}
