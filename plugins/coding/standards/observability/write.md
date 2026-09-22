# Observability: Compliant Code Patterns

## Key Principles

- Apply selected language failure-representation and hierarchy rules plus the project's established error strategy, then reuse a semantically matching built-in, codebase, or installed core/error-library type before choosing a fallback error
- Throw early at detection, handle explicitly at boundaries (HTTP handlers, jobs, CLI)
- Use the project logger (`action.log`/equivalent), never `console.*` in app logic
- Map log levels to outcome severity deliberately
- Always include structured context fields for traceability (ids, actor, operation, resource, latency)
- Never log secrets, tokens, PII, or raw credentials
- Record duration and threshold signals for expensive operations

## Core Rules Summary

### Error Handling (ERR-HAND)

- **ERR-HAND-01**: Within the failure representation, hierarchy, and established project error strategy, evaluate a matching built-in first, then reuse a codebase or installed core/error-library type and supply its supported code or reason plus cause when wrapping; do not add a dependency merely for reuse; when none fits, obtain and durably record the user's compliant fallback choice.
- **ERR-HAND-02**: Throw as soon as invalid state is detected; handle errors explicitly at system boundaries. Never swallow with empty catch.
- **ERR-HAND-03**: Error logs must retain cause chain and stack context when available.
- **ERR-HAND-04**: Cast caught errors immediately via `as Error` or a `toError` helper. Never use conditional branching on base `Error` in catch blocks.

### Logging Operations (LOG-OPER)

- **LOG-OPER-01**: Use the project logger (`action.log`/equivalent). No `console.*` in application/runtime logic.
- **LOG-OPER-02**: Map outcomes to severity: `debug` diagnostics, `info` success milestones, `warn` degraded-but-recovered, `error` failed operations, `fatal` unrecoverable shutdown.
- **LOG-OPER-03**: Messages must state action + target + outcome clearly with structured metadata.
- **LOG-OPER-04**: Always log structured fields required for traceability (ids, actor, operation, resource, latency, status).
- **LOG-OPER-05**: Use one canonical domain vocabulary per concept across all logs.

### Logging Risk Controls (LOG-RISK)

- **LOG-RISK-01**: Never log secrets or direct PII. Log stable identifiers and sanitized metadata instead.
- **LOG-RISK-02**: Log authorization changes, ownership changes, destructive operations, and compliance-sensitive actions.
- **LOG-RISK-03**: Record duration and threshold signals for expensive operations.

## Patterns

### Error Modeling

First apply every selected language rule that governs failure representation or inheritance, then inspect the project's existing error strategy, boundary mappings, and catch sites under `GEN-CONS-01`. For example, an expected recoverable TypeScript failure remains a typed result, and a Python domain exception remains rooted in the project's domain base. Within those contracts, evaluate a built-in first and reuse it only when its semantics match without bypassing established handling:

```typescript
if (!Number.isInteger(limit) || limit < 1) {
  throw new RangeError("limit must be a positive integer");
}
```

Otherwise reuse an error already shipped by the codebase or an installed core/error library, including its supported discriminator. When wrapping another failure, the type is suitable only if its existing contract preserves the cause chain required by `ERR-HAND-03`. Keep the language-required control-flow shape; the reused class can be the error value inside a typed result:

```typescript
import { BillingChargeError } from "@example/core-errors";

try {
  await chargeOrder(order);
  return { ok: true };
} catch (error) {
  const exception = error as Error;
  action.log.error("Charging order failed", {
    operation: "billing:charge-order",
    orderId: order.id,
    errorMessage: exception.message,
    stack: exception.stack,
  });
  return {
    ok: false,
    error: new BillingChargeError("charging order failed", {
      cause: exception,
      code: "BILLING_CHARGE_FAILED",
    }),
  };
}
```

Do not add a dependency merely to satisfy this reuse lookup. A dependency independently required by a selected language contract is governed by that language rule, not justified by `ERR-HAND-01`. If that required dependency is absent and the current task forbids dependency changes, report that no compliant option exists in scope and ask the user whether to expand the scope; do not install it or pretend it is available.

<IMPORTANT>
If no suitable type exists, follow the authoritative blocking fallback procedure in [`ERR-HAND-01`](rules/err-hand-01.md#no-suitable-error-exists). Do not implement a fallback until the required durable approval exists.
</IMPORTANT>

### Log Level Selection

| Level   | Use When                                      |
|---------|-----------------------------------------------|
| `debug` | Verbose diagnostic detail (dev only)          |
| `info`  | Expected success milestones                   |
| `warn`  | Degraded but recovered states                 |
| `error` | Failed operations requiring investigation     |
| `fatal` | Unrecoverable shutdown paths                  |

### Structured Context

Always include traceability fields in log metadata:

```typescript
action.log.info("Processing invoice completed", {
  operation: "billing:process-invoice",
  invoiceId,
  durationMs,
});
```

### Sensitive Data Handling

Log stable identifiers, never raw secrets:

```typescript
action.log.info("created api token", {
  userId,
  tokenId,
  tokenPreview: `${token.slice(0, 4)}***`,
});
```

## Anti-Patterns

- Logging whole request/response payloads by default.
- Free-form string-only logs with no machine-readable metadata.
- Downgrading failure logs to `info` for noise control.
- Swallowing errors with empty `catch` blocks or silent returns.

## Quick Decision Tree

1. What failure representation and inheritance shape do the selected language standards require, and what error strategy do project boundaries and catch sites already enforce? Apply those contracts first (`ERR-HAND-01`, `ERR-HAND-02`, `GEN-CONS-01`).
2. Within those contracts, does a semantically matching built-in error exist without bypassing established handling? Reuse it (`ERR-HAND-01`).
3. Otherwise, does the codebase or an installed core/error library already ship one that preserves any required cause? Reuse it with its supported code or reason and cause (`ERR-HAND-01`, `ERR-HAND-03`).
4. If neither fits, follow [`ERR-HAND-01`'s blocking fallback procedure](rules/err-hand-01.md#no-suitable-error-exists) and do not continue before its approval requirement is met.
5. Fail early and preserve the cause chain (`ERR-HAND-02`, `ERR-HAND-03`).
6. Use the transactional logger with structured fields (`LOG-OPER-01`, `LOG-OPER-04`).
7. Validate message quality, terminology, and sensitive-data handling (`LOG-OPER-03`, `LOG-OPER-05`, `LOG-RISK-01`).
8. Record duration for expensive operations (`LOG-RISK-03`).
