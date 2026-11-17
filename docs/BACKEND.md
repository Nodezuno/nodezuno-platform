# Backend architecture

## Current deployment

The current low-cost deployment profile is a Vinext application running as a
Cloudflare Worker with static assets, a D1 database binding named `DB`, and a
private R2 bucket binding named `DELIVERABLES`. The scheduled Worker pass
processes the durable notification outbox. Customer email is sent through
Zoho SMTP using the configured `info@nodezuno.com` mailbox.

```text
Browser
  -> Cloudflare Worker and static assets
       -> D1: accounts, submissions, review orders, payments, status, outbox
       -> private R2: finalized review deliverables
       -> Zoho SMTP: account and service notifications
  -> Cloudflare Cron: bounded outbox processing
```

This is a low-traffic starting profile, not a high-availability or production-
scale guarantee. The Worker, D1, R2, email provider, and DNS have independent
limits and failure modes. See [CLOUDFLARE_FREE_TIER.md](CLOUDFLARE_FREE_TIER.md)
and [CLOUDFLARE_PRODUCTION_RELEASE.md](CLOUDFLARE_PRODUCTION_RELEASE.md).

## Application responsibilities

- Public pages explain the fixed-scope smart-contract and protocol release
  review service.
- First-party forms create contact submissions and review orders.
- Better Auth manages configured email, Google, EVM-wallet, and Solana-wallet
  authentication and database-backed sessions.
- The customer portal displays order state, payment instructions when enabled,
  payment claims, confirmations, and finalized deliverables.
- Manual payment reconciliation is an administrator action. A submitted
  transaction hash alone never advances an order.
- Final deliverables are kept in private R2 and streamed through an
  order-authorized application route.
- Newsletter confirmation, account messages, and order lifecycle messages are
  queued in D1 before Zoho SMTP delivery.
- Restricted administration manages submissions, orders, status, chains,
  reconciliation, deliverables, and bounded maintenance.

## Runtime boundaries

- Secrets are managed in the deployment platform, not committed to Git.
- `RATE_LIMIT_SECRET`, `BETTER_AUTH_SECRET`, and
  `REVIEW_CAPABILITY_SECRET` are independent secrets. Container deployments
  may additionally require an ingress secret.
- `NODEZUNO_ADMIN_EMAILS` is an allowlist, not a secret.
- The Cloudflare profile binds only the configured D1 database and private R2
  bucket. It has no customer RPC endpoint, node runtime, explorer service, or
  developer workspace API.
- Payment-specific Ethereum RPC configuration belongs only to the optional
  payment verifier in non-Cloudflare runtime profiles. It is not an RPC service
  for customers. Cloudflare checkout is disabled by default and automatic
  verification remains off.
- Zoho SMTP acceptance means the provider accepted a message for processing;
  it does not prove inbox delivery.
- No application setting, source file, successful build, or status response
  proves that external DNS, legal readiness, email deliverability, backup
  restoration, or monitoring has been independently verified.

## Data and migration boundaries

D1 migrations in `drizzle/` are ordered, immutable history. They contain
schemas created by earlier product directions. The current application routes
and service code no longer expose those products. Do not remove, rewrite, or
replay an applied migration as part of this source cleanup. This cleanup does
not drop tables or customer data. See [MIGRATIONS.md](MIGRATIONS.md).

## Source map

| Area | Location |
| --- | --- |
| Pages and API handlers | `app/` |
| Customer and admin interfaces | `components/` |
| Shared application logic | `lib/` |
| Account and order persistence | `lib/server/`, `db/schema.ts` |
| Ordered SQL history | `drizzle/` |
| Cloudflare bindings and routes | `wrangler.jsonc`, `worker/` |
| Release checks and bounded workers | `scripts/` |
| Deployment guidance | `docs/CLOUDFLARE_FREE_TIER.md`, `docs/CLOUDFLARE_PRODUCTION_RELEASE.md` |
