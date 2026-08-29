# CMT-BODY-02: Reference Issues With the Exact Trailers

## Severity

error

## Intent

Issue closure uses `Closes #<number>` at the bottom of the body, with commas
for multiple issues (`Closes #12, #14`). `Fixes` and `Resolves` are not
substitutes: one keyword keeps history greppable and matches what the
forge's automation is configured against. Non-closing references cite the issue
or PR by `#NNN` or URL, also at the bottom. A `revert` commit carries a
`Reverts <sha>` line naming the reverted commit, because the header alone does
not identify it.

## Scan

Locate trailers at the end of the body. Reject `Fixes`/`Resolves` used for
closure. Confirm every `revert`-typed commit has a `Reverts <sha>` line, and
that the sha resolves in this repository.

## Fix

Rewrite the trailer to `Closes #<number>`, or demote it to a plain reference if
the commit does not actually close the issue. Add the missing `Reverts <sha>`,
reading the sha from the history rather than from memory.

## Edge Cases

- A commit that partially addresses an issue references it without `Closes`.
- A revert of a revert still names the commit it reverts, not the original.

## Related

CMT-HEAD-01, CMT-BODY-01
