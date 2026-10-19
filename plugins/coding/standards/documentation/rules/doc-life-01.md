# DOC-LIFE-01: Temporary Tags Never Reach a Ready PR

## Intent

Do not commit temporary drafting tags (`TODO`, `FIXME`, `DEBUG`, `TEMP`, `QUESTION`, `IDEA`, `INTENT`) outside the carve-out below. Move unfinished work context to issues/tasks before merge.

One carve-out exists: a [staged-delivery](../../../directions/staged-delivery.md) draft may commit `TODO(draft): <explicit finalization work>` markers. They are allowed only on a PR labelled `direction-review` and on the unfinalized stack layers peeled from it, so a draft can show direction without finishing every edge. Finalization removes every `TODO(draft):` marker before a layer is ready for review; a ready or merged PR carries none. The carve-out covers only that exact form — a bare `TODO`, any other temporary tag, or a `TODO(draft)` without a stated finalization task remains a violation everywhere.

## Fix

```typescript
// retry with backoff because partner API is not idempotent for charge requests
await retryWithBackoff(chargePayment, { maxAttempts: 3, baseDelayMs: 250 });
```

```typescript
// edge-case handling deferred to PROJ-1234
const result = processOrder(order);
```

```typescript
// ✅ allowed only on a direction-review draft or its unfinalized layers
// TODO(draft): reject expired coupons with CouponExpiredError before checkout
const total = applyCoupon(cart, coupon);
```

## Temporary Tags Reference

These tags indicate issues that MUST be resolved before committing:

| Tag | Purpose |
|-----|---------|
| `TODO` | pending implementation |
| `FIXME` | known incorrect behavior |
| `DEBUG` | debug-only code to remove |
| `TEMP` | stub implementation to replace |
| `QUESTION` | unresolved design question |
| `IDEA` | speculative improvement |
| `INTENT` | drafting-phase clarification |

`TODO(draft):` is the only committable form, under the carve-out above, and it must be gone before the PR is ready.

```typescript
// ❌ BAD: these must never be committed
// TODO: implement error handling for network failures
// FIXME: this calculation is incorrect for edge cases
// DEBUG: console.log for debugging - remove before commit
// TEMP: stub implementation - replace with real logic
// QUESTION: should we validate email format here?
// IDEA: could optimize this with memoization
// INTENT: clarifies why something is implemented this way

// ❌ BAD: draft marker without a finalization task, or left in a ready PR
// TODO(draft): fix later
```

## Edge Cases

- When existing code matches prior violation patterns such as ❌ `// TODO: fix this later`, resolve or move to issue tracking before adding new behavior.
- If work cannot be completed now, move context to issue tracking instead of leaving tags in source comments.
- These tags should trigger pre-commit hooks to prevent accidental commits. A commit hook cannot see PR state, so it may pass `TODO(draft):`; the check that gates readiness must reject it.
- A `TODO(draft):` marker still present when the layer is finalized blocks readiness; implement the work, move it to an issue, or delete the marker.

## Related

DOC-LIFE-02, DOC-LIFE-03, DOC-CONT-03
