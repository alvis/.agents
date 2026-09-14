import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = import.meta.dirname;
const essential = resolve(scripts, "../../..");
const doctor = join(scripts, "state-doctor");
const resolver = join(essential, "scripts/resolve-state-workspace");
const header =
  "| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";

type Finding = {
  check: string;
  fix?: string;
  message: string;
  severity: "error" | "info" | "warning";
  work?: string;
};

function row(
  taskId: string,
  mark = "-",
  status = "planned",
  depends = "—",
  required = "yes",
  evidence = "Pending.",
): string {
  return `| ${taskId} | ${mark} | ${status} | Do ${taskId}. [targets: none] | ${depends} | ${required} | Done when done. | PM | ${evidence} |\n`;
}

class Workspace {
  readonly workDir: string;
  private constructor(readonly root: string) {
    this.workDir = join(root, ".state/works/demo");
  }
  static async create(): Promise<Workspace> {
    const value = new Workspace(
      await mkdtemp(join(tmpdir(), "state-doctor-test-")),
    );
    await mkdir(join(value.workDir, "state"), { recursive: true });
    await value.writeCharter();
    return value;
  }
  async remove(): Promise<void> {
    await rm(this.root, { force: true, recursive: true });
  }
  async writeCharter(provenance = "approved"): Promise<void> {
    const path = join(this.workDir, "goal.md");
    if (provenance === "-") {
      await unlink(path).catch(() => undefined);
      return;
    }
    await writeFile(
      path,
      `# Charter\n\n- Charter: \`${provenance}\`\n- Charter revision: \`1\`\n\n## Goal\n\nDemonstrate the doctor.\n\n## Specification provenance\n\n- Source kind: \`none\`\n- Canonical specification: None\n- Accepted revision/base: None\n- Local materialization: None\n- Materialization receipt: None\n- Last verification status: \`not-applicable\`\n- Last verified at: None\n`,
    );
  }
  async writeState(
    rows: string,
    metadata = "",
    lifecycle = "working",
  ): Promise<void> {
    await writeFile(
      join(this.workDir, "state.md"),
      `# Work state\n\n- State role: \`root\`\n- Work ID: \`demo\`\n- Lifecycle status: \`${lifecycle}\`\n- State revision: \`3\`\n${metadata}\n## Tasks\n\n${header}${rows}`,
    );
  }
  run(...args: string[]): {
    code: number;
    findings: Finding[];
    stderr: string;
  } {
    const result = spawnSync(
      doctor,
      ["--work-dir", this.workDir, "--json", ...args],
      { encoding: "utf8" },
    );
    return {
      code: result.status ?? 1,
      findings: JSON.parse(result.stdout).findings,
      stderr: result.stderr,
    };
  }
}

const checks = (findings: Finding[]): Set<string> =>
  new Set(findings.map(({ check }) => check));

async function writeEffectiveAdr(
  root: string,
  name = "adr-1-choice.md",
  body = "",
): Promise<string> {
  const architecture = join(root, "docs/architecture");
  const decisions = join(architecture, "decisions/runtime");
  await mkdir(decisions, { recursive: true });
  const path = join(decisions, name);
  const prefix = /^adr-(\d+)-/.exec(name)?.[1] ?? "1";
  await writeFile(
    path,
    `# ADR-${prefix}: Choice\n\n- Status: \`Accepted\`\n\n${body}`,
  );
  await writeFile(
    join(architecture, "README.md"),
    `# Architecture\n\n| Document | Status |\n| --- | --- |\n| [ADR](decisions/runtime/${name}) | Accepted |\n`,
  );
  return path;
}

async function writeArchivedAdr(
  root: string,
  body: string,
  successorTitle = "Choice",
): Promise<void> {
  const current = await writeEffectiveAdr(
    root,
    "adr-2-current.md",
    "The current choice.\n",
  );
  const archived = join(current, "../../superseded/runtime");
  await mkdir(archived, { recursive: true });
  await writeFile(
    join(archived, "adr-1-old-choice.md"),
    [
      "> **Status:** Superseded",
      ">",
      `> **Superseded by:** [ADR-2 — ${successorTitle}](../../runtime/adr-2-current.md)`,
      ">",
      "> **What changed:** The complete change replaced the old choice.",
      "",
      body,
    ].join("\n"),
  );
}

async function writeAdrIndex(
  workspace: Workspace,
  index: string,
  name = "adr-1-current.md",
  title = "Current",
): Promise<void> {
  const architecture = join(workspace.root, "docs/architecture");
  const decisions = join(architecture, "decisions/runtime");
  await mkdir(decisions, { recursive: true });
  await writeFile(
    join(decisions, name),
    `# ADR-1: ${title}\n\n- Status: \`Accepted\`\n`,
  );
  await writeFile(join(architecture, "README.md"), index);
}

function matchingFindings(
  workspace: Workspace,
  check: string,
  message: string,
): Finding[] {
  return workspace
    .run()
    .findings.filter(
      (finding) => finding.check === check && finding.message.includes(message),
    );
}

function expectFixes(findings: Finding[]): void {
  expect(findings.length).toBeGreaterThan(0);
  expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
}

describe("state and task-table contracts", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await Workspace.create();
  });
  afterEach(async () => {
    await workspace.remove();
  });

  it("accepts a clean dependency chain", async () => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "yes", "Merged in abc123.") +
        row("BBB", "-", "planned", "AAA"),
    );
    expect(workspace.run()).toMatchObject({ code: 0, findings: [] });
  });
  it("accepts reviewing as lifecycle vocabulary", async () => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "yes", "Merged in abc123."),
      "",
      "reviewing",
    );
    expect(workspace.run()).toMatchObject({ code: 0, findings: [] });
  });
  it("flags the retired complete lifecycle", async () => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "yes", "Merged in abc123."),
      "",
      "complete",
    );
    expect(checks(workspace.run().findings)).toContain("lifecycle");
  });
  it("reports malformed and duplicate task IDs", async () => {
    await workspace.writeState(row("AAAA") + row("BBB") + row("BBB"));
    const messages = workspace.run().findings.map(({ message }) => message);
    expect(
      messages.some((message) => message.includes("malformed task ID")),
    ).toBe(true);
    expect(
      messages.some((message) => message.includes("duplicate task ID")),
    ).toBe(true);
  });
  it("reports a dangling dependency", async () => {
    await workspace.writeState(row("AAA", "-", "planned", "ZZZ"));
    expect(checks(workspace.run().findings)).toContain("dependency");
  });
  it("reports a dependency cycle", async () => {
    await workspace.writeState(
      row("AAA", "-", "planned", "BBB") + row("BBB", "-", "planned", "AAA"),
    );
    expect(
      workspace.run().findings.some(({ message }) => message.includes("cycle")),
    ).toBe(true);
  });
  it("reports contradictory completion mark and status", async () => {
    await workspace.writeState(row("AAA", "✓", "working"));
    expect(checks(workspace.run().findings)).toContain("mark-status");
  });
  it("requires completion evidence", async () => {
    await workspace.writeState(row("AAA", "✓", "done", "—", "yes", ""));
    expect(checks(workspace.run().findings)).toContain("evidence");
  });
  it("requires failed-task attempt annotations", async () => {
    await workspace.writeState(
      row("AAA", "X", "failed", "—", "yes", "it broke"),
    );
    expect(checks(workspace.run().findings)).toContain("evidence");
  });
  it("requires a blocked-task unblock action", async () => {
    await workspace.writeState(
      row("AAA", "!", "blocked", "—", "yes", "waiting"),
    );
    expect(checks(workspace.run().findings)).toContain("evidence");
  });
  it("rejects cancellation of a required task", async () => {
    await workspace.writeState(row("AAA", "⊘", "cancelled"));
    expect(checks(workspace.run().findings)).toContain("roll-up");
  });
  it("rejects a completed parent with an unfinished required child", async () => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "yes", "rolled up") + row("AAA01"),
    );
    expect(
      workspace
        .run()
        .findings.some(
          ({ check, message }) =>
            check === "roll-up" && message.includes("AAA"),
        ),
    ).toBe(true);
  });
  it("returns nonzero in strict mode only for errors", async () => {
    await workspace.writeState(row("AAA", "✓", "working"));
    expect(workspace.run().code).toBe(0);
    expect(workspace.run("--strict").code).toBe(1);
  });
  it("treats free-form state as informational layout plus metadata warning", async () => {
    await writeFile(
      join(workspace.workDir, "state.md"),
      "totally free-form notes\n",
    );
    const result = workspace.run("--strict");
    expect(result.code).toBe(0);
    expect(
      result.findings.find(({ check }) => check === "layout")?.severity,
    ).toBe("info");
    expect(
      new Set(
        result.findings
          .filter(({ severity }) => severity === "warning")
          .map(({ check }) => check),
      ),
    ).toEqual(new Set(["state-metadata"]));
  });
});

describe("ADR archival integrity", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await Workspace.create();
    await workspace.writeState(row("AAA"));
  });
  afterEach(async () => {
    await workspace.remove();
  });

  it("should reject an unpaired angle-bracket successor destination and offer a fix", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
    );
    const archived = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      archived,
      (await readFile(archived, "utf8")).replace(
        "(../../runtime/adr-2-current.md)",
        "(<../../runtime/adr-2-current.md)",
      ),
    );
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-superseded" && message.includes("successor link"),
      );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });

  it("should decode character references in a successor title", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      "R&amp;D",
    );
    await writeFile(
      join(
        workspace.root,
        "docs/architecture/decisions/runtime/adr-2-current.md",
      ),
      "# ADR-2: R&D\n\n- Status: `Accepted`\n\nThe current choice.\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it.each([
    ["missing original body", "", "original canonical ADR heading and body"],
    [
      "empty raw HTML body",
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n<div></div>\n",
      "substantive decision content",
    ],
    [
      "metadata-only body",
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n",
      "substantive decision content",
    ],
    [
      "thematic-break-only body",
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n---\n",
      "substantive decision content",
    ],
  ])("should reject %s", async (_scenario, body, expectedMessage) => {
    await writeArchivedAdr(workspace.root, body);
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-superseded" && message.includes(expectedMessage),
      );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });

  it.each(["", "- Status: `Proposed`"])(
    "should require the archived original status to be Accepted for %j",
    async (originalStatus) => {
      const metadata = originalStatus ? `${originalStatus}\n\n` : "";
      await writeArchivedAdr(
        workspace.root,
        `# ADR-1: Old choice\n\n${metadata}## Decision\n\nThe original choice.\n`,
      );
      const findings = workspace
        .run()
        .findings.filter(
          ({ check, message }) =>
            check === "adr-superseded" &&
            message.includes("original Accepted status"),
        );
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
    },
  );

  it.each(["+", "1.", "2)"])(
    "should accept %s as an original-status list marker",
    async (marker) => {
      await writeArchivedAdr(
        workspace.root,
        `# ADR-1: Old choice\n\n${marker} Status: \`Accepted\`\n\n## Decision\n\nThe original choice.\n`,
      );
      expect(
        workspace
          .run()
          .findings.some(
            ({ check, message }) =>
              check === "adr-superseded" &&
              message.includes("original Accepted status"),
          ),
      ).toBe(false);
    },
  );

  it("should ignore indented original-status examples", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n## Decision\n\nThe original choice.\n    - Status: `Accepted`\n",
    );
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-superseded" &&
          message.includes("original Accepted status"),
      );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });

  it("should require numeric ADR identity uniqueness across current and archive", async () => {
    await writeArchivedAdr(workspace.root, "> retained historical body\n");
    const decisions = join(
      workspace.root,
      "docs/architecture/decisions/runtime",
    );
    await writeFile(
      join(decisions, "adr-1-cache.md"),
      "# ADR-1: Cache\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      "| [ADR-1](decisions/runtime/adr-1-cache.md) | Accepted |\n| [ADR-2](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-integrity" &&
          message.includes("numeric identity 1 is duplicated"),
      );
    expect(new Set(findings.map(({ work }) => work))).toEqual(
      new Set([
        "docs/architecture/decisions/runtime/adr-1-cache.md",
        "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
      ]),
    );
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
    expect(
      findings.find(({ work }) => work?.includes("superseded"))?.fix,
    ).toContain("archived H1");
  });

  it("should require heading identity to match current and archived filenames", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-4: Old choice\n\n- Status: `Accepted`\n",
    );
    const decisions = join(
      workspace.root,
      "docs/architecture/decisions/runtime",
    );
    await writeFile(
      join(decisions, "adr-2-current.md"),
      "# ADR-1: Current\n\n- Status: `Accepted`\n",
    );
    await rename(
      join(decisions, "../superseded/runtime/adr-1-old-choice.md"),
      join(decisions, "../superseded/runtime/adr-3-old-choice.md"),
    );
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-integrity" &&
          message.includes("does not match filename prefix"),
      );
    expect(new Set(findings.map(({ work }) => work))).toEqual(
      new Set([
        "docs/architecture/decisions/runtime/adr-2-current.md",
        "docs/architecture/decisions/superseded/runtime/adr-3-old-choice.md",
      ]),
    );
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
    expect(
      findings.find(({ work }) => work?.includes("superseded"))?.fix,
    ).toContain("historical body");
  });

  it("should allow literal TODO prose and fenced or indented code examples", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "## Context\n\nThe linter rejects literal TODO and TBD comments.\n\n```yaml\nexample: TODO\n```\n\n~~~yaml\nexample: TBD\n~~~\n    TODO: replace-me-at-runtime\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it.each([
    ["nested list", "- Follow-up:\n    - TODO: choose provider\n"],
    [
      "continued nested list",
      "- Follow-up:\n  Additional context.\n    - TODO: choose provider\n",
    ],
    [
      "four-space list continuation",
      "- Follow-up:\n    TODO: choose provider\n",
    ],
    ["four-space lazy paragraph", "Context\n    TODO: choose provider\n"],
    ["blockquote", "> TODO: choose provider\n"],
    ["ordered list 1", "1. TODO: choose provider\n"],
    ["ordered list 2", "2) TODO: choose provider\n"],
    ["plus list", "+ TODO: choose provider\n"],
  ])("should detect a placeholder in %s content", async (_scenario, body) => {
    await writeEffectiveAdr(workspace.root, "adr-1-choice.md", body);
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-integrity" &&
          message.includes("unresolved TODO/TBD placeholder"),
      );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });

  it("should ignore indented code inside list content", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "- Runtime example:\n      TODO: supplied-by-runtime\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it.each(["+", "1.", "2)"])(
    "should accept %s as an effective-status list marker",
    async (marker) => {
      const path = await writeEffectiveAdr(workspace.root);
      await writeFile(
        path,
        `# ADR-1: Choice\n\n${marker} Status: \`Accepted\`\n`,
      );
      expect(
        workspace
          .run()
          .findings.some(
            ({ check, message }) =>
              check === "adr-integrity" &&
              message.includes("Accepted status declaration"),
          ),
      ).toBe(false);
    },
  );

  it.each([
    [
      "contradictory index status",
      "| Document | Status |\n| --- | --- |\n| [ADR-1](decisions/runtime/adr-1-current.md) | Superseded |\n",
      "contradicts effective ADR",
    ],
    [
      "missing Status column",
      "| Document | Authority |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
      "has no Status column",
    ],
    [
      "missing Document header",
      "| Reference | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
      "missing from the ADR index",
    ],
    [
      "pipe-bearing heading terminator",
      "| Document | Status |\n| --- | --- |\n## Notes | detail\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
      "missing from the ADR index",
    ],
  ])("should report %s", async (_scenario, index, expectedMessage) => {
    const path = await writeEffectiveAdr(workspace.root, "adr-1-current.md");
    await writeFile(path, "# ADR-1: Current\n\n- Status: `Accepted`\n");
    await writeFile(join(workspace.root, "docs/architecture/README.md"), index);
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-index" && message.includes(expectedMessage),
      );
    expect(findings.length).toBeGreaterThan(0);
    if (expectedMessage !== "contradicts effective ADR")
      expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });
});

describe("bootstrap contract", () => {
  it("emits a doctor-clean initial stream", async () => {
    const root = await mkdtemp(join(tmpdir(), "state-doctor-bootstrap-"));
    try {
      spawnSync("git", ["init", "-q", root]);
      await writeFile(join(root, ".gitignore"), ".state/\n");
      const resolved = spawnSync(resolver, ["--work-id=demo", "--bootstrap"], {
        cwd: root,
        encoding: "utf8",
      });
      const workDir = JSON.parse(resolved.stdout).work_dir;
      const completed = spawnSync(doctor, ["--work-dir", workDir, "--json"], {
        encoding: "utf8",
      });
      const findings: Finding[] = JSON.parse(completed.stdout).findings;
      expect(completed.status).toBe(0);
      expect(findings.filter(({ severity }) => severity === "error")).toEqual(
        [],
      );
      expect(checks(findings)).not.toContain("state-metadata");
      expect(
        [...checks(findings)].every((check) =>
          [
            "lifecycle-vocabulary",
            "charter-provenance",
            "specification-provenance",
          ].includes(check),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("references, decisions, and ADR archival foundations", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await Workspace.create();
    await workspace.writeState(row("AAA"));
  });
  afterEach(async () => {
    await workspace.remove();
  });

  it("reports missing relative files and nonportable absolute paths", async () => {
    await workspace.writeState(
      row("AAA"),
      "- Charter: [charter](missing-goal.md)\n- Notes: [notes](/etc/absolute.md)\n",
    );
    const found = checks(workspace.run().findings);
    expect(found).toContain("file-reference");
    expect(found).toContain("portability");
  });
  it("reports a broken image reference", async () => {
    await workspace.writeState(
      row("AAA"),
      "- Diagram: ![diagram](missing.png)\n",
    );
    expect(checks(workspace.run().findings)).toContain("file-reference");
  });
  it("requires a successor for a superseded work decision", async () => {
    const decisions = join(workspace.workDir, "decisions");
    await mkdir(decisions);
    await writeFile(
      join(decisions, "old-choice.md"),
      "- status: `superseded`\n- headline: Old choice.\n",
    );
    expect(checks(workspace.run().findings)).toContain("decision");
    await writeFile(
      join(decisions, "new-choice.md"),
      "- status: `accepted`\n- supersedes: `old-choice`\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("decision");
  });
  it("accepts a canonical archived ADR with one indexed successor", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const decisions = join(architecture, "decisions/runtime");
    await mkdir(decisions, { recursive: true });
    const old = join(decisions, "adr-1-old-choice.md");
    await writeFile(old, "# ADR-1: Old choice\n\n- Status: `Superseded`\n");
    await writeFile(
      join(architecture, "README.md"),
      "# Architecture\n\n| Document | Status |\n| --- | --- |\n| [ADR-1](decisions/runtime/adr-1-old-choice.md) | Accepted |\n",
    );
    expect(checks(workspace.run().findings)).toContain("adr-superseded");
    const archived = join(decisions, "../superseded/runtime");
    await mkdir(archived, { recursive: true });
    await rename(old, join(archived, "adr-1-old-choice.md"));
    await writeFile(
      join(decisions, "adr-2-new-choice.md"),
      "# ADR-2: New choice\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-1-old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — New choice](../../runtime/adr-2-new-choice.md)\n>\n> **What changed:** The complete change replaced the old choice.\n\n# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "# Architecture\n\n| Document | Status |\n| --- | --- |\n| [ADR-2](decisions/runtime/adr-2-new-choice.md) | Accepted |\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });
  it("offers a fix for every ADR integrity finding", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const decisions = join(architecture, "decisions/runtime");
    await mkdir(decisions, { recursive: true });
    await writeFile(
      join(decisions, "adr-1-choice.md"),
      "# ADR-1: Choice\n\n- Status: `Accepted`\n\nThis ADR supersedes an earlier choice.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| [ADR-1](decisions/runtime/adr-1-choice.md) | Accepted |\n",
    );
    const integrity = workspace
      .run()
      .findings.filter(({ check }) => check === "adr-integrity");
    expect(integrity.length).toBeGreaterThan(0);
    expect(integrity.every(({ fix }) => Boolean(fix))).toBe(true);
  });
  it("reports noncanonical effective and archived ADR filenames with fixes", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const decisions = join(architecture, "decisions/runtime");
    const archived = join(decisions, "../superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(decisions, { recursive: true });
    await writeFile(
      join(decisions, "database.md"),
      "# ADR-1: Database\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(decisions, "adr-2-current.md"),
      "# ADR-2: Current\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Current](../../runtime/adr-2-current.md)\n>\n> **What changed:** The complete change replaced the old choice.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Database](decisions/runtime/database.md) | Accepted |\n| [Current](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    const findings = workspace
      .run()
      .findings.filter(
        ({ check, message }) =>
          check === "adr-layout" && message.includes("filename must use"),
      );
    expect(new Set(findings.map(({ work }) => work))).toEqual(
      new Set([
        "docs/architecture/decisions/runtime/database.md",
        "docs/architecture/decisions/superseded/runtime/old-choice.md",
      ]),
    );
    expect(findings.every(({ fix }) => Boolean(fix))).toBe(true);
  });
  it.each(["", "> superseded-by: adr-3, adr-2\n"])(
    "should accept multiple successors with optional metadata %s",
    async (metadata) => {
      await writeArchivedAdr(
        workspace.root,
        "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      );
      const architecture = join(workspace.root, "docs/architecture");
      await writeFile(
        join(architecture, "decisions/runtime/adr-3-other.md"),
        "# ADR-3: Other\n\n- Status: `Accepted`\n",
      );
      const path = join(
        architecture,
        "decisions/superseded/runtime/adr-1-old-choice.md",
      );
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace(
          "> **Superseded by:** [ADR-2 — Choice](../../runtime/adr-2-current.md)",
          `${metadata}> **Superseded by:** [ADR-2 — Choice](../../runtime/adr-2-current.md), [ADR-3 — Other](../../runtime/adr-3-other.md)`,
        ),
      );
      await writeFile(
        join(architecture, "README.md"),
        "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-2-current.md) | Accepted |\n| [Other](decisions/runtime/adr-3-other.md) | Accepted |\n",
      );
      expect(
        workspace
          .run()
          .findings.filter(({ check }) => check.startsWith("adr-")),
      ).toEqual([]);
    },
  );

  it.each(["adr-1-choice.md", "adr-10000-choice.md"])(
    "should accept positive unpadded identity %s",
    async (name) => {
      await writeEffectiveAdr(workspace.root, name);
      expect(
        workspace
          .run()
          .findings.filter(({ check }) => check.startsWith("adr-")),
      ).toEqual([]);
    },
  );

  it.each([
    "1-choice.md",
    "0001-choice.md",
    "adr-0-choice.md",
    "adr-01-choice.md",
  ])("should reject noncanonical numbered filename %s", async (name) => {
    await writeEffectiveAdr(workspace.root, name);
    expect(checks(workspace.run().findings)).toContain("adr-layout");
  });

  it.each(["0", "01"])(
    "should reject nonpositive or padded heading %s",
    async (number) => {
      const path = await writeEffectiveAdr(workspace.root);
      await writeFile(
        path,
        `# ADR-${number}: Choice\n\n- Status: \`Accepted\`\n`,
      );
      expect(checks(workspace.run().findings)).toContain("adr-integrity");
    },
  );

  it.each([
    "adr-3",
    "adr-2, adr-3",
    "adr-2, adr-2",
    "ADR-2",
    "adr-02",
    "adr-0",
    "adr-2,",
    "",
    "adr-2\n> superseded-by: adr-2",
  ])("should reject invalid successor metadata %s", async (metadata) => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "> **Status:** Superseded",
        `> **Status:** Superseded\n> superseded-by: ${metadata}`,
      ),
    );
    expect(checks(workspace.run().findings)).toContain("adr-superseded");
  });

  it.each(["../../runtime/adr-3-missing.md", "adr-1-old-choice.md"])(
    "should reject a successor outside existing effective ADRs: %s",
    async (target) => {
      await writeArchivedAdr(
        workspace.root,
        "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      );
      const path = join(
        workspace.root,
        "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
      );
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace(
          "../../runtime/adr-2-current.md",
          target,
        ),
      );
      expectFixes(
        matchingFindings(
          workspace,
          "adr-superseded",
          "does not target an effective ADR",
        ),
      );
    },
  );

  it.each([
    ["adr-2", false],
    ["adr-99", true],
    ["adr-2\n > superseded-by: adr-2", true],
  ])(
    "should validate indented successor metadata %s",
    async (identity, invalid) => {
      await writeArchivedAdr(
        workspace.root,
        "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      );
      const path = join(
        workspace.root,
        "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
      );
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace(
          "> **Status:** Superseded",
          `> **Status:** Superseded\n > superseded-by: ${identity}`,
        ),
      );
      expect(checks(workspace.run().findings).has("adr-superseded")).toBe(
        invalid,
      );
    },
  );

  it.each([
    ["superseded-by: adr-2", false],
    ["superseded-by : adr-99", true],
  ])(
    "should validate relationship metadata after the change summary: %s",
    async (metadata, invalid) => {
      await writeArchivedAdr(
        workspace.root,
        "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      );
      const path = join(
        workspace.root,
        "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
      );
      await writeFile(
        path,
        (await readFile(path, "utf8")).replace(
          "> **What changed:** The complete change replaced the old choice.",
          `> **What changed:** The complete change replaced the old choice.\n> ${metadata}`,
        ),
      );
      expect(checks(workspace.run().findings).has("adr-superseded")).toBe(
        invalid,
      );
    },
  );

  it("should accept matching single-successor metadata", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "> **Status:** Superseded",
        "> **Status:** Superseded\n> superseded-by: adr-2",
      ),
    );
    expect(
      workspace.run().findings.filter(({ check }) => check.startsWith("adr-")),
    ).toEqual([]);
  });
});

describe("ADR index rendering and integrity", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await Workspace.create();
    await workspace.writeState(row("AAA"));
  });
  afterEach(async () => {
    await workspace.remove();
  });

  it("ignores nonrendered tables", async () => {
    await writeAdrIndex(
      workspace,
      "```markdown\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n````\n\n<!--\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n-->\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-index", "missing from the ADR index"),
    );
  });

  it.each([
    [
      "raw HTML tables",
      "<pre>\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n</pre>\n",
    ],
    [
      "generic raw HTML blocks",
      "<custom>\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n</custom>\n",
    ],
    [
      "attribute-bearing generic raw HTML blocks",
      '<custom class="raw">\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n</custom>\n',
    ],
  ])("ignores %s", async (_scenario, index) => {
    await writeAdrIndex(workspace, index);
    expectFixes(
      matchingFindings(workspace, "adr-index", "missing from the ADR index"),
    );
  });

  it("resumes after a blank line in block HTML", async () => {
    await writeAdrIndex(
      workspace,
      "<div>\n\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n\n</div>\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it("counts links only from the Document cell", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Authority | Status |\n| --- | --- | --- |\n| Architecture | See [ADR](decisions/runtime/adr-1-current.md) | Accepted |\n",
    );
    expect(
      matchingFindings(workspace, "adr-index", "missing from the ADR index")
        .length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [
      "requires a Markdown delimiter row",
      "| Document | Status |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
    [
      "requires the delimiter width to match the header",
      "| Document | Status |\n| --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
    [
      "requires the delimiter immediately after the header",
      "| Document | Status |\n| Notes | Value |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
  ])("%s", async (_scenario, index) => {
    await writeAdrIndex(workspace, index);
    expectFixes(
      matchingFindings(workspace, "adr-index", "valid Markdown delimiter"),
    );
  });

  it("rejects duplicate effective entries", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-index", "listed more than once"),
    );
  });

  it("keeps Status-named data rows active", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Authority | Status |\n| --- | --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Status | Accepted |\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-index");
  });

  it("rejects duplicate Status columns", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status | Status |\n| --- | --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted | Superseded |\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-index", "duplicate Status columns"),
    );
  });

  it.each([
    [
      "escaped pipes in other cells",
      "| Document | Authority | Status |\n| --- | --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Supports A \\| B | Accepted |\n",
    ],
    [
      "rows without outer pipes",
      "Document | Status\n--- | ---\n[Current](decisions/runtime/adr-1-current.md) | Accepted\n",
    ],
    [
      "link titles",
      '| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md "decision record") | Accepted |\n',
    ],
    [
      "reference-style links",
      "| Document | Status |\n| --- | --- |\n| [Current][adr] | Accepted |\n\n[adr]: decisions/runtime/adr-1-current.md\n",
    ],
    [
      "collapsed reference links",
      "| Document | Status |\n| --- | --- |\n| [Current][] | Accepted |\n\n[Current]: decisions/runtime/adr-1-current.md\n",
    ],
    [
      "shortcut reference links",
      "| Document | Status |\n| --- | --- |\n| [Current] | Accepted |\n\n[Current]: decisions/runtime/adr-1-current.md\n",
    ],
    [
      "angle-bracket destinations",
      "| Document | Status |\n| --- | --- |\n| [Current](<decisions/runtime/adr-1-current.md>) | Accepted |\n",
    ],
    [
      "formatted table headers",
      "| **Document** | **Status** |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | **Accepted** |\n",
    ],
  ])("accepts %s", async (_scenario, index) => {
    await writeAdrIndex(workspace, index);
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it("accepts balanced-bracket labels", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status |\n| --- | --- |\n| [Cache [v2]](decisions/runtime/adr-1-cache-v2.md) | Accepted |\n",
      "adr-1-cache-v2.md",
      "Cache [v2]",
    );
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it.each([
    [
      "links inside inline HTML attributes",
      '| Document | Status |\n| --- | --- |\n| <span data-link="[Current](decisions/runtime/adr-1-current.md)">Current</span> | Accepted |\n',
    ],
    [
      "a Document header inside an existing table",
      "| Other | Value |\n| --- | --- |\n| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
    [
      "indented code tables",
      "    | Document | Status |\n    | --- | --- |\n    | [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
    [
      "image destinations",
      "| Document | Status |\n| --- | --- |\n| ![ADR image](decisions/runtime/adr-1-current.md) | Accepted |\n",
    ],
  ])("ignores %s", async (_scenario, index) => {
    await writeAdrIndex(workspace, index);
    expectFixes(
      matchingFindings(workspace, "adr-index", "missing from the ADR index"),
    );
  });

  it("uses the first reference definition", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status |\n| --- | --- |\n| [Current][adr] | Accepted |\n\n[adr]: decisions/runtime/missing.md\n[adr]: decisions/runtime/adr-1-current.md\n",
    );
    expect(
      matchingFindings(workspace, "adr-index", "missing from the ADR index")
        .length,
    ).toBeGreaterThan(0);
  });

  it.each([
    [
      "inline-code links",
      "| Document | Status |\n| --- | --- |\n| `[Choice]` | Accepted |\n\n[Choice]: decisions/runtime/adr-1-choice.md\n",
    ],
    [
      "nested image reference labels",
      "| Document | Status |\n| --- | --- |\n| ![Architecture [Choice]](badge.svg) | Accepted |\n\n[Choice]: decisions/runtime/adr-1-current.md\n",
    ],
    [
      "footnote references",
      "| Document | Status |\n| --- | --- |\n| Choice[^1] | Accepted |\n\n[^1]: decisions/runtime/adr-1-choice.md\n",
    ],
  ])("ignores %s", async (_scenario, index) => {
    if (index.includes("adr-1-choice")) await writeEffectiveAdr(workspace.root);
    else await writeAdrIndex(workspace, index);
    const architecture = join(workspace.root, "docs/architecture");
    if (index.includes("adr-1-choice"))
      await writeFile(join(architecture, "README.md"), index);
    expectFixes(
      matchingFindings(workspace, "adr-index", "missing from the ADR index"),
    );
  });

  it("ignores frontmatter table examples", async () => {
    await writeEffectiveAdr(workspace.root);
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      "---\nindex-example: >-\n  | Document | Status |\n  | --- | --- |\n  | [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n---\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-index", "missing from the ADR index"),
    );
  });
});

describe("ADR filenames, archived headers, and placeholders", () => {
  let workspace: Workspace;
  beforeEach(async () => {
    workspace = await Workspace.create();
    await workspace.writeState(row("AAA"));
  });
  afterEach(async () => {
    await workspace.remove();
  });

  it.each(["adr-1-current.MD", "adr-1-current.markdown", "adr-1-current"])(
    "rejects the noncanonical numeric ADR filename %s",
    async (filename) => {
      const decisions = join(
        workspace.root,
        "docs/architecture/decisions/runtime",
      );
      await mkdir(decisions, { recursive: true });
      await writeFile(
        join(decisions, filename),
        "# ADR-1: Current\n\n- Status: `Accepted`\n",
      );
      expectFixes(
        matchingFindings(workspace, "adr-layout", "lowercase `.md` extension"),
      );
    },
  );

  it("requires archived header fields to precede the body", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const decisions = join(architecture, "decisions/runtime");
    const archived = join(decisions, "../superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(decisions, { recursive: true });
    await writeFile(
      join(decisions, "adr-2-current.md"),
      "# ADR-2: Current\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-1-old-choice.md"),
      "> **Status:** Superseded\n>\n> **What changed:** The complete change replaced the old choice.\n> **Superseded by:** [ADR-2 — Current](../../runtime/adr-2-current.md)\n>\n# ADR-1: Old choice\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "header fields must appear in order",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      workspace
        .run()
        .findings.filter(({ check }) => check === "adr-superseded")
        .every(({ fix }) => Boolean(fix)),
    ).toBe(true);
  });

  it("rejects nonstandard archived header fields", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "> **What changed:**",
        "> **Rationale:** This extra historical claim is not part of the header.\n>\n> **What changed:**",
      ),
    );
    expectFixes(
      matchingFindings(workspace, "adr-superseded", "non-standard content"),
    );
  });

  it("allows retained HTML comments in archived ADRs", async () => {
    await writeArchivedAdr(
      workspace.root,
      "<!-- Retained historical note.\nStatus: Proposed\n> **Superseded by:** [ADR-9999 — Example](../9999-example.md)\n> **What changed:** The complete change replaced the example choice.\n# Retained editor note\n-->\n# ADR-1: Old choice\n\n<!-- Example metadata: Status: Proposed -->\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-superseded");
  });

  it("allows retained pre-title frontmatter in archived ADRs", async () => {
    await writeArchivedAdr(
      workspace.root,
      "---\ntitle: Old choice\n---\n# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-superseded");
  });

  it.each([
    [
      "YAML comments",
      "---\ntitle: Choice\n# editor note\n---\n# ADR-1: Choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe accepted choice.\n",
    ],
    [
      "raw HTML examples",
      "<pre>\n# ADR-9999: Example\n</pre>\n# ADR-1: Choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe accepted choice.\n",
    ],
  ])("ignores %s before the ADR title", async (_scenario, body) => {
    const architecture = join(workspace.root, "docs/architecture");
    const decisions = join(architecture, "decisions/runtime");
    await mkdir(decisions, { recursive: true });
    await writeFile(join(decisions, "adr-1-choice.md"), body);
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it("rejects a heading without a rendered title", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status |\n| --- | --- |\n| [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n",
      "adr-1-choice.md",
      "#",
    );
    expectFixes(matchingFindings(workspace, "adr-integrity", "canonical"));
  });

  it.each([
    ["<?raw", "?>"],
    ["<!DOCTYPE raw", ">"],
    ["<![CDATA[", "]]>"],
  ])("ignores the non-tag raw HTML block %s", async (opening, closing) => {
    await writeEffectiveAdr(workspace.root);
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      `${opening}\n| Document | Status |\n| --- | --- |\n| [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n${closing}\n`,
    );
    expect(
      matchingFindings(workspace, "adr-index", "missing from the ADR index")
        .length,
    ).toBeGreaterThan(0);
  });

  it("ignores unterminated HTML comments in the ADR index", async () => {
    await writeEffectiveAdr(workspace.root);
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      "<!--\n| Document | Status |\n| --- | --- |\n| [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n",
    );
    expect(
      matchingFindings(workspace, "adr-index", "missing from the ADR index")
        .length,
    ).toBeGreaterThan(0);
  });

  it("keeps a placeholder after an inline generic tag visible", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "Context\n<custom>\nTODO: choose provider\n",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it.each([
    ["blockquoted fences", "> ```text\n> TODO: supplied-by-runtime\n> ```\n"],
    [
      "fences indented in list content",
      "- Example:\n    ~~~\n    TODO: supplied-by-runtime\n    ~~~\n",
    ],
  ])("ignores placeholders inside %s", async (_scenario, body) => {
    await writeEffectiveAdr(workspace.root, "adr-1-choice.md", body);
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("keeps blank-terminated HTML blocks active in the ADR index", async () => {
    await writeEffectiveAdr(workspace.root);
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      "<div></div>\n| Document | Status |\n| --- | --- |\n| [Choice](decisions/runtime/adr-1-choice.md) | Accepted |\n",
    );
    expect(
      matchingFindings(workspace, "adr-index", "missing from the ADR index")
        .length,
    ).toBeGreaterThan(0);
  });

  it("rejects unfilled template fields", async () => {
    await writeAdrIndex(
      workspace,
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
      "adr-1-current.md",
      "<decision title>",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it.each(["# ADR-1: TODO", "## TODO: Describe decision"])(
    "rejects the TODO heading %s",
    async (heading) => {
      const path = await writeEffectiveAdr(workspace.root);
      await writeFile(
        path,
        heading.startsWith("# ADR-")
          ? `${heading}\n\n- Status: \`Accepted\`\n`
          : `# ADR-1: Choice\n\n- Status: \`Accepted\`\n\n${heading}\n`,
      );
      expectFixes(
        matchingFindings(
          workspace,
          "adr-integrity",
          "unresolved TODO/TBD placeholder",
        ),
      );
    },
  );

  it.each([
    "<List the meaningful alternatives and why they were not selected.>",
    "<Record the benefits, costs, risks, and operational consequences.>",
  ])("rejects the template verb placeholder %s", async (placeholder) => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      `${placeholder}\n`,
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it("allows autolinks and inline HTML", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      'Links: <https://example.com> <team@example.com> <span>valid</span> <List items="all">items</List> <Record class="entry">entry</Record>.\n',
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("ignores placeholders inside inline HTML", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      '<span data-example="<decision-title>">this form</span>\n',
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("ignores template tokens in inline code", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "Decision IDs use `ADR-<n>` in references.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("respects an even-backslash inline-code opener", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "Decision IDs use \\\\`<decision-title>` in references.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it.each(["<!foo", "<![cdata["])(
    "keeps the lowercase HTML declaration %s visible",
    async (declaration) => {
      await writeEffectiveAdr(
        workspace.root,
        "adr-1-choice.md",
        `${declaration}\nTODO: choose provider\n`,
      );
      expectFixes(
        matchingFindings(
          workspace,
          "adr-integrity",
          "unresolved TODO/TBD placeholder",
        ),
      );
    },
  );

  it("detects template tokens after unequal inline-code runs", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "Decision IDs use `<n>`` in references.\n",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it.each([
    "This replaces ADR-2.\n",
    "This ADR supersedes an earlier choice.\n",
  ])("rejects explicit replacement language: %s", async (body) => {
    await writeEffectiveAdr(workspace.root, "adr-1-choice.md", body);
    expectFixes(
      matchingFindings(workspace, "adr-integrity", "supersession history"),
    );
  });

  it.each(["This ADR **replaces** ADR-0.\n", "This **ADR** replaces ADR-2.\n"])(
    "rejects emphasized replacement language: %s",
    async (body) => {
      await writeEffectiveAdr(workspace.root, "adr-1-choice.md", body);
      expectFixes(
        matchingFindings(workspace, "adr-integrity", "supersession history"),
      );
    },
  );

  it.each([
    "This ADR is the successor to ADR-1.\n",
    "This ADR succeeds ADR-1.\n",
  ])("rejects explicit successor language: %s", async (body) => {
    await writeEffectiveAdr(workspace.root, "adr-1-choice.md", body);
    expectFixes(
      matchingFindings(workspace, "adr-integrity", "supersession history"),
    );
  });

  it("ignores unrelated replacement language", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "As specified by ADR-2, the cache replaces repeated database reads.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("ignores domain supersession language", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "Newer queue events supersede pending events with the same key.\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("rejects relative links to archived ADRs", async () => {
    const current = await writeEffectiveAdr(
      workspace.root,
      "adr-2-current.md",
      "See [the old choice](../superseded/runtime/adr-1-old-choice.md).\n",
    );
    const archived = join(current, "../../superseded/runtime");
    await mkdir(archived, { recursive: true });
    await writeFile(
      join(archived, "adr-1-old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Choice](../../runtime/adr-2-current.md)\n>\n> **What changed:** The complete change replaced the old choice.\n\n# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-integrity", "supersession history"),
    );
  });

  it.each(["```", "~~~"])(
    "does not close %s fenced content with a text-bearing marker",
    async (fence) => {
      await writeEffectiveAdr(
        workspace.root,
        "adr-1-choice.md",
        `${fence}text\n# ADR-99: Example\n${fence}not-a-closing-fence\n<decision title>\n`,
      );
      expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
    },
  );

  it("rejects backtick fence info containing a backtick", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "```example`value\nTODO:\n",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it("rejects a tab-indented fence marker", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "\t```text\nTODO:\n\t```\n",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "unresolved TODO/TBD placeholder",
      ),
    );
  });

  it("requires the canonical ADR heading to be the first title", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-1-current.md"),
      "# Notes\n\n- Status: `Accepted`\n\n# ADR-1: Current\n\nThe decision.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    );
    expectFixes(matchingFindings(workspace, "adr-integrity", "canonical"));
  });

  it("rejects an indented-code ADR heading", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-1-current.md"),
      "    # ADR-1: Current\n\n- Status: `Accepted`\n\nThe decision.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-integrity", "missing its canonical"),
    );
  });

  it("preserves line boundaries around comments", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-1-current.md"),
      "# <!--\nnote\n-->ADR-1: Current\n\n- Status: `Accepted`\n\nThe decision.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-current.md) | Accepted |\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-integrity", "missing its canonical"),
    );
  });

  it("ignores template comments during integrity checks", async () => {
    const path = await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "## Context\n\nThe accepted choice.\n\n<!-- Optional superseded guidance says TODO and Superseded by. -->\n",
    );
    expect(path).toContain("adr-1-choice.md");
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("rejects duplicate archived header fields", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const archived = join(architecture, "decisions/superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-2-current.md"),
      "# ADR-2: Current\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-1-old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Current](../../runtime/adr-2-current.md)\n> **Superseded by:** [ADR-2 — Current](../../runtime/adr-2-current.md)\n>\n> **What changed:** The complete change replaced the old choice.\n> **What changed:** The complete change replaced the old choice again.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| [ADR-2](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    const findings = matchingFindings(
      workspace,
      "adr-superseded",
      "exactly one",
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.message).toContain("Superseded by");
    expect(findings[0]?.message).toContain("What changed");
  });

  it("rejects duplicate archived status headers", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "> **Status:** Superseded\n",
        "> **Status:** Superseded\n>\n> **Status:** Accepted\n",
      ),
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-superseded",
        "exactly one Superseded status header",
      ),
    );
  });

  it("rejects a backward successor identity", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const archived = join(architecture, "decisions/superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-2-current.md"),
      "# ADR-2: Current\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-3-old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Current](../../runtime/adr-2-current.md)\n>\n> **What changed:** The complete change replaced the old choice.\n\n# ADR-3: Old choice\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    expectFixes(
      matchingFindings(workspace, "adr-superseded", "later numeric identity"),
    );
  });

  it("requires the successor label to match its target", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const archived = join(architecture, "decisions/superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-3-database.md"),
      "# ADR-3: Database\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-1-old-choice.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Cache](../../runtime/adr-3-database.md)\n>\n> **What changed:** The complete change replaced the old choice.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| [ADR-3](decisions/runtime/adr-3-database.md) | Accepted |\n",
    );
    const finding = matchingFindings(
      workspace,
      "adr-superseded",
      "label does not match target ADR",
    )[0];
    expect(finding?.fix).toContain("successor link");
    expect(finding?.fix).toContain("do not prepend another header");
  });

  it("accepts a rendered successor title", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
      "Current choice",
    );
    await writeFile(
      join(
        workspace.root,
        "docs/architecture/decisions/runtime/adr-2-current.md",
      ),
      "# ADR-2: **Current choice** ##\n\n- Status: `Accepted`\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check === "adr-superseded"),
    ).toBe(false);
  });

  it("accepts an inline-formatted successor title", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
      "Use the current cache",
    );
    await writeFile(
      join(
        workspace.root,
        "docs/architecture/decisions/runtime/adr-2-current.md",
      ),
      "# ADR-2: Use the **current** cache\n\n- Status: `Accepted`\n",
    );
    expect(
      workspace.run().findings.some(({ check }) => check === "adr-superseded"),
    ).toBe(false);
  });

  it.each(["Cache [v2]", "Cache \\[v2\\]"])(
    "accepts the bracketed successor title %s",
    async (labelTitle) => {
      const architecture = join(workspace.root, "docs/architecture");
      const archived = join(architecture, "decisions/superseded/runtime");
      await mkdir(archived, { recursive: true });
      await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
      await writeFile(
        join(architecture, "decisions/runtime/adr-2-cache-v2.md"),
        "# ADR-2: Cache [v2]\n\n- Status: `Accepted`\n",
      );
      await writeFile(
        join(archived, "adr-1-old-choice.md"),
        `> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — ${labelTitle}](../../runtime/adr-2-cache-v2.md)\n>\n> **What changed:** The complete change replaced the old choice.\n\n# ADR-1: Old choice\n\n- Status: \`Accepted\`\n\n## Decision\n\nThe original choice.\n`,
      );
      await writeFile(
        join(architecture, "README.md"),
        "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-2-cache-v2.md) | Accepted |\n",
      );
      expect(
        workspace
          .run()
          .findings.some(({ check }) => check === "adr-superseded"),
      ).toBe(false);
    },
  );

  it("ignores links inside inline HTML attributes", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "[ADR-2 — Choice](../../runtime/adr-2-current.md)",
        '<span data-link="[ADR-2 — Current](../../runtime/adr-2-current.md)">Current</span>',
      ),
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "at least one successor link",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects an escaped successor link", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "[ADR-2 — Choice]",
        "\\[ADR-2 — Current]",
      ),
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "at least one successor link",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("ignores archived template placeholders in code spans", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "The complete change replaced the old choice.",
        "The complete change now treats `<decision-title>` as a literal.",
      ),
    );
    expect(
      workspace.run().findings.some(({ check }) => check === "adr-superseded"),
    ).toBe(false);
  });

  it("rejects an empty blockquote body", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n>\n",
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "substantive decision content",
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each(["-", "*", "+", "1."])(
    "rejects the empty %s list body",
    async (marker) => {
      await writeArchivedAdr(
        workspace.root,
        `# ADR-1: Old choice\n\n- Status: \`Accepted\`\n${marker}\n`,
      );
      expect(
        matchingFindings(
          workspace,
          "adr-superseded",
          "substantive decision content",
        ).length,
      ).toBeGreaterThan(0);
    },
  );

  it("rejects an empty heading body", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n##\n",
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "substantive decision content",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("requires an archived change summary to classify scope", async () => {
    await writeArchivedAdr(workspace.root, "");
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "The complete change replaced the old choice.",
        "Switched databases.",
      ),
    );
    expect(
      matchingFindings(workspace, "adr-superseded", "partial or complete")
        .length,
    ).toBeGreaterThan(0);
  });

  it.each([
    "The old choice was completely replaced.",
    "The old choice was partially changed.",
  ])("accepts the adverbial change scope: %s", async (summary) => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "The complete change replaced the old choice.",
        summary,
      ),
    );
    expect(
      workspace.run().findings.some(({ check }) => check === "adr-superseded"),
    ).toBe(false);
  });

  it("rejects an incidental scope word in the change summary", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nA retained choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "The complete change replaced the old choice.",
        "The cache policy changed; the complete decision is documented elsewhere.",
      ),
    );
    expect(
      matchingFindings(workspace, "adr-superseded", "partial or complete")
        .length,
    ).toBeGreaterThan(0);
  });

  it("uses the explicit active repository root for ADR scans", async () => {
    const wrong = join(workspace.root, "docs/architecture/decisions/runtime");
    await mkdir(wrong, { recursive: true });
    await writeFile(
      join(wrong, "adr-1-wrong.md"),
      "# ADR-1: Wrong tree\n\n- Status: `Superseded`\n",
    );
    const active = join(workspace.root, "active-worktree");
    const decisions = join(active, "docs/architecture/decisions/runtime");
    await mkdir(decisions, { recursive: true });
    await writeFile(
      join(decisions, "adr-2-current.md"),
      "# ADR-2: Current tree\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(active, "docs/architecture/README.md"),
      "| Document | Status |\n| --- | --- |\n| [ADR-2](decisions/runtime/adr-2-current.md) | Accepted |\n",
    );
    expect(
      workspace
        .run("--repository-root", active)
        .findings.some(({ check }) => check.startsWith("adr-")),
    ).toBe(false);
  });

  it("runs ADR scans when the state directory is absent", async () => {
    const repository = await mkdtemp(join(tmpdir(), "state-doctor-repo-"));
    try {
      const decisions = join(repository, "docs/architecture/decisions/runtime");
      await mkdir(decisions, { recursive: true });
      await writeFile(
        join(decisions, "adr-1-current.md"),
        "# ADR-1: Current\n\n- Status: `Accepted`\n",
      );
      await writeFile(
        join(repository, "docs/architecture/README.md"),
        "| Document | Status |\n| --- | --- |\n| [ADR-1](decisions/runtime/adr-1-current.md) | Accepted |\n",
      );
      const result = spawnSync(doctor, ["--state-dir", ".state", "--json"], {
        cwd: repository,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).findings).toEqual([]);
    } finally {
      await rm(repository, { force: true, recursive: true });
    }
  });

  it("errors for a missing non-state directory", async () => {
    const repository = await mkdtemp(join(tmpdir(), "state-doctor-repo-"));
    try {
      const result = spawnSync(doctor, ["--state-dir", ".staet", "--json"], {
        cwd: repository,
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("not a directory");
    } finally {
      await rm(repository, { force: true, recursive: true });
    }
  });

  it("does not treat a status body example as contradictory metadata", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-current.md",
      "## Context\n\n```yaml\nstatus: pending\n```\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it("rejects trailing ADR status values", async () => {
    const path = await writeEffectiveAdr(workspace.root, "adr-1-current.md");
    await writeFile(
      path,
      "# ADR-1: Current\n\n- Status: `Accepted` / `Proposed`\n",
    );
    expectFixes(
      matchingFindings(
        workspace,
        "adr-integrity",
        "Accepted status declaration",
      ),
    );
  });

  it("stops ADR metadata at deep subheadings", async () => {
    await writeEffectiveAdr(
      workspace.root,
      "adr-1-choice.md",
      "### Implementation note\n\nStatus: Proposed\n",
    );
    expect(checks(workspace.run().findings)).not.toContain("adr-integrity");
  });

  it.each([
    "adr-1-old.md",
    "superseded/adr-1-old.md",
    "runtime/superseded/adr-1-old.md",
    "runtime/nested/adr-1-old.md",
    "superseded/runtime/nested/adr-1-old.md",
    "Runtime/adr-1-old.md",
    "run_time/adr-1-old.md",
    "-runtime/adr-1-old.md",
    "runtime--core/adr-1-old.md",
  ])("should reject noncanonical domain placement %s", async (relative) => {
    const misplaced = join(
      workspace.root,
      "docs/architecture/decisions",
      relative,
    );
    await mkdir(join(misplaced, ".."), { recursive: true });
    await writeFile(misplaced, "# ADR-1: Old\n\n- Status: `Accepted`\n");
    expect(workspace.run().findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: "adr-layout",
          severity: "error",
          work: `docs/architecture/decisions/${relative}`,
          fix: expect.any(String),
        }),
      ]),
    );
  });

  it("rejects an unfilled archived change summary", async () => {
    await writeArchivedAdr(workspace.root, "");
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "The complete change replaced the old choice.",
        "<State whether the change is partial or complete and summarize the changed choice.>",
      ),
    );
    expect(
      matchingFindings(workspace, "adr-superseded", "What changed").length,
    ).toBeGreaterThan(0);
  });

  it("rejects an absolute successor link", async () => {
    await writeArchivedAdr(workspace.root, "");
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    const current = join(
      workspace.root,
      "docs/architecture/decisions/runtime/adr-2-current.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "../../runtime/adr-2-current.md",
        current,
      ),
    );
    expect(
      matchingFindings(workspace, "adr-superseded", "portable relative path")
        .length,
    ).toBeGreaterThan(0);
  });

  it("rejects a spaced successor link", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    const path = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace(
        "](../../runtime/adr-2-current.md)",
        "] (../../runtime/adr-2-current.md)",
      ),
    );
    expect(
      matchingFindings(
        workspace,
        "adr-superseded",
        "at least one successor link",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("rejects archived entries in the ADR index", async () => {
    await writeArchivedAdr(workspace.root, "");
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      "| [ADR-2](decisions/runtime/adr-2-current.md) | Accepted |\n| [ADR-1](decisions/superseded/runtime/adr-1-old-choice.md) | Superseded |\n",
    );
    expect(checks(workspace.run().findings)).toContain("adr-index");
  });

  it.each([
    "decisions/superseded/runtime/adr-1-old-choice.md",
    "`decisions/superseded/runtime/adr-1-old-choice.md`",
  ])("rejects the unlinked archived path %s", async (archivedCell) => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    await writeFile(
      join(workspace.root, "docs/architecture/README.md"),
      `| Document | Status |\n| --- | --- |\n| [New choice](decisions/runtime/adr-2-current.md) | Accepted |\n| ${archivedCell} | Superseded |\n`,
    );
    expectFixes(
      matchingFindings(workspace, "adr-index", "lists an archived ADR path"),
    );
  });

  it("should accept indexed effective ADRs and successors across two domains", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
    );
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(join(architecture, "decisions/data-store"));
    await writeFile(
      join(architecture, "decisions/data-store/adr-3-storage.md"),
      "# ADR-3: Storage\n\n- Status: `Accepted`\n\nStore durable records.\n",
    );
    const archived = join(
      architecture,
      "decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      archived,
      (await readFile(archived, "utf8")).replace(
        "[ADR-2 — Choice](../../runtime/adr-2-current.md)",
        "[ADR-2 — Choice](../../runtime/adr-2-current.md), [ADR-3 — Storage](../../data-store/adr-3-storage.md)",
      ),
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Runtime](decisions/runtime/adr-2-current.md) | Accepted |\n| [Storage](decisions/data-store/adr-3-storage.md) | Accepted |\n",
    );

    expect(
      workspace.run().findings.filter(({ check }) => check.startsWith("adr-")),
    ).toEqual([]);
  });

  it("should report cross-domain duplicate identities and index coverage by full path", async () => {
    await writeEffectiveAdr(workspace.root);
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(join(architecture, "decisions/storage"));
    await writeFile(
      join(architecture, "decisions/storage/adr-1-choice.md"),
      "# ADR-1: Choice\n\n- Status: `Accepted`\n",
    );
    const findings = workspace.run().findings;

    expect(
      findings.filter(({ check }) => check === "adr-integrity"),
    ).toMatchObject([
      {
        work: "docs/architecture/decisions/runtime/adr-1-choice.md",
        severity: "error",
      },
      {
        work: "docs/architecture/decisions/storage/adr-1-choice.md",
        severity: "error",
      },
    ]);
    expect(findings.filter(({ check }) => check === "adr-index")).toMatchObject(
      [{ work: "docs/architecture/README.md", severity: "error" }],
    );
  });

  it("should reject a missing cross-domain successor", async () => {
    await writeArchivedAdr(
      workspace.root,
      "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
    );
    const archived = join(
      workspace.root,
      "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
    );
    await writeFile(
      archived,
      (await readFile(archived, "utf8")).replace(
        "../../runtime/adr-2-current.md",
        "../../storage/adr-2-current.md",
      ),
    );

    expect(
      workspace
        .run()
        .findings.filter(({ check }) => check === "adr-superseded"),
    ).toMatchObject([
      {
        work: "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
        severity: "error",
      },
    ]);
  });

  it.each([
    "[Previous](../superseded/storage/adr-1-old.md)",
    "docs/architecture/decisions/superseded/storage/adr-1-old.md",
    "`docs/architecture/decisions/superseded/storage/adr-1-old.md`",
    "../superseded/runtime/adr-1-old.md",
    "`../superseded/runtime/adr-1-old.md`",
    "../superseded/storage/adr-1-old.md",
    "`../superseded/storage/adr-1-old.md`",
    "superseded/adr-1-old.md",
    "`superseded/adr-1-old.md`",
    "../storage/superseded/adr-1-old.md",
    "`../storage/superseded/adr-1-old.md`",
  ])(
    "should reject cross-domain archived history in effective content: %s",
    async (body) => {
      await writeEffectiveAdr(workspace.root, "adr-2-current.md", body);

      expect(
        workspace
          .run()
          .findings.filter(({ check }) => check === "adr-integrity"),
      ).toMatchObject([
        {
          work: "docs/architecture/decisions/runtime/adr-2-current.md",
          severity: "error",
        },
      ]);
    },
  );

  it("should report a missing current index target in another domain", async () => {
    await writeEffectiveAdr(workspace.root);
    const index = join(workspace.root, "docs/architecture/README.md");
    await writeFile(
      index,
      (await readFile(index, "utf8")).replace(
        "decisions/runtime/adr-1-choice.md",
        "decisions/storage/adr-1-choice.md",
      ),
    );

    expect(
      workspace.run().findings.filter(({ check }) => check === "adr-index"),
    ).toMatchObject([
      { work: "docs/architecture/README.md", severity: "error" },
      { work: "docs/architecture/README.md", severity: "error" },
    ]);
  });

  it.each([
    "../../adr-2-current.md",
    "../../storage/nested/adr-2-current.md",
    "../../storage/choice.md",
    "../storage/adr-2-current.md",
  ])(
    "should reject an existing noncanonical successor target %s",
    async (destination) => {
      await writeArchivedAdr(
        workspace.root,
        "# ADR-1: Old choice\n\n- Status: `Accepted`\n\nThe original choice.\n",
      );
      const archiveDir = join(
        workspace.root,
        "docs/architecture/decisions/superseded/runtime",
      );
      const target = join(archiveDir, destination);
      await mkdir(join(target, ".."), { recursive: true });
      await rename(join(archiveDir, "../../runtime/adr-2-current.md"), target);
      const archived = join(archiveDir, "adr-1-old-choice.md");
      await writeFile(
        archived,
        (await readFile(archived, "utf8")).replace(
          "../../runtime/adr-2-current.md",
          destination,
        ),
      );

      expect(
        workspace
          .run()
          .findings.filter(
            ({ check, work }) =>
              check === "adr-superseded" &&
              work ===
                "docs/architecture/decisions/superseded/runtime/adr-1-old-choice.md",
          ),
      ).toMatchObject([{ severity: "error" }]);
    },
  );

  it.each([
    ["decisions/adr-3-stale.md", true],
    ["decisions/adr-3-stale.md", false],
    ["decisions/Runtime/adr-3-stale.md", true],
    ["decisions/Runtime/adr-3-stale.md", false],
    ["decisions/runtime/nested/adr-3-stale.md", true],
    ["decisions/runtime/nested/adr-3-stale.md", false],
    ["decisions/runtime/superseded/adr-3-stale.md", true],
    ["decisions/runtime/superseded/adr-3-stale.md", false],
  ] as const)(
    "should report a noncanonical index target %s (exists: %s)",
    async (target, exists) => {
      await writeEffectiveAdr(workspace.root);
      const architecture = join(workspace.root, "docs/architecture");
      if (exists) {
        const path = join(architecture, target);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "# ADR-3: Stale\n\n- Status: `Accepted`\n");
      }
      await writeFile(
        join(architecture, "README.md"),
        `| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-1-choice.md) | Accepted |\n| [Stale](${target}) | Accepted |\n`,
      );

      expect(
        workspace.run().findings.filter(({ check }) => check === "adr-index"),
      ).toMatchObject([
        { work: "docs/architecture/README.md", severity: "error" },
      ]);
    },
  );

  it("should report a stale flat index link without a decisions directory", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    await mkdir(architecture, { recursive: true });
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Stale](decisions/adr-3-stale.md) | Accepted |\n",
    );

    expect(
      workspace.run().findings.filter(({ check }) => check === "adr-index"),
    ).toMatchObject([
      { work: "docs/architecture/README.md", severity: "error" },
    ]);
  });

  it("does not match archived filename substrings in current index entries", async () => {
    const architecture = join(workspace.root, "docs/architecture");
    const archived = join(architecture, "decisions/superseded/runtime");
    await mkdir(archived, { recursive: true });
    await mkdir(join(architecture, "decisions/runtime"), { recursive: true });
    await writeFile(
      join(architecture, "decisions/runtime/adr-2-notes-adr-1-cache.md"),
      "# ADR-2: Notes about cache\n\n- Status: `Accepted`\n",
    );
    await writeFile(
      join(archived, "adr-1-cache.md"),
      "> **Status:** Superseded\n>\n> **Superseded by:** [ADR-2 — Notes about cache](../../runtime/adr-2-notes-adr-1-cache.md)\n>\n> **What changed:** The complete change replaced the old choice.\n\n# ADR-1: Cache\n\n- Status: `Accepted`\n\n## Decision\n\nThe original choice.\n",
    );
    await writeFile(
      join(architecture, "README.md"),
      "| Document | Status |\n| --- | --- |\n| [Current](decisions/runtime/adr-2-notes-adr-1-cache.md) | Accepted |\n",
    );
    expect(
      workspace
        .run()
        .findings.some(
          ({ check, message }) =>
            check === "adr-index" && message.includes("archived ADR"),
        ),
    ).toBe(false);
  });
});
