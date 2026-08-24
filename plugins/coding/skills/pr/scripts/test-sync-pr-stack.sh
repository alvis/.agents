#!/usr/bin/env bash
set -u

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SYNC_PR_STACK_SH="$SCRIPT_DIR/sync-pr-stack.sh"
RESOLVE_PUSH_REMOTE_SH="$SCRIPT_DIR/resolve-push-remote.sh"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/test-sync-pr-stack.XXXXXX") || exit 1
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM
ORIGINAL_PATH=$PATH
REAL_JJ=$(command -v jj 2>/dev/null || :)

FAKE_BIN="$TMP_ROOT/bin"
FAKE_LOG="$TMP_ROOT/calls.log"
LOCAL_REFS="$TMP_ROOT/local-refs.json"
JJ_BOUND_REFS="$TMP_ROOT/jj-bound-refs.json"
REMOTE_REFS="$TMP_ROOT/remote-refs.json"
PR_DATA="$TMP_ROOT/pr-data.json"
PUSH_MARKER="$TMP_ROOT/push-complete"
POST_PUSH_HEAD_SEEN="$TMP_ROOT/post-push-head-seen"
PR_RETARGETED="$TMP_ROOT/pr-retargeted"
mkdir -p "$FAKE_BIN"

cat >"$FAKE_BIN/jj" <<'EOF'
#!/usr/bin/env bash
set -u
set_remote_ref() {
  branch=$1 oid=$2
  jq --arg branch "$branch" --arg oid "$oid" '.[$branch] = $oid' \
    "$REMOTE_REFS" >"$REMOTE_REFS.next" && mv "$REMOTE_REFS.next" "$REMOTE_REFS"
  jq --arg branch "$branch" --arg oid "$oid" \
    'map(if .bookmark == $branch then .headRefOid = $oid else . end)' \
    "$PR_DATA" >"$PR_DATA.next" && mv "$PR_DATA.next" "$PR_DATA"
}
[ "${SELECT_GIT:-false}" = false ] || exit 1
jj_refs=$LOCAL_REFS
jj_operation=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --ignore-working-copy) shift ;;
    --at-operation)
      [ "$#" -ge 2 ] || exit 97
      jj_operation=$2 jj_refs=$JJ_BOUND_REFS
      shift 2
      ;;
    *) break ;;
  esac
done
if [ "$#" -eq 2 ] && [ "$1" = git ] && [ "$2" = root ]; then
  printf '%s\n' "$DETECT_GIT_DIR"; exit 0
fi
if [ "$#" -eq 6 ] && [ "$1" = log ] && [ "$2" = -r ] &&
  [ "$3" = @- ] && [ "$4" = --no-graph ] && [ "$5" = -T ]; then
  printf '%s\n' "$DETECT_SHA"; exit 0
fi
if [ "$#" -eq 5 ] && [ "$1" = bookmark ] && [ "$2" = list ] &&
  [ "$4" = -T ]; then
  case "$3" in exact:*) branch=${3#exact:} ;; *) exit 97 ;; esac
  oid=$(jq -er --arg branch "$branch" '.[$branch]' "$jj_refs") || exit $?
  jq -cn --arg branch "$branch" --arg oid "$oid" \
    '{name:$branch,target:[$oid]}'
  if remote_oid=$(jq -er --arg branch "$branch" '.[$branch]' "$REMOTE_REFS" 2>/dev/null); then
    jq -cn --arg branch "$branch" --arg oid "$remote_oid" \
      --arg tracking "$oid" \
      '{name:$branch,remote:"upstream",target:[$oid],tracking_target:[$tracking]}'
  fi
  exit 0
fi
if [ "$#" -eq 7 ] && [ "$1" = op ] && [ "$2" = log ] &&
  [ "$3" = --no-graph ] && [ "$4" = -n ] && [ "$5" = 1 ] &&
  [ "$6" = -T ]; then
  cp "$LOCAL_REFS" "$JJ_BOUND_REFS"
  printf 'bound-operation\n'; exit 0
fi
if [ "$#" -eq 4 ] && [ "$1" = git ] && [ "$2" = fetch ] &&
  [ "$3" = --remote ]; then
  printf 'fetch:%s\n' "$4" >>"$FAKE_LOG"
  if [ "${FETCH_FAIL:-false}" = true ]; then printf 'fetch failed\n' >&2; exit 41; fi
  if [ -n "${DRIFT_DURING_FETCH_BRANCH:-}" ]; then
    set_remote_ref "$DRIFT_DURING_FETCH_BRANCH" "$DRIFT_DURING_FETCH_OID"
  fi
  exit 0
fi
if [ "$#" -ge 4 ] && [ "$1" = git ] && [ "$2" = push ] && [ "$3" = --remote ]; then
  [ -n "$jj_operation" ] || exit 97
  printf 'push:%s:at:%s' "$4" "$jj_operation" >>"$FAKE_LOG"; shift 4
  if [ -n "${JJ_MOVE_BEFORE_PUSH_BRANCH:-}" ]; then
    jq --arg branch "$JJ_MOVE_BEFORE_PUSH_BRANCH" \
      --arg oid "$JJ_MOVE_BEFORE_PUSH_OID" '.[$branch] = $oid' \
      "$LOCAL_REFS" >"$LOCAL_REFS.next" && mv "$LOCAL_REFS.next" "$LOCAL_REFS"
  fi
  while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] && [ "$1" = --bookmark ] || exit 97
    case "$2" in exact:*) branch=${2#exact:} ;; *) exit 97 ;; esac
    printf ':exact:%s' "$branch" >>"$FAKE_LOG"
    if [ "$branch" != "${JJ_SKIP_PUSH_BOOKMARK:-}" ]; then
      oid=$(jq -er --arg branch "$branch" '.[$branch]' "$jj_refs") || exit 97
      set_remote_ref "$branch" "$oid" || exit 97
    fi
    shift 2
  done
  printf '\n' >>"$FAKE_LOG"
  : >"$PUSH_MARKER"
  if [ "${JJ_PUSH_FAIL:-false}" = true ]; then printf 'push failed\n' >&2; exit 42; fi
  exit 0
fi
printf 'unexpected-jj:%s\n' "$*" >>"$FAKE_LOG"; exit 97
EOF

cat >"$FAKE_BIN/git" <<'EOF'
#!/usr/bin/env bash
set -u
original_args=("$@")
if [ "$#" -gt 0 ]; then case "$1" in --git-dir=*) shift ;; esac; fi
if [ "${FAKE_REMOTE_LOOKUP:-false}" = true ] && [ "$#" -ge 4 ] &&
  [ "$1" = remote ] && [ "$2" = get-url ]; then
  printf 'ssh://example.test/%s.git\n' "${!#}"; exit 0
fi
if [ "${FAKE_REMOTE_LOOKUP:-false}" = true ] && [ "$#" -eq 3 ] &&
  [ "$1" = cat-file ] && [ "$2" = -e ]; then
  printf 'cat-file:%s\n' "$3" >>"$FAKE_LOG"
  [ "$3" = "$DETECT_SHA^{commit}" ] && [ "${JJ_PARENT_BACKED:-true}" = true ]
  exit $?
fi
if [ "${FAKE_REMOTE_LOOKUP:-false}" = true ] && [ "$#" -eq 4 ] &&
  [ "$1" = ls-remote ] && [ "$2" = -- ]; then
  branch=${4#refs/heads/}; printf 'observe:%s:%s\n' "$3" "$branch" >>"$FAKE_LOG"
  if [ -e "$PUSH_MARKER" ] &&
    { [ "$branch" = "${DRIFT_AFTER_VERIFICATION_BRANCH:-}" ] ||
      [ "$branch" = "${FAIL_AFTER_VERIFICATION_BRANCH:-}" ]; }; then
    if [ -e "$POST_PUSH_HEAD_SEEN" ]; then
      if [ "$branch" = "${FAIL_AFTER_VERIFICATION_BRANCH:-}" ]; then
        exit 45
      fi
      jq --arg branch "$branch" --arg oid "$DRIFT_AFTER_PUSH_OID" \
        '.[$branch] = $oid' "$REMOTE_REFS" >"$REMOTE_REFS.next" &&
        mv "$REMOTE_REFS.next" "$REMOTE_REFS"
    else
      : >"$POST_PUSH_HEAD_SEEN"
    fi
  fi
  oid=$(jq -er --arg branch "$branch" '.[$branch]' "$REMOTE_REFS" 2>/dev/null) || exit 0
  printf '%s\trefs/heads/%s\n' "$oid" "$branch"; exit 0
fi
if [ "${FAKE_REMOTE_LOOKUP:-false}" = true ] && [ "$#" -eq 4 ] &&
  [ "$1" = merge-base ] && [ "$2" = --is-ancestor ]; then
  [ "$4" != "${TOPOLOGY_FAIL_OID:-}" ]; exit $?
fi
if [ "$#" -gt 0 ] && [ "$1" = push ]; then
  printf 'git-push:' >>"$FAKE_LOG"; printf '%s ' "$@" >>"$FAKE_LOG"; printf '\n' >>"$FAKE_LOG"
  refspec=${!#}; branch=${refspec##*:refs/heads/}
  if [ -n "${RACE_COLLABORATOR:-}" ] && [ "$branch" = "${RACE_BRANCH:-}" ]; then
    /usr/bin/git -C "$RACE_COLLABORATOR" push --quiet origin \
      "refs/heads/$branch:refs/heads/$branch" || exit 96
    RACE_COLLABORATOR=; export RACE_COLLABORATOR
  fi
  if [ "$branch" = "${MOVE_LOCAL_BRANCH_BEFORE_PUSH:-}" ]; then
    /usr/bin/git update-ref "refs/heads/$branch" "$MOVE_LOCAL_BRANCH_TO" || exit 95
  fi
  if [ "$branch" = "${FAIL_PUSH_BRANCH:-}" ]; then
    printf 'selected push failed\n' >&2; exit 55
  fi
fi
exec /usr/bin/git "${original_args[@]}"
EOF

cat >"$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
set -u
if [ "$#" -eq 4 ] && [ "$1" = api ] && [ "$2" = --hostname ]; then
  expected_path="repos/$RECEIVING_REPOSITORY/git/ref/heads/$RECEIVING_BASE"
  [ "$4" = "$expected_path" ] || exit 98
  printf 'base:%s:%s\n' "$3" "$4" >>"$FAKE_LOG"
  [ "${RECEIVING_BASE_FAIL:-false}" = false ] || exit 48
  base_oid=$RECEIVING_BASE_OID
  if [ -e "$PUSH_MARKER" ] &&
    [ "${DRIFT_RECEIVING_BASE_AFTER_PUSH:-false}" = true ]; then
    base_oid=$DRIFT_AFTER_PUSH_OID
  fi
  jq -cn --arg ref "refs/heads/$RECEIVING_BASE" --arg oid "$base_oid" \
    '{ref:$ref,object:{type:"commit",sha:$oid}}'
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = repo ] && [ "$2" = view ]; then
  printf '%s\n' "${FAKE_PUSH_REPOSITORY:-octo/widgets}"
  exit 0
fi
if [ "$#" -ge 2 ] && [ "$1" = pr ] && [ "$2" = list ]; then
  repo= head=; shift 2
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo) repo=$2; shift 2 ;; --head) head=$2; shift 2 ;;
      --state|--limit|--json) shift 2 ;; *) exit 98 ;;
    esac
  done
  printf 'list:%s:%s\n' "$repo" "$head" >>"$FAKE_LOG"
  if [ "$head" = "${GH_FAIL_BOOKMARK:-}" ]; then printf 'discovery failed\n' >&2; exit 44; fi
  jq -c --arg repo "$repo" --arg head "$head" \
    '[.[] | select(.repo == $repo and .bookmark == $head) | del(.repo, .bookmark)]' "$PR_DATA"
  exit 0
fi
if [ "$#" -ge 3 ] && [ "$1" = pr ] && [ "$2" = view ]; then
  number=$3 repo=; shift 3
  while [ "$#" -gt 0 ]; do
    case "$1" in --repo) repo=$2; shift 2 ;; --json) shift 2 ;; *) exit 98 ;; esac
  done
  printf 'view:%s:%s\n' "$repo" "$number" >>"$FAKE_LOG"
  if [ "$number" = "${READBACK_FAIL_NUMBER:-}" ]; then
    printf 'read-back failed\n' >&2; exit 47
  fi
  if [ "$number" = "${RETARGET_BEFORE_BASE_NUMBER:-}" ] &&
    [ -e "$PUSH_MARKER" ] && [ ! -e "$PR_RETARGETED" ]; then
    jq --arg repo "$repo" --argjson number "$number" \
      --arg base "$RETARGET_BASE" --arg oid "$RETARGET_BASE_OID" \
      'map(if .repo == $repo and .number == $number then
        .baseRefName = $base | .baseRefOid = $oid else . end)' \
      "$PR_DATA" >"$PR_DATA.next" && mv "$PR_DATA.next" "$PR_DATA"
    : >"$PR_RETARGETED"
  fi
  row=$(jq -ce --arg repo "$repo" --argjson number "$number" \
    '[.[] | select(.repo == $repo and .number == $number)][0] | del(.repo, .bookmark)' \
    "$PR_DATA") || exit 47
  if [ "$number" = "${READBACK_NAME_MISMATCH_NUMBER:-}" ]; then
    row=$(jq -c '.baseRefName = "wrong/readback"' <<<"$row")
  fi
  if [ "$number" = "${READBACK_OID_MISMATCH_NUMBER:-}" ]; then
    row=$(jq -c --arg oid "$READBACK_MISMATCH_OID" '.baseRefOid = $oid' <<<"$row")
  fi
  if [ "$number" = "${READBACK_IDENTITY_MISMATCH_NUMBER:-}" ]; then
    row=$(jq -c '.number += 1000' <<<"$row")
  fi
  printf '%s\n' "$row"; exit 0
fi
if [ "$#" -eq 7 ] && [ "$1" = pr ] && [ "$2" = edit ] &&
  [ "$4" = --repo ] && [ "$6" = --base ]; then
  number=$3 repo=$5 base=$7
  printf 'edit:%s:%s:%s\n' "$repo" "$number" "$base" >>"$FAKE_LOG"
  if [ "$number" = "${EDIT_FAIL_NUMBER:-}" ]; then printf 'edit failed\n' >&2; exit 46; fi
  if [ "$base" = "$RECEIVING_BASE" ]; then
    base_oid=$RECEIVING_BASE_OID
  else
    base_oid=$(jq -er --arg base "$base" '.[$base]' "$REMOTE_REFS") || exit 46
  fi
  jq --arg repo "$repo" --argjson number "$number" --arg base "$base" \
    --arg base_oid "$base_oid" \
    'map(if .repo == $repo and .number == $number then .baseRefName = $base | .baseRefOid = $base_oid else . end)' \
    "$PR_DATA" >"$PR_DATA.next" && mv "$PR_DATA.next" "$PR_DATA"
  exit 0
fi
printf 'unexpected-gh:%s\n' "$*" >>"$FAKE_LOG"; exit 98
EOF

chmod +x "$FAKE_BIN/jj" "$FAKE_BIN/git" "$FAKE_BIN/gh"
COLOCATED="$TMP_ROOT/colocated"
git init --quiet --initial-branch=main "$COLOCATED"
git -C "$COLOCATED" config user.email test@example.com
git -C "$COLOCATED" config user.name Test
git -C "$COLOCATED" commit --quiet --allow-empty --no-gpg-sign -m base
DETECT_SHA=$(git -C "$COLOCATED" rev-parse HEAD)
DETECT_GIT_DIR="$COLOCATED/.git"
export PATH="$FAKE_BIN:$PATH" FAKE_LOG LOCAL_REFS JJ_BOUND_REFS REMOTE_REFS PR_DATA \
  DETECT_SHA DETECT_GIT_DIR FAKE_REMOTE_LOOKUP=true SELECT_GIT=false \
  PUSH_MARKER POST_PUSH_HEAD_SEEN PR_RETARGETED

SHA_BASE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SHA_OLD=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
SHA_A=1111111111111111111111111111111111111111
SHA_B=2222222222222222222222222222222222222222
SHA_C=3333333333333333333333333333333333333333
failures=0
last_status=0
last_json=''
last_stderr=''

fail() { failures=$((failures + 1)); printf 'FAIL [%s]: %s\n' "$1" "$2" >&2; }
reset_case() {
  name=$1
  printf '{}' >"$LOCAL_REFS"; printf '{}' >"$JJ_BOUND_REFS"
  printf '{"main":"%s"}\n' "$SHA_BASE" >"$REMOTE_REFS"
  printf '[]\n' >"$PR_DATA"; : >"$FAKE_LOG"
  FETCH_FAIL=false DRIFT_DURING_FETCH_BRANCH='' DRIFT_DURING_FETCH_OID=''
  JJ_PUSH_FAIL=false JJ_SKIP_PUSH_BOOKMARK='' GH_FAIL_BOOKMARK='' TOPOLOGY_FAIL_OID=''
  EDIT_FAIL_NUMBER='' READBACK_NAME_MISMATCH_NUMBER='' READBACK_OID_MISMATCH_NUMBER=''
  READBACK_IDENTITY_MISMATCH_NUMBER='' READBACK_FAIL_NUMBER='' READBACK_MISMATCH_OID=$SHA_C
  FAIL_PUSH_BRANCH='' RACE_COLLABORATOR='' RACE_BRANCH=''
  MOVE_LOCAL_BRANCH_BEFORE_PUSH='' MOVE_LOCAL_BRANCH_TO=''
  JJ_MOVE_BEFORE_PUSH_BRANCH='' JJ_MOVE_BEFORE_PUSH_OID=''
  JJ_PARENT_BACKED=true DRIFT_AFTER_VERIFICATION_BRANCH=''
  FAIL_AFTER_VERIFICATION_BRANCH='' DRIFT_AFTER_PUSH_OID=$SHA_C
  RECEIVING_REPOSITORY=octo/widgets RECEIVING_BASE=main RECEIVING_BASE_OID=$SHA_BASE
  RECEIVING_BASE_FAIL=false DRIFT_RECEIVING_BASE_AFTER_PUSH=false
  RETARGET_BEFORE_BASE_NUMBER='' RETARGET_BASE='' RETARGET_BASE_OID=''
  rm -f "$PUSH_MARKER" "$POST_PUSH_HEAD_SEEN" "$PR_RETARGETED"
  export FETCH_FAIL DRIFT_DURING_FETCH_BRANCH DRIFT_DURING_FETCH_OID JJ_PUSH_FAIL \
    JJ_SKIP_PUSH_BOOKMARK GH_FAIL_BOOKMARK TOPOLOGY_FAIL_OID EDIT_FAIL_NUMBER \
    READBACK_NAME_MISMATCH_NUMBER READBACK_OID_MISMATCH_NUMBER \
    READBACK_IDENTITY_MISMATCH_NUMBER READBACK_FAIL_NUMBER READBACK_MISMATCH_OID \
    FAIL_PUSH_BRANCH RACE_COLLABORATOR RACE_BRANCH MOVE_LOCAL_BRANCH_BEFORE_PUSH \
    MOVE_LOCAL_BRANCH_TO JJ_MOVE_BEFORE_PUSH_BRANCH JJ_MOVE_BEFORE_PUSH_OID \
    JJ_PARENT_BACKED DRIFT_AFTER_VERIFICATION_BRANCH \
    FAIL_AFTER_VERIFICATION_BRANCH DRIFT_AFTER_PUSH_OID RECEIVING_REPOSITORY \
    RECEIVING_BASE RECEIVING_BASE_OID RECEIVING_BASE_FAIL \
    DRIFT_RECEIVING_BASE_AFTER_PUSH RETARGET_BEFORE_BASE_NUMBER RETARGET_BASE \
    RETARGET_BASE_OID
  output="$TMP_ROOT/$name.out" error="$TMP_ROOT/$name.err"
}
set_ref() {
  jq --arg branch "$2" --arg oid "$3" '.[$branch] = $oid' "$1" >"$1.next" && mv "$1.next" "$1"
}
add_pr() {
  repo=$1 branch=$2 owner=$3 number=$4 state=$5 head_oid=$6 base=$7 base_oid=$8
  jq --arg repo "$repo" --arg branch "$branch" --arg owner "$owner" \
    --argjson number "$number" --arg state "$state" --arg head_oid "$head_oid" \
    --arg base "$base" --arg base_oid "$base_oid" '
      . + [{repo:$repo,bookmark:$branch,number:$number,state:$state,headRefOid:$head_oid,
      headRepositoryOwner:{login:$owner},baseRefName:$base,baseRefOid:$base_oid,
      url:("https://example.test/" + ($repo|split("/")|.[-2:]|join("/")) + "/pull/" + ($number|tostring))}]' \
    "$PR_DATA" >"$PR_DATA.next" && mv "$PR_DATA.next" "$PR_DATA"
}
invoke_raw() {
  set +e
  (cd "$COLOCATED" && /bin/bash "$SYNC_PR_STACK_SH" "$@") >"$output" 2>"$error"
  last_status=$?; set -e
  last_json=$(tr -d '\n' <"$output"); last_stderr=$(cat "$error")
}
invoke() {
  invoke_raw --repo octo/widgets --head-owner octo --remote upstream \
    --base main --base-oid "$SHA_BASE" "$@"
}
expect_status() {
  [ "$last_status" -eq "$2" ] || fail "$1" "status $last_status, expected $2; $last_stderr"
}
expect_code() {
  actual=$(jq -r '.errors[0].code // ""' <<<"$last_json" 2>/dev/null)
  [ "$actual" = "$2" ] || fail "$1" "code [$actual], expected [$2]; $last_json"
}
expect_jq() { jq -e "$2" >/dev/null <<<"$last_json" || fail "$1" "assertion [$2]: $last_json"; }
expect_jq_bound() {
  jq -e --arg base "$SHA_BASE" --arg old "$SHA_OLD" --arg a "$SHA_A" \
    --arg b "$SHA_B" --arg c "$SHA_C" "$2" >/dev/null <<<"$last_json" ||
    fail "$1" "assertion [$2]: $last_json"
}
expect_log_absent() { ! grep -q "$2" "$FAKE_LOG" || fail "$1" "unexpected [$2]: $(cat "$FAKE_LOG")"; }

# Argument boundary.
reset_case missing-repo
invoke_raw --head-owner octo --remote upstream --base main --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status missing-repo 2; expect_code missing-repo missing_repo
reset_case invalid-repo
invoke_raw --repo bad/repo/shape/extra --head-owner octo --remote upstream --base main --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status invalid-repo 2; expect_code invalid-repo invalid_repo
reset_case missing-owner
invoke_raw --repo octo/widgets --remote upstream --base main --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status missing-owner 2; expect_code missing-owner missing_head_owner
reset_case invalid-owner
invoke_raw --repo octo/widgets --head-owner bad_owner --remote upstream --base main --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status invalid-owner 2; expect_code invalid-owner invalid_head_owner
reset_case missing-remote
invoke_raw --repo octo/widgets --head-owner octo --base main --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status missing-remote 2; expect_code missing-remote missing_remote
reset_case missing-base
invoke_raw --repo octo/widgets --head-owner octo --remote upstream --base-oid "$SHA_BASE" --head stack/a "$SHA_A" absent
expect_status missing-base 2; expect_code missing-base missing_base
reset_case missing-base-oid
invoke_raw --repo octo/widgets --head-owner octo --remote upstream --base main --head stack/a "$SHA_A" absent
expect_status missing-base-oid 2; expect_code missing-base-oid missing_base_oid
reset_case invalid-base-oid
invoke_raw --repo octo/widgets --head-owner octo --remote upstream --base main --base-oid abbreviated --head stack/a "$SHA_A" absent
expect_status invalid-base-oid 2; expect_code invalid-base-oid invalid_base_oid
reset_case missing-head
invoke_raw --repo octo/widgets --head-owner octo --remote upstream --base main --base-oid "$SHA_BASE"
expect_status missing-head 2; expect_code missing-head missing_head
reset_case incomplete-head
invoke --head stack/a "$SHA_A"; expect_status incomplete-head 2; expect_code incomplete-head incomplete_head
reset_case duplicate-head
invoke --head stack/a "$SHA_A" absent --head stack/a "$SHA_A" absent
expect_status duplicate-head 2; expect_code duplicate-head duplicate_head
reset_case abbreviated-oid
invoke --head stack/a 1111111 absent; expect_status abbreviated-oid 2; expect_code abbreviated-oid invalid_local_oid
reset_case invalid-remote-oid
invoke --head stack/a "$SHA_A" bbbbbbb
expect_status invalid-remote-oid 2; expect_code invalid-remote-oid invalid_remote_oid

# Exact repository/owner/PR classification.
reset_case parallel-jj-workspace
primary_head=$DETECT_SHA
DETECT_SHA=$SHA_C; export DETECT_SHA
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
invoke --head stack/a "$SHA_A" absent; expect_status parallel-jj-workspace 0
expect_jq parallel-jj-workspace '.vcs == "jj" and .items[0].head_status == "verified"'
grep -Fq "cat-file:$SHA_C^{commit}" "$FAKE_LOG" ||
  fail parallel-jj-workspace "active parent object was not checked exactly"
DETECT_SHA=$primary_head; export DETECT_SHA
reset_case unbacked-jj-parent
JJ_PARENT_BACKED=false; export JJ_PARENT_BACKED
invoke_raw
expect_status unbacked-jj-parent 2; expect_code unbacked-jj-parent missing_repo
expect_jq unbacked-jj-parent '.vcs == "git"'
expect_log_absent unbacked-jj-parent '^fetch:'
reset_case open
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" main "$SHA_BASE"
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status open 0
expect_jq open '.items[0].pr_number == 42 and .items[0].head_status == "verified" and .items[0].base_status == "verified"'
reset_case missing-pr
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; invoke --head stack/a "$SHA_A" absent
expect_status missing-pr 0; expect_jq missing-pr '.items[0].pr_state == "NONE" and .items[0].base_status == "deferred"'
reset_case merged-pr
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; add_pr octo/widgets stack/a octo 41 MERGED "$SHA_A" main "$SHA_BASE"
invoke --head stack/a "$SHA_A" absent; expect_status merged-pr 0
expect_jq merged-pr '.items[0].head_status == "skipped_merged" and .items[0].base_status == "not_applicable"'
expect_log_absent merged-pr '^push:'
reset_case closed-pr
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; add_pr octo/widgets stack/a octo 43 CLOSED "$SHA_A" main "$SHA_BASE"
invoke --head stack/a "$SHA_A" absent; expect_status closed-pr 1; expect_code closed-pr pr_closed
reset_case repository-collision
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; add_pr elsewhere/widgets stack/a octo 91 OPEN "$SHA_A" main "$SHA_BASE"
invoke --head stack/a "$SHA_A" absent; expect_status repository-collision 0
expect_jq repository-collision '.items[0].pr_number == null and .items[0].base_status == "deferred"'
grep -q '^list:octo/widgets:stack/a$' "$FAKE_LOG" || fail repository-collision "repository scope missing"
reset_case owner-collision
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a other-owner 11 OPEN "$SHA_OLD" wrong "$SHA_C"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status owner-collision 0
expect_jq owner-collision '.items[0].pr_number == 42 and .items[0].base_status == "verified"'
grep -q '^edit:octo/widgets:42:main$' "$FAKE_LOG" || fail owner-collision "owned PR not edited"
reset_case ambiguous-owner
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 41 OPEN "$SHA_OLD" main "$SHA_BASE"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" main "$SHA_BASE"
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status ambiguous-owner 1; expect_code ambiguous-owner pr_ambiguous

# Drift and topology gates precede publication.
reset_case drift-before-fetch
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_C"
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status drift-before-fetch 1; expect_code drift-before-fetch remote_advanced
expect_log_absent drift-before-fetch '^fetch:'
reset_case drift-during-fetch
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
DRIFT_DURING_FETCH_BRANCH=stack/a DRIFT_DURING_FETCH_OID=$SHA_C
export DRIFT_DURING_FETCH_BRANCH DRIFT_DURING_FETCH_OID
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status drift-during-fetch 1; expect_code drift-during-fetch remote_advanced
expect_log_absent drift-during-fetch '^push:'
reset_case fetch-failure
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
FETCH_FAIL=true; export FETCH_FAIL
invoke --head stack/a "$SHA_A" absent
expect_status fetch-failure 1; expect_code fetch-failure fetch_failed
expect_log_absent fetch-failure '^push:'
reset_case base-drift
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
RECEIVING_BASE_OID=$SHA_C; export RECEIVING_BASE_OID
invoke --head stack/a "$SHA_A" absent; expect_status base-drift 1; expect_code base-drift base_advanced
reset_case receiving-base-failure
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
RECEIVING_BASE_FAIL=true; export RECEIVING_BASE_FAIL
invoke --head stack/a "$SHA_A" absent
expect_status receiving-base-failure 1; expect_code receiving-base-failure remote_observation_failed
reset_case fork-base-authority
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" main "$SHA_C"
invoke --head stack/a "$SHA_A" absent; expect_status fork-base-authority 0
expect_jq fork-base-authority '.items[0].head_status == "verified" and .items[0].expected_base_oid == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'
grep -q '^base:github.com:repos/octo/widgets/git/ref/heads/main$' "$FAKE_LOG" ||
  fail fork-base-authority "receiving repository base not observed"
reset_case discovery-failure
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
GH_FAIL_BOOKMARK=stack/a; export GH_FAIL_BOOKMARK
invoke --head stack/a "$SHA_A" absent
expect_status discovery-failure 1; expect_code discovery-failure pr_discovery_failed
expect_log_absent discovery-failure '^push:'
reset_case nonlinear-stack
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$LOCAL_REFS" stack/b "$SHA_B"
TOPOLOGY_FAIL_OID=$SHA_B; export TOPOLOGY_FAIL_OID
invoke --head stack/a "$SHA_A" absent --head stack/b "$SHA_B" absent
expect_status nonlinear-stack 1; expect_code nonlinear-stack nonlinear_stack
expect_jq nonlinear-stack '.errors[0].subject == "stack/b" and all(.items[]; .head_status == "pending")'
expect_log_absent nonlinear-stack '^push:'

# The final remote-surface gate blocks every base edit after publication.
reset_case post-push-head-drift
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
DRIFT_AFTER_VERIFICATION_BRANCH=stack/a; export DRIFT_AFTER_VERIFICATION_BRANCH
invoke --head stack/a "$SHA_A" "$SHA_OLD"
expect_status post-push-head-drift 1; expect_code post-push-head-drift remote_head_mismatch
expect_jq post-push-head-drift '.items[0].head_status == "failed" and .items[0].base_status == "pending" and .items[0].observed_remote_oid == "3333333333333333333333333333333333333333"'
expect_log_absent post-push-head-drift '^edit:'
reset_case post-push-base-drift
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
DRIFT_RECEIVING_BASE_AFTER_PUSH=true; export DRIFT_RECEIVING_BASE_AFTER_PUSH
invoke --head stack/a "$SHA_A" "$SHA_OLD"
expect_status post-push-base-drift 1; expect_code post-push-base-drift base_advanced
expect_jq post-push-base-drift '.items[0].head_status == "verified" and .items[0].base_status == "pending"'
expect_log_absent post-push-base-drift '^edit:'
reset_case post-push-observation-failure
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
FAIL_AFTER_VERIFICATION_BRANCH=stack/a; export FAIL_AFTER_VERIFICATION_BRANCH
invoke --head stack/a "$SHA_A" "$SHA_OLD"
expect_status post-push-observation-failure 1
expect_code post-push-observation-failure remote_verification_failed
expect_jq post-push-observation-failure '.items[0].head_status == "failed" and .items[0].base_status == "pending"'
expect_log_absent post-push-observation-failure '^edit:'
reset_case post-push-later-head-drift
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$LOCAL_REFS" stack/b "$SHA_B"
set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"; set_ref "$REMOTE_REFS" stack/b "$SHA_OLD"
add_pr octo/widgets stack/a octo 41 OPEN "$SHA_OLD" wrong "$SHA_C"
add_pr octo/widgets stack/b octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
DRIFT_AFTER_VERIFICATION_BRANCH=stack/b; export DRIFT_AFTER_VERIFICATION_BRANCH
invoke --head stack/a "$SHA_A" "$SHA_OLD" --head stack/b "$SHA_B" "$SHA_OLD"
expect_status post-push-later-head-drift 1
expect_code post-push-later-head-drift remote_head_mismatch
expect_jq post-push-later-head-drift '
  [.items[].head_status] == ["verified","failed"] and
  [.items[].base_status] == ["pending","pending"]'
expect_log_absent post-push-later-head-drift '^edit:'

# A jj push consumes the immutable post-fetch operation, not a concurrently moved bookmark.
reset_case jj-local-head-race
set_ref "$LOCAL_REFS" stack/a "$SHA_A"
JJ_MOVE_BEFORE_PUSH_BRANCH=stack/a JJ_MOVE_BEFORE_PUSH_OID=$SHA_C
export JJ_MOVE_BEFORE_PUSH_BRANCH JJ_MOVE_BEFORE_PUSH_OID
invoke --head stack/a "$SHA_A" absent
expect_status jj-local-head-race 0
expect_jq jj-local-head-race '.items[0].observed_remote_oid == "1111111111111111111111111111111111111111" and .items[0].head_status == "verified"'
expect_jq jj-local-head-race '.items[0].base_status == "deferred"'
[ "$(jq -r '.["stack/a"]' "$LOCAL_REFS")" = "$SHA_C" ] ||
  fail jj-local-head-race "concurrent local bookmark move did not run"
grep -q '^push:upstream:at:bound-operation:exact:stack/a$' "$FAKE_LOG" ||
  fail jj-local-head-race "jj push did not consume the bound operation"

# Partial publication never starts base edits.
reset_case partial-jj
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$LOCAL_REFS" stack/b "$SHA_B"
set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"; set_ref "$REMOTE_REFS" stack/b "$SHA_OLD"
add_pr octo/widgets stack/a octo 41 OPEN "$SHA_OLD" main "$SHA_BASE"
add_pr octo/widgets stack/b octo 42 OPEN "$SHA_OLD" stack/a "$SHA_OLD"
JJ_PUSH_FAIL=true JJ_SKIP_PUSH_BOOKMARK=stack/b; export JJ_PUSH_FAIL JJ_SKIP_PUSH_BOOKMARK
invoke --head stack/a "$SHA_A" "$SHA_OLD" --head stack/b "$SHA_B" "$SHA_OLD"
expect_status partial-jj 1; expect_code partial-jj push_failed
expect_jq_bound partial-jj "
  .items == [
    {bookmark:\"stack/a\",expected_head_oid:\$a,expected_remote_oid:\$old,
     observed_remote_oid:\$a,pr_number:41,pr_state:\"OPEN\",expected_base:\"main\",
     expected_base_oid:\$base,observed_base:\"main\",observed_base_oid:\$base,
     head_status:\"verified\",base_status:\"pending\"},
    {bookmark:\"stack/b\",expected_head_oid:\$b,expected_remote_oid:\$old,
     observed_remote_oid:\$old,pr_number:42,pr_state:\"OPEN\",expected_base:\"stack/a\",
     expected_base_oid:\$a,observed_base:\"stack/a\",observed_base_oid:\$old,
     head_status:\"failed\",base_status:\"pending\"}
  ] and
  .errors == [
    {code:\"push_failed\",subject:\"upstream\",pr_number:null},
    {code:\"remote_head_mismatch\",subject:\"stack/b\",pr_number:42}
  ]"
expect_log_absent partial-jj '^edit:'

# Numeric base edits and read-backs retain exact partial state.
reset_case pr-base-retarget-race
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
RETARGET_BEFORE_BASE_NUMBER=42 RETARGET_BASE=collaborator RETARGET_BASE_OID=$SHA_B
export RETARGET_BEFORE_BASE_NUMBER RETARGET_BASE RETARGET_BASE_OID
invoke --head stack/a "$SHA_A" "$SHA_OLD"
expect_status pr-base-retarget-race 1; expect_code pr-base-retarget-race pr_base_name_mismatch
expect_jq pr-base-retarget-race '.items[0].head_status == "verified" and .items[0].base_status == "failed" and .items[0].observed_base == "collaborator"'
expect_log_absent pr-base-retarget-race '^edit:'
reset_case numeric-edit
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status numeric-edit 0
grep -q '^edit:octo/widgets:42:main$' "$FAKE_LOG" || fail numeric-edit "numeric edit missing"
view_count=$(grep -c '^view:octo/widgets:42$' "$FAKE_LOG")
[ "$view_count" -eq 2 ] || fail numeric-edit "expected two reads, got $view_count"
reset_case middle-edit-fails
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$LOCAL_REFS" stack/b "$SHA_B"
set_ref "$LOCAL_REFS" stack/c "$SHA_C"
set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"; set_ref "$REMOTE_REFS" stack/b "$SHA_OLD"
set_ref "$REMOTE_REFS" stack/c "$SHA_OLD"
add_pr octo/widgets stack/a octo 41 OPEN "$SHA_OLD" wrong "$SHA_C"
add_pr octo/widgets stack/b octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
add_pr octo/widgets stack/c octo 43 OPEN "$SHA_OLD" wrong "$SHA_C"
EDIT_FAIL_NUMBER=42; export EDIT_FAIL_NUMBER
invoke --head stack/a "$SHA_A" "$SHA_OLD" --head stack/b "$SHA_B" "$SHA_OLD" \
  --head stack/c "$SHA_C" "$SHA_OLD"
expect_status middle-edit-fails 1; expect_code middle-edit-fails pr_edit_failed
expect_jq middle-edit-fails '
  [.items[].head_status] == ["verified","verified","verified"] and
  [.items[].base_status] == ["verified","failed","pending"] and
  .errors == [{code:"pr_edit_failed",subject:"stack/b",pr_number:42}]'
expect_log_absent middle-edit-fails '^edit:octo/widgets:43:'
expect_log_absent middle-edit-fails '^view:octo/widgets:43$'
reset_case readback-name-mismatch
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
READBACK_NAME_MISMATCH_NUMBER=42; export READBACK_NAME_MISMATCH_NUMBER
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status readback-name-mismatch 1; expect_code readback-name-mismatch pr_base_name_mismatch
reset_case readback-oid-mismatch
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
READBACK_OID_MISMATCH_NUMBER=42; export READBACK_OID_MISMATCH_NUMBER
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status readback-oid-mismatch 1; expect_code readback-oid-mismatch pr_base_oid_mismatch
reset_case identity-mismatch
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" main "$SHA_BASE"
READBACK_IDENTITY_MISMATCH_NUMBER=42; export READBACK_IDENTITY_MISMATCH_NUMBER
invoke --head stack/a "$SHA_A" "$SHA_OLD"; expect_status identity-mismatch 1; expect_code identity-mismatch pr_identity_mismatch
reset_case readback-failure
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
READBACK_FAIL_NUMBER=42; export READBACK_FAIL_NUMBER
invoke --head stack/a "$SHA_A" "$SHA_OLD"
expect_status readback-failure 1; expect_code readback-failure pr_readback_failed
expect_jq readback-failure '.items[0].head_status == "verified" and .items[0].base_status == "failed"'
expect_log_absent readback-failure '^edit:'
reset_case dry-run
set_ref "$LOCAL_REFS" stack/a "$SHA_A"; set_ref "$REMOTE_REFS" stack/a "$SHA_OLD"
add_pr octo/widgets stack/a octo 42 OPEN "$SHA_OLD" wrong "$SHA_C"
invoke --dry-run --head stack/a "$SHA_A" "$SHA_OLD"; expect_status dry-run 0
expect_jq dry-run '.items[0].head_status == "planned" and .items[0].base_status == "planned"'
expect_log_absent dry-run '^push:'; expect_log_absent dry-run '^edit:'

# Real bare remotes prove caller-bound existing/missing leases and partial Git status.
setup_real_git() {
  REAL_ROOT="$TMP_ROOT/$1-real" BARE="$TMP_ROOT/$1-real/remote.git"
  PUBLISHER="$TMP_ROOT/$1-real/publisher" COLLABORATOR="$TMP_ROOT/$1-real/collaborator"
  mkdir -p "$REAL_ROOT"; /usr/bin/git init --quiet --bare "$BARE"
  /usr/bin/git clone --quiet "$BARE" "$PUBLISHER"
  /usr/bin/git -C "$PUBLISHER" config user.email test@example.com
  /usr/bin/git -C "$PUBLISHER" config user.name Publisher
  /usr/bin/git -C "$PUBLISHER" switch --quiet -c main
  /usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m base
  /usr/bin/git -C "$PUBLISHER" push --quiet -u origin main
  REAL_BASE=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
  RECEIVING_BASE_OID=$REAL_BASE
  export RECEIVING_BASE_OID
  /usr/bin/git --git-dir="$BARE" symbolic-ref HEAD refs/heads/main
  /usr/bin/git clone --quiet "$BARE" "$COLLABORATOR"
  /usr/bin/git -C "$COLLABORATOR" config user.email test@example.com
  /usr/bin/git -C "$COLLABORATOR" config user.name Collaborator
}
reset_case real-race; setup_real_git race
/usr/bin/git -C "$PUBLISHER" switch --quiet -c stack/a
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m old
/usr/bin/git -C "$PUBLISHER" push --quiet -u origin stack/a
REAL_OLD=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
/usr/bin/git -C "$COLLABORATOR" fetch --quiet origin stack/a
/usr/bin/git -C "$COLLABORATOR" switch --quiet -c stack/a FETCH_HEAD
/usr/bin/git -C "$COLLABORATOR" commit --quiet --allow-empty --no-gpg-sign -m collaborator
COLLABORATOR_OID=$(/usr/bin/git -C "$COLLABORATOR" rev-parse HEAD)
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m publisher
PUBLISHER_OID=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
SELECT_GIT=true FAKE_REMOTE_LOOKUP=false RACE_COLLABORATOR=$COLLABORATOR RACE_BRANCH=stack/a
export SELECT_GIT FAKE_REMOTE_LOOKUP RACE_COLLABORATOR RACE_BRANCH
set +e
(cd "$PUBLISHER" && /bin/bash "$SYNC_PR_STACK_SH" --repo octo/widgets --head-owner octo \
  --remote origin --base main --base-oid "$REAL_BASE" --head stack/a "$PUBLISHER_OID" "$REAL_OLD") \
  >"$output" 2>"$error"; last_status=$?; set -e; last_json=$(tr -d '\n' <"$output")
expect_status real-race 1; expect_code real-race push_failed
REMOTE_AFTER_RACE=$(/usr/bin/git --git-dir="$BARE" rev-parse refs/heads/stack/a)
[ "$REMOTE_AFTER_RACE" = "$COLLABORATOR_OID" ] || fail real-race "collaborator OID overwritten"
grep -q -- "--force-with-lease=refs/heads/stack/a:$REAL_OLD" "$FAKE_LOG" || fail real-race "explicit lease missing"

reset_case missing-ref-lease; setup_real_git missing
/usr/bin/git -C "$PUBLISHER" switch --quiet -c stack/new
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m new
NEW_OID=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
SELECT_GIT=true FAKE_REMOTE_LOOKUP=false; export SELECT_GIT FAKE_REMOTE_LOOKUP
set +e
(cd "$PUBLISHER" && /bin/bash "$SYNC_PR_STACK_SH" --repo octo/widgets --head-owner octo \
  --remote origin --base main --base-oid "$REAL_BASE" --head stack/new "$NEW_OID" absent) \
  >"$output" 2>"$error"; last_status=$?; set -e; last_json=$(tr -d '\n' <"$output")
expect_status missing-ref-lease 0
REMOTE_NEW=$(/usr/bin/git --git-dir="$BARE" rev-parse refs/heads/stack/new)
[ "$REMOTE_NEW" = "$NEW_OID" ] || fail missing-ref-lease "new ref missing"
grep -q -- '--force-with-lease=refs/heads/stack/new:' "$FAKE_LOG" || fail missing-ref-lease "empty lease missing"

reset_case local-ref-race; setup_real_git local-ref
/usr/bin/git -C "$PUBLISHER" switch --quiet -c stack/local
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m bound
BOUND_LOCAL_OID=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m unbound
UNBOUND_LOCAL_OID=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
/usr/bin/git -C "$PUBLISHER" reset --quiet --hard "$BOUND_LOCAL_OID"
SELECT_GIT=true FAKE_REMOTE_LOOKUP=false MOVE_LOCAL_BRANCH_BEFORE_PUSH=stack/local
MOVE_LOCAL_BRANCH_TO=$UNBOUND_LOCAL_OID
export SELECT_GIT FAKE_REMOTE_LOOKUP MOVE_LOCAL_BRANCH_BEFORE_PUSH MOVE_LOCAL_BRANCH_TO
set +e
(cd "$PUBLISHER" && /bin/bash "$SYNC_PR_STACK_SH" --repo octo/widgets --head-owner octo \
  --remote origin --base main --base-oid "$REAL_BASE" \
  --head stack/local "$BOUND_LOCAL_OID" absent) >"$output" 2>"$error"
last_status=$?; set -e; last_json=$(tr -d '\n' <"$output")
expect_status local-ref-race 0
REMOTE_BOUND_OID=$(/usr/bin/git --git-dir="$BARE" rev-parse refs/heads/stack/local)
LOCAL_MOVED_OID=$(/usr/bin/git -C "$PUBLISHER" rev-parse refs/heads/stack/local)
[ "$REMOTE_BOUND_OID" = "$BOUND_LOCAL_OID" ] || fail local-ref-race "unbound local OID published"
[ "$LOCAL_MOVED_OID" = "$UNBOUND_LOCAL_OID" ] || fail local-ref-race "concurrent local move did not run"
grep -q -- "$BOUND_LOCAL_OID:refs/heads/stack/local" "$FAKE_LOG" ||
  fail local-ref-race "push source was not the bound full OID"

reset_case later-git-push-fails; setup_real_git later
/usr/bin/git -C "$PUBLISHER" switch --quiet -c stack/a
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m a
GIT_A=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
/usr/bin/git -C "$PUBLISHER" switch --quiet -c stack/b
/usr/bin/git -C "$PUBLISHER" commit --quiet --allow-empty --no-gpg-sign -m b
GIT_B=$(/usr/bin/git -C "$PUBLISHER" rev-parse HEAD)
SELECT_GIT=true FAKE_REMOTE_LOOKUP=false FAIL_PUSH_BRANCH=stack/b
export SELECT_GIT FAKE_REMOTE_LOOKUP FAIL_PUSH_BRANCH
set +e
(cd "$PUBLISHER" && /bin/bash "$SYNC_PR_STACK_SH" --repo octo/widgets --head-owner octo \
  --remote origin --base main --base-oid "$REAL_BASE" --head stack/a "$GIT_A" absent \
  --head stack/b "$GIT_B" absent) >"$output" 2>"$error"
last_status=$?; set -e; last_json=$(tr -d '\n' <"$output")
expect_status later-git-push-fails 1
expect_jq later-git-push-fails '.items[0].head_status == "verified" and .items[1].head_status == "failed" and all(.items[]; .base_status == "deferred")'
REMOTE_GIT_A=$(/usr/bin/git --git-dir="$BARE" rev-parse refs/heads/stack/a)
[ "$REMOTE_GIT_A" = "$GIT_A" ] || fail later-git-push-fails "first head missing"
if /usr/bin/git --git-dir="$BARE" show-ref --verify --quiet refs/heads/stack/b; then
  fail later-git-push-fails "later failed head published"
fi

# A real jj parser must treat a Git-valid expression-shaped bookmark as data.
real_jj_result='skipped (jj unavailable)'
if [ -n "$REAL_JJ" ] && [ "${SYNC_PR_STACK_SKIP_REAL_JJ:-false}" != true ]; then
  reset_case real-jj-exact-bookmark; setup_real_git real-jj
  REAL_BOUNDARY_BIN="$REAL_ROOT/boundary-bin"
  mkdir -p "$REAL_BOUNDARY_BIN"
  cp "$FAKE_BIN/gh" "$REAL_BOUNDARY_BIN/gh"
  cat >"$REAL_BOUNDARY_BIN/git" <<'EOF'
#!/usr/bin/env bash
if [ "$#" -eq 2 ] && [ "$1" = branch ] && [ "$2" = --show-current ]; then
  printf 'main\n'; exit 0
fi
exec /usr/bin/git "$@"
EOF
  chmod +x "$REAL_BOUNDARY_BIN/git"
  (cd "$PUBLISHER" && PATH="$ORIGINAL_PATH" "$REAL_JJ" git init --colocate >/dev/null 2>&1)
  WRONG_BARE="$REAL_ROOT/wrong.git"
  /usr/bin/git init --quiet --bare "$WRONG_BARE"
  /usr/bin/git -C "$PUBLISHER" remote add wrong "$WRONG_BARE"
  /usr/bin/git -C "$PUBLISHER" config remote.pushDefault origin
  /usr/bin/git -C "$PUBLISHER" config branch.main.pushRemote wrong
  (cd "$PUBLISHER" && PATH="$ORIGINAL_PATH" "$REAL_JJ" describe @ \
    -m expression-result >/dev/null 2>&1)
  (cd "$PUBLISHER" && PATH="$ORIGINAL_PATH" "$REAL_JJ" new >/dev/null 2>&1)
  (cd "$PUBLISHER" && PATH="$ORIGINAL_PATH" "$REAL_JJ" bookmark create '"@-"' \
    -r "$REAL_BASE" >/dev/null 2>&1)
  JJ_PARALLEL="$REAL_ROOT/parallel"
  (cd "$PUBLISHER" && PATH="$ORIGINAL_PATH" "$REAL_JJ" workspace add \
    "$JJ_PARALLEL" --revision @ >/dev/null 2>&1)
  EXPRESSION_OID=$(cd "$JJ_PARALLEL" && PATH="$ORIGINAL_PATH" "$REAL_JJ" log \
    -r '@-' --no-graph -T 'commit_id ++ "\n"')
  (
    cd "$JJ_PARALLEL" || exit 1
    PUBLICATION_GIT_DIR=$(PATH="$ORIGINAL_PATH" "$REAL_JJ" git root) || exit $?
    BACKING_BRANCH=$(PATH="$ORIGINAL_PATH" GIT_DIR="$PUBLICATION_GIT_DIR" \
      git branch --show-current) || exit $?
    BACKING_BINDING=$(PATH="$REAL_BOUNDARY_BIN:$ORIGINAL_PATH" \
      GIT_DIR="$PUBLICATION_GIT_DIR" \
      /bin/bash "$RESOLVE_PUSH_REMOTE_SH") || exit $?
    REMOTE_BINDING=$(PATH="$REAL_BOUNDARY_BIN:$ORIGINAL_PATH" \
      GIT_DIR="$PUBLICATION_GIT_DIR" PUBLICATION_VCS=jj \
      /bin/bash "$RESOLVE_PUSH_REMOTE_SH") || exit $?
    if ! grep -q '^REMOTE=wrong$' <<<"$BACKING_BINDING" ||
      ! grep -q '^REMOTE=origin$' <<<"$REMOTE_BINDING" ||
      ! grep -q '^PUSH_OWNER=octo$' <<<"$REMOTE_BINDING"; then
      printf 'backing branch [%s], backing binding [%s], jj binding [%s]\n' \
        "$BACKING_BRANCH" "$BACKING_BINDING" "$REMOTE_BINDING" >&2
      exit 1
    fi
  ) || fail real-jj-exact-bookmark "parallel workspace remote binding failed"
  set +e
  (cd "$JJ_PARALLEL" && PATH="$REAL_BOUNDARY_BIN:$ORIGINAL_PATH" \
    /bin/bash "$SYNC_PR_STACK_SH" --repo octo/widgets --head-owner octo \
      --remote origin --base main --base-oid "$REAL_BASE" \
      --head '@-' "$EXPRESSION_OID" absent) >"$output" 2>"$error"
  last_status=$?; set -e; last_json=$(tr -d '\n' <"$output")
  expect_status real-jj-exact-bookmark 1
  expect_code real-jj-exact-bookmark local_mismatch
  expect_jq real-jj-exact-bookmark '.vcs == "jj" and .items[0].head_status == "pending"'
  if /usr/bin/git --git-dir="$BARE" show-ref --verify --quiet 'refs/heads/@-'; then
    fail real-jj-exact-bookmark "expression-shaped bookmark mutated the remote"
  fi
  real_jj_result=passed
fi

if [ "$failures" -ne 0 ]; then printf '%s synchronization test(s) failed\n' "$failures" >&2; exit 1; fi
printf 'sync-pr-stack: 44 fake-boundary scenarios and 4 real-Git scenarios passed; real-jj exact-name scenario %s\n' \
  "$real_jj_result"
