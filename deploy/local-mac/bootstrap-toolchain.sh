#!/bin/bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1
  pwd -P
)"
# shellcheck source=_common.sh
. "$SCRIPT_DIR/_common.sh"

NODE_VERSION="24.14.0"
PNPM_VERSION="11.9.0"
NODE_ARM64_SHA256="a1a54f46a750d2523d628d924aab61758a51c9dad3e0238beb14141be9615dd3"
NODE_X64_SHA256="f2879eb810e25993a0578e5d878930266fd2eafcffe9f2839b3d8db354d4879e"
PNPM_SHA256="2b567aa66026238078ac2e0a33bec3febd60e962987aac697456f3180819b287"

usage() {
  printf '%s\n' \
    "Usage: bash deploy/local-mac/bootstrap-toolchain.sh" \
    "" \
    "Downloads the pinned official Node.js macOS archive, verifies its" \
    "hard-coded SHA-256 digest, and installs pnpm into the private" \
    "Nodezuno runtime directory. Nothing is installed system-wide."
}

if (( $# > 0 )); then
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
fi

[[ "$(uname -s)" = "Darwin" ]] || \
  nodezuno_die "The pinned toolchain bootstrap supports macOS only."
nodezuno_require_command curl
nodezuno_require_command shasum
nodezuno_require_command tar
nodezuno_ensure_layout

architecture="$(uname -m)"
case "$architecture" in
  arm64)
    distribution_architecture="arm64"
    expected_sha256="$NODE_ARM64_SHA256"
    ;;
  x86_64)
    distribution_architecture="x64"
    expected_sha256="$NODE_X64_SHA256"
    ;;
  *)
    nodezuno_die "Unsupported Mac architecture: $architecture"
    ;;
esac

archive_name="node-v${NODE_VERSION}-darwin-${distribution_architecture}.tar.gz"
distribution_name="${archive_name%.tar.gz}"
toolchains="$NODEZUNO_LOCAL_ROOT/toolchains"
node_directory="$toolchains/$distribution_name"
pnpm_directory="$toolchains/pnpm-$PNPM_VERSION"
download_directory="$NODEZUNO_LOCAL_ROOT/tmp/toolchain-$$"
archive_path="$download_directory/$archive_name"
pnpm_archive="$download_directory/pnpm-$PNPM_VERSION.tgz"

cleanup() {
  rm -rf "$download_directory"
}
trap cleanup EXIT INT TERM

if [[ -e "$node_directory" && ! -x "$node_directory/bin/node" ]]; then
  nodezuno_die "Pinned Node.js directory exists but is incomplete. Move it aside and retry."
fi
if [[ ! -x "$node_directory/bin/node" ]]; then
  mkdir -p "$download_directory"
  chmod 700 "$download_directory"
  nodezuno_note "Downloading official Node.js v$NODE_VERSION for macOS $distribution_architecture."
  curl \
    --fail \
    --location \
    --proto '=https' \
    --retry 3 \
    --show-error \
    --silent \
    --tlsv1.2 \
    "https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}" \
    --output "$archive_path"

  actual_sha256="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  [[ "$actual_sha256" = "$expected_sha256" ]] || \
    nodezuno_die "The downloaded Node.js archive failed SHA-256 verification."

  tar -xzf "$archive_path" -C "$download_directory"
  [[ -x "$download_directory/$distribution_name/bin/node" ]] || \
    nodezuno_die "The verified Node.js archive has an unexpected layout."
  mv "$download_directory/$distribution_name" "$node_directory"
  chmod -R go-rwx "$node_directory"
else
  nodezuno_note "Pinned Node.js v$NODE_VERSION is already installed."
fi

node_binary="$node_directory/bin/node"
[[ "$("$node_binary" --version)" = "v$NODE_VERSION" ]] || \
  nodezuno_die "Pinned Node.js directory contains an unexpected version."
nodezuno_assert_node_version "$node_binary"

if [[ -e "$pnpm_directory" && ! -x "$pnpm_directory/bin/pnpm" ]]; then
  nodezuno_die "Pinned pnpm directory exists but is incomplete. Move it aside and retry."
fi
if [[ ! -x "$pnpm_directory/bin/pnpm" ]]; then
  mkdir -p "$download_directory"
  chmod 700 "$download_directory"
  nodezuno_note "Downloading and verifying pinned pnpm $PNPM_VERSION."
  curl \
    --fail \
    --location \
    --proto '=https' \
    --retry 3 \
    --show-error \
    --silent \
    --tlsv1.2 \
    "https://registry.npmjs.org/pnpm/-/pnpm-${PNPM_VERSION}.tgz" \
    --output "$pnpm_archive"
  actual_pnpm_sha256="$(shasum -a 256 "$pnpm_archive" | awk '{print $1}')"
  [[ "$actual_pnpm_sha256" = "$PNPM_SHA256" ]] || \
    nodezuno_die "The downloaded pnpm archive failed SHA-256 verification."

  nodezuno_note "Installing verified pnpm $PNPM_VERSION into the private toolchain."
  PATH="$node_directory/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
    "$node_directory/bin/npm" install \
      --global \
      --ignore-scripts \
      --no-audit \
      --no-fund \
      --package-lock=false \
      --prefix "$pnpm_directory" \
      "$pnpm_archive"
  chmod -R go-rwx "$pnpm_directory"
else
  nodezuno_note "Pinned pnpm $PNPM_VERSION is already installed."
fi

PATH="$node_directory/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  "$pnpm_directory/bin/pnpm" --version | \
  grep -Fx "$PNPM_VERSION" >/dev/null || \
  nodezuno_die "The private pnpm installation failed version verification."

ln -sfn "$node_directory" "$toolchains/node-current"
ln -sfn "$pnpm_directory" "$toolchains/pnpm-current"

nodezuno_note "Private Nodezuno toolchain ready."
nodezuno_note "Node.js: $node_binary"
nodezuno_note "pnpm: $pnpm_directory/bin/pnpm"
