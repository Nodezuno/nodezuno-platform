# Current product, scope, and pricing

Status: current product contract. Reviewed against the Cloudflare manual-payment implementation on 2026-11-16.
Owner: Sanjay Sudagani. This is an operating reference, not a replacement for accepted service terms.

## What a customer buys

Nodezuno reviews one planned upgrade to an already-audited or reviewed blockchain protocol. The customer receives a record of the exact release, change analysis, reproducible evidence, findings, a human-signed Proceed, Remediate, or Hold recommendation, and one consolidated fix review.

Both EVM and supported non-EVM chains use the same offer:

| Rule | Current value |
| --- | --- |
| Total | USD 7,500 |
| Scheduling deposit | USD 3,750 |
| Final balance | USD 3,750, before the final report is released |
| Network and release | One of each |
| Affected contracts, programs, or modules | 1 to 8 |
| Materially changed protocol code lines | 1 to 500 |
| Baseline | An existing audited or reviewed version |
| Generated order validity | 30 days; individual payment instructions expire sooner |
| Standard EVM delivery target | Five business days after the deposit and required inputs are ready |
| Non-EVM timing | Completion estimate confirmed at kickoff after the required inputs are available |

The target catalog includes EVM, SVM, Cosmos SDK, CosmWasm, Move, Substrate, Starknet, Bitcoin/UTXO, and the explicit other-network categories in [review-targets.ts](../../lib/review-targets.ts). Selecting a category does not turn a bounded upgrade review into a full consensus, bridge, cryptography, or protocol audit.

## Direct ordering

1. The customer submits public or non-confidential upgrade details.
2. A valid bounded form immediately creates a fixed service order. There is no manual approval queue before payment.
3. The customer accepts the exact order version and service terms, then chooses USDC or USDT on Ethereum Mainnet.
4. The customer sends the exact server-issued amount to the recipient shown in the private portal and submits the transaction hash and mandatory Telegram username.
5. The customer submits the transaction hash and Telegram username. Sanjay manually checks the transfer and records the result. A hash submission alone does not mark the order paid.
6. Work begins after the scheduling payment is manually recorded, the required review files are ready, scope is confirmed, and reviewer availability is agreed. The final balance is also checked manually before report delivery.

Payment amounts contain a unique fractional reference smaller than one cent. Use every displayed decimal place. The recipient is the destination; the token contract is not a payment destination. The portal intentionally does not offer a token-contract copy button.

## What is excluded

Custody, deployment, private-key access, incident response, formal verification, a new protocol audit, multiple networks or releases, and work outside the submitted boundary are excluded. A review is not a security guarantee. Missing or changed inputs can pause delivery without creating a retroactive sales-approval requirement.

## Implementation authority and change control

- [review-policy.ts](../../lib/review-policy.ts) owns current amounts in integer minor units, size limits, the delivery target, and shared presentation labels.
- [review-targets.ts](../../lib/review-targets.ts) owns the accepted network categories.
- Order validation, order creation, the form, core public price copy, and OpenAPI consume that policy.
- Stored orders, payment instructions, receipts, applied SQL migrations, and the exact accepted terms text are historical records. Do not recompute them from a new price or rewrite their bytes.
- A price or scope change needs review of the policy, database constraints, OpenAPI, current documentation, legal terms/version/hash, and worker packaging. A policy edit alone does not authorize a new commercial offer.

The detailed [standard EVM method](../UPGRADE_ASSURANCE.md) is a technical method for one track, not a restriction of the overall offer to EVM. The [commerce runbook](../UPGRADE_ASSURANCE_COMMERCE.md) controls the detailed order and payment workflow.
