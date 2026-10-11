---
name: finalize-commits
description: "Run isolated per-commit QA across every unpushed commit, report ordering or message issues, and coordinate approved corrections. Use before publishing a stack; coding:commit owns history mutations and coding:pr create owns publication."
requirements:
  model: capable
  effort: deliberate
argument-hint: "[--auto-push]"
---

# Finalize Commits

Verify that every unpushed commit is independently shippable. This skill owns isolated per-commit QA and the finalization report. `coding:commit` is the sole owner of history mutations.

## Boundaries

- Enumerate the unpushed stack oldest first without changing it.
- Classify each commit through the [documentation-only exemption](../../directions/validation.md#classify-documentation-only-changes) before creating a QA worktree. For other commits, cover applicable install, lint, test or coverage, and build gate in a fresh isolated worktree; only deterministic legs with valid [unchanged evidence](../../directions/validation.md#reuse-deterministic-check-evidence) may be reused.
- Diagnose failures and propose the smallest correction. Code corrections route to `coding:fix` before the commit is tested again.
- Route every fold, squash, amend, reword, reorder, abandon, bookmark, or branch move through `coding:commit`, and remote restack/publication through `coding:pr create`. Never issue a direct `git` or `jj` history-mutating command from this skill or its QA workers.
- Stop for user approval when a correction changes commit meaning or order.
- Publish only when `--auto-push` was explicitly supplied and all commits are green; delegate publication to `coding:pr create`.

## Workflow

1. Detect jj or git and record the current working state and upstream without mutation. Load [dependency-scan.md](directions/dependency-scan.md) to enumerate unpushed commits oldest first and determine dependency order.
2. Load [orchestration.md](directions/orchestration.md) for the coordination and approval contract. Report any recommended reorder or fold before QA.
3. Classify each commit's parent-to-commit diff first. Documentation-only commits receive source inspection, semantic self-review, and message checks in the current checkout; record every local QA leg as not applicable without a worktree, install, marker, or replay. For other commits, load [qa-loop.md](directions/qa-loop.md), create a disposable worktree at that revision, and cover applicable QA gates with current executions or eligible per-command evidence. Never split a required gate to hide failure.
4. If QA changes source or a generated lockfile, validate the correction in the isolated worktree, then invoke `coding:commit` to apply it to the owning commit.
5. If a subject is non-conforming, propose the truthful replacement and invoke `coding:commit` for the approved reword.
6. Load [squash-fixups.md](directions/squash-fixups.md) only when a fixup/fold is approved. Reassess the affected commit and its descendants against their new inputs; rerun failed, missing, or invalidated legs, carrying forward only eligible passes with their original evidence.
7. Run the verification below; when a check fails, route the correction (steps 4-6) and reassess affected evidence. Repeat until every commit is green or a concrete blocker or pending decision remains, then report it instead of looping. If requested, invoke `coding:pr create` only after every commit passes; current publication gates remain mandatory.

## Verification

- Documentation-only commits have revision-bound classification and semantic review evidence. Other unpushed commits have complete applicable install, lint, test/coverage, and build evidence: required install/lock checks execute in its isolated worktree; each other leg either passes now or qualifies for deterministic reuse.
- The final stack is linear and conflict-free, and every commit subject conforms.
- No history-mutating command was issued outside `coding:commit`.

## QA markers

Load [markers.md](references/markers.md) when reading or writing QA markers. A patch ID locates candidate evidence; it never authorizes reuse by itself. Applicable install/lock and publication checks are not skipped; documentation-only commits follow their classification above. Write or replace a marker only after complete per-leg evidence, message checks, and delegated folds are green with no pending decision.

## Completion

Report commit order, dependency findings, corrections routed through `coding:commit`, remaining decisions, final stack state, and push status. Preserve these fields for every commit, including false/empty values: `revision`, `status`, `skipped_by_marker`, `qa` (install/lint/test/coverage/build commands, exits, and executed/reused disposition with original evidence), `lock_folded`, `gate_bypassed_wrappers`, `message_action`, `marked`, `pending_decision`, and `newSha`. `skipped_by_marker` is always false: markers never skip a commit's gate.
