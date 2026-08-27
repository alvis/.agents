import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { renderBoardSet } from "./set.ts";

import type { BoardSet } from "./types/set.ts";

/**
 * builds a set of n boards
 * @param count how many boards the run produced
 * @returns the set
 */
function setOf(count: number): BoardSet {
  return {
    label: "Conflux discovery",
    boards: [...Array(count).keys()].map((index) => ({
      id: `board-${index}`,
      label: `Board ${index}`,
      href: `./board-${index}.html`,
    })),
  };
}

describe("fn:renderBoardSet", () => {
  it("should draw nothing when the run produced no set at all", () => {
    expect(renderBoardSet(undefined, "board-0")).toBe("");
  });

  it("should draw nothing for a one-board run", () => {
    // a list of one is a link to the page the reader is already on
    expect(renderBoardSet(setOf(1), "board-0")).toBe("");
  });

  it("should draw one entry per board once there are two", () => {
    const html = renderBoardSet(setOf(2), "board-0");

    expect(html).toContain("Conflux discovery");
    expect(html).toContain('data-board-link="board-0"');
    expect(html).toContain('data-board-link="board-1"');
    expect(html).toContain('href="./board-1.html"');
  });

  it("should mark the board being drawn, and only that one", () => {
    const html = renderBoardSet(setOf(3), "board-1");

    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
    expect(html).toContain(
      '<a class="board-link" data-board-link="board-1" href="./board-1.html" aria-current="page">',
    );
  });

  it("should refuse a set that does not list the board being drawn", () => {
    // the reader would be on a board whose own set cannot say where they are
    expect(() => renderBoardSet(setOf(2), "board-9")).toThrow(RenderError);
    expect(() => renderBoardSet(setOf(2), "board-9")).toThrow(
      /does not list the board being rendered/u,
    );
  });

  it("should refuse two boards sharing an id", () => {
    const set = setOf(2);
    set.boards[1].id = "board-0";

    expect(() => renderBoardSet(set, "board-0")).toThrow(/duplicate board id/u);
  });

  it.each([
    "https://example.com/board.html",
    "//example.com/board.html",
    "javascript:alert(1)",
    "/var/run/board.html",
  ])("should refuse the off-run href %s", (href) => {
    const set = setOf(2);
    set.boards[1].href = href;

    expect(() => renderBoardSet(set, "board-0")).toThrow(RenderError);
  });

  it("should escape a label rather than letting it close the anchor", () => {
    const set = setOf(2);
    set.boards[1].label = '</a><script>alert(1)</script>';

    expect(renderBoardSet(set, "board-0")).not.toContain("<script>alert(1)");
  });

  it("should name the entry a refusal came from", () => {
    const set = setOf(2);
    set.boards[1].label = "";

    expect(() => renderBoardSet(set, "board-0")).toThrow(/boards\[1\]\.label/u);
  });
});
