import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, onTestFinished } from "vitest";

import { HARNESS_ROOT_VARIABLES } from "../../../../../scripts/harness_contract.ts";

import type { SpawnSyncReturns } from "node:child_process";

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

const hook = resolve(import.meta.dirname, "pre-commit-hook.sh");

const rewritingSnake = JSON.stringify({
  tool_name: "Bash",
  tool_input: { command: "git rebase main" },
});
const rewritingCamel = JSON.stringify({
  tool_name: "Bash",
  toolInput: { command: "git rebase main" },
});

describe("commit pre-commit hook", () => {
  it.each(HARNESS_ROOT_VARIABLES)(
    "should emit the native allow envelope for a rewrite under %s",
    (variable) => {
      const completed = runHook(createFixture(), rewritingSnake, variable);
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectClaudeAllow(output);
    },
  );

  it.each(HARNESS_ROOT_VARIABLES)(
    "should read the rewrite command from camelCase toolInput under %s",
    (variable) => {
      const completed = runHook(createFixture(), rewritingCamel, variable);
      expect(completed.status, completed.stderr).toBe(0);
      const output = JSON.parse(completed.stdout) as Envelope;
      if (variable === "GROK_PLUGIN_ROOT") expectGrokAllow(output);
      else expectClaudeAllow(output);
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
  ])("should preserve working-tree files before %s", (command) => {
    const root = createFixture();
    const completed = runHook(root, JSON.stringify({ tool_input: { command } }));
    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stdout).not.toBe("");
    const checkpoint = readFileSync(
      resolve(root, "checkpoints/git-backups/repo/.checkpoint"),
      "utf8",
    );
    const backup = checkpoint.match(/^BACKUP_PATH=(.+)$/m)?.[1] ?? "";
    expect(backup).not.toBe("");
    expect(readFileSync(resolve(backup, "untracked.txt"), "utf8")).toBe(
      "working copy\n",
    );
    expect(existsSync(resolve(backup, ".git"))).toBe(true);
  });

  it("should preserve a linked worktree's live index during an amendment backup", () => {
    const root = createFixture();
    const repository = resolve(root, "repo");
    const main = resolve(root, "main");
    writeFileSync(resolve(repository, "selected.txt"), "selected baseline\n");
    writeFileSync(resolve(repository, "unstaged.txt"), "unstaged baseline\n");
    runGit(repository, ["add", "selected.txt", "unstaged.txt"]);
    const commitArguments = [
      "-c",
      "user.name=Hook Test",
      "-c",
      "user.email=hook@example.test",
      "commit",
      "--no-gpg-sign",
      "-qm",
      "initial",
    ];
    runGit(repository, commitArguments);
    renameSync(repository, main);
    runGit(main, ["worktree", "add", "-b", "rewrite", repository]);
    runGit(repository, [...commitArguments, "--allow-empty"]);
    writeFileSync(resolve(repository, "selected.txt"), "selected change\n");
    runGit(repository, ["add", "selected.txt"]);
    writeFileSync(resolve(repository, "unstaged.txt"), "unstaged change\n");
    writeFileSync(resolve(repository, "untracked.txt"), "untracked change\n");
    const index = resolve(
      repository,
      runGit(repository, ["rev-parse", "--git-path", "index"]).trim(),
    );
    const originalIndex = readFileSync(index);
    const originalStatus = runGit(repository, ["status", "--porcelain=v1", "-z"]);
    const originalHead = runGit(repository, ["rev-parse", "HEAD"]);

    const completed = runHook(
      root,
      JSON.stringify({ tool_input: { command: "git commit --amend --no-edit" } }),
    );

    expect(completed.status, completed.stderr).toBe(0);
    expect(completed.stdout, completed.stderr).not.toBe("");
    expect.soft(readFileSync(index).equals(originalIndex)).toBe(true);
    expect.soft(runGit(repository, ["status", "--porcelain=v1", "-z"])).toBe(
      originalStatus,
    );
    expect.soft(runGit(repository, ["rev-parse", "HEAD"])).toBe(originalHead);
    const checkpoint = readFileSync(
      resolve(root, "checkpoints/git-backups/repo/.checkpoint"),
      "utf8",
    );
    const backup = checkpoint.match(/^BACKUP_PATH=(.+)$/m)?.[1] ?? "";
    expect(backup).not.toBe("");
    expect([
      readFileSync(resolve(backup, "selected.txt"), "utf8"),
      readFileSync(resolve(backup, "unstaged.txt"), "utf8"),
      readFileSync(resolve(backup, "untracked.txt"), "utf8"),
    ]).toEqual(["selected change\n", "unstaged change\n", "untracked change\n"]);
    expect.soft(statSync(resolve(backup, ".git")).isDirectory()).toBe(true);
    renameSync(main, resolve(root, "disconnected-main"));
    expect(runGit(backup, ["rev-parse", "HEAD"])).toBe(originalHead);
    expect(runGit(backup, ["show", "HEAD:selected.txt"])).toBe(
      "selected baseline\n",
    );
    expect(readFileSync(resolve(backup, ".git/index")).equals(originalIndex)).toBe(true);
    expect(runGit(backup, ["status", "--porcelain=v1", "-z"])).toBe(originalStatus);
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
    "should leave existing backups untouched and stay silent before %s",
    (command) => {
      const root = createFixture();
      const checkpointRoot = resolve(root, "checkpoints/git-backups/repo");
      mkdirSync(checkpointRoot, { recursive: true });
      writeFileSync(resolve(checkpointRoot, ".checkpoint"), "stale checkpoint\n");
      const completed = runHook(root, JSON.stringify({ tool_input: { command } }));
      expect({
        status: completed.status,
        stdout: completed.stdout,
        stderr: completed.stderr,
      }).toEqual({ status: 0, stdout: "", stderr: "" });
      expect(readdirSync(checkpointRoot)).toEqual([".checkpoint"]);
      expect(readFileSync(resolve(checkpointRoot, ".checkpoint"), "utf8")).toBe(
        "stale checkpoint\n",
      );
    },
  );

  it("should keep the Claude envelope when no harness variable resolves", () => {
    const completed = runHook(createFixture(), rewritingSnake);
    expect(completed.status, completed.stderr).toBe(0);
    expectClaudeAllow(JSON.parse(completed.stdout) as Envelope);
  });
});

function createFixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), "pre-commit-hook-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, "checkpoints"));
  const repo = resolve(root, "repo");
  mkdirSync(repo);
  const init = spawnSync("git", ["init", "-q", repo], { encoding: "utf8" });
  expect(init.status, init.stderr).toBe(0);
  writeFileSync(resolve(repo, "untracked.txt"), "working copy\n");
  return root;
}

function runGit(repository: string, arguments_: readonly string[]): string {
  const completed = spawnSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  expect(completed.status, completed.stderr).toBe(0);
  return completed.stdout;
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
