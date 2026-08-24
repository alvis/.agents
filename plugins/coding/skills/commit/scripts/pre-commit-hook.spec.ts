import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../../../scripts/harness_contract.ts";

const hook = resolve(import.meta.dirname, "pre-commit-hook.sh");

interface ClaudeEnvelope {
  readonly hookSpecificOutput?: {
    readonly additionalContext?: string;
    readonly permissionDecision?: string;
  };
}
interface GrokEnvelope {
  readonly decision?: string;
  readonly reason?: string;
}
type Envelope = ClaudeEnvelope & GrokEnvelope;

function fixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), "pre-commit-hook-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, "checkpoints"));
  const repo = resolve(root, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  return root;
}

function runHook(root: string, input: string, variable?: string) {
  const environment = { ...process.env };
  for (const name of HARNESS_ROOT_VARIABLES) delete environment[name];
  if (variable !== undefined) environment[variable] = "/plugins/coding";
  return spawnSync("bash", [hook], {
    encoding: "utf8",
    cwd: resolve(root, "repo"),
    env: { ...environment, TMPDIR: resolve(root, "checkpoints") },
    input,
  });
}

const rewritingSnake = JSON.stringify({
  tool_name: "Bash",
  tool_input: { command: "jj rebase -d main" },
});
const rewritingCamel = JSON.stringify({
  tool_name: "Bash",
  toolInput: { command: "jj rebase -d main" },
});

function expectClaudeAllow(output: Envelope): void {
  expect(output.decision).toBeUndefined();
  expect(output.reason).toBeUndefined();
  expect(output.hookSpecificOutput?.permissionDecision).toBe("allow");
  expect(output.hookSpecificOutput?.additionalContext).toMatch(
    /^Auto-backup: GIT_TREE_SHA=\S+ CONTENT_HASH=\S+ BACKUP_PATH=\S+$/,
  );
}

function expectGrokAllow(output: Envelope): void {
  expect(output.decision).toBe("allow");
  expect(output.reason).toMatch(/^Auto-backup: /);
  expect(output.hookSpecificOutput).toBeUndefined();
}

describe("commit pre-commit hook", () => {
  it.each(HARNESS_ROOT_VARIABLES)(
    "should emit the native allow envelope for a rewrite under %s",
    (variable) => {
      const completed = runHook(fixture(), rewritingSnake, variable);
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectClaudeAllow(output);
    },
  );

  it.each(HARNESS_ROOT_VARIABLES)(
    "should read the rewrite command from camelCase toolInput under %s",
    (variable) => {
      const completed = runHook(fixture(), rewritingCamel, variable);
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectClaudeAllow(output);
    },
  );

  it.each(HARNESS_ROOT_VARIABLES)(
    "should stay silent for a plain save under %s",
    (variable) => {
      const completed = runHook(
        fixture(),
        JSON.stringify({
          tool_name: "Bash",
          tool_input: { command: "git commit -m feat: x" },
        }),
        variable,
      );
      expect(completed.status, completed.stderr).toBe(0);
      expect(completed.stdout).toBe("");
    },
  );

  it("should keep the Claude envelope when no harness variable resolves", () => {
    const completed = runHook(fixture(), rewritingSnake);
    expect(completed.status, completed.stderr).toBe(0);
    expectClaudeAllow(JSON.parse(completed.stdout) as Envelope);
  });
});
