import { describe, expect, it } from "vitest";

import { cutSpans, drawRun } from "./span.ts";

import type { Span } from "./span.ts";

/** a keyword and a selection that start together and end apart. */
const CROSSING: Span[] = [
  { start: 0, end: 5, className: "t-keyword" },
  { start: 3, end: 9, className: "code-pick" },
];

describe("fn:cutSpans", () => {
  it("should cover the window exactly once, whatever overlaps it", () => {
    const cut = cutSpans(CROSSING, 0, 12);

    expect(cut.map(({ start, end }) => [start, end])).toStrictEqual([
      [0, 3],
      [3, 5],
      [5, 9],
      [9, 12],
    ]);
  });

  it("should give the crossing piece both classes rather than nest them", () => {
    // two runs that start together and end apart cannot nest without emitting
    // `<a><b></a></b>`, so the piece they share carries both names instead
    expect(cutSpans(CROSSING, 0, 12).map(({ classes }) => classes)).toStrictEqual([
      ["t-keyword"],
      ["t-keyword", "code-pick"],
      ["code-pick"],
      [],
    ]);
  });

  it("should read classes in the order the spans were given", () => {
    const reversed = cutSpans([...CROSSING].reverse(), 0, 12);

    expect(reversed[1].classes).toStrictEqual(["code-pick", "t-keyword"]);
  });

  it("should clip to the window, so a run crossing a line is drawn once a line", () => {
    const cut = cutSpans([{ start: 2, end: 30, className: "code-pick" }], 10, 20);

    expect(cut).toStrictEqual([{ start: 10, end: 20, classes: ["code-pick"] }]);
  });

  it("should hold nothing for an empty window", () => {
    expect(cutSpans(CROSSING, 4, 4)).toStrictEqual([]);
  });
});

describe("fn:drawRun", () => {
  it("should escape each slice as it writes it, so no byte becomes markup", () => {
    // the guarantee is the ordering: slicing on raw offsets and escaping at
    // emission means a span boundary can never land inside an entity
    const drawn = drawRun("a<b&c>d", [{ start: 1, end: 3, className: "t-op" }], 0, 7);

    expect(drawn).toBe('a<span class="t-op">&lt;b</span>&amp;c&gt;d');
  });

  it("should never cut an entity in half at a span boundary", () => {
    const drawn = drawRun("&&", [{ start: 0, end: 1, className: "t-op" }], 0, 2);

    expect(drawn).toBe('<span class="t-op">&amp;</span>&amp;');
    expect(drawn.match(/&amp;/g)).toHaveLength(2);
  });

  it("should leave an unspanned window as plain escaped text", () => {
    expect(drawRun("x < y", [], 0, 5)).toBe("x &lt; y");
  });

  it("should emit what is owed at an offset once the walk reaches it", () => {
    const after = new Map([[3, "<sup>1</sup>"]]);
    const drawn = drawRun("abcdef", [{ start: 0, end: 3, className: "p" }], 0, 6, after);

    expect(drawn).toBe('<span class="p">abc</span><sup>1</sup>def');
  });
});
