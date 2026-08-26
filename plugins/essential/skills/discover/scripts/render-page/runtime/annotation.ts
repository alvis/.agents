import type { SavedExcerpt, SavedState } from "./store.ts";

/** mints an id for a new excerpt; injected so a test can make it predictable. */
export type Mint = () => string;

/**
 * mints an id unique enough to name one excerpt within its section.
 *
 * time alone collides when two notes are made in the same millisecond, and
 * randomness alone gives no ordering to read in storage, so this carries both.
 * @returns the id
 */
export const mintKey: Mint = () =>
  `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * reads one section's excerpts
 * @param state the state to read
 * @param sectionId the section to read
 * @returns the excerpts, in saved order, or an empty list
 */
export function excerptsOf(state: SavedState, sectionId: string): SavedExcerpt[] {
  return state.excerpts[sectionId] ?? [];
}

/**
 * counts every note the reader holds, of both kinds
 * @param state the state to read
 * @returns how many notes exist across the whole board
 */
export function countNotes(state: SavedState): number {
  return (
    Object.values(state.annotations).filter((note) => note.trim() !== "").length +
    Object.values(state.excerpts).reduce((total, list) => total + list.length, 0)
  );
}

/**
 * writes a section's whole-section note, dropping it when emptied
 * @param state the state to change, in place
 * @param sectionId the section the note belongs to
 * @param note what the reader wrote
 */
export function setNote(state: SavedState, sectionId: string, note: string): void {
  if (note.trim() === "") delete state.annotations[sectionId];
  else state.annotations[sectionId] = note;
}

/**
 * adds a selection-scoped note, or edits one already saved.
 *
 * an edit is matched by id rather than by quote, because two notes on the same
 * passage are a thing a reader may legitimately want.
 * @param state the state to change, in place
 * @param sectionId the section the passage sits in
 * @param excerpt the quote, the note, and the id being edited if there is one
 * @param mint how to name a new excerpt
 * @returns the id the excerpt now has
 */
export function putExcerpt(
  state: SavedState,
  sectionId: string,
  excerpt: { quote: string; note: string; id: string | null },
  mint: Mint = mintKey,
): string {
  const list = [...excerptsOf(state, sectionId)];
  const held = excerpt.id
    ? list.findIndex((entry) => entry.id === excerpt.id)
    : -1;

  if (held >= 0) {
    // the quote is what the reader selected then, and re-reading it from a
    // live selection during an edit would silently repoint the note
    list[held] = { ...list[held], note: excerpt.note };
  } else {
    list.push({
      id: excerpt.id ?? mint(),
      quote: excerpt.quote,
      note: excerpt.note,
    });
  }

  state.excerpts[sectionId] = list;

  return held >= 0 ? list[held].id : list[list.length - 1].id;
}

/**
 * drops one selection-scoped note
 * @param state the state to change, in place
 * @param sectionId the section it sits in
 * @param excerptId the note to drop
 */
export function dropExcerpt(
  state: SavedState,
  sectionId: string,
  excerptId: string,
): void {
  const list = excerptsOf(state, sectionId).filter(({ id }) => id !== excerptId);

  // an empty list would read back as a section that has excerpts
  if (list.length) state.excerpts[sectionId] = list;
  else delete state.excerpts[sectionId];
}

/**
 * drops every note of both kinds, leaving the answers untouched.
 *
 * clearing notes is not clearing the board: a reader who wipes their margin
 * comments has not withdrawn their answers, and conflating the two would lose
 * work the reader never offered to give up.
 * @param state the state to change, in place
 */
export function clearNotes(state: SavedState): void {
  state.annotations = {};
  state.excerpts = {};
}
