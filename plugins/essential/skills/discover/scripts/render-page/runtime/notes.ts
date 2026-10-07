import { clearNotes, countNotes, dropExcerpt, excerptsOf, putExcerpt, setNote } from "./annotation.ts";
import { paintRows, rowsOf } from "./note-view.ts";
import { installSelection } from "./selection.ts";

import type { NoteRequest, NoteResult } from "./note-dialog.ts";
import type { Passages } from "./passage-dom.ts";
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
  /** marks, measures and reveals the passages excerpts are about */
  passages: Passages;
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
  const titles = new Map(
    sections.map((section) => [
      section.dataset.sectionId ?? "",
      section.dataset.sectionTitle ?? "",
    ]),
  );
  const byId = new Map(sections.map((section) => [section.dataset.sectionId ?? "", section]));

  /** redraws every list and count from the state, then persists it. */
  const repaint = (): void => {
    for (const section of sections) {
      const id = section.dataset.sectionId ?? "";
      const list = section.querySelector<HTMLElement>("[data-note-list]");
      if (list) paintRows(list, rowsOf(host.state, new Map([[id, ""]]), titles), true);
      host.passages.paint(section, excerptsOf(host.state, id));
      const trigger = section.querySelector<HTMLElement>("[data-note-add]");
      const held =
        (host.state.annotations[id]?.trim() ? 1 : 0) +
        excerptsOf(host.state, id).length;
      if (trigger)
        trigger.querySelector<HTMLElement>("[data-note-tally]")!.textContent =
          held ? String(held) : "";
    }

    const total = countNotes(host.state);
    paintRows(host.panel, rowsOf(host.state, labels, titles), false);
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
   * @param place where a new passage sits, and the card holding it
   */
  const editExcerpt = async (
    sectionId: string,
    quote: string,
    excerptId: string | null,
    place: Pick<Picked, "range" | "card"> | null = null,
  ): Promise<void> => {
    // measured before the editor opens: focusing its field moves the
    // selection, and the range read from it would follow
    const section = byId.get(sectionId);
    const at = place && section ? host.passages.anchor(section, place.range) : undefined;
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
      putExcerpt(host.state, sectionId, {
        quote,
        note: result.note,
        id: excerptId,
        at,
        card: place?.card,
      });
    repaint();
  };

  const pending = installSelection((picked: Picked) => {
    void editExcerpt(picked.sectionId, picked.quote, null, picked);
  });

  for (const section of sections) installSection(section, pending, editSection, editExcerpt);

  // one delegated handler rather than one per row, because every repaint
  // replaces the rows and per-row listeners would have to be rebound each time
  for (const list of [host.panel, ...sections])
    list.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      // a link in the row navigates, and a press on a marked passage is the
      // section's own handler below
      if (target?.closest?.("a, mark[data-note-mark]")) return;
      const row = target?.closest?.<HTMLElement>("[data-note-row]");
      if (!row) return;

      const sectionId = row.dataset.noteRow ?? "";
      const excerptId = row.dataset.noteExcerpt ?? null;

      if (target?.closest("[data-note-drop]")) {
        if (excerptId) dropExcerpt(host.state, sectionId, excerptId);
        else setNote(host.state, sectionId, "");
        repaint();

        return;
      }

      // the whole row reopens its note, not only its Edit control: the row is
      // where a reader looks for the note, and the passage it names may be
      // folded away in a closed disclosure
      if (excerptId) {
        const section = byId.get(sectionId);
        if (section) host.passages.reveal(section, excerptId);
        void editExcerpt(sectionId, "", excerptId);
      } else void editSection(sectionId);
    });

  for (const section of sections) {
    const sectionId = section.dataset.sectionId ?? "";
    /**
     * reopens the note a marked passage carries
     * @param target what the event reached
     * @returns whether it was a marked passage
     */
    const reopen = (target: EventTarget | null): boolean => {
      const mark = (target as HTMLElement | null)?.closest?.<HTMLElement>("mark[data-note-mark]");
      if (!mark) return false;
      void editExcerpt(sectionId, "", mark.dataset.noteMark ?? "");

      return true;
    };

    section.addEventListener("click", (event) => {
      // a drag that starts and ends on a mark raises a click as well, and
      // opening the editor then would take the selection being made
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      reopen((event as MouseEvent).target);
    });
    section.addEventListener("keydown", (event) => {
      const { key, target } = event as KeyboardEvent;
      if (key !== "Enter" && key !== " ") return;
      if (reopen(target)) event.preventDefault();
    });
  }

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
  editExcerpt: (
    sectionId: string,
    quote: string,
    excerptId: string | null,
    place?: Pick<Picked, "range" | "card"> | null,
  ) => Promise<void>,
): void {
  const id = section.dataset.sectionId ?? "";
  const trigger = section.querySelector<HTMLElement>("[data-note-add]");
  if (!trigger) return;

  // pressing a button collapses the selection, and the selectionchange that
  // follows clears the pending quote — so the control armed to note a selection
  // would open a whole-section note instead. preventDefault on mousedown holds
  // the selection for a pointer; the quote read at pointerdown is for touch,
  // where the collapse can already have happened by the time the press lands
  let armed: Picked | null = null;
  trigger.addEventListener("pointerdown", () => {
    const found = pending();
    armed = found?.sectionId === id ? found : null;
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
    const picked = found?.sectionId === id ? found : armed;
    armed = null;

    if (picked) void editExcerpt(id, picked.quote, null, picked);
    else void editSection(id);
  });
}
