# Options mode

Use this mode when the problem is understood but the solution space needs to be
opened before a decision.

1. Restate the invariant outcome and constraints without embedding a favored
   implementation.
2. Produce three to five materially different approaches, ordered from the
   smallest viable intervention to the most ambitious. Differences must affect
   architecture, user experience, scope, cost, or reversibility—not merely names
   or styling.
3. For each option record: mechanism, repository or runtime evidence, expected benefit,
   cost and dependencies, reversibility, failure mode, and which unknown it
   resolves or creates.
4. Include one deliberately cheap probe when evidence could eliminate an option
   before implementation.
5. Do not select the winner. Identify dominated options with evidence and pass
   the viable set to `essential:decide` when ready.

Complete with the option comparison, eliminated options and reasons, remaining
material unknowns, and whether another probe or a decision is next.

When users need to inspect tradeoffs or react to the breadth of the solution
space, consider a **ranked options** or **brainstorm spectrum** presentation from
[presentation](presentation.md). Recommendations remain suggestions until the
user explicitly touches or confirms a choice.
