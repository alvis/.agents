# GitHub mechanics

## Read and bind

Bind `HOST`, `REPOSITORY`, and numeric `NUMBER` from the target; reject a PR masquerading as an issue. Use direct reads:

```bash
gh api --hostname "$HOST" "repos/$REPOSITORY/issues/$NUMBER"
gh api --hostname "$HOST" --method GET \
  "repos/$REPOSITORY/issues/$NUMBER/comments" -F per_page=100 -F page="$PAGE"
```

An issue response containing `pull_request` is not an issue. Save `node_id`, title, body, state, labels, milestone, timestamps, and comment IDs/content for comparison. Page comments from 1 while a next page exists and detail budget remains; each request consumes a detail read. Do not infer thread completeness from a truncated response. Record the latest substantive human evidence separately from generic update timestamps.

For create and authorized title/body updates, discover effective issue templates and contributing instructions through `directions/templates.md`. Read repository project conventions before composing writes. Discover existing metadata:

```bash
gh api --hostname "$HOST" --paginate "repos/$REPOSITORY/labels?per_page=100"
gh api --hostname "$HOST" --paginate "repos/$REPOSITORY/milestones?state=open&per_page=100"
gh api --hostname "$HOST" graphql -f owner="$OWNER" -f name="$REPO_NAME" \
  -f query='query($owner:String!,$name:String!){repository(owner:$owner,name:$name){issueTypes(first:100){nodes{id name} pageInfo{hasNextPage endCursor}} projectsV2(first:100){nodes{id number title closed} pageInfo{hasNextPage endCursor}}}}'
```

For GraphQL connections with `hasNextPage`, repeat with `after` set to `endCursor`; never select from a claimed complete inventory that was truncated. Discover organization/user projects with `gh project list --owner "$PROJECT_OWNER" --format json --limit "$LIMIT"` when repository-linked projects are insufficient; raise the explicit limit or paginate the owner's `projectsV2` connection if results fill it. Only select projects supported by repository conventions or explicit intent. Permission/schema errors leave that field unresolved, not silently absent. Native types and project IDs are distinct from labels, milestone numbers, and issue numbers.

## Bodies, comments, and retries

Write multiline text through a file or JSON input, never interpolate report text into shell code. Post a triage comment with:

```bash
gh issue comment "$NUMBER" --repo "$REPOSITORY" --body-file "$BODY_FILE"
```

After every mutation, fetch the changed resource and compare intended values. For comments, bind the returned comment URL/ID and verify its body. On a timeout/unknown write result, reread before retrying; reuse an existing equivalent comment or issue instead of duplicating it. On permission/validation failure, stop that operation and report its explicit cause. Honor rate-limit reset/retry headers. At most two targeted retries limits duplicate-write risk; unresolved outcomes remain reported. Read-back cannot eliminate the API's race window: detect conflicts and do not overwrite newly observed human edits.

## Duplicate closure

After verifying the evidence comment, bind `CANONICAL_URL` to the proven duplicate target and check `gh issue close --help` supports `--duplicate-of`. Reread both issues and run the query below before closing to verify host support and current state:

```bash
gh api --hostname "$HOST" graphql -f id="$ISSUE_ID" \
  -f query='query($id:ID!){node(id:$id){... on Issue{url state stateReason duplicateOf{id url}}}}'
gh issue close "$NUMBER" --repo "$REPOSITORY" --duplicate-of "$CANONICAL_URL"
```

Repeat the query after closing. Verify `state` is `CLOSED`, `stateReason` is `DUPLICATE`, and `duplicateOf` identifies the intended canonical issue. If the CLI or host lacks this capability, keep the issue open and report closure blocked; do not substitute a rejection reason. A lost close response follows the read-before-retry rule above. Report a verified comment separately from failed closure or relationship read-back.

## Metadata writes

Use exact discovered values. Apply independent fields separately so partial success is visible. Add labels without replacing unrelated ones using a JSON array `SELECTED_LABELS`:

```bash
jq -n --argjson labels "$SELECTED_LABELS" '{labels:$labels}' | \
  gh api --hostname "$HOST" --method POST \
    "repos/$REPOSITORY/issues/$NUMBER/labels" --input -
```

Remove only obsolete labels selected by the outcome, using `DELETE repos/OWNER/REPO/issues/NUMBER/labels/URL_ENCODED_NAME`; encode the entire label path segment, including slashes. Read current labels again before removal. Set a milestone by its discovered numeric identifier with `PATCH repos/OWNER/REPO/issues/NUMBER`, using JSON `{"milestone": NUMBER}`; explicit removal uses null. Set a discovered issue type by node IDs:

```bash
gh api --hostname "$HOST" graphql -f id="$ISSUE_ID" -f type="$TYPE_ID" \
  -f query='mutation($id:ID!,$type:ID!){updateIssue(input:{id:$id,issueTypeId:$type}){issue{id issueType{id name}}}}'
```

For project membership, use `gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --url "$ISSUE_URL" --format json`. First inspect existing membership with `gh project item-list ... --format json --limit "$LIMIT"`, increasing the limit or paginating project items as needed; match content URL, never title alone. Read back the item. Select a project field only from `gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit "$LIMIT"`. Set an explicit limit; if the returned field count fills it or is below the reported total, increase it and repeat until completeness is established. If a permission or retrieval limit prevents completion, report that field unresolved without assuming an absent match. Match the exact field ID/type and, for single-select fields, a returned option ID; use `gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID"` for a discovered single-select choice. Do not infer a delivery status or priority without repository evidence. Project mutations may require separate project permissions; report that failure without broadening scopes.

For a proven parent/sub-issue relationship, inspect current `parent` and `subIssues` first, then:

```bash
gh api --hostname "$HOST" graphql -f parent="$PARENT_ID" -f child="$CHILD_ID" \
  -f query='mutation($parent:ID!,$child:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id}}}'
```

For a proven dependency, inspect `blockedBy` first and use:

```bash
gh api --hostname "$HOST" graphql -f issue="$ISSUE_ID" -f blocker="$BLOCKER_ID" \
  -f query='mutation($issue:ID!,$blocker:ID!){addBlockedBy(input:{issueId:$issue,blockingIssueId:$blocker}){issue{id}}}'
```

Read each relationship back through the issue's GraphQL fields, paging connections. Never replace a parent, remove dependencies, or reverse dependency direction by inference. Ordinary related issues receive plain references, not invented native relationships. PR Development linking belongs to `coding:pr`.
