#!/bin/bash

set -euo pipefail
umask 077

RUNTIME_ROOT="${NODEZUNO_LOCAL_ROOT:-$HOME/Library/Application Support/Nodezuno}"
ENVIRONMENT_FILE="$RUNTIME_ROOT/config/nodezuno.env"
CURRENT_RELEASE="$RUNTIME_ROOT/current"
RUNNER_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
# shellcheck source=runtime-lock.sh
. "$RUNNER_DIRECTORY/runtime-lock.sh"
nodezuno_runtime_acquire_lock "$RUNTIME_ROOT" payment-worker

if [[ ! -f "$ENVIRONMENT_FILE" || -L "$ENVIRONMENT_FILE" ]] ||
  [[ ! -L "$CURRENT_RELEASE" ]]; then
  exit 0
fi

set -a
# shellcheck disable=SC1090
. "$ENVIRONMENT_FILE"
set +a

if [[ "${NODEZUNO_STABLECOIN_PAYMENT_MODE:-disabled}" != "ethereum_mainnet" ]] ||
  [[ -z "${NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON:-}" ]]; then
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
[[ -f "$RELEASE_DIRECTORY/scripts/process-stablecoin-payments.mjs" ]] || exit 1

cd "$RELEASE_DIRECTORY"
# The live worker owns the inherited descriptor, including during termination.
exec "$NODEZUNO_NODE_BIN" scripts/process-stablecoin-payments.mjs --once
