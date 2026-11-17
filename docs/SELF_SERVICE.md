# Self-service workspace and services

> **Status: retained internal engineering foundation.** This is not a current
> public Nodezuno product or launch claim. Upgrade Assurance is the sole public
> offer. See [README.md](README.md) for the canonical status map.

When the authentication migrations and required secrets are deployed and the
customer routes are publicly reachable, Nodezuno customers can create an
account, workspace, API keys, and service records without a sales conversation
or access review.

## Retained beta implementation

The retained source implementation contains a free HTTP JSON-RPC beta for
Ethereum Mainnet, Base Mainnet, and Solana Mainnet Beta. It is not currently
offered or marketed as a public Nodezuno product. It
requires no payment card. The default quota is 1,000 units per API key and
service per hour and 10,000 units across the workspace per hour. There is no
paid billing, paid overage, invoice, or automatic charge. A chain remains
unavailable until an operator-configured node passes its chain-specific
identity and health gate.

Sales is not required to enter or use the free beta. Sales is reserved for
future dedicated capacity, SSO, contractual SLAs, migration assistance, or
premium support. EVM and Solana calls use separate method-weighted quota
tables documented below.

## Customer path

1. A product page links to `/start?product=<product>`.
2. An anonymous user continues to `/signup` with product intent preserved in a
   same-origin return path.
3. A signed-in user opens `/console?product=<product>`.
4. The guided action creates only the missing company workspace, selected
   network development service, and service-bound API key.
5. If an earlier attempt stopped after one resource, the next attempt resumes
   from the persisted state instead of duplicating it.
6. The user stores the one-time key and can run the in-console chain check when
   the gateway has a verified upstream.

The full console retains advanced forms for additional services and separate
unbound `platform:identity` or `services:manage` keys. Callable product keys
remain bound to exactly one service and carry exactly one compatible scope.
No onboarding step opens a sales request.

## Product truth

The source-implemented `platform-api` service resolves to
`/api/v1/platform/whoami`.

The source-implemented RPC beta resolves to
`POST /api/v1/rpc/{serviceId}` only when the operator has configured at least
one real HTTPS upstream for the service network and it passes the bounded
identity gate:

- Ethereum Mainnet returns `eth_chainId` `0x1`.
- Base Mainnet returns `eth_chainId` `0x2105`.
- Solana Mainnet Beta returns the approved `getGenesisHash` value and then
  `getHealth: "ok"`.

An RPC service is `active`, has beta maturity, and receives an endpoint path
only in that state. Missing, invalid, unreachable, unhealthy, or wrong-chain
upstream configuration leaves it at `configuration_saved` with no endpoint.
Listing services reconciles this effective state, so saved setup activates
without a sales approval after infrastructure becomes available. This is an
authenticated JSON-RPC gateway, not evidence of a Nodezuno-owned node fleet or
general blockchain-product availability.

The native Ethereum gRPC source uses a shared separately deployed gateway.
An Ethereum `grpc-api` record becomes active and receives the configured
public gateway origin only when the website's bounded standard gRPC health
probe sees `SERVING`. The same process reports `SERVING` only after it proves
the private database-backed authorization and weighted quota-admission boundary
and verifies upstream `eth_chainId` as `0x1`. Otherwise the record remains
`configuration_saved` with no endpoint.
No current production deployment evidence exists.

Every other blockchain product below is prelaunch:

- Nodezuno One
- Rollups
- NFT API
- Webhooks
- WebSockets
- Transfers API
- Token API
- Bundler API
- Gas Manager API
- Vault
- Atlas

Creating one of these products stores a durable `configuration_saved` record.
It does not invent an endpoint, capacity, pricing plan, uptime promise, or
blockchain infrastructure. The intended release path remains self-service.
Production availability is claimed only after the relevant product plane is
deployed, secured, monitored, and verified.

## Service API

The `/api/v1/developer/*` routes require a Nodezuno application session or the
retained verified private-preview identity fallback. Browser mutations require
an exact same-origin request. The separate
`/api/v1/control-plane/services*` routes require an unbound
`services:manage` API key and do not accept a browser session.

### List services

```http
GET /api/v1/developer/services
Accept: application/json
```

### Create a service

```http
POST /api/v1/developer/services
Content-Type: application/json
Origin: https://nodezuno.com
Idempotency-Key: service-create-<unique-client-value>

{
  "product": "rpc-api",
  "name": "Wallet production",
  "environment": "production",
  "network": "ethereum",
  "region": "ap-south"
}
```

The response status is `201`. `platform-api` is active. An `rpc-api` service
for Ethereum, Base, or Solana is active only with a verified upstream for its
network. An Ethereum `grpc-api` service is active only when the shared gateway
meets the readiness contract above. Other products, and any RPC protocol
without verified readiness, return `status: "configuration_saved"` and
`endpointPath: null`.

### Read and rename a service

All workspace roles can read one active service:

```http
GET /api/v1/developer/services/<service-id>
Accept: application/json
```

Only the display name is mutable. Send the exact `updatedAt` string from the
latest service response:

```http
PATCH /api/v1/developer/services/<service-id>
Content-Type: application/json
Origin: https://nodezuno.com

{
  "name": "Wallet production primary",
  "updatedAt": "2026-07-18T12:00:00.000Z"
}
```

The body accepts exactly `name` and `updatedAt`. The timestamp must be the
canonical UTC ISO representation with milliseconds. A successful update
advances `updatedAt` and records a redacted `service.updated` audit event. If
another writer changed the service first, the route returns
`409 service_update_conflict`; reload and deliberately retry with the new
snapshot. Missing, archived, and cross-workspace service identifiers all
return the same `404 service_not_found`. Rename is not an idempotent-create
operation and does not accept `Idempotency-Key`.

### Create a least-privilege key

```http
POST /api/v1/developer/api-keys
Content-Type: application/json
Origin: https://nodezuno.com
Idempotency-Key: key-create-<unique-client-value>

{
  "name": "Ethereum quickstart",
  "serviceId": "<service-id>"
}
```

`serviceId` must identify a non-archived callable service in the same
workspace. Every key receives exactly one compatible scope:

| Binding | Allowed scope |
| --- | --- |
| No service | `platform:identity` by default, or explicitly `services:manage` |
| `platform-api` | `platform:identity` |
| Ethereum, Base, or Solana `rpc-api` | `rpc:invoke` |
| Ethereum `grpc-api` | `grpc:invoke` |

To issue a service-automation key, omit `serviceId` and send
`"scopes": ["services:manage"]`. No multi-scope key is accepted. An unbound
`rpc:invoke` or `grpc:invoke` key is not accepted. A binding and scope cannot
be reassigned after issue. Rotate or create a replacement instead of
broadening an existing key.

The raw secret is returned only by the successful creation response. Later
list, audit, and lifecycle responses return safe metadata only.

API-key creation, API-key rotation, and service creation require a 16 to 128
character `Idempotency-Key` containing only ASCII letters, digits, `.`, `_`,
`:`, or `-`. The operation namespace, private key hash, normalized request
hash, and resource identifier are retained for 24 hours. An exact service
creation retry returns the original service. An exact API-key creation or
rotation replay returns `409 api_key_secret_already_issued` because the raw
secret cannot be disclosed twice. Reusing the same key with changed input
returns `409 idempotency_key_reused`. Losing a successful key-creation response
requires revoking or rotating the resource with a new idempotency key.

### Rotate a key

Owners and administrators can rotate an active, unexpired key through:

```http
POST /api/v1/developer/api-keys/<key-id>/rotate
Content-Type: application/json
Origin: https://nodezuno.com
Idempotency-Key: key-rotation-<unique-client-value>

{}
```

The optional `name` field can rename the replacement. In one database batch,
Nodezuno inserts the replacement with the exact existing scope and service
binding, records redacted audit events, and revokes the source. The replacement
secret is returned only once. Rotation works at the normal active-key limit,
but it cannot broaden a key or repair an archived service binding.

### Automate service lifecycle

An owner or administrator first creates an unbound key with exactly
`services:manage`:

```json
{
  "name": "Production service automation",
  "serviceId": null,
  "scopes": ["services:manage"]
}
```

That bearer key can use:

| Method | Route | Contract |
| --- | --- | --- |
| `GET`, `POST` | `/api/v1/control-plane/services` | List or idempotently create |
| `GET`, `PATCH`, `DELETE` | `/api/v1/control-plane/services/{id}` | Read, optimistic rename, or archive |
| `GET` | `/api/v1/control-plane/services/{id}/usage?window=24h` | Read fixed-size, zero-filled aggregate usage; windows are `24h`, `7d`, or `30d` |
| `GET`, `PUT` | `/api/v1/control-plane/services/{id}/rpc-access-policy` | Read or optimistically replace the complete policy by revision |

The API revalidates the key, active workspace, expiry, revocation, unbound
state, exact scope, and tenant on every request. The authorizing API-key ID is
recorded in audit events. Secrets, secret hashes, service names, RPC payloads,
and policy values are not copied into audit detail. A `services:manage` key
cannot call RPC, gRPC, or `/api/v1/platform/whoami`.

The repository CLI is an API client, not a separately published package. It
accepts the key only through `NODEZUNO_API_KEY`, rejects redirects, uses HTTPS
except for loopback development, rejects responses larger than 1 MiB, and
rejects policy files larger than 32 KiB. It reads the API origin from
`NODEZUNO_API_ORIGIN` or `--origin`:

```bash
export NODEZUNO_API_ORIGIN=https://nodezuno.com
export NODEZUNO_API_KEY='<unbound-services-manage-key>'

pnpm nodezuno -- services list
pnpm nodezuno -- services get <service-id>
pnpm nodezuno -- services create \
  --product rpc-api \
  --name 'Wallet production' \
  --environment production \
  --network ethereum \
  --region ap-south
pnpm nodezuno -- services rename <service-id> \
  --name 'Wallet production primary' \
  --updated-at '2026-07-18T12:00:00.000Z'
pnpm nodezuno -- services usage <service-id> --window 24h
pnpm nodezuno -- services policy get <service-id>
pnpm nodezuno -- services policy set <service-id> --file policy.json
pnpm nodezuno -- services archive <service-id>
```

### Invoke HTTP JSON-RPC

Create an API key carrying the `rpc:invoke` scope, then send a single JSON-RPC
2.0 call or a batch:

```http
POST /api/v1/rpc/<service-id>
Authorization: Bearer nzu_live_<key-id>_<secret>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "eth_chainId",
  "params": []
}
```

For a Solana service, replace the method with `getHealth`.

The key must be active, unexpired, scoped for `rpc:invoke`, and owned by the
same workspace as the service. Its `serviceId` must exactly match the
requested service. Unbound `rpc:invoke` keys cannot be issued. A key bound to
another service returns HTTP `403`, JSON-RPC code `-32003`, and detail code
`api_key_service_denied` without reaching an upstream. The service must be an
unarchived active `rpc-api` record for `ethereum`, `base`, or `solana`.
Customer headers and the Nodezuno bearer key are not forwarded to the
configured upstream.

The gateway accepts a maximum 256 KiB request and 20 calls per batch. It bounds
upstream responses at 2 MiB. Administrative, signer, filter, subscription, and
unsafe EVM namespaces are blocked. Solana uses an explicit method allowlist.
Health-aware ordered failover is attempted only for defined network-specific
retry-safe methods and stops after two provider attempts. A
deterministic circuit breaker temporarily removes an upstream after two
consecutive transport failures, then probes it after an exponential cooldown
from 15 seconds up to two minutes. When every upstream is open, one probe is
admitted. Transaction submissions always use the configured primary once and
are never rerouted. EVM log ranges, fee history, proof key lists, call data,
and explicit call gas are bounded.

Malformed or empty JSON returns parse error `-32700` with a null ID.
Structurally invalid requests and empty batches return `-32600`. Valid members
of a mixed batch execute while invalid members return per-item errors in the
original order. A bounded-parameter violation returns `-32602`.

Both quota layers use method-weighted units:

- `NODEZUNO_RPC_HOURLY_CALL_QUOTA` is per service and API key. It defaults to
  1,000 quota units per hour and accepts values from 100 through 1,000,000.
- `NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA` covers every service and key in the
  workspace. It defaults to 10,000 quota units per hour and accepts values
  from 1,000 through 10,000,000.

On Ethereum and Base, ordinary calls cost one unit, `eth_call` and
`eth_feeHistory` cost three, `eth_getProof` costs five, and `eth_getLogs` costs
ten. On Solana, ordinary allowed calls cost one; `getBlocks` and
`getBlocksWithLimit` cost three; `getBlock`, `getTransaction`,
`getTokenAccountsByDelegate`, `getTokenAccountsByOwner`, and
`simulateTransaction` cost five; and `getProgramAccounts` costs ten. A batch
consumes the combined weight of its executable members.

Both counters are enforced atomically. Responses publish rate-limit metadata,
and exhaustion returns HTTP `429` with a JSON-RPC error. Upstream exhaustion or
failure never falls back to fabricated data. Aggregate telemetry keeps actual
RPC call counts separate from weighted quota consumption.

### Invoke native gRPC

After an operator deploys the ready shared gateway, create an Ethereum
`grpc-api` service and use a key carrying `grpc:invoke`. Each unary
`/nodezuno.ethereum.v1.EthereumProxy/Call` request must include exactly one
bearer key and one canonical service identifier:

```text
authorization: Bearer nzu_live_<key-id>_<secret>
x-nodezuno-service-id: <service-id>
```

The service ID must be a lowercase UUIDv4 for a non-archived Ethereum
`grpc-api` record in the key's active workspace. A bound key must match that
service. Revocation, expiry, workspace state, scope, and service binding are
checked against the configured control-plane database on each authorization
decision. A shared gateway supports many workspace service records; creating
a service does not create a per-service gateway deployment.

Before an allowed call reaches an upstream, the gateway derives the same EVM
method weight used by HTTP JSON-RPC and asks the private authorization and
quota-admission route to atomically consume both the API-key/service and
workspace hourly quota.
Credential denial consumes no quota. Exhaustion denies the call. Native gRPC
therefore shares the published Ethereum quota ceilings and usage buckets
rather than bypassing them.

The standard gRPC health service remains available to infrastructure probes,
but it reports `SERVING` only while the same process can reach the private
database-backed decision boundary and can verify Ethereum mainnet upstream
chain ID `0x1`. The preferred upstream array contains one to four ordered HTTPS
providers with isolated credentials and bounded timeouts. The gateway makes at
most two attempts for its enforced safe read-only catalog.
`eth_sendRawTransaction` and every other write remain disabled. A readiness
gate blocks customer calls otherwise. This path is self-service only after the
separate gateway, private control-plane route, public endpoint, and production
evidence exist. The current owner-only Sites deployment does not meet that
release boundary.

### Archive a service

```http
DELETE /api/v1/developer/services/<service-id>
Origin: https://nodezuno.com
```

Archiving preserves the audit trail and removes the record from the active
console list. A key bound to that service is no longer usable for HTTP
JSON-RPC or native gRPC and is never silently reassigned to another service.

## Authorization

Workspace membership is resolved by stable account ID. Legacy private-preview
members can still resolve by verified email until they are migrated. Wallet
placeholder emails are never used for membership authorization.

Workspace roles are:

- `owner`
- `admin`
- `developer`

Owners and administrators manage API keys, including issuance, rotation, and
revocation. All three roles can list, read, create, rename, and archive service
configurations. Every workspace, key, and service mutation writes a developer
audit event.

## Limits

- One current owned workspace is returned per account.
- Up to 10 active API keys are allowed per workspace.
- Up to 50 unarchived service records are allowed per workspace.
- Service creation is limited to 30 attempts per identity per hour.
- Service archive is limited to 60 attempts per identity per hour.
- Ethereum, Base, and Solana RPC use JSON-RPC 2.0 over HTTP. Native gRPC is a
  separate Ethereum Go runtime.
  Its `control-plane` mode shares the configured database workspace and
  API-key lifecycle through a private fail-closed authorization and
  quota-admission route. Its optional `static-digest` mode is
  operator-managed and does not provide that self-service lifecycle. Neither
  mode is deployed by the current Sites release.
- Names and enum values are strictly validated.
- Browser mutations require an exact same-origin request.
