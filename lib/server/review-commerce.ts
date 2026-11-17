import { accountIdentityFromRequest } from "./account-identity.ts";
import { privateHash, requestFingerprint, reviewCapabilityHash, sha256Hex, stableStringify } from "./crypto.ts";
import { getDatabase } from "./database-binding.ts";
import {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "./notification-outbox.ts";
import { HttpProblem } from "./http.ts";
import {
  LATE_PAYMENT_CLAIM_GRACE_MS,
  stablecoinPaymentConfiguration,
} from "./stablecoin-payment-config.ts";
import { stablecoinPaymentForOrder } from "./stablecoin-payment-store.ts";
import {
  listStablecoinPaymentConfirmations,
  listStablecoinReconciliationCases,
} from "./stablecoin-payment-records.ts";
import { listReviewDeliverables } from "./review-deliverables.ts";
import { isRecord, requiredText, type ReviewOrderInput } from "./reviews/input.ts";
import { isFixedPriceReviewTarget } from "../review-targets.ts";
export { validateReviewOrderPayload } from "./reviews/input.ts";
import { reviewPolicy } from "../review-policy.ts";

export const REVIEW_TOTAL_AMOUNT = reviewPolicy.totalAmountMinor;
export const REVIEW_PAYMENT_AMOUNT = reviewPolicy.depositAmountMinor;
export const REVIEW_CURRENCY = reviewPolicy.currency;
export const REVIEW_ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_RETENTION_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const ACCESS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const DIRECT_CHECKOUT_EXPIRY_MS = reviewPolicy.orderValidityDays * 24 * 60 * 60 * 1000;
const DIRECT_CHECKOUT_TITLE = reviewPolicy.name;
const DIRECT_CHECKOUT_REVIEWER = "Sanjay Sudagani";
const DIRECT_CHECKOUT_EXCLUSIONS =
  "New protocol design or a full protocol audit, more than one target network, more than one release, custody, deployment, live key access, incident response, formal verification, and work outside the submitted frozen release boundary.";

export type ReviewOrderStatus =
  | "qualification_pending"
  | "needs_information"
  | "proposal_ready"
  | "deposit_pending"
  | "deposit_paid"
  | "scheduled"
  | "in_review"
  | "remediation"
  | "balance_due"
  | "paid"
  | "payment_refunded"
  | "completed"
  | "declined"
  | "cancelled";


type ReviewOrderRow = {
  id: string;
  reference: string;
  status: ReviewOrderStatus;
  contactName: string;
  workEmail: string;
  company: string;
  website: string | null;
  teamType: string;
  targetChain: string;
  auditedBaseline: string;
  proposedRelease: string;
  changeSummary: string;
  affectedContracts: number;
  changedLines: number | null;
  artifactReadyDate: string | null;
  targetReleaseDate: string | null;
  publicLinks: string | null;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  currency: string;
  proposalVersion: number | null;
  proposalTitle: string | null;
  proposalScope: string | null;
  proposalExclusions: string | null;
  proposalReviewer: string | null;
  proposalIssuedAt: number | null;
  proposalExpiresAt: number | null;
  proposalAcceptedAt: number | null;
  nextAction: string | null;
  telegramUsername: string | null;
  submittedByAccountId: string | null;
  accessTokenHash: string;
  requestHash: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

const ORDER_SELECT = `
  SELECT id, reference, status, contact_name AS contactName,
         work_email AS workEmail, company, website,
         team_type AS teamType, target_chain AS targetChain,
         audited_baseline AS auditedBaseline,
         proposed_release AS proposedRelease,
         change_summary AS changeSummary,
         affected_contracts AS affectedContracts,
         changed_lines AS changedLines,
         artifact_ready_date AS artifactReadyDate,
         target_release_date AS targetReleaseDate,
         public_links AS publicLinks, total_amount AS totalAmount,
         deposit_amount AS depositAmount, balance_amount AS balanceAmount,
         currency, proposal_version AS proposalVersion,
         proposal_title AS proposalTitle, proposal_scope AS proposalScope,
         proposal_exclusions AS proposalExclusions,
         proposal_reviewer AS proposalReviewer,
         proposal_issued_at AS proposalIssuedAt,
         proposal_expires_at AS proposalExpiresAt,
         proposal_accepted_at AS proposalAcceptedAt,
         next_action AS nextAction, telegram_username AS telegramUsername,
         submitted_by_account_id AS submittedByAccountId,
         access_token_hash AS accessTokenHash, request_hash AS requestHash,
         created_at AS createdAt, updated_at AS updatedAt,
         expires_at AS expiresAt
  FROM review_orders`;


export async function createReviewOrder(options: {
  input: ReviewOrderInput;
  request: Request;
  idempotencyKey: string;
  requestHash: string;
  emailHash: string;
}): Promise<{ order: ReviewOrderRow; accessToken: string; replayed: boolean }> {
  const db = await getDatabase();
  const accessToken = await reviewCapabilityHash(
    "review-order-capability",
    `${options.idempotencyKey}\u0000${options.requestHash}`,
  );
  const accessTokenHash = await reviewCapabilityHash("review-order-access", accessToken);
  const existing = await db.prepare(`${ORDER_SELECT} WHERE idempotency_key = ? LIMIT 1`)
    .bind(options.idempotencyKey).first<ReviewOrderRow>();
  if (existing) {
    if (existing.requestHash !== options.requestHash) {
      throw new HttpProblem(409, "idempotency_conflict", "This request key was already used for different details.");
    }
    if (!constantTimeEqual(existing.accessTokenHash, accessTokenHash)) {
      throw new HttpProblem(409, "review_access_already_issued", "This application was already received. Use its original private tracking link.");
    }
    return { order: existing, accessToken, replayed: true };
  }
  const [fingerprint, identity] = await Promise.all([
    requestFingerprint(options.request),
    accountIdentityFromRequest(options.request),
  ]);
  const id = crypto.randomUUID();
  const now = Date.now();
  const reference = `NZ-${new Date(now).getUTCFullYear()}-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const status: ReviewOrderStatus = "proposal_ready";
  const input = options.input;
  const proposalVersion = 1;
  const proposalExpiresAt = now + DIRECT_CHECKOUT_EXPIRY_MS;
  const proposalScope = directCheckoutScope(input);
  const [operatorOutboxId, buyerOutboxId, reviewPayload] = await Promise.all([
    deterministicNotificationDeliveryId(
      "review.application.received.operator",
      options.idempotencyKey,
      options.requestHash,
    ),
    deterministicNotificationDeliveryId(
      "review.application.received.buyer",
      options.idempotencyKey,
      options.requestHash,
    ),
    sealedNotificationPayload({ reference, reviewOrderId: id }),
  ]);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO review_orders (
      id, reference, status, contact_name, work_email, email_hash, company,
      website, team_type, target_chain, audited_baseline, proposed_release,
      change_summary, affected_contracts, changed_lines, artifact_ready_date,
      target_release_date, public_links, source_path, total_amount,
      deposit_amount, balance_amount, currency, proposal_version,
      proposal_title, proposal_scope, proposal_exclusions, proposal_reviewer,
      proposal_issued_at, proposal_expires_at, next_action,
      submitted_by_account_id, access_token_hash, idempotency_key, request_hash,
      ip_hash, user_agent_hash, consent_version, consented_at, created_at,
      updated_at, expires_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, reference, status, input.contactName, input.workEmail, options.emailHash,
      input.company, input.website, input.teamType, input.targetChain,
      input.auditedBaseline, input.proposedRelease, input.changeSummary,
      input.affectedContracts, input.changedLines, input.artifactReadyDate,
      input.targetReleaseDate, input.publicLinks, input.sourcePath,
      REVIEW_TOTAL_AMOUNT, REVIEW_PAYMENT_AMOUNT, reviewPolicy.balanceAmountMinor,
      REVIEW_CURRENCY, proposalVersion,
      DIRECT_CHECKOUT_TITLE, proposalScope, DIRECT_CHECKOUT_EXCLUSIONS,
      DIRECT_CHECKOUT_REVIEWER, now, proposalExpiresAt,
      "Accept the fixed service order and terms, choose USDC or USDT on Ethereum Mainnet, then complete the scheduling deposit.",
      identity?.accountId ?? null, accessTokenHash, options.idempotencyKey,
      options.requestHash, fingerprint.ipHash, fingerprint.userAgentHash,
      "review-direct-checkout-2026-09", now, now, now, now + REVIEW_RETENTION_MS,
    ),
    db.prepare(`INSERT OR IGNORE INTO review_order_events
      (id, review_order_id, event_type, actor_type, actor_email, detail_json, created_at)
      SELECT ?, ?, 'order.checkout_created', 'buyer', NULL, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders WHERE id = ?)`).bind(
        crypto.randomUUID(), id, JSON.stringify({ directCheckout: true, proposalVersion }), now, id,
      ),
    db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.application.received.operator', ?, 'pending', 0,
             'review-application-operator-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders WHERE id = ?)`).bind(
        operatorOutboxId, operatorOutboxId, id, reviewPayload.json,
        reviewPayload.hash, now, now, now, id,
      ),
    db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.application.received.buyer', ?, 'pending', 0,
             'review-application-buyer-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders WHERE id = ?)`).bind(
        buyerOutboxId, buyerOutboxId, id, reviewPayload.json,
        reviewPayload.hash, now, now, now, id,
      ),
  ]);
  const order = await db.prepare(`${ORDER_SELECT} WHERE idempotency_key = ? LIMIT 1`)
    .bind(options.idempotencyKey).first<ReviewOrderRow>();
  if (!order) throw new HttpProblem(503, "review_order_unavailable", "The application could not be read after storage.");
  if (order.requestHash !== options.requestHash) {
    throw new HttpProblem(409, "idempotency_conflict", "This request key was already used for different details.");
  }
  if (!constantTimeEqual(order.accessTokenHash, accessTokenHash)) {
    throw new HttpProblem(409, "review_access_already_issued", "This application was already received. Use its original private tracking link.");
  }
  return { order, accessToken, replayed: order.id !== id };
}

function directCheckoutScope(input: ReviewOrderInput): string {
  return [
    `One frozen upgrade to the already-audited or reviewed protocol identified in this order on ${input.targetChain}.`,
    `The service covers the submitted release boundary of up to ${input.affectedContracts} affected contracts, programs, or modules and ${input.changedLines} materially changed protocol code lines.`,
    "It includes one evidence-backed review report, one human-signed Proceed, Remediate, or Hold recommendation, and one consolidated fix review.",
  ].join(" ");
}

export async function authorizeReviewOrder(request: Request, id: string): Promise<ReviewOrderRow> {
  const db = await getDatabase();
  const order = await findReviewOrderById(id, db);
  if (!order || order.expiresAt <= Date.now()) {
    throw new HttpProblem(404, "review_order_not_found", "The review request was not found.");
  }
  const identity = await accountIdentityFromRequest(request);
  if (identity?.accountId && identity.accountId === order.submittedByAccountId) return order;
  const token = reviewCookieToken(request, id);
  if (token && await accessTokenMatches(order.accessTokenHash, token)) return order;
  throw new HttpProblem(401, "review_access_required", "Use the private tracking link or the account that owns this request.");
}

export async function exchangeReviewAccess(options: {
  request: Request;
  id: string;
  accessToken: string;
}): Promise<{ order: ReviewOrderRow; setCookie: string }> {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(options.accessToken)) {
    throw new HttpProblem(401, "review_access_invalid", "The private tracking capability is invalid.");
  }
  const db = await getDatabase();
  const order = await findReviewOrderById(options.id, db);
  if (
    !order ||
    order.expiresAt <= Date.now() ||
    !(await accessTokenMatches(order.accessTokenHash, options.accessToken))
  ) {
    throw new HttpProblem(401, "review_access_invalid", "The private tracking capability is invalid.");
  }
  const identity = await accountIdentityFromRequest(options.request);
  if (identity?.accountId && !order.submittedByAccountId) {
    await db.prepare(`UPDATE review_orders SET submitted_by_account_id = ?, updated_at = ?
      WHERE id = ? AND submitted_by_account_id IS NULL`).bind(identity.accountId, Date.now(), order.id).run();
    order.submittedByAccountId = identity.accountId;
  }
  const secure = new URL(options.request.url).protocol === "https:";
  const cookie = [
    `nz_review_access=${order.id}.${options.accessToken}`,
    `Path=/api/v1/review-orders/${order.id}`,
    `Max-Age=${ACCESS_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  return { order, setCookie: cookie };
}

export async function publicReviewOrder(order: ReviewOrderRow) {
  const [stablecoinPayment, paymentConfirmations, deliverables] = await Promise.all([
    stablecoinPaymentForOrder(order.id, visiblePaymentPhase(order.status)),
    listStablecoinPaymentConfirmations(order.id),
    listReviewDeliverables(order.id),
  ]);
  const fixedPriceCommerceEligible = isFixedPriceReviewTarget(order.targetChain);
  const proposal = order.proposalVersion === null || (!fixedPriceCommerceEligible && !stablecoinPayment) ? null : {
    version: order.proposalVersion,
    status: order.proposalAcceptedAt ? "accepted" : "issued",
    title: order.proposalTitle,
    scope: order.proposalScope,
    exclusions: order.proposalExclusions,
    reviewer: order.proposalReviewer,
    currency: order.currency,
    totalAmount: order.totalAmount,
    depositAmount: order.depositAmount,
    balanceAmount: order.balanceAmount,
    issuedAt: iso(order.proposalIssuedAt),
    expiresAt: iso(order.proposalExpiresAt),
    acceptedAt: iso(order.proposalAcceptedAt),
  };
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    company: order.company,
    targetChain: order.targetChain,
    fixedPriceCommerceEligible,
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt),
    nextAction: order.nextAction,
    telegramUsername: order.telegramUsername,
    proposal,
    stablecoinPayment,
    paymentConfirmations,
    deliverables,
  };
}

function visiblePaymentPhase(status: ReviewOrderStatus): "deposit" | "balance" | null {
  if (["proposal_ready", "deposit_pending", "deposit_paid", "scheduled", "in_review", "remediation"].includes(status)) {
    return "deposit";
  }
  if (["balance_due", "paid", "completed"].includes(status)) return "balance";
  return null;
}

export type ReviewOrderView = Awaited<ReturnType<typeof publicReviewOrder>>;

export async function findReviewOrderReplay(options: {
  idempotencyKey: string;
  requestHash: string;
}): Promise<{ order: ReviewOrderRow; accessToken: string } | null> {
  const db = await getDatabase();
  const order = await db.prepare(`${ORDER_SELECT} WHERE idempotency_key = ? LIMIT 1`)
    .bind(options.idempotencyKey).first<ReviewOrderRow>();
  if (!order) return null;
  if (order.requestHash !== options.requestHash) {
    throw new HttpProblem(409, "idempotency_conflict", "This request key was already used for different details.");
  }
  const accessToken = await reviewCapabilityHash(
    "review-order-capability",
    `${options.idempotencyKey}\u0000${options.requestHash}`,
  );
  const accessTokenHash = await reviewCapabilityHash("review-order-access", accessToken);
  if (!constantTimeEqual(order.accessTokenHash, accessTokenHash)) {
    throw new HttpProblem(409, "review_access_already_issued", "This application was already received. Use its original private tracking link.");
  }
  return { order, accessToken };
}

export async function adminReviewOrder(order: ReviewOrderRow) {
  const [publicOrder, deliverables, paymentReconciliations] = await Promise.all([
    publicReviewOrder(order),
    listReviewDeliverables(order.id, true),
    listStablecoinReconciliationCases(order.id),
  ]);
  return {
    ...publicOrder,
    deliverables,
    paymentReconciliations,
    application: {
      contactName: order.contactName,
      workEmail: order.workEmail,
      website: order.website,
      teamType: order.teamType,
      auditedBaseline: order.auditedBaseline,
      proposedRelease: order.proposedRelease,
      changeSummary: order.changeSummary,
      affectedContracts: order.affectedContracts,
      changedLines: order.changedLines,
      artifactReadyDate: order.artifactReadyDate,
      targetReleaseDate: order.targetReleaseDate,
      publicLinks: order.publicLinks,
      telegramUsername: order.telegramUsername,
    },
  };
}

export type AdminReviewOrderView = Awaited<ReturnType<typeof adminReviewOrder>>;

export async function listAdminReviewOrders(limit = 100): Promise<ReviewOrderRow[]> {
  const db = await getDatabase();
  const result = await db.prepare(`${ORDER_SELECT} ORDER BY created_at DESC LIMIT ?`)
    .bind(Math.max(1, Math.min(200, Math.trunc(limit)))).all<ReviewOrderRow>();
  return result.results ?? [];
}

export async function listReviewOrdersForAccount(accountId: string, limit = 50): Promise<ReviewOrderRow[]> {
  const db = await getDatabase();
  const result = await db.prepare(`${ORDER_SELECT} WHERE submitted_by_account_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?`)
    .bind(accountId, Date.now(), Math.max(1, Math.min(100, Math.trunc(limit)))).all<ReviewOrderRow>();
  return result.results ?? [];
}

export async function adminUpdateReviewOrder(options: {
  id: string;
  actorEmail: string;
  body: unknown;
}): Promise<ReviewOrderRow> {
  if (!isRecord(options.body) || typeof options.body.action !== "string") {
    throw new HttpProblem(422, "validation_failed", "Choose a supported review action.");
  }
  const db = await getDatabase();
  const order = await findReviewOrderById(options.id, db);
  if (!order) throw new HttpProblem(404, "review_order_not_found", "The review request was not found.");
  const now = Date.now();
  const action = options.body.action;
  const allowedKeys = action === "issue_proposal"
    ? new Set(["action", "scope", "exclusions", "reviewer", "expiresAt", "nextAction"])
    : action === "confirm_payment_manually"
      ? new Set(["action", "note", "nextAction"])
    : new Set(["action", "nextAction"]);
  if (Object.keys(options.body).some((key) => !allowedKeys.has(key))) {
    throw new HttpProblem(422, "validation_failed", "Remove unsupported review action fields.");
  }
  let status: ReviewOrderStatus;
  let nextAction = optionalAdminText(options.body.nextAction, 1000);
  const statements: D1PreparedStatement[] = [];
  let releaseDeliverables = false;
  let proposalVersionAfter = order.proposalVersion;
  let manualPaymentAudit: {
    claimId: string;
    transactionHash: string;
    note: string;
    phase: "deposit" | "balance";
  } | null = null;
  if (action === "issue_proposal") {
    if (!["qualification_pending", "needs_information", "proposal_ready"].includes(order.status)) throw new HttpProblem(409, "review_transition_invalid", "A proposal cannot be issued from this state.");
    if (!isFixedPriceReviewTarget(order.targetChain)) {
      throw new HttpProblem(
        409,
        "fixed_price_proposal_unavailable",
        "This target is not in the supported fixed-price review catalog. Request corrected network information before issuing a proposal.",
      );
    }
    const scope = adminText(options.body.scope, "scope", 30, 5000);
    const exclusions = adminText(options.body.exclusions, "exclusions", 20, 5000);
    const reviewer = adminText(options.body.reviewer, "reviewer", 2, 160);
    const expiresAt = parseFutureDate(options.body.expiresAt, now);
    const version = (order.proposalVersion ?? 0) + 1;
    proposalVersionAfter = version;
    status = "proposal_ready";
    nextAction ??= "Review and accept the exact proposal before creating the Ethereum payment instruction.";
    statements.push(db.prepare(`UPDATE review_orders SET status = 'proposal_ready',
      proposal_version = ?, proposal_title = 'Smart contract and protocol release security review',
      proposal_scope = ?, proposal_exclusions = ?, proposal_reviewer = ?,
      proposal_issued_at = ?, proposal_expires_at = ?, proposal_accepted_at = NULL,
      next_action = ?, updated_at = ?
      WHERE id = ? AND status = ? AND proposal_version IS ?`).bind(
        version, scope, exclusions, reviewer, now, expiresAt, nextAction, now,
        order.id, order.status, order.proposalVersion,
      ));
  } else if (action === "confirm_payment_manually") {
    const paymentConfiguration = await stablecoinPaymentConfiguration();
    if (paymentConfiguration.mode !== "manual_ethereum") {
      throw new HttpProblem(409, "manual_payment_confirmation_unavailable", "Manual payment confirmation is available only in the manual-payment deployment mode.");
    }
    const phase = order.status === "deposit_pending"
      ? "deposit"
      : order.status === "balance_due"
        ? "balance"
        : null;
    if (!phase) {
      throw new HttpProblem(409, "review_transition_invalid", "Only a pending deposit or balance can be manually confirmed.");
    }
    const claim = await db.prepare(`SELECT c.id, c.transaction_hash AS transactionHash
      FROM review_stablecoin_payment_claims c
      JOIN review_stablecoin_payment_intents i ON i.id = c.payment_intent_id
      WHERE i.review_order_id = ? AND i.phase = ?
        AND i.state = 'manual_review' AND c.state = 'manual_review'
        AND c.failure_code IS NULL AND c.attempt_count = 0
        AND c.observed_sender IS NULL AND c.observed_token_contract IS NULL
        AND c.observed_recipient_address IS NULL AND c.observed_amount_atomic IS NULL
      ORDER BY c.created_at DESC LIMIT 1`).bind(order.id, phase)
      .first<{ id: string; transactionHash: string }>();
    if (!claim) {
      throw new HttpProblem(409, "manual_payment_claim_missing", "No customer-submitted transaction is waiting for manual confirmation.");
    }
    const note = adminText(options.body.note, "note", 12, 4000);
    status = phase === "deposit" ? "deposit_paid" : "paid";
    nextAction ??= phase === "deposit"
      ? "Nodezuno manually checked the submitted transaction. Confirm the schedule and contact the customer before starting work."
      : "Nodezuno manually checked the final balance. Complete and deliver the agreed review work.";
    statements.push(db.prepare(`UPDATE review_orders SET status = ?, next_action = ?, updated_at = ?
      WHERE id = ? AND status = ? AND EXISTS (
        SELECT 1 FROM review_stablecoin_payment_claims c
        JOIN review_stablecoin_payment_intents i ON i.id = c.payment_intent_id
        WHERE c.id = ? AND c.state = 'manual_review' AND i.state = 'manual_review'
          AND i.review_order_id = review_orders.id AND i.phase = ?
          AND c.failure_code IS NULL AND c.attempt_count = 0
      )`).bind(status, nextAction, now, order.id, order.status, claim.id, phase));
    manualPaymentAudit = {
      claimId: claim.id,
      transactionHash: claim.transactionHash,
      note,
      phase,
    };
  } else {
    const transitions: Record<string, { from: ReviewOrderStatus[]; to: ReviewOrderStatus; fallback: string }> = {
      request_information: { from: ["qualification_pending", "needs_information"], to: "needs_information", fallback: "Provide the requested non-confidential clarification." },
      decline: { from: ["qualification_pending", "needs_information", "proposal_ready"], to: "declined", fallback: "No payment is due." },
      schedule: { from: ["deposit_paid"], to: "scheduled", fallback: "Prepare the frozen artifacts for the confirmed review window." },
      begin_review: { from: ["scheduled"], to: "in_review", fallback: "Monitor the agreed review communication channel." },
      remediation: { from: ["in_review"], to: "remediation", fallback: "Address the bounded finding and freeze the correction." },
      request_balance: { from: ["in_review", "remediation"], to: "balance_due", fallback: "Complete the final contractual balance through the portal." },
      complete: { from: ["paid"], to: "completed", fallback: "Download and preserve the released report and evidence manifest from this private page." },
      cancel: { from: ["qualification_pending", "needs_information", "proposal_ready", "deposit_pending", "deposit_paid", "scheduled", "in_review", "remediation", "balance_due", "payment_refunded"], to: "cancelled", fallback: "Contact Nodezuno if a written obligation remains." },
    };
    const transition = transitions[action];
    if (!transition || !transition.from.includes(order.status)) throw new HttpProblem(409, "review_transition_invalid", "This review action is not valid from the current state.");
    if (action === "request_balance" && !isFixedPriceReviewTarget(order.targetChain)) {
      throw new HttpProblem(
        409,
        "fixed_price_payment_unavailable",
        "This target is not in the supported fixed-price review catalog. Resolve the target classification before requesting payment.",
      );
    }
    if (action === "complete") {
      const deliverableKinds = await db.prepare(`SELECT kind
        FROM review_deliverables
        WHERE review_order_id = ? AND state = 'available'
          AND kind IN ('final_report','manifest')`).bind(order.id).all<{ kind: string }>();
      const kinds = new Set(deliverableKinds.results.map((item) => item.kind));
      if (!kinds.has("final_report") || !kinds.has("manifest")) {
        throw new HttpProblem(
          409,
          "deliverables_incomplete",
          "Upload and verify both the final report and evidence manifest before release.",
        );
      }
      releaseDeliverables = true;
    }
    if (action === "cancel") {
      await db.prepare(`UPDATE review_stablecoin_payment_intents
        SET state = 'expired', updated_at = ?
        WHERE review_order_id = ? AND state = 'awaiting_transfer'
          AND expires_at + ? <= ?`).bind(
            now, order.id, LATE_PAYMENT_CLAIM_GRACE_MS, now,
          ).run();
      const claimableInstruction = await db.prepare(`SELECT id, expires_at AS expiresAt
        FROM review_stablecoin_payment_intents
        WHERE review_order_id = ? AND state = 'awaiting_transfer'
        ORDER BY expires_at DESC LIMIT 1`).bind(order.id).first<{
          id: string;
          expiresAt: number;
        }>();
      if (claimableInstruction) {
        throw new HttpProblem(
          409,
          "payment_instruction_open",
          `This Ethereum payment instruction remains claimable until ${new Date(
            claimableInstruction.expiresAt + LATE_PAYMENT_CLAIM_GRACE_MS,
          ).toISOString()}. Wait until that deadline and check the treasury before cancelling.`,
        );
      }
      const stablecoinSettlement = await db.prepare(`SELECT id, state
        FROM review_stablecoin_payment_intents
        WHERE review_order_id = ?
          AND state IN ('submitted','confirming','verified','manual_review')
        ORDER BY created_at DESC LIMIT 1`).bind(order.id).first<{ id: string; state: string }>();
      if (stablecoinSettlement) {
        throw new HttpProblem(
          409,
          "payment_settlement_open",
          "This order has submitted or verified Ethereum payment evidence. Reconcile it before cancelling the order.",
        );
      }
    }
    status = transition.to;
    nextAction ??= transition.fallback;
    statements.push(
      action === "cancel"
        ? db.prepare(`UPDATE review_orders SET status = ?, next_action = ?, updated_at = ?
            WHERE id = ? AND status = ?
              AND NOT EXISTS (SELECT 1 FROM review_stablecoin_payment_intents
                WHERE review_order_id = ? AND state IN ('awaiting_transfer','submitted','confirming','verified','manual_review'))`).bind(
              status, nextAction, now, order.id, order.status, order.id,
            )
        : db.prepare(`UPDATE review_orders SET status = ?, next_action = ?, updated_at = ?
            WHERE id = ? AND status = ?`).bind(status, nextAction, now, order.id, order.status),
    );
    if (releaseDeliverables) {
      statements.push(
        db.prepare(`UPDATE review_deliverables
          SET state = 'released', released_at = ?
          WHERE review_order_id = ? AND state = 'available'
            AND EXISTS (SELECT 1 FROM review_orders
              WHERE id = ? AND status = 'completed' AND updated_at = ?)`).bind(
                now, order.id, order.id, now,
              ),
      );
    }
  }
  statements.push(
    db.prepare(`INSERT INTO review_order_events
      (id, review_order_id, event_type, actor_type, actor_email, detail_json, created_at)
      SELECT ?, ?, ?, 'admin', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders
        WHERE id = ? AND status = ? AND updated_at = ? AND proposal_version IS ?)`).bind(
        crypto.randomUUID(), order.id, `admin.${action}`, options.actorEmail,
        JSON.stringify({ from: order.status, to: status, ...(manualPaymentAudit ? { manualPaymentAudit } : {}) }), now,
        order.id, status, now, proposalVersionAfter,
      ),
    db.prepare(`INSERT INTO admin_audit_events
      (id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at)
      SELECT ?, ?, 'review_order.update', 'review_order', ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders
        WHERE id = ? AND status = ? AND updated_at = ? AND proposal_version IS ?)`).bind(
        crypto.randomUUID(), options.actorEmail, order.id,
        JSON.stringify({ status: order.status, proposalVersion: order.proposalVersion }),
        JSON.stringify({ status, action, ...(manualPaymentAudit ? { manualPaymentAudit } : {}) }), now,
        order.id, status, now, proposalVersionAfter,
      ),
  );
  const lifecycleAction = action === "confirm_payment_manually"
    ? "payment_manually_confirmed"
    : action;
  const lifecycleMessage = manualPaymentAudit
    ? `Sanjay manually checked the submitted Ethereum transaction and recorded the ${manualPaymentAudit.phase} payment against your service order. Automatic payment verification was not used.`
    : nextAction;
  const lifecycleDeliveryId = await deterministicNotificationDeliveryId(
    "review.lifecycle.buyer",
    order.id,
    lifecycleAction,
    String(order.updatedAt),
    String(proposalVersionAfter ?? 0),
  );
  const lifecyclePayload = await sealedNotificationPayload({
    action: lifecycleAction,
    message: lifecycleMessage,
    reference: order.reference,
    reviewOrderId: order.id,
  });
  statements.push(
    db.prepare(`INSERT OR IGNORE INTO notification_outbox
      (id, delivery_id, topic, entity_id, state, attempts, template_version,
       payload_json, payload_hash, available_at, created_at, updated_at)
      SELECT ?, ?, 'review.lifecycle.buyer', ?, 'pending', 0,
             'review-lifecycle-buyer-v1', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM review_orders
        WHERE id = ? AND status = ? AND updated_at = ? AND proposal_version IS ?)`).bind(
          lifecycleDeliveryId,
          lifecycleDeliveryId,
          order.id,
          lifecyclePayload.json,
          lifecyclePayload.hash,
          now,
          now,
          now,
          order.id,
          status,
          now,
          proposalVersionAfter,
        ),
  );
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    if (action === "cancel") {
      const stablecoinSettlement = await db.prepare(`SELECT id FROM review_stablecoin_payment_intents
        WHERE review_order_id = ? AND state IN ('awaiting_transfer','submitted','confirming','verified','manual_review')
        LIMIT 1`).bind(order.id).first<{ id: string }>();
      if (stablecoinSettlement) {
        throw new HttpProblem(
          409,
          "payment_settlement_open",
          "This order has submitted or verified Ethereum payment evidence. Reconcile it before cancelling the order.",
        );
      }
    }
    throw new HttpProblem(409, "review_transition_conflict", "The review changed while this action was being applied. Reload it before retrying.");
  }
  const updated = await findReviewOrderById(order.id, db);
  if (!updated) throw new HttpProblem(503, "review_order_unavailable", "The updated review request could not be read.");
  return updated;
}

export function reviewCreateRequestHash(input: ReviewOrderInput): Promise<string> {
  return sha256Hex(stableStringify(input as unknown as Record<string, unknown>));
}

export async function reviewEmailHash(email: string): Promise<string> {
  return privateHash("review-email", email);
}

async function findReviewOrderById(id: string, db: D1Database): Promise<ReviewOrderRow | null> {
  return (await db.prepare(`${ORDER_SELECT} WHERE id = ? LIMIT 1`).bind(id).first<ReviewOrderRow>()) ?? null;
}

async function accessTokenMatches(expected: string, token: string): Promise<boolean> {
  const actual = await reviewCapabilityHash("review-order-access", token);
  return constantTimeEqual(expected, actual);
}

function reviewCookieToken(request: Request, id: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)nz_review_access=([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  const prefix = `${id}.`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false; let mismatch = 0; for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i); return mismatch === 0;
}
function iso(value: number | null): string | null { return value === null ? null : new Date(value).toISOString(); }
function adminText(value: unknown, field: string, min: number, max: number): string {
  const fields: Record<string, string> = {}; const text = requiredText(value, field, min, max, fields); if (fields[field]) throw new HttpProblem(422, "validation_failed", fields[field]); return text;
}
function optionalAdminText(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || value.trim().length > max) throw new HttpProblem(422, "validation_failed", "The next action is invalid."); return value.trim();
}
function parseFutureDate(value: unknown, now: number): number {
  if (typeof value !== "string") throw new HttpProblem(422, "validation_failed", "Choose a proposal expiry date."); const parsed = Date.parse(value); if (!Number.isFinite(parsed) || parsed <= now + 60 * 60 * 1000 || parsed > now + 30 * 24 * 60 * 60 * 1000) throw new HttpProblem(422, "validation_failed", "Proposal expiry must be between one hour and 30 days from now."); return parsed;
}
