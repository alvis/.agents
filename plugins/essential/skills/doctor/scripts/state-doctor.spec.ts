import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
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
  it("should accept an optional superseded task with structured replacement evidence", async () => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "no", "reason: Scope changed; replaced-by: BBB, CCC;") +
        row("BBB", "-", "planned") + row("CCC"),
    );
    expect(workspace.run("--strict")).toMatchObject({ code: 0, findings: [] });
  });
  it.each([
    ["missing reason", "replaced-by: BBB;", "evidence"],
    ["empty reason", "reason: ; replaced-by: BBB;", "evidence"],
    ["missing replacement", "reason: Scope changed;", "evidence"],
    ["empty replacement", "reason: Scope changed; replaced-by: ;", "evidence"],
    ["unknown replacement", "reason: Scope changed; replaced-by: ZZZ;", "replacement"],
    ["self replacement", "reason: Scope changed; replaced-by: AAA;", "replacement"],
  ])("should diagnose %s for superseded work", async (_case, evidence, check) => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "no", evidence) + row("BBB"),
    );
    expect(workspace.run("--strict").findings.some((finding) =>
      finding.severity === "error" && finding.check === check && finding.message.includes("AAA"),
    )).toBe(true);
  });
  it("should diagnose cyclic replacements", async () => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: BBB;") +
        row("BBB", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: AAA;"),
    );
    expect(workspace.run("--strict").findings.some(({ severity, check, message }) =>
      severity === "error" && check === "replacement" && /cycle/i.test(message),
    )).toBe(true);
  });
  it("should reject a required superseded task before its obligation transfers", async () => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "yes", "reason: Revised; replaced-by: BBB;") + row("BBB"),
    );
    expect(workspace.run("--strict").findings.some(({ severity, check, message }) =>
      severity === "error" && check === "roll-up" && message.includes("AAA"),
    )).toBe(true);
  });
  it.each(["true", "Yes", ""])(
    "should reject a superseded task with noncanonical Required value %j",
    async (required) => {
      await workspace.writeState(
        row("AAA", "↪", "superseded", "—", required, "reason: Revised; replaced-by: BBB;") +
          row("BBB"),
      );
      const result = workspace.run("--strict");
      expect(result.code).toBe(1);
      expect(result.findings.some(({ severity, check, message }) =>
        severity === "error" && check === "roll-up" && message.includes("AAA"),
      )).toBe(true);
    },
  );
  it("should require a planned dependent on superseded work to be blocked", async () => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: CCC;") +
        row("BBB", "-", "planned", "AAA") + row("CCC"),
    );
    expect(workspace.run("--strict").findings.some(({ severity, check, message }) =>
      severity === "error" && check === "dependency" && message.includes("BBB"),
    )).toBe(true);
  });
  it("should accept a blocked dependent with an unblock action", async () => {
    await workspace.writeState(
      row("AAA", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: CCC;") +
        row("BBB", "!", "blocked", "AAA", "yes", "unblock: Retarget the dependency to CCC.") + row("CCC"),
    );
    expect(workspace.run("--strict")).toMatchObject({ code: 0, findings: [] });
  });
  it.each([
    ["superseded", "↪", "reason: Revised; replaced-by: CCC;"],
    ["cancelled", "⊘", "Removed in revision."],
  ])("should preserve done history after its dependency is %s", async (status, mark, evidence) => {
    await workspace.writeState(
      row("AAA", mark, status, "—", "no", evidence) +
        row("BBB", "✓", "done", "AAA", "yes", "Completed before retirement.") +
        row("CCC"),
    );
    const findings = workspace.run("--strict").findings.filter(({ check, message }) =>
      check === "dependency" && message.includes("BBB"),
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ message, fix }) =>
      !/\bblock\b|\bblocked\b/iu.test(`${message} ${fix ?? ""}`),
    )).toBe(true);
  });
  it("should reject a completed parent with a required superseded child", async () => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "yes", "Rolled up.") +
        row("AAA01", "↪", "superseded", "—", "yes", "reason: Revised; replaced-by: BBB;") + row("BBB"),
    );
    expect(checks(workspace.run("--strict").findings)).toContain("roll-up");
  });
  it.each([
    ["done", "✓", "done", "✓", "done"],
    ["superseded", "↪", "superseded", "↪", "superseded"],
    ["cancelled", "⊘", "cancelled", "⊘", "cancelled"],
  ])("should accept %s rollup for optional terminal children", async (_case, parentMark, parentStatus, childMark, childStatus) => {
    const evidence = childStatus === "superseded" ? "reason: Revised; replaced-by: BBB;" : "Terminal evidence.";
    await workspace.writeState(
      row("AAA", parentMark, parentStatus, "—", "no", evidence) +
        row("AAA01", childMark, childStatus, "—", "no", evidence) + row("BBB"),
    );
    expect(workspace.run("--strict")).toMatchObject({ code: 0, findings: [] });
  });
  it.each([
    ["done", "✓", "done", "✓", "done"],
    ["superseded", "↪", "superseded", "⊘", "cancelled"],
  ])("should select %s for mixed optional terminal children", async (_case, parentMark, parentStatus, firstMark, firstStatus) => {
    await workspace.writeState(
      row("AAA", parentMark, parentStatus, "—", "no", "reason: Revised; replaced-by: BBB;") +
        row("AAA01", firstMark, firstStatus, "—", "no", "Terminal evidence.") +
        row("AAA02", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: BBB;") +
        row("AAA03", "⊘", "cancelled", "—", "no", "Removed in revision.") + row("BBB"),
    );
    expect(workspace.run("--strict")).toMatchObject({ code: 0, findings: [] });
  });
  it("should reject the wrong parent rollup for optional terminal children", async () => {
    await workspace.writeState(
      row("AAA", "⊘", "cancelled", "—", "no", "Removed in revision.") +
        row("AAA01", "↪", "superseded", "—", "no", "reason: Revised; replaced-by: BBB;") + row("BBB"),
    );
    expect(workspace.run("--strict").findings.some(({ check, message }) =>
      check === "roll-up" && message.includes("AAA"),
    )).toBe(true);
  });
  it.each([
    ["planned", "-"],
    ["working", "⧗"],
  ])("should reject a done all-optional parent with a %s child", async (childStatus, childMark) => {
    await workspace.writeState(
      row("AAA", "✓", "done", "—", "no", "Rolled up.") +
        row("AAA01", childMark, childStatus, "—", "no"),
    );
    const result = workspace.run("--strict");
    expect(result.code).toBe(1);
    expect(result.findings.some(({ severity, check, message }) =>
      severity === "error" && check === "roll-up" && message.includes("AAA"),
    )).toBe(true);
  });

  it.each([
    ["superseded", "↪", "reason: Revised; replaced-by: BBB;", "-", "planned", "no"],
    ["superseded", "↪", "reason: Revised; replaced-by: BBB;", "⧗", "working", "no"],
    ["superseded", "↪", "reason: Revised; replaced-by: BBB;", "✓", "done", "yes"],
    ["cancelled", "⊘", "Removed in revision.", "-", "planned", "no"],
    ["cancelled", "⊘", "Removed in revision.", "⧗", "working", "no"],
    ["cancelled", "⊘", "Removed in revision.", "✓", "done", "yes"],
  ])("should reject a %s optional parent with a nonterminal or required child (%s, %s, %s, %s, %s)", async (parentStatus, parentMark, evidence, childMark, childStatus, childRequired) => {
    await workspace.writeState(
      row("AAA", parentMark, parentStatus, "—", "no", evidence) +
        row("AAA01", childMark, childStatus, "—", childRequired, "Completed when done.") +
        row("BBB"),
    );
    const result = workspace.run("--strict");
    expect(result.code).toBe(1);
    expect(result.findings.some(({ severity, check, message }) =>
      severity === "error" && check === "roll-up" && message.includes("AAA"),
    )).toBe(true);
  });

  it("should reject planned descendants of a blocked predecessor through direct and inherited edges", async () => {
    await workspace.writeState(
      row("AAA", "!", "blocked", "—", "yes", "unblock: Resolve the prerequisite.") +
        row("BBB", "-", "planned", "AAA") +
        row("CCC", "-", "planned", "BBB") +
        row("DDD", "-", "planned", "AAA") +
        row("DDD01", "-", "planned") +
        row("EEE", "✓", "done", "AAA", "yes", "Completed before the block."),
    );
    const result = workspace.run("--strict");
    expect(result.code).toBe(1);
    for (const id of ["BBB", "CCC", "DDD", "DDD01"])
      expect(result.findings.some(({ severity, check, message }) =>
        severity === "error" && check === "dependency" && message.includes(id),
      ), id).toBe(true);
    expect(result.findings.some(({ check, message }) =>
      check === "dependency" && message.includes("EEE"),
    )).toBe(false);
  });

  it("should traverse a branching dependency graph without revisiting shared ancestors", async () => {
    const ids = Array.from({ length: 40 }, (_, index) =>
      `A${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`,
    );
    const rows = ids.map((id, index) =>
      row(id, "-", "planned", index < 2 ? "—" : `${ids[index - 1]}, ${ids[index - 2]}`),
    );
    await workspace.writeState(rows.join(""));

    const clean = spawnSync(doctor, ["--work-dir", workspace.workDir, "--json", "--strict"], {
      encoding: "utf8",
      // pre-fix 30/40-node graphs exceeded 3s; 7s allows process startup while bounding traversal.
      timeout: 7_000,
    });
    expect(clean.error).toBeUndefined();
    expect(clean.status).toBe(0);
    expect(JSON.parse(clean.stdout).findings).toStrictEqual([]);

    rows[0] = row(ids[0]!, "!", "blocked", "—", "yes", "unblock: Repair the root task.");
    await workspace.writeState(rows.join(""));
    const findings = workspace.run("--strict").findings;
    expect(findings.some(({ check, message }) =>
      check === "dependency" && message.includes(`${ids.at(-1)}: planned downstream`),
    )).toBe(true);
  }, 15_000);

  it.each([
    ["blocked", "!", "unblock: Resolve the prerequisite."],
    ["failed", "X", "attempt: Build failed; retry: Repair the prerequisite."],
  ])("should reject working work downstream of a %s predecessor", async (status, mark, evidence) => {
    await workspace.writeState(
      row("AAA", mark, status, "—", "yes", evidence) +
        row("BBB", "⧗", "working", "AAA"),
    );
    const result = workspace.run("--strict");
    expect(result.code).toBe(1);
    expect(result.findings.some(({ severity, check, message }) =>
      severity === "error" && check === "dependency" && message.includes("BBB"),
    )).toBe(true);
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

describe("state references and decisions", () => {
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
});
