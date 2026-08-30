import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RenderError, main, renderPage } from "./render-page.ts";
import { removeDirectory, temporaryDirectory } from "./test-support.ts";

import type { Block, PageData } from "./render-page.ts";

const discover = resolve(import.meta.dirname, "..");
const dataPath = join(discover, "examples/data/ranked-options.json");

async function loadExample(): Promise<PageData> {
  return JSON.parse(await readFile(dataPath, "utf8")) as PageData;
}

/** builds a minimal valid page, overridden per test. */
function page(overrides: Partial<PageData> = {}): PageData {
  return {
    kind: "ranked-options",
    id: "fixture",
    action: "Ranked options",
    title: "Fixture",
    masthead: { eyebrow: "e", headline: "h", lede: "l" },
    sections: [],
    reply: { heading: "Generated reply", template: "{{answers}}" },
    ...overrides,
  };
}

/** extracts the one inlined stylesheet from an emitted page. */
function stylesheet(html: string): string {
  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (!style) throw new Error("emitted page has no inlined stylesheet");
  return style[1];
}

/** splits a stylesheet into its individual declarations. */
function declarations(css: string): string[] {
  return css
    .split(/[{};]/)
    .map((part) => part.trim())
    .filter((part) => part.includes(":"));
}

describe("fn:renderPage", () => {
  it("should emit a self-contained page with no external resource", async () => {
    const html = renderPage(await loadExample());

    // SC-1: nothing on the page may be fetched over the network
    expect(html).not.toMatch(/<link\b[^>]*rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\b(?:srcset|@import)\b/i);
    expect(html).toMatch(/<style>[\s\S]+<\/style>/);
  });

  it("should render each section title directly above its content", async () => {
    const html = renderPage(await loadExample());
    const heading = html.indexOf('<div class="section-heading">');
    const body = html.indexOf('<div class="section-body">');

    // SC-3: the heading precedes the body as its sibling in normal flow
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(body);
    // the heading must not be lifted out of flow into a rail
    const rule = /\.section-heading\{([^}]*)\}/.exec(stylesheet(html));
    expect(rule).not.toBeNull();
    expect(rule?.[1]).not.toMatch(/position:\s*(?:sticky|fixed|absolute)/);
    expect(rule?.[1]).not.toMatch(/\bfloat\b|\bwidth\b/);
  });

  it("should reserve no fixed horizontal space beside the reading column", async () => {
    const css = stylesheet(renderPage(await loadExample()));

    // SC-3: the column is capped and centred, so it cannot narrow as the
    // viewport widens. Geometry itself is browser-measured, not asserted here.
    expect(css).toMatch(/\.page\{[^}]*width:\s*min\([^)]*\)/);
    expect(css).toMatch(/\.page\{[^}]*margin-inline:\s*auto/);

    // SC-3: no rail may claim width beside it — neither by pushing the column
    // in, nor by floating, nor by a fixed-width column in a page-level grid.
    // A rail is rem-scale; the bound admits glyph and icon gaps only.
    const reservations = declarations(css).filter((declaration) => {
      const inset =
        /^(?:margin|padding)-(?:right|left|inline(?:-start|-end)?)\s*:\s*([\d.]+)(rem|px)\b/.exec(
          declaration,
        );
      if (!inset) return false;
      return Number(inset[1]) * (inset[2] === "rem" ? 16 : 1) >= 64;
    });
    expect(reservations).toStrictEqual([]);
    expect(css).not.toMatch(/\bfloat\s*:\s*(?:left|right)/);
    expect(css).not.toMatch(/\.page\{[^}]*grid-template-columns/);
  });

  it("should cap prose to a readable measure and leave tables the full column", async () => {
    const css = stylesheet(renderPage(await loadExample()));
    const prose = /\.prose\{[^}]*max-width:\s*(\d+)ch/.exec(css);

    // SC-3: recovered width goes to tables, never to prose
    expect(prose).not.toBeNull();
    expect(Number(prose?.[1])).toBeGreaterThanOrEqual(45);
    expect(Number(prose?.[1])).toBeLessThanOrEqual(75);
    expect(css).toMatch(/\.table-wrap\{[^}]*overflow-x:\s*auto/);
    expect(css).not.toMatch(/\.table-wrap\{[^}]*max-width/);
    // SC-3, R-15: the .sr-only verdict labels are absolutely positioned, so
    // overflow-x clips them only while .table-wrap is their containing block.
    // Static, they escape the scroller and push documentElement.scrollWidth to
    // a constant 370px, overflowing the root at 320 and 360 CSS pixels. Assert
    // the pair — the guard means nothing if .sr-only stops being absolute.
    expect(css).toMatch(/\.sr-only\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.table-wrap\{[^}]*position:\s*relative/);
  });

  it("should collapse the drawer to a status bar carrying the unanswered count", async () => {
    const html = renderPage(await loadExample());
    const data = await loadExample();
    const questions = data.sections.flatMap((section) =>
      section.blocks.filter(
        (block: Block) => block.type === "choice" || block.type === "note",
      ),
    );
    const toggle = /<button\b[^>]*data-drawer-toggle[^>]*>/.exec(html)?.[0];
    const css = stylesheet(html);

    // SC-4: a button, not a hover target, controls the drawer
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('aria-controls="drawer-panel"');
    expect(html).toMatch(/<div class="drawer-panel" id="drawer-panel" hidden>/);
    // SC-4: the collapsed bar carries the action label and a true count
    expect(html).toContain(`>${data.action}</span>`);
    expect(html).toMatch(
      new RegExp(
        `data-unanswered-count aria-live="polite">${questions.length} unanswered<`,
      ),
    );
    expect(questions.length).toBeGreaterThan(0);
    // SC-4: the bar stays within 48px and wraps rather than overflowing
    expect(css).toMatch(/--bar:\s*48px/);
    expect(css).toMatch(/\.drawer-bar\{[^}]*min-height:\s*var\(--bar\)/);
    expect(css).toMatch(/\.drawer-bar\{[^}]*flex-wrap:\s*wrap/);
    // the live count must not sit inside the control, or the button's
    // accessible name changes under the reader on every answer
    expect(/<button\b[^>]*data-drawer-toggle[\s\S]*?<\/button>/.exec(html)?.[0]).not.toContain(
      "data-unanswered-count",
    );
  });

  it("should give the collapsed bar's whole height to the control that opens it", async () => {
    const html = renderPage(await loadExample());
    const css = stylesheet(html);
    const bar = /\.drawer-bar\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const toggle = /\.drawer-toggle\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const barPadding = bar
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration.startsWith("padding"));

    // WCAG 2.2 SC 2.5.8 asks for a 24x24 CSS px target. A 48px bar proves
    // nothing about the control a pointer actually has to hit: with the bar
    // centring its items, the button collapses to text height inside it. So
    // the control must claim the bar's height, and the bar must spend none of
    // that height on block padding the control cannot occupy.
    expect(toggle).toMatch(/align-self:\s*stretch/);
    expect(toggle).toMatch(/min-height:\s*var\(--bar\)/);
    expect(barPadding).toStrictEqual(["padding-inline:var(--pad)"]);
  });

  it("should forward a press anywhere on the collapsed bar to that control", async () => {
    const html = renderPage(await loadExample());
    const bar = /<div class="drawer-bar"[^>]*>/.exec(html)?.[0] ?? "";
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

    // the count sits outside the button, so without this the pill and the
    // strip it occupies stay dead to the pointer
    expect(bar).toContain("data-drawer-bar");
    expect(script).toMatch(/\[data-drawer-bar\]/);
    // purely additive: the button keeps the semantics, so the bar itself must
    // not become a second control in the accessibility tree
    expect(bar).not.toMatch(/\brole=|\btabindex=/);
    // a click that merely ends a drag over the bar's text is not a press
    expect(script).toMatch(/isCollapsed/);
    // scoped to the bar, never the panel, or reading an expanded drawer would
    // collapse it out from under the reader
    expect(script).not.toMatch(/drawer-panel[\s\S]{0,80}addEventListener\("click"/);
  });

  it("should expand the drawer to navigation, summaries and the reply", async () => {
    const data = await loadExample();
    const html = renderPage(data);
    const panel = /<div class="drawer-panel"[\s\S]*?<\/body>/.exec(html)?.[0];

    // SC-4: everything the drawer buys back over a bare count
    expect(panel).toMatch(/<nav class="drawer-nav" aria-label="Sections">/);
    for (const section of data.sections)
      expect(panel).toContain(`href="#s-${section.id}">${section.label}</a>`);
    expect(panel).toMatch(/<ul class="summaries" data-summaries>/);
    expect(panel).toMatch(/<button type="button" class="copy" data-copy>/);
    // the reply is populated before the runtime runs, not left empty
    expect(panel).toMatch(/<pre class="reply"[^>]*>[^<]*Final ranked direction/);
  });

  it("should wire the toggle to the panel it controls", async () => {
    const html = renderPage(await loadExample());
    const toggle = /<button\b[^>]*data-drawer-toggle[^>]*>/.exec(html)?.[0] ?? "";
    const controls = /aria-controls="([^"]+)"/.exec(toggle)?.[1];
    const panel = new RegExp(`<div class="drawer-panel" id="${controls}"([^>]*)>`);

    // SC-4: the control, its expanded state and the hidden panel must all
    // name the same element, or the disclosure is announced but does nothing
    expect(controls).toBeTruthy();
    expect(html).toMatch(panel);
    expect(panel.exec(html)?.[1]).toContain("hidden");
    expect(toggle).toMatch(/aria-expanded="false"/);
    // a button, never a hover target: hover fails touch, keyboard and readers
    expect(toggle).toMatch(/^<button type="button"/);
    expect(stylesheet(html)).not.toMatch(/\.drawer[^{]*:hover[^{]*\{[^}]*display/);
  });

  it("should escape author text in element content and in attributes", () => {
    // the escaping guard moved here from the verdict, which is now a closed
    // set and refused rather than escaped. These fields are free text by
    // design, so escaping is the only thing standing between an author and
    // injected markup — keep this coverage wherever the closed sets grow.
    const html = renderPage(
      page({
        title: 'Quotes "and" <tags>',
        sections: [
          {
            id: "s",
            label: "S",
            title: "T",
            blocks: [
              { type: "prose", text: '<script>alert("x")</script>' },
              {
                type: "callout",
                title: 'Head "quoted"',
                text: "<img src=x onerror=alert(1)>",
              },
              {
                type: "note",
                id: "n",
                label: "N",
                ask: "A",
                placeholder: '" onfocus="alert(1)',
              },
            ],
          },
        ],
      }),
    );

    expect(html).toContain("<title>Quotes &quot;and&quot; &lt;tags&gt;</title>");
    expect(html).toContain(
      '<p class="prose">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    );
    expect(html).toContain("<h3>Head &quot;quoted&quot;</h3>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // an attribute value must not be able to close its own attribute
    expect(html).toContain('placeholder="&quot; onfocus=&quot;alert(1)"');
    // the handler survives only as inert text: never as a live tag or attribute
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onfocus="alert(1)"');
    expect(html).not.toContain("<script>alert");
  });

  it("should refuse a verdict outside the closed set naming its path", () => {
    // an unrecognised verdict draws no .sr-only label and no glyph, so
    // escaping and emitting it degrades SC-6 to colour alone for that cell
    expect(() =>
      renderPage(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [
                {
                  type: "table",
                  columns: ["c"],
                  rows: [
                    [
                      {
                        text: "cell",
                        verdict: 'good" onmouseover="alert(1)' as "good",
                      },
                    ],
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].blocks[0].rows[0][0].verdict: required one of "good", "mixed", "bad", received "good\\" onmouseover=\\"alert(1)"',
      ),
    );
  });

  it("should carry each verdict as text, not by glyph and colour alone", async () => {
    const html = renderPage(await loadExample());
    const css = stylesheet(html);

    // SC-6: the ::before glyph is decorative and reaches no screen reader, so
    // every verdict cell must also carry the judgement as real text
    for (const [verdict, label] of [
      ["good", "clean"],
      ["mixed", "acceptable"],
      ["bad", "costly"],
    ])
      expect(html).toContain(
        `<td data-verdict="${verdict}"><span class="sr-only">${label}: </span>`,
      );
    // clipped, not display:none — the latter removes it from the tree entirely
    expect(css).toMatch(/\.sr-only\{[^}]*clip-path:\s*inset\(50%\)/);
    expect(/\.sr-only\{([^}]*)\}/.exec(css)?.[1]).not.toMatch(
      /display:\s*none|visibility:\s*hidden/,
    );
  });

  it("should set no text below the small-type floor", async () => {
    const css = stylesheet(renderPage(await loadExample()));
    const undersized = [...css.matchAll(/font(?:-size)?:[^;}]*?([\d.]+)rem/g)]
      .map((match) => Number(match[1]))
      .filter((size) => size < 0.72);

    // 0.72rem is 11.5px; below that the mono face stops being legible
    expect(undersized).toStrictEqual([]);
  });

  it("should associate the unanswered count with the control", async () => {
    const html = renderPage(await loadExample());
    const toggle = /<button\b[^>]*data-drawer-toggle[^>]*>/.exec(html)?.[0] ?? "";
    const describedBy = /aria-describedby="([^"]+)"/.exec(toggle)?.[1];

    // the count is outside the button so it stays out of the accessible name;
    // aria-describedby restores the association without a live name
    expect(describedBy).toBe("drawer-count");
    expect(html).toMatch(
      new RegExp(`<span class="drawer-count" id="${describedBy}" data-unanswered-count`),
    );
  });

  it("should render optional block fields as absent without emitting empties", () => {
    const html = renderPage(
      page({
        sections: [
          {
            id: "s",
            label: "S",
            title: "T",
            blocks: [
              {
                type: "choice",
                id: "c",
                label: "C",
                ask: "A",
                choices: [{ value: "only" }],
              },
              { type: "note", id: "n", label: "N", ask: "A" },
              { type: "callout", title: "H", text: "B" },
              { type: "metrics", items: [{ label: "L", value: "V" }] },
            ],
          },
        ],
      }),
    );

    // a choice without summary or recommended draws neither element
    expect(html).not.toContain("<small>");
    expect(html).not.toContain('class="badge"');
    // a note without a placeholder still emits a valid empty attribute
    expect(html).toContain('placeholder=""');
    // the masthead has no meta here, so no metric strip precedes the sections
    expect(html).not.toMatch(/<\/p>\s*<dl class="metrics">/);
    // both questions still reach the count and the pre-rendered reply
    expect(html).toContain(">2 unanswered<");
    expect(html).toContain("- C: (unanswered)");
    expect(html).toContain("- N: (unanswered)");
  });

  it("should render a section without an eyebrow as a bare number", () => {
    const html = renderPage(
      page({
        sections: [
          { id: "s", label: "S", title: "T", blocks: [] },
          { id: "t", label: "T2", eyebrow: "kicker", title: "T", blocks: [] },
        ],
      }),
    );

    expect(html).toContain('<p class="section-no">01</p>');
    expect(html).toContain('<p class="section-no">02 · kicker</p>');
  });

  it("should refuse an unknown block type naming its path", () => {
    expect(() =>
      renderPage(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "timeline" } as never],
            },
          ],
        }),
      ),
    ).toThrow(
      new RenderError('sections[0].blocks[0].type: unknown block type "timeline"'),
    );
  });

  it("should refuse a missing required field naming its path", () => {
    expect(() =>
      renderPage(
        page({
          sections: [
            { id: "s", label: "S", title: undefined as never, blocks: [] },
          ],
        }),
      ),
    ).toThrow(
      new RenderError("sections[0].title: required non-empty string, received undefined"),
    );
  });

  it("should refuse an unsupported kind naming the offending field", () => {
    expect(() => renderPage(page({ kind: "triage-board" as never }))).toThrow(
      new RenderError(
        'kind: required one of "ranked-options", "guided-interview", "risk-context-report", "architecture-board", received "triage-board"',
      ),
    );
  });
});

describe("fn:main", () => {
  it("should render the example data file to the requested output", async () => {
    const directory = await temporaryDirectory();
    const out = join(directory, "nested", "page.html");

    const code = await main([dataPath, "-o", out]);

    expect(code).toBe(0);
    expect(await readFile(out, "utf8")).toContain("<!doctype html>");
    await removeDirectory(directory);
  });

  it("should reject an invocation missing the output flag", async () => {
    expect(await main([dataPath])).toBe(2);
  });

  it("should reject a flag-shaped output path", async () => {
    expect(await main([dataPath, "-o", "-o"])).toBe(2);
  });

  it("should reject more than one data file", async () => {
    expect(await main([dataPath, dataPath, "-o", "/tmp/unused.html"])).toBe(2);
  });

  it("should report a data file that is not valid JSON", async () => {
    const directory = await temporaryDirectory();
    const broken = join(directory, "broken.json");
    await writeFile(broken, "{ not json", "utf8");

    expect(await main([broken, "-o", join(directory, "o.html")])).toBe(1);
    await removeDirectory(directory);
  });

  it("should report an unreadable data file", async () => {
    const directory = await temporaryDirectory();

    expect(
      await main([join(directory, "absent.json"), "-o", join(directory, "o.html")]),
    ).toBe(1);
    await removeDirectory(directory);
  });
});

describe("fn:renderPage kinds", () => {
  it.each([
    "ranked-options",
    "guided-interview",
    "risk-context-report",
    "architecture-board",
  ])("should render the %s kind", (kind) => {
    const html = renderPage(page({ kind } as Partial<PageData>));

    expect(html).toContain(`data-kind="${kind}"`);
  });

  it("should refuse an unknown kind, naming the field and quoting the value", () => {
    expect(() => renderPage(page({ kind: "mood-board" } as Partial<PageData>)))
      .toThrow(
        'kind: required one of "ranked-options", "guided-interview", "risk-context-report", "architecture-board", received "mood-board"',
      );
  });

  it("should render the architecture-board example end to end", async () => {
    const data = JSON.parse(
      await readFile(join(discover, "examples/data/architecture-board.json"), "utf8"),
    ) as PageData;
    const html = renderPage(data);

    expect(html).toContain('data-kind="architecture-board"');
    expect(html).toContain('<figure class="diagram"');
    // the sample carries a genuine long-range edge, not just a chain
    expect(html).toContain("dg-edge-around");
    expect(html).not.toMatch(/https?:\/\//i);
  });
});

/** wraps blocks in the one section the validation tests address by path. */
function withBlocks(...blocks: Block[]): Partial<PageData> {
  return { sections: [{ id: "s", label: "S", title: "T", blocks }] };
}

describe("fn:renderPage validation floor", () => {
  // SC-2: every author-supplied value is refused by its own JSON path. Before
  // this, an unguarded field reached escapeHtml and threw a bare
  // "value.replaceAll is not a function" naming nothing the author could find.
  it.each([
    [
      "callout.title",
      withBlocks({ type: "callout", title: 7 as never, text: "b" }),
      "sections[0].blocks[0].title: required non-empty string, received 7",
    ],
    [
      "callout.text",
      withBlocks({ type: "callout", title: "h", text: null as never }),
      "sections[0].blocks[0].text: required non-empty string, received null",
    ],
    [
      "table.columns[i]",
      withBlocks({
        type: "table",
        columns: ["a", 2 as never],
        rows: [[{ text: "x" }, { text: "y" }]],
      }),
      "sections[0].blocks[0].columns[1]: required non-empty string, received 2",
    ],
    [
      "table.rows[r][c].text",
      withBlocks({
        type: "table",
        columns: ["a"],
        rows: [[{ text: undefined as never }]],
      }),
      "sections[0].blocks[0].rows[0][0].text: required non-empty string, received undefined",
    ],
    [
      "choice.id",
      withBlocks({
        type: "choice",
        id: undefined as never,
        label: "L",
        ask: "A",
        choices: [{ value: "v" }],
      }),
      "sections[0].blocks[0].id: required non-empty string, received undefined",
    ],
    [
      "choice.label",
      withBlocks({
        type: "choice",
        id: "c",
        label: "" as never,
        ask: "A",
        choices: [{ value: "v" }],
      }),
      'sections[0].blocks[0].label: required non-empty string, received ""',
    ],
    [
      "choice.ask",
      withBlocks({
        type: "choice",
        id: "c",
        label: "L",
        ask: 0 as never,
        choices: [{ value: "v" }],
      }),
      "sections[0].blocks[0].ask: required non-empty string, received 0",
    ],
    [
      "choice.choices[i].summary",
      withBlocks({
        type: "choice",
        id: "c",
        label: "L",
        ask: "A",
        choices: [{ value: "v", summary: 3 as never }],
      }),
      "sections[0].blocks[0].choices[0].summary: required non-empty string, received 3",
    ],
    [
      "note.id",
      withBlocks({ type: "note", id: 1 as never, label: "L", ask: "A" }),
      "sections[0].blocks[0].id: required non-empty string, received 1",
    ],
    [
      "note.label",
      withBlocks({ type: "note", id: "n", label: null as never, ask: "A" }),
      "sections[0].blocks[0].label: required non-empty string, received null",
    ],
    [
      "note.ask",
      withBlocks({ type: "note", id: "n", label: "L", ask: undefined as never }),
      "sections[0].blocks[0].ask: required non-empty string, received undefined",
    ],
    [
      "note.placeholder",
      withBlocks({
        type: "note",
        id: "n",
        label: "L",
        ask: "A",
        placeholder: false as never,
      }),
      "sections[0].blocks[0].placeholder: required non-empty string, received false",
    ],
    [
      "masthead",
      { masthead: "not an object" as never },
      'masthead: required object, received "not an object"',
    ],
    [
      "reply",
      { reply: undefined as never },
      "reply: required object, received undefined",
    ],
    [
      "sections",
      { sections: {} as never },
      "sections: required array, received {}",
    ],
    [
      "section.blocks",
      { sections: [{ id: "s", label: "S", title: "T", blocks: 4 as never }] },
      "sections[0].blocks: required array, received 4",
    ],
    [
      "block.type",
      withBlocks({ type: 9 } as never),
      "sections[0].blocks[0].type: required non-empty string, received 9",
    ],
    [
      "metrics.items",
      withBlocks({ type: "metrics", items: [] }),
      "sections[0].blocks[0].items: required non-empty array, received []",
    ],
    [
      "choice.choices",
      withBlocks({
        type: "choice",
        id: "c",
        label: "L",
        ask: "A",
        choices: [],
      }),
      "sections[0].blocks[0].choices: required non-empty array, received []",
    ],
  ])("should refuse a bad %s naming its path", (_field, overrides, message) => {
    expect(() => renderPage(page(overrides))).toThrow(new RenderError(message));
  });

  it("should refuse a row whose cell count does not match the columns", () => {
    // a ragged row was emitted silently and misaligned every later cell
    expect(() =>
      renderPage(
        page(
          withBlocks({
            type: "table",
            columns: ["a", "b", "c"],
            rows: [
              [{ text: "1" }, { text: "2" }, { text: "3" }],
              [{ text: "1" }, { text: "2" }],
            ],
          }),
        ),
      ),
    ).toThrow(
      new RenderError(
        "sections[0].blocks[0].rows[1]: required 3 cells to match columns, received 2",
      ),
    );
  });

  it("should refuse a duplicate question id naming the second occurrence", () => {
    // two questions sharing an id share one radio group, so one answer
    // silently overwrites the other and {{answers}} loses a line
    expect(() =>
      renderPage(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "note", id: "gate", label: "First", ask: "A" }],
            },
            {
              id: "t",
              label: "T",
              title: "T",
              blocks: [
                { type: "prose", text: "between" },
                {
                  type: "choice",
                  id: "gate",
                  label: "Second",
                  ask: "A",
                  choices: [{ value: "v" }],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(
      new RenderError('sections[1].blocks[1].id: duplicate question id "gate"'),
    );
  });

  it("should refuse a duplicate section id naming the second occurrence", () => {
    expect(() =>
      renderPage(
        page({
          sections: [
            { id: "execution", label: "A", title: "A", blocks: [] },
            { id: "execution", label: "B", title: "B", blocks: [] },
          ],
        }),
      ),
    ).toThrow(
      new RenderError('sections[1].id: duplicate section id "execution"'),
    );
  });

  it("should refuse a section id that is unsafe as a URL fragment", () => {
    // the section emits id="s-<id>" and the nav emits href="#s-<id>", so a
    // space makes href="#s-my id", which silently fails to navigate — a dead
    // link with no error, and SC-5 quietly broken
    expect(() =>
      renderPage(
        page({
          sections: [{ id: "my id", label: "A", title: "A", blocks: [] }],
        }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].id: section id "my id" must match [A-Za-z0-9_-]+ to be a safe URL fragment',
      ),
    );
  });

  it("should refuse a question id that is unsafe as a URL fragment", () => {
    expect(() =>
      renderPage(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "note", id: "gate#1", label: "L", ask: "A" }],
            },
          ],
        }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].blocks[0].id: question id "gate#1" must match [A-Za-z0-9_-]+ to be a safe URL fragment',
      ),
    );
  });

  it("should refuse an empty section id", () => {
    // the empty string is refused, but by the upstream non-empty guard rather
    // than the fragment check — it never reaches it. asserted here so the
    // floor stays covered wherever the refusal is actually seated
    expect(() =>
      renderPage(
        page({ sections: [{ id: "", label: "A", title: "A", blocks: [] }] }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].id: required non-empty string, received ""',
      ),
    );
  });

  it("should refuse an unsafe id before the duplicate check claims it", () => {
    // ordering is load-bearing: a malformed id must never reach `seen`, so two
    // identical malformed ids report the fragment refusal at the *first*
    // occurrence, never a duplicate refusal at the second
    expect(() =>
      renderPage(
        page({
          sections: [
            { id: "a b", label: "A", title: "A", blocks: [] },
            { id: "a b", label: "B", title: "B", blocks: [] },
          ],
        }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].id: section id "a b" must match [A-Za-z0-9_-]+ to be a safe URL fragment',
      ),
    );
  });

  it("should still accept ids carrying hyphens and underscores", () => {
    const html = renderPage(
      page({
        sections: [
          {
            id: "risk_map-2",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "next_step-1", label: "L", ask: "A" }],
          },
        ],
      }),
    );

    expect(html).toContain('id="s-risk_map-2"');
    expect(html).toContain('href="#s-risk_map-2"');
    expect(html).toContain('data-question-id="next_step-1"');
  });

  it("should namespace section and question ids so the two cannot collide", () => {
    // the ban is on colliding question ids, not on every identifier the page
    // carries; a section and a question may legitimately share an authored
    // name, so the rendered DOM ids must be prefixed apart — otherwise a
    // note's `for` would resolve to the section and lose its label
    const html = renderPage(
      page({
        sections: [
          {
            id: "gate",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "gate", label: "L", ask: "A" }],
          },
        ],
      }),
    );

    expect(html).toContain('<section class="section" id="s-gate"');
    expect(html).toContain('<label class="q-label" for="q-gate">');
    expect(html).toContain('<textarea id="q-gate"');
    expect(html).toContain('data-question-id="gate"');

    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);

    expect(ids.length).toBe(new Set(ids).size);
  });

  it("should keep an authored id off the drawer's own chrome ids", () => {
    const html = renderPage(
      page({
        sections: [
          {
            id: "drawer-panel",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "drawer-count", label: "L", ask: "A" }],
          },
        ],
      }),
    );

    expect(html).toContain('<section class="section" id="s-drawer-panel"');
    expect(html).toContain('<textarea id="q-drawer-count"');

    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);

    expect(ids.length).toBe(new Set(ids).size);
  });
});

/** every block type this slice adds, with one valid instance of each. */
const NEW_BLOCKS = {
  steps: {
    type: "steps",
    items: [
      { title: "Bind authorization", text: "Reject stale evidence.", state: "done" },
      { title: "Record lineage", text: "Persist evidence IDs.", state: "current" },
      { title: "Drill the fallback", text: "Cut mid-request.", state: "todo" },
      { title: "Shadow review", text: "Measure demand." },
    ],
  },
  findings: {
    type: "findings",
    items: [
      { title: "Authorization race", severity: "critical", text: "Revocation lags the cache.", owner: "Identity platform", evidence: "Trace 1842" },
      { title: "Audit lacks lineage", severity: "elevated", text: "The event omits evidence IDs." },
      { title: "Citation overstatement", severity: "watch", text: "Overlap is not entailment." },
      { title: "Fallback wiring", severity: "clear", text: "Source-only render is reachable." },
    ],
  },
  checklist: {
    type: "checklist",
    id: "controls",
    label: "Launch controls",
    ask: "Which must show measured containment?",
    options: [
      { value: "Authorization binding", summary: "Reject stale evidence." },
      { value: "Reconstructable lineage" },
      { value: "Fallback drill" },
    ],
  },
  scale: {
    type: "scale",
    id: "confidence",
    label: "Containment confidence",
    ask: "How ready is the containment path?",
    points: [
      { value: "none", label: "Untested" },
      { value: "low" },
      { value: "high", label: "Drilled" },
    ],
  },
} as const satisfies Record<string, Block>;

describe("fn:renderPage new blocks", () => {
  it("should encode a step's progress as word, glyph, edge and only then colour", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.steps)));
    const css = stylesheet(html);

    // SC-6, channel 1: the state is real text, not a colour to be decoded
    expect(html).toContain('<li class="step" data-step-state="done">');
    expect(html).toContain('<span class="step-state">Done</span>');
    expect(html).toContain('<span class="step-state">In progress</span>');
    expect(html).toContain('<span class="step-state">Not started</span>');
    // an ordered list with a numbered marker, so order survives a linear read
    expect(html).toContain('<ol class="steps">');
    expect(css).toMatch(/\.step-marker::before\{content:counter\(step/);
    // SC-6, channel 2: a glyph per state, distinct from the others
    const glyphs = [...css.matchAll(/\.step-state::before\{content:"([^"]+)"/g)];
    expect(new Set(glyphs.map((glyph) => glyph[1])).size).toBe(3);
    // SC-6, channel 3: the marker's edge differs before any colour is read
    expect(css).toMatch(/\.step-marker\{[^}]*border:2px dashed/);
    expect(css).toMatch(/"done"\] \.step-marker\{border-style:solid/);
    expect(css).toMatch(/"current"\] \.step-marker\{border-style:double/);
  });

  it("should render a step without a state as a bare numbered entry", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.steps)));

    // an omitted state makes no claim, so it must draw no state word at all
    expect(html).toContain(
      '<li class="step"><span class="step-marker" aria-hidden="true"></span><div><p class="step-head"><strong class="step-title">Shadow review</strong></p><p>Measure demand.</p></div></li>',
    );
  });

  it("should keep four finding severities apart without reading any colour", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.findings)));
    const css = stylesheet(html);

    // SC-6, channel 1: the severity word is visible text on the card, not
    // .sr-only — a card has the room, and this is the kind's core block
    for (const word of ["Critical", "Elevated", "Watch", "Clear"])
      expect(html).toContain(`<span class="finding-severity">${word}</span>`);
    expect(html).not.toMatch(/class="finding-severity sr-only"/);
    // SC-6, channel 2: one glyph per severity, all four distinct
    const glyphs = [
      ...css.matchAll(/\.finding-severity::before\{content:"([^"]+)"/g),
    ].map((glyph) => glyph[1]);
    expect(new Set(glyphs).size).toBe(4);
    // SC-6, channel 3: this is what has to survive filter:grayscale(1), so
    // all four left-edge styles must differ from each other
    const edges = [
      ...css.matchAll(/\.finding\[data-severity="\w+"\]\{border-left-style:(\w+)/g),
    ].map((edge) => edge[1]);
    expect(edges).toStrictEqual(["double", "solid", "dashed", "dotted"]);
    // Two measured floors keep those four edge styles apart. Both held by
    // accident until they were pinned here.
    // 1. `double` binds the width floor, not `dashed`/`dotted` — it is the
    //    width-hungry member of the set, painting line/gap/line. Measured in
    //    Blink at greyscale threshold 128: at 2px it paints one line and
    //    collapses into `solid`; at 3px it paints black/white/black and
    //    survives. 3 is the cliff edge itself, not a rounded-down guess.
    const edgeWidth = /\.finding\{[^}]*border-left:(\d+)px solid/.exec(css);
    expect(edgeWidth).not.toBeNull();
    expect(Number(edgeWidth?.[1])).toBeGreaterThanOrEqual(3);
    // 2. Under ~32px of card height a dash paints as one segment, making
    //    `dashed` read as `solid`. The 32 was measured at the 7px edge above;
    //    dash length scales with border width, so a narrower edge yields
    //    shorter dashes and needs less height — this floor stays valid as the
    //    width shrinks. Card height is content-dependent (measured
    //    207px-642px), so vertical padding is the only floor we can assert.
    //    Read the whole shorthand: value 1 is the vertical padding only in
    //    the 1- and 2-value forms, so a 4-value drift would pass silently.
    const pad = /\.finding\{[^}]*padding:([^;}]+)/.exec(css);
    expect(pad).not.toBeNull();
    const sides = (pad?.[1] ?? "").trim().split(/\s+/);
    const rem = (value: string | undefined): number =>
      Number(/^([\d.]+)rem$/.exec(value ?? "")?.[1]);
    const [top, bottom] =
      sides.length > 2
        ? [rem(sides[0]), rem(sides[2])]
        : [rem(sides[0]), rem(sides[0])];

    expect((top + bottom) * 16).toBeGreaterThanOrEqual(32);
  });

  it("should draw a finding's owner and evidence only when given", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.findings)));
    const cards = html.split('<li class="finding"');

    expect(cards[1]).toContain("<dt>Owner</dt><dd>Identity platform</dd>");
    expect(cards[1]).toContain("<dt>Evidence</dt><dd>Trace 1842</dd>");
    // the second finding carries neither, so it draws no empty meta list
    expect(cards[2]).not.toContain("finding-meta");
  });

  it("should render a checklist as a multi-select whose answer is a set", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.checklist)));

    expect(html).toContain('data-question-kind="checklist"');
    expect(html).toContain('data-question-id="controls"');
    // checkboxes, not radios: more than one may be recorded at once
    expect(html.match(/type="checkbox" name="controls"/g)).toHaveLength(3);
    expect(html).not.toContain('type="radio" name="controls"');
    expect(html).toContain("<small>Reject stale evidence.</small>");
  });

  it("should render a scale as ordinals with visible endpoint anchors", () => {
    const html = renderPage(page(withBlocks(NEW_BLOCKS.scale)));

    expect(html).toContain('data-question-kind="scale"');
    // the ordinal is real information the recorded answer must carry
    expect(html).toContain('data-answer="1 of 3 — Untested"');
    expect(html).toContain('data-answer="2 of 3 — low"');
    expect(html).toContain('data-answer="3 of 3 — Drilled"');
    // the segment shows the number; the wording rides the accessible name
    expect(html).toContain(
      '<span aria-hidden="true">1</span><span class="sr-only">1 of 3 — Untested</span>',
    );
    // both ends are spelled out, so the row is readable without picking one
    expect(html).toContain(
      '<p class="scale-anchors"><span>1 — Untested</span><span>3 — Drilled</span></p>',
    );
  });

  it("should give a one-point scale no endpoint anchors to contradict", () => {
    const html = renderPage(
      page(
        withBlocks({
          type: "scale",
          id: "one",
          label: "L",
          ask: "A",
          points: [{ value: "only" }],
        }),
      ),
    );

    expect(html).toContain('data-answer="1 of 1 — only"');
    // the stylesheet still carries the rule; the markup must not use it
    expect(html).not.toContain('<p class="scale-anchors">');
  });

  it("should keep the pointer target of a scale segment at the segment itself", () => {
    const css = stylesheet(renderPage(page(withBlocks(NEW_BLOCKS.scale))));

    // WCAG 2.2 SC 2.5.8 — the visually hidden radio covers its whole segment,
    // so the target is the 2.75rem (44px) segment, not a 13px radio dot. The
    // segment's own box is browser-measured; this only pins the rule that
    // makes that measurement possible.
    expect(css).toMatch(/\.scale-point\{[^}]*min-height:2\.75rem/);
    expect(css).toMatch(/\.scale-point input\{[^}]*inset:0/);
    expect(css).toMatch(/\.scale-point:has\(input:focus-visible\)\{outline:/);
  });

  it("should let a narrow column shrink a choice grid track below its minimum", () => {
    const css = stylesheet(renderPage(page(withBlocks(NEW_BLOCKS.checklist))));

    // a bare minmax(17rem,1fr) demanded 272px inside a 272px page and
    // overflowed it by 50px, breaking the question card out of the column
    expect(css).toMatch(
      /\.choices\{[^}]*minmax\(min\(17rem,100%\),1fr\)/,
    );
    // the drawer's grid shares the defect and the fix; .metrics is exempt at
    // 13rem, which already fits the narrowest column the page can produce
    expect(css).toMatch(
      /\.drawer-grid\{[^}]*minmax\(min\(17rem,100%\),1fr\)/,
    );
    expect(css).not.toMatch(/minmax\(1[4-9]rem,1fr\)/);
  });
});

describe("fn:renderPage single-reply round trip", () => {
  const questions = page({
    sections: [
      {
        id: "s",
        label: "S",
        title: "T",
        blocks: [
          NEW_BLOCKS.checklist,
          NEW_BLOCKS.scale,
          NEW_BLOCKS.steps,
          NEW_BLOCKS.findings,
          { type: "note", id: "constraint", label: "Constraint", ask: "A" },
        ],
      },
    ],
    reply: { heading: "Generated reply", template: "Answers:\n{{answers}}" },
  });

  it("should count and pre-render every new question kind in the reply", () => {
    const html = renderPage(questions);

    // SC-5 sink 1 and 4: the reply's {{answers}} and the collapsed bar's
    // unanswered count both see all three questions and neither of the two
    // non-interactive blocks
    expect(html).toContain(">3 unanswered<");
    expect(html).toContain("- Launch controls: (unanswered)");
    expect(html).toContain("- Containment confidence: (unanswered)");
    expect(html).toContain("- Constraint: (unanswered)");
    expect(html).not.toContain("- Bind authorization");
    expect(html).not.toContain("- Authorization race");
  });

  it("should carry the attributes the runtime reads on every question kind", () => {
    const html = renderPage(questions);
    const fields = [...html.matchAll(/<(?:fieldset|div) class="question"[^>]*>/g)]
      .map((field) => field[0]);

    // SC-5 sinks 2 and 3: the drawer's itemised summaries and the
    // data-answered state on each row are built from these attributes alone,
    // so every question kind must carry all three
    expect(fields).toHaveLength(3);
    for (const field of fields) {
      expect(field).toMatch(/data-question\b/);
      expect(field).toMatch(/data-question-kind="(?:choice|note|checklist|scale)"/);
      expect(field).toMatch(/data-question-label="[^"]+"/);
    }
    expect(fields.map((field) => /data-question-kind="(\w+)"/.exec(field)?.[1]))
      .toStrictEqual(["checklist", "scale", "note"]);
  });

  it("should branch answerOf explicitly on every question kind it emits", () => {
    const html = renderPage(questions);
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const answerOf = /function answerOf\(field\)\{[\s\S]*?\n  \}/.exec(script)?.[0] ?? "";
    const kinds = [
      ...html.matchAll(/data-question-kind="(\w+)"/g),
    ].map((kind) => kind[1]);

    // PAGE_JS is a string constant: it is never executed by this suite and is
    // invisible to coverage, so its wiring is asserted structurally here and
    // observed in a browser separately. This is not a behavioural proof.
    expect(answerOf).not.toBe("");
    for (const kind of new Set(kinds))
      if (kind !== "note") expect(answerOf).toContain(`kind==="${kind}"`);
    // a set, not a scalar: the checklist branch must read every checked input
    expect(answerOf).toMatch(/querySelectorAll\("input:checked"\)/);
    expect(answerOf).toMatch(/\.join\(", "\)/);
    // the scale branch reads the ordinal the markup pre-computed
    expect(answerOf).toMatch(/point\.dataset\.answer/);
    // note stays the fallthrough, so the textarea read must survive
    expect(answerOf).toMatch(/querySelector\("textarea"\)\.value\.trim\(\)/);
  });

  it("should refuse a duplicate id across a checklist and a scale", () => {
    // the new kinds join the same page-wide id namespace as choice and note
    expect(() =>
      renderPage(
        page(
          withBlocks(NEW_BLOCKS.checklist, {
            ...NEW_BLOCKS.scale,
            id: "controls",
          }),
        ),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].blocks[1].id: duplicate question id "controls"',
      ),
    );
  });
});

describe("fn:renderPage new-block validation", () => {
  it.each([
    [
      "steps.items",
      { type: "steps", items: [] },
      "sections[0].blocks[0].items: required non-empty array, received []",
    ],
    [
      "steps.items[i].title",
      { type: "steps", items: [{ title: 2, text: "t" }] },
      "sections[0].blocks[0].items[0].title: required non-empty string, received 2",
    ],
    [
      "steps.items[i].text",
      { type: "steps", items: [{ title: "t", text: undefined }] },
      "sections[0].blocks[0].items[0].text: required non-empty string, received undefined",
    ],
    [
      "steps.items[i].state",
      { type: "steps", items: [{ title: "t", text: "x", state: "started" }] },
      'sections[0].blocks[0].items[0].state: required one of "done", "current", "todo", received "started"',
    ],
    [
      "findings.items",
      { type: "findings", items: [] },
      "sections[0].blocks[0].items: required non-empty array, received []",
    ],
    [
      "findings.items[i].severity",
      { type: "findings", items: [{ title: "t", severity: "high", text: "x" }] },
      'sections[0].blocks[0].items[0].severity: required one of "critical", "elevated", "watch", "clear", received "high"',
    ],
    [
      "findings.items[i].title",
      { type: "findings", items: [{ title: null, severity: "watch", text: "x" }] },
      "sections[0].blocks[0].items[0].title: required non-empty string, received null",
    ],
    [
      "findings.items[i].text",
      { type: "findings", items: [{ title: "t", severity: "watch", text: 5 }] },
      "sections[0].blocks[0].items[0].text: required non-empty string, received 5",
    ],
    [
      "findings.items[i].owner",
      { type: "findings", items: [{ title: "t", severity: "watch", text: "x", owner: 1 }] },
      "sections[0].blocks[0].items[0].owner: required non-empty string, received 1",
    ],
    [
      "findings.items[i].evidence",
      { type: "findings", items: [{ title: "t", severity: "watch", text: "x", evidence: [] }] },
      "sections[0].blocks[0].items[0].evidence: required non-empty string, received []",
    ],
    [
      "checklist.id",
      { type: "checklist", id: undefined, label: "L", ask: "A", options: [{ value: "v" }] },
      "sections[0].blocks[0].id: required non-empty string, received undefined",
    ],
    [
      "checklist.label",
      { type: "checklist", id: "c", label: 3, ask: "A", options: [{ value: "v" }] },
      "sections[0].blocks[0].label: required non-empty string, received 3",
    ],
    [
      "checklist.ask",
      { type: "checklist", id: "c", label: "L", ask: "", options: [{ value: "v" }] },
      'sections[0].blocks[0].ask: required non-empty string, received ""',
    ],
    [
      "checklist.options",
      { type: "checklist", id: "c", label: "L", ask: "A", options: [] },
      "sections[0].blocks[0].options: required non-empty array, received []",
    ],
    [
      "checklist.options[i].value",
      { type: "checklist", id: "c", label: "L", ask: "A", options: [{ value: 0 }] },
      "sections[0].blocks[0].options[0].value: required non-empty string, received 0",
    ],
    [
      "checklist.options[i].summary",
      { type: "checklist", id: "c", label: "L", ask: "A", options: [{ value: "v", summary: 9 }] },
      "sections[0].blocks[0].options[0].summary: required non-empty string, received 9",
    ],
    [
      "scale.id",
      { type: "scale", id: 4, label: "L", ask: "A", points: [{ value: "v" }] },
      "sections[0].blocks[0].id: required non-empty string, received 4",
    ],
    [
      "scale.label",
      { type: "scale", id: "s2", label: null, ask: "A", points: [{ value: "v" }] },
      "sections[0].blocks[0].label: required non-empty string, received null",
    ],
    [
      "scale.ask",
      { type: "scale", id: "s2", label: "L", ask: undefined, points: [{ value: "v" }] },
      "sections[0].blocks[0].ask: required non-empty string, received undefined",
    ],
    [
      "scale.points",
      { type: "scale", id: "s2", label: "L", ask: "A", points: [] },
      "sections[0].blocks[0].points: required non-empty array, received []",
    ],
    [
      "scale.points[i].value",
      { type: "scale", id: "s2", label: "L", ask: "A", points: [{ value: {} }] },
      "sections[0].blocks[0].points[0].value: required non-empty string, received {}",
    ],
    [
      "scale.points[i].label",
      { type: "scale", id: "s2", label: "L", ask: "A", points: [{ value: "v", label: 7 }] },
      "sections[0].blocks[0].points[0].label: required non-empty string, received 7",
    ],
  ])("should refuse a bad %s naming its path", (_field, block, message) => {
    expect(() => renderPage(page(withBlocks(block as never)))).toThrow(
      new RenderError(message),
    );
  });
});

describe("fn:renderPage examples", () => {
  /** loads one of the shipped example data files by kind. */
  async function loadKind(kind: string): Promise<PageData> {
    return JSON.parse(
      await readFile(join(discover, `examples/data/${kind}.json`), "utf8"),
    ) as PageData;
  }

  it("should render the guided-interview example under question density", async () => {
    const data = await loadKind("guided-interview");
    const html = renderPage(data);
    const questions = data.sections.flatMap((section) =>
      section.blocks.filter((block: Block) =>
        ["choice", "note", "checklist", "scale"].includes(block.type),
      ),
    );
    const kinds = new Set(
      [...html.matchAll(/data-question-kind="(\w+)"/g)].map((kind) => kind[1]),
    );

    expect(html).toContain('data-kind="guided-interview"');
    // SC-5 under density: "no answer is lost" is only a real claim on a page
    // crowded enough to lose one. Every question reaches the count and the
    // pre-rendered reply, across all four affordances and several sections.
    expect(questions.length).toBeGreaterThanOrEqual(10);
    expect(data.sections.length).toBeGreaterThanOrEqual(5);
    expect(kinds).toStrictEqual(new Set(["choice", "note", "checklist", "scale"]));
    expect(html).toContain(`>${questions.length} unanswered<`);
    for (const question of questions)
      expect(html).toContain(`- ${question.label}: (unanswered)`);
    // no id may repeat, or one answer would overwrite another silently
    const ids = [...html.matchAll(/data-question-id="([^"]+)"/g)].map((id) => id[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it("should render the risk-context-report example under severity encoding", async () => {
    const html = renderPage(await loadKind("risk-context-report"));

    expect(html).toContain('data-kind="risk-context-report"');
    // SC-6: all four severities are present, so the greyscale check has
    // something to fail on. Each carries its word as visible text.
    for (const [severity, word] of [
      ["critical", "Critical"],
      ["elevated", "Elevated"],
      ["watch", "Watch"],
      ["clear", "Clear"],
    ])
      expect(html).toContain(
        `<li class="finding" data-severity="${severity}"><p class="finding-head"><span class="finding-severity">${word}</span>`,
      );
    // plus a verdict-bearing table and a checklist launch gate
    expect(html).toMatch(/<td data-verdict="bad"><span class="sr-only">costly: /);
    expect(html).toMatch(/<td data-verdict="mixed"><span class="sr-only">acceptable: /);
    expect(html).toContain('data-question-kind="checklist"');
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it.each(["guided-interview", "risk-context-report"])(
    "should round-trip the %s example through the CLI",
    async (kind) => {
      const directory = await temporaryDirectory();
      const out = join(directory, `${kind}.html`);

      expect(await main([join(discover, `examples/data/${kind}.json`), "-o", out])).toBe(0);
      expect(await readFile(out, "utf8")).toContain(`data-kind="${kind}"`);
      await removeDirectory(directory);
    },
  );
});
