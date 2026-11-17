# Nodezuno.com API reference

> **Product boundary:** Upgrade Assurance is the sole current public offer.
> Workspace, RPC, and gRPC routes are retained engineering foundations and do
> not establish a public RPC product. See [README.md](README.md).

**Contract:** Website API v1
**Canonical origin:** `https://nodezuno.com`
**Last verified against source:** 25 August 2026

The Cloudflare production defaults disable payment instructions. After explicit
launch approval and manual-mode activation, a buyer can receive Ethereum
Mainnet USDC/USDT instructions and submit the transaction hash and Telegram
username. The app queues a receipt email and alerts the operator. The operator
must inspect the transaction and record a manual check before the order
advances. Automatic payment verification is off. The retained
`ethereum_mainnet` verifier mode is not enabled in this Cloudflare profile.

## Scope

This document describes the API implemented by Nodezuno.com. It operates the
website health surface, a self-service developer workspace and API-key control
plane, Better Auth accounts and sessions, durable service configurations,
an authenticated Ethereum, Base, and Solana JSON-RPC beta gateway, a private authorization
boundary for a separately deployed native gRPC gateway, prelaunch catalogs,
deterministic gas calculator, public request intake, newsletter consent,
account-ID-bound request history, request-first Upgrade Assurance orders,
protected customer access, direct Ethereum mainnet USDC and USDT
settlement, secure customer deliverable release, and restricted website
administration. It also includes SQLite notification and payment-verification
workers and customer lifecycle email sent through Zoho SMTP from
`info@nodezuno.com`.

The workspace, key-management routes, key-authenticated identity probe, and
bounded multi-chain JSON-RPC gateway are implemented services. Each RPC
network activates only after a real operator-configured upstream passes its
chain-specific gate and remains beta maturity. This
does not imply a Nodezuno-owned node fleet or the availability of WebSockets,
webhooks, transaction orchestration, indexing, NFT and token data, ERC-4337
bundling, gas sponsorship, signer policy, faucets, snapshots, or rollup
operations.

## Retained RPC implementation boundary

The repository retains an Ethereum Mainnet, Base Mainnet, and Solana Mainnet
Beta HTTP JSON-RPC implementation at
`POST /api/v1/rpc/{serviceId}`. Signup and use do not require a payment card.
The default hourly limit is 1,000 quota units for each API-key-and-service pair
and 10,000 quota units across the workspace. That RPC beta has no paid billing,
paid overage, invoice, or automatic charge. This implementation is not a
current public product and no production availability is claimed.

Upgrade Assurance is a separate fixed commercial workflow. It is USD 7,500
total, with a USD 3,750 scheduling deposit and USD 3,750 balance. A valid
bounded submission automatically creates an exact, versioned fixed service
order. The buyer can accept its terms and create a payment instruction without
administrator approval. The same price and payment structure apply to EVM and
non-EVM reviews in the supported target catalog. The service order records the
submitted chain, scope limits, reviewer, exclusions, and expiry.
This narrow API is
not a general billing, subscription, invoice, tax, coupon, or automatic-charge
platform.

The retained RPC implementation has no sales-approval state in its machine
workflow. That fact does not publish or launch it as a Nodezuno product.
WebSocket access and every other blockchain product remain prelaunch and have
no usable public product contract.

The native gRPC source supports the same self-service key lifecycle when its
separate gateway and private website control-plane connection are deployed and
ready. No current production deployment evidence exists, so it is not part of
a public product claim.

The published limits are enforced as method-weighted quota units. Ethereum and
Base ordinary calls cost one, `eth_call` and `eth_feeHistory` cost three,
`eth_getProof` costs five, and `eth_getLogs` costs ten. Solana ordinary allowed
calls cost one; expensive block, transaction, account-scan, and simulation
methods cost three, five, or ten according to the published schedule.

## Contract conventions

### Versioning

- Public website routes are pinned to `/api/v1`.
- The current public machine-readable contract is available at
  `GET /api/v1/openapi`.
- Additive response fields may be introduced within v1. Consumers should ignore
  unknown response fields.
- A breaking request or response change requires a new major path or a
  documented migration period.

### JSON envelopes

Successful JSON responses normally use:

```json
{
  "data": {},
  "requestId": "8a0f4c2e-..."
}
```

Submission responses may also include a top-level `replayed` boolean.
`GET /api/v1/openapi` returns the OpenAPI document directly, and a form-encoded
newsletter unsubscribe returns an HTTP redirect rather than a JSON envelope.

### Request IDs

Every v1 JSON response includes:

- an `X-Request-Id` response header; and
- the same value in the response body as `requestId`.

The edge `cf-ray` value is used when it is present and well formed. Otherwise,
the application generates a UUID. Record the request ID when reporting a
failure; never use it as authentication or authorization material.

### Time representation

- Envelope times such as `checkedAt`, `generatedAt`, `calculatedAt`, and
  submission receipt `createdAt` are ISO 8601 strings.
- Catalog row fields such as `updatedAt`, `verifiedAt`, `startedAt`, and
  `resolvedAt` are Unix epoch milliseconds or `null`.
- All server-generated times are UTC.
- Upgrade Assurance money values are integer minor units with lowercase
  currency `usd`; `375000` is USD 3,750.

### Media types and size limits

- JSON mutations require `Content-Type: application/json`.
- JSON request bodies are streamed through a strict 32 KiB limit.
- `POST /api/v1/rpc/{serviceId}` instead accepts up to 256 KiB because it
  carries standard JSON-RPC 2.0 single or bounded batch requests.
- Invalid UTF-8 is rejected.
- Newsletter unsubscribe also accepts
  `application/x-www-form-urlencoded`, limited to 8 KiB.
- Successful JSON uses `application/json; charset=utf-8`.
- Guard and validation errors use
  `application/problem+json; charset=utf-8`.

### Browser-origin boundary

Every browser-session mutation, public form mutation, and administrator
mutation requires an exact same-origin `Origin` header. Requests with
`Sec-Fetch-Site: cross-site` are also rejected. Sites derives the expected
origin from the actual request URL. The container profile compares against the
exact configured `PUBLIC_ORIGIN`, so it does not trust a forwarded `Host`
value.

Stablecoin claim submission requires same origin and an authorized buyer
session or scoped order cookie. There is no public mail-provider callback.

A container also enforces one explicit ingress mode. `direct` accepts traffic
only when the effective protocol and host exactly match `PUBLIC_ORIGIN`,
requires `NODEZUNO_ORIGIN_SECRET` to be completely blank, removes any
client-supplied origin-secret header, and uses the provider-appended last
`X-Forwarded-For` address for rate-limit identity when it is valid. It falls
back to a valid `X-Real-IP`, then `unknown`. `trusted-gateway` requires a
separate gateway to inject the strong, distinct
`NODEZUNO_ORIGIN_SECRET` on every request. A missing or empty
`NODEZUNO_INGRESS_MODE` selects `trusted-gateway` and therefore fails closed
without that secret. `/api/v1/live` and `/api/v1/ready` remain available to
provider health checks, but their availability does not bypass readiness.

The API-key-authenticated `GET /api/v1/platform/whoami` and
`POST /api/v1/rpc/{serviceId}` routes, plus
`/api/v1/control-plane/services*`, are intended for server-to-server use and
use an exact-scope bearer credential instead of a browser session. CORS access
is not offered. `POST /api/v1/internal/grpc/authorize` is a private server-to-server
route for the native gateway and never accepts a customer session as its
control-plane credential.

## Endpoint inventory

| Method | Route | Access | Data maturity | Cache |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/live` | Public | Process liveness | No store |
| `GET` | `/api/v1/ready` | Public | Live website backend readiness | No store |
| `GET` | `/api/v1/health` | Public | Detailed website health | No store |
| `GET` | `/api/v1/status` | Public | Visible website and Upgrade Assurance component catalog | 15 s browser / 30 s shared |
| `GET` | `/api/v1/chains` | Public | Live route; prelaunch catalog | 60 s browser / 300 s shared |
| `GET` | `/api/v1/abuse-challenge` | First-party browser | Live anti-abuse control | No store |
| `POST` | `/api/v1/gas-estimate` | Same origin | Live calculator | No store |
| `POST` | `/api/v1/submissions` | Same origin + challenge | Live website intake | No store |
| `POST` | `/api/v1/review-orders` | Same origin + challenge + idempotency key | Direct fixed service order; exact-retry-reproducible capability | No store |
| `POST` | `/api/v1/review-orders/{id}/access` | Same origin + private capability | Exchange capability for scoped HttpOnly cookie | No store |
| `GET` | `/api/v1/review-orders/{id}` | Scoped cookie or exact bound account | Safe order, proposal, payment, and released-deliverable projection | No store |
| `GET` | `/api/v1/review-orders/{id}/deliverables/{deliverableId}/download` | Scoped cookie or exact bound account | Private Worker stream from the verified R2 object | No store |
| `GET` | `/api/v1/review-orders/{id}/payment-confirmations/{confirmationId}` | Scoped cookie or exact bound account | Private immutable Ethereum payment-confirmation JSON | No store |
| `POST` | `/api/v1/review-orders/{id}/payment-intents` | Same origin + authorized buyer + idempotency key | Exact Ethereum mainnet USDC or USDT instruction | No store |
| `POST` | `/api/v1/review-orders/{id}/payment-intents/{intentId}/claims` | Same origin + authorized buyer | Transaction claim queued for RPC verification | No store |
| `POST` | `/api/v1/newsletter/subscriptions` | Same origin + challenge | Live double-opt-in intake | No store |
| `POST` | `/api/v1/newsletter/confirm` | Same origin + private token | Live double-opt-in confirmation | No store |
| `POST` | `/api/v1/newsletter/unsubscribe` | Same origin + private token | Live suppression | No store |
| `GET` | `/api/v1/auth/providers` | Public | Email verification/recovery, Google, EVM, and Solana availability | No store |
| `GET` | `/api/v1/auth/session` | Application session or trusted fallback | Current customer identity | No store |
| `POST` | `/api/v1/account/export` | Same origin + fresh application session | Bounded caller-owned data export, including stablecoin claims | No store |
| `GET`, `POST` | `/api/auth/*` | First-party browser | Account and session protocol | No store |
| `GET` | `/api/v1/developer/workspace` | Application session or trusted fallback | Live developer control plane | No store |
| `POST` | `/api/v1/developer/workspace` | Same origin + application session | Live developer control plane | No store |
| `GET` | `/api/v1/developer/api-keys` | Authenticated owner/admin | Live developer control plane | No store |
| `POST` | `/api/v1/developer/api-keys` | Same origin + authenticated owner/admin | Live developer control plane | No store |
| `POST` | `/api/v1/developer/api-keys/{id}/rotate` | Same origin + authenticated owner/admin | Atomic replacement with one-time secret | No store |
| `DELETE` | `/api/v1/developer/api-keys/{id}` | Same origin + authenticated owner/admin | Live developer control plane | No store |
| `GET`, `POST` | `/api/v1/developer/services` | Application session or trusted fallback | Live records; product-dependent maturity | No store |
| `GET`, `PATCH`, `DELETE` | `/api/v1/developer/services/{id}` | Application session; same origin for mutations | Live read, optimistic rename, and archive | No store |
| `GET` | `/api/v1/developer/services/{id}/usage` | Application session | Tenant aggregate RPC usage | No store |
| `GET`, `PUT` | `/api/v1/developer/services/{id}/rpc-access-policy` | Application session; same origin for update | Tenant RPC policy | No store |
| `GET` | `/api/v1/developer/workspace/audit-events` | Application session | Redacted tenant audit timeline | No store |
| `GET`, `POST` | `/api/v1/developer/workspace/members` | Application session; role-gated mutation | Workspace team | No store |
| `PATCH`, `DELETE` | `/api/v1/developer/workspace/members/{id}` | Same origin + role-gated session | Workspace team mutation | No store |
| `GET`, `POST` | `/api/v1/control-plane/services` | Unbound bearer key with `services:manage` | Programmatic list and idempotent create | No store |
| `GET`, `PATCH`, `DELETE` | `/api/v1/control-plane/services/{id}` | Unbound bearer key with `services:manage` | Programmatic read, optimistic rename, and archive | No store |
| `GET` | `/api/v1/control-plane/services/{id}/usage` | Unbound bearer key with `services:manage` | Programmatic tenant usage | No store |
| `GET`, `PUT` | `/api/v1/control-plane/services/{id}/rpc-access-policy` | Unbound bearer key with `services:manage` | Programmatic tenant policy | No store |
| `GET` | `/api/v1/platform/whoami` | Bearer key with `platform:identity` | Live developer control plane | No store |
| `POST` | `/api/v1/rpc/{serviceId}` | Bound bearer key with `rpc:invoke` | Free multi-chain HTTP JSON-RPC beta; real upstream required | No store |
| `POST` | `/api/v1/internal/grpc/authorize` | Private gateway bearer secret | Internal non-enumerating authorization and weighted quota admission | No store |
| `GET` | `/api/v1/openapi` | Public | Live API contract | 300 s browser / 3600 s shared |
| `GET` | `/api/v1/admin/submissions` | Verified allowlisted administrator | Live internal operation | No store |
| `GET` | `/api/v1/admin/review-orders` | Verified allowlisted administrator | Restricted review and delivery queue | No store |
| `PATCH` | `/api/v1/admin/review-orders/{id}` | Same origin + administrator | Exceptional service-order reissue or guarded lifecycle action | No store |
| `POST` | `/api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}` | Same origin + fresh administrator + idempotency key | Apply eligible seller-received Ethereum evidence to the due obligation | No store |
| `POST` | `/api/v1/admin/review-orders/{id}/deliverables` | Same origin + administrator | Seal one file manifest and return the same-origin R2 upload route | No store |
| `PUT` | `/api/v1/admin/review-orders/{id}/deliverables/{deliverableId}/upload` | Same origin + fresh administrator | Stream exact-length file to private R2 with SHA-256 verification | No store |
| `POST` | `/api/v1/admin/review-orders/{id}/deliverables/{deliverableId}/finalize` | Same origin + administrator | Verify R2 checksum, metadata, ETag, and object version | No store |
| `PATCH` | `/api/v1/admin/submissions/{id}` | Same origin + administrator | Live internal operation | No store |
| `PATCH` | `/api/v1/admin/status/services/{slug}` | Same origin + administrator | Live internal operation | No store |
| `PATCH` | `/api/v1/admin/chains/{slug}` | Same origin + administrator | Live internal operation | No store |
| `POST` | `/api/v1/admin/maintenance` | Same origin + administrator | Live internal operation | No store |
| `GET` | `/api/v1/admin/node-attachments` | Verified allowlisted administrator | Redacted attachment readiness | No store |

The OpenAPI document covers the public website API and explicitly marks the
private native gRPC authorization and weighted quota-admission boundary as
internal. Administrator routes are intentionally omitted from that public
contract.

## Public read endpoints

### `GET /api/v1/live`

Confirms that the deployed process can answer HTTP without calling the database or an
identity provider. Infrastructure health checks should use this route so a
temporary dependency outage does not restart a healthy process.

### `GET /api/v1/ready`

This compact readiness probe checks website runtime configuration and the
required selected-database schema and seeds. It does not probe any blockchain endpoint or
proposed Nodezuno product service.

Ready response:

```json
{
  "data": {
    "service": "nodezuno-web-control-plane",
    "status": "ready",
    "checkedAt": "2026-07-17T12:00:00.000Z"
  },
  "requestId": "..."
}
```

The route returns `200` with `status: "ready"` or `503` with
`status: "not_ready"`. Both responses use the same readiness envelope so
infrastructure monitors can parse them without receiving dependency details.

### `GET /api/v1/health`

This detailed health route performs the same checks and reports their
high-level outcomes:

```json
{
  "data": {
    "service": "nodezuno-web-control-plane",
    "status": "healthy",
    "database": true,
    "configuration": true,
    "ethereumRpc": {
      "configured": true,
      "upstreamCount": 3,
      "scope": "Validated gateway configuration only. No upstream request, chain ID check, or chain-head health probe is performed."
    },
    "rpcNetworks": {
      "ethereum": {
        "configured": true,
        "upstreamCount": 1,
        "scope": "Validated gateway configuration only. No upstream request or chain verification is performed."
      },
      "base": {
        "configured": true,
        "upstreamCount": 1,
        "scope": "Validated gateway configuration only. No upstream request or chain verification is performed."
      },
      "solana": {
        "configured": true,
        "upstreamCount": 1,
        "scope": "Validated gateway configuration only. No upstream request or chain verification is performed."
      }
    },
    "nativeGrpc": {
      "configured": true,
      "endpointConfigured": true,
      "authenticationConfigured": true,
      "scope": "Validated native gateway configuration only. No serving-health request is performed."
    },
    "checkedAt": "2026-07-17T12:00:00.000Z",
    "scope": "Website control-plane readiness plus Ethereum, Base, Solana RPC, and native Ethereum gRPC configuration. This is not blockchain network health."
  },
  "requestId": "..."
}
```

The database check requires every website, Better Auth, wallet identity,
workspace, API-key, audit, developer-service, review-order, payment, and
payment tables to be queryable, required status-service
seeds, and at least eight chain seeds. Runtime
configuration rejects repository placeholders, surrounding or control
whitespace, low-diversity secrets, reuse among the rate-limit, API-key,
authentication, and origin secrets, non-operational administrator addresses,
one-sided Google or Zoho SMTP configuration. `BETTER_AUTH_URL` must be one exact
application origin. Optional provider sets must be either complete and valid
or entirely absent.

Container readiness additionally requires `PUBLIC_ORIGIN` to equal
`BETTER_AUTH_URL`, one valid selected database configuration, and a valid
ingress boundary. `direct` requires an entirely blank
`NODEZUNO_ORIGIN_SECRET`; `trusted-gateway` requires a separate valid origin
secret. Cloudflare Access is an optional legacy identity overlay, not a
requirement for customer accounts, application-account administrator access,
the administrator allowlist, or a portable container.
`sqlite` requires one bounded absolute persistent-volume path; `d1-rest`
requires its account, database UUID, and restricted token.

Cloudflare manual payment readiness requires both
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=manual_ethereum`; it does not need an RPC
verifier or heartbeat. The operator checks the submitted transfer and records
a manual decision in the order audit trail. Automatic stablecoin verification
readiness separately requires
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true`,
`NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet`, and two or three valid
dedicated Ethereum RPC endpoint definitions with distinct provider identities
and normalized hosts. Payment mode `disabled` stops new instructions. Public
endpoints must use HTTPS;
private or loopback HTTP is accepted only for explicit internal nodes. Missing,
partial, or malformed configuration keeps payment creation and verification
closed.

Alternate AWS container readiness also requires `AWS_REGION`, a valid
`NODEZUNO_DELIVERABLE_BUCKET`, and the exact
`NODEZUNO_DELIVERABLE_KMS_KEY_ARN`. This is configuration readiness, not proof
that S3, KMS, CORS, IAM, or CloudTrail works. Those require deployed release
checks.

`ethereumRpc` is the aggregate compatibility view.
`rpcNetworks.{ethereum,base,solana}` exposes per-network configuration.
`nativeGrpc` reports only whether the public endpoint and private
authentication settings form a valid configuration. Counts and booleans are
redacted. Health does not contact an RPC provider, verify a chain, call gRPC
serving health, or inspect chain-head freshness. Optional RPC and gRPC
configuration never changes overall website health.

The health route returns `200` with `status: "healthy"`. It returns `503` with
`status: "unavailable"` when a completed check reports a failed dependency, or
a Problem response if the check itself throws.

### `GET /api/v1/status`

Returns the visible website and Upgrade Assurance service catalog plus the
database-backed incident catalog.

```json
{
  "data": {
    "overall": "mixed",
    "services": [
      {
        "slug": "website",
        "name": "Public website",
        "description": "The public product, documentation, authentication, and buyer journey answered this request.",
        "state": "operational",
        "updatedAt": 1784366400000
      },
      {
        "slug": "review-intake",
        "name": "Upgrade review intake",
        "description": "Structured review intake and private tracking persistence.",
        "state": "operational",
        "updatedAt": 1784366400000
      },
      {
        "slug": "payment-verification",
        "name": "Ethereum payment verification",
        "description": "Ethereum mainnet USDC and USDT claims are verified by a fresh independent-provider RPC quorum before an order is marked paid.",
        "state": "operational",
        "updatedAt": 1784366400000
      },
      {
        "slug": "review-portal",
        "name": "Private review portal",
        "description": "Capability-protected proposal, payment, and engagement status.",
        "state": "operational",
        "updatedAt": 1784366400000
      }
    ],
    "incidents": [],
    "generatedAt": "2026-08-13T12:00:00.000Z",
    "disclaimer": "This endpoint reports current website and intake readiness plus honest product maturity. It is not historical uptime, an engagement SLA, or evidence that a customer review is active."
  },
  "requestId": "..."
}
```

The route reads visible durable status rows directly. `website` is reconciled
to `operational` because it answered the request. `payment-verification` is
reconciled to `operational` only while the persisted heartbeat matches the
current independent-provider configuration, reports every endpoint healthy,
and is no older than 150 seconds. Otherwise it is `preview` and new payment
instructions fail closed. Review intake and portal states remain curated until
a separate telemetry integration is reviewed. These states do not prove
historical uptime, a particular transaction's finality, a paid order, an active
engagement, or a service-level commitment.

Service states are `preview`, `operational`, `degraded`, `partial_outage`,
`major_outage`, or `maintenance`. Incident severity is `none`, `minor`,
`major`, or `critical`; incident state is `investigating`, `identified`,
`monitoring`, or `resolved`.

`overall` is derived conservatively:

1. a major service outage or active major/critical incident yields `incident`;
2. a degraded/partial service or active minor incident yields `degraded`;
3. maintenance or any other active incident yields `maintenance`;
4. no services yields `unknown`;
5. all operational yields `operational`;
6. all preview yields `preview`; and
7. any other mixture yields `mixed`.

At most 20 incidents are returned, newest first. Incident update rows exist in
the data model but are not included in this v1 response.

### `GET /api/v1/chains`

Returns the visible chain publication catalog. It is a plan and evidence
surface, not endpoint discovery.

Query parameters:

| Name | Rule |
| --- | --- |
| `q` | Optional, case-insensitive name or slug substring; maximum 100 characters |
| `family` | Optional, exact case-sensitive family match; maximum 40 characters; `All` disables the filter |

Response chain fields:

| Field | Meaning |
| --- | --- |
| `slug` | Stable catalog identifier |
| `name` | Display name |
| `family` | Execution family, such as `EVM`, `EVM L2`, `SVM`, or `UTXO` |
| `finality` | Planning description of the finality model, not a settlement warranty |
| `stage` | `planned`, `preview`, `full`, or `data_only` |
| `capabilities` | Published capability strings; empty until evidence is entered |
| `tone` | Presentation token |
| `verifiedAt` | Epoch milliseconds for the latest full/data-only promotion, otherwise `null` |
| `updatedAt` | Epoch milliseconds for the latest catalog change |

Example:

```json
{
  "data": {
    "chains": [
      {
        "slug": "ethereum",
        "name": "Ethereum",
        "family": "EVM",
        "finality": "Economic",
        "stage": "planned",
        "capabilities": [],
        "tone": "blue",
        "verifiedAt": null,
        "updatedAt": 1784280000000
      }
    ],
    "count": 1,
    "generatedAt": "2026-07-17T12:00:00.000Z",
    "disclaimer": "Catalog stages describe Nodezuno's current product plan. They are not claims of live endpoint availability."
  },
  "requestId": "..."
}
```

A query or family value over its bound returns `400 invalid_filter`.

### `GET /api/v1/openapi`

Returns the OpenAPI 3.1 document for public v1 routes. The response itself is
not listed as a path inside that document. Administrator routes and future
product-plane contracts are also excluded.

## Browser anti-abuse challenge

### `GET /api/v1/abuse-challenge?purpose={purpose}`

Supported purposes are:

- `submission`
- `newsletter`

Response:

```json
{
  "data": {
    "challenge": "v1.submission....",
    "difficulty": 14,
    "expiresAt": "2026-07-17T12:02:00.000Z",
    "algorithm": "sha-256"
  },
  "requestId": "..."
}
```

The issued challenge:

- is valid for two minutes;
- is HMAC-signed with the runtime secret;
- is bound to the connecting IP address and user agent;
- allows at most 30 seconds of future clock skew; and
- is rejected when requested with `Sec-Fetch-Site: cross-site`.

The browser appends a decimal counter from `0` through `2,000,000`. The
SHA-256 digest of the complete `challenge.counter` string must have 14 leading
zero bits. The resulting value is sent as `X-Nodezuno-Challenge`.

This is a stateless proof-of-work control. It reduces automated form abuse; it
is not identity, CSRF authorization, a CAPTCHA guarantee, or product access.
Fetch a new challenge after expiry or when the client IP/user agent changes.

## Public mutation endpoints

### `POST /api/v1/gas-estimate`

Performs deterministic integer arithmetic. Nodezuno does not fetch a gas price
or asset price.

Request:

```json
{
  "gasUnits": "21000",
  "gwei": "2.5",
  "assetPrice": "3500"
}
```

Only these three keys are accepted. Strings are recommended.

| Field | Accepted implementation range |
| --- | --- |
| `gasUnits` | Integer from 1 through 100,000,000 |
| `gwei` | Decimal from 0 through 1,000,000; at most 9 fractional digits |
| `assetPrice` | Decimal from 0 through 100,000,000; at most 6 fractional digits |

Response:

```json
{
  "data": {
    "gasUnits": "21000",
    "gasPriceGwei": "2.5",
    "assetPriceUsd": "3500",
    "wei": "52500000000000",
    "totalGwei": "52500",
    "nativeAsset": "0.0000525",
    "fiatUsd": "0.18375",
    "calculatedAt": "2026-07-17T12:00:00.000Z",
    "disclaimer": "Planning estimate only. Actual cost depends on chain state, fee mechanics, calldata, and execution."
  },
  "requestId": "..."
}
```

The USD result is rounded to six decimal places using integer arithmetic.
`422 validation_failed` identifies invalid fields.

### `POST /api/v1/submissions`

Persists a sales, access, support, program, press, careers, security, or event
request.

Required headers:

```text
Content-Type: application/json
Origin: <the current Nodezuno site origin>
Idempotency-Key: <16-128 permitted characters>
X-Nodezuno-Challenge: <solved submission challenge>
```

`Idempotency-Key` may contain ASCII letters, digits, `.`, `_`, `:`, and `-`.
Uniqueness is scoped to the submission `kind`.

Exact request schema:

| Field | Rule |
| --- | --- |
| `kind` | One of the supported kinds below |
| `name` | Required text, 2–100 characters after trimming |
| `email` | Required, normalized to lowercase, maximum 254 characters |
| `company` | Required text, 2–160 characters |
| `team` | One of the supported team labels below |
| `message` | Required text, 20–5,000 characters; security contact maximum is 1,500 |
| `consent` | Must be `true` |
| `sourcePath` | Same-site path, not `/api/*`; final pathname maximum 200 characters |
| `website` | Honeypot; send an empty string |
| `utmSource` | String or `null`; normalized to at most 100 characters |
| `utmMedium` | String or `null`; normalized to at most 100 characters |
| `utmCampaign` | String or `null`; normalized to at most 100 characters |

All keys above are part of the accepted schema; unknown keys reject the entire
request. `sourcePath` query data is discarded after attribution fields are
normalized.

Supported kinds:

```text
sales
workspace_access
support
startup_program
press
career_interest
security_contact
event_interest
```

Supported team labels:

```text
Wallet
Exchange / brokerage
DEX / perps / trading
Stablecoin / payments
Chain / rollup
Fintech
Infrastructure / developer tools
Media / analyst
Independent researcher
Other
```

Example request:

```json
{
  "kind": "sales",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "company": "Analytical Engines",
  "team": "Infrastructure / developer tools",
  "message": "We are evaluating a policy-aware transaction infrastructure architecture.",
  "consent": true,
  "sourcePath": "/contact/sales",
  "website": "",
  "utmSource": null,
  "utmMedium": null,
  "utmCampaign": null
}
```

New receipt (`201`):

```json
{
  "data": {
    "id": "71888f53-71bf-4d19-a0e6-d93aef41729d",
    "status": "received",
    "createdAt": "2026-07-17T12:00:00.000Z"
  },
  "replayed": false,
  "requestId": "..."
}
```

An exact retry with the same kind, idempotency key, and normalized payload
returns the original receipt with `200` and `replayed: true`. Reusing the key
for a changed payload returns `409 idempotency_conflict`.

A non-empty honeypot receives a synthetic `202` response and is not persisted.
Clients must keep the field empty and must not treat a `202` honeypot response
as a durable receipt.

Every validated request, including an exact replay or idempotency conflict,
first consumes a request-level IP limit: 40 per 10 minutes for normal intake
and 12 per hour for security intake. New records then consume the stricter
creation limits below:

| Kind | IP window | Email window |
| --- | --- | --- |
| `security_contact` | 2 per hour | 5 per 24 hours |
| Every other kind | 5 per 10 minutes | 20 per 24 hours |

The scopes are per kind. `429 rate_limit_exceeded` includes `Retry-After`.

If the request arrives through the verified site identity boundary, the
identity email is stored separately as `submittedByEmail`. This enables the
request center. Merely typing the same email into an anonymous form does not
attach that submission to an account.

### Upgrade Assurance commerce

Money fields in this section are integer minor units. `750000` means USD 7,500
and `375000` means USD 3,750. The server fixes total, deposit, balance, and
currency. No buyer request accepts an amount or currency.

#### `POST /api/v1/review-orders`

Creates a versioned fixed service order ready for direct checkout. Required headers are JSON content type,
exact same-origin `Origin`, a valid `Idempotency-Key`, and a solved
`submission` challenge.

Exact request keys:

```json
{
  "contactName": "Ada Lovelace",
  "workEmail": "ada@example.com",
  "company": "Analytical Engines",
  "website": "https://example.com",
  "teamType": "Protocol team",
  "targetChain": "Ethereum",
  "auditedBaseline": "Audit report and commit 0123456",
  "proposedRelease": "Release commit abcdef0",
  "changeSummary": "A bounded upgrade to one previously audited contract set.",
  "affectedContracts": 3,
  "changedLines": 240,
  "artifactReadyDate": "2026-08-20",
  "targetReleaseDate": "2026-09-05",
  "publicLinks": "https://example.com/audit",
  "consent": true,
  "sourcePath": "/review/start"
}
```

`website`, both dates, and `publicLinks` may be omitted or null. Website, when
present, must be HTTPS. `changeSummary` is 30 to 5,000 characters;
`affectedContracts` is a required integer from 1 through 8; and `changedLines`
is a required integer from 1 through 500. Unknown keys are rejected. New
orders are limited to five per IP per hour and ten per normalized email per
day.

Every valid new order starts at `proposal_ready` with generated service-order
version 1. No allowlisted-administrator action is required before a buyer can
accept the terms and create an Ethereum payment instruction.

Response (`201`):

```json
{
  "data": {
    "order": {
      "id": "00000000-0000-4000-8000-000000000000",
      "reference": "NZ-2026-XXXXXXXX",
      "status": "proposal_ready",
      "trackingPath": "/review/00000000-0000-4000-8000-000000000000",
      "accessToken": "private-reproducible-capability",
      "createdAt": "2026-08-13T12:00:00.000Z"
    }
  },
  "requestId": "..."
}
```

The capability is returned on creation and reproduced only for an exact retry with the same idempotency key and normalized request. The browser places it in a URL fragment so
it is not sent in a navigation request. An exact retry returns `201` with the
existing order identity and the same capability. Reusing the key for changed
application data returns `409 idempotency_conflict`.

#### `POST /api/v1/review-orders/{id}/access`

Exchanges the private capability for a 30-day, path-scoped, HttpOnly,
SameSite=Lax cookie. HTTPS also sets Secure.

```json
{ "accessToken": "private-reproducible-capability" }
```

If the same request has an authenticated account and the order is not already
bound, the server binds it to that stable account ID and records no email-based
ownership. The capability is never accepted in a query string. Invalid access
returns `401 review_access_invalid`.

#### `GET /api/v1/review-orders/{id}`

Requires the scoped cookie or the exact stable account already bound to the
order. It returns only the safe projection:

```json
{
  "data": {
    "order": {
      "id": "...",
      "reference": "NZ-2026-XXXXXXXX",
      "status": "proposal_ready",
      "company": "Analytical Engines",
      "targetChain": "Ethereum",
      "fixedPriceCommerceEligible": true,
      "createdAt": "...",
      "updatedAt": "...",
      "nextAction": "Accept the fixed service order and terms, choose USDC or USDT on Ethereum Mainnet, then complete the scheduling deposit.",
      "proposal": {
        "version": 1,
        "status": "issued",
        "title": "Blockchain upgrade security review",
        "scope": "...",
        "exclusions": "...",
        "reviewer": "...",
        "currency": "usd",
        "totalAmount": 750000,
        "depositAmount": 375000,
        "balanceAmount": 375000,
        "issuedAt": "...",
        "expiresAt": "...",
        "acceptedAt": null
      },
      "stablecoinPayment": null,
      "paymentConfirmations": [],
      "deliverables": [],
      "telegramUsername": null
    }
  },
  "requestId": "..."
}
```

`proposal` is present for each new direct service order. Legacy or invalid
records can still have no generated service order. `stablecoinPayment` contains the current
safe Ethereum instruction and claim projection when one exists. It includes the exact
public-chain instruction, submitted transaction hash, normalized Telegram
username, current claim state, confirmation count, and fixed Etherscan link.
It excludes RPC endpoints, request headers, worker leases, access-capability
hashes, and administrative evidence. The Telegram username is restricted to
this authorized portal and the bound account export.

`paymentConfirmations` contains the immutable buyer-safe records for verified
deposit and balance transfers. Each record includes its confirmation ID,
receipt reference, public record hash, exact or reconciled record kind,
expected and received stablecoin facts, public-chain evidence, proposal and
accepted-terms snapshots, recording origin, and a notice that it is payment
confirmation only. It excludes the administrator decision note and email.

`deliverables` contains only released file ID, kind, filename, content type,
byte length, SHA-256, and lifecycle times. It never contains the R2 bucket,
object key, ETag, or version ID. An empty list means no file has been released,
not that object storage is unavailable.

Order status is one of `qualification_pending`, `needs_information`,
`proposal_ready`, `deposit_pending`, `deposit_paid`, `scheduled`, `in_review`,
`remediation`, `balance_due`, `paid`, `payment_refunded`, `completed`,
`declined`, or `cancelled`. Stablecoin intent and claim states are documented
under the payment endpoints below.

#### `POST /api/v1/review-orders/{id}/payment-intents`

Requires exact same origin and buyer authorization through the scoped order
cookie or bound account. The deposit is available for the current generated
service order after terms acceptance. The balance is available only when the
order is `balance_due`. Internal `proposal` field names are retained for API
compatibility and refer to the fixed service order, not a manual approval gate.
`Idempotency-Key` is mandatory. The server stores a purpose-separated hash of
that key and binds it to the order, phase, proposal version, and asset. Exact
reuse returns the original instruction; changed reuse returns
`409 payment_idempotency_conflict`.

Exact request body:

```json
{
  "acceptTerms": true,
  "proposalVersion": 1,
  "phase": "deposit",
  "asset": "USDC"
}
```

`asset` is exactly `USDC` or `USDT`. The server fixes Ethereum mainnet chain ID
1, the canonical token contract, six token decimals, the Nodezuno recipient,
and the USD 3,750 obligation. The browser cannot submit any of those values.

Creation also requires the persisted verifier heartbeat to match the current
two-or-three-provider configuration, report every endpoint healthy, and be no
older than 150 seconds. Configuration parsing is insufficient. An unhealthy or
stale heartbeat returns `503 payment_verifier_unhealthy` and creates no
instruction. The created row snapshots the confirmation threshold and accepted
service-terms version and SHA-256 hash so later configuration or text changes
cannot rewrite that instruction.

The response is `201` whether the server creates a safe instruction or reuses
the matching active instruction. Important fields are:

```json
{
  "data": {
    "payment": {
      "intent": {
        "id": "00000000-0000-4000-8000-000000000000",
        "phase": "deposit",
        "state": "awaiting_transfer",
        "asset": "USDC",
        "network": "Ethereum Mainnet",
        "chainId": 1,
        "tokenContract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "tokenDecimals": 6,
        "recipient": "0x07218C8E2B01fbff950Af65A0f36D3305520aC3b",
        "amount": 375000,
        "currency": "usd",
        "tokenAmount": "3750.001234",
        "amountAtomic": "3750001234",
        "referenceUnits": 1234,
        "proposalVersion": 1,
        "termsAcceptedAt": "2026-08-25T00:00:00.000Z",
        "expiresAt": "2026-08-26T00:00:00.000Z"
      },
      "claim": null
    },
    "configuration": {
      "confirmationsRequired": 12,
      "explorerTxBase": "https://etherscan.io/tx/",
      "seller": "Sanjay Sudagani, sole proprietor trading as Nodezuno",
      "verification": "Ethereum JSON-RPC evidence"
    }
  },
  "requestId": "..."
}
```

`tokenAmount` is the exact amount to transfer. It contains a unique suffix of
1 to 9,999 atomic units, which is 0.000001 to 0.009999 token, so the displayed
amount may be slightly above 3,750. Never round it. This suffix separates
otherwise identical obligations without relying on a memo field.

Creating the same asset and proposal version again returns the active
instruction. The buyer may change USDC to USDT only while the old instruction
is still awaiting transfer and has no active claim. An instruction normally
expires after 24 hours and never outlives an unaccepted proposal expiry.
For six hours after expiry, that instruction remains the only claimable
instruction for the phase. The API rejects replacement creation during this
evidence grace period so a transfer already being signed or broadcast cannot
be orphaned.

#### `POST /api/v1/review-orders/{id}/payment-intents/{intentId}/claims`

Requires exact same origin and the same buyer authorization. Exact body:

```json
{
  "transactionHash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "telegramUsername": "@protocolops"
}
```

The transaction hash must be one complete 32-byte Ethereum hash. Telegram is
mandatory and must be 5 to 32 username characters, beginning with a letter and
continuing with letters, digits, or underscores. The leading `@` is optional
on input. The server stores lowercase with exactly one leading `@`.

A `202` response means only that the unique claim was stored. It is not proof
of payment and does not advance the order. In the Cloudflare
`manual_ethereum` mode the claim and instruction enter `manual_review`, the
buyer and operator notification emails are queued, and the buyer should refresh
`GET /api/v1/review-orders/{id}` manually. No automatic polling or on-chain
verification runs. Other retained automatic-mode states are `submitted`,
`checking`, `confirming`, `verified`, `rejected`, and `manual_review`.

The worker verifies every configured RPC observation against chain ID 1, a
successful receipt, the canonical token contract, exactly one matching ERC-20
`Transfer` log, the exact recipient and atomic amount, the receipt block, the
minimum confirmation policy, and Ethereum finalized-block progress. Every
configured endpoint must return agreeing normalized evidence. Missing data,
RPC failure, disagreement, insufficient confirmations, and uncertain finality
remain `confirming` or move to `manual_review`. They never mark the order paid.

Only a verified claim advances `deposit_pending` to `deposit_paid`, or
`balance_due` to `paid`, in the same database batch as the verified claim,
intent, and order event. A transaction hash is globally single-use across all
orders and phases. The seller wallet has no private key in this application,
and the application cannot send funds or automate refunds.

In Cloudflare manual mode, the allowlisted administrator checks the transaction
on Ethereum Mainnet, records the token, success status, exact recipient, amount,
and other relevant details in a required note, then uses the
`confirm_payment_manually` action. The action is available only for an
unmodified customer-submitted manual claim. It advances the order and records
the operator note in the order event and administrator audit trail. It does not
create a cryptographic payment confirmation record or claim that the website
queried Ethereum.

Seller-received anomalies for amount mismatch, use of the other official
stablecoin, an ambiguous receipt, or a transfer after instruction expiry open
an immutable reconciliation case and leave the claim in `manual_review`.
These cases do not authorize a database edit or a request for a second buyer
payment. The guarded administrator decision is documented below.

#### `GET /api/v1/review-orders/{id}/payment-confirmations/{confirmationId}`

Requires the same private order authorization as the review page: a scoped
cookie created from the exact review capability, or the exact account bound to
the order. The confirmation ID must belong to that order. Cross-order and
unknown IDs return `404 payment_confirmation_not_found` without exposing
another customer's record.

The response is an attachment named from the immutable receipt reference. It
uses `Content-Type: application/json`, `Cache-Control: private, no-store,
max-age=0`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options:
nosniff`. Its top-level shape is:

```json
{
  "recordType": "Nodezuno Ethereum payment confirmation",
  "confirmation": {
    "id": "confirm-recon:00000000-0000-4000-8000-000000000000",
    "receiptReference": "NZ-RECON-0123456789ABCDEF0123456789ABCDEF",
    "recordHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "recordKind": "reconciliation",
    "phase": "deposit",
    "expectedAsset": "USDC",
    "receivedAsset": "USDC",
    "receivedAmount": "3750",
    "transactionHash": "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "confirmationsObserved": 12,
    "confirmationsRequired": 12,
    "rpcAgreementCount": 2,
    "recordedBy": "operator",
    "notice": "Payment confirmation only. This record is not a tax invoice or a custody receipt."
  }
}
```

The complete record also includes token contract, recipient, sender, atomic
amounts, obligation, block number and hash, log index and timestamp, evidence
hash, proposal version, accepted terms version, hash and time, confirmation
time, recording time, and an Etherscan transaction link. It proves what this
application recorded from finalized Ethereum evidence. It is explicitly not a
tax invoice, custody receipt, refund authorization, or statement that
Nodezuno signed or controlled the buyer's transfer.

#### Ethereum mainnet transfer boundary

Send only the selected canonical USDC or USDT token on Ethereum mainnet to the
recipient and transfer the exact server-issued `tokenAmount`. Transfers on
Base, Arbitrum, another network, another token contract, or native ETH do not
satisfy the instruction. A screenshot, wallet UI, explorer page, submitted
hash, or sender assertion has no payment authority. The Etherscan URL in a
response is a human convenience derived from a validated hash, not a verifier.

Only the Ethereum Mainnet stablecoin instruction, claim, verification, and
guarded reconciliation routes can create or advance payment state.

### `POST /api/v1/newsletter/subscriptions`

Stores consent for Nodezuno Signal.

Required headers are `Content-Type`, exact same-origin `Origin`, and a solved
`newsletter` challenge.

Exact request schema:

```json
{
  "email": "reader@example.com",
  "name": "Reader Name",
  "consent": true,
  "sourcePath": "/community/newsletter",
  "website": ""
}
```

- `email` is required, normalized to lowercase, and limited to 254 characters.
- `name` is optional or `null`, with a maximum of 100 characters.
- `consent` must be `true`.
- `sourcePath` follows the same same-site rules as submissions.
- `website` is a honeypot and must be empty.
- Unknown keys reject the request.

The endpoint is limited to 5 requests per IP per hour and 3 requests per email
per 24 hours.

Accepted response (`202`):

```json
{
  "data": {
    "state": "pending",
    "message": "If confirmation is needed, check this address's inbox for the next step."
  },
  "requestId": "..."
}
```

The endpoint always returns the same generic pending response, including for a
honeypot submission or an already subscribed address. The message does not
claim that an email was queued. This prevents account enumeration. A new
address is pending until its private confirmation link is submitted. If a pending link
is still live, or the address is already subscribed, a retry preserves all
tokens and queues no email. If the link expired or the address was
unsubscribed, the request rotates both private tokens and appends one new
confirmation delivery. Confirmation links expire after 72 hours.

### `POST /api/v1/newsletter/confirm`

Confirms a pending Nodezuno Signal subscription. The token is issued as 32
lowercase hexadecimal identifier characters, a dot, and a 64-character secret:

```json
{
  "token": "<32 hex>.<64 hex>"
}
```

Form posts may send the same `token` field. Requests require an exact
same-origin `Origin` and are limited to 30 per IP per hour. The server hashes
the secret with its token identifier, compares hashes in constant time, and
changes only the matching unexpired `pending` row to `subscribed`.

- A valid JSON token returns `200` with `state: "subscribed"`.
- Replaying the same confirmed token is idempotent and also returns
  `state: "subscribed"` without changing the original confirmation time.
- An expired token returns `state: "expired"`.
- A replaced, unknown, or withdrawn token returns `state: "invalid"`.
- A valid form post redirects with `303` to the token-free result page.
- An invalid token shape returns `422 invalid_confirmation_token`.

The email link opens `GET /community/newsletter/confirm?token=...`, which only
renders an explicit confirmation form. GET never changes state, so automated
email link scanners cannot subscribe an address.

### `POST /api/v1/newsletter/unsubscribe`

Suppresses a newsletter subscription without revealing whether the token
matched a row.

JSON:

```json
{
  "token": "<40-200 URL-safe characters>"
}
```

Form posts may instead send:

```text
token=<url-encoded-token>
```

The token must match `[A-Za-z0-9_-]{40,200}`. Requests are limited to 20 per IP
per hour.

- A valid JSON token always returns `200` with a non-enumerating completion
  message.
- A valid form post redirects with `303` to
  `/community/newsletter/unsubscribe?state=complete`.
- An invalid token shape returns `422 invalid_unsubscribe_token`.

## Self-service developer control plane

No sales approval is required for released control-plane services. Customers
authenticate through Nodezuno with email and password, configured Google
OpenID Connect, a supported EVM externally owned account, or a compatible
Solana Wallet Standard wallet. Developer routes resolve the stable application
account ID first. The retained Sites or Cloudflare Access identity is a legacy
private-preview fallback and an optional administrator identity overlay.
Administrator routes also accept a verified application account with a real
contact email, then require the same server-side allowlist.

The session-authenticated routes do not accept an API key in place of the
application session. The key-authenticated route does not accept a
browser session in place of a bearer key.

### `GET /api/v1/developer/workspace`

Returns the first workspace visible to the authenticated account, or `null` when
the user has not provisioned one.

```json
{
  "data": {
    "workspace": {
      "id": "c739e9f1-70ee-49e7-9a95-d0dd6e0ca047",
      "slug": "acme-infrastructure-c739e9f1",
      "name": "Acme Infrastructure",
      "status": "active",
      "role": "owner",
      "createdAt": "2026-07-17T12:00:00.000Z",
      "updatedAt": "2026-07-17T12:00:00.000Z"
    }
  },
  "requestId": "..."
}
```

Workspace states are `active`, `suspended`, and `closed`. Membership roles are
`owner`, `admin`, and `developer`.

### `POST /api/v1/developer/workspace`

Creates a workspace directly for the authenticated account. The JSON body may contain
one optional `name` field between 2 and 80 characters. Omitting `name` or
sending `null` derives a bounded default from the account profile.

```json
{
  "name": "Acme Infrastructure"
}
```

A new workspace returns `201` and `created: true`. Repeating the request for an
account that already owns a workspace returns that workspace with `200` and
`created: false`. Workspace creation is limited to 5 attempts per authenticated
identity per hour.

### `GET /api/v1/developer/api-keys`

Returns up to 100 key metadata records for the authenticated account's active
workspace, newest first. It never returns `secret`, `secretHash`, or the
creator's email.

```json
{
  "data": {
    "apiKeys": [
      {
        "id": "78f43550-ad4c-447a-8625-f3dcc63bb870",
        "name": "Production",
        "prefix": "nzu_live_78f43550",
        "lastFour": "i8iE",
        "scopes": ["rpc:invoke"],
        "serviceId": "35fb1ca2-c610-4544-b095-62539fd1e276",
        "createdAt": "2026-07-17T12:05:00.000Z",
        "lastUsedAt": null,
        "expiresAt": "2027-07-17T12:05:00.000Z",
        "revokedAt": null
      }
    ]
  },
  "requestId": "..."
}
```

### `POST /api/v1/developer/api-keys`

Creates a key for the authenticated account's active workspace. It requires an
`Idempotency-Key` header of 16 to 128 permitted characters. The body requires
`name`, between 2 and 60 characters, and accepts optional `serviceId` and
`scopes`:

```json
{
  "name": "Production",
  "serviceId": "35fb1ca2-c610-4544-b095-62539fd1e276"
}
```

When `serviceId` is a UUID, it must identify a non-archived service in the
same workspace. Every key carries exactly one compatible scope. Nodezuno
derives `platform:identity` for a bound platform service, `rpc:invoke` for a
bound Ethereum, Base, or Solana RPC service, and `grpc:invoke` for a bound
Ethereum gRPC service. Omitting `serviceId` or sending `null` defaults to
`platform:identity`; the only other unbound option is an explicit
`"scopes": ["services:manage"]`. Multi-scope and unbound product keys are
rejected.

The `201` response contains the complete `secret` once:

```json
{
  "data": {
    "apiKey": {
      "id": "78f43550-ad4c-447a-8625-f3dcc63bb870",
      "name": "Production",
      "prefix": "nzu_live_78f43550",
      "lastFour": "i8iE",
      "scopes": ["rpc:invoke"],
      "serviceId": "35fb1ca2-c610-4544-b095-62539fd1e276",
      "createdAt": "2026-07-17T12:05:00.000Z",
      "lastUsedAt": null,
      "expiresAt": "2027-07-17T12:05:00.000Z",
      "revokedAt": null
    },
    "secret": "nzu_live_78f43550-ad4c-447a-8625-f3dcc63bb870_<43-character-secret>"
  },
  "requestId": "..."
}
```

Copy the secret immediately into an approved secret manager. It cannot be
retrieved later because the database stores only a purpose-separated HMAC. Responses are
non-cacheable and also include `Expires: 0` and `Pragma: no-cache`.

Keys expire 365 days after creation. A workspace may have at most 10
unexpired, unrevoked keys. Key creation is limited to 20 attempts per
authenticated identity per hour. `platform:identity` authorizes only
`platform/whoami`. `services:manage` authorizes only programmatic service,
usage, and policy operations and must remain unbound. `rpc:invoke` and
`grpc:invoke` require and authorize only the exact bound service.

The idempotency record lasts 24 hours. Changed input under the same key returns
`409 idempotency_key_reused`. An exact replay returns
`409 api_key_secret_already_issued`, never the raw secret a second time.

### `POST /api/v1/developer/api-keys/{id}/rotate`

Requires an authenticated workspace owner or administrator, exact same origin,
and `Idempotency-Key`. The optional JSON `name` replaces the display label;
an empty object preserves it. The source must be active, unexpired, and bound
only to an available service when it is a product key.

One database batch inserts a replacement with the exact source scope and
service binding, records redacted creation and rotation audit events, and
revokes the source. Rotation works when the workspace is at the active-key
limit. The `201` response discloses the replacement secret once. An exact
replay returns `api_key_secret_already_issued`; changed input returns
`idempotency_key_reused`.

### `DELETE /api/v1/developer/api-keys/{id}`

Revokes a workspace key. The identifier must be a version 4 UUID. Only an
authenticated `owner` or `admin` can revoke it. Revocation is idempotent for
an existing key and returns its metadata, including `serviceId`, with
`revokedAt` set. A key from another workspace is returned as `404`, not
disclosed. Revocation is limited to 60 attempts per authenticated identity per
hour.

Revocation takes effect on the next authenticated request because key
authentication checks `revoked_at`, expiry, workspace state, and the key HMAC
against the configured database.

### `GET /api/v1/developer/services`

Returns up to 100 unarchived service records for the active workspace.

### `POST /api/v1/developer/services`

Requires `Idempotency-Key` and accepts exactly `product`, `name`,
`environment`, `network`, and `region`. `platform-api` returns `active` with
`/api/v1/platform/whoami`. An Ethereum, Base, or Solana `rpc-api` service
returns `active`, beta maturity, and `/api/v1/rpc/{serviceId}` only when one
configured upstream passes the network's bounded identity and health probe.
Otherwise it returns `configuration_saved` with no endpoint. Listing
reconciles effective state, so saved setup activates when infrastructure
becomes ready and returns to setup pending when no provider verifies. Other
blockchain products remain configuration-only.

An Ethereum `grpc-api` service returns `active`, beta maturity, and the
configured public gRPC origin only when a bounded standard health request sees
`SERVING`. The gateway produces that state only after the same process proves
the private database-backed authorization and quota-admission boundary and
verifies upstream `eth_chainId` as `0x1`. Otherwise the service remains
`configuration_saved` with no endpoint.
The shared gateway does not allocate a separate deployment ID per service.
Creation is limited to 30 attempts per identity per hour and 50 unarchived
records per workspace. The 24-hour idempotency contract returns the original
service for an exact replay and `idempotency_key_reused` for changed input.

### `GET /api/v1/developer/services/{id}`

Returns one active tenant-scoped service with current RPC or gRPC operator
readiness reconciled. Missing, archived, and cross-workspace identifiers
return the same `404 service_not_found`.

### `PATCH /api/v1/developer/services/{id}`

All workspace roles can rename an active service with a same-origin request.
The body accepts exactly:

```json
{
  "name": "Wallet production primary",
  "updatedAt": "2026-07-18T12:00:00.000Z"
}
```

`updatedAt` must exactly equal the canonical ISO timestamp from the current
service snapshot in `YYYY-MM-DDTHH:mm:ss.sssZ` form. `name` must contain 2 to
80 trimmed characters. A successful change mutates only the display name,
advances the timestamp, and records `service.updated` with exact safe detail
`{"field":"name"}`. A stale snapshot returns
`409 service_update_conflict`. A no-op name returns the current resource
without a new audit event. Rename does not use `Idempotency-Key`.

### `GET /api/v1/developer/services/{id}/usage`

Returns a fixed-size, zero-filled tenant report for `window=24h`, `7d`, or
`30d`. It contains aggregate quota, traffic, latency, error,
upstream-failure, and safe per-key metadata. It never returns JSON-RPC bodies,
parameters, results, key secrets, or secret hashes.

### RPC access policy

`GET /api/v1/developer/services/{id}/rpc-access-policy` returns revision `0`
with empty arrays until a policy exists.
`PUT /api/v1/developer/services/{id}/rpc-access-policy` is a same-origin
update that replaces the complete allowed-origin, client-CIDR, and method
policy only when the submitted revision matches. A successful write increments
the revision once and records redacted counts. A stale write returns a policy
conflict rather than overwriting another writer.

### `DELETE /api/v1/developer/services/{id}`

Archives a workspace-owned service record. Archive is limited to 60 attempts
per identity per hour. Service mutations require same-origin admission and
write developer audit events.

### Programmatic service control plane

`/api/v1/control-plane/services*` does not accept a browser session or
same-origin identity. It requires an active, unexpired, unrevoked Nodezuno
bearer key with exactly `services:manage` and `serviceId: null`. The
application authenticates the HMAC, then rechecks the key, unbound state,
scope, workspace state, tenant, and lifecycle in the database before each
operation.

Supported operations are:

| Method | Route |
| --- | --- |
| `GET`, `POST` | `/api/v1/control-plane/services` |
| `GET`, `PATCH`, `DELETE` | `/api/v1/control-plane/services/{id}` |
| `GET` | `/api/v1/control-plane/services/{id}/usage?window=24h` |
| `GET`, `PUT` | `/api/v1/control-plane/services/{id}/rpc-access-policy` |

Programmatic creation uses the same validation, 24-hour
`Idempotency-Key`, service limit, node-readiness reconciliation, and audit
contract as browser creation. Programmatic rename uses the same exact
`updatedAt` compare. Policy replacement uses the same exact revision compare.
Usage returns the same bounded aggregate report. The authorizing API-key ID is
recorded in audit events, but no secret, digest, service name, RPC payload, or
policy value is copied into audit detail.

The source-repository CLI wraps these routes:

```bash
export NODEZUNO_API_ORIGIN=https://nodezuno.com
export NODEZUNO_API_KEY='<unbound-services-manage-key>'
pnpm nodezuno -- services list
```

It reads no `--api-key` flag, rejects redirects, requires HTTPS except for
loopback development, rejects responses larger than 1 MiB, and rejects policy
files larger than 32 KiB. The origin comes from
`NODEZUNO_API_ORIGIN` or `--origin`. It is not a published package.

### `POST /api/v1/rpc/{serviceId}`

Invokes Ethereum, Base, or Solana JSON-RPC 2.0 through an active `rpc-api`
service belonging to the API key's workspace.

```bash
curl --fail-with-body \
  --header "Authorization: Bearer $NODEZUNO_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  https://<host>/api/v1/rpc/<service-id>
```

Admission requires:

- an `application/json` media type, with optional standard parameters;
- a JSON body containing one JSON-RPC 2.0 request object or a batch;
- a valid, active, unexpired `nzu_live_...` bearer key carrying `rpc:invoke`
  whose `serviceId` exactly matches the requested service;
- an unarchived active `rpc-api` service for `ethereum`, `base`, or `solana` in
  the same workspace; and
- at least one configured upstream that verifies as the service network.

Requests are limited to 256 KiB and 20 calls per batch. Responses from an
upstream are limited to 2 MiB.
Administrative, signer, filter, subscription, and unsafe node namespaces are
blocked. Ordered upstream failover is used only for a defined retry-safe method
set and is capped at two provider attempts, so a write with an uncertain
external result is not replayed automatically. `eth_getLogs` is limited to a
block hash or at most 2,000 blocks. `eth_feeHistory` accepts at most 1,024
blocks and 20 reward percentiles. `eth_getProof` accepts at most 64 storage
keys. `eth_call` and `eth_estimateGas` accept at most 64 KiB of call data and
an explicit gas limit no greater than 30,000,000.

JSON-RPC protocol and policy results are deterministic:

| Condition | JSON-RPC result |
| --- | --- |
| Empty body or malformed JSON | Parse error `-32700` with `id: null` |
| Structurally invalid request or empty batch | Invalid Request `-32600` |
| Mixed batch | Valid members execute; invalid members receive per-item `-32600` errors in the original order |
| Expensive read outside the published parameter bounds | Invalid params `-32602` |

Two database counters are enforced atomically:

- `NODEZUNO_RPC_HOURLY_CALL_QUOTA` applies to one service and API key. Default:
  `1000`; accepted range: `100` through `1000000`.
- `NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA` applies across every service and
  key in the workspace. Default: `10000`; accepted range: `1000` through
  `10000000`.

Both limits are measured in quota units. Ordinary reads and writes cost one
unit; `eth_call` and `eth_feeHistory` cost three; `eth_getProof` costs five;
and `eth_getLogs` costs ten. A batch consumes the combined weight of its
executable members. Expensive reads can therefore exhaust a published limit
with fewer actual RPC calls.

Successful responses include `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`,
`X-Nodezuno-Workspace-RateLimit-Limit`, and
`X-Nodezuno-Workspace-RateLimit-Remaining`. The general remaining value is the
lower of the key/service and workspace remaining values. Quota exhaustion
returns HTTP `429` and JSON-RPC code `-32005`. A request containing only
notifications returns `204`. Upstream failure returns `502`, timeout returns
`504`, and unavailable configuration returns `503`; each uses JSON-RPC code
`-32002` when the original request has an ID. Invalid authentication can return
an ordinary API problem before a JSON-RPC envelope is authorized. A key bound
to another service returns HTTP `403`, JSON-RPC code `-32003`, and detail code
`api_key_service_denied` without forwarding a member upstream.

The runtime records weighted `quota_units` separately from hourly aggregate
HTTP request counts and actual `rpc_call_count` values, plus error counts,
upstream-failure counts, total latency, and byte counts. It does not persist
JSON-RPC parameters or responses. Customer headers, cookies, origin metadata,
and the Nodezuno bearer credential are not forwarded upstream.

`NODEZUNO_RPC_UPSTREAMS_JSON` is a secret object containing a nonempty subset
of the exact keys `ethereum`, `base`, and `solana`. Each present network has
one to four ordered, uniquely named public HTTPS upstream entries on default
port 443. URLs reject user information, fragments, private or special-use
hosts, and non-default ports. Each entry accepts `name`, `url`, optional
`timeoutMs` from 1,000 to 15,000, and up to 12 optional operator headers. The
timeout defaults to 8,000 ms.

A provider `Authorization` header is allowed. Hop-by-hop, routing, proxy,
Cloudflare, `Sec-*`, forwarded/IP, cookie, content, and user-agent headers are
rejected. Customer request headers are never copied. One invalid entry makes
the complete configuration unusable. Both provider URLs and provider headers
are secret values.

Before activation and forwarding, Nodezuno uses only operator-configured
headers to run a bounded network identity probe. Ethereum must return chain ID
`0x1`, Base must return chain ID `0x2105`, and Solana must return the approved
Mainnet Beta genesis hash followed by `getHealth: "ok"`. Redirects are
rejected so credentials cannot follow a provider redirect. Successful probes
are cached briefly; this is current admission verification, not an uptime or
capacity promise.

### Native gRPC customer contract

The separate gateway exposes the unary HTTP/2 method:

```text
/nodezuno.ethereum.v1.EthereumProxy/Call
```

Every customer call must send exactly one
`authorization: Bearer nzu_live_...` metadata value and exactly one canonical
lowercase UUIDv4 `x-nodezuno-service-id` metadata value. The selected database
authorizes the active workspace, key HMAC, expiry, revocation, exact
`grpc:invoke` scope, exact key service binding, same-workspace ownership, and a
non-archived Ethereum
`grpc-api` service. Invalid customer credentials receive a non-enumerating gRPC
authentication failure. An unavailable private authorization and
quota-admission boundary fails closed.

The website uses `NODEZUNO_GRPC_PUBLIC_ENDPOINT` only when it is a public-DNS
HTTPS origin on default port 443 with no path, query, user information, or
fragment. It uses `NODEZUNO_GRPC_AUTH_SECRET` as the distinct private gateway
credential. The secret must contain 32 to 256 safe ASCII characters, at least
eight distinct characters, and must not reuse another runtime secret.

The gateway's self-service mode requires
`NODEZUNO_GRPC_AUTH_MODE=control-plane`, an exact public-DNS HTTPS
`NODEZUNO_GRPC_AUTH_URL` ending in
`/api/v1/internal/grpc/authorize`, and the same
`NODEZUNO_GRPC_AUTH_SECRET`. `NODEZUNO_GRPC_AUTH_TIMEOUT` defaults to two
seconds. `GRPC_API_KEY_SHA256` must be empty in this mode. The separate
`static-digest` mode requires `GRPC_API_KEY_SHA256`, rejects all control-plane
variables, and provides operator-managed credentials rather than database-backed
self-service lifecycle.

The preferred production upstream contract is
`ETHEREUM_UPSTREAMS_JSON`, an ordered array of one to four entries. Each entry
contains exactly a lowercase slug `name`, an HTTPS `url`, a duration `timeout`
from 100 milliseconds through 30 seconds, and a validated `headers` object.
Provider credentials stay isolated to that entry. The legacy single-upstream
`ETHEREUM_RPC_URL` plus optional `ETHEREUM_RPC_HEADERS_JSON` path remains for
compatibility and is mutually exclusive with the array.

The gateway enforces a safe read-only method catalog and makes at most two
provider attempts. `eth_sendRawTransaction` and other writes are disabled.
The standard health service reports `SERVING` only after the same gateway
process proves a valid non-authorized sentinel decision from the private
database-backed route and receives Ethereum mainnet chain ID `0x1` from its
configured upstream. A readiness gate rejects customer calls at other times.
This source contract and a saved `grpc-api` record do not establish a
deployment, production endpoint, public reachability, quota policy, or
release.

#### `POST /api/v1/internal/grpc/authorize`

This route is for the shared gateway only. It requires
`Authorization: Bearer <NODEZUNO_GRPC_AUTH_SECRET>`,
`Content-Type: application/json`, and an exact body no larger than 768 bytes:

```json
{
  "serviceId": "35fb1ca2-c610-4544-b095-62539fd1e276",
  "apiKey": "nzu_live_<key-id>_<secret>",
  "quotaUnits": 3
}
```

`quotaUnits` is a safe integer from 1 through 10 derived by the gateway from
the unary request method. `eth_getLogs` costs 10, `eth_getProof` costs 5,
`eth_call` and `eth_feeHistory` cost 3, and every other or malformed method
costs 1.

A well-formed authenticated request always returns a non-enumerating decision:

```json
{
  "data": {
    "authorized": false
  },
  "requestId": "..."
}
```

`false` covers malformed, expired, revoked, unscoped, cross-workspace,
cross-service, inactive-workspace, and missing-service customer keys. The route
does not return customer identity or key metadata and credential denial does
not consume quota. `authorized: true` means the method weight was atomically
admitted against both the API-key-and-service and workspace hourly quota before
the gateway calls an upstream. Exhaustion returns `429`. A missing or
incorrect gateway secret returns `401`; invalid control-plane configuration, a
selected database failure, or the 1.8-second decision deadline returns `503`.
Database-backed gateway and client-IP rate limits apply before the decision.

### `GET /api/v1/platform/whoami`

Authenticates the issued key and returns the workspace and key identity bound
to it:

```bash
curl --fail \
  --header "Authorization: Bearer $NODEZUNO_API_KEY" \
  https://<host>/api/v1/platform/whoami
```

```json
{
  "data": {
    "workspace": {
      "id": "c739e9f1-70ee-49e7-9a95-d0dd6e0ca047",
      "slug": "acme-infrastructure-c739e9f1",
      "name": "Acme Infrastructure"
    },
    "apiKey": {
      "id": "78f43550-ad4c-447a-8625-f3dcc63bb870",
      "name": "Production",
      "prefix": "nzu_live_78f43550",
      "lastFour": "i8iE",
      "scopes": ["platform:identity"],
      "serviceId": null,
      "expiresAt": "2027-07-17T12:05:00.000Z"
    }
  },
  "requestId": "..."
}
```

The header format is `Authorization: Bearer <key>`. Missing, malformed,
expired, revoked, HMAC-mismatched, or workspace-disabled keys receive `401`
with `code: "api_key_invalid"` and a `WWW-Authenticate` header. Successful use
updates `last_used_at` at most once every five minutes to limit write
amplification. Admission is limited to 120 attempts per client IP per minute.
After successful authentication, limits are 300 requests per key per minute
and 1,000 requests per workspace per minute.

## Identity-aware website surfaces

### `/account`

The account page accepts a Nodezuno application session or the retained trusted
fallback. New application submissions are attributed to
`submitted_by_account_id`, and the page lists only records owned by that stable
account ID. Synthetic wallet email and unverified profile email never
authorize legacy history. A retained trusted identity can still list older
records attributed to its verified email.

### `POST /api/v1/account/export`

Requires exact same origin and a Nodezuno application session created less
than 15 minutes earlier. Hosted fallback identity is intentionally rejected.
The route is limited to three downloads per account per hour and returns a
private, no-store JSON attachment no larger than 1 MiB.

Export schema version `5` includes caller-owned review orders, normalized
Telegram usernames, stablecoin instruction snapshots, submitted transaction
hashes, public-chain observations, reconciliation outcomes, and immutable
confirmation records. Tenant joins start from the exact stable account ID. RPC
endpoint configuration and headers, payment-worker leases, authentication
credentials, API-key material, network addresses, user agents, and other
tenants are excluded. The `bounds` object reports collection limits and any
truncation; `redactions` records the omitted classes.

### `/admin`

The admin page accepts either:

1. a verified Better Auth application account with a real contact email; or
2. an optional verified Sites/Cloudflare Access hosting identity.

The resolved real email must then be an exact normalized member of the
server-side `NODEZUNO_ADMIN_EMAILS` allowlist. A wallet-only application
account whose only email is the reserved synthetic `.invalid` value cannot
administer Nodezuno. The allowlist is mandatory for both identity paths.

When the optional hosting path is used, authentication headers are trusted
only when injected and protected by the hosting ingress. External clients must
not attempt to self-assert `oai-authenticated-user-*` headers.

## Administrator API

These routes operate Nodezuno.com only. They are not customer APIs.

### `GET /api/v1/admin/review-orders?limit=100`

Returns the restricted review queue as safe order projections. The limit
defaults to 100 and is clamped to 1 through 200. Each administrator projection
also includes `paymentReconciliations`, containing the immutable observed
evidence, safe eligibility result, and recorded resolution for that order.

### `PATCH /api/v1/admin/review-orders/{id}`

Requires exact same origin and an allowlisted administrator. Normal orders do
not use this route before payment. To exceptionally reissue an expired or
corrected service order, use the retained internal action:

```json
{
  "action": "issue_proposal",
  "scope": "One frozen, previously audited upgrade on the stated chain.",
  "exclusions": "New protocol design, custody, deployment, and incident response.",
  "reviewer": "Assigned reviewer",
  "expiresAt": "2026-08-27T12:00:00.000Z",
  "nextAction": "Accept this exact service-order version before paying the deposit."
}
```

Scope, exclusions, reviewer, and an expiry between one hour and 30 days in the
future are required. The server increments the internal proposal version and preserves
the fixed USD 7,500 total and two USD 3,750 phases. An administrator cannot
override amount or currency.

Other actions are `request_information`, `decline`, `schedule`,
`begin_review`, `remediation`, `request_balance`, `complete`, and `cancel`.
Each is guarded by the current order state. `nextAction` is optional and is
bounded to 1,000 characters. Every accepted mutation appends an order event
and an administrator audit event and queues one deterministic buyer lifecycle
email. Invalid transitions return
`409 review_transition_invalid`. The `cancel` action changes the local workflow
only. It is rejected with `409 payment_instruction_open` while an issued
instruction remains claimable through its six-hour evidence grace period, and
with `409 payment_settlement_open` when submitted, confirming, verified, or
manual-review Ethereum evidence exists. Only an instruction past that grace
period is expired before cancellation. Operations must inspect the treasury
for an unsubmitted transfer before the final cancellation attempt.
Cancellation never sends a transaction or creates a refund.

In `manual_ethereum` mode only, `confirm_payment_manually` is also accepted
while a deposit or balance is due. It requires a `note` of at least 12
characters. Use this only after checking the transaction status, canonical
USDC/USDT contract, recipient, and exact issued amount on Ethereum Mainnet.
The note becomes part of the immutable order event and administrator audit
record; the buyer receives an email that explicitly describes the manual
check. This action does not run an RPC verifier.

`complete` additionally requires one `available` final report and one
`available` manifest. Missing required files return
`409 deliverables_incomplete`. A successful completion atomically releases all
available files so the buyer can download them through the authorized order
page.

### `POST /api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}`

Applies one eligible seller-received transfer to the deposit or balance
obligation. It requires exact same origin, a fresh verified session whose real
email is in `NODEZUNO_ADMIN_EMAILS`, and a valid `Idempotency-Key`. The route
does not accept browser-supplied payment amounts, assets, recipient addresses,
or chain evidence.

Exact body:

```json
{
  "action": "apply_to_obligation",
  "note": "Reviewed canonical evidence and approved application to the deposit."
}
```

`action` must be exactly `apply_to_obligation`. `note` must contain 12 through
4,000 characters and may not contain control characters. Unknown keys are
rejected.

The case is eligible only when its stored immutable evidence is complete,
finalized, and agreed by at least two independent RPC providers; the observed
recipient is the configured seller wallet; and the received contract is
official Ethereum Mainnet USDC or USDT. The guarded cases are narrower still:

- an amount-mismatch case can use only the selected official token and the
  exact contractual amount without the fractional reference units;
- an asset-mismatch case can use only the other official stablecoin and the
  exact contractual amount or exact issued amount;
- a late-transfer case can use only the selected official token and the exact
  contractual amount or exact issued amount; and
- an ambiguous receipt, incomplete evidence, arbitrary amount, wrong
  recipient, nonofficial token, insufficient confirmations, or fewer than two
  agreeing providers can never be applied by this endpoint.

The order must still be `deposit_pending` or `balance_due` for the case phase,
and its instruction must still be `manual_review`. One successful transaction
atomically advances the order to `deposit_paid` or `paid`, marks the intent
verified, resolves the reconciliation case as `applied_to_obligation`, creates
an immutable payment confirmation, appends the order event and administrator
audit event, and queues the deterministic buyer lifecycle notification. The
application performs no wallet signing or outgoing transfer.

The first successful decision returns `201`. Exact retry with the same
idempotency key and normalized body returns the recorded result with
`replayed: true` and status `200`. Reusing the key with another body, using a
new key after resolution, racing another state transition, or applying
ineligible evidence returns a fail-closed `409` without a second
confirmation.

### `POST /api/v1/admin/review-orders/{id}/deliverables`

Requires exact same origin and an allowlisted administrator. It is available
only after the order is scheduled. The body seals one file manifest:

```json
{
  "kind": "final_report",
  "fileName": "NZ-2026-XXXXXXXX-final-report.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

`kind` is `final_report`, `evidence_archive`, or `manifest`. Content type is
PDF, ZIP, JSON, or plain text. Size is 1 byte through 90 MiB, and `sha256` is
the lowercase hexadecimal digest of the complete file. A `201` response
returns safe deliverable metadata and a same-origin `PUT` URL with the exact
content type and SHA-256 headers. The browser streams the file to the Worker;
R2 verifies its checksum and stores sealed order and deliverable metadata. Only
one non-revoked file of each kind can exist for an order. An abandoned
`upload_pending` record can be revoked after 30 minutes before a replacement
is prepared.

### `PUT /api/v1/admin/review-orders/{id}/deliverables/{deliverableId}/upload`

Requires exact same origin, a fresh allowlisted administrator, the exact
`Content-Length`, sealed `Content-Type`, and sealed `X-Nodezuno-SHA256`. The
Worker streams the body to its private `DELIVERABLES` R2 binding without
buffering the complete file. Cloudflare's free zone body-size limit is 100 MB;
the application intentionally caps files at 90 MiB. A failed checksum or
already-used upload key is rejected.

### `POST /api/v1/admin/review-orders/{id}/deliverables/{deliverableId}/finalize`

Requires exact same origin and an allowlisted administrator. The server reads
R2 metadata and accepts the object only when its size, content type, SHA-256
checksum, order and deliverable metadata, ETag, and object version match the
sealed row. It records the storage identity, changes state to `available`, and
appends an administrator audit event. Mismatch returns
`409 deliverable_evidence_mismatch`; missing upload returns
`409 deliverable_upload_incomplete`.

### `GET /api/v1/review-orders/{id}/deliverables/{deliverableId}/download`

Requires the scoped buyer cookie or exact account bound to the order. The file
must be `released` and have a verified R2 object version. The Worker checks
the stored ETag, version, size, and SHA-256, then streams the object with
attachment disposition and the sealed content type. It never redirects to a
public bucket or reveals a direct object URL.

### `GET /api/v1/admin/submissions?limit=100`

Returns the most recent unexpired submissions. The effective limit is clamped
to 1–100 and defaults to 100.

### `PATCH /api/v1/admin/submissions/{id}`

The ID must be a UUID-shaped 36-character hexadecimal/hyphen value.

```json
{
  "status": "reviewing"
}
```

Allowed states are `received`, `reviewing`, `closed`, and `spam`. A successful
change writes both a submission event and an administrator audit record.

### `PATCH /api/v1/admin/status/services/{slug}`

Slugs must match `[a-z0-9-]{2,80}`.

```json
{
  "state": "operational",
  "description": "Production telemetry is connected for this scoped component."
}
```

Allowed states are `preview`, `operational`, `degraded`, `partial_outage`,
`major_outage`, and `maintenance`. `description` is optional; when supplied it
must contain 10–300 trimmed characters. The code records before and after
values, but evidence review is an operating responsibility described in
`CONTENT_GOVERNANCE.md`.

### `PATCH /api/v1/admin/chains/{slug}`

Slugs use the same 2–80 character pattern.

```json
{
  "stage": "data_only"
}
```

Allowed stages are `planned`, `preview`, `full`, and `data_only`. Promotion to
`full` or `data_only` is blocked when `capabilities` is empty. On promotion,
`verifiedAt` is set to the change time; moving back to `planned` or `preview`
clears it. A non-empty capability array is only a minimum technical guard. The
administrator remains responsible for retaining the evidence behind the claim.

### `GET /api/v1/admin/node-attachments`

Returns no-store, redacted readiness for the configured RPC networks and native
Ethereum gRPC gateway. Each RPC network includes configured and verified
upstream counts, current ready state, expected chain identity, and the stated
safe-read and write routing policy.

The `pulse.scope` value is exactly `process-local`. Its `upstreams` array
identifies each configured provider only by one-based `slot` and `primary`.
It reports `state` as `cold`, `closed`, `half_open`, or `open`, plus nullable
`latencyEwmaMs`, `consecutiveFailures`, `successfulObservations`,
`cooldownRemainingMs`, and nullable canonical ISO `lastObservedAt`.

Pulse observations exist only in the current website process. They may reset
when the process restarts or is replaced, and they are not a fleet aggregate,
historical uptime record, provider status feed, or service-level metric. The
response never returns upstream names, URLs, headers, credentials, internal
cache keys, or customer traffic. Reads are limited to 120 attempts per
administrator identity per hour.

### `POST /api/v1/admin/maintenance`

Deletes expired submissions, their submission outbox rows, cascaded submission
events, and expired rate-limit rows. The response reports the counts evaluated
before deletion. The operation itself is added to `admin_audit_events`.

## Problems and error handling

Problem shape:

```json
{
  "type": "https://nodezuno.com/problems/validation_failed",
  "title": "Check the highlighted fields.",
  "status": 422,
  "code": "validation_failed",
  "fields": {
    "email": "Enter a valid email address."
  },
  "requestId": "..."
}
```

`detail` and `fields` are optional. Unhandled server failures are reduced to a
sanitized `503 service_unavailable`; stack traces, SQL, and submitted content
are not returned.

Stable application codes currently include:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_challenge_purpose` | Unsupported challenge purpose |
| 400 | `invalid_content_length` | Invalid declared body length |
| 400 | `invalid_filter` | Chain filter exceeds its bound |
| 400 | `invalid_idempotency_key` | Missing or malformed idempotency key |
| 400 | `invalid_json` | Malformed JSON |
| 400 | `invalid_request_url` | Request URL could not be parsed |
| 400 | `invalid_submission_id` | Invalid administrator submission ID |
| 400 | `review_order_id_invalid` | Review order ID is malformed |
| 400 | `payment_intent_id_invalid` | Stablecoin payment instruction ID is malformed |
| 400 | `payment_claim_id_invalid` | Stablecoin payment claim ID is malformed |
| 400 | `payment_confirmation_id_invalid` | Payment confirmation ID is malformed |
| 400 | `invalid_service_slug` | Invalid status-service slug |
| 400 | `invalid_service_id` | Developer service identifier is not a version 4 UUID |
| 400 | `invalid_chain_slug` | Invalid chain slug |
| 400 | `invalid_body_encoding` | Body is not valid UTF-8 |
| 400 | `invalid_api_key_id` | Key identifier is not a version 4 UUID |
| 400 | `invalid_grpc_authorization_request` | Private gRPC decision payload is malformed |
| 401 | `authentication_required` | Required application session or optional trusted hosting identity is missing |
| 401 | `review_access_required` | Order requires its scoped buyer cookie or exact bound account |
| 401 | `review_access_invalid` | Private order capability is missing or invalid |
| 401 | `api_key_invalid` | Bearer key is missing, malformed, expired, revoked, mismatched, or bound to an inactive workspace |
| 401 | `grpc_control_plane_unauthorized` | Private native gRPC gateway credential is missing or invalid |
| 403 | `admin_access_denied` | Identity has no real contact email or is not in the administrator allowlist |
| 403 | `workspace_access_denied` | Workspace role cannot perform the operation |
| 403 | `workspace_inactive` | Workspace is suspended or closed |
| 403 | `api_key_scope_denied` | Valid key lacks the scope required by the selected route |
| 403 | `api_key_service_denied` | Valid key is bound to a different service; RPC response code is `-32003` |
| 403 | `api_key_service_binding_denied` | Key scope and requested service binding are incompatible |
| 403 | `challenge_required` | Mutation proof is missing or too long |
| 403 | `expired_challenge` | Proof is expired or temporally invalid |
| 403 | `invalid_challenge` | Proof signature, binding, format, counter, or work is invalid |
| 403 | `origin_required` | Mutation lacks a browser `Origin` |
| 403 | `cross_origin_request` | Origin or fetch-site guard failed |
| 403 | `ingress_boundary_required` | Container request failed its selected direct or trusted-gateway boundary |
| 404 | `submission_not_found` | Admin target is missing or expired |
| 404 | `review_order_not_found` | Order is missing, expired, or unavailable to the authorized path |
| 404 | `payment_intent_not_found` | Stablecoin instruction is not owned by this order or does not exist |
| 404 | `payment_claim_not_found` | Payment claim does not exist |
| 404 | `payment_confirmation_not_found` | Confirmation does not belong to the authorized order or does not exist |
| 404 | `payment_reconciliation_not_found` | Reconciliation case does not belong to the order and claim or does not exist |
| 404 | `deliverable_not_found` | Deliverable is missing, unreleased, or unavailable to the authorized order |
| 404 | `service_not_found` | Status-service target is missing |
| 404 | `chain_not_found` | Chain target is missing |
| 404 | `api_key_not_found` | Key does not exist in the caller's workspace |
| 404 | `service_not_found` | Developer service does not exist in the caller's workspace |
| 404 | `rpc_service_not_found` | Requested RPC service is invalid or absent from the key's workspace |
| 409 | `idempotency_conflict` | Public-form idempotency key was reused with a different payload |
| 409 | `review_access_already_issued` | Stored capability proof is incompatible with the reproducible exact-retry contract |
| 409 | `review_transition_invalid` | Administrator action is invalid from the current order state |
| 409 | `review_transition_conflict` | Order state changed concurrently and must be reloaded |
| 409 | `payment_phase_invalid` | Requested stablecoin phase is not currently due |
| 409 | `balance_not_due` | Order has not reached its payable balance state |
| 409 | `payment_intent_closed` | Instruction is already verified, cancelled, or refunded |
| 409 | `payment_intent_expired` | Instruction and late-claim grace period have ended |
| 409 | `payment_instruction_claim_window_open` | Expired instruction is still the exclusive transaction-evidence path for its six-hour grace period |
| 409 | `payment_instruction_open` | Order cancellation is blocked while an issued instruction remains claimable |
| 409 | `payment_claim_in_progress` | Another transaction claim must resolve before changing or resubmitting |
| 409 | `payment_claim_limit` | The bounded claim allowance was exhausted and needs manual review |
| 409 | `payment_claim_conflict` | Claim could not be reserved safely after a concurrent change |
| 409 | `payment_settlement_open` | Order cancellation is blocked by submitted or verified Ethereum evidence |
| 409 | `payment_idempotency_conflict` | Payment instruction idempotency key was reused with different order, phase, proposal, or asset details |
| 409 | `payment_asset_change_limit` | The bounded instruction allowance for an order phase requires operator review |
| 409 | `payment_reconciliation_closed` | The case already has a resolution recorded under another idempotency identity |
| 409 | `payment_reconciliation_idempotency_conflict` | The reconciliation key was reused with different decision details |
| 409 | `payment_reconciliation_incomplete` | A prior recorded reconciliation did not reach its guarded terminal state and needs database review |
| 409 | `payment_reconciliation_not_applicable` | Stored evidence is not eligible for application to the obligation |
| 409 | `payment_reconciliation_state_conflict` | Order or instruction state changed before the decision |
| 409 | `payment_reconciliation_conflict` | The case changed while the atomic resolution was being committed |
| 409 | `deliverables_incomplete` | Completion lacks an available final report or manifest |
| 409 | `deliverable_state_invalid` | Order state does not permit deliverable preparation |
| 409 | `deliverable_exists` | An active file already exists for this order and deliverable kind |
| 409 | `deliverable_closed` | Prepared deliverable upload is no longer open |
| 409 | `deliverable_upload_closed` | Prepared Worker upload is no longer open |
| 409 | `deliverable_already_uploaded` | The one-time R2 upload key already contains the file |
| 409 | `deliverable_upload_incomplete` | The sealed object is not readable from R2 yet |
| 409 | `deliverable_evidence_mismatch` | R2 size, type, checksum, metadata, or version identity differs from the seal |
| 409 | `deliverable_upload_conflict` | Deliverable state changed while R2 verification was being committed |
| 409 | `transaction_already_claimed` | Transaction hash is already bound to another instruction |
| 409 | `proposal_not_payable` | Current order state has no payable proposal |
| 409 | `proposal_expired` | Current proposal expired before buyer acceptance |
| 409 | `idempotency_key_reused` | Developer mutation key was reused with changed normalized input |
| 409 | `api_key_secret_already_issued` | Exact API-key create or rotation replay cannot disclose the secret again |
| 409 | `service_update_conflict` | Service rename used a stale exact `updatedAt` value |
| 409 | `chain_capabilities_unverified` | Strong chain stage lacks capabilities |
| 409 | `workspace_required` | Create a workspace before managing keys |
| 409 | `api_key_limit_reached` | Workspace already has 10 active keys |
| 409 | `service_limit_reached` | Workspace already has 50 unarchived service records |
| 413 | `request_too_large` | Body exceeds the route limit |
| 415 | `unsupported_media_type` | JSON route received another media type |
| 422 | `validation_failed` | Body fields violate the route contract |
| 422 | `asset_invalid` | Stablecoin asset is not canonical Ethereum mainnet USDC or USDT |
| 422 | `transaction_hash_invalid` | Transaction hash is not a complete Ethereum 32-byte hash |
| 422 | `telegram_username_invalid` | Mandatory Telegram username has an invalid shape |
| 422 | `deliverable_invalid` | Deliverable kind, filename, content type, size, or SHA-256 is invalid |
| 422 | `deliverable_upload_manifest_mismatch` | Stream headers do not match the sealed manifest |
| 422 | `deliverable_upload_rejected` | R2 rejected the stream or checksum |
| 422 | `api_key_service_invalid` | Requested key binding is not a non-archived service in the caller's workspace |
| 422 | `invalid_unsubscribe_token` | Suppression token has an invalid shape |
| 429 | `rate_limit_exceeded` | A database-backed rate-limit window is exhausted |
| 429 | `rpc_quota_exceeded` | API-key/service or workspace HTTP RPC/native gRPC quota is exhausted |
| 503 | `database_unavailable` | Selected database is missing, invalid, unavailable, or not ready |
| 503 | `api_key_security_unavailable` | `API_KEY_PEPPER` is absent or too short |
| 503 | `security_configuration_unavailable` | HMAC secret is absent or too short |
| 503 | `workspace_persistence_failed` | Created workspace could not be read back |
| 503 | `submission_persistence_failed` | Accepted submission could not be read back |
| 503 | `subscription_persistence_failed` | Subscription could not be read back |
| 503 | `review_order_unavailable` | Stored or updated order could not be read back |
| 503 | `payment_intent_unavailable` | A unique immutable payment instruction could not be reserved |
| 503 | `stablecoin_payments_unavailable` | Ethereum verification mode or its RPC endpoints are not ready |
| 503 | `payment_verifier_unhealthy` | Persisted independent-provider verifier heartbeat is missing, unhealthy, stale, or configuration-mismatched |
| 503 | `deliverable_storage_unavailable` | Private R2 storage is not bound or could not complete an operation |
| 503 | `deliverable_storage_identity_missing` | Released file has no verified R2 object identity |
| 503 | `deliverable_storage_identity_changed` | R2 object no longer matches its verified identity |
| 503 | `deliverable_unavailable` | Verified deliverable metadata could not be read after commit |
| 503 | `service_unavailable` | Sanitized unexpected failure |
| 503 | `rpc_upstream_unavailable` | Active network upstream configuration is absent or invalid |
| 503 | `grpc_authorization_unavailable` | Private native gRPC decision cannot be completed safely |
| 503 | `grpc_authorization_timeout` | Private native gRPC decision exceeded its deadline |

## Retry guidance

- Retry cacheable `GET` requests after transient `503` responses using capped
  exponential backoff with jitter.
- Honor `Retry-After` exactly on `429`.
- Retry a submission only with the same `Idempotency-Key` and the exact same
  normalized body.
- Preserve the private review capability from the first `201` response. An
  exact retry with the same idempotency key and normalized body reproduces the
  same capability; changed input is a conflict.
- Do not blindly create another payment instruction. First read the order. A
  matching active instruction is reusable, and an active claim blocks asset
  switching. Retry only with the same payment `Idempotency-Key` and exact
  normalized request.
- After claim submission, poll the authorized order. Do not send a second
  transfer while the claim is `submitted`, `checking`, `confirming`, or
  `manual_review`.
- A buyer may download an existing confirmation again through the authorized
  confirmation route. Do not treat its private no-store JSON as a tax invoice
  or custody receipt.
- Retry an administrator reconciliation only with the same
  `Idempotency-Key` and exact body after reloading the restricted case. Never
  retry a `payment_reconciliation_not_applicable` result by changing the note,
  and never mark payment through a direct database edit.
- A transaction that is not found yet or has insufficient finality is not a
  failed payment. The worker retries it. Provider disagreement and uncertain
  evidence fail closed.
- Fetch and solve a new challenge after challenge expiry.
- Do not blindly retry `400`, `403`, `409`, `413`, `415`, or `422`.
- Treat newsletter `202 pending` as stored consent, not delivered mail.
  Subscription changes to `subscribed` only after the matching unexpired
  confirmation token is submitted by POST.
- Treat outbox `accepted` as Zoho SMTP acceptance, not inbox delivery. There
  is no provider callback; verify actual receipt in the mailbox. Do not replay a
  failed row by editing its sealed payload.
- Treat status and chain disclaimers as part of the data contract.
- Deliverable downloads are private Worker streams, not public URLs. Request
  them through the authorized order route and do not copy object keys or
  storage metadata into messages.
- Do not retry key creation after receiving `201`; store the disclosed secret
  before making another key.
- Treat `401 api_key_invalid` as a credential failure. Rotate to a known active
  key or create a replacement through the verified console.
- Retry a blockchain RPC call only when the method is idempotent and the caller
  can tolerate duplicate observation. Do not blindly retry transaction
  submission or another write after an uncertain outcome.

## Security and privacy notes

- Never submit credentials, seed phrases, private keys, exploit payloads,
  regulated records, or production customer data.
- Public security intake accepts only a high-level summary. Use the policy in
  `/.well-known/security.txt` and wait for a restricted evidence channel.
- Better Auth sessions retain their source IP and user-agent metadata. Public
  form rate limiting separately uses HMAC-derived fingerprints.
- A review application's work email and commercial details are restricted
  data. Anonymous access depends on a high-entropy capability, not on knowing
  that email. Only its HMAC is stored, and it is exchanged for a scoped
  HttpOnly cookie.
- No active production card processor or hosted payment vendor is used.
  Historical provider references remain restricted operational metadata.
- A transaction hash and Telegram username link private contact data to a
  public-chain transfer. Keep them inside the authorized portal, account
  export, and restricted administrator view. Never place Telegram usernames,
  RPC URLs or headers, buyer capabilities, or private review artifacts in logs
  or release evidence.
- The application stores no seller private key or recovery phrase. It verifies
  incoming public-chain evidence only and cannot issue a refund or transfer.
- Administrator actions are attributable and written to the audit table.
- API-key secrets are returned once and stored only as a peppered HMAC. Keep
  the raw key in an approved secret manager and revoke it after suspected
  disclosure.
- Use one service-bound product key per production service. Use an unbound
  `services:manage` key only for service automation and an unbound
  `platform:identity` key only for the identity probe. No key carries multiple
  scopes or invokes multiple product services.
- The proof-of-work challenge complements, but does not replace, exact-origin
  checks, schema validation, honeypots, and rate limits.

## Source of truth

When this document and code differ, the implemented route handlers and schemas
are authoritative until the documentation is corrected:

- `app/api/v1/**/route.ts`
- `lib/server/contracts.ts`
- `lib/server/http.ts`
- `lib/server/abuse-challenge.ts`
- `lib/server/database.ts`
- `lib/public-api.ts`
- `db/schema.ts`
