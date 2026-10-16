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
      {
        name: "render-page/",
        children: [
          { name: "cli.ts", note: "the entry" },
          { name: "block.ts" },
          { name: "page.ts" },
        ],
      },
      { name: "test-support.ts" },
    ],
  };

  it("should draw the rules so the last entry at each level closes it", () => {
    const drawn = html(tree);

    expect(drawn).toContain("├── render-page/");
    expect(drawn).toContain("└── test-support.ts");
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

  it("should draw a tree that carries no status exactly as it always was", () => {
    // a board that never uses a status must not change by a byte: no gutter,
    // no rows, no legend, no scope
    expect(
      html({
        type: "tree",
        title: "Layout",
        root: "a/",
        items: [{ name: "b/", note: "dir", children: [{ name: "c" }] }, { name: "d" }],
      }),
    ).toBe(
      '<figure class="tree-figure"><figcaption class="tree-title">Layout</figcaption><pre class="tree">a/\n├── b/     <span class="tree-note">dir</span>\n│   └── c\n└── d</pre></figure>',
    );
  });
});

describe("fn:renderBlock tree status", () => {
  const sections = new Set(["why", "how"]);
  const page = (): PageContext => ({ ...emptyContext(), sections });

  /**
   * reads a tree the way a reader copying it would
   * @param drawn the rendered figure
   * @returns the lines of its listing, without markup
   */
  function linesOf(drawn: string): string[] {
    const listing = /<pre class="tree">([\s\S]*?)<\/pre>/.exec(drawn)?.[1] ?? "";

    return listing
      .replace(/<[^>]*>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&")
      .split("\n");
  }

  const changed = {
    type: "tree",
    root: "src/",
    items: [
      { name: "alpha.ts", status: "new", note: "first" },
      {
        name: "beta/",
        status: "changed",
        children: [{ name: "inner.ts", note: "inherits" }, { name: "gone.ts", status: "removed" }],
      },
      { name: "plain.ts", note: "no status" },
    ],
  };

  it("should open every line with a four-column gutter, blank where nothing is marked", () => {
    // the widest line before a note is `    │   ├── inner.ts`, twenty
    // characters, so every note starts two columns past it
    expect(linesOf(html(changed, page()))).toEqual([
      "    src/",
      "NEW ├── alpha.ts      first",
      "CHG ├── beta/",
      "    │   ├── inner.ts  inherits",
      "DEL │   └── gone.ts",
      "    └── plain.ts      no status",
    ]);
  });

  it("should keep every note in one column once the gutter is counted", () => {
    const notes = linesOf(html(changed, page()))
      .filter((line) => /(first|inherits|no status)$/.test(line))
      .map((line) => line.search(/first|inherits|no status/));

    expect(new Set(notes).size).toBe(1);
  });

  it("should give an entry beneath a marked one the parent's filter value and a blank gutter", () => {
    const drawn = html(changed, page());

    expect(drawn).toContain(
      '<span class="tree-row" data-filter-item="changed"><span class="tree-status">    </span>│   ├── inner.ts',
    );
    expect(drawn).toContain(
      '<span class="tree-row" data-filter-item="removed"><span class="tree-status" data-status="removed">DEL </span>',
    );
  });

  it("should let a child's own status win over the one it would inherit", () => {
    const drawn = html(
      {
        type: "tree",
        root: "r/",
        items: [
          { name: "d/", status: "new", children: [{ name: "f", status: "moved" }, { name: "g" }] },
        ],
      },
      page(),
    );

    expect(drawn).toContain('data-filter-item="moved"><span class="tree-status" data-status="moved">MOV </span>');
    expect(drawn).toContain('data-filter-item="new"><span class="tree-status">    </span>    └── g');
  });

  it("should link a name to the section that explains it", () => {
    const drawn = html(
      { type: "tree", root: "r/", items: [{ name: "a.ts", status: "new", section: "why" }] },
      page(),
    );

    expect(drawn).toContain('<a class="tree-link" href="#s-why">a.ts</a>');
    expect(linesOf(drawn)).toEqual(["    r/", "NEW └── a.ts"]);
  });

  it("should refuse a section no section on the page has", () => {
    expect(() =>
      html(
        { type: "tree", root: "r/", items: [{ name: "a", children: [{ name: "b", section: "nope" }] }] },
        page(),
      ),
    ).toThrow(
      new RenderError(
        'b.items[0].children[0].section: no section on this page has id "nope", so the entry would link nowhere',
      ),
    );
  });

  it("should refuse a status that is not one of the four", () => {
    expect(() =>
      html({ type: "tree", root: "r/", items: [{ name: "a", status: "added" }] }, page()),
    ).toThrow(
      new RenderError(
        'b.items[0].status: required one of "new", "changed", "removed", "moved", received "added"',
      ),
    );
  });

  it("should count each chip by the rows it dims and scope the bar to its own figure", () => {
    const drawn = html(changed, page());
    const rows = (value: string): number =>
      drawn.split(`data-filter-item="${value}"`).length - 1;
    const chips = [
      ...drawn.matchAll(/data-filter="(\w+)"[^>]*>[^<]*<span[^>]*>(\d+)</g),
    ].map(([, value, count]) => [value, Number(count)]);

    expect(drawn).toContain('<figure class="tree-figure" data-filter-scope>');
    expect(chips).toEqual([
      ["all", 5],
      ["new", rows("new")],
      ["changed", rows("changed")],
      ["removed", rows("removed")],
    ]);
    // `plain.ts` has no status of its own and no ancestor with one, so it is
    // counted by `All` and by no status chip
    expect(rows("new") + rows("changed") + rows("removed")).toBe(4);
  });

  it("should draw a single status as a legend, with no chips and no scope", () => {
    const drawn = html(
      {
        type: "tree",
        root: "r/",
        items: [{ name: "a", status: "new" }, { name: "b", status: "new" }],
      },
      page(),
    );

    expect(drawn).toContain('<p class="tree-legend">NEW marks 2 new entries</p>');
    expect(drawn).not.toContain("data-filter-chips");
    expect(drawn).not.toContain("data-filter-scope");
  });

  it("should mark no row for filtering where there is no bar to filter them", () => {
    // a marked row with no scope around it could be adopted by a bar further up
    // the page, which would dim these rows for a choice made about another list
    const drawn = html(
      {
        type: "tree",
        root: "r/",
        items: [{ name: "a", status: "new", children: [{ name: "b" }] }, { name: "c" }],
      },
      page(),
    );

    expect(drawn).not.toContain("data-filter-item");
    expect(drawn).toContain('<span class="tree-row"><span class="tree-status" data-status="new">NEW </span>');
  });

  it("should draw a tree with no status as the plain listing it was", () => {
    const drawn = html(
      { type: "tree", root: "r/", items: [{ name: "a", note: "n" }, { name: "b" }] },
      page(),
    );

    expect(drawn).not.toContain("tree-row");
    expect(drawn).not.toContain("data-filter");
  });

  it("should escape a name and a note beside the gutter", () => {
    const drawn = html(
      { type: "tree", root: "<r>", items: [{ name: "<x>", status: "new", note: "<n>" }] },
      page(),
    );

    expect(drawn).toContain("&lt;x&gt;");
    expect(drawn).toContain("&lt;n&gt;");
    expect(drawn).not.toContain("<x>");
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

  // only what a browser would actually fetch is read as a reference. Checking
  // every attribute for a scheme made prose refuse the whole board, because a
  // sentence opening "Note:" reads as one
  it.each([
    ["prose that opens with a word and a colon", 'aria-label="Note: an order row"'],
    ["a font stack naming a family with a colon", 'font-family="Note:Serif, serif"'],
  ])("should render a drawing carrying %s", (_, attribute) => {
    const carried = `<svg ${attribute}><rect x="1" y="1" width="8" height="8" /></svg>`;

    expect(() => html(block, withFile("mark.svg", carried))).not.toThrow();
  });

  it("should allow a declaration or comment before the root element", () => {
    const declared = `<?xml version="1.0"?>\n<!-- drawn by hand -->\n${drawing}`;

    expect(() => html(block, withFile("mark.svg", declared))).not.toThrow();
  });

  // inlined SVG is same-origin markup, not an isolated image, so anything
  // executable in it would run as the page. The drawing is parsed and rebuilt
  // from an allowed vocabulary, so each of these is refused by being absent
  // from it rather than by matching a pattern someone remembered to write
  it.each([
    ['<svg><script>alert(1)</script></svg>', /carries a <script>/],
    ['<svg onload="alert(1)"></svg>', /carries an inline event handler/],
    ['<svg><foreignObject><b>x</b></foreignObject></svg>', /carries a <foreignObject>/],
    ['<svg><image href="https://example.test/x.png" /></svg>', /carries an <image>/],
    ['<svg><use href="//example.test/x#a" /></svg>', /may only point within the page/],
    ['<svg><a href="https://example.test/"><text>x</text></a></svg>', /carries an <a>/],
    ['<svg><g\u002fonclick="alert(1)"><text>x</text></g></svg>', /carries an inline event handler/],
    ['<svg><style>@import url(https://evil.test/x.css);</style></svg>', /carries a <style>/],
    ['<svg><set attributeName="href" to="javascript:alert(1)" /></svg>', /carries an SVG animation element/],
    ['<svg><rect fill="url(https://evil.test/p.png)" /></svg>', /may only point within the page/],
    ['<svg><rect data-track="x" /></svg>', /is not one an inlined drawing may carry/],
    ['<svg><rect style="fill:red" /></svg>', /painted with presentation attributes/],
    ['<svg><marquee>x</marquee></svg>', /is not one an inlined drawing may hold/],
    // R2-INL-02: a closing quote separates two attributes, so a pattern that
    // demands whitespace before the handler never sees this one
    ['<svg><g id="a"onclick="alert(1)"><text>x</text></g></svg>', /carries an inline event handler/],
    // R2-INL-03: the parser resolves the reference and a check on the raw bytes
    // does not, so the scheme reaching the browser is not the one that was read
    ['<svg><use href="&#104;ttps://evil.test/p#a" /></svg>', /may only point within the page/],
    ['<svg><use href="&#106;avascript:alert(1)" /></svg>', /may only point within the page/],
    ['<svg><text>R&D</text></svg>', /character reference this does not resolve/],
    // R2-INL-04: the check asked only what the file began with, so anything
    // after the drawing was inlined without ever being looked at
    [
      '<svg></svg><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
      /carries an <iframe> element after its <\/svg>/,
    ],
    ['<svg></svg><script>alert(1)</script>', /carries a <script> element after its <\/svg>/],
    ['<svg></svg>trailing words', /carries the text "trailing words" after its <\/svg>/],
    ['<svg><g><rect /></svg>', /closes <\/svg> where <g> is open/],
    ['<svg><g><rect /></g>', /leaves <svg> open/],
    ['<svg><g><rect /></b></g></svg>', /closes <\/b> where <g> is open/],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg />', /declares entities of its own/],
  ])("should refuse markup that %s", (markup, complaint) => {
    expect(() => html(block, withFile("mark.svg", markup))).toThrow(complaint);
  });
});
