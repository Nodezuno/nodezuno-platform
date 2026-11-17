import { getDatabase } from "./database-binding.ts";
import { LATE_PAYMENT_CLAIM_GRACE_MS } from "./stablecoin-payment-config.ts";

export type StablecoinIntentState =
  | "awaiting_transfer"
  | "submitted"
  | "confirming"
  | "verified"
  | "manual_review"
  | "expired"
  | "cancelled"
  | "refunded";

export type StablecoinClaimState =
  | "submitted"
  | "checking"
  | "confirming"
  | "verified"
  | "rejected"
  | "manual_review";

export type StablecoinPaymentIntentRow = {
  id: string;
  reviewOrderId: string;
  phase: "deposit" | "balance";
  state: StablecoinIntentState;
  asset: "USDC" | "USDT";
  chainId: number;
  network: "ethereum";
  tokenContract: string;
  tokenDecimals: number;
  recipientAddress: string;
  obligationAmount: number;
  obligationCurrency: "usd";
  tokenAmountAtomic: string;
  tokenAmountDisplay: string;
  referenceUnits: number;
  proposalVersion: number;
  termsAcceptedAt: number;
  confirmationsRequired: number;
  termsVersion: string;
  termsHash: string;
  creationIdempotencyHash: string | null;
  creationRequestHash: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number | null;
  cancelledAt: number | null;
};

export type StablecoinPaymentClaimRow = {
  id: string;
  paymentIntentId: string;
  transactionHash: string;
  telegramUsername: string;
  state: StablecoinClaimState;
  failureCode: string | null;
  observedSender: string | null;
  observedTokenContract: string | null;
  observedRecipientAddress: string | null;
  observedAmountAtomic: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  logIndex: string | null;
  blockTimestamp: number | null;
  confirmations: number;
  evidenceHash: string | null;
  rpcAgreementCount: number;
  attemptCount: number;
  nextCheckAt: number;
  lastCheckedAt: number | null;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  submittedAt: number;
  verifiedAt: number | null;
  rejectedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export const STABLECOIN_INTENT_SELECT = `
  SELECT id, review_order_id AS reviewOrderId, phase, state, asset,
         chain_id AS chainId, network, token_contract AS tokenContract,
         token_decimals AS tokenDecimals,
         recipient_address AS recipientAddress,
         obligation_amount AS obligationAmount,
         obligation_currency AS obligationCurrency,
         token_amount_atomic AS tokenAmountAtomic,
         token_amount_display AS tokenAmountDisplay,
         reference_units AS referenceUnits,
         proposal_version AS proposalVersion,
         terms_accepted_at AS termsAcceptedAt,
         confirmations_required AS confirmationsRequired,
         terms_version AS termsVersion, terms_hash AS termsHash,
         creation_idempotency_hash AS creationIdempotencyHash,
         creation_request_hash AS creationRequestHash,
         expires_at AS expiresAt, created_at AS createdAt,
         updated_at AS updatedAt, verified_at AS verifiedAt,
         cancelled_at AS cancelledAt
  FROM review_stablecoin_payment_intents`;

export const STABLECOIN_CLAIM_SELECT = `
  SELECT id, payment_intent_id AS paymentIntentId,
         transaction_hash AS transactionHash,
         telegram_username AS telegramUsername, state,
         failure_code AS failureCode, observed_sender AS observedSender,
         observed_token_contract AS observedTokenContract,
         observed_recipient_address AS observedRecipientAddress,
         observed_amount_atomic AS observedAmountAtomic,
         block_number AS blockNumber, block_hash AS blockHash,
         log_index AS logIndex, block_timestamp AS blockTimestamp,
         confirmations, evidence_hash AS evidenceHash,
         rpc_agreement_count AS rpcAgreementCount,
         attempt_count AS attemptCount, next_check_at AS nextCheckAt,
         last_checked_at AS lastCheckedAt, lease_token AS leaseToken,
         lease_expires_at AS leaseExpiresAt, submitted_at AS submittedAt,
         verified_at AS verifiedAt, rejected_at AS rejectedAt,
         created_at AS createdAt, updated_at AS updatedAt
  FROM review_stablecoin_payment_claims`;

export async function stablecoinPaymentForOrder(
  reviewOrderId: string,
  phase: "deposit" | "balance" | null,
): Promise<ReturnType<typeof publicStablecoinPayment> | null> {
  if (!phase) return null;
  const db = await getDatabase();
  const intent = await db.prepare(
    `${STABLECOIN_INTENT_SELECT}
     WHERE review_order_id = ? AND phase = ?
       AND state NOT IN ('expired','cancelled','refunded')
       AND (state != 'awaiting_transfer' OR expires_at > ?)
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(reviewOrderId, phase, Date.now() - LATE_PAYMENT_CLAIM_GRACE_MS).first<StablecoinPaymentIntentRow>();
  if (!intent) return null;
  const claim = await db.prepare(
    `${STABLECOIN_CLAIM_SELECT} WHERE payment_intent_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(intent.id).first<StablecoinPaymentClaimRow>();
  return publicStablecoinPayment(intent, claim);
}

export function publicStablecoinPayment(
  intent: StablecoinPaymentIntentRow,
  claim: StablecoinPaymentClaimRow | null,
) {
  const now = Date.now();
  const hasUnresolvedClaim = claim !== null && claim.state !== "rejected";
  return {
    intent: {
      id: intent.id,
      phase: intent.phase,
      state: intent.state,
      asset: intent.asset,
      network: "Ethereum Mainnet",
      chainId: intent.chainId,
      tokenContract: intent.tokenContract,
      tokenDecimals: intent.tokenDecimals,
      recipient: intent.recipientAddress,
      amount: intent.obligationAmount,
      currency: intent.obligationCurrency,
      tokenAmount: intent.tokenAmountDisplay,
      amountAtomic: intent.tokenAmountAtomic,
      referenceUnits: intent.referenceUnits,
      proposalVersion: intent.proposalVersion,
      termsAcceptedAt: iso(intent.termsAcceptedAt),
      confirmationsRequired: intent.confirmationsRequired,
      termsVersion: intent.termsVersion,
      termsHash: intent.termsHash,
      expiresAt: iso(intent.expiresAt),
      checkedAt: iso(now),
      acceptingTransfers: intent.state === "awaiting_transfer" && !hasUnresolvedClaim && intent.expiresAt > now,
      acceptingClaims: !["verified", "cancelled", "refunded"].includes(intent.state)
        && !hasUnresolvedClaim && intent.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS > now,
      claimSubmissionDeadline: iso(intent.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS),
      createdAt: iso(intent.createdAt),
      verifiedAt: iso(intent.verifiedAt),
    },
    claim: claim ? {
      id: claim.id,
      state: claim.state,
      transactionHash: claim.transactionHash,
      telegramUsername: claim.telegramUsername,
      failureCode: claim.failureCode,
      confirmations: claim.confirmations,
      submittedAt: iso(claim.submittedAt),
      verifiedAt: iso(claim.verifiedAt),
      explorerUrl: `https://etherscan.io/tx/${claim.transactionHash}`,
    } : null,
  };
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
