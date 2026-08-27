import { sourceFiles, testFiles } from "../scanlib/predicates.ts";
import type { ApplicabilityContext } from "../scanlib/rule.ts";
import { lineRule, withoutLineComment } from "./_line-rule.ts";

function productionFiles(path: string, context: ApplicabilityContext): boolean {
  return sourceFiles(path) && !testFiles(path, context);
}

/** Flags type-escape casts in non-test sources. */
export const RULE = lineRule({
  id: "escape-cast",
  label: "Type-escape cast (`as unknown as` / `as never`) (TYP-CORE-03)",
  order: 90,
  appliesTo: productionFiles,
  ruleRefs: ["TYP-CORE-03"],
  pattern: /\bas\s+unknown\s+as\b|\bas\s+never\b/,
  code: withoutLineComment,
});
