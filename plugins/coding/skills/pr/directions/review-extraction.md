# Creating the review tree

Load this from *Locate or create the review tree* in `coding:pr review` before
reuse selection for a local repository. The change-tracking path was already
selected; follow only its row.

## Checkout forms

Before accepting a local reused tree or creating a local owned tree, fetch and
verify both pinned commit objects:

```bash
git -C <target-repository-root> fetch origin "pull/$PR_NUMBER/head"
git -C <target-repository-root> cat-file -e "$HEAD_OID^{commit}" ||
  git -C <target-repository-root> fetch origin "$HEAD_OID"
git -C <target-repository-root> fetch origin "$BASE_REF"
git -C <target-repository-root> cat-file -e "$BASE_OID^{commit}" ||
  git -C <target-repository-root> fetch origin "$BASE_OID"
git -C <target-repository-root> cat-file -e "$HEAD_OID^{commit}"
git -C <target-repository-root> cat-file -e "$BASE_OID^{commit}"
```

`pull/<n>/head` resolves same-repo and fork heads without adding a remote.
Fetching `BASE_REF` is not evidence that its current tip equals `BASE_OID`, so
verify the pinned object and fetch that exact OID when necessary. Stop before
merge-base calculation if either object is unavailable. `jj` has no equivalent
for fetching a bare PR ref; in a colocated repository Git and jj share the
object store, so these objects are immediately visible to jj.

Create owned trees through `scripts/temp-tree.sh`; its lease is the cleanup
handle and keeps shell functions or traps out of the skill tool call.

| Case | Condition | Helper |
|---|---|---|
| jj workspace | In the target repository, jj path | `temp-tree.sh open-jj "$REPOSITORY_ROOT" "$HEAD_OID"` |
| git worktree | In the target repository, git path | `temp-tree.sh open-git "$REPOSITORY_ROOT" "$HEAD_OID"` |
| Fresh clone | Not in the target repository, or `--repo` names another | `temp-tree.sh open-clone "https://$HOST/$OWNER/$REPO" "$PR_NUMBER" "$HEAD_OID"`, then fetch and verify the pinned base in the clone |

The workspace and worktree forms reuse local objects and are the fast path. In the
clone form the helper owns the whole clone under the same guarded lease.

## Cleanup contract

For an owned tree, run
`bash "${CODING_PR_SKILL_DIR}/scripts/temp-tree.sh" close "$TREE_LEASE"`.
The helper releases a git worktree or uniquely named jj workspace before
deleting its guarded lease; a clone has no external registration.

<IMPORTANT>
The context-owning parent creates an owned tree before reviewer dispatch,
retains the exact helper-issued lease, and runs `close` after reviewer success,
failure, or cancellation. The helper's signal trap protects construction only;
never transfer lifetime ownership to the disposable reviewer. A reused tree
belongs to the user and is never passed to `close`.
</IMPORTANT>

Close on pass, failure, blocked discovery, and cancellation alike, then confirm
nothing was left behind:

```bash
jj workspace list 2>/dev/null | grep -F "$REVIEW_DIR" && echo "stale jj workspace"
git worktree list | grep -F "$REVIEW_DIR" && echo "stale git worktree"
```

A stale entry is a reportable failure with its recovery command
(`jj workspace forget <name>` or `git worktree prune`).

Read files from the review tree and nowhere else, so the review reflects the PR head
rather than whatever the local working copy happens to hold.
