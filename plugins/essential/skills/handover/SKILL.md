---
name: handover
description: Persist validated MDC work-stream graphs and reconcile the project overview in the default source tree so a later session can resume safely. Use when pausing work; this skill records continuity and does not execute, publish, review, test, or land the work.
requirements:
  intelligence: low
argument-hint: "[work-id-filter]"
---

# Work Handover

Pause work by transactionally refreshing typed state under the resolver's
`state_root/.state/` and reconciling `overview.mdc`. `essential:takeover` owns
resumption.

## Boundaries

- Only the main agent runs this workflow and holds each selected stream lease.
- Write only selected `.state/works/<work-id>/**/*.mdc` graphs and the shared
  `.state/overview.mdc`. Native `lease.json` remains JSON.
- Do not implement, build, test, review, publish, promote, or mutate history.
- Do not read or write Markdown state. Report `migration_required` and direct
  the user to `essential:doctor` migration.
- A long report is shortened to graph pointers; it never creates another
  continuation file.

## Inputs and gate

An optional work-ID filter narrows continuable streams; it never creates one.
Read the injected Essential `references/state.md` lifecycle, run its resolver,
and stop on `work_id_required`, `requires_ignore`, or `migration_required`.
Use its `state_root`, `work_dir`, `stateFile`, and `stateFormat`. Require
`stateFormat: "mdc-v1"` before proceeding.

Acquire or renew each selected stream lease with the idempotent `state-lease
ensure` verb. A live foreign lease stops that stream. Follow the injected
Essential `references/lease.md` contract and release every lease after its graph
and the overview commit or after a handled failure.

## Workflow

1. Enumerate every typed stream root under `state_root/.state/works/` and load
   it through the shared state decoder and validator. Never infer state from
   filenames or visible MDC prose. Classify `planned` and `working` as
   continuable, `reviewing` as awaiting landing, and `completed` as index-only.
   Archived streams are outside `works/`.
2. Apply the optional filter to continuable streams. For each selected stream,
   read its decoded charter, task graph, events, revisions, unresolved
   questions, records, review, submission, completion, and continuation. Treat
   repository evidence as stronger than stale continuation prose.
3. Reconcile returned worker deltas. Preserve task IDs and definitions, append
   typed events, keep revisions monotonic, keep done terminal, update validity
   separately, and refresh review/submission/completion only from exact
   evidence. Resolve every discrepancy before writing.
4. Set continuation to the current focus, handback point, exact next action,
   next owner, source anchor, and fast relative graph paths. Keep historical
   detail in events and records rather than copying it into continuation.
5. Build the complete changed graph in a collision-safe staging directory.
   Decode and validate it with the shared codec, then invoke the lease-verified
   `state-write` path with that staged directory. It compares immutable refs,
   definitions, append-only events, terminal statuses, and revisions; writes
   children first; and writes `state.mdc` last.
6. Re-read `overview.mdc`, reconcile every live stream row from validated roots,
   and commit it last through the same validated project-graph path. Preserve
   authored project identity and requirements. Environment and traps remain in
   their linked documents.
7. Release leases and return every materially rewritten path in
   `generated_files`.

## Verification

- Every selected root and the final project root decode and validate under
  `essential.state/v1`.
- State and plan revisions are monotonic; events are append-only; refs and task
  definitions are immutable; done tasks remain done.
- Continuation names a source anchor, owner, handback point, and next action.
- `overview.mdc` agrees with every live stream and no unselected stream graph
  changed.
- Root documents were committed last; a failed write left the previous graph
  authoritative.
- No Markdown state, source code, durable docs, history, or remote system was
  changed.

## Completion

Use [templates/output.md](templates/output.md) with the returned `.mdc` paths.
Report each stream classification, blocker and next
action, source anchor, revisions, lease disposition, `overview.mdc`, and
`generated_files`. `handover: blocked` names the exact resolver, validation,
lease, or transaction failure.
