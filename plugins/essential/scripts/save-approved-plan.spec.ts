import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface Sandbox {
  readonly root: string;
  readonly work: string;
  readonly input: string;
  readonly goal: string;
  readonly state: string;
  readonly remainder: string;
  readonly token: string;
}

const saver = resolve(import.meta.dirname, "save-approved-plan");
const lease = resolve(import.meta.dirname, "state-lease");
const projectedGoal = "# Goal\nDeliver the requested hook.\n";
const projectedState = "# Context\nPlan revision: 1\n\n## Tasks\nImplement the hook.\n";
const projectedRemainder = "# Direction\nImplement and verify the hook.\n";
const originalPlan = "# Approved plan\n\nDeliver the requested hook.\n";

function withSandbox(test: (sandbox: Sandbox) => void): void {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "save-approved-plan-")));
  try {
    expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
    writeFileSync(resolve(root, ".gitignore"), ".state/\n");
    const work = resolve(root, ".state/works/approved-hook");
    mkdirSync(work, { recursive: true });
    writeFileSync(resolve(work, "goal.md"), "# Approved hook\n");
    writeFileSync(resolve(work, "state.md"), "Plan source: state.md\nState revision: 1\n");
    const input = resolve(root, "input.md");
    writeFileSync(input, originalPlan);
    const goal = resolve(root, "goal-input.md");
    const state = resolve(root, "state-input.md");
    const remainder = resolve(root, "remainder-input.md");
    writeFileSync(goal, projectedGoal);
    writeFileSync(state, projectedState);
    writeFileSync(remainder, projectedRemainder);
    const acquired = spawnSync("bash", [lease, "acquire", "--work-dir", work, "--capability", "pm", "--session", "approval-test"], { encoding: "utf8" });
    expect(acquired.status, acquired.stderr).toBe(0);
    const token = (JSON.parse(acquired.stdout) as { token: string }).token;
    test({ root, work, input, goal, state, remainder, token });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function save(sandbox: Sandbox, overrides: { readonly token?: string; readonly source?: string; readonly cwd?: string; readonly executable?: string; readonly environment?: NodeJS.ProcessEnv } = {}): ReturnType<typeof spawnSync> {
  const result = spawnSync(overrides.executable ?? saver, ["--work-id", "approved-hook", "--token", overrides.token ?? sandbox.token, "--plan-file", sandbox.input, "--goal-file", sandbox.goal, "--state-file", sandbox.state, "--remainder-file", sandbox.remainder, "--source", overrides.source ?? "codex:turn-approved"], { cwd: overrides.cwd ?? sandbox.root, env: { ...process.env, ...overrides.environment }, encoding: "utf8" });
  expect(result.error).toBeUndefined();
  return result;
}

function output(result: ReturnType<typeof spawnSync>): Record<string, unknown> {
  expect(result.status, `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`).toBe(0);
  return JSON.parse(String(result.stdout)) as Record<string, unknown>;
}

function expectRefused(result: ReturnType<typeof spawnSync>, reason: RegExp): void {
  expect(result.status).not.toBe(0);
  expect(JSON.parse(String(result.stdout))).toEqual({ status: "error", error: expect.stringMatching(reason) });
}

function interceptWrites(sandbox: Sandbox): string {
  const directory = resolve(sandbox.root, "intercepted-scripts");
  mkdirSync(directory);
  const executable = resolve(directory, "save-approved-plan");
  copyFileSync(saver, executable);
  for (const command of ["resolve-state-workspace", "state-lease"]) {
    const path = resolve(directory, command);
    writeFileSync(path, `#!/usr/bin/env bash
exec "$REAL_SCRIPTS/${command}" "$@"
`);
    chmodSync(path, 0o755);
  }
  const writer = resolve(directory, "state-write");
  writeFileSync(writer, `#!/usr/bin/env bash
set -euo pipefail
args=("$@")
target=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --target ]]; then target="$2"; break; fi
  shift
done
"$REAL_SCRIPTS/state-write" "\${args[@]}"
if [[ -n "\${FREEZE_INPUT:-}" ]]; then
  printf 'changed after staging\\n' > "$FREEZE_INPUT"
fi
if [[ "$target" == "\${FAIL_AFTER_TARGET:-}" ]]; then exit 1; fi
`);
  chmodSync(writer, 0o755);
  return executable;
}

function canonicalBytes(sandbox: Sandbox): Record<string, string | null> {
  return Object.fromEntries(["goal.md", "state.md", "plan.md"].map((name) => {
    const path = resolve(sandbox.work, name);
    return [name, existsSync(path) ? readFileSync(path, "utf8") : null];
  }));
}

// subprocess integration cases reached 12.63s on macOS CI; 30s allows over 2x headroom
describe("approved plan persistence", { timeout: 30_000 }, () => {
  it("should save exact bytes with an immutable approval snapshot", () => withSandbox((sandbox) => {
    const result = output(save(sandbox));
    const sha256 = createHash("sha256").update(originalPlan).digest("hex");
    expect(result).toMatchObject({ status: "saved", sha256, plan_path: resolve(sandbox.work, "plan.md") });
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(projectedRemainder);
    expect(readFileSync(resolve(sandbox.work, "artifacts/plan-approvals", `${sha256}.txt`), "utf8")).toBe(originalPlan);
    expect(JSON.parse(readFileSync(resolve(sandbox.work, "artifacts/plan-approvals", `${sha256}.json`), "utf8"))).toMatchObject({ sha256 });
  }));

  it("should leave duplicate approvals and their evidence untouched", () => withSandbox((sandbox) => {
    output(save(sandbox));
    const path = resolve(sandbox.work, "plan.md");
    const before = statSync(path).mtimeMs;
    expect(output(save(sandbox))).toMatchObject({ status: "unchanged", generated_files: [] });
    expect(statSync(path).mtimeMs).toBe(before);
  }));

  it("should retain prior approved bytes when replacing the plan", () => withSandbox((sandbox) => {
    const first = output(save(sandbox));
    writeFileSync(sandbox.input, "# Revised plan\nDifferent delivery.\n");
    writeFileSync(sandbox.remainder, "# Revised plan\nDifferent delivery.\n");
    output(save(sandbox, { source: "codex:turn-revised" }));
    expect(readFileSync(resolve(sandbox.work, "artifacts/plan-approvals", `${first.sha256}.txt`), "utf8")).toBe(originalPlan);
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe("# Revised plan\nDifferent delivery.\n");
  }));

  it("should reject a foreign lease without persisting a plan", () => withSandbox((sandbox) => {
    expectRefused(save(sandbox, { token: "foreign" }), /lease/i);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should reject an expired owned lease", () => withSandbox((sandbox) => {
    const path = resolve(sandbox.work, "lease.json");
    const record = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...record, expires_at_epoch: 0 }));
    expectRefused(save(sandbox), /lease/i);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should require the centralized state ignore gate", () => withSandbox((sandbox) => {
    writeFileSync(resolve(sandbox.root, ".gitignore"), "");
    expectRefused(save(sandbox), /workspace|ignored/i);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should reject an empty approval source", () => withSandbox((sandbox) => {
    expectRefused(save(sandbox, { source: "" }), /source/i);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should refuse conflicting immutable evidence", () => withSandbox((sandbox) => {
    const sha256 = createHash("sha256").update(originalPlan).digest("hex");
    const directory = resolve(sandbox.work, "artifacts/plan-approvals");
    mkdirSync(directory, { recursive: true });
    const snapshot = resolve(directory, `${sha256}.txt`);
    writeFileSync(snapshot, "conflicting bytes");
    expectRefused(save(sandbox), /snapshot.*conflicts/i);
    expect(readFileSync(snapshot, "utf8")).toBe("conflicting bytes");
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should recover an interrupted receipt before returning unchanged", () => withSandbox((sandbox) => {
    const first = output(save(sandbox));
    const receipt = resolve(sandbox.work, "artifacts/plan-approvals", `${first.sha256}.json`);
    rmSync(receipt);
    expect(output(save(sandbox)).generated_files).toContain(receipt);
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toMatchObject({ sha256: first.sha256 });
  }));

  it("should persist to the default tree when invoked from a linked worktree", () => withSandbox((sandbox) => {
    const git = (...args: string[]): void => {
      const result = spawnSync("git", args, { cwd: sandbox.root, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git("-c", "commit.gpgsign=false", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "test: fixture");
    const linked = resolve(sandbox.root, "linked");
    git("worktree", "add", "--detach", linked, "HEAD");
    const result = output(save(sandbox, { cwd: linked }));
    expect(result.plan_path).toBe(resolve(sandbox.work, "plan.md"));
    expect(existsSync(resolve(linked, ".state"))).toBe(false);
  }));

  // Four real save subprocesses exceeded 5 seconds on hosted macOS; use the native integration budget.
  it("should reject a superseded approval replay but accept fresh reapproval", () => withSandbox((sandbox) => {
    output(save(sandbox, { source: "event-A" }));
    const revised = "# Plan B\nDeliver B.\n";
    writeFileSync(sandbox.input, revised);
    writeFileSync(sandbox.remainder, revised);
    output(save(sandbox, { source: "event-B" }));
    writeFileSync(sandbox.input, originalPlan);
    writeFileSync(sandbox.remainder, projectedRemainder);
    expectRefused(save(sandbox, { source: "event-A" }), /stale approval event/);
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(revised);
    expect(output(save(sandbox, { source: "event-C" })).status).toBe("saved");
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(projectedRemainder);
  }), 30_000);

  it("should refuse changed bytes under the same approval identity", () => withSandbox((sandbox) => {
    output(save(sandbox));
    writeFileSync(sandbox.input, "# Changed without new approval\n");
    expectRefused(save(sandbox), /approval event conflicts/);
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(projectedRemainder);
  }));

  it("should resolve an interrupted publication before accepting a newer event", () => withSandbox((sandbox) => {
    const source = "codex:turn-approved";
    output(save(sandbox));
    const eventId = createHash("sha256").update(source).digest("hex");
    rmSync(resolve(sandbox.work, "artifacts/plan-approvals/events", `${eventId}.published.json`));
    writeFileSync(sandbox.input, "# Newer plan\n");
    expectRefused(save(sandbox, { source: "event-newer" }), /pending approval publication/);
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(projectedRemainder);
    writeFileSync(sandbox.input, originalPlan);
    expect(output(save(sandbox)).status).toBe("saved");
    expect(output(save(sandbox)).status).toBe("unchanged");
  }));

  it("should refuse a gap in publication history without replacing the plan", () => withSandbox((sandbox) => {
    output(save(sandbox));
    const eventId = createHash("sha256").update("codex:turn-approved").digest("hex");
    const directory = resolve(sandbox.work, "artifacts/plan-approvals/events");
    for (const suffix of [".json", ".published.json"]) {
      const path = resolve(directory, `${eventId}${suffix}`);
      const receipt = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(path, JSON.stringify({ ...receipt, revision: 3 }));
    }
    writeFileSync(sandbox.input, "# Plan after missing event\n");
    expectRefused(save(sandbox, { source: "event-after-gap" }), /revision history.*incomplete/);
    expect(readFileSync(resolve(sandbox.work, "plan.md"), "utf8")).toBe(projectedRemainder);
  }));

  it("should refuse content fingerprints as approval event identities", () => withSandbox((sandbox) => {
    expectRefused(save(sandbox, { source: "fingerprint:codex:UserPromptSubmit:content-hash" }), /fingerprint|event identity/);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it.each([Buffer.from(""), Buffer.from([0xff])])("should reject invalid plan bytes without writes", (bytes) => withSandbox((sandbox) => {
    writeFileSync(sandbox.input, bytes);
    expectRefused(save(sandbox), /nonempty UTF-8/);
    expect(existsSync(resolve(sandbox.work, "plan.md"))).toBe(false);
  }));

  it("should accept original approval text larger than the persisted Markdown budget", () => withSandbox((sandbox) => {
    const presentation = "# Approved presentation\n" + "Detailed rationale.\n".repeat(2_000);
    writeFileSync(sandbox.input, presentation);
    const result = output(save(sandbox));
    expect(canonicalBytes(sandbox)).toEqual({ "goal.md": projectedGoal, "state.md": projectedState, "plan.md": projectedRemainder });
    expect(readFileSync(resolve(sandbox.work, "artifacts/plan-approvals", `${result.sha256}.txt`), "utf8")).toBe(presentation);
  }));

  it("should accept exactly 16384 bytes for every persisted projection", () => withSandbox((sandbox) => {
    const boundary = "é".repeat(8_192);
    for (const path of [sandbox.goal, sandbox.state, sandbox.remainder]) writeFileSync(path, boundary);
    output(save(sandbox));
    expect(canonicalBytes(sandbox)).toEqual({ "goal.md": boundary, "state.md": boundary, "plan.md": boundary });
  }));

  it.each(["goal", "state", "remainder"] as const)("should reject oversized %s before writing any approval or canonical file", (projection) => withSandbox((sandbox) => {
    const before = canonicalBytes(sandbox);
    writeFileSync(sandbox[projection], "x".repeat(16_385));
    expectRefused(save(sandbox), /16384-byte/);
    expect(canonicalBytes(sandbox)).toEqual(before);
    expect(existsSync(resolve(sandbox.work, "artifacts/plan-approvals"))).toBe(false);
  }));

  it.each(["goal", "state", "remainder"] as const)("should reject empty or invalid UTF-8 %s without changing canonical files", (projection) => withSandbox((sandbox) => {
    const before = canonicalBytes(sandbox);
    for (const bytes of [Buffer.from(" \n"), Buffer.from([0xff])]) {
      writeFileSync(sandbox[projection], bytes);
      expectRefused(save(sandbox), /nonempty UTF-8/);
      expect(canonicalBytes(sandbox)).toEqual(before);
    }
  }));

  it("should preserve live execution progress on a completed same-event retry", () => withSandbox((sandbox) => {
    output(save(sandbox));
    writeFileSync(resolve(sandbox.work, "goal.md"), "# Goal with current workspace anchor\n");
    writeFileSync(resolve(sandbox.work, "state.md"), "State revision: 2\nTask finished.\n");
    const before = canonicalBytes(sandbox);
    expect(output(save(sandbox))).toMatchObject({ status: "unchanged", generated_files: [] });
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));

  it("should accept a fresh approval after live execution progress", () => withSandbox((sandbox) => {
    output(save(sandbox));
    writeFileSync(resolve(sandbox.work, "state.md"), "State revision: 2\nTask finished.\n");
    writeFileSync(sandbox.input, "# Revised approved delivery\n");
    writeFileSync(sandbox.state, "State revision: 3\nKeep finished task and add next task.\n");
    expect(output(save(sandbox, { source: "fresh-after-progress" })).status).toBe("saved");
    expect(readFileSync(resolve(sandbox.work, "state.md"), "utf8")).toBe(readFileSync(sandbox.state, "utf8"));
  }));

  it("should reject an older event even when its content equals the latest approval", () => withSandbox((sandbox) => {
    output(save(sandbox, { source: "first-same-content" }));
    output(save(sandbox, { source: "latest-same-content" }));
    expectRefused(save(sandbox, { source: "first-same-content" }), /stale approval event/);
    expect(output(save(sandbox, { source: "fresh-same-content" })).status).toBe("saved");
  }));

  it.each(["goal", "state", "remainder"] as const)("should bind %s bytes to the approval event identity", (projection) => withSandbox((sandbox) => {
    output(save(sandbox));
    const before = canonicalBytes(sandbox);
    writeFileSync(sandbox[projection], "Changed without approval.\n");
    expectRefused(save(sandbox), /approval event conflicts/);
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));

  it.each(["goal.md", "state.md", "plan.md"])("should recover interruption after writing %s", (target) => withSandbox((sandbox) => {
    const executable = interceptWrites(sandbox);
    expectRefused(save(sandbox, { executable, environment: { REAL_SCRIPTS: import.meta.dirname, FAIL_AFTER_TARGET: target } }), /write refused/);
    const eventId = createHash("sha256").update("codex:turn-approved").digest("hex");
    expect(existsSync(resolve(sandbox.work, "artifacts/plan-approvals/events", `${eventId}.published.json`))).toBe(false);
    expect(output(save(sandbox)).status).toBe("saved");
    expect(canonicalBytes(sandbox)).toEqual({ "goal.md": projectedGoal, "state.md": projectedState, "plan.md": projectedRemainder });
    expect(existsSync(resolve(sandbox.work, "artifacts/plan-approvals/events", `${eventId}.published.json`))).toBe(true);
  }));

  it("should refuse third-party drift during interrupted publication recovery", () => withSandbox((sandbox) => {
    const executable = interceptWrites(sandbox);
    expectRefused(save(sandbox, { executable, environment: { REAL_SCRIPTS: import.meta.dirname, FAIL_AFTER_TARGET: "goal.md" } }), /write refused/);
    writeFileSync(resolve(sandbox.work, "state.md"), "Unrelated writer progress.\n");
    const before = canonicalBytes(sandbox);
    expectRefused(save(sandbox), /conflict|drift/);
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));

  it.each(["input", "goal", "state", "remainder"] as const)("should freeze %s before publication writes begin", (input) => withSandbox((sandbox) => {
    const executable = interceptWrites(sandbox);
    const result = output(save(sandbox, { executable, environment: { REAL_SCRIPTS: import.meta.dirname, FREEZE_INPUT: sandbox[input] } }));
    expect(canonicalBytes(sandbox)).toEqual({ "goal.md": projectedGoal, "state.md": projectedState, "plan.md": projectedRemainder });
    expect(readFileSync(resolve(sandbox.work, "artifacts/plan-approvals", `${result.sha256}.txt`), "utf8")).toBe(originalPlan);
    expect(readFileSync(sandbox[input], "utf8")).toBe("changed after staging\n");
  }));

  it("should refuse a symlink target without changing the external file", () => withSandbox((sandbox) => {
    const external = resolve(sandbox.root, "external.md");
    writeFileSync(external, "Unrelated content.\n");
    symlinkSync(external, resolve(sandbox.work, "plan.md"));
    expectRefused(save(sandbox), /symlink/);
    expect(readFileSync(external, "utf8")).toBe("Unrelated content.\n");
  }));


  it("should retain immutable projection evidence bound to the original approval", () => withSandbox((sandbox) => {
    const result = output(save(sandbox));
    const eventId = createHash("sha256").update("codex:turn-approved").digest("hex");
    const directory = resolve(sandbox.work, "artifacts/plan-approvals");
    const event = JSON.parse(readFileSync(resolve(directory, "events", `${eventId}.json`), "utf8"));
    expect(event.sha256).toBe(result.sha256);
    for (const [name, bytes] of Object.entries({ "goal.md": projectedGoal, "state.md": projectedState, "plan.md": projectedRemainder })) {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      expect(event.projections[name]).toMatchObject({ sha256 });
      expect(readFileSync(resolve(directory, "projections", `${sha256}.txt`), "utf8")).toBe(bytes);
    }
    expect(JSON.parse(readFileSync(resolve(directory, "events", `${eventId}.published.json`), "utf8"))).toEqual(event);
  }));

  it("should refuse a publication receipt that conflicts with its event", () => withSandbox((sandbox) => {
    output(save(sandbox));
    const eventId = createHash("sha256").update("codex:turn-approved").digest("hex");
    const path = resolve(sandbox.work, "artifacts/plan-approvals/events", `${eventId}.published.json`);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...receipt, revision: 2 }));
    const before = canonicalBytes(sandbox);
    expectRefused(save(sandbox), /publication receipt/);
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));

  it("should refuse missing event history behind a completed publication", () => withSandbox((sandbox) => {
    output(save(sandbox));
    const eventId = createHash("sha256").update("codex:turn-approved").digest("hex");
    rmSync(resolve(sandbox.work, "artifacts/plan-approvals/events", `${eventId}.json`));
    const before = canonicalBytes(sandbox);
    expectRefused(save(sandbox), /receipt has no event/);
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));

  it("should refuse corrupt immutable projection evidence without rewriting live state", () => withSandbox((sandbox) => {
    output(save(sandbox));
    const sha256 = createHash("sha256").update(projectedState).digest("hex");
    writeFileSync(resolve(sandbox.work, "artifacts/plan-approvals/projections", `${sha256}.txt`), "Corrupt snapshot.\n");
    const before = canonicalBytes(sandbox);
    expectRefused(save(sandbox), /snapshot.*conflict|evidence.*conflict/);
    expect(canonicalBytes(sandbox)).toEqual(before);
  }));


  it("should retain the earliest approval source when recovering a receipt after reapproval", () => withSandbox((sandbox) => {
    const first = output(save(sandbox, { source: "original-submission" }));
    output(save(sandbox, { source: "reapproved-submission" }));
    const receipt = resolve(sandbox.work, "artifacts/plan-approvals", `${first.sha256}.json`);
    rmSync(receipt);
    output(save(sandbox, { source: "reapproved-submission" }));
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toMatchObject({ source: "original-submission", sha256: first.sha256 });
  }));

});
