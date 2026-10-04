# Development links

Load during issue-coverage planning for read-only inventory, before pushing an existing PR to remove proven stale links, and after publication to add or verify resolving links. Before each mutation, verify the numeric PR identity and the head/base pair bound for that phase; disposition evidence names the intended diff. `coding:issue` owns issue content and metadata; this direction owns PR-to-issue resolution links. Every resolving issue is also on the PR body's closing line, whose form [create-update.md](create-update.md) owns; merely related or partially addressed issues receive plain references, not closing links. A manually linked resolving PR may close the issue when merged under GitHub's rules; removing keywords does not disable that behavior.

The link reads and mutations below are GraphQL-only. Where GraphQL is blocked, as in coding-agent cloud sessions where the first read below returns HTTP 403, skip them: the closing line is then the only association, so report each resolving link as `unverified: GraphQL unavailable` without blocking readiness, and demote a stale issue on the closing line to a plain reference instead of removing a manual link.

## Resolve identities

Use the receiving `HOST`, PR repository `REPOSITORY`, numeric `PR_NUMBER`, and the selected issue's repository `ISSUE_REPOSITORY` and number `ISSUE_NUMBER`. Numbers alone are not globally unique. Require both repositories on the same host, read current state, and preserve valid existing links. An inaccessible issue, a PR passed as an issue, a moved head/base pair, or uncertain resolution intent blocks that association rather than triggering a search or guessed replacement.

```bash
PR_ID=$(gh api --hostname "$HOST" "repos/$REPOSITORY/pulls/$PR_NUMBER" --jq .node_id) || exit $?
ISSUE_JSON=$(gh api --hostname "$HOST" "repos/$ISSUE_REPOSITORY/issues/$ISSUE_NUMBER") || exit $?
ISSUE_ID=$(jq -er 'select(.pull_request == null) | .node_id' <<<"$ISSUE_JSON") || exit $?
```

For a closed issue, retain an existing valid link but do not add a new closing association or reopen it automatically. Establish whether the report is a new regression before associating a resolving PR. Validate the PR is still open and its current head/base pair still matches the publication binding before a mutation.

## Read existing links

Use this query before and after each link mutation. Save the complete result for the publication report. `first:100` is GitHub's maximum connection page size; `--paginate` follows every cursor rather than treating the first page as the full relationship set.

```bash
MANUAL_LINKS=$(gh api --hostname "$HOST" graphql --paginate \
  -f pr="$PR_ID" \
  -f query='query($pr:ID!,$endCursor:String){
    node(id:$pr){... on PullRequest{
      closingIssuesReferences(first:100,after:$endCursor,userLinkedOnly:true){
        nodes{id url}
        pageInfo{hasNextPage endCursor}
      }
    }}
  }') || exit $?
printf '%s\n' "$MANUAL_LINKS" | jq -se '
  all(.[]; (.errors == null) and
    (.data.node.closingIssuesReferences.nodes | type == "array"))' >/dev/null || exit 1
```

For issue-coverage planning, run the same paginated query with `userLinkedOnly:false` to collect all closing issue identities; retain the manual-only result separately. Read the current PR body to identify body directives. A nonmanual result alone does not establish body provenance: historical commits can supply it too. Do not rewrite those commits.

Inspect every manual page's `nodes` for `ISSUE_ID`. For a resolving disposition, if present, report the link as preserved and skip the addition. Do not infer a manual link from message text, cross-reference comments, or an issue's project membership.

## Reconcile changed intent

For a selected issue now proven partial or merely related, remove its existing manual closing link before pushing the changed surface. Reread intent and current links immediately before mutation; uncertainty blocks that update rather than authorizing removal. Skip removal when the complete manual inventory already omits the issue. Otherwise use the exact issue and PR IDs:

```bash
UNLINK_RESULT=$(jq -n --arg issue "$ISSUE_ID" --arg pr "$PR_ID" '{
  query: "mutation($input:RemoveCloseIssueReferencesInput!){removeCloseIssueReferences(input:$input){issue{id}}}",
  variables: {input: {issueId: $issue, pullRequestIds: [$pr]}}
}' | gh api --hostname "$HOST" graphql --input -) || exit $?
printf '%s\n' "$UNLINK_RESULT" | jq -e --arg issue "$ISSUE_ID" '
  (.errors == null) and (.data.removeCloseIssueReferences.issue.id == $issue)' >/dev/null || exit 1
```

Read all manual pages again and require the selected issue absent; preserve every other relationship. A timeout needs read-back before retrying a still-present link. Failed or unverified removal blocks the changed surface's publication. A body directive for this now-nonresolving issue must become a plain reference in the authorized body update; verify the all-links inventory afterward. If a historical commit still supplies a closing reference, or its source is unresolved, report the conflict and block readiness without rewriting history.

## Add the missing link

GitHub's GraphQL `addCloseIssueReferences` mutation creates manual closing references. Use it through `gh api`; `gh pr edit` has no issue-link flag. Send one selected PR per call so a partial failure is attributable to one relationship; the API permits at most ten PR IDs in one call if batching is later needed.

```bash
LINK_RESULT=$(jq -n --arg issue "$ISSUE_ID" --arg pr "$PR_ID" '{
  query: "mutation($input:AddCloseIssueReferencesInput!){addCloseIssueReferences(input:$input){issue{id}}}",
  variables: {input: {issueId: $issue, pullRequestIds: [$pr]}}
}' | gh api --hostname "$HOST" graphql --input -) || exit $?
printf '%s\n' "$LINK_RESULT" | jq -e --arg issue "$ISSUE_ID" '
  (.errors == null) and (.data.addCloseIssueReferences.issue.id == $issue)' >/dev/null || exit 1
```

Repeat the paginated read above and require the selected `ISSUE_ID` in the manual links. Recheck the bound PR head/base pair; if it changed, reconsider resolution against that surface before claiming success. A successful mutation response without verified read-back is `unverified`, not a verified link.

## Failure and completion

On timeout, transport failure, or GraphQL error, retain the response and read current manual links before retrying: the write may have succeeded. Retry only a still-missing relationship after correcting the observed cause, at most twice to bound repeated remote writes. Never remove unrelated relationships, broaden credentials automatically, or close an issue directly. Removal and conversion failures keep their publication/readiness blockers; green CI does not clear them.

For GitHub Enterprise versions or permissions that do not expose this mutation/query, report the unsupported capability or permission failure and the published PR URL. A maintainer may establish the relationship through GitHub's Development UI; verify it through an available relationship read before reporting success. Publication with a required unresolved association is partial completion. Return each issue URL, PR URL, resolving intent, added/preserved/removed/unverified/failed outcome, and read-back evidence to the calling PR workflow.
