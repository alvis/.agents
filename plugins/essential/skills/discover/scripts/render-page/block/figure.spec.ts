import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { emptyContext } from "../context.ts";
import { RenderError } from "../error.ts";

import type { PageContext } from "../context.ts";
import type { Block } from "../types.ts";

/**
 * renders one block at a fixed path
 * @param block the block to render
 * @param page a context to supply, when the block reads a file
 * @returns the rendered HTML
 */
function html(block: unknown, page?: PageContext): string {
  return renderBlock(block as Block, "b", page ?? emptyContext());
}

/**
 * builds a context holding one file
 * @param src the path the author would have written
 * @param body the file's contents
 * @returns a context that can serve it
 */
function withFile(src: string, body: string): PageContext {
  return { ...emptyContext(), files: { [src]: body } };
}

describe("fn:renderBlock tree", () => {
  const tree = {
    type: "tree",
    title: "Layout",
    root: "scripts/",
    items: [
      { name: "render-page.ts", note: "the entry" },
      { name: "render-page/", children: [{ name: "block.ts" }, { name: "page.ts" }] },
      { name: "build-artifact.ts" },
    ],
  };

  it("should draw the rules so the last entry at each level closes it", () => {
    const drawn = html(tree);

    expect(drawn).toContain("├── render-page.ts");
    expect(drawn).toContain("└── build-artifact.ts");
    expect(drawn).toContain("│   ├── block.ts");
    expect(drawn).toContain("│   └── page.ts");
  });

  // the trunk belongs to the ancestor: a nested block under the *last* entry
  // has nothing left to run past, and drawing one there would claim a sibling
  // that does not exist
  it("should clear the trunk beneath the last entry", () => {
    const drawn = html({
      type: "tree",
      root: "a/",
      items: [{ name: "b/", children: [{ name: "c" }] }],
    });

    expect(drawn).toContain("└── b/");
    expect(drawn).toContain("    └── c");
    expect(drawn).not.toContain("│");
  });

  it("should line the notes up in one column", () => {
    const lines = html({
      type: "tree",
      root: "a/",
      items: [{ name: "short", note: "one" }, { name: "a-much-longer-name", note: "two" }],
    })
      .split("\n")
      .filter((line) => line.includes("tree-note"));

    expect(lines).toHaveLength(2);
    expect(lines[0].indexOf("<span")).toEqual(lines[1].indexOf("<span"));
  });

  it("should escape a name that would otherwise be markup", () => {
    const drawn = html({ type: "tree", root: "<root>", items: [{ name: "<x>" }] });

    expect(drawn).toContain("&lt;root&gt;");
    expect(drawn).toContain("&lt;x&gt;");
  });

  it("should refuse a tree with no entries", () => {
    expect(() => html({ type: "tree", root: "a/", items: [] })).toThrow(RenderError);
  });
});

describe("fn:renderBlock mermaid", () => {
  const graph = {
    type: "mermaid",
    title: "Flow",
    source: "flowchart LR\n  A --> B",
    alt: "A feeds B",
  };

  it("should carry its own source and mark itself for the runtime", () => {
    const drawn = html(graph);

    expect(drawn).toContain("data-mermaid");
    expect(drawn).toContain("flowchart LR");
    expect(drawn).toContain("data-mermaid-canvas");
  });

  // the marker attribute is what decides whether a board carries 3.5 MB of
  // runtime, so it has to be the exact string the loader looks for
  it("should use the marker the loader matches on", () => {
    expect(html(graph)).toContain('data-mermaid id=');
  });

  it("should keep the alternative available but unseen until it is needed", () => {
    expect(html(graph)).toContain('class="mermaid-alt sr-only"');
  });

  it("should escape source that would otherwise close the tag", () => {
    const drawn = html({ ...graph, source: "flowchart LR\n  A[</pre><script>x</script>]" });

    expect(drawn).not.toContain("<script>x</script>");
    expect(drawn).toContain("&lt;/pre&gt;");
  });

  it("should refuse a graph with no text alternative", () => {
    expect(() => html({ type: "mermaid", source: "flowchart LR" })).toThrow(/b\.alt/);
  });
});

describe("fn:renderBlock svg", () => {
  const drawing = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>';
  const block = { type: "svg", title: "Mark", src: "mark.svg", alt: "a circle" };

  it("should inline the markup it was handed", () => {
    const drawn = html(block, withFile("mark.svg", drawing));

    expect(drawn).toContain("<circle");
    expect(drawn).toContain('aria-label="a circle"');
  });

  it("should refuse a src the CLI layer never read", () => {
    expect(() => html(block, emptyContext())).toThrow(/no file was read for "mark.svg"/);
  });

  it("should refuse a file that is not a drawing", () => {
    expect(() => html(block, withFile("mark.svg", "# notes\n"))).toThrow(
      /does not begin with an <svg> element/,
    );
  });

  it("should allow a declaration or comment before the root element", () => {
    const declared = `<?xml version="1.0"?>\n<!-- drawn by hand -->\n${drawing}`;

    expect(() => html(block, withFile("mark.svg", declared))).not.toThrow();
  });

  // inlined SVG is same-origin markup, not an isolated image, so anything
  // executable in it would run as the page
  it.each([
    ['<svg><script>alert(1)</script></svg>', /carries a <script>/],
    ['<svg onload="alert(1)"></svg>', /carries an inline event handler/],
    ['<svg><foreignObject><b>x</b></foreignObject></svg>', /carries a <foreignObject>/],
    ['<svg><image href="https://example.test/x.png" /></svg>', /references something over the network/],
    ['<svg><use href="//example.test/x#a" /></svg>', /references something over the network/],
  ])("should refuse markup that %s", (markup, complaint) => {
    expect(() => html(block, withFile("mark.svg", markup))).toThrow(complaint);
  });
});
