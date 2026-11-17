#!/usr/bin/env bash

if [[ -r /opt/nodezuno/host.env ]]; then
  set -a
  source /opt/nodezuno/host.env
  set +a
fi

nodezuno_instance_id() {
  local token
  token="$(curl --fail --silent --show-error --max-time 2 \
    --request PUT \
    --header 'X-aws-ec2-metadata-token-ttl-seconds: 60' \
    http://169.254.169.254/latest/api/token)"
  curl --fail --silent --show-error --max-time 2 \
    --header "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/meta-data/instance-id
}

nodezuno_publish_metric() {
  local metric_name="$1"
  local value="$2"
  local unit="${3:-Count}"
  local instance_id
  instance_id="$(nodezuno_instance_id)"
  aws cloudwatch put-metric-data \
    --namespace Nodezuno/Operations \
    --metric-name "$metric_name" \
    --dimensions "InstanceId=$instance_id" \
    --unit "$unit" \
    --value "$value" \
    --region "${AWS_REGION:?AWS_REGION is required}" \
    >/dev/null
}

nodezuno_compose() {
  docker compose \
    --project-directory /opt/nodezuno \
    --env-file /opt/nodezuno/runtime.env \
    --file /opt/nodezuno/host-current/compose.yaml \
    "$@"
}
