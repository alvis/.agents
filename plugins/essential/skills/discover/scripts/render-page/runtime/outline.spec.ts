import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { dispositionOf } from "./disposition.ts";
import { installOutline, sectionState } from "./outline.ts";

import type { AnswerLine } from "./reply.ts";

/** the page the outline is installed over, which the stubbed document searches */
let root: StubElement;

beforeEach(() => {
  globalThis.document = {
    querySelectorAll: (selector: string) => root.querySelectorAll(selector),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/** one heading chip and the question field it stands for. */
interface Asked {
  /** the question's card, nested wherever the page drew it */
  field: StubElement;
  /** the chip under its section's heading */
  chip: StubElement;
  /** the chip's state word */
  word: StubElement;
}

/**
 * builds one question as the renderer emits it, with its heading chip
 * @param id the question's id
 * @returns the card, the chip, and the chip's state word
 */
function ask(id: string): Asked {
  const word = new StubElement("span", { class: "q-chip-state" });
  const chip = new StubElement("a", { "data-heading-chip": id, "data-status": "unanswered" }, [word]);
  const field = new StubElement("fieldset", { "data-question": "", "data-question-id": id });

  return { field, chip, word };
}

/**
 * builds a navigation link as the renderer emits it
 * @param section the section it points at
 * @returns the link and its tally
 */
function link(section: string): { link: StubElement; tally: StubElement } {
  const tally = new StubElement("span", { class: "nav-tally" });
  const anchor = new StubElement("a", { "data-nav-section": section, "data-nav-state": "none" }, [tally]);

  return { link: anchor, tally };
}

/**
 * builds one answer line, overridden per test
 * @param overrides what this line says
 * @returns the line
 */
function line(overrides: Partial<AnswerLine> = {}): AnswerLine {
  return {
    ref: "Q1",
    label: "A question",
    value: "",
    response: "decision",
    recommended: [],
    touched: false,
    defaults: false,
    ...overrides,
  };
}

/** one answered line, which every disposition other than open reads from */
const ANSWERED = line({ value: "Yes", touched: true });

describe("fn:installOutline", () => {
  it("should give a heading chip the status and word the answer has", () => {
    const { field, chip, word } = ask("a");
    root = new StubElement("body", {}, [
      new StubElement("section", { "data-section": "", "data-section-id": "s" }, [field]),
      chip,
    ]);
    const paint = installOutline([field as unknown as HTMLElement]);

    paint([ANSWERED]);

    // the same function that paints the drawer's strip decides the status
    expect(chip.getAttribute("data-status")).toBe(dispositionOf(ANSWERED));
    expect(word.textContent).toBe("answered");
  });

  it("should say a section is open, then settled, as its questions are answered", () => {
    const [one, two] = [ask("a"), ask("b")];
    const { link: nav, tally } = link("s");
    root = new StubElement("body", {}, [
      new StubElement("section", { "data-section": "", "data-section-id": "s" }, [
        one.field,
        // nested in a container, which still belongs to the section holding it
        new StubElement("details", {}, [two.field]),
      ]),
      one.chip,
      two.chip,
      nav,
    ]);
    const paint = installOutline([one.field, two.field] as unknown as HTMLElement[]);

    paint([line(), line()]);
    expect([nav.getAttribute("data-nav-state"), tally.textContent]).toEqual(["open", "2 open"]);

    paint([ANSWERED, line()]);
    expect([nav.getAttribute("data-nav-state"), tally.textContent]).toEqual(["open", "1 open"]);

    paint([ANSWERED, ANSWERED]);
    expect([nav.getAttribute("data-nav-state"), tally.textContent]).toEqual(["settled", "settled"]);
  });

  it("should count only the questions of its own section", () => {
    const [here, there] = [ask("a"), ask("b")];
    const first = link("first");
    const second = link("second");
    root = new StubElement("body", {}, [
      new StubElement("section", { "data-section": "", "data-section-id": "first" }, [here.field]),
      new StubElement("section", { "data-section": "", "data-section-id": "second" }, [there.field]),
      here.chip,
      there.chip,
      first.link,
      second.link,
    ]);

    installOutline([here.field, there.field] as unknown as HTMLElement[])([ANSWERED, line()]);

    expect(first.link.getAttribute("data-nav-state")).toBe("settled");
    expect(second.link.getAttribute("data-nav-state")).toBe("open");
  });

  it("should still paint a section's state when it draws no heading chips", () => {
    // a section opening with all its questions has no chip row, but its
    // drawer link still states where it stands
    const { field } = ask("a");
    const nav = link("s");
    root = new StubElement("body", {}, [
      new StubElement("section", { "data-section": "", "data-section-id": "s" }, [field]),
      nav.link,
    ]);
    const paint = installOutline([field as unknown as HTMLElement]);

    paint([line()]);
    expect([nav.link.getAttribute("data-nav-state"), nav.tally.textContent]).toEqual([
      "open",
      "1 open",
    ]);

    paint([ANSWERED]);
    expect(nav.link.getAttribute("data-nav-state")).toBe("settled");
  });

  it("should leave a section that asks nothing with no state and no tally", () => {
    const { field, chip } = ask("a");
    const bare = link("bare");
    root = new StubElement("body", {}, [
      new StubElement("section", { "data-section": "", "data-section-id": "s" }, [field]),
      new StubElement("section", { "data-section": "", "data-section-id": "bare" }, []),
      chip,
      bare.link,
    ]);

    installOutline([field as unknown as HTMLElement])([ANSWERED]);

    expect([bare.link.getAttribute("data-nav-state"), bare.tally.textContent]).toEqual([
      "none",
      "",
    ]);
  });
});

describe("fn:sectionState", () => {
  it("should read a declared default as settled, as the reply does", () => {
    const resting = line({ recommended: ["Approve"], defaults: true });

    expect(sectionState([dispositionOf(resting)])).toEqual({
      state: "settled",
      tally: "settled",
    });
  });

  it("should read a suggestion nobody has agreed to as still open", () => {
    const suggested = line({ recommended: ["Approve"] });

    expect(sectionState([dispositionOf(suggested), dispositionOf(ANSWERED)])).toEqual({
      state: "open",
      tally: "1 open",
    });
  });

  it("should say nothing of a section that asks nothing", () => {
    expect(sectionState([])).toEqual({ state: "none", tally: "" });
  });
});
