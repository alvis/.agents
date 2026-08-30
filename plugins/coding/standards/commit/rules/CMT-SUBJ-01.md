# CMT-SUBJ-01: Write an Imperative, Unadorned Subject

## Severity

error

## Intent

The subject completes "this commit will ...": imperative mood (`add`, `fix`,
`rename`), never past tense. It targets 50 characters and never exceeds 72, so
it survives every log format unwrapped. It carries no trailing period and no
emoji. It is self-explanatory without the body, because most readers see only
the subject line.

## Scan

Measure the subject in characters after the `: `. Check the first word for a
past-tense form. Check the final character for `.`. Check for emoji codepoints.
Then judge whether the subject alone identifies the change.

## Fix

Rewrite in imperative mood and drop the ornament. If the subject cannot fit 72
characters without losing meaning, the commit is too broad — split it rather
than truncating the description.

## Edge Cases

- A proper noun or acronym keeps its natural capitalization; a lower-case first
  word is conventional but not enforced.
- The 50-character figure is a target and not a violation on its own; 72 is the
  hard limit.

## Related

CMT-HEAD-01, CMT-BODY-01
