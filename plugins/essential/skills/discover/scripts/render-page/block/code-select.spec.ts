import { describe, expect, it } from "vitest";

import { RenderError } from "../error.ts";
import { placeSelections } from "./code-select.ts";

/** an excerpt as a formatter would leave it. */
const CODE = "const a = 1;\nconst b = 2;\nreturn a + b;";

/**
 * locates selections against the excerpt
 * @param selections the author-supplied selections
 * @param code the excerpt to resolve against
 * @param from the number the first selection carries
 * @returns each selection, located and numbered
 */
function place(
  selections: unknown,
  code = CODE,
  from = 1,
): ReturnType<typeof placeSelections> {
  return placeSelections(selections, code, "blocks[0].selections", from);
}

describe("fn:placeSelections", () => {
  it("should locate a run the author quoted verbatim", () => {
    const [one] = place([{ text: "const b = 2;", note: "the second binding" }]);

    expect([one.start, one.end]).toStrictEqual([13, 25]);
    expect(CODE.slice(one.start, one.end)).toBe("const b = 2;");
  });

  it("should find a run again after the formatter re-laid it out", () => {
    // D-70 — the author quotes the source they were reading rather than the
    // formatted excerpt, and re-indenting is the first thing a formatter does
    const formatted = "function f() {\n  return a + b;\n}";
    const [one] = place([{ text: "return   a\n+ b;", note: "n" }], formatted);

    expect(formatted.slice(one.start, one.end)).toBe("return a + b;");
  });

  it("should draw the note as rich text rather than as a string", () => {
    const [one] = place([
      { text: "const a", note: [{ kind: "code", text: "a" }] },
    ]);

    expect(one.note).toBe('<code class="mono">a</code>');
  });

  it("should number by position in the array, so the author sets the order", () => {
    const placed = place([
      { text: "return a + b;", note: "read second" },
      { text: "const a = 1;", note: "read first" },
    ]);

    expect(placed.map(({ number }) => number)).toStrictEqual([1, 2]);
    expect(placed[0].start).toBeGreaterThan(placed[1].start);
  });

  it("should continue a sequence a pair's other panel started", () => {
    expect(place([{ text: "const a", note: "n" }], CODE, 4)[0].number).toBe(4);
  });

  it("should pull the run in off the whitespace the author quoted with it", () => {
    const [one] = place([{ text: "const a = 1;\n", note: "n" }]);

    expect(CODE.slice(one.start, one.end)).toBe("const a = 1;");
  });

  it("should refuse a run that is not there, saying where to look for it", () => {
    expect(() => place([{ text: "const c = 3;", note: "n" }])).toThrow(
      new RenderError(
        "blocks[0].selections[0].text: not found in the excerpt. selections are matched against the formatted text, so compare against the rendered block rather than the source as it was written",
      ),
    );
  });

  it("should refuse an ambiguous run by naming how many it matched", () => {
    expect(() => place([{ text: "const", note: "n" }])).toThrow(
      new RenderError(
        "blocks[0].selections[0].text: matches 2 runs of the excerpt, so it does not name one; set blocks[0].selections[0].occurrence to a number between 1 and 2",
      ),
    );
  });

  it("should count a run once however each copy is laid out", () => {
    // whitespace is what a formatter moves, so an excerpt holding the same
    // run twice reads as two matches; counting only the verbatim copy told
    // the author their text matched once while the other sat on the next line
    const mixed = "x = 1;\nx  =  1;";

    expect(place([{ text: "x = 1;", occurrence: 2, note: "n" }], mixed)[0].start).toBe(7);
  });

  it("should count only the runs that could each be selected", () => {
    // two selections cannot both wrap one character, so `--` appears twice in
    // `----`, not three times; a search stepping one character on offered the
    // author a third run straddling the two they can see
    const rule = "a----b";

    expect(() => place([{ text: "--", note: "n" }], rule)).toThrow(
      new RenderError(
        "blocks[0].selections[0].text: matches 2 runs of the excerpt, so it does not name one; set blocks[0].selections[0].occurrence to a number between 1 and 2",
      ),
    );
    expect(place([{ text: "--", occurrence: 2, note: "n" }], rule)[0].start).toBe(3);
  });

  it("should take the occurrence the author picked", () => {
    const [one] = place([{ text: "const", occurrence: 2, note: "n" }]);

    expect(one.start).toBe(13);
  });

  it("should refuse an occurrence past the matches there are", () => {
    expect(() => place([{ text: "const", occurrence: 3, note: "n" }])).toThrow(
      new RenderError(
        "blocks[0].selections[0].occurrence: 3 is past the 2 matches this text has in the excerpt",
      ),
    );
  });

  it("should refuse an occurrence that cannot number a match", () => {
    expect(() => place([{ text: "const", occurrence: 0, note: "n" }])).toThrow(
      new RenderError(
        "blocks[0].selections[0].occurrence: required a match number of 1 or more, received 0",
      ),
    );
    expect(() => place([{ text: "const", occurrence: 1.5, note: "n" }])).toThrow(
      RenderError,
    );
  });

  it("should refuse two selections that cover the same character", () => {
    // two spans cannot both wrap one character, so an overlap has no drawing
    // at all rather than an ugly one
    expect(() =>
      place([
        { text: "const a = 1;", note: "n" },
        { text: "a = 1", note: "n" },
      ]),
    ).toThrow(
      new RenderError(
        "blocks[0].selections[1]: covers characters 6-11, overlapping blocks[0].selections[0] which covers 0-12; two selections cannot both wrap the same character",
      ),
    );
  });

  it("should allow two selections that merely touch", () => {
    expect(
      place([
        { text: "const a", note: "n" },
        { text: "= 1;", note: "n" },
      ]),
    ).toHaveLength(2);
  });

  it("should refuse text that names no run at all", () => {
    expect(() => place([{ text: "   ", note: "n" }])).toThrow(
      new RenderError(
        "blocks[0].selections[0].text: is only whitespace, so it names no run of the excerpt",
      ),
    );
  });

  it("should refuse a selection that is not an object", () => {
    expect(() => place(["const a"])).toThrow(RenderError);
  });

  it("should refuse selections that are not an array", () => {
    expect(() => place({ text: "const a" })).toThrow(RenderError);
  });
});
