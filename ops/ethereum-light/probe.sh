#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command curl
require_command jq
load_config

RPC_URL="http://127.0.0.1:$RPC_PORT"

rpc_call() {
  payload=$1
  curl \
    --fail \
    --silent \
    --show-error \
    --connect-timeout 2 \
    --max-time 12 \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    "$RPC_URL"
}

chain_response=$(rpc_call '{"jsonrpc":"2.0","id":"nodezuno-chain","method":"eth_chainId","params":[]}')
chain_id=$(printf '%s' "$chain_response" | jq -er '
  select(.jsonrpc == "2.0" and .id == "nodezuno-chain" and .error == null)
  | .result
  | select(type == "string")
') || die "local RPC returned an invalid eth_chainId response"
[ "$chain_id" = '0x1' ] || die "local RPC returned an unexpected chain ID: $chain_id"

block_response=$(rpc_call '{"jsonrpc":"2.0","id":"nodezuno-block","method":"eth_blockNumber","params":[]}')
block_number=$(printf '%s' "$block_response" | jq -er '
  select(.jsonrpc == "2.0" and .id == "nodezuno-block" and .error == null)
  | .result
  | select(type == "string" and test("^0x[0-9a-fA-F]+$"))
') || die "local RPC returned an invalid eth_blockNumber response"
[ "$block_number" != '0x0' ] || die "local RPC returned the zero block"

balance_response=$(rpc_call '{"jsonrpc":"2.0","id":"nodezuno-balance","method":"eth_getBalance","params":["0x00000000219ab540356cBB839Cbe05303d7705Fa","latest"]}')
balance=$(printf '%s' "$balance_response" | jq -er '
  select(.jsonrpc == "2.0" and .id == "nodezuno-balance" and .error == null)
  | .result
  | select(type == "string" and test("^0x[0-9a-fA-F]+$"))
') || die "local RPC returned an invalid eth_getBalance response"

proof_response=$(rpc_call '{"jsonrpc":"2.0","id":"nodezuno-proof","method":"eth_getProof","params":["0x00000000219ab540356cBB839Cbe05303d7705Fa",[],"latest"]}')
proof_nodes=$(printf '%s' "$proof_response" | jq -er '
  select(.jsonrpc == "2.0" and .id == "nodezuno-proof" and .error == null)
  | .result
  | select(
      .address == "0x00000000219ab540356cbb839cbe05303d7705fa" and
      (.balance | type == "string" and test("^0x[0-9a-fA-F]+$")) and
      (.storageHash | type == "string" and test("^0x[0-9a-fA-F]{64}$")) and
      (.accountProof | type == "array" and length > 0)
    )
  | .accountProof
  | length
') || die "local RPC returned an invalid eth_getProof response"

jq -n \
  --arg status ready \
  --arg client 'Helios verified light client' \
  --arg rpc "$RPC_URL" \
  --arg chainId "$chain_id" \
  --arg blockNumber "$block_number" \
  --arg beaconDepositContractBalance "$balance" \
  --argjson accountProofNodes "$proof_nodes" \
  '{status: $status, client: $client, rpc: $rpc, chainId: $chainId, blockNumber: $blockNumber, beaconDepositContractBalance: $beaconDepositContractBalance, accountProofNodes: $accountProofNodes}'
