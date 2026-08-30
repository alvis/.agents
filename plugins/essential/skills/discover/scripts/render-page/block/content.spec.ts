import { describe, expect, it } from "vitest";

import { renderBlock } from "../block.ts";
import { RenderError } from "../error.ts";

import { emptyContext } from "../context.ts";

import type { Block } from "../types.ts";

/**
 * renders one block at a fixed path, with a fresh id ledger each time
 * @param block the block to render
 * @returns the rendered HTML
 */
function html(block: unknown): string {
  return renderBlock(block as Block, "b", emptyContext());
}

describe("fn:renderBlock list", () => {
  it("should draw a bulleted list by default and bold each lead", () => {
    const drawn = html({
      type: "list",
      items: [{ lead: "One thing.", text: "Then the argument." }, { text: "Bare." }],
    });

    expect(drawn).toContain('<ul class="list">');
    // the lead is the claim, so it is <strong> rather than a class: emphasis
    // that survives being copied out of the page
    expect(drawn).toContain("<li><strong>One thing.</strong> Then the argument.</li>");
    expect(drawn).toContain("<li>Bare.</li>");
  });

  it("should draw an ordered list as ol, not a restyled ul", () => {
    // the numbering is what a reader cites back, so it has to be the element's
    // own and survive copy and paste
    expect(html({ type: "list", ordered: true, items: [{ text: "First" }] })).toContain(
      '<ol class="list">',
    );
  });

  it("should escape a lead and refuse an empty list naming its path", () => {
    expect(html({ type: "list", items: [{ lead: "<b>x</b>", text: "y" }] })).toContain(
      "<strong>&lt;b&gt;x&lt;/b&gt;</strong>",
    );
    expect(() => html({ type: "list", items: [] })).toThrow(
      new RenderError("b.items: required non-empty array, received []"),
    );
  });
});

describe("fn:renderBlock tldr", () => {
  it("should default its heading and carry strong-lead bullets", () => {
    const drawn = html({ type: "tldr", points: [{ lead: "Not a launch.", text: "One race." }] });

    expect(drawn).toContain('<aside class="tldr"><h3>In short</h3>');
    expect(drawn).toContain("<strong>Not a launch.</strong> One race.");
  });

  it("should use the author's heading when given", () => {
    expect(html({ type: "tldr", title: "Executive summary", points: [{ text: "x" }] })).toContain(
      "<h3>Executive summary</h3>",
    );
  });
});

describe("fn:renderBlock code", () => {
  it("should escape the excerpt rather than pass any markup through", () => {
    const drawn = html({
      type: "code",
      language: "html",
      code: '<script>alert("x")</script>',
    });

    // the excerpt is sliced on raw offsets and each slice escaped as it is
    // written, so every span the builder emits wraps text that is already
    // escaped and no author byte reaches the page as markup
    expect(drawn).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(drawn).not.toContain("<script>");
  });

  it("should name its language and pair a caption with the excerpt", () => {
    const bare = html({ type: "code", language: "ts", code: "x" });
    const captioned = html({
      type: "code",
      language: "ts",
      code: "x",
      caption: "From replay.ts",
    });

    expect(bare).toContain('data-language="ts"');
    expect(bare).not.toContain("<figure");
    // a figure, so the caption is associated with the excerpt rather than
    // floating above it as a paragraph that happens to sit nearby
    expect(captioned).toContain('<figure class="code-figure">');
    expect(captioned).toContain("<figcaption>From replay.ts</figcaption>");
  });
});

describe("fn:renderBlock faq and glossary", () => {
  it("should let an answer carry provenance, which is the point of the block", () => {
    const drawn = html({
      type: "faq",
      items: [
        {
          term: "Can three versions overlap?",
          detail: [
            "Yes — every build reads both shapes. ",
            { kind: "provenance", text: "rolling deploy", level: "measured" },
          ],
        },
      ],
    });

    expect(drawn).toContain('<dl class="faq">');
    expect(drawn).toContain("<dt>Can three versions overlap?</dt>");
    expect(drawn).toContain('data-provenance="measured"');
  });

  it("should draw a glossary from the same shape under its own class", () => {
    const drawn = html({ type: "glossary", entries: [{ term: "Cursor", detail: "A position." }] });

    expect(drawn).toContain('<dl class="glossary">');
    // the entry lights whenever a sentence names the term, so it carries the
    // same derived key the inline run does
    expect(drawn).toContain(
      '<dt data-sync="term:cursor">Cursor</dt><dd>A position.</dd>',
    );
  });

  it("should refuse a missing term naming its path", () => {
    expect(() => html({ type: "glossary", entries: [{ detail: "x" }] })).toThrow(
      new RenderError("b.entries[0].term: required non-empty string, received undefined"),
    );
  });
});

describe("fn:renderBlock readiness", () => {
  it("should state the reading in text as well as drawing the bar", () => {
    const drawn = html({ type: "readiness", items: [{ label: "ready", value: 3, of: 5 }] });

    // a bar alone reports a ratio nobody can read back, and a tooltip reaches
    // neither touch nor a screen reader
    expect(drawn).toContain('<span class="meter-value">3/5</span>');
    expect(drawn).toContain('aria-label="3 of 5"');
    expect(drawn).toContain("--fill:60%");
  });

  it("should refuse a reading outside its own scale naming its path", () => {
    // 6/5 drawn as a full bar would quietly report a perfect score
    expect(() => html({ type: "readiness", items: [{ label: "r", value: 6, of: 5 }] })).toThrow(
      new RenderError("b.items[0].value: required a number between 0 and 5, received 6"),
    );
  });

  it("should refuse a fractional reading naming its path", () => {
    expect(() => html({ type: "readiness", items: [{ label: "r", value: 1.5, of: 5 }] })).toThrow(
      new RenderError("b.items[0].value: required a whole number, received 1.5"),
    );
  });
});

describe("fn:renderBlock owners", () => {
  it("should derive initials and hide the glyph from the reader who hears it", () => {
    const drawn = html({ type: "owners", people: [{ name: "Rina Solberg", due: "Jul 28" }] });

    // read aloud, "R S Rina Solberg" is the same person announced twice
    expect(drawn).toContain('<span class="owner-initials" aria-hidden="true">RS</span>');
    expect(drawn).toContain('<span class="owner-name">Rina Solberg</span>');
    expect(drawn).toContain("due Jul 28");
  });

  it("should prefer author-given initials and join role with due", () => {
    const drawn = html({
      type: "owners",
      people: [{ name: "Platform", initials: "PF", role: "owns rollout", due: "Q3" }],
    });

    expect(drawn).toContain(">PF</span>");
    expect(drawn).toContain("owns rollout · due Q3");
  });
});

describe("fn:renderBlock risk-matrix", () => {
  it("should spell the rating out, not leave it to the pill colour", () => {
    const drawn = html({
      type: "risk-matrix",
      caption: "Review assessments, not measured rates.",
      rows: [
        { risk: "Refresh race", severity: "critical", likelihood: "Likely", mitigation: "Serialize" },
      ],
    });

    expect(drawn).toContain('<span class="severity-pill" data-severity="critical">Critical</span>');
    // <caption> rather than a paragraph, so it is announced with the table
    expect(drawn).toContain("<caption>Review assessments, not measured rates.</caption>");
  });

  it("should refuse a rating outside the vocabulary naming its path", () => {
    expect(() =>
      html({
        type: "risk-matrix",
        rows: [{ risk: "r", severity: "spicy", likelihood: "l", mitigation: "m" }],
      }),
    ).toThrow(
      new RenderError(
        'b.rows[0].severity: required one of "critical", "high", "medium", "low", received "spicy"',
      ),
    );
  });
});

describe("fn:renderBlock failure-map", () => {
  it("should draw all three stages, each labelled in words", () => {
    const drawn = html({
      type: "failure-map",
      failure: "Replay drops an event",
      prevent: ["Contiguous commit"],
      detect: ["Gap alarm"],
      contain: ["Replay from cursor"],
    });

    for (const stage of ["prevent", "detect", "contain"])
      expect(drawn).toContain(`data-stage="${stage}"`);
    expect(drawn).toContain("<h4>Prevent</h4>");
    expect(drawn).toContain('<p class="failure-head">Replay drops an event</p>');
  });

  it("should refuse an empty stage rather than draw a silent claim", () => {
    // an empty detect column reads as "nothing detects this", which is a claim
    // the author did not make
    expect(() =>
      html({ type: "failure-map", failure: "f", prevent: ["a"], detect: [], contain: ["c"] }),
    ).toThrow(new RenderError("b.detect: required non-empty array, received []"));
  });
});

describe("fn:renderBlock timeline", () => {
  it("should spell each state out beside the dot", () => {
    const drawn = html({
      type: "timeline",
      items: [
        { when: "Wk0", title: "Discovery", state: "done", tags: ["shipped"] },
        { when: "Wk1", title: "Ownership trace" },
      ],
    });

    // a rail read in greyscale otherwise reports every moment as the same one
    expect(drawn).toContain('<span class="moment-state">Done</span>');
    expect(drawn).toContain('data-state="done"');
    expect(drawn).toContain("<span>shipped</span>");
    // a moment with no state carries no attribute rather than a default one
    expect(drawn).toContain("<li><span class=\"moment-when\">Wk1</span>");
  });
});

describe("fn:renderBlock kanban", () => {
  it("should draw each lane with its count, including an empty one", () => {
    const drawn = html({
      type: "kanban",
      lanes: [
        { label: "Now", cards: ["Ship the fix", "Trace ownership"] },
        { label: "Cut", cards: [] },
      ],
    });

    expect(drawn).toContain('Now <span class="kanban-count">2</span>');
    // "nothing is parked" reads differently from a lane the reader assumes
    // was cut off, so the count is drawn even at zero
    expect(drawn).toContain('Cut <span class="kanban-count">0</span>');
    expect(drawn).toContain('<li class="kanban-card">Ship the fix</li>');
  });
});

describe("fn:renderBlock callout", () => {
  it("should announce its tone in words as well as in colour", () => {
    const drawn = html({ type: "callout", tone: "bad", title: "Watch the race", text: "It bites." });

    // a callout whose only difference from the one above it is a border hue
    // says nothing in greyscale, and nothing at all to a screen reader
    expect(drawn).toContain('<span class="callout-tone">Watch out</span>');
    expect(drawn).toContain('data-tone="bad"');
  });

  it("should bold the lead clause and keep a toneless callout unmarked", () => {
    const led = html({ type: "callout", title: "T", lead: "The claim.", text: "The argument." });
    const plain = html({ type: "callout", title: "T", text: "x" });

    expect(led).toContain("<strong>The claim.</strong> The argument.");
    expect(plain).not.toContain("data-tone");
    expect(plain).not.toContain("callout-tone");
  });

  it("should refuse a tone outside the vocabulary naming its path", () => {
    expect(() => html({ type: "callout", tone: "smug", title: "T", text: "x" })).toThrow(
      new RenderError('b.tone: required one of "neutral", "good", "bad", received "smug"'),
    );
  });
});

describe("fn:renderBlock table columns", () => {
  it("should keep a bare string column valid and emit no colgroup for it", () => {
    const drawn = html({ type: "table", columns: ["A", "B"], rows: [[{ text: "1" }, { text: "2" }]] });

    expect(drawn).toContain('<th scope="col">A</th>');
    expect(drawn).not.toContain("<colgroup>");
  });

  it("should carry width and alignment on a colgroup, not on every cell", () => {
    const drawn = html({
      type: "table",
      columns: ["Claim", { label: "Evidence", width: "30%", align: "right" }],
      rows: [[{ text: "1" }, { text: "2" }]],
    });

    // one declaration covers every row, so a wide evidence column stays wide
    // as the table grows
    expect(drawn).toContain('<colgroup><col><col style="width:30%;text-align:right"></colgroup>');
    expect(drawn).toContain('<th scope="col">Evidence</th>');
  });

  it("should read a column width as a CSS value, not merely escape it", () => {
    // E-113 — a width lands inside a `style` attribute, so escaping made it a
    // safe attribute and said nothing about the declaration within it: this
    // width emitted a live remote fetch out of a page that promises none
    expect(() =>
      html({
        type: "table",
        columns: [
          "Claim",
          { label: "Evidence", width: "1px;background-image:url(https://evil.example/p.png)" },
        ],
        rows: [[{ text: "1" }, { text: "2" }]],
      }),
    ).toThrow(
      'b.columns[1].width: ";" is not part of a colour, length, keyword, or permitted function',
    );
  });

  it("should name both accepted column shapes when refusing", () => {
    expect(() => html({ type: "table", columns: ["A", 2], rows: [] })).toThrow(
      new RenderError("b.columns[1]: required a non-empty string or a column object, received 2"),
    );
  });

  it("should refuse an alignment outside the vocabulary naming its path", () => {
    expect(() =>
      html({ type: "table", columns: [{ label: "A", align: "justify" }], rows: [] }),
    ).toThrow(
      new RenderError('b.columns[0].align: required one of "left", "center", "right", received "justify"'),
    );
  });
});
