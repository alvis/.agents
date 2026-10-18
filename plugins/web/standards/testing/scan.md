# Web Testing: Violation Scan

Protocol: `essential:directions/standards.md`.

Any single violation blocks submission by default.

## Before scanning

Establish these inputs first; without them the e2e and staged rules cannot be decided, so report the missing input as `blocked` instead of passing the scan:

- **Delivery stage**: whether the change is an unapproved `direction-review` draft under `coding:directions/staged-delivery.md`. Only that draft takes the `WTST-STAG-01` floor; every other stage, including each layer peeled after approval, takes the full scan.
- **Primary journey list**: the site's primary journeys as named by its specification, design brief, or the work's charter, or else the list the PR body declares, as defined in [`WTST-E2E-01`](rules/wtst-e2e-01.md).
- **Route-entry convention**: the files the project's framework treats as UI route entries, per [`WTST-PAGE-01`](rules/wtst-page-01.md).
- **E2e runner**: the project's configured end-to-end runner and how it starts the site; Playwright is the default when none is configured.

Test mechanics, suffixes, mocking, and the coverage bar stay with `coding:standards/testing/scan.md`; this scan decides only which level tests which artifact.

## Quick Scan

- DO NOT unit-test, integration-test, or `play()`-test a page or UI route entry: no `*.spec.ts(x)`, `*.spec.int.ts`, or story with `play()` may import or render one [`WTST-PAGE-01`](rules/wtst-page-01.md)
- DO NOT leave a branch, data load, state, or domain logic in a page or UI route entry; move it into a covered component, container, hook, or feature module so the route stays composition [`WTST-PAGE-02`](rules/wtst-page-02.md)
- DO NOT leave a component, container, hook, or feature module's behavior unit-tested only through an e2e journey or a rendered page [`WTST-UNIT-01`](rules/wtst-unit-01.md)
- DO NOT test a subject in the wrong form: non-visual logic only through a story or journey, or a visual component in a form its selected framework standard forbids [`WTST-UNIT-02`](rules/wtst-unit-02.md)
- DO NOT mark a PR ready while a primary journey it delivers or changes lacks a `*.spec.e2e.ts` journey test [`WTST-E2E-01`](rules/wtst-e2e-01.md)
- DO NOT drive a journey test against mocked pages, mounted components, stubbed site modules, or anything other than the real rendered site [`WTST-E2E-02`](rules/wtst-e2e-02.md)
- DO NOT submit an unapproved `direction-review` web draft without a rendered walkthrough, as screenshots or a recording, of every primary journey [`WTST-STAG-01`](rules/wtst-stag-01.md)
- DO NOT mark a layer peeled from an approved draft, or the finalized top layer, ready with the draft walkthrough standing in for journey e2e tests or unit-level tests [`WTST-STAG-02`](rules/wtst-stag-02.md)

## Rule Matrix

| Rule ID | Violation | Bad Examples |
|---|---|---|
| `WTST-PAGE-01` | Page or UI route entry under unit, integration, or story test | `app/dashboard/page.spec.tsx` rendering `<DashboardPage />`; `Dashboard.stories.tsx` with `play()` importing `app/dashboard/page` |
| `WTST-PAGE-02` | Logic left in a page or UI route entry | `page.tsx` calls `await fetchInvoices()`; `layout.tsx` branches on `session.role` |
| `WTST-UNIT-01` | Unit behavior proven only end to end | `InvoiceTable` error state asserted only in `billing.spec.e2e.ts`; `useCart` branches with no `hk:` spec |
| `WTST-UNIT-02` | Subject tested in the wrong form | `formatPrice` covered only by a story; React `Button.spec.tsx` when the React standards are selected |
| `WTST-E2E-01` | Primary journey without a journey test | Checkout journey added with no `checkout.spec.e2e.ts`; journey list missing from the PR body and every source |
| `WTST-E2E-02` | Journey test not driving the real site | `page.route('**/dashboard', ...)` fulfilling the site's own page; `mount(<CheckoutPage />)` in a `*.spec.e2e.ts` |
| `WTST-STAG-01` | Draft without a complete journey walkthrough | `direction-review` PR body with screenshots of two of three primary journeys |
| `WTST-STAG-02` | Walkthrough carried past approval as test evidence | Peeled layer marked ready citing the draft recording instead of `*.spec.e2e.ts` results |
