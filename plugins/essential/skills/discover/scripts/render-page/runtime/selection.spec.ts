import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import {
  installSelection,
  isInDialog,
  isTyping,
  placePill,
  readSelection,
} from "./selection.ts";

import type { Picked } from "./selection.ts";

/** the pill the runtime builds, with the layout surface it reads. */
class StubPill extends StubElement {
  /** the inline style the pill is positioned through */
  readonly style: Record<string, string> = {};
  /** how wide the pill measures once it is no longer hidden */
  offsetWidth = 120;
  /** the button type, which the runtime sets so the pill submits nothing */
  type = "";
  /** the class the stylesheet hangs on */
  className = "";

  /** builds the pill as `createElement("button")` would. */
  constructor() {
    super("button");
  }
}

/** what `window.getSelection()` should report */
let picked: unknown;
/** the pill the run created */
let pill: StubPill;
/** the document-level handlers, by event type */
let listening: Record<string, ((event: unknown) => void)[]>;
/** the deferred refreshes `setTimeout` collected */
let deferred: (() => void)[];
/** how wide the viewport is */
let clientWidth: number;

beforeEach(() => {
  picked = null;
  pill = new StubPill();
  listening = {};
  deferred = [];
  clientWidth = 400;
  globalThis.Node = class NodeStub {
    static readonly ELEMENT_NODE = 1;
  } as unknown as typeof Node;
  globalThis.document = {
    createElement: () => pill,
    body: { append: () => undefined },
    get documentElement() {
      return { clientWidth };
    },
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listening[type] ??= []).push(handler);
    },
  } as unknown as Document;
  globalThis.window = {
    getSelection: () => picked,
    setTimeout: (run: () => void) => deferred.push(run),
    scrollX: 0,
    scrollY: 0,
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window }).window;
  delete (globalThis as { Node?: typeof Node }).Node;
});

/**
 * reports a selection over an element, as the browser would
 * @param text what the reader selected
 * @param node the range's common ancestor
 * @param rect where the selection sits
 */
function select(
  text: string,
  node: unknown,
  rect: Partial<DOMRect> = { left: 100, bottom: 200 },
): void {
  picked = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => text,
    getRangeAt: () => ({
      commonAncestorContainer: node,
      getBoundingClientRect: () => rect,
    }),
  };
}

/**
 * builds a passage inside a section the runtime can name
 * @param id the section's id
 * @returns the passage element, already inside its section
 */
function passage(id = "intro"): StubElement {
  const held = new StubElement("p");
  new StubElement("section", { "data-section": "", "data-section-id": id }, [
    held,
  ]);

  return held;
}

/**
 * sends a keystroke to the document
 * @param key the key pressed
 * @param event whatever else the event carries
 */
function press(key: string, event: Record<string, unknown> = {}): void {
  for (const handler of listening.keydown ?? [])
    handler({ key, target: null, preventDefault: () => undefined, ...event });
}

describe("fn:isTyping", () => {
  it.each(["input", "textarea", "select"])(
    "should stand a shortcut aside inside a %s",
    (tag) => {
      expect(isTyping(new StubElement(tag) as unknown as EventTarget)).toBe(true);
    },
  );

  it("should stand aside where the reader edits the element itself", () => {
    const held = new StubElement("div");
    held.isContentEditable = true;

    expect(isTyping(held as unknown as EventTarget)).toBe(true);
  });

  it("should let a shortcut through on an ordinary element", () => {
    expect(isTyping(new StubElement("p") as unknown as EventTarget)).toBe(false);
  });

  it("should let a shortcut through where the target has no tag at all", () => {
    // the guard reads the tag rather than testing `instanceof`, because the
    // constructor is a global a framed document does not carry; a guard that
    // threw here would let every shortcut fire mid-word instead
    expect(isTyping({} as EventTarget)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("fn:isInDialog", () => {
  it("should hold inside a dialog that is open", () => {
    // a modal traps focus but not keystrokes, so a document shortcut would
    // otherwise answer a board the reader cannot currently see
    const field = new StubElement("p");
    new StubElement("dialog", { open: "" }, [field]);

    expect(isInDialog(field as unknown as EventTarget)).toBe(true);
  });

  it("should not hold inside a dialog that is closed", () => {
    const field = new StubElement("p");
    new StubElement("dialog", {}, [field]);

    expect(isInDialog(field as unknown as EventTarget)).toBe(false);
  });

  it("should not hold where the target cannot be walked up from", () => {
    expect(isInDialog({} as EventTarget)).toBe(false);
    expect(isInDialog(null)).toBe(false);
  });
});

describe("fn:readSelection", () => {
  it("should read the passage and the section it sits in", () => {
    select("a quote", passage("risks"));

    expect(readSelection()).toMatchObject({
      sectionId: "risks",
      quote: "a quote",
    });
  });

  it("should resolve the section from a text node's parent", () => {
    // a selection inside one paragraph has a text node as its common
    // ancestor, which is the ordinary case rather than the exception
    select("a quote", { nodeType: 3, parentElement: passage("risks") });

    expect(readSelection()?.sectionId).toBe("risks");
  });

  it("should collapse the whitespace the reader dragged across", () => {
    select("a  \n  quote", passage());

    expect(readSelection()?.quote).toBe("a quote");
  });

  it("should refuse a selection that is only whitespace", () => {
    select("   \n ", passage());

    expect(readSelection()).toBeNull();
  });

  it.each([
    ["nothing is selected", null],
    ["the selection is empty", { isCollapsed: true, rangeCount: 1 }],
    ["the selection has no range", { isCollapsed: false, rangeCount: 0 }],
  ])("should refuse where %s", (_, reported) => {
    picked = reported;

    expect(readSelection()).toBeNull();
  });

  it("should refuse a selection the reader is editing rather than reading", () => {
    // selecting inside the note dialog is how a reader revises what they
    // wrote; offering to note it would nest a note in a note
    const field = new StubElement("p");
    new StubElement("div", { "data-note-dialog": "" }, [field]);

    select("a quote", field);

    expect(readSelection()).toBeNull();
  });

  it("should refuse a selection outside any section", () => {
    select("a quote", new StubElement("p"));

    expect(readSelection()).toBeNull();
  });
});

describe("fn:placePill", () => {
  it("should unhide the pill before it is measured", () => {
    // `offsetWidth` is zero while hidden, so a selection near the right edge
    // would push the pill off-screen and scroll the whole document sideways
    pill.hidden = true;

    placePill(pill as unknown as HTMLElement, { left: 100, bottom: 200 } as DOMRect);

    expect(pill.hidden).toBe(false);
  });

  it("should sit under the selection", () => {
    placePill(pill as unknown as HTMLElement, { left: 100, bottom: 200 } as DOMRect);

    expect(pill.style.top).toBe("208px");
    expect(pill.style.left).toBe("100px");
  });

  it("should hold the pill clear of the right edge", () => {
    placePill(pill as unknown as HTMLElement, { left: 380, bottom: 200 } as DOMRect);

    expect(pill.style.left).toBe("272px");
  });

  it("should hold the pill clear of the left edge", () => {
    placePill(pill as unknown as HTMLElement, { left: -50, bottom: 200 } as DOMRect);

    expect(pill.style.left).toBe("8px");
  });

  it("should keep the margin where the pill cannot fit at all", () => {
    clientWidth = 40;

    placePill(pill as unknown as HTMLElement, { left: 30, bottom: 200 } as DOMRect);

    expect(pill.style.left).toBe("8px");
  });

  it("should place the pill in document coordinates, not viewport ones", () => {
    (globalThis.window as unknown as { scrollX: number; scrollY: number }).scrollX = 15;
    (globalThis.window as unknown as { scrollX: number; scrollY: number }).scrollY = 500;

    placePill(pill as unknown as HTMLElement, { left: 100, bottom: 200 } as DOMRect);

    expect(pill.style.top).toBe("708px");
    expect(pill.style.left).toBe("115px");
  });
});

describe("fn:installSelection", () => {
  /**
   * installs the watcher and collects what it offers to note
   * @returns the passages noted and the reader for the pending one
   */
  function watch(): { noted: Picked[]; pending: () => Picked | null } {
    const noted: Picked[] = [];

    return { noted, pending: installSelection((found) => noted.push(found)) };
  }

  /** lets the deferred refresh run, as the zero timer does. */
  function settle(): void {
    for (const handler of listening.selectionchange ?? []) handler({});
    for (const run of deferred.splice(0)) run();
  }

  it("should ship the pill hidden, with nothing selected to note", () => {
    watch();

    expect(pill.hidden).toBe(true);
  });

  it("should offer the pill once a passage is selected", () => {
    watch();
    select("a quote", passage());

    settle();

    expect(pill.hidden).toBe(false);
  });

  it("should withdraw the offer when the selection goes", () => {
    watch();
    select("a quote", passage());
    settle();
    picked = null;

    settle();

    expect(pill.hidden).toBe(true);
  });

  it("should defer the read so the selection has settled", () => {
    // by a timer rather than a frame: a frame callback is not delivered in the
    // automation this project verifies with (R-37)
    watch();
    select("a quote", passage());

    for (const handler of listening.selectionchange ?? []) handler({});

    expect(pill.hidden).toBe(true);
  });

  it("should hold the selection against the press that collapses it", () => {
    // pressing a button collapses the selection before the click arrives,
    // which would take the quote with it
    watch();
    let prevented = false;

    pill.dispatch("mousedown", { preventDefault: () => (prevented = true) });

    expect(prevented).toBe(true);
  });

  it("should note the selected passage when the pill is pressed", () => {
    const { noted } = watch();
    select("a quote", passage("risks"));
    settle();

    pill.dispatch("click");

    expect(noted).toMatchObject([{ sectionId: "risks", quote: "a quote" }]);
  });

  it("should do nothing when the pill is pressed with nothing selected", () => {
    const { noted } = watch();

    pill.dispatch("click");

    expect(noted).toStrictEqual([]);
  });

  it.each(["n", "N"])("should note the passage on %s", (key) => {
    const { noted } = watch();
    select("a quote", passage());
    settle();

    press(key);

    expect(noted).toHaveLength(1);
  });

  it("should take the key back from the browser, so it types nothing", () => {
    watch();
    select("a quote", passage());
    settle();
    let prevented = false;

    press("n", { preventDefault: () => (prevented = true) });

    expect(prevented).toBe(true);
  });

  it.each(["metaKey", "ctrlKey", "altKey"])(
    "should leave %s+n to the browser",
    (modifier) => {
      const { noted } = watch();
      select("a quote", passage());
      settle();

      press("n", { [modifier]: true });

      expect(noted).toStrictEqual([]);
    },
  );

  it("should ignore the key while the reader is typing", () => {
    const { noted } = watch();
    select("a quote", passage());
    settle();

    press("n", { target: new StubElement("textarea") });

    expect(noted).toStrictEqual([]);
  });

  it("should ignore the key inside an open dialog", () => {
    const { noted } = watch();
    select("a quote", passage());
    settle();
    const field = new StubElement("p");
    new StubElement("dialog", { open: "" }, [field]);

    press("n", { target: field });

    expect(noted).toStrictEqual([]);
  });

  it("should ignore the key with nothing selected", () => {
    const { noted } = watch();

    press("n");

    expect(noted).toStrictEqual([]);
  });

  it("should report the passage currently selected", () => {
    // the section controls need this, so a press notes the selection rather
    // than the whole section
    const { pending } = watch();
    select("a quote", passage("risks"));
    settle();

    expect(pending()).toMatchObject({ sectionId: "risks" });
  });
});
