import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installFilters } from "./filter.ts";

/**
 * builds a chip bar over three findings, two of them critical
 * @returns the scope, its chips, and its items
 */
function board(): {
  scope: StubElement;
  chips: StubElement[];
  items: StubElement[];
} {
  const chips = [
    new StubElement("button", { "data-filter": "all", "aria-pressed": "true" }),
    new StubElement("button", { "data-filter": "critical", "aria-pressed": "false" }),
  ];
  const items = [
    new StubElement("li", { "data-filter-item": "critical" }),
    new StubElement("li", { "data-filter-item": "critical" }),
    new StubElement("li", { "data-filter-item": "watch" }),
  ];
  const bar = new StubElement("div", { "data-filter-chips": "" }, chips);
  const scope = new StubElement("section", {}, [bar, ...items]);

  return { scope, chips, items };
}

/**
 * reads which items are currently dimmed
 * @param items the items to read
 * @returns each item's dimmed state, in order
 */
function dimmed(items: StubElement[]): boolean[] {
  return items.map((item) => item.classList.contains("is-dimmed"));
}

describe("fn:installFilters", () => {
  it("should dim what a chip does not match", () => {
    const { scope, chips, items } = board();
    installFilters(scope as unknown as ParentNode);

    chips[1]!.dispatch("click");

    expect(dimmed(items)).toEqual([false, false, true]);
  });

  it("should never hide an item, so the set the reader sees stays whole", () => {
    const { scope, chips, items } = board();
    installFilters(scope as unknown as ParentNode);

    chips[1]!.dispatch("click");

    expect(items.map((item) => item.hidden)).toEqual([false, false, false]);
  });

  it("should undim everything when the reader goes back to all", () => {
    const { scope, chips, items } = board();
    installFilters(scope as unknown as ParentNode);

    chips[1]!.dispatch("click");
    chips[0]!.dispatch("click");

    expect(dimmed(items)).toEqual([false, false, false]);
  });

  it("should mark which chip is the current selection", () => {
    const { scope, chips } = board();
    installFilters(scope as unknown as ParentNode);

    chips[1]!.dispatch("click");

    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
    ]);
  });

  it("should leave the counts on the chips exactly as rendered", () => {
    const count = new StubElement("span", { "data-filter-count": "" });
    count.textContent = "2";
    const chip = new StubElement("button", { "data-filter": "critical" }, [count]);
    const bar = new StubElement("div", { "data-filter-chips": "" }, [chip]);
    const scope = new StubElement("section", {}, [
      bar,
      new StubElement("li", { "data-filter-item": "watch" }),
    ]);
    installFilters(scope as unknown as ParentNode);

    chip.dispatch("click");

    expect(count.textContent).toBe("2");
  });

  it("should match an item carrying several tags", () => {
    const item = new StubElement("li", { "data-filter-item": "critical open" });
    const chip = new StubElement("button", { "data-filter": "open" });
    const bar = new StubElement("div", { "data-filter-chips": "" }, [chip]);
    const scope = new StubElement("section", {}, [bar, item]);
    installFilters(scope as unknown as ParentNode);

    chip.dispatch("click");

    expect(item.classList.contains("is-dimmed")).toBe(false);
  });

  describe("a region that names its own scope", () => {
    /**
     * builds a findings bar and a tree with a bar of its own, both in one section
     * @returns each bar's chips and each region's items
     */
    function nested(): {
      scope: StubElement;
      outer: StubElement[];
      inner: StubElement[];
      rows: StubElement[];
      findings: StubElement[];
    } {
      const outer = [
        new StubElement("button", { "data-filter": "all", "aria-pressed": "true" }),
        new StubElement("button", { "data-filter": "critical", "aria-pressed": "false" }),
      ];
      const inner = [
        new StubElement("button", { "data-filter": "all", "aria-pressed": "true" }),
        new StubElement("button", { "data-filter": "new", "aria-pressed": "false" }),
      ];
      const rows = [
        new StubElement("span", { "data-filter-item": "new" }),
        new StubElement("span", { "data-filter-item": "changed" }),
      ];
      const findings = [
        new StubElement("li", { "data-filter-item": "critical" }),
        new StubElement("li", { "data-filter-item": "watch" }),
      ];
      const figure = new StubElement("figure", { "data-filter-scope": "" }, [
        new StubElement("div", { "data-filter-chips": "" }, inner),
        ...rows,
      ]);
      const scope = new StubElement("section", {}, [
        new StubElement("div", { "data-filter-chips": "" }, outer),
        ...findings,
        figure,
      ]);

      return { scope, outer, inner, rows, findings };
    }

    it("should dim only the items of its own scope when a bar sits inside it", () => {
      const { scope, inner, rows, findings } = nested();
      installFilters(scope as unknown as ParentNode);

      inner[1]!.dispatch("click");

      expect(dimmed(rows)).toEqual([false, true]);
      expect(dimmed(findings)).toEqual([false, false]);
    });

    it("should not dim a nested scope's items when the bar above it filters", () => {
      const { scope, outer, rows, findings } = nested();
      installFilters(scope as unknown as ParentNode);

      outer[1]!.dispatch("click");

      expect(dimmed(findings)).toEqual([false, true]);
      expect(dimmed(rows)).toEqual([false, false]);
    });
  });

  it("should leave a bar with no items alone", () => {
    const chip = new StubElement("button", { "data-filter": "x" });
    const bar = new StubElement("div", { "data-filter-chips": "" }, [chip]);
    const scope = new StubElement("section", {}, [bar]);

    expect(() => {
      installFilters(scope as unknown as ParentNode);
      chip.dispatch("click");
    }).not.toThrow();
  });
});
