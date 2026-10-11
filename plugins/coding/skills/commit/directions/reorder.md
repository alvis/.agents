# `--reorder [--up-to <rev>]` — re-linearise history with content-equivalence guard

Deliver a clean linear chain up to a target rev, preserving the merged tree exactly. The user's hard requirement: **"ensure the content remain the same at the end"** — verified through JJ's native tree comparison. See [SKILL.md](../SKILL.md).

## When triggered

- User passes `--reorder`
- Optionally `--up-to <rev>` (default: `main@origin`; accepts `root` or any specific commit)
- Range to reorder is `(target..@)::`

## Procedure

### 1. Snapshot rollback handle

```bash
jj status
jj op log -n1 --no-graph -T 'self.id().short()'
ORIGINAL_TREE_REV=$(jj log -r @ --no-graph -T 'commit_id')
```

Record the op id. `jj op restore <id>` rewinds the entire reorder if anything goes wrong.

The captured immutable working-copy revision is the content baseline for Step 5. Apply [backup and recovery](../SKILL.md#backup-and-recovery); JJ needs no filesystem backup.

### 2. Identify the range

```bash
# Default up-to:
UPTO="main@origin"
# Or explicit:
UPTO="<rev>"

jj log -r "${UPTO}..@" --no-graph
```

Confirm the user-visible list of changes that will be reordered. Capture each change's short id and current description.

### 3. Plan the new order

Apply [plan.md](./plan.md) layering: lower layers first, no forward references.

Present to user:

```text
Current order:
  abc123 feat(web): add avatar picker UI
  def456 feat(service): add upload endpoint
  ghi789 feat(data): add avatar field

Proposed order:
  ghi789 feat(data): add avatar field
  def456 feat(service): add upload endpoint
  abc123 feat(web): add avatar picker UI

Rationale: data → service → UI matches layering; each commit compiles standalone.
```

Wait for confirmation. On `--dry-run`, STOP here.

### 4. Apply the rebase

Two primitives. Pick based on shape:

**a. Sequential `jj rebase -s` chain (clean when the new order is a strict permutation):**

```bash
# Set the new base for the first change in new order:
jj rebase -s ghi789 -d "${UPTO}"

# Then walk the new order, rebasing each onto the previous:
jj rebase -s def456 -d ghi789
jj rebase -s abc123 -d def456
```

`-s` moves the change AND its descendants. If a change to move has unrelated descendants, use `-r` instead.

**b. Targeted insertion via `--insert-before` / `--insert-after`:**

```bash
jj rebase -r abc123 --insert-after def456
```

Use when reordering a single change without disturbing others. v0.40+ supports this. Verify with `jj help rebase`.

### 5. Content-equivalence guard

After all rebases, the merged tree at `@` MUST match the captured immutable working-copy revision. Inspect the native comparison:

```bash
jj diff --from "$ORIGINAL_TREE_REV" --to @ --summary
```

An empty diff proves the versioned tree is unchanged. A nonempty diff or unresolved conflict blocks success: inspect the full native diff, restore the captured operation with `jj op restore <op_id_from_step_1>`, and replan. Do not run `backup.sh` or the backup-based `verify.sh` for this JJ route.

### 6. Re-emit git refs

In a colocated repo, jj writes new git objects as rebases happen. Verify:

```bash
git log --oneline "${UPTO}..HEAD"
```

The git log should reflect the new order with the same descriptions.

## Hard rules

- Content-equivalence guard MUST pass before reporting success.
- ANY merged-on-origin change in the range → STOP, route to [merged.md](./merged.md) before continuing.
- Conventional regex unchanged (descriptions are preserved during reorder).
- Never use `git rebase -i` for reorder — jj owns the rewrite; git is downstream-of-jj here.

## Mandatory follow-ups

- If any unmerged bookmark sits inside the reordered range, follow the [SKILL.md](../SKILL.md) publication handoff with the resolved stack metadata after local integrity passes. Discover open PRs for the selected heads and report their states without mutating them. The caller separately authorizes any publication or restacking through the [publication workflow](../../pr/directions/create-update.md#3-publish-bottom-up) that owns pushing and PR-base repair.

- Classify each change through the [documentation-only exemption](../../../directions/validation.md#classify-documentation-only-changes). Run applicable configured project gates for executable changes in their new positions; documentation-only changes receive no local mechanical checks.
- Final native tree equivalence and applicable project gates.

## Error / edge cases

| Symptom | Action |
|---|---|
| Rebase produces conflicts | Resolve with `jj resolve` or working-copy edits; `jj squash` resolutions into the conflicting change; re-verify. |
| `--up-to` rev not found | `jj git fetch`; confirm rev. |
| Content guard fails | DO NOT proceed. Recover via `jj op restore <op_id>`; replan the reorder. |
| Range contains merge commits | `jj rebase -r` instead of `-s`, or surface to user — merges complicate linearity and may need to be flattened first. |
| Target of `--up-to` is downstream of `@` | Error: range is empty or inverted. Re-check `jj log -r "${UPTO}..@"`. |
