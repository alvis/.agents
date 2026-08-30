import type { Store } from "./store.ts";

/** the colour scheme a reader can choose between. */
export type Scheme = "auto" | "light" | "dark";

/** the cycle the control walks, in order. */
export const SCHEMES: readonly Scheme[] = ["auto", "light", "dark"];

/** what the control shows for each scheme. */
export const SCHEME_LABEL: Record<Scheme, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/**
 * where the choice is kept.
 *
 * deliberately not keyed by page: a reader who picks dark on one board wants
 * dark on its companions too, so this is the one preference that crosses them.
 */
export const SCHEME_KEY = "essential.discover.scheme.v1";

/**
 * reads the saved scheme, treating anything unrecognised as no choice at all
 * @param store where the choice is kept
 * @returns the saved scheme, or `auto`
 */
export function readScheme(store: Store): Scheme {
  const saved = store.getItem(SCHEME_KEY);

  return SCHEMES.find((scheme) => scheme === saved) ?? "auto";
}

/**
 * applies a scheme to the document
 * @param root the `<html>` element the tokens hang off
 * @param scheme the scheme to show
 */
export function applyScheme(root: HTMLElement, scheme: Scheme): void {
  if (scheme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", scheme);
}

/**
 * gives the scheme that follows another in the cycle
 * @param scheme the scheme in force
 * @returns the next one round, wrapping back to `auto`
 */
export function nextScheme(scheme: Scheme): Scheme {
  return SCHEMES[(SCHEMES.indexOf(scheme) + 1) % SCHEMES.length];
}

/**
 * wires the scheme control, which cycles rather than toggles because `auto` is
 * a real third state and dropping it would strand a reader whose system already
 * switches on its own
 * @param button the control
 * @param root the `<html>` element the tokens hang off
 * @param store where the choice is kept
 */
export function installScheme(
  button: HTMLElement,
  root: HTMLElement,
  store: Store,
): void {
  const state = button.querySelector<HTMLElement>("[data-scheme-state]")!;

  const show = (scheme: Scheme): void => {
    // the label is what the button announces; the attribute is what picks its
    // icon. Both move together, so the glyph can never disagree with the name.
    state.textContent = SCHEME_LABEL[scheme];
    button.setAttribute("data-scheme", scheme);
    applyScheme(root, scheme);
  };

  show(readScheme(store));

  button.addEventListener("click", () => {
    const scheme = nextScheme(readScheme(store));
    store.setItem(SCHEME_KEY, scheme);
    show(scheme);
  });
}
