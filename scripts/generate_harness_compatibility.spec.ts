import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkMatrix, parseArgs, render } from "./generate_harness_compatibility.ts";

const here = import.meta.dirname;
const generator = resolve(here, "generate_harness_compatibility.ts");
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
describe("matrix rendering", () => {
  it("renders identical output on repeated calls", () => {
    expect(render()).toBe(render());
  });
  it("should render structurally valid tables with unique feature identities", () => {
    const tables = render()
      .split(/\n(?=## )/)
      .map((section) =>
        section
          .split("\n")
          .filter((line) => line.startsWith("| "))
          .map((line) =>
            line
              .slice(1, -1)
              .split("|")
              .map((cell) => cell.trim()),
          ),
      )
      .filter((table) => table.length > 0);

    expect(tables.length).toBeGreaterThan(0);
    const identities: string[] = [];
    for (const table of tables) {
      expect(table.length).toBeGreaterThan(2);
      const columnCount = table[0]!.length;
      expect(columnCount).toBeGreaterThan(1);
      for (const cells of table) {
        expect(cells).toHaveLength(columnCount);
        expect(cells.every((cell) => cell.length > 0)).toBe(true);
      }
      identities.push(...table.slice(2).map(([identity]) => identity!));
    }
    expect(identities.length).toBeGreaterThan(0);
    expect(new Set(identities).size).toBe(identities.length);
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
});

describe("staleness verification seam", () => {
  it("should accept a freshly rendered temporary matrix", () => {
    const target = join(temporaryRoot(), "COMPATIBILITY.md");
    writeFileSync(target, render());
    expect(checkMatrix(target)).toBeUndefined();
  });
  it("rejects a tampered copy through the explicit-target seam", () => {
    const tampered = join(temporaryRoot(), "COMPATIBILITY.md");
    writeFileSync(tampered, `${render()}\n`);
    expect(checkMatrix(tampered)).toBe(stalenessMessage);
  });
  it("rejects a missing target", () => {
    expect(checkMatrix(join(temporaryRoot(), "absent.md"))).toBe(
      stalenessMessage,
    );
  });
});
