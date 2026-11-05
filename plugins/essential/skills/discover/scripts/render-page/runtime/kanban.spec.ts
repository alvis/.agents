import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installKanbanDetail } from "./kanban.ts";

/** whether the reader has text selected, as the page's selection reports it */
let selecting: boolean;

beforeEach(() => {
  selecting = false;
  globalThis.document = {
    getSelection: () => ({ isCollapsed: !selecting }),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * builds one detailed card as the renderer emits it, a link on its face
 * @returns the card, its face text and link, the control that opens it, and its dialog
 */
function card(): {
  root: StubElement;
  item: StubElement;
  text: StubElement;
  link: StubElement;
  open: StubElement;
  dialog: StubElement;
} {
  const text = new StubElement("span", { class: "mono" });
  const link = new StubElement("a", { href: "#x" });
  const open = new StubElement("button", { class: "kanban-open", "data-kanban-open": "", hidden: "" });
  open.hidden = true;
  const dialog = new StubElement("dialog", { "data-kanban-dialog": "" }, [
    new StubElement("div", { class: "kanban-dialog-body" }),
  ]);
  const item = new StubElement("li", { class: "kanban-card" }, [text, link, open, dialog]);
  const root = new StubElement("ul", { class: "kanban" }, [item]);

  return { root, item, text, link, open, dialog };
}

/**
 * wires a card's runtime and returns its parts
 * @returns the card, the control that opens it, and its dialog
 */
function installed(): ReturnType<typeof card> {
  const parts = card();
  installKanbanDetail(parts.root as unknown as ParentNode);

  return parts;
}

describe("fn:installKanbanDetail", () => {
  it("should reveal the control that opens a card", () => {
    const { open } = installed();

    expect(open.hidden).toBe(false);
  });

  it("should open the card's own dialog modally", () => {
    const { open, dialog } = installed();

    open.dispatch("click");

    expect(dialog.open).toBe(true);
  });

  it("should return focus to the card once the dialog closes", () => {
    // Escape, the close control and the backdrop all raise the same event
    const { open, dialog } = installed();
    open.dispatch("click");

    dialog.close();

    expect(open.focused).toBe(true);
  });

  it("should close when the reader clicks the backdrop", () => {
    // a click on the backdrop lands on the dialog itself, never on its body
    const { open, dialog } = installed();
    open.dispatch("click");

    dialog.dispatch("click", { target: dialog });

    expect(dialog.open).toBe(false);
  });

  it("should stay open when the reader clicks inside it", () => {
    const { open, dialog } = installed();
    open.dispatch("click");

    dialog.dispatch("click", { target: dialog.children[0] });

    expect(dialog.open).toBe(true);
  });

  it("should open when the reader clicks anywhere on the card's face", () => {
    const { item, text, dialog } = installed();

    item.dispatch("click", { target: text });

    expect(dialog.open).toBe(true);
  });

  it("should let a link on the card's face answer its own click", () => {
    const { item, link, dialog } = installed();

    item.dispatch("click", { target: link });

    expect(dialog.open).toBe(false);
  });

  it("should not open when the click ends a text selection", () => {
    // the board's notes quote selected text, so selecting must stay possible
    const { item, text, dialog } = installed();
    selecting = true;

    item.dispatch("click", { target: text });

    expect(dialog.open).toBe(false);
  });

  it("should not reopen from a click inside the open dialog", () => {
    // the dialog sits inside the card, so its clicks reach the card too
    const { item, open, dialog } = installed();
    open.dispatch("click");
    dialog.close();
    open.focused = false;

    item.dispatch("click", { target: dialog.children[0] });

    expect(dialog.open).toBe(false);
  });

  it("should leave a card with no dialog alone", () => {
    const open = new StubElement("button", { "data-kanban-open": "", hidden: "" });
    open.hidden = true;
    const root = new StubElement("ul", {}, [new StubElement("li", { class: "kanban-card" }, [open])]);

    installKanbanDetail(root as unknown as ParentNode);

    expect(open.hidden).toBe(true);
  });
});
