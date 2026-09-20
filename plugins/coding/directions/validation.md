# Validation workflow

Read this after a coding change or when lint, type, test, build, or delivery verification is the selected operation.

Completed work follows one loop:

```text
edit → verify delivery → affected gates → save
       ↑ failure          ↑ failure
       └──────────────────┘
```

## Verify delivery

Confirm every stated requirement shipped against the code, tests, and documentation. Fix anything unmet, then reassess delivery and rerun failed or invalidated gates under the evidence contract below; retain unaffected passes.

## Reuse deterministic-check evidence

Before scheduling a check, compare its current inputs with the original successful execution. Reuse an existing check receipt or QA record; do not introduce a second cache. Record:

- exact command and arguments, working directory, shell, selected checks and execution mode;
- selected input inventory, including dependencies, generated inputs, file modes, additions and deletions, bound to the original immutable revision/base or exact content identities;
- governing scripts, configuration, manifests, lockfiles and toolchain identities; include selector/discovery inputs so newly matching files cannot escape validation;
- relevant environment assumptions: runtime/tool versions, platform, supplied variable identities and external-service state where the check depends on them, without storing secrets;
- outcome and exit status, evidence location and integrity identity, and which required gate the result covers.

Missing, failed, unverifiable or mismatched bindings require execution. A bare pass, patch ID, unchanged command string or clean worktree is insufficient. When dependency scope is unknown, expand it conservatively. Time, read-only investigation, handoff, status updates and metadata-only rewrites do not themselves invalidate a content-bound result; changed environment assumptions can. Keep the original execution identity and record the demonstrated current-input mapping, including any relocated worktree. Unproven path-sensitive equivalence requires a rerun; never relabel reuse as a new run.

After a correction, rerun failed checks and checks whose bound inputs changed, including affected consumers; carry forward other passes. Configuration, lockfile or toolchain changes invalidate their dependent checks, not unrelated checks. A lower-stack repair requires reassessing each descendant's input and base dependencies, not rerunning every descendant merely because its SHA changed. Revision-bound checks still require their exact revision; content equivalence cannot satisfy a stricter consumer.

Required gate coverage stays complete: reuse cannot split away failures, omit an uncovered leg, replace independent review, or waive required install/lock regeneration. Always perform current PR head/base verification, hosted CI and discussion checks, required authorization and publication checks under [publication](publication.md). Exact-revision local CI parity retains its own stricter contract. [Review evidence](review-evidence.md) owns semantic review coverage and reviewer confirmation, not this mechanical execution decision.

## Review timing

For a parent-owned delivery, follow [review ownership and evidence](review-evidence.md): children return self-checks, focused validation, and risks; the named parent owns one independent review after integration and documentation, before publication. Internal slice commits do not add independent review. Missing or contradictory ownership falls back to the timing below.

At Tier 0–1, the implementing owner self-reviews. When publication is the only independent-review trigger for bounded, non-consequential work, self-review before saving and let `coding:pr` provide the independent pass; do not add a separate local reviewer. Consequential work, Tier 2–3, and explicit local review requests require independent pre-save review through `coding:review-code`, which owns coverage and risk-based staffing.

Reuse applicable independent evidence across lifecycle and publication gates under [review ownership and evidence](review-evidence.md). [Publication](publication.md) owns its separate verification obligations. Coordination follows the Coding workflow's topology; report categories never justify a coordinator. When review is selected, [review](review.md) owns its findings and closure.

## Build consumers

After changing a public type, interface, signature, schema, export, function, or class, build every affected consumer in its own project root. Cross-project breakage is invisible from the changed project alone; lint and local types are not substitutes. Never substitute a declaration-shape test.

## Run affected gates

Tier 0 runs the focused mechanical checks its artifact needs. For Tier 1–3 source changes, the implementing owner invokes `coding:lint` on touched source; delegate only when scope or output warrants isolation. A violation returns to the change and invalidates its affected evidence, not every prior pass.

Type diagnostics and focused tests remain separate gates that lint cannot replace. Run type diagnostics for changed code, focused runtime tests through supported public entry points for changed behavior, and focused compile-time tests for compiler-observable behavior permitted by `TST-CORE-10`.

Run every gate from the changed project's root. Prefer its configured script. If neither IDE diagnostics nor a configured script exists, use the language-standard fallback: `tsc --noEmit` plus the project test script, `ty` and `pytest`, or `cargo clippy` and `cargo nextest run`. Never run `npm` in a project without `package.json`.

Proceed only when delivery verification, lint, types, affected-consumer builds, and applicable focused tests are covered by current passing execution or reusable evidence. Report executed and reused checks separately, with original receipt references and any remaining blocker.
