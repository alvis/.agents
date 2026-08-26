import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import {
  applyScheme,
  installScheme,
  nextScheme,
  readScheme,
  SCHEME_KEY,
} from "./theme.ts";

import type { Store } from "./store.ts";

/**
 * builds a store backed by a map, so a test can read what was written
 * @param seed the entries the store starts with
 * @returns the store and the map behind it
 */
function store(seed: Record<string, string> = {}): Store & { kept: Map<string, string> } {
  const kept = new Map(Object.entries(seed));

  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
}

/**
 * builds the scheme control as the page renders it
 * @returns the button, holding its state span
 */
function control(): StubElement {
  return new StubElement("button", { "data-scheme-toggle": "" }, [
    new StubElement("span", { "data-scheme-state": "" }),
  ]);
}

describe("fn:readScheme", () => {
  it("should read a saved scheme", () => {
    expect(readScheme(store({ [SCHEME_KEY]: "dark" }))).toBe("dark");
  });

  it("should fall back to auto when nothing was ever chosen", () => {
    expect(readScheme(store())).toBe("auto");
  });

  it("should treat anything unrecognised as no choice at all", () => {
    // an older or hand-edited entry must not put the page in a state the
    // control cannot cycle out of
    expect(readScheme(store({ [SCHEME_KEY]: "sepia" }))).toBe("auto");
  });
});

describe("fn:nextScheme", () => {
  it("should walk the whole cycle and wrap", () => {
    expect(nextScheme("auto")).toBe("light");
    expect(nextScheme("light")).toBe("dark");
    // auto is a real third state: a reader whose system already switches on
    // its own has to be able to get back to following it
    expect(nextScheme("dark")).toBe("auto");
  });
});

describe("fn:applyScheme", () => {
  it("should mark the document with a chosen scheme", () => {
    const root = new StubElement("html");
    applyScheme(root, "dark");

    expect(root.attributes["data-theme"]).toBe("dark");
  });

  it("should leave no mark at all for auto", () => {
    // the media query yields to [data-theme="light"], so leaving "auto" on
    // the element would read as a choice and pin the page to light
    const root = new StubElement("html", { "data-theme": "light" });
    applyScheme(root, "auto");

    expect(root.attributes["data-theme"]).toBeUndefined();
  });
});

describe("fn:installScheme", () => {
  it("should show and apply the saved scheme before any press", () => {
    const root = new StubElement("html");
    const button = control();
    installScheme(button, root, store({ [SCHEME_KEY]: "dark" }));

    expect(root.attributes["data-theme"]).toBe("dark");
    expect(button.children[0].textContent).toBe("Dark");
    // the attribute is what picks the icon, so a name that says "Dark" beside
    // a sun would be a silent lie to anyone who can see it
    expect(button.attributes["data-scheme"]).toBe("dark");
  });

  it("should cycle, persist, and relabel on each press", () => {
    const root = new StubElement("html");
    const button = control();
    const kept = store();
    installScheme(button, root, kept);

    const walked: (string | undefined)[] = [];
    for (let press = 0; press < 4; press += 1) {
      button.dispatch("click");
      walked.push(root.attributes["data-theme"]);
    }

    expect(walked).toStrictEqual(["light", "dark", undefined, "light"]);
    // the glyph follows the cycle even where the root carries no attribute
    expect(button.attributes["data-scheme"]).toBe("light");
    expect(kept.kept.get(SCHEME_KEY)).toBe("light");
    expect(button.children[0].textContent).toBe("Light");
  });

  it("should start the cycle from the saved scheme, not from auto", () => {
    const root = new StubElement("html");
    const button = control();
    installScheme(button, root, store({ [SCHEME_KEY]: "light" }));
    button.dispatch("click");

    expect(root.attributes["data-theme"]).toBe("dark");
  });
});
