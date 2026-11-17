# Container deployment

Nodezuno ships a standalone Next.js production container. The image runs as
unprivileged UID 1001, exposes port 3000 inside the deployment network, and
uses `/api/v1/live` for its Docker health check.

## Build

```bash
docker build --tag nodezuno:local .
```

The build uses the locked pnpm dependencies and `NODEZUNO_RUNTIME=container`.
The final image contains the standalone server, static assets, database
migrations, and operational scripts, but no development dependency tree.

## Supported first-production topology

Use exactly one application container with one durable SQLite volume. This is
appropriate for an early website and bounded review-intake workflow. It is not
a high-availability topology.

```text
HTTPS ingress
  |
  v
one Nodezuno container
  |
  v
one durable local SQLite volume
```

Do not run two application processes against the same SQLite file. Do not keep
the database only in the container's writable layer. A multi-replica service
requires a reviewed managed-database migration.

## Required environment

```dotenv
NODEZUNO_RUNTIME=container
NODEZUNO_DATABASE_DRIVER=sqlite
NODEZUNO_SQLITE_PATH=/var/lib/nodezuno/nodezuno.sqlite
NODEZUNO_INGRESS_MODE=direct
NODEZUNO_LOCAL_PREVIEW=false
PUBLIC_ORIGIN=https://nodezuno.com
BETTER_AUTH_URL=https://nodezuno.com
RATE_LIMIT_SECRET=<unique-random-secret>
API_KEY_PEPPER=<different-random-secret>
BETTER_AUTH_SECRET=<third-random-secret>
REVIEW_CAPABILITY_SECRET=<fourth-random-secret>
NODEZUNO_ADMIN_EMAILS=info@nodezuno.com
NODEZUNO_LEGAL_LAUNCH_APPROVED=false
NODEZUNO_PUBLIC_INDEXING=false
ZOHO_SMTP_HOST=smtp.zoho.in
ZOHO_SMTP_PASSWORD=<Zoho-app-password>
NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled
NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=
NODEZUNO_PAYMENT_CONFIRMATIONS=12
AWS_REGION=ap-south-1
NODEZUNO_DELIVERABLE_BUCKET=<private-versioned-deliverables-bucket>
NODEZUNO_DELIVERABLE_KMS_KEY_ARN=<dedicated-customer-managed-kms-key-arn>
```

Each core application secret must contain at least 32 characters and must not
be reused. Production stablecoin settlement requires an approved legal launch
gate, exact HTTPS origins, `ethereum_mainnet` mode, and two or three valid
dedicated Ethereum endpoints. Keep `NODEZUNO_LEGAL_LAUNCH_APPROVED=false` and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` until the gate is documented.
Configure Google only with both OAuth values. Keep unrelated blockchain
upstream variables empty for the Upgrade Assurance website.

Payment RPC URLs and headers are secrets even though they query public-chain
data. Public URLs must use HTTPS and may not contain credentials, queries, or
fragments. Private HTTP is allowed only on loopback, RFC 1918, or `.internal`
hosts. Ethereum Mainnet stablecoin verification is the only payment
implementation.

Production notification delivery uses the Zoho host and app password. To
disable the optional pipeline, leave both values blank. The sender and
operational recipient are fixed to `info@nodezuno.com`. Successful SMTP
acceptance is recorded, but the app has no provider callback and cannot prove
inbox delivery.

Secure deliverables are mandatory for a public container deployment. The
bucket must block public access, enable versioning, require TLS and SSE-KMS
with the exact configured key, and allow the application role only the minimum
object and KMS operations under its review prefix. The AWS profile provisions
these resources and injects their identifiers outside the application
SecureString.

## Start

Run migrations and operational preflights as bounded one-shot deployment jobs.
Do not run a live RPC preflight during every web-process restart. After the
one-shot payment worker has written a healthy verifier heartbeat, start the web
process with the control-plane configuration gate:

```bash
node scripts/migrate-container.mjs
node scripts/preflight-control-plane.mjs
node scripts/preflight-stablecoin-payments.mjs
node scripts/process-stablecoin-payments.mjs --once
node scripts/preflight-control-plane.mjs && exec node server.js
```

The AWS deployment performs these steps as separate one-shot Compose tasks
before admitting a new release. A migration or preflight failure prevents that
release without making a later provider outage restart an otherwise healthy
website.

## Notification worker

The supplied Compose files define `email-worker` in the `operations` profile.
It is a one-shot process, not another web replica. On the AWS host, run an
immediate controlled pass through its installed unit:

```bash
sudo systemctl start nodezuno-email-worker.service
sudo systemctl status nodezuno-email-worker.service
```

Run it from a scheduler every minute. The AWS release installs a systemd
one-shot service and timer with an exclusive host lock. Each pass reads the
same SQLite volume, processes at most 25 eligible rows, and exits. Do not run
this worker with D1 REST: its configuration check requires
`NODEZUNO_DATABASE_DRIVER=sqlite` and an absolute SQLite path.

Zoho SMTP success records `accepted`, not inbox delivery. There is no
provider callback. Monitor pending, processing with expired leases, accepted,
and failed outbox states, and verify receipt directly in the Zoho mailbox.

## Stablecoin payment worker

The Compose files also define `payment-worker` in the `operations` profile.
It is a bounded one-shot verifier and not a signing service or web replica.
Before enabling settlement, validate every endpoint from the secret-managed
runtime:

```bash
docker compose -f deploy/aws/compose.ec2.yaml \
  --env-file /opt/nodezuno/runtime.env \
  --profile operations run --rm --no-deps --entrypoint node payment-worker \
  scripts/preflight-stablecoin-payments.mjs
```

Then run or schedule the bounded processor every minute:

```bash
sudo systemctl start nodezuno-payment-worker.service
sudo systemctl status nodezuno-payment-worker.service
```

Each pass refreshes the persisted verifier heartbeat, selects at most 25 due
claims, processes at most three concurrently within a 120-second budget, and
exits. A healthy heartbeat requires every configured provider to report chain
ID 1, a fresh latest block, a valid finalized block, and an acceptable
chain-head spread. It is bound to the active provider and endpoint
configuration and expires for instruction-creation purposes after 150 seconds.
Claim verification requires the instruction-pinned confirmation minimum and
finalized-block progress. Pending, timeout, malformed, disagreeing, or
uncertain evidence fails closed. Logs may contain aggregate state counts only.
They must not contain RPC URLs or headers, Telegram usernames, transaction
hashes, addresses, or receipts.

Seller-received manual-review cases are resolved only through the web
container's guarded administrator route. It requires exact same origin, a
fresh allowlisted session, an `Idempotency-Key`, exact
`apply_to_obligation` action, and a 12 to 4,000 character decision note. The
stored evidence must show official Ethereum USDC or USDT received by the
seller, finality, at least two agreeing providers, and the narrow exact amount
rule. Arbitrary amounts and ambiguous receipts cannot be applied. The database
transaction advances the order and records one immutable confirmation, case
resolution, audit, event, and lifecycle notification together. Do not create a
second operator container or run SQL to bypass this route. An authorized buyer
confirmation download is private no-store JSON and is not a tax invoice or
custody receipt.

## Secure deliverables

The web container issues a ten-minute presigned POST only to an allowlisted
administrator after sealing the deliverable kind, filename, content type, byte
length, and SHA-256 digest in SQLite. Accepted types are PDF, ZIP, JSON, and
plain text, with a 100 MiB limit per file. After upload, the server must verify
the checksum, size, metadata, exact KMS key, ETag, and S3 version ID before the
file becomes available.

A review cannot become `completed` until an available final report and
manifest exist. Completion releases all available deliverables and queues the
buyer lifecycle email. An authorized buyer download is a no-store redirect to
a five-minute presigned GET pinned to the verified S3 object version. The S3
bucket is not public, and the application must not return its object key or
storage version in the public order projection.

## Health and readiness

- `/api/v1/live` proves that the web process can answer.
- `/api/v1/ready` verifies production configuration and required dependencies.
- `/api/v1/status` reports current website and intake readiness without
  claiming historical uptime. Its Ethereum payment component is operational
  only while the persisted independent-provider verifier heartbeat is fresh.

After launch:

```bash
curl --fail https://nodezuno.com/api/v1/live
curl --fail https://nodezuno.com/api/v1/ready
curl --fail https://nodezuno.com/api/v1/status
```

Do not enable public indexing until the intake, receipt, administrator login,
email verification, password recovery, privacy, terms, responsible disclosure,
mobile layout, health, backup, and restore paths have been checked in the
deployed environment.

## Backups

Use the included online SQLite backup operation instead of copying a live file.
The AWS profile runs it in a separate one-shot container with the live data
mounted read-only:

```bash
docker compose -f deploy/aws/compose.ec2.yaml \
  --env-file /opt/nodezuno/runtime.env \
  run --rm --no-deps backup create \
  /var/backups/nodezuno/nodezuno.sqlite
docker compose -f deploy/aws/compose.ec2.yaml \
  --env-file /opt/nodezuno/runtime.env \
  run --rm --no-deps backup verify \
  /var/backups/nodezuno/nodezuno.sqlite
```

Copy both the backup and its manifest to encrypted off-instance storage. Test
a restore on an isolated host. WAL, snapshot, or filesystem copies alone do
not replace an application-consistent verified backup.

## Cloud choices

- AWS: use [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) and the supplied Caddy
  Compose profile.
- A low-cost virtual machine: use the same single-instance container pattern,
  persistent disk, HTTPS proxy, off-host backups, and secret store.
- Managed containers: use only when the provider offers a persistent local
  volume attached to exactly one instance, or after migrating to a supported
  managed database.

Never claim an SLA, multi-region availability, disaster-recovery time, or data
residency until the actual deployment implements and measures it.
