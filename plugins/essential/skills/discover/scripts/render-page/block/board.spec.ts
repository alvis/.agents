import { describe, expect, it } from "vitest";

import { emptyContext } from "../context.ts";
import { RenderError } from "../error.ts";
import { renderBoards } from "./board.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

const BLOCK = { type: "boards" } as Extract<Block, { type: "boards" }>;

/**
 * builds a context for a board rendered inside a run
 * @param current the id of the board being drawn
 * @returns the context
 */
function inRun(current: string): PageContext {
  return {
    ...emptyContext(),
    id: current,
    set: {
      label: "Conflux discovery",
      boards: [
        {
          id: "specimen",
          label: "Brand specimen",
          href: "./specimen.html",
          blurb: "What the product already looks like.",
        },
        { id: "hub", label: "Board hub", href: "./hub.html" },
      ],
    },
  };
}

describe("fn:renderBoards", () => {
  it("should index every board of the run, blurb and all", () => {
    const html = renderBoards(BLOCK, "blocks[0]", inRun("hub"));

    expect(html).toContain('href="./specimen.html"');
    expect(html).toContain("Brand specimen");
    expect(html).toContain("What the product already looks like.");
    expect(html).toContain('href="./hub.html"');
  });

  it("should make the whole card the link, blurb included", () => {
    // HB1: a card whose heading alone is the link leaves the blurb — most of
    // the box the reader is aiming at — as dead space
    const card = /<li>(.*?)<\/li>/u.exec(
      renderBoards(BLOCK, "blocks[0]", inRun("hub")),
    )?.[1];

    expect(card).toMatch(/^<a class="board-card"[^>]*>/u);
    expect(card).toContain("What the product already looks like.</span></a>");
    // the list item carries nothing: the anchor is the card, so the border,
    // the hover and the focus ring all land on the same box
    expect(card).not.toContain("board-card-link");
  });

  it("should mark the board the reader is on", () => {
    const html = renderBoards(BLOCK, "blocks[0]", inRun("hub"));

    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
    expect(html).toMatch(/data-board-link="hub"[^>]*aria-current="page"/u);
  });

  it("should index a run of one, unlike the sidebar list", () => {
    // the hub is a page whose whole content is the index; drawing it empty
    // would leave a heading over nothing
    const page = inRun("only");
    page.set = {
      label: "One board",
      boards: [{ id: "only", label: "Only board", href: "./only.html" }],
    };

    expect(renderBoards(BLOCK, "blocks[0]", page)).toContain("Only board");
  });

  it("should refuse a hub rendered outside a run", () => {
    expect(() => renderBoards(BLOCK, "blocks[0]", emptyContext())).toThrow(
      RenderError,
    );
    expect(() => renderBoards(BLOCK, "blocks[0]", emptyContext())).toThrow(
      /rendered on its own/u,
    );
  });

  it("should escape a blurb rather than letting it write markup", () => {
    const page = inRun("hub");
    page.set!.boards[0].blurb = "<img src=x onerror=alert(1)>";

    const html = renderBoards(BLOCK, "blocks[0]", page);

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
