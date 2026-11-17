#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

nodezuno_require_command launchctl
stop_job() {
  local target="$1" label="$2" attempt
  for attempt in 1 2 3 4 5; do
    if ! launchctl print "$target" >/dev/null 2>&1; then
      nodezuno_note "$label is stopped."
      return 0
    fi
    launchctl bootout "$target" >/dev/null 2>&1 || true
    sleep 1
  done
  if launchctl print "$target" >/dev/null 2>&1; then
    nodezuno_note "$label could not be unloaded. Do not migrate the database." >&2
    return 1
  fi
  nodezuno_note "$label is stopped."
}

# Attempt every stop even if one fails. The caller must not migrate on failure.
failed=false
stop_job "$(nodezuno_service_target)" "Nodezuno web service" || failed=true
stop_job "$(nodezuno_payment_worker_target)" "Nodezuno payment worker" || failed=true
stop_job "$(nodezuno_email_worker_target)" "Nodezuno email worker" || failed=true
[[ "$failed" = false ]]
