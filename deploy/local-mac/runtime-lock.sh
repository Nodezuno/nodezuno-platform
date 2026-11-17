#!/bin/bash

# macOS lockf can lock an inherited descriptor without supervising another
# process. The descriptor stays open in the shell and its worker descendants;
# the kernel releases it after the last holder exits, including SIGKILL/reboot.
nodezuno_runtime_acquire_lock() {
  local runtime_root="$1" name="$2"
  local lock_parent lock_file legacy_lock owner mode lock_status event_name
  if (( BASH_SUBSHELL != 0 )) || [[ -n "${NODEZUNO_HELD_LOCK_FILE:-}" ]]; then
    printf '%s\n' 'Nodezuno runtime lock: acquire once in the operation shell, without command substitution.' >&2
    return 64
  fi
  case "$name" in
    deploy|email-worker|payment-worker) ;;
    *) printf '%s\n' 'Nodezuno runtime lock: invalid operation name.' >&2; return 64 ;;
  esac
  case "$runtime_root" in
    /*) ;;
    *) printf '%s\n' 'Nodezuno runtime lock: runtime root must be absolute.' >&2; return 64 ;;
  esac
  event_name="${name//-/_}"
  [[ -x /usr/bin/lockf ]] || {
    printf '%s\n' 'Nodezuno runtime lock: /usr/bin/lockf is unavailable.' >&2
    return 69
  }
  lock_parent="$runtime_root/locks"
  lock_file="$lock_parent/$name.kernel.lock"
  legacy_lock="$lock_parent/$name.lock"
  if [[ ! -d "$lock_parent" || -L "$lock_parent" ]]; then
    printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"unsafe_lock_directory"}\n' "$event_name" >&2
    return 73
  fi
  owner="$(/usr/bin/stat -f '%u' "$lock_parent")" || return 73
  mode="$(/usr/bin/stat -f '%Lp' "$lock_parent")" || return 73
  if [[ "$owner" != "$(id -u)" || "$mode" != 700 ]]; then
    printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"unsafe_lock_directory_permissions"}\n' "$event_name" >&2
    return 73
  fi
  # Older runners used an ownerless directory. Its presence is ambiguous, so
  # leave it intact and require an operator to confirm the legacy job stopped.
  if [[ -e "$legacy_lock" || -L "$legacy_lock" ]]; then
    printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"legacy_lock_present","action":"stop_services_and_inspect_legacy_lock"}\n' "$event_name" >&2
    return 75
  fi
  if [[ -L "$lock_file" || ( -e "$lock_file" && ! -f "$lock_file" ) ]]; then
    printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"unsafe_lock_file"}\n' "$event_name" >&2
    return 73
  fi
  if [[ -e "$lock_file" ]]; then
    owner="$(/usr/bin/stat -f '%u' "$lock_file")" || return 73
    mode="$(/usr/bin/stat -f '%Lp' "$lock_file")" || return 73
    if [[ "$owner" != "$(id -u)" || "$mode" != 600 ]]; then
      printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"unsafe_lock_file_permissions"}\n' "$event_name" >&2
      return 73
    fi
  fi
  # Append-open preserves the inode. Never unlink or replace this file while
  # jobs may run, because doing so would create two independent kernel locks.
  exec 9>>"$lock_file" || return 73
  chmod 600 "$lock_file" || { exec 9>&-; return 73; }
  if /usr/bin/lockf -s -t 0 9; then
    NODEZUNO_HELD_LOCK_FILE="$lock_file"
    return 0
  else
    lock_status=$?
    exec 9>&-
    printf '{"event":"%s_lock_unavailable","status":"blocked","reason":"lock_not_acquired","exit_code":%s}\n' "$event_name" "$lock_status" >&2
    return "$lock_status"
  fi
}

nodezuno_runtime_release_lock() {
  local lock_file="$1"
  if [[ -z "${NODEZUNO_HELD_LOCK_FILE:-}" || "$lock_file" != "$NODEZUNO_HELD_LOCK_FILE" ]]; then
    printf '%s\n' 'Nodezuno runtime lock: refusing to release an unowned lock.' >&2
    return 64
  fi
  exec 9>&-
  unset NODEZUNO_HELD_LOCK_FILE
}
