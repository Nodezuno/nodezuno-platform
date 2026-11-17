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
if [[ -f "$(nodezuno_env_file)" ]]; then
  nodezuno_load_environment
fi

release="$(nodezuno_current_release 2>/dev/null || true)"
if [[ -n "$release" ]]; then
  printf 'Release: %s\n' "$(basename "$release")"
else
  printf 'Release: not deployed\n'
fi

database="${NODEZUNO_SQLITE_PATH:-$NODEZUNO_LOCAL_ROOT/data/nodezuno.sqlite}"
if [[ -f "$database" && ! -L "$database" ]]; then
  printf 'Database: present, %s\n' "$(du -h "$database" | awk '{print $1}')"
else
  printf 'Database: not initialized\n'
fi

if nodezuno_service_is_loaded; then
  printf 'Supervisor: loaded\n'
  if nodezuno_email_worker_is_loaded; then
    printf 'Email worker: scheduled\n'
  else
    printf 'Email worker: stopped\n'
  fi
  if nodezuno_payment_worker_is_loaded; then
    printf 'Payment worker: scheduled\n'
  else
    printf 'Payment worker: stopped\n'
  fi
  if bash "$SCRIPT_DIR/health.sh" --quiet >/dev/null 2>&1; then
    printf 'Health: ready\n'
    exit 0
  fi
  printf 'Health: not ready\n'
  exit 1
fi

printf 'Supervisor: stopped\n'
printf 'Health: unavailable\n'
exit 1
