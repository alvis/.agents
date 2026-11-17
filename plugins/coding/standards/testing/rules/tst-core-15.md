# TST-CORE-15: Test Idempotency of Side-Effecting Async Operations

## Intent

An async operation that writes to a persistent store, calls an external service with a side effect, handles queue, event, or webhook messages, or runs as a retried or scheduled job has at least one test that runs it twice with the same input and asserts the documented end state. Retries, redelivery, and double submission make repeat execution routine, so one run proves nothing about it. Assert one effect when the operation is idempotent; assert the documented repeat outcome (second record, rejection, conflict error) when it is deliberately not idempotent. Pure reads are out of scope.

Place the test where deduplication happens. When a store constraint or provider idempotency key deduplicates, use an integration test under the real-integration and `TEST_*` credential policy in [validation](../../../directions/validation.md#integration-development). When the codebase's own code deduplicates, a unit test with a stateful fake suffices.

## Fix

```typescript
it("should charge once when the same payment is submitted twice", async () => {
  const ledger = createLedger();
  const input = { paymentId: "pay_1", amount: 500 };

  await submitPayment(ledger, input);
  await submitPayment(ledger, input);

  expect(ledger.charges).toEqual([{ paymentId: "pay_1", amount: 500 }]);
});
```

## Edge Cases

- A mock that records calls cannot show deduplication; the fake must hold state the second run reads. That state comes only from the operation's own writes, never from a preset scenario flag ([TST-MOCK-07](tst-mock-07.md)), and the fake is created inside the `it()` ([TST-MOCK-04](tst-mock-04.md)).
- A store constraint or provider key the fake does not reproduce is not tested by the fake; use the integration test.
- Different inputs prove independence, not idempotency; the second run must reuse the same input.

## Related

TST-CORE-02, TST-MOCK-01, TST-MOCK-04, TST-MOCK-07
