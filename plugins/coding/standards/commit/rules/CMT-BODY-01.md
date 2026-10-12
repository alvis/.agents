# CMT-BODY-01: Explain Why Without Hard Wrapping

## Severity

error

## Intent

The body is separated from the subject by exactly one blank line. Never hard-wrap any content. Its content explains **why**: the reasoning, the trade-off, the alternative rejected. The diff already shows what changed, so a body restating the changed files adds length without adding information — and the reasoning is the part no future reader can recover from the repository.

## Scan

Check for the blank separator line and hard-wrapped paragraphs. Then judge whether the prose states reasoning or paraphrases the diff.

## Fix

Remove hard wrapping. Replace any file-list or change-list paragraph with the reason the change was made this way. A body with genuinely nothing to explain is omitted, not padded.

## Edge Cases

- A trivial change (a typo fix, a version bump) may legitimately have no body.

## Related

CMT-SUBJ-01, CMT-BODY-02
