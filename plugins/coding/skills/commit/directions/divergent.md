# Scenario: divergent change ID (`??` marker in `jj log`)

A divergent change happens when the same jj change ID resolves to two different commits — typically caused by parallel edits across workspaces, restored-then-modified abandoned changes, or unsynced fetches. See [SKILL.md](../SKILL.md).

## When triggered

```bash
jj log -r 'visible_heads()'
# Output contains a row marked with `??` next to a change id
```

Or:

```bash
jj log -r 'change_id(<id>)'
# Returns more than one commit
```

## Procedure

### 1. Investigate FIRST — never reflexively abandon

```bash
# Inspect both sides of the divergent change
jj log -r 'change_id(<id>)' --no-graph

# Check if a remote fetch resolves it (often a missed main update creates phantom divergence)
jj git fetch
jj log -r 'change_id(<id>)'
```

Identify each side by its commit hash (jj prints them alongside the change id). Note descriptions, parents, and timestamps. Decide which side is canonical.

### 2. Absorb useful content (if the non-canonical side has unique work)

If the older / non-canonical side has hunks the canonical side lacks:

```bash
# Pick the side ordinals jj prints (e.g. <id>/0 older, <id>/1 newer)
jj squash --from <id>/0 --into <id>/1
```

Or use `jj diff --from <id>/0 --to <id>/1` first to confirm what's unique on each side.

### 3. Discard the unwanted side

```bash
jj abandon <id>/<n>
```

Where `<n>` is the ordinal of the side that loses (the one not retaining work, post-absorb).

### 4. Validate

```bash
jj log -r 'visible_heads()'
# Confirm no `??` marker remains for that change id

jj log -r 'change_id(<id>)' --no-graph
# Confirm single result
```

### 5. Surface remote stack impact

If any unmerged bookmark sat at or below the divergent change, follow the
[SKILL.md](../SKILL.md) publication handoff with the resolved stack metadata
after local integrity passes.

## Prevention rules

- NEVER `jj new` on a hidden or abandoned change. Always start new work from a visible head (`@`, a bookmark, or `main@origin`).
- NEVER edit the same change ID from two workspaces concurrently. Pick one workspace as owner per change; sibling workspaces should `jj new <other-workspace-change>` to take a copy rather than `jj edit` the shared id.
- Run `jj git fetch` before any cross-workspace integration so remote-introduced divergence resolves cleanly.

## Hard rules

- Investigate before mutating — the divergence may carry uncommitted intent on the non-canonical side.
- Conventional regex unchanged (no descriptions are rewritten here).
- Abandoning is irreversible from inside jj's normal view; recover via `jj op restore <id>` if needed (capture op id before abandoning).

## Mandatory follow-ups

- Follow the publication handoff for affected downstream bookmarks per Step 5.
- Integrity check ([SKILL.md](../SKILL.md) Verification) — the working copy may shift if `@` was a divergent side.
- Re-run project scripts if the canonical side replaced uncommitted work.

## Error / edge cases

| Symptom | Action |
|---|---|
| Both sides have unique uncommitted work | Absorb both via two `jj squash --from` calls onto whichever side is staying. |
| User can't tell which side is canonical | Inspect `jj op log` for both: the side with the most recent `describe` or `new` op is typically the user's intended state. |
| Divergence persists after abandon | A workspace still references the abandoned side. `jj workspace list`; force-update the offending workspace's `@` with `jj edit <canonical>`. |
| `jj git fetch` introduced the divergence | Local change was rebased differently on remote. `jj abandon` the local side and adopt the remote — or absorb local hunks first. |
