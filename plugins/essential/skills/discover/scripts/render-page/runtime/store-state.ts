/*
 * the saved shape, its namespace, and its empty value.
 *
 * reading a saved state and writing one both need these, and neither needs
 * the other: holding them here is what keeps `store.ts` and `store-read.ts`
 * from importing each other.
 */

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

/** everything this page writes lives under one namespace. */
const NAMESPACE = `essential.discover.${SCHEMA}`;

/**
 * builds the storage key a page saves under
 * @param pageId the page's `data-page-id`
 * @returns a key namespaced by skill and schema, so pages never collide
 */
export function storageKey(pageId: string): string {
  return `${NAMESPACE}:${pageId}`;
}

/**
 * the key a store is probed with before it is trusted.
 *
 * it uses "?" where a page key uses ":", so it cannot spell one whatever the
 * page is called: the probe was `storageKey("")` followed by "probe", which is
 * `storageKey("probe")` exactly, and a board carrying that id had its whole
 * saved state removed by the probe's own cleanup on every single load.
 */
export const PROBE_KEY = `${NAMESPACE}?probe`;
