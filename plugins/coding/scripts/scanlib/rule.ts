import { sourceFiles } from "./predicates.ts";

/** One reported violation location inside a scanned file. */
export interface Match {
  readonly path: string;
  readonly lineno: number;
  readonly line: string;
}

/** Everything a rule needs to inspect one file and report matches. */
export interface ScanParams {
  readonly path: string;
  readonly lines: readonly string[];
  readonly matches: Match[];
}

/**
 * A single lint rule: what it is, when it runs, and how it reports.
 *
 * `appliesTo` defaults to plain source files; `honorNoTests` opts the rule
 * out of `--no-tests` skips for spec-named inputs.
 */
export interface Rule {
  readonly id: string;
  readonly label: string;
  readonly scan: (params: ScanParams) => void;
  readonly order: number;
  readonly appliesTo?: (path: string) => boolean;
  readonly honorNoTests?: boolean;
  readonly ruleRefs?: readonly string[];
}

/**
 * Resolves whether a rule should run against a path, falling back to source
 * files for rules without an explicit predicate.
 *
 * @param rule - the rule being dispatched
 * @param path - candidate file path
 * @returns true when the rule applies to the path
 */
export function appliesTo(rule: Rule, path: string): boolean {
  return (rule.appliesTo ?? sourceFiles)(path);
}
