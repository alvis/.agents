import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installDrawer } from "./drawer.ts";

/** what the page reports as focused when the drawer opens */
let active: StubElement | null;
/** whether the reader currently has text selected */
let collapsed: boolean;
/** the document-level handlers the drawer registers, by event type */
let listening: Record<string, ((event: unknown) => void)[]>;
/** the panel `getElementById` hands back */
let known: Record<string, StubElement>;

beforeEach(() => {
  active = null;
  collapsed = true;
  listening = {};
  known = {};
  globalThis.document = {
    get activeElement() {
      return active;
    },
    getElementById: (id: string) => known[id] ?? null,
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listening[type] ??= []).push(handler);
    },
  } as unknown as Document;
  globalThis.window = {
    getSelection: () => ({ isCollapsed: collapsed }),
  } as unknown as Window & typeof globalThis;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { window?: Window }).window;
});

/** every part of the drawer a test needs to reach. */
interface Parts {
  /** the drawer root */
  root: StubElement;
  /** the collapsed bar, which is itself a pointer target */
  bar: StubElement;
  /** the button that owns the expanded state */
  toggle: StubElement;
  /** the word the bar shows for what a press will do */
  hint: StubElement;
  /** the panel the button controls */
  panel: StubElement;
  /** the first focusable thing inside the panel */
  link: StubElement;
}

/**
 * builds the drawer as the renderer emits it, before installation.
 *
 * the link carries `tabindex` as well as being an anchor because the stub
 * reads a comma group as one compound selector, and the runtime opens with
 * `"a,button,[tabindex]"`.
 * @returns the drawer's parts
 */
function parts(): Parts {
  const hint = new StubElement("span", { "data-drawer-hint": "" });
  const toggle = new StubElement(
    "button",
    { "data-drawer-toggle": "", "aria-controls": "drawer-panel" },
    [hint],
  );
  const bar = new StubElement("div", { "data-drawer-bar": "" }, [toggle]);
  const link = new StubElement("a", { href: "#top", tabindex: "0" });
  const panel = new StubElement("div", { id: "drawer-panel" }, [link]);
  const root = new StubElement("div", { "data-drawer": "" }, [bar, panel]);
  known["drawer-panel"] = panel;

  return { root, bar, toggle, hint, panel, link };
}

/**
 * sends a keystroke to the document, as the browser does
 * @param key the key pressed
 * @param target where the press landed
 */
function press(key: string, target: unknown = null): void {
  for (const handler of listening.keydown ?? []) handler({ key, target });
}

/** the three signals a collapsed drawer sets, read as one */
const SHUT = "open=false inert=true aria-hidden=true";
/** the same three, once the drawer is expanded */
const OPEN = "open=true inert=false aria-hidden=false";

/**
 * reads the drawer's state from every signal that carries it.
 *
 * the root's flag drives the CSS transition while the panel's two attributes
 * decide whether it can be reached; a test reading one of the three would pass
 * on a drawer that animated open but stayed off the tab order, or on one
 * reachable behind a panel with no height.
 * @param root the drawer root
 * @param panel the panel it governs
 * @returns the three signals, in one comparable string
 */
function state(root: StubElement, panel: StubElement): string {
  return [
    `open=${root.dataset.open}`,
    `inert=${panel.hasAttribute("inert")}`,
    `aria-hidden=${panel.getAttribute("aria-hidden")}`,
  ].join(" ");
}

describe("fn:installDrawer", () => {
  it("should ship collapsed, whatever the emitted markup said", () => {
    // the markup names no open state at all, so the collapsed drawer is the
    // runtime's doing rather than something it inherits and could skip
    const { root, toggle, panel, hint } = parts();

    installDrawer(root as unknown as HTMLElement);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(state(root, panel)).toBe(SHUT);
    expect(hint.textContent).toBe("Expand");
  });

  it("should open the panel when the button is pressed", () => {
    const { root, toggle, panel, hint } = parts();
    installDrawer(root as unknown as HTMLElement);

    toggle.dispatch("click");

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(state(root, panel)).toBe(OPEN);
    expect(hint.textContent).toBe("Collapse");
  });

  it("should move focus into the panel it just opened", () => {
    const { root, toggle, link } = parts();
    installDrawer(root as unknown as HTMLElement);

    toggle.dispatch("click");

    expect(link.focused).toBe(true);
    // DR3 put the panel's height on a transition, so focus arrives while the
    // sheet is still a sliver and the browser scrolls it to reveal a link that
    // is on its way into view regardless. Driven at 1440x900 the drawer opened
    // 42px down its own content, cutting the top off the first thing in it
    expect(link.focusScrolled).toBe(false);
  });

  it("should return focus to whatever opened it", () => {
    // collapsing leaves the reader wherever the panel put them otherwise, and
    // for a keyboard reader that is a focus stranded on a hidden element
    const { root, toggle } = parts();
    installDrawer(root as unknown as HTMLElement);
    active = new StubElement("button", { id: "elsewhere" });

    toggle.dispatch("click");
    toggle.dispatch("click");

    expect(active.focused).toBe(true);
  });

  it("should treat the whole collapsed bar as the pointer target", () => {
    const { root, bar, toggle, panel } = parts();
    installDrawer(root as unknown as HTMLElement);

    bar.dispatch("click", { target: new StubElement("span") });

    expect(state(root, panel)).toBe(OPEN);
    expect(toggle.focused).toBe(true);
  });

  it("should leave a press on a control inside the bar to that control", () => {
    // the button's own handler already toggles, so counting the bar's handler
    // too would open and immediately close on a single press
    const { root, bar, toggle, panel } = parts();
    installDrawer(root as unknown as HTMLElement);

    bar.dispatch("click", { target: toggle });

    expect(state(root, panel)).toBe(SHUT);
  });

  it("should not read the end of a text selection as a press", () => {
    const { root, bar, panel } = parts();
    installDrawer(root as unknown as HTMLElement);
    collapsed = false;

    bar.dispatch("click", { target: new StubElement("span") });

    expect(state(root, panel)).toBe(SHUT);
  });

  it("should collapse on Escape", () => {
    const { root, toggle, panel } = parts();
    installDrawer(root as unknown as HTMLElement);
    toggle.dispatch("click");

    press("Escape");

    expect(state(root, panel)).toBe(SHUT);
    expect(toggle.focused).toBe(true);
  });

  it("should leave Escape inside an open dialog to that dialog", () => {
    // both dismiss on the same key, and one press must not both close the
    // dialog and collapse the drawer it was opened from
    const { root, toggle, panel } = parts();
    installDrawer(root as unknown as HTMLElement);
    toggle.dispatch("click");
    const field = new StubElement("input");
    new StubElement("dialog", { open: "" }, [field]);

    press("Escape", field);

    expect(state(root, panel)).toBe(OPEN);
  });

  it("should ignore every key but Escape", () => {
    const { root, toggle, panel } = parts();
    installDrawer(root as unknown as HTMLElement);
    toggle.dispatch("click");

    press("Enter");

    expect(state(root, panel)).toBe(OPEN);
  });
});
