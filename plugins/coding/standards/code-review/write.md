# Code Review Standards: Compliant Patterns

## Key Principles

- Verify correctness and security before lower-impact concerns.
- Treat every correction as evidence that improves the result, not as personal criticism.
- Separate code quality from personal worth while holding the quality bar.
- Qualify blockers against approved requirements, applicable standards, or evidenced likely production failures; a race or edge-case claim must also be realistic under `GEN-SAFE-04`; label speculation as non-blocking.
- Support each claim with appropriate evidence; blockers need a governing source, applicability proof, impact, and practical next action.
- Match review depth to change size and risk; stop when required checks pass and evidenced defects are resolved.
- Apply `GEN-SAFE-01` exactly when a suppression appears.

## Core Rules Summary

### Correctness and Security (CRV-CORR)

- **CRV-CORR-01**: Check supported behavior and evidenced failure paths, including logic defects without a feature-specific requirement.
- **CRV-CORR-02**: Check input validation, injection, authentication, authorization, exposure, and XSS at applicable trust boundaries.
- **CRV-CORR-03**: For each suppression, require explicit user approval, an adjacent root-cause-attempt note, and the narrowest scope under canonical `GEN-SAFE-01`.

### Prioritization and Depth (CRV-PRIO)

- **CRV-PRIO-01**: Order findings by impact: security/correctness, performance/architecture, maintainability/testing, then style.
- **CRV-PRIO-02**: Scale review depth to size and risk, retain required hotfix checks, and stop when required checks pass and evidenced defects are resolved.

### Feedback and Collaboration (CRV-FDBK)

- **CRV-FDBK-01**: Qualify blockers under the evidence threshold below; make all feedback specific, respectful, and clear about its evidence and uncertainty.
- **CRV-FDBK-02**: Incorporate contrary evidence and reopen a settled finding only when new evidence invalidates its disposition.

## Patterns

### Evidence Threshold

<IMPORTANT>
Qualify a blocker before recording it, assigning blocking priority, or requiring work. A blocker requires a demonstrated violation of an approved requirement or applicable standard, or an overlooked defect evidenced as highly likely in supported production use. For a logic defect without a feature-specific requirement, cite the supported-behavior correctness rule (`CRV-CORR-01`) and the actual caller, producer, or production evidence establishing the failure. An applicable standard violation needs no separate likelihood estimate, except that every race, timing, edge-case, or failure-path claim must be realistic under the [realistic-failure rule](../universal/rules/gen-safe-04.md) (`GEN-SAFE-04`), whichever standard it cites.

Work beyond the minimum sufficient solution under `essential:references/working-attitude.md` and unexplained differences from comparable existing work under the established-pattern rule (`GEN-CONS-01` in `universal/`) remain reviewable violations. Identify removable work that adds no required behavior or readability, or comparable artifacts whose relevant constraints match and whose divergence lacks justification. Cite the affected artifact and concrete unnecessary maintenance burden or convention violation; no runtime failure is required. Abstraction or caller count alone proves neither violation.

Every blocker carries all three:

1. **Governing source:** the exact approved requirement or applicable rule, with its source reference and a brief explanation of what it requires; a bare rule ID is insufficient.
2. **Applicability and proof:** the supported trigger and a source trace, failing check, reproduction, or production evidence bound to the reviewed inputs. For structural standards, cite the affected artifact and rule trigger instead of inventing a runtime scenario.
3. **Concrete impact:** what fails, who or what is affected, and why it matters; for a race, timing, edge-case, or failure-path claim, give the `GEN-SAFE-04` classification or occurrence estimate; for any other overlooked production defect, explain why the supported path makes occurrence highly likely.

Support comes from the approved contract, actual callers or producers, or established production use. Parser permissiveness and a reproduction using an invented input establish possible behavior, not support. Malicious inputs at a real trust boundary remain reviewable under applicable security standards. Never expand scope or demand tests for unsupported hypothetical inputs. A conclusive source trace is sufficient evidence; a runtime reproduction is not mandatory for every finding. A trace showing that an interleaving or edge case can occur proves possibility, not realistic occurrence.

Specific speculation, including a race or edge case below the `GEN-SAFE-04` bar, may appear as an explicitly non-blocking thought, with its assumptions stated and no request attached. Questions, thoughts, notes, praise, and optional suggestions need context and evidence appropriate to their claims, not proof of a violation or failure impact. They never become blockers, mandatory chores, required tests, or approval caps merely because uncertainty remains. Whenever feedback cites a rule ID, briefly explain the rule.
</IMPORTANT>

### Review Focus

Check these areas in order, without treating later areas as optional:

| Priority | Focus | Typical evidence |
|---|---|---|
| Critical | Correctness and security | Realistic failing edge case or race (`GEN-SAFE-04`), injection, missing authorization |
| Important | Performance and architecture | N+1 query, leak, unnecessary O(n²), misplaced responsibility |
| Important | Maintainability and testing | Unclear naming, duplicated responsibility, missing failure tests |
| Optional | Style | A non-blocking readability preference not owned by another rule |

Use efficient structures where the evidence warrants them, such as a `Map` for repeated keyed lookup. Request error-scenario tests only when an applicable requirement or standard calls for them and the supported failure path is realistic under `GEN-SAFE-04` and the missing protection is evidenced.

### Suppression Review

`universal/rules/gen-safe-01.md` is authoritative. For every `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or equivalent:

1. Confirm explicit user approval for that suppression in durable evidence such as a PR discussion, linked issue, or adjacent approving-decision reference.
2. Confirm an adjacent comment records the attempted root-cause fix and why it was blocked.
3. Confirm the scope is minimal; reject file-wide suppression when a narrower form works.
4. If either approval or the root-cause note is absent, block. A comment alone never satisfies `GEN-SAFE-01`.

Prefer a declaration for an untyped library:

```typescript
declare module "legacy-lib" {
  export function process(data: unknown): ProcessResult;
}
```

### Actionable Feedback

Use `[classification]: [problem] + [solution] + [context]` in internal review notes:

```text
issue: This query interpolates user input. Parameterize the id to prevent SQL injection.
suggestion: Extract this validation so both endpoints enforce the same contract.
nit: Consider destructuring here for readability.
question: Is the second sort intentional?
praise: The boundary validation covers malformed payloads clearly.
```

GitHub review comments use the rendered marker taxonomy owned by `../../skills/pr/directions/review-tone.md`, not these literal prefixes.

### Review Depth

1. Under 100 lines: perform a detailed line-by-line review.
2. From 100 through 500 lines: inspect key risk areas, then review line by line if no key issue stops the review.
3. Above 500 lines: review architecture first, then key risks, then lines if no earlier blocker stops the review.
4. For a hotfix: focus on security and correctness while checking that the constrained scope is justified.

Stop when required checks pass and evidenced defects are resolved. Revalidate only what changed inputs or new evidence affect, plus checks explicitly required by the owning workflow. Preserve settled dispositions unless new evidence invalidates them; name that evidence and explain why the prior disposition no longer holds. A fresh reviewer, an unrelated edit, or a new commit SHA alone does not justify reopening a finding. Current-revision verification does not restart settled scope discussions.

## Anti-Patterns

- Defending code because it currently works after evidence exposes a defect.
- Flooding a review with formatting notes while material risk remains.
- Critiquing the author rather than the code and its impact.
- Accepting an unapproved suppression because its comment sounds reasonable.
- Treating parser-accepted HTML as supported Markdown input without contract, caller, producer, or production evidence.
- Reopening settled findings or requesting more tests solely to continue a clean review.

## Quick Decision Tree

1. Does a proposed blocker meet the evidence threshold? Block demonstrated violations with a concrete remedy; otherwise omit it or give specific, explicitly non-blocking feedback without requiring work (`CRV-FDBK-01`, evidence-based feedback; `CRV-CORR-01` and `CRV-CORR-02`, correctness and security).
2. Is there a suppression? Apply `GEN-SAFE-01` before proceeding (`CRV-CORR-03`).
3. How large and risky is the change? Select the corresponding review depth (`CRV-PRIO-02`).
4. Are important concerns resolved? Then cover maintainability, testing, and optional style (`CRV-PRIO-01`).
5. Are required checks passing and evidenced defects resolved? Stop; reopen settled findings only on new invalidating evidence (`CRV-PRIO-02`, `CRV-FDBK-02`).
