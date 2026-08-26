import { describe, expect, it } from "vitest";

import { isRemote, isSvgPath, mimeOf, resolveSrc } from "./reference.ts";

describe("fn:resolveSrc", () => {
  it("should resolve against the data file's own directory", () => {
    expect(resolveSrc("art/mark.svg", "/base", "b")).toEqual("/base/art/mark.svg");
  });

  it("should refuse a path that climbs out", () => {
    expect(() => resolveSrc("../secret.svg", "/base", "b")).toThrow(/resolves outside/);
  });

  // the string the author wrote looks harmless; only the resolved path shows
  // where it lands
  it("should refuse a path that climbs out by way of a child", () => {
    expect(() => resolveSrc("art/../../secret.svg", "/base", "b")).toThrow(/resolves outside/);
  });

  it("should refuse an absolute path", () => {
    expect(() => resolveSrc("/etc/hosts", "/base", "b")).toThrow(/is an absolute path/);
  });

  it.each(["https://example.test/x.svg", "//example.test/x.svg", "data:image/svg+xml,x"])(
    "should refuse the remote reference %s",
    (src) => {
      expect(() => resolveSrc(src, "/base", "b")).toThrow(/no network requests at all/);
    },
  );

  it("should allow a path that stays inside", () => {
    expect(resolveSrc("art/../mark.svg", "/base", "b")).toEqual("/base/mark.svg");
  });

  // a packed document's own files resolve against it, but may not climb above
  // the directory the board is allowed to read
  it("should judge escape against the root rather than the base", () => {
    expect(resolveSrc("../shared.css", "/root/deep", "b", "/root")).toEqual("/root/shared.css");
    expect(() => resolveSrc("../shared.css", "/root", "b", "/root")).toThrow(/resolves outside/);
  });

  it("should ignore a query or fragment when finding the file", () => {
    expect(resolveSrc("font.woff2?v=3", "/base", "b")).toEqual("/base/font.woff2");
  });
});

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

describe("fn:isRemote", () => {
  it.each(["http://x/y", "https://x/y", "//x/y", "data:text/plain,x", "mailto:a@b"])(
    "should call %s remote",
    (src) => {
      expect(isRemote(src)).toBe(true);
    },
  );

  it.each(["a.png", "./a.png", "../a.png", "/a.png", "#anchor"])(
    "should call %s local",
    (src) => {
      expect(isRemote(src)).toBe(false);
    },
  );
});

describe("fn:isSvgPath", () => {
  it.each(["a.svg", "a.SVG", "deep/a.svg?v=1"])("should call %s an svg", (src) => {
    expect(isSvgPath(src)).toBe(true);
  });

  it.each(["a.png", "svg", "a.svgz"])("should not call %s an svg", (src) => {
    expect(isSvgPath(src)).toBe(false);
  });
});
