#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_command curl
require_command shasum
require_command tar
require_command awk

[ "$(uname -s)" = 'Darwin' ] || die "this pinned installer supports macOS only"
[ "$(uname -m)" = 'arm64' ] || die "this pinned installer supports Apple Silicon only"
[ "$#" -le 1 ] || die "usage: ./install.sh [verified-archive-path]"

ensure_runtime_directories

if [ -x "$HELIOS_BIN" ] && [ ! -L "$HELIOS_BIN" ]; then
  current_hash=$(sha256_file "$HELIOS_BIN")
  if [ "$current_hash" = "$HELIOS_BINARY_SHA256" ]; then
    printf 'Helios %s is already installed and verified at %s\n' "$HELIOS_VERSION" "$HELIOS_BIN"
    exit 0
  fi
  die "an unexpected binary already exists at $HELIOS_BIN"
fi

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/nodezuno-helios-install.XXXXXX")
archive="$work_dir/$HELIOS_ASSET"
extract_dir="$work_dir/extract"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$extract_dir"
chmod 0700 "$work_dir" "$extract_dir"

if [ "$#" -eq 1 ]; then
  source_archive=$1
  [ -f "$source_archive" ] || die "archive does not exist: $source_archive"
  [ ! -L "$source_archive" ] || die "archive cannot be a symbolic link"
  cp "$source_archive" "$archive"
else
  curl \
    --proto '=https' \
    --tlsv1.2 \
    --fail \
    --location \
    --silent \
    --show-error \
    --retry 3 \
    --retry-all-errors \
    --connect-timeout 15 \
    --max-time 300 \
    --output "$archive" \
    "$HELIOS_DOWNLOAD_URL"
fi

actual_size=$(file_size "$archive")
[ "$actual_size" = "$HELIOS_ARCHIVE_SIZE" ] ||
  die "release archive size mismatch: expected $HELIOS_ARCHIVE_SIZE, received $actual_size"

actual_archive_hash=$(sha256_file "$archive")
[ "$actual_archive_hash" = "$HELIOS_ARCHIVE_SHA256" ] ||
  die "release archive SHA-256 mismatch"

archive_members=$(tar -tzf "$archive")
[ "$archive_members" = 'helios' ] || die "release archive contains an unexpected file layout"
tar -xzf "$archive" -C "$extract_dir"

[ -f "$extract_dir/helios" ] || die "release archive does not contain the Helios binary"
[ ! -L "$extract_dir/helios" ] || die "release archive contains a symbolic link"
chmod 0755 "$extract_dir/helios"

actual_binary_hash=$(sha256_file "$extract_dir/helios")
[ "$actual_binary_hash" = "$HELIOS_BINARY_SHA256" ] ||
  die "extracted Helios binary SHA-256 mismatch"

actual_version=$("$extract_dir/helios" --version 2>/dev/null || true)
[ "$actual_version" = "helios-cli $HELIOS_VERSION" ] ||
  die "release binary reported an unexpected version"

mv "$extract_dir/helios" "$HELIOS_BIN"
chmod 0755 "$HELIOS_BIN"

printf 'Installed and verified Helios %s at %s\n' "$HELIOS_VERSION" "$HELIOS_BIN"
printf 'Archive SHA-256: %s\n' "$HELIOS_ARCHIVE_SHA256"
printf 'Binary SHA-256: %s\n' "$HELIOS_BINARY_SHA256"
