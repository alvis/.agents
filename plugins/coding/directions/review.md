# Core review mandates

These mandates apply to all seven areas in local and PR reviews; area ownership prevents duplicate findings. Apply `coding:standards/code-review/`: `CRV-FDBK-01` requires evidence for blockers and specific context for non-blocking feedback; `CRV-FDBK-02` preserves settled dispositions absent new invalidating evidence; `CRV-PRIO-02` stops review when required checks pass and evidenced defects are resolved.

Every review performs the simplification, permanent-test-value, and semantic-proxy passes below within its resolved scope and relevant supporting checks. Scanner output cannot complete any pass. Assign each finding to its owning area; when explicit coverage excludes that area, report the coverage limit rather than claim the pass is complete.

## Contract alignment belongs to alignment

Root `state.md` (`plan_source: state.md`) plus linked approved specification/design/decision artifacts is the implementation contract. Its explicit ID-keyed implementation detail may be consulted but cannot duplicate or override IDs, edges, requiredness, targets, or acceptance mappings. A caller-supplied plan may assert but never override root state. Bind every result to the exact `plan_source: state.md` and relevant full task IDs. `alignment.md` alone reports additions, omissions, unjustified drift, stale spec derivations, and missing promotion/sync work. Other reviewers route pure drift there rather than duplicating it.

## Semantic errors belong to correctness

Trace supported behavior rather than trusting code shape. Wrong control flow/operators, swapped arguments, silent errors, races, unhandled async work, leaks, and boundary validation defects belong in `correctness.md` unless security-specific. Apply the standard's evidence threshold even without a feature-specific requirement; a merely plausible failure path is insufficient, and a race or edge case must be realistic under [GEN-SAFE-04](../standards/universal/rules/gen-safe-04.md).

## Simplification, redundancy, and sibling consistency belong to quality

Perform a semantic simplification pass under [GEN-CONS-03](../standards/universal/rules/gen-cons-03.md). Inspect control flow and data construction, trace supported producers and consumers, and request removal of unnecessary complexity when a concrete clearer alternative preserves behavior. Findings identify that alternative, establish equivalence, and explain the unnecessary maintenance burden under the shared evidence threshold. Code that works can still violate this rule; syntax resemblance alone cannot establish the violation.

Review work beyond the minimum sufficient solution and unexplained differences from comparable existing work under the standard's evidence threshold. Search siblings with the same role and compare naming, parameter and return shape, error/log/retry/cache behavior, and logic flow. Establish comparability and missing justification before flagging divergence. Identify removable work and its cost when reporting behavior-free wrappers, duplicate logic, impossible defensive checks, or parallel compatibility paths; abstraction or a single caller alone is insufficient. For a defensive-check finding, trace value provenance and show that no public, external, dynamic, unsafe, persistence, or deserialization boundary exists and that supported execution cannot invalidate the condition independently, applying `GEN-SAFE-03`'s trust-boundary validation rule. A first-party producer postcondition does not justify the check merely because the type cannot fully express it. Cite the exact producer test that proves the checked postcondition; broad coverage and the helper's name are not evidence. Tool-detectable dead/unused code stays with lint.

## Permanent-test value belongs to testing

Review proposed and existing tests within the resolved scope under [TST-CORE-04](../standards/testing/rules/tst-core-04.md). Retain tests contributing behavioral coverage without a separate lasting-value justification; preserve zero-gain tests that protect distinct supported behavior or meaningful edge cases, including compiler behavior permitted by TST-CORE-10. Request removal of every test meeting none of those criteria and its orphaned helpers; one-time edit proof belongs in validation notes. Findings identify what the assertions protect, the coverage contribution or retained-suite evidence, and why no distinct supported behavior or meaningful edge case is lost.

Check output assertions under [TST-CORE-10](../standards/testing/rules/tst-core-10.md): require observable effects or structure, with exact warning/log/error wording only for an explicit supported contract. When wording is incidental but the test adds value, request behavior-preserving assertion changes rather than deleting the useful test. Coverage reports and scanner output cannot decide these semantic questions.

## Semantic proxies require removal requests

Inspect tests, validators, scanners, and CI gates in scope and the supporting checks they invoke. For each check, compare the requirement it claims to establish with what it actually observes. Request removal of every check that substitutes wording, source shape, branch counts, or another inadequate proxy for readability, intent, correctness, or policy meaning; include helpers left unused by its removal. State the claimed requirement, actual observation, and why that observation cannot establish the claim. Do not replace the check with an equivalent proxy or treat a passing gate as semantic proof.

Preserve checks of executed behavior, compiler behavior permitted by [TST-CORE-10](../standards/testing/rules/tst-core-10.md), syntax, and genuinely machine-checkable structural contracts. [TST-CORE-04](../standards/testing/rules/tst-core-04.md) and TST-CORE-10 own test validity; a structural check still has to satisfy those rules when implemented as a test. Test findings belong to testing; findings about other gates belong to quality. Reuse this pass's findings instead of duplicating them across areas.

## Mechanical diagnostics stay mechanical

Do not spend semantic-review effort on type errors, unused imports/variables, formatting, import ordering, or other compiler/linter facts. `style.md` may report actual command results; remediation belongs to `coding:lint` or `coding:fix` as appropriate.

## Evidence and dispositions

Every blocker's existing evidence field supplies the governing source with a brief rule explanation, applicability proof, and concrete impact required by the evidence-based feedback rule (`CRV-FDBK-01`). Specific non-blocking feedback, including speculation, carries context and states uncertainty; it cannot require work. PR reviews use their own priority/kind schema. Local area reports put optional feedback outside the finding/disposition registry, counts, and confirmation questions, because every outstanding registered finding blocks local closure.

A local finding has one status: `open`, `fixed`, `acknowledged`, `deferred`, or `skipped`. Verified `fixed` and valid `acknowledged`/`skipped` findings are closed. Closed risk dispositions require rationale, owner, and recheck condition; P0/P1 also require explicit risk-acceptance authority/evidence. `open`, `deferred`, and malformed risk dispositions remain outstanding and block closure. Never change status merely to produce a passing verdict. Preserve settled dispositions, reopening only with cited new invalidating evidence, and stop once required checks pass and evidenced defects are resolved.
