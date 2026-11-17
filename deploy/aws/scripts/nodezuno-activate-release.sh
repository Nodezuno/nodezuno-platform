#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

bundle_input="${1:-}"
image="${2:-}"
bundle_root=/opt/nodezuno/releases/host
current_link=/opt/nodezuno/host-current
runtime_file=/opt/nodezuno/runtime.env
secret_file=/opt/nodezuno/config/.env.production
email_secret_file=/opt/nodezuno/config/.env.email-worker
payment_secret_file=/opt/nodezuno/config/.env.payment-worker
current_image_marker=/opt/nodezuno/releases/current-image
previous_image_marker=/opt/nodezuno/releases/previous-image
previous_runtime=""
previous_secret=""
previous_email_secret=""
previous_payment_secret=""
previous_current_image_marker=""
previous_previous_image_marker=""
worker_unit_snapshot=""
temporary_link=""
temporary_current_image_marker=""
temporary_previous_image_marker=""
previous_live_image=""
had_current_image_marker=false
had_previous_image_marker=false
worker_units=(
  nodezuno-email-worker.service
  nodezuno-email-worker.timer
  nodezuno-payment-worker.service
  nodezuno-payment-worker.timer
)

cleanup() {
  [[ -z "$previous_runtime" ]] || rm -f "$previous_runtime"
  [[ -z "$previous_secret" ]] || rm -f "$previous_secret"
  [[ -z "$previous_email_secret" ]] || rm -f "$previous_email_secret"
  [[ -z "$previous_payment_secret" ]] || rm -f "$previous_payment_secret"
  [[ -z "$previous_current_image_marker" ]] || rm -f "$previous_current_image_marker"
  [[ -z "$previous_previous_image_marker" ]] || rm -f "$previous_previous_image_marker"
  [[ -z "$worker_unit_snapshot" ]] || rm -rf "$worker_unit_snapshot"
  [[ -z "$temporary_link" ]] || rm -f "$temporary_link"
  [[ -z "$temporary_current_image_marker" ]] || rm -f "$temporary_current_image_marker"
  [[ -z "$temporary_previous_image_marker" ]] || rm -f "$temporary_previous_image_marker"
}
trap cleanup EXIT

bundle_dir="$(realpath --canonicalize-existing "$bundle_input")"
case "$bundle_dir" in
  "$bundle_root"/*) ;;
  *)
    printf 'The staged host bundle is outside the release directory.\n' >&2
    exit 64
    ;;
esac

for required_file in \
  .complete \
  Caddyfile \
  compose.yaml \
  deliverable-bucket \
  deliverable-kms-key-arn \
  nodezuno-aws-common.sh \
  nodezuno-backup.sh \
  nodezuno-container-firewall.sh \
  nodezuno-deploy.sh \
  nodezuno-host-metrics.sh; do
  if [[ ! -f "$bundle_dir/$required_file" ]] ||
    [[ -L "$bundle_dir/$required_file" ]]; then
    printf 'The staged host bundle is incomplete: %s.\n' "$required_file" >&2
    exit 78
  fi
done

if [[ "$(<"$bundle_dir/.complete")" != "$(basename "$bundle_dir")" ]]; then
  printf 'The staged host bundle identity is invalid.\n' >&2
  exit 78
fi

bash -n \
  "$bundle_dir/nodezuno-aws-common.sh" \
  "$bundle_dir/nodezuno-backup.sh" \
  "$bundle_dir/nodezuno-container-firewall.sh" \
  "$bundle_dir/nodezuno-deploy.sh" \
  "$bundle_dir/nodezuno-host-metrics.sh"

write_email_worker_units() {
  install -d -m 0750 /opt/nodezuno/worker-health
  cat > /etc/systemd/system/nodezuno-email-worker.service <<'EOF'
[Unit]
Description=Process one bounded Nodezuno notification outbox pass
After=nodezuno.service network-online.target
Wants=network-online.target
Requires=nodezuno.service
RequiresMountsFor=/opt/nodezuno
ConditionPathExists=/opt/nodezuno/runtime.env
ConditionPathExists=/opt/nodezuno/config/.env.email-worker

[Service]
Type=oneshot
EnvironmentFile=/opt/nodezuno/host.env
ExecStart=/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 /run/lock/nodezuno-background.lock /usr/bin/docker compose --project-directory /opt/nodezuno --env-file /opt/nodezuno/runtime.env --file /opt/nodezuno/host-current/compose.yaml --profile operations run --rm --no-deps email-worker
ExecStartPost=/usr/bin/touch /opt/nodezuno/worker-health/email-worker.last-success
TimeoutStartSec=180
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UMask=0077
EOF

  cat > /etc/systemd/system/nodezuno-email-worker.timer <<'EOF'
[Unit]
Description=Process the Nodezuno notification outbox every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
RandomizedDelaySec=10s
AccuracySec=5s
Persistent=true

[Install]
WantedBy=timers.target
EOF

  chmod 0644 \
    /etc/systemd/system/nodezuno-email-worker.service \
    /etc/systemd/system/nodezuno-email-worker.timer
}

write_payment_worker_units() {
  install -d -m 0750 /opt/nodezuno/worker-health
  cat > /etc/systemd/system/nodezuno-payment-worker.service <<'EOF'
[Unit]
Description=Verify one bounded batch of Nodezuno Ethereum payments
After=nodezuno.service network-online.target
Wants=network-online.target
Requires=nodezuno.service
RequiresMountsFor=/opt/nodezuno
ConditionPathExists=/opt/nodezuno/runtime.env
ConditionPathExists=/opt/nodezuno/config/.env.payment-worker

[Service]
Type=oneshot
EnvironmentFile=/opt/nodezuno/host.env
ExecStart=/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 /run/lock/nodezuno-background.lock /usr/bin/docker compose --project-directory /opt/nodezuno --env-file /opt/nodezuno/runtime.env --file /opt/nodezuno/host-current/compose.yaml --profile operations run --rm --no-deps payment-worker
ExecStartPost=/usr/bin/touch /opt/nodezuno/worker-health/payment-worker.last-success
TimeoutStartSec=180
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UMask=0077
EOF

  cat > /etc/systemd/system/nodezuno-payment-worker.timer <<'EOF'
[Unit]
Description=Verify Nodezuno Ethereum payment claims every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
RandomizedDelaySec=10s
AccuracySec=5s
Persistent=true

[Install]
WantedBy=timers.target
EOF

  chmod 0644 \
    /etc/systemd/system/nodezuno-payment-worker.service \
    /etc/systemd/system/nodezuno-payment-worker.timer
}

run_worker_and_verify() {
  local service_unit="$1"
  local heartbeat_file="$2"
  local started_at
  local completed_at
  started_at="$(date +%s)"
  if ! systemctl start "$service_unit"; then
    return 1
  fi
  completed_at="$(stat --format=%Y "$heartbeat_file" 2>/dev/null || printf '0')"
  [[ "$completed_at" =~ ^[0-9]+$ ]] &&
    (( completed_at >= started_at ))
}

snapshot_worker_units() {
  worker_unit_snapshot="$(mktemp -d /run/nodezuno-worker-units.previous.XXXXXX)"
  local unit
  for unit in "${worker_units[@]}"; do
    if [[ -f "/etc/systemd/system/$unit" ]] &&
      [[ ! -L "/etc/systemd/system/$unit" ]]; then
      cp --preserve=mode "/etc/systemd/system/$unit" "$worker_unit_snapshot/$unit"
      touch "$worker_unit_snapshot/$unit.present"
    fi
    if systemctl is-enabled --quiet "$unit" >/dev/null 2>&1; then
      touch "$worker_unit_snapshot/$unit.enabled"
    fi
    if systemctl is-active --quiet "$unit" >/dev/null 2>&1; then
      touch "$worker_unit_snapshot/$unit.active"
    fi
  done

  systemctl stop nodezuno-email-worker.timer nodezuno-payment-worker.timer \
    >/dev/null 2>&1 || true
}

install_and_verify_worker_units() {
  write_email_worker_units || return 1
  write_payment_worker_units || return 1
  systemctl daemon-reload || return 1
  systemctl reset-failed "${worker_units[@]}" >/dev/null 2>&1 || true

  run_worker_and_verify \
    nodezuno-email-worker.service \
    /opt/nodezuno/worker-health/email-worker.last-success &&
    run_worker_and_verify \
      nodezuno-payment-worker.service \
      /opt/nodezuno/worker-health/payment-worker.last-success &&
    systemctl enable --now \
      nodezuno-email-worker.timer \
      nodezuno-payment-worker.timer &&
    systemctl is-enabled --quiet nodezuno-email-worker.timer &&
    systemctl is-enabled --quiet nodezuno-payment-worker.timer &&
    systemctl is-active --quiet nodezuno-email-worker.timer &&
    systemctl is-active --quiet nodezuno-payment-worker.timer
}

restore_worker_units() {
  local restore_activity="${1:-false}"
  local unit
  systemctl disable --now \
    nodezuno-email-worker.timer \
    nodezuno-payment-worker.timer >/dev/null 2>&1 || true
  systemctl stop \
    nodezuno-email-worker.service \
    nodezuno-payment-worker.service >/dev/null 2>&1 || true

  for unit in "${worker_units[@]}"; do
    if [[ -f "$worker_unit_snapshot/$unit.present" ]]; then
      cp --preserve=mode "$worker_unit_snapshot/$unit" "/etc/systemd/system/$unit"
    else
      rm -f "/etc/systemd/system/$unit"
    fi
  done
  systemctl daemon-reload
  systemctl reset-failed "${worker_units[@]}" >/dev/null 2>&1 || true

  for unit in "${worker_units[@]}"; do
    if [[ -f "$worker_unit_snapshot/$unit.enabled" ]]; then
      systemctl enable "$unit" >/dev/null 2>&1 || true
    else
      systemctl disable "$unit" >/dev/null 2>&1 || true
    fi
  done
  if [[ "$restore_activity" = true ]]; then
    for unit in "${worker_units[@]}"; do
      if [[ -f "$worker_unit_snapshot/$unit.active" ]]; then
        systemctl start "$unit" >/dev/null 2>&1 || true
      fi
    done
  fi
}

set -a
source /opt/nodezuno/host.env
set +a
source "$bundle_dir/nodezuno-aws-common.sh"

NODEZUNO_IMAGE="$image" \
AWS_REGION="${AWS_REGION:?AWS_REGION is required}" \
NODEZUNO_APP_LOG_GROUP="$(</opt/nodezuno/app-log-group)" \
NODEZUNO_CADDY_LOG_GROUP="$(</opt/nodezuno/caddy-log-group)" \
NODEZUNO_DELIVERABLE_BUCKET="$(<"$bundle_dir/deliverable-bucket")" \
NODEZUNO_DELIVERABLE_KMS_KEY_ARN="$(<"$bundle_dir/deliverable-kms-key-arn")" \
NODEZUNO_APP_ENV_FILE=/dev/null \
NODEZUNO_EMAIL_ENV_FILE=/dev/null \
NODEZUNO_PAYMENT_ENV_FILE=/dev/null \
docker compose \
  --project-directory /opt/nodezuno \
  --file "$bundle_dir/compose.yaml" \
  config --quiet

exec 9>/run/lock/nodezuno-deploy.lock
flock --exclusive --nonblock 9 || {
  printf 'Another Nodezuno deployment is already running.\n' >&2
  exit 75
}

previous_bundle=""
if [[ -L "$current_link" ]]; then
  previous_bundle="$(realpath --canonicalize-existing "$current_link")"
fi

had_runtime=false
if [[ -f "$runtime_file" ]]; then
  previous_runtime="$(mktemp /run/nodezuno-runtime.previous.XXXXXX)"
  cp --preserve=mode "$runtime_file" "$previous_runtime"
  had_runtime=true
fi

had_secret=false
if [[ -f "$secret_file" ]]; then
  previous_secret="$(mktemp /run/nodezuno-secret.previous.XXXXXX)"
  cp --preserve=mode "$secret_file" "$previous_secret"
  had_secret=true
fi

had_email_secret=false
if [[ -f "$email_secret_file" ]]; then
  previous_email_secret="$(mktemp /run/nodezuno-email-secret.previous.XXXXXX)"
  cp --preserve=mode "$email_secret_file" "$previous_email_secret"
  had_email_secret=true
fi

had_payment_secret=false
if [[ -f "$payment_secret_file" ]]; then
  previous_payment_secret="$(mktemp /run/nodezuno-payment-secret.previous.XXXXXX)"
  cp --preserve=mode "$payment_secret_file" "$previous_payment_secret"
  had_payment_secret=true
fi

if [[ -f "$runtime_file" ]]; then
  previous_live_image="$(awk -F= '$1 == "NODEZUNO_IMAGE" { print substr($0, index($0, "=") + 1) }' "$runtime_file")"
fi

if [[ -f "$current_image_marker" ]]; then
  previous_current_image_marker="$(mktemp /run/nodezuno-current-image.previous.XXXXXX)"
  cp --preserve=mode "$current_image_marker" "$previous_current_image_marker"
  had_current_image_marker=true
fi

if [[ -f "$previous_image_marker" ]]; then
  previous_previous_image_marker="$(mktemp /run/nodezuno-previous-image.previous.XXXXXX)"
  cp --preserve=mode "$previous_image_marker" "$previous_previous_image_marker"
  had_previous_image_marker=true
fi

install -m 0755 \
  "$bundle_dir/nodezuno-container-firewall.sh" \
  /usr/local/sbin/nodezuno-container-firewall
install -d -m 0755 \
  /etc/systemd/system/docker.service.d \
  /etc/systemd/system/nodezuno.service.d
cat > /etc/systemd/system/docker.service.d/20-nodezuno-container-firewall.conf <<'EOF'
[Service]
ExecStartPost=/usr/bin/bash /usr/local/sbin/nodezuno-container-firewall
EOF
cat > /etc/systemd/system/nodezuno.service.d/20-nodezuno-container-firewall.conf <<'EOF'
[Service]
ExecStartPre=/usr/bin/bash /usr/local/sbin/nodezuno-container-firewall
EOF
chmod 0644 \
  /etc/systemd/system/docker.service.d/20-nodezuno-container-firewall.conf \
  /etc/systemd/system/nodezuno.service.d/20-nodezuno-container-firewall.conf
systemctl daemon-reload
bash /usr/local/sbin/nodezuno-container-firewall
snapshot_worker_units

activate_bundle() {
  local target="$1"
  temporary_link="/opt/nodezuno/.host-current.$$.$RANDOM"
  ln --symbolic "$target" "$temporary_link"
  mv --force --no-target-directory "$temporary_link" "$current_link"
  temporary_link=""
}

restore_files() {
  if [[ "$had_runtime" = true ]]; then
    cp --preserve=mode "$previous_runtime" "$runtime_file"
  else
    rm -f "$runtime_file"
  fi
  if [[ "$had_secret" = true ]]; then
    cp --preserve=mode "$previous_secret" "$secret_file"
  else
    rm -f "$secret_file"
  fi
  if [[ "$had_email_secret" = true ]]; then
    cp --preserve=mode "$previous_email_secret" "$email_secret_file"
  else
    rm -f "$email_secret_file"
  fi
  if [[ "$had_payment_secret" = true ]]; then
    cp --preserve=mode "$previous_payment_secret" "$payment_secret_file"
  else
    rm -f "$payment_secret_file"
  fi
}

restore_image_markers() {
  if [[ "$had_current_image_marker" = true ]]; then
    cp --preserve=mode "$previous_current_image_marker" "$current_image_marker"
  else
    rm -f "$current_image_marker"
  fi
  if [[ "$had_previous_image_marker" = true ]]; then
    cp --preserve=mode "$previous_previous_image_marker" "$previous_image_marker"
  else
    rm -f "$previous_image_marker"
  fi
}

finalize_image_markers() {
  mkdir --parents /opt/nodezuno/releases
  temporary_current_image_marker="$(mktemp /opt/nodezuno/releases/.current-image.XXXXXX)"
  printf '%s\n' "$image" > "$temporary_current_image_marker"
  chmod 0600 "$temporary_current_image_marker"

  if [[ -n "$previous_live_image" ]]; then
    temporary_previous_image_marker="$(mktemp /opt/nodezuno/releases/.previous-image.XXXXXX)"
    printf '%s\n' "$previous_live_image" > "$temporary_previous_image_marker"
    chmod 0600 "$temporary_previous_image_marker"
    if ! mv --force "$temporary_previous_image_marker" "$previous_image_marker"; then
      restore_image_markers
      return 1
    fi
    temporary_previous_image_marker=""
  else
    rm -f "$previous_image_marker"
  fi

  if ! mv --force "$temporary_current_image_marker" "$current_image_marker"; then
    restore_image_markers
    return 1
  fi
  temporary_current_image_marker=""
}

wait_for_restored_readiness() {
  for _attempt in $(seq 1 60); do
    if docker compose \
      --project-directory /opt/nodezuno \
      --env-file "$runtime_file" \
      --file "$current_link/compose.yaml" \
      exec -T nodezuno node -e \
      "fetch('http://127.0.0.1:3000/api/v1/ready',{signal:AbortSignal.timeout(4000)}).then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 &&
      curl --fail --silent --show-error --max-time 5 \
        --resolve "${NODEZUNO_DOMAIN}:443:127.0.0.1" \
        "https://${NODEZUNO_DOMAIN}/api/v1/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

stop_candidate_containers() {
  if [[ -f "$runtime_file" ]] && [[ -L "$current_link" ]]; then
    docker compose \
      --project-directory /opt/nodezuno \
      --env-file "$runtime_file" \
      --file "$current_link/compose.yaml" \
      down --remove-orphans >/dev/null 2>&1 || true
  fi
}

if ! activate_bundle "$bundle_dir"; then
  restore_worker_units true
  printf 'The staged host bundle could not be activated.\n' >&2
  exit 70
fi
set +e
NODEZUNO_DEPLOY_LOCK_HELD=true \
  bash "$current_link/nodezuno-deploy.sh" "$image"
deployment_status=$?
set -e

if [[ "$deployment_status" = 0 ]]; then
  if systemctl enable nodezuno.service &&
    systemctl start nodezuno.service &&
    systemctl is-active --quiet nodezuno.service &&
    install_and_verify_worker_units &&
    finalize_image_markers; then
    if ! nodezuno_publish_metric DeploymentSuccess 1 Count; then
      printf 'The release is ready, but its success metric could not be published.\n' >&2
    fi
    for candidate in "$bundle_root"/*; do
      [[ -d "$candidate" ]] || continue
      candidate="$(realpath --canonicalize-existing "$candidate")"
      if [[ "$candidate" != "$bundle_dir" ]] &&
        [[ -z "$previous_bundle" || "$candidate" != "$previous_bundle" ]]; then
        rm -rf "$candidate" || true
      fi
    done
    exit 0
  fi
  printf 'The release workers did not establish healthy ownership.\n' >&2
  deployment_status=70
elif [[ "$deployment_status" = 74 ]]; then
  printf 'The required post-deployment backup failed; the candidate will be rolled back.\n' >&2
fi

printf 'Restoring the previous host bundle after deployment failure.\n' >&2
nodezuno_publish_metric DeploymentSuccess 0 Count || true
systemctl stop nodezuno.service >/dev/null 2>&1 || true
stop_candidate_containers
restore_files
restore_image_markers
rollback_healthy=false
if [[ -n "$previous_bundle" ]] && [[ -d "$previous_bundle" ]]; then
  activate_bundle "$previous_bundle"
  if [[ "$had_runtime" = true ]] && [[ "$had_secret" = true ]] &&
    docker compose \
      --project-directory /opt/nodezuno \
      --env-file "$runtime_file" \
      --file "$current_link/compose.yaml" \
      up --detach --remove-orphans --force-recreate &&
    wait_for_restored_readiness &&
    systemctl start nodezuno.service &&
    systemctl is-active --quiet nodezuno.service; then
    rollback_healthy=true
    printf 'The previous host bundle is ready.\n' >&2
  else
    printf 'Host bundle rollback needs operator recovery.\n' >&2
  fi
else
  rm -f "$current_link"
fi
restore_worker_units "$rollback_healthy"

exit "$deployment_status"
