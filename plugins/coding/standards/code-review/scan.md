# Code Review Standards: Violation Scan

Any single violation blocks submission by default. Protocol: `essential:directions/standards.md`.

Qualify blockers under the [evidence threshold](write.md#evidence-threshold) before assigning blocking priority or requiring fixes or tests. Apply its separate guidance to non-blocking feedback.

## Quick Scan

- DO NOT approve demonstrated correctness defects in supported behavior, including edge cases and races realistic under [`GEN-SAFE-04`](../universal/rules/gen-safe-04.md), or unsafe null handling [`CRV-CORR-01`]
- DO NOT approve demonstrated injection, authorization, authentication, data-exposure, or XSS violations at applicable trust boundaries [`CRV-CORR-02`]
- DO NOT accept a suppression unless it satisfies the canonical `GEN-SAFE-01` approval, root-cause-note, and minimal-scope requirements [`CRV-CORR-03`]
- DO NOT let style volume obscure security, correctness, performance, architecture, maintainability, or testing concerns [`CRV-PRIO-01`]
- DO NOT ignore change risk or size, or continue reviewing after required checks pass and evidenced defects are resolved without new evidence invalidating that result [`CRV-PRIO-02`]
- DO NOT write disrespectful or unactionable feedback, cite a rule ID without explaining it, raise a blocker without a governing source, applicability evidence, and concrete impact, dismiss evidenced minimality or comparable-pattern violations, infer support from parser permissiveness, or require work for unsupported hypothetical inputs or failures below the `GEN-SAFE-04` bar [`CRV-FDBK-01`]
- DO NOT reject contrary evidence, discourage reasoned challenge, or reopen a settled finding without new evidence invalidating its disposition [`CRV-FDBK-02`]

## Rule Matrix

| Rule ID | Violation | Bad Examples |
|---|---|---|
| `CRV-CORR-01` | Correctness defect approved | Empty input throws unexpectedly; a race realistic under `GEN-SAFE-04` is left unresolved |
| `CRV-CORR-02` | Security defect approved | Interpolated SQL; authorization omitted from a protected operation |
| `CRV-CORR-03` | Non-compliant suppression accepted | `// @ts-ignore`; documented suppression with no explicit user approval |
| `CRV-PRIO-01` | Review effort misprioritized | Dozens of spacing notes while an injection defect remains |
| `CRV-PRIO-02` | Review depth or continuation unjustified | Another speculative review pass after required checks and fixes pass |
| `CRV-FDBK-01` | Unsupported blocker or unactionable feedback | Requiring HTML handling solely because a Markdown parser accepts tags; dismissing evidenced unnecessary work because it causes no runtime failure; blocking on a key retired during a millisecond decrypt |
| `CRV-FDBK-02` | Evidence or settled disposition disregarded | Reopening a rejected finding solely because the commit SHA changed |
