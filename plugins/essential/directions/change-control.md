# Change control during execution

Read this when a mid-execution finding may change how, what, or why work is
being executed. Plans change during execution — a new restriction surfaces, a
design or specification issue is found, a premise fails. That is the normal
path, not an exception, and it follows one procedure:

1. **Journal the finding.** Append one line to `state/journal.md` and record
   the detail in `state/discovery.md` (or `state/unresolved.md` when it is an
   open question with an owner).
2. **Classify the impact and route it.**
   - **Task-local** — the finding changes how one task is executed, not what
     it is. Record evidence and a retry or disposition on the row. No
     revision.
   - **Plan-level** — task definitions, dependencies, requiredness, or
     acceptance must change. Raise a `proposals/` child (`open`), get user
     approval, then apply the revision: bump `Plan revision: N+1`, append the
     entry to `state/revisions.md` (what changed, why, approver, triggering
     spec base-id when one exists), tombstone removed scope as `cancelled`,
     and reconcile downstream rows per the DAG and roll-up rules in the
     work-state contract.
   - **Spec-level** — the canonical specification itself is wrong or
     incomplete. Raise a specification-change proposal; the source owner
     authors the change and completes it through
     `sync-spec complete --stage=specification`, establishing a new base;
     materialize that base; run the revalidation sweep (mark non-done
     dependent rows `! blocked` with `unblock: revalidate against <base-id>`,
     append `validity: stale (revalidate against <base-id>)` to affected done
     rows with remediation tasks for invalidated closure, re-check `goal.md`
     success criteria, journal the sweep); only then revise the plan. A
     spec-level change is never applied to the plan first — the canonical
     specification leads and the plan follows the new base.
3. **Resume from the registry.** After the route completes, re-read the state
   files directly and proceed on runnable tasks; stale in-flight work on a
   disproved premise is stopped, not finished for completeness.
