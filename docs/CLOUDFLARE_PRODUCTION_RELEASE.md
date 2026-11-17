# Cloudflare production release gates

This is the release checklist for the Cloudflare Worker, D1, and private R2
profile. A successful build or Wrangler dry-run is not proof of a live,
customer-ready service. This guide does not deploy or change Cloudflare
resources.

## Current deployment gate

The repository now uses guarded deployment commands instead of a direct
framework deploy. `pnpm run preflight:cloudflare` performs read-only checks.
The first deployment is split into a Worker bootstrap with no public route,
secret configuration, and the final production release. The guard verifies the
source is a reviewed clean commit, builds the exact Cloudflare artifact, scans
it for local secrets, runs lint and type checks, and runs Wrangler's dry-run.
It does not run the automated test suite locally. CI must be green before the
production command is acknowledged.

The last account preflight observed on November 17, 2026 was blocked: the
configured D1 database existed but the repository migrations were pending;
R2 setup and the production Worker were not yet confirmed. These are remote
account prerequisites, not code errors. Re-run the read-only preflight because
account state may have changed since that check.

```sh
pnpm run preflight:cloudflare
```

## Current safe defaults

The production Wrangler profile is configured for the `nodezuno.com` custom
domain only. The public `workers.dev` and preview URLs are disabled. Public
search indexing and crypto checkout are disabled. Payment instructions remain
unavailable until the owner explicitly approves the launch gate and changes
payment mode to `manual_ethereum`. The application requires both settings.
Automatic Ethereum payment verification remains off.

The Cloudflare Free plan is a low-cost, low-traffic starting point, not an SLA
or production-scale promise. Workers Free allows 100,000 requests per day and
10 ms of CPU per HTTP request and Cron invocation. Dynamic rendering and
authentication may exceed that CPU ceiling. D1 quotas, R2 storage and
operations, and the one-email-per-minute Cron are additional capacity limits.
Watch the account dashboards and be prepared to disable checkout or move to a
paid runtime before limits become customer-impacting. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## 1. Release source

Release one reviewed commit. Do not deploy the current uncommitted working
tree. Keep secrets, `.dev.vars`, local databases, generated build output, and
customer data out of source archives.

```sh
git status --short
git diff --check
git rev-parse --verify HEAD
pnpm run release:source:verify
pnpm install --frozen-lockfile
pnpm audit --prod --audit-level=moderate
pnpm run lint
pnpm exec tsc --noEmit --incremental false
pnpm run db:migrate:local
pnpm test
pnpm run verify:cloudflare-artifact
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

The GitHub release workflow performs the same source, dependency, type,
migration, build, and customer-flow checks, then validates the generated
Cloudflare artifact secret scan and a Wrangler dry-run. Treat a failed step as
a release blocker. A dry-run does not contact production D1/R2 or deploy code.

## 2. Cloudflare account and bindings

Before running a command that changes Cloudflare state:

1. Sign in to the intended Cloudflare account and verify the account identity
   with `pnpm exec wrangler whoami`.
2. Confirm `nodezuno.com` is an active zone in that account. The configured
   Worker custom domain requires the zone to be active.
3. Confirm the D1 database name and ID in `wrangler.jsonc` match the intended
   production database. Do not create or migrate a replacement database by
   guessing.
4. Enable R2 for the account and create or verify the
   `nodezuno-deliverables` R2 bucket. Keep it private.
   Do not enable `r2.dev`, a public custom domain, or public object access.
5. Confirm the Worker has exactly the expected `DB` and `DELIVERABLES`
   bindings and one-minute Cron trigger.

The config attaches only the apex domain. If `www.nodezuno.com` is used,
configure and verify an explicit redirect to the apex. Do not expose a second
authentication origin.

## 3. Secrets, authentication, and email

Set values through the Cloudflare dashboard's protected secret interface or
Wrangler's interactive `secret put` command. Never put secret values in
`wrangler.jsonc`, command arguments, GitHub logs, screenshots, or this record.
Generate these four independent values separately:

```text
RATE_LIMIT_SECRET
API_KEY_PEPPER
BETTER_AUTH_SECRET
REVIEW_CAPABILITY_SECRET
```

Set `NODEZUNO_ADMIN_EMAILS` to `info@nodezuno.com`, set the non-secret
`ZOHO_SMTP_HOST` variable to the exact host shown in Zoho Mail settings, and
add `ZOHO_SMTP_PASSWORD` as a protected Worker secret. Use a Zoho app-specific
password if the mailbox has multi-factor authentication. The code fixes both
the sender and Nodezuno operator-notification recipient to
`info@nodezuno.com`. There is no mail webhook or claim of inbox-delivery
confirmation. Zoho's SMTP acceptance is the strongest delivery state the
application records. After deployment, verify account signup,
verification, password reset, administrator login, and a controlled email
receipt in the actual Zoho mailbox. Configure Google OAuth only if both
Google credentials are set and callback URLs match the canonical origin. Keep
public indexing off until content and launch approval are complete.

Readiness must fail when required secrets, origins, admin identity, email
configuration, D1, or R2 are missing. Never weaken readiness to make the
deployment appear healthy.

## 4. Data safety and migrations

Before the first production migration and before every later migration:

1. Inspect the exact SQL diff and confirm it is additive and compatible with
   the currently deployed application.
2. Verify the target account, D1 ID, and current remote migration head.
3. Create a private D1 export outside the repository, encrypt it, restrict file
   permissions, and retain it according to the approved data policy. Example:

   ```sh
   pnpm exec wrangler d1 export nodezuno-production --remote \
     --output /secure/nodezuno-pre-release.sql --config wrangler.jsonc
   chmod 600 /secure/nodezuno-pre-release.sql
   ```

   The SQL export contains personal and commercial records. Never attach it
   here or commit it.
4. Confirm D1 Time Travel is available for this database and record its
   retention window. Cloudflare Free currently lists seven days. A restore
   overwrites current database state, so only the incident owner may approve
   and perform one. Time Travel is not a substitute for a separately retained
   export. [D1 limits and Time Travel](https://developers.cloudflare.com/d1/platform/limits/)
5. Apply migrations as a separate reviewed change with
   `pnpm run db:migrate:cloudflare`. Do not assume Worker deployment applies
   migrations.
6. Before storing customer deliverables, decide the retention and deletion
   period and establish an independent R2 recovery copy with a tested restore
   procedure. This repository does not configure R2 backup or lifecycle
   policies.

Do not roll the database backward to roll back application code. Deploy the
last known-good Worker version only when its schema remains compatible. Use a
forward corrective migration for data or schema fixes.

## 5. Deployment and external verification

After the source, legal, identity, data, email, and binding gates pass, create
the Worker without exposing the production route, configure its secrets, and
then publish the production route:

```sh
pnpm run bootstrap:cloudflare -- --confirm-bootstrap
pnpm run preflight:cloudflare
pnpm run deploy:cloudflare -- --confirm-production --acknowledge-dashboard-config
```

The bootstrap uploads the Worker without `workers.dev`, preview URLs, a
custom-domain route, or scheduled jobs. It does not apply D1 migrations,
create the R2 bucket, or set secrets. The guarded production deploy publishes Worker code and static
assets only after the remote D1 migrations, R2 binding, and required secret
names are present. The dashboard acknowledgement is also confirmation that the
admin allowlist, sender and operations email addresses, and webhook settings
were checked and the release CI is green. Neither command approves payments.
Verify the active Worker version and the custom domain in the Cloudflare
dashboard. From a network outside the browser's machine, check:

```text
https://nodezuno.com/
https://nodezuno.com/api/v1/live
https://nodezuno.com/api/v1/ready
https://nodezuno.com/api/v1/health
```

Also verify TLS, canonical redirects, noindex behavior while indexing is off,
authentication, customer order creation, email delivery, admin denial for a
non-allowlisted account, private R2 upload/download authorization, and the
scheduled outbox. Keep payment mode `disabled` during this smoke check. Never
send real funds to test checkout. After approval, manually enable
`NODEZUNO_LEGAL_LAUNCH_APPROVED=true` and
`NODEZUNO_STABLECOIN_PAYMENT_MODE=manual_ethereum`, then recheck readiness and
the exact payment instructions without submitting a real transfer.

Use Cloudflare deployment history for rollback and record the exact deployed
version. Confirm public health again after rollback. Rollback does not reverse
migrations or recover R2 objects.

## 6. Operations and incident readiness

The Worker persists sampled application logs, redacts query strings, and does
not persist per-invocation logs or traces. Keep logs free of request bodies,
credentials, wallet recovery data, transaction claims, customer email, and
private review content. The current Wrangler sampling rate is 10 percent.
Cloudflare's published Free Observability allowance is 0.5 GB of ingestion per
day and seven-day retention; when the daily allowance is reached, new data is
not ingested until reset. The published pricing takes effect on December 1,
2026, so verify account usage and billing behavior before then and after any
plan change. [Observability pricing](https://developers.cloudflare.com/observability/pricing/)

At least daily during launch, inspect Worker requests, CPU, error 1102, D1
rows read/written and database size, R2 storage and operation use, Cron runs,
and notification outbox backlog/age. One Cron execution processes at most one
email, about 1,440 per day if every scheduled run succeeds. D1 Free limits
include 500 MB per database, 5 GB of account storage, 5 million rows read per
day, 100,000 rows written per day, and 50 D1 queries per Worker invocation.
R2 Standard has its own included storage and operation quotas. Review current
limits in the Cloudflare dashboard before launch. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Before launch, record who receives operational alerts and how that person will
respond to a failed login flow, Worker CPU exhaustion, database quota, email
delivery delay, suspected data exposure, bad deployment, or payment dispute.
If there is no external monitor or alert path, mark it `BLOCKED`, not passed.

## 7. Release record

Keep one private, secret-free record for each deployment:

```text
Commit SHA and reviewer:
CI run and all release checks:
Cloudflare account and zone checked:
Worker version and deployment time (UTC):
D1 database ID, migration head, export location, and recovery check:
R2 private-access and recovery check:
Origin, TLS, external health, and canonical redirect result:
Authentication, admin denial, and email receipt result:
Payment mode and launch approval state:
Free-plan limits reviewed and operational alert owner:
Rollback version and incident contact:
Known limitations and decision owner:
```

Never store secret values, customer contents, transaction hashes, wallet
recovery material, or a raw database export in this record.
