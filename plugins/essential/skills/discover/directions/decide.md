# Decide contract

Converge on one approach when the user must choose, approve, or reject a direction. Discover owns every decision; this contract is what a converging `options` board must satisfy before it asks. The output is an approved decision, not an implementation artifact.

<IMPORTANT>
- Never change a deliverable or application source before the user's reply approves the decision; the board and discovery's own ledger are the only writes.
- Do not force a recommendation from sparse evidence. Return to divergent discovery when a material option, constraint, or acceptance criterion is still unknown.
</IMPORTANT>

1. **Check readiness.** Read the supplied evidence and up to three directly relevant files. Separate user-stated intent, observed facts, inferences, accepted assumptions, and unresolved questions. If a material unknown could change the option set or acceptance criteria, resolve it with the discovery mode that fits before converging.
2. **Frame the decision.** State what is being decided, why a naive answer is unsafe, the constraints that bind it, and what a bad outcome looks like.
3. **Compare approaches.** Carry forward the viable, non-dominated options — at least two, always including the smallest viable change. For each, state evidence, cost/complexity, reversibility, accepted tradeoffs, and what it breaks or ignores. Recommend one option; when none survives, name the eliminating constraint rather than forcing a recommendation.
4. **Challenge the recommendation.** Give the two or three strongest objections. State whether each changes the recommendation and name the falsification signal that would make another option win.
5. **Validate completeness.** Require identified dependencies, the realistic edge cases or failure modes considered — recording none when none is expected in supported use rather than inventing one — a rollback path or explicit reason none is needed, and no hidden material decision. Explicitly deferred matters name an owner and decision deadline; blockers prevent approval.
6. **Ask on the board and stop.** Render steps 2–5 as one board: each option with its evidence and tradeoffs, the recommendation badged, the objections and falsification signal, the rollback path, deferred decisions, and an approve/revise/reject response. Present it as [presentation](presentation.md#present-the-board) orders and implement nothing until the reply returns. On rejection or revision, incorporate the new constraint and return to step 3.
7. **Record and hand off.** For project work, prepare the approved record from [the decision template](../../../templates/state/decisions/decision.md) with status `accepted`. Follow [the decision lifecycle](../../../directions/decisions.md) for the main agent's write, reconciliation, acceptance sweep, and supersession; a worker returns proposed content and reconciliation deltas. Select the owner of the approved outcome and invoke it with the decision, observed constraints, accepted assumptions, falsification signal, rollback, and relevant paths.

A converged decision passes when no deliverable or application source changed before approval, every recommendation names its evidence, falsification signal, accepted tradeoffs, dependencies, edge case, and rollback posture, no material unknown hides as an assumption, and the handoff carries the full decision.
