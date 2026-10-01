# Preserve completed work

Use this after [completion evidence](stream-completion.md) is recorded. Retrospectives describe finished work; [the singular event journal](../references/state-format.md#reading-state-and-definition-changes) records execution transitions. Neither replaces the other.

## Author the retrospective

Stage a regular UTF-8 file from [the journal template](../templates/journal.md). Record the delivered outcome, starting context, material changes and decisions, deviations, revision-bound validation, landing evidence, and owned follow-ups. Omit optional sections with no substantive content. Link authoritative decisions and durable artifacts instead of copying their contracts; use stable PR, commit, and document references that survive work-directory archival.

The front matter identifies the workstream, its primary codebase domain, start date, completion timestamp, and one-line outcome summary. Reuse an established domain where it fits; name it using [the slug convention](../references/naming.md#slugs). Use the completion timestamp recorded in the receipt, never the publication time. `summary` is a single-line scalar; double-quoted strings use JSON-compatible escaping. A retrospective is historical context, never current validity or a substitute for the completion receipt.

## Publish under the held lease

```bash
"$ESSENTIAL_ROOT/scripts/state-journals.ts" publish \
  --work-dir "$WORK_DIR" --token "$LEASE_TOKEN" \
  --summary-file "$RETROSPECTIVE_FILE"
```

The helper publishes the owned retrospective, rebuilds [the complete domain index and recent-history view](../references/overviews.md#completed-work-history), and returns `generated_files`. It reads existing retrospectives, not archived workstream directories. It leaves the overview's authored preamble, active stream rows, and pending questions intact. Completion and takeover use this same path; handover preserves its output.

An invalid lease, unsafe path, ambiguous overview section, malformed existing retrospective, or conflicting date/domain for an existing Work ID stops publication without discarding history. Retry the same input after an interrupted publication: the detailed record is written first, so the index and recent view can be recovered without creating another record. Preserve a conflicting record and report it rather than selecting a new filename.

Append the completion/publication event to the stream's singular journal, reconcile the affected tables and owned overview row, then [acknowledge the checkpoint](checkpoint.md). Publication is complete only when all three destinations agree. Preserve the retrospective and index when [retiring the stream](retirement.md); neither depends on retaining a live overview row.

<IMPORTANT>
This layout applies to new completions. Do not backfill existing completed or archived streams without an explicit migration request. A plural work-local `state/journals.md` is not a supported retrospective destination; preserve an existing file until an explicitly authorized migration has carried its content to the project history.
</IMPORTANT>
