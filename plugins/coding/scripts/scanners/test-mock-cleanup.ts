import { runtimeSpecFiles } from "../scanlib/predicates.ts";
import { lineRule, withoutLineComment } from "./_line-rule.ts";

/** Flags manual mock cleanup calls in test files. */
export const RULE = lineRule({
  id: "test-mock-cleanup",
  label: "Manual mock/stub cleanup in test file (TST-MOCK-10)",
  order: 26,
  appliesTo: runtimeSpecFiles,
  ruleRefs: ["TST-MOCK-10"],
  pattern:
    /\b(?:mockReset|mockClear|mockRestore|resetAllMocks|clearAllMocks|restoreAllMocks|unstubAllEnvs|unstubAllGlobals|reset)\b/,
  code: withoutLineComment,
});
