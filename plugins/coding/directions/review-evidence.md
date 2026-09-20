# Review ownership and evidence

Read this when a lifecycle parent assigns implementation, hands an integrated change to review, or supplies review evidence to publication. `WORKFLOW.md` owns risk, `validation.md` owns review timing, and `review.md` owns findings and closure. This contract changes who buys independent scrutiny, not the required coverage or checks.

## One delivery owner

A parent-owned delivery explicitly names one independent-review owner before assigning children. Pass this internal capsule with each child; it is not a public flag, and `--defer-publication` alone does not establish it:

```yaml
review_ownership:
  owner_id: <parent runtime identity>
  work_id: <resolved work ID>
  plan_source: state.md
  task_ids: [<full delivery task IDs>]
  scope: <integrated change and intended publication surfaces>
  base_revision: <immutable delivery base>
  review_at: integrated
```

The named owner accepts the independent-review obligation. Children implement coherent slices, perform self-checks and applicable focused validation, and return changed paths, exact implementation/check evidence, contract bindings, outstanding risks, and readiness. Their internal checkpoints and optional slice commits do not add independent review. Nested parents forward the same owner unless that owner explicitly transfers the complete obligation; they never silently create another final-review gate.

After integration and documentation finish, the owner assigns one independent holistic reviewer and any risk-required specialists. Specification-driven delivery uses `specification:review-implementation` for alignment and Coding coverage in that session. A direct child review request or an independently published slice establishes its own review boundary; missing or contradictory ownership falls back to the normal Coding workflow. An unresolved risk that prevents safe implementation returns to the owner immediately rather than waiting for integration.

The parent keeps specification freshness, approvals, integration validation, persistence, and publication responsibilities. This capsule waives none of them and grants children no protected-file or publication authority.

## Bind the result to its inputs

The main agent persists a companion receipt under the active work's `artifacts/review/`, after the independent reviewer confirms its scope and bindings. Keep existing area reports and PR ledgers unchanged: they own findings, identities, dispositions, evidence, and closure. The receipt references their paths and exact hashes rather than copying findings.

Record:

- reviewer runtime identity, capability, independence from the implementing author, verdict, and unresolved exceptions;
- reviewed revision and immutable base revision, plus the selected scope's path inventory, file modes, and exact content hashes, including deletions and relevant read dependencies;
- approved specification locators, exact approved content identities, and approval/provenance references, or an explicit absence of specification authority;
- canonical `plan_source: state.md`, relevant full task IDs and semantic definitions: summary, targets, requiredness, acceptance mapping, and relevant dependency edges;
- resolved areas and path coverage, applicable standard/rule paths and content identities, and the report/ledger evidence each binding supports;
- applicable deterministic-check receipts with their exact checked inputs and outcomes.

Use content identities for governing documents and task definitions, not a hash of the whole work-state tree. Journal entries, task owners, progress/status, timestamps, and derived views do not invalidate semantic review. A changed task definition or approved specification does, even when its ID or implementation stayed the same. Specification transport still performs its mandatory freshness probes; a newer content-preserving transport receipt does not itself require new source analysis.

## Select the next mission

Perform one complete independent source review, then compare the current inputs with its receipt before assigning further analysis. The caller records old/new bindings, changed paths/contracts, affected findings and areas, relevant dependencies, and the proposed verification scope. The independent reviewer confirms that impact boundary; uncertainty expands it rather than granting reuse.

| Change since valid review | Next mission |
|---|---|
| Reply explaining an existing decision | Verify that disposition and its cited evidence against the current discussion |
| Bounded bug fix | Review the patch, affected callers/paths, regression-check evidence, and related findings |
| Documentation clarification | Recheck the affected documentation and governing contract |
| API, trust boundary, base revision, or architecture | Assess affected dependencies and expand source review to the demonstrated impact; use a fresh broad review when that risk warrants it |
| No relevant change | Reuse valid source coverage; refresh only publication observations that can change remotely |

Retain the original independent reviewer for ordinary follow-ups. Independence is from the author, not from previous review context. When that reviewer is unavailable, give one replacement the receipt, prior reports, dispositions, and bounded mission. A replacement session alone does not justify exhaustive rediscovery. Named risk, unverifiable bindings, or an impact boundary that cannot be established may require broader review and specialist escalation.

Invalidate only evidence that depends on changed code, base relationships, specification content, semantic task definitions, scope, or standards. Include relevant read dependencies and regressions, not merely edited lines. Retain unaffected area reports and findings; a successful partial recheck combines with valid baseline coverage to cover the full resolved scope. Record the new verification's own inputs and the carried-forward reports it validates. Never overwrite original execution identities or present stale, missing, or uncovered evidence as current.

Applicable mechanical checks follow [deterministic-check evidence](validation.md#reuse-deterministic-check-evidence), which owns command, input, configuration and environment bindings. Cover missing/affected checks and the mandatory candidate scan for affected project groups with current execution or valid exact-input evidence. A discussion-only disposition check does not rescan unchanged source. Existing finding identities, dispositions, blocker thresholds, partial-report retry rules, and closure requirements remain unchanged. Settled findings reopen only on cited new invalidating evidence.

## Consume evidence at publication

The publication owner supplies this receipt, its reports/ledger, and the intended head/base map. The independent publication reviewer verifies reviewer identity, report integrity, complete coverage, closure, and every binding against the actual published surface. A receipt is evidence, never permission to approve itself. Missing, unverifiable, stale, or uncovered evidence requires source review of the affected scope.

An unchanged content inventory and governing contract may retain their source verdict after a metadata-only commit changes the head SHA. Preserve the original reviewed revision and record the demonstrated content-equivalent publication mapping; never relabel old analysis as a new execution. A different base revision requires impact assessment even if the head tree is identical. Stack evidence must cover each published surface against its own base; an integrated-tip verdict alone cannot approve an unreviewed intermediate commit.

Always check current PR head and base, complete discussion and dispositions, required authorization, and hosted CI. Keep local exact-revision parity separate: semantic-review reuse never waives it. When all source bindings hold, the PR mission verifies this publication state and consumes the existing source verdict without repeating exhaustive source analysis. Prefer the already assigned independent reviewer; a replacement receives the receipt and reports rather than inheriting an author's conclusions. No current independent evidence means no approval.
