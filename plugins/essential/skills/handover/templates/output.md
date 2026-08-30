# Handover output

```text
handover: <complete|blocked>
state_root: <absolute default-tree path>
overview_path: <absolute .state/overview.mdc path>
streams:
  - work_id: <id>
    phase: <planned|working|reviewing|completed>
    classification: <continuable|awaiting-landing|index-only>
    blocker: <ref or none>
    next_action: <sentence or none>
    source_anchor: <locator>
    state_revision: <number>
    plan_revision: <number>
    lease: <released|contended|failed>
    state_file: <absolute state.mdc path>
validation: <passed|failed>
generated_files: [<absolute materially rewritten .mdc paths>]
```

On `blocked`, include the exact resolver status, validation errors, lease owner,
or transaction failure and list only files actually committed. Never report a
staged path as generated output.
