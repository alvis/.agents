import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONTRACT_VERSION,
  createReviewPublicationReceipt,
  validateReviewPublicationReceipt,
} from "./review-publication";

import type { ReviewPublicationReceipt } from "./review-publication";

interface TransportRecord {
  arguments: string[];
  body: string;
  operation: "read" | "write";
}

interface RunOptions {
  action?: "approve" | "checks" | "publish" | "update";
  checkRunsExit?: number;
  statusesExit?: number;
  statusesBody?: string;
  statuses?: readonly Record<string, unknown>[];
  protectionStatus?: 403 | 404;
  branchProtected?: boolean;
  existingReview?: Record<string, unknown>;
  reviewAfterCi?: Record<string, unknown>;
  checkRuns?: string;
  workflowRun?: Record<string, unknown>;
  policyRules?: readonly unknown[];
  policyRulePages?: readonly (readonly unknown[])[];
  policyRulesAfterCi?: readonly unknown[];
  author?: string;
  baseOid?: string;
  baseRef?: string;
  headOid?: string;
  isMissing?: boolean;
  metadata?: string;
  metadataAfterCi?: string;
  metadataExit?: number;
  parent?: ReviewPublicationReceipt;
  publisher?: string;
  rawInput?: string;
  relationPullNumber?: number;
  threadMetadata?: string;
  templateMutation?: {
    readonly name: "inline-review.md" | "overall-review.md";
    readonly content: string | null | ((source: string) => string);
  };
}

interface RunResult {
  records: TransportRecord[];
  status: number | null;
  stderr: string;
  stdout: string;
  writes: TransportRecord[];
}

const headOid = "1".repeat(40);
const baseOid = "2".repeat(40);
const changedOid = "3".repeat(40);
const actionsJob = "https://github.com/example/project/actions/runs/12/job/34";
const passingRun = {
  name: "test",
  head_sha: headOid,
  app: { id: 15368 },
  status: "completed",
  conclusion: "success",
  details_url: actionsJob,
  html_url: actionsJob,
  completed_at: "2026-09-28T10:00:00Z",
} as const;
const runningRun = {
  ...passingRun,
  status: "in_progress",
  conclusion: null,
  completed_at: null,
} as const;
const failedRun = { ...passingRun, conclusion: "failure" } as const;

/** serializes check runs as the single REST page `gh api --paginate --slurp` returns */
function checkRunPages(...runs: readonly Record<string, unknown>[]): string {
  return JSON.stringify([{ check_runs: runs }]);
}
const evidenceDigest = "a".repeat(64);
const requiredPolicyDigest = createHash("sha256")
  .update(JSON.stringify({ protection: null, rules: [] }))
  .digest("hex");
const scriptPath = join(import.meta.dirname, "review-publication.ts");
const common = {
  contract_version: CONTRACT_VERSION,
  publisher: {
    agent_id: "publisher-session",
    capability: "publication-agent",
    login: "publisher",
  },
  reviewer: {
    agent_id: "reviewer-session",
    capability: "independent-code-review",
    login: "reviewer",
  },
  semantic_approval: {
    approved: true,
    evidence_sha256: evidenceDigest,
    reviewer_agent_id: "reviewer-session",
    reviewer_capability: "independent-code-review",
    reviewer_login: "reviewer",
  },
  target: {
    base_oid: baseOid,
    base_ref: "main",
    head_oid: headOid,
    host: "github.com",
    owner: "example",
    pr_author_login: "author",
    pull_number: 35,
    repo: "project",
  },
} as const;
const finding = {
  body: "The empty input is handled before indexing the sequence.",
  evidence: "src/sequence.ts:12 and sequence.spec.ts empty-input case",
  id: "empty-input",
  kind: "note",
  line: 12,
  path: "src/sequence.ts",
  priority: null,
  side: "RIGHT",
  start_line: 10,
  subject: null,
  title: "Empty input handling",
} as const;
const review = {
  ...common,
  kind: "review",
  review_context: {
    human_signoff_required: false,
    ci: {
      expected_checks: [{ name: "test", workflow: ".github/workflows/ci.yml" }],
      expected_sources_confirmed: true,
      required_policy_sha256: requiredPolicyDigest,
    },
    review_evidence_sha256: evidenceDigest,
    zone: "green",
  },
  assessment: {
    alerts: {
      must_change: null,
      worth_considering:
        "The note provides context for future boundary changes.",
      unanchored: null,
    },
    statistics: { files_changed: 2, additions: 8, deletions: 1 },
    previous_reports: [],
    verdict_sentence: "The change is ready to merge.",
    findings: [finding],
    goal_alignment: "The change returns an empty result for an empty sequence.",
    intent_behavior:
      "The guard precedes all indexing and preserves nonempty inputs.",
    limitations: { entries: [], review_complete: true },
    minimality: "Only the sequence boundary changes.",
    requirements_alignment:
      "Both empty and nonempty inputs satisfy the stated contract.",
    reuse: "The existing sequence parser remains the entrypoint.",
    standards: [
      {
        standard: "universal",
        evidence: "src/sequence.ts:12 validates input",
        result: "passes",
      },
    ],
    substantive_verdict: "PASS",
    summary:
      "The empty-input boundary is covered and preserves existing behavior.",
    tests: {
      confidence: "convincing",
      execution: {
        evidence: "sequence.spec.ts passed at the reviewed revision",
        status: "executed",
      },
      sensitivity:
        "Removing the empty-input guard makes the empty-array case throw instead of returning [].",
    },
    trust_caps: [],
  },
} as const;
const reply = {
  ...common,
  kind: "discussion-reply",
  body: "The empty-input fixture is in sequence.spec.ts at line 24.",
  classification: {
    contains_overall_assessment: false,
    contains_verdict: false,
  },
  comment_id: 81,
  operation: "reply-inline",
  thread_id: null,
} as const;
const receipt = createReviewPublicationReceipt(review);

function approvedBody(
  approval: ReviewPublicationReceipt,
  state: "pending" | "green" | "red",
): string {
  const payload = approval.ci_variants?.[state].payload_utf8_base64;
  if (!payload) throw new Error(`missing approved ${state} CI variant`);
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8")).body;
}

function reviewStructure(body: string): {
  summary: string | null;
  alert: string | null;
} {
  return {
    summary: /^(✅|❌|⚠️|⏳)/u.exec(body.split("\n")[2] ?? "")?.[1] ?? null,
    alert:
      [...body.matchAll(/^> \[!(WARNING|CAUTION|NOTE|TIP)\]$/gm)].at(-1)?.[1] ??
      null,
  };
}

describe("cmd:review-publication", () => {
  it.each(["head", "base"])(
    "should refuse initial publication when %s changes during CI lookup",
    (revision) => {
      const result = runCommand(receipt, {
        metadataAfterCi: JSON.stringify({
          head: { sha: revision === "head" ? changedOid : headOid },
          base: {
            sha: revision === "base" ? changedOid : baseOid,
            ref: "main",
          },
          user: { login: "author" },
        }),
      });
      expect(result.status).not.toBe(0);
      expect(
        result.records.some((record) =>
          record.arguments.some((argument) => argument.includes("/check-runs?")),
        ),
      ).toBe(true);
      expect(result.writes).toEqual([]);
    },
  );

  it.each(["publish", "update"] as const)(
    "should refuse %s when live required-check policy differs from approval",
    (action) => {
      const result = runCommand(receipt, {
        action,
        policyRules: [
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "new-required-check", integration_id: 7 },
              ],
            },
          },
        ],
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: approvedBody(receipt, "pending"),
          state: "COMMENTED",
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each(["publish", "update"] as const)(
    "should refuse %s when required policy changes while CI is queried",
    (action) => {
      const result = runCommand(receipt, {
        action,
        policyRulesAfterCi: [
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "new-required-check", integration_id: 7 },
              ],
            },
          },
        ],
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: approvedBody(receipt, "pending"),
          state: "COMMENTED",
        },
      });
      expect(result.status).not.toBe(0);
      expect(
        result.records.some((record) =>
          record.arguments.some((argument) => argument.includes("/check-runs?")),
        ),
      ).toBe(true);
      expect(result.writes).toEqual([]);
    },
  );

  it("should bind an update lookup to the receipt PR rather than another PR owning the review", () => {
    const differentPr = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pull_number: 36 },
    });
    const result = runCommand(differentPr, {
      action: "update",
      existingReview: {
        id: 91,
        user: { login: "publisher" },
        commit_id: headOid,
        body: approvedBody(receipt, "pending"),
        state: "COMMENTED",
      },
    });
    expect(result.status).not.toBe(0);
    expect(
      result.records.some((record) =>
        record.arguments.includes("repos/example/project/pulls/36/reviews/91"),
      ),
    ).toBe(true);
    expect(result.writes).toEqual([]);
  });

  it.each(["publish", "update"] as const)(
    "should refuse %s when a later required-policy page differs",
    (action) => {
      const result = runCommand(receipt, {
        action,
        policyRulePages: [
          [],
          [
            {
              type: "required_status_checks",
              parameters: {
                required_status_checks: [
                  { context: "page-two-check", integration_id: 7 },
                ],
              },
            },
          ],
        ],
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: approvedBody(receipt, "pending"),
          state: "COMMENTED",
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it("should reject a tampered approved CI variant before accessing GitHub", () => {
    const changed = {
      ...receipt,
      ci_variants: {
        ...receipt.ci_variants!,
        red: { ...receipt.ci_variants!.red, payload_sha256: "0".repeat(64) },
      },
    };
    const result = runCommand(changed);
    expect(result.status).not.toBe(0);
    expect(result.records).toEqual([]);
  });

  it("should preserve a known review failure while CI is pending", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        substantive_verdict: "REQUEST_CHANGES",
        alerts: {
          must_change: "Fix the failure.",
          worth_considering: null,
          unanchored: null,
        },
        findings: [{ ...finding, kind: null, priority: "P1" }],
      },
    });
    const result = runCommand(approval, {
      checkRuns: checkRunPages(runningRun),
    });
    expect(result.status).toBe(0);
    const published = JSON.parse(result.writes[0]!.body).body;
    expect(published).toBe(approvedBody(approval, "pending"));
    expect(reviewStructure(published).summary).toBe("❌");
  });

  it("should check live CI and publish a waiting summary while checks run", () => {
    const result = runCommand(receipt, {
      checkRuns: checkRunPages(runningRun),
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.writes[0]!.body);
    expect(payload.body).toBe(approvedBody(receipt, "pending"));
    expect(reviewStructure(payload.body).summary).toBe("⏳");
    expect(payload.event).toBe("COMMENT");
    expect(payload.comments).toHaveLength(1);
  });

  it("should warn when human sign-off remains after AI review and CI pass", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      review_context: {
        ...review.review_context,
        human_signoff_required: true,
      },
    });
    const result = runCommand(approval);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.writes[0]!.body);
    expect(payload.body).toBe(approvedBody(approval, "green"));
    expect(reviewStructure(payload.body)).toEqual({
      summary: "⚠️",
      alert: "WARNING",
    });
  });

  it("should warn about a retained CI-red trust cap after live CI passes", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: { ...review.assessment, trust_caps: ["ci-red"] },
    });
    const result = runCommand(approval);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.writes[0]!.body).event).toBe("COMMENT");
    expect(reviewStructure(JSON.parse(result.writes[0]!.body).body)).toEqual({
      summary: "⚠️",
      alert: "WARNING",
    });
  });

  it.each([
    { appId: 7, runs: [], state: "pending" },
    {
      appId: 7,
      runs: [
        {
          name: "test",
          head_sha: headOid,
          app: { id: 7 },
          status: "completed",
          conclusion: "neutral",
          completed_at: "2026-09-28T10:00:00Z",
        },
      ],
      state: "pending",
    },
    {
      appId: 7,
      runs: [
        {
          name: "test",
          head_sha: headOid,
          app: { id: 8 },
          status: "completed",
          conclusion: "success",
          completed_at: "2026-09-28T10:00:00Z",
        },
      ],
      state: "pending",
    },
    {
      appId: 7,
      runs: [
        {
          name: "test",
          head_sha: headOid,
          app: { id: 7 },
          status: "completed",
          conclusion: "success",
          completed_at: "2026-09-28T10:00:00Z",
        },
      ],
      state: "green",
    },
    {
      appId: -1,
      runs: [
        {
          name: "test",
          head_sha: headOid,
          app: { id: 8 },
          status: "completed",
          conclusion: "success",
          completed_at: "2026-09-28T10:00:00Z",
        },
      ],
      state: "green",
    },
    {
      appId: 7,
      runs: [
        {
          name: "test",
          head_sha: changedOid,
          app: { id: 7 },
          status: "completed",
          conclusion: "success",
          completed_at: "2026-09-28T10:00:00Z",
        },
      ],
      state: "pending",
    },
    {
      appId: 7,
      runs: [
        {
          name: "test",
          head_sha: headOid,
          app: { id: 7 },
          status: "in_progress",
          conclusion: null,
          completed_at: null,
        },
      ],
      state: "pending",
    },
  ] as const)(
    "should require observed matching app-backed evidence %#",
    ({ appId, runs, state }) => {
      const approval = createReviewPublicationReceipt({
        ...review,
        review_context: {
          ...review.review_context,
          ci: {
            expected_sources_confirmed: true,
            required_policy_sha256: requiredPolicyDigest,
            expected_checks: [{ name: "test", app_id: appId }],
          },
        },
      });
      const result = runCommand(approval, {
        checkRuns: JSON.stringify([{ check_runs: runs }]),
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.writes[0]!.body).body).toBe(
        approvedBody(approval, state),
      );
    },
  );

  it("should reject malformed app-provider evidence without publishing", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      review_context: {
        ...review.review_context,
        ci: {
          expected_sources_confirmed: true,
          required_policy_sha256: requiredPolicyDigest,
          expected_checks: [{ name: "test", app_id: 7 }],
        },
      },
    });
    const result = runCommand(approval, {
      checkRuns: JSON.stringify([{ check_runs: "unavailable" }]),
    });
    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it.each([0, -2, "7", 1.5])(
    "should reject malformed expected app identity %s",
    (app_id) => {
      expect(() =>
        createReviewPublicationReceipt({
          ...review,
          review_context: {
            ...review.review_context,
            ci: {
              expected_sources_confirmed: true,
              required_policy_sha256: requiredPolicyDigest,
              expected_checks: [{ name: "test", app_id }],
            },
          },
        }),
      ).toThrow();
    },
  );

  it("should refuse an update when the body changes during CI lookup", () => {
    const existingReview = {
      id: 91,
      user: { login: "publisher" },
      commit_id: headOid,
      body: approvedBody(receipt, "pending"),
      state: "COMMENTED",
    };
    const result = runCommand(receipt, {
      action: "update",
      existingReview,
      reviewAfterCi: {
        ...existingReview,
        body: "Edited by the publisher while CI was queried.",
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it.each([
    ["stale", "pending"],
    ["timed_out", "fail"],
  ] as const)("should bucket a %s check run as %s, like gh pr checks", (conclusion, bucket) => {
    const result = runCommand(receipt, {
      action: "checks",
      checkRuns: checkRunPages({ ...passingRun, conclusion }),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)[0].bucket).toBe(bucket);
  });

  it("should keep an unapproved neutral CI result pending", () => {
    const result = runCommand(receipt, {
      checkRuns: checkRunPages({ ...passingRun, conclusion: "neutral" }),
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.writes[0]!.body).body).toBe(
      approvedBody(receipt, "pending"),
    );
  });

  it("should list a revision's check runs and commit statuses in the checks shape", () => {
    const result = runCommand(receipt, {
      action: "checks",
      checkRuns: checkRunPages(
        { ...runningRun, name: "build", started_at: "2026-09-28T09:58:00Z" },
        { ...passingRun, conclusion: "skipped" },
      ),
      statuses: [
        {
          context: "lint",
          state: "error",
          target_url: "https://ci.example.com/jobs/1",
          created_at: "2026-09-28T09:59:00Z",
          updated_at: "2026-09-28T10:00:00Z",
        },
      ],
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        name: "build",
        bucket: "pending",
        state: "IN_PROGRESS",
        link: actionsJob,
        startedAt: "2026-09-28T09:58:00Z",
        completedAt: null,
        workflow: "",
      },
      {
        name: "test",
        bucket: "skipping",
        state: "SKIPPED",
        link: actionsJob,
        startedAt: null,
        completedAt: "2026-09-28T10:00:00Z",
        workflow: "",
      },
      {
        name: "lint",
        bucket: "fail",
        state: "ERROR",
        link: "https://ci.example.com/jobs/1",
        startedAt: "2026-09-28T09:59:00Z",
        completedAt: "2026-09-28T10:00:00Z",
        workflow: "",
      },
    ]);
    expect(result.writes).toEqual([]);
  });

  it("should read CI through REST without the GraphQL-backed checks command", () => {
    const result = runCommand(receipt);
    expect(result.status, result.stderr).toBe(0);
    expect(
      result.records.some(
        ({ arguments: arguments_ }) =>
          arguments_.includes("graphql") ||
          (arguments_[0] === "pr" && arguments_[1] === "checks"),
      ),
    ).toBe(false);
    expect(JSON.parse(result.writes[0]!.body).body).toBe(
      approvedBody(receipt, "green"),
    );
  });

  it.each([
    [{ state: "failure", context: "lint" }, "red"],
    [{ state: "error", context: "lint" }, "red"],
    [{ state: "pending", context: "lint" }, "pending"],
    [{ state: "success", context: "lint" }, "green"],
  ] as const)(
    "should classify a legacy commit status %j as %s CI",
    (status, expectedState) => {
      const result = runCommand(receipt, {
        statuses: [
          {
            ...status,
            target_url: "https://ci.example.com/jobs/1",
            updated_at: "2026-09-28T10:00:00Z",
          },
        ],
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.writes[0]!.body).body).toBe(
        approvedBody(receipt, expectedState),
      );
    },
  );

  it("should treat a forbidden protection read on an unprotected branch as unprotected", () => {
    const result = runCommand(receipt, {
      protectionStatus: 403,
      branchProtected: false,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.writes[0]!.body).body).toBe(
      approvedBody(receipt, "green"),
    );
  });

  it("should refuse when a protected branch's policy cannot be read", () => {
    const result = runCommand(receipt, {
      protectionStatus: 403,
      branchProtected: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("required-check policy lookup failed");
    expect(result.writes).toEqual([]);
  });

  it("should keep CI pending when workflows share a display name but have different paths", () => {
    const result = runCommand(receipt, {
      workflowRun: {
        id: 12,
        head_sha: headOid,
        path: ".github/workflows/optional.yml",
        name: "CI",
      },
      checkRuns: checkRunPages(passingRun),
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.writes[0]!.body).body).toBe(
      approvedBody(receipt, "pending"),
    );
  });

  it("should keep a workflow run from another revision pending", () => {
    const result = runCommand(receipt, {
      workflowRun: {
        id: 12,
        head_sha: changedOid,
        path: ".github/workflows/ci.yml",
        name: "CI",
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.writes[0]!.body).body).toBe(
      approvedBody(receipt, "pending"),
    );
  });

  it.each([
    ["https://ci.example.com/jobs/10", "pending"],
    ["https://ci.example.com/jobs/1", "green"],
    ["https://ci.example.com/jobs/1/artifacts", "green"],
    ["https://ci.example.com/jobs/1?attempt=2", "green"],
    ["https://ci.example.com/jobs/1#summary", "green"],
  ] as const)(
    "should enforce provider path boundaries for %s",
    (link, expectedState) => {
      const approval = createReviewPublicationReceipt({
        ...review,
        review_context: {
          ...review.review_context,
          ci: {
            expected_checks: [
              { name: "test", link_prefix: "https://ci.example.com/jobs/1" },
            ],
            expected_sources_confirmed: true,
            required_policy_sha256: requiredPolicyDigest,
          },
        },
      });
      const result = runCommand(approval, {
        checkRuns: checkRunPages({ ...passingRun, details_url: link }),
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.writes[0]!.body).body).toBe(
        approvedBody(approval, expectedState),
      );
    },
  );

  it("should bind provider checks to the exact URL origin and path prefix", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      review_context: {
        ...review.review_context,
        ci: {
          expected_checks: [
            { name: "test", link_prefix: "https://ci.example.com/jobs/" },
          ],
          expected_sources_confirmed: true,
          required_policy_sha256: requiredPolicyDigest,
        },
      },
    });
    for (const [link, expectedState] of [
      ["https://ci.example.com.evil.invalid/jobs/1", "pending"],
      ["https://ci.example.com/other/1", "pending"],
      ["https://ci.example.com/jobs/1", "green"],
    ] as const) {
      const result = runCommand(approval, {
        checkRuns: checkRunPages({ ...passingRun, details_url: link }),
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.writes[0]!.body).body).toBe(
        approvedBody(approval, expectedState),
      );
    }
  });

  it("should show CI failure ahead of another pending check", () => {
    const result = runCommand(receipt, {
      checkRuns: checkRunPages(failedRun, { ...runningRun, name: "build" }),
    });
    expect(result.status).toBe(0);
    const published = JSON.parse(result.writes[0]!.body).body;
    expect(published).toBe(approvedBody(receipt, "red"));
    expect(reviewStructure(published).summary).toBe("❌");
  });

  it.each(["pass", "fail"])(
    "should replace only the same pending review body after CI becomes %s",
    (bucket) => {
      const pending = runCommand(receipt, {
        checkRuns: checkRunPages(runningRun),
      });
      expect(pending.status, pending.stderr).toBe(0);
      const original = JSON.parse(pending.writes[0]!.body);
      const result = runCommand(receipt, {
        action: "update",
        checkRuns: checkRunPages(bucket === "pass" ? passingRun : failedRun),
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: original.body,
          state: "COMMENTED",
        },
      });
      expect(result.status).toBe(0);
      expect(result.writes).toHaveLength(1);
      expect(JSON.parse(result.stdout)).toEqual({
        ci_state: bucket === "pass" ? "green" : "red",
        review_id: 91,
        review: { id: 91 },
      });
      expect(result.writes[0]!.arguments).toContain("PUT");
      expect(result.writes[0]!.arguments).toContain(
        "repos/example/project/pulls/35/reviews/91",
      );
      const updated = JSON.parse(result.writes[0]!.body);
      expect(Object.keys(updated)).toEqual(["body"]);
      expect(updated.body).toBe(
        approvedBody(receipt, bucket === "pass" ? "green" : "red"),
      );
      expect(reviewStructure(updated.body).summary).toBe(
        bucket === "pass" ? "✅" : "❌",
      );
    },
  );

  it("should leave the existing review untouched while CI still runs", () => {
    const result = runCommand(receipt, {
      action: "update",
      checkRuns: checkRunPages(runningRun),
      existingReview: {
        id: 91,
        user: { login: "publisher" },
        commit_id: headOid,
        body: JSON.parse(
          Buffer.from(
            receipt.ci_variants!.pending.payload_utf8_base64,
            "base64",
          ).toString("utf8"),
        ).body,
        state: "COMMENTED",
      },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ci_state: "pending" });
    expect(result.writes).toEqual([]);
  });

  it("should not republish an already completed review update", () => {
    const result = runCommand(receipt, {
      action: "update",
      existingReview: {
        id: 91,
        user: { login: "publisher" },
        commit_id: headOid,
        body: JSON.parse(
          Buffer.from(
            receipt.ci_variants!.green.payload_utf8_base64,
            "base64",
          ).toString("utf8"),
        ).body,
        state: "COMMENTED",
      },
    });
    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it.each([
    { checkRuns: "not authorized", checkRunsExit: 4 },
    { checkRuns: "{}" },
    { statusesBody: "not authorized", statusesExit: 4 },
    { statusesBody: "not json" },
  ])(
    "should block publication without usable expected CI evidence %#",
    (options) => {
      const result = runCommand(receipt, options);
      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each([
    { id: 92 },
    { user: { login: "other" } },
    { body: "edited externally" },
    { commit_id: changedOid },
  ])(
    "should refuse a review update whose existing identity or body differs %#",
    (difference) => {
      const result = runCommand(receipt, {
        action: "update",
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: JSON.parse(
            Buffer.from(
              receipt.ci_variants!.pending.payload_utf8_base64,
              "base64",
            ).toString("utf8"),
          ).body,
          state: "COMMENTED",
          ...difference,
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each([{ headOid: changedOid }, { baseOid: changedOid }])(
    "should refuse review updates after revision drift %#",
    (difference) => {
      const result = runCommand(receipt, {
        action: "update",
        existingReview: {
          id: 91,
          user: { login: "publisher" },
          commit_id: headOid,
          body: JSON.parse(
            Buffer.from(
              receipt.ci_variants!.pending.payload_utf8_base64,
              "base64",
            ).toString("utf8"),
          ).body,
          state: "COMMENTED",
        },
        ...difference,
      });
      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each(["inline-review.md", "overall-review.md"] as const)(
    "should reject publication when installed %s is missing",
    (name) => {
      const result = runCommand(receipt, {
        templateMutation: { name, content: null },
      });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it.each(["inline-review.md", "overall-review.md"] as const)(
    "should reject publication when installed %s differs from approval",
    (name) => {
      const result = runCommand(receipt, {
        templateMutation: {
          name,
          content: (source) =>
            name === "inline-review.md"
              ? source.replace("<!--", "<!-- Changed reviewer guidance.\n")
              : `Changed reviewer guidance.\n\n${source}`,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it.each(["inline-review.md", "overall-review.md"] as const)(
    "should reject malformed installed %s during approval",
    (name) => {
      const result = runCommand(review, {
        action: "approve",
        templateMutation: { name, content: "{{UNKNOWN_REVIEW_TOKEN}}" },
      });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it("should reject an unresolved token in the installed template before approval", () => {
    const result = runCommand(review, {
      action: "approve",
      templateMutation: {
        name: "inline-review.md",
        content: (source) =>
          source.replaceAll("{{title}}", "{{unknown_review_token}}"),
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.records).toEqual([]);
  });

  it("should reject a malformed inline template even when there are no findings", () => {
    const result = runCommand(
      {
        ...review,
        assessment: {
          ...review.assessment,
          findings: [],
          alerts: {
            must_change: null,
            worth_considering: null,
            unanchored: null,
          },
        },
      },
      {
        action: "approve",
        templateMutation: {
          name: "inline-review.md",
          content: (source) =>
            source.replace("{{body}}", "{{body}} {{UNKNOWN}}"),
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.records).toEqual([]);
  });

  it.each(["{{UNKNOWN}}", "{{foo.bar}}"])(
    "should reject an unresolved template expression outside the token grammar: %s",
    (token) => {
      const result = runCommand(review, {
        action: "approve",
        templateMutation: {
          name: "inline-review.md",
          content: (source) => source.replace("{{body}}", `{{body}} ${token}`),
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it("should keep optional improvement advice when approval is capped by an incomplete review", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        trust_caps: ["partial-review"],
        limitations: {
          review_complete: false,
          entries: [
            {
              path: "integration",
              reason: "Integration environment unavailable.",
            },
          ],
        },
      },
    });
    const payload = JSON.parse(
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    );

    expect(payload.event).toBe("COMMENT");
    expect(payload.body).toContain(
      "> [!TIP]\n> The note provides context for future boundary changes.",
    );
    expect(payload.body).toContain("> [!WARNING]");
    expect(payload.body).not.toContain("> [!CAUTION]");
  });

  it("should render from the installed template instead of a competing inline layout", () => {
    const result = runCommand(review, {
      action: "approve",
      templateMutation: {
        name: "inline-review.md",
        content: (source) =>
          source.replace(
            "**{{marker}} {{title}}** — {{body}}",
            "**{{marker}} {{title}}** :: {{body}}",
          ),
      },
    });

    expect(result).toMatchObject({ status: 0, records: [] });
    const approval: ReviewPublicationReceipt = JSON.parse(result.stdout);
    const payload = JSON.parse(
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    );
    expect(payload.comments[0].body).toBe(
      `**📝 ${finding.title}** :: ${finding.body}\n\nEvidence: ${finding.evidence}\n`,
    );
  });

  it("should render review metadata, conditional sections and the closing verdict", () => {
    const payload = JSON.parse(
      Buffer.from(receipt.payload_utf8_base64, "base64").toString("utf8"),
    );

    expect(payload.body).toBe(
      [
        "📌",
        "",
        "✅ Reviewed `1111111` — 2 files, +8/-1, green zone.",
        "",
        review.assessment.summary,
        "",
        "### 💡 Worth Considering",
        "",
        "> [!TIP]",
        "> The note provides context for future boundary changes.",
        "",
        `- 📝 **src/sequence.ts:12** — ${finding.title}: ${finding.body} Evidence: ${finding.evidence}`,
        "",
        "### 🎯 Goal and Requirements",
        "",
        review.assessment.goal_alignment,
        "",
        review.assessment.requirements_alignment,
        "",
        review.assessment.intent_behavior,
        "",
        "### 🧪 Tests",
        "",
        review.assessment.tests.sensitivity,
        "",
        `executed: ${review.assessment.tests.execution.evidence}. Confidence: convincing.`,
        "",
        "### 📏 Standards",
        "",
        "- **universal** — passes: src/sequence.ts:12 validates input",
        "",
        "### ♻️ Reuse and Minimality",
        "",
        review.assessment.reuse,
        "",
        review.assessment.minimality,
        "",
        "### 🧾 Verdict",
        "",
        "> [!NOTE]",
        "> The change is ready to merge. Hosted CI passed.",
        "",
      ].join("\n"),
    );
    expect(payload.comments[0].body).toBe(
      `**📝 ${finding.title}** — ${finding.body}\n\nEvidence: ${finding.evidence}\n`,
    );
  });

  it("should substitute review input literally without expanding tokens or replacement patterns", () => {
    const literal =
      "Keep {{marker}} and {{summary}} and $& and $` and $' literal.";
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        summary: literal,
        findings: [{ ...finding, body: literal }],
      },
    });
    const payload = JSON.parse(
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    );

    expect(payload.body).toContain(literal);
    expect(payload.comments[0].body).toBe(
      `**📝 ${finding.title}** — ${literal}\n\nEvidence: ${finding.evidence}\n`,
    );
    expect(
      createReviewPublicationReceipt(approval.approved_assessment),
    ).toEqual(approval);
  });

  it("should render changed previous reports, unanchored findings and exclusions", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        previous_reports: [
          {
            label: "Old empty-input report",
            url: "https://github.com/example/project/pull/35#discussion_r81",
            verdict: "fixed",
            evidence: "The new guard prevents the observed exception.",
          },
        ],
        findings: [
          {
            ...finding,
            line: null,
            path: null,
            side: null,
            start_line: null,
            subject: null,
            kind: "chore",
          },
        ],
        substantive_verdict: "REQUEST_CHANGES",
        alerts: {
          must_change: null,
          worth_considering: null,
          unanchored: "The release note is absent from the diff.",
        },
        limitations: {
          review_complete: false,
          entries: [
            {
              path: "vendor/generated.ts",
              reason: "Generated dependency output excluded.",
            },
          ],
        },
        trust_caps: ["partial-review"],
        verdict_sentence: "Add the missing release note before merging.",
      },
    });
    const payload = JSON.parse(
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    );

    expect(payload.comments).toEqual([]);
    expect(payload.body).toContain(
      "[Old empty-input report](https://github.com/example/project/pull/35#discussion_r81)",
    );
    expect(payload.body).toContain(
      "The new guard prevents the observed exception.",
    );
    expect(payload.body).toContain(
      "### 📍 Not Anchored to a Line\n\n> [!IMPORTANT]\n> The release note is absent from the diff.",
    );
    expect(payload.body).toContain("**This PR**");
    expect(payload.body).toContain(
      "![WARNING Badge](https://img.shields.io/badge/WARNING-yellow?style=flat)",
    );
    expect(payload.body).toContain("vendor/generated.ts");
    expect(payload.body).toContain("Generated dependency output excluded.");
    expect(reviewStructure(payload.body)).toEqual({
      summary: "⚠️",
      alert: "WARNING",
    });
  });

  it.each([
    { priority: "P0", color: "red" },
    { priority: "P1", color: "orange" },
    { priority: "P2", color: "yellow" },
    { priority: "P3", color: "blue" },
    { priority: "P4", color: "lightgrey" },
  ])(
    "should render exactly one $priority marker in an inline finding",
    ({ priority, color }) => {
      const isBlocker = priority === "P0" || priority === "P1";
      const approval = createReviewPublicationReceipt({
        ...review,
        assessment: {
          ...review.assessment,
          substantive_verdict: isBlocker ? "REQUEST_CHANGES" : "PASS",
          findings: [{ ...finding, priority, kind: null }],
          alerts: {
            must_change: isBlocker ? "Fix the boundary." : null,
            worth_considering: isBlocker ? null : "Consider the boundary.",
            unanchored: null,
          },
        },
      });
      const payload = JSON.parse(
        Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
      );

      expect(payload.comments[0].body).toBe(
        `**<sub><sub>![${priority} Badge](https://img.shields.io/badge/${priority}-${color}?style=flat)</sub></sub> ${finding.title}** — ${finding.body}\n\nEvidence: ${finding.evidence}\n`,
      );
    },
  );

  it("should allow independent agents using the same GitHub account", () => {
    const assessment = {
      ...review,
      reviewer: { ...review.reviewer, login: "publisher" },
      semantic_approval: {
        ...review.semantic_approval,
        reviewer_login: "publisher",
      },
    };
    const approval = createReviewPublicationReceipt(assessment);
    const result = runCommand(approval);

    expect(result.status).toBe(0);
    expect(result.writes).toHaveLength(1);
  });

  it("should reject a reviewer and publisher with the same agent ID", () => {
    expect(() =>
      createReviewPublicationReceipt({
        ...review,
        publisher: { ...review.publisher, agent_id: review.reviewer.agent_id },
      }),
    ).toThrow(/independent identities/);
  });

  it("should approve and publish the exact native review bytes with inline anchors", () => {
    const approved = runCommand(review, { action: "approve" });
    const approval = validateReviewPublicationReceipt(
      JSON.parse(approved.stdout),
    );
    const result = runCommand(approval);
    const body = Buffer.from(approval.payload_utf8_base64, "base64").toString(
      "utf8",
    );

    expect(approved).toMatchObject({ status: 0, writes: [] });
    expect(approval).toEqual(receipt);
    expect(result).toMatchObject({ status: 0, stderr: "" });
    expect(result.writes).toEqual([
      {
        arguments: [
          "api",
          "--hostname",
          "github.com",
          "--method",
          "POST",
          "repos/example/project/pulls/35/reviews",
          "--input",
          "-",
        ],
        body,
        operation: "write",
      },
    ]);
    expect(JSON.parse(body)).toMatchObject({
      commit_id: headOid,
      event: "COMMENT",
      comments: [
        {
          line: 12,
          path: "src/sequence.ts",
          side: "RIGHT",
          start_line: 10,
          start_side: "RIGHT",
        },
      ],
    });
    expect(
      createHash("sha256").update(result.writes[0]!.body).digest("hex"),
    ).toBe(approval.payload_sha256);
  });

  it.each([
    "review-started",
    "review-in-progress",
    "review-blocked",
    "review-complete",
    "merge-fix-published",
  ])(
    "should publish constrained status %s without accepting a caller body",
    (status) => {
      const approval = createReviewPublicationReceipt({
        ...common,
        kind: "status",
        status,
        body: "APPROVE: all clear",
      });
      const result = runCommand(approval);
      const approvedWithoutBody = createReviewPublicationReceipt({
        ...common,
        kind: "status",
        status,
      });

      expect(approval.payload_sha256).toBe(approvedWithoutBody.payload_sha256);
      expect(result.status).toBe(0);
      expect(result.writes).toEqual([
        {
          arguments: [
            "api",
            "--hostname",
            "github.com",
            "--method",
            "POST",
            "repos/example/project/issues/35/comments",
            "--input",
            "-",
          ],
          body: Buffer.from(approval.payload_utf8_base64, "base64").toString(
            "utf8",
          ),
          operation: "write",
        },
      ]);
    },
  );

  it.each(["reply-inline", "reply-issue"])(
    "should publish a classified %s bound to its comment",
    (operation) => {
      const approval = createReviewPublicationReceipt({ ...reply, operation });
      const result = runCommand(approval);

      expect(result.status).toBe(0);
      expect(result.writes.map((write) => JSON.parse(write.body))).toEqual([
        { body: reply.body },
      ]);
      expect(
        result.records.filter((record) => record.operation === "read"),
      ).toHaveLength(3);
    },
  );

  it.each(["resolve-thread", "unresolve-thread"])(
    "should publish one approved %s operation",
    (operation) => {
      const approval = createReviewPublicationReceipt({
        ...reply,
        operation,
        body: null,
        comment_id: null,
        thread_id: "PRRT_123",
      });
      const result = runCommand(approval);

      expect(result.status).toBe(0);
      expect(result.writes).toEqual([
        {
          arguments: [
            "api",
            "graphql",
            "--hostname",
            "github.com",
            "--input",
            "-",
          ],
          body: Buffer.from(approval.payload_utf8_base64, "base64").toString(
            "utf8",
          ),
          operation: "write",
        },
      ]);
    },
  );

  it("should reject a thread from another pull request before writing", () => {
    const approval = createReviewPublicationReceipt({
      ...reply,
      operation: "resolve-thread",
      body: null,
      comment_id: null,
      thread_id: "PRRT_123",
    });
    const result = runCommand(approval, { relationPullNumber: 36 });

    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it("should reject missing thread metadata before writing", () => {
    const approval = createReviewPublicationReceipt({
      ...reply,
      operation: "unresolve-thread",
      body: null,
      comment_id: null,
      thread_id: "PRRT_123",
    });
    const result = runCommand(approval, {
      threadMetadata: '{"data":{"node":null}}',
    });

    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it("should publish only approved parent findings in a supplement", () => {
    const approval = createReviewPublicationReceipt(
      { ...common, kind: "review-supplement", finding_ids: [finding.id] },
      receipt,
    );
    const result = runCommand(approval);

    expect(approval.binding).toMatchObject({
      submitted_event: null,
      substantive_verdict: null,
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => write.body)).toEqual([
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    ]);
  });

  it.each([
    {
      ...common,
      kind: "review-supplement",
      finding_ids: [finding.id],
      target: { ...common.target, head_oid: changedOid },
    },
    {
      ...common,
      kind: "review-supplement",
      finding_ids: [finding.id],
      reviewer: { ...common.reviewer, login: "other" },
      semantic_approval: {
        ...common.semantic_approval,
        reviewer_login: "other",
      },
    },
    {
      ...common,
      kind: "review-supplement",
      finding_ids: [finding.id, finding.id],
    },
  ])(
    "should reject a supplement that departs from its parent approval %#",
    (assessment) => {
      const result = runCommand(assessment, {
        action: "approve",
        parent: receipt,
      });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it("should reject a supplement without a parent review", () => {
    const result = runCommand(
      { ...common, kind: "review-supplement", finding_ids: [finding.id] },
      { action: "approve" },
    );

    expect(result.status).not.toBe(0);
    expect(result.records).toEqual([]);
  });

  it("should accept a scoped runtime waiver while retaining static and sensitivity evidence", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        tests: {
          ...review.assessment.tests,
          execution: {
            status: "waived",
            waiver: {
              authorized_by: "user",
              reason: "Runtime unavailable",
              scope: "sequence.spec.ts execution",
            },
          },
        },
      },
    });
    const result = runCommand(approval);

    expect(result.status).toBe(0);
    expect(result.writes.map((write) => write.body)).toEqual([
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    ]);
  });

  it.each([
    {
      ...review,
      assessment: {
        ...review.assessment,
        statistics: { files_changed: -1, additions: 0, deletions: 0 },
      },
    },
    {
      ...review,
      assessment: {
        ...review.assessment,
        statistics: { files_changed: 1.5, additions: 0, deletions: 0 },
      },
    },
    {
      ...review,
      assessment: {
        ...review.assessment,
        previous_reports: [
          {
            label: "Old report",
            url: "not-a-url",
            verdict: "fixed",
            evidence: "New test passes.",
          },
        ],
      },
    },
    { ...review, assessment: { ...review.assessment, verdict_sentence: "" } },
    {
      ...review,
      assessment: {
        ...review.assessment,
        alerts: {
          must_change: "Merge blocked",
          worth_considering: null,
          unanchored: null,
        },
      },
    },
    { ...review, semantic_approval: null },
    {
      ...review,
      semantic_approval: { ...common.semantic_approval, approved: false },
    },
    {
      ...review,
      semantic_approval: {
        ...common.semantic_approval,
        reviewer_login: "other",
      },
    },
    { ...review, publisher: common.reviewer },
    {
      ...review,
      assessment: {
        ...review.assessment,
        tests: { ...review.assessment.tests, sensitivity: "" },
      },
    },
    { ...review, assessment: { ...review.assessment, standards: [] } },
    { ...review, assessment: { ...review.assessment, limitations: null } },
    {
      ...review,
      assessment: {
        ...review.assessment,
        limitations: { review_complete: false, entries: [] },
      },
    },
    {
      ...review,
      assessment: {
        ...review.assessment,
        tests: { ...review.assessment.tests, confidence: "unconvincing" },
      },
    },
    {
      ...review,
      assessment: {
        ...review.assessment,
        trust_caps: ["authorization-required"],
      },
    },
    {
      ...review,
      assessment: {
        ...review.assessment,
        findings: [{ ...finding, kind: null, priority: "P1" }],
      },
    },
  ])(
    "should reject incomplete or inconsistent semantic evidence before transport %#",
    (assessment) => {
      const result = runCommand(assessment, { action: "approve" });

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it.each(["sensitivity", "standards", "limitations"])(
    "should reject a runtime waiver that omits %s",
    (omitted) => {
      const waived = {
        ...review.assessment,
        tests: {
          ...review.assessment.tests,
          execution: {
            status: "waived",
            waiver: {
              authorized_by: "user",
              reason: "No runtime available",
              scope: "sequence.spec.ts execution only",
            },
          },
        },
      };
      const assessment =
        omitted === "sensitivity"
          ? { ...waived, tests: { ...waived.tests, sensitivity: "" } }
          : { ...waived, [omitted]: null };
      const result = runCommand(
        { ...review, assessment },
        { action: "approve" },
      );

      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each([
    { ...reply, body: "Evidence receipt: APPROVE, the whole PR is ready." },
    {
      ...reply,
      classification: {
        contains_verdict: true,
        contains_overall_assessment: false,
      },
    },
    {
      ...common,
      kind: "review-supplement",
      finding_ids: ["new-verdict"],
      body: "APPROVE",
    },
    { ...common, kind: "evidence-receipt", body: "APPROVE" },
  ])(
    "should reject a verdict relabeled as ordinary evidence %#",
    (assessment) => {
      const result = runCommand(assessment, {
        action: "approve",
        parent: receipt,
      });

      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it.each([
    {
      ...receipt,
      payload_utf8_base64: Buffer.from('{"body":"replacement"}\n').toString(
        "base64",
      ),
    },
    { ...receipt, payload_sha256: "b".repeat(64) },
    { ...receipt, contract_version: "coding-pr-review-publication/v1" },
    { ...receipt, receipt_version: 0 },
    {
      ...receipt,
      semantic_approval: {
        ...common.semantic_approval,
        evidence_sha256: "b".repeat(64),
      },
    },
    {
      ...receipt,
      approved_assessment: {
        ...review,
        assessment: {
          ...review.assessment,
          findings: [{ ...finding, line: 13 }],
        },
      },
    },
    {
      ...receipt,
      approved_assessment: {
        ...review,
        assessment: { ...review.assessment, summary: "publisher replacement" },
      },
    },
    { ...receipt, binding: { ...receipt.binding, head_oid: changedOid } },
    { ...receipt, binding: { ...receipt.binding, base_oid: changedOid } },
    { ...receipt, binding: { ...receipt.binding, publisher_login: "other" } },
    { ...receipt, binding: { ...receipt.binding, submitted_event: "APPROVE" } },
    { ...receipt, binding: { ...receipt.binding, trust_caps: ["ci-red"] } },
    { ...receipt, parent_approval: receipt },
    {},
    null,
  ])(
    "should reject mutated or malformed approval before any transport %#",
    (approval) => {
      const result = runCommand(approval);

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it.each([{ isMissing: true }, { rawInput: "{" }])(
    "should reject an unavailable approval file %#",
    (options) => {
      const result = runCommand(receipt, options);

      expect(result.status).not.toBe(0);
      expect(result.records).toEqual([]);
    },
  );

  it.each([
    { headOid: changedOid },
    { baseOid: changedOid },
    { baseRef: "release" },
    { author: "other" },
    { publisher: "other" },
    { metadataExit: 1 },
    { metadata: "{" },
    { metadata: "null" },
    { metadata: "{}" },
  ])(
    "should reject stale or unavailable live metadata before a write %#",
    (options) => {
      const result = runCommand(receipt, options);

      expect(result.status).not.toBe(0);
      expect(result.writes).toEqual([]);
    },
  );

  it("should reject a reply targeting a comment from a different PR", () => {
    const result = runCommand(createReviewPublicationReceipt(reply), {
      relationPullNumber: 36,
    });

    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([]);
  });

  it("should publish a black-zone review without a separate authorization receipt", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      review_context: { ...review.review_context, zone: "black" },
    });
    const result = runCommand(approval);

    expect(result.status).toBe(0);
    expect(result.writes.map((write) => write.body)).toEqual([
      Buffer.from(approval.payload_utf8_base64, "base64").toString("utf8"),
    ]);
  });

  it("should keep passing review content independent of whether its publisher authored the PR", () => {
    const selfReview = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pr_author_login: "publisher" },
    });
    expect(approvedBody(selfReview, "green")).toBe(
      approvedBody(receipt, "green"),
    );
  });

  it("should reject the retired APPROVE AI outcome", () => {
    expect(() =>
      createReviewPublicationReceipt({
        ...review,
        assessment: { ...review.assessment, substantive_verdict: "APPROVE" },
      }),
    ).toThrow();
  });

  it("should publish a passing AI review as COMMENT when another account authored the PR", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pr_author_login: "reviewer" },
    });
    const result = runCommand(approval, { author: "reviewer" });

    expect(approval.binding).toMatchObject({
      substantive_verdict: "PASS",
      submitted_event: "COMMENT",
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "COMMENT",
    ]);
  });

  it("should publish a passing AI review as COMMENT when its publisher authored the PR", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pr_author_login: "publisher" },
    });
    const result = runCommand(approval, { author: "publisher" });

    expect(approval.binding).toMatchObject({
      substantive_verdict: "PASS",
      submitted_event: "COMMENT",
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "COMMENT",
    ]);
    const payload = JSON.parse(result.writes[0]!.body);
    expect(payload.body).toMatch(/^📌\n\n✅/);
    expect(payload.body).toContain("> [!NOTE]");
    expect(payload.body).not.toContain("> [!WARNING]");
  });

  it.each(["green", "red", "pending"] as const)(
    "should retain capped blocker context while CI is %s",
    (ciState) => {
      const approval = createReviewPublicationReceipt({
        ...review,
        assessment: {
          ...review.assessment,
          findings: [{ ...finding, kind: null, priority: "P1" }],
          substantive_verdict: "REQUEST_CHANGES",
          tests: { ...review.assessment.tests, confidence: "unconvincing" },
          trust_caps: ["tests-unconvincing"],
          alerts: {
            must_change: null,
            worth_considering: null,
            unanchored: null,
          },
        },
      });
      const result = runCommand(
        approval,
        ciState === "red"
          ? {
              checkRuns: checkRunPages(failedRun),
            }
          : ciState === "pending"
            ? {
                checkRuns: checkRunPages(runningRun),
              }
            : {},
      );

      expect(approval.binding).toMatchObject({
        substantive_verdict: "REQUEST_CHANGES",
        submitted_event: "COMMENT",
        trust_caps: ["tests-unconvincing"],
      });
      expect(result.status).toBe(0);
      expect(
        result.writes.map((write) => JSON.parse(write.body).event),
      ).toEqual(["COMMENT"]);
      const payload = JSON.parse(result.writes[0]!.body);
      expect(reviewStructure(payload.body)).toEqual(
        ciState === "red"
          ? { summary: "❌", alert: "CAUTION" }
          : ciState === "pending"
            ? { summary: "⏳", alert: "WARNING" }
            : { summary: "⚠️", alert: "WARNING" },
      );
    },
  );

  it.each(["author", "publisher"])(
    "should preserve blocker presentation when the PR author is %s",
    (author) => {
      const approval = createReviewPublicationReceipt({
        ...review,
        target: { ...common.target, pr_author_login: author },
        assessment: {
          ...review.assessment,
          findings: [{ ...finding, kind: null, priority: "P1" }],
          alerts: {
            must_change: "Resolve the empty-input failure before merging.",
            worth_considering: null,
            unanchored: null,
          },
          substantive_verdict: "REQUEST_CHANGES",
        },
      });
      const independentReview = createReviewPublicationReceipt({
        ...approval.approved_assessment,
        target: { ...common.target, pr_author_login: "author" },
      });
      expect(approvedBody(approval, "green")).toBe(
        approvedBody(independentReview, "green"),
      );
      const result = runCommand(approval, { author });

      expect(approval.binding).toMatchObject({
        substantive_verdict: "REQUEST_CHANGES",
        submitted_event: author === "publisher" ? "COMMENT" : "REQUEST_CHANGES",
      });
      expect(result.status).toBe(0);
      expect(
        result.writes.map((write) => JSON.parse(write.body).event),
      ).toEqual([author === "publisher" ? "COMMENT" : "REQUEST_CHANGES"]);
      const payload = JSON.parse(result.writes[0]!.body);
      expect(payload.body).toMatch(/^📌\n\n❌/);
      expect(payload.body).toContain(
        "> [!CAUTION]\n> Resolve the empty-input failure before merging.",
      );
      expect(payload.body).not.toContain("> [!WARNING]");
    },
  );
});

function runCommand(input: unknown, options: RunOptions = {}): RunResult {
  const root = mkdtempSync(join(tmpdir(), "review-publication-spec-"));
  try {
    const approvalPath = join(root, "input.json");
    const parentPath = join(root, "parent.json");
    const recordPath = join(root, "transport.jsonl");
    const executable = join(root, "gh");
    if (options.isMissing !== true)
      writeFileSync(approvalPath, options.rawInput ?? JSON.stringify(input));
    writeFileSync(parentPath, JSON.stringify(options.parent ?? null));
    writeFileSync(
      executable,
      `#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const isWrite = args.includes("--input");
const body = isWrite ? readFileSync(0, "utf8") : "";
appendFileSync(process.env.PUBLICATION_RECORD, JSON.stringify({arguments: args, body, operation: isWrite ? "write" : "read"}) + "\\n");
if (isWrite) { process.stdout.write('{"id":91}\\n'); process.exit(0); }
if (Number(process.env.PUBLICATION_METADATA_EXIT)) process.exit(Number(process.env.PUBLICATION_METADATA_EXIT));
if (args.some(arg => arg.endsWith("/branches/main/protection"))) { process.stderr.write(process.env.PUBLICATION_PROTECTION_STATUS === "403" ? "Resource not accessible by integration (HTTP 403)" : "Branch not protected (HTTP 404)"); process.exit(1); }
else if (args.some(arg => arg.endsWith("/branches/main"))) process.stdout.write(JSON.stringify({name: "main", protected: process.env.PUBLICATION_BRANCH_PROTECTED === "true"}));
else if (args.some(arg => arg.includes("/rules/branches/main?"))) { const pages = JSON.parse(process.env.PUBLICATION_POLICY_RULES_AFTER_CI && readFileSync(process.env.PUBLICATION_RECORD, "utf8").includes('/check-runs?') ? process.env.PUBLICATION_POLICY_RULES_AFTER_CI : process.env.PUBLICATION_POLICY_RULES); process.stdout.write(JSON.stringify(args.includes("--paginate") && args.includes("--slurp") ? pages : pages[0])); }
else if (args.includes("user")) process.stdout.write(JSON.stringify({login: process.env.PUBLICATION_USER}));
else if (args.some(arg => /actions\\/runs\\/12$/.test(arg))) process.stdout.write(process.env.PUBLICATION_WORKFLOW_RUN);
else if (args.some(arg => arg.includes("/check-runs?"))) { process.stdout.write(process.env.PUBLICATION_CHECK_RUNS); process.exit(Number(process.env.PUBLICATION_CHECK_RUNS_EXIT)); }
else if (args.some(arg => arg.includes("/status?"))) { process.stdout.write(process.env.PUBLICATION_STATUSES_BODY || JSON.stringify([{state: "pending", statuses: JSON.parse(process.env.PUBLICATION_STATUSES)}])); process.exit(Number(process.env.PUBLICATION_STATUSES_EXIT)); }
else if (args.some(arg => /pulls\\/36\\/reviews\\/91$/.test(arg))) { process.stderr.write("Not Found (HTTP 404)"); process.exit(1); }
else if (args.some(arg => /reviews\\/91$/.test(arg))) process.stdout.write(process.env.PUBLICATION_REVIEW_AFTER_CI && readFileSync(process.env.PUBLICATION_RECORD, "utf8").includes('/check-runs?') ? process.env.PUBLICATION_REVIEW_AFTER_CI : process.env.PUBLICATION_REVIEW);
else if (args.includes("graphql")) process.stdout.write(process.env.PUBLICATION_THREAD_METADATA);
else if (args.some(arg => /comments\\/81$/.test(arg))) process.stdout.write(JSON.stringify({pull_request_url: "https://api.github.com/repos/example/project/pulls/" + process.env.PUBLICATION_RELATION, issue_url: "https://api.github.com/repos/example/project/issues/" + process.env.PUBLICATION_RELATION}));
else process.stdout.write(process.env.PUBLICATION_METADATA_AFTER_CI && readFileSync(process.env.PUBLICATION_RECORD, "utf8").includes('/check-runs?') ? process.env.PUBLICATION_METADATA_AFTER_CI : process.env.PUBLICATION_METADATA);
`,
      { mode: 0o755 },
    );
    const installedScript = join(
      root,
      "skills/pr/scripts/review-publication.ts",
    );
    if (options.templateMutation !== undefined) {
      mkdirSync(join(root, "skills/pr/scripts"), { recursive: true });
      cpSync(scriptPath, installedScript);
      cpSync(
        join(import.meta.dirname, "../../../scripts/gh"),
        join(root, "scripts/gh"),
        { recursive: true },
      );
      const templates = join(import.meta.dirname, "../templates");
      cpSync(templates, join(root, "skills/pr/templates"), { recursive: true });
      const templatePath = join(
        root,
        "skills/pr/templates",
        options.templateMutation.name,
      );
      if (options.templateMutation.content === null)
        rmSync(templatePath, { force: true });
      else
        writeFileSync(
          templatePath,
          typeof options.templateMutation.content === "function"
            ? options.templateMutation.content(
                readFileSync(templatePath, "utf8"),
              )
            : options.templateMutation.content,
        );
    }
    const executableScript =
      options.templateMutation === undefined ? scriptPath : installedScript;
    const arguments_ =
      options.action === "checks"
        ? [
            executableScript,
            "checks",
            "--host",
            "github.com",
            "--owner",
            "example",
            "--repo",
            "project",
            "--head",
            options.headOid ?? headOid,
          ]
        : options.action === "approve"
        ? [
            executableScript,
            "approve",
            "--assessment",
            approvalPath,
            ...(options.parent === undefined
              ? []
              : ["--parent-approval", parentPath]),
          ]
        : [
            executableScript,
            options.action ?? "publish",
            "--approval",
            approvalPath,
            ...(options.action === "update" ? ["--review-id", "91"] : []),
          ];
    const result = spawnSync("bun", arguments_, {
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_PUBLICATION_GH_BIN: executable,
        PUBLICATION_RECORD: recordPath,
        PUBLICATION_STATUSES: JSON.stringify(options.statuses ?? []),
        PUBLICATION_STATUSES_EXIT: String(options.statusesExit ?? 0),
        PUBLICATION_STATUSES_BODY: options.statusesBody ?? "",
        PUBLICATION_PROTECTION_STATUS: String(options.protectionStatus ?? 404),
        PUBLICATION_BRANCH_PROTECTED: String(options.branchProtected ?? false),
        PUBLICATION_WORKFLOW_RUN: JSON.stringify(
          options.workflowRun ?? {
            id: 12,
            head_sha: headOid,
            path: ".github/workflows/ci.yml",
            name: "CI",
          },
        ),
        PUBLICATION_CHECK_RUNS_EXIT: String(options.checkRunsExit ?? 0),
        PUBLICATION_REVIEW: JSON.stringify(options.existingReview ?? {}),
        PUBLICATION_REVIEW_AFTER_CI: options.reviewAfterCi
          ? JSON.stringify(options.reviewAfterCi)
          : "",
        PUBLICATION_CHECK_RUNS: options.checkRuns ?? checkRunPages(passingRun),
        PUBLICATION_USER: options.publisher ?? "publisher",
        PUBLICATION_RELATION: String(options.relationPullNumber ?? 35),
        PUBLICATION_THREAD_METADATA:
          options.threadMetadata ??
          JSON.stringify({
            data: {
              node: {
                __typename: "PullRequestReviewThread",
                pullRequest: {
                  number: options.relationPullNumber ?? 35,
                  repository: { nameWithOwner: "example/project" },
                },
              },
            },
          }),
        PUBLICATION_POLICY_RULES: JSON.stringify(
          options.policyRulePages ?? [options.policyRules ?? []],
        ),
        PUBLICATION_POLICY_RULES_AFTER_CI: options.policyRulesAfterCi
          ? JSON.stringify([options.policyRulesAfterCi])
          : "",
        PUBLICATION_METADATA_EXIT: String(options.metadataExit ?? 0),
        PUBLICATION_METADATA_AFTER_CI: options.metadataAfterCi ?? "",
        PUBLICATION_METADATA:
          options.metadata ??
          JSON.stringify({
            head: { sha: options.headOid ?? headOid },
            base: {
              sha: options.baseOid ?? baseOid,
              ref: options.baseRef ?? "main",
            },
            user: { login: options.author ?? "author" },
          }),
      },
    });
    const records: TransportRecord[] = existsSync(recordPath)
      ? readFileSync(recordPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    return {
      records,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
      writes: records.filter((record) => record.operation === "write"),
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}
