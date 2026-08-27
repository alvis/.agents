# Final history, commit QA, and publication

Load only after execution has relevant dirty changes or saved unpushed changes,
the full review and usage trace pass against the current specification content,
work-local specification and provenance are current, and any completion-sync/revalidation loop is
stable. This is the first point at which final history work or publication is
allowed.

## Skip conditions

Return `stack_dispatch.dispatched=false` and the reason without loading a
history/publication owner when:

- mode is `VERIFY_ONLY`, `DRAFT_THEN_ASK`, `REFUSE`, or `FLAG_MISMATCH`;
- `--dry-run` is set;
- public `--defer-publication` is set (return finalization/publication as next
  actions); or
- both `relevant_dirty_paths` and saved unpushed `local_commits` are empty.

Do not skip merely because `local_commits` is empty when relevant dirty changes
exist; those bytes still require an owned save before finalization.

## Record and normalize history state

Inspect the exact implementation scope against immutable `base_rev` and record
`history_state` as `dirty`, `saved`, or `none`, including
`relevant_dirty_paths`, saved change/commit ids, and whether any candidate is
already published. Exclude unrelated user-owned dirty paths; if the relevant
set cannot be isolated safely, stop `blocked_scope` with the ambiguity rather
than capturing unrelated work.

When state is `dirty`, require the parent-provided immutable
`scoped_save_manifest` path and SHA-256. Its full publication scope includes all
lifecycle-generated source, test, project-documentation, active-work
specification/provenance, and deletion paths intended for publication; its
selected set is exactly the currently dirty subset. It excludes ignored work
state and inventories every unrelated dirty path for before/after preservation.
A missing, stale, incomplete, or ambiguous manifest is `blocked_scope`, not
permission to fall back to an unscoped save.

## Recheck the semantic gate

Require the current specification content to match the reviewed specification
content (confirmed by direct comparison), all
required review/usage results to pass, and completion sync to have no pending
`needs_revalidation`. A correction or source change invalidates this gate and
returns to the owning earlier lifecycle step.

## Classify the change

Compute aggregate changed-file count, LOC delta, and domains touched against
immutable `base_rev`, including relevant worktree bytes as well as saved
changes. Detect an open stack from explicit saved change/bookmark metadata.
Classify:

- **Large change**: more than 5 changed files, more than 300 changed LOC, or
  multiple loosely coupled domains. Propose an approved slice plan.
- **Semantic restack**: an open stack exists and this work changes a symbol,
  behavior, schema, or contract that an earlier PR establishes or consumes.
  Incidental file overlap is not enough.
- **Single change**: neither trigger applies.

Surface the reason, proposed history shape, and publication target before
mutation. History commands remain with Coding owners.

## Owner handoffs

1. When relevant dirty paths exist, invoke
   `coding:commit --paths-from=<scoped_save_manifest> --manifest-sha256=<sha256>`
   first (and supply the approved slice plan for a large change) so it saves
   only the closed manifest selection. Require its PASS receipt to prove the
   saved diff equals the selected paths and every non-selected dirty worktree
   byte plus staged/unstaged status entry is unchanged. Record the saved change
   ids before continuing. A checksum/path/state mismatch returns to the parent
   for a fresh post-review manifest; it never broadens the selection. When the
   relevant tree was already clean, invoke plain `coding:commit` only when a
   large-change split or semantic-restack reorder/correction is required. Never use
   the `--create-pr` compatibility shortcut because it would cross the commit
   finalization gate.
2. Invoke `coding:finalize-commits` without `--auto-push` for the complete
   unpushed chain, including a single-change chain. Require every isolated
   commit install/lint/test-or-coverage/build gate and message/order check to be
   green. If a correction changes code, history, or the reviewed contract,
   return through the invalidated implementation/review/sync gates before
   finalizing again.
3. Only after finalization is green, invoke `coding:pr create` once with the exact
   saved change or ordered stack and optional branch prefix. It owns bookmarks,
   bottom-up publication/restacking, PR text, and CI convergence.

```yaml
stack_dispatch:
  dispatched: true|false
  classification: large|semantic_restack|single|null
  reviewed_spec_revision: ''
  local_history: {owner: coding:commit, state: dirty|saved|none, relevant_dirty_paths: [], scoped_save_manifest: null, manifest_sha256: null, preservation_receipt: null, changes: [], save_status: completed|not_needed|blocked_scope}
  finalization: {owner: coding:finalize-commits, status: pass|fail|not_run}
  publication: {owner: coding:pr create, status: completed|partial|not_run, prs: []}
next_actions: []
```

A failed/partial handoff makes the parent result partial and cannot be reported
as publication convergence.
