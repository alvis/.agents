import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

const here = import.meta.dirname;
const leaseScript = resolve(here, "state-lease");
const stateWrite = resolve(here, "state-write");
const stateTransaction = resolve(here, "state-transaction.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function stagedGraph(root: string, source = "state/working.mdc"): string {
  const staged = resolve(root, ".state/staged");
  mkdirSync(resolve(staged, "state"), { recursive: true });
  writeFileSync(
    resolve(staged, "state.mdc"),
    `---\nschema: essential.state/v1\nkind: stream\nref: state:test:work:demo\nworkId: demo\n---\n{{ type: state.stream, ref: 'state:test:work:demo', projectRef: 'state:test', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: test, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- demo\n{{ type: state.source, ref: 'state:test:work:demo:source:tasks', href: ${source}, documentKind: tasks }}\n- ${source}\n`,
  );
  if (source === "state/working.mdc")
    writeFileSync(
      resolve(staged, source),
      `---\nschema: essential.state/v1\nkind: tasks\nref: state:test:work:demo:document:tasks\nworkRef: state:test:work:demo\n---\n`,
    );
  return staged;
}

class StateWriteHarness {
  readonly root: string;
  readonly workDirectory: string;
  readonly leasePath: string;
  constructor() {
    this.root = mkdtempSync(resolve(tmpdir(), "state-write-"));
    roots.push(this.root);
    this.workDirectory = resolve(this.root, ".state/works/demo");
    this.leasePath = resolve(this.workDirectory, "lease.json");
    mkdirSync(resolve(this.workDirectory, "state"), { recursive: true });
  }
  acquire(...args: readonly string[]): string {
    const completed = spawnSync(
      "/bin/bash",
      [
        leaseScript,
        "acquire",
        "--work-dir",
        this.workDirectory,
        "--capability",
        "pm",
        "--session",
        "s1",
        ...args,
      ],
      { encoding: "utf8" },
    );
    expect(completed.status, completed.stderr).toBe(0);
    return String((JSON.parse(completed.stdout) as { token: string }).token);
  }
  write(token: string, stagedDirectory = stagedGraph(this.root)) {
    const completed = spawnSync(
      "/bin/bash",
      [
        stateWrite,
        "--work-dir",
        this.workDirectory,
        "--token",
        token,
        "--staged-dir",
        stagedDirectory,
      ],
      { encoding: "utf8" },
    );
    return {
      exitCode: completed.status ?? 1,
      payload: JSON.parse(completed.stdout) as Record<string, unknown>,
    };
  }
  expire(): void {
    const record = JSON.parse(readFileSync(this.leasePath, "utf8")) as Record<
      string,
      unknown
    >;
    record.expires_at_epoch = 0;
    writeFileSync(this.leasePath, JSON.stringify(record));
  }
}

describe("lease-guarded state writing", () => {
  it("should write a validated graph and heartbeat the lease", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    const before = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
      acquired_at: string;
      expires_at_epoch: number;
    };
    const result = harness.write(token);
    expect(result, JSON.stringify(result)).toMatchObject({
      exitCode: 0,
      payload: { status: "written" },
    });
    expect(existsSync(resolve(harness.workDirectory, "state.mdc"))).toBe(true);
    expect(
      existsSync(resolve(harness.workDirectory, "state/working.mdc")),
    ).toBe(true);
    const after = JSON.parse(readFileSync(harness.leasePath, "utf8")) as {
      acquired_at: string;
      expires_at_epoch: number;
    };
    expect(after.expires_at_epoch).toBeGreaterThanOrEqual(
      before.expires_at_epoch,
    );
    expect(after.acquired_at).toBe(before.acquired_at);
  });

  it("should reject the retired single-file flags", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    for (const args of [
      ["--target", "state.md"],
      ["--content-file", resolve(harness.root, "content.md")],
    ]) {
      const completed = spawnSync(
        "/bin/bash",
        [
          stateWrite,
          "--work-dir",
          harness.workDirectory,
          "--token",
          token,
          ...args,
        ],
        { encoding: "utf8" },
      );
      expect(completed.status).toBe(2);
      expect(JSON.parse(completed.stdout)).toMatchObject({ status: "invalid" });
    }
  });

  it("should refuse free, expired, and foreign leases", () => {
    const free = new StateWriteHarness();
    expect(free.write("anything")).toMatchObject({
      exitCode: 4,
      payload: { status: "lease_free" },
    });
    expect(existsSync(resolve(free.workDirectory, "state.mdc"))).toBe(false);

    const expired = new StateWriteHarness();
    const token = expired.acquire();
    expired.expire();
    expect(expired.write(token)).toMatchObject({
      exitCode: 4,
      payload: { status: "lease_expired" },
    });

    const foreign = new StateWriteHarness();
    foreign.acquire();
    expect(foreign.write("deadbeef")).toMatchObject({
      exitCode: 5,
      payload: { status: "lease_foreign" },
    });
  });

  it("should refuse a symlinked staged directory without touching its referent", () => {
    const harness = new StateWriteHarness();
    const token = harness.acquire();
    const graph = stagedGraph(harness.root);
    const link = resolve(harness.root, "staged-link");
    symlinkSync(graph, link);
    expect(harness.write(token, link)).toMatchObject({
      exitCode: 2,
      payload: { status: "invalid" },
    });
    expect(existsSync(resolve(harness.workDirectory, "state.mdc"))).toBe(false);
  });
});

describe("validated state graph transactions", () => {
  function stagedLifecycleGraph(
    root: string,
    options: {
      stateRevision: number;
      planRevision?: number;
      charterRevision?: number;
      charterDocumentRevision?: number;
      status?: "done" | "working";
      summary?: string;
      charterGoal?: string;
      boundaryIn?: string;
      specificationUri?: string;
      anchorUri?: string;
      evidence?: string;
      authorizePlanRevision?: boolean;
      authorizeCharterRevision?: boolean;
      omitEvents?: boolean;
      includeRen?: boolean;
      renRef?: string;
      includeAcceptedRecord?: boolean;
      acceptedRecordStatus?: "accepted" | "rejected" | "superseded";
      acceptedRecordHeadline?: string;
      acceptedRecordAffects?: string;
      addSuccessorRecord?: boolean;
    },
  ): string {
    const {
      stateRevision,
      planRevision = 1,
      charterRevision = 1,
      charterDocumentRevision = charterRevision,
      status = "working",
      summary = "Render",
      charterGoal = "Ship typed state",
      boundaryIn = "State lifecycle",
      specificationUri = "docs/spec.md",
      anchorUri = ".",
      evidence = status === "done"
        ? "[{ ref: 'state:test:work:demo:evidence:done', summary: verified, locator: { uri: test, revision: abc }, inputs: [] }]"
        : "[]",
      authorizePlanRevision = false,
      authorizeCharterRevision = false,
      omitEvents = false,
      includeRen = true,
      renRef = "state:test:work:demo:task:REN",
      includeAcceptedRecord = false,
      acceptedRecordStatus = "accepted",
      acceptedRecordHeadline = "Accepted choice",
      acceptedRecordAffects = "[]",
      addSuccessorRecord = false,
    } = options;
    const renId = renRef.slice(renRef.lastIndexOf(":") + 1);
    const staged = resolve(
      root,
      `.state/staged-${stateRevision}-${planRevision}-${status}-${summary.replaceAll(" ", "-")}`,
    );
    mkdirSync(resolve(staged, "state"), { recursive: true });
    const events = omitEvents
      ? ""
      : Array.from({ length: stateRevision - 1 }, (_, index) => index + 2)
          .map((eventRevision) =>
            (authorizePlanRevision || authorizeCharterRevision) &&
            eventRevision === stateRevision
              ? `{{ type: state.event, ref: 'state:test:work:demo:event:${eventRevision}-1', timestamp: '2026-08-30T12:00:00Z', actor: user, capabilityId: user, eventType: revision, stateRevision: ${eventRevision}, subjectRef: 'state:test:work:demo:revision:${authorizeCharterRevision ? `charter-${charterRevision}` : `plan-${planRevision}`}', evidenceRefs: ['state:test:work:demo:evidence:approval'], invalidates: [] }}\n- Approved revision\n--{ ref: state:test:work:demo:event:${eventRevision}-1 }--\n`
              : `{{ type: state.event, ref: 'state:test:work:demo:event:${eventRevision}-1', timestamp: '2026-08-30T12:00:00Z', actor: agent, capabilityId: worker:generalist-engineer, eventType: status, stateRevision: ${eventRevision}, subjectRef: 'state:test:work:demo:task:REN', evidenceRefs: [], invalidates: [] }}\n- Updated task state\n--{ ref: state:test:work:demo:event:${eventRevision}-1 }--\n`,
          )
          .join("");
    const hasRecords = includeAcceptedRecord || addSuccessorRecord;
    writeFileSync(
      resolve(staged, "state.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: state:test:work:demo\nworkId: demo\n---\n{{ type: state.stream, ref: 'state:test:work:demo', projectRef: 'state:test', phase: working, charterStatus: approved, charterRevision: ${charterRevision}, planRevision: ${planRevision}, stateRevision: ${stateRevision}, writtenUnder: test, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- demo\n{{ type: state.source, ref: 'state:test:work:demo:source:charter', href: goal.mdc, documentKind: charter }}\n- goal.mdc\n{{ type: state.source, ref: 'state:test:work:demo:source:tasks', href: state/working.mdc, documentKind: tasks }}\n- state/working.mdc\n{{ type: state.source, ref: 'state:test:work:demo:source:events', href: state/journal.mdc, documentKind: events }}\n- state/journal.mdc\n{{ type: state.source, ref: 'state:test:work:demo:source:revisions', href: state/revisions.mdc, documentKind: revisions }}\n- state/revisions.mdc\n${hasRecords ? "{{ type: state.source, ref: 'state:test:work:demo:source:records', href: records.mdc, documentKind: records }}\n- records.mdc\n" : ""}`,
    );
    writeFileSync(
      resolve(staged, "goal.mdc"),
      `---\nschema: essential.state/v1\nkind: charter\nref: state:test:work:demo:document:charter\nworkRef: state:test:work:demo\n---\n{{ type: state.charter, ref: 'state:test:work:demo:charter', revision: ${charterDocumentRevision}, requirements: [{ ref: 'state:test:work:demo:statement:requirement', text: typed }], boundary: { ref: 'state:test:work:demo:boundary', in: [{ ref: 'state:test:work:demo:statement:boundary-in', text: '${boundaryIn}' }], out: [] }, successCriteria: [{ ref: 'state:test:work:demo:sc:1', id: SC-1, text: verified, expectedEvidence: tests }], specification: { state: linked, entries: [{ uri: '${specificationUri}', revision: spec-v1 }] }, anchors: [{ ref: 'state:test:work:demo:anchor:workspace', kind: jj, locator: { uri: '${anchorUri}', revision: workspace-v1 }, revisionSemantics: commit }] }}\n- ${charterGoal}\n--{ ref: state:test:work:demo:charter }--\n`,
    );
    writeFileSync(
      resolve(staged, "state/working.mdc"),
      `---\nschema: essential.state/v1\nkind: tasks\nref: state:test:work:demo:document:tasks\nworkRef: state:test:work:demo\n---\n${includeRen ? `{{ type: state.task, ref: '${renRef}', id: ${renId}, targets: [], dependsOn: [], required: true, acceptanceRefs: [], status: ${status}, owner: agent, evidence: ${evidence} }}\n- ${summary}\n--{ ref: ${renRef} }--\n` : ""}{{ type: state.task, ref: 'state:test:work:demo:task:LIF', id: LIF, targets: [], dependsOn: [], required: true, acceptanceRefs: [], status: working, owner: agent, evidence: ${authorizePlanRevision || authorizeCharterRevision ? "[{ ref: 'state:test:work:demo:evidence:approval', summary: approved, locator: { uri: decision, revision: user-approved }, inputs: [] }]" : "[]"} }}\n- Continue\n--{ ref: state:test:work:demo:task:LIF }--\n`,
    );
    writeFileSync(
      resolve(staged, "state/journal.mdc"),
      `---\nschema: essential.state/v1\nkind: events\nref: state:test:work:demo:document:events\nworkRef: state:test:work:demo\n---\n${events}`,
    );
    writeFileSync(
      resolve(staged, "state/revisions.mdc"),
      `---\nschema: essential.state/v1\nkind: revisions\nref: state:test:work:demo:document:revisions\nworkRef: state:test:work:demo\n---\n${Array.from(
        { length: planRevision - 1 },
        (_, index) => index + 2,
      )
        .map(
          (number) =>
            `{{ type: state.revision, ref: 'state:test:work:demo:revision:plan-${number}', kind: plan, number: ${number}, timestamp: '2026-08-30T12:00:00Z', why: approved-change, approver: user }}\n- Revised task definition\n--{ ref: state:test:work:demo:revision:plan-${number} }--\n`,
        )
        .join("")}${Array.from(
        { length: charterRevision - 1 },
        (_, index) => index + 2,
      )
        .map(
          (number) =>
            `{{ type: state.revision, ref: 'state:test:work:demo:revision:charter-${number}', kind: charter, number: ${number}, timestamp: '2026-08-30T12:00:00Z', why: approved-charter-change, approver: user }}\n- Revised charter\n--{ ref: state:test:work:demo:revision:charter-${number} }--\n`,
        )
        .join("")}`,
    );
    if (hasRecords)
      writeFileSync(
        resolve(staged, "records.mdc"),
        `---\nschema: essential.state/v1\nkind: records\nref: state:test:work:demo:document:records\nworkRef: state:test:work:demo\n---\n${includeAcceptedRecord ? `{{ type: state.record, ref: 'state:test:work:demo:record:decision:accepted', kind: decision, status: ${acceptedRecordStatus}, owner: user, createdAt: '2026-08-30T12:00:00Z', locator: { uri: decisions/accepted.md, revision: accepted-v1 }, targetRef: 'state:test:work:demo', provenance: [], supersedes: [], affects: ${acceptedRecordAffects}, invalidates: [], preserves: [], relationshipStatements: [] }}\n- ${acceptedRecordHeadline}\n--{ ref: state:test:work:demo:record:decision:accepted }--\n` : ""}${addSuccessorRecord ? "{{ type: state.record, ref: 'state:test:work:demo:record:decision:successor', kind: decision, status: accepted, owner: user, createdAt: '2026-08-30T12:00:00Z', locator: { uri: decisions/successor.md, revision: accepted-v2 }, targetRef: 'state:test:work:demo', provenance: [], supersedes: ['state:test:work:demo:record:decision:accepted'], affects: [], invalidates: [], preserves: [], relationshipStatements: [] }}\n- Successor choice\n--{ ref: state:test:work:demo:record:decision:successor }--\n" : ""}`,
      );
    return staged;
  }

  it("should bootstrap a validated graph child-first and root-last", () => {
    const root = mkdtempSync(resolve(tmpdir(), "state-transaction-"));
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const result = spawnSync(
      "bun",
      [stateTransaction, work, stagedGraph(root)],
      {
        encoding: "utf8",
      },
    );
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "written",
      files: ["state/working.mdc", "state.mdc"],
    });
    expect(existsSync(resolve(work, "state/working.mdc"))).toBe(true);
    expect(existsSync(resolve(work, "state.mdc"))).toBe(true);
  });

  it("should reject a staged graph with a missing linked child", () => {
    const root = mkdtempSync(resolve(tmpdir(), "state-transaction-dangling-"));
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const result = spawnSync(
      "bun",
      [stateTransaction, work, stagedGraph(root, "state/missing.mdc")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "invalid" });
    expect(existsSync(resolve(work, "state.mdc"))).toBe(false);
  });

  it("should never reopen a completed task in a later graph revision", () => {
    const root = mkdtempSync(resolve(tmpdir(), "state-transaction-terminal-"));
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const initial = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 1, status: "done" }),
      ],
      { encoding: "utf8" },
    );
    expect(initial.status, `${initial.stderr}\n${initial.stdout}`).toBe(0);

    const reopened = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 2, status: "working" }),
      ],
      { encoding: "utf8" },
    );
    expect(reopened.status).toBe(2);
    expect(JSON.parse(reopened.stdout)).toMatchObject({
      status: "invalid",
      errors: [
        {
          code: "transaction.invalid",
          message: expect.stringContaining("completed task cannot reopen"),
        },
      ],
    });
    expect(readFileSync(resolve(work, "state/working.mdc"), "utf8")).toContain(
      "status: done",
    );
  });

  it("should accept status and evidence-validity writes without a plan revision", () => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-state-only-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const initial = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 1 }),
      ],
      { encoding: "utf8" },
    );
    expect(initial.status, `${initial.stderr}\n${initial.stdout}`).toBe(0);

    const statusOnly = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 2, status: "done" }),
      ],
      { encoding: "utf8" },
    );
    expect(statusOnly.status, statusOnly.stdout).toBe(0);

    const validityOnly = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 3,
          status: "done",
          evidence:
            "[{ ref: 'state:test:work:demo:evidence:done', summary: verified, locator: { uri: test, revision: abc }, inputs: [] }], validity: { state: stale, reason: changed-input }",
        }),
      ],
      { encoding: "utf8" },
    );
    expect(validityOnly.status, validityOnly.stdout).toBe(0);
  });

  it.each([
    {
      name: "removal",
      nextEvidence:
        "[{ ref: 'state:test:work:demo:evidence:done', summary: verified, locator: { uri: test, revision: abc }, inputs: [] }]",
    },
    {
      name: "summary rewrite",
      nextEvidence:
        "[{ ref: 'state:test:work:demo:evidence:done', summary: rewritten, locator: { uri: test, revision: abc }, inputs: [] }, { ref: 'state:test:work:demo:evidence:second', summary: second, locator: { uri: test-2, revision: def }, inputs: [] }]",
    },
    {
      name: "ref rewrite",
      nextEvidence:
        "[{ ref: 'state:test:work:demo:evidence:replacement', summary: verified, locator: { uri: test, revision: abc }, inputs: [] }, { ref: 'state:test:work:demo:evidence:second', summary: second, locator: { uri: test-2, revision: def }, inputs: [] }]",
    },
    {
      name: "locator rewrite",
      nextEvidence:
        "[{ ref: 'state:test:work:demo:evidence:done', summary: verified, locator: { uri: changed-test, revision: xyz }, inputs: [] }, { ref: 'state:test:work:demo:evidence:second', summary: second, locator: { uri: test-2, revision: def }, inputs: [] }]",
    },
  ])("should reject completed task evidence $name", ({ nextEvidence }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-done-evidence-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const initialEvidence =
      "[{ ref: 'state:test:work:demo:evidence:done', summary: verified, locator: { uri: test, revision: abc }, inputs: [] }, { ref: 'state:test:work:demo:evidence:second', summary: second, locator: { uri: test-2, revision: def }, inputs: [] }]";
    const initial = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 1,
          status: "done",
          evidence: initialEvidence,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(initial.status, initial.stdout).toBe(0);
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 2,
          status: "done",
          evidence: nextEvidence,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [
        {
          message: expect.stringContaining(
            "completed task evidence is immutable",
          ),
        },
      ],
    });
  });

  it.each([
    {
      name: "definition change without a plan counter",
      next: { stateRevision: 2, summary: "Changed render" },
      message: "definition change requires planRevision",
    },
    {
      name: "counter-only plan revision",
      next: {
        stateRevision: 2,
        planRevision: 2,
        authorizePlanRevision: true,
      },
      message: "planRevision cannot increase without a definition change",
    },
    {
      name: "plan revision jump",
      next: {
        stateRevision: 2,
        planRevision: 3,
        summary: "Changed render",
        authorizePlanRevision: true,
      },
      message: "planRevision must remain unchanged or increase by exactly one",
    },
  ])("should reject $name", ({ next, message }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-plan-reject-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const result = spawnSync(
      "bun",
      [stateTransaction, work, stagedLifecycleGraph(root, next)],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [{ message: expect.stringContaining(message) }],
    });
  });

  it("should accept one causally bound approved definition revision", () => {
    const root = mkdtempSync(resolve(tmpdir(), "state-transaction-plan-pass-"));
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const revised = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 2,
          planRevision: 2,
          summary: "Changed render",
          authorizePlanRevision: true,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(revised.status, revised.stdout).toBe(0);
  });

  it.each([
    { name: "goal", mutation: { charterGoal: "Ship safer typed state" } },
    { name: "boundary", mutation: { boundaryIn: "State and migration" } },
    {
      name: "specification",
      mutation: { specificationUri: "docs/spec-v2.md" },
    },
    { name: "anchor", mutation: { anchorUri: "workspaces/typed-state" } },
  ])("should accept an approved $name charter revision", ({ mutation }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-charter-pass-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const revised = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 2,
          charterRevision: 2,
          authorizeCharterRevision: true,
          ...mutation,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(revised.status, revised.stdout).toBe(0);
  });

  it.each([
    {
      name: "charter change without its counter",
      next: { stateRevision: 2, charterGoal: "Changed charter" },
      message: "charter change requires charterRevision",
    },
    {
      name: "counter-only charter revision",
      next: {
        stateRevision: 2,
        charterRevision: 2,
        authorizeCharterRevision: true,
      },
      message: "charterRevision cannot increase without a charter change",
    },
    {
      name: "charter revision without its causal event",
      next: {
        stateRevision: 2,
        charterRevision: 2,
        charterGoal: "Changed charter",
      },
      message: "approved charter revision requires one causal revision event",
    },
    {
      name: "charter change authorized only by a plan revision",
      next: {
        stateRevision: 2,
        planRevision: 2,
        summary: "Changed render",
        charterGoal: "Changed charter",
        authorizePlanRevision: true,
      },
      message: "charter change requires charterRevision",
    },
  ])("should reject $name", ({ next, message }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-charter-reject-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const result = spawnSync(
      "bun",
      [stateTransaction, work, stagedLifecycleGraph(root, next)],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [{ message: expect.stringContaining(message) }],
    });
  });

  it("should reject a stream and charter revision mismatch in the shared codec", () => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-charter-codec-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 1,
          charterRevision: 2,
          charterDocumentRevision: 1,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [
        {
          code: "charter.revision-mismatch",
          message: expect.stringContaining("must equal"),
        },
      ],
    });
  });

  it("should reject a state revision without an event at the new revision", () => {
    const root = mkdtempSync(resolve(tmpdir(), "state-transaction-event-gap-"));
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 2, omitEvents: true }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [
        {
          message: expect.stringContaining(
            "requires an appended event at that revision",
          ),
        },
      ],
    });
  });

  it.each([
    {
      name: "deletion",
      next: { includeAcceptedRecord: false },
      message: "accepted record cannot be removed",
    },
    {
      name: "body rewrite",
      next: {
        includeAcceptedRecord: true,
        acceptedRecordHeadline: "Rewritten choice",
      },
      message: "accepted record body and causality are immutable",
    },
    {
      name: "causality rewrite",
      next: {
        includeAcceptedRecord: true,
        acceptedRecordAffects: "['state:test:work:demo:task:REN']",
      },
      message: "accepted record body and causality are immutable",
    },
    {
      name: "invalid status transition",
      next: {
        includeAcceptedRecord: true,
        acceptedRecordStatus: "rejected" as const,
      },
      message: "can only remain accepted or become superseded",
    },
  ])("should reject accepted record $name", ({ next, message }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-record-reject-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    const initial = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 1,
          includeAcceptedRecord: true,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(initial.status, initial.stdout).toBe(0);
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 2, ...next }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [{ message: expect.stringContaining(message) }],
    });
  });

  it.each([
    {
      name: "documented superseded transition",
      next: {
        includeAcceptedRecord: true,
        acceptedRecordStatus: "superseded" as const,
      },
    },
    {
      name: "successor with supersession causality",
      next: { includeAcceptedRecord: true, addSuccessorRecord: true },
    },
  ])("should accept $name", ({ next }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-record-pass-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, {
            stateRevision: 1,
            includeAcceptedRecord: true,
          }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, { stateRevision: 2, ...next }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stdout).toBe(0);
  });

  it.each([
    { name: "task removal", next: { includeRen: false } },
    {
      name: "task ref mutation",
      next: { renRef: "state:test:work:demo:task:XYZ" },
    },
  ])("should reject $name even with a plan revision", ({ next }) => {
    const root = mkdtempSync(
      resolve(tmpdir(), "state-transaction-ref-reject-"),
    );
    roots.push(root);
    const work = resolve(root, ".state/works/demo");
    mkdirSync(work, { recursive: true });
    expect(
      spawnSync(
        "bun",
        [
          stateTransaction,
          work,
          stagedLifecycleGraph(root, { stateRevision: 1 }),
        ],
        { encoding: "utf8" },
      ).status,
    ).toBe(0);
    const result = spawnSync(
      "bun",
      [
        stateTransaction,
        work,
        stagedLifecycleGraph(root, {
          stateRevision: 2,
          planRevision: 2,
          authorizePlanRevision: true,
          ...next,
        }),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "invalid",
      errors: [
        { message: expect.stringContaining("task ref cannot be removed") },
      ],
    });
  });
});
