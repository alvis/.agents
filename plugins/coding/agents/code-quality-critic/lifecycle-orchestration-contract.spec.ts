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
    env: { ...process.env, HOME: "/home/dev" },
    input: JSON.stringify({ tool_input: { file_path: path } }),
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout.trim();
}

describe("code-quality critic lifecycle write authorization", () => {
  it.each([
    "/home/dev/.agents/states/github.com/acme/shop/works/checkout-refunds/reviews/correctness.md",
    "~/.agents/states/github.com/acme/shop/works/checkout-refunds/reviews/quality.md",
    "/home/dev/.agents/states/github.com/acme/shop/works/checkout-refunds/reviews/security.md",
    "/home/dev/.agents/states/github.com/acme/shop/works/checkout-refunds/extra/reviews/quality.md",
    "/home/dev/.agents/states/github.com/acme/shop/works/checkout-refunds/report-findings.md",
    "docs/change.review.md",
    "README.md",
    "src/payment.ts",
    ".claude/agent-memory/code-quality-critic/MEMORY.md",
    "/home/dev/.agents/states/github.com/acme/shop/memories/aesthetic-evaluator/MEMORY.md",
    "/home/dev/.agents/states/github.com/acme/shop/memories/code-quality-critic/../../overview.md",
    "reports/../src/report-payment.ts",
    "/home/dev/.agents/states/github.com/acme/shop/works/demo/memories/code-quality-critic/MEMORY.md",
    "/home/dev/.agents/states/github.com/acme/shop/memories/aesthetic-evaluator/memories/code-quality-critic/MEMORY.md",
    "/home/dev/.agents/states/github.com/acme/shop/archive/demo/memories/code-quality-critic/MEMORY.md",
    "/home/dev/./.agents/states/github.com/acme/shop/works/demo/REVIEW-quality.md",
    "/home/dev//.agents/states/github.com/acme/shop/works/demo/REVIEW-quality.md",
    "~/.agents/states/github.com/acme/shop/works/demo/REVIEW-quality.md",
  ])("denies non-owned path %s", async (path) => {
    const output = JSON.parse(runHook(await hookCommand(), path));
    expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it.each([
    "/home/dev/.agents/states/github.com/acme/shop/memories/code-quality-critic/MEMORY.md",
    "/home/dev/.agents/states/gitlab.com/a/b/c/memories/code-quality-critic/topics/review/precedents.md",
    "/home/dev/.agents/states/github.com/acme/shop/memories/code-quality-critic/archive/2026-11.md",
    "/home/dev/.agents/states/github.com/acme/shop/memories/code-quality-critic/topics/works/notion-sync.md",
    "reports/report-quality.md",
    "notes/change.review.md",
    "/home/dev/repos/.agents/states/REVIEW-quality.md",
  ])("allows its own memory or a safe report path %s", async (path) => {
    expect(runHook(await hookCommand(), path)).toBe("");
  });

  it("keeps the aesthetic evaluator's report allowance outside protected systems", async () => {
    const command = await hookCommand(evaluator);
    for (const path of [
      "/home/dev/.agents/states/github.com/acme/shop/works/demo/REVIEW-visual.md",
      "/home/dev/.agents/states/github.com/acme/shop/memories/code-quality-critic/MEMORY.md",
      "docs/report-visual.md",
      "README.md",
    ]) {
      const output = JSON.parse(runHook(command, path));
      expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
    }
    for (const path of [
      "/home/dev/.agents/states/github.com/acme/shop/memories/aesthetic-evaluator/MEMORY.md",
      "reports/report-visual.md",
      "notes/change.review.md",
    ]) {
      expect(runHook(command, path)).toBe("");
    }
  });
});
