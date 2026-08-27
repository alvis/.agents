import { describe, expect, it } from "vitest";

import { StubElement } from "../../dom-support.ts";
import { SCHEME_KEY } from "./theme.ts";

/** the element the scheme's tokens hang off. */
const root = new StubElement("html");

/**
 * the document as it stands while the head is still parsing.
 *
 * deliberately without a body: the module runs before one exists, and reaching
 * for it here would throw rather than quietly work in a test and fail on a
 * real page.
 */
globalThis.document = { documentElement: root } as unknown as Document;
globalThis.localStorage = {
  getItem: (key: string) => (key === SCHEME_KEY ? "dark" : null),
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage;

await import("./boot.ts");

describe("md:boot", () => {
  it("should apply the saved scheme before the first paint", () => {
    // applying it any later shows the reader the system's colours and then
    // replaces them, which is the flash a manual override exists to remove
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("should run without a body, because there is not one yet", () => {
    expect((globalThis.document as unknown as { body?: unknown }).body).toBeUndefined();
  });
});
