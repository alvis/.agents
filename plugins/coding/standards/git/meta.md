# Pull-Request Change Standards

_Scannable requirements for implementation diffs and rendered PR messages._

## Authority Boundary

This standard owns only violations detectable mechanically or semantically in an implementation diff or rendered PR message. Each violation is an issue that requires a fix.

The [commit-message standard](../commit/meta.md) owns the text of a commit message, including the header contract a PR title reuses. [coding:commit](../../skills/commit/SKILL.md) owns commit, branch, and local history directions. [create-update.md](../../skills/pr/directions/create-update.md), [stacked-prs.md](../../skills/pr/directions/stacked-prs.md), [review.md](../../skills/pr/directions/review.md), and [merge.md](../../skills/pr/directions/merge.md) own PR directions. The PR skill's [message.md](../../skills/pr/templates/message.md) owns the PR body shape, while [review-publication.ts](../../skills/pr/scripts/review-publication.ts) owns review assessment, rendering, approval, and publication. Those directions and artifacts are not standards.

## Dependent Standards

Relationships below explain the selection owned by [WORKFLOW.md](../../directions/WORKFLOW.md).

- Commit Message Standards (standard:commit) - owns the header contract a PR title reuses; this standard never reports commit text

## What's Stricter Here

This standard enforces requirements beyond typical pull-request size practices:

| Standard Practice | Our Stricter Requirement |
|---|---|
| Size judged by lines or files changed | **Zone from declared logical change units and a risk-class floor; authored lines only bump one step (`GIT-PR-SIZE-01`)** |
| Author-declared size accepted as given | **Independent reviewer recounts units and risk class and may only raise the zone (`GIT-PR-SIZE-01`)** |
| Large PRs merged on a general approval | **Yellow and above carry Risk and Test plan; red and black carry a specific Why this size; ready black PRs carry an exact-revision human verification task (`GIT-PR-SIZE-02`…`GIT-PR-SIZE-04`)** |

## Canonical Inputs

- [size-thresholds.json](../../skills/pr/assets/size-thresholds.json) is the sole numeric zone authority: unit bands, risk floors, the authored-line bump, and the move-similarity cutoff.
- [classify-pr-size.ts](../../skills/pr/scripts/classify-pr-size.ts) computes authored lines from an exact committed base/head diff and applies that asset to the PR's declared change inventory.
- [scan-pr-message.ts](../../skills/pr/scripts/scan-pr-message.ts) scans a rendered PR body against its selected template, exact revision, and conditional evidence.

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

Record the note in the PR discussion against the exact head and base OIDs. Repository files cannot change the fixed PR-size thresholds. `GIT-PR-SIZE-04` adds a human verification task to the ready PR description; that task is outside this exception policy.

## Rule Groups

- `GIT-PR-02`: Rendered PR-message conformance.
- `GIT-PR-SIZE-*`: Change inventory, authored-line inputs, zones, evidence, and ready-state verification tasks.
- `GIT-PR-TYPE-02..05`: Atomic feature composition, migration and mechanical separation, and generated-output marking.
- `GIT-PR-STACK-04`: Existing feature-flag support and changed-flag evidence.
