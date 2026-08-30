import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { migrateState, restoreState } from "./migrate-state.ts";
import {
  decodeStateDashboard,
  taskDefinitionHash,
} from "../../../scripts/state-codec.ts";

const roots: string[] = [];
const migrationScript = join(import.meta.dirname, "migrate-state.ts");

async function approvedRestore(
  receipt: string,
  options: { failpoint?: string } = {},
): Promise<Record<string, unknown>> {
  const diagnosis = await restoreState(receipt);
  expect(diagnosis).toMatchObject({ status: "approval_required" });
  return restoreState(receipt, {
    ...options,
    approval: String(diagnosis.approval),
  });
}

async function fixture(
  workId = "migration-test",
  repositoryName = ".agents",
): Promise<{ stateRoot: string; workDir: string; backupDir: string }> {
  const fixtureRoot = join(
    tmpdir(),
    `essential-migration-${crypto.randomUUID()}`,
  );
  const base = join(fixtureRoot, repositoryName);
  const backupBase = join(
    tmpdir(),
    `essential-migration-backup-${crypto.randomUUID()}`,
  );
  const stateRoot = join(base, ".state");
  const workDir = join(stateRoot, "works", workId);
  const backupDir = join(backupBase, "backup");
  roots.push(fixtureRoot, backupBase);
  await mkdir(join(workDir, "state"), { recursive: true });
  await mkdir(backupDir, { recursive: true });
  await writeFile(
    join(stateRoot, "overview.md"),
    `# State overview

- Updated: \`2026-08-30T11:00:00Z\`

## Goal

Keep state recoverable.

## Requirements

- Preserve stream history.

## Specifications

- None

## Streams

| Work ID | Phase |
| --- | --- |
| \`${workId}\` | working |
`,
  );
  await writeFile(
    join(stateRoot, "environment.md"),
    `# Environment

## Claims

| Claim | Observed at |
| --- | --- |
| Bun is available. | 2026-08-30T11:00:00Z |
`,
  );
  await writeFile(
    join(stateRoot, "traps.md"),
    `# Traps

## Traps

| Symptom | Cause | Action | Verified at |
| --- | --- | --- | --- |
| Mixed state. | Interrupted write. | Restore the receipt. | 2026-08-30T11:00:00Z |
`,
  );
  await writeFile(
    join(workDir, "goal.md"),
    `# Charter

- Work ID: \`${workId}\`
- Charter: \`approved\`
- Charter revision: \`1\`
- Created: \`2026-08-30T10:00:00Z\`
- State: [state.md](state.md)

## Goal

Migrate state safely.

## Scope and non-goals

In scope: canonical state. Out of scope: artifacts.

## Success criteria

| ID | Criterion | Acceptance evidence |
| --- | --- | --- |
| SC-1 | State is MDC. | Codec validation passes. |

## Specification notes

None.

## Specification provenance

- Specification: None

## Workspace anchors

- kind: \`git\` · locator: \`/tmp/repo\` · revision semantics: commit
`,
  );
  await writeFile(
    join(workDir, "state.md"),
    `# Work state

- State role: \`root\`
- Work ID: \`${workId}\`
- Phase: \`working\`
- Updated: \`2026-08-30T11:00:00Z\`
- Charter: [goal.md](goal.md)
- Current focus: [working.md](state/working.md)
- Journal: [journal.md](state/journal.md)
- Plan source: \`state.md\`
- Plan revision: \`1\`
- State revision: \`1\`
- Written under: \`abc123\`
- Next owner: \`Tech Lead\`
- Next action: Continue delivery.
- Repository revision: \`abc123\`
- Sync state: Not started.
- Review state: Not started.

## Status

- Topology: \`linear\`

## Tasks

| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MIG | ⧗ | working | Migrate state. [targets: plugins/essential] | — | yes | SC-1: migration passes. | Generalist Engineer | Continue. |

## Decisions

- None
`,
  );
  await writeFile(
    join(workDir, "state/working.md"),
    "# Working\n\nContinue delivery.\n",
  );
  await writeFile(
    join(workDir, "state/journal.md"),
    `# Journal

- 2026-08-30T10:00:00Z PM@pm rev:1 status ${workId}: bootstrapped
`,
  );
  return { stateRoot, workDir, backupDir };
}

async function copyLegacyWork(
  sourceDirectory: string,
  targetDirectory: string,
  sourceWorkId: string,
  targetWorkId: string,
): Promise<void> {
  for (const relativePath of [
    "goal.md",
    "state.md",
    "state/working.md",
    "state/journal.md",
  ]) {
    await mkdir(join(targetDirectory, relativePath, ".."), {
      recursive: true,
    });
    const source = await readFile(join(sourceDirectory, relativePath), "utf8");
    await writeFile(
      join(targetDirectory, relativePath),
      source.replaceAll(sourceWorkId, targetWorkId),
    );
  }
}

async function completeArchivedLegacyWork(workDir: string): Promise<void> {
  const path = join(workDir, "state.md");
  const state = await readFile(path, "utf8");
  await writeFile(
    path,
    `${state
      .replace("Phase: \`working\`", "Phase: \`completed\`")
      .replace("| MIG | ⧗ | working |", "| MIG | ✓ | done |")}

## Submission

- Kind: \`coding\`

## Pull requests

| Number | URL | Repository | Head revision | Status | Merged revision |
| --- | --- | --- | --- | --- | --- |
| 42 | https://example.test/pr/42 | agents | abc123 | merged | def456 |

## Completion receipt

- Completed at: \`2026-08-30T11:30:00Z\`
- Promotion: \`not-required\`

## Landing evidence

| Summary | URI | Revision | Hash |
| --- | --- | --- | --- |
| Archived state landed. | https://example.test/pr/42 | def456 | — |
`,
  );
}

async function addOverviewStream(
  stateRoot: string,
  workId: string,
  phase = "working",
): Promise<void> {
  const path = join(stateRoot, "overview.md");
  const overview = await readFile(path, "utf8");
  await writeFile(
    path,
    `${overview.trimEnd()}\n| \`${workId}\` | ${phase} |\n`,
  );
}

async function addCompleteLifecycle(input: {
  stateRoot: string;
  workDir: string;
}): Promise<string> {
  const statePath = join(input.workDir, "state.md");
  const state = await readFile(statePath, "utf8");
  await writeFile(
    statePath,
    `${state
      .replace("Phase: \`working\`", "Phase: \`completed\`")
      .replace("Review state: Not started.", "Review state: Clean.")
      .replace("| MIG | ⧗ | working |", "| MIG | ✓ | done |")}

## Submission

- Kind: \`coding\`

## Pull requests

| Number | URL | Repository | Head revision | Status | Merged revision |
| --- | --- | --- | --- | --- | --- |
| 42 | https://example.test/pr/42 | agents | abc123 | merged | def456 |

## Completion receipt

- Completed at: \`2026-08-30T11:30:00Z\`
- Promotion: \`paths\`

## Landing evidence

| Summary | URI | Revision | Hash |
| --- | --- | --- | --- |
| PR 42 merged. | https://example.test/pr/42 | def456 | — |

## Promotion paths

| URI | Revision | Hash |
| --- | --- | --- |
| docs/state.md | def456 | — |

## Outlives

| ID | Summary | Owner | URI | Revision | Hash |
| --- | --- | --- | --- | --- | --- |
| docs | Maintain state guide. | Tech Lead | docs/state.md | def456 | — |

## Decision dispositions

| ID | Decision | Kind | URI | Revision | Hash |
| --- | --- | --- | --- | --- | --- |
`,
  );
  await mkdir(join(input.workDir, "proposals"), { recursive: true });
  await writeFile(
    join(input.workDir, "proposals.md"),
    `# Proposals

| Status | Headline | Path |
| --- | --- | --- |
| open | Preserve record prose. | [record-prose.md](proposals/record-prose.md) |
`,
  );
  const proposal = `# Preserve record prose

- Status: \`open\`
- Headline: Preserve record prose.
- Owner: Tech Lead
- Created: \`2026-08-30T10:30:00Z\`
- Affects: \`MIG\`
- Supersedes: None
- Invalidates: ARC ReviewArea schema and REN codec evidence before repository revision abc123
- Preserves: renderer conventions and durable history

## Proposal

Copy this body byte-for-byte, including **formatting**.
`;
  await writeFile(
    join(input.workDir, "proposals", "record-prose.md"),
    proposal,
  );
  const definitionHash = taskDefinitionHash([
    {
      ref: "state:agents:work:migration-test:task:MIG",
      id: "MIG",
      summary: "Migrate state.",
      targets: ["plugins/essential"],
      dependsOn: [],
      required: true,
      acceptanceRefs: ["state:agents:work:migration-test:sc:1"],
    },
  ]);
  await mkdir(join(input.workDir, "reviews"), { recursive: true });
  const rows: string[] = [];
  for (const area of [
    "alignment",
    "correctness",
    "security",
    "quality",
    "testing",
    "docs",
    "style",
  ]) {
    rows.push(`| ${area} | [${area}](reviews/${area}.md) |`);
    await writeFile(
      join(input.workDir, "reviews", `${area}.md`),
      `# ${area} review

- Area: \`${area}\`
- Reviewed at: \`2026-08-30T11:15:00Z\`
- Reviewed revision: \`1\`
- Reviewed tasks: \`MIG\`
- Task definition hash: \`${definitionHash}\`

## Findings

| ID | Status | Severity | Summary | Evidence | Rationale | Owner | Recheck |
| --- | --- | --- | --- | --- | --- | --- | --- |
`,
    );
  }
  await writeFile(
    join(input.workDir, "review.md"),
    `# Review

## Areas

| Area | Path |
| --- | --- |
${rows.join("\n")}
`,
  );
  const overviewPath = join(input.stateRoot, "overview.md");
  await writeFile(
    overviewPath,
    (await readFile(overviewPath, "utf8")).replace(
      `| Work ID | Phase |
| --- | --- |
| \`migration-test\` | working |`,
      `| Work ID | Phase | Location | Documentations |
| --- | --- | --- | --- |
| \`migration-test\` | completed | works/migration-test | [State guide](docs/state.md) |`,
    ),
  );
  return proposal;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function migrationStagingDirectories(): Promise<Set<string>> {
  return new Set(
    (await readdir(tmpdir())).filter(
      (name) =>
        name.startsWith("essential-state-migration-") ||
        name.startsWith("essential-project-migration-"),
    ),
  );
}

describe("Doctor state migration", () => {
  it("exposes migration diagnosis through the public command", async () => {
    const input = await fixture();
    const completed = spawnSync(
      "bun",
      [
        migrationScript,
        `--state-root=${input.stateRoot}`,
        `--backup-dir=${input.backupDir}`,
        "--work-id=migration-test",
      ],
      { encoding: "utf8" },
    );

    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "approval_required",
      inventory: [expect.objectContaining({ workId: "migration-test" })],
    });
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("exposes receipt-bound restore diagnosis through the public command", async () => {
    const input = await fixture();
    const migrated = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const completed = spawnSync(
      "bun",
      [migrationScript, `--restore-state=${String(migrated.receipt)}`],
      { encoding: "utf8" },
    );

    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(completed.stdout)).toMatchObject({
      status: "approval_required",
      receipt: String(migrated.receipt),
      approval: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
    await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
  });

  it("should remove every staging directory after success", async () => {
    const before = await migrationStagingDirectories();
    const input = await fixture();
    await expect(
      migrateState({
        ...input,
        approved: true,
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).resolves.toMatchObject({ status: "migrated" });
    expect(await migrationStagingDirectories()).toEqual(before);
  });

  it("should remove every staging directory after post-backup rollback", async () => {
    const before = await migrationStagingDirectories();
    const input = await fixture();
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint: "after-backup",
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("injected failure");
    expect(await migrationStagingDirectories()).toEqual(before);
  });

  it("should clean an earlier work stage when a later work stage is invalid", async () => {
    const before = await migrationStagingDirectories();
    const input = await fixture("a-valid");
    const invalidWork = join(input.stateRoot, "works", "z-invalid");
    await copyLegacyWork(input.workDir, invalidWork, "a-valid", "z-invalid");
    await addOverviewStream(input.stateRoot, "z-invalid");
    const goalPath = join(invalidWork, "goal.md");
    await writeFile(
      goalPath,
      (await readFile(goalPath, "utf8")).replace(
        "Migrate state safely.",
        "Migrate\tstate safely.",
      ),
    );

    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "staged graph invalid",
    );
    expect(await migrationStagingDirectories()).toEqual(before);
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("should clean work and project stages when the project model is invalid", async () => {
    const before = await migrationStagingDirectories();
    const input = await fixture();
    const environmentPath = join(input.stateRoot, "environment.md");
    await writeFile(
      environmentPath,
      (await readFile(environmentPath, "utf8")).replace(
        "2026-08-30T11:00:00Z",
        "not-a-timestamp",
      ),
    );

    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "invalid timestamp: not-a-timestamp",
    );
    expect(await migrationStagingDirectories()).toEqual(before);
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("should clean work and project stages when the staged project graph is invalid", async () => {
    const before = await migrationStagingDirectories();
    const input = await fixture();
    const environmentPath = join(input.stateRoot, "environment.md");
    await writeFile(
      environmentPath,
      (await readFile(environmentPath, "utf8")).replace(
        "Bun is available.",
        "Bun\tis available.",
      ),
    );

    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "staged project graph invalid",
    );
    expect(await migrationStagingDirectories()).toEqual(before);
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("diagnoses without writing until explicitly approved", async () => {
    const input = await fixture();
    const output = await migrateState({ ...input, approved: false });
    expect(output.status).toBe("approval_required");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
  });

  it("backs up, validates, cuts over, and restores hash-verified Markdown", async () => {
    const input = await fixture();
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    expect(output.status).toBe("migrated");
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({
      kind: "stream",
      stream: {
        continuation: { focus: "Continue delivery." },
        charter: {
          boundary: {
            in: [{ text: "canonical state." }],
            out: [{ text: "artifacts." }],
          },
          anchors: [
            {
              kind: "git",
              locator: { uri: "/tmp/repo" },
              revisionSemantics: "commit",
            },
          ],
        },
      },
    });
    await expect(
      decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
    ).resolves.toMatchObject({
      kind: "project",
      environment: [{ statement: "Bun is available." }],
      traps: [{ symptom: "Mixed state." }],
    });
    await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
    const restored = await approvedRestore(String(output.receipt));
    expect(restored.status).toBe("restored");
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.stateRoot, "overview.md"), "utf8"),
    ).resolves.toContain("# State overview");
    await expect(
      readFile(join(input.stateRoot, "overview.mdc")),
    ).rejects.toThrow();
  });

  it("derives project identity from a consumer repository and preserves it through restore", async () => {
    const input = await fixture("migration-test", "consumer-repo");
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    expect(output.status).toBe("migrated");
    await expect(
      decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
    ).resolves.toMatchObject({
      kind: "project",
      project: { ref: "state:consumer-repo", slug: "consumer-repo" },
      streams: [
        {
          ref: "state:consumer-repo:work:migration-test",
          projectRef: "state:consumer-repo",
        },
      ],
    });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({
      kind: "stream",
      projectRef: "state:consumer-repo",
      stream: {
        ref: "state:consumer-repo:work:migration-test",
        projectRef: "state:consumer-repo",
      },
    });

    const restored = await approvedRestore(String(output.receipt));
    expect(restored.status).toBe("restored");
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("Work ID: `migration-test`");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("backs up every accepted legacy carrier while excluding leases and artifacts", async () => {
    const input = await fixture();
    await mkdir(join(input.workDir, "artifacts"), { recursive: true });
    await writeFile(join(input.workDir, "artifacts", "evidence.txt"), "kept");
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const receipt = JSON.parse(await readFile(String(output.receipt), "utf8"));
    expect(receipt.entries.map(({ path }: { path: string }) => path)).toEqual(
      expect.arrayContaining([
        "overview.md",
        "environment.md",
        "traps.md",
        "works/migration-test/goal.md",
        "works/migration-test/state.md",
        "works/migration-test/state/working.md",
        "works/migration-test/state/journal.md",
      ]),
    );
    expect(
      receipt.entries.some(
        ({ path }: { path: string }) =>
          path.endsWith("lease.json") || path.includes("/artifacts/"),
      ),
    ).toBe(false);
    await expect(
      readFile(join(input.workDir, "artifacts", "evidence.txt"), "utf8"),
    ).resolves.toBe("kept");
  });

  it("refuses selected-subset project migration before backup or publication", async () => {
    const input = await fixture("selected-stream");
    await copyLegacyWork(
      input.workDir,
      join(input.stateRoot, "works", "unselected-stream"),
      "selected-stream",
      "unselected-stream",
    );
    await expect(
      migrateState({
        ...input,
        workIds: ["selected-stream"],
        approved: true,
      }),
    ).rejects.toThrow("incomplete project graph");
    await expect(
      readFile(join(input.stateRoot, "overview.md"), "utf8"),
    ).resolves.toContain("# State overview");
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("migrates revision history beyond revision one and restores it byte-for-byte", async () => {
    const input = await fixture();
    const state = await readFile(join(input.workDir, "state.md"), "utf8");
    await writeFile(
      join(input.workDir, "state.md"),
      state.replace("Plan revision: `1`", "Plan revision: `2`"),
    );
    const revisions = `# Revisions

- 2026-08-30T10:00:00Z — Charter revision \`1\`; approved by user; establishes the charter.
- 2026-08-30T10:00:00Z — Plan revision \`1\`; approved by user; establishes the plan.
- 2026-08-30T10:30:00Z — Plan revision \`2\`; approved by Tech Lead; adds parity checks.
`;
    await writeFile(join(input.workDir, "state/revisions.md"), revisions);
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({
      stream: {
        planRevision: 2,
        revisions: expect.arrayContaining([
          expect.objectContaining({ kind: "plan", number: 2 }),
        ]),
      },
    });
    await approvedRestore(String(output.receipt));
    await expect(
      readFile(join(input.workDir, "state/revisions.md"), "utf8"),
    ).resolves.toBe(revisions);
  });

  it("refuses revision increments without canonical history before backup", async () => {
    const input = await fixture();
    const state = await readFile(join(input.workDir, "state.md"), "utf8");
    await writeFile(
      join(input.workDir, "state.md"),
      state.replace("Plan revision: `1`", "Plan revision: `2`"),
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "missing state/revisions.md",
    );
    expect(await readdir(input.backupDir)).toEqual([]);
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("migrates unresolved and resolved questions without dropping history", async () => {
    const input = await fixture();
    const unresolved = `# Unresolved

## Questions

| ID | Question | Owner | Waiting since | Awaiting user | Resolved at | Answer |
| --- | --- | --- | --- | --- | --- | --- |
| parser-choice | Which parser? | Tech Lead | 2026-08-30T10:00:00Z | yes | — | — |
| backup-path | Where is backup? | PM | 2026-08-30T09:00:00Z | no | 2026-08-30T10:00:00Z | External disk. |
`;
    await writeFile(join(input.workDir, "state/unresolved.md"), unresolved);
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({
      stream: {
        questions: expect.arrayContaining([
          expect.objectContaining({
            text: "Which parser?",
            awaitingUser: true,
          }),
          expect.objectContaining({
            answer: "External disk.",
            resolvedAt: "2026-08-30T10:00:00Z",
          }),
        ]),
      },
    });
    await approvedRestore(String(output.receipt));
    await expect(
      readFile(join(input.workDir, "state/unresolved.md"), "utf8"),
    ).resolves.toBe(unresolved);
  });

  it("migrates records, review, submission, completion, and documentation", async () => {
    const input = await fixture();
    const proposal = await addCompleteLifecycle(input);
    const legacyState = await readFile(join(input.workDir, "state.md"), "utf8");
    const legacyReview = await readFile(
      join(input.workDir, "review.md"),
      "utf8",
    );
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const receipt = JSON.parse(await readFile(String(output.receipt), "utf8"));
    expect(receipt.createdPaths).toContain(
      "works/migration-test/artifacts/migrated-state-records/proposal/record-prose.md",
    );
    expect(
      receipt.entries.some(({ path }: { path: string }) =>
        path.includes("/artifacts/"),
      ),
    ).toBe(false);
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({
      stream: {
        phase: "completed",
        records: [
          expect.objectContaining({
            kind: "proposal",
            status: "open",
            affects: ["state:agents:work:migration-test:task:MIG"],
            invalidates: [],
            preserves: [],
            relationshipStatements: expect.arrayContaining([
              expect.objectContaining({
                ref: expect.stringMatching(
                  /:statement:invalidates-[a-f0-9]{12}$/,
                ),
                relation: "invalidates",
                text: "ARC ReviewArea schema and REN codec evidence before repository revision abc123",
              }),
              expect.objectContaining({
                ref: expect.stringMatching(
                  /:statement:preserves-[a-f0-9]{12}$/,
                ),
                relation: "preserves",
                text: "renderer conventions and durable history",
              }),
            ]),
          }),
        ],
        review: {
          areas: expect.arrayContaining([
            expect.objectContaining({ area: "quality" }),
          ]),
        },
        submission: {
          kind: "coding",
          pullRequests: [
            expect.objectContaining({ number: 42, status: "merged" }),
          ],
        },
        completion: {
          promotion: { mode: "paths" },
          outlives: [expect.objectContaining({ owner: "Tech Lead" })],
        },
        documentations: [expect.objectContaining({ title: "State guide" })],
      },
    });
    const carrier = join(
      input.workDir,
      "artifacts/migrated-state-records/proposal/record-prose.md",
    );
    await expect(readFile(carrier, "utf8")).resolves.toBe(proposal);
    await approvedRestore(String(output.receipt));
    await expect(
      readFile(join(input.workDir, "proposals/record-prose.md"), "utf8"),
    ).resolves.toBe(proposal);
    await expect(readFile(carrier)).rejects.toThrow();
    await expect(
      readFile(join(input.workDir, "review.md"), "utf8"),
    ).resolves.toBe(legacyReview);
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toBe(legacyState);
  });

  it("refuses a migrated record carrier collision before backup", async () => {
    const input = await fixture();
    await addCompleteLifecycle(input);
    const carrier = join(
      input.workDir,
      "artifacts/migrated-state-records/proposal/record-prose.md",
    );
    await mkdir(dirname(carrier), { recursive: true });
    await writeFile(carrier, "preexisting\n");
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "carrier collision",
    );
    expect(await readdir(input.backupDir)).toEqual([]);
    await expect(readFile(carrier, "utf8")).resolves.toBe("preexisting\n");
  });

  it("refuses mixed Markdown and MDC stream roots before backup", async () => {
    const input = await fixture();
    await writeFile(join(input.workDir, "state.mdc"), "invalid mixed root\n");
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "mixed state formats",
    );
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("migrates and restores a no-overview legacy-only root", async () => {
    const input = await fixture();
    for (const path of ["overview.md", "environment.md", "traps.md"])
      await rm(join(input.stateRoot, path));
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
    await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
    await expect(
      approvedRestore(String(output.receipt)),
    ).resolves.toMatchObject({ status: "restored" });
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("refuses a no-overview mixed legacy and MDC root before backup", async () => {
    const legacy = await fixture("legacy-stream");
    const canonical = await fixture("canonical-stream");
    const canonicalOutput = await migrateState({
      ...canonical,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    expect(canonicalOutput.status).toBe("migrated");
    for (const path of ["overview.md", "environment.md", "traps.md"])
      await rm(join(legacy.stateRoot, path));
    const preserved = join(legacy.stateRoot, "works", "canonical-stream");
    await cp(canonical.workDir, preserved, { recursive: true });

    await expect(migrateState({ ...legacy, approved: true })).rejects.toThrow(
      "mixed project state formats are ambiguous",
    );
    expect(await readdir(legacy.backupDir)).toEqual([]);
    await expect(
      readFile(join(legacy.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(
      decodeStateDashboard(join(preserved, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
  });

  it("requires an external physical backup directory", async () => {
    const input = await fixture();
    const inRepository = join(dirname(input.stateRoot), "backup");
    await mkdir(inRepository);
    await expect(
      migrateState({ ...input, backupDir: inRepository, approved: true }),
    ).rejects.toThrow("external to the repository");

    const link = join(tmpdir(), `essential-backup-link-${crypto.randomUUID()}`);
    roots.push(link);
    await symlink(input.backupDir, link);
    await expect(
      migrateState({ ...input, backupDir: link, approved: true }),
    ).rejects.toThrow(/symbolic link|symlink-mediated/);
  });

  it.each([
    "after-backup",
    "before-write-0",
    "after-write-0",
    "before-project-root",
    "after-project-root",
    "before-legacy-removal",
  ])("rolls back fully at failpoint %s", async (failpoint) => {
    const input = await fixture();
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint,
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("injected failure");
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.stateRoot, "overview.md"), "utf8"),
    ).resolves.toContain("# State overview");
    await expect(
      readFile(join(input.stateRoot, "overview.mdc")),
    ).rejects.toThrow();
  });

  it("refuses a legacy mutation between staging and lease acquisition", async () => {
    const input = await fixture();
    const statePath = join(input.workDir, "state.md");
    const expected = Buffer.from(await readFile(statePath));
    expected[expected.length - 1] ^= 1;
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint: "mutate-before-lease",
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("legacy state changed after preflight parsing");
    await expect(readFile(statePath)).resolves.toEqual(expected);
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.stateRoot, "overview.mdc")),
    ).rejects.toThrow();
  });

  it("refuses an optional carrier added between staging and lease acquisition", async () => {
    const input = await fixture();
    const revisions =
      "# Revisions\n\n- 2026-08-30T10:00:00Z — Charter revision `1`; approved by user; establishes the charter.\n- 2026-08-30T10:00:00Z — Plan revision `1`; approved by user; establishes the plan.\n";
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint: "add-carrier-before-lease",
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("legacy state changed after preflight parsing");
    await expect(
      readFile(join(input.workDir, "state/revisions.md"), "utf8"),
    ).resolves.toBe(revisions);
    expect(await readdir(input.backupDir)).toEqual([]);
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.stateRoot, "overview.mdc")),
    ).rejects.toThrow();
  });

  it("rolls a published record carrier back with the graph", async () => {
    const input = await fixture();
    const proposal = await addCompleteLifecycle(input);
    const carrier = join(
      input.workDir,
      "artifacts/migrated-state-records/proposal/record-prose.md",
    );
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint: "after-write-0",
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("injected failure");
    await expect(readFile(carrier)).rejects.toThrow();
    await expect(
      readFile(join(input.workDir, "proposals/record-prose.md"), "utf8"),
    ).resolves.toBe(proposal);
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("refuses ambiguous legacy metadata before backup", async () => {
    const input = await fixture();
    await writeFile(
      join(input.workDir, "state.md"),
      `${await readFile(join(input.workDir, "state.md"), "utf8")}\n- Work ID: \`migration-test\`\n`,
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "ambiguous duplicate metadata",
    );
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
  });

  it("refuses reordered task Owner and Evidence columns", async () => {
    const input = await fixture();
    const path = join(input.workDir, "state.md");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |",
        "| ID | Mark | Status | Task | Depends on | Required | Acceptance | Evidence / next action | Owner |",
      ),
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "noncanonical table header: Tasks",
    );
    expect(await readdir(input.backupDir)).toEqual([]);
    await expect(readFile(path, "utf8")).resolves.toContain("# Work state");
  });

  it.each([
    {
      scope: "work",
      path: "goal.md",
      from: "| ID | Criterion | Acceptance evidence |",
      to: "| ID | Outcome | Acceptance evidence |",
      heading: "Success criteria",
    },
    {
      scope: "work",
      path: "state.md",
      from: "| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |",
      to: "| ID | Mark | Status | Summary | Depends on | Required | Acceptance | Owner | Evidence / next action |",
      heading: "Tasks",
    },
    {
      scope: "state",
      path: "environment.md",
      from: "| Claim | Observed at |",
      to: "| Claim | Timestamp |",
      heading: "Claims",
    },
    {
      scope: "state",
      path: "traps.md",
      from: "| Symptom | Cause | Action | Verified at |",
      to: "| Symptom | Cause | Resolution | Verified at |",
      heading: "Traps",
    },
  ])("refuses renamed $heading headers", async (change) => {
    const input = await fixture();
    const root = change.scope === "work" ? input.workDir : input.stateRoot;
    const path = join(root, change.path);
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(change.from, change.to),
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      `noncanonical table header: ${change.heading}`,
    );
    expect(await readdir(input.backupDir)).toEqual([]);
  });

  it("refuses a live foreign coordinator lease without changing state", async () => {
    const input = await fixture();
    await writeFile(
      join(input.workDir, "lease.json"),
      JSON.stringify({
        token_sha256: "foreign",
        expires_at_epoch: Math.floor(Date.now() / 1000) + 3_600,
      }),
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "state-lease failed",
    );
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
  });

  it("releases earlier migration leases when a later acquisition fails", async () => {
    const input = await fixture("a-open");
    const lockedDirectory = join(input.stateRoot, "works", "z-locked");
    await copyLegacyWork(input.workDir, lockedDirectory, "a-open", "z-locked");
    await completeArchivedLegacyWork(lockedDirectory);
    await addOverviewStream(input.stateRoot, "z-locked", "completed");
    await writeFile(
      join(lockedDirectory, "lease.json"),
      JSON.stringify({
        token_sha256: "foreign",
        expires_at_epoch: Math.floor(Date.now() / 1000) + 3_600,
      }),
    );
    await expect(migrateState({ ...input, approved: true })).rejects.toThrow(
      "state-lease failed",
    );
    await expect(readFile(join(input.workDir, "lease.json"))).rejects.toThrow();
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("Work ID: `a-open`");
  });

  it("refuses restore when a backup hash no longer matches", async () => {
    const input = await fixture();
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const receiptPath = String(output.receipt);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    const backupPath = join(receipt.backupRoot, receipt.entries[0].path);
    const tampered = await readFile(backupPath);
    tampered[0] ^= 1;
    await writeFile(backupPath, tampered);
    await expect(restoreState(receiptPath)).rejects.toThrow(
      "backup hash mismatch",
    );
  });

  it("refuses restore when a backup size no longer matches", async () => {
    const input = await fixture();
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const receiptPath = String(output.receipt);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.entries[0].size += 1;
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await expect(restoreState(receiptPath)).rejects.toThrow(
      "backup size mismatch",
    );
  });

  it("requires restore approval bound to the diagnosed receipt", async () => {
    const input = await fixture();
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const receiptPath = String(output.receipt);
    const diagnosis = await restoreState(receiptPath);
    expect(diagnosis).toMatchObject({
      status: "approval_required",
      receipt: receiptPath,
      approval: expect.stringMatching(/^[a-f0-9]{64}$/),
      inventory: expect.arrayContaining([
        expect.objectContaining({
          path: "overview.md",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          size: expect.any(Number),
        }),
      ]),
    });
    await expect(
      restoreState(receiptPath, { approval: "wrong-inventory" }),
    ).rejects.toThrow("does not match diagnosed receipt");
    await expect(
      decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
    ).resolves.toMatchObject({ kind: "project" });
    await expect(
      readFile(join(input.stateRoot, "overview.md")),
    ).rejects.toThrow();
  });

  it("rolls migration back when structural Doctor rejects the new graph", async () => {
    const input = await fixture();
    await expect(
      migrateState({
        ...input,
        approved: true,
        failpoint: "doctor-invalid",
        now: () => "2026-08-30T12:00:00Z",
      }),
    ).rejects.toThrow("structural Doctor rejected staged canonical graph");
    await expect(
      readFile(join(input.workDir, "state.md"), "utf8"),
    ).resolves.toContain("# Work state");
    await expect(readFile(join(input.workDir, "state.mdc"))).rejects.toThrow();
    await expect(
      readFile(join(input.stateRoot, "overview.md"), "utf8"),
    ).resolves.toContain("# State overview");
    await expect(
      readFile(join(input.stateRoot, "overview.mdc")),
    ).rejects.toThrow();
  });

  it("rolls restore back when structural Doctor rejects restored state", async () => {
    const input = await fixture();
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    await expect(
      approvedRestore(String(output.receipt), {
        failpoint: "post-doctor-invalid",
      }),
    ).rejects.toThrow("structural Doctor rejected restored legacy graph");
    await expect(
      decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
    ).resolves.toMatchObject({ kind: "project" });
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
    await expect(
      readFile(join(input.stateRoot, "overview.md")),
    ).rejects.toThrow();
    await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
  });

  it.each(["after-children", "after-project-root", "after-mdc-removal"])(
    "rolls restore I/O back to the complete MDC graph at %s",
    async (failpoint) => {
      const input = await fixture();
      const output = await migrateState({
        ...input,
        approved: true,
        now: () => "2026-08-30T12:00:00Z",
      });
      await expect(
        approvedRestore(String(output.receipt), { failpoint }),
      ).rejects.toThrow("injected restore failure");
      await expect(
        decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
      ).resolves.toMatchObject({ kind: "project" });
      await expect(
        decodeStateDashboard(join(input.workDir, "state.mdc")),
      ).resolves.toMatchObject({ kind: "stream" });
      await expect(
        readFile(join(input.stateRoot, "overview.md")),
      ).rejects.toThrow();
      await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
      expect(
        (await readdir(input.stateRoot)).some((name) =>
          name.includes(".migration-"),
        ),
      ).toBe(false);
    },
  );

  it("restores a record carrier when restore I/O rolls back", async () => {
    const input = await fixture();
    const proposal = await addCompleteLifecycle(input);
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    const carrier = join(
      input.workDir,
      "artifacts/migrated-state-records/proposal/record-prose.md",
    );
    await expect(
      approvedRestore(String(output.receipt), {
        failpoint: "after-mdc-removal",
      }),
    ).rejects.toThrow("injected restore failure");
    await expect(readFile(carrier, "utf8")).resolves.toBe(proposal);
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
    await expect(readFile(join(input.workDir, "state.md"))).rejects.toThrow();
  });

  it("releases earlier restore leases when a later acquisition fails", async () => {
    const input = await fixture("a-open");
    const secondDirectory = join(input.stateRoot, "works", "z-locked");
    await copyLegacyWork(input.workDir, secondDirectory, "a-open", "z-locked");
    await completeArchivedLegacyWork(secondDirectory);
    await addOverviewStream(input.stateRoot, "z-locked", "completed");
    const output = await migrateState({
      ...input,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    await writeFile(
      join(secondDirectory, "lease.json"),
      JSON.stringify({
        token_sha256: "foreign",
        expires_at_epoch: Math.floor(Date.now() / 1000) + 3_600,
      }),
    );
    await expect(approvedRestore(String(output.receipt))).rejects.toThrow(
      "state-lease failed",
    );
    await expect(readFile(join(input.workDir, "lease.json"))).rejects.toThrow();
    await expect(
      decodeStateDashboard(join(input.workDir, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream" });
  });

  it("migrates and restores live and archived streams as one project graph", async () => {
    const input = await fixture("live-stream");
    const archivedDirectory = join(input.stateRoot, "archive", "old-stream");
    await copyLegacyWork(
      input.workDir,
      archivedDirectory,
      "live-stream",
      "old-stream",
    );
    await completeArchivedLegacyWork(archivedDirectory);

    const output = await migrateState({
      stateRoot: input.stateRoot,
      backupDir: input.backupDir,
      approved: true,
      now: () => "2026-08-30T12:00:00Z",
    });
    expect(output).toMatchObject({
      status: "migrated",
      inventory: expect.arrayContaining([
        expect.objectContaining({
          workId: "live-stream",
          workDir: input.workDir,
        }),
        expect.objectContaining({
          workId: "old-stream",
          workDir: archivedDirectory,
        }),
      ]),
    });
    await expect(
      decodeStateDashboard(join(input.stateRoot, "overview.mdc")),
    ).resolves.toMatchObject({
      kind: "project",
      streams: expect.arrayContaining([
        expect.objectContaining({ workId: "live-stream" }),
        expect.objectContaining({ workId: "old-stream" }),
      ]),
    });
    await expect(
      decodeStateDashboard(join(archivedDirectory, "state.mdc")),
    ).resolves.toMatchObject({ kind: "stream", stream: { phase: "archived" } });

    const restored = await approvedRestore(String(output.receipt));
    expect(restored).toMatchObject({
      status: "restored",
      workIds: expect.arrayContaining(["live-stream", "old-stream"]),
    });
    await expect(
      readFile(join(archivedDirectory, "state.md"), "utf8"),
    ).resolves.toContain("Work ID: `old-stream`");
    await expect(
      readFile(join(archivedDirectory, "state.mdc")),
    ).rejects.toThrow();
  });
});
