---
name: draft-code
description: Draft TypeScript-compliant code skeletons with canonical TODO(implementation) placeholders. Use when starting an already-specified implementation or preparing typed production structure for later completion; do not implement business logic or create ambiguous plain TODO markers.
requirements:
  intelligence: low
context: fork
argument-hint: "<instruction>"
---

# Draft Code Skeleton

Before any `jj` decision or command, follow `coding:directions/jj.md`.

Creates TypeScript-compliant production skeletons with explicit `TODO(implementation):` markers, type definitions, and function signatures. It may outline pending tests, but test markers belong to `coding:complete-test`; production stubs belong to `coding:complete-code`.

## Boundaries

- Use for: starting an already-specified implementation, or preparing typed production structure and runtime-behavior or compiler-semantic test scaffolds for later completion.
- Do not use for: implementing business logic or producing production-ready code (`coding:write-code`), writing complete tests with assertions beyond the scaffold (`coding:complete-test`), or modifying existing implementations (`coding:refactor` or `coding:fix`).
- Reject when: the instruction is too vague to create meaningful types, the request is for implementation rather than a skeleton, the target directory does not exist, or the skeleton would conflict with existing code structure.

## Inputs

- **Required**: `<instruction>` — the feature or module to skeleton, specific enough to derive types, interfaces, and function signatures.
- **Optional**: a work ID/root and linked design/specification paths refine the skeleton's shape.
- **Prerequisites**: an existing target directory inside a TypeScript project.

## State gate

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential. If unavailable, stop artifact writes and report the missing contract. Resolve the workspace-local work root and artifact paths before drafting. The main-agent caller follows `essential:directions/establish-work-stream.md`: preserve an explicit user Work-ID override; otherwise select or derive the identity contextually, reuse a candidate only when its charter already owns the requested outcome, and rerun the resolver with the selected ID after `work_id_required`; never ask the user merely to approve an identifier. When delegated, start from the mission capsule's resolved Work ID/root and relevant design/spec files; if the resolver instead returns `work_id_required`, return its payload to the main agent without asking the user. Read `state/working.md` only when navigation is missing, and `state.md` only for resume, cross-slice dependency, or alignment work. Never write main-agent-owned pointers or overviews.

Select the applicable standards below before drafting. Read only each selected
directory's `meta.md` before editing. After editing, apply its `scan.md`; when a
scan identifies a violation, read only the matching
`rules/<lowercase-rule-id>.md` guide when present, or that standard's `write.md`
as the bounded fallback when no matching guide exists. Correct the violation
and rerun the scan.

| Standard | Purpose |
|---|---|
| `documentation` | JSDoc structure and placeholder comments |
| `file-structure` | Project directory layout and organization |
| `function` | Function signatures, parameter types, return types |
| `naming` | Naming conventions for files, types, functions |
| `testing` | Test file structure, describe/it patterns |
| `typescript` | Type definitions, interfaces, generics |
| `universal` | General code authoring conventions |

## Workflow

1. Parse the instruction into required types, interfaces, functions, and file structure. Read only the work-local design/spec children and durable architecture/design/spec paths named by the caller or mission capsule. For a direct or resume run, use `state/working.md` and `state.md` to discover those paths. Read neighboring modules for established patterns. Do not scan unrelated Markdown or fall back to root continuation/design files.
2. Plan the structure before writing: file organization, type hierarchy, and test layout for planned runtime behavior or compiler-observable semantics per the standards above.
3. Draft type definitions (interfaces, type aliases, enums) and function stubs with JSDoc, marking every incomplete body with the canonical placeholders in [./references/patterns.md](references/patterns.md) — `TODO(implementation):` comments plus the `IMPLEMENTATION:` sentinel throw wherever a value is expected.
4. Draft tests for planned runtime behavior through a callable public entrypoint and for compiler-observable behavior permitted by `TST-CORE-10` through representative consumer usage. Use `describe.todo()`/`it.todo()` until a runtime entrypoint is callable; once it is, write the smallest behavioral assertion that fails red for the missing implementation. Use the project's configured type-test mechanism for compiler semantics: acceptance cases compile, rejection cases use its expected-diagnostic convention, overload resolution and narrowing exercise representative calls, and transformations compare representative inputs and outputs. Keep a rejection case pending or outside the normal compilation graph when the configured mechanism cannot express its diagnostic. Declaration shape alone — members, signature or overload inventories, schemas, exports, or barrels — receives no test scaffold. Draft only the helpers and fixtures these cases need (details in references/patterns.md).
5. Run the verification below; when a check fails, fix the cause and re-run that check. Repeat until every check passes or a concrete blocker remains, then report the blocker instead of looping.

## Verification

- TypeScript compiles with no errors and all imports resolve (`npx tsc --noEmit` or the repository equivalent).
- `npm run lint` (or equivalent) passes; file organization and naming match the standards above.
- Applicable repository-native test commands run without collection or configuration errors. Run a runtime command only when the project produces runtime behavior and configures a runtime framework; run a compile-time command only for an allowed compiler-semantic case. Runtime scaffolds are pending or red exactly as designed; runnable compiler-semantic cases pass through the configured expected-diagnostic convention, while unavailable cases remain pending or isolated from normal compilation.
- Every placeholder uses a canonical form from references/patterns.md — no bare `TODO:` markers, which `coding:complete-code` refuses to claim.
- The skeleton is internal: public shape reaches publication only with its first implementation and the focused runtime or compiler-semantic tests its promises require.

## Completion

Report the parsed instruction; context sources discovered; files created with a one-line purpose each; counts of types defined, functions drafted, and markers placed; verification commands with results; and next steps — complete production stubs with `coding:complete-code`, then route pending test markers to `coding:complete-test`. Return every created or materially rewritten path as `generated_files` to the main agent. Do not run file sizing; after all artifact writers finish, the main agent checks only eligible work Markdown inside the target `.state/`.
