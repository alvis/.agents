#!/usr/bin/env bash
set -euo pipefail

# pre-commit-hook.sh -- PreToolUse hook
# Backs up the working tree before any history-rewriting op (git or jj).
# Plain saves (git commit, jj describe, jj new, jj split) do NOT rewrite past
# history and therefore skip backup. Backup only runs when an operation can
# mutate prior changes (e.g. --retrospective / --reorder workflows).
# Input:  JSON on stdin { tool_name, tool_input | toolInput: { command } } --
#         Claude Code and Codex send snake_case tool_input, Grok Build sends
#         camelCase toolInput.
# Output: JSON on stdout in the resolving harness's native envelope. Grok Build
#         reads a top-level {"decision","reason"} object and ignores the Claude
#         keys; Claude Code and Codex read permissionDecision* inside
#         hookSpecificOutput. A run resolving no harness variable keeps the
#         Claude envelope, matching settings-registered invocations.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

# Resolve the harness whose plugin-root variable fired, in the anchor chain's
# own order; a new harness extends this chain by one segment. Prints claude,
# codex, grok, or none.
resolve_harness() {
  if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    printf '%s\n' claude
  elif [[ -n "${PLUGIN_ROOT:-}" ]]; then
    printf '%s\n' codex
  elif [[ -n "${GROK_PLUGIN_ROOT:-}" ]]; then
    printf '%s\n' grok
  else
    printf '%s\n' none
  fi
}

# Read JSON from stdin
INPUT="$(cat)"

extract_command() {
  local input="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r '(.tool_input // .toolInput).command // empty' 2>/dev/null
  else
    printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
  fi
}

COMMAND="$(extract_command "$INPUT")"

# Trigger ONLY on history-rewriting ops. Plain saves are skipped.
#   Rewriting:  git rebase, jj rebase / squash / absorb / abandon / edit
#   Plain save: git commit, jj describe, jj new, jj split  (no backup)
case "$COMMAND" in
  git\ rebase*) ;;
  jj\ rebase*|jj\ squash*|jj\ absorb*|jj\ abandon*|jj\ edit*) ;;
  *) exit 0 ;;
esac

# Run backup -- capture output, don't block on failure
BACKUP_OUTPUT=""
if BACKUP_OUTPUT="$(bash "$SCRIPT_DIR/backup.sh" 2>&1)"; then
  GIT_TREE_SHA="$(printf '%s' "$BACKUP_OUTPUT" | grep '^GIT_TREE_SHA=' | cut -d= -f2)"
  CONTENT_HASH="$(printf '%s' "$BACKUP_OUTPUT" | grep '^CONTENT_HASH=' | cut -d= -f2)"
  BACKUP_PATH="$(printf '%s' "$BACKUP_OUTPUT" | grep '^BACKUP_PATH=' | cut -d= -f2)"

  CONTEXT="Auto-backup: GIT_TREE_SHA=$GIT_TREE_SHA CONTENT_HASH=$CONTENT_HASH BACKUP_PATH=$BACKUP_PATH"
  # Grok Build honors only a top-level decision object, so the same notice
  # travels in its native shape there instead of being silently dropped.
  if [[ "$(resolve_harness)" == "grok" ]]; then
    jq -cn --arg reason "$CONTEXT" '{decision:"allow",reason:$reason}'
  else
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "allow",
    "additionalContext": "$CONTEXT"
  }
}
EOF
  fi
else
  printf 'Warning: backup.sh failed (exit %s), proceeding anyway\n' "$?" >&2
  printf 'Backup output: %s\n' "$BACKUP_OUTPUT" >&2
  exit 0
fi
