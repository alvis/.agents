import { describe, expect, it } from "vitest";

import { collectClaims, formatCaveats, formatClaims } from "./claim.ts";

describe("fn:collectClaims", () => {
  it("should find an inline run wherever it sits", () => {
    expect(
      collectClaims([
        {
          type: "prose",
          text: ["We serve ", { kind: "provenance", level: "measured", text: "40ms p99" }],
        },
      ]),
    ).toEqual([{ level: "measured", subject: "40ms p99" }]);
  });

  it("should find a row's claim and a source's without being taught the shape", () => {
    // the sweep keys on the fields a claim carries, not on where it sits, so
    // a block type added later carries provenance the moment it holds one
    expect(
      collectClaims({
        rows: [{ cells: [{ text: "Postgres" }], provenance: { level: "estimated", text: "Q3 pipeline" } }],
        sources: [{ label: "Load test, 2026-07", level: "measured" }],
      }),
    ).toEqual([
      { level: "estimated", subject: "Q3 pipeline" },
      { level: "measured", subject: "Load test, 2026-07" },
    ]);
  });

  it("should keep reading order, not scale order", () => {
    expect(
      collectClaims([
        { kind: "provenance", level: "invented", text: "second" },
        { kind: "provenance", level: "measured", text: "first drawn" },
      ]).map(({ subject }) => subject),
    ).toEqual(["second", "first drawn"]);
  });

  it("should count a row's claim once, not twice", () => {
    // the row holds its claim in a nested object, and a sweep that both reads
    // the row and descends into it would report every table row doubled
    expect(
      collectClaims({ cells: [], provenance: { level: "assumed", text: "x" } }),
    ).toHaveLength(1);
  });

  it("should ignore a level outside the scale", () => {
    expect(collectClaims({ kind: "provenance", level: "vibes", text: "x" })).toEqual([]);
  });

  it("should survive a page holding no claims at all", () => {
    expect(collectClaims({ type: "prose", text: "plain" })).toEqual([]);
  });
});

describe("fn:formatClaims", () => {
  it("should order by the scale, strongest evidence first", () => {
    expect(
      formatClaims([
        { level: "invented", subject: "c" },
        { level: "measured", subject: "a" },
        { level: "assumed", subject: "b" },
      ]),
    ).toBe("- measured: a\n- assumed: b\n- invented: c");
  });

  it("should mark a claim naming no subject rather than dropping it", () => {
    // a claim with nothing to point at still tells the reader the page rests
    // on something unnamed, which is worth more than a silently shorter list
    expect(formatClaims([{ level: "assumed", subject: "" }])).toBe(
      "- assumed: (unattributed)",
    );
  });

  it("should render nothing when the page claims nothing", () => {
    expect(formatClaims([])).toBe("");
  });
});

describe("fn:formatCaveats", () => {
  it("should name every invented figure and agree with itself on number", () => {
    expect(
      formatCaveats([
        { level: "measured", subject: "real" },
        { level: "invented", subject: "seat count" },
        { level: "invented", subject: "churn" },
      ]),
    ).toBe(
      "> Caution: 2 figures are invented, standing in for evidence nobody has yet: seat count, churn.",
    );
  });

  it("should read as one figure when only one was invented", () => {
    expect(formatCaveats([{ level: "invented", subject: "seat count" }])).toBe(
      "> Caution: 1 figure is invented, standing in for evidence nobody has yet: seat count.",
    );
  });

  it("should stay silent when nothing was invented", () => {
    // an assumed figure is weak, not fabricated; only an invented one earns a
    // caution, or the caution stops meaning anything
    expect(
      formatCaveats([
        { level: "assumed", subject: "a" },
        { level: "estimated", subject: "b" },
      ]),
    ).toBe("");
  });
});
