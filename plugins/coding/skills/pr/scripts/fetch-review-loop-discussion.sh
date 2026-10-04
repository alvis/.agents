#!/usr/bin/env bash

PR_URL=$1
PR_METADATA=$(bash "${CODING_PR_SKILL_DIR}/scripts/resolve-pr.sh" "$PR_URL") || exit $?
HOST=$(jq -er .host <<<"$PR_METADATA") || exit $?
OWNER=$(jq -er .owner <<<"$PR_METADATA") || exit $?
REPO=$(jq -er .repo <<<"$PR_METADATA") || exit $?
PR_NUMBER=$(jq -er .number <<<"$PR_METADATA") || exit $?
gh api --hostname "$HOST" "repos/$OWNER/$REPO/pulls/$PR_NUMBER/comments" --paginate
gh api --hostname "$HOST" "repos/$OWNER/$REPO/issues/$PR_NUMBER/comments" --paginate
bun "${CODING_PR_SKILL_DIR}/../../scripts/gh-pr-threads.ts" "$PR_NUMBER" \
  --repo "$HOST/$OWNER/$REPO"
