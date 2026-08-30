---
area: <alignment|correctness|security|quality|testing|docs|style>
prefix: <ALIGN|CORR|SEC|QUAL|TEST|DOCS|STYL>
reviewed_at: <ISO-8601 timestamp>
files_reviewed_count: <N>
plan_source: state.md
reviewed_task_ids: [<full task IDs>]
reviewed_task_defs: {<full task ID>: '<immutable definition this area reviewed: summary [targets] | required=<yes|no> | acceptance=<criterion>>'}
closed_findings: <N>
outstanding_findings: <N>
---

`reviewed_task_defs` binds each reviewed task ID to the exact immutable
definition (summary, targets, requiredness, acceptance) this area was reviewed
against. IDs alone cannot prove the contract held: on a partial rerun the
aggregator compares this binding against the current `state.md` and treats an
area whose task kept its ID but changed definition as stale, not clean.

# <Area> review

**Verdict**: <pass|pass_with_suggestions|requires_changes|fail> — outstanding P0:<n> P1:<n> P2:<n> P3:<n>

## Headline

<One or two evidence-backed sentences. Use `_No issues found._` for a clean
area.>

## Findings

### <PREFIX>-P<n>-<seq>: <one-line summary>

- **Status**: <open|fixed|acknowledged|deferred|skipped>
- **Source**: `<path:line>`
- **Issue**: <semantic concern and impact>
- **Evidence**: <representative snippet, command, contract, or runtime result>
- **Direction**: <actionable correction or disposition direction>
- **Rationale**: <why this current disposition is justified>
- **Owner**: <person or durable owning task/team>
- **Recheck condition**: <specific event, date, revision, or evidence that
  requires this finding to be reviewed again>
- **Risk acceptance**: <P0/P1 acknowledged/skipped authority and durable
  evidence; otherwise `not required`>

Status requirements:

- `open` means unresolved action is required. Keep the correction direction,
  accountable owner, and concrete recheck condition current; rationale states
  why it remains open.
- `fixed` is closed only when the correction has been applied and rechecked.
  Record the closing revision and verification evidence; `Owner` may be
  `closed` and risk acceptance is not required.
- `acknowledged` and `skipped` are closed non-fixed risk dispositions only with
  non-placeholder rationale, accountable owner, and concrete recheck
  condition. P0/P1 additionally require explicit risk-acceptance authority and
  durable acceptance evidence. Without these fields they remain outstanding.
- `deferred` remains outstanding and blocks review closure. Retain its priority,
  accountable owner, deadline, rationale, and recheck condition.

## Pending decisions

Include only open or deferred findings whose direction cannot be chosen from the contract.
For each, repeat its stable ID, options/tradeoffs, recommendation, owner, and
decision deadline. Remove the entry when decided and update the finding status.

On rerun, retain stable IDs for matching findings, update status rather than
duplicating them, recompute the verdict from all outstanding findings, and
preserve fixed/acknowledged/skipped entries as concise history. Reject a
malformed closed risk disposition and redispatch it to the owning reviewer;
until repaired, count it as outstanding. Deferred findings keep their priority,
owner, deadline, and recheck condition and remain outstanding in the roll-up.
