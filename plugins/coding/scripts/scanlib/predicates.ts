import { basename, extname } from "node:path";

/** File extensions treated as plain source code. */
export const SOURCE_SUFFIXES = new Set([
  ".ts",
  ".tsx",
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
export const TS_SUFFIXES = new Set([".ts", ".tsx"]);

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
 * Checks whether a path names any kind of test file, spec or Python test.
 *
 * @param path - candidate file path
 * @returns true for spec-named sources and `test_*`/`*_test.py` files
 */
export function isTestFile(path: string): boolean {
  const name = basename(path);
  return (
    isSpecFile(path) ||
    (extname(path).toLowerCase() === ".py" &&
      (name.startsWith("test_") || name.endsWith("_test.py")))
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
 * Predicate restricting a rule to spec-named files only.
 *
 * @param path - candidate file path
 * @returns true when the path is a spec file
 */
export function specFiles(path: string): boolean {
  return isSpecFile(path);
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
 * @returns true when the extension is `.ts` or `.tsx`
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
