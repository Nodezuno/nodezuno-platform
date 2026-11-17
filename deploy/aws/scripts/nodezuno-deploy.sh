#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/nodezuno-aws-common.sh"

image="${1:-}"
repository_uri="$(</opt/nodezuno/ecr-repository-uri)"
digest_prefix="${repository_uri}@sha256:"
digest="${image#"$digest_prefix"}"

if [[ "$image" != "$digest_prefix"* ]] ||
  [[ ! "$digest" =~ ^[a-f0-9]{64}$ ]]; then
  printf 'Release image must be an immutable digest from %s.\n' \
    "$repository_uri" >&2
  exit 64
fi

if [[ "${NODEZUNO_DEPLOY_LOCK_HELD:-false}" != true ]]; then
  exec 9>/run/lock/nodezuno-deploy.lock
  flock --exclusive --nonblock 9 || {
    printf 'Another Nodezuno deployment is already running.\n' >&2
    exit 75
  }
fi

parameter_name="$(</opt/nodezuno/ssm-parameter-name)"
region="${AWS_REGION:?AWS_REGION is required}"
registry="${repository_uri%%/*}"
runtime_file=/opt/nodezuno/runtime.env
secret_file=/opt/nodezuno/config/.env.production
email_secret_file=/opt/nodezuno/config/.env.email-worker
payment_secret_file=/opt/nodezuno/config/.env.payment-worker
temporary_secret="$(mktemp /opt/nodezuno/config/.env.production.XXXXXX)"
temporary_email_secret="$(mktemp /opt/nodezuno/config/.env.email-worker.XXXXXX)"
temporary_payment_secret="$(mktemp /opt/nodezuno/config/.env.payment-worker.XXXXXX)"
temporary_runtime="$(mktemp /opt/nodezuno/runtime.env.XXXXXX)"
previous_secret=""
previous_email_secret=""
previous_payment_secret=""
current_image=""

cleanup() {
  rm -f \
    "$temporary_secret" \
    "$temporary_email_secret" \
    "$temporary_payment_secret" \
    "$temporary_runtime"
  if [[ -n "$previous_secret" ]]; then
    rm -f "$previous_secret"
  fi
  if [[ -n "$previous_email_secret" ]]; then
    rm -f "$previous_email_secret"
  fi
  if [[ -n "$previous_payment_secret" ]]; then
    rm -f "$previous_payment_secret"
  fi
}
trap cleanup EXIT

write_role_environment() {
  local source_file="$1"
  local destination="$2"
  shift 2
  local allowed='|'
  local name
  for name in "$@"; do
    allowed+="${name}|"
  done
  awk -v allowed="$allowed" '
    /^[[:space:]]*($|#)/ { next }
    {
      name = $0
      sub(/=.*/, "", name)
      if (index(allowed, "|" name "|") > 0) print
    }
  ' "$source_file" > "$destination"
  chmod 0600 "$destination"
  for name in "$@"; do
    if ! grep --quiet --extended-regexp "^${name}=" "$destination"; then
      printf 'The role environment is missing %s.\n' "$name" >&2
      return 1
    fi
  done
}

write_email_environment() {
  write_role_environment "$1" "$2" \
    PUBLIC_ORIGIN \
    REVIEW_CAPABILITY_SECRET \
    ZOHO_SMTP_HOST \
    ZOHO_SMTP_PASSWORD
}

write_payment_environment() {
  write_role_environment "$1" "$2" \
    NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON \
    NODEZUNO_LEGAL_LAUNCH_APPROVED \
    NODEZUNO_PAYMENT_CONFIRMATIONS \
    NODEZUNO_STABLECOIN_PAYMENT_MODE
}

write_runtime() {
  local release_image="$1"
  local destination="$2"
  {
    printf 'AWS_REGION=%s\n' "$region"
    printf 'CADDY_ACME_EMAIL=%s\n' "${CADDY_ACME_EMAIL:?CADDY_ACME_EMAIL is required}"
    printf 'NODEZUNO_APP_LOG_GROUP=%s\n' "$(</opt/nodezuno/app-log-group)"
    printf 'NODEZUNO_BACKUP_BUCKET=%s\n' "$(</opt/nodezuno/backup-bucket)"
    printf 'NODEZUNO_BACKUP_PREFIX=production\n'
    printf 'NODEZUNO_CADDY_LOG_GROUP=%s\n' "$(</opt/nodezuno/caddy-log-group)"
    printf 'NODEZUNO_DELIVERABLE_BUCKET=%s\n' "$(</opt/nodezuno/host-current/deliverable-bucket)"
    printf 'NODEZUNO_DELIVERABLE_KMS_KEY_ARN=%s\n' "$(</opt/nodezuno/host-current/deliverable-kms-key-arn)"
    printf 'NODEZUNO_DOMAIN=%s\n' "${NODEZUNO_DOMAIN:?NODEZUNO_DOMAIN is required}"
    printf 'NODEZUNO_IMAGE=%s\n' "$release_image"
  } > "$destination"
  chmod 0600 "$destination"
}

wait_for_readiness() {
  local attempts="${1:-60}"
  for _attempt in $(seq 1 "$attempts"); do
    if nodezuno_compose exec -T nodezuno node -e \
      "fetch('http://127.0.0.1:3000/api/v1/ready',{signal:AbortSignal.timeout(4000)}).then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_edge_readiness() {
  local attempts="${1:-60}"
  for _attempt in $(seq 1 "$attempts"); do
    if curl --fail --silent --show-error --max-time 5 \
      --resolve "${NODEZUNO_DOMAIN}:443:127.0.0.1" \
      "https://${NODEZUNO_DOMAIN}/api/v1/ready" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

prune_application_images() {
  local current_id previous_id candidate_id
  current_id="$(docker image inspect "$image" --format '{{.Id}}' 2>/dev/null || true)"
  previous_id=""
  if [[ -n "$current_image" ]]; then
    previous_id="$(docker image inspect "$current_image" --format '{{.Id}}' 2>/dev/null || true)"
  fi
  while IFS= read -r candidate_id; do
    [[ -n "$candidate_id" ]] || continue
    if [[ "$candidate_id" != "$current_id" ]] &&
      [[ -z "$previous_id" || "$candidate_id" != "$previous_id" ]]; then
      docker image rm "$candidate_id" >/dev/null 2>&1 || true
    fi
  done < <(
    docker image ls --no-trunc --format '{{.ID}}' "$repository_uri" |
      sort --unique
  )
  docker image prune --force >/dev/null 2>&1 || true
}

if [[ -f "$runtime_file" ]]; then
  current_image="$(awk -F= '$1 == "NODEZUNO_IMAGE" { print substr($0, index($0, "=") + 1) }' "$runtime_file")"
fi

# Fail closed before any candidate container or admission worker starts. The
# rule is also installed after every Docker restart by the host systemd drop-in.
bash /opt/nodezuno/host-current/nodezuno-container-firewall.sh

aws ssm get-parameter \
  --name "$parameter_name" \
  --with-decryption \
  --region "$region" \
  --output json |
  jq --exit-status --raw-output '.Parameter.Value' > "$temporary_secret"

if [[ ! -s "$temporary_secret" ]] ||
  grep --quiet --extended-regexp 'replace-with|replace\.invalid|operator@example\.com' "$temporary_secret"; then
  printf 'The production environment parameter is empty or contains placeholders.\n' >&2
  exit 78
fi

if LC_ALL=C grep --quiet $'\r' "$temporary_secret" ||
  ! awk '
    /^[[:space:]]*($|#)/ { next }
    $0 !~ /^[A-Za-z_][A-Za-z0-9_]*=/ { exit 1 }
    {
      name = $0
      sub(/=.*/, "", name)
      if (seen[name]++) exit 1
    }
  ' "$temporary_secret"; then
  printf 'The production environment is malformed or contains duplicate assignments.\n' >&2
  exit 78
fi

if ! grep --quiet --fixed-strings --line-regexp \
  'NODEZUNO_ALLOW_SCHEMA_BASELINE=false' "$temporary_secret" ||
  ! grep --quiet --fixed-strings --line-regexp \
    'NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=false' "$temporary_secret"; then
  printf '%s\n' \
    'The standard deployment path refuses schema-baseline and contract-migration overrides.' \
    'Keep both migration override settings false and follow docs/MIGRATIONS.md for an approved maintenance cutover.' >&2
  exit 78
fi

if [[ -f "$secret_file" ]]; then
  previous_secret="$(mktemp /opt/nodezuno/config/.env.production.previous.XXXXXX)"
  cp --preserve=mode "$secret_file" "$previous_secret"
  previous_email_secret="$(mktemp /opt/nodezuno/config/.env.email-worker.previous.XXXXXX)"
  previous_payment_secret="$(mktemp /opt/nodezuno/config/.env.payment-worker.previous.XXXXXX)"
  write_email_environment "$secret_file" "$previous_email_secret"
  write_payment_environment "$secret_file" "$previous_payment_secret"
fi

chmod 0600 "$temporary_secret"
write_email_environment "$temporary_secret" "$temporary_email_secret"
write_payment_environment "$temporary_secret" "$temporary_payment_secret"

aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "$registry" >/dev/null
docker pull "$image" >/dev/null

# Migrations, release backups, and the admission worker pass share the SQLite
# writer boundary with the scheduled notification and payment workers. Wait
# for an active bounded worker to finish, then keep every scheduled pass out
# until this deployment has either become ready or completed its rollback.
exec 8>/run/lock/nodezuno-background.lock
flock --exclusive --wait 180 8 || {
  printf 'A Nodezuno background operation did not finish before deployment.\n' >&2
  exit 75
}

if [[ -n "$current_image" ]] && [[ -s /opt/nodezuno/data/nodezuno.sqlite ]]; then
  bash /opt/nodezuno/host-current/nodezuno-backup.sh predeploy
fi

write_runtime "$image" "$temporary_runtime"
mv "$temporary_secret" "$secret_file"
mv "$temporary_email_secret" "$email_secret_file"
mv "$temporary_payment_secret" "$payment_secret_file"
mv "$temporary_runtime" "$runtime_file"

release_checks_ready=false
if nodezuno_compose run --rm --no-deps --entrypoint node nodezuno \
    scripts/preflight-deployment-topology.mjs web &&
  nodezuno_compose run --rm --no-deps --entrypoint node nodezuno \
    scripts/migrate-container.mjs &&
  nodezuno_compose run --rm --no-deps --entrypoint node nodezuno \
    scripts/preflight-control-plane.mjs &&
  nodezuno_compose run --rm --no-deps --entrypoint node nodezuno \
    scripts/preflight-stablecoin-payments.mjs &&
  nodezuno_compose --profile operations run --rm --no-deps payment-worker; then
  release_checks_ready=true
fi

release_ready=false
if [[ "$release_checks_ready" = true ]] &&
  nodezuno_compose up --detach --remove-orphans --force-recreate; then
  if wait_for_readiness 60 && wait_for_edge_readiness 60; then
    release_ready=true
  fi
fi

if [[ "$release_ready" != true ]]; then
  printf 'The new release did not become ready. The previous image was %s.\n' \
    "${current_image:-not recorded}" >&2
  nodezuno_compose ps >&2 || true
  nodezuno_compose logs --tail 120 nodezuno >&2 || true
  nodezuno_publish_metric DeploymentSuccess 0 Count || true

  rollback_ready=false
  if [[ "$current_image" == "$digest_prefix"* ]] &&
    [[ "${current_image#"$digest_prefix"}" =~ ^[a-f0-9]{64}$ ]] &&
    [[ -n "$previous_secret" ]] &&
    [[ -n "$previous_email_secret" ]] &&
    [[ -n "$previous_payment_secret" ]]; then
    printf 'Attempting automatic image and environment rollback.\n' >&2
    mv "$previous_secret" "$secret_file"
    mv "$previous_email_secret" "$email_secret_file"
    mv "$previous_payment_secret" "$payment_secret_file"
    write_runtime "$current_image" "$temporary_runtime"
    mv "$temporary_runtime" "$runtime_file"
    if nodezuno_compose up --detach --remove-orphans --force-recreate &&
      wait_for_readiness 60 && wait_for_edge_readiness 60; then
      rollback_ready=true
      printf 'Rollback is ready on %s.\n' "$current_image" >&2
    else
      printf 'Automatic rollback also failed. Follow the incident runbook.\n' >&2
    fi
  fi
  if [[ "$rollback_ready" != true ]]; then
    nodezuno_compose down --remove-orphans >/dev/null 2>&1 || true
  fi
  exit 70
fi

if [[ -s /opt/nodezuno/data/nodezuno.sqlite ]]; then
  if ! bash /opt/nodezuno/host-current/nodezuno-backup.sh postdeploy; then
    nodezuno_publish_metric DeploymentSuccess 0 Count || true
    printf 'The release is ready, but its required off-host backup failed.\n' >&2
    exit 74
  fi
fi

prune_application_images || true
printf 'Nodezuno web release is ready for host ownership proof: %s\n' "$image"
