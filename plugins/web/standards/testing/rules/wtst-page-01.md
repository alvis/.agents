# WTST-PAGE-01: Never Unit-Test a Page or Route Entry

## Intent

A page is composition: it imports units and arranges them for one route. A unit test of a page can only restate its markup or re-test the units it composes, so it adds cost without a behavioral oracle. The end-to-end journey that renders the route is the page's test (`WTST-E2E-01`), and the units it composes carry their own tests (`WTST-UNIT-01`).

A UI route entry is any file the framework loads to render a route's UI: Next.js App Router `page.tsx`, `layout.tsx`, `template.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and `default.tsx`; Next.js Pages Router `pages/**`; React Router and Remix `app/routes/**`; SvelteKit `+page.svelte` and `+layout.svelte`; Astro `src/pages/**`; and the equivalent entry of any other configured router.

## Fix

- Delete the page-level `*.spec.ts(x)`, `*.spec.int.ts`, or `play()` story.
- Move each behavior it asserted into the test of the component, container, hook, or feature module that owns it; when the page itself owned the behavior, apply `WTST-PAGE-02` first.
- Confirm the journey that renders the route exists under `WTST-E2E-01`.
- Mark the logic-free route file `/* v8 ignore file */` per `coding:standards/testing/rules/tst-covr-01.md` instead of chasing its coverage.

## Code Superpowers

- Resolve the import graph of every `*.spec.ts(x)`, `*.spec.int.ts`, and `*.stories.tsx`; flag any that imports a file matching the project's route-entry convention.
- Flag tests whose subject name or `describe` title is a page component, such as `rc:DashboardPage`.

## Common Mistakes

1. Rendering `page.tsx` in jsdom "just to check it mounts."
2. A Storybook page story with `play()` that walks a whole route.
3. Re-asserting a container's states through the page that wraps it.

## Edge Cases

- A story without `play()` that only documents a full-page layout is not a test; it is allowed.
- Non-UI route handlers, such as Next.js `route.ts`, API endpoints, and server actions, are server code outside this rule; they are tested under `coding:standards/testing`.
- A shared layout shell component imported by `layout.tsx` is a component, tested at the unit level; only the route entry itself is excluded.

## Related

`WTST-PAGE-02`, `WTST-E2E-01`, `TST-COVR-01`; when the React plugin is enabled, `RPS-ROUTE-02`.
