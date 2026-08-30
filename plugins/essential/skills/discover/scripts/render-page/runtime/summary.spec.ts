import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { paintSummary } from "./summary.ts";

import type { NoteRow } from "./note-view.ts";
import type { AnswerLine } from "./reply.ts";
import type { SummaryTargets } from "./summary.ts";

beforeEach(() => {
  globalThis.document = {
    createElement: (tag: string) => new StubElement(tag),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/** the drawer's elements, and how often the live region was rewritten. */
interface Drawer {
  /** the elements `paintSummary` redraws */
  targets: SummaryTargets;
  /** the list of one row per question */
  list: StubElement;
  /** the live region carrying the tally */
  count: StubElement;
  /** the element holding the rendered reply */
  reply: StubElement;
  /** how many times the tally's text was written */
  announced: () => number;
}

/**
 * builds the drawer as the renderer emits it
 * @param template the reply template the page stored
 * @returns the drawer's elements
 */
function drawer(template = "{{summary}}\n\n{{answers}}"): Drawer {
  const list = new StubElement("ul", { "data-summaries": "" });
  const count = new StubElement("p", { "data-unanswered-count": "" });
  const reply = new StubElement("pre", { "data-reply": "", "data-template": template });

  // the live region is watched rather than read, because the guard under test
  // is that an unchanged tally is not written at all
  let written = 0;
  let held = "";
  Object.defineProperty(count, "textContent", {
    get: () => held,
    set: (next: string) => {
      written += 1;
      held = next;
    },
  });

  return {
    targets: {
      list,
      count,
      reply,
    } as unknown as SummaryTargets,
    list,
    count,
    reply,
    announced: () => written,
  };
}

/**
 * builds one question's line
 * @param change what the line says beyond the defaults
 * @returns the line
 */
function line(change: Partial<AnswerLine> = {}): AnswerLine {
  return {
    ref: "D1",
    label: "Ship it?",
    value: "yes",
    response: "decision",
    recommended: [],
    touched: true,
    ...change,
  };
}

/**
 * reads every text an element draws
 * @param held the element to read
 * @returns the texts, in document order
 */
function texts(held: StubElement): string[] {
  return [
    ...(held.textContent ? [held.textContent] : []),
    ...held.children.flatMap(texts),
  ];
}

describe("fn:paintSummary", () => {
  it("should draw one row per question, in reading order", () => {
    const { targets, list } = drawer();

    paintSummary(
      targets,
      [line({ label: "First" }), line({ label: "Second" })],
      new Set(),
      ["a", "b"],
    );

    expect(list.children).toHaveLength(2);
    expect(texts(list)).toStrictEqual([
      "D1",
      "First",
      "yes",
      "D1",
      "Second",
      "yes",
    ]);
  });

  it("should link each row to the question it summarises", () => {
    const { targets, list } = drawer();

    paintSummary(
      targets,
      [line({ ref: "D1", label: "First" }), line({ ref: "N2", label: "Second" })],
      new Set(),
      ["gate", "owner"],
    );

    // the row reaches the card by fragment rather than by a handler, so the
    // jump still works on a board whose script never booted
    const jumps = list.children.map((row) => row.children[0]);

    expect(jumps.map((jump) => jump.tag)).toStrictEqual(["a", "a"]);
    expect(jumps.map((jump) => jump.getAttribute("href"))).toStrictEqual([
      "#qs-gate",
      "#qs-owner",
    ]);
  });

  it("should replace the rows rather than stack a repaint on the last", () => {
    // the drawer is repainted on every keystroke, and appending would show
    // each question once per press
    const { targets, list } = drawer();

    paintSummary(targets, [line()], new Set(), ["a"]);
    paintSummary(targets, [line()], new Set(), ["a"]);

    expect(list.children).toHaveLength(1);
  });

  it("should stand a dash where a question is unanswered", () => {
    // an empty cell reads as a rendering fault rather than as a gap the
    // reader still has to fill
    const { targets, list } = drawer();

    paintSummary(targets, [line({ value: "" })], new Set(), ["a"]);

    expect(texts(list)).toContain("—");
    expect(list.children[0]?.dataset.answered).toBe("false");
  });

  it("should mark a row that carries an answer", () => {
    const { targets, list } = drawer();

    paintSummary(targets, [line()], new Set(), ["a"]);

    expect(list.children[0]?.dataset.answered).toBe("true");
  });

  it("should mark which rows the reader answered themselves", () => {
    // a restore writes controls exactly as a reader would, so the drawer has
    // to say which answers are the reader's own rather than the page's
    const { targets, list } = drawer();

    paintSummary(targets, [line(), line()], new Set(["b"]), ["a", "b"]);

    expect(list.children.map((row) => row.dataset.touched)).toStrictEqual([
      "false",
      "true",
    ]);
  });

  it("should tally what is still unanswered", () => {
    const { targets, count } = drawer();

    paintSummary(
      targets,
      [line(), line({ value: "" }), line({ value: "" })],
      new Set(),
      ["a", "b", "c"],
    );

    expect(count.textContent).toBe("2 unanswered");
  });

  it("should not rewrite an unchanged tally", () => {
    // the tally is a live region, and rewriting identical text re-announces it
    // on every keystroke
    const { targets, announced } = drawer();
    paintSummary(targets, [line({ value: "" })], new Set(), ["a"]);

    paintSummary(targets, [line({ value: "" })], new Set(), ["a"]);

    expect(announced()).toBe(1);
  });

  it("should announce a tally that changed", () => {
    const { targets, announced, count } = drawer();
    paintSummary(targets, [line({ value: "" })], new Set(), ["a"]);

    paintSummary(targets, [line()], new Set(), ["a"]);

    expect(announced()).toBe(2);
    expect(count.textContent).toBe("0 unanswered");
  });

  it("should say when nothing is left unanswered", () => {
    const { targets, count } = drawer();

    paintSummary(targets, [line()], new Set(), ["a"]);

    expect(count.dataset.settled).toBe("true");
  });

  it("should say when something is still unanswered", () => {
    const { targets, count } = drawer();

    paintSummary(targets, [line({ value: "" })], new Set(), ["a"]);

    expect(count.dataset.settled).toBe("false");
  });

  it("should fill the reply from the template the page stored", () => {
    const { targets, reply } = drawer("answers:\n{{answers}}");

    paintSummary(targets, [line({ label: "Ship it?" })], new Set(), ["a"]);

    expect(reply.textContent).toContain("Ship it?");
    expect(reply.textContent).toContain("answers:");
  });

  it("should carry the reader's notes into the reply", () => {
    const { targets, reply } = drawer();
    const notes: NoteRow[] = [
      {
        sectionId: "risks",
        sectionLabel: "Risks",
        quote: "a passage",
        note: "worth watching",
        excerptId: "e1",
      },
    ];

    paintSummary(targets, [line()], new Set(), ["a"], notes);

    expect(reply.textContent).toContain("worth watching");
  });

  it("should render a page that stored no template at all", () => {
    const { targets, reply } = drawer();
    reply.removeAttribute("data-template");

    paintSummary(targets, [line()], new Set(), ["a"]);

    expect(reply.textContent).toBe("");
  });
});
