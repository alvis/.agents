import { runtimeSpecFiles } from "../scanlib/predicates.ts";
import { lineRule, withoutLineComment } from "./_line-rule.ts";

/** Flags dynamic imports inside test files. */
export const RULE = lineRule({
  id: "test-dynamic-import",
  label: "Dynamic `import()` in test file (TST-CORE-08)",
  order: 150,
  appliesTo: runtimeSpecFiles,
  ruleRefs: ["TST-CORE-08"],
  pattern: /\bimport\s*\(/,
  code: withoutLineComment,
});
