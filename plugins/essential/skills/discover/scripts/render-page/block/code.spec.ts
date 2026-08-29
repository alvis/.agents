import { describe, expect, it } from "vitest";

import { RenderError } from "../error.ts";
import { ANNOTATION_CSS } from "../style/annotation.ts";
import { renderCode, renderCodePair } from "./code.ts";

import type { Block } from "../types.ts";

/** a three-line excerpt every annotation test anchors to. */
const CODE = "const a = 1;\nconst b = 2;\nreturn a + b;";

/**
 * renders a code block
 * @param block the block's fields beyond its type
 * @returns the HTML
 */
function html(block: Partial<Extract<Block, { type: "code" }>>): string {
  return renderCode(
    { type: "code", language: "typescript", code: CODE, ...block } as Extract<
      Block,
      { type: "code" }
    >,
    "blocks[0]",
  );
}

describe("fn:renderCode", () => {
  it("should leave an unannotated excerpt as one escaped string", () => {
    expect(html({})).toBe(
      '<pre class="code" data-language="typescript"><code>const a = 1;\nconst b = 2;\nreturn a + b;</code></pre>',
    );
  });

  it("should say the same thing marked up as it does plain", () => {
    // marking a line is presentation, so an excerpt that gains a highlight
    // must still read as the excerpt: a trailing break splits into a line
    // that is not one, and the empty row it draws is a line nobody wrote
    for (const code of ["a\nb", "a\nb\n", "a\nb\n\n", "a", "a\n"])
      expect(
        html({ code, highlight: [1] }).replace(/<[^>]*>/gu, ""),
      ).toBe(code);
  });

  it("should refuse a line number past the last line the author wrote", () => {
    expect(() => html({ code: "a\nb\n", highlight: [3] })).toThrow(
      new RenderError(
        "blocks[0].highlight[0]: line 3 is past the end of a 2-line excerpt",
      ),
    );
  });

  it("should mark only the lines the author named", () => {
    const drawn = html({ highlight: [2] });

    expect(drawn).toContain('<span class="code-line is-marked"><mark>const b = 2;</mark>\n</span>');
    expect(drawn).toContain('<span class="code-line">const a = 1;\n</span>');
  });

  it("should keep every newline, so the excerpt still reads as code", () => {
    // every break the author wrote, and not one more: a three-line excerpt
    // ending without a break has two
    expect(html({ highlight: [1] }).match(/\n/g)).toHaveLength(2);
  });

  it("should tie every line of a run to one key", () => {
    const drawn = html({ ties: [{ key: "ack", lines: [1, 2] }] });

    expect(drawn.match(/data-sync="tie:ack"/g)).toHaveLength(2);
  });

  it("should let a line be both tied and marked", () => {
    const drawn = html({ highlight: [1], ties: [{ key: "ack", lines: [1] }] });

    expect(drawn).toContain('class="code-line is-marked" data-sync="tie:ack"');
  });

  it("should read a reviewer note under the line it is about", () => {
    const drawn = html({ comments: [{ line: 1, text: "This shadows the outer binding." }] });
    const line = drawn.indexOf("const a = 1;");
    const note = drawn.indexOf("This shadows the outer binding.");
    const next = drawn.indexOf("const b = 2;");

    expect(line).toBeLessThan(note);
    expect(note).toBeLessThan(next);
  });

  it("should state a note's severity as a word, not only a colour", () => {
    const drawn = html({ comments: [{ line: 1, text: "n", severity: "high" }] });

    expect(drawn).toContain('<span class="diff-severity" data-severity="high">High</span>');
  });

  it("should name where a line lives when the excerpt is not the whole file", () => {
    const drawn = html({ comments: [{ line: 1, text: "n", at: "dedupe.go:34" }] });

    expect(drawn).toContain('<span class="diff-where">dedupe.go:34</span>');
  });

  it("should carry a note's own rich text", () => {
    const drawn = html({
      comments: [{ line: 1, text: [{ kind: "code", text: "seq" }] }],
    });

    expect(drawn).toContain('<code class="mono">seq</code>');
  });

  it("should hold two notes on one line in the order they were written", () => {
    const drawn = html({
      comments: [{ line: 2, text: "first" }, { line: 2, text: "second" }],
    });

    expect(drawn.indexOf("first")).toBeLessThan(drawn.indexOf("second"));
  });

  it("should refuse a line past the end of the excerpt", () => {
    expect(() => html({ highlight: [4] })).toThrow(
      new RenderError("blocks[0].highlight[0]: line 4 is past the end of a 3-line excerpt"),
    );
  });

  it("should refuse a line number that is not a whole number", () => {
    expect(() => html({ highlight: [1.5] })).toThrow(RenderError);
  });

  it("should refuse a line number below one", () => {
    expect(() => html({ highlight: [0] })).toThrow(
      new RenderError("blocks[0].highlight[0]: required a line number of 1 or more, received 0"),
    );
  });

  it("should name the tie whose line is out of range", () => {
    expect(() => html({ ties: [{ key: "ack", lines: [9] }] })).toThrow(
      new RenderError("blocks[0].ties[0].lines[0]: line 9 is past the end of a 3-line excerpt"),
    );
  });

  it("should refuse a tie covering no lines at all", () => {
    expect(() => html({ ties: [{ key: "ack", lines: [] }] })).toThrow(RenderError);
  });

  it("should refuse a severity outside the ranking", () => {
    expect(() =>
      html({ comments: [{ line: 1, text: "n", severity: "urgent" as "high" }] }),
    ).toThrow(RenderError);
  });

  it("should escape a line's own text even when it is annotated", () => {
    const drawn = renderCode(
      {
        type: "code",
        language: "html",
        code: "<script>x</script>",
        highlight: [1],
      } as Extract<Block, { type: "code" }>,
      "blocks[0]",
    );

    expect(drawn).not.toContain("<script>");
    expect(drawn).toContain("&lt;script&gt;");
  });

  it("should still caption an annotated excerpt", () => {
    expect(html({ caption: "Before", highlight: [1] })).toContain(
      "<figcaption>Before</figcaption>",
    );
  });
});

describe("fn:renderCode selections", () => {
  it("should wrap the run and number it where it ends", () => {
    const drawn = html({
      code: "const x",
      selections: [{ text: "st x", note: "the name" }],
    });

    expect(drawn).toContain(
      '<span class="code-pick">st x</span><sup class="code-pick-mark">1</sup>',
    );
  });

  it("should cut colour and selection into one flat list, never nest them", () => {
    // N2 — two runs that start together and end apart cannot nest without
    // emitting `<a><b></a></b>`, so the piece they share carries both names
    const drawn = html({
      code: "const x",
      tokens: [{ start: 0, end: 5, kind: "keyword" }],
      selections: [{ text: "st x", note: "n" }],
    });

    expect(drawn).toContain(
      '<span class="code-line"><span class="t-keyword">con</span><span class="t-keyword code-pick">st</span><span class="code-pick"> x</span><sup class="code-pick-mark">1</sup></span>',
    );
  });

  it("should still escape every byte once the excerpt is coloured", () => {
    // the tokeniser measures ranges over the raw excerpt and never returns
    // markup, so colour cannot become a second way for data to reach the page
    const drawn = html({
      code: '<script>a</script>',
      tokens: [{ start: 0, end: 8, kind: "tag" }],
    });

    expect(drawn).not.toContain("<script>");
    expect(drawn).toContain('<span class="t-tag">&lt;script&gt;</span>');
  });

  it("should never cut an entity in half at a colour boundary", () => {
    const drawn = html({
      code: "a && b",
      tokens: [{ start: 2, end: 3, kind: "operator" }],
    });

    expect(drawn).toContain('<span class="t-operator">&amp;</span>&amp; b');
  });

  it("should read the notes below the excerpt, numbered as they were written", () => {
    const drawn = html({
      code: "const x",
      selections: [
        { text: "x", note: "second by position, first by order" },
        { text: "const", note: "first by position, second by order" },
      ],
    });

    expect(drawn).toContain('<ol class="code-notes">');
    expect(drawn).toContain(
      '<li class="code-note" value="1"><span class="code-note-body">second by position, first by order</span></li>',
    );
    expect(drawn.indexOf('value="1"')).toBeLessThan(drawn.indexOf('value="2"'));
  });

  it("should refuse a colour whose name could not be a class", () => {
    expect(() =>
      html({ code: "x", tokens: [{ start: 0, end: 1, kind: 'a" onclick="b' }] }),
    ).toThrow(
      new RenderError(
        'blocks[0].tokens[0].kind: "a\\" onclick=\\"b" is not a lowercase dashed word, so it cannot name a colour',
      ),
    );
  });

  it("should refuse a colour measured past the end of the excerpt", () => {
    expect(() =>
      html({ code: "abc", tokens: [{ start: 0, end: 9, kind: "keyword" }] }),
    ).toThrow(
      new RenderError(
        "blocks[0].tokens[0].end: 9 is past the end of a 3-character excerpt",
      ),
    );
  });

  it("should refuse a colour that ends before it starts", () => {
    expect(() =>
      html({ code: "abc", tokens: [{ start: 2, end: 2, kind: "keyword" }] }),
    ).toThrow(RenderError);
  });

  it("should draw a selection on every line it crosses", () => {
    const drawn = html({ selections: [{ text: "1;\nconst b", note: "n" }] });

    expect(drawn.match(/class="code-pick"/g)).toHaveLength(2);
    expect(drawn.match(/code-pick-mark/g)).toHaveLength(1);
  });

  it("should name the excerpt's file when the author gave one", () => {
    const drawn = html({ label: "scripts/replay.ts" });

    expect(drawn).toContain(
      '<p class="code-path"><span class="code-path-file">scripts/replay.ts</span><span class="code-path-language">typescript</span></p>',
    );
  });
});

describe("fn:renderCodePair", () => {
  /**
   * renders a code pair
   * @param block the block's fields beyond its type
   * @returns the HTML
   */
  function pair(
    block: Partial<Extract<Block, { type: "codepair" }>>,
  ): string {
    return renderCodePair(
      {
        type: "codepair",
        panels: [
          { language: "typescript", code: "const a = 1;" },
          { language: "typescript", code: "const b = 2;" },
        ],
        ...block,
      } as Extract<Block, { type: "codepair" }>,
      "blocks[0]",
    );
  }

  it("should draw both panels side by side under one figure", () => {
    const drawn = pair({});

    expect(drawn.match(/class="code-panel"/g)).toHaveLength(2);
    expect(drawn).toContain('<figure class="code-pair">');
  });

  it("should share one number sequence across the two panels", () => {
    // note 3 is note 3 wherever the reader finds it, which is what makes the
    // pair read as one annotated comparison rather than two neighbouring blocks
    const drawn = pair({
      panels: [
        {
          language: "typescript",
          code: "const a = 1;",
          selections: [{ text: "a", note: "before" }],
        },
        {
          language: "typescript",
          code: "const b = 2;",
          selections: [{ text: "b", note: "after" }],
        },
      ],
    });

    expect(drawn).toContain('<sup class="code-pick-mark">1</sup>');
    expect(drawn).toContain('<sup class="code-pick-mark">2</sup>');
    expect(drawn.match(/class="code-notes"/g)).toHaveLength(1);
    expect(drawn.indexOf("before")).toBeLessThan(drawn.indexOf("after"));
  });

  it("should carry its eyebrow and its title", () => {
    const drawn = pair({ eyebrow: "PAIR B / 3", caption: "Before and after" });

    expect(drawn).toContain('<p class="code-eyebrow">PAIR B / 3</p>');
    expect(drawn).toContain(
      '<figcaption class="code-pair-title">Before and after</figcaption>',
    );
  });

  it("should refuse a pair that is not two panels", () => {
    expect(() =>
      pair({ panels: [{ language: "ts", code: "x" }] }),
    ).toThrow(
      new RenderError("blocks[0].panels: required exactly 2 panels, received 1"),
    );
  });

  it("should refuse a panel that is not an object", () => {
    expect(() =>
      pair({ panels: ["x", "y"] as unknown as Extract<Block, { type: "codepair" }>["panels"] }),
    ).toThrow(RenderError);
  });

  it("should name each panel's own file and language", () => {
    const drawn = pair({
      panels: [
        { language: "typescript", code: "x", label: "before.ts" },
        { language: "rust", code: "y", label: "after.rs" },
      ],
    });

    expect(drawn).toContain('<span class="code-path-file">before.ts</span>');
    expect(drawn).toContain('<span class="code-path-language">rust</span>');
  });
});

describe("const:ANNOTATION_CSS excerpt layout", () => {
  it("should lay each line out as a block", () => {
    // an excerpt sets white-space:pre, which forbids a break between two
    // inline boxes: laid out inline-block every line of an excerpt lands on
    // one row, side by side, and the whole excerpt reads as a single line
    // scrolled horizontally. A browser measures that in one call and a passing
    // test does not see it, because the markup is right either way
    const rule = /^\.code-line\{[^}]*\}/mu.exec(ANNOTATION_CSS)?.[0] ?? "";

    expect(rule).toContain("display:block");
    expect(rule).not.toContain("inline-block");
  });

  it("should let a marked line span the excerpt without stretching to the widest", () => {
    // fit-content is what keeps a short marked line from being padded out to
    // the width of the longest line below it; the floor is what stops the same
    // rule drawing the band as a ragged strip the width of its own text
    const rule = /^\.code-line\{[^}]*\}/mu.exec(ANNOTATION_CSS)?.[0] ?? "";

    expect(rule).toContain("width:fit-content");
    expect(rule).toContain("min-width:100%");
  });
});
