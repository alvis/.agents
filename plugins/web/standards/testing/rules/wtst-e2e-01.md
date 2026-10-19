# WTST-E2E-01: Every Primary Journey Has a Journey Test

## Intent

A primary journey is a path a user takes to complete a task the site exists for, such as signing in, finding a product, or checking out. Pages are never unit-tested (`WTST-PAGE-01`), so the journey test is the only proof that routes render and compose their units correctly for a user. Every primary journey a PR delivers or changes needs at least one `*.spec.e2e.ts` journey test before that PR is ready: one passing run is the smallest evidence that the whole path renders and completes, and further variants belong at the unit level under `WTST-UNIT-01`.

The journey list comes from the site's specification, design brief, or the work's charter. When none names the journeys, the PR body declares the list and the independent reviewer validates it; an undeclared list blocks readiness. An unapproved `direction-review` draft takes `WTST-STAG-01` instead.

## Fix

- Add one `*.spec.e2e.ts` per uncovered primary journey, named for the journey, run by the project's configured e2e runner or Playwright when none is configured.
- Declare the journey list in the PR body when no source names it, mapping each journey to its test file.

## Code Superpowers

- Map each listed journey to a `*.spec.e2e.ts` test; flag journeys with none.
- Flag a PR body for web work that neither cites a journey source nor declares a list.

## Common Mistakes

1. A smoke test that loads the home page standing in for every journey.
2. A journey list that names pages instead of user tasks.

## Edge Cases

- A journey that needs an external service still runs against it; missing credentials hard-fail at file load under `TST-CORE-11`.
- Playwright's default `testMatch` does not discover `*.spec.e2e.ts`; set `testMatch` to that suffix rather than renaming the file away from `TST-STRU-01`.

## Related

`WTST-E2E-02`, `WTST-PAGE-01`, `WTST-STAG-02`, `TST-STRU-01`.
