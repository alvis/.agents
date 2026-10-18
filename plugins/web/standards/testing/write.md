# Web Testing: Compliant Patterns

Protocol: `essential:directions/standards.md`.

## Key Principles

- A page is composition; the journey that renders it is its test, so it never gets a unit test.
- Logic you find in a page moves into a component, container, hook, or feature module, where it is unit-tested and covered.
- Components, containers, hooks, and feature logic are the unit-test level, each in the form its subject needs.
- The whole site is proven by end-to-end journeys against the real rendered site.
- An unapproved `direction-review` draft proves direction with a walkthrough; tests arrive at finalization.

## Core Rules Summary

### Pages and Route Entries (WTST-PAGE)

- **WTST-PAGE-01**: Never unit-test, integration-test, or `play()`-test a page or UI route entry; its e2e journey covers it.
- **WTST-PAGE-02**: Keep every page and UI route entry logic-free composition; move branches, data loads, state, and domain logic into a covered unit, then mark the route file per `TST-COVR-01`.

### Unit-Test Level (WTST-UNIT)

- **WTST-UNIT-01**: Unit-test each component, container, hook, and feature module at its own level; a journey never substitutes for it.
- **WTST-UNIT-02**: Use the form the subject needs: the selected framework's component-test form for visual components, ordinary `*.spec.ts` unit tests for non-visual logic.

### Whole-Site End to End (WTST-E2E)

- **WTST-E2E-01**: Give every primary journey a PR delivers or changes at least one `*.spec.e2e.ts` journey test before that PR is ready.
- **WTST-E2E-02**: Drive the real rendered site from a running build through the user's own entry points.

### Staged Delivery (WTST-STAG)

- **WTST-STAG-01**: An unapproved `direction-review` web draft carries a rendered walkthrough of every primary journey and no new tests.
- **WTST-STAG-02**: From direction approval onward, each layer meets `WTST-E2E-01` and the unit level before it is ready; the walkthrough is never test evidence.

## Patterns

### Where a test belongs

| Subject | Test level and form |
|---|---|
| Page, layout, or other UI route entry | None of its own; `/* v8 ignore file */` per `coding:standards/testing/rules/tst-covr-01.md`; covered by the journey that renders it |
| React component or container, React plugin enabled | Stories with `play()` under the React standards (`SB-PLAY-01`, `SB-COVERAGE-01`, `RC-NAMING-01`) |
| Visual component without a selected framework standard | A `*.spec.ts(x)` unit test under `coding:standards/testing`, or the component-test form a selected framework standard prescribes |
| Hook, reducer, formatter, or feature service | `*.spec.ts` unit test under `coding:standards/testing` |
| A primary journey across pages | `*.spec.e2e.ts` journey test against the running site |

### Thin route, covered unit

```typescript
// app/billing/page.tsx — composition only, never tested directly
/* v8 ignore file */
import { InvoiceListContainer } from '#features/billing/containers/InvoiceListContainer';

export default function BillingPage() {
  return <InvoiceListContainer />;
}
```

The fetch, empty state, and error state live in `InvoiceListContainer`, whose stories or specs cover them; `billing.spec.e2e.ts` proves the route renders them for a user.

### Journey test

```typescript
// e2e/billing.spec.e2e.ts
test('should let a signed-in user open and pay an invoice', async ({ page }) => {
  await page.goto('/billing');
  await page.getByRole('link', { name: 'Invoice 1042' }).click();
  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByRole('status')).toHaveText('Payment received');
});
```

The test enters where a user enters, moves by visible controls, and asserts what the user sees. It mocks nothing, under `TST-STRU-01`.

## Anti-Patterns

- Rendering a page in jsdom to reach a branch that belongs in a container.
- Leaving component error and empty states untested because the e2e suite happens to visit them.
- Fulfilling the site's own routes or modules inside a journey test.
- Adding partial specs to an unapproved draft instead of recording the walkthrough.

## Quick Decision Tree

1. Is the file a page or UI route entry? Give it no test of its own (`WTST-PAGE-01`); if it holds logic, move the logic out first (`WTST-PAGE-02`).
2. Is it a component, container, hook, or feature module? Unit-test it at its own level (`WTST-UNIT-01`) in the form its subject needs (`WTST-UNIT-02`).
3. Does the PR deliver or change a primary journey without a journey test? Add a `*.spec.e2e.ts` (`WTST-E2E-01`) that drives the real site (`WTST-E2E-02`).
4. Is this an unapproved `direction-review` draft? Record the walkthrough instead of tests (`WTST-STAG-01`); after approval, finalize every layer with tests (`WTST-STAG-02`).
