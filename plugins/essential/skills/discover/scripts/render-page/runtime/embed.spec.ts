import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { fit, installEmbeds } from "./embed.ts";

describe("fn:fit", () => {
  it("should leave a viewport narrower than the column at its own size", () => {
    expect(fit(390, 700, 1231)).toStrictEqual({ scale: 1, left: 421, height: 700 });
  });

  // the case the whole scaling exists for: a desktop design read in a column
  // that is nowhere near a desktop wide
  it("should scale a wide viewport down to the column", () => {
    expect(fit(1440, 800, 1231)).toStrictEqual({
      scale: 1231 / 1440,
      left: 0,
      height: Math.round((800 * 1231) / 1440),
    });
  });

  it("should keep scaling as the column narrows further", () => {
    const narrow = fit(1440, 800, 520);

    expect(narrow.scale).toBeCloseTo(520 / 1440, 10);
    expect(narrow.height).toEqual(289);
    expect(1440 * narrow.scale).toBeCloseTo(520, 6);
  });

  // blowing a phone frame up to fill a desktop column would state something
  // about the design the author never claimed
  it("should never scale a frame up", () => {
    expect(fit(390, 700, 2000).scale).toEqual(1);
  });

  it("should centre a frame that does not fill the column", () => {
    expect(fit(400, 300, 1000).left).toEqual(300);
  });

  it("should leave a scaled frame flush left, because it already fills the column", () => {
    expect(fit(1440, 900, 800).left).toEqual(0);
  });

  it("should take the stage's height from the scaled height, so no gap is left", () => {
    expect(fit(1000, 500, 500).height).toEqual(250);
  });

  // a stage measured before layout has run reports zero, and dividing by it
  // would put the frame at an infinite scale
  it.each([
    ["a column of zero width", 390, 700, 0],
    ["a viewport of zero width", 0, 700, 800],
  ])("should fall back to natural size for %s", (_, width, height, available) => {
    expect(fit(width, height, available).scale).toEqual(1);
  });
});

/** one observation, as the runtime's callback reads it. */
interface Entry {
  contentRect: { width: number };
}

/** every observer `installEmbeds` created, in the order it created them. */
const observers: ((entries: Entry[]) => void)[] = [];

/**
 * stands in for the layout observer the runtime measures with.
 *
 * a test drives it directly rather than waiting for a layout that never
 * happens here, which is what lets the width guard be observed at all.
 */
class StubResizeObserver {
  private readonly callback: (entries: Entry[]) => void;

  /**
   * records the callback so a test can fire it
   * @param callback what the runtime wants told about a resize
   */
  constructor(callback: (entries: Entry[]) => void) {
    this.callback = callback;
    observers.push(callback);
  }

  /** accepts a target, as the DOM's own observer does. */
  observe(): void {
    // nothing observes here; the test decides when a measurement arrives
  }
}

const held = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver;
});

afterAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = held;
});

/**
 * builds one embedded figure with its stage, frame, and viewport controls
 * @param viewports the viewports the author declared, widest first as a board has them
 * @param rotate whether the figure carries a rotate control
 * @returns the figure
 */
function figure(
  viewports: [string, number, number][] = [
    ["Desktop", 1440, 900],
    ["Phone", 390, 844],
  ],
  rotate = true,
): StubElement {
  const buttons = viewports.map(
    ([label, width, height]) =>
      new StubElement("button", {
        "data-embed-viewport": label,
        "data-width": String(width),
        "data-height": String(height),
      }),
  );

  return new StubElement("figure", { "data-embed": "" }, [
    ...buttons,
    ...(rotate ? [new StubElement("button", { "data-embed-rotate": "" })] : []),
    new StubElement("div", { "data-embed-stage": "" }, [
      new StubElement("iframe", { "data-embed-frame": "" }),
    ]),
  ]);
}

/**
 * wires a figure inside a root, as the page's own call would
 * @param one the figure
 * @param column the width of the column it is read in
 * @returns the figure's stage and frame
 */
function install(
  one: StubElement,
  column = 1440,
): { stage: StubElement; frame: StubElement } {
  const stage = one.querySelector("[data-embed-stage]")!;
  stage.clientWidth = column;
  installEmbeds(
    new StubElement("main", {}, [one]) as unknown as ParentNode,
  );

  return { stage, frame: one.querySelector("[data-embed-frame]")! };
}

/**
 * presses one of a figure's controls
 * @param one the figure
 * @param selector which control
 */
function press(one: StubElement, selector: string): void {
  one.querySelector(selector)!.dispatch("click");
}

describe("fn:installEmbeds", () => {
  it("should open on the first viewport the author declared", () => {
    const one = figure();
    const { stage, frame } = install(one);

    expect(frame.style).toMatchObject({
      width: "1440px",
      height: "900px",
      left: "0px",
      transform: "",
    });
    expect(stage.style.height).toBe("900px");
  });

  it("should say which viewport is showing", () => {
    const one = figure();
    install(one);
    const [wide, narrow] = one.querySelectorAll("[data-embed-viewport]");

    expect(wide!.getAttribute("aria-pressed")).toBe("true");
    expect(narrow!.getAttribute("aria-pressed")).toBe("false");
  });

  it("should switch to the viewport whose button was pressed", () => {
    const one = figure();
    const { frame } = install(one);

    press(one, '[data-embed-viewport="Phone"]');

    expect(frame.style).toMatchObject({ width: "390px", height: "844px" });
    expect(
      one.querySelector('[data-embed-viewport="Phone"]')!.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("should centre a frame narrower than the column", () => {
    const one = figure();
    const { frame } = install(one);

    press(one, '[data-embed-viewport="Phone"]');

    expect(frame.style.left).toBe("525px");
  });

  it("should swap the sides on rotate, and say it is rotated", () => {
    const one = figure();
    const { frame } = install(one);

    press(one, '[data-embed-viewport="Phone"]');
    press(one, "[data-embed-rotate]");

    expect(frame.style).toMatchObject({ width: "844px", height: "390px" });
    expect(one.querySelector("[data-embed-rotate]")!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("should scale a viewport wider than the column it is read in", () => {
    const one = figure();
    const { stage, frame } = install(one, 720);

    expect(frame.style.transform).toBe(`scale(${720 / 1440})`);
    expect(stage.style.height).toBe("450px");
  });

  // the guard whose own comment says the page would otherwise spin: `apply`
  // sets the stage's height, which the observer reports back as a resize
  it("should re-measure only when the column's width actually changed", () => {
    const one = figure();
    const { stage, frame } = install(one);
    const measure = observers.at(-1)!;

    measure([{ contentRect: { width: 1440 } }]);
    stage.clientWidth = 720;
    measure([{ contentRect: { width: 1440 } }]);
    const ignored = frame.style.transform;
    measure([{ contentRect: { width: 720 } }]);

    expect(ignored).toBe("");
    expect(frame.style.transform).toBe(`scale(${720 / 1440})`);
  });

  it("should re-measure when the window resizes", () => {
    const one = figure();
    const { stage, frame } = install(one);

    stage.clientWidth = 720;
    globalThis.dispatchEvent(new Event("resize"));

    expect(frame.style.transform).toBe(`scale(${720 / 1440})`);
  });

  // half a switcher is not a switcher, and a figure that never got one is the
  // ordinary shape of an embed the author declared no viewports for
  it.each([
    ["no stage", [new StubElement("button", { "data-embed-viewport": "Desktop" })]],
    ["no frame", [new StubElement("div", { "data-embed-stage": "" })]],
    [
      "no viewport controls",
      [
        new StubElement("div", { "data-embed-stage": "" }, [
          new StubElement("iframe", { "data-embed-frame": "" }),
        ]),
      ],
    ],
  ])("should leave a figure with %s alone", (_, children) => {
    const one = new StubElement("figure", { "data-embed": "" }, children);

    expect(() =>
      installEmbeds(new StubElement("main", {}, [one]) as unknown as ParentNode),
    ).not.toThrow();
    expect(one.querySelector("[data-embed-frame]")?.style ?? {}).toStrictEqual({});
  });
});
