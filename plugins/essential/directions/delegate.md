# Delegating work

Read this before dispatching a subagent or composing a first task handover.
Whether to delegate, which substrate, scope, uncertainty, teammate retirement,
and review responsibility stay in [orchestration.md](orchestration.md).

## Delegate well

- **Route to the best runtime specialist.** Inspect every available agent's description immediately before each spawn. Classify the requested action and deliverable from its verbs and acceptance criteria before matching subject area, tools, independence, and context: shared nouns do not establish ownership — implementing a component and designing it have different owners. Add no unrequested prerequisite stage because a specialist's workflow mentions one. Routing rows and collaboration edges are defaults, not limits; never invent an unavailable agent, and honor each description's "Must use" and "Use proactively" triggers.
- **Give full context once.** Compose the first task handover from "First handover" below, naming the standards and paths the worker needs — never ask it to find them.
- **One bounded task per subagent.** Give each worker exactly one task. Estimate its context load before launching — base, files, tool output, generated output — and never hand a worker more than its measured remaining context can safely hold.
- **Parallelize justified dispatches.** Once delegation is warranted, batch independent tasks into one dispatch request; serialize tasks that need earlier results. Do not split bounded inline work merely because parallelism is possible.
- **Reuse a warm teammate, and address it only by `agent_id`.** Route a small task needing a large base context to a live teammate already carrying it — separate spawns share no cached base — and keep related work with an idle teammate whose context still fits. Spawn fresh when the task is unrelated to that context, or when a follow-up such as a re-review during an in-flight fix would block it. Communication always targets the runtime `agent_id`; a role, `subagent_type`, configured name, or label is never an address.
- **Delegate continuing work directly when the owner is known.** Knowing the best teammate's `agent_id`, message it directly; knowing the teammate but not the ID, ask the main agent to resolve it; with no known owner, ask it to suggest one — it prefers a living teammate with matching folder or feature history, else spawns and returns a new named teammate's `agent_id`. Without a direct teammate-messaging capability, return the compact hand-off to the caller.
- **Synthesize.** Collect what returns, identify patterns, and consolidate it into actionable results.

## First handover

This section owns the prompt interface; task-specific instructions add detail
without restating or renaming its fields. Put the stable reference alone on the
first line — the Work ID, else the runtime Task ID, or a PR ID or commit SHA for
Git history; an ordinal or semantic task label is never a substitute.
[naming.md](../references/naming.md) owns the identifier shapes, read only when
you must mint a new name.

```text
<stable-reference>

Goal: <verifiable outcome, expected quality bar, and why it matters>

Requirements:
- <mandatory deliverable, behavior, acceptance criterion, or required reference>

Boundary:
- <files, actions, permissions, or responsibilities the agent must not cross>

Directions:
- <non-binding hints that may help achieve the goal>

Context:
Path: /absolute/path/to/work

Decisions:
- Adopt indexed event replay — decisions/event-model.md

Recent work:
- Parser migration landed; conversion remains — state/journal.md
```

Put mandatory behavior, acceptance criteria, and required standards in
`Requirements`; keep `Directions` advisory. `Context` extends the interface to
fit the task: `Decisions` and `Recent work` are standard subsections, and
authors may add others such as `Inputs`, `Risks`, `Dependencies`, or
`References` without changing or duplicating the top-level fields.

- `Decisions` and `Recent work` may each hold several items, and `Recent work` excludes decisions.
- Each item summary contains 1–19 words; its label and path do not count.
- Omit an empty Context subsection rather than writing a placeholder.
- Where two or more items share a container, put an absolute `Path:` before them and give those items relative paths; use the deepest useful shared container. Subsections with different containers each take their own; an item with no shared container carries an absolute path.

## Keep messages disciplined

- **4,096 characters is a hard ceiling.** Inspect the body of every dispatch and direct message, the first handover included; externalize detail before sending if it would exceed 4,096 characters. A lead or reviewer receiving an overlong inline body returns `blocked: externalize message` rather than adjudicating it.
- **Reference durable artifacts.** Put long evidence, decisions, and state in a task-owned file at a known-readable absolute path rather than pasting it inline; send the path plus at most two lines on what it holds and why it matters; the recipient chooses whether to read it. Never persist secrets or transient credentials.
- **Use terse deltas after dispatch.** Prefix every delta with the same stable reference the handover carried — never an ordinal such as `slice 1` — then prefer `ok`, `blocked: <one line>` with optional `need: <one line>`, `decision: <one line>`, `artifact: <absolute path>` plus one line, `hold: <one line>`, or `cancel: <one line>`. Do not restate rails, paths, or evidence already delivered.
- **Do not narrate lifecycle events.** Record idle, completion, and availability changes silently unless they alter the task; an idle-only notice gets no reply.
- **Minimize round trips.** Batch related decisions, keep at most one unresolved request on a task edge, and send again only for changed state, a blocker, a decision, or a requested result. Reconcile crossed messages once; ignore stale updates.

## Name teammates

Only the main agent assigns a configurable teammate `name` or label. Use `<short-name>-<role>-<task>` in lowercase kebab-case:

- Take the short name from the three preferences ending the role's description: `tech-lead` preferring Raj gives `raj-tech-lead-fix-auth`.
- Keep the role equal to the role-only definition name and the task an ultra-short verb-object. Give parallel tasks distinct semantic qualifiers (`…-audit-auth-api`, `…-audit-auth-ui`).
- Where a living teammate already uses the chosen short name, take another preference; add a numeric suffix only once all three collide.
- Configured names are human-readable labels, not addresses: capture the returned `agent_id`.

## Nest only one-off

- Nesting is exceptional and one-off: consider it only where a subagent-dispatch capability exists and the helper's single returned artifact or summary ends the delegation. A leaf-by-charter never spawns, whatever the runtime supports.
- The nested call supplies only its `subagent_type` (for example, `test-reporter`), task, and context — never a configured name, never a standing nested teammate.
- **Bound exceptional fan-out.** Declare a task-wide child-spawn budget before the first one-off nested spawn; default to three. Hand-offs to known `agent_id`s don't spend it.
- Continuing or collaborative work is not nesting: route it by `agent_id` under "Delegate well".
- Rely on the native nesting ceiling: keep no second depth counter, never delegate to an ancestor, and never reuse a sibling edge.

## Resolve intelligence

Choose the lowest intelligence whose `best_for` examples cover the task, from
the authoritative ranks and examples in
`skills/install-agents/references/intelligence-levels.json`. Metadata
declares the role's level; harness adapters alone translate it into native model
and effort fields. [ALLAGENT.md](../hooks/ALLAGENT.md) owns skill eligibility.
Resolve `inherit`, and a main session carrying no level, from the active harness
projection before dispatch: take its exact configured rank, or the highest
configured rank for the same model when the active effort exceeds every
configured effort. Other missing or ambiguous projections are ineligible.
