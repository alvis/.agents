# Auto-detected split (multi-concern `@`)

The skill detects that `@` contains changes spanning more than one logical concern and splits it into N atomic commits. **LLM-driven, no script** — the LLM does the domain reasoning the old `propose-splits.py` couldn't. See [SKILL.md](../SKILL.md) for the overall pipeline.

## When triggered

- `jj diff --name-only` returns files across multiple domains/scopes
- Default save ([save.md](./save.md)) detected a multi-concern `@`
- User explicitly asks "split this"

## Procedure

### 1. Read the diff

```bash
jj diff --name-only
jj diff --stat
jj diff               # full hunks when needed for clustering decisions
```

### 2. Cluster by DOMAIN, not path prefix

Apply [plan.md](./plan.md). A path-prefix cluster like "all files under `packages/data/`" is wrong if those data changes belong to two different features.

For each candidate cluster, verify:

- All files contribute to ONE conventional-commit scope
- The cluster compiles + passes applicable tests in isolation when applied on top of `main@origin`
- No forward references to a later cluster

If a file participates in multiple concerns, prefer splitting the file by hunk:

```bash
jj split            # interactive, pick hunks for the first commit
```

### 3. Produce ordered plan

Output, for user confirmation:

```text
Proposed split (N commits):

01 feat(user-profile): add avatar upload
   - packages/data/src/user/avatar.ts
   - packages/service/src/user/uploadAvatar.ts
   - packages/web/src/components/AvatarPicker.tsx

02 fix(auth): correct token expiry off-by-one
   - packages/service/src/auth/tokenExpiry.ts
   - packages/service/test/auth/tokenExpiry.spec.ts

Order rationale: 01 is the new feature; 02 is an unrelated bugfix
that happened to be in the working copy. Either order is safe; we
land 01 first because it has more dependent files downstream.
```

Validate each title against [commit-message standard](../../../standards/commit/write.md) BEFORE proceeding.

### 4. Execute splits

For each cluster in order (1..N):

```bash
# Split the named files out of @ into a new change ahead of @
jj split <file1> <file2> ... <fileN>

# jj split opens an editor by default; jj v0.40+ lets you pass -m
# (description for the SPLIT-OUT change, which becomes @-).
# Use the conventional title from the plan.
jj describe @- -m "<conventional-subject>" -m "<body>"
```

Notes:
- `jj split <files>` carves out the named files (whole-file granularity) into a new change that sits at `@-`; the rest stays on `@`.
- Use `jj split` (no files) for **hunk-level** splitting via the interactive editor when a single file belongs to multiple clusters.
- After each split, the original `@` shrinks. Verify with `jj diff --stat` before the next iteration.

### 5. Final cluster

The last remaining cluster sits on `@` itself. Describe it:

```bash
jj describe @ -m "<conventional-subject>" -m "<body>"
```

### 6. Emit git commits

For each described change, in stack order, emit the conventional git commit. The cleanest path is to walk the chain bottom-up:

```bash
# For each change from oldest to newest:
jj edit <change_id>
git commit --allow-empty -m "$(jj log -r @ --no-graph -T 'description')"
```

Or rely on the colocated repo's auto-sync (jj writes git objects for each described change automatically). Verify with `git log --oneline`.

### 7. Land on a fresh `@`

```bash
jj new
```

## Verification

After EACH split + describe pair, run:

```bash
jj log -r '@-..@' --no-graph
```

After all splits, run the [SKILL.md](../SKILL.md) integrity verification and
applicable project scripts for each cluster (unless `--no-verify`), including
configured typecheck or equivalent diagnostics for all changed code, plus
affected-consumer builds for changed public shape. Runtime tests apply only to
runtime behavior; focused
compile-time tests apply only to allowed compiler-semantic promises under
`TST-CORE-10`. For a declaration-only cluster with neither test kind, run the
diagnostics and consumer-build gates, then record both test gates as `SKIP (not
applicable)`; do not run or invent a test. For example, a runtime-producing npm
cluster may require:

```bash
npm run lint
npm run test
npm run build
```

For each commit in isolation (recommended for stacked PR candidates):

```bash
jj edit <change_id> && npm run build
```

## Hard rules

- Cluster by domain, not path. Re-check against [plan.md](./plan.md).
- Each cluster MUST compile/typecheck + lint + run applicable tests and affected-consumer builds standalone: runtime tests for runtime behavior, and focused compile-time tests only for allowed compiler-semantic promises under `TST-CORE-10`. A declaration-only cluster with neither test kind still runs its configured typecheck or equivalent diagnostics and affected-consumer builds; it must not receive a static-shape test.
- Conventional regex enforced PER cluster before any `jj split` runs.
- No forward references between clusters (a later cluster may depend on an earlier one; never the reverse).

## Mandatory follow-ups

- If any downstream bookmark exists on the affected chain, follow the
  [SKILL.md](../SKILL.md) publication handoff with the resolved stack metadata;
  it owns remote restacking and republication.
- Final report per [SKILL.md](../SKILL.md) Completion.

## Error / edge cases

| Symptom | Action |
|---|---|
| User declines proposed clusters | Re-cluster with their feedback; do not silently proceed. |
| One file genuinely belongs to two clusters | Use `jj split` (no args) for hunk-level interactive split. |
| Cluster fails to build standalone | Plan was wrong: merge with adjacent cluster or re-order; redo planning. |
| `jj describe` rejected (immutable target) | Target is on a protected revset; abort and surface — user must move work onto a mutable revision first. |
