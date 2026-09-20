---
name: lint
description: Enforce coding standards mechanically across a selected scope with risk-appropriate ownership and review. Use when source files need lint-error correction, standards enforcement, or consistent formatting, including calls extended by another plugin's portable lint profile; behavior-changing repairs belong to fix.
requirements:
  intelligence: medium
---

# Linting

Set `CODING_LINT_SKILL_DIR` to the absolute directory containing this loaded `SKILL.md` before invoking its scripts.

Apply generic coding standards mechanically. This skill owns file discovery, scope handling, batching, the generic scanner, verification, aggregation, and the final report. It does not select or dispatch framework skills; a framework plugin extends it by passing a portable profile.

## Boundaries

- Use for: mechanical standards enforcement, lint-error correction, and consistent formatting on eligible source files, with an optional pre-flight unused-code prune.
- Do not use for: modifying configuration files, installing or updating lint tooling, authoring lint rules, or processing binary, gitignored, generated, or vendor files. Behavior-changing repairs belong to `coding:fix`; structural cleanup belongs to `coding:refactor`, except the narrowly confirmed shared-type extraction owned by step 7.
- Eligible source files are `.ts/.tsx/.js/.jsx/.py/.go/.rs/.rb/.java/.kt/.swift/.c/.cpp/.h/.hpp/.cs/.php/.sh/.vue/.svelte/.astro` and similar. Skip text and content files (`.md/.mdx/.json/.yaml/.toml/.html/.svg/.csv`) and throwaway scripts that won't be committed.
- This skill runs its own scan-and-aggregate cycle internally; never lint by hand in its place.

## Inputs

- **Required**: none — defaults to the repository root with `--scope=uncommitted`.
- **Optional**:
  - `specifier`: file, directory, or glob.
  - `--scope`: `uncommitted` (default), `all`, or a focused section hint.
  - `--skip-unused`: bypass the pre-flight unused-code scan entirely.
  - `--profile=<absolute-path>`: internal extension contract for another plugin. Reject relative or unreadable paths.
  - `--test-root=<project-root>` plus repeatable `--test-pattern=<compiler-test-glob>`: internal scanner classification contract. Resolve and pass these together when selected files include configured compiler tests whose paths do not follow built-in conventions.

The caller forwards its original arguments unchanged and may append one profile. Propagate any internal `review_ownership` capsule under `coding:directions/review-evidence.md`; it assigns independent review, never mechanical checks, to the delivery owner. Direct calls without a profile apply generic checks to every eligible source file, regardless of framework.

## Profile contract

Read the profile before discovery. A profile may narrow eligible files, add standards, add scanners, define exclusions, and supply a report label. It cannot replace generic standards, the generic scanner, verification, status semantics, or report shape.

Profile headings are declarative:

- `Eligibility`: included extensions and conditional file kinds.
- `Standards`: additional standard directories or names.
- `Scanners`: additional commands, run after the generic scanner.
- `Exclusions`: paths or file kinds removed from the candidate set.
- `Report label`: label shown in the unchanged report shape.

Fail before editing if the profile is invalid, references a missing standard/scanner, or attempts to redefine orchestration or reporting.

## Workflow

<IMPORTANT>
The implementing owner remains responsible for discovery, standards loading, the scanner, mechanical edits, focused checks, and self-review. Classify the scope through the Coding workflow before choosing topology. Tier 0/1 stays with that one owner. With valid parent review ownership, return check evidence and risks for integrated review; do not dispatch a batch reviewer. An explicit child review request or independently published slice establishes its own review boundary. Otherwise use the Coding workflow's risk and `coding:directions/validation.md` review timing, including PR-stage independence when publication alone triggers review. Tier 3, multiple dependent milestones, or multiple implementers may use governed coordination, but each assigned implementing owner keeps those mechanical responsibilities for its disjoint batch. Load [cycle.md](directions/cycle.md) only when this invocation owns an independent-review boundary.
</IMPORTANT>

0. Unless `--skip-unused` is set, run the pre-flight unused-code scan: invoke `coding:find-unused` with the specifier (or repo root). Zero findings → proceed silently. Otherwise present each finding through a graphical or structured user-input tool (file:line + symbol, Remove/Keep, ≤4 questions per call, paginated), then have the implementing owner delete precisely the confirmed-unused list. Record scan/removed/kept counts for the final report; they never count toward `violations_found_total`. `--scope` does not apply here — dead-code detection is project-wide by nature.
1. Parse `specifier`, `--scope`, and the optional profile independently of argument order.
2. Resolve candidate files:
   - `uncommitted`: union unstaged, staged, and untracked files, then apply the specifier.
   - `all` or a custom scope: resolve the specifier directly.
   - Always exclude ignored files, dependencies, generated output, and paths outside the repository.
   - When the selected files include compiler tests, group files by owning project and resolve each project's configured type-test mechanism and discovery patterns before batching. Keep each batch within one project root, pass that absolute root as `--test-root` and every applicable compiler-test glob as a repeated `--test-pattern`, and never combine files owned by different test roots in one runner invocation; do not infer test status from filenames alone.
3. Apply profile eligibility and exclusions when supplied. Stop cleanly if no files remain.
4. Select generic standards from `coding:standards/INDEX.md` using the discovered artifacts, languages, and configured compiler-test classification. Apply `essential:directions/standards.md`. Resolve profile standards as exact directories in the enabled extension plugin's index; reject missing or unindexed targets. Add them without replacing or duplicating generic standards. Never infer selection from prompt headings, filename-stem matching, or an unrestricted standards-tree search.
5. Before edits, run package-wide TypeScript analysis once for the complete selected file set: `bun run "${CODING_LINT_SKILL_DIR}/../../scripts/analyze-typescript.ts" [--report-file=<absolute-path>] [--profile=<absolute-path>] --repository-root=<absolute-repository-root> -- <selected-files...>`. Forward the same profile unchanged when present. The CLI prints a bounded summary by default and persists the complete `{argv,cwd,exit_code,stdout,stderr}` envelope first; `--report-file <path>` and `--report-file=<path>` are accepted before `--`, an existing path is never overwritten, and omission uses the secure temporary fallback. When `truncated` is true, inspect the reported `full_output` path and extract the original machine result with `jq '.stdout | fromjson' < "$FULL_OUTPUT"` before making decisions. A preservation failure is nonzero, states `no_report_retained`, preserves the original analysis status and exit code, and supplies the safe rerun method; never infer a clean scan from it. Bun automatically resolves `ts-morph@28` into its cache; cold runs require registry access, never a project dependency install. The analyzer reads eligible package peers for type context, keeps error findings within selected files, and reports advisory `reuse_candidates`, `extraction_proposals`, `error_documentation_candidates`, and `diagnostics`. Original exit 1 means analysis failure; exit 2 means invalid invocation. Resolve failures before claiming affected checks are clean. Batch selected files sharing one owning project root, with at most two files per runner invocation. Batching does not authorize delegation.
6. For each owned batch, the implementing owner:
   - Run `bun run ${CODING_LINT_SKILL_DIR}/../../scripts/lint_profile_runner.ts [--report-file=<absolute-path>] [--profile=<absolute-path>] [--test-root=<project-root> --test-pattern=<compiler-test-glob> ...] <files>` exactly once. Its default stdout is the bounded summary defined by `coding:directions/output.md`; the complete envelope and scoped `jq '.stdout | fromjson'` retrieval contract from step 5 apply unchanged. The runner resolves Coding resources from its installed location and forwards compiler-test classification only to the generic scanner.
   - The runner executes the generic scanner exactly once, then each profile scanner exactly once in declared order. Profile resources resolve relative to the absolute profile path.
   - Treat scanner output as advisory. Apply each selected standard as a writer under `essential:directions/standards.md`.
   - Apply generic and profile standards only within the requested scope. Collect type-reuse and extraction candidates across all batches; defer their edits and questions until the full scan finishes.
   - Run project lint, type, and focused test commands after edits.
   - Self-review the resulting diff, rerun affected scans after corrections, and record `violations_found`, `status`, files changed, checks run, and remaining issues.
7. After all scan batches finish, reconcile package candidates against `TYP-TYPE-09` and error-documentation candidates against `DOC-CONT-06`. Confirm existing-type matches using domain meaning, generic arguments, and import direction; reuse confirmed contracts without new-type approval. For each repeated-object group lacking a suitable shared contract, present the proposed declaration, owning module, occurrence locations, and affected consumers through the harness question tool. Offer creation or retaining inline definitions; wait for confirmation before extraction, keep unanswered proposals pending, and record declined proposals without counting them as violations. Create only confirmed contracts and change only authorized files; an out-of-scope declaration or consumer needs explicit scope approval. Report proposals separately from confirmed violations and `violations_found_total`. Rerun affected analysis and project checks after approved fixes.
8. When this invocation owns the independent-review boundary, run the changed batches through [cycle.md](directions/cycle.md). The reviewer remains read-only; the same implementing owner fixes findings and reruns affected scans and project checks. Otherwise return the self-review, exact check evidence, changed paths, and outstanding risks to the named delivery owner or publication caller.
9. Aggregate batch counts and use the worst status: `failure > partial > success > compliant`.
10. Run the verification below; when a check fails, fix the cause and re-run that check. Repeat until every check passes or a concrete blocker remains, then report the blocker instead of looping.

## Verification

- Every target was eligible and inside the repository.
- The generic scanner ran once per batch; every profile scanner ran once per batch.
- Every edit is justified by a loaded rule, project tool failure, or confirmed extraction proposal.
- Package analysis completed before type fixes; every truncated summary was resolved through its retained full envelope, and proposals were aggregated and asked only after the full scan. Unknown candidates and pending decisions are reported explicitly.
- Relevant project checks pass, or their exact failure is reported.
- Every changed batch received implementing-owner self-review. Every batch selected by the independent-review predicate also received read-only independent review; any governed team is shut down.

## Completion

Begin with these keys (a `/goal` evaluator reads convergence directly from them):

<report>

```yaml
violations_found_total: 0
status: compliant # compliant | success | partial | failure
```

</report>

Then report the command, retained full-output paths and preservation status, the unused-code pre-flight (ran/skipped, findings/removed/kept), profile report label when present, scope, files scanned and modified, standards and scanners applied, verification commands, selected topology, self-review and applicable independent-review coverage, any governed agent lifecycle counts, remaining issues, and separate extraction decisions (accepted/declined/pending). Unresolved candidates or pending extraction decisions report `partial`; a declined advisory proposal alone does not block compliance. Use `compliant` only for a clean pass with no edits and `success` when violations were fixed. A caller using a profile receives this same report shape.
