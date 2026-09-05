---
name: fix
description: Fix diagnosed incorrect behavior, failed tests, type errors, lint failures, or broken CI. Use when a concrete failure can be reproduced or review findings identify a defect; route new functionality to write-code and green structural cleanup to refactor.
requirements:
  intelligence: high
argument-hint: "[specifier] [--area=AREA] [--note=...] [--plan=PATH]"
---

# Fix Code Issues

For review bugs in stacked changes, repair the owning change with the `jj edit` route in `coding:directions/jj.md`.

Diagnose and repair concrete failures — failing tests, type errors, lint failures, broken CI, review findings — restoring green without adding behavior. `coding:write-code` owns new functionality; `coding:refactor` owns structural cleanup of working code.

<IMPORTANT>
Coherence Mandate: every edit must produce one continuous, deliberate work — rewrite over restructure, restructure over integrate, never append. A fix is not a patch laid on top of the broken region; it is the smallest rewrite that lets the corrected logic sit in place as if the bug had never been there — no visible patch seams, no `// fixed:` markers, no parallel "v2" helpers, no defensive wrapper retained "just in case" the original path comes back.
</IMPORTANT>

## Boundaries

- Use for: reproducible failures (tests, types, lint, CI) and defects identified by review findings, including incorrect test behavior, fixtures, and mocks.
- Do not use for: new features (`coding:write-code`), refactoring working code (`coding:refactor`), architecture changes, or fixes requiring external service changes. Reject when all checks pass and no defect is identified, or when the requested change would break existing functionality.

## Inputs

- **Required**: a failure to fix — an error message, failing check, review finding, or a specifier (file, directory, or pattern) to diagnose.
- **Optional**: `--area=test|lint|type|review|impl|fixtures|refactor` to skip auto-detection; `--note=...` for focus guidance; `--plan=PATH` to pin the active root `state.md` plan contract for post-review fixes; `--from-composite` when invoked from a composite workflow.

## State gate

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential. If unavailable, stop artifact writes and report the missing contract. Resolve the active work root first. The main-agent caller follows `essential:directions/establish-work-stream.md`: preserve an explicit user Work-ID override; otherwise select or derive the identity contextually, reuse a candidate only when its charter already owns the requested outcome, and rerun the resolver with the selected ID after `work_id_required`; never ask the user merely to approve an identifier. When delegated, start from the mission capsule's resolved Work ID/root and relevant review/spec/design paths; if the resolver instead returns `work_id_required`, return its payload to the main agent without asking the user. Read `state/working.md` only when navigation is missing, and `state.md` only for resume, cross-slice dependency, or alignment work. Never write main-agent-owned work pointers or overview files. Read the work item's `state.md` (and any `state/*.md` children) directly before editing. From the task table, determine which tasks are runnable, which are blocked, the current owner, and the next action; proceed on that reading — there is no separate validation step. Retain `plan_source: state.md` and the assigned full `task_id`. Reject any explicit or delegated plan identity that does not match. Do not guess another plan.

## Standards

Select standards for the artifact being corrected. Test corrections use
`testing`, `typescript`, and `documentation`; fixture optimization uses
`universal`, `typescript`, `function`, `documentation`, and `testing`. Apply
each selected standard as a writer under `essential:directions/standards.md`.

## Workflow

1. **Diagnose.** Parse the specifier and flags. Without `--area`, auto-detect by running tests, the type checker, and the linter, prioritizing tests > types > lint. Map the area to its entry step — `test` → step 3, `fixtures` → step 4, `impl` → step 2, `refactor` → step 5 — and with multiple areas start from the earliest and run all relevant steps. Collect error messages and map each to its code location; for broader project context (handover docs, review findings, planning notes) see [./directions/context-discovery.md](directions/context-discovery.md). When this run follows a `/coding:review-code`, pin the plan contract per [./directions/plan-context.md](directions/plan-context.md) so the follow-up review validates against the identical plan source and task identity.
2. **Plan.** Read the affected files and their test descriptions; determine expected behavior from tests and state-linked work/durable design and specification files; decide whether each issue is source-code logic or test implementation, asking the user when expected behavior is ambiguous. List the changes needed, ordered by dependency. If evidence changes an approved task definition, dependency, requiredness, target, or acceptance mapping, stop and return the affected task IDs plus downstream closure for main-agent replan/reapproval; never mutate the plan while fixing.
3. **Fix tests.** Fix incorrect test behavior and logic — never modify a test just to make it pass — plus standards violations, imports, and references. For unused-code errors, check state-linked design and work docs first: if the code is planned but unimplemented, use the `throw new Error('IMPLEMENTATION: ...')` pattern; remove only genuinely unnecessary code. Select the smallest correct topology from the Coding workflow by semantic risk; file count alone never adds a coordinator, another implementer, or a reviewer. The owning implementer may partition a broad scope into bounded batches as an execution detail while retaining ownership of every batch. Delegate only when the classified topology independently requires multiple owners, then follow the Governance delegation limits. Re-run checks after each fix and address newly surfaced errors.
4. **Optimize fixtures** (skip when no fixtures or mocks exist). Fix incorrect fixture definitions and mock behavior, type-safety issues, and organization problems; keep fixture data realistic and valid; run tests to confirm they still pass.

   <IMPORTANT>
   In steps 3-4, modify only test files, mock files, fixtures, and test support files — never the source code under test.
   </IMPORTANT>

5. **Validate.** Run the full test suite, linter, and type checker across the affected scope. When a check fails, fix the cause and re-run that check; repeat until every check passes or a concrete blocker remains, then report the blocker instead of looping. For each failure that occurred, record its root cause, the systemic cause that allowed it, the assumption that proved wrong, and how to prevent that class of error. Return attempt outcome, evidence, and a requested task-status delta to the main agent; do not edit task state directly. Re-read `state.md` and require the plan definition to remain unchanged before requesting `done`.

## Verification

- The originally reported failure no longer reproduces.
- Tests, type check, and lint pass across the affected scope with no regressions.
- Edits are confined to the diagnosed defect: no new features, no unrelated restructuring, and for test-area fixes no source-under-test modifications.

## Completion

Report the area (detected or specified), issues found and fixed, files modified, the root-cause classification (`source_code_logic` / `test_implementation` / `requirements_unclear`) with the reasoning behind it, per-issue file:line entries with what changed, fixture optimizations when step 4 ran, and validation results (tests/types/lint). Suggest next steps (refactor, commit) only when relevant. When the run followed a review, include the keys the follow-up review consumes:

<report>

```yaml
task_id: <full executable task ID>
plan_source: state.md
attempt: pass|fail|partial
requested_status: done|failed|blocked
evidence: []
review_rerun: /coding:review-code <scope> --plan=<plan_source>
```

</report>

Follow `essential:references/output-manifest.md` when writing eligible work Markdown, and return every created or materially rewritten path as `generated_files` to the main agent.
