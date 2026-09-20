# Review dispatch contracts

## Coverage and staffing

Resolve coverage through [specifier-resolution.md](directions/specifier-resolution.md) before choosing reviewers. Preserve explicit `--area`, file-based defaults, and caller-required areas. Never narrow coverage to reduce starts. The seven areas below are report responsibilities, not seven agent assignments.

`coding:directions/WORKFLOW.md` owns implementation tiers; `coding:directions/validation.md` owns when independent review is required. Once this review is required or explicitly requested, the main-agent caller selects staffing by the reviewed change's semantic risk:

| Reviewed change | Staffing |
|---|---|
| Bounded scope, including a consequential feature or public API | One independent `code-quality-critic` covering every selected area; fresh for initial analysis, retained for follow-ups |
| Authentication, permissions, sensitive-data handling, or migration behavior | Holistic reviewer plus the relevant specialist |
| Large cross-domain architecture | Holistic reviewer plus explicitly budgeted specialists for named risks |

Before any dispatch, record the risk, reviewer roles/count, specialist scopes, and their reason in the caller's working context and mission capsules. Route specialists through `coding:references/ROUTING.md`; routine security coverage alone does not request deep security review. Request a scoped `security-champion` pass for sensitive security behavior, or a `data-architect` pass for migration/data-integrity risk. A required specialist who is unavailable remains an explicit review blocker. Apply the existing Governance batching limits; neither area count nor file count alone adds reviewers or a coordinator.

Launch an initial holistic reviewer without inherited implementation context; retain that reviewer for evidence-driven follow-ups under `coding:directions/review-evidence.md`. An already assigned independent reviewer, including one running `specification:review-implementation`, performs this skill in the same session. Reviewers never redispatch or add specialists themselves; they return a bounded request to the main agent when additional expertise is needed. The main agent dispatches independent specialist scopes together, supplies their revision-bound evidence to the holistic reviewer, and waits for that reviewer to incorporate it before finalization. Specialists do not write canonical area reports; the holistic reviewer assigns each finding to its single owning area and preserves stable IDs.

## Preparation and capsule

The main-agent caller allocates one collision-safe OS temporary directory with a distinct `<area>.md` path per missing or affected selected area, all assigned to the holistic reviewer. Preserve valid selected-area reports without assigning another writer. Keep these files until the main agent has validated and persisted them under `reviews/`; then remove the temporary directory. A failed write or import blocks presentation.

Give the holistic reviewer these inputs, with file paths rather than source contents:

- resolved work ID/root, all assigned temporary area paths, and previous area reports when present;
- parent review ownership and existing companion evidence from `coding:directions/review-evidence.md`, plus exact relevant spec/design/review paths from the mission capsule;
- immutable base revision, reviewed content/dependency inventory and hashes, applicable standard identities, and canonical `plan_source: state.md`, applicable full `task_id` values and task definitions read directly from `state.md`, and exact reviewed revision/content identities;
- full resolved coverage, retained reports, and the bounded recheck mission: changed inputs, affected findings/areas, and discovered source/test/doc dependency paths;
- advisory mechanical-scan results and applicable deterministic-check evidence, bound to the checked revision and inputs;
- specialist scopes and evidence, or the caller's pending handback that must arrive before finalization;
- [review.md](templates/review.md) and `coding:directions/review.md`;
- instruction to write only its assigned reports, leave reviewed code and `.state` untouched, run no builds/tests/linters, delegate no further, and preserve stable finding IDs/statuses. Keep evidence, plan binding, and reviewed task IDs in each report; return only paths, per-area verdicts/counts, and a short summary for the main agent.

The capsule is sufficient by default. Give `state.md` when alignment is selected or resume/cross-slice evidence requires it; give `state/working.md` only when navigation is otherwise missing. Review each shared input once rather than reopening it for each area.

Before dispatch, classify affected scope through `coding:directions/review-evidence.md`. The main-agent caller runs applicable repository lint/format/naming checks, or reuses their exact-input evidence, and captures diagnostics for style review. It also groups discovered files by owning project, resolves every configured compiler-test discovery glob that applies to each group, then runs the mandatory scanner once per missing/affected project group with that project's root and one repeated pattern argument per resolved compiler glob. Never combine files owned by different test roots in one invocation:

```bash
bun run plugins/coding/scripts/scanlib/core.ts \
  <files-owned-by-project> --category all --before 5 --after 10 \
  --test-root <project-root> [--test-pattern <compiler-test-glob> ...]
```

Surface a hard Bun runtime failure. Candidate output enters the local finding registry only after the assigned reviewer validates it against `coding:standards/code-review/`'s blocker evidence threshold. Optional feedback stays outside that registry. Pass prior dispositions and their evidence; a fresh dispatch does not reset them.

## Areas

### alignment

- Compare every changed behavior/file with root state's canonical task definition and criteria, materialized specs, approved work decisions/design, and relevant durable docs. Identify omissions, additions, unjustified drift, stale derivations, and missing promotion/sync work.
- If no approved work contract exists or its current task definitions differ from the review capsule, state that blocker; do not adopt root planning files.
- Follow an explicit implementation-detail link only for procedure keyed by existing IDs; reject it if it restates/changes IDs, edges, requiredness, targets, or acceptance mappings.
- Write the assigned report for `reviews/alignment.md`, prefix `ALIGN`.

### correctness

- Trace control flow, boundaries, async/resource behavior, errors, operators, arguments, invariants, and plausible failure paths. Do not duplicate alignment, quality, or mechanical findings.
- Write the assigned report for `reviews/correctness.md`, prefix `CORR`.

### security

- Check injection, authentication/authorization, validation, data/secrets, dependency exposure, CORS/headers, cryptography, and trust boundaries.
- Write the assigned report for `reviews/security.md`, prefix `SEC`.

### quality

- Check sibling consistency, non-mechanical redundancy, structure, naming posture, complexity, DRY, error-handling posture, performance, accessibility, and architecture. Route semantic bugs to correctness and plan drift to alignment.
- Write the assigned report for `reviews/quality.md`, prefix `QUAL`.

### testing

- Check meaningful behavior/edge/failure/integration coverage, assertion strength, per-source coverage, isolation, determinism, fixture/mock ownership, complexity, and redundancy.
- Write the assigned report for `reviews/testing.md`, prefix `TEST`.

### docs

- Check exported API docs, complex-logic explanation, README/API/example/type accuracy, and whether durable architecture/design/spec promotion is required.
- Write the assigned report for `reviews/docs.md`, prefix `DOCS`.

### style

- Assess the caller's repository lint/format/naming evidence and report naming-policy gaps not already owned by tooling. Request missing or stale required checks from the caller; do not rerun them in the reviewer.
- Write the assigned report for `reviews/style.md`, prefix `STYL`.

## Reruns

Validate reports separately. If one is missing or malformed, retain its previous canonical report and all valid current reports; closure remains blocked until the selected area has valid current evidence. Return only the affected areas to their holistic reviewer with the validation error and pinned inputs. If that reviewer cannot continue, assign one fresh replacement those affected areas and their prior reports; do not restart successful areas or fan out by area. Retry specialist evidence only for its failed or invalidated scope. Recheck source/contract bindings before reusing any report; the skill's aggregation rules still reject stale evidence. Apply Governance's bounded retry rule and report unresolved failures.
