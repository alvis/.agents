# QA marker identity

A marker locates prior per-command evidence for the [QA loop](../directions/qa-loop.md); it does not certify the current commit or skip its gate. [Deterministic evidence reuse](../../../directions/validation.md#reuse-deterministic-check-evidence) owns eligibility and invalidation.

## Lookup key

The lock-excluded stable patch ID is a candidate lookup key, not a tree or dependency identity. Equal patches can run against different parents, configuration, dependencies, or toolchains. Excluding a lockfile never exempts its changes from invalidating affected checks.

```bash
# substitute the project's lockfile for pnpm-lock.yaml
git diff-tree -p <sha> -- . ':(exclude)pnpm-lock.yaml' | git patch-id --stable
jj diff -r <rev> --git -- '~pnpm-lock.yaml' | git patch-id --stable
```

## Stored evidence

Each marker identifies its lookup key and the retrievable per-command evidence that supported the original green result. Each leg needs the canonical contract's exact cwd/argv/shell, original revision, selected input and dependency/configuration/lockfile identities, toolchain/environment assumptions, and passing result. A marker without that evidence proves nothing reusable. Carried-forward evidence retains its original execution identity; it is not relabeled as a new run.

Git stores the pointer in `git notes --ref=qa`; jj stores it in `.jj/changes/<change-id>.md`. Git notes mutations and rewriting configuration remain owned by `coding:commit`. Rewriting a note or retaining a jj change ID carries the pointer only, never renews evidence. The pointed-to record must remain available across disposable-worktree cleanup.

## Eligibility and renewal

The QA worker compares each candidate receipt with the current check under the canonical reuse contract. Missing, failed, changed, or unverifiable evidence requires execution of that leg. A valid pass for one leg does not waive another, required install/lock checks, message checks, or current publication gates.

A marker is written or replaced only after every required install, lint, test/coverage, and build leg is accounted for, required folds are complete, the message conforms, and no `pending_decision` remains. The marker records which passes executed and which reused original evidence.
