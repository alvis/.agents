# GIT-PR-SIZE-03: Red Zone PR Size

## Severity

warning

## Intent

A red-zone PR reaches red through any zone input under `GIT-PR-SIZE-01`: 31–60 declared units, the R3 risk floor (architecture, security, migration, persistent data, release topology, or cross-domain change), or a yellow tier bumped by more than 2,500 authored lines. Red PRs require a concise, specific Why this size explanation; the canonical PR template owns where and how that evidence is rendered.

- When units or the line bump set the zone, explain why the review surface is indivisible: an atomic migration, a sweeping cleanup, or one public contract plus the first implementation that `GIT-PR-TYPE-02` requires to remain atomic.
- When only the R3 floor sets the zone, name the risk trigger and confirm the risky surface is isolated from unrelated work.

The numbers above are a human-readable projection of `../../../skills/pr/assets/size-thresholds.json`, the sole numeric zone authority.

## Fix

Author the PR body through the canonical template with its change inventory and a concrete Why this size rationale. Keep line counts, zone arithmetic, and review scheduling internal.

### Why this matters

- Without justification, a unit-driven red PR signals an unsplit feature, not a cohesive change.
- A floor-driven red PR is small on purpose; its rationale shows the risk is contained, so stronger review is spent on the risky surface alone.
- Renames, moves, and generated files no longer push a PR into red, so a red PR always carries real authored or risky content.

## Edge Cases

- Red PRs that interleave behaviour changes with mechanical edits violate `GIT-PR-TYPE-04`; split before submitting.
- A red PR whose justification is only "feature too large to split" is a yellow-PR-shaped feature in disguise; re-plan independently shippable behavior through [stacked-prs.md](../../../skills/pr/directions/stacked-prs.md). Do not split public contract from its first implementation; when that atomic surface itself crosses red, explain the concrete `GIT-PR-TYPE-02` coupling and supply the stronger review evidence.
- An R3 change bundled with unrelated R0 or R1 work drags that work into red review; split the unrelated work out.
- A `direction-review` draft replaces indivisibility evidence with its planned peel-off layers under [staged delivery](../../../directions/staged-delivery.md#build-the-draft).
- Repository configuration cannot move the asset-defined band.

## Related

GIT-PR-SIZE-02, GIT-PR-SIZE-04, GIT-PR-TYPE-02, GIT-PR-TYPE-03, GIT-PR-TYPE-04, GIT-PR-TYPE-05
