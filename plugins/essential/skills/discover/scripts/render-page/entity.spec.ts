import { describe, expect, it } from "vitest";

import { decodeText } from "./entity.ts";

describe("fn:decodeText", () => {
  it("should resolve the references it knows", () => {
    expect(decodeText("j&colon;&sol;&sol;x")).toStrictEqual({
      text: "j://x",
    });
  });

  it("should say which reference it could not resolve", () => {
    expect(decodeText("a &blk34; b")).toStrictEqual({
      text: "a &blk34; b",
      unresolved: "&blk34;",
    });
  });

  it("should refuse a name only Object.prototype answers to", () => {
    // the table is a lookup keyed by what the author wrote, so a plain object
    // would answer `&constructor;` out of its own prototype and hand back a
    // function's source as the resolved text — a reference passed through
    // under the name of one refused, which is the one thing this cannot do
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty"])
      expect(decodeText(`&${name};`)).toStrictEqual({
        text: `&${name};`,
        unresolved: `&${name};`,
      });
  });
});
