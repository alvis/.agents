# TST-CORE-03: Use Canonical Test Naming

## Intent

Every `it(...)` description must start with `should`.

`describe(...)` titles scoped to a runtime symbol (function, class, method, hook, etc.) or a symbol exercised by compiler-observable type behavior permitted by `TST-CORE-10` use an approved prefix (`fn:`, `sv:`, `op:`, `cl:`, `mt:`, `gt:`, `st:`, `re:`, `ty:`, `rc:`, `hk:`, `cmd:`). A `ty:` title contains only the symbol name; put the scenario in a nested suite or test name. A declaration's existence alone does not require a suite. General-purpose `describe(...)` titles that group tests by scenario, behavior category, or context use plain natural-language titles without a prefix.

## Fix

### `it(...)` — always start with `should`

```typescript
// ❌ VIOLATION: missing 'should' prefix
it('passes through MIME type', () => { ... });
it('returns empty array', () => { ... });

// ✅ CORRECT: starts with 'should'
it('should pass through MIME type', () => { ... });
it('should return empty array', () => { ... });
```

### `describe(...)` — prefix only when scoped to a symbol

```typescript
// ❌ VIOLATION: symbol-scoped describe without prefix
describe('computeTax', () => { ... });
describe('UserService', () => { ... });
describe('useAuth', () => { ... });

// ✅ CORRECT: symbol-scoped describe with approved prefix
describe('fn:computeTax', () => { ... });
describe('cl:UserService', () => { ... });
describe('hk:useAuth', () => { ... });
describe('ty:selectFields', () => { ... });
```

```typescript
// ❌ VIOLATION: general-purpose describe with unnecessary prefix
describe('fn:edge cases', () => { ... });
describe('sv:error handling', () => { ... });
describe('op:when user is admin', () => { ... });

// ✅ CORRECT: general-purpose describe with plain description
describe('edge cases', () => { ... });
describe('error handling', () => { ... });
describe('when user is admin', () => { ... });
```

For comment quality and AAA spacing in tests, see `TST-STRU-03`.

### Prefix Reference

| Prefix | Meaning | Example |
|--------|---------|---------|
| `fn:` | Function | `describe('fn:computeTax', ...)` |
| `sv:` | Service | `describe('sv:AuthService', ...)` |
| `op:` | Operation | `describe('op:migrate', ...)` |
| `cl:` | Class | `describe('cl:UserService', ...)` |
| `mt:` | Method | `describe('mt:toString', ...)` |
| `gt:` | Getter | `describe('gt:name', ...)` |
| `st:` | Setter | `describe('st:value', ...)` |
| `re:` | Regex | `describe('re:emailPattern', ...)` |
| `ty:` | Symbol exercised by compiler-observable type behavior permitted by `TST-CORE-10` | `describe('ty:isOrder', ...)` |
| `rc:` | React Component | `describe('rc:Button', ...)` |
| `hk:` | Hook | `describe('hk:useAuth', ...)` |
| `cmd:` | CLI command | `describe('cmd:build-project', ...)` |

DO NOT change an existing valid prefix to a different one. Match the prefix to the symbol's category.

## Edge Cases

- When existing code matches prior violation patterns such as ❌ `it("returns user", fn)`, refactor before adding new behavior.
- Nested `describe(...)` blocks inside a symbol-scoped parent are typically general-purpose (e.g., `describe("when input is empty", ...)`) and do **not** need prefixes.
- `ty:` identifies the symbol exercised by compiler-observable type behavior permitted by `TST-CORE-10`; the suffix is only the symbol name, and it never mandates one test per declaration or signature.

## Related

TST-CORE-01, TST-CORE-02, TST-CORE-04, TST-STRU-03
