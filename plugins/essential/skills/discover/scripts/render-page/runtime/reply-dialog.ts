/**
 * wires the reply's modal.
 *
 * the dialog is emitted open, so a page whose scripts never arrive shows the
 * reply as a plain panel at the foot of the document. Closing it is the first
 * thing this does: that is what turns the panel into something the reader
 * summons, and it is also why the control that summons it ships hidden — a
 * button that opens nothing is worse than no button.
 *
 * the modal itself is the platform's. `showModal` is what supplies the focus
 * trap, the backdrop and Escape, all three of which a hand-rolled version would
 * get subtly wrong in the way screen readers notice.
 * @param dialog the `[data-reply-dialog]` element
 * @param open the control that opens it
 */
export function installReplyDialog(
  dialog: HTMLDialogElement,
  open: HTMLElement,
): void {
  let opener: HTMLElement | null = null;

  dialog.close();
  open.hidden = false;

  open.addEventListener("click", () => {
    opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
  });

  // Escape and the close control both end the dialog without passing through
  // any one handler, so the return of focus hangs off the event they share
  dialog.addEventListener("close", () => {
    opener?.focus();
    opener = null;
  });
}
