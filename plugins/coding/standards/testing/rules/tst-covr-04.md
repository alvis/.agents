# TST-COVR-04: Delete Redundant Zero-Gain Tests

## Intent

If coverage does not improve, keep the test only when it verifies a different behavior path, distinct supported behavior, or meaningful edge case under `TST-CORE-04`. Remove it when none applies; apply the same value rule to coverage-gaining tests.

## Fix

**Before:**
```typescript
it("should process valid user A", fn);
it("should process valid user B", fn); // coverageDelta === 0
```

**After:**
```typescript
// removed duplicate zero-delta test
```

## Edge Cases

- When existing code matches prior violation patterns such as `coverageDelta === 0 // keep`, refactor before adding new behavior.
- Retain a zero-gain test when it verifies distinct supported behavior or a meaningful edge case not caught elsewhere, subject to `TST-CORE-02` for initially passing cases.

## Related

TST-CORE-04, TST-COVR-01, TST-COVR-02, TST-COVR-03
