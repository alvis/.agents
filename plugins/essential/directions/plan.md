# Making plans

Read this direction before creating, revising, or presenting any plan. A plan may be a short conversational sequence, a persisted handoff, a task graph, or a commit/PR structure. Domain directions may add detail; they do not replace the minimum contract below.

<IMPORTANT>
A plan is a route through authoritative truth, not another home for that truth. Read the current contract, decisions, execution state, and evidence first. Link to their owning files instead of copying details that can drift. If a required source is absent or contradictory, name the gap and route it to its owner; do not invent a coherent-looking plan around it.
</IMPORTANT>

## Scale the plan to risk

Use the lightest process that still protects the outcome. Low-risk, reversible, well-bounded work can proceed after a concise goal, scope, and assumption check, followed by proportionate validation. Add the material-work details below when a wrong choice would waste substantial work, the blast radius is unclear, the change is difficult to reverse, or the outcome carries consequential product, security, data, financial, operational, or user-visible risk.

Validation depth follows the risk and claims; ceremony cannot substitute for evidence. [ALLAGENT.md](../hooks/ALLAGENT.md) owns mandatory gates and changed-premise handling.

## Shape the plan before presenting

A subagent planner returns its removed items, precedents, and architecture draft to its assigner, who asks the user under [subagent.md](subagent.md).

### Cut to the core

Every plan delivers only the core work that achieves its Goal and Requirements. After drafting, try to remove each task, deliverable, file, abstraction, dependency, and check under the [need test](../references/working-attitude.md#choose-the-first-sufficient-option). Record every removed item under Out of Scope. Before presenting, ask the user in one multi-select question that follows [questions.md](questions.md) which removed items to add back, splitting it into consecutive questions only when the harness caps options and asking a single item as yes or no; restore each chosen item as a task and record the user's decision on the rest. Skip the question when nothing was removed or the user already excluded every removed item. Items excluded by a charter, specification, or accepted decision need no question.

### Follow precedent

For material work, search the same repository before designing for how similar work was carried out: version-control history and merged pull requests touching the affected paths, sibling modules of the same kind, and their tests. Build the design on that precedent, list it under Context's **Precedents**, and state the reason for any departure.

### Confirm the architecture

For material work that adds or restructures code or file layout, confirm the architecture with the user before presenting the plan; other material work records `Confirmed architecture: not applicable — <reason>`. Before the first round, unless this work already has a plan-interview round marked ready, ask whether they want the rounds run as visual pages through the discovery skill's [plan interview](../skills/discover/directions/plan.md); a ready round confirms only the calls the user answered, and its untouched recommendations and notes go into another round. Each round shows an example tree of the affected paths, marking new and changed ones, and representative code — key types, signatures, and one call site — that follows the precedents, then asks the user under [questions.md](questions.md) to confirm or change it. Revise and repeat until the user confirms a round without changes. After three unconfirmed rounds, ask whether to reopen Goal or Requirements, keep refining, or proceed with the latest draft; recommend reopening, because disagreement that persists for three rounds usually concerns the goal rather than the layout. Record the confirmed result under Direction as **Confirmed architecture**.

## Required ingredients

Every presented plan, including main-agent, delegated, conversational, and sample plans, uses the headings below in order, with an emoji prefix on each main section heading. Keep small plans concise; do not create a plan artifact for formatting alone. When another artifact owns an ingredient, give its exact path and only the summary needed to navigate it. Progress checklists are not plan presentations.

### 🎯 Goal

State what improves, for whom, and the end state the work will achieve or a verifiable outcome when no clear end state exists. Every work item needs an improvement; completing its tasks is not itself the improvement. Name acceptance evidence without inventing numerical metrics. Link the authoritative charter or specification when one exists.

### 🧭 Context

Include these labeled entries and any other context needed to understand the plan:

- **Current Scenario** — explain in plain language how things behave today and what would happen if the planned work is not delivered.
- **Current state** — a brief, revision-aware status and the immediate next action or blocker.
- **Related decisions** — zero or more record items, one per directly related decision. Each summary uses at most 19 words, excludes decision detail, and links the file containing the full decision.
- **Related recent work** — zero or more record items, one per directly related work record. Each summary uses at most 19 words, excludes decisions, and links the file containing the full journey.
- **Precedents** — for material work, zero or more record items, one per similar past change found under [Follow precedent](#follow-precedent). Each summary uses at most 19 words, says whether the plan follows or departs from it, and links the commit, pull request, or path. Use `None — no similar work found` only after searching.

- **Assumptions** — a separate numbered list with stable assumption IDs, falsifiable statements, and task IDs that verify each through a documentation check or focused code test. Distinguish accepted assumptions from unknowns and defaults. Schedule verification before dependent work; already verified assumptions cite their task and evidence.
- **Known issues** — a separate numbered list with stable issue IDs and task IDs that rectify each. Verification alone does not discharge a corrective obligation. If correction is outside the plan's authority, name its owning task and blocker before presenting the plan as executable.

Exclude records that are merely adjacent to the plan. Use `None` for an empty assumption or issue list; never invent entries. If verification disproves an assumption, record the result, map the resulting issue to corrective work, and follow change control before dependent execution.

Under each related-record label, use `None — no directly related record` only after checking the applicable authority; never create a placeholder file to satisfy a context line.

### 📋 Requirements

List observable conditions the outcome must satisfy. Preserve identifiers from the authoritative contract so execution and verification can cite them.

When concrete deliverables are already established during planning, list them under an **Expected Delivery** subsection. This subsection supplements other requirements; it does not replace or restrict them. Omit it when no deliverables are established rather than inventing commitments.

### 🚧 Boundary

Name what is inside the plan and any limit on authority, time, systems, data, or validation that changes execution; Out of Scope owns what is excluded. Reference Context's assumption IDs when they constrain the boundary instead of restating them.

### ✂️ Out of Scope

List only items that were in the draft or the request and then removed under [Cut to the core](#cut-to-the-core), or that the user, a charter, a specification, or an accepted decision explicitly excluded. Never list work nobody proposed: naming it spends review attention and invites it back into scope, so the list stays no larger than what was drafted or asked. One line each: the item, why the outcome does not need it, and its disposition — the user's `declined` or `deferred to <owner>`, or `excluded by <link to the authority>`. Write `None — nothing removed` when empty.

### 📍 Working environment

Name the working directory and version-control arrangement, such as a separate jj workspace, Git worktree, or explicitly selected current checkout. Distinguish the current directory from a proposed one until creation is verified; name the intended base when relevant. Follow [workspace selection](establish-work-stream.md#select-the-workspace) before dependent work. This section is presentation metadata: retain it in immutable approval evidence, omit the entire section from saved root `plan.md`, and keep necessary workspace anchors in their canonical state locations under [approved-plan persistence](approve-plan.md).

### 🗂️ Tasks

Present every active task and every task changed since the last approved plan with these columns. Keep unchanged terminal history in the canonical registry; link to that registry and the approved snapshot instead of repeating its rows in a growing plan:

```markdown
| ID | Description | Status | Delivery role | Agent | Model | Effort | Change |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

Use stable IDs and the canonical statuses in [state-format.md](../references/state-format.md#task-identity-and-tables). Keep descriptions at most 19 words so the overview remains scannable. Assign every row to `EXPLORE`, `IMPLEMENTATION`, `REVIEW`, or `FOLLOWUP`. Render each nonempty checkpoint as a level-three heading with its own table; omit empty checkpoints. This grouping applies to human and agent delivery alike. Checkpoints are presentation metadata: they never alter dependencies or the canonical registry's single nine-column table.

Name each delivery agent's role and name, including future owners. Distinguish planned settings from observed execution. Select the task's portable Model Tier and Effort under [delegation](delegate.md), then record the supported native model and effort values in the table. Resolve inherited settings from runtime information or the active harness configuration before dispatch; an unexposed value is `unavailable` with its reason, such as `unavailable — human owner has no AI runtime`. Record observed settings when execution begins, including differences from the planned assignment, without rewriting the approved snapshot. Verify both skill minimums against observed settings separately; an assignment does not confer eligibility.

Identify the last approved plan by revision or content hash and compare every row against that snapshot, never an unapproved draft. Mark `new`, `unchanged`, or `changed`; changed rows name fields and before/after values, including status, role, agent, model, and effort changes. With no approved baseline, mark all rows `new`. If an existing baseline is inaccessible, state `comparison unavailable` and the missing source instead of inventing deltas. Retain cancelled and superseded rows. Revisions removing or replacing mapped work must update affected assumption and issue references and required obligations together.

### 🛠️ Direction

State the route by task ID: dependencies, verification at each meaningful boundary, and stop or pivot signals. Name applicable skills beside the tasks and agents that use them; do not assign every skill to every agent. State when a task needs no skill. Link material choices to their decision records; do not reopen accepted decisions in the plan. For material work, include the **Confirmed architecture** from [Confirm the architecture](#confirm-the-architecture).

## Material-work additions

Where the risk warrants it, add only these details to the ingredients above. Adapt them to the domain and omit categories the work does not touch; role and workflow contracts determine who accepts the plan and when execution may begin.

<report>

- Under Boundary, cover relevant failure modes, permissions, and validation limits, referencing Context's assumptions.
- Under Direction, name the evidence that validates each material step and the rejected alternative for each material choice, with its reason in one clause.
- At the end of the plan, list only blocking questions whose wrong answer would throw work away, with a recommended default; write `0 — none` when there are none.

</report>

## Truth ownership in work state

For a lifecycle-managed work stream, the shared ingredients are distributed without duplication:

- `goal.md` supplies Goal, Requirements, Boundary, and Out of Scope through the charter link;
- root `state.md` task definitions, assignments, status, and dependency edges supply Tasks and execution order under [the state contract](../references/state.md);
- root `plan.md` supplies approved Direction and remaining detail; and
- root status plus links to `decisions/` and `state/journal.md` supply Context.

Non-authoritative detail such as `state/plan.md` may expand an existing task ID, but it cannot redefine any shared ingredient. [Complete-plan reads](../references/state.md#complete-plan-reads) defines ownership across the three canonical files. [Approved-plan persistence](approve-plan.md) preserves unrestricted full approval evidence and bounded projections; current execution belongs in the registry. Never measure or limit the plan presented to the user. Follow the state lifecycle for ownership, revisions, and approval.

## Revision and verification

When evidence changes the route but Goal, Requirements, Boundary, and Out of Scope remain fixed, the owning workflow may authorize a Direction adjustment without operator approval. Record that adjustment in mutable `state/` detail keyed by existing task IDs, link it from `state.md`, and journal its reason; preserve the approved remainder under [complete-plan reads](../references/state.md#complete-plan-reads). Surface any proposed contract change to its owner before continuing.

Before handing off, approving, or executing a plan, check these sections in order with emoji prefixes, an explicit improvement and evidenced outcome, and executable scope, dependencies, verification, and stop conditions. Check every assumption's verification task and every issue's corrective task, complete task rows and checkpoint groups, description lengths, native delivery settings and their provenance, accurate approved-baseline changes, and task-specific skills. Check that Out of Scope lists only drafted, requested, or explicitly excluded items, each with a disposition, and that material plans list Precedents and a Confirmed architecture or its not-applicable reason. Verify that Current Scenario explains today's behavior and non-delivery consequences, Expected Delivery preserves established commitments, context is current, links resolve, records are directly related, and each record summary is at most 19 words. Semantic quality remains the planner's and reviewer's responsibility; structural guards do not prove it. Hook feedback requires rereading this direction and presenting the corrected plan; an acknowledgement does not resolve rejected plan content.
