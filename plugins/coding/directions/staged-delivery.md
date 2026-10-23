# Staged delivery

Read this when implementation work is a large delivery (`essential:references/working-attitude.md#large-delivery`), when a draft PR's head is a `wip/<work-id>` branch, or when peeling an approved draft into a stack. It stages proof by spending: a cheap working draft earns direction approval before the expensive 100% coverage and stack finalization. [WORKFLOW.md](WORKFLOW.md) owns risk class, [`GIT-PR-SIZE-01`](../standards/git/rules/GIT-PR-SIZE-01.md) owns tier and zone, [`TST-COVR-01`](../standards/testing/rules/tst-covr-01.md) owns the coverage bar, and [publication.md](publication.md) owns PR mechanics.

## Enter staged mode

Staged mode applies to a large delivery (`essential:references/working-attitude.md#large-delivery`), the same trigger as the pre-code direction board in `essential:directions/plan.md`. The board settles direction before code; the draft gate checks that the built direction works. Keep both.

The author may opt out when the direction is already proven, such as a mechanical sweep or a repeat of an approved pattern, by recording the reason in the work state and the PR body. An opt-out is itself a direction decision: before finalization starts, the approver the [zone table](#approve-the-direction) names for the delivery's zone validates the reason, and the verdict is recorded as a gate record naming the zone that chose the approver. With no draft head to bind, an opt-out record binds the base revision and the work-state plan revision, is named `direction-optout-<seven-char-base>.json`, and takes its zone from the classifier's tier for the declared inventory. An opt-out that is rejected or not yet approved returns the work to staged mode, and so does one whose zone a later recount raises past its approver's authority, until the higher approver decides.

## Build the draft

Develop the whole direction on one jj change bookmarked `wip/<work-id>`, using jj as the default VCS so the later split needs no copy-and-paste; follow [jj.md](jj.md). The `wip` group marks a branch that never merges as published; only the peeled layers take the delivery's conventional type. The draft meets its evidence floor and nothing more:

| Draft kind | Evidence floor |
| --- | --- |
| Non-web | Typecheck, lint, and build pass; existing tests stay green; each changed module has one happy-path unit test. |
| Web target (pages, components, hooks, and journeys) | Typecheck, lint, and build pass; existing tests stay green; no new tests; a rendered walkthrough, as screenshots or a recording, of every primary journey. |

No coverage threshold applies to an unapproved draft. Unfinished edges are marked `TODO(draft): <finalization task>` under [`DOC-LIFE-01`](../standards/documentation/rules/doc-life-01.md). Mixed drafts meet the web floor on the web target and the non-web floor on every other module.

Publish exactly one draft PR from that bookmark through `coding:pr create`; every other direction calls it the `direction-review` draft. It stays draft through every create, update, and CI-green event. Its summary opens by naming it a direction review for the delivery's outcome, such as `Direction review for zone-driven PR landing: …`, so no reader mistakes it for a mergeable change, and its body carries the change inventory: each logical change unit and the risk class. It is exempt from the size rules' indivisibility evidence because it will not merge as published; its Why this size names the planned peel-off layers instead, rendered by `coding:pr`. A project that enforces coverage in CI must let a PR whose head branch starts with `wip/` bypass that threshold; the plugin cannot change a project's CI, so report a blocked draft rather than padding tests.

## Approve the direction

Give one independent reviewer only the charter, the draft diff, and the demo evidence: the floor's test output or walkthrough. The reviewer judges direction, architecture, major misbehavior, and scope fit; style, lint, and coverage belong to finalization. The reviewer also recounts the units and risk class and may only raise the zone.

Read the authority from the zone computed by `classify-pr-size.ts`, then applied after any recount:

| Zone | Direction approver |
| --- | --- |
| Green | The independent AI reviewer approves. |
| Yellow | The standing delegate approves. |
| Red, black | A human approves. |

Find the standing delegate in the project's `CLAUDE.md` or `AGENTS.md` under a `Direction approval delegate:` line naming a GitHub account, or in agent memory recorded from the user's instruction. The human approver, for red and black and for yellow without a delegate, is the account on a `Direction approver:` line in the same files, else the requesting user. When no approver account resolves, ask the user to name one; an unanswered request is no approval, and the draft waits. Never treat AI approval as authority for yellow, red, or black.

Accept a delegate or human approval only from the requesting user's own message in the session when they are the resolved approver, or from a PR review or comment by the named approver account when that account is not the identity the agent publishes as. The gate record cites that message or URL. The direction task on the draft is a request, not evidence: a checked box approves nothing, so the approver answers by PR review or comment. The agent never checks the direction task, and never posts or records an approval on the approver's behalf.

The verdict is one of:

- **approve**: peel off the draft as built.
- **approve-with-major-rework**: the direction holds but the build does not; the author may rebuild from the approved direction on a fresh change and returns the rebuilt draft for review.
- **revise**: address the findings on the same draft and request another round.
- **reject**: stop; the direction returns to planning.

After 3 rounds without approve, hand the decision to a human regardless of zone; repeated revision means the direction, not the draft, is in question. Revise and approve-with-major-rework rounds share one count; only a reject whose direction the pre-code board re-approves starts a new count.

Record each verdict as a JSON gate record at `.state/works/<work-id>/artifacts/review/direction-<seven-char-head>-<round>.json` with the approval binding in `essential:references/approvals.md`: the draft head SHA, the reviewer and authority, the zone and tier, the approved scope, the verdict, the approval evidence, and any exceptions. Mirror it as one PR comment on the draft, written from the [direction review template](../skills/pr/templates/direction-review.md). An AI reviewer publishes `COMMENT` reviews only, so the gate record, not a GitHub approval event, is the approval. Approval binds that SHA alone.

## Peel off the stack

After approval, carve the approved draft into a logical stack beneath it, or into one PR when its unit band is green or yellow with no line bump; a risk floor alone does not force a split:

1. Keep the approved draft change on top. With `coding:commit`, `jj split` the first logical layer out of it into a new change below the draft and give it the bookmark `<type>/<work-id>/01-<scope>`.
2. Repeat for each layer in dependency order. Each layer is its own PR in the stack; the draft PR shrinks as layers leave it.
3. Finalize each layer before it is ready: 100% coverage under `TST-COVR-01`, every `TODO(draft):` removed, the full gates, and independent AI review under [review-evidence.md](review-evidence.md). Each layer's normal zone applies to its own review and size evidence.
4. When the draft's residual diff reaches zero, close the draft PR with a comment linking every layer. A zero-diff PR stays valid on GitHub, so do not close it early.

Never copy draft content into new branches by hand; `jj split` and bookmarks keep one history and prove the content was distributed.

## Check for drift

Before any layer is marked ready, diff the approved SHA against the stack tip, the current draft head, which holds the approved tree plus every finalization edit in the layers below it. The difference may contain only tests, hardening, reviewer-requested fixes, and `TODO(draft):` removal. Any other hunk is a new direction: return that delta to direction review under the same authority table before readiness. A zero residual plus a clean drift diff proves the stack is the approved direction, fully distributed.

## Completion

Staged delivery is complete when every layer is finalized, reviewed, and ready, the drift diff is clean, and the draft PR is closed with links. A reject verdict or an unresolved approval leaves the work blocked, with the gate record naming the outstanding approver.
