# GEN-CONS-03: Clarity Over Cleverness

## Intent

Prefer straightforward constructs that optimize maintainability and onboarding. Unnecessary complexity and clever or terse patterns are non-compliant when a concrete clearer alternative preserves supported behavior.

Remove redundant branches, guarded assignments, conditional object construction, repetitive logic, and intermediates that add neither required behavior nor useful explanation. A cheap assignment does not need a guard merely to avoid repeating the operation; retain it when side effects, setters, consumer contracts, or evidenced performance constraints require it.

Establish equivalence from actual producers and consumers, including falsy values, coercion, evaluation order, side effects, and property presence. [FUNC-SIGN-06](../../function/rules/func-sign-06.md) owns conditional-spread exceptions and their comments. Choose clearer code, not merely fewer lines: branch counts, expression length, regex matches, or a particular syntax cannot establish a violation. Apply this judgment to the code being reviewed; do not encode illustrative examples as mechanical simplification gates.

## Fix

```typescript
// ❌ BAD: clever but unclear
const isValid = !!(user && user.email && +user.age >= 18);

// ✅ GOOD: clear and explicit
function isValidUser(user: User | null): boolean {
  if (!user?.email) return false;
  return Number(user.age) >= 18;
}
```

## Data-Driven Over Hardcoded Branching

```typescript
// ✅ GOOD: configurable and maintainable
const RolePermissions = {
  admin: ["read", "write", "drop", "manage"],
  editor: ["read", "write"],
  viewer: ["read"],
} as const;

function hasPermission(role: string, permission: string): boolean {
  return RolePermissions[role]?.includes(permission) ?? false;
}

// ❌ BAD: hard to maintain chained conditions
function hasPermission(role: string, permission: string): boolean {
  if (role === "admin") return true;
  if (role === "editor" && (permission === "read" || permission === "write")) return true;
  // ... more hardcoded conditions
}
```

## Structure for Easy Modification

```typescript
// ✅ GOOD: cache expensive computations when profiling warrants it
const fibonacci = (() => {
  const cache = new Map<number, number>();
  return function fib(n: number): number {
    if (n <= 1) return n;
    if (cache.has(n)) return cache.get(n)!;

    const result = fib(n - 1) + fib(n - 2);
    cache.set(n, result);
    return result;
  };
})();

// use appropriate data structures
const userIndex = new Map<string, User>(); // O(1) lookup
```

## Edge Cases

- Before adding behavior to unclear code, identify a concrete clearer alternative and prove it preserves supported behavior; resemblance to an example alone is insufficient.
- Nested ternaries, double-negation coercion, and bitwise tricks require the same contextual clarity judgment as bulky branching.

## Related

GEN-CONS-01, GEN-CONS-02, GEN-CONS-04, GEN-DESN-01
