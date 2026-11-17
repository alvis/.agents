# TST-CORE-16: Pin Behavior Before Refactors and Performance Changes

## Intent

Before a refactor or performance-only change, every supported public behavior the change touches is pinned by a test asserting its observable output or effect. Coverage alone does not identify behavior ([TST-CORE-04](tst-core-04.md)), so executed lines do not count as pinned. Any pinning test added for already-correct behavior carries the sensitivity proof required by [TST-CORE-02](tst-core-02.md). Pinning tests pass before the change, keep their inputs and assertions unchanged through it, and pass after it; a change to a pin's inputs or assertions means behavior changed, so the change is no longer a refactor.

## Fix

```typescript
it("should total line items with tax", () => {
  expect(total([{ priceCents: 1000, qty: 2 }], 0.5)).toBe(3000);
});
```

Add this test and prove it before restructuring `total`, then run it unchanged afterward.

## Edge Cases

- A pinning test that fails after the change reveals a behavior change; revert or reclassify the change, never edit the test to pass.
- Behavior untouched by the change needs no new pin, and pinning does not require filling coverage of untouched code; coverage of the touched sources must not fall below its pre-change baseline, while [TST-COVR-01](tst-covr-01.md) still governs the ready/merge gate.
- Import-path or identifier updates that mechanically follow a move or rename are not edits to a pin.
- Pins assert supported effects and structure under [TST-CORE-14](tst-core-14.md); committed snapshots of whole output are not pins ([TST-CORE-13](tst-core-13.md)).

## Related

TST-CORE-02, TST-CORE-04, TST-CORE-13, TST-CORE-14
