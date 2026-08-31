# Change control during execution

Read this when a mid-execution finding may change how, what, or why work is
being executed. Plans change during execution — a new restriction surfaces, a
design or specification issue is found, a premise fails. That is the normal
path, not an exception, and it follows one procedure:

1. **Record the finding.** Append a typed `state.event` to
   `state/journal.mdc`. Attach detailed evidence to the affected task or
   record; an unresolved operator question becomes a `state.question` in
   `state/unresolved.mdc` with an owner and waiting timestamp.
2. **Classify the impact and route it.**
   - **Task-local** — the finding changes how one task is executed, not what
     it is. Record evidence and a retry or disposition on the task. No
     revision.
   - **Plan-level** — task definitions, dependencies, requiredness, or
     acceptance must change. Raise an open `state.record` of kind `proposal`,
     get user approval, then apply the revision: increment `planRevision`, add
     exactly one matching approved `state.revision` to `state/revisions.mdc`,
     and append one `revision` event whose subject is that revision and whose
     evidence identifies the approval. Task refs remain immutable: tombstone
     removed optional scope as cancelled rather than deleting or replacing its
     ref, then reconcile the dependency closure under the graph contract.
   - **Charter-level** — goal, requirements, boundary, success criteria,
     specification provenance, or anchors change. Obtain user approval,
     increment `charterRevision` exactly once in both stream and charter, add
     the matching approved charter revision, and bind it to one evidenced
     `revision` event. A plan revision cannot authorize a charter change.
   - **Spec-level** — the canonical specification itself is wrong or
     incomplete. Raise a specification-change proposal; the source owner
     authors the change and completes it through
     `sync-spec complete --stage=specification`, establishing a new base;
     materialize that base; run the revalidation sweep (mark non-done
     dependent tasks blocked with `unblock: revalidate against <base-id>`, add
     stale validity to affected done tasks with remediation tasks for
     invalidated closure, re-check the charter's success criteria, and append
     a `sweep` event); only then revise the plan. A
     spec-level change is never applied to the plan first — the canonical
     specification leads and the plan follows the new base.
3. **Publish and resume.** Validate the staged reachable graph, write changed
   children before `state.mdc`, then reload the root and proceed on runnable
   tasks. Stale in-flight work on a disproved premise is stopped.
