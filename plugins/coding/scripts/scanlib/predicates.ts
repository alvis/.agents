import { basename, extname, matchesGlob } from "node:path";

import type { ApplicabilityContext } from "./rule.ts";

/** File extensions treated as plain source code. */
export const SOURCE_SUFFIXES = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
/** Python file extensions. */
export const PY_SUFFIXES = new Set([".py"]);
/** Rust file extensions. */
export const RUST_SUFFIXES = new Set([".rs"]);
/** TypeScript-only extensions, used by rules that must not read JSX. */
export const TS_SUFFIXES = new Set([".ts", ".tsx", ".mts", ".cts"]);

/**
 * Checks whether a path names a spec file by the `.spec.` marker.
 *
 * @param path - candidate file path
 * @returns true when the basename carries a `.spec.` segment on a source file
 */
export function isSpecFile(path: string): boolean {
  return (
    SOURCE_SUFFIXES.has(extname(path).toLowerCase()) &&
    basename(path).includes(".spec.")
  );
}

/**
 * Checks whether a path names any supported test file.
 *
 * @param path - candidate file path, relative to the scanned root when patterns are supplied
 * @param compilerTestPatterns - configured compiler-test discovery globs
 * @returns true for specs, tsd declaration tests, and Python test files
 */
export function isTestFile(
  path: string,
  compilerTestPatterns: readonly string[] = [],
): boolean {
  const name = basename(path);
  return (
    isSpecFile(path) ||
    isCompilerTestFile(path, compilerTestPatterns) ||
    (extname(path).toLowerCase() === ".py" &&
      (name.startsWith("test_") || name.endsWith("_test.py")))
  );
}

/**
 * Checks whether a path follows built-in or configured compiler-test discovery.
 *
 * @param path - candidate path relative to the configured test root
 * @param compilerTestPatterns - configured compiler-test discovery globs
 * @returns true when the path is a compiler test
 */
export function isCompilerTestFile(
  path: string,
  compilerTestPatterns: readonly string[] = [],
): boolean {
  let included = basename(path).endsWith(".test-d.ts");
  for (const pattern of compilerTestPatterns) {
    const negated = pattern.startsWith("!");
    const glob = negated ? pattern.slice(1) : pattern;
    if (glob !== "" && matchesGlob(path, glob)) included = !negated;
  }
  return included;
}

/**
 * Restricts runtime-only rules to spec files outside compiler-test discovery.
 *
 * @param path - candidate filesystem path used to enforce spec naming
 * @param context - configured compiler-test discovery for the normalized path
 * @returns true when the source is a runtime spec rather than a compiler test
 */
export function runtimeSpecFiles(
  path: string,
  context: ApplicabilityContext,
): boolean {
  return (
    isSpecFile(path) &&
    !isCompilerTestFile(context.testPath, context.compilerTestPatterns)
  );
}

/**
 * Predicate matching plain source files; the default rule applicability.
 *
 * @param path - candidate file path
 * @returns true when the extension is a source suffix
 */
export function sourceFiles(path: string): boolean {
  return SOURCE_SUFFIXES.has(extname(path).toLowerCase());
}

/**
 * Predicate restricting a rule to every supported test-file convention.
 *
 * @param _path - candidate filesystem path, unused because context owns the normalized path
 * @param context - configured test discovery for the current scan root
 * @returns true when the normalized path is any supported test file
 */
export function testFiles(
  _path: string,
  context: ApplicabilityContext,
): boolean {
  return isTestFile(context.testPath, context.compilerTestPatterns);
}

/**
 * Predicate restricting a rule to JavaScript and TypeScript test files.
 *
 * @param path - candidate filesystem path used to enforce language scope
 * @param context - configured test discovery for the current scan root
 * @returns true when a JavaScript or TypeScript source is a supported test
 */
export function jsTsTestFiles(
  path: string,
  context: ApplicabilityContext,
): boolean {
  return sourceFiles(path) && testFiles(path, context);
}

/**
 * Predicate restricting a rule to Python files.
 *
 * @param path - candidate file path
 * @returns true when the extension is `.py`
 */
export function pythonFiles(path: string): boolean {
  return PY_SUFFIXES.has(extname(path).toLowerCase());
}

/**
 * Predicate restricting a rule to TypeScript files, excluding JSX.
 *
 * @param path - candidate file path
 * @returns true when the extension is a TypeScript source-module suffix
 */
export function tsOnly(path: string): boolean {
  return TS_SUFFIXES.has(extname(path).toLowerCase());
}

/**
 * Predicate restricting a rule to barrel index modules.
 *
 * @param path - candidate file path
 * @returns true when the basename is an index module
 */
export function indexFiles(path: string): boolean {
  return ["index.ts", "index.tsx"].includes(basename(path));
}
