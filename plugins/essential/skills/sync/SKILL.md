---
name: sync
description: "Write the outcome of finished work back to the external systems it came from: move each linked Linear, Jira, Notion, or other tracker task to its new status with any deviations, and update linked design documents to match what shipped. Use after a PR merges, at session end, or when asked to sync, update the ticket, or close the loop."
requirements:
  model: capable
  effort: deliberate
---

# Sync

Close the loop between delivered work and the external systems that described it. A PR or issue names its sources in fixed places: Context opens with the task it came from, Specification lists the governing spec first and then its ADRs and design documents, and Related lists everything else (`coding:skills/pr/templates/message.md` and `coding:skills/issue/templates/body.md` own those forms). Sync reads those links, works out what each external record should now say, and writes it through a connector the harness provides.

## Boundaries

- Use for: updating external task status and recording deviations after delivery; bringing an external design document in line with shipped behavior; retrying items an earlier run left pending.
- Do not use for: GitHub issues and discussions, which close through the PR's Development links that `coding:pr` sets; any governing specification, which `essential:references/state-systems.md` routes to its owning specification workflow (`specification:sync-spec` when installed); creating tasks or documents; reverting a task when a PR closes unmerged, which stays the user's decision.
- Only the main agent holding the work's lease runs this skill, because it writes external systems and `.state/` under `essential:references/state-systems.md`. A subagent never runs it; the lease holder runs it when it reconciles the subagent's merge evidence.
- Never invent a reference. A record sync cannot reach or identify is reported, never guessed.

## Inputs

- Optional: one or more locations, each one of:
  - a work directory or Work ID — expands to every delivery its state records (PR URLs in `state.md`, `state/pr-monitor.md`, and `changes/`) plus `goal.md` specification provenance;
  - a PR number or URL — that PR, plus the other members of its stack when it has one; when a work's `state.md` or `state/pr-monitor.md` under `.state/works/` records the PR, it belongs to that work and step 1's lease check applies;
  - an issue number or URL — the references its body lists, judged by the state of the PRs linked to resolve it; with no such PR, plan no status change;
  - an external task or document URL — that record alone, paired with the deliveries in scope that reference it.
- Default: every work and delivery this session created, updated, or merged, from conversation context and the work streams whose lease this session holds. With none, report that nothing is in scope and stop.
- `--dry-run`: plan, render, and report every write as `planned` without performing any, and write no receipt or journal line.

## Workflow

1. **Hold the lease.** For each in-scope work, confirm this session holds its main-agent lease under `essential:directions/lease.md` before any external write. Report a work whose lease is held elsewhere as `pending: lease` and write nothing for it; its lease holder syncs it. A PR with no work stream syncs, and its receipt rows go in the final report instead of `state/sync.md`.
2. **Collect references.** For each delivery, read its current body and state through REST so the read also works where GitHub's GraphQL API is blocked: `gh api repos/<owner>/<repo>/pulls/<n> --jq '{body,state,draft,merged_at,html_url}'` or `gh api repos/<owner>/<repo>/issues/<n> --jq '{body,state,html_url}'`. Extract links from Context, Specification, Related, and an issue's Expected Behavior, recording the section each came from. Add the work's `goal.md` canonical specification. Deduplicate by URL; keep every delivery that cites each URL.
3. **Classify each reference.**
   - GitHub issue, discussion, or ADR permalink — skip; GitHub owns its status and the ADR is versioned with the code.
   - Governing specification — the first link of any Specification section or Expected Behavior, and the work's `goal.md` canonical specification — route to its specification workflow and record `routed`; never edit it here.
   - Source task — the tracker record (Linear issue, Jira issue, Notion database page with a status property, Asana task) that Context opens with; the work came from it, so sync owns its status.
   - Cited task — any other tracker record, including a later link in Context; sync comments on it and proposes a status change only for the user's approval on the step 9 board.
   - External document — any other external page in Specification, Expected Behavior, or Related (Notion page, Confluence page, Google Doc, a team wiki). When its title, host, and citing context already show this change could not have made it wrong, record `skipped: not affected` with the reason and bind no connector for it; otherwise step 6 decides after reading it. Never skip here a record whose kind is known only after reading it.
4. **Bind a connector per host** under [connectors.md](directions/connectors.md). Queue every reference whose host has no connector that can read and write it; continue with the rest.
5. **Plan task writes.** For each source task, map the deliveries in scope to the tracker's own workflow, read live from the task:
   - every delivery the work records is merged → its completed state; a merged layer of a stack whose other layers are open counts as in review, not complete;
   - any ready for review → its in-review state, or in-progress when none exists;
   - any draft → its in-progress state;
   - a closed-unmerged delivery plans no status change.

   For each cited task, read it and judge whether the merged deliveries finish it, advance it, or leave its status alone; plan a status change only when they do, and hold it for approval in step 9. Before completing any task, look for other open PRs that cite it — the PRs the tracker links when the connector shows them, and `gh api -X GET search/issues -f q='"<task URL>" is:pr is:open'` — and use the in-review state when any is found. Never move a task backwards or out of a completed or cancelled state. For every source and cited task with at least one merged delivery, draft its one sync comment from [deviation-comment.md](templates/deviation-comment.md), sourcing deviations from each merged PR's Additional Notes, the work's `changes/` departures, and plan revisions in `state/revisions.md`. Draft no comment while nothing has merged.
6. **Plan document writes.** For each external document, read it in full, record its revision or last-edited time, and compare each claim about behavior, interfaces, or decisions with the merged change. Decide whether it needs an update at all; record `skipped: not affected` with the reason when it does not. Draft section-level edits only where the document now contradicts what shipped; leave intent, history, and unaffected sections alone. Plan nothing for a document while no citing delivery has merged.
7. **Check prior receipts.** Read `state/sync.md` in each in-scope work and drop a planned write it already records as `written` or `skipped: declined`, where a row matches only when its Reference, Action (including any target status), and Delivery all match; retry the rest. Search each task's comments for its marker. An existing sync comment is edited, never duplicated: keep the deliveries, deviations, and follow-ups it already lists, add the new ones, and rewrite its outcome sentence so it still covers what every listed delivery made work. When the connector cannot edit comments, post a new comment only for a newly merged delivery, carrying the same marker.
8. **Write tasks.** Unless `--dry-run`, re-read each task, re-plan any whose status changed since step 5, then apply the source task's status change and post or edit each comment. Read the task back, confirm the comment kept its marker (switch to the template's plain marker when it did not), and append its receipt row before the next write. The source task's status and every comment go out without a preview because each reflects delivered work and is reversible.
9. **Approve cited-task moves and document edits.** Present them on one `essential:discover` board: per cited task, its current and proposed status with the delivered behavior that justifies the move and the open PRs step 5 found citing it; per document, a `diff` of current text against the proposed text and the shipped behavior that drives each change; each with an approve/change decision. Offer decline alongside approve for a cited-task move; record a declined move as `skipped: declined`, which step 7 honors in later runs. Before applying an approved move, re-read the task and rerun the open-PR search; when its status changed since the board, or the move completes the task and the search finds an open citing PR the board did not show, record `pending: approval (task changed)` and propose it again in the next run. Otherwise apply it, read it back, and append its receipt row. Before writing an approved edit, re-read the document; when its revision changed since step 6, record `pending: approval (document changed)` and plan it again in the next run instead of writing. Read each written document back and append its receipt row. A `--dry-run` renders the board, applies no decision, and continues to step 10.
10. **Ask for missing connectors.** Ask once, through the harness's question tool under `essential:directions/questions.md`, covering every queued host: what could not be synced, and how to install that system's connector. Offer: installed and retry now; leave pending for the next sync; update by hand. Retry only after the user reports the install.
11. **Close the run.** Unless `--dry-run`, append one `sync` journal line per work through `state-write` under the lease.

When no user is present to answer — a monitor wake, or a run between user turns — skip steps 9 and 10: record those items as `pending: approval` or `pending: connector` and present them at the user's next turn. A pending item never blocks the caller.

<IMPORTANT>
- Never write an external document without the user's approval on the board, or over a revision newer than the one the user approved. Never write a governing specification from this skill.
- Never post a second sync comment on a task when the connector can edit the existing one. Write nothing for a record that failed to read.
- Never change the status of a task other than the source task Context opens with unless the user approved that move on the board, from the status the task still has.
</IMPORTANT>

## Receipt

`state/sync.md` holds one table, newest last, with one row per run for each write — status, comment, or document edit — and for each in-scope reference with no planned write (skipped, routed, pending, or failed), so a later run can resume and skip finished writes:

```markdown
| At | Reference | System | Delivery | Action | Result | Read-back |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-11T12:30Z | [ENG-412](https://linear.app/acme/issue/ENG-412) | Linear | #412 | status → Done | written | Done |
| 2026-11-11T12:30Z | [ENG-412](https://linear.app/acme/issue/ENG-412) | Linear | #412 | comment | written | comment id 7f3c |
| 2026-11-11T12:31Z | [Retry design](https://www.notion.so/acme/Retry-design-1a2b3c) | Notion | #412 | 2 section edits | pending: approval | — |
```

`Result` is one of `written`, `skipped: <reason>`, `routed: <owner>`, `pending: connector|approval|approval (document changed)|approval (task changed)|lease|user`, or `failed: <cause>`; a `--dry-run` reports `planned` in place of a write's result and records no row.

## Verification

- Every written record was read back and matches its planned state; a mismatch is `failed`, never `written`.
- Every row the [Receipt](#receipt) section requires was written exactly once; a `--dry-run` instead wrote nothing and reported each planned write as `planned`.
- No GitHub-native record or governing specification was written, and every cited task's status change traces to an approved board decision over the status it changed from.
- Every document write traces to an approved board decision over the revision that was written.

## Completion

Report, per reference: system, planned action, result, and read-back; then the pending items with what unblocks each, and the board path when one was rendered. Unless `--dry-run`, return `state/sync.md` and the journal in `generated_files`.
