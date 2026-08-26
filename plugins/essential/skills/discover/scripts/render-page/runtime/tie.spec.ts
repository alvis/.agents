import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { installTies } from "./tie.ts";

describe("fn:installTies", () => {
  it("should light a pin and its card together", () => {
    const pin = new StubElement("button", { "data-sync": "pin:im-1:1" });
    const card = new StubElement("li", { "data-sync": "pin:im-1:1" });
    const root = new StubElement("div", {}, [pin, card]);
    installTies(root as unknown as ParentNode);

    pin.dispatch("mouseenter");

    expect(card.classList.contains("is-active")).toBe(true);
  });

  it("should light a glossary entry from the sentence that names it", () => {
    const term = new StubElement("span", { "data-sync": "term:quorum" });
    const entry = new StubElement("dt", { "data-sync": "term:quorum" });
    const root = new StubElement("div", {}, [term, entry]);
    installTies(root as unknown as ParentNode);

    entry.dispatch("focus");

    expect(term.classList.contains("is-active")).toBe(true);
  });

  it("should keep two families apart under one name", () => {
    const pin = new StubElement("button", { "data-sync": "pin:1" });
    const tie = new StubElement("span", { "data-sync": "tie:1" });
    const root = new StubElement("div", {}, [pin, tie]);
    installTies(root as unknown as ParentNode);

    pin.dispatch("mouseenter");

    expect(tie.classList.contains("is-active")).toBe(false);
  });

  it("should make a tied span reachable without a pointer", () => {
    const term = new StubElement("span", { "data-sync": "term:quorum" });
    const root = new StubElement("div", {}, [term]);
    installTies(root as unknown as ParentNode);

    expect(term.tabIndex).toBe(0);
  });
});
