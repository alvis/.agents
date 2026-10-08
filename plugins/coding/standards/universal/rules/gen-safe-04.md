# GEN-SAFE-04: Handle Realistic Failures

## Intent

Build the supported happy path, then add failure handling, runtime checks, and tests only for failures that realistically occur in supported production use. A failure that is merely possible is not a requirement. Whoever proposes the handling — author, tester, reviewer, or planner — supplies the classification or estimate below. Finding no failure worth handling is a complete result, not a gap to fill.

## Decision Test

Classify each candidate failure before adding or requesting handling:

1. **External availability is always realistic.** Dependency timeouts, connection errors, 5xx responses, rate limits, partial outages, and the delivery semantics a provider documents — at-least-once redelivery, duplicates, out-of-order events — are handled per the provider's contract without an estimate. An event racing our own write of the provider's response is an ordering race under item 4, not delivery semantics.
2. **Attacker-timed races are always realistic.** When an attacker at a trust boundary chooses the timing (replay, double submission, check-then-use on authorization or balances), frequency does not apply; security standards own the finding.
3. **Irreversible loss is always realistic.** Handle a race whose result no retry, reconciliation, or re-run can correct: permanently lost data, or money charged or moved. A failure that surfaces as an error and succeeds when retried is not irreversible.
4. **Estimate every other race, timing, or edge case.** Expected occurrences per day ≈ events of A per day × events of B per second × overlap window in seconds, at current or approved production volume. For an ordering race, count only the share of the competing path's documented or measured latency that falls inside the window, never the bare possibility that it could. Take inputs from production metrics, provider documentation, or explicitly stated assumptions. Handle the case when the estimate reaches about one occurrence per day.

The one-per-day bar exists because a daily failure surfaces within a normal monitoring cycle and recurs often enough that handling it costs less than repeatedly diagnosing it. Below the bar, the existing error path surfaces the rare occurrence visibly under `GEN-SAFE-02`, and an observed occurrence becomes the evidence that justifies handling.

## Worked Estimates

| Candidate | Estimate | Decision |
|---|---|---|
| Decryption key retired during a decrypt | 1,000,000 decrypts/day × 4 retirements/year (≈1.3×10⁻⁷/s) × 0.005 s ≈ 0.0006/day; the result is a retryable error | Not handled |
| Webhook arrives before our process saves the resource ID from the API response | The save completes within milliseconds of the response; measured webhook latency is seconds, so no share of it falls inside the window | Not handled; a missing record fails visibly and the provider redelivers |
| Duplicate webhook delivery | The provider documents at-least-once delivery | Handled: deduplicate by event ID |
| Concurrent edits to 100 hot records | 500 edits/record/day × (500/86,400)/s × 0.2 s read-modify-write ≈ 0.58/record/day × 100 ≈ 58/day | Handled: optimistic concurrency |

## Fix

```typescript
// ❌ BAD: a pending queue for a webhook that cannot realistically precede our own save
async function onPaymentEvent(event: PaymentEvent): Promise<void> {
  const payment = await payments.findByProviderId(event.paymentId);
  if (!payment) {
    await pendingEvents.enqueue(event);
    return;
  }
  await payments.apply(payment, event);
}

// ✅ GOOD: happy path plus the documented at-least-once delivery
async function onPaymentEvent(event: PaymentEvent): Promise<void> {
  const payment = await payments.getByProviderId(event.paymentId); // throws NotFoundError → non-2xx → provider redelivers
  await payments.applyOnce(payment, event); // records event.id and applies in one transaction; a duplicate is a no-op
}
```

## Edge Cases

- A below-bar concern is at most an explicitly non-blocking thought with its assumptions stated; it never requires code, tests, or review work.
- Re-estimate when approved production volume changes by an order of magnitude, because smaller shifts fall within the precision of the estimate itself, or when an incident shows the case occurring; both change the inputs, not the bar.
- Existing below-bar handling is removable complexity under `GEN-CONS-03` when removing it preserves supported behavior.
- Validation of external input shape stays under `GEN-SAFE-03`; this rule governs which failure paths deserve handling.
- Calling a retryable failure "data loss" or "correctness" does not exempt it from the estimate; only the irreversible-loss definition above does.

## Related

GEN-SAFE-02, GEN-SAFE-03, GEN-SCAL-03, GEN-CONS-03
