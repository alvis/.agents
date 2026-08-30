import { jsTsTestFiles } from "../scanlib/predicates.ts";
import { lineRule, withoutLineComment } from "./_line-rule.ts";

/** Flags type-escape casts used as test doubles in test files. */
export const RULE = lineRule({
  id: "spec-escape-cast",
  label:
    "Type-escape test-double cast (`as unknown as` / `as never`) (TST-MOCK-09/TYP-TYPE-07)",
  order: 91,
  appliesTo: jsTsTestFiles,
  ruleRefs: ["TST-MOCK-09", "TYP-TYPE-07"],
  pattern: /\bas\s+unknown\s+as\b|\bas\s+never\b/,
  code: withoutLineComment,
});
