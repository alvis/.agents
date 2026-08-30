/**
 * finds the control that would answer a question the way the board recommends.
 *
 * a question already carrying an answer returns nothing: bulk approval fills
 * the gaps a reader left, and must never overwrite a judgement they made. A
 * question the board recommends nothing for also returns nothing, because there
 * is no answer to give it that the page could claim the reader agreed to.
 * @param field the question
 * @returns the control to press, or null where there is nothing to press
 */
function pending(field: HTMLElement): HTMLElement | null {
  const kind = field.dataset.questionKind;

  if (kind === "decision")
    return field.querySelector('[data-verdict][aria-pressed="true"]')
      ? null
      : field.querySelector<HTMLElement>('[data-verdict="approve"]');

  if (kind !== "choice" || field.querySelector("input:checked")) return null;

  return field.querySelector<HTMLElement>("input[data-recommended]");
}

/**
 * writes what the button will do, so the count is read before it is pressed.
 *
 * the count is of answers this press can supply, not of questions the reader
 * has left — a free-text question is unmarked too, and the board recommends
 * nothing for it. Calling these "the unmarked questions" beside a drawer
 * counting four of them would put two contradicting numbers on one screen.
 * @param count how many questions the press would answer
 * @returns the button's label
 */
function label(count: number): string {
  return `Approve ${count} recommended answer${count === 1 ? "" : "s"}`;
}

/**
 * approves every question the reader left unmarked, in one press.
 *
 * on a twenty-five question board most answers are the recommended one and the
 * reader's real work is the handful that are not. Without this they have to
 * press every agreement individually, and a board is abandoned half-answered.
 * @param button the control that offers the bulk press
 * @param fields every question on the page
 * @returns a repaint, for the caller to run whenever an answer changes
 */
export function installBulkApprove(
  button: HTMLElement,
  fields: HTMLElement[],
): () => void {
  /** redraws the button from what is still unmarked */
  const paint = (): void => {
    const count = fields.filter((field) => pending(field)).length;
    button.hidden = count === 0;
    if (count) button.textContent = label(count);
  };

  button.addEventListener("click", () => {
    const targets = fields
      .map((field) => pending(field))
      .filter((target): target is HTMLElement => target !== null);
    if (!targets.length) return;

    // this one press makes a claim on the reader's behalf that reaches whoever
    // reads the reply, so it says how many and what it will pick first
    const many = targets.length === 1 ? "" : "s";
    if (
      !window.confirm(
        `Answer ${targets.length} question${many} with what this board recommends? Nothing you have already answered changes, and any question this board recommends nothing for is left for you.`,
      )
    )
      return;

    // a click, not a state assignment: it is what raises the events the page
    // records an answer from, so each one counts as the reader's own
    for (const target of targets) target.click();
    paint();
  });

  paint();

  return paint;
}
