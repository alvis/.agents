# WTST-PAGE-02: Pages Stay Logic-Free Composition

## Intent

Because a page is never unit-tested (`WTST-PAGE-01`), any logic left in it would be verified only end to end, where its branches are slow to reach and invisible to coverage. Every branch, data load, state, and domain decision therefore lives in a component, container, hook, or feature module that is unit-tested and covered, and the route entry only composes them. This is the condition under which `coding:standards/testing/rules/tst-covr-01.md` lets a route file carry `/* v8 ignore file */` at every stage.

## Fix

- Move data loading into a feature container or loader module, state and handlers into a container or hook, and domain rendering into a component.
- Unit-test the moved code at its new home under `WTST-UNIT-01` and `WTST-UNIT-02`.
- Leave the route entry with imports, the route component declaration, and a returned tree; then mark it `/* v8 ignore file */`.

## Code Superpowers

- In every file matching the route-entry convention, flag `if`, ternaries, `&&` rendering, `switch`, `await`, `fetch`, data-client calls, state hooks, effects, and event handlers with bodies.
- Flag `/* v8 ignore file */` on any route entry that still contains one of those.

## Common Mistakes

1. "Just one" fetch or redirect check left in `page.tsx`.
2. A role branch in `layout.tsx` instead of a guarded layout component.
3. Marking a route file ignored while it still branches.

## Edge Cases

- Static metadata exports and a static tree with no branch are composition.
- A framework that requires a loader, action, or `+page.ts` load function inside the route module conflicts with the route-composition definition in `TST-COVR-01`; delegate it to a covered feature function and record a `no_workaround` exception for the remaining call until that definition covers the framework.

## Related

`WTST-PAGE-01`, `WTST-UNIT-01`, `TST-COVR-01`; when the React plugin is enabled, `RPS-ROUTE-02`.
