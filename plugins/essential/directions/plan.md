# Making plans

Read this direction before creating, revising, or presenting any plan. A plan may be a short conversational sequence, a persisted handoff, a task graph, or a commit/PR structure. Domain directions may add detail; they do not replace the minimum contract below.

<IMPORTANT>
A plan is a route through authoritative truth, not another home for that truth. Read the current contract, decisions, execution state, and evidence first. Link to their owning files instead of copying details that can drift. If a required source is absent or contradictory, name the gap and route it to its owner; do not invent a coherent-looking plan around it.
</IMPORTANT>

## Scale the plan to risk

Use the lightest process that still protects the outcome. Low-risk, reversible, well-bounded work can proceed after a concise goal, scope, and assumption check, followed by proportionate validation. Add the material-work details below when a wrong choice would waste substantial work, the blast radius is unclear, the change is difficult to reverse, or the outcome carries consequential product, security, data, financial, operational, or user-visible risk.

Validation depth follows the risk and claims; ceremony cannot substitute for evidence. [ALLAGENT.md](../hooks/ALLAGENT.md) owns mandatory gates and changed-premise handling.

## Required ingredients

Every presented plan, including conversational and sample plans, uses the five headings below in order, with an emoji prefix on each main section heading. Keep small plans concise; do not create a plan artifact for formatting alone. When another artifact owns an ingredient, give its exact path and only the summary needed to navigate it. Progress checklists are not plan presentations.

### 🎯 Goal

State the end state the work will achieve and the observable bar that proves it was achieved. Completing tasks is not itself a goal; put those tasks under Direction. Link the authoritative charter or specification when one exists.

### 🧭 Context

Include a **Current Scenario** subsection explaining in plain language how things behave today and what would happen if the planned work is not delivered. Add other context needed to understand the plan and retain these navigation aids:

- **Current state** — a brief, revision-aware status and the immediate next action or blocker.
- **Related decisions** — zero or more record items, one per directly related decision. Each summary uses at most 19 words, excludes decision detail, and links the file containing the full decision.
- **Related recent work** — zero or more record items, one per directly related work record. Each summary uses at most 19 words, excludes decisions, and links the file containing the full journey.

Exclude records that are merely adjacent to the plan.

Under each related-record label, use `None — no directly related record` only after checking the applicable authority; never create a placeholder file to satisfy a context line.

### 📋 Requirements

List observable conditions the outcome must satisfy. Preserve identifiers from the authoritative contract so execution and verification can cite them.

When concrete deliverables are already established during planning, list them under an **Expected Delivery** subsection. This subsection supplements other requirements; it does not replace or restrict them. Omit it when no deliverables are established rather than inventing commitments.

### 🚧 Boundary

Name what is inside the plan, what is deliberately outside it, and any limit on authority, time, systems, data, or validation that changes execution. Name the accepted assumptions specifically enough to falsify them, and separate unknowns from defaults.

### 🛠️ Direction

State the chosen route: ordered work or dependency graph, owners where relevant, verification at each meaningful boundary, and stop or pivot signals. Link material choices to their decision records; do not reopen accepted decisions in the plan.

## Material-work additions

Where the risk warrants it, add only these details to the ingredients above. Adapt them to the domain and omit categories the work does not touch; role and workflow contracts determine who accepts the plan and when execution may begin.

<report>

- Under Boundary, number every falsifiable assumption and cover only relevant failure modes, dependencies, permissions, non-goals, and validation limits.
- Under Direction, name the evidence that validates each material step and the rejected alternative for each material choice, with its reason in one clause.
- At the end of the plan, list only blocking questions whose wrong answer would throw work away, with a recommended default; write `0 — none` when there are none.

</report>

## Truth ownership in work state

For a lifecycle-managed work stream, the shared ingredients are distributed without duplication:

- `goal.md` supplies Goal, Requirements, and Boundary through the charter link;
- root `../references/state.md` task definitions and dependency edges supply Direction; and
- root status plus links to `decisions/` and `state/journal.md` supply Context.

Non-authoritative detail such as `state/plan.md` may expand an existing task ID, but it cannot redefine any shared ingredient. Follow the state lifecycle for ownership, revisions, and approval.

## Revision and verification

Revise Direction without operator approval when evidence changes the route but Goal, Requirements, and Boundary remain fixed and the owning workflow grants that authority. Surface any proposed contract change to its owner before continuing.

Before handing off, approving, or executing a plan, check that all five sections appear in the required order with emoji prefixes, the goal describes a verifiable end state, scope and assumptions are clear, and the next step and validation are executable. Verify that Current Scenario explains today's behavior and non-delivery consequences, Expected Delivery lists any established deliverables without displacing other requirements, context is current, links resolve, records are directly related, and each record summary is at most 19 words. Hook feedback requires rereading this direction and presenting the corrected plan; an acknowledgement does not resolve rejected plan content.
