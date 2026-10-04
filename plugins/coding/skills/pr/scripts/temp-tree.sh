#!/usr/bin/env bash
set -euo pipefail
# gh pr/repo calls go through the coding plugin's routing wrappers, which
# keep gh's interface and reroute over REST where GraphQL is blocked
CODING_SCRIPTS=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../scripts" && pwd)

usage() {
  echo "usage: temp-tree.sh open-git|open-jj <repo> <revision> | open-clone <repository-url> <pr-number> <revision> | close <lease>" >&2
  exit 2
}

lease_guard() {
  local temp_root=${TMPDIR:-/tmp}
  temp_root=${temp_root%/}
  case "$1" in
    "$temp_root"/pr-tree-lease-*) ;;
    *) echo "refusing unrecognized lease: $1" >&2; exit 2 ;;
  esac
}

close_lease() {
  local lease=$1 kind repo tree lease_real tree_real workspace
  lease_guard "$lease"
  [ -d "$lease" ] || return 0
  lease_real=$(cd "$lease" && pwd -P)
  kind=$(<"$lease/kind")
  repo=$(<"$lease/repo")
  tree=$(<"$lease/tree")
  [ "$tree" = "$lease/checkout" ] || [ "$tree" = "$lease_real/checkout" ] || {
    echo "lease checkout escaped its root" >&2
    exit 2
  }
  tree_real="$lease_real/checkout"
  case "$kind" in
    git) git -C "$repo" worktree remove --force "$tree_real" 2>/dev/null || true ;;
    jj)
      workspace=$(<"$lease/workspace")
      jj --repository "$repo" workspace forget "$workspace" 2>/dev/null || true
      ;;
    clone) ;;
    *) echo "unknown lease kind: $kind" >&2; exit 2 ;;
  esac
  rm -rf -- "$lease_real"
}

open_tree() {
  local kind=$1 repo=$2 revision=$3 lease tree temp_root workspace
  repo=$(cd "$repo" && pwd -P)
  temp_root=${TMPDIR:-/tmp}
  temp_root=${temp_root%/}
  lease=$(mktemp -d "$temp_root/pr-tree-lease-XXXXXX")
  tree="$lease/checkout"
  printf '%s\n' "$kind" >"$lease/kind"
  printf '%s\n' "$repo" >"$lease/repo"
  printf '%s\n' "$tree" >"$lease/tree"
  trap 'close_lease "$lease"' ERR HUP INT TERM
  case "$kind" in
    git) git -C "$repo" worktree add --detach "$tree" "$revision" >&2 ;;
    jj)
      workspace="pr-tree-$(basename "$lease")"
      printf '%s\n' "$workspace" >"$lease/workspace"
      jj --repository "$repo" workspace add --name "$workspace" \
        --revision "$revision" "$tree" >&2
      ;;
    *) usage ;;
  esac
  trap - ERR HUP INT TERM
  jq -n --arg lease "$lease" --arg tree "$tree" \
    '{lease:$lease, tree:$tree}'
}

open_clone() {
  local repository=$1 pr_number=$2 revision=$3 lease tree temp_root
  case "$repository" in
    */*) ;;
    *) usage ;;
  esac
  case "$pr_number" in
    ''|*[!0-9]*) usage ;;
  esac
  temp_root=${TMPDIR:-/tmp}
  temp_root=${temp_root%/}
  lease=$(mktemp -d "$temp_root/pr-tree-lease-XXXXXX")
  tree="$lease/checkout"
  printf '%s\n' clone >"$lease/kind"
  printf '%s\n' "$repository" >"$lease/repo"
  printf '%s\n' "$tree" >"$lease/tree"
  trap 'close_lease "$lease"' ERR HUP INT TERM
  bun "$CODING_SCRIPTS/gh-repo-clone.ts" "$repository" "$tree" -- --no-checkout >&2
  git -C "$tree" fetch origin "pull/$pr_number/head" >&2
  git -C "$tree" cat-file -e "$revision^{commit}"
  git -C "$tree" checkout --detach "$revision" >&2
  trap - ERR HUP INT TERM
  jq -n --arg lease "$lease" --arg tree "$tree" \
    '{lease:$lease, tree:$tree}'
}

case "${1:-}" in
  open-git)
    [ "$#" -eq 3 ] || usage
    open_tree git "$2" "$3"
    ;;
  open-jj)
    [ "$#" -eq 3 ] || usage
    open_tree jj "$2" "$3"
    ;;
  open-clone)
    [ "$#" -eq 4 ] || usage
    open_clone "$2" "$3" "$4"
    ;;
  close)
    [ "$#" -eq 2 ] || usage
    close_lease "$2"
    ;;
  *)
    usage
    ;;
esac
