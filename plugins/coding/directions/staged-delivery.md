# Staged delivery

Read this when implementation work is a large delivery (`essential:references/working-attitude.md#large-delivery`), when work touches a [`direction-review` draft](#build-the-draft) in any state, or when finalizing an approved draft into a stack, whichever skill or plan reaches that step. It stages proof by spending: a cheap working draft earns direction approval before the expensive 100% coverage and stack finalization. [WORKFLOW.md](WORKFLOW.md) owns risk class, [`GIT-PR-SIZE-01`](../standards/git/rules/GIT-PR-SIZE-01.md) owns tier and zone, [`TST-COVR-01`](../standards/testing/rules/tst-covr-01.md) owns the coverage bar, and [publication.md](publication.md) owns PR mechanics.

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

Publish exactly one draft PR from that bookmark through `coding:pr create`. A `direction-review` draft is an open draft PR whose head is `wip/<work-id>`, or `<type>/<work-id>/00-draft` for a draft opened before the `wip` group existed; a legacy draft keeps that head through finalization. It stays draft through every create, update, and CI-green event. Its summary opens by naming it a direction review for the delivery's outcome, such as `Direction review for zone-driven PR landing: …`, so no reader mistakes it for a mergeable change, and its body carries the change inventory: each logical change unit and the risk class. It is exempt from the size rules' indivisibility evidence because it will not merge as published; its Why this size names the planned peel-off layers instead, rendered by `coding:pr`. A project that enforces coverage in CI must let a PR whose head branch starts with `wip/` bypass that threshold; the plugin cannot change a project's CI, so report a blocked draft rather than padding tests.

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

After approval, carve the approved draft into a logical stack beneath it, or into one PR when its unit band is green or yellow with no line bump; a risk floor alone does not force a split. Every finalization follows these steps, whether it starts from `coding:write-code`, `essential:takeover`, a plan formed through `essential:discover plan`, or `coding:pr`, and a brief that hands finalization to another agent names this section and [Check for drift](#check-for-drift):

1. Keep a draft change on top. The draft's bookmark stays on its own change above every layer and never shares a commit with a layer's bookmark; once every layer has left it, that change is empty and keeps its description so jj can push it.
2. With `coding:commit`, carve each layer out in dependency order: `jj split -r <draft> -B <draft> -m "<layer subject>" <layer paths>` moves the layer's paths into a new change below the draft and leaves the draft's change and bookmark on top; the new change takes the bookmark `<type>/<work-id>/NN-<scope>`. A draft already split into commits keeps those commits as its layers: bookmark each in order, then create the draft change with `jj new <top layer> -m "<draft subject>"` and move the draft's bookmark onto it with `jj bookmark move <draft> --to @`.
3. Publish each new layer through `coding:pr create` with the draft as the top head of the same publication, so the push that publishes the layer restacks the draft PR onto it; every later `coding:pr update` over the layers does the same. The draft PR shrinks as layers leave it.
4. Finalize each layer before it is ready: 100% coverage under `TST-COVR-01`, every `TODO(draft):` removed, the full gates, independent AI review under [review-evidence.md](review-evidence.md), and a clean [drift record](#check-for-drift). Each layer's normal zone applies to its own review and size evidence.
5. Close the draft PR last, once its residual diff against the newest layer is zero and every layer is ready, with a comment linking every layer. A zero-diff PR stays valid on GitHub, so do not close it early. Only zero residual decides the close: a plan or caller that calls the draft superseded does not, and the coding plugin's close hook refuses to close a pull request that still has changes.

Never copy draft content into new branches by hand; `jj split` and bookmarks keep one history and prove the content was distributed.

## Check for drift

Before any layer is marked ready, diff the commit the approving gate record binds against the current draft head, which holds the approved tree plus every finalization edit in the layers below it. The difference may contain only tests, hardening, reviewer-requested fixes, and `TODO(draft):` removal. Any other hunk is a new direction: return that delta to direction review under the same authority table before readiness.

Record each run as one comment on the draft PR from the [drift check template](../skills/pr/templates/drift-check.md); its marker binds both full commits and the result. A finalization edit to any layer moves the draft head, so a record holds only for the head it names: a layer becomes ready only on a clean record naming the draft's current head, including when the user asks for it to be marked ready or review was skipped. A zero residual plus a clean drift record proves the stack is the approved direction, fully distributed.

## Completion

Staged delivery is complete when every layer is finalized, reviewed, and ready, the newest drift record is clean, and the draft PR is closed with links. A reject verdict or an unresolved approval leaves the work blocked, with the gate record naming the outstanding approver.
