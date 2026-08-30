import { describe, expect, it } from "vitest";

import { renderLedger } from "./ledger.ts";
import { RenderError } from "../error.ts";

import type { Block, LedgerEntry, LedgerGroup } from "../types.ts";

/** the row every case below starts from. */
const ENTRY: LedgerEntry = {
  code: "AAA01",
  title: "Write the parser",
  status: "working",
  tone: "busy",
  facts: [
    { label: "Owner", value: "Ada" },
    { label: "Depends on", value: "—" },
  ],
};

/** the group every case below starts from. */
const GROUP: LedgerGroup = {
  label: "page-renderer",
  note: "finish the parser",
  progress: { done: 1, of: 4 },
  facts: [{ label: "Phase", value: "working" }],
  entries: [ENTRY],
};

/**
 * renders one ledger block
 * @param groups the groups to draw, filled out from a working default
 * @returns the block as HTML
 */
function draw(groups: Partial<LedgerGroup>[] = [{}]): string {
  return renderLedger(
    {
      type: "ledger",
      groups: groups.map((group) => ({ ...GROUP, ...group })),
    } as Extract<Block, { type: "ledger" }>,
    "sections[0].blocks[0]",
  );
}

describe("fn:renderLedger", () => {
  it("should open a row onto every field the record holds about it", () => {
    // this is the whole block: a card carries the id, the summary and the
    // status, and a reader who wanted the rest had to go back to the source
    const drawn = draw();

    expect(drawn).toContain('<details class="ledger-row"><summary>');
    expect(drawn).toContain('<span class="ledger-code">AAA01</span>');
    expect(drawn).toContain("<dt>Owner</dt><dd>Ada</dd>");
    expect(drawn).toContain("<dt>Depends on</dt><dd>—</dd>");
  });

  it("should draw a row with nothing behind it flat rather than as a twisty", () => {
    // a disclosure that opens onto nothing teaches a reader that the rows do
    // not repay opening, which costs every row that does
    const drawn = draw([{ entries: [{ ...ENTRY, facts: [] }] }]);

    expect(drawn).toContain('<div class="ledger-row is-flat">');
    expect(drawn).not.toContain('<details class="ledger-row">');
  });

  it("should state a row's condition as a word as well as a colour", () => {
    // red and green are one channel, and a ledger read in greyscale still has
    // to say which rows are stuck
    const drawn = draw([{ entries: [{ ...ENTRY, status: "blocked", tone: "bad" }] }]);

    expect(drawn).toContain('<li class="ledger-entry" data-tone="bad">');
    expect(drawn).toContain('<span class="ledger-status">blocked</span>');
  });

  it("should treat a row that claims no tone as making no claim", () => {
    const { tone, ...toneless } = ENTRY;

    expect(tone).toBe("busy");
    expect(draw([{ entries: [toneless] }])).toContain('data-tone="neutral"');
  });

  it("should open its groups, so the board answers something before a click", () => {
    const drawn = draw();

    expect(drawn).toContain('<details class="ledger-group" open>');
    expect(drawn).toContain('<span class="ledger-group-name">page-renderer</span>');
  });

  it("should draw a group's progress as a bar that also states its numbers", () => {
    const drawn = draw();

    expect(drawn).toContain('aria-label="1 of 4 done"');
    expect(drawn).toContain('style="--fill:25%"');
    expect(drawn).toContain('<span class="ledger-count">1/4</span>');
  });

  it("should say what an empty group means rather than drawing nothing", () => {
    const drawn = draw([
      { entries: [], empty: "every recorded task is done" },
    ]);

    expect(drawn).toContain(
      '<p class="ledger-empty">every recorded task is done</p>',
    );
    expect(drawn).not.toContain('<ul class="ledger-entries">');
  });

  it("should give every disclosure a twisty of its own", () => {
    // a summary laid out in columns renders no native marker, so a row that
    // gained something worth opening lost the affordance that says so
    const drawn = draw();

    expect(drawn.match(/<span class="ledger-twist" aria-hidden="true">▸/gu)).toHaveLength(2);
  });

  it("should refuse a reading of more done than there are, naming its path", () => {
    // drawn as a full bar, 5 of 4 would report a group that had finished
    expect(() => draw([{ progress: { done: 5, of: 4 } }])).toThrow(
      new RenderError(
        "sections[0].blocks[0].groups[0].progress: 5 done out of 4 is more than all of them",
      ),
    );
  });

  it("should refuse a tone it cannot draw, naming its path and the words it knows", () => {
    expect(() =>
      draw([{ entries: [{ ...ENTRY, tone: "urgent" as LedgerEntry["tone"] }] }]),
    ).toThrow(
      new RenderError(
        'sections[0].blocks[0].groups[0].entries[0].tone: required one of "good", "busy", "bad", "neutral", received "urgent"',
      ),
    );
  });

  it("should escape what the record wrote, wherever it wrote it", () => {
    // a ledger is drawn from a file somebody else edits, which is the case
    // where an author byte becoming markup is not a hypothetical
    const drawn = draw([
      {
        label: "<script>",
        entries: [
          { ...ENTRY, code: "<b>", status: "<i>", facts: [{ label: "<u>", value: "x" }] },
        ],
      },
    ]);

    expect(drawn).not.toContain("<script>");
    expect(drawn).toContain("&lt;script&gt;");
    expect(drawn).toContain("&lt;b&gt;");
    expect(drawn).toContain("&lt;i&gt;");
    expect(drawn).toContain("<dt>&lt;u&gt;</dt>");
  });
});
