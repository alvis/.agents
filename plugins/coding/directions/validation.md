# Validation workflow

Read this after a coding change or when lint, type, test, build, or delivery verification is the selected operation.

Completed work follows one loop:

```text
edit → verify delivery → affected gates → save
       ↑ failure          ↑ failure
       └──────────────────┘
```

## Verify delivery

Confirm every stated requirement shipped against the code, tests, and documentation. Fix anything unmet, then restart this loop.

## Review timing

For a parent-owned delivery, follow [review ownership and evidence](review-evidence.md): children return self-checks, focused validation, and risks; the named parent owns one independent review after integration and documentation, before publication. Internal slice commits do not add independent review. Missing or contradictory ownership falls back to the timing below.

At Tier 0–1, the implementing owner self-reviews. When publication is the only independent-review trigger for bounded, non-consequential work, self-review before saving and let `coding:pr` provide the independent pass; do not add a separate local reviewer. Consequential work, Tier 2–3, and explicit local review requests require independent pre-save review through `coding:review-code`, which owns coverage and risk-based staffing.

Reuse applicable independent evidence across lifecycle and publication gates under [review ownership and evidence](review-evidence.md). [Publication](publication.md) owns its separate verification obligations. Coordination follows the Coding workflow's topology; report categories never justify a coordinator. When review is selected, [review](review.md) owns its findings and closure.

## Build consumers

After changing a public type, interface, signature, schema, export, function, or class, build every affected consumer in its own project root. Cross-project breakage is invisible from the changed project alone; lint and local types are not substitutes. Never substitute a declaration-shape test.

## Run affected gates

Tier 0 runs the focused mechanical checks its artifact needs. For Tier 1–3 source changes, the implementing owner invokes `coding:lint` on touched source; delegate only when scope or output warrants isolation. A violation returns to the change and restarts verification.

Type diagnostics and focused tests remain separate gates that lint cannot replace. Run type diagnostics for changed code, focused runtime tests through supported public entry points for changed behavior, and focused compile-time tests for compiler-observable behavior permitted by `TST-CORE-10`.

Run every gate from the changed project's root. Prefer its configured script. If neither IDE diagnostics nor a configured script exists, use the language-standard fallback: `tsc --noEmit` plus the project test script, `ty` and `pytest`, or `cargo clippy` and `cargo nextest run`. Never run `npm` in a project without `package.json`.

Proceed only when delivery verification, lint, types, affected-consumer builds, and applicable focused tests are clean.
