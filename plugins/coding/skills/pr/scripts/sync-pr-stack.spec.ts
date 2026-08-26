import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("PR stack synchronization regressions", () => {
  it("should pass the portable stack synchronization regression", () => {
    const result = spawnSync(
      "/bin/bash",
      [resolve(import.meta.dirname, "test-sync-pr-stack.sh")],
      { encoding: "utf8", timeout: 60_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("sync-pr-stack:");
  }, 70_000);
});
