#!/bin/bash

set -euo pipefail
umask 077

RUNTIME_ROOT="${NODEZUNO_LOCAL_ROOT:-$HOME/Library/Application Support/Nodezuno}"
ENVIRONMENT_FILE="$RUNTIME_ROOT/config/nodezuno.env"
CURRENT_RELEASE="$RUNTIME_ROOT/current"

if [[ ! -f "$ENVIRONMENT_FILE" || -L "$ENVIRONMENT_FILE" ]]; then
  printf 'Nodezuno environment file is missing or unsafe.\n' >&2
  exit 1
fi

if stat -f '%u' "$ENVIRONMENT_FILE" >/dev/null 2>&1; then
  ENVIRONMENT_OWNER="$(stat -f '%u' "$ENVIRONMENT_FILE")"
  ENVIRONMENT_MODE="$(stat -f '%Lp' "$ENVIRONMENT_FILE")"
else
  ENVIRONMENT_OWNER="$(stat -c '%u' "$ENVIRONMENT_FILE")"
  ENVIRONMENT_MODE="$(stat -c '%a' "$ENVIRONMENT_FILE")"
fi
if [[ "$ENVIRONMENT_OWNER" != "$(id -u)" ]]; then
  printf 'Nodezuno environment file has an unexpected owner.\n' >&2
  exit 1
fi
case "$ENVIRONMENT_MODE" in
  400|600) ;;
  *)
    printf 'Nodezuno environment file permissions are unsafe.\n' >&2
    exit 1
    ;;
esac

if [[ ! -L "$CURRENT_RELEASE" ]]; then
  printf 'Nodezuno current release link is missing.\n' >&2
  exit 1
fi

set -a
# This file is generated with owner-only permissions by install.sh.
# shellcheck disable=SC1090
. "$ENVIRONMENT_FILE"
set +a

if [[ -z "${NODEZUNO_NODE_BIN:-}" || ! -x "$NODEZUNO_NODE_BIN" ]]; then
  printf 'Configured Node.js binary is unavailable.\n' >&2
  exit 1
fi

RELEASE_DIRECTORY="$(readlink "$CURRENT_RELEASE")"
if [[ -z "$RELEASE_DIRECTORY" || ! -f "$RELEASE_DIRECTORY/server.js" ]]; then
  printf 'Nodezuno standalone release is unavailable.\n' >&2
  exit 1
fi

case "$RELEASE_DIRECTORY" in
  "$RUNTIME_ROOT/releases/"*) ;;
  *)
    printf 'Nodezuno current release points outside the release directory.\n' >&2
    exit 1
    ;;
esac

cd "$RELEASE_DIRECTORY"
exec "$NODEZUNO_NODE_BIN" server.js
