# TST-STRU-01: Enforce File Naming and Isolation

## Intent

Use `*.spec.ts` for unit, `*.spec.int.ts` for integration, `*.spec.e2e.ts` for end-to-end. Unit tests must stay isolated; integration tests must not rely on unit-style mocks.

## Fix

```typescript
// Before: Wrong naming convention
user.test.ts

// After: Correct naming conventions
user-service.spec.ts        // unit test
user-service.spec.int.ts    // integration test
user-service.spec.e2e.ts    // end-to-end test
```

## File Naming

- Unit tests: `*.spec.ts` or `*.spec.tsx`
- Integration tests: `*.spec.int.ts`
- End-to-end tests: `*.spec.e2e.ts`

**Test Isolation**: Unit tests (`.spec.ts`) must be fully isolated. Use mocks for databases, APIs, and services. Integration tests (`.spec.int.ts`) may use real internal dependencies and external services. **Mocking is NOT allowed in integration tests** - they must exercise real code paths.

## Edge Cases

- When existing code matches prior violation patterns such as `user.test.ts`, refactor before adding new behavior.

## Related

TST-STRU-02, TST-STRU-03, TST-CORE-01
