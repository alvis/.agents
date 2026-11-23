# GEN-DESN-05: Reuse and Extend Before Adding

## Intent

Every new helper or package is code each reader must learn and each upgrade must carry. Before writing one, read the package manifest, its declared engines and compilation target (e.g. `engines`, `tsconfig` `target`/`lib`, browserslist, `requires-python`, `rust-version`), and the resolved dependency tree, then take the first option in this order that does the job:

1. **Native runtime API** that every declared engine and target supports — e.g. `Temporal` over `moment` or `dayjs`, `structuredClone` over `lodash.clonedeep` for plain data.
2. **Existing helper** whose domain intent matches (`GEN-DESN-02`) — extend it when it nearly fits; a helper with different intent does not count.
3. **A library already in the dependency tree, transitive included** — declare it in the importing package's own manifest at its latest release; never import an undeclared dependency. When that leaves other packages in the repository on an older major, upgrade them in a separate PR. A deprecated library (registry deprecation notice) or an unmaintained one (archived or declared abandoned upstream) does not count.
4. **When the library in use falls short**, propose to the user a full swap that migrates every caller to one replacement; never add a second library for the same job (e.g. `picomatch` beside `globby`).
5. **Only then a new package**, the vendor's official SDK first.

## Fix

```typescript
// ❌ BAD: new date library when every declared target ships Temporal
import dayjs from "dayjs";
const due = dayjs("2026-11-23").add(7, "day");

// ✅ GOOD: native runtime API
const due = Temporal.PlainDate.from("2026-11-23").add({ days: 7 });
```

```typescript
// ❌ BAD: near-duplicate beside a helper that nearly fits
function formatPrice(amount: number): string { /* ... */ }
function formatPriceInCurrency(amount: number, currency: string): string { /* ... */ }

// ✅ GOOD: extend the existing helper
function formatPrice(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}
```

```typescript
// ❌ BAD: resolves only because another dependency pulls it in; package.json never declares "debug"
import createDebug from "debug";
```

```shell
# ✅ GOOD: declare it in the importing package's own manifest at its latest release before importing
npm install debug@latest --workspace <importing-package>
```

```typescript
// ❌ BAD: a second library for the job globby already does
import { globby } from "globby";
import picomatch from "picomatch";

// ✅ GOOD: stay within the library in use, or propose one swap that migrates every caller
```

## Edge Cases

- Native first holds even beside a library already in use for the same job: write the new code against the native API, then propose to the user migrating the existing callers as a separate follow-up — its own task or thread, or a GitHub issue through `coding:issue` — never inside the current change. That proposal is the agreed migration `GEN-CONS-01` requires, and this order refines `essential:references/working-attitude.md#choose-the-first-sufficient-option` for code.
- Native first displaces libraries, not domain helpers: when an existing helper of matching intent already covers the need, use or extend it and build on the native API inside it, as `formatPrice` wraps `Intl.NumberFormat`.
- Raising a declared engine or target floor to reach a native API is a user decision, not a step in this order.
- When no native API does the job and the user has not approved a swap, keep working within the library in use; a refused swap never licenses a second library.
- When no native API does the job and existing code already uses two libraries for it, propose the consolidating swap; until it is approved, add the caller to the library the nearest code uses (`GEN-CONS-01`).

## Related

GEN-DESN-02, GEN-DESN-03, GEN-CONS-01
