import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "./scanlib/core.ts";
import { loadRules } from "./scanlib/loader.ts";
import { deriveRuleIdPrefixes, FALLBACK_PREFIXES } from "./scanlib/prefixes.ts";
import {
  isSpecFile,
  isTestFile,
  pythonFiles,
  sourceFiles,
  specFiles,
  tsOnly,
} from "./scanlib/predicates.ts";

const here = import.meta.dirname;
const fixtures = resolve(here, "../tests/fixtures");
// Rules whose `appliesTo` gates on the `.spec.` marker cannot see their
// violation input once the corpus ships under plain names, so each golden
// directory keeps only compliant files and these tests re-materialize the
// spec-named twin at runtime.
const SPEC_GATED_CATEGORIES = [
  { category: "aaa-comment", matches: [5, 8, 11] },
  { category: "error-assertion-split", matches: [9, 16] },
  { category: "test-conditional-skip", matches: [4, 12] },
  { category: "test-dynamic-import", matches: [9] },
  { category: "test-env-access", matches: [1, 2, 3, 4] },
  { category: "test-hooks", matches: [2, 3, 4, 5] },
  { category: "test-mock-cleanup", matches: [1, 2] },
  { category: "test-mock-stub", matches: [3, 4, 7] },
  { category: "test-title-convention", matches: [4, 6] },
  { category: "to-be-object-literal", matches: [7, 13] },
  { category: "undefined-override", matches: [6] },
] as const;
const TEST_NAMING_SOURCE = [
  "// violation: this file uses the `.test.ts` extension instead of `.spec.ts`",
  "export function placeholder(): number {",
  "  return 1;",
  "}",
  "",
].join("\n");
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

const fixtureDirectories = readdirSync(fixtures, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(resolve(fixtures, entry.name, "expected.txt")),
  )
  .map((entry) => entry.name)
  .sort();
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

describe("coding scanner golden fixtures", () => {
  it("discovers golden fixtures", () =>
    expect(fixtureDirectories.length).toBeGreaterThan(0));

  it.each(fixtureDirectories)("matches the %s golden", async (name) => {
    const directory = resolve(fixtures, name);
    const previous = process.cwd();
    process.chdir(directory);
    try {
      const result = await capture([".", "--category", name]);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(
        readFileSync(resolve(directory, "expected.txt"), "utf8"),
      );
    } finally {
      process.chdir(previous);
    }
  });

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

  it("uses only public kebab-case production rule filenames", () => {
    const publicModules = readdirSync(resolve(here, "scanners")).filter(
      (name) => name.endsWith(".ts") && !name.startsWith("_"),
    );
    expect(
      publicModules.every(
        (name) =>
          basename(name, ".ts") === basename(name, ".ts").toLowerCase() &&
          !name.includes("_"),
      ),
    ).toBe(true);
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
    expect(FALLBACK_PREFIXES.length).toBeGreaterThan(0);
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
  it.each(SPEC_GATED_CATEGORIES)(
    "flags $category violations in a runtime-written spec file",
    async ({ category, matches }) => {
      const root = temporaryRoot();
      const source = readFileSync(
        resolve(fixtures, category, "input.ts"),
        "utf8",
      );
      writeFileSync(resolve(root, "input.spec.ts"), source);
      const result = await capture([root, "--category", category]);
      expect(result.code).toBe(0);
      for (const lineno of matches)
        expect(result.stdout).toContain(`input.spec.ts:${lineno}`);
      expect(result.stdout).toContain(
        `${category}: ${matches.length} matches in 1 files`,
      );
    },
  );

  it("flags a .test.ts filename but leaves plain sources alone", async () => {
    const root = temporaryRoot();
    writeFileSync(resolve(root, "example.test.ts"), TEST_NAMING_SOURCE);
    const result = await capture([root, "--category", "test-file-naming"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("example.test.ts:1");
    expect(result.stdout).toContain("test-file-naming: 1 matches in 1 files");
  });

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
