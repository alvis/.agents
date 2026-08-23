import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../../../scripts/harness_contract.ts";

const hook = resolve(import.meta.dirname, "post-rewrite-hook.sh");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), "post-rewrite-hook-"));
  roots.push(root);
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
  tool_output: { exit_code: 0 },
});
const rewritingCamel = JSON.stringify({
  tool_name: "Bash",
  toolInput: { command: "jj rebase -d main" },
  toolOutput: { exitCode: 0 },
});

// Reaching the checkpoint stage proves both stdin reads succeeded: the
// command matched a rewriting op and the exit code parsed as 0.
const CHECKPOINT_OUTCOME = "No checkpoint found, skipping integrity verify";

describe("commit post-rewrite hook", () => {
  it.each(HARNESS_ROOT_VARIABLES)(
    "should report the checkpoint outcome for a rewrite under %s",
    (variable) => {
      const completed = runHook(fixture(), rewritingSnake, variable);
      expect(completed.status, completed.stderr).toBe(0);
      expect(completed.stderr).toContain(CHECKPOINT_OUTCOME);
    },
  );

  it.each(HARNESS_ROOT_VARIABLES)(
    "should read the rewrite and exit code from camelCase keys under %s",
    (variable) => {
      const completed = runHook(fixture(), rewritingCamel, variable);
      expect(completed.status, completed.stderr).toBe(0);
      expect(completed.stderr).toContain(CHECKPOINT_OUTCOME);
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
          tool_output: { exit_code: 0 },
        }),
        variable,
      );
      expect(completed.status, completed.stderr).toBe(0);
      expect(completed.stdout).toBe("");
      expect(completed.stderr).toBe("");
    },
  );

  it("should report the checkpoint outcome when no harness variable resolves", () => {
    const completed = runHook(fixture(), rewritingSnake);
    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stderr).toContain(CHECKPOINT_OUTCOME);
  });
});
