import { privateHash, sha256Hex, stableStringify } from "./crypto.ts";
import { getDatabase } from "./database-binding.ts";
import {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "./notification-outbox.ts";
import { HttpProblem } from "./http.ts";
import {
  ETHEREUM_MAINNET_CHAIN_ID,
  ETHEREUM_TRANSFER_TOPIC,
  LATE_PAYMENT_CLAIM_GRACE_MS,
  MINIMUM_PAYMENT_RPC_ENDPOINTS,
  type EthereumRpcEndpoint,
  STABLECOIN_ASSETS,
  type StablecoinAsset,
  stablecoinPaymentConfiguration,
} from "./stablecoin-payment-config.ts";
import {
  publicStablecoinPayment,
  STABLECOIN_CLAIM_SELECT,
  STABLECOIN_INTENT_SELECT,
  type StablecoinPaymentClaimRow,
  type StablecoinPaymentIntentRow,
} from "./stablecoin-payment-store.ts";
import { stablecoinPaymentVerifierIsReady } from "./stablecoin-payment-health.ts";
import { refreshStablecoinPaymentVerifierHealth } from "./stablecoin-payment-health.ts";
import {
  SERVICE_TERMS_VERSION,
  serviceTermsHash,
} from "./service-agreement.ts";
import { isFixedPriceReviewTarget } from "../review-targets.ts";

export const ETHEREUM_TRANSACTION_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
export const TELEGRAM_USERNAME_PATTERN = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/;
export const STABLECOIN_PAYMENT_INTENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYMENT_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const CLAIM_LEASE_MS = 45_000;
const MAX_VERIFICATION_ATTEMPTS = 96;
const MAX_VERIFICATION_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
const MAX_CLAIMS_PER_INTENT = 5;
const MAX_PAYMENT_INTENTS_PER_PHASE = 4;
const BASE_ATOMIC_UNITS_PER_CENT = 10_000n;
const SELLER_RECEIVED_FAILURE_CODES = new Set([
  "amount_mismatch",
  "asset_mismatch",
  "transfer_ambiguous",
  "transfer_after_expiry",
]);

type PaymentPhase = "deposit" | "balance";

export async function createStablecoinPaymentIntent(options: {
  request: Request;
  id: string;
  phase: PaymentPhase;
  proposalVersion: number;
  asset: StablecoinAsset;
  idempotencyKey: string;
}) {
  const {
    authorizeReviewOrder,
    publicReviewOrder,
  } = await import("./review-commerce.ts");
  const order = await authorizeReviewOrder(options.request, options.id);
  if (!isFixedPriceReviewTarget(order.targetChain)) {
    throw new HttpProblem(
      409,
      "fixed_price_payment_unavailable",
      "This target is not in the supported fixed-price review catalog. No payment instruction was created.",
    );
  }
  const config = await requireStablecoinPayments();
  const expectedPhase: PaymentPhase = order.status === "balance_due"
    ? "balance"
    : "deposit";
  if (options.phase !== expectedPhase) {
    throw new HttpProblem(409, "payment_phase_invalid", "This payment phase is not currently due.");
  }
  if (expectedPhase === "deposit" && !["proposal_ready", "deposit_pending"].includes(order.status)) {
    throw new HttpProblem(409, "proposal_not_payable", "The current service order is not payable.");
  }
  if (expectedPhase === "balance" && order.status !== "balance_due") {
    throw new HttpProblem(409, "balance_not_due", "The final balance is not currently due.");
  }
  if (order.proposalVersion === null || order.proposalVersion !== options.proposalVersion) {
    throw new HttpProblem(409, "proposal_expired", "Refresh the current service order before accepting it.");
  }
  if (
    expectedPhase === "deposit" &&
    (!order.proposalExpiresAt || order.proposalExpiresAt <= Date.now())
  ) {
    throw new HttpProblem(409, "proposal_expired", "Refresh the current service order before accepting it.");
  }
  const token = STABLECOIN_ASSETS[options.asset];
  if (!token) throw new HttpProblem(422, "asset_invalid", "Choose USDC or USDT on Ethereum mainnet.");

  const db = await getDatabase();
  const now = Date.now();
  if (
    config.mode === "ethereum_mainnet" &&
    !await stablecoinPaymentVerifierIsReady(config, db, now)
  ) {
    throw new HttpProblem(
      503,
      "payment_verifier_unhealthy",
      "Ethereum payment verification is temporarily unavailable. No payment instruction was created.",
    );
  }
  const [creationIdempotencyHash, creationRequestHash, acceptedTermsHash] = await Promise.all([
    privateHash(
      "stablecoin-payment-intent-idempotency",
      `${order.id}\u0000${options.idempotencyKey}`,
    ),
    sha256Hex(stableStringify({
      reviewOrderId: order.id,
      phase: options.phase,
      proposalVersion: options.proposalVersion,
      asset: options.asset,
    })),
    serviceTermsHash(),
  ]);
  const replay = await db.prepare(
    `${STABLECOIN_INTENT_SELECT} WHERE creation_idempotency_hash = ? LIMIT 1`,
  ).bind(creationIdempotencyHash).first<StablecoinPaymentIntentRow>();
  if (replay) {
    if (replay.creationRequestHash !== creationRequestHash) {
      throw new HttpProblem(
        409,
        "payment_idempotency_conflict",
        "This payment request key was already used with different details.",
      );
    }
    if (["expired", "cancelled", "refunded"].includes(replay.state)
      || (replay.state === "awaiting_transfer" && replay.expiresAt <= now)) {
      throw new HttpProblem(
        409,
        "payment_instruction_expired",
        "This payment instruction is no longer valid for a new transfer. Refresh your order. If you already sent funds, submit the original transaction hash while its evidence window is open; do not pay again.",
      );
    }
    return {
      payment: publicStablecoinPayment(replay, await latestClaimForIntent(db, replay.id)),
      order: await publicReviewOrder(order),
      configuration: publicPaymentConfiguration(replay.confirmationsRequired, config.mode),
    };
  }
  await db.prepare(`UPDATE review_stablecoin_payment_intents
    SET state = 'expired', updated_at = ?
    WHERE review_order_id = ? AND phase = ? AND expires_at + ? <= ?
      AND state = 'awaiting_transfer'
      AND NOT EXISTS (
        SELECT 1 FROM review_stablecoin_payment_claims
        WHERE payment_intent_id = review_stablecoin_payment_intents.id
          AND state IN ('submitted','checking','confirming','verified','manual_review')
      )`).bind(
        now, order.id, expectedPhase, LATE_PAYMENT_CLAIM_GRACE_MS, now,
      ).run();

  let existing = await activeIntentForPhase(db, order.id, expectedPhase);
  if (existing) {
    if (existing.state === "awaiting_transfer" && existing.expiresAt <= now) {
      throw new HttpProblem(
        409,
        "payment_instruction_claim_window_open",
        `The previous instruction expired but remains open for transaction evidence until ${new Date(
          existing.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS,
        ).toISOString()}. Submit its transaction hash if funds were sent, or wait until that deadline before creating another instruction.`,
      );
    }
    if (existing.asset === options.asset && existing.proposalVersion === options.proposalVersion) {
      const claim = await latestClaimForIntent(db, existing.id);
      return {
        payment: publicStablecoinPayment(existing, claim),
        order: await publicReviewOrder(order),
        configuration: publicPaymentConfiguration(config.confirmationsRequired, config.mode),
      };
    }
    const activeClaim = await db.prepare(`SELECT id FROM review_stablecoin_payment_claims
      WHERE payment_intent_id = ? AND state IN ('submitted','checking','confirming','verified','manual_review')
      LIMIT 1`).bind(existing.id).first<{ id: string }>();
    if (activeClaim) {
      throw new HttpProblem(
        409,
        "payment_claim_in_progress",
        "A submitted transaction must be resolved before changing the payment asset.",
      );
    }
    await db.prepare(`UPDATE review_stablecoin_payment_intents
      SET state = 'cancelled', cancelled_at = ?, updated_at = ?
      WHERE id = ? AND state = 'awaiting_transfer'`).bind(now, now, existing.id).run();
    existing = null;
  }

  const priorIntentCount = Number(await db.prepare(`SELECT COUNT(*) AS count
    FROM review_stablecoin_payment_intents
    WHERE review_order_id = ? AND phase = ?`).bind(
      order.id, expectedPhase,
    ).first<number>("count") ?? 0);
  if (priorIntentCount >= MAX_PAYMENT_INTENTS_PER_PHASE) {
    throw new HttpProblem(
      409,
      "payment_asset_change_limit",
      "This payment phase needs operator review before another instruction can be created.",
    );
  }

  const obligationAmount = expectedPhase === "deposit"
    ? order.depositAmount
    : order.balanceAmount;
  const expiresAt = expectedPhase === "deposit" && order.proposalExpiresAt
    ? Math.min(order.proposalExpiresAt, now + PAYMENT_INTENT_LIFETIME_MS)
    : now + PAYMENT_INTENT_LIFETIME_MS;

  let created: StablecoinPaymentIntentRow | null = null;
  for (let candidate = 0; candidate < 24 && !created; candidate += 1) {
    const referenceUnits = await referenceUnitsFor(
      `${order.id}\u0000${expectedPhase}\u0000${options.asset}\u0000${options.proposalVersion}\u0000${candidate}\u0000${crypto.randomUUID()}`,
    );
    const amountAtomic = paymentAmountAtomic(obligationAmount, referenceUnits);
    const intentId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO review_stablecoin_payment_intents
        (id, review_order_id, phase, state, asset, chain_id, network,
         token_contract, token_decimals, recipient_address,
         obligation_amount, obligation_currency, token_amount_atomic,
         token_amount_display, reference_units, proposal_version,
         terms_accepted_at, confirmations_required, terms_version, terms_hash,
         creation_idempotency_hash, creation_request_hash,
         expires_at, created_at, updated_at)
        SELECT ?, id, ?, 'awaiting_transfer', ?, 1, 'ethereum', ?, 6, ?,
               ?, 'usd', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM review_orders
        WHERE id = ? AND proposal_version = ?
          AND status IN (${expectedPhase === "deposit" ? "'proposal_ready','deposit_pending'" : "'balance_due'"})`).bind(
            intentId, expectedPhase, options.asset, token.contract,
            config.recipient, obligationAmount, amountAtomic,
            paymentAmountDisplay(amountAtomic), referenceUnits,
            options.proposalVersion, now, config.confirmationsRequired,
            SERVICE_TERMS_VERSION, acceptedTermsHash,
            creationIdempotencyHash, creationRequestHash,
            expiresAt, now, now,
            order.id, options.proposalVersion,
          ),
      db.prepare(`UPDATE review_orders
        SET status = ?, proposal_accepted_at = COALESCE(proposal_accepted_at, ?),
            next_action = ?, updated_at = ?
        WHERE id = ? AND proposal_version = ?
          AND EXISTS (SELECT 1 FROM review_stablecoin_payment_intents WHERE id = ?)`).bind(
            expectedPhase === "deposit" ? "deposit_pending" : "balance_due",
            now,
            `Send the exact ${options.asset} amount on Ethereum mainnet, then submit the transaction hash and Telegram username.`,
            now, order.id, options.proposalVersion, intentId,
          ),
      db.prepare(`INSERT OR IGNORE INTO review_order_events
        (id, review_order_id, event_type, actor_type, detail_json, created_at)
        SELECT ?, ?, 'payment.intent_created', 'buyer', ?, ?
        WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_intents WHERE id = ?)`).bind(
          intentId, order.id,
          JSON.stringify({ phase: expectedPhase, asset: options.asset, chainId: 1, proposalVersion: options.proposalVersion }),
          now, intentId,
        ),
    ]);
    created = await db.prepare(`${STABLECOIN_INTENT_SELECT} WHERE id = ? LIMIT 1`)
      .bind(intentId).first<StablecoinPaymentIntentRow>();
    if (!created) {
      const concurrent = await activeIntentForPhase(db, order.id, expectedPhase);
      if (concurrent) created = concurrent;
    }
  }
  if (!created) {
    throw new HttpProblem(503, "payment_intent_unavailable", "A unique payment instruction could not be reserved safely.");
  }
  const currentOrder = await authorizeReviewOrder(options.request, order.id);
  return {
    payment: publicStablecoinPayment(created, await latestClaimForIntent(db, created.id)),
    order: await publicReviewOrder(currentOrder),
    configuration: publicPaymentConfiguration(config.confirmationsRequired, config.mode),
  };
}

export async function submitStablecoinPaymentClaim(options: {
  request: Request;
  reviewOrderId: string;
  paymentIntentId: string;
  transactionHash: string;
  telegramUsername: string;
}) {
  const { authorizeReviewOrder } = await import("./review-commerce.ts");
  // Manual mode stores the customer-submitted transaction and contact details
  // for the operator. A transaction hash is never treated as proof of payment.
  const config = await stablecoinPaymentConfiguration();
  const order = await authorizeReviewOrder(options.request, options.reviewOrderId);
  const transactionHash = normalizeTransactionHash(options.transactionHash);
  const telegramUsername = normalizeTelegramUsername(options.telegramUsername);
  const db = await getDatabase();
  const intent = await db.prepare(
    `${STABLECOIN_INTENT_SELECT} WHERE id = ? AND review_order_id = ? LIMIT 1`,
  ).bind(options.paymentIntentId, order.id).first<StablecoinPaymentIntentRow>();
  if (!intent) throw new HttpProblem(404, "payment_intent_not_found", "The payment instruction was not found.");
  if (["verified", "cancelled", "refunded"].includes(intent.state)) {
    throw new HttpProblem(409, "payment_intent_closed", "This payment instruction is already closed.");
  }
  const now = Date.now();
  if (intent.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS <= now) {
    await db.prepare(`UPDATE review_stablecoin_payment_intents SET state = 'expired', updated_at = ?
      WHERE id = ? AND state != 'verified'`).bind(now, intent.id).run();
    throw new HttpProblem(409, "payment_intent_expired", "This payment instruction expired. Create a fresh instruction before sending funds.");
  }
  const existingTransaction = await db.prepare(
    `${STABLECOIN_CLAIM_SELECT} WHERE transaction_hash = ? LIMIT 1`,
  ).bind(transactionHash).first<StablecoinPaymentClaimRow>();
  if (existingTransaction) {
    if (existingTransaction.paymentIntentId !== intent.id) {
      throw new HttpProblem(409, "transaction_already_claimed", "This transaction hash is already attached to another payment instruction.");
    }
    if (existingTransaction.telegramUsername !== telegramUsername) {
      throw new HttpProblem(
        409,
        "transaction_claim_details_conflict",
        "This transaction hash was already submitted with different contact details.",
      );
    }
    return {
      claim: existingTransaction,
      payment: publicStablecoinPayment(intent, existingTransaction),
      configuration: publicPaymentConfiguration(config.confirmationsRequired, config.mode),
    };
  }
  const activeClaim = await db.prepare(
    `${STABLECOIN_CLAIM_SELECT} WHERE payment_intent_id = ?
     AND state IN ('submitted','checking','confirming','verified','manual_review')
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(intent.id).first<StablecoinPaymentClaimRow>();
  if (activeClaim) {
    throw new HttpProblem(409, "payment_claim_in_progress", "A transaction is already being verified for this payment instruction.");
  }
  const priorCount = Number(await db.prepare(
    `SELECT COUNT(*) AS count FROM review_stablecoin_payment_claims WHERE payment_intent_id = ?`,
  ).bind(intent.id).first<number>("count") ?? 0);
  if (priorCount >= MAX_CLAIMS_PER_INTENT) {
    throw new HttpProblem(409, "payment_claim_limit", "This payment instruction needs manual review before another transaction can be submitted.");
  }
  const claimId = crypto.randomUUID();
  const manualCheck = config.mode === "manual_ethereum";
  const claimState = manualCheck ? "manual_review" : "submitted";
  const paymentIntentState = manualCheck ? "manual_review" : "submitted";
  const nextAction = manualCheck
    ? "Transaction details received. Nodezuno will check the transfer manually and contact you. Do not send another payment."
    : "Wait for Ethereum confirmation and deterministic payment verification. Do not send a second transfer.";
  const buyerDeliveryId = manualCheck
    ? await deterministicNotificationDeliveryId(
      "review.lifecycle.buyer", order.id, intent.id, claimId,
      "payment_submission_received",
    )
    : null;
  const operatorDeliveryId = manualCheck
    ? await deterministicNotificationDeliveryId(
      "review.application.received.operator", order.id, claimId,
      "payment_submission_received",
    )
    : null;
  const buyerNotification = manualCheck
    ? await sealedNotificationPayload({
      action: "payment_submission_received",
      message: "We received your transaction details. This is not confirmation that funds arrived. Nodezuno will check the transaction manually and contact you by email or Telegram. Do not send another transfer.",
      reference: order.reference,
      reviewOrderId: order.id,
    })
    : null;
  const operatorNotification = manualCheck
    ? await sealedNotificationPayload({
      action: "payment_submission_received",
      claimId,
      reference: order.reference,
      reviewOrderId: order.id,
    })
    : null;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO review_stablecoin_payment_claims
      (id, payment_intent_id, transaction_hash, telegram_username, state,
       confirmations, rpc_agreement_count, attempt_count, next_check_at,
       submitted_at, created_at, updated_at)
      SELECT ?, id, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?
      FROM review_stablecoin_payment_intents
      WHERE id = ? AND review_order_id = ?
        AND state IN ('awaiting_transfer','expired','submitted','confirming','manual_review')`).bind(
          claimId, transactionHash, telegramUsername, claimState, now, now, now, now,
          intent.id, order.id,
        ),
    db.prepare(`UPDATE review_stablecoin_payment_intents SET state = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims WHERE id = ?)`).bind(
        paymentIntentState, now, intent.id, claimId,
      ),
    db.prepare(`UPDATE review_orders SET telegram_username = ?,
      next_action = ?, updated_at = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims WHERE id = ?)`).bind(
        telegramUsername,
        nextAction,
        now, order.id, claimId,
      ),
    db.prepare(`INSERT OR IGNORE INTO review_order_events
      (id, review_order_id, event_type, actor_type, detail_json, created_at)
      SELECT ?, ?, 'payment.claim_submitted', 'buyer', ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims WHERE id = ?)`).bind(
        claimId, order.id,
        JSON.stringify({ phase: intent.phase, asset: intent.asset, transactionHash }),
        now, claimId,
      ),
    ...(manualCheck && buyerNotification && buyerDeliveryId
      ? [db.prepare(`INSERT OR IGNORE INTO notification_outbox
        (id, delivery_id, topic, entity_id, state, attempts, template_version,
         payload_json, payload_hash, available_at, created_at, updated_at)
        SELECT ?, ?, 'review.lifecycle.buyer', ?, 'pending', 0,
               'review-lifecycle-buyer-v1', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims WHERE id = ?)`)
        .bind(buyerDeliveryId, buyerDeliveryId, order.id,
          buyerNotification.json, buyerNotification.hash, now, now, now, claimId)]
      : []),
    ...(manualCheck && operatorNotification && operatorDeliveryId
      ? [db.prepare(`INSERT OR IGNORE INTO notification_outbox
        (id, delivery_id, topic, entity_id, state, attempts, template_version,
         payload_json, payload_hash, available_at, created_at, updated_at)
        SELECT ?, ?, 'review.application.received.operator', ?, 'pending', 0,
               'review-application-operator-v1', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims WHERE id = ?)`)
        .bind(operatorDeliveryId, operatorDeliveryId, order.id,
          operatorNotification.json, operatorNotification.hash, now, now, now, claimId)]
      : []),
  ]);
  const claim = await db.prepare(`${STABLECOIN_CLAIM_SELECT} WHERE id = ? LIMIT 1`)
    .bind(claimId).first<StablecoinPaymentClaimRow>();
  if (!claim) throw new HttpProblem(409, "payment_claim_conflict", "The transaction claim could not be reserved safely.");
  return {
    claim,
    payment: publicStablecoinPayment(intent, claim),
    configuration: publicPaymentConfiguration(config.confirmationsRequired, config.mode),
  };
}

export async function verifyStablecoinPaymentClaim(
  claimId: string,
): Promise<{ state: string; claimId: string }> {
  const db = await getDatabase();
  const now = Date.now();
  const leaseToken = await sha256Hex(`payment-claim-lease\u0000${claimId}\u0000${crypto.randomUUID()}`);
  await db.prepare(`UPDATE review_stablecoin_payment_claims
    SET state = 'checking', lease_token = ?, lease_expires_at = ?,
        attempt_count = attempt_count + 1, last_checked_at = ?, updated_at = ?
    WHERE id = ?
      AND state IN ('submitted','confirming','checking')
      AND (lease_token IS NULL OR lease_expires_at <= ?)`
  ).bind(leaseToken, now + CLAIM_LEASE_MS, now, now, claimId, now).run();
  const claim = await db.prepare(
    `${STABLECOIN_CLAIM_SELECT} WHERE id = ? AND lease_token = ? LIMIT 1`,
  ).bind(claimId, leaseToken).first<StablecoinPaymentClaimRow>();
  if (!claim) {
    const current = await db.prepare(`${STABLECOIN_CLAIM_SELECT} WHERE id = ? LIMIT 1`)
      .bind(claimId).first<StablecoinPaymentClaimRow>();
    if (!current) throw new HttpProblem(404, "payment_claim_not_found", "The payment claim was not found.");
    return { state: current.state, claimId: current.id };
  }
  const intent = await db.prepare(`${STABLECOIN_INTENT_SELECT} WHERE id = ? LIMIT 1`)
    .bind(claim.paymentIntentId).first<StablecoinPaymentIntentRow>();
  if (!intent) {
    await releaseClaimForManualReview(db, claim, leaseToken, "intent_missing", now);
    return { state: "manual_review", claimId };
  }
  if (
    claim.attemptCount >= MAX_VERIFICATION_ATTEMPTS ||
    now - claim.submittedAt >= MAX_VERIFICATION_AGE_MS
  ) {
    await releaseClaimForManualReview(
      db,
      claim,
      leaseToken,
      "verification_retry_exhausted",
      now,
      intent,
    );
    return { state: "manual_review", claimId };
  }
  const config = await stablecoinPaymentConfiguration();
  if (
    config.mode !== "ethereum_mainnet" ||
    !config.ready ||
    config.endpoints.length < MINIMUM_PAYMENT_RPC_ENDPOINTS
  ) {
    await releaseClaimForRetry(db, claim, leaseToken, "verification_unavailable", now, 5 * 60_000);
    return { state: "confirming", claimId };
  }

  const observations = await Promise.all(
    config.endpoints.map((endpoint) => observeTransaction(endpoint, claim, intent, intent.confirmationsRequired)),
  );
  const usable = observations.filter((item): item is OnchainObservation => item.kind !== "rpc_error");
  if (usable.length !== observations.length || usable.length === 0) {
    await releaseClaimForRetry(db, claim, leaseToken, "rpc_unavailable", now, 60_000);
    return { state: "confirming", claimId };
  }
  if (usable.every((item) => item.kind === "not_found")) {
    if (now > intent.expiresAt + 24 * 60 * 60 * 1000) {
      await releaseClaimForManualReview(db, claim, leaseToken, "transaction_not_found", now, intent);
      return { state: "manual_review", claimId };
    }
    await releaseClaimForRetry(db, claim, leaseToken, "transaction_not_found", now, 30_000);
    return { state: "confirming", claimId };
  }
  if (usable.some((item) => item.kind === "not_found")) {
    await releaseClaimForRetry(db, claim, leaseToken, "rpc_disagreement", now, 45_000);
    return { state: "confirming", claimId };
  }
  const found = usable.filter((item): item is FoundObservation => item.kind === "found");
  if (found.length !== usable.length) {
    await releaseClaimForManualReview(db, claim, leaseToken, "rpc_disagreement", now, intent);
    return { state: "manual_review", claimId };
  }
  const signatures = new Set(found.map((item) => item.evidenceSignature));
  const failureCodes = new Set(found.map((item) => item.failureCode ?? ""));
  if (signatures.size !== 1 || failureCodes.size !== 1) {
    await releaseClaimForManualReview(db, claim, leaseToken, "rpc_disagreement", now, intent);
    return { state: "manual_review", claimId };
  }
  const representative = found[0];
  const confirmations = Math.min(...found.map((item) => item.confirmations));
  const evidenceHash = await sha256Hex(representative.evidenceSignature);
  if (representative.failureCode) {
    if (SELLER_RECEIVED_FAILURE_CODES.has(representative.failureCode)) {
      if (
        confirmations < intent.confirmationsRequired ||
        found.some((item) => !item.finalized)
      ) {
        await storeConfirmingEvidence(
          db, claim, intent, leaseToken, representative, confirmations,
          evidenceHash, found.length, now,
        );
        return { state: "confirming", claimId };
      }
      await storeManualReviewEvidence(
        db, claim, intent, leaseToken, representative,
        evidenceHash, found.length, now,
      );
      return { state: "manual_review", claimId };
    }
    await rejectClaim(db, claim, intent, leaseToken, representative, evidenceHash, found.length, now);
    const state = await claimState(db, claimId);
    return { state: state ?? "rejected", claimId };
  }
  if (
    confirmations < intent.confirmationsRequired ||
    found.some((item) => !item.finalized)
  ) {
    await storeConfirmingEvidence(
      db, claim, intent, leaseToken, representative, confirmations,
      evidenceHash, found.length, now,
    );
    return { state: "confirming", claimId };
  }
  const expectedOrderStatus = intent.phase === "deposit" ? "deposit_pending" : "balance_due";
  const orderState = await db.prepare("SELECT status FROM review_orders WHERE id = ? LIMIT 1")
    .bind(intent.reviewOrderId).first<{ status: string }>();
  if (orderState?.status !== expectedOrderStatus) {
    await releaseClaimForManualReview(db, claim, leaseToken, "commercial_state_conflict", now, intent);
    return { state: "manual_review", claimId };
  }
  const markedVerified = await markStablecoinPaymentVerified(
    db, claim, intent, leaseToken, representative, confirmations,
    evidenceHash, found.length, now,
  );
  if (!markedVerified) {
    await releaseClaimForManualReview(db, claim, leaseToken, "commercial_state_conflict", now, intent);
    const state = await claimState(db, claimId);
    return { state: state ?? "manual_review", claimId };
  }
  return { state: "verified", claimId };
}

export async function processPendingStablecoinPaymentClaims(
  limit = 25,
): Promise<{
  selected: number;
  processed: number;
  verified: number;
  confirming: number;
  rejected: number;
  manualReview: number;
  failed: number;
  deferred: number;
  verifierHealthy: boolean;
}> {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
  const db = await getDatabase();
  const now = Date.now();
  const verifierHealth = await refreshStablecoinPaymentVerifierHealth();
  const rows = await db.prepare(`SELECT id FROM review_stablecoin_payment_claims
    WHERE state IN ('submitted','confirming','checking')
      AND next_check_at <= ?
      AND (lease_token IS NULL OR lease_expires_at <= ?)
    ORDER BY next_check_at ASC, created_at ASC LIMIT ?`).bind(
      now, now, boundedLimit,
    ).all<{ id: string }>();
  const result = {
    selected: rows.results.length,
    processed: 0,
    verified: 0,
    confirming: 0,
    rejected: 0,
    manualReview: 0,
    failed: 0,
    deferred: 0,
    verifierHealthy: verifierHealth.healthy,
  };
  const deadline = performance.now() + 120_000;
  let cursor = 0;
  async function consume() {
    while (cursor < rows.results.length && performance.now() < deadline) {
      const row = rows.results[cursor];
      cursor += 1;
      try {
        const processed = await verifyStablecoinPaymentClaim(row.id);
        result.processed += 1;
        if (processed.state === "verified") result.verified += 1;
        else if (processed.state === "rejected") result.rejected += 1;
        else if (processed.state === "manual_review") result.manualReview += 1;
        else result.confirming += 1;
      } catch {
        result.failed += 1;
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(3, rows.results.length) },
    () => consume(),
  ));
  result.deferred = rows.results.length - cursor;
  return result;
}

export function normalizeTransactionHash(value: unknown): string {
  if (typeof value !== "string" || !ETHEREUM_TRANSACTION_HASH_PATTERN.test(value.trim())) {
    throw new HttpProblem(422, "transaction_hash_invalid", "Enter a complete Ethereum transaction hash beginning with 0x.");
  }
  return value.trim().toLowerCase();
}

export function normalizeTelegramUsername(value: unknown): string {
  if (typeof value !== "string" || !TELEGRAM_USERNAME_PATTERN.test(value.trim())) {
    throw new HttpProblem(422, "telegram_username_invalid", "Enter a valid Telegram username, such as @protocolops.");
  }
  const username = value.trim().replace(/^@/, "");
  return `@${username.toLowerCase()}`;
}

async function requireStablecoinPayments() {
  const config = await stablecoinPaymentConfiguration();
  if (
    config.mode === "disabled" ||
    !config.ready ||
    (config.mode === "ethereum_mainnet" &&
      config.endpoints.length < MINIMUM_PAYMENT_RPC_ENDPOINTS)
  ) {
    throw new HttpProblem(503, "stablecoin_payments_unavailable", "Ethereum payment instructions are not configured for this deployment.");
  }
  return config;
}

async function activeIntentForPhase(
  db: D1Database,
  orderId: string,
  phase: PaymentPhase,
) {
  return db.prepare(`${STABLECOIN_INTENT_SELECT}
    WHERE review_order_id = ? AND phase = ?
      AND state IN ('awaiting_transfer','submitted','confirming','manual_review')
    ORDER BY created_at DESC LIMIT 1`).bind(orderId, phase).first<StablecoinPaymentIntentRow>();
}

async function latestClaimForIntent(db: D1Database, intentId: string) {
  return db.prepare(`${STABLECOIN_CLAIM_SELECT}
    WHERE payment_intent_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(intentId).first<StablecoinPaymentClaimRow>();
}

async function referenceUnitsFor(seed: string): Promise<number> {
  const hash = await sha256Hex(seed);
  return (Number.parseInt(hash.slice(0, 8), 16) % 9_999) + 1;
}

function paymentAmountAtomic(amountCents: number, referenceUnits: number): string {
  return (BigInt(amountCents) * BASE_ATOMIC_UNITS_PER_CENT + BigInt(referenceUnits)).toString();
}

function paymentAmountDisplay(amountAtomic: string): string {
  const units = BigInt(amountAtomic);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

function publicPaymentConfiguration(
  confirmationsRequired: number,
  mode: "disabled" | "manual_ethereum" | "ethereum_mainnet" = "ethereum_mainnet",
) {
  return {
    confirmationsRequired,
    explorerTxBase: "https://etherscan.io/tx/",
    seller: "Sanjay Sudagani, sole proprietor trading as Nodezuno",
    paymentExperience: mode,
    automaticVerification: mode === "ethereum_mainnet",
    verification: mode === "manual_ethereum"
      ? "manual_operator_review"
      : "Ethereum JSON-RPC evidence",
  };
}

type RpcErrorObservation = { kind: "rpc_error"; endpoint: string };
type NotFoundObservation = { kind: "not_found"; endpoint: string };
type FoundObservation = {
  kind: "found";
  endpoint: string;
  failureCode: string | null;
  confirmations: number;
  finalized: boolean;
  evidenceSignature: string;
  sender: string | null;
  tokenContract: string | null;
  recipient: string | null;
  amountAtomic: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  logIndex: string | null;
  blockTimestamp: number | null;
};
type OnchainObservation = NotFoundObservation | FoundObservation;

async function observeTransaction(
  endpoint: EthereumRpcEndpoint,
  claim: StablecoinPaymentClaimRow,
  intent: StablecoinPaymentIntentRow,
  confirmationsRequired: number,
): Promise<RpcErrorObservation | OnchainObservation> {
  try {
    const [chainId, receipt, latestBlock, finalizedBlock] = await rpcBatch(endpoint, [
      ["eth_chainId", []],
      ["eth_getTransactionReceipt", [claim.transactionHash]],
      ["eth_blockNumber", []],
      ["eth_getBlockByNumber", ["finalized", false]],
    ]);
    if (chainId !== "0x1") return { kind: "rpc_error", endpoint: endpoint.name };
    if (receipt === null) return { kind: "not_found", endpoint: endpoint.name };
    if (
      !isRecord(receipt) ||
      !isHexQuantity(latestBlock) ||
      !isRecord(finalizedBlock) ||
      !isHexQuantity(finalizedBlock.number) ||
      !lowerHex(finalizedBlock.hash, 66)
    ) {
      return { kind: "rpc_error", endpoint: endpoint.name };
    }
    const transactionHash = lowerHex(receipt.transactionHash, 66);
    const blockHash = lowerHex(receipt.blockHash, 66);
    const blockNumberHex = isHexQuantity(receipt.blockNumber) ? receipt.blockNumber : null;
    const status = isHexQuantity(receipt.status) ? BigInt(receipt.status) : null;
    const logs = Array.isArray(receipt.logs) ? receipt.logs : null;
    if (!transactionHash || transactionHash !== claim.transactionHash || !blockHash || !blockNumberHex || status === null || !logs) {
      return { kind: "rpc_error", endpoint: endpoint.name };
    }
    const [block, canonicalBlock] = await rpcBatch(endpoint, [
      ["eth_getBlockByHash", [blockHash, false]],
      ["eth_getBlockByNumber", [blockNumberHex, false]],
    ]);
    if (
      !isRecord(block) ||
      !isRecord(canonicalBlock) ||
      lowerHex(block.hash, 66) !== blockHash ||
      lowerHex(canonicalBlock.hash, 66) !== blockHash ||
      block.number !== blockNumberHex ||
      canonicalBlock.number !== blockNumberHex ||
      !isHexQuantity(block.timestamp) ||
      canonicalBlock.timestamp !== block.timestamp
    ) {
      return { kind: "rpc_error", endpoint: endpoint.name };
    }
    const blockNumber = BigInt(blockNumberHex);
    const currentBlock = BigInt(latestBlock);
    const finalizedBlockNumber = BigInt(finalizedBlock.number);
    if (currentBlock < blockNumber || finalizedBlockNumber > currentBlock) {
      return { kind: "rpc_error", endpoint: endpoint.name };
    }
    const confirmationsBigInt = currentBlock - blockNumber + 1n;
    const confirmations = Number(confirmationsBigInt > BigInt(Number.MAX_SAFE_INTEGER)
      ? BigInt(Number.MAX_SAFE_INTEGER)
      : confirmationsBigInt);
    const blockTimestamp = Number(BigInt(block.timestamp) * 1_000n);
    const parsed = parseTransferEvidence(logs, intent);
    const failureCode = status !== 1n
      ? "transaction_failed"
      : blockTimestamp < Math.floor(intent.createdAt / 1_000) * 1_000
        ? "transfer_predates_instruction"
      : blockTimestamp > intent.expiresAt
        ? "transfer_after_expiry"
        : parsed.failureCode;
    const evidence = {
      chainId: ETHEREUM_MAINNET_CHAIN_ID,
      transactionHash,
      blockHash,
      blockNumber: blockNumber.toString(),
      blockTimestamp,
      sender: parsed.sender,
      tokenContract: parsed.tokenContract,
      recipient: parsed.recipient,
      amountAtomic: parsed.amountAtomic,
      logIndex: parsed.logIndex,
      failureCode,
      confirmationsRequired,
    };
    return {
      kind: "found",
      endpoint: endpoint.name,
      failureCode,
      confirmations,
      finalized: finalizedBlockNumber >= blockNumber,
      evidenceSignature: stableStringify(evidence),
      sender: parsed.sender,
      tokenContract: parsed.tokenContract,
      recipient: parsed.recipient,
      amountAtomic: parsed.amountAtomic,
      blockNumber: blockNumber.toString(),
      blockHash,
      logIndex: parsed.logIndex,
      blockTimestamp,
    };
  } catch {
    return { kind: "rpc_error", endpoint: endpoint.name };
  }
}

function parseTransferEvidence(logs: unknown[], intent: StablecoinPaymentIntentRow) {
  const selectedContract = intent.tokenContract.toLowerCase();
  const recipient = intent.recipientAddress.toLowerCase();
  const otherContract = Object.values(STABLECOIN_ASSETS)
    .find((asset) => asset.contract.toLowerCase() !== selectedContract)?.contract.toLowerCase();
  const transfers = logs.flatMap((log) => {
    if (
      !isRecord(log) ||
      log.removed === true ||
      !Array.isArray(log.topics) ||
      log.topics.length !== 3
    ) return [];
    const address = lowerHex(log.address, 42);
    const topic0 = lowerHex(log.topics[0], 66);
    const fromTopic = lowerHex(log.topics[1], 66);
    const toTopic = lowerHex(log.topics[2], 66);
    const data = lowerHex(log.data, 66);
    const logIndex = isHexQuantity(log.logIndex) ? BigInt(log.logIndex).toString() : null;
    if (!address || topic0 !== ETHEREUM_TRANSFER_TOPIC || !fromTopic || !toTopic || !data || logIndex === null) return [];
    return [{
      address,
      sender: `0x${fromTopic.slice(-40)}`,
      recipient: `0x${toTopic.slice(-40)}`,
      amountAtomic: BigInt(data).toString(),
      logIndex,
    }];
  });
  const selected = transfers.filter((item) => item.address === selectedContract);
  const selectedRecipient = selected.filter((item) => item.recipient === recipient);
  const alternateRecipient = otherContract
    ? transfers.filter((item) => item.address === otherContract && item.recipient === recipient)
    : [];
  const exact = selectedRecipient.filter((item) => item.amountAtomic === intent.tokenAmountAtomic);
  const evidence = exact[0] ?? selectedRecipient[0] ?? alternateRecipient[0] ?? selected[0] ?? null;
  let failureCode: string | null = null;
  if (exact.length === 1 && selectedRecipient.length === 1) failureCode = null;
  else if (exact.length > 0 || selectedRecipient.length > 1) failureCode = "transfer_ambiguous";
  else if (selectedRecipient.length > 0) failureCode = "amount_mismatch";
  else if (alternateRecipient.length === 1) {
    failureCode = "asset_mismatch";
  } else if (alternateRecipient.length > 1) {
    failureCode = "transfer_ambiguous";
  } else if (selected.length > 0) failureCode = "recipient_mismatch";
  else failureCode = "token_transfer_not_found";
  return {
    failureCode,
    sender: evidence?.sender ?? null,
    tokenContract: evidence?.address ?? null,
    recipient: evidence?.recipient ?? null,
    amountAtomic: evidence?.amountAtomic ?? null,
    logIndex: evidence?.logIndex ?? null,
  };
}

async function rpcBatch(
  endpoint: EthereumRpcEndpoint,
  requests: [string, unknown[]][],
): Promise<unknown[]> {
  return Promise.all(
    requests.map(([method, params]) => rpcCall(endpoint, method, params)),
  );
}

async function rpcCall(
  endpoint: EthereumRpcEndpoint,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { ...endpoint.headers, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(endpoint.timeoutMs),
  });
  if (!response.ok) throw new Error("RPC request failed.");
  const entry: unknown = await response.json();
  if (
    !isRecord(entry) ||
    entry.id !== 1 ||
    entry.error !== undefined ||
    !("result" in entry)
  ) throw new Error("RPC response is invalid.");
  return entry.result;
}

async function releaseClaimForRetry(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  leaseToken: string,
  failureCode: string,
  now: number,
  delayMs: number,
) {
  const retryDelayMs = boundedRetryDelay(claim, delayMs);
  await db.batch([
    db.prepare(`UPDATE review_stablecoin_payment_claims
      SET state = 'confirming', failure_code = ?, next_check_at = ?,
          lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(
        failureCode, now + retryDelayMs, now, claim.id, leaseToken,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents SET state = 'confirming', updated_at = ?
      WHERE id = ? AND state IN ('submitted','confirming')
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'confirming' AND updated_at = ?
            AND failure_code = ?)`).bind(
        now, claim.paymentIntentId, claim.id, now, failureCode,
      ),
  ]);
}

async function releaseClaimForManualReview(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  leaseToken: string,
  failureCode: string,
  now: number,
  intent?: StablecoinPaymentIntentRow,
) {
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE review_stablecoin_payment_claims
      SET state = 'manual_review', failure_code = ?, next_check_at = ?,
          lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(
        failureCode, now, now, claim.id, leaseToken,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents SET state = 'manual_review', updated_at = ?
      WHERE id = ? AND state != 'verified'
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'manual_review' AND updated_at = ?
            AND failure_code = ?)`).bind(
        now, claim.paymentIntentId, claim.id, now, failureCode,
      ),
  ];
  if (intent) {
    const lifecycleNotification = await paymentLifecycleNotification(
      db,
      intent,
      "payment_manual_review",
      "Automated verification could not safely finish this transfer. Do not send another payment. Nodezuno will reconcile the recorded transaction and contact you if clarification is required.",
      now,
    );
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO review_order_events
        (id, review_order_id, event_type, actor_type, detail_json, created_at)
        SELECT ?, ?, 'payment.manual_review_required', 'system', ?, ?
        WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'manual_review' AND updated_at = ?)`).bind(
            `payment-manual-review:${claim.id}`,
            intent.reviewOrderId,
            JSON.stringify({
              phase: intent.phase,
              asset: intent.asset,
              failureCode,
              transactionHash: claim.transactionHash,
            }),
            now,
            claim.id,
            now,
          ),
      lifecycleNotification,
    );
  }
  await db.batch(statements);
}

function boundedRetryDelay(
  claim: StablecoinPaymentClaimRow,
  baseDelayMs: number,
): number {
  const exponent = Math.min(Math.max(claim.attemptCount - 1, 0), 5);
  const identity = claim.id.replaceAll("-", "").slice(-8);
  const seed = Number.parseInt(identity, 16);
  const jitter = 0.8 + ((Number.isFinite(seed) ? seed : 20) % 41) / 100;
  return Math.max(
    1_000,
    Math.min(
      MAX_RETRY_DELAY_MS,
      Math.round(baseDelayMs * (2 ** exponent) * jitter),
    ),
  );
}

async function storeConfirmingEvidence(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  intent: StablecoinPaymentIntentRow,
  leaseToken: string,
  observation: FoundObservation,
  confirmations: number,
  evidenceHash: string,
  rpcAgreementCount: number,
  now: number,
) {
  await db.batch([
    db.prepare(`UPDATE review_stablecoin_payment_claims SET
      state = 'confirming', failure_code = ?, observed_sender = ?,
      observed_token_contract = ?, observed_recipient_address = ?,
      observed_amount_atomic = ?, block_number = ?, block_hash = ?,
      log_index = ?, block_timestamp = ?, confirmations = ?,
      evidence_hash = ?, rpc_agreement_count = ?, next_check_at = ?,
      lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(
        observation.failureCode, observation.sender, observation.tokenContract, observation.recipient,
        observation.amountAtomic, observation.blockNumber, observation.blockHash,
        observation.logIndex, observation.blockTimestamp, confirmations,
        evidenceHash, rpcAgreementCount, now + 15_000, now, claim.id, leaseToken,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents SET state = 'confirming', updated_at = ?
      WHERE id = ? AND state != 'verified'
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'confirming' AND updated_at = ?)`).bind(
          now, intent.id, claim.id, now,
        ),
  ]);
}

async function storeManualReviewEvidence(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  intent: StablecoinPaymentIntentRow,
  leaseToken: string,
  observation: FoundObservation,
  evidenceHash: string,
  rpcAgreementCount: number,
  now: number,
) {
  const lifecycleNotification = await paymentLifecycleNotification(
    db,
    intent,
    "payment_manual_review",
    "Your Ethereum transfer was observed, but it needs manual reconciliation. Do not send another payment. Nodezuno will contact you using the recorded Telegram username if clarification is required.",
    now,
  );
  await db.batch([
    db.prepare(`UPDATE review_stablecoin_payment_claims SET
      state = 'manual_review', failure_code = ?, observed_sender = ?,
      observed_token_contract = ?, observed_recipient_address = ?,
      observed_amount_atomic = ?, block_number = ?, block_hash = ?,
      log_index = ?, block_timestamp = ?, confirmations = ?,
      evidence_hash = ?, rpc_agreement_count = ?, next_check_at = ?,
      lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND lease_token = ?`).bind(
        observation.failureCode, observation.sender, observation.tokenContract,
        observation.recipient, observation.amountAtomic, observation.blockNumber,
        observation.blockHash, observation.logIndex, observation.blockTimestamp,
        observation.confirmations, evidenceHash, rpcAgreementCount, now,
        now, claim.id, leaseToken,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents
      SET state = 'manual_review', updated_at = ?
      WHERE id = ? AND state != 'verified'
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'manual_review' AND updated_at = ?)`).bind(
            now, intent.id, claim.id, now,
          ),
    db.prepare(`INSERT OR IGNORE INTO review_order_events
      (id, review_order_id, event_type, actor_type, detail_json, created_at)
      SELECT ?, ?, 'payment.manual_review_required', 'system', ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
        WHERE id = ? AND state = 'manual_review' AND updated_at = ?)`).bind(
          `payment-manual-review:${claim.id}`,
          intent.reviewOrderId,
          JSON.stringify({
            phase: intent.phase,
            asset: intent.asset,
            failureCode: observation.failureCode,
            transactionHash: claim.transactionHash,
          }),
          now,
          claim.id,
          now,
        ),
    lifecycleNotification,
  ]);
}

async function rejectClaim(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  intent: StablecoinPaymentIntentRow,
  leaseToken: string,
  observation: FoundObservation,
  evidenceHash: string,
  rpcAgreementCount: number,
  now: number,
) {
  const reusable = intent.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS > now;
  await db.batch([
    db.prepare(`UPDATE review_stablecoin_payment_claims SET
      state = 'rejected', failure_code = ?, observed_sender = ?,
      observed_token_contract = ?, observed_recipient_address = ?,
      observed_amount_atomic = ?, block_number = ?, block_hash = ?,
      log_index = ?, block_timestamp = ?, confirmations = ?,
      evidence_hash = ?, rpc_agreement_count = ?, rejected_at = ?,
      next_check_at = ?, lease_token = NULL, lease_expires_at = NULL,
      updated_at = ? WHERE id = ? AND lease_token = ?`).bind(
        observation.failureCode, observation.sender, observation.tokenContract,
        observation.recipient, observation.amountAtomic, observation.blockNumber,
        observation.blockHash, observation.logIndex, observation.blockTimestamp,
        observation.confirmations, evidenceHash, rpcAgreementCount, now, now,
        now, claim.id, leaseToken,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents SET state = ?, updated_at = ?
      WHERE id = ? AND state NOT IN ('verified','manual_review','refunded','cancelled')
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'rejected' AND updated_at = ?)`).bind(
        reusable ? "awaiting_transfer" : "expired", now, intent.id, claim.id, now,
      ),
    db.prepare(`INSERT OR IGNORE INTO review_order_events
      (id, review_order_id, event_type, actor_type, detail_json, created_at)
      SELECT ?, ?, 'payment.claim_rejected', 'system', ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
        WHERE id = ? AND state = 'rejected' AND updated_at = ?)`).bind(
        `payment-claim-rejected:${claim.id}`, intent.reviewOrderId,
        JSON.stringify({ phase: intent.phase, asset: intent.asset, failureCode: observation.failureCode }), now, claim.id, now,
      ),
  ]);
}

async function markStablecoinPaymentVerified(
  db: D1Database,
  claim: StablecoinPaymentClaimRow,
  intent: StablecoinPaymentIntentRow,
  leaseToken: string,
  observation: FoundObservation,
  confirmations: number,
  evidenceHash: string,
  rpcAgreementCount: number,
  now: number,
) {
  const nextStatus = intent.phase === "deposit" ? "deposit_paid" : "paid";
  const expectedStatus = intent.phase === "deposit" ? "deposit_pending" : "balance_due";
  const confirmationId = `confirm:${claim.id}`;
  const lifecycleNotification = await paymentLifecycleNotification(
    db,
    intent,
    intent.phase === "deposit" ? "deposit_verified" : "balance_verified",
    intent.phase === "deposit"
      ? "Your scheduling deposit has been confirmed from finalized Ethereum evidence. Your service order is active, and Nodezuno will begin work using the submitted scope and contact you for any required private artifacts."
      : "Your final balance has been confirmed from finalized Ethereum evidence. Nodezuno will release the finalized evidence package through the private engagement page.",
    now,
    confirmationId,
  );
  await db.batch([
    db.prepare(`UPDATE review_stablecoin_payment_claims SET
      state = 'verified', failure_code = NULL, observed_sender = ?,
      observed_token_contract = ?, observed_recipient_address = ?,
      observed_amount_atomic = ?, block_number = ?, block_hash = ?,
      log_index = ?, block_timestamp = ?, confirmations = ?,
      evidence_hash = ?, rpc_agreement_count = ?, verified_at = ?,
      next_check_at = ?, lease_token = NULL, lease_expires_at = NULL,
      updated_at = ? WHERE id = ? AND lease_token = ?
        AND EXISTS (SELECT 1 FROM review_orders WHERE id = ? AND status = ?)`).bind(
        observation.sender, observation.tokenContract, observation.recipient,
        observation.amountAtomic, observation.blockNumber, observation.blockHash,
        observation.logIndex, observation.blockTimestamp, confirmations,
        evidenceHash, rpcAgreementCount, now, now, now, claim.id, leaseToken,
        intent.reviewOrderId, expectedStatus,
      ),
    db.prepare(`UPDATE review_stablecoin_payment_intents
      SET state = 'verified', verified_at = ?, updated_at = ?
      WHERE id = ? AND state != 'verified'
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'verified' AND verified_at = ?)`).bind(
          now, now, intent.id, claim.id, now,
        ),
    db.prepare(`UPDATE review_orders SET status = ?, next_action = ?, updated_at = ?
      WHERE id = ? AND status = ?
        AND EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
          WHERE id = ? AND state = 'verified' AND verified_at = ?)`).bind(
          nextStatus,
          intent.phase === "deposit"
            ? "Payment is confirmed. Nodezuno will begin work and contact you for any required private artifacts."
            : "Nodezuno will release the final evidence package under the accepted service order.",
          now, intent.reviewOrderId, expectedStatus, claim.id, now,
        ),
    db.prepare(`INSERT OR IGNORE INTO review_order_events
      (id, review_order_id, event_type, actor_type, detail_json, created_at)
      SELECT ?, ?, 'payment.confirmed', 'system', ?, ?
      WHERE EXISTS (SELECT 1 FROM review_stablecoin_payment_claims
        WHERE id = ? AND state = 'verified' AND verified_at = ?)`).bind(
        `payment-confirmed:${claim.id}`, intent.reviewOrderId,
        JSON.stringify({ phase: intent.phase, asset: intent.asset, chainId: 1, transactionHash: claim.transactionHash, confirmations }),
        now, claim.id, now,
      ),
    lifecycleNotification,
  ]);
  const finalState = await db.prepare(
    "SELECT state FROM review_stablecoin_payment_claims WHERE id = ? LIMIT 1",
  ).bind(claim.id).first<string>("state");
  return finalState === "verified";
}

async function paymentLifecycleNotification(
  db: D1Database,
  intent: StablecoinPaymentIntentRow,
  action: "deposit_verified" | "balance_verified" | "payment_manual_review",
  message: string,
  now: number,
  confirmationId: string | null = null,
): Promise<D1PreparedStatement> {
  const order = await db.prepare(
    "SELECT reference FROM review_orders WHERE id = ? LIMIT 1",
  ).bind(intent.reviewOrderId).first<{ reference: string }>();
  if (!order) {
    return db.prepare("SELECT 1 WHERE 0");
  }
  const deliveryId = await deterministicNotificationDeliveryId(
    "review.lifecycle.buyer",
    intent.reviewOrderId,
    confirmationId ?? intent.id,
    action,
  );
  const payloadContents: Record<string, string> = {
    action,
    message,
    reference: order.reference,
    reviewOrderId: intent.reviewOrderId,
  };
  if (confirmationId) payloadContents.confirmationId = confirmationId;
  const payload = await sealedNotificationPayload(payloadContents);
  if (confirmationId) {
    return db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.lifecycle.buyer', ?, 'pending', 0,
             'review-lifecycle-buyer-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM review_stablecoin_payment_confirmations
        WHERE id = ? AND review_order_id = ? AND payment_intent_id = ?
          AND phase = ?
      )`).bind(
        deliveryId,
        deliveryId,
        intent.reviewOrderId,
        payload.json,
        payload.hash,
        now,
        now,
        now,
        confirmationId,
        intent.reviewOrderId,
        intent.id,
        intent.phase,
      );
  }
  return db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.lifecycle.buyer', ?, 'pending', 0,
             'review-lifecycle-buyer-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders WHERE id = ?)`).bind(
        deliveryId,
        deliveryId,
        intent.reviewOrderId,
        payload.json,
        payload.hash,
        now,
        now,
        now,
        intent.reviewOrderId,
      );
}

async function claimState(db: D1Database, claimId: string): Promise<string | null> {
  return db.prepare("SELECT state FROM review_stablecoin_payment_claims WHERE id = ? LIMIT 1")
    .bind(claimId).first<string>("state");
}

function isHexQuantity(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value);
}

function lowerHex(value: unknown, length: number): string | null {
  return typeof value === "string" && value.length === length && /^0x[0-9a-f]+$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
