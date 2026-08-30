import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const executable = join(import.meta.dirname, "state-doctor");
const roots: string[] = [];
async function fixture(): Promise<{
  base: string;
  stateDir: string;
  workDir: string;
}> {
  const base = await mkdtemp(join(tmpdir(), "state-doctor-mdc-"));
  roots.push(base);
  const stateDir = join(base, ".state");
  const workDir = join(stateDir, "works", "demo");
  await mkdir(workDir, { recursive: true });
  await chmod(executable, 0o755);
  return { base, stateDir, workDir };
}
function run(...args: string[]) {
  const result = spawnSync(executable, [...args, "--json"], {
    encoding: "utf8",
  });
  return { code: result.status, output: JSON.parse(result.stdout) };
}
async function valid(
  workDir: string,
  id = "demo",
  phase: "planned" | "archived" = "planned",
) {
  const completion =
    phase === "archived"
      ? `, submission: { ref: 'state:agents:work:${id}:submission', kind: coding, pullRequests: [{ ref: 'state:agents:work:${id}:pr:1', number: 1, url: 'https://example.test/pr/1', repository: agents, headRevision: abc, status: merged, mergedRevision: abc }], deliverables: [] }, completion: { ref: 'state:agents:work:${id}:completion', completedAt: '2026-08-30T12:00:00Z', landing: [{ ref: 'state:agents:work:${id}:evidence:landing', summary: landed, locator: { uri: repository, revision: abc }, inputs: [] }], promotion: { ref: 'state:agents:work:${id}:promotion', mode: 'not-required', paths: [], evidence: { ref: 'state:agents:work:${id}:evidence:promotion', summary: none, locator: { uri: repository, revision: abc }, inputs: [] } }, outlives: [], decisionDispositions: [] }`
      : "";
  await writeFile(
    join(workDir, "state.mdc"),
    `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:${id}\nworkId: ${id}\n---\n{{ type: state.stream, ref: 'state:agents:work:${id}', projectRef: 'state:agents', phase: ${phase}, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: []${completion} }}\n- ${id}\n`,
  );
}
async function linked(workDir: string, href: string) {
  await writeFile(
    join(workDir, "state.mdc"),
    `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:demo\nworkId: demo\n---\n{{ type: state.stream, ref: 'state:agents:work:demo', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- demo\n{{ type: state.source, ref: 'state:agents:work:demo:source:tasks', href: '${href}', documentKind: tasks }}\n- ${href}\n`,
  );
}
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("MDC structural Doctor", () => {
  it("validates a selected MDC stream", async () => {
    const { workDir } = await fixture();
    await valid(workDir);
    expect(run("--work-dir", workDir)).toMatchObject({
      code: 0,
      output: { status: "ok", findings: [] },
    });
  });
  it("rejects a mixed legacy and MDC layout without parsing Markdown", async () => {
    const { workDir } = await fixture();
    await valid(workDir);
    await writeFile(join(workDir, "state.md"), "malformed legacy text");
    expect(run("--work-dir", workDir).output).toMatchObject({
      status: "invalid",
    });
    expect(run("--work-dir", workDir, "--strict").code).toBe(1);
  });

  it("returns migration_required for a legacy-only layout", async () => {
    const { workDir } = await fixture();
    await writeFile(join(workDir, "state.md"), "malformed legacy text");
    expect(run("--work-dir", workDir).output).toMatchObject({
      status: "migration_required",
    });
  });
  it("reports shared-codec failures", async () => {
    const { workDir } = await fixture();
    await writeFile(
      join(workDir, "state.mdc"),
      "---\nschema: wrong\nkind: stream\nref: bad\n---\n",
    );
    expect(run("--work-dir", workDir, "--strict")).toMatchObject({
      code: 1,
      output: { status: "invalid" },
    });
  });
  it("checks live and archived roots", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir);
    const archive = join(stateDir, "archive", "old");
    await mkdir(archive, { recursive: true });
    await valid(archive, "old", "archived");
    const output = run("--state-dir", stateDir).output;
    expect(output).toMatchObject({ status: "ok" });
    expect(output.checked).toHaveLength(2);
  });
  it("rejects a non-archived stream under archive membership", async () => {
    const { stateDir } = await fixture();
    const archive = join(stateDir, "archive", "old");
    await mkdir(archive, { recursive: true });
    await valid(archive, "old");
    expect(run("--state-dir", stateDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "archive membership requires stream phase archived",
        }),
      ]),
    );
  });

  it("rejects an archived stream under live works membership", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir, "demo", "archived");
    expect(run("--state-dir", stateDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "live works membership cannot contain stream phase archived",
        }),
      ]),
    );
  });
  it("rejects the retired bootstrap mutation", async () => {
    const { stateDir } = await fixture();
    expect(run("--state-dir", stateDir, "--bootstrap")).toMatchObject({
      code: 2,
      output: { status: "invalid" },
    });
  });

  it("reports unreachable MDC documents", async () => {
    const { workDir } = await fixture();
    await valid(workDir);
    await writeFile(
      join(workDir, "orphan.mdc"),
      "---\nschema: essential.state/v1\nkind: tasks\nref: state:agents:work:demo:document:tasks\nworkRef: state:agents:work:demo\n---\n",
    );
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("unreachable"),
        }),
      ]),
    );
  });

  it("rejects a rogue stream document at the state root", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir);
    await writeFile(
      join(stateDir, "rogue.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:rogue\nworkId: rogue\n---\n{{ type: state.stream, ref: 'state:agents:work:rogue', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- rogue\n`,
    );
    expect(run("--state-dir", stateDir).output).toMatchObject({
      status: "invalid",
      findings: expect.arrayContaining([
        expect.objectContaining({
          document: join(stateDir, "rogue.mdc"),
          message: expect.stringContaining("unreachable"),
        }),
      ]),
    });
  });

  it("rejects a project source targeting a non-root stream child", async () => {
    const { stateDir, workDir } = await fixture();
    await writeFile(
      join(stateDir, "overview.mdc"),
      `---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n{{ type: state.source, ref: 'state:agents:source:demo', href: works/demo/child.mdc, documentKind: stream }}\n- works/demo/child.mdc\n`,
    );
    await writeFile(
      join(workDir, "child.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:demo\nworkId: demo\n---\n{{ type: state.stream, ref: 'state:agents:work:demo', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- demo\n`,
    );
    expect(run("--state-dir", stateDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("graph.stream-root"),
        }),
      ]),
    );
  });

  it("rejects a canonical path whose stream identity names another work", async () => {
    const { workDir } = await fixture();
    await writeFile(
      join(workDir, "state.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:other\nworkId: other\n---\n{{ type: state.stream, ref: 'state:agents:work:other', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- other\n`,
    );
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "stream identity does not match its owning directory",
        }),
      ]),
    );
  });

  it("reports a supporting document owned by another work directory", async () => {
    const { workDir } = await fixture();
    await writeFile(
      join(workDir, "state.mdc"),
      `---\nschema: essential.state/v1\nkind: stream\nref: state:agents:work:demo\nworkId: demo\n---\n{{ type: state.stream, ref: 'state:agents:work:demo', projectRef: 'state:agents', phase: planned, charterStatus: absent, charterRevision: 1, planRevision: 1, stateRevision: 1, writtenUnder: abc, syncState: none, reviewState: none, updatedAt: '2026-08-30T12:00:00Z', tasks: [], events: [], revisions: [], questions: [], records: [], documentations: [] }}\n- demo\n{{ type: state.source, ref: 'state:agents:work:demo:source:tasks', href: tasks.mdc, documentKind: tasks }}\n- tasks.mdc\n`,
    );
    await writeFile(
      join(workDir, "tasks.mdc"),
      "---\nschema: essential.state/v1\nkind: tasks\nref: state:agents:work:other:document:tasks\nworkRef: state:agents:work:other\n---\n",
    );
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("workRef does not match"),
        }),
      ]),
    );
  });

  it("does not traverse an escaping state.source href", async () => {
    const { stateDir, workDir } = await fixture();
    await linked(workDir, "../../../outside.mdc");
    await writeFile(join(stateDir, "outside.mdc"), "outside");
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("POSIX relative .mdc"),
        }),
      ]),
    );
  });

  it("does not traverse an internal symlink", async () => {
    const { workDir } = await fixture();
    await linked(workDir, "tasks.mdc");
    await writeFile(
      join(workDir, "tasks-real.mdc"),
      "---\nschema: essential.state/v1\nkind: tasks\nref: state:agents:work:demo:document:tasks\nworkRef: state:agents:work:demo\n---\n",
    );
    await symlink("tasks-real.mdc", join(workDir, "tasks.mdc"));
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("symlink"),
        }),
      ]),
    );
  });

  it("rejects non-MDC state.source hrefs without treating locators as graph links", async () => {
    const { workDir } = await fixture();
    await linked(workDir, "notes.txt");
    await writeFile(join(workDir, "notes.txt"), "not a graph document");
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("POSIX relative .mdc"),
        }),
      ]),
    );
  });

  it("reports stale leases as advisory and strict-failing", async () => {
    const { workDir } = await fixture();
    await valid(workDir);
    await writeFile(
      join(workDir, "lease.json"),
      JSON.stringify({ work_id: "demo", expires_at_epoch: 1 }),
    );
    expect(run("--work-dir", workDir)).toMatchObject({
      code: 0,
      output: { status: "advisory" },
    });
    expect(run("--work-dir", workDir, "--strict").code).toBe(1);
  });

  it("reports corrupt lease metadata", async () => {
    const { workDir } = await fixture();
    await valid(workDir);
    await writeFile(join(workDir, "lease.json"), "not-json");
    expect(run("--work-dir", workDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: "lease", severity: "error" }),
      ]),
    );
  });

  it("rejects duplicate live and archive membership", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir);
    const archived = join(stateDir, "archive", "demo");
    await mkdir(archived, { recursive: true });
    await valid(archived);
    expect(run("--state-dir", stateDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("both live and archive"),
        }),
      ]),
    );
  });

  it("uses repository-root for default state and ADR integrity", async () => {
    const { base, workDir } = await fixture();
    await valid(workDir);
    const decisions = join(base, "docs", "architecture", "decisions");
    await mkdir(decisions, { recursive: true });
    await writeFile(
      join(decisions, "0001-choice.md"),
      "# ADR-0002: Mismatched\n\nDecision body.\n",
    );
    await writeFile(
      join(base, "docs", "architecture", "README.md"),
      "# Architecture\n",
    );
    const result = run("--repository-root", base);
    expect(result.output.checked).toEqual([
      await realpath(join(workDir, "state.mdc")),
    ]);
    expect(result.output.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ check: "adr" })]),
    );
  });

  it("reports project overview membership drift", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir);
    await writeFile(
      join(stateDir, "overview.mdc"),
      "---\nschema: essential.state/v1\nkind: project\nref: state:agents\n---\n{{ type: state.project, ref: 'state:agents', slug: agents, goal: goal, requirements: [], specification: { state: none, entries: [] }, updatedAt: '2026-08-30T12:00:00Z' }}\n- Agents\n",
    );
    expect(run("--state-dir", stateDir).output.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "state-overview",
          work: "demo",
        }),
      ]),
    );
  });

  it("rejects selected state outside repository-root", async () => {
    const first = await fixture();
    const second = await fixture();
    await valid(second.workDir);
    expect(
      run("--repository-root", first.base, "--work-dir", second.workDir).output,
    ).toMatchObject({ status: "invalid" });
  });

  it("returns nonzero not_found for an unknown selected work id", async () => {
    const { stateDir, workDir } = await fixture();
    await valid(workDir);
    expect(run("--state-dir", stateDir, "--work-id", "missing")).toMatchObject({
      code: 2,
      output: { status: "not_found", checked: [] },
    });
  });
});
