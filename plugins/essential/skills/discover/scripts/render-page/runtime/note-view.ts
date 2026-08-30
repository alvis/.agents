import { excerptsOf } from "./annotation.ts";

import type { SavedState } from "./store.ts";

/** one row in a notes list, whichever kind of note it came from. */
export interface NoteRow {
  /** the section the note belongs to */
  sectionId: string;
  /** the section's own label, for the drawer where sections are not visible */
  sectionLabel: string;
  /** the passage, or null for a whole-section note */
  quote: string | null;
  /** what the reader wrote */
  note: string;
  /** the excerpt's id, or null for a whole-section note */
  excerptId: string | null;
}

/**
 * lists every note the reader holds, section notes before their excerpts
 * @param state the state to read
 * @param labels each section's label, keyed by section id, in document order
 * @returns the rows, in section order
 */
export function rowsOf(
  state: SavedState,
  labels: Map<string, string>,
): NoteRow[] {
  return [...labels].flatMap(([sectionId, sectionLabel]) => {
    const note = state.annotations[sectionId] ?? "";
    const own = note.trim()
      ? [{ sectionId, sectionLabel, quote: null, note, excerptId: null }]
      : [];

    return [
      ...own,
      ...excerptsOf(state, sectionId).map(({ id, quote, note: text }) => ({
        sectionId,
        sectionLabel,
        quote,
        note: text,
        excerptId: id,
      })),
    ];
  });
}

/**
 * builds one list item for a note, with its own edit and remove controls
 * @param row the note to draw
 * @param inSection whether this is drawn inside its own section, where the
 *   section's label would only repeat the heading above it
 * @returns the list item
 */
export function rowItem(row: NoteRow, inSection: boolean): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "note-row";
  item.dataset.noteRow = row.sectionId;
  if (row.excerptId) item.dataset.noteExcerpt = row.excerptId;

  if (!inSection) {
    const where = document.createElement("a");
    where.className = "note-where";
    where.href = `#s-${row.sectionId}`;
    where.textContent = row.sectionLabel;
    item.append(where);
  }

  if (row.quote !== null) {
    const quote = document.createElement("q");
    quote.className = "note-quote-text";
    quote.textContent = row.quote;
    item.append(quote);
  }

  const text = document.createElement("p");
  text.className = "note-text";
  // an excerpt saved with no note is a highlight, and saying so beats an empty
  // paragraph the reader cannot tell from a rendering fault
  text.textContent = row.note.trim() || "Highlighted, no note";
  if (!row.note.trim()) text.classList.add("is-empty");
  item.append(text);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "note-edit";
  edit.dataset.noteEdit = "";
  edit.textContent = "Edit";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "note-remove-row";
  remove.dataset.noteDrop = "";
  remove.textContent = "Remove";

  const actions = document.createElement("div");
  actions.className = "note-row-actions";
  actions.append(edit, remove);
  item.append(actions);

  return item;
}

/**
 * fills a list with notes, replacing whatever it held
 * @param list the list to fill
 * @param rows the notes to draw
 * @param inSection whether the list sits inside the section it draws
 */
export function paintRows(
  list: HTMLElement,
  rows: NoteRow[],
  inSection: boolean,
): void {
  list.replaceChildren(...rows.map((row) => rowItem(row, inSection)));
}
