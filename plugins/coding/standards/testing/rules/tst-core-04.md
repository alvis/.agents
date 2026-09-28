# TST-CORE-04: Keep Only Valuable Permanent Tests

## Intent

Every permanent mechanical test must verify a new behavior path or branch, distinct supported behavior, or meaningful edge case relative to the current suite. A new path or branch can improve coverage; a different observable behavior or real edge case can protect against drift without changing coverage. A coverage percentage alone does not identify the behavior path the test verifies. Remove an existing or proposed test that meets none of these criteria.

A test's description and assertions must match the behavior it exercises. A name that claims a path its input never reaches does not establish value. An initially passing regression case still needs the sensitivity proof and restored green run required by `TST-CORE-02`; meeting this value rule does not waive that requirement. `TST-COVR-01` separately requires at least one behavioral test for each exported runtime function.

## Fix

```typescript
it("should return empty list for an uncovered fallback", () => {
  expect(listFor(missingId)).toEqual([]);
});
```

For a performance-only improvement, a one-off local before/after measurement suffices when existing tests cover the supported behavior and the change introduces no new behavior path or meaningful edge case. Commit a performance test only when it protects a stable, supported performance requirement. A new branch introduced by the improvement still needs coverage under `TST-COVR-01`.

## Edge Cases

- A zero-coverage-gain test may remain when its assertion catches a distinct supported behavior regression or meaningful edge case that other tests miss.
- A test named `'unicode'` fed ASCII-only input does not exercise its claimed path. Correct the input when that edge case matters; otherwise delete the test.
- Remove duplicate tests already in the suite when they verify none of the three distinct cases; do not retain them merely because they predate this rule.

## Related

TST-CORE-01, TST-CORE-02, TST-CORE-03, TST-COVR-01, TST-COVR-04
