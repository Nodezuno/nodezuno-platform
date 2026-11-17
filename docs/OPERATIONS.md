# Nodezuno.com operations runbook

The active low-cost deployment target is Cloudflare Workers, D1 (`DB`), and
private R2 (`DELIVERABLES`), with Zoho SMTP through `info@nodezuno.com` for
outbound email. The AWS container,
SQLite, S3, KMS, and payment-worker procedures in this runbook are alternate
legacy deployment instructions and do not describe the Cloudflare Free
profile. The Cloudflare launch boundary and current limits are documented in
[CLOUDFLARE_FREE_TIER.md](CLOUDFLARE_FREE_TIER.md). Stablecoin payment mode
uses manual Ethereum payment handling in the Cloudflare configuration; no
automatic payment-verification worker runs there.

This runbook covers the Nodezuno.com website implementation, its first-party
website APIs, Better Auth customer boundary, self-service developer workspace,
service and API-key control plane, and durable application data. It is the source of truth for
routine operation, incident response, retention, and recovery validation.

The public product is a security review for one smart contract or protocol
release across supported EVM and non-EVM ecosystems. The
repository retains earlier developer-workspace, RPC, and gRPC foundations as
nonpublic compatibility code. They are not current products and must remain
unconfigured unless a separate product decision, threat model, deployment,
and runbook explicitly activate them.

## Product and commercial boundary

The public offer is a scoped, paid, human-reviewed release security review.
A valid bounded form creates a fixed service order immediately, without
manual proposal approval. The buyer accepts its terms, opens payment
instructions, and submits the transaction hash and mandatory Telegram
username. All supported EVM and non-EVM reviews cost USD 7,500, split into
a USD 3,750 scheduling deposit and USD 3,750 final balance. Creating an order
is not payment proof or authorization to deploy. Work begins only after
verified payment, complete materials, scope validation, conflict checks,
and confirmed reviewer availability. The standard EVM five-business-day
target starts after readiness; non-EVM estimates are confirmed at kickoff.

Production payment is a direct Ethereum mainnet transfer of canonical USDC or
USDT. The buyer receives an immutable exact-amount instruction only after
accepting the current service order, then submits a transaction hash and mandatory
Telegram username. Claim submission is not payment proof. Only the dedicated
worker's agreeing, finalized Ethereum RPC evidence can advance an order.

No RPC, gRPC, node, wallet, signer, custody, deployment, or transaction product
is offered by this runbook.

## Service inventory

| Surface | Implementation | Durable state | Operational meaning |
| --- | --- | --- | --- |
| Website and server-rendered pages | Vinext App Router on a Cloudflare Worker with managed static assets | Versioned source and Worker deployment | Public company, product, documentation, legal, and order experiences; the 10 ms Free CPU ceiling may reject expensive dynamic requests |
| Website and control-plane API | Route handlers under `/api/v1` | Selected application database where noted | Health, customer auth, workspace/key/service lifecycle, key identity, bounded Ethereum, Base, and Solana JSON-RPC, prelaunch catalogs, gas calculation, form intake, newsletter control, and restricted administration |
| Database | Cloudflare D1 through the `DB` binding; container D1 REST or SQLite are alternate profiles | Cloudflare-managed D1; D1 recovery/export is separate from R2 object recovery | Website records, Better Auth sessions and identities, review orders, payment evidence, notification outbox, and audits; dormant developer foundations remain nonpublic |
| Customer authentication | Better Auth with database-backed sessions | Selected database and host-only cookie | Email/password, configured Google, supported EVM EOA, and Solana Wallet Standard |
| Administrator identity | Verified real-email Better Auth account by default; optional Sites dispatch or verified Cloudflare Access JWT overlay | Selected database or provider-managed identity | Human proof before administrator authorization; wallet-only synthetic email is excluded |
| Administrator authorization | `NODEZUNO_ADMIN_EMAILS` allowlist | Provider environment variable | Mandatory server-side authorization after either accepted identity path |
| Abuse-control key | `RATE_LIMIT_SECRET` | Sites secret | HMAC fingerprints and signed browser challenges |
| API-key pepper | `API_KEY_PEPPER` | Sites secret | HMAC verification of one-time-disclosed developer keys |
| Review capability key | `REVIEW_CAPABILITY_SECRET` | Sites secret | HMAC derivation and verification for durable private review links |
| RPC upstreams | `NODEZUNO_RPC_UPSTREAMS_JSON` | Sites secret | One to four ordered real HTTPS upstreams for each configured Ethereum, Base, or Solana network; invalid or empty means unavailable |
| RPC quotas | Both `NODEZUNO_RPC_*_HOURLY_CALL_QUOTA` values | Sites environment | Network-weighted per-key/service and workspace-wide hourly admission |
| Transactional notification delivery | Cloudflare scheduled Worker pass, bounded to one D1 outbox message per minute, using Zoho SMTP over TLS port 465 | `notification_outbox` | Submission, review-application, buyer lifecycle, payment-state, and newsletter messages; SMTP acceptance is recorded but inbox delivery is not confirmed; no provider callback or CRM synchronization |
| Stablecoin payment intake | Manual Ethereum Mainnet USDC/USDT instructions and transaction submission | D1 payment/order records plus buyer and operator notification outbox | Operator inspects the transaction, records a manual check note, and contacts the customer. Submitted hashes are not proof; automatic verification is off |
| Secure review delivery | Authenticated streamed Worker upload and exact-order streamed download | `review_deliverables`, private R2, D1 audit events | Stores verified final reports, evidence archives, and manifests outside D1; public intake still accepts no confidential file upload |

The alternative standalone-container profile runs the same application with
one explicit ingress mode. `direct` validates the effective host and protocol
against `PUBLIC_ORIGIN`, requires a blank origin secret, and uses the
provider-appended last `X-Forwarded-For` address for rate-limit identity.
`trusted-gateway` requires a separately managed gateway and distinct injected
secret. A real-email application account plus `NODEZUNO_ADMIN_EMAILS` is the
portable administrator default. Cloudflare Access is an optional verified
identity overlay. The container can use D1 through REST or SQLite on one
persistent-volume application instance. See
[CONTAINER_DEPLOYMENT.md](CONTAINER_DEPLOYMENT.md).

The repository publishes the website API contract at
`/api/v1/openapi`. Public status reports current website and intake readiness,
payment-verification readiness, published service maturity, and recorded
incidents. It is not historical uptime, chain-wide telemetry, or evidence
that a customer engagement has started. The chain response remains a
prelaunch publication surface. Readiness and worker diagnostics are separate
operational checks.

RPC quota enforcement uses separate EVM and Solana method-weight tables. A
batch consumes the combined weight of its executable members. The
`rpc_call_count` telemetry field remains an actual call count and must not be
interpreted as weighted quota consumption.

RPC upstreams must use public HTTPS on default port 443. User information,
fragments, private or special-use hosts, redirects, and routing-sensitive
headers are rejected. Provider URLs and headers remain secrets throughout
configuration, incident response, and release evidence. Application hostname
validation does not pin DNS resolution, so approved egress and DNS controls
remain mandatory.

## Operational ownership

Assign named humans to these roles in the organization's access-controlled
incident system before enabling public self-service customer access:

| Role | Responsibility |
| --- | --- |
| Website operator | Deployments, Sites configuration, health checks, and code rollback |
| Data steward | Database access, retention, backups, exports, erasure requests, and restore approval |
| Security reviewer | Secret rotation, administrator access, security incidents, and evidence handling |
| Email operator | Verified sender, provider access, signed webhook, suppression, dead-letter reconciliation, and controlled test mailbox |
| Payment operator | Ethereum endpoint ownership, preflight, worker schedule, manual-review reconciliation, treasury observation, and customer contact without access to a server-side seller key |
| Incident commander | Severity, timeline, containment decisions, communications, and closure |

The repository intentionally does not invent individual owners, pager
destinations, or public service-level commitments. A release is not generally
available until those assignments and escalation destinations exist outside
the repository.

## Health and readiness

### Canonical probes

`GET /api/v1/live` is process liveness and does not call the database. Providers may use
it to decide whether the container or Worker can answer HTTP.

`GET /api/v1/ready` is the website-backend readiness probe.
It returns a compact envelope with `status: "ready"` and HTTP `200`, or
`status: "not_ready"` and HTTP `503`.

The AWS Caddy edge actively checks this readiness route. It does not admit new
requests to a process that is alive but has lost database or configuration
readiness.

`GET /api/v1/health` reports the same dependency checks with high-level
diagnostic fields. A healthy response has HTTP `200` and reports:

- `status: "healthy"`
- `database: true`
- `configuration: true`
- `scope` stating that the check covers the website, developer workspace, and
  API-key control plane and gateway configuration, not blockchain network
  health

The database check reads every required table, requires at least six seeded
status services and eight seeded chains, and verifies that all persistence
surfaces are queryable. Configuration rejects repository placeholders,
surrounding or control whitespace, low-diversity or reused secrets, application
origin mismatch, an invalid ingress mode or mode/secret pairing, placeholder
administrator values, invalid optional Access values, and incomplete Google or
Zoho SMTP configuration. Google and Access may be completely absent. A deployed runtime
requires a valid Zoho SMTP host and app password before it can expose
email/password or report ready. Explicit loopback local preview is the only
unverified-email exception. Failures return `503` without exposing SQL,
binding names, stack traces, or secret values.

The Cloudflare Cron handler processes at most one D1 outbox row per minute and
is subject to the Free Cron CPU limit. The optional notification pipeline is
disabled when the Zoho SMTP host and app password are both blank. Production
delivery requires both values. The
Cloudflare worker uses the D1 binding and `PUBLIC_ORIGIN`; it does not require
a host SQLite path. The alternate container worker uses SQLite.

The Cloudflare production default is `disabled`. After the launch approval
flag is true and the owner explicitly changes the mode to `manual_ethereum`, it
issues Ethereum Mainnet USDC/USDT instructions without an RPC verifier. After
the customer submits a hash and Telegram username, the Worker queues a buyer
acknowledgement and an operator email. The operator checks the canonical token contract,
successful transaction status, exact recipient, and exact amount on Ethereum
Mainnet before using **Confirm manually checked payment** in the admin order.
The note is retained in the order event and admin audit log. This is a human
attestation, not automatic or multi-provider verification. The customer is not
marked paid merely by submitting a hash. Email delivery depends on the
configured Zoho SMTP service; if it is unavailable the outbox keeps the notice
pending. Set mode to `disabled` to stop issuing new payment instructions.

The separate automatic mode `ethereum_mainnet` requires
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and two or three valid entries in
`NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON`. It is not enabled in the Cloudflare
profile. The optional confirmation policy accepts 6 to 64 and defaults to 12.
Configuration parsing is not proof of a healthy chain. For a separately
approved automatic-verification runtime, run
`pnpm run payments:preflight`; every configured endpoint must report chain ID
1, fresh latest and finalized blocks, deployed canonical USDC and USDT code,
six token decimals, and sane unknown-receipt behavior. Do not record endpoint
URLs or headers in release evidence.

The one-shot worker refreshes `payment_verifier_health` during every pass. A
healthy record requires every provider to report Ethereum chain ID 1, fresh
latest and finalized blocks, and no more than eight blocks of latest-head
spread. The record is bound to the current mode, confirmation policy, provider
identities, and endpoint URLs. New instructions require a matching healthy
heartbeat no older than 150 seconds. `/api/v1/status` derives the payment
component from this record. It does not treat configuration parsing as live
payment readiness.

A public AWS container also requires `AWS_REGION`,
`NODEZUNO_DELIVERABLE_BUCKET`, and
`NODEZUNO_DELIVERABLE_KMS_KEY_ARN`. The AWS host bundle injects these values
from Terraform-created resources. Configuration readiness does not prove S3,
KMS, CORS, IAM, CloudTrail, checksum, or version-pinned download behavior;
those remain deployed release checks.

Health reports redacted per-network RPC and native gRPC configuration state
and an explicit scope. This check parses configuration only. It makes no
upstream request, does not call gRPC serving health, and does not verify chain
identity, chain head, provider latency, quota capacity, or entitlement. Overall
website health does not become unhealthy merely because optional product
configuration is absent.

### Read-only production checks

Run these checks after a deployment and during triage:

```bash
curl --fail --silent --show-error https://<production-host>/api/v1/health
curl --fail --silent --show-error https://<production-host>/api/v1/status
curl --fail --silent --show-error https://<production-host>/api/v1/chains
curl --fail --silent --show-error https://<production-host>/api/v1/openapi
curl --fail --silent --show-error https://<production-host>/docs
```

Replace `<production-host>` with the actual Sites deployment hostname or the
verified custom domain. Read the JSON; a successful HTTP status alone is not
enough. Status must show the developer workspace as current control-plane
readiness. In the AWS Upgrade Assurance profile, payment verification must be
`operational` only while its persisted heartbeat is fresh and configuration
matched. An RPC network must be customer-active only after its current
bounded identity and health probe. Its disclaimer must deny historical uptime
and chain-wide telemetry meaning. Planned catalog and chain entries must not be
promoted beyond verified capability data.

Search indexing is a deliberate launch switch. The default
`NODEZUNO_PUBLIC_INDEXING=false` causes the root metadata and `robots.txt` to
deny indexing. Set it to the exact string `true` only after the public domain,
canonical metadata, legal pages, customer routes, and release gates pass. The
runtime also requires `NODEZUNO_LEGAL_LAUNCH_APPROVED=true`; indexing remains
blocked if approval is absent. The public sitemap contains canonical content
pages only, and robots rules continue
to block API, account, administrator, console, signup, login, and password
recovery paths. A private or owner-only deployment must keep the value false.

The AWS production profile includes an SNS alert destination, short-retention
CloudWatch application and edge logs, host metrics, readiness alarms, and a
backup-age alarm. Confirm the SNS subscription after provisioning. It does not
provide external uptime monitoring or a staffed paging rotation. Configure
those before general availability. A reasonable minimum monitor set is:

- `/api/v1/health` status and latency
- HTML availability for `/` and `/docs`
- rates of `5xx`, `429`, and `application/problem+json` codes
- selected-database errors and runtime exceptions grouped by `requestId`
- terminal notification failures and unresolved notification age
- aggregate public-edge `5xx` responses
- administrator authentication and authorization failures
- customer signup, session creation, sign-out, and wallet challenge failures
- developer workspace/key mutation failures and `api_key_invalid` rates
- service create/archive failures and unexpected cross-workspace or
  cross-service denials
- unexpected growth in active keys, unbound management keys, or
  isolation-denial events
- RPC `401`, `403`, `429`, `502`, `503`, and `504` rates by safe code
- key/service and workspace quota remaining, without recording raw keys
- aggregate RPC upstream-failure count, latency, and bytes from database usage
  rows
- provider-side error, latency, capacity, and spend alerts for each configured
  upstream
- outbox depth by `pending`, `processing`, `accepted`, `delivered`, and
  `failed`, including expired leases and age of the oldest row
- Zoho SMTP connection and authentication failures, plus reports of missing
  messages, without logging recipients or message content
- payment verifier healthy state and heartbeat age, oldest pending claim age,
  selected versus processed and deferred counts, isolated worker failures, and
  any manual-review claim
- deliverable prepare, verification, release, and download failures, R2
  storage errors, checksum or metadata mismatches, abandoned temporary uploads,
  and bucket storage growth; use CloudTrail/KMS alerts only for the alternate
  AWS deployment

The worker is implemented, but a release without both Zoho SMTP settings
leaves queued rows pending. `accepted` is SMTP-server acceptance, not proof of
mailbox delivery. Verify receipt directly in the Zoho mailbox.

### AWS alarm response map

Treat every SNS `ALARM` notification as an incident signal until an operator
identifies its scope. Treat missing metric data as a host, publisher, or
permission failure when the Terraform alarm is configured to breach on missing
data. An `OK` notification shows that the metric recovered; it does not close
the incident or prove that queued work and customer state are reconciled.

| Alarm suffix | First safe response |
| --- | --- |
| `ec2-system-status` | Check the AWS regional and EC2 system view, stop deployments, and recover or replace the host without restoring SQLite unless corruption is confirmed. |
| `ec2-instance-status` | Check instance reachability and SSM, preserve the data volume, reboot only with an incident record, and use the host-rebuild runbook if reachability does not recover. |
| `cpu-high` or `cpu-credit-low` | Inspect aggregate process and request load, stop runaway maintenance work, apply provider caps, and resize the one host when sustained. Do not add a second SQLite writer. |
| `memory-high` or `swap-use` | Inspect bounded container and host memory, stop the leaking or nonessential task, preserve logs, and resize before restarting repeated heavy work. |
| `disk-high` or `root-disk-high` | Stop writes if exhaustion is near, identify growth without opening customer files, expand the volume, and remove only documented disposable artifacts. Never delete SQLite, sidecars, current release data, or unverified backups. |
| `readiness` | Read `/api/v1/ready` and `/api/v1/health`, compare the deployed digest and configuration, and roll back the image for a compatible code regression. Do not restore data for an image failure. |
| `deployment-failure` | Preserve the SSM command result and aggregate release logs, confirm whether automatic image and environment rollback became ready, and stop further releases until the failed migration, preflight, readiness, or backup gate is understood. Do not restore SQLite for an image-only failure. |
| `edge-5xx` | Check the independent monitor, Caddy and application aggregate logs, safe response codes, and representative request IDs. Confirm DNS and TLS when local readiness remains healthy. |
| `backup-age` | Freeze migrations and high-risk administrator work, inspect the backup timer and last failure, create and upload a new verified backup, then confirm off-host retrieval under approved operator access. |
| `background-workers-health` | Check both timer and service states, the shared background lock, last-success files, database access, and aggregate worker output. Preserve queued rows and never edit leases by hand. |
| `payment-verifier-health` | Keep new payment instructions closed, run the redacted payment preflight against every configured provider, preserve claims, and require a fresh configuration-matched heartbeat before reopening. |
| `payment-claim-age` | Inspect the restricted claim state and aggregate worker result, repair provider or scheduler health, and allow deterministic retry. Never mark paid from a hash, screenshot, or explorer. |
| `payment-manual-review` | Assign an owner, tell the buyer not to pay again when seller-received evidence exists, and use only the guarded reconciliation procedure. |
| `notification-terminal-failures` | Assign an owner, inspect safe outbox state and provider event history, correct the cause through a reviewed release, and do not edit or requeue a sealed row manually. |
| `notification-unresolved-age` | Check the email timer, expired leases, Zoho SMTP acceptance, and controlled mailbox receipt. Distinguish pending, accepted, internally delivered, and failed states. |

Record the alarm ARN or name, transition time, safe metric value, assigned
owner, containment, recovery evidence, and linked incident. Do not copy request
payloads, customer identifiers, payment facts, endpoint configuration, or
signed URLs into SNS replies or incident chat.

## Routine operation

### Local start and verification

The supported runtime is Node.js `>=22.18.0`. The committed pnpm lockfile is the
reproducibility boundary:

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

In a second terminal, exercise the local database and mutation contracts:

```bash
pnpm run smoke:local
pnpm run smoke:auth -- http://localhost:3000
pnpm run smoke:links -- http://localhost:3000
```

The smoke script creates local-only records and verifies health, status, chains,
submission acceptance, replay, conflict, abuse challenge enforcement,
administrator transitions, audit creation, retention maintenance, account
identity normalization, self-service workspace and key lifecycle,
key-authenticated identity, newsletter persistence, and the unsubscribe page.
Do not point this script at production: it uses local identity-header
simulation and intentionally writes test data. It does not replace the
dedicated Better Auth email, EVM, Solana, replay, and session tests.

The auth smoke uses real loopback HTTP routes for email, EVM, and Solana
sessions and rejects replay of both wallet signatures. It refuses non-loopback
targets. The link smoke is read-only and crawls catalog routes, discovered
same-origin pages, redirects, assets, and fragment anchors. It accepts HTTPS
or loopback HTTP only.

Record the exact build, test, skipped-test, smoke, and link-target results from
the release commit. Do not copy a historical count into a new release record.
For a D1 REST release, any disposable integration skipped because isolated
cloud credentials were not supplied remains a cutover gate. For SQLite, the
equivalent gates are the real adapter and migration tests plus a
persistent-volume backup and isolated restore rehearsal. Local evidence is not
production evidence.

### Notification worker and reconciliation

`scripts/process-notification-outbox.mjs --once` performs one bounded SQLite
pass. It processes at most 25 eligible rows and exits. AWS schedules it every
minute with `nodezuno-email-worker.timer`; the native Mac profile uses
`com.nodezuno.email-worker` with the same interval. On AWS, email and payment
passes share one exclusive background-work lock. The native runner has its own
email kernel lock held through an inherited descriptor by the actual worker
process. The empty `email-worker.kernel.lock` file is retained; macOS releases
the lock when the last holder exits, including after a forced stop or reboot.
Never unlink a kernel lock file while jobs may run. Legacy ownerless lock
directories fail closed and need the one-time stopped-service recovery in
[LOCAL_MAC_DEPLOYMENT.md](LOCAL_MAC_DEPLOYMENT.md#worker-and-deployment-lock-recovery).
The database claim installs a separate two-minute lease so a
crashed process can be recovered safely.

```bash
# Source checkout with the reviewed runtime environment already exported
pnpm run outbox:process

# AWS schedule and unit invocation log
sudo systemctl status nodezuno-email-worker.timer
sudo systemctl list-timers nodezuno-email-worker.timer
sudo journalctl -u nodezuno-email-worker.service --since today

# Native Mac schedule and logs
bash deploy/local-mac/status.sh
bash deploy/local-mac/logs.sh --lines 200
```

On AWS, the aggregate pass event is also in the application CloudWatch log
group under stream `email-worker`.

The email and payment workers run on dedicated fixed Docker networks and cannot
reach EC2 instance metadata. Confirm the host credential boundary after a
Docker restart or host-bundle change:

```bash
sudo iptables --check DOCKER-USER --source 172.29.243.0/28 --destination 169.254.169.254/32 --jump ACCEPT
sudo iptables --check DOCKER-USER --destination 169.254.169.254/32 --jump DROP
```

The first rule is reserved for the web process that signs bounded S3
deliverable operations. The second rule blocks Caddy, both workers, and every
other container. A missing rule is a failed security control, not a warning.

Retries use exponential delay with deterministic jitter, provider
`Retry-After` when larger, eight attempts, and a 20-hour horizon. This keeps
all automated retry scheduling inside 24 hours. Permanent payload/entity
errors and exhausted retry work become terminal `failed` rows. `accepted`
means Zoho's SMTP server accepted the message. No provider callback is
available, so the application does not claim inbox delivery or record bounces,
complaints, or suppressions.

For manual reconciliation:

1. Identify the delivery by internal delivery ID and safe state metadata. Do
   not copy recipient, message body, capability link, newsletter token, or raw
   outbox payload into logs or tickets.
2. Use Zoho Mail and account controls to investigate a missing message. Do not
   expose message content or credentials in logs or tickets.
3. There is no provider callback to replay. If SMTP acceptance was uncertain,
   do not trigger repeated sends blindly because SMTP has no idempotency
   guarantee.
4. For `failed`, resolve sender, recipient, mailbox quota, payload, or entity
   state first. There is no automatic requeue and no administrative requeue
   API. Do not edit sealed columns or change the row back to `pending`.
5. If a new message is legally and operationally appropriate, create a new
   versioned business event through peer-reviewed code or a controlled data
   repair, with a new delivery identity. Record approval and outcome.

An internally delivered `newsletter.unsubscribe.requested` row calls no
provider. It acknowledges that the durable subscription is already suppressed.
Newsletter confirmation remains POST-only double opt-in; neither worker
acceptance nor a link-scanner GET subscribes the address.

### Stablecoin payment worker and reconciliation

`scripts/process-stablecoin-payments.mjs --once` refreshes the verifier
heartbeat, selects at most 25 due claims, processes at most three concurrently
within a 120-second pass budget, leases each claim, writes only aggregate
results, and exits. AWS
schedules it every minute with `nodezuno-payment-worker.timer`; the native Mac
profile uses `com.nodezuno.payment-worker` at the same interval. The host
wrapper shares the background-work lock with email jobs, while the
database lease safely recovers an interrupted claim. On the Mac, the actual
payment worker retains its `payment-worker.kernel.lock` descriptor until it
exits. Apply the same legacy-path recovery and persistent-file rules described
for the notification worker above.

```bash
# Validate every dedicated payment endpoint before enabling settlement
pnpm run payments:preflight

# Run one bounded verification pass
pnpm run payments:process

# AWS schedule and invocation log
sudo systemctl status nodezuno-payment-worker.timer
sudo systemctl list-timers nodezuno-payment-worker.timer
sudo journalctl -u nodezuno-payment-worker.service --since today

# Native Mac schedule and aggregate logs
bash deploy/local-mac/status.sh
bash deploy/local-mac/logs.sh --lines 200
```

The pass log may contain only service name plus selected, processed, verified,
confirming, rejected, manual-review, failed, deferred, and verifier-healthy
values. It must not contain RPC URLs or headers, Telegram usernames,
transaction hashes, wallet addresses, raw receipts, or buyer capability values.

Verification is intentionally fail closed:

1. Every configured endpoint must identify Ethereum mainnet.
2. Every provider must have a distinct provider identity and normalized host.
3. Every usable observation must agree on the normalized receipt and transfer
   evidence.
4. The receipt must succeed and contain exactly one canonical selected-token
   `Transfer` to the fixed recipient for the exact atomic instruction amount.
5. The receipt block must be readable, the instruction-pinned confirmation
   minimum must be met, and finalized-block progress must include it.
6. Claim, intent, order state, event, and lifecycle-notification intent change
   together.

For a seller-received case, use this production procedure:

1. Tell the buyer not to send another payment. Contact the buyer through the
   stored Telegram username only when operationally necessary, and do not copy
   the username into logs or tickets.
2. Open the restricted order in `/admin`. Confirm the order reference, phase,
   claim ID, transaction hash, case type, current case state, expected facts,
   observed facts, pinned confirmation threshold, `rpcAgreementCount`, and
   evidence hash. Do not copy wallet or transaction details into a public
   incident system.
3. Use a trusted Ethereum node or explorer only as supporting observation. It
   is not the application authority. If stored evidence looks inconsistent,
   stop and escalate instead of choosing the favorable source.
4. Confirm the case reports `canApplyToObligation: true`. Eligibility requires
   complete finalized evidence, at least two agreeing providers, the configured
   seller recipient, official Ethereum USDC or USDT, and the exact narrow
   amount rule for that case. Arbitrary amounts and ambiguous receipts are
   blocked.
5. Reauthenticate if needed so the administrator session is fresh. Submit only
   `POST /api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}`
   from the exact production origin with a new durable `Idempotency-Key` and:

   ```json
   {
     "action": "apply_to_obligation",
     "note": "Reviewed finalized evidence and approved application to the due obligation."
   }
   ```

   The note must be meaningful and contain 12 through 4,000 characters. Store
   the idempotency identity in the restricted operation record, not in public
   logs.
6. A `201` result is the first successful decision. A `200` result with
   `replayed: true` is the exact recorded replay. Confirm that the order moved
   to `deposit_paid` or `paid`, the intent is verified, the case is resolved,
   one immutable confirmation exists, and the order event, administrator audit,
   and buyer lifecycle outbox intent all exist. Any partial state is an
   integrity incident.
7. In the authorized buyer portal, verify that the confirmation appears and
   that `GET /api/v1/review-orders/{id}/payment-confirmations/{confirmationId}`
   downloads private no-store JSON for the exact order. Confirm its receipt
   reference and record hash. It is not a tax invoice or custody receipt.
8. On any `409`, reload the case and stop. Do not change the note to bypass an
   ineligible result, edit paid state in SQLite, reuse the transaction hash,
   or ask the buyer to pay again.

Refunds and outgoing transfers require a separate externally controlled wallet
process. This application cannot sign them. An ambiguous receipt remains
unapplied until a separately approved workflow can establish the financial
outcome safely.

### Secure review deliverables, Cloudflare profile

Use `/admin` to prepare and finalize one of `final_report`,
`evidence_archive`, or `manifest`. Do not put customer files in D1, public
storage, tickets, or chat.

1. The browser hashes the complete file and asks the admin API to seal kind,
   filename, type, byte length, and digest.
2. The API returns a same-origin authenticated `PUT` route and required
   integrity headers. Upload streams directly from the browser through the
   Worker to private R2, with a 90 MiB per-file limit.
3. Finalization verifies the R2 object size, type, SHA-256, sealed metadata,
   ETag, and version before marking it available.
4. Completion requires an available final report and manifest. Buyer downloads
   stream through the authorized Worker route after exact-order and integrity
   checks. No R2 object URL is exposed publicly.

The R2 bucket must remain private. Cloudflare manages encryption at rest in
this configuration. R2 data recovery is separate from D1 backup/export.

### Secure review deliverables, alternate AWS profile

Use `/admin` to prepare and finalize one of `final_report`,
`evidence_archive`, or `manifest`. Do not put customer files in the application
database, host volume, backup directory, public bucket, ticket, or chat.

1. Compute the complete file's SHA-256 locally in the administrator browser.
2. Submit the sealed kind, safe filename, allowlisted type, byte length, and
   digest. The returned presigned S3 POST expires after ten minutes.
3. Upload the exact file and every signed form field directly to S3.
4. Finalize through the administrator API. The server must verify byte length,
   type, SHA-256, exact KMS key, order and deliverable metadata, ETag, and S3
   version ID before state becomes `available`.
5. Compare the listed checksum with the approved final artifact. Verify the
   administrator audit and CloudTrail object write event.
6. Complete only after an available final report and manifest exist. Completion
   releases all available files and queues the buyer lifecycle message.
7. Test the buyer link. It must authorize the exact order and redirect to a
   five-minute S3 URL pinned to the recorded version ID. Do not share that URL.

An incomplete upload remains `upload_pending`. A record at least 30 minutes old
can be revoked when a replacement of the same kind is prepared. S3 expires the
current visibility of an object still tagged temporary after one day. Because
versioning is enabled, the underlying noncurrent version follows the 730-day
lifecycle. A verified object is retagged retained, and the application role has
no delete permission. Legal retention may require a longer policy before a
customer engagement begins.

### Container database operation

Set `NODEZUNO_DATABASE_DRIVER` explicitly in production. `d1-rest` requires the
three restricted Cloudflare values and supports replaceable stateless web
instances. `sqlite` requires `NODEZUNO_SQLITE_PATH` on a durable local volume
and exactly one web process.

For SQLite, monitor volume utilization, inode availability, database and WAL
growth, write latency, busy or locked errors, backup age, backup verification,
and restore-rehearsal age. Do not expose the absolute database path in public
health output. The application opens WAL mode and waits at most five seconds
for a database lock. Persistent busy errors are an operational incident, not a
reason to add a replica or bypass the transaction.

See [capacity and configuration](operations/CAPACITY_AND_CONFIGURATION.md)
for the current metric coverage, worker scheduling budget, and the evidence
record required before changing the database topology. Database size, WAL size,
and data inode metrics are collected by the AWS host bundle; write latency and
busy-error aggregation are still separate instrumentation work.

Run `pnpm run db:migrate:container` exactly once for the selected driver.
The migration runner verifies checksums, required schema, seeds, and SQLite
`quick_check`. Render's persistent disk is unavailable to pre-deploy jobs, so
the committed single-instance Render command runs preflight and migration
after mount and before starting the server. A failure must keep the service
down. Other providers should prefer a one-off migration job with the web
process stopped.

### Developer console

`/console` requires a Nodezuno application session or retained trusted fallback
but does not require a sales or administrator action. A user can:

- create the workspace they own;
- create up to 10 active one-year keys;
- use the guided RPC path to create only a missing workspace, selected-network
  service, or service-bound key and safely resume after a partial attempt;
- copy each raw key from its one-time disclosure;
- inspect key prefix, suffix, scope, service binding, issue, use, expiry, and
  revocation state;
- create, read, optimistically rename, and archive durable service records;
- rotate an active key atomically while preserving its exact one scope and
  service binding;
- create an unbound `services:manage` key for programmatic service lifecycle,
  usage, and policy access;
- read the redacted workspace audit timeline and manage permitted workspace
  members;
- use retained internal developer-control-plane functions only when an
  operator explicitly enables a nonpublic compatibility environment; and
- revoke keys when their role is `owner` or `admin`.

For a production release check, use a purpose-labeled unbound
`platform:identity` key. Store it only in a temporary approved secret location, call
`GET /api/v1/platform/whoami`, revoke it, confirm the same key receives `401`,
and remove the temporary copy. Never put the key in a shell command that will
be retained in shared history, a ticket, a screenshot, or a log.

For a container cutover, inject the reviewed environment and run
`pnpm run preflight:control-plane` before deployment. It outputs only runtime
and named booleans and fails unless container mode, public origin, independent
secrets, account delivery, administrator allowlist, the selected database
settings, selected ingress boundary, rate-limit secret, and API-key pepper are
coherent. `ingressBoundary` represents either exact-origin `direct` admission
with a blank origin secret or valid `trusted-gateway` secret admission.
`accessIdentity` reports the coherence of the optional Access pair and does
not make Access mandatory for customer self-service. Preflight validates
configuration only. It does not open the database or replace external health,
identity, or network checks.

Separately issue an unbound `services:manage` key and run the repository CLI or
equivalent HTTP sequence to list, create, read, rename with the exact
`updatedAt`, read usage, read and update policy by revision, and archive a
disposable service. Confirm a stale rename returns
`service_update_conflict`, changed-body idempotency reuse returns
`idempotency_key_reused`, a revoked management key returns `401`, and the key
cannot call `platform/whoami` or an RPC service.

For the RPC release check, first run `pnpm run preflight:nodes` with secret
injection in an approved operator environment. It must report at least one
verified upstream for Ethereum, Base, and Solana without printing URLs or
headers. Then create a disposable service and key for each released network.
Confirm Ethereum `eth_chainId` is `0x1`, Base `eth_chainId` is `0x2105`, and
Solana `getHealth` is `ok` through
`POST /api/v1/rpc/{serviceId}`. Verify quota headers, revoke the key, and
confirm the next call receives `401`. Also verify `-32700` for empty or
malformed JSON, `-32600` for structurally invalid requests and empty batches,
ordered valid and invalid members in mixed batches, `-32602` for EVM bounded
parameter failures, and separate weighted quota units versus actual call
counts. Bind the key to the disposable service and confirm another service
returns HTTP `403` with JSON-RPC code `-32003`. This is a release probe, not a
continuous chain-health statement.

### Administrator console

`/admin` accepts a verified Better Auth application account with a real
contact email, or an optional trusted Sites/Cloudflare Access identity. Either
path then requires exact membership in `NODEZUNO_ADMIN_EMAILS`. A wallet-only
account whose email is a reserved synthetic `.invalid` value cannot
administer. Use the console to:

- move submissions between `received`, `reviewing`, `closed`, and `spam`;
- issue and advance guarded Upgrade Assurance proposals, with transactional
  buyer lifecycle notifications;
- inspect payment instructions, claims, immutable confirmation receipts, and
  reconciliation eligibility without creating a manual paid-state shortcut;
- apply an eligible seller-received case only through the fresh-session,
  same-origin, idempotent reconciliation action with a recorded decision note;
- prepare and finalize checksum-sealed private deliverables and complete an order
  only after an available final report and manifest exist;
- publish status-service state changes;
- change a chain publication stage, subject to verified capabilities;
- inspect redacted node-attachment readiness and current process-local Pulse
  observations; and
- run audited retention maintenance.

Pulse identifies configured RPC providers only by slot and primary status. It
shows circuit state, latency EWMA, consecutive failures, successful
observations, remaining cooldown, and last observation time. It never exposes
provider names, URLs, headers, credentials, or internal cache keys. Treat it
as one process's current routing memory. A restart can reset it, and it is not
historical uptime, a fleet aggregate, or an SLA measurement.

Every mutation is enforced again by the server API and writes an
`admin_audit_events` record. Never rely on hiding the page as an authorization
control. Never send client-supplied `oai-authenticated-*` headers to simulate an
administrator in production; the trusted dispatch layer must own and sanitize
those headers.

### Retention maintenance

The current implemented lifecycle is:

| Data | Implemented lifecycle |
| --- | --- |
| Submissions | Expire 730 days after acceptance; expired rows are excluded from account and admin reads |
| Submission events | Deleted by foreign-key cascade when their submission is deleted |
| Submission notification outbox | Deleted before the related expired submission is deleted |
| Rate-limit windows | Carry an expiry and are removed opportunistically or by maintenance |
| Newsletter subscriptions | No automatic expiry; unsubscribing changes state but retains the record |
| Newsletter outbox | No automatic expiry |
| Review orders, events, payment records, and verifier heartbeat | No automatic expiry |
| Stablecoin reconciliation cases and payment confirmations | Immutable financial evidence; no update or delete path after guarded creation and resolution |
| Review deliverable metadata | No automatic expiry; state and sealed identity remain in D1 for Cloudflare or SQLite in the alternate container profile |
| Private R2 deliverable objects | No automatic R2 lifecycle cleanup is configured by this repository; configure retention and cleanup only after confirming customer/legal retention requirements |
| Alternate AWS S3 deliverable objects | Abandoned temporary objects expire after one day; noncurrent versions expire after 730 days; retained current versions have no automatic expiry |
| Status, incidents, chains | Retained until deliberately changed or removed |
| Administrator audit events | No automatic expiry |
| Developer workspaces and members | No automatic expiry or self-service deletion |
| Developer API keys | Authentication expires after 365 days; metadata is retained |
| Developer audit events | No automatic expiry or application read/delete path |
| Auth sessions | Seven-day logical expiry |
| Auth users, provider accounts, and wallet links | No self-service erasure workflow |
| Developer services | Archived records are retained; no automatic deletion |
| RPC key/service usage buckets | Hourly aggregates expire after 35 days; opportunistic cleanup |
| RPC workspace quota buckets | Hourly counters expire after 35 days; opportunistic cleanup |

Accepted submission writes clean expired submissions and rate-limit windows.
An authorized administrator can also choose **Remove expired records** in
`/admin`; the operation records counts in the audit trail.

Run retention maintenance at least monthly and after any prolonged write
outage. Record the completion time and returned counts in the operations log.
Unexpectedly high counts require investigation before repeating the action.

Newsletter, newsletter-outbox, developer-control-plane, and audit retention
require an approved legal policy and an implemented cleanup path before general
availability. The existing maintenance endpoint does not delete them. A
data-subject erasure request therefore requires an access-controlled,
peer-reviewed database change; there is no public or administrator erasure
endpoint in this release.

## Incident response

### Severity guide

| Severity | Website examples | First response |
| --- | --- | --- |
| SEV-1 | Confirmed exposure or destructive corruption of personal data; unauthorized administrator action; false payment verification or transaction reuse | Disable new settlement and affected access immediately, preserve evidence, engage security reviewer and incident commander |
| SEV-2 | Website broadly unavailable; selected database unreadable; submissions cannot be stored; authentication boundary failure; payment worker unavailable with unresolved claims | Freeze changes, identify last known-good version, restore safe service or roll back without discarding claims |
| SEV-3 | One route or form broken; elevated errors with a working safe fallback; incorrect prelaunch catalog content | Assign owner, mitigate, and correct within the normal incident window |
| SEV-4 | Cosmetic defect or documentation error with no misleading availability or security impact | Track and fix in a normal release |

No response-time or recovery-time commitment is encoded in this repository.
Approve internal RTO/RPO targets before general availability, and do not
publish numerical claims until they are measured and contractually reviewed.

### First 15 minutes

1. Name an incident commander and start an append-only timeline.
2. Record the deployment URL, saved version, source commit, first observed
   timestamp, reporter, affected paths, and representative request IDs.
3. Query `/api/v1/health` and inspect `database` and `configuration`
   independently.
4. Check the Sites deployment state and Worker logs. Do not log or paste form
   payloads, email addresses, unsubscribe tokens, or secrets into the incident
   channel.
5. Stop unrelated deployments and administrator mutations.
6. Determine whether impact is limited to the website, stablecoin payment
   verifier, customer JSON-RPC gateway, or a named upstream. Do not generalize
   it to another product plane.
7. Prefer a saved-version or image rollback for a code regression. Do not
   reverse an additive database migration or restore data merely to roll back
   code.

### Diagnosis matrix

| Signal | Likely class | Safe action |
| --- | --- | --- |
| `configuration: false` | Missing, placeholder, weak, reused, or whitespace-tainted secret; origin mismatch; invalid ingress mode or mode/secret pairing; invalid administrator or optional Access value; or incomplete Google/Zoho email pair | Restore a coherent reviewed configuration, redeploy if required, then re-run health; never add a production fallback |
| `database: false` | Missing binding or volume, invalid driver settings, unapplied migration, unavailable D1, locked or unreadable SQLite, or incomplete seed data | Verify the selected driver, migration ledger, D1 availability or SQLite mount and ownership, then avoid writes until schema and recovery point are understood |
| HTML fails but API health is healthy | Worker render or asset regression | Compare with the previous saved version and roll back code |
| Forms return `403` | Origin or browser challenge failure | Check the actual origin, proxy behavior, clock, and client challenge flow; do not disable the guard |
| Forms return `429` | Expected limit, attack, or client retry loop | Inspect aggregate request IDs and scope; fix the retry loop or apply edge mitigation without clearing all limits |
| Admin returns `401` | No verified application session or optional trusted hosting identity | Verify the Better Auth session first, then any configured Sites/Access overlay |
| Admin returns `403` | Identity has no real contact email or is not in the allowlist | Reject wallet-only synthetic email; verify the normalized real email and approved `NODEZUNO_ADMIN_EMAILS`; do not broaden the list during an incident without authorization |
| Signup or login returns `503` | Better Auth secret, exact origin, or schema is unavailable | Verify secret inventory, `BETTER_AUTH_URL`, and auth migrations |
| Console or developer API returns `401` | Application session and trusted fallback are absent or invalid | Verify the Better Auth session first, then the retained Sites or Access path; never accept a client-asserted identity header |
| Key create returns `503 api_key_security_unavailable` | `API_KEY_PEPPER` is missing or too short | Restore the approved secret; do not issue keys until health is green |
| Key create returns `422 api_key_service_invalid` | Requested binding is missing, archived, or belongs to another workspace | Refresh services and bind only to a non-archived service in the active workspace |
| `platform/whoami` returns `401` | Key malformed, expired, revoked, mismatched, or bound to an inactive workspace | Verify only safe metadata, issue a replacement if authorized, and never request the raw key through support |
| RPC service remains `configuration_saved` | Upstream secret is empty or invalid, provider is unreachable, Ethereum is not `0x1`, Base is not `0x2105`, Solana genesis or health is wrong, or the release does not support the network | Validate the secret shape without printing it, run the appropriate redacted chain probe, and do not force an active status |
| `grpc-ethereum` status is `degraded` | Native gRPC configuration exists but the bounded serving-health verification failed | Check the public endpoint, private authorization path, mainnet `0x1` proof, read-only upstream set, and HTTP/2/TLS path without logging credentials |
| RPC returns `403 api_key_scope_denied` | Key lacks `rpc:invoke` | Issue a correctly scoped replacement through the console; do not broaden authorization in the route |
| RPC returns `403 api_key_service_denied` | Key is bound to another service | Issue a least-privilege key bound to the intended service; do not create an unbound product key |
| RPC returns `429 rpc_quota_exceeded` | Key/service or workspace hourly units are exhausted | Honor `Retry-After`; inspect aggregate counters and client batching; do not edit database counters manually |
| RPC returns `502` or `504` | Ordered upstreams failed or timed out | Check provider status and redacted failure metrics; remove an unhealthy upstream or change order through a reviewed secret update |
| Health says RPC is not configured while website is healthy | Optional upstream JSON is absent or invalid | Keep RPC services configuration-only, validate the secret offline, and deploy a corrected value |
| Newsletter remains `pending` | Confirmation not delivered, link expired/replaced, or recipient has not submitted it | Check worker state without exposing the token; resend only through a new subscription attempt after expiry; never mark the address subscribed manually |
| Outbox `pending` grows | Worker disabled, timer stopped, database locked, SMTP retry, or configuration invalid | Check the timer and aggregate worker event; validate the Zoho SMTP host and app password without printing them; preserve queued rows |
| Outbox `processing` has an expired lease | Worker crashed or exceeded its lease | Let the next exclusive pass reclaim it; do not change lease fields by hand |
| Outbox stays `accepted` | Zoho accepted the message through SMTP; inbox delivery cannot be observed by the app | Confirm receipt directly in the Zoho mailbox; do not claim delivery from the database state alone |
| Outbox is `failed` | Permanent validation/provider outcome or retry budget exhausted | Follow manual reconciliation; do not edit the sealed delivery or flip it to pending |
| Payment intent returns `503 stablecoin_payments_unavailable` | Payment mode is disabled or the order is outside the fixed-price catalog | Check the configured mode and order target. Do not enable automatic verification to bypass a manual-payment issue |
| Payment intent returns `503 payment_verifier_unhealthy` | Heartbeat is missing, unhealthy, older than 150 seconds, or tied to an earlier provider configuration | Do not create an instruction; restore every configured provider, run one worker pass, confirm status and CloudWatch metrics, then retry with the same idempotency key |
| Claim remains `confirming` with `transaction_not_found` | Transaction is pending, hash is wrong, or every endpoint has not observed it | Confirm the buyer submitted the intended hash through the portal, allow bounded retries, and never mark it paid from a screenshot |
| Claim remains `confirming` with `rpc_unavailable` | One or more dedicated endpoints timed out or returned unusable evidence | Preserve the claim, restore every configured endpoint, run preflight, and do not reduce verification to a failing provider during the incident |
| Claim is `manual_review` with `rpc_disagreement` | Configured endpoints disagree on normalized chain evidence | Disable new payment instructions if systemic, preserve all evidence, investigate chain view and provider integrity, and never choose the most favorable response |
| Claim is `rejected` | Receipt failed or canonical token, recipient, amount, or timing did not match | Review the safe failure code, contact the buyer through the restricted Telegram field if needed, and never mutate rejected evidence into payment |
| Claim is `manual_review` with `commercial_state_conflict` | Valid chain evidence arrived after order state changed unexpectedly | Freeze order mutations, reconcile the chain evidence and order event timeline, and use a tested incident-remediation release if required; never flip payment state with an ad hoc database edit |
| Claim is `manual_review` with seller-received evidence | Seller received the wrong amount, other allowed asset, ambiguous candidate, or late transfer | Tell the buyer not to send again, preserve the observed evidence, inspect the immutable case, and use only the guarded reconciliation route when its eligibility result permits application |
| Reconciliation returns `409 payment_reconciliation_not_applicable` | Evidence is ambiguous, incomplete, arbitrary in amount, wrong in recipient or token, or lacks pinned finality and two-provider agreement | Stop; do not alter evidence or force paid state. Reconcile the external treasury and contractual outcome under an approved exceptional process |
| Reconciliation returns another `409` | Case is closed, idempotency details changed, or order, instruction, or case state raced | Reload the restricted order, retain the original decision key and body, and escalate incomplete or conflicting state as an integrity incident |
| Buyer confirmation returns `404` | Confirmation does not exist for the exact authorized order, or authorization is for another order | Reopen the authorized order projection, use only its listed confirmation ID, and do not expose another order or substitute a manually created receipt |
| Payment worker timer stopped | Scheduler, host lock, runtime environment, database, or endpoint failure | Keep claims pending, restore the timer, run one preflight and bounded pass, then verify aggregate counts without exposing claim data |
| Cloudflare deliverable preparation returns `503` | Private R2 binding is missing or storage operation failed | Keep completion closed; check the Worker `DELIVERABLES` binding and R2 service state without exposing object keys |
| Cloudflare deliverable finalization reports evidence mismatch | Uploaded size, type, checksum, metadata, ETag, or object version differs from the seal | Do not release the object; preserve the D1 audit event, revoke the stale pending row through the supported replacement path, and upload the exact approved file again |
| Cloudflare buyer deliverable download returns `404` or `503` | File is unreleased, authorization is for another order, or the R2 object no longer matches its verified identity | Do not expose a direct bucket key; confirm order authorization, release state, object version, and R2 health |
| Alternate AWS deliverable operation returns `503` | Bucket, region, KMS key, IAM, or presigning configuration is invalid | Keep completion closed; compare Terraform outputs and host bundle injection without printing secrets, then verify least-privilege S3 and KMS access |

### Containment and recovery

- For a code regression, deploy the previous saved Sites version and run all
  read-only production checks.
- For a compromised `RATE_LIMIT_SECRET`, rotate it in Sites and do not restore
  the old value. Rotation invalidates outstanding two-minute browser
  challenges and changes HMAC fingerprints; a temporary reset of effective
  per-subject rate-limit history is expected.
- For a compromised `REVIEW_CAPABILITY_SECRET`, first bind affected buyers to
  verified accounts or issue replacement private links through a reviewed
  migration. Rotation immediately invalidates every capability-only review
  link, so preserve the incident record and notify affected buyers.
- For one compromised API key, revoke it through `/console`, verify
  `platform/whoami` returns `401`, and replace it only where needed.
- For a compromised RPC provider credential, remove or rotate the affected
  upstream in `NODEZUNO_RPC_UPSTREAMS_JSON`, redeploy through the secret-managed
  path, and verify a read-only call. Never paste the prior JSON into an incident
  channel.
- For a compromised payment RPC credential or endpoint, disable
  `NODEZUNO_STABLECOIN_PAYMENT_MODE`, rotate or replace the affected entry in
  `NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON`, run the full payment preflight on all
  endpoints, inspect unresolved claims, then re-enable. Never delete claims or
  weaken agreement and finality requirements to restore availability.
- For a wrong-chain result or unapproved DNS destination, remove the upstream,
  block egress, preserve redacted evidence, verify DNS and certificate
  ownership, rotate the provider credential, and require the complete
  attachment gate before restoration.
- For runaway RPC traffic or spend, revoke affected keys, lower external
  provider caps or remove upstream access, preserve aggregate usage, and avoid
  deleting quota rows as containment.
- For a compromised `API_KEY_PEPPER` or combined database-and-pepper exposure, rotate
  the pepper, treat every issued key as invalid, require replacement, and
  monitor for failed use. Pepper rotation is intentionally a global key
  invalidation.
- For a compromised administrator, remove the address from
  `NODEZUNO_ADMIN_EMAILS`, review `admin_audit_events`, preserve relevant
  logs, and rotate any affected identity sessions through the provider.
- For suspected data corruption, stop mutations, create or preserve a recovery
  point, compare counts and audit events, and restore only after the data
  steward approves the exact recovery boundary.
- Never restore production from an unverified export. Never test a restore
  against the production binding.

### Closure

An incident closes only after:

- the affected surface is healthy and verified from outside the deployment;
- data integrity and authorization are checked;
- any misleading public status or chain statement is corrected;
- the final timeline, impact, root cause, and evidence links are recorded;
- corrective actions have owners and due dates; and
- temporary access or logging is removed.

## Backup and restore

### What must be protected

- Git is the source backup for code, migrations, public assets, and content.
- Saved Sites versions are deployment rollback artifacts, not database
  backups.
- Application-database recovery must protect submissions, consent state,
  outbox state, status changes, chain publication state, auth users and
  sessions, wallet links, workspace membership, API-key metadata and HMACs,
  service records, access policies, idempotency state, quota aggregates, and
  administrator/developer audits. It must also protect review orders,
  stablecoin instructions, transaction claims, Telegram contact data, and
  normalized verification evidence, payment reconciliation records,
  confirmation receipts, the verifier heartbeat, and secure-deliverable
  metadata.
- Blockchain node volumes, snapshots, gateway configuration, DNS, certificates,
  and provider credentials have a separate provider recovery plan. They are not
  part of the application database and must be rehearsed under
  [NODE_ATTACHMENT.md](NODE_ATTACHMENT.md).
- Secrets and environment configuration must be recoverable from an
  approved secret/configuration inventory. Never export secrets into Git or a
  plaintext database dump.
- The current Cloudflare profile uses a private R2 deliverables bucket. Protect
  that bucket separately from D1 and verify its object inventory and recovery
  process. R2 uses Cloudflare-managed encryption at rest, not an AWS KMS key.
  The retained AWS profile uses a separate S3/KMS recovery design. A D1 backup
  contains only sealed object metadata and cannot recreate a missing file.

This repository contains guarded SQLite create, verify, and restore primitives.
The AWS profile adds a six-hour scheduler, verified off-host Object-Locked S3
copy, daily EBS snapshots, backup-age alarm, and an operator-run restore
workflow. It does not provide automated restore, point-in-time SQLite recovery,
cross-driver replication, or a D1 backup job. Configure, test, monitor, and
assign ownership for the selected driver before general availability.

### D1 REST or Sites D1 recovery point

Before every schema migration or high-risk administrator operation:

1. Confirm the provider's current D1 recovery/export capability for this
   project and create a named recovery point or encrypted export.
2. Record its identifier, time, database, schema migration, source commit, and
   operator in the access-controlled release record.
3. Store any export in approved encrypted storage with access logging and a
   retention policy. The export contains personal data.
4. Verify that the artifact is readable and non-empty without exposing row
   contents.

If the current Sites plan cannot create a usable D1 recovery point, stop the
release. A saved website version cannot recover database state.

For a D1 REST container, retain the same encrypted export and restore evidence.
The application API token is not a backup credential inventory. Rotate it
independently and never place it inside the export.

### SQLite recovery point

SQLite runs in WAL mode. While the application is open, the main file,
`-wal`, and `-shm` sidecars can represent one live state. Copying only
`NODEZUNO_SQLITE_PATH`, copying a live volume, or deleting a sidecar is not a
valid backup procedure.

The repository includes a Node SQLite online-backup primitive:

```bash
pnpm run db:backup:sqlite -- create /absolute/backup/nodezuno-<time>.sqlite
pnpm run db:backup:sqlite -- verify /absolute/backup/nodezuno-<time>.sqlite
```

The destination must be a different absolute `.db`, `.sqlite`, or `.sqlite3`
path. It and its `.manifest.json` must not exist. Creation produces a mode
`0600` database and a SHA-256 manifest with format version, algorithm, hash,
byte size, creation time, and schema migration count. It verifies
`PRAGMA quick_check`, at least 13 migrations, at least six status seeds, and at
least eight chain seeds. Verification checks manifest format, file size,
digest, schema count, integrity, and seed counts before and after its read and
detects a file that changes during verification.

Run creation during a low-write period and alert on any failure. Move both
files to encrypted storage off the live volume and off the application host,
then verify that copy again. Record source commit, image digest, database
driver, creation time, output digest and size, storage owner, retention, and
operator without copying data. The command does not upload, encrypt, schedule,
retain, or monitor artifacts. Those operational controls remain release gates.

SQLite uses a 5-second busy timeout and `BEGIN IMMEDIATE` for batches. Run one
web process and only one migration or recovery operation at a time. A lock
timeout blocks the operation. Do not loop retries, start a second replica,
delete lock/WAL files, or copy a partially written artifact.

### Restore rehearsal

Run a driver-specific rehearsal at least quarterly, before relying on a new
backup mechanism, and before a high-risk migration.

For D1:

1. Create an isolated, disposable non-production D1 database.
2. Restore or import the selected recovery point. Never change the production
   `DB` binding for a rehearsal.
3. Bind a non-production deployment through the same direct or REST profile.

For SQLite:

1. Create a new isolated persistent volume owned by container UID `1001`.
2. Set `NODEZUNO_DATABASE_DRIVER=sqlite` and point
   `NODEZUNO_SQLITE_PATH` at an absent target on that volume.
3. Confirm the target plus `-wal`, `-shm`, and `-journal` sidecars are all
   absent.
4. With no web process running, execute:

   ```bash
   pnpm run db:restore:sqlite -- /absolute/backup/nodezuno-<time>.sqlite
   ```

5. Confirm the command re-verifies the backup and manifest, stages and checks
   a private copy, and publishes only to the absent target. It must refuse to
   overwrite any database or sidecar.
6. Start exactly one non-production process against that volume.

For both drivers:

1. Confirm migration filenames and checksums match the source commit.
2. Run database integrity and foreign-key checks.
3. Compare table counts and aggregate states with the separately recorded
   recovery-point validation evidence. For SQLite, also confirm the restored
   schema migration count matches the backup manifest.
4. Verify `/api/v1/health`, account isolation, administrator denial and
   allowlist behavior, status, chains, service-create replay, changed-body
   idempotency conflict, optimistic service rename conflict, workspace
   isolation, key creation/rotation/revocation, `services:manage` isolation,
   RPC policy revision, usage reads, and unsubscribe behavior.
5. Keep every outbox and payment-verification timer stopped while inspecting
   the restored queues. Reconcile all submitted, checking, confirming, and
   manual-review payment claims against the current canonical chain before
   starting exactly one payment worker schedule. A restore can move database
   time backward but cannot move Ethereum backward.
6. Decide
   which pending or expired-lease rows remain legally deliverable, reconcile
   accepted provider messages, then enable exactly one worker schedule. Never
   allow a restore rehearsal to send external messages.
7. For each released deliverable metadata row in the sample, verify the exact
   S3 version still exists, decrypts through the approved KMS path, matches the
   sealed size and SHA-256, and produces an authorized version-pinned download.
   Do not replace a missing object by changing its metadata.
8. Destroy the rehearsal deployment and database under the approved disposal
   process.
9. Record achieved recovery time, recovery point, discrepancies, and
   corrective actions.

A backup is not operationally valid until this rehearsal succeeds. Restore
production only for confirmed loss or corruption, with incident-commander and
data-steward approval, then re-run the release production gates.

## Known operational boundaries

- Transactional submission, review-application, buyer lifecycle,
  payment-state, and newsletter-confirmation delivery is implemented only for
  the single-host SQLite profile. D1 REST has no compatible outbox worker in
  this release. CRM synchronization is not implemented.
- Source checks do not prove a live Zoho SMTP connection, DNS sender
  authentication, or mailbox receipt. Verify those in the deployed account.
- Repository tests prove stablecoin state transitions and mocked RPC evidence,
  not production endpoint independence, Ethereum availability, finality, token
  liquidity, seller wallet access, or refund operations. Production preflight
  and one separately approved exact-value end-to-end rehearsal remain launch
  gates. The fixed payment must not be presented as a low-value probe.
- The self-service account, workspace, service-record, API-key lifecycle, and
  `platform:identity` probe are source-implemented control-plane capabilities.
- Retained RPC and gRPC code is not part of the current public product and must
  stay unconfigured in the Upgrade Assurance production environment.
- Source does not establish a live deployment. DNS, TLS, email, login, and
  public reachability must be verified in the actual AWS environment.
- No Nodezuno-owned node fleet, streaming, data, account-abstraction, signing,
  faucet, snapshot, or rollup product plane is deployed by this repository.
- The native Ethereum gRPC target is source-ready and not deployed. Its primary
  `control-plane` mode shares website workspace keys, service binding, scope,
  expiry, and revocation through the private decision route. Its
  `static-digest` mode is an explicit isolated fallback.
- The AWS profile includes SNS alarms, CloudWatch logs and metrics, a six-hour
  verified backup timer, Object Lock retention, and daily EBS snapshots.
  External uptime monitoring and human on-call ownership remain launch tasks.
- The AWS profile includes private versioned S3 deliverables, a dedicated KMS
  key, least-privilege IAM, checksum and object-version verification, and
  CloudTrail object data events. It does not provide a confidential customer
  source-input workspace or prove that the deployed policies work until the
  end-to-end release test passes.
- No production data-erasure endpoint exists.
- The AWS launch runbook defines a provisional six-hour RPO and a 30-to-60
  minute RTO, both subject to a successful restore drill. No availability SLA
  is approved.
- The launch profile remains one host, one Availability Zone, one web process,
  and one SQLite writer. It cannot scale horizontally or provide automatic
  failover. PostgreSQL and multiple stateless application tasks are prerequisites
  for that architecture.
- Developer workspace, key metadata, and developer audit retention and erasure
  are not automated.
- The active provider access policy must be reviewed at every release. Making
  any previously private environment public is an explicit security decision.

These boundaries are release inputs, not footnotes. Do not hide them in public
copy or operational reporting.
