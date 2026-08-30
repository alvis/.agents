# CMT-HEAD-02: Scope One Kebab-Case Concern

## Severity

error

## Intent

A scope names one concern in kebab-case, or is omitted. It is a short package
name (`auth`, `web`) with catalog prefixes dropped — `auth`, never
`@scope/auth`. A change spanning several packages names the shared concern
(`feat(theming): unify dark mode`), because a package list in the scope makes
the header unsearchable and grows with every future package. A change with no
single concern omits the scope entirely.

## Scan

Read the scope text. Reject a leading `@`, a `/`, a comma, a space, an
underscore, or an upper-case letter. Then judge whether the remaining word
names a concern or enumerates where files happened to land.

## Fix

Replace a package list with the concern the change serves, or drop the scope for
a genuinely global change. Strip any catalog prefix.

## Edge Cases

- A repository whose committed commit policy defines a multi-scope syntax may
  use it; record the exception per `meta.md`, since the canonical regex admits
  one scope.
- `docs(coding/pr)` — a `plugin/skill` path — is this repository's own committed
  scope form and matches the regex's `[\w./-]+` class.

## Related

CMT-HEAD-01
