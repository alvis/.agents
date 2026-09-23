# GIT-PR-SIZE-04: Black Zone PR Size

## Severity

warning

## Intent

A black-zone PR changes **> 60 files** OR **> 2000 authored net LOC**. Every changed path contributes to the file threshold; generated-file additions and deletions do not contribute to LOC under `GIT-PR-SIZE-01`. It remains black: repository configuration cannot change these thresholds. A genuinely self-contained unit may be pushed as a draft and tested without prior authorization only when its canonical PR body supplies specific Risk, Test plan, and Why this size evidence. Review approval blocks until its exact surface receives the red-zone policy's two reviewer evidence triplets and one-off code-owner authorization in the PR discussion.

The limits above are the open-ended projection of the highest bounds in `../../../skills/pr/assets/size-thresholds.json`, the sole numeric threshold authority, and contract verification checks them against that asset.

## Fix

Report this finding once; do not auto-post a canned PR comment:

```text
Black-zone PR: keep one self-contained review unit; exact-revision code-owner authorization is required before approval.
```

If splitting is genuinely impossible, a code owner must author a PR discussion comment as a human GitHub user in this form:

```text
Black-zone authorization
Head OID: `<full-oid>`
Base OID: `<full-oid>`
Authorization: I authorize this one-off black-zone publication.
Indivisibility: <atomic subject> because <coupling>; otherwise <consequence>
```

For a personal-account repository, only that account is a code owner. For an organization repository, an active organization owner or a user listed in the effective CODEOWNERS file is a code owner; a team entry includes active team members when the team can write the repository. The [code-owner verifier](../../../skills/pr/scripts/verify-code-owner.ts) takes username, repository account, and repository name, then reports the result with exit status. Standalone calls inspect the default branch. The PR gate binds the lookup to the exact base OID. It uses GitHub's CODEOWNERS location precedence and ignores invalid lines; listed users must have write access. [GitHub's CODEOWNERS documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) owns syntax and access rules.

Run `bun run "${CODING_PR_SKILL_DIR}/scripts/verify-code-owner.ts" <username> <repo-account> <repo-name>` after setting `CODING_PR_SKILL_DIR` as the PR skill directs. Exit `0` prints the verified role; exit `1` prints a denial or verification failure; exit `2` reports invalid input.

The comment has exactly these five ordered nonempty lines, with no extra or duplicate marker lines. The helper verifies this structure and the author's code-owner status, then returns the live matched comment as one structured receipt. Full review uses only that receipt's `authorization_body` and `rationale` to judge whether the named subject, coupling, and consequence are specific to the change; a generic or tautological rationale is a blocking finding. An earlier fetched comment or body cannot authorize approval.

The authoring workflow may push the exact draft head/base pair, run CI, and dispatch review without prior authorization. Immediately before a black-zone review would submit `APPROVE`, it verifies the live comment mechanically with `verify-black-zone-authorization.sh`. Failure caps that event at `COMMENT` and returns `authorization_required` with the exact blocked head/base OIDs; it does not suppress review findings or a `REQUEST_CHANGES` verdict. The workflow never creates or edits an exception/configuration file and never posts the authorization itself. PR bodies, reviews, bot or non-code-owner comments, stale OIDs, structurally invalid comments, and generic or tautological rationales never count. Any head or base OID change invalidates the comment.

### Why this matters

- Reviewer recall drops sharply past ~60 files; bugs hide in the long tail of the diff.
- Exact-revision code-owner authorization preserves engineering judgment for a legitimate atomic change without weakening the canonical thresholds.

## Edge Cases

- A PR with more than 60 generated paths (for example, SDK regeneration) remains black through the unchanged file-count threshold even though those paths contribute no LOC. It may justify authorization, but receives a full review.
- A black PR opened for "speed of review" contradicts the rule — speed is exactly what the zone threshold protects.
- Authorization is one-off and revision-bound; it cannot establish a repository-wide exception.

## Related

GIT-PR-SIZE-02, GIT-PR-SIZE-03, GIT-PR-TYPE-02, GIT-PR-TYPE-03, GIT-PR-TYPE-04, GIT-PR-TYPE-05
