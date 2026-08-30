import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseState } from "./store-read.ts";
import { emptyState, hasAnswer, loadState, safeStore, saveState, storageKey } from "./store.ts";

import type { SavedState, Store } from "./store.ts";

/**
 * builds an in-memory store
 * @param seed entries the store starts with
 * @returns the store, with its backing map readable
 */
function memory(seed: Record<string, string> = {}): Store & {
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(seed));

  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

describe("fn:storageKey", () => {
  it("should namespace by skill and schema, so two pages never collide", () => {
    expect(storageKey("board-a")).toBe("essential.discover.v1:board-a");
    expect(storageKey("board-b")).not.toBe(storageKey("board-a"));
  });
});

describe("fn:parseState", () => {
  it("should read a state that was never saved as empty", () => {
    expect(parseState(null)).toStrictEqual(emptyState());
  });

  it("should read every question kind back in its own shape", () => {
    const saved: SavedState = {
      ...emptyState(),
      answers: {
        pick: { kind: "choice", value: "b" },
        rate: { kind: "scale", value: "3" },
        note: { kind: "note", value: "typed" },
        list: { kind: "checklist", values: ["a", "b"] },
        call: { kind: "decision", verdict: "change", note: "hold" },
      },
      touched: ["pick", "call"],
    };

    expect(parseState(JSON.stringify(saved))).toStrictEqual(saved);
  });

  it("should keep a checklist option whose own text contains the separator", () => {
    // the reason the store keeps control state and not the rendered sentence:
    // round-tripping through "a, b" would split this option in two
    const state = parseState(
      JSON.stringify({
        answers: { list: { kind: "checklist", values: ["cost, then speed"] } },
        touched: [],
      }),
    );

    expect(state.answers.list).toStrictEqual({
      kind: "checklist",
      values: ["cost, then speed"],
    });
  });

  it("should read unparseable text as empty rather than throwing", () => {
    expect(parseState("{not json")).toStrictEqual(emptyState());
  });

  it("should read a non-object as empty rather than throwing", () => {
    for (const raw of ["[]", '"text"', "7", "null"])
      expect(parseState(raw)).toStrictEqual(emptyState());
  });

  it("should drop only the entries it cannot trust", () => {
    // a reader who has answered a long board must not lose all of it to one
    // bad entry, so an unknown kind and a malformed one drop alone
    const state = parseState(
      JSON.stringify({
        ...emptyState(),
        answers: {
          good: { kind: "choice", value: "b" },
          unknown: { kind: "spinner", value: "b" },
          malformed: "not an object",
          missing: {},
        },
        touched: ["good", 7, null],
      }),
    );

    expect(Object.keys(state.answers)).toStrictEqual(["good"]);
    expect(state.touched).toStrictEqual(["good"]);
  });

  it("should fill a field of the wrong type with its empty value", () => {
    const state = parseState(
      JSON.stringify({
        ...emptyState(),
        answers: {
          call: { kind: "decision", verdict: 7, note: null },
          list: { kind: "checklist", values: "a,b" },
          pick: { kind: "choice" },
        },
      }),
    );

    expect(state.answers.call).toStrictEqual({
      kind: "decision",
      verdict: "",
      note: "",
    });
    expect(state.answers.list).toStrictEqual({ kind: "checklist", values: [] });
    expect(state.answers.pick).toStrictEqual({ kind: "choice", value: "" });
  });
});

describe("fn:hasAnswer", () => {
  it("should read an untouched control of every kind as holding nothing", () => {
    expect(hasAnswer({ kind: "choice", value: "" })).toBe(false);
    expect(hasAnswer({ kind: "scale", value: "" })).toBe(false);
    expect(hasAnswer({ kind: "note", value: "  \n " })).toBe(false);
    expect(hasAnswer({ kind: "checklist", values: [] })).toBe(false);
    expect(hasAnswer({ kind: "decision", verdict: "", note: " " })).toBe(false);
  });

  it("should read any real input as worth keeping", () => {
    expect(hasAnswer({ kind: "choice", value: "b" })).toBe(true);
    expect(hasAnswer({ kind: "checklist", values: ["a"] })).toBe(true);
    expect(hasAnswer({ kind: "decision", verdict: "approve", note: "" })).toBe(
      true,
    );
  });

  it("should keep a note typed before any verdict was pressed", () => {
    expect(hasAnswer({ kind: "decision", verdict: "", note: "hold" })).toBe(
      true,
    );
  });
});

describe("fn:saveState", () => {
  it("should round-trip through load", () => {
    const store = memory();
    const state: SavedState = {
      ...emptyState(),
      answers: { pick: { kind: "choice", value: "b" } },
      touched: ["pick"],
      annotations: { scope: "worth a second look" },
      excerpts: { scope: [{ id: "e1", quote: "the passage", note: "why" }] },
    };

    saveState(store, "board", state);

    expect(loadState(store, "board")).toStrictEqual(state);
  });

  it("should drop the entry entirely once nothing is held", () => {
    // an empty write leaves a key that reads as "this reader has been here",
    // which is the one thing `touched` is for
    const store = memory({
      [storageKey("board")]: '{"answers":{},"touched":["pick"]}',
    });

    saveState(store, "board", { ...emptyState(), touched: [] });

    expect(store.entries.has(storageKey("board"))).toBe(false);
  });

  it("should write nothing for a page the reader only opened", () => {
    // the caller reads every question on every refresh, so an untouched page
    // reaches this with one empty entry per question, not an empty map
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      answers: {
        pick: { kind: "choice", value: "" },
        rate: { kind: "scale", value: "" },
        list: { kind: "checklist", values: [] },
        call: { kind: "decision", verdict: "", note: "" },
        note: { kind: "note", value: "" },
      },
      touched: [],
    });

    expect(store.entries.size).toBe(0);
  });

  it("should keep only the questions the reader actually answered", () => {
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      answers: {
        pick: { kind: "choice", value: "b" },
        rate: { kind: "scale", value: "" },
      },
      touched: [],
    });

    expect(Object.keys(loadState(store, "board").answers)).toStrictEqual([
      "pick",
    ]);
  });

  it("should keep touched even when every answer was cleared", () => {
    const store = memory();

    saveState(store, "board", { ...emptyState(), touched: ["pick"] });

    expect(loadState(store, "board").touched).toStrictEqual(["pick"]);
  });

  it("should keep one page's state out of another's", () => {
    const store = memory();

    saveState(store, "board-a", {
      ...emptyState(),
      answers: { pick: { kind: "choice", value: "a" } },
    });

    expect(loadState(store, "board-b")).toStrictEqual(emptyState());
  });
});

describe("fn:safeStore", () => {
  /** whatever `localStorage` held before a test replaced it. */
  let held: unknown;

  beforeEach(() => {
    held = Reflect.get(globalThis, "localStorage");
  });

  afterEach(() => {
    if (held === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Reflect.set(globalThis, "localStorage", held);
  });

  it("should hand back the browser's store when it works", () => {
    const kept = new Map<string, string>();
    Reflect.set(globalThis, "localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    });

    safeStore().setItem("k", "v");

    expect(kept.get("k")).toBe("v");
  });

  it("should leave no probe behind after testing the store", () => {
    const kept = new Map<string, string>();
    Reflect.set(globalThis, "localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    });
    safeStore();

    expect([...kept.keys()]).toStrictEqual([]);
  });

  it("should fall back when reading the store throws at all", () => {
    // a board is a file, and a file opened from disk is where the property
    // itself is refused; without the fallback the runtime dies on line one
    Reflect.deleteProperty(globalThis, "localStorage");
    const store = safeStore();
    store.setItem("k", "v");

    expect(store.getItem("k")).toBe("v");
  });

  it("should fall back when the store accepts reads but refuses writes", () => {
    // private browsing hands back a store that looks usable and throws on the
    // first write, so a read-only probe would not have caught it
    Reflect.set(globalThis, "localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    });
    const store = safeStore();
    store.setItem("k", "v");

    expect(store.getItem("k")).toBe("v");
  });

  it("should forget everything the stand-in was told to drop", () => {
    Reflect.deleteProperty(globalThis, "localStorage");
    const store = safeStore();
    store.setItem("k", "v");
    store.removeItem("k");

    expect(store.getItem("k")).toBeNull();
  });
});

describe("fn:parseState annotations", () => {
  it("should read a board saved before annotations existed as simply having none", () => {
    // this is the whole of that migration: the two keys are absent, not wrong
    const state = parseState('{"answers":{},"touched":["pick"]}');

    expect(state.annotations).toStrictEqual({});
    expect(state.excerpts).toStrictEqual({});
    expect(state.touched).toStrictEqual(["pick"]);
  });

  it("should keep the section notes it can read and drop the rest", () => {
    const { annotations } = parseState(
      '{"annotations":{"scope":"a note","bad":7,"gone":null}}',
    );

    expect(annotations).toStrictEqual({ scope: "a note" });
  });

  it("should drop an excerpt with no id, since nothing could edit or remove it", () => {
    const { excerpts } = parseState(
      '{"excerpts":{"scope":[{"quote":"q","note":"n"},{"id":"e1","quote":"q","note":"n"}]}}',
    );

    expect(excerpts.scope).toStrictEqual([{ id: "e1", quote: "q", note: "n" }]);
  });

  it("should default an excerpt's text fields rather than dropping the whole note", () => {
    const { excerpts } = parseState('{"excerpts":{"scope":[{"id":"e1","quote":5}]}}');

    expect(excerpts.scope).toStrictEqual([{ id: "e1", quote: "", note: "" }]);
  });

  it("should drop a section whose excerpts were all unusable rather than keeping an empty list", () => {
    const { excerpts } = parseState('{"excerpts":{"scope":[{"note":"orphan"}],"kept":[{"id":"e1"}]}}');

    expect(Object.keys(excerpts)).toStrictEqual(["kept"]);
  });

  it("should survive excerpts saved as something other than a map", () => {
    expect(parseState('{"excerpts":["nope"]}').excerpts).toStrictEqual({});
  });
});

describe("fn:saveState annotations", () => {
  it("should drop a section note the reader emptied", () => {
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      annotations: { scope: "kept", cleared: "   " },
    });

    expect(loadState(store, "board").annotations).toStrictEqual({ scope: "kept" });
  });

  it("should keep annotations alive even when no question was ever answered", () => {
    // a reader can annotate a board without answering it, and that must survive
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      excerpts: { scope: [{ id: "e1", quote: "the passage", note: "" }] },
    });

    expect(loadState(store, "board").excerpts.scope).toHaveLength(1);
  });

  it("should still drop the entry when the annotations are empty too", () => {
    const store = memory({ [storageKey("board")]: '{"annotations":{"a":"b"}}' });

    saveState(store, "board", emptyState());

    expect(store.getItem(storageKey("board"))).toBeNull();
  });

  it("should drop an excerpt that lost its quote, since a note about nothing has no anchor", () => {
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      excerpts: { scope: [{ id: "e1", quote: "", note: "orphan" }] },
    });

    expect(store.getItem(storageKey("board"))).toBeNull();
  });
});

describe("fn:saveState orders", () => {
  it("should keep a ranking the reader made, so a reload does not undo it", () => {
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      orders: { "rollout-order": ["rollout-order-2", "rollout-order-0"] },
    });

    expect(loadState(store, "board").orders).toStrictEqual({
      "rollout-order": ["rollout-order-2", "rollout-order-0"],
    });
  });

  it("should hold a page whose only interaction was a reorder", () => {
    // the entry is dropped when nothing is held, and a ranking is something
    const store = memory();

    saveState(store, "board", {
      ...emptyState(),
      orders: { probe: ["probe-1", "probe-0"] },
    });

    expect(store.getItem(storageKey("board"))).not.toBeNull();
  });

  it("should drop a probe whose saved order says nothing", () => {
    const store = memory();

    saveState(store, "board", { ...emptyState(), orders: { probe: [] } });

    expect(store.getItem(storageKey("board"))).toBeNull();
  });

  it("should read a board saved before probes existed as simply having none", () => {
    expect(parseState('{"answers":{},"touched":["q"]}').orders).toStrictEqual({});
  });
});
