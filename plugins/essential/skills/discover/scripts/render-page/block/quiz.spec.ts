import { describe, expect, it } from "vitest";

import { renderGate, renderQuiz } from "./quiz.ts";
import { emptyContext } from "../context.ts";
import { RenderError } from "../error.ts";

import type { PageContext } from "../context.ts";
import type { Block, QuizOption } from "../types.ts";

/** the options every case below starts from, one of them right. */
const OPTIONS: QuizOption[] = [
  {
    value: "Nowhere — the reply records the answer, never whether it was right",
    correct: true,
    because: "The answer key is read by the gate and by nothing else.",
  },
  { value: "As a changed disposition", because: "That would print the key." },
];

/** the block every case below starts from. */
const BASE = {
  type: "quiz",
  id: "quiz-reply",
  ref: "Q1",
  label: "The quiz and the reply",
  ask: "Where does a wrong answer show up in the reply?",
  explains: "deviations",
  options: OPTIONS,
} as Extract<Block, { type: "quiz" }>;

/**
 * builds a page holding the section a quiz links back to
 * @param sections the section ids the board declares
 * @returns the context
 */
function pageWith(sections = ["deviations"]): PageContext {
  return { ...emptyContext(), sections: new Set(sections) };
}

/**
 * renders one quiz block
 * @param block what to render, filled out from a working default
 * @param page what the block is rendered into
 * @returns the block as HTML
 */
function draw(
  block: Partial<Extract<Block, { type: "quiz" }>> = {},
  page = pageWith(),
): string {
  return renderQuiz(
    { ...BASE, ...block } as Extract<Block, { type: "quiz" }>,
    "sections[5].blocks[1]",
    page,
  );
}

describe("fn:renderQuiz", () => {
  it("should open as a question, so the chips and the reply see it", () => {
    const drawn = draw();

    expect(drawn).toContain('data-question-id="quiz-reply"');
    expect(drawn).toContain('data-question-ref="Q1"');
    expect(drawn).toContain('data-question-kind="choice"');
  });

  it("should mark the answer with a key the answer store does not read", () => {
    const drawn = draw();

    // `data-recommended` is what disposition reads, and a quiz scored through
    // it would print the missed answer into the reply the reader sends back
    expect(drawn).not.toContain("data-recommended");
    expect(drawn.match(/data-correct/gu)).toHaveLength(1);
    expect(drawn).toContain(
      'value="Nowhere — the reply records the answer, never whether it was right" data-correct',
    );
  });

  it("should name the section a wrong answer is sent back to", () => {
    expect(draw()).toContain('data-quiz data-quiz-explains="deviations"');
  });

  it("should ship the rationale with the option rather than fetching it", () => {
    const drawn = draw();

    expect(drawn).toContain(
      '<span class="quiz-because">The answer key is read by the gate and by nothing else.</span>',
    );
    expect(drawn).toContain(
      '<span class="quiz-because">That would print the key.</span>',
    );
  });

  it("should give every option in one question the same radio name", () => {
    expect(draw().match(/name="q-quiz-reply"/gu)).toHaveLength(2);
  });

  it("should refuse a link back to a section the board does not have", () => {
    expect(() => draw({ explains: "nowhere" })).toThrow(RenderError);
    expect(() => draw({ explains: "nowhere" })).toThrow(
      'sections[5].blocks[1].explains: no section on this page has id "nowhere", so a wrong answer would link nowhere',
    );
  });

  it("should check the link back against the whole page, not the part drawn so far", () => {
    // the target sits further down the board than the question does, which is
    // the ordinary case: the quiz is last and the sections it cites are above
    // it only sometimes
    expect(() => draw({ explains: "fold" }, pageWith(["fold"]))).not.toThrow();
  });

  it("should refuse a quiz nobody can pass", () => {
    expect(() =>
      draw({ options: OPTIONS.map((option) => ({ ...option, correct: false })) }),
    ).toThrow(
      "sections[5].blocks[1].options: a quiz needs exactly one option marked `correct`, and this one has 0",
    );
  });

  it("should refuse a quiz that passes on an answer the change does not have", () => {
    expect(() =>
      draw({ options: OPTIONS.map((option) => ({ ...option, correct: true })) }),
    ).toThrow(
      "sections[5].blocks[1].options: a quiz needs exactly one option marked `correct`, and this one has 2",
    );
  });

  it("should refuse a question with nothing to answer", () => {
    expect(() => draw({ options: [] })).toThrow(
      "sections[5].blocks[1].options: required non-empty array, received []",
    );
  });

  it("should escape an option rather than letting it become markup", () => {
    const drawn = draw({
      options: [{ value: '"><img src=x>', correct: true }, OPTIONS[1]!],
    });

    expect(drawn).not.toContain("<img");
    expect(drawn).toContain("&quot;&gt;&lt;img src=x&gt;");
  });
});

describe("fn:renderGate", () => {
  /** the gate every case below starts from. */
  const GATE = {
    type: "gate",
    title: "Merge readiness",
    pass: "Cleared — merge it.",
    fail: "Not yet. Re-read the sections below.",
  } as Extract<Block, { type: "gate" }>;

  it("should ship in the unanswered state rather than waiting for the runtime", () => {
    const drawn = renderGate(GATE, "sections[5].blocks[5]");

    expect(drawn).toContain('data-gate data-gate-state="open"');
    expect(drawn).toContain(
      '<p class="gate-progress" data-gate-progress role="status">Answer every question above to see where this stands.</p>',
    );
  });

  it("should hide the pass verdict and show the fail one until anything is answered", () => {
    const drawn = renderGate(GATE, "sections[5].blocks[5]");

    expect(drawn).toContain(
      '<div class="gate-verdict" data-gate-pass hidden>Cleared — merge it.</div>',
    );
    expect(drawn).toContain(
      '<div class="gate-verdict" data-gate-fail>Not yet. Re-read the sections below.</div>',
    );
  });

  it("should give the empty miss list a name to be read under", () => {
    const drawn = renderGate(GATE, "sections[5].blocks[5]");
    const id = /id="([a-z0-9-]+)"/u.exec(drawn)?.[1] ?? "";

    expect(id).not.toBe("");
    expect(drawn).toContain(`aria-labelledby="${id}-title"`);
    expect(drawn).toContain('<ul class="gate-misses" data-gate-misses');
  });

  it("should name the verdict that is missing, by its own path", () => {
    expect(() =>
      renderGate(
        { ...GATE, fail: undefined } as unknown as Extract<
          Block,
          { type: "gate" }
        >,
        "sections[5].blocks[5]",
      ),
    ).toThrow("sections[5].blocks[5].fail");
  });
});
