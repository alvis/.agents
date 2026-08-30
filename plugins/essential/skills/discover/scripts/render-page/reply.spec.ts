import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { renderReply, replyTemplate } from "./reply.ts";

import type { PageData } from "./types.ts";

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
              { type: "note", id: "q1", label: "Owner", ask: "Who?" },
              { type: "note", id: "q2", label: "Date", ask: "When?" },
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
        "- **Owner:** unanswered",
        "- **Date:** unanswered",
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
