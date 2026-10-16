import { describe, expect, it } from "vitest";

import { TOKEN_CSS } from "./token.ts";
import { DESKTOP_PANEL, PROSE_TRACK, VARIANTS_CSS, WIDE_TRACK } from "./variants.ts";

/** the pixels in a rem, which every length in the sheet is declared against. */
const REM = 16;

/** the viewport the boards are judged at, in px. */
const DESKTOP = 1280;

/** what a classic scrollbar takes from the viewport, in px. */
const SCROLLBAR = 16;

/** the grid's own gap, in px. */
const GAP = 16;

/**
 * reads a custom property in rem from the token sheet
 * @param name the property, without its dashes
 * @returns its value in px
 */
function tokenPx(name: string): number {
  const value = new RegExp(`--${name}:(\\d+(?:\\.\\d+)?)rem`).exec(TOKEN_CSS)?.[1];
  if (value === undefined) throw new Error(`--${name} is not declared in rem`);

  return Number(value) * REM;
}

/**
 * evaluates a length made only of rem, `var(--pad)`, `+`, `-`, `*` and `/`
 * @param expression a `calc()` the sheet declares
 * @returns its value in px
 */
function px(expression: string): number {
  const arithmetic = expression
    .replace("calc", "")
    .replaceAll("var(--pad)", String(tokenPx("pad")))
    .replaceAll(/(\d+(?:\.\d+)?)rem/g, (_, rem: string) => String(Number(rem) * REM));

  return Function(`return ${arithmetic}`)() as number;
}

describe("VARIANTS_CSS", () => {
  it("should draw a grid on the prose track unless the block says it holds something wide", () => {
    // a block written by hand without the attribute is a comparison of
    // claims, which is what the prose track is for
    expect(VARIANTS_CSS).toContain(`.variants-grid{--track:${PROSE_TRACK};`);
  });

  it("should widen the track for a grid that holds code or a figure", () => {
    expect(VARIANTS_CSS).toContain(`[data-grid-density="wide"]{--track:${WIDE_TRACK}}`);
  });

  it("should declare only the densities the renderer can emit", () => {
    const declared = [...VARIANTS_CSS.matchAll(/\[data-grid-density="([^"]+)"\]/g)].map(
      (match) => match[1],
    );

    expect(declared).toStrictEqual(["wide"]);
  });

  it("should stretch the panels so compared alternatives are as tall as one another", () => {
    expect(VARIANTS_CSS).toMatch(/\.variants-grid\{[^}]*align-items:stretch/);
  });
});

describe("DESKTOP_PANEL", () => {
  it("should leave room for two wide panels and their gap in the column a 1280px laptop has", () => {
    // the column is the viewport less a pad either side, and a classic
    // scrollbar comes off the viewport before that
    const column = DESKTOP - SCROLLBAR - 2 * tokenPx("pad");

    expect(2 * px(DESKTOP_PANEL) + GAP).toBeLessThanOrEqual(column);
  });

  it("should not waste the column it is derived from", () => {
    // a track more than one rem short of what fits would stack panels that
    // could have shared a row, or leave a gutter beside every pair
    const column = DESKTOP - SCROLLBAR - 2 * tokenPx("pad");

    expect(column - (2 * px(DESKTOP_PANEL) + GAP)).toBeLessThan(REM);
  });

  it("should be the value the wide track takes on a desktop", () => {
    expect(WIDE_TRACK).toContain(DESKTOP_PANEL);
    expect(WIDE_TRACK.startsWith(`max(${PROSE_TRACK},`)).toBe(true);
  });
});
