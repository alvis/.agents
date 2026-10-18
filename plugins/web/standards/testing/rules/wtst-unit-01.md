# WTST-UNIT-01: Components and Logic Are the Unit-Test Level

## Intent

Components, containers, hooks, and feature modules own the site's behavior, so they carry its unit tests. A journey test proves the pieces work together for a user; it cannot isolate a component's empty, error, or permission state, and its runs do not count toward unit coverage. Each unit's behavior is therefore tested at its own level, and a journey never substitutes.

## Fix

- Add the unit-level test for each behavior that is asserted only in a journey or only through a rendered page.
- Cover every reachable state from the `DES-STAT-01` inventory at the unit that renders it.
- Keep the journey assertion if it proves the user path; it is additive, not a replacement.

## Code Superpowers

- For each changed component, container, hook, and feature module, check for a sibling story with `play()` or a `*.spec.ts(x)`; flag modules with branches and neither.
- Flag journey assertions on a unit's internal states, such as a specific error message variant, that no unit test asserts.

## Common Mistakes

1. Treating a passing e2e run as proof that a component's error branch works.
2. Testing a container only through the page that composes it.

## Edge Cases

- A presentational component with no branch and no interaction still needs the coverage `TST-COVR-01` requires, in the form `WTST-UNIT-02` selects.

## Related

`WTST-UNIT-02`, `WTST-PAGE-01`, `TST-COVR-01`, `DES-STAT-01`.
