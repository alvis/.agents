import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checkPlugin } from "../../../scripts/contract_footprint.ts";

const plugin = resolve(import.meta.dirname, "..");

describe("web contract footprint budget", () => {
  it("should keep the web contract footprint within budget", () => {
    expect(
      checkPlugin(
        plugin,
        ["hooks/ALLAGENT.md", "hooks/MAINAGENT.md"],
        ["hooks/ALLAGENT.md"],
      ),
    ).toEqual([]);
  });
});
