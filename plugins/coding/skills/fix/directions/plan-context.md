# Contract pinning for post-review fixes

When fixing a `coding:review-code` finding, pin the identical task contract so
the rerun produces comparable alignment verdicts.

1. Read the work item's `state.md` (and any `state/*.md` children) directly.
2. From the task table, determine `plan_source: state.md` and the applicable
   full task IDs.
3. Treat an explicit `--plan`, review-returned plan identity, or mission-capsule
   identity as an assertion. Reject any mismatch; none may override state.
4. Read root state in full and use the review finding plus linked authoritative
   spec/design as the behavior contract. Follow an explicit
   `state/plan.md` link only for procedure keyed by existing
   task IDs; reject any duplicate or conflicting ID, edge, requiredness,
   target, or acceptance mapping.

Never discover a root-level fallback or guess among `state/` children. Send the
root-state path, work ID/root, full task ID, finding ID, and relevant
spec/design paths to every fix subtask. Carry them unchanged into the attempt
result and follow-up review invocation. If the plan definition changed (a
re-read of `state.md` shows a different task definition, dependency,
requiredness, target, or acceptance mapping), return `needs_revalidation` with
the affected task IDs and downstream closure rather than applying a stale fix.
