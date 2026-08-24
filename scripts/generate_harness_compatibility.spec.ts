import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkMatrix, parseArgs, render } from "./generate_harness_compatibility.ts";

const here = import.meta.dirname;
const generator = resolve(here, "generate_harness_compatibility.ts");
const committedMatrix = resolve(here, "../COMPATIBILITY.md");
const stalenessMessage =
  "COMPATIBILITY.md is stale; rerun scripts/generate_harness_compatibility.ts";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "compatibility-"));
  roots.push(root);
  return root;
}
function row(fragment: string): string {
  const line = render()
    .split("\n")
    .find((candidate) => candidate.includes(`| \`${fragment}\` skill |`));
  expect(line, `matrix row for ${fragment}`).toBeDefined();
  return line!;
}

describe("matrix rendering", () => {
  it("renders identical output on repeated calls", () => {
    expect(render()).toBe(render());
  });
  it("matches the committed compatibility matrix byte for byte", () => {
    expect(readFileSync(committedMatrix, "utf8")).toBe(render());
  });
});

describe("skill classification", () => {
  it("marks integration-caveat skills external in every harness", () => {
    expect(row("coding:pr")).toBe(
      "| `coding:pr` skill | 🔌 Integration | 🔌 Integration | 🔌 Integration | 🔌 Integration | Requires authenticated GitHub tooling. Source: [plugins/coding/skills/pr/SKILL.md](plugins/coding/skills/pr/SKILL.md). |",
    );
  });
  it("keeps the agent installer native except under OpenCode V1", () => {
    expect(row("essential:install-agents")).toBe(
      "| `essential:install-agents` skill | ✅ Native | ✅ Native | ✅ Native | ❌ Unavailable | The projector already installs OpenCode agents; this skill's installer supports Claude Code, Codex, and Grok Build. Source: [plugins/essential/skills/install-agents/SKILL.md](plugins/essential/skills/install-agents/SKILL.md). |",
    );
  });
  it("keeps default skills adapted for Grok and OpenCode with projected names", () => {
    expect(row("coding:presetter")).toBe(
      "| `coding:presetter` skill | ✅ Native | ✅ Native | 🟡 Adapted | 🟡 Adapted | OpenCode name: `coding-presetter`. Source: [plugins/coding/skills/presetter/SKILL.md](plugins/coding/skills/presetter/SKILL.md). |",
    );
  });
  it("appends the hook caveat to the commit skill's adapted projection", () => {
    expect(row("coding:commit")).toContain(
      "OpenCode name: `coding-commit`. Skill-scoped backup and post-rewrite hooks are unavailable.",
    );
  });
  it("scopes Claude-only installation skills to Claude Code", () => {
    expect(row("essential:install-output-styles")).toBe(
      "| `essential:install-output-styles` skill | ✅ Native | ❌ Unavailable | ❌ Unavailable | ❌ Unavailable | Claude-only by contract. Source: [plugins/essential/skills/install-output-styles/SKILL.md](plugins/essential/skills/install-output-styles/SKILL.md). |",
    );
  });
});

describe("command-line contract", () => {
  it("parses --check, help requests, and unknown arguments", () => {
    expect(parseArgs([])).toEqual({
      kind: "arguments",
      value: { check: false },
    });
    expect(parseArgs(["--check"])).toEqual({
      kind: "arguments",
      value: { check: true },
    });
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["extra"])).toEqual({
      kind: "error",
      message: "unrecognized arguments: extra",
    });
  });
  it("prints argparse help on stdout", () => {
    const result = spawnSync("bun", [generator, "--help"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "usage: generate_harness_compatibility.ts [-h] [--check]\n\nGenerate the source-derived harness compatibility matrix.\n\noptions:\n  -h, --help  show this help message and exit\n  --check     Fail when the committed compatibility matrix is stale.\n",
    );
  });
  it("fails with argparse usage on unknown arguments", () => {
    const result = spawnSync("bun", [generator, "extra"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(
      "usage: generate_harness_compatibility.ts [-h] [--check]\ngenerate_harness_compatibility.ts: error: unrecognized arguments: extra\n",
    );
  });
  it("verifies the fresh committed matrix through --check", () => {
    const result = spawnSync("bun", [generator, "--check"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

describe("staleness verification seam", () => {
  it("accepts the current matrix", () => {
    expect(checkMatrix(committedMatrix)).toBeUndefined();
  });
  it("rejects a tampered copy through the explicit-target seam", () => {
    const tampered = join(temporaryRoot(), "COMPATIBILITY.md");
    writeFileSync(tampered, `${readFileSync(committedMatrix, "utf8")}\n`);
    expect(checkMatrix(tampered)).toBe(stalenessMessage);
  });
  it("rejects a missing target", () => {
    expect(checkMatrix(join(temporaryRoot(), "absent.md"))).toBe(
      stalenessMessage,
    );
  });
});
