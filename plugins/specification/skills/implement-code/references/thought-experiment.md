# Usage-trace gate

Run after alignment review for landed code-producing modes; skip dry-run, verify-only, draft-required, mismatch, refusal, or no-commit runs.

Dispatch one read-only high-capability reviewer. Provide exact work-spec paths and headings from the materialization receipt, repository path, landed commits, and relevant work-local change children. Never enumerate by filename pattern or refetch Notion.

For every externally observable usage/example/scenario/verification case:

1. Trace imports, calls, return shapes, errors, and async boundaries through landed code.
2. Check public signatures and dependency composition.
3. Confirm every material departure is absorbed by the usage.
4. Cross-check adjacent usages for contradictory assumptions.

Return `works`, `broken`, or `unclear` per usage with concise reasoning and a code citation for breakage. Overall status is `pass`, `fail`, or `partial`. A failure becomes a work-local change child with blocking disposition and main-agent state/index reconciliation; it never appends a root deviations log.

```yaml
status: pass|partial|fail
usages:
  - {id: U-1, description: '', verdict: works|broken|unclear, trace: '', cite: null}
departures_absorbed: true|false
summary: ''
```
