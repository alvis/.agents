# Readiness mode

Use this mode to decide whether evidence is sufficient to enter convergence,
specification, planning, or implementation.

1. Review every ledger item and relevant artifact. Reject unlabeled claims and
   inferences presented as facts.
2. Require the goal, acceptance criteria, hard constraints, affected systems,
   and material integration/failure surfaces to be known well enough for the
   proposed next owner.
3. For each unresolved item classify:
   - **blocking**: could change architecture, public API, data model,
     security/privacy, destructive migration, user-visible semantics, or
     acceptance criteria;
   - **deferred**: material but has an explicit owner and decision deadline;
   - **accepted assumption**: low-impact, reversible, and has a recheck trigger.
4. Return exactly one verdict:
   - `ready`: no blocking unknown remains;
   - `more-discovery`: name one next mode and the unknown it should resolve;
   - `blocked`: name the external decision or evidence required.
5. Select exactly one next owner. Prefer `essential:decide` when viable options
   need convergence, specification when a contract must be written, planning
   when the contract is approved, and implementation only when acceptance
   criteria and material decisions are settled.

Complete with the verdict, evidence summary, blocking/deferred/accepted items,
and the single next owner.

When stakeholders need to inspect evidence, blockers, and accepted assumptions
together, consider the **readiness check** direction in
[presentation](presentation.md). When the evidence under review is a drafted
plan, prefer the **plan review** direction; when it is a finished change, prefer
the **change walkthrough** direction. Its generated prompt must preserve the
single verdict and next owner rather than reopening settled decisions implicitly.
