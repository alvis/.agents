# WTST-STAG-01: Draft Proves Direction With a Walkthrough

## Intent

`coding:directions/staged-delivery.md` stages proof by spending: an unapproved `direction-review` draft earns direction approval before the cost of tests. For the web target its evidence floor (`coding:directions/staged-delivery.md#build-the-draft`) adds no new tests and requires a rendered walkthrough of every primary journey. The walkthrough is what the direction reviewer judges, so a journey missing from it is a journey whose direction was never shown.

## Fix

- Capture every primary journey from the `WTST-E2E-01` list end to end in the running draft, as screenshots per step or one recording per journey.
- Attach or link the walkthrough in the draft PR body, mapped to the journey list.
- Mark unfinished edges `TODO(draft): <finalization task>`; do not write specs, stories, or journey tests for the draft.

## Code Superpowers

- Compare the draft PR body's walkthrough entries with the journey list; flag any journey without one.

## Common Mistakes

1. Screenshots of individual pages rather than each journey's path.
2. Spending draft time on partial tests instead of the walkthrough.

## Related

`WTST-STAG-02`, `WTST-E2E-01`, `TST-COVR-01`.
