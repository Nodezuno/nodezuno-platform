#!/bin/bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

admin_emails="${NODEZUNO_ADMIN_EMAILS:-}"
node_request="${NODEZUNO_NODE_BIN:-}"
pnpm_request="${NODEZUNO_PNPM_BIN:-}"
port="${NODEZUNO_LOCAL_PORT:-3000}"
prepare_only=false
start_after_deploy=true

usage() {
  printf '%s\n' \
    "Usage: bash deploy/local-mac/install.sh [options]" \
    "" \
    "Options:" \
    "  --admin-email <email[,email]>  Required for the first install" \
    "  --node <absolute-path>         Node.js 22.18 or newer" \
    "  --pnpm <absolute-path>         pnpm 11.9.0" \
    "  --port <1024-65535>            Loopback port, default 3000" \
    "  --prepare-only                 Create config and plist only" \
    "  --no-start                     Build and migrate without starting" \
    "  -h, --help                     Show this help" \
    "" \
    "Run bootstrap-toolchain.sh first when Node.js and pnpm are not installed."
}

while (( $# > 0 )); do
  case "$1" in
    --admin-email)
      (( $# >= 2 )) || nodezuno_die "--admin-email requires a value."
      admin_emails="$2"
      shift 2
      ;;
    --node)
      (( $# >= 2 )) || nodezuno_die "--node requires a value."
      node_request="$2"
      shift 2
      ;;
    --pnpm)
      (( $# >= 2 )) || nodezuno_die "--pnpm requires a value."
      pnpm_request="$2"
      shift 2
      ;;
    --port)
      (( $# >= 2 )) || nodezuno_die "--port requires a value."
      port="$2"
      shift 2
      ;;
    --prepare-only)
      prepare_only=true
      shift
      ;;
    --no-start)
      start_after_deploy=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      nodezuno_die "Unknown install option: $1"
      ;;
  esac
done

validate_admin_emails() {
  local value="$1"
  local address
  local old_ifs="$IFS"
  [[ -n "$value" && \
    "$value" != *[[:space:]]* && \
    "$value" != ,* && \
    "$value" != *, && \
    "$value" != *,,* ]] || \
    nodezuno_die "Provide one or more comma-separated administrator mailboxes you control."
  IFS=','
  for address in $value; do
    [[ "$address" =~ ^[^@]+@[^@]+\.[^@.]+$ ]] || \
      nodezuno_die "Administrator email format is invalid."
    case "$address" in
      *@example.com|*.example|*.invalid|*.test|*@localhost)
        nodezuno_die "Administrator email must be a real operational mailbox."
        ;;
    esac
  done
  IFS="$old_ifs"
}

write_environment_line() {
  local name="$1"
  local value="$2"
  printf '%s=' "$name"
  printf '%q' "$value"
  printf '\n'
}

create_environment() {
  local environment_file="$1"
  local node_binary="$2"
  local pnpm_binary="$3"
  local temporary_file
  local rate_limit_secret
  local better_auth_secret
  local review_capability_secret
  temporary_file="$(mktemp "$NODEZUNO_LOCAL_ROOT/config/.nodezuno.env.XXXXXX")"
  chmod 600 "$temporary_file"
  rate_limit_secret="$(openssl rand -hex 32)"
  better_auth_secret="$(openssl rand -hex 32)"
  review_capability_secret="$(openssl rand -hex 32)"
  {
    write_environment_line NODE_ENV production
    write_environment_line NODEZUNO_RUNTIME container
    write_environment_line NODEZUNO_LOCAL_PREVIEW true
    write_environment_line NODEZUNO_LEGAL_LAUNCH_APPROVED false
    write_environment_line NODEZUNO_PUBLIC_INDEXING false
    write_environment_line NODEZUNO_ALLOW_SCHEMA_BASELINE false
    write_environment_line NODEZUNO_ALLOW_CONTRACT_MIGRATIONS false
    write_environment_line HOSTNAME 127.0.0.1
    write_environment_line PORT "$port"
    write_environment_line NODEZUNO_DOMAIN localhost
    write_environment_line PUBLIC_ORIGIN "http://localhost:$port"
    write_environment_line BETTER_AUTH_URL "http://localhost:$port"
    write_environment_line NODEZUNO_INGRESS_MODE direct
    write_environment_line NODEZUNO_DATABASE_DRIVER sqlite
    write_environment_line NODEZUNO_SQLITE_PATH \
      "$NODEZUNO_LOCAL_ROOT/data/nodezuno.sqlite"
    write_environment_line RATE_LIMIT_SECRET "$rate_limit_secret"
    write_environment_line BETTER_AUTH_SECRET "$better_auth_secret"
    write_environment_line REVIEW_CAPABILITY_SECRET "$review_capability_secret"
    write_environment_line NODEZUNO_ORIGIN_SECRET ""
    write_environment_line NODEZUNO_ADMIN_EMAILS "$admin_emails"
    write_environment_line GOOGLE_CLIENT_ID ""
    write_environment_line GOOGLE_CLIENT_SECRET ""
    write_environment_line ZOHO_SMTP_HOST smtp.zoho.in
    write_environment_line ZOHO_SMTP_PASSWORD ""
    write_environment_line NODEZUNO_STABLECOIN_PAYMENT_MODE disabled
    write_environment_line NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON ""
    write_environment_line NODEZUNO_PAYMENT_CONFIRMATIONS 12
    write_environment_line NODEZUNO_ALLOW_ETHEREUM_HTTP_LOOPBACK false
    write_environment_line CLOUDFLARE_ACCOUNT_ID ""
    write_environment_line CLOUDFLARE_D1_DATABASE_ID ""
    write_environment_line CLOUDFLARE_D1_API_TOKEN ""
    write_environment_line CF_ACCESS_TEAM_DOMAIN ""
    write_environment_line CF_ACCESS_AUDIENCE ""
    write_environment_line NEXT_TELEMETRY_DISABLED 1
    write_environment_line NODEZUNO_NODE_BIN "$node_binary"
    write_environment_line NODEZUNO_PNPM_BIN "$pnpm_binary"
  } >"$temporary_file"
  mv "$temporary_file" "$environment_file"
  chmod 600 "$environment_file"
}

upgrade_existing_environment() {
  local environment_file="$1"
  local temporary_file
  temporary_file="$(mktemp "$NODEZUNO_LOCAL_ROOT/config/.nodezuno.env.XXXXXX")"
  chmod 600 "$temporary_file"
  cp "$environment_file" "$temporary_file"
  if ! grep -q '^REVIEW_CAPABILITY_SECRET=' "$temporary_file"; then
    write_environment_line REVIEW_CAPABILITY_SECRET "$(openssl rand -hex 32)" >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_STABLECOIN_PAYMENT_MODE=' "$temporary_file"; then
    write_environment_line NODEZUNO_STABLECOIN_PAYMENT_MODE disabled >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=' "$temporary_file"; then
    write_environment_line NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON "" >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_PAYMENT_CONFIRMATIONS=' "$temporary_file"; then
    write_environment_line NODEZUNO_PAYMENT_CONFIRMATIONS 12 >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=' "$temporary_file"; then
    write_environment_line NODEZUNO_ALLOW_CONTRACT_MIGRATIONS false >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_LEGAL_LAUNCH_APPROVED=' "$temporary_file"; then
    write_environment_line NODEZUNO_LEGAL_LAUNCH_APPROVED false >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_PUBLIC_INDEXING=' "$temporary_file"; then
    write_environment_line NODEZUNO_PUBLIC_INDEXING false >>"$temporary_file"
  fi
  if ! grep -q '^NODEZUNO_DOMAIN=' "$temporary_file"; then
    write_environment_line NODEZUNO_DOMAIN localhost >>"$temporary_file"
  fi
  if ! grep -q '^ZOHO_SMTP_HOST=' "$temporary_file"; then
    write_environment_line ZOHO_SMTP_HOST smtp.zoho.in >>"$temporary_file"
  fi
  if ! grep -q '^ZOHO_SMTP_PASSWORD=' "$temporary_file"; then
    write_environment_line ZOHO_SMTP_PASSWORD "" >>"$temporary_file"
  fi
  sed -i '' -e '/^RESEND_API_KEY=/d' -e '/^RESEND_WEBHOOK_SECRET=/d' \
    -e '/^AUTH_EMAIL_FROM=/d' -e '/^NODEZUNO_REVIEW_EMAIL=/d' "$temporary_file"
  mv "$temporary_file" "$environment_file"
  chmod 600 "$environment_file"
}

render_launch_agent() {
  local node_binary="$1"
  local destination
  local temporary_plist
  destination="$(nodezuno_plist_file)"
  temporary_plist="$(mktemp "$NODEZUNO_LAUNCH_AGENTS_DIR/.nodezuno.plist.XXXXXX")"
  "$node_binary" -e '
    const fs = require("node:fs");
    const [source, destination, runner, root, stdout, stderr] = process.argv.slice(1);
    const escapeXml = (value) => value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("\x27", "&apos;");
    const replacements = new Map([
      ["@@RUNNER_PATH@@", runner],
      ["@@RUNTIME_ROOT@@", root],
      ["@@STDOUT_PATH@@", stdout],
      ["@@STDERR_PATH@@", stderr],
    ]);
    let template = fs.readFileSync(source, "utf8");
    for (const [token, value] of replacements) {
      template = template.replaceAll(token, escapeXml(value));
    }
    fs.writeFileSync(destination, template, { mode: 0o600 });
  ' \
    "$SCRIPT_DIR/com.nodezuno.web.plist.template" \
    "$temporary_plist" \
    "$NODEZUNO_LOCAL_ROOT/bin/run-web" \
    "$NODEZUNO_LOCAL_ROOT" \
    "$NODEZUNO_LOCAL_ROOT/logs/web.stdout.log" \
    "$NODEZUNO_LOCAL_ROOT/logs/web.stderr.log"
  plutil -lint "$temporary_plist" >/dev/null
  mv "$temporary_plist" "$destination"
  chmod 600 "$destination"
}

render_email_worker_launch_agent() {
  local node_binary="$1"
  local destination
  local temporary_plist
  destination="$(nodezuno_email_worker_plist_file)"
  temporary_plist="$(mktemp "$NODEZUNO_LAUNCH_AGENTS_DIR/.nodezuno-email-worker.plist.XXXXXX")"
  "$node_binary" -e '
    const fs = require("node:fs");
    const [source, destination, runner, root, stdout, stderr] = process.argv.slice(1);
    const escapeXml = (value) => value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("\x27", "&apos;");
    const replacements = new Map([
      ["@@RUNNER_PATH@@", runner],
      ["@@RUNTIME_ROOT@@", root],
      ["@@STDOUT_PATH@@", stdout],
      ["@@STDERR_PATH@@", stderr],
    ]);
    let template = fs.readFileSync(source, "utf8");
    for (const [token, value] of replacements) {
      template = template.replaceAll(token, escapeXml(value));
    }
    fs.writeFileSync(destination, template, { mode: 0o600 });
  ' \
    "$SCRIPT_DIR/com.nodezuno.email-worker.plist.template" \
    "$temporary_plist" \
    "$NODEZUNO_LOCAL_ROOT/bin/run-email-worker" \
    "$NODEZUNO_LOCAL_ROOT" \
    "$NODEZUNO_LOCAL_ROOT/logs/email-worker.stdout.log" \
    "$NODEZUNO_LOCAL_ROOT/logs/email-worker.stderr.log"
  plutil -lint "$temporary_plist" >/dev/null
  mv "$temporary_plist" "$destination"
  chmod 600 "$destination"
}

render_payment_worker_launch_agent() {
  local node_binary="$1"
  local destination
  local temporary_plist
  destination="$(nodezuno_payment_worker_plist_file)"
  temporary_plist="$(mktemp "$NODEZUNO_LAUNCH_AGENTS_DIR/.nodezuno-payment-worker.plist.XXXXXX")"
  "$node_binary" -e '
    const fs = require("node:fs");
    const [source, destination, runner, root, stdout, stderr] = process.argv.slice(1);
    const escapeXml = (value) => value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("\x27", "&apos;");
    const replacements = new Map([
      ["@@RUNNER_PATH@@", runner],
      ["@@RUNTIME_ROOT@@", root],
      ["@@STDOUT_PATH@@", stdout],
      ["@@STDERR_PATH@@", stderr],
    ]);
    let template = fs.readFileSync(source, "utf8");
    for (const [token, value] of replacements) {
      template = template.replaceAll(token, escapeXml(value));
    }
    fs.writeFileSync(destination, template, { mode: 0o600 });
  ' \
    "$SCRIPT_DIR/com.nodezuno.payment-worker.plist.template" \
    "$temporary_plist" \
    "$NODEZUNO_LOCAL_ROOT/bin/run-payment-worker" \
    "$NODEZUNO_LOCAL_ROOT" \
    "$NODEZUNO_LOCAL_ROOT/logs/payment-worker.stdout.log" \
    "$NODEZUNO_LOCAL_ROOT/logs/payment-worker.stderr.log"
  plutil -lint "$temporary_plist" >/dev/null
  mv "$temporary_plist" "$destination"
  chmod 600 "$destination"
}

nodezuno_require_command openssl
nodezuno_require_command plutil
nodezuno_require_command install
[[ -x /usr/bin/lockf ]] || nodezuno_die "macOS /usr/bin/lockf is required."
nodezuno_ensure_layout

environment_file="$(nodezuno_env_file)"
if [[ -e "$environment_file" ]]; then
  nodezuno_assert_private_environment
  nodezuno_load_environment
  upgrade_existing_environment "$environment_file"
  nodezuno_load_environment
  node_binary="$(nodezuno_find_node "${NODEZUNO_NODE_BIN:-}")"
  pnpm_binary="$(nodezuno_find_pnpm "${NODEZUNO_PNPM_BIN:-}")"
  nodezuno_note "Existing owner-only environment preserved."
else
  validate_admin_emails "$admin_emails"
  [[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || \
    nodezuno_die "Port must be an integer from 1024 to 65535."
  node_binary="$(nodezuno_find_node "$node_request")"
  pnpm_binary="$(nodezuno_find_pnpm "$pnpm_request")"
  nodezuno_assert_node_version "$node_binary"
  PATH="$(dirname "$node_binary"):/usr/bin:/bin:/usr/sbin:/sbin" \
    "$pnpm_binary" --version | grep -Fx '11.9.0' >/dev/null || \
    nodezuno_die "pnpm 11.9.0 is required by the committed package manager contract."
  create_environment "$environment_file" "$node_binary" "$pnpm_binary"
  nodezuno_note "Created owner-only environment without printing secrets."
fi

nodezuno_assert_node_version "$node_binary"
install -m 700 "$SCRIPT_DIR/run-web.sh" "$NODEZUNO_LOCAL_ROOT/bin/run-web"
nodezuno_install_worker_runners
render_launch_agent "$node_binary"
render_email_worker_launch_agent "$node_binary"
render_payment_worker_launch_agent "$node_binary"
nodezuno_note "Installed launchd definition: $(nodezuno_plist_file)"

if [[ "$prepare_only" = true ]]; then
  nodezuno_note "Preparation complete. No build or service start was requested."
  exit 0
fi

if [[ "$start_after_deploy" = false ]]; then
  bash "$SCRIPT_DIR/deploy.sh" --no-start
else
  bash "$SCRIPT_DIR/deploy.sh"
fi
