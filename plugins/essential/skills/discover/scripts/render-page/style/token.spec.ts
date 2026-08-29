import { describe, expect, it } from "vitest";

import { TOKEN_CSS } from "./token.ts";

/** a colour in OKLab, which is where two colours are compared. */
type Lab = [number, number, number];

/** the tag vocabulary, in the order `questions.md` writes it. */
const TAGS = [
  "architectural",
  "ideal",
  "recommended",
  "pragmatic",
  "hotfix",
  "workaround",
];

/**
 * how far apart two colours must be before a reader can tell them apart.
 *
 * a difference of about `.02` in OKLab is the smallest one a reader notices at
 * all, so these are one and a half and four times that: enough that a badge
 * says which tag it is rather than only which family it came from. The ink is
 * held tighter than nothing and the edge tighter still, because the edge is a
 * whole hue at full strength where the ink is a tint of one.
 */
const APART = { ink: 0.05, edge: 0.08 };

/**
 * the smallest contrast the badge's own text may have against its fill.
 *
 * `.badge` draws at `.72rem` bold, which is 11.5px — small text however heavy
 * it is, so the ordinary AA ratio applies rather than the large-text one.
 */
const READABLE = 4.5;

/**
 * reads every custom property one block declares
 * @param block the CSS between a selector's braces
 * @returns each property against the value written for it
 */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/gu))
    found.set(name as string, (value as string).trim());

  return found;
}

/**
 * reads the block one selector opens
 * @param selector the selector, including its opening brace
 * @returns the declarations inside it
 */
function block(selector: string): Map<string, string> {
  const open = TOKEN_CSS.indexOf(selector) + selector.length;

  return declarations(TOKEN_CSS.slice(open, TOKEN_CSS.indexOf("}", open)));
}

/**
 * every token one scheme resolves, dark layered over light the way CSS does
 * @param which the colour scheme
 * @returns each property against its value
 */
function scheme(which: "light" | "dark"): Map<string, string> {
  const light = block(":root{");

  return which === "light"
    ? light
    : new Map([...light, ...block(':root[data-theme="dark"]{')]);
}

/**
 * follows a token to the colour it finally names
 * @param tokens the scheme's tokens
 * @param name the property to read, including its leading dashes
 * @returns the colour, with every `var()` followed
 */
function resolve(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name) ?? "";
  const alias = /^var\((--[\w-]+)\)$/u.exec(value);

  return alias ? resolve(tokens, alias[1] as string) : value;
}

/**
 * reads a colour into OKLab.
 *
 * the page authors its light half in hex and its dark half in `oklch`, and a
 * threshold that only holds for one of those spellings is a threshold that
 * holds for neither. `oklch` is OKLab in polar form, so it converts by angle
 * alone; hex takes the sRGB transfer curve and the published matrices.
 * @param css the colour as the token spells it
 * @returns the colour in OKLab
 */
function readLab(css: string): Lab {
  const hex = /^#([0-9a-f]{6})$/iu.exec(css);
  if (!hex) {
    const [lightness = 0, chroma = 0, hue = 0] = (
      /^oklch\(([^)]*)\)$/iu.exec(css)?.[1] ?? ""
    )
      .split(/[\s/]+/u)
      .filter(Boolean)
      .map(Number);
    const angle = (hue * Math.PI) / 180;

    return [lightness, chroma * Math.cos(angle), chroma * Math.sin(angle)];
  }
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((at) => {
    const channel = parseInt((hex[1] as string).slice(at, at + 2), 16) / 255;

    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [long = 0, medium = 0, short = 0] = [
    0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue,
    0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue,
    0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue,
  ].map((one) => Math.cbrt(one));

  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
}

/**
 * paints a colour back out to sRGB, the way a browser does
 * @param css the colour as the token spells it
 * @returns each channel from 0 to 255
 */
function readRgb(css: string): [number, number, number] {
  const [lightness, green, blue] = readLab(css);
  const [long = 0, medium = 0, short = 0] = [
    lightness + 0.3963377774 * green + 0.2158037573 * blue,
    lightness - 0.1055613458 * green - 0.0638541728 * blue,
    lightness - 0.0894841775 * green - 1.291485548 * blue,
  ].map((one) => one ** 3);

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ].map((linear) => {
    const encoded =
      linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

    return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  }) as [number, number, number];
}

/**
 * measures how far apart two colours look
 * @param one a colour
 * @param other another
 * @returns the distance in OKLab
 */
function apart(one: string, other: string): number {
  const [a, b, c] = readLab(one);
  const [x, y, z] = readLab(other);

  return Math.hypot(a - x, b - y, c - z);
}

/**
 * measures how readable one colour is against another
 * @param one a colour
 * @param other another
 * @returns the WCAG contrast ratio
 */
function contrast(one: string, other: string): number {
  const relative = (css: string): number => {
    const [red = 0, green = 0, blue = 0] = readRgb(css).map((channel) => {
      const scaled = channel / 255;

      return scaled <= 0.03928
        ? scaled / 12.92
        : ((scaled + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [brighter, darker] = [relative(one), relative(other)].sort(
    (a, b) => b - a,
  ) as [number, number];

  return (brighter + 0.05) / (darker + 0.05);
}

/** every pair of tags, each pair once. */
const PAIRS = TAGS.flatMap((one, at) =>
  TAGS.slice(at + 1).map((other) => [one, other] as const),
);

describe("const:TOKEN_CSS", () => {
  it("should paint a colour the way a browser paints it", () => {
    // the thresholds below are only worth as much as this conversion is, and
    // nothing in this suite can open a browser. So these are what Chrome
    // itself resolved these very declarations to, read back off a canvas:
    // a conversion that drifts from a real renderer fails here first
    const painted = {
      "oklch(.77 .075 200)": "#78c3c7",
      "oklch(.285 .045 200)": "#053133",
      "oklch(.74 .115 278)": "#9aa3f3",
      "oklch(.9 .055 282)": "#d7daff",
      "oklch(.74 .1 146)": "#81bc85",
      "oklch(.27 .045 145)": "#182c18",
      "oklch(.7 .15 30)": "#ed7665",
      "oklch(.31 .07 30)": "#4e211a",
      "oklch(.82 .11 74)": "#efb970",
      "oklch(.92 .05 82)": "#f5e2c0",
    };
    for (const [css, expected] of Object.entries(painted))
      expect(
        `#${readRgb(css)
          .map((channel) => channel.toString(16).padStart(2, "0"))
          .join("")}`,
      ).toBe(expected);
  });

  for (const which of ["light", "dark"] as const)
    describe(`in ${which}`, () => {
      const tokens = scheme(which);
      const tag = (name: string, part: string): string =>
        resolve(tokens, `--tag-${name}${part}`);

      it("should let every tag badge be read at the size it is drawn", () => {
        for (const name of TAGS)
          expect([name, contrast(tag(name, "-ink"), tag(name, "-soft")) >= READABLE])
            .toStrictEqual([name, true]);
      });

      it("should give no two tags the same text colour", () => {
        // the ink is the tag's name as the reader reads it, so two tags whose
        // inks a reader cannot tell apart are one tag wearing two words
        for (const [one, other] of PAIRS)
          expect([
            `${one}/${other}`,
            apart(tag(one, "-ink"), tag(other, "-ink")) >= APART.ink,
          ]).toStrictEqual([`${one}/${other}`, true]);
      });

      it("should give no two tags the same edge", () => {
        // the fill is a wash at every tag, so the edge carries the hue; it is
        // held further apart than the ink because it is the hue at full
        // strength and has the whole gamut to move in
        for (const [one, other] of PAIRS)
          expect([
            `${one}/${other}`,
            apart(tag(one, ""), tag(other, "")) >= APART.edge,
          ]).toStrictEqual([`${one}/${other}`, true]);
      });
    });
});
