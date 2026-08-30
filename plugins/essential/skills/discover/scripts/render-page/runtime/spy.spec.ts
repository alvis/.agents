import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installSectionSpy } from "./spy.ts";

/** what the observer was handed, and what it was told to watch. */
let observed: StubElement[];

/** the callback the installer gave the observer. */
let notify: (entries: { isIntersecting: boolean; target: { id: string } }[]) => void;

/** the options the observer was built with. */
let options: IntersectionObserverInit | undefined;

/** the sections the document reports. */
let sections: StubElement[];

beforeEach(() => {
  observed = [];
  sections = [];
  globalThis.IntersectionObserver = class {
    constructor(callback: typeof notify, init?: IntersectionObserverInit) {
      notify = callback;
      options = init;
    }
    observe(node: StubElement): void {
      observed.push(node);
    }
  } as unknown as typeof IntersectionObserver;
  globalThis.document = {
    querySelectorAll: () => sections,
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

/**
 * builds a drawer holding one nav link per section id
 * @param ids the section ids to link to
 * @returns the drawer root
 */
function drawer(ids: string[]): StubElement {
  return new StubElement("aside", { class: "drawer" }, [
    new StubElement(
      "nav",
      { class: "drawer-nav" },
      ids.map((id) => new StubElement("a", { href: `#${id}` })),
    ),
  ]);
}

/**
 * finds a nav link by the section it points at.
 *
 * by href rather than by position, so a test says which section it means
 * rather than which place in the nav that section happens to occupy.
 * @param root the drawer to search
 * @param id the section id
 * @returns the link
 */
function link(root: StubElement, id: string): StubElement {
  const found = root
    .querySelectorAll("a")
    .find((node) => node.getAttribute("href") === `#${id}`);
  if (!found) throw new Error(`no link for ${id}`);

  return found;
}

describe("fn:installSectionSpy", () => {
  it("should watch every section the page declares", () => {
    sections = [new StubElement("section", { id: "a", "data-section": "" })];
    installSectionSpy(drawer(["a"]));

    expect(observed).toStrictEqual(sections);
  });

  it("should mark the link for the section being read", () => {
    const root = drawer(["a", "b"]);
    installSectionSpy(root);
    notify([{ isIntersecting: true, target: { id: "a" } }]);

    expect(link(root, "a").getAttribute("aria-current")).toBe("location");
  });

  it("should mark exactly one link, dropping the mark off the others", () => {
    const root = drawer(["a", "b"]);
    installSectionSpy(root);
    notify([{ isIntersecting: true, target: { id: "a" } }]);
    notify([{ isIntersecting: true, target: { id: "b" } }]);

    expect(link(root, "a").getAttribute("aria-current")).toBeNull();
    expect(link(root, "b").getAttribute("aria-current")).toBe("location");
  });

  it("should ignore a section leaving the band, not just one entering it", () => {
    // both directions arrive through the same callback, and treating a
    // departure as an arrival would move the mark to whatever just scrolled off
    const root = drawer(["a", "b"]);
    installSectionSpy(root);
    notify([{ isIntersecting: true, target: { id: "a" } }]);
    notify([{ isIntersecting: false, target: { id: "b" } }]);

    expect(link(root, "a").getAttribute("aria-current")).toBe("location");
  });

  it("should read the middle band of the viewport, not its whole height", () => {
    // a full-height band marks every section on screen at once, which on a
    // short page is all of them
    installSectionSpy(drawer([]));

    expect(options).toStrictEqual({ rootMargin: "-20% 0px -70% 0px" });
  });
});
