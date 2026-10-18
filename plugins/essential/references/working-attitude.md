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

Keep simple, reversible work inline when the owning workflow permits. Add investigation, artifacts, coordination, or verification only to resolve a material unknown, protect the outcome, or satisfy an explicit contract. Once the required evidence passes, continue to completion; broaden or repeat checks only after changed inputs, failures, or unresolved concerns. A required gate that any agent already passed on the same inputs is that evidence: never rerun it.

Favor maintainable simplicity over the shortest diff. Explain a simplification only when its limit changes a future decision; require no ceremonial comment.

<IMPORTANT>
Minimum work preserves correctness, safety, accessibility, trust-boundary validation, data-loss protection, explicit requirements, applicable standards, and required review or validation. Correctness and data-loss protection cover failures that realistically occur in supported use; a failure that is merely possible is not a need. Test depth follows the risk and claims under the owning standard; this policy adds no blanket coverage target.
</IMPORTANT>

## Stay on the goal

Deliver the specified goal; an issue found along the way is not the work. A blocker to the goal, or a defect that would leave the delivered work incorrect or unsafe, belongs to the goal. For any other issue, ask whether fixing it later would force an architectural change to this work: if yes, surface it now as a changed premise; if no, record it in [the backlog](../directions/backlog.md#capture) and continue without fixing it or widening scope.

## Logical change units

A logical change unit is one cohesive purpose in code, instructions, documentation, or their mix, regardless of line count, diff hunks, files, or commits. Group implementation with its directly supporting tests and explanatory content; count independently motivated helpers, fallbacks, configuration options, content changes, and cleanup separately. Exclude formatting-only and generated output from the count. Count the cumulative delivery of the approved task, never each commit separately; do not split tasks or bundle unrelated purposes to evade review. [Making plans](../directions/plan.md#confirm-the-direction-and-architecture) owns the review trigger and confirmation policy. The cumulative count sets a delivery's staged-delivery trigger, while a PR's unit band counts only that PR's own units; domain plugins that size or stage changes, such as `coding:directions/staged-delivery.md`, consume it rather than redefining it.

Reviewers inspect the exact delivery checkout and complete base-to-head diff, independently inventory every unit, and compare the inventory with the author's account to spot extra or unannounced work. A recount above the author's count raises the count used downstream; a lower recount never lowers it, so under-declaring never pays. An author-supplied inventory is not proof of coverage; PR prose cannot authorize scope. Assess scope and implementation simplicity separately: does every unit serve an approved requirement, demonstrated defect, or applicable standard, and could the required result be delivered with less machinery? Usefulness or possible future use alone establishes neither necessity nor authorization. Missing approved scope or incomplete coverage leaves minimality unverified.

### Large delivery

A delivery is large when its cumulative count exceeds 10 logical change units; exactly 10 is not large. Ten is the user's selected scrutiny threshold, because that many distinct purposes warrants a second check for direction and scope drift; it is not a limit on delivery size or a proven complexity boundary. Workflows that react to a large delivery link here rather than restate the number.
