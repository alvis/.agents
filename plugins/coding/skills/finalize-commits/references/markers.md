# QA Markers — lock-excluded patch-id validated (jj + git)

Referenced from SKILL.md Step 4. A marker records that a specific commit's CONTENT passed QA, so a re-run skips it. Validation is by **patch id** (content hash), not commit id — because finalizing later commits, rebasing, or rewording changes commit ids while the tree content of an already-green earlier commit is unchanged.

## Patch id = content identity, lockfile excluded

Compute the patch id from the commit's diff with the project's lockfile excluded (stable across rebase/reword AND lock cascades):

```bash
# git — substitute the project's lockfile for pnpm-lock.yaml
git diff-tree -p <sha> -- . ':(exclude)pnpm-lock.yaml' | git patch-id --stable
# jj — same diff, filtered the same way via a fileset
jj diff -r <rev> --git -- '~pnpm-lock.yaml' | git patch-id --stable
```

The exclusion is load-bearing: every upstream lock-fold rewrites every descendant commit's lock hunk, so a whole-diff patch id is invalidated by cascade — finalize one early commit and every marker below it dies, and the skip-on-rerun mechanism never fires. Excluding the lockfile lets markers survive lock cascades while the rest of the diff still guards against content drift (any non-lock edit to the commit invalidates the skip).

Store the patch id in the marker. On re-run, recompute the current commit's lock-excluded patch id and skip QA iff it matches a stored green marker.

## Storage

### git — `git notes --ref=qa`

```bash
git notes --ref=qa add -f -m "qa:pass patch-id=<patchid> ts=<epoch>" <sha>
git notes --ref=qa show <sha>        # read back
```

Make notes survive rebase/amend by enabling note rewriting (set once per repo):

```bash
git config notes.rewriteRef refs/notes/qa
git config notes.rewrite.amend true
git config notes.rewrite.rebase true
```

### jj — `.jj/changes/<id>.md`

Write a small markdown record under the repo's `.jj/changes/` directory keyed by the change id:

```
# .jj/changes/<change-id>.md
qa: pass
patch-id: <patchid>
ts: <epoch>
```

Because the change id is stable across jj rewrites, the file persists; the patch-id line still guards against content drift (a later edit to that commit invalidates the skip).

## Skip rule

A commit is skipped in Step 4 iff: a marker exists for it AND the stored `patch-id` equals the freshly computed lock-excluded patch id. Any mismatch (content changed) → re-run QA and overwrite the marker on green. The skip waives the lint and test legs only — when the commit's lockfile must re-fold (an upstream fold cascaded into it during replay), install still runs and the regenerated lock is folded before the walk advances (`../directions/qa-loop.md` Step 3).

## Write timing

Write the marker ONLY after the commit is fully green (install + lint + test/coverage all pass, the fold is in, and the message conforms). Never mark a commit that still has a `pending_decision` outstanding.
