import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface Surface {
  state: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  isDraft: boolean;
}
interface RunOptions {
  surface?: Partial<Surface>;
  ciState?: string;
  verdict?: string;
  reviewedHead?: string;
  reviewedBase?: string;
  isMissing?: boolean;
  metadata?: string;
  checks?: string;
}
const headOid = "1".repeat(40);
const baseOid = "2".repeat(40);
const surface: Surface = {
  state: "OPEN",
  headRefOid: headOid,
  baseRefName: "master",
  baseRefOid: baseOid,
  isDraft: true,
};
const direction = readFileSync(
  join(import.meta.dirname, "../directions/review-loop.md"),
  "utf8",
);
const blocks = Array.from(
  direction.matchAll(/```bash\n([\s\S]*?)```/g),
  (match) => match[1]!,
);

const createUpdate = readFileSync(
  join(import.meta.dirname, "../directions/create-update.md"),
  "utf8",
);
const readyGate = Array.from(
  createUpdate.matchAll(/```bash\n([\s\S]*?)```/g),
  (match) => match[1]!,
).find((block) => block.includes('"$CI_STATE"'))!;

describe("PR review lifecycle commands", () => {
  it.each([
    { isMissing: true },
    { metadata: "null" },
    { metadata: "{}" },
    { metadata: JSON.stringify({ ...surface, isDraft: "true" }) },
    { surface: { isDraft: false } },
    { surface: { headRefOid: "3".repeat(40) } },
    { surface: { baseRefOid: "3".repeat(40) } },
    { surface: { baseRefName: "other" } },
    { surface: { state: "CLOSED" } },
  ])(
    "should refuse review dispatch for an unavailable or unpinned draft %j",
    (options) => {
      expect(runBlock("dispatch", options).status).not.toBe(0);
    },
  );
  it("should admit a published draft matching the expected revision", () => {
    expect(runBlock("dispatch").status).toBe(0);
  });
  it.each([
    { verdict: "COMMENT" },
    { ciState: "pending" },
    { ciState: "red" },
    { ciState: "" },
    { isMissing: true },
    { metadata: "null" },
    { metadata: "{}" },
    { metadata: JSON.stringify({ ...surface, isDraft: "true" }) },
    { reviewedHead: "3".repeat(40) },
    { reviewedBase: "3".repeat(40) },
    { surface: { headRefOid: "3".repeat(40) } },
    { surface: { baseRefOid: "3".repeat(40) } },
    { surface: { baseRefName: "other" } },
    { surface: { state: "CLOSED" } },
  ])(
    "should preserve draft status when approval is absent or stale %j",
    (options) => {
      const result = runBlock("ready", options);
      expect(result.status).not.toBe(0);
      expect(result.surface).toEqual(
        options.metadata === undefined
          ? { ...surface, ...options.surface }
          : JSON.parse(options.metadata),
      );
    },
  );
  it("should admit an approved pinned draft with green CI without mutating it", () => {
    expect(runBlock("ready")).toMatchObject({
      status: 0,
      surface,
    });
  });
  it("should accept an already ready approved surface with green CI", () => {
    expect(runBlock("ready", { surface: { isDraft: false } }).status).toBe(0);
  });
  it.each([
    "not JSON",
    JSON.stringify([{ bucket: "pending", completedAt: null }]),
    JSON.stringify([{ bucket: "fail", completedAt: "2026-09-28T13:00:00Z" }]),
    JSON.stringify([{ bucket: "pass", completedAt: null }]),
  ])("should reject a non-green refreshed check rollup", (checks) => {
    expect(runBlock("ready", { checks }).status).not.toBe(0);
  });
});

function runBlock(
  phase: "dispatch" | "ready",
  options: RunOptions = {},
): { status: number | null; surface: Surface } {
  const root = mkdtempSync(join(tmpdir(), "pr-review-lifecycle-"));
  try {
    const metadata = join(root, "surface.json");
    writeFileSync(
      metadata,
      options.metadata ?? JSON.stringify({ ...surface, ...options.surface }),
    );
    const checks = join(root, "checks.json");
    writeFileSync(checks, options.checks ?? JSON.stringify([
      { bucket: "pass", completedAt: "2026-09-28T13:00:00Z" },
    ]));
    writeFileSync(
      join(root, "gh"),
      `#!/bin/bash
set -eu
case "$1 $2" in
  "pr view") [ "$IS_MISSING" = false ] || exit 1; cat "$METADATA" ;;
  "pr checks") cat "$CHECKS_FILE" ;;
  *) exit 2 ;;
esac
`,
      { mode: 0o755 },
    );
    const completed = spawnSync(
      "bash",
      ["-eu", "-c", phase === "dispatch" ? blocks[0]! : readyGate],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          METADATA: metadata,
          CHECKS_FILE: checks,
          CI_STATE: options.ciState ?? "green",
          REPOSITORY: "example/repo",
          IS_MISSING: String(options.isMissing ?? false),
          PR_URL: "https://github.com/example/repo/pull/1",
          HOST: "github.com",
          OWNER: "example",
          REPO: "repo",
          EXPECTED_HEAD_OID: headOid,
          EXPECTED_BASE_OID: baseOid,
          EXPECTED_BASE_REF: "master",
          REVIEWED_HEAD_OID: options.reviewedHead ?? headOid,
          REVIEWED_BASE_OID: options.reviewedBase ?? baseOid,
          REVIEWED_BASE_REF: "master",
          SUBSTANTIVE_VERDICT: options.verdict ?? "APPROVE",
        },
      },
    );
    return {
      status: completed.status,
      surface: JSON.parse(readFileSync(metadata, "utf8")),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
