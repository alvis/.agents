# common.sh -- shared utilities for commit skill scripts
# Sourced by other scripts; do not execute directly.

die() {
  local msg="${1:?}" code="${2:-1}"
  printf '%s\n' "ERROR: $msg" >&2
  exit "$code"
}

detect_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    SHA256_CMD="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    SHA256_CMD="shasum -a 256"
  elif command -v openssl >/dev/null 2>&1; then
    SHA256_CMD="openssl dgst -sha256 -r"
  else
    die "No SHA-256 tool found (tried sha256sum, shasum, openssl)" 4
  fi
}

sha256_hex() {
  $SHA256_CMD | sed 's/[[:space:]].*//'
}

compute_content_hash() {
  local dir="${1:?}"
  (
    cd "$dir"
    find . -path ./.git -prune -o -type f -print | LC_ALL=C sort | while IFS= read -r f; do
      printf '%s  ' "$f"
      $SHA256_CMD < "$f" | sed 's/[[:space:]].*//'
    done | sha256_hex
  )
}

checkpoint_dir() {
  local root="${1:?}"
  local name
  name="$(basename "$root")"
  printf '%s' "${TMPDIR:-/tmp}/git-backups/${name}"
}

json_field() {
  local field="${1:?}"
  if command -v jq >/dev/null 2>&1; then
    jq -r ".${field}" 2>/dev/null
  else
    sed -n 's/.*"'"$field"'"[[:space:]]*:[[:space:]]*"\{0,1\}\([^",}]*\)"\{0,1\}[,}].*/\1/p' | head -1
  fi
}

# Recognize the Git rewrite commands used by this skill, without executing
# shell text. Other rewrite forms require the skill's manual checkpoint.
is_git_history_rewrite() {
  local command="${1:-}"
  local -a arguments
  local argument skip_value=0
  case "$command" in
    rtk\ proxy\ *) command="${command#rtk proxy }" ;;
    rtk\ *) command="${command#rtk }" ;;
  esac

  # Quoted argument contents are data, so a message mentioning --amend cannot
  # turn an ordinary save into a rewrite. Supported flags are unquoted.
  command="$(printf '%s\n' "$command" | sed -E 's/"([^"\\]|\\.)*"|'"'"'[^'"'"']*'"'"'/__quoted_argument__/g')"
  read -r -a arguments <<< "$command"
  [[ "${arguments[0]:-}" == git ]] || return 1
  case "${arguments[1]:-}" in
    rebase) return 0 ;;
    commit)
      for argument in "${arguments[@]:2}"; do
        if [[ "$skip_value" == 1 ]]; then
          skip_value=0
          continue
        fi
        case "$argument" in
          -m|--message|-F|--file|-C|--reuse-message|-c|--reedit-message)
            skip_value=1 ;;
          --amend) return 0 ;;
          --) return 1 ;;
        esac
      done
      ;;
  esac
  return 1
}
