# shellcheck shell=bash
# Sourced by state-write and state-lease to move a finished temporary file over
# its target. rename(2) is atomic, so it stays the first choice. Some network
# filesystems refuse to rename over an existing file — macOS's WebDAV client
# returns EINVAL even though a rename to a new name succeeds — so on failure the
# content is copied over the target and the temporary removed. The target is
# never moved aside, because a missing lease.json reads as a free lease. A
# failed copy restores the target from a backup, so a failure leaves the old
# content in place as a failed rename would. The copy itself is not atomic: a
# concurrent reader may see a partial file. The lease already limits each
# stream to one writer, so only readers can observe it.
replace_file() {
  local temp="$1" target="$2" backup
  mv -f -- "$temp" "$target" 2>/dev/null && return 0
  if [[ ! -e "$target" ]]; then
    cp -f -- "$temp" "$target" && rm -f -- "$temp"
    return
  fi
  backup="$(mktemp "$(dirname -- "$target")/.$(basename -- "$target").backup.XXXXXX")"
  cp -f -- "$target" "$backup" || { rm -f -- "$backup"; return 1; }
  if cp -f -- "$temp" "$target"; then
    rm -f -- "$temp" "$backup"
    return 0
  fi
  rm -f -- "$target"
  mv -- "$backup" "$target"
  return 1
}
