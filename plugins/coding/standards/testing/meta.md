# Testing Standards

_Compact testing rules for TDD, coverage discipline, fixture design, and mocks._

## Dependent Standards

Relationships below explain the selection owned by [WORKFLOW.md](../../directions/WORKFLOW.md).

- TypeScript Standards (standard:typescript) - tests must follow strict typing and import rules
- General Coding Principles (standard:universal) - tests must preserve baseline quality constraints
- Naming Standards (standard:naming) - test descriptions and helper names must remain semantic
- Documentation Standards (standard:documentation) - helper docs and complex scenarios must be documented correctly

## What's Stricter Here

This standard enforces requirements beyond typical Vitest practices:

| Standard Practice                     | Our Stricter Requirement                       |
|---------------------------------------|------------------------------------------------|
| Broad test sets encouraged            | **Retain behavioral coverage or distinct supported behavior/edge cases; remove one-time proof with neither (`TST-CORE-04`)** |
| Initially passing regression cases accepted on assertion strength | **Already-correct behavior requires sensitivity proof and restored green evidence under `TST-CORE-02`** |
| Declaration inventories pinned in tests | **Only compiler-observable behavior permitted by `TST-CORE-10`; diagnostics and consumer builds cover ordinary declarations** |
| Export contracts and static data pinned in tests | **Delete export/static-data tests and test consumers instead ([TST-CORE-12](rules/tst-core-12.md))** |
| Checked-in artifacts verified by tests | **Assert executed consumer/generator behavior instead of repository content ([TST-CORE-13](rules/tst-core-13.md))** |
| Output wording pinned for regression detection | **Exact wording requires an explicit supported contract ([TST-CORE-14](rules/tst-core-14.md))** |
| Coverage thresholds tuned per project | **100% statements, branches, functions, and lines before ready or merge, with at least one behavioral test per non-static-data exported runtime function; only an unapproved `direction-review` draft is exempt (`TST-COVR-01`)** |
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
