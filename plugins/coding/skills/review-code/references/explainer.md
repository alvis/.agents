# Change explainer

Load only for `--explain`. After independent reviews finish, create a lowercase
child such as `changes/change-explainer.md` under the active work root. Use the
slug and collision rules in `naming.md` in the essential plugin's
`references/` directory; never overwrite another change child. Sequence prefixes are reserved
for split output and ADRs. Return the proposal so the main agent can
reconcile `changes.md`.

Include:

1. Outcome, motivation, and acceptance criteria.
2. Before/after behavior, distinguishing the change from pre-existing paths.
3. Representative flows through state, data, dependencies, side effects,
   errors, and async behavior.
4. Approved decisions, implementation deviations, and unresolved findings.
5. Invariants, failure modes, trust/performance/compatibility implications, and
   how tests exercise them.
6. Five to ten comprehension questions about behavior and integration.
7. An answer key after a separator, with evidence paths.

Do not claim the quiz proves correctness. Mark insufficient evidence as an
open question instead of inventing an answer. The child carries `pending` or
`applied` change status and a one-line headline for `changes.md`.
