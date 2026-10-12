# Per-Commit Loop with deterministic scripted execution

Referenced from SKILL.md Step 2. Defines how the atomic per-commit walk runs through deterministic scripted execution when that capability is available, and the inline fallback when it is not. Per-commit procedure: `qa-loop.md`. All history mutations — folds, rewords, order surgery, and the final head move — are applied by `coding:commit`; publication is applied by `coding:pr create`. This file only orchestrates.

## Shape

Strictly sequential walk, oldest-first, one commit at a time. Classify each selected commit under the [documentation-only exemption](../../../directions/validation.md#classify-documentation-only-changes) before dispatch. For mechanically applicable commits, one agent executes the FULL atomic seven-sub-step operation from `qa-loop.md` — replay, isolate, marker-check, gate, fold, reword, mark — inside a single dispatch; nothing is split across execution steps or batched across commits. **The coordinator governs** — it owns every `pending_decision` and resumes the run. Sequential (not fanout) because each commit depends on the previous commit's folded result and history rewrites must not race.

Documentation-only commits use the owning skill's inspection route instead of `qa-loop.md`: no QA replay, worktree, install, local mechanical command, or marker. Return `status: green` only after semantic and message checks, with each QA leg `not_applicable_documentation_only` and `marked: false`. If `cur` is still the original parent, return the original revision as `newSha`; if an earlier correction changed that parent, request the necessary history transplant from `coding:commit`, inspect its resulting diff, renew classification and semantic review, and return the resulting revision. A conflict or required meaning change returns `pending_decision`. This history operation retains VCS recovery safeguards and never starts local mechanical QA for a documentation-only result.

The walk chains the rebuilt head forward:

```
cur = stackBase                              # parent of the oldest target
for each target (oldest-first):
    route = classify(target)                # inspection or mechanical QA
    result = dispatch(route, cur, target)
    cur = result.newSha                      # the folded, marked commit
```

An abort at any position returns the last-good checkpoint (`refs/finalize/<run>/pos-N`; jj: the op log) and leaves the original ref untouched; the run is resumable from the checkpoint refs via `resumeFromRunId`.

## Two-gate pattern (order surgery is verified before QA is spent)

When the run includes order changes or hunk folds — Step 2's recommendation, applied by `coding:commit` after approval — they run as a separate surgery pass FIRST, before any per-commit QA:

- **Gate A — tip invariance, before any QA spend**: every order fix is an internal move, so the tip tree must be invariant. Verify `git diff <originalTip> <rebuiltTip> -- . ':(exclude)<lockfile>'` is EMPTY (jj: `jj diff --from <original> --to <rebuilt> --git -- '~<lockfile>'`). Non-empty means the surgery changed content — `coding:commit` rolls back; the walk does not start.
- **Gate B — after the walk, before the branch head moves**: the same tip-equivalence check against the fully rebuilt tip (only QA folds and rewords may differ), PLUS, when the rebuilt surface requires mechanical validation under the [documentation-only classification](../../../directions/validation.md#classify-documentation-only-changes), the lock fixed-point: run the project install at the rebuilt tip and verify `git status --porcelain -- <lockfile>` is empty — the tip's lockfile is already self-consistent. Only after Gate B passes does `coding:commit` advance the branch head (and `HEAD`/`@`) to the rebuilt stack.

## Mechanism A — deterministic scripted execution

Use this mechanism only when the external adapter's configured worker profile is observed to meet both independently selected minimums for every commit's full QA task. Its `intelligence` option cannot encode this selection. If the profile cannot be established, use Mechanism B through supported native dispatch or report the launch unavailable; never infer a pair from a legacy rank.

1. Build one step per target commit, each dispatching its classified inspection or atomic QA route for that `<rev/sha>`, receiving `cur` and returning `newSha`.
2. A step returning `status: green` chains `cur = newSha` and advances the walk.
3. A step returning `status: pending_decision` **stops** the execution and surfaces the `pending_decision` block to the coordinator.
4. The coordinator resolves it:
   - `test_fail` / `coverage_fail` → use the graphical or structured user-input tool (fix now via `coding:fix` / accept / abort); on fix, resume that commit's atomic assessment, rerunning failed, missing, or invalidated legs under [evidence reuse](../../../directions/validation.md#reuse-deterministic-check-evidence). Accepting a known failure records a blocker; it cannot make the commit green.
   - `semantic_conflict` → use the graphical or structured user-input tool to decide the resolution (nothing was auto-merged).
   - `meaning_reword` → use the graphical or structured user-input tool to confirm the type/scope change; on confirm, request the reword from `coding:commit`.
5. The coordinator resumes from the stopped step through the capability's run-resumption identifier; the checkpoint ref for the last green position supplies `cur`.
6. The run completes when every commit reports `green`; Gate B then clears the head to move.

## Mechanism B — inline fallback

Drive the identical loop inline, with identical atomic semantics:

```
cur = stackBase
for rev in targets (oldest-first):
    route = classify(rev)
    report = dispatch(task=route for rev onto cur)  # select and verify native model and effort before launch
    while report.status == 'pending_decision':
        decision = get_structured_user_input(report.pending_decision)
        apply(decision)            # coding:fix for code; confirmed rewords via coding:commit
        report = dispatch(task=route for rev onto cur)  # reassess classification and evidence; rerun affected applicable legs
    assert report.status == 'green'
    cur = report.newSha
```

Same governance, same stop/resume semantics — the coordinator blocks on each `pending_decision` and only advances when the current commit is green.

## Invariants (both mechanisms)

- One commit finalized fully before the next begins: documentation-only commits have current classification and semantic checks; other commits are green, folded, and marked. The walk never advances past a pending correction.
- No commit is marked while a `pending_decision` is outstanding.
- The branch head moves only after Gate B; mid-walk state lives entirely in the rebuild chain and the checkpoint refs, and a mid-walk abort leaves the original ref untouched.
- Every history rewrite routes through `coding:commit`, which guards it with its `backup.sh` + `verify.sh` pair; integrity failure rolls back and STOPs.
- Working-copy restore (`qa-loop.md` step 0 / final) is an unconditional exit obligation — every exit path, including aborts, ends with the WIP bracket removed; the original `@` (jj) is restored at the end of the walk.
