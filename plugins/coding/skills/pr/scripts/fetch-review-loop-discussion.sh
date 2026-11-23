#!/usr/bin/env bash
# Prints a pull request's complete discussion as JSONL records of
# {host, owner, repo, pr_number, kind, value}: one record per issue_comment,
# review and inline_comment, then one review_threads record holding the whole
# thread inventory. Every page is read before any record is printed, so a failed
# read prints nothing and returns its status. Sourcing the script also binds
# PR_METADATA, HOST, OWNER, REPO and PR_NUMBER in the caller.

PR_URL=$1
PR_METADATA=$(bash "${CODING_PR_SKILL_DIR}/scripts/resolve-pr.sh" "$PR_URL") || exit $?
HOST=$(jq -er .host <<<"$PR_METADATA") || exit $?
OWNER=$(jq -er .owner <<<"$PR_METADATA") || exit $?
REPO=$(jq -er .repo <<<"$PR_METADATA") || exit $?
PR_NUMBER=$(jq -er .number <<<"$PR_METADATA") || exit $?

# GitHub's REST page maximum is 100, so that value minimizes requests without limiting coverage
ISSUE_COMMENTS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments?per_page=100") || exit $?
REVIEWS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews?per_page=100") || exit $?
INLINE_COMMENTS=$(gh api --hostname "$HOST" --paginate --slurp \
  "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments?per_page=100") || exit $?
THREADS=$(bun "${CODING_PR_SKILL_DIR}/../../scripts/gh-pr-threads.ts" \
  "$PR_NUMBER" --repo "$HOST/$OWNER/$REPO") || exit $?

DISCUSSION_RECORD='{host:$host, owner:$owner, repo:$repo, pr_number:$pr, kind:$kind, value:.}'
DISCUSSION=$(
  jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
    --argjson pr "$PR_NUMBER" --arg kind issue_comment \
    ".[][] | $DISCUSSION_RECORD" <<<"$ISSUE_COMMENTS" &&
    jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
      --argjson pr "$PR_NUMBER" --arg kind review \
      ".[][] | $DISCUSSION_RECORD" <<<"$REVIEWS" &&
    jq -c --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
      --argjson pr "$PR_NUMBER" --arg kind inline_comment \
      ".[][] | $DISCUSSION_RECORD" <<<"$INLINE_COMMENTS" &&
    jq -ce --arg host "$HOST" --arg owner "$OWNER" --arg repo "$REPO" \
      --argjson pr "$PR_NUMBER" --arg kind review_threads \
      "$DISCUSSION_RECORD" <<<"$THREADS"
) || exit $?
printf '%s\n' "$DISCUSSION"
