# TST-COVR-03: Coverage-Driven One-Test Workflow

## Intent

Write one test, rerun coverage, check the new behavior path or edge case it exercises, then continue. A distinct supported behavior may warrant a test without a coverage gain under `TST-CORE-04`.

## Fix

**Before:**
```typescript
it.each(cases)(...) // multiple tests written at once
```

**After:**
```typescript
vitest --coverage spec/user.spec.ts
```

## Coverage-Driven Workflow

1. **Run coverage FIRST** to identify uncovered lines
2. **Write ONE test** targeting an uncovered line/branch or a distinct supported behavior or meaningful edge case
3. **Run coverage again** to check the delta; a zero-gain test may still qualify under `TST-CORE-04`
4. **Keep or delete**: Apply `TST-CORE-04`; retain a test for a different behavior path, distinct supported behavior, or meaningful edge case, while an initially passing regression test also needs `TST-CORE-02` proof
5. **Repeat** for next uncovered line

```bash
vitest --coverage spec/path/to/file.spec.ts
```

## Edge Cases

- When existing code matches prior violation patterns such as `it.each(cases)(...)`, refactor before adding new behavior.
- A zero-gain test may remain when it verifies distinct supported behavior or a meaningful edge case not captured elsewhere; otherwise delete or merge it.

## Related

TST-COVR-01, TST-COVR-02, TST-COVR-04
