# Commit Messages: Violation Scan

Any violation is an issue that requires a fix. Use `write.md` for compliant
outcomes and load the matching guide from `rules/`.
Protocol: `essential:directions/standards.md`.

## Mechanical Scans

- `CMT-HEAD-01` — Match the candidate subject against the canonical regex in
  [write.md](write.md). Run it against the exact string that will be written,
  before the mutation. A non-match is a violation, not an authoring hint.
- `CMT-HEAD-01` — Confirm the type is in the closed allowlist in
  [write.md](write.md); a regex match alone does not prove the type is allowed
  under a repository policy that narrows it.
- `CMT-SUBJ-01` — Measure subject length in characters.
- `CMT-BODY-01` — Measure body line length in characters.

## Semantic Scans

Syntax alone cannot establish these findings.

- `CMT-SUBJ-01` — Judge whether the subject is imperative rather than past tense.
- `CMT-HEAD-02` — Judge whether the scope names one concern rather than a
  package list.
- `CMT-BODY-01` — Judge whether the body explains why rather than restating the
  diff.

Do not report branch names, PR titles, draft state, labels, stack position,
history mutation, or merge order as violations of this standard. They belong to
[coding:commit](../../skills/commit/SKILL.md), the
[PR router](../../skills/pr/SKILL.md), and the
[pull-request standard](../git/meta.md).

## Quick Scan

- DO NOT write a subject that fails the canonical regex or uses a type outside the allowlist [`CMT-HEAD-01`]
- DO NOT write a scope carrying a catalog prefix, a package list, or non-kebab-case text [`CMT-HEAD-02`]
- DO NOT mark a breaking change with `!` and omit its `BREAKING CHANGE:` footer [`CMT-HEAD-03`]
- DO NOT write a past-tense subject, a trailing period, an emoji, or over 72 characters [`CMT-SUBJ-01`]
- DO NOT write a body without blank-line separation, wrapped past 72 characters, or restating the diff [`CMT-BODY-01`]
- DO NOT close an issue with anything but `Closes #<number>`, or omit `Reverts <sha>` from a revert [`CMT-BODY-02`]

## Rule Matrix

| Rule ID | Violation | Bad Example |
|---|---|---|
| `CMT-HEAD-01` | Header fails the regex or uses an unlisted type | `update auth` |
| `CMT-HEAD-02` | Scope is not one kebab-case concern | `feat(@scope/auth): add reset` |
| `CMT-HEAD-03` | `!` without a `BREAKING CHANGE:` footer | `feat(auth)!: drop /v1/login` with no footer |
| `CMT-SUBJ-01` | Past tense, trailing period, emoji, or over-long | `feat: Added new feature.` |
| `CMT-BODY-01` | Unseparated, unwrapped, or what-not-why body | Body restating the changed file list |
| `CMT-BODY-02` | Wrong closure keyword or missing revert sha | `Fixes #482` |
