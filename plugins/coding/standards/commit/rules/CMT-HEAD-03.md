# CMT-HEAD-03: Pair the Breaking Marker With Its Footer

## Severity

error

## Intent

`!` before the colon declares that consumers must change something. On its own
it says a break exists without saying what broke or how to migrate, which is the
part a reader needs. Every `!` is therefore paired with a `BREAKING CHANGE:`
paragraph in the body describing the migration, and every breaking change
carries the `!`.

## Scan

If the header contains `!`, require a `BREAKING CHANGE:` footer in the body. If
the body contains that footer, require the `!`. Then judge whether the
paragraph states the migration rather than restating that a break occurred.

## Fix

Add the missing marker or the missing footer. If the paragraph names no
migration path, write one; if none exists, say so explicitly and name the
replacement.

## Edge Cases

- A pre-release surface with no consumers is still marked; whether the version
  bump follows is the release process's call, not this standard's.
- In this repository, greenfield status permits breaking changes freely — it
  does not exempt them from being declared.

## Related

CMT-HEAD-01, CMT-BODY-01
