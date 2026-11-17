#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

follow=false
lines=100
stream=both

usage() {
  printf '%s\n' \
    "Usage: bash deploy/local-mac/logs.sh [options]" \
    "" \
    "Options:" \
    "  --follow       Continue following log output" \
    "  --lines <n>    Show the last n lines, default 100" \
    "  --stdout       Show only standard output" \
    "  --stderr       Show only standard error"
}

while (( $# > 0 )); do
  case "$1" in
    --follow|-f)
      follow=true
      shift
      ;;
    --lines|-n)
      (( $# >= 2 )) || nodezuno_die "$1 requires a value."
      lines="$2"
      shift 2
      ;;
    --stdout)
      stream=stdout
      shift
      ;;
    --stderr)
      stream=stderr
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      nodezuno_die "Unknown logs option: $1"
      ;;
  esac
done

[[ "$lines" =~ ^[1-9][0-9]{0,5}$ ]] || \
  nodezuno_die "--lines must be an integer from 1 to 999999."

files=()
if [[ "$stream" = stdout || "$stream" = both ]]; then
  files+=("$NODEZUNO_LOCAL_ROOT/logs/web.stdout.log")
  files+=("$NODEZUNO_LOCAL_ROOT/logs/email-worker.stdout.log")
  files+=("$NODEZUNO_LOCAL_ROOT/logs/payment-worker.stdout.log")
fi
if [[ "$stream" = stderr || "$stream" = both ]]; then
  files+=("$NODEZUNO_LOCAL_ROOT/logs/web.stderr.log")
  files+=("$NODEZUNO_LOCAL_ROOT/logs/email-worker.stderr.log")
  files+=("$NODEZUNO_LOCAL_ROOT/logs/payment-worker.stderr.log")
fi

existing=()
for file in "${files[@]}"; do
  [[ -f "$file" ]] && existing+=("$file")
done
(( ${#existing[@]} > 0 )) || nodezuno_die "No web logs exist yet."

if [[ "$follow" = true ]]; then
  tail -n "$lines" -f "${existing[@]}"
else
  tail -n "$lines" "${existing[@]}"
fi
