# GitHub mechanics

Every recipe here is a REST call or the coding plugin's [`gh-issue.ts`](../../../scripts/gh-issue.ts) wrapper, which keeps `gh issue`'s interface and reroutes over REST where GraphQL is blocked.

## Read and bind

Bind `HOST`, `REPOSITORY`, and numeric `NUMBER` from the target; reject a PR masquerading as an issue. Use direct reads:

```bash
gh api --hostname "$HOST" "repos/$REPOSITORY/issues/$NUMBER"
gh api --hostname "$HOST" --method GET \
  "repos/$REPOSITORY/issues/$NUMBER/comments" -F per_page=100 -F page="$PAGE"
```

An issue response containing `pull_request` is not an issue. Save the numeric `id`, title, body, state, labels, milestone, type, timestamps, and comment IDs/content for comparison. Page comments from 1 while a next page exists and detail budget remains; each request consumes a detail read. Do not infer thread completeness from a truncated response. Record the latest substantive human evidence separately from generic update timestamps.

Read `.github/ISSUE_TEMPLATE/` and contributing instructions before composing writes. Discover existing metadata:

```bash
gh api --hostname "$HOST" --paginate "repos/$REPOSITORY/labels?per_page=100"
gh api --hostname "$HOST" --paginate "repos/$REPOSITORY/milestones?state=open&per_page=100"
gh api --hostname "$HOST" --paginate "orgs/$OWNER/issue-types"
```

Issue types exist only for organization-owned repositories; a 404 for a user-owned repository means no types, not a failure. Permission errors leave that field unresolved, not silently absent. Type names and milestone numbers are distinct from labels and issue numbers.

## Bodies, comments, and retries

Write multiline text through a file or JSON input, never interpolate report text into shell code. Post a triage comment with:

```bash
bun "${ISSUE_SKILL_DIR}/../../scripts/gh-issue.ts" comment "$NUMBER" --repo "$HOST/$REPOSITORY" --body-file "$BODY_FILE"
```

After every mutation, fetch the changed resource and compare intended values. For comments, bind the returned comment URL/ID and verify its body. On a timeout/unknown write result, reread before retrying; reuse an existing equivalent comment or issue instead of duplicating it. On permission/validation failure, stop that operation and report its explicit cause. Honor rate-limit reset/retry headers. At most two targeted retries limits duplicate-write risk; unresolved outcomes remain reported. Read-back cannot eliminate the API's race window: detect conflicts and do not overwrite newly observed human edits.

## Metadata writes

Use exact discovered values. Apply independent fields separately so partial success is visible. Add labels without replacing unrelated ones using a JSON array `SELECTED_LABELS`:

```bash
jq -n --argjson labels "$SELECTED_LABELS" '{labels:$labels}' | \
  gh api --hostname "$HOST" --method POST \
    "repos/$REPOSITORY/issues/$NUMBER/labels" --input -
```

Remove only obsolete labels selected by the outcome, using `DELETE repos/OWNER/REPO/issues/NUMBER/labels/URL_ENCODED_NAME`; encode the entire label path segment, including slashes. Read current labels again before removal. Set a milestone by its discovered numeric identifier with `PATCH repos/OWNER/REPO/issues/NUMBER`, using JSON `{"milestone": NUMBER}`; explicit removal uses null. Set a discovered issue type the same way with `{"type": "TYPE_NAME"}` and read back `type.name`.

For a proven parent/sub-issue relationship, inspect the child's current parent (`GET repos/OWNER/REPO/issues/CHILD/parent`) and the parent's `sub_issues` first, then attach the child by its numeric `id`, not its number:

```bash
jq -n --argjson child "$CHILD_ID" '{sub_issue_id:$child}' | \
  gh api --hostname "$HOST" --method POST \
    "repos/$REPOSITORY/issues/$PARENT_NUMBER/sub_issues" --input -
```

For a proven dependency, inspect `GET repos/OWNER/REPO/issues/NUMBER/dependencies/blocked_by` first and add the blocker by its numeric `id`:

```bash
jq -n --argjson blocker "$BLOCKER_ID" '{issue_id:$blocker}' | \
  gh api --hostname "$HOST" --method POST \
    "repos/$REPOSITORY/issues/$NUMBER/dependencies/blocked_by" --input -
```

Read each relationship back through the same list endpoints with `--paginate`. Never replace a parent, remove dependencies, or reverse dependency direction by inference. Ordinary related issues receive plain references, not invented native relationships. PR Development linking belongs to `coding:pr`.
