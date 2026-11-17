# Action: for-maintenance

Loaded by `SKILL.md` for pending test markers (`it.todo`, `describe.todo`, test TODOs), coverage gaps, fixture restructuring, redundancy cleanup, and compile-time targets. Single-phase: run [procedure.md](procedure.md) steps 1–6 in one pass.

## Pending markers and coverage gaps

Inventory owned pending markers in the baseline (procedure step 1), complete each through the test → measure → prove → keep loop (procedure step 3) and coverage loop (step 4), and require no remaining owned pending markers at the end. Compile-time targets use the compiler batches in procedure step 2.

## Fix existing test issues

List all applicable test files with the resolved runtime and compiler-test patterns. The Tier 0/1 owner handles the bounded scope directly; a qualifying coordinated run may split more than 25 files into batches of 10, max 8 concurrent. Each batch owner identifies standards violations and logic errors in existing tests; fixes type errors (no `any`), applies the AAA pattern where relevant, corrects naming, and adds missing documentation; then verifies with the applicable project test, lint, and type-check commands and, when runtime sources exist, confirms coverage is unchanged. After any material rewrite of an initially passing runtime or compiler oracle, renew its `TST-CORE-02` sensitivity proof per procedure step 3. Retry any batch that leaves issues open.

## Redundancy cleanup (plan, then bounded removal)

Test redundancy cleanup is remove → measure → restore: remove one candidate, rerun focused tests and coverage, keep it removed only if signal and coverage are unchanged; otherwise restore it. Never infer redundancy from similar prose alone; remove least-risky candidates first.

**Source-file-scoped runtime coverage**: each runtime test file mirrors one eligible runtime source file (`src/auth/service.ts` → `spec/auth/service.spec.ts`), and coverage is verified per mirrored source file. A test that contributes to its own source file's coverage stays even when globally redundant, and a test verifying a distinct behavior stays even when it covers the same lines as another. A test is redundant only if it contributes neither coverage nor distinct behavior. Declaration shape and checked-in repository content are carved out: exact type/interface members, signatures, exports, schema fields, barrel layout, existence, content, inventory, parity, and systematic-property assertions are removed under `TST-CORE-10`, `TST-CORE-12`, and `TST-CORE-13` regardless of coverage. Focused compile-time cases permitted by `TST-CORE-10` remain semantic evidence. Properties of freshly generated output remain behavioral evidence.

**Phase A — plan**: the Tier 0/1 owner reads every test file and, per test, determines lines covered, branches exercised, and the unique behavior verified. A qualifying coordinated run may assign one read-only planner. Redundancy patterns to flag (always scoped to the mirrored source file):

- same logic with different data values that adds neither coverage nor a distinct behavior;
- same lines AND same behavioral aspect as another test;
- artificial scenarios contributing neither coverage nor behavioral documentation;
- wrapper-function tests without unique coverage or insight;
- assertions over checked-in existence, absence, bytes, literals, inventories, path layout, parity, or systematic properties — flag regardless of coverage contribution (`TST-CORE-13`);
- assertions over exact type/interface members, signatures, export inventories, schema declaration fields, or barrel/re-export layout — flag regardless of coverage contribution (`TST-CORE-10`, `TST-CORE-12`). Do not flag a representative consumer case permitted by `TST-CORE-10`. Tests that execute a runtime schema parser with valid or invalid input remain behavior tests.

The plan groups candidates by file, marks each `safe_to_remove` | `uncertain` | `keep`, and emits removal tasks (max 10 tests per task, least-risky first).

**Phase B — removal**: the Tier 0/1 owner processes candidates directly. A qualifying coordinated run may assign disjoint removal batches (max 8 concurrent). For each assigned test:

1. Pre-removal check: run the mirrored source file's focused coverage; it must read 100%.
2. Remove the single test and save.
3. Re-run the focused coverage and compare.
4. Decide: mirrored coverage maintained AND no distinct supported behavior or meaningful edge case is lost → keep removed and delete orphaned helpers; otherwise RESTORE immediately and mark `essential`. Coverage alone cannot establish redundancy. **Do not restore a checked-in repository-content assertion** (`TST-CORE-13`): where it was the only cover, exercise the content's consumer or generator and assert runtime behavior or generated-result structure, replacing coverage only through consumer or generator behavior. Report any remaining gap. Apply the test-value and output-assertion criteria in procedure step 3 before removal; record one-time edit proof in validation notes.

Aggregate removal reports, verify 100% is maintained per mirrored source file, and compute redundancy metrics (removed, kept-as-essential, redundancy %).

For a compile-time candidate, prove redundancy while the candidate oracle remains present: remove it only when both the candidate and an identified retained oracle fail under the same temporary implementation mutation that represents the same named compiler-semantic regression, then restore the implementation and rerun green before deletion. From that mutation through every observing focused or project-wide type command, restoration, and green rerun, quiesce all other writes in the same project or run the proof in an isolated workspace; non-mutating removal batching outside the critical section may remain parallel. Unrelated retained-oracle sensitivity and a passing command after deleting the only oracle are not proof. Remove declaration/signature-shape inventories under `TST-CORE-10` regardless; keep unique compiler-semantic evidence permitted by that rule unless the paired proof succeeds.

## Fixture and test-double restructuring (plan, then execute)

Plan fixtures before changing them: identify consumers, lifecycle, mutation, and migration order. For a fixture rewrite, migrate every consumer, run focused suites, then the full suite. Do not leave old and new fixture systems in parallel.

**Phase A — plan**: the Tier 0/1 owner inventories all test support files (`spec/fixtures/**`, `spec/mocks/**`, inline fixtures/mocks), identifies duplication (similar fixture data, repeated mock configurations, inline fixtures that could be shared), assesses organization and naming, finds unused files (fixtures never imported, mocks never used, factories without references), and emits a restructuring plan: consolidations, organization moves, deletion candidates, and the migration order. A qualifying coordinated run may assign one planner.

**Phase B — execute**: the Tier 0/1 owner executes a bounded plan. A qualifying coordinated run may assign disjoint parts of a complex plan (max 8 implementers):

1. Create the new shared fixture/mock files.
2. Migrate fixtures/mocks from old locations.
3. Update imports in every consuming test file.
4. Remove the old definitions, then delete unused files named by the plan.
5. Verify after each major change: run the tests, fix broken imports, then type-check and lint.

Report created/deleted files, consolidation counts, and verification results.
