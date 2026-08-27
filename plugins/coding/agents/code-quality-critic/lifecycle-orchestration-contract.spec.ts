import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const agent = import.meta.dirname;
const evaluator = resolve(agent, "../../../web/agents/aesthetic-evaluator");

async function hookCommand(agentRoot = agent): Promise<string> {
  const frontmatter = JSON.parse(
    await readFile(join(agentRoot, "frontmatter/claude.json"), "utf8"),
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
    ".state/works/checkout-refunds/reviews/correctness.md",
    "/tmp/target/.state/works/checkout-refunds/reviews/quality.md",
    ".state/works/checkout-refunds/reviews/security.md",
    ".state/works/checkout-refunds/extra/reviews/quality.md",
    ".state/works/checkout-refunds/report-findings.md",
    "docs/change.review.md",
    "README.md",
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

  it("keeps the aesthetic evaluator's report allowance outside protected systems", async () => {
    const command = await hookCommand(evaluator);
    for (const path of [
      ".state/works/demo/REVIEW-visual.md",
      "docs/report-visual.md",
      "README.md",
    ]) {
      const output = JSON.parse(runHook(command, path));
      expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
    }
    for (const path of [
      ".claude/agent-memory/aesthetic-evaluator/MEMORY.md",
      "reports/report-visual.md",
      "notes/change.review.md",
    ]) {
      expect(runHook(command, path)).toBe("");
    }
  });
});
