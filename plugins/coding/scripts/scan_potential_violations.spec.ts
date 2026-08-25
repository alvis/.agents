import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "./scanlib/core.ts";
import { loadRules } from "./scanlib/loader.ts";
import { deriveRuleIdPrefixes } from "./scanlib/prefixes.ts";
import {
  isSpecFile,
  isTestFile,
  pythonFiles,
  sourceFiles,
  specFiles,
  tsOnly,
} from "./scanlib/predicates.ts";

interface FixtureCase {
  readonly category: string;
  readonly directory: string;
  readonly expectedFinding: ReportFinding;
  readonly inputName?: string;
}

interface ReportFinding {
  readonly lineNumber: number;
  readonly path: string;
}

interface ParsedReport {
  readonly category: string;
  readonly fileCount: number;
  readonly findings: readonly ReportFinding[];
  readonly label: string;
  readonly matchCount: number;
}

const here = import.meta.dirname;
const fixtures = resolve(here, "../tests/fixtures");
const SPEC_CORPUS = [
  "import { compute } from './source';",
  "",
  "beforeAll(() => {",
  "  setupEnv();",
  "});",
  "",
  "describe('feature', () => {",
  "  let cachedResult = 0;",
  "",
  "  beforeEach(() => {",
  "    cachedResult = compute();",
  "  });",
  "",
  "  it('uses a mock', () => {",
  "    const userMock = { id: 1 };",
  "    expect(cachedResult).toBeGreaterThanOrEqual(0);",
  "    expect(userMock.id).toBe(1);",
  "  });",
  "});",
  "",
  "function setupEnv(): void {}",
  "",
].join("\n");

const EXPECTED_FINDING_BY_CATEGORY: Readonly<Record<string, ReportFinding>> = {
  "aaa-comment": { lineNumber: 5, path: "input.spec.ts" },
  "abbreviation-denylist": { lineNumber: 3, path: "input.ts" },
  "author-stamp": { lineNumber: 2, path: "input.ts" },
  "canonical-param-name": { lineNumber: 2, path: "input.ts" },
  "catch-error-defensive": { lineNumber: 5, path: "input.ts" },
  "comment-rule-id": { lineNumber: 1, path: "input.ts" },
  "conditional-spread": { lineNumber: 4, path: "input.ts" },
  "dynamic-import-static": { lineNumber: 2, path: "input.ts" },
  "error-assertion-split": { lineNumber: 9, path: "input.spec.ts" },
  "escape-cast": { lineNumber: 3, path: "input.ts" },
  "jsdoc-fullstop": { lineNumber: 2, path: "input.ts" },
  "jsdoc-uppercase": { lineNumber: 2, path: "input.ts" },
  let: { lineNumber: 2, path: "input.ts" },
  "py-future-annotations": { lineNumber: 4, path: "input.py" },
  "py-missing-all": {
    lineNumber: 9,
    path: "violating_pkg/__init__.py",
  },
  "py-type-ignore-format": { lineNumber: 8, path: "input.py" },
  "section-name": { lineNumber: 3, path: "input.ts" },
  "silent-catch": { lineNumber: 4, path: "input.ts" },
  "source-import-path": { lineNumber: 3, path: "input.ts" },
  "star-import-export": { lineNumber: 2, path: "input.ts" },
  "test-conditional-skip": { lineNumber: 4, path: "input.spec.ts" },
  "test-dynamic-import": { lineNumber: 9, path: "input.spec.ts" },
  "test-env-access": { lineNumber: 1, path: "input.spec.ts" },
  "test-file-naming": { lineNumber: 1, path: "input.test.ts" },
  "test-hooks": { lineNumber: 2, path: "input.spec.ts" },
  "test-mock-cleanup": { lineNumber: 1, path: "input.spec.ts" },
  "test-mock-stub": { lineNumber: 3, path: "input.spec.ts" },
  "test-title-convention": { lineNumber: 4, path: "input.spec.ts" },
  "to-be-object-literal": { lineNumber: 7, path: "input.spec.ts" },
  "undefined-override": { lineNumber: 6, path: "input.spec.ts" },
  "unit-suffix": { lineNumber: 3, path: "input.ts" },
};

const fixtureCases = readdirSync(fixtures, { withFileTypes: true })
  .flatMap((entry): readonly FixtureCase[] => {
    if (!entry.isDirectory() || entry.name === "_corpus") return [];
    const directory = resolve(fixtures, entry.name);
    const inputName = readdirSync(directory).find((name) =>
      /^input\.[^.]+$/.test(name),
    );
    const expectedFinding = EXPECTED_FINDING_BY_CATEGORY[entry.name];
    if (expectedFinding === undefined)
      throw new Error(`missing structural oracle for ${entry.name}`);
    return [{ category: entry.name, directory, expectedFinding, inputName }];
  })
  .sort((left, right) => left.category.localeCompare(right.category));
const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "coding-scanner-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

async function capture(
  argv: readonly string[],
  rulesDirectory?: string,
): Promise<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const code = await run(argv, {
    rulesDirectory,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

function expectStructuralReport(
  stdout: string,
  category: string,
  expectedFinding: ReportFinding,
): void {
  const reportMatch =
    /^=== ([^\n]+) ===\n\n[\s\S]*?\n=== Summary ===\n  ([a-z0-9-]+): (\d+) matches in (\d+) files\n$/.exec(
      stdout,
    );
  if (reportMatch === null) throw new Error("scanner report shape is invalid");
  const [, label, reportedCategory, matchCountText, fileCountText] =
    reportMatch;
  const findings = [...stdout.matchAll(/^(.+):(\d+)  /gm)].map(
    ([, path, lineNumber]) => ({
      lineNumber: Number(lineNumber),
      path,
    }),
  );
  const report: ParsedReport = {
    category: reportedCategory,
    fileCount: Number(fileCountText),
    findings,
    label,
    matchCount: Number(matchCountText),
  };

  expect(report.label.trim().length).toBeGreaterThan(0);
  expect(report.category).toBe(category);
  expect(
    report.findings.every(
      (finding) =>
        !isAbsolute(finding.path) &&
        !finding.path.split(/[\\/]/).includes("..") &&
        finding.lineNumber > 0,
    ),
  ).toBe(true);
  expect({
    findingCount: report.findings.length,
    findingFileCount: new Set(report.findings.map((finding) => finding.path))
      .size,
  }).toEqual({
    findingCount: report.matchCount,
    findingFileCount: report.fileCount,
  });
  expect(report.findings).toContainEqual(expectedFinding);
}

describe("coding scanner fixture reports", () => {
  it.each(fixtureCases)(
    "should emit a structural report for $category",
    async ({ category, directory, expectedFinding, inputName }) => {
      const root =
        inputName === undefined ? directory : temporaryRoot();
      if (inputName !== undefined) {
        const source = readFileSync(resolve(directory, inputName), "utf8");
        const extension = inputName.slice("input".length);
        for (const runtimeInputName of [
          `input${extension}`,
          `input.spec${extension}`,
          `input.test${extension}`,
          `test_input${extension}`,
        ])
          writeFileSync(resolve(root, runtimeInputName), source);
      }

      const previous = process.cwd();
      process.chdir(root);
      try {
        const result = await capture([".", "--category", category]);
        expect(result.code).toBe(0);
        expectStructuralReport(result.stdout, category, expectedFinding);
      } finally {
        process.chdir(previous);
      }
    },
  );

  // This test rescans the full fixture tree once per loaded rule through real
  // subprocess captures. It is the one in this file observed exceeding the
  // default budget on hosted macOS, so the raise lives on this test alone and
  // genuine hangs elsewhere still fail fast.
  it("exposes every rule as a category", async () => {
    for (const rule of await loadRules())
      expect(
        (await capture([fixtures, "--category", rule.id])).stdout,
      ).toContain(`  ${rule.id}:`);
  }, 30_000);
});

describe("rule module loading", () => {
  it("loads unique rules sorted by order then id", async () => {
    const rules = await loadRules();
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

  it("isolates broken dynamically loaded rule modules", async () => {
    const directory = temporaryRoot();
    writeFileSync(
      resolve(directory, "boom.ts"),
      'throw new Error("intentional import-time failure");\n',
    );
    writeFileSync(
      resolve(directory, "good.ts"),
      'export const RULE = { id: "ok-rule", label: "OK", order: 0, scan: () => undefined };\n',
    );
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      expect((await loadRules(directory)).map((rule) => rule.id)).toEqual([
        "ok-rule",
      ]);
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining("failed to load rule module boom"),
      );
    } finally {
      write.mockRestore();
    }
  });
});

describe("scanner command-line handling", () => {
  it("rejects unknown categories without throwing", async () => {
    const result = await capture([fixtures, "--category", "not-a-rule"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("invalid category");
  });
  it("accepts equals-form CLI options", async () => {
    const result = await capture([
      resolve(fixtures, "let"),
      "--category=let",
      "--before=0",
      "--after=0",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("let: 1 matches in 1 files");
  });
  it("rejects malformed context widths and unknown options", async () => {
    expect((await capture(["--before=nope"])).code).toBe(2);
    expect((await capture(["--unknown"])).code).toBe(2);
  });
  it("warns for missing roots and returns a zero-match report", async () => {
    const result = await capture([
      resolve(temporaryRoot(), "missing"),
      "--category",
      "let",
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("path not found");
    expect(result.stdout).toContain("let: 0 matches in 0 files");
  });
  it("honors --no-tests only for opted-in rules", async () => {
    const root = temporaryRoot();
    copyFileSync(
      resolve(fixtures, "_corpus/source.ts"),
      resolve(root, "source.ts"),
    );
    writeFileSync(resolve(root, "feature.spec.ts"), SPEC_CORPUS);
    const result = await capture([root, "--category", "let", "--no-tests"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("feature.spec.ts:");
    expect(result.stdout).toContain("source.ts:");
  });
});

describe("path predicates and rule id prefixes", () => {
  it("keeps predicate boundaries exact", () => {
    expect(isSpecFile("thing.spec.ts")).toBe(true);
    expect(isSpecFile("thing.spec.py")).toBe(false);
    expect(isTestFile("test_thing.py")).toBe(true);
    expect(sourceFiles("thing.tsx")).toBe(true);
    expect(sourceFiles("thing.py")).toBe(false);
    expect(specFiles("thing.test.ts")).toBe(false);
    expect(pythonFiles("thing.py")).toBe(true);
    expect(tsOnly("thing.jsx")).toBe(false);
  });
  it("derives a sorted standard-prefix set", () => {
    const prefixes = deriveRuleIdPrefixes();
    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes).toEqual([...prefixes].sort());
    expect(prefixes.every((prefix) => /^[A-Z][A-Z0-9_]*$/.test(prefix))).toBe(
      true,
    );
  });
});

describe("static file read scoping", () => {
  it.each([
    ["example.spec.ts", 'readFileSync("fixture.txt");', true],
    ["example.ts", 'readFileSync("fixture.txt");', false],
    ["test_example.py", 'Path("fixture.txt").read_text()', true],
    ["test_example.py", '# Path("fixture.txt").read_text()', false],
    [
      "test_example.py",
      'message = "Path(\\"fixture.txt\\").read_text()"',
      false,
    ],
  ])("scopes static reads in %s", async (name, source, found) => {
    const root = temporaryRoot();
    writeFileSync(resolve(root, name), source);
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(result.stdout.includes(`${name}:1`)).toBe(found);
  });

  it("scans Rust integration tests and cfg(test) items but not runtime code", async () => {
    const root = temporaryRoot();
    mkdirSync(resolve(root, "tests"));
    writeFileSync(
      resolve(root, "tests", "integration.rs"),
      'fn works() { std::fs::read_to_string("x"); }\n',
    );
    writeFileSync(
      resolve(root, "lib.rs"),
      'fn runtime() { std::fs::read("x"); }\n#[cfg(test)]\nmod tests { fn works() { std::fs::read("x"); } }\n',
    );
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(result.stdout).toContain("integration.rs:1");
    expect(result.stdout).toContain("lib.rs:3");
    expect(result.stdout).not.toContain("lib.rs:1");
  });

  it.each([
    [
      "braceless",
      [
        "#[cfg(test)]",
        "const FIXTURE: Vec<u8> = std::fs::read(path).unwrap();",
        "fn production() {",
        "    std::fs::read(path).unwrap();",
        "}",
      ],
      [2],
    ],
    [
      "same-line braceless",
      [
        "#[cfg(test)] const FIXTURE: Vec<u8> = std::fs::read(path).unwrap();",
        "fn production() {",
        "    std::fs::read(path).unwrap();",
        "}",
      ],
      [1],
    ],
    [
      "same-line braced",
      [
        "#[test] fn checks_fixture() {} fn production() { std::fs::read(path).unwrap(); }",
      ],
      [],
    ],
  ])("closes %s Rust test items", async (_name, lines, expected) => {
    const root = temporaryRoot();
    writeFileSync(resolve(root, "lib.rs"), lines.join("\n"));
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(
      [...result.stdout.matchAll(/lib\.rs:(\d+)/g)].map((hit) =>
        Number(hit[1]),
      ),
    ).toEqual(expected);
  });

  it("ignores cfg(not(test)) Rust items", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "lib.rs"),
      "#[cfg(not(test))]\nfn production() { std::fs::read(path).unwrap(); }\n",
    );
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(result.stdout).not.toMatch(/lib\.rs:\d+/);
  });

  it("supports multiline Rust test attributes", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "lib.rs"),
      [
        "#[cfg(all(",
        '    feature = "fixtures" ,',
        "    test,",
        "))]",
        "mod tests { std::fs::read(path).unwrap(); }",
        "fn production() { std::fs::read(path).unwrap(); }",
      ].join("\n"),
    );
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(
      [...result.stdout.matchAll(/lib\.rs:(\d+)/g)].map((hit) =>
        Number(hit[1]),
      ),
    ).toEqual([5]);
  });

  it("ignores Rust syntax inside comments and literals", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "lib.rs"),
      [
        "#[cfg(test)]",
        "mod tests {",
        '    const BRACE: &str = "}";',
        '    const RAW: &str = r#"fs::read(path); }"#;',
        "    /* } nested /* { */ } */",
        "    fn reads_fixture() { std::fs::read(path).unwrap(); }",
        "}",
        "fn production() {",
        "    std::fs::read(path).unwrap();",
        "}",
      ].join("\n"),
    );
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(
      [...result.stdout.matchAll(/lib\.rs:(\d+)/g)].map((hit) =>
        Number(hit[1]),
      ),
    ).toEqual([6]);
  });
});

describe("spec-gated rule applicability", () => {
  it("does not flag hook-shaped calls outside spec files", async () => {
    const result = await capture([
      resolve(fixtures, "_corpus/not-a-spec.ts"),
      "--category",
      "test-hooks",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("(no matches)");
  });
});
