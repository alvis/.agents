import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { describe, expect, it, onTestFinished, vi } from "vitest";

import { main } from "./classify-pr-size";

import type { PathOrFileDescriptor } from "node:fs";

// --- TYPES --- //

type Zone = "green" | "yellow" | "red" | "black";
type RiskClass = "R0" | "R1" | "R2" | "R3";

interface Classification {
  authored_additions: number;
  authored_deletions: number;
  authored_lines: number;
  base_oid: string;
  binary_files: string[];
  excluded_files: { snapshot: string[]; test: string[]; vendored: string[] };
  generated_files: string[];
  head_oid: string;
  line_bump: boolean;
  rename_detection_skipped: boolean;
  renamed_files: Array<{ from: string; to: string }>;
  risk_class: RiskClass | null;
  risk_floor: Zone | null;
  tier: Zone | null;
  unit_band: Zone | null;
  units: number | null;
  zone: Zone | null;
}

interface Completed {
  status: number;
  stderr: string;
  stdout: string;
}

// --- MOCKS --- //

// the asset path is fixed beside the script, so the threshold file read is the
// only seam through which a spec can feed the classifier a controlled asset.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  } satisfies Partial<typeof import("node:fs")>;
});

// --- CONSTANTS --- //

const usagePrefix = "usage: classify-pr-size.ts ";
const thresholdAsset = "size-thresholds.json";
// one line above the asset's line-bump threshold of 2,500 authored lines.
const BUMPING_LINE_COUNT = 2_501;
// git compares at most 1,000 inexact rename candidates (the classifier's -l bound).
const RENAME_CANDIDATE_LIMIT = 1_000;
// the candidate-limit matrix writes and diffs 2,002 paths through real git.
const RENAME_LIMIT_TIMEOUT_MS = 60_000;

const validThresholds = {
  schema_version: 2,
  unit_bands: [
    { zone: "green", max_units: 15, reason: "one review pass" },
    { zone: "yellow", max_units: 30, reason: "twice the green surface" },
    { zone: "red", max_units: 60, reason: "twice the yellow surface" },
  ],
  risk_floors: {
    reason: "keeps risky work from AI-only approval",
    floors: { R0: "green", R1: "green", R2: "yellow", R3: "red" },
  },
  line_bump: {
    authored_lines_above: 2500,
    steps: 1,
    reason: "a reviewer cannot read every line in one pass",
  },
  rename_similarity_percent: { value: 90, reason: "a move is its path change" },
} as const;

// --- HELPERS --- //

function git(repo: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function initialize(repo: string, objectFormat = "sha1"): void {
  git(
    repo,
    "init",
    "--quiet",
    "--initial-branch=main",
    `--object-format=${objectFormat}`,
  );
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
}

function repository(objectFormat?: string): { base: string; repo: string } {
  const repo = temporaryDirectory("pr-size-test-");
  initialize(repo, objectFormat);
  write(repo, "README.md", "base\n");
  return { repo, base: commit(repo, "base") };
}

function write(repo: string, path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function commit(repo: string, message: string): string {
  git(repo, "add", "--all");
  git(
    repo,
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "--allow-empty",
    "-m",
    message,
  );
  return git(repo, "rev-parse", "HEAD");
}

function lines(count: number, value = "line"): string {
  return Array.from(
    { length: count },
    (_, index) => `${value}-${index}\n`,
  ).join("");
}

function addRawPath(repo: string, path: Buffer, content: string): void {
  const blob = spawnSync("git", ["-C", repo, "hash-object", "-w", "--stdin"], {
    encoding: "utf8",
    input: content,
  }).stdout.trim();
  const indexed = spawnSync(
    "git",
    ["-C", repo, "update-index", "-z", "--add", "--index-info"],
    {
      input: Buffer.concat([
        Buffer.from(`100644 ${blob}\t`),
        path,
        Buffer.from([0]),
      ]),
    },
  );
  expect(indexed.status, indexed.stderr.toString()).toBe(0);
}

function run(args: string[]): Completed {
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  const offsets = [stdout.mock.calls.length, stderr.mock.calls.length];

  const status = main(args);

  return {
    status,
    stdout: stdout.mock.calls
      .slice(offsets[0])
      .map(([chunk]) => String(chunk))
      .join(""),
    stderr: stderr.mock.calls
      .slice(offsets[1])
      .map(([chunk]) => String(chunk))
      .join(""),
  };
}

function classify(
  repo: string,
  base: string,
  head: string,
  inventory: string[] = [],
): Classification {
  const completed = run([
    "--repo",
    repo,
    "--base",
    base,
    "--head",
    head,
    ...inventory,
  ]);
  expect(completed, completed.stderr).toEqual({
    status: 0,
    stderr: "",
    stdout: expect.stringMatching(/\n$/),
  });

  return JSON.parse(completed.stdout) as Classification;
}

function useThresholds(asset: unknown): void {
  vi.mocked(readFileSync).mockImplementation(((path: PathOrFileDescriptor) => {
    if (basename(String(path)) !== thresholdAsset)
      throw new Error(`unexpected read of ${String(path)}`);
    return JSON.stringify(asset);
  }) as typeof readFileSync);
}

function expectUsageError(completed: Completed, message: string | RegExp): void {
  expect(completed).toEqual({
    status: 2,
    stdout: "",
    stderr: expect.stringMatching(
      new RegExp(
        `^${usagePrefix}.*\\nclassify-pr-size\\.ts: error: ${
          typeof message === "string"
            ? message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            : message.source
        }\\n$`,
        "s",
      ),
    ),
  });
}

// --- TEST SUITES --- //

describe("fn:main", () => {
  describe("output", () => {
    it("should write every field as Python-compatible sorted JSON with an undetermined zone when no inventory is given", () => {
      const { repo, base } = repository();

      const completed = run(["--repo", repo, "--base", base, "--head", base]);

      expect(completed).toEqual({
        status: 0,
        stderr: "",
        stdout:
          `{"authored_additions": 0, "authored_deletions": 0, "authored_lines": 0, "base_oid": "${base}", ` +
          `"binary_files": [], "excluded_files": {"snapshot": [], "test": [], "vendored": []}, ` +
          `"generated_files": [], "head_oid": "${base}", "line_bump": false, "rename_detection_skipped": false, ` +
          `"renamed_files": [], "risk_class": null, "risk_floor": null, "tier": null, "unit_band": null, "units": null, "zone": null}\n`,
      });
    });

    it("should report the inventory and its zone inputs when units and risk are given", () => {
      const { repo, base } = repository();
      write(repo, "src/feature.ts", lines(3));
      const head = commit(repo, "feature");

      expect(
        classify(repo, base, head, ["--units", "14", "--risk", "R1"]),
      ).toEqual({
        authored_additions: 3,
        authored_deletions: 0,
        authored_lines: 3,
        base_oid: base,
        binary_files: [],
        excluded_files: { snapshot: [], test: [], vendored: [] },
        generated_files: [],
        head_oid: head,
        line_bump: false,
        rename_detection_skipped: false,
        renamed_files: [],
        risk_class: "R1",
        risk_floor: "green",
        tier: "green",
        unit_band: "green",
        units: 14,
        zone: "green",
      });
    });
  });

  describe("zone arithmetic", () => {
    it.each([
      // token storage: a small change takes the R3 floor
      [6, "R3", { unit_band: "green", risk_floor: "red", tier: "red", zone: "red" }],
      // public SDK: the R2 floor
      [20, "R2", { unit_band: "yellow", risk_floor: "yellow", tier: "yellow", zone: "yellow" }],
      // the unit band wins over a lower floor
      [31, "R2", { unit_band: "red", risk_floor: "yellow", tier: "red", zone: "red" }],
      [15, "R0", { unit_band: "green", risk_floor: "green", tier: "green", zone: "green" }],
      [16, "R0", { unit_band: "yellow", risk_floor: "green", tier: "yellow", zone: "yellow" }],
      [60, "R1", { unit_band: "red", risk_floor: "green", tier: "red", zone: "red" }],
      [61, "R0", { unit_band: "black", risk_floor: "green", tier: "black", zone: "black" }],
      [0, "R0", { unit_band: "green", risk_floor: "green", tier: "green", zone: "green" }],
    ] as const)(
      "should classify %i units at %s from the band and floor without a line bump",
      (units, risk, expected) => {
        const { repo, base } = repository();
        write(repo, "src/feature.ts", lines(3));
        const head = commit(repo, "feature");

        expect(
          classify(repo, base, head, ["--units", String(units), "--risk", risk]),
        ).toMatchObject({ ...expected, units, risk_class: risk, line_bump: false });
      },
    );

    it.each([
      // a public SDK past the line threshold
      [20, "R2", { tier: "yellow", zone: "red" }],
      // a migration past the line threshold
      [8, "R3", { tier: "red", zone: "black" }],
      // black stays black
      [61, "R0", { tier: "black", zone: "black" }],
      [1, "R0", { tier: "green", zone: "yellow" }],
    ] as const)(
      "should raise %i units at %s by one step past the line threshold",
      (units, risk, expected) => {
        const { repo, base } = repository();
        write(repo, "src/large.ts", lines(BUMPING_LINE_COUNT));
        const head = commit(repo, "large");

        expect(
          classify(repo, base, head, ["--units", String(units), "--risk", risk]),
        ).toMatchObject({
          ...expected,
          authored_lines: BUMPING_LINE_COUNT,
          line_bump: true,
        });
      },
    );

    it("should not bump a diff of exactly the threshold line count", () => {
      const { repo, base } = repository();
      write(repo, "src/large.ts", lines(BUMPING_LINE_COUNT - 1));
      const head = commit(repo, "threshold");

      expect(
        classify(repo, base, head, ["--units", "1", "--risk", "R0"]),
      ).toMatchObject({
        authored_lines: BUMPING_LINE_COUNT - 1,
        line_bump: false,
        zone: "green",
      });
    });

    it("should report the line bump without a zone when no inventory is given", () => {
      const { repo, base } = repository();
      write(repo, "src/large.ts", lines(BUMPING_LINE_COUNT));
      const head = commit(repo, "large");

      expect(classify(repo, base, head)).toMatchObject({
        line_bump: true,
        tier: null,
        zone: null,
      });
    });
  });

  describe("authored lines", () => {
    it("should count additions plus deletions rather than their net", () => {
      const { repo } = repository();
      write(repo, "app.py", lines(610, "old"));
      const prior = commit(repo, "prior");
      write(repo, "app.py", lines(10, "new"));

      expect(classify(repo, prior, commit(repo, "shrink"))).toMatchObject({
        authored_additions: 10,
        authored_deletions: 610,
        authored_lines: 620,
      });
    });

    it("should count only the edit lines inside a large file renamed with a small edit", () => {
      const { repo } = repository();
      write(repo, "big.txt", lines(10_000));
      const prior = commit(repo, "big");
      renameSync(join(repo, "big.txt"), join(repo, "moved.txt"));
      write(
        repo,
        "moved.txt",
        lines(10_000)
          .replace("line-10\n", "edited-10\n")
          .replace("line-20\n", "edited-20\n"),
      );

      expect(
        classify(repo, prior, commit(repo, "move"), ["--units", "1", "--risk", "R0"]),
      ).toMatchObject({
        authored_additions: 2,
        authored_deletions: 2,
        authored_lines: 4,
        renamed_files: [{ from: "big.txt", to: "moved.txt" }],
        zone: "green",
      });
    });

    it("should list pure renames sorted by destination with no authored lines", () => {
      const { repo } = repository();
      write(repo, "a.txt", lines(20, "alpha"));
      write(repo, "b.txt", lines(20, "beta"));
      const prior = commit(repo, "sources");
      renameSync(join(repo, "a.txt"), join(repo, "z.txt"));
      renameSync(join(repo, "b.txt"), join(repo, "c.txt"));

      expect(classify(repo, prior, commit(repo, "rename"))).toMatchObject({
        authored_lines: 0,
        renamed_files: [
          { from: "b.txt", to: "c.txt" },
          { from: "a.txt", to: "z.txt" },
        ],
      });
    });

    it("should count a move below the rename similarity threshold as authored content", () => {
      const { repo } = repository();
      write(repo, "original.txt", lines(10, "same"));
      const prior = commit(repo, "source");
      rmSync(join(repo, "original.txt"));
      write(repo, "moved.txt", lines(5, "same") + lines(5, "different"));

      expect(classify(repo, prior, commit(repo, "move"))).toMatchObject({
        authored_additions: 10,
        authored_deletions: 10,
        authored_lines: 20,
        renamed_files: [],
      });
    });

    it(
      "should report skipped inexact rename matching beyond the candidate limit",
      () => {
        const { repo } = repository();
        const name = (prefix: string, index: number) =>
          `${prefix}-${String(index).padStart(4, "0")}.txt`;
        for (let index = 0; index <= RENAME_CANDIDATE_LIMIT; index++)
          write(repo, name("original", index), lines(20, `file-${index}`));
        const prior = commit(repo, "candidates");
        for (let index = 0; index <= RENAME_CANDIDATE_LIMIT; index++) {
          rmSync(join(repo, name("original", index)));
          write(
            repo,
            name("renamed", index),
            lines(20, `file-${index}`).replace(
              `file-${index}-0\n`,
              `edited-${index}\n`,
            ),
          );
        }

        expect(classify(repo, prior, commit(repo, "beyond cap"))).toMatchObject({
          authored_lines: (RENAME_CANDIDATE_LIMIT + 1) * 40,
          rename_detection_skipped: true,
          renamed_files: [],
        });
      },
      RENAME_LIMIT_TIMEOUT_MS,
    );

    it("should ignore whitespace-only and blank-line-only edits", () => {
      const { repo } = repository();
      write(repo, "src/format.ts", "if (x) {\nreturn 1;\n}\n");
      write(repo, "src/mixed.ts", "const a = 1;\nconst b = 2;\n");
      const prior = commit(repo, "source");
      write(repo, "src/format.ts", "if (x)  {\n\n    return 1;   \n\n}\n");
      write(repo, "src/mixed.ts", "  const a = 1;\nconst b = 3;\n");

      expect(classify(repo, prior, commit(repo, "format"))).toMatchObject({
        authored_additions: 1,
        authored_deletions: 1,
        authored_lines: 2,
      });
    });

    it("should exclude test files, stories, snapshots, vendored paths, and lockfiles into their buckets", () => {
      const { repo } = repository();
      write(
        repo,
        ".gitattributes",
        "vendor/** linguist-vendored\ngenerated/** linguist-generated=true\n",
      );
      const prior = commit(repo, "attributes");
      write(repo, "src/app.ts", lines(3));
      write(repo, "src/app.spec.ts", lines(50));
      write(repo, "src/view.test.tsx", lines(50));
      write(repo, "src/view.stories.tsx", lines(50));
      write(repo, "src/__tests__/helper.ts", lines(50));
      write(repo, "src/view.snap", lines(50));
      write(repo, "src/__snapshots__/data.json", lines(50));
      write(repo, "vendor/lib.js", lines(50));
      write(repo, "generated/client.ts", lines(50));
      write(repo, "pnpm-lock.yaml", lines(50));
      write(repo, "web/package-lock.json", lines(50));

      expect(classify(repo, prior, commit(repo, "add"))).toMatchObject({
        authored_additions: 3,
        authored_deletions: 0,
        authored_lines: 3,
        excluded_files: {
          snapshot: ["src/__snapshots__/data.json", "src/view.snap"],
          test: ["src/__tests__/helper.ts", "src/app.spec.ts", "src/view.stories.tsx", "src/view.test.tsx"],
          vendored: ["vendor/lib.js"],
        },
        generated_files: [
          "generated/client.ts",
          "pnpm-lock.yaml",
          "web/package-lock.json",
        ],
      });
    });

    it("should keep lines of paths whose generated and vendored attributes are explicitly false", () => {
      const { repo } = repository();
      write(
        repo,
        ".gitattributes",
        "authored/** linguist-generated=false linguist-vendored=false\n",
      );
      const prior = commit(repo, "attributes");
      write(repo, "authored/source.ts", lines(5));

      expect(classify(repo, prior, commit(repo, "add"))).toMatchObject({
        authored_lines: 5,
        excluded_files: { snapshot: [], test: [], vendored: [] },
        generated_files: [],
      });
    });

    it("should exclude generated deletions using attributes from the base revision", () => {
      const { repo } = repository();
      write(repo, ".gitattributes", "generated/** linguist-generated=true\n");
      write(repo, "generated/client.ts", lines(2500));
      const prior = commit(repo, "prior");
      rmSync(join(repo, "generated"), { recursive: true });
      rmSync(join(repo, ".gitattributes"));

      expect(classify(repo, prior, commit(repo, "remove"))).toMatchObject({
        authored_deletions: 1,
        authored_lines: 1,
        generated_files: ["generated/client.ts"],
      });
    });

    it("should list binary files without counting their lines", () => {
      const { repo, base } = repository();
      write(repo, "assets/logo.bin", Uint8Array.from([0, 1, 2, 0, 255]));
      write(repo, "src/app.ts", lines(2));

      expect(classify(repo, base, commit(repo, "binary"))).toMatchObject({
        authored_lines: 2,
        binary_files: ["assets/logo.bin"],
      });
    });
  });

  describe("path identity", () => {
    it("should preserve invalid-UTF-8 path identity through attributes and JSON", () => {
      const { repo, base } = repository();
      write(repo, ".gitattributes", "generated/*.bin linguist-generated=true\n");
      git(repo, "add", ".");
      addRawPath(
        repo,
        Buffer.concat([
          Buffer.from("generated/bad"),
          Buffer.from([0xff]),
          Buffer.from(".bin"),
        ]),
        "generated\n",
      );
      git(repo, "commit", "--quiet", "--no-gpg-sign", "-m", "invalid byte path");

      expect(classify(repo, base, git(repo, "rev-parse", "HEAD"))).toMatchObject({
        authored_additions: 1,
        generated_files: ["generated/bad\udcff.bin"],
      });
    });

    it("should read committed attributes inside a directory whose name is not UTF-8", () => {
      const { repo, base } = repository();
      const directory = Buffer.concat([Buffer.from("dir"), Buffer.from([0xfe])]);
      addRawPath(
        repo,
        Buffer.concat([directory, Buffer.from("/.gitattributes")]),
        "*.ts linguist-generated=true\n",
      );
      addRawPath(
        repo,
        Buffer.concat([directory, Buffer.from("/client.ts")]),
        lines(40),
      );
      git(repo, "commit", "--quiet", "--no-gpg-sign", "-m", "invalid directory");

      expect(classify(repo, base, git(repo, "rev-parse", "HEAD"))).toMatchObject({
        authored_lines: 1,
        generated_files: ["dir\udcfe/client.ts"],
      });
    });

    it("should decode paths with surrogate escapes and sort them by code point", () => {
      const { repo, base } = repository();
      write(repo, ".gitattributes", "weird/** linguist-generated=true\n");
      git(repo, "add", ".");
      // valid 2-, 3-, and 4-byte sequences at each boundary, then truncated,
      // bad-continuation, overlong, surrogate, out-of-range, and invalid lead bytes
      const names = [
        [0x61],
        [0x61, 0x62],
        [0xc3, 0xa9],
        [0xe0, 0xa0, 0x80],
        [0xed, 0x9f, 0xbf],
        [0xef, 0xbd, 0xa1],
        [0xf0, 0x90, 0x80, 0x80],
        [0xf0, 0x9f, 0x98, 0x80],
        [0xf4, 0x8f, 0xbf, 0xbf],
        [0x62, 0xc3],
        [0x63, 0xc3, 0x28],
        [0x64, 0xe0, 0x80, 0x80],
        [0x65, 0xed, 0xa0, 0x80],
        [0x66, 0xf0, 0x80, 0x80, 0x80],
        [0x67, 0xf4, 0x90, 0x80, 0x80],
        [0x68, 0xff],
      ];
      for (const bytes of names)
        addRawPath(
          repo,
          Buffer.concat([Buffer.from("weird/"), Buffer.from(bytes)]),
          "generated\n",
        );
      git(repo, "commit", "--quiet", "--no-gpg-sign", "-m", "weird names");

      // code-point order puts U+FF61 before U+10000, unlike UTF-16 order.
      expect(classify(repo, base, git(repo, "rev-parse", "HEAD"))).toMatchObject({
        authored_lines: 1,
        generated_files: [
          "a",
          "ab",
          "b\udcc3",
          "c\udcc3(",
          "d\udce0\udc80\udc80",
          "e\udced\udca0\udc80",
          "f\udcf0\udc80\udc80\udc80",
          "g\udcf4\udc90\udc80\udc80",
          "h\udcff",
          "é",
          "ࠀ",
          "퟿",
          "｡",
          "\u{10000}",
          "\u{1f600}",
          "\u{10ffff}",
        ].map((name) => `weird/${name}`),
      });
    });
  });

  describe("revisions", () => {
    it("should classify an initial commit against the empty tree", () => {
      const repo = temporaryDirectory("pr-size-empty-");
      initialize(repo);
      write(repo, "app.py", lines(501));
      const head = commit(repo, "initial");
      const empty = git(repo, "hash-object", "-t", "tree", "/dev/null");

      expect(classify(repo, empty, head)).toMatchObject({
        base_oid: empty,
        head_oid: head,
        authored_additions: 501,
        authored_lines: 501,
      });
    });

    it("should peel an annotated tag base to its commit", () => {
      const { repo, base } = repository();
      git(repo, "tag", "--annotate", "--no-sign", "-m", "release", "v1", base);
      write(repo, "app.py", lines(2));
      const head = commit(repo, "change");

      expect(classify(repo, "v1", head)).toMatchObject({
        base_oid: base,
        authored_lines: 2,
      });
    });

    it("should preserve a SHA-256 repository object format", () => {
      const { repo, base } = repository("sha256");
      write(repo, "app.py", lines(4));
      const head = commit(repo, "add");

      expect(classify(repo, base, head)).toMatchObject({
        base_oid: base,
        head_oid: head,
        authored_lines: 4,
      });
    });

    it("should classify from a linked worktree", () => {
      const { repo, base } = repository();
      write(repo, "app.py", lines(4));
      const head = commit(repo, "add");
      const worktree = join(temporaryDirectory("pr-size-worktree-"), "linked");
      git(repo, "worktree", "add", "--quiet", "--detach", worktree, head);

      expect(classify(worktree, base, head)).toEqual(classify(repo, base, head));
    });

    it("should fail with Git's error when the isolated repository cannot be initialized", () => {
      const { repo, base } = repository();
      const spawn = Bun.spawnSync;
      vi.spyOn(Bun, "spawnSync").mockImplementation(((command: string[], options: object) =>
        spawn(
          command.includes("--bare")
            ? command.map((argument) => (argument.startsWith("--object-format=") ? "--object-format=unknown" : argument))
            : command,
          options,
        )) as typeof Bun.spawnSync);

      expect(run(["--repo", repo, "--base", base, "--head", base])).toEqual({
        status: 1,
        stdout: "",
        stderr: expect.stringContaining("unknown"),
      });
    });
  });

  describe("hermetic Git inputs", () => {
    it("should ignore uncommitted repository attributes and diff configuration", () => {
      const { repo, base } = repository();
      write(repo, "app.py", lines(20));
      write(repo, "app.spec.ts", lines(5));
      const head = commit(repo, "add");
      const expected = classify(repo, base, head);
      const gitDir = join(repo, git(repo, "rev-parse", "--git-dir"));
      const attributes = join(temporaryDirectory("pr-size-attributes-"), "attributes");
      writeFileSync(attributes, "* linguist-generated linguist-vendored\n");
      writeFileSync(join(gitDir, "info/attributes"), "* linguist-generated\n");
      git(repo, "config", "core.attributesFile", attributes);
      git(repo, "config", "diff.algorithm", "histogram");
      git(repo, "config", "diff.renames", "false");

      expect(classify(repo, base, head)).toEqual(expected);
    });

    it("should ignore global attributes, configuration overrides, external diff, and default hash", () => {
      const { repo, base } = repository();
      write(repo, "app.py", lines(20));
      const head = commit(repo, "add");
      const expected = classify(repo, base, head);
      const root = temporaryDirectory("pr-size-hostile-");
      const attributes = join(root, "attributes");
      const config = join(root, "gitconfig");
      const external = join(root, "diff");
      writeFileSync(attributes, "* linguist-generated\n");
      writeFileSync(config, `[core]\n\tattributesFile = ${attributes}\n`);
      writeFileSync(external, "#!/bin/sh\nexit 91\n");
      chmodSync(external, 0o755);
      vi.stubEnv("GIT_CONFIG_GLOBAL", config);
      vi.stubEnv("GIT_CONFIG_PARAMETERS", `'core.attributesFile'='${attributes}'`);
      vi.stubEnv("GIT_CONFIG_COUNT", "1");
      vi.stubEnv("GIT_CONFIG_KEY_0", "core.attributesFile");
      vi.stubEnv("GIT_CONFIG_VALUE_0", attributes);
      vi.stubEnv("GIT_DEFAULT_HASH", "sha256");
      vi.stubEnv("GIT_EXTERNAL_DIFF", external);

      expect(classify(repo, base, head)).toEqual(expected);
    });

    it("should ignore an attribute source named in the environment", () => {
      const { repo, base } = repository();
      write(repo, "app.py", lines(20));
      const head = commit(repo, "add");
      const expected = classify(repo, base, head);
      write(repo, ".gitattributes", "* -diff linguist-generated\n");
      vi.stubEnv("GIT_ATTR_SOURCE", commit(repo, "hostile attributes"));

      expect(classify(repo, base, head)).toEqual(expected);
    });
  });

  describe("partial clones", () => {
    function partialClone(): { clone: string; head: string; prior: string; source: string } {
      const { repo: source } = repository();
      git(source, "config", "uploadpack.allowFilter", "true");
      write(source, ".gitattributes", "generated/** linguist-generated=true\n");
      write(source, "generated/client.ts", lines(2500));
      write(source, "unrelated.txt", "must remain lazy\n");
      const prior = commit(source, "generated");
      rmSync(join(source, "generated"), { recursive: true });
      rmSync(join(source, ".gitattributes"));
      const head = commit(source, "remove");
      const clone = join(temporaryDirectory("pr-size-clone-"), "clone");
      const cloned = spawnSync(
        "git",
        ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `file://${source}`, clone],
        { encoding: "utf8" },
      );
      expect(cloned.status, cloned.stderr).toBe(0);
      return { clone, head, prior, source };
    }

    it("should hydrate only required blobs from the promisor remote", () => {
      const { clone, head, prior, source } = partialClone();
      const unrelated = `?${git(source, "rev-parse", `${prior}:unrelated.txt`)}`;
      const missing = () =>
        git(clone, "rev-list", "--objects", "--missing=print", prior).split("\n");
      expect(missing()).toContain(unrelated);

      expect(classify(clone, prior, head)).toMatchObject({
        authored_deletions: 1,
        authored_lines: 1,
        generated_files: ["generated/client.ts"],
      });
      expect(missing()).toContain(unrelated);
    });

    it("should give the promisor fetch the inherited SSH transport", () => {
      const { clone, head, prior, source } = partialClone();
      git(source, "config", "uploadpack.allowAnySHA1InWant", "true");
      git(clone, "config", "remote.origin.url", `ssh://localhost${source}`);
      const root = temporaryDirectory("pr-size-ssh-");
      const marker = join(root, "connected");
      const transport = join(root, "ssh");
      // runs the requested upload-pack locally instead of connecting, after leaving the marker
      writeFileSync(transport, `#!/bin/sh\ntouch '${marker}'\nfor last; do :; done\nexec sh -c "$last"\n`);
      chmodSync(transport, 0o755);
      vi.stubEnv("GIT_SSH_COMMAND", transport);

      expect(classify(clone, prior, head)).toMatchObject({
        authored_lines: 1,
        generated_files: ["generated/client.ts"],
      });
      expect(existsSync(marker)).toBe(true);
    });

    it("should fall through a failing promisor remote to one that provides the objects", () => {
      const { clone, head, prior } = partialClone();
      // promisor remotes are tried in configuration order, so re-append origin last
      const origin = git(clone, "config", "--get", "remote.origin.url");
      git(clone, "config", "--remove-section", "remote.origin");
      git(clone, "config", "remote.broken.url", join(clone, "does-not-exist"));
      git(clone, "config", "remote.broken.promisor", "true");
      git(clone, "config", "remote.bad~name.promisor", "true");
      git(clone, "config", "remote.origin.url", origin);
      git(clone, "config", "remote.origin.promisor", "true");

      expect(classify(clone, prior, head)).toMatchObject({
        authored_lines: 1,
        generated_files: ["generated/client.ts"],
      });
    });

    it("should fail when missing objects have no promisor remote enabled", () => {
      const { clone, head, prior } = partialClone();
      git(clone, "config", "remote.origin.promisor", "false");

      expect(run(["--repo", clone, "--base", prior, "--head", head])).toEqual({
        status: 1,
        stdout: "",
        stderr: "missing objects require a configured promisor remote\n",
      });
    });

    it("should fail with the promisor error when no promisor key is configured", () => {
      const { clone, head, prior } = partialClone();
      git(clone, "config", "--unset", "remote.origin.promisor");

      expect(run(["--repo", clone, "--base", prior, "--head", head])).toEqual({
        status: 1,
        stdout: "",
        stderr: "missing objects require a configured promisor remote\n",
      });
    });

    it("should report the promisor fetch failure when no remote provides the objects", () => {
      const { clone, head, prior, source } = partialClone();
      rmSync(source, { recursive: true, force: true });

      expect(run(["--repo", clone, "--base", prior, "--head", head])).toEqual({
        status: 1,
        stdout: "",
        stderr: expect.stringMatching(/\S\n$/),
      });
    });
  });

  describe("threshold asset", () => {
    it("should take bands, floors, line bump, and rename similarity from the asset", () => {
      const { repo } = repository();
      write(repo, "original.txt", lines(10, "same"));
      const prior = commit(repo, "source");
      rmSync(join(repo, "original.txt"));
      write(repo, "moved.txt", lines(9, "same") + lines(2, "added"));
      const head = commit(repo, "move");
      useThresholds({
        ...validThresholds,
        unit_bands: [
          { zone: "green", max_units: 1, reason: "r" },
          { zone: "yellow", max_units: 2, reason: "r" },
          { zone: "red", max_units: 3, reason: "r" },
        ],
        risk_floors: {
          reason: "r",
          floors: { R0: "green", R1: "yellow", R2: "red", R3: "black" },
        },
        line_bump: { authored_lines_above: 2, steps: 2, reason: "r" },
        rename_similarity_percent: { value: 50, reason: "r" },
      });

      expect(
        classify(repo, prior, head, ["--units", "2", "--risk", "R1"]),
      ).toMatchObject({
        authored_lines: 3,
        line_bump: true,
        renamed_files: [{ from: "original.txt", to: "moved.txt" }],
        risk_floor: "yellow",
        tier: "yellow",
        unit_band: "yellow",
        zone: "black",
      });
    });

    const replace = (path: string[], value: unknown): unknown => {
      const asset = JSON.parse(JSON.stringify(validThresholds)) as Record<string, unknown>;
      let target = asset;
      for (const key of path.slice(0, -1))
        target = target[key] as Record<string, unknown>;
      if (value === undefined) delete target[path.at(-1)!];
      else target[path.at(-1)!] = value;
      return asset;
    };

    it.each<[string, unknown]>([
      ["a non-object asset", []],
      ["a null asset", null],
      ["schema version 1", replace(["schema_version"], 1)],
      ["a string schema version", replace(["schema_version"], "2")],
      ["an unknown top-level key", replace(["metrics"], {})],
      ["a missing top-level key", replace(["line_bump"], undefined)],
      ["non-array unit bands", replace(["unit_bands"], {})],
      ["an unknown unit-band key", replace(["unit_bands", "0", "extra"], 1)],
      ["a missing unit-band reason", replace(["unit_bands", "0", "reason"], undefined)],
      ["an empty unit-band reason", replace(["unit_bands", "1", "reason"], "")],
      ["out-of-order unit bands", replace(["unit_bands", "0", "zone"], "yellow")],
      ["a black unit band", replace(["unit_bands", "2", "zone"], "black")],
      ["a zero unit maximum", replace(["unit_bands", "0", "max_units"], 0)],
      ["a fractional unit maximum", replace(["unit_bands", "0", "max_units"], 1.5)],
      ["a string unit maximum", replace(["unit_bands", "0", "max_units"], "15")],
      ["non-increasing unit maxima", replace(["unit_bands", "1", "max_units"], 15)],
      ["an unknown risk-floors key", replace(["risk_floors", "extra"], 1)],
      ["a blank risk-floors reason", replace(["risk_floors", "reason"], "   ")],
      ["a missing risk class floor", replace(["risk_floors", "floors", "R3"], undefined)],
      ["an extra risk class floor", replace(["risk_floors", "floors", "R4"], "black")],
      ["an unknown floor zone", replace(["risk_floors", "floors", "R1"], "purple")],
      ["an unknown line-bump key", replace(["line_bump", "extra"], 1)],
      ["a zero line threshold", replace(["line_bump", "authored_lines_above"], 0)],
      ["zero bump steps", replace(["line_bump", "steps"], 0)],
      ["an empty line-bump reason", replace(["line_bump", "reason"], "")],
      ["an unknown rename-similarity key", replace(["rename_similarity_percent", "extra"], 1)],
      ["a zero rename similarity", replace(["rename_similarity_percent", "value"], 0)],
      ["a rename similarity above 100 percent", replace(["rename_similarity_percent", "value"], 101)],
      ["an empty rename-similarity reason", replace(["rename_similarity_percent", "reason"], "")],
    ])("should fail on %s", (_label, asset) => {
      const { repo, base } = repository();
      useThresholds(asset);

      expect(
        run(["--repo", repo, "--base", base, "--head", base, "--units", "1", "--risk", "R0"]),
      ).toEqual({
        status: 1,
        stdout: "",
        stderr: expect.stringContaining(thresholdAsset),
      });
    });
  });

  describe("arguments", () => {
    it.each(["-h", "--help"])("should print usage advertising the inventory options for %s", (flag) => {
      const completed = run([flag]);

      expect(completed).toEqual({
        status: 0,
        stderr: "",
        stdout: expect.stringMatching(
          new RegExp(`^${usagePrefix}(?=[\\s\\S]*--units)(?=[\\s\\S]*--risk)`),
        ),
      });
    });

    it.each([
      ["-h=x", "argument -h/--help: ignored explicit argument 'x'"],
      ["--help=x", "argument -h/--help: ignored explicit argument 'x'"],
    ])("should reject an explicit help value in %s", (flag, message) => {
      expectUsageError(run([flag]), message);
    });

    it("should not let help consume a missing --repo value", () => {
      expectUsageError(run(["--repo", "--help"]), "argument --repo: expected one argument");
    });

    it.each([
      ["--base", "-x"],
      ["--head", "--base"],
    ])("should reject %s followed by option token %s as a missing value", (option, token) => {
      expectUsageError(run([option, token]), `argument ${option}: expected one argument`);
    });

    it("should reject an option missing its trailing value", () => {
      expectUsageError(run(["--base"]), "argument --base: expected one argument");
    });

    it.each(["--base", "--head"])("should accept an empty %s= value and reach Git", (option) => {
      const { repo, base } = repository();
      const other = option === "--base" ? `--head=${base}` : `--base=${base}`;

      expect(run(["--repo", repo, `${option}=`, other])).toEqual({
        status: 1,
        stdout: "",
        stderr: expect.stringMatching(/\S\n$/),
      });
    });

    it.each([
      ["--base", "-1"],
      ["--head", "-.5"],
      ["--base", "-"],
    ])("should accept separated negative-number-shaped %s value %s and reach Git", (option, value) => {
      const { repo, base } = repository();
      const other = option === "--base" ? `--head=${base}` : `--base=${base}`;

      expect(run(["--repo", repo, other, option, value])).toEqual({
        status: 1,
        stdout: "",
        stderr: expect.stringMatching(/\S\n$/),
      });
    });

    it.each(["-1.", "-+1"])("should reject near-miss negative token %s as a missing base value", (value) => {
      expectUsageError(run(["--base", value]), "argument --base: expected one argument");
    });

    it("should accept unambiguous long-option abbreviations", () => {
      const { repo, base } = repository();

      const completed = run(["--rep", repo, `--b=${base}`, `--hea=${base}`, "--u=3", "--ri", "R2"]);

      expect({ ...completed, stdout: JSON.parse(completed.stdout) }).toEqual({
        status: 0,
        stderr: "",
        stdout: expect.objectContaining({
          base_oid: base,
          head_oid: base,
          risk_class: "R2",
          units: 3,
          zone: "yellow",
        }),
      });
    });

    it.each([
      ["--he", /ambiguous option: --he could match --help, --head/],
      ["--r", /ambiguous option: --r could match (--repo, --risk|--risk, --repo)/],
    ])("should reject the ambiguous %s abbreviation", (option, message) => {
      expectUsageError(run([option]), message);
    });

    it.each(["--unknown", "extra"])("should reject unrecognized argument %s", (argument) => {
      expectUsageError(
        run([argument, "--base=a", "--head=b"]),
        `unrecognized arguments: ${argument}`,
      );
    });

    it("should name every missing required argument", () => {
      expectUsageError(run([]), "the following arguments are required: --base, --head");
    });

    it.each([
      [["--units", "3"], /--units.*--risk|--risk.*--units/],
      [["--risk", "R1"], /--units.*--risk|--risk.*--units/],
      [["--units", "-1", "--risk", "R1"], /--units/],
      [["--units", "9007199254740992", "--risk", "R1"], /--units/],
      [["--units", "3", "--risk", "R4"], /--risk/],
    ])("should reject the inventory %j as a usage error", (inventory, message) => {
      expectUsageError(
        run(["--base", "a", "--head", "b", ...inventory]),
        new RegExp(`[^\\n]*(${message.source})[^\\n]*`),
      );
    });
  });
});
