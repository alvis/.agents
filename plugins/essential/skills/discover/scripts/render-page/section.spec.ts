import { describe, expect, it } from "vitest";

import { emptyContext } from "./context.ts";
import { RenderError } from "./error.ts";
import { renderSection } from "./section.ts";

import type { Block, Section } from "./types.ts";

/** the smallest single-answer question a board can ask. */
const CHOICE = {
  type: "choice",
  id: "engine",
  ref: "D1",
  label: "Engine",
  ask: "Which engine?",
  choices: [{ value: "B-tree" }],
} as Block;

/** the smallest yes/no question a board can ask. */
const DECISION = { type: "decision", id: "ship", ref: "D2", label: "Ship", ask: "Ship it?" } as Block;

/** a sentence of context a reader sees without opening anything. */
const PROSE = { type: "prose", text: "B-tree fsyncs on commit; LSM batches." } as Block;

/**
 * renders one section holding the given blocks, as the first on its board
 * @param blocks the section's blocks, in reading order
 * @param overrides section fields beyond the blocks
 * @returns the section as HTML
 */
function html(blocks: Block[], overrides: Partial<Section> = {}): string {
  return renderSection({ id: "s", label: "S", title: "T", blocks, ...overrides }, 0, emptyContext());
}

describe("fn:renderSection standalone questions", () => {
  it("should accept a question whose section lede states its case", () => {
    expect(html([CHOICE], { lede: "B-tree is the only engine that never loses a write." })).toContain(
      'data-question-ref="D1"',
    );
  });

  it("should accept a question that follows visible context", () => {
    expect(html([PROSE, CHOICE])).toContain('data-question-ref="D1"');
  });

  it("should accept context drawn in an open disclosure", () => {
    expect(html([{ type: "disclosure", summary: "Why", open: true, blocks: [PROSE] }, CHOICE])).toContain(
      'data-question-ref="D1"',
    );
  });

  it("should accept context inside the closed disclosure that also holds the question", () => {
    // opening the fold to reach the question shows the reader its case too
    expect(html([{ type: "disclosure", summary: "Engine", blocks: [PROSE, CHOICE] }])).toContain(
      'data-question-ref="D1"',
    );
  });

  it("should accept context drawn in a variants panel", () => {
    const variants = {
      type: "variants",
      items: [
        { label: "B-tree", blocks: [PROSE] },
        { label: "LSM", blocks: [{ type: "prose", text: "Faster writes." }] },
      ],
    } as Block;

    expect(html([variants, CHOICE])).toContain('data-question-ref="D1"');
  });

  it("should accept a question that asks nothing to settle", () => {
    // a free-text note settles nothing, so it owes the reader no case
    expect(html([{ type: "note", id: "n", ref: "N1", label: "Note", ask: "Anything missing?" } as Block])).toContain(
      'data-question-ref="N1"',
    );
  });

  it("should refuse a choice that opens a section with no lede, naming its path", () => {
    expect(() => html([CHOICE])).toThrow(
      new RenderError(
        "sections[0].blocks[0]: choice D1 asks the reader to settle something the board has not explained; give its section a lede, or put the context it rests on ahead of it in a block the reader sees without opening a closed disclosure or ledger row",
      ),
    );
  });

  it("should refuse a decision whose only lead-in is other questions", () => {
    // a free-text note passes on its own, but it states no case for what follows
    const note = { type: "note", id: "n", ref: "N1", label: "Note", ask: "Anything missing?" } as Block;

    expect(() => html([note, DECISION])).toThrow(/^sections\[0\]\.blocks\[1\]: decision D2 /);
  });

  it("should refuse a decision that follows only a quiz and its gate", () => {
    const quiz = {
      type: "quiz",
      id: "q",
      ref: "Q1",
      label: "Q",
      ask: "Which?",
      explains: "s",
      options: [{ value: "a", correct: true }, { value: "b" }],
    } as Block;
    // a gate scores the quiz above it; its verdict says nothing about the case
    // for the decision below
    const gate = { type: "gate", title: "Ready?", pass: "Decide below.", fail: "Re-read first." } as Block;
    const context = { ...emptyContext(), quizzed: true, sections: new Set(["s"]) };

    expect(() => renderSection({ id: "s", label: "S", title: "T", blocks: [quiz, gate, DECISION] }, 0, context)).toThrow(
      /^sections\[0\]\.blocks\[2\]: decision D2 /,
    );
  });

  it("should refuse a question whose only context sits in a closed disclosure", () => {
    expect(() => html([{ type: "disclosure", summary: "Why", blocks: [PROSE] }, CHOICE])).toThrow(
      /^sections\[0\]\.blocks\[1\]: choice D1 /,
    );
  });

  it("should refuse a question whose only context sits in a ledger's rows", () => {
    const ledger = {
      type: "ledger",
      groups: [
        {
          label: "Hypotheses",
          facts: [],
          entries: [{ code: "H1", title: "holds", status: "done", facts: [{ label: "Claim", value: "B-tree wins" }] }],
        },
      ],
    } as Block;

    expect(() => html([ledger, DECISION])).toThrow(/^sections\[0\]\.blocks\[1\]: decision D2 /);
  });

  it("should refuse context that follows the question rather than leads to it", () => {
    expect(() => html([CHOICE, PROSE])).toThrow(/^sections\[0\]\.blocks\[0\]: choice D1 /);
  });

  it("should name a question nested in a closed disclosure by its full path", () => {
    expect(() => html([{ type: "disclosure", summary: "More", blocks: [DECISION] }])).toThrow(
      /^sections\[0\]\.blocks\[0\]\.blocks\[0\]: decision D2 /,
    );
  });
});
