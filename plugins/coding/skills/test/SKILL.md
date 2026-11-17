---
name: test
description: Write and update tests matched to the change type through six actions: for-new-code, for-logic-change, for-bug-fix, for-refactor, for-performance, and for-maintenance. Use for tests accompanying new code, logic changes, bug fixes, refactors, or performance changes, and for pending test markers, coverage gaps, fixtures, and redundancy cleanup.
requirements:
  model: capable
  effort: deliberate
argument-hint: "[for-new-code|for-logic-change|for-bug-fix|for-refactor|for-performance|for-maintenance] [scope] [--phase=before|after] [--framework=<name>]"
---

# Test

Own test authoring and test-suite maintenance. Do not implement production behavior, rewrite a failing application fix, or create placeholders for unspecified features. One skill, six actions: each names the test procedure for one kind of change, and all share [procedure.md](directions/procedure.md).

## Actions

- **`for-new-code`** — Tests for newly added supported behavior, written failing first. See [for-new-code.md](directions/for-new-code.md).
- **`for-logic-change`** — Tests for an intended behavior change to existing code. See [for-logic-change.md](directions/for-logic-change.md).
- **`for-bug-fix`** — A regression test that reproduces a diagnosed defect. See [for-bug-fix.md](directions/for-bug-fix.md).
- **`for-refactor`** — Behavior pins around a behavior-preserving structural change. See [for-refactor.md](directions/for-refactor.md).
- **`for-performance`** — Behavior pins and a one-off measurement around a performance-only change. See [for-performance.md](directions/for-performance.md).
- **`for-maintenance`** — Pending markers, coverage gaps, fixtures, redundancy cleanup, and compile-time targets. See [for-maintenance.md](directions/for-maintenance.md).

## Selection

Infer the action from the request and the diff. Ask when two actions fit. For a mixed diff, apply each action to its own part of the scope. A calling skill always passes the action and phase explicitly. A direct call after the source change already exists runs `after`, with the `TST-CORE-02` sensitivity proof standing in for red-first evidence; ask when it is unclear whether the change exists yet.

## Shared policy

Every action follows [procedure.md](directions/procedure.md) for classification, batching, proof, coverage, gates, review, and the report. Every action except `for-maintenance` straddles a source change and runs in two phases selected by `--phase=before|after`, defined in [procedure.md](directions/procedure.md#phases); a caller passes the phase explicitly. Under every action, side-effecting async code in the selected scope also needs the `TST-CORE-15` test. Cite rule IDs from the testing standard; never restate rule text.

## Boundaries

- Use for: test work within the requested scope, selected by change type above.
- Do not use for: `FIXME` markers and production failures (`coding:fix`), production stubs (`coding:complete-code`), or new behavior without a testable contract (`coding:write-code`).
- If production behavior is wrong, route to `coding:fix`; do not edit source here.

## Inputs

- Required: scope — files, package, feature, or explicit pending-test marker; for a change-type action, the diff or change description it accompanies.
- Optional: framework and existing test paths.
- Prerequisites: read project test scripts/configuration and the source under test before editing.

## State gate

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential. If unavailable, stop artifact writes and report the missing contract. Resolve the active work root first. The main-agent caller follows `essential:directions/establish-work-stream.md`: preserve an explicit user Work-ID override; otherwise select or derive the identity contextually, reuse a candidate only when its charter already owns the requested outcome, and rerun the resolver with the selected ID after `work_id_required`; never ask the user merely to approve an identifier. When delegated, start from the mission capsule's resolved Work ID/root and relevant specification, review, and evidence paths; if the resolver instead returns `work_id_required`, return its payload to the main agent without asking the user. Read `state/working.md` only when the capsule lacks current navigation; read `state.md` only for resume, cross-slice dependency, or alignment work. Never write main-agent-owned work pointers or overviews.

## Verification

At `after` (and for `for-maintenance`), require passing applicable focused and full suites, 100% statements, branches, functions, and lines in every selected runtime source file (`TST-COVR-01`; `for-refactor` and `for-performance` follow `TST-CORE-16` for untouched code), passing focused compile-time cases, and no remaining owned pending markers. If any applicable gate cannot pass, report the concrete blocker and do not claim completion. The report fields live in [procedure.md](directions/procedure.md#final-report-shape).

## Completion

Return a concise test report. Do not claim production implementation, bug fixes, or coverage for code outside the selected scope. Follow `essential:references/output-manifest.md` when writing eligible work Markdown, and return every created or materially rewritten path as `generated_files` to the main agent.
