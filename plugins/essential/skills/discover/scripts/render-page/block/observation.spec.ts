import { describe, expect, it } from "vitest";

import { renderObservations } from "./observation.ts";
import { RenderError } from "../error.ts";
import { freshIds } from "../id.ts";
import { ANSWER_KIND } from "../vocabulary.ts";

import type { PageIds } from "../id.ts";
import type { Block, Observation } from "../types.ts";

/** the block every case below starts from. */
const BASE = {
  type: "observations",
  id: "noticed",
  ref: "O1",
  label: "Which of these land",
  ask: "Tick every observation that matches what you have seen.",
  items: [
    {
      title: "The wizard cannot be resumed",
      file: "web/src/onboarding/wizard-state.ts",
      found: "State is discarded when the route unmounts.",
      impact: "Anyone who stops to find an API key starts over.",
      source: "Funnel analysis",
    },
    {
      title: "First value waits on a queue",
      found: "The first ingest is queued with a five-minute floor.",
      impact: "A signup that completes every step still sees nothing.",
    },
  ],
} as Extract<Block, { type: "observations" }>;

/**
 * renders one observations block
 * @param block what to render, filled out from a working default
 * @param ledger the ids claimed so far
 * @returns the block as HTML
 */
function draw(
  block: Partial<Extract<Block, { type: "observations" }>> = {},
  ledger: PageIds = freshIds(),
): string {
  return renderObservations(
    { ...BASE, ...block } as Extract<Block, { type: "observations" }>,
    "sections[0].blocks[0]",
    ledger,
  );
}

describe("fn:renderObservations", () => {
  it("should open as a question, so the chips and the reply see it", () => {
    const drawn = draw();

    expect(drawn).toContain("<fieldset class=\"question\" id=\"qs-noticed\"");
    expect(drawn).toContain('data-question-id="noticed"');
    expect(drawn).toContain('data-question-ref="O1"');
    expect(drawn).toContain('data-question-label="Which of these land"');
    expect(drawn).toContain('<span class="q-ref">O1</span>Which of these land');
  });

  it("should save under the checklist contract rather than its own", () => {
    // the store, the reply and the restore path all branch on this attribute;
    // a kind of its own would be a fourth copy of the checklist serialisation
    const drawn = draw();

    expect(ANSWER_KIND.observations).toEqual("checklist");
    expect(drawn).toContain('data-question-kind="checklist"');
    expect(drawn).not.toContain('data-question-kind="observations"');
  });

  it("should draw one card per item, in the order authored", () => {
    const drawn = draw();

    expect(
      [...drawn.matchAll(/class="observation-title">([^<]+)</g)].map((h) => h[1]),
    ).toEqual(["The wizard cannot be resumed", "First value waits on a queue"]);
  });

  it("should number the cards without the author numbering them", () => {
    // the numbers come from a counter over an <ol>, so inserting a card in the
    // middle renumbers the set rather than leaving a hand-typed 3 above a 5
    const drawn = draw();

    expect(drawn).toContain('<ol class="observations">');
    expect((drawn.match(/<li class="observation">/g) ?? []).length).toEqual(2);
    expect(drawn).not.toMatch(/observation-number/);
  });

  it("should record a tick by its card's title, not its position", () => {
    // an answer saved before the author reordered the cards has to restore
    // onto the card the reader actually ticked
    const drawn = draw();

    expect(drawn).toContain(
      '<input type="checkbox" name="noticed" value="The wizard cannot be resumed" />',
    );
    expect(drawn).toContain('<input type="checkbox" name="noticed" value="First value waits on a queue" />');
  });

  it("should refuse two cards that would save as one tick", () => {
    const twice = [BASE.items[0], BASE.items[0]] as Observation[];

    expect(() => draw({ items: twice })).toThrow(RenderError);
    expect(() => draw({ items: twice })).toThrow(
      'sections[0].blocks[0].items[1].title: duplicate observation "The wizard cannot be resumed", which a tick is recorded by; give each card its own title',
    );
  });

  it("should name the path of every field it requires", () => {
    const cases: [Partial<Observation>, string][] = [
      [{ title: undefined }, "sections[0].blocks[0].items[1].title"],
      [{ found: undefined }, "sections[0].blocks[0].items[1].found"],
      [{ impact: undefined }, "sections[0].blocks[0].items[1].impact"],
    ];

    for (const [broken, path] of cases)
      expect(() =>
        draw({ items: [BASE.items[0]!, { ...BASE.items[1]!, ...broken }] }),
      ).toThrow(path);
  });

  it("should refuse an empty set, naming where it sits", () => {
    expect(() => draw({ items: [] })).toThrow("sections[0].blocks[0].items");
  });

  it("should draw the file chip only where the author named a file", () => {
    const drawn = draw();

    expect(drawn).toContain(
      '<p class="observation-file">web/src/onboarding/wizard-state.ts</p>',
    );
    expect((drawn.match(/class="observation-file"/g) ?? []).length).toEqual(1);
  });

  it("should label both lines of every card", () => {
    const drawn = draw();

    expect((drawn.match(/<dt>Found in code<\/dt>/g) ?? []).length).toEqual(2);
    expect((drawn.match(/<dt>Impact<\/dt>/g) ?? []).length).toEqual(2);
  });

  it("should render a rich `found` as runs rather than as text", () => {
    const drawn = draw({
      items: [
        {
          ...BASE.items[0]!,
          found: ["State lives in ", { kind: "code", text: "useReducer" }],
        } as Observation,
      ],
    });

    expect(drawn).toContain('State lives in <code class="mono">useReducer</code>');
  });

  it("should badge a source with its initials and announce it in full", () => {
    // a circle two characters wide cannot hold a name, and text clipped by the
    // sheet is still announced and still copied in full
    const drawn = draw();

    expect(drawn).toContain('title="Funnel analysis"');
    expect(drawn).toContain('<span aria-hidden="true">FA</span>');
    expect(drawn).toContain('<span class="sr-only">Noticed by Funnel analysis</span>');
    expect((drawn.match(/class="observation-source"/g) ?? []).length).toEqual(1);
  });

  it("should escape every author byte it draws", () => {
    const drawn = draw({
      items: [
        {
          title: '</fieldset><img src=x onerror="alert(1)">',
          file: "<b>a.ts</b>",
          found: "<script>",
          impact: "</dd><script>",
          source: "<i>x</i> <b>y</b>",
        },
      ],
    });

    expect(drawn).not.toContain("<img");
    expect(drawn).not.toContain("<script>");
    expect(drawn).not.toContain("<b>a.ts</b>");
    expect(drawn).toContain("&lt;");
  });
});
