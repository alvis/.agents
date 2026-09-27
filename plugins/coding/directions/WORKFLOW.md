# Coding workflow

Read this before writing, modifying, reviewing, saving, uploading, or publishing code. Classify semantic risk, select one operation, then read only its linked direction and owning skill.

## Select topology

Use the smallest topology that preserves correctness: handle one bounded, low-risk change directly, or delegate it once to the best implementing specialist. Never wrap one executable slice in a coordinator layer. File count informs the tier but never decides it.

| Tier | Typical change | Agent topology | Validation |
| --- | --- | --- | --- |
| 0 | Rename, documentation, formatting, narrow configuration | One agent | Focused mechanical checks |
| 1 | Bounded behavior change or one coherent component | One implementing agent | Tests, types, lint, self-review |
| 2 | Public API or consequential multi-file change | Implementer and independent reviewer | Full affected gates |
| 3 | Architecture, migration, security, persistent data, release topology, or cross-domain change | Tech Lead, specialists, and reviewer | Current governed lifecycle |

Use `tech-lead` for multiple dependent milestones, multiple implementers, or Tier 3 work. A public-API change is Tier 2 unless a Tier 3 condition also applies. Consequential work and every publication-bound change require independent review even when one agent implements them; that owner still runs focused mechanical checks.

Before delegating, read `essential:directions/delegate.md`; before orchestrating or reviewing across a team, read `essential:directions/orchestration.md`. Select specialists through `coding:references/ROUTING.md` and give them full paths to every required skill, direction, template, and standard.

## Select the operation

Skills own actions; never delegate work “to” a skill or pass a skill name as an agent type.

| Operation | Direction | Owner |
| --- | --- | --- |
| Implement new behavior | [Implementation](implementation.md) | `coding:write-code` or `coding:draft-code` |
| Set up a project | [Implementation](implementation.md) | `coding:setup-project` |
| Complete a production stub | [Implementation](implementation.md) | `coding:complete-code` |
| Diagnose or fix a failure | [Diagnosis and fix](diagnosis.md) | `coding:fix` |
| Refactor green code | [Implementation](implementation.md) | `coding:refactor` |
| Modernize supported syntax or APIs | [Implementation](implementation.md) | `coding:modernize` |
| Document source-backed behavior | [Implementation](implementation.md) | `coding:document` |
| Author tests or improve coverage | [Implementation](implementation.md) | `coding:complete-test` |
| Lint source | [Implementation](implementation.md) | `coding:lint` |
| Review code | [Review](review.md) | `coding:review-code` |
| Save or reshape local history | [History](history.md) | `coding:commit` or `coding:finalize-commits` |
| Work with a pull request or stack | [Publication](publication.md) | `coding:pr author\|create\|update\|review\|merge` |
| Create, update, find, or triage an issue | Selected skill | `coding:issue create\|update\|lookup\|triage` |
| Find unused code | Selected skill | `coding:find-unused` |
| Pause or resume coding work | Selected skill | `essential:handover` or `essential:takeover` |

Select every row matching the artifact, read its scan before editing, and apply it under `essential:directions/standards.md`. The selected direction may narrow timing or add required evidence; it never replaces the owning skill.

| Applies to | Scan |
| --- | --- |
| All implementation work, tests, and technical documentation | [Universal](../standards/universal/scan.md) |
| Functions, methods, and APIs | [Function](../standards/function/scan.md) |
| TypeScript and JavaScript | [TypeScript](../standards/typescript/scan.md) |
| Python | [Python](../standards/python/scan.md) |
| Rust | [Rust](../standards/rust/scan.md) |
| Identifiers and operation names | [Naming](../standards/naming/scan.md) |
| Tests and testable implementation | [Testing](../standards/testing/scan.md) |
| Commit message text | [Commit](../standards/commit/scan.md) |
| Rendered PR messages and implementation-diff size or composition | [Git](../standards/git/scan.md) |
| Comments, JSDoc, technical documentation, and exported types/APIs requiring documentation | [Documentation](../standards/documentation/scan.md) |
| Errors, logging, and operational behavior | [Observability](../standards/observability/scan.md) |
| New or moved files and project setup | [File structure](../standards/file-structure/scan.md) |
| Semantic review | [Code review](../standards/code-review/scan.md) plus the implementation scans above |
