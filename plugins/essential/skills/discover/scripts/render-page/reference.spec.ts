import { describe, expect, it } from "vitest";

import { isSvgPath, mimeOf } from "./reference.ts";

describe("fn:mimeOf", () => {
  it.each([
    ["a.png", "image/png"],
    ["a.JPG", "image/jpeg"],
    ["a.svg", "image/svg+xml"],
    ["a.webp", "image/webp"],
  ])("should name %s as %s", (file, mime) => {
    expect(mimeOf(file, "b")).toEqual(mime);
  });

  // a wrong type produces a broken picture at read time with nothing to say
  // why, so it is refused rather than guessed at
  it.each(["a.tiff", "noextension"])("should refuse %s", (file) => {
    expect(() => mimeOf(file, "b")).toThrow(/has no extension this can inline/);
  });
});

describe("fn:isSvgPath", () => {
  it.each(["a.svg", "a.SVG", "deep/a.svg?v=1"])("should call %s an svg", (src) => {
    expect(isSvgPath(src)).toBe(true);
  });

  it.each(["a.png", "svg", "a.svgz"])("should not call %s an svg", (src) => {
    expect(isSvgPath(src)).toBe(false);
  });
});
