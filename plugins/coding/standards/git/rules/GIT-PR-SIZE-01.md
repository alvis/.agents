# GIT-PR-SIZE-01: Zone Inputs and Green Zone

## Severity

warning

## Intent

A PR's zone follows what the change means and what it risks, not its line or file count. It is computed in three steps:

1. **Unit band** from the declared logical change units: green ≤ 15, yellow 16–30, red 31–60, black > 60. Each band doubles the previous one, so one zone step always means twice the review surface. A logical change unit is defined in `essential:references/working-attitude.md#logical-change-units`.
2. **Tier** = the higher of the unit band and the risk floor. The risk class is the change's semantic tier in the [coding workflow](../../../directions/WORKFLOW.md#select-topology), written R0–R3. R2 (public API or consequential multi-file change) floors the tier at yellow; R3 (architecture, security, migration, persistent data, release topology, or cross-domain change) floors it at red. A floor keeps a small risky change from reaching AI-only direction approval under [staged delivery](../../../directions/staged-delivery.md) and raises the PR's review evidence; R0 and R1 add no floor.
3. **Zone** = the tier, raised by exactly one step when authored lines exceed 2,500, because past that a reviewer can no longer read every authored line of even a few units in one pass. Black stays black. File count plays no part.

Authored lines exclude the moved content of renames and moves at or above 90% similarity (their review is the path change, not the content), generated files, package lockfiles, vendored code, snapshots, formatting-only hunks, and test files. Tests still belong to the unit they cover.

A green-zone PR has a green tier and at most 2,500 authored lines: at most 15 units at risk class R0 or R1. A 10,000-line rename stays green. Green is the default-mergeable unit of work.

The numbers above are a human-readable projection of `../../../skills/pr/assets/size-thresholds.json`, the sole numeric zone authority.

## Fix

Declare a change inventory in the PR body, listing each logical change unit and the PR's risk class, through the canonical PR template. Run `bun run ../../../skills/pr/scripts/classify-pr-size.ts` against the exact base/head pair: it computes authored lines from the committed diff and applies the asset's bands, floors, and line bump to the declared inventory. Do not estimate authored lines or reproduce the zone arithmetic in the PR body.

The independent reviewer recounts the units and risk class against the diff. A higher recount raises the zone, and the classifier is rerun with the recount; a recount never lowers the declared zone.

### Why this matters

- Reviewer working memory is bound by distinct purposes and their risk, not by lines a rename or generator produced.
- A risk floor sends risky work to stronger review regardless of size; a one-step line bump keeps very long, few-unit diffs from passing as small.
- A one-way recount removes any benefit from under-declaring units.
- Green PR body requirements are owned by the canonical PR template (`GIT-PR-02`).

## Edge Cases

- A missing inventory leaves the zone undetermined; that is a violation, not green.
- Under-declared units or risk class are a violation even when the reviewer's recount has already raised the zone; correct the inventory.
- A move below 90% similarity counts its authored lines; one at or above contributes only its in-place edits. Beyond the classifier's rename-candidate limit, git skips inexact rename detection and the classifier reports the skip, so a reviewer splits a mass move into its own PR, which takes its tier without the line bump.
- Package lockfiles such as `pnpm-lock.yaml` and paths marked `linguist-generated=true` contribute no authored lines. Sizing does not authorize shipping them: `GIT-PR-TYPE-05` permits only package lockfiles to remain as generated output.
- Test files, including `*.stories.*` files whose stories are the component tests, contribute no authored lines; do not split tests away from the code they cover.
- A generated file not covered by the classifier's deterministic lockfile or Git-attribute contract remains authored for sizing.
- Uncommitted `.git/info/attributes`, global/system attributes, and external diff configuration never classify a path or change its line count; only the committed base/head inputs do.

## Related

GIT-PR-02, GIT-PR-SIZE-02, GIT-PR-SIZE-03, GIT-PR-SIZE-04, GIT-PR-TYPE-05
