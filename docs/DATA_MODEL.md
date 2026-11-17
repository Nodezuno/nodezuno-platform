# Current application data model

The live application stores website accounts, service inquiries, release-review
orders, payment claims and confirmations, notification state, status content,
and private deliverable metadata. The authoritative database change history is
the ordered SQL sequence in `drizzle/`; never edit an applied migration.

## Active data domains

| Domain | Representative tables | Contents |
| --- | --- | --- |
| Accounts | `auth_users`, `auth_accounts`, `auth_sessions`, `auth_verifications`, `auth_wallet_addresses`, `auth_solana_wallets`, `auth_rate_limits` | Account profile, provider identity, wallet public addresses, authentication challenges, and sessions |
| Contact intake | `submissions`, `submission_events` | Submitted contact details, consent version, workflow status, and administrative history |
| Release-review commerce | `review_orders`, `review_order_events` | Fixed-scope order, accepted terms, workflow, and audit history |
| Payment claims | `review_stablecoin_payment_intents`, `review_stablecoin_payment_claims`, `review_stablecoin_reconciliation_cases`, `review_stablecoin_payment_confirmations`, `payment_verifier_health` | Payment instruction, customer-submitted transaction claim, operator decision, confirmation, and optional verifier health |
| Deliverables | `review_deliverables` | Private R2 object identity, version, size, and integrity metadata |
| Notifications | `notification_outbox` | Durable message payload, retry state, provider acceptance, and delivery state |
| Newsletter | `newsletter_subscriptions` | Double-opt-in state and unsubscribe token verifier |
| Public status and catalog | `status_services`, `status_incidents`, `status_incident_updates`, `chains` | Website status, incident updates, and chain choices for intake |
| Abuse and administration | `rate_limit_windows`, `admin_audit_events` | Request-abuse windows and restricted administrative actions |

Exact fields, constraints, indexes, and migration order are defined by
`db/schema.ts` for the current application model and the SQL files under
`drizzle/` for the deployed migration history.

## Data boundaries

- Passwords and OAuth tokens use the authentication library's storage and
  encryption behavior.
- Wallet sign-in stores public wallet addresses and challenge/session data.
  Nodezuno does not request seed phrases or wallet private keys.
- Payment addresses, selected token, exact requested amount, transaction hash,
  Telegram username, and manual decision evidence are commercial records.
  Transaction hashes and token transfers are public chain data.
- Customer payment remains manual in the Cloudflare profile after an explicit
  launch approval. A hash alone is never payment proof.
- Final report files are stored in private R2. D1 stores metadata, not the
  deliverable bytes. The app checks order access before streaming a download.
- The notification outbox can contain personal message data and private links.
  Treat it as sensitive application data.
- Public contact forms do not accept confidential source code or payment
  credentials.

## Migration history and retired schemas

Earlier ordered migrations created RPC, gRPC, developer-workspace, and related
tables. Those migration files remain so previously initialized databases keep
their verifiable migration history and can follow the same ordered sequence.
Their presence in SQL history is not an active product, API, or deployed
infrastructure claim. The current application code no longer provides those
product services.

This source cleanup does not remove legacy tables or rows from D1 and does not
delete customer data. Removing historical tables would require a separate
reviewed migration with a verified recovery point and a deliberate data-
retention decision. Do not manually drop those tables or change applied SQL.

## Retention and recovery

Use the current [migration policy](MIGRATIONS.md), [Cloudflare deployment
profile](CLOUDFLARE_FREE_TIER.md), and [disaster recovery
guide](DISASTER_RECOVERY.md) before changing retention, database schema, or R2
objects. Application source alone does not establish that a backup exists or
has been restored successfully.
