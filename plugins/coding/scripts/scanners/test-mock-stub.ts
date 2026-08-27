import { jsTsTestFiles } from "../scanlib/predicates.ts";
import { lineRule } from "./_line-rule.ts";

/** Flags mock and stub identifiers declared in test files. */
export const RULE = lineRule({
  id: "test-mock-stub",
  label: "Mock/stub identifiers in test files",
  order: 30,
  appliesTo: jsTsTestFiles,
  ruleRefs: ["TST-STRU-01"],
  pattern:
    /\b(?:(?!(?:setup|use)[A-Z])[A-Za-z]\w*(?:Stub|Mock)|(?:mock|mocked|stub|stubbed|stubed)[A-Z]\w*)\b/,
});
