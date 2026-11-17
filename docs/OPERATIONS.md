# Nodezuno operations

This runbook describes the current website and private customer portal on
Cloudflare Workers, D1, and private R2. It does not describe or activate the
retired RPC, node, explorer, gRPC, or developer-workspace products.

## Service boundaries

- Public pages and first-party forms run through the Cloudflare Worker.
- D1 stores accounts, contact submissions, review orders, payment state,
  status content, notifications, and administrative history.
- Private R2 stores finalized deliverables. The Worker authorizes downloads.
- Zoho SMTP sends account, contact, newsletter, and order notifications.
- The scheduled Worker processes a bounded amount of outbox work per pass.
- Manual Ethereum stablecoin payment handling is disabled by default. When
  explicitly approved and enabled, the customer submits a transaction hash,
  and an operator checks the transfer before recording a decision.
- The codebase contains no customer-facing RPC endpoint or blockchain-node
  runtime.

See [Cloudflare Free Tier](CLOUDFLARE_FREE_TIER.md) for resource limits and
[Cloudflare production release gates](CLOUDFLARE_PRODUCTION_RELEASE.md) for
deployment prerequisites.

## Routine checks

Use the canonical project folder and reviewed source revision. For read-only
status checks:

```sh
git status --short
pnpm run preflight:cloudflare
pnpm exec wrangler whoami
pnpm exec wrangler deployments list --name nodezuno-production
```

In Cloudflare, inspect:

- Worker request count, CPU use, exceptions, and 1102 responses;
- D1 storage, rows read/written, migration head, and query failures;
- private R2 object count, storage, operation use, and unexpected growth;
- scheduled event runs and notification backlog/age;
- Worker bindings, custom domain, release version, and secrets configuration.

The presence of a deployment in the dashboard does not prove end-to-end
customer readiness. Check the public health endpoints from outside the local
development environment:

```text
https://nodezuno.com/api/v1/live
https://nodezuno.com/api/v1/ready
https://nodezuno.com/api/v1/health
https://nodezuno.com/api/v1/status
```

Do not publish a green operational status unless the underlying component is
deployed, monitored, and supported by current evidence.

## Customer and payment operations

- Contact and review-order submissions appear in the restricted admin area.
- Review orders are created from the fixed scope. Contact intake is not a
  customer acceptance or a payment receipt.
- Never treat an entered transaction hash, screenshot, or block-explorer page
  as proof by itself. Confirm the Ethereum Mainnet token, recipient, exact
  amount, success, and finality, then record the manual decision.
- Never request a seed phrase, private key, transaction signature, or wallet
  approval.
- Do not ask a customer to resend while a transfer is unresolved. Handle any
  duplicate, wrong-network, wrong-token, late, or mismatched transfer as an
  operator case.
- Start work only after required payment, materials, scope, conflicts, reviewer
  capacity, and schedule are confirmed.
- Upload final deliverables to the authorized order. Finalize them only after
  integrity and content review.

## Email operations

Zoho SMTP credentials are stored as platform secrets. The sender is
`info@nodezuno.com`. A provider acceptance record is not proof of inbox
delivery; inspect the actual mailbox during launch checks. Investigate stale
outbox leases, repeated failures, and growing queue age without copying message
bodies or private links into tickets or logs.

## Change and recovery boundaries

Apply only the reviewed D1 migrations from the deployed commit. Keep migration
files immutable. A Worker rollback does not roll back D1 or restore deleted R2
objects. Follow [MIGRATIONS.md](MIGRATIONS.md) and
[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) before any restore or destructive
operation.

Do not alter production secrets, migrations, payment enablement, public
indexing, custom-domain configuration, D1 data, or R2 objects as part of a
routine website copy update.
