# Backlog

Read this when work surfaces an issue outside its goal, and when that work lands. [Working attitude](../references/working-attitude.md#stay-on-the-goal) owns the focus test; this direction owns where a deferred finding goes and how it leaves.

## Capture

When the focus test defers an issue, record it as a backlog item and continue the goal without fixing it. Work the current stream will carry out is a task in its [registry](../references/state-format.md#task-identity-and-tables), never a backlog item; the backlog holds only what no stream is carrying out.

The main agent alone writes the backlog, through `state-write --state-target` under an owned stream's [lease](lease.md); a subagent returns the finding, its location, and evidence instead. Work without a stream that must record a finding first [establishes a stream for that work](establish-work-stream.md), never one for the finding alone, so the finding is triaged when the work lands.

## Items and index

Write each item to `.state/backlogs/backlog-<n>-<slug>.md`, named under [naming](../references/naming.md#documents), from [the template](../templates/state/backlogs/backlog.md). Take `<n>` as one above the highest number in the index or under `backlogs/`; the writer refuses a number another item already holds. Other streams write the index too, so reread `.state/backlogs.md` immediately before upserting the item's row:

```markdown
# Backlogs

| ID | Status | Summary | Source | Owner | Tracker |
| --- | --- | --- | --- | --- | --- |
| [backlog-<n>](backlogs/backlog-<n>-<slug>.md) | `<status>` | <summary> | <source> | <owner or `unowned`> | <issue link or `-`> |
```

Every cell derives from its item file, so a stale row is rebuilt by rereading the item. Sort rows by number, newest first.

| Status | Meaning |
| --- | --- |
| `open` | Deferred; nobody is carrying it out. |
| `filed` | Posted to the issue tracking system; `Tracker` holds the link. |
| `adopted` | A stream carries it out as the tasks named in `Adopted by`. |
| `dropped` | Resolved or obsolete; `History` says why. |

Every status change appends a `History` line to the item and refreshes its row in the same reconciliation.

## Adoption

A stream takes on an item through [change control](change-control.md): once the approved revision adds its tasks, set the item `adopted` and name the stream and task IDs in `Adopted by`. The tasks own the work from then on. When those tasks are cancelled without replacement, return the item to `open`.

## After landing

Once a stream records [landing evidence](stream-completion.md#completed-requires-landing-evidence), triage the `open` items whose `Source` is that stream:

1. Re-examine each item against the current default branch. Set a resolved or obsolete item `dropped`, citing the revision that shows it.
2. Ask the user which remaining items to post, in one multi-select question that follows [questions.md](questions.md). Describe each item in plain language, never by its backlog ID. Skip the question when no item remains. Declined items stay `open` for later adoption. Until the user answers, the stream carries `Blocked on: user — backlog triage`, which holds it from [archival](retirement.md#completion-and-the-debt-rule).
3. File each chosen item in the issue tracking system the work's domain plugin declares in its `<plugin>:directions/WORKFLOW.md`, through that plugin's owning capability. When no domain declares one, ask the user which system to use.
4. Record each returned link in the item's `Tracker`, set it `filed`, and refresh its row.

A partial filing failure leaves the unfiled items `open` and is reported with the tracker's error; never record a link that was not read back.

<IMPORTANT>
Issue text stands alone. It never names a backlog ID, Work ID, task ID, `.state/` path, local plan, or other local work state. Restate the item's Finding and Why deferred with repository paths, revisions, and reproduction; never paste its Evidence or History, which may cite local state.
</IMPORTANT>
