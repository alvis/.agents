import { clearNotes, countNotes, dropExcerpt, excerptsOf, putExcerpt, setNote } from "./annotation.ts";
import { paintRows, rowsOf } from "./note-view.ts";
import { installSelection } from "./selection.ts";

import type { NoteRequest, NoteResult } from "./note-dialog.ts";
import type { Picked } from "./selection.ts";
import type { SavedState } from "./store.ts";

/** what the notes feature needs from the page around it. */
export interface NotesHost {
  /** the state to read and change */
  state: SavedState;
  /** persists whatever changed */
  save: () => void;
  /** opens the shared editor */
  ask: (request: NoteRequest) => Promise<NoteResult | null>;
  /** the drawer list every note is collected into */
  panel: HTMLElement;
  /** the drawer's note count */
  count: HTMLElement;
  /** the control that drops every note at once */
  clear: HTMLButtonElement;
}

/**
 * wires reader annotations across the page.
 *
 * two kinds share one store and one editor: a whole-section note, and any
 * number of selection-scoped notes under it.
 * @param host what the feature reads, writes and draws into
 */
export function installNotes(host: NotesHost): void {
  const sections = [...document.querySelectorAll<HTMLElement>("[data-section]")];
  const labels = new Map(
    sections.map((section) => [
      section.dataset.sectionId ?? "",
      section.dataset.sectionLabel ?? "",
    ]),
  );

  /** redraws every list and count from the state, then persists it. */
  const repaint = (): void => {
    for (const section of sections) {
      const id = section.dataset.sectionId ?? "";
      const list = section.querySelector<HTMLElement>("[data-note-list]");
      if (list) paintRows(list, rowsOf(host.state, new Map([[id, ""]])), true);
      const trigger = section.querySelector<HTMLElement>("[data-note-add]");
      const held =
        (host.state.annotations[id]?.trim() ? 1 : 0) +
        excerptsOf(host.state, id).length;
      if (trigger)
        trigger.querySelector<HTMLElement>("[data-note-tally]")!.textContent =
          held ? String(held) : "";
    }

    const total = countNotes(host.state);
    paintRows(host.panel, rowsOf(host.state, labels), false);
    host.count.textContent = `${total} ${total === 1 ? "note" : "notes"}`;
    host.clear.hidden = total === 0;
    host.save();
  };

  /**
   * opens the editor for a whole-section note
   * @param sectionId the section to note
   */
  const editSection = async (sectionId: string): Promise<void> => {
    const held = host.state.annotations[sectionId] ?? "";
    const result = await host.ask({
      title: `Note on ${labels.get(sectionId) ?? "this section"}`,
      quote: null,
      note: held,
      removable: held.trim() !== "",
    });
    if (!result) return;
    setNote(host.state, sectionId, result.removed ? "" : result.note);
    repaint();
  };

  /**
   * opens the editor for a selection-scoped note
   * @param sectionId the section the passage sits in
   * @param quote the passage
   * @param excerptId the note being edited, or null for a new one
   */
  const editExcerpt = async (
    sectionId: string,
    quote: string,
    excerptId: string | null,
  ): Promise<void> => {
    const held = excerptsOf(host.state, sectionId).find(({ id }) => id === excerptId);
    const result = await host.ask({
      title: `Note on ${labels.get(sectionId) ?? "this passage"}`,
      quote: held?.quote ?? quote,
      note: held?.note ?? "",
      removable: Boolean(held),
    });
    if (!result) return;

    if (result.removed && excerptId) dropExcerpt(host.state, sectionId, excerptId);
    else if (!result.removed)
      putExcerpt(host.state, sectionId, { quote, note: result.note, id: excerptId });
    repaint();
  };

  const pending = installSelection(({ sectionId, quote }: Picked) => {
    void editExcerpt(sectionId, quote, null);
  });

  for (const section of sections) installSection(section, pending, editSection, editExcerpt);

  // one delegated handler rather than one per row, because every repaint
  // replaces the rows and per-row listeners would have to be rebound each time
  for (const list of [host.panel, ...sections])
    list.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-note-edit], [data-note-drop]",
      );
      const row = button?.closest<HTMLElement>("[data-note-row]");
      if (!button || !row) return;

      const sectionId = row.dataset.noteRow ?? "";
      const excerptId = row.dataset.noteExcerpt ?? null;

      if (button.hasAttribute("data-note-drop")) {
        if (excerptId) dropExcerpt(host.state, sectionId, excerptId);
        else setNote(host.state, sectionId, "");
        repaint();

        return;
      }

      if (excerptId) void editExcerpt(sectionId, "", excerptId);
      else void editSection(sectionId);
    });

  host.clear.addEventListener("click", () => {
    // destructive and not undoable, so it asks
    if (!window.confirm("Remove every note on this board? Your answers are kept."))
      return;
    clearNotes(host.state);
    repaint();
  });

  repaint();
}

/**
 * wires one section's own note control and list
 * @param section the section to wire
 * @param pending reads the passage currently selected, if any
 * @param editSection opens a whole-section note
 * @param editExcerpt opens a selection-scoped note
 */
function installSection(
  section: HTMLElement,
  pending: () => Picked | null,
  editSection: (sectionId: string) => Promise<void>,
  editExcerpt: (sectionId: string, quote: string, excerptId: string | null) => Promise<void>,
): void {
  const id = section.dataset.sectionId ?? "";
  const trigger = section.querySelector<HTMLElement>("[data-note-add]");
  if (!trigger) return;

  // pressing a button collapses the selection, and the selectionchange that
  // follows clears the pending quote — so the control armed to note a selection
  // would open a whole-section note instead. preventDefault on mousedown holds
  // the selection for a pointer; the quote read at pointerdown is for touch,
  // where the collapse can already have happened by the time the press lands
  let armed: string | null = null;
  trigger.addEventListener("pointerdown", () => {
    const found = pending();
    armed = found?.sectionId === id ? found.quote : null;
  });
  // a press that leaves the button never becomes a click, so the quote it armed
  // must not survive to be used by a later one
  for (const name of ["pointerleave", "pointercancel"] as const)
    trigger.addEventListener(name, () => {
      armed = null;
    });
  trigger.addEventListener("mousedown", (event) => event.preventDefault());
  trigger.addEventListener("click", () => {
    const found = pending();
    const quote = found?.sectionId === id ? found.quote : armed;
    armed = null;

    if (quote) void editExcerpt(id, quote, null);
    else void editSection(id);
  });
}
