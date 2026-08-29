import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installQuiz } from "./quiz.ts";

/** the page every case below is installed over. */
let page: StubElement;

beforeEach(() => {
  globalThis.document = {
    createElement: (tag: string) => new StubElement(tag),
    querySelector: (selector: string) => page.querySelector(selector),
    querySelectorAll: (selector: string) => page.querySelectorAll(selector),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * builds one quiz question inside the card the gate reads its label from
 * @param ref the citation code
 * @param explains the section a wrong answer is sent back to
 * @returns the question card
 */
function question(ref: string, explains: string): StubElement {
  return new StubElement(
    "fieldset",
    {
      "data-question": "",
      "data-question-ref": ref,
      "data-question-label": `Question ${ref}`,
    },
    [
      new StubElement("div", { "data-quiz": "", "data-quiz-explains": explains }, [
        new StubElement("input", { type: "radio", "data-correct": "" }),
        new StubElement("input", { type: "radio" }),
      ]),
    ],
  );
}

/** the elements the gate repaints, named as the runtime finds them. */
interface Gate {
  /** the gate itself, whose state is the verdict */
  gate: StubElement;
  /** the live region carrying how far the reader has got */
  progress: StubElement;
  /** the cleared verdict */
  pass: StubElement;
  /** the blocked verdict */
  fail: StubElement;
  /** one row per question answered wrongly */
  misses: StubElement;
}

/**
 * builds a page of quiz questions, one gate, and the sections they cite
 * @param explains the section each question links back to, one per question
 * @returns the gate's elements
 */
function build(explains = ["deviations", "code"]): Gate {
  const progress = new StubElement("p", { "data-gate-progress": "" });
  const pass = new StubElement("div", { "data-gate-pass": "" });
  const fail = new StubElement("div", { "data-gate-fail": "" });
  const misses = new StubElement("ul", { "data-gate-misses": "" });
  const gate = new StubElement("div", { "data-gate": "", "data-gate-state": "open" }, [
    progress,
    pass,
    fail,
    misses,
  ]);
  pass.hidden = true;
  page = new StubElement("body", {}, [
    new StubElement("section", {
      "data-section-id": "deviations",
      "data-section-label": "Deviations",
    }),
    new StubElement("section", {
      "data-section-id": "code",
      "data-section-label": "Before and after",
    }),
    ...explains.map((target, index) => question(`Q${index + 1}`, target)),
    gate,
  ]);

  return { gate, progress, pass, fail, misses };
}

/**
 * answers one question
 * @param index which question, 0-based
 * @param right whether to pick the answer the change actually has
 */
function answer(index: number, right: boolean): void {
  const quiz = page.querySelectorAll("[data-quiz]")[index]!;
  const input = quiz.querySelectorAll("input")[right ? 0 : 1]!;
  for (const option of quiz.querySelectorAll("input")) option.checked = false;
  input.checked = true;
}

describe("fn:installQuiz", () => {
  it("should do nothing at all on a board that holds no gate", () => {
    page = new StubElement("body", {}, [question("Q1", "deviations")]);

    expect(installQuiz()).toBeUndefined();
  });

  it("should not clear a gate that has nothing to score", () => {
    // `answered.length === asked.length` is true over nothing, so without the
    // count beside it a gate with no questions under it reports a merge
    // cleared on an answer nobody gave. The renderer refuses such a board, and
    // this is the half of the guard that holds if one is ever built anyway
    const { gate, progress, pass } = build([]);
    const paint = installQuiz()!;

    paint();

    expect(gate.dataset.gateState).toBe("open");
    expect(progress.textContent).toBe("0 of 0 answered so far.");
    expect(pass.hidden).toBe(true);
  });

  it("should count answers rather than verdicts while the reader is still going", () => {
    const { gate, progress } = build();
    const paint = installQuiz()!;

    paint();
    expect(gate.dataset.gateState).toBe("open");
    expect(progress.textContent).toBe("0 of 2 answered so far.");

    answer(0, true);
    paint();
    expect(gate.dataset.gateState).toBe("open");
    expect(progress.textContent).toBe("1 of 2 answered so far.");
  });

  it("should clear the merge only once every question is answered right", () => {
    const { gate, progress, pass, fail } = build();
    const paint = installQuiz()!;

    answer(0, true);
    answer(1, true);
    paint();

    expect(gate.dataset.gateState).toBe("cleared");
    expect(progress.textContent).toBe("All 2 answered correctly.");
    expect(pass.hidden).toBe(false);
    expect(fail.hidden).toBe(true);
  });

  it("should block the merge on a wrong answer, whatever else is right", () => {
    const { gate, progress, pass, fail } = build();
    const paint = installQuiz()!;

    answer(0, true);
    answer(1, false);
    paint();

    expect(gate.dataset.gateState).toBe("blocked");
    expect(progress.textContent).toBe(
      "1 of 2 answered wrongly — the sections below say why.",
    );
    expect(pass.hidden).toBe(true);
    expect(fail.hidden).toBe(false);
  });

  it("should send a wrong answer back to the section that explains it", () => {
    const { misses } = build();
    const paint = installQuiz()!;

    answer(1, false);
    paint();

    const rows = misses.querySelectorAll("a");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attributes.href).toBe("#s-code");
    expect(rows[0]!.textContent).toBe(
      "Q2 · Question Q2 — re-read Before and after",
    );
  });

  it("should not tell a reader they got wrong a question they have not answered", () => {
    const { misses, gate } = build();
    const paint = installQuiz()!;

    paint();
    expect(misses.querySelectorAll("a")).toHaveLength(0);
    expect(gate.dataset.gateState).toBe("open");
  });

  it("should clear a miss the reader has since corrected", () => {
    const { misses, gate } = build();
    const paint = installQuiz()!;

    answer(0, false);
    answer(1, true);
    paint();
    expect(misses.querySelectorAll("a")).toHaveLength(1);

    answer(0, true);
    paint();
    expect(misses.querySelectorAll("a")).toHaveLength(0);
    expect(gate.dataset.gateState).toBe("cleared");
  });

  it("should leave the live region alone when nothing it says has changed", () => {
    const { progress } = build();
    const paint = installQuiz()!;
    let written = 0;
    let text = "";
    Object.defineProperty(progress, "textContent", {
      get: () => text,
      set: (value: string) => {
        text = value;
        written += 1;
      },
    });

    paint();
    paint();
    paint();

    // rewriting an identical live region re-announces it to a screen reader on
    // every keystroke anywhere on the page
    expect(text).toBe("0 of 2 answered so far.");
    expect(written).toBe(1);
  });

  it("should fall back to the section's own id when the board names no label", () => {
    build(["absent"]);
    const paint = installQuiz()!;

    answer(0, false);
    paint();

    expect(page.querySelector("[data-gate-misses] a")?.textContent).toBe(
      "Q1 · Question Q1 — re-read absent",
    );
  });
});
