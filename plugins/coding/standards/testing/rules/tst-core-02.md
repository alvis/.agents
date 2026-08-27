# TST-CORE-02: Follow TDD Order

## Intent

Write failing tests before implementation, then implement, then refactor. When already-correct behavior lacks a regression oracle, prove that an initially passing case detects the named regression before retaining it.

## Fix

```typescript
it("should fail first", () => expect(run()).toThrow());
```

## Test-Driven Development (TDD)

- **Test Before Code** - Write type-safe tests before implementing code
- **Follow TDD cycle** - Red → Green → Refactor with TypeScript checking at each step
- **Prove after-the-fact sensitivity** - For already-correct behavior, keep an initially passing regression case only after a temporary implementation mutation or equivalent controlled proof makes that case fail for the named behavior; restore the implementation, rerun the case green, and report the proof and restoration
- **BDD style descriptions** - Use 'should [expected behavior]' format

<IMPORTANT>
**All test descriptions MUST start with 'should'** - This is non-negotiable BDD format.

```typescript
// ✅ CORRECT: starts with 'should'
it('should pass through MIME type', () => { ... });
it('should return empty array', () => { ... });
it('should handle null input', () => { ... });
```

</IMPORTANT>

## Edge Cases

- When existing code matches prior violation patterns such as ❌ `runFeature()`, refactor before adding new behavior.
- Do not damage production code merely to manufacture a permanent red state. A temporary mutation used for sensitivity evidence never ships and must be restored before the case is retained.

## Related

TST-CORE-01, TST-CORE-03, TST-CORE-04
