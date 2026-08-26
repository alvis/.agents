import { describe, expect, it } from "vitest";

import { DIAGRAM_CSS } from "../diagram/style.ts";
import { PAGE_CSS } from "../style.ts";
import { THEME } from "./diagram.ts";

const css = `${PAGE_CSS}${DIAGRAM_CSS}`;

describe("const:THEME", () => {
  // a token that does not exist resolves to the empty string, which the canvas
  // cannot paint, which leaves the sentinel black behind — a graph drawn in
  // black on black, with nothing anywhere reporting a fault. The typo is the
  // whole failure mode, so the names are checked against the stylesheet
  it("should name only tokens the stylesheet defines", () => {
    const undefined_ = [...new Set(Object.values(THEME))].filter(
      (token) => !css.includes(`${token}:`),
    );

    expect(undefined_).toStrictEqual([]);
  });

  it("should give Mermaid the variables it derives the rest from", () => {
    expect(Object.keys(THEME)).toEqual(
      expect.arrayContaining(["background", "primaryColor", "lineColor", "textColor"]),
    );
  });

  it("should follow a page token for every variable it sets", () => {
    const loose = Object.entries(THEME).filter(([, token]) => !token.startsWith("--ui-"));

    expect(loose).toStrictEqual([]);
  });
});
