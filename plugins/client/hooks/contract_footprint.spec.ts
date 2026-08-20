import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checkPlugin } from "../../../scripts/contract_footprint.ts";

const plugin = resolve(import.meta.dirname, "..");

describe("client contract footprint budget", () => {
  it("should keep the client contract footprint within budget", () => {
    expect(
      checkPlugin(plugin, ["hooks/ALLAGENT.md"], ["hooks/ALLAGENT.md"]),
    ).toEqual([]);
  });
});
