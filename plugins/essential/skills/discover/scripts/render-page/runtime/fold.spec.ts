import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installJumps, isFolded, reveal } from "./fold.ts";

/** every click handler the installer put on the document. */
let clicks: ((event: unknown) => void)[];

/** the elements the stubbed document can find by id. */
let byId: Record<string, StubElement>;

beforeEach(() => {
  clicks = [];
  byId = {};
  globalThis.document = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (type === "click") clicks.push(handler);
    },
    getElementById: (id: string) => byId[id] ?? null,
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
});

/**
 * puts a question inside the given number of closed disclosures
 * @param depth how many disclosures hold it
 * @returns the question and the disclosures, innermost first
 */
function folded(depth: number): { field: StubElement; folds: StubElement[] } {
  const field = new StubElement("fieldset", { "data-question": "" });
  const folds: StubElement[] = [];
  let held = field;
  for (let level = 0; level < depth; level += 1) {
    held = new StubElement("details", {}, [held]);
    folds.push(held);
  }

  return { field, folds };
}

/**
 * clicks an element the way the document would see it
 * @param target the element the pointer landed on
 */
function click(target: StubElement): void {
  for (const handler of clicks) handler({ target });
}

describe("fn:isFolded", () => {
  it("should say a question inside a closed disclosure is folded", () => {
    expect(isFolded(folded(1).field as unknown as Element)).toBe(true);
  });

  it("should say a question inside no disclosure is not", () => {
    expect(isFolded(new StubElement("fieldset") as unknown as Element)).toBe(false);
  });

  it("should say a question is folded while any disclosure around it is closed", () => {
    const { field, folds } = folded(2);
    folds[0]!.open = true;

    expect(isFolded(field as unknown as Element)).toBe(true);
  });

  it("should say a question inside only open disclosures is not", () => {
    const { field, folds } = folded(2);
    for (const fold of folds) fold.open = true;

    expect(isFolded(field as unknown as Element)).toBe(false);
  });
});

describe("fn:reveal", () => {
  it("should open every disclosure around an element", () => {
    const { field, folds } = folded(3);

    reveal(field as unknown as Element);

    expect(folds.map((fold) => fold.open)).toEqual([true, true, true]);
    expect(isFolded(field as unknown as Element)).toBe(false);
  });

  it("should leave an element that is not folded alone", () => {
    expect(() => reveal(new StubElement("p") as unknown as Element)).not.toThrow();
  });
});

describe("fn:installJumps", () => {
  /**
   * wires a jump over a folded question and reports what the handler saw
   * @returns the question, its disclosure and every jump the handler was told of
   */
  function wired(): {
    field: StubElement;
    fold: StubElement;
    seen: { target: unknown; link: unknown }[];
  } {
    const { field, folds } = folded(1);
    field.attributes.id = "qs-q1";
    byId["qs-q1"] = field;
    const seen: { target: unknown; link: unknown }[] = [];
    installJumps((target, link) => seen.push({ target, link }));

    return { field, fold: folds[0]!, seen };
  }

  it.each([
    ["a drawer row", "summary-jump"],
    ["a bar chip", "chip"],
    ["a section heading's chip", "q-chip"],
  ])("should open the fold when %s is followed", (_, className) => {
    const { fold } = wired();
    const link = new StubElement("a", { href: "#qs-q1", class: className });

    click(link);

    expect(fold.open).toBe(true);
  });

  it("should open the fold when the pointer lands on something inside the link", () => {
    const { fold } = wired();
    const label = new StubElement("span");
    new StubElement("a", { href: "#qs-q1", class: "q-chip" }, [label]);

    click(label);

    expect(fold.open).toBe(true);
  });

  it("should tell the caller which question and which link", () => {
    const { field, seen } = wired();
    const link = new StubElement("a", { href: "#qs-q1" });

    click(link);

    expect(seen).toEqual([{ target: field, link }]);
  });

  it("should leave every other link alone", () => {
    const { fold, seen } = wired();

    click(new StubElement("a", { href: "#s-intro" }));
    click(new StubElement("a", { href: "https://example.test/#qs-q1" }));
    click(new StubElement("button"));

    expect(fold.open).toBe(false);
    expect(seen).toEqual([]);
  });

  it("should do nothing for a link to a question the page does not hold", () => {
    const { seen } = wired();

    expect(() => click(new StubElement("a", { href: "#qs-gone" }))).not.toThrow();
    expect(seen).toEqual([]);
  });

  it("should install one handler for every kind of link", () => {
    wired();

    expect(clicks).toHaveLength(1);
  });
});
