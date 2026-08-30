import { jsTsTestFiles } from "../scanlib/predicates.ts";
import { lineRule } from "./_line-rule.ts";

/** Flags lifecycle hooks in test files. */
export const RULE = lineRule({
  id: "test-hooks",
  label: "Lifecycle hooks (beforeAll/afterAll/beforeEach/afterEach)",
  order: 20,
  appliesTo: jsTsTestFiles,
  ruleRefs: ["TST-STRU-01"],
  pattern: /\b(?:beforeAll|afterAll|beforeEach|afterEach)\s*\(/,
});
