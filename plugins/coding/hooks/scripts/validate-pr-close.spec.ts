import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cloud, runScript } from "../../scripts/gh/spec-harness.ts";
import { classifyPrCloseCommand, createPullChangesReader } from "./validate-pr-close.ts";

import type { SpawnSyncReturns } from "node:child_process";

import type { PullChanges } from "./validate-pr-close.ts";

interface HookResult {
  readonly decision?: string;
  readonly hookSpecificOutput?: {
    readonly hookEventName: string;
    readonly permissionDecision: string;
    readonly permissionDecisionReason: string;
  };
  readonly reason?: string;
}

const pluginRoot = resolve(import.meta.dirname, "../..");
const guardPath = join(pluginRoot, "hooks/scripts/validate-pr-close.ts");
const startDirectory = "/work/app";
const forced = (argv: string) => `bun "${join(pluginRoot, "scripts/gh-pr-close.ts")}" ${argv} --force`;
const harnessCases = [
  { harness: "claude", tool: "Bash", field: "command", roots: { CLAUDE_PLUGIN_ROOT: pluginRoot } },
  {
    harness: "codex",
    tool: "exec_command",
    field: "cmd",
    roots: { PLUGIN_ROOT: pluginRoot, GROK_PLUGIN_ROOT: "/stale-grok", CLAUDE_PLUGIN_ROOT: "/stale-claude" },
  },
  {
    harness: "grok",
    tool: "shell_command",
    field: "command",
    roots: { GROK_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: "/stale-claude" },
  },
] as const;

/**
 * classifies a command against pull requests whose changed-file counts are fixed
 * @param command the shell command
 * @param changes changed files per selector; a missing selector reads as an error
 * @returns the decision and every read the guard made
 */
function classify(command: string, changes: Readonly<Record<string, number>> = {}) {
  const reads: Array<{ selector?: string; repo?: string; cwd?: string }> = [];
  const decision = classifyPrCloseCommand(command, pluginRoot, startDirectory, (selector, repo, cwd): PullChanges => {
    reads.push({
      ...(selector === undefined ? {} : { selector }),
      ...(repo === undefined ? {} : { repo }),
      ...(cwd === startDirectory ? {} : { cwd }),
    });
    const changedFiles = changes[selector ?? "current"];
    if (changedFiles === undefined) throw new Error("no pull requests found");
    return { number: Number(selector ?? 9), changedFiles };
  });
  return { decision, reads };
}

describe("fn:classifyPrCloseCommand", () => {
  it.each([
    ["gh pr close 12", "12", {}],
    ["gh pr close 12 --comment 'Superseded by the stack'", "12 --comment 'Superseded by the stack'", {}],
    ["gh -R acme/app pr close 12", "12 --repo acme/app", { repo: "acme/app" }],
    ["gh --repo=acme/app pr close 12", "12 --repo=acme/app", { repo: "acme/app" }],
    ["gh -Racme/app pr close 12", "12 --repo acme/app", { repo: "acme/app" }],
    ["gh pr close 12 -R acme/app", "12 -R acme/app", { repo: "acme/app" }],
    ["rtk gh pr close 12", "12", {}],
    ["bash -c 'gh pr close 12'", "12", {}],
    ["FOO=1 /opt/homebrew/bin/gh pr close 12", "12", {}],
    ["cd repo && gh pr close 12", "12", { cwd: "/work/app/repo" }],
    ["cd \"$DIR\" && gh pr close 12 --repo acme/app", "12 --repo acme/app", { repo: "acme/app", cwd: "." }],
    ['bun plugins/coding/scripts/gh-pr-close.ts 12 --comment "$LINKS"', '12 --comment "$LINKS"', {}],
    ["bun plugins/coding/scripts/gh-pr-close.ts 12", "12", {}],
    ["FOO=1 ./plugins/coding/scripts/gh-pr-close.ts 12", "12", {}],
    ["bun run plugins/coding/scripts/gh-pr-close.ts 12 --force=false", "12", {}],
  ])("should refuse %s while the pull request still changes files", (command, argv, scope) => {
    const { decision, reads } = classify(command, { "12": 3 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([{ selector: "12", ...scope }]);
    expect(decision.reason).toContain("#12 still changes 3 files");
    expect(decision.reason).toContain("coding:directions/staged-delivery.md");
    expect(decision.reason).toContain(forced(argv));
  });

  it.each(["gh pr close 12", "bun plugins/coding/scripts/gh-pr-close.ts 12 --comment done"])(
    "should leave %s to the harness once the pull request is empty",
    (command) => {
      expect(classify(command, { "12": 0 }).decision.decision).toBe("ignore");
    },
  );

  it("should read the current branch's pull request when the close names none", () => {
    const { decision, reads } = classify("gh pr close", { current: 0 });
    expect(decision.decision).toBe("ignore");
    expect(reads).toEqual([{}]);
  });

  it.each([
    "bun plugins/coding/scripts/gh-pr-close.ts 12 --force",
    "bun run /opt/coding/scripts/gh-pr-close.ts 12 --force=true --repo acme/app",
    "/opt/coding/scripts/gh-pr-close.ts 12 --force",
  ])("should not check a forced close through the drop-in: %s", (command) => {
    expect(classify(command, { "12": 3 })).toEqual({ decision: expect.objectContaining({ decision: "ignore" }), reads: [] });
  });

  it("should refuse a raw gh close carrying --force, which gh would reject", () => {
    const { decision, reads } = classify("gh pr close 12 --force", { "12": 0 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([]);
    expect(decision.reason).toContain(forced("12"));
  });

  it("should refuse when whether the pull request is empty cannot be read", () => {
    const { decision } = classify("gh pr close 404");
    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("no pull requests found");
    expect(decision.reason).toContain(forced("404"));
  });

  it("should refuse a close whose arguments it cannot read", () => {
    const { decision, reads } = classify("gh pr close 12 --body done", { "12": 0 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([]);
  });

  it("should refuse the first close in a chain that names a pull request with changes", () => {
    const { decision, reads } = classify("gh pr close 1 && gh pr close 2", { "1": 0, "2": 5 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([{ selector: "1" }, { selector: "2" }]);
    expect(decision.reason).toContain("#2 still changes 5 files");
  });

  it.each([
    ["inside another command", "time gh pr close 12"],
    ["inside another command", "echo 12 | xargs gh pr close"],
    ["inside another command", "for n in 12; do gh pr close $n; done"],
    ["inside another command", "sudo gh pr close 12"],
    ["changes which repository", "GH_REPO=acme/app gh pr close 12"],
    ["changes which repository", "env GH_HOST=ghe.example gh pr close 12"],
    ["changes which repository", "GH_REPO=acme/app ./plugins/coding/scripts/gh-pr-close.ts 12"],
    ["inside another command", "echo 12 | xargs -n1 ./plugins/coding/scripts/gh-pr-close.ts"],
    ["inside another command", "for n in 12; do ./plugins/coding/scripts/gh-pr-close.ts $n; done"],
    ["shell expression", "gh pr close $DRAFT_NUMBER --repo acme/app"],
    ["shell expression", 'bun x/gh-pr-close.ts 12 --repo "$HOST/$REPOSITORY" --force'],
    ["repository is unknown", 'cd "$DIR" && gh pr close 12'],
    ["repository is unknown", "env -C ../other gh pr close 12"],
    ["repository is unknown", "pushd repo && gh pr close 12"],
    ["could not be read safely", "gh pr close $(gh pr list --json number --jq '.[0].number')"],
    ["could not be read safely", "cat <<EOF\nnotes\nEOF\ngh pr close 12"],
  ])("should refuse a close whose target it cannot pin (%s): %s", (cause, command) => {
    const { decision, reads } = classify(command, { "12": 0 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([]);
    expect(decision.reason).toContain(cause);
    expect(decision.reason).toContain("coding:directions/staged-delivery.md");
  });

  it.each([
    "for n in $(gh pr list --json number -q '.[].number'); do gh pr close $n; done",
    "xargs gh pr close <<< 12",
    "time gh pr close 12 # tidy",
    "env GH_REPO=acme/app gh pr close 12 # x",
    "bash -c 'gh pr close 12' # x",
  ])("should refuse a close behind a launcher or keyword in a command it cannot split: %s", (command) => {
    const { decision, reads } = classify(command, { "12": 0 });
    expect(decision.decision).toBe("deny");
    expect(reads).toEqual([]);
    expect(decision.reason).toContain("coding:directions/staged-delivery.md");
  });

  it.each([
    "gh pr view 12 --json changedFiles",
    "gh pr close --help",
    "rg 'gh pr close' plugins | head",
    "grep -n gh-pr-close.ts plugins/coding/hooks/hooks.json",
    "echo 'gh pr close 12'",
    "git status --porcelain",
    "git commit -F - <<'EOF'\nfeat(coding): add the gh-pr-close.ts drop-in\nEOF",
    'git commit -m "$(printf \'gh pr close is guarded\')"',
    'rg -n "gh pr close" $(git ls-files)',
    "git add plugins/coding/scripts/gh-pr-close.ts",
    "git commit -F - <<'EOF'\nfix(coding): guard closes\n\n- gh pr close now checks the diff\nEOF",
    "for f in a b; do grep -c gh-pr-close.ts $f; done",
  ])("should leave a command that closes nothing to the harness: %s", (command) => {
    expect(classify(command, {})).toEqual({ decision: expect.objectContaining({ decision: "ignore" }), reads: [] });
  });
});

describe("fn:createPullChangesReader", () => {
  it("should count a read that never answers as unreadable", () => {
    const root = mkdtempSync(join(tmpdir(), "pr-close-hung-read-"));
    try {
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "scripts/gh-pr-view.ts"), "await Bun.sleep(10_000);\n");
      expect(() => createPullChangesReader(root, 200)("12", "acme/app", root)).toThrow(
        "gh pr view gave no answer within 0.2 seconds",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("hook:validate-pr-close", () => {
  it.each(harnessCases)("should emit the $harness denial from its native registration", ({ harness, tool, field, roots }) => {
    const result = runNativeHook(JSON.stringify({ tool_name: tool, tool_input: { [field]: "gh pr close 12 --force" } }), roots);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout) as HookResult).toEqual(
      harness === "grok"
        ? { decision: "deny", reason: expect.stringContaining(forced("12")) }
        : {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: expect.stringContaining(forced("12")),
            },
          },
    );
  });

  it.each(harnessCases)("should stay silent on an unrelated $harness command", ({ tool, field, roots }) => {
    const result = runNativeHook(JSON.stringify({ tool_name: tool, tool_input: { [field]: "git status" } }), roots);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("should block when the native registration points to an unavailable hook", () => {
    const missingRoot = mkdtempSync(join(tmpdir(), "pr-close-hook-missing-"));
    try {
      const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr close 12" } });
      expect(runNativeHook(input, { PLUGIN_ROOT: missingRoot }).status).toBe(2);
      expect(runNativeHook(input, {}).status).toBe(2);
    } finally {
      rmSync(missingRoot, { recursive: true, force: true });
    }
  });

  it.each([
    [3, "deny"],
    [0, "none"],
  ] as const)("should read %i changed files through the gh pr view drop-in and decide %s", (changedFiles, expected) => {
    const result = runScript(guardPath, [pluginRoot], {
      stdin: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr close 12 --repo acme/app" } }),
      env: { ...cloud, CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_ROOT: "", GROK_PLUGIN_ROOT: "" },
      routes: { "repos/acme/app/pulls/12": { body: pullFixture(changedFiles) } },
    });
    expect(result.status, result.stderr).toBe(0);
    if (expected === "none") expect(result.stdout).toBe("");
    else
      expect((JSON.parse(result.stdout) as HookResult).hookSpecificOutput).toEqual({
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("#12 still changes 3 files"),
      });
  });
});

/**
 * runs the coding plugin's registered close-hook command with only the given harness roots
 * @param input hook input JSON
 * @param roots plugin-root variables of the harness under test
 * @returns the hook process result
 */
function runNativeHook(input: string, roots: Readonly<Record<string, string>>): SpawnSyncReturns<string> {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
  };
  const command = manifest.hooks.PreToolUse.flatMap((group) => group.hooks)
    .map((hook) => hook.command)
    .find((candidate) => candidate.includes("/hooks/scripts/validate-pr-close"));
  if (command === undefined) throw new Error("missing native close hook command");
  return spawnSync("bash", ["-c", command], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: "", GROK_PLUGIN_ROOT: "", PLUGIN_ROOT: "", ...roots },
    input,
  });
}

/**
 * builds the REST pull request the gh pr view drop-in reads
 * @param changedFiles files the pull request changes
 * @returns the REST pull request
 */
function pullFixture(changedFiles: number) {
  return {
    number: 12,
    html_url: "https://github.com/acme/app/pull/12",
    title: "Direction review for widgets",
    body: "",
    state: "open",
    draft: true,
    user: { login: "author" },
    base: { ref: "feat/widgets/02-api", sha: "2".repeat(40) },
    head: { ref: "wip/widgets", sha: "1".repeat(40), repo: null },
    changed_files: changedFiles,
    created_at: "2026-10-26T10:00:00Z",
    updated_at: "2026-10-26T11:00:00Z",
    closed_at: null,
    merged_at: null,
    merge_commit_sha: null,
    labels: [],
    assignees: [],
  };
}
