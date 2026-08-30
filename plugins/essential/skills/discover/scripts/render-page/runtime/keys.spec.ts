import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installKeys } from "./keys.ts";

/** every handler the installer put on the document, by event type. */
let handlers: Record<string, ((event: unknown) => void)[]>;

/** the badges the installer asked the document to create. */
let badges: StubElement[];

beforeEach(() => {
  handlers = {};
  badges = [];
  globalThis.document = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (handlers[type] ??= []).push(handler);
    },
    createElement: (tag: string) => {
      const made = new StubElement(tag);
      badges.push(made);

      return made;
    },
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * builds a choice question with three options
 * @param id the question's id
 * @returns the question
 */
function choice(id: string): StubElement {
  const options = ["keep", "change", "drop"].map((value) => {
    const input = new StubElement("input", { type: "radio", value });
    // the runtime places a badge after each control, which the stub records
    Object.assign(input, { after: () => undefined });

    return new StubElement("label", {}, [input]);
  });

  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "choice", "data-question-id": id },
    options,
  );
}

/**
 * builds a five-point scale question
 * @param id the question's id
 * @returns the question
 */
function scale(id: string): StubElement {
  const points = [1, 2, 3, 4, 5].map((point) => {
    const input = new StubElement("input", { type: "radio", value: `${point}` });
    Object.assign(input, { after: () => undefined });

    return new StubElement("label", { class: "scale-point" }, [input]);
  });

  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "scale", "data-question-id": id },
    points,
  );
}

/**
 * builds a decision question
 * @param id the question's id
 * @returns the question
 */
function decision(id: string): StubElement {
  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "decision", "data-question-id": id },
    [
      new StubElement("button", { "data-verdict": "approve" }),
      new StubElement("button", { "data-verdict": "change" }),
    ],
  );
}

/**
 * raises a key on the document
 * @param key the key pressed
 * @param extra anything else the event carries
 */
function press(key: string, extra: Record<string, unknown> = {}): void {
  for (const handler of handlers.keydown ?? [])
    handler({ key, target: null, preventDefault: () => undefined, ...extra });
}

/**
 * installs the keys over some questions
 * @param fields the questions
 */
function install(fields: StubElement[]): void {
  installKeys(fields as unknown as HTMLElement[]);
}

describe("fn:installKeys", () => {
  it("should move to the first question on the first arrow", () => {
    const fields = [choice("a"), choice("b")];
    install(fields);

    press("ArrowRight");

    expect(fields[0]!.focused).toBe(true);
  });

  it("should walk forward one question at a time", () => {
    const fields = [choice("a"), choice("b")];
    install(fields);

    press("ArrowRight");
    press("ArrowRight");

    expect(fields[1]!.focused).toBe(true);
  });

  it("should stop at the last question rather than wrapping", () => {
    const fields = [choice("a"), choice("b")];
    install(fields);

    press("ArrowRight");
    press("ArrowRight");
    press("ArrowRight");
    fields[0]!.focused = false;
    press("ArrowLeft");

    expect(fields[0]!.focused).toBe(true);
  });

  it("should bring the question it moved to into view", () => {
    const fields = [choice("a")];
    install(fields);

    press("ArrowRight");

    expect(fields[0]!.scrolled).toBe(true);
  });

  it("should choose an option by its letter", () => {
    const fields = [choice("a")];
    install(fields);

    press("ArrowRight");
    press("b");

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(true);
  });

  it("should raise the events the page records an answer from", () => {
    const fields = [choice("a")];
    install(fields);
    const seen: string[] = [];
    for (const type of ["click", "input", "change"])
      fields[0]!.querySelectorAll("input")[0]!.addEventListener(type, () => seen.push(type));

    press("ArrowRight");
    press("a");

    expect(seen).toEqual(["click", "input", "change"]);
  });

  it("should accept the current decision on A", () => {
    const fields = [decision("d")];
    install(fields);
    let pressed = false;
    fields[0]!.querySelector('[data-verdict="approve"]')!.addEventListener("click", () => {
      pressed = true;
    });

    press("ArrowRight");
    press("A");

    expect(pressed).toBe(true);
  });

  it("should leave an accepted decision accepted on a second A", () => {
    const fields = [decision("d")];
    install(fields);
    const approve = fields[0]!.querySelector('[data-verdict="approve"]')!;
    let presses = 0;
    approve.addEventListener("click", () => {
      presses += 1;
      approve.setAttribute("aria-pressed", "true");
    });

    press("ArrowRight");
    press("A");
    press("A");

    // the second press must not reach the button: it is a toggle, and reaching
    // it again would withdraw an acceptance the reader believes they gave
    expect(presses).toBe(1);
    expect(approve.getAttribute("aria-pressed")).toBe("true");
  });

  it("should read A as the first option where a question has options", () => {
    const fields = [choice("a")];
    install(fields);

    press("ArrowRight");
    press("A");

    expect(fields[0]!.querySelectorAll("input")[0]!.checked).toBe(true);
  });

  it("should do nothing until the reader has said which question they are in", () => {
    const fields = [choice("a")];
    install(fields);

    press("b");

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(false);
  });

  it("should take focus as a statement of where the reader is", () => {
    const fields = [choice("a"), choice("b")];
    install(fields);
    for (const handler of handlers.focusin ?? []) handler({ target: fields[1] });

    press("a");

    expect(fields[1]!.querySelectorAll("input")[0]!.checked).toBe(true);
  });

  it("should stay out of the way while the reader is typing", () => {
    const fields = [choice("a")];
    install(fields);
    const box = new StubElement("textarea");

    press("ArrowRight");
    press("b", { target: box });

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(false);
  });

  it("should stay out of the way while a dialog holds the reader", () => {
    // a modal traps focus but not keystrokes, and the board behind it is not
    // what the reader is looking at
    const fields = [choice("a")];
    install(fields);
    const inside = new StubElement("button", {}, []);
    new StubElement("dialog", { open: "" }, [inside]);

    press("ArrowRight");
    press("b", { target: inside });

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(false);
  });

  it("should still answer once the dialog is closed", () => {
    const fields = [choice("a")];
    install(fields);
    const inside = new StubElement("button", {}, []);
    const dialog = new StubElement("dialog", { open: "" }, [inside]);
    dialog.close();

    press("ArrowRight");
    press("b", { target: inside });

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(true);
  });

  it("should leave a modified key to the browser", () => {
    const fields = [choice("a"), choice("b")];
    install(fields);

    press("ArrowRight", { metaKey: true });

    expect(fields[0]!.focused).toBe(false);
  });

  it("should ignore a letter past the end of a question's options", () => {
    const fields = [choice("a")];
    install(fields);

    expect(() => {
      press("ArrowRight");
      press("z");
    }).not.toThrow();
  });

  it("should label each option with the letter that chooses it", () => {
    install([choice("a")]);

    expect(badges.map((badge) => badge.textContent)).toEqual(["a", "b", "c"]);
  });

  it("should choose a scale point by its own number", () => {
    const fields = [scale("s")];
    install(fields);

    press("ArrowRight");
    press("4");

    expect(fields[0]!.querySelectorAll("input")[3]!.checked).toBe(true);
  });

  it("should not letter a scale, whose points already carry their numbers", () => {
    install([scale("s")]);

    expect(badges).toEqual([]);
  });

  it("should ignore a number past the end of a scale", () => {
    const fields = [scale("s")];
    install(fields);

    press("ArrowRight");
    press("9");

    expect(fields[0]!.querySelectorAll("input").some((point) => point.checked)).toBe(
      false,
    );
  });

  it("should leave a page with no questions alone", () => {
    expect(() => install([])).not.toThrow();
    expect(handlers.keydown).toBeUndefined();
  });
});
