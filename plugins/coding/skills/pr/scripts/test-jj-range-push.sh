#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PREFLIGHT_SH="$SCRIPT_DIR/preflight-jj-range-push.sh"
REAL_JJ=$(command -v jj) || {
  echo 'jj is required for the real-repository range-push tests' >&2
  exit 1
}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-jj-range-push.XXXXXX") || exit 1
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

SPY_BIN=$TMP_ROOT/bin
mkdir -p "$SPY_BIN"

cat >"$SPY_BIN/jj" <<'EOF'
#!/usr/bin/env bash
case " $* " in
  *' git push '*) printf '%s\n' "$*" >>"$PUSH_LOG" ;;
esac
exec "$REAL_JJ" "$@"
EOF
chmod +x "$SPY_BIN/jj"

failures=0

fail() {
  failures=$((failures + 1))
  printf 'FAIL [%s]: %s\n' "$1" "$2" >&2
}

new_case() {
  name=$1
  case_root=$TMP_ROOT/case-$name
  case_origin=$case_root/origin.git
  case_repo=$case_root/repo
  mkdir -p "$case_root"
  git init --quiet --bare --initial-branch=main "$case_origin"
  git init --quiet --initial-branch=main "$case_repo"
  git -C "$case_repo" config user.email test@example.com
  git -C "$case_repo" config user.name Test
  : >"$case_repo/base"
  git -C "$case_repo" add base
  git -C "$case_repo" commit --quiet --no-gpg-sign -m base
  git -C "$case_repo" remote add origin "$case_origin"
  git -C "$case_repo" push --quiet origin main

  git -C "$case_repo" checkout --quiet -b stack/01-a
  : >"$case_repo/old-a"
  git -C "$case_repo" add old-a
  git -C "$case_repo" commit --quiet --no-gpg-sign -m old-a
  OLD_A=$(git -C "$case_repo" rev-parse HEAD)
  git -C "$case_repo" push --quiet --set-upstream origin stack/01-a

  git -C "$case_repo" checkout --quiet -b stack/02-b
  : >"$case_repo/old-b"
  git -C "$case_repo" add old-b
  git -C "$case_repo" commit --quiet --no-gpg-sign -m old-b
  git -C "$case_repo" push --quiet --set-upstream origin stack/02-b

  git -C "$case_repo" checkout --quiet stack/01-a
  : >"$case_repo/a"
  git -C "$case_repo" add a
  git -C "$case_repo" commit --quiet --no-gpg-sign -m a
  SHA_A=$(git -C "$case_repo" rev-parse HEAD)

  git -C "$case_repo" checkout --quiet stack/02-b
  git -C "$case_repo" rebase --quiet --onto stack/01-a "$OLD_A"
  SHA_B=$(git -C "$case_repo" rev-parse HEAD)

  git -C "$case_repo" checkout --quiet main
  git -C "$case_repo" checkout --quiet -b sibling
  : >"$case_repo/sibling"
  git -C "$case_repo" add sibling
  git -C "$case_repo" commit --quiet --no-gpg-sign -m sibling
  git -C "$case_repo" checkout --quiet stack/02-b
  (cd "$case_repo" && "$REAL_JJ" git init --colocate >/dev/null 2>&1)
  (cd "$case_repo" && "$REAL_JJ" bookmark track \
    stack/01-a@origin stack/02-b@origin >/dev/null 2>&1)
  (cd "$case_repo" &&
    "$REAL_JJ" bookmark set --allow-backwards stack/01-a \
      -r "$SHA_A" >/dev/null 2>&1 &&
    "$REAL_JJ" bookmark set --allow-backwards stack/02-b \
      -r "$SHA_B" >/dev/null 2>&1)

  PUSH_LOG=$TMP_ROOT/push-$name.log
  : >"$PUSH_LOG"
  export PUSH_LOG REAL_JJ
}

run_rejection() {
  name=$1
  expected_error=$2
  shift 2

  set +e
  output=$(cd "$case_repo" && PATH="$SPY_BIN:$PATH" \
    /bin/bash "$PREFLIGHT_SH" --remote origin "$@" \
    2>"$TMP_ROOT/stderr-$name")
  status=$?
  set -e

  [ "$status" -ne 0 ] || fail "$name" "status was zero"
  [ ! -s "$PUSH_LOG" ] || fail "$name" "push was invoked: $(cat "$PUSH_LOG")"
  grep -F "$expected_error" "$TMP_ROOT/stderr-$name" >/dev/null ||
    fail "$name" "missing error [$expected_error], got [$(cat "$TMP_ROOT/stderr-$name")]"
  [ -z "$output" ] || fail "$name" "unexpected stdout [$output]"
}

new_case empty-endpoint
run_rejection empty-endpoint \
  'refusing revision-range push: empty first endpoint' \
  absent stack/02-b

new_case ambiguous-endpoint
(cd "$case_repo" &&
  "$REAL_JJ" bookmark create ambiguous -r stack/01-a >/dev/null 2>&1 &&
  BASE_OP=$("$REAL_JJ" op log -n1 --no-graph -T 'self.id()') &&
  "$REAL_JJ" bookmark set ambiguous -r stack/02-b >/dev/null 2>&1 &&
  "$REAL_JJ" --at-operation "$BASE_OP" bookmark set --allow-backwards \
    ambiguous -r sibling >/dev/null 2>&1 &&
  "$REAL_JJ" status >/dev/null 2>&1)
run_rejection ambiguous-endpoint \
  'refusing revision-range push: ambiguous last endpoint' \
  stack/01-a ambiguous

new_case non-ancestor
run_rejection non-ancestor \
  'refusing revision-range push: boundaries are not linear' \
  stack/01-a sibling

new_case bookmark-mismatch
(cd "$case_repo" &&
  "$REAL_JJ" bookmark create unrelated -r stack/01-a >/dev/null 2>&1)
run_rejection bookmark-mismatch \
  'refusing revision-range push: unexpected bookmarks' \
  stack/01-a stack/02-b

new_case tag-presence
(cd "$case_repo" &&
  "$REAL_JJ" tag set selected -r stack/01-a >/dev/null 2>&1)
run_rejection tag-presence \
  'refusing revision-range push: selected tags' \
  stack/01-a stack/02-b

new_case success
set +e
success_output=$(cd "$case_repo" && PATH="$SPY_BIN:$PATH" \
  /bin/bash "$PREFLIGHT_SH" --remote origin stack/01-a stack/02-b \
  2>"$TMP_ROOT/stderr-success")
success_status=$?
set -e
success_log=$(cat "$PUSH_LOG")
remote_a=$(git -C "$case_origin" rev-parse --verify --quiet \
  refs/heads/stack/01-a || true)
remote_b=$(git -C "$case_origin" rev-parse --verify --quiet \
  refs/heads/stack/02-b || true)

[ "$success_status" -eq 0 ] || fail success \
  "status $success_status, stderr [$(cat "$TMP_ROOT/stderr-success")]"
[ "$(wc -l <"$PUSH_LOG" | tr -d ' ')" = 1 ] ||
  fail success "push count [$(wc -l <"$PUSH_LOG" | tr -d ' ')]"
case "$success_log" in
  *" git push --remote origin --revision $SHA_A::$SHA_B") ;;
  *) fail success "push log [$success_log]" ;;
esac
[ "$success_output" = "PUSH_REVSET=$SHA_A::$SHA_B" ] ||
  fail success "stdout [$success_output]"
[ "$remote_a" = "$SHA_A" ] || fail success \
  "remote stack/01-a [$remote_a], stderr [$(cat "$TMP_ROOT/stderr-success")]"
[ "$remote_b" = "$SHA_B" ] || fail success \
  "remote stack/02-b [$remote_b], stderr [$(cat "$TMP_ROOT/stderr-success")]"

if [ "$failures" -ne 0 ]; then exit 1; fi
printf 'PASS: 5 fail-closed rejections and 1 real jj range push\n'
