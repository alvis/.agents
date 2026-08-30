# GIT-PR-TYPE-05: Isolate or Mark Generated Output

## Severity

warning

## Intent

Generated artifacts coupled to an implementing feature stay in that atomic
feature diff. Every generated path is identifiable as generated and the
rendered PR message names its source or generator, so reviewers can distinguish
authored logic from derived output. Unrelated generated output is isolated.

## Scan

Compare the classifier's generated paths with the implementation diff, Git
attributes, and the rendered Generated Files section. Report unmarked paths,
missing source or generator evidence, or generated output mixed with unrelated
authored changes. Do not report coupled generated contract output merely for
shipping with the feature that implements it.

## Fix

Keep coupled generated output with its implementing feature and mark every
generated path and its source or generator in the selected PR message. Move
only unrelated generated output into a focused diff. Configure
`linguist-generated=true` when the repository supports it, without excluding
the path from the PR file count.

## Edge Cases

- A path that humans edit and review as source is authored even if a tool
  originally created it.
- Lockfiles remain in the file count while their additions and deletions are
  excluded from authored net LOC.
- Snapshot-only changes may remain together when they are one reproducible
  generated surface.
- A public schema, its generated client, and the endpoint that implements it
  form one atomic feature surface; mark the generated client paths.

## Related

GIT-PR-02, GIT-PR-SIZE-01, GIT-PR-SIZE-03, GIT-PR-SIZE-04,
GIT-PR-TYPE-04
