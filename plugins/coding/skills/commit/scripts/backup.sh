#!/usr/bin/env bash
set -euo pipefail

# backup.sh -- full working tree backup + dual checksums
# Interface:  backup.sh [repo-path]
# Stdout:     GIT_TREE_SHA=<hex>  CONTENT_HASH=<hex>  BACKUP_PATH=<path>  REPO_ROOT=<path>
# Exit:       0=ok  1=not-git  2=cp-fail  3=write-tree  4=hash-fail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

detect_sha256

# Resolve repo root
REPO_PATH="${1:-.}"
REPO_ROOT="$(cd "$REPO_PATH" && git rev-parse --show-toplevel 2>/dev/null)" \
  || die "Not a git repository: $REPO_PATH" 1

# Create backup directory
EPOCH="$(date +%s)"
CKPT_BASE="$(checkpoint_dir "$REPO_ROOT")"
BACKUP_DIR="${CKPT_BASE}/${EPOCH}-$$"
mkdir -p "$BACKUP_DIR" || die "Failed to create backup directory: $BACKUP_DIR" 2

# Copy full working tree including .git/ and untracked files
cp -R "$REPO_ROOT/." "$BACKUP_DIR/" || die "Failed to copy working tree" 2

# A linked worktree's gitfile points to live shared metadata. Replace it with
# an independent metadata snapshot before running any Git mutation.
if [ -f "$BACKUP_DIR/.git" ]; then
  COMMON_DIR="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  WORKTREE_GIT_DIR="$(git -C "$REPO_ROOT" rev-parse --absolute-git-dir)"
  rm "$BACKUP_DIR/.git"
  cp -R "$COMMON_DIR" "$BACKUP_DIR/.git" || die "Failed to copy shared Git metadata" 2
  cp -R "$WORKTREE_GIT_DIR/." "$BACKUP_DIR/.git/" || die "Failed to copy worktree Git metadata" 2
  rm -f "$BACKUP_DIR/.git/commondir" "$BACKUP_DIR/.git/gitdir"
fi

# Override copied worktree paths; recovery commands must use the backup tree.
for BACKUP_CONFIG in "$BACKUP_DIR/.git/config" "$BACKUP_DIR/.git/config.worktree"; do
  [ -f "$BACKUP_CONFIG" ] || continue
  git config --file "$BACKUP_CONFIG" core.worktree "$BACKUP_DIR"
  git config --file "$BACKUP_CONFIG" core.bare false
done

# Preserve the captured staging index while calculating the working-tree SHA.
GIT_TREE_SHA="$(
  export GIT_INDEX_FILE="$BACKUP_DIR/.git/backup-index"
  trap 'rm -f "$GIT_INDEX_FILE"' EXIT
  if [ -f "$BACKUP_DIR/.git/index" ]; then
    cp "$BACKUP_DIR/.git/index" "$GIT_INDEX_FILE"
  fi
  git --git-dir="$BACKUP_DIR/.git" --work-tree="$BACKUP_DIR" add -A &&
    git --git-dir="$BACKUP_DIR/.git" --work-tree="$BACKUP_DIR" write-tree
)" \
  || die "git write-tree failed in backup" 3

# Compute Content Hash of original repo
CONTENT_HASH="$(compute_content_hash "$REPO_ROOT")" \
  || die "Content hash computation failed" 4

# Write checkpoint
cat > "${CKPT_BASE}/.checkpoint" <<CKPT
GIT_TREE_SHA=$GIT_TREE_SHA
CONTENT_HASH=$CONTENT_HASH
BACKUP_PATH=$BACKUP_DIR
REPO_ROOT=$REPO_ROOT
CKPT

# Output to stdout
printf 'GIT_TREE_SHA=%s\n' "$GIT_TREE_SHA"
printf 'CONTENT_HASH=%s\n' "$CONTENT_HASH"
printf 'BACKUP_PATH=%s\n' "$BACKUP_DIR"
printf 'REPO_ROOT=%s\n' "$REPO_ROOT"
