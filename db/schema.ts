import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable(
  "auth_users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_users_email_unique").on(table.email),
    index("auth_users_created_idx").on(table.createdAt),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("received"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailHash: text("email_hash").notNull(),
    company: text("company").notNull(),
    teamType: text("team_type").notNull(),
    message: text("message").notNull(),
    sourcePath: text("source_path").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    consentVersion: text("consent_version").notNull(),
    consentedAt: integer("consented_at").notNull(),
    submittedByAccountId: text("submitted_by_account_id").references(
      () => authUsers.id,
      { onDelete: "set null" },
    ),
    submittedByEmail: text("submitted_by_email"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    userAgentHash: text("user_agent_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    check(
      "submissions_kind_check",
      sql`${table.kind} IN ('sales', 'workspace_access', 'support', 'startup_program', 'press', 'career_interest', 'security_contact', 'event_interest')`,
    ),
    check(
      "submissions_status_check",
      sql`${table.status} IN ('received', 'reviewing', 'closed', 'spam')`,
    ),
    uniqueIndex("submissions_kind_idempotency_unique").on(
      table.kind,
      table.idempotencyKey,
    ),
    index("submissions_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("submissions_email_created_idx").on(
      table.emailHash,
      table.createdAt,
    ),
    index("submissions_account_created_idx").on(
      table.submittedByAccountId,
      table.createdAt,
    ),
    index("submissions_expiry_idx").on(table.expiresAt),
  ],
);

export const submissionEvents = sqliteTable(
  "submission_events",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorEmail: text("actor_email"),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("submission_events_received_unique")
      .on(table.submissionId)
      .where(sql`${table.eventType} = 'received'`),
    index("submission_events_submission_created_idx").on(
      table.submissionId,
      table.createdAt,
    ),
  ],
);

export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id"),
    topic: text("topic").notNull(),
    entityId: text("entity_id").notNull(),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    templateVersion: text("template_version"),
    payloadJson: text("payload_json").notNull(),
    payloadHash: text("payload_hash"),
    availableAt: integer("available_at").notNull(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: integer("lease_expires_at"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    acceptedAt: integer("accepted_at"),
    deliveredAt: integer("delivered_at"),
    firstAttemptAt: integer("first_attempt_at"),
    lastAttemptAt: integer("last_attempt_at"),
    terminalFailureCode: text("terminal_failure_code"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "notification_outbox_state_check",
      sql`${table.state} IN ('pending', 'processing', 'accepted', 'delivered', 'failed')`,
    ),
    check(
      "notification_outbox_topic_check",
      sql`${table.topic} IN ('submission.received', 'review.application.received.operator', 'review.application.received.buyer', 'review.lifecycle.buyer', 'newsletter.confirmation.requested', 'newsletter.unsubscribe.requested')`,
    ),
    check(
      "notification_outbox_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
    check(
      "notification_outbox_seal_pair_check",
      sql`((${table.deliveryId} IS NULL AND ${table.templateVersion} IS NULL AND ${table.payloadHash} IS NULL) OR (${table.deliveryId} IS NOT NULL AND ${table.templateVersion} IS NOT NULL AND ${table.payloadHash} IS NOT NULL))`,
    ),
    check(
      "notification_outbox_delivery_id_check",
      sql`${table.deliveryId} IS NULL OR (length(${table.deliveryId}) = 36 AND substr(${table.deliveryId}, 9, 1) = '-' AND substr(${table.deliveryId}, 14, 1) = '-' AND substr(${table.deliveryId}, 15, 1) = '4' AND substr(${table.deliveryId}, 19, 1) = '-' AND substr(${table.deliveryId}, 20, 1) GLOB '[89ab]' AND substr(${table.deliveryId}, 24, 1) = '-' AND ${table.deliveryId} NOT GLOB '*[^a-f0-9-]*')`,
    ),
    check(
      "notification_outbox_template_version_check",
      sql`${table.templateVersion} IS NULL OR length(${table.templateVersion}) BETWEEN 1 AND 80`,
    ),
    check(
      "notification_outbox_payload_hash_check",
      sql`${table.payloadHash} IS NULL OR (length(${table.payloadHash}) = 64 AND ${table.payloadHash} NOT GLOB '*[^a-f0-9]*')`,
    ),
    check(
      "notification_outbox_payload_size_check",
      sql`length(${table.payloadJson}) BETWEEN 2 AND 65536`,
    ),
    check(
      "notification_outbox_lease_pair_check",
      sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      "notification_outbox_lease_token_check",
      sql`${table.leaseToken} IS NULL OR (length(${table.leaseToken}) = 64 AND ${table.leaseToken} NOT GLOB '*[^a-f0-9]*')`,
    ),
    check(
      "notification_outbox_provider_check",
      sql`${table.provider} IS NULL OR ${table.provider} IN ('resend', 'zoho', 'internal')`,
    ),
    check(
      "notification_outbox_provider_pair_check",
      sql`${table.providerMessageId} IS NULL OR ${table.provider} IS NOT NULL`,
    ),
    check(
      "notification_outbox_accepted_check",
      sql`${table.acceptedAt} IS NULL OR ${table.providerMessageId} IS NOT NULL`,
    ),
    check(
      "notification_outbox_delivered_check",
      sql`${table.deliveredAt} IS NULL OR ${table.acceptedAt} IS NOT NULL`,
    ),
    check(
      "notification_outbox_state_evidence_check",
      sql`(${table.state} != 'processing' OR ${table.leaseToken} IS NOT NULL) AND (${table.state} != 'accepted' OR (${table.acceptedAt} IS NOT NULL AND ${table.deliveredAt} IS NULL)) AND (${table.state} != 'delivered' OR (${table.acceptedAt} IS NOT NULL AND ${table.deliveredAt} IS NOT NULL))`,
    ),
    check(
      "notification_outbox_timestamps_check",
      sql`${table.availableAt} >= 0 AND ${table.createdAt} >= 0 AND ${table.updatedAt} >= 0 AND (${table.leaseExpiresAt} IS NULL OR ${table.leaseExpiresAt} >= 0) AND (${table.acceptedAt} IS NULL OR ${table.acceptedAt} >= 0) AND (${table.deliveredAt} IS NULL OR ${table.deliveredAt} >= 0) AND (${table.firstAttemptAt} IS NULL OR ${table.firstAttemptAt} >= 0) AND (${table.lastAttemptAt} IS NULL OR ${table.lastAttemptAt} >= ${table.firstAttemptAt})`,
    ),
    uniqueIndex("notification_outbox_delivery_id_unique").on(table.deliveryId),
    uniqueIndex("notification_outbox_provider_message_unique")
      .on(table.provider, table.providerMessageId)
      .where(sql`${table.providerMessageId} IS NOT NULL`),
    index("notification_outbox_state_available_idx").on(
      table.state,
      table.availableAt,
    ),
    index("notification_outbox_state_lease_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
    index("notification_outbox_topic_entity_created_idx").on(
      table.topic,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export const newsletterSubscriptions = sqliteTable(
  "newsletter_subscriptions",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailHash: text("email_hash").notNull(),
    name: text("name"),
    state: text("state").notNull().default("pending"),
    sourcePath: text("source_path").notNull(),
    consentVersion: text("consent_version").notNull(),
    consentedAt: integer("consented_at").notNull(),
    confirmationTokenId: text("confirmation_token_id"),
    confirmationTokenHash: text("confirmation_token_hash"),
    confirmationRequestedAt: integer("confirmation_requested_at"),
    confirmationExpiresAt: integer("confirmation_expires_at"),
    confirmedAt: integer("confirmed_at"),
    unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    unsubscribedAt: integer("unsubscribed_at"),
  },
  (table) => [
    check(
      "newsletter_subscriptions_state_check",
      sql`${table.state} IN ('pending', 'subscribed', 'unsubscribed')`,
    ),
    uniqueIndex("newsletter_subscriptions_email_unique").on(table.email),
    uniqueIndex("newsletter_subscriptions_confirmation_token_unique")
      .on(table.confirmationTokenId)
      .where(sql`${table.confirmationTokenId} IS NOT NULL`),
    index("newsletter_subscriptions_state_created_idx").on(
      table.state,
      table.createdAt,
    ),
    index("newsletter_subscriptions_confirmation_expiry_idx").on(
      table.state,
      table.confirmationExpiresAt,
    ),
  ],
);

export const rateLimitWindows = sqliteTable(
  "rate_limit_windows",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("rate_limit_scope_subject_window_unique").on(
      table.scope,
      table.subjectHash,
      table.windowStart,
    ),
    index("rate_limit_expiry_idx").on(table.expiresAt),
  ],
);

export const statusServices = sqliteTable(
  "status_services",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    state: text("state").notNull().default("preview"),
    sortOrder: integer("sort_order").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "status_services_state_check",
      sql`${table.state} IN ('preview', 'operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance')`,
    ),
    index("status_services_visible_sort_idx").on(
      table.visible,
      table.sortOrder,
    ),
  ],
);

export const statusIncidents = sqliteTable(
  "status_incidents",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull(),
    state: text("state").notNull(),
    impact: text("impact").notNull(),
    startedAt: integer("started_at").notNull(),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "status_incidents_severity_check",
      sql`${table.severity} IN ('none', 'minor', 'major', 'critical')`,
    ),
    check(
      "status_incidents_state_check",
      sql`${table.state} IN ('investigating', 'identified', 'monitoring', 'resolved')`,
    ),
    uniqueIndex("status_incidents_slug_unique").on(table.slug),
    index("status_incidents_state_started_idx").on(
      table.state,
      table.startedAt,
    ),
  ],
);

export const statusIncidentUpdates = sqliteTable(
  "status_incident_updates",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => statusIncidents.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("status_incident_updates_incident_created_idx").on(
      table.incidentId,
      table.createdAt,
    ),
  ],
);

export const chains = sqliteTable(
  "chains",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    family: text("family").notNull(),
    finalityModel: text("finality_model").notNull(),
    supportStage: text("support_stage").notNull().default("planned"),
    capabilitiesJson: text("capabilities_json").notNull().default("[]"),
    tone: text("tone").notNull(),
    sortOrder: integer("sort_order").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    verifiedAt: integer("verified_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "chains_support_stage_check",
      sql`${table.supportStage} IN ('planned', 'preview', 'full', 'data_only')`,
    ),
    uniqueIndex("chains_name_unique").on(table.name),
    index("chains_visible_sort_idx").on(table.visible, table.sortOrder),
  ],
);

export const adminAuditEvents = sqliteTable(
  "admin_audit_events",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("admin_audit_actor_created_idx").on(
      table.actorEmail,
      table.createdAt,
    ),
    index("admin_audit_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_unique").on(table.token),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("auth_accounts_user_idx").on(table.userId),
  ],
);

export const authVerifications = sqliteTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("auth_verifications_identifier_idx").on(table.identifier),
    index("auth_verifications_expiry_idx").on(table.expiresAt),
  ],
);

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [
    uniqueIndex("auth_rate_limits_key_unique").on(table.key),
    index("auth_rate_limits_last_request_idx").on(table.lastRequest),
  ],
);

export const authWalletAddresses = sqliteTable(
  "auth_wallet_addresses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_wallet_addresses_address_chain_unique").on(
      table.address,
      table.chainId,
    ),
    index("auth_wallet_addresses_user_idx").on(table.userId),
  ],
);

export const authSolanaWallets = sqliteTable(
  "auth_solana_wallets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_solana_wallets_address_unique").on(table.address),
    index("auth_solana_wallets_user_idx").on(table.userId),
  ],
);


export const reviewOrders = sqliteTable(
  "review_orders",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull(),
    status: text("status").notNull().default("qualification_pending"),
    contactName: text("contact_name").notNull(),
    workEmail: text("work_email").notNull(),
    emailHash: text("email_hash").notNull(),
    company: text("company").notNull(),
    website: text("website"),
    teamType: text("team_type").notNull(),
    targetChain: text("target_chain").notNull(),
    auditedBaseline: text("audited_baseline").notNull(),
    proposedRelease: text("proposed_release").notNull(),
    changeSummary: text("change_summary").notNull(),
    affectedContracts: integer("affected_contracts").notNull(),
    changedLines: integer("changed_lines"),
    artifactReadyDate: text("artifact_ready_date"),
    targetReleaseDate: text("target_release_date"),
    publicLinks: text("public_links"),
    sourcePath: text("source_path").notNull(),
    totalAmount: integer("total_amount").notNull().default(750000),
    depositAmount: integer("deposit_amount").notNull().default(375000),
    balanceAmount: integer("balance_amount").notNull().default(375000),
    currency: text("currency").notNull().default("usd"),
    proposalVersion: integer("proposal_version"),
    proposalTitle: text("proposal_title"),
    proposalScope: text("proposal_scope"),
    proposalExclusions: text("proposal_exclusions"),
    proposalReviewer: text("proposal_reviewer"),
    proposalIssuedAt: integer("proposal_issued_at"),
    proposalExpiresAt: integer("proposal_expires_at"),
    proposalAcceptedAt: integer("proposal_accepted_at"),
    nextAction: text("next_action"),
    telegramUsername: text("telegram_username"),
    submittedByAccountId: text("submitted_by_account_id").references(
      () => authUsers.id,
      { onDelete: "set null" },
    ),
    accessTokenHash: text("access_token_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    userAgentHash: text("user_agent_hash"),
    consentVersion: text("consent_version").notNull(),
    consentedAt: integer("consented_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_orders_reference_unique").on(table.reference),
    uniqueIndex("review_orders_idempotency_unique").on(table.idempotencyKey),
    index("review_orders_status_created_idx").on(table.status, table.createdAt),
    index("review_orders_account_created_idx").on(table.submittedByAccountId, table.createdAt),
    index("review_orders_email_created_idx").on(table.emailHash, table.createdAt),
    index("review_orders_expiry_idx").on(table.expiresAt),
  ],
);

export const reviewOrderEvents = sqliteTable(
  "review_order_events",
  {
    id: text("id").primaryKey(),
    reviewOrderId: text("review_order_id").notNull().references(
      () => reviewOrders.id,
      { onDelete: "cascade" },
    ),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorEmail: text("actor_email"),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("review_order_events_order_created_idx").on(table.reviewOrderId, table.createdAt),
  ],
);

export const reviewStablecoinPaymentIntents = sqliteTable(
  "review_stablecoin_payment_intents",
  {
    id: text("id").primaryKey(),
    reviewOrderId: text("review_order_id").notNull().references(
      () => reviewOrders.id,
      { onDelete: "cascade" },
    ),
    phase: text("phase").notNull(),
    state: text("state").notNull().default("awaiting_transfer"),
    asset: text("asset").notNull(),
    chainId: integer("chain_id").notNull().default(1),
    network: text("network").notNull().default("ethereum"),
    tokenContract: text("token_contract").notNull(),
    tokenDecimals: integer("token_decimals").notNull().default(6),
    recipientAddress: text("recipient_address").notNull(),
    obligationAmount: integer("obligation_amount").notNull(),
    obligationCurrency: text("obligation_currency").notNull().default("usd"),
    tokenAmountAtomic: text("token_amount_atomic").notNull(),
    tokenAmountDisplay: text("token_amount_display").notNull(),
    referenceUnits: integer("reference_units").notNull(),
    proposalVersion: integer("proposal_version").notNull(),
    termsAcceptedAt: integer("terms_accepted_at").notNull(),
    confirmationsRequired: integer("confirmations_required").notNull().default(12),
    termsVersion: text("terms_version").notNull().default("nodezuno-service-terms-2026-09-02"),
    termsHash: text("terms_hash").notNull().default("0000000000000000000000000000000000000000000000000000000000000000"),
    creationIdempotencyHash: text("creation_idempotency_hash"),
    creationRequestHash: text("creation_request_hash"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    verifiedAt: integer("verified_at"),
    cancelledAt: integer("cancelled_at"),
  },
  (table) => [
    check(
      "review_stablecoin_intents_phase_check",
      sql`${table.phase} IN ('deposit', 'balance')`,
    ),
    check(
      "review_stablecoin_intents_state_check",
      sql`${table.state} IN ('awaiting_transfer', 'submitted', 'confirming', 'verified', 'manual_review', 'expired', 'cancelled', 'refunded')`,
    ),
    check(
      "review_stablecoin_intents_asset_check",
      sql`${table.asset} IN ('USDC', 'USDT')`,
    ),
    check(
      "review_stablecoin_intents_chain_check",
      sql`${table.chainId} = 1 AND ${table.network} = 'ethereum'`,
    ),
    check(
      "review_stablecoin_intents_token_check",
      sql`${table.tokenDecimals} = 6 AND ((${table.asset} = 'USDC' AND ${table.tokenContract} = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR (${table.asset} = 'USDT' AND ${table.tokenContract} = '0xdAC17F958D2ee523a2206206994597C13D831ec7'))`,
    ),
    check(
      "review_stablecoin_intents_recipient_check",
      sql`${table.recipientAddress} = '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b'`,
    ),
    check(
      "review_stablecoin_intents_amount_check",
      sql`${table.obligationAmount} = 375000 AND ${table.obligationCurrency} = 'usd' AND ${table.tokenAmountAtomic} NOT GLOB '*[^0-9]*' AND CAST(${table.tokenAmountAtomic} AS integer) = (${table.obligationAmount} * 10000) + ${table.referenceUnits} AND ${table.tokenAmountDisplay} = printf('%d.%06d', CAST(${table.tokenAmountAtomic} AS integer) / 1000000, CAST(${table.tokenAmountAtomic} AS integer) % 1000000) AND ${table.referenceUnits} BETWEEN 1 AND 9999`,
    ),
    check(
      "review_stablecoin_intents_policy_check",
      sql`${table.confirmationsRequired} BETWEEN 6 AND 64 AND length(${table.termsVersion}) BETWEEN 8 AND 80 AND length(${table.termsHash}) = 64 AND (${table.creationIdempotencyHash} IS NULL OR length(${table.creationIdempotencyHash}) = 64) AND (${table.creationRequestHash} IS NULL OR length(${table.creationRequestHash}) = 64)`,
    ),
    uniqueIndex("review_stablecoin_intents_asset_amount_unique").on(
      table.asset,
      table.tokenAmountAtomic,
    ),
    uniqueIndex("review_stablecoin_intents_creation_idempotency_unique")
      .on(table.creationIdempotencyHash)
      .where(sql`${table.creationIdempotencyHash} IS NOT NULL`),
    uniqueIndex("review_stablecoin_intents_active_phase_unique")
      .on(table.reviewOrderId, table.phase)
      .where(sql`${table.state} IN ('awaiting_transfer', 'submitted', 'confirming', 'manual_review')`),
    index("review_stablecoin_intents_order_created_idx").on(
      table.reviewOrderId,
      table.createdAt,
    ),
    index("review_stablecoin_intents_state_expiry_idx").on(
      table.state,
      table.expiresAt,
    ),
  ],
);

export const reviewStablecoinPaymentClaims = sqliteTable(
  "review_stablecoin_payment_claims",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().references(
      () => reviewStablecoinPaymentIntents.id,
      { onDelete: "cascade" },
    ),
    transactionHash: text("transaction_hash").notNull(),
    telegramUsername: text("telegram_username").notNull(),
    state: text("state").notNull().default("submitted"),
    failureCode: text("failure_code"),
    observedSender: text("observed_sender"),
    observedTokenContract: text("observed_token_contract"),
    observedRecipientAddress: text("observed_recipient_address"),
    observedAmountAtomic: text("observed_amount_atomic"),
    blockNumber: text("block_number"),
    blockHash: text("block_hash"),
    logIndex: text("log_index"),
    blockTimestamp: integer("block_timestamp"),
    confirmations: integer("confirmations").notNull().default(0),
    evidenceHash: text("evidence_hash"),
    rpcAgreementCount: integer("rpc_agreement_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextCheckAt: integer("next_check_at").notNull(),
    lastCheckedAt: integer("last_checked_at"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: integer("lease_expires_at"),
    submittedAt: integer("submitted_at").notNull(),
    verifiedAt: integer("verified_at"),
    rejectedAt: integer("rejected_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "review_stablecoin_claims_state_check",
      sql`${table.state} IN ('submitted', 'checking', 'confirming', 'verified', 'rejected', 'manual_review')`,
    ),
    check(
      "review_stablecoin_claims_tx_hash_check",
      sql`length(${table.transactionHash}) = 66 AND substr(${table.transactionHash}, 1, 2) = '0x' AND substr(${table.transactionHash}, 3) NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      "review_stablecoin_claims_telegram_check",
      sql`length(${table.telegramUsername}) BETWEEN 6 AND 33 AND substr(${table.telegramUsername}, 1, 1) = '@' AND substr(${table.telegramUsername}, 2, 1) GLOB '[a-z]' AND substr(${table.telegramUsername}, 2) NOT GLOB '*[^a-z0-9_]*'`,
    ),
    check(
      "review_stablecoin_claims_nonnegative_check",
      sql`${table.confirmations} >= 0 AND ${table.rpcAgreementCount} >= 0 AND ${table.attemptCount} >= 0`,
    ),
    check(
      "review_stablecoin_claims_lease_pair_check",
      sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    uniqueIndex("review_stablecoin_claims_tx_hash_unique").on(
      table.transactionHash,
    ),
    uniqueIndex("review_stablecoin_claims_active_intent_unique")
      .on(table.paymentIntentId)
      .where(sql`${table.state} IN ('submitted', 'checking', 'confirming', 'verified', 'manual_review')`),
    index("review_stablecoin_claims_state_next_check_idx").on(
      table.state,
      table.nextCheckAt,
    ),
    index("review_stablecoin_claims_intent_created_idx").on(
      table.paymentIntentId,
      table.createdAt,
    ),
  ],
);

export const reviewStablecoinReconciliationCases = sqliteTable(
  "review_stablecoin_reconciliation_cases",
  {
    id: text("id").primaryKey(),
    reviewOrderId: text("review_order_id").notNull().references(
      () => reviewOrders.id,
      { onDelete: "restrict" },
    ),
    paymentIntentId: text("payment_intent_id").notNull().references(
      () => reviewStablecoinPaymentIntents.id,
      { onDelete: "restrict" },
    ),
    paymentClaimId: text("payment_claim_id").notNull().references(
      () => reviewStablecoinPaymentClaims.id,
      { onDelete: "restrict" },
    ),
    transactionHash: text("transaction_hash").notNull(),
    caseType: text("case_type").notNull(),
    state: text("state").notNull().default("open"),
    phase: text("phase").notNull(),
    expectedAsset: text("expected_asset").notNull(),
    expectedTokenContract: text("expected_token_contract").notNull(),
    expectedRecipientAddress: text("expected_recipient_address").notNull(),
    expectedAmountAtomic: text("expected_amount_atomic").notNull(),
    instructionExpiresAt: integer("instruction_expires_at").notNull(),
    observedSenderAddress: text("observed_sender_address"),
    observedTokenContract: text("observed_token_contract"),
    observedRecipientAddress: text("observed_recipient_address"),
    observedAmountAtomic: text("observed_amount_atomic"),
    blockNumber: text("block_number"),
    blockHash: text("block_hash"),
    logIndex: text("log_index"),
    blockTimestamp: integer("block_timestamp"),
    confirmationsObserved: integer("confirmations_observed").notNull().default(0),
    confirmationsRequired: integer("confirmations_required").notNull(),
    rpcAgreementCount: integer("rpc_agreement_count").notNull().default(0),
    evidenceHash: text("evidence_hash"),
    openedAt: integer("opened_at").notNull(),
    investigationStartedAt: integer("investigation_started_at"),
    resolutionIdempotencyHash: text("resolution_idempotency_hash"),
    resolutionRequestHash: text("resolution_request_hash"),
    resolutionCode: text("resolution_code"),
    resolutionNote: text("resolution_note"),
    resolutionDecidedByEmail: text("resolution_decided_by_email"),
    resolutionDecidedAt: integer("resolution_decided_at"),
    refundTransactionHash: text("refund_transaction_hash"),
    refundRecordedAt: integer("refund_recorded_at"),
    resolvedAt: integer("resolved_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "review_stablecoin_reconciliation_type_check",
      sql`${table.caseType} IN ('amount_mismatch', 'asset_mismatch', 'transfer_ambiguous', 'transfer_after_expiry')`,
    ),
    check(
      "review_stablecoin_reconciliation_state_check",
      sql`${table.state} IN ('open', 'investigating', 'application_pending', 'refund_pending', 'resolved')`,
    ),
    check(
      "review_stablecoin_reconciliation_phase_check",
      sql`${table.phase} IN ('deposit', 'balance')`,
    ),
    check(
      "review_stablecoin_reconciliation_asset_check",
      sql`${table.expectedAsset} IN ('USDC', 'USDT')`,
    ),
    check(
      "review_stablecoin_reconciliation_expected_token_check",
      sql`(${table.expectedAsset} = 'USDC' AND ${table.expectedTokenContract} = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR (${table.expectedAsset} = 'USDT' AND ${table.expectedTokenContract} = '0xdAC17F958D2ee523a2206206994597C13D831ec7')`,
    ),
    check(
      "review_stablecoin_reconciliation_recipient_check",
      sql`${table.expectedRecipientAddress} = '0x07218C8E2B01fbff950Af65A0f36D3305520aC3b'`,
    ),
    check(
      "review_stablecoin_reconciliation_transaction_check",
      sql`length(${table.transactionHash}) = 66 AND substr(${table.transactionHash}, 1, 2) = '0x' AND substr(${table.transactionHash}, 3) NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      "review_stablecoin_reconciliation_amount_check",
      sql`length(${table.expectedAmountAtomic}) BETWEEN 1 AND 78 AND ${table.expectedAmountAtomic} NOT GLOB '*[^0-9]*' AND ${table.expectedAmountAtomic} GLOB '*[1-9]*' AND (${table.observedAmountAtomic} IS NULL OR (length(${table.observedAmountAtomic}) BETWEEN 1 AND 78 AND ${table.observedAmountAtomic} NOT GLOB '*[^0-9]*' AND ${table.observedAmountAtomic} GLOB '*[1-9]*'))`,
    ),
    check(
      "review_stablecoin_reconciliation_observed_address_check",
      sql`(${table.observedSenderAddress} IS NULL OR (length(${table.observedSenderAddress}) = 42 AND substr(${table.observedSenderAddress}, 1, 2) = '0x' AND substr(${table.observedSenderAddress}, 3) NOT GLOB '*[^a-f0-9]*')) AND (${table.observedTokenContract} IS NULL OR (length(${table.observedTokenContract}) = 42 AND substr(${table.observedTokenContract}, 1, 2) = '0x' AND substr(${table.observedTokenContract}, 3) NOT GLOB '*[^a-f0-9]*')) AND (${table.observedRecipientAddress} IS NULL OR (length(${table.observedRecipientAddress}) = 42 AND substr(${table.observedRecipientAddress}, 1, 2) = '0x' AND substr(${table.observedRecipientAddress}, 3) NOT GLOB '*[^a-f0-9]*'))`,
    ),
    check(
      "review_stablecoin_reconciliation_block_check",
      sql`(${table.blockNumber} IS NULL OR (length(${table.blockNumber}) BETWEEN 1 AND 24 AND ${table.blockNumber} NOT GLOB '*[^0-9]*')) AND (${table.blockHash} IS NULL OR (length(${table.blockHash}) = 66 AND substr(${table.blockHash}, 1, 2) = '0x' AND substr(${table.blockHash}, 3) NOT GLOB '*[^a-f0-9]*')) AND (${table.logIndex} IS NULL OR (length(${table.logIndex}) BETWEEN 1 AND 24 AND ${table.logIndex} NOT GLOB '*[^0-9]*')) AND (${table.evidenceHash} IS NULL OR (length(${table.evidenceHash}) = 64 AND ${table.evidenceHash} NOT GLOB '*[^a-f0-9]*'))`,
    ),
    check(
      "review_stablecoin_reconciliation_evidence_group_check",
      sql`(${table.blockNumber} IS NULL AND ${table.blockHash} IS NULL AND ${table.logIndex} IS NULL AND ${table.blockTimestamp} IS NULL) OR (${table.blockNumber} IS NOT NULL AND ${table.blockHash} IS NOT NULL AND ${table.logIndex} IS NOT NULL AND ${table.blockTimestamp} IS NOT NULL)`,
    ),
    check(
      "review_stablecoin_reconciliation_counter_check",
      sql`${table.confirmationsObserved} >= 0 AND ${table.confirmationsRequired} BETWEEN 6 AND 64 AND ${table.rpcAgreementCount} >= 0`,
    ),
    check(
      "review_stablecoin_reconciliation_case_evidence_check",
      sql`(${table.caseType} != 'amount_mismatch' OR (lower(${table.observedTokenContract}) = lower(${table.expectedTokenContract}) AND lower(${table.observedRecipientAddress}) = lower(${table.expectedRecipientAddress}) AND ${table.observedAmountAtomic} != ${table.expectedAmountAtomic})) AND (${table.caseType} != 'asset_mismatch' OR ${table.observedTokenContract} IS NULL OR lower(${table.observedTokenContract}) != lower(${table.expectedTokenContract})) AND (${table.caseType} != 'transfer_after_expiry' OR (${table.blockTimestamp} IS NOT NULL AND ${table.blockTimestamp} > ${table.instructionExpiresAt}))`,
    ),
    check(
      "review_stablecoin_reconciliation_resolution_check",
      sql`${table.resolutionCode} IS NULL OR ${table.resolutionCode} IN ('applied_to_obligation', 'refund', 'no_funds_received', 'duplicate_transfer', 'written_off')`,
    ),
    check(
      "review_stablecoin_reconciliation_resolution_hash_check",
      sql`(${table.resolutionIdempotencyHash} IS NULL) = (${table.resolutionRequestHash} IS NULL) AND (${table.resolutionIdempotencyHash} IS NULL OR (length(${table.resolutionIdempotencyHash}) = 64 AND ${table.resolutionIdempotencyHash} NOT GLOB '*[^a-f0-9]*' AND length(${table.resolutionRequestHash}) = 64 AND ${table.resolutionRequestHash} NOT GLOB '*[^a-f0-9]*'))`,
    ),
    check(
      "review_stablecoin_reconciliation_refund_hash_check",
      sql`${table.refundTransactionHash} IS NULL OR (length(${table.refundTransactionHash}) = 66 AND substr(${table.refundTransactionHash}, 1, 2) = '0x' AND substr(${table.refundTransactionHash}, 3) NOT GLOB '*[^a-f0-9]*' AND ${table.refundTransactionHash} != ${table.transactionHash})`,
    ),
    check(
      "review_stablecoin_reconciliation_timestamps_check",
      sql`${table.openedAt} >= 0 AND ${table.instructionExpiresAt} >= 0 AND ${table.updatedAt} >= ${table.openedAt} AND (${table.investigationStartedAt} IS NULL OR ${table.investigationStartedAt} >= ${table.openedAt}) AND (${table.blockTimestamp} IS NULL OR ${table.blockTimestamp} >= 0) AND (${table.resolutionDecidedAt} IS NULL OR ${table.resolutionDecidedAt} >= ${table.openedAt}) AND (${table.refundRecordedAt} IS NULL OR ${table.refundRecordedAt} >= ${table.resolutionDecidedAt}) AND (${table.resolvedAt} IS NULL OR ${table.resolvedAt} >= ${table.resolutionDecidedAt})`,
    ),
    check(
      "review_stablecoin_reconciliation_workflow_check",
      sql`(${table.state} != 'open' OR (${table.investigationStartedAt} IS NULL AND ${table.resolutionIdempotencyHash} IS NULL AND ${table.resolutionRequestHash} IS NULL AND ${table.resolutionCode} IS NULL AND ${table.resolutionNote} IS NULL AND ${table.resolutionDecidedByEmail} IS NULL AND ${table.resolutionDecidedAt} IS NULL AND ${table.refundTransactionHash} IS NULL AND ${table.refundRecordedAt} IS NULL AND ${table.resolvedAt} IS NULL)) AND (${table.state} != 'investigating' OR (${table.investigationStartedAt} IS NOT NULL AND ${table.resolutionIdempotencyHash} IS NULL AND ${table.resolutionRequestHash} IS NULL AND ${table.resolutionCode} IS NULL AND ${table.resolutionNote} IS NULL AND ${table.resolutionDecidedByEmail} IS NULL AND ${table.resolutionDecidedAt} IS NULL AND ${table.refundTransactionHash} IS NULL AND ${table.refundRecordedAt} IS NULL AND ${table.resolvedAt} IS NULL)) AND (${table.state} != 'application_pending' OR (${table.resolutionIdempotencyHash} IS NOT NULL AND ${table.resolutionRequestHash} IS NOT NULL AND ${table.resolutionCode} = 'applied_to_obligation' AND length(${table.resolutionNote}) BETWEEN 8 AND 4000 AND length(${table.resolutionDecidedByEmail}) BETWEEN 3 AND 320 AND ${table.resolutionDecidedByEmail} LIKE '%@%' AND ${table.resolutionDecidedAt} IS NOT NULL AND ${table.refundTransactionHash} IS NULL AND ${table.refundRecordedAt} IS NULL AND ${table.resolvedAt} IS NULL)) AND (${table.state} != 'refund_pending' OR (${table.resolutionIdempotencyHash} IS NOT NULL AND ${table.resolutionRequestHash} IS NOT NULL AND ${table.resolutionCode} = 'refund' AND length(${table.resolutionNote}) BETWEEN 8 AND 4000 AND length(${table.resolutionDecidedByEmail}) BETWEEN 3 AND 320 AND ${table.resolutionDecidedByEmail} LIKE '%@%' AND ${table.resolutionDecidedAt} IS NOT NULL AND ${table.refundTransactionHash} IS NULL AND ${table.refundRecordedAt} IS NULL AND ${table.resolvedAt} IS NULL)) AND (${table.state} != 'resolved' OR (${table.resolutionIdempotencyHash} IS NOT NULL AND ${table.resolutionRequestHash} IS NOT NULL AND ${table.resolutionCode} IS NOT NULL AND length(${table.resolutionNote}) BETWEEN 8 AND 4000 AND length(${table.resolutionDecidedByEmail}) BETWEEN 3 AND 320 AND ${table.resolutionDecidedByEmail} LIKE '%@%' AND ${table.resolutionDecidedAt} IS NOT NULL AND ${table.resolvedAt} IS NOT NULL AND ((${table.resolutionCode} = 'refund' AND ${table.refundTransactionHash} IS NOT NULL AND ${table.refundRecordedAt} IS NOT NULL) OR (${table.resolutionCode} != 'refund' AND ${table.refundTransactionHash} IS NULL AND ${table.refundRecordedAt} IS NULL))))`,
    ),
    uniqueIndex("review_stablecoin_reconciliation_claim_unique").on(
      table.paymentClaimId,
    ),
    uniqueIndex("review_stablecoin_reconciliation_transaction_unique").on(
      table.transactionHash,
    ),
    uniqueIndex("review_stablecoin_reconciliation_resolution_idempotency_unique")
      .on(table.resolutionIdempotencyHash)
      .where(sql`${table.resolutionIdempotencyHash} IS NOT NULL`),
    index("review_stablecoin_reconciliation_state_opened_idx").on(
      table.state,
      table.openedAt,
    ),
    index("review_stablecoin_reconciliation_order_opened_idx").on(
      table.reviewOrderId,
      table.openedAt,
    ),
    index("review_stablecoin_reconciliation_intent_opened_idx").on(
      table.paymentIntentId,
      table.openedAt,
    ),
  ],
);

export const reviewStablecoinPaymentConfirmations = sqliteTable(
  "review_stablecoin_payment_confirmations",
  {
    id: text("id").primaryKey(),
    reviewOrderId: text("review_order_id").notNull().references(
      () => reviewOrders.id,
      { onDelete: "restrict" },
    ),
    paymentIntentId: text("payment_intent_id").notNull().references(
      () => reviewStablecoinPaymentIntents.id,
      { onDelete: "restrict" },
    ),
    paymentClaimId: text("payment_claim_id").notNull().references(
      () => reviewStablecoinPaymentClaims.id,
      { onDelete: "restrict" },
    ),
    reconciliationCaseId: text("reconciliation_case_id").references(
      () => reviewStablecoinReconciliationCases.id,
      { onDelete: "restrict" },
    ),
    recordKind: text("record_kind").notNull(),
    phase: text("phase").notNull(),
    expectedAsset: text("expected_asset").notNull(),
    expectedTokenContract: text("expected_token_contract").notNull(),
    receivedAsset: text("received_asset").notNull(),
    receivedTokenContract: text("received_token_contract").notNull(),
    recipientAddress: text("recipient_address").notNull(),
    senderAddress: text("sender_address").notNull(),
    expectedAmountAtomic: text("expected_amount_atomic").notNull(),
    receivedAmountAtomic: text("received_amount_atomic").notNull(),
    obligationAmount: integer("obligation_amount").notNull(),
    obligationCurrency: text("obligation_currency").notNull().default("usd"),
    transactionHash: text("transaction_hash").notNull(),
    blockNumber: text("block_number").notNull(),
    blockHash: text("block_hash").notNull(),
    logIndex: text("log_index").notNull(),
    blockTimestamp: integer("block_timestamp").notNull(),
    confirmationsObserved: integer("confirmations_observed").notNull(),
    confirmationsRequired: integer("confirmations_required").notNull(),
    rpcAgreementCount: integer("rpc_agreement_count").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    proposalVersion: integer("proposal_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    termsHash: text("terms_hash").notNull(),
    termsAcceptedAt: integer("terms_accepted_at").notNull(),
    confirmedAt: integer("confirmed_at").notNull(),
    recordedAt: integer("recorded_at").notNull(),
    recordedByType: text("recorded_by_type").notNull(),
    recordedByEmail: text("recorded_by_email"),
    publicRecordHash: text("public_record_hash").notNull(),
    receiptReference: text("receipt_reference").notNull(),
  },
  (table) => [
    check(
      "review_stablecoin_confirmations_kind_check",
      sql`${table.recordKind} IN ('exact_match', 'reconciliation')`,
    ),
    check(
      "review_stablecoin_confirmations_phase_check",
      sql`${table.phase} IN ('deposit', 'balance')`,
    ),
    check(
      "review_stablecoin_confirmations_asset_check",
      sql`${table.expectedAsset} IN ('USDC', 'USDT') AND ${table.receivedAsset} IN ('USDC', 'USDT')`,
    ),
    check(
      "review_stablecoin_confirmations_token_check",
      sql`((${table.expectedAsset} = 'USDC' AND ${table.expectedTokenContract} = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') OR (${table.expectedAsset} = 'USDT' AND ${table.expectedTokenContract} = '0xdAC17F958D2ee523a2206206994597C13D831ec7')) AND ((${table.receivedAsset} = 'USDC' AND lower(${table.receivedTokenContract}) = lower('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')) OR (${table.receivedAsset} = 'USDT' AND lower(${table.receivedTokenContract}) = lower('0xdAC17F958D2ee523a2206206994597C13D831ec7')))`,
    ),
    check(
      "review_stablecoin_confirmations_address_check",
      sql`lower(${table.recipientAddress}) = lower('0x07218C8E2B01fbff950Af65A0f36D3305520aC3b') AND length(${table.senderAddress}) = 42 AND substr(${table.senderAddress}, 1, 2) = '0x' AND substr(${table.senderAddress}, 3) NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      "review_stablecoin_confirmations_amount_check",
      sql`length(${table.expectedAmountAtomic}) BETWEEN 1 AND 78 AND ${table.expectedAmountAtomic} NOT GLOB '*[^0-9]*' AND ${table.expectedAmountAtomic} GLOB '*[1-9]*' AND length(${table.receivedAmountAtomic}) BETWEEN 1 AND 78 AND ${table.receivedAmountAtomic} NOT GLOB '*[^0-9]*' AND ${table.receivedAmountAtomic} GLOB '*[1-9]*' AND ${table.obligationAmount} > 0 AND ${table.obligationCurrency} = 'usd'`,
    ),
    check(
      "review_stablecoin_confirmations_transaction_check",
      sql`length(${table.transactionHash}) = 66 AND substr(${table.transactionHash}, 1, 2) = '0x' AND substr(${table.transactionHash}, 3) NOT GLOB '*[^a-f0-9]*' AND length(${table.blockHash}) = 66 AND substr(${table.blockHash}, 1, 2) = '0x' AND substr(${table.blockHash}, 3) NOT GLOB '*[^a-f0-9]*' AND length(${table.blockNumber}) BETWEEN 1 AND 24 AND ${table.blockNumber} NOT GLOB '*[^0-9]*' AND length(${table.logIndex}) BETWEEN 1 AND 24 AND ${table.logIndex} NOT GLOB '*[^0-9]*'`,
    ),
    check(
      "review_stablecoin_confirmations_evidence_check",
      sql`${table.confirmationsRequired} BETWEEN 6 AND 64 AND ${table.confirmationsObserved} >= ${table.confirmationsRequired} AND ${table.rpcAgreementCount} >= 2 AND length(${table.evidenceHash}) = 64 AND ${table.evidenceHash} NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      "review_stablecoin_confirmations_policy_check",
      sql`${table.proposalVersion} >= 1 AND length(${table.termsVersion}) BETWEEN 8 AND 80 AND length(${table.termsHash}) = 64 AND ${table.termsHash} NOT GLOB '*[^a-f0-9]*'`,
    ),
    check(
      "review_stablecoin_confirmations_public_record_check",
      sql`length(${table.publicRecordHash}) = 64 AND ${table.publicRecordHash} NOT GLOB '*[^a-f0-9]*' AND length(${table.receiptReference}) BETWEEN 16 AND 96 AND ${table.receiptReference} NOT GLOB '*[^A-Z0-9-]*'`,
    ),
    check(
      "review_stablecoin_confirmations_time_check",
      sql`${table.blockTimestamp} >= 0 AND ${table.termsAcceptedAt} >= 0 AND ${table.confirmedAt} >= ${table.blockTimestamp} AND ${table.recordedAt} >= ${table.confirmedAt}`,
    ),
    check(
      "review_stablecoin_confirmations_origin_check",
      sql`(${table.recordKind} = 'exact_match' AND ${table.reconciliationCaseId} IS NULL AND ${table.recordedByType} = 'verifier' AND ${table.recordedByEmail} IS NULL AND ${table.publicRecordHash} = ${table.evidenceHash} AND ${table.expectedAsset} = ${table.receivedAsset} AND lower(${table.expectedTokenContract}) = lower(${table.receivedTokenContract}) AND ${table.expectedAmountAtomic} = ${table.receivedAmountAtomic}) OR (${table.recordKind} = 'reconciliation' AND ${table.reconciliationCaseId} IS NOT NULL AND ${table.recordedByType} = 'operator' AND length(${table.recordedByEmail}) BETWEEN 3 AND 320 AND ${table.recordedByEmail} LIKE '%@%')`,
    ),
    uniqueIndex("review_stablecoin_confirmations_order_phase_unique").on(
      table.reviewOrderId,
      table.phase,
    ),
    uniqueIndex("review_stablecoin_confirmations_intent_unique").on(
      table.paymentIntentId,
    ),
    uniqueIndex("review_stablecoin_confirmations_claim_unique").on(
      table.paymentClaimId,
    ),
    uniqueIndex("review_stablecoin_confirmations_transaction_unique").on(
      table.transactionHash,
    ),
    uniqueIndex("review_stablecoin_confirmations_reconciliation_unique")
      .on(table.reconciliationCaseId)
      .where(sql`${table.reconciliationCaseId} IS NOT NULL`),
    uniqueIndex("review_stablecoin_confirmations_public_record_unique").on(
      table.publicRecordHash,
    ),
    uniqueIndex("review_stablecoin_confirmations_receipt_reference_unique").on(
      table.receiptReference,
    ),
    index("review_stablecoin_confirmations_order_confirmed_idx").on(
      table.reviewOrderId,
      table.confirmedAt,
    ),
    index("review_stablecoin_confirmations_block_log_idx").on(
      table.blockNumber,
      table.logIndex,
    ),
  ],
);

export const paymentVerifierHealth = sqliteTable(
  "payment_verifier_health",
  {
    id: integer("id").primaryKey(),
    configurationHash: text("configuration_hash").notNull(),
    configuredEndpointCount: integer("configured_endpoint_count").notNull(),
    healthyEndpointCount: integer("healthy_endpoint_count").notNull(),
    latestBlock: text("latest_block"),
    state: text("state").notNull(),
    failureCode: text("failure_code"),
    checkedAt: integer("checked_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("payment_verifier_health_singleton_check", sql`${table.id} = 1`),
    check(
      "payment_verifier_health_state_check",
      sql`${table.state} IN ('healthy', 'unavailable')`,
    ),
    check(
      "payment_verifier_health_endpoint_check",
      sql`${table.configuredEndpointCount} BETWEEN 0 AND 3 AND ${table.healthyEndpointCount} BETWEEN 0 AND ${table.configuredEndpointCount}`,
    ),
  ],
);

export const reviewDeliverables = sqliteTable(
  "review_deliverables",
  {
    id: text("id").primaryKey(),
    reviewOrderId: text("review_order_id").notNull().references(
      () => reviewOrders.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").notNull(),
    state: text("state").notNull().default("upload_pending"),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageEtag: text("storage_etag"),
    storageVersionId: text("storage_version_id"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: integer("created_at").notNull(),
    uploadedAt: integer("uploaded_at"),
    releasedAt: integer("released_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    check("review_deliverables_kind_check", sql`${table.kind} IN ('final_report', 'evidence_archive', 'manifest')`),
    check("review_deliverables_state_check", sql`${table.state} IN ('upload_pending', 'available', 'released', 'revoked')`),
    check("review_deliverables_name_check", sql`length(${table.fileName}) BETWEEN 1 AND 180 AND ${table.fileName} NOT LIKE '%/%' AND ${table.fileName} NOT LIKE '%\\%'`),
    check("review_deliverables_content_type_check", sql`${table.contentType} IN ('application/pdf', 'application/zip', 'application/json', 'text/plain')`),
    check("review_deliverables_size_check", sql`${table.sizeBytes} BETWEEN 1 AND 104857600`),
    check("review_deliverables_sha_check", sql`length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^a-f0-9]*'`),
    check("review_deliverables_version_check", sql`${table.storageVersionId} IS NULL OR length(${table.storageVersionId}) BETWEEN 1 AND 1024`),
    uniqueIndex("review_deliverables_object_key_unique").on(table.objectKey),
    uniqueIndex("review_deliverables_active_kind_unique")
      .on(table.reviewOrderId, table.kind)
      .where(sql`${table.state} != 'revoked'`),
    index("review_deliverables_order_state_idx").on(
      table.reviewOrderId,
      table.state,
      table.createdAt,
    ),
  ],
);
