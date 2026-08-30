import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { paintRows, rowItem, rowsOf } from "./note-view.ts";
import { emptyState } from "./store.ts";

import type { NoteRow } from "./note-view.ts";
import type { SavedState } from "./store.ts";

beforeEach(() => {
  globalThis.document = {
    createElement: (tag: string) => new StubElement(tag),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * builds a state holding the given notes
 * @param change what the state holds beyond nothing
 * @returns the state
 */
function state(change: Partial<SavedState>): SavedState {
  return { ...emptyState(), ...change };
}

/**
 * builds a row to draw
 * @param change what the row says beyond the defaults
 * @returns the row
 */
function row(change: Partial<NoteRow> = {}): NoteRow {
  return {
    sectionId: "risks",
    sectionLabel: "Risks",
    quote: null,
    note: "worth watching",
    excerptId: null,
    ...change,
  };
}

/**
 * reads an element's text, its own children included
 * @param held the element to read
 * @returns every text it draws, in document order
 */
function texts(held: StubElement): string[] {
  return [
    ...(held.textContent ? [held.textContent] : []),
    ...held.children.flatMap(texts),
  ];
}

describe("fn:rowsOf", () => {
  it("should list a section's own note", () => {
    const rows = rowsOf(
      state({ annotations: { risks: "worth watching" } }),
      new Map([["risks", "Risks"]]),
    );

    expect(rows).toStrictEqual([
      {
        sectionId: "risks",
        sectionLabel: "Risks",
        quote: null,
        note: "worth watching",
        excerptId: null,
      },
    ]);
  });

  it("should list a section's excerpts", () => {
    const rows = rowsOf(
      state({ excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] } }),
      new Map([["risks", "Risks"]]),
    );

    expect(rows).toStrictEqual([
      {
        sectionId: "risks",
        sectionLabel: "Risks",
        quote: "a passage",
        note: "why",
        excerptId: "e1",
      },
    ]);
  });

  it("should put a section's own note before its excerpts", () => {
    // the section note is about the whole section, so it reads as the heading
    // the excerpts under it qualify
    const rows = rowsOf(
      state({
        annotations: { risks: "worth watching" },
        excerpts: { risks: [{ id: "e1", quote: "a passage", note: "why" }] },
      }),
      new Map([["risks", "Risks"]]),
    );

    expect(rows.map(({ excerptId }) => excerptId)).toStrictEqual([null, "e1"]);
  });

  it("should follow the order the sections were given in", () => {
    // the map arrives in document order, so the drawer lists notes in the
    // order the reader met the passages rather than by section id
    const rows = rowsOf(
      state({ annotations: { risks: "second", intro: "first" } }),
      new Map([
        ["intro", "Intro"],
        ["risks", "Risks"],
      ]),
    );

    expect(rows.map(({ note }) => note)).toStrictEqual(["first", "second"]);
  });

  it("should not count a section note that is only whitespace", () => {
    // clearing a note leaves the key behind, and an empty row is one the
    // reader cannot remove because there is nothing there to press
    const rows = rowsOf(
      state({ annotations: { risks: "   " } }),
      new Map([["risks", "Risks"]]),
    );

    expect(rows).toStrictEqual([]);
  });

  it("should skip a section holding no notes at all", () => {
    expect(rowsOf(emptyState(), new Map([["risks", "Risks"]]))).toStrictEqual([]);
  });
});

describe("fn:rowItem", () => {
  it("should name the section when drawn away from it", () => {
    const item = rowItem(row(), false);

    expect(texts(item as unknown as StubElement)).toContain("Risks");
  });

  it("should link back to the section it came from", () => {
    // the drawer lists notes far from their passages, so the label has to be
    // the way back rather than only a caption
    const item = rowItem(row(), false);
    const where = (item as unknown as StubElement).querySelector("a");

    expect((where as unknown as { href: string }).href).toBe("#s-risks");
  });

  it("should leave the section unnamed when drawn inside it", () => {
    // the section's own heading already says it, and repeating it reads as a
    // second, wrong heading
    const item = rowItem(row(), true);

    expect(texts(item as unknown as StubElement)).not.toContain("Risks");
  });

  it("should show the passage a note is about", () => {
    const item = rowItem(row({ quote: "a passage", excerptId: "e1" }), true);

    expect(texts(item as unknown as StubElement)).toContain("a passage");
  });

  it("should draw no quote for a whole-section note", () => {
    const item = rowItem(row(), true);

    expect((item as unknown as StubElement).querySelector("q")).toBeNull();
  });

  it("should say what an excerpt with no note is", () => {
    // a highlight saved without a note is deliberate, and an empty paragraph
    // is one the reader cannot tell from a rendering fault
    const item = rowItem(row({ quote: "a passage", note: "  ", excerptId: "e1" }), true);
    const text = (item as unknown as StubElement).querySelector("p")!;

    expect(text.textContent).toBe("Highlighted, no note");
    expect(text.classList.contains("is-empty")).toBe(true);
  });

  it("should name the section a row belongs to, so a press knows what it edits", () => {
    const item = rowItem(row({ quote: "a passage", excerptId: "e1" }), true);

    expect((item as unknown as StubElement).dataset.noteRow).toBe("risks");
    expect((item as unknown as StubElement).dataset.noteExcerpt).toBe("e1");
  });

  it("should leave a whole-section row without an excerpt to name", () => {
    const item = rowItem(row(), true);

    expect((item as unknown as StubElement).dataset.noteExcerpt).toBeUndefined();
  });

  it("should give every row its own edit and remove controls", () => {
    const item = rowItem(row(), true) as unknown as StubElement;

    expect(item.querySelector("[data-note-edit]")).not.toBeNull();
    expect(item.querySelector("[data-note-drop]")).not.toBeNull();
  });
});

describe("fn:paintRows", () => {
  it("should draw one item per note", () => {
    const list = new StubElement("ul");

    paintRows(list as unknown as HTMLElement, [row(), row({ note: "another" })], true);

    expect(list.children).toHaveLength(2);
  });

  it("should replace whatever the list already held", () => {
    // the list is repainted on every change, and appending instead would show
    // the reader each note once per edit
    const list = new StubElement("ul", {}, [new StubElement("li")]);

    paintRows(list as unknown as HTMLElement, [row()], true);

    expect(list.children).toHaveLength(1);
    expect(texts(list)).toContain("worth watching");
  });

  it("should empty the list when the last note goes", () => {
    const list = new StubElement("ul", {}, [new StubElement("li")]);

    paintRows(list as unknown as HTMLElement, [], true);

    expect(list.children).toStrictEqual([]);
  });
});
