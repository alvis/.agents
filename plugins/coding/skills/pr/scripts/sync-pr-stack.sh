#!/usr/bin/env bash
set -euo pipefail

# Synchronize explicitly ordered, already-shaped heads and repair existing PR bases.
# stdout is one JSON receipt on every success or handled failure.

dry_run=false
repository=
repository_host=github.com
repository_path=
head_owner=
remote=
root_base=
root_base_oid=
vcs=git
git_dir=
remote_observation=
base_observation=
pr_readback=
readback_base=
readback_base_oid=
jj_push_operation=

bookmarks=()
expected_local_oids=()
expected_remote_oids=()
observed_remote_oids=()
pr_numbers=()
pr_states=()
expected_bases=()
expected_base_oids=()
observed_bases=()
observed_base_oids=()
head_statuses=()
base_statuses=()
error_codes=()
error_subjects=()
error_pr_numbers=()
live_indices=()

detect_vcs() {
  command -v jj >/dev/null 2>&1 || return 1
  detected_git_dir=$(jj git root 2>/dev/null) || return 1
  case "$detected_git_dir" in
    */.git) ;;
    *) return 1 ;;
  esac
  jj_head=$(jj log -r @- --no-graph -T 'commit_id ++ "\n"' 2>/dev/null) ||
    return 1
  git --git-dir="$detected_git_dir" cat-file -e "$jj_head^{commit}" 2>/dev/null ||
    return 1
  git_dir=$detected_git_dir
}

run_git() {
  if [ -n "$git_dir" ]; then
    git --git-dir="$git_dir" "$@"
  else
    git "$@"
  fi
}

render_item() {
  index=$1
  jq -cn \
    --arg bookmark "${bookmarks[$index]}" \
    --arg expected_head_oid "${expected_local_oids[$index]}" \
    --arg expected_remote_oid "${expected_remote_oids[$index]}" \
    --arg observed_remote_oid "${observed_remote_oids[$index]-}" \
    --arg pr_number "${pr_numbers[$index]-}" \
    --arg pr_state "${pr_states[$index]-}" \
    --arg expected_base "${expected_bases[$index]-}" \
    --arg expected_base_oid "${expected_base_oids[$index]-}" \
    --arg observed_base "${observed_bases[$index]-}" \
    --arg observed_base_oid "${observed_base_oids[$index]-}" \
    --arg head_status "${head_statuses[$index]-pending}" \
    --arg base_status "${base_statuses[$index]-pending}" '
      {
        bookmark: $bookmark,
        expected_head_oid: $expected_head_oid,
        expected_remote_oid:
          (if $expected_remote_oid == "absent" then null
           else $expected_remote_oid end),
        observed_remote_oid:
          (if $observed_remote_oid == "" then null
           else $observed_remote_oid end),
        pr_number:
          (if $pr_number == "" then null else ($pr_number | tonumber) end),
        pr_state: (if $pr_state == "" then null else $pr_state end),
        expected_base:
          (if $expected_base == "" then null else $expected_base end),
        expected_base_oid:
          (if $expected_base_oid == "" then null else $expected_base_oid end),
        observed_base:
          (if $observed_base == "" then null else $observed_base end),
        observed_base_oid:
          (if $observed_base_oid == "" then null else $observed_base_oid end),
        head_status: $head_status,
        base_status: $base_status
      }
    '
}

render_items_json() {
  index=0
  while [ "$index" -lt "${#bookmarks[@]}" ]; do
    render_item "$index"
    index=$((index + 1))
  done | jq -sc '.'
}

render_errors_json() {
  index=0
  while [ "$index" -lt "${#error_codes[@]}" ]; do
    jq -cn \
      --arg code "${error_codes[$index]}" \
      --arg subject "${error_subjects[$index]-}" \
      --arg pr_number "${error_pr_numbers[$index]-}" '
        {
          code: $code,
          subject: (if $subject == "" then null else $subject end),
          pr_number:
            (if $pr_number == "" then null else ($pr_number | tonumber) end)
        }
      '
    index=$((index + 1))
  done | jq -sc '.'
}

emit_json() {
  items_json=$(render_items_json)
  errors_json=$(render_errors_json)
  jq -cn --arg vcs "$vcs" --argjson items "$items_json" \
    --argjson errors "$errors_json" \
    '{vcs: $vcs, items: $items, errors: $errors}'
}

add_error() {
  error_index=${#error_codes[@]}
  error_codes[error_index]=$1
  error_subjects[error_index]=${2-}
  error_pr_numbers[error_index]=${3-}
}

fail_with() {
  status=$1
  code=$2
  subject=${3-}
  pr_number=${4-}
  add_error "$code" "$subject" "$pr_number"
  emit_json
  exit "$status"
}

valid_repository() {
  candidate=$1
  case "$candidate" in
    ''|/*|*/|*//*|*[!A-Za-z0-9._/-]*) return 1 ;;
  esac
  first_component=${candidate%%/*}
  remaining_components=${candidate#*/}
  if [ "$remaining_components" = "$candidate" ]; then
    return 1
  fi
  case "$remaining_components" in
    */*)
      host_component=$first_component
      owner_component=${remaining_components%%/*}
      repository_component=${remaining_components#*/}
      case "$host_component" in
        ''|.|..|-*|*-|.*|*.|*..*|*[!A-Za-z0-9.-]*) return 1 ;;
      esac
      ;;
    *)
      owner_component=$first_component
      repository_component=$remaining_components
      ;;
  esac
  valid_owner "$owner_component" || return 1
  case "$repository_component" in
    ''|.|..|-*|*-|*[!A-Za-z0-9._-]*) return 1 ;;
  esac
}

valid_owner() {
  case "$1" in
    ''|-*|*-|*[!A-Za-z0-9-]*) return 1 ;;
  esac
}

valid_ref_name() {
  run_git check-ref-format --branch "$1" >/dev/null 2>&1
}

valid_oid() {
  candidate=$1
  [ "${#candidate}" -eq "$oid_length" ] || return 1
  case "$candidate" in
    *[!0-9A-Fa-f]*) return 1 ;;
  esac
}

observe_remote_head() {
  branch=$1
  if ! remote_lines=$(run_git ls-remote -- "$remote" "refs/heads/$branch"); then
    return 1
  fi
  remote_observation=
  if [ -n "$remote_lines" ]; then
    remote_observation=${remote_lines%%	*}
  fi
}

observe_receiving_base() {
  if ! base_row=$(gh api --hostname "$repository_host" \
    "repos/$repository_path/git/ref/heads/$root_base"); then
    return 1
  fi
  base_observation=$(jq -er --arg ref "refs/heads/$root_base" '
    select(.ref == $ref and .object.type == "commit") | .object.sha
  ' <<<"$base_row" 2>/dev/null) || return 1
  valid_oid "$base_observation"
}

remote_matches_binding() {
  expected=$1
  observed=$2
  if [ "$expected" = absent ]; then
    [ -z "$observed" ]
  else
    [ "$expected" = "$observed" ]
  fi
}

resolve_local_oid() {
  if [ "$vcs" = jj ]; then
    bookmark_rows=$(
      jj --ignore-working-copy --at-operation "$jj_push_operation" \
        bookmark list "exact:$1" -T 'json(self) ++ "\n"' 2>/dev/null
    ) || return 1
    jq -ser --arg bookmark "$1" '
      [.[] |
        select(
          .name == $bookmark and
          (.remote? == null) and
          (.target | type) == "array" and
          (.target | length) == 1
        )
      ] |
      if length == 1 then .[0].target[0]
      else error("bookmark must have exactly one local target")
      end
    ' <<<"$bookmark_rows" 2>/dev/null
  else
    run_git rev-parse --verify --quiet "refs/heads/$1"
  fi
}

list_owned_prs() {
  bookmark=$1
  if ! discovery=$(gh pr list --repo "$repository" --head "$bookmark" \
    --state all --limit 100 \
    --json number,state,headRefOid,headRepositoryOwner,baseRefName,baseRefOid,url)
  then
    return 1
  fi
  owned=$(jq -ce --arg owner "$head_owner" '
    [ .[] | select(.headRepositoryOwner.login == $owner) ]
  ' <<<"$discovery")
}

record_pr_row() {
  index=$1
  row=$2
  state=$3
  pr_numbers[index]=$(jq -r '.number' <<<"$row")
  pr_states[index]=$state
  observed_bases[index]=$(jq -r '.baseRefName // ""' <<<"$row")
  observed_base_oids[index]=$(jq -r '.baseRefOid // ""' <<<"$row")
}

discover_pr() {
  index=$1
  bookmark=${bookmarks[$index]}
  expected_local_oid=${expected_local_oids[$index]}
  observed_remote_oid=${observed_remote_oids[$index]-}
  list_owned_prs "$bookmark" || fail_with 1 pr_discovery_failed "$bookmark"

  open_count=$(jq '[.[] | select(.state == "OPEN")] | length' <<<"$owned")
  if [ "$open_count" -gt 1 ]; then
    fail_with 1 pr_ambiguous "$bookmark"
  fi
  if [ "$open_count" -eq 1 ]; then
    row=$(jq -c '[.[] | select(.state == "OPEN")][0]' <<<"$owned")
    record_pr_row "$index" "$row" OPEN
    pr_head_oid=$(jq -r '.headRefOid // ""' <<<"$row")
    if [ -z "$observed_remote_oid" ] ||
      [ "$pr_head_oid" != "$observed_remote_oid" ]; then
      fail_with 1 pr_head_mismatch "$bookmark" "${pr_numbers[$index]}"
    fi
    return
  fi

  merged_count=$(jq --arg oid "$expected_local_oid" '
    [.[] | select(.state == "MERGED" and .headRefOid == $oid)] | length
  ' <<<"$owned")
  if [ "$merged_count" -gt 0 ]; then
    row=$(jq -c --arg oid "$expected_local_oid" '
      [.[] | select(.state == "MERGED" and .headRefOid == $oid)][0]
    ' <<<"$owned")
    record_pr_row "$index" "$row" MERGED
    head_statuses[index]=skipped_merged
    base_statuses[index]=not_applicable
    return
  fi

  closed_count=$(jq --arg oid "$expected_local_oid" '
    [.[] | select(.state == "CLOSED" and .headRefOid == $oid)] | length
  ' <<<"$owned")
  if [ "$closed_count" -gt 0 ]; then
    row=$(jq -c --arg oid "$expected_local_oid" '
      [.[] | select(.state == "CLOSED" and .headRefOid == $oid)][0]
    ' <<<"$owned")
    record_pr_row "$index" "$row" CLOSED
    fail_with 1 pr_closed "$bookmark" "${pr_numbers[$index]}"
  fi

  pr_states[index]=NONE
  base_statuses[index]=deferred
}

read_pr() {
  pr_number=$1
  gh pr view "$pr_number" --repo "$repository" \
    --json number,state,headRefOid,headRepositoryOwner,baseRefName,baseRefOid,url
}

verify_pr_identity() {
  index=$1
  bookmark=${bookmarks[$index]}
  pr_number=${pr_numbers[$index]}
  expected_head_oid=${expected_local_oids[$index]}

  returned_number=$(jq -r '.number // ""' <<<"$pr_readback")
  returned_state=$(jq -r '.state // ""' <<<"$pr_readback")
  returned_owner=$(jq -r '.headRepositoryOwner.login // ""' <<<"$pr_readback")
  returned_head_oid=$(jq -r '.headRefOid // ""' <<<"$pr_readback")
  returned_url=$(jq -r '.url // ""' <<<"$pr_readback")
  readback_base=$(jq -r '.baseRefName // ""' <<<"$pr_readback")
  readback_base_oid=$(jq -r '.baseRefOid // ""' <<<"$pr_readback")

  if [ "$returned_number" != "$pr_number" ] || [ "$returned_state" != OPEN ] ||
    [ "$returned_owner" != "$head_owner" ]; then
    return 1
  fi
  case "$returned_url" in
    */"$repository_path"/pull/"$pr_number") ;;
    *) return 1 ;;
  esac
  [ "$returned_head_oid" = "$expected_head_oid" ] || return 2
}

record_readback_base() {
  index=$1
  observed_bases[index]=$readback_base
  observed_base_oids[index]=$readback_base_oid
}

mark_base_failure() {
  index=$1
  code=$2
  bookmark=${bookmarks[$index]}
  pr_number=${pr_numbers[$index]-}
  base_statuses[index]=failed
  fail_with 1 "$code" "$bookmark" "$pr_number"
}

if detect_vcs; then
  vcs=jj
else
  vcs=git
  git_dir=
fi

if ! object_format=$(run_git rev-parse --show-object-format 2>/dev/null); then
  object_format=sha1
fi
case "$object_format" in
  sha1) oid_length=40 ;;
  sha256) oid_length=64 ;;
  *) fail_with 2 unsupported_object_format "$object_format" ;;
esac

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      dry_run=true
      shift
      ;;
    --repo)
      [ "$#" -ge 2 ] || fail_with 2 missing_repo
      repository=$2
      shift 2
      ;;
    --head-owner)
      [ "$#" -ge 2 ] || fail_with 2 missing_head_owner
      head_owner=$2
      shift 2
      ;;
    --remote)
      [ "$#" -ge 2 ] || fail_with 2 missing_remote
      remote=$2
      shift 2
      ;;
    --base)
      [ "$#" -ge 2 ] || fail_with 2 missing_base
      root_base=$2
      shift 2
      ;;
    --base-oid)
      [ "$#" -ge 2 ] || fail_with 2 missing_base_oid
      root_base_oid=$2
      shift 2
      ;;
    --head)
      [ "$#" -ge 4 ] || fail_with 2 incomplete_head
      bookmark=$2
      expected_local_oid=$3
      expected_remote_oid=$4
      valid_ref_name "$bookmark" || fail_with 2 invalid_head "$bookmark"
      valid_oid "$expected_local_oid" ||
        fail_with 2 invalid_local_oid "$bookmark"
      if [ "$expected_remote_oid" != absent ]; then
        valid_oid "$expected_remote_oid" ||
          fail_with 2 invalid_remote_oid "$bookmark"
      fi
      index=0
      while [ "$index" -lt "${#bookmarks[@]}" ]; do
        [ "${bookmarks[$index]}" != "$bookmark" ] ||
          fail_with 2 duplicate_head "$bookmark"
        index=$((index + 1))
      done
      index=${#bookmarks[@]}
      bookmarks[index]=$bookmark
      expected_local_oids[index]=$expected_local_oid
      expected_remote_oids[index]=$expected_remote_oid
      observed_remote_oids[index]=
      pr_numbers[index]=
      pr_states[index]=
      expected_bases[index]=
      expected_base_oids[index]=
      observed_bases[index]=
      observed_base_oids[index]=
      head_statuses[index]=pending
      base_statuses[index]=pending
      shift 4
      ;;
    *) fail_with 2 unknown_argument "$1" ;;
  esac
done

[ -n "$repository" ] || fail_with 2 missing_repo
valid_repository "$repository" || fail_with 2 invalid_repo "$repository"
repository_path=$repository
slashless=${repository//\//}
if [ "$((${#repository} - ${#slashless}))" -eq 2 ]; then
  repository_host=${repository%%/*}
  repository_path=${repository#*/}
fi
[ -n "$head_owner" ] || fail_with 2 missing_head_owner
valid_owner "$head_owner" || fail_with 2 invalid_head_owner "$head_owner"
[ -n "$remote" ] || fail_with 2 missing_remote
[ -n "$root_base" ] || fail_with 2 missing_base
valid_ref_name "$root_base" || fail_with 2 invalid_base "$root_base"
[ -n "$root_base_oid" ] || fail_with 2 missing_base_oid
valid_oid "$root_base_oid" || fail_with 2 invalid_base_oid "$root_base"
[ "${#bookmarks[@]}" -gt 0 ] || fail_with 2 missing_head

index=0
while [ "$index" -lt "${#bookmarks[@]}" ]; do
  [ "${bookmarks[$index]}" != "$root_base" ] ||
    fail_with 2 head_equals_base "${bookmarks[$index]}"
  index=$((index + 1))
done

run_git remote get-url --push -- "$remote" >/dev/null 2>&1 ||
  fail_with 1 remote_lookup_failed "$remote"

# Phase 1: bind remote state twice around fetch, then resolve local and forge state.
if ! observe_receiving_base; then
  fail_with 1 remote_observation_failed "$root_base"
fi
[ "$base_observation" = "$root_base_oid" ] ||
  fail_with 1 base_advanced "$root_base"

index=0
while [ "$index" -lt "${#bookmarks[@]}" ]; do
  bookmark=${bookmarks[$index]}
  if ! observe_remote_head "$bookmark"; then
    fail_with 1 remote_observation_failed "$bookmark"
  fi
  observed_remote_oids[index]=$remote_observation
  remote_matches_binding "${expected_remote_oids[$index]}" "$remote_observation" ||
    fail_with 1 remote_advanced "$bookmark"
  index=$((index + 1))
done

if [ "$vcs" = jj ]; then
  jj git fetch --remote "$remote" >/dev/null || fail_with 1 fetch_failed "$remote"
  jj_push_operation=$(
    jj --ignore-working-copy op log --no-graph -n 1 \
      -T 'self.id() ++ "\n"' 2>/dev/null
  ) || fail_with 1 local_mismatch "$remote"
  [ -n "$jj_push_operation" ] || fail_with 1 local_mismatch "$remote"
else
  run_git fetch -- "$remote" >/dev/null || fail_with 1 fetch_failed "$remote"
fi

if ! observe_receiving_base; then
  fail_with 1 remote_observation_failed "$root_base"
fi
[ "$base_observation" = "$root_base_oid" ] ||
  fail_with 1 base_advanced "$root_base"

index=0
while [ "$index" -lt "${#bookmarks[@]}" ]; do
  bookmark=${bookmarks[$index]}
  if ! observe_remote_head "$bookmark"; then
    fail_with 1 remote_observation_failed "$bookmark"
  fi
  observed_remote_oids[index]=$remote_observation
  remote_matches_binding "${expected_remote_oids[$index]}" "$remote_observation" ||
    fail_with 1 remote_advanced "$bookmark"

  if ! local_oid=$(resolve_local_oid "$bookmark"); then
    fail_with 1 local_mismatch "$bookmark"
  fi
  [ "$local_oid" = "${expected_local_oids[$index]}" ] ||
    fail_with 1 local_mismatch "$bookmark"
  discover_pr "$index"
  index=$((index + 1))
done

previous_base=$root_base
previous_base_oid=$root_base_oid
index=0
while [ "$index" -lt "${#bookmarks[@]}" ]; do
  if [ "${pr_states[$index]}" != MERGED ]; then
    bookmark=${bookmarks[$index]}
    expected_local_oid=${expected_local_oids[$index]}
    if ! run_git merge-base --is-ancestor "$previous_base_oid" \
      "$expected_local_oid"; then
      fail_with 1 nonlinear_stack "$bookmark" "${pr_numbers[$index]-}"
    fi
    expected_bases[index]=$previous_base
    expected_base_oids[index]=$previous_base_oid
    live_indices[${#live_indices[@]}]=$index
    previous_base=$bookmark
    previous_base_oid=$expected_local_oid
  fi
  index=$((index + 1))
done

if [ "$dry_run" = true ]; then
  for index in ${live_indices[@]+"${live_indices[@]}"}; do
    head_statuses[index]=planned
    if [ "${pr_states[$index]}" = OPEN ]; then
      base_statuses[index]=planned
    fi
  done
  emit_json
  exit 0
fi

# Phase 2: publish and verify every live head before any base edit.
if [ "$vcs" = jj ] && [ "${#live_indices[@]}" -gt 0 ]; then
  push_args=(git push --remote "$remote")
  for index in ${live_indices[@]+"${live_indices[@]}"}; do
    push_args[${#push_args[@]}]=--bookmark
    push_args[${#push_args[@]}]="exact:${bookmarks[$index]}"
  done
  push_failed=false
  jj --ignore-working-copy --at-operation "$jj_push_operation" \
    "${push_args[@]}" >/dev/null || push_failed=true
  [ "$push_failed" = false ] || add_error push_failed "$remote"

  verification_failed=false
  for index in ${live_indices[@]+"${live_indices[@]}"}; do
    bookmark=${bookmarks[$index]}
    if ! observe_remote_head "$bookmark"; then
      head_statuses[index]=failed
      add_error remote_verification_failed "$bookmark" "${pr_numbers[$index]-}"
      verification_failed=true
      continue
    fi
    observed_remote_oids[index]=$remote_observation
    if [ "$remote_observation" = "${expected_local_oids[$index]}" ]; then
      head_statuses[index]=verified
    else
      head_statuses[index]=failed
      add_error remote_head_mismatch "$bookmark" "${pr_numbers[$index]-}"
      verification_failed=true
    fi
  done
  if [ "$push_failed" = true ] || [ "$verification_failed" = true ]; then
    emit_json
    exit 1
  fi
fi

if [ "$vcs" = git ]; then
  for index in ${live_indices[@]+"${live_indices[@]}"}; do
    bookmark=${bookmarks[$index]}
    expected_remote_oid=${expected_remote_oids[$index]}
    lease_oid=$expected_remote_oid
    [ "$lease_oid" != absent ] || lease_oid=
    if ! run_git push \
      "--force-with-lease=refs/heads/$bookmark:$lease_oid" -- "$remote" \
      "${expected_local_oids[$index]}:refs/heads/$bookmark" >/dev/null; then
      head_statuses[index]=failed
      add_error push_failed "$bookmark" "${pr_numbers[$index]-}"
      if observe_remote_head "$bookmark"; then
        observed_remote_oids[index]=$remote_observation
        if [ "$remote_observation" = "${expected_local_oids[$index]}" ]; then
          head_statuses[index]=verified
        else
          add_error remote_head_mismatch "$bookmark" "${pr_numbers[$index]-}"
        fi
      else
        add_error remote_verification_failed "$bookmark" "${pr_numbers[$index]-}"
      fi
      emit_json
      exit 1
    fi
    if ! observe_remote_head "$bookmark"; then
      head_statuses[index]=failed
      fail_with 1 remote_verification_failed "$bookmark" \
        "${pr_numbers[$index]-}"
    fi
    observed_remote_oids[index]=$remote_observation
    if [ "$remote_observation" != "${expected_local_oids[$index]}" ]; then
      head_statuses[index]=failed
      fail_with 1 remote_head_mismatch "$bookmark" "${pr_numbers[$index]-}"
    fi
    head_statuses[index]=verified
  done
fi

# Recheck the complete remote surface before entering the PR-base phase.
if ! observe_receiving_base; then
  fail_with 1 remote_observation_failed "$root_base"
fi
[ "$base_observation" = "$root_base_oid" ] ||
  fail_with 1 base_advanced "$root_base"
for index in ${live_indices[@]+"${live_indices[@]}"}; do
  bookmark=${bookmarks[$index]}
  if ! observe_remote_head "$bookmark"; then
    head_statuses[index]=failed
    fail_with 1 remote_verification_failed "$bookmark" "${pr_numbers[$index]-}"
  fi
  observed_remote_oids[index]=$remote_observation
  if [ "$remote_observation" != "${expected_local_oids[$index]}" ]; then
    head_statuses[index]=failed
    fail_with 1 remote_head_mismatch "$bookmark" "${pr_numbers[$index]-}"
  fi
done

# Phase 3: repair exact numeric PRs, stopping on the first failed base.
for index in ${live_indices[@]+"${live_indices[@]}"}; do
  [ "${pr_states[$index]}" = OPEN ] || continue
  bookmark=${bookmarks[$index]}
  pr_number=${pr_numbers[$index]}
  expected_base=${expected_bases[$index]}
  expected_base_oid=${expected_base_oids[$index]}
  discovered_base=${observed_bases[$index]}
  discovered_base_oid=${observed_base_oids[$index]}

  if ! pr_readback=$(read_pr "$pr_number"); then
    mark_base_failure "$index" pr_readback_failed
  fi
  identity_status=0
  verify_pr_identity "$index" || identity_status=$?
  if [ "$identity_status" -eq 1 ]; then
    mark_base_failure "$index" pr_identity_mismatch
  elif [ "$identity_status" -eq 2 ]; then
    mark_base_failure "$index" pr_head_mismatch
  fi
  record_readback_base "$index"
  [ "$readback_base" = "$discovered_base" ] ||
    mark_base_failure "$index" pr_base_name_mismatch
  [ "$readback_base_oid" = "$discovered_base_oid" ] ||
    mark_base_failure "$index" pr_base_oid_mismatch

  if [ "$readback_base" != "$expected_base" ]; then
    if ! gh pr edit "$pr_number" --repo "$repository" \
      --base "$expected_base" >/dev/null; then
      mark_base_failure "$index" pr_edit_failed
    fi
    if ! pr_readback=$(read_pr "$pr_number"); then
      mark_base_failure "$index" pr_readback_failed
    fi
    identity_status=0
    verify_pr_identity "$index" || identity_status=$?
    if [ "$identity_status" -eq 1 ]; then
      mark_base_failure "$index" pr_identity_mismatch
    elif [ "$identity_status" -eq 2 ]; then
      mark_base_failure "$index" pr_head_mismatch
    fi
    record_readback_base "$index"
  fi

  [ "${observed_bases[$index]}" = "$expected_base" ] ||
    mark_base_failure "$index" pr_base_name_mismatch
  [ "${observed_base_oids[$index]}" = "$expected_base_oid" ] ||
    mark_base_failure "$index" pr_base_oid_mismatch
  base_statuses[index]=verified
done

emit_json
