import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { RenderError } from "../error.ts";
import { freshIds } from "../id.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/**
 * builds an empty render context
 * @returns the context
 */
function context(): PageContext {
  return {
    ids: freshIds(),
    files: {},
  };
}

/**
 * renders a disclosure
 * @param block the block's fields beyond its type
 * @returns the HTML
 */
function html(block: Partial<Extract<Block, { type: "disclosure" }>>): string {
  return renderBlock(
    { type: "disclosure", summary: "Why", blocks: [{ type: "prose", text: "Because." }], ...block } as Block,
    "blocks[0]",
    context(),
  );
}

describe("fn:renderBlock disclosure", () => {
  it("should fold its content behind a native summary", () => {
    expect(html({})).toBe(
      '<details class="disclosure"><summary>Why</summary><div class="disclosure-body"><p class="prose">Because.</p></div></details>',
    );
  });

  it("should open on load when the author asked it to", () => {
    expect(html({ open: true })).toContain('<details class="disclosure" open>');
  });

  it("should draw whole blocks, not only text", () => {
    const drawn = html({
      blocks: [{ type: "code", language: "ts", code: "x" }],
    });

    expect(drawn).toContain('<pre class="code" data-language="ts">');
  });

  it("should nest, so a long aside can fold its own detail away", () => {
    const drawn = html({
      blocks: [{ type: "disclosure", summary: "Deeper", blocks: [{ type: "prose", text: "in" }] }],
    });

    expect(drawn).toContain("<summary>Deeper</summary>");
  });

  it("should name the inner block that was refused, by its full path", () => {
    expect(() => html({ blocks: [{ type: "prose" } as Block] })).toThrow(
      new RenderError("blocks[0].blocks[0].text: required non-empty string, received undefined"),
    );
  });

  it("should refuse a disclosure with nothing to disclose", () => {
    expect(() => html({ blocks: [] })).toThrow(RenderError);
  });

  it("should escape a summary rather than let it author markup", () => {
    expect(html({ summary: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
