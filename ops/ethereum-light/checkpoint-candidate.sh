#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command curl
require_command jq

CHECKPOINT_API='https://sync-mainnet.beaconcha.in/checkpointz/v1/beacon/slots'

response=$(curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --silent \
  --show-error \
  --connect-timeout 10 \
  --max-time 30 \
  "$CHECKPOINT_API")

printf '%s' "$response" | jq -e '
  (.data.slots | type == "array" and length > 0) and
  (.data.slots[0].slot | type == "string" and test("^[0-9]+$"))
' >/dev/null || die "checkpoint service returned an unexpected slot response"

candidate=$(printf '%s' "$response" | jq -c '
  .data.slots
  | map(select(.block_root != null))
  | first
  | {
      checkpoint: .block_root,
      epoch: (.epoch | tonumber),
      slot: (.slot | tonumber),
      observedAt: .time.start_time,
      source: "https://sync-mainnet.beaconcha.in/checkpointz/v1/beacon/slots"
    }
')

checkpoint=$(printf '%s' "$candidate" | jq -er '.checkpoint')
validate_checkpoint "$checkpoint"
printf '%s\n' "$candidate" | jq .
