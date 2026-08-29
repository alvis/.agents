# Plan change structure BEFORE writing code

Follow `essential:directions/plan.md`; this reference adds commit and
pull-request structure to that shared plan contract.

This reference is consulted at the START of any non-trivial task, before code edits begin. The goal: structure work so that commits and PRs end up independently mergeable, with no forward references, and no "split by directory" anti-patterns. See [SKILL.md](../SKILL.md) for the overall pipeline.

## First principle: domain coherence

A commit is a unit of intent, not a unit of file system location. One feature that touches data, service, and UI layers is **ONE commit**, NOT three commits split by directory.

Apply the authoritative `coding:standards/git/rules/GIT-PR-TYPE-02.md` when a plan changes public types, interfaces, schemas, signatures, exports, generated declarations, or prerequisite scaffolding. By default, they form one domain-coherent commit with the first implementation that fulfills or consumes them; review size can demand stronger evidence but cannot create a contract-first commit or stack entry. The rule's exceptions remain available for documentation-only corrections, declarations that are themselves complete type-level implementations even inside mixed runtime packages, and standalone initialization whose requested deliverable is a runnable or buildable baseline. Migrations and consumer logic remain separate under `GIT-PR-TYPE-03`; coupled generated output stays with its implementing feature under `GIT-PR-TYPE-05`. Keep focused runtime tests and compiler-semantic tests permitted by `TST-CORE-10` in the implementing change.

### Good (domain-coherent)

```
feat(user-profile): add avatar upload
├── packages/data/src/user/avatar.ts
├── packages/service/src/user/uploadAvatar.ts
└── packages/web/src/components/AvatarPicker.tsx
```

### Bad (directory-sliced)

```
feat(data): add avatar field        # broken on its own — service uses field that exists but no upload
feat(service): add upload endpoint  # broken on its own — UI doesn't call it yet
feat(web): add avatar picker        # broken on its own — calls service that doesn't exist (forward ref!)
```

The "bad" form fails the self-containment rule in [SKILL.md](../SKILL.md) hard rules: each change must compile + lint + run applicable tests in isolation. Runtime tests apply to runtime behavior; focused compile-time tests apply only to allowed compiler-semantic promises under `TST-CORE-10`. A declaration-only change with neither test kind still runs its configured typecheck or equivalent diagnostics and affected-consumer builds; it must not receive a static-shape test.

## Layering check: no forward references

For each candidate commit in the plan, ask: **"If I checked out exactly this commit on top of `main@origin`, does it build?"** If the answer is no because it calls into something not yet introduced, the split is wrong.

Forward references typically appear when:

- UI commits land before the service/data they call
- A `package.json` `dependencies` bump lands in a different commit than the code that uses the new API
- A `tsconfig` `paths` mapping lands later than imports that resolve through it
- A public type, schema, export, or scaffold lands before the first behavior that makes it useful

## Shared-file evolution

Files like `package.json`, `tsconfig.json`, lockfiles, schema migration files, and central type registries are touched by many features. Plan for **incremental evolution**, not a single batch dump:

- Commit A introduces dependency `X` AND the first code that uses it
- Commit B uses more of `X` — bumps `package.json` only if needed
- Lockfile updates ride alongside their `package.json` change in the SAME commit

Never separate `package.json` from the code that needs the new dep — that's a forward reference disguised as "tidiness".

## Upfront decision: one PR or many bookmarks?

Before coding, answer:

1. **Is this one logical feature or several?**
   - One feature, one PR: default path, including its public shape and first implementation → end with single commit on `@`, no `--create-pr` flag needed beyond the basic save.
   - Several independent features: stacked PRs → plan the bookmark chain now, use `--create-pr` later.
2. **Can each piece be reviewed and merged independently?** If not, it's one PR.
3. **Does each piece deliver standalone value?** If not, it's one PR.

If "many bookmarks":

- Sketch the chain order: `feat-x/01-reset` → `feat-x/02-avatar` (each bookmark is an independently shippable feature)
- Confirm the order respects any real dependency between those independent features
- Each saved change will be handed to [`coding:pr create`](../../pr/directions/create-update.md), which owns bookmark and draft-PR publication.

## Concrete examples

### Example A: feature with three layers (ONE commit)

User asks: "add password reset flow". Plan:

```
feat(auth): add password reset flow
- packages/data/src/auth/resetToken.ts          (new token model)
- packages/service/src/auth/requestReset.ts     (issue token + email)
- packages/service/src/auth/confirmReset.ts     (verify token + update password)
- packages/web/src/components/PasswordReset.tsx (UI)
- packages/web/src/pages/reset/[token].tsx      (route)
```

One commit. Each layer alone is broken; together they form one shippable feature.

### Example B: two independent features (TWO commits, stacked PRs)

User asks: "add password reset AND profile picture upload". Plan:

```
01 feat(auth): add password reset flow      → bookmark feat-x/01-reset
02 feat(user-profile): add avatar upload    → bookmark feat-x/02-avatar
```

Two commits. Each is independent. `/coding:commit --create-pr` preserves the
compatibility call and delegates the saved stack to
[`coding:pr create`](../../pr/directions/create-update.md).

### Example C: refactor first consumed by a feature (ONE commit)

```
01 feat(auth): extract token validation and add password reset flow
```

The utility ships with the first behavior that consumes it; exporting or testing an otherwise unused helper does not make a dormant prerequisite independently shippable. A separate pure-refactor commit is allowed only when existing behavior already consumes the extracted utility and remains complete after that commit.

## Output of planning

Before invoking [save.md](./save.md),
[split.md](./split.md), or handing publication to
[`coding:pr create`](../../pr/directions/create-update.md), produce:

1. Ordered list of intended commits
2. For each: conventional title (see [commit-message standard](../../../standards/commit/write.md)) + file list
3. Rationale: how each layer compiles in isolation
4. PR strategy: single PR or stacked

Present this plan to the user BEFORE writing code. Re-confirm if scope grows during implementation.
