import { parseState } from "./store-read.ts";

/**
 * a question's saved control state.
 *
 * this keeps what the controls hold, not the sentence the reply prints. A
 * checklist round-tripped through its rendered `"a, b"` answer would lose any
 * option whose own text contains the separator, and a decision would lose the
 * boundary between its verdict and its note.
 */
export type SavedAnswer =
  | { kind: "choice" | "scale" | "note"; value: string }
  | { kind: "checklist"; values: string[] }
  | { kind: "decision"; verdict: string; note: string };

/**
 * one selection-scoped note.
 *
 * the quote is what the note is about and the note is what the reader said, so
 * both are kept: a quote alone is a highlight, and a note alone has lost what
 * it referred to.
 */
export interface SavedExcerpt {
  /** stable within its section, so an edit or a remove can name one */
  id: string;
  /** the passage this note is about, already truncated */
  quote: string;
  /** what the reader wrote */
  note: string;
}

/** the shape a page keeps in storage. */
export interface SavedState {
  /** the control state each question holds, keyed by question id */
  answers: Record<string, SavedAnswer>;
  /** every question id the reader has touched, whatever it now answers */
  touched: string[];
  /**
   * one whole-section note per section, keyed by section id.
   *
   * separate from `excerpts` rather than one list with a null quote: a section
   * note is a singleton the trigger toggles, and modelling it as a list would
   * put "which of these is the section one" into every read.
   */
  annotations: Record<string, string>;
  /** the selection-scoped notes, keyed by the same section id */
  excerpts: Record<string, SavedExcerpt[]>;
  /**
   * the order a reader put each probe's items in, keyed by probe id.
   *
   * kept as item ids rather than positions, so a probe whose authored list
   * changed restores every item it still recognises instead of shuffling the
   * new list into the old list's shape.
   */
  orders: Record<string, string[]>;
}

/** the storage surface this module needs, so a test can supply its own. */
export interface Store {
  /** reads a raw entry, or null when the key was never written */
  getItem(key: string): string | null;
  /** writes a raw entry */
  setItem(key: string, value: string): void;
  /** drops an entry */
  removeItem(key: string): void;
}

/** bumped only when a saved shape stops being readable by `parseState`. */
export const SCHEMA = "v1";

/**
 * builds a state holding nothing
 * @returns a state with every field present and empty
 */
export function emptyState(): SavedState {
  return { answers: {}, touched: [], annotations: {}, excerpts: {}, orders: {} };
}

/**
 * builds the storage key a page saves under
 * @param pageId the page's `data-page-id`
 * @returns a key namespaced by skill and schema, so pages never collide
 */
export function storageKey(pageId: string): string {
  return `essential.discover.${SCHEMA}:${pageId}`;
}

/**
 * tells whether a saved answer holds anything worth keeping.
 *
 * the caller reads every question on every refresh, so most of what reaches
 * `saveState` is empty. Without this an untouched page would still write a
 * full entry, which reads back as "this reader has been here".
 * @param saved the control state a question holds
 * @returns whether the reader has put anything into it
 */
export function hasAnswer(saved: SavedAnswer): boolean {
  if (saved.kind === "checklist") return saved.values.length > 0;
  // a typed note is real input even before a verdict is pressed
  if (saved.kind === "decision")
    return Boolean(saved.verdict) || saved.note.trim() !== "";

  return saved.value.trim() !== "";
}

/**
 * loads a page's saved state
 * @param store where the state is kept
 * @param pageId the page's `data-page-id`
 * @returns the saved state, or an empty one
 */
export function loadState(store: Store, pageId: string): SavedState {
  return parseState(store.getItem(storageKey(pageId)));
}

/**
 * saves a page's state, dropping the entry entirely once nothing is held.
 *
 * an empty write would otherwise leave a key behind that reads as "this
 * reader has been here", which is what `touched` alone is for.
 * @param store where the state is kept
 * @param pageId the page's `data-page-id`
 * @param state the state to keep
 */
export function saveState(
  store: Store,
  pageId: string,
  state: SavedState,
): void {
  const answers = Object.fromEntries(
    Object.entries(state.answers).filter(([, saved]) => hasAnswer(saved)),
  );
  // an empty note is a note the reader cleared, and keeping the key would leave
  // a section reading as annotated with nothing in it
  const annotations = Object.fromEntries(
    Object.entries(state.annotations).filter(([, note]) => note.trim() !== ""),
  );
  const excerpts = Object.fromEntries(
    Object.entries(state.excerpts)
      .map(([id, list]) => [id, list.filter(({ quote }) => quote !== "")] as const)
      .filter(([, list]) => list.length > 0),
  );

  // a probe left in the order the board drew it is not an answer, and the
  // caller sends only the ones the reader moved; an empty list would restore
  // nothing, so it is dropped rather than written
  const orders = Object.fromEntries(
    Object.entries(state.orders).filter(([, keys]) => keys.length > 0),
  );

  const held =
    Object.keys(answers).length ||
    state.touched.length ||
    Object.keys(annotations).length ||
    Object.keys(excerpts).length ||
    Object.keys(orders).length;

  if (!held) {
    store.removeItem(storageKey(pageId));

    return;
  }

  store.setItem(
    storageKey(pageId),
    JSON.stringify({
      answers,
      touched: state.touched,
      annotations,
      excerpts,
      orders,
    }),
  );
}

/**
 * the storage the page can actually use.
 *
 * a generated board is a file, and a file opened straight from disk is where
 * `localStorage` is most likely to be refused — reading the property alone can
 * throw, and a browser in private mode can hand back a store whose `setItem`
 * throws instead. Either way the whole runtime would die on its first line, so
 * an unusable store is replaced by one that keeps nothing and the page stays
 * fully operable minus the memory between visits.
 * @returns the browser's store, or a session-lived stand-in
 */
export function safeStore(): Store {
  try {
    const probe = `${storageKey("")}probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);

    return localStorage;
  } catch {
    const kept = new Map<string, string>();

    return {
      getItem: (key) => kept.get(key) ?? null,
      setItem: (key, value) => void kept.set(key, value),
      removeItem: (key) => void kept.delete(key),
    };
  }
}
