import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../../coding/scripts/scanlib/core.ts";
import { loadRules } from "../../coding/scripts/scanlib/loader.ts";
import { scanBarrel } from "./scanners/barrel-missing-props-reexport.ts";

interface CaptureResult {
  readonly code: number;
  readonly stdout: string;
}

interface FixtureCase {
  readonly category: string;
  readonly directory: string;
  readonly expectedFinding?: ReportFinding;
  readonly name: string;
}

interface ReportFinding {
  readonly lineNumber: number;
  readonly path: string;
}

const here = import.meta.dirname;
const fixtures = resolve(here, "../tests/fixtures");
const rulesDirectory = resolve(here, "scanners");
const roots: string[] = [];
const EXPECTED_FINDING_BY_FIXTURE: Readonly<Record<string, ReportFinding>> = {
  "barrel-missing-props-reexport": { lineNumber: 1, path: "index.ts" },
  barrel: { lineNumber: 2, path: "index.ts" },
  "props-children-inline": { lineNumber: 4, path: "input.tsx" },
  "props-element-handrolled": { lineNumber: 4, path: "input.tsx" },
  "props-interface": { lineNumber: 2, path: "input.tsx" },
};
const fixtureCases = readdirSync(fixtures, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry): FixtureCase => {
    const directory = resolve(fixtures, entry.name);
    const categoryFile = resolve(directory, "category.txt");
    return {
      category: existsSync(categoryFile)
        ? readFileSync(categoryFile, "utf8").trim()
        : entry.name,
      directory,
      expectedFinding: EXPECTED_FINDING_BY_FIXTURE[entry.name],
      name: entry.name,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

function runBun(command: readonly string[]): {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const args = command[0] === process.execPath ? command.slice(1) : command;
  const result = spawnSync("bun", args, { encoding: "utf8" });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
async function capture(
  argv: readonly string[],
  directory = rulesDirectory,
): Promise<CaptureResult> {
  let stdout = "";
  const code = await run(argv, {
    rulesDirectory: directory,
    stdout: (text) => {
      stdout += text;
    },
  });
  return { code, stdout };
}

function expectStructuralReport(
  stdout: string,
  category: string,
  expectedFinding?: ReportFinding,
): void {
  const reportMatch =
    /^=== ([^\n]+) ===\n\n[\s\S]*?\n=== Summary ===\n  ([a-z0-9-]+): (\d+) matches in (\d+) files\n$/.exec(
      stdout,
    );
  if (reportMatch === null) throw new Error("scanner report shape is invalid");
  const [, label, reportedCategory, matchCountText, fileCountText] =
    reportMatch;
  const findings: readonly ReportFinding[] = [
    ...stdout.matchAll(/^(.+):(\d+)  /gm),
  ].map(([, path, lineNumber]) => ({
    lineNumber: Number(lineNumber),
    path,
  }));
  const matchCount = Number(matchCountText);
  const fileCount = Number(fileCountText);

  expect(label.trim().length).toBeGreaterThan(0);
  expect(reportedCategory).toBe(category);
  expect(
    findings.every(
      (finding) =>
        !isAbsolute(finding.path) &&
        !finding.path.split(/[\\/]/).includes("..") &&
        finding.lineNumber > 0,
    ),
  ).toBe(true);
  expect({
    findingCount: findings.length,
    findingFileCount: new Set(findings.map((finding) => finding.path)).size,
  }).toEqual({
    findingCount: matchCount,
    findingFileCount: fileCount,
  });
  if (expectedFinding === undefined) expect(matchCount).toBe(0);
  else expect(findings).toContainEqual(expectedFinding);
}

describe("react scanner fixture reports", () => {
  it.each(fixtureCases)(
    "should emit a structural report for $name",
    async ({ category, directory, expectedFinding }) => {
      const previous = process.cwd();
      process.chdir(directory);
      try {
        const result = await capture([".", "--category", category]);
        expect(result.code).toBe(0);
        expectStructuralReport(result.stdout, category, expectedFinding);
      } finally {
        process.chdir(previous);
      }
    },
  );
});

describe("react rule loading", () => {
  it("loads unique rules sorted by order", async () => {
    const rules = await loadRules(rulesDirectory);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
    expect(rules.map((rule) => [rule.order, rule.id])).toEqual(
      [...rules]
        .sort(
          (left, right) =>
            left.order - right.order || left.id.localeCompare(right.id),
        )
        .map((rule) => [rule.order, rule.id]),
    );
  });
  it("skips underscore helpers and isolates a broken rule", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "react-rules-"));
    roots.push(directory);
    writeFileSync(
      resolve(directory, "_helper.ts"),
      'throw new Error("must not load");',
    );
    writeFileSync(
      resolve(directory, "broken.ts"),
      'throw new Error("broken");',
    );
    writeFileSync(
      resolve(directory, "good.ts"),
      'export const RULE = { id: "good", label: "Good", order: 0, scan: () => undefined };',
    );
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect((await loadRules(directory)).map((rule) => rule.id)).toEqual([
      "good",
    ]);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("broken"));
  });
});

describe("barrel re-export scanning", () => {
  it("isolates an unreadable barrel sibling and scans later re-exports", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "react-barrel-"));
    roots.push(directory);
    const index = resolve(directory, "index.ts");
    const bad = resolve(directory, "bad.ts");
    const good = resolve(directory, "good.ts");
    writeFileSync(bad, "export interface BadProps {}\n");
    writeFileSync(good, "export interface GoodProps {}\n");
    const lines = [
      'export { Bad } from "./bad";',
      'export { Good } from "./good";',
    ];
    const matches: Array<{ path: string; lineno: number; line: string }> = [];
    const reads: string[] = [];
    scanBarrel({ path: index, lines, matches }, (sibling) => {
      reads.push(sibling);
      if (sibling === bad) throw new Error("EACCES: unreadable sibling");
      return readFileSync(sibling, "utf8");
    });
    expect(reads).toEqual([bad, good]);
    expect(matches).toEqual([
      {
        path: index,
        lineno: 2,
        line: 'export { Good } from "./good";   # missing: GoodProps',
      },
    ]);
  });
});

describe("scanlib CLI wiring", () => {
  it("requires the --scanlib CLI option", () => {
    const result = runBun([
      process.execPath,
      "run",
      resolve(here, "scan_potential_violations.ts"),
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("--scanlib");
  });
  it("accepts the supplied Coding scanlib", () => {
    const result = runBun([
      process.execPath,
      "run",
      resolve(here, "scan_potential_violations.ts"),
      "--scanlib",
      resolve(here, "../../coding/scripts/scanlib"),
      fixtures,
      "--category",
      "props-interface",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("props-interface:");
  });
  it("accepts the equals form of --scanlib", () => {
    const result = runBun([
      process.execPath,
      "run",
      resolve(here, "scan_potential_violations.ts"),
      `--scanlib=${resolve(here, "../../coding/scripts/scanlib")}`,
      fixtures,
      "--category",
      "props-interface",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("props-interface:");
  });
});
