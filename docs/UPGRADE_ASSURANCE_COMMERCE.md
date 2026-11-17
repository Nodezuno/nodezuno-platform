# Upgrade Assurance buyer and payment operations

This document defines the operating workflow for selling Nodezuno Upgrade
Assurance. It covers direct service-order creation, terms acceptance, direct
stablecoin settlement, delivery state, final balance, evidence, and refunds. It does not
replace a counsel-approved services agreement, statement of work, privacy
notice, refund policy, invoice, or tax and foreign-exchange analysis.

The Cloudflare production defaults keep payment instructions disabled. After
launch approval and explicit activation of manual mode, the application does not run the
automatic verifier. A customer submits the transaction hash and mandatory
Telegram username; Sanjay inspects the transfer and contacts the customer. A
submitted hash or operator note is not automatic or cryptographic payment
verification. Complete the release gates in
`CLOUDFLARE_PRODUCTION_RELEASE.md` before accepting real funds.

The seller is **Sanjay Sudagani, sole proprietor trading as Nodezuno**.
Nodezuno is a trade name and is not represented in this repository as an
incorporated company.

## Commercial model

The fixed commerce flow applies to every supported EVM or non-EVM review
submitted through the canonical target catalog and mechanical scope limits.
A valid submission automatically creates version 1 of the fixed service order.
No administrator approval is required before the buyer accepts the terms or
opens a payment instruction. An unrecognized target or an order outside the
published form limits fails validation and cannot receive a service order or
payment instruction.

Every review has a fixed USD 7,500 price.
The accepted service order divides that obligation into:

- USD 3,750 scheduling deposit; and
- USD 3,750 final balance before release of the final report.

The private buyer portal accepts direct settlement in official USDC or USDT on
Ethereum Mainnet only. There is no card processor, hosted payment checkout,
wallet connection, token approval, or subscription. The buyer sends the exact
token amount issued by the server, then submits the Ethereum transaction hash
and a mandatory Telegram username.

A submitted form creates a service order but does not by itself reserve work or
prove payment. In Cloudflare manual mode, the order advances after Sanjay
checks the official token, successful Ethereum Mainnet transaction, recipient,
and exact amount, then records the manual check. A submitted transaction hash
is not payment proof. Missing private artifacts can pause the work after
payment, but they do not create a pre-payment sales-approval gate.

The standard EVM five-business-day target starts after Nodezuno records that the agreed
scope, artifacts, access, release candidate, and scheduling payment are ready.
Non-EVM completion estimates are confirmed during kickoff after the required
materials are available. Both tracks use the same published size limits and price.

## Buyer journey

1. The buyer opens `/review/start` and submits non-confidential order details
   within the published fixed-scope limits.
2. The server validates the exact fields, enforces same-origin and abuse
   controls, persists the order with version 1 of the fixed service order, and
   returns a human-readable reference plus a private checkout link.
3. The private capability is supplied in the URL fragment. The server stores
   only its purpose-separated HMAC and exchanges the capability for a scoped,
   HttpOnly order cookie.
4. The buyer reviews the generated fixed scope, price, exclusions, reviewer,
   expiry, and service terms. The buyer accepts the exact service-order version
   and chooses USDC or USDT.
5. The server records the accepted terms and service-order version while
   creating or reusing the currently due payment instruction.
6. The payment instruction fixes the currently due phase, chain, official
   token contract, recipient, obligation, unique exact token amount,
   service-order version, and expiry.
7. The buyer sends that exact amount on Ethereum Mainnet. The buyer pays gas
   separately in ETH and must not subtract gas from the token amount.
8. The buyer submits the full transaction hash and a mandatory Telegram
   username. Telegram is a follow-up contact, not payment evidence.
9. In the Cloudflare profile, the automatic payment worker does not run. Sanjay
   checks the official token, transaction success, recipient, and exact amount
   on Ethereum Mainnet. Etherscan is a public viewer, not a payment authority.
10. The portal shows that submitted transaction details are awaiting a manual
    check. The buyer must not send a second transfer while a claim is active.
11. After checking the transfer, Sanjay records the decision and note through
    the restricted admin order. This advances the service-order state and queues
    a buyer email, but does not create a cryptographic payment-confirmation
    receipt. Work still waits for complete materials, confirmed scope, and
    agreed reviewer availability. The separate automatic mode has its own
    finalized-evidence confirmation flow and is not enabled in Cloudflare.
12. An administrator uploads the final report, optional evidence archive, and
    manifest through the sealed private-storage workflow. In the Cloudflare
    profile, the Worker streams files to private R2 and verifies checksum,
    metadata, and object-version identity. The alternate AWS profile uses S3
    and KMS.
13. Completion releases the verified deliverables on the private page and
    queues an evidence-package email. Each download is authorized for the exact
    order and checked against the stored object version. The Cloudflare Worker
    streams the private R2 object and never exposes its storage URL.

An administrator can exceptionally reissue an expired, unaccepted service
order as a new version. A buyer can also submit a new current order. After a
scheduling deposit accepts a service-order version, its final balance remains
tied to that accepted version.

Legacy requests are converted only when their recorded scope is complete and
within the same limits as the current form. Migration 0027 corrects unaccepted
auto-converted requests that had missing or oversized scope and no payment
instruction. Those customers see a direct link to complete a new form, not an
administrator-approval queue. Accepted terms and existing payment instructions
are preserved.

Payment-confirmation notifications pin the immutable confirmation ID in the
sealed outbox payload. Delivery hydration must find that exact receipt for the
same order and payment kind. It never substitutes a newer receipt or sends a
generic paid message when evidence is missing. Legacy payloads without a
confirmation ID are sent only when exactly one matching receipt exists.

## Payment boundary

Only these assets are accepted:

| Asset | Network | Chain ID | Official contract | Decimals |
| --- | --- | ---: | --- | ---: |
| USDC | Ethereum Mainnet | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| USDT | Ethereum Mainnet | 1 | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |

The recipient is fixed in server code and returned only inside an authorized
payment instruction. The application stores no private key or seed phrase for
that wallet. It cannot initiate a transfer, move treasury funds, sign a refund,
or recover an asset sent to the wrong chain or address.

Do not accept:

- native ETH as payment;
- bridged or lookalike tokens;
- USDC or USDT on Base, Arbitrum, Polygon, BNB Chain, or another network;
- a rounded amount;
- a screenshot, Telegram message, wallet notification, or explorer page as
  proof; or
- a transaction hash already claimed by another payment intent.

Each instruction adds a unique fractional reference smaller than one cent to
the fixed phase amount. The buyer must send all six displayed decimal places.
The browser never calculates or controls this amount.

## State model

Application and engagement states:

- `qualification_pending`: legacy order awaiting conversion to direct checkout
- `needs_information`: exceptional order that needs a bounded correction
- `proposal_ready`: generated fixed service order is ready for terms acceptance
  and payment
- `deposit_pending`: an exact payment instruction exists, but payment is not
  yet recorded
- `deposit_paid`: the scheduling deposit has been recorded; in Cloudflare manual
  mode this reflects an administrator's manual check
- `scheduled`: reviewer and delivery window are confirmed
- `in_review`: evidence collection and deterministic checks are active
- `remediation`: buyer is addressing a finding before final disposition
- `balance_due`: final contractual payment is due
- `paid`: both required payment phases have been recorded
- `completed`: final report has been released
- `payment_refunded`: a refund has been recorded under approved operations
- `declined`: Nodezuno cannot accept the engagement
- `cancelled`: the workflow is closed under the written terms

Stablecoin intent states:

- `awaiting_transfer`
- `submitted`
- `confirming`
- `verified`
- `manual_review`
- `expired`
- `cancelled`
- `refunded`

Claim states:

- `submitted`
- `checking`
- `confirming`
- `verified`
- `rejected`
- `manual_review`

Intent, claim, and engagement states remain separate. A hash submission does
not mark an order paid. A rejected or ambiguous transaction does not disappear
from the audit history.

## API contract

The active buyer routes are:

```text
POST /api/v1/review-orders/{id}/payment-intents
POST /api/v1/review-orders/{id}/payment-intents/{intentId}/claims
GET  /api/v1/review-orders/{id}
GET  /api/v1/review-orders/{id}/payment-confirmations/{confirmationId}
```

The restricted administrator reconciliation route is:

```text
POST /api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}
```

Payment-intent creation accepts only the current due phase, exact current
proposal version, accepted terms, and `USDC` or `USDT`. Amount, recipient,
network, and token contract are server facts.

Claim creation accepts only:

```json
{
  "transactionHash": "0x...",
  "telegramUsername": "@protocolops"
}
```

The transaction hash must be `0x` followed by 64 hexadecimal characters. A
Telegram username is normalized to a lowercase value beginning with `@` and is
mandatory. One transaction hash can belong to only one payment intent.

Production settlement uses only the stablecoin intent, claim, verification,
reconciliation, and confirmation ledgers.

The buyer confirmation route uses the same capability-derived scoped cookie or
exact bound account as the private order. It downloads private no-store JSON
for the exact order and confirmation. Its immutable receipt reference, record
hash, expected and received facts, chain evidence, and accepted-terms snapshot
are payment confirmation only. The record is not a tax invoice or custody
receipt.

## Verification rules

For every configured endpoint, the worker requires:

1. `eth_chainId` equal to `0x1`.
2. A successful transaction receipt.
3. A canonical block retrievable by the receipt block hash.
4. Exactly one matching ERC-20 `Transfer` log for the selected official token.
5. The exact server-issued recipient.
6. The exact atomic amount.
7. At least the configured confirmation threshold.
8. A finalized block at or beyond the payment block.
9. Agreement across every configured usable endpoint.
10. A transaction timestamp no later than the instruction expiry.

Failed receipts, wrong recipients, unrelated tokens, and absent relevant
transfers are rejected. When an observed transfer indicates that the seller
received the other allowed asset, a wrong amount, an ambiguous candidate, or a
transfer after expiry, the system preserves that evidence in manual review and
tells the buyer not to send again. Missing evidence, RPC failure, or partial
endpoint disagreement remains confirming or moves to manual review. None of
these states advances the order.

The default threshold is 12 confirmations. Production can configure from 6 to
64. Two independent, synchronized endpoints are required before public launch.
Every configured endpoint must support
the `finalized` block tag.

Every scheduled worker pass records a quorum heartbeat tied to the current
provider identities, endpoint URLs, mode, and confirmation policy. New
instructions require every provider to report chain ID 1, fresh latest and
finalized blocks, no more than eight blocks of head spread, and a heartbeat no
older than 150 seconds. Configuration parsing alone is not payment readiness.

## Manual reconciliation

The application opens a reconciliation case only for finalized
seller-received `amount_mismatch`, `asset_mismatch`, `transfer_ambiguous`, or
`transfer_after_expiry` evidence. The case snapshots the expected instruction,
observed transfer, confirmation threshold, at-least-two-provider agreement,
evidence hash, and case state. The buyer is told not to send another payment.

Applying a case requires exact same origin, a fresh allowlisted administrator
session, a valid `Idempotency-Key`, action `apply_to_obligation`, and a 12 to
4,000 character decision note. The endpoint accepts only complete finalized
evidence received by the seller in official Ethereum USDC or USDT. It can
apply the exact contractual amount without the fractional suffix for the
selected token, the other official token at the exact contractual or issued
amount, or a late selected-token transfer at one of those exact amounts.

Arbitrary amounts, ambiguous receipts, wrong recipients, nonofficial tokens,
incomplete evidence, insufficient confirmations, or fewer than two agreeing
providers are blocked. An eligible decision atomically advances the exact
order phase, verifies the instruction, resolves the case, creates the immutable
confirmation, appends the order and administrator audit events, and queues the
buyer lifecycle notification. Exact idempotent replay returns the same result.
Database edits are never an alternative to this route.

## Production configuration

```text
NODEZUNO_LEGAL_LAUNCH_APPROVED=true
NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet
NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=[...]
NODEZUNO_PAYMENT_CONFIRMATIONS=12
NODEZUNO_ADMIN_EMAILS=info@nodezuno.com
ZOHO_SMTP_HOST=smtp.zoho.in
ZOHO_SMTP_PASSWORD=<Zoho app password>
```

`NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON` accepts two or three entries. Public
endpoints require HTTPS. Private or loopback HTTP endpoints are allowed only
for approved internal hosts. URLs cannot contain embedded credentials, query
strings, or fragments. Put bounded authentication values in the optional
headers object and keep the entire setting in the encrypted runtime secret.

Example shape:

```json
[
  {
    "name": "payment-mainnet-primary",
    "provider": "primary-provider",
    "url": "https://your-synchronized-node.example/rpc",
    "headers": {},
    "timeoutMs": 8000
  },
  {
    "name": "payment-mainnet-secondary",
    "provider": "secondary-provider",
    "url": "https://your-second-synchronized-node.example/rpc",
    "headers": {},
    "timeoutMs": 8000
  }
]
```

Run the release checks without printing endpoint credentials:

```bash
pnpm run payments:preflight
pnpm run payments:process
```

The preflight verifies Ethereum Mainnet identity, access to both official token
contracts, their six-decimal contract response, finalized-block support, and
RPC agreement. The processing command performs one bounded pass. Production
must run the one-shot worker on the supplied schedule rather than as an
unbounded process inside the web request path.

## Local operation

Local production operation uses the same Ethereum Mainnet payment flow as AWS.
Configure two independent RPC providers, run the payment preflight and worker,
and submit only a real transaction that you intentionally sent. Browser input
cannot complete or credit a payment.

## Notification delivery

The SQLite one-shot notification worker sends a restricted operator notice,
the application receipt, and buyer lifecycle messages containing the private
tracking link. Lifecycle messages cover proposal issue, information request,
decline, schedule, review start, remediation, balance request, verified deposit,
verified balance, payment reconciliation, completion, and cancellation. API
acceptance does not depend on Zoho. The worker uses a stable message ID for
correlation, but SMTP does not provide an idempotent send guarantee. It records
SMTP acceptance separately from confirmed mailbox receipt; there is no
provider callback.

Never place recipient data, Telegram usernames, private links, transaction
claims, message bodies, RPC URLs, headers, or provider responses in ordinary
logs, tickets, screenshots, or release records.

## Access and data protection

The private tracking capability must have at least 256 bits of entropy. It is
returned on creation or an exact idempotent retry, placed in a URL fragment,
and exchanged for a Secure, HttpOnly, SameSite=Lax order cookie. The database
stores only a purpose-separated HMAC. An authenticated account with an exact
owner relationship can also access its order.

Administrator mutations require an authenticated application account, a real
contact email in `NODEZUNO_ADMIN_EMAILS`, exact same-origin verification, exact
payload validation, and durable events.

## Secure deliverable release

### Current Cloudflare profile

The administrator browser first seals the file's kind, safe filename, type,
byte length, and SHA-256. It then sends the file by authenticated same-origin
`PUT`; the Worker streams the body to private R2. The server verifies size,
type, checksum, sealed metadata, ETag, and object version before marking it
available. The application caps a file at 90 MiB. Buyer downloads are
authorized for the exact order and streamed through the Worker. R2 uses
Cloudflare-managed encryption at rest in this configuration.

### Alternate AWS launch profile

The AWS launch profile stores outgoing review deliverables in a separate
private, versioned S3 bucket encrypted with the exact dedicated
customer-managed KMS key. The administrator browser uploads directly only
after the application seals the kind, filename, content type, byte length, and
SHA-256 value and returns a ten-minute presigned POST. The server then verifies
those fields, required metadata, ETag, KMS key, and S3 version ID before
changing the file from `upload_pending` to `available`.

Allowed kinds are `final_report`, `evidence_archive`, and `manifest`. Allowed
formats are PDF, ZIP, JSON, and plain text, with a 100 MiB maximum per file. An
order cannot move from `paid` to `completed` until an available final report
and manifest exist. Completion releases all available deliverables. Only a
buyer authorized for that exact order can request the five-minute signed GET,
and the URL is pinned to the recorded version ID. The bucket remains private,
the application role cannot delete objects, and CloudTrail records read and
write object data events under the review prefix.

This workflow delivers final outputs. The public qualification form still does
not accept private source, credentials, or exploit evidence. Restricted review
inputs require a separately approved intake and analysis environment.

Ethereum addresses, token transfers, and transaction hashes are public.
Telegram usernames and order associations are restricted customer data. The
privacy notice and retention schedule must explain this distinction.

## Refunds

There is no automatic refund endpoint and no private key on the website or
worker. A refund is possible only when the signed commercial terms allow it and
an authorized operator approves it. The operator must:

1. verify the original payment and buyer identity;
2. confirm the approved refund amount, asset, Ethereum address, tax and
   accounting treatment, and sanctions checks;
3. prepare and sign the refund outside the Nodezuno application;
4. obtain any required second-person review;
5. wait for final Ethereum evidence; and
6. record the transaction reference and order-state decision without storing
   a signing key.

Never promise reversibility, a chargeback right, recovery of a wrong-network
transfer, a fixed refund time, or refund of gas fees unless signed terms and
applicable law require it.

## Compliance boundary

Using a self-custody wallet and no payment processor does not remove legal or
financial obligations. Before accepting commercial funds, obtain qualified
advice for the facts of the engagement, including:

- seller identity and service address;
- customer identification, sanctions, source-of-funds, and prohibited-party
  screening appropriate to the risk;
- Indian income-tax, GST, invoice, books-and-records, and virtual-digital-asset
  treatment;
- FEMA and other foreign-exchange rules for payments from outside India;
- destination-country tax, licensing, consumer, and professional-services
  rules;
- the token valuation and accounting policy at instruction, receipt, refund,
  and conversion times; and
- retention of proposal, invoice, transaction, communication, and delivery
  evidence.

The website must not claim that crypto payment avoids registration, KYC, tax,
GST, FEMA, sanctions, invoicing, or reporting requirements.

## Production release checklist

Before enabling `ethereum_mainnet` mode:

- approve counsel-reviewed services terms, privacy notice, cancellation and
  manual-refund policy for the named sole proprietor;
- complete the service address, governing law, venue, tax, invoice,
  cross-border, sanctions, and recordkeeping position;
- confirm control, backup, recovery, and access policy for the external
  recipient wallet without copying its seed phrase to the server;
- configure at least two independent, synchronized Ethereum endpoints;
- run `pnpm run payments:preflight` successfully;
- verify the scheduled payment worker and its alerting;
- test exact success, wrong token, wrong recipient, wrong amount, duplicate
  hash, failed receipt, insufficient confirmations, delayed finality, RPC
  outage, RPC disagreement, reorganization, expiry, and manual review using
  fixtures;
- test automatic reconciliation cases, eligible exact idempotent application,
  arbitrary-amount and ambiguous-receipt denial, atomic confirmation and order
  advancement, and cross-order buyer receipt denial;
- confirm the public site never exposes an active payment instruction;
- confirm the private portal never treats hash submission or Etherscan as paid;
- confirm payment and audit rows are included in encrypted backup and restore
  tests;
- verify the Telegram retention and contact process;
- document who can issue proposals, approve a manual refund, and advance
  engagement states; and
- enable public indexing only after payment, authentication, legal, email,
  backup, and incident-response gates pass.

## Incident handling

If the payment worker or every configured RPC endpoint is unavailable, leave
the claim in confirming state. Restore healthy evidence sources, run one
bounded processing pass, and inspect only redacted operational output. Never
mark an order paid from a screenshot, browser state, Telegram message, or
explorer page.

If RPC endpoints disagree, preserve the evidence and move the claim to manual
review. Do not lower the confirmation threshold or delete history to force a
result.

If a seller-received case is eligible, use only the guarded administrator
route with a new recorded decision key and note. Confirm the resulting order,
case, immutable receipt, audit, event, and lifecycle-notification state before
closing the operation. If the route reports ineligible, incomplete, or state
conflict, stop and investigate. Do not change evidence, force order state, or
ask the buyer to pay again.

If the recipient address or official token allowlist is believed to be wrong,
disable `NODEZUNO_STABLECOIN_PAYMENT_MODE`, stop issuing new instructions, and
investigate existing intents before any redeployment. Do not change the public
recipient during an active intent.

If wallet control may be compromised, disable new payment instructions,
preserve the database and public chain evidence, activate the external wallet
incident plan, and obtain specialist legal and security advice. The website
cannot rotate or rescue the wallet because it holds no signing key.

If a refund is approved, complete it through the manual procedure. Disabling
payment mode does not cancel an onchain transfer or satisfy a refund obligation.
