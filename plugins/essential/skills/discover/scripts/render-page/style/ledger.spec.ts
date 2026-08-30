import { describe, expect, it } from "vitest";

import { LEDGER_CSS } from "./ledger.ts";
import { LEDGER_TONES } from "../vocabulary.ts";

/** the three custom properties a row's tone sets, and the sheet then reads. */
const ROW = ["--row-edge", "--row-wash", "--row-ink"];

/** every tone the sheet writes a rule for, in the order it writes them. */
function toned(): string[] {
  return [...LEDGER_CSS.matchAll(/\.ledger-entry\[data-tone="([a-z]+)"\]/gu)].map(
    ([, tone]) => tone!,
  );
}

describe("LEDGER_CSS", () => {
  it("should paint every tone the block can emit", () => {
    // the renderer defaults an unstated tone to `neutral` and refuses anything
    // outside this list, so a tone with no rule is a row drawn with its three
    // properties unset — which is how the callout came to show a green edge on
    // a body painted from the accent family
    expect(toned().sort()).toStrictEqual([...LEDGER_TONES].sort());
  });

  it("should set all three of a row's properties in each of those rules", () => {
    // a tone that sets the edge and leaves the wash is the same defect one
    // step smaller: the row's colours would come half from its own state and
    // half from whichever tone the sheet happened to write last
    for (const tone of LEDGER_TONES) {
      const rule = new RegExp(
        `\\.ledger-entry\\[data-tone="${tone}"\\]\\{([^}]*)\\}`,
        "u",
      ).exec(LEDGER_CSS)?.[1];

      expect(rule, tone).toBeDefined();
      for (const property of ROW) expect(rule, `${tone} ${property}`).toContain(property);
    }
  });

  it("should read no row property it never sets", () => {
    const read = new Set(
      [...LEDGER_CSS.matchAll(/var\((--row-[a-z-]+)\)/gu)].map(([, name]) => name!),
    );

    expect([...read].filter((name) => !ROW.includes(name))).toStrictEqual([]);
  });
});
