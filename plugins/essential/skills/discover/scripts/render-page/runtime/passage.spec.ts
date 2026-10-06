import { describe, expect, it } from "vitest";

import { findPassage, markPieces, offsetBefore, offsetOf, piecesOf } from "./passage.ts";

/** a diff table's two cells, as the section body's text nodes hold them. */
const CELLS = ["The service retries ", "three", " times.", "The service retries ", "five", " times."];

describe("fn:findPassage", () => {
  it("should trust where the passage was saved when its text still reads there", () => {
    const text = CELLS.join("");
    const start = text.lastIndexOf("retries");

    expect(findPassage(text, "retries five", { start, end: start + 12 })).toStrictEqual({
      start,
      end: start + 12,
    });
  });

  it("should match across cells the selection read with a tab between them", () => {
    // the browser's selection text separates cells and lines with whitespace
    // the text nodes never held, so whitespace cannot decide a match
    const text = CELLS.join("");
    const start = text.indexOf("three");

    expect(findPassage(text, "three times. The service", { start, end: start + 23 })).toStrictEqual({
      start,
      end: start + 23,
    });
  });

  it("should take the occurrence nearest where it was saved once the saved span drifts", () => {
    const text = `x${CELLS.join("")}`;
    const second = text.lastIndexOf("The service");

    expect(findPassage(text, "The service", { start: second - 1, end: second + 10 })).toStrictEqual({
      start: second,
      end: second + 11,
    });
  });

  it("should find a passage saved with no span by its first occurrence", () => {
    const text = CELLS.join("");

    expect(findPassage(text, "five")).toStrictEqual({
      start: text.indexOf("five"),
      end: text.indexOf("five") + 4,
    });
  });

  it("should mark the kept start of a quote that was truncated", () => {
    const text = "alpha beta gamma delta";

    expect(findPassage(text, "alpha beta…", { start: 0, end: 22 })).toStrictEqual({ start: 0, end: 22 });
    expect(findPassage(text, "alpha beta…")).toStrictEqual({ start: 0, end: 10 });
  });

  it("should find nothing where the passage no longer reads", () => {
    expect(findPassage("other text", "five", { start: 0, end: 4 })).toBeNull();
  });

  it("should find nothing for a quote that is only whitespace or an ellipsis", () => {
    expect(findPassage("abc", " … ")).toBeNull();
  });
});

describe("fn:piecesOf", () => {
  it("should split a span across the text nodes it covers", () => {
    const lengths = CELLS.map((piece) => piece.length);
    const start = CELLS.join("").indexOf("three");

    expect(piecesOf(lengths, { start, end: start + 23 })).toStrictEqual([
      { index: 1, from: 0, to: 5 },
      { index: 2, from: 0, to: 7 },
      { index: 3, from: 0, to: 11 },
    ]);
  });

  it("should skip an empty node rather than wrap nothing", () => {
    expect(piecesOf([2, 0, 2], { start: 1, end: 3 })).toStrictEqual([
      { index: 0, from: 1, to: 2 },
      { index: 2, from: 0, to: 1 },
    ]);
  });
});

describe("fn:offsetOf", () => {
  it("should count every character in the nodes before the one named", () => {
    expect(offsetOf([3, 4, 5], 2, 1)).toBe(8);
  });
});

describe("fn:markPieces", () => {
  it("should leave out whitespace a table or list holds between its cells", () => {
    const runs = [
      { text: "retries five", structural: false },
      { text: "\n  ", structural: true },
      { text: "times", structural: false },
    ];

    expect(markPieces(runs, { start: 8, end: 20 })).toStrictEqual([
      { index: 0, from: 8, to: 12 },
      { index: 2, from: 0, to: 5 },
    ]);
  });

  it("should keep whitespace that sits inside prose", () => {
    const runs = [
      { text: "retries", structural: false },
      { text: " ", structural: false },
      { text: "five", structural: false },
    ];

    expect(markPieces(runs, { start: 0, end: 12 })).toHaveLength(3);
  });

  it("should keep a structural run's text that is not whitespace", () => {
    expect(markPieces([{ text: "stray", structural: true }], { start: 0, end: 5 })).toStrictEqual([
      { index: 0, from: 0, to: 5 },
    ]);
  });
});

describe("fn:offsetBefore", () => {
  it("should count every node ending before or exactly at the boundary", () => {
    expect(offsetBefore([5, 3, 4], [-1, 0, 1])).toBe(8);
  });

  it("should count nothing when every node ends after the boundary", () => {
    expect(offsetBefore([5, 3], [1, 1])).toBe(0);
  });
});
