import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installProbes } from "./probe.ts";

/**
 * builds a probe holding three items
 * @param id the probe's id
 * @returns the probe
 */
function probe(id = "first-try"): StubElement {
  const items = ["Index", "Cache", "Shard"].map(
    (text, index) =>
      new StubElement(
        "li",
        { "data-probe-item": `${id}-${index}`, "data-probe-label": text },
        [
          new StubElement("span", { class: "probe-text" }),
          new StubElement("button", { "data-probe-move": "up" }),
          new StubElement("button", { "data-probe-move": "down" }),
        ],
      ),
  );

  return new StubElement(
    "div",
    { "data-probe": "", "data-probe-id": id, "data-probe-label": "Try first" },
    [new StubElement("ol", {}, items)],
  );
}

/**
 * installs the probes and hands back what the reply would read
 * @param probes the probes
 * @param saved the orders set before this visit
 * @returns the reader, the change count, and the probes
 */
function install(
  probes: StubElement[],
  saved: Record<string, string[]> = {},
): { read: () => ReturnType<ReturnType<typeof installProbes>>; changes: () => number } {
  let changes = 0;

  const read = installProbes(
    probes as unknown as HTMLElement[],
    saved,
    () => {
      changes += 1;
    },
  );

  return { read, changes: () => changes };
}

/**
 * presses one of an item's move buttons
 * @param one the probe
 * @param index which item to move
 * @param direction which way to move it
 */
function press(one: StubElement, index: number, direction: "up" | "down"): void {
  const item = one.querySelectorAll("[data-probe-item]")[index]!;
  const button = item.querySelector(`[data-probe-move="${direction}"]`)!;
  one.dispatch("click", { target: button, preventDefault: () => undefined });
}

/**
 * raises an arrow key on one of a probe's items
 * @param one the probe
 * @param index which item the key reaches
 * @param key which arrow
 */
function arrow(one: StubElement, index: number, key: string): void {
  one.dispatch("keydown", {
    key,
    target: one.querySelectorAll("[data-probe-item]")[index],
    preventDefault: () => undefined,
  });
}

/**
 * reads a probe's items by label, in order
 * @param one the probe
 * @returns the labels
 */
function order(one: StubElement): string[] {
  return one
    .querySelectorAll("[data-probe-item]")
    .map((item) => item.dataset.probeLabel ?? "");
}

describe("fn:installProbes", () => {
  it("should report the authored order as unmoved", () => {
    const one = probe();

    expect(install([one]).read()).toEqual([
      {
        id: "first-try",
        label: "Try first",
        order: ["Index", "Cache", "Shard"],
        keys: ["first-try-0", "first-try-1", "first-try-2"],
        moved: false,
      },
    ]);
  });

  it("should move an item later on the down control", () => {
    const one = probe();
    install([one]);

    press(one, 0, "down");

    expect(order(one)).toEqual(["Cache", "Index", "Shard"]);
  });

  it("should move an item earlier on the up control", () => {
    const one = probe();
    install([one]);

    press(one, 2, "up");

    expect(order(one)).toEqual(["Index", "Shard", "Cache"]);
  });

  it("should reorder with the arrow keys, so a drag is never the only way", () => {
    const one = probe();
    install([one]);

    arrow(one, 0, "ArrowDown");

    expect(order(one)).toEqual(["Cache", "Index", "Shard"]);
  });

  it("should keep focus on the item it moved", () => {
    const one = probe();
    install([one]);

    arrow(one, 2, "ArrowUp");

    expect(one.querySelectorAll("[data-probe-item]")[1]!.focused).toBe(true);
  });

  it("should not move the first item earlier or the last item later", () => {
    const one = probe();
    const { changes } = install([one]);

    press(one, 0, "up");
    arrow(one, 2, "ArrowDown");

    expect(order(one)).toEqual(["Index", "Cache", "Shard"]);
    expect(changes()).toBe(0);
  });

  it("should leave a key it does not own to the page", () => {
    const one = probe();
    const { changes } = install([one]);

    arrow(one, 0, "ArrowRight");

    expect(changes()).toBe(0);
  });

  it("should report a moved probe as moved", () => {
    const one = probe();
    const { read } = install([one]);

    press(one, 0, "down");

    expect(read()[0]).toMatchObject({
      order: ["Cache", "Index", "Shard"],
      moved: true,
    });
  });

  it("should read a probe moved back to where it started as unmoved", () => {
    // reporting it would put the page's own proposal into the reply as though
    // the reader had ranked it that way
    const one = probe();
    const { read } = install([one]);

    press(one, 0, "down");
    press(one, 1, "up");

    expect(read()[0]!.moved).toBe(false);
  });

  it("should restore the order the reader last left", () => {
    const one = probe();
    install([one], { "first-try": ["first-try-2", "first-try-0", "first-try-1"] });

    expect(order(one)).toEqual(["Shard", "Index", "Cache"]);
  });

  it("should keep an item a saved order does not name", () => {
    const one = probe();
    install([one], { "first-try": ["first-try-2", "first-try-0"] });

    expect(order(one)).toContain("Cache");
    expect(order(one)).toHaveLength(3);
  });

  it("should tell the page each time an order settles", () => {
    const one = probe();
    const { changes } = install([one]);

    press(one, 0, "down");
    arrow(one, 0, "ArrowDown");

    expect(changes()).toBe(2);
  });
});
