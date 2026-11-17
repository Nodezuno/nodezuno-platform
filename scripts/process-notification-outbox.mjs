#!/usr/bin/env node

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { reviewCapabilityHash } from "../lib/server/crypto.ts";
import {
  isOperationalEmailAddress,
  normalizeApplicationOrigin,
  normalizeSqliteDatabasePath,
  normalizedRuntimeSecret,
  optionalEmailDeliveryConfigurationIsValid,
} from "../lib/server/runtime-config.ts";
import { sendZohoSmtpMessage } from "../lib/server/zoho-smtp-node.ts";
import { NODEZUNO_EMAIL_ADDRESS } from "../lib/server/zoho-smtp-protocol.ts";

const LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_ROWS_PER_PASS = 25;
const REQUEST_TIMEOUT_MS = 10_000;
// Both AWS workers share a host lock. Leave time for payment verification.
const PASS_BUDGET_MS = 45_000;
const ROW_FINISH_RESERVE_MS = REQUEST_TIMEOUT_MS + 10_000;
const RETRY_HORIZON_MS = 20 * 60 * 60 * 1000;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60 * 1000;
const SUBMISSION_KINDS = new Set([
  "sales",
  "workspace_access",
  "support",
  "startup_program",
  "press",
  "career_interest",
  "security_contact",
  "event_interest",
]);
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVIEW_REFERENCE_PATTERN = /^NZ-\d{4}-[A-F0-9]{8}$/;
const PAYMENT_CONFIRMATION_ID_PATTERN =
  /^confirm(?:-recon)?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_CONFIRMED_ACTIONS = new Set([
  "deposit_verified", "balance_verified", "payment_reconciled",
]);
const NEWSLETTER_CONFIRMATION_TOKEN_PATTERN =
  /^([a-f0-9]{32})\.([a-f0-9]{64})$/;
const NEWSLETTER_UNSUBSCRIBE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const TEMPLATE_VERSIONS = new Map([
  ["submission.received", "submission-received-operator-v1"],
  [
    "review.application.received.operator",
    "review-application-operator-v1",
  ],
  ["review.application.received.buyer", "review-application-buyer-v1"],
  ["review.lifecycle.buyer", "review-lifecycle-buyer-v1"],
  ["newsletter.confirmation.requested", "newsletter-confirmation-v1"],
  [
    "newsletter.unsubscribe.requested",
    "newsletter-unsubscribe-internal-v1",
  ],
]);
const REVIEW_LIFECYCLE_ACTIONS = new Set([
  "issue_proposal",
  "request_information",
  "decline",
  "schedule",
  "begin_review",
  "remediation",
  "request_balance",
  "deposit_verified",
  "balance_verified",
  "payment_manual_review",
  "payment_reconciled",
  "complete",
  "cancel",
]);

export class OutboxConfigurationError extends Error {}

export function readWorkerConfiguration(environment = process.env) {
  const rawPassword = environment.ZOHO_SMTP_PASSWORD ?? "";
  const rawSmtpHost = environment.ZOHO_SMTP_HOST ?? "";
  const password = rawPassword.trim();
  const smtpHost = rawSmtpHost.trim();
  if (!password && !smtpHost) {
    return { enabled: false };
  }
  if ((environment.NODEZUNO_DATABASE_DRIVER ?? "").trim() !== "sqlite") {
    throw new OutboxConfigurationError(
      "Notification delivery requires NODEZUNO_DATABASE_DRIVER=sqlite.",
    );
  }
  const databasePath = normalizeSqliteDatabasePath(
    environment.NODEZUNO_SQLITE_PATH,
  );
  if (!databasePath) {
    throw new OutboxConfigurationError(
      "NODEZUNO_SQLITE_PATH must be an absolute SQLite path.",
    );
  }
  if (
    !password ||
    !smtpHost ||
    !optionalEmailDeliveryConfigurationIsValid(password, smtpHost)
  ) {
    throw new OutboxConfigurationError(
      "ZOHO_SMTP_PASSWORD and ZOHO_SMTP_HOST must form a valid Zoho email configuration.",
    );
  }
  const publicOrigin = normalizeApplicationOrigin(
    environment.PUBLIC_ORIGIN,
    environment.NODEZUNO_LOCAL_PREVIEW === "true",
  );
  if (!publicOrigin || publicOrigin !== environment.PUBLIC_ORIGIN) {
    throw new OutboxConfigurationError(
      "PUBLIC_ORIGIN must be an exact normalized application origin.",
    );
  }
  if (!normalizedRuntimeSecret(environment.REVIEW_CAPABILITY_SECRET)) {
    throw new OutboxConfigurationError(
      "REVIEW_CAPABILITY_SECRET must be a valid dedicated secret.",
    );
  }
  return {
    databasePath,
    enabled: true,
    password,
    publicOrigin,
    smtpHost,
  };
}

function assertSafeDatabaseFile(databasePath) {
  const descriptor = openSync(
    databasePath,
    constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new OutboxConfigurationError(
        "SQLite storage path must be a regular file with one link.",
      );
    }
  } finally {
    closeSync(descriptor);
  }
}

export function openOutboxDatabase(databasePath) {
  assertSafeDatabaseFile(databasePath);
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA trusted_schema = OFF");
  return database;
}

function inTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original transaction failure.
    }
    throw error;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw permanentFailure("invalid_payload");
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  throw permanentFailure("invalid_payload");
}

function canonicalPayload(payloadJson) {
  let parsed;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    throw permanentFailure("invalid_payload");
  }
  const json = JSON.stringify(canonicalize(parsed));
  return {
    hash: createHash("sha256").update(json).digest("hex"),
    json,
  };
}

function sealCandidate(database, candidate, now) {
  const templateVersion = TEMPLATE_VERSIONS.get(candidate.topic);
  if (!templateVersion) throw permanentFailure("unsupported_topic");
  const canonical = canonicalPayload(candidate.payloadJson);
  const values = [
    candidate.deliveryId,
    candidate.templateVersion,
    candidate.payloadHash,
  ];
  const missing = values.filter((value) => value === null).length;
  if (missing === values.length) {
    const result = database
      .prepare(
        `UPDATE notification_outbox
         SET delivery_id = id, template_version = ?, payload_json = ?,
             payload_hash = ?, updated_at = ?
         WHERE id = ? AND delivery_id IS NULL
           AND template_version IS NULL AND payload_hash IS NULL`,
      )
      .run(
        templateVersion,
        canonical.json,
        canonical.hash,
        now,
        candidate.id,
      );
    if (result.changes !== 1) throw permanentFailure("delivery_seal_conflict");
    return {
      ...candidate,
      deliveryId: candidate.id,
      payloadHash: canonical.hash,
      payloadJson: canonical.json,
      templateVersion,
    };
  }
  if (
    missing !== 0 ||
    candidate.deliveryId !== candidate.id ||
    candidate.templateVersion !== templateVersion ||
    candidate.payloadHash !== canonical.hash ||
    candidate.payloadJson !== canonical.json
  ) {
    throw permanentFailure("delivery_seal_invalid");
  }
  return candidate;
}

function deadLetterUnclaimed(database, id, code, now) {
  database
    .prepare(
      `UPDATE notification_outbox
       SET state = 'failed', terminal_failure_code = ?, last_error = ?,
           lease_token = NULL, lease_expires_at = NULL, updated_at = ?
       WHERE id = ? AND state IN ('pending', 'processing')`,
    )
    .run(code, code, now, id);
}

function retryWindowIsExhausted(candidate, now) {
  return (
    candidate.attempts >= MAX_ATTEMPTS ||
    (typeof candidate.firstAttemptAt === "number" &&
      now - candidate.firstAttemptAt >= RETRY_HORIZON_MS)
  );
}

export function claimOutboxMessage(database, now = Date.now()) {
  return inTransaction(database, () => {
    const candidate = database
      .prepare(
        `SELECT id, delivery_id AS deliveryId, topic,
                entity_id AS entityId, state, attempts,
                template_version AS templateVersion,
                payload_json AS payloadJson, payload_hash AS payloadHash,
                available_at AS availableAt,
                lease_expires_at AS leaseExpiresAt,
                first_attempt_at AS firstAttemptAt,
                created_at AS createdAt, updated_at AS updatedAt
         FROM notification_outbox
         WHERE (state = 'pending' AND available_at <= ?)
            OR (state = 'processing' AND lease_expires_at <= ?)
         ORDER BY available_at ASC, created_at ASC, id ASC
         LIMIT 1`,
      )
      .get(now, now);
    if (!candidate) return null;
    if (retryWindowIsExhausted(candidate, now)) {
      deadLetterUnclaimed(
        database,
        candidate.id,
        "retry_horizon_exhausted",
        now,
      );
      return { deadLettered: true };
    }
    let sealed;
    try {
      sealed = sealCandidate(database, candidate, now);
    } catch (error) {
      const code = error?.code ?? "delivery_seal_invalid";
      deadLetterUnclaimed(database, candidate.id, code, now);
      return { deadLettered: true };
    }
    const leaseToken = randomBytes(32).toString("hex");
    const result = database
      .prepare(
        `UPDATE notification_outbox
         SET state = 'processing', attempts = attempts + 1,
             lease_token = ?, lease_expires_at = ?,
             first_attempt_at = COALESCE(first_attempt_at, ?),
             last_attempt_at = ?, terminal_failure_code = NULL,
             last_error = NULL, updated_at = ?
         WHERE id = ? AND delivery_id = ?
           AND ((state = 'pending' AND available_at <= ?)
             OR (state = 'processing' AND lease_expires_at <= ?))`,
      )
      .run(
        leaseToken,
        now + LEASE_MS,
        now,
        now,
        now,
        sealed.id,
        sealed.deliveryId,
        now,
        now,
      );
    if (result.changes !== 1) return null;
    return database
      .prepare(
        `SELECT id, delivery_id AS deliveryId, topic,
                entity_id AS entityId, state, attempts,
                template_version AS templateVersion,
                payload_json AS payloadJson, payload_hash AS payloadHash,
                available_at AS availableAt, lease_token AS leaseToken,
                lease_expires_at AS leaseExpiresAt,
                first_attempt_at AS firstAttemptAt,
                created_at AS createdAt, updated_at AS updatedAt
         FROM notification_outbox WHERE id = ? LIMIT 1`,
      )
      .get(sealed.id);
  });
}

function exactPayload(value, keys) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw permanentFailure("invalid_payload");
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw permanentFailure("invalid_payload");
  }
  return value;
}

function parsePayload(row) {
  let value;
  try {
    value = JSON.parse(row.payloadJson);
  } catch {
    throw permanentFailure("invalid_payload");
  }
  if (row.topic === "submission.received") {
    const payload = exactPayload(value, ["kind", "submissionId"]);
    if (
      payload.submissionId !== row.entityId ||
      !UUID_V4_PATTERN.test(payload.submissionId) ||
      !SUBMISSION_KINDS.has(payload.kind)
    ) {
      throw permanentFailure("invalid_payload");
    }
    return payload;
  }
  if (
    row.topic === "review.application.received.operator" ||
    row.topic === "review.application.received.buyer"
  ) {
    const payload = exactPayload(value, ["reference", "reviewOrderId"]);
    if (
      payload.reviewOrderId !== row.entityId ||
      !UUID_V4_PATTERN.test(payload.reviewOrderId) ||
      !REVIEW_REFERENCE_PATTERN.test(payload.reference)
    ) {
      throw permanentFailure("invalid_payload");
    }
    return payload;
  }
  if (row.topic === "review.lifecycle.buyer") {
    const hasConfirmationId = value && typeof value === "object" &&
      Object.hasOwn(value, "confirmationId");
    const payload = exactPayload(value, [
      "action",
      "message",
      "reference",
      "reviewOrderId",
      ...(hasConfirmationId ? ["confirmationId"] : []),
    ]);
    if (
      payload.reviewOrderId !== row.entityId ||
      !UUID_V4_PATTERN.test(payload.reviewOrderId) ||
      !REVIEW_REFERENCE_PATTERN.test(payload.reference) ||
      !REVIEW_LIFECYCLE_ACTIONS.has(payload.action) ||
      typeof payload.message !== "string" ||
      payload.message.length < 1 ||
      payload.message.length > 1000 ||
      (hasConfirmationId && (
        !PAYMENT_CONFIRMED_ACTIONS.has(payload.action) ||
        typeof payload.confirmationId !== "string" ||
        !PAYMENT_CONFIRMATION_ID_PATTERN.test(payload.confirmationId) ||
        (payload.action === "payment_reconciled"
          ? !payload.confirmationId.startsWith("confirm-recon:")
          : !payload.confirmationId.startsWith("confirm:"))
      ))
    ) {
      throw permanentFailure("invalid_payload");
    }
    return payload;
  }
  if (row.topic === "newsletter.confirmation.requested") {
    const payload = exactPayload(value, [
      "confirmationPath",
      "confirmationToken",
      "emailHash",
      "subscriptionId",
      "unsubscribePath",
      "unsubscribeToken",
    ]);
    if (
      typeof payload.subscriptionId !== "string" ||
      typeof payload.emailHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.emailHash) ||
      !UUID_V4_PATTERN.test(payload.subscriptionId) ||
      typeof payload.confirmationToken !== "string" ||
      !NEWSLETTER_CONFIRMATION_TOKEN_PATTERN.test(
        payload.confirmationToken,
      ) ||
      typeof payload.unsubscribeToken !== "string" ||
      !NEWSLETTER_UNSUBSCRIBE_TOKEN_PATTERN.test(payload.unsubscribeToken) ||
      !payload.confirmationToken.startsWith(`${row.entityId}.`) ||
      payload.confirmationPath !==
        `/community/newsletter/confirm?token=${encodeURIComponent(payload.confirmationToken)}` ||
      payload.unsubscribePath !==
        `/community/newsletter/unsubscribe?token=${encodeURIComponent(payload.unsubscribeToken)}`
    ) {
      throw permanentFailure("invalid_payload");
    }
    return payload;
  }
  if (row.topic === "newsletter.unsubscribe.requested") {
    const payload = exactPayload(value, []);
    if (!UUID_V4_PATTERN.test(row.entityId)) {
      throw permanentFailure("invalid_payload");
    }
    return payload;
  }
  throw permanentFailure("unsupported_topic");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeSingleLine(value, maximum = 200) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function absolutePublicUrl(origin, pathname) {
  const url = new URL(pathname, origin);
  const expected = new URL(origin);
  if (url.origin !== expected.origin) {
    throw permanentFailure("invalid_public_url");
  }
  return url.toString();
}

function constantTimeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function paymentConfirmationForLifecycle(database, reviewOrderId, action, confirmationId) {
  const phase = action === "deposit_verified"
    ? "deposit"
    : action === "balance_verified"
      ? "balance"
      : null;
  if (!phase && action !== "payment_reconciled") return null;
  const recordKind = action === "payment_reconciled"
    ? "reconciliation"
    : "exact_match";
  const filters = ["review_order_id = ?", "record_kind = ?"];
  const bindings = [reviewOrderId, recordKind];
  if (phase) {
    filters.push("phase = ?");
    bindings.push(phase);
  }
  if (confirmationId) {
    filters.push("id = ?");
    bindings.push(confirmationId);
  }
  const records = database.prepare(`
    SELECT phase, received_asset AS receivedAsset,
           received_amount_atomic AS receivedAmountAtomic,
           transaction_hash AS transactionHash,
           receipt_reference AS receiptReference,
           confirmed_at AS confirmedAt
    FROM review_stablecoin_payment_confirmations
    WHERE ${filters.join(" AND ")}
    LIMIT 2
  `).all(...bindings);
  if (records.length > 1) {
    throw permanentFailure("payment_confirmation_ambiguous");
  }
  return records[0] ?? null;
}

function stablecoinAtomicDisplay(value) {
  const digits = String(value);
  if (!/^\d{1,78}$/.test(digits)) throw permanentFailure("payment_confirmation_invalid");
  const normalized = digits.padStart(7, "0");
  const integer = normalized.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = normalized.slice(-6).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

export async function hydrateOutboxMessage(
  database,
  row,
  configuration,
  now = Date.now(),
) {
  const payload = parsePayload(row);
  if (row.topic === "newsletter.unsubscribe.requested") {
    const subscription = database
      .prepare(
        `SELECT state FROM newsletter_subscriptions WHERE id = ? LIMIT 1`,
      )
      .get(row.entityId);
    if (!subscription || subscription.state !== "unsubscribed") {
      throw permanentFailure("entity_state_invalid");
    }
    return { internalOnly: true };
  }
  if (row.topic === "submission.received") {
    const submission = database
      .prepare(
        `SELECT kind, company, team_type AS teamType, created_at AS createdAt
         FROM submissions WHERE id = ? LIMIT 1`,
      )
      .get(row.entityId);
    if (!submission || submission.kind !== payload.kind) {
      throw permanentFailure("entity_missing");
    }
    const company = safeSingleLine(submission.company);
    const kind = safeSingleLine(submission.kind.replaceAll("_", " "));
    const url = absolutePublicUrl(configuration.publicOrigin, "/admin");
    return {
      internalOnly: false,
      to: NODEZUNO_EMAIL_ADDRESS,
      subject: `New ${kind} request from ${company}`,
      text:
        `A new ${kind} request is waiting in Nodezuno operations.\n\n` +
        `Company: ${company}\nTeam: ${safeSingleLine(submission.teamType)}\n` +
        `Received: ${new Date(submission.createdAt).toISOString()}\n\n` +
        `Open the restricted operations queue: ${url}`,
      html:
        `<p>A new <strong>${escapeHtml(kind)}</strong> request is waiting in Nodezuno operations.</p>` +
        `<p>Company: ${escapeHtml(company)}<br>Team: ${escapeHtml(safeSingleLine(submission.teamType))}<br>` +
        `Received: ${escapeHtml(new Date(submission.createdAt).toISOString())}</p>` +
        `<p><a href="${escapeHtml(url)}">Open the restricted operations queue</a></p>`,
    };
  }
  if (
    row.topic === "review.application.received.operator" ||
    row.topic === "review.application.received.buyer"
  ) {
    const order = database
      .prepare(
        `SELECT reference, contact_name AS contactName,
                work_email AS workEmail, company,
                target_chain AS targetChain, idempotency_key AS idempotencyKey,
                request_hash AS requestHash, access_token_hash AS accessTokenHash,
                created_at AS createdAt
         FROM review_orders WHERE id = ? LIMIT 1`,
      )
      .get(row.entityId);
    if (!order || order.reference !== payload.reference) {
      throw permanentFailure("entity_missing");
    }
    const reference = safeSingleLine(order.reference, 64);
    const company = safeSingleLine(order.company);
    if (row.topic.endsWith(".operator")) {
      const url = absolutePublicUrl(
        configuration.publicOrigin,
        "/admin#review-orders",
      );
      return {
        internalOnly: false,
        to: NODEZUNO_EMAIL_ADDRESS,
        subject: `New direct service order ${reference}`,
        text:
          `A fixed-price blockchain upgrade service order was created. Open the restricted page for its current status.\n\n` +
          `Reference: ${reference}\nCompany: ${company}\n` +
          `Target chain: ${safeSingleLine(order.targetChain)}\n` +
          `Received: ${new Date(order.createdAt).toISOString()}\n\n` +
          `Open the restricted service order queue: ${url}`,
        html:
          `<p>A fixed-price blockchain upgrade service order was created. Open the restricted page for its current status.</p>` +
          `<p>Reference: <strong>${escapeHtml(reference)}</strong><br>` +
          `Company: ${escapeHtml(company)}<br>Target chain: ${escapeHtml(safeSingleLine(order.targetChain))}<br>` +
          `Received: ${escapeHtml(new Date(order.createdAt).toISOString())}</p>` +
          `<p><a href="${escapeHtml(url)}">Open the restricted service order queue</a></p>`,
      };
    }
    if (!isOperationalEmailAddress(order.workEmail)) {
      throw permanentFailure("recipient_invalid");
    }
    const capability = await reviewCapabilityHash(
      "review-order-capability",
      `${order.idempotencyKey}\u0000${order.requestHash}`,
    );
    const capabilityHash = await reviewCapabilityHash(
      "review-order-access",
      capability,
    );
    if (!constantTimeHexEqual(order.accessTokenHash, capabilityHash)) {
      throw permanentFailure("review_capability_invalid");
    }
    const trackingUrl = absolutePublicUrl(
      configuration.publicOrigin,
      `/review/${encodeURIComponent(row.entityId)}#access=${encodeURIComponent(capability)}`,
    );
    const name = safeSingleLine(order.contactName);
    return {
      internalOnly: false,
      to: order.workEmail,
      subject: `Your service order: ${reference}`,
      text:
        `Hello ${name},\n\nYour private blockchain upgrade service-order page for ${company} is ready. ` +
        `Reference: ${reference}. Open the secure page for the current order status, scope, service terms, payment details, and next step. If you have already sent a payment, do not send another transfer for the same phase.\n\n` +
        `Open your private service order: ${trackingUrl}\n\nKeep this link private.\n\n` +
        `Nodezuno Upgrade Assurance`,
      html:
        `<p>Hello ${escapeHtml(name)},</p>` +
        `<p>Your private blockchain upgrade service-order page for ${escapeHtml(company)} is ready. ` +
        `Reference: <strong>${escapeHtml(reference)}</strong>. Open the secure page for the current order status, scope, service terms, payment details, and next step. If you have already sent a payment, do not send another transfer for the same phase.</p>` +
        `<p><a href="${escapeHtml(trackingUrl)}">Open your private service order</a></p>` +
        `<p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`,
    };
  }
  if (row.topic === "review.lifecycle.buyer") {
    const order = database
      .prepare(
        `SELECT reference, contact_name AS contactName,
                work_email AS workEmail, company,
                idempotency_key AS idempotencyKey,
                request_hash AS requestHash, access_token_hash AS accessTokenHash
         FROM review_orders WHERE id = ? LIMIT 1`,
      )
      .get(row.entityId);
    if (!order || order.reference !== payload.reference) {
      throw permanentFailure("entity_missing");
    }
    if (!isOperationalEmailAddress(order.workEmail)) {
      throw permanentFailure("recipient_invalid");
    }
    const capability = await reviewCapabilityHash(
      "review-order-capability",
      `${order.idempotencyKey}\u0000${order.requestHash}`,
    );
    const capabilityHash = await reviewCapabilityHash(
      "review-order-access",
      capability,
    );
    if (!constantTimeHexEqual(order.accessTokenHash, capabilityHash)) {
      throw permanentFailure("review_capability_invalid");
    }
    const trackingUrl = absolutePublicUrl(
      configuration.publicOrigin,
      `/review/${encodeURIComponent(row.entityId)}#access=${encodeURIComponent(capability)}`,
    );
    const reference = safeSingleLine(order.reference, 64);
    const name = safeSingleLine(order.contactName);
    const company = safeSingleLine(order.company);
    const message = safeSingleLine(payload.message, 1000);
    const subject = lifecycleSubject(payload.action, reference);
    const paymentConfirmation = paymentConfirmationForLifecycle(
      database,
      row.entityId,
      payload.action,
      payload.confirmationId,
    );
    if (PAYMENT_CONFIRMED_ACTIONS.has(payload.action) && !paymentConfirmation) {
      throw permanentFailure("payment_confirmation_missing");
    }
    if (paymentConfirmation) {
      const phaseLabel = paymentConfirmation.phase === "deposit"
        ? "scheduling deposit"
        : "final balance";
      const amount = stablecoinAtomicDisplay(
        paymentConfirmation.receivedAmountAtomic,
      );
      const asset = safeSingleLine(paymentConfirmation.receivedAsset, 8);
      const transactionHash = safeSingleLine(
        paymentConfirmation.transactionHash,
        66,
      );
      const receiptReference = safeSingleLine(
        paymentConfirmation.receiptReference,
        96,
      );
      const confirmedAt = new Date(paymentConfirmation.confirmedAt);
      if (
        !["USDC", "USDT"].includes(asset) ||
        !/^0x[a-f0-9]{64}$/.test(transactionHash) ||
        !/^NZ-[A-Z0-9-]{10,92}$/.test(receiptReference) ||
        Number.isNaN(confirmedAt.getTime())
      ) {
        throw permanentFailure("payment_confirmation_invalid");
      }
      const etherscanUrl = `https://etherscan.io/tx/${transactionHash}`;
      const workMessage = paymentConfirmation.phase === "deposit"
        ? "Your service order is active. Nodezuno will begin work using the submitted scope and contact you for any required private artifacts."
        : "Your final balance is complete. Nodezuno will release the final evidence package through your private engagement page.";
      return {
        internalOnly: false,
        to: order.workEmail,
        subject: `Payment confirmed: ${reference}`,
        text:
          `Hello ${name},\n\nYour ${phaseLabel} payment is confirmed from finalized Ethereum Mainnet evidence.\n\n` +
          `Amount: ${amount} ${asset}\nNetwork: Ethereum Mainnet\n` +
          `Transaction: ${transactionHash}\nReceipt reference: ${receiptReference}\n` +
          `Confirmed: ${confirmedAt.toISOString()}\nEtherscan: ${etherscanUrl}\n\n` +
          `${workMessage}\n\nOpen your private engagement page: ${trackingUrl}\n\n` +
          `Keep this link private.\n\nNodezuno Upgrade Assurance`,
        html:
          `<p>Hello ${escapeHtml(name)},</p>` +
          `<p>Your <strong>${escapeHtml(phaseLabel)}</strong> payment is confirmed from finalized Ethereum Mainnet evidence.</p>` +
          `<p>Amount: <strong>${escapeHtml(amount)} ${escapeHtml(asset)}</strong><br>` +
          `Network: Ethereum Mainnet<br>Transaction: <code>${escapeHtml(transactionHash)}</code><br>` +
          `Receipt reference: <strong>${escapeHtml(receiptReference)}</strong><br>` +
          `Confirmed: ${escapeHtml(confirmedAt.toISOString())}</p>` +
          `<p><a href="${escapeHtml(etherscanUrl)}">View the transaction on Etherscan</a></p>` +
          `<p>${escapeHtml(workMessage)}</p>` +
          `<p><a href="${escapeHtml(trackingUrl)}">Open your private engagement page</a></p>` +
          `<p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`,
      };
    }
    return {
      internalOnly: false,
      to: order.workEmail,
      subject,
      text:
        `Hello ${name},\n\n${message}\n\n` +
        `Reference: ${reference}\nCompany: ${company}\n\n` +
        `Open your private engagement page: ${trackingUrl}\n\n` +
        `Keep this link private.\n\nNodezuno Upgrade Assurance`,
      html:
        `<p>Hello ${escapeHtml(name)},</p>` +
        `<p>${escapeHtml(message)}</p>` +
        `<p>Reference: <strong>${escapeHtml(reference)}</strong><br>Company: ${escapeHtml(company)}</p>` +
        `<p><a href="${escapeHtml(trackingUrl)}">Open your private engagement page</a></p>` +
        `<p>Keep this link private.</p><p>Nodezuno Upgrade Assurance</p>`,
    };
  }
  const subscription = database
    .prepare(
      `SELECT email, email_hash AS emailHash, state,
              confirmation_token_id AS confirmationTokenId,
              confirmation_token_hash AS confirmationTokenHash,
              confirmation_expires_at AS confirmationExpiresAt
       FROM newsletter_subscriptions WHERE id = ? LIMIT 1`,
    )
    .get(payload.subscriptionId);
  const confirmationParts = payload.confirmationToken.match(
    NEWSLETTER_CONFIRMATION_TOKEN_PATTERN,
  );
  if (!confirmationParts) throw permanentFailure("invalid_payload");
  const confirmationHash = createHash("sha256")
    .update(
      `newsletter-confirmation\u0000${confirmationParts[1]}\u0000${confirmationParts[2]}`,
    )
    .digest("hex");
  if (
    !subscription ||
    subscription.emailHash !== payload.emailHash ||
    subscription.confirmationTokenId !== row.entityId ||
    subscription.confirmationTokenHash !== confirmationHash ||
    !isOperationalEmailAddress(subscription.email)
  ) {
    throw permanentFailure("entity_missing");
  }
  if (subscription.state === "unsubscribed") {
    return { internalOnly: true, suppressed: true };
  }
  if (
    subscription.state !== "pending" ||
    subscription.confirmationExpiresAt <= now
  ) {
    throw permanentFailure("entity_state_invalid");
  }
  const confirmationUrl = absolutePublicUrl(
    configuration.publicOrigin,
    payload.confirmationPath,
  );
  const unsubscribeUrl = absolutePublicUrl(
    configuration.publicOrigin,
    payload.unsubscribePath,
  );
  return {
    internalOnly: false,
    to: subscription.email,
    subject: "Confirm your Nodezuno Signal subscription",
    text:
      `Confirm your Nodezuno Signal subscription using this private link:\n` +
      `${confirmationUrl}\n\nIf you did not request this, you can ignore it. ` +
      `Stop future email: ${unsubscribeUrl}\n\nNodezuno Signal`,
    html:
      `<p>Confirm your Nodezuno Signal subscription.</p>` +
      `<p><a href="${escapeHtml(confirmationUrl)}">Confirm subscription</a></p>` +
      `<p>If you did not request this, you can ignore it.</p>` +
      `<p><a href="${escapeHtml(unsubscribeUrl)}">Stop future email</a></p>` +
      `<p>Nodezuno Signal</p>`,
    listUnsubscribe: unsubscribeUrl,
  };
}

function lifecycleSubject(action, reference) {
  const labels = {
    issue_proposal: "Service order updated",
    request_information: "Information requested",
    decline: "Review request update",
    schedule: "Review schedule confirmed",
    begin_review: "Review started",
    remediation: "Remediation opened",
    request_balance: "Final balance ready",
    deposit_verified: "Payment confirmed",
    balance_verified: "Payment confirmed",
    payment_manual_review: "Payment needs reconciliation",
    payment_reconciled: "Payment reconciliation completed",
    complete: "Evidence package released",
    cancel: "Engagement closed",
  };
  return `${labels[action] ?? "Review update"}: ${reference}`;
}

function permanentFailure(code) {
  const error = new Error(code);
  error.code = code;
  error.permanent = true;
  return error;
}

export async function sendWithZoho(
  row,
  message,
  configuration,
  sendImplementation = sendZohoSmtpMessage,
) {
  const messageId = `nodezuno-${row.deliveryId.replaceAll("-", "")}`;
  return sendImplementation({
    host: configuration.smtpHost,
    password: configuration.password,
    message: { ...message, messageId },
  });
}

function retryDelayMs(row, providerRetryAfterMs = null) {
  const exponential = Math.min(
    MAX_RETRY_MS,
    BASE_RETRY_MS * 2 ** Math.max(0, row.attempts - 1),
  );
  const hash = createHash("sha256").update(row.deliveryId).digest().readUInt32BE();
  const calculated = Math.round(
    exponential * (0.8 + (hash % 401) / 1000),
  );
  return typeof providerRetryAfterMs === "number"
    ? Math.max(calculated, providerRetryAfterMs)
    : calculated;
}

function markInternalDelivered(database, row, now) {
  const providerMessageId = `internal_${createHash("sha256")
    .update(row.deliveryId)
    .digest("hex")}`;
  const result = database
    .prepare(
      `UPDATE notification_outbox
       SET state = 'delivered', provider = 'internal',
           provider_message_id = ?, accepted_at = ?, delivered_at = ?,
           lease_token = NULL, lease_expires_at = NULL,
           last_error = NULL, updated_at = ?
       WHERE delivery_id = ? AND state = 'processing' AND lease_token = ?`,
    )
    .run(
      providerMessageId,
      now,
      now,
      now,
      row.deliveryId,
      row.leaseToken,
    );
  if (result.changes !== 1) throw new Error("outbox_claim_lost");
}

function markProviderAccepted(database, row, providerMessageId, now) {
  const result = database
    .prepare(
      `UPDATE notification_outbox
       SET state = 'accepted', provider = 'zoho', provider_message_id = ?,
           accepted_at = COALESCE(accepted_at, ?),
           lease_token = NULL, lease_expires_at = NULL,
           last_error = NULL, updated_at = ?
       WHERE delivery_id = ? AND state = 'processing' AND lease_token = ?`,
    )
    .run(
      providerMessageId,
      now,
      now,
      row.deliveryId,
      row.leaseToken,
    );
  if (result.changes === 1) return "accepted";
  const converged = database
    .prepare(
      `SELECT state, provider_message_id AS providerMessageId
       FROM notification_outbox WHERE delivery_id = ? LIMIT 1`,
    )
    .get(row.deliveryId);
  if (
    converged?.providerMessageId === providerMessageId &&
    ["accepted", "delivered", "failed"].includes(converged.state)
  ) {
    return converged.state;
  }
  throw new Error("outbox_claim_lost");
}

function markFailed(database, row, error, now) {
  const code = typeof error?.code === "string"
    ? error.code.slice(0, 80)
    : "delivery_failed";
  const delay = retryDelayMs(row, error?.retryAfterMs);
  const firstAttemptAt = row.firstAttemptAt ?? now;
  const terminal =
    Boolean(error?.permanent) ||
    row.attempts >= MAX_ATTEMPTS ||
    now + delay - firstAttemptAt >= RETRY_HORIZON_MS;
  const result = database
    .prepare(
      `UPDATE notification_outbox
       SET state = ?, available_at = ?, terminal_failure_code = ?,
           last_error = ?, lease_token = NULL, lease_expires_at = NULL,
           updated_at = ?
       WHERE delivery_id = ? AND state = 'processing' AND lease_token = ?`,
    )
    .run(
      terminal ? "failed" : "pending",
      terminal ? now : now + delay,
      terminal ? code : null,
      code,
      now,
      row.deliveryId,
      row.leaseToken,
    );
  if (result.changes !== 1) {
    const converged = database
      .prepare(
        `SELECT state FROM notification_outbox WHERE delivery_id = ? LIMIT 1`,
      )
      .get(row.deliveryId);
    if (["accepted", "delivered", "failed"].includes(converged?.state)) {
      return converged.state;
    }
    throw new Error("outbox_claim_lost");
  }
  return terminal ? "failed" : "retry_scheduled";
}

export async function processOneOutboxMessage(options) {
  const now = options.now ?? Date.now();
  const row = claimOutboxMessage(options.database, now);
  if (!row) return { state: "idle" };
  if (row.deadLettered) return { state: "failed" };
  try {
    const message = await hydrateOutboxMessage(
      options.database,
      row,
      options.configuration,
      now,
    );
    if (message.internalOnly) {
      markInternalDelivered(options.database, row, options.now ?? Date.now());
      return { state: "delivered" };
    }
    const sendMessage = options.emailSenderImplementation ?? sendWithZoho;
    const providerMessageId = await sendMessage(
      row,
      message,
      options.configuration,
    );
    const finalState = markProviderAccepted(
      options.database,
      row,
      providerMessageId,
      options.now ?? Date.now(),
    );
    return { state: finalState };
  } catch (error) {
    const finalState = markFailed(
      options.database,
      row,
      error,
      options.now ?? Date.now(),
    );
    return { state: finalState };
  }
}

export async function processOutboxPass(options) {
  const startedAt = performance.now();
  const limit = Math.max(
    1,
    Math.min(MAX_ROWS_PER_PASS, options.limit ?? MAX_ROWS_PER_PASS),
  );
  const summary = {
    accepted: 0,
    delivered: 0,
    failed: 0,
    retryScheduled: 0,
    budgetExhausted: false,
    durationMs: 0,
  };
  for (let index = 0; index < limit; index += 1) {
    // Stop before claiming another row. Unclaimed rows keep their state and attempts.
    if (performance.now() - startedAt >= PASS_BUDGET_MS - ROW_FINISH_RESERVE_MS) {
      summary.budgetExhausted = true;
      break;
    }
    const result = await processOneOutboxMessage(options);
    if (result.state === "idle") break;
    if (result.state === "accepted") summary.accepted += 1;
    if (result.state === "delivered") summary.delivered += 1;
    if (result.state === "failed") summary.failed += 1;
    if (result.state === "retry_scheduled") summary.retryScheduled += 1;
  }
  summary.durationMs = Math.round(performance.now() - startedAt);
  return summary;
}

function aggregateLog(stream, event, detail = {}) {
  stream.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: "email-worker", event, ...detail })}\n`);
}

async function main() {
  const unknown = process.argv.slice(2).filter((item) => item !== "--once");
  if (unknown.length) {
    throw new OutboxConfigurationError(
      "Usage: process-notification-outbox.mjs [--once]",
    );
  }
  const configuration = readWorkerConfiguration();
  if (!configuration.enabled) {
    aggregateLog(process.stdout, "outbox_worker_disabled");
    return;
  }
  const database = openOutboxDatabase(configuration.databasePath);
  try {
    const result = await processOutboxPass({ configuration, database });
    aggregateLog(process.stdout, "outbox_pass_completed", result);
  } finally {
    database.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    aggregateLog(
      process.stderr,
      error instanceof OutboxConfigurationError
        ? "outbox_worker_configuration_invalid"
        : "outbox_worker_failed",
    );
    process.exitCode = 1;
  });
}
