# RPS-ROUTE-02: `page.tsx` Is a Composition Layer — No Domain Logic

## Intent

`src/app/<route>/page.tsx` exists to compose feature containers and route-local components into a route. It does not fetch data directly, does not own domain state, and does not render styled JSX for domain shapes. Domain logic lives in `src/features/<domain>/`; styled JSX lives in `src/components/` or `src/features/<domain>/components/`; the route just wires them together. This keeps routes thin and refactor-safe — the domain can move underneath the route without changing the route file.

`page.tsx` is never unit-tested. The end-to-end journey that renders the route covers it, and as a logic-free route-composition file it carries `/* v8 ignore file */` and is excluded from coverage at every stage under `coding:standards/testing/rules/tst-covr-01.md`. Logic that would need a page test belongs in the feature container or component it moves to, which is tested there.

## Fix

- Move data fetching out of `page.tsx` into a feature container: `src/features/<domain>/containers/<Name>Container.tsx`.
- Move styled JSX that renders domain shapes out of `page.tsx` into the matching feature `components/` folder (presentational) or container (orchestration).
- Leave `page.tsx` with imports, a function declaration, and a JSX tree composing the moved pieces.
- Test the moved code at its new home, delete any `page.tsx` spec or `play()` story, and mark the composed page `/* v8 ignore file */`.

```typescript
// ❌ BAD: domain logic in page.tsx
// src/app/dashboard/page.tsx
export default async function DashboardPage() {
  const invoices = await fetchInvoices();
  return (
    <main>
      <h1>Dashboard</h1>
      <table>{invoices.map((i) => <tr key={i.id}>...</tr>)}</table>
    </main>
  );
}

// ✅ GOOD: composition only
// src/app/dashboard/page.tsx
/* v8 ignore file */
import { InvoiceListContainer } from '#features/billing/containers/InvoiceListContainer';
import { DashboardHeader } from './components/DashboardHeader';

export default function DashboardPage() {
  return (
    <main>
      <DashboardHeader title="Dashboard" />
      <InvoiceListContainer />
    </main>
  );
}
```

## Code Superpowers

- Parse every `src/app/**/page.tsx` and flag any that:
  - Imports from `*/api/*` directly (should go through a hook/container)
  - Declares state (`useState`, `useReducer`) for domain shapes
  - Renders JSX more than ~30 lines deep without composing a container or component
- Flag `await fetch(...)` or any data-loading call inside `page.tsx`.
- Flag any `*.spec.ts(x)`, `*.spec.int.ts`, or story with `play()` that imports a `page.tsx`.

## Common Mistakes

1. Inlining a Server Component fetch in `page.tsx` "because it's just one query."
2. Defining a styled domain card inside `page.tsx` instead of in a feature `components/` folder.
3. Wiring up form state in `page.tsx` instead of a container.
4. Writing a unit test or `play()` story for `page.tsx` instead of testing the container it composes.

## Edge Cases

- **Tiny routes with no domain**: a marketing/landing page with only static layout and `next/image` calls is fine inside `page.tsx`. The rule targets domain logic and domain rendering, not all rendering.
- **Server Components**: a Server Component `page.tsx` may still compose async feature containers; the container is a Server Component that does the fetch. The split is preserved — just at the RSC layer.
- **Metadata exports** (`export const metadata = ...`): allowed inline in `page.tsx`.

## Related

- `RPS-ROUTE-01` — route-local `components/` folder
- `RPS-FEAT-02` — container/presentational split inside features
- `RPS-LAYOUT-01` — overall decision order
- `standard:components` — component structure rules
- `TST-COVR-01` (`coding:standards/testing/rules/tst-covr-01.md`) — route-composition coverage exclusion
