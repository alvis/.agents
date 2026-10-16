import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { RenderError } from "../error.ts";
import { freshIds } from "../id.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/** the path every refusal below is expected to name. */
const at = "sections[0].blocks[1]";

/** two panels of plain prose, which is all a comparison needs to be valid. */
const PLAIN = [
  { label: "Keep", blocks: [{ type: "prose", text: "Stay." }] },
  { label: "Move", blocks: [{ type: "prose", text: "Go." }] },
];

/**
 * renders a variants block
 * @param fields the block's fields beyond its type
 * @returns the HTML
 */
function html(fields: Record<string, unknown> = {}): string {
  const context: PageContext = { ids: freshIds(), files: {} };

  return renderBlock({ type: "variants", items: PLAIN, ...fields } as Block, at, context);
}

/**
 * reads the density a block chose
 * @param items the alternatives to draw
 * @returns the value of `data-grid-density`
 */
function densityOf(items: unknown): string | undefined {
  return /data-grid-density="([^"]+)"/.exec(html({ items }))?.[1];
}

describe("fn:renderVariants", () => {
  it("should draw a heading, a grid and one labelled panel per alternative", () => {
    const drawn = html({ title: "Two ways" });

    expect(drawn).toContain('<h3 class="variants-title">Two ways</h3>');
    expect(drawn).toContain('<div class="variants-grid" data-grid-density="prose">');
    expect(drawn.match(/<div class="variant" role="group"/g)).toHaveLength(2);
    expect(drawn).toContain("Stay.");
  });

  it("should draw no heading when none was given", () => {
    expect(html()).not.toContain("variants-title");
  });

  it("should name each panel by its own heading, with an id no other block shares", () => {
    const drawn = html();
    const labelled = [...drawn.matchAll(/aria-labelledby="([^"]+)"><h4 class="variant-label" id="([^"]+)">/g)];

    expect(labelled.map(([, by, id]) => by === id)).toStrictEqual([true, true]);
    expect(new Set(labelled.map(([, , id]) => id)).size).toBe(2);
    // derived from the block's path, so two blocks cannot claim one id
    expect(labelled[0]?.[2]).toContain("sections-0-blocks-1");
  });

  it("should escape a label rather than let it author markup", () => {
    const drawn = html({ items: [{ ...PLAIN[0], label: "<b>x</b>" }, PLAIN[1]] });

    expect(drawn).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(drawn).not.toContain("<b>");
  });

  it("should draw every held block where it sits, whole blocks and not only text", () => {
    const drawn = html({
      items: [{ label: "A", blocks: [{ type: "code", language: "ts", code: "x" }] }, PLAIN[1]],
    });

    expect(drawn).toContain('<pre class="code" data-language="ts">');
  });
});

describe("fn:renderVariants density", () => {
  it("should choose the prose track for panels of text", () => {
    expect(densityOf(PLAIN)).toBe("prose");
  });

  it.each([
    ["code", { type: "code", language: "ts", code: "x" }],
    ["table", { type: "table", columns: [{ label: "A" }], rows: [[{ text: "b" }]] }],
    ["diagram", { type: "diagram", title: "d", nodes: [{ id: "a", label: "A", layer: 0 }, { id: "b", label: "B", layer: 1 }], edges: [{ from: "a", to: "b" }] }],
    ["svg", { type: "svg", src: "a.svg", alt: "a" }],
    ["image", { type: "image", src: "a.png", alt: "a" }],
  ])("should choose the wide track when a panel holds %s", (_, held) => {
    const context: PageContext = {
      ids: freshIds(),
      files: { "a.svg": "<svg></svg>", "a.png": "data:image/png;base64,AA==" },
    };
    const drawn = renderBlock(
      { type: "variants", items: [{ label: "A", blocks: [held] }, PLAIN[1]] } as Block,
      at,
      context,
    );

    expect(drawn).toContain('data-grid-density="wide"');
  });

  it("should look through containers for what makes a panel wide", () => {
    // a figure behind a disclosure is drawn at the same natural size as one
    // beside it, so the track has to be chosen from what is held at any depth
    const nested = {
      type: "disclosure",
      summary: "More",
      blocks: [{ type: "code", language: "ts", code: "x" }],
    };

    expect(densityOf([{ label: "A", blocks: [nested] }, PLAIN[1]])).toBe("wide");
  });

  it("should choose one track for the whole grid, from the widest panel", () => {
    expect(
      densityOf([PLAIN[0], { label: "B", blocks: [{ type: "code", language: "ts", code: "x" }] }]),
    ).toBe("wide");
  });
});

describe("fn:renderVariants refusals", () => {
  /**
   * renders and returns the refusal raised
   * @param fields the block's fields beyond its type
   * @returns the message of the raised RenderError
   */
  function refusal(fields: Record<string, unknown>): string {
    try {
      html(fields);
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);

      return (error as Error).message;
    }
    throw new Error("the block was accepted but should have been refused");
  }

  it("should refuse fewer than two alternatives, because one is a section", () => {
    expect(refusal({ items: [PLAIN[0]] })).toBe(
      `${at}.items: required at least two variants, received 1`,
    );
    expect(refusal({ items: [] })).toBe(
      `${at}.items: required at least two variants, received 0`,
    );
  });

  it("should refuse items that are not a list, by path", () => {
    expect(refusal({ items: "no" })).toBe(`${at}.items: required array, received "no"`);
  });

  it("should refuse a label that is not a non-empty string, by its own path", () => {
    expect(refusal({ items: [PLAIN[0], { label: 3, blocks: PLAIN[1]?.blocks }] })).toBe(
      `${at}.items[1].label: required non-empty string, received 3`,
    );
  });

  it("should refuse a panel with nothing in it, by its own path", () => {
    expect(refusal({ items: [{ label: "A", blocks: [] }, PLAIN[1]] })).toBe(
      `${at}.items[0].blocks: required non-empty array, received []`,
    );
  });

  it("should name the held block that was refused, by its full path", () => {
    expect(
      refusal({ items: [PLAIN[0], { label: "B", blocks: [{ type: "prose" }] }] }),
    ).toBe(`${at}.items[1].blocks[0].text: required non-empty string, received undefined`);
  });

  it("should refuse a variants block inside another, however deep", () => {
    const inner = { type: "variants", items: PLAIN };

    expect(refusal({ items: [{ label: "A", blocks: [inner] }, PLAIN[1]] })).toBe(
      `${at}.items[0].blocks[0].type: required a block other than "variants", received "variants" inside the variants block at ${at}`,
    );
    expect(
      refusal({
        items: [
          PLAIN[0],
          { label: "B", blocks: [{ type: "disclosure", summary: "s", blocks: [inner] }] },
        ],
      }),
    ).toContain(`${at}.items[1].blocks[0].blocks[0].type`);
  });
});
