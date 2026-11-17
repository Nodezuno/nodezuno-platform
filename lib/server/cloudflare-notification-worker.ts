import { reviewCapabilityHash, sha256Hex, stableStringify } from "./crypto.ts";
import { getDatabase } from "./database-binding.ts";
import {
  isOperationalEmailAddress,
  normalizeApplicationOrigin,
  runtimeEnvironmentValue,
} from "./runtime-config.ts";
import {
  isZohoEmailDeliveryConfigured,
  NODEZUNO_EMAIL_ADDRESS,
  sendNodezunoEmail,
} from "./zoho-email.ts";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 2 * 60_000;
const RETRY_HORIZON_MS = 20 * 60 * 60_000;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_REFERENCE = /^NZ-\d{4}-[A-F0-9]{8}$/;
const PAYMENT_CONFIRMATION_ID = /^confirm(?:-recon)?:[0-9a-f-]{36}$/i;
const LIFECYCLE_ACTIONS = new Set([
  "issue_proposal", "request_information", "decline", "schedule", "begin_review",
  "remediation", "request_balance", "deposit_verified", "balance_verified",
  "payment_manual_review", "payment_reconciled", "payment_submission_received",
  "payment_manually_confirmed",
  "complete", "cancel",
]);
const TOPIC_TEMPLATE: Record<string, string> = {
  "submission.received": "submission-received-operator-v1",
  "review.application.received.operator": "review-application-operator-v1",
  "review.application.received.buyer": "review-application-buyer-v1",
  "review.lifecycle.buyer": "review-lifecycle-buyer-v1",
  "newsletter.confirmation.requested": "newsletter-confirmation-v1",
  "newsletter.unsubscribe.requested": "newsletter-unsubscribe-internal-v1",
};

type OutboxRow = {
  id: string;
  deliveryId: string | null;
  topic: string;
  entityId: string;
  state: string;
  attempts: number;
  templateVersion: string | null;
  payloadJson: string;
  payloadHash: string | null;
  availableAt: number;
  leaseToken?: string | null;
  leaseExpiresAt?: number | null;
  firstAttemptAt: number | null;
  createdAt: number;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  listUnsubscribe?: string;
};

export async function processOneCloudflareNotification(): Promise<string> {
  const [smtpHost, smtpPassword, publicOrigin] = await Promise.all([
    runtimeEnvironmentValue("ZOHO_SMTP_HOST"),
    runtimeEnvironmentValue("ZOHO_SMTP_PASSWORD"),
    runtimeEnvironmentValue("PUBLIC_ORIGIN"),
  ]);
  if (
    !isZohoEmailDeliveryConfigured(smtpPassword, smtpHost) ||
    !publicOrigin?.trim() || publicOrigin !== publicOrigin.trim()
  ) return "not_configured";

  const db = await getDatabase();
  const now = Date.now();
  const candidate = await db.prepare(`SELECT
      id, delivery_id AS deliveryId, topic, entity_id AS entityId, state,
      attempts, template_version AS templateVersion, payload_json AS payloadJson,
      payload_hash AS payloadHash, available_at AS availableAt,
      lease_expires_at AS leaseExpiresAt, first_attempt_at AS firstAttemptAt,
      created_at AS createdAt
    FROM notification_outbox
    WHERE (state = 'pending' AND available_at <= ?)
       OR (state = 'processing' AND lease_expires_at <= ?)
    ORDER BY available_at ASC, created_at ASC, id ASC LIMIT 1`)
    .bind(now, now).first<OutboxRow>();
  if (!candidate) return "idle";

  const templateVersion = TOPIC_TEMPLATE[candidate.topic];
  let payload: Record<string, unknown>;
  let canonicalJson: string;
  let payloadHash: string;
  try {
    if (!templateVersion) throw new Error("unsupported_topic");
    payload = parsePlainObject(candidate.payloadJson);
    canonicalJson = stableStringify(payload);
    payloadHash = await sha256Hex(canonicalJson);
    if (candidate.deliveryId === null && candidate.templateVersion === null && candidate.payloadHash === null) {
      const sealed = await db.prepare(`UPDATE notification_outbox
        SET delivery_id = id, template_version = ?, payload_json = ?, payload_hash = ?, updated_at = ?
        WHERE id = ? AND delivery_id IS NULL AND template_version IS NULL AND payload_hash IS NULL`)
        .bind(templateVersion, canonicalJson, payloadHash, now, candidate.id).run();
      if (Number(sealed.meta?.changes ?? 0) !== 1) throw new Error("delivery_seal_conflict");
      candidate.deliveryId = candidate.id;
      candidate.templateVersion = templateVersion;
      candidate.payloadJson = canonicalJson;
      candidate.payloadHash = payloadHash;
    } else if (
      candidate.deliveryId !== candidate.id ||
      candidate.templateVersion !== templateVersion ||
      candidate.payloadHash !== payloadHash ||
      candidate.payloadJson !== canonicalJson
    ) {
      throw new Error("delivery_seal_invalid");
    }
    validatePayload(candidate, payload);
  } catch (error) {
    await db.prepare(`UPDATE notification_outbox
      SET state = 'failed', terminal_failure_code = ?, last_error = ?,
          lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND state IN ('pending', 'processing')`)
      .bind(errorCode(error), errorCode(error), now, candidate.id).run();
    return "failed";
  }

  if (
    candidate.attempts >= MAX_ATTEMPTS ||
    (candidate.firstAttemptAt !== null && now - candidate.firstAttemptAt >= RETRY_HORIZON_MS)
  ) {
    await db.prepare(`UPDATE notification_outbox
      SET state = 'failed', terminal_failure_code = 'retry_horizon_exhausted',
          last_error = 'retry_horizon_exhausted', lease_token = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ?`)
      .bind(now, candidate.id).run();
    return "failed";
  }

  const leaseToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const claim = await db.prepare(`UPDATE notification_outbox
      SET state = 'processing', attempts = attempts + 1, lease_token = ?,
          lease_expires_at = ?, first_attempt_at = COALESCE(first_attempt_at, ?),
          last_attempt_at = ?, terminal_failure_code = NULL, last_error = NULL,
          updated_at = ?
      WHERE id = ? AND delivery_id = ? AND
        ((state = 'pending' AND available_at <= ?) OR
         (state = 'processing' AND lease_expires_at <= ?))`)
    .bind(leaseToken, now + LEASE_MS, now, now, now, candidate.id, candidate.id, now, now).run();
  if (Number(claim.meta?.changes ?? 0) !== 1) return "idle";
  const row = await db.prepare(`SELECT
      id, delivery_id AS deliveryId, topic, entity_id AS entityId, state,
      attempts, template_version AS templateVersion, payload_json AS payloadJson,
      payload_hash AS payloadHash, available_at AS availableAt,
      lease_token AS leaseToken, lease_expires_at AS leaseExpiresAt,
      first_attempt_at AS firstAttemptAt, created_at AS createdAt
    FROM notification_outbox WHERE id = ? AND lease_token = ? LIMIT 1`)
    .bind(candidate.id, leaseToken).first<OutboxRow>();
  if (!row) return "idle";

  try {
    const message = await hydrateMessage(db, row, payload);
    if (message === null) {
      const internalId = `internal_${await sha256Hex(row.deliveryId ?? row.id)}`;
      const result = await db.prepare(`UPDATE notification_outbox
        SET state = 'delivered', provider = 'internal', provider_message_id = ?,
            accepted_at = ?, delivered_at = ?, lease_token = NULL,
            lease_expires_at = NULL, last_error = NULL, updated_at = ?
        WHERE id = ? AND state = 'processing' AND lease_token = ?`)
        .bind(internalId, Date.now(), Date.now(), Date.now(), row.id, leaseToken).run();
      return Number(result.meta?.changes ?? 0) === 1 ? "delivered" : "lease_lost";
    }

    const providerMessageId = await sendNodezunoEmail({
      ...message,
      messageId: `nodezuno-${row.deliveryId!.replaceAll("-", "")}`,
    });
    const acceptedAt = Date.now();
    const accepted = await db.prepare(`UPDATE notification_outbox
      SET state = 'accepted', provider = 'zoho', provider_message_id = ?,
          accepted_at = COALESCE(accepted_at, ?), lease_token = NULL,
          lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE id = ? AND state = 'processing' AND lease_token = ?`)
      .bind(providerMessageId, acceptedAt, acceptedAt, row.id, leaseToken).run();
    return Number(accepted.meta?.changes ?? 0) === 1 ? "accepted" : "lease_lost";
  } catch (error) {
    const code = errorCode(error);
    const delay = retryDelay(row, error);
    const firstAttemptAt = row.firstAttemptAt ?? now;
    const permanent = Boolean((error as { permanent?: boolean } | null)?.permanent);
    const terminal = permanent || row.attempts >= MAX_ATTEMPTS || now + delay - firstAttemptAt >= RETRY_HORIZON_MS;
    const updatedAt = Date.now();
    const failed = await db.prepare(`UPDATE notification_outbox
      SET state = ?, available_at = ?, terminal_failure_code = ?, last_error = ?,
          lease_token = NULL, lease_expires_at = NULL, updated_at = ?
      WHERE id = ? AND state = 'processing' AND lease_token = ?`)
      .bind(
        terminal ? "failed" : "pending",
        terminal ? updatedAt : updatedAt + delay,
        terminal ? code : null,
        code,
        updatedAt,
        row.id,
        leaseToken,
      ).run();
    return Number(failed.meta?.changes ?? 0) === 1
      ? terminal ? "failed" : "retry_scheduled"
      : "lease_lost";
  }
}

async function hydrateMessage(
  db: D1Database,
  row: OutboxRow,
  payload: Record<string, unknown>,
): Promise<EmailMessage | null> {
  const originRaw = await runtimeEnvironmentValue("PUBLIC_ORIGIN");
  const origin = normalizeApplicationOrigin(originRaw);
  if (!origin || origin !== originRaw) throw permanentFailure("public_origin_invalid");
  const operator = NODEZUNO_EMAIL_ADDRESS;

  if (row.topic === "newsletter.unsubscribe.requested") {
    const subscription = await db.prepare("SELECT state FROM newsletter_subscriptions WHERE id = ? LIMIT 1")
      .bind(row.entityId).first<{ state: string }>();
    if (!subscription || subscription.state !== "unsubscribed") throw permanentFailure("entity_state_invalid");
    return null;
  }

  if (row.topic === "submission.received") {
    if (!isOperationalEmailAddress(operator)) throw permanentFailure("operator_recipient_invalid");
    const submission = await db.prepare(`SELECT kind, company, team_type AS teamType, created_at AS createdAt
      FROM submissions WHERE id = ? LIMIT 1`).bind(row.entityId)
      .first<{ kind: string; company: string; teamType: string; createdAt: number }>();
    if (!submission || submission.kind !== payload.kind) throw permanentFailure("entity_missing");
    const company = safeLine(submission.company);
    const kind = safeLine(submission.kind.replaceAll("_", " "));
    const url = new URL("/admin", origin).toString();
    return message(operator, `New ${kind} request from ${company}`,
      `A new ${kind} request is waiting in Nodezuno operations.\n\nCompany: ${company}\nTeam: ${safeLine(submission.teamType)}\nReceived: ${new Date(submission.createdAt).toISOString()}\n\nOpen the restricted operations queue: ${url}`,
      `<p>A new <strong>${escapeHtml(kind)}</strong> request is waiting in Nodezuno operations.</p><p>Company: ${escapeHtml(company)}<br>Team: ${escapeHtml(safeLine(submission.teamType))}<br>Received: ${escapeHtml(new Date(submission.createdAt).toISOString())}</p><p><a href="${escapeHtml(url)}">Open the restricted operations queue</a></p>`);
  }

  if (row.topic.startsWith("review.application.received.")) {
    const order = await db.prepare(`SELECT id, reference, contact_name AS contactName,
      work_email AS workEmail, company, target_chain AS targetChain,
      idempotency_key AS idempotencyKey, request_hash AS requestHash,
      access_token_hash AS accessTokenHash, created_at AS createdAt
      FROM review_orders WHERE id = ? LIMIT 1`).bind(row.entityId).first<{
        id: string; reference: string; contactName: string; workEmail: string;
        company: string; targetChain: string; idempotencyKey: string;
        requestHash: string; accessTokenHash: string; createdAt: number;
      }>();
    if (!order || order.reference !== payload.reference) throw permanentFailure("entity_missing");
    const reference = safeLine(order.reference, 64);
    const company = safeLine(order.company);
    if (row.topic.endsWith(".operator")) {
      if (!isOperationalEmailAddress(operator)) throw permanentFailure("operator_recipient_invalid");
      const url = new URL("/admin#review-orders", origin).toString();
      if (payload.action === "payment_submission_received") {
        const claimId = String(payload.claimId ?? "");
        if (!UUID.test(claimId)) throw permanentFailure("payment_claim_invalid");
        const payment = await db.prepare(`SELECT
            c.transaction_hash AS transactionHash,
            c.telegram_username AS telegramUsername,
            i.phase, i.asset, i.token_amount_display AS tokenAmount,
            o.work_email AS workEmail, o.contact_name AS contactName
          FROM review_stablecoin_payment_claims c
          JOIN review_stablecoin_payment_intents i ON i.id = c.payment_intent_id
          JOIN review_orders o ON o.id = i.review_order_id
          WHERE c.id = ? AND o.id = ? AND c.state = 'manual_review'
            AND i.state = 'manual_review' LIMIT 1`)
          .bind(claimId, order.id).first<{
            transactionHash: string; telegramUsername: string; phase: string;
            asset: string; tokenAmount: string; workEmail: string; contactName: string;
          }>();
        if (
          !payment || !/^0x[a-f0-9]{64}$/i.test(payment.transactionHash) ||
          !["deposit", "balance"].includes(payment.phase) ||
          !["USDC", "USDT"].includes(payment.asset)
        ) throw permanentFailure("payment_claim_missing");
        const tx = payment.transactionHash.toLowerCase();
        const txUrl = `https://etherscan.io/tx/${tx}`;
        return message(operator, `Manual payment check needed: ${reference}`,
          `A customer submitted payment details. This is not verified payment evidence.\n\nReference: ${reference}\nCompany: ${company}\nCustomer: ${safeLine(payment.contactName)} <${safeEmail(payment.workEmail)}>\nPhase: ${safeLine(payment.phase)}\nClaimed amount: ${safeLine(payment.tokenAmount)} ${safeLine(payment.asset)}\nTelegram: ${safeLine(payment.telegramUsername)}\nTransaction hash: ${tx}\nEtherscan: ${txUrl}\n\nCheck the official Ethereum Mainnet token, transaction status, recipient, and exact amount yourself before contacting the customer or starting work.\n\nOpen the restricted order queue: ${url}`,
          `<p>A customer submitted payment details. <strong>This is not verified payment evidence.</strong></p><p>Reference: <strong>${escapeHtml(reference)}</strong><br>Company: ${escapeHtml(company)}<br>Customer: ${escapeHtml(safeLine(payment.contactName))} &lt;${escapeHtml(safeEmail(payment.workEmail))}&gt;<br>Phase: ${escapeHtml(safeLine(payment.phase))}<br>Claimed amount: ${escapeHtml(safeLine(payment.tokenAmount))} ${escapeHtml(safeLine(payment.asset))}<br>Telegram: ${escapeHtml(safeLine(payment.telegramUsername))}<br>Transaction: <code>${escapeHtml(tx)}</code></p><p><a href="${escapeHtml(txUrl)}">Inspect on Etherscan</a></p><p>Check the official Ethereum Mainnet token, transaction status, recipient, and exact amount yourself before contacting the customer or starting work.</p><p><a href="${escapeHtml(url)}">Open the restricted order queue</a></p>`);
      }
      return message(operator, `New direct service order ${reference}`,
        `A fixed-price blockchain upgrade service order was created.\n\nReference: ${reference}\nCompany: ${company}\nTarget chain: ${safeLine(order.targetChain)}\nReceived: ${new Date(order.createdAt).toISOString()}\n\nOpen the restricted service order queue: ${url}`,
        `<p>A fixed-price blockchain upgrade service order was created.</p><p>Reference: <strong>${escapeHtml(reference)}</strong><br>Company: ${escapeHtml(company)}<br>Target chain: ${escapeHtml(safeLine(order.targetChain))}</p><p><a href="${escapeHtml(url)}">Open the restricted service order queue</a></p>`);
    }
    const email = safeEmail(order.workEmail);
    const capability = await privateReviewCapability(order);
    const trackingUrl = new URL(`/review/${encodeURIComponent(order.id)}#access=${encodeURIComponent(capability)}`, origin).toString();
    return message(email, `Your service order: ${reference}`,
      `Hello ${safeLine(order.contactName)},\n\nYour private blockchain upgrade service-order page for ${company} is ready. Reference: ${reference}. Open the secure page for the current order status, scope, service terms, payment details, and next step.\n\nOpen your private service order: ${trackingUrl}\n\nKeep this link private.\n\nNodezuno Upgrade Assurance`,
      `<p>Hello ${escapeHtml(safeLine(order.contactName))},</p><p>Your private service-order page for ${escapeHtml(company)} is ready. Reference: <strong>${escapeHtml(reference)}</strong>.</p><p><a href="${escapeHtml(trackingUrl)}">Open your private service order</a></p><p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`);
  }

  if (row.topic === "review.lifecycle.buyer") {
    const order = await db.prepare(`SELECT id, reference, contact_name AS contactName,
      work_email AS workEmail, company, idempotency_key AS idempotencyKey,
      request_hash AS requestHash, access_token_hash AS accessTokenHash
      FROM review_orders WHERE id = ? LIMIT 1`).bind(row.entityId).first<{
        id: string; reference: string; contactName: string; workEmail: string;
        company: string; idempotencyKey: string; requestHash: string; accessTokenHash: string;
      }>();
    if (!order || order.reference !== payload.reference) throw permanentFailure("entity_missing");
    const email = safeEmail(order.workEmail);
    const capability = await privateReviewCapability(order);
    const trackingUrl = new URL(`/review/${encodeURIComponent(order.id)}#access=${encodeURIComponent(capability)}`, origin).toString();
    const reference = safeLine(order.reference, 64);
    const name = safeLine(order.contactName);
    if (["deposit_verified", "balance_verified", "payment_reconciled"].includes(String(payload.action))) {
      const payment = await paymentConfirmation(db, order.id, String(payload.action), String(payload.confirmationId ?? ""));
      const phaseLabel = payment.phase === "deposit" ? "scheduling deposit" : "final balance";
      const amount = atomicDisplay(payment.receivedAmountAtomic);
      const tx = payment.transactionHash;
      const txUrl = `https://etherscan.io/tx/${tx}`;
      const workMessage = payment.phase === "deposit"
        ? "Your service order is active. Nodezuno will begin work using the submitted scope and contact you if private materials are needed."
        : "Your final balance is complete. Nodezuno will release the final evidence package through your private engagement page.";
      return message(email, `Payment confirmed: ${reference}`,
        `Hello ${name},\n\nYour ${phaseLabel} payment is confirmed from finalized Ethereum Mainnet evidence.\n\nAmount: ${amount} ${payment.receivedAsset}\nNetwork: Ethereum Mainnet\nTransaction: ${tx}\nConfirmed: ${new Date(payment.confirmedAt).toISOString()}\nEtherscan: ${txUrl}\n\n${workMessage}\n\nOpen your private engagement page: ${trackingUrl}\n\nKeep this link private.\n\nNodezuno Upgrade Assurance`,
        `<p>Hello ${escapeHtml(name)},</p><p>Your <strong>${escapeHtml(phaseLabel)}</strong> payment is confirmed from finalized Ethereum Mainnet evidence.</p><p>Amount: <strong>${escapeHtml(amount)} ${escapeHtml(payment.receivedAsset)}</strong><br>Network: Ethereum Mainnet<br>Transaction: <code>${escapeHtml(tx)}</code><br>Confirmed: ${escapeHtml(new Date(payment.confirmedAt).toISOString())}</p><p><a href="${escapeHtml(txUrl)}">View the transaction on Etherscan</a></p><p>${escapeHtml(workMessage)}</p><p><a href="${escapeHtml(trackingUrl)}">Open your private engagement page</a></p><p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`);
    }
    const statusMessage = safeLine(payload.message, 1000);
    return message(email, `${lifecycleSubject(String(payload.action), reference)}`,
      `Hello ${name},\n\n${statusMessage}\n\nReference: ${reference}\nCompany: ${safeLine(order.company)}\n\nOpen your private engagement page: ${trackingUrl}\n\nKeep this link private.\n\nNodezuno Upgrade Assurance`,
      `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(statusMessage)}</p><p>Reference: <strong>${escapeHtml(reference)}</strong><br>Company: ${escapeHtml(safeLine(order.company))}</p><p><a href="${escapeHtml(trackingUrl)}">Open your private engagement page</a></p><p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`);
  }

  if (row.topic === "newsletter.confirmation.requested") {
    const subscription = await db.prepare(`SELECT email, email_hash AS emailHash, state,
      confirmation_token_id AS confirmationTokenId, confirmation_token_hash AS confirmationTokenHash,
      confirmation_expires_at AS confirmationExpiresAt
      FROM newsletter_subscriptions WHERE id = ? LIMIT 1`).bind(String(payload.subscriptionId))
      .first<{ email: string; emailHash: string; state: string; confirmationTokenId: string; confirmationTokenHash: string; confirmationExpiresAt: number }>();
    const token = String(payload.confirmationToken);
    const parts = /^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
    const unsubscribeToken = String(payload.unsubscribeToken);
    if (!parts || !/^[a-f0-9]{64}$/.test(unsubscribeToken)) throw permanentFailure("invalid_payload");
    const tokenHash = await sha256Hex(`newsletter-confirmation\u0000${parts[1]}\u0000${parts[2]}`);
    if (
      !subscription || subscription.emailHash !== payload.emailHash ||
      subscription.confirmationTokenId !== row.entityId ||
      subscription.confirmationTokenHash !== tokenHash ||
      !isOperationalEmailAddress(subscription.email)
    ) throw permanentFailure("entity_missing");
    if (subscription.state === "unsubscribed") return null;
    if (subscription.state !== "pending" || subscription.confirmationExpiresAt <= Date.now()) {
      throw permanentFailure("entity_state_invalid");
    }
    const confirmationUrl = new URL(String(payload.confirmationPath), origin).toString();
    const unsubscribeUrl = new URL(String(payload.unsubscribePath), origin).toString();
    return {
      ...message(subscription.email, "Confirm your Nodezuno Signal subscription",
        `Confirm your Nodezuno Signal subscription using this private link:\n${confirmationUrl}\n\nIf you did not request this, you can ignore it. Stop future email: ${unsubscribeUrl}\n\nNodezuno Signal`,
        `<p>Confirm your Nodezuno Signal subscription.</p><p><a href="${escapeHtml(confirmationUrl)}">Confirm subscription</a></p><p>If you did not request this, you can ignore it.</p><p><a href="${escapeHtml(unsubscribeUrl)}">Stop future email</a></p><p>Nodezuno Signal</p>`),
      listUnsubscribe: unsubscribeUrl,
    };
  }
  throw permanentFailure("unsupported_topic");
}

async function privateReviewCapability(order: {
  id: string; idempotencyKey: string; requestHash: string; accessTokenHash: string;
}) {
  const capability = await reviewCapabilityHash("review-order-capability", `${order.idempotencyKey}\u0000${order.requestHash}`);
  const storedHash = await reviewCapabilityHash("review-order-access", capability);
  if (!constantTimeEqual(storedHash, order.accessTokenHash)) throw permanentFailure("review_capability_invalid");
  return capability;
}

async function paymentConfirmation(
  db: D1Database,
  orderId: string,
  action: string,
  confirmationId: string,
) {
  const phase = action === "deposit_verified" ? "deposit" : action === "balance_verified" ? "balance" : null;
  const recordKind = action === "payment_reconciled" ? "reconciliation" : "exact_match";
  const conditions = ["review_order_id = ?", "record_kind = ?"];
  const bindings: unknown[] = [orderId, recordKind];
  if (phase) { conditions.push("phase = ?"); bindings.push(phase); }
  if (confirmationId) {
    if (!PAYMENT_CONFIRMATION_ID.test(confirmationId)) throw permanentFailure("payment_confirmation_invalid");
    conditions.push("id = ?"); bindings.push(confirmationId);
  }
  const result = await db.prepare(`SELECT phase, received_asset AS receivedAsset,
      received_amount_atomic AS receivedAmountAtomic, transaction_hash AS transactionHash,
      confirmed_at AS confirmedAt
    FROM review_stablecoin_payment_confirmations WHERE ${conditions.join(" AND ")} LIMIT 2`)
    .bind(...bindings).all<{ phase: string; receivedAsset: string; receivedAmountAtomic: string; transactionHash: string; confirmedAt: number }>();
  if (result.results.length !== 1) throw permanentFailure("payment_confirmation_ambiguous");
  const payment = result.results[0]!;
  if (
    !["deposit", "balance"].includes(payment.phase) ||
    !["USDC", "USDT"].includes(payment.receivedAsset) ||
    !/^0x[a-f0-9]{64}$/i.test(payment.transactionHash) ||
    !Number.isFinite(payment.confirmedAt)
  ) throw permanentFailure("payment_confirmation_invalid");
  return { ...payment, transactionHash: payment.transactionHash.toLowerCase() };
}

function validatePayload(row: OutboxRow, payload: Record<string, unknown>) {
  if (row.topic === "submission.received") {
    exactKeys(payload, ["kind", "submissionId"]);
    if (!UUID.test(String(payload.submissionId)) || payload.submissionId !== row.entityId) throw permanentFailure("invalid_payload");
  } else if (row.topic.startsWith("review.application.received.")) {
    const paymentSubmission = payload.action === "payment_submission_received";
    exactKeys(payload, paymentSubmission
      ? ["action", "claimId", "reference", "reviewOrderId"]
      : ["reference", "reviewOrderId"]);
    if (!UUID.test(String(payload.reviewOrderId)) || payload.reviewOrderId !== row.entityId || !REVIEW_REFERENCE.test(String(payload.reference))) throw permanentFailure("invalid_payload");
    if (paymentSubmission && (!row.topic.endsWith(".operator") || !UUID.test(String(payload.claimId)))) throw permanentFailure("invalid_payload");
  } else if (row.topic === "review.lifecycle.buyer") {
    const hasConfirmation = Object.hasOwn(payload, "confirmationId");
    exactKeys(payload, ["action", "message", "reference", "reviewOrderId", ...(hasConfirmation ? ["confirmationId"] : [])]);
    if (!UUID.test(String(payload.reviewOrderId)) || payload.reviewOrderId !== row.entityId || !REVIEW_REFERENCE.test(String(payload.reference)) || !LIFECYCLE_ACTIONS.has(String(payload.action)) || typeof payload.message !== "string" || payload.message.length < 1 || payload.message.length > 1000) throw permanentFailure("invalid_payload");
    if (hasConfirmation && !["deposit_verified", "balance_verified", "payment_reconciled"].includes(String(payload.action))) throw permanentFailure("invalid_payload");
  } else if (row.topic === "newsletter.confirmation.requested") {
    exactKeys(payload, ["confirmationPath", "confirmationToken", "emailHash", "subscriptionId", "unsubscribePath", "unsubscribeToken"]);
    if (
      !UUID.test(String(payload.subscriptionId)) ||
      !/^[a-f0-9]{64}$/.test(String(payload.emailHash)) ||
      !/^[a-f0-9]{64}$/.test(String(payload.unsubscribeToken)) ||
      String(payload.confirmationToken).length > 100 ||
      !String(payload.confirmationToken).startsWith(`${row.entityId}.`) ||
      payload.confirmationPath !== `/community/newsletter/confirm?token=${encodeURIComponent(String(payload.confirmationToken))}` ||
      payload.unsubscribePath !== `/community/newsletter/unsubscribe?token=${encodeURIComponent(String(payload.unsubscribeToken))}`
    ) throw permanentFailure("invalid_payload");
  } else if (row.topic === "newsletter.unsubscribe.requested") {
    exactKeys(payload, []);
    if (!UUID.test(row.entityId)) throw permanentFailure("invalid_payload");
  } else {
    throw permanentFailure("unsupported_topic");
  }
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw permanentFailure("invalid_payload");
  }
}

function parsePlainObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) {
    throw permanentFailure("invalid_payload");
  }
  return parsed as Record<string, unknown>;
}

function message(to: string, subject: string, text: string, html: string): EmailMessage {
  return {
    to: safeEmail(to),
    subject: safeLine(subject, 200),
    text,
    html,
    messageId: "pending",
  };
}

function safeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!isOperationalEmailAddress(email)) throw permanentFailure("recipient_invalid");
  return email;
}

function safeLine(value: unknown, maximum = 200): string {
  return String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function atomicDisplay(value: string): string {
  if (!/^\d{1,78}$/.test(value)) throw permanentFailure("payment_confirmation_invalid");
  const normalized = value.padStart(7, "0");
  const integer = normalized.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = normalized.slice(-6).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function lifecycleSubject(action: string, reference: string): string {
  const labels: Record<string, string> = {
    issue_proposal: "Service order updated", request_information: "Information requested",
    decline: "Review request update", schedule: "Review schedule confirmed",
    begin_review: "Review started", remediation: "Remediation opened",
    request_balance: "Final balance ready", payment_manual_review: "Payment needs reconciliation",
    payment_submission_received: "Payment details received",
    payment_manually_confirmed: "Payment checked manually",
    complete: "Evidence package released", cancel: "Engagement closed",
  };
  return `${labels[action] ?? "Review update"}: ${reference}`;
}

function retryDelay(row: OutboxRow, error: unknown): number {
  const providerDelay = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  const exponential = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, row.attempts - 1));
  const seed = Number.parseInt((row.deliveryId ?? row.id).replaceAll("-", "").slice(0, 8), 16) || 0;
  const calculated = Math.round(exponential * (0.8 + (seed % 401) / 1000));
  return typeof providerDelay === "number" && Number.isFinite(providerDelay)
    ? Math.max(calculated, Math.min(providerDelay, MAX_RETRY_MS))
    : calculated;
}

function permanentFailure(code: string): Error & { code: string; permanent: true } {
  return Object.assign(new Error(code), { code, permanent: true as const });
}

function errorCode(error: unknown): string {
  const raw = (error as { code?: unknown } | null)?.code;
  return typeof raw === "string" && /^[a-z0-9_]{1,80}$/.test(raw)
    ? raw
    : error instanceof Error && /^[a-z0-9_]{1,80}$/.test(error.message)
      ? error.message
      : "delivery_failed";
}
