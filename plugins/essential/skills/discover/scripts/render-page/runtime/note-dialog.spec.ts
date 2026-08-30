import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installNoteDialog } from "./note-dialog.ts";

import type { NoteRequest, NoteResult } from "./note-dialog.ts";

/** the note field, with the caret surface the runtime moves. */
class StubField extends StubElement {
  /** where the caret was last put, as `[start, end]` */
  caret: [number, number] | null = null;

  /** builds the field as the renderer emits it. */
  constructor() {
    super("textarea", { "data-note-text": "" });
  }

  /**
   * puts the caret across a span of the field's text
   * @param start where the span begins
   * @param end where it ends
   */
  setSelectionRange(start: number, end: number): void {
    this.caret = [start, end];
  }
}

/** every part of the dialog a test needs to reach. */
interface Parts {
  /** the dialog element */
  dialog: StubElement;
  /** the heading */
  title: StubElement;
  /** the passage the note is about */
  quote: StubElement;
  /** the field the note is written in */
  text: StubField;
  /** the control that removes the note */
  remove: StubElement;
  /** the control that abandons the edit */
  cancel: StubElement;
  /** the form a save submits */
  form: StubElement;
}

/**
 * builds the note dialog as the renderer emits it
 * @returns the dialog's parts
 */
function parts(): Parts {
  const title = new StubElement("h2", { "data-note-title": "" });
  const quote = new StubElement("q", { "data-note-quote": "" });
  const text = new StubField();
  const remove = new StubElement("button", { "data-note-remove": "" });
  const cancel = new StubElement("button", { "data-note-cancel": "" });
  const form = new StubElement("form", { "data-note-form": "" }, [
    text,
    remove,
    cancel,
  ]);
  const dialog = new StubElement("dialog", { "data-note-dialog": "" }, [
    title,
    quote,
    form,
  ]);

  return { dialog, title, quote, text, remove, cancel, form };
}

/**
 * builds a request to open the dialog with
 * @param change what the request says beyond the defaults
 * @returns the request
 */
function request(change: Partial<NoteRequest> = {}): NoteRequest {
  return {
    title: "Note on Risks",
    quote: "a passage",
    note: "",
    removable: false,
    ...change,
  };
}

/**
 * installs the dialog and opens it
 * @param change what the request says beyond the defaults
 * @returns the dialog's parts and what the reader's answer resolves to
 */
function open(change: Partial<NoteRequest> = {}): Parts & {
  /** what the reader did, once they have done it */
  answer: Promise<NoteResult | null>;
} {
  const held = parts();
  const ask = installNoteDialog(held.dialog as unknown as HTMLDialogElement);

  return { ...held, answer: ask(request(change)) };
}

/**
 * submits the form, as pressing Save does
 * @param form the form to submit
 * @returns whether the browser's own submit was taken back
 */
function submit(form: StubElement): boolean {
  let prevented = false;
  form.dispatch("submit", { preventDefault: () => (prevented = true) });

  return prevented;
}

describe("fn:installNoteDialog", () => {
  it("should open modally, for the platform's own focus trap", () => {
    // a native modal is what gives the trap, the backdrop and the Escape key
    // without any of them being reimplemented, and its trap is the one screen
    // readers already understand
    const { dialog } = open();

    expect(dialog.open).toBe(true);
  });

  it("should say what the note is on", () => {
    const { title } = open({ title: "Note on Risks" });

    expect(title.textContent).toBe("Note on Risks");
  });

  it("should show the passage the note is about", () => {
    const { quote } = open({ quote: "a passage" });

    expect(quote.textContent).toBe("a passage");
    expect(quote.hidden).toBe(false);
  });

  it("should show no passage for a whole-section note", () => {
    const { quote } = open({ quote: null });

    expect(quote.hidden).toBe(true);
    expect(quote.textContent).toBe("");
  });

  it("should open on what the note already says", () => {
    const { text } = open({ note: "worth watching" });

    expect(text.value).toBe("worth watching");
  });

  it("should put the caret at the end of an existing note", () => {
    // at the start, editing would continue backwards into the note rather
    // than carrying on from it
    const { text } = open({ note: "worth watching" });

    expect(text.focused).toBe(true);
    expect(text.caret).toStrictEqual(["worth watching".length, "worth watching".length]);
  });

  it("should offer removal only for a note that already exists", () => {
    expect(open({ removable: true }).remove.hidden).toBe(false);
    expect(open({ removable: false }).remove.hidden).toBe(true);
  });

  it("should resolve with what the reader wrote", async () => {
    const { text, form, answer } = open();
    text.value = "worth watching";

    submit(form);

    await expect(answer).resolves.toStrictEqual({
      note: "worth watching",
      removed: false,
    });
  });

  it("should take the submit back from the browser", () => {
    // the form has nowhere to go, and letting it submit would navigate away
    // from the board the note belongs to
    const { form } = open();

    expect(submit(form)).toBe(true);
  });

  it("should close on a save", async () => {
    const { dialog, form, answer } = open();

    submit(form);
    await answer;

    expect(dialog.open).toBe(false);
  });

  it("should resolve with nothing when the reader cancels", async () => {
    const { cancel, answer } = open();

    cancel.dispatch("click");

    await expect(answer).resolves.toBeNull();
  });

  it("should resolve as a removal when the reader removes the note", async () => {
    const { text, remove, answer } = open({ note: "worth watching", removable: true });
    text.value = "worth watching";

    remove.dispatch("click");

    await expect(answer).resolves.toStrictEqual({
      note: "worth watching",
      removed: true,
    });
  });

  it("should settle a dialog dismissed without either control", async () => {
    // Escape and the backdrop close it without passing through Cancel, and a
    // request left unsettled would hang every later open
    const { dialog, answer } = open();

    dialog.close();

    await expect(answer).resolves.toBeNull();
  });

  it("should settle the previous request when opened again", async () => {
    const held = parts();
    const ask = installNoteDialog(held.dialog as unknown as HTMLDialogElement);
    const first = ask(request());

    ask(request({ title: "Note on Intro" }));

    await expect(first).resolves.toBeNull();
    expect(held.title.textContent).toBe("Note on Intro");
  });

  it("should settle a request exactly once", async () => {
    // saving closes the dialog, and the close fires the same settler: without
    // the guard the save's own result would be overwritten by a null
    const { text, form, answer } = open();
    text.value = "worth watching";

    submit(form);

    await expect(answer).resolves.toMatchObject({ note: "worth watching" });
  });
});
