import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installReplyDialog } from "./reply-dialog.ts";

/** whatever the page reports as focused when the reply is opened */
let active: StubElement | null;

beforeEach(() => {
  active = null;
  globalThis.document = {
    get activeElement() {
      return active;
    },
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * builds the reply dialog as the renderer emits it, already open
 * @returns the dialog and the control that opens it
 */
function parts(): { dialog: StubElement; open: StubElement } {
  return {
    dialog: new StubElement("dialog", { "data-reply-dialog": "", open: "" }, [
      new StubElement("pre", { "data-reply": "" }),
    ]),
    open: new StubElement("button", { "data-reply-open": "", hidden: "" }),
  };
}

describe("fn:installReplyDialog", () => {
  it("should close the panel it was emitted as, so the reply becomes a modal", () => {
    const { dialog, open } = parts();

    installReplyDialog(dialog as unknown as HTMLDialogElement, open);

    expect(dialog.open).toBe(false);
  });

  it("should reveal the control that opens it", () => {
    // the control ships hidden: without a runtime there is no modal to open
    const { dialog, open } = parts();

    installReplyDialog(dialog as unknown as HTMLDialogElement, open);

    expect(open.hidden).toBe(false);
  });

  it("should open the reply modally, for the platform's own focus trap", () => {
    const { dialog, open } = parts();
    installReplyDialog(dialog as unknown as HTMLDialogElement, open);

    open.dispatch("click");

    expect(dialog.open).toBe(true);
  });

  it("should return focus to wherever the reader opened it from", () => {
    const { dialog, open } = parts();
    installReplyDialog(dialog as unknown as HTMLDialogElement, open);
    active = open;

    open.dispatch("click");
    dialog.close();

    expect(open.focused).toBe(true);
  });

  it("should return focus once and not to a stale opener", () => {
    // Escape, the close control and the backdrop all raise the same event, and
    // a second one must not pull the reader back out of wherever they went
    const { dialog, open } = parts();
    installReplyDialog(dialog as unknown as HTMLDialogElement, open);
    active = open;
    open.dispatch("click");
    dialog.close();
    open.focused = false;

    dialog.dispatch("close");

    expect(open.focused).toBe(false);
  });

  it("should survive an open with nothing focused", () => {
    const { dialog, open } = parts();
    installReplyDialog(dialog as unknown as HTMLDialogElement, open);

    open.dispatch("click");

    expect(() => dialog.close()).not.toThrow();
  });
});
