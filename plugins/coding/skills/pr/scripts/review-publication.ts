#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;
type PublicationKind =
  "discussion-reply" | "review" | "review-supplement" | "status";
type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
type TrustCap =
  | "authorization-required"
  | "ci-red"
  | "partial-review"
  | "spec-unreadable"
  | "tests-unconvincing";

interface PublicationTarget {
  readonly base_oid: string;
  readonly base_ref: string;
  readonly head_oid: string;
  readonly host: string;
  readonly owner: string;
  readonly pr_author_login: string;
  readonly pull_number: number;
  readonly repo: string;
}

interface PublicationIdentity {
  readonly agent_id: string;
  readonly capability: string;
  readonly login: string;
}

interface SemanticApproval {
  readonly approved: true;
  readonly evidence_sha256: string;
  readonly reviewer_agent_id: string;
  readonly reviewer_capability: string;
  readonly reviewer_login: string;
}

interface ReviewFinding {
  readonly body: string;
  readonly evidence: string;
  readonly id: string;
  readonly kind: "chore" | "note" | "praise" | "question" | "thought" | null;
  readonly line: number | null;
  readonly path: string | null;
  readonly priority: "P0" | "P1" | "P2" | "P3" | "P4" | null;
  readonly side: "LEFT" | "RIGHT" | null;
  readonly start_line: number | null;
  readonly subject: string | null;
  readonly title: string;
}

interface ReviewAssessment {
  readonly alerts: {
    readonly must_change: string | null;
    readonly unanchored: string | null;
    readonly worth_considering: string | null;
  };
  readonly findings: readonly ReviewFinding[];
  readonly goal_alignment: string;
  readonly intent_behavior: string;
  readonly limitations: {
    readonly entries: readonly {
      readonly path: string;
      readonly reason: string;
    }[];
    readonly review_complete: boolean;
  };
  readonly minimality: string;
  readonly previous_reports: readonly {
    readonly evidence: string;
    readonly label: string;
    readonly url: string;
    readonly verdict: "does_not_apply" | "fixed" | "still_applies";
  }[];
  readonly requirements_alignment: string;
  readonly reuse: string;
  readonly standards: readonly {
    readonly evidence: string;
    readonly result: "not-applicable" | "passes" | "violates";
    readonly standard: string;
  }[];
  readonly substantive_verdict: "APPROVE" | "REQUEST_CHANGES";
  readonly statistics: {
    readonly additions: number;
    readonly deletions: number;
    readonly files_changed: number;
  };
  readonly summary: string;
  readonly tests: {
    readonly confidence: "convincing" | "unconvincing";
    readonly execution:
      | { readonly evidence: string; readonly status: "executed" | "failed" }
      | {
          readonly status: "waived";
          readonly waiver: {
            readonly authorized_by: string;
            readonly reason: string;
            readonly scope: string;
          };
        };
    readonly sensitivity: string;
  };
  readonly trust_caps: readonly TrustCap[];
  readonly verdict_sentence: string;
}

interface ReviewTemplates {
  readonly inline: string;
  readonly markers: Readonly<Record<ReviewMarker, string>>;
  readonly overall: string;
  readonly sha256: {
    readonly inline_review: string;
    readonly overall_review: string;
  };
}

interface TemplateBlock {
  readonly fields: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
}

type ReviewMarker =
  | "P0"
  | "P1"
  | "P2"
  | "P3"
  | "P4"
  | "chore"
  | "note"
  | "praise"
  | "question"
  | "thought";

interface CommonAssessment {
  readonly contract_version: typeof CONTRACT_VERSION;
  readonly kind: PublicationKind;
  readonly publisher: PublicationIdentity;
  readonly reviewer: PublicationIdentity;
  readonly semantic_approval: SemanticApproval;
  readonly target: PublicationTarget;
}

interface ReviewPublicationAssessment extends CommonAssessment {
  readonly assessment: ReviewAssessment;
  readonly authorization: {
    readonly black_zone_receipt: JsonObject | null;
    readonly review_evidence_sha256: string;
    readonly zone: "black" | "green" | "red" | "yellow";
  };
  readonly kind: "review";
}

interface ReviewSupplementAssessment extends CommonAssessment {
  readonly finding_ids: readonly string[];
  readonly kind: "review-supplement";
}

interface StatusAssessment extends CommonAssessment {
  readonly kind: "status";
  readonly status:
    | "merge-fix-published"
    | "review-blocked"
    | "review-complete"
    | "review-in-progress"
    | "review-started";
}

interface DiscussionReplyAssessment extends CommonAssessment {
  readonly body: string | null;
  readonly classification: {
    readonly contains_overall_assessment: false;
    readonly contains_verdict: false;
  };
  readonly comment_id: number | null;
  readonly kind: "discussion-reply";
  readonly operation:
    "reply-inline" | "reply-issue" | "resolve-thread" | "unresolve-thread";
  readonly thread_id: string | null;
}

type PublicationAssessment =
  | DiscussionReplyAssessment
  | ReviewPublicationAssessment
  | ReviewSupplementAssessment
  | StatusAssessment;

/** exact, deterministic evidence consumed by the publication-only command */
export interface ReviewPublicationReceipt {
  readonly approved_assessment: PublicationAssessment;
  readonly assessment_sha256: string;
  readonly binding: {
    readonly authorization_sha256: string;
    readonly base_oid: string;
    readonly base_ref: string;
    readonly head_oid: string;
    readonly host: string;
    readonly inline_anchors_sha256: string;
    readonly owner: string;
    readonly pr_author_login: string;
    readonly publisher_agent_id: string;
    readonly publisher_capability: string;
    readonly publisher_login: string;
    readonly pull_number: number;
    readonly repo: string;
    readonly reviewer_agent_id: string;
    readonly reviewer_capability: string;
    readonly reviewer_login: string;
    readonly submitted_event: ReviewEvent | null;
    readonly substantive_verdict: "APPROVE" | "REQUEST_CHANGES" | null;
    readonly template_sha256: ReviewTemplates["sha256"] | null;
    readonly trust_caps: readonly TrustCap[];
  };
  readonly contract_version: typeof CONTRACT_VERSION;
  readonly kind: PublicationKind;
  readonly parent_approval: ReviewPublicationReceipt | null;
  readonly payload_sha256: string;
  readonly payload_utf8_base64: string;
  readonly receipt_version: typeof RECEIPT_VERSION;
  readonly semantic_approval: SemanticApproval;
}

/** hook classifier result for one shell command */
export interface ReviewWriteGuardDecision {
  readonly decision: "allow" | "deny" | "ignore";
  readonly reason: string;
}

interface PublicationRequest {
  readonly arguments_: readonly string[];
  readonly bytes: Buffer;
}

interface PublishOptions {
  readonly dryRun?: boolean;
  readonly executable?: string;
}

export const CONTRACT_VERSION = "coding-pr-review-publication/v2" as const;
export const RECEIPT_VERSION = 2 as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OID_PATTERN = /^[0-9a-f]{40}$/;
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const HOST_PATTERN = /^[A-Za-z0-9.-]+$/;
const OWNER_PATTERN = /^[A-Za-z0-9_.-]+$/;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const TRUST_CAPS = new Set<TrustCap>([
  "authorization-required",
  "ci-red",
  "partial-review",
  "spec-unreadable",
  "tests-unconvincing",
]);
const STATUS_TEXT: Readonly<Record<StatusAssessment["status"], string>> = {
  "merge-fix-published":
    "A merge-time fix was published; merging awaits explicit user approval.",
  "review-blocked": "Review is blocked pending new revision-bound evidence.",
  "review-complete":
    "Independent review is complete; see the native GitHub review for the verdict.",
  "review-in-progress": "Independent review is in progress.",
  "review-started": "Independent review has started.",
};
const REVIEW_LANGUAGE_PATTERN =
  /(?:^|\b)(?:approve(?:d|s)?|request(?:ed|s)? changes|review verdict|substantive verdict|must change|not reviewed|goal and requirements|overall review)(?:\b|:)/i;
const PROTECTED_REST_PATTERN = new RegExp(
  String.raw`^repos/[^/]+/[^/]+/(?:issues/(?:\d+/comments|comments/\d+)|pulls/(?:\d+/(?:comments(?:/\d+/replies)?|reviews(?:/\d+(?:/events)?)?)|comments/\d+|reviews/\d+))(?:\?.*)?$`,
);
const PROTECTED_GRAPHQL_PATTERN =
  /\b(?:addComment|addPullRequestReview|addPullRequestReviewComment|addPullRequestReviewThread|deleteIssueComment|deletePullRequestReview|resolveReviewThread|submitPullRequestReview|unresolveReviewThread|updateIssueComment|updatePullRequestReview|updatePullRequestReviewComment)\b/;

const modulePath = fileURLToPath(import.meta.url);
const defaultPluginRoot = resolve(dirname(modulePath), "../../../..");
const templateDirectory = resolve(dirname(modulePath), "../templates");

/**
 * validates an independent assessment and creates its exact publication receipt
 * @param input untrusted assessment JSON
 * @param parentApproval required only for a review supplement
 * @returns deterministic approval evidence and exact outgoing bytes
 */
export function createReviewPublicationReceipt(
  input: unknown,
  parentApproval?: unknown,
): ReviewPublicationReceipt {
  const assessment = parseAssessment(input);
  const parent =
    assessment.kind === "review-supplement"
      ? validateReviewPublicationReceipt(parentApproval)
      : null;
  if (assessment.kind !== "review-supplement" && parentApproval !== undefined) {
    throw new Error("parent approval is valid only for a review supplement");
  }
  const templates =
    assessment.kind === "review" || assessment.kind === "review-supplement"
      ? loadReviewTemplates()
      : null;
  const publication = renderPublication(assessment, parent, templates);
  const payloadBytes = Buffer.from(
    `${JSON.stringify(publication.body)}\n`,
    "utf8",
  );
  const review = assessment.kind === "review" ? assessment : null;
  const authorizationSha256 =
    review === null
      ? assessment.semantic_approval.evidence_sha256
      : hashJson({
          black_zone_receipt: review.authorization.black_zone_receipt,
          review_evidence_sha256: review.authorization.review_evidence_sha256,
        });
  return {
    approved_assessment: assessment,
    assessment_sha256: hashJson(assessment),
    binding: {
      authorization_sha256: authorizationSha256,
      base_oid: assessment.target.base_oid,
      base_ref: assessment.target.base_ref,
      head_oid: assessment.target.head_oid,
      host: assessment.target.host,
      inline_anchors_sha256: hashJson(
        review?.assessment.findings.map((finding) => ({
          id: finding.id,
          line: finding.line,
          path: finding.path,
          side: finding.side,
          start_line: finding.start_line,
        })) ?? [],
      ),
      owner: assessment.target.owner,
      pr_author_login: assessment.target.pr_author_login,
      publisher_agent_id: assessment.publisher.agent_id,
      publisher_capability: assessment.publisher.capability,
      publisher_login: assessment.publisher.login,
      pull_number: assessment.target.pull_number,
      repo: assessment.target.repo,
      reviewer_agent_id: assessment.reviewer.agent_id,
      reviewer_capability: assessment.reviewer.capability,
      reviewer_login: assessment.reviewer.login,
      submitted_event: publication.submittedEvent,
      substantive_verdict: publication.substantiveVerdict,
      template_sha256: templates?.sha256 ?? null,
      trust_caps: publication.trustCaps,
    },
    contract_version: CONTRACT_VERSION,
    kind: assessment.kind,
    parent_approval: parent,
    payload_sha256: hashBytes(payloadBytes),
    payload_utf8_base64: payloadBytes.toString("base64"),
    receipt_version: RECEIPT_VERSION,
    semantic_approval: assessment.semantic_approval,
  };
}

/**
 * reconstructs a receipt from its assessment and rejects changed bindings or bytes
 * @param input untrusted approval JSON
 * @returns the fully validated approval
 */
export function validateReviewPublicationReceipt(
  input: unknown,
): ReviewPublicationReceipt {
  const receipt = objectValue(input, "review publication receipt");
  const regenerated = createReviewPublicationReceipt(
    receipt.approved_assessment,
    receipt.parent_approval === null ? undefined : receipt.parent_approval,
  );
  if (canonicalJson(receipt) !== canonicalJson(regenerated)) {
    throw new Error(
      "review publication receipt is malformed, mutated, or stale",
    );
  }
  return regenerated;
}

/**
 * classifies a shell command before execution and denies supported raw review writes
 * @param command exact command string supplied to the shell tool
 * @param pluginRoot resolved coding plugin root
 * @returns allow, deny, or unrelated decision
 */
export function classifyReviewPublicationCommand(
  command: string,
  pluginRoot = defaultPluginRoot,
): ReviewWriteGuardDecision {
  const expectedScript = normalize(
    resolve(pluginRoot, "skills/pr/scripts/review-publication.ts"),
  );
  if (
    (command.includes("$(") || command.includes("`")) &&
    looksLikeReviewWrite(command)
  ) {
    return {
      decision: "deny",
      reason:
        "Review publication blocked: shell substitution is not a supported GitHub write route.",
    };
  }
  let words: readonly string[];
  try {
    words = unwrapCommand(parseShellWords(command));
  } catch {
    return looksLikeReviewWrite(command)
      ? {
          decision: "deny",
          reason:
            "Review publication blocked: the supported GitHub write command could not be classified safely.",
        }
      : { decision: "ignore", reason: "unrelated command" };
  }
  if (isCanonicalPublisher(words, expectedScript)) {
    return {
      decision: "allow",
      reason:
        "Review publication is delegated to the revision-bound canonical publisher.",
    };
  }
  const protectedWrite = classifyProtectedGitHubWrite(words);
  if (protectedWrite !== null) {
    return {
      decision: "deny",
      reason: `Review publication blocked before GitHub write: ${protectedWrite}. Use coding:pr's canonical review-publication approval and publisher.`,
    };
  }
  return { decision: "ignore", reason: "unrelated command" };
}

/**
 * revalidates a receipt and live PR metadata immediately before one exact GitHub write
 * @param receipt validated publication evidence
 * @param options injectable transport and dry-run behavior
 * @returns GitHub response text, or the exact outgoing body in dry-run mode
 */
export function publishReviewPublication(
  receipt: ReviewPublicationReceipt,
  options: PublishOptions = {},
): string {
  const validated = validateReviewPublicationReceipt(receipt);
  const executable =
    options.executable ?? process.env.REVIEW_PUBLICATION_GH_BIN ?? "gh";
  const target = validated.approved_assessment.target;
  const repository = `${target.owner}/${target.repo}`;
  const surface = runGitHubRead(executable, [
    "api",
    "--hostname",
    target.host,
    `repos/${repository}/pulls/${target.pull_number}`,
  ]);
  const liveHead = stringValue(
    pathValue(surface, ["head", "sha"]),
    "live head OID",
  );
  const liveBase = stringValue(
    pathValue(surface, ["base", "sha"]),
    "live base OID",
  );
  const liveBaseRef = stringValue(
    pathValue(surface, ["base", "ref"]),
    "live base ref",
  );
  const liveAuthor = stringValue(
    pathValue(surface, ["user", "login"]),
    "live PR author",
  );
  if (
    liveHead !== target.head_oid ||
    liveBase !== target.base_oid ||
    liveBaseRef !== target.base_ref ||
    liveAuthor.toLowerCase() !== target.pr_author_login.toLowerCase()
  ) {
    throw new Error(
      "review publication refused: reviewed head/base or PR author changed",
    );
  }
  const currentUser = runGitHubRead(executable, [
    "api",
    "--hostname",
    target.host,
    "user",
  ]);
  const livePublisher = stringValue(currentUser.login, "live publisher login");
  if (
    livePublisher.toLowerCase() !==
    validated.binding.publisher_login.toLowerCase()
  ) {
    throw new Error("review publication refused: publisher identity changed");
  }
  validateLiveSelfReview(validated, liveAuthor);
  validateLiveDiscussionTarget(validated, executable);
  validateLiveBlackAuthorization(validated, executable);
  const request = publicationRequest(validated);
  if (options.dryRun === true) return request.bytes.toString("utf8");
  const completed = spawnSync(executable, request.arguments_, {
    encoding: "utf8",
    input: request.bytes,
  });
  if (completed.status !== 0) {
    throw new Error(
      `review publication write failed: ${completed.stderr.trim() || completed.stdout.trim() || `exit ${completed.status}`}`,
    );
  }
  return completed.stdout;
}

function parseAssessment(input: unknown): PublicationAssessment {
  const value = objectValue(input, "review publication assessment");
  if (value.contract_version !== CONTRACT_VERSION) {
    throw new Error(`contract_version must be ${CONTRACT_VERSION}`);
  }
  const common = parseCommonAssessment(value);
  switch (value.kind) {
    case "review":
      return parseReviewAssessment(value, common);
    case "review-supplement":
      return parseReviewSupplement(value, common);
    case "status":
      return parseStatus(value, common);
    case "discussion-reply":
      return parseDiscussionReply(value, common);
    default:
      throw new Error("unsupported review publication kind");
  }
}

function parseCommonAssessment(input: JsonObject): CommonAssessment {
  const target = parseTarget(input.target);
  const reviewer = parseIdentity(input.reviewer, "reviewer");
  const publisher = parseIdentity(input.publisher, "publisher");
  const semantic = objectValue(input.semantic_approval, "semantic approval");
  if (semantic.approved !== true)
    throw new Error("semantic approval is required");
  const approval: SemanticApproval = {
    approved: true,
    evidence_sha256: sha256Value(
      semantic.evidence_sha256,
      "semantic approval evidence",
    ),
    reviewer_agent_id: nonemptyString(
      semantic.reviewer_agent_id,
      "semantic approval reviewer agent ID",
    ),
    reviewer_capability: nonemptyString(
      semantic.reviewer_capability,
      "semantic approval reviewer capability",
    ),
    reviewer_login: loginValue(
      semantic.reviewer_login,
      "semantic approval reviewer login",
    ),
  };
  if (
    approval.reviewer_login.toLowerCase() !== reviewer.login.toLowerCase() ||
    approval.reviewer_agent_id !== reviewer.agent_id ||
    approval.reviewer_capability !== reviewer.capability
  ) {
    throw new Error("semantic approval identity does not match the reviewer");
  }
  return {
    contract_version: CONTRACT_VERSION,
    kind: input.kind as PublicationKind,
    publisher,
    reviewer,
    semantic_approval: approval,
    target,
  };
}

function parseReviewAssessment(
  input: JsonObject,
  common: CommonAssessment,
): ReviewPublicationAssessment {
  if (common.reviewer.agent_id === common.publisher.agent_id) {
    throw new Error(
      "reviewer and publication agent must be independent identities",
    );
  }
  const authorization = objectValue(
    input.authorization,
    "review authorization",
  );
  const zone = enumValue(
    authorization.zone,
    ["black", "green", "red", "yellow"] as const,
    "review zone",
  );
  const blackZoneReceipt =
    authorization.black_zone_receipt === null
      ? null
      : objectValue(
          authorization.black_zone_receipt,
          "black-zone authorization receipt",
        );
  const assessment = parseReviewJudgment(input.assessment);
  validateVerdict(assessment);
  validateTrustCaps(assessment, zone, blackZoneReceipt);
  return {
    ...common,
    assessment,
    authorization: {
      black_zone_receipt: blackZoneReceipt,
      review_evidence_sha256: sha256Value(
        authorization.review_evidence_sha256,
        "review evidence digest",
      ),
      zone,
    },
    kind: "review",
  };
}

function parseReviewJudgment(input: unknown): ReviewAssessment {
  const value = objectValue(input, "review assessment");
  const tests = objectValue(value.tests, "test assessment");
  const execution = objectValue(tests.execution, "test execution");
  const executionStatus = enumValue(
    execution.status,
    ["executed", "failed", "waived"] as const,
    "test execution status",
  );
  const parsedExecution: ReviewAssessment["tests"]["execution"] =
    executionStatus === "waived"
      ? {
          status: "waived",
          waiver: parseWaiver(execution.waiver),
        }
      : {
          evidence: nonemptyString(
            execution.evidence,
            "test execution evidence",
          ),
          status: executionStatus,
        };
  const standards = arrayValue(value.standards, "standards assessment").map(
    (entry, index) => {
      const standard = objectValue(entry, `standards assessment ${index + 1}`);
      return {
        evidence: nonemptyString(standard.evidence, "standards evidence"),
        result: enumValue(
          standard.result,
          ["not-applicable", "passes", "violates"] as const,
          "standards result",
        ),
        standard: nonemptyString(standard.standard, "standard identity"),
      };
    },
  );
  if (standards.length === 0)
    throw new Error("static standards assessment is required");
  const limitations = objectValue(value.limitations, "review limitations");
  const entries = arrayValue(
    limitations.entries,
    "review limitation entries",
  ).map((entry, index) => {
    const limitation = objectValue(entry, `review limitation ${index + 1}`);
    return {
      path: nonemptyString(limitation.path, "limitation path"),
      reason: nonemptyString(limitation.reason, "limitation reason"),
    };
  });
  const reviewComplete = booleanValue(
    limitations.review_complete,
    "review completeness",
  );
  if (reviewComplete === entries.length > 0) {
    throw new Error(
      reviewComplete
        ? "a complete review cannot declare excluded paths"
        : "an incomplete review must declare every excluded path",
    );
  }
  const trustCaps = uniqueArray(
    arrayValue(value.trust_caps, "trust caps").map((cap) => {
      if (typeof cap !== "string" || !TRUST_CAPS.has(cap as TrustCap)) {
        throw new Error("invalid review trust cap");
      }
      return cap as TrustCap;
    }),
  );
  const findings = arrayValue(value.findings, "review findings").map(
    parseFinding,
  );
  uniqueArray(findings.map((finding) => finding.id));
  const substantiveVerdict = enumValue(
    value.substantive_verdict,
    ["APPROVE", "REQUEST_CHANGES"] as const,
    "substantive verdict",
  );
  const alerts = objectValue(value.alerts, "review alerts");
  const parsedAlerts: ReviewAssessment["alerts"] = {
    must_change: nullableString(alerts.must_change, "must-change alert"),
    unanchored: nullableString(alerts.unanchored, "unanchored alert"),
    worth_considering: nullableString(
      alerts.worth_considering,
      "worth-considering alert",
    ),
  };
  const previousReports = arrayValue(
    value.previous_reports,
    "changed previous reports",
  ).map((entry, index) => {
    const report = objectValue(entry, `changed previous report ${index + 1}`);
    return {
      evidence: nonemptyString(report.evidence, "previous report evidence"),
      label: nonemptyString(report.label, "previous report label"),
      url: httpUrl(report.url, "previous report URL"),
      verdict: enumValue(
        report.verdict,
        ["does_not_apply", "fixed", "still_applies"] as const,
        "previous report verdict",
      ),
    };
  });
  const statistics = objectValue(value.statistics, "review statistics");
  validateReviewAlerts(parsedAlerts, findings, substantiveVerdict, trustCaps);
  return {
    alerts: parsedAlerts,
    findings,
    goal_alignment: nonemptyString(value.goal_alignment, "goal alignment"),
    intent_behavior: nonemptyString(
      value.intent_behavior,
      "intent behavior assessment",
    ),
    limitations: {
      entries,
      review_complete: reviewComplete,
    },
    minimality: nonemptyString(value.minimality, "minimality assessment"),
    previous_reports: previousReports,
    requirements_alignment: nonemptyString(
      value.requirements_alignment,
      "requirements alignment",
    ),
    reuse: nonemptyString(value.reuse, "reuse assessment"),
    standards,
    substantive_verdict: substantiveVerdict,
    statistics: {
      additions: nonnegativeInteger(statistics.additions, "review additions"),
      deletions: nonnegativeInteger(statistics.deletions, "review deletions"),
      files_changed: nonnegativeInteger(
        statistics.files_changed,
        "review files changed",
      ),
    },
    summary: nonemptyString(value.summary, "review summary"),
    tests: {
      confidence: enumValue(
        tests.confidence,
        ["convincing", "unconvincing"] as const,
        "test confidence",
      ),
      execution: parsedExecution,
      sensitivity: nonemptyString(
        tests.sensitivity,
        "test-sensitivity reasoning",
      ),
    },
    trust_caps: trustCaps,
    verdict_sentence: nonemptyString(
      value.verdict_sentence,
      "review verdict sentence",
    ),
  };
}

function validateReviewAlerts(
  alerts: ReviewAssessment["alerts"],
  findings: readonly ReviewFinding[],
  substantiveVerdict: ReviewAssessment["substantive_verdict"],
  trustCaps: readonly TrustCap[],
): void {
  const anchored = findings.filter((finding) => finding.path !== null);
  const blocking = anchored.some(isBlockingFinding);
  const optional = anchored.some((finding) => !isBlockingFinding(finding));
  const unanchored = findings.some((finding) => finding.path === null);
  const expectsMustChange =
    substantiveVerdict === "REQUEST_CHANGES" &&
    blocking &&
    trustCaps.length === 0;
  const expectsWorthConsidering =
    substantiveVerdict === "APPROVE" && optional;
  const expectations: readonly [string, boolean, string | null][] = [
    ["must_change", expectsMustChange, alerts.must_change],
    ["worth_considering", expectsWorthConsidering, alerts.worth_considering],
    ["unanchored", unanchored, alerts.unanchored],
  ];
  for (const [name, expected, value] of expectations) {
    if (expected !== (value !== null)) {
      throw new Error(
        `${name} alert must be ${expected ? "present" : "null"} for the recorded review`,
      );
    }
  }
}

function parseWaiver(input: unknown): {
  readonly authorized_by: string;
  readonly reason: string;
  readonly scope: string;
} {
  const waiver = objectValue(input, "runtime-test waiver");
  return {
    authorized_by: nonemptyString(waiver.authorized_by, "waiver authorizer"),
    reason: nonemptyString(waiver.reason, "waiver reason"),
    scope: nonemptyString(waiver.scope, "waiver scope"),
  };
}

function parseFinding(input: unknown, index: number): ReviewFinding {
  const finding = objectValue(input, `review finding ${index + 1}`);
  const priority =
    finding.priority === null
      ? null
      : enumValue(
          finding.priority,
          ["P0", "P1", "P2", "P3", "P4"] as const,
          "finding priority",
        );
  const kind =
    finding.kind === null
      ? null
      : enumValue(
          finding.kind,
          ["chore", "note", "praise", "question", "thought"] as const,
          "finding kind",
        );
  if ((priority === null) === (kind === null)) {
    throw new Error("each finding needs exactly one priority or kind");
  }
  const path = nullableString(finding.path, "finding path");
  const line = nullablePositiveInteger(finding.line, "finding line");
  const side =
    finding.side === null
      ? null
      : enumValue(finding.side, ["LEFT", "RIGHT"] as const, "finding side");
  const startLine = nullablePositiveInteger(
    finding.start_line,
    "finding start line",
  );
  if (
    (path === null || line === null || side === null) &&
    !(path === null && line === null && side === null && startLine === null)
  ) {
    throw new Error(
      "finding anchors must be entirely present or entirely null",
    );
  }
  if (startLine !== null && (line === null || startLine >= line)) {
    throw new Error("finding start_line must precede line");
  }
  return {
    body: nonemptyString(finding.body, "finding body"),
    evidence: nonemptyString(finding.evidence, "finding evidence"),
    id: safeId(finding.id, "finding ID"),
    kind,
    line,
    path,
    priority,
    side,
    start_line: startLine,
    subject: nullableString(finding.subject, "finding subject"),
    title: nonemptyString(finding.title, "finding title"),
  };
}

function parseReviewSupplement(
  input: JsonObject,
  common: CommonAssessment,
): ReviewSupplementAssessment {
  if (common.reviewer.agent_id === common.publisher.agent_id) {
    throw new Error("review supplement requires an independent reviewer");
  }
  const findingIds = uniqueArray(
    arrayValue(input.finding_ids, "supplement finding IDs").map((id) =>
      safeId(id, "supplement finding ID"),
    ),
  );
  if (findingIds.length === 0)
    throw new Error("review supplement needs approved findings");
  return { ...common, finding_ids: findingIds, kind: "review-supplement" };
}

function parseStatus(
  input: JsonObject,
  common: CommonAssessment,
): StatusAssessment {
  return {
    ...common,
    kind: "status",
    status: enumValue(
      input.status,
      [
        "merge-fix-published",
        "review-blocked",
        "review-complete",
        "review-in-progress",
        "review-started",
      ] as const,
      "review status",
    ),
  };
}

function parseDiscussionReply(
  input: JsonObject,
  common: CommonAssessment,
): DiscussionReplyAssessment {
  if (common.reviewer.agent_id === common.publisher.agent_id) {
    throw new Error(
      "free-form discussion replies require an independent classifier",
    );
  }
  const classification = objectValue(
    input.classification,
    "discussion classification",
  );
  if (
    classification.contains_overall_assessment !== false ||
    classification.contains_verdict !== false
  ) {
    throw new Error(
      "discussion reply cannot carry an overall assessment or verdict",
    );
  }
  const operation = enumValue(
    input.operation,
    [
      "reply-inline",
      "reply-issue",
      "resolve-thread",
      "unresolve-thread",
    ] as const,
    "discussion operation",
  );
  const body = nullableString(input.body, "discussion reply body");
  const commentId = nullablePositiveInteger(
    input.comment_id,
    "discussion comment ID",
  );
  const threadId = nullableString(input.thread_id, "discussion thread ID");
  if (operation.startsWith("reply-") && body === null) {
    throw new Error("discussion reply body is required");
  }
  if (body !== null && REVIEW_LANGUAGE_PATTERN.test(body)) {
    throw new Error("discussion reply contains review-verdict language");
  }
  if (
    (operation === "reply-inline" || operation === "reply-issue") &&
    commentId === null
  ) {
    throw new Error("discussion reply needs its target comment ID");
  }
  if (
    (operation === "resolve-thread" || operation === "unresolve-thread") &&
    threadId === null
  ) {
    throw new Error("thread operation needs a thread ID");
  }
  return {
    ...common,
    body,
    classification: {
      contains_overall_assessment: false,
      contains_verdict: false,
    },
    comment_id: commentId,
    kind: "discussion-reply",
    operation,
    thread_id: threadId,
  };
}

function parseTarget(input: unknown): PublicationTarget {
  const target = objectValue(input, "publication target");
  return {
    base_oid: oidValue(target.base_oid, "base OID"),
    base_ref: nonemptyString(target.base_ref, "base ref"),
    head_oid: oidValue(target.head_oid, "head OID"),
    host: patternString(target.host, HOST_PATTERN, "GitHub host"),
    owner: patternString(target.owner, OWNER_PATTERN, "repository owner"),
    pr_author_login: loginValue(target.pr_author_login, "PR author login"),
    pull_number: positiveInteger(target.pull_number, "pull request number"),
    repo: patternString(target.repo, REPO_PATTERN, "repository name"),
  };
}

function parseIdentity(
  input: unknown,
  description: string,
): PublicationIdentity {
  const identity = objectValue(input, `${description} identity`);
  return {
    agent_id: nonemptyString(identity.agent_id, `${description} agent ID`),
    capability: nonemptyString(
      identity.capability,
      `${description} capability`,
    ),
    login: loginValue(identity.login, `${description} login`),
  };
}

function validateVerdict(assessment: ReviewAssessment): void {
  const hasBlocker = assessment.findings.some(
    (finding) =>
      finding.priority === "P0" ||
      finding.priority === "P1" ||
      finding.kind === "chore",
  );
  const expected = hasBlocker ? "REQUEST_CHANGES" : "APPROVE";
  if (assessment.substantive_verdict !== expected) {
    throw new Error(
      `substantive verdict must be ${expected} for the recorded findings`,
    );
  }
}

function validateTrustCaps(
  assessment: ReviewAssessment,
  zone: ReviewPublicationAssessment["authorization"]["zone"],
  blackZoneReceipt: JsonObject | null,
): void {
  const caps = new Set(assessment.trust_caps);
  if (
    caps.has("tests-unconvincing") !==
    (assessment.tests.confidence === "unconvincing")
  ) {
    throw new Error(
      "tests-unconvincing cap must exactly match test confidence",
    );
  }
  if (caps.has("partial-review") !== !assessment.limitations.review_complete) {
    throw new Error(
      "partial-review cap must exactly match review completeness",
    );
  }
  if (
    blackZoneReceipt !== null &&
    (zone !== "black" || assessment.substantive_verdict !== "APPROVE")
  ) {
    throw new Error(
      "black-zone authorization evidence applies only to black-zone approval",
    );
  }
  const authorizationRequired =
    zone === "black" &&
    assessment.substantive_verdict === "APPROVE" &&
    blackZoneReceipt === null;
  if (caps.has("authorization-required") !== authorizationRequired) {
    throw new Error(
      "authorization-required cap must exactly match black-zone approval authorization",
    );
  }
}

function isBlockingFinding(finding: ReviewFinding): boolean {
  return (
    finding.priority === "P0" ||
    finding.priority === "P1" ||
    finding.kind === "chore"
  );
}

function loadReviewTemplates(): ReviewTemplates {
  const inlinePath = resolve(templateDirectory, "inline-review.md");
  const overallPath = resolve(templateDirectory, "overall-review.md");
  let inlineSource: string;
  let overallSource: string;
  try {
    inlineSource = readFileSync(inlinePath, "utf8");
    overallSource = readFileSync(overallPath, "utf8");
  } catch (error) {
    throw new Error(
      `review template unavailable: ${(error as Error).message}`,
      { cause: error },
    );
  }
  const inlineMatch = /^<!--([\s\S]*?)-->\r?\n\r?\n([\s\S]+)$/.exec(
    inlineSource,
  );
  if (inlineMatch === null) {
    throw new Error("inline-review template has no canonical body");
  }
  const overallMatches = [
    ...overallSource.matchAll(/```markdown\r?\n([\s\S]*?)\r?\n```/g),
  ];
  if (overallMatches.length !== 1) {
    throw new Error("overall-review template must contain one canonical body");
  }
  const markerKeys: readonly ReviewMarker[] = [
    "P0",
    "P1",
    "P2",
    "P3",
    "P4",
    "chore",
    "note",
    "praise",
    "question",
    "thought",
  ];
  const markerEntries = [
    ...inlineMatch[1]!.matchAll(
      /^- `(P[0-4]|chore|note|praise|question|thought)`: `([^\r\n]+)`$/gm,
    ),
  ].map((match) => [match[1]!, match[2]!] as const);
  if (
    markerEntries.length !== markerKeys.length ||
    new Set(markerEntries.map(([key]) => key)).size !== markerKeys.length ||
    markerKeys.some((key) => !markerEntries.some(([entry]) => entry === key))
  ) {
    throw new Error("inline-review marker definitions are malformed");
  }
  const markers = Object.fromEntries(markerEntries) as Record<
    ReviewMarker,
    string
  >;
  const inline = canonicalTemplateBody(inlineMatch[2]!, "inline-review");
  const overall = canonicalTemplateBody(
    overallMatches[0]![1]!,
    "overall-review",
  );
  renderTemplate(
    inline,
    { body: "body", marker: "marker", title: "title" },
    {},
    "inline-review",
  );
  return {
    inline,
    markers,
    overall,
    sha256: {
      inline_review: hashBytes(Buffer.from(inlineSource, "utf8")),
      overall_review: hashBytes(Buffer.from(overallSource, "utf8")),
    },
  };
}

function canonicalTemplateBody(input: string, name: string): string {
  const normalized = input.replaceAll("\r\n", "\n");
  if (
    normalized.trim() === "" ||
    normalized !== normalized.trimStart() ||
    normalized.split("\n").some((line) => /[ \t]+$/.test(line))
  ) {
    throw new Error(`${name} canonical body is malformed`);
  }
  return `${normalized.trimEnd()}\n`;
}

function renderTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  blocks: Readonly<Record<string, TemplateBlock>>,
  name: string,
): string {
  const withoutTokens = template.replace(
    /{{(?:[#/]?[a-z][a-z0-9_]*)}}/g,
    "",
  );
  const placeholderNames = [
    ...template.matchAll(/{{([a-z][a-z0-9_]*)}}/g),
  ].map((match) => match[1]!);
  const conditionOpenNames = [
    ...template.matchAll(/{{#([a-z][a-z0-9_]*)}}/g),
  ].map((match) => match[1]!);
  const conditionCloseNames = [
    ...template.matchAll(/{{\/([a-z][a-z0-9_]*)}}/g),
  ].map((match) => match[1]!);
  const blockNames = Object.keys(blocks);
  const allowedPlaceholders = [
    ...Object.keys(values),
    ...Object.values(blocks).flatMap((block) => block.fields),
  ];
  if (
    withoutTokens.includes("{{") ||
    withoutTokens.includes("}}") ||
    !sameStringSet(placeholderNames, allowedPlaceholders) ||
    !sameStringSet(conditionOpenNames, blockNames) ||
    !sameStringSet(conditionCloseNames, blockNames) ||
    conditionOpenNames.length !== conditionCloseNames.length
  ) {
    throw new Error(`${name} template placeholders are malformed`);
  }
  const rendered = renderTemplateSegment(template, values, blocks, name);
  return `${rendered.trimEnd()}\n`;
}

function renderTemplateSegment(
  template: string,
  values: Readonly<Record<string, string>>,
  blocks: Readonly<Record<string, TemplateBlock>>,
  name: string,
): string {
  const opening = /{{#([a-z][a-z0-9_]*)}}\n/g.exec(template);
  if (opening === null) {
    if (/{{\/[^}]+}}/.test(template)) {
      throw new Error(`${name} template condition blocks are malformed`);
    }
    return template.replace(
      /{{([a-z][a-z0-9_]*)}}/g,
      (_token, key: string) => {
        const value = values[key];
        if (value === undefined) {
          throw new Error(`${name} template placeholder ${key} is unavailable`);
        }
        return value;
      },
    );
  }
  const blockName = opening[1]!;
  const bodyStart = opening.index + opening[0].length;
  const tokenPattern = /{{([#/])([a-z][a-z0-9_]*)}}\n?/g;
  tokenPattern.lastIndex = bodyStart;
  const stack = [blockName];
  let closing: RegExpExecArray | null = null;
  for (
    let token = tokenPattern.exec(template);
    token !== null;
    token = tokenPattern.exec(template)
  ) {
    const [, kind, tokenName] = token;
    if (kind === "#") stack.push(tokenName!);
    else if (stack.pop() !== tokenName) {
      throw new Error(`${name} template condition blocks are malformed`);
    }
    if (stack.length === 0) {
      closing = token;
      break;
    }
  }
  if (closing === null) {
    throw new Error(`${name} template condition blocks are malformed`);
  }
  const block = blocks[blockName];
  if (block === undefined) {
    throw new Error(`${name} template block ${blockName} is unavailable`);
  }
  const before = renderTemplateSegment(
    template.slice(0, opening.index),
    values,
    blocks,
    name,
  );
  const body = template.slice(bodyStart, closing.index);
  const repeated = block.rows
    .map((row) =>
      renderTemplateSegment(body, { ...values, ...row }, blocks, name),
    )
    .join("");
  const after = renderTemplateSegment(
    template.slice(closing.index + closing[0].length),
    values,
    blocks,
    name,
  );
  return `${before}${repeated}${after}`;
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

function renderPublication(
  assessment: PublicationAssessment,
  parent: ReviewPublicationReceipt | null,
  templates: ReviewTemplates | null,
): {
  readonly body: JsonObject;
  readonly substantiveVerdict: "APPROVE" | "REQUEST_CHANGES" | null;
  readonly submittedEvent: ReviewEvent | null;
  readonly trustCaps: readonly TrustCap[];
} {
  switch (assessment.kind) {
    case "review":
      if (templates === null) {
        throw new Error("review templates are required for review rendering");
      }
      return renderReview(assessment, templates);
    case "review-supplement":
      if (templates === null) {
        throw new Error("review templates are required for supplement rendering");
      }
      return renderReviewSupplement(
        assessment,
        requiredParentReview(parent),
        templates,
      );
    case "status":
      return {
        body: { body: renderStatus(assessment) },
        substantiveVerdict: null,
        submittedEvent: null,
        trustCaps: [],
      };
    case "discussion-reply":
      return {
        body: renderDiscussionReply(assessment),
        substantiveVerdict: null,
        submittedEvent: null,
        trustCaps: [],
      };
  }
}

function renderReview(
  assessment: ReviewPublicationAssessment,
  templates: ReviewTemplates,
): {
  readonly body: JsonObject;
  readonly substantiveVerdict: "APPROVE" | "REQUEST_CHANGES";
  readonly submittedEvent: ReviewEvent;
  readonly trustCaps: readonly TrustCap[];
} {
  const judgment = assessment.assessment;
  const isSelfReview =
    assessment.publisher.login.toLowerCase() ===
    assessment.target.pr_author_login.toLowerCase();
  const submittedEvent: ReviewEvent =
    judgment.trust_caps.length > 0 || isSelfReview
      ? "COMMENT"
      : judgment.substantive_verdict;
  const comments = judgment.findings
    .filter((finding) => finding.path !== null)
    .map((finding) => ({
      body: renderInlineFinding(finding, templates),
      line: finding.line,
      path: finding.path,
      side: finding.side,
      start_line: finding.start_line ?? undefined,
      start_side: finding.start_line === null ? undefined : finding.side,
    }));
  return {
    body: {
      commit_id: assessment.target.head_oid,
      body: renderOverallReview(assessment, templates),
      event: submittedEvent,
      comments,
    },
    substantiveVerdict: judgment.substantive_verdict,
    submittedEvent,
    trustCaps: judgment.trust_caps,
  };
}

function renderOverallReview(
  input: ReviewPublicationAssessment,
  templates: ReviewTemplates,
): string {
  const { assessment, target } = input;
  const blocking = assessment.findings.filter(
    (finding) => finding.path !== null && isBlockingFinding(finding),
  );
  const optional = assessment.findings.filter(
    (finding) => finding.path !== null && !blocking.includes(finding),
  );
  const unanchored = assessment.findings.filter(
    (finding) => finding.path === null,
  );
  const standards = assessment.standards
    .map(
      (entry) => `- **${entry.standard}** — ${entry.result}: ${entry.evidence}`,
    )
    .join("\n");
  const testExecution =
    assessment.tests.execution.status === "waived"
      ? `Runtime execution waived by ${assessment.tests.execution.waiver.authorized_by} for ${assessment.tests.execution.waiver.scope}: ${assessment.tests.execution.waiver.reason}`
      : `${assessment.tests.execution.status}: ${assessment.tests.execution.evidence}`;
  const hasCap = assessment.trust_caps.length > 0;
  return renderTemplate(
    templates.overall,
    {
      additions: String(assessment.statistics.additions),
      deletions: String(assessment.statistics.deletions),
      files_changed: String(assessment.statistics.files_changed),
      goal_spec_verdict: [
        assessment.goal_alignment,
        assessment.requirements_alignment,
      ].join("\n\n"),
      head_sha_short: target.head_oid.slice(0, 7),
      intent_behavior_verdict: assessment.intent_behavior,
      minimality_verdict: assessment.minimality,
      one_paragraph_read: assessment.summary,
      reuse_verdict: assessment.reuse,
      standards_verdict: standards,
      test_verdict: [
        assessment.tests.sensitivity,
        `${testExecution}. Confidence: ${assessment.tests.confidence}.`,
      ].join("\n\n"),
      unanchored_alert: assessment.alerts.unanchored ?? "",
      verdict_alert: hasCap
        ? "WARNING"
        : assessment.substantive_verdict === "REQUEST_CHANGES"
          ? "CAUTION"
          : "NOTE",
      verdict_glyph: hasCap
        ? "⚠️"
        : assessment.substantive_verdict === "APPROVE"
          ? "✅"
          : "❌",
      verdict_sentence: renderVerdictSentence(input),
      zone: input.authorization.zone,
    },
    {
      excluded_paths: {
        fields: ["path", "reason"],
        rows: assessment.limitations.entries,
      },
      must_change: conditionBlock(blocking.length > 0),
      must_change_alert: textBlock(assessment.alerts.must_change),
      must_change_findings: findingBlocks(blocking, templates),
      not_reviewed: conditionBlock(assessment.limitations.entries.length > 0),
      previous_report_entries: {
        fields: ["evidence", "label", "url", "verdict"],
        rows: assessment.previous_reports,
      },
      previous_reports: conditionBlock(assessment.previous_reports.length > 0),
      unanchored: conditionBlock(unanchored.length > 0),
      unanchored_findings: findingBlocks(unanchored, templates),
      worth_considering: conditionBlock(optional.length > 0),
      worth_considering_alert: textBlock(
        assessment.alerts.worth_considering,
      ),
      worth_considering_findings: findingBlocks(optional, templates),
    },
    "overall-review",
  );
}

function findingBlocks(
  findings: readonly ReviewFinding[],
  templates: ReviewTemplates,
): TemplateBlock {
  return {
    fields: ["body", "evidence", "location", "marker", "title"],
    rows: findings.map((finding) => {
      const location =
        finding.path === null
          ? (finding.subject ?? "This PR")
          : `${finding.path}:${finding.line}`;
      return {
        body: finding.body,
        evidence: finding.evidence,
        location,
        marker: renderMarker(finding, templates),
        title: finding.title,
      };
    }),
  };
}

function conditionBlock(enabled: boolean): TemplateBlock {
  return { fields: [], rows: enabled ? [{}] : [] };
}

function textBlock(value: string | null): TemplateBlock {
  return {
    fields: ["text"],
    rows: value === null ? [] : [{ text: value }],
  };
}

function renderVerdictSentence(input: ReviewPublicationAssessment): string {
  const { assessment, publisher, target } = input;
  if (assessment.trust_caps.length > 0) {
    return `${assessment.verdict_sentence} GitHub received COMMENT because the review is capped (${assessment.trust_caps.join(", ")}); the substantive verdict is ${assessment.substantive_verdict}.`;
  }
  if (publisher.login.toLowerCase() === target.pr_author_login.toLowerCase()) {
    return `${assessment.verdict_sentence} GitHub weakened the event to COMMENT because the publisher is the PR author; the substantive ${assessment.substantive_verdict} finding is unchanged.`;
  }
  return assessment.verdict_sentence;
}

function renderInlineFinding(
  finding: ReviewFinding,
  templates: ReviewTemplates,
): string {
  return renderTemplate(
    templates.inline,
    {
      body: `${finding.body}\n\nEvidence: ${finding.evidence}`,
      marker: renderMarker(finding, templates),
      title: finding.title,
    },
    {},
    "inline-review",
  );
}

function renderMarker(
  finding: ReviewFinding,
  templates: ReviewTemplates,
): string {
  return templates.markers[(finding.priority ?? finding.kind)!];
}

function renderReviewSupplement(
  assessment: ReviewSupplementAssessment,
  parent: ReviewPublicationReceipt,
  templates: ReviewTemplates,
): {
  readonly body: JsonObject;
  readonly substantiveVerdict: null;
  readonly submittedEvent: null;
  readonly trustCaps: readonly TrustCap[];
} {
  if (parent.kind !== "review")
    throw new Error("review supplement parent must be a review");
  const parentAssessment =
    parent.approved_assessment as ReviewPublicationAssessment;
  assertSameTarget(assessment.target, parentAssessment.target);
  if (
    assessment.reviewer.login.toLowerCase() !==
      parentAssessment.reviewer.login.toLowerCase() ||
    assessment.reviewer.agent_id !== parentAssessment.reviewer.agent_id ||
    assessment.reviewer.capability !== parentAssessment.reviewer.capability
  ) {
    throw new Error(
      "review supplement reviewer differs from the approved review",
    );
  }
  const findingsById = new Map(
    parentAssessment.assessment.findings.map((finding) => [
      finding.id,
      finding,
    ]),
  );
  const findings = assessment.finding_ids.map((id) => {
    const finding = findingsById.get(id);
    if (finding === undefined)
      throw new Error(`supplement finding ${id} is not approved`);
    return finding;
  });
  const parentDigest = hashJson(parent);
  return {
    body: {
      body: [
        `Review supplement for approved assessment \`${parentDigest.slice(0, 12)}\`:`,
        "",
        ...findings.map(
          (finding) =>
            `- ${renderMarker(finding, templates)} **${finding.subject ?? finding.path ?? "This PR"}** — ${finding.title}: ${finding.body} Evidence: ${finding.evidence}`,
        ),
        "",
      ].join("\n"),
    },
    substantiveVerdict: null,
    submittedEvent: null,
    trustCaps: [],
  };
}

function renderStatus(assessment: StatusAssessment): string {
  return `${STATUS_TEXT[assessment.status]} Revision \`${assessment.target.head_oid.slice(0, 12)}\` against \`${assessment.target.base_ref}\`.`;
}

function renderDiscussionReply(
  assessment: DiscussionReplyAssessment,
): JsonObject {
  if (
    assessment.operation === "resolve-thread" ||
    assessment.operation === "unresolve-thread"
  ) {
    const field =
      assessment.operation === "resolve-thread"
        ? "resolveReviewThread"
        : "unresolveReviewThread";
    return {
      query: `mutation($threadId:ID!){${field}(input:{threadId:$threadId}){thread{isResolved}}}`,
      variables: { threadId: assessment.thread_id },
    };
  }
  return { body: assessment.body };
}

function requiredParentReview(
  parent: ReviewPublicationReceipt | null,
): ReviewPublicationReceipt {
  if (parent === null)
    throw new Error("review supplement requires its parent approval");
  return parent;
}

function publicationRequest(
  receipt: ReviewPublicationReceipt,
): PublicationRequest {
  const target = receipt.approved_assessment.target;
  const root = `repos/${target.owner}/${target.repo}`;
  const input = Buffer.from(receipt.payload_utf8_base64, "base64");
  if (hashBytes(input) !== receipt.payload_sha256) {
    throw new Error("review publication payload digest mismatch");
  }
  let endpoint: string;
  if (receipt.kind === "review") {
    endpoint = `${root}/pulls/${target.pull_number}/reviews`;
  } else if (
    receipt.kind === "review-supplement" ||
    receipt.kind === "status"
  ) {
    endpoint = `${root}/issues/${target.pull_number}/comments`;
  } else {
    const discussion = receipt.approved_assessment as DiscussionReplyAssessment;
    if (discussion.operation === "reply-inline") {
      endpoint = `${root}/pulls/${target.pull_number}/comments/${discussion.comment_id}/replies`;
    } else if (discussion.operation === "reply-issue") {
      endpoint = `${root}/issues/${target.pull_number}/comments`;
    } else {
      return {
        arguments_: [
          "api",
          "graphql",
          "--hostname",
          target.host,
          "--input",
          "-",
        ],
        bytes: input,
      };
    }
  }
  return {
    arguments_: [
      "api",
      "--hostname",
      target.host,
      "--method",
      "POST",
      endpoint,
      "--input",
      "-",
    ],
    bytes: input,
  };
}

function runGitHubRead(
  executable: string,
  arguments_: readonly string[],
): JsonObject {
  const completed = spawnSync(executable, arguments_, { encoding: "utf8" });
  if (completed.status !== 0) {
    throw new Error(
      `review publication metadata lookup failed: ${completed.stderr.trim() || completed.stdout.trim() || `exit ${completed.status}`}`,
    );
  }
  try {
    return objectValue(
      JSON.parse(completed.stdout) as unknown,
      "GitHub metadata",
    );
  } catch (error) {
    throw new Error(
      `review publication metadata is malformed: ${(error as Error).message}`,
    );
  }
}

function validateLiveSelfReview(
  receipt: ReviewPublicationReceipt,
  liveAuthor: string,
): void {
  if (receipt.kind !== "review") return;
  const isSelfReview =
    receipt.binding.publisher_login.toLowerCase() === liveAuthor.toLowerCase();
  const isComment = receipt.binding.submitted_event === "COMMENT";
  if (isSelfReview && !isComment) {
    throw new Error("self-review must be submitted as COMMENT");
  }
}

function validateLiveDiscussionTarget(
  receipt: ReviewPublicationReceipt,
  executable: string,
): void {
  if (receipt.kind !== "discussion-reply") return;
  const assessment = receipt.approved_assessment as DiscussionReplyAssessment;
  if (
    assessment.operation === "resolve-thread" ||
    assessment.operation === "unresolve-thread"
  ) {
    const target = assessment.target;
    const thread = runGitHubRead(executable, [
      "api",
      "graphql",
      "--hostname",
      target.host,
      "-f",
      "query=query($thread:ID!){node(id:$thread){__typename ... on PullRequestReviewThread{pullRequest{number repository{nameWithOwner}}}}}",
      "-f",
      `thread=${assessment.thread_id}`,
    ]);
    const node = objectValue(
      pathValue(thread, ["data", "node"]),
      "review thread",
    );
    const actualNumber = positiveInteger(
      pathValue(node, ["pullRequest", "number"]),
      "review thread pull request number",
    );
    const actualRepository = stringValue(
      pathValue(node, ["pullRequest", "repository", "nameWithOwner"]),
      "review thread repository",
    );
    if (
      node.__typename !== "PullRequestReviewThread" ||
      actualNumber !== target.pull_number ||
      actualRepository.toLowerCase() !==
        `${target.owner}/${target.repo}`.toLowerCase()
    ) {
      throw new Error(
        "review thread does not belong to the approved pull request",
      );
    }
    return;
  }
  const target = assessment.target;
  const repository = `${target.owner}/${target.repo}`;
  const isInline = assessment.operation === "reply-inline";
  const endpoint = isInline
    ? `repos/${repository}/pulls/comments/${assessment.comment_id}`
    : `repos/${repository}/issues/comments/${assessment.comment_id}`;
  const comment = runGitHubRead(executable, [
    "api",
    "--hostname",
    target.host,
    endpoint,
  ]);
  const relation = stringValue(
    comment[isInline ? "pull_request_url" : "issue_url"],
    "discussion target relation",
  );
  const expectedSuffix = isInline
    ? `/repos/${repository}/pulls/${target.pull_number}`
    : `/repos/${repository}/issues/${target.pull_number}`;
  if (!relation.endsWith(expectedSuffix)) {
    throw new Error(
      "discussion reply target does not belong to the approved pull request",
    );
  }
}

function validateLiveBlackAuthorization(
  receipt: ReviewPublicationReceipt,
  executable: string,
): void {
  if (receipt.kind !== "review") return;
  const assessment = receipt.approved_assessment as ReviewPublicationAssessment;
  if (
    assessment.authorization.zone !== "black" ||
    assessment.assessment.substantive_verdict !== "APPROVE" ||
    assessment.authorization.black_zone_receipt === null
  ) {
    return;
  }
  const helper = resolve(
    dirname(modulePath),
    "verify-black-zone-authorization.sh",
  );
  const executableDirectory = dirname(resolve(executable));
  const completed = spawnSync(
    "bash",
    [
      helper,
      assessment.target.host,
      `${assessment.target.owner}/${assessment.target.repo}`,
      String(assessment.target.pull_number),
      assessment.target.head_oid,
      assessment.target.base_oid,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${executableDirectory}:${process.env.PATH ?? ""}`,
      },
    },
  );
  if (completed.status !== 0) {
    throw new Error("black-zone authorization changed before publication");
  }
  const liveReceipt = objectValue(
    JSON.parse(completed.stdout) as unknown,
    "live black-zone authorization",
  );
  if (
    canonicalJson(liveReceipt) !==
    canonicalJson(assessment.authorization.black_zone_receipt)
  ) {
    throw new Error(
      "black-zone authorization receipt changed before publication",
    );
  }
}

function assertSameTarget(
  left: PublicationTarget,
  right: PublicationTarget,
): void {
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new Error("review supplement target differs from its parent review");
  }
}

function classifyProtectedGitHubWrite(words: readonly string[]): string | null {
  const ghIndex = words.findIndex((word) => basename(word) === "gh");
  if (ghIndex === -1) return null;
  const arguments_ = [...words.slice(ghIndex + 1)];
  while (arguments_[0]?.startsWith("-")) {
    const option = arguments_.shift()!;
    if (["-R", "--repo", "--hostname"].includes(option)) {
      if (arguments_.shift() === undefined)
        return "incomplete gh global option on a potential review write";
      continue;
    }
    if (
      /^-R.+/.test(option) ||
      /^--(?:repo|hostname)=.+/.test(option) ||
      ["--help", "--version"].includes(option)
    ) {
      continue;
    }
    return "unsupported gh global option on a potential review write";
  }
  if (
    arguments_[0] === "pr" &&
    ["comment", "review"].includes(arguments_[1] ?? "")
  ) {
    return `raw gh pr ${arguments_[1]} bypasses the approved payload`;
  }
  if (arguments_[0] === "issue" && arguments_[1] === "comment") {
    return "raw gh issue comment can target a pull request";
  }
  if (arguments_[0] !== "api") return null;
  const parsed = parseApiArguments(arguments_.slice(1));
  const endpoint = parsed.endpoint;
  if (parsed.ambiguous) {
    return endpoint === "graphql" ||
      (endpoint !== undefined && PROTECTED_REST_PATTERN.test(endpoint)) ||
      parsed.hasPayload ||
      parsed.method !== "GET"
      ? "ambiguous gh api command cannot be classified safely"
      : null;
  }
  if (endpoint === "graphql" || endpoint?.startsWith("graphql?") === true) {
    return classifyGraphQlWrite(parsed);
  }
  if (endpoint === undefined || !PROTECTED_REST_PATTERN.test(endpoint))
    return null;
  return parsed.method === "GET"
    ? null
    : `raw gh api ${parsed.method} targets a protected PR review/comment endpoint`;
}

interface ParsedApiArguments {
  readonly ambiguous: boolean;
  readonly endpoint: string | undefined;
  readonly hasInput: boolean;
  readonly hasPayload: boolean;
  readonly method: string;
  readonly queryValues: readonly string[];
}

function parseApiArguments(arguments_: readonly string[]): ParsedApiArguments {
  const valueOptions: Readonly<Record<string, string>> = {
    "--cache": "cache",
    "--field": "field",
    "--header": "header",
    "--hostname": "hostname",
    "--input": "input",
    "--jq": "jq",
    "--method": "method",
    "--preview": "preview",
    "--raw-field": "field",
    "--template": "template",
  };
  const shortValueOptions: Readonly<Record<string, string>> = {
    F: "field",
    H: "header",
    X: "method",
    f: "field",
    p: "preview",
    q: "jq",
    t: "template",
  };
  let endpoint: string | undefined;
  let ambiguous = false;
  let hasInput = false;
  let hasPayload = false;
  let afterOptions = false;
  const methods: string[] = [];
  const queryValues: string[] = [];
  const acceptValue = (kind: string, value: string): void => {
    if (kind === "method") methods.push(value.toUpperCase());
    if (kind === "field") {
      hasPayload = true;
      queryValues.push(value);
    }
    if (kind === "input") {
      hasInput = true;
      hasPayload = true;
    }
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--" && !afterOptions) {
      afterOptions = true;
      continue;
    }
    if (!afterOptions && argument.startsWith("--")) {
      const equal = argument.indexOf("=");
      const option = equal === -1 ? argument : argument.slice(0, equal);
      const kind = valueOptions[option];
      if (kind !== undefined) {
        const value =
          equal === -1 ? arguments_[++index] : argument.slice(equal + 1);
        if (value === undefined) ambiguous = true;
        else acceptValue(kind, value);
      } else if (
        ![
          "--allow-escape-sequences",
          "--help",
          "--include",
          "--paginate",
          "--silent",
          "--slurp",
          "--verbose",
        ].includes(option)
      ) {
        ambiguous = true;
      }
      continue;
    }
    if (!afterOptions && argument.startsWith("-") && argument !== "-") {
      const cluster = argument.slice(1);
      for (let position = 0; position < cluster.length; position += 1) {
        const shortOption = cluster[position]!;
        if (shortOption === "i") continue;
        const kind = shortValueOptions[shortOption];
        if (kind === undefined) {
          ambiguous = true;
          break;
        }
        const attached = cluster.slice(position + 1);
        const value =
          attached === ""
            ? arguments_[++index]
            : attached.startsWith("=")
              ? attached.slice(1)
              : attached;
        if (value === undefined) ambiguous = true;
        else acceptValue(kind, value);
        break;
      }
      continue;
    }
    if (endpoint !== undefined) {
      ambiguous = true;
      continue;
    }
    endpoint = argument
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/^\//, "")
      .replace(/^api\/(?:v3\/)?/, "");
  }
  if (methods.length > 1) ambiguous = true;
  return {
    ambiguous,
    endpoint,
    hasInput,
    hasPayload,
    method: methods[0] ?? (hasPayload ? "POST" : "GET"),
    queryValues,
  };
}

function classifyGraphQlWrite(parsed: ParsedApiArguments): string | null {
  if (parsed.hasInput) {
    return "file/stdin GraphQL input is an ambiguous mutable review-write route";
  }
  const query = parsed.queryValues
    .filter((value) => value.startsWith("query="))
    .map((value) => value.slice("query=".length))
    .join("\n");
  if (parsed.queryValues.some((value) => /^query=@/.test(value))) {
    return "file-backed GraphQL query is an ambiguous mutable review-write route";
  }
  if (/\bmutation\b/.test(query) && PROTECTED_GRAPHQL_PATTERN.test(query)) {
    return "raw gh api GraphQL mutation changes PR review/comment state";
  }
  return null;
}

function isCanonicalPublisher(
  words: readonly string[],
  expectedScript: string,
): boolean {
  if (basename(words[0] ?? "") !== "bun") return false;
  const invocation = words.slice(1);
  const scriptIndex = invocation[0] === "run" ? 1 : 0;
  const script = invocation[scriptIndex];
  return (
    script !== undefined &&
    normalize(resolve(script)) === expectedScript &&
    invocation[scriptIndex + 1] === "publish" &&
    invocation[scriptIndex + 2] === "--approval" &&
    typeof invocation[scriptIndex + 3] === "string" &&
    invocation.length === scriptIndex + 4
  );
}

function unwrapCommand(input: readonly string[]): readonly string[] {
  let words = [...input];
  let changed = true;
  while (changed) {
    changed = false;
    if (words[0] === "env") {
      let index = 1;
      while (index < words.length) {
        const word = words[index]!;
        if (word === "--") {
          index += 1;
          break;
        }
        if (
          word === "-u" ||
          word === "--unset" ||
          word === "-C" ||
          word === "--chdir"
        ) {
          if (words[index + 1] === undefined)
            throw new Error("incomplete env wrapper");
          index += 2;
          continue;
        }
        if (
          word === "-S" ||
          word === "--split-string" ||
          word.startsWith("--split-string=")
        ) {
          throw new Error("env split-string wrapper is unsupported");
        }
        if (
          word.includes("=") ||
          word === "-i" ||
          word === "--ignore-environment" ||
          word.startsWith("--unset=") ||
          word.startsWith("--chdir=")
        ) {
          index += 1;
          continue;
        }
        break;
      }
      words = words.slice(index);
      changed = true;
    }
    if (words[0] === "command") {
      if (words[1] === "-v" || words[1] === "-V") return ["command-query"];
      let index = 1;
      while (words[index] === "-p" || words[index] === "--") index += 1;
      words = words.slice(index);
      changed = true;
    }
    if (words[0] === "rtk") {
      words = words[1] === "proxy" ? words.slice(2) : words.slice(1);
      changed = true;
    }
    if (["bash", "sh", "zsh"].includes(words[0] ?? "") && words[1] === "-c") {
      if (words.length !== 3) throw new Error("ambiguous shell wrapper");
      words = [...parseShellWords(words[2]!)];
      changed = true;
    }
  }
  return words;
}

function parseShellWords(command: string): readonly string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of command) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\n" || character === "\r") {
      throw new Error("compound shell command");
    }
    if (/\s/.test(character)) {
      if (current !== "") {
        words.push(current);
        current = "";
      }
      continue;
    }
    if ([";", "|", "&"].includes(character)) {
      throw new Error("compound shell command");
    }
    current += character;
  }
  if (escaped || quote !== null) throw new Error("unterminated shell token");
  if (current !== "") words.push(current);
  return words;
}

function looksLikeReviewWrite(command: string): boolean {
  return (
    /\bgh\b[\s\S]*?\b(?:pr\s+(?:comment|review)|issue\s+comment)\b/.test(
      command,
    ) ||
    (/\bgh\b[\s\S]*?\bapi\b/.test(command) &&
      (PROTECTED_GRAPHQL_PATTERN.test(command) ||
        /repos\/[^\s]+\/(?:issues|pulls)\//.test(command)))
  );
}

function canonicalJson(input: unknown): string {
  if (input === null || typeof input !== "object") {
    const serialized = JSON.stringify(input);
    if (serialized === undefined) {
      throw new Error("undefined is not valid canonical JSON");
    }
    return serialized;
  }
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  const object = input as JsonObject;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

function hashJson(input: unknown): string {
  return hashBytes(Buffer.from(canonicalJson(input), "utf8"));
}

function hashBytes(input: Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function objectValue(input: unknown, description: string): JsonObject {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${description} must be an object`);
  }
  return input as JsonObject;
}

function arrayValue(input: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(input)) throw new Error(`${description} must be an array`);
  return input;
}

function booleanValue(input: unknown, description: string): boolean {
  if (typeof input !== "boolean")
    throw new Error(`${description} must be a boolean`);
  return input;
}

function nonemptyString(input: unknown, description: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error(`${description} must be a nonempty string`);
  }
  return input;
}

function patternString(
  input: unknown,
  pattern: RegExp,
  description: string,
): string {
  const value = nonemptyString(input, description);
  if (!pattern.test(value)) throw new Error(`${description} is invalid`);
  return value;
}

function loginValue(input: unknown, description: string): string {
  return patternString(input, LOGIN_PATTERN, description);
}

function oidValue(input: unknown, description: string): string {
  return patternString(input, OID_PATTERN, description);
}

function sha256Value(input: unknown, description: string): string {
  return patternString(input, SHA256_PATTERN, description);
}

function safeId(input: unknown, description: string): string {
  return patternString(input, SAFE_ID_PATTERN, description);
}

function positiveInteger(input: unknown, description: string): number {
  if (!Number.isSafeInteger(input) || (input as number) <= 0) {
    throw new Error(`${description} must be a positive integer`);
  }
  return input as number;
}

function nonnegativeInteger(input: unknown, description: string): number {
  if (!Number.isSafeInteger(input) || (input as number) < 0) {
    throw new Error(`${description} must be a nonnegative integer`);
  }
  return input as number;
}

function nullablePositiveInteger(
  input: unknown,
  description: string,
): number | null {
  return input === null ? null : positiveInteger(input, description);
}

function nullableString(input: unknown, description: string): string | null {
  return input === null ? null : nonemptyString(input, description);
}

function httpUrl(input: unknown, description: string): string {
  const value = nonemptyString(input, description);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${description} must be an HTTP(S) URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${description} must be an HTTP(S) URL`);
  }
  return value;
}

function stringValue(input: unknown, description: string): string {
  if (typeof input !== "string")
    throw new Error(`${description} must be a string`);
  return input;
}

function enumValue<const Values extends readonly string[]>(
  input: unknown,
  values: Values,
  description: string,
): Values[number] {
  if (typeof input !== "string" || !values.includes(input)) {
    throw new Error(`${description} must be one of ${values.join(", ")}`);
  }
  return input as Values[number];
}

function uniqueArray<Value>(input: readonly Value[]): readonly Value[] {
  if (new Set(input).size !== input.length)
    throw new Error("duplicate values are not allowed");
  return input;
}

function pathValue(input: JsonObject, path: readonly string[]): unknown {
  let current: unknown = input;
  for (const segment of path) current = objectValue(current, segment)[segment];
  return current;
}

function readJsonFile(path: string, description: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`cannot read ${description}: ${(error as Error).message}`);
  }
}

function argumentValue(
  arguments_: readonly string[],
  name: string,
): string | undefined {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function hookEnvelope(decision: ReviewWriteGuardDecision): string {
  const isGrok =
    Boolean(process.env.GROK_PLUGIN_ROOT) && !process.env.PLUGIN_ROOT;
  if (isGrok) {
    return `${JSON.stringify({ decision: decision.decision === "deny" ? "deny" : "allow", reason: decision.reason })}\n`;
  }
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.decision === "deny" ? "deny" : "allow",
      permissionDecisionReason: decision.reason,
    },
  })}\n`;
}

function runGuard(): void {
  const rawInput = readFileSync(0, "utf8");
  let command: string;
  try {
    const envelope = objectValue(JSON.parse(rawInput) as unknown, "hook input");
    const toolInput = objectValue(
      envelope.tool_input ?? envelope.toolInput,
      "hook tool input",
    );
    const candidate = toolInput.command ?? toolInput.cmd;
    if (typeof candidate !== "string")
      throw new Error("shell command is missing");
    command = candidate;
  } catch (error) {
    process.stdout.write(
      hookEnvelope({
        decision: "deny",
        reason: `Review publication validation is unavailable: ${(error as Error).message}`,
      }),
    );
    return;
  }
  const pluginRoot =
    process.env.PLUGIN_ROOT ??
    process.env.GROK_PLUGIN_ROOT ??
    process.env.CLAUDE_PLUGIN_ROOT ??
    defaultPluginRoot;
  const decision = classifyReviewPublicationCommand(command, pluginRoot);
  if (decision.decision !== "ignore")
    process.stdout.write(hookEnvelope(decision));
}

function printUsage(): never {
  process.stderr.write(
    [
      "usage:",
      "  review-publication.ts approve --assessment FILE [--parent-approval FILE]",
      "  review-publication.ts validate --approval FILE",
      "  review-publication.ts publish --approval FILE [--dry-run]",
      "  review-publication.ts guard",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

function main(arguments_: readonly string[]): void {
  const [action, ...options] = arguments_;
  if (action === "guard") {
    if (options.length > 0) printUsage();
    runGuard();
    return;
  }
  const approvalPath = argumentValue(options, "--approval");
  if (action === "approve") {
    const assessmentPath = argumentValue(options, "--assessment");
    if (assessmentPath === undefined) printUsage();
    const parentPath = argumentValue(options, "--parent-approval");
    const receipt = createReviewPublicationReceipt(
      readJsonFile(assessmentPath, "review assessment"),
      parentPath === undefined
        ? undefined
        : readJsonFile(parentPath, "parent review approval"),
    );
    process.stdout.write(`${canonicalJson(receipt)}\n`);
    return;
  }
  if (
    (action === "publish" || action === "validate") &&
    approvalPath !== undefined
  ) {
    const receipt = validateReviewPublicationReceipt(
      readJsonFile(approvalPath, "review publication approval"),
    );
    if (action === "validate") {
      process.stdout.write(
        `${JSON.stringify({ valid: true, payload_sha256: receipt.payload_sha256 })}\n`,
      );
      return;
    }
    const output = publishReviewPublication(receipt, {
      dryRun: options.includes("--dry-run"),
    });
    process.stdout.write(output);
    return;
  }
  printUsage();
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
