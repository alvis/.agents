import { describe, expect, it } from "vitest";

import { renderProbe } from "./probe.ts";
import { freshIds } from "../id.ts";

import type { PageIds } from "../id.ts";
import type { Block } from "../types.ts";

/**
 * builds an empty id ledger
 * @returns the ledger
 */
function ids(): PageIds {
  return freshIds();
}

/**
 * renders one probe
 * @param block what to render, filled out from a working default
 * @param ledger the ids claimed so far
 * @returns the probe as HTML
 */
function draw(
  block: Partial<Extract<Block, { type: "probe" }>> = {},
  ledger: PageIds = ids(),
): string {
  return renderProbe(
    {
      type: "probe",
      id: "first-try",
      label: "Order these by what you would try first",
      items: ["Add an index", "Cache the read", "Shard the table"],
      ...block,
    } as Extract<Block, { type: "probe" }>,
    "sections[0].blocks[0]",
    ledger,
  );
}

describe("fn:renderProbe", () => {
  it("should draw one item per entry, in the order authored", () => {
    const drawn = draw();

    expect(
      [...drawn.matchAll(/class="probe-text">([^<]+)</g)].map((hit) => hit[1]),
    ).toEqual(["Add an index", "Cache the read", "Shard the table"]);
  });

  it("should key an item by its position, not its text", () => {
    // two items reading the same would otherwise share one saved slot
    const drawn = draw({ items: ["Same", "Same"] });

    expect(drawn).toContain('data-probe-item="first-try-0"');
    expect(drawn).toContain('data-probe-item="first-try-1"');
  });

  it("should reach an item without a pointer", () => {
    const drawn = draw();

    expect(drawn).toContain('tabindex="0"');
    expect(drawn).toContain('data-probe-move="up"');
    expect(drawn).toContain('data-probe-move="down"');
  });

  it("should name what each move control moves", () => {
    // a page of bare arrows announces as "button, button, button" and says
    // nothing about which item any of them belongs to
    expect(draw()).toContain('aria-label="Move Add an index earlier"');
  });

  it("should carry the probe's own label for the reply to name it by", () => {
    expect(draw()).toContain(
      'data-probe-label="Order these by what you would try first"',
    );
  });

  it("should escape an item that carries markup", () => {
    const drawn = draw({ items: ['<img src=x onerror="alert(1)">'] });

    expect(drawn).not.toContain("<img");
    expect(drawn).toContain("&lt;img");
  });

  it("should refuse a second probe claiming the same id", () => {
    const ledger = ids();
    draw({}, ledger);

    expect(() => draw({}, ledger)).toThrow(/duplicate probe id/);
  });

  it("should refuse a probe with nothing to order", () => {
    expect(() => draw({ items: [] })).toThrow(/items/);
  });

  it("should refuse an item that is not text", () => {
    expect(() => draw({ items: [42] as unknown as string[] })).toThrow(
      /items\[0\]/,
    );
  });
});
