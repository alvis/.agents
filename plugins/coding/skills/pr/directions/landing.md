# Land pull requests by zone

Load this after [create-update.md](create-update.md#6-promote-verified-surfaces-and-add-human-tasks) promotes a PR, and on every [monitor.md](monitor.md) wake that can change a PR's landing state: a review, a description edit, a CI result, or a merge. This direction owns the zone's landing label, its reviewer tasks, automatic merging, stack landing, and the after-merge learnings comment. The zone is the one `classify-pr-size.ts` computed after any reviewer recount under [`GIT-PR-SIZE-01`](../../../standards/git/rules/GIT-PR-SIZE-01.md); this file restates no threshold. [merge.md](merge.md) owns merge gates and transport, and direction approval under [staged delivery](../../../directions/staged-delivery.md#approve-the-direction) is a separate gate that never merges anything.

## Zone policy

| Zone | Landing label | Human reviewer | Merge trigger | Landing |
| --- | --- | --- | --- | --- |
| Green | auto-merge | None: no reviewer tasks | Automatic merge gates | Agent squash-merges |
| Yellow | auto-merge | Reviewer tasks from step 6 | Automatic merge gates plus human approval | Agent squash-merges |
| Red, black | manual-merge | Reviewer tasks from step 6 | None | A human merges; keep listening |

Automatic merging is on by default. An `Automatic merge: disabled` line in the receiving repository's `AGENTS.md` or `CLAUDE.md` on its default branch lands green and yellow PRs like red: manual-merge label, reviewer tasks from step 6, and a human merge. A `direction-review` draft never lands here; it peels into layers that do.

## Apply the landing label

Select the landing label from the `REPOSITORY_LABELS` inventory discovered for this PR in [create-update.md](create-update.md#discover-and-select-repository-labels): an auto-merge label is one whose name or description says the PR may merge automatically once its checks pass, and a manual-merge label is one whose name or description says a person must merge it. Choose at most one exact name; when none fits, apply no landing label and report it. Never create a label.

Apply it only while substantive AI review is `PASS` and hosted CI is green for the current head and base, through the label endpoint in [Attach selected repository labels](create-update.md#attach-selected-repository-labels); a label-driven merge bot must never see it on an unreviewed head. Record the applied name in `state/pr-monitor.md`. Before the agent pushes a new head, remove the recorded landing label, so no merge bot sees it on the pushed head even for a moment; when the head or base changes any other way, remove it at once. Apply it again only after review and CI pass on the new revision. When a recount or opt-out changes the zone, swap the recorded label for the new zone's label, and when a green PR becomes yellow, red, black, or opted out, run step 6's reviewer-task generator with `--apply` so a person is asked to review. Remove only the label this direction recorded; every other label stays.

## Check the merge trigger

Fetch fresh evidence on each wake, bound to the PR's current head and base OIDs; an event is a hint, never authority.

- **Automatic merge gates.** The latest independent review records a substantive `PASS` under the [review-loop exit gate](review-loop.md#exit-gate); hosted CI is green under the [poll contract](create-update.md#poll-contract); the PR is open, ready, and mergeable without conflicts; no current review requests changes; no label whose name or description holds the PR from merging is present; every conversation and inline comment has been consumed, so a buffered comment still inside its quiet window delays the merge until its batch is read and answered; and no unchecked specification-deviation task remains in Verification.
- **Human approval (yellow only).** Either any checked task line inside the managed `coding:reviewer-tasks` block whose revision line names the current head and base, or a GitHub review in state `APPROVED` whose `commit_id` is the current head and whose author is a user account, not a bot or app. The generator clears ticks when the head or base changes, so an older revision's tick or approval never counts.

Never check, add, or edit a reviewer, approver, or direction task, and never submit an `APPROVE` review: approval must come from a person. A PR whose trigger does not hold stays open and monitored.

## Merge

Run [merge.md](merge.md)'s preconditions for the PR, then merge it with `--method=squash` through merge.md's transport. Never pass `--force` or any administrator or bypass option. When branch protection, a required approving review, or a merge queue refuses the merge, record GitHub's stated reason as the PR's landing blocker, report it, and keep listening; AI reviews submit `COMMENT`, so a repository that requires an approving review blocks green PRs until a person approves. A queued merge is not a merge until GitHub reports `MERGED`. Landing never repairs code: a red-CI repair runs through [repair.md](repair.md) and republishes, which voids the old evidence, and the repaired head lands only after review and CI pass again.

## Land a stack

Walk the stack bottom-up from its lowest open layer. A layer is eligible when its own zone's trigger holds at its current head and base; the first layer that is red, black, opted out, unapproved yellow, or otherwise blocked ends the walk, and no layer above it merges automatically, even when green. A layer above that point carries no auto-merge label until the walk reaches it, so a label-driven merge bot cannot land it early. For a GitHub PR stack, merge the eligible bottom run atomically through [github-stacks.md](../references/github-stacks.md#merge-and-navigate) with the highest eligible layer as the target and squash as the method. For a conventional linear stack, validate the whole open stack through merge.md, then run its step 6 for the lowest layer only: merge that layer, and restack and retarget every remaining open layer as its descendants without merging any of them; each restacked layer has a new head, so its review, CI, and approval evidence is rebound before the walk resumes on a later wake.

## After merge

After GitHub reports a PR `MERGED`, whether the agent or a person merged it, a review-learnings comment is optional. Post at most one, and only when the PR received review feedback, a human review or comment or an AI review finding, and at least one point from that feedback teaches a lesson that applies to other work. Otherwise post nothing; the merge is complete without it.

1. Fetch the complete discussion: `source "${CODING_PR_SKILL_DIR}/scripts/fetch-review-loop-discussion.sh" "$PR_URL"` returns inline comments, issue comments, and threads, and `gh api --hostname "$HOST" "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews" --paginate` adds review bodies. Pair them with the dispositions the review loop recorded.
2. When an issue comment already carries this PR's `coding:review-learnings` marker, stop: the comment is posted once per PR. Only the lease-holding main agent posts it, and [monitor.md](monitor.md#consume-events) serializes its wakes, so the check and the post never race.
3. Author the body from [learnings.md](../templates/learnings.md) under `coding:directions/authorship.md`, keeping only the points that pass its generality test. When none passes, stop without posting.
4. Post it with `bun "${CODING_PR_SKILL_DIR}/../../scripts/gh-pr-comment.ts" "$PR_NUMBER" --repo "$HOST/$OWNER/$REPO" --body-file <body>`, read it back, and record its URL in `state/pr-monitor.md` before [landing and settlement](monitor.md#landing-and-settlement) continues.

For a stack, post one comment per merged PR covering that PR's own reviews.
