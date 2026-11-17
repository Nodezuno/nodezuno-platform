#!/usr/bin/env bash
set -Eeuo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/nodezuno-aws-common.sh"

memory_used_percent="$(free --bytes | awk '/^Mem:/ { printf "%.2f", (($2-$7)/$2)*100 }')"
disk_used_percent="$(df --output=pcent /opt/nodezuno | tail -n 1 | tr -cd '0-9')"
root_disk_used_percent="$(df --output=pcent / | tail -n 1 | tr -cd '0-9')"
data_inode_used_percent="$(df --output=ipcent /opt/nodezuno | tail -n 1 | tr -cd '0-9')"
swap_used_percent="$(free --bytes | awk '/^Swap:/ { if ($2 == 0) print "0.00"; else printf "%.2f", ($3/$2)*100 }')"
backup_age_hours=999
if [[ -f /opt/nodezuno/last-backup-success ]]; then
  backup_timestamp="$(stat --format=%Y /opt/nodezuno/last-backup-success)"
  backup_age_hours="$(( ($(date +%s) - backup_timestamp) / 3600 ))"
fi
readiness=0
if nodezuno_compose exec -T nodezuno node -e \
  "fetch('http://127.0.0.1:3000/api/v1/ready',{signal:AbortSignal.timeout(4000)}).then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
  >/dev/null 2>&1; then
  readiness=1
fi

background_scheduler_healthy=0
if systemctl is-enabled --quiet nodezuno-email-worker.timer &&
  systemctl is-active --quiet nodezuno-email-worker.timer &&
  systemctl is-enabled --quiet nodezuno-payment-worker.timer &&
  systemctl is-active --quiet nodezuno-payment-worker.timer; then
  background_scheduler_healthy=1
fi

worker_heartbeat_age_seconds() {
  local heartbeat_file="$1"
  local heartbeat_timestamp
  local now
  if [[ ! -f "$heartbeat_file" ]]; then
    printf '999999\n'
    return
  fi
  heartbeat_timestamp="$(stat --format=%Y "$heartbeat_file")"
  now="$(date +%s)"
  if (( heartbeat_timestamp > now )); then
    printf '0\n'
  else
    printf '%s\n' "$(( now - heartbeat_timestamp ))"
  fi
}

email_worker_age_seconds="$(worker_heartbeat_age_seconds \
  /opt/nodezuno/worker-health/email-worker.last-success)"
payment_worker_age_seconds="$(worker_heartbeat_age_seconds \
  /opt/nodezuno/worker-health/payment-worker.last-success)"
background_workers_healthy=0
if (( background_scheduler_healthy == 1 )) &&
  (( email_worker_age_seconds <= 300 )) &&
  (( payment_worker_age_seconds <= 300 )); then
  background_workers_healthy=1
fi

payment_verifier_healthy=0
payment_verifier_age_seconds=999999
payment_pending_claims=999999
payment_oldest_claim_age_seconds=999999
payment_manual_review_count=999999
notification_failed_count=999999
notification_oldest_unresolved_age_seconds=999999
database_size_bytes=""
database_wal_size_bytes=""
payment_metrics="$(nodezuno_compose exec -T nodezuno node -e '
  const { DatabaseSync } = require("node:sqlite");
  const { statSync } = require("node:fs");
  const database = new DatabaseSync(process.env.NODEZUNO_SQLITE_PATH, { readOnly: true });
  const now = Date.now();
  const enabled = process.env.NODEZUNO_STABLECOIN_PAYMENT_MODE === "ethereum_mainnet";
  const health = database.prepare("SELECT state, checked_at AS checkedAt FROM payment_verifier_health WHERE id = 1").get();
  const claims = database.prepare("SELECT COUNT(*) AS pending, MIN(created_at) AS oldest FROM review_stablecoin_payment_claims WHERE state IN (?,?,?)").get("submitted", "checking", "confirming");
  const manual = database.prepare("SELECT COUNT(*) AS count FROM review_stablecoin_payment_claims WHERE state = ?").get("manual_review");
  const notifications = database.prepare("SELECT SUM(CASE WHEN state = ? THEN 1 ELSE 0 END) AS failed, MIN(CASE WHEN state IN (?,?,?) THEN created_at ELSE NULL END) AS oldest FROM notification_outbox").get("failed", "pending", "processing", "accepted");
  const healthy = !enabled || (health?.state === "healthy" && health.checkedAt >= now - 150000) ? 1 : 0;
  const healthAge = !enabled ? 0 : health ? Math.max(0, Math.floor((now - health.checkedAt) / 1000)) : 999999;
  const oldestAge = claims?.oldest ? Math.max(0, Math.floor((now - claims.oldest) / 1000)) : 0;
  const notificationOldestAge = notifications?.oldest ? Math.max(0, Math.floor((now - notifications.oldest) / 1000)) : 0;
  const databaseBytes = statSync(process.env.NODEZUNO_SQLITE_PATH).size;
  let walBytes = 0;
  try { walBytes = statSync(`${process.env.NODEZUNO_SQLITE_PATH}-wal`).size; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  process.stdout.write([healthy, healthAge, Number(claims?.pending ?? 0), oldestAge, Number(manual?.count ?? 0), Number(notifications?.failed ?? 0), notificationOldestAge, databaseBytes, walBytes].join(" "));
  database.close();
' 2>/dev/null || true)"
if [[ "$payment_metrics" =~ ^[0-9]+\ [0-9]+\ [0-9]+\ [0-9]+\ [0-9]+\ [0-9]+\ [0-9]+\ [0-9]+\ [0-9]+$ ]]; then
  read -r payment_verifier_healthy payment_verifier_age_seconds \
    payment_pending_claims payment_oldest_claim_age_seconds \
    payment_manual_review_count notification_failed_count \
    notification_oldest_unresolved_age_seconds database_size_bytes \
    database_wal_size_bytes <<< "$payment_metrics"
fi

nodezuno_publish_metric MemoryUsedPercent "$memory_used_percent" Percent
nodezuno_publish_metric DiskUsedPercent "$disk_used_percent" Percent
nodezuno_publish_metric RootDiskUsedPercent "$root_disk_used_percent" Percent
if [[ "$data_inode_used_percent" =~ ^[0-9]+$ ]]; then
  nodezuno_publish_metric DataInodeUsedPercent "$data_inode_used_percent" Percent
fi
if [[ -n "$database_size_bytes" && -n "$database_wal_size_bytes" ]]; then
  nodezuno_publish_metric DatabaseSizeBytes "$database_size_bytes" Bytes
  nodezuno_publish_metric DatabaseWalSizeBytes "$database_wal_size_bytes" Bytes
fi
nodezuno_publish_metric SwapUsedPercent "$swap_used_percent" Percent
nodezuno_publish_metric BackupAgeHours "$backup_age_hours" Count
nodezuno_publish_metric Readiness "$readiness" Count
nodezuno_publish_metric BackgroundWorkersHealthy "$background_workers_healthy" Count
nodezuno_publish_metric PaymentVerifierHealthy "$payment_verifier_healthy" Count
nodezuno_publish_metric PaymentVerifierAgeSeconds "$payment_verifier_age_seconds" Seconds
nodezuno_publish_metric PaymentPendingClaims "$payment_pending_claims" Count
nodezuno_publish_metric PaymentOldestClaimAgeSeconds "$payment_oldest_claim_age_seconds" Seconds
nodezuno_publish_metric PaymentManualReviewCount "$payment_manual_review_count" Count
nodezuno_publish_metric NotificationFailedCount "$notification_failed_count" Count
nodezuno_publish_metric NotificationOldestUnresolvedAgeSeconds "$notification_oldest_unresolved_age_seconds" Seconds
