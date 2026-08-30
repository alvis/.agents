import { describe, expect, it } from "vitest";

import { renderDeviations } from "./deviation.ts";
import { RenderError } from "../error.ts";

import type { Block, Deviation } from "../types.ts";

/** the departure every case below starts from. */
const ENTRY: Deviation = {
  title: "The quiz does not use the disposition machinery",
  planned: "Score it through the existing answer store.",
  found: "Disposition prints the recommended value into the reply.",
  chose: "A separate answer key the reply never reads.",
};

/**
 * renders one deviations block
 * @param block what to render, filled out from a working default
 * @returns the block as HTML
 */
function draw(
  block: Partial<Extract<Block, { type: "deviations" }>> = {},
): string {
  return renderDeviations(
    { type: "deviations", items: [ENTRY], ...block } as Extract<
      Block,
      { type: "deviations" }
    >,
    "sections[0].blocks[0]",
  );
}

describe("fn:renderDeviations", () => {
  it("should draw both accounts of the same thing, each under its own word", () => {
    const drawn = draw();

    expect(drawn).toContain('<div class="deviation-side" data-side="planned">');
    expect(drawn).toContain("<p class=\"deviation-label\">The plan said</p>");
    expect(drawn).toContain('<div class="deviation-side" data-side="found">');
    expect(drawn).toContain(
      "<p class=\"deviation-label\">The code revealed</p>",
    );
    expect(drawn).toContain("Score it through the existing answer store.");
    expect(drawn).toContain(
      "Disposition prints the recommended value into the reply.",
    );
  });

  it("should draw the choice under both accounts rather than beside them", () => {
    const drawn = draw();
    const pair = drawn.indexOf('<div class="deviation-pair">');
    const outcome = drawn.indexOf('<dl class="deviation-outcome">');

    expect(pair).toBeGreaterThan(-1);
    expect(outcome).toBeGreaterThan(pair);
    expect(drawn).toContain(
      "<dt>Chose</dt><dd>A separate answer key the reply never reads.</dd>",
    );
  });

  it("should say nothing about revisiting a departure nobody would reopen", () => {
    expect(draw()).not.toContain("Worth revisiting when");
    expect(
      draw({ items: [{ ...ENTRY, revisit: "The reply is asked to score." }] }),
    ).toContain(
      "<dt>Worth revisiting when</dt><dd>The reply is asked to score.</dd>",
    );
  });

  it("should number the departures, because the count is part of the report", () => {
    const drawn = draw({ items: [ENTRY, { ...ENTRY, title: "Second" }] });

    expect(drawn).toContain('<ol class="deviations">');
    expect(drawn.match(/<li class="deviation">/gu)).toHaveLength(2);
  });

  it("should draw a heading only where the author wrote one", () => {
    expect(draw()).not.toContain("deviation-heading");
    expect(draw({ title: "Where it went" })).toContain(
      '<h3 class="deviation-heading">Where it went</h3>',
    );
  });

  it("should refuse a block with no departures in it", () => {
    expect(() => draw({ items: [] })).toThrow(RenderError);
    expect(() => draw({ items: [] })).toThrow(
      "sections[0].blocks[0].items: required non-empty array, received []",
    );
  });

  it("should name the departure that is missing a title, by its own path", () => {
    expect(() =>
      draw({ items: [ENTRY, { ...ENTRY, title: undefined } as Deviation] }),
    ).toThrow("sections[0].blocks[0].items[1].title");
  });

  it("should name the side that was left out, by its own path", () => {
    expect(() =>
      draw({ items: [{ ...ENTRY, found: undefined } as unknown as Deviation] }),
    ).toThrow("sections[0].blocks[0].items[0].found");
  });

  it("should escape a title rather than letting it become markup", () => {
    const drawn = draw({ items: [{ ...ENTRY, title: "<script>x</script>" }] });

    expect(drawn).not.toContain("<script>");
    expect(drawn).toContain("&lt;script&gt;");
  });
});
