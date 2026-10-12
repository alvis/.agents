import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../../../scripts/harness_contract.ts";

import type { SpawnSyncReturns } from "node:child_process";

const hook = resolve(import.meta.dirname, "post-rewrite-hook.sh");

const rewritingSnake = JSON.stringify({
  tool_name: "Bash",
  tool_input: { command: "git rebase main" },
  tool_output: { exit_code: 0 },
});
const rewritingCamel = JSON.stringify({
  tool_name: "Bash",
  toolInput: { command: "git rebase main" },
  toolOutput: { exitCode: 0 },
});

describe("commit post-rewrite hook", () => {
  it.each(HARNESS_ROOT_VARIABLES)(
    "should report the checkpoint outcome for a rewrite under %s",
    (variable) => {
      const root = createFixture();
      const completed = runHook(root, rewritingSnake, variable);
      expect(completed.status, completed.stderr).toBe(0);
      expectVerified(root);
    },
  );

  it.each(HARNESS_ROOT_VARIABLES)(
    "should read the rewrite and exit code from camelCase keys under %s",
    (variable) => {
      const root = createFixture();
      const completed = runHook(root, rewritingCamel, variable);
      expect(completed.status, completed.stderr).toBe(0);
      expectVerified(root);
    },
  );

  it.each([
    "git rebase main",
    "rtk git rebase main",
    "rtk proxy git rebase main",
    "git commit --amend --no-edit",
    'git commit -m "message" --amend',
    "rtk git commit --amend --no-edit",
    "rtk proxy git commit --amend --no-edit",
  ])("should verify successful %s against its backup", (command) => {
    const root = createFixture();
    const completed = runHook(
      root,
      JSON.stringify({ tool_input: { command }, tool_output: { exit_code: 0 } }),
    );
    expect(completed.status, completed.stderr).toBe(0);
    expectVerified(root);
    expect(completed.stderr).toMatch(/GIT_TREE:\s+PASS/);
    expect(completed.stderr).toMatch(/CONTENT:\s+PASS/);
  });

  it.each([
    "git rebase main",
    "rtk git rebase main",
    "rtk proxy git rebase main",
    "git commit --amend --no-edit",
    'git commit -m "message" --amend',
    "rtk git commit --amend --no-edit",
    "rtk proxy git commit --amend --no-edit",
  ])("should skip verification after failed %s", (command) => {
    const root = createFixture();
    const completed = runHook(
      root,
      JSON.stringify({ toolInput: { command }, toolOutput: { exitCode: 1 } }),
    );
    expect({
      status: completed.status,
      stdout: completed.stdout,
      stderr: completed.stderr,
    }).toEqual({ status: 0, stdout: "", stderr: "" });
    expect(
      existsSync(resolve(root, "checkpoints/git-backups/repo/.verify-result")),
    ).toBe(false);
  });

  it.each([
    "git commit -m save",
    "git commit --amendment",
    'git commit -m "mention --amend"',
    "git commit -m 'mention --amend'",
    String.raw`git commit -m "mention \" --amend \""`,

    "jj describe -m save",
    "jj new",
    "jj split",
    "jj rebase -d main",
    "jj squash",
    "jj absorb",
    "jj abandon",
    "jj edit @-",
    "jj undo",
    "jj op restore previous",
  ].flatMap((command) => [command, `rtk ${command}`, `rtk proxy ${command}`]))(
    "should ignore a stale checkpoint and stay silent after %s",
    (command) => {
      const root = createFixture();
      const checkpointRoot = resolve(root, "checkpoints/git-backups/repo");
      const files = readdirSync(checkpointRoot);
      const checkpoint = readFileSync(
        resolve(checkpointRoot, ".checkpoint"),
        "utf8",
      );
      writeFileSync(resolve(root, "repo/tracked.txt"), "changed since checkpoint\n");
      const completed = runHook(
        root,
        JSON.stringify({ tool_input: { command }, tool_output: { exit_code: 0 } }),
      );
      expect({
        status: completed.status,
        stdout: completed.stdout,
        stderr: completed.stderr,
      }).toEqual({ status: 0, stdout: "", stderr: "" });
      expect(readdirSync(checkpointRoot)).toEqual(files);
      expect(readFileSync(resolve(checkpointRoot, ".checkpoint"), "utf8")).toBe(
        checkpoint,
      );
    },
  );

  it("should report the checkpoint outcome when no harness variable resolves", () => {
    const root = createFixture();
    const completed = runHook(root, rewritingSnake);
    expect(completed.status, completed.stderr).toBe(0);
    expectVerified(root);
  });
});

function createFixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), "post-rewrite-hook-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, "checkpoints"));
  const repo = resolve(root, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  writeFileSync(resolve(repo, "tracked.txt"), "original content\n");
  for (const args of [
    ["add", "tracked.txt"],
    [
      "-c",
      "user.name=Hook Test",
      "-c",
      "user.email=hook@example.test",
      "commit",
      "--no-gpg-sign",
      "-qm",
      "initial",
    ],
  ]) {
    const completed = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    expect(completed.status, completed.stderr).toBe(0);
  }
  const backup = spawnSync("bash", [resolve(import.meta.dirname, "backup.sh")], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: resolve(root, "checkpoints") },
  });
  expect(backup.status, backup.stderr).toBe(0);
  return root;
}

function runHook(
  root: string,
  input: string,
  variable?: string,
): SpawnSyncReturns<string> {
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

function expectVerified(root: string): void {
  const result = readFileSync(
    resolve(root, "checkpoints/git-backups/repo/.verify-result"),
    "utf8",
  );
  expect(result).toMatch(/^GIT_TREE_MATCH=PASS$/m);
  expect(result).toMatch(/^CONTENT_MATCH=PASS$/m);
}
