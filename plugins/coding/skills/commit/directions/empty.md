# Scenario: empty change (`@` or interior change has no diff)

Empty changes are usually a planning artifact, not a problem. The skill investigates intent before acting. See [SKILL.md](../SKILL.md).

## When triggered

- `jj diff --stat` on `@` returns empty
- `jj log -r 'description(none) & ~empty=false'` reveals empty interior changes
- Default save ([save.md](./save.md)) Step 2 detected an empty `@`

## Procedure

### 1. Inspect the change

```bash
jj log -r <change_id> --no-graph
jj op log -r '<change_id>::' --limit 10
```

Read the description and recent op history. Three patterns emerge:

| Description | Recent ops | Interpretation |
|---|---|---|
| Empty | `new` only | Fresh empty `@`; user hasn't written anything yet. Safe to keep or abandon. |
| Empty | `squash` / `split` away from this change | Content was moved elsewhere. Abandon. |
| Non-trivial (e.g. "TODO: implement avatar upload") | `describe` set this; no `commit`/`squash` since | Planned placeholder. Keep. |

### 2. Content squashed elsewhere → safe abandon

```bash
jj abandon <change_id>
```

If `<change_id>` is `@`, jj creates a fresh `@` automatically (or moves `@` to the abandon target's parent — `jj log` to confirm).

### 3. Content never written → abandon (or keep as scratch)

```bash
jj abandon <change_id>
```

jj auto-abandons child empty changes when the parent moves away. Confirm post-state:

```bash
jj log -r '<old_change_id>::' --no-graph
# Should resolve to "no such revision" or only show descendants now reparented
```

### 4. Meaningful description (planned placeholder) → keep

The user intentionally created an empty change to mark intent or hold a slot in a stack. Don't abandon. Instead:

```bash
jj new
```

Creates a fresh `@` on top of the placeholder. The placeholder remains in the chain until the user fills it.

If the placeholder has a downstream bookmark (e.g. it represents a future PR), keep the bookmark too.

## Hard rules

- Always read description + op log BEFORE abandoning. An empty `@` can still represent committed intent.
- Conventional regex applies only when you describe a NEW change.
- `jj abandon` is reversible via `jj op restore <op_id>` — but capture the op id first if uncertain.

## Mandatory follow-ups

- If the abandoned change had a downstream bookmark, the bookmark moved to
  the parent automatically; follow the [SKILL.md](../SKILL.md) publication
  handoff with the affected stack after local verification. A merged-on-origin
  target still routes to [merged.md](./merged.md).
- No integrity check is required for a pure abandon of a truly empty change (the working tree didn't change). For abandon of a non-`@` empty change with descendants, jj auto-rebases — verify with `jj log -r '::@'`.

## Error / edge cases

| Symptom | Action |
|---|---|
| `@` shows empty but `git status` shows dirty | jj hasn't auto-snapshotted yet (rare). Run `jj st` to force snapshot; re-check `jj diff --stat`. |
| Abandon leaves no `@` | jj always maintains `@`. Run `jj new <parent>` if `@` somehow vanished. |
| Abandoned change reappears as divergent | A workspace still references it → [divergent.md](./divergent.md). |
| Empty change is between two non-empty changes | Same procedure — `jj abandon` cleanly rebases the descendant onto the predecessor. |
