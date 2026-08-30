import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  decodeStateDashboard,
  StateValidationFailure,
  taskDefinitionHash,
} from "./state-codec.ts";
import { renderStateDashboardHtml } from "./state-dashboard-renderer.ts";

import type { StateDashboardDocumentV1 } from "./state-codec.ts";

const roots: string[] = [];

async function temporaryStateRoot(): Promise<string> {
  const base = join(
    tmpdir(),
    `essential-state-dashboard-${crypto.randomUUID()}`,
  );
  const root = join(base, ".state");
  await mkdir(root, { recursive: true });
  roots.push(base);
  return root;
}

const project = {
  schemaVersion: 1,
  kind: "project",
  project: {
    ref: "state:agents",
    slug: "agents",
    title: "Agents <script>alert(1)</script>",
    goal: "Keep operational state typed.",
    requirements: [],
    specification: { state: "none", entries: [] },
    updatedAt: "2026-08-30T12:00:00Z",
  },
  streams: [],
  environment: [],
  traps: [],
} as const;

type ProjectStreamPhase = "planned" | "working" | "reviewing";

function projectStream(workId: string, phase: ProjectStreamPhase) {
  const ref = `state:agents:work:${workId}`;
  return {
    ref,
    projectRef: "state:agents",
    workId,
    phase,
    charterStatus: "absent",
    charterRevision: 1,
    planRevision: 1,
    stateRevision: 1,
    writtenUnder: "abc123",
    syncState: "Not started",
    reviewState: "Not started",
    updatedAt: "2026-08-30T12:00:00Z",
    tasks:
      phase === "working"
        ? [
            {
              ref: `${ref}:task:RUN`,
              id: "RUN",
              summary: "Run the stream",
              targets: [],
              dependsOn: [],
              required: true,
              acceptanceRefs: [],
              status: "working",
              owner: "operator",
              evidence: [],
            },
          ]
        : [],
    events: [],
    revisions: [],
    questions: [],
    records: [],
    ...(phase === "reviewing"
      ? {
          submission: {
            ref: `${ref}:submission`,
            kind: "coding",
            pullRequests: [
              {
                ref: `${ref}:pr:1`,
                number: 1,
                url: "https://example.test/pull/1",
                repository: "agents",
                headRevision: "abc123",
                status: "open",
              },
            ],
            deliverables: [],
          },
        }
      : {}),
    documentations: [],
  };
}

async function writeEquivalentProjectRoots(phases: ProjectStreamPhase[]) {
  const root = await temporaryStateRoot();
  const streams = phases.map((phase, index) =>
    projectStream(`stream-${index + 1}`, phase),
  );
  const jsonPath = join(root, "overview.json");
  const mdcPath = join(root, "overview.mdc");
  await writeFile(jsonPath, JSON.stringify({ ...project, streams }), "utf8");
  await writeFile(
    mdcPath,
    `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: 'Keep operational state typed.', requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents <script>alert(1)</script>\n${streams
      .map(
        (stream) =>
          `{{ type: state.source, ref: 'state:agents:source:${stream.workId}', href: works/${stream.workId}/state.mdc, documentKind: stream }}\n- works/${stream.workId}/state.mdc`,
      )
      .join("\n")}\n`,
    "utf8",
  );
  for (const stream of streams) {
    const workDirectory = join(root, "works", stream.workId);
    await mkdir(workDirectory, { recursive: true });
    await writeFile(
      join(workDirectory, "state.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: ${stream.ref}\nworkId: ${stream.workId}\n---\n{{ type: state.stream, ref: '${stream.ref}', projectRef: 'state:agents', phase: ${stream.phase}, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc123, syncState: 'Not started', reviewState: 'Not started', updatedAt: '2026-08-30T12:00:00Z', tasks: ${JSON.stringify(stream.tasks)}, events: [], revisions: [], questions: [], records: [], ${stream.submission === undefined ? "" : `submission: ${JSON.stringify(stream.submission)}, `}documentations: [] }}\n- ${stream.workId}\n`,
      "utf8",
    );
  }
  return { jsonPath, mdcPath };
}

async function writeProjectStreamSource(href: string, workId: string) {
  const root = await temporaryStateRoot();
  const input = join(root, "overview.mdc");
  const streamPath = join(root, href);
  const stream = projectStream(workId, "planned");
  await mkdir(dirname(streamPath), { recursive: true });
  await writeFile(
    input,
    `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: 'Keep operational state typed.', requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:${workId}', href: ${href}, documentKind: stream }}\n- ${href}\n`,
    "utf8",
  );
  await writeFile(
    streamPath,
    `---\nschema: essential.state/v1\nkind: stream\nref: ${stream.ref}\nworkId: ${workId}\n---\n{{ type: state.stream, ref: '${stream.ref}', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc123, syncState: 'Not started', reviewState: 'Not started', updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- ${workId}\n`,
    "utf8",
  );
  return input;
}

function streamDocument(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: "stream",
    projectRef: "state:agents",
    environment: [],
    traps: [],
    stream: {
      ref: "state:agents:work:dashboard",
      projectRef: "state:agents",
      workId: "dashboard",
      phase: "planned",
      charterStatus: "approved",
      charterRevision: 1,
      planRevision: 1,
      stateRevision: 1,
      writtenUnder: "abc123",
      syncState: "Not started",
      reviewState: "Not started",
      updatedAt: "2026-08-30T12:00:00Z",
      charter: {
        ref: "state:agents:work:dashboard:charter",
        revision: 1,
        goal: "Render state",
        requirements: [],
        boundary: {
          ref: "state:agents:work:dashboard:boundary",
          in: [],
          out: [],
        },
        successCriteria: [],
        specification: { state: "none", entries: [] },
        anchors: [],
      },
      tasks: [],
      events: [],
      revisions: [],
      questions: [],
      records: [],
      documentations: [],
      ...overrides,
    },
  };
}

const canonicalReviewAreas = [
  "alignment",
  "correctness",
  "security",
  "quality",
  "testing",
  "docs",
  "style",
].map((area) => ({
  ref: `state:agents:work:dashboard:review-area:${area}`,
  area,
  reviewedAt: "2026-08-30T12:00:00Z",
  reviewedRevision: 1,
  reviewedTaskRefs: ["state:agents:work:dashboard:task:REN"],
  taskDefinitionHash: "",
  findings: [],
}));

const reviewedTask = {
  ref: "state:agents:work:dashboard:task:REN",
  id: "REN",
  summary: "Render",
  targets: [],
  dependsOn: [],
  required: true,
  acceptanceRefs: [],
  status: "planned",
  evidence: [],
};
for (const area of canonicalReviewAreas)
  area.taskDefinitionHash = taskDefinitionHash([reviewedTask]);

async function writeJsonFixture(value: unknown): Promise<string> {
  const root = await temporaryStateRoot();
  const path = join(root, "state.json");
  await writeFile(path, JSON.stringify(value), "utf8");
  return path;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("state dashboard codec", () => {
  it("hashes only deterministic task definitions", () => {
    const reordered = {
      ...reviewedTask,
      targets: [...reviewedTask.targets].reverse(),
      status: "done",
      evidence: [{ ref: "runtime" }],
    };
    expect(taskDefinitionHash([reordered])).toBe(
      taskDefinitionHash([{ ...reviewedTask, owner: "pm", status: "working" }]),
    );
    expect(taskDefinitionHash([{ ...reviewedTask, unblock: "Wait" }])).toBe(
      taskDefinitionHash([{ ...reviewedTask, unblock: "Retry" }]),
    );
    expect(taskDefinitionHash([{ ...reviewedTask, required: false }])).not.toBe(
      taskDefinitionHash([reviewedTask]),
    );
    expect(
      taskDefinitionHash([{ ...reviewedTask, summary: "Changed" }]),
    ).not.toBe(taskDefinitionHash([reviewedTask]));
  });

  it("allows a reviewed base revision but rejects a future revision", async () => {
    const current = await writeJsonFixture(
      streamDocument({
        stateRevision: 2,
        tasks: [reviewedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas,
        },
      }),
    );
    await expect(decodeStateDashboard(current)).resolves.toMatchObject({
      kind: "stream",
    });

    const future = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas.map((area) => ({
            ...area,
            reviewedRevision: 2,
          })),
        },
      }),
    );
    const failure = await decodeStateDashboard(future).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("review-area.future-revision");
  });

  it("rejects review evidence invalidated after its reviewed revision", async () => {
    const taskRef = "state:agents:work:dashboard:task:REN";
    const input = await writeJsonFixture(
      streamDocument({
        stateRevision: 2,
        tasks: [reviewedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas,
        },
        events: [
          {
            ref: "state:agents:work:dashboard:event:2-1",
            timestamp: "2026-08-30T12:01:00Z",
            actor: "agent",
            capabilityId: "coding:review-code",
            eventType: "status",
            stateRevision: 2,
            subjectRef: taskRef,
            summary: "Task definition changed after review.",
            evidenceRefs: [],
            invalidates: [taskRef],
          },
        ],
      }),
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("review-area.invalidated");

    const staleInput = await writeJsonFixture(
      streamDocument({
        stateRevision: 2,
        tasks: [reviewedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas.map((area) => ({
            ...area,
            validity: { state: "stale", reason: "Invalidated by event 2-1." },
          })),
        },
        events: [
          {
            ref: "state:agents:work:dashboard:event:2-1",
            timestamp: "2026-08-30T12:01:00Z",
            actor: "agent",
            capabilityId: "coding:review-code",
            eventType: "status",
            stateRevision: 2,
            subjectRef: taskRef,
            summary: "Task definition changed after review.",
            evidenceRefs: [],
            invalidates: [taskRef],
          },
        ],
      }),
    );
    await expect(decodeStateDashboard(staleInput)).resolves.toMatchObject({
      kind: "stream",
    });
  });

  it("loads stale review evidence and accepts a refreshed current hash", async () => {
    const changedTask = { ...reviewedTask, summary: "Changed after review" };
    const unmarked = await writeJsonFixture(
      streamDocument({
        tasks: [changedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas,
        },
      }),
    );
    await expect(decodeStateDashboard(unmarked)).rejects.toBeInstanceOf(
      StateValidationFailure,
    );
    const stale = await writeJsonFixture(
      streamDocument({
        tasks: [changedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas.map((area) => ({
            ...area,
            validity: {
              state: "stale",
              reason: "Task definition changed after review.",
            },
          })),
        },
      }),
    );
    const staleDocument = await decodeStateDashboard(stale);
    const staleAreas = (
      staleDocument.stream as { review: { areas: { validity: unknown }[] } }
    ).review.areas;
    expect(staleAreas).toHaveLength(canonicalReviewAreas.length);
    expect(
      staleAreas.every(
        (area) => typeof area.validity === "object" && area.validity !== null,
      ),
    ).toBe(true);

    const refreshed = await writeJsonFixture(
      streamDocument({
        tasks: [changedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: canonicalReviewAreas.map((area) => ({
            ...area,
            taskDefinitionHash: taskDefinitionHash([changedTask]),
          })),
        },
      }),
    );
    await expect(decodeStateDashboard(refreshed)).resolves.toMatchObject({
      kind: "stream",
    });
  });
  it("normalizes equivalent JSON and MDC project roots", async () => {
    const root = await temporaryStateRoot();
    const jsonPath = join(root, "overview.json");
    const mdcPath = join(root, "overview.mdc");
    await writeFile(jsonPath, JSON.stringify(project), "utf8");
    await writeFile(
      mdcPath,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: 'Keep operational state typed.', requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents <script>alert(1)</script>\n`,
      "utf8",
    );

    await expect(decodeStateDashboard(jsonPath)).resolves.toEqual(
      await decodeStateDashboard(mdcPath),
    );
  });

  it.each([
    ["zero", ["planned", "planned"]],
    ["one", ["reviewing", "planned"]],
  ] as const)(
    "accepts equivalent JSON and MDC project roots with %s active streams",
    async (_count, phases) => {
      const { jsonPath, mdcPath } = await writeEquivalentProjectRoots([
        ...phases,
      ]);
      await expect(decodeStateDashboard(mdcPath)).resolves.toEqual(
        await decodeStateDashboard(jsonPath),
      );
    },
  );

  it("rejects multiple active streams equivalently for JSON and MDC project roots", async () => {
    const { jsonPath, mdcPath } = await writeEquivalentProjectRoots([
      "working",
      "reviewing",
    ]);
    const codes = async (path: string) => {
      const failure = await decodeStateDashboard(path).catch(
        (error: unknown) => error,
      );
      return failure instanceof StateValidationFailure
        ? failure.errors.map(({ code }) => code)
        : [];
    };
    const jsonCodes = await codes(jsonPath);
    const mdcCodes = await codes(mdcPath);
    expect(jsonCodes).toContain("project.active-stream");
    expect(mdcCodes).toEqual(jsonCodes);
  });

  it.each(["rogue/state.mdc", "works/dashboard/nested.mdc"])(
    "rejects a project stream source outside a canonical stream root: %s",
    async (href) => {
      const input = await writeProjectStreamSource(href, "dashboard");
      const failure = await decodeStateDashboard(input).catch(
        (error: unknown) => error,
      );
      expect(
        (failure as StateValidationFailure).errors.map(({ code }) => code),
      ).toContain("graph.stream-root");
    },
  );

  it("rejects a canonical project stream path whose workId does not match", async () => {
    const input = await writeProjectStreamSource(
      "archive/dashboard/state.mdc",
      "foreign",
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("graph.stream-work-id");
  });

  it("normalizes equivalent linked MDC and JSON stream roots", async () => {
    const root = await temporaryStateRoot();
    const stream = {
      ref: "state:agents:work:dashboard",
      projectRef: "state:agents",
      workId: "dashboard",
      phase: "planned",
      charterStatus: "approved",
      charterRevision: 1,
      planRevision: 1,
      stateRevision: 1,
      writtenUnder: "abc123",
      syncState: "Not started",
      reviewState: "Not started",
      updatedAt: "2026-08-30T12:00:00Z",
      charter: {
        ref: "state:agents:work:dashboard:charter",
        revision: 1,
        goal: "Render state",
        requirements: [],
        boundary: {
          ref: "state:agents:work:dashboard:boundary",
          in: [],
          out: [],
        },
        successCriteria: [],
        specification: { state: "none", entries: [] },
        anchors: [],
      },
      tasks: [],
      events: [],
      revisions: [],
      questions: [],
      records: [],
      documentations: [],
    };
    const normalized = {
      schemaVersion: 1,
      kind: "stream",
      projectRef: "state:agents",
      stream,
      environment: [],
      traps: [],
    };
    const jsonPath = join(root, "state.json");
    const mdcPath = join(root, "works", "dashboard", "state.mdc");
    await mkdir(join(root, "works", "dashboard"), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(normalized), "utf8");
    await writeFile(
      mdcPath,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: approved, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc123, syncState: 'Not started', reviewState: 'Not started', updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- dashboard\n{{ type: state.source, ref: 'state:agents:work:dashboard:source:charter', href: goal.mdc, documentKind: charter }}\n- goal.mdc\n`,
      "utf8",
    );
    await writeFile(
      join(root, "works", "dashboard", "goal.mdc"),
      `---\nschema: essential.state/v1\nkind: charter\nref: state:agents:work:dashboard:document:charter\nworkRef: state:agents:work:dashboard\n---\n{{ type: state.charter, ref: 'state:agents:work:dashboard:charter', revision: 1, requirements: [], boundary: { ref: 'state:agents:work:dashboard:boundary', in: [], out: [] }, successCriteria: [], specification: { state: none, entries: [] }, anchors: [] }}\n- Render state\n`,
      "utf8",
    );
    await expect(decodeStateDashboard(mdcPath)).resolves.toEqual(
      await decodeStateDashboard(jsonPath),
    );
  });

  it("preserves nested documentation entities while attaching stream children", async () => {
    const root = await temporaryStateRoot();
    const workDirectory = join(root, "works", "dashboard");
    const input = join(workDirectory, "state.mdc");
    await mkdir(workDirectory, { recursive: true });
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- dashboard\n  {{ type: state.documentation, ref: 'state:agents:work:dashboard:documentation:state-contract', locator: { uri: plugins/essential/references/state.md, revision: abc123 } }}\n  - State contract\n`,
      "utf8",
    );

    await expect(decodeStateDashboard(input)).resolves.toMatchObject({
      stream: {
        documentations: [
          {
            ref: "state:agents:work:dashboard:documentation:state-contract",
            title: "State contract",
            locator: {
              uri: "plugins/essential/references/state.md",
              revision: "abc123",
            },
          },
        ],
      },
    });
  });

  it("normalizes free-form record relationships into stable typed statements", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "state.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- dashboard\n  {{ type: state.task, ref: 'state:agents:work:dashboard:task:REN', id: REN, targets: [], dependsOn: [], required: true, acceptanceRefs: [], status: planned, evidence: [] }}\n  - Render dashboard\n  {{ type: state.record, ref: 'state:agents:work:dashboard:record:proposal:legacy', kind: proposal, status: open, owner: user, createdAt: '2026-08-30T12:00:00Z', locator: { uri: artifacts/legacy.md, revision: abc }, targetRef: 'state:agents:work:dashboard', provenance: [], supersedes: [], affects: ['state:agents:work:dashboard:task:REN', 'Legacy dashboard prose'], invalidates: [], preserves: [] }}\n  - Preserve relationships\n    {{ type: state.statement, ref: 'state:agents:work:dashboard:record:proposal:legacy:statement:preserves-manual', relation: preserves }}\n    - Manual preservation note\n`,
      "utf8",
    );

    const decoded = await decodeStateDashboard(input);
    expect(decoded.kind).toBe("stream");
    if (decoded.kind !== "stream") return;
    expect(decoded.stream.records[0]).toMatchObject({
      affects: ["state:agents:work:dashboard:task:REN"],
      relationshipStatements: expect.arrayContaining([
        expect.objectContaining({
          relation: "affects",
          text: "Legacy dashboard prose",
        }),
        expect.objectContaining({
          relation: "preserves",
          text: "Manual preservation note",
        }),
      ]),
    });

    const normalizedJson = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        records: [
          {
            ref: "state:agents:work:dashboard:record:proposal:legacy",
            kind: "proposal",
            headline: "Preserve relationships",
            status: "open",
            owner: "user",
            createdAt: "2026-08-30T12:00:00Z",
            locator: { uri: "artifacts/legacy.md", revision: "abc" },
            targetRef: "state:agents:work:dashboard",
            provenance: [],
            supersedes: [],
            affects: ["state:agents:work:dashboard:task:REN"],
            invalidates: [],
            preserves: [],
            relationshipStatements: [
              {
                ref: "state:agents:work:dashboard:record:proposal:legacy:statement:affects-1",
                text: "Legacy dashboard prose",
                relation: "affects",
              },
              {
                ref: "state:agents:work:dashboard:record:proposal:legacy:statement:preserves-manual",
                text: "Manual preservation note",
                relation: "preserves",
              },
            ],
          },
        ],
      }),
    );
    const jsonDecoded = await decodeStateDashboard(normalizedJson);
    expect(jsonDecoded.kind).toBe("stream");
    if (jsonDecoded.kind !== "stream") return;
    expect(
      jsonDecoded.stream.records[0]?.relationshipStatements.map(
        ({ relation, text }) => ({ relation, text }),
      ),
    ).toEqual(
      decoded.stream.records[0]?.relationshipStatements.map(
        ({ relation, text }) => ({ relation, text }),
      ),
    );
  });

  it("rejects duplicate nested and annotated stream children", async () => {
    const root = await temporaryStateRoot();
    const workDirectory = join(root, "works", "dashboard");
    const input = join(workDirectory, "state.mdc");
    const ref = "state:agents:work:dashboard:documentation:state-contract";
    await mkdir(workDirectory, { recursive: true });
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [{ ref: '${ref}', title: 'State contract', locator: { uri: plugins/essential/references/state.md, revision: abc123 } }] }}\n- dashboard\n  {{ type: state.documentation, ref: '${ref}', locator: { uri: plugins/essential/references/state.md, revision: abc123 } }}\n  - State contract\n`,
      "utf8",
    );

    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("ref.duplicate");
  });

  it("rejects a relationship that resolves to the wrong entity type", async () => {
    const taskRef = "state:agents:work:dashboard:task:REN";
    const input = await writeJsonFixture(
      streamDocument({
        tasks: [
          {
            ref: taskRef,
            id: "REN",
            summary: "Render",
            targets: [],
            dependsOn: [],
            required: true,
            acceptanceRefs: [taskRef],
            status: "planned",
            evidence: [],
          },
        ],
      }),
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("ref.type");
  });

  it("accepts namespaced review-area finding refs", async () => {
    const input = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: {
          ref: "state:agents:work:dashboard:review",
          areas: [
            ...canonicalReviewAreas,
            {
              ref: "state:agents:work:dashboard:review-area:web:visual",
              area: "web:visual",
              reviewedAt: "2026-08-30T12:00:00Z",
              reviewedRevision: 1,
              reviewedTaskRefs: ["state:agents:work:dashboard:task:REN"],
              taskDefinitionHash: taskDefinitionHash([reviewedTask]),
              findings: [
                {
                  ref: "state:agents:work:dashboard:finding:web:visual:contrast",
                  summary: "Contrast",
                  status: "open",
                  evidence: [],
                },
              ],
            },
          ],
        },
      }),
    );
    await expect(decodeStateDashboard(input)).resolves.toMatchObject({
      kind: "stream",
    });
  });

  it("rejects review-area names that violate the public schema grammar", async () => {
    for (const area of [
      "Web:visual",
      "web:visual:contrast",
      "web:",
      ":visual",
    ]) {
      const input = await writeJsonFixture(
        streamDocument({
          tasks: [reviewedTask],
          review: {
            ref: "state:agents:work:dashboard:review",
            areas: [
              ...canonicalReviewAreas,
              {
                ref: "state:agents:work:dashboard:review-area:web:visual",
                area,
                reviewedAt: "2026-08-30T12:00:00Z",
                reviewedRevision: 1,
                reviewedTaskRefs: ["state:agents:work:dashboard:task:REN"],
                taskDefinitionHash: taskDefinitionHash([reviewedTask]),
                findings: [],
              },
            ],
          },
        }),
      );
      await expect(decodeStateDashboard(input)).rejects.toBeInstanceOf(
        StateValidationFailure,
      );
    }
  });

  it("rejects malformed and cross-area finding refs", async () => {
    for (const ref of [
      "state:agents:work:dashboard:finding:web:visual:Bad",
      "state:agents:work:dashboard:finding:web:semantic:contrast",
      "state:agents:work:dashboard:finding:web::contrast",
    ]) {
      const input = await writeJsonFixture(
        streamDocument({
          tasks: [reviewedTask],
          review: {
            ref: "state:agents:work:dashboard:review",
            areas: [
              ...canonicalReviewAreas,
              {
                ref: "state:agents:work:dashboard:review-area:web:visual",
                area: "web:visual",
                reviewedAt: "2026-08-30T12:00:00Z",
                reviewedRevision: 1,
                reviewedTaskRefs: ["state:agents:work:dashboard:task:REN"],
                taskDefinitionHash: taskDefinitionHash([reviewedTask]),
                findings: [
                  { ref, summary: "Contrast", status: "open", evidence: [] },
                ],
              },
            ],
          },
        }),
      );
      await expect(decodeStateDashboard(input)).rejects.toBeInstanceOf(
        StateValidationFailure,
      );
    }
  });

  it("requires complete skipped dispositions and durable high-risk acceptance", async () => {
    const findingRef =
      "state:agents:work:dashboard:finding:correctness:accepted-risk";
    const reviewWithFinding = (finding: Record<string, unknown>) => ({
      ref: "state:agents:work:dashboard:review",
      areas: canonicalReviewAreas.map((area) =>
        area.area === "correctness"
          ? { ...area, findings: [{ ref: findingRef, ...finding }] }
          : area,
      ),
    });
    const skipped = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: reviewWithFinding({
          summary: "Accepted risk",
          status: "skipped",
          severity: "medium",
          evidence: [],
        }),
      }),
    );
    const skippedFailure = await decodeStateDashboard(skipped).catch(
      (error: unknown) => error,
    );
    expect(
      (skippedFailure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("finding.disposition");

    const high = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: reviewWithFinding({
          summary: "Accepted risk",
          status: "acknowledged",
          severity: "high",
          evidence: [],
          owner: "operator",
          rationale: "The operator accepts the bounded impact.",
          recheckCondition: "Recheck before the next release.",
        }),
      }),
    );
    const highFailure = await decodeStateDashboard(high).catch(
      (error: unknown) => error,
    );
    expect(
      (highFailure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("finding.risk-acceptance");

    const unbound = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: reviewWithFinding({
          summary: "Accepted risk",
          status: "skipped",
          severity: "critical",
          evidence: [],
          owner: "operator",
          rationale: "The operator accepts the bounded impact.",
          recheckCondition: "Recheck before the next release.",
          riskAcceptance: { uri: "docs/decisions/accepted-risk.md" },
        }),
      }),
    );
    const unboundFailure = await decodeStateDashboard(unbound).catch(
      (error: unknown) => error,
    );
    expect(
      (unboundFailure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("finding.risk-acceptance");

    const accepted = await writeJsonFixture(
      streamDocument({
        tasks: [reviewedTask],
        review: reviewWithFinding({
          summary: "Accepted risk",
          status: "skipped",
          severity: "critical",
          evidence: [],
          owner: "operator",
          rationale: "The operator accepts the bounded impact.",
          recheckCondition: "Recheck before the next release.",
          riskAcceptance: {
            uri: "docs/decisions/accepted-risk.md",
            revision: "abc123",
          },
        }),
      }),
    );
    await expect(decodeStateDashboard(accepted)).resolves.toMatchObject({
      kind: "stream",
    });
  });

  it.each(["charter", "review", "submission", "completion"])(
    "recursively rejects malformed singleton %s entities",
    async (field) => {
      const malformed: Record<string, unknown> = {
        ref: "invalid",
        unexpected: true,
      };
      if (field === "charter")
        Object.assign(malformed, {
          revision: 1,
          goal: "Render state",
          requirements: [],
          boundary: {
            ref: "state:agents:work:dashboard:boundary",
            in: [],
            out: [],
          },
          successCriteria: [],
          specification: { state: "none", entries: [] },
          anchors: [],
        });
      if (field === "review") Object.assign(malformed, { areas: [] });
      if (field === "submission")
        Object.assign(malformed, {
          kind: "coding",
          pullRequests: [],
          deliverables: [],
        });
      if (field === "completion")
        Object.assign(malformed, {
          completedAt: "2026-08-30T12:00:00Z",
          landing: [],
          promotion: {},
          outlives: [],
          decisionDispositions: [],
        });
      const input = await writeJsonFixture(
        streamDocument({ [field]: malformed }),
      );
      const failure = await decodeStateDashboard(input).catch(
        (error: unknown) => error,
      );
      expect(
        (failure as StateValidationFailure).errors.map(({ code }) => code),
      ).toEqual(
        expect.arrayContaining(["ref.grammar", "schema.unknown-field"]),
      );
    },
  );

  it("rejects task cycles and invalid child dependencies", async () => {
    const left = "state:agents:work:dashboard:task:REN";
    const right = "state:agents:work:dashboard:task:LIF";
    const input = await writeJsonFixture(
      streamDocument({
        tasks: [
          {
            ref: left,
            id: "REN",
            summary: "Render",
            targets: [],
            dependsOn: [right],
            required: true,
            acceptanceRefs: [],
            status: "planned",
            evidence: [],
          },
          {
            ref: right,
            id: "LIF",
            summary: "Lifecycle",
            targets: [],
            dependsOn: [left],
            required: true,
            acceptanceRefs: [],
            status: "planned",
            evidence: [],
          },
        ],
      }),
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("task.cycle");
  });

  it("enforces reviewing and completion lifecycle receipts", async () => {
    const task = {
      ref: "state:agents:work:dashboard:task:REN",
      id: "REN",
      summary: "Render",
      targets: [],
      dependsOn: [],
      required: true,
      acceptanceRefs: [],
      status: "planned",
      evidence: [],
    };
    const input = await writeJsonFixture(
      streamDocument({ phase: "reviewing", tasks: [task] }),
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining(["phase.required-task", "phase.submission"]),
    );
  });

  it("rejects revision gaps and non-monotonic event history", async () => {
    const workRef = "state:agents:work:dashboard";
    const input = await writeJsonFixture(
      streamDocument({
        planRevision: 3,
        stateRevision: 2,
        revisions: [
          {
            ref: `${workRef}:revision:plan-3`,
            kind: "plan",
            number: 3,
            timestamp: "2026-08-30T12:00:00Z",
            what: "Third",
            why: "Test",
            approver: "user",
          },
        ],
        events: [
          {
            ref: `${workRef}:event:2-1`,
            timestamp: "2026-08-30T12:00:01Z",
            actor: "agent",
            capabilityId: "coding:write-code",
            eventType: "status",
            stateRevision: 2,
            subjectRef: workRef,
            summary: "Second",
            evidenceRefs: [],
            invalidates: [],
          },
          {
            ref: `${workRef}:event:1-1`,
            timestamp: "2026-08-30T12:00:00Z",
            actor: "agent",
            capabilityId: "coding:write-code",
            eventType: "status",
            stateRevision: 1,
            subjectRef: workRef,
            summary: "First",
            evidenceRefs: [],
            invalidates: [],
          },
        ],
      }),
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toEqual(expect.arrayContaining(["revision.gap", "event.order"]));
  });

  it("rejects forbidden source kinds and cross-work ownership", async () => {
    const root = await temporaryStateRoot();
    const events = join(root, "works", "dashboard", "events.mdc");
    await mkdir(dirname(events), { recursive: true });
    await writeFile(
      events,
      `---\nschema: essential.state/v1\nkind: events\nref: state:agents:work:dashboard:document:events\nworkRef: state:agents:work:other\n---\n{{ type: state.source, ref: 'state:agents:work:dashboard:document:events:source:traps', href: bad.mdc, documentKind: traps }}\n- bad.mdc\n`,
      "utf8",
    );
    await writeFile(
      join(dirname(events), "bad.mdc"),
      `---\nschema: essential.state/v1\nkind: traps\nref: state:agents:document:traps\n---\n`,
      "utf8",
    );

    const streamPath = join(root, "works", "dashboard", "state.mdc");
    await writeFile(
      streamPath,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- dashboard\n{{ type: state.source, ref: 'state:agents:work:dashboard:source:events', href: events.mdc, documentKind: events }}\n- events.mdc\n`,
      "utf8",
    );
    const ownershipFailure = await decodeStateDashboard(streamPath).catch(
      (error: unknown) => error,
    );
    expect(
      (ownershipFailure as StateValidationFailure).errors.map(
        ({ code }) => code,
      ),
    ).toEqual(expect.arrayContaining(["graph.source-kind", "graph.work-ref"]));
  });

  it("rejects normalized JSON unknown fields and raw MDC AST", async () => {
    const root = await temporaryStateRoot();
    const unknownPath = join(root, "unknown.json");
    const astPath = join(root, "ast.json");
    await writeFile(
      unknownPath,
      JSON.stringify({ ...project, children: [] }),
      "utf8",
    );
    await writeFile(
      astPath,
      JSON.stringify({ type: "document", annotations: {}, children: [] }),
      "utf8",
    );

    for (const path of [unknownPath, astPath]) {
      const failure = await decodeStateDashboard(path).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(StateValidationFailure);
      expect((failure as StateValidationFailure).errors.length).toBeGreaterThan(
        0,
      );
    }
  });

  it("returns the precise normalized document union", async () => {
    const input = await writeJsonFixture(project);
    const decoded: StateDashboardDocumentV1 = await decodeStateDashboard(input);
    expect(decoded.kind).toBe("project");
    if (decoded.kind === "project") expect(decoded.project.slug).toBe("agents");
  });

  it("renders escaped, accessible, self-contained HTML", () => {
    const html = renderStateDashboardHtml(project);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<main");
    expect(html).toContain("Agents &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toMatch(/https?:\/\/[^\s"']+\.(?:css|js)/);
  });

  it("does not create HTML after validation fails", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "bad.json");
    await writeFile(input, "{}", "utf8");
    await expect(decodeStateDashboard(input)).rejects.toBeInstanceOf(
      StateValidationFailure,
    );
    expect(await readFile(input, "utf8")).toBe("{}");
  });

  it.each([
    ["../outside.mdc", "source.path"],
    ["https://example.com/state.mdc", "source.path"],
    ["folder\\child.mdc", "source.path"],
  ])("rejects unsafe source %s", async (href, code) => {
    const root = await temporaryStateRoot();
    const input = join(root, "overview.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:bad', href: '${href}', documentKind: environment }}\n- ${href}\n`,
      "utf8",
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(StateValidationFailure);
    expect(
      (failure as StateValidationFailure).errors.map(
        ({ code: value }) => value,
      ),
    ).toContain(code);
  });

  it("rejects a source symlink that escapes .state", async () => {
    const root = await temporaryStateRoot();
    const external = join(root, "..", "external.mdc");
    const linked = join(root, "linked.mdc");
    await writeFile(
      external,
      "---\nschema: essential.state/v1\nkind: traps\nref: state:agents:document:traps\n---\n",
      "utf8",
    );
    await symlink(external, linked);
    const input = join(root, "overview.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:linked', href: linked.mdc, documentKind: traps }}\n- linked.mdc\n`,
      "utf8",
    );
    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("graph.symlink");
  });

  it.each(["document", "component"])(
    "rejects an internal source symlink in a %s path",
    async (symlinkKind) => {
      const root = await temporaryStateRoot();
      const actualDirectory = join(root, "actual");
      const linkedDirectory = join(root, "linked");
      await mkdir(actualDirectory, { recursive: true });
      await writeFile(
        join(actualDirectory, "traps.mdc"),
        `---\nschema: essential.state/v1\nkind: traps\nref: state:agents:document:traps\n---\n`,
        "utf8",
      );
      if (symlinkKind === "document") {
        await symlink(
          join(actualDirectory, "traps.mdc"),
          join(root, "traps.mdc"),
        );
      } else {
        await symlink(actualDirectory, linkedDirectory);
      }
      const href =
        symlinkKind === "document" ? "traps.mdc" : "linked/traps.mdc";
      const input = join(root, "overview.mdc");
      await writeFile(
        input,
        `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:traps', href: ${href}, documentKind: traps }}\n- ${href}\n`,
        "utf8",
      );
      const failure = await decodeStateDashboard(input).catch(
        (error: unknown) => error,
      );
      expect(
        (failure as StateValidationFailure).errors.map(({ code }) => code),
      ).toContain("graph.symlink");
    },
  );

  it("rejects a foreign entity hidden in a work-owned document", async () => {
    const root = await temporaryStateRoot();
    const workDirectory = join(root, "works", "dashboard");
    await mkdir(workDirectory, { recursive: true });
    const input = join(workDirectory, "state.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:dashboard\nworkId: dashboard\n---\n{{ type: state.stream, ref: 'state:agents:work:dashboard', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- dashboard\n{{ type: state.source, ref: 'state:agents:work:dashboard:source:tasks', href: tasks.mdc, documentKind: tasks }}\n- tasks.mdc\n`,
      "utf8",
    );
    await writeFile(
      join(workDirectory, "tasks.mdc"),
      `---\nschema: essential.state/v1\nkind: tasks\nref: state:agents:work:dashboard:document:tasks\nworkRef: state:agents:work:dashboard\n---\n{{ type: state.task, ref: 'state:agents:work:foreign:task:REN', id: REN, targets: [], dependsOn: [], required: true, acceptanceRefs: [], status: planned, evidence: [] }}\n- Foreign task\n`,
      "utf8",
    );

    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("graph.entity-owner");
  });

  it("rejects cycles between linked MDC documents", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "overview.mdc");
    const tasks = join(root, "tasks.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:stream', href: tasks.mdc, documentKind: stream }}\n- tasks.mdc\n`,
      "utf8",
    );
    await writeFile(
      tasks,
      `---\nschema: essential.state/v1\nkind: tasks\nref: state:agents:work:dashboard:document:tasks\nworkRef: state:agents:work:dashboard\n---\n{{ type: state.source, ref: 'state:agents:work:dashboard:document:tasks:source:self', href: tasks.mdc, documentKind: tasks }}\n- tasks.mdc\n`,
      "utf8",
    );

    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("graph.cycle");
  });

  it("rejects a linked document from a mixed schema graph", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "overview.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:traps', href: traps.mdc, documentKind: traps }}\n- traps.mdc\n`,
      "utf8",
    );
    await writeFile(
      join(root, "traps.mdc"),
      `---\nschema: essential.state/v2\nkind: traps\nref: state:agents:document:traps\n---\n`,
      "utf8",
    );

    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("document.schema");
  });

  it("rejects duplicate refs across linked documents", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "overview.mdc");
    await writeFile(
      input,
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:environment', href: environment.mdc, documentKind: environment }}\n- environment.mdc\n{{ type: state.source, ref: 'state:agents:source:traps', href: traps.mdc, documentKind: traps }}\n- traps.mdc\n`,
      "utf8",
    );
    for (const [path, kind] of [
      ["environment.mdc", "environment"],
      ["traps.mdc", "traps"],
    ] as const)
      await writeFile(
        join(root, path),
        `---\nschema: essential.state/v1\nkind: ${kind}\nref: state:agents:document:shared\n---\n`,
        "utf8",
      );

    const failure = await decodeStateDashboard(input).catch(
      (error: unknown) => error,
    );
    expect(
      (failure as StateValidationFailure).errors.map(({ code }) => code),
    ).toContain("ref.duplicate");
  });

  it("prints one RenderResult JSON object from the CLI", async () => {
    const root = await temporaryStateRoot();
    const input = join(root, "overview.json");
    await writeFile(input, JSON.stringify(project), "utf8");
    const result = spawnSync(
      "bun",
      ["run", join(import.meta.dirname, "render-state-dashboard.ts"), input],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const rendered = JSON.parse(result.stdout) as {
      status: string;
      output: string;
    };
    expect(rendered.status).toBe("rendered");
    expect(await readFile(rendered.output, "utf8")).toContain(
      "<!doctype html>",
    );
    await rm(join(rendered.output, ".."), { force: true, recursive: true });
  });
});
