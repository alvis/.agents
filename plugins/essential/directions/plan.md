# Making plans

Read this direction before creating, revising, or presenting any plan. A plan may be a short conversational sequence, a persisted handoff, a task graph, or a commit/PR structure. Domain directions may add detail; they do not replace the minimum contract below.

<IMPORTANT>
A plan is a route through authoritative truth, not another home for that truth. Read the current contract, decisions, execution state, and evidence first. Link to their owning files instead of copying details that can drift. If a required source is absent or contradictory, name the gap and route it to its owner; do not invent a coherent-looking plan around it.
</IMPORTANT>

## Scale the plan to risk

Use the lightest process that still protects the outcome. Low-risk, reversible, well-bounded work can proceed after a concise goal, scope, and assumption check, followed by proportionate validation. Add the material-work details below when a wrong choice would waste substantial work, the blast radius is unclear, the change is difficult to reverse, or the outcome carries consequential product, security, data, financial, operational, or user-visible risk.

Validation depth follows the risk and claims; ceremony cannot substitute for evidence. [ALLAGENT.md](../hooks/ALLAGENT.md) owns mandatory gates and changed-premise handling.

## Required ingredients

Every presented plan, including main-agent, delegated, conversational, and sample plans, uses the six headings below in order, with an emoji prefix on each main section heading. Keep small plans concise; do not create a plan artifact for formatting alone. When another artifact owns an ingredient, give its exact path and only the summary needed to navigate it. Progress checklists are not plan presentations.

### 🎯 Goal

State what improves, for whom, and the end state the work will achieve or a verifiable outcome when no clear end state exists. Every work item needs an improvement; completing its tasks is not itself the improvement. Name acceptance evidence without inventing numerical metrics. Link the authoritative charter or specification when one exists.

### 🧭 Context

Include these labeled entries and any other context needed to understand the plan:

- **Current Scenario** — explain in plain language how things behave today and what would happen if the planned work is not delivered.
- **Current state** — a brief, revision-aware status and the immediate next action or blocker.
- **Related decisions** — zero or more record items, one per directly related decision. Each summary uses at most 19 words, excludes decision detail, and links the file containing the full decision.
- **Related recent work** — zero or more record items, one per directly related work record. Each summary uses at most 19 words, excludes decisions, and links the file containing the full journey.

- **Assumptions** — a separate numbered list with stable assumption IDs, falsifiable statements, and task IDs that verify each through a documentation check or focused code test. Distinguish accepted assumptions from unknowns and defaults. Schedule verification before dependent work; already verified assumptions cite their task and evidence.
- **Known issues** — a separate numbered list with stable issue IDs and task IDs that rectify each. Verification alone does not discharge a corrective obligation. If correction is outside the plan's authority, name its owning task and blocker before presenting the plan as executable.

Exclude records that are merely adjacent to the plan. Use `None` for an empty assumption or issue list; never invent entries. If verification disproves an assumption, record the result, map the resulting issue to corrective work, and follow change control before dependent execution.

Under each related-record label, use `None — no directly related record` only after checking the applicable authority; never create a placeholder file to satisfy a context line.

### 📋 Requirements

List observable conditions the outcome must satisfy. Preserve identifiers from the authoritative contract so execution and verification can cite them.

When concrete deliverables are already established during planning, list them under an **Expected Delivery** subsection. This subsection supplements other requirements; it does not replace or restrict them. Omit it when no deliverables are established rather than inventing commitments.

### 🚧 Boundary

Name what is inside the plan, what is deliberately outside it, and any limit on authority, time, systems, data, or validation that changes execution. Reference Context's assumption IDs when they constrain the boundary instead of restating them.

### 🗂️ Tasks

Present every active task and every task changed since the last approved plan with these columns. Keep unchanged terminal history in the canonical registry; link to that registry and the approved snapshot instead of repeating its rows in a growing plan:

```markdown
| ID | Description | Status | Delivery role | Agent | Model | Reasoning effort | Change |
| --- | --- | --- | --- | --- | --- | --- | --- |
```

Use stable IDs and the canonical statuses in [state-format.md](../references/state-format.md#task-identity-and-tables). Keep descriptions at most 19 words so the overview remains scannable. Assign every row to `EXPLORE`, `IMPLEMENTATION`, `REVIEW`, or `FOLLOWUP`. Render each nonempty checkpoint as a level-three heading with its own table; omit empty checkpoints. This grouping applies to human and agent delivery alike. Checkpoints are presentation metadata: they never alter dependencies or the canonical registry's single nine-column table.

Name each delivery agent's role and name, including future owners. Distinguish planned settings from observed execution. Resolve inherited model and reasoning effort from runtime information or the active harness configuration before dispatch, honoring explicit task-level selections. Record native values, never portable intelligence ranks in their place. When a value is not exposed or does not apply, write `unavailable` with its reason, such as `unavailable — human owner has no AI runtime`. Record observed settings when execution begins, including differences from the planned assignment, without rewriting the approved snapshot. Verify skill eligibility separately; an assignment does not confer eligibility.

Identify the last approved plan by revision or content hash and compare every row against that snapshot, never an unapproved draft. Mark `new`, `unchanged`, or `changed`; changed rows name fields and before/after values, including status, role, agent, model, and effort changes. With no approved baseline, mark all rows `new`. If an existing baseline is inaccessible, state `comparison unavailable` and the missing source instead of inventing deltas. Retain cancelled and superseded rows. Revisions removing or replacing mapped work must update affected assumption and issue references and required obligations together.

### 🛠️ Direction

State the route by task ID: dependencies, verification at each meaningful boundary, and stop or pivot signals. Name applicable skills beside the tasks and agents that use them; do not assign every skill to every agent. State when a task needs no skill. Link material choices to their decision records; do not reopen accepted decisions in the plan.

## Material-work additions

Where the risk warrants it, add only these details to the ingredients above. Adapt them to the domain and omit categories the work does not touch; role and workflow contracts determine who accepts the plan and when execution may begin.

<report>

- Under Boundary, cover relevant failure modes, permissions, non-goals, and validation limits, referencing Context's assumptions.
- Under Direction, name the evidence that validates each material step and the rejected alternative for each material choice, with its reason in one clause.
- At the end of the plan, list only blocking questions whose wrong answer would throw work away, with a recommended default; write `0 — none` when there are none.

</report>

## Truth ownership in work state

For a lifecycle-managed work stream, the shared ingredients are distributed without duplication:

- `goal.md` supplies Goal, Requirements, and Boundary through the charter link;
- root `state.md` task definitions, assignments, status, and dependency edges supply Tasks and Direction under [the state contract](../references/state.md); and
- root status plus links to `decisions/` and `state/journal.md` supply Context.

Non-authoritative detail such as `state/plan.md` may expand an existing task ID, but it cannot redefine any shared ingredient. [Approved-plan persistence](approve-plan.md) preserves immutable comparison snapshots; current execution belongs in the registry. Follow the state lifecycle for ownership, revisions, and approval.

## Revision and verification

Revise Direction without operator approval when evidence changes the route but Goal, Requirements, and Boundary remain fixed and the owning workflow grants that authority. Surface any proposed contract change to its owner before continuing.

Before handing off, approving, or executing a plan, check the six sections in order with emoji prefixes, an explicit improvement and evidenced outcome, and executable scope, dependencies, verification, and stop conditions. Check every assumption's verification task and every issue's corrective task, complete task rows and checkpoint groups, description lengths, native delivery settings and their provenance, accurate approved-baseline changes, and task-specific skills. Verify that Current Scenario explains today's behavior and non-delivery consequences, Expected Delivery preserves established commitments, context is current, links resolve, records are directly related, and each record summary is at most 19 words. Semantic quality remains the planner's and reviewer's responsibility; structural guards do not prove it. Hook feedback requires rereading this direction and presenting the corrected plan; an acknowledgement does not resolve rejected plan content.
