#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

ensure_runtime_directories
assert_runtime_binary
load_config
require_command launchctl
sync_service_files

touch "$LOG_FILE"
chmod 0600 "$LOG_FILE"

if service_is_loaded; then
  if "$SCRIPT_DIR/probe.sh" >/dev/null 2>&1; then
    existing_pid=$(service_pid)
    printf 'Helios is already running with PID %s\n' "${existing_pid:-unknown}"
    "$SCRIPT_DIR/probe.sh"
    exit 0
  fi
  launchctl kickstart -k "$SERVICE_TARGET" >/dev/null
else
  if command -v lsof >/dev/null 2>&1 &&
    lsof -nP -iTCP:"$RPC_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "RPC port $RPC_PORT is already in use by an unmanaged process"
  fi
  write_launchd_plist
  launchctl bootstrap "$SERVICE_DOMAIN" "$PLIST_FILE"
fi

attempt=0
while [ "$attempt" -lt 60 ]; do
  if "$SCRIPT_DIR/probe.sh" >/dev/null 2>&1; then
    helios_pid=$(service_pid)
    printf 'Helios is ready with PID %s at http://127.0.0.1:%s\n' "$helios_pid" "$RPC_PORT"
    "$SCRIPT_DIR/probe.sh"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

launchctl bootout "$SERVICE_TARGET" >/dev/null 2>&1 || true
die "Helios did not become ready within 60 seconds; the launch service was stopped; inspect $LOG_FILE"
