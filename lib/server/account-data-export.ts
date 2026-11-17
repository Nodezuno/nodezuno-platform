import { createNodezunoAuth } from "./auth.ts";
import { getDatabase } from "./database-binding.ts";
import { HttpProblem } from "./http.ts";

export const ACCOUNT_DATA_EXPORT_MAX_BYTES = 1024 * 1024;
export const ACCOUNT_DATA_EXPORT_FRESH_SESSION_MS = 15 * 60 * 1000;
export const ACCOUNT_DATA_EXPORT_RATE_LIMIT = 3;
export const ACCOUNT_DATA_EXPORT_RATE_WINDOW_MS = 60 * 60 * 1000;

export const accountDataExportLimits = {
  linkedAccounts: 20,
  evmWallets: 50,
  solanaWallets: 50,
  sessions: 50,
  workspaces: 20,
  memberships: 20,
  services: 200,
  apiKeys: 200,
  accessPolicies: 200,
  auditEvents: 500,
  usage: 500,
  submissions: 50,
  reviewOrders: 50,
  stablecoinPaymentIntents: 100,
  stablecoinPaymentClaims: 100,
  stablecoinPaymentReconciliations: 100,
  stablecoinPaymentConfirmations: 100,
} as const;

export type FreshApplicationAccountSession = {
  accountId: string;
  currentSessionId: string;
};

type AccountRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: number | boolean;
  profileImageRecorded: number | boolean;
  createdAt: number;
  updatedAt: number;
};

type LinkedAccountRow = {
  providerId: string;
  createdAt: number;
  updatedAt: number;
};

type EvmWalletRow = {
  address: string;
  chainId: number;
  isPrimary: number | boolean;
  createdAt: number;
};

type SolanaWalletRow = {
  address: string;
  isPrimary: number | boolean;
  createdAt: number;
};

type SessionRow = {
  id: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  networkAddressRecorded: number | boolean;
  userAgentRecorded: number | boolean;
};

type MembershipRow = {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  workspaceStatus: string;
  role: string;
  memberCreatedAt: number;
  memberUpdatedAt: number;
  workspaceCreatedAt: number;
  workspaceUpdatedAt: number;
};

type ServiceRow = {
  id: string;
  workspaceId: string;
  product: string;
  name: string;
  environment: string;
  network: string;
  region: string;
  status: string;
  endpointPath: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

type ApiKeyRow = {
  id: string;
  workspaceId: string;
  serviceId: string | null;
  name: string;
  prefix: string;
  lastFour: string;
  scopesJson: string;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number;
  revokedAt: number | null;
};

type AccessPolicyRow = {
  serviceId: string;
  workspaceId: string;
  revision: number;
  allowedOriginCount: number;
  allowedIpRangeCount: number;
  allowedMethodCount: number;
  createdAt: number;
  updatedAt: number;
};

type AuditEventRow = {
  id: string;
  workspaceId: string;
  actorKind: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: number;
};

type UsageRow = {
  workspaceId: string;
  serviceId: string;
  apiKeyId: string;
  firstBucketStartedAt: number;
  lastBucketStartedAt: number;
  quotaUnits: number;
  quotaLimit: number;
  requests: number;
  calls: number;
  errors: number;
  upstreamFailures: number;
  latencyMsTotal: number;
  bytesIn: number;
  bytesOut: number;
  lastRequestAt: number | null;
  updatedAt: number;
};

type SubmissionRow = {
  id: string;
  kind: string;
  status: string;
  name: string;
  email: string;
  company: string;
  teamType: string;
  message: string;
  sourcePath: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

type ReviewOrderExportRow = {
  id: string;
  reference: string;
  status: string;
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
  sourcePath: string;
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
  telegramUsername: string | null;
  nextAction: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

type StablecoinPaymentIntentExportRow = {
  id: string;
  reviewOrderId: string;
  phase: string;
  state: string;
  asset: string;
  chainId: number;
  network: string;
  tokenContract: string;
  tokenDecimals: number;
  recipientAddress: string;
  obligationAmount: number;
  obligationCurrency: string;
  tokenAmountAtomic: string;
  tokenAmountDisplay: string;
  referenceUnits: number;
  proposalVersion: number;
  termsAcceptedAt: number;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  verifiedAt: number | null;
  cancelledAt: number | null;
};

type StablecoinPaymentClaimExportRow = {
  id: string;
  paymentIntentId: string;
  transactionHash: string;
  telegramUsername: string;
  state: string;
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
  submittedAt: number;
  verifiedAt: number | null;
  rejectedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type StablecoinPaymentReconciliationExportRow = {
  id: string;
  reviewOrderId: string;
  paymentIntentId: string;
  paymentClaimId: string;
  transactionHash: string;
  caseType: string;
  state: string;
  phase: string;
  expectedAsset: string;
  expectedTokenContract: string;
  expectedRecipientAddress: string;
  expectedAmountAtomic: string;
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
  resolutionCode: string | null;
  resolutionNote: string | null;
  resolutionDecidedAt: number | null;
  resolvedAt: number | null;
  openedAt: number;
  updatedAt: number;
};

type StablecoinPaymentConfirmationExportRow = {
  id: string;
  reviewOrderId: string;
  paymentIntentId: string;
  paymentClaimId: string;
  reconciliationCaseId: string | null;
  recordKind: string;
  phase: string;
  expectedAsset: string;
  receivedAsset: string;
  receivedTokenContract: string;
  recipientAddress: string;
  senderAddress: string;
  expectedAmountAtomic: string;
  receivedAmountAtomic: string;
  obligationAmount: number;
  obligationCurrency: string;
  transactionHash: string;
  blockNumber: string;
  blockHash: string;
  logIndex: string;
  blockTimestamp: number;
  confirmationsObserved: number;
  confirmationsRequired: number;
  rpcAgreementCount: number;
  evidenceHash: string;
  publicRecordHash: string;
  receiptReference: string;
  confirmedAt: number;
  recordedAt: number;
};

type BoundedRows<T> = {
  rows: T[];
  truncated: boolean;
};

export type AccountDataExport = Awaited<
  ReturnType<typeof buildAccountDataExport>
>;

export async function requireFreshApplicationAccountSession(
  request: Request,
  options: {
    database?: D1Database;
    now?: number;
  } = {},
): Promise<FreshApplicationAccountSession> {
  const now = options.now ?? Date.now();
  const auth = await createNodezunoAuth(request, options.database);
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user || !result.session) {
    throw new HttpProblem(
      401,
      "authentication_required",
      "Sign in with a Nodezuno account before downloading account data.",
    );
  }

  const createdAt = new Date(result.session.createdAt).getTime();
  if (
    !Number.isFinite(createdAt) ||
    createdAt < 0 ||
    createdAt > now + 60_000 ||
    now - createdAt >= ACCOUNT_DATA_EXPORT_FRESH_SESSION_MS
  ) {
    throw new HttpProblem(
      403,
      "session_not_fresh",
      "Sign in again before downloading account data.",
    );
  }

  return {
    accountId: result.user.id,
    currentSessionId: result.session.id,
  };
}

export async function buildAccountDataExport(options: {
  accountId: string;
  currentSessionId: string;
  database?: D1Database;
  exportedAt?: number;
}) {
  const database = options.database ?? (await getDatabase());
  const exportedAt = options.exportedAt ?? Date.now();
  const account = await database
    .prepare(
      `SELECT id, name, email, email_verified AS emailVerified,
              CASE WHEN image IS NULL THEN 0 ELSE 1 END
                AS profileImageRecorded,
              created_at AS createdAt, updated_at AS updatedAt
       FROM auth_users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(options.accountId)
    .first<AccountRow>();
  if (!account) {
    throw new HttpProblem(
      401,
      "authentication_required",
      "The authenticated Nodezuno account is no longer available.",
    );
  }

  const email = account.email.trim().toLowerCase();
  const accountId = account.id;
  const statements = [
    database
      .prepare(
        `SELECT provider_id AS providerId,
                created_at AS createdAt, updated_at AS updatedAt
         FROM auth_accounts
         WHERE user_id = ?
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.linkedAccounts + 1),
    database
      .prepare(
        `SELECT address, chain_id AS chainId, is_primary AS isPrimary,
                created_at AS createdAt
         FROM auth_wallet_addresses
         WHERE user_id = ?
         ORDER BY is_primary DESC, created_at ASC, id ASC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.evmWallets + 1),
    database
      .prepare(
        `SELECT address, is_primary AS isPrimary,
                created_at AS createdAt
         FROM auth_solana_wallets
         WHERE user_id = ?
         ORDER BY is_primary DESC, created_at ASC, id ASC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.solanaWallets + 1),
    database
      .prepare(
        `SELECT id, expires_at AS expiresAt, created_at AS createdAt,
                updated_at AS updatedAt,
                CASE WHEN ip_address IS NULL THEN 0 ELSE 1 END
                  AS networkAddressRecorded,
                CASE WHEN user_agent IS NULL THEN 0 ELSE 1 END
                  AS userAgentRecorded
         FROM auth_sessions
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.sessions + 1),
    database
      .prepare(
        `SELECT m.id, m.workspace_id AS workspaceId,
                w.slug AS workspaceSlug, w.name AS workspaceName,
                w.status AS workspaceStatus, m.role,
                m.created_at AS memberCreatedAt,
                m.updated_at AS memberUpdatedAt,
                w.created_at AS workspaceCreatedAt,
                w.updated_at AS workspaceUpdatedAt
         FROM developer_workspace_members m
         JOIN developer_workspaces w ON w.id = m.workspace_id
         WHERE m.account_id = ?
            OR (m.account_id IS NULL AND m.email = ?)
         ORDER BY CASE m.role
           WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
           w.created_at ASC, m.id ASC
         LIMIT ?`,
      )
      .bind(accountId, email, accountDataExportLimits.memberships + 1),
    database
      .prepare(
        `SELECT s.id, s.workspace_id AS workspaceId, s.product, s.name,
                s.environment, s.network, s.region, s.status,
                s.endpoint_path AS endpointPath,
                s.created_at AS createdAt, s.updated_at AS updatedAt,
                s.archived_at AS archivedAt
         FROM developer_services s
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members scope
           WHERE scope.workspace_id = s.workspace_id
             AND (
               scope.account_id = ?
               OR (scope.account_id IS NULL AND scope.email = ?)
             )
         )
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT ?`,
      )
      .bind(accountId, email, accountDataExportLimits.services + 1),
    database
      .prepare(
        `SELECT k.id, k.workspace_id AS workspaceId,
                k.service_id AS serviceId, k.name, k.prefix,
                k.last_four AS lastFour, k.scopes_json AS scopesJson,
                k.created_at AS createdAt, k.last_used_at AS lastUsedAt,
                k.expires_at AS expiresAt, k.revoked_at AS revokedAt
         FROM developer_api_keys k
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members scope
           WHERE scope.workspace_id = k.workspace_id
             AND scope.role IN ('owner', 'admin')
             AND (
               scope.account_id = ?
               OR (scope.account_id IS NULL AND scope.email = ?)
             )
         )
         ORDER BY k.created_at DESC, k.id DESC
         LIMIT ?`,
      )
      .bind(accountId, email, accountDataExportLimits.apiKeys + 1),
    database
      .prepare(
        `SELECT p.service_id AS serviceId,
                p.workspace_id AS workspaceId, p.revision,
                json_array_length(p.allowed_origins_json)
                  AS allowedOriginCount,
                json_array_length(p.allowed_ip_cidrs_json)
                  AS allowedIpRangeCount,
                json_array_length(p.allowed_methods_json)
                  AS allowedMethodCount,
                p.created_at AS createdAt, p.updated_at AS updatedAt
         FROM developer_rpc_access_policies p
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members scope
           WHERE scope.workspace_id = p.workspace_id
             AND (
               scope.account_id = ?
               OR (scope.account_id IS NULL AND scope.email = ?)
             )
         )
         ORDER BY p.updated_at DESC, p.service_id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        email,
        accountDataExportLimits.accessPolicies + 1,
      ),
    database
      .prepare(
        `SELECT e.id, e.workspace_id AS workspaceId,
                CASE
                  WHEN e.actor_account_id = ? THEN 'caller'
                  WHEN e.api_key_id IS NOT NULL THEN 'api_key'
                  WHEN e.actor_account_id IS NOT NULL
                    OR e.actor_email IS NOT NULL THEN 'workspace_member'
                  ELSE 'system'
                END AS actorKind,
                e.action, e.entity_type AS entityType,
                e.entity_id AS entityId, e.created_at AS createdAt
         FROM developer_audit_events e
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members scope
           WHERE scope.workspace_id = e.workspace_id
             AND scope.role IN ('owner', 'admin')
             AND (
               scope.account_id = ?
               OR (scope.account_id IS NULL AND scope.email = ?)
             )
         )
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        accountId,
        email,
        accountDataExportLimits.auditEvents + 1,
      ),
    database
      .prepare(
        `SELECT u.workspace_id AS workspaceId,
                u.service_id AS serviceId, u.api_key_id AS apiKeyId,
                MIN(u.bucket_start) AS firstBucketStartedAt,
                MAX(u.bucket_start) AS lastBucketStartedAt,
                SUM(u.quota_units) AS quotaUnits,
                MAX(u.quota_limit) AS quotaLimit,
                SUM(u.request_count) AS requests,
                SUM(u.rpc_call_count) AS calls,
                SUM(u.error_count) AS errors,
                SUM(u.upstream_failure_count) AS upstreamFailures,
                SUM(u.latency_ms_total) AS latencyMsTotal,
                SUM(u.bytes_in) AS bytesIn,
                SUM(u.bytes_out) AS bytesOut,
                MAX(u.last_request_at) AS lastRequestAt,
                MAX(u.updated_at) AS updatedAt
         FROM ethereum_rpc_usage_buckets u
         WHERE EXISTS (
           SELECT 1
           FROM developer_workspace_members scope
           WHERE scope.workspace_id = u.workspace_id
             AND (
               scope.account_id = ?
               OR (scope.account_id IS NULL AND scope.email = ?)
             )
         )
         GROUP BY u.workspace_id, u.service_id, u.api_key_id
         ORDER BY MAX(u.updated_at) DESC, u.service_id DESC, u.api_key_id DESC
         LIMIT ?`,
      )
      .bind(accountId, email, accountDataExportLimits.usage + 1),
    database
      .prepare(
        `SELECT id, kind, status, name, email, company,
                team_type AS teamType, message,
                source_path AS sourcePath, created_at AS createdAt,
                updated_at AS updatedAt, expires_at AS expiresAt
         FROM submissions
         WHERE submitted_by_account_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.submissions + 1),
    database
      .prepare(
        `SELECT id, reference, status, contact_name AS contactName,
                work_email AS workEmail, company, website,
                team_type AS teamType, target_chain AS targetChain,
                audited_baseline AS auditedBaseline,
                proposed_release AS proposedRelease,
                change_summary AS changeSummary,
                affected_contracts AS affectedContracts,
                changed_lines AS changedLines,
                artifact_ready_date AS artifactReadyDate,
                target_release_date AS targetReleaseDate,
                public_links AS publicLinks, source_path AS sourcePath,
                total_amount AS totalAmount, deposit_amount AS depositAmount,
                balance_amount AS balanceAmount, currency,
                proposal_version AS proposalVersion,
                proposal_title AS proposalTitle,
                proposal_scope AS proposalScope,
                proposal_exclusions AS proposalExclusions,
                proposal_reviewer AS proposalReviewer,
                proposal_issued_at AS proposalIssuedAt,
                proposal_expires_at AS proposalExpiresAt,
                proposal_accepted_at AS proposalAcceptedAt,
                telegram_username AS telegramUsername,
                next_action AS nextAction, created_at AS createdAt,
                updated_at AS updatedAt, expires_at AS expiresAt
         FROM review_orders
         WHERE submitted_by_account_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(accountId, accountDataExportLimits.reviewOrders + 1),
    database
      .prepare(
        `SELECT i.id, i.review_order_id AS reviewOrderId, i.phase,
                i.state, i.asset, i.chain_id AS chainId, i.network,
                i.token_contract AS tokenContract,
                i.token_decimals AS tokenDecimals,
                i.recipient_address AS recipientAddress,
                i.obligation_amount AS obligationAmount,
                i.obligation_currency AS obligationCurrency,
                i.token_amount_atomic AS tokenAmountAtomic,
                i.token_amount_display AS tokenAmountDisplay,
                i.reference_units AS referenceUnits,
                i.proposal_version AS proposalVersion,
                i.terms_accepted_at AS termsAcceptedAt,
                i.expires_at AS expiresAt, i.created_at AS createdAt,
                i.updated_at AS updatedAt, i.verified_at AS verifiedAt,
                i.cancelled_at AS cancelledAt
         FROM review_stablecoin_payment_intents i
         JOIN review_orders o ON o.id = i.review_order_id
         WHERE o.submitted_by_account_id = ?
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        accountDataExportLimits.stablecoinPaymentIntents + 1,
      ),
    database
      .prepare(
        `SELECT c.id, c.payment_intent_id AS paymentIntentId,
                c.transaction_hash AS transactionHash,
                c.telegram_username AS telegramUsername, c.state,
                c.failure_code AS failureCode,
                c.observed_sender AS observedSender,
                c.observed_token_contract AS observedTokenContract,
                c.observed_recipient_address AS observedRecipientAddress,
                c.observed_amount_atomic AS observedAmountAtomic,
                c.block_number AS blockNumber, c.block_hash AS blockHash,
                c.log_index AS logIndex,
                c.block_timestamp AS blockTimestamp,
                c.confirmations, c.evidence_hash AS evidenceHash,
                c.rpc_agreement_count AS rpcAgreementCount,
                c.submitted_at AS submittedAt,
                c.verified_at AS verifiedAt, c.rejected_at AS rejectedAt,
                c.created_at AS createdAt, c.updated_at AS updatedAt
         FROM review_stablecoin_payment_claims c
         JOIN review_stablecoin_payment_intents i
           ON i.id = c.payment_intent_id
         JOIN review_orders o ON o.id = i.review_order_id
         WHERE o.submitted_by_account_id = ?
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        accountDataExportLimits.stablecoinPaymentClaims + 1,
      ),
    database
      .prepare(
        `SELECT r.id, r.review_order_id AS reviewOrderId,
                r.payment_intent_id AS paymentIntentId,
                r.payment_claim_id AS paymentClaimId,
                r.transaction_hash AS transactionHash,
                r.case_type AS caseType, r.state, r.phase,
                r.expected_asset AS expectedAsset,
                r.expected_token_contract AS expectedTokenContract,
                r.expected_recipient_address AS expectedRecipientAddress,
                r.expected_amount_atomic AS expectedAmountAtomic,
                r.observed_sender_address AS observedSenderAddress,
                r.observed_token_contract AS observedTokenContract,
                r.observed_recipient_address AS observedRecipientAddress,
                r.observed_amount_atomic AS observedAmountAtomic,
                r.block_number AS blockNumber, r.block_hash AS blockHash,
                r.log_index AS logIndex,
                r.block_timestamp AS blockTimestamp,
                r.confirmations_observed AS confirmationsObserved,
                r.confirmations_required AS confirmationsRequired,
                r.rpc_agreement_count AS rpcAgreementCount,
                r.evidence_hash AS evidenceHash,
                r.resolution_code AS resolutionCode,
                r.resolution_note AS resolutionNote,
                r.resolution_decided_at AS resolutionDecidedAt,
                r.resolved_at AS resolvedAt, r.opened_at AS openedAt,
                r.updated_at AS updatedAt
         FROM review_stablecoin_reconciliation_cases r
         JOIN review_orders o ON o.id = r.review_order_id
         WHERE o.submitted_by_account_id = ?
         ORDER BY r.opened_at DESC, r.id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        accountDataExportLimits.stablecoinPaymentReconciliations + 1,
      ),
    database
      .prepare(
        `SELECT p.id, p.review_order_id AS reviewOrderId,
                p.payment_intent_id AS paymentIntentId,
                p.payment_claim_id AS paymentClaimId,
                p.reconciliation_case_id AS reconciliationCaseId,
                p.record_kind AS recordKind, p.phase,
                p.expected_asset AS expectedAsset,
                p.received_asset AS receivedAsset,
                p.received_token_contract AS receivedTokenContract,
                p.recipient_address AS recipientAddress,
                p.sender_address AS senderAddress,
                p.expected_amount_atomic AS expectedAmountAtomic,
                p.received_amount_atomic AS receivedAmountAtomic,
                p.obligation_amount AS obligationAmount,
                p.obligation_currency AS obligationCurrency,
                p.transaction_hash AS transactionHash,
                p.block_number AS blockNumber, p.block_hash AS blockHash,
                p.log_index AS logIndex, p.block_timestamp AS blockTimestamp,
                p.confirmations_observed AS confirmationsObserved,
                p.confirmations_required AS confirmationsRequired,
                p.rpc_agreement_count AS rpcAgreementCount,
                p.evidence_hash AS evidenceHash,
                p.public_record_hash AS publicRecordHash,
                p.receipt_reference AS receiptReference,
                p.confirmed_at AS confirmedAt, p.recorded_at AS recordedAt
         FROM review_stablecoin_payment_confirmations p
         JOIN review_orders o ON o.id = p.review_order_id
         WHERE o.submitted_by_account_id = ?
         ORDER BY p.confirmed_at DESC, p.id DESC
         LIMIT ?`,
      )
      .bind(
        accountId,
        accountDataExportLimits.stablecoinPaymentConfirmations + 1,
      ),
  ];
  const results = await database.batch(statements);

  const linkedAccounts = boundedRows<LinkedAccountRow>(
    results[0]?.results,
    accountDataExportLimits.linkedAccounts,
  );
  const evmWallets = boundedRows<EvmWalletRow>(
    results[1]?.results,
    accountDataExportLimits.evmWallets,
  );
  const solanaWallets = boundedRows<SolanaWalletRow>(
    results[2]?.results,
    accountDataExportLimits.solanaWallets,
  );
  const sessions = boundedRows<SessionRow>(
    results[3]?.results,
    accountDataExportLimits.sessions,
  );
  const memberships = boundedRows<MembershipRow>(
    results[4]?.results,
    accountDataExportLimits.memberships,
  );
  const services = boundedRows<ServiceRow>(
    results[5]?.results,
    accountDataExportLimits.services,
  );
  const apiKeys = boundedRows<ApiKeyRow>(
    results[6]?.results,
    accountDataExportLimits.apiKeys,
  );
  const accessPolicies = boundedRows<AccessPolicyRow>(
    results[7]?.results,
    accountDataExportLimits.accessPolicies,
  );
  const auditEvents = boundedRows<AuditEventRow>(
    results[8]?.results,
    accountDataExportLimits.auditEvents,
  );
  const usage = boundedRows<UsageRow>(
    results[9]?.results,
    accountDataExportLimits.usage,
  );
  const submissions = boundedRows<SubmissionRow>(
    results[10]?.results,
    accountDataExportLimits.submissions,
  );
  const reviewOrders = boundedRows<ReviewOrderExportRow>(
    results[11]?.results,
    accountDataExportLimits.reviewOrders,
  );
  const stablecoinPaymentIntents = boundedRows<StablecoinPaymentIntentExportRow>(
    results[12]?.results,
    accountDataExportLimits.stablecoinPaymentIntents,
  );
  const stablecoinPaymentClaims = boundedRows<StablecoinPaymentClaimExportRow>(
    results[13]?.results,
    accountDataExportLimits.stablecoinPaymentClaims,
  );
  const stablecoinPaymentReconciliations = boundedRows<StablecoinPaymentReconciliationExportRow>(
    results[14]?.results,
    accountDataExportLimits.stablecoinPaymentReconciliations,
  );
  const stablecoinPaymentConfirmations = boundedRows<StablecoinPaymentConfirmationExportRow>(
    results[15]?.results,
    accountDataExportLimits.stablecoinPaymentConfirmations,
  );
  const syntheticEmail = isSyntheticWalletEmail(email);

  return {
    schemaVersion: "5",
    exportedAt: isoTimestamp(exportedAt),
    account: {
      id: account.id,
      name: account.name,
      email: syntheticEmail ? null : email,
      emailVerified: Boolean(account.emailVerified),
      profileImageRecorded: Boolean(account.profileImageRecorded),
      createdAt: isoTimestamp(account.createdAt),
      updatedAt: isoTimestamp(account.updatedAt),
    },
    linkedAccounts: linkedAccounts.rows.map((row) => ({
      provider: row.providerId,
      linkedAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
    })),
    wallets: {
      evm: evmWallets.rows.map((row) => ({
        address: row.address,
        chainId: safeInteger(row.chainId),
        primary: Boolean(row.isPrimary),
        linkedAt: isoTimestamp(row.createdAt),
      })),
      solana: solanaWallets.rows.map((row) => ({
        address: row.address,
        primary: Boolean(row.isPrimary),
        linkedAt: isoTimestamp(row.createdAt),
      })),
    },
    sessions: sessions.rows.map((row) => ({
      id: row.id,
      current: row.id === options.currentSessionId,
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
      expiresAt: isoTimestamp(row.expiresAt),
      networkAddressRecorded: Boolean(row.networkAddressRecorded),
      userAgentRecorded: Boolean(row.userAgentRecorded),
    })),
    workspaces: memberships.rows.map((row) => ({
      id: row.workspaceId,
      slug: row.workspaceSlug,
      name: row.workspaceName,
      status: row.workspaceStatus,
      createdAt: isoTimestamp(row.workspaceCreatedAt),
      updatedAt: isoTimestamp(row.workspaceUpdatedAt),
    })),
    memberships: memberships.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      role: row.role,
      state: "active",
      createdAt: isoTimestamp(row.memberCreatedAt),
      updatedAt: isoTimestamp(row.memberUpdatedAt),
    })),
    services: services.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      product: row.product,
      name: row.name,
      environment: row.environment,
      network: row.network,
      region: row.region,
      status: row.status,
      endpointPath: row.endpointPath,
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
      archivedAt: optionalIsoTimestamp(row.archivedAt),
    })),
    apiKeys: apiKeys.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      serviceId: row.serviceId,
      name: row.name,
      prefix: row.prefix,
      lastFour: row.lastFour,
      scopes: parseStringArray(row.scopesJson),
      createdAt: isoTimestamp(row.createdAt),
      lastUsedAt: optionalIsoTimestamp(row.lastUsedAt),
      expiresAt: isoTimestamp(row.expiresAt),
      revokedAt: optionalIsoTimestamp(row.revokedAt),
    })),
    accessPolicies: accessPolicies.rows.map((row) => ({
      serviceId: row.serviceId,
      workspaceId: row.workspaceId,
      revision: safeInteger(row.revision),
      allowedOriginCount: safeInteger(row.allowedOriginCount),
      allowedIpRangeCount: safeInteger(row.allowedIpRangeCount),
      allowedMethodCount: safeInteger(row.allowedMethodCount),
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
    })),
    auditEvents: auditEvents.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      actor: row.actorKind,
      action: row.action,
      entity: {
        type: row.entityType,
        id: row.entityId,
      },
      createdAt: isoTimestamp(row.createdAt),
    })),
    usage: usage.rows.map((row) => ({
      workspaceId: row.workspaceId,
      serviceId: row.serviceId,
      apiKeyId: row.apiKeyId,
      firstBucketStartedAt: isoTimestamp(row.firstBucketStartedAt),
      lastBucketStartedAt: isoTimestamp(row.lastBucketStartedAt),
      quotaUnits: safeInteger(row.quotaUnits),
      quotaLimit: safeInteger(row.quotaLimit),
      requests: safeInteger(row.requests),
      calls: safeInteger(row.calls),
      errors: safeInteger(row.errors),
      upstreamFailures: safeInteger(row.upstreamFailures),
      latencyMsTotal: safeInteger(row.latencyMsTotal),
      bytesIn: safeInteger(row.bytesIn),
      bytesOut: safeInteger(row.bytesOut),
      lastRequestAt: optionalIsoTimestamp(row.lastRequestAt),
      updatedAt: isoTimestamp(row.updatedAt),
    })),
    submissions: submissions.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      name: row.name,
      email: row.email,
      company: row.company,
      teamType: row.teamType,
      message: row.message,
      sourcePath: row.sourcePath,
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
      retentionExpiresAt: isoTimestamp(row.expiresAt),
    })),
    reviewOrders: reviewOrders.rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      contactName: row.contactName,
      workEmail: row.workEmail,
      company: row.company,
      website: row.website,
      teamType: row.teamType,
      targetChain: row.targetChain,
      auditedBaseline: row.auditedBaseline,
      proposedRelease: row.proposedRelease,
      changeSummary: row.changeSummary,
      affectedContracts: safeInteger(row.affectedContracts),
      changedLines: row.changedLines === null ? null : safeInteger(row.changedLines),
      artifactReadyDate: row.artifactReadyDate,
      targetReleaseDate: row.targetReleaseDate,
      publicLinks: row.publicLinks,
      sourcePath: row.sourcePath,
      commercialTerms: {
        totalAmount: safeInteger(row.totalAmount),
        depositAmount: safeInteger(row.depositAmount),
        balanceAmount: safeInteger(row.balanceAmount),
        currency: row.currency,
      },
      proposal: row.proposalVersion === null ? null : {
        version: safeInteger(row.proposalVersion),
        title: row.proposalTitle,
        scope: row.proposalScope,
        exclusions: row.proposalExclusions,
        reviewer: row.proposalReviewer,
        issuedAt: optionalIsoTimestamp(row.proposalIssuedAt),
        expiresAt: optionalIsoTimestamp(row.proposalExpiresAt),
        acceptedAt: optionalIsoTimestamp(row.proposalAcceptedAt),
      },
      telegramUsername: row.telegramUsername,
      nextAction: row.nextAction,
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
      retentionExpiresAt: isoTimestamp(row.expiresAt),
    })),
    stablecoinPaymentIntents: stablecoinPaymentIntents.rows.map((row) => ({
      id: row.id,
      reviewOrderId: row.reviewOrderId,
      phase: row.phase,
      state: row.state,
      asset: row.asset,
      chainId: safeInteger(row.chainId),
      network: row.network,
      tokenContract: row.tokenContract,
      tokenDecimals: safeInteger(row.tokenDecimals),
      recipientAddress: row.recipientAddress,
      obligationAmount: safeInteger(row.obligationAmount),
      obligationCurrency: row.obligationCurrency,
      tokenAmountAtomic: row.tokenAmountAtomic,
      tokenAmountDisplay: row.tokenAmountDisplay,
      referenceUnits: safeInteger(row.referenceUnits),
      proposalVersion: safeInteger(row.proposalVersion),
      termsAcceptedAt: isoTimestamp(row.termsAcceptedAt),
      expiresAt: isoTimestamp(row.expiresAt),
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
      verifiedAt: optionalIsoTimestamp(row.verifiedAt),
      cancelledAt: optionalIsoTimestamp(row.cancelledAt),
    })),
    stablecoinPaymentClaims: stablecoinPaymentClaims.rows.map((row) => ({
      id: row.id,
      paymentIntentId: row.paymentIntentId,
      transactionHash: row.transactionHash,
      telegramUsername: row.telegramUsername,
      state: row.state,
      failureCode: row.failureCode,
      observedSender: row.observedSender,
      observedTokenContract: row.observedTokenContract,
      observedRecipientAddress: row.observedRecipientAddress,
      observedAmountAtomic: row.observedAmountAtomic,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      logIndex: row.logIndex,
      blockTimestamp: optionalIsoTimestamp(row.blockTimestamp),
      confirmations: safeInteger(row.confirmations),
      evidenceHash: row.evidenceHash,
      rpcAgreementCount: safeInteger(row.rpcAgreementCount),
      submittedAt: isoTimestamp(row.submittedAt),
      verifiedAt: optionalIsoTimestamp(row.verifiedAt),
      rejectedAt: optionalIsoTimestamp(row.rejectedAt),
      createdAt: isoTimestamp(row.createdAt),
      updatedAt: isoTimestamp(row.updatedAt),
    })),
    stablecoinPaymentReconciliations: stablecoinPaymentReconciliations.rows.map((row) => ({
      id: row.id,
      reviewOrderId: row.reviewOrderId,
      paymentIntentId: row.paymentIntentId,
      paymentClaimId: row.paymentClaimId,
      transactionHash: row.transactionHash,
      caseType: row.caseType,
      state: row.state,
      phase: row.phase,
      expected: {
        asset: row.expectedAsset,
        tokenContract: row.expectedTokenContract,
        recipientAddress: row.expectedRecipientAddress,
        amountAtomic: row.expectedAmountAtomic,
      },
      observed: {
        senderAddress: row.observedSenderAddress,
        tokenContract: row.observedTokenContract,
        recipientAddress: row.observedRecipientAddress,
        amountAtomic: row.observedAmountAtomic,
        blockNumber: row.blockNumber,
        blockHash: row.blockHash,
        logIndex: row.logIndex,
        blockTimestamp: optionalIsoTimestamp(row.blockTimestamp),
        confirmations: safeInteger(row.confirmationsObserved),
        confirmationsRequired: safeInteger(row.confirmationsRequired),
        rpcAgreementCount: safeInteger(row.rpcAgreementCount),
        evidenceHash: row.evidenceHash,
      },
      resolution: row.resolutionCode ? {
        code: row.resolutionCode,
        note: row.resolutionNote,
        decidedAt: optionalIsoTimestamp(row.resolutionDecidedAt),
        resolvedAt: optionalIsoTimestamp(row.resolvedAt),
      } : null,
      openedAt: isoTimestamp(row.openedAt),
      updatedAt: isoTimestamp(row.updatedAt),
    })),
    stablecoinPaymentConfirmations: stablecoinPaymentConfirmations.rows.map((row) => ({
      id: row.id,
      reviewOrderId: row.reviewOrderId,
      paymentIntentId: row.paymentIntentId,
      paymentClaimId: row.paymentClaimId,
      reconciliationCaseId: row.reconciliationCaseId,
      recordKind: row.recordKind,
      phase: row.phase,
      expectedAsset: row.expectedAsset,
      receivedAsset: row.receivedAsset,
      receivedTokenContract: row.receivedTokenContract,
      recipientAddress: row.recipientAddress,
      senderAddress: row.senderAddress,
      expectedAmountAtomic: row.expectedAmountAtomic,
      receivedAmountAtomic: row.receivedAmountAtomic,
      obligationAmount: safeInteger(row.obligationAmount),
      obligationCurrency: row.obligationCurrency,
      transactionHash: row.transactionHash,
      blockNumber: row.blockNumber,
      blockHash: row.blockHash,
      logIndex: row.logIndex,
      blockTimestamp: isoTimestamp(row.blockTimestamp),
      confirmations: safeInteger(row.confirmationsObserved),
      confirmationsRequired: safeInteger(row.confirmationsRequired),
      rpcAgreementCount: safeInteger(row.rpcAgreementCount),
      evidenceHash: row.evidenceHash,
      recordHash: row.publicRecordHash,
      receiptReference: row.receiptReference,
      confirmedAt: isoTimestamp(row.confirmedAt),
      recordedAt: isoTimestamp(row.recordedAt),
    })),
    bounds: {
      limits: accountDataExportLimits,
      truncated: {
        linkedAccounts: linkedAccounts.truncated,
        evmWallets: evmWallets.truncated,
        solanaWallets: solanaWallets.truncated,
        sessions: sessions.truncated,
        workspaces: memberships.truncated,
        memberships: memberships.truncated,
        services: services.truncated,
        apiKeys: apiKeys.truncated,
        accessPolicies: accessPolicies.truncated,
        auditEvents: auditEvents.truncated,
        usage: usage.truncated,
        submissions: submissions.truncated,
        reviewOrders: reviewOrders.truncated,
        stablecoinPaymentIntents: stablecoinPaymentIntents.truncated,
        stablecoinPaymentClaims: stablecoinPaymentClaims.truncated,
        stablecoinPaymentReconciliations: stablecoinPaymentReconciliations.truncated,
        stablecoinPaymentConfirmations: stablecoinPaymentConfirmations.truncated,
      },
    },
    redactions: {
      authenticationCredentials: true,
      apiKeyMaterial: true,
      networkAddresses: true,
      userAgents: true,
      auditDetails: true,
      serviceConfiguration: true,
      submissionSecurityMetadata: true,
      paymentVerificationWorkerLeases: true,
      paymentReconciliationOperatorIdentity: true,
      rpcEndpointConfiguration: true,
    },
  };
}

export function accountDataExportDownloadResponse(options: {
  data: AccountDataExport;
  requestId: string;
  rateLimitRemaining: number;
}): Response {
  const body = JSON.stringify(
    { data: options.data, requestId: options.requestId },
    null,
    2,
  );
  const bodyBytes = new TextEncoder().encode(body).byteLength;
  if (bodyBytes > ACCOUNT_DATA_EXPORT_MAX_BYTES) {
    throw new HttpProblem(
      503,
      "account_export_too_large",
      "The account export exceeds the safe download limit.",
    );
  }
  const date = options.data.exportedAt.slice(0, 10);
  return hardenAccountDataExportResponse(
    new Response(body, {
      status: 200,
      headers: {
        "Content-Disposition":
          `attachment; filename="nodezuno-account-export-${date}.json"`,
        "Content-Length": String(bodyBytes),
        "Content-Type": "application/json; charset=utf-8",
        "X-RateLimit-Limit": String(ACCOUNT_DATA_EXPORT_RATE_LIMIT),
        "X-RateLimit-Remaining": String(
          Math.max(0, options.rateLimitRemaining),
        ),
      },
    }),
  );
}

export function hardenAccountDataExportResponse(response: Response): Response {
  response.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; sandbox",
  );
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Vary", "Cookie, Origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function boundedRows<T>(
  value: unknown,
  limit: number,
): BoundedRows<T> {
  const rows = Array.isArray(value) ? (value as T[]) : [];
  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
  };
}

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpProblem(
      503,
      "account_export_unavailable",
      "Stored account metadata could not be exported safely.",
    );
  }
  return value;
}

function isoTimestamp(value: number): string {
  return new Date(safeInteger(value)).toISOString();
}

function optionalIsoTimestamp(value: number | null): string | null {
  return value === null ? null : isoTimestamp(value);
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length <= 20 &&
      parsed.every(
        (item) => typeof item === "string" && item.length <= 128,
      )
    ) {
      return parsed;
    }
  } catch {
    // Invalid stored metadata fails closed below.
  }
  throw new HttpProblem(
    503,
    "account_export_unavailable",
    "Stored account metadata could not be exported safely.",
  );
}

function isSyntheticWalletEmail(email: string): boolean {
  return (
    email.endsWith("@evm.wallet.nodezuno.invalid") ||
    email.endsWith("@sol.wallet.nodezuno.invalid")
  );
}
