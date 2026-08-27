# Decision causality

Read this when creating, accepting, or superseding a `decisions/` child or a
durable decision record. It extends the decision statuses
(`proposed|accepted|rejected|superseded`) with causal metadata and the sweep
that keeps execution state honest after a decision changes.

## Causality metadata

Every decision child records, beyond status/headline/owner/created/provenance:

- `supersedes:` the decision id it replaces, when any. For work-local decision
  children, the superseded record keeps its content and gains status
  `superseded` plus a forward link. Durable ADRs use the separate
  [ADR contract](adr.md): the old file moves to `decisions/superseded/` and the
  new ADR does not mention it.
- `affects:` task IDs, docs, or streams whose direction this decision sets.
- `invalidates:` completed outputs, evidence, or approvals this decision makes
  stale, each named by id and exact revision or hash.
- `preserves:` prior outputs or approvals that explicitly remain current.
- `effective_from:` ISO-8601 date, when acceptance and effect differ.

Empty fields are omitted, not written as placeholders.

## Blast-radius sweep on acceptance

When the user accepts a decision, the main agent runs one sweep before any
further dispatch:

1. Walk `affects` and `invalidates`. On each `✓ done` task row or recorded
   evidence, append `validity: stale (<decision-id>)` — never change the mark
   or status. Mark non-done dependent rows `! blocked` with
   `unblock: revalidate against <decision-id>`.
2. Add remediation tasks (new IDs) only for invalidated closure that must be
   redone; `preserves` entries need no action.
3. Journal one `sweep` line naming the decision, the ids touched, and the
   evidence invalidated.

## Completion gate

Work closes and retires only after every `accepted` decision has an explicit
disposition, recorded in the stream's final `changes/` child alongside the
promotion receipt:

| Question | Disposition |
| --- | --- |
| Constrains future architecture? | Promote to an ADR |
| Affects future product behavior? | Promote to a product decision record |
| Affects future creative/production work? | Promote to a production decision record |
| Only how this task was executed? | Retain in the work receipt |
| Temporary and expired? | Archive with the expiration reason |

A promoted record carries the standard promotion front matter. A superseded
work-local decision is never edited into its replacement; an ADR follows
[the ADR contract](adr.md), including its archive header and current-only
index.
