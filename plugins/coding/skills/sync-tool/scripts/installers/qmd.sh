#!/usr/bin/env bash
# qmd.sh — install or update qmd (local hybrid search CLI, npm package @tobilu/qmd) per-OS.
#
# Branches:
#   - macOS (Darwin):              ensure Homebrew SQLite, then npm install -g @tobilu/qmd
#   - Linux:                       npm install -g @tobilu/qmd
#   - Windows (MINGW/MSYS/CYGWIN): npm install -g @tobilu/qmd
#
# The host must already provide Node 22 or later with npm: qmd's bin/qmd starts
# with `#!/usr/bin/env node`, so no other runtime can start it. Nothing here or
# in qmd enforces the version: npm only warns (EBADENGINE) on an older Node.
#
# macOS needs Homebrew SQLite because Apple's bundled SQLite cannot load extensions.
#
# After installing, if qmd does not resolve on PATH, the npm global bin directory
# is derived and the exact `export PATH=...` line to add is printed. On Windows
# shells the npm prefix is converted with `cygpath -u` first.
# After a fresh install (qmd absent beforehand) `qmd pull` runs once to
# pre-download models; a failed pull is reported but does not fail the install.
#
# Honors DRY_RUN=1 (echo planned cmd) and FORCE=1 (reinstall even if present).
# Minimum version: 2.9.0 (verification done by sync.ts post-run).
# Exits 0 on success; non-zero with stderr message on failure.
#
# Self-contained: no shared shell library.

set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
FORCE="${FORCE:-0}"
PACKAGE="@tobilu/qmd"

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "+ $*" >&2
  else
    eval "$@"
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "qmd.sh: required command '$1' not found on PATH" >&2
    exit 1
  fi
}

# POSIX-style directory where `npm install -g` places executables.
npm_global_bin_dir() {
  local prefix
  prefix="$(npm prefix -g)"
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      # npm on Windows places shims in the prefix itself, as a Windows path.
      cygpath -u "$prefix"
      ;;
    *)
      echo "$prefix/bin"
      ;;
  esac
}

on_path() {
  case ":$PATH:" in
    *":$1:"*) return 0 ;;
    *) return 1 ;;
  esac
}

pull_models() {
  # Pre-download models once; embedding itself happens later in the background.
  local qmd_path="$1"
  if [[ "$qmd_path" == "qmd" ]]; then
    if ! run_cmd "qmd pull"; then
      echo "qmd.sh: 'qmd pull' failed; models will download on first use." >&2
    fi
  elif ! "$qmd_path" pull; then
    echo "qmd.sh: 'qmd pull' failed; models will download on first use." >&2
  fi
}

install_qmd() {
  local had_before=0 bin_dir qmd_path="qmd"
  require_cmd npm
  if command -v qmd >/dev/null 2>&1; then
    had_before=1
  fi

  # Reinstalling the same package upgrades it in place; FORCE needs no extra flag.
  run_cmd "npm install -g $PACKAGE"

  # A dry run installs nothing, so there is no bin directory to locate.
  if [[ "$DRY_RUN" != "1" ]] && ! command -v qmd >/dev/null 2>&1; then
    bin_dir="$(npm_global_bin_dir)"
    if ! on_path "$bin_dir"; then
      echo "qmd.sh: qmd installed to $bin_dir, which is not on PATH." >&2
      echo "qmd.sh: add this line to your shell profile, then open a new shell:" >&2
      # shellcheck disable=SC2016 # $PATH must stay literal in the printed line
      printf 'export PATH=%q:$PATH\n' "$bin_dir" >&2
    else
      echo "qmd.sh: $bin_dir is on PATH but contains no qmd; check npm's bin-links setting." >&2
    fi
    qmd_path="$bin_dir/qmd"
  fi

  if [[ "$had_before" == "0" ]]; then
    pull_models "$qmd_path"
  fi
}

uname_s="$(uname -s)"

case "$uname_s" in
  Darwin)
    require_cmd brew
    run_cmd "brew list --versions sqlite >/dev/null 2>&1 || brew install sqlite"
    install_qmd
    ;;

  Linux)
    install_qmd
    ;;

  MINGW* | MSYS* | CYGWIN*)
    install_qmd
    ;;

  *)
    echo "qmd.sh: unrecognized OS (uname -s: $uname_s)" >&2
    exit 1
    ;;
esac
