import { describe, expect, it } from "vitest";

import {
  clearNotes,
  countNotes,
  dropExcerpt,
  excerptsOf,
  mintKey,
  putExcerpt,
  setNote,
} from "./annotation.ts";
import { emptyState } from "./store.ts";

import type { SavedState } from "./store.ts";

/**
 * builds a state carrying whatever a test needs
 * @param change what to override on an empty state
 * @returns the state
 */
function state(change: Partial<SavedState> = {}): SavedState {
  return { ...emptyState(), ...change };
}

/** mints predictable ids so a test can assert on them. */
function counter(): () => string {
  let next = 0;

  return () => `e${++next}`;
}

describe("fn:setNote", () => {
  it("should keep what the reader wrote", () => {
    const held = state();
    setNote(held, "scope", "worth a second look");

    expect(held.annotations.scope).toBe("worth a second look");
  });

  it("should drop the key when the reader empties the note", () => {
    const held = state({ annotations: { scope: "held" } });
    setNote(held, "scope", "   ");

    expect("scope" in held.annotations).toBe(false);
  });
});

describe("fn:putExcerpt", () => {
  it("should add a note and return the id it minted", () => {
    const held = state();
    const id = putExcerpt(held, "scope", { quote: "q", note: "n", id: null }, counter());

    expect(id).toBe("e1");
    expect(excerptsOf(held, "scope")).toStrictEqual([{ id: "e1", quote: "q", note: "n" }]);
  });

  it("should edit by id rather than replacing the list", () => {
    const held = state({
      excerpts: { scope: [{ id: "e1", quote: "first", note: "one" }] },
    });
    putExcerpt(held, "scope", { quote: "ignored", note: "changed", id: "e1" });

    expect(excerptsOf(held, "scope")).toStrictEqual([
      { id: "e1", quote: "first", note: "changed" },
    ]);
  });

  it("should not repoint an edited note at a different passage", () => {
    // the quote is what was selected when the note was made; an edit that took
    // the live selection would silently move the note to another passage
    const held = state({
      excerpts: { scope: [{ id: "e1", quote: "the original", note: "n" }] },
    });
    putExcerpt(held, "scope", { quote: "something else entirely", note: "n2", id: "e1" });

    expect(excerptsOf(held, "scope")[0].quote).toBe("the original");
  });

  it("should allow two notes on the same passage", () => {
    const held = state();
    const mint = counter();
    putExcerpt(held, "scope", { quote: "same", note: "one", id: null }, mint);
    putExcerpt(held, "scope", { quote: "same", note: "two", id: null }, mint);

    expect(excerptsOf(held, "scope")).toHaveLength(2);
  });

  it("should keep sections apart", () => {
    const held = state();
    const mint = counter();
    putExcerpt(held, "a", { quote: "q", note: "n", id: null }, mint);
    putExcerpt(held, "b", { quote: "q", note: "n", id: null }, mint);

    expect(excerptsOf(held, "a")).toHaveLength(1);
    expect(excerptsOf(held, "b")).toHaveLength(1);
  });
});

describe("fn:dropExcerpt", () => {
  it("should remove only the note named", () => {
    const held = state({
      excerpts: {
        scope: [
          { id: "e1", quote: "a", note: "one" },
          { id: "e2", quote: "b", note: "two" },
        ],
      },
    });
    dropExcerpt(held, "scope", "e1");

    expect(excerptsOf(held, "scope")).toStrictEqual([{ id: "e2", quote: "b", note: "two" }]);
  });

  it("should drop the section key once its last note goes", () => {
    // an empty list reads back as a section that has excerpts
    const held = state({ excerpts: { scope: [{ id: "e1", quote: "a", note: "" }] } });
    dropExcerpt(held, "scope", "e1");

    expect("scope" in held.excerpts).toBe(false);
  });

  it("should do nothing when the note is already gone", () => {
    const held = state({ excerpts: { scope: [{ id: "e1", quote: "a", note: "" }] } });
    dropExcerpt(held, "scope", "gone");

    expect(excerptsOf(held, "scope")).toHaveLength(1);
  });
});

describe("fn:countNotes", () => {
  it("should count both kinds together", () => {
    const held = state({
      annotations: { a: "one", b: "two" },
      excerpts: { a: [{ id: "e1", quote: "q", note: "n" }] },
    });

    expect(countNotes(held)).toBe(3);
  });

  it("should not count a section note that is only whitespace", () => {
    expect(countNotes(state({ annotations: { a: "  " } }))).toBe(0);
  });
});

describe("fn:clearNotes", () => {
  it("should drop every note of both kinds", () => {
    const held = state({
      annotations: { a: "one" },
      excerpts: { a: [{ id: "e1", quote: "q", note: "n" }] },
    });
    clearNotes(held);

    expect(countNotes(held)).toBe(0);
  });

  it("should leave the answers alone, since clearing notes is not withdrawing answers", () => {
    const held = state({
      answers: { pick: { kind: "choice", value: "b" } },
      touched: ["pick"],
      annotations: { a: "one" },
    });
    clearNotes(held);

    expect(held.answers).toStrictEqual({ pick: { kind: "choice", value: "b" } });
    expect(held.touched).toStrictEqual(["pick"]);
  });
});

describe("fn:mintKey", () => {
  it("should not collide across a burst of notes made together", () => {
    const keys = new Set(Array.from({ length: 200 }, () => mintKey()));

    expect(keys.size).toBe(200);
  });
});
