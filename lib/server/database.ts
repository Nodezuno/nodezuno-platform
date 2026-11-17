import type {
  NewsletterInput,
  SubmissionInput,
  SubmissionKind,
} from "./contracts.ts";
import { HttpProblem } from "./http.ts";
import {
  allowsLocalUnverifiedEmailAuthentication,
  allValuesAreDistinct,
  constantTimeStringEqual,
  isOperationalEmailAddress,
  isContainerRuntime,
  normalizeApplicationOrigin,
  normalizedRuntimeSecret,
  optionalEmailDeliveryConfigurationIsValid,
  optionalNotificationDeliveryConfigurationIsValid,
  optionalGoogleConfigurationIsValid,
  runtimeConfigurationSnapshot,
} from "./runtime-config.ts";
import { getDatabase } from "./database-binding.ts";
import {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "./notification-outbox.ts";
export {
  deterministicNotificationDeliveryId,
  sealedNotificationPayload,
} from "./notification-outbox.ts";
export type SubmissionRecord = {
  id: string;
  kind: SubmissionKind;
  status: "received" | "reviewing" | "closed" | "spam";
  name: string;
  email: string;
  company: string;
  teamType: string;
  message: string;
  sourcePath: string;
  requestHash: string;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
};

export type SubmissionSummary = Omit<
  SubmissionRecord,
  "requestHash" | "idempotencyKey"
>;

export type PublicStatusService = {
  slug: string;
  name: string;
  description: string;
  state:
    | "preview"
    | "operational"
    | "degraded"
    | "partial_outage"
    | "major_outage"
    | "maintenance";
  updatedAt: number;
};

export type PublicIncident = {
  id: string;
  slug: string;
  title: string;
  severity: "none" | "minor" | "major" | "critical";
  state: "investigating" | "identified" | "monitoring" | "resolved";
  impact: string;
  startedAt: number;
  resolvedAt: number | null;
  updatedAt: number;
};

export type PublicChain = {
  slug: string;
  name: string;
  family: string;
  finality: string;
  stage: "planned" | "preview" | "full" | "data_only";
  capabilities: string[];
  tone: string;
  verifiedAt: number | null;
  updatedAt: number;
};

export { getDatabase } from "./database-binding.ts";

export async function checkDatabase(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM status_services) AS serviceCount,
         (SELECT COUNT(*) FROM chains) AS chainCount,
         EXISTS(
           SELECT submitted_by_account_id
           FROM submissions LIMIT 1
         ) AS submissionsAccessible,
         EXISTS(SELECT 1 FROM submission_events LIMIT 1) AS eventsAccessible,
         EXISTS(
           SELECT confirmation_token_id, confirmation_token_hash,
                  confirmation_requested_at, confirmation_expires_at,
                  confirmed_at
           FROM newsletter_subscriptions LIMIT 1
         ) AS newsletterAccessible,
         EXISTS(SELECT 1 FROM notification_outbox LIMIT 1) AS outboxAccessible,
         EXISTS(SELECT 1 FROM rate_limit_windows LIMIT 1) AS rateLimitsAccessible,
         EXISTS(SELECT 1 FROM status_incidents LIMIT 1) AS incidentsAccessible,
         EXISTS(SELECT 1 FROM status_incident_updates LIMIT 1) AS incidentUpdatesAccessible,
         EXISTS(SELECT 1 FROM admin_audit_events LIMIT 1) AS auditAccessible,
         EXISTS(
           SELECT id, name, email, email_verified, image, created_at, updated_at
           FROM auth_users LIMIT 1
         ) AS authUsersAccessible,
         EXISTS(
           SELECT id, expires_at, token, created_at, updated_at, ip_address,
                  user_agent, user_id
           FROM auth_sessions LIMIT 1
         ) AS authSessionsAccessible,
         EXISTS(
           SELECT id, account_id, provider_id, user_id, access_token,
                  refresh_token, id_token, access_token_expires_at,
                  refresh_token_expires_at, scope, password, created_at,
                  updated_at
           FROM auth_accounts LIMIT 1
         ) AS authAccountsAccessible,
         EXISTS(
           SELECT id, identifier, value, expires_at, created_at, updated_at
           FROM auth_verifications LIMIT 1
         ) AS authVerificationsAccessible,
         EXISTS(
           SELECT id, key, count, last_request
           FROM auth_rate_limits LIMIT 1
         ) AS authRateLimitsAccessible,
         EXISTS(
           SELECT id, user_id, address, chain_id, is_primary, created_at
           FROM auth_wallet_addresses LIMIT 1
         ) AS authWalletAddressesAccessible,
         EXISTS(
           SELECT id, user_id, address, is_primary, created_at
           FROM auth_solana_wallets LIMIT 1
         ) AS authSolanaWalletsAccessible,
         EXISTS(
           SELECT id, reference, status, contact_name, work_email, company,
                  target_chain, total_amount, deposit_amount, balance_amount,
                  currency, telegram_username, access_token_hash,
                  created_at, updated_at
           FROM review_orders LIMIT 1
         ) AS reviewOrdersAccessible,
         EXISTS(
           SELECT id, review_order_id, event_type, actor_type, detail_json,
                  created_at FROM review_order_events LIMIT 1
         ) AS reviewOrderEventsAccessible,
         EXISTS(
           SELECT id, review_order_id, phase, state, asset, chain_id,
                  token_contract, recipient_address, obligation_amount,
                  token_amount_atomic, reference_units, proposal_version,
                  confirmations_required, terms_version, terms_hash,
                  creation_idempotency_hash, creation_request_hash,
                  expires_at, created_at, updated_at
           FROM review_stablecoin_payment_intents LIMIT 1
         ) AS stablecoinPaymentIntentsAccessible,
         EXISTS(
           SELECT id, payment_intent_id, transaction_hash,
                  telegram_username, state, confirmations, evidence_hash,
                  attempt_count, next_check_at, created_at, updated_at
           FROM review_stablecoin_payment_claims LIMIT 1
         ) AS stablecoinPaymentClaimsAccessible,
         EXISTS(
           SELECT id, review_order_id, payment_intent_id, payment_claim_id,
                  transaction_hash, case_type, state, phase,
                  expected_asset, expected_token_contract,
                  expected_recipient_address, expected_amount_atomic,
                  confirmations_observed, confirmations_required,
                  rpc_agreement_count, evidence_hash,
                  resolution_idempotency_hash, resolution_request_hash,
                  resolution_code, opened_at, updated_at
           FROM review_stablecoin_reconciliation_cases LIMIT 1
         ) AS stablecoinReconciliationsAccessible,
         EXISTS(
           SELECT id, review_order_id, payment_intent_id, payment_claim_id,
                  reconciliation_case_id, record_kind, phase,
                  expected_asset, received_asset, transaction_hash,
                  block_number, block_hash, log_index,
                  confirmations_observed, confirmations_required,
                  rpc_agreement_count, evidence_hash, public_record_hash,
                  receipt_reference, confirmed_at, recorded_at
           FROM review_stablecoin_payment_confirmations LIMIT 1
         ) AS stablecoinPaymentConfirmationsAccessible,
         EXISTS(
           SELECT id, configuration_hash, configured_endpoint_count,
                  healthy_endpoint_count, state, checked_at, updated_at
           FROM payment_verifier_health LIMIT 1
         ) AS paymentVerifierHealthAccessible,
         EXISTS(
           SELECT id, review_order_id, kind, state, object_key, file_name,
                  content_type, size_bytes, sha256, storage_version_id,
                  created_at
           FROM review_deliverables LIMIT 1
         ) AS reviewDeliverablesAccessible`,
    )
    .first<{
      serviceCount: number;
      chainCount: number;
      submissionsAccessible: number;
      eventsAccessible: number;
      newsletterAccessible: number;
      outboxAccessible: number;
      rateLimitsAccessible: number;
      incidentsAccessible: number;
      incidentUpdatesAccessible: number;
      auditAccessible: number;
      authUsersAccessible: number;
      authSessionsAccessible: number;
      authAccountsAccessible: number;
      authVerificationsAccessible: number;
      authRateLimitsAccessible: number;
      authWalletAddressesAccessible: number;
      authSolanaWalletsAccessible: number;
      reviewOrdersAccessible: number;
      reviewOrderEventsAccessible: number;
      stablecoinPaymentIntentsAccessible: number;
      stablecoinPaymentClaimsAccessible: number;
      stablecoinReconciliationsAccessible: number;
      stablecoinPaymentConfirmationsAccessible: number;
      paymentVerifierHealthAccessible: number;
      reviewDeliverablesAccessible: number;
    }>();
  return Boolean(
    row &&
      row.serviceCount >= 6 &&
      row.chainCount >= 8 &&
      [
        row.submissionsAccessible,
        row.eventsAccessible,
        row.newsletterAccessible,
        row.outboxAccessible,
        row.rateLimitsAccessible,
        row.incidentsAccessible,
        row.incidentUpdatesAccessible,
        row.auditAccessible,
        row.authUsersAccessible,
        row.authSessionsAccessible,
        row.authAccountsAccessible,
        row.authVerificationsAccessible,
        row.authRateLimitsAccessible,
        row.authWalletAddressesAccessible,
        row.authSolanaWalletsAccessible,
        row.reviewOrdersAccessible,
        row.reviewOrderEventsAccessible,
        row.stablecoinPaymentIntentsAccessible,
        row.stablecoinPaymentClaimsAccessible,
        row.stablecoinReconciliationsAccessible,
        row.stablecoinPaymentConfirmationsAccessible,
        row.paymentVerifierHealthAccessible,
        row.reviewDeliverablesAccessible,
      ].every((value) => value === 0 || value === 1),
  );
}

export async function checkRuntimeConfiguration(): Promise<boolean> {
  const { stablecoinPaymentConfiguration } = await import(
    "./stablecoin-payment-config.ts"
  );
  const stablecoinPayments = await stablecoinPaymentConfiguration();
  if (isContainerRuntime()) {
    const {
      publicOrigin,
      rateLimitSecret,
      reviewCapabilitySecret,
      secretIsolation,
      administratorAllowlist,
      accountAuthentication,
      databaseConnection,
      ingressBoundary,
      accessIdentity,
      notificationDelivery,
      deliverableStorage,
    } = runtimeConfigurationSnapshot();
    return Boolean(
      publicOrigin &&
        rateLimitSecret &&
        reviewCapabilitySecret &&
        secretIsolation &&
        administratorAllowlist &&
        accountAuthentication &&
        databaseConnection &&
        ingressBoundary &&
        accessIdentity &&
        notificationDelivery &&
        (process.env.NODEZUNO_LOCAL_PREVIEW === "true" || deliverableStorage) &&
        (process.env.NODEZUNO_PUBLIC_INDEXING !== "true" ||
          process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED === "true") &&
        stablecoinPayments.ready,
    );
  }
  const { siteDeliverablesBucket, siteEnvironmentValue } = await import("./sites-environment.ts");
  const [
    rateLimitSecret,
    betterAuthSecret,
    betterAuthUrl,
    rawAdministratorEmails,
    googleClientId,
    googleClientSecret,
    zohoSmtpHost,
    zohoSmtpPassword,
    localPreview,
    reviewCapabilitySecret,
    deliverablesBucket,
  ] = await Promise.all([
    siteEnvironmentValue("RATE_LIMIT_SECRET"),
    siteEnvironmentValue("BETTER_AUTH_SECRET"),
    siteEnvironmentValue("BETTER_AUTH_URL"),
    siteEnvironmentValue("NODEZUNO_ADMIN_EMAILS"),
    siteEnvironmentValue("GOOGLE_CLIENT_ID"),
    siteEnvironmentValue("GOOGLE_CLIENT_SECRET"),
    siteEnvironmentValue("ZOHO_SMTP_HOST"),
    siteEnvironmentValue("ZOHO_SMTP_PASSWORD"),
    siteEnvironmentValue("NODEZUNO_LOCAL_PREVIEW"),
    siteEnvironmentValue("REVIEW_CAPABILITY_SECRET"),
    siteDeliverablesBucket(),
  ]);
  const normalizedRateLimitSecret = normalizedRuntimeSecret(
    typeof rateLimitSecret === "string" ? rateLimitSecret : undefined,
  );
  const normalizedBetterAuthSecret = normalizedRuntimeSecret(
    typeof betterAuthSecret === "string"
      ? betterAuthSecret
      : undefined,
  );
  const normalizedReviewCapabilitySecret = normalizedRuntimeSecret(
    typeof reviewCapabilitySecret === "string"
      ? reviewCapabilitySecret
      : undefined,
  );
  const administratorEmails =
    typeof rawAdministratorEmails === "string"
      ? rawAdministratorEmails
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(isOperationalEmailAddress)
      : [];
  const notificationDeliveryReady = optionalNotificationDeliveryConfigurationIsValid(
    typeof zohoSmtpPassword === "string" ? zohoSmtpPassword : undefined,
    typeof zohoSmtpHost === "string" ? zohoSmtpHost : undefined,
  );
  const deliverableStorageReady =
    localPreview === "true" || Boolean(deliverablesBucket);
  return Boolean(
    normalizedRateLimitSecret &&
      normalizedBetterAuthSecret &&
      normalizedReviewCapabilitySecret &&
      allValuesAreDistinct([
        normalizedRateLimitSecret,
        normalizedBetterAuthSecret,
        normalizedReviewCapabilitySecret,
      ]) &&
      typeof betterAuthUrl === "string" &&
      normalizeApplicationOrigin(
        betterAuthUrl,
        localPreview === "true",
      ) === betterAuthUrl &&
      optionalGoogleConfigurationIsValid(
        typeof googleClientId === "string" ? googleClientId : undefined,
        typeof googleClientSecret === "string"
          ? googleClientSecret
          : undefined,
      ) &&
      optionalEmailDeliveryConfigurationIsValid(
        typeof zohoSmtpPassword === "string" ? zohoSmtpPassword : undefined,
        typeof zohoSmtpHost === "string" ? zohoSmtpHost : undefined,
      ) &&
      ((typeof zohoSmtpPassword === "string" &&
        zohoSmtpPassword.trim().length > 0 &&
        typeof zohoSmtpHost === "string" &&
        zohoSmtpHost.trim().length > 0) ||
        allowsLocalUnverifiedEmailAuthentication(
          typeof betterAuthUrl === "string"
            ? betterAuthUrl
            : undefined,
          typeof localPreview === "string"
            ? localPreview
            : undefined,
        )) &&
      administratorEmails.length > 0 &&
      notificationDeliveryReady &&
      deliverableStorageReady &&
      stablecoinPayments.ready,
  );
}

export async function listPublicStatus(): Promise<{
  services: PublicStatusService[];
  incidents: PublicIncident[];
}> {
  const db = await getDatabase();
  const [serviceResult, incidentResult] = await Promise.all([
    db
      .prepare(
        `SELECT slug, name, description, state, updated_at AS updatedAt
         FROM status_services
         WHERE visible = 1
         ORDER BY sort_order ASC, name ASC`,
      )
      .all<PublicStatusService>(),
    db
      .prepare(
        `SELECT id, slug, title, severity, state, impact,
                started_at AS startedAt, resolved_at AS resolvedAt,
                updated_at AS updatedAt
         FROM status_incidents
         ORDER BY started_at DESC
         LIMIT 20`,
      )
      .all<PublicIncident>(),
  ]);
  return {
    services: serviceResult.results ?? [],
    incidents: incidentResult.results ?? [],
  };
}

export async function listPublicChains(): Promise<PublicChain[]> {
  const db = await getDatabase();
  const result = await db
    .prepare(
      `SELECT slug, name, family, finality_model AS finality,
              support_stage AS stage, capabilities_json AS capabilitiesJson,
              tone, verified_at AS verifiedAt, updated_at AS updatedAt
       FROM chains
       WHERE visible = 1
       ORDER BY sort_order ASC, name ASC`,
    )
    .all<Omit<PublicChain, "capabilities"> & { capabilitiesJson: string }>();
  return (result.results ?? []).map(
    ({ capabilitiesJson, ...row }) => ({
      ...row,
      capabilities: parseStringArray(capabilitiesJson),
    }),
  );
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function findSubmissionByIdempotency(
  kind: SubmissionKind,
  idempotencyKey: string,
  providedDatabase?: D1Database,
): Promise<SubmissionRecord | null> {
  const db = providedDatabase ?? (await getDatabase());
  const now = Date.now();
  return (
    (await db
      .prepare(
        `SELECT id, kind, status, name, email, company,
                team_type AS teamType, message, source_path AS sourcePath,
                request_hash AS requestHash, idempotency_key AS idempotencyKey,
                created_at AS createdAt, updated_at AS updatedAt
         FROM submissions
         WHERE kind = ? AND idempotency_key = ? AND expires_at > ?
         LIMIT 1`,
      )
      .bind(kind, idempotencyKey, now)
      .first<SubmissionRecord>()) ?? null
  );
}

export async function cleanupExpiredData(
  providedDatabase?: D1Database,
  now = Date.now(),
): Promise<void> {
  const db = providedDatabase ?? (await getDatabase());
  await db.batch([
    db
      .prepare(
        `DELETE FROM notification_outbox
         WHERE entity_id IN (
           SELECT id FROM submissions WHERE expires_at <= ?
         )`,
      )
      .bind(now),
    db
      .prepare("DELETE FROM submissions WHERE expires_at <= ?")
      .bind(now),
    db
      .prepare("DELETE FROM rate_limit_windows WHERE expires_at <= ?")
      .bind(now),
  ]);
}

export async function runRetentionMaintenance(options: {
  actorEmail: string;
  now?: number;
}): Promise<{
  expiredSubmissions: number;
  expiredRateLimitWindows: number;
}> {
  const db = await getDatabase();
  const now = options.now ?? Date.now();
  const [submissionCount, rateLimitCount] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM submissions WHERE expires_at <= ?",
      )
      .bind(now)
      .first<{ count: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM rate_limit_windows WHERE expires_at <= ?",
      )
      .bind(now)
      .first<{ count: number }>(),
  ]);
  const result = {
    expiredSubmissions: submissionCount?.count ?? 0,
    expiredRateLimitWindows: rateLimitCount?.count ?? 0,
  };
  await db.batch([
    db
      .prepare(
        `DELETE FROM notification_outbox
         WHERE entity_id IN (
           SELECT id FROM submissions WHERE expires_at <= ?
         )`,
      )
      .bind(now),
    db
      .prepare("DELETE FROM submissions WHERE expires_at <= ?")
      .bind(now),
    db
      .prepare("DELETE FROM rate_limit_windows WHERE expires_at <= ?")
      .bind(now),
    db
      .prepare(
        `INSERT INTO admin_audit_events
          (id, actor_email, action, entity_type, entity_id, before_json,
           after_json, created_at)
         VALUES (?, ?, 'retention.cleanup', 'system', 'website-backend',
                 NULL, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorEmail,
        JSON.stringify(result),
        now,
      ),
  ]);
  return result;
}

export async function consumeRateLimit(options: {
  scope: string;
  subjectHash: string;
  limit: number;
  windowMs: number;
  now?: number;
  database?: D1Database;
}): Promise<{ remaining: number; retryAfterSeconds: number }> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
  const expiresAt = windowStart + options.windowMs * 2;
  const id = `${options.scope}:${options.subjectHash}:${windowStart}`;

  const row = await db
    .prepare(
      `INSERT INTO rate_limit_windows
         (id, scope, subject_hash, window_start, count, expires_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(
      id,
      options.scope,
      options.subjectHash,
      windowStart,
      expiresAt,
    )
    .first<{ count: number }>();

  const count = row?.count ?? options.limit + 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart + options.windowMs - now) / 1000),
  );
  if (count > options.limit) {
    throw new HttpProblem(
      429,
      "rate_limit_exceeded",
      "Too many requests. Please try again later.",
      undefined,
      { "Retry-After": String(retryAfterSeconds) },
    );
  }

  if (Math.random() < 0.01) {
    await db
      .prepare("DELETE FROM rate_limit_windows WHERE expires_at < ?")
      .bind(now)
      .run();
  }
  return {
    remaining: Math.max(0, options.limit - count),
    retryAfterSeconds,
  };
}

export async function persistSubmission(options: {
  input: SubmissionInput;
  idempotencyKey: string;
  requestHash: string;
  ipHash: string;
  userAgentHash: string | null;
  emailHash: string;
  submittedByAccountId: string | null;
  submittedByEmail: string | null;
  now?: number;
  database?: D1Database;
}): Promise<{ record: SubmissionRecord; replayed: boolean }> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const outboxId = await deterministicNotificationDeliveryId(
    "submission.received",
    options.input.kind,
    options.idempotencyKey,
    options.requestHash,
  );
  const submissionPayload = await sealedNotificationPayload({
    kind: options.input.kind,
    submissionId: id,
  });
  const expiresAt = now + 730 * 24 * 60 * 60 * 1000;
  const metadataJson = JSON.stringify({
    utmSource: options.input.utmSource,
    utmMedium: options.input.utmMedium,
    utmCampaign: options.input.utmCampaign,
  });

  // Remove an expired row before attempting the unique idempotency insert.
  // This keeps a reused key from producing a one-request persistence failure.
  await cleanupExpiredData(db, now);

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO submissions
          (id, kind, status, name, email, email_hash, company, team_type,
           message, source_path, metadata_json, consent_version, consented_at,
           submitted_by_account_id, submitted_by_email, idempotency_key,
           request_hash, ip_hash, user_agent_hash, created_at, updated_at,
           expires_at)
         VALUES (?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, '2026-07-17',
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        options.input.kind,
        options.input.name,
        options.input.email,
        options.emailHash,
        options.input.company,
        options.input.team,
        options.input.message,
        options.input.sourcePath,
        metadataJson,
        now,
        options.submittedByAccountId,
        options.submittedByEmail,
        options.idempotencyKey,
        options.requestHash,
        options.ipHash,
        options.userAgentHash,
        now,
        now,
        expiresAt,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO submission_events
          (id, submission_id, event_type, actor_email, detail_json, created_at)
         SELECT ?, ?, 'received', ?, '{}', ?
         WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
      )
      .bind(eventId, id, options.submittedByEmail, now, id),
    db
      .prepare(
        `INSERT OR IGNORE INTO notification_outbox
          (id, delivery_id, topic, entity_id, state, attempts,
           template_version, payload_json, payload_hash, available_at,
           last_error, created_at, updated_at)
         SELECT ?, ?, 'submission.received', ?, 'pending', 0,
                'submission-received-operator-v1', ?, ?, ?, NULL, ?, ?
         WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
      )
      .bind(
        outboxId,
        outboxId,
        id,
        submissionPayload.json,
        submissionPayload.hash,
        now,
        now,
        now,
        id,
      ),
  ]);

  const record = await findSubmissionByIdempotency(
    options.input.kind,
    options.idempotencyKey,
    db,
  );
  if (!record) {
    throw new HttpProblem(
      503,
      "submission_persistence_failed",
      "The request could not be stored.",
    );
  }
  if (record.requestHash !== options.requestHash) {
    throw new HttpProblem(
      409,
      "idempotency_conflict",
      "This Idempotency-Key was already used for a different request.",
    );
  }
  return { record, replayed: record.id !== id };
}

export async function persistNewsletterSubscription(options: {
  input: NewsletterInput;
  emailHash: string;
  confirmationTokenId: string;
  confirmationTokenHash: string;
  confirmationToken: string;
  unsubscribeTokenHash: string;
  unsubscribeToken: string;
  now?: number;
  database?: D1Database;
}): Promise<{ id: string; state: "pending" | "subscribed" | "unsubscribed" }> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const confirmationExpiresAt = now + 72 * 60 * 60 * 1000;
  const id = crypto.randomUUID();
  const outboxId = await deterministicNotificationDeliveryId(
    "newsletter.confirmation.requested",
    options.confirmationTokenId,
  );

  await db.batch([
    db
      .prepare(
        `INSERT INTO newsletter_subscriptions
          (id, email, email_hash, name, state, source_path, consent_version,
           consented_at, confirmation_token_id, confirmation_token_hash,
           confirmation_requested_at, confirmation_expires_at, confirmed_at,
           unsubscribe_token_hash, created_at, updated_at, unsubscribed_at)
         VALUES (?, ?, ?, ?, 'pending', ?, '2026-08-13', ?, ?, ?, ?, ?, NULL,
                 ?, ?, ?, NULL)
         ON CONFLICT(email) DO UPDATE SET
           name = COALESCE(excluded.name, newsletter_subscriptions.name),
           state = 'pending',
           source_path = excluded.source_path,
           consent_version = excluded.consent_version,
           consented_at = excluded.consented_at,
           confirmation_token_id = excluded.confirmation_token_id,
           confirmation_token_hash = excluded.confirmation_token_hash,
           confirmation_requested_at = excluded.confirmation_requested_at,
           confirmation_expires_at = excluded.confirmation_expires_at,
           confirmed_at = NULL,
           unsubscribe_token_hash = excluded.unsubscribe_token_hash,
           updated_at = excluded.updated_at,
           unsubscribed_at = NULL
         WHERE newsletter_subscriptions.state = 'unsubscribed'
            OR (newsletter_subscriptions.state = 'pending'
              AND (newsletter_subscriptions.confirmation_expires_at IS NULL
                OR newsletter_subscriptions.confirmation_expires_at
                  < excluded.confirmation_requested_at))`,
      )
      .bind(
        id,
        options.input.email,
        options.emailHash,
        options.input.name,
        options.input.sourcePath,
        now,
        options.confirmationTokenId,
        options.confirmationTokenHash,
        now,
        confirmationExpiresAt,
        options.unsubscribeTokenHash,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           last_error, created_at, updated_at)
         SELECT ?, 'newsletter.confirmation.requested', ?, 'pending', 0,
                json_object(
                  'confirmationPath', ?,
                  'confirmationToken', ?,
                  'emailHash', email_hash,
                  'subscriptionId', id,
                  'unsubscribePath', ?,
                  'unsubscribeToken', ?
                ),
                ?, NULL, ?, ?
         FROM newsletter_subscriptions
         WHERE email = ? AND confirmation_token_id = ?`,
      )
      .bind(
        outboxId,
        options.confirmationTokenId,
        `/community/newsletter/confirm?token=${encodeURIComponent(options.confirmationToken)}`,
        options.confirmationToken,
        `/community/newsletter/unsubscribe?token=${encodeURIComponent(options.unsubscribeToken)}`,
        options.unsubscribeToken,
        now,
        now,
        now,
        options.input.email,
        options.confirmationTokenId,
      ),
  ]);

  const row = await db
    .prepare(
      `SELECT id, state
       FROM newsletter_subscriptions
       WHERE email = ?
       LIMIT 1`,
    )
    .bind(options.input.email)
    .first<{ id: string; state: "pending" | "subscribed" | "unsubscribed" }>();
  if (!row) {
    throw new HttpProblem(
      503,
      "subscription_persistence_failed",
      "The subscription could not be stored.",
    );
  }
  return row;
}

export type NewsletterConfirmationResult =
  | "subscribed"
  | "expired"
  | "invalid";

export async function confirmNewsletterSubscription(options: {
  confirmationTokenId: string;
  confirmationTokenHash: string;
  now?: number;
  database?: D1Database;
}): Promise<NewsletterConfirmationResult> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const row = await db
    .prepare(
      `SELECT id, state,
              confirmation_token_hash AS confirmationTokenHash,
              confirmation_expires_at AS confirmationExpiresAt,
              confirmed_at AS confirmedAt
       FROM newsletter_subscriptions
       WHERE confirmation_token_id = ?
       LIMIT 1`,
    )
    .bind(options.confirmationTokenId)
    .first<{
      id: string;
      state: "pending" | "subscribed" | "unsubscribed";
      confirmationTokenHash: string | null;
      confirmationExpiresAt: number | null;
      confirmedAt: number | null;
    }>();
  const expectedHash = row?.confirmationTokenHash ?? "0".repeat(64);
  const tokenMatches = constantTimeStringEqual(
    expectedHash,
    options.confirmationTokenHash,
  );
  if (!row || !tokenMatches) return "invalid";
  if (row.state === "subscribed" && row.confirmedAt !== null) {
    return "subscribed";
  }
  if (row.state !== "pending" || row.confirmationExpiresAt === null) {
    return "invalid";
  }
  if (row.confirmationExpiresAt < now) return "expired";

  const results = await db.batch([
    db
      .prepare(
        `UPDATE newsletter_subscriptions
         SET state = 'subscribed', confirmed_at = ?, updated_at = ?
         WHERE id = ?
           AND state = 'pending'
           AND confirmation_token_id = ?
           AND confirmation_expires_at >= ?`,
      )
      .bind(now, now, row.id, options.confirmationTokenId, now),
    db
      .prepare(
        `SELECT state, confirmation_token_id AS confirmationTokenId,
                confirmation_expires_at AS confirmationExpiresAt,
                confirmed_at AS confirmedAt
         FROM newsletter_subscriptions
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(row.id),
  ]);
  const current = results[1]?.results?.[0] as
    | {
        state?: unknown;
        confirmationTokenId?: unknown;
        confirmationExpiresAt?: unknown;
        confirmedAt?: unknown;
      }
    | undefined;
  if (
    current?.state === "subscribed" &&
    current.confirmationTokenId === options.confirmationTokenId &&
    typeof current.confirmedAt === "number"
  ) {
    return "subscribed";
  }
  if (
    current?.state === "pending" &&
    typeof current.confirmationExpiresAt === "number" &&
    current.confirmationExpiresAt < now
  ) {
    return "expired";
  }
  return "invalid";
}

export async function unsubscribeNewsletter(
  unsubscribeTokenHash: string,
  now = Date.now(),
  providedDatabase?: D1Database,
): Promise<boolean> {
  const db = providedDatabase ?? (await getDatabase());
  const outboxId = await deterministicNotificationDeliveryId(
    "newsletter.unsubscribe.requested",
    unsubscribeTokenHash,
  );
  const results = await db.batch([
    db
      .prepare(
        `UPDATE newsletter_subscriptions
         SET state = 'unsubscribed', unsubscribed_at = ?, updated_at = ?
         WHERE unsubscribe_token_hash = ?`,
      )
      .bind(now, now, unsubscribeTokenHash),
    db
      .prepare(
        `INSERT OR IGNORE INTO notification_outbox
          (id, topic, entity_id, state, attempts, payload_json, available_at,
           last_error, created_at, updated_at)
         SELECT
           ?, 'newsletter.unsubscribe.requested', id, 'pending', 0, '{}',
           ?, NULL, ?, ?
         FROM newsletter_subscriptions
         WHERE unsubscribe_token_hash = ?
           AND state = 'unsubscribed'
           AND updated_at = ?`,
      )
      .bind(
        outboxId,
        now,
        now,
        now,
        unsubscribeTokenHash,
        now,
      ),
    db
      .prepare(
        `SELECT id
         FROM newsletter_subscriptions
         WHERE unsubscribe_token_hash = ?
           AND state = 'unsubscribed'
           AND updated_at = ?
         LIMIT 1`,
      )
      .bind(unsubscribeTokenHash, now),
  ]);
  return Boolean(results[2]?.results?.length);
}

export async function listSubmissionsForEmail(
  email: string,
): Promise<SubmissionSummary[]> {
  const db = await getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const result = await db
    .prepare(
      `SELECT id, kind, status, name, email, company,
              team_type AS teamType, message, source_path AS sourcePath,
              created_at AS createdAt, updated_at AS updatedAt
       FROM submissions
       WHERE submitted_by_email = ? AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .bind(normalizedEmail, now)
    .all<SubmissionSummary>();
  return result.results ?? [];
}

export async function listSubmissionsForAccount(
  accountId: string,
  providedDatabase?: D1Database,
): Promise<SubmissionSummary[]> {
  const db = providedDatabase ?? (await getDatabase());
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) return [];
  const now = Date.now();
  const result = await db
    .prepare(
      `SELECT id, kind, status, name, email, company,
              team_type AS teamType, message, source_path AS sourcePath,
              created_at AS createdAt, updated_at AS updatedAt
       FROM submissions
       WHERE submitted_by_account_id = ? AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .bind(normalizedAccountId, now)
    .all<SubmissionSummary>();
  return result.results ?? [];
}

export async function listAdminSubmissions(
  limit = 100,
): Promise<SubmissionSummary[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const db = await getDatabase();
  const now = Date.now();
  const result = await db
    .prepare(
      `SELECT id, kind, status, name, email, company,
              team_type AS teamType, message, source_path AS sourcePath,
              created_at AS createdAt, updated_at AS updatedAt
       FROM submissions
       WHERE expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(now, safeLimit)
    .all<SubmissionSummary>();
  return result.results ?? [];
}

export async function updateSubmissionStatus(options: {
  id: string;
  status: SubmissionRecord["status"];
  actorEmail: string;
}): Promise<SubmissionSummary | null> {
  const db = await getDatabase();
  const now = Date.now();
  const before = await db
    .prepare(
      "SELECT status FROM submissions WHERE id = ? AND expires_at > ? LIMIT 1",
    )
    .bind(options.id, now)
    .first<{ status: string }>();
  if (!before) return null;
  const auditId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?",
      )
      .bind(options.status, now, options.id),
    db
      .prepare(
        `INSERT INTO submission_events
          (id, submission_id, event_type, actor_email, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        options.id,
        `status.${options.status}`,
        options.actorEmail,
        JSON.stringify({ from: before.status, to: options.status }),
        now,
      ),
    db
      .prepare(
        `INSERT INTO admin_audit_events
          (id, actor_email, action, entity_type, entity_id, before_json,
           after_json, created_at)
         VALUES (?, ?, 'submission.status.update', 'submission', ?, ?, ?, ?)`,
      )
      .bind(
        auditId,
        options.actorEmail,
        options.id,
        JSON.stringify(before),
        JSON.stringify({ status: options.status }),
        now,
      ),
  ]);
  return db
    .prepare(
      `SELECT id, kind, status, name, email, company,
              team_type AS teamType, message, source_path AS sourcePath,
              created_at AS createdAt, updated_at AS updatedAt
       FROM submissions WHERE id = ? AND expires_at > ? LIMIT 1`,
    )
    .bind(options.id, now)
    .first<SubmissionSummary>();
}

export async function updateStatusService(options: {
  slug: string;
  state: PublicStatusService["state"];
  description?: string;
  actorEmail: string;
}): Promise<PublicStatusService | null> {
  const db = await getDatabase();
  const before = await db
    .prepare(
      `SELECT slug, name, description, state, updated_at AS updatedAt
       FROM status_services WHERE slug = ? LIMIT 1`,
  )
    .bind(options.slug)
    .first<PublicStatusService>();
  if (!before) return null;
  const now = Date.now();
  const description = options.description ?? before.description;
  await db.batch([
    db
      .prepare(
        `UPDATE status_services
         SET state = ?, description = ?, updated_at = ?
         WHERE slug = ?`,
      )
      .bind(options.state, description, now, options.slug),
    db
      .prepare(
        `INSERT INTO admin_audit_events
          (id, actor_email, action, entity_type, entity_id, before_json,
           after_json, created_at)
         VALUES (?, ?, 'status.service.update', 'status_service', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorEmail,
        options.slug,
        JSON.stringify(before),
        JSON.stringify({ state: options.state, description }),
        now,
      ),
  ]);
  return db
    .prepare(
      `SELECT slug, name, description, state, updated_at AS updatedAt
       FROM status_services WHERE slug = ? LIMIT 1`,
    )
    .bind(options.slug)
    .first<PublicStatusService>();
}

export async function updateChainStage(options: {
  slug: string;
  stage: PublicChain["stage"];
  actorEmail: string;
}): Promise<PublicChain | null> {
  const db = await getDatabase();
  const before = await db
    .prepare(
      `SELECT slug, name, family, finality_model AS finality,
              support_stage AS stage, capabilities_json AS capabilitiesJson,
              tone, verified_at AS verifiedAt, updated_at AS updatedAt
       FROM chains WHERE slug = ? LIMIT 1`,
    )
    .bind(options.slug)
    .first<Omit<PublicChain, "capabilities"> & { capabilitiesJson: string }>();
  if (!before) return null;
  const capabilities = parseStringArray(before.capabilitiesJson);
  if (
    (options.stage === "full" || options.stage === "data_only") &&
    capabilities.length === 0
  ) {
    throw new HttpProblem(
      409,
      "chain_capabilities_unverified",
      "Publish verified capabilities before promoting this chain.",
    );
  }
  const now = Date.now();
  const verifiedAt =
    options.stage === "planned" || options.stage === "preview" ? null : now;
  await db.batch([
    db
      .prepare(
        `UPDATE chains
         SET support_stage = ?, verified_at = ?, updated_at = ?
         WHERE slug = ?`,
      )
      .bind(options.stage, verifiedAt, now, options.slug),
    db
      .prepare(
        `INSERT INTO admin_audit_events
          (id, actor_email, action, entity_type, entity_id, before_json,
           after_json, created_at)
         VALUES (?, ?, 'chain.stage.update', 'chain', ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        options.actorEmail,
        options.slug,
        JSON.stringify(before),
        JSON.stringify({ stage: options.stage, verifiedAt }),
        now,
      ),
  ]);
  const row = await db
    .prepare(
      `SELECT slug, name, family, finality_model AS finality,
              support_stage AS stage, capabilities_json AS capabilitiesJson,
              tone, verified_at AS verifiedAt, updated_at AS updatedAt
       FROM chains WHERE slug = ? LIMIT 1`,
    )
    .bind(options.slug)
    .first<Omit<PublicChain, "capabilities"> & { capabilitiesJson: string }>();
  if (!row) return null;
  const { capabilitiesJson, ...chain } = row;
  return { ...chain, capabilities: parseStringArray(capabilitiesJson) };
}
