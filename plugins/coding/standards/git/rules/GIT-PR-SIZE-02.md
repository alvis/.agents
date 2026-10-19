# GIT-PR-SIZE-02: Yellow Zone PR Size

## Severity

warning

## Intent

A yellow-zone PR reaches yellow through any zone input under `GIT-PR-SIZE-01`: 16–30 declared units, the R2 risk floor, or a green tier bumped by more than 2,500 authored lines.

The canonical PR template owns the additional Risk and Test plan evidence required for this zone. Human verification tasks are generated after AI review and hosted CI pass.

The numbers above are a human-readable projection of `../../../skills/pr/assets/size-thresholds.json`, the sole numeric zone authority.

## Fix

Author the PR body through the canonical template with its change inventory and supply the yellow-zone evidence from the change; do not publish line counts or zone arithmetic.

### Why this matters

- A yellow PR is large or consequential enough that "looks right" is not enough — the reviewer needs the author's mental model.
- Risk plus Test plan converts implicit confidence into explicit, reviewable claims.
- Yellow is a healthy zone: do not artificially shrink to green if the change is genuinely cohesive.

## Edge Cases

- An R2 change with few units is yellow through its risk floor; the Risk section names the public API or multi-file consequence that set the floor.
- A reviewer recount that raises a green PR to yellow makes Risk and Test plan required before approval.
- Yellow PRs that mix migration and logic must be split (`GIT-PR-TYPE-03`); an isolated atomic migration takes the R3 floor and is at least red.
- Repository configuration cannot move the asset-defined band.

## Related

GIT-PR-02, GIT-PR-SIZE-01, GIT-PR-SIZE-03, GIT-PR-TYPE-03, GIT-PR-STACK-04
