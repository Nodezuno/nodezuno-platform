#!/usr/bin/env bash
set -Eeuo pipefail

# The low-cost single-host profile shares one EC2 instance role. Only the web
# process needs that role to create narrowly scoped S3 deliverable URLs. Keep
# every other container away from IMDS, including the edge and both workers.
metadata_address=169.254.169.254/32
web_egress_subnet=172.29.243.0/28

iptables_binary="$(command -v iptables || true)"
if [[ -z "$iptables_binary" ]]; then
  printf 'iptables is required to enforce the Nodezuno container credential boundary.\n' >&2
  exit 78
fi

for _attempt in $(seq 1 30); do
  if "$iptables_binary" --wait 10 --list DOCKER-USER >/dev/null 2>&1; then
    break
  fi
  if [[ "$_attempt" = 30 ]]; then
    printf 'Docker did not expose the DOCKER-USER firewall chain.\n' >&2
    exit 78
  fi
  sleep 1
done

remove_rule() {
  while "$iptables_binary" --wait 10 --check DOCKER-USER "$@" >/dev/null 2>&1; do
    "$iptables_binary" --wait 10 --delete DOCKER-USER "$@"
  done
}

# Reinsert in a deterministic order. The source-specific accept must precede
# the catch-all metadata drop.
remove_rule --source "$web_egress_subnet" --destination "$metadata_address" --jump ACCEPT
remove_rule --source 172.29.240.2/32 --destination "$metadata_address" --jump ACCEPT
remove_rule --destination "$metadata_address" --jump DROP
"$iptables_binary" --wait 10 --insert DOCKER-USER 1 \
  --destination "$metadata_address" --jump DROP
"$iptables_binary" --wait 10 --insert DOCKER-USER 1 \
  --source "$web_egress_subnet" --destination "$metadata_address" --jump ACCEPT

"$iptables_binary" --wait 10 --check DOCKER-USER \
  --source "$web_egress_subnet" --destination "$metadata_address" --jump ACCEPT
"$iptables_binary" --wait 10 --check DOCKER-USER \
  --destination "$metadata_address" --jump DROP
