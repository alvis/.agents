# Test procedure — classification, batching, proof, gates, and report

Every action in `SKILL.md` follows this procedure; the action file supplies only what is specific to its change type. Cite testing rule IDs; never restate them.

<IMPORTANT>
Classify the selected test work through the Coding workflow before choosing topology. Tier 0/1 bounded work stays with one test owner for authoring, focused checks, and self-review. Add an independent reviewer only when the change is consequential, explicitly requested for review, or publication-bound. Use coordinated multi-owner execution only for Tier 3, multiple dependent milestones, or genuinely independent slices too large for one bounded owner. A batch is a verification unit, not permission to delegate it.
</IMPORTANT>

The selected topology governs every step. A Tier 0/1 owner performs analysis, authoring, checks, and self-review directly. An independent reviewer is read-only and appears only on the predicate above. A qualifying coordinated run may assign disjoint batches, with at most **8 parallel implementers**, and aggregates each wave before moving on. Every dispatch is a mission capsule naming the exact scope, expected result, the applicable standards to apply under `essential:directions/standards.md`, active work root, and only the relevant contract/evidence paths. Delegates do not reread broad work journals unless the assignment is a resume or cross-slice alignment task; they never write main-agent-owned pointers/overviews or delegate further. Every writer returns explicit `generated_files` to the main agent.

## Phases

This skill never edits production source, so an action that straddles a source change runs twice, selected by `--phase=before|after`; the caller makes the change between the phases. `for-maintenance` is single-phase and runs steps 1–6 in one pass.

- **`before`**: run steps 1–3 for the oracles the action defines; the step 4 coverage loop does not run. Return red evidence for new or changed behavior, or pins plus a green baseline with `TST-CORE-02` sensitivity proof (`TST-CORE-16`), with the oracle list and the observing commands. Run no step 5 gates; the red or pinned checkpoint cannot pass them.
- **`after`**: rerun the same oracles unchanged, then complete steps 4–6, including the step 5 gates and the final report. `for-refactor` and `for-performance` follow `TST-CORE-16` for coverage of untouched code, with `TST-COVR-01` governing the ready/merge gate.

## 1. Classify and analyze

Classify each promise as runtime behavior, compiler-observable semantics, or declaration shape before inventory. Coverage is fixed at 100% for statements, branches, functions, and lines in every selected runtime source file. Compiler-observable behaviors permitted by `TST-CORE-10` are eligible focused compile-time targets but do not participate in runtime coverage; exercise them through representative consumer usage. Declaration shape alone — members, exact signatures or overload, predicate, or assertion inventories, schema fields, export inventories, and barrels — is ineligible (`TST-CORE-10`, `TST-CORE-12`); validate it with type diagnostics and affected-consumer builds. Executable runtime schema validators remain runtime sources and are tested with valid and invalid inputs through their supported parser entrypoints.

Resolve the configured type-test mechanism and command when compiler-semantic targets exist; resolve runtime-test and coverage mechanisms only when eligible runtime sources exist. Group targets by owning project, derive each project's applicable discovery patterns from its configuration and conventions, including compiler-test patterns such as tsd's `**/*.test-d.ts`, run the coding scanner separately for each group with its project root as `--test-root` plus every resolved compiler-test glob as a repeated `--test-pattern` argument, then discover the applicable test files with filesystem pattern search (never `find` in bash). Never combine targets owned by different test roots in one scanner invocation. The Tier 0/1 owner performs this analysis directly; a qualifying coordinated run may assign one Test Analysis delegate.

1. **Discover test configuration**: locate the configured type-test tool and command for compiler-semantic targets, and record every compiler-test path pattern before counting or batching tests. Only when eligible runtime sources exist, locate `vitest.config.ts` or equivalent, verify the runtime coverage provider, and record runtime exclusions.
2. **Run existing applicable tests** and note any failures: focused compiler tests for compiler-semantic targets, and the runtime suite only when eligible runtime sources exist.
3. **Generate runtime coverage when applicable**: only for eligible runtime sources, run `npm run coverage` / `vitest --coverage` or the configured equivalent and extract line, branch, statement, and function coverage. Record runtime coverage as not applicable for compiler-only scopes.
4. **Identify uncovered runtime code when applicable**: list fully uncovered files and the uncovered line ranges, branches, and functions of partially covered files.
5. **Classify non-runtime targets**: route compiler-observable behaviors permitted by `TST-CORE-10` to representative consumer cases outside runtime coverage. For each semantic target, inspect the discovered compiler-test files and map every existing oracle that already protects it; only an unmapped promise is eligible for a new case. Exclude declaration/signature-shape targets (`TST-CORE-10`, `TST-CORE-12`); record them for type diagnostics and affected-consumer builds.
6. **Report baseline metrics**: applicable overall and per-runtime-file percentages, `uncovered_files`, `partially_covered_files`, `compiler_semantic_targets`, `compiler_oracle_files`, the target-to-existing-oracle map, `uncovered_compiler_promises`, `static_shape_files`, existing applicable test count, and failing tests. Mark runtime coverage fields not applicable when no runtime sources are selected.

Inventory the selected targets, current applicable tests, pending markers, fixture ownership, configured exclusions, and discovered compiler oracles. Verify the baseline is present and accurate before planning batches from it.

## 2. Batch

Partition independent runtime source/test pairs into coherent batches: 2–5 source files and at most 500 source lines per batch; put independent compile-time targets in separate focused batches of at most 10 target/resources each, so a dispatch stays within the repository resource ceiling. Create compiler batches only for `uncovered_compiler_promises`, give each its existing-oracle map so it reuses or extends the owning compiler-test file instead of duplicating a case, and never batch declaration/signature inventories or exact shape. No runtime batch owns a pure type, barrel, non-executable schema-shape-only, or export-inventory target.

**Batching algorithm**: start with the first uncovered file, add files until 5 files OR 500 lines is reached, create the batch, repeat until all files are assigned. Example:

```
Source files: auth/service.ts (120), auth/controller.ts (180), users/service.ts (150),
              users/controller.ts (200), posts/service.ts (100), posts/controller.ts (300)
Batches:      1: auth/service, auth/controller, users/service   (450 lines, 3 files)
              2: users/controller, posts/service                (300 lines, 2 files)
              3: posts/controller                               (300 lines, 1 file)
```

Record separate runtime and compiler batch maps in structured task tracking (one todo per batch) so no target is skipped. A Tier 0/1 owner executes the maps directly. A qualifying coordinated run may dispatch each kind in waves of at most 8 concurrent disjoint batches and aggregates every batch in one wave before scheduling the next. Re-batch and retry incomplete runtime or compiler work. Serialize shared fixtures, global setup, snapshots, and integration state.

## 3. Test → measure → prove → keep

For every proposed case: for runtime behavior, execute a real implementation through a supported public entrypoint, add the smallest observable assertion, run its focused suite, and measure the intended source or branch. For compiler semantics, add the smallest representative consumer acceptance or rejection case, run the focused type-test command without invoking runtime coverage, and keep it only when it protects a behavior permitted by `TST-CORE-10`.

Under `TST-CORE-02`, a case added for already-correct behavior must also fail under a temporary implementation mutation or equivalent controlled sensitivity proof, after which the implementation is restored and the focused case reruns green; record the proof and restoration. A red test returned by `before` is kept on its red-first evidence. Remove any initially passing regression case whose sensitivity was not proven. Apply `TST-CORE-04` to proposed and existing scoped tests: retain behavioral coverage without a separate lasting-value justification, retain distinct supported behavior or meaningful edge cases without coverage gain, and remove tests meeting none of those criteria with orphaned helpers. Keep one-time edit proof in validation notes. Assert supported output effects or structure; pin exact wording only for an explicit supported contract (`TST-CORE-14`). Never retain declaration/signature-shape (`TST-CORE-10`), export/static-data (`TST-CORE-12`), or checked-in-content (`TST-CORE-13`) tests.

Authoring may run in parallel where safe outside a sensitivity critical section; from each temporary runtime or compiler mutation through every observing test/type command, restoration, and green rerun, quiesce all other writes in the same project or run the proof in an isolated workspace. Every sensitivity record names the exact revision or tree hash, mutated inputs, restored inputs, oracle, and observing command; any change to one of those bound inputs invalidates the record.

## 4. Coverage loop

Cover happy paths, meaningful boundaries, failures, and integration seams until every selected runtime source reaches 100% statements, branches, functions, and lines (`TST-COVR-01`). Report uncovered metrics per runtime source; aggregate coverage cannot conceal a weak file. An instrumentation limitation is a blocker to report, not permission to lower the target. Each runtime batch owner writes tests one behavior group at a time (one function's contract, one branch family, or one scenario, under `TST-COVR-03`), verifying coverage after each group, and runs this loop **for each source file**:

1. **Initial coverage check**: `vitest --coverage <spec path>`; note current coverage and the first uncovered line/branch.
2. **Progressive writing loop** (repeat until statements, branches, functions, and lines are each 100%): a. Write the tests for ONE behavior group that reach specific uncovered runtime lines/branches through a supported public entrypoint (AAA pattern, proper types, per standards). b. Re-run the focused coverage command and parse the new numbers. c. For already-correct behavior, prove each initially passing case detects the named regression (`TST-CORE-02`). d. Decide per test: coverage increased → KEEP only after applicable `TST-CORE-02` proof; coverage unchanged → KEEP only when the test provides distinct behavioral evidence and satisfies `TST-CORE-02`, otherwise DELETE it and write a different one. e. All four metrics at 100% → next file in the batch; otherwise repeat from (a).
3. **Batch completion verification**: run coverage for all the batch's test files together; verify every source file is at 100%; count tests created vs deleted.
4. **Standards compliance**: lint the created test files, fix type errors (no `any`), apply the AAA pattern where relevant, correct naming, add missing documentation, and verify with the applicable project test, lint, and type-check commands; when runtime sources exist, confirm coverage is unchanged. After any material rewrite of an initially passing runtime or compiler oracle, renew its `TST-CORE-02` sensitivity proof while the rewritten oracle is present, restore the implementation, and rerun the focused case green. For more than 25 test files, a qualifying coordinated run may split compliance into batches of 10, max 8 concurrent.

A compiler batch owner adds one consumer-like case at a time, runs the configured type-test/typecheck command after each case, and keeps only distinct compiler-semantic evidence; compiler batches never invoke Vitest or runtime coverage.

Each runtime batch reports: per-file coverage (lines/branches/statements/functions), `tests_created` / `tests_kept` / `tests_deleted`, applicable `sensitivity_proof` and `implementation_restored` evidence, standards compliance, and whether all four metrics reached 100% in every file. Compiler batches report the same sensitivity/restoration fields for every initially passing oracle, with target-to-oracle coverage. **Retry rule**: if any runtime batch reports partial or failed, re-batch the incomplete files and rerun them with the same owner; only a qualifying coordinated run may dispatch another wave of at most 8 disjoint batches.

## 5. Gates

After each batch, run its focused runtime or compile-time tests and runtime coverage where applicable. If production behavior is wrong, route to `coding:fix`; do not edit source here. After all batches (at `after` or in a single-phase run), run these mechanical gates once per state of the tree. They do not stand in for the owning test writer's behavioral self-review or, when the independent-review predicate applies, its independent final review — in place, or through `test-runner` when the sweep's raw output would swamp this session; that run is authoritative for the files it measured, and no agent is dispatched to re-confirm a result whose inputs have not changed.

1. **Coverage**: when runtime sources are selected, run the full coverage command; statements, branches, functions, and lines are each 100% in every selected runtime source file. Not applicable to a compiler-only scope.
2. **Execution**: applicable focused compile-time tests pass, and the full runtime suite passes when runtime sources are selected; note flaky tests. A compiler-only scope does not require a runtime framework, runtime suite, or coverage command.
3. **Standards**: lint clean, type-check clean, and affected-consumer builds clean for changed public shape.
4. **Efficiency metrics** (`for-maintenance` only; not applicable to other actions): count source files, applicable test files, and total tests; record applicable suite execution time. When runtime sources are selected, compute tests per source file and the coverage-per-test ratio. The final report requires these because deletion and fixture restructuring make them unreconstructable from the baseline and per-batch deltas.

## 6. Self-review and independent review

Self-review the final test diff for missing behavior, weak assertions, fixture correctness, nondeterminism, and per-source coverage. When the independent-review predicate above applies, request one read-only final test review over the same scope. Apply justified test-only corrections. Every such correction invalidates the sweep in step 5, which measured the pre-correction files: for each added or materially changed runtime or compiler oracle whose accepted baseline is green, repeat its `TST-CORE-02` sensitivity proof while the corrected oracle is present, restore the implementation, rerun the focused case, then rerun the affected gates and the full sweep after the last accepted edit, and let that result complete the workflow. Re-running proof and gates over changed files is not re-confirmation — the earlier evidence is stale, not doubted.

When a gate fails, fix the cause and re-run that gate; repeat until every gate passes or a concrete blocker remains, then report the blocker instead of looping. Return to the step that owns a blocker; report with details only when it is not fixable here.

## Final report shape

Aggregate into one report covering: applicable baseline coverage → runtime and compile-time batches executed, tests created/kept/deleted, sensitivity proofs, and implementation restorations, including renewed proof for final-review corrections → applicable final verified coverage, compiler-semantic cases, all-passing status, topology, phase, red evidence or green-baseline oracle list for a `before` return, self-review and applicable independent-review results, focused/full commands, and per-runtime-source statements/branches/functions/lines. `for-maintenance` adds redundancy candidates, removed, kept-essential, existing test issues fixed, fixtures consolidated, unused files deleted, and efficiency metrics; mark these not applicable for every other action. Mark runtime-only fields not applicable for compiler-only scopes. If any applicable gate remains failing, name its concrete blocker and report the run incomplete.

Include the deduplicated `generated_files` from the direct owner and any delegated subtasks. Each writer follows `essential:references/output-manifest.md` while writing eligible work Markdown.
