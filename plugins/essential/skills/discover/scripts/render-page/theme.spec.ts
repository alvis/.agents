import { describe, expect, it } from "vitest";

import { RenderError } from "./error.ts";
import { renderTheme } from "./theme.ts";

/**
 * renders a theme and refuses to let a test read a stylesheet it never got
 * @param theme the theme to render
 * @returns the rendered stylesheet
 */
function css(theme: unknown): string {
  return renderTheme(theme, "theme");
}

describe("fn:renderTheme", () => {
  it("should render nothing when the page declares no theme", () => {
    expect(css(undefined)).toBe("");
  });

  it("should render nothing when the theme overrides nothing", () => {
    expect(css({})).toBe("");
  });

  it("should rotate the accent ramp in both schemes from one hue", () => {
    const sheet = css({ accent: 265 });

    // every accent token moves together, or a board's chips, focus ring, and
    // navigation would disagree about what the board's colour is
    for (const token of [
      "--ui-accent",
      "--ui-accent-soft",
      "--ui-accent-ink",
      "--ui-focus",
    ])
      expect(sheet.match(new RegExp(`${token}:oklch\\([^)]*265\\)`, "g")))
        .toHaveLength(3);
  });

  it("should keep the built-in lightness and chroma when rotating a hue", () => {
    // the hue moves; the contrast family does not. Reading the default ramp's
    // own numbers back is what stops a rotation from quietly going pale.
    expect(css({ accent: 12 })).toContain("--ui-accent:oklch(.672 .131 12)");
    expect(css({ accent: 12 })).toContain("--ui-accent:oklch(.75 .14 12)");
  });

  it("should reach the reader who follows the system and the one who chose", () => {
    const sheet = css({ dark: { "--ui-canvas": "#000" } });

    // one dark override, emitted under both selectors the built-in dark
    // tokens use, or a manual choice would show the built-in palette
    expect(sheet).toContain(
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){',
    );
    expect(sheet).toContain(':root[data-theme="dark"]{');
    expect(sheet.match(/--ui-canvas:#000;/g)).toHaveLength(2);
  });

  it("should leave the light scheme untouched when only dark is overridden", () => {
    expect(css({ dark: { "--ui-canvas": "#000" } })).not.toMatch(/^:root\{/m);
  });

  it("should let a raw override outrank the ramp for the same token", () => {
    const sheet = css({ accent: 200, light: { "--ui-accent": "#ff0000" } });
    const rule = sheet.slice(0, sheet.indexOf("}"));

    // both land in one block, so the later declaration is the one that wins
    expect(rule.indexOf("--ui-accent:oklch")).toBeLessThan(
      rule.indexOf("--ui-accent:#ff0000"),
    );
  });

  it("should accept any --ui-* token, holding no whitelist of its own", () => {
    // D-17 — a product's palette is the author's to state in full, so nothing
    // here decides which tokens are worth overriding
    expect(css({ light: { "--ui-shadow": "none", "--ui-raised": "#fff" } }))
      .toBe(":root{\n  --ui-shadow:none;\n  --ui-raised:#fff;\n}");
  });

  it("should refuse a theme that is not an object", () => {
    expect(() => css([])).toThrow(RenderError);
    expect(() => css("dark")).toThrow("theme: required object");
  });

  it("should refuse an unknown theme key by name", () => {
    expect(() => css({ accents: 200 })).toThrow(
      'theme.accents: unknown theme key, expected one of "accent", "light", "dark"',
    );
  });

  it("should refuse an accent that is not a hue", () => {
    expect(() => css({ accent: "200" })).toThrow(
      "theme.accent: required number between 0 and 360",
    );
    expect(() => css({ accent: 361 })).toThrow("theme.accent");
    expect(() => css({ accent: -1 })).toThrow("theme.accent");
    expect(() => css({ accent: Number.NaN })).toThrow("theme.accent");
  });

  it("should refuse a token outside the --ui-* namespace", () => {
    // the namespace is the boundary between overriding a colour and authoring
    // an arbitrary custom property the rest of the page might read
    expect(() => css({ light: { "--brand": "#fff" } })).toThrow(
      "theme.light.--brand: token names must match",
    );
    expect(() => css({ dark: { "--UI-canvas": "#fff" } })).toThrow(
      "theme.dark.--UI-canvas: token names must match",
    );
  });

  it("should refuse an empty token value", () => {
    expect(() => css({ light: { "--ui-canvas": "  " } })).toThrow(
      "theme.light.--ui-canvas: required non-empty string",
    );
    expect(() => css({ light: { "--ui-canvas": 3 } })).toThrow(
      "theme.light.--ui-canvas: required non-empty string",
    );
  });

  it("should read a token value by grammar, naming the token that failed", () => {
    // D-63 — the value is written into the page verbatim, and no encoding of
    // `url(https://…)` stops it fetching, so the value is read rather than
    // filtered. The grammar itself is covered in css-value.spec.ts; what
    // matters here is that a token goes through it under its own JSON path
    expect(() => css({ light: { "--ui-canvas": "#fff;color:red" } })).toThrow(
      'theme.light.--ui-canvas: ";" is not part of a colour, length, keyword, or permitted function',
    );
    expect(() => css({ dark: { "--ui-canvas": "url(https://x/y.png)" } })).toThrow(
      'theme.dark.--ui-canvas: "url(" is not a permitted function',
    );
  });

  it("should refuse a token value that fetches through a function url( never named", () => {
    // E-114 — the denylist this replaced blocked `url(` and nothing else, so a
    // board broke R6 with a token value and the suite had nothing to say
    expect(() =>
      css({ light: { "--ui-canvas": 'image-set("https://evil.example/bg.png" 1x)' } }),
    ).toThrow('theme.light.--ui-canvas: "image-set(" is not a permitted function');
  });

  it("should refuse a scheme map that is not an object", () => {
    expect(() => css({ light: ["--ui-canvas"] })).toThrow(
      "theme.light: required object",
    );
  });
});
