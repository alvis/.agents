/** what the dialog is being opened to edit. */
export interface NoteRequest {
  /** the heading the dialog shows */
  title: string;
  /** the passage the note is about, or null for a whole-section note */
  quote: string | null;
  /** what the note already says */
  note: string;
  /** whether this note already exists and can therefore be removed */
  removable: boolean;
}

/** what the reader did with the dialog. */
export interface NoteResult {
  /** what the note now says */
  note: string;
  /** whether the reader asked to remove it instead */
  removed: boolean;
}

/** the parts of the dialog this module drives. */
interface Parts {
  title: HTMLElement;
  quote: HTMLElement;
  text: HTMLTextAreaElement;
  remove: HTMLElement;
}

/**
 * finds the dialog's parts
 * @param dialog the dialog element
 * @returns its parts
 */
function partsOf(dialog: HTMLElement): Parts {
  return {
    title: dialog.querySelector<HTMLElement>("[data-note-title]")!,
    quote: dialog.querySelector<HTMLElement>("[data-note-quote]")!,
    text: dialog.querySelector<HTMLTextAreaElement>("[data-note-text]")!,
    remove: dialog.querySelector<HTMLElement>("[data-note-remove]")!,
  };
}

/**
 * wires the one dialog every note is edited in.
 *
 * a native modal dialog is what gives the focus trap, the backdrop and the
 * Escape key without any of them being reimplemented here — the platform's
 * trap is the one screen readers already understand.
 * @param dialog the dialog the page carries
 * @returns a function that opens it and resolves with what the reader did, or
 *   null when they cancelled
 */
export function installNoteDialog(
  dialog: HTMLDialogElement,
): (request: NoteRequest) => Promise<NoteResult | null> {
  const parts = partsOf(dialog);
  let settle: ((result: NoteResult | null) => void) | null = null;

  /**
   * resolves the open request exactly once
   * @param result what the reader did
   */
  const finish = (result: NoteResult | null): void => {
    const pending = settle;
    settle = null;
    if (dialog.open) dialog.close();
    pending?.(result);
  };

  dialog
    .querySelector<HTMLElement>("[data-note-cancel]")!
    .addEventListener("click", () => finish(null));
  parts.remove.addEventListener("click", () =>
    finish({ note: parts.text.value, removed: true }),
  );
  dialog
    .querySelector<HTMLFormElement>("[data-note-form]")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      finish({ note: parts.text.value, removed: false });
    });
  // Escape and the backdrop close the dialog without passing through either
  // control, and a request left unsettled would hang every later open
  dialog.addEventListener("close", () => finish(null));

  return (request) =>
    new Promise((resolve) => {
      finish(null);
      settle = resolve;
      parts.title.textContent = request.title;
      parts.quote.textContent = request.quote ?? "";
      parts.quote.hidden = request.quote === null;
      parts.text.value = request.note;
      parts.remove.hidden = !request.removable;
      dialog.showModal();
      parts.text.focus();
      // the caret goes to the end rather than the start, so editing an existing
      // note continues it instead of typing backwards into it
      parts.text.setSelectionRange(request.note.length, request.note.length);
    });
}
