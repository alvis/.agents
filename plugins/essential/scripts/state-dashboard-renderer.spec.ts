import { describe, expect, it } from "vitest";

import { renderStateDashboardHtml } from "./state-dashboard-renderer.ts";

const locator = { uri: "docs/state.md", revision: "abc123" };
const evidence = {
  ref: "state:agents:work:dashboard:evidence:test",
  summary: "Tests <passed>",
  locator,
  inputs: [{ uri: "javascript:alert(1)" }],
  observedAt: "2026-08-30T12:00:00Z",
};

const stream = {
  ref: "state:agents:work:dashboard",
  projectRef: "state:agents",
  workId: "dashboard",
  phase: "reviewing",
  blockedOn: 'Review "gate"',
  charterStatus: "approved",
  charterRevision: 2,
  planRevision: 3,
  stateRevision: 7,
  writtenUnder: "abc123",
  repositoryRevision: "def456",
  syncState: "Synced",
  reviewState: "Open findings",
  updatedAt: "2026-08-30T12:00:00Z",
  charter: {
    ref: "state:agents:work:dashboard:charter",
    revision: 2,
    goal: "Render everything",
    requirements: [
      { ref: "state:agents:work:dashboard:statement:req", text: "Accessible" },
    ],
    boundary: {
      ref: "state:agents:work:dashboard:boundary",
      in: [
        { ref: "state:agents:work:dashboard:statement:in", text: "Dashboard" },
      ],
      out: [],
    },
    successCriteria: [
      {
        ref: "state:agents:work:dashboard:sc:1",
        id: "SC-1",
        text: "Complete",
        expectedEvidence: "Snapshot",
      },
    ],
    specification: { state: "linked", entries: [locator] },
    anchors: [],
  },
  tasks: [
    {
      ref: "state:agents:work:dashboard:task:REN",
      id: "REN",
      summary: "Rich renderer",
      targets: ["scripts"],
      dependsOn: ["state:agents:work:dashboard:task:ARC"],
      required: true,
      acceptanceRefs: ["state:agents:work:dashboard:sc:1"],
      status: "done",
      owner: "Finn",
      attempt: { outcome: "pass", at: "2026-08-30T12:00:00Z" },
      evidence: [evidence],
      validity: { state: "stale", reason: "Source changed" },
    },
  ],
  continuation: {
    ref: "state:agents:work:dashboard:continuation",
    focus: "Verification",
    handback: "Run suite",
    nextAction: "Review",
    taskRefs: ["state:agents:work:dashboard:task:REN"],
    fastPaths: [locator],
  },
  events: [
    {
      ref: "state:agents:work:dashboard:event:7-1",
      timestamp: "2026-08-30T12:00:00Z",
      actor: "agent",
      capabilityId: "coding:write-code",
      eventType: "status",
      stateRevision: 7,
      subjectRef: "state:agents:work:dashboard:task:REN",
      summary: "Renderer completed",
      evidenceRefs: [evidence.ref],
      invalidates: [],
    },
  ],
  revisions: [
    {
      ref: "state:agents:work:dashboard:revision:plan-3",
      kind: "plan",
      number: 3,
      timestamp: "2026-08-30T11:00:00Z",
      what: "Add detail",
      why: "Parity",
      approver: "user",
    },
  ],
  questions: [
    {
      ref: "state:agents:work:dashboard:question:viewer",
      text: "Open viewer?",
      owner: "PM",
      waitingSince: "2026-08-30T10:00:00Z",
      awaitingUser: true,
    },
  ],
  records: [
    {
      ref: "state:agents:work:dashboard:record:decision:mdc",
      kind: "decision",
      status: "accepted",
      headline: "Use MDC",
      owner: "user",
      createdAt: "2026-08-30T09:00:00Z",
      locator,
      targetRef: "state:agents:work:dashboard",
      provenance: [locator],
      supersedes: [],
      affects: [],
      invalidates: [],
      preserves: [],
      relationshipStatements: [
        {
          ref: "state:agents:work:dashboard:record:decision:mdc:statement:affects-dashboard",
          text: "Dashboard behavior",
          relation: "affects",
        },
      ],
    },
  ],
  review: {
    ref: "state:agents:work:dashboard:review",
    areas: [
      {
        ref: "state:agents:work:dashboard:review-area:quality",
        area: "quality",
        reviewedAt: "2026-08-30T12:00:00Z",
        reviewedRevision: 7,
        reviewedTaskRefs: ["state:agents:work:dashboard:task:REN"],
        taskDefinitionHash: "a".repeat(64),
        validity: { state: "stale", reason: "Changed" },
        findings: [
          {
            ref: "state:agents:work:dashboard:finding:quality:escape",
            status: "deferred",
            severity: "high",
            summary: "Escape URLs",
            evidence: [evidence],
            rationale: "Needs policy",
            owner: "Finn",
            recheckCondition: "After renderer",
            riskAcceptance: locator,
          },
        ],
      },
    ],
  },
  submission: {
    ref: "state:agents:work:dashboard:submission",
    kind: "coding",
    pullRequests: [
      {
        ref: "state:agents:work:dashboard:pull-request:1",
        number: 1,
        url: "https://example.com/pr/1",
        repository: "agents",
        headRevision: "abc123",
        status: "open",
      },
    ],
    deliverables: [],
  },
  completion: {
    ref: "state:agents:work:dashboard:completion",
    completedAt: "2026-08-30T13:00:00Z",
    landing: [evidence],
    promotion: {
      ref: "state:agents:work:dashboard:promotion",
      mode: "paths",
      paths: [locator],
    },
    outlives: [
      {
        ref: "state:agents:work:dashboard:outlives:docs",
        summary: "Docs",
        owner: "PM",
        carrier: locator,
      },
    ],
    decisionDispositions: [
      {
        ref: "state:agents:work:dashboard:decision-disposition:mdc",
        decisionRef: "state:agents:work:dashboard:record:decision:mdc",
        kind: "work-receipt",
        carrier: locator,
      },
    ],
  },
  location: locator,
  documentations: [
    {
      ref: "state:agents:work:dashboard:documentation:state",
      title: "State guide",
      locator,
      capabilityRef: "essential:discover",
    },
  ],
};

const document = {
  schemaVersion: 1 as const,
  kind: "project" as const,
  project: {
    ref: "state:agents",
    slug: "agents",
    title: "Agents <script>alert(1)</script>",
    goal: "Typed state",
    requirements: [],
    specification: { state: "linked", entries: [locator] },
    updatedAt: "2026-08-30T12:00:00Z",
  },
  streams: [stream],
  environment: [
    {
      ref: "state:agents:environment:bun",
      statement: "Bun available",
      observedAt: "2026-08-30T12:00:00Z",
      evidence: [evidence],
    },
  ],
  traps: [
    {
      ref: "state:agents:trap:cache",
      symptom: "Stale cache",
      cause: "Runner",
      action: "Remove cache",
      verifiedAt: "2026-08-30T12:00:00Z",
      evidence: [evidence],
    },
  ],
};

describe("state dashboard renderer", () => {
  it("renders the full normalized state model with accessible landmarks", () => {
    const html = renderStateDashboardHtml(document);
    for (const text of [
      "Rich renderer",
      "Source changed",
      "quality",
      "Escape URLs",
      "Use MDC",
      "Dashboard behavior",
      "Open viewer?",
      "Renderer completed",
      "Pull request #1",
      "State guide",
      "Bun available",
      "Stale cache",
      "Tests &lt;passed&gt;",
      "Acceptance: state:agents:work:dashboard:sc:1",
      "Attempt: pass",
    ])
      expect(html).toContain(text);
    expect(html).toMatch(/<main[^>]*id="main-content"/);
    expect(html).toContain('<nav aria-label="Dashboard sections">');
    expect(html).toContain('<table aria-label="Tasks">');
    expect(html).toContain('<time datetime="2026-08-30T12:00:00Z">');
  });

  it("escapes state content and refuses unsafe locator schemes", () => {
    const html = renderStateDashboardHtml(document);
    expect(html).toContain("Agents &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain("javascript:alert(1)");
    expect(html).toContain('href="https://example.com/pr/1"');

    const protocolRelative = structuredClone(document);
    protocolRelative.streams[0].location = { uri: "//evil.example/state" };
    const unsafeHtml = renderStateDashboardHtml(protocolRelative);
    expect(unsafeHtml).not.toContain('href="//evil.example/state"');
    expect(unsafeHtml).toContain("//evil.example/state");
  });

  it("is deterministic for semantically equivalent normalized objects", () => {
    const reordered = JSON.parse(JSON.stringify(document)) as typeof document;
    reordered.streams[0] = { ...reordered.streams[0] };
    expect(renderStateDashboardHtml(reordered)).toBe(
      renderStateDashboardHtml(document),
    );
  });

  it("renders a stream root without inventing project knowledge", () => {
    const html = renderStateDashboardHtml({
      schemaVersion: 1,
      kind: "stream",
      projectRef: "state:agents",
      stream,
      environment: [],
      traps: [],
    });
    expect(html).toContain("Stream dashboard");
    expect(html).toContain("Rich renderer");
    expect(html).not.toContain("Project knowledge");
  });
});
