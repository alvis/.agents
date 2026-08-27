import { isInDialog } from "./selection.ts";

/** the drawer's expand/collapse control and the elements it governs. */
export interface Drawer {
  /** the drawer root */
  root: HTMLElement;
  /** the button that owns the expanded state */
  toggle: HTMLElement;
  /** the panel the button controls */
  panel: HTMLElement;
  /** sets the expanded state, moving focus with it */
  setExpanded(next: boolean): void;
}

/**
 * wires the bottom drawer: its toggle, its bar, and the Escape key
 * @param root the drawer's `[data-drawer]` element
 * @returns the drawer, already collapsed
 */
export function installDrawer(root: HTMLElement): Drawer {
  const toggle = root.querySelector<HTMLElement>("[data-drawer-toggle]")!;
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  const hint = root.querySelector<HTMLElement>("[data-drawer-hint]")!;
  let opener: HTMLElement | null = null;

  const setExpanded = (next: boolean): void => {
    toggle.setAttribute("aria-expanded", String(next));
    // the open state rides on the root because the transition is a CSS one:
    // the panel's grid row grows from nothing to its content height, and an
    // element removed from layout has no height to grow from. The two
    // attributes below do what removing it did for a closed panel — out of the
    // tab order, off the accessibility tree — while leaving the box in place
    // for the animation to run on. Written as attributes rather than the
    // matching properties, so a query and a test read the same element state
    root.dataset.open = String(next);
    if (next) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
    panel.setAttribute("aria-hidden", String(!next));
    hint.textContent = next ? "Collapse" : "Expand";
    if (next) {
      opener = document.activeElement as HTMLElement | null;
      // focus lands while the panel is still growing out of a zero-height row,
      // so the browser scrolls the sheet to reveal a target that is about to
      // be in view anyway, and the drawer settles 40-odd pixels down its own
      // content. The first focusable sits at the top of the sheet, so there is
      // nothing the scroll was needed for
      panel
        .querySelector<HTMLElement>("a,button,[tabindex]")
        ?.focus({ preventScroll: true });
    } else if (opener) {
      opener.focus();
      opener = null;
    }
  };

  const expanded = (): boolean =>
    toggle.getAttribute("aria-expanded") === "true";

  toggle.addEventListener("click", () => setExpanded(!expanded()));

  // the whole collapsed bar is the pointer target, not just the button inside
  // it. Purely additive: the button stays the semantic control, so keyboard and
  // screen-reader paths are untouched and the bar gets no role or tabindex.
  // Bound to the bar alone, never the panel, or reading the expanded drawer
  // would collapse it; and a click that merely ends a text selection is not a
  // press, so it must not toggle either.
  root
    .querySelector<HTMLElement>("[data-drawer-bar]")!
    .addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button,a,input,textarea,select")) return;

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      setExpanded(!expanded());
      toggle.focus();
    });

  document.addEventListener("keydown", (event) => {
    // a dialog dismisses on the same key, and one press should not both close
    // it and collapse what it was opened from
    if (event.key !== "Escape" || !expanded() || isInDialog(event.target)) return;

    setExpanded(false);
    toggle.focus();
  });

  setExpanded(false);

  return { root, toggle, panel, setExpanded };
}
