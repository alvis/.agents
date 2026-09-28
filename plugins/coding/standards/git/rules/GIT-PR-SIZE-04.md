# GIT-PR-SIZE-04: Black Zone PR Size

## Severity

warning

## Intent

A black-zone PR changes **> 60 files** OR **> 2000 authored net LOC**. Every changed path contributes to the file threshold; generated-file additions and deletions do not contribute to LOC under `GIT-PR-SIZE-01`. Repository configuration cannot change these thresholds. A genuinely self-contained unit may be published as a draft only when its canonical body gives specific Risk, Test plan, and Why this size evidence. After AI review and hosted CI pass, the ready PR description receives an unchecked exact-revision human verification task.

The limits above project the highest bounds in `../../../skills/pr/assets/size-thresholds.json`, the sole numeric threshold authority.

## Fix

Explain the concrete coupling that makes this unit indivisible in Why this size, and name the risks and tests. Keep the draft free of reviewer tasks. The ready transition runs `../../../skills/pr/scripts/generate-reviewer-tasks.ts` to add an unchecked black-zone verification task for its exact head and base. Human task completion is visible in the PR description; no comment or programmatic approval check authorizes AI review.

### Why this matters

- A large review surface can hide defects in the long tail of the diff; specific rationale and test evidence help a human verify it.
- An exact-revision task keeps the requested human verification visible when the PR changes.

## Edge Cases

- More than 60 generated paths remain black through the unchanged file threshold even when they contribute no authored LOC.
- A changed head or base invalidates the task and requires a new AI review, hosted CI pass, and task generation.

## Related

GIT-PR-SIZE-02, GIT-PR-SIZE-03, GIT-PR-TYPE-02, GIT-PR-TYPE-03, GIT-PR-TYPE-04, GIT-PR-TYPE-05
