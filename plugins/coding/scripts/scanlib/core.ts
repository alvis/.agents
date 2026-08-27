import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import { loadRules } from "./loader.ts";
import {
  isTestFile,
  PY_SUFFIXES,
  RUST_SUFFIXES,
  SOURCE_SUFFIXES,
} from "./predicates.ts";
import { appliesTo } from "./rule.ts";

import type { Match, Rule } from "./rule.ts";

const SCANNED_SUFFIXES = new Set([
  ...SOURCE_SUFFIXES,
  ...PY_SUFFIXES,
  ...RUST_SUFFIXES,
]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".turbo",
  ".cache",
  "out",
]);

interface RunOptions {
  readonly rulesDirectory?: string;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
}

interface ParsedArgs {
  readonly paths: readonly string[];
  readonly category: string;
  readonly before: number;
  readonly after: number;
  readonly noTests: boolean;
  readonly compilerTestPatterns: readonly string[];
  readonly testRoot: string;
}

type ParseResult = ParsedArgs | { readonly error: string };

const EXTGLOB_OPERATORS = "?*+@!";

function containsExtglob(pattern: string): boolean {
  let inCharacterClass = false;
  for (let index = 0; index < pattern.length - 1; index += 1) {
    const character = pattern[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "[") inCharacterClass = true;
    else if (character === "]") inCharacterClass = false;
    else if (
      !inCharacterClass &&
      EXTGLOB_OPERATORS.includes(character ?? "") &&
      pattern[index + 1] === "("
    )
      return true;
  }
  return false;
}

function normalizeCompilerTestPattern(
  pattern: string,
  testRoot: string,
): string {
  const negated = pattern.startsWith("!");
  const glob = negated ? pattern.slice(1) : pattern;
  const absolute = isAbsolute(glob) ? glob : resolve(testRoot, glob);
  return `${negated ? "!" : ""}${relative(testRoot, absolute)}`;
}

/**
 * Walks a file or directory tree and collects every scannable source path.
 *
 * Skips build and cache directories, and orders entries deterministically.
 *
 * @param root - file or directory to walk
 * @returns absolute-ish paths of every scanned file, in walk order
 */
export function iterFiles(root: string): string[] {
  if (statSync(root).isFile()) return [root];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (
        entry.isFile() &&
        SCANNED_SUFFIXES.has(extname(path).toLowerCase())
      )
        files.push(path);
    }
  };
  visit(root);
  return files;
}

/**
 * Renders one rule's matches as the golden report: header, per-match context
 * windows, and a trailing blank line per file.
 *
 * @param label - rule label used as the report header
 * @param matches - reported violations for the rule
 * @param linesByPath - file lines keyed by path, for context rendering
 * @param before - context lines shown before each match
 * @param after - context lines shown after each match
 * @returns the rendered report text
 */
export function render(
  label: string,
  matches: readonly Match[],
  linesByPath: ReadonlyMap<string, readonly string[]>,
  before: number,
  after: number,
): string {
  const output = [`=== ${label} ===`, ""];
  if (matches.length === 0) return [...output, "(no matches)", ""].join("\n");
  const byFile = new Map<string, Match[]>();
  for (const match of matches)
    byFile.set(match.path, [...(byFile.get(match.path) ?? []), match]);
  for (const [path, items] of byFile) {
    for (const [index, match] of items.entries()) {
      output.push(`${path}:${match.lineno}  ${match.line.trim()}`);
      const lines = linesByPath.get(path) ?? [];
      const start = Math.max(1, match.lineno - before);
      const end = Math.min(lines.length, match.lineno + after);
      for (let lineno = start; lineno <= end; lineno += 1)
        output.push(
          `  ${lineno === match.lineno ? ">" : " "} ${String(lineno).padStart(4)}: ${(lines[lineno - 1] ?? "").trimEnd()}`,
        );
      if (index + 1 < items.length) output.push("", "  --- next match ---", "");
    }
    output.push("");
  }
  return output.join("\n");
}

function parseArgs(argv: readonly string[]): ParseResult {
  const paths: string[] = [];
  let category = "all";
  let before = 5;
  let after = 10;
  let noTests = false;
  const compilerTestPatterns: string[] = [];
  let testRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--category") category = argv[++index] ?? "";
    else if (argument.startsWith("--category="))
      category = argument.slice("--category=".length);
    else if (argument === "--before") before = Number(argv[++index]);
    else if (argument.startsWith("--before="))
      before = Number(argument.slice("--before=".length));
    else if (argument === "--after") after = Number(argv[++index]);
    else if (argument.startsWith("--after="))
      after = Number(argument.slice("--after=".length));
    else if (argument === "--no-tests") noTests = true;
    else if (argument === "--test-pattern") {
      const pattern = argv[++index];
      if (
        pattern === undefined ||
        pattern === "" ||
        pattern === "!" ||
        pattern.startsWith("--")
      )
        return { error: "--test-pattern requires a non-empty glob" };
      if (containsExtglob(pattern))
        return { error: "--test-pattern does not support extglob syntax" };
      compilerTestPatterns.push(pattern);
    } else if (argument.startsWith("--test-pattern=")) {
      const pattern = argument.slice("--test-pattern=".length);
      if (pattern === "" || pattern === "!")
        return { error: "--test-pattern requires a non-empty glob" };
      if (containsExtglob(pattern))
        return { error: "--test-pattern does not support extglob syntax" };
      compilerTestPatterns.push(pattern);
    } else if (argument === "--test-root") {
      const root = argv[++index];
      if (root === undefined || root === "" || root.startsWith("--"))
        return { error: "--test-root requires a non-empty path" };
      testRoot = resolve(root);
    } else if (argument.startsWith("--test-root=")) {
      const root = argument.slice("--test-root=".length);
      if (root === "")
        return { error: "--test-root requires a non-empty path" };
      testRoot = resolve(root);
    } else if (argument.startsWith("--"))
      return { error: `unrecognized argument: ${argument}` };
    else paths.push(argument);
  }
  if (!Number.isInteger(before) || before < 0)
    return { error: "--before must be a non-negative integer" };
  if (!Number.isInteger(after) || after < 0)
    return { error: "--after must be a non-negative integer" };
  return {
    paths: paths.length === 0 ? ["."] : paths,
    category,
    before,
    after,
    noTests,
    compilerTestPatterns: compilerTestPatterns.map((pattern) =>
      normalizeCompilerTestPattern(pattern, testRoot),
    ),
    testRoot,
  };
}

/**
 * Runs the scanner end to end: loads rules, parses arguments, scans every
 * root, and writes the report.
 *
 * @param argv - command-line arguments; defaults to `process.argv.slice(2)`
 * @param options - overrides for the rule directory and output sinks
 * @returns the process exit code: 0 on a completed run, 2 on bad usage
 */
export async function run(
  argv: readonly string[] = process.argv.slice(2),
  options: RunOptions = {},
): Promise<number> {
  const rules = await loadRules(options.rulesDirectory);
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const args = parseArgs(argv);
  if ("error" in args) {
    (options.stderr ?? ((text) => process.stderr.write(text)))(
      `error: ${args.error}\n`,
    );
    return 2;
  }
  const selected: readonly Rule[] =
    args.category === "all"
      ? rules
      : byId.has(args.category)
        ? [byId.get(args.category) as Rule]
        : [];
  if (selected.length === 0 && args.category !== "all") {
    (options.stderr ?? ((text) => process.stderr.write(text)))(
      `error: invalid category: ${args.category}\n`,
    );
    return 2;
  }
  const results = new Map(selected.map((rule) => [rule.id, [] as Match[]]));
  const linesByPath = new Map<string, readonly string[]>();
  for (const root of args.paths) {
    if (!existsSync(root)) {
      (options.stderr ?? ((text) => process.stderr.write(text)))(
        `warn: path not found: ${root}\n`,
      );
      continue;
    }
    for (const path of iterFiles(root)) {
      const testPath = relative(args.testRoot, path);
      const applicability = {
        compilerTestPatterns: args.compilerTestPatterns,
        testPath,
      };
      let lines: readonly string[] | undefined;
      for (const rule of selected) {
        if (
          !appliesTo(rule, path, applicability) ||
          (rule.honorNoTests &&
            args.noTests &&
            isTestFile(testPath, args.compilerTestPatterns))
        )
          continue;
        if (lines === undefined) {
          try {
            lines = readFileSync(path, "utf8")
              .split(/\r?\n/)
              .filter(
                (_, index, source) =>
                  index < source.length - 1 || source[index] !== "",
              );
          } catch {
            lines = [];
          }
        }
        linesByPath.set(path, lines);
        rule.scan({ path, lines, matches: results.get(rule.id) as Match[] });
      }
    }
  }
  const chunks: string[] = [];
  const summary: string[] = [];
  for (const rule of selected) {
    const matches = results.get(rule.id) ?? [];
    chunks.push(
      render(rule.label, matches, linesByPath, args.before, args.after),
    );
    summary.push(
      `  ${rule.id}: ${matches.length} matches in ${new Set(matches.map((match) => match.path)).size} files`,
    );
  }
  (options.stdout ?? ((text) => process.stdout.write(text)))(
    `${chunks.join("\n")}\n=== Summary ===\n${summary.join("\n")}\n`,
  );
  return 0;
}
