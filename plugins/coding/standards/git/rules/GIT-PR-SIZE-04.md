# GIT-PR-SIZE-04: Black Zone PR Size

## Severity

warning

## Intent

A black-zone PR has more than 60 declared units, or a red tier bumped by more than 2,500 authored lines under `GIT-PR-SIZE-01`. Risk floors stop at red, so risk alone never makes a PR black, and renames, generated output, and tests cannot reach it through authored lines; black is rare. Repository configuration cannot change these thresholds. A genuinely self-contained unit may be published as a draft only when its canonical body gives specific Risk, Test plan, and Why this size evidence. After AI review and hosted CI pass, the ready PR description receives an unchecked exact-revision human verification task.

The numbers above project the highest bounds in `../../../skills/pr/assets/size-thresholds.json`, the sole numeric zone authority.

## Fix

Explain the concrete coupling that makes this unit indivisible in Why this size, and name the risks and tests. Keep the draft free of reviewer tasks; a `direction-review` draft carries only its direction approval task under [staged delivery](../../../directions/staged-delivery.md). The ready transition runs `../../../skills/pr/scripts/generate-reviewer-tasks.ts` to add an unchecked black-zone verification task for its exact head and base. Human task completion is visible in the PR description; no comment or programmatic approval check authorizes AI review.

### Why this matters

- A large review surface can hide defects in the long tail of the diff; specific rationale and test evidence help a human verify it.
- An exact-revision task keeps the requested human verification visible when the PR changes.

## Edge Cases

- An R3 change with more than 2,500 authored lines is black: the floor sets red and the line bump adds one step.
- A reviewer recount that raises a PR to black makes every black requirement apply before approval.
- A changed head or base invalidates the task and requires a new AI review, hosted CI pass, and task generation.

## Related

GIT-PR-SIZE-02, GIT-PR-SIZE-03, GIT-PR-TYPE-02, GIT-PR-TYPE-03, GIT-PR-TYPE-04, GIT-PR-TYPE-05
