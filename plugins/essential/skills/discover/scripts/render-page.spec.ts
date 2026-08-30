import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAssets } from "./render-page/bundle.ts";
import { main } from "./render-page/cli.ts";
import { RenderError } from "./render-page/error.ts";
import { PAGE_KINDS } from "./render-page/types/page.ts";
import { renderPage } from "./render-page/page.ts";
import { CHOICE_TAGS } from "./render-page/types.ts";
import { removeDirectory, temporaryDirectory } from "./test-support.ts";

import type { Block, Choice, PageData } from "./render-page/types.ts";

const discover = resolve(import.meta.dirname, "..");
const dataPath = join(discover, "examples/data/ranked-options.json");

// bundling costs about as much as the rest of the file put together, so it
// happens once here rather than once a test
const assets = await buildAssets();

/**
 * renders a page with the assets the command line would have built.
 *
 * `renderPage` takes its stylesheet and scripts as data, so every call has to
 * supply them; naming that once keeps each test reading as the behaviour under
 * test rather than as asset plumbing.
 * @param data the page to render
 * @returns the rendered document
 */
function render(data: PageData): string {
  return renderPage(data, assets);
}

async function loadExample(): Promise<PageData> {
  return JSON.parse(await readFile(dataPath, "utf8")) as PageData;
}

/**
 * reads the runtime the page carries.
 *
 * a page holds two scripts — the scheme boot in the head and the runtime at
 * the end of the body — so a test that wants the runtime must say which, or it
 * silently asserts against the wrong one.
 * @param html the rendered page
 * @returns the last script's body
 */
function runtimeOf(html: string): string {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1] ?? "";
}

/**
 * reads the page's authored markup, with every script left out
 * @param html the rendered page
 * @returns the body up to the runtime
 */
function markupOf(html: string): string {
  return html.slice(html.indexOf("<body"), html.lastIndexOf("<script>"));
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

/**
 * builds a page holding one `choice` block, so a tag, trade-off, or
 * recommendation assertion reads against a single known question
 */
function choicePage(
  choice: Choice,
  overrides: Partial<Extract<Block, { type: "choice" }>> = {},
): PageData {
  return page({
    sections: [
      {
        id: "s",
        label: "S",
        title: "T",
        blocks: [
          { type: "choice", id: "c", ref: "Q2", label: "C", ask: "A", choices: [choice], ...overrides },
        ],
      },
    ],
  });
}

/**
 * every option label belonging to a `choice` question. The `checklist` branch
 * emits `<label class="choice">` too, so scoping to the fieldset kind is what
 * stops a checklist option — which carries neither attribute — from silently
 * satisfying the pairing assertion below.
 */
function choiceLabels(html: string): string[] {
  return [
    ...html.matchAll(
      /<fieldset class="question"[^>]*data-question-kind="choice"[\s\S]*?<\/fieldset>/g,
    ),
  ].flatMap((fieldset) =>
    [...fieldset[0].matchAll(/<label class="choice">[\s\S]*?<\/label>/g)].map(
      (match) => match[0],
    ),
  );
}

/** reads one attribute off a label's radio, or `undefined` when unset. */
function inputAttribute(label: string, name: string): string | undefined {
  return new RegExp(`<input[^>]*\\b${name}="([^"]*)"`).exec(label)?.[1];
}

/** the visible words of a markup fragment, with tags and entities dropped. */
function words(markup: string): string[] {
  return markup
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&[a-z]+;|&#\d+;/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * models the accessible name a screen reader computes for a radio wrapped in
 * a label: `aria-label` wins outright, otherwise the whole label is read.
 * Asserting on this rather than on attribute presence is deliberate — a
 * presence check passes on a broken pairing, which is the exact regression
 * this guards.
 */
function announcedName(label: string): string[] {
  const explicit = inputAttribute(label, "aria-label");
  return explicit === undefined ? words(label) : words(explicit);
}

/**
 * resolves an `aria-describedby` id to the element carrying it, so a test can
 * read what the description actually announces
 */
function elementById(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start === -1) throw new Error(`no element carries id ${id}`);
  // both description targets are spans, so walk to the matching close tag
  let cursor = html.indexOf(">", start) + 1;
  let depth = 1;
  while (depth > 0) {
    const open = html.indexOf("<span", cursor);
    const close = html.indexOf("</span>", cursor);
    if (close === -1) throw new Error(`id ${id} is never closed`);
    if (open !== -1 && open < close) {
      depth = depth + 1;
      cursor = open + 5;
    } else {
      depth = depth - 1;
      cursor = close + 7;
    }
  }
  return html.slice(start, cursor);
}

/** the full description a radio's `aria-describedby` resolves to. */
function announcedDescription(html: string, label: string): string {
  const target = inputAttribute(label, "aria-describedby");
  return target === undefined
    ? ""
    : target
        .split(" ")
        .map((id) => words(elementById(html, id)).join(" "))
        .join(" ");
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

/** the kinds a refusal quotes, in the order it quotes them. */
const QUOTED_KINDS = PAGE_KINDS.map((kind) => JSON.stringify(kind)).join(", ");

describe("fn:renderPage", () => {
  it("should emit a self-contained page with no external resource", async () => {
    const html = render(await loadExample());

    // SC-1: nothing on the page may be fetched over the network
    expect(html).not.toMatch(/<link\b[^>]*rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\b(?:srcset|@import)\b/i);
    expect(html).toMatch(/<style>[\s\S]+<\/style>/);
  });

  it("should render each section title directly above its content", async () => {
    const html = render(await loadExample());
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
    const css = stylesheet(render(await loadExample()));

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
    const css = stylesheet(render(await loadExample()));
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
    const html = render(await loadExample());
    const data = await loadExample();
    const questions = data.sections.flatMap((section) =>
      section.blocks.filter(
        (block: Block) =>
          block.type === "choice" ||
          block.type === "note" ||
          block.type === "decision",
      ),
    );
    const toggle = /<button\b[^>]*data-drawer-toggle[^>]*>/.exec(html)?.[0];
    const css = stylesheet(html);

    // SC-4: a button, not a hover target, controls the drawer
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('aria-controls="drawer-panel"');
    expect(html).toMatch(
      /<div class="drawer-panel" id="drawer-panel" inert aria-hidden="true">/,
    );
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
    const html = render(await loadExample());
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
    const html = render(await loadExample());
    const bar = /<div class="drawer-bar"[^>]*>/.exec(html)?.[0] ?? "";
    const script = runtimeOf(html);

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
    const html = render(data);
    // markup only: the slice stops at the runtime, or every selector the
    // bundle names would read as panel content
    const panel = /<div class="drawer-panel"[\s\S]*?<script>/.exec(html)?.[0];

    // SC-4: everything the drawer buys back over a bare count
    expect(panel).toMatch(/<nav class="drawer-nav" aria-label="Sections">/);
    for (const section of data.sections)
      expect(panel).toContain(`href="#s-${section.id}">${section.label}</a>`);
    expect(panel).toMatch(/<ul class="summaries" data-summaries>/);
    // the copy control lives in the collapsed bar, so the reply can be taken
    // without first opening the drawer to reach it
    expect(panel).not.toContain("data-copy");
    // the reply is populated before the runtime runs, not left empty
    expect(panel).toMatch(/<pre class="reply"[^>]*>[^<]*Final ranked direction/);
  });

  it("should wire the toggle to the panel it controls", async () => {
    const html = render(await loadExample());
    const toggle = /<button\b[^>]*data-drawer-toggle[^>]*>/.exec(html)?.[0] ?? "";
    const controls = /aria-controls="([^"]+)"/.exec(toggle)?.[1];
    const panel = new RegExp(`<div class="drawer-panel" id="${controls}"([^>]*)>`);

    // SC-4: the control, its expanded state and the closed panel must all
    // name the same element, or the disclosure is announced but does nothing.
    // The two closed-state attributes are asserted apart, because aria-hidden
    // spells the word the other one used to carry and would pass for it
    expect(controls).toBeTruthy();
    expect(html).toMatch(panel);
    expect(panel.exec(html)?.[1]).toMatch(/\binert\b/);
    expect(panel.exec(html)?.[1]).toContain('aria-hidden="true"');
    expect(toggle).toMatch(/aria-expanded="false"/);
    // a button, never a hover target: hover fails touch, keyboard and readers
    expect(toggle).toMatch(/^<button type="button"/);
    expect(stylesheet(html)).not.toMatch(/\.drawer[^{]*:hover[^{]*\{[^}]*display/);
  });

  it("should draw no reply controls on a board that asks nothing", () => {
    // HB2: a board can be all reading — the hub is one. Drawing the count, the
    // reply and the copy button anyway offers a reader an empty message to
    // send back, and a "0 unanswered" that can never become anything else
    // the assertions read the markup, not the page: the runtime is inlined
    // below it and names every one of these attributes in its own selectors,
    // so a whole-page search would find them however the drawer was drawn
    const markup = markupOf(
      render(
        page({
          reply: undefined,
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "callout", title: "h", text: "b" }],
            },
          ],
        }),
      ),
    );

    expect(markup).not.toContain("data-unanswered-count");
    expect(markup).not.toContain("data-reply-open");
    expect(markup).not.toContain("data-copy");
    expect(markup).not.toContain("data-reply-dialog");
    expect(markup).not.toContain("data-chip-strip");
    // the drawer itself stays: sections, notes and the scheme toggle are not
    // about answering, and a reading board still needs them
    expect(markup).toContain("data-drawer-toggle");
    expect(markup).not.toContain('aria-describedby="drawer-count"');
  });

  it("should hold the bar's controls at its far end whether or not it asks", async () => {
    const reading = render(
      page({
        reply: undefined,
        sections: [
          {
            id: "s",
            label: "S",
            title: "T",
            blocks: [{ type: "callout", title: "h", text: "b" }],
          },
        ],
      }),
    );
    const asking = render(await loadExample());
    const controls = /\.drawer-controls\{([^}]*)\}/.exec(stylesheet(asking))?.[1] ?? "";

    // the scheme control and the expand hint belong at the far end of the bar.
    // Carried there by the chip strip's flex-grow they arrive only on a board
    // that draws a strip: the hub asks nothing, so it drew neither strip nor
    // counters and the whole group collapsed back against the title. The group
    // pushes itself instead, which is a rule the page cannot fail to emit
    expect(controls).toMatch(/margin-inline-start:\s*auto/);
    for (const html of [reading, asking]) {
      const group =
        /<div class="drawer-controls">([\s\S]*?)<\/div>/.exec(markupOf(html))?.[1] ?? "";

      expect(group).toContain("data-scheme-toggle");
      expect(group).toContain("data-drawer-toggle");
    }
    // and the strip, when there is one, still sits before them rather than
    // being what puts them there
    expect(markupOf(asking).indexOf("data-chip-strip")).toBeLessThan(
      markupOf(asking).indexOf('<div class="drawer-controls">'),
    );
  });

  it("should draw the run's other boards below the drawer's three columns", () => {
    // the grid is what a reader opens the drawer for; the board set is where
    // they go once they have finished with this board, so it reads as a footer
    // rather than as the first thing between them and the sections they came
    // for. Nothing pinned the order before, so it drifted to the top unnoticed
    const markup = markupOf(
      renderPage(page(), {
        ...assets,
        set: {
          label: "Fixture run",
          boards: [
            { id: "fixture", label: "This board", href: "./fixture.html" },
            { id: "other", label: "Other board", href: "./other.html" },
          ],
        },
      }),
    );
    const sheet = markup.slice(markup.indexOf('<div class="drawer-sheet">'));

    expect(sheet).toContain('<nav class="board-set"');
    expect(sheet.indexOf('class="board-set"')).toBeGreaterThan(
      sheet.indexOf('class="drawer-notes"'),
    );
  });

  it("should escape author text in element content and in attributes", () => {
    // the escaping guard moved here from the verdict, which is now a closed
    // set and refused rather than escaped. These fields are free text by
    // design, so escaping is the only thing standing between an author and
    // injected markup — keep this coverage wherever the closed sets grow.
    const html = render(
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
      ref: "Q3",
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
      render(
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
    const html = render(await loadExample());
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
    const css = stylesheet(render(await loadExample()));
    const undersized = [...css.matchAll(/font(?:-size)?:[^;}]*?([\d.]+)rem/g)]
      .map((match) => Number(match[1]))
      .filter((size) => size < 0.72);

    // 0.72rem is 11.5px; below that the mono face stops being legible
    expect(undersized).toStrictEqual([]);
  });

  it("should associate the unanswered count with the control", async () => {
    const html = render(await loadExample());
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
    const html = render(
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
                ref: "Q4",
                label: "C",
                ask: "A",
                choices: [{ value: "only" }],
              },
              { type: "note", id: "n", ref: "Q5", label: "N", ask: "A" },
              { type: "callout", title: "H", text: "B" },
              { type: "metrics", items: [{ label: "L", value: "V" }] },
            ],
          },
        ],
      }),
    );

    // a choice without summary, tags, pros/cons, or a recommendation draws
    // none of those elements rather than an empty shell of each
    expect(html).not.toContain("<small>");
    expect(html).not.toContain('class="badge"');
    expect(html).not.toContain('class="badges"');
    expect(html).not.toContain('class="tradeoffs"');
    expect(html).not.toContain('class="recommendation"');
    // a note without a placeholder still emits a valid empty attribute
    expect(html).toContain('placeholder=""');
    // the masthead has no meta here, so no metric strip precedes the sections
    expect(html).not.toMatch(/<\/p>\s*<dl class="metrics">/);
    // both questions still reach the count and the pre-rendered reply
    expect(html).toContain(">2 unanswered<");
    expect(html).toContain("- **Q4 · C:** unanswered");
    expect(html).toContain("- **Q5 · N:** unanswered");
  });

  it.each([...CHOICE_TAGS])("should draw the %s tag as a badge", (tag) => {
    const html = render(choicePage({ value: "only", tags: [tag] }));

    expect(html).toContain(`<span class="badge" data-tag="${tag}">${tag}</span>`);
    expect(html).toMatch(/<span class="badges" id="[^"]+"><span class="badge"/);
  });

  it("should draw every tag of a choice in the order given", () => {
    const html = render(
      choicePage({ value: "only", tags: ["Pragmatic", "Recommended"] }),
    );

    // questions.md asks for every applicable tag, so they are a list rather
    // than the single winner the old boolean could express
    expect(html).toContain(
      '<span class="badge" data-tag="Pragmatic">Pragmatic</span><span class="badge" data-tag="Recommended">Recommended</span></span>',
    );
  });

  it("should refuse a tag outside the vocabulary naming the offending field", () => {
    expect(() =>
      render(
        choicePage({ value: "only", tags: ["Blessed" as never] }),
      ),
    ).toThrow(
      new RenderError(
        'sections[0].blocks[0].choices[0].tags[0]: required one of "Architectural", "Ideal", "Recommended", "Pragmatic", "Hotfix", "Workaround", received "Blessed"',
      ),
    );
  });

  it("should refuse an empty tag list rather than drawing an empty badge row", () => {
    expect(() =>
      render(choicePage({ value: "only", tags: [] })),
    ).toThrow(
      new RenderError(
        "sections[0].blocks[0].choices[0].tags: required non-empty array, received []",
      ),
    );
  });

  it("should draw pros and cons as labelled runs inside the choice label", () => {
    const html = render(
      choicePage({
        value: "only",
        pros: ["Cheap to reverse", "No new vendor"],
        cons: ["Slower first release"],
      }),
    );

    expect(html).toContain(
      '<span class="tradeoffs"><span class="tradeoff" data-tradeoff="pros"><span class="tradeoff-label">Pros</span><span class="tradeoff-item">Cheap to reverse</span><span class="tradeoff-item">No new vendor</span></span><span class="tradeoff" data-tradeoff="cons"><span class="tradeoff-label">Cons</span><span class="tradeoff-item">Slower first release</span></span></span>',
    );
    // <label> admits phrasing content only, so a <ul> here is invalid HTML.
    // It would still parse as a child of the label rather than being moved,
    // so this guards spec conformance, not the click target
    const label = /<label class="choice">[\s\S]*?<\/label>/.exec(html)?.[0];
    expect(label).toContain('class="tradeoffs"');
    expect(label).not.toContain("<ul");
  });

  it("should draw one side of a trade-off when only that side is given", () => {
    const html = render(
      choicePage({ value: "only", cons: ["Hard to undo"] }),
    );

    expect(html).toContain('data-tradeoff="cons"');
    expect(html).not.toContain('data-tradeoff="pros"');
  });

  it("should refuse a non-string trade-off clause naming the offending field", () => {
    expect(() =>
      render(choicePage({ value: "only", pros: [7 as never] })),
    ).toThrow(
      new RenderError(
        "sections[0].blocks[0].choices[0].pros[0]: required non-empty string, received 7",
      ),
    );
  });

  it("should state the recommendation and its reason after the choices", () => {
    const html = render(
      choicePage(
        { value: "only", tags: ["Recommended"] },
        {
          recommendation:
            "Producer adapter, because it is the only option we can reverse inside one sprint.",
        },
      ),
    );

    // the badge says which; questions.md also wants the why, and the why is
    // a property of the question rather than of any single answer, so it sits
    // after the grid rather than inside one label
    expect(html).toContain(
      '</div><p class="recommendation"><span class="recommendation-label">Recommendation</span> Producer adapter, because it is the only option we can reverse inside one sprint.</p></fieldset>',
    );
  });

  it("should escape a recommendation rather than emitting its markup", () => {
    const html = render(
      choicePage({ value: "only" }, { recommendation: '<b>a</b>&"' }),
    );

    expect(html).toContain("&lt;b&gt;a&lt;/b&gt;&amp;&quot;");
    expect(html).not.toContain("<b>a</b>");
  });

  it("should refuse a non-string recommendation naming the offending field", () => {
    expect(() =>
      render(choicePage({ value: "only" }, { recommendation: 7 as never })),
    ).toThrow(
      new RenderError(
        "sections[0].blocks[0].recommendation: required non-empty string, received 7",
      ),
    );
  });

  it("should announce a choice option as its title alone", async () => {
    const html = render(await loadExample());

    // the label wraps the radio, so before the name/description split the
    // whole card was the accessible name — 38 words on the first option
    const named = choiceLabels(html).map((label) => ({
      value: inputAttribute(label, "value"),
      announced: announcedName(label).join(" "),
    }));

    expect(named).not.toStrictEqual([]);
    for (const option of named) expect(option.announced).toBe(option.value);
    // measured, not assumed: no option's name exceeds its own title length
    expect(Math.max(...named.map((o) => o.announced.split(" ").length))).toBeLessThanOrEqual(4);
  });

  it("should keep the trade-offs announced as the option's description", async () => {
    const html = render(await loadExample());
    const first = choiceLabels(html)[0];
    const description = announcedDescription(html, first);

    // aria-label alone would shorten the name by hiding this text entirely,
    // trading a verbosity bug for information loss; the description is what
    // keeps summary, pros, cons, and tags reachable
    expect(description).toContain("Preserve as the reversible baseline.");
    expect(description).toContain("Pros");
    expect(description).toContain("Reversible by one switch, inside a single sprint.");
    expect(description).toContain("Cons");
    expect(description).toContain("Leaves translation logic in the producer");
    expect(description).toContain("Pragmatic");
    expect(description).toContain("Recommended");
  });

  it.each([
    "ranked-options",
    "guided-interview",
    "risk-context-report",
    "architecture-board",
  ])("should pair name and description on every %s option", async (kind) => {
    const data = JSON.parse(
      await readFile(join(discover, `examples/data/${kind}.json`), "utf8"),
    ) as PageData;
    const html = render(data);

    for (const label of choiceLabels(html)) {
      const named = inputAttribute(label, "aria-label") !== undefined;
      const described = inputAttribute(label, "aria-describedby") !== undefined;
      // every sample option carries a summary and tags, so all of them are
      // expected to be described; a bare option is covered separately below
      expect(described).toBe(true);
      // neither attribute ships without the other; a lone aria-label is the
      // information-loss failure, a lone describedby leaves the name bloated
      expect(named).toBe(described);
      // every id the description points at must actually resolve
      if (described) expect(announcedDescription(html, label)).not.toBe("");
    }
  });

  it("should leave a bare option unlabelled rather than describing nothing", () => {
    const html = render(choicePage({ value: "only" }));
    const [label] = choiceLabels(html);

    // with no summary, tags, or trade-offs the label is already just the
    // title, so both attributes would be noise
    expect(inputAttribute(label, "aria-label")).toBeUndefined();
    expect(inputAttribute(label, "aria-describedby")).toBeUndefined();
    expect(announcedName(label).join(" ")).toBe("only");
  });

  it.each([
    "ranked-options",
    "guided-interview",
    "risk-context-report",
    "architecture-board",
  ])("should back every class %s emits with a rule", async (kind) => {
    const data = JSON.parse(
      await readFile(join(discover, `examples/data/${kind}.json`), "utf8"),
    ) as PageData;
    const html = render(data);
    const css = stylesheet(html);

    // there is no lint and no type check in this repository, so a class that
    // is emitted but never styled has nothing else to catch it; the page
    // simply renders unstyled in front of the reader
    const emitted = [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) =>
      match[1].split(" "),
    );
    const unstyled = [...new Set(emitted)].filter(
      (name) => !css.includes(`.${name}`),
    );

    expect(unstyled).toStrictEqual([]);
  });

  it("should render a section without an eyebrow as a bare number", () => {
    const html = render(
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
      render(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              // deliberately not a name the vocabulary is likely to grow
              // into: this fixture named "timeline" until timeline shipped
              blocks: [{ type: "hologram" } as never],
            },
          ],
        }),
      ),
    ).toThrow(
      new RenderError('sections[0].blocks[0].type: unknown block type "hologram"'),
    );
  });

  it("should refuse a missing required field naming its path", () => {
    expect(() =>
      render(
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
    // quoted from PAGE_KINDS rather than spelled out: the list grew from four
    // to fifteen in stage 4, and a spelled-out copy fails on the growth
    // rather than on the behaviour
    expect(() => render(page({ kind: "mood-board" as never }))).toThrow(
      new RenderError(
        `kind: required one of ${QUOTED_KINDS}, received "mood-board"`,
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

  it("should render a whole run from one invocation", async () => {
    const directory = await temporaryDirectory();
    const run = join(directory, "run.json");
    await writeFile(
      run,
      JSON.stringify({
        label: "One run",
        boards: [
          { id: "a", label: "A", data: "a.json", out: "a.html" },
          { id: "b", label: "B", data: "b.json", out: "b.html" },
        ],
      }),
      "utf8",
    );
    for (const id of ["a", "b"])
      await writeFile(
        join(directory, `${id}.json`),
        JSON.stringify(page({ id })),
        "utf8",
      );
    const out = join(directory, "out");

    const code = await main(["--set", run, "-o", out]);

    expect(code).toBe(0);
    // one invocation, both boards, and each carrying the other
    expect(await readFile(join(out, "a.html"), "utf8")).toContain(
      'data-board-link="b"',
    );
    expect(await readFile(join(out, "b.html"), "utf8")).toContain(
      'data-board-link="a"',
    );
    await removeDirectory(directory);
  });

  it("should reject a run invocation naming two run files", async () => {
    expect(await main(["--set", "a.json", "b.json", "-o", "/tmp/out"])).toBe(2);
  });

  it("should report an unreadable run file", async () => {
    expect(await main(["--set", "/nowhere/run.json", "-o", "/tmp/out"])).toBe(1);
  });
});

describe("fn:renderPage kinds", () => {
  it.each([
    "ranked-options",
    "guided-interview",
    "risk-context-report",
    "architecture-board",
  ])("should render the %s kind", (kind) => {
    const html = render(page({ kind } as Partial<PageData>));

    expect(html).toContain(`data-kind="${kind}"`);
  });

  it("should refuse an unknown kind, naming the field and quoting the value", () => {
    expect(() => render(page({ kind: "mood-board" } as Partial<PageData>)))
      .toThrow(`kind: required one of ${QUOTED_KINDS}, received "mood-board"`);
  });

  it("should accept every kind it advertises", () => {
    for (const kind of PAGE_KINDS)
      expect(() => render(page({ kind }))).not.toThrow();
  });

  it("should render the architecture-board example end to end", async () => {
    const data = JSON.parse(
      await readFile(join(discover, "examples/data/architecture-board.json"), "utf8"),
    ) as PageData;
    const html = render(data);

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
      "sections[0].blocks[0].columns[1]: required a non-empty string or a column object, received 2",
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
      ref: "Q6",
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
      ref: "Q7",
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
      ref: "Q8",
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
      ref: "Q9",
        label: "L",
        ask: "A",
        choices: [{ value: "v", summary: 3 as never }],
      }),
      "sections[0].blocks[0].choices[0].summary: required non-empty string, received 3",
    ],
    [
      "note.id",
      withBlocks({ type: "note", id: 1 as never, ref: "Q10", label: "L", ask: "A" }),
      "sections[0].blocks[0].id: required non-empty string, received 1",
    ],
    [
      "note.label",
      withBlocks({ type: "note", id: "n", ref: "Q11", label: null as never, ask: "A" }),
      "sections[0].blocks[0].label: required non-empty string, received null",
    ],
    [
      "note.ask",
      withBlocks({ type: "note", id: "n", ref: "Q12", label: "L", ask: undefined as never }),
      "sections[0].blocks[0].ask: required non-empty string, received undefined",
    ],
    [
      "note.placeholder",
      withBlocks({
        type: "note",
        id: "n",
      ref: "Q13",
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
      ref: "Q14",
        label: "L",
        ask: "A",
        choices: [],
      }),
      "sections[0].blocks[0].choices: required non-empty array, received []",
    ],
  ])("should refuse a bad %s naming its path", (_field, overrides, message) => {
    expect(() => render(page(overrides))).toThrow(new RenderError(message));
  });

  it("should refuse a board that asks a question and carries no reply", () => {
    // the reply is required by what the page asks, not by the page existing.
    // The fixture has to hold a question, or this passes on a board that was
    // never obliged to reply in the first place
    expect(() =>
      render(
        page({
          ...withBlocks({
            type: "note",
            id: "n",
            ref: "N1",
            label: "L",
            ask: "A",
            placeholder: "P",
          }),
          reply: undefined,
        }),
      ),
    ).toThrow(new RenderError("reply: required object, received undefined"));
  });

  it("should refuse a row whose cell count does not match the columns", () => {
    // a ragged row was emitted silently and misaligned every later cell
    expect(() =>
      render(
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

  it("should refuse a question with no citation code", () => {
    // the code is how a reader names the question in the reply they send back,
    // so a board that omits one asks for an answer nobody can cite
    expect(() =>
      render(page(withBlocks({ type: "note", id: "n", label: "L", ask: "A" } as never))),
    ).toThrow(
      new RenderError(
        "sections[0].blocks[0].ref: required non-empty string, received undefined",
      ),
    );
  });

  it.each([
    ["too long for the chip", "DECISION-1"],
    ["not starting on a letter or digit", "-D1"],
    ["holding a character outside the grammar", "D.1"],
  ])("should refuse a citation code %s", (_why, ref) => {
    expect(() =>
      render(page(withBlocks({ type: "note", id: "n", ref, label: "L", ask: "A" }))),
    ).toThrow(
      new RenderError(
        `sections[0].blocks[0].ref: citation code ${JSON.stringify(ref)} must match [A-Za-z0-9][A-Za-z0-9-]{0,5} — it is drawn inside a chip, so it has to stay short`,
      ),
    );
  });

  it("should refuse a duplicate citation code naming the second occurrence", () => {
    // two questions sharing a code make every citation ambiguous, and the
    // chip strip draws the same square twice with different answers behind it
    expect(() =>
      render(
        page(
          withBlocks(
            { type: "note", id: "one", ref: "D1", label: "First", ask: "A" },
            { type: "note", id: "two", ref: "D1", label: "Second", ask: "A" },
          ),
        ),
      ),
    ).toThrow(
      new RenderError('sections[0].blocks[1].ref: duplicate citation code "D1"'),
    );
  });

  it("should refuse a duplicate question id naming the second occurrence", () => {
    // two questions sharing an id share one radio group, so one answer
    // silently overwrites the other and {{answers}} loses a line
    expect(() =>
      render(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "note", id: "gate", ref: "Q15", label: "First", ask: "A" }],
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
                  ref: "Q16",
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
      render(
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
      render(
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
      render(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "note", id: "gate#1", ref: "Q17", label: "L", ask: "A" }],
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
      render(
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
      render(
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
    const html = render(
      page({
        sections: [
          {
            id: "risk_map-2",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "next_step-1", ref: "Q18", label: "L", ask: "A" }],
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
    const html = render(
      page({
        sections: [
          {
            id: "gate",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "gate", ref: "Q19", label: "L", ask: "A" }],
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
    const html = render(
      page({
        sections: [
          {
            id: "drawer-panel",
            label: "S",
            title: "T",
            blocks: [{ type: "note", id: "drawer-count", ref: "Q20", label: "L", ask: "A" }],
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
      ref: "Q21",
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
      ref: "Q22",
    label: "Containment confidence",
    ask: "How ready is the containment path?",
    points: [
      { value: "none", label: "Untested" },
      { value: "low" },
      { value: "high", label: "Drilled" },
    ],
  },
  decision: {
    type: "decision",
    id: "rollout",
      ref: "Q23",
    label: "Rollout plan",
    ask: "Approve the staged rollout behind a flag, or ask for a change.",
    placeholder: "For example: hold the flag open for a week.",
  },
} as const satisfies Record<string, Block>;

describe("fn:renderPage new blocks", () => {
  it("should encode a step's progress as word, glyph, edge and only then colour", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.steps)));
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
    const html = render(page(withBlocks(NEW_BLOCKS.steps)));

    // an omitted state makes no claim, so it must draw no state word at all
    expect(html).toContain(
      '<li class="step"><span class="step-marker" aria-hidden="true"></span><div><p class="step-head"><strong class="step-title">Shadow review</strong></p><p>Measure demand.</p></div></li>',
    );
  });

  it("should keep four finding severities apart without reading any colour", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.findings)));
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
    const html = render(page(withBlocks(NEW_BLOCKS.findings)));
    const cards = html.split('<li class="finding"');

    expect(cards[1]).toContain("<dt>Owner</dt><dd>Identity platform</dd>");
    expect(cards[1]).toContain("<dt>Evidence</dt><dd>Trace 1842</dd>");
    // the second finding carries neither, so it draws no empty meta list
    expect(cards[2]).not.toContain("finding-meta");
  });

  it("should render a checklist as a multi-select whose answer is a set", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.checklist)));

    expect(html).toContain('data-question-kind="checklist"');
    expect(html).toContain('data-question-id="controls"');
    // checkboxes, not radios: more than one may be recorded at once
    expect(html.match(/type="checkbox" name="controls"/g)).toHaveLength(3);
    expect(html).not.toContain('type="radio" name="controls"');
    expect(html).toContain("<small>Reject stale evidence.</small>");
  });

  it("should render a scale as ordinals with visible endpoint anchors", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.scale)));

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
    const html = render(
      page(
        withBlocks({
          type: "scale",
          id: "one",
      ref: "Q24",
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
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.scale))));

    // WCAG 2.2 SC 2.5.8 — the visually hidden radio covers its whole segment,
    // so the target is the 2.75rem (44px) segment, not a 13px radio dot. The
    // segment's own box is browser-measured; this only pins the rule that
    // makes that measurement possible.
    expect(css).toMatch(/\.scale-point\{[^}]*min-height:2\.75rem/);
    expect(css).toMatch(/\.scale-point input\{[^}]*inset:0/);
    expect(css).toMatch(/\.scale-point:has\(input:focus-visible\)\{outline:/);
  });

  it("should render a decision as two mutually exclusive verdict buttons", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.decision)));

    expect(html).toContain('data-question-kind="decision"');
    expect(html).toContain('data-question-id="rollout"');
    // what is being approved rides in the ask, per the user's direction
    expect(html).toContain(
      "Approve the staged rollout behind a flag, or ask for a change.",
    );
    // real buttons carrying a toggle state, not radios dressed as buttons
    expect(html).toContain(
      '<button type="button" class="verdict" data-verdict="approve" aria-pressed="false">Approve</button>',
    );
    expect(html).toContain(
      '<button type="button" class="verdict" data-verdict="change" aria-pressed="false">Change</button>',
    );
    // both start unpressed: a fresh page states no verdict of its own. Read
    // the markup alone — the inlined stylesheet and runtime both mention the
    // pressed state and would mask a pressed button here.
    const markup = markupOf(html);
    expect(markup).toContain('data-question-kind="decision"');
    expect(markup).not.toContain('aria-pressed="true"');
  });

  it("should hide a decision's note until Change is pressed", () => {
    const html = render(page(withBlocks(NEW_BLOCKS.decision)));

    // hidden in the markup, so a page opened without JavaScript shows the ask
    // alone rather than a note field for a verdict nobody gave
    expect(html).toContain('<div class="verdict-note" data-verdict-note hidden>');
    expect(html).toContain(
      '<label class="q-label" for="q-rollout">What to change</label>',
    );
    expect(html).toContain(
      '<textarea id="q-rollout" placeholder="For example: hold the flag open for a week."></textarea>',
    );
    // the reveal and the focus move are executed, not scraped, in
    // render-page/runtime/verdict.spec.ts
  });

  it("should ship the delegated verdict click branch in the page runtime", () => {
    const script = runtimeOf(render(page(withBlocks(NEW_BLOCKS.decision))));

    // the trap: refresh is wired to "input" and "change", and a button fires
    // neither, so without this branch the tally and the reply never move. What
    // the branch *does* is executed in render-page/runtime/verdict.spec.ts;
    // this asserts only that the bundle the page carries still contains it.
    expect(script).toContain("function installVerdicts(");
    expect(script).toContain("installVerdicts(");
  });

  it("should keep a pressed verdict readable without reading any colour", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.decision))));

    // SC-6, channel 1: the verdict word is the button's own visible text
    // SC-6, channel 2: the border goes dashed 1px to solid 3px
    expect(css).toMatch(/\.verdict\{[^}]*border:1px dashed/);
    expect(css).toMatch(/\.verdict\[aria-pressed="true"\]\{[^}]*border-style:solid/);
    expect(css).toMatch(/\.verdict\[aria-pressed="true"\]\{[^}]*border-width:3px/);
    // SC-6, channel 3: the leading glyph changes, and the two pressed glyphs
    // differ from the unpressed one and from each other
    const glyphs = [
      ...css.matchAll(/\.verdict[^{]*::before\{content:"([^"]+)"/g),
    ].map((glyph) => glyph[1]);
    expect(glyphs).toHaveLength(3);
    expect(new Set(glyphs).size).toBe(3);
    // WCAG 2.2 SC 2.5.8 — the button is the target, so it carries the 44px
    expect(css).toMatch(/\.verdict\{[^}]*min-height:2\.75rem/);
  });

  it("should let a narrow column shrink a choice grid track below its minimum", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.checklist))));

    // a bare minmax(17rem,1fr) demanded 272px inside a 272px page and
    // overflowed it by 50px, breaking the question card out of the column
    expect(css).toMatch(
      /\.choices\{[^}]*minmax\(min\(17rem,100%\),1fr\)/,
    );
    // DR1: the drawer's grid is three declared columns rather than as many as
    // fit, so its tracks carry no minimum of their own to overflow with — and
    // the narrowest viewport gets one column rather than three slivers.
    // .metrics is exempt at 13rem, which already fits the narrowest column
    expect(css).toMatch(
      /\.drawer-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
    );
    expect(css).toMatch(
      /@media \(max-width:40rem\)\{\.drawer-grid\{grid-template-columns:minmax\(0,1fr\)\}\}/,
    );
    expect(css).not.toMatch(/minmax\(1[4-9]rem,1fr\)/);
  });

  it("should stretch a board card to the row it shares", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.checklist))));

    // HB1 moved the border and the background from the list item onto the
    // anchor, and an anchor is not stretched by the grid the item is in: a
    // card with a shorter blurb stood 21px short of its neighbours, driven at
    // 1440px on the hub. The item hands its height down instead
    expect(css).toContain(".board-index li{display:grid}");
    expect(css).not.toMatch(/\.board-card\{display:block/);
  });

  it("should fade only the end of the chip strip that hides a chip", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.checklist))));
    const strip = /\.chip-strip\{([^}]*)\}/.exec(css)?.[1] ?? "";

    // masked at both ends unconditionally, the first chip lay under a gradient
    // from the moment the page loaded, which on a 2rem square reads as a
    // half-drawn code rather than as the start of a row. The runtime says which
    // end is cutting one off and the mask follows it
    expect(strip).not.toContain("mask-image");
    expect(css).toMatch(
      /\.chip-strip\[data-overflow="start"\]\{[^}]*mask-image:linear-gradient\(90deg,transparent,#000 1\.4rem\)/,
    );
    expect(css).toMatch(
      /\.chip-strip\[data-overflow="end"\]\{[^}]*mask-image:linear-gradient\(90deg,#000 calc\(100% - 1\.4rem\),transparent\)/,
    );
    expect(css).toMatch(/\.chip-strip\[data-overflow="both"\]\{[^}]*mask-image:/u);
    // the current chip's ring is a box-shadow, which draws outside the border
    // box and is clipped on all four sides by the scroller it sits in
    expect(strip).toContain("padding:2px");
  });

  it("should give a chip the colour of the control that set it", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.decision))));
    const status = (name: string): string =>
      new RegExp(`\\.q-chip\\[data-status="${name}"\\]\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    const verdict = (name: string): string =>
      new RegExp(
        `\\.verdict\\[data-verdict="${name}"\\]\\[aria-pressed="true"\\]\\{([^}]*)\\}`,
      ).exec(css)?.[1] ?? "";

    // approving is agreeing with the board and changing is overriding it, and
    // the strip has to say the same thing the card does. Confirmed and answered
    // were the wrong way round, so an approved decision showed a green button
    // over an accent chip, and a changed one an accent button under an amber
    expect(status("confirmed")).toContain("background:var(--ui-positive-soft)");
    expect(status("changed")).toContain("background:var(--ui-amber-soft)");
    expect(status("answered")).toContain("background:var(--ui-accent-soft)");
    expect(verdict("approve")).toContain("background:var(--ui-positive-soft)");
    expect(verdict("change")).toContain("background:var(--ui-amber-soft)");
    // the two nobody has settled stay empty: a dashed edge says so in a way a
    // pale fill does not
    expect(status("suggested")).not.toContain("background:");
    expect(status("unanswered")).not.toContain("background:");
  });

  it("should colour a marked option by whether it follows the recommendation", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.checklist))));
    const scope = '.question:has(input[type="radio"][data-recommended]) ';
    const against = `${scope}.choice:has(input[type="radio"]:checked)`;
    const with_ = `${scope}.choice:has(input[type="radio"][data-recommended]:checked)`;

    expect(css).toContain(`${against}{border-color:var(--ui-amber)`);
    expect(css).toContain(`${with_}{border-color:var(--ui-positive)`);
    // :has() takes its argument's specificity, so the narrower-looking rule is
    // not the more specific one: green only wins because it sits under the same
    // .question:has(...) scope the amber rule does and adds one class to it
    expect(css.indexOf(with_)).toBeGreaterThan(css.indexOf(against));
    // a checklist reuses .choice with checkboxes and can never match a
    // recommendation, so neither rule may reach it
    expect(css).toContain(".choice:has(input:checked){border-color:var(--ui-accent)");
  });

  it("should give every option tag its own colour", () => {
    const css = stylesheet(render(page(withBlocks(NEW_BLOCKS.checklist))));

    // three of the six shared the accent and two more the amber, so a badge
    // said a tag was present without saying which one
    for (const tag of CHOICE_TAGS) {
      const slug = tag.toLowerCase();
      expect(css).toContain(
        `.badge[data-tag="${tag}"]{border-color:var(--tag-${slug}); background:var(--tag-${slug}-soft); color:var(--tag-${slug}-ink)}`,
      );
    }
    // the vocabulary is closed and refused at build time, so the bare rule is
    // reached by nothing; a word the page cannot colour is not endorsed either
    expect(css).toMatch(/\.badge\{[^}]*border:1px solid var\(--ui-border-strong\)/);
    // six triples, and the six base tones are six different colours
    const tones = CHOICE_TAGS.map(
      (tag) =>
        new RegExp(`--tag-${tag.toLowerCase()}:([^;]+);`).exec(css)?.[1] ?? tag,
    );
    expect(new Set(tones).size).toBe(CHOICE_TAGS.length);
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
          NEW_BLOCKS.decision,
          NEW_BLOCKS.steps,
          NEW_BLOCKS.findings,
          { type: "note", id: "constraint", ref: "Q25", label: "Constraint", ask: "A" },
        ],
      },
    ],
    reply: { heading: "Generated reply", template: "Answers:\n{{answers}}" },
  });

  it("should count and pre-render every new question kind in the reply", () => {
    const html = render(questions);

    // SC-5 sink 1 and 4: the reply's {{answers}} and the collapsed bar's
    // unanswered count both see all four questions and neither of the two
    // non-interactive blocks
    expect(html).toContain(">4 unanswered<");
    // a question the page recommends an answer to names the suggestion it is
    // still waiting on; one it recommends nothing about is plainly unanswered.
    // Neither may be absent, and neither may read as settled
    for (const label of [
      "Launch controls",
      "Rollout plan",
      "Containment confidence",
      "Constraint",
    ])
      expect(html).toMatch(
        // the citation code precedes every label, so a recipient reading the
        // reply can name the question the same way the board draws it
        new RegExp(`- \\*\\*[A-Za-z0-9-]+ · ${label}:\\*\\* (unanswered|recommended [^<]*; not yet confirmed)`),
      );
    // nothing on a freshly rendered page has been marked, so no group that
    // would claim otherwise may appear
    for (const settled of ["### Confirmed", "### Changed", "### Answered"])
      expect(html).not.toContain(settled);
    expect(html).not.toContain("- Bind authorization");
    expect(html).not.toContain("- Authorization race");
  });

  it("should carry the attributes the runtime reads on every question kind", () => {
    const html = render(questions);
    const fields = [...html.matchAll(/<(?:fieldset|div) class="question"[^>]*>/g)]
      .map((field) => field[0]);

    // SC-5 sinks 2 and 3: the drawer's itemised summaries and the
    // data-answered state on each row are built from these attributes alone,
    // so every question kind must carry all three
    expect(fields).toHaveLength(4);
    for (const field of fields) {
      expect(field).toMatch(/data-question\b/);
      expect(field).toMatch(
        /data-question-kind="(?:choice|note|checklist|scale|decision)"/,
      );
      expect(field).toMatch(/data-question-label="[^"]+"/);
    }
    expect(fields.map((field) => /data-question-kind="(\w+)"/.exec(field)?.[1]))
      .toStrictEqual(["checklist", "scale", "decision", "note"]);
  });

  it("should refuse a duplicate id across a checklist and a scale", () => {
    // the new kinds join the same page-wide id namespace as choice and note
    expect(() =>
      render(
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
      { type: "checklist", id: undefined, ref: "Q26", label: "L", ask: "A", options: [{ value: "v" }] },
      "sections[0].blocks[0].id: required non-empty string, received undefined",
    ],
    [
      "checklist.label",
      { type: "checklist", id: "c", ref: "Q27", label: 3, ask: "A", options: [{ value: "v" }] },
      "sections[0].blocks[0].label: required non-empty string, received 3",
    ],
    [
      "checklist.ask",
      { type: "checklist", id: "c", ref: "Q28", label: "L", ask: "", options: [{ value: "v" }] },
      'sections[0].blocks[0].ask: required non-empty string, received ""',
    ],
    [
      "checklist.options",
      { type: "checklist", id: "c", ref: "Q29", label: "L", ask: "A", options: [] },
      "sections[0].blocks[0].options: required non-empty array, received []",
    ],
    [
      "checklist.options[i].value",
      { type: "checklist", id: "c", ref: "Q30", label: "L", ask: "A", options: [{ value: 0 }] },
      "sections[0].blocks[0].options[0].value: required non-empty string, received 0",
    ],
    [
      "checklist.options[i].summary",
      { type: "checklist", id: "c", ref: "Q31", label: "L", ask: "A", options: [{ value: "v", summary: 9 }] },
      "sections[0].blocks[0].options[0].summary: required non-empty string, received 9",
    ],
    [
      "scale.id",
      { type: "scale", id: 4, ref: "Q32", label: "L", ask: "A", points: [{ value: "v" }] },
      "sections[0].blocks[0].id: required non-empty string, received 4",
    ],
    [
      "scale.label",
      { type: "scale", id: "s2", ref: "Q33", label: null, ask: "A", points: [{ value: "v" }] },
      "sections[0].blocks[0].label: required non-empty string, received null",
    ],
    [
      "scale.ask",
      { type: "scale", id: "s2", ref: "Q34", label: "L", ask: undefined, points: [{ value: "v" }] },
      "sections[0].blocks[0].ask: required non-empty string, received undefined",
    ],
    [
      "scale.points",
      { type: "scale", id: "s2", ref: "Q35", label: "L", ask: "A", points: [] },
      "sections[0].blocks[0].points: required non-empty array, received []",
    ],
    [
      "scale.points[i].value",
      { type: "scale", id: "s2", ref: "Q36", label: "L", ask: "A", points: [{ value: {} }] },
      "sections[0].blocks[0].points[0].value: required non-empty string, received {}",
    ],
    [
      "scale.points[i].label",
      { type: "scale", id: "s2", ref: "Q37", label: "L", ask: "A", points: [{ value: "v", label: 7 }] },
      "sections[0].blocks[0].points[0].label: required non-empty string, received 7",
    ],
    [
      "decision.id",
      { type: "decision", id: "", ref: "Q38", label: "L", ask: "A" },
      'sections[0].blocks[0].id: required non-empty string, received ""',
    ],
    [
      "decision.label",
      { type: "decision", id: "d", ref: "Q39", label: [], ask: "A" },
      "sections[0].blocks[0].label: required non-empty string, received []",
    ],
    [
      "decision.ask",
      { type: "decision", id: "d", ref: "Q40", label: "L", ask: 6 },
      "sections[0].blocks[0].ask: required non-empty string, received 6",
    ],
    [
      "decision.placeholder",
      { type: "decision", id: "d", ref: "Q41", label: "L", ask: "A", placeholder: 1 },
      "sections[0].blocks[0].placeholder: required non-empty string, received 1",
    ],
  ])("should refuse a bad %s naming its path", (_field, block, message) => {
    expect(() => render(page(withBlocks(block as never)))).toThrow(
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
    const html = render(data);
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
    // each question reaches the reply under the exact code its JSON declares,
    // which is what makes the code worth citing back at the board
    for (const question of questions)
      expect(html).toMatch(
        new RegExp(
          `- \\*\\*${question.ref} · ${question.label}:\\*\\* (unanswered|recommended [^<]*; not yet confirmed)`,
        ),
      );
    // no id may repeat, or one answer would overwrite another silently
    const ids = [...html.matchAll(/data-question-id="([^"]+)"/g)].map((id) => id[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // and no code may repeat, or a citation would name two questions at once
    const refs = [...html.matchAll(/data-question-ref="([^"]+)"/g)].map((ref) => ref[1]);
    expect(refs).toHaveLength(questions.length);
    expect(new Set(refs).size).toBe(refs.length);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it("should render the risk-context-report example under severity encoding", async () => {
    const html = render(await loadKind("risk-context-report"));

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
        `<li class="finding" data-severity="${severity}" data-filter-item="${severity}"><p class="finding-head"><span class="finding-severity">${word}</span>`,
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

describe("fn:renderPage theming", () => {
  it("should let a board carry its own palette in both schemes", () => {
    const html = render(
      page({ theme: { accent: 265, dark: { "--ui-canvas": "#05040a" } } }),
    );

    expect(html).toContain("--ui-accent:oklch(.672 .131 265)");
    expect(html).toContain("--ui-accent:oklch(.75 .14 265)");
    expect(html).toContain("--ui-canvas:#05040a");
  });

  it("should leave an unthemed board on the built-in palette alone", () => {
    // an override sheet that appears when nothing was overridden would make
    // every board's cascade harder to read for no gain
    expect(render(page())).not.toContain("oklch(.672");
  });

  it("should refuse a bad theme by its JSON path, like every other field", () => {
    expect(() => render(page({ theme: { accent: 400 } as never }))).toThrow(
      "theme.accent: required number between 0 and 360",
    );
  });

  it("should offer the reader a scheme control in the collapsed bar", () => {
    const html = render(page());
    const bar = html.slice(
      html.indexOf('<div class="drawer-bar"'),
      html.indexOf('<div class="drawer-panel"'),
    );
    const toggle = bar.slice(bar.indexOf('class="drawer-toggle"'), bar.indexOf("</button>"));

    // the accessible name is one string with no separator inserted for it,
    // so the punctuation between label and state has to be authored or the
    // control announces as "Colour schemeAuto"
    expect(bar).toContain(
      '<span class="sr-only">Colour scheme: <span data-scheme-state>Auto</span></span>',
    );
    // an icon-only button says nothing to a screen reader, so the state is
    // real text in the markup rather than a glyph or a generated string
    expect(bar).toMatch(/aria-hidden="true"[^>]*>/);
    expect(bar).not.toContain("aria-label");
    // a control nested inside the drawer's own control would be unreachable
    // by keyboard without first opening the drawer
    expect(toggle).not.toContain("data-scheme-toggle");
  });

  it("should offer copy from the collapsed bar, between count and scheme", async () => {
    const html = render(await loadExample());
    const bar = html.slice(
      html.indexOf('<div class="drawer-bar"'),
      html.indexOf('<div class="drawer-panel"'),
    );
    const order = ["data-unanswered-count", "data-copy", "data-scheme-toggle"];

    // reading order is the tab order here, and the reader asked for copy to
    // sit between the count and the scheme control
    expect(order.map((mark) => bar.indexOf(mark))).toStrictEqual(
      [...order.map((mark) => bar.indexOf(mark))].sort((a, b) => a - b),
    );
    for (const mark of order) expect(bar).toContain(mark);

    // the bar toggles the drawer on a bare click, so a control inside it that
    // is not a button would open the drawer every time it was pressed
    expect(bar).toContain('<button type="button" class="copy" data-copy>');
  });

  it("should copy from a glyph, and say the outcome in words", async () => {
    const html = render(await loadExample());
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const bar = html.slice(
      html.indexOf('<div class="drawer-bar"'),
      html.indexOf('<div class="drawer-panel"'),
    );

    // a glyph says nothing to a screen reader, so the name is real text
    expect(bar).toContain('<span class="sr-only">Copy reply</span>');
    for (const icon of ["copy", "done"]) expect(bar).toContain(`data-icon="${icon}"`);
    expect(css).toContain(".copy .copy-icon{display:none}");

    // a tick cannot say "press the keys yourself", which is what the control
    // has to say wherever the clipboard API is missing
    expect(bar).toContain('<span class="copy-state" data-copy-status role="status">');

    // SC 2.5.8 — the target has to clear 24px once the label is gone
    expect(css).toMatch(/\.copy\{[^}]*min-height:2\.2rem/);
  });

  it("should put the reply in a dialog that is open until scripts close it", async () => {
    const data = await loadExample();
    const html = render(data);
    const markup = markupOf(html);
    const dialog = markup.slice(
      markup.indexOf('<dialog class="reply-dialog"'),
      markup.indexOf("</dialog>", markup.indexOf('<dialog class="reply-dialog"')),
    );

    // a closed dialog is display:none, so a page whose scripts never arrive
    // would carry a reply nobody could read. It ships open and the runtime
    // closes it, which is the only order that serves both readers.
    expect(markup).toContain("<dialog class=\"reply-dialog\" data-reply-dialog open");
    expect(dialog).toContain('<pre class="reply" data-reply');
    // exactly one reply on the page: two would drift the moment one repainted
    expect(markup.match(/data-reply[ =>]/g)).toHaveLength(1);

    // and the control that opens it ships hidden, because without a runtime
    // there is no modal to open
    expect(markup).toContain(
      '<button type="button" class="reply-show" data-reply-open hidden>',
    );
  });

  it("should close the reply dialog without scripting, or not offer to", async () => {
    const html = render(await loadExample());
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const markup = markupOf(html);

    // method="dialog" is what closes it with no runtime at all
    expect(markup).toContain('<form method="dialog" class="reply-head">');
    // ...and the control is not shown at all while the dialog is a panel,
    // where closing it would hide the reply with no way back
    expect(css).toContain(".reply-dialog:not(:modal) .reply-close{display:none}");
    // the panel state has to shed the user agent's absolute positioning, or
    // it floats over whatever it lands on
    expect(css).toMatch(/\.reply-dialog\{[^}]*position:static/);
  });

  it("should carry all three scheme icons and show exactly one", () => {
    const html = render(page());
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";

    // all three ship, so the glyph is right at first paint rather than after
    // the runtime has run — and so a reader without scripts sees a real button
    for (const icon of ["auto", "light", "dark"])
      expect(markupOf(html)).toContain(`data-icon="${icon}"`);

    // the button carries its own state, which is what picks the glyph
    expect(markupOf(html)).toContain('data-scheme-toggle data-scheme="auto"');
    expect(css).toContain(".scheme .scheme-icon{display:none}");
    expect(css).toContain('.scheme[data-scheme="auto"] [data-icon="auto"]');

    // SC 2.5.8 — the target has to clear 24px, and the icon does not carry it
    expect(css).toMatch(/\.scheme\{[^}]*width:2\.2rem/);
    // the bar wraps rather than clips, but a shrinkable target could still be
    // squeezed under the 24px floor on the narrowest screens
    expect(css).toMatch(/\.scheme\{[^}]*flex:none/);
  });

  it("should honour a manual choice over the system's, in either direction", () => {
    const html = render(page());

    // the built-in dark palette has to be reachable by choice, and the system
    // rule has to step aside for a reader who chose light on a dark machine
    expect(html).toContain(':root[data-theme="dark"]{');
    expect(html).toContain(
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){',
    );
    expect(html).toContain(':root[data-theme="light"]{color-scheme:light}');
  });

  it("should apply the saved scheme before the body is ever painted", () => {
    const html = render(page());
    const boot = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

    // in the head, ahead of the body: applying it any later shows the reader
    // the system's colours first and then replaces them
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("<body"));
    expect(boot).toContain("data-theme");
    expect(boot).not.toContain("installDrawer");
  });
});

describe("fn:renderPage rich text", () => {
  it("should accept runs wherever a rich-text value is read", () => {
    const runs = [
      "budget is ",
      { kind: "provenance", text: "4.2 ms p99", level: "measured" },
      " per ",
      { kind: "code", text: "sync()" },
    ];
    const html = render(
      page({
        sections: [
          {
            id: "s",
            label: "S",
            title: "T",
            blocks: [
              { type: "prose", text: runs },
              { type: "callout", title: "C", text: runs },
              {
                type: "table",
                columns: ["Option"],
                rows: [[{ text: runs }]],
              },
            ],
          },
        ],
      } as never),
    );

    // read the markup alone: the inlined stylesheet carries its own
    // data-provenance selectors and would inflate every count here
    const markup = markupOf(html);

    expect(markup.match(/data-provenance="measured"/g)).toHaveLength(3);
    expect(markup.match(/<code class="mono">sync\(\)<\/code>/g)).toHaveLength(3);
  });

  it("should name the block and the run when a run is wrong", () => {
    // the path is what makes a bad run findable in a long data file
    expect(() =>
      render(
        page({
          sections: [
            {
              id: "s",
              label: "S",
              title: "T",
              blocks: [{ type: "prose", text: ["a", { kind: "bold", text: "b" }] }],
            },
          ],
        } as never),
      ),
    ).toThrow("sections[0].blocks[0].text[1].kind: required one of");
  });
});

describe("fn:renderPage Mermaid runtime", () => {
  /** builds a board whose only graph sits behind a disclosure. */
  function nested(): PageData {
    return page({
      sections: [
        {
          id: "s",
          label: "S",
          title: "T",
          blocks: [
            {
              type: "disclosure",
              summary: "Working",
              blocks: [
                { type: "mermaid", source: "graph TD; a-->b;", alt: "a to b" },
              ],
            },
          ],
        },
      ],
    });
  }

  it("should carry the runtime for a graph behind a disclosure", () => {
    const html = renderPage(nested(), { ...assets, mermaid: "/* drawn */" });

    expect(html).toContain("/* drawn */");
    expect(html).toContain("data-mermaid");
  });

  it("should refuse a graph behind a disclosure when given no runtime", () => {
    expect(() => render(nested())).toThrow(
      /draws with Mermaid but was given no Mermaid runtime/,
    );
  });

  it("should carry no runtime for a board that draws no graph", () => {
    const html = renderPage(
      page({
        sections: [
          {
            id: "s",
            label: "S",
            title: "T",
            blocks: [
              {
                type: "disclosure",
                summary: "Working",
                blocks: [{ type: "prose", text: "no graph here" }],
              },
            ],
          },
        ],
      }),
      { ...assets, mermaid: "/* drawn */" },
    );

    expect(html).not.toContain("/* drawn */");
  });
});

describe("fn:renderPage malformed blocks", () => {
  /** builds a board whose blocks, at one level or the other, are not a list. */
  function broken(where: "section" | "disclosure"): PageData {
    const inner = "not-an-array" as unknown as PageData["sections"][number]["blocks"];

    return page({
      sections: [
        {
          id: "s",
          label: "S",
          title: "T",
          blocks:
            where === "section"
              ? inner
              : [{ type: "disclosure", summary: "Working", blocks: inner }],
        },
      ],
    });
  }

  // the walk that decides which files to read and whether to carry the graph
  // runtime runs before any of this is validated, so a shape the renderer
  // refuses by name must not crash that walk first: it did, with a TypeError
  // naming a function body rather than the board
  it.each([
    ["a section", "section", "sections[0].blocks"],
    ["a disclosure", "disclosure", "sections[0].blocks[0].blocks"],
  ])("should name the path when %s holds blocks that are not a list", (_, where, at) => {
    expect(() => render(broken(where as "section" | "disclosure"))).toThrow(
      new RegExp(`${at.replace(/[[\]]/g, "\\$&")}: required (?:non-empty )?array`),
    );
  });
});
