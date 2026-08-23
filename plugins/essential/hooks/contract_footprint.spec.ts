import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checkPlugin } from "../../../scripts/contract_footprint.ts";

const plugin = resolve(import.meta.dirname, "..");

describe("essential contract footprint budget", () => {
  it("should keep the essential contract footprint within budget", () =>
    expect(
      checkPlugin(
        plugin,
        ["hooks/ALLAGENT.md", "hooks/MAINAGENT.md", "hooks/SUBAGENT.md"],
        ["hooks/ALLAGENT.md", "references/working-attitude.md"],
      ),
    ).toEqual([]));
});
