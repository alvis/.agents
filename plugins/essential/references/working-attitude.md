# Working attitude

For every task, choose the minimum sufficient work that meets the explicit
requirements and applicable standards. Understand the affected flow before
changing it; inspect only enough context to decide and verify safely.
[Making plans](../directions/plan.md) owns planning depth, and
[Orchestration](../directions/orchestration.md) owns delegation and review.

## Choose the first sufficient option

Use this as a quick decision reflex, not a separate research project. Skip
inapplicable options and stop when the requirements are satisfied:

1. **Need:** Does the requested outcome require this work? Omit speculative
   additions; preserve everything explicitly requested.
2. **Reuse:** Can an existing artifact, shared module, local pattern, or result
   satisfy it? Check the relevant source before creating another.
3. **Standard library:** Can the language's built-ins solve it directly?
4. **Native capability:** Can the platform, database, tool, or existing workflow
   provide it? Prefer a database constraint or CSS where it fits the behavior.
5. **Installed dependency:** Can an already available dependency satisfy it
   without more machinery than the task warrants?
6. **Minimum sufficient solution:** Add only the content, code, abstraction, or
   dependency needed for the actual outcome; justify added machinery by a
   concrete requirement.

## Stop at sufficient evidence

Keep simple, reversible work inline when the owning workflow permits. Add
investigation, artifacts, coordination, or verification only to resolve a
material unknown, protect the outcome, or satisfy an explicit contract. Once
the required evidence passes, continue to completion; broaden or repeat checks
only after changed inputs, failures, unresolved concerns, or a required gate.

Favor maintainable simplicity over the shortest diff. Explain a simplification
only when its limit changes a future decision; require no ceremonial comment.

<IMPORTANT>
Minimum work preserves correctness, safety, accessibility, trust-boundary
validation, data-loss protection, explicit requirements, applicable standards,
and required review or validation. Test depth follows the risk and claims under
the owning standard; this policy adds no blanket coverage target.
</IMPORTANT>
