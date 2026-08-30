import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installCopy } from "./copy.ts";

/** the throwaway field the fallback copies through. */
class StubField {
  /** the text the field holds */
  value = "";
  /** whether the field refuses typing */
  readOnly = false;
  /** whether the field's own text is selected */
  selected = false;
  /** whether the field is still in the document */
  attached = false;
  /** the inline style, which is what moves the field off-screen */
  readonly style = { cssText: "" };

  /** selects the field's text, as the DOM call does. */
  select(): void {
    this.selected = true;
  }

  /** takes the field out of the document, as the DOM call does. */
  remove(): void {
    this.attached = false;
  }
}

/** every field the run created, in creation order */
let fields: StubField[];
/** what `document.execCommand("copy")` should do */
let command: () => boolean;
/** the pending report timer, so a test can run it on demand */
let expire: (() => void) | null;
/** what the async clipboard should do, or null where it is absent */
let clipboard: { writeText(text: string): Promise<void> } | null;

beforeEach(() => {
  fields = [];
  command = () => true;
  expire = null;
  clipboard = { writeText: () => Promise.resolve() };
  globalThis.document = {
    createElement: () => {
      const field = new StubField();
      fields.push(field);

      return field;
    },
    body: {
      append: (field: StubField) => {
        field.attached = true;
      },
    },
    execCommand: () => command(),
  } as unknown as Document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    get: () => (clipboard ? { clipboard } : {}),
  });
  globalThis.setTimeout = ((run: () => void) => {
    expire = run;

    return 0;
  }) as unknown as typeof setTimeout;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/** the control and the reply it copies. */
interface Parts {
  /** the copy control in the collapsed bar */
  button: StubElement;
  /** the span the outcome is reported through */
  status: StubElement;
  /** the element holding the text to copy */
  reply: StubElement;
}

/**
 * builds the copy control as the renderer emits it
 * @returns the control, its status span, and the reply
 */
function parts(): Parts {
  const status = new StubElement("span", { "data-copy-status": "" });
  const button = new StubElement("button", { "data-copy": "" }, [status]);
  const reply = new StubElement("pre", { "data-reply": "" });
  reply.textContent = "the reply";

  return { button, status, reply };
}

/**
 * presses the control and lets the clipboard promise settle
 * @param button the control to press
 */
async function pressCopy(button: StubElement): Promise<void> {
  button.dispatch("click");
  await Promise.resolve();
  await Promise.resolve();
}

describe("fn:installCopy", () => {
  it("should put the reply on the clipboard", async () => {
    const { button, reply } = parts();
    const written: string[] = [];
    clipboard = {
      writeText: (text) => {
        written.push(text);

        return Promise.resolve();
      },
    };
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(written).toStrictEqual(["the reply"]);
  });

  it("should report the outcome without touching the control's own name", async () => {
    // the control is a glyph, so its accessible name has to keep saying what
    // pressing it does while the tick says what pressing it did
    const { button, status, reply } = parts();
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(status.textContent).toBe("Copied");
    expect(button.dataset.copyState).toBe("copied");
  });

  it("should return the control to its resting state once the report expires", async () => {
    const { button, status, reply } = parts();
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);
    await pressCopy(button);

    expire?.();

    expect(status.textContent).toBe("");
    expect(button.dataset.copyState).toBeUndefined();
  });

  it("should fall back where the async clipboard is absent entirely", async () => {
    // `file://` has no `navigator.clipboard`, and reading `.writeText` off
    // undefined throws before any rejection handler could run
    const { button, status, reply } = parts();
    clipboard = null;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(status.textContent).toBe("Copied");
    expect(fields[0]?.value).toBe("the reply");
  });

  it("should fall back where the async clipboard refuses", async () => {
    const { button, status, reply } = parts();
    clipboard = { writeText: () => Promise.reject(new Error("denied")) };
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(status.textContent).toBe("Copied");
  });

  it("should copy through a field placed off-screen rather than the reply itself", async () => {
    // the control sits in the collapsed bar, so the reply may be
    // `display:none` — and a range over a hidden element selects nothing,
    // which would report a copy that never happened
    const { button, reply } = parts();
    clipboard = null;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(fields[0]?.style.cssText).toContain("position:fixed");
    expect(fields[0]?.selected).toBe(true);
    expect(fields[0]?.readOnly).toBe(true);
  });

  it("should name the shortcut when the field copy fails too", async () => {
    const { button, status, reply } = parts();
    clipboard = null;
    command = () => false;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(status.textContent).toBe("Press ⌘C to copy");
    expect(button.dataset.copyState).toBe("manual");
  });

  it("should leave the failed copy's field selected, so the named keys have something to act on", async () => {
    const { button, reply } = parts();
    clipboard = null;
    command = () => false;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(fields[0]?.attached).toBe(true);
  });

  it("should take the leftover field away when the message it belongs to goes", async () => {
    const { button, reply } = parts();
    clipboard = null;
    command = () => false;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);
    await pressCopy(button);

    expire?.();

    expect(fields[0]?.attached).toBe(false);
  });

  it("should read a throwing execCommand as a failed copy, not a crash", async () => {
    const { button, status, reply } = parts();
    clipboard = null;
    command = () => {
      throw new Error("unsupported");
    };
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(status.textContent).toBe("Press ⌘C to copy");
  });

  it("should take the field away as soon as the copy succeeds", async () => {
    const { button, reply } = parts();
    clipboard = null;
    installCopy(button as unknown as HTMLElement, reply as unknown as HTMLElement);

    await pressCopy(button);

    expect(fields[0]?.attached).toBe(false);
  });
});
