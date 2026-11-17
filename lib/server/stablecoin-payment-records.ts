import { privateHash, sha256Hex, stableStringify } from "./crypto.ts";
import { getDatabase } from "./database-binding.ts";
import {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "./notification-outbox.ts";
import { HttpProblem } from "./http.ts";
import { STABLECOIN_ASSETS } from "./stablecoin-payment-config.ts";

type ReconciliationCaseRow = {
  id: string;
  reviewOrderId: string;
  paymentIntentId: string;
  paymentClaimId: string;
  transactionHash: string;
  caseType: "amount_mismatch" | "asset_mismatch" | "transfer_ambiguous" | "transfer_after_expiry";
  state: "open" | "investigating" | "application_pending" | "refund_pending" | "resolved";
  phase: "deposit" | "balance";
  expectedAsset: "USDC" | "USDT";
  expectedTokenContract: string;
  expectedRecipientAddress: string;
  expectedAmountAtomic: string;
  instructionExpiresAt: number;
  observedSenderAddress: string | null;
  observedTokenContract: string | null;
  observedRecipientAddress: string | null;
  observedAmountAtomic: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  logIndex: string | null;
  blockTimestamp: number | null;
  confirmationsObserved: number;
  confirmationsRequired: number;
  rpcAgreementCount: number;
  evidenceHash: string | null;
  openedAt: number;
  investigationStartedAt: number | null;
  resolutionIdempotencyHash: string | null;
  resolutionRequestHash: string | null;
  resolutionCode: string | null;
  resolutionNote: string | null;
  resolutionDecidedByEmail: string | null;
  resolutionDecidedAt: number | null;
  resolvedAt: number | null;
  updatedAt: number;
  obligationAmount: number;
  obligationCurrency: "usd";
  proposalVersion: number;
  termsVersion: string;
  termsHash: string;
  termsAcceptedAt: number;
  orderReference: string;
  orderStatus: string;
  intentState: string;
};

type PaymentConfirmationRow = {
  id: string;
  reviewOrderId: string;
  paymentIntentId: string;
  paymentClaimId: string;
  reconciliationCaseId: string | null;
  recordKind: "exact_match" | "reconciliation";
  phase: "deposit" | "balance";
  expectedAsset: "USDC" | "USDT";
  expectedTokenContract: string;
  receivedAsset: "USDC" | "USDT";
  receivedTokenContract: string;
  recipientAddress: string;
  senderAddress: string;
  expectedAmountAtomic: string;
  receivedAmountAtomic: string;
  obligationAmount: number;
  obligationCurrency: "usd";
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  logIndex: string;
  blockTimestamp: number;
  confirmationsObserved: number;
  confirmationsRequired: number;
  rpcAgreementCount: number;
  evidenceHash: string;
  proposalVersion: number;
  termsVersion: string;
  termsHash: string;
  termsAcceptedAt: number;
  confirmedAt: number;
  recordedAt: number;
  recordedByType: "verifier" | "operator";
  publicRecordHash: string;
  receiptReference: string;
};

const RECONCILIATION_SELECT = `
  SELECT r.id, r.review_order_id AS reviewOrderId,
         r.payment_intent_id AS paymentIntentId,
         r.payment_claim_id AS paymentClaimId,
         r.transaction_hash AS transactionHash, r.case_type AS caseType,
         r.state, r.phase, r.expected_asset AS expectedAsset,
         r.expected_token_contract AS expectedTokenContract,
         r.expected_recipient_address AS expectedRecipientAddress,
         r.expected_amount_atomic AS expectedAmountAtomic,
         r.instruction_expires_at AS instructionExpiresAt,
         r.observed_sender_address AS observedSenderAddress,
         r.observed_token_contract AS observedTokenContract,
         r.observed_recipient_address AS observedRecipientAddress,
         r.observed_amount_atomic AS observedAmountAtomic,
         r.block_number AS blockNumber, r.block_hash AS blockHash,
         r.log_index AS logIndex, r.block_timestamp AS blockTimestamp,
         r.confirmations_observed AS confirmationsObserved,
         r.confirmations_required AS confirmationsRequired,
         r.rpc_agreement_count AS rpcAgreementCount,
         r.evidence_hash AS evidenceHash, r.opened_at AS openedAt,
         r.investigation_started_at AS investigationStartedAt,
         r.resolution_idempotency_hash AS resolutionIdempotencyHash,
         r.resolution_request_hash AS resolutionRequestHash,
         r.resolution_code AS resolutionCode,
         r.resolution_note AS resolutionNote,
         r.resolution_decided_by_email AS resolutionDecidedByEmail,
         r.resolution_decided_at AS resolutionDecidedAt,
         r.resolved_at AS resolvedAt, r.updated_at AS updatedAt,
         i.obligation_amount AS obligationAmount,
         i.obligation_currency AS obligationCurrency,
         i.proposal_version AS proposalVersion,
         i.terms_version AS termsVersion, i.terms_hash AS termsHash,
         i.terms_accepted_at AS termsAcceptedAt,
         i.state AS intentState, o.reference AS orderReference,
         o.status AS orderStatus
  FROM review_stablecoin_reconciliation_cases r
  JOIN review_stablecoin_payment_intents i ON i.id = r.payment_intent_id
  JOIN review_orders o ON o.id = r.review_order_id`;

export const PAYMENT_CONFIRMATION_SELECT = `
  SELECT id, review_order_id AS reviewOrderId,
         payment_intent_id AS paymentIntentId,
         payment_claim_id AS paymentClaimId,
         reconciliation_case_id AS reconciliationCaseId,
         record_kind AS recordKind, phase,
         expected_asset AS expectedAsset,
         expected_token_contract AS expectedTokenContract,
         received_asset AS receivedAsset,
         received_token_contract AS receivedTokenContract,
         recipient_address AS recipientAddress,
         sender_address AS senderAddress,
         expected_amount_atomic AS expectedAmountAtomic,
         received_amount_atomic AS receivedAmountAtomic,
         obligation_amount AS obligationAmount,
         obligation_currency AS obligationCurrency,
         transaction_hash AS transactionHash,
         block_number AS blockNumber, block_hash AS blockHash,
         log_index AS logIndex, block_timestamp AS blockTimestamp,
         confirmations_observed AS confirmationsObserved,
         confirmations_required AS confirmationsRequired,
         rpc_agreement_count AS rpcAgreementCount,
         evidence_hash AS evidenceHash, proposal_version AS proposalVersion,
         terms_version AS termsVersion, terms_hash AS termsHash,
         terms_accepted_at AS termsAcceptedAt,
         confirmed_at AS confirmedAt, recorded_at AS recordedAt,
         recorded_by_type AS recordedByType,
         public_record_hash AS publicRecordHash,
         receipt_reference AS receiptReference
  FROM review_stablecoin_payment_confirmations`;

export async function listStablecoinPaymentConfirmations(reviewOrderId: string) {
  const db = await getDatabase();
  const rows = await db.prepare(
    `${PAYMENT_CONFIRMATION_SELECT} WHERE review_order_id = ? ORDER BY confirmed_at ASC`,
  ).bind(reviewOrderId).all<PaymentConfirmationRow>();
  return rows.results.map(publicPaymentConfirmation);
}

export async function stablecoinPaymentConfirmation(options: {
  reviewOrderId: string;
  confirmationId: string;
}) {
  const db = await getDatabase();
  const row = await db.prepare(
    `${PAYMENT_CONFIRMATION_SELECT} WHERE review_order_id = ? AND id = ? LIMIT 1`,
  ).bind(options.reviewOrderId, options.confirmationId).first<PaymentConfirmationRow>();
  if (!row) {
    throw new HttpProblem(404, "payment_confirmation_not_found", "The payment confirmation was not found.");
  }
  return publicPaymentConfirmation(row);
}

export async function listStablecoinReconciliationCases(reviewOrderId: string) {
  const db = await getDatabase();
  const rows = await db.prepare(
    `${RECONCILIATION_SELECT} WHERE r.review_order_id = ? ORDER BY r.opened_at DESC`,
  ).bind(reviewOrderId).all<ReconciliationCaseRow>();
  return rows.results.map(publicReconciliationCase);
}

export async function applyReconciledStablecoinPayment(options: {
  reviewOrderId: string;
  paymentClaimId: string;
  actorEmail: string;
  idempotencyKey: string;
  body: unknown;
}) {
  const input = reconciliationInput(options.body);
  const db = await getDatabase();
  const reconciliation = await db.prepare(
    `${RECONCILIATION_SELECT}
     WHERE r.review_order_id = ? AND r.payment_claim_id = ? LIMIT 1`,
  ).bind(options.reviewOrderId, options.paymentClaimId).first<ReconciliationCaseRow>();
  if (!reconciliation) {
    throw new HttpProblem(404, "payment_reconciliation_not_found", "The payment reconciliation case was not found.");
  }
  const [idempotencyHash, requestHash] = await Promise.all([
    privateHash(
      "stablecoin-payment-reconciliation-idempotency",
      `${options.reviewOrderId}\u0000${options.paymentClaimId}\u0000${options.idempotencyKey}`,
    ),
    sha256Hex(stableStringify({ action: input.action, note: input.note })),
  ]);
  if (reconciliation.resolutionIdempotencyHash) {
    if (reconciliation.resolutionIdempotencyHash !== idempotencyHash) {
      throw new HttpProblem(409, "payment_reconciliation_closed", "This payment case already has a recorded resolution.");
    }
    if (reconciliation.resolutionRequestHash !== requestHash) {
      throw new HttpProblem(409, "payment_reconciliation_idempotency_conflict", "This reconciliation key was already used with different details.");
    }
    const replay = await confirmationForCase(db, reconciliation.id);
    if (!replay || reconciliation.state !== "resolved") {
      throw new HttpProblem(409, "payment_reconciliation_incomplete", "The recorded reconciliation did not complete safely. Escalate it for database review.");
    }
    return {
      confirmation: publicPaymentConfirmation(replay),
      reconciliation: publicReconciliationCase(reconciliation),
      replayed: true,
    };
  }

  const eligibility = reconciliationEligibility(reconciliation);
  if (!eligibility.allowed || !eligibility.receivedAsset) {
    throw new HttpProblem(409, "payment_reconciliation_not_applicable", eligibility.reason);
  }
  const expectedOrderStatus = reconciliation.phase === "deposit" ? "deposit_pending" : "balance_due";
  const nextOrderStatus = reconciliation.phase === "deposit" ? "deposit_paid" : "paid";
  if (reconciliation.orderStatus !== expectedOrderStatus || reconciliation.intentState !== "manual_review") {
    throw new HttpProblem(409, "payment_reconciliation_state_conflict", "The order or payment instruction changed. Reload the case before taking action.");
  }

  const now = Date.now();
  const confirmationId = `confirm-recon:${reconciliation.paymentClaimId}`;
  const publicRecord = {
    blockHash: reconciliation.blockHash!,
    blockNumber: reconciliation.blockNumber!,
    blockTimestamp: reconciliation.blockTimestamp!,
    confirmationsObserved: reconciliation.confirmationsObserved,
    confirmationsRequired: reconciliation.confirmationsRequired,
    evidenceHash: reconciliation.evidenceHash!,
    expectedAmountAtomic: reconciliation.expectedAmountAtomic,
    expectedAsset: reconciliation.expectedAsset,
    expectedTokenContract: reconciliation.expectedTokenContract,
    logIndex: reconciliation.logIndex!,
    obligationAmount: reconciliation.obligationAmount,
    obligationCurrency: reconciliation.obligationCurrency,
    phase: reconciliation.phase,
    proposalVersion: reconciliation.proposalVersion,
    receivedAmountAtomic: reconciliation.observedAmountAtomic!,
    receivedAsset: eligibility.receivedAsset,
    receivedTokenContract: reconciliation.observedTokenContract!,
    recipientAddress: reconciliation.observedRecipientAddress!,
    recordKind: "reconciliation",
    recordedAt: now,
    rpcAgreementCount: reconciliation.rpcAgreementCount,
    senderAddress: reconciliation.observedSenderAddress!,
    termsAcceptedAt: reconciliation.termsAcceptedAt,
    termsHash: reconciliation.termsHash,
    termsVersion: reconciliation.termsVersion,
    transactionHash: reconciliation.transactionHash,
  };
  const publicRecordHash = await sha256Hex(stableStringify(publicRecord));
  const receiptReference = `NZ-RECON-${publicRecordHash.slice(0, 32).toUpperCase()}`;
  const eventDetail = JSON.stringify({
    caseType: reconciliation.caseType,
    phase: reconciliation.phase,
    receivedAsset: eligibility.receivedAsset,
    receiptReference,
    transactionHash: reconciliation.transactionHash,
  });
  const notificationId = await deterministicNotificationDeliveryId(
    "review.lifecycle.buyer",
    reconciliation.reviewOrderId,
    reconciliation.id,
    "payment_reconciled",
  );
  const notification = await sealedNotificationPayload({
    action: "payment_reconciled",
    confirmationId,
    message: reconciliation.phase === "deposit"
      ? "Your finalized Ethereum transfer was reconciled and applied to the scheduling deposit. Do not send another payment for this phase."
      : "Your finalized Ethereum transfer was reconciled and applied to the final balance. Do not send another payment for this phase.",
    reference: reconciliation.orderReference,
    reviewOrderId: reconciliation.reviewOrderId,
  });

  await db.batch([
    db.prepare(`UPDATE review_stablecoin_reconciliation_cases
      SET state = 'application_pending', resolution_idempotency_hash = ?,
          resolution_request_hash = ?, resolution_code = 'applied_to_obligation',
          resolution_note = ?, resolution_decided_by_email = ?,
          resolution_decided_at = ?, updated_at = ?
      WHERE id = ? AND review_order_id = ? AND payment_claim_id = ?
        AND state IN ('open','investigating')
        AND resolution_idempotency_hash IS NULL
        AND NOT EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
          WHERE reconciliation_case_id = ?)
        AND EXISTS (SELECT 1 FROM review_orders
          WHERE id = ? AND status = ?)
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_intents
          WHERE id = ? AND state = 'manual_review')`).bind(
            idempotencyHash, requestHash, input.note, options.actorEmail,
            now, now, reconciliation.id, reconciliation.reviewOrderId,
            reconciliation.paymentClaimId, reconciliation.id,
            reconciliation.reviewOrderId, expectedOrderStatus,
            reconciliation.paymentIntentId,
          ),
    db.prepare(`INSERT INTO review_stablecoin_payment_confirmations (
      id, review_order_id, payment_intent_id, payment_claim_id,
      reconciliation_case_id, record_kind, phase, expected_asset,
      expected_token_contract, received_asset, received_token_contract,
      recipient_address, sender_address, expected_amount_atomic,
      received_amount_atomic, obligation_amount, obligation_currency,
      transaction_hash, block_number, block_hash, log_index, block_timestamp,
      confirmations_observed, confirmations_required, rpc_agreement_count,
      evidence_hash, proposal_version, terms_version, terms_hash,
      terms_accepted_at, confirmed_at, recorded_at, recorded_by_type,
      recorded_by_email, public_record_hash, receipt_reference
    ) SELECT ?, r.review_order_id, r.payment_intent_id, r.payment_claim_id,
        r.id, 'reconciliation', r.phase, r.expected_asset,
        r.expected_token_contract, ?, r.observed_token_contract,
        r.observed_recipient_address, r.observed_sender_address,
        r.expected_amount_atomic, r.observed_amount_atomic,
        i.obligation_amount, i.obligation_currency, r.transaction_hash,
        r.block_number, r.block_hash, r.log_index, r.block_timestamp,
        r.confirmations_observed, r.confirmations_required,
        r.rpc_agreement_count, r.evidence_hash, i.proposal_version,
        i.terms_version, i.terms_hash, i.terms_accepted_at, ?, ?,
        'operator', ?, ?, ?
      FROM review_stablecoin_reconciliation_cases r
      JOIN review_stablecoin_payment_intents i ON i.id = r.payment_intent_id
      WHERE r.id = ? AND r.state = 'application_pending'
        AND r.resolution_idempotency_hash = ?
        AND r.resolution_request_hash = ?`).bind(
          confirmationId, eligibility.receivedAsset, now, now,
          options.actorEmail, publicRecordHash, receiptReference,
          reconciliation.id, idempotencyHash, requestHash,
        ),
    db.prepare(`UPDATE review_stablecoin_payment_intents
      SET state = 'verified', verified_at = ?, updated_at = ?
      WHERE id = ? AND state = 'manual_review'
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
          WHERE id = ? AND reconciliation_case_id = ?)`).bind(
            now, now, reconciliation.paymentIntentId, confirmationId,
            reconciliation.id,
          ),
    db.prepare(`UPDATE review_orders SET status = ?, next_action = ?, updated_at = ?
      WHERE id = ? AND status = ?
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
          WHERE id = ? AND reconciliation_case_id = ?)`).bind(
            nextOrderStatus,
            reconciliation.phase === "deposit"
              ? "Wait for Nodezuno to confirm artifact readiness and schedule the review."
              : "Nodezuno will release the final evidence package under the accepted proposal.",
            now, reconciliation.reviewOrderId, expectedOrderStatus,
            confirmationId, reconciliation.id,
          ),
    db.prepare(`INSERT INTO review_order_events
      (id, review_order_id, event_type, actor_type, actor_email,
       detail_json, created_at)
      SELECT ?, ?, 'payment.reconciled', 'admin', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders WHERE id = ? AND status = ?)
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
          WHERE id = ?)`).bind(
            `payment-reconciled:${reconciliation.paymentClaimId}`,
            reconciliation.reviewOrderId, options.actorEmail, eventDetail, now,
            reconciliation.reviewOrderId, nextOrderStatus, confirmationId,
          ),
    db.prepare(`INSERT INTO admin_audit_events
      (id, actor_email, action, entity_type, entity_id, before_json,
       after_json, created_at)
      SELECT ?, ?, 'stablecoin_payment.reconcile', 'payment_reconciliation',
             ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
        WHERE id = ?)`).bind(
          crypto.randomUUID(), options.actorEmail, reconciliation.id,
          JSON.stringify({ state: reconciliation.state, caseType: reconciliation.caseType }),
          JSON.stringify({ state: "resolved", resolutionCode: "applied_to_obligation", receiptReference }),
          now, confirmationId,
        ),
    db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.lifecycle.buyer', ?, 'pending', 0,
             'review-lifecycle-buyer-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
        WHERE id = ?)`).bind(
          notificationId, notificationId, reconciliation.reviewOrderId,
          notification.json, notification.hash, now, now, now, confirmationId,
        ),
    db.prepare(`UPDATE review_stablecoin_reconciliation_cases
      SET state = 'resolved', resolved_at = ?, updated_at = ?
      WHERE id = ? AND state = 'application_pending'
        AND resolution_idempotency_hash = ?
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_confirmations
          WHERE id = ? AND reconciliation_case_id = ?)
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_intents
          WHERE id = ? AND state = 'verified')
        AND EXISTS (SELECT 1 FROM review_orders
          WHERE id = ? AND status = ?)`).bind(
            now, now, reconciliation.id, idempotencyHash, confirmationId,
            reconciliation.id, reconciliation.paymentIntentId,
            reconciliation.reviewOrderId, nextOrderStatus,
          ),
  ]);

  const [resolved, confirmation] = await Promise.all([
    db.prepare(`${RECONCILIATION_SELECT} WHERE r.id = ? LIMIT 1`)
      .bind(reconciliation.id).first<ReconciliationCaseRow>(),
    confirmationForCase(db, reconciliation.id),
  ]);
  if (!resolved || resolved.state !== "resolved" || !confirmation) {
    throw new HttpProblem(409, "payment_reconciliation_conflict", "The payment case changed before it could be applied. Reload it before retrying.");
  }
  return {
    confirmation: publicPaymentConfirmation(confirmation),
    reconciliation: publicReconciliationCase(resolved),
    replayed: false,
  };
}

async function confirmationForCase(db: D1Database, caseId: string) {
  return db.prepare(
    `${PAYMENT_CONFIRMATION_SELECT} WHERE reconciliation_case_id = ? LIMIT 1`,
  ).bind(caseId).first<PaymentConfirmationRow>();
}

function reconciliationInput(body: unknown): {
  action: "apply_to_obligation";
  note: string;
} {
  if (!isRecord(body)) {
    throw new HttpProblem(422, "validation_failed", "Provide a reviewed reconciliation decision.");
  }
  const allowed = new Set(["action", "note"]);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (
    Object.keys(body).some((key) => !allowed.has(key)) ||
    body.action !== "apply_to_obligation" ||
    note.length < 12 ||
    note.length > 4_000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
  ) {
    throw new HttpProblem(422, "validation_failed", "Choose apply to obligation and record a meaningful 12 to 4,000 character decision note.");
  }
  return { action: "apply_to_obligation", note };
}

function reconciliationEligibility(row: ReconciliationCaseRow): {
  allowed: boolean;
  reason: string;
  receivedAsset: "USDC" | "USDT" | null;
} {
  if (row.caseType === "transfer_ambiguous") {
    return blocked("Ambiguous receipts cannot be applied automatically because one stored transfer does not prove the total received.");
  }
  if (!row.observedSenderAddress || !row.observedTokenContract ||
      !row.observedRecipientAddress || !row.observedAmountAtomic ||
      !row.blockNumber || !row.blockHash || !row.logIndex ||
      row.blockTimestamp === null || !row.evidenceHash) {
    return blocked("The reconciliation case does not contain complete immutable Ethereum evidence.");
  }
  if (
    row.confirmationsObserved < row.confirmationsRequired ||
    row.rpcAgreementCount < 2
  ) {
    return blocked("The transfer has not met the required independent confirmation evidence.");
  }
  if (lower(row.observedRecipientAddress) !== lower(row.expectedRecipientAddress)) {
    return blocked("Only a finalized transfer received by the configured Nodezuno wallet can be applied.");
  }
  const receivedAsset = assetForContract(row.observedTokenContract);
  if (!receivedAsset) {
    return blocked("Only official Ethereum USDC or USDT can be applied to an obligation.");
  }
  const baseAmountAtomic = (BigInt(row.obligationAmount) * 10_000n).toString();
  const matchesBaseAmount = row.observedAmountAtomic === baseAmountAtomic;
  const matchesInstructionAmount = row.observedAmountAtomic === row.expectedAmountAtomic;
  if (row.caseType === "amount_mismatch") {
    if (receivedAsset !== row.expectedAsset || !matchesBaseAmount) {
      return blocked("An amount mismatch can be applied only when the official selected token paid the exact contractual amount without the fractional reference units.");
    }
  } else if (row.caseType === "asset_mismatch") {
    if (receivedAsset === row.expectedAsset || (!matchesBaseAmount && !matchesInstructionAmount)) {
      return blocked("An asset mismatch can be applied only when the other official stablecoin paid the exact contractual or issued amount.");
    }
  } else if (row.caseType === "transfer_after_expiry") {
    if (receivedAsset !== row.expectedAsset || (!matchesBaseAmount && !matchesInstructionAmount)) {
      return blocked("A late transfer can be applied only when the official selected token paid the exact contractual or issued amount.");
    }
  } else {
    return blocked("This reconciliation case cannot be applied to an obligation.");
  }
  return { allowed: true, reason: "Eligible for a recorded operator decision.", receivedAsset };
}

function publicReconciliationCase(row: ReconciliationCaseRow) {
  const eligibility = reconciliationEligibility(row);
  return {
    id: row.id,
    paymentClaimId: row.paymentClaimId,
    transactionHash: row.transactionHash,
    explorerUrl: `https://etherscan.io/tx/${row.transactionHash}`,
    caseType: row.caseType,
    state: row.state,
    phase: row.phase,
    expected: {
      asset: row.expectedAsset,
      tokenContract: row.expectedTokenContract,
      recipient: row.expectedRecipientAddress,
      amountAtomic: row.expectedAmountAtomic,
      amountDisplay: atomicDisplay(row.expectedAmountAtomic),
      instructionExpiresAt: iso(row.instructionExpiresAt),
    },
    observed: {
      asset: row.observedTokenContract ? assetForContract(row.observedTokenContract) : null,
      tokenContract: row.observedTokenContract,
      recipient: row.observedRecipientAddress,
      sender: row.observedSenderAddress,
      amountAtomic: row.observedAmountAtomic,
      amountDisplay: row.observedAmountAtomic ? atomicDisplay(row.observedAmountAtomic) : null,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      logIndex: row.logIndex,
      blockTimestamp: iso(row.blockTimestamp),
      confirmations: row.confirmationsObserved,
      rpcAgreementCount: row.rpcAgreementCount,
      evidenceHash: row.evidenceHash,
    },
    resolution: row.resolutionCode ? {
      code: row.resolutionCode,
      note: row.resolutionNote,
      decidedBy: row.resolutionDecidedByEmail,
      decidedAt: iso(row.resolutionDecidedAt),
      resolvedAt: iso(row.resolvedAt),
    } : null,
    openedAt: iso(row.openedAt),
    eligibility: {
      canApplyToObligation: eligibility.allowed,
      reason: eligibility.reason,
    },
  };
}

function publicPaymentConfirmation(row: PaymentConfirmationRow) {
  return {
    id: row.id,
    receiptReference: row.receiptReference,
    recordHash: row.publicRecordHash,
    recordKind: row.recordKind,
    phase: row.phase,
    expectedAsset: row.expectedAsset,
    receivedAsset: row.receivedAsset,
    receivedTokenContract: row.receivedTokenContract,
    recipient: row.recipientAddress,
    sender: row.senderAddress,
    expectedAmountAtomic: row.expectedAmountAtomic,
    receivedAmountAtomic: row.receivedAmountAtomic,
    receivedAmount: atomicDisplay(row.receivedAmountAtomic),
    obligationAmount: row.obligationAmount,
    obligationCurrency: row.obligationCurrency,
    transactionHash: row.transactionHash,
    explorerUrl: `https://etherscan.io/tx/${row.transactionHash}`,
    blockNumber: row.blockNumber,
    blockHash: row.blockHash,
    logIndex: row.logIndex,
    blockTimestamp: iso(row.blockTimestamp),
    confirmationsObserved: row.confirmationsObserved,
    confirmationsRequired: row.confirmationsRequired,
    rpcAgreementCount: row.rpcAgreementCount,
    evidenceHash: row.evidenceHash,
    proposalVersion: row.proposalVersion,
    termsVersion: row.termsVersion,
    termsHash: row.termsHash,
    termsAcceptedAt: iso(row.termsAcceptedAt),
    confirmedAt: iso(row.confirmedAt),
    recordedAt: iso(row.recordedAt),
    recordedBy: row.recordedByType,
    notice: "Payment confirmation only. This record is not a tax invoice or a custody receipt.",
  };
}

function assetForContract(contract: string): "USDC" | "USDT" | null {
  const normalized = lower(contract);
  if (normalized === lower(STABLECOIN_ASSETS.USDC.contract)) return "USDC";
  if (normalized === lower(STABLECOIN_ASSETS.USDT.contract)) return "USDT";
  return null;
}

function atomicDisplay(value: string): string {
  const normalized = value.padStart(7, "0");
  const integer = normalized.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = normalized.slice(-6).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function blocked(reason: string) {
  return { allowed: false, reason, receivedAsset: null } as const;
}

function lower(value: string): string {
  return value.toLowerCase();
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
