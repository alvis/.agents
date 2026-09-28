---
name: review-code
description: Review alignment, correctness, security, testing, documentation, quality, and style after code changes or within an explicit scope. Persist canonical findings, collect user confirmation by problem pattern through chat or interactive discovery, and suggest GitHub issue handoffs for confirmed problems verified on the remote default branch without editing reviewed code.
requirements:
  model: capable
  effort: deliberate
---

# Review Code

Perform a read-only code review with one independent holistic reviewer covering every selected area. Risk-specific specialists supply supplemental evidence; the holistic reviewer owns the area reports. The main agent persists them beneath the active work root and presents the combined summary. Remediation belongs to `coding:fix`; mechanical enforcement belongs to `coding:lint`. `essential:discover` owns interactive presentation; `coding:issue` owns GitHub issue previews and publication.

## Boundaries

- Review post-implementation changes, PRs, or explicit scopes across alignment, correctness, security, quality, testing, docs, and style.
- Apply the evidence, settled-finding, and stopping rules in `coding:standards/code-review/` through `coding:directions/review.md`. Only qualified findings enter the disposition registry, counts, and confirmation questions; optional feedback stays separate and non-blocking.
- Do not edit reviewed code, build/deploy infrastructure, review dependencies, or write generic root `reviews/` output.
- Reject binary-only scopes. Reject `--out` with a migration message directing callers to `--work-id`; review paths are contract-owned.

## Inputs

- Optional specifier: file, directory, glob, package, PR, or git range.
- Optional `--area` canonical area list (default `all`, with file-based defaults in [specifier-resolution.md](directions/specifier-resolution.md)), `--work-id`, `--plan=<path>` only as an assertion of the active root `state.md`, and `--explain` for a work-local change-comprehension child. Area selection controls coverage, never reviewer count. Accept a parent-owned delivery assignment and existing evidence through `coding:directions/review-evidence.md`; this skill owns the integrated independent pass when assigned.
- Require a repository checkout and an active or explicit work ID.
- A delegated review receives its independent-review assignment, resolved coverage, temporary area paths, pinned contract/revision, mechanical evidence, and any specialist evidence or pending handback. An already assigned independent reviewer executes directly without redispatch; an implementing worker returns a main-agent dispatch request instead of reviewing its own work as independent.

## State gate

Before creating or materially rewriting a project artifact, read the absolute `state.md` path injected by Essential. If unavailable, stop artifact writes and report the missing contract. Resolve the work root before review. Run Essential's resolver normally, or with `--work-id` for an explicit user override or the identifier selected by Essential's work-stream lifecycle. Treat an existing match as a candidate and reuse it only when its charter owns the requested outcome. On `work_id_required`, a main-agent run follows that lifecycle to select an identifier and reruns without asking the user to approve it; a subagent returns the resolver payload unless it already received the resolved work ID and root. A main-agent run may use `state/working.md` and `state.md` to locate the plan/spec/design/review paths. A nested run starts from its mission capsule and reads broad work memory only for resume or cross-slice alignment. Subagents write reports to assigned temporary files; only the main agent persists them in `.state`. Read the work item's `state.md` (and any `state/*.md` children) directly before dispatch. From the task table, determine `plan_source: state.md` and the applicable full task IDs (`task_id`); proceed on that reading — there is no separate validation step. An explicit `--plan` or delegated plan identity must match the report; never override or guess the canonical pointer from directory contents.

## Output contract

<report>

- Summary: `.state/works/<work-id>/review.md`.
- Areas under `.state/works/<work-id>/reviews/`:

  | Prefix | File | Question |
  |---|---|---|
  | `ALIGN` | `alignment.md` | approved state/spec/design adherence and drift |
  | `CORR` | `correctness.md` | semantic behavior and failure paths |
  | `SEC` | `security.md` | trust boundaries and vulnerabilities |
  | `QUAL` | `quality.md` | structure, consistency, complexity, maintainability |
  | `TEST` | `testing.md` | behavior evidence, coverage, fixtures, reliability |
  | `DOCS` | `docs.md` | code and durable documentation accuracy |
  | `STYL` | `style.md` | repository naming and mechanical-tool results |

- Each area follows [./templates/review.md](templates/review.md) and uses `open|fixed|acknowledged|deferred|skipped` finding status. IDs remain stable across reruns. `fixed` is closed only by verified evidence. `acknowledged` and `skipped` are closed non-fixed risk dispositions only with rationale, accountable owner, and explicit recheck condition; P0/P1 also require explicit risk-acceptance authority and durable evidence. `open`, `deferred`, and malformed risk dispositions remain outstanding and block review closure.
- The main agent rewrites `review.md` from every existing area file after writers finish. It contains overall status, all five disposition counts, derived `closed` and `outstanding` counts, priority counts for outstanding findings, one-line area headlines, paths, systemic patterns, and main-agent handback. Its pattern confirmation section follows [confirmation.md](templates/confirmation.md): linked finding IDs, one question and initially blank `Answer: ` per pattern, revision-bound responses, and remote eligibility. Area files remain the sole home of detailed findings.
- With `--explain`, write a lowercase child under `changes/` using [./directions/explainer.md](directions/explainer.md); return it for main-agent reconciliation of `changes.md`.

</report>

## Workflow

1. Resolve the specifier and per-area file lists through [./directions/specifier-resolution.md](directions/specifier-resolution.md). Use root `state.md` as the only plan definition. An explicit `--plan` must resolve to that file. Follow only its explicit implementation-detail link, which may add ID-keyed procedure but cannot redefine IDs, edges, requiredness, targets, or acceptance mappings. Never auto-adopt another planning/design file.
2. The main-agent caller classifies changed inputs through `coding:directions/review-evidence.md`, retains valid coverage, runs the mandatory mechanical candidate scan for missing/affected scope, and supplies applicable check evidence as described in [./directions/dispatch.md](directions/dispatch.md). Candidates are advisory. A delegated reviewer consumes that evidence; missing or stale required evidence returns a bounded request to the caller and prevents a clean verdict.
3. Apply [./directions/dispatch.md](directions/dispatch.md) after coverage is resolved: use one fresh independent holistic reviewer, or execute in the already assigned independent review session. The caller owns risk-specific specialist dispatch and hands their evidence to the holistic reviewer before finalization. Follow `coding:directions/review.md` against the canonical plan source (`state.md`) and applicable full task IDs. The holistic reviewer retains valid selected-area reports and writes the missing or affected temporary area reports and returns its path, verdict, counts, and short summary. A delegated run returns these reports and reconciliation deltas without running main-agent persistence or presentation steps below; the main agent validates and persists the lowercase area files and the companion input-binding receipt required by `coding:directions/review-evidence.md`.
4. Re-read `state.md` before aggregation and reject plan-definition drift. Validate every expected selected file, then aggregate every existing canonical area so a partial rerun cannot hide unselected findings; reject malformed disposition metadata. For every reused area file, verify its source/base, scope, standard, and contract bindings through `coding:directions/review-evidence.md`; also compare its `reviewed_task_defs` binding against the current definitions of the same `reviewed_task_ids` in `state.md`; when a task kept its ID but its immutable definition (summary, targets, requiredness, acceptance) changed, treat that area as stale — do not aggregate it as clean, and require its re-review before closure. Derive outstanding findings as `open`, `deferred`, or malformed `acknowledged`/`skipped`; derive closed findings as verified `fixed` plus valid `acknowledged`/`skipped`. Any outstanding P0 is `fail`; outstanding P1 is `requires_changes`; only outstanding P2/P3 is `pass_with_suggestions`; zero outstanding findings is `pass`. Every outstanding finding blocks review closure regardless of displayed verdict. The main agent derives the roll-up from the validated areas and reconciles the confirmation section through [confirmation.md](directions/confirmation.md), preserving response history. Persist all area files and `review.md` before presenting findings or requesting confirmation; failed persistence blocks that presentation.
5. With `--explain`, generate the evidence-backed change child after review.
6. Follow [confirmation.md](directions/confirmation.md) for pattern grouping, presentation choice, explicit answers, and eligible `coding:issue` handoff. A nested reviewer returns its report path and summary without prompting or publishing. CI/non-interactive runs persist pending questions without prompting or generating HTML. Render the summary through [output.md](templates/output.md); malformed area output returns only to its owner.
7. Each writer follows `essential:references/output-manifest.md` while writing eligible work Markdown. The main agent returns all changed area, summary, and optional explainer paths in `generated_files`; a delegated reviewer returns no `.state` path as a file it wrote.

## Verification

- Every selected area file exists, is lowercase, matches the template, and contains only its owned findings.
- Coverage was resolved before staffing and remained intact; one independent holistic reviewer authored the selected area reports, with any required specialist evidence incorporated. No dedicated reviewer delegated again or substituted self-review for independence.
- Every registered finding meets the shared blocker evidence threshold; optional feedback never affects counts, closure, or confirmation questions. Reopened findings identify new evidence invalidating their prior disposition. Required checks and resolved evidenced defects end review.
- The written `review.md`, or returned roll-up delta, matches every existing area file's disposition/priority counts and paths.
- Alignment used the identical pinned state/plan/spec contract expected by any follow-up fix; no root fallback was selected. The result binds the exact `plan_source: state.md` and reviewed task IDs.
- Findings and pattern questions were saved before presentation; each outstanding finding maps to one pattern, and no location gets a duplicate confirmation question.
- Responses are explicit, evidence-bound, and preserved or marked stale according to the confirmation direction; agreement does not change finding status or authorize writes.
- Every suggested GitHub issue has a confirmed pattern and current remote-default-branch evidence. Unverified, unpublished, and unconfirmed patterns have no creation suggestion.
- Reviewed code was not modified.

## Completion

Return the independent reviewer identity, source/base and semantic contract bindings, scope/standards, and report hashes for lifecycle/publication reuse. Report area verdicts, aggregate priorities/dispositions, overall status, `review.md` as `written_by_main` or `reconciliation_returned`, optional explainer child, `plan_source: state.md`, reviewed task IDs, and `generated_files`. Include confirmation progress, the selected presentation surface, and eligible issue handoffs or verification blockers; detailed findings remain in area files.
