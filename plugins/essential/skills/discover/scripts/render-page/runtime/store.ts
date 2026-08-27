import { parseState } from "./store-read.ts";
import { PROBE_KEY, SCHEMA, emptyState, storageKey } from "./store-state.ts";

import type { SavedAnswer, SavedState, Store } from "./store-state.ts";

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
  // whatever the browser will not keep is held here for the rest of the visit,
  // so a refused write costs the reader the memory between visits and nothing
  // in front of them right now
  const kept = new Map<string, string>();
  let live = true;

  try {
    localStorage.setItem(PROBE_KEY, "1");
    localStorage.removeItem(PROBE_KEY);
  } catch {
    live = false;
  }

  // answering the probe does not promise the next write will be accepted — a
  // full quota is the ordinary way it is not — and an unguarded write throws
  // out of the module body, taking every install after it down with it
  const keep = (act: () => void): boolean => {
    if (!live) return false;
    try {
      act();

      return true;
    } catch {
      return false;
    }
  };

  return {
    // memory holds only what the browser refused, so it is the newer of the two
    getItem: (key) => kept.get(key) ?? (live ? localStorage.getItem(key) : null),
    setItem: (key, value) => {
      if (keep(() => localStorage.setItem(key, value))) kept.delete(key);
      else kept.set(key, value);
    },
    removeItem: (key) => {
      kept.delete(key);
      keep(() => localStorage.removeItem(key));
    },
  };
}

export { SCHEMA, emptyState, storageKey } from "./store-state.ts";
export type { SavedAnswer, SavedExcerpt, SavedState, Store } from "./store-state.ts";
