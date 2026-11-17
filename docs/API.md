# Nodezuno website API

This is the first-party API used by the Nodezuno website, customer portal, and
restricted administration interface. It is not an API product for customers
to provision RPC endpoints, blockchain nodes, explorers, or developer
workspaces. There is no public OpenAPI route.

## Public website routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/live` | Process liveness |
| GET | `/api/v1/ready` | Deployment configuration and dependency readiness |
| GET | `/api/v1/health` | Health summary |
| GET | `/api/v1/status` | Website service status and incidents |
| GET | `/api/v1/chains` | Chain choices for review intake, not node or RPC availability |
| GET | `/api/v1/auth/providers` | Auth methods enabled by deployment configuration |
| GET | `/api/v1/auth/session` | Current first-party account session |
| GET | `/api/v1/abuse-challenge` | Short-lived form-abuse challenge |
| POST | `/api/v1/submissions` | General, press, career, or security contact form |
| POST | `/api/v1/review-orders` | Create a bounded release-review order |
| POST | `/api/v1/newsletter/subscriptions` | Request newsletter subscription |
| POST | `/api/v1/newsletter/confirm` | Confirm an email subscription |
| POST | `/api/v1/newsletter/unsubscribe` | Unsubscribe using a private token |
| POST | `/api/v1/account/export` | Export the authenticated account's data |

Better Auth handles account and session operations under `/api/auth/*`.
Enabled email, Google, EVM-wallet, and Solana-wallet methods depend on runtime
configuration and browser wallet availability.

## Private customer portal

| Method | Route | Boundary |
| --- | --- | --- |
| POST | `/api/v1/review-orders/{id}/access` | Exchange the order's private access credential |
| GET | `/api/v1/review-orders/{id}` | Read that order using its authorized capability |
| POST | `/api/v1/review-orders/{id}/payment-intents` | Request a server-generated instruction when launch/payment gates allow it |
| POST | `/api/v1/review-orders/{id}/payment-intents/{intentId}/claims` | Submit a transaction hash and required Telegram username |
| GET | `/api/v1/review-orders/{id}/payment-confirmations/{confirmationId}` | Download an authorized payment confirmation |
| GET | `/api/v1/review-orders/{id}/deliverables/{deliverableId}/download` | Stream an authorized private deliverable |

Payment mode is disabled in the checked-in Cloudflare profile. If the owner
approves launch and explicitly enables manual Ethereum payment mode, the
customer can submit a transaction hash for USDC or USDT on Ethereum Mainnet.
A submitted hash is a claim, not proof of receipt. An operator must inspect the
transfer and record the manual reconciliation before payment is confirmed.
Automatic payment verification is off in the Cloudflare profile.

## Restricted administration

All `/api/v1/admin/*` routes require a fresh authenticated administrator
identity that matches the server-side allowlist. The active endpoints support
review-order and submission queues, manual payment reconciliation, status and
chain catalog updates, deliverable upload/finalization, and bounded database
maintenance. Administrative controls are not public customer APIs.

## Request and security expectations

- Use the canonical HTTPS origin in production.
- Mutating browser requests are subject to the route's origin, session,
  challenge, idempotency, rate-limit, and authorization controls.
- Do not place credentials, private source, seed phrases, signing keys, or
  confidential review artifacts in public forms.
- Keep order-access links private. Do not put them in issue trackers, public
  chat, or analytics.
- Store no customer secret in client-side configuration or request URLs.
- Responses and error shapes are defined by the individual route. Clients
  should handle non-2xx responses without assuming a particular provider error
  message.

## Source boundary

Routes live in `app/api/v1/`; Better Auth handlers live in
`app/api/auth/`; shared request and identity logic lives in `lib/` and
`lib/server/`. Retired RPC, gRPC, node, explorer, and developer-workspace
routes have been removed. Historical D1 migrations are retained unchanged;
they are not an active API contract.
