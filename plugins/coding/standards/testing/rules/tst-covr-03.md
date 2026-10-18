# TST-COVR-03: Coverage-Driven Behavior-Group Workflow

## Intent

Rerun coverage after each behavior group, not after each test. A behavior group is the set of tests for one cohesive behavior of the subject: one exported function's contract, one branch family such as its failure or fallback paths, or one supported scenario — usually what one subject-scoped or scenario `describe` block holds. Write that group's tests, rerun coverage, read the delta against the group, then continue with the next group. Rerunning more often is allowed but never required.

Writing tests for several subjects or behavior groups before one coverage run hides which tests add value, so it remains a violation. A distinct supported behavior may warrant a test without a coverage gain under `TST-CORE-04`.

## Fix

**Before:**
```typescript
// suites for parse, format, and validate all written, then one coverage run
describe("fn:parse", ...); describe("fn:format", ...); describe("fn:validate", ...);
```

**After:**
```bash
# write the fn:parse group, then rerun before starting fn:format
vitest --coverage spec/parse.spec.ts
```

## Coverage-Driven Workflow

1. **Run coverage FIRST** to identify uncovered lines and branches
2. **Pick ONE behavior group** that targets uncovered lines/branches or a distinct supported behavior or meaningful edge case
3. **Write the group's tests**; `TST-CORE-02` still requires a failing test before each new supported behavior is implemented
4. **Run coverage again** and attribute the delta to the group; a zero-gain test may still qualify under `TST-CORE-04`
5. **Keep or delete each test in the group**: apply `TST-CORE-04`; retain a test for a different behavior path, distinct supported behavior, or meaningful edge case, while an initially passing regression test also needs `TST-CORE-02` proof. When the group's gain is lower than its test count suggests, rerun without the doubtful test to find what it adds instead of keeping it by default
6. **Repeat** for the next group

```bash
vitest --coverage spec/path/to/file.spec.ts
```

## Edge Cases

- When existing work matches prior violation patterns, such as a whole spec file written before its first coverage run, rerun now and apply `TST-CORE-04` to every test before adding new behavior.
- An `it.each(cases)` table inside one group is compliant when each row exercises a different path or meaningful edge case; arbitrary variation rows still violate `TST-CORE-05`.
- A group that grows to span several subjects or branch families is several groups; rerun between them.
- A zero-gain test may remain when it verifies distinct supported behavior or a meaningful edge case not captured elsewhere; otherwise delete or merge it.

## Related

TST-COVR-01, TST-COVR-02, TST-COVR-04
