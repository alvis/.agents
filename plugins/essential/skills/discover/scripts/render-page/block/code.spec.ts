import { describe, expect, it } from "vitest";

import { RenderError } from "../error.ts";
import { ANNOTATION_CSS } from "../style/annotation.ts";
import { renderCode } from "./code.ts";

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
    { type: "code", code: CODE, ...block } as Extract<Block, { type: "code" }>,
    "blocks[0]",
  );
}

describe("fn:renderCode", () => {
  it("should leave an unannotated excerpt as one escaped string", () => {
    expect(html({})).toBe(
      "<pre class=\"code\"><code>const a = 1;\nconst b = 2;\nreturn a + b;</code></pre>",
    );
  });

  it("should mark only the lines the author named", () => {
    const drawn = html({ highlight: [2] });

    expect(drawn).toContain('<span class="code-line is-marked"><mark>const b = 2;</mark>\n</span>');
    expect(drawn).toContain('<span class="code-line">const a = 1;\n</span>');
  });

  it("should keep every newline, so the excerpt still reads as code", () => {
    expect(html({ highlight: [1] }).match(/\n/g)).toHaveLength(3);
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
      { type: "code", code: "<script>x</script>", highlight: [1] } as Extract<Block, { type: "code" }>,
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
