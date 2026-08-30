import { SCHEMA, emptyState } from "./store-state.ts";

import type { SavedAnswer, SavedExcerpt, SavedState } from "./store-state.ts";

/**
 * reads one saved answer, or nothing when its shape is not usable
 * @param saved the entry as parsed, of unknown shape
 * @returns the answer, or undefined when the entry cannot be trusted
 */
function readAnswer(saved: unknown): SavedAnswer | undefined {
  if (!saved || typeof saved !== "object" || Array.isArray(saved))
    return undefined;

  const { kind, value, values, verdict, note } = saved as Record<
    string,
    unknown
  >;

  if (kind === "checklist")
    return {
      kind,
      values: Array.isArray(values)
        ? values.filter((entry): entry is string => typeof entry === "string")
        : [],
    };

  if (kind === "decision")
    return {
      kind,
      verdict: typeof verdict === "string" ? verdict : "",
      note: typeof note === "string" ? note : "",
    };

  if (kind === "choice" || kind === "scale" || kind === "note")
    return { kind, value: typeof value === "string" ? value : "" };

  return undefined;
}

/**
 * reads one section's excerpts, dropping any entry that is not usable
 * @param saved the entry as parsed, of unknown shape
 * @returns the excerpts worth keeping, in saved order
 */
function readExcerpts(saved: unknown): SavedExcerpt[] {
  if (!Array.isArray(saved)) return [];

  return saved.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, quote, note } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id) return [];

    return [
      {
        id,
        quote: typeof quote === "string" ? quote : "",
        note: typeof note === "string" ? note : "",
      },
    ];
  });
}

/**
 * reads a map of strings, dropping every entry of the wrong shape
 * @param saved the entry as parsed, of unknown shape
 * @returns the readable entries
 */
function readNotes(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};

  return Object.fromEntries(
    Object.entries(saved as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * reads the probe orders, dropping every entry of the wrong shape
 * @param saved the entry as parsed, of unknown shape
 * @returns the readable orders
 */
function readOrders(saved: unknown): Record<string, string[]> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};

  return Object.fromEntries(
    Object.entries(saved as Record<string, unknown>)
      .map(
        ([id, order]) =>
          [
            id,
            Array.isArray(order)
              ? order.filter((entry): entry is string => typeof entry === "string")
              : [],
          ] as const,
      )
      .filter(([, order]) => order.length > 0),
  );
}

/**
 * reads saved state, tolerating anything an older or corrupt write left.
 *
 * a reader who has answered a long board must never lose all of it to one bad
 * entry, so every branch degrades rather than throwing: unreadable JSON, a
 * non-object, a missing key, an unknown question kind, and a field of the
 * wrong type each drop only themselves.
 * @param raw the stored text, or null when nothing was ever saved
 * @returns the state, with every field present
 */
export function parseState(raw: string | null): SavedState {
  const empty = emptyState();
  if (!raw) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return empty;

  const { answers, touched, annotations, excerpts, orders } = parsed as Record<
    string,
    unknown
  >;
  const readable =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? Object.entries(answers as Record<string, unknown>)
      : [];

  return {
    answers: Object.fromEntries(
      readable
        .map(([id, saved]) => [id, readAnswer(saved)] as const)
        .filter((entry): entry is [string, SavedAnswer] => Boolean(entry[1])),
    ),
    touched: Array.isArray(touched)
      ? touched.filter((id): id is string => typeof id === "string")
      : [],
    // a board saved before annotations existed has neither key, and defaulting
    // both to empty is the whole of that migration
    annotations: readNotes(annotations),
    excerpts:
      excerpts && typeof excerpts === "object" && !Array.isArray(excerpts)
        ? Object.fromEntries(
            Object.entries(excerpts as Record<string, unknown>)
              .map(([id, list]) => [id, readExcerpts(list)] as const)
              .filter(([, list]) => list.length > 0),
          )
        : {},
    orders: readOrders(orders),
  };
}
