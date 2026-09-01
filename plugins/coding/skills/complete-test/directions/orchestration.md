# Complete-Test Execution — direct ownership, coordinated batches, and reports

Referenced from SKILL.md. The selected topology governs every sub-step. A
Tier 0/1 owner performs analysis, authoring, checks, and self-review directly.
An independent reviewer is read-only and appears only on the SKILL predicate.
A qualifying coordinated run may assign disjoint batches, with at most **8
parallel implementers**, and aggregates each wave before moving on. Every
dispatch is a mission capsule naming the exact scope, expected result,
applicable standards' `meta.md` files to read before editing
(`testing/meta.md`, `typescript/meta.md`, and `documentation/meta.md` where
applicable), the post-edit `scan.md` plus identified-rule-or-`write.md`
fallback procedure from the Coding workflow, active work root, and only the
relevant contract/evidence paths. Delegates do not reread broad work journals
unless the assignment is a resume or cross-slice alignment task; they never
write main-agent-owned pointers/overviews or delegate further. Every writer
returns explicit `generated_files` to the main agent.

## Sub-step 1 — Initial test analysis

Classify the selected targets before inventory. Resolve the configured type-test mechanism and command when compiler-semantic targets exist; resolve runtime-test and coverage mechanisms only when eligible runtime sources exist. Group targets by owning project, derive each project's applicable discovery patterns from its configuration and conventions, including compiler-test patterns such as tsd's `**/*.test-d.ts`, run the coding scanner separately for each group with its project root as `--test-root` plus every resolved compiler-test glob as a repeated `--test-pattern` argument, then discover the applicable test files with filesystem pattern search (never `find` in bash). Never combine targets owned by different test roots in one scanner invocation. The Tier 0/1 owner performs this analysis directly; a qualifying coordinated run may assign one Test Analysis delegate to:

1. **Discover test configuration**: locate the configured type-test tool and command for compiler-semantic targets, and record every compiler-test path pattern before counting or batching tests. Only when eligible runtime sources exist, locate `vitest.config.ts` or equivalent, verify the runtime coverage provider, and record runtime exclusions.
2. **Run existing applicable tests** and note any failures: focused compiler tests for compiler-semantic targets, and the runtime suite only when eligible runtime sources exist.
3. **Generate runtime coverage when applicable**: only for eligible runtime sources, run `npm run coverage` / `vitest --coverage` or the configured equivalent and extract line, branch, statement, and function coverage. Record runtime coverage as not applicable for compiler-only scopes.
4. **Identify uncovered runtime code when applicable**: for eligible runtime sources, list fully uncovered files and the uncovered line ranges, branches, and functions of partially covered files.
5. **Classify non-runtime targets**: route compiler-observable behaviors permitted by `TST-CORE-10` to representative consumer cases outside runtime coverage. For each semantic target, inspect the discovered compiler-test files and map every existing oracle that already protects it; only an unmapped promise is eligible for a new case. Exclude declaration/signature-shape targets such as exact members, signatures, schema fields, export inventories, and barrels; record them for type diagnostics and affected-consumer builds. Keep executable runtime schema validators eligible and test accepted and rejected inputs through their supported parser entrypoints.
6. **Report baseline metrics**: applicable overall and per-runtime-file percentages, `uncovered_files`, `partially_covered_files`, `compiler_semantic_targets`, `compiler_oracle_files`, the target-to-existing-oracle map, `uncovered_compiler_promises`, `static_shape_files`, existing applicable test count, and failing tests. Mark runtime coverage fields not applicable when no runtime sources are selected.

Verify the baseline is present and accurate before planning batches from it.

## Sub-step 2 — Progressive test writing (bounded batches)

Each batch owner handles 2–5 eligible runtime source files (max 500 source lines per batch) and writes tests ONE at a time, verifying coverage after each and retaining a zero-gain test only when it provides distinct behavioral evidence. For Tier 0/1, that batch owner is the single test owner throughout. No runtime batch owns a pure type, barrel, non-executable schema-shape-only, or export-inventory target. Runtime schema validators remain eligible runtime sources.

Create separate focused type-test batches only for `uncovered_compiler_promises`: compiler-observable behaviors permitted by `TST-CORE-10` that the baseline did not map to an existing oracle. Cap each compiler batch at 10 target/resources so the dispatch stays within the repository resource ceiling; split larger sets, record every batch in task tracking, and re-batch and retry incomplete work. Give each batch its existing-oracle map so it reuses or extends the owning compiler-test file instead of duplicating a case. These batches use representative consumer acceptance or rejection cases and the repository-native type-test/typecheck command. They do not claim runtime coverage. Do not batch declaration/signature inventories or exact shape.

**Batching algorithm**: start with the first uncovered file, add files until 5 files OR 500 lines is reached, create the batch, repeat until all files are assigned. Example:

```
Source files: auth/service.ts (120), auth/controller.ts (180), users/service.ts (150),
              users/controller.ts (200), posts/service.ts (100), posts/controller.ts (300)
Batches:      1: auth/service, auth/controller, users/service   (450 lines, 3 files)
              2: users/controller, posts/service                (300 lines, 2 files)
              3: posts/controller                               (300 lines, 1 file)
```

Record separate runtime and compiler batch maps in structured task tracking (one todo per batch) so no target is skipped. A Tier 0/1 owner executes the maps directly. A qualifying coordinated run may dispatch each kind in waves of at most 8 concurrent disjoint batches and aggregates every batch in one wave before scheduling the next. A compiler batch owner adds one consumer-like case at a time, runs the configured type-test/typecheck command after each case, and keeps only distinct compiler-semantic evidence. Authoring may run in parallel where safe outside a sensitivity critical section; from each temporary runtime or compiler mutation through every observing test/type command, restoration, and green rerun, quiesce all other writes in the same project or run the proof in an isolated workspace. When an already-correct compiler behavior gains an initially passing oracle, the batch owner follows `TST-CORE-02`: make the case fail through a temporary implementation mutation or equivalent controlled sensitivity proof, restore the implementation, rerun green, and report the proof/restoration with target-to-oracle coverage. Compiler batches never invoke Vitest or runtime coverage. Each runtime batch owner runs this loop **for each source file**:

1. **Initial coverage check**: `vitest --coverage <spec path>`; note current coverage and the first uncovered line/branch.
2. **Progressive writing loop** (repeat until statements, branches, functions, and lines are each 100%):
   a. Write ONE test that reaches a specific uncovered runtime line/branch through a supported public entrypoint (AAA pattern, proper types, per standards).
   b. Re-run the focused coverage command and parse the new numbers.
   c. For already-correct behavior, prove the initially passing case detects the named regression through a temporary implementation mutation or equivalent controlled proof, restore the implementation, and rerun the focused case green (`TST-CORE-02`).
   d. Decide: coverage increased → KEEP only after applicable `TST-CORE-02` proof; coverage unchanged → KEEP only when the test provides distinct behavioral evidence and satisfies `TST-CORE-02`, otherwise DELETE it and write a different one.
   e. All four metrics at 100% → next file in the batch; otherwise repeat from (a).
3. **Batch completion verification**: run coverage for all the batch's test files together; verify every source file is at 100% statements, branches, functions, and lines; count tests created vs deleted.
4. **Standards compliance**: lint the created test files, fix type errors, verify documentation.

Each runtime batch reports: per-file coverage (lines/branches/statements/functions), `tests_created` / `tests_kept` / `tests_deleted`, applicable `sensitivity_proof` and `implementation_restored` evidence, standards compliance, and whether all four metrics reached 100% in every file. Compiler batches report the same sensitivity/restoration fields for every initially passing oracle. Every sensitivity record in this workflow, including redundancy and compliance proofs, names the exact revision or tree hash, mutated inputs, restored inputs, oracle, and observing command; any change to one of those bound inputs invalidates the record. **Retry rule**: if any runtime batch reports partial or failed, re-batch the incomplete files and rerun them with the same owner; only a qualifying coordinated run may dispatch another wave of at most 8 disjoint batches. Incomplete compiler targets follow the compiler batch report and topology rules above.

## Sub-step 3 — Remove redundant tests (plan, then bounded removal)

**CRITICAL RULE — source-file-scoped runtime coverage**: each runtime test file mirrors one eligible runtime source file (`src/auth/service.ts` → `spec/auth/service.spec.ts`), and coverage is verified per mirrored source file. A test is redundant only if it contributes neither coverage nor distinct behavior. Declaration shape and checked-in repository content are carved out: exact type/interface members, signatures, exports, schema fields, barrel layout, existence, content, inventory, parity, and systematic-property assertions are removed under `TST-CORE-10` regardless of coverage. Focused compile-time cases permitted by that rule remain semantic evidence. Properties of freshly generated output remain behavioral evidence.

**Phase A — plan**: the Tier 0/1 owner reads every test file and, per test, determines lines covered, branches exercised, and the unique behavior verified. A qualifying coordinated run may assign one read-only planner. Redundancy patterns to flag (always scoped to the mirrored source file):

- same logic with different data values that adds neither coverage nor a distinct behavior;
- same lines AND same behavioral aspect as another test;
- artificial scenarios contributing neither coverage nor behavioral documentation;
- wrapper-function tests without unique coverage or insight;
- assertions over checked-in existence, absence, bytes, literals, inventories,
  path layout, parity, or systematic properties — flag regardless of coverage
  contribution (`TST-CORE-10`).
- assertions over exact type/interface members, signatures, export inventories, schema declaration fields, or barrel/re-export layout — flag regardless of coverage contribution (`TST-CORE-10`). Do not flag a representative consumer case permitted by that rule. Tests that execute a runtime schema parser with valid or invalid input remain behavior tests.

The plan groups candidates by file, marks each `safe_to_remove` | `uncertain` | `keep`, and emits removal tasks (max 10 tests per task, least-risky first).

**Phase B — removal**: the Tier 0/1 owner processes candidates directly. A qualifying coordinated run may assign disjoint removal batches (max 8 concurrent). For each assigned test:

1. Pre-removal check: run the mirrored source file's focused coverage; it must read 100%.
2. Remove the single test and save.
3. Re-run the focused coverage and compare.
4. Decide: mirrored coverage maintained → keep removed; dropped (even 1%) → RESTORE immediately and mark `essential`. **Do not restore a checked-in repository-content assertion** (`TST-CORE-10`): where it was the only cover, exercise the content's consumer or generator and assert runtime behavior or generated-result structure. Report any remaining gap. Before removing other tests, verify the test does not document a unique behavioral aspect (distinct semantic concept, invariant, or edge case) — if it does, keep it.

Aggregate removal reports, verify 100% is maintained per mirrored source file, and compute redundancy metrics (removed, kept-as-essential, redundancy %).

For a compile-time candidate, prove redundancy while the candidate oracle remains present: remove it only when both the candidate and an identified retained oracle fail under the same temporary implementation mutation that represents the same named compiler-semantic regression, then restore the implementation and rerun green before deletion. From that mutation through every observing focused or project-wide type command, restoration, and green rerun, quiesce all other writes in the same project or run the proof in an isolated workspace; non-mutating removal batching outside the critical section may remain parallel. Unrelated retained-oracle sensitivity and a passing command after deleting the only oracle are not proof. Remove declaration/signature-shape inventories under `TST-CORE-10` regardless; keep unique compiler-semantic evidence permitted by that rule unless the paired proof succeeds.

## Sub-step 4 — Fix test issues & standards compliance

List all applicable test files with the resolved runtime and compiler-test patterns. The Tier 0/1 owner handles the bounded scope directly. A qualifying coordinated run may split more than 25 files into batches of 10, max 8 concurrent. Each batch owner identifies standards violations and logic errors; fixes type errors (no `any`), applies the AAA pattern where relevant, corrects naming, and adds missing documentation; then verifies with the applicable project test, lint, and type-check commands and, when runtime sources exist, confirms coverage is unchanged. After any material rewrite of an initially passing runtime or compiler oracle, renew its `TST-CORE-02` sensitivity proof while the rewritten oracle is present, restore the implementation, and rerun the focused case green before accepting the correction. From each temporary mutation through every observing focused or project-wide test/type command, restoration, and green rerun, quiesce all other writes in the same project or run the proof in an isolated workspace; non-mutating compliance batching outside the critical section may remain parallel. Retry any batch that leaves issues open.

## Sub-step 5 — Restructure fixtures & test doubles (plan, then execute)

**Phase A — plan**: the Tier 0/1 owner inventories all test support files (`spec/fixtures/**`, `spec/mocks/**`, inline fixtures/mocks), identifies duplication (similar fixture data, repeated mock configurations, inline fixtures that could be shared), assesses organization and naming, finds unused files (fixtures never imported, mocks never used, factories without references), and emits a restructuring plan: consolidations, organization moves, deletion candidates, and the migration order. A qualifying coordinated run may assign one planner.

**Phase B — execute**: the Tier 0/1 owner executes a bounded plan. A qualifying coordinated run may assign disjoint parts of a complex plan (max 8 implementers):

1. Create the new shared fixture/mock files.
2. Migrate fixtures/mocks from old locations.
3. Update imports in every consuming test file.
4. Remove the old definitions, then delete unused files named by the plan.
5. Verify after each major change: run the tests, fix broken imports, then type-check and lint.

Never leave old and new fixture systems in parallel. Report created/deleted files, consolidation counts, and verification results.

## Sub-step 6 — Closing gates

Run these mechanical gates once per state of the tree — in place, or through `test-runner` when the sweep's raw output would swamp this session; either way that run is authoritative for the files it measured, and no agent is dispatched to re-confirm a result whose inputs have not changed. They do not stand in for the owning test writer's behavioral self-review or, when the SKILL predicate applies, its independent final review.

1. **Coverage**: when runtime sources are selected, run the full coverage command; statements, branches, functions, and lines are each 100% in every selected runtime source file. Runtime coverage is not applicable to a compiler-only scope.
2. **Execution**: applicable focused compile-time tests pass, and the full runtime suite passes when runtime sources are selected; note flaky tests.
3. **Standards**: lint clean, type-check clean, and affected-consumer builds clean for changed public shape.
4. **Efficiency metrics**: count source files, applicable test files, and total tests; record applicable suite execution time. When runtime sources are selected, compute tests per source file and the coverage-per-test ratio. The final report requires applicable metrics because deletion and fixture restructuring make them unreconstructable from the baseline and per-batch deltas.

All green → perform the owning writer's self-review, then hand off to an independent final reviewer only when the SKILL predicate applies. Every test-only correction either review justifies invalidates the sweep above, which measured the pre-correction files. For each added or materially changed runtime or compiler oracle whose accepted baseline is green, repeat its `TST-CORE-02` sensitivity proof while the corrected oracle is present, restore the implementation, and rerun the focused case. Then rerun the affected gates and the full sweep after the last accepted edit, and let that result complete the workflow. Re-running proof and gates over changed files is not re-confirmation — the earlier evidence is stale, not doubted. Any failure → return to the sub-step that owns the blocker; report with details only when a blocker is not fixable here.

## Final report shape

Aggregate into one report covering: applicable baseline coverage → runtime and compile-time batches executed, tests created/kept/deleted, sensitivity proofs, and implementation restorations, including renewed proof for final-review corrections → redundancy candidates, removed, kept-essential → issues fixed → fixtures consolidated, unused files deleted → applicable final verified coverage, compiler-semantic cases, all-passing status, efficiency metrics, and per-runtime-source statements/branches/functions/lines. Mark runtime-only fields not applicable for compiler-only scopes. If any applicable gate remains failing, name its concrete blocker and report the run incomplete.

Include the deduplicated `generated_files` from the direct owner and any delegated subtasks. No delegate runs file sizing; after every artifact writer returns, the main agent checks only eligible work Markdown inside the target `.state/`.
