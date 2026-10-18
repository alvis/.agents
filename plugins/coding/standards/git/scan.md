# Pull-Request Changes: Violation Scan

Any violation is an issue that requires a fix. Use `write.md` for compliant outcomes and load the matching guide from `rules/`. Protocol: `essential:directions/standards.md`.

## Mechanical Scans

- `GIT-PR-SIZE-01`…`GIT-PR-SIZE-04` — Classify each exact base/head surface and its declared change inventory with [classify-pr-size.ts](../../skills/pr/scripts/classify-pr-size.ts) with Bun; never estimate authored lines or reproduce the zone arithmetic.
- `GIT-PR-02` — Validate a rendered PR message with [scan-pr-message.ts](../../skills/pr/scripts/scan-pr-message.ts) with Bun, passing its selected template, exact head/base OIDs, zone, archetype, and generated paths. A nonzero result is a standard violation, not an authoring hint.

## Semantic Scans

Syntax alone cannot establish these findings.

- `GIT-PR-SIZE-01` — As the independent reviewer, recount logical change units and the risk class against the diff under [the rule](rules/GIT-PR-SIZE-01.md). A higher recount is a violation and raises the zone through a classifier rerun with the recount; a recount never lowers the declared zone. A missing inventory is a violation.
- `GIT-PR-SIZE-04` — On a ready black-zone PR, inspect the managed Verification block for a scope-and-risk task bound to the current head/base OIDs; either check state is valid after publication. Drafts must have no reviewer tasks, except a yellow, red, or black `direction-review` draft's single direction approval task under [staged delivery](../../directions/staged-delivery.md#approve-the-direction).
- `GIT-PR-TYPE-02`…`GIT-PR-TYPE-05` — Inspect the implementation diff for public shape or feature prerequisite scaffolding stranded without its first implementation, migrations coupled to logic, mechanical changes hiding behavior, and files without a durable purpose or prohibited generated artifacts retained in the head. Deletions of prohibited artifacts are compliant. A declaration that is itself a complete type-level implementation and a standalone initialization whose requested result is the runnable or buildable baseline are complete rather than stranded.
- `GIT-PR-STACK-04` — First verify implemented feature-flag support in the target project. Then inspect changed flags and project-required rollout controls against [the rule](rules/GIT-PR-STACK-04.md); never require new flag infrastructure.

Do not report commit messages, branch names, PR titles, draft state, labels, stack position, history mutation, or merge order as standard violations. They are directions in [coding:commit](../../skills/commit/SKILL.md) and the [PR router](../../skills/pr/SKILL.md), and are process chores when unmet.

## Quick Scan

- DO NOT publish a PR message without Goal and behavioral Requirements or with invalid emoji/optional headings [`GIT-PR-02`]
- DO NOT omit the change inventory, under-declare units or risk class, count excluded paths or hunks as authored lines, or lower a declared zone on recount [`GIT-PR-SIZE-01`](rules/GIT-PR-SIZE-01.md)
- DO NOT omit required Risk or Test plan evidence outside green [`GIT-PR-SIZE-02`]
- DO NOT omit a specific Why this size rationale in red: indivisibility when units or the line bump set the zone, or the isolated risk trigger when only the R3 floor does [`GIT-PR-SIZE-03`](rules/GIT-PR-SIZE-03.md)
- DO NOT publish a black draft without its required message evidence or omit its ready-state exact-revision verification task [`GIT-PR-SIZE-04`]
- DO NOT publish public shape or feature prerequisite scaffolding without the first implementation that fulfills or consumes it [`GIT-PR-TYPE-02`]
- DO NOT mix migrations with logic or omit migration rollback evidence [`GIT-PR-TYPE-03`]
- DO NOT mix mechanical refactors with behavior changes [`GIT-PR-TYPE-04`]
- DO NOT retain temporary files or generated artifacts except package lockfiles [`GIT-PR-TYPE-05`]
- DO NOT omit a changed flag's runtime consumer or PR evidence in a project with implemented flag support [`GIT-PR-STACK-04`]

## Rule Matrix

| Rule ID | Violation | Bad Example |
|---|---|---|
| `GIT-PR-02` | Rendered message fails template scan | Missing behavioral Requirements |
| `GIT-PR-SIZE-01` | Missing or under-declared inventory, wrong authored lines, or lowered zone | 14 units declared where the recount finds 22; token storage declared R1; a pure rename counted as authored lines |
| `GIT-PR-SIZE-02` | Missing non-green evidence | Yellow PR without Risk |
| `GIT-PR-SIZE-03` | Missing red rationale | Generic or absent Why this size |
| `GIT-PR-SIZE-04` | Missing black evidence or ready verification task | Ready black PR without a verification task |
| `GIT-PR-TYPE-02` | Public shape stranded from first implementation | `ArchiveOrderInput` now; `archiveOrder()` later |
| `GIT-PR-TYPE-03` | Migration mixed with logic or missing rollback | Schema and business rule together |
| `GIT-PR-TYPE-04` | Mechanical and behavioral changes mixed | Rename plus new method |
| `GIT-PR-TYPE-05` | Temporary or prohibited generated artifacts | Generated client retained in the head |
| `GIT-PR-STACK-04` | Changed flag lacks a consumer or evidence | Rollout flag documented but never evaluated |
