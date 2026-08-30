import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { answerText, readField, writeField } from "./answer.ts";

import type { SavedAnswer } from "./store.ts";

/**
 * builds a question field the runtime can read
 * @param kind the `data-question-kind` the renderer would emit
 * @param children the controls the field holds
 * @returns the field
 */
function field(kind: string, children: StubElement[] = []): StubElement {
  return new StubElement(
    "fieldset",
    { "data-question": "", "data-question-kind": kind },
    children,
  );
}

/**
 * builds a radio or checkbox
 * @param value the value the control carries
 * @param checked whether it starts checked
 * @param answer the `data-answer` ordinal a scale point carries
 * @returns the input
 */
function input(value: string, checked = false, answer?: string): StubElement {
  const element = new StubElement(
    "input",
    answer === undefined ? {} : { "data-answer": answer },
  );
  element.value = value;
  element.checked = checked;

  return element;
}

/**
 * builds a verdict button
 * @param verdict the verdict it carries
 * @param pressed whether it starts pressed
 * @returns the button
 */
function verdict(verdict: string, pressed = false): StubElement {
  return new StubElement("button", {
    "data-verdict": verdict,
    "aria-pressed": String(pressed),
  });
}

/**
 * builds a textarea holding text
 * @param value the text it holds
 * @returns the textarea
 */
function textarea(value = ""): StubElement {
  const element = new StubElement("textarea");
  element.value = value;

  return element;
}

describe("fn:readField", () => {
  it("should read a choice as the checked input's value", () => {
    expect(
      readField(field("choice", [input("a"), input("b", true)])),
    ).toStrictEqual({ kind: "choice", value: "b" });
  });

  it("should read a choice with nothing checked as unanswered", () => {
    expect(readField(field("choice", [input("a")]))).toStrictEqual({
      kind: "choice",
      value: "",
    });
  });

  it("should read a checklist as the whole set, not a scalar", () => {
    expect(
      readField(
        field("checklist", [input("a", true), input("b"), input("c", true)]),
      ),
    ).toStrictEqual({ kind: "checklist", values: ["a", "c"] });
  });

  it("should read a scale as the ordinal the markup pre-computed", () => {
    // the point's value is its wording; the ordinal is the real information
    expect(
      readField(
        field("scale", [input("Low", false, "1"), input("High", true, "5")]),
      ),
    ).toStrictEqual({ kind: "scale", value: "5" });
  });

  it("should read a decision as its verdict and its note separately", () => {
    expect(
      readField(
        field("decision", [
          verdict("approve"),
          verdict("change", true),
          textarea("hold the flag"),
        ]),
      ),
    ).toStrictEqual({ kind: "decision", verdict: "change", note: "hold the flag" });
  });

  it("should read an unmarked decision as an empty verdict", () => {
    expect(
      readField(field("decision", [verdict("approve"), textarea("")])),
    ).toStrictEqual({ kind: "decision", verdict: "", note: "" });
  });

  it("should fall through to the textarea for a note", () => {
    expect(readField(field("note", [textarea(" typed ")]))).toStrictEqual({
      kind: "note",
      value: " typed ",
    });
  });
});

describe("fn:answerText", () => {
  it("should join a checklist into one line", () => {
    expect(answerText({ kind: "checklist", values: ["a", "b"] })).toBe("a, b");
  });

  it("should read an empty checklist as unanswered", () => {
    expect(answerText({ kind: "checklist", values: [] })).toBe("");
  });

  it("should render a decision through its verdict", () => {
    expect(answerText({ kind: "decision", verdict: "approve", note: "" })).toBe(
      "Approve",
    );
    expect(answerText({ kind: "decision", verdict: "", note: "x" })).toBe("");
  });

  it("should trim a typed answer, so whitespace never counts as one", () => {
    expect(answerText({ kind: "note", value: "  \n " })).toBe("");
    expect(answerText({ kind: "note", value: " typed " })).toBe("typed");
  });
});

describe("fn:writeField", () => {
  it("should restore a choice by value", () => {
    const question = field("choice", [input("a"), input("b")]);

    writeField(question, { kind: "choice", value: "b" });

    expect(question.querySelectorAll("input").map(({ checked }) => checked))
      .toStrictEqual([false, true]);
  });

  it("should restore a scale by ordinal, not by wording", () => {
    const question = field("scale", [
      input("Low", false, "1"),
      input("High", false, "5"),
    ]);

    writeField(question, { kind: "scale", value: "5" });

    expect(question.querySelectorAll("input").map(({ checked }) => checked))
      .toStrictEqual([false, true]);
  });

  it("should clear every box a checklist no longer holds", () => {
    const question = field("checklist", [
      input("a", true),
      input("b"),
      input("c", true),
    ]);

    writeField(question, { kind: "checklist", values: ["b"] });

    expect(question.querySelectorAll("input").map(({ checked }) => checked))
      .toStrictEqual([false, true, false]);
  });

  it("should restore a decision's verdict, note, and revealed field together", () => {
    const question = field("decision", [
      verdict("approve", true),
      verdict("change"),
      new StubElement("div", { "data-verdict-note": "" }, [textarea()]),
    ]);

    writeField(question, {
      kind: "decision",
      verdict: "change",
      note: "hold the flag",
    });

    expect(
      question
        .querySelectorAll("[data-verdict]")
        .map((button) => button.attributes["aria-pressed"]),
    ).toStrictEqual(["false", "true"]);
    expect(question.querySelector("textarea")?.value).toBe("hold the flag");
    expect(question.querySelector("[data-verdict-note]")?.hidden).toBe(false);
  });

  it("should hide the note again when the verdict is not change", () => {
    const question = field("decision", [
      verdict("approve"),
      verdict("change"),
      new StubElement("div", { "data-verdict-note": "" }, [textarea("stale")]),
    ]);

    writeField(question, { kind: "decision", verdict: "approve", note: "" });

    expect(question.querySelector("[data-verdict-note]")?.hidden).toBe(true);
  });

  it("should check nothing when the saved answer is empty", () => {
    // the trap: an empty saved value matches an input whose own value is
    // empty, which would silently answer a question the reader left alone
    const question = field("choice", [input(""), input("b")]);

    writeField(question, { kind: "choice", value: "" });

    expect(question.querySelectorAll("input").map(({ checked }) => checked))
      .toStrictEqual([false, false]);
  });

  it("should ignore a saved answer whose kind no longer matches the field", () => {
    // the block was edited from a choice to a checklist after the save
    const question = field("checklist", [input("a"), input("b")]);

    writeField(question, { kind: "choice", value: "b" } as SavedAnswer);

    expect(question.querySelectorAll("input").map(({ checked }) => checked))
      .toStrictEqual([false, false]);
  });
});
