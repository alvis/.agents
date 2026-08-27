import { describe, expect, it } from "vitest";

import { readCssValue } from "./css-value.ts";
import { RenderError } from "./error.ts";

describe("fn:readCssValue", () => {
  it("should accept every value the fifteen boards actually use", () => {
    // these are read out of examples/data rather than imagined, so the grammar
    // is measured against what authors write and not against what it can parse
    for (const value of [
      "#f7f8fb",
      "#eceef5",
      "#05040a",
      "oklch(.16 .018 265)",
      "oklch(0.982 0.006 76)",
      "34%",
      "26%",
      "390",
    ])
      expect(readCssValue(value, "theme.light.--ui-canvas")).toBe(value);
  });

  it("should accept the shapes a colour is ordinarily written in", () => {
    for (const value of [
      "none",
      "transparent",
      "currentcolor",
      "#fff",
      "#ffffffff",
      "rgb(0 0 0 / 50%)",
      "rgba(0, 0, 0, .2)",
      "color-mix(in oklch, #fff 40%, #000)",
      "linear-gradient(180deg, #fff, #000)",
      "var(--ui-ink)",
      "calc(100% - 2px)",
      "0 1px 2px rgb(0 0 0 / 20%)",
    ])
      expect(readCssValue(value, "p")).toBe(value);
  });

  it("should trim, so a padded value still reads as itself", () => {
    expect(readCssValue("  #fff  ", "p")).toBe("#fff");
  });

  it("should refuse anything that would end the declaration or the rule", () => {
    // the value is written verbatim into a stylesheet, so a character that
    // closes the declaration lets the next one be authored freely
    for (const [value, shown] of [
      ["#fff}", "}"],
      ["#fff;color:red", ";"],
      ["</style><script>", "<"],
      ["#fff @import x", "@"],
      ["#fff/*", "*"],
      ["u\\72 l(https://x/y.png)", "\\"],
      ["1px;background-image:url(https://evil.example/p.png)", ";"],
    ] as const) {
      expect(() => readCssValue(value, "p")).toThrow(RenderError);
      expect(() => readCssValue(value, "p")).toThrow(
        `p: ${JSON.stringify(shown)} is not part of a colour, length, keyword, or permitted function`,
      );
    }
  });

  it("should refuse every function that can reach the network", () => {
    // R6 — the page makes no requests, and a denylist over CSS cannot promise
    // that: url() was the only fetching function until image-set() was not
    for (const [value, shown] of [
      ["url(https://x/y.png)", "url("],
      ['image-set("https://evil.example/bg.png" 1x)', "image-set("],
      ['-webkit-image-set("https://x/y.png" 1x)', "webkit-image-set("],
      ["src(https://x/y.png)", "src("],
      ["element(#live)", "element("],
      ["cross-fade(url(a.png), url(b.png))", "cross-fade("],
      ["paint(worklet)", "paint("],
      ["image(https://x/y.png)", "image("],
    ] as const)
      expect(() => readCssValue(value, "theme.light.--ui-canvas")).toThrow(
        `theme.light.--ui-canvas: ${JSON.stringify(shown)} is not a permitted function`,
      );
  });

  it("should refuse a fetching function however deeply it is nested", () => {
    // a fallback is still a value, so the grammar has to read inside one
    expect(() => readCssValue("var(--ui-ink, url(https://x/y.png))", "p")).toThrow(
      'p: "url(" is not a permitted function',
    );
  });

  it("should refuse parentheses that do not balance", () => {
    expect(() => readCssValue("rgb(0 0 0", "p")).toThrow('p: 1 unclosed "("');
    expect(() => readCssValue("#fff)", "p")).toThrow('p: ")" closes nothing');
  });
});
