# Cloudflare Free-Tier Deployment

This is the Cloudflare deployment profile for Nodezuno. It uses the Cloudflare
Worker-compatible Vinext build, Workers static assets, D1 for the application
database, private R2 for review deliverables, and one Cron Trigger for the
email outbox. Checked-in production defaults are fail-closed and do not create
or deploy Cloudflare resources by themselves. See the
[Cloudflare production release guide](CLOUDFLARE_PRODUCTION_RELEASE.md) for
release gates and operator evidence.

## Honest launch boundary

This profile is a low-cost launch candidate, not a production-scale guarantee.
Cloudflare Free currently allows 100,000 Worker requests per day and only
10 ms of CPU per HTTP request and Cron invocation. Cloudflare notes that
server rendering, authentication, and large payload parsing commonly use
10 to 20 ms. This application performs authenticated dynamic rendering and
database work, so the free CPU cap may terminate some requests. Monitor Worker
CPU and invocation errors before accepting customers. If requests repeatedly
reach the cap, the practical fix is Workers Paid, not a promise that source
optimization can make every dynamic route fit. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Free D1 currently includes 5 million rows read per day, 100,000 rows written
per day, 500 MB per database, and 5 GB of storage across the account. A Worker
invocation can issue at most 50 D1 queries on Free. When a daily read or write
quota is exceeded, D1 rejects queries until midnight UTC. At the account
storage limit, new writes, indexes, or schema changes can fail. The application
can therefore stop handling customer actions before the Worker request limit
is reached. Watch row metrics and storage together. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

R2 Standard currently includes 10 GB-month of storage, 1 million Class A
operations, 10 million Class B operations, and free egress each month.
R2 usage beyond included amounts can be billed, so set usage alerts and keep
large evidence archives out of the bucket unless needed. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

The Worker config persists sampled application logs, redacts query strings,
and disables per-invocation logs and traces to reduce unnecessary telemetry
and avoid logging customer URLs. Cloudflare's published Observability Free
allowance is 0.5 GB of ingestion per day with seven-day retention; ingestion
stops for the day when the allowance is reached. Check current account usage
and pricing in Cloudflare before launch. [Observability pricing](https://developers.cloudflare.com/observability/pricing/)

Vinext is Cloudflare's newer Next.js-compatible runtime path and remains a
fast-moving framework. Keep the app's Node and package versions pinned, review
compatibility changes, and retain a rollback deployment. [Cloudflare Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)

## Cloudflare resource map

| Resource | Binding or name | Purpose |
| --- | --- | --- |
| Worker | `nodezuno-production` | App Router, API routes, auth, and scheduled handler |
| D1 | `nodezuno-production`, binding `DB` | Auth, orders, payments, audit, rate limits, and email outbox |
| R2 Standard | `nodezuno-deliverables`, binding `DELIVERABLES` | Private final reports, evidence archives, and manifests |
| Cron Trigger | `* * * * *` | Claims at most one email outbox item per minute |
| Static assets | Managed by the Cloudflare Vite plugin | Built CSS, JavaScript, fonts, and public assets |

No KV, Durable Objects, Queues, Workers AI, or Workers Analytics Engine binding
is added merely to consume free allocations. The current application has no
correctness need for them. Historical RPC and gRPC schemas remain only in the
immutable D1 migration history; they are not Worker services or customer
features.

## Database and file storage behavior

- `drizzle/` is the ordered SQL migration source. The top-level SQL layout is
  already compatible with Wrangler's D1 migration directory.
- Both local and production configuration use D1 name `nodezuno-production`
  with binding `DB`. Local execution remains local and does not connect to the
  remote production database.
- Production review files are uploaded by an authenticated same-origin `PUT`
  route directly into the private R2 binding. The Worker streams the request
  body, asks R2 to verify the SHA-256 checksum, and keeps only the object
  version and ETag in D1. File size is capped at 90 MiB, below Cloudflare Free's
  100 MB request body limit.
- The R2 bucket must remain private. Do not enable `r2.dev`, a public custom
  domain, or public object access for `DELIVERABLES`. Buyer downloads are
  authorized by the app and streamed through the Worker after integrity checks.
- R2 provides Cloudflare-managed encryption at rest. This configuration does
  not use AWS KMS or claim customer-managed encryption keys. R2's S3-compatible
  API does not support HTML form POST presigned uploads, which is why uploads
  use the Worker binding instead. [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [R2 presigned URL methods](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- D1 and R2 are separate recovery surfaces. D1 Time Travel is always on and
  Workers Free currently retains up to seven days of point-in-time recovery,
  if the database reports the production storage backend. Confirm this with
  `wrangler d1 info nodezuno-production` before relying on it. A restore
  overwrites the database and must be treated as a destructive incident action.
  R2 files are not included in D1 recovery. This repository does not configure
  an R2 backup copy or lifecycle policy, so decide a retention and recovery
  plan before storing paid customer deliverables. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)

## One-time Cloudflare setup

These commands change Cloudflare resources. Run them only after confirming
that Wrangler is authenticated to the intended account and the D1 database
shown in `wrangler.jsonc` is the correct one.

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler r2 bucket create nodezuno-deliverables
```

The production D1 database was previously created as
`nodezuno-production` in APAC. Before applying migrations, confirm in the
Cloudflare dashboard that its ID matches
`b1215845-a19a-4233-80ea-8fb635a046f2`. Applying the project's full migration
history is a remote database write:

```sh
pnpm run db:migrate:cloudflare
```

Do not use `pnpm run db:migrate:local` for production. D1 migrations are
tracked in the `d1_migrations` table. [D1 migration reference](https://developers.cloudflare.com/d1/reference/migrations/)

## Secrets and non-secret Worker variables

Add each secret with Wrangler or the Cloudflare dashboard. Never place secret
values in `wrangler.jsonc`, source control, or a deploy command's arguments.

```sh
pnpm exec wrangler secret put RATE_LIMIT_SECRET
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put REVIEW_CAPABILITY_SECRET
pnpm exec wrangler secret put ZOHO_SMTP_PASSWORD
```

Generate each secret independently. Configure non-secret values in the
Worker's Variables settings or the `vars` section of `wrangler.jsonc`:

- `NODEZUNO_ADMIN_EMAILS`: the real verified administrator email. For this
  deployment, use `info@nodezuno.com`.
- `ZOHO_SMTP_HOST`: the SMTP hostname shown in your Zoho Mail settings. The
  current project value is `smtp.zoho.in`.
- `BETTER_AUTH_URL` and `PUBLIC_ORIGIN`: exact deployed HTTPS origin.
- `NODEZUNO_DOMAIN`: deployed hostname.
- Optional Google OAuth client ID and secret must be configured together.

The production Wrangler profile selects
`NODEZUNO_STABLECOIN_PAYMENT_MODE=disabled`, with
`NODEZUNO_LEGAL_LAUNCH_APPROVED=false` and public indexing off. No payment
instructions are available in this default state. After the owner completes
the release approval, the owner must explicitly set the legal launch flag to
`true` and payment mode to `manual_ethereum`. Both controls are required by the
application before it issues payment instructions. In that mode, checkout
only issues Ethereum Mainnet USDC or USDT instructions. The customer submits
the transaction hash and mandatory Telegram username. Nodezuno receives an
email alert, checks the transaction manually, and contacts the customer. A
submitted hash is not proof of payment and never marks an order paid. A fresh
admin action records the operator's manual check and note in the order and
admin audit trail. If email delivery is not configured, the outbox remains
pending and the order portal still shows the submission.

No payment verifier runs in this Cloudflare profile. The retained automatic
verifier mode is `ethereum_mainnet`; it requires legal approval and independent
RPC sources, and is not enabled by this configuration. Keep automatic checking
off on Free. Do not flip the mode to `ethereum_mainnet` to make the manual flow
work. `disabled` is the emergency switch that stops new payment instructions.
Manual crypto acceptance still requires the owner to confirm the applicable
legal, tax, and customer-disclosure requirements before taking real payments.
Email uses the existing `info@nodezuno.com` mailbox through Zoho SMTP over
implicit TLS on port 465. Keep the Zoho app password only in the Cloudflare
Worker secret store. The Nodezuno sender address is fixed in server code and
cannot be changed to another mailbox. A successful SMTP response means Zoho
accepted the message for processing, not that it reached the recipient's
inbox. There is no provider webhook or automatic delivery tracking. Zoho's
mailbox limits apply independently of Cloudflare Workers Free limits.

## Build and deploy

The production Wrangler configuration attaches only the `nodezuno.com` custom
domain. It disables the public `workers.dev` and preview URLs so authentication
and customer pages have one canonical origin. Cloudflare must already have an
active `nodezuno.com` zone in the intended account. If you use `www`, configure
an explicit redirect to the apex outside this Worker. The custom domain and
configured authentication origin must match.

```sh
pnpm run preflight:cloudflare
pnpm run bootstrap:cloudflare -- --confirm-bootstrap
```

Before this, enable R2, create the private bucket, back up and apply the
reviewed D1 migrations, and commit the release source. The bootstrap command
builds and validates the Worker, then uploads it with no public route and no
scheduled job. Use Cloudflare's protected secret settings to add the required
Worker secrets and set the admin email and Zoho SMTP host variable. Store the
Zoho app password only as `ZOHO_SMTP_PASSWORD`. The guarded production deploy
runs only after the account preflight
passes and the dashboard configuration and green CI are acknowledged:

```sh
pnpm run preflight:cloudflare
pnpm run deploy:cloudflare -- --confirm-production --acknowledge-dashboard-config
```

See [Cloudflare production release gates](CLOUDFLARE_PRODUCTION_RELEASE.md)
for the backup, migration, secret, rollback, and post-deployment procedures.

After deployment, verify the Worker has the `DB` and `DELIVERABLES` bindings,
and inspect `/api/v1/ready` and `/api/v1/live`. Readiness remains false until
the account secrets, real admin allowlist, email delivery configuration, and
both Cloudflare storage bindings are present.

## Local preview

Local preview uses local D1 and R2 emulation with the same binding names. It
does not need a Cloudflare account and must not use Wrangler's remote-binding
mode.

```sh
pnpm run db:migrate:local
pnpm run dev
```

Open `http://localhost:3000`. Local database state lives under the ignored
`.wrangler/state/` directory. Do not copy the production database ID into a
remote-dev flag.

## Operational guardrails

1. Inspect D1 rows-read and rows-written before and after launch traffic.
2. Watch Worker CPU time, error 1102, request volume, and Cron invocation
   failures. A free-tier CPU breach is an outage for that invocation.
3. Watch R2 storage and operation use. The 90 MiB per-file cap does not cap
   total retained storage.
4. Keep the `DELIVERABLES` bucket private and audit administrator access.
5. Keep automatic payment verification and public indexing disabled. Keep
   manual payment intake enabled only after the legal and seller disclosures
   have been reviewed. Set payment mode to `disabled` to stop new instructions.
6. Use Workers Paid or another reviewed runtime if dynamic rendering or
   customer traffic repeatedly exceeds the Free CPU or daily quota limits.

The goal is to stay within included usage, not to consume every available
Cloudflare product quota. Adding KV, Queues, Durable Objects, or Workers AI
without a concrete feature would add operational surface without helping this
application.

Cloudflare free resources do not mean unlimited capacity, a service-level
agreement, zero operational cost, or production readiness by themselves.
