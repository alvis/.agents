import { spawnSync } from "node:child_process";
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
      const root = inputName === undefined ? directory : temporaryRoot();
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

  it("should accept the ty type-suite prefix", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "input.spec.ts"),
      [
        'describe("ty:Config", () => {',
        '  it("should preserve representative assignability", () => {});',
        "});",
        "",
      ].join("\n"),
    );

    const previous = process.cwd();
    process.chdir(root);
    try {
      const result = await capture([
        ".",
        "--category",
        "test-title-convention",
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("(no matches)");
      expect(result.stdout).toContain(
        "test-title-convention: 0 matches in 0 files",
      );
    } finally {
      process.chdir(previous);
    }
  });

  it("should exclude compiler tests while reporting runtime access", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "input.test-d.ts"),
      [
        "type Fetch = typeof globalThis.fetch;",
        "type Environment = typeof process.env;",
        "globalThis.fetch = fakeFetch;",
        "process.env = fakeEnvironment;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      resolve(root, "configured.spec.ts"),
      [
        "type Fetch = typeof globalThis.fetch;",
        "globalThis.fetch = fakeFetch;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      resolve(root, "input.spec.ts"),
      [
        'const hasFetch = typeof globalThis.fetch === "function";',
        'const hasEnvironment = typeof process.env === "object";',
        "const fetch = globalThis.fetch;",
        "const environment = process.env;",
        "globalThis.fetch = fakeFetch;",
        "process.env = fakeEnvironment;",
        "",
      ].join("\n"),
    );

    const result = await capture([
      root,
      "--category",
      "test-env-access",
      "--test-root",
      root,
      "--test-pattern",
      "**/configured.spec.ts",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("input.test-d.ts:");
    expect(result.stdout).not.toContain("configured.spec.ts:");
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:1  /m);
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:2  /m);
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:3  /m);
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:4  /m);
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:5  /m);
    expect(result.stdout).toMatch(/^[^\n]*input\.spec\.ts:6  /m);
    expect(result.stdout).toContain("test-env-access: 6 matches in 1 files");
  });

  it("should exclude compiler tests from runtime import and cleanup scans", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "input.test-d.ts"),
      [
        'type Exported = import("pkg").Exported;',
        'type Reset = Client["reset"];',
        "",
      ].join("\n"),
    );
    writeFileSync(
      resolve(root, "configured.spec.ts"),
      [
        'type Exported = import("pkg").Exported;',
        "expectType<Reset>(client.reset);",
        "",
      ].join("\n"),
    );
    writeFileSync(
      resolve(root, "runtime.spec.ts"),
      ['const module = await import("pkg");', "client.reset();", ""].join(
        "\n",
      ),
    );
    const common = [
      root,
      "--test-root",
      root,
      "--test-pattern",
      "**/configured.spec.ts",
    ];

    const dynamicImport = await capture([
      ...common,
      "--category",
      "test-dynamic-import",
    ]);
    const cleanup = await capture([
      ...common,
      "--category",
      "test-mock-cleanup",
    ]);

    expect(dynamicImport.code).toBe(0);
    expect(dynamicImport.stdout).not.toContain("input.test-d.ts:");
    expect(dynamicImport.stdout).not.toContain("configured.spec.ts:");
    expect(dynamicImport.stdout).toMatch(/^[^\n]*runtime\.spec\.ts:1  /m);
    expect(dynamicImport.stdout).toContain(
      "test-dynamic-import: 1 matches in 1 files",
    );
    expect(cleanup.code).toBe(0);
    expect(cleanup.stdout).not.toContain("input.test-d.ts:");
    expect(cleanup.stdout).not.toContain("configured.spec.ts:");
    expect(cleanup.stdout).toMatch(/^[^\n]*runtime\.spec\.ts:2  /m);
    expect(cleanup.stdout).toContain("test-mock-cleanup: 1 matches in 1 files");
  });
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
  it.each([
    [
      "--test-pattern",
      "--no-tests",
      "--test-pattern requires a non-empty glob",
    ],
    ["--test-root", "--no-tests", "--test-root requires a non-empty path"],
  ])("should not consume %s option boundaries", async (option, next, message) => {
    const result = await capture([option, next]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(message);
  });
  it.each([["--test-pattern", "!"], ["--test-pattern=!"]])(
    "should reject a lone negation in %s",
    async (...argv) => {
      const result = await capture(argv);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain(
        "--test-pattern requires a non-empty glob",
      );
    },
  );
  it.each([
    "test-d/**/*.types.ts",
    "test-d/**/*.{types,check}.ts",
    "test-d/**/*.type[sd].ts",
  ])("should accept ordinary compiler-test glob %s", async (pattern) => {
    const result = await capture([
      temporaryRoot(),
      "--category",
      "let",
      "--test-pattern",
      pattern,
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });
  it.each([
    ["at", "test-d/**/*.@(types|check).ts", false],
    ["negative", "!(src)/**/*.types.ts", true],
    ["optional", "test-d/**/?(types|check).ts", false],
    ["one-or-more", "test-d/**/+(types|check).ts", false],
    ["zero-or-more", "test-d/**/*(types|check).ts", false],
  ] as const)(
    "should reject %s extglob syntax under the Bun CLI entrypoint",
    (_form, pattern, joined) => {
      const option = joined
        ? [`--test-pattern=${pattern}`]
        : ["--test-pattern", pattern];
      const result = spawnSync(
        "bun",
        [resolve(here, "scan_potential_violations.ts"), ".", ...option],
        { cwd: temporaryRoot(), encoding: "utf8" },
      );
      expect(result.status).toBe(2);
      expect(result.stderr).toBe(
        "error: --test-pattern does not support extglob syntax\n",
      );
      expect(result.stdout).toBe("");
    },
  );
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
  it("should skip tsd declaration tests for opted-in rules", async () => {
    const root = temporaryRoot();
    writeFileSync(resolve(root, "feature.test-d.ts"), "let result = 1;\n");
    const result = await capture([root, "--category", "let", "--no-tests"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("feature.test-d.ts:");
  });
  it("should skip files matched by repeatable compiler-test patterns", async () => {
    const root = temporaryRoot();
    mkdirSync(resolve(root, "test-d/nested"), { recursive: true });
    mkdirSync(resolve(root, "src"));
    writeFileSync(
      resolve(root, "test-d/nested/configured.types.ts"),
      "let configured = 1;\n",
    );
    writeFileSync(
      resolve(root, "src/unconfigured.types.ts"),
      "let unconfigured = 1;\n",
    );
    const result = await capture([
      root,
      "--category",
      "let",
      "--no-tests",
      "--test-root",
      root,
      "--test-pattern",
      "test-d/**/*.types.ts",
      "--test-pattern",
      "checks/**/*.check.ts",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("test-d/nested/configured.types.ts:");
    expect(result.stdout).toContain("src/unconfigured.types.ts:");
  });
  it.each(["file", "directory"] as const)(
    "should skip configured compiler tests discovered from a %s root",
    async (rootKind) => {
      const projectRoot = temporaryRoot();
      const testDirectory = resolve(projectRoot, "test-d/nested");
      const testFile = resolve(testDirectory, "configured.types.ts");
      mkdirSync(testDirectory, { recursive: true });
      writeFileSync(testFile, "let configured = 1;\n");
      const discoveredRoot =
        rootKind === "file" ? testFile : resolve(projectRoot, "test-d");
      const result = await capture([
        discoveredRoot,
        "--category",
        "let",
        "--no-tests",
        "--test-root",
        projectRoot,
        "--test-pattern",
        "test-d/**/*.types.ts",
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain("configured.types.ts:");
    },
  );
});

describe("path predicates and rule id prefixes", () => {
  it("keeps predicate boundaries exact", () => {
    expect(isSpecFile("thing.spec.ts")).toBe(true);
    expect(isSpecFile("thing.spec.py")).toBe(false);
    expect(isTestFile("test_thing.py")).toBe(true);
    expect(sourceFiles("thing.tsx")).toBe(true);
    expect(sourceFiles("thing.mts")).toBe(true);
    expect(sourceFiles("thing.cts")).toBe(true);
    expect(sourceFiles("thing.py")).toBe(false);
    expect(pythonFiles("thing.py")).toBe(true);
    expect(tsOnly("thing.jsx")).toBe(false);
    expect(tsOnly("thing.mts")).toBe(true);
    expect(tsOnly("thing.cts")).toBe(true);
  });
  it("should classify tsd declaration tests without treating them as specs", () => {
    expect(isTestFile("thing.test-d.ts")).toBe(true);
    expect(isSpecFile("thing.test-d.ts")).toBe(false);
  });
  it("should classify configured compiler tests without reclassifying production", () => {
    const patterns = ["test-d/**/*.types.ts"];
    expect(isTestFile("test-d/nested/thing.types.ts", patterns)).toBe(true);
    expect(isTestFile("src/thing.types.ts", patterns)).toBe(false);
  });
  it.each([
    [
      "included path",
      "test-d/api.types.ts",
      ["test-d/**/*.types.ts", "!**/fixtures/**"],
      true,
    ],
    [
      "excluded path",
      "test-d/fixtures/api.types.ts",
      ["test-d/**/*.types.ts", "!**/fixtures/**"],
      false,
    ],
    ["exclusion-only set", "src/api.ts", ["!**/fixtures/**"], false],
    [
      "ordered re-inclusion",
      "test-d/api.types.ts",
      ["test-d/**/*.types.ts", "!test-d/**", "test-d/api.types.ts"],
      true,
    ],
    [
      "excluded built-in path",
      "test-d/fixtures/api.test-d.ts",
      ["!**/fixtures/**"],
      false,
    ],
    [
      "re-included built-in path",
      "test-d/fixtures/api.test-d.ts",
      ["!**/fixtures/**", "test-d/fixtures/api.test-d.ts"],
      true,
    ],
  ] as const)(
    "should apply configured compiler-test patterns to an %s",
    (_kind, path, patterns, expected) => {
      expect(isTestFile(path, patterns)).toBe(expected);
    },
  );
  it.each([
    ["test-d/**/*.{types,check}.ts", "test-d/nested/thing.check.ts"],
    ["test-d/**/*.type[sd].ts", "test-d/nested/thing.types.ts"],
  ])("should honor configured compiler-test glob %s", (pattern, path) => {
    expect(isTestFile(path, [pattern])).toBe(true);
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

  it("should scan static reads in tsd declaration tests", async () => {
    const root = temporaryRoot();
    writeFileSync(
      resolve(root, "example.test-d.ts"),
      'readFileSync("fixture.txt");\n',
    );
    const result = await capture([root, "--category", "test-static-file-read"]);
    expect(result.stdout).toContain("example.test-d.ts:1");
  });

  it("should scan configured compiler tests but not unconfigured production", async () => {
    const root = temporaryRoot();
    mkdirSync(resolve(root, "test-d/nested"), { recursive: true });
    mkdirSync(resolve(root, "src"));
    writeFileSync(
      resolve(root, "test-d/nested/configured.types.ts"),
      'readFileSync("fixture.txt");\n',
    );
    writeFileSync(
      resolve(root, "src/unconfigured.types.ts"),
      'readFileSync("fixture.txt");\n',
    );
    const result = await capture([
      root,
      "--category",
      "test-static-file-read",
      "--test-root",
      root,
      "--test-pattern",
      "test-d/**/*.types.ts",
      "--test-pattern",
      "checks/**/*.check.ts",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("configured.types.ts:1");
    expect(result.stdout).not.toContain("unconfigured.types.ts:");
  });

  it.each(["relative", "absolute"] as const)(
    "should normalize %s configured compiler-test globs to the test root",
    async (patternKind) => {
      const root = temporaryRoot();
      const testDirectory = resolve(root, "test-d/nested");
      const testFile = resolve(testDirectory, "configured.types.ts");
      mkdirSync(testDirectory, { recursive: true });
      writeFileSync(
        testFile,
        'let configured = 1;\nreadFileSync("fixture.txt");\n',
      );
      const pattern =
        patternKind === "relative"
          ? "./test-d/**/*.types.ts"
          : resolve(root, "test-d/**/*.types.ts");
      const common = [
        testFile,
        "--test-root",
        root,
        "--test-pattern",
        pattern,
      ];
      const skipped = await capture([
        ...common,
        "--category",
        "let",
        "--no-tests",
      ]);
      expect(skipped.code).toBe(0);
      expect(skipped.stdout).not.toContain("configured.types.ts:");
      const staticRead = await capture([
        ...common,
        "--category",
        "test-static-file-read",
      ]);
      expect(staticRead.code).toBe(0);
      expect(staticRead.stdout).toContain("configured.types.ts:2");
    },
  );

  it.each(["file", "directory"] as const)(
    "should scan configured compiler tests discovered from a %s root",
    async (rootKind) => {
      const projectRoot = temporaryRoot();
      const testDirectory = resolve(projectRoot, "test-d/nested");
      const testFile = resolve(testDirectory, "configured.types.ts");
      mkdirSync(testDirectory, { recursive: true });
      writeFileSync(testFile, 'readFileSync("fixture.txt");\n');
      const discoveredRoot =
        rootKind === "file" ? testFile : resolve(projectRoot, "test-d");
      const result = await capture([
        discoveredRoot,
        "--category",
        "test-static-file-read",
        "--test-root",
        projectRoot,
        "--test-pattern",
        "test-d/**/*.types.ts",
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("configured.types.ts:1");
    },
  );

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

describe("test-gated rule applicability", () => {
  it.each([
    ["ordinary spec", "src/api.spec.ts", undefined, true],
    ["tsd declaration test", "test-d/api.test-d.ts", undefined, true],
    [
      "configured compiler test",
      "test-d/api.types.ts",
      "test-d/**/*.types.ts",
      true,
    ],
    ["production source", "src/api.ts", undefined, false],
  ] as const)(
    "should route `as never` in %s to exactly one escape-cast scanner",
    async (_kind, name, pattern, testRule) => {
      const root = temporaryRoot();
      const path = resolve(root, name);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, "const api = {} as never;\n");
      const common = [
        path,
        "--test-root",
        root,
        ...(pattern === undefined ? [] : ["--test-pattern", pattern]),
      ];
      const testResult = await capture([
        ...common,
        "--category",
        "spec-escape-cast",
      ]);
      const productionResult = await capture([
        ...common,
        "--category",
        "escape-cast",
      ]);
      expect(testResult.stdout.includes(`${name}:1`)).toBe(testRule);
      expect(productionResult.stdout.includes(`${name}:1`)).toBe(!testRule);
    },
  );

  it.each(["relative", "absolute"] as const)(
    "should preserve %s negated compiler-test patterns during normalization",
    async (patternKind) => {
      const root = temporaryRoot();
      const included = resolve(root, "test-d/api.types.ts");
      const excluded = resolve(root, "test-d/fixtures/api.types.ts");
      mkdirSync(resolve(excluded, ".."), { recursive: true });
      writeFileSync(included, "const api = {} as never;\n");
      writeFileSync(excluded, "const api = {} as never;\n");
      const positive =
        patternKind === "relative"
          ? "test-d/**/*.types.ts"
          : resolve(root, "test-d/**/*.types.ts");
      const negative =
        patternKind === "relative"
          ? "!**/fixtures/**"
          : `!${resolve(root, "**/fixtures/**")}`;
      const result = await capture([
        root,
        "--category",
        "spec-escape-cast",
        "--test-root",
        root,
        "--test-pattern",
        positive,
        "--test-pattern",
        negative,
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("test-d/api.types.ts:1");
      expect(result.stdout).not.toContain("test-d/fixtures/api.types.ts:");
    },
  );

  it.each([
    ["Python test", "test_client.py", undefined, false],
    [
      "configured ESM compiler test",
      "test-d/nested/api.types.mts",
      "test-d/**/*.types.mts",
      true,
    ],
  ] as const)(
    "should classify %s for JavaScript/TypeScript test scanners",
    async (_kind, name, pattern, found) => {
      const root = temporaryRoot();
      const path = resolve(root, name);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, "const api = {} as never;\n");
      const result = await capture([
        path,
        "--category",
        "spec-escape-cast",
        "--test-root",
        root,
        ...(pattern === undefined ? [] : ["--test-pattern", pattern]),
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout.includes(`${name}:1`)).toBe(found);
    },
  );

  it.each(["mts", "cts"])(
    "should enumerate configured .%s compiler tests from directory roots",
    async (extension) => {
      const root = temporaryRoot();
      const relativePath = `test-d/nested/api.types.${extension}`;
      const path = resolve(root, relativePath);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, "const api = {} as never;\n");
      const result = await capture([
        root,
        "--category",
        "spec-escape-cast",
        "--test-root",
        root,
        "--test-pattern",
        `test-d/**/*.types.${extension}`,
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(`${relativePath}:1`);
    },
  );

  it.each([
    ["tsd declaration test", "api.test-d.ts", undefined, true],
    [
      "configured compiler test",
      "test-d/nested/api.types.ts",
      "test-d/**/*.types.ts",
      true,
    ],
    [
      "configured ESM compiler test",
      "test-d/nested/api.types.mts",
      "test-d/**/*.types.mts",
      true,
    ],
    [
      "configured CommonJS compiler test",
      "test-d/nested/api.types.cts",
      "test-d/**/*.types.cts",
      true,
    ],
    [
      "production source",
      "src/api.types.ts",
      "test-d/**/*.types.ts",
      false,
    ],
  ] as const)(
    "should classify %s for test-only scanner applicability",
    async (_kind, name, pattern, found) => {
      const root = temporaryRoot();
      const path = resolve(root, name);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, "const api = {} as never;\n");
      const result = await capture([
        path,
        "--category",
        "spec-escape-cast",
        "--test-root",
        root,
        ...(pattern === undefined ? [] : ["--test-pattern", pattern]),
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout.includes(`${name}:1`)).toBe(found);
    },
  );

  it.each([
    ["tsd declaration test", "api.test-d.ts", undefined, false],
    [
      "configured compiler test",
      "test-d/nested/api.test.ts",
      "test-d/**/*.test.ts",
      false,
    ],
    ["runtime test", "src/api.test.ts", undefined, true],
  ] as const)(
    "should classify %s for runtime test-file naming",
    async (_kind, name, pattern, found) => {
      const root = temporaryRoot();
      const path = resolve(root, name);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, "export {};\n");
      const result = await capture([
        path,
        "--category",
        "test-file-naming",
        "--test-root",
        root,
        ...(pattern === undefined ? [] : ["--test-pattern", pattern]),
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout.includes(`${name}:1`)).toBe(found);
    },
  );

  it("should not flag hook-shaped calls outside test files", async () => {
    const result = await capture([
      resolve(fixtures, "_corpus/not-a-spec.ts"),
      "--category",
      "test-hooks",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("(no matches)");
  });
});
