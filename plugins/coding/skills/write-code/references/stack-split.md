# Conditional Stack Split and Restack

Load this decision only after code review is closed, lint is complete, and the
final applicable focused/full test, type, coverage, and build gates are green.
Runtime suites and coverage apply only when eligible runtime sources exist;
focused compile-time tests apply only to allowed compiler-semantic promises
under `TST-CORE-10`. Do not load
or execute it for `--defer-publication`; the lifecycle parent owns that run's
final history QA and publication. The orchestrator never invokes history or
remote commands directly: local history shaping belongs to `coding:commit`,
isolated per-commit QA to `coding:finalize-commits`, and publication/restacking
to `coding:pr create`.

## 1. Compute change size

Prefer `jj diff --summary --stat` when the working copy is jj-colocated;
fall back to `git diff --shortstat HEAD`. Capture the changed-file count and
the LOC diff.

## 2. Detect an open stack

Scan for bookmarks matching `<branch-prefix>/NN-<scope>`, for example via
`jj bookmark list` or `git branch --list '*/[0-9][0-9]-*'`.

## 3. Apply triggers

Treat public types, interfaces, schemas, exports, generated declaration output,
and prerequisite scaffolding as part of the first feature behavior that
fulfills or consumes them. Never use a size trigger or stack to publish that
shape ahead of its implementation; split only independently shippable behavior,
migrations, or mechanical work.

Keep focused runtime tests and compiler-semantic tests permitted by
`TST-CORE-10` with that implementation. Exercise compiler behavior through
representative consumer usage; declaration/signature inventories do not receive
dedicated tests.

- **Large change** — more than 5 changed files, OR more than 300 LOC diff,
  OR multiple loosely-coupled domains (the bounds keep each PR independently
  reviewable). Dispatch plain `coding:commit` with the approved slice plan so
  it shapes only local history. Then run `coding:finalize-commits`; only after
  every commit is independently green may `coding:pr create` publish the ordered
  draft PRs. Do not use the `--create-pr` compatibility shortcut because it
  would cross the finalization gate. If no independently shippable split exists,
  keep the atomic feature together and satisfy its larger review-evidence zone.
- **Restack on semantic upstream change** — when an open stack is detected
  AND this change semantically modifies code that a lower (earlier-in-order)
  PR in the stack depends on: the signature, behavior, or contract of a symbol
  the lower PR establishes or relies on. Save any local correction through
  `coding:commit`, run `coding:finalize-commits`, then dispatch
  `coding:pr update` with the affected saved stack so it owns remote restacking
  and republication.
  Incidental file overlap alone (formatting, unrelated co-edits) does not
  trigger a restack — judge by lower-PR correctness dependence.
- **Otherwise** (small, single-domain change with no semantic upstream
  impact): skip the dispatch and proceed straight to reporting.

## 4. Interactive gate

When a dispatch is triggered, surface the rationale—the size metrics or the
named lower PRs at risk—and the proposed local-history, commit-QA, and
publication sequence to the user before delegating. Stop before publication
if any later correction invalidates review or final validation; repair and
repeat those gates first.
