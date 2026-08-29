# Default save (no flag)

The default route when the user invokes `/coding:commit` with no flag and `@` contains a single coherent concern. See [SKILL.md](../SKILL.md) for the overall pipeline.

## When triggered

- No flag passed
- `jj diff --stat` shows changes that map to ONE conventional-commit scope
- `@` is not empty
- `@` is not already described with a final message (else this is a no-op)

If `@` mixes concerns → [split.md](./split.md).
If `@` is empty → [empty.md](./empty.md).

## Procedure

### 1. Confirm jj snapshot of `@`

```bash
jj log -r @ --no-graph -T 'change_id.short() ++ " " ++ description ++ "\n"'
jj diff --stat
```

jj auto-snapshots the working copy on every op, so `@` already reflects current files. No `git add` needed.

### 2. Abandon if empty

If `jj diff --stat` is empty:

```bash
jj abandon @
jj new
```

Stop and report. See [empty.md](./empty.md) for nuances.

### 3. Detect multi-concern → suggest split

Read the diff. If files span more than one domain or scope (per [plan.md](./plan.md)):

- Surface to the user: "`@` mixes <list of concerns>. Recommend splitting into N commits."
- On confirmation, switch to [split.md](./split.md).
- If one concern logically belongs on a different existing branch (e.g. a docs typo that should land on `master` while `@` is on a feature branch), prefer [partial.md](./partial.md) over [split.md](./split.md).

### 4. Compose conventional message

Validate against the regex in [commit-message standard](../../../standards/commit/write.md) BEFORE describing the change. Example:

```text
feat(user-profile): add avatar upload

Adds the AvatarPicker component plus the upload endpoint and data
model that backs it. The full flow lands in one commit so each layer
compiles in isolation.
```

### 5. Describe and commit

```bash
jj describe @ -m "<conventional-subject>" -m "<body>"
git commit --allow-empty -m "$(jj log -r @ --no-graph -T 'description')"
```

Notes:
- jj `describe` sets the description on the jj change.
- In a colocated repo, `git commit` emits the conventional commit object that `git log` and PR pipelines see. jj keeps the working copy and index in sync automatically.
- Use `--allow-empty` only when jj has already squashed all changes into the description; in the normal path you'll have staged changes from the auto-sync and the flag is harmless.
- If `--no-verify` is set, append `--no-verify` to `git commit`. See behaviour flag in [SKILL.md](../SKILL.md).

### 6. Start fresh `@`

```bash
jj new
```

This creates an empty `@` on top of the just-described change so subsequent edits don't accidentally amend it.

## Verification

The PostToolUse hook fires `verify.sh` after `git commit`. Read the `── Integrity Check ──` stderr block per [SKILL.md](../SKILL.md) Verification.

Run applicable project scripts (unless `--no-verify`): lint and build where the
project defines them, configured typecheck or equivalent type diagnostics for
all changed code, affected-consumer builds for changed public shape,
runtime tests only for runtime behavior, and focused compile-time tests only
for allowed compiler-semantic promises under `TST-CORE-10`. For a
declaration-only change with no runtime behavior or allowed compiler-semantic
promise, record those two test gates as `SKIP (not applicable)` after type
diagnostics and affected-consumer builds pass; do not run or invent a test. For
example, a runtime-producing npm project may require:

```bash
npm run lint
npm run test
npm run build
```

Failure → STOP, surface to user. Do not report completion until clean.

## Hard rules

- Conventional Commits subject regex MUST match before `jj describe`. See [commit-message standard](../../../standards/commit/write.md).
- No emoji in subject.
- Subject ≤72 chars (target 50).
- Body explains WHY, not WHAT.

## Mandatory follow-ups

- None. Default save touches no downstream bookmarks, so the publication-impact handoff in [SKILL.md](../SKILL.md) is skipped.
- Report per [SKILL.md](../SKILL.md) Completion.

## Error / edge cases

| Symptom | Action |
|---|---|
| `git commit` fails (pre-commit hook) | Surface output; fix; re-run from Step 5. Do NOT `--amend` — create a new attempt by re-describing if needed. |
| `jj describe` rejected (immutable) | Target is on a protected revset. Run `jj new` first, then describe the new `@`. |
| Conventional regex fails | Fix subject; re-run. Do not bypass. |
| User wants to skip project-script checks | Pass `--no-verify`. Skip project scripts only; the integrity hook still runs. |
