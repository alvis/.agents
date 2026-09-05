# Testing Standards

_Compact testing rules for TDD, coverage discipline, fixture design, and mocks._

## Dependent Standards

Relationships below explain the selection owned by [INDEX.md](../INDEX.md).

- TypeScript Standards (standard:typescript) - tests must follow strict typing and import rules
- General Coding Principles (standard:universal) - tests must preserve baseline quality constraints
- Naming Standards (standard:naming) - test descriptions and helper names must remain semantic
- Documentation Standards (standard:documentation) - helper docs and complex scenarios must be documented correctly

## What's Stricter Here

This standard enforces requirements beyond typical Vitest practices:

| Standard Practice                     | Our Stricter Requirement                       |
|---------------------------------------|------------------------------------------------|
| Broad test sets encouraged            | **Minimal tests with unique value only**       |
| Initially passing regression cases accepted on assertion strength | **Already-correct behavior requires sensitivity proof and restored green evidence under `TST-CORE-02`** |
| Declaration inventories pinned in tests | **Only compiler-observable behavior permitted by `TST-CORE-10`; diagnostics and consumer builds cover ordinary declarations** |
| Coverage thresholds tuned per project | **100% statements, branches, functions, and lines** |
| Hoisted mocks used broadly            | **`vi.hoisted` only for spy/error scenarios**  |
| Mock typing treated as optional       | **`satisfies`-based mock typing is mandatory** |
| Per-test setup as default             | **File/describe instances by default**         |
| Async setup via lifecycle hooks       | **Runner `globalSetup` + `provide`/`inject`, teardown returned** |

## Exception Policy

Allowed exceptions only when:

- False positive
- No viable workaround exists now

Required exception note fields:

- `rule_id`
- `reason` (`false_positive` or `no_workaround`)
- `evidence`
- `temporary_mitigation`
- `follow_up_action`

If exception note is missing, submission is rejected.

## Rule Groups

- `TST-CORE-*`: High-level testing discipline and value rules.
- `TST-COVR-*`: Coverage threshold and workflow rules.
- `TST-DATA-*`: Fixture, assertion, and factory data rules.
- `TST-MOCK-*`: Mock design, typing, and lifecycle rules.
- `TST-STRU-*`: File naming, layout, and AAA readability rules.
