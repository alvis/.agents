# GIT-PR-TYPE-05: Submit Only Durable Source and Package Lockfiles

## Severity

error

## Intent

Every submitted file serves a durable purpose: production code, tests, configuration, documentation, skills, templates, or static assets. Temporary files and generated artifacts do not ship; package lockfiles are the only generated-artifact exception.

## Scan

Inspect every changed path and its purpose in the head revision, including files the classifier does not recognize as generated. Report temporary files, files without a durable purpose, and generated artifacts other than package lockfiles. Deleting a prohibited artifact is compliant.

Compare the classifier's generated paths with the diff and Generated Files section. The message scanner checks path evidence, not whether a changed path survives in the head; semantic review owns the prohibition and deletion check.

## Fix

Remove prohibited artifacts from the submitted head. Keep generated output in ignored build/cache locations and retain its source or generator when needed. Keep package lockfiles with the change that needs them. In Generated Files, name each changed generated path and its source or generator; identify deleted artifacts as removed so cleanup is distinguishable from shipped output.

## Edge Cases

- A file maintained and reviewed as source is authored even if a tool originally created it. Manually maintained manifests and projections qualify.
- Generated snapshots, clients, bundles, and reports remain prohibited even when coupled to the feature or useful to a reviewer; use reproducible checks and external review evidence instead.
- Package lockfiles contribute no authored lines under `GIT-PR-SIZE-01`; that sizing exclusion is not permission to ship any other generated artifact.

## Related

GIT-PR-02, GIT-PR-SIZE-01, GIT-PR-SIZE-03, GIT-PR-SIZE-04, GIT-PR-TYPE-04
