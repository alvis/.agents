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

  it("should expand the drawer to navigation, summaries and the reply", async () => {
    const data = await loadExample();
    const html = renderPage(data);
    const panel = /<div class="drawer-panel"[\s\S]*?<\/body>/.exec(html)?.[0];

    // SC-4: everything the drawer buys back over a bare count
    expect(panel).toMatch(/<nav class="drawer-nav" aria-label="Sections">/);
    for (const section of data.sections)
      expect(panel).toContain(`href="#${section.id}">${section.label}</a>`);
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
    const html = renderPage(
      page({
        title: 'Quotes "and" <tags>',
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
    );

    expect(html).toContain("<title>Quotes &quot;and&quot; &lt;tags&gt;</title>");
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain(
      '<td data-verdict="good&quot; onmouseover=&quot;alert(1)">',
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
