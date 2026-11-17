#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/nodezuno-aws-common.sh"

label="${1:-scheduled}"
if [[ ! "$label" =~ ^[a-z0-9-]{1,32}$ ]]; then
  printf 'Backup label must use lowercase letters, numbers, and hyphens only.\n' >&2
  exit 64
fi

exec 9>/run/lock/nodezuno-backup.lock
flock --exclusive --nonblock 9 || {
  printf 'Another Nodezuno backup is already running.\n' >&2
  exit 75
}

backup_root=/opt/nodezuno/backups
database=/opt/nodezuno/data/nodezuno.sqlite
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
filename="nodezuno-${timestamp}-${label}.sqlite"
host_path="${backup_root}/${filename}"
container_path="/var/backups/nodezuno/${filename}"
bucket="${NODEZUNO_BACKUP_BUCKET:?NODEZUNO_BACKUP_BUCKET is required}"
prefix="${NODEZUNO_BACKUP_PREFIX:-production}"

publish_failure() {
  nodezuno_publish_metric BackupSuccess 0 Count || true
}
trap publish_failure ERR

if [[ ! -s "$database" ]]; then
  printf 'No initialized Nodezuno database exists yet; no backup was created.\n'
  exit 0
fi

mkdir --parents "$backup_root"
chmod 0700 "$backup_root"

nodezuno_compose run --rm --no-deps backup create "$container_path"
nodezuno_compose run --rm --no-deps backup verify "$container_path"

chmod 0600 "$host_path" "${host_path}.manifest.json"

aws s3 cp "$host_path" \
  "s3://${bucket}/${prefix}/${filename}" \
  --checksum-algorithm SHA256 \
  --only-show-errors \
  --server-side-encryption AES256 \
  --region "$AWS_REGION"
aws s3 cp "${host_path}.manifest.json" \
  "s3://${bucket}/${prefix}/${filename}.manifest.json" \
  --checksum-algorithm SHA256 \
  --only-show-errors \
  --server-side-encryption AES256 \
  --region "$AWS_REGION"

find "$backup_root" -type f \
  \( -name 'nodezuno-*.sqlite' -o -name 'nodezuno-*.sqlite.manifest.json' \) \
  -mtime +7 -delete

trap - ERR
touch /opt/nodezuno/last-backup-success
chmod 0600 /opt/nodezuno/last-backup-success
nodezuno_publish_metric BackupSuccess 1 Count
printf 'Locally verified backup uploaded: s3://%s/%s/%s\n' \
  "$bucket" "$prefix" "$filename"
