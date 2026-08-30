import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { emptyContext } from "../context.ts";
import { RenderError } from "../error.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/**
 * renders one block at a fixed path, with a fresh id ledger each time
 * @param block the block to render
 * @param page a context to reuse, when a test needs two blocks to share one
 * @returns the rendered HTML
 */
function html(block: unknown, page?: PageContext): string {
  return renderBlock(block as Block, "b", page ?? emptyContext());
}

describe("fn:renderBlock tradeoffs", () => {
  const block = {
    type: "tradeoffs",
    wins: ["Ships this quarter."],
    costs: ["One more service to run."],
    failsWhen: ["Traffic passes 5k rps."],
  };

  it("should draw all three columns, each keyed for the stylesheet", () => {
    const drawn = html(block);

    expect(drawn).toContain('<div class="tradeoff-panel">');
    expect(drawn).toContain('<div class="tradeoff-column" data-tradeoff="wins">');
    expect(drawn).toContain('<div class="tradeoff-column" data-tradeoff="costs">');
    expect(drawn).toContain('<div class="tradeoff-column" data-tradeoff="fails">');
    expect(drawn).toContain("<li>Traffic passes 5k rps.</li>");
  });

  it("should not reuse the choice block's .tradeoffs class", () => {
    // the choice block's inline pros/cons strip owns .tradeoffs and lays it
    // out as a flex row; reusing the name here would restyle both
    expect(html(block)).not.toContain('class="tradeoffs"');
  });

  it("should head the panel with its own title when one is given", () => {
    expect(html({ ...block, title: "Managed queue" })).toContain(
      "<h3>Managed queue</h3>",
    );
  });

  it("should fall back to a heading rather than draw an unlabelled panel", () => {
    expect(html(block)).toContain("<h3>Trade-offs</h3>");
  });

  it("should refuse an empty failsWhen rather than draw it blank", () => {
    // wins and costs alone read as a balanced case; an empty third column
    // would quietly claim the author found nowhere this stops working
    expect(() => html({ ...block, failsWhen: [] })).toThrow(
      new RenderError("b.failsWhen: required non-empty array, received []"),
    );
  });

  it("should carry inline runs into a column", () => {
    expect(
      html({
        ...block,
        costs: [["Adds ", { kind: "provenance", level: "estimated", text: "~4h/wk" }]],
      }),
    ).toContain('data-provenance="estimated"');
  });
});

describe("fn:renderBlock table row provenance", () => {
  const columns = ["Option", "Notes"];

  it("should keep a bare cell array working", () => {
    const drawn = html({
      type: "table",
      columns,
      rows: [[{ text: "Postgres" }, { text: "Known" }]],
    });

    expect(drawn).toContain("<tr>");
    expect(drawn).not.toContain("data-row-provenance");
  });

  it("should mark the row and pill the last cell", () => {
    const drawn = html({
      type: "table",
      columns,
      rows: [
        {
          cells: [{ text: "Postgres" }, { text: "Known" }],
          provenance: { level: "estimated", text: "Q3 pipeline" },
        },
      ],
    });

    expect(drawn).toContain('<tr data-row-provenance="estimated">');
    expect(drawn).toContain(
      '<span class="provenance row-provenance" data-provenance="estimated"><span class="provenance-level">estimated</span> Q3 pipeline</span>',
    );
    // the pill rides the last cell, so the row stays as wide as one making
    // no claim: two <td> for two columns, never three
    expect(drawn.match(/<td/g)).toHaveLength(2);
  });

  it("should draw the pill once, on the last cell only", () => {
    const drawn = html({
      type: "table",
      columns,
      rows: [
        {
          cells: [{ text: "A" }, { text: "B" }],
          provenance: { level: "assumed" },
        },
      ],
    });

    // the class, not the bare word: data-row-provenance on the <tr> carries
    // it too, so a looser pattern would count the row marker as a pill
    expect(drawn.match(/class="provenance row-provenance"/g)).toHaveLength(1);
    expect(drawn).toContain('B<span class="provenance row-provenance"');
  });

  it("should keep a verdict cell's assistive label alongside the pill", () => {
    const drawn = html({
      type: "table",
      columns,
      rows: [
        {
          cells: [{ text: "A" }, { text: "B", verdict: "bad" }],
          provenance: { level: "invented" },
        },
      ],
    });

    expect(drawn).toContain('<span class="sr-only">costly: </span>');
    expect(drawn).toContain('data-provenance="invented"');
  });

  it("should refuse a level outside the scale by path", () => {
    expect(() =>
      html({
        type: "table",
        columns,
        rows: [{ cells: [{ text: "A" }, { text: "B" }], provenance: { level: "vibes" } }],
      }),
    ).toThrow(RenderError);
  });

  it("should still refuse a shaped row whose width misses the header", () => {
    expect(() =>
      html({ type: "table", columns, rows: [{ cells: [{ text: "A" }] }] }),
    ).toThrow(
      new RenderError("b.rows[0]: required 2 cells to match columns, received 1"),
    );
  });

  it("should name both accepted row shapes when neither was given", () => {
    expect(() => html({ type: "table", columns, rows: [2] })).toThrow(
      new RenderError(
        "b.rows[0]: required an array of cells or a row object, received 2",
      ),
    );
  });
});

describe("fn:renderBlock finding citation anchors", () => {
  const item = { title: "Retries amplify load", severity: "elevated", text: "Body." };

  it("should draw the id as a mono badge and an anchor target", () => {
    const drawn = html({ type: "findings", items: [{ ...item, id: "F-3" }] });

    expect(drawn).toContain('<li class="finding" id="f-F-3" data-severity="elevated" data-filter-item="elevated">');
    expect(drawn).toContain('<span class="finding-id">F-3</span>');
  });

  it("should leave a finding without an id unmarked", () => {
    const drawn = html({ type: "findings", items: [item] });

    expect(drawn).toContain('<li class="finding" data-severity="elevated" data-filter-item="elevated">');
    expect(drawn).not.toContain("finding-id");
  });

  it("should refuse two findings sharing one anchor", () => {
    // a citation that names two findings names neither, and the second would
    // emit a duplicate DOM id whose fragment link never reaches it
    expect(() =>
      html({ type: "findings", items: [{ ...item, id: "F-1" }, { ...item, id: "F-1" }] }),
    ).toThrow(new RenderError('b.items[1].id: duplicate finding id "F-1"'));
  });

  it("should refuse an id that cannot survive as a fragment", () => {
    expect(() => html({ type: "findings", items: [{ ...item, id: "F 1" }] })).toThrow(
      RenderError,
    );
  });

  it("should let a finding and a question share an authored name", () => {
    // they sit in different peer groups because the f- and q- prefixes keep
    // them apart in the DOM, so refusing this would be a false collision
    const page = emptyContext();
    html({ type: "note", id: "alpha", label: "L", ask: "A" }, page);

    expect(() =>
      html({ type: "findings", items: [{ ...item, id: "alpha" }] }, page),
    ).not.toThrow();
  });
});
