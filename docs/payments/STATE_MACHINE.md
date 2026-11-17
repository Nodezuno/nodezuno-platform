# Payment state and customer language

Status: current implementation map. The transition authority remains the
transactional functions and SQL guards, not this document or a browser status
label.

The Cloudflare production profile keeps payment instructions disabled by
default. After launch approval and explicit activation of
`manual_ethereum`, a customer claim is stored as `manual_review` with no
automatic RPC attempts. The buyer and operator are notified; only an
authenticated admin action after human inspection advances the order. The
`ethereum_mainnet` verifier remains a separate optional mode and is not
enabled by the Cloudflare profile.

## Separate records

| Record | Meaning | Authority |
| --- | --- | --- |
| Service order | Scope, price, accepted terms, and work lifecycle | `review-commerce.ts` |
| Payment instruction | One order phase, asset, recipient, exact amount, expiry, and accepted terms snapshot | `stablecoin-payment.ts` and `stablecoin-payment-store.ts` |
| Transaction claim | Customer-supplied hash awaiting manual review in Cloudflare mode, or automatic verification in the separate verifier mode | `stablecoin-payment.ts` |
| Reconciliation case | Immutable seller-received anomaly requiring a guarded decision | `stablecoin-payment-records.ts` |
| Payment confirmation | Immutable record of credited finalized evidence | SQL confirmation guards and `stablecoin-payment-records.ts` |
| Notification | Queued, accepted, delivered, or failed email outcome | Notification outbox worker and signed provider webhook |

## Normal transition sequence

```text
Valid form -> proposal_ready -> accepted terms / deposit_pending
Manual Cloudflare path:
Instruction: awaiting_transfer -> manual_review
Claim: manual_review -> admin records manual check -> order advances

Separate automatic path:
Instruction: awaiting_transfer -> submitted -> confirming -> verified
Claim: submitted -> checking -> confirming -> checking -> verified
Recorded deposit -> deposit_paid -> scheduled -> in_review
Final balance requested -> balance_due -> recorded final balance -> paid
Verified report and manifest -> completed
```

In automatic mode, some transitions can skip `confirming` when the first check
already has sufficient finalized evidence. Only a lease owner can apply a
worker result. In Cloudflare manual mode, the hash is never automatically
queried; the admin's manual-check action and note are recorded in the order and
admin audit trail. A claim submission alone never advances the order.

`proposal_ready` is a compatibility name for an automatically generated fixed service order. It does not mean waiting for seller approval. `qualification_pending` is retained for legacy records requiring corrected customer details, not new valid orders.

## Exceptions

- Transient provider failures or insufficient finality keep a claim in `confirming` with a bounded retry time. An unhealthy or stale verifier blocks new instructions, not preservation of evidence for an existing instruction.
- Definitively invalid evidence becomes `rejected`. The instruction returns to `awaiting_transfer` only when the existing reuse guard permits it; otherwise it expires.
- Seller-received, ambiguous, or exhausted evidence moves to `manual_review`. This payment exception is not a pre-payment sales review. Never tell a customer to send again while it is unresolved.
- An instruction can become `expired` or `cancelled` only through its existing guards. Expired instructions retain a six-hour evidence-claim grace window before replacement is allowed.
- Reconciliation can credit only eligible, complete official-token evidence with the existing provider-agreement and exact-amount guards. It creates its own immutable confirmation and sealed notification transactionally.
- `refunded` / `payment_refunded` record reviewed external refund operations. The application cannot sign a refund or move treasury funds.

Keep order, instruction, claim, receipt, and email states distinct. A submitted hash, provider acceptance of an email, or an administrator note is not proof of payment. A confirmed payment does not prove that its email reached the inbox.

## Wording and privacy

In Cloudflare manual mode, use **payment instructions**, **transaction details submitted**, **manual check pending**, and **payment recorded after manual check**. Do not call an operator note an onchain verification receipt. In the separate automatic mode, the UI can describe finalized evidence as verified. Never display a token contract as a copyable recipient. Keep confirmation downloads private and `no-store`.

Use the [Ethereum verifier runbook](../ETHEREUM_STABLECOIN_PAYMENTS.md) for evidence rules and the [commerce runbook](../UPGRADE_ASSURANCE_COMMERCE.md) for operational exceptions. Do not replace SQL transition guards with an in-memory status machine or edit historical records to make the flow appear complete.
