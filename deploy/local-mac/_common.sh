#!/bin/bash

set -euo pipefail

NODEZUNO_LOCAL_SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
NODEZUNO_PROJECT_ROOT="$(
  cd "$NODEZUNO_LOCAL_SCRIPT_DIR/../.." >/dev/null 2>&1
  pwd -P
)"

NODEZUNO_LAUNCHD_LABEL="com.nodezuno.web"
NODEZUNO_EMAIL_WORKER_LABEL="com.nodezuno.email-worker"
NODEZUNO_PAYMENT_WORKER_LABEL="com.nodezuno.payment-worker"
NODEZUNO_LOCAL_ROOT="${NODEZUNO_LOCAL_ROOT:-$HOME/Library/Application Support/Nodezuno}"
NODEZUNO_LAUNCH_AGENTS_DIR="${NODEZUNO_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"

# shellcheck source=runtime-lock.sh
. "$NODEZUNO_LOCAL_SCRIPT_DIR/runtime-lock.sh"

nodezuno_env_file() {
  printf '%s/config/nodezuno.env\n' "$NODEZUNO_LOCAL_ROOT"
}

nodezuno_plist_file() {
  printf '%s/%s.plist\n' \
    "$NODEZUNO_LAUNCH_AGENTS_DIR" \
    "$NODEZUNO_LAUNCHD_LABEL"
}

nodezuno_email_worker_plist_file() {
  printf '%s/%s.plist\n' \
    "$NODEZUNO_LAUNCH_AGENTS_DIR" \
    "$NODEZUNO_EMAIL_WORKER_LABEL"
}

nodezuno_payment_worker_plist_file() {
  printf '%s/%s.plist\n' \
    "$NODEZUNO_LAUNCH_AGENTS_DIR" \
    "$NODEZUNO_PAYMENT_WORKER_LABEL"
}

nodezuno_service_target() {
  printf 'gui/%s/%s\n' "$(id -u)" "$NODEZUNO_LAUNCHD_LABEL"
}

nodezuno_email_worker_target() {
  printf 'gui/%s/%s\n' "$(id -u)" "$NODEZUNO_EMAIL_WORKER_LABEL"
}

nodezuno_payment_worker_target() {
  printf 'gui/%s/%s\n' "$(id -u)" "$NODEZUNO_PAYMENT_WORKER_LABEL"
}

nodezuno_die() {
  printf 'Nodezuno local deployment: %s\n' "$1" >&2
  exit 1
}

nodezuno_note() {
  printf '%s\n' "$1"
}

nodezuno_require_command() {
  command -v "$1" >/dev/null 2>&1 || \
    nodezuno_die "Required command '$1' is unavailable."
}

nodezuno_validate_absolute_path() {
  local value="$1"
  local name="$2"
  case "$value" in
    /*) ;;
    *) nodezuno_die "$name must be an absolute path." ;;
  esac
  case "$value" in
    *$'\n'*|*$'\r'*|*$'\t'*)
      nodezuno_die "$name contains an unsupported control character."
      ;;
  esac
}

nodezuno_ensure_layout() {
  nodezuno_validate_absolute_path "$NODEZUNO_LOCAL_ROOT" \
    "NODEZUNO_LOCAL_ROOT"
  nodezuno_validate_absolute_path "$NODEZUNO_LAUNCH_AGENTS_DIR" \
    "NODEZUNO_LAUNCH_AGENTS_DIR"

  mkdir -p \
    "$NODEZUNO_LOCAL_ROOT/backups" \
    "$NODEZUNO_LOCAL_ROOT/bin" \
    "$NODEZUNO_LOCAL_ROOT/config" \
    "$NODEZUNO_LOCAL_ROOT/data" \
    "$NODEZUNO_LOCAL_ROOT/locks" \
    "$NODEZUNO_LOCAL_ROOT/logs" \
    "$NODEZUNO_LOCAL_ROOT/releases" \
    "$NODEZUNO_LOCAL_ROOT/tmp" \
    "$NODEZUNO_LOCAL_ROOT/toolchains" \
    "$NODEZUNO_LAUNCH_AGENTS_DIR"

  chmod 700 \
    "$NODEZUNO_LOCAL_ROOT" \
    "$NODEZUNO_LOCAL_ROOT/backups" \
    "$NODEZUNO_LOCAL_ROOT/bin" \
    "$NODEZUNO_LOCAL_ROOT/config" \
    "$NODEZUNO_LOCAL_ROOT/data" \
    "$NODEZUNO_LOCAL_ROOT/locks" \
    "$NODEZUNO_LOCAL_ROOT/logs" \
    "$NODEZUNO_LOCAL_ROOT/releases" \
    "$NODEZUNO_LOCAL_ROOT/tmp"
  chmod 700 "$NODEZUNO_LOCAL_ROOT/toolchains"

  NODEZUNO_LOCAL_ROOT="$(
    cd "$NODEZUNO_LOCAL_ROOT" >/dev/null 2>&1
    pwd -P
  )"
  NODEZUNO_LAUNCH_AGENTS_DIR="$(
    cd "$NODEZUNO_LAUNCH_AGENTS_DIR" >/dev/null 2>&1
    pwd -P
  )"
}

nodezuno_file_owner() {
  if stat -f '%u' "$1" >/dev/null 2>&1; then
    stat -f '%u' "$1"
  else
    stat -c '%u' "$1"
  fi
}

nodezuno_file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

nodezuno_assert_private_environment() {
  local environment_file
  local owner
  local mode
  environment_file="$(nodezuno_env_file)"
  [[ -f "$environment_file" && ! -L "$environment_file" ]] || \
    nodezuno_die "Environment file is missing or unsafe: $environment_file"
  owner="$(nodezuno_file_owner "$environment_file")"
  [[ "$owner" = "$(id -u)" ]] || \
    nodezuno_die "Environment file must be owned by the current user."
  mode="$(nodezuno_file_mode "$environment_file")"
  case "$mode" in
    400|600) ;;
    *) nodezuno_die "Environment file permissions must be 400 or 600." ;;
  esac
}

nodezuno_load_environment() {
  local environment_file
  nodezuno_assert_private_environment
  environment_file="$(nodezuno_env_file)"
  set -a
  # The generated file is owner-only shell syntax so values remain exact.
  # shellcheck disable=SC1090
  . "$environment_file"
  set +a
}

nodezuno_resolve_executable() {
  local requested="$1"
  local resolved
  if [[ "$requested" = */* ]]; then
    [[ -x "$requested" && ! -d "$requested" ]] || return 1
    resolved="$(
      cd "$(dirname "$requested")" >/dev/null 2>&1
      printf '%s/%s\n' "$(pwd -P)" "$(basename "$requested")"
    )"
  else
    resolved="$(command -v "$requested" 2>/dev/null || true)"
    [[ -n "$resolved" && -x "$resolved" ]] || return 1
  fi
  printf '%s\n' "$resolved"
}

nodezuno_find_node() {
  local requested="${1:-${NODEZUNO_NODE_BIN:-}}"
  local candidate
  if [[ -n "$requested" ]]; then
    nodezuno_resolve_executable "$requested" || \
      nodezuno_die "NODEZUNO_NODE_BIN does not identify an executable Node.js binary."
    return
  fi
  for candidate in \
    "$NODEZUNO_LOCAL_ROOT/toolchains/node-current/bin/node" \
    node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node; do
    if nodezuno_resolve_executable "$candidate" >/dev/null 2>&1; then
      nodezuno_resolve_executable "$candidate"
      return
    fi
  done
  nodezuno_die \
    "Node.js is unavailable. Run deploy/local-mac/bootstrap-toolchain.sh, install Node.js 22.18 or newer, or set NODEZUNO_NODE_BIN to an absolute binary path."
}

nodezuno_assert_node_version() {
  local node_binary="$1"
  local version
  local major
  local minor
  version="$("$node_binary" -p 'process.versions.node')" || \
    nodezuno_die "The selected Node.js binary could not run."
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if ! [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]]; then
    nodezuno_die "The selected Node.js version is invalid."
  fi
  if (( major < 22 || (major == 22 && minor < 18) )); then
    nodezuno_die "Node.js 22.18 or newer is required. Found $version."
  fi
  "$node_binary" -e "require('node:sqlite')" >/dev/null 2>&1 || \
    nodezuno_die "The selected Node.js build does not provide node:sqlite."
}

nodezuno_find_pnpm() {
  local requested="${1:-${NODEZUNO_PNPM_BIN:-}}"
  local candidate
  if [[ -n "$requested" ]]; then
    nodezuno_resolve_executable "$requested" || \
      nodezuno_die "NODEZUNO_PNPM_BIN does not identify an executable pnpm binary."
    return
  fi
  for candidate in \
    "$NODEZUNO_LOCAL_ROOT/toolchains/pnpm-current/bin/pnpm" \
    pnpm \
    /opt/homebrew/bin/pnpm \
    /usr/local/bin/pnpm; do
    if nodezuno_resolve_executable "$candidate" >/dev/null 2>&1; then
      nodezuno_resolve_executable "$candidate"
      return
    fi
  done
  nodezuno_die \
    "pnpm is unavailable. Run deploy/local-mac/bootstrap-toolchain.sh, install pnpm 11.9.0, or set NODEZUNO_PNPM_BIN to an absolute binary path."
}

nodezuno_service_is_loaded() {
  launchctl print "$(nodezuno_service_target)" >/dev/null 2>&1
}

nodezuno_email_worker_is_loaded() {
  launchctl print "$(nodezuno_email_worker_target)" >/dev/null 2>&1
}

nodezuno_payment_worker_is_loaded() {
  launchctl print "$(nodezuno_payment_worker_target)" >/dev/null 2>&1
}

nodezuno_current_release() {
  local current="$NODEZUNO_LOCAL_ROOT/current"
  [[ -L "$current" ]] || return 1
  readlink "$current"
}

nodezuno_require_current_release() {
  local release
  release="$(nodezuno_current_release 2>/dev/null || true)"
  [[ -n "$release" && -d "$release" && -f "$release/server.js" ]] || \
    nodezuno_die "No deployed standalone release is available."
  printf '%s\n' "$release"
}

nodezuno_acquire_lock() {
  local name="$1"
  # Call in the current shell, never through command substitution: descriptor
  # 9 must remain with the operation after this function returns.
  nodezuno_runtime_acquire_lock "$NODEZUNO_LOCAL_ROOT" "$name" || \
    nodezuno_die "Could not acquire the $name operation lock."
}

nodezuno_release_lock() {
  nodezuno_runtime_release_lock "$1"
}

nodezuno_install_worker_runners() {
  # Install after supervised jobs stop so an old directory-lock runner cannot
  # overlap the first pass under the replacement kernel-lock implementation.
  if nodezuno_email_worker_is_loaded || nodezuno_payment_worker_is_loaded; then
    if cmp -s "$NODEZUNO_LOCAL_SCRIPT_DIR/runtime-lock.sh" \
        "$NODEZUNO_LOCAL_ROOT/bin/runtime-lock.sh" &&
      cmp -s "$NODEZUNO_LOCAL_SCRIPT_DIR/run-email-worker.sh" \
        "$NODEZUNO_LOCAL_ROOT/bin/run-email-worker" &&
      cmp -s "$NODEZUNO_LOCAL_SCRIPT_DIR/run-payment-worker.sh" \
        "$NODEZUNO_LOCAL_ROOT/bin/run-payment-worker"; then
      return 0
    fi
    nodezuno_note "Stop the supervised workers before replacing their runners." >&2
    return 1
  fi
  install -S -m 700 "$NODEZUNO_LOCAL_SCRIPT_DIR/runtime-lock.sh" \
    "$NODEZUNO_LOCAL_ROOT/bin/runtime-lock.sh" || return 1
  install -S -m 700 "$NODEZUNO_LOCAL_SCRIPT_DIR/run-email-worker.sh" \
    "$NODEZUNO_LOCAL_ROOT/bin/run-email-worker" || return 1
  install -S -m 700 "$NODEZUNO_LOCAL_SCRIPT_DIR/run-payment-worker.sh" \
    "$NODEZUNO_LOCAL_ROOT/bin/run-payment-worker" || return 1
}
