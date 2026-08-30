import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installVerdicts } from "./verdict.ts";

/** the click handler `installVerdicts` registers on the document. */
let click: (event: { target: StubElement }) => void;

/** every field the installer reported an answer for, in order. */
let answered: StubElement[];

/**
 * builds a decision question with both verdicts, a note field, and a textarea
 * @returns the field
 */
function decision(): StubElement {
  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "decision" },
    [
      new StubElement("button", {
        "data-verdict": "approve",
        "aria-pressed": "false",
      }),
      new StubElement("button", {
        "data-verdict": "change",
        "aria-pressed": "false",
      }),
      new StubElement("div", { "data-verdict-note": "" }, [
        new StubElement("textarea"),
      ]),
    ],
  );
}

/**
 * reads which verdicts are currently pressed
 * @param field the decision field
 * @returns the `aria-pressed` value of each verdict, in document order
 */
function pressed(field: StubElement): string[] {
  return field
    .querySelectorAll("[data-verdict]")
    .map((button) => button.attributes["aria-pressed"]);
}

/** whatever `document` held before a test replaced it. */
let held: unknown;

beforeEach(() => {
  answered = [];
  held = Reflect.get(globalThis, "document");
  Reflect.set(globalThis, "document", {
    addEventListener: (type: string, handler: typeof click) => {
      if (type === "click") click = handler;
    },
  });
  installVerdicts((field) => void answered.push(field));
});

afterEach(() => void Reflect.set(globalThis, "document", held));

describe("fn:installVerdicts", () => {
  it("should press the verdict the reader clicked", () => {
    const field = decision();

    click({ target: field.querySelectorAll("[data-verdict]")[0] });

    expect(pressed(field)).toStrictEqual(["true", "false"]);
    expect(answered).toStrictEqual([field]);
  });

  it("should report an answer, because a button fires no input or change event", () => {
    // the trap this branch exists for: refresh is wired to "input" and
    // "change", and a button fires neither, so without the report the tally
    // and the reply would silently never move
    const field = decision();

    click({ target: field.querySelectorAll("[data-verdict]")[1] });

    expect(answered).toHaveLength(1);
  });

  it("should clear the other verdict, because the two are exclusive", () => {
    const field = decision();
    const [approve, change] = field.querySelectorAll("[data-verdict]");

    click({ target: approve });
    click({ target: change });

    expect(pressed(field)).toStrictEqual(["false", "true"]);
  });

  it("should unmark the field when the pressed verdict is clicked again", () => {
    const field = decision();
    const [approve] = field.querySelectorAll("[data-verdict]");

    click({ target: approve });
    click({ target: approve });

    expect(pressed(field)).toStrictEqual(["false", "false"]);
  });

  it("should reveal and focus the note only when change is newly pressed", () => {
    const field = decision();
    const [, change] = field.querySelectorAll("[data-verdict]");

    click({ target: change });

    // a bare Change reads "- <label>: Change", which tells the reader nothing
    // actionable, so the field is revealed and focused straight away
    expect(field.querySelector("[data-verdict-note]")?.hidden).toBe(false);
    expect(field.querySelector("textarea")?.focused).toBe(true);
  });

  it("should hide the note again when change is un-pressed", () => {
    const field = decision();
    const [, change] = field.querySelectorAll("[data-verdict]");

    click({ target: change });
    click({ target: change });

    expect(field.querySelector("[data-verdict-note]")?.hidden).toBe(true);
  });

  it("should keep the note hidden for approve", () => {
    const field = decision();
    const [approve] = field.querySelectorAll("[data-verdict]");

    click({ target: approve });

    expect(field.querySelector("[data-verdict-note]")?.hidden).toBe(true);
    expect(field.querySelector("textarea")?.focused).toBe(false);
  });

  it("should ignore a click that reached no verdict", () => {
    const field = decision();

    click({ target: field.querySelector("textarea")! });

    expect(pressed(field)).toStrictEqual(["false", "false"]);
    expect(answered).toStrictEqual([]);
  });

  it("should keep one decision block out of another's state", () => {
    // the listener is delegated from the document, so it must survive however
    // many decision blocks a page carries
    const first = decision();
    const second = decision();

    click({ target: first.querySelectorAll("[data-verdict]")[0] });
    click({ target: second.querySelectorAll("[data-verdict]")[1] });

    expect(pressed(first)).toStrictEqual(["true", "false"]);
    expect(pressed(second)).toStrictEqual(["false", "true"]);
  });
});
