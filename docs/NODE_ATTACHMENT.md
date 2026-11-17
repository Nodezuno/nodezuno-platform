# Cloud node attachment runbook

**Audience:** Nodezuno platform operators, security, finance, and release owners

**Evidence date:** 18 July 2026

**Purpose:** Connect externally hosted blockchain nodes to the Nodezuno control
plane without pretending that a laptop or this repository contains a mainnet
node

## Operating model

Nodezuno separates the customer control plane from the blockchain data plane.

- A cloud provider, bare-metal provider, or specialist node provider runs the
  terabyte-scale Ethereum, Base, or Solana node and its stateful storage.
- Nodezuno runs customer identity, sessions, workspaces, service records,
  service-bound API keys, policy, quotas, audit records, status reconciliation,
  and the customer console.
- The Nodezuno gateway authenticates the customer and forwards an allowed,
  bounded request to an operator-approved upstream.
- Customers receive a Nodezuno endpoint and a Nodezuno API key. They never
  receive the upstream URL, provider token, node administration interface, or
  cloud credentials.

Running a blockchain node on the developer's laptop is not a release
requirement. A local environment can exercise control-plane behavior with
deterministic test doubles. Production activation requires a separately
operated node endpoint and the evidence gates in this document.

This repository does not prove that any Ethereum, Base, or Solana node is
currently attached. A saved service record, a passing unit test, or an upstream
configuration example is not production-node evidence.

## Capability status

Use these labels in release records and customer copy:

| Capability | Source boundary | Production claim |
| --- | --- | --- |
| Ethereum Mainnet HTTP JSON-RPC | Implemented gateway, policy, quotas, usage accounting, ordered failover, and bounded chain probe | Allowed only after a real upstream returns chain ID `0x1` through the deployed gateway |
| Ethereum native gRPC | Separate Go gateway with shared control-plane authorization and mainnet readiness | Not currently evidenced as deployed |
| Base Mainnet HTTP JSON-RPC | Implemented gateway, policy, quotas, usage accounting, ordered failover, and bounded chain probe | Allowed only after a real upstream returns chain ID `0x2105` through the deployed gateway |
| Solana Mainnet Beta HTTP JSON-RPC | Implemented gateway, network-specific policy and weights, quotas, usage accounting, ordered failover, genesis probe, and health probe | Allowed only after a real upstream returns the approved genesis hash and `getHealth: "ok"` through the deployed gateway |
| WebSockets and streaming | Prelaunch | No usable endpoint or availability claim |
| Node fleet ownership | Outside this repository | Never infer ownership from an attached provider endpoint |

The source and tests are authoritative if this table becomes stale. Review the
current upstream parser, service activation logic, route handlers, and release
tests before changing a capability from prelaunch or build status.

## Trust and network path

The current production path is:

```text
customer
  -> public TLS edge
  -> Nodezuno application and policy gateway
  -> restricted outbound HTTPS
  -> operator-controlled node gateway or provider endpoint
  -> blockchain node
```

The preferred cloud layout places the node on a private subnet with no
customer-facing RPC port. An operator-controlled gateway or load balancer
terminates TLS, authenticates Nodezuno, applies its own request and spend
limits, and reaches the node through private networking.

The current upstream URL contract requires a public HTTPS destination on
default port 443. It intentionally rejects private literal addresses,
local-use names, and custom ports. Therefore, a private node cannot be entered
as `http://10.x.x.x:8545` or `http://127.0.0.1:8899`. Until a reviewed
private-endpoint trust mode exists, expose only a narrow operator gateway with:

- a public DNS name controlled by the operator;
- a valid certificate for that name;
- TLS 1.2 or newer;
- provider authentication or mutual TLS at a preceding network layer;
- source allowlisting for Nodezuno egress where the platform supplies stable
  egress addresses;
- a firewall rule that denies the node's RPC port from the public internet;
- no node administration, engine, debug, signer, or validator key interface;
  and
- a private route from the gateway to the node.

Do not weaken the application URL validator to make a private IP convenient.
A future private-network mode needs an explicit trust boundary, DNS and
certificate policy, egress control, tests, and a separate configuration field.

## Exact upstream configuration

`NODEZUNO_RPC_UPSTREAMS_JSON` is a secret JSON object. The implemented parser is
the final authority. A multi-chain release uses a nonempty subset of the exact
chain keys supported by that parser. Each present chain contains one to four
ordered upstream entries:

```json
{
  "ethereum": [
    {
      "name": "ethereum-primary",
      "url": "https://eth-rpc.operator.example/v1/project-id",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer provider-secret"
      }
    }
  ],
  "base": [
    {
      "name": "base-primary",
      "url": "https://base-rpc.operator.example/v1/project-id",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer provider-secret"
      }
    }
  ],
  "solana": [
    {
      "name": "solana-primary",
      "url": "https://solana-rpc.operator.example/v1/project-id",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer provider-secret"
      }
    }
  ]
}
```

The example is a shape, not a deployable secret. The `.example` hostnames are
deliberately rejected. Replace them only inside the deployment secret manager.
Never commit the completed JSON, print it in CI, paste it into a ticket, or
store it in a release record.

The current source accepts the exact keys `ethereum`, `base`, and `solana`.
Older deployed commits may implement a narrower contract. Inspect the deployed
commit, its machine-readable API contract, and parser tests before changing a
production secret. An unsupported key makes the complete configuration invalid.

### Entry limits

Each configured upstream must meet all of these conditions:

- `name` is unique within its chain and matches
  `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`;
- `url` is a trimmed HTTPS URL of at most 4,096 bytes;
- `url` has no username, password, fragment, or non-default port;
- the destination is a reviewed public hostname or permitted public literal
  address, not loopback, link-local, private, documentation, benchmark,
  multicast, metadata, or another special-use range;
- `timeoutMs` is an optional integer from 1,000 through 15,000 and defaults to
  8,000;
- `headers` is optional, has at most 12 unique case-insensitive names, and each
  value is a trimmed printable ASCII string of at most 2,048 bytes; and
- the complete secret is no larger than 32 KiB.

One invalid entry, duplicate name, unsupported top-level key, unsupported field,
or invalid header makes the complete configuration unusable. Fail closed and
fix the secret. Do not partially accept an unreviewed chain.

### Header policy

An operator-supplied `Authorization` header is permitted so Nodezuno can
authenticate to the node gateway. Provider-specific non-routing headers are
also permitted within the limits above.

The gateway rejects hop-by-hop, proxy, forwarding, host, content, origin,
cookie, request-tracing, Cloudflare, `Sec-*`, IP-attribution, and
user-agent headers. It sets its own `Accept`, `Content-Type`, and `User-Agent`.
Customer cookies, customer origin and forwarding data, customer headers, and
the `nzu_live_...` credential are never forwarded upstream.

Prefer a provider token in the `Authorization` header over a token in the URL.
Both the complete upstream URL and every configured header remain secrets.

### HTTPS, DNS, and SSRF controls

The application performs strict URL syntax checks, rejects dangerous literal
address ranges and special-use hostname suffixes, omits credentials, and
rejects every redirect. These controls stop common direct SSRF and
credential-bearing redirect paths.

Hostname syntax validation is not DNS resolution or DNS pinning. A hostname
can change its A or AAAA records after review. Production therefore also
requires:

1. ownership review for every configured hostname;
2. authoritative DNS and certificate monitoring;
3. restricted application egress, preferably an allowlisted egress proxy;
4. blocking of cloud metadata, loopback, private control planes, and RFC
   special-use ranges at the network layer;
5. no redirect response from the provider;
6. revalidation after every DNS, certificate, provider, or secret change; and
7. an incident alert when an upstream resolves outside its approved address
   set.

If stable address allowlisting is impossible, route outbound node traffic
through an operator-controlled proxy that owns the DNS and pins the provider
destination. Do not treat the hostname parser alone as protection against DNS
rebinding.

## Chain identity and readiness gates

Chain identity is a security boundary. A successful TCP connection or HTTP
`200` does not prove that a node serves the intended chain.

### Ethereum Mainnet

Send a bounded JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": "nodezuno-chain-probe",
  "method": "eth_chainId",
  "params": []
}
```

The only accepted result is a hexadecimal quantity equal to `0x1`. Leading
zeroes may be normalized by the implementation. Reject a result from Sepolia,
Base, another EVM network, malformed JSON, an unexpected response ID, a
redirect, a timeout, an oversized response, or a non-JSON content type.

### Base Mainnet

Send the same bounded `eth_chainId` request to the Base upstream. The only
accepted result is a hexadecimal quantity equal to `0x2105`, which is decimal
8453. Do not accept Ethereum `0x1` merely because Base exposes an
Ethereum-compatible JSON-RPC interface.

Base documents its Mainnet chain ID as 8453. Its public community endpoint is
rate limited and is not recommended for production systems. Use a reviewed
operator node or production provider instead.

### Solana Mainnet Beta

Solana does not use an EVM chain ID. Activation requires both identity and
health checks.

First send:

```json
{
  "jsonrpc": "2.0",
  "id": "nodezuno-genesis-probe",
  "method": "getGenesisHash",
  "params": []
}
```

The exact accepted Mainnet Beta genesis hash is:

```text
5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
```

Then send:

```json
{
  "jsonrpc": "2.0",
  "id": "nodezuno-health-probe",
  "method": "getHealth",
  "params": []
}
```

The accepted result is the exact string `ok`. Reject a different genesis hash,
`behind`, `unknown`, an RPC error, malformed JSON, an unexpected response ID,
a redirect, timeout, oversized response, or non-JSON content type.

Solana also documents `GET /health`, but the attachment contract should use
the bounded JSON-RPC `getHealth` probe when that is what the implemented
adapter tests. Do not silently substitute one form in a release record.

### Readiness is not capacity

These probes establish protocol identity and a narrow health signal. They do
not prove:

- archive depth;
- trace, debug, Geyser, or vendor extension support;
- historical correctness;
- write landing reliability;
- regional redundancy;
- throughput or latency at customer load;
- provider entitlement;
- future availability; or
- a contractual service level.

Each claim needs separate production evidence.

## Provider-neutral attachment checklist

### 1. Define the workload

- [ ] Name the chain, environment, expected methods, archive depth, and whether
  transaction submission is required.
- [ ] Record expected steady and burst requests per second.
- [ ] Estimate request and response bytes, log scan ranges, and monthly
  egress.
- [ ] Decide whether one upstream is sufficient for preview or at least two
  independently operated upstreams are required.
- [ ] Identify the accountable platform, security, finance, and incident
  owners.

### 2. Provision the node outside Nodezuno

- [ ] Use a supported client version and an operator-reviewed build source.
- [ ] Allocate chain-appropriate CPU, memory, IOPS, network, and storage with
  explicit headroom above current ledger size.
- [ ] Put ledger and state storage on durable volumes with provider monitoring.
- [ ] Keep validator, signer, engine, admin, debug, and management interfaces
  off the customer path.
- [ ] Configure snapshots or provider recovery according to the client and
  cloud provider.
- [ ] Prove the node is synchronized before attachment.

This repository deliberately does not prescribe a universal `1 TB` disk. Chain
state and archive requirements grow. Record the provider's measured usage,
growth rate, expansion procedure, and restore time instead of relying on a
static marketing number.

### 3. Build the narrow node gateway

- [ ] Terminate TLS at an operator-owned hostname.
- [ ] Route privately from the gateway to the node.
- [ ] Require an independent provider credential.
- [ ] Deny every unneeded method and interface at the gateway as defense in
  depth.
- [ ] Apply connection, concurrency, request-size, response-size, and timeout
  limits.
- [ ] Apply provider-side request, egress, and spend caps.
- [ ] Disable redirects.
- [ ] Keep upstream response bodies and credentials out of access logs.

### 4. Validate identity and functionality

- [ ] Ethereum returns `0x1`.
- [ ] Base returns `0x2105`.
- [ ] Solana returns the approved Mainnet Beta genesis hash and `ok`.
- [ ] A wrong-chain fixture remains inactive.
- [ ] A timeout, malformed response, redirect, and oversized response remain
  inactive.
- [ ] Required read methods work within documented parameter bounds.
- [ ] If writes are enabled, a synthetic transaction is handled through an
  approved non-production or low-risk procedure.

### 5. Store the secret

- [ ] Put `NODEZUNO_RPC_UPSTREAMS_JSON` in the deployment secret manager.
- [ ] Keep provider tokens separate by chain and upstream where the provider
  supports it.
- [ ] Give each token only RPC permissions needed by Nodezuno.
- [ ] Confirm the secret is absent from Git, build output, CI logs, tickets,
  screenshots, release records, and shell history.
- [ ] Record only a secret-manager version identifier and rotation date.

### 6. Configure capacity and spend controls

- [ ] Set `NODEZUNO_RPC_HOURLY_CALL_QUOTA` for the per-key-and-service limit.
- [ ] Set `NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA` for the workspace-wide
  limit.
- [ ] Keep provider-side request and cost ceilings lower than the maximum
  unactionable financial exposure.
- [ ] Configure alerts at 50, 75, 90, and 100 percent of the approved daily and
  monthly budget, or record a reviewed alternative.
- [ ] Alert on latency, timeouts, upstream errors, wrong-chain probes, storage
  growth, node lag, low peers, and snapshot failure.
- [ ] Assign a person who can revoke a key, remove an upstream, or disable the
  product without waiting for sales.

Nodezuno quotas protect the customer contract. They are not a substitute for
cloud budgets, provider caps, network egress limits, or abuse detection. Paid
overage is not implemented and must not be enabled without customer budgets,
alerts, invoices, and cancellation controls.

### 7. Release

- [ ] Apply the current additive database migrations.
- [ ] Load the reviewed upstream secret in an approved operator shell and run
  `pnpm run preflight:nodes`.
- [ ] Run the frozen install, dependency audit, lint, type-check, both
  production builds, and complete test suite.
- [ ] Run local control-plane, authentication, and link smokes.
- [ ] Verify a disposable customer can create a workspace, service, and
  service-bound key without contacting sales or an administrator.
- [ ] Verify the service stays `configuration_saved` until its chain probe
  passes.
- [ ] Verify cross-workspace, wrong-service, revoked, expired, and missing-scope
  credentials fail before reaching an upstream.
- [ ] Verify both quota layers and method weights.
- [ ] Verify logs and release evidence contain no upstream URL, header, bearer
  key, JSON-RPC parameters, body, or response.
- [ ] Record production probes for the exact deployed commit.

The preflight reuses the production parser and chain verifier. By default it
requires Ethereum, Base, and Solana to each have at least one verified
upstream. It emits only configuration validity plus configured and verified
counts per network. It does not print URLs or headers. A nonzero exit means the
three-chain attachment gate is not ready:

```bash
NODEZUNO_RPC_UPSTREAMS_JSON="<secret-manager-value>" \
  pnpm run preflight:nodes
```

Run it only in a shell where process environment access and command history are
appropriately restricted. Prefer secret-manager environment injection over
copying the value into the command line. A successful preflight proves the
upstreams at that moment; it is not a deployment, capacity, or uptime claim.

## Secret rotation without customer outage

### Provider credential

Use overlap only when the provider supports two simultaneously valid
credentials.

1. Create a new least-privilege provider credential.
2. Add or replace the affected upstream entry in the deployment secret without
   printing either credential.
3. Deploy the secret-only change through the approved release path.
4. Confirm chain identity, health, an allowed read, quota headers, and redacted
   logs through Nodezuno.
5. Revoke the old provider credential.
6. Confirm it fails directly from an approved operator environment.
7. Record the new secret version, time, operator, and evidence without the
   value.

If overlap is impossible, declare a maintenance window, remove the affected
upstream or fail closed, rotate, verify, and close the incident. Never retain a
compromised value for availability.

### Nodezuno API key pepper

Rotating `API_KEY_PEPPER` invalidates every issued `nzu_live_...` key. Use it
only for compromise response or a planned platform-wide credential migration.
Notify customers through an approved channel, require new keys, verify old
keys fail, and never attempt to recover plaintext keys from stored hashes.

### Origin, authentication, and gRPC secrets

`RATE_LIMIT_SECRET`, `BETTER_AUTH_SECRET`, and
`NODEZUNO_GRPC_AUTH_SECRET` are independent.
`NODEZUNO_ORIGIN_SECRET` is also independent when
`NODEZUNO_INGRESS_MODE=trusted-gateway`; it must be completely blank in
`direct` mode. Never reuse a provider token or `API_KEY_PEPPER` for one of
these purposes. Follow the service-specific rotation steps in
[SECURITY.md](SECURITY.md) and verify both the old-secret denial and
new-secret success path.

## Customer self-service examples

These examples use the Nodezuno public contract. They do not call the cloud node
directly.

### Create a service in the console

The supported browser path is:

1. Open `/signup`.
2. Create an account with an enabled method.
3. Open `/console?product=rpc-api`.
4. Create or reuse the company workspace.
5. Create the desired available chain service.
6. Create a service-bound API key and copy its one-time secret.
7. Run the displayed chain check.

There is no sales approval step for a released self-service beta. Sales is for
future dedicated capacity, contractual service levels, SSO, migration, and
premium support.

### Ethereum first call

```bash
export NODEZUNO_ORIGIN="https://nodezuno.com"
export NODEZUNO_SERVICE_ID="<ethereum-service-id>"
export NODEZUNO_API_KEY="<one-time-nzu-live-key>"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${NODEZUNO_API_KEY}" \
  --header "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "${NODEZUNO_ORIGIN}/api/v1/rpc/${NODEZUNO_SERVICE_ID}"
```

An active Ethereum Mainnet service returns a JSON-RPC result equal to `0x1`.

### Base first call

```bash
export NODEZUNO_ORIGIN="https://nodezuno.com"
export NODEZUNO_SERVICE_ID="<base-service-id>"
export NODEZUNO_API_KEY="<one-time-nzu-live-key>"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${NODEZUNO_API_KEY}" \
  --header "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "${NODEZUNO_ORIGIN}/api/v1/rpc/${NODEZUNO_SERVICE_ID}"
```

An active Base Mainnet service must return `0x2105`.

### Solana first call

```bash
export NODEZUNO_ORIGIN="https://nodezuno.com"
export NODEZUNO_SERVICE_ID="<solana-service-id>"
export NODEZUNO_API_KEY="<one-time-nzu-live-key>"

curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${NODEZUNO_API_KEY}" \
  --header "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}' \
  "${NODEZUNO_ORIGIN}/api/v1/rpc/${NODEZUNO_SERVICE_ID}"
```

An active Solana Mainnet Beta service must return `ok`.

Never put the API key in a URL, source file, browser analytics event, support
ticket, or committed shell script. Revoke the key after a disposable release
test.

## Process-local Pulse observation

An allowlisted administrator can inspect
`GET /api/v1/admin/node-attachments` without exposing configured provider
identity or credentials. For each RPC network, the response reports readiness
and one redacted Pulse record per configured slot. A record contains the
one-based slot, whether it is primary, `cold`, `closed`, `half_open`, or
`open` circuit state, latency EWMA, consecutive failures, successful
observations, remaining cooldown, and last observed time.

Pulse state lives only in the current website process. It can reset on restart
or replacement and is not shared across replicas. It is useful for immediate
routing diagnosis, but it is not historical uptime, provider monitoring, a
fleet aggregate, or service-level evidence. The route never returns provider
names, URLs, headers, credentials, or internal cache keys.

## Failure modes and operator actions

| Symptom | Likely cause | Safe action |
| --- | --- | --- |
| Service remains `configuration_saved` | Missing or invalid secret, wrong chain, unhealthy node, failed probe, or unsupported chain in this release | Validate the secret shape without printing it, run the approved chain probe, and keep the service inactive |
| HTTP `401` from Nodezuno | Missing, malformed, expired, revoked, or wrong API key | Create a replacement key, verify its binding, and revoke the old key |
| HTTP `403` with service denial | Key belongs to another service or workspace | Use a key bound to the requested service; never broaden access silently |
| HTTP `429` | Per-key/service or workspace quota exhausted | Inspect aggregate counters, stop abuse, and raise limits only with capacity and budget approval |
| HTTP `502` | Upstream rejected the request, returned invalid content, redirected, or failed | Remove the faulty upstream, inspect provider health, and do not fabricate a response |
| HTTP `504` | Upstream exceeded the bounded timeout | Check node lag and provider saturation; fail over only for methods proven retry-safe |
| Ethereum result is not `0x1` | Wrong EVM network or unsafe provider routing | Disable the upstream immediately |
| Base result is not `0x2105` | Wrong EVM network or unsafe provider routing | Disable the upstream immediately |
| Solana genesis hash differs | Wrong cluster | Disable the upstream immediately |
| Solana health is `behind`, `unknown`, or an error | Node is not ready | Remove it from customer routing until synchronized |
| Provider spend spikes | Abuse, key leak, retry storm, expensive methods, or provider pricing change | Revoke exposed keys, lower provider caps, remove the upstream if needed, and open an incident |
| DNS resolves to an unapproved address | Takeover, rebinding, provider migration, or configuration error | Block egress, remove the upstream, verify ownership and certificates, then rotate credentials |

Transaction submission is non-idempotent. Do not retry a write on another
upstream unless the product has first reconciled whether the original side
effect exists. The current gateway sends non-retry-safe methods to the primary
once.

## Backups and recovery

The cloud node and the Nodezuno control plane have different recovery scopes.

### Blockchain node

Protect and rehearse:

- cloud volume or provider snapshot policy;
- client configuration and version;
- genesis or chain specification;
- snapshot source and verification procedure;
- node gateway configuration;
- provider credential replacement;
- DNS and certificate recovery; and
- rebuild time, sync time, and required storage headroom.

A blockchain node can usually be rebuilt from a trusted snapshot and network
sync. Do not copy validator or signer keys into an RPC-only recovery bundle.
Do not claim a recovery-point objective until the provider process has been
timed.

### Nodezuno application database

Protect and rehearse recovery of the selected application database for:

- accounts and sessions;
- wallet links;
- workspaces and memberships;
- service records;
- API-key hashes, bindings, expiry, and revocation;
- developer audit records;
- quota and aggregate usage;
- submissions, consent, and administrator audit data; and
- status and chain catalogs.

The upstream secret belongs in the deployment secret manager, not the
application database. A Sites saved version or container image is not a
database backup. Sites and D1 REST require a provider-supported recovery point
or encrypted export plus an isolated restore rehearsal. SQLite provides
guarded create, verify, and no-overwrite restore commands, but no scheduler,
off-host transfer, encryption upload, retention, alerting, point-in-time
recovery, replication, or leader election. Move and reverify the SQLite backup
and its manifest off-volume and off-host. Restore only with the single
application instance stopped and the target plus WAL, SHM, and journal
sidecars absent.

After a control-plane restore, reconcile every API key created or revoked after
the recovery point. If the result is uncertain, rotate `API_KEY_PEPPER` and
require replacement keys instead of risking resurrection of a revoked
credential.

## Evidence record

For each attached chain, keep a restricted record containing:

- deployed source commit and artifact identifier;
- chain and environment;
- upstream owner and provider account identifier;
- secret-manager version identifier, not the value;
- redacted DNS and certificate review;
- chain identity and health probe outputs with request IDs;
- supported-method and archive-depth checks;
- capacity test, quota values, cloud budget, provider cap, and alert evidence;
- firewall, egress, private route, and gateway review;
- backup or rebuild rehearsal and measured recovery time;
- wrong-chain, timeout, redirect, malformed response, cross-tenant, revoked-key,
  and quota-denial results;
- monitoring and incident owners;
- rollback or upstream-removal procedure; and
- exact customer self-service test result.

Do not put a raw provider URL, provider header, Nodezuno API key, customer
payload, or database export in this record.

## External protocol references

- [Ethereum Mainnet naming and chain ID 1](https://eips.ethereum.org/EIPS/eip-2228)
- [Base Mainnet connection parameters and chain ID 8453](https://docs.base.org/base-chain/quickstart/connecting-to-base)
- [Base JSON-RPC overview](https://docs.base.org/base-chain/api-reference/rpc-overview)
- [Solana `getGenesisHash`](https://solana.com/docs/rpc/http/getgenesishash)
- [Solana `getHealth`](https://solana.com/docs/rpc/http/gethealth)
- [Solana HTTP RPC health behavior](https://solana.com/docs/rpc/http)

External documentation can change. Recheck it during release review and use the
deployed node's verified output as environment evidence.
