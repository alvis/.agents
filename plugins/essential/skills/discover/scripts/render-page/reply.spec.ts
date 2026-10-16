import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { questionsOf, renderReply, replyTemplate } from "./reply.ts";

import type { PageData, Section } from "./types.ts";

/**
 * builds the smallest page whose reply can be filled
 * @param template the reply body under test
 * @param extra the sections and sources the page carries
 * @returns the page data
 */
function page(template: string, extra: Partial<PageData> = {}): PageData {
  return {
    reply: { heading: "Reply", template },
    sections: [],
    ...extra,
  } as PageData;
}

describe("fn:replyTemplate", () => {
  it("should fill provenance and caveats but leave answers for the runtime", () => {
    // the runtime refills {{answers}} on every keystroke; leaving the other
    // markers filled here is what keeps it from re-deriving them each time
    const filled = replyTemplate(
      page("{{answers}}\n{{provenance}}", {
        sources: [{ label: "Load test", level: "measured" }],
      }),
    );

    expect(filled).toBe("{{answers}}\n- measured: Load test");
  });

  it("should sweep sections and sources together, sections first", () => {
    const filled = replyTemplate(
      page("{{provenance}}", {
        sections: [
          {
            id: "s",
            title: "T",
            blocks: [
              {
                type: "prose",
                text: [{ kind: "provenance", level: "assumed", text: "in-section" }],
              },
            ],
          },
        ],
        sources: [{ label: "in-footer", level: "assumed" }],
      }),
    );

    expect(filled).toBe("- assumed: in-section\n- assumed: in-footer");
  });

  it("should caution when a page rests on an invented figure", () => {
    expect(
      replyTemplate(
        page("{{caveats}}", { sources: [{ label: "Seat count", level: "invented" }] }),
      ),
    ).toBe(
      "> Caution: 1 figure is invented, standing in for evidence nobody has yet: Seat count.",
    );
  });

  it("should leave the caveat empty when nothing was invented", () => {
    expect(replyTemplate(page("{{caveats}}"))).toBe("");
  });

  it("should refuse a template that is not a string", () => {
    expect(() => replyTemplate(page(undefined as never))).toThrow(
      new RenderError("reply.template: required non-empty string, received undefined"),
    );
  });
});

describe("fn:renderReply", () => {
  it("should open with every question unanswered", () => {
    const drawn = renderReply(
      page("{{answers}}", {
        sections: [
          {
            id: "s",
            title: "T",
            blocks: [
              { type: "note", id: "q1", ref: "Q1", label: "Owner", ask: "Who?" },
              { type: "note", id: "q2", ref: "Q2", label: "Date", ask: "When?" },
            ],
          },
        ],
      }),
    );

    expect(drawn).toBe(
      [
        "## Decisions",
        "",
        "### Not yet marked",
        "- **Q1 · Owner:** unanswered",
        "- **Q2 · Date:** unanswered",
      ].join("\n"),
    );
  });

  it("should open a defaulted follow-up at its default, in the board's own words", () => {
    // the pre-fill is what a reader with scripting off copies; it has to read
    // exactly as the runtime's first paint does
    const drawn = renderReply(
      page("{{answers}}", {
        sections: [
          {
            id: "s",
            title: "T",
            blocks: [
              {
                type: "decision",
                response: "follow-up",
                id: "adr-1-more",
                ref: "ADR-1",
                label: "Plugin resolution",
                ask: "Want this explained further?",
                default: "approve",
                labels: { approve: "I'm good with it", change: "Tell me more about it" },
              },
            ],
          },
        ],
      }),
    );

    expect(drawn).toBe(
      [
        "## Follow-ups",
        "",
        "### Not requested",
        "- **ADR-1 · Plugin resolution:** I'm good with it (default)",
      ].join("\n"),
    );
  });

  it("should carry the caveat a reader without JavaScript would otherwise miss", () => {
    // the pre-fill is the whole reply for a reader with scripting off, so an
    // invented figure has to be flagged here and not only by the runtime
    expect(
      renderReply(
        page("{{caveats}}\n{{answers}}", {
          sources: [{ label: "Churn", level: "invented" }],
        }),
      ),
    ).toContain("> Caution: 1 figure is invented");
  });
});

describe("fn:questionsOf", () => {
  it("should find a question at any depth, after the blocks that precede its container", () => {
    // the runtime reads the page's `[data-question]` fields in document order,
    // and a container draws its blocks where it sits, so a held question comes
    // after everything before its container and before everything after it,
    // across sections too
    const sections: Section[] = [
      {
        id: "a",
        label: "A",
        title: "A",
        blocks: [
          { type: "note", id: "first", ref: "Q1", label: "First", ask: "?" },
          {
            type: "disclosure",
            summary: "Working",
            blocks: [
              { type: "decision", id: "held", ref: "Q2", label: "Held", ask: "?" },
              {
                type: "disclosure",
                summary: "Deeper",
                blocks: [{ type: "note", id: "deep", ref: "Q3", label: "Deep", ask: "?" }],
              },
            ],
          },
          { type: "note", id: "last", ref: "Q4", label: "Last", ask: "?" },
        ],
      },
      {
        id: "b",
        label: "B",
        title: "B",
        blocks: [{ type: "note", id: "next", ref: "Q5", label: "Next", ask: "?" }],
      },
    ];

    expect(questionsOf(sections).map((question) => question.id)).toEqual([
      "first",
      "held",
      "deep",
      "last",
      "next",
    ]);
  });
});
