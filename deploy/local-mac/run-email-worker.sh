#!/bin/bash

set -euo pipefail
umask 077

RUNTIME_ROOT="${NODEZUNO_LOCAL_ROOT:-$HOME/Library/Application Support/Nodezuno}"
ENVIRONMENT_FILE="$RUNTIME_ROOT/config/nodezuno.env"
CURRENT_RELEASE="$RUNTIME_ROOT/current"
RUNNER_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=runtime-lock.sh
. "$RUNNER_DIRECTORY/runtime-lock.sh"
nodezuno_runtime_acquire_lock "$RUNTIME_ROOT" email-worker

if [[ ! -f "$ENVIRONMENT_FILE" || -L "$ENVIRONMENT_FILE" ]] ||
  [[ ! -L "$CURRENT_RELEASE" ]]; then
  exit 0
fi

set -a
# shellcheck disable=SC1090
. "$ENVIRONMENT_FILE"
set +a

# Email is optional on the local preview. Leave queued work untouched until a
# complete delivery configuration is installed.
if [[ -z "${ZOHO_SMTP_PASSWORD:-}" || -z "${ZOHO_SMTP_HOST:-}" ]]; then
  exit 0
fi
if [[ -z "${NODEZUNO_NODE_BIN:-}" || ! -x "$NODEZUNO_NODE_BIN" ]]; then
  exit 1
fi

RELEASE_DIRECTORY="$(readlink "$CURRENT_RELEASE")"
case "$RELEASE_DIRECTORY" in
  "$RUNTIME_ROOT/releases/"*) ;;
  *) exit 1 ;;
esac
[[ -f "$RELEASE_DIRECTORY/scripts/process-notification-outbox.mjs" ]] || exit 1

cd "$RELEASE_DIRECTORY"
# Replace the shell so launchd signals the actual worker. Descriptor 9 remains
# inherited until the worker exits; a forced stop cannot leave a stale lock.
exec "$NODEZUNO_NODE_BIN" scripts/process-notification-outbox.mjs --once
