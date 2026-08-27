import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installChips } from "./chips.ts";

import type { AnswerLine } from "./reply.ts";

/** the window-level handlers the strip registers, by event type */
let listening: Record<string, (() => void)[]>;

beforeEach(() => {
  listening = {};
  globalThis.document = {
    createElement: (tag: string) => new StubElement(tag),
  } as unknown as Document;
  globalThis.window = {
    innerHeight: 1000,
    addEventListener: (type: string, handler: () => void) => {
      (listening[type] ??= []).push(handler);
    },
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window }).window;
});

/**
 * builds one question as the renderer emits it
 * @param id the question's id
 * @param ref its citation code
 * @param top where its card sits down the viewport
 * @returns the question's card
 */
function question(id: string, ref: string, top = 0): StubElement {
  const field = new StubElement("fieldset", {
    "data-question": "",
    "data-question-id": id,
    "data-question-ref": ref,
    "data-question-label": `${ref} question`,
  });
  field.box = { ...field.box, top };

  return field;
}

/**
 * builds one answer line, overridden per test
 * @param overrides what this line says
 * @returns the line
 */
function line(overrides: Partial<AnswerLine> = {}): AnswerLine {
  return {
    ref: "D1",
    label: "First",
    value: "",
    response: "decision",
    recommended: [],
    touched: false,
    ...overrides,
  };
}

/** raises a scroll, as the browser does when the reader moves the page. */
function scroll(): void {
  for (const handler of listening.scroll ?? []) handler();
}

describe("fn:installChips", () => {
  it("should draw one chip per question, in reading order", () => {
    const strip = new StubElement("div", { "data-chip-strip": "" });

    installChips(strip as unknown as HTMLElement, [
      question("gate", "D1"),
      question("owner", "N2"),
    ] as unknown as HTMLElement[]);

    expect(strip.children.map((chip) => chip.textContent)).toEqual(["D1", "N2"]);
    // an anchor to the card, so the chip is the same jump the drawer's rows
    // are and works on a page whose script never booted
    expect(strip.children.map((chip) => chip.getAttribute("href"))).toEqual([
      "#qs-gate",
      "#qs-owner",
    ]);
    // the chip reads as its code, so the question it stands for has to reach
    // the reader some other way
    expect(strip.children[0].getAttribute("title")).toBe("D1 · D1 question");
    // the annotation toolbar already owns .chip. Drawn under that name these
    // took its pill radius, its surface fill under the two statuses DR4 wants
    // empty, and a pointer cursor on something that is already a link
    expect(strip.children[0].className).toBe("q-chip");
  });

  it("should paint each chip with where its answer stands", () => {
    const strip = new StubElement("div", { "data-chip-strip": "" });
    const paint = installChips(strip as unknown as HTMLElement, [
      question("a", "D1"),
      question("b", "D2"),
      question("c", "D3"),
    ] as unknown as HTMLElement[]);

    paint([
      line({ value: "yes", recommended: ["yes"], touched: true }),
      line({ value: "no", recommended: ["yes"], touched: true }),
      line({ recommended: ["yes"] }),
    ]);

    expect(strip.children.map((chip) => chip.getAttribute("data-status"))).toEqual([
      "confirmed",
      "changed",
      "suggested",
    ]);
  });

  it("should repaint in place rather than rebuilding the strip", () => {
    // the chips are anchors: rebuilding them drops the one under the pointer
    // and loses the keyboard from whichever the reader had reached
    const strip = new StubElement("div", { "data-chip-strip": "" });
    const paint = installChips(strip as unknown as HTMLElement, [
      question("a", "D1"),
    ] as unknown as HTMLElement[]);
    const first = strip.children[0];

    paint([line({ value: "yes", touched: true })]);
    paint([line()]);

    expect(strip.children[0]).toBe(first);
    expect(first.getAttribute("data-status")).toBe("unanswered");
  });

  it("should mark the chip for the question nearest the reading line", () => {
    // 300px down a 1000px viewport, so the second card is the one being read
    const strip = new StubElement("div", { "data-chip-strip": "" });
    const fields = [question("a", "D1", -400), question("b", "D2", 320)];
    installChips(
      strip as unknown as HTMLElement,
      fields as unknown as HTMLElement[],
    );

    scroll();

    expect(strip.children.map((chip) => chip.getAttribute("data-current"))).toEqual([
      null,
      "true",
    ]);
  });

  it("should mark only one chip as the reader moves down the page", () => {
    const strip = new StubElement("div", { "data-chip-strip": "" });
    const fields = [question("a", "D1", 280), question("b", "D2", 1400)];
    installChips(
      strip as unknown as HTMLElement,
      fields as unknown as HTMLElement[],
    );
    scroll();

    fields[0].box = { ...fields[0].box, top: -900 };
    fields[1].box = { ...fields[1].box, top: 260 };
    scroll();

    expect(strip.children.map((chip) => chip.getAttribute("data-current"))).toEqual([
      null,
      "true",
    ]);
  });

  it("should scroll the marked chip to the middle of the strip", () => {
    // the strip is 200 wide and the second chip sits 240 along it, so centring
    // it means scrolling by 240 - (200 - 40) / 2
    const strip = new StubElement("div", { "data-chip-strip": "" });
    strip.box = { ...strip.box, left: 0, width: 200 };
    const fields = [question("a", "D1", 300), question("b", "D2", 1400)];
    installChips(
      strip as unknown as HTMLElement,
      fields as unknown as HTMLElement[],
    );
    // laid out after installation, as the browser does: the pass the install
    // runs measures a strip the page has not given a width to yet
    strip.children[1].box = { ...strip.children[1].box, left: 240, width: 40 };
    strip.scrollLeft = 0;

    fields[0].box = { ...fields[0].box, top: -900 };
    fields[1].box = { ...fields[1].box, top: 260 };
    scroll();

    expect(strip.scrollLeft).toBe(160);
  });

  it("should report nothing hidden while every chip fits the bar", () => {
    const strip = new StubElement("div", { "data-chip-strip": "" });
    installChips(strip as unknown as HTMLElement, [
      question("a", "D1"),
    ] as unknown as HTMLElement[]);

    strip.clientWidth = 200;
    strip.scrollWidth = 200;
    strip.dispatch("scroll");

    // the fade is the only sign the strip runs past its edge, so a strip that
    // does not must not draw one: masked at both ends unconditionally, the
    // first chip lay under a gradient across most of its 2rem from the moment
    // the page loaded
    expect(strip.getAttribute("data-overflow")).toBe("none");
  });

  it("should report whichever end of the strip is hiding a chip", () => {
    const strip = new StubElement("div", { "data-chip-strip": "" });
    installChips(strip as unknown as HTMLElement, [
      question("a", "D1"),
    ] as unknown as HTMLElement[]);
    strip.clientWidth = 200;
    strip.scrollWidth = 500;

    strip.scrollLeft = 0;
    strip.dispatch("scroll");
    const atStart = strip.getAttribute("data-overflow");
    strip.scrollLeft = 150;
    strip.dispatch("scroll");
    const between = strip.getAttribute("data-overflow");
    strip.scrollLeft = 300;
    strip.dispatch("scroll");
    const atEnd = strip.getAttribute("data-overflow");

    expect([atStart, between, atEnd]).toEqual(["end", "both", "start"]);
  });

  it("should re-read the strip after centring a chip on it", () => {
    // centring scrolls the strip itself, and the browser raises that scroll
    // asynchronously behind scroll-behavior:smooth — the state has to be right
    // from the moment the chip moves, not one frame later
    const strip = new StubElement("div", { "data-chip-strip": "" });
    strip.box = { ...strip.box, left: 0, width: 200 };
    const fields = [question("a", "D1", 300), question("b", "D2", 1400)];
    installChips(
      strip as unknown as HTMLElement,
      fields as unknown as HTMLElement[],
    );
    strip.clientWidth = 200;
    strip.scrollWidth = 500;
    strip.children[1].box = { ...strip.children[1].box, left: 240, width: 40 };
    // laid out after installation, as the browser does: the pass the install
    // runs centres the first chip against a strip the page has not sized yet
    strip.scrollLeft = 0;

    fields[0].box = { ...fields[0].box, top: -900 };
    fields[1].box = { ...fields[1].box, top: 260 };
    scroll();

    expect(strip.scrollLeft).toBe(160);
    expect(strip.getAttribute("data-overflow")).toBe("both");
  });

  it("should leave the strip alone while the reader stays on one question", () => {
    // a reader who has scrolled the strip by hand to look ahead is not fought
    // by every scroll event the page raises
    const strip = new StubElement("div", { "data-chip-strip": "" });
    strip.box = { ...strip.box, left: 0, width: 200 };
    const fields = [question("a", "D1", 300)];
    installChips(
      strip as unknown as HTMLElement,
      fields as unknown as HTMLElement[],
    );
    strip.children[0].box = { ...strip.children[0].box, left: 240, width: 40 };
    scroll();
    strip.scrollLeft = 0;

    scroll();

    expect(strip.scrollLeft).toBe(0);
  });
});
