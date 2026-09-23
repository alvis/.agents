import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
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
  action?: "approve" | "publish";
  author?: string;
  baseOid?: string;
  baseRef?: string;
  blackAuthorization?: "same" | "changed" | "missing";
  headOid?: string;
  isMissing?: boolean;
  metadata?: string;
  metadataExit?: number;
  parent?: ReviewPublicationReceipt;
  publisher?: string;
  rawInput?: string;
  relationPullNumber?: number;
  threadMetadata?: string;
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
const evidenceDigest = "a".repeat(64);
const authorizationBody = [
  "Black-zone authorization",
  `Head OID: \`${headOid}\``,
  `Base OID: \`${baseOid}\``,
  "Authorization: I authorize this one-off black-zone publication.",
  "Indivisibility: the review gate and its harness tests because they share a command contract; otherwise the gate can fail open",
].join("\n");
const blackZoneReceipt = {
  author_login: "owner",
  authorization_body: authorizationBody,
  base_oid: baseOid,
  comment_id: 91,
  comment_node_id: "IC_91",
  comment_url: "https://github.com/example/project/pull/35#issuecomment-91",
  head_oid: headOid,
  rationale: {
    coupling: "they share a command contract",
    consequence: "the gate can fail open",
    subject: "the review gate and its harness tests",
  },
} as const;
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
  authorization: {
    black_zone_receipt: null,
    review_evidence_sha256: evidenceDigest,
    zone: "green",
  },
  assessment: {
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
    substantive_verdict: "APPROVE",
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

describe("cmd:review-publication", () => {
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
      event: "APPROVE",
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
        findings: [{ ...finding, kind: null, priority: "P1" }],
      },
    },
    { ...review, authorization: { ...review.authorization, zone: "black" } },
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
    { ...receipt, contract_version: "obsolete" },
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
    { ...receipt, binding: { ...receipt.binding, submitted_event: "COMMENT" } },
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

  it.each([
    { state: "same", accepted: true },
    { state: "changed", accepted: false },
    { state: "missing", accepted: false },
  ] as const)(
    "should recheck black-zone authorization before publication: $state",
    ({ state, accepted }) => {
      const approval = createReviewPublicationReceipt({
        ...review,
        authorization: {
          ...review.authorization,
          black_zone_receipt: blackZoneReceipt,
          zone: "black",
        },
      });
      const result = runCommand(approval, { blackAuthorization: state });

      expect(result.status === 0).toBe(accepted);
      expect(result.writes).toHaveLength(accepted ? 1 : 0);
      if (accepted) {
        expect(result.writes[0]?.body).toBe(
          Buffer.from(approval.payload_utf8_base64, "base64").toString(
            "utf8",
          ),
        );
      }
    },
  );

  it("should derive the GitHub event from the publishing account rather than reviewer metadata", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pr_author_login: "reviewer" },
    });
    const result = runCommand(approval, { author: "reviewer" });

    expect(approval.binding).toMatchObject({
      substantive_verdict: "APPROVE",
      submitted_event: "APPROVE",
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "APPROVE",
    ]);
  });

  it("should downgrade the GitHub event when the publishing account is the PR author", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      target: { ...common.target, pr_author_login: "publisher" },
    });
    const result = runCommand(approval, { author: "publisher" });

    expect(approval.binding).toMatchObject({
      substantive_verdict: "APPROVE",
      submitted_event: "COMMENT",
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "COMMENT",
    ]);
  });

  it("should preserve a blocker verdict while a trust cap submits COMMENT", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        findings: [{ ...finding, kind: null, priority: "P1" }],
        substantive_verdict: "REQUEST_CHANGES",
        tests: { ...review.assessment.tests, confidence: "unconvincing" },
        trust_caps: ["tests-unconvincing"],
      },
    });
    const result = runCommand(approval);

    expect(approval.binding).toMatchObject({
      substantive_verdict: "REQUEST_CHANGES",
      submitted_event: "COMMENT",
      trust_caps: ["tests-unconvincing"],
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "COMMENT",
    ]);
  });

  it("should submit REQUEST_CHANGES for an uncapped blocking finding", () => {
    const approval = createReviewPublicationReceipt({
      ...review,
      assessment: {
        ...review.assessment,
        findings: [{ ...finding, kind: null, priority: "P1" }],
        substantive_verdict: "REQUEST_CHANGES",
      },
    });
    const result = runCommand(approval);

    expect(approval.binding).toMatchObject({
      substantive_verdict: "REQUEST_CHANGES",
      submitted_event: "REQUEST_CHANGES",
    });
    expect(result.status).toBe(0);
    expect(result.writes.map((write) => JSON.parse(write.body).event)).toEqual([
      "REQUEST_CHANGES",
    ]);
  });
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
if (args.includes("user")) process.stdout.write(JSON.stringify({login: process.env.PUBLICATION_USER}));
else if (args.includes("--paginate")) process.stdout.write(process.env.PUBLICATION_AUTHORIZATION_COMMENTS);
else if (args.includes("graphql")) process.stdout.write(process.env.PUBLICATION_THREAD_METADATA);
else if (args.some(arg => /comments\\/81$/.test(arg))) process.stdout.write(JSON.stringify({pull_request_url: "https://api.github.com/repos/example/project/pulls/" + process.env.PUBLICATION_RELATION, issue_url: "https://api.github.com/repos/example/project/issues/" + process.env.PUBLICATION_RELATION}));
else process.stdout.write(process.env.PUBLICATION_METADATA);
`,
      { mode: 0o755 },
    );
    const arguments_ =
      options.action === "approve"
        ? [
            scriptPath,
            "approve",
            "--assessment",
            approvalPath,
            ...(options.parent === undefined
              ? []
              : ["--parent-approval", parentPath]),
          ]
        : [scriptPath, "publish", "--approval", approvalPath];
    const result = spawnSync("bun", arguments_, {
      encoding: "utf8",
      env: {
        ...process.env,
        REVIEW_PUBLICATION_GH_BIN: executable,
        PUBLICATION_RECORD: recordPath,
        PUBLICATION_USER: options.publisher ?? "publisher",
        PUBLICATION_AUTHORIZATION_COMMENTS: JSON.stringify([
          options.blackAuthorization === "missing"
            ? []
            : [
                {
                  author_association: "OWNER",
                  body: authorizationBody,
                  html_url: blackZoneReceipt.comment_url,
                  id: options.blackAuthorization === "changed" ? 92 : 91,
                  node_id: blackZoneReceipt.comment_node_id,
                  user: { login: "owner", type: "User" },
                },
              ],
        ]),
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
        PUBLICATION_METADATA_EXIT: String(options.metadataExit ?? 0),
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
