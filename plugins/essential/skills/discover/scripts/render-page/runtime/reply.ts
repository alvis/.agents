/**
 * fills a reply template's markers with the blocks they stand for.
 *
 * each replacement is a function, not a string: a typed answer containing
 * `$&` or a backreference would otherwise be expanded by
 * `replaceAll` as a pattern and silently corrupt the reply the reader copies.
 * @param template the reply body, whose `{{name}}` markers mark the insertions
 * @param blocks each marker's name and the text it stands for
 * @returns the reply with every named marker replaced
 */
export function fillTemplate(
  template: string,
  blocks: Record<string, string>,
): string {
  return Object.entries(blocks).reduce(
    (filled, [name, block]) => filled.replaceAll(`{{${name}}}`, () => block),
    template,
  );
}

/** one note the reader wrote, as the reply carries it. */
export interface ReplyNote {
  /** the section the note belongs to */
  sectionLabel: string;
  /** the passage it is about, or null for a whole-section note */
  quote: string | null;
  /** what the note says */
  note: string;
}

/**
 * fills a reply template and guarantees the reader's own words reach it.
 *
 * where the author placed `{{notes}}` the notes go there, which is the whole
 * point of an author-controlled template. Where they did not, the notes are
 * appended rather than dropped: the summary above already tells the recipient
 * how many notes the reply carries, and a template that forgot the marker
 * would otherwise announce notes that are nowhere in the message.
 * @param template the reply body the author wrote
 * @param parts the summary, the answers, and every note the reader holds
 * @returns the filled reply
 */
export function fillReply(
  template: string,
  parts: { summary: string; answers: string; notes: ReplyNote[] },
): string {
  const notes = formatNotes(parts.notes);
  const filled = fillTemplate(template, {
    summary: parts.summary,
    answers: parts.answers,
    notes,
  });

  return parts.notes.length && !template.includes("{{notes}}")
    ? `${filled}\n\n## Notes\n\n${notes}`
    : filled;
}

/**
 * how the reply treats a question's answer.
 *
 * a decision is something the reader settles; a follow-up is something they may
 * ask for. Collapsing the two is what makes a reply read as though an untouched
 * optional question were a refusal, or an unasked follow-up an instruction.
 */
export type Response = "decision" | "follow-up";

/** one question's label and the answer it currently carries. */
export interface AnswerLine {
  /**
   * the citation code drawn beside the question.
   *
   * it rides on the answer rather than being looked up beside it, because
   * every place that prints an answer — the drawer row, the copied reply —
   * has to print the same code, and one of them fetching it separately is how
   * they drift apart.
   */
  ref: string;
  /** the question's label, as the drawer lists it */
  label: string;
  /** the answer, or the empty string when the question is unanswered */
  value: string;
  /** whether the reply reads the answer as a decision or a follow-up */
  response: Response;
  /** the answers the page marked as recommended, empty where it marked none */
  recommended: string[];
  /** whether the reader answered it themselves, as against a restore */
  touched: boolean;
}

/**
 * reads the answer a decision question carries.
 *
 * the note is prompted, not required, so a bare Change still counts as an
 * answer; unmarked is the empty string, exactly like a radio group with
 * nothing checked, so no verdict state is stored anywhere but the buttons.
 * @param verdict the pressed verdict, or the empty string when unmarked
 * @param note the change note, which only a `change` verdict carries
 * @returns the answer as it reaches the reply
 */
export function decisionAnswer(verdict: string, note: string): string {
  if (!verdict) return "";
  if (verdict !== "change") return "Approve";

  const asked = note.trim();

  return asked ? `Change — ${asked}` : "Change";
}

/**
 * counts how many of the answers are still empty
 * @param lines every question's label and answer
 * @returns the number of unanswered questions
 */
export function countUnanswered(lines: AnswerLine[]): number {
  return lines.filter(({ value }) => !value).length;
}

/**
 * renders the notes block a reply carries.
 *
 * the quote is what makes a note answerable by whoever reads the reply — a
 * note without the passage it is about arrives as an opinion with no subject,
 * so the two travel together or not at all.
 * @param rows every note the reader holds, in section order
 * @returns the block, or a plain marker when the reader noted nothing
 */
export function formatNotes(rows: ReplyNote[]): string {
  if (!rows.length) return "(no notes)";

  return rows
    .map(({ sectionLabel, quote, note }) => {
      const said = note.trim() || "(highlighted, no note)";
      const head = `- ${sectionLabel}: ${said}`;

      return quote === null ? head : `${head}\n  > ${quote}`;
    })
    .join("\n");
}
