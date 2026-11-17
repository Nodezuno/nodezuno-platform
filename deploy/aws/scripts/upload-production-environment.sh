#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

environment_file="${1:-}"
parameter_name="${2:-/nodezuno/prod/environment}"
region="${AWS_REGION:-ap-south-1}"

if [[ ! -f "$environment_file" ]]; then
  printf 'Usage: %s /absolute/path/.env.production [parameter-name]\n' "$0" >&2
  exit 64
fi

if [[ -L "$environment_file" ]]; then
  printf 'The production environment file must not be a symbolic link.\n' >&2
  exit 77
fi

environment_directory="$(cd "$(dirname "$environment_file")" && pwd -P)"
environment_path="${environment_directory}/$(basename "$environment_file")"
environment_bytes="$(wc -c < "$environment_path" | tr -d '[:space:]')"

case "$(uname -s)" in
  Darwin) environment_mode="$(stat -f '%Lp' "$environment_path")" ;;
  Linux) environment_mode="$(stat -c '%a' "$environment_path")" ;;
  *) environment_mode="" ;;
esac

if [[ "$environment_mode" != "600" ]] && [[ "$environment_mode" != "400" ]]; then
  printf 'The production environment file must have mode 0600 or 0400.\n' >&2
  exit 77
fi

if (( environment_bytes > 4096 )); then
  printf 'The production environment exceeds the 4 KiB Standard Parameter limit.\n' >&2
  exit 78
fi

if LC_ALL=C grep --quiet $'\r' "$environment_path"; then
  printf 'The production environment must use Unix line endings.\n' >&2
  exit 78
fi

if ! awk '
  /^[[:space:]]*($|#)/ { next }
  $0 !~ /^[A-Za-z_][A-Za-z0-9_]*=/ { exit 1 }
  {
    name = $0
    sub(/=.*/, "", name)
    if (seen[name]++) exit 1
  }
' "$environment_path"; then
  printf 'The production environment contains a malformed or duplicate assignment.\n' >&2
  exit 78
fi

if grep --quiet --extended-regexp 'replace-with|replace\.invalid|operator@example\.com' "$environment_path"; then
  printf 'The production environment still contains a placeholder.\n' >&2
  exit 78
fi

required_names=(
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  NODEZUNO_ADMIN_EMAILS
  NODEZUNO_ALLOW_CONTRACT_MIGRATIONS
  NODEZUNO_ALLOW_SCHEMA_BASELINE
  NODEZUNO_DOMAIN
  NODEZUNO_LEGAL_LAUNCH_APPROVED
  NODEZUNO_PAYMENT_CONFIRMATIONS
  NODEZUNO_PUBLIC_INDEXING
  NODEZUNO_STABLECOIN_PAYMENT_MODE
  PUBLIC_ORIGIN
  RATE_LIMIT_SECRET
  REVIEW_CAPABILITY_SECRET
  ZOHO_SMTP_HOST
  ZOHO_SMTP_PASSWORD
)

for name in "${required_names[@]}"; do
  if ! grep --quiet --extended-regexp "^${name}=.+" "$environment_path"; then
    printf 'Missing required production value: %s\n' "$name" >&2
    exit 78
  fi
done

for name in \
  NODEZUNO_ALLOW_CONTRACT_MIGRATIONS \
  NODEZUNO_ALLOW_SCHEMA_BASELINE; do
  if ! grep --quiet --fixed-strings --line-regexp \
    "${name}=false" "$environment_path"; then
    printf '%s must be exactly false for a standard production deployment.\n' \
      "$name" >&2
    exit 78
  fi
done

if ! grep --quiet '^NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=' "$environment_path"; then
  printf 'Missing production setting: NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON\n' >&2
  exit 78
fi

environment_value() {
  local name="$1"
  grep --max-count=1 "^${name}=" "$environment_path" | cut -d= -f2-
}

rate_limit_secret="$(environment_value RATE_LIMIT_SECRET)"
better_auth_secret="$(environment_value BETTER_AUTH_SECRET)"
review_capability_secret="$(environment_value REVIEW_CAPABILITY_SECRET)"
for secret in "$rate_limit_secret" "$better_auth_secret" "$review_capability_secret"; do
  if (( ${#secret} < 32 )); then
    printf 'Every core production secret must contain at least 32 characters.\n' >&2
    exit 78
  fi
done
if [[ "$rate_limit_secret" = "$better_auth_secret" ]] ||
  [[ "$rate_limit_secret" = "$review_capability_secret" ]] ||
  [[ "$better_auth_secret" = "$review_capability_secret" ]]; then
  printf 'The three core production secrets must be independent.\n' >&2
  exit 78
fi

public_origin="$(environment_value PUBLIC_ORIGIN)"
authentication_origin="$(environment_value BETTER_AUTH_URL)"
if [[ "$public_origin" != "$authentication_origin" ]]; then
  printf 'PUBLIC_ORIGIN and BETTER_AUTH_URL must be identical.\n' >&2
  exit 78
fi

zoho_smtp_host="$(environment_value ZOHO_SMTP_HOST)"
zoho_smtp_password="$(environment_value ZOHO_SMTP_PASSWORD)"
case "$zoho_smtp_host" in
  smtp.zoho.com|smtp.zoho.eu|smtp.zoho.in|smtp.zoho.com.au|smtp.zoho.jp|smtp.zoho.ca|smtp.zoho.com.cn|smtp.zoho.ae|smtp.zoho.sa) ;;
  *)
    printf 'ZOHO_SMTP_HOST must match the SMTP host shown in your Zoho Mail settings.\n' >&2
    exit 78
    ;;
esac
if (( ${#zoho_smtp_password} < 8 || ${#zoho_smtp_password} > 512 )) ||
  [[ "$zoho_smtp_password" == *$'\n'* || "$zoho_smtp_password" == *$'\r'* ]]; then
  printf 'ZOHO_SMTP_PASSWORD must be a valid Zoho app password.\n' >&2
  exit 78
fi

if [[ "$public_origin" != "https://"* ]]; then
  printf 'PUBLIC_ORIGIN must use HTTPS.\n' >&2
  exit 78
fi
nodezuno_domain="$(environment_value NODEZUNO_DOMAIN)"
if [[ ! "$nodezuno_domain" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] ||
  [[ "$public_origin" != "https://${nodezuno_domain}" ]]; then
  printf 'PUBLIC_ORIGIN must exactly match the HTTPS NODEZUNO_DOMAIN origin.\n' >&2
  exit 78
fi

payment_mode="$(environment_value NODEZUNO_STABLECOIN_PAYMENT_MODE)"
if [[ "$payment_mode" != "disabled" && "$payment_mode" != "ethereum_mainnet" ]]; then
  printf 'NODEZUNO_STABLECOIN_PAYMENT_MODE must be disabled or ethereum_mainnet.\n' >&2
  exit 78
fi
legal_launch_approved="$(environment_value NODEZUNO_LEGAL_LAUNCH_APPROVED)"
public_indexing="$(environment_value NODEZUNO_PUBLIC_INDEXING)"
for value in "$legal_launch_approved" "$public_indexing"; do
  if [[ "$value" != "true" && "$value" != "false" ]]; then
    printf 'Launch approval and public indexing flags must be true or false.\n' >&2
    exit 78
  fi
done
if [[ "$public_indexing" == "true" && "$legal_launch_approved" != "true" ]]; then
  printf 'Public indexing requires NODEZUNO_LEGAL_LAUNCH_APPROVED=true.\n' >&2
  exit 78
fi
if [[ "$payment_mode" == "ethereum_mainnet" ]]; then
  payment_endpoints="$(environment_value NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON)"
  if [[ "$legal_launch_approved" != "true" ]]; then
    printf 'Ethereum mainnet payments require NODEZUNO_LEGAL_LAUNCH_APPROVED=true.\n' >&2
    exit 78
  fi
  if [[ -z "$payment_endpoints" ]]; then
    printf 'Ethereum mainnet payments require configured verification endpoints.\n' >&2
    exit 78
  fi
fi
payment_confirmations="$(environment_value NODEZUNO_PAYMENT_CONFIRMATIONS)"
if [[ ! "$payment_confirmations" =~ ^[0-9]+$ ]] ||
  (( payment_confirmations < 6 || payment_confirmations > 64 )); then
  printf 'NODEZUNO_PAYMENT_CONFIRMATIONS must be from 6 to 64.\n' >&2
  exit 78
fi

aws ssm put-parameter \
  --name "$parameter_name" \
  --description "Nodezuno production container environment" \
  --type SecureString \
  --value "file://${environment_path}" \
  --overwrite \
  --region "$region" \
  --output json \
  --query '{Name:Name,Version:Version,Tier:Tier}'

printf 'Uploaded the encrypted production environment to %s in %s.\n' \
  "$parameter_name" "$region"
