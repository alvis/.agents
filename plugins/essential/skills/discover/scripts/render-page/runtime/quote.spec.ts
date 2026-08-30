import { describe, expect, it } from "vitest";

import { characters, collapse, MAX_QUOTE, truncate } from "./quote.ts";

describe("fn:characters", () => {
  it("should split plain text into its own characters", () => {
    expect(characters("abc")).toEqual(["a", "b", "c"]);
  });

  it("should keep an astral character whole rather than splitting its surrogates", () => {
    expect(characters("a🙂b")).toEqual(["a", "🙂", "b"]);
  });

  it("should keep a combined emoji sequence as one character", () => {
    // a flag is two regional indicators; a naive split gives two halves that
    // each render as a meaningless box
    expect(characters("🇯🇵")).toEqual(["🇯🇵"]);
  });
});

describe("fn:collapse", () => {
  it("should reduce every whitespace run to one space", () => {
    expect(collapse("  a \n\t b  ")).toBe("a b");
  });

  it("should read a missing value as empty rather than as its word", () => {
    expect(collapse(null)).toBe("");
    expect(collapse(undefined)).toBe("");
  });
});

describe("fn:truncate", () => {
  it("should leave a quote that fits exactly untouched", () => {
    const text = "a".repeat(MAX_QUOTE);

    expect(truncate(text)).toBe(text);
  });

  it("should ellipsise a quote past the limit", () => {
    const out = truncate("a".repeat(MAX_QUOTE + 50));

    expect(out).toHaveLength(MAX_QUOTE);
    expect(out.endsWith("…")).toBe(true);
  });

  it("should never cut an astral character in half", () => {
    // every character is astral, so a code-unit cut would land mid-surrogate
    const out = truncate("🙂".repeat(MAX_QUOTE + 10));

    expect(out).not.toContain("�");
    expect([...out].every((part) => part === "…" || part.codePointAt(0)! > 0xffff)).toBe(true);
    expect(characters(out)).toHaveLength(MAX_QUOTE);
  });

  it("should not leave a dangling space before the ellipsis", () => {
    expect(truncate(`${"a".repeat(MAX_QUOTE - 1)} tail`)).toBe(`${"a".repeat(MAX_QUOTE - 1)}…`);
  });
});
