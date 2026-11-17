# Ethereum stablecoin payments

This document describes the retained automatic Ethereum Mainnet payment
verifier. It is not enabled in the Cloudflare Free profile. Manual customer
transaction submission and operator review become available only after the
launch approval gate and manual payment mode are explicitly enabled. Commercial
sequencing, buyer communication, refunds, and compliance gates are defined in
[UPGRADE_ASSURANCE_COMMERCE.md](UPGRADE_ASSURANCE_COMMERCE.md).

## What the system does

For a customer-accepted, automatically generated Upgrade Assurance service order, the server:

1. creates an order-bound payment intent;
2. fixes USDC or USDT, Ethereum chain ID 1, the official token contract, the
   recipient, proposal version, phase, exact atomic amount, and expiry;
3. shows the exact amount, asset, network, and prominent copyable recipient only
   in the authorized buyer portal; token contracts stay in verification data,
   not in a customer copy box;
4. accepts a full transaction hash and mandatory Telegram username;
5. queues the claim for Ethereum evidence verification; and
6. advances the order only after the exact transfer is successful, canonical,
   sufficiently confirmed, and finalized; or opens an immutable case when
   finalized seller-received evidence needs guarded reconciliation.

Every exact or reconciled application creates an immutable payment
confirmation that the authorized buyer can download as private no-store JSON.
That record is payment confirmation only, not a tax invoice or custody
receipt.

The system does not connect a buyer wallet, request token approval, hold a
private key, sign a transfer, convert a token, calculate gas, or initiate a
refund. Etherscan is an optional human-readable viewer and is not used as the
verification authority.

## Source map

| Responsibility | Source |
| --- | --- |
| Fixed recipient, token allowlist, RPC parsing | `lib/server/stablecoin-payment-config.ts` |
| Intent, claim, and public projection | `lib/server/stablecoin-payment-store.ts` |
| Intent creation, claim validation, RPC verification | `lib/server/stablecoin-payment.ts` |
| Buyer intent API | `app/api/v1/review-orders/[id]/payment-intents/route.ts` |
| Buyer claim API | `app/api/v1/review-orders/[id]/payment-intents/[intentId]/claims/route.ts` |
| Buyer confirmation API | `app/api/v1/review-orders/[id]/payment-confirmations/[confirmationId]/route.ts` |
| Administrator reconciliation API | `app/api/v1/admin/review-orders/[id]/payment-reconciliations/[claimId]/route.ts` |
| Reconciliation and confirmation rules | `lib/server/stablecoin-payment-records.ts` |
| Buyer portal | `components/review-order-experience.tsx` |
| Safe buyer payment-mode projection | `lib/server/review-payment-experience.ts` |
| Persisted provider-quorum heartbeat | `lib/server/stablecoin-payment-health.ts` |
| One-shot worker | `scripts/process-stablecoin-payments.mjs` |
| Release preflight | `scripts/preflight-stablecoin-payments.mjs` |
| Settlement tables | `drizzle/0019_ethereum_stablecoin_payments.sql` |
| Immutable intent and heartbeat guards | `drizzle/0020_payment_operational_guards.sql` |
| Reconciliation cases and immutable confirmations | `drizzle/0023_stablecoin_reconciliation.sql` |

## Token allowlist

| Asset | Contract | Decimals |
| --- | --- | ---: |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 |

No configuration option can add a third token or change these contracts. A
code and migration review is required to alter the allowlist.

## Runtime configuration

```text
NODEZUNO_LEGAL_LAUNCH_APPROVED=true
NODEZUNO_STABLECOIN_PAYMENT_MODE=ethereum_mainnet
NODEZUNO_ETHEREUM_RPC_ENDPOINTS_JSON=[...]
NODEZUNO_PAYMENT_CONFIRMATIONS=12
```

Keep `NODEZUNO_LEGAL_LAUNCH_APPROVED=false` and the mode `disabled` until the
database migration, payment worker, RPC endpoints, legal documents, wallet
operations, monitoring, backup, and incident response have all passed release
review.

The RPC setting accepts two or three endpoints. Two independent endpoints are
required for production. Provider identifiers and normalized hosts must be
distinct, and all configured endpoints must agree. One broken or disagreeing
endpoint prevents instruction creation and automatic verification instead of
weakening the evidence threshold.

An endpoint entry has this shape:

```json
{
  "name": "payment-mainnet-primary",
  "provider": "primary-provider",
  "url": "https://your-synchronized-node.example/rpc",
  "headers": {
    "Authorization": "Bearer stored-only-in-the-encrypted-runtime-secret"
  },
  "timeoutMs": 8000
}
```

Constraints:

- names and provider identifiers contain lowercase letters, digits, and hyphens;
- provider identifiers and normalized endpoint hosts must be unique;
- public endpoints use HTTPS;
- internal HTTP is limited to loopback, RFC 1918, or `.internal` hosts;
- URLs cannot contain a username, password, query string, or fragment;
- forbidden transport headers are rejected;
- timeout is from 2,000 to 15,000 milliseconds; and
- endpoint URLs and headers must never be logged.

## Persisted verifier heartbeat

The payment worker probes every configured endpoint during each pass and stores
one redacted health record. A healthy record requires:

- Ethereum chain ID 1 from every provider;
- a valid latest and finalized block from every provider;
- a latest-block timestamp no more than five minutes from the worker clock;
- finalized height no greater than latest height;
- no more than eight blocks of spread between provider heads; and
- a configuration hash matching the current mode, confirmation policy,
  provider identities, and endpoint URLs.

New payment instructions require that healthy record to be no older than 150
seconds. A missing, unhealthy, stale, or configuration-mismatched heartbeat
returns `503 payment_verifier_unhealthy` before an instruction is created. An
existing instruction can still accept a buyer claim during an outage so the
transaction hash is not lost, but the order remains unpaid until the worker
recovers and verifies it. `/api/v1/status` reports the payment component from
this persisted heartbeat, not from configuration parsing alone.

## Exact-amount attribution

The USD phase amount remains fixed in integer cents. The server converts cents
to six-decimal atomic units and adds a random order reference from 1 to 9,999
atomic units. This reference is smaller than one cent and creates a unique
amount for the selected asset.

For example, the display can be `3750.004321 USDC`. The buyer must send that
exact amount and must not round it to `3750`, `3750.00`, or another value. The
server enforces uniqueness for asset and atomic amount before exposing the
instruction.

The instruction expires after at most 24 hours and never outlives the proposal
expiry. If the seller received a transfer mined after instruction expiry, the
system preserves the observed evidence in manual review and does not credit the
order automatically. Operators must never ask a buyer to reuse an expired
instruction or send again while that transfer is unresolved.

An expired instruction remains exclusively claimable for transaction evidence
for six hours. During that grace period the system will not issue a replacement
instruction or allow an operator to cancel the order. After the grace period,
an operator must inspect the treasury for an unsubmitted transfer before final
cancellation. This closes the signing and broadcast race without treating a
submitted hash as payment.

Creation requires an idempotency key. The database stores only its
purpose-separated hash, binds it to the exact order, phase, proposal version,
and asset request, and rejects changed reuse. Every intent also snapshots the
confirmation policy plus the accepted service-terms version and SHA-256 hash so
a later configuration or text change cannot rewrite the agreement used for an
issued instruction. At most four instruction records can be created for one
order phase, and at most five transaction claims can be submitted for one
instruction before operator review is required.

## Verification evidence

The worker queries every configured endpoint for:

- `eth_chainId`;
- `eth_getTransactionReceipt`;
- `eth_blockNumber`;
- `eth_getBlockByNumber` with `finalized`; and
- `eth_getBlockByHash` for the receipt block.

It decodes ERC-20 `Transfer(address,address,uint256)` logs and requires one
unambiguous match. The evidence binds:

- chain ID 1;
- transaction hash;
- successful receipt status;
- official selected token contract;
- exact recipient;
- exact atomic amount;
- block number and block hash;
- log index;
- block timestamp;
- minimum observed confirmations;
- finalized block position; and
- agreement count across configured endpoints.

A stable digest of the matching evidence is stored with the claim. Raw RPC
credentials and full endpoint details are not stored with payment evidence.

## Failure behavior

| Observation | Result |
| --- | --- |
| Receipt not found yet | Retry in confirming state |
| RPC unavailable | Retry without crediting payment |
| RPC endpoints disagree | Retry or require manual review |
| Receipt failed | Reject claim |
| Other canonical allowed token sent to the seller | Preserve observed evidence and require manual review; do not request another transfer |
| Unrelated token or no relevant transfer | Reject claim |
| Wrong recipient | Reject claim |
| Seller received the wrong amount | Preserve observed evidence and require manual review; do not request another transfer |
| Multiple seller-directed candidate transfers | Preserve observed evidence and require manual review |
| Seller received the transfer after expiry | Preserve observed evidence and require manual review |
| Confirmations below threshold | Keep confirming |
| Block not finalized | Keep confirming |
| All evidence rules pass | Verify claim and advance the exact order phase |

A worker outage leaves claims uncredited. It does not cause a browser or
administrator action to become payment authority.

New payment instructions remain fail closed whenever verification is disabled
or unavailable. If an instruction was already issued before an outage, the
authorized buyer can still submit its transaction hash and mandatory Telegram
username. The claim is stored in `submitted` state, the order remains unpaid,
and only the recovered payment worker can verify and advance it. This prevents
the website from losing evidence after a buyer may already have sent funds.

## Worker operation

Run preflight after configuration and before enabling public payment:

```bash
pnpm run payments:preflight
```

Run one processing pass manually:

```bash
pnpm run payments:process
```

The local installer supplies a LaunchAgent. The AWS compose profiles supply a
separate payment-worker service. Each execution refreshes the verifier
heartbeat, selects at most 25 due claims, processes at most three concurrently,
has a 120-second pass budget, and uses database leases so overlapping
invocations cannot normally process the same claim at the same time.

Monitor:

- selected, verified, confirming, rejected, and manual-review counts;
- consecutive RPC errors;
- endpoint disagreement;
- oldest pending claim age;
- lease recovery;
- worker exit status;
- verifier heartbeat age and configuration match;
- selected work that was deferred by the pass deadline;
- isolated per-claim worker failures;
- database write failures; and
- claims still confirming after the normal finality window.

Logs must use claim and order identifiers only where operationally required.
Do not log the Telegram username, private portal capability, RPC URL or header,
notification content, or wallet signing material.

## Database records

`review_stablecoin_payment_intents` stores the server instruction and its
lifecycle. `review_stablecoin_payment_claims` stores the buyer claim and
verification evidence. `payment_verifier_health` stores one redacted persisted
quorum heartbeat. `review_stablecoin_reconciliation_cases` stores immutable
seller-received anomaly evidence plus the guarded operator decision.
`review_stablecoin_payment_confirmations` is the immutable exact and reconciled
confirmation ledger and source for buyer receipts. The tables are tied to the
existing review order through migrations `0019`, `0020`, and `0023`.

Important constraints include:

- Ethereum chain ID 1 only;
- USDC or USDT only;
- six token decimals;
- fixed recipient;
- positive USD obligation and atomic amount;
- one active intent per order phase;
- one active claim per intent;
- globally unique transaction hash;
- mandatory normalized Telegram username; and
- nonnegative confirmation and attempt counters.

The 1 to 9,999 exact-amount suffix is a finite attribution namespace per asset,
not an unlimited-volume billing design. The global unique amount constraint,
four-intent per-phase cap, and fail-closed creation behavior protect this
launch workflow. A higher-throughput commercial payment system requires a new
attribution scheme and migration before the namespace approaches exhaustion.

Backups and restore exercises must include all payment tables and the associated
order, event, audit, and lifecycle-notification records. Never delete a rejected
or ambiguous claim merely to simplify the operator view.

## Guarded reconciliation and buyer confirmation

A claim in `manual_review` for `amount_mismatch`, `asset_mismatch`,
`transfer_ambiguous`, or `transfer_after_expiry` opens one reconciliation case.
The administrator queue shows its expected and observed evidence, eligibility
decision, and any recorded resolution. Supporting explorer or node checks may
help an operator investigate, but only the sealed database evidence is input
to the application decision.

To apply funds, use:

```text
POST /api/v1/admin/review-orders/{id}/payment-reconciliations/{claimId}
Origin: https://nodezuno.com
Idempotency-Key: <unique durable operator key>
```

```json
{
  "action": "apply_to_obligation",
  "note": "Reviewed finalized evidence and approved application to the due obligation."
}
```

The request requires a fresh allowlisted administrator session. The note is
mandatory and contains 12 through 4,000 characters. The route accepts only
complete finalized Ethereum evidence, at least two agreeing providers, the
configured seller recipient, and an official USDC or USDT contract. It then
applies only these narrow cases:

- selected token at the exact contractual amount without the instruction
  suffix for an amount mismatch;
- the other official token at the exact contractual or issued amount for an
  asset mismatch; or
- selected token at the exact contractual or issued amount for a late
  transfer.

Ambiguous receipts, arbitrary amounts, incomplete evidence, wrong recipients,
nonofficial tokens, and evidence without the pinned confirmations and
two-provider agreement are blocked. A successful decision changes the due
order phase, intent, reconciliation case, immutable confirmation, order event,
administrator audit, and buyer notification atomically. Exact idempotent replay
returns the same confirmation. A changed replay or concurrent state change
fails closed.

The authorized buyer downloads a confirmation through:

```text
GET /api/v1/review-orders/{id}/payment-confirmations/{confirmationId}
```

The response is private no-store JSON, attached under its receipt reference.
Authorization is bound to the same review capability or exact account and
order. The record includes expected and received asset facts, transaction and
block identity, confirmation and provider-agreement counts, evidence and terms
hashes, receipt reference, and public record hash. It excludes the operator
note and email and explicitly states that it is not a tax invoice or custody
receipt.

## Wallet isolation

The recipient wallet is controlled outside the web application. Keep these
boundaries:

- no seed phrase, private key, keystore, signing service, or wallet session on
  the web host;
- no treasury signing in the payment worker;
- separate wallet inventory and access records;
- offline recovery material under an approved backup process;
- limited operator access with independent review for refunds; and
- immediate payment-mode shutdown if control may be compromised.

Changing the fixed recipient requires a reviewed code and migration release.
Do not change it while an active instruction exists.

## Manual refund record

The application does not send refunds. If signed terms and applicable law
require one, an authorized operator verifies the original claim, validates the
destination and amount, completes compliance and accounting checks, signs the
transfer outside Nodezuno, waits for final Ethereum evidence, and records the
result in the order audit history.

Never put a refund private key on the application host. Never infer a refund
destination solely from Telegram. Never promise recovery of assets sent on the
wrong network.

## Release evidence

Before production, preserve results for:

```bash
pnpm run payments:preflight
pnpm exec tsc --noEmit --incremental false
pnpm test
pnpm run build:container
```

The fixture suite must cover exact success, amount tampering, wrong asset,
wrong recipient, duplicate hash, receipt failure, insufficient confirmations,
finality delay, RPC outage, endpoint disagreement, expiry, reorganization,
capability isolation, and idempotent retries. Do not send a real mainnet
transaction as part of automated testing.
