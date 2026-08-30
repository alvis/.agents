---
name: takeover
description: Resume paused work from validated MDC state in the default source tree, reconcile current evidence, and route runnable work to its owner. Use when continuing an existing stream; migration, planning a new stream, implementation, publication, and landing remain with their owning workflows.
requirements:
  intelligence: medium
argument-hint: "[work-id]"
---

# Work Takeover

Resume one or more typed work graphs under the resolver's centralized
`state_root/.state/works/`. The graph, not the overview or prior conversation,
is the resumable authority.

## Boundaries

- Read and validate all candidate streams before offering work.
- Do not accept Markdown state. Preserve `migration_required` and route
  migration or restore to `essential:doctor`.
- Do not invent a stream, charter, task, owner, evidence, or source anchor.
- The main agent alone acquires a lease and writes reconciliation. Workers
  return typed deltas.
- Resume execution through the owning planning, implementation, review,
  publication, or specification skill; Takeover does not absorb those jobs.

## Inputs and state gate

An optional work ID selects an existing stream. Read the injected Essential
`references/state.md` lifecycle and run its resolver. Reading and
offering existing streams is allowed before a write gate; any write stops on
`work_id_required` or `requires_ignore`. `migration_required` stops all runtime
state use and reports the Doctor migration command. A selected stream must
resolve with `stateFormat: "mdc-v1"` and a `.mdc` `stateFile`.

`overview.mdc` is an index and may be absent or stale. The validated roots under
`works/` decide what can resume. Archived graphs are not candidates.

## Workflow

1. Enumerate every `works/<work-id>/state.mdc` root, or the named existing root.
   Load each through the shared codec and validator. Reject mixed schemas,
   escaping or symlinked paths, cycles, duplicate or dangling refs, cross-work
   ownership, and lifecycle violations; never continue from a partial model.
2. Classify decoded streams. `planned` and `working` are continuable;
   `reviewing` requires a landing or acceptance check; `completed` is not
   resumable; `archived` belongs outside `works/`. A blocker is independent of
   phase and must name its unblock condition and owner.
3. Read `overview.mdc` when present for project context and recorded workspace
   location, then reconcile every offered value against its stream root. Use
   the stream's repository anchors to locate the source tree and verify the
   revision it assumes. Report a missing or divergent checkout rather than
   moving history implicitly.
4. Read the decoded charter, specification locators, task DAG, continuation,
   events, revisions, unresolved questions, records, review, submission,
   completion, environment claims, and traps. Refresh a live external
   specification only through its owning sync workflow.
5. Re-evaluate evidence tied to changed inputs. Keep a done task terminal and
   mark its validity stale or unknown; create a new remediation task only
   through an approved plan revision. Derive runnable leaves from validated
   dependencies, requiredness, status, and validity. Never use visual block
   order or prose as the graph.
6. Present the exact stream, current phase and blocker, charter goal, current
   focus, runnable leaves, handback point, next action, next owner, source
   anchor, unresolved decisions, and evidence requiring recheck. Ask only when
   ambiguity materially changes routing.
7. After selection, the main agent ensures the stream lease and stages any
   reconciliation as a complete graph. Validate and commit it through
   `state-write`, children first and `state.mdc` last. Append events before
   reconciling views. A transaction failure leaves the old root authoritative.
8. Route the selected next action to its owning capability. Continue until the
   requested handoff is made or a named blocker remains. When execution later
   reaches review or completion, follow
   the injected Essential `references/stream-completion.md`; Takeover does
   not declare completion from passing tests or author assertion.

## Verification

- Every offered stream decoded and validated under `essential.state/v1`; none
  came from Markdown, an AST JSON document, archive, or a partial graph.
- The selected source checkout and revision agree with its recorded anchor or
  the divergence is an explicit blocker.
- Runnable work follows the task DAG; done history and append-only events were
  not rewritten; changed evidence affected validity only.
- Any reconciliation held the main-agent lease, advanced revisions
  monotonically, and committed the root last.
- The next owner received the charter, relevant refs, exact action, evidence,
  blocker or acceptance condition, and source paths without copied authority.

## Completion

Report each candidate and classification, the selected stream, validation and
lease status, source location and revision, blocker or runnable task, exact
next action and owner, and any `generated_files`. If nothing is resumable, say
so and identify whether the cause is absence, completion, invalid typed state,
or `migration_required`.
