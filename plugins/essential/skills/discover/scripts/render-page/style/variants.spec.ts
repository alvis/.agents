import { describe, expect, it } from "vitest";

import { VARIANTS_CSS } from "./variants.ts";

/**
 * reads the track a density declares
 * @param density the value of `data-grid-density`
 * @returns the declared track, in rem
 */
function trackOf(density: string): number | undefined {
  const track = new RegExp(
    `\\[data-grid-density="${density}"\\]\\{--track:(\\d+)rem\\}`,
  ).exec(VARIANTS_CSS)?.[1];

  return track === undefined ? undefined : Number(track);
}

describe("VARIANTS_CSS", () => {
  it("should declare the four floors that references/features.md section F names", () => {
    expect(["tile", "compact", "prose", "wide"].map(trackOf)).toStrictEqual([8, 14, 22, 30]);
  });

  it("should fall back to the prose track where a grid names no density", () => {
    // a block written by hand without the attribute is a comparison of
    // claims, which is what the prose track is for
    expect(VARIANTS_CSS).toContain("var(--track,22rem)");
  });
});
