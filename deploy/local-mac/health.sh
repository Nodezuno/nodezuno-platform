#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

quiet=false
if (( $# > 1 )); then
  nodezuno_die "health.sh accepts only --quiet."
fi
if (( $# == 1 )); then
  [[ "$1" = "--quiet" ]] || nodezuno_die "Unknown health option: $1"
  quiet=true
fi

nodezuno_require_command curl
nodezuno_load_environment

origin="${PUBLIC_ORIGIN:-}"
[[ "$origin" =~ ^http://localhost:[0-9]+$ ]] || \
  nodezuno_die "Local health requires an exact loopback PUBLIC_ORIGIN."

probe() {
  local name="$1"
  local path="$2"
  if ! curl \
    --connect-timeout 2 \
    --fail \
    --max-time 5 \
    --output /dev/null \
    --show-error \
    --silent \
    "$origin$path"; then
    [[ "$quiet" = true ]] || printf '%s: failed\n' "$name" >&2
    return 1
  fi
  [[ "$quiet" = true ]] || printf '%s: ok\n' "$name"
}

probe liveness /api/v1/live
probe readiness /api/v1/ready
probe backend /api/v1/health
