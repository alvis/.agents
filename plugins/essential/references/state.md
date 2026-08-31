# State lifecycle

Read this contract before working on project state. Essential owns the typed
operational lifecycle; domain skills own task definitions and evidence. Lead
agents also read [truth.md](truth.md). Format and write invariants live in
[state-format.md](state-format.md).

## Resolve before reading or writing

Run the resolver from the target repository:

```bash
STATE_REFERENCE='<absolute injected state.md path>'
ESSENTIAL_ROOT="$(cd "$(dirname "$STATE_REFERENCE")/.." && pwd)"
"$ESSENTIAL_ROOT/scripts/resolve-state-workspace"
```

It selects an explicit `--work-id`, `STATE_WORK_ID`, a matching branch or jj
workspace, or the sole eligible work directory. On `work_id_required`, ask;
never guess. `durable_root` is the active source tree. `state_root` is the
default tree that carries the ignored `.state/`. `work_dir` is always
`state_root/.state/works/<work-id>/`.

`requires_ignore` stops every write until the main agent adds the returned
`.gitignore` rule. `migration_required` means legacy Markdown exists: runtime
readers and writers stop and direct the user to Doctor migration. They never
parse, rewrite, or silently combine Markdown with MDC. A resolved typed stream
returns `stateFile` and `stateFormat: "mdc-v1"`.

## Canonical operational state

The graph is rooted at `.state/overview.mdc` for a project and
`.state/works/<work-id>/state.mdc` for a stream. It includes
`environment.mdc`, `traps.mdc`, linked state detail, records, review, children,
and native artifacts. A stream whose `charterStatus` is not `absent` also has
`goal.mdc` and a typed source link to it; an `absent` bootstrap has neither.
Pending specification fields may live in a present charter and do not make the
charter absent. `lease.json`, migration
receipts, and native files under `artifacts/` remain in their existing formats.
See [state-format.md](state-format.md) for the complete topology and vocabulary.

Versioned durable knowledge remains under `docs/` in the active source tree.
`.state/` is an operational projection, not the record of record. Promote
accepted decisions, approved contracts, artifact identities, unresolved
critical risks, and reusable conclusions before retiring a stream.

## Ownership and lease

One main agent holds the on-disk coordinator lease and is the sole writer of
project roots, work roots, charter, working context, journal, revisions,
unresolved questions, overview records, and review roll-ups. Other agents read
validated state and return typed reconciliation deltas. Read [lease.md](lease.md)
before a coordinator write.

Every write is a lease-protected graph transaction: stage the complete changed
graph, decode and validate it with the shared codec, compare it with the current
graph, write children first, and write the root last as the commit point. A
failed transaction leaves the prior root authoritative. Append the event first
in the staged graph, then reconcile affected entities and project views in the
same transaction.

## Stream lifecycle

Work one `working` or `reviewing` stream at a time. `planned` and `working`
streams are continuable; blockers are independent of phase. Execution finishing
sets `reviewing`, with its submission recorded. `completed` requires observed
landing or acceptance plus durable-promotion dispositions. `archived` streams
live under `.state/archive/`. Read [stream-completion.md](stream-completion.md)
when settling work.

`goal.mdc` owns the charter and success criteria. `state.mdc` owns resumable
execution state and links to detail documents. Task status is history; validity
records whether its evidence still holds. Journal events are append-only and
plan/state revisions are monotonic. Never reopen a done task, rewrite an event,
or replace an accepted decision in place.

## Handover, takeover, and retirement

Handover refreshes selected typed graphs, reconciles `overview.mdc`, and
releases their leases. Takeover resolves and validates the same graphs before
routing runnable work or checking landing evidence. Neither command accepts
Markdown state; both return `migration_required` unchanged.

Continuity has one mechanism: the validated on-disk graph. Keep recoverable
copies of `.state/` outside the repository before it carries non-reconstructible
knowledge. Doctor checks recovery and owns approved migration and restore.
Retirement follows [retirement.md](retirement.md) and moves the complete graph
to `archive/`; it never deletes archived streams.

## Structural Doctor and outputs

Run Doctor before large dispatches, handover, migration, and retirement. It
checks schema, references, ownership, cycles, lifecycle invariants, leases, and
overview drift through the shared decoder. Strict failures stop irreversible or
release-critical work.

Artifact-writing skills return every generated or materially rewritten path.
The main agent performs the final output-manifest reconciliation; MDC files are
validated as graph documents, not measured by the legacy Markdown size gate.
