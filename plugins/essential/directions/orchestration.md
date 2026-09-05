# Orchestration & delegation

Delegate on signal, not reflex. The Project Manager owns delivery across teams.
Coding topology follows `coding:directions/WORKFLOW.md`; do not add a coordinator
around one bounded executable slice. When a domain lead is required, it gathers
teammate advice, decomposes the assigned goal, owns its domain's implementation
decisions, assigns and monitors the pieces, and reconciles results. Delegation
never transfers accountability: review and synthesize what comes back. When work
crosses this boundary, stop and route it to the best current teammate — zero
tolerance. Once you are dispatching, [delegate.md](delegate.md) carries the
handover, message, naming, nesting, and intelligence contract.

## Choosing the topology

Classify the task and pick the substrate once, up front, then name the success criteria before launch — a run with no stop condition is not ready:

- **Inline** — where the owning domain workflow permits, don't dispatch when
  dispatching would save no context, add no independence, and only cost latency
  or a lossy hand-off. Prefer one subagent over several.
- **Parallel tasks** — independent, dispatch-and-score work whose siblings needn't talk → parallel uses of the subagent-dispatch capability in one request.
- **Agent Team** — ongoing, high-signal multi-role coordination where warm context avoids repeated setup → persistent teammates around a warm core. A need to relay reasoning or evidence is not sufficient; put durable detail in artifacts. Form one only where delegation carries signal — large or high-output work; stay inline for trivial, conversational, or small tasks.
- **Deterministic scripted execution** — high-volume structured iteration toward a measurable target: fan-out plus adversarial verification plus a bounded, resumable correction loop. A subagent composes the complete launch input and asks the main agent to run it.

## Scope and deliverable

Explore the approach freely; ship narrowly. The requested scope is the deliverable — do not quietly narrow, widen, or transform it. Make routine judgment calls yourself; check in only when different readings would produce materially different work. If the request seems mistaken, say so; escalate if consequential, else continue. Stop short of actions clearly beyond it, finish the whole task, and name what you left out and why.

## Working with uncertainty

Treat the prompt and plan as working hypotheses that repository and runtime evidence may revise. Label consequential claims as user-stated intent, observed fact, inference, accepted assumption, or unresolved question. A possible blindspot is a hypothesis to investigate, never a discovered fact merely because it sounds plausible.

Before a long-horizon or materially ambiguous decision, inspect the relevant code, runtime behavior, and integration surface and ask what evidence, latent preference, constraint, failure mode, or historical choice may be missing. Use `essential:discover` when this needs a dedicated blindspot, options, interview, reference, prototype, or readiness pass; use `essential:decide` only after the evidence is sufficient to converge on one approach.

Proceed without user input only when the assumption is low-impact and reversible; choose the conservative path and record it. Escalate architecture, public API, data model, security or privacy, destructive migration, user-visible semantics, and anything that changes acceptance criteria. Apply [ALLAGENT.md](../hooks/ALLAGENT.md)'s changed-premise rule to dependent work; re-plan or request the material decision.

The main session owns the authoritative uncertainty ledger and user decisions. A subagent that encounters a material unknown returns the observed evidence, inference, unresolved question, deviation from the assigned map, recommended disposition, affected scope, options, and independent work that can continue.

## Run the team

- **Terminate the unneeded.** Retire a teammate once it is clearly done — task
  finished with no follow-up, a review passed — or telemetry shows keeping it no
  longer helps.
- **Keep agent definitions role-specific.** An agent's `Collaboration` section
  lists only outbound collaborators as concise bullets; it never repeats this
  protocol, narrates who spawns it, or restates its tools.

## Review responsibility

Never spawn a subagent to re-confirm work you just did. Independent review differs: dispatch it when the change is consequential, the user asked for review, or a workflow gate requires it — publishing a pull request is such a gate. Small, bounded work rides its own mechanical gates.

Whoever spawns an agent owns the quality of its output. Choose the best independent domain critic on the roster; give it only the artifact, constraints, and acceptance criteria — never the producer's reasoning. The reviewer returns `ok` or `blocked` plus at most two lines. Detailed findings go to the producer in a bounded review artifact; the lead receives only the verdict and path.

If no domain critic fits, use a general-purpose agent as a criteria-based reviewer; if no internal reviewer exists, any agent may ask an already-configured external review tool, permission policy allowing. Never install or authenticate a reviewer, broaden permissions, or bypass deny rules — the internal agent owns the verdict, and external output is evidence, not authority. If every review path is unavailable, completion is allowed only with an explicit warning that independent review did not occur.

Record changed-code completion exactly as `REVIEWED: source=<specialist|general|external|none> reviewer=<agent-id|tool-name|none> verdict=<ok|blocked|unavailable|not-required> round=<n>`, where `not-required` records `round=0`.

## Context discipline

Report context usage only when the runtime measures it; otherwise report task affinity and whether enough remains — never invent a percentage or token count. Rotate work to a fresh or roomier teammate before measured capacity becomes unsafe, and delegate bulk reads and noisy output rather than ingesting them.
