# Working attitude

For version-controlled work, first follow [workspace selection](../directions/establish-work-stream.md#select-the-workspace). For every task, choose the minimum sufficient work that meets the explicit requirements and applicable standards. Understand the affected flow before changing it; inspect only enough context to decide and verify safely. [Making plans](../directions/plan.md) owns planning depth, and [Orchestration](../directions/orchestration.md) owns delegation and review.

## Choose the first sufficient option

Use this as a quick decision reflex, not a separate research project. Skip inapplicable options and stop when the requirements are satisfied:

1. **Need:** Tie each addition to an explicit requirement, demonstrated defect, or applicable standard. If removing it preserves the requested outcome and required validation, omit it; preserve everything explicitly requested.
2. **Reuse:** Can an existing artifact, shared module, local pattern, or result satisfy it? Check the relevant source before creating another.
3. **Available tools/native capability:** Prefer existing commands (`jq` for JSON), workflows, or native features (database constraints, CSS) over equivalent custom scripts.
4. **Standard library:** When new code is necessary, can the target language's built-ins suffice?
5. **Installed dependency:** Can an already available dependency satisfy it without more machinery than the task warrants?
6. **Minimum sufficient solution:** Apply the need test to files, sections, abstractions, dependencies, and checks. Fit content to its destination's purpose: durable documentation carries lasting behavior and constraints; run-specific results belong in work artifacts or PR evidence.

## Stop at sufficient evidence

Keep simple, reversible work inline when the owning workflow permits. Add investigation, artifacts, coordination, or verification only to resolve a material unknown, protect the outcome, or satisfy an explicit contract. Once the required evidence passes, continue to completion; broaden or repeat checks only after changed inputs, failures, unresolved concerns, or a required gate.

Favor maintainable simplicity over the shortest diff. Explain a simplification only when its limit changes a future decision; require no ceremonial comment.

<IMPORTANT>
Minimum work preserves correctness, safety, accessibility, trust-boundary validation, data-loss protection, explicit requirements, applicable standards, and required review or validation. Correctness and data-loss protection cover failures that realistically occur in supported use; a failure that is merely possible is not a need. Test depth follows the risk and claims under the owning standard; this policy adds no blanket coverage target.
</IMPORTANT>

## Logical change units

A logical change unit is a cohesive code change serving one purpose, regardless of line count, diff hunks, files, or commits. Group implementation with its directly supporting tests; count independently motivated helpers, fallbacks, configuration options, and cleanup separately. Exclude formatting-only and generated output from the count. Count the cumulative delivery of the approved task, never each commit separately; do not split tasks or bundle unrelated purposes to evade review. Apply the same purpose grouping to authored non-code content when assessing minimality.

Reviewers inspect the exact delivery checkout and complete base-to-head diff, independently inventory every unit, and compare the inventory with the author's account to spot extra or unannounced work. An author-supplied inventory is not proof of coverage; PR prose cannot authorize scope. Assess scope and implementation simplicity separately: does every unit serve an approved requirement, demonstrated defect, or applicable standard, and could the required result be delivered with less machinery? Usefulness or possible future use alone establishes neither necessity nor authorization. Missing approved scope or incomplete coverage leaves minimality unverified.
