# Nodezuno

Nodezuno reviews planned upgrades to already-audited or reviewed blockchain
protocols. The customer receives a change report, reproducible evidence, and a
human-signed Proceed, Remediate, or Hold recommendation for one exact release.

One bounded EVM or supported non-EVM review costs **USD 7,500**:
USD 3,750 scheduling deposit and USD 3,750 final balance. The standard EVM
target is five business days after the deposit and required files are ready.
Non-EVM completion estimates are confirmed at kickoff.

This is not a full protocol audit, security guarantee, custody service, or
deployment service. AI can assist the reviewer; it cannot approve a release.

## Start here

- [Documentation map](docs/README.md)
- [Cloudflare Free-Tier deployment profile](docs/CLOUDFLARE_FREE_TIER.md)
- [Cloudflare production release gates and evidence](docs/CLOUDFLARE_PRODUCTION_RELEASE.md)
- [Current scope, pricing, and direct-order process](docs/product/SCOPE_AND_PRICING.md)
- [API audiences](docs/api/README.md)
- [Payment operations and state](docs/payments/STATE_MACHINE.md)
- [Git and GitHub workflow](docs/GIT_WORKFLOW.md)

## Repository map

| Directory | Responsibility |
| --- | --- |
| `app/` | Next.js pages, API routes, metadata, and HTTP entry points |
| `components/` | Website, order form, private portal, and administration UI |
| `lib/review-policy.ts` | Shared current price, scope limits, and offer labels |
| `lib/client/` | Browser API and abuse-challenge helpers |
| `lib/api/` | Shared first-party website API contracts |
| `lib/server/` | Identity, review commerce, payment verification, storage, and delivery |
| `drizzle/` | Ordered immutable SQL migrations and historical generation metadata |
| `scripts/` | Migrations, preflight, workers, source export, and release checks |
| `wrangler.jsonc` | Cloudflare Worker, D1, R2, and production route configuration |
| `deploy/` | Alternate Docker, AWS, Kubernetes, and local macOS profiles retained for reference |
| `docs/` | Current guides, runbooks, and clearly marked historical references |
| `tests/` | Existing release regression coverage |

## Customer workflow

The intended customer flow creates a fixed service order without manual
proposal approval. Cloudflare production defaults keep payment instructions
disabled until the owner completes launch approval and explicitly enables the
manual mode. Once enabled, the customer sends the exact Ethereum Mainnet USDC
or USDT amount, then submits the transaction hash and mandatory Telegram
username. Nodezuno checks the transfer manually and follows up. Submitting a
hash does not confirm that funds arrived. An operator must inspect the transfer
and record a reasoned manual check before the order advances. Automatic payment
verification is off.

The recipient wallet's private key is never stored by the website. Refunds
are reviewed external operations, not automated transfers. Restricted inputs
use an approved private channel. Final deliverables use a private Cloudflare
R2 bucket and app-authorized, checksum-verified downloads. R2 uses
Cloudflare-managed encryption at rest and does not use an AWS KMS key.

## Development and build

Use the pinned Node.js 24.14.0 and pnpm 11.9.0 toolchain used by CI and Docker.
The repository's `.nvmrc` selects the Node.js version for local work.

```sh
pnpm install --frozen-lockfile
cp .env.example .dev.vars
pnpm run db:migrate:local
pnpm run dev
```

Use only an ignored local environment file. Set independent secret values and
the documented loopback origins before local preview. The native macOS
production-style installation is separate from this development server; follow
its runbook rather than starting a second writer on its database.

```sh
pnpm exec tsc --noEmit --incremental false
pnpm run lint
pnpm run build:cloudflare
```

The existing automated release suites remain in CI. Build success alone is not
evidence of complete payment, email, recovery, or production operations.

## Production boundary

The current target is Cloudflare Workers, D1, and private R2 at low initial
cost. It is deliberately subject to free-plan request, CPU, database, and
storage limits, and is **not a production-scale guarantee**. The legacy AWS
profile remains documented as an alternative. Do not add replicas before a
reviewed database migration.

System emails use Zoho SMTP from `info@nodezuno.com`. Customer and operator
messages that Nodezuno sends are separate from the manual replies Sanjay sends
from that inbox. SMTP acceptance is not proof that an email reached its inbox.
Payments require approved launch configuration, monitored manual handling, and
reviewed wallet operations. The Cloudflare profile does not run a
payment-verification worker. Keep public indexing disabled until its release
gates are satisfied. Manual crypto payment intake does not replace legal, tax,
or customer-disclosure review.

The seller is Sanjay Sudagani, sole proprietor trading as Nodezuno. Approved
legal documents, tax/invoicing treatment, cross-border payment review, recovery,
alerts, external TLS, and actual email delivery require owner/operator evidence.
See [the Cloudflare release guide](docs/CLOUDFLARE_PRODUCTION_RELEASE.md) and
[the legacy AWS evidence record](docs/PRODUCTION_RELEASE_EVIDENCE.md).

## Git and release source

Git is the source record. Review and release a specific clean commit, not a
copy of the working directory. Keep `.dev.vars`, `.wrangler/`, databases,
`node_modules/`, generated output, and local node data outside source control.
See the [Git and GitHub workflow](docs/GIT_WORKFLOW.md) and
[production release procedure](docs/RELEASE.md) before creating a release.

The retired RPC, gRPC, node-runner, explorer, and developer-workspace product
implementations have been removed from the current application. Ordered D1
migrations remain unchanged for compatibility with databases created by earlier
releases; this cleanup does not delete migration history, production tables, or
customer data. Superseded strategy documents are identified in the
[documentation map](docs/README.md).
