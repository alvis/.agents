---
name: plan
description: "Prepare the direction for delivering a project, from overview to execution subtasks: run each relevant plugin's research skill, settle decisions and unknowns with essential:discover, then write a charter, milestones, and subtasks. Use when asked to plan a project, feature, or initiative, or when work found during implementation must be planned."
requirements:
  model: capable
  effort: deliberate
---

# Plan

Turn a request into an approved plan that runs from the overview down to subtasks one owner can execute. This skill owns the sequence — research, discover, decompose, approve — and the rule that work found later goes through the same sequence. `essential:directions/plan.md` owns what a plan contains and its gates; read it before step 1 and follow it at every step instead of restating it here.

## Boundaries

- Use for: planning a project, feature, initiative, or other delivery from a request; planning work that surfaced during execution and the `essential:directions/change-control.md` plan-level route sends here.
- Do not use for: planning from an approved specification (`specification:plan-code` when installed); a fact-finding report (`essential:deep-research`); a single decision, explanation, or interview (`essential:discover`); executing the plan.
- Only the main agent runs this skill, because it writes `.state/` under the lease (`essential:references/state-systems.md`). A subagent asked to plan follows the plan direction's shaping-section rule for subagent planners.

## Inputs

- **Required**: what to deliver, and for whom.
- **Optional**: `--work-id`; `--scope=<new work>` for re-entry, naming the work found during execution and the task or finding that surfaced it; known constraints, references, and deadlines.

## Workflow

1. **Frame.** State the goal, the deliverable, known constraints, and what the user already decided. Scale the rest of the workflow to risk as the plan direction's first section says. Low-risk, reversible, bounded work needs no work stream: run steps 2–4 lightly, keep briefs and the ledger in the conversation instead of saving them, and in step 5 present the plan for the concise check the plan direction allows without persisting it. For material work, establish the work stream under `essential:directions/establish-work-stream.md` before step 2, settling Goal and Behavioral requirements there; its Direction item waits for step 3 under that direction's research deferral. On re-entry, reuse the existing stream and frame only the `--scope` work.
2. **Research.** List the installed skills named `research` — one per plugin, called `<plugin>:research`, such as `coding:research` — and read each description. Run every researcher whose domain the framed work touches, passing the framed request and a scope slug; independent researchers run in parallel as subagents dispatched under `essential:directions/delegate.md`. Each returns a brief in the layout of `essential:templates/research-brief.md`; with a work stream, save each at the path that template names. A researcher that fails or times out is recorded with its cause, and planning continues without it.
   - When no installed researcher covers a domain the work touches, run the plan direction's precedent search yourself and write the brief in the same layout under `artifacts/research/briefs/essential/<scope-slug>.md`.
   - Run `essential:deep-research` only for an unknown that only outside sources can settle, such as a library's behavior or a regulation, and only when its answer changes scope, architecture, or a data contract, or the row is `blocking`.
   - Research is preliminary: stop at sufficient evidence under `essential:references/working-attitude.md`, not when every source is read.
3. **Discover.** Pass every brief row to `essential:discover` as starting evidence, keeping its ID, kind, and source; discover persists its ledger under its own contract, so never write `state/discovery.md` here. Run it in `plan` mode when the plan direction requires a direction board, otherwise in the mode its workflow selects for the open rows. Rows already `resolved` by evidence become context, never questions. Finish when every material unknown is resolved, deferred with an owner, or blocking. When an answer raises a research question that would change the plan, return to step 2 for that question alone.
4. **Decompose.** Write the plan in the plan direction's headings and order, at three levels:
   - **Overview** — Goal, Requirements, Boundary, and Out of Scope, which approval in step 5 projects into `goal.md`.
   - **Milestones** — parent tasks in `state.md`, each an independently reviewable deliverable with its own acceptance evidence, ordered by `Depends on`.
   - **Subtasks** — leaf tasks `<PARENT>01` to `<PARENT>99` under one milestone, each one owner and one coherent change with its own check. `essential:references/state-format.md` allows one child level, so a subtask that needs its own subtasks becomes a milestone.

   Every deferred unknown becomes an `EXPLORE` subtask or a numbered assumption with its verification task. Brief Precedents go under Context's **Precedents**.
5. **Approve.** Present the plan as the plan direction orders, including its cut-to-core question and any required direction board, and persist it on approval under `essential:directions/approve-plan.md`. Never start execution from this skill.
6. **Re-enter for work found later.** When execution surfaces work the approved plan lacks, `essential:directions/change-control.md` classifies it. A task-local finding stays on its row. A plan-level finding runs this skill with `--scope`, in this order:
   1. Research and discover the `--scope` work alone (steps 2–3), at the depth its risk warrants. A tiny addition still gets a researcher pass and an open-row check; it skips only what its risk does not need.
   2. Raise the change-control `proposals/` child as `open`.
   3. Decompose the new work into milestones and subtasks (step 4), then present the complete revised plan with every row's Change mark against the last approved plan, as the plan direction's Tasks section requires — never only the delta.
   4. On approval, persist the revision under `essential:directions/approve-plan.md`, then complete change control's revision bookkeeping: `Plan revision: N+1`, the `state/revisions.md` entry, and superseded or cancelled rows. Mark the proposal `accepted` (`essential:references/overviews.md`).

<IMPORTANT>
- Never add a task to an approved plan without passing it through steps 2–5 at the depth its risk warrants.
- Never present a plan whose material unknowns lack a disposition, or treat an unopened retrieval hit as observed evidence.
</IMPORTANT>

## Verification

- Each selected researcher returned a brief, saved when a work stream exists, or a recorded failure; each skipped researcher has a stated reason.
- Every brief row appears in the ledger with its original ID and source; no `inference` or `unknown` became `observed` without new evidence.
- Every material unknown is resolved, deferred with an owner, or blocking.
- Every subtask has exactly one milestone parent, and no subtask has children.
- The plan passes the checks in the plan direction's revision and verification section.
- A re-entry produced an `accepted` `proposals/` child, a full revised plan with Change marks, and a `state/revisions.md` entry, never an unrecorded row.

## Completion

Report the researchers run and skipped with reasons, brief paths, discover modes and rounds, the plan's approval status and saved paths, blocking questions with owners, and `generated_files`.
