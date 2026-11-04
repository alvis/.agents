/** what on a card answers its own click, and so never opens the card */
const OWN_CLICK = "a, button, .term, .tie, dialog";

/**
 * lets each detailed kanban card open the whole of its record
 *
 * the control and its dialog ship together inside the card, so the card is the
 * only thing that pairs them: no id has to survive from renderer to runtime,
 * and a card copied out of one board into another still opens its own record;
 * the control ships hidden and is revealed here, because without this module
 * it would be a button that opens nothing
 *
 * a pointer opens the card from anywhere on its face, while the control is
 * what the keyboard and a screen reader reach; the face stays ordinary text
 * rather than sitting under the control, because the board's notes quote
 * whatever the reader selects, and a click that ends a selection is a reader
 * choosing text rather than asking for the record
 * @param root where to look for detailed cards
 */
export function installKanbanDetail(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(".kanban-card")) {
    const open = card.querySelector<HTMLElement>("[data-kanban-open]");
    const dialog = card.querySelector<HTMLDialogElement>("[data-kanban-dialog]");
    if (!open || !dialog) continue;

    open.hidden = false;
    open.addEventListener("click", () => {
      dialog.showModal();
    });
    // the dialog sits inside the card, so its own clicks reach this listener
    // too and are among those it leaves alone
    card.addEventListener("click", (event) => {
      if ((event.target as Element).closest(OWN_CLICK)) return;
      if (document.getSelection()?.isCollapsed === false) return;

      dialog.showModal();
    });
    // a click on the backdrop lands on the dialog itself, while one inside it
    // lands on the body that fills it, so only the first closes it
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    // Escape, the close control and the backdrop all end the dialog without
    // passing through one handler, so the return of focus hangs off the event
    // they share
    dialog.addEventListener("close", () => {
      open.focus();
    });
  }
}
