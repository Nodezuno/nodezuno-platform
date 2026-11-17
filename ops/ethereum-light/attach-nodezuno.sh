#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

ENV_FILE=${NODEZUNO_ENV_FILE:-"$HOME/Library/Application Support/Nodezuno/config/nodezuno.env"}
LOOPBACK_LINE='NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK=true'

usage() {
  printf 'usage: ./attach-nodezuno.sh [--check]\n' >&2
  exit 64
}

mode='attach'
case "${1:-}" in
  '') ;;
  --check) mode='check' ;;
  *) usage ;;
esac
[ "$#" -le 1 ] || usage

require_command awk
require_command shasum
load_config
UPSTREAM_LINE="NODEZUNO_RPC_UPSTREAMS_JSON='{\"ethereum\":[{\"name\":\"helios\",\"url\":\"http://127.0.0.1:$RPC_PORT/\",\"timeoutMs\":8000}]}'"

[ -f "$ENV_FILE" ] || die "Nodezuno environment file does not exist: $ENV_FILE"
[ ! -L "$ENV_FILE" ] || die "Nodezuno environment file cannot be a symbolic link"

if stat -f '%u' "$ENV_FILE" >/dev/null 2>&1; then
  env_owner=$(stat -f '%u' "$ENV_FILE")
  env_mode=$(stat -f '%Lp' "$ENV_FILE")
else
  env_owner=$(stat -c '%u' "$ENV_FILE")
  env_mode=$(stat -c '%a' "$ENV_FILE")
fi
[ "$env_owner" = "$(id -u)" ] || die "Nodezuno environment file must be owned by the current user"
[ "$((env_mode / 10 % 10))" -eq 0 ] && [ "$((env_mode % 10))" -eq 0 ] ||
  die "Nodezuno environment file permissions are too broad; expected mode 0600"

loopback_count=$(awk -F= '$1 == "NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK" { count++ } END { print count + 0 }' "$ENV_FILE")
upstream_count=$(awk -F= '$1 == "NODEZUNO_RPC_UPSTREAMS_JSON" { count++ } END { print count + 0 }' "$ENV_FILE")
[ "$loopback_count" -le 1 ] || die "Nodezuno environment contains duplicate loopback flags"
[ "$upstream_count" -le 1 ] || die "Nodezuno environment contains duplicate RPC upstream definitions"

"$SCRIPT_DIR/probe.sh" >/dev/null || die "Helios must pass the full mainnet probe before attachment"

if [ "$mode" = 'check' ]; then
  grep -Fx "$LOOPBACK_LINE" "$ENV_FILE" >/dev/null 2>&1 ||
    die "Nodezuno is not configured to allow the Ethereum loopback"
  grep -Fx "$UPSTREAM_LINE" "$ENV_FILE" >/dev/null 2>&1 ||
    die "Nodezuno is not configured with the exact Helios loopback upstream"
  printf 'Nodezuno is configured for the ready Helios loopback at http://127.0.0.1:%s/\n' "$RPC_PORT"
  exit 0
fi

config_dir=$(dirname -- "$ENV_FILE")
lock_dir="$config_dir/.ethereum-light-attach.lock"
mkdir "$lock_dir" 2>/dev/null || die "another Nodezuno environment update may be in progress"

config_tmp=$(mktemp "$config_dir/nodezuno.env.XXXXXX")
cleanup() {
  rm -f "$config_tmp"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
chmod 0600 "$config_tmp"

untouched_before=$(awk -F= '
  $1 != "NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK" &&
  $1 != "NODEZUNO_RPC_UPSTREAMS_JSON"
' "$ENV_FILE" | shasum -a 256 | awk '{print $1}')

awk -F= -v loopback="$LOOPBACK_LINE" -v upstream="$UPSTREAM_LINE" '
  BEGIN { saw_loopback = 0; saw_upstream = 0 }
  $1 == "NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK" {
    print loopback
    saw_loopback = 1
    next
  }
  $1 == "NODEZUNO_RPC_UPSTREAMS_JSON" {
    print upstream
    saw_upstream = 1
    next
  }
  { print }
  END {
    if (!saw_loopback) print loopback
    if (!saw_upstream) print upstream
  }
' "$ENV_FILE" > "$config_tmp"

untouched_after=$(awk -F= '
  $1 != "NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK" &&
  $1 != "NODEZUNO_RPC_UPSTREAMS_JSON"
' "$config_tmp" | shasum -a 256 | awk '{print $1}')
[ "$untouched_before" = "$untouched_after" ] || die "refusing an update that changes unrelated Nodezuno configuration"

[ "$(grep -Fxc "$LOOPBACK_LINE" "$config_tmp")" -eq 1 ] || die "failed to write the loopback flag exactly once"
[ "$(grep -Fxc "$UPSTREAM_LINE" "$config_tmp")" -eq 1 ] || die "failed to write the Helios upstream exactly once"

mv "$config_tmp" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
trap - EXIT HUP INT TERM
rmdir "$lock_dir"

printf 'Attached the ready Helios endpoint in %s\n' "$ENV_FILE"
printf 'All unrelated settings were preserved and the file remains mode 0600.\n'
printf 'Restart Nodezuno explicitly with: ./deploy/local-mac/stop.sh && ./deploy/local-mac/start.sh\n'
