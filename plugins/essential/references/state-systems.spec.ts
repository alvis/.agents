import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const references = import.meta.dirname;
const essential = resolve(references, "..");
const doctor = join(essential, "skills/doctor/scripts/state-doctor");
const roots: string[] = [];
const read = (path: string) => readFile(path, "utf8");
const inlineHash = "a".repeat(64);

type Finding = { check: string; message: string; severity: string };

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

function section(document: string, heading: string): string {
  const match = new RegExp(
    `^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
    "m",
  ).exec(document);
  if (match === null) throw new Error(`missing section ${heading}`);
  return match[1]!;
}

function table(document: string): Record<string, string>[] {
  const lines = document
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|[ -]+\|/.test(line));
  const cells = lines.map((line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim().replaceAll("`", "")),
  );
  const [headers, ...rows] = cells;
  if (headers === undefined) throw new Error("missing table");
  return rows.map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, row[index] ?? ""]),
    ),
  );
}

function markerAttributes(
  document: string,
  markerName: string,
): Record<string, string> {
  const marker = new RegExp(`<${markerName}\\s+([^>]+)\\s*/>`).exec(document);
  if (marker === null) throw new Error(`missing ${markerName} marker`);
  return Object.fromEntries(
    [...marker[1]!.matchAll(/([a-z-]+)="([^"]+)"/g)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  );
}

function accessPolicy(document: string): Record<string, string> {
  return markerAttributes(document, "project-state-system-access");
}

function treePaths(document: string): string[] {
  const block = /```text\n([\s\S]*?)```/.exec(document)?.[1];
  if (block === undefined) throw new Error("missing topology tree");
  const parents: string[] = [];
  return block
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").trimEnd())
    .filter(Boolean)
    .map((line) => {
      const parsed = /^((?:│   |    )*)(?:(├── |└── ))?(.*)$/.exec(line);
      if (parsed === null) throw new Error(`invalid topology line: ${line}`);
      const prefix = parsed[1]!;
      const connector = parsed[2];
      const node = parsed[3]!.replace(/\/$/, "");
      const depth = connector === undefined ? 0 : prefix.length / 4 + 1;
      const path = depth === 0 ? node : `${parents[depth - 1]}/${node}`;
      parents.length = depth;
      parents[depth] = path;
      return path;
    });
}

function provenance(
  kind: "none" | "external" | "repo" | "inline",
  receiptBase?: string,
): string {
  if (kind === "none")
    return "- Source kind: `none`\n- Canonical specification: None\n- Accepted revision/base: None\n- Local materialization: None\n- Materialization receipt: None\n- Last verification status: `not-applicable`\n- Last verified at: None";
  if (kind === "repo")
    return "- Source kind: `repo`\n- Canonical specification: `repo:requirements/demo.md`\n- Accepted revision/base: `blob-123`\n- Local materialization: None\n- Materialization receipt: None\n- Last verification status: `verified`\n- Last verified at: `2026-08-27T12:00:00Z`";
  if (kind === "inline")
    return `- Source kind: \`inline\`\n- Canonical specification: \`inline-approved:sha256:${inlineHash}\`\n- Accepted revision/base: \`sha256:${inlineHash}\`\n- Local materialization: [spec](spec/)\n- Materialization receipt: None\n- Last verification status: \`verified\`\n- Last verified at: \`2026-08-27T12:00:00Z\``;
  if (receiptBase === undefined)
    return "- Source kind: `external`\n- Canonical specification: [Exact document](https://example.com/specification/demo)\n- Accepted revision/base: `base-1`\n- Local materialization: None\n- Materialization receipt: None\n- Last verification status: `missing`\n- Last verified at: None";
  return `- Source kind: \`external\`\n- Canonical specification: [Exact document](https://example.com/specification/demo)\n- Accepted revision/base: \`base-1\`\n- Local materialization: [spec](spec/)\n- Materialization receipt: [receipt](artifacts/spec-sync/materializations/${receiptBase}.json)\n- Last verification status: \`verified\`\n- Last verified at: \`2026-08-27T12:00:00Z\``;
}

async function project(
  kind: "none" | "external" | "repo" | "inline",
  options: { receiptBase?: string; receiptIdentity?: string } = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "state-systems-"));
  roots.push(root);
  const work = join(root, ".state/works/demo");
  await mkdir(join(work, "state"), { recursive: true });
  await writeFile(
    join(work, "goal.md"),
    `# Charter\n\n- Charter: \`approved\`\n- Charter revision: \`1\`\n\n## Goal\n\nDemonstrate the contract.\n\n## Specification provenance\n\n${provenance(kind, options.receiptBase)}\n`,
  );
  await writeFile(
    join(work, "state.md"),
    "# Work state\n\n- State role: `root`\n- Work ID: `demo`\n- Lifecycle status: `working`\n- State revision: `1`\n\n## Tasks\n\n| ID | Mark | Status | Task | Depends on | Required | Acceptance | Owner | Evidence / next action |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| DEM | - | planned | Demonstrate. [targets: none] | — | yes | Contract holds. | PM | Pending. |\n",
  );
  if (options.receiptBase !== undefined) {
    const content = "# Verified specification\n";
    await mkdir(join(work, "spec"), { recursive: true });
    await mkdir(join(work, "artifacts/spec-sync/bases/base-1"), {
      recursive: true,
    });
    await mkdir(join(work, "artifacts/spec-sync/materializations"), {
      recursive: true,
    });
    await writeFile(join(work, "spec/README.md"), content);
    await writeFile(
      join(work, "artifacts/spec-sync/bases/base-1/README.md"),
      content,
    );
    await writeFile(
      join(
        work,
        `artifacts/spec-sync/materializations/${options.receiptBase}.json`,
      ),
      JSON.stringify({
        base_id: options.receiptIdentity ?? options.receiptBase,
        canonical_url: "https://example.com/specification/demo",
        observed_external_revisions: { demo: "revision-1" },
        created_at: "2026-08-27T12:00:00Z",
        content_manifest: [
          {
            path: "README.md",
            sha256: createHash("sha256").update(content).digest("hex"),
            bytes: Buffer.byteLength(content),
          },
        ],
      }),
    );
  }
  if (kind === "inline") {
    await mkdir(join(work, "spec"), { recursive: true });
    await writeFile(join(work, "spec/README.md"), "# Inline specification\n");
    await writeFile(
      join(work, "spec/provenance.json"),
      JSON.stringify({ source_kind: "inline" }),
    );
  }
  return work;
}

function specificationFindings(work: string): Finding[] {
  const result = spawnSync(doctor, ["--work-dir", work, "--json"], {
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  return (JSON.parse(result.stdout) as { findings: Finding[] }).findings.filter(
    ({ check }) => check === "specification-provenance",
  );
}

describe("project state-system contract", () => {
  it("publishes a machine-checkable access boundary and source-selection matrix", async () => {
    const contract = await read(join(references, "state-systems.md"));

    expect(accessPolicy(contract)).toEqual({
      read: "all-agents",
      write: "main-agent",
      protected: "README.md,docs/**,.state/**,external-specification",
    });
    expect(table(section(contract, "Specification selection"))).toMatchObject([
      { "Source kind": "external", "Work-local spec/": "Optional; usable only with a matching receipt" },
      { "Source kind": "repo", "Work-local spec/": "Optional approved working copy; no generated documentation area" },
      { "Source kind": "inline", "Work-local spec/": "Required approved working copy for the active stream" },
      { "Source kind": "none", "Work-local spec/": "Not used" },
      { "Source kind": "pending", "Work-local spec/": "Not used" },
    ]);
  });

  it("keeps specification provenance out of tracked documentation", async () => {
    const metadata = await read(
      resolve(
        essential,
        "../specification/skills/spec-code/references/frontmatter.md",
      ),
    );
    expect(metadata).toContain("<work-local-specification-provenance");
  });

  it("always probes an external source before review", async () => {
    const review = await read(
      resolve(
        essential,
        "../specification/skills/review-implementation/SKILL.md",
      ),
    );

    expect(markerAttributes(review, "external-review-freshness")).toEqual({
      source: "external",
      action: "sync-spec:materialize",
      owner: "main-agent",
      when: "always",
      delegated: "request-main-agent-refresh",
      "remote-change": "needs_revalidation",
    });
  });

  it("keeps protected specification flows with the main agent", async () => {
    const [specCode, implementCode] = await Promise.all([
      read(resolve(essential, "../specification/skills/spec-code/SKILL.md")),
      read(
        resolve(essential, "../specification/skills/implement-code/SKILL.md"),
      ),
    ]);
    const expected = {
      owner: "main-agent",
      delegated: "return-proposals-and-refresh-requests",
      protected: "README.md,docs/**,.state/**,external-specification",
    };

    expect(markerAttributes(specCode, "spec-code-protected-ownership")).toEqual(
      expected,
    );
    expect(
      markerAttributes(implementCode, "implement-code-protected-ownership"),
    ).toEqual({
      owner: "main-agent",
      delegated: "return-proposals-and-refresh-requests",
      documentation: "pause-for-main-agent-apply",
      protected: "README.md,docs/**,.state/**,external-specification",
    });
  });

  it("keeps each complete layout in its owning structural tree", async () => {
    const [durable, local] = await Promise.all([
      read(join(references, "durable-documentation.md")),
      read(join(references, "work-memory-topology.md")),
    ]);

    expect(treePaths(durable)).toEqual([
      "<repository>",
      "<repository>/README.md",
      "<repository>/docs",
      "<repository>/docs/README.md",
      "<repository>/docs/architecture",
      "<repository>/docs/architecture/README.md",
      "<repository>/docs/architecture/<architecture-concern>.md",
      "<repository>/docs/architecture/<architecture-concern>/*.md",
      "<repository>/docs/architecture/decisions",
      "<repository>/docs/architecture/decisions/<nnnn>-<decision>.md",
      "<repository>/docs/architecture/decisions/superseded/<nnnn>-<decision>.md",
      "<repository>/docs/design",
      "<repository>/docs/design/README.md",
      "<repository>/docs/design/system.md",
      "<repository>/docs/design/system/*.md",
      "<repository>/docs/design/<design>.md",
      "<repository>/docs/design/<design>/*.md",
      "<repository>/docs/<domain>",
      "<repository>/docs/<domain>/README.md",
      "<repository>/docs/<domain>/<item>/...",
    ]);
    expect(treePaths(local)).toEqual([
      ".state",
      ".state/overview.md",
      ".state/environment.md",
      ".state/traps.md",
      ".state/notion",
      ".state/archive/<work-id>",
      ".state/works/<work-id>",
      ".state/works/<work-id>/goal.md",
      ".state/works/<work-id>/state.md",
      ".state/works/<work-id>/lease.json",
      ".state/works/<work-id>/state",
      ".state/works/<work-id>/state/working.md",
      ".state/works/<work-id>/state/journal.md",
      ".state/works/<work-id>/state/revisions.md",
      ".state/works/<work-id>/state/unresolved.md",
      ".state/works/<work-id>/state/plan.md",
      ".state/works/<work-id>/state/discovery.md",
      ".state/works/<work-id>/spec",
      ".state/works/<work-id>/proposals.md",
      ".state/works/<work-id>/proposals/*.md",
      ".state/works/<work-id>/changes.md",
      ".state/works/<work-id>/changes/*.md",
      ".state/works/<work-id>/decisions.md",
      ".state/works/<work-id>/decisions/*.md",
      ".state/works/<work-id>/design.md",
      ".state/works/<work-id>/design/*.md",
      ".state/works/<work-id>/review.md",
      ".state/works/<work-id>/reviews/*.md",
      ".state/works/<work-id>/artifacts",
      ".state/works/<work-id>/artifacts/spec-sync",
      ".state/works/<work-id>/artifacts/spec-sync/bases/<base-id>",
      ".state/works/<work-id>/artifacts/spec-sync/materializations",
      ".state/works/<work-id>/artifacts/spec-sync/materializations/<base-id>.json",
    ]);
  });

  it.each(["none", "external", "repo", "inline"] as const)(
    "accepts the %s source workflow without a verified external copy",
    async (kind) => {
      expect(specificationFindings(await project(kind))).toEqual([]);
    },
  );

  it("accepts a repo source with an approved work-local copy", async () => {
    const work = await project("repo");
    await mkdir(join(work, "spec"), { recursive: true });
    await writeFile(join(work, "spec/README.md"), "# Repository specification\n");
    const goal = join(work, "goal.md");
    await writeFile(
      goal,
      (await readFile(goal, "utf8")).replace(
        "Local materialization: None",
        "Local materialization: [spec](spec/)",
      ),
    );
    expect(specificationFindings(work)).toEqual([]);
  });

  it("rejects canonical references that do not match their declared source kind", async () => {
    let work = await project("repo");
    const repoGoal = join(work, "goal.md");
    await writeFile(
      repoGoal,
      (await readFile(repoGoal, "utf8")).replace(
        "`repo:requirements/demo.md`",
        "[External](https://example.com/specification/demo)",
      ),
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("inline");
    const inlineGoal = join(work, "goal.md");
    await writeFile(
      inlineGoal,
      (await readFile(inlineGoal, "utf8")).replace(
        `\`inline-approved:sha256:${inlineHash}\``,
        "`repo:requirements/demo.md`",
      ),
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("inline");
    const mismatchedGoal = join(work, "goal.md");
    await writeFile(
      mismatchedGoal,
      (await readFile(mismatchedGoal, "utf8")).replace(
        `\`sha256:${inlineHash}\``,
        `\`sha256:${"b".repeat(64)}\``,
      ),
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);
  });

  it("accepts a verified external copy only when its receipt matches goal.md", async () => {
    expect(
      specificationFindings(
        await project("external", { receiptBase: "base-1" }),
      ),
    ).toEqual([]);

    expect(
      specificationFindings(
        await project("external", { receiptBase: "base-2" }),
      ),
    ).toMatchObject([{ severity: "error", check: "specification-provenance" }]);

    expect(
      specificationFindings(
        await project("external", {
          receiptBase: "base-1",
          receiptIdentity: "other-base",
        }),
      ),
    ).toMatchObject([{ severity: "error", check: "specification-provenance" }]);
  });

  it("rejects missing bases, incomplete manifests, and modified local copies", async () => {
    let work = await project("external", { receiptBase: "base-1" });
    await rm(join(work, "artifacts/spec-sync/bases/base-1"), {
      recursive: true,
    });
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("external", { receiptBase: "base-1" });
    await writeFile(
      join(work, "artifacts/spec-sync/materializations/base-1.json"),
      JSON.stringify({ base_id: "base-1" }),
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("external", { receiptBase: "base-1" });
    await writeFile(join(work, "spec/README.md"), "# Modified specification\n");
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);
  });

  it("rejects unsafe base identifiers and symlinked materialization paths", async () => {
    let work = await project("external", { receiptBase: "base-1" });
    const goal = join(work, "goal.md");
    await writeFile(
      goal,
      (await readFile(goal, "utf8"))
        .replace(
          "Accepted revision/base: `base-1`",
          "Accepted revision/base: `../escape`",
        )
        .replace(
          "materializations/base-1.json",
          "materializations/../escape.json",
        ),
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("external", { receiptBase: "base-1" });
    await rm(join(work, "spec"), { recursive: true });
    await symlink(
      join(work, "artifacts/spec-sync/bases/base-1"),
      join(work, "spec"),
      "dir",
    );
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("external", { receiptBase: "base-1" });
    const receipt = join(
      work,
      "artifacts/spec-sync/materializations/base-1.json",
    );
    const receiptBody = await readFile(receipt);
    const receiptTarget = join(work, "artifacts/spec-sync/receipt-target.json");
    await writeFile(receiptTarget, receiptBody);
    await rm(receipt);
    await symlink(receiptTarget, receipt, "file");
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);

    work = await project("external", { receiptBase: "base-1" });
    const materializations = join(work, "artifacts/spec-sync/materializations");
    const parentReceipt = join(materializations, "base-1.json");
    const parentReceiptBody = await readFile(parentReceipt);
    const parentTarget = join(work, "artifacts/spec-sync/receipt-target");
    await rm(materializations, { recursive: true });
    await mkdir(parentTarget, { recursive: true });
    await writeFile(join(parentTarget, "base-1.json"), parentReceiptBody);
    await symlink(parentTarget, materializations, "dir");
    expect(specificationFindings(work)).toMatchObject([
      { severity: "error", check: "specification-provenance" },
    ]);
  });

  it("routes every injected context to the authority within its byte budget", async () => {
    const hooks = await Promise.all(
      ["ALLAGENT.md", "MAINAGENT.md", "SUBAGENT.md"].map((name) =>
        read(join(essential, "hooks", name)),
      ),
    );

    for (const hook of hooks) {
      const references = [
        ...hook.matchAll(/`\{\{PLUGIN_DIR\}\}\/([^`]+)`/g),
      ].map((match) => match[1]);
      expect(references).toContain("references/state-systems.md");
      expect(
        Buffer.byteLength(hook),
        "hook payload byte budget",
      ).toBeLessThanOrEqual(2_000);
    }
  });
});
