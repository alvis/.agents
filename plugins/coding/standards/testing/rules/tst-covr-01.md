# TST-COVR-01: 100% Coverage Required

## Intent

Statements, branches, functions, and lines must each reach 100% for target code before a PR is ready for review or merges, excluding approved ignore-file exceptions (barrel, type-only, logic-free route-composition, and logic-free static-data files). Each exported runtime function except a static-data function under [TST-CORE-12](tst-core-12.md) must also have at least one permanent test that asserts its observable behavior, giving each public runtime entry point an explicit oracle even when incidental execution reaches 100% coverage. An existing consumer test counts when it explicitly exercises the function and asserts its observable effect; re-exports do not create another function or require another test. This minimum does not justify a duplicate test under `TST-CORE-04`; remove a no-value exported wrapper rather than manufacturing a call-only test for it.

The threshold applies at every stage except one: an unapproved direction-review draft. A draft PR whose head is a `wip/<work-id>` branch and that has not yet received direction approval carries the draft evidence floor of [staged delivery](../../../directions/staged-delivery.md#build-the-draft) instead of a coverage threshold. From direction approval onward, every layer peeled from that draft and the finalized top layer must reach 100% before it is ready; approval never carries a coverage gap forward.

## Fix

**Before:**
```typescript
global: { lines: 98, statements: 98 }
```

**After:**
```typescript
global: { lines: 100, statements: 100 }
```

## Requirements

<IMPORTANT>
- **100% statements, branches, functions, and lines** (excluding barrel, type-only, logic-free route-composition, and logic-free static-data files) before a PR is ready or merges; only an unapproved `direction-review` draft is exempt
- **At least one behavioral test per exported runtime function except static-data functions under TST-CORE-12**; an existing consumer test may satisfy this minimum
- Rerun coverage after each behavior group under `TST-COVR-03`
- Apply `TST-CORE-04` to every permanent test: retain tests for different behavior paths, distinct supported behavior, or meaningful edge cases, and remove unnecessary tests
- Remove dead code BEFORE measuring coverage — the 100% threshold applies to living code only. Never keep an unused symbol, no-value wrapper, or change-detector test to satisfy the threshold; delete the dead subject (`GEN-DESN-04`, `FUNC-ARCH-03`) and the threshold applies to what remains.
</IMPORTANT>

Exclude barrel files (`index.ts`), pure type files (`types.ts`), logic-free route-composition files, and logic-free static-data modules by placing `/* v8 ignore file */` at the top of the file. Do not add tests to manufacture coverage for them. Validate barrel and type files' public shape with type diagnostics and builds of affected consumers.

A route-composition file is a framework route entry, such as a Next.js `page.tsx` or `layout.tsx`, whose body only imports, declares the route component, and returns a tree composing containers and components. It owns no branch, data loading, state, or domain logic, so unit tests would only restate its markup; the end-to-end journey that renders the route covers it. This exclusion applies at every stage. A route file containing any branch, data loading, state, or domain logic is not route composition: move that logic into a covered component or container before marking the file.

A logic-free static-data module only declares static data or functions that return it independently of arguments and state. A test whose subject is that module would violate [TST-CORE-12](tst-core-12.md), and consumer tests cover it only incidentally, so `/* v8 ignore file */` is allowed. A module containing any branch or computation is not eligible: move its static data and static-data functions into a logic-free static-data module, so the remaining module reaches 100% through behavioral tests.

For the behavior-group coverage workflow, see `TST-COVR-03`.

## Configuration

```typescript
// vitest.config.ts
{
  coverage: {
    provider: 'v8',
    thresholds: {
      global: { branches: 100, functions: 100, lines: 100, statements: 100 }
    }
  }
}
```

## Edge Cases

- When existing code matches prior violation patterns such as `lines: 98`, refactor before adding new behavior.
- If uncovered lines remain, prioritize tests for failure/fallback branches before adding variation tests.
- Barrel files are ignore-marked with `/* v8 ignore file */`; do not write re-export tests to chase their coverage.
- Pure type files are excluded from runtime coverage. A focused compile-time test remains valid only for a compiler-observable behavior permitted by `TST-CORE-10`; exact declaration shape stays with type diagnostics and affected-consumer builds.
- `/* v8 ignore file */` on a route file that fetches data, branches, or holds state is a violation, not an exclusion.
- The `direction-review` exemption ends at direction approval. The approved draft is closed once peeled to zero residual diff and never merges; a PR that only uses a `wip/` branch without being that unapproved draft is not exempt.

## Related

TST-COVR-02, TST-COVR-03, TST-COVR-04
