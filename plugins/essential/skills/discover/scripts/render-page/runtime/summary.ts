import { formatAnswers, summarise } from "./disposition.ts";
import { countUnanswered, fillReply } from "./reply.ts";

import type { NoteRow } from "./note-view.ts";
import type { ProbeOrder } from "./probe.ts";
import type { AnswerLine } from "./reply.ts";

/** the elements the drawer keeps in step with the page's answers. */
export interface SummaryTargets {
  /** the list of one row per question */
  list: HTMLElement;
  /**
   * the live region carrying the unanswered tally.
   *
   * absent on a board that asks nothing, which draws no reply half at all
   * rather than a count that can only ever read zero.
   */
  count: HTMLElement | null;
  /** the element holding the rendered reply, absent for the same reason */
  reply: HTMLElement | null;
}

/**
 * redraws the drawer's summary rows, its tally, and the reply
 * @param targets the elements to redraw
 * @param lines every question's label and answer, in reading order
 * @param touched every question id the reader has touched
 * @param ids each line's question id, positionally matching `lines`
 * @param notes every note the reader holds, which the reply carries alongside
 *   the answers
 * @param probes where every ordering probe stands, which the reply carries
 *   alongside the answers once the reader has moved one
 */
export function paintSummary(
  targets: SummaryTargets,
  lines: AnswerLine[],
  touched: Set<string>,
  ids: string[],
  notes: NoteRow[] = [],
  probes: ProbeOrder[] = [],
): void {
  targets.list.replaceChildren(
    ...lines.map(({ ref, label, value }, index) => {
      const row = document.createElement("li");
      row.dataset.answered = String(Boolean(value));
      row.dataset.touched = String(touched.has(ids[index]));

      // the row is an anchor to the card it summarises, so a reader who has
      // scrolled past a question reaches it from the drawer rather than
      // hunting for it. A real href, not a click handler, so it keeps every
      // affordance a link has: the status bar preview, open-in-new-tab, and a
      // working jump on a page whose script never booted
      const jump = document.createElement("a");
      jump.className = "summary-jump";
      jump.setAttribute("href", `#qs-${ids[index]}`);

      const code = document.createElement("span");
      code.className = "summary-ref";
      code.textContent = ref;

      const name = document.createElement("span");
      name.className = "summary-name";
      name.textContent = label;

      const shown = document.createElement("span");
      shown.className = "value";
      shown.textContent = value || "—";

      jump.append(code, name, shown);
      row.append(jump);

      return row;
    }),
  );

  if (targets.count) {
    const tally = `${countUnanswered(lines)} unanswered`;
    // rewriting an identical live region re-announces it on every keystroke
    if (targets.count.textContent !== tally) targets.count.textContent = tally;
    targets.count.dataset.settled = String(countUnanswered(lines) === 0);
  }

  if (!targets.reply) return;

  // the stored template arrives with its provenance and caveats already
  // filled, because neither moves as the reader answers
  targets.reply.textContent = fillReply(targets.reply.dataset.template ?? "", {
    summary: summarise(
      lines,
      notes.length,
      probes.filter(({ moved }) => moved).length,
    ),
    answers: formatAnswers(lines, probes),
    notes,
  });
}
