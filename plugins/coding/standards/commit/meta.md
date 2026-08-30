# Commit Message Standards

_Scannable requirements for the text of a commit message._

## Authority Boundary

This standard owns the rendered text of a commit message: its header, subject,
scope, breaking-change marker, and body. Each violation is an issue that
requires a fix before the message is written.

[coding:commit](../../skills/commit/SKILL.md) owns every local history mutation
that carries a message — describing, splitting, reordering, absorbing, and
rewording. Those are directions, not standards. The
[pull-request standard](../git/meta.md) owns the implementation diff and the
rendered PR message; a PR title reuses the header contract below, but PR body
evidence belongs to that standard.

Read this standard at the moment a message is authored. A commit message is
validated before the mutation runs, never repaired afterwards.

## Canonical Inputs

- The subject regex in [write.md](write.md) is the sole header authority. No
  skill, script, or hook restates a variant of it.
- The type allowlist in [write.md](write.md) is closed. There are no aliases.

## Exception Policy

There is no exception path for `CMT-HEAD-01`. A subject that fails the regex is
never written; the workflow stops and the author supplies a conforming subject.

For every other rule, allowed exceptions only when:

- False positive
- The repository's own committed commit policy states a different rule

Required exception note fields:

- `rule_id`
- `reason` (`false_positive` or `repository_policy`)
- `evidence` (the repository file and line stating the differing policy)

Record the note in the change description that carries the exception.

## Rule Groups

- `CMT-HEAD-*`: Header form — type, scope, breaking marker, and the regex.
- `CMT-SUBJ-*`: Subject text form.
- `CMT-BODY-*`: Body form, footers, and issue references.
