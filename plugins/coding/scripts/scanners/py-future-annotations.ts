import { pythonFiles } from "../scanlib/predicates.ts";
import { lineRule } from "./_line-rule.ts";

/** Flags future-annotation imports in Python files. */
export const RULE = lineRule({
  id: "py-future-annotations",
  label: "Forbidden `from __future__ import annotations` (PYT-IMPT-03)",
  order: 240,
  appliesTo: pythonFiles,
  ruleRefs: ["PYT-IMPT-03"],
  pattern: /^\s*from\s+__future__\s+import\s+(?:[\w,\s]*\b)?annotations\b/,
});
