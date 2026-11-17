#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

nodezuno_require_command launchctl
nodezuno_ensure_layout
nodezuno_load_environment
nodezuno_require_current_release >/dev/null

plist_file="$(nodezuno_plist_file)"
[[ -f "$plist_file" && ! -L "$plist_file" ]] || \
  nodezuno_die "LaunchAgent definition is missing or unsafe. Run install.sh."
plutil -lint "$plist_file" >/dev/null || \
  nodezuno_die "LaunchAgent definition is invalid."

email_worker_plist="$(nodezuno_email_worker_plist_file)"
[[ -f "$email_worker_plist" && ! -L "$email_worker_plist" ]] || \
  nodezuno_die "Email worker LaunchAgent definition is missing or unsafe. Run install.sh."
plutil -lint "$email_worker_plist" >/dev/null || \
  nodezuno_die "Email worker LaunchAgent definition is invalid."
payment_worker_plist="$(nodezuno_payment_worker_plist_file)"
[[ -f "$payment_worker_plist" && ! -L "$payment_worker_plist" ]] || \
  nodezuno_die "Payment worker LaunchAgent definition is missing or unsafe. Run install.sh."
plutil -lint "$payment_worker_plist" >/dev/null || \
  nodezuno_die "Payment worker LaunchAgent definition is invalid."

# Validate every definition before changing any service. A just-unloaded job
# may briefly be unavailable for bootstrap, so re-read state on each retry.
start_job() {
  local target="$1" definition="$2" restart="$3" attempt
  launchctl enable "$target" >/dev/null 2>&1 || true
  for attempt in 1 2 3 4 5; do
    if launchctl print "$target" >/dev/null 2>&1; then
      if [[ "$restart" = true ]]; then
        launchctl kickstart -k "$target" && return 0
      else
        # Do not interrupt an already-running worker or its database lease.
        launchctl kickstart "$target" >/dev/null 2>&1 || true
        return 0
      fi
    elif launchctl bootstrap "gui/$(id -u)" "$definition"; then
      return 0
    fi
    sleep 1
  done
  nodezuno_die "Could not start $target after bounded retries."
}

start_job "$(nodezuno_service_target)" "$plist_file" true
start_job "$(nodezuno_email_worker_target)" "$email_worker_plist" false
start_job "$(nodezuno_payment_worker_target)" "$payment_worker_plist" false

attempt=1
while (( attempt <= 30 )); do
  if bash "$SCRIPT_DIR/health.sh" --quiet >/dev/null 2>&1; then
    nodezuno_note "Nodezuno web service is healthy at ${PUBLIC_ORIGIN:-http://localhost:3000}."
    exit 0
  fi
  sleep 1
  (( attempt += 1 ))
done

nodezuno_note "Nodezuno did not become healthy within 30 seconds." >&2
nodezuno_note "Inspect logs with: bash deploy/local-mac/logs.sh" >&2
exit 1
