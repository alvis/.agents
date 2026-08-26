import { describe, expect, it } from "vitest";

import { RenderError } from "../error.ts";
import { ANNOTATION_CSS } from "../style/annotation.ts";
import { pinFrame, renderPins } from "./pin.ts";

describe("fn:renderPins", () => {
  it("should draw nothing at all when a figure carries no pins", () => {
    expect(renderPins([], "blocks[0].pins", "im-1")).toEqual({ layer: "", cards: "" });
  });

  it("should number pins from one, in the order the author wrote them", () => {
    const { layer } = renderPins(
      [{ x: 10, y: 20, text: "first" }, { x: 30, y: 40, text: "second" }],
      "blocks[0].pins",
      "im-1",
    );

    expect(layer).toContain(">1</button>");
    expect(layer).toContain(">2</button>");
    expect(layer.indexOf(">1</button>")).toBeLessThan(layer.indexOf(">2</button>"));
  });

  it("should position a pin by percentage custom properties", () => {
    const { layer } = renderPins([{ x: 34, y: 52, text: "n" }], "blocks[0].pins", "im-1");

    expect(layer).toContain('style="--pin-x:34%;--pin-y:52%"');
  });

  it("should tie a pin to its card by a key scoped to the figure", () => {
    const { layer, cards } = renderPins([{ x: 1, y: 1, text: "n" }], "blocks[0].pins", "im-7");

    expect(layer).toContain('data-sync="pin:im-7:1"');
    expect(cards).toContain('data-sync="pin:im-7:1"');
  });

  it("should let a pin describe its own card", () => {
    const { layer, cards } = renderPins([{ x: 1, y: 1, text: "n" }], "blocks[0].pins", "im-1");

    expect(layer).toContain('aria-describedby="im-1-pin-1"');
    expect(cards).toContain('id="im-1-pin-1"');
  });

  it("should carry a card's own rich text", () => {
    const { cards } = renderPins(
      [{ x: 1, y: 1, text: [{ kind: "provenance", text: "inline triage", level: "assumed" }] }],
      "blocks[0].pins",
      "im-1",
    );

    expect(cards).toContain('data-provenance="assumed"');
  });

  it("should make every pin a real button, so the keyboard reaches it", () => {
    const { layer } = renderPins([{ x: 1, y: 1, text: "n" }], "blocks[0].pins", "im-1");

    expect(layer).toContain('<button type="button" class="pin"');
  });

  it("should refuse a position that would put a pin outside its figure", () => {
    expect(() => renderPins([{ x: 140, y: 10, text: "n" }], "blocks[0].pins", "im-1")).toThrow(
      new RenderError("blocks[0].pins[0].x: required a percentage from 0 to 100, received 140"),
    );
  });

  it("should refuse a position written as text, which would reach the style attribute", () => {
    expect(() =>
      renderPins([{ x: "0;background:url(http://x)" as unknown as number, y: 1, text: "n" }], "blocks[0].pins", "im-1"),
    ).toThrow(RenderError);
  });

  it("should refuse a pin that is not an object", () => {
    expect(() => renderPins(["1"], "blocks[0].pins", "im-1")).toThrow(RenderError);
  });
});

describe("fn:pinFrame", () => {
  it("should leave an unpinned picture unwrapped", () => {
    expect(pinFrame("<img>", "")).toBe("<img>");
  });

  it("should frame a pinned picture so its pins position against it", () => {
    expect(pinFrame("<img>", "<div class=\"pin-layer\"></div>")).toBe(
      '<div class="pin-frame"><img><div class="pin-layer"></div></div>',
    );
  });
});

describe("const:ANNOTATION_CSS pin legibility", () => {
  it("should colour a pin from the pair that flips with the scheme", () => {
    // the number is 12.8px and is the pin's whole content, so it carries the
    // contrast floor alone; a fixed ink clears it in at most one scheme
    expect(ANNOTATION_CSS).toContain(
      "background:var(--ui-accent-soft); color:var(--ui-accent-ink)",
    );
    expect(ANNOTATION_CSS).not.toContain("color:#fff; font:700 .8rem");
  });

  it("should light a pin by inverting that same pair", () => {
    expect(ANNOTATION_CSS).toContain(
      ".pin.is-active{background:var(--ui-accent-ink); color:var(--ui-accent-soft);",
    );
  });

  it("should give a pin and its card the same badge colours", () => {
    const pin = /\.pin\{[^}]*\}/.exec(ANNOTATION_CSS)?.[0] ?? "";
    const badge = /\.pin-note::before\{[^}]*\}/.exec(ANNOTATION_CSS)?.[0] ?? "";
    const pair = (rule: string) =>
      [
        /background:(var\(--ui-[a-z-]+\))/.exec(rule)?.[1],
        /color:(var\(--ui-[a-z-]+\))/.exec(rule)?.[1],
      ].join("/");

    expect(pair(pin)).toBe(pair(badge));
  });
});
