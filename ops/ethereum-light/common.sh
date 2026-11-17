#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=release.env
. "$SCRIPT_DIR/release.env"

if [ "$(uname -s)" = 'Darwin' ]; then
  DEFAULT_RUNTIME_DIR="$HOME/Library/Application Support/Nodezuno/ethereum-light"
  DEFAULT_PLIST_FILE="$HOME/Library/LaunchAgents/com.nodezuno.ethereum-light.plist"
else
  DEFAULT_RUNTIME_DIR="$SCRIPT_DIR/.runtime"
  DEFAULT_PLIST_FILE="$DEFAULT_RUNTIME_DIR/run/com.nodezuno.ethereum-light.plist"
fi
RUNTIME_DIR=${NODEZUNO_HELIOS_RUNTIME_DIR:-"$DEFAULT_RUNTIME_DIR"}
BIN_DIR="$RUNTIME_DIR/bin"
DATA_DIR="$RUNTIME_DIR/data"
LOG_DIR="$RUNTIME_DIR/logs"
RUN_DIR="$RUNTIME_DIR/run"
SERVICE_DIR="$RUNTIME_DIR/service"
CONFIG_FILE="$RUNTIME_DIR/config.json"
HELIOS_BIN="$BIN_DIR/helios"
PID_FILE="$RUN_DIR/helios.pid"
LOG_FILE="$LOG_DIR/helios.log"
SERVICE_LABEL='com.nodezuno.ethereum-light'
SERVICE_DOMAIN="gui/$(id -u)"
SERVICE_TARGET="$SERVICE_DOMAIN/$SERVICE_LABEL"
PLIST_FILE=${NODEZUNO_HELIOS_PLIST_FILE:-"$DEFAULT_PLIST_FILE"}
LEGACY_PLIST_FILE="$RUN_DIR/$SERVICE_LABEL.plist"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

file_size() {
  wc -c < "$1" | tr -d '[:space:]'
}

ensure_runtime_directories() {
  umask 077
  mkdir -p "$BIN_DIR" "$DATA_DIR" "$LOG_DIR" "$RUN_DIR" "$SERVICE_DIR"
  chmod 0700 "$RUNTIME_DIR" "$BIN_DIR" "$DATA_DIR" "$LOG_DIR" "$RUN_DIR" "$SERVICE_DIR"
  if [ "$(uname -s)" = 'Darwin' ]; then
    [ ! -L "$HOME/Library/LaunchAgents" ] ||
      die "LaunchAgents directory cannot be a symbolic link"
    mkdir -p "$HOME/Library/LaunchAgents"
  fi
}

validate_port() {
  port=$1
  case "$port" in
    ''|*[!0-9]*) die "rpcPort must be an integer from 1024 through 65535" ;;
  esac
  [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] ||
    die "rpcPort must be an integer from 1024 through 65535"
}

validate_checkpoint() {
  checkpoint=$1
  printf '%s' "$checkpoint" | grep -Eq '^0x[0-9a-fA-F]{64}$' ||
    die "checkpoint must be a 32-byte 0x-prefixed beacon block root"
}

validate_https_url() {
  label=$1
  url=$2

  [ "$(printf '%s' "$url" | wc -c | tr -d '[:space:]')" -le 4096 ] ||
    die "$label exceeds 4096 bytes"
  case "$url" in
    https://*) ;;
    *) die "$label must use https" ;;
  esac
  printf '%s' "$url" | grep -Eq '[[:space:]]' && die "$label cannot contain whitespace"

  authority=${url#https://}
  authority=${authority%%/*}
  authority=${authority%%\?*}
  authority=${authority%%\#*}
  [ -n "$authority" ] || die "$label must contain a hostname"
  case "$authority" in
    *@*) die "$label cannot contain URL user information" ;;
  esac

  host=$authority
  case "$host" in
    *:443) host=${host%:443} ;;
    *:*) die "$label cannot use a custom port" ;;
  esac
  host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
  case "$host" in
    ''|localhost|*.localhost|*.local|*.internal|*.home.arpa)
      die "$label must use a reviewed public hostname"
      ;;
  esac
}

validate_consensus_url() {
  url=$1
  if [ "$url" = 'http://testing.mainnet.beacon-api.nimbus.team' ]; then
    return 0
  fi
  validate_https_url consensusRpc "$url"
}

config_mode() {
  if stat -f '%Lp' "$CONFIG_FILE" >/dev/null 2>&1; then
    stat -f '%Lp' "$CONFIG_FILE"
  else
    stat -c '%a' "$CONFIG_FILE"
  fi
}

config_owner() {
  if stat -f '%u' "$CONFIG_FILE" >/dev/null 2>&1; then
    stat -f '%u' "$CONFIG_FILE"
  else
    stat -c '%u' "$CONFIG_FILE"
  fi
}

load_config() {
  require_command jq
  [ -f "$CONFIG_FILE" ] || die "missing $CONFIG_FILE; run ./configure.sh first"
  [ ! -L "$CONFIG_FILE" ] || die "configuration cannot be a symbolic link"
  [ "$(config_owner)" = "$(id -u)" ] || die "configuration must be owned by the current user"

  config_file_mode=$(config_mode)
  group_digit=$((config_file_mode / 10 % 10))
  other_digit=$((config_file_mode % 10))
  [ "$group_digit" -eq 0 ] && [ "$other_digit" -eq 0 ] ||
    die "configuration permissions are too broad; run chmod 600 $CONFIG_FILE"

  jq -e '
    type == "object" and
    keys == ["checkpoint", "consensusRpc", "executionRpc", "rpcPort"] and
    (.executionRpc | type == "string" and test("^https://[^[:space:]]+$")) and
    (.consensusRpc | type == "string" and
      (test("^https://[^[:space:]]+$") or . == "http://testing.mainnet.beacon-api.nimbus.team")) and
    (.checkpoint | type == "string" and test("^0x[0-9A-Fa-f]{64}$")) and
    (.rpcPort | type == "number" and floor == . and . >= 1024 and . <= 65535)
  ' "$CONFIG_FILE" >/dev/null || die "configuration does not match the closed schema"

  EXECUTION_RPC=$(jq -er '.executionRpc' "$CONFIG_FILE")
  CONSENSUS_RPC=$(jq -er '.consensusRpc' "$CONFIG_FILE")
  CHECKPOINT=$(jq -er '.checkpoint' "$CONFIG_FILE")
  RPC_PORT=$(jq -er '.rpcPort | tostring' "$CONFIG_FILE")

  validate_https_url executionRpc "$EXECUTION_RPC"
  validate_consensus_url "$CONSENSUS_RPC"
  validate_checkpoint "$CHECKPOINT"
  validate_port "$RPC_PORT"
}

assert_runtime_binary() {
  require_command shasum
  [ -x "$HELIOS_BIN" ] || die "Helios is not installed; run ./install.sh"
  [ ! -L "$HELIOS_BIN" ] || die "Helios runtime binary cannot be a symbolic link"

  actual_hash=$(sha256_file "$HELIOS_BIN")
  [ "$actual_hash" = "$HELIOS_BINARY_SHA256" ] ||
    die "installed Helios binary failed the pinned SHA-256 check"

  actual_version=$("$HELIOS_BIN" --version 2>/dev/null || true)
  [ "$actual_version" = "helios-cli $HELIOS_VERSION" ] ||
    die "installed Helios version does not match $HELIOS_VERSION"
}

read_pid() {
  [ -f "$PID_FILE" ] || return 1
  pid=$(sed -n '1p' "$PID_FILE")
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$pid"
}

pid_is_helios() {
  pid=$1
  kill -0 "$pid" >/dev/null 2>&1 || return 1
  command_line=$(ps -p "$pid" -o command= 2>/dev/null || true)
  case "$command_line" in
    "$HELIOS_BIN ethereum"*) return 0 ;;
    *) return 1 ;;
  esac
}

service_is_loaded() {
  launchctl print "$SERVICE_TARGET" >/dev/null 2>&1
}

service_pid() {
  launchctl print "$SERVICE_TARGET" 2>/dev/null |
    awk '/^[[:space:]]*pid = [0-9]+$/ { print $3; exit }'
}

write_launchd_plist() {
  require_command plutil
  plist_tmp=$(mktemp "$RUN_DIR/$SERVICE_LABEL.plist.XXXXXX")

  plutil -create xml1 "$plist_tmp"
  plutil -insert Label -string "$SERVICE_LABEL" "$plist_tmp"
  plutil -insert ProgramArguments -array "$plist_tmp"
  plutil -insert ProgramArguments.0 -string '/bin/sh' "$plist_tmp"
  plutil -insert ProgramArguments.1 -string "$SERVICE_DIR/run.sh" "$plist_tmp"
  plutil -insert WorkingDirectory -string "$RUNTIME_DIR" "$plist_tmp"
  plutil -insert RunAtLoad -bool true "$plist_tmp"
  plutil -insert KeepAlive -bool true "$plist_tmp"
  plutil -insert ProcessType -string Background "$plist_tmp"
  plutil -insert ThrottleInterval -integer 10 "$plist_tmp"
  plutil -insert Umask -integer 63 "$plist_tmp"
  plutil -insert StandardOutPath -string "$LOG_FILE" "$plist_tmp"
  plutil -insert StandardErrorPath -string "$LOG_FILE" "$plist_tmp"
  plutil -insert EnvironmentVariables -dictionary "$plist_tmp"
  plutil -insert EnvironmentVariables.PATH -string '/usr/bin:/bin:/usr/sbin:/sbin' "$plist_tmp"
  plutil -insert EnvironmentVariables.NODEZUNO_HELIOS_RUNTIME_DIR -string "$RUNTIME_DIR" "$plist_tmp"
  plutil -lint "$plist_tmp" >/dev/null
  chmod 0600 "$plist_tmp"
  [ ! -L "$PLIST_FILE" ] || die "launch service definition cannot be a symbolic link"
  mv "$plist_tmp" "$PLIST_FILE"
  chmod 0600 "$PLIST_FILE"
  if [ "$LEGACY_PLIST_FILE" != "$PLIST_FILE" ]; then
    rm -f "$LEGACY_PLIST_FILE"
  fi
}

sync_service_files() {
  ensure_runtime_directories
  cp "$SCRIPT_DIR/common.sh" "$SERVICE_DIR/common.sh"
  cp "$SCRIPT_DIR/release.env" "$SERVICE_DIR/release.env"
  cp "$SCRIPT_DIR/run.sh" "$SERVICE_DIR/run.sh"
  chmod 0700 "$SERVICE_DIR/run.sh"
  chmod 0600 "$SERVICE_DIR/common.sh" "$SERVICE_DIR/release.env"
}
