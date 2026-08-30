import { describe, expect, it } from "vitest";

import { renderGate, renderQuiz } from "./quiz.ts";
import { renderBlock } from "../block.ts";
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
  return { ...emptyContext(), quizzed: true, sections: new Set(sections) };
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
    expect(draw().match(/name="quiz-reply"/gu)).toHaveLength(2);
  });

  it("should name its radio group the way every other question names one", () => {
    // a name is what groups radios, and only the quiz prefixed one. A quiz `x`
    // and a choice `q-x` are two distinct ids, so both pass the freshness
    // check, and they used to land in one group where each answer silently
    // erased the other and the reply reported an answered question unanswered
    const page = pageWith();
    const drawn =
      renderBlock({ ...BASE, id: "x" } as Block, "sections[0].blocks[0]", page) +
      renderBlock(
        {
          type: "choice",
          id: "q-x",
          ref: "C1",
          label: "A plain choice",
          ask: "Which one?",
          choices: [{ value: "This one" }],
        } as unknown as Block,
        "sections[0].blocks[1]",
        page,
      );
    const names = [...drawn.matchAll(/name="([^"]+)"/gu)].map(([, name]) => name);

    expect(new Set(names).size).toBe(2);
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

  /**
   * renders one gate
   * @param page what the block is rendered into
   * @returns the gate as HTML
   */
  function gate(page = pageWith()): string {
    return renderGate(GATE, "sections[5].blocks[5]", page);
  }

  it("should ship unscored rather than waiting for the runtime", () => {
    const drawn = gate();

    expect(drawn).toContain('data-gate data-gate-state="unscored"');
    expect(drawn).toContain(
      '<p class="gate-progress" data-gate-progress role="status">Scoring needs JavaScript. With it off, check your own answers against the sections each one cites.</p>',
    );
  });

  it("should hide both verdicts until something has scored them", () => {
    // the sheet reveals each rationale on `:has(input:checked)` with no script
    // at all, so a reader with scripting off can answer every question — and
    // shipping the fail verdict visible told that reader the merge was blocked,
    // which is a settled answer nobody computed
    const drawn = gate();

    expect(drawn).toContain(
      '<div class="gate-verdict" data-gate-pass hidden>Cleared — merge it.</div>',
    );
    expect(drawn).toContain(
      '<div class="gate-verdict" data-gate-fail hidden>Not yet. Re-read the sections below.</div>',
    );
  });

  it("should give the empty miss list a name to be read under", () => {
    const drawn = gate();
    const id = /id="([a-z0-9-]+)"/u.exec(drawn)?.[1] ?? "";

    expect(id).not.toBe("");
    expect(drawn).toContain(`aria-labelledby="${id}-title"`);
    expect(drawn).toContain('<ul class="gate-misses" data-gate-misses');
  });

  it("should refuse a gate on a board that asks no quiz question", () => {
    // "0 of 0 answered so far" beside a merge verdict reads as a merge that was
    // considered, and the runtime's own count is all that stands between that
    // and a gate reporting itself cleared on nobody's answer
    expect(() => gate(emptyContext())).toThrow(RenderError);
    expect(() => gate(emptyContext())).toThrow(
      "sections[5].blocks[5]: a gate scores the quiz questions on its page, and this page asks none",
    );
  });

  it("should name the verdict that is missing, by its own path", () => {
    expect(() =>
      renderGate(
        { ...GATE, fail: undefined } as unknown as Extract<
          Block,
          { type: "gate" }
        >,
        "sections[5].blocks[5]",
        pageWith(),
      ),
    ).toThrow("sections[5].blocks[5].fail");
  });
});
