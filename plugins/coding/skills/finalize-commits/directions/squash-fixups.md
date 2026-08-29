# Auto-Squash Fixups — detect + squash (jj + git)

Referenced from SKILL.md Step 6. Folds fixup-style commits into their targets before QA so each commit reads as one authored change. Detection here is read-only; the squash itself is applied by `coding:commit` after approval, guarded by its `backup.sh` / `verify.sh` pair.

## Detect

### git

- `fixup!`/`squash!` subjects: a commit whose subject starts with `fixup! ` or `squash! ` names its target by the target's subject.
- List candidates oldest-first across `@{upstream}..HEAD`:

```bash
git log --reverse --format='%H %s' @{upstream}..HEAD | grep -E '^[0-9a-f]+ (fixup|squash)! '
```

### jj

jj has no literal `fixup!` convention; instead detect **absorb candidates** — uncommitted or late edits that belong to an earlier commit's lines:

- `jj absorb --dry-run` (preview which hunks would flow into which ancestor).
- Also treat any mutable commit whose description starts with `fixup!`/`squash!` (e.g. imported from git) as an explicit target reference.

Report `status`, `summary`, `outputs.squashed`, `outputs.new_targets`, and `issues`; use empty arrays when no fixups are found.

## Squash (delegated to `coding:commit`)

After approval, invoke `coding:commit` with the target and requested operation — it owns autosquash, absorb, rollback, and all other history mutations. The operations to request:

### git

```bash
git rebase --autosquash --interactive @{upstream}~1   # autosquash orders fixup!/squash! onto targets
```

Prefer non-interactive where the sequence is unambiguous: `GIT_SEQUENCE_EDITOR=:` accepts the autosquash plan.

### jj

```bash
jj absorb                                  # flow eligible hunks into the ancestors that own those lines
jj squash --from <src> --into <dst>        # explicit fixup commit → its target
```

For an explicit `fixup!`-described commit, resolve `<dst>` from the referenced subject, then request `jj squash --from <fixup-rev> --into <dst>`.

## After squashing

- `coding:commit` runs its integrity verify; on failure it rolls back (`jj op restore` / `git reset --hard ORIG_HEAD`) and the run STOPs.
- Re-enumerate targets (per SKILL.md Step 1) so the QA loop walks the post-squash stack.
- Re-run the affected commit and all dependent later commits through the per-commit QA reference.
- The squashed commit's message must still describe its full contents — if the fold changed what the commit does, message conformance in `qa-loop.md` Step 6 will catch and reword it.
