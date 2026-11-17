import type {
  NewsletterInput,
  SubmissionInput,
  SubmissionKind,
} from "./contracts.ts";
import { HttpProblem } from "./http.ts";
import {
  allowsLocalUnverifiedEmailAuthentication,
  allValuesAreDistinct,
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
import type {
  DeveloperApiKeyMetadata,
  DeveloperApiKeyRecord,
  DeveloperApiKeyScope,
  DeveloperActor,
  DeveloperServiceInput,
  DeveloperServiceRecord,
  DeveloperServiceUpdateInput,
  DeveloperWorkspaceMemberRecord,
  DeveloperWorkspaceMemberRole,
  DeveloperWorkspaceRecord,
} from "./developer-platform.ts";
import {
  apiKeyAuthenticationProblem,
  chainLaunchStackIdentity,
  constantTimeStringEqual,
  createDeveloperWorkspaceSlug,
  developerApiKeyScopes,
  isDeveloperResourceId,
} from "./developer-platform.ts";
import {
  ETHEREUM_RPC_MAX_BATCH_SIZE,
  ETHEREUM_RPC_MAX_REQUEST_BYTES,
  type EthereumRpcProvisioningSnapshot,
  rpcNetworks,
  rpcNetworkLabel,
  rpcMethodIsPlatformAllowed,
  type RpcNetwork,
  type RpcProvisioningSnapshot,
} from "./ethereum-rpc.ts";
import type { GrpcProvisioningSnapshot } from "./grpc.ts";
import {
  validateRpcAccessPolicy,
  type RpcAccessPolicy,
  type RpcAccessPolicyNetwork,
  type RpcAccessPolicyRecord,
} from "./rpc-access-policy.ts";
import {
  developerAuditUnavailableProblem,
  encodeDeveloperAuditCursor,
  sanitizeDeveloperAuditDetail,
  type DeveloperAuditCursor,
  type DeveloperAuditEventRecord,
  type DeveloperAuditPage,
} from "./developer-audit.ts";
import {
  developerRpcUsageWindowDefinition,
  emptyDeveloperRpcUsageMetrics,
  type DeveloperRpcUsageApiKey,
  type DeveloperRpcUsageMetrics,
  type DeveloperRpcUsageReport,
  type DeveloperRpcUsageSeriesPoint,
  type DeveloperRpcUsageWindow,
} from "./rpc-usage.ts";
import {
  RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
  RPC_GUARDRAIL_MIN_WARNING_PERCENT,
  validateRpcServiceGuardrailUpdate,
  type RpcServiceGuardrailInput,
  type RpcServiceGuardrailRecord,
} from "./rpc-guardrail.ts";

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

const DEVELOPER_MUTATION_IDEMPOTENCY_TTL_MS =
  24 * 60 * 60 * 1000;

type DeveloperMutationOperation =
  | "service.create"
  | "api_key.create"
  | "api_key.rotate";

type DeveloperMutationIdempotencyRecord = {
  requestHash: string;
  resourceId: string;
  expiresAt: number;
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
           SELECT id, slug, name, status, created_at, updated_at
           FROM developer_workspaces LIMIT 1
         ) AS developerWorkspacesAccessible,
         EXISTS(
           SELECT id, workspace_id, account_id, email, role, created_at,
                  updated_at
           FROM developer_workspace_members LIMIT 1
         ) AS developerMembersAccessible,
         EXISTS(
           SELECT id, workspace_id, service_id, name, prefix, last_four,
                  scopes_json, secret_hash, created_by_account_id, created_by_email,
                  created_at, last_used_at, expires_at, revoked_at
           FROM developer_api_keys LIMIT 1
         ) AS developerApiKeysAccessible,
         EXISTS(
           SELECT id, workspace_id, actor_account_id, actor_email, api_key_id,
                  action, entity_type, entity_id, detail_json, created_at
           FROM developer_audit_events LIMIT 1
         ) AS developerAuditAccessible,
         EXISTS(
           SELECT id, workspace_id, product, name, environment, network,
                  region, status, endpoint_path, configuration_json,
                  created_by_account_id, created_at, updated_at,
                  last_mutation_id, archived_at
           FROM developer_services LIMIT 1
         ) AS developerServicesAccessible,
         EXISTS(
           SELECT service_id, workspace_id, allowed_origins_json,
                  allowed_ip_cidrs_json, allowed_methods_json, revision,
                  update_id, updated_by_account_id, updated_by_email,
                  created_at, updated_at
           FROM developer_rpc_access_policies LIMIT 1
         ) AS developerRpcAccessPoliciesAccessible,
         EXISTS(
           SELECT service_id, workspace_id, hourly_quota_limit,
                  warning_threshold_percent, revision, update_id,
                  created_at, updated_at
           FROM developer_rpc_service_guardrails LIMIT 1
         ) AS developerRpcServiceGuardrailsAccessible,
         EXISTS(
           SELECT id, workspace_id, operation, idempotency_hash,
                  request_hash, resource_id, created_at, expires_at
           FROM developer_mutation_idempotency LIMIT 1
         ) AS developerMutationIdempotencyAccessible,
         EXISTS(
           SELECT id, workspace_id, service_id, api_key_id, bucket_start,
                  quota_units, quota_limit, request_count, rpc_call_count,
                  error_count, upstream_failure_count, latency_ms_total,
                  bytes_in, bytes_out, last_request_at, updated_at, expires_at
           FROM ethereum_rpc_usage_buckets LIMIT 1
         ) AS ethereumRpcUsageAccessible,
         EXISTS(
           SELECT id, workspace_id, bucket_start, quota_units, quota_limit,
                  updated_at, expires_at
           FROM ethereum_rpc_workspace_quota_buckets LIMIT 1
         ) AS ethereumRpcWorkspaceQuotaAccessible,
         EXISTS(
           SELECT id, workspace_id, service_id, bucket_start, quota_units,
                  quota_limit, updated_at, expires_at
           FROM ethereum_rpc_service_quota_buckets LIMIT 1
         ) AS ethereumRpcServiceQuotaAccessible,
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
      developerWorkspacesAccessible: number;
      developerMembersAccessible: number;
      developerApiKeysAccessible: number;
      developerAuditAccessible: number;
      developerServicesAccessible: number;
      developerRpcAccessPoliciesAccessible: number;
      developerRpcServiceGuardrailsAccessible: number;
      developerMutationIdempotencyAccessible: number;
      ethereumRpcUsageAccessible: number;
      ethereumRpcWorkspaceQuotaAccessible: number;
      ethereumRpcServiceQuotaAccessible: number;
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
        row.developerWorkspacesAccessible,
        row.developerMembersAccessible,
        row.developerApiKeysAccessible,
        row.developerAuditAccessible,
        row.developerServicesAccessible,
        row.developerRpcAccessPoliciesAccessible,
        row.developerRpcServiceGuardrailsAccessible,
        row.developerMutationIdempotencyAccessible,
        row.ethereumRpcUsageAccessible,
        row.ethereumRpcWorkspaceQuotaAccessible,
        row.ethereumRpcServiceQuotaAccessible,
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
      apiKeyPepper,
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
        apiKeyPepper &&
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
    apiKeyPepper,
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
    siteEnvironmentValue("API_KEY_PEPPER"),
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
  const normalizedApiKeyPepper = normalizedRuntimeSecret(
    typeof apiKeyPepper === "string" ? apiKeyPepper : undefined,
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
  return Boolean(
    normalizedRateLimitSecret &&
      normalizedApiKeyPepper &&
      normalizedBetterAuthSecret &&
      normalizedReviewCapabilitySecret &&
      allValuesAreDistinct([
        normalizedRateLimitSecret,
        normalizedApiKeyPepper,
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
      Boolean(deliverablesBucket) &&
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

export async function findDeveloperWorkspaceForEmail(
  email: string,
  providedDatabase?: D1Database,
): Promise<DeveloperWorkspaceRecord | null> {
  return findDeveloperWorkspaceForIdentity(
    { accountId: null, email },
    providedDatabase,
  );
}

export async function findDeveloperWorkspaceForIdentity(
  actor: DeveloperActor,
  providedDatabase?: D1Database,
): Promise<DeveloperWorkspaceRecord | null> {
  const db = providedDatabase ?? (await getDatabase());
  const identity = normalizeDeveloperActor(actor);
  return (
    (await db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.status, m.role,
                w.created_at AS createdAt, w.updated_at AS updatedAt
         FROM developer_workspace_members m
         JOIN developer_workspaces w ON w.id = m.workspace_id
         WHERE (
           (? IS NOT NULL AND m.account_id = ?)
           OR (? IS NOT NULL AND m.email = ?)
         )
         ORDER BY CASE m.role
           WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
           w.created_at ASC
         LIMIT 1`,
      )
      .bind(
        identity.accountId,
        identity.accountId,
        identity.email,
        identity.email,
      )
      .first<DeveloperWorkspaceRecord>()) ?? null
  );
}

export async function createDeveloperWorkspace(options: {
  name: string;
  actorAccountId?: string | null;
  actorEmail: string | null;
  now?: number;
  database?: D1Database;
}): Promise<{ workspace: DeveloperWorkspaceRecord; created: boolean }> {
  const db = options.database ?? (await getDatabase());
  const actor = normalizeDeveloperActor({
    accountId: options.actorAccountId ?? null,
    email: options.actorEmail,
  });
  const existing = await findOwnedDeveloperWorkspace(actor, db);
  if (existing) return { workspace: existing, created: false };

  const now = options.now ?? Date.now();
  const workspaceId = crypto.randomUUID();
  const workspaceSlug = createDeveloperWorkspaceSlug(
    options.name,
    workspaceId,
  );
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO developer_workspaces
            (id, slug, name, status, created_at, updated_at)
           VALUES (?, ?, ?, 'active', ?, ?)`,
        )
        .bind(workspaceId, workspaceSlug, options.name, now, now),
      db
        .prepare(
          `INSERT INTO developer_workspace_members
            (id, workspace_id, account_id, email, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          workspaceId,
          actor.accountId,
          actor.email,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO developer_audit_events
            (id, workspace_id, actor_account_id, actor_email, api_key_id,
             action, entity_type, entity_id, detail_json, created_at)
           VALUES (?, ?, ?, ?, NULL, 'workspace.created', 'workspace', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          workspaceId,
          actor.accountId,
          actor.email,
          workspaceId,
          JSON.stringify({ role: "owner" }),
          now,
        ),
    ]);
  } catch (error) {
    const concurrentWorkspace = await findOwnedDeveloperWorkspace(actor, db);
    if (concurrentWorkspace) {
      return { workspace: concurrentWorkspace, created: false };
    }
    throw error;
  }

  const workspace = await findDeveloperWorkspaceByIdForIdentity(
    workspaceId,
    actor,
    db,
  );
  if (!workspace) {
    throw new HttpProblem(
      503,
      "workspace_persistence_failed",
      "The developer workspace could not be stored.",
    );
  }
  return { workspace, created: true };
}

export async function listDeveloperWorkspaceMembers(
  actor: DeveloperActor,
  providedDatabase?: D1Database,
): Promise<DeveloperWorkspaceMemberRecord[]> {
  const db = providedDatabase ?? (await getDatabase());
  const workspace = await requireActiveDeveloperWorkspace(
    normalizeDeveloperActor(actor),
    db,
    ["owner", "admin", "developer"],
  );
  const result = await db
    .prepare(
      `SELECT m.id, m.workspace_id AS workspaceId,
              COALESCE(m.account_id, u.id) AS accountId,
              m.email, m.role,
              CASE
                WHEN m.role = 'owner'
                  OR m.account_id IS NOT NULL
                  OR u.id IS NOT NULL
                THEN 'active'
                ELSE 'pending'
              END AS state,
              m.created_at AS createdAt, m.updated_at AS updatedAt
       FROM developer_workspace_members m
       LEFT JOIN auth_users u ON u.email = m.email
       WHERE m.workspace_id = ?
       ORDER BY CASE m.role
         WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
         m.created_at ASC
       LIMIT 100`,
    )
    .bind(workspace.id)
    .all<DeveloperWorkspaceMemberRecord>();
  return result.results ?? [];
}

export async function inviteDeveloperWorkspaceMember(options: {
  actor: DeveloperActor;
  email: string;
  role: DeveloperWorkspaceMemberRole;
  now?: number;
  database?: D1Database;
}): Promise<{
  member: DeveloperWorkspaceMemberRecord;
  created: boolean;
}> {
  const db = options.database ?? (await getDatabase());
  const actor = normalizeDeveloperActor(options.actor);
  const workspace = await requireActiveDeveloperWorkspace(
    actor,
    db,
    ["owner", "admin"],
  );
  const email = options.email.trim().toLowerCase();
  if (!isOperationalEmailAddress(email)) {
    throw new HttpProblem(
      422,
      "workspace_member_email_invalid",
      "Enter a valid team member email address.",
      { email: "Use a deliverable email address." },
    );
  }
  if (options.role !== "admin" && options.role !== "developer") {
    throw workspaceMemberRoleProblem();
  }
  if (workspace.role === "admin" && options.role !== "developer") {
    throw new HttpProblem(
      403,
      "workspace_member_role_denied",
      "Administrators can add developer members only.",
    );
  }
  if (actor.email === email) {
    throw new HttpProblem(
      409,
      "workspace_member_self_invite",
      "This identity already belongs to the workspace.",
    );
  }

  const authUser = await db
    .prepare(
      `SELECT id
       FROM auth_users
       WHERE email = ?
       LIMIT 1`,
    )
    .bind(email)
    .first<{ id: string }>();
  const existing = await findDeveloperWorkspaceMemberByIdentity(
    workspace.id,
    authUser?.id ?? null,
    email,
    db,
  );
  if (existing) {
    if (existing.role !== options.role) {
      throw new HttpProblem(
        409,
        "workspace_member_exists",
        "This team member already has a different workspace role.",
        {
          role:
            "Update the existing member instead of creating another invitation.",
        },
      );
    }
    return { member: existing, created: false };
  }

  const id = crypto.randomUUID();
  const now = options.now ?? Date.now();
  const state = authUser ? "active" : "pending";
  await db.batch([
    db
      .prepare(
        `INSERT INTO developer_workspace_members
          (id, workspace_id, account_id, email, role, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE (
           SELECT COUNT(*)
           FROM developer_workspace_members
           WHERE workspace_id = ?
         ) < 50
           AND NOT EXISTS (
             SELECT 1
             FROM developer_workspace_members
             WHERE workspace_id = ?
               AND (
                 email = ?
                 OR (? IS NOT NULL AND account_id = ?)
               )
           )`,
      )
      .bind(
        id,
        workspace.id,
        authUser?.id ?? null,
        email,
        options.role,
        now,
        now,
        workspace.id,
        workspace.id,
        email,
        authUser?.id ?? null,
        authUser?.id ?? null,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, NULL, 'workspace_member.invited',
                'workspace_member', ?, ?, ?
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members
           WHERE id = ? AND workspace_id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        id,
        JSON.stringify({ role: options.role, state }),
        now,
        id,
        workspace.id,
      ),
  ]);
  const member = await findDeveloperWorkspaceMember(
    id,
    workspace.id,
    db,
  );
  if (member) return { member, created: true };

  const concurrent = await findDeveloperWorkspaceMemberByIdentity(
    workspace.id,
    authUser?.id ?? null,
    email,
    db,
  );
  if (concurrent && concurrent.role === options.role) {
    return { member: concurrent, created: false };
  }
  throw new HttpProblem(
    409,
    "workspace_member_limit_reached",
    "Remove a team member before adding another one.",
  );
}

export async function updateDeveloperWorkspaceMemberRole(options: {
  actor: DeveloperActor;
  memberId: string;
  role: DeveloperWorkspaceMemberRole;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperWorkspaceMemberRecord | null> {
  const db = options.database ?? (await getDatabase());
  const actor = normalizeDeveloperActor(options.actor);
  const workspace = await requireActiveDeveloperWorkspace(
    actor,
    db,
    ["owner"],
  );
  if (options.role !== "admin" && options.role !== "developer") {
    throw workspaceMemberRoleProblem();
  }
  const existing = await findDeveloperWorkspaceMember(
    options.memberId,
    workspace.id,
    db,
  );
  if (!existing) return null;
  if (existing.role === "owner") {
    throw new HttpProblem(
      403,
      "workspace_owner_protected",
      "The workspace owner role cannot be changed here.",
    );
  }
  if (memberMatchesActor(existing, actor)) {
    throw new HttpProblem(
      409,
      "workspace_member_self_change",
      "Another workspace owner must change your role.",
    );
  }
  if (existing.role === options.role) return existing;
  const now = options.now ?? Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE developer_workspace_members
         SET role = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND role != 'owner'`,
      )
      .bind(options.role, now, options.memberId, workspace.id),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, NULL, 'workspace_member.role_updated',
                'workspace_member', ?, ?, ?
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members
           WHERE id = ? AND workspace_id = ? AND role = ?
             AND updated_at = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        options.memberId,
        JSON.stringify({
          previousRole: existing.role,
          role: options.role,
        }),
        now,
        options.memberId,
        workspace.id,
        options.role,
        now,
      ),
  ]);
  return findDeveloperWorkspaceMember(
    options.memberId,
    workspace.id,
    db,
  );
}

export async function removeDeveloperWorkspaceMember(options: {
  actor: DeveloperActor;
  memberId: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperWorkspaceMemberRecord | null> {
  const db = options.database ?? (await getDatabase());
  const actor = normalizeDeveloperActor(options.actor);
  const workspace = await requireActiveDeveloperWorkspace(
    actor,
    db,
    ["owner", "admin"],
  );
  const existing = await findDeveloperWorkspaceMember(
    options.memberId,
    workspace.id,
    db,
  );
  if (!existing) return null;
  if (
    existing.role === "owner" ||
    (workspace.role === "admin" && existing.role !== "developer")
  ) {
    throw new HttpProblem(
      403,
      "workspace_member_remove_denied",
      "This workspace role cannot remove that team member.",
    );
  }
  if (memberMatchesActor(existing, actor)) {
    throw new HttpProblem(
      409,
      "workspace_member_self_remove",
      "Another workspace administrator must remove your membership.",
    );
  }
  const now = options.now ?? Date.now();
  const result = await db
    .prepare(
      `DELETE FROM developer_workspace_members
       WHERE id = ? AND workspace_id = ? AND role != 'owner'`,
    )
    .bind(options.memberId, workspace.id)
    .run();
  if (result.meta.changes !== 1) return null;
  await db
    .prepare(
      `INSERT INTO developer_audit_events
        (id, workspace_id, actor_account_id, actor_email, api_key_id,
         action, entity_type, entity_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, NULL, 'workspace_member.removed',
               'workspace_member', ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      workspace.id,
      actor.accountId,
      actor.email,
      options.memberId,
      JSON.stringify({
        previousRole: existing.role,
        previousState: existing.state,
      }),
      now,
    )
    .run();
  return existing;
}

type DeveloperAuditEventRow = {
  id: string;
  actorAccountId: string | null;
  actorEmail: string | null;
  apiKeyId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detailJson: string;
  createdAt: number;
};

export async function listDeveloperAuditEvents(options: {
  actor: DeveloperActor;
  limit: number;
  cursor: DeveloperAuditCursor | null;
  database?: D1Database;
}): Promise<DeveloperAuditPage> {
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 100
  ) {
    throw new TypeError("Developer audit limit must be from 1 through 100.");
  }
  const db = options.database ?? (await getDatabase());
  const workspace = await requireActiveDeveloperWorkspace(
    normalizeDeveloperActor(options.actor),
    db,
    ["owner", "admin"],
  );
  const cursorCreatedAt = options.cursor?.createdAt ?? null;
  const cursorId = options.cursor?.id ?? null;
  const result = await db
    .prepare(
      `SELECT id, actor_account_id AS actorAccountId,
              actor_email AS actorEmail, api_key_id AS apiKeyId,
              action, entity_type AS entityType, entity_id AS entityId,
              detail_json AS detailJson, created_at AS createdAt
       FROM developer_audit_events
       WHERE workspace_id = ?
         AND (
           ? IS NULL
           OR created_at < ?
           OR (created_at = ? AND id < ?)
         )
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(
      workspace.id,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorId,
      options.limit + 1,
    )
    .all<DeveloperAuditEventRow>();

  const rows = result.results ?? [];
  const hasNextPage = rows.length > options.limit;
  const selectedRows = rows.slice(0, options.limit);
  const events = selectedRows.map(toDeveloperAuditEventRecord);
  const lastEvent = events.at(-1);
  return {
    events,
    nextCursor:
      hasNextPage && lastEvent
        ? encodeDeveloperAuditCursor({
            createdAt: lastEvent.createdAt,
            id: lastEvent.id,
          })
        : null,
  };
}

export async function listDeveloperApiKeys(
  actorEmail: string,
  providedDatabase?: D1Database,
): Promise<DeveloperApiKeyMetadata[]> {
  return listDeveloperApiKeysForIdentity(
    { accountId: null, email: actorEmail },
    providedDatabase,
  );
}

export async function listDeveloperApiKeysForIdentity(
  actor: DeveloperActor,
  providedDatabase?: D1Database,
): Promise<DeveloperApiKeyMetadata[]> {
  const db = providedDatabase ?? (await getDatabase());
  const workspace = await requireActiveDeveloperWorkspace(
    normalizeDeveloperActor(actor),
    db,
    ["owner", "admin"],
  );
  return listDeveloperApiKeysInWorkspace(workspace.id, db);
}

export async function listDeveloperApiKeysForApiKey(options: {
  workspaceId: string;
  authorizationApiKeyId: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperApiKeyMetadata[]> {
  const db = options.database ?? (await getDatabase());
  await requireActiveDeveloperServiceManagementKey({
    workspaceId: options.workspaceId,
    apiKeyId: options.authorizationApiKeyId,
    now: options.now,
    database: db,
  });
  return listDeveloperApiKeysInWorkspace(options.workspaceId, db);
}

async function listDeveloperApiKeysInWorkspace(
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperApiKeyMetadata[]> {
  const result = await db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, name, prefix,
              service_id AS serviceId,
              last_four AS lastFour, scopes_json AS scopesJson,
              secret_hash AS secretHash,
              created_by_account_id AS createdByAccountId,
              created_by_email AS createdByEmail,
              created_at AS createdAt, last_used_at AS lastUsedAt,
              expires_at AS expiresAt, revoked_at AS revokedAt
       FROM developer_api_keys
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .bind(workspaceId)
    .all<DeveloperApiKeyRow>();
  return (result.results ?? []).map(toDeveloperApiKeyMetadata);
}

export async function createDeveloperApiKey(options: {
  actorAccountId?: string | null;
  actorEmail?: string | null;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  secretHash: string;
  serviceId?: string | null;
  scopes?: readonly DeveloperApiKeyScope[] | null;
  idempotencyHash?: string;
  requestHash?: string;
  expiresAt: number;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperApiKeyMetadata> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperApiKeyLifecycle({
    actorAccountId: options.actorAccountId,
    actorEmail: options.actorEmail,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    now: options.now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const auditApiKeyId =
    authorization.authorizationApiKeyId ?? options.id;
  const now = options.now ?? Date.now();
  const serviceId = options.serviceId ?? null;
  let service: DeveloperApiKeyService | null = null;
  if (serviceId !== null) {
    if (!isDeveloperResourceId(serviceId)) {
      throw apiKeyServiceProblem();
    }
    service = await findDeveloperApiKeyService(
      serviceId,
      workspace.id,
      db,
    );
    if (!service) throw apiKeyServiceProblem();
  }
  const scopes = resolveDeveloperApiKeyScopes(
    options.scopes ?? null,
    service,
  );
  const scopesJson = JSON.stringify(scopes);
  const mutation = developerMutationIdentity({
    idempotencyHash: options.idempotencyHash,
    requestHash: options.requestHash,
  });
  const idempotencyExpiresAt =
    now + DEVELOPER_MUTATION_IDEMPOTENCY_TTL_MS;

  await db.batch([
    db
      .prepare(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four, scopes_json,
           secret_hash, created_by_account_id, created_by_email, created_at,
           last_used_at, expires_at, revoked_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL
         WHERE (
           SELECT COUNT(*) FROM developer_api_keys
           WHERE workspace_id = ? AND revoked_at IS NULL AND expires_at > ?
         ) < 10
           AND (
             ? IS NULL OR EXISTS (
               SELECT 1 FROM developer_services
               WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
             )
           )
           AND NOT EXISTS (
             SELECT 1
             FROM developer_mutation_idempotency
             WHERE workspace_id = ?
               AND operation = 'api_key.create'
               AND idempotency_hash = ?
               AND expires_at > ?
           )`,
      )
      .bind(
        options.id,
        workspace.id,
        serviceId,
        options.name,
        options.prefix,
        options.lastFour,
        scopesJson,
        options.secretHash,
        actor.accountId,
        actor.email,
        now,
        options.expiresAt,
        workspace.id,
        now,
        serviceId,
        serviceId,
        workspace.id,
        workspace.id,
        mutation.idempotencyHash,
        now,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, ?, 'api_key.created', 'api_key', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM developer_api_keys
           WHERE id = ? AND workspace_id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        auditApiKeyId,
        options.id,
        JSON.stringify({
          prefix: options.prefix,
          lastFour: options.lastFour,
          scopes,
          serviceId,
          expiresAt: options.expiresAt,
        }),
        now,
        options.id,
        workspace.id,
      ),
    db
      .prepare(
        `INSERT INTO developer_mutation_idempotency
          (id, workspace_id, operation, idempotency_hash, request_hash,
           resource_id, created_at, expires_at)
         SELECT ?, ?, 'api_key.create', ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1
           FROM developer_api_keys
           WHERE id = ? AND workspace_id = ?
         )
         ON CONFLICT(workspace_id, operation, idempotency_hash)
         DO UPDATE SET
           id = excluded.id,
           request_hash = excluded.request_hash,
           resource_id = excluded.resource_id,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at
         WHERE developer_mutation_idempotency.expires_at <= ?`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        mutation.idempotencyHash,
        mutation.requestHash,
        options.id,
        now,
        idempotencyExpiresAt,
        options.id,
        workspace.id,
        now,
      ),
  ]);

  const apiKey = await findDeveloperApiKeyMetadata(
    options.id,
    workspace.id,
    db,
  );
  if (apiKey) return apiKey;
  const replay = await findDeveloperMutationIdempotency(
    workspace.id,
    "api_key.create",
    mutation.idempotencyHash,
    now,
    db,
  );
  if (replay) {
    if (replay.requestHash !== mutation.requestHash) {
      throw developerMutationIdempotencyConflict();
    }
    throw apiKeySecretAlreadyIssuedProblem();
  }
  if (
    serviceId !== null &&
    !(await findDeveloperApiKeyService(
      serviceId,
      workspace.id,
      db,
    ))
  ) {
    throw apiKeyServiceProblem();
  }
  throw new HttpProblem(
    409,
    "api_key_limit_reached",
    "Revoke an active API key before creating another one.",
  );
}

export async function rotateDeveloperApiKey(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  sourceId: string;
  id: string;
  name: string | null;
  prefix: string;
  lastFour: string;
  secretHash: string;
  expiresAt: number;
  idempotencyHash: string;
  requestHash: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperApiKeyMetadata | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperApiKeyLifecycle({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    now: options.now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const auditApiKeyId =
    authorization.authorizationApiKeyId ?? options.id;
  const now = options.now ?? Date.now();
  if (
    !isDeveloperResourceId(options.sourceId) ||
    !isDeveloperResourceId(options.id) ||
    options.sourceId === options.id ||
    !/^nzu_live_[0-9a-f]{8}$/.test(options.prefix) ||
    !/^[A-Za-z0-9_-]{4}$/.test(options.lastFour) ||
    !/^[a-f0-9]{64}$/.test(options.secretHash) ||
    !Number.isSafeInteger(options.expiresAt) ||
    options.expiresAt <= now
  ) {
    throw new TypeError("API key rotation material is invalid.");
  }
  const mutation = developerMutationIdentity({
    idempotencyHash: options.idempotencyHash,
    requestHash: options.requestHash,
  });
  const replay = await findDeveloperMutationIdempotency(
    workspace.id,
    "api_key.rotate",
    mutation.idempotencyHash,
    now,
    db,
  );
  if (replay) {
    if (replay.requestHash !== mutation.requestHash) {
      throw developerMutationIdempotencyConflict();
    }
    throw apiKeySecretAlreadyIssuedProblem();
  }

  const source = await findDeveloperApiKeyMetadata(
    options.sourceId,
    workspace.id,
    db,
  );
  if (!source) return null;
  if (source.revokedAt !== null || source.expiresAt <= now) {
    throw apiKeyRotationSourceInactiveProblem();
  }
  if (
    source.scopes.length !== 1 ||
    !developerApiKeyScopes.includes(
      source.scopes[0] as DeveloperApiKeyScope,
    )
  ) {
    throw new HttpProblem(
      503,
      "api_key_state_unavailable",
      "The source API key metadata could not be read safely.",
    );
  }
  if (
    source.serviceId !== null &&
    !(await findDeveloperApiKeyService(
      source.serviceId,
      workspace.id,
      db,
    ))
  ) {
    throw apiKeyRotationSourceInactiveProblem();
  }
  const name = (options.name ?? source.name)
    .trim()
    .replace(/\s+/g, " ");
  if (
    name.length < 2 ||
    name.length > 60 ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new HttpProblem(
      422,
      "api_key_rotation_name_invalid",
      "Choose a valid name for the replacement API key.",
      { name: "Use from 2 through 60 safe characters." },
    );
  }
  const scopes = source.scopes as DeveloperApiKeyScope[];
  const scopesJson = JSON.stringify(scopes);
  const idempotencyExpiresAt =
    now + DEVELOPER_MUTATION_IDEMPOTENCY_TTL_MS;

  await db.batch([
    db
      .prepare(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four, scopes_json,
           secret_hash, created_by_account_id, created_by_email, created_at,
           last_used_at, expires_at, revoked_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL
         WHERE EXISTS (
           SELECT 1 FROM developer_api_keys
           WHERE id = ? AND workspace_id = ?
             AND revoked_at IS NULL AND expires_at > ?
         )
           AND (
             SELECT COUNT(*) FROM developer_api_keys
             WHERE workspace_id = ? AND id != ?
               AND revoked_at IS NULL AND expires_at > ?
           ) < 10
           AND (
             ? IS NULL OR EXISTS (
               SELECT 1 FROM developer_services
               WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
             )
           )
           AND NOT EXISTS (
             SELECT 1
             FROM developer_mutation_idempotency
             WHERE workspace_id = ?
               AND operation = 'api_key.rotate'
               AND idempotency_hash = ?
               AND expires_at > ?
           )`,
      )
      .bind(
        options.id,
        workspace.id,
        source.serviceId,
        name,
        options.prefix,
        options.lastFour,
        scopesJson,
        options.secretHash,
        actor.accountId,
        actor.email,
        now,
        options.expiresAt,
        options.sourceId,
        workspace.id,
        now,
        workspace.id,
        options.sourceId,
        now,
        source.serviceId,
        source.serviceId,
        workspace.id,
        workspace.id,
        mutation.idempotencyHash,
        now,
      ),
    db
      .prepare(
        `UPDATE developer_api_keys
         SET revoked_at = ?
         WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL
           AND EXISTS (
             SELECT 1 FROM developer_api_keys
             WHERE id = ? AND workspace_id = ?
           )`,
      )
      .bind(
        now,
        options.sourceId,
        workspace.id,
        options.id,
        workspace.id,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, ?, 'api_key.rotated', 'api_key', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM developer_api_keys
           WHERE id = ? AND workspace_id = ?
         )
           AND EXISTS (
             SELECT 1 FROM developer_api_keys
             WHERE id = ? AND workspace_id = ? AND revoked_at = ?
           )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        auditApiKeyId,
        options.id,
        JSON.stringify({
          sourceKeyId: options.sourceId,
          prefix: options.prefix,
          lastFour: options.lastFour,
          scopes,
          serviceId: source.serviceId,
          expiresAt: options.expiresAt,
        }),
        now,
        options.id,
        workspace.id,
        options.sourceId,
        workspace.id,
        now,
      ),
    db
      .prepare(
        `INSERT INTO developer_mutation_idempotency
          (id, workspace_id, operation, idempotency_hash, request_hash,
           resource_id, created_at, expires_at)
         SELECT ?, ?, 'api_key.rotate', ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM developer_api_keys
           WHERE id = ? AND workspace_id = ?
         )
           AND EXISTS (
             SELECT 1 FROM developer_api_keys
             WHERE id = ? AND workspace_id = ? AND revoked_at = ?
           )
         ON CONFLICT(workspace_id, operation, idempotency_hash)
         DO UPDATE SET
           id = excluded.id,
           request_hash = excluded.request_hash,
           resource_id = excluded.resource_id,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at
         WHERE developer_mutation_idempotency.expires_at <= ?`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        mutation.idempotencyHash,
        mutation.requestHash,
        options.id,
        now,
        idempotencyExpiresAt,
        options.id,
        workspace.id,
        options.sourceId,
        workspace.id,
        now,
        now,
      ),
  ]);

  const replacement = await findDeveloperApiKeyMetadata(
    options.id,
    workspace.id,
    db,
  );
  const rotatedSource = await findDeveloperApiKeyMetadata(
    options.sourceId,
    workspace.id,
    db,
  );
  if (replacement && rotatedSource?.revokedAt === now) {
    return replacement;
  }
  const concurrentReplay = await findDeveloperMutationIdempotency(
    workspace.id,
    "api_key.rotate",
    mutation.idempotencyHash,
    now,
    db,
  );
  if (concurrentReplay) {
    if (concurrentReplay.requestHash !== mutation.requestHash) {
      throw developerMutationIdempotencyConflict();
    }
    throw apiKeySecretAlreadyIssuedProblem();
  }
  if (
    !rotatedSource ||
    rotatedSource.revokedAt !== null ||
    rotatedSource.expiresAt <= now
  ) {
    throw apiKeyRotationSourceInactiveProblem();
  }
  throw new HttpProblem(
    409,
    "api_key_limit_reached",
    "Revoke an active API key before rotating another one.",
  );
}

export async function revokeDeveloperApiKey(options: {
  actorAccountId?: string | null;
  actorEmail?: string | null;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  id: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperApiKeyMetadata | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperApiKeyLifecycle({
    actorAccountId: options.actorAccountId,
    actorEmail: options.actorEmail,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    now: options.now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const auditApiKeyId =
    authorization.authorizationApiKeyId ?? options.id;
  const existing = await findDeveloperApiKeyMetadata(
    options.id,
    workspace.id,
    db,
  );
  if (!existing) return null;
  if (existing.revokedAt !== null) return existing;

  const now = options.now ?? Date.now();
  await db.batch([
    db
      .prepare(
        `UPDATE developer_api_keys
         SET revoked_at = ?
         WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, options.id, workspace.id),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, ?, 'api_key.revoked', 'api_key', ?, '{}', ?
         WHERE EXISTS (
           SELECT 1 FROM developer_api_keys
           WHERE id = ? AND workspace_id = ? AND revoked_at = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        auditApiKeyId,
        options.id,
        now,
        options.id,
        workspace.id,
        now,
      ),
  ]);
  return findDeveloperApiKeyMetadata(options.id, workspace.id, db);
}

export async function listDeveloperServices(
  actor: DeveloperActor,
  providedDatabase?: D1Database,
): Promise<DeveloperServiceRecord[]> {
  const db = providedDatabase ?? (await getDatabase());
  const workspace = await requireActiveDeveloperWorkspace(
    normalizeDeveloperActor(actor),
    db,
    ["owner", "admin", "developer"],
  );
  return listDeveloperServicesInWorkspace(workspace.id, db);
}

export async function listDeveloperServicesForApiKey(options: {
  workspaceId: string;
  apiKeyId: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperServiceRecord[]> {
  const db = options.database ?? (await getDatabase());
  await requireActiveDeveloperServiceManagementKey({
    workspaceId: options.workspaceId,
    apiKeyId: options.apiKeyId,
    now: options.now,
    database: db,
  });
  return listDeveloperServicesInWorkspace(options.workspaceId, db);
}

export async function getDeveloperService(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError(
      "Developer service read time must be a nonnegative integer.",
    );
  }
  const row = await db
    .prepare(
      `WITH selected_service AS (
         SELECT id, workspace_id, product, name, environment, network,
                region, status, endpoint_path, configuration_json,
                created_at, updated_at, archived_at
         FROM developer_services
         WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
         LIMIT 1
       ),
       rpc_telemetry AS (
         SELECT service_id,
                SUM(request_count) AS telemetryRequests,
                SUM(rpc_call_count) AS telemetryCalls,
                SUM(error_count) AS telemetryErrors,
                SUM(upstream_failure_count) AS telemetryUpstreamFailures,
                SUM(latency_ms_total) AS telemetryLatencyMsTotal,
                MIN(bucket_start) AS telemetryWindowStartedAt,
                MAX(updated_at) AS telemetryUpdatedAt
         FROM ethereum_rpc_usage_buckets
         WHERE workspace_id = ? AND service_id = ? AND expires_at > ?
         GROUP BY service_id
       )
       SELECT s.id, s.workspace_id AS workspaceId, s.product, s.name,
              s.environment, s.network, s.region, s.status,
              s.endpoint_path AS endpointPath,
              s.configuration_json AS configurationJson,
              s.created_at AS createdAt, s.updated_at AS updatedAt,
              s.archived_at AS archivedAt,
              COALESCE(t.telemetryRequests, 0) AS telemetryRequests,
              COALESCE(t.telemetryCalls, 0) AS telemetryCalls,
              COALESCE(t.telemetryErrors, 0) AS telemetryErrors,
              COALESCE(t.telemetryUpstreamFailures, 0)
                AS telemetryUpstreamFailures,
              COALESCE(t.telemetryLatencyMsTotal, 0)
                AS telemetryLatencyMsTotal,
              t.telemetryWindowStartedAt,
              t.telemetryUpdatedAt
       FROM selected_service s
       LEFT JOIN rpc_telemetry t ON t.service_id = s.id
       LIMIT 1`,
    )
    .bind(
      options.serviceId,
      authorization.workspaceId,
      authorization.workspaceId,
      options.serviceId,
      now,
    )
    .first<DeveloperServiceRow>();
  return row ? toDeveloperServiceRecord(row) : null;
}

async function listDeveloperServicesInWorkspace(
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperServiceRecord[]> {
  const result = await db
    .prepare(
      `WITH selected_services AS (
         SELECT id, workspace_id, product, name, environment, network,
                region, status, endpoint_path, configuration_json,
                created_at, updated_at, archived_at
         FROM developer_services
         WHERE workspace_id = ? AND archived_at IS NULL
         ORDER BY created_at DESC
         LIMIT 100
       ),
       rpc_telemetry AS (
         SELECT service_id,
                SUM(request_count) AS telemetryRequests,
                SUM(rpc_call_count) AS telemetryCalls,
                SUM(error_count) AS telemetryErrors,
                SUM(upstream_failure_count) AS telemetryUpstreamFailures,
                SUM(latency_ms_total) AS telemetryLatencyMsTotal,
                MIN(bucket_start) AS telemetryWindowStartedAt,
                MAX(updated_at) AS telemetryUpdatedAt
         FROM ethereum_rpc_usage_buckets
         WHERE workspace_id = ? AND expires_at > ?
         GROUP BY service_id
       )
       SELECT s.id, s.workspace_id AS workspaceId, s.product, s.name,
              s.environment, s.network, s.region, s.status,
              s.endpoint_path AS endpointPath,
              s.configuration_json AS configurationJson,
              s.created_at AS createdAt, s.updated_at AS updatedAt,
              s.archived_at AS archivedAt,
              COALESCE(t.telemetryRequests, 0) AS telemetryRequests,
              COALESCE(t.telemetryCalls, 0) AS telemetryCalls,
              COALESCE(t.telemetryErrors, 0) AS telemetryErrors,
              COALESCE(t.telemetryUpstreamFailures, 0)
                AS telemetryUpstreamFailures,
              COALESCE(t.telemetryLatencyMsTotal, 0)
                AS telemetryLatencyMsTotal,
              t.telemetryWindowStartedAt,
              t.telemetryUpdatedAt
       FROM selected_services s
       LEFT JOIN rpc_telemetry t ON t.service_id = s.id
       ORDER BY s.created_at DESC
       LIMIT 100`,
    )
    .bind(workspaceId, workspaceId, Date.now())
    .all<DeveloperServiceRow>();
  return (result.results ?? []).map(toDeveloperServiceRecord);
}

type DeveloperRpcUsageServiceRow = {
  id: string;
  name: string;
  network: string;
};

type DeveloperRpcUsageAggregateRow = {
  intervalStart?: number;
  quotaUnits: number;
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  latencyMsTotal: number;
  bytesIn: number;
  bytesOut: number;
  lastRequestAt: number | null;
};

type DeveloperRpcUsageApiKeyRow = DeveloperRpcUsageAggregateRow & {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  revokedAt: number | null;
};

type DeveloperRpcCurrentServiceQuotaRow = {
  serviceUnits: number;
};

type DeveloperRpcCurrentWorkspaceQuotaRow = {
  workspaceUnits: number;
  workspaceLimit: number;
};

export async function getDeveloperRpcUsage(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  window: DeveloperRpcUsageWindow;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperRpcUsageReport | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  const workspace = { id: authorization.workspaceId };
  const service = await db
    .prepare(
      `SELECT id, name, network
       FROM developer_services
       WHERE id = ? AND workspace_id = ?
         AND product = 'rpc-api'
         AND network IN ('ethereum', 'base', 'solana')
         AND archived_at IS NULL
       LIMIT 1`,
    )
    .bind(options.serviceId, workspace.id)
    .first<DeveloperRpcUsageServiceRow>();
  if (!service) return null;
  if (!rpcNetworks.includes(service.network as RpcNetwork)) {
    throw rpcUsageUnavailableProblem();
  }

  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError("RPC usage time must be a nonnegative integer.");
  }
  const definition = developerRpcUsageWindowDefinition(options.window);
  const endAt =
    Math.floor(now / definition.intervalMs) * definition.intervalMs +
    definition.intervalMs;
  const startAt = endAt - definition.durationMs;
  const currentHourStart =
    Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
  const currentHourResetAt = currentHourStart + 60 * 60 * 1000;

  const [
    seriesResult,
    apiKeyResult,
    currentServiceQuota,
    currentWorkspaceQuota,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT
           bucket_start - (bucket_start % ?) AS intervalStart,
           SUM(quota_units) AS quotaUnits,
           SUM(request_count) AS requests,
           SUM(rpc_call_count) AS calls,
           SUM(error_count) AS errors,
           SUM(upstream_failure_count) AS upstreamFailures,
           SUM(latency_ms_total) AS latencyMsTotal,
           SUM(bytes_in) AS bytesIn,
           SUM(bytes_out) AS bytesOut,
           MAX(last_request_at) AS lastRequestAt
         FROM ethereum_rpc_usage_buckets
         WHERE workspace_id = ? AND service_id = ?
           AND bucket_start >= ? AND bucket_start < ?
           AND expires_at > ?
         GROUP BY intervalStart
         ORDER BY intervalStart ASC`,
      )
      .bind(
        definition.intervalMs,
        workspace.id,
        service.id,
        startAt,
        endAt,
        now,
      )
      .all<DeveloperRpcUsageAggregateRow>(),
    db
      .prepare(
        `SELECT
           k.id, k.name, k.prefix, k.last_four AS lastFour,
           k.revoked_at AS revokedAt,
           SUM(u.quota_units) AS quotaUnits,
           SUM(u.request_count) AS requests,
           SUM(u.rpc_call_count) AS calls,
           SUM(u.error_count) AS errors,
           SUM(u.upstream_failure_count) AS upstreamFailures,
           SUM(u.latency_ms_total) AS latencyMsTotal,
           SUM(u.bytes_in) AS bytesIn,
           SUM(u.bytes_out) AS bytesOut,
           MAX(u.last_request_at) AS lastRequestAt
         FROM ethereum_rpc_usage_buckets u
         INNER JOIN developer_api_keys k
           ON k.id = u.api_key_id
          AND k.workspace_id = u.workspace_id
         WHERE u.workspace_id = ? AND u.service_id = ?
           AND u.bucket_start >= ? AND u.bucket_start < ?
           AND u.expires_at > ?
         GROUP BY k.id, k.name, k.prefix, k.last_four, k.revoked_at
         ORDER BY calls DESC, k.created_at DESC
         LIMIT 100`,
      )
      .bind(workspace.id, service.id, startAt, endAt, now)
      .all<DeveloperRpcUsageApiKeyRow>(),
    db
      .prepare(
        `SELECT COALESCE(SUM(quota_units), 0) AS serviceUnits
         FROM ethereum_rpc_usage_buckets
         WHERE workspace_id = ? AND service_id = ?
           AND bucket_start = ? AND expires_at > ?`,
      )
      .bind(workspace.id, service.id, currentHourStart, now)
      .first<DeveloperRpcCurrentServiceQuotaRow>(),
    db
      .prepare(
        `SELECT quota_units AS workspaceUnits,
                quota_limit AS workspaceLimit
         FROM ethereum_rpc_workspace_quota_buckets
         WHERE workspace_id = ? AND bucket_start = ?
           AND expires_at > ?
         LIMIT 1`,
      )
      .bind(workspace.id, currentHourStart, now)
      .first<DeveloperRpcCurrentWorkspaceQuotaRow>(),
  ]);

  const storedSeries = new Map<number, DeveloperRpcUsageMetrics>();
  for (const row of seriesResult.results ?? []) {
    const intervalStart = safeRpcUsageInteger(
      row.intervalStart,
      "interval start",
    );
    if (
      intervalStart < startAt ||
      intervalStart >= endAt ||
      intervalStart % definition.intervalMs !== 0 ||
      storedSeries.has(intervalStart)
    ) {
      throw rpcUsageUnavailableProblem();
    }
    storedSeries.set(intervalStart, rpcUsageMetricsFromRow(row));
  }

  const series: DeveloperRpcUsageSeriesPoint[] = [];
  let summary = emptyDeveloperRpcUsageMetrics();
  for (
    let pointStart = startAt;
    pointStart < endAt;
    pointStart += definition.intervalMs
  ) {
    const metrics =
      storedSeries.get(pointStart) ?? emptyDeveloperRpcUsageMetrics();
    series.push({ startAt: pointStart, ...metrics });
    summary = addRpcUsageMetrics(summary, metrics);
  }
  if (series.length !== definition.pointCount) {
    throw rpcUsageUnavailableProblem();
  }

  const apiKeys: DeveloperRpcUsageApiKey[] = (
    apiKeyResult.results ?? []
  ).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastFour: row.lastFour,
    revokedAt: nullableRpcUsageTimestamp(row.revokedAt),
    ...rpcUsageMetricsFromRow(row),
  }));

  const serviceUnits = safeRpcUsageInteger(
    currentServiceQuota?.serviceUnits ?? 0,
    "current service quota",
  );
  const workspaceUnits =
    currentWorkspaceQuota === null
      ? 0
      : safeRpcUsageInteger(
          currentWorkspaceQuota.workspaceUnits,
          "current workspace quota",
        );
  const workspaceLimit =
    currentWorkspaceQuota === null
      ? null
      : safeRpcUsageInteger(
          currentWorkspaceQuota.workspaceLimit,
          "workspace quota limit",
        );

  return {
    service: {
      id: service.id,
      name: service.name,
      network: service.network as RpcNetwork,
    },
    window: options.window,
    resolution: definition.resolution,
    generatedAt: now,
    startAt,
    endAt,
    summary,
    currentHourQuota: {
      serviceUnits,
      workspaceUnits,
      workspaceLimit,
      workspaceRemaining:
        workspaceLimit === null
          ? null
          : Math.max(0, workspaceLimit - workspaceUnits),
      resetAt: currentHourResetAt,
    },
    series,
    apiKeys,
  };
}

export async function createDeveloperService(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  input: DeveloperServiceInput;
  rpcProvisioning?:
    | EthereumRpcProvisioningSnapshot
    | RpcProvisioningSnapshot;
  grpcProvisioning?: GrpcProvisioningSnapshot;
  idempotencyHash?: string;
  requestHash?: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperServiceRecord> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const authorizationApiKeyId =
    authorization.authorizationApiKeyId;
  const id = crypto.randomUUID();
  const mutation = developerMutationIdentity({
    idempotencyHash: options.idempotencyHash,
    requestHash: options.requestHash,
  });
  const idempotencyExpiresAt =
    now + DEVELOPER_MUTATION_IDEMPOTENCY_TTL_MS;
  const rpcNetwork =
    options.input.network === "ethereum" ||
    options.input.network === "base" ||
    options.input.network === "solana"
      ? options.input.network
      : null;
  const rpcAvailable =
    options.input.product === "rpc-api" &&
    rpcNetwork !== null &&
    options.rpcProvisioning?.available === true &&
    options.rpcProvisioning.upstreamCount > 0 &&
    (options.rpcProvisioning.network === undefined ||
      options.rpcProvisioning.network === rpcNetwork);
  const ethereumGrpcAvailable =
    options.input.product === "grpc-api" &&
    options.input.network === "ethereum" &&
    options.grpcProvisioning?.available === true &&
    options.grpcProvisioning.endpoint !== null;
  const chainLaunchStack =
    options.input.product === "rollups"
      ? chainLaunchStackIdentity(options.input.network)
      : null;
  if (options.input.product === "rollups" && !chainLaunchStack) {
    throw new TypeError(
      "Chain Launch Cloud requires a supported chain stack.",
    );
  }
  const status =
    options.input.product === "platform-api" ||
    rpcAvailable ||
    ethereumGrpcAvailable
      ? "active"
      : "configuration_saved";
  const endpointPath =
    options.input.product === "platform-api"
      ? "/api/v1/platform/whoami"
      : rpcAvailable
        ? `/api/v1/rpc/${id}`
        : ethereumGrpcAvailable
          ? options.grpcProvisioning?.endpoint ?? null
          : null;
  const configurationJson = JSON.stringify(
    options.input.product === "platform-api"
      ? {
          maturity: "live",
          provisioning: "available",
        }
      : options.input.product === "rpc-api"
        ? {
            maturity: rpcAvailable ? "beta" : "configuration",
            provisioning: rpcAvailable
              ? "available"
              : "awaiting_upstream_configuration",
            protocol:
              rpcNetwork === "solana"
                ? "solana-json-rpc-2.0"
                : "evm-json-rpc-2.0",
            network:
              rpcNetwork === null
                ? null
                : {
                    id: rpcNetwork,
                    name: rpcNetworkLabel(rpcNetwork),
                  },
            authentication: {
              scheme: "bearer",
              requiredScope: "rpc:invoke",
            },
            routing: {
              strategy: "pulse_adaptive_failover",
              safeReads:
                "verified_latency_ewma_with_circuit_breaker",
              writes: "configured_primary_single_attempt",
              configuredUpstreams: rpcAvailable
                ? options.rpcProvisioning?.upstreamCount
                : 0,
            },
            limits: {
              maximumBatchCalls: ETHEREUM_RPC_MAX_BATCH_SIZE,
              maximumRequestBytes: ETHEREUM_RPC_MAX_REQUEST_BYTES,
            },
          }
        : options.input.product === "grpc-api"
          ? {
              maturity: ethereumGrpcAvailable
                ? "beta"
                : "configuration",
              provisioning: ethereumGrpcAvailable
                ? "available"
                : "awaiting_gateway_readiness",
              protocol: "grpc",
              transport: "http2",
              serviceName:
                "nodezuno.ethereum.v1.EthereumProxy",
              authentication: {
                scheme: "bearer",
                requiredScope: "grpc:invoke",
                serviceIdMetadata: "x-nodezuno-service-id",
              },
            }
          : options.input.product === "rollups" && chainLaunchStack
            ? {
                maturity: "design-partner",
                provisioning: "project_created",
                category: "chain-launch",
                stack: chainLaunchStack,
                requestedComponents: [
                  "rpc",
                  "explorer",
                  "indexing",
                  "monitoring",
                  "snapshots",
                ],
                funding: "commercial_or_ecosystem_partnership",
              }
            : {
                maturity: "prelaunch",
                provisioning: "configuration_only",
              },
  );

  await db.batch([
    db
      .prepare(
        `INSERT INTO developer_services
          (id, workspace_id, product, name, environment, network, region,
           status, endpoint_path, configuration_json, created_by_account_id,
           created_at, updated_at, archived_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
         WHERE (
           SELECT COUNT(*) FROM developer_services
           WHERE workspace_id = ? AND archived_at IS NULL
         ) < 50
           AND NOT EXISTS (
             SELECT 1
             FROM developer_mutation_idempotency
             WHERE workspace_id = ?
               AND operation = 'service.create'
               AND idempotency_hash = ?
               AND expires_at > ?
           )`,
      )
      .bind(
        id,
        workspace.id,
        options.input.product,
        options.input.name,
        options.input.environment,
        options.input.network,
        options.input.region,
        status,
        endpointPath,
        configurationJson,
        actor.accountId,
        now,
        now,
        workspace.id,
        workspace.id,
        mutation.idempotencyHash,
        now,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, ?, ?, ?, ?, 'service.created', 'service', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM developer_services
           WHERE id = ? AND workspace_id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        authorizationApiKeyId,
        id,
        JSON.stringify({
          product: options.input.product,
          environment: options.input.environment,
          network: options.input.network,
          region: options.input.region,
          status,
        }),
        now,
        id,
        workspace.id,
      ),
    db
      .prepare(
        `INSERT INTO developer_mutation_idempotency
          (id, workspace_id, operation, idempotency_hash, request_hash,
           resource_id, created_at, expires_at)
         SELECT ?, ?, 'service.create', ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1
           FROM developer_services
           WHERE id = ? AND workspace_id = ?
         )
         ON CONFLICT(workspace_id, operation, idempotency_hash)
         DO UPDATE SET
           id = excluded.id,
           request_hash = excluded.request_hash,
           resource_id = excluded.resource_id,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at
         WHERE developer_mutation_idempotency.expires_at <= ?`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        mutation.idempotencyHash,
        mutation.requestHash,
        id,
        now,
        idempotencyExpiresAt,
        id,
        workspace.id,
        now,
      ),
  ]);

  const service = await findDeveloperService(id, workspace.id, db);
  if (service) return service;
  const replay = await findDeveloperMutationIdempotency(
    workspace.id,
    "service.create",
    mutation.idempotencyHash,
    now,
    db,
  );
  if (replay) {
    if (replay.requestHash !== mutation.requestHash) {
      throw developerMutationIdempotencyConflict();
    }
    const existing = await findDeveloperService(
      replay.resourceId,
      workspace.id,
      db,
    );
    if (existing) return existing;
    throw new HttpProblem(
      503,
      "service_idempotency_state_unavailable",
      "The previous service creation result is temporarily unavailable.",
    );
  }
  throw new HttpProblem(
    409,
    "service_limit_reached",
    "Archive an existing service configuration before creating another one.",
  );
}

export async function updateDeveloperService(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  id: string;
  input: DeveloperServiceUpdateInput;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  const existing = await findDeveloperService(
    options.id,
    authorization.workspaceId,
    db,
  );
  if (!existing || existing.archivedAt !== null) return null;
  if (existing.updatedAt !== options.input.updatedAt) {
    throw developerServiceUpdateConflict();
  }
  if (existing.name === options.input.name) return existing;

  const requestedNow = options.now ?? Date.now();
  if (!Number.isSafeInteger(requestedNow) || requestedNow < 0) {
    throw new TypeError(
      "Developer service update time must be a nonnegative integer.",
    );
  }
  const updatedAt = Math.max(requestedNow, existing.updatedAt + 1);
  if (!Number.isSafeInteger(updatedAt)) {
    throw new TypeError("Developer service update time is out of range.");
  }
  const mutationId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE developer_services
         SET name = ?, updated_at = ?, last_mutation_id = ?
         WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
           AND updated_at = ?`,
      )
      .bind(
        options.input.name,
        updatedAt,
        mutationId,
        options.id,
        authorization.workspaceId,
        options.input.updatedAt,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, workspace_id, ?, ?, ?, 'service.updated', 'service',
                id, '{"field":"name"}', ?
         FROM developer_services
         WHERE id = ? AND workspace_id = ? AND last_mutation_id = ?
           AND updated_at = ?`,
      )
      .bind(
        crypto.randomUUID(),
        authorization.actor.accountId,
        authorization.actor.email,
        authorization.authorizationApiKeyId,
        updatedAt,
        options.id,
        authorization.workspaceId,
        mutationId,
        updatedAt,
      ),
  ]);
  if (
    results[0]?.meta.changes !== 1 ||
    results[1]?.meta.changes !== 1
  ) {
    const current = await findDeveloperService(
      options.id,
      authorization.workspaceId,
      db,
    );
    if (!current || current.archivedAt !== null) return null;
    throw developerServiceUpdateConflict();
  }
  const saved = await findDeveloperService(
    options.id,
    authorization.workspaceId,
    db,
  );
  if (
    !saved ||
    saved.name !== options.input.name ||
    saved.updatedAt !== updatedAt
  ) {
    throw new HttpProblem(
      503,
      "service_update_persistence_failed",
      "The service update could not be stored.",
    );
  }
  return saved;
}

export async function archiveDeveloperService(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  id: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const authorizationApiKeyId =
    authorization.authorizationApiKeyId;
  const existing = await findDeveloperService(options.id, workspace.id, db);
  if (!existing) return null;
  if (existing.archivedAt !== null) return existing;
  const now = options.now ?? Date.now();

  await db.batch([
    db
      .prepare(
        `UPDATE developer_services
         SET status = 'archived', archived_at = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND archived_at IS NULL`,
      )
      .bind(now, now, options.id, workspace.id),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'service.archived', 'service', ?, '{}', ?)`,
      )
      .bind(
        crypto.randomUUID(),
        workspace.id,
        actor.accountId,
        actor.email,
        authorizationApiKeyId,
        options.id,
        now,
      ),
  ]);
  return findDeveloperService(options.id, workspace.id, db);
}

export async function authenticateDeveloperApiKey(options: {
  id: string;
  secretHash: string;
  now?: number;
  database?: D1Database;
}): Promise<import("./developer-platform.ts").DeveloperApiKeyIdentity | null> {
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const row = await db
    .prepare(
      `SELECT k.id, k.name, k.prefix, k.last_four AS lastFour,
              k.service_id AS serviceId,
              k.scopes_json AS scopesJson, k.secret_hash AS secretHash,
              k.expires_at AS expiresAt, k.revoked_at AS revokedAt,
              w.id AS workspaceId, w.slug AS workspaceSlug,
              w.name AS workspaceName, w.status AS workspaceStatus
       FROM developer_api_keys k
       JOIN developer_workspaces w ON w.id = k.workspace_id
       WHERE k.id = ?
       LIMIT 1`,
    )
    .bind(options.id)
    .first<DeveloperApiKeyAuthenticationRow>();
  if (
    !row ||
    row.workspaceStatus !== "active" ||
    row.revokedAt !== null ||
    row.expiresAt <= now ||
    !constantTimeStringEqual(row.secretHash, options.secretHash)
  ) {
    return null;
  }
  const scopes = parseDeveloperApiKeyScopes(row.scopesJson);
  if (scopes.length === 0) return null;

  await db
    .prepare(
      `UPDATE developer_api_keys
       SET last_used_at = ?
       WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)`,
    )
    .bind(now, row.id, now - 5 * 60 * 1000)
    .run();
  return {
    workspace: {
      id: row.workspaceId,
      slug: row.workspaceSlug,
      name: row.workspaceName,
    },
    apiKey: {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      lastFour: row.lastFour,
      scopes,
      serviceId: row.serviceId,
      expiresAt: row.expiresAt,
    },
    secretHash: row.secretHash,
  };
}

export async function findEthereumRpcServiceForApiKey(options: {
  serviceId: string;
  workspaceId: string;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const service = await findRpcServiceForApiKey(options);
  return service?.network === "ethereum" ? service : null;
}

export async function findRpcServiceForApiKey(options: {
  serviceId: string;
  workspaceId: string;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const db = options.database ?? (await getDatabase());
  const row = await db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, product, name, environment,
              network, region, status, endpoint_path AS endpointPath,
              configuration_json AS configurationJson,
              created_at AS createdAt, updated_at AS updatedAt,
              archived_at AS archivedAt
       FROM developer_services
       WHERE id = ? AND workspace_id = ? AND product = 'rpc-api'
         AND network IN ('ethereum', 'base', 'solana')
         AND archived_at IS NULL
       LIMIT 1`,
    )
    .bind(options.serviceId, options.workspaceId)
    .first<DeveloperServiceRow>();
  return row ? toDeveloperServiceRecord(row) : null;
}

export async function getDeveloperRpcAccessPolicy(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  now?: number;
  database?: D1Database;
}): Promise<RpcAccessPolicyRecord | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  return findRpcAccessPolicyForService({
    serviceId: options.serviceId,
    workspaceId: authorization.workspaceId,
    database: db,
  });
}

export async function updateDeveloperRpcAccessPolicy(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  expectedRevision: number;
  policy: RpcAccessPolicy;
  now?: number;
  database?: D1Database;
}): Promise<RpcAccessPolicyRecord | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin"],
    now: options.now,
    database: db,
  });
  const actor = authorization.actor;
  const workspace = { id: authorization.workspaceId };
  const current = await findRpcAccessPolicyForService({
    serviceId: options.serviceId,
    workspaceId: workspace.id,
    database: db,
  });
  if (!current) return null;

  const validation = validateRpcAccessPolicy(options.policy);
  if (!validation.ok) {
    throw new HttpProblem(
      422,
      "rpc_access_policy_invalid",
      "Check the RPC access policy.",
      validation.fields,
    );
  }
  if (
    !Number.isSafeInteger(options.expectedRevision) ||
    options.expectedRevision < 0 ||
    options.expectedRevision > 2_147_483_647
  ) {
    throw new HttpProblem(
      422,
      "rpc_access_policy_revision_invalid",
      "Use the revision returned by the RPC access policy endpoint.",
      {
        revision:
          "Use the non-negative revision returned by the policy endpoint.",
      },
    );
  }
  if (current.revision !== options.expectedRevision) {
    throw rpcAccessPolicyConflict();
  }
  if (options.expectedRevision === 2_147_483_647) {
    throw new HttpProblem(
      409,
      "rpc_access_policy_revision_exhausted",
      "Create a replacement RPC service before changing this policy again.",
    );
  }

  const unsupportedMethods = validation.value.allowedMethods.filter(
    (method) =>
      !rpcMethodIsPlatformAllowed(current.network, method),
  );
  if (unsupportedMethods.length > 0) {
    throw new HttpProblem(
      422,
      "rpc_access_policy_method_invalid",
      "The policy cannot enable methods blocked by the platform.",
      {
        allowedMethods:
          "Remove methods that are unavailable on the selected network.",
      },
    );
  }

  const nextRevision = options.expectedRevision + 1;
  const updateId = crypto.randomUUID();
  const now = options.now ?? Date.now();
  const policy = validation.value;
  const auditDetail = JSON.stringify({
    revision: nextRevision,
    allowedOriginsCount: policy.allowedOrigins.length,
    allowedIpCidrsCount: policy.allowedIpCidrs.length,
    allowedMethodsCount: policy.allowedMethods.length,
  });
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO developer_rpc_access_policies
          (service_id, workspace_id, allowed_origins_json,
           allowed_ip_cidrs_json, allowed_methods_json, revision, update_id,
           updated_by_account_id, updated_by_email, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ? = 0 OR EXISTS (
           SELECT 1
           FROM developer_rpc_access_policies
           WHERE service_id = ? AND revision = ?
         )
         ON CONFLICT(service_id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           allowed_origins_json = excluded.allowed_origins_json,
           allowed_ip_cidrs_json = excluded.allowed_ip_cidrs_json,
           allowed_methods_json = excluded.allowed_methods_json,
           revision = excluded.revision,
           update_id = excluded.update_id,
           updated_by_account_id = excluded.updated_by_account_id,
           updated_by_email = excluded.updated_by_email,
           updated_at = excluded.updated_at
         WHERE developer_rpc_access_policies.revision = ?`,
      )
      .bind(
        options.serviceId,
        workspace.id,
        JSON.stringify(policy.allowedOrigins),
        JSON.stringify(policy.allowedIpCidrs),
        JSON.stringify(policy.allowedMethods),
        nextRevision,
        updateId,
        actor.accountId,
        actor.email,
        now,
        now,
        options.expectedRevision,
        options.serviceId,
        options.expectedRevision,
        options.expectedRevision,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
          (id, workspace_id, actor_account_id, actor_email, api_key_id,
           action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, workspace_id, ?, ?, ?,
                'rpc_access_policy.updated', 'service', service_id, ?, ?
         FROM developer_rpc_access_policies
         WHERE service_id = ? AND workspace_id = ?
           AND update_id = ? AND revision = ?`,
      )
      .bind(
        crypto.randomUUID(),
        actor.accountId,
        actor.email,
        authorization.authorizationApiKeyId,
        auditDetail,
        now,
        options.serviceId,
        workspace.id,
        updateId,
        nextRevision,
      ),
  ]);
  if (
    results[0]?.meta.changes !== 1 ||
    results[1]?.meta.changes !== 1
  ) {
    throw rpcAccessPolicyConflict();
  }

  const saved = await findRpcAccessPolicyForService({
    serviceId: options.serviceId,
    workspaceId: workspace.id,
    database: db,
  });
  if (!saved || saved.revision < nextRevision) {
    throw new HttpProblem(
      503,
      "rpc_access_policy_persistence_failed",
      "The RPC access policy could not be stored.",
    );
  }
  return saved;
}

export async function findRpcAccessPolicyForService(options: {
  serviceId: string;
  workspaceId: string;
  database?: D1Database;
}): Promise<RpcAccessPolicyRecord | null> {
  const db = options.database ?? (await getDatabase());
  return findRpcAccessPolicyRecord(
    options.serviceId,
    options.workspaceId,
    db,
  );
}

export async function findPublicRpcAccessPolicy(options: {
  serviceId: string;
  database?: D1Database;
}): Promise<RpcAccessPolicyRecord | null> {
  const db = options.database ?? (await getDatabase());
  return findRpcAccessPolicyRecord(options.serviceId, null, db);
}

export type DeveloperRpcServiceGuardrailState = {
  service: DeveloperServiceRecord;
  guardrail: RpcServiceGuardrailRecord | null;
};

export async function getDeveloperRpcServiceGuardrail(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperRpcServiceGuardrailState | null> {
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin", "developer"],
    now: options.now,
    database: db,
  });
  const service = await findGuardrailedRpcService({
    serviceId: options.serviceId,
    workspaceId: authorization.workspaceId,
    database: db,
  });
  if (!service) return null;
  return {
    service,
    guardrail: await findRpcServiceGuardrailRecord(
      service.id,
      service.workspaceId,
      db,
    ),
  };
}

export async function updateDeveloperRpcServiceGuardrail(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  serviceId: string;
  guardrail: RpcServiceGuardrailInput;
  now?: number;
  database?: D1Database;
}): Promise<DeveloperRpcServiceGuardrailState | null> {
  const validation = validateRpcServiceGuardrailUpdate(
    options.guardrail,
  );
  if (!validation.ok) {
    throw new HttpProblem(
      422,
      "rpc_service_guardrail_invalid",
      "Check the RPC service guardrail.",
      validation.fields,
    );
  }
  const db = options.database ?? (await getDatabase());
  const authorization = await authorizeDeveloperServiceControl({
    actor: options.actor,
    workspaceId: options.workspaceId,
    authorizationApiKeyId: options.authorizationApiKeyId,
    allowedApplicationRoles: ["owner", "admin"],
    now: options.now,
    database: db,
  });
  const service = await findGuardrailedRpcService({
    serviceId: options.serviceId,
    workspaceId: authorization.workspaceId,
    database: db,
  });
  if (!service) return null;

  const current = await findRpcServiceGuardrailRecord(
    service.id,
    service.workspaceId,
    db,
  );
  const expectedRevision = validation.value.revision;
  if ((current?.revision ?? 0) !== expectedRevision) {
    throw rpcServiceGuardrailConflict();
  }
  if (expectedRevision === 2_147_483_647) {
    throw new HttpProblem(
      409,
      "rpc_service_guardrail_revision_exhausted",
      "Create a replacement RPC service before changing this guardrail again.",
    );
  }

  const nextRevision = expectedRevision + 1;
  const now = options.now ?? Date.now();
  const updateId = crypto.randomUUID();
  const actor = authorization.actor;
  const next = validation.value;
  const auditDetail = JSON.stringify({
    revision: nextRevision,
    hourlyQuotaLimit: next.hourlyQuotaLimit,
    warningThresholdPercent: next.warningThresholdPercent,
    inherited: next.hourlyQuotaLimit === null,
  });
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO developer_rpc_service_guardrails
           (service_id, workspace_id, hourly_quota_limit,
            warning_threshold_percent, revision, update_id, created_at,
            updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM developer_services
           WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
             AND (
               (product = 'rpc-api'
                AND network IN ('ethereum', 'base', 'solana'))
               OR (product = 'grpc-api' AND network = 'ethereum')
             )
         )
         AND (
           (? = 0 AND NOT EXISTS (
             SELECT 1 FROM developer_rpc_service_guardrails
             WHERE service_id = ?
           ))
           OR EXISTS (
             SELECT 1 FROM developer_rpc_service_guardrails
             WHERE service_id = ? AND workspace_id = ? AND revision = ?
           )
         )
         ON CONFLICT(service_id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           hourly_quota_limit = excluded.hourly_quota_limit,
           warning_threshold_percent =
             excluded.warning_threshold_percent,
           revision = excluded.revision,
           update_id = excluded.update_id,
           updated_at = excluded.updated_at
         WHERE developer_rpc_service_guardrails.workspace_id = ?
           AND developer_rpc_service_guardrails.revision = ?
           AND ? > 0`,
      )
      .bind(
        service.id,
        service.workspaceId,
        next.hourlyQuotaLimit,
        next.warningThresholdPercent,
        nextRevision,
        updateId,
        now,
        now,
        service.id,
        service.workspaceId,
        expectedRevision,
        service.id,
        service.id,
        service.workspaceId,
        expectedRevision,
        service.workspaceId,
        expectedRevision,
        expectedRevision,
      ),
    db
      .prepare(
        `INSERT INTO developer_audit_events
           (id, workspace_id, actor_account_id, actor_email, api_key_id,
            action, entity_type, entity_id, detail_json, created_at)
         SELECT ?, workspace_id, ?, ?, ?,
                'rpc_service_guardrail.updated', 'service', service_id,
                ?, ?
         FROM developer_rpc_service_guardrails
         WHERE service_id = ? AND workspace_id = ?
           AND update_id = ? AND revision = ?`,
      )
      .bind(
        crypto.randomUUID(),
        actor.accountId,
        actor.email,
        authorization.authorizationApiKeyId,
        auditDetail,
        now,
        service.id,
        service.workspaceId,
        updateId,
        nextRevision,
      ),
  ]);
  if (
    results[0]?.meta.changes !== 1 ||
    results[1]?.meta.changes !== 1
  ) {
    throw rpcServiceGuardrailConflict();
  }

  const saved = await findRpcServiceGuardrailRecord(
    service.id,
    service.workspaceId,
    db,
  );
  if (!saved || saved.revision !== nextRevision) {
    throw new HttpProblem(
      503,
      "rpc_service_guardrail_persistence_failed",
      "The RPC service guardrail could not be stored.",
    );
  }
  return { service, guardrail: saved };
}

export async function findRpcServiceGuardrailForAdmission(options: {
  serviceId: string;
  workspaceId: string;
  database?: D1Database;
}): Promise<RpcServiceGuardrailRecord | null> {
  const db = options.database ?? (await getDatabase());
  return findRpcServiceGuardrailRecord(
    options.serviceId,
    options.workspaceId,
    db,
  );
}

export async function findEthereumGrpcServiceForApiKey(options: {
  serviceId: string;
  workspaceId: string;
  database?: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const db = options.database ?? (await getDatabase());
  const row = await db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, product, name, environment,
              network, region, status, endpoint_path AS endpointPath,
              configuration_json AS configurationJson,
              created_at AS createdAt, updated_at AS updatedAt,
              archived_at AS archivedAt
       FROM developer_services
       WHERE id = ? AND workspace_id = ? AND product = 'grpc-api'
         AND network = 'ethereum' AND archived_at IS NULL
       LIMIT 1`,
    )
    .bind(options.serviceId, options.workspaceId)
    .first<DeveloperServiceRow>();
  return row ? toDeveloperServiceRecord(row) : null;
}

export async function consumeEthereumRpcQuota(options: {
  workspaceId: string;
  serviceId: string;
  apiKeyId: string;
  callCount: number;
  quotaUnits: number;
  limit: number;
  workspaceLimit: number;
  serviceLimit?: number;
  network?: RpcNetwork;
  now?: number;
  database?: D1Database;
}): Promise<{
  bucketId: string;
  remaining: number;
  workspaceRemaining: number;
  serviceRemaining: number;
  resetAt: number;
}> {
  const serviceLimit = options.serviceLimit ?? options.workspaceLimit;
  if (
    !Number.isSafeInteger(options.callCount) ||
    options.callCount < 1 ||
    !Number.isSafeInteger(options.quotaUnits) ||
    options.quotaUnits < 1 ||
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    !Number.isSafeInteger(options.workspaceLimit) ||
    options.workspaceLimit < 1 ||
    !Number.isSafeInteger(serviceLimit) ||
    serviceLimit < 1 ||
    serviceLimit > options.workspaceLimit
  ) {
    throw new TypeError(
      "RPC quota values must be positive integers and the service limit cannot exceed the workspace limit.",
    );
  }
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  const windowMs = 60 * 60 * 1000;
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = bucketStart + windowMs;
  const expiresAt = bucketStart + 35 * 24 * 60 * 60 * 1000;
  const bucketId = `${options.serviceId}:${options.apiKeyId}:${bucketStart}`;
  const workspaceBucketId = `${options.workspaceId}:${bucketStart}`;
  const serviceBucketId = `${options.serviceId}:${bucketStart}`;

  let quotaResults: D1Result<{ quotaUnits: number }>[];
  try {
    quotaResults = await db.batch<{ quotaUnits: number }>([
      db
        .prepare(
          `INSERT INTO ethereum_rpc_workspace_quota_buckets
             (id, workspace_id, bucket_start, quota_units, quota_limit,
              updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             quota_units = CASE
               WHEN quota_units + excluded.quota_units
                    <= excluded.quota_limit
               THEN quota_units + excluded.quota_units
               ELSE excluded.quota_limit + 1
             END,
             quota_limit = excluded.quota_limit,
             updated_at = excluded.updated_at,
             expires_at = excluded.expires_at
           RETURNING quota_units AS quotaUnits`,
        )
        .bind(
          workspaceBucketId,
          options.workspaceId,
          bucketStart,
          options.quotaUnits,
          options.workspaceLimit,
          now,
          expiresAt,
        ),
      db
        .prepare(
          `INSERT INTO ethereum_rpc_service_quota_buckets
             (id, workspace_id, service_id, bucket_start, quota_units,
              quota_limit, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             quota_units = CASE
               WHEN quota_units + excluded.quota_units
                    <= excluded.quota_limit
               THEN quota_units + excluded.quota_units
               ELSE excluded.quota_limit + 1
             END,
             quota_limit = excluded.quota_limit,
             updated_at = excluded.updated_at,
             expires_at = excluded.expires_at
           RETURNING quota_units AS quotaUnits`,
        )
        .bind(
          serviceBucketId,
          options.workspaceId,
          options.serviceId,
          bucketStart,
          options.quotaUnits,
          serviceLimit,
          now,
          expiresAt,
        ),
      db
        .prepare(
          `INSERT INTO ethereum_rpc_usage_buckets
             (id, workspace_id, service_id, api_key_id, bucket_start,
              quota_units, quota_limit, request_count, rpc_call_count,
              error_count, upstream_failure_count, latency_ms_total,
              bytes_in, bytes_out, last_request_at, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 0, 0, 0, 0, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             quota_units = CASE
               WHEN quota_units + excluded.quota_units
                    <= excluded.quota_limit
               THEN quota_units + excluded.quota_units
               ELSE excluded.quota_limit + 1
             END,
             quota_limit = excluded.quota_limit,
             request_count = request_count + 1,
             rpc_call_count =
               rpc_call_count + excluded.rpc_call_count,
             updated_at = excluded.updated_at,
             expires_at = excluded.expires_at
           RETURNING quota_units AS quotaUnits`,
        )
        .bind(
          bucketId,
          options.workspaceId,
          options.serviceId,
          options.apiKeyId,
          bucketStart,
          options.quotaUnits,
          options.limit,
          options.callCount,
          now,
          expiresAt,
        ),
    ]);
  } catch (error) {
    const exceeded = await ethereumRpcQuotaExceeded({
      database: db,
      workspaceBucketId,
      serviceBucketId,
      bucketId,
      workspaceId: options.workspaceId,
      serviceId: options.serviceId,
      apiKeyId: options.apiKeyId,
      quotaUnits: options.quotaUnits,
      limit: options.limit,
      workspaceLimit: options.workspaceLimit,
      serviceLimit,
    }).catch(() => null);
    if (exceeded?.scope || isEthereumRpcQuotaConstraintError(error)) {
      throw ethereumRpcQuotaProblem({
        limit:
          exceeded?.scope === "workspace"
            ? options.workspaceLimit
            : exceeded?.scope === "service"
              ? serviceLimit
              : options.limit,
        workspaceLimit: options.workspaceLimit,
        serviceLimit,
        scope: exceeded?.scope ?? "key",
        resetAt,
        now,
        network: options.network,
      });
    }
    throw error;
  }

  const workspaceQuotaUnits = Number(
    quotaResults[0]?.results?.[0]?.quotaUnits,
  );
  const keyQuotaUnits = Number(
    quotaResults[2]?.results?.[0]?.quotaUnits,
  );
  const serviceQuotaUnits = Number(
    quotaResults[1]?.results?.[0]?.quotaUnits,
  );
  if (
    !Number.isSafeInteger(workspaceQuotaUnits) ||
    !Number.isSafeInteger(serviceQuotaUnits) ||
    !Number.isSafeInteger(keyQuotaUnits)
  ) {
    throw new HttpProblem(
      503,
      "rpc_quota_state_unavailable",
      `${rpcNetworkLabel(options.network ?? "ethereum")} RPC quota state could not be confirmed.`,
    );
  }

  if (Math.random() < 0.01) {
    try {
      await db.batch([
        db
          .prepare(
            "DELETE FROM ethereum_rpc_usage_buckets WHERE expires_at < ?",
          )
          .bind(now),
        db
          .prepare(
            `DELETE FROM ethereum_rpc_workspace_quota_buckets
             WHERE expires_at < ?`,
          )
          .bind(now),
        db
          .prepare(
            `DELETE FROM ethereum_rpc_service_quota_buckets
             WHERE expires_at < ?`,
          )
          .bind(now),
      ]);
    } catch {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "rpc_quota_cleanup_failed",
        }),
      );
    }
  }
  return {
    bucketId,
    remaining: Math.max(0, options.limit - keyQuotaUnits),
    workspaceRemaining: Math.max(
      0,
      options.workspaceLimit - workspaceQuotaUnits,
    ),
    serviceRemaining: Math.max(
      0,
      serviceLimit - serviceQuotaUnits,
    ),
    resetAt,
  };
}

export const consumeRpcQuota = consumeEthereumRpcQuota;

function isEthereumRpcQuotaConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ethereum_rpc_(?:workspace_|service_)?(?:quota|usage).*check|check constraint failed.*quota_(?:units|limit)/i.test(
    message,
  );
}

async function ethereumRpcQuotaExceeded(options: {
  database: D1Database;
  workspaceBucketId: string;
  serviceBucketId: string;
  bucketId: string;
  workspaceId: string;
  serviceId: string;
  apiKeyId: string;
  quotaUnits: number;
  limit: number;
  workspaceLimit: number;
  serviceLimit: number;
}): Promise<{ scope: "workspace" | "service" | "key" } | null> {
  const [workspaceRow, serviceRow, keyRow] = await Promise.all([
    options.database
      .prepare(
        `SELECT quota_units AS quotaUnits
         FROM ethereum_rpc_workspace_quota_buckets
         WHERE id = ? AND workspace_id = ?
         LIMIT 1`,
      )
      .bind(options.workspaceBucketId, options.workspaceId)
      .first<{ quotaUnits: number }>(),
    options.database
      .prepare(
        `SELECT quota_units AS quotaUnits
         FROM ethereum_rpc_service_quota_buckets
         WHERE id = ? AND workspace_id = ? AND service_id = ?
         LIMIT 1`,
      )
      .bind(
        options.serviceBucketId,
        options.workspaceId,
        options.serviceId,
      )
      .first<{ quotaUnits: number }>(),
    options.database
      .prepare(
        `SELECT quota_units AS quotaUnits
         FROM ethereum_rpc_usage_buckets
         WHERE id = ? AND workspace_id = ? AND service_id = ?
           AND api_key_id = ?
         LIMIT 1`,
      )
      .bind(
        options.bucketId,
        options.workspaceId,
        options.serviceId,
        options.apiKeyId,
      )
      .first<{ quotaUnits: number }>(),
  ]);
  const workspaceUnits = Number(workspaceRow?.quotaUnits ?? 0);
  const serviceUnits = Number(serviceRow?.quotaUnits ?? 0);
  const keyUnits = Number(keyRow?.quotaUnits ?? 0);
  if (
    !Number.isSafeInteger(workspaceUnits) ||
    workspaceUnits < 0 ||
    !Number.isSafeInteger(serviceUnits) ||
    serviceUnits < 0 ||
    !Number.isSafeInteger(keyUnits) ||
    keyUnits < 0
  ) {
    return null;
  }
  if (
    workspaceUnits + options.quotaUnits >
    options.workspaceLimit
  ) {
    return { scope: "workspace" };
  }
  if (serviceUnits + options.quotaUnits > options.serviceLimit) {
    return { scope: "service" };
  }
  if (keyUnits + options.quotaUnits > options.limit) {
    return { scope: "key" };
  }
  return null;
}

function ethereumRpcQuotaProblem(options: {
  limit: number;
  workspaceLimit: number;
  serviceLimit: number;
  scope: "workspace" | "service" | "key";
  resetAt: number;
  now: number;
  network?: RpcNetwork;
}): HttpProblem {
  return new HttpProblem(
    429,
    "rpc_quota_exceeded",
    `The hourly ${rpcNetworkLabel(options.network ?? "ethereum")} RPC call quota has been reached.`,
    undefined,
    {
      "Retry-After": String(
        Math.max(
          1,
          Math.ceil((options.resetAt - options.now) / 1000),
        ),
      ),
      "X-RateLimit-Limit": String(options.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(
        Math.ceil(options.resetAt / 1000),
      ),
      "X-Nodezuno-Quota-Scope": options.scope,
      "X-Nodezuno-Workspace-RateLimit-Limit": String(
        options.workspaceLimit,
      ),
      "X-Nodezuno-Service-RateLimit-Limit": String(
        options.serviceLimit,
      ),
    },
  );
}

export async function recordEthereumRpcUsage(options: {
  bucketId: string;
  workspaceId: string;
  serviceId: string;
  apiKeyId: string;
  errorCalls: number;
  upstreamFailures: number;
  latencyMs: number;
  bytesIn: number;
  bytesOut: number;
  now?: number;
  database?: D1Database;
}): Promise<void> {
  const metrics = [
    options.errorCalls,
    options.upstreamFailures,
    options.latencyMs,
    options.bytesIn,
    options.bytesOut,
  ];
  if (
    metrics.some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new TypeError("RPC usage metrics must be nonnegative integers.");
  }
  const db = options.database ?? (await getDatabase());
  const now = options.now ?? Date.now();
  await db
    .prepare(
      `UPDATE ethereum_rpc_usage_buckets
       SET error_count = error_count + ?,
           upstream_failure_count = upstream_failure_count + ?,
           latency_ms_total = latency_ms_total + ?,
           bytes_in = bytes_in + ?,
           bytes_out = bytes_out + ?,
           last_request_at = ?,
           updated_at = ?
       WHERE id = ? AND workspace_id = ? AND service_id = ?
         AND api_key_id = ?`,
    )
    .bind(
      options.errorCalls,
      options.upstreamFailures,
      options.latencyMs,
      options.bytesIn,
      options.bytesOut,
      now,
      now,
      options.bucketId,
      options.workspaceId,
      options.serviceId,
      options.apiKeyId,
    )
    .run();
}

export const recordRpcUsage = recordEthereumRpcUsage;

function rpcUsageMetricsFromRow(
  row: DeveloperRpcUsageAggregateRow,
): DeveloperRpcUsageMetrics {
  return {
    quotaUnits: safeRpcUsageInteger(row.quotaUnits, "quota units"),
    requests: safeRpcUsageInteger(row.requests, "request count"),
    calls: safeRpcUsageInteger(row.calls, "call count"),
    errors: safeRpcUsageInteger(row.errors, "error count"),
    upstreamFailures: safeRpcUsageInteger(
      row.upstreamFailures,
      "upstream failure count",
    ),
    latencyMsTotal: safeRpcUsageInteger(
      row.latencyMsTotal,
      "latency total",
    ),
    bytesIn: safeRpcUsageInteger(row.bytesIn, "inbound bytes"),
    bytesOut: safeRpcUsageInteger(row.bytesOut, "outbound bytes"),
    lastRequestAt: nullableRpcUsageTimestamp(row.lastRequestAt),
  };
}

function addRpcUsageMetrics(
  left: DeveloperRpcUsageMetrics,
  right: DeveloperRpcUsageMetrics,
): DeveloperRpcUsageMetrics {
  return {
    quotaUnits: safeRpcUsageInteger(
      left.quotaUnits + right.quotaUnits,
      "quota unit total",
    ),
    requests: safeRpcUsageInteger(
      left.requests + right.requests,
      "request total",
    ),
    calls: safeRpcUsageInteger(
      left.calls + right.calls,
      "call total",
    ),
    errors: safeRpcUsageInteger(
      left.errors + right.errors,
      "error total",
    ),
    upstreamFailures: safeRpcUsageInteger(
      left.upstreamFailures + right.upstreamFailures,
      "upstream failure total",
    ),
    latencyMsTotal: safeRpcUsageInteger(
      left.latencyMsTotal + right.latencyMsTotal,
      "latency total",
    ),
    bytesIn: safeRpcUsageInteger(
      left.bytesIn + right.bytesIn,
      "inbound byte total",
    ),
    bytesOut: safeRpcUsageInteger(
      left.bytesOut + right.bytesOut,
      "outbound byte total",
    ),
    lastRequestAt:
      left.lastRequestAt === null
        ? right.lastRequestAt
        : right.lastRequestAt === null
          ? left.lastRequestAt
          : Math.max(left.lastRequestAt, right.lastRequestAt),
  };
}

function safeRpcUsageInteger(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "rpc_usage_data_invalid",
        field,
      }),
    );
    throw rpcUsageUnavailableProblem();
  }
  return numeric;
}

function nullableRpcUsageTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return safeRpcUsageInteger(value, "last request timestamp");
}

function rpcUsageUnavailableProblem(): HttpProblem {
  return new HttpProblem(
    503,
    "rpc_usage_unavailable",
    "RPC usage data could not be read safely.",
  );
}

type DeveloperApiKeyRow = {
  id: string;
  workspaceId: string;
  serviceId: string | null;
  name: string;
  prefix: string;
  lastFour: string;
  scopesJson: string;
  secretHash: string;
  createdByAccountId: string | null;
  createdByEmail: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
  revokedAt: number | null;
};

type DeveloperApiKeyAuthenticationRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  serviceId: string | null;
  scopesJson: string;
  secretHash: string;
  expiresAt: number;
  revokedAt: number | null;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  workspaceStatus: string;
};

type DeveloperApiKeyService = {
  id: string;
  product: string;
  network: string;
};

type DeveloperServiceRow = Omit<
  DeveloperServiceRecord,
  "configuration" | "telemetry"
> & {
  configurationJson: string;
  telemetryRequests?: number | null;
  telemetryCalls?: number | null;
  telemetryErrors?: number | null;
  telemetryUpstreamFailures?: number | null;
  telemetryLatencyMsTotal?: number | null;
  telemetryWindowStartedAt?: number | null;
  telemetryUpdatedAt?: number | null;
};

type RpcAccessPolicyRow = {
  serviceId: string;
  workspaceId: string;
  network: string;
  policyWorkspaceId: string | null;
  allowedOriginsJson: string | null;
  allowedIpCidrsJson: string | null;
  allowedMethodsJson: string | null;
  revision: number | null;
  updatedAt: number | null;
};

type RpcServiceGuardrailRow = {
  serviceId: string;
  workspaceId: string;
  hourlyQuotaLimit: number | null;
  warningThresholdPercent: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

type DeveloperWorkspaceMemberRow = DeveloperWorkspaceMemberRecord;

async function findOwnedDeveloperWorkspace(
  actor: DeveloperActor,
  db: D1Database,
): Promise<DeveloperWorkspaceRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.status, m.role,
                w.created_at AS createdAt, w.updated_at AS updatedAt
         FROM developer_workspace_members m
         JOIN developer_workspaces w ON w.id = m.workspace_id
         WHERE m.role = 'owner'
           AND (
             (? IS NOT NULL AND m.account_id = ?)
             OR (? IS NOT NULL AND m.email = ?)
           )
         LIMIT 1`,
      )
      .bind(
        actor.accountId,
        actor.accountId,
        actor.email,
        actor.email,
      )
      .first<DeveloperWorkspaceRecord>()) ?? null
  );
}

async function findDeveloperWorkspaceByIdForIdentity(
  workspaceId: string,
  actor: DeveloperActor,
  db: D1Database,
): Promise<DeveloperWorkspaceRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT w.id, w.slug, w.name, w.status, m.role,
                w.created_at AS createdAt, w.updated_at AS updatedAt
         FROM developer_workspace_members m
         JOIN developer_workspaces w ON w.id = m.workspace_id
         WHERE w.id = ?
           AND (
             (? IS NOT NULL AND m.account_id = ?)
             OR (? IS NOT NULL AND m.email = ?)
           )
         LIMIT 1`,
      )
      .bind(
        workspaceId,
        actor.accountId,
        actor.accountId,
        actor.email,
        actor.email,
      )
      .first<DeveloperWorkspaceRecord>()) ?? null
  );
}

async function requireActiveDeveloperWorkspace(
  actor: DeveloperActor,
  db: D1Database,
  allowedRoles: readonly DeveloperWorkspaceRecord["role"][],
): Promise<DeveloperWorkspaceRecord> {
  const workspace = await findDeveloperWorkspaceForIdentity(actor, db);
  if (!workspace) {
    throw new HttpProblem(
      409,
      "workspace_required",
      "Create or join a developer workspace before managing resources.",
    );
  }
  if (workspace.status !== "active") {
    throw new HttpProblem(
      403,
      "workspace_inactive",
      "This developer workspace is not active.",
    );
  }
  if (!allowedRoles.includes(workspace.role)) {
    throw new HttpProblem(
      403,
      "workspace_access_denied",
      "This workspace role cannot perform that action.",
    );
  }
  return workspace;
}

type DeveloperServiceManagementKeyRow = {
  workspaceStatus: string;
  serviceId: string | null;
  scopesJson: string;
  expiresAt: number;
  revokedAt: number | null;
};

async function authorizeDeveloperApiKeyLifecycle(options: {
  actor?: DeveloperActor;
  actorAccountId?: string | null;
  actorEmail?: string | null;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  now?: number;
  database: D1Database;
}): Promise<{
  workspaceId: string;
  actor: DeveloperActor;
  authorizationApiKeyId: string | null;
}> {
  const usesActorObject = options.actor !== undefined;
  const usesLegacyActor =
    options.actorAccountId !== undefined ||
    options.actorEmail !== undefined;
  if (usesActorObject && usesLegacyActor) {
    throw new TypeError(
      "Provide exactly one developer API key authorization principal.",
    );
  }
  const actor = usesActorObject
    ? options.actor
    : usesLegacyActor
      ? {
          accountId: options.actorAccountId ?? null,
          email: options.actorEmail ?? null,
        }
      : undefined;
  try {
    return await authorizeDeveloperServiceControl({
      actor,
      workspaceId: options.workspaceId,
      authorizationApiKeyId: options.authorizationApiKeyId,
      allowedApplicationRoles: ["owner", "admin"],
      now: options.now,
      database: options.database,
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message ===
        "Provide exactly one developer service authorization principal."
    ) {
      throw new TypeError(
        "Provide exactly one developer API key authorization principal.",
      );
    }
    throw error;
  }
}

async function authorizeDeveloperServiceControl(options: {
  actor?: DeveloperActor;
  workspaceId?: string;
  authorizationApiKeyId?: string;
  allowedApplicationRoles: readonly DeveloperWorkspaceRecord["role"][];
  now?: number;
  database: D1Database;
}): Promise<{
  workspaceId: string;
  actor: DeveloperActor;
  authorizationApiKeyId: string | null;
}> {
  const usesApiKeyAuthorization =
    options.actor === undefined &&
    options.workspaceId !== undefined &&
    options.authorizationApiKeyId !== undefined;
  const usesApplicationAuthorization =
    options.actor !== undefined &&
    options.workspaceId === undefined &&
    options.authorizationApiKeyId === undefined;
  if (!usesApiKeyAuthorization && !usesApplicationAuthorization) {
    throw new TypeError(
      "Provide exactly one developer service authorization principal.",
    );
  }
  if (usesApiKeyAuthorization) {
    const workspaceId = options.workspaceId as string;
    const authorizationApiKeyId =
      options.authorizationApiKeyId as string;
    await requireActiveDeveloperServiceManagementKey({
      workspaceId,
      apiKeyId: authorizationApiKeyId,
      now: options.now,
      database: options.database,
    });
    return {
      workspaceId,
      actor: { accountId: null, email: null },
      authorizationApiKeyId,
    };
  }
  const actor = normalizeDeveloperActor(options.actor as DeveloperActor);
  const workspace = await requireActiveDeveloperWorkspace(
    actor,
    options.database,
    options.allowedApplicationRoles,
  );
  return {
    workspaceId: workspace.id,
    actor,
    authorizationApiKeyId: null,
  };
}

async function requireActiveDeveloperServiceManagementKey(options: {
  workspaceId: string;
  apiKeyId: string;
  now?: number;
  database: D1Database;
}): Promise<void> {
  if (
    !isDeveloperResourceId(options.workspaceId) ||
    !isDeveloperResourceId(options.apiKeyId)
  ) {
    throw apiKeyAuthenticationProblem();
  }
  const now = options.now ?? Date.now();
  const row = await options.database
    .prepare(
      `SELECT w.status AS workspaceStatus,
              k.service_id AS serviceId,
              k.scopes_json AS scopesJson,
              k.expires_at AS expiresAt,
              k.revoked_at AS revokedAt
       FROM developer_api_keys k
       JOIN developer_workspaces w ON w.id = k.workspace_id
       WHERE k.id = ? AND k.workspace_id = ? AND w.id = ?
       LIMIT 1`,
    )
    .bind(options.apiKeyId, options.workspaceId, options.workspaceId)
    .first<DeveloperServiceManagementKeyRow>();
  if (
    !row ||
    row.workspaceStatus !== "active" ||
    row.revokedAt !== null ||
    row.expiresAt <= now
  ) {
    throw apiKeyAuthenticationProblem();
  }
  if (
    row.serviceId !== null ||
    !parseDeveloperApiKeyScopes(row.scopesJson).includes(
      "services:manage",
    )
  ) {
    throw new HttpProblem(
      403,
      "api_key_scope_denied",
      "This API key cannot manage workspace services.",
    );
  }
}

async function findDeveloperApiKeyMetadata(
  id: string,
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperApiKeyMetadata | null> {
  const row = await db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, name, prefix,
              service_id AS serviceId,
              last_four AS lastFour, scopes_json AS scopesJson,
              secret_hash AS secretHash,
              created_by_account_id AS createdByAccountId,
              created_by_email AS createdByEmail,
              created_at AS createdAt, last_used_at AS lastUsedAt,
              expires_at AS expiresAt, revoked_at AS revokedAt
       FROM developer_api_keys
       WHERE id = ? AND workspace_id = ?
       LIMIT 1`,
    )
    .bind(id, workspaceId)
    .first<DeveloperApiKeyRow>();
  return row ? toDeveloperApiKeyMetadata(row) : null;
}

async function findDeveloperWorkspaceMember(
  id: string,
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperWorkspaceMemberRecord | null> {
  const row = await db
    .prepare(
      `SELECT m.id, m.workspace_id AS workspaceId,
              COALESCE(m.account_id, u.id) AS accountId,
              m.email, m.role,
              CASE
                WHEN m.role = 'owner'
                  OR m.account_id IS NOT NULL
                  OR u.id IS NOT NULL
                THEN 'active'
                ELSE 'pending'
              END AS state,
              m.created_at AS createdAt, m.updated_at AS updatedAt
       FROM developer_workspace_members m
       LEFT JOIN auth_users u ON u.email = m.email
       WHERE m.id = ? AND m.workspace_id = ?
       LIMIT 1`,
    )
    .bind(id, workspaceId)
    .first<DeveloperWorkspaceMemberRow>();
  return row ?? null;
}

async function findDeveloperWorkspaceMemberByIdentity(
  workspaceId: string,
  accountId: string | null,
  email: string | null,
  db: D1Database,
): Promise<DeveloperWorkspaceMemberRecord | null> {
  const row = await db
    .prepare(
      `SELECT m.id, m.workspace_id AS workspaceId,
              COALESCE(m.account_id, u.id) AS accountId,
              m.email, m.role,
              CASE
                WHEN m.role = 'owner'
                  OR m.account_id IS NOT NULL
                  OR u.id IS NOT NULL
                THEN 'active'
                ELSE 'pending'
              END AS state,
              m.created_at AS createdAt, m.updated_at AS updatedAt
       FROM developer_workspace_members m
       LEFT JOIN auth_users u ON u.email = m.email
       WHERE m.workspace_id = ?
         AND (
           (? IS NOT NULL AND (m.account_id = ? OR u.id = ?))
           OR (? IS NOT NULL AND m.email = ?)
         )
       ORDER BY CASE
         WHEN ? IS NOT NULL AND m.account_id = ? THEN 0
         WHEN ? IS NOT NULL AND u.id = ? THEN 1
         ELSE 2
       END
       LIMIT 1`,
    )
    .bind(
      workspaceId,
      accountId,
      accountId,
      accountId,
      email,
      email,
      accountId,
      accountId,
      accountId,
      accountId,
    )
    .first<DeveloperWorkspaceMemberRow>();
  return row ?? null;
}

function memberMatchesActor(
  member: DeveloperWorkspaceMemberRecord,
  actor: DeveloperActor,
): boolean {
  return Boolean(
    (actor.accountId &&
      member.accountId &&
      actor.accountId === member.accountId) ||
      (actor.email &&
        member.email &&
        actor.email === member.email.toLowerCase()),
  );
}

function workspaceMemberRoleProblem(): HttpProblem {
  return new HttpProblem(
    422,
    "workspace_member_role_invalid",
    "Choose a supported workspace member role.",
    { role: "Choose the admin or developer role." },
  );
}

function developerMutationIdentity(options: {
  idempotencyHash?: string;
  requestHash?: string;
}): { idempotencyHash: string; requestHash: string } {
  if (
    options.idempotencyHash === undefined &&
    options.requestHash === undefined
  ) {
    return {
      idempotencyHash: ephemeralMutationHash(),
      requestHash: ephemeralMutationHash(),
    };
  }
  if (
    !options.idempotencyHash ||
    !options.requestHash ||
    !/^[a-f0-9]{64}$/.test(options.idempotencyHash) ||
    !/^[a-f0-9]{64}$/.test(options.requestHash)
  ) {
    throw new HttpProblem(
      400,
      "invalid_developer_idempotency",
      "Provide a valid developer mutation identity.",
    );
  }
  return {
    idempotencyHash: options.idempotencyHash,
    requestHash: options.requestHash,
  };
}

function ephemeralMutationHash(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto
    .randomUUID()
    .replaceAll("-", "")}`;
}

async function findDeveloperMutationIdempotency(
  workspaceId: string,
  operation: DeveloperMutationOperation,
  idempotencyHash: string,
  now: number,
  db: D1Database,
): Promise<DeveloperMutationIdempotencyRecord | null> {
  return (
    (await db
      .prepare(
        `SELECT request_hash AS requestHash, resource_id AS resourceId,
                expires_at AS expiresAt
         FROM developer_mutation_idempotency
         WHERE workspace_id = ? AND operation = ?
           AND idempotency_hash = ? AND expires_at > ?
         LIMIT 1`,
      )
      .bind(workspaceId, operation, idempotencyHash, now)
      .first<DeveloperMutationIdempotencyRecord>()) ?? null
  );
}

function developerMutationIdempotencyConflict(): HttpProblem {
  return new HttpProblem(
    409,
    "idempotency_key_reused",
    "This Idempotency-Key was already used for different input.",
    {
      idempotencyKey:
        "Use a new Idempotency-Key when the request body changes.",
    },
  );
}

async function findDeveloperApiKeyService(
  serviceId: string,
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperApiKeyService | null> {
  const row = await db
    .prepare(
      `SELECT id, product, network
       FROM developer_services
       WHERE id = ? AND workspace_id = ? AND archived_at IS NULL
       LIMIT 1`,
    )
    .bind(serviceId, workspaceId)
    .first<DeveloperApiKeyService>();
  return row ?? null;
}

function resolveDeveloperApiKeyScopes(
  requestedScopes: readonly DeveloperApiKeyScope[] | null,
  service: DeveloperApiKeyService | null,
): DeveloperApiKeyScope[] {
  const compatibleScopes: readonly DeveloperApiKeyScope[] | null =
    service === null
      ? ["platform:identity", "services:manage"]
      : service.product === "platform-api"
        ? ["platform:identity"]
        : service.product === "rpc-api" &&
            ["ethereum", "base", "solana"].includes(service.network)
          ? ["rpc:invoke"]
          : service.product === "grpc-api" &&
              service.network === "ethereum"
            ? ["grpc:invoke"]
            : null;
  if (compatibleScopes === null) {
    throw new HttpProblem(
      422,
      "api_key_service_not_callable",
      "Create API keys only for callable services.",
      {
        serviceId:
          "Choose the platform API, a supported RPC service, or the Ethereum gRPC service.",
      },
    );
  }

  const scopes: DeveloperApiKeyScope[] =
    requestedScopes === null
      ? [compatibleScopes[0]]
      : [...requestedScopes];
  if (
    scopes.length !== 1 ||
    !compatibleScopes.includes(scopes[0]) ||
    !developerApiKeyScopes.includes(scopes[0])
  ) {
    const supported = compatibleScopes.join(" or ");
    throw new HttpProblem(
      422,
      "api_key_scope_invalid",
      "Choose the least-privilege scope for the selected service.",
      {
        scopes: `Use only ${supported} for this API key.`,
      },
    );
  }
  return scopes;
}

function apiKeyServiceProblem(): HttpProblem {
  return new HttpProblem(
    422,
    "api_key_service_invalid",
    "Choose a service in this workspace that has not been archived.",
    {
      serviceId:
        "Use an existing service from this workspace that has not been archived.",
    },
  );
}

function apiKeySecretAlreadyIssuedProblem(): HttpProblem {
  return new HttpProblem(
    409,
    "api_key_secret_already_issued",
    "This request already created an API key secret.",
    {
      idempotencyKey:
        "Refresh the key list. Revoke the existing key and use a new Idempotency-Key if its secret was not saved.",
    },
  );
}

function apiKeyRotationSourceInactiveProblem(): HttpProblem {
  return new HttpProblem(
    409,
    "api_key_rotation_source_inactive",
    "Only an active, unexpired key for an available service can be rotated.",
  );
}

async function findDeveloperService(
  id: string,
  workspaceId: string,
  db: D1Database,
): Promise<DeveloperServiceRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, product, name, environment,
              network, region, status, endpoint_path AS endpointPath,
              configuration_json AS configurationJson,
              created_at AS createdAt, updated_at AS updatedAt,
              archived_at AS archivedAt
       FROM developer_services
       WHERE id = ? AND workspace_id = ?
       LIMIT 1`,
    )
    .bind(id, workspaceId)
    .first<DeveloperServiceRow>();
  return row ? toDeveloperServiceRecord(row) : null;
}

async function findGuardrailedRpcService(options: {
  serviceId: string;
  workspaceId: string;
  database: D1Database;
}): Promise<DeveloperServiceRecord | null> {
  const service = await findDeveloperService(
    options.serviceId,
    options.workspaceId,
    options.database,
  );
  if (
    !service ||
    service.archivedAt !== null ||
    !(
      (service.product === "rpc-api" &&
        (service.network === "ethereum" ||
          service.network === "base" ||
          service.network === "solana")) ||
      (service.product === "grpc-api" &&
        service.network === "ethereum")
    )
  ) {
    return null;
  }
  return service;
}

async function findRpcServiceGuardrailRecord(
  serviceId: string,
  workspaceId: string,
  db: D1Database,
): Promise<RpcServiceGuardrailRecord | null> {
  const row = await db
    .prepare(
      `SELECT service_id AS serviceId, workspace_id AS workspaceId,
              hourly_quota_limit AS hourlyQuotaLimit,
              warning_threshold_percent AS warningThresholdPercent,
              revision, created_at AS createdAt, updated_at AS updatedAt
       FROM developer_rpc_service_guardrails
       WHERE service_id = ? AND workspace_id = ?
       LIMIT 1`,
    )
    .bind(serviceId, workspaceId)
    .first<RpcServiceGuardrailRow>();
  if (!row) return null;

  const validHourlyQuota =
    row.hourlyQuotaLimit === null ||
    (Number.isSafeInteger(row.hourlyQuotaLimit) &&
      row.hourlyQuotaLimit >= RPC_GUARDRAIL_MIN_HOURLY_QUOTA &&
      row.hourlyQuotaLimit <= RPC_GUARDRAIL_MAX_HOURLY_QUOTA);
  if (
    row.serviceId !== serviceId ||
    row.workspaceId !== workspaceId ||
    !validHourlyQuota ||
    !Number.isSafeInteger(row.warningThresholdPercent) ||
    row.warningThresholdPercent < RPC_GUARDRAIL_MIN_WARNING_PERCENT ||
    row.warningThresholdPercent > RPC_GUARDRAIL_MAX_WARNING_PERCENT ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > 2_147_483_647 ||
    !Number.isSafeInteger(row.createdAt) ||
    row.createdAt < 0 ||
    !Number.isSafeInteger(row.updatedAt) ||
    row.updatedAt < row.createdAt
  ) {
    throw invalidStoredRpcServiceGuardrailProblem();
  }
  return row;
}

async function findRpcAccessPolicyRecord(
  serviceId: string,
  workspaceId: string | null,
  db: D1Database,
): Promise<RpcAccessPolicyRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.id AS serviceId, s.workspace_id AS workspaceId, s.network,
              p.workspace_id AS policyWorkspaceId,
              p.allowed_origins_json AS allowedOriginsJson,
              p.allowed_ip_cidrs_json AS allowedIpCidrsJson,
              p.allowed_methods_json AS allowedMethodsJson,
              p.revision, p.updated_at AS updatedAt
       FROM developer_services s
       LEFT JOIN developer_rpc_access_policies p
         ON p.service_id = s.id
       WHERE s.id = ?
         AND (? IS NULL OR s.workspace_id = ?)
         AND s.product = 'rpc-api'
         AND s.network IN ('ethereum', 'base', 'solana')
         AND s.archived_at IS NULL
       LIMIT 1`,
    )
    .bind(serviceId, workspaceId, workspaceId)
    .first<RpcAccessPolicyRow>();
  if (!row) return null;
  if (!isRpcAccessPolicyNetwork(row.network)) {
    throw invalidStoredRpcAccessPolicyProblem();
  }
  const network = row.network;
  if (row.revision === null) {
    return {
      serviceId: row.serviceId,
      workspaceId: row.workspaceId,
      network,
      revision: 0,
      policy: {
        allowedOrigins: [],
        allowedIpCidrs: [],
        allowedMethods: [],
      },
      updatedAt: null,
    };
  }
  if (
    row.policyWorkspaceId !== row.workspaceId ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !Number.isSafeInteger(row.updatedAt) ||
    (row.updatedAt as number) < 0 ||
    row.allowedOriginsJson === null ||
    row.allowedIpCidrsJson === null ||
    row.allowedMethodsJson === null
  ) {
    throw invalidStoredRpcAccessPolicyProblem();
  }

  let rawPolicy: RpcAccessPolicy;
  try {
    rawPolicy = {
      allowedOrigins: JSON.parse(row.allowedOriginsJson) as string[],
      allowedIpCidrs: JSON.parse(row.allowedIpCidrsJson) as string[],
      allowedMethods: JSON.parse(row.allowedMethodsJson) as string[],
    };
  } catch {
    throw invalidStoredRpcAccessPolicyProblem();
  }
  const validation = validateRpcAccessPolicy(rawPolicy);
  if (
    !validation.ok ||
    validation.value.allowedMethods.some(
      (method) => !rpcMethodIsPlatformAllowed(network, method),
    )
  ) {
    throw invalidStoredRpcAccessPolicyProblem();
  }
  return {
    serviceId: row.serviceId,
    workspaceId: row.workspaceId,
    network,
    revision: row.revision,
    policy: validation.value,
    updatedAt: row.updatedAt,
  };
}

function isRpcAccessPolicyNetwork(
  value: string,
): value is RpcAccessPolicyNetwork {
  return (
    value === "ethereum" ||
    value === "base" ||
    value === "solana"
  );
}

function invalidStoredRpcAccessPolicyProblem(): HttpProblem {
  return new HttpProblem(
    503,
    "rpc_access_policy_unavailable",
    "The RPC access policy is temporarily unavailable.",
  );
}

function rpcAccessPolicyConflict(): HttpProblem {
  return new HttpProblem(
    409,
    "rpc_access_policy_conflict",
    "The RPC access policy changed in another session.",
    {
      revision:
        "Reload the latest policy revision before saving these changes.",
    },
  );
}

function invalidStoredRpcServiceGuardrailProblem(): HttpProblem {
  return new HttpProblem(
    503,
    "rpc_service_guardrail_unavailable",
    "The RPC service guardrail is temporarily unavailable.",
  );
}

function rpcServiceGuardrailConflict(): HttpProblem {
  return new HttpProblem(
    409,
    "rpc_service_guardrail_conflict",
    "The RPC service guardrail changed in another session.",
    {
      revision:
        "Reload the latest guardrail revision before saving these changes.",
    },
  );
}

function developerServiceUpdateConflict(): HttpProblem {
  return new HttpProblem(
    409,
    "service_update_conflict",
    "The service changed in another session.",
    {
      updatedAt:
        "Reload the latest service before saving this name.",
    },
  );
}

function toDeveloperServiceRecord(
  row: DeveloperServiceRow,
): DeveloperServiceRecord {
  let configuration: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.configurationJson) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      configuration = parsed as Record<string, unknown>;
    }
  } catch {
    configuration = {};
  }
  const telemetryRequests = normalizeAggregateNumber(
    row.telemetryRequests,
  );
  const telemetryLatencyMsTotal = normalizeAggregateNumber(
    row.telemetryLatencyMsTotal,
  );
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    product: row.product,
    name: row.name,
    environment: row.environment,
    network: row.network,
    region: row.region,
    status: row.status,
    endpointPath: row.endpointPath,
    configuration,
    telemetry:
      row.product === "rpc-api" && row.telemetryUpdatedAt != null
        ? {
            requests: telemetryRequests,
            calls: normalizeAggregateNumber(row.telemetryCalls),
            errors: normalizeAggregateNumber(row.telemetryErrors),
            upstreamFailures: normalizeAggregateNumber(
              row.telemetryUpstreamFailures,
            ),
            averageLatencyMs:
              telemetryRequests > 0
                ? Math.round(
                    telemetryLatencyMsTotal / telemetryRequests,
                  )
                : null,
            windowStartedAt:
              row.telemetryWindowStartedAt ?? null,
            updatedAt: row.telemetryUpdatedAt ?? null,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

function normalizeAggregateNumber(
  value: number | null | undefined,
): number {
  const numeric = Number(value ?? 0);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : 0;
}

function toDeveloperApiKeyMetadata(
  row: DeveloperApiKeyRow,
): DeveloperApiKeyMetadata {
  const record: DeveloperApiKeyRecord = {
    id: row.id,
    workspaceId: row.workspaceId,
    serviceId: row.serviceId,
    name: row.name,
    prefix: row.prefix,
    lastFour: row.lastFour,
    scopes: parseDeveloperApiKeyScopes(row.scopesJson),
    secretHash: row.secretHash,
    createdByAccountId: row.createdByAccountId,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  };
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    lastFour: record.lastFour,
    scopes: record.scopes,
    serviceId: record.serviceId,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}

function parseDeveloperApiKeyScopes(value: string): string[] {
  const allowed = new Set<string>(developerApiKeyScopes);
  return parseStringArray(value).filter((scope) => allowed.has(scope));
}

function toDeveloperAuditEventRecord(
  row: DeveloperAuditEventRow,
): DeveloperAuditEventRecord {
  const createdAt = Number(row.createdAt);
  const actorEmail = row.actorEmail?.trim().toLowerCase() ?? null;
  if (
    !isDeveloperResourceId(row.id) ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !/^[a-z_]+\.[a-z_]+$/.test(row.action) ||
    !/^[a-z_]{1,64}$/.test(row.entityType) ||
    !safeDeveloperAuditIdentifier(row.entityId) ||
    (row.actorAccountId !== null &&
      !safeDeveloperAuditIdentifier(row.actorAccountId)) ||
    (row.apiKeyId !== null && !isDeveloperResourceId(row.apiKeyId)) ||
    (actorEmail !== null && !safeDeveloperAuditEmail(actorEmail))
  ) {
    throw developerAuditUnavailableProblem();
  }
  return {
    id: row.id,
    actorAccountId: row.actorAccountId,
    actorEmail,
    apiKeyId: row.apiKeyId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    detail: sanitizeDeveloperAuditDetail(row.action, row.detailJson),
    createdAt,
  };
}

function safeDeveloperAuditIdentifier(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

function safeDeveloperAuditEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
  );
}

function normalizeDeveloperActor(actor: DeveloperActor): DeveloperActor {
  const accountId = actor.accountId?.trim() || null;
  const email = actor.email?.trim().toLowerCase() || null;
  if (!accountId && !email) {
    throw new HttpProblem(
      401,
      "authentication_required",
      "Sign in to access your developer workspace.",
    );
  }
  return { accountId, email };
}
