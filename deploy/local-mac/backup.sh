#!/bin/bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

nodezuno_ensure_layout
nodezuno_load_environment
release="$(nodezuno_require_current_release)"
node_binary="$(nodezuno_find_node "${NODEZUNO_NODE_BIN:-}")"
database="${NODEZUNO_SQLITE_PATH:-}"
[[ -f "$database" && ! -L "$database" ]] || \
  nodezuno_die "The SQLite database is not initialized."

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$NODEZUNO_LOCAL_ROOT/backups/nodezuno-$timestamp-$$.sqlite"

(
  cd "$release"
  "$node_binary" scripts/backup-sqlite.mjs create "$destination"
  "$node_binary" scripts/backup-sqlite.mjs verify "$destination"
)
chmod 600 "$destination" "$destination.manifest.json"
nodezuno_note "Verified SQLite backup: $destination"
