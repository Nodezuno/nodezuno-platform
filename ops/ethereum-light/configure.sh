#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command jq

[ -n "${HELIOS_EXECUTION_RPC:-}" ] ||
  die "set HELIOS_EXECUTION_RPC to a reviewed HTTPS endpoint that supports eth_getProof"
[ -n "${HELIOS_CHECKPOINT:-}" ] ||
  die "set HELIOS_CHECKPOINT to a recent, independently verified beacon block root"

HELIOS_CONSENSUS_RPC=${HELIOS_CONSENSUS_RPC:-'http://testing.mainnet.beacon-api.nimbus.team'}
HELIOS_RPC_PORT=${HELIOS_RPC_PORT:-18545}

validate_https_url HELIOS_EXECUTION_RPC "$HELIOS_EXECUTION_RPC"
validate_consensus_url "$HELIOS_CONSENSUS_RPC"
validate_checkpoint "$HELIOS_CHECKPOINT"
validate_port "$HELIOS_RPC_PORT"
ensure_runtime_directories

config_tmp=$(mktemp "$RUNTIME_DIR/config.json.XXXXXX")
cleanup() {
  rm -f "$config_tmp"
}
trap cleanup EXIT HUP INT TERM

jq -n \
  --arg executionRpc "$HELIOS_EXECUTION_RPC" \
  --arg consensusRpc "$HELIOS_CONSENSUS_RPC" \
  --arg checkpoint "$HELIOS_CHECKPOINT" \
  --argjson rpcPort "$HELIOS_RPC_PORT" \
  '{executionRpc: $executionRpc, consensusRpc: $consensusRpc, checkpoint: $checkpoint, rpcPort: $rpcPort}' \
  > "$config_tmp"
chmod 0600 "$config_tmp"
mv "$config_tmp" "$CONFIG_FILE"
chmod 0600 "$CONFIG_FILE"
trap - EXIT HUP INT TERM

printf 'Wrote private Helios configuration to %s\n' "$CONFIG_FILE"
printf 'The local RPC will bind only to http://127.0.0.1:%s\n' "$HELIOS_RPC_PORT"
if [ "$HELIOS_CONSENSUS_RPC" = 'http://testing.mainnet.beacon-api.nimbus.team' ]; then
  printf 'Warning: the Nimbus testing Beacon API is a temporary local-lab dependency, not a production service.\n'
fi
