# Nodezuno website backend

This repository implements the deployment-ready backend for the Nodezuno
website. It includes Better Auth customer accounts, database-backed sessions,
self-service developer workspaces, durable service records, API-key lifecycle,
and a key-authenticated control-plane identity probe. The current public
product uses direct fixed-scope Upgrade Assurance orders, versioned service
orders, a fixed USD 7,500 price, two USD 3,750 payment phases, a protected
buyer portal, direct Ethereum mainnet USDC and USDT settlement, and restricted administration. The developer
and RPC surfaces are retained
nonpublic foundations, not current Nodezuno products. The code also implements
a persisted independent-provider payment heartbeat, transactional buyer
lifecycle email, and a private S3 final-deliverable release workflow. It
also implements
a bounded HTTP JSON-RPC gateway for
Ethereum Mainnet, Base Mainnet, and Solana Mainnet Beta over
operator-configured upstreams, plus a private database-backed authorization and
weighted quota-admission boundary for a separately deployed shared Ethereum
native gRPC gateway. It does not implement a
Nodezuno-owned RPC node fleet, WebSocket plane, transaction orchestrator,
signer, indexer, bundler, paymaster, faucet, rollup, or snapshot system. Those
systems require separate security boundaries, queues, key management,
telemetry, and operational evidence.

## Retained nonpublic blockchain foundations

The RPC and gRPC code remains fail-closed without operator upstreams and is
excluded from public navigation and commercial claims. It exists so prior
engineering work is preserved, not as deployment evidence or customer
entitlement. Any future activation requires an independent market decision,
security review, data-plane deployment, provider contracts, monitoring,
support ownership, pricing, and release approval. The executable boundaries
remain documented in [API.md](API.md).

## Runtime

The same route handlers support two production profiles:

- Sites compiles the App Router through Vinext to Cloudflare Worker-compatible
  ESM and uses the direct D1 binding named `DB`.
- The portable profile compiles a Next.js standalone Node container and uses
  the shared D1-shaped database contract through either the official
  Cloudflare D1 REST API or Node SQLite on a persistent volume.

Customer authentication is owned by the application through Better Auth and
database-backed sessions. Developer routes resolve that session first and retain
Sites or Cloudflare Access identity only as a private-preview migration
fallback. Administrator routes use the same verified application account as
the portable default, require a real contact email in
`NODEZUNO_ADMIN_EMAILS`, and reject wallet-only synthetic email. A trusted
Sites or Cloudflare Access identity is an optional legacy/overlay path and
still requires the same allowlist. A container can serve both customer and
administrator application routes without Cloudflare Access. Container mode
ignores all `oai-authenticated-*` headers.

## Implemented APIs

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/live` | Process liveness without external dependencies |
| `GET` | `/api/v1/ready` | Database, security, and selected payment-configuration readiness |
| `GET` | `/api/v1/health` | Detailed database plus redacted RPC and native gRPC configuration health; no chain or serving probe |
| `GET` | `/api/v1/status` | Current website and Upgrade Assurance states, with payment readiness derived from the persisted verifier heartbeat |
| `GET` | `/api/v1/chains` | DB-backed chain publication catalog |
| `GET` | `/api/v1/abuse-challenge` | Short-lived, client-bound proof-of-work challenge |
| `POST` | `/api/v1/gas-estimate` | Bounded integer gas-cost calculation |
| `POST` | `/api/v1/submissions` | Sales, access, support, startup, press, careers, security, and event intake |
| `POST` | `/api/v1/review-orders` | Create a direct fixed service order and exact-retry-reproducible buyer capability |
| `POST` | `/api/v1/review-orders/{id}/access` | Exchange the capability for a scoped HttpOnly buyer cookie |
| `GET` | `/api/v1/review-orders/{id}` | Read an authorized safe service order and current payment projection |
| `POST` | `/api/v1/review-orders/{id}/payment-intents` | Accept an exact service-order version and create or reuse the due Ethereum stablecoin instruction |
| `POST` | `/api/v1/review-orders/{id}/payment-intents/{intentId}/claims` | Submit a transaction hash and mandatory Telegram username for asynchronous verification |
| `GET` | `/api/v1/review-orders/{id}/payment-confirmations/{confirmationId}` | Download an authorized private no-store JSON record for an immutable payment confirmation |
| `GET` | `/api/v1/review-orders/{id}/deliverables/{deliverableId}/download` | Authorize and redirect to a five-minute S3 download pinned to the released object version |
| `POST` | `/api/v1/newsletter/subscriptions` | Pending newsletter subscription persistence |
| `POST` | `/api/v1/newsletter/confirm` | Same-origin, POST-only double-opt-in confirmation |
| `POST` | `/api/v1/newsletter/unsubscribe` | Token-based newsletter suppression |
| `GET` | `/api/v1/auth/providers` | Report configured customer authentication methods |
| `GET` | `/api/v1/auth/session` | Return the current application session without synthetic wallet email |
| `POST` | `/api/v1/account/export` | Download bounded caller-owned data, including stablecoin claims and verification evidence |
| `GET`, `POST` | `/api/auth/*` | Better Auth account, session, OAuth, and wallet protocol |
| `GET`, `POST` | `/api/v1/developer/workspace` | Read or directly provision the signed-in user's workspace |
| `GET`, `POST` | `/api/v1/developer/api-keys` | List key metadata or issue a key with one-time secret disclosure |
| `POST` | `/api/v1/developer/api-keys/{id}/rotate` | Atomically replace and revoke an active key with one-time replacement disclosure |
| `DELETE` | `/api/v1/developer/api-keys/{id}` | Revoke a workspace key |
| `GET`, `POST` | `/api/v1/developer/services` | List or create workspace service records |
| `GET`, `PATCH`, `DELETE` | `/api/v1/developer/services/{id}` | Read, optimistically rename, or archive a workspace service |
| `GET` | `/api/v1/developer/services/{id}/usage` | Read bounded aggregate RPC usage |
| `GET`, `PUT` | `/api/v1/developer/services/{id}/rpc-access-policy` | Read or optimistically replace the complete tenant policy |
| `GET` | `/api/v1/developer/workspace/audit-events` | Read the redacted workspace audit timeline |
| `GET`, `POST` | `/api/v1/developer/workspace/members` | List or invite workspace members |
| `PATCH`, `DELETE` | `/api/v1/developer/workspace/members/{id}` | Change a member role or remove a member |
| `GET`, `POST` | `/api/v1/control-plane/services` | API-key service automation list and idempotent create |
| `GET`, `PATCH`, `DELETE` | `/api/v1/control-plane/services/{id}` | API-key service read, optimistic rename, and archive |
| `GET` | `/api/v1/control-plane/services/{id}/usage` | API-key aggregate usage read |
| `GET`, `PUT` | `/api/v1/control-plane/services/{id}/rpc-access-policy` | API-key RPC policy read and optimistic replacement |
| `GET` | `/api/v1/platform/whoami` | Resolve a valid bearer key to its workspace and key identity |
| `POST` | `/api/v1/rpc/{serviceId}` | Invoke bounded EVM or Solana JSON-RPC 2.0 through an active workspace service |
| `POST` | `/api/v1/internal/grpc/authorize` | Return private non-enumerating authorization and weighted quota admission to the shared native gRPC gateway |
| `GET` | `/api/v1/admin/review-orders` | List the restricted Upgrade Assurance operations queue |
| `PATCH` | `/api/v1/admin/review-orders/{id}` | Exceptionally reissue a service order or apply a guarded order transition |
| `POST` | `/api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}` | Apply eligible finalized seller-received USDC or USDT evidence through an idempotent administrator decision |
| `POST` | `/api/v1/admin/review-orders/{id}/deliverables` | Seal a final file manifest and issue a ten-minute private S3 upload |
| `POST` | `/api/v1/admin/review-orders/{id}/deliverables/{deliverableId}/finalize` | Verify S3 checksum, KMS identity, metadata, and version before release eligibility |

All mutation responses are non-cacheable. Validation errors use
`application/problem+json` with stable codes, field errors, and request IDs.
The developer mutation routes require a Nodezuno application session or
retained trusted fallback plus an exact same-origin request.
`platform/whoami` and the RPC beta are server-to-server routes that
authenticate a Nodezuno bearer key. The RPC route additionally requires the
`rpc:invoke` scope, a same-workspace active `rpc-api` service for Ethereum,
Base, or Solana, and a key binding that exactly matches the requested service.

## Identity-aware surfaces

- `/console` lets an authenticated customer create a workspace, service
  records, and API keys, copy each raw key once, and manage their lifecycle.
- `/account` displays submissions and unexpired Upgrade Assurance orders owned
  by the stable customer account ID.
  Legacy private-preview identities can still resolve older email-attributed
  records.
- `/api/v1/account/export` requires a fresh same-origin application session and
  returns schema version 3. It includes caller-owned Telegram contact,
  stablecoin instructions, transaction claims, and normalized public-chain
  evidence. It excludes provider references, payment RPC configuration and
  headers, worker leases, authentication credentials, and other tenants.
- `/admin` accepts a verified application account with a real contact email,
  or an optional verified hosting/Access identity, then requires exact
  membership in `NODEZUNO_ADMIN_EMAILS`. Wallet-only synthetic email is never
  administrator identity.
- `/review/{id}` accepts only the exact scoped buyer cookie or the stable
  account ID already bound to that order. The raw capability is returned on
  creation or an exact idempotent retry,
  transported in a URL fragment by the frontend, exchanged by POST, and never
  accepted by email or query string.
- Admin APIs enforce the same allowlist server-side and write audit events.
- `/api/v1/admin/maintenance` runs an audited retention cleanup.
- Better Auth establishes customer identity by stable account ID and provides
  the portable administrator identity when the account has a real contact
  email on the allowlist. Trusted Sites or Cloudflare Access identity remains
  an optional legacy/overlay path and membership fallback. An issued API key
  establishes machine identity with exactly one of `platform:identity`,
  `services:manage`, `rpc:invoke`, or `grpc:invoke`.
- `platform:identity` is an unbound machine identity or a `platform-api`
  binding and is required by `/api/v1/platform/whoami`.
- `services:manage` is unbound, cannot invoke products, and authorizes only the
  tenant-scoped programmatic service lifecycle, usage, and policy routes.
- `rpc:invoke` authorizes only the bounded multi-chain JSON-RPC beta for an
  active same-workspace service. The key must be bound to that exact service.
  It does not authorize another product or service management.
- `grpc:invoke` authorizes only a non-archived Ethereum `grpc-api` service in
  the active key workspace. The shared gateway submits the raw key, canonical
  service ID, and gateway-derived method weight to the private decision route.
  Credential denial returns only `authorized: false` and consumes no quota.
  Admission returns `authorized: true` only after atomically consuming the
  same API-key-and-service and workspace hourly quotas as JSON-RPC. The route
  never returns customer identity or credential metadata.

## Persistence model

The reviewed SQL migrations create the same application model in a direct
Sites D1 binding, a container D1 REST database, or a container SQLite file:

- `submissions` and `submission_events`
- `newsletter_subscriptions`
- `notification_outbox`
- `review_orders` and `review_order_events`
- `review_stablecoin_payment_intents` and `review_stablecoin_payment_claims`
- `review_stablecoin_reconciliation_cases`
- `review_stablecoin_payment_confirmations`
- `payment_verifier_health`
- `review_deliverables`
- `rate_limit_windows`
- `status_services`, `status_incidents`, and `status_incident_updates`
- `chains`
- `admin_audit_events`
- `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`
- `auth_rate_limits`, `auth_wallet_addresses`, `auth_solana_wallets`
- `developer_workspaces`, `developer_workspace_members`
- `developer_api_keys`
- `developer_mutation_idempotency`
- `developer_audit_events`
- `developer_services`
- `developer_rpc_access_policies`
- `ethereum_rpc_usage_buckets`
- `ethereum_rpc_workspace_quota_buckets`

Workspace provisioning is idempotent per stable application account ID, with
normalized email retained only for legacy private-preview members. New API keys
use the `nzu_live_<uuid>_<secret>` format, expire after 365 days, and are
limited to 10 active keys per workspace. The creation response returns the raw
key once. The database stores only its key ID, display metadata, one exact
scope, lifecycle times,
optional `service_id`, and a purpose-separated HMAC. A non-null binding must
reference a non-archived service in the same workspace at issue time. Creation,
rotation, and revocation return `serviceId` metadata and write developer audit
events. Bound RPC and gRPC keys are mandatory for product invocation. Unbound
keys can use only `platform:identity` or `services:manage`.

API-key creation, key rotation, and service creation use a 24-hour durable
idempotency namespace. Service creation replays return the original service.
API-key creation and rotation replays return
`api_key_secret_already_issued` because raw secrets are disclosed once. A
changed request under the same key returns `idempotency_key_reused`.

Service rename accepts only a new display name and the exact current
`updatedAt` value. The compare-and-update mutation advances the timestamp,
binds one redacted audit event to that mutation, and returns
`service_update_conflict` for a stale snapshot.

RPC usage buckets enforce both an API-key-and-service hourly limit and
a workspace-wide hourly limit atomically. Admission uses method-weighted quota
units. EVM and Solana use separate weight tables, and a batch consumes the
combined weight of its executable members. Buckets store weighted
`quota_units` separately from actual HTTP request and RPC call counts, then
record error and upstream-failure counts, aggregate latency, bytes in and out,
and expiry metadata. They do not store request parameters, raw responses,
upstream URLs, or API-key secrets.

Submission writes use a unique `(kind, idempotency_key)` constraint. An exact
replay returns the original receipt; reuse with a different normalized payload
returns `409`. An outbox record is created with every accepted submission so
the separate notification worker can deliver the operator notification
without making API acceptance depend on Zoho. Submission records carry a two-year expiry,
are excluded from account and admin reads after expiry, and are removed during
normal backend writes or audited administrator maintenance.

Newsletter subscription records store only a hash of the public unsubscribe
token. The raw one-time token is confined to the internal delivery outbox so
the worker can build the confirmation and unsubscribe links. The address does
not become `subscribed` until the recipient submits the private confirmation
token through the POST-only confirmation route.

Upgrade Assurance uses a separate durable order lifecycle. Valid new
production orders begin at `proposal_ready` with an automatically generated,
server-priced, time-bounded service order. The buyer accepts its exact current
version without administrator approval. Deposit and balance are each
fixed at USD 3,750, stored as `375000` minor units; the complete engagement is
USD 7,500. The active production path creates an immutable Ethereum mainnet
USDC or USDT instruction. The server, not the browser, fixes chain ID 1,
canonical token contract, six decimals, recipient, phase, proposal version,
and exact atomic amount. A 1 to 9,999 atomic-unit reference suffix makes each
instruction amount unique. The buyer must transfer the exact displayed token
amount and submit a globally single-use transaction hash plus mandatory
Telegram username.

Order creation also records separate pending operator and buyer outbox intents.
The one-shot SQLite worker validates and hydrates each intent from current
database state, sends it through Zoho SMTP, and records SMTP acceptance. SMTP
has no application-level idempotency guarantee or delivery callback. A
controlled mailbox receipt remains separate release evidence.

The payment worker independently queries every configured dedicated Ethereum
RPC endpoint. It requires chain ID 1, a successful receipt, one exact canonical
ERC-20 `Transfer` log, the selected token contract, recipient and atomic
amount, receipt-block evidence, the configured minimum confirmations, finalized
block progress, and agreement across all configured endpoints. Missing data,
timeouts, disagreement, reorg uncertainty, or unsupported finality fail closed
as confirming or manual review. Claim submission alone never advances an
order. Verified evidence updates claim, instruction, order, and one order event
in a single database batch.

Seller-received amount, official-asset, ambiguous-transfer, and late-transfer
anomalies create immutable reconciliation cases. The restricted administrator
route can apply only complete, finalized evidence agreed by at least two
providers, received by the seller in official Ethereum USDC or USDT, and
matching the guarded contractual amount rule. It requires a fresh allowlisted
session, exact same origin, a durable idempotency key,
`action: "apply_to_obligation"`, and a 12 to 4,000 character decision note.
Arbitrary amounts and ambiguous receipts are blocked. An eligible decision
atomically advances the order, resolves the case, creates the immutable
confirmation, audit and order events, and buyer lifecycle notification. The
authorized buyer can download the confirmation as private no-store JSON. It is
payment confirmation only, not a tax invoice or custody receipt.

Migration `0024_remove_legacy_provider_payments.sql` retires the pre-production
provider-payment schema and cancels affected local records without treating
them as Ethereum evidence. Refund signing, outgoing transfers, invoice and tax issuance, disputes, subscriptions, and
confidential review-input intake or analysis are outside this backend. Final
reports, manifests, and evidence archives use the private S3 delivery workflow.
The application contains no seller private key. An administrator cannot cancel
an order while an issued instruction remains claimable through its six-hour
evidence grace period, or while submitted, confirming, verified, or
manual-review Ethereum evidence exists.

## Security controls

- Strict JSON media type and a streaming 32 KiB body limit that cancels
  oversized uploads before materialization
- Exact request schema and field bounds
- Exact browser-origin and `Sec-Fetch-Site` checks
- Hidden honeypot fields
- Stateless, short-lived proof-of-work challenges bound to the connecting IP
  and user agent before any public form writes reach the database
- Better Auth session IP and user-agent metadata, plus separate daily HMAC
  fingerprints for public form abuse controls
- Independent HMAC-SHA-256 protection for API keys using `API_KEY_PEPPER`
- Constant-time comparison of stored and presented key HMACs
- Workspace-bound key lookup, role checks for revocation, expiry checks,
  immediate revocation, and active-workspace enforcement
- Mandatory least-privilege product-key binding to one non-archived same-workspace
  service, with cross-service RPC denial before upstream forwarding
- One-time key disclosure with explicit non-cache response headers
- JSON-RPC 2.0 protocol handling with `-32700` parse errors, `-32600`
  structurally invalid member errors, ordered mixed-batch execution, and
  `-32602` bounded-parameter errors
- A 256 KiB request cap, a 2 MiB upstream-response cap, and at most 20 calls
  per batch
- Blocked administrative, signer, filter, subscription, and unsafe node
  namespaces
- Health-aware ordered failover only for defined network-specific retry-safe
  methods, with at most two provider attempts
- A deterministic upstream circuit breaker that opens after two consecutive
  transport failures, cools down from 15 seconds up to two minutes, admits one
  probe when all upstreams are open, and never reroutes transaction submission
  away from the configured primary
- Bounded chain activation probes: Ethereum `eth_chainId` `0x1`, Base
  `eth_chainId` `0x2105`, and Solana Mainnet Beta `getGenesisHash` followed by
  `getHealth: "ok"`
- EVM parameter limits for logs, fee history, proofs, call data, and explicit
  call gas, plus a Solana method allowlist and method-specific weights
- Atomic, method-weighted per-key-and-service and workspace-wide hourly quotas
- No forwarding of customer headers, cookies, origin metadata, or bearer keys
  to an upstream
- Database-backed per-IP and per-email rate limits
- High-entropy review capabilities stored only as purpose-separated HMACs,
  exchanged for path-scoped HttpOnly SameSite cookies
- Server-fixed Upgrade Assurance amount, currency, phase, and proposal version
- Immutable stablecoin chain, token contract, decimals, recipient, exact atomic
  amount, phase, proposal version, confirmation policy, accepted terms version
  and hash, and expiry snapshots
- Globally unique normalized transaction hashes and mandatory normalized
  Telegram usernames, with no browser-controlled settlement facts
- Payment advancement only after fail-closed, agreeing Ethereum RPC evidence,
  exact ERC-20 log decoding, canonical receipt-block evidence, confirmations,
  and finalized-block progress
- Guarded reconciliation of seller-received anomalies only through a fresh
  allowlisted administrator session, exact same origin, durable idempotency,
  complete finalized two-provider evidence, exact amount rules, an immutable
  confirmation, and atomic audit, event, order, and notification writes
- Buyer payment-confirmation downloads bound to the exact review order and
  returned as private no-store JSON that disclaims tax-invoice and custody
  status
- New payment instructions only while a persisted, configuration-bound
  independent-provider verifier heartbeat is healthy and no older than 150
  seconds
- Dedicated payment RPC configuration whose URLs and headers never enter
  browser responses, account exports, worker logs, or audit details
- Inert legacy provider history with no provider configuration, checkout
  route, or webhook route
- Atomic outbox claims under `BEGIN IMMEDIATE`, two-minute leases, bounded
  eight-attempt retries inside a 20-hour horizon, and terminal dead-letter
  state for permanent or exhausted failures
- Canonical payload hashing and an immutable delivery seal over delivery ID,
  topic, entity, template version, payload, and creation time
- Deterministic buyer lifecycle notifications committed with administrator and
  verified-payment state changes
- Zoho SMTP over implicit TLS, bounded socket timeouts, and aggregate worker
  logs that omit recipients and message content
- SMTP `accepted` state separated from mailbox receipt; no provider event
  ledger or claimed delivered, bounced, suppressed, or complained states
- Server-side administrator allowlist
- Prepared statements for every database value
- Structured logs without request content or raw email
- Administrator-sealed final deliverables with SHA-256, size, type, KMS key,
  metadata, ETag, and S3 version verification before release
- Five-minute authorized buyer downloads pinned to the verified S3 version,
  with CloudTrail object data-event auditing in the AWS profile
- Per-request CSP script nonces, frame protection, HSTS on HTTPS, `nosniff`,
  referrer policy, permissions policy, and cross-origin isolation headers
- Fixed `https://nodezuno.com` metadata origin; request host headers are ignored
- Same-origin-only image optimization

## Runtime configuration

| Key | Required | Storage |
| --- | --- | --- |
| `NODEZUNO_INGRESS_MODE` | Container only | Exact `direct` or `trusted-gateway`; empty defaults to fail-closed `trusted-gateway` |
| `PUBLIC_ORIGIN` | Container only | Exact public HTTPS origin and direct-ingress host/protocol authority |
| `NODEZUNO_DOMAIN` | Production public origin | Exact hostname that must match `PUBLIC_ORIGIN`; injected by the AWS host |
| `NODEZUNO_DEPLOYMENT_TOPOLOGY` | AWS SQLite profile | Exact `single-host-sqlite` |
| `NODEZUNO_WEB_REPLICA_COUNT` | AWS SQLite profile | Exact `1` |
| `NODEZUNO_BACKGROUND_WORKER_OWNER` | AWS SQLite profile | Exact `systemd-single-host` |
| `NODEZUNO_PROCESS_ROLE` | AWS SQLite profile | Host-injected `web`, `email-worker`, or `payment-worker` |
| `NODEZUNO_DATABASE_DRIVER` | Container only | `sqlite` for one persistent-volume instance or `d1-rest`; empty defaults to `d1-rest` |
| `NODEZUNO_SQLITE_PATH` | Container SQLite only | Absolute `.db`, `.sqlite`, or `.sqlite3` path on a durable local volume |
| `CLOUDFLARE_ACCOUNT_ID` | Container D1 REST only | Restricted D1 account identifier |
| `CLOUDFLARE_D1_DATABASE_ID` | Container D1 REST only | Selected D1 database UUID |
| `CLOUDFLARE_D1_API_TOKEN` | Container D1 REST only | Account-scoped D1 read/write secret |
| `RATE_LIMIT_SECRET` | Yes | Distinct protected runtime secret |
| `API_KEY_PEPPER` | Yes | Distinct protected runtime secret |
| `BETTER_AUTH_SECRET` | Yes | Distinct protected runtime secret |
| `REVIEW_CAPABILITY_SECRET` | Yes | Separate durable HMAC secret for private review capabilities; rotate only with the documented buyer-link recovery plan |
| `BETTER_AUTH_URL` | Yes | Exact HTTPS origin |
| `GOOGLE_CLIENT_ID` | Only for Google sign-in | Configured OAuth client identifier |
| `GOOGLE_CLIENT_SECRET` | Only for Google sign-in | Protected OAuth client secret |
| `ZOHO_SMTP_HOST` | Required for verified public email accounts and external notification delivery | Non-secret Zoho data-center SMTP hostname; TLS port 465 is fixed |
| `ZOHO_SMTP_PASSWORD` | Required for verified public email accounts and external notification delivery | Protected Zoho app password for `info@nodezuno.com` |
| `NODEZUNO_ORIGIN_SECRET` | Container `trusted-gateway` only | Strong distinct secret injected by the managed gateway; completely blank in `direct` |
| `CF_ACCESS_TEAM_DOMAIN` | Optional container identity overlay | Exact Access team HTTPS origin; configure with audience or leave both absent |
| `CF_ACCESS_AUDIENCE` | Optional container identity overlay | Access application audience paired with the team domain |
| `NODEZUNO_PUBLIC_INDEXING` | Public launch only | Exact `true` after release approval; otherwise false |
| `NODEZUNO_LEGAL_LAUNCH_APPROVED` | Payments and public launch | Exact `true` only after the documented legal and commerce gate is approved; otherwise false |
| `NODEZUNO_ADMIN_EMAILS` | Yes for admin access | Provider environment variable; real contact emails only |
| `NODEZUNO_STABLECOIN_PAYMENT_MODE` | Production payments | `disabled` in the Cloudflare production defaults; enable `manual_ethereum` only after launch approval; `ethereum_mainnet` only for a separately approved automatic-verification runtime |
| `NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON` | Ethereum settlement | Secret array containing two or three independently named payment-verification endpoints |
| `NODEZUNO_PAYMENT_CONFIRMATIONS` | Optional | Minimum 6 to 64 confirmations; invalid or absent values use 12 |
| `AWS_REGION` | Container secure delivery | Region containing the private deliverables bucket and KMS key |
| `NODEZUNO_DELIVERABLE_BUCKET` | Container secure delivery | Private versioned S3 bucket; injected by the AWS host bundle |
| `NODEZUNO_DELIVERABLE_KMS_KEY_ARN` | Container secure delivery | Exact dedicated customer-managed KMS key ARN; injected by the AWS host bundle |
| `NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY` | Private migration only | Must remain false on public deployments |
| `NODEZUNO_RPC_UPSTREAMS_JSON` | Required to activate an RPC network | Secret containing a nonempty subset of `ethereum`, `base`, and `solana`, each with one to four real HTTPS upstreams |
| `NODEZUNO_RPC_HOURLY_CALL_QUOTA` | Optional | Per API key and service; default `1000`, accepted `100` to `1000000` |
| `NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA` | Optional | Across every key and service in a workspace; default `10000`, accepted `1000` to `10000000` |
| `NODEZUNO_GRPC_PUBLIC_ENDPOINT` | Required to activate native gRPC service records | Public-DNS HTTPS origin on default port 443 |
| `NODEZUNO_GRPC_AUTH_SECRET` | Required for native gRPC control-plane mode | Distinct private website-to-gateway secret |

Local development receives clearly labeled non-production auth values only
from the Vite `serve` configuration. Production artifacts contain no fallback
secret. Missing or incoherent production configuration fails closed.
Repository placeholders, leading, trailing, or control whitespace,
low-diversity secrets, reused rate-limit, API-key, authentication, or
trusted-gateway origin secrets, placeholder administrator values, invalid
optional Access values, origin mismatch, an invalid ingress mode or
mode/secret pairing, one-sided Google or Zoho email pairs, and partial Zoho
SMTP configuration are rejected.

The notification-delivery configuration is fail-closed. For an enabled
production pipeline, `ZOHO_SMTP_HOST` and `ZOHO_SMTP_PASSWORD` must both be
present and valid. Sender and operator recipient are fixed to
`info@nodezuno.com`. The worker additionally requires the SQLite driver, an absolute
`NODEZUNO_SQLITE_PATH`, exact `PUBLIC_ORIGIN`, and the durable
`REVIEW_CAPABILITY_SECRET`. The current worker deliberately rejects D1 REST.
When both Zoho SMTP values are blank, the optional pipeline is disabled and
queued work remains pending. The app has no external delivery callback.

Stablecoin settlement is fail-closed. Cloudflare production defaults use
`disabled`. After the owner approves launch and enables `manual_ethereum`, the
app issues Ethereum Mainnet USDC/USDT instructions and waits for an operator to
check submitted transaction details; it does not verify on-chain data
automatically.
`ethereum_mainnet` is ready only with
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and two or three valid dedicated RPC
endpoints. Payment mode `disabled` prevents new instructions.
Endpoint names, provider identifiers, and normalized hosts must be unique.
Public RPC URLs require HTTPS, URL
credentials, query strings, and fragments are
rejected, and headers are bounded and reject hop-by-hop or cookie headers.
Internal HTTP is accepted only for loopback, RFC 1918, or `.internal` hosts.
Run the stablecoin preflight against every endpoint before enabling payment;
it verifies chain ID 1, latest and finalized block support, fresh chain data,
canonical USDC and USDT bytecode, six decimals, and a null unknown receipt.
Every payment-worker pass persists a redacted heartbeat only when all providers
remain healthy and their latest heads are within the enforced spread. New
instructions require that heartbeat to match current configuration and be no
older than 150 seconds.
A public container also requires coherent deliverable storage configuration.
The AWS profile provisions a private versioned S3 bucket, a dedicated rotating
KMS key, least-privilege role permissions, and CloudTrail data events, then
injects only the bucket, key ARN, and region into the web container. Runtime
configuration checks the identifier shapes. Deployment tests must separately
prove S3, KMS, CORS, IAM, checksum verification, and signed download behavior.

`NODEZUNO_RPC_UPSTREAMS_JSON` is a secret JSON object with a nonempty subset of
the exact top-level keys `ethereum`, `base`, and `solana`:

```json
{
  "ethereum": [
    {
      "name": "primary",
      "url": "https://<real-upstream>",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer <provider-secret>"
      }
    }
  ],
  "base": [
    {
      "name": "base-primary",
      "url": "https://<real-base-upstream>",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer <provider-secret>"
      }
    }
  ],
  "solana": [
    {
      "name": "solana-primary",
      "url": "https://<real-solana-upstream>",
      "timeoutMs": 8000,
      "headers": {
        "Authorization": "Bearer <provider-secret>"
      }
    }
  ]
}
```

Each present array contains one to four ordered entries with names unique
within that chain. A name must match
`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. Each URL must use
public HTTPS on default port 443, include no user information or fragment,
exclude private and special-use hosts, and be at most 4,096 characters.
`timeoutMs` is optional, defaults to 8,000, and must be an integer from 1,000
through 15,000. `headers` is optional and can contain up to 12
operator-configured provider headers. Header values are strings of at most
2,048 characters without control characters.

Hop-by-hop, host, routing, proxy, Cloudflare, `Sec-*`, forwarding/IP, cookie,
origin, content, and user-agent headers are rejected. An operator-supplied
`Authorization` header is allowed, but a customer's request headers and
Nodezuno bearer key are never forwarded. Provider URLs and every configured
header are treated as secrets.

The complete JSON is limited to 32 KiB and fails closed as one unit. One
invalid field, duplicate name, unsupported key, malformed URL, or invalid
header makes the configuration unusable. Missing or unusable configuration
keeps newly created RPC services at `configuration_saved` with
`endpointPath: null`; calls fail with `503`. The service list reconciles
effective availability on each read. The chain probe must verify Ethereum
Mainnet as `0x1`, Base Mainnet as `0x2105`, or Solana Mainnet Beta using the
exact genesis hash and `getHealth: "ok"` before an upstream can activate its
service or receive customer traffic. Probe and forwarding redirects are
rejected. The probe is not proof of provider capacity, future uptime, or
commercial entitlement. See [NODE_ATTACHMENT.md](NODE_ATTACHMENT.md) for DNS,
SSRF, firewall, rotation, spend, backup, and production-evidence requirements.

The container profile additionally requires the canonical public origin, one
complete database-driver configuration, and one coherent ingress mode.
`direct` requires exact public-origin host and protocol admission and a
completely blank origin secret. `trusted-gateway` requires a strong distinct
origin secret injected by the managed gateway. Both modes remove the header
before routing. Direct mode derives rate-limit identity from the
provider-appended last `X-Forwarded-For` address when valid. Cloudflare Access
is optional. A real-email Better Auth account plus the mandatory allowlist is
the portable administrator default; Access supplies an alternative verified
identity overlay.
SQLite requires one process and a durable local volume. D1 REST requires its
account, database, and restricted API token. The full contract is in
[CONTAINER_DEPLOYMENT.md](CONTAINER_DEPLOYMENT.md).

## Truth and external-system boundaries

- Public status reads the visible website, review-intake, payment-verification, and
  review-portal catalog. It marks only the website request operational at read
  time; the other states remain administrator-curated. No status value is
  historical uptime, chain telemetry, engagement evidence, or an SLA.
- Chain support defaults to `planned`; it is not endpoint availability.
- Newsletter intake is double opt-in. A stored `202 pending` response is not a
  mail-delivery claim; only a matching unexpired confirmation POST changes the
  subscription to `subscribed`.
- The SQLite worker sends supported notifications through Zoho SMTP. A
  successful SMTP response means `accepted`, not mailbox delivery. Verify
  receipt directly in the `info@nodezuno.com` Zoho mailbox.
- A valid bounded Upgrade Assurance submission creates service-order version 1
  and opens direct checkout. No human administrator action is required before
  the buyer can accept the terms and pay.
- Direct payment is a self-custody Ethereum transfer. Only deterministic,
  agreeing RPC evidence can advance the order. A hash, Telegram submission,
  explorer page, screenshot, or wallet success screen is not payment proof.
- A seller-received anomaly remains manual review until the guarded
  reconciliation route either applies eligible finalized evidence or an
  external process resolves it. Ambiguous receipts and arbitrary amounts
  cannot be applied. No operator may force paid state with a database edit.
- The buyer payment-confirmation JSON is an immutable application record of
  the accepted Ethereum evidence. It is not a tax invoice or custody receipt.
- The fixed commercial scope is USD 7,500 total, split into a USD 3,750
  scheduling deposit and USD 3,750 balance. Coupons, alternate currency,
  browser pricing, subscriptions, automatic overage, taxes, invoices,
  disputes, and refund initiation are not implemented.
- Ethereum Mainnet stablecoin verification is the only payment implementation.
- Vulnerability intake accepts only a high-level summary. Sensitive evidence
  requires a restricted disclosure channel or vetted bounty platform.
- Public intake accepts no résumé, source, credential, or sensitive evidence
  upload. The Cloudflare profile uses a private R2 binding for administrator-
  sealed final reports, evidence archives, and manifests. Same-origin Worker
  routes stream uploads, verify SHA-256, and authorize downloads. R2 provides
  Cloudflare-managed encryption at rest; it does not provide an AWS KMS key.
  The retained AWS profile separately documents private S3 storage.
- Workspaces, API-key lifecycle, and `platform/whoami` are live control-plane
  capabilities.
- A durable Ethereum, Base, or Solana `rpc-api` service is active at beta
  maturity only when a configured upstream verifies as its intended mainnet.
  A durable Ethereum
  `grpc-api` service is active at beta maturity only when the configured shared
  gateway reports same-process authorization and mainnet-upstream readiness.
  Other blockchain service records remain configuration-only.
- A workspace, active RPC service, or valid key is not proof of a Nodezuno node
  fleet, WebSockets, webhooks, indexing, NFT/token data, bundling, gas
  sponsorship, signing, faucets, snapshots, or rollup operations.
- Customer HTTP traffic uses JSON-RPC over
  `POST /api/v1/rpc/{serviceId}`. The native gRPC source under
  `services/grpc-gateway` is a separate HTTP/2 runtime. Its `control-plane`
  mode shares the configured database key and service lifecycle through the
  private authorization and quota-admission route and atomically consumes the
  same weighted API-key/service and workspace quotas before an allowed
  upstream call. Its
  preferred upstream contract is an ordered one-to-four provider array with
  credential isolation, at most two attempts, and an enforced safe read-only
  method catalog. `eth_sendRawTransaction` and other writes are disabled. Its
  optional `static-digest` mode remains operator-managed. No native gRPC
  deployment or production endpoint is part of the current website release.

## Release checks

`REVIEW_CAPABILITY_SECRET` is required for review creation and private link
authorization. Readiness fails closed when it is missing or duplicates another
core secret. Back it up with the production environment. Rotation invalidates
outstanding capability-only links and therefore requires a migration and buyer
communication plan.

Before publishing:

1. Append and inspect ordered SQL migrations under the authority in
   [MIGRATIONS.md](MIGRATIONS.md). Drizzle generation is intentionally blocked.
2. Apply the migration to an empty local database using the selected driver.
3. Run lint, TypeScript, contract tests, rendered-route tests, API-key security
   tests, and the production Vinext build.
4. Verify the local API success, replay, conflict, rate-limit, identity denial,
   workspace creation, one-time key issue, key authentication, key revocation,
   tenant isolation, per-network RPC method blocking, chain identity, batch
   limits, both quota layers, upstream failure, and admin-audit flows with
   isolated fixtures.
5. Exercise review creation, reproducible capability exchange, account binding,
   proposal authorization, both fixed payment phases, USDC and USDT intent
   creation, mandatory Telegram validation, transaction replay denial, wrong
   chain, token, recipient and amount rejection, RPC disagreement, finality,
   idempotent verification, automatic exact-match confirmation, automatic
   reconciliation-case creation, eligible idempotent application, arbitrary
   amount and ambiguous-receipt denial, atomic confirmation and order
   advancement, buyer receipt isolation, and production-only payment routing.
6. Exercise outbox sealing, exclusive claims, expired-lease recovery,
   retry scheduling, dead-letter handling, SMTP acceptance state, and
   newsletter confirmation with isolated fixtures.
7. In the actual Zoho account, send one approved test notification and verify
   receipt in `info@nodezuno.com`. Source checks do not prove the external
   SMTP or mailbox path.
8. Run the production payment preflight against every configured endpoint and
   record only endpoint names, chain ID, block numbers, and healthy state.
   Never record endpoint URLs or headers.
9. Push the exact validated source, package the build and migration, save a
   version or immutable image, and deploy through the selected release path.
