# Decision consultation

Consult every unresolved material architecture, technology, product, security, data, migration, configuration, or scope decision before handover. Low-impact reversible assumptions may remain in `state.md` only with evidence, impact, and a recheck trigger.

For each decision, present context and viable options with tradeoffs, always including:

- **Perform research** — dispatch bounded research using [subagent-handover.md](../../../references/directions/subagent-handover.md), with the unresolved decision and evidence paths in Context. The researcher returns bounded proposed content and evidence; the main agent stores the lowercase child under `proposals/` with status `open`.
- **Defer decision** — record owner/deadline, blocked tasks, and a pivot signal.

Process outcomes:

- Finalized: the main agent writes or updates `decisions/<semantic-slug>.md` with status, headline, rationale, alternatives, evidence, impact, and supersession, then reconciles `decisions.md` and affected `state.md` tasks.
- Research: a delegated researcher returns the proposed child content, headline, status, and evidence; the main agent writes the `proposals/` child and reconciles `proposals.md`.
- Deferred: the main agent keeps the question, options, recommendation, owner/deadline, and affected blocked tasks in `state.md`; it creates a decision child only when durable decision history already exists.

If the user is unavailable, defer rather than decide. Batch five or more questions by dependency, placing blockers first. Every created or materially rewritten child belongs in `generated_files`; never update `state/working.md` from a delegated decision/research subtask.
