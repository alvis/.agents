# Order Verification & Recommendation — detectors + remedies (jj + git)

Referenced from SKILL.md Step 1. Runs BEFORE any QA so an isolated per-commit gate is never doomed by an ordering defect — a symbol, dependency spec, or behavior that only a later commit supplies. Three detector classes, ALL mandatory on every run. The scan itself is read-only; the output is not a list of flags but a recommended order, presented for confirmation. Every approved move is then delegated to `coding:commit`, the sole owner of rebase, split, squash, reorder, rollback, and checkpoint operations.

## What an order defect is

Commit `A` (earlier in the oldest-first list) needs something that only commit `B` (strictly later) provides — so QA of `A` fails for an ordering reason, not a real defect. It takes three forms, one per detector:

1. **Symbol forward-reference**: `A` references an identifier whose definition `B` adds.
2. **Manifest/catalog forward-reference**: `A` consumes a dependency spec — a `catalog:` entry, a workspace protocol, a lockfile-relevant manifest line — that `B` defines. Real case: a `package.json` referencing `git-cliff@catalog:build` ten commits before the catalog entry existed; every one of those ten commits fails install in isolation.
3. **Behavioral order defect**: `A` predictably breaks the gate at its position while `B` holds the cure. Real cases: `only-allow` breaking under a pnpm version bump one commit before the commit that removes it; an eslint-rule-introducing commit placed before the tsconfig-flag commit that makes the code conform.

## Per-commit diff source (VCS-agnostic)

- **jj**: `jj diff -r <rev> --git`
- **git**: `git show <sha>` (or `git diff <sha>^..<sha>`)

Both emit unified `--git` diffs; the detector logic below is identical once you have the diff text.

## Detector 1 — symbols (regex heuristic)

For each commit oldest-first:

1. From the added (`+`) lines, extract **referenced** identifiers — import specifiers, call targets, type references, JSX component names. Ignore identifiers the same commit also **defines** (its added `function`/`const`/`class`/`type`/`export` names).
2. Build a running set of symbols defined by commits seen so far (this commit and all earlier ones).
3. For each referenced-but-not-yet-defined identifier, check whether a **strictly later** commit's added lines define it. If so, flag a forward dependency.

Suggested extraction regexes (tune per language; TypeScript/JS shown):

```
# referenced
import .*\bfrom ['"]([^'"]+)['"]
\b([A-Za-z_$][\w$]*)\s*\(            # call sites
:\s*([A-Z][\w$]*)                    # type annotations
<([A-Z][\w$]*)                       # JSX components

# defined (added lines)
\b(?:export\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)
```

Treat module-path imports (`from './foo'`) as a dependency only when the imported file is itself added by a later commit. Heuristic-first: this pass flags suspects; the isolated gate in SKILL.md Step 3 confirms precisely.

## Detector 2 — manifest/catalog cross-check

For each commit oldest-first, collect from its added lines every dependency spec it **consumes** (a `package.json` entry like `"git-cliff": "catalog:build"` or `"x": "workspace:*"`, any version range the lockfile must satisfy) and every spec it **defines** (catalog entries in `pnpm-workspace.yaml`, new workspace packages, registry pins). Every consumed spec must be defined at or before the consuming commit — by the running set of definitions seen so far, or by the pre-stack baseline. Flag every consumption-before-definition: each one is a guaranteed isolated-install failure, not a maybe.

## Detector 3 — behavioral order defects

Look for paired commits where the earlier one predictably breaks the gate and a later one carries the cure:

- a tool or hook that a version/engine bump breaks, with its removal or replacement sitting later in the stack — the removal belongs at or before the break (the `only-allow` case);
- a rule- or flag-introducing commit (lint rule, compiler option) placed before the commit that makes the code conform or enables the flag — the conformance belongs first (the eslint-rule-before-tsconfig-flag case);
- generally: predict each commit's gate outcome at its position from the diff alone; when the predicted failure's fix sits strictly later in the stack, flag the pair.

## Output — a recommended order, not a list of flags

For every defect record `consumer`, `artifact` (symbol | spec | behavior), `resolved_by` (the defining/curing commit), and `remedy`, then compose ALL remedies into one recommended order: a full permutation of the stack plus any hoist-hunk / fold-into moves. Return `status`, `summary`, and `outputs.order_defects` with the full `recommended_order`; include `modifications` as an empty list until an approved operation is delegated. Present the recommendation for confirmation; nothing is rewritten until it is approved. The remedies:

- **reorder-before** — move the resolving commit before the consumer
- **fold-into** — squash consumer and resolver when they are truly one change
- **hoist-hunk** — split a minimal hunk out of the resolver and place it at or before the consumer, when only a fragment (one catalog line, one config flag) is needed earlier

## Remedy operations (delegated to `coding:commit`)

Once the recommended order is approved, request each move from `coding:commit` — never run these directly from this skill or its workers. Name the exact operation and targets; `coding:commit` guards every rewrite with its `backup.sh` / `verify.sh` pair and rolls back on integrity failure. The operations to request:

### Reorder the resolving commit before the consumer

- **jj**: `jj rebase -r <resolver> --insert-before <consumer>`
- **git**: an interactive rebase from `<base>` moving the resolving commit above the consumer, or `git rebase --onto` to re-anchor.

### Fold consumer and resolver together (when they are truly one change)

- **jj**: `jj squash --from <consumer> --into <resolver>` (or the reverse, keeping the earlier slot)
- **git**: mark the later commit `fixup`/`squash` against the earlier one in the rebase plan.

### Hoist a hunk into or out of a commit

- **jj**: `jj split -r <resolver>` to carve the minimal hunk into its own commit, then `jj rebase -r <hunk>` with `--insert-before <consumer>` (or `jj squash --from <hunk> --into <consumer>` to fold it in).
- **git**: at the resolver's `edit` stop, split with `git reset HEAD^` + `git add -p` into the hunk commit and the remainder, then move or `fixup` the hunk commit into place.

### Rollback (owned by `coding:commit`)

- **jj**: `jj op log` then `jj op restore <op-id>` to the pre-remedy operation.
- **git**: `git reset --hard ORIG_HEAD` or recovery via `git reflog`.

## Loop

After `coding:commit` reports an approved recommendation applied, re-run all three detectors from the top. Proceed to Step 3 only when the order is clean. Because every approved move is an internal reshuffle, Gate A in `orchestration.md` then verifies the rewritten tip tree is identical to the original (lockfile excluded) before any QA is spent.
