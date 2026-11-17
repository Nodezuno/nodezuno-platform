# Nodezuno.com data model

**Current store:** Cloudflare D1 (`DB` binding)
**Alternate stores:** container D1 REST, or SQLite on one persistent volume
**Logical application contract:** `D1Database`
**Schema source:** `db/schema.ts`
**Initial migration:** `drizzle/0000_lowly_prima.sql`
**Developer control-plane migration:** `drizzle/0001_high_newton_destine.sql`
**Account and service migration:** `drizzle/0002_next_guardsmen.sql`
**Account-bound request migration:** `drizzle/0003_narrow_doorman.sql`
**Owner-identity uniqueness migration:** `drizzle/0004_lumpy_taskmaster.sql`
**RPC usage migration:** `drizzle/0005_huge_doorman.sql`
**Service-bound key migration:** `drizzle/0006_lean_magma.sql`
**Shared gRPC service migration:** `drizzle/0007_shared_grpc.sql`
**Multi-chain RPC migration:** `drizzle/0008_multichain_rpc.sql`
**RPC policy migration:** `drizzle/0009_rpc_access_policies.sql`
**Developer idempotency migration:** `drizzle/0010_developer_idempotency.sql`
**API-key rotation migration:** `drizzle/0011_api_key_rotation.sql`
**Service update migration:** `drizzle/0012_service_updates.sql`
**Developer guardrail migration:** `drizzle/0013_smiling_legion.sql`
**Public status migration:** `drizzle/0014_chain_launch_status.sql`
**Upgrade Assurance commerce migration:** `drizzle/0015_upgrade_assurance_commerce.sql`
**Newsletter double-opt-in migration:** `drizzle/0016_newsletter_double_opt_in.sql`
**Notification delivery migration:** `drizzle/0017_notification_delivery_state.sql`
**Historical email event migration:** `drizzle/0018_resend_webhook_events.sql`
**Ethereum stablecoin settlement migration:** `drizzle/0019_ethereum_stablecoin_payments.sql`
**Payment operational guards migration:** `drizzle/0020_payment_operational_guards.sql`
**Review lifecycle notification migration:** `drizzle/0021_review_lifecycle_notifications.sql`
**Secure review delivery migration:** `drizzle/0022_review_delivery.sql`
**Stablecoin reconciliation migration:** `drizzle/0023_stablecoin_reconciliation.sql`
**Legacy provider-payment removal:** `drizzle/0024_remove_legacy_provider_payments.sql`
**Review-language migration:** `drizzle/0025_review_language.sql`
**Last verified against source:** 30 August 2026

## Scope and boundary

This database persists the Nodezuno.com website's enquiry, newsletter, catalog,
rate-limit, administrator-control, Upgrade Assurance order and payment state,
and retained developer-control-plane data.
The current public product uses submission, receipt, account, consent, and
administrative audit records for Upgrade Assurance intake. Retained RPC tables
store only service metadata and aggregate usage or quota buckets. They are not
evidence that an RPC product is offered or deployed.

It contains Better Auth users, sessions, provider accounts, verification and
rate-limit records, EVM and Solana identities, developer workspaces,
workspace membership, API-key metadata and HMACs, durable service records,
customer RPC access policies, developer mutation idempotency, and developer
audit events. It also contains hourly aggregate multi-chain RPC usage and
quota buckets. It does not contain raw API-key secrets, RPC request
parameters, request bodies, upstream responses, transaction operations, signer
keys, signing policies, blockchain indexes, NFT/token records, outgoing webhook
deliveries, paymaster balances, rollup state, faucets, or snapshots. Its narrow
commerce ledger records fixed-price Upgrade Assurance proposals, immutable
Ethereum stablecoin instructions, transaction claims, verification evidence,
reconciliation cases, and confirmation records. It is not a general billing,
subscription, metering, tax, or invoicing system.

Customer RPC node URLs and provider headers live only in the deployment secret
`NODEZUNO_RPC_UPSTREAMS_JSON`. Dedicated payment-verification RPC endpoints and
headers live only in `NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON`. They are not
application-database columns.
Blockchain ledger data, node snapshots, client configuration, and cloud volume
backups also remain in the operator's node environment. Application-database
recovery and node recovery are separate procedures. See
[NODE_ATTACHMENT.md](NODE_ATTACHMENT.md).
Redacted Pulse routing observations are process-local memory, not database
records, and may reset when the website process restarts or is replaced.

Card data never enters this application. The retained settlement model is for
direct Ethereum mainnet USDC or USDT transfers, but the current Cloudflare Free
configuration disables payment instructions and verification. The application
stores no seller private key, recovery phrase, or outgoing transaction authority. The
schema contains no invoice, subscription, coupon, tax, paid-overage, dispute,
automated refund, or recurring-charge model. It stores sealed metadata for
final reports, evidence archives, and manifests, but not their file contents.
The current Cloudflare profile stores files in private R2. Confidential
review inputs and analysis workspaces still need approved systems with their
own access, retention, reconciliation, and audit controls.

## Model map

```text
submissions
  ├──< submission_events             (foreign key, cascade delete)
  └──< notification_outbox           (logical entity_id link)

auth_users
  ├──< auth_sessions
  ├──< auth_accounts
  ├──< auth_wallet_addresses
  ├──< auth_solana_wallets
  ├──< developer_workspace_members
  ├──< submissions                    (account ownership, set null on delete)
  └──< review_orders                  (optional account ownership, set null on delete)

review_orders
  ├──< review_order_events            (foreign key, cascade delete)
  ├──< review_deliverables             (sealed private R2 object metadata)
  ├──< review_stablecoin_payment_intents
  │     └──< review_stablecoin_payment_claims
  ├──< review_stablecoin_reconciliation_cases
  ├──< review_stablecoin_payment_confirmations
  └──< notification_outbox            (logical entity_id link)

payment_verifier_health              (singleton independent-provider heartbeat)

auth_verifications                   (one-time auth challenges)
auth_rate_limits                     (authentication admission counters)

newsletter_subscriptions
  └──< notification_outbox           (logical entity_id link)

status_services                      (public catalog)

status_incidents
  └──< status_incident_updates       (foreign key, cascade delete)

chains                               (public catalog)

rate_limit_windows                   (ephemeral abuse-control counters)

admin_audit_events                   (append-only application audit records)

developer_workspaces
  ├──< developer_workspace_members   (foreign key, cascade delete)
  ├──< developer_api_keys            (foreign key, cascade delete)
  ├──< developer_services            (foreign key, cascade delete)
  ├──< developer_audit_events        (foreign key, cascade delete)
  ├──< developer_mutation_idempotency
  ├──< ethereum_rpc_usage_buckets
  └──< ethereum_rpc_workspace_quota_buckets

developer_services
  ├──< developer_api_keys            (optional binding, cascade delete)
  ├──< developer_rpc_access_policies (one optional row, cascade delete)
  └──< ethereum_rpc_usage_buckets

developer_api_keys
  └──< ethereum_rpc_usage_buckets
```

`notification_outbox` deliberately uses a polymorphic logical `entity_id`
rather than a database foreign key. Consumers must interpret the entity using
the `topic`. `admin_audit_events` also preserves identifiers and snapshots
without foreign keys so an audit row can outlive the entity it describes.

## Storage conventions

- IDs are text UUIDs unless a catalog uses a stable text slug.
- Timestamps are integer Unix epoch milliseconds.
- Boolean visibility values are stored as SQLite integers.
- Structured auxiliary data is serialized to JSON text.
- Every dynamic SQL value is passed through the selected driver's
  prepared-statement bindings.
- State enums are enforced with SQLite `CHECK` constraints where defined.
- JSON text columns are parsed defensively; invalid capability JSON becomes an
  empty array at the public boundary.

The container migration runner stores filename, SHA-256 checksum, application
mode, and apply time in `nodezuno_schema_migrations`. An edited applied file is
fatal. D1 REST sends batches to the managed query API. SQLite uses WAL,
foreign keys, `synchronous=FULL`, a 5-second busy timeout, and
`BEGIN IMMEDIATE` batches against one absolute file path. The SQLite profile
supports one application process only. Its `-wal` and `-shm` files are part of
the live database state, so raw file copies are not accepted backups. See
[CONTAINER_DEPLOYMENT.md](CONTAINER_DEPLOYMENT.md) for migration, locking,
backup, and restore gates. The included backup primitive produces one
consistent mode `0600` SQLite file plus a SHA-256 manifest and verifies
integrity, migration count, and seeds. Restore re-verifies and publishes only
to an absent target with absent sidecars; it never overwrites live state.

## Data classification

| Class | Examples | Handling |
| --- | --- | --- |
| Public | status services, visible incidents, chain catalog | Returned by cacheable public APIs |
| Contact data | name, email, company, team, message | Restricted to request/account/admin workflows |
| Commercial intake | proposed release, change summary, affected-contract count, public links, proposal scope and exclusions | Restricted to the capability holder, bound account, allowlisted administrator, and operational database access |
| Payment contact | normalized Telegram username attached to an order and each submitted claim | Restricted to the authorized buyer portal, exact bound account export, allowlisted administrator, and operational database access |
| Stablecoin settlement | fixed obligation, phase, canonical public token and recipient addresses, exact atomic amount, transaction hash, public-chain observation, confirmation count, evidence hash, state | Restricted to the authorized buyer portal, exact bound account export, allowlisted administrator, payment worker, and operational database access |
| Stablecoin reconciliation | immutable seller-received anomaly evidence, operator resolution decision and note, optional external refund transaction hash, immutable confirmation record, receipt reference, and public record hash | Restricted operational data; buyer-safe receipt projection is available only to the authorized order; seller signing material is never stored |
| Deliverable metadata | order, kind, state, object key, filename, content type, byte length, SHA-256, ETag, object version, creator, and lifecycle times | Full metadata is restricted to the allowlisted administrator and operational database access; released safe metadata is visible to the authorized buyer; file contents remain in private R2 with Cloudflare-managed encryption at rest |
| Legacy payment metadata | fixed minor-unit amounts, currency, phase, provider references, state, provider-event hashes | Historical operational data only; provider references are excluded from buyer and account-export projections |
| Consent data | consent version, consent time, source path | Retained with the associated request or subscription |
| Security metadata | HMAC email/IP/user-agent hashes, unsubscribe-token hash | Server-side use only |
| Developer identity | stable account ID, auth provider, wallet address, workspace name/slug, optional legacy member email, role, key display name | Restricted to the authenticated member and operational database access |
| API-key metadata | key ID, prefix, last four characters, exact one scope, required product binding or permitted unbound state, lifecycle times, HMAC | Metadata returned only within its workspace; HMAC never returned |
| RPC aggregate usage | hourly quota units, request and call counts, error and upstream-failure counts, latency total, byte totals | Restricted operational data; no request parameters, bodies, or upstream responses |
| Restricted secret | raw newsletter confirmation and unsubscribe tokens inside a confirmation outbox payload | Never returned by public APIs; required only for private link delivery; immutable once the delivery is sealed |
| Audit data | actor email, before/after JSON, action, entity identifiers | Administrator and operational evidence |

Hashing does not make contact data anonymous when the source value is also
stored. Workspace member and key-creator emails are also personal data. Access,
export, retention, and deletion controls must treat those rows accordingly.

## Tables

### `submissions`

One durable public website request.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID receipt |
| `kind` | Intake workflow |
| `status` | Request workflow state |
| `name`, `email`, `company`, `team_type`, `message` | Submitted contact and request content |
| `email_hash` | Purpose-separated HMAC used for indexed lookup/rate-related operations |
| `source_path` | Validated first-party pathname |
| `metadata_json` | Normalized `utmSource`, `utmMedium`, and `utmCampaign` |
| `consent_version`, `consented_at` | Consent record |
| `submitted_by_account_id` | Stable application account owner when submitted under Better Auth |
| `submitted_by_email` | Verified edge identity when present; otherwise `NULL` |
| `idempotency_key` | Client-provided replay key |
| `request_hash` | SHA-256 of the normalized idempotent payload |
| `ip_hash` | Daily purpose-separated HMAC of the connecting IP |
| `user_agent_hash` | Purpose-separated HMAC of the truncated user agent |
| `created_at`, `updated_at` | Lifecycle times |
| `expires_at` | Enforced two-year retention boundary |

Allowed kinds:

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

Allowed statuses:

```text
received
reviewing
closed
spam
```

Important constraints and indexes:

- primary key on `id`;
- unique `(kind, idempotency_key)`;
- index on `(status, created_at)`;
- index on `(email_hash, created_at)`; and
- index on `expires_at`.

The request hash covers kind, normalized contact fields, message, source path,
and normalized UTM values. It does not contain the challenge, raw network
address, user-agent value, verified edge identity, or consent timestamp.

An accepted new request is submitted to the selected database in one batch
with:

1. the `submissions` row in `received`;
2. one `submission_events` row with event type `received`; and
3. one pending `notification_outbox` row with topic
   `submission.received`.

`INSERT OR IGNORE` and the unique idempotency index make concurrent replays
converge on one durable receipt. The application reads the record back and
compares `request_hash`; a different normalized request returns a conflict.

### `submission_events`

Append-style history for a submission.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `submission_id` | Foreign key to `submissions.id` |
| `event_type` | `received` or an application-generated `status.<state>` value |
| `actor_email` | Verified submitting identity or administrator, when present |
| `detail_json` | Event detail; status changes store `{from,to}` |
| `created_at` | Event time |

The foreign key cascades when the parent submission is deleted. A partial
unique index allows only one `received` event per submission. Events are
ordered using `(submission_id, created_at)`.

### `review_orders`

One direct fixed-scope Upgrade Assurance order and its generated commercial
terms. The server fixes the engagement at USD 7,500, represented as `750000`
minor units, with a USD 3,750 deposit and USD 3,750 balance, each represented
as `375000`. The browser cannot supply amount or currency.

The row contains normalized buyer and company details, release and change
summary fields, affected-contract and changed-line estimates, dates, public
links, consent evidence, proposal version and scope, an optional stable account
owner, the normalized Telegram username most recently supplied through a
payment claim, and operational HMACs. `access_token_hash` is the only persisted
form of the anonymous buyer capability. `expires_at` is two years after
acceptance. Telegram is nullable for existing and unpaid orders, but mandatory
on every stablecoin claim.

Allowed order statuses are:

```text
qualification_pending
needs_information
proposal_ready
deposit_pending
deposit_paid
scheduled
in_review
remediation
balance_due
paid
payment_refunded
completed
declined
cancelled
```

The database constrains total, deposit, balance, and currency to the fixed
values above. `reference` and `idempotency_key` are unique. Indexes support
status, account, HMAC email, creation-time, and expiry reads.

### `review_order_events`

Append-style order history. Each row records the order, event type, actor type,
optional administrator email, JSON detail, and event time. The foreign key
cascades with its order. Buyer, system, webhook, and administrator transitions
therefore remain distinct from the current order snapshot.

### `review_stablecoin_payment_intents`

One immutable server-issued instruction for the deposit or balance phase. The
row snapshots:

- the parent order, phase, and accepted proposal version;
- `USDC` or `USDT`, Ethereum chain ID 1, network `ethereum`, the canonical
  token contract, and six decimals;
- the fixed Nodezuno recipient address;
- the USD 3,750 obligation as `375000` minor units;
- the exact token quantity as a decimal string and atomic-unit text; and
- a unique 1 to 9,999 atomic-unit reference suffix, acceptance time, expiry,
  state, lifecycle timestamps, instruction-pinned confirmation threshold,
  accepted service-terms version and hash, and hashed creation-idempotency
  identity and request seal.

Atomic quantities are text so JavaScript and SQLite integer precision cannot
alter them. The exact transfer amount is `3750000000 + reference_units`; the
buyer must not round the displayed six-decimal value. A global unique index on
`(asset, token_amount_atomic)` prevents instruction collisions. A partial
unique index permits only one active instruction for an order and phase while
state is `awaiting_transfer`, `submitted`, `confirming`, or `manual_review`.
Switching assets cancels only an unclaimed `awaiting_transfer` instruction.

Intent states are:

```text
awaiting_transfer
submitted
confirming
verified
manual_review
expired
cancelled
refunded
```

The recipient, chain, network, token decimals, asset catalog, phase, currency,
and reference bounds are database constrained. Browser requests cannot write
those settlement facts.

### `review_stablecoin_payment_claims`

One buyer-submitted transaction assertion attached to an instruction. The row
stores the normalized globally unique Ethereum transaction hash, mandatory
normalized Telegram username, state, bounded retry scheduling, an exclusive
worker lease, and normalized public-chain evidence when observed. Evidence can
include sender, token contract, recipient, atomic amount, block number and
hash, log index, block timestamp, confirmation count, cross-RPC agreement
count, and a SHA-256 evidence hash.

Claim states are:

```text
submitted
checking
confirming
verified
rejected
manual_review
```

A partial unique index permits only one active or verified claim per intent.
The transaction-hash unique index prevents reuse across orders, phases, and
accounts. A rejected claim releases the instruction for another bounded claim
while its instruction remains timely. Lease token and expiry must be both null
or both present. Worker lease values and RPC endpoint identities are internal
operations data and are excluded from buyer projections and account exports.

The worker treats a missing receipt, RPC failure, endpoint disagreement,
insufficient confirmations, and uncertain finality as non-payment. It stores
confirming or manual-review state and never advances the order from those
conditions. A verified transition updates claim, intent, order, and one order
event atomically.

When normalized evidence shows that the seller received the other canonical
allowed asset, the wrong amount, an ambiguous candidate transfer, or a transfer
after instruction expiry, the claim becomes `manual_review` with its observed
evidence preserved. It does not reopen the instruction or ask the buyer to pay
again. Failed receipts, wrong recipients, and unrelated or absent token
transfers can be rejected without treating the seller as paid.

### `payment_verifier_health`

Singleton operational record for the direct Ethereum verifier. It stores the
hash of the active payment mode, confirmation policy, provider identities, and
endpoint URLs, plus configured and healthy provider counts, lowest observed
latest block, `healthy` or `unavailable` state, a bounded failure code, and
check and update times. It never stores RPC headers or complete responses.

The payment worker rewrites this record during every bounded pass. New payment
instructions require the hash to match current configuration, every configured
endpoint to be healthy, and `checked_at` to be no more than 150 seconds old.
The database constrains the singleton ID and valid count, state, and timestamp
relationships.

### `review_deliverables`

One sealed metadata record for a final report, optional evidence archive, or
manifest stored outside the database in the private R2 bucket in the current
Cloudflare profile. The row contains the order,
kind, state, private object key, safe filename, allowlisted content type, exact
byte length, SHA-256, optional verified ETag and R2 object version, administrator
creator, and created, uploaded, released, or revoked times.

States are:

```text
upload_pending
available
released
revoked
```

The active `(review_order_id, kind)` pair is unique. Identity and manifest
fields are immutable after insertion. State can only progress through the
guarded upload, verification, release, or revocation paths, and verified
storage identity cannot change after it is recorded. The server exposes an
upload only for scheduled or later active work, streams it to private R2,
verifies the SHA-256 checksum, content type, byte length, sealed metadata,
ETag, and object version, then changes the row to `available`. Completion requires an
available `final_report` and `manifest` and atomically releases all available
deliverables. Buyer downloads are authorized against the parent order and
checked against `storage_version_id` before streaming through the Worker. The
alternate AWS profile uses versioned S3 and KMS; its deployment controls are
documented separately.

### `review_stablecoin_reconciliation_cases`

Append-oriented operational case for a seller-received payment anomaly. A
trigger opens exactly one case when a claim enters `manual_review` for
`amount_mismatch`, `asset_mismatch`, `transfer_ambiguous`, or
`transfer_after_expiry`. The row snapshots the order, intent, claim,
transaction, phase, expected settlement facts, immutable observed evidence,
confirmation policy, cross-provider agreement, evidence hash, and opening
time. Relationship triggers require those values to match the originating
manual-review claim and instruction.

Case states are:

```text
open
investigating
application_pending
refund_pending
resolved
```

Resolution code is one of `applied_to_obligation`, `refund`,
`no_funds_received`, `duplicate_transfer`, or `written_off`. A decision stores
purpose-separated idempotency and request hashes, a bounded operator note, the
verified administrator email, and decision time. Refund resolution additionally
requires an externally signed refund transaction hash distinct from the
incoming payment and a recorded time. Evidence, identity, first decision
fields, and resolved records are immutable. Cases cannot be deleted.

Applying received funds to an obligation first creates an immutable
reconciliation confirmation, moves the intent and order to their verified paid
state, then resolves the case. A database trigger rejects a resolved
`applied_to_obligation` case unless all three facts exist. Selecting `refund`
does not sign or broadcast a transaction. It leaves the case `refund_pending`
until the externally controlled wallet transfer is recorded through the
guarded workflow.

The implemented application path currently exposes only
`apply_to_obligation`. It requires a fresh allowlisted administrator, exact
same origin, a durable idempotency key, and a 12 to 4,000 character decision
note. Application code permits only complete finalized seller-received
official USDC or USDT evidence with at least two agreeing providers and the
narrow exact contractual or issued amount rules. Arbitrary amounts and
ambiguous receipts are blocked. The other schema resolution codes are guarded
financial state for separately reviewed future or external workflows, not
evidence that the website can issue a refund or perform those operations.

### `review_stablecoin_payment_confirmations`

Immutable payment-confirmation ledger and buyer-receipt source. A database
trigger records one `exact_match` confirmation when the verifier moves a claim
to `verified`. A guarded reconciliation can record one `reconciliation`
confirmation. The record binds:

- order, phase, intent, claim, and optional reconciliation case;
- expected and received asset, contract, recipient, sender, and atomic amount;
- transaction hash, block number and hash, log index, timestamp, confirmation
  count, required threshold, cross-provider agreement, and evidence hash;
- obligation, proposal version, accepted terms version, hash, and time;
- confirmation and recording times plus verifier or administrator origin; and
- globally unique public record hash and receipt reference.

Exact-match rows require received asset, token, and amount to equal the issued
instruction and use the evidence hash as the public record hash. Reconciliation
rows require a linked `application_pending` case and an identified
administrator. One confirmation can exist per order phase, intent, claim,
transaction hash, reconciliation case, public record hash, and receipt
reference. Confirmation rows cannot be updated or deleted.

The authorized buyer route reads one confirmation only by exact order and
confirmation ID and returns private no-store JSON. It does not expose the
administrator decision note or email and identifies the record as payment
confirmation, not a tax invoice or custody receipt.

### `notification_outbox`

Durable, worker-consumable intent for transactional email delivery and one
internal suppression acknowledgement. The HTTP mutation commits the intent in
the same database operation as its business record, so Zoho SMTP availability is
not part of API acceptance.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `delivery_id` | Stable delivery identity; equal to `id` after sealing |
| `topic` | Delivery contract |
| `entity_id` | Logical submission or subscription identifier |
| `state` | `pending`, `processing`, `accepted`, `delivered`, or `failed` |
| `attempts` | Processor attempt count |
| `template_version` | Exact rendering contract selected for this delivery |
| `payload_json`, `payload_hash` | Canonical topic payload and its SHA-256 seal |
| `available_at` | Earliest processing time |
| `lease_token`, `lease_expires_at` | Exclusive two-minute processing lease |
| `provider`, `provider_message_id` | `zoho` SMTP message ID, deterministic `internal` identity, or preserved legacy `resend` history |
| `accepted_at`, `delivered_at` | SMTP acceptance or historical/internal delivery evidence; Zoho inbox delivery is not observable by the app |
| `first_attempt_at`, `last_attempt_at` | Retry-horizon evidence |
| `terminal_failure_code`, `last_error` | Bounded operational failure codes, never provider bodies or message content |
| `created_at`, `updated_at` | Lifecycle times |

`delivery_id` is unique. Provider plus provider-message ID is unique when it
exists. State and availability, state and lease expiry, and topic, entity, and
creation-time indexes support claiming, lease recovery, and reconciliation.
The database trigger `notification_outbox_seal_immutable` rejects changes to a
sealed delivery's identity, topic, entity, template, canonical payload, hash,
or creation time.

Current topics:

| Topic | Entity | Payload |
| --- | --- | --- |
| `submission.received` | Submission | Submission ID and kind |
| `review.application.received.operator` | Review order | Order ID and reference |
| `review.application.received.buyer` | Review order | Order ID and reference |
| `review.lifecycle.buyer` | Review order | Order ID, reference, bounded lifecycle action, and buyer-safe message |
| `newsletter.confirmation.requested` | Unique confirmation attempt ID | Subscription ID, email hash, raw confirmation and unsubscribe tokens, and both private paths |
| `newsletter.unsubscribe.requested` | Newsletter subscription | Empty JSON object |

`scripts/process-notification-outbox.mjs --once` is the implemented processor.
It supports SQLite only and rejects D1 REST. Each bounded pass claims at most
25 rows under `BEGIN IMMEDIATE`, increments the attempt count, and installs an
exclusive two-minute lease. An expired lease can be reclaimed. The worker
validates the exact topic payload, hydrates the recipient and non-secret
message fields from current database state, and sends through Zoho SMTP over
implicit TLS on port 465. The socket has a bounded timeout. SMTP does not
provide the application an idempotent send guarantee or a delivery callback.

The `review.lifecycle.buyer` template reconstructs the private tracking link
server-side and supports proposal issue, information request, decline,
schedule, review start, remediation, balance request, deposit verification,
balance verification, payment manual review, completion, and cancellation.
Administrator and payment transitions insert these messages in the same
database batch as their business state change, using deterministic delivery
identities so a replay does not duplicate email intent.

Successful Zoho SMTP acceptance moves a new external message to `accepted`.
That state does not prove inbox delivery. No external callback changes it to
`delivered` or records bounces, suppressions, or complaints. Historical
Resend rows remain unchanged for audit accuracy. The internal
newsletter-unsubscribe acknowledgement calls no provider and moves directly
to `delivered` with provider `internal`.

Retryable connection failures use exponential backoff with deterministic
jitter, capped at one hour. Work is dead-lettered as
`failed` after eight attempts, when the next delay would cross the 20-hour
retry horizon, or immediately for a permanent validation/provider rejection.
This keeps all automated retries inside 24 hours. A failed row is never
automatically requeued; an operator must investigate the terminal code and
perform a peer-reviewed manual reconciliation or create a new business event.

Raw confirmation and unsubscribe tokens exist only in the confirmation outbox
payload so the worker can create both private links. They are restricted secret
material. A retry never edits a sealed payload or reuses its confirmation
attempt identity.

### Legacy email webhook table removal

Migration `0018_resend_webhook_events.sql` added a callback ledger for the
former Resend integration. Migration `0028_zoho_email_delivery.sql` drops that
table because Zoho SMTP has no provider callback. The old migration file
remains immutable history for databases that applied it; it is not part of the
current runtime model. Existing outbox rows retain their historical `resend`
provider identity and delivery state.

### `newsletter_subscriptions`

One normalized email subscription.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `email` | Normalized lowercase address |
| `email_hash` | Purpose-separated HMAC |
| `name` | Optional display name |
| `state` | `pending`, `subscribed`, or `unsubscribed` |
| `source_path` | First-party source pathname |
| `consent_version`, `consented_at` | Consent evidence |
| `confirmation_token_id` | Public, random lookup segment for the current confirmation attempt |
| `confirmation_token_hash` | SHA-256 of the purpose-separated token ID and private secret |
| `confirmation_requested_at`, `confirmation_expires_at` | Current link issue time and 72-hour deadline |
| `confirmed_at` | First successful confirmation time or `NULL` |
| `unsubscribe_token_hash` | SHA-256 of the high-entropy private token |
| `created_at`, `updated_at` | Lifecycle times |
| `unsubscribed_at` | Suppression time or `NULL` |

`email` is unique. A first request creates a pending row and one confirmation
delivery. A repeat request while its 72-hour link is live leaves the row and
outbox unchanged. A repeat for a subscribed address is also a no-op, which
preserves unsubscribe links from prior email. An expired or unsubscribed row
rotates both token hashes, clears `confirmed_at` and `unsubscribed_at`, returns
to `pending`, and appends one new confirmation attempt.

Confirmation looks up the random token ID, compares the contextual token hash
in constant time, checks the deadline, and atomically moves only the matching
`pending` row to `subscribed`. Exact successful replay is idempotent and keeps
the original `confirmed_at`. GET only renders the consent form; POST performs
the transition. A replaced link cannot confirm a newer attempt.

Unsubscribe looks up only the token hash, changes the row to `unsubscribed`,
records the time, and enqueues `newsletter.unsubscribe.requested`. A
well-formed unknown token is deliberately indistinguishable at the API layer.

Expired confirmation links remain auditable but cannot change state. There is
currently no automated deletion for newsletter or newsletter-outbox rows.

### `rate_limit_windows`

Database-backed fixed-window counters.

| Column | Purpose |
| --- | --- |
| `id` | Deterministic `scope:subjectHash:windowStart` value |
| `scope` | Route, workflow, kind, and subject type |
| `subject_hash` | HMAC-derived IP or email subject |
| `window_start` | Fixed-window start time |
| `count` | Number of consumed attempts |
| `expires_at` | Cleanup time |

The unique `(scope, subject_hash, window_start)` index mirrors the deterministic
primary key and documents the logical invariant. Counters are created or
incremented in one upsert. `expires_at` is two window lengths after the start;
the enforcement window itself ends after one window length.

Expired rate-limit rows are removed:

- probabilistically on approximately one percent of rate-limit writes;
- whenever a new submission runs general expiry cleanup; or
- through audited administrator maintenance.

### `status_services`

Public website-managed status components.

| Column | Purpose |
| --- | --- |
| `slug` | Primary stable identifier |
| `name`, `description` | Published copy |
| `state` | Status/maturity state |
| `sort_order` | Deterministic public order |
| `visible` | Public inclusion flag |
| `updated_at` | Latest change time |

Allowed states:

```text
preview
operational
degraded
partial_outage
major_outage
maintenance
```

Migration `0015_upgrade_assurance_commerce.sql`, followed by the settlement
rename in `0019_ethereum_stablecoin_payments.sql`, makes the visible catalog:

1. Public website
2. Upgrade review intake
3. Ethereum payment verification
4. Private review portal

Older product-foundation rows are hidden, not presented as current products.
`GET /api/v1/status` reads these durable rows directly and sets only the
website row operational for the request it successfully answered. Intake,
payment-verification, and portal states otherwise remain administrator-curated. There is
no historical uptime ingestion path. An administrator change is audited, but
the database alone cannot prove delivery, Ethereum finality, an
active customer engagement, or an SLA.

### `status_incidents`

Published incident summaries.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `slug` | Unique public identifier |
| `title` | Public incident title |
| `severity` | `none`, `minor`, `major`, or `critical` |
| `state` | `investigating`, `identified`, `monitoring`, or `resolved` |
| `impact` | Public scope statement |
| `started_at`, `resolved_at` | Incident interval |
| `created_at`, `updated_at` | Record lifecycle |

Public status reads at most 20 incidents, newest by start time. The repository
does not currently expose an incident mutation route or a monitoring
integration.

### `status_incident_updates`

Chronological updates for a status incident.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `incident_id` | Foreign key to `status_incidents.id` |
| `state` | Update state text |
| `message` | Public update text |
| `created_at` | Publication time |

Rows cascade when the incident is deleted and are indexed by incident and
creation time. They are not currently returned by `GET /api/v1/status`.

### `chains`

Public chain publication catalog.

| Column | Purpose |
| --- | --- |
| `slug` | Primary stable identifier |
| `name` | Unique display name |
| `family` | Execution family |
| `finality_model` | Planning description |
| `support_stage` | `planned`, `preview`, `full`, or `data_only` |
| `capabilities_json` | JSON string array of verified published capabilities |
| `tone` | Presentation token |
| `sort_order` | Deterministic public order |
| `visible` | Public inclusion flag |
| `verified_at` | Full/data-only promotion time or `NULL` |
| `updated_at` | Latest catalog change |

The migration seeds Ethereum, Arbitrum, Base, Optimism, Polygon, Solana,
Bitcoin, and Avalanche. Every seed begins as `planned` with an empty capability
array and no verification time.

The admin mutation rejects `full` or `data_only` when no capability strings
exist. It sets `verified_at` when promoting to either strong state and clears it
when returning to `planned` or `preview`.

`verified_at` is the time of an authorized publication change. It is not, by
itself, independent evidence that the capability works. Evidence ownership and
review are defined in `CONTENT_GOVERNANCE.md`.

### `admin_audit_events`

Attributable record of website administration.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `actor_email` | Verified allowlisted administrator |
| `action` | Stable action name |
| `entity_type`, `entity_id` | Target |
| `before_json`, `after_json` | Serialized change snapshots |
| `created_at` | Action time |

Current action values:

```text
submission.status.update
status.service.update
chain.stage.update
retention.cleanup
```

Indexes support actor/time and entity/time review. The application treats this
table as append-only; there is no update or delete route.

### `developer_workspaces`

One self-service developer tenant boundary.

| Column | Purpose |
| --- | --- |
| `id` | Primary version 4 UUID |
| `slug` | Unique URL-safe name plus an ID-derived suffix |
| `name` | User-selected or identity-derived workspace name |
| `status` | `active`, `suspended`, or `closed` |
| `created_at`, `updated_at` | Lifecycle times |

The create API is idempotent for a stable account ID that already owns a
workspace. New workspaces start as `active`. This release exposes no status
mutation route.

### `developer_workspace_members`

Connects a stable Nodezuno account, or a retained legacy email, to a workspace
role.

| Column | Purpose |
| --- | --- |
| `id` | Primary version 4 UUID |
| `workspace_id` | Foreign key to `developer_workspaces`; cascade delete |
| `account_id` | Primary membership identity, referencing `auth_users.id` |
| `email` | Nullable lowercase legacy private-preview identity |
| `role` | `owner`, `admin`, or `developer` |
| `created_at`, `updated_at` | Membership lifecycle times |

The account and workspace pair is unique when `account_id` is present. A
separate workspace and email constraint preserves legacy membership safety. At
least one identity field must be present. The current provisioning API creates
one `owner` membership. Owners and administrators can invite existing
Nodezuno accounts as `admin` or `developer`; owners can change those roles or
remove non-owner members through the tenant-scoped member routes. Application
sessions resolve membership by account ID, never from request JSON.

### `developer_api_keys`

Stores machine-identity metadata and verification material without storing the
raw key.

| Column | Purpose |
| --- | --- |
| `id` | Primary version 4 UUID embedded in the key |
| `workspace_id` | Foreign key to `developer_workspaces`; cascade delete |
| `service_id` | Immutable least-privilege binding for callable product keys; `NULL` only for platform identity or service automation; cascade delete |
| `name` | User-selected key label |
| `prefix`, `last_four` | Safe display metadata |
| `scopes_json` | Exactly one allowed scope: `platform:identity`, `services:manage`, `rpc:invoke`, or `grpc:invoke` |
| `secret_hash` | Unique HMAC-SHA-256 output for the complete raw key |
| `created_by_account_id` | Stable creator account when present |
| `created_by_email` | Normalized verified creator identity |
| `created_at` | Issue time |
| `last_used_at` | Last recorded successful authentication, or `NULL` |
| `expires_at` | Authentication expiry, 365 days after issue |
| `revoked_at` | Immediate revocation time, or `NULL` |

The complete key has the form:

```text
nzu_live_<version-4-uuid>_<43-character-base64url-secret>
```

The creation response discloses it once. The application stores only the key
ID, safe display metadata, one scope, its required product binding or
permitted unbound state, lifecycle times, and HMAC. A callable product key
must reference a non-archived service
in the same workspace when it is issued: RPC services derive `rpc:invoke`,
Ethereum gRPC derives `grpc:invoke`, and the platform API derives
`platform:identity`. A `NULL` binding permits only `platform:identity` or
`services:manage`. The latter must remain unbound and authorizes only
programmatic service lifecycle, usage, and policy routes. A workspace may have
at most 10 unexpired, unrevoked keys. List responses return at most 100
metadata rows and never expose `secret_hash`, `created_by_email`, or the raw
key. Successful authentication updates `last_used_at` no more frequently than
once every five minutes.

Atomic rotation inserts a same-scope, same-binding replacement, writes
redacted audit events, and revokes the source. It never updates a secret in
place or broadens the principal.

### `developer_audit_events`

Append-oriented record of workspace and key lifecycle actions.

| Column | Purpose |
| --- | --- |
| `id` | Primary version 4 UUID |
| `workspace_id` | Foreign key to `developer_workspaces`; cascade delete |
| `actor_account_id` | Stable application actor when present |
| `actor_email` | Verified human actor when present |
| `api_key_id` | Optional machine actor reference reserved for later actions |
| `action` | Stable action name |
| `entity_type`, `entity_id` | Target kind and identifier |
| `detail_json` | Non-secret action metadata |
| `created_at` | Action time |

Current actions include workspace creation; member invitation, role update, and
removal; API-key creation, rotation, and revocation; service creation, rename,
and archive; and RPC access-policy update. Key lifecycle detail can include
safe prefix, last four characters, one scope, service binding, and expiry, but
never the raw key or its HMAC. `service.updated` stores only
`{"field":"name"}`. Programmatic service events identify the authorizing key
in `api_key_id` without copying a secret, digest, service name, or policy
value. The tenant audit route sanitizes action-specific detail and paginates
by opaque cursor.

### Better Auth and wallet tables

- `auth_users` is the stable customer authority.
- `auth_sessions` stores opaque, revocable seven-day browser sessions.
- `auth_accounts` stores credential or configured OAuth provider records.
- `auth_verifications` stores hashed verification identifiers and one-time
  wallet challenges.
- `auth_rate_limits` stores authentication admission counters.
- `auth_wallet_addresses` binds supported EVM addresses and chain IDs.
- `auth_solana_wallets` binds case-sensitive Solana addresses.

Wallet-only accounts have an internal `.invalid` email because the auth core
requires an email field. The application never exposes or authorizes by it.

### `developer_mutation_idempotency`

Retains a private 24-hour replay record for `service.create`,
`api_key.create`, and `api_key.rotate`.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `workspace_id` | Tenant foreign key; cascade delete |
| `operation` | Exact mutation namespace |
| `idempotency_hash` | Purpose-separated HMAC of the client header |
| `request_hash` | SHA-256 of canonical validated input |
| `resource_id` | Created service or replacement key identifier |
| `created_at`, `expires_at` | Replay lifetime |

The unique `(workspace_id, operation, idempotency_hash)` constraint isolates
tenants and operations. Neither the raw header nor an API-key secret is stored.
Expired records can be replaced. A service-create replay reads the original
resource. Key-create and rotation replays deny repeat secret disclosure.

### `developer_rpc_access_policies`

Stores at most one complete customer policy for each RPC service.

| Column | Purpose |
| --- | --- |
| `service_id` | Primary key and service foreign key; cascade delete |
| `workspace_id` | Tenant foreign key used by every read and update |
| `allowed_origins_json` | Exact browser origins, or an empty array |
| `allowed_ip_cidrs_json` | Normalized client CIDRs, or an empty array |
| `allowed_methods_json` | Customer method allowlist, or an empty array |
| `revision` | Positive optimistic-concurrency revision |
| `update_id` | Unique value binding one update to one audit event |
| `updated_by_account_id`, `updated_by_email` | Human actor when present |
| `created_at`, `updated_at` | Lifecycle times |

No row serializes as revision `0` with empty arrays. A replacement supplies the
complete policy and exact current revision. The update increments once or
returns a conflict. Programmatic updates record the authorizing API-key ID in
the audit row rather than these human actor fields.

### `developer_services`

Each row is a workspace-owned product configuration with product, name,
environment, network, region, status, optional endpoint path, configuration
JSON, creator account, lifecycle times, nullable `last_mutation_id`, and
optional archive time.
`platform-api` is `active` and maps to `/api/v1/platform/whoami`. An Ethereum,
Base, or Solana `rpc-api` service is `active` at beta maturity and maps to
`/api/v1/rpc/{serviceId}` only when `NODEZUNO_RPC_UPSTREAMS_JSON` contains a
valid upstream for that network. Ethereum must return `eth_chainId` `0x1`,
Base must return `eth_chainId` `0x2105`, and Solana must return the approved
Mainnet Beta genesis hash followed by `getHealth: "ok"`. An invalid, missing,
unreachable, unhealthy, or wrong-chain configuration fails closed, leaving the
effective service at `configuration_saved` with no endpoint.
Service reads reconcile that effective state without rewriting the durable
setup intent. Rename compares the caller's exact current `updated_at`, changes
only `name`, advances `updated_at`, and uses `last_mutation_id` to ensure the
same atomic batch writes exactly one redacted audit event. A no-op name update
returns the existing record without a new audit event.

An Ethereum `grpc-api` row becomes `active` only when the separately deployed
gateway's public endpoint, private shared authorization secret, named gRPC
health service, database-backed control-plane decision path, and Ethereum mainnet
upstream are ready. Its endpoint is the public HTTPS gRPC origin and its
configuration names the protobuf service. Source records do not prove that the
gateway is deployed. Other blockchain products remain `configuration_saved`
with no endpoint. A workspace can hold at most 50 unarchived service records.

### `ethereum_rpc_usage_buckets`

One hourly aggregate per service and API key. The row enforces the
service/key quota while storing bounded operational telemetry.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `workspace_id`, `service_id`, `api_key_id` | Tenant, service, and machine identity foreign keys; cascade delete |
| `bucket_start` | Start of the hourly UTC quota window |
| `quota_units`, `quota_limit` | Consumed method-weighted quota units and configured per-service/key ceiling |
| `request_count`, `rpc_call_count` | Admitted HTTP requests or native unary calls and actual JSON-RPC calls, independent of method weight |
| `error_count`, `upstream_failure_count` | Aggregate failed-call and upstream-failure counters |
| `latency_ms_total` | Aggregate request latency |
| `bytes_in`, `bytes_out` | Aggregate request and response byte counts |
| `last_request_at`, `updated_at` | Latest activity and mutation times |
| `expires_at` | Thirty-five-day retention boundary |

The `(service_id, api_key_id, bucket_start)` tuple is unique. Method weights
depend on the network stored on the referenced service. EVM HTTP and native
Ethereum gRPC share the EVM weights; Solana uses its separate schedule. An
HTTP batch consumes the combined weight of its executable members, while one
native unary call consumes its derived method weight before upstream access.
The `rpc_call_count` column records actual calls rather than weighted units.
The table never stores methods, parameters, headers, request bodies, or
upstream responses.

### `ethereum_rpc_workspace_quota_buckets`

One hourly aggregate per workspace, shared across every API key and HTTP RPC or
native gRPC service in that workspace.

| Column | Purpose |
| --- | --- |
| `id` | Primary UUID |
| `workspace_id` | Workspace foreign key; cascade delete |
| `bucket_start` | Start of the hourly UTC quota window |
| `quota_units`, `quota_limit` | Consumed method-weighted quota units and configured workspace ceiling |
| `updated_at` | Latest mutation time |
| `expires_at` | Thirty-five-day retention boundary |

The `(workspace_id, bucket_start)` tuple is unique. The HTTP route and private
native gRPC admission decision consume the same method-weighted units from
service/key and workspace quotas atomically in one database batch, so one
admitted request cannot update only one tier.

## Hashing and identifiers

### Purpose-separated HMAC

`RATE_LIMIT_SECRET` is imported as an HMAC-SHA-256 key. Values are signed over:

```text
purpose + NUL + value
```

Current purposes include email, newsletter email, review order email, review
order access, IP, user agent, abuse binding, and abuse challenge. The secret
must contain at least 32 characters;
missing configuration fails closed. Readiness also requires a non-empty,
valid `NODEZUNO_ADMIN_EMAILS` allowlist, a strong `BETTER_AUTH_SECRET`, and an
exact HTTPS `BETTER_AUTH_URL` so the administrative and customer surfaces
cannot silently become unavailable while health remains green.

Administrator identity resolves the verified application account first and
uses its real contact email. A wallet-only synthetic `.invalid` email resolves
to no administrator contact email. An optional verified Sites/Cloudflare
Access identity can supply a real email instead. Either path must then match
`NODEZUNO_ADMIN_EMAILS` before an administrator read or mutation, and the
resolved real email becomes `admin_audit_events.actor_email`.

The private review capability is a purpose-separated HMAC of the idempotency
key, a NUL separator, and the normalized request hash. A second
purpose-separated HMAC is stored in `access_token_hash`. This makes an exact
idempotent retry reproduce the same private capability without storing it in
plaintext, while a changed normalized request remains a conflict. Possession of
the idempotency key and public request fields alone is insufficient without the
server HMAC secret.

The IP and user-agent fingerprints include the UTC date before HMAC and
therefore rotate daily. They are also purpose-separated. Better Auth session
rows separately retain their source IP and user-agent values.

`API_KEY_PEPPER` is a separate HMAC-SHA-256 key. The complete presented API key
is signed over:

```text
developer-api-key + NUL + complete raw key
```

The pepper must contain at least 32 characters and must not equal or derive
from `RATE_LIMIT_SECRET`. Missing configuration fails key creation,
authentication readiness, and overall readiness. Key HMACs are compared in
constant time after the embedded key ID selects a bounded candidate row.

### Plain SHA-256

- `request_hash` hashes a canonical normalized submission payload for
  idempotency comparison.
- The review order request hash covers the normalized commercial application
  for idempotency comparison.
- `review_stablecoin_payment_claims.evidence_hash` fingerprints normalized,
  agreeing public-chain evidence without storing RPC URLs or headers.
- `unsubscribe_token_hash` hashes a 64-hex-character random token.

Plain SHA-256 is acceptable for the high-entropy unsubscribe token. It must not
be substituted for password hashing or used to claim that low-entropy personal
data is anonymized.

## Record lifecycles

### Submission

```text
validated
  → received
  → reviewing
  → closed

received/reviewing
  → spam

any stored state
  → hidden from reads at expires_at
  → physically removed by cleanup
```

Submissions expire 730 days after acceptance. Account and admin reads exclude
them immediately after `expires_at`, even if physical cleanup has not yet run.
Cleanup deletes related submission outbox rows first; deleting the submission
cascades its events.

### Newsletter

```text
new consent → pending
pending      → subscribed through matching unexpired confirmation POST
pending      → same pending attempt while its link is live
pending      → new pending attempt after link expiry
subscribed   → subscribed without mutation on renewed consent
any state    → unsubscribed through a matching token
unsubscribed → new pending attempt on renewed consent
```

The API transition guard prevents a stale confirmation from undoing an
unsubscribe or confirming a newer attempt.

### Upgrade Assurance order

```text
new bounded order → proposal_ready
legacy qualification_pending → proposal_ready
proposal_ready → deposit_pending → deposit_paid → scheduled → in_review
in_review → remediation → balance_due → paid → completed
paid/completed → payment_refunded → cancelled
qualification states → declined
any active state before completion → cancelled
```

The diagram summarizes the service lifecycle. Route guards enforce the
specific allowed source states. A valid new order automatically records a
monotonic service-order version, reviewer, scope, exclusions, issue time, and
expiry. The buyer accepts that exact version when creating the stablecoin
instruction. Administrator issuance remains only for exceptional reissue or
legacy correction.

```text
instruction: awaiting_transfer → submitted → checking/confirming → verified
                                     ├──→ rejected → awaiting_transfer
                                     └──→ manual_review
awaiting_transfer → expired or cancelled
```

Claim submission changes no paid state. The verification worker advances only
when every configured endpoint agrees on chain ID 1, successful canonical
transfer evidence, sufficient confirmations, and finalized-block progress. A
verified deposit moves `deposit_pending` to `deposit_paid`; a verified balance
moves `balance_due` to `paid`. Commercial state conflict preserves evidence
and enters manual review. There is no alternate local completion path.

### Status service

The schema permits transitions among all service states. The application does
not enforce a state-transition graph. An administrator and content owner must
ensure that a stronger state has current evidence and that incident states do
not understate observed impact.

### Chain publication

```text
planned ↔ preview
planned/preview → full or data_only only when capabilities are non-empty
full/data_only → planned/preview clears verified_at
```

The non-empty capability check is a minimum publishing guard, not a substitute
for technical validation.

### Developer workspace

```text
stable application account ID or retained legacy verified email
  → active workspace + owner membership
  → suspended or closed only through a future reviewed administrative path
```

Repeated provisioning by the same owner identity returns the existing
workspace. A non-active workspace cannot manage keys and invalidates its keys
at authentication time.

### Developer API key

```text
issued → active
active → expired at expires_at
active → revoked at revoked_at
```

Creation discloses the raw key once. Revocation records `revoked_at` and is
idempotent for an existing workspace key. Revoked and expired keys remain as
metadata and audit evidence; this release has no key deletion route.
A service-bound key cannot be reassigned. A key bound to an archived service
cannot invoke another service; issue a replacement with the intended binding.
Rotation creates a same-scope, same-binding key and revokes the source in one
batch. It does not mutate the stored secret or binding in place.

## Retention and deletion

| Data | Current policy implemented in code |
| --- | --- |
| Submissions | Expires after 730 days; excluded from reads; cleanup deletes row, events, and submission outbox |
| Submission events | Follow parent submission through cascade |
| Submission outbox | Deleted before expired parent submission |
| Review orders | Expires after two years; buyer access and account history exclude expired rows; no automated physical cleanup yet |
| Review events, stablecoin intents, and claims | Follow the parent through cascade if an order is physically deleted; no current cleanup job deletes expired orders |
| Stablecoin reconciliation cases and payment confirmations | Cannot be updated or deleted after their guarded terminal facts; restrictive foreign keys prevent parent deletion while financial evidence exists |
| Telegram usernames and transaction claims | Retained with the parent order for the current two-year order policy; no independent cleanup path yet |
| Review deliverable metadata | Follows the parent through cascade if legally deletable; no current cleanup job deletes it |
| Private R2 deliverable bytes | No lifecycle rule is configured by this repository; retention and cleanup require an explicit operator policy |
| Alternate AWS S3 deliverable bytes | Temporary current objects expire after one day; noncurrent versions expire after 730 days; retained current versions have no automatic expiry |
| Rate-limit windows | Logical enforcement ends after one window; cleanup expiry after two windows |
| Newsletter subscriptions | No automatic expiry |
| Newsletter outbox | No automatic expiry |
| Status and chain catalogs | Retained until explicitly changed through an approved process |
| Incidents and updates | No automatic expiry |
| Admin audit events | No automatic expiry or delete route |
| Developer workspaces and members | No automatic expiry or self-service delete route |
| Developer API keys | Authentication expires after 365 days; metadata has no automatic deletion |
| Developer audit events | No automatic expiry or delete API; tenant members can read a sanitized cursor page |
| Developer mutation idempotency | Logical expiry after 24 hours; expired rows can be replaced and are eligible for maintenance |
| Auth users, provider accounts, and wallet links | No self-service erasure workflow |
| Auth sessions | Seven-day logical expiry; expired-row cleanup is provider-managed |
| Developer services | Archived records are retained; no automatic deletion |
| RPC access policies | Follow the service through cascade delete; no separate expiry |
| RPC service/key usage buckets | Expire after 35 days; opportunistic cleanup removes expired buckets |
| RPC workspace quota buckets | Expire after 35 days; opportunistic cleanup removes expired buckets |

The retention maintenance endpoint is administrator-only, same-origin, and
audited. It currently removes expired submissions and rate-limit windows; it
does not purge newsletter, status, chain, incident, or audit data. The RPC
route separately performs bounded, opportunistic cleanup of expired RPC
buckets.

## Access paths

| Data | Public API | Verified account | Administrator |
| --- | --- | --- | --- |
| Submission receipt | Creation response only | Own account-ID-bound unexpired rows | Latest unexpired rows |
| Submission message/contact | No public list | Own account-ID-bound unexpired rows | Latest unexpired rows |
| Review order and proposal | Possession of the exact high-entropy capability, exchanged for a scoped HttpOnly cookie | Own stable account-ID-bound unexpired rows | Latest rows through the restricted order queue |
| Stablecoin instruction and claim | Same authorized buyer portal, including exact public transfer instruction, normalized Telegram username, transaction hash, and safe claim state | Own stable account-ID-bound rows through export schema version 5 | Restricted order queue and verification evidence |
| Stablecoin confirmation receipt | Authorized buyer route for the exact order | Own bound order through the same authorization | Restricted order and reconciliation workflow |
| Stablecoin reconciliation case | No unrestricted public read | Buyer-safe outcome only through the authorized order and confirmation receipt | Restricted administrator resolution and audit |
| Released deliverable metadata and bytes | Authorized buyer portal plus short-lived version-pinned download | Own bound order | Full sealed metadata, prepare, verify, and release workflow |
| Newsletter row | No | No | No application UI/API |
| Status services/incidents | Read | Read | Read; service state update |
| Chain catalog | Read | Read | Read; stage update |
| Rate-limit counters | No | No | Maintenance count/delete only |
| Administrator audit events | No | No | Written by administrator mutations; no read API |
| Outbox | No | No | No application UI/API |
| Developer workspace | No | Own workspace through `/console` and developer API | No administrator UI/API |
| Developer API-key metadata | No | Own workspace through `/console` and developer API | No administrator UI/API |
| Developer service records | No | Own workspace through `/console` and developer API; unbound `services:manage` key through the programmatic API | No administrator UI/API |
| RPC access policy | No | Same-workspace session or unbound `services:manage` key | No administrator UI/API |
| Raw developer API key | No | Creation response only | Never stored or retrievable |
| Key-authenticated identity | Bearer key returns only its own workspace/key identity | Same bearer contract | Same bearer contract |
| Developer audit events | No | Sanitized own-workspace cursor timeline | No administrator UI/API |
| RPC aggregate usage and quotas | No | Enforced during RPC calls and readable as bounded aggregate reports by same-workspace sessions or unbound `services:manage` keys | No administrator UI/API |

The lack of an application read route does not replace database-level access
control, backup policy, operational logging, or incident procedures.

## Migration and release rules

Migration `0007_shared_grpc.sql` rebuilds `developer_services`,
`developer_api_keys`, and `ethereum_rpc_usage_buckets` so the service-product
constraint includes `grpc-api` while preserving existing rows, foreign keys,
constraints, and indexes. It is not an additive `ALTER TABLE` in SQLite terms.
Before production, rehearse it with representative existing services,
service-bound product keys, unbound identity keys, and usage rows. Compare row counts,
relationships, foreign-key checks, and key authentication before and after.

Migration `0015_upgrade_assurance_commerce.sql` adds the four commerce tables,
their fixed-money and lifecycle constraints, account and expiry indexes, and
the current public status-service seed. Validate it on both SQLite and D1.
Confirm foreign keys, fixed USD amounts, provider-session uniqueness, event-ID
replay uniqueness, account isolation, and status seed visibility before
cutover.

Migration `0016_newsletter_double_opt_in.sql` adds the current confirmation
token identity, hash, issue, expiry, and confirmation timestamps. Migration
`0017_notification_delivery_state.sql` rebuilds `notification_outbox`, resets
legacy `processing` rows to `pending`, adds sealed delivery, lease, provider,
acceptance, delivery, retry, and dead-letter fields, replaces the old logical
uniqueness index, and installs the immutable-seal trigger. Migration
`0018_resend_webhook_events.sql` added a provider event ledger for an earlier
mail integration. `0028_zoho_email_delivery.sql` rebuilds the outbox to accept
Zoho SMTP identity and drops that now-unused ledger. Rehearse the `0017` table rebuild against representative pending and
failed rows and verify row counts, payload preservation, indexes, trigger
behavior, foreign keys, and a complete worker pass before cutover.

Migration `0019_ethereum_stablecoin_payments.sql` adds nullable
`review_orders.telegram_username`, both stablecoin settlement tables, their
fixed Ethereum mainnet and seller-recipient constraints, globally unique
transaction hashes, unique instruction amounts, partial active-state indexes,
worker scheduling indexes, and the payment-verification status seed. Existing
orders remain valid because Telegram becomes mandatory only when a claim is
submitted. Rehearse the migration against both an empty database and a copy
with legacy review and payment rows. Verify row counts, foreign keys, checks,
unique indexes, status seed replacement, and account-export tenant isolation.

Migration `0020_payment_operational_guards.sql` adds the instruction-pinned
confirmation threshold, accepted terms version and hash, hashed creation
idempotency identity and request seal, immutable triggers, and the singleton
`payment_verifier_health` table. Rehearse idempotent creation conflicts,
configuration-hash changes, stale-heartbeat denial, and immutable intent fields.

Migration `0021_review_lifecycle_notifications.sql` rebuilds
`notification_outbox` so `review.lifecycle.buyer` is a valid sealed topic while
preserving existing rows, indexes, and immutable triggers. Verify each guarded
administrator transition, deposit and balance verification, manual-review
notice, deterministic replay, provider acceptance, and signed delivery event.

Migration `0022_review_delivery.sql` adds `review_deliverables`, active-kind
uniqueness, state and identity guards, storage-version identity, and release
indexes. Rehearse expired pending-upload revocation, checksum and KMS mismatch
denial, final report and manifest completion gating, buyer isolation, and
version-pinned download generation.

Migration `0023_stablecoin_reconciliation.sql` adds immutable reconciliation
cases and payment confirmations, relationship and workflow triggers,
idempotent resolution identity, delete protection, terminal claim-evidence
immutability, automatic exact-match receipt creation, automatic seller-received
case opening, and backfills for existing verified and eligible manual-review
claims. Rehearse every case type and resolution code, concurrent and changed
idempotency reuse, external refund recording, order-phase confirmation
uniqueness, buyer receipt isolation, and attempted evidence update or deletion.

1. Make schema changes in `db/schema.ts`.
2. Generate a Drizzle migration; never hand-edit production state in place.
3. Prefer additive changes. Backfill before making a new field mandatory.
4. Apply the migration to a new database using the intended driver.
5. Verify all required seeds, constraints, indexes, and health checks.
6. Run contract tests and the backend smoke flow.
7. Package the exact migration with the exact validated source release.
8. Verify production `/api/v1/health`, email and wallet sessions, replay
   rejection, account-bound request history, workspace provisioning, service
   create/archive, one-time key issue, key authentication, and revocation
   after deployment. When RPC is enabled, verify Ethereum `0x1`, Base `0x2105`,
   Solana genesis and health, both hourly quota tiers, redacted health state,
   and aggregate usage writes without storing payloads. When Upgrade Assurance
   settlement is enabled, also verify qualification before proposal,
   capability isolation, immutable server pricing, canonical USDC and USDT
   contracts, exact atomic amount, mandatory Telegram input, transaction replay
   denial, cross-RPC agreement, confirmation and finality policy, and both
   payment phases. For enabled email
   delivery, verify exclusive worker claims, lease recovery, immutable seals,
   retries, dead letters, SMTP acceptance, lifecycle buyer notifications, and POST-only
   newsletter confirmation. For current Cloudflare deliverables, verify the
   authenticated streamed R2 upload, sealed SHA-256 and metadata, object version
   capture, mandatory final report and manifest, release authorization, and
   exact-order streamed download. Follow the separate AWS procedure only when
   deploying that alternate profile.

Never:

- remove or reinterpret an enum value without a migration plan;
- repurpose a consent version;
- expose outbox payloads through a public API;
- insert `full`, `operational`, or customer-facing evidence claims only to
  improve presentation; or
- treat a successful migration as proof that product-plane infrastructure
  exists.

## Known current boundaries

- The current Cloudflare Worker has a bounded D1 outbox sender that processes
  at most one item per minute. Each Cron invocation is subject to the 10 ms
  Free CPU cap. Provider delivery requires the Zoho SMTP host, app password,
  and live operational verification. The alternate SQLite profile has a
  separate one-shot sender.
- Source inspection does not prove live Zoho SMTP acceptance or mailbox
  receipt. Confirm a controlled message reaches `info@nodezuno.com` before
  making a production delivery claim.
- `accepted` means Zoho's SMTP server accepted a message. It does not mean the
  destination mailbox received it.
- Newsletter, newsletter-outbox, incident, and audit retention are not
  automated.
- Incident update rows are not included in the public status response.
- Status services are administrator-curated; no production telemetry feeds
  them.
- Chain `verified_at` records promotion time, not an independently stored
  evidence artifact.
- Developer workspace, key, and audit rows have no self-service erasure path or
  automatic retention cleanup yet.
- The data model contains a narrow fixed-price Upgrade Assurance order and
  stablecoin settlement, immutable confirmation, and seller-received anomaly
  reconciliation ledger. Migration `0024` removes the retired provider-payment
  and provider-webhook tables after proving they contain no production records.
  The model also retains bounded aggregate multi-chain RPC usage and two hourly
  quota tiers. It does not contain general billing, invoices, subscriptions,
  automatic overage, per-method analytics, request payloads, or provider
  responses. A recorded refund remains an externally signed wallet transaction,
  not an application-initiated transfer.
- Cloudflare D1 stores website, identity-control-plane, and bounded RPC
  aggregate data. Alternate container SQLite is limited to one process and
  one durable local volume; container D1 REST is a compatibility profile.
  Neither driver
  stores blockchain node state. Broader transaction, index, signing, rollup,
  subscription, invoicing, refund-initiation, and dispute planes need separate data
  architectures and threat models.
- The database stores final deliverable metadata, not file bytes. The current
  Cloudflare profile stores bytes in private R2 with Cloudflare-managed
  encryption at rest. The alternate AWS profile supplies private versioned S3
  and a dedicated KMS key. Public intake still does not store confidential
  source or exploit evidence.
