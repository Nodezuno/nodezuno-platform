#!/bin/bash

set -euo pipefail
umask 027

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

start_after_deploy=true
if (( $# > 1 )); then
  nodezuno_die "deploy.sh accepts only --no-start."
fi
if (( $# == 1 )); then
  [[ "$1" = "--no-start" ]] || nodezuno_die "Unknown deploy option: $1"
  start_after_deploy=false
fi

nodezuno_ensure_layout
nodezuno_load_environment
if [[ "${NODEZUNO_ALLOW_CONTRACT_MIGRATIONS:-false}" = true ]]; then
  nodezuno_die "The standard deployment path refuses contract migrations. Keep NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=false and follow docs/MIGRATIONS.md for an approved maintenance cutover."
fi
node_binary="$(nodezuno_find_node "${NODEZUNO_NODE_BIN:-}")"
pnpm_binary="$(nodezuno_find_pnpm "${NODEZUNO_PNPM_BIN:-}")"
nodezuno_assert_node_version "$node_binary"
PATH="$(dirname "$node_binary"):/usr/bin:/bin:/usr/sbin:/sbin" \
  "$pnpm_binary" --version | grep -Fx '11.9.0' >/dev/null || \
  nodezuno_die "pnpm 11.9.0 is required by the committed package manager contract."

nodezuno_acquire_lock deploy
lock_file="$NODEZUNO_HELD_LOCK_FILE"
staging_directory=""
cleanup() {
  if [[ -n "$staging_directory" ]]; then
    case "$staging_directory" in
      "$NODEZUNO_LOCAL_ROOT/releases/.staging-"*)
        rm -rf "$staging_directory"
        ;;
    esac
  fi
  nodezuno_release_lock "$lock_file"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

build_path="$(dirname "$node_binary"):/usr/bin:/bin:/usr/sbin:/sbin"
nodezuno_note "Installing the locked application dependencies."
env -i \
  CI=1 \
  HOME="$HOME" \
  PATH="$build_path" \
  TMPDIR="${TMPDIR:-/tmp}" \
  "$pnpm_binary" --dir "$NODEZUNO_PROJECT_ROOT" install --frozen-lockfile

nodezuno_note "Building a Next.js standalone production release without runtime secrets."
env -i \
  CI=1 \
  HOME="$HOME" \
  NEXT_TELEMETRY_DISABLED=1 \
  NODEZUNO_RUNTIME=container \
  PATH="$build_path" \
  TMPDIR="${TMPDIR:-/tmp}" \
  "$pnpm_binary" --dir "$NODEZUNO_PROJECT_ROOT" run build:container

standalone="$NODEZUNO_PROJECT_ROOT/.next/standalone"
static_assets="$NODEZUNO_PROJECT_ROOT/.next/static"
[[ -f "$standalone/server.js" && -d "$static_assets" ]] || \
  nodezuno_die "The standalone build did not produce the required server artifact."

commit="$(
  git -C "$NODEZUNO_PROJECT_ROOT" rev-parse --short=12 HEAD 2>/dev/null || \
    printf 'unversioned'
)"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$commit-$$"
staging_directory="$NODEZUNO_LOCAL_ROOT/releases/.staging-$release_id"
release_directory="$NODEZUNO_LOCAL_ROOT/releases/$release_id"
mkdir "$staging_directory"
chmod 700 "$staging_directory"

cp -R "$standalone/." "$staging_directory/"
mkdir -p "$staging_directory/.next"
cp -R "$static_assets" "$staging_directory/.next/static"
if [[ -d "$NODEZUNO_PROJECT_ROOT/public" ]]; then
  cp -R "$NODEZUNO_PROJECT_ROOT/public" "$staging_directory/public"
fi
cp -R "$NODEZUNO_PROJECT_ROOT/drizzle" "$staging_directory/drizzle"
mkdir -p "$staging_directory/scripts" "$staging_directory/lib/server"
for script in \
  backup-sqlite.mjs \
  migrate-container.mjs \
  migrate-d1-rest.mjs \
  migrate-sqlite.mjs \
  process-notification-outbox.mjs \
  process-stablecoin-payments.mjs \
  preflight-control-plane.mjs \
  preflight-stablecoin-payments.mjs \
  preflight-node-attachments.mjs \
  restore-sqlite.mjs; do
  cp "$NODEZUNO_PROJECT_ROOT/scripts/$script" \
    "$staging_directory/scripts/$script"
done
cp -R "$NODEZUNO_PROJECT_ROOT/lib/server/." \
  "$staging_directory/lib/server/"
cp "$NODEZUNO_PROJECT_ROOT/lib/review-targets.ts" \
  "$staging_directory/lib/review-targets.ts"
cp "$NODEZUNO_PROJECT_ROOT/lib/review-policy.ts" \
  "$staging_directory/lib/review-policy.ts"
for server_module in \
  crypto.ts \
  ethereum-rpc.ts \
  http.ts \
  rpc-node-preflight.ts \
  runtime-config.ts; do
  cp "$NODEZUNO_PROJECT_ROOT/lib/server/$server_module" \
    "$staging_directory/lib/server/$server_module"
done
chmod -R go-rwx "$staging_directory"

nodezuno_note "Validating control-plane configuration and reporting public indexing state."
(
  cd "$staging_directory"
  "$node_binary" scripts/preflight-control-plane.mjs
)

if [[ "${NODEZUNO_STABLECOIN_PAYMENT_MODE:-disabled}" = "ethereum_mainnet" ]]; then
  nodezuno_note "Verifying the configured Ethereum payment evidence endpoints."
  (
    cd "$staging_directory"
    "$node_binary" scripts/preflight-stablecoin-payments.mjs
  )
fi

if [[ -n "${NODEZUNO_RPC_UPSTREAMS_JSON:-}" ]]; then
  nodezuno_note "Verifying the configured Ethereum attachment before release."
  (
    cd "$staging_directory"
    "$node_binary" scripts/preflight-node-attachments.mjs ethereum
  )
fi

database="${NODEZUNO_SQLITE_PATH:-}"
if [[ -f "$database" && ! -L "$database" && -s "$database" ]]; then
  backup="$NODEZUNO_LOCAL_ROOT/backups/predeploy-$release_id.sqlite"
  nodezuno_note "Creating and verifying the pre-deployment SQLite backup."
  (
    cd "$staging_directory"
    "$node_binary" scripts/backup-sqlite.mjs create "$backup"
    "$node_binary" scripts/backup-sqlite.mjs verify "$backup"
  )
  chmod 600 "$backup" "$backup.manifest.json"
fi

service_was_loaded=false
if nodezuno_service_is_loaded || nodezuno_payment_worker_is_loaded || nodezuno_email_worker_is_loaded; then
  service_was_loaded=true
fi
# Workers can still be loaded when the web service is down.
bash "$SCRIPT_DIR/stop.sh"
if ! nodezuno_install_worker_runners; then
  if [[ "$service_was_loaded" = true ]]; then
    if ! bash "$SCRIPT_DIR/start.sh"; then
      nodezuno_die "Worker runner installation failed. The previous release remains selected but is NOT healthy. Operator recovery is required."
    fi
  fi
  nodezuno_die "Worker runner installation failed before migration. The previous release remains selected."
fi

nodezuno_note "Applying durable SQLite migrations."
if ! (
  cd "$staging_directory"
  "$node_binary" scripts/migrate-container.mjs
); then
  if [[ "$service_was_loaded" = true ]]; then
    bash "$SCRIPT_DIR/start.sh" || true
  fi
  nodezuno_die "Database migration failed. The previous release remains active."
fi

previous_release="$(nodezuno_current_release 2>/dev/null || true)"
mv "$staging_directory" "$release_directory"
staging_directory=""

switch_link="$NODEZUNO_LOCAL_ROOT/tmp/current-$release_id"
"$node_binary" -e '
  const fs = require("node:fs");
  const [target, temporary, current] = process.argv.slice(1);
  fs.symlinkSync(target, temporary);
  fs.renameSync(temporary, current);
' "$release_directory" "$switch_link" "$NODEZUNO_LOCAL_ROOT/current"

if [[ "$start_after_deploy" = true ]]; then
  if ! bash "$SCRIPT_DIR/start.sh"; then
    bash "$SCRIPT_DIR/stop.sh" || true
    if [[ -n "$previous_release" && -d "$previous_release" ]]; then
      rollback_link="$NODEZUNO_LOCAL_ROOT/tmp/rollback-$release_id"
      "$node_binary" -e '
        const fs = require("node:fs");
        const [target, temporary, current] = process.argv.slice(1);
        fs.symlinkSync(target, temporary);
        fs.renameSync(temporary, current);
      ' "$previous_release" "$rollback_link" "$NODEZUNO_LOCAL_ROOT/current"
      if ! bash "$SCRIPT_DIR/start.sh"; then
        nodezuno_die "The new release failed. The previous release was selected but is NOT healthy. Operator recovery is required."
      fi
    fi
    if [[ -n "$previous_release" && -d "$previous_release" ]]; then
      nodezuno_die "The new release failed health checks and the app release was rolled back."
    fi
    nodezuno_die "The first release failed health checks and was stopped."
  fi
else
  nodezuno_note "Release installed and migrated. Service start was skipped."
fi

nodezuno_note "Active release: $release_id"
