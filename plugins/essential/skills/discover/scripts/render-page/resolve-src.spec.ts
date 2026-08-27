import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveSrc } from "./resolve-src.ts";

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
  it("should refuse a symlink that points out of the root", () => {
    // E-117 — the comparison was lexical, so a link sitting beside the data
    // file passed every string test while opening whatever it pointed at. This
    // needs real files: nothing about a symlink is visible to path arithmetic
    const tmp = mkdtempSync(join(tmpdir(), "resolve-src-"));
    const root = join(tmp, "board");
    mkdirSync(root);
    writeFileSync(join(tmp, "secret.png"), "x");
    symlinkSync(join(tmp, "secret.png"), join(root, "beside.png"));

    expect(() => resolveSrc("beside.png", root, "b")).toThrow(/resolves outside/);
  });

  it("should still accept a symlink that stays inside the root", () => {
    // following links must not become a reason to refuse an ordinary one
    const tmp = mkdtempSync(join(tmpdir(), "resolve-src-"));
    mkdirSync(join(tmp, "art"));
    writeFileSync(join(tmp, "art", "real.png"), "x");
    symlinkSync(join(tmp, "art", "real.png"), join(tmp, "beside.png"));

    expect(resolveSrc("beside.png", tmp, "b")).toBe(join(tmp, "beside.png"));
  });

  it("should judge escape against the root rather than the base", () => {
    expect(resolveSrc("../shared.css", "/root/deep", "b", "/root")).toEqual("/root/shared.css");
    expect(() => resolveSrc("../shared.css", "/root", "b", "/root")).toThrow(/resolves outside/);
  });

  it("should ignore a query or fragment when finding the file", () => {
    expect(resolveSrc("font.woff2?v=3", "/base", "b")).toEqual("/base/font.woff2");
  });
});
