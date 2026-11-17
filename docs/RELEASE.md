# Nodezuno.com release procedure

This procedure produces a traceable Nodezuno.com website release from one exact
source commit, applies reviewed migrations to the selected durable database,
and verifies a Cloudflare Worker deployment without inventing product-plane
availability. The AWS container procedure is retained as an alternate profile.

The active release covers the public Upgrade Assurance website,
direct fixed-scope review orders, versioned service orders, protected buyer
tracking, a fixed USD 7,500 engagement split into two USD 3,750 phases,
buyer lifecycle email, secure private deliverables,
Better Auth accounts and sessions, wallet identities, request history, and
restricted administration. Retained developer,
RPC, and gRPC code remains nonpublic and unconfigured. This procedure does not release a
Nodezuno-owned node fleet, transaction system, signer, indexer, wallet,
custody system, or contract deployment service.

The current low-cost release path is Cloudflare Workers with D1 and private R2.
Follow [CLOUDFLARE_FREE_TIER.md](CLOUDFLARE_FREE_TIER.md) for the Worker build,
separate D1 migration, bindings, secrets, and deployment steps. The AWS release
path in [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) is an alternate legacy profile.
The Cloudflare configuration enables manual Ethereum payment intake. Automatic
verification remains off; customer-submitted transaction details require an
operator check before the service order advances.

## Release principles

1. Build and review the exact source that will be pushed and packaged.
2. Treat database migrations as forward-compatible, additive changes.
3. Create and validate a data recovery point before migration.
4. Store production secrets only in the selected provider secret manager.
5. Deploy a saved Sites version or immutable container image, then verify it
   from outside the build environment.
6. Keep every undeployed product capability labeled `planned`, `preview`, or
   otherwise prelaunch.
7. Roll back code with a saved version; do not casually reverse or overwrite
   database state.
8. Keep public search indexing disabled until DNS, access, content, legal,
   security, and production verification gates all pass.

For a Cloudflare release, the D1 and R2 names and bindings are recorded in
`.openai/hosting.json`; the D1 ID is also in `wrangler.jsonc`. Verify both
before a remote migration or deploy. A container release instead records its
image digest, database driver, volume or D1 identity, and provider deployment
identifier.

## Current external boundaries

These are release facts, not optional caveats:

- Source does not prove that a public production deployment exists. DNS, TLS,
  provider state, and external health must be verified for every release.
- `RATE_LIMIT_SECRET`, `API_KEY_PEPPER`, `BETTER_AUTH_SECRET`, and
  `REVIEW_CAPABILITY_SECRET` must be four independent values in the active
  provider secret store.
- `BETTER_AUTH_URL` must be the exact deployment origin.
- Readiness rejects repository placeholders, surrounding/control whitespace,
  low-diversity or reused secrets, origin mismatch, placeholder administrator
  values, invalid optional Access values, incomplete Google credentials, an
  incomplete Zoho SMTP pair, or a partial notification-delivery
  set.
- `NODEZUNO_ADMIN_EMAILS` must be configured as a Sites environment variable
  for administrator access. The portable default is a verified Better Auth
  account with a real contact email on this allowlist. Wallet-only synthetic
  email is denied. Sites/Cloudflare Access is an optional identity overlay and
  remains subject to the same allowlist.
- `NODEZUNO_ENABLE_LEGACY_HOSTING_IDENTITY` is false by default. It may be true
  only while the whole Sites deployment remains private behind trusted
  dispatch, and must be false before public customer access.
- Public email signup requires both `ZOHO_SMTP_HOST` and
  `ZOHO_SMTP_PASSWORD`. Missing or partial public configuration hides
  email signup, disables Better Auth email/password, and fails readiness. The
  only exception is exact HTTP loopback with
  `NODEZUNO_LOCAL_PREVIEW=true`.
- Google and email availability is determined only from the reviewed deployed
  configuration and production smoke test.
- Valid Upgrade Assurance production orders begin in `proposal_ready` with
  generated service-order version 1. Buyers can accept the terms and create the
  deposit payment instruction without administrator approval.
- The engagement price is fixed by the server at USD 7,500. Deposit and balance
  are each USD 3,750. Browser amount, alternate currency, coupons,
  subscriptions, automatic overage, invoices, and taxes are not supported.
- `NODEZUNO_STABLECOIN_PAYMENT_MODE=manual_ethereum` enables Ethereum Mainnet
  USDC/USDT instructions, transaction-hash intake, and manual operator review
  only when `NODEZUNO_LEGAL_LAUNCH_APPROVED=true` is also set.
  A submitted hash is not payment proof. The admin must inspect the successful
  transaction, canonical token, recipient, and amount, then save a manual-check
  note before the order status advances. This path does not use the automatic
  verifier and must not be described as cryptographic verification.
- `NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet` requires
  `NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and two or three valid dedicated
  endpoints with distinct provider identities and normalized hosts in
  `NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON`.
  Invalid or absent values keep payment creation and verification closed.
- The current Cloudflare production configuration defaults payment mode to
  `disabled` and launch approval to `false`. After the owner completes the
  release approval, the manual mode must be enabled explicitly. It does not run
  the Ethereum verifier. `disabled` stops new payment instructions.
- Ethereum Mainnet USDC and USDT verification is the only payment path.
- A submitted transaction hash, Telegram username, screenshot, explorer page,
  or wallet success screen is not payment proof. In manual mode, an operator
  must inspect the Ethereum transaction and record a note before advancing the
  order. In the separate automatic mode, agreeing finalized Ethereum RPC
  evidence is required. Refunds and disputes remain external operations.
- Each production instruction fixes Ethereum chain ID 1, canonical USDC or
  USDT, six decimals, the seller recipient, proposal phase and version, expiry,
  and exact atomic amount. The displayed token amount includes a unique 1 to
  9,999 atomic-unit reference suffix and must not be rounded.
- A claim requires a globally single-use transaction hash and mandatory
  Telegram username. In manual mode, the operator checks it and contacts the
  customer. No scheduled payment-verification worker runs in the Cloudflare
  profile. The optional automatic mode retains the independent-RPC policy for
  a separately reviewed runtime.
- Every automatic payment-worker pass must persist a configuration-bound verifier
  heartbeat. New instructions require every configured provider healthy and a
  heartbeat no older than 150 seconds. Configuration parsing, one healthy
  endpoint, or a historical preflight is insufficient.
- `info@nodezuno.com` is the fixed sender and operational notification inbox.
  Production mail requires a valid `ZOHO_SMTP_HOST` and protected
  `ZOHO_SMTP_PASSWORD`.
- The Cloudflare Worker processes at most one D1 outbox item per minute; its
  Cron execution is subject to the 10 ms Workers Free CPU ceiling. The
  alternate container notification worker supports SQLite. Zoho SMTP success
  is recorded as `accepted`, not mailbox `delivered`; there is no provider
  callback for delivery, bounce, or complaint outcomes. Source cannot prove
  the live SMTP or mailbox path.
- RPC remains configuration-only unless `NODEZUNO_RPC_UPSTREAMS_JSON` is one
  valid JSON object whose non-empty top-level keys are a subset of
  `ethereum`, `base`, and `solana`. Each configured network must contain one to
  four reviewed real HTTPS upstreams. Ethereum activates only after
  `eth_chainId: 0x1`; Base only after `eth_chainId: 0x2105`; Solana only after
  the canonical mainnet genesis hash and `getHealth: "ok"`.
- RPC upstreams must use public HTTPS on default port 443. User information,
  fragments, private or special-use hosts, redirects, and routing-sensitive
  headers are rejected. Provider URLs and headers remain secret.
- Application URL validation does not pin DNS answers. The deployment network
  must enforce destination egress policy and protect against DNS rebinding.
- `NODEZUNO_RPC_HOURLY_CALL_QUOTA` defaults to 1,000 weighted units per service
  and key per hour. `NODEZUNO_RPC_WORKSPACE_HOURLY_CALL_QUOTA` defaults to
  10,000 weighted units across the workspace per hour.
- `pnpm run preflight:nodes` is the operator preflight for configured
  Ethereum, Base, and Solana attachments. It exposes only configuration
  validity and configured/verified counts. A green source test is not a
  substitute for a green preflight using deployment secrets.
- `NODEZUNO_PUBLIC_INDEXING` is false by default. Only exact `true` publishes
  indexable canonical content. Account, authentication, console,
  administrator, reset, and API paths remain excluded from search.
- Sites requires D1 through the `DB` logical binding. A container selects
  `d1-rest` or single-instance persistent-volume `sqlite`.
- A container explicitly selects `NODEZUNO_INGRESS_MODE=direct` or
  `trusted-gateway`. `direct` requires exact `PUBLIC_ORIGIN` host/protocol
  admission and a completely blank origin secret. `trusted-gateway` requires
  a strong distinct origin secret injected by a separately managed gateway.
  Missing or empty mode defaults to fail-closed `trusted-gateway`. Cloudflare
  Access is optional for both customer self-service and administrator access;
  when configured, it supplies an alternative verified identity overlay.
- Public intake accepts no private source or sensitive evidence file. The
  current Cloudflare profile uses authenticated Worker streaming to a private
  R2 bucket, with sealed checksums and version-checked buyer downloads. R2 uses
  Cloudflare-managed encryption at rest. The alternate AWS profile separately
  uses versioned S3, KMS, IAM, and CloudTrail.
- The repository includes a Cloudflare D1 outbox consumer scheduled to process
  at most one item per minute for submission, review-application, buyer
  lifecycle, payment-state, and newsletter-confirmation mail. The worker sends
  through Zoho SMTP and is subject to the 10 ms Free Cron CPU limit. CRM
  synchronization and delivery callbacks are not implemented.
- The AWS profile creates a six-hour verified SQLite backup timer, write-only
  S3 upload, Object Lock retention, daily volume snapshots, backup-age alarm,
  and guarded no-overwrite restore path. Other providers need equivalent
  controls before release.
- The AWS profile has one host, one Availability Zone, one web process, and one
  SQLite writer. It is not horizontally scalable or highly available. Do not
  publish an SLA or call this a multi-AZ deployment.
- The website API, control plane, and bounded multi-chain HTTP JSON-RPC
  gateway are source-implemented. Native gRPC is a separate Ethereum-only Go
  deployment target. Its primary `control-plane` mode validates customer keys
  and service IDs against the private database-backed authorization route.
  `static-digest` is an isolated fallback only. No live native gRPC deployment
  is established by the repository.
- No Nodezuno-owned blockchain node fleet or broader product plane is deployed
  by this codebase.
- `pnpm-workspace.yaml` pins reviewed PostCSS and esbuild security overrides
  and exact allowed install scripts. The Docker build copies this policy before
  its frozen install.

## Required release record

### Safe source handoff

After the complete intended source has been reviewed and committed, use:

```sh
pnpm run release:source:export /absolute/existing/private-output-directory
```

The exporter runs the clean-source gate, checks committed paths against the
shared source policy, and archives one exact Git commit. It refuses to write
inside the repository or overwrite an archive. The archive and SHA-256 manifest
have owner-only file permissions. It never uploads them. Do not ZIP or TAR the
working directory: ignored secrets, SQLite files, build output, and local
runtime state are not source deliverables.

Path checks are not a content-level secret scan. Review the source and history
with redacted secret-scanning output before sharing. If a real credential is
confirmed exposed, use the incident procedure and credential owner's approved
rotation plan; merely deleting the file does not revoke the credential.

AWS image tags include the commit, workflow run ID, and run attempt, so manual
reruns do not collide in immutable ECR. Deployment still uses the resulting
digest. Build records are not uploaded as implicit workflow artifacts; SBOM and
provenance remain enabled.

### Release evidence

Create an access-controlled release record from
[PRODUCTION_RELEASE_EVIDENCE.md](PRODUCTION_RELEASE_EVIDENCE.md). The template
is the operator checklist for the current AWS profile. Mark a retained RPC,
gRPC, node-attachment, or Sites-only item `NOT IN SCOPE` with a reviewer and a
reason when it is disabled. Never exercise or publish a dormant foundation
merely to fill a release record.

The record must contain:

- release label and UTC time;
- source commit and branch;
- operator and reviewer;
- generated migration files and review evidence;
- Upgrade Assurance settlement mode, fixed-price review, proposal owner,
  operations mailbox owner, payment-RPC owners, and worker schedule;
- successful capability isolation, proposal, deposit, balance, USDC and USDT
  instruction, mandatory Telegram, transaction replay, wrong chain, token,
  recipient and amount, cross-RPC agreement, confirmation, finality, and
  idempotent verification evidence;
- payment preflight output limited to endpoint names, chain ID, latest and
  finalized block numbers, and healthy state, with no URLs or headers;
- verifier heartbeat age, configuration match, endpoint counts, oldest claim
  age, manual-review count, and CloudWatch alarm state, without endpoint or
  claim identifiers;
- Zoho SMTP host and app-password review, worker-timer state, safe delivery ID,
  SMTP acceptance time, controlled mailbox receipt, lifecycle-event coverage,
  and any retry or dead-letter
  reconciliation without recipient, content, token, or raw-payload data;
- deliverables bucket and KMS resource review, sealed upload and finalization
  result, final report and manifest completion gate, authorized and denied
  download results, signed-URL expiry, version pin, and CloudTrail object data
  events without file contents or signed URLs;
- database driver plus recovery-point/export identifier and validation
  evidence;
- build, lint, type-check, test, workspace/key lifecycle, authentication
  method, session, wallet replay, service lifecycle, and interaction results;
- exact one-scope key creation, service-bound cross-service denial, unbound
  `services:manage` isolation, key rotation, and revocation results;
- RPC upstream owners and chains, redacted configuration review, method and
  quota test results, provider-side capacity/spend controls, and rollback
  decision when RPC is enabled;
- per-network preflight evidence, node region, release or snapshot version,
  pruning/history policy, gateway owner, capacity owner, and failover order;
- native gRPC image digest, HTTP/2 and TLS evidence, readiness, database
  authorization decisions, and coordinated internal-secret rotation result
  when gRPC is enabled;
- public-indexing decision, approver, robots output, sitemap output, and
  non-indexable-route checks;
- immutable AWS image digest, or a Sites saved-version identifier only for an
  explicitly reviewed non-AWS deployment;
- deployment URL and access mode;
- production probe output with secrets and personal data removed;
- runtime link-crawl target count and result;
- administrator allowlist review;
- known gaps accepted for this release; and
- rollback version and rollback decision owner.

Do not store secret values, raw developer API keys, RPC upstream URLs or
headers, JSON-RPC bodies, form payloads, email addresses, raw unsubscribe
tokens, or database exports in the release record.

## Phase 1: source and content review

Start with the clean-source procedure in
[PRODUCTION_RELEASE_EVIDENCE.md](PRODUCTION_RELEASE_EVIDENCE.md). A local
production-style deployment does not make an uncommitted working tree
releasable. Commit only after reviewing every intended path, push the exact
commit to the protected production branch, and prove that the remote branch,
workflow input, image provenance, and recorded commit all match.

1. Confirm the working tree contains only intended changes. Preserve unrelated
   user work.
2. Review the diff for changes to:
   - `db/schema.ts` and `drizzle/`;
   - authentication, developer-control-plane, or admin routes;
   - review order, proposal, payment-intent, transaction-claim, worker, and
     payment-state routes;
   - Ethereum, Base, and Solana JSON-RPC parsing, routing, quota, usage, and upstream
     configuration;
   - native gRPC contract, authorization, readiness, image, and edge
     configuration;
   - `worker/index.ts` security headers;
   - public claims, legal copy, documentation, whitepaper, status, and chains;
   - `.openai/hosting.json`; and
   - runtime dependencies, `pnpm-workspace.yaml`, the lockfile, Dependabot,
     CodeQL, or CI.
3. Confirm every navigation target renders meaningful content. Pay particular
   attention to `/docs`, `/whitepaper`, security, legal, pricing,
   contact, request, and self-service console flows.
4. Verify only one desktop or mobile navigation group can be open at a time;
   opening another closes the first, outside click closes the menu, `Escape`
   closes it, route changes close it, and keyboard focus remains usable.
5. Confirm content distinguishes the bounded upstream-backed Ethereum, Base,
   and Solana JSON-RPC beta from a Nodezuno-owned node fleet and all other
   prelaunch products.
6. Confirm no customer logos, uptime percentages, benchmarks, certifications,
   chain availability, press coverage, or launch claims lack evidence.
7. Verify the only published Nodezuno address, `info@nodezuno.com`, is owned,
   receives mail, and has an assigned responder. Code alone cannot prove
   mailbox operation.
8. Verify the Zoho SMTP host, protected app password, one-minute worker
   schedule, and a controlled email receipt in `info@nodezuno.com`. Record SMTP
   acceptance separately from the observed mailbox receipt.
9. Confirm pricing copy, proposal terms, payment instruction, claim, and
   receipt surfaces all state USD 7,500 total, USD 3,750 deposit, and USD
   3,750 balance without presenting qualification as guaranteed acceptance.
   The transfer surface must also distinguish the exact token amount, including
   its reference suffix, from the USD obligation.
10. Review `.well-known/security.txt` and renew its expiry before it becomes
   stale.

## Phase 2: database review and recovery point

Read [MIGRATIONS.md](MIGRATIONS.md) before changing the schema. Ordered SQL
files plus the checksum ledger are the current migration authority.
`pnpm run db:generate` is intentionally blocked because Drizzle metadata ends
before the current SQL history. Add a reviewed, contiguous SQL migration and
update final-schema verification instead of generating from stale metadata.

A migration must be additive or provide a separately reviewed compatibility
plan. In particular:

- old code must tolerate the new schema during rollback;
- existing rows must retain valid defaults or be backfilled safely;
- constraints and indexes must be reviewed against existing data;
- destructive table rebuilds require a staged migration and restore rehearsal;
  and
- seed changes must preserve truthful `preview` and `planned` states.

Follow [OPERATIONS.md](OPERATIONS.md) to create a driver-appropriate recovery
point and validate that it is readable. D1 requires a provider-supported
recovery point or encrypted export. SQLite requires a consistent
application-level backup plus an isolated restore, not a raw live-volume copy.
If no usable recovery mechanism is available, stop the release. A saved Sites
version or container image is not a database backup.

Apply migrations to an empty or isolated non-production database using the
release driver first.
Verify all required tables, including Better Auth users, sessions, provider
accounts, wallet links, developer workspaces, memberships, services, API keys,
developer audits, RPC key/service usage buckets, and RPC workspace quota
buckets, `review_orders`, `review_order_events`,
`review_stablecoin_payment_intents`, `review_stablecoin_payment_claims`,
`payment_verifier_health`, and
`review_stablecoin_reconciliation_cases`,
`review_stablecoin_payment_confirmations`, `review_deliverables`, the current
visible status services, at least eight
chains, foreign-key behavior, and `/api/v1/health`.

Verify migration `0006_lean_magma.sql` adds the nullable
`developer_api_keys.service_id` foreign key and its service/revoked/created
index without invalidating existing unbound identity keys. Verify
`0007_shared_grpc.sql` adds `grpc-api` support while retaining existing
developer services, API keys, usage rows, foreign keys, and indexes. Because
0007 rebuilds constrained tables, rehearse it with representative existing
rows and prove row counts and relationships before and after. Record a fresh
migration run through the latest ordered SQL file from the exact release
commit.

Verify the later migrations add multi-chain usage, RPC access policies,
24-hour developer mutation idempotency, atomic API-key rotation support, and
optimistic service rename state. Confirm every key stores exactly one
compatible scope, every callable product key is bound to its exact service,
and unbound keys are limited to `platform:identity` or `services:manage`.

Verify `0015_upgrade_assurance_commerce.sql` applies through both target
drivers and enforces `750000` USD minor units total, `375000` USD minor units
for both deposit and balance,
lowercase `usd`, valid order and payment states, account foreign key behavior,
two-year expiry indexes, and the initial website, review-intake, and
review-portal status seeds. The provider-payment tables in this historical
migration are pre-production migration history only and are removed by `0024`.

Verify `0024_remove_legacy_provider_payments.sql` runs automatically only on a
fresh installation. An existing pre-`0024` database must stop at the contract
migration guard and follow the maintenance procedure in
[MIGRATIONS.md](MIGRATIONS.md). Never roll a pre-`0024` image back onto a
database after `0024` has committed.

Verify `0019_ethereum_stablecoin_payments.sql` adds nullable Telegram contact
to existing orders, immutable Ethereum mainnet intent snapshots, globally
unique transaction claims, active-state uniqueness, worker scheduling indexes,
and the payment-verification status replacement. Exercise an empty migration
and a representative database with legacy rows. Verify every address, chain,
asset, amount, Telegram, transaction-hash, lease-pair, and state constraint,
foreign keys, account-export isolation, and schema readiness.

Verify `0020_payment_operational_guards.sql` adds immutable intent snapshots for
confirmation policy, accepted terms version and hash, hashed creation
idempotency, and the singleton verifier heartbeat. Exercise stale,
configuration-mismatched, partially healthy, and disagreeing provider states.
No case may issue an instruction without a matching healthy heartbeat no older
than 150 seconds.

Verify `0021_review_lifecycle_notifications.sql` preserves existing outbox rows
and immutable triggers while admitting `review.lifecycle.buyer`. Exercise each
administrator transition, verified deposit and balance, payment manual review,
completion, deterministic replay, provider acceptance, signed delivery event,
and controlled mailbox receipt.

Verify `0022_review_delivery.sql` adds sealed deliverable metadata, one active
file per kind, guarded state progression, and immutable storage identity.
Exercise ten-minute presigned upload, exact length and SHA-256, KMS and metadata
checks, version capture, abandoned-upload replacement, final report and manifest
completion gate, buyer isolation, five-minute version-pinned download, and
CloudTrail object data events.

Verify `0023_stablecoin_reconciliation.sql` adds automatic cases for
seller-received anomalies, immutable exact and reconciled payment confirmations,
operator resolution idempotency, unique receipt identities, strict relationship
and progression triggers, refund-record fields, terminal claim-evidence
immutability, and no-delete financial records. Rehearse every case type and
resolution code, changed idempotency reuse, concurrent decisions, externally
signed refund recording, buyer receipt isolation, and attempts to update or
delete sealed evidence.

Exercise the implemented administrator application route separately. It must
require exact same origin, a fresh real-email allowlisted session, a valid
`Idempotency-Key`, exact action `apply_to_obligation`, and a 12 to 4,000
character note. Prove that only complete finalized seller-received official
Ethereum USDC or USDT evidence with at least two agreeing providers and the
narrow amount rule can advance an order. Prove arbitrary amounts and ambiguous
receipts remain blocked. A successful first decision must atomically resolve
the case, verify the intent, advance the due order phase, and create exactly one
immutable confirmation, order event, administrator audit event, and buyer
lifecycle outbox intent. Exact replay must return the original record; changed
replay and concurrent state change must fail closed.

Exercise the buyer confirmation route with the capability-derived scoped
cookie and exact bound account. It must return private no-store JSON only for
the same order, use the immutable receipt reference as its attachment name,
exclude administrator decision details, and state that it is not a tax invoice
or custody receipt. Cross-order and unknown confirmation IDs must return the
same safe not-found class.

For container SQLite, also verify the absolute mounted path, UID `1001`
ownership, WAL settings, 5-second lock timeout, single application instance,
`PRAGMA quick_check`, backup artifact, and isolated restore. Create and verify
the recovery artifact with:

```bash
pnpm run db:backup:sqlite -- create /absolute/backup/nodezuno-<time>.sqlite
pnpm run db:backup:sqlite -- verify /absolute/backup/nodezuno-<time>.sqlite
```

Transfer both the database and its `.manifest.json` off the live volume and
host, verify that copy, then rehearse
`pnpm run db:restore:sqlite -- /absolute/backup/nodezuno-<time>.sqlite`
during a maintenance window against an absent target and absent sidecars. The
restore must refuse overwrite. For D1 REST, run
the real isolated integration against a disposable database and record the
managed recovery evidence.

## Phase 3: reproducible validation

Use Node.js `>=22.18.0` and the committed pnpm lockfile:

```bash
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=moderate
pnpm run lint
pnpm exec tsc --noEmit --incremental false
pnpm run build:sites
pnpm run build:container
pnpm test
```

`pnpm test` performs another production build and runs both contract and
rendered-HTML suites. All commands must pass from the same source tree.

Validate the native gRPC source even if it is deployed separately:

```bash
cd services/grpc-gateway
node ./scripts/verify-contract.mjs
go test ./...
go build ./cmd/server
cd ../..
```

When deployment node secrets are available in the operator environment, run:

```bash
pnpm run preflight:control-plane
pnpm run preflight:nodes
pnpm run payments:preflight
```

The control-plane preflight must pass with the reviewed container environment.
It outputs only runtime and named booleans for origin, secret isolation,
account delivery, administrator allowlist, selected database settings, ingress
boundary, optional Access identity, rate-limit secret, and API-key pepper.
`ingressBoundary` must represent the selected mode and its exact secret rule.
The preflight validates configuration but does not open the database. The node
preflight must verify all three required network attachments for a multi-chain
release and must not print provider URLs or headers. Do not put production
secrets into CI logs or a developer `.env` file.

Run `payments:preflight` only from the reviewed secret-managed production
environment when stablecoin settlement is enabled. Every named endpoint must
prove Ethereum mainnet, fresh latest and finalized blocks, canonical USDC and
USDT code and decimals, and unknown-receipt behavior. Its saved output must not
contain endpoint URLs or headers. Run one bounded `payments:process` pass after
the schedule is installed and confirm aggregate-only output.

Start the local Worker:

```bash
pnpm run dev
```

In another terminal:

```bash
pnpm run smoke:local
pnpm run smoke:auth -- http://localhost:3000
pnpm run smoke:links -- http://localhost:3000
```

`smoke:local` is local-only and mutates the local database. `smoke:auth` refuses
non-loopback targets. `smoke:links` is read-only and accepts HTTPS or loopback
HTTP. Never run the mutating smoke against production.

### Validation record

Do not copy a historical test count into a new release. Record command, exact
commit, start/end time, exit status, test count, skipped-test reason, and
artifact digest for the current run. Any skipped integration that covers the
target environment remains a cutover blocker unless the accountable reviewer
documents a narrower release scope.

Local builds and mocks are source evidence only. They cannot prove cloud-node
ownership, correct production secrets, public DNS, a custom domain, email
delivery, native gRPC edge behavior, public access, or production availability.
Record those facts from the deployed environment or leave the corresponding
release gate closed.

### Manual interaction gate

Use the built site at desktop, tablet, and mobile widths to verify:

- desktop navigation has at most one open mega menu;
- mobile navigation has at most one open sub-group;
- opening a new group closes the old one;
- clicking outside and pressing `Escape` close open navigation;
- tab, reverse-tab, Enter, and Space operate the menu without trapping focus;
- clicking a navigation link closes the menu and reaches the intended page;
- reduced-motion settings do not hide content or controls;
- forms expose validation, pending, success, replay-safe, and failure states;
- the documentation, OpenAPI contract, whitepaper, security, privacy, terms,
  and not-found/error pages render complete content;
- `/account` and `/console` accept a real Nodezuno application session;
- email, configured Google, supported EVM EOA, and compatible Solana wallet
  flows present truthful availability and error states;
- wallet signature copy states that no transaction or gas is involved;
- `/console` creates a workspace and service records directly and never
  redirects to a sales or access-request form;
- each Ethereum, Base, and Solana quickstart creates only missing resources,
  resumes after a partial attempt, and binds its one-time key to the selected
  service;
- changing the selected network cannot reuse a service or endpoint from
  another network;
- the first-call tester expects `0x1` for Ethereum, `0x2105` for Base, and
  `"ok"` from Solana `getHealth`;
- free RPC beta signup and onboarding request no payment card and state both
  default hourly quotas, the absence of RPC paid billing, and the future-only
  RPC sales boundary;
- `/review/start` validates and creates a direct fixed service order, then
  preserves its exact-retry-reproducible capability in the URL fragment and
  exchanges it for the scoped buyer cookie;
- opening the same private tracking path without the capability, scoped cookie,
  or exact bound account cannot read the order;
- production payment instructions require explicit acceptance of the generated
  service-order terms, reject a stale or expired version, display USD 7,500 total and the due USD
  3,750 obligation, require idempotent creation, snapshot terms and
  confirmations, require a fresh independent-provider heartbeat, and use only
  the exact server-generated atomic amount;
- the buyer can select only canonical Ethereum mainnet USDC or USDT, sees the
  fixed recipient and a clear wrong-network warning, and cannot submit chain,
  contract, recipient, decimals, or amount;
- claim submission requires a complete transaction hash and valid Telegram
  username, returns a pending state, and cannot mark payment;
- local and cloud deployments create the same Ethereum Mainnet instruction,
  require a deliberately sent transfer, and cannot advance from browser input;
- `/account` lists only orders bound to that stable account ID, while `/admin`
  can issue proposals and advance only guarded lifecycle states;
- each guarded lifecycle and verified-payment transition queues exactly one
  buyer-safe email whose private tracking link is reconstructed server-side;
- `/admin` seals and uploads a final report, evidence archive, and manifest to
  private S3, rejects a checksum or KMS mismatch, and cannot complete without
  an available final report and manifest;
- the authorized buyer sees released safe metadata and receives a five-minute
  version-pinned download, while another order, expired URL, or unreleased file
  is denied;
- API-key creation clearly marks the raw key as a one-time disclosure, list
  views omit it, service binding is visible, and revocation requires
  confirmation;
- each key shows exactly one compatible scope, product keys are bound, and an
  unbound `services:manage` key cannot invoke identity, RPC, or gRPC;
- API-key creation, rotation, and service creation require valid
  `Idempotency-Key`; exact service replay is stable, repeat key-secret
  disclosure is denied, and changed input returns `idempotency_key_reused`;
- service rename sends the exact current canonical `updatedAt`, reports a stale
  `service_update_conflict`, and never changes product, network, region,
  environment, or binding;
- key rotation preserves the exact scope and service binding, discloses one new
  secret, and immediately revokes the source; and
- the service automation client lists, creates, reads, renames, archives,
  reads usage, and manages policy without a customer-support or sales step;
  and
- `/admin` fails closed when the database is unavailable.

Record viewport, browser, result, and any approved exception in the release
record.

### Security gate

Review [SECURITY.md](SECURITY.md) and verify:

- no production fallback secret is present;
- runtime configuration rejects placeholders, surrounding/control whitespace,
  low-diversity and reused secrets, origin mismatch, invalid ingress mode or
  mode/secret pairing, placeholder administrator values, invalid optional
  Access values, one-sided Google or Zoho SMTP pairs, and a partial Zoho mail
  configuration;
- `RATE_LIMIT_SECRET`, `API_KEY_PEPPER`, `BETTER_AUTH_SECRET`,
  `REVIEW_CAPABILITY_SECRET`, and the trusted-gateway-only container origin
  secret are independent without
  exposing their values; direct mode proves the origin secret is entirely
  blank;
- `NODEZUNO_GRPC_AUTH_SECRET` is independent from every website secret when
  native gRPC is configured;
- `BETTER_AUTH_URL` exactly matches the deployed HTTPS origin and, in
  container mode, `PUBLIC_ORIGIN`;
- direct container requests accept only the exact configured host and
  protocol, remove a client-supplied origin secret, and derive rate-limit
  identity from the provider-appended last `X-Forwarded-For` value;
- trusted-gateway container requests fail without the exact injected origin
  secret, and an unset ingress mode does not silently select direct;
- `NODEZUNO_ADMIN_EMAILS` is minimal and approved;
- an allowlisted verified real-email application account can administer, an
  unlisted account and wallet-only synthetic-email account cannot, and any
  optional hosting/Access identity still requires the same allowlist;
- public requests cannot forge trusted identity headers;
- no route outside the Ethereum verifier and guarded reconciliation workflow
  can advance a payment state;
- review-order capabilities are 256-bit purpose-separated HMAC outputs backed
  by the strong server secret, persist only as a second purpose-separated HMAC,
  travel in URL fragments before exchange, and become path-scoped HttpOnly
  SameSite cookies;
- order reads prove the exact capability cookie or stable account binding and
  never bind or authorize by submitted email alone;
- payment intent creation accepts only the current proposal version, due phase,
  and USDC or USDT, cannot override chain, contract, recipient, amount, or
  currency, and prevents duplicate active instructions per order phase;
- transaction hashes are normalized and globally unique; Telegram usernames
  are mandatory and normalized without appearing in logs;
- every configured payment RPC must agree on chain ID 1, successful receipt,
  one exact canonical transfer, receipt-block evidence, confirmations, and
  finalized progress before the atomic paid-state transition;
- notification delivery requires the Zoho SMTP host and app password, the
  SQLite driver, an exclusive one-shot schedule, immutable payload seals,
  bounded leases/retries, and aggregate logs without recipient or content
  data;
- the application records SMTP `accepted` without representing it as inbox
  `delivered`; provider delivery, bounce, suppression, and complaint callbacks
  are not part of this system;
- release evidence records SMTP acceptance and separately observed mailbox
  receipt without manual state edits;
- wrong-chain, wrong-token, wrong-recipient, wrong-amount, reverted, ambiguous,
  missing, non-final, reorged, malformed, and disagreeing RPC fixtures all fail
  closed as documented;
- transaction-hash replay across orders and phases is denied, concurrent worker
  leases converge, and repeated verification emits one confirmation event;
- same-origin, body-size, abuse-challenge, rate-limit, validation, and
  idempotency tests pass;
- workspace isolation, key-limit, one-time disclosure, HMAC authentication,
  exact one-scope derivation, management-key unbound enforcement, expiry,
  atomic rotation, revocation, role, service-binding, and cross-service denial
  tests pass;
- 24-hour service/key idempotency, repeat-secret denial, optimistic service
  rename, stale conflict, redacted audit, and API-key actor attribution tests
  pass;
- email signup, session revocation, EVM and Solana replay rejection,
  synthetic-email non-disclosure, account-ID request ownership, and service
  lifecycle isolation tests pass;
- RPC cross-workspace denial, service/network reconciliation, scope checks,
  network-specific allowlists, 256 KiB request limit, 20-call batch limit,
  2 MiB response limit, retry-safe failover, both quota layers, and aggregate
  usage tests pass;
- the reviewed upstream JSON contains only configured `ethereum`, `base`, and
  `solana` keys; each contains one to four unique ordered HTTPS entries,
  public default-port hosts, no user information or fragment, no private or
  special-use destination, no forbidden routing header, and remains only in
  the secret manager;
- Ethereum, Base, and Solana probes enforce their exact chain or cluster gates,
  and upstream probes and calls reject redirects;
- DNS and egress controls restrict the gateway to approved destinations even
  if a hostname answer changes after application validation;
- provider chain, credential scope, capacity, spend alerts, support owner,
  failover order, and rollback procedure are verified outside source;
- native gRPC requires one bearer key plus one UUIDv4 service ID, validates
  `grpc:invoke` and service binding through the selected database in
  control-plane mode, blocks non-health traffic while dependencies are
  unready, atomically consumes method-weighted key/service and workspace
  quotas, and preserves public TLS plus HTTP/2 through the edge;
- native gRPC uses either the preferred ordered one-to-four
  `ETHEREUM_UPSTREAMS_JSON` array or the mutually exclusive legacy single
  upstream, isolates provider credentials, makes at most two safe read-only
  attempts, proves Ethereum chain ID `0x1`, and rejects
  `eth_sendRawTransaction` and all other writes;
- public indexing stays false until canonical URL, robots, sitemap,
  non-indexable path, legal, and public-access checks pass;
- CSP contains a per-request nonce and does not allow script
  `unsafe-inline`;
- framing, MIME, referrer, permissions, cross-origin, and HTTPS headers remain
  present;
- image optimization rejects external sources; and
- SQLite releases use one process and one local durable volume, pass real
  migration/integrity tests, and have an application-level backup plus isolated
  restore evidence; D1 REST releases pass their disposable real integration
  and managed recovery gate;
- logs and errors do not expose SQL, bindings, secrets, email, or payloads;
  and
- the frozen install and production dependency audit pass with the committed
  `pnpm-workspace.yaml` policy.

## Phase 4: package and save

1. Commit the complete reviewed source.
2. Push that exact commit using an approved short-lived repository credential.
3. Verify the remote commit matches the validated local commit.
4. For Sites, package the already validated build output and reviewed
   migrations, save a version, and confirm it references the exact commit.
5. For a container, build from the exact commit, record the immutable image
   digest, inspect its SBOM or dependency inventory, and confirm it contains the
   generic migration runner and exact reviewed SQL files.
6. Record the selected database driver. For SQLite, also record one instance,
   absolute mounted path, volume identity, ownership, capacity, backup, and
   restore evidence. For D1 REST, record the selected database and restricted
   token scope without copying credentials.

For Sites, never call site creation for this existing project. Reuse the opaque
`project_id` in `.openai/hosting.json`.

## Phase 5: deploy

Deploy only the saved Sites version or recorded immutable container image.
Preserve the intended access mode; do not switch owner-only access to public as
a side effect of a content or code release.

Wait until the deployment reaches a terminal successful state and readiness
passes. A returned URL or running container is not proof of success while the
deployment, migration, or readiness is pending.

If migration or deployment reports failure:

1. stop and preserve the failure output;
2. do not retry destructive steps blindly;
3. determine whether the failure occurred before or after database migration;
4. verify the current production health and schema;
5. deploy the prior compatible saved version if code is broken; and
6. restore data only for confirmed corruption or loss under the restore
   procedure.

## Phase 6: production verification

Run read-only probes against the deployment URL:

```bash
curl --fail --silent --show-error https://<production-host>/
curl --fail --silent --show-error https://<production-host>/docs
curl --fail --silent --show-error https://<production-host>/whitepaper
curl --fail --silent --show-error https://<production-host>/review/start
curl --fail --silent --show-error https://<production-host>/api/v1/health
curl --fail --silent --show-error https://<production-host>/api/v1/status
curl --fail --silent --show-error https://<production-host>/api/v1/chains
curl --fail --silent --show-error https://<production-host>/api/v1/openapi
curl --fail --silent --show-error https://<production-host>/.well-known/security.txt
pnpm run smoke:links -- https://<production-host>
```

Acceptance requires:

- homepage, documentation, and whitepaper return complete HTML;
- health returns HTTP `200`, `database: true`, and `configuration: true`;
- health reports redacted per-network RPC and native gRPC configuration state
  and explicitly says it does not probe upstream, chain, or gRPC serving
  health;
- status returns the visible website, review-intake, payment-verification, and
  review-portal catalog, reconciles only the responding website row, and does
  not revive hidden RPC or gRPC product-foundation rows;
- status denies historical uptime, chain telemetry, active-engagement, and SLA
  meaning;
- chains remain at their evidence-backed maturity;
- the OpenAPI document identifies itself as the website API;
- security headers are present on HTML and API error responses;
- an anonymous administrator request receives `401`;
- a client-supplied forged identity header still cannot authorize admin;
- a real allowlisted identity can open `/admin`;
- the allowlisted node-attachment view reports only slot-based process-local
  Pulse observations and contains no upstream name, URL, header, credential,
  or internal cache key;
- a real application account can open `/console`, create a workspace, create,
  read, rename, and archive a service, rotate a key, and issue service-bound or
  unbound management keys without manual approval;
- Ethereum, Base, and Solana RPC services return `active`, beta maturity, and
  their endpoint only when that service's network has a verified upstream;
  unrelated prelaunch blockchain products remain configuration-only;
- the free RPC beta contract says Ethereum, Base, and Solana mainnet HTTP
  JSON-RPC, defaults to 1,000 weighted units per key and service per hour and
  10,000 units per workspace per hour, and exposes no RPC paid checkout or
  automatic overage;
- Upgrade Assurance copy consistently states direct fixed-scope checkout, USD
  7,500 total, USD 3,750 deposit, and USD 3,750 balance;
- an approved synthetic application creates one durable order plus operator
  and buyer initially pending outbox intents, reproduces its capability only
  for an exact idempotent retry, and cannot be read from another browser or
  account without that capability;
- the scheduled worker exclusively claims and seals those intents, Zoho
  accepts each message through SMTP, and the controlled operator and buyer
  mailboxes receive the expected non-confidential message;
- newsletter intake returns generic `202 pending`, queues at most the intended
  confirmation attempt, changes to `subscribed` only after explicit POST of the
  matching unexpired token, and preserves non-enumerating unsubscribe;
- an allowlisted administrator can exceptionally reissue a fixed service order
  but cannot override amount or currency, while a non-administrator cannot list
  or mutate review orders;
- the buyer can create only the phase currently due and receives one immutable
  Ethereum mainnet instruction with a bounded lifetime and unique exact token
  amount; concurrent or uncertain retries reuse the same instruction;
- a submitted hash and mandatory Telegram username remain pending until the
  scheduled worker proves the exact transfer through agreeing endpoints,
  confirmations, and finalized progress;
- USDC and USDT fixtures prove wrong chain, asset, recipient, amount, expiry,
  reverted receipt, ambiguity, transaction reuse, RPC disagreement, finality,
  deposit and balance transitions, lease recovery, and exactly-once events;
- a disposable unbound `platform:identity` key reports its key and workspace
  identity at `/api/v1/platform/whoami`, then receives `401` immediately after
  revocation;
- a separate unbound `services:manage` key can automate the service lifecycle,
  usage, and policy routes, is attributed by key ID in the audit trail, and is
  denied by identity, RPC, and gRPC product routes;
- a separate disposable `rpc:invoke` key bound to each enabled network service
  can call only that service through `/api/v1/rpc/{serviceId}`; Ethereum
  returns `0x1`, Base returns `0x2105`, and Solana returns `"ok"` from
  `getHealth`;
- that service-bound key receives HTTP `403`, JSON-RPC code `-32003`, and
  detail code `api_key_service_denied` at another service;
- blocked methods, cross-workspace access, both quota layers, and revocation
  fail as documented without reaching an unintended upstream;
- empty or malformed JSON returns `-32700`, structurally invalid requests and
  empty batches return `-32600`, mixed batches preserve caller order, and
  bounded-parameter failures return `-32602`;
- rate-limit headers and aggregate usage match method-weighted quota units,
  while `rpc_call_count` continues to match the actual accepted call count;
- provider URLs, provider headers, bearer keys, parameters, and responses are
  absent from application logs and release evidence;
- the live node preflight passes all networks in release scope without
  revealing provider configuration;
- when native gRPC is in scope, its named health service is `SERVING`, a
  console-issued `grpc:invoke` key works only for its bound service, revocation
  denies the next call, public TLS/HTTP2 reaches the h2c container through the
  reviewed gRPC edge, read-only failover stops after two attempts, and a write
  method is rejected before any upstream call;
- `NODEZUNO_PUBLIC_INDEXING` remains false for private or incomplete releases;
  for an approved public release, exact `true` exposes only canonical content
  in robots and sitemap while private routes remain excluded;
- the runtime link crawler reports no broken route, redirect, asset, or
  fragment target;
- key list responses and logs contain no raw key;
- navigation behavior passes on the deployed build; and
- the deployment state is successful in Sites.

Routine release verification must not submit fake production forms. The local
smoke suite covers mutation contracts. A production developer-control-plane
check may create a clearly labeled disposable key because it does not contact
sales or an operator. Store the raw value only long enough to call
`platform/whoami`, revoke it, confirm denial, and remove every temporary copy.
If a production form mutation test is required, use an approved synthetic
identity, record the resulting data and retention impact, mark the submission
appropriately, and delete or suppress the approved fixture through the
documented retention process after evidence is captured. Do not claim delivery
from an API `202`, a worker exit code, or outbox `accepted`; require the signed
`email.delivered` callback and controlled mailbox receipt.

## Rollback

### Code or asset regression

1. Select the last known-good saved Sites version or container image whose code
   is compatible with the current database schema.
2. Deploy that artifact without changing the database driver.
3. Wait for successful terminal state.
4. Re-run all read-only production probes and the navigation gate.
5. Record the rollback version, reason, time, and remaining database migration.

Do not attempt a down migration merely because code rolled back. Releases must
keep the prior version compatible with additive schema changes.

### Configuration regression

- Restore the last approved non-secret configuration value.
- For a compromised secret, rotate forward; never restore the compromised
  value.
- After changing `RATE_LIMIT_SECRET`, expect active challenges to expire and
  effective HMAC-based rate-limit history to restart.
- After changing `API_KEY_PEPPER`, every issued API key is invalid. Verify old
  keys fail and require replacements through the console.
- After changing `NODEZUNO_ADMIN_EMAILS`, test both a removed and retained
  identity.
- To stop new payment instructions, set
  `NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled` and redeploy while preserving
  every instruction and claim. The installed payment worker becomes a
  successful no-op while disabled. Disabling the
  worker is not rejection, cancellation, or refund of an on-chain transfer.
- After changing a dedicated payment RPC endpoint or credential, keep payment
  disabled, run `pnpm run payments:preflight` against every configured
  endpoint, inspect unresolved claims, then start one worker and re-enable
  payment. Never paste endpoint URLs or headers into release evidence.
- For a compromised Zoho app password, stop the email-worker timer, revoke and
  replace the app password in Zoho, update the protected deployment secret,
  and reconcile any `processing` or `accepted` delivery before restarting the
  timer. Do not resend uncertain SMTP deliveries blindly.
- Legacy provider rows remain inert history and have no payment authority.
- After changing one network's upstream set, run its exact activation probe
  and a customer request before restoring traffic. Do not change an unrelated
  network as part of that rollback.
- The current native gRPC control plane accepts one internal authorization
  secret at a time. Rotate it as a coordinated website and gateway maintenance
  operation, confirm fail-closed `NOT_SERVING` during any mismatch, then drain
  the old version. See the gateway README.
- Changing `NODEZUNO_PUBLIC_INDEXING` is a publication decision. Re-run robots,
  sitemap, canonical, private-route, and access checks before enabling it.

### Data corruption or loss

1. Stop or restrict mutations and name an incident commander.
2. Preserve current database state and logs before repair. For live SQLite,
   stop the only writer and use the reviewed application-level backup path
   instead of copying only the main file.
3. Identify the exact last known-good recovery point and expected data loss
   window.
4. Rehearse the restore against an isolated database if that artifact has not
   already passed the same procedure.
5. Obtain incident-commander and data-steward approval.
6. Restore through provider-supported D1 tooling or the reviewed SQLite
   application-level procedure.
7. Validate schema, counts, integrity, health, account/workspace identity
   isolation, key revocation, audits, unsubscribe state, and outbox state.
8. Reconcile writes accepted after the recovery point.

Database restore is not a normal release rollback and must not be used to erase
an inconvenient migration.

## Release gates

| Gate | Pass evidence | Blocking condition |
| --- | --- | --- |
| Scope and truth | Content review; product-plane boundary retained | Unsupported availability, customer, benchmark, certification, or launch claim |
| Source | Exact commit and intended diff | Dirty or unreviewed source |
| Database | Reviewed additive migration and validated recovery point | Destructive/unexplained migration or no usable backup |
| Quality | Frozen install, production audit, both builds, lint, type-check, all required tests, backend/auth smoke, and link crawl | Any failure or skipped required suite; target-driver integration skip blocks container cutover |
| UX | Desktop/mobile navigation and route checklist | Multiple menus remain open, inaccessible controls, blank route, or broken form |
| Security | Security checklist, forged-header denial, exact one-scope key model, workspace/key/service isolation, and dependency policy | Missing or incoherent secret, broad admin access, multi-scope or unbound product key, absent headers, tenant/service leak, raw key leak, or identity bypass |
| Upgrade Assurance commerce | Direct fixed-scope service order and two USD 3,750 obligations; capability/account isolation; immutable Ethereum USDC and USDT instructions; mandatory Telegram; globally unique hashes; RPC agreement, receipt, exact log, confirmation, finality, lease, and paid-state evidence | Client-controlled settlement facts, capability or tenant leak, hash-authoritative payment, RPC disagreement accepted, transaction reuse, seller key in the application, or unowned operations mailbox |
| Payment operations | Two independent providers pass live preflight; configuration-bound heartbeat is fresh; one scheduled worker; backlog and manual-review alarms; aggregate-only logs; guarded seller-received reconciliation with exact idempotent replay; immutable buyer confirmation and cross-order denial; disable/re-enable rehearsal | Missing finality support, stale or wrong chain, stale heartbeat, stopped worker, endpoint URL/header or Telegram logging, arbitrary or ambiguous evidence applied, manual database payment marking, receipt presented as tax or custody evidence, buyer asked to pay twice, or no reconciliation owner |
| Secure deliverables | Private R2, sealed SHA-256 and length, metadata and object-version verification, final report and manifest completion gate, exact-order Worker-streamed download, application audit | Public object, unsigned or mutable identity, missing checksum proof, completion without required files, cross-order access, object URL exposure, or unreviewed retention |
| Multi-chain RPC beta | Real Ethereum, Base, and Solana upstream ownership; exact chain/cluster probes; scope, tenant, and network isolation; bounded request/batch/response; atomic quotas; redacted telemetry; safe failover | Missing or invalid upstream, unowned provider, wrong chain/cluster, quota bypass, network confusion, unsafe replay, secret/payload logging |
| Node attachment | Redacted `preflight:nodes` pass; private networking; DNS/egress policy; capacity, spend, snapshot, failover, and rollback owners | Any required network unverified, secret exposure, unrestricted egress, unknown history policy, or no capacity/rollback owner |
| Native gRPC | Exact contract tests; image digest; control-plane authorization; service binding; readiness; TLS and HTTP/2 edge; h2c isolation; rotation rehearsal | Static fallback presented as shared lifecycle, wrong-chain readiness, missing database decision, public cleartext listener, HTTP/1.1 downgrade, or no revocation evidence |
| Search publication | Approved exact indexing switch; canonical content-only sitemap; robots and private-route checks | Indexing enabled before public access/content/legal/security approval or a private path becomes discoverable |
| Notification delivery | Bounded D1 outbox processor and one-minute Cron; deterministic buyer lifecycle events; Zoho SMTP; observed mailbox receipt | Partial/invalid configuration, missing lifecycle event, Cron CPU overrun, PII/content logs, SMTP acceptance presented as inbox delivery, failed row manually requeued, or external path unverified |
| Deployment | Successful Worker build and saved Cloudflare deployment for exact commit | Ad hoc artifact, mutable source, pending/failed state, wrong Worker or database |
| Production | DNS/custom domain, public customer routes, protected admin, health, content, status, headers, auth, and link crawl | Owner-only access, absent DNS/domain, `503`, unhealthy DB/configuration, missing content, or unauthorized access |
| Recovery | Rollback version and restore evidence | No compatible code rollback or untested data restore |

## After release

1. Save the release record and close temporary credentials.
2. Confirm no local secret, export, or production payload entered the working
   tree.
3. Monitor health and error rates through the agreed observation window.
4. Monitor payment-worker timer health, verifier heartbeat age, oldest claim
   age, manual-review alarm, and aggregate selected, processed, deferred,
   failed, confirming, rejected, and verified counts. Investigate endpoint
   failures, disagreement, stale data, and finality without logging URLs,
   headers, transaction hashes, Telegram usernames, addresses, or receipts.
5. Review database counts and pending review and general outbox growth without
   reading payload content.
6. Monitor notification rows by state, expired leases, retry/dead-letter
   counts, accepted rows without later events, signed-webhook failures, and
   provider reputation without logging recipients or content.
7. Monitor deliverable prepare, verify, release, and download failures, R2
   errors, checksum mismatches, and bucket growth without logging filenames,
   object keys, or contents. Apply CloudTrail/KMS monitoring only to the
   alternate AWS profile.
8. Record defects and corrective owners.
9. Keep the release open if backup, mailbox, alerting, retention, payment
   reconciliation, or access evidence is missing; documentation does not waive
   those controls.
