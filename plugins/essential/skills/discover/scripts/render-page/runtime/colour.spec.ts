import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toHex, tokenHex } from "./colour.ts";

/** the fill the last painted context was told to use. */
let fills: string[];

/** what the stub context hands back for the single pixel. */
let pixel: number[];

/** whether the canvas admits to having a 2d context at all. */
let hasContext: boolean;

beforeEach(() => {
  fills = [];
  pixel = [0, 0, 0, 255];
  hasContext = true;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () =>
        hasContext
          ? {
              set fillStyle(value: string) {
                fills.push(value);
              },
              fillRect: () => undefined,
              getImageData: () => ({ data: pixel }),
            }
          : null,
    }),
  } as unknown as Document;
});

afterEach(() => {
  delete (globalThis as { document?: Document }).document;
  delete (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
});

describe("fn:toHex", () => {
  it("should read the colour back off the pixel, not off the context", () => {
    // a context hands back the string it was given, so oklch would survive the
    // round trip unconverted; painting is the only place the browser resolves it
    pixel = [18, 52, 86, 255];

    expect(toHex("oklch(.5 .1 265)")).toBe("#123456");
  });

  it("should pad every channel to two digits", () => {
    pixel = [1, 2, 3, 255];

    expect(toHex("#010203")).toBe("#010203");
  });

  it("should paint the sentinel first, so an unparseable value cannot inherit", () => {
    // without the opaque undercoat a token the browser rejects would leave the
    // previous token's colour on the pixel and read back as that instead
    toHex("not-a-colour");

    expect(fills).toStrictEqual(["#000000", "not-a-colour"]);
  });

  it("should fall back to black when there is no context to paint on", () => {
    hasContext = false;

    expect(toHex("#ffffff")).toBe("#000000");
  });
});

describe("fn:tokenHex", () => {
  it("should trim the value a custom property reads back with", () => {
    // getPropertyValue keeps the authored leading space, and a colour with one
    // is not a colour any parser accepts
    let asked = "";
    globalThis.getComputedStyle = (() => ({
      getPropertyValue: (token: string) => {
        asked = token;

        return " oklch(.5 .1 265) ";
      },
    })) as unknown as typeof globalThis.getComputedStyle;
    pixel = [255, 255, 255, 255];

    expect(tokenHex({} as Element, "--ui-accent")).toBe("#ffffff");
    expect(asked).toBe("--ui-accent");
    expect(fills).toStrictEqual(["#000000", "oklch(.5 .1 265)"]);
  });
});
