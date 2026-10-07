import { describe, expect, it } from "vitest";

import { RenderError } from "../error.ts";
import { renderDiff } from "./diff.ts";
import { changedLines, commonPairs, diffWords, pairParagraphs } from "./diff-text.ts";

import type { Block } from "../types.ts";

/**
 * renders a diff block
 * @param block the block's fields beyond its type
 * @returns the HTML
 */
function html(block: Partial<Extract<Block, { type: "diff" }>>): string {
  return renderDiff({ type: "diff", ...block } as Extract<Block, { type: "diff" }>, "blocks[0]");
}

describe("fn:commonPairs", () => {
  it("should pair the units two sequences share, in order", () => {
    expect(commonPairs(["a", "b", "c", "d"], ["a", "c", "x", "d"])).toStrictEqual([
      [0, 0],
      [2, 1],
      [3, 3],
    ]);
  });

  it("should refuse to compare sequences too long to table", () => {
    const long = Array.from({ length: 2001 }, (_, index) => String(index));

    expect(commonPairs(long, long)).toBeNull();
  });
});

describe("fn:diffWords", () => {
  it("should mark only the words that changed, on each side", () => {
    expect(diffWords("retries three times", "retries five times")).toStrictEqual({
      before: [
        { text: "retries ", changed: false },
        { text: "three", changed: true },
        { text: " times", changed: false },
      ],
      after: [
        { text: "retries ", changed: false },
        { text: "five", changed: true },
        { text: " times", changed: false },
      ],
    });
  });

  it("should draw a replaced phrase as one change rather than one per word", () => {
    const { after } = diffWords("a quick red fox", "a slow brown fox");

    expect(after.filter(({ changed }) => changed)).toStrictEqual([{ text: "slow brown", changed: true }]);
  });

  it("should read each side back exactly as written", () => {
    const { before, after } = diffWords("one  two\nthree", "one two three four");

    expect(before.map(({ text }) => text).join("")).toBe("one  two\nthree");
    expect(after.map(({ text }) => text).join("")).toBe("one two three four");
  });
});

describe("fn:pairParagraphs", () => {
  it("should anchor on unchanged paragraphs and pair the changed ones between", () => {
    expect(pairParagraphs("Same.\n\nOld wording.\n\nEnd.", "Same.\n\nNew wording.\n\nEnd.")).toStrictEqual([
      { before: "Same.", after: "Same." },
      { before: "Old wording.", after: "New wording." },
      { before: "End.", after: "End." },
    ]);
  });

  it("should leave a removed or added paragraph with an empty side", () => {
    expect(pairParagraphs("Keep.\n\nGone.", "Keep.\n\nFresh one.\n\nAnother.")).toStrictEqual([
      { before: "Keep.", after: "Keep." },
      { before: "Gone.", after: "Fresh one." },
      { before: "", after: "Another." },
    ]);
  });
});

describe("fn:changedLines", () => {
  it("should name the lines each excerpt holds that the other lacks", () => {
    expect(changedLines("a\nb\nc\n", "a\nB\nc\nd\n")).toStrictEqual({ before: [2], after: [2, 4] });
  });

  it("should not count trailing whitespace as a change", () => {
    expect(changedLines("a  \nb", "a\nb")).toStrictEqual({ before: [], after: [] });
  });
});

describe("fn:renderDiff", () => {
  it("should draw paragraph pairs as a two-column table with the changes marked", () => {
    const drawn = html({ pairs: [{ before: "retries three times", after: "retries five times" }] });

    expect(drawn).toBe(
      '<div class="table-wrap"><table class="diff"><thead><tr><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody><tr><td class="diff-before">retries <del class="diff-change">three</del> times</td><td class="diff-after">retries <ins class="diff-change">five</ins> times</td></tr></tbody></table></div>',
    );
  });

  it("should add a location column under the heading the author chose", () => {
    const drawn = html({
      location: "Section of the page",
      columns: ["Round 3", "Round 4"],
      pairs: [{ before: "a", after: "b", label: "ACID Profile" }],
    });

    expect(drawn).toContain(
      '<thead><tr><th scope="col" class="diff-at">Section of the page</th><th scope="col">Round 3</th><th scope="col">Round 4</th></tr></thead>',
    );
    expect(drawn).toContain('<th scope="row" class="diff-at">ACID Profile</th>');
  });

  it("should add the location column whenever a pair is located, under a default heading", () => {
    expect(html({ pairs: [{ before: "a", after: "b", label: "L12" }] })).toContain(
      '<th scope="col" class="diff-at">Where</th>',
    );
  });

  it("should say a paragraph was removed or is new rather than drawing an empty cell", () => {
    const drawn = html({ pairs: [{ before: "gone", after: "" }, { before: "", after: "fresh" }] });

    expect(drawn).toContain('<td class="diff-after is-empty"><span class="diff-none">(removed)</span></td>');
    expect(drawn).toContain('<td class="diff-before is-empty"><span class="diff-none">(new)</span></td>');
  });

  it("should pair two whole texts by paragraph and number them under a named location", () => {
    const drawn = html({ location: "Paragraph", before: "Same.\n\nOld.", after: "Same.\n\nNew." });

    expect(drawn).toContain('<tr class="is-same"><th scope="row" class="diff-at">¶ 1</th>');
    expect(drawn).toContain('<th scope="row" class="diff-at">¶ 2</th>');
  });

  it("should escape what the author wrote", () => {
    expect(html({ pairs: [{ before: "<b>", after: "<i>" }] })).toContain(
      '<del class="diff-change">&lt;b&gt;</del>',
    );
  });

  it("should draw two code panels as a pair with every changed line highlighted", () => {
    const drawn = html({
      title: "The entitlement row",
      columns: ["Published now", "Proposed"],
      panels: [
        { language: "typescript", code: "interface Row {\n  a: number;\n}\n" },
        { language: "typescript", code: "interface Row {\n  /** the b */\n  b: number;\n}\n" },
      ],
    });

    expect(drawn).toContain('<figcaption class="code-pair-title">The entitlement row</figcaption>');
    expect(drawn).toContain('<span class="code-path-file">Published now</span>');
    expect(drawn).toContain('<span class="code-line is-marked"><mark>  a: number;</mark>');
    expect(drawn).toContain('<span class="code-line is-marked"><mark>  /** the b */</mark>');
    expect(drawn).toContain('<span class="code-line is-marked"><mark>  b: number;</mark>');
    expect(drawn.match(/is-marked/gu)).toHaveLength(3);
  });

  it.each([
    ["no shape at all", {}, "blocks[0]: required exactly one of pairs, before/after or panels, received none"],
    [
      "two shapes",
      { pairs: [{ before: "a", after: "b" }], before: "x", after: "y" },
      "blocks[0]: required exactly one of pairs, before/after or panels, received pairs and before/after",
    ],
    ["a missing after", { before: "x" }, "blocks[0].after"],
    ["an empty pair list", { pairs: [] }, "blocks[0].pairs"],
    [
      "a pair with nothing on either side",
      { pairs: [{ before: " ", after: "" }] },
      "blocks[0].pairs[0]: required text on at least one side",
    ],
    ["a side that is not a string", { pairs: [{ before: 1, after: "b" }] }, "blocks[0].pairs[0].before"],
    ["three headings", { pairs: [{ before: "a", after: "b" }], columns: ["a", "b", "c"] }, "blocks[0].columns"],
    ["one panel", { panels: [{ language: "ts", code: "a" }] }, "blocks[0].panels"],
    [
      "a panel highlight that is not a list",
      { panels: [{ language: "ts", code: "a", highlight: 3 }, { language: "ts", code: "b" }] },
      "blocks[0].panels[0].highlight",
    ],
    [
      "a panel highlight past the end, at the index the author wrote it",
      { panels: [{ language: "ts", code: "a\nb", highlight: [9, 1] }, { language: "ts", code: "b" }] },
      "blocks[0].panels[0].highlight[0]",
    ],
  ])("should refuse %s by its JSON path", (_, block, message) => {
    expect(() => html(block as never)).toThrow(RenderError);
    expect(() => html(block as never)).toThrow(message);
  });
});
