#!/usr/bin/env bash
# gh pr/repo calls go through the coding plugin's routing wrappers, which
# keep gh's interface and reroute over REST where GraphQL is blocked
CODING_SCRIPTS=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../scripts" && pwd)

REMOTE=${CALLER_REMOTE:-}
CURRENT_BRANCH=
if [ "${PUBLICATION_VCS:-git}" != jj ]; then
  CURRENT_BRANCH=$(git branch --show-current) || exit $?
fi
if [ -z "$REMOTE" ] && [ -n "$CURRENT_BRANCH" ]; then
  REMOTE=$(git config --get -- "branch.$CURRENT_BRANCH.pushRemote") || REMOTE=
fi
if [ -z "$REMOTE" ]; then
  REMOTE=$(git config --get -- remote.pushDefault) || REMOTE=
fi
if [ -z "$REMOTE" ]; then
  GITHUB_REMOTES=()
  while IFS= read -r CANDIDATE; do
    PUSH_URL=$(git remote get-url --push -- "$CANDIDATE") || exit $?
    if bun "$CODING_SCRIPTS/gh-repo-view.ts" "$PUSH_URL" --json nameWithOwner >/dev/null 2>&1; then
      GITHUB_REMOTES[${#GITHUB_REMOTES[@]}]=$CANDIDATE
    fi
  done < <(git remote || exit $?)
  [ "${#GITHUB_REMOTES[@]}" -eq 1 ] || {
    printf 'remote resolution requires one GitHub push remote; found %s\n' \
      "${#GITHUB_REMOTES[@]}" >&2
    exit 1
  }
  REMOTE=${GITHUB_REMOTES[0]}
fi
PUSH_URL=$(git remote get-url --push -- "$REMOTE") || exit $?
PUSH_REPOSITORY=$(
  bun "$CODING_SCRIPTS/gh-repo-view.ts" "$PUSH_URL" --json nameWithOwner --jq .nameWithOwner
) || exit $?
PUSH_OWNER=${PUSH_REPOSITORY%%/*}
printf 'REMOTE=%s\nPUSH_OWNER=%s\n' "$REMOTE" "$PUSH_OWNER"
