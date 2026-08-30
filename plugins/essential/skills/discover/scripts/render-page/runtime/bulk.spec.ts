import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installBulkApprove } from "./bulk.ts";

/** what the reader answered the confirm with. */
let agrees: boolean;
/** what the confirm asked. */
let asked: string;

beforeEach(() => {
  agrees = true;
  asked = "";
  globalThis.window = {
    confirm: (message: string) => {
      asked = message;

      return agrees;
    },
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

/**
 * builds a decision question
 * @param pressed which verdict is already pressed, if any
 * @returns the question
 */
function decision(pressed = ""): StubElement {
  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "decision" },
    ["approve", "change"].map(
      (verdict) =>
        new StubElement("button", {
          "data-verdict": verdict,
          "aria-pressed": String(verdict === pressed),
        }),
    ),
  );
}

/**
 * builds a choice question whose middle option is recommended
 * @param checked which option is already checked, if any
 * @param recommends whether the board recommends one at all
 * @returns the question
 */
function choice(checked = "", recommends = true): StubElement {
  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": "choice" },
    ["keep", "change", "drop"].map((value) => {
      const input = new StubElement("input", {
        type: "radio",
        value,
        ...(recommends && value === "change" ? { "data-recommended": "" } : {}),
      });
      input.checked = value === checked;

      return input;
    }),
  );
}

/**
 * installs the offer over some questions
 * @param fields the questions
 * @returns the button and the repaint
 */
function install(fields: StubElement[]): {
  button: StubElement;
  paint: () => void;
} {
  const button = new StubElement("button");

  return {
    button,
    paint: installBulkApprove(button as unknown as HTMLElement, [
      ...(fields as unknown as HTMLElement[]),
    ]),
  };
}

describe("fn:installBulkApprove", () => {
  it("should say how many questions the press would answer", () => {
    const { button } = install([decision(), choice()]);

    expect(button.textContent).toBe("Approve 2 recommended answers");
    expect(button.hidden).toBe(false);
  });

  it("should read one question as singular", () => {
    expect(install([decision()]).button.textContent).toBe(
      "Approve 1 recommended answer",
    );
  });

  it("should offer nothing when every question is answered", () => {
    expect(install([decision("approve"), choice("keep")]).button.hidden).toBe(true);
  });

  it("should approve every unmarked decision", () => {
    const fields = [decision(), decision()];
    const pressed: boolean[] = [];
    for (const field of fields)
      field
        .querySelector('[data-verdict="approve"]')!
        .addEventListener("click", () => pressed.push(true));

    install(fields).button.click();

    expect(pressed).toEqual([true, true]);
  });

  it("should choose the recommended option on an unmarked choice", () => {
    const fields = [choice()];

    install(fields).button.click();

    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(true);
  });

  it("should never overwrite an answer the reader already gave", () => {
    const fields = [choice("keep")];

    install(fields).button.click();

    expect(fields[0]!.querySelectorAll("input")[0]!.checked).toBe(true);
    expect(fields[0]!.querySelectorAll("input")[1]!.checked).toBe(false);
  });

  it("should leave a question the board recommends nothing for alone", () => {
    // filling it would put an answer in the reply nobody chose or suggested
    const fields = [choice("", false)];

    install(fields).button.click();

    expect(fields[0]!.querySelectorAll("input").some((input) => input.checked)).toBe(
      false,
    );
  });

  it("should say how many it will answer before it answers them", () => {
    install([decision(), choice()]).button.click();

    expect(asked).toContain("2 questions");
  });

  it("should do nothing when the reader declines", () => {
    agrees = false;
    const fields = [decision()];
    let pressed = false;
    fields[0]!
      .querySelector('[data-verdict="approve"]')!
      .addEventListener("click", () => {
        pressed = true;
      });

    install(fields).button.click();

    expect(pressed).toBe(false);
  });

  it("should withdraw the offer once nothing is left unmarked", () => {
    const { button } = install([choice()]);

    button.click();

    expect(button.hidden).toBe(true);
  });

  it("should shrink the offer as the reader answers by hand", () => {
    const fields = [choice(), choice()];
    const { button, paint } = install(fields);
    fields[0]!.querySelectorAll("input")[0]!.checked = true;

    paint();

    expect(button.textContent).toBe("Approve 1 recommended answer");
  });
});
