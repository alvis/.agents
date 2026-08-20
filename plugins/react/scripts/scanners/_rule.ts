import { basename, extname } from "node:path";

/** One reported violation location inside a scanned file. */
export interface Match {
  readonly path: string;
  readonly lineno: number;
  readonly line: string;
}
/** A single React lint rule: what it is, when it runs, and how it reports. */
export interface Rule {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly appliesTo: (path: string) => boolean;
  readonly ruleRefs?: readonly string[];
  readonly scan: (params: {
    readonly path: string;
    readonly lines: readonly string[];
    readonly matches: Match[];
  }) => void;
}
/** Predicate restricting a rule to TypeScript files, excluding JSX. */
export const tsOnly = (path: string): boolean =>
  [".ts", ".tsx"].includes(extname(path).toLowerCase());
/** Predicate restricting a rule to barrel index modules. */
export const indexFiles = (path: string): boolean =>
  ["index.ts", "index.tsx"].includes(basename(path));
