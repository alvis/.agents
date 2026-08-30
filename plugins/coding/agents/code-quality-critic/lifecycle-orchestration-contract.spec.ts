import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const agent = import.meta.dirname;

async function hookCommand(): Promise<string> {
  const frontmatter = JSON.parse(
    await readFile(join(agent, "frontmatter/claude.json"), "utf8"),
  );
  return frontmatter.hooks.PreToolUse[0].hooks[0].command;
}

function runHook(command: string, path: string): string {
  const result = spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { file_path: path } }),
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe("code-quality critic lifecycle write authorization", () => {
  it.each([
    ".state/works/checkout-refunds/review.mdc",
    "/tmp/target/.state/works/checkout-refunds/review.mdc",
  ])("allows the canonical review graph document %s", async (path) => {
    expect(runHook(await hookCommand(), path)).toBe("");
  });

  it.each([
    ".state/works/checkout-refunds/reviews/correctness.md",
    ".state/works/checkout-refunds/reviews/quality.mdc",
    ".state/works/checkout-refunds/extra/review.mdc",
    ".state/archive/checkout-refunds/review.mdc",
    "src/payment.ts",
  ])("denies non-owned path %s", async (path) => {
    const output = JSON.parse(runHook(await hookCommand(), path));
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it.each([
    ".claude/agent-memory/code-quality-critic/MEMORY.md",
    "reports/report-quality.md",
    "notes/change.review.md",
  ])("preserves existing safe report path %s", async (path) => {
    expect(runHook(await hookCommand(), path)).toBe("");
  });
});
