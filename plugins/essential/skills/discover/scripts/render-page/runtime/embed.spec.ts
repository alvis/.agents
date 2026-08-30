import { describe, expect, it } from "vitest";

import { fit } from "./embed.ts";

describe("fn:fit", () => {
  it("should leave a viewport narrower than the column at its own size", () => {
    expect(fit(390, 700, 1231)).toStrictEqual({ scale: 1, left: 421, height: 700 });
  });

  // the case the whole scaling exists for: a desktop design read in a column
  // that is nowhere near a desktop wide
  it("should scale a wide viewport down to the column", () => {
    expect(fit(1440, 800, 1231)).toStrictEqual({
      scale: 1231 / 1440,
      left: 0,
      height: Math.round((800 * 1231) / 1440),
    });
  });

  it("should keep scaling as the column narrows further", () => {
    const narrow = fit(1440, 800, 520);

    expect(narrow.scale).toBeCloseTo(520 / 1440, 10);
    expect(narrow.height).toEqual(289);
    expect(1440 * narrow.scale).toBeCloseTo(520, 6);
  });

  // blowing a phone frame up to fill a desktop column would state something
  // about the design the author never claimed
  it("should never scale a frame up", () => {
    expect(fit(390, 700, 2000).scale).toEqual(1);
  });

  it("should centre a frame that does not fill the column", () => {
    expect(fit(400, 300, 1000).left).toEqual(300);
  });

  it("should leave a scaled frame flush left, because it already fills the column", () => {
    expect(fit(1440, 900, 800).left).toEqual(0);
  });

  it("should take the stage's height from the scaled height, so no gap is left", () => {
    expect(fit(1000, 500, 500).height).toEqual(250);
  });

  // a stage measured before layout has run reports zero, and dividing by it
  // would put the frame at an infinite scale
  it.each([
    ["a column of zero width", 390, 700, 0],
    ["a viewport of zero width", 0, 700, 800],
  ])("should fall back to natural size for %s", (_, width, height, available) => {
    expect(fit(width, height, available).scale).toEqual(1);
  });
});
