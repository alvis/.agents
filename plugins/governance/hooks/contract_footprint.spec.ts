import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checkPlugin } from "../../../scripts/contract_footprint.ts";

const plugin = resolve(import.meta.dirname, "..");

describe("governance contract footprint budget", () => {
  it("should keep the governance contract footprint within budget", () => {
    expect(
      checkPlugin(plugin, ["hooks/ALLAGENT.md"], ["hooks/ALLAGENT.md"]),
    ).toEqual([]);
  });
});
