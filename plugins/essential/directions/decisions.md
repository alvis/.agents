# Work-local decisions

Read this when creating, accepting, superseding, or dispositioning a work-local decision. Use [the decision template](../templates/state/decisions/decision.md) for record metadata and inline authoring prompts; [overviews](../references/overviews.md) owns `decisions.md` reconciliation. Durable ADRs use [ADR authoring](adr-authoring.md) and [ADR supersession](adr-supersession.md).

## Record and supersede

The main agent writes decision children under the resolved work root and reconciles their overview and affected tasks under the [state lease](lease.md). A subagent returns proposed content, paths, and reconciliation deltas; it never writes `.state/`.

Never edit an accepted decision into its replacement. Create a successor naming the predecessor in `supersedes`; preserve the predecessor's content, change its status to `superseded`, and add a forward link to the successor.

## Blast-radius sweep on acceptance

When the user accepts a decision, the main agent runs one sweep before any further dispatch:

1. Walk `affects` and `invalidates`. On each `✓ done` task row or recorded evidence, append `validity: stale (<decision-id>)` — never change the mark or status. Mark affected nonterminal dependent rows `! blocked` with `unblock: revalidate against <decision-id>`; preserve terminal `↪ superseded` and `⊘ cancelled` history under the [work-state contract](../references/state-format.md).
2. Add remediation tasks (new IDs) only for invalidated closure that must be redone; `preserves` entries need no action.
3. Journal one `sweep` line naming the decision, the ids touched, and the evidence invalidated.

## Completion gate

Work closes and retires only after every `accepted` decision has an explicit disposition, recorded in the stream's final `changes/` child alongside the promotion receipt:

| Question | Disposition |
| --- | --- |
| Constrains future architecture? | Promote to an ADR |
| Affects future product behavior? | Promote to a product decision record |
| Affects future creative/production work? | Promote to a production decision record |
| Only how this task was executed? | Retain in the work receipt |
| Temporary and expired? | Archive with the expiration reason |

A promoted record carries the [promotion front matter](retirement.md#promotion).
