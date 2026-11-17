# Implementation mode bodies

Load only the selected mode. All code-writing children receive exact work/spec pointers and return `generated_files`.

## Child chains

- **COMMIT_PLAN**: per runnable leaf task ID read from `state.md`, `coding:write-code` → `coding:commit`. Pass the parent-owned review capsule; the child returns self-checks, focused validation, and risks. The named owner reviews the integrated delivery.
- **PI_ITERATE**: `coding:complete-code` → `coding:test` `for-maintenance` → `coding:fix` → self-checks and focused validation under the parent-owned review capsule → `coding:commit`. Return implementation evidence and outstanding risks to the named review owner. Unmarked missing work routes to `coding:write-code`.
- **DRAFT_THEN_ASK**: no coding; point to `specification:plan-code`. If the user requests a lightweight draft, route to `coding:draft-code` then hand over.
- **AUDIT_AND_COMPLETE**: baseline review → complete/write/fix gaps → final review → commit.
- **VERIFY_ONLY**: review only, no commit.
- **FLAG_MISMATCH**: report stage/flag mismatch and ask for resolution.
- **REFUSE**: report the matched stage rule; dispatch nothing.

These chains return to the single delivery owner established through `coding:directions/review-evidence.md`. After integration and documentation, that owner uses `specification:review-implementation` for alignment and Coding coverage in one session; nested parents forward the obligation. Specification freshness and completion gates remain required. Pass current evidence to publication rather than adding another source-analysis pass.

## Deviation policy block

Embed this policy in every coding dispatch:

```markdown
## Deviation policy

The work plan may be invalidated by repository/runtime evidence. Report a
material departure to the main agent; do not edit main-agent-owned indexes.

Material: missing/wrong dependency, integration or schema mismatch, standard
violation, architecture conflict, stale symbol, or changed acceptance behavior.
Trivial formatter/import ordering, inferred types, prose corrections, and
convention-only casing need no entry.

Return for each material departure: headline, full task ID, plan expectation,
evidence, chosen/required alternative, reason, impact, severity, disposition,
invalidated downstream task IDs, and recheck trigger. The main agent writes a
lowercase `.state/works/<work-id>/changes/<slug>.md` child and reconciles
`changes.md` and `state.md`.

Proceed only when reversible and low impact. For architecture, public API,
data, security/privacy, destructive migration, user semantics, or acceptance
changes, stop as `pending_decision` before dependent work.
```

No trailing deviations commit exists: `.state` is ignored work state.
