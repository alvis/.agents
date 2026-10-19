# WTST-STAG-02: Tests Are Finalization Obligations

## Intent

Direction approval ends the draft exemption. Every layer peeled from the approved draft, and the finalized top layer, is a normal PR: before it is ready it meets `WTST-E2E-01` for the journeys it delivers, `WTST-UNIT-01` and `WTST-UNIT-02` for its units, and the coverage bar of `coding:standards/testing/rules/tst-covr-01.md`. The walkthrough proved direction, not behavior, so it never counts as test evidence.

## Fix

- Add the journey tests and unit-level tests the layer's content requires before marking it ready.
- Replace any walkthrough citation in a layer's readiness evidence with the test results.

## Code Superpowers

- Flag a non-draft PR whose readiness evidence cites screenshots or a recording and no `*.spec.e2e.ts` result.
- Flag `TODO(draft):` markers in a layer marked ready.

## Common Mistakes

1. Carrying the draft recording into a peeled layer's PR body as its test evidence.
2. Deferring journey tests to a later layer that never covers them.

## Related

`WTST-STAG-01`, `WTST-E2E-01`, `WTST-UNIT-01`, `TST-COVR-01`.
