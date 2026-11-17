#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command launchctl

if ! service_is_loaded; then
  printf 'Helios is stopped\n'
  exit 0
fi

launchctl bootout "$SERVICE_TARGET"
attempt=0
while [ "$attempt" -lt 20 ]; do
  if ! service_is_loaded; then
    printf 'Helios stopped cleanly\n'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 1
done

die "the Helios launch service did not unload within 20 seconds"
