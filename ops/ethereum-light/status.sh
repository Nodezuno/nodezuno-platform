#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command launchctl

if ! service_is_loaded; then
  if [ -f "$CONFIG_FILE" ] && command -v lsof >/dev/null 2>&1; then
    load_config
    if lsof -nP -iTCP:"$RPC_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      printf '{"status":"unmanaged_listener","rpc":"http://127.0.0.1:%s"}\n' "$RPC_PORT"
      exit 2
    fi
  fi
  printf '{"status":"stopped"}\n'
  exit 1
fi

helios_pid=$(service_pid)
if [ -z "$helios_pid" ]; then
  printf '{"status":"loaded_not_running"}\n'
  exit 2
fi

if ! probe_result=$($SCRIPT_DIR/probe.sh 2>/dev/null); then
  printf '{"status":"running_not_ready","pid":%s}\n' "$helios_pid"
  exit 2
fi

printf '%s' "$probe_result" | jq --argjson pid "$helios_pid" '. + {pid: $pid}'
