# Coordinator lease and graph publication

Read this before coordinator writes. The core lifecycle owns the single-writer
rule; this reference owns lease and root-last publication mechanics.

## Holding the lease

The lease remains `works/<work-id>/lease.json` and is operated by
`"$ESSENTIAL_ROOT/scripts/state-lease"`. Before the first coordinator write,
run `ensure`. It acquires a free lease, heartbeats one this session already
holds, and revives an expired lease still owned by this session.

- `contended`: a live foreign coordinator owns the stream; stop without writing.
- `takeover_required`: another coordinator's lease expired; use the explicit
  `takeover` verb and append its payload as a typed `lease` event.

Keep the returned plaintext token in session context. `lease.json` stores only
its digest, so reading the file never confers ownership.

## First-use bootstrap

After the PM completes
[establish-work-stream.md](directions/establish-work-stream.md) and the resolver
returns `resolved` with `state_ignored: true`, invoke:

```bash
"$ESSENTIAL_ROOT/scripts/resolve-state-workspace" \
  --work-id=<confirmed-work-id> --bootstrap
```

Bootstrap never selects or creates an identity. It creates missing MDC graph
files with no-clobber semantics: `goal.mdc`, `state.mdc`, `state/working.mdc`,
and `state/journal.mdc`, plus their directories. The first successful
`state-lease ensure` creates `lease.json`; bootstrap does not synthesize an
unowned lease record. It refuses
symlinks and non-regular components. Initial documents use
`essential.state/v1`, revision counters at `1`, stable refs derived from the
confirmed project/work IDs, and root-declared source links. The resolver
returns exact created and preserved paths; the PM adds created paths to
`generated_files`.

Legacy `overview.md`, `goal.md`, or work `state.md` yields
`migration_required`. Bootstrap never overlays MDC files on legacy state.

## Publishing a coordinator change

Stage the intended graph outside its authoritative paths, then use the shared
codec to load, decode, validate, and normalize it before any publication. The
comparison with the previously validated graph must reject append-only event
mutation, revision regression or gaps, duplicate/replaced refs, reopened done
tasks, and definition changes without an approved revision. A transaction
changes `stateRevision` by exactly one. `planRevision` remains unchanged for
status, evidence, validity, review, and submission writes; it increases by
exactly one only when immutable task-definition fields change. `charterRevision`
follows the same rule independently for every charter field, and must equal the
linked charter's revision. Each increase requires exactly one matching approved
revision and one causally bound revision event with approval evidence. Every
state revision appends an event at that revision. Accepted records remain by ref
with immutable body and causality; only documented supersession transitions and
new successor records may advance their history.

After validation:

1. Append the new event and reconcile affected entities in the staged graph.
2. Increase `Stream.stateRevision` once for the transaction.
3. Pass the complete staged graph to the lease-verified `state-write` path.
4. Let its transaction publish changed linked children, then replace the stream
   `state.mdc` root last as the commit point.
5. When project membership or a derived overview fact changed, stage and
   validate the project graph, then replace `overview.mdc` last.

A reader follows only root-declared sources, so failure before a root
replacement leaves the previous graph authoritative. Never publish a root that
names an unwritten child, mutate an undeclared `.mdc` file in place, or render a
partially valid graph.

Release the lease at handover, retirement, and session end. The default TTL is
30 minutes because it bounds abandoned ownership while normal `state-write`
calls heartbeat automatically.
