import { basename } from "node:path";
import {
  isCompilerTestFile,
  sourceFiles,
} from "../scanlib/predicates.ts";
import type { ApplicabilityContext, Rule } from "../scanlib/rule.ts";

function runtimeTestNamingCandidate(
  path: string,
  context: ApplicabilityContext,
): boolean {
  return (
    sourceFiles(path) &&
    !isCompilerTestFile(context.testPath, context.compilerTestPatterns)
  );
}

/** Flags test files using the `.test.` extension instead of `.spec.`. */
export const RULE: Rule = {
  id: "test-file-naming",
  label: "Test file uses `.test.*` instead of `.spec.*` (TST-STRU-01)",
  order: 140,
  appliesTo: runtimeTestNamingCandidate,
  ruleRefs: ["TST-STRU-01"],
  scan: ({ path, lines, matches }) => {
    if (/\.test\./.test(basename(path)))
      matches.push({ path, lineno: 1, line: lines[0] ?? "" });
  },
};
