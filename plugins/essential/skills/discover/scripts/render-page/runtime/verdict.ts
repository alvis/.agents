/**
 * wires the two-verdict decision buttons, delegated from the document.
 *
 * a button fires neither `input` nor `change`, so the listeners that keep the
 * tally fresh never see a verdict: without this branch the tally and the reply
 * would silently never update. Delegating from the document is what makes it
 * survive however many decision blocks a page carries.
 * @param onAnswer called with the field whose verdict the reader just moved
 */
export function installVerdicts(onAnswer: (field: HTMLElement) => void): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest?.<HTMLElement>("[data-verdict]");
    if (!button) return;

    const field = button.closest<HTMLElement>(
      "[data-question-kind='decision']",
    );
    if (!field) return;

    const was = button.getAttribute("aria-pressed") === "true";

    // the two verdicts are mutually exclusive, and pressing the active one
    // again clears the field back to unmarked
    for (const other of field.querySelectorAll<HTMLElement>("[data-verdict]"))
      other.setAttribute("aria-pressed", "false");
    if (!was) button.setAttribute("aria-pressed", "true");

    const changing = !was && button.dataset.verdict === "change";
    field.querySelector<HTMLElement>("[data-verdict-note]")!.hidden = !changing;

    // Change without a note reads "- <label>: Change", which tells the reader
    // nothing actionable, so the field is revealed and focused straight away
    if (changing) field.querySelector<HTMLTextAreaElement>("textarea")?.focus();

    onAnswer(field);
  });
}
