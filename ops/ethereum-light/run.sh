#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

ensure_runtime_directories
assert_runtime_binary
load_config

export EXECUTION_RPC
export CONSENSUS_RPC
export CHECKPOINT
export RPC_PORT
export DATA_DIR
export RPC_BIND_IP='127.0.0.1'
export STRICT_CHECKPOINT_AGE='true'

exec "$HELIOS_BIN" ethereum
