import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REVIEWED_LEGACY_MIGRATION_CHECKSUMS = new Map([
  [
    "0002_next_guardsmen.sql",
    new Set([
      "2d4cfdd2863c6365fd8d31e90ae2069284dbecb95a648a543b5430d117470429",
    ]),
  ],
]);

const CONTRACT_MIGRATIONS = new Set([
  "0024_remove_legacy_provider_payments.sql",
]);

const REQUIRED_TABLES = [
  "admin_audit_events",
  "chains",
  "newsletter_subscriptions",
  "notification_outbox",
  "rate_limit_windows",
  "status_incident_updates",
  "status_incidents",
  "status_services",
  "submission_events",
  "submissions",
];
export const BASELINE_SCHEMA_REQUIREMENTS = {
  admin_audit_events: [
    "id",
    "actor_email",
    "action",
    "entity_type",
    "entity_id",
    "before_json",
    "after_json",
    "created_at",
  ],
  chains: [
    "slug",
    "name",
    "family",
    "finality_model",
    "support_stage",
    "capabilities_json",
    "tone",
    "sort_order",
    "visible",
    "verified_at",
    "updated_at",
  ],
  newsletter_subscriptions: [
    "id",
    "email",
    "email_hash",
    "name",
    "state",
    "source_path",
    "consent_version",
    "consented_at",
    "unsubscribe_token_hash",
    "created_at",
    "updated_at",
    "unsubscribed_at",
  ],
  notification_outbox: [
    "id",
    "topic",
    "entity_id",
    "state",
    "attempts",
    "payload_json",
    "available_at",
    "last_error",
    "created_at",
    "updated_at",
  ],
  rate_limit_windows: [
    "id",
    "scope",
    "subject_hash",
    "window_start",
    "count",
    "expires_at",
  ],
  status_incident_updates: [
    "id",
    "incident_id",
    "state",
    "message",
    "created_at",
  ],
  status_incidents: [
    "id",
    "slug",
    "title",
    "severity",
    "state",
    "impact",
    "started_at",
    "resolved_at",
    "created_at",
    "updated_at",
  ],
  status_services: [
    "slug",
    "name",
    "description",
    "state",
    "sort_order",
    "visible",
    "updated_at",
  ],
  submission_events: [
    "id",
    "submission_id",
    "event_type",
    "actor_email",
    "detail_json",
    "created_at",
  ],
  submissions: [
    "id",
    "kind",
    "status",
    "name",
    "email",
    "email_hash",
    "company",
    "team_type",
    "message",
    "source_path",
    "metadata_json",
    "consent_version",
    "consented_at",
    "submitted_by_email",
    "idempotency_key",
    "request_hash",
    "ip_hash",
    "user_agent_hash",
    "created_at",
    "updated_at",
    "expires_at",
  ],
};
const BASELINE_REQUIRED_INDEXES = [
  "admin_audit_actor_created_idx",
  "admin_audit_entity_created_idx",
  "chains_name_unique",
  "chains_visible_sort_idx",
  "newsletter_subscriptions_email_unique",
  "newsletter_subscriptions_state_created_idx",
  "notification_outbox_topic_entity_unique",
  "notification_outbox_state_available_idx",
  "rate_limit_scope_subject_window_unique",
  "rate_limit_expiry_idx",
  "status_incident_updates_incident_created_idx",
  "status_incidents_slug_unique",
  "status_incidents_state_started_idx",
  "status_services_visible_sort_idx",
  "submission_events_received_unique",
  "submission_events_submission_created_idx",
  "submissions_kind_idempotency_unique",
  "submissions_status_created_idx",
  "submissions_email_created_idx",
  "submissions_expiry_idx",
];

export async function migrateD1(options = {}) {
  const configuration = readConfiguration(options.environment ?? process.env);
  const query = options.query ?? createD1Query(configuration);
  const migrationDirectory =
    options.migrationDirectory ?? path.resolve("drizzle");

  await query({
    sql: `CREATE TABLE IF NOT EXISTS nodezuno_schema_migrations (
      filename TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      mode TEXT NOT NULL
    )`,
  });

  const migrationFiles = (await readdir(migrationDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  if (migrationFiles.length === 0) {
    throw new Error("No SQL migrations were found.");
  }
  assertMigrationSequence(migrationFiles);

  const appliedResult = await query({
    sql: "SELECT filename, checksum FROM nodezuno_schema_migrations ORDER BY filename",
  });
  const applied = new Map(
    resultRows(appliedResult).map((row) => [
      String(row.filename),
      String(row.checksum),
    ]),
  );
  const missingAppliedFiles = [...applied.keys()].filter(
    (filename) => !migrationFiles.includes(filename),
  );
  if (missingAppliedFiles.length > 0) {
    throw new Error(
      `Applied migration files are missing from the repository: ${missingAppliedFiles.join(", ")}.`,
    );
  }
  const installationHadMigrationHistory = applied.size > 0;
  let existingSchemaWasBaselined = false;
  const initialMigration = migrationFiles[0];

  for (const filename of migrationFiles) {
    const sql = await readFile(
      path.join(migrationDirectory, filename),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previousChecksum = applied.get(filename);
    if (previousChecksum) {
      if (previousChecksum !== checksum) {
        const reviewed =
          REVIEWED_LEGACY_MIGRATION_CHECKSUMS.get(filename)?.has(
            previousChecksum,
          ) === true;
        if (!reviewed) {
          throw new Error(
            `Migration ${filename} has changed since it was applied.`,
          );
        }
        await query({
          sql: `UPDATE nodezuno_schema_migrations
            SET checksum = ?
            WHERE filename = ? AND checksum = ?`,
          params: [checksum, filename, previousChecksum],
        });
        applied.set(filename, checksum);
      }
      continue;
    }

    const appliedAt = String(Date.now());
    const canBeInitialBaseline =
      applied.size === 0 &&
      filename === initialMigration &&
      filename.startsWith("0000_");
    if (canBeInitialBaseline) {
      const existingSchema = await hasCompleteExistingSchema(query);
      if (existingSchema) {
        if (!configuration.allowExistingBaseline) {
          throw new Error(
            "A healthy existing schema was detected. Set " +
              "NODEZUNO_ALLOW_SCHEMA_BASELINE=true for the reviewed " +
              "initial cutover, then return it to false.",
          );
        }
        await query({
          sql: `INSERT INTO nodezuno_schema_migrations
            (filename, checksum, applied_at, mode)
            VALUES (?, ?, ?, ?)`,
          params: [filename, checksum, appliedAt, "baseline"],
        });
        applied.set(filename, checksum);
        existingSchemaWasBaselined = true;
        continue;
      }
    }

    if (
      CONTRACT_MIGRATIONS.has(filename) &&
      (installationHadMigrationHistory || existingSchemaWasBaselined) &&
      !configuration.allowContractMigrations
    ) {
      throw new Error(
        `Contract migration ${filename} requires an approved maintenance cutover. ` +
          "Set NODEZUNO_ALLOW_CONTRACT_MIGRATIONS=true only while following docs/MIGRATIONS.md; " +
          "the standard deployment path must keep it false.",
      );
    }

    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => ({ sql: statement }));
    statements.push({
      sql: `INSERT INTO nodezuno_schema_migrations
        (filename, checksum, applied_at, mode)
        VALUES (?, ?, ?, ?)`,
      params: [filename, checksum, appliedAt, "migration"],
    });
    await query({ batch: statements });
    applied.set(filename, checksum);
  }

  const verification = await verifySchema(query);
  return {
    migrations: migrationFiles.length,
    services: verification.serviceCount,
    chains: verification.chainCount,
  };
}

export function createD1Query(configuration) {
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${configuration.accountId}/d1/database/` +
    `${configuration.databaseId}/query`;

  return async function query(body) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${configuration.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("D1 returned a non-JSON migration response.");
    }
    if (
      !response.ok ||
      payload?.success !== true ||
      !Array.isArray(payload.result) ||
      payload.result.some((result) => result?.success !== true)
    ) {
      const code = Array.isArray(payload?.errors)
        ? payload.errors[0]?.code
        : undefined;
      throw new Error(
        `D1 migration request failed${code ? ` (${code})` : ""}.`,
      );
    }
    return payload.result;
  };
}

function readConfiguration(environment) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const databaseId =
    environment.CLOUDFLARE_D1_DATABASE_ID?.trim() ?? "";
  const apiToken =
    environment.CLOUDFLARE_D1_API_TOKEN?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is invalid.");
  }
  if (!/^[a-f0-9-]{36}$/i.test(databaseId)) {
    throw new Error("CLOUDFLARE_D1_DATABASE_ID is invalid.");
  }
  if (apiToken.length < 40) {
    throw new Error("CLOUDFLARE_D1_API_TOKEN is invalid.");
  }
  return {
    accountId,
    databaseId,
    apiToken,
    allowExistingBaseline:
      environment.NODEZUNO_ALLOW_SCHEMA_BASELINE === "true",
    allowContractMigrations:
      environment.NODEZUNO_ALLOW_CONTRACT_MIGRATIONS === "true",
  };
}

function assertMigrationSequence(filenames) {
  const numbers = filenames.map((filename) =>
    Number.parseInt(filename.slice(0, filename.indexOf("_")), 10),
  );
  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] !== numbers[index - 1] + 1) {
      throw new Error(
        `Migration sequence is not contiguous between ${filenames[index - 1]} and ${filenames[index]}.`,
      );
    }
  }
}

async function hasCompleteExistingSchema(query) {
  const placeholders = REQUIRED_TABLES.map(() => "?").join(", ");
  const result = await query({
    sql: `SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (${placeholders})`,
    params: REQUIRED_TABLES,
  });
  const names = new Set(
    resultRows(result).map((row) => String(row.name)),
  );
  if (!REQUIRED_TABLES.every((table) => names.has(table))) return false;

  for (const [table, requiredColumns] of Object.entries(
    BASELINE_SCHEMA_REQUIREMENTS,
  )) {
    const columnResult = await query({
      sql: `PRAGMA table_info("${table}")`,
    });
    const columns = new Set(
      resultRows(columnResult).map((row) => String(row.name)),
    );
    if (!requiredColumns.every((column) => columns.has(column))) {
      return false;
    }
  }

  const indexPlaceholders = BASELINE_REQUIRED_INDEXES.map(() => "?").join(", ");
  const indexResult = await query({
    sql: `SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN (${indexPlaceholders})`,
    params: BASELINE_REQUIRED_INDEXES,
  });
  const indexes = new Set(
    resultRows(indexResult).map((row) => String(row.name)),
  );
  if (!BASELINE_REQUIRED_INDEXES.every((index) => indexes.has(index))) {
    return false;
  }

  const verification = await verifySeedCatalog(query);
  return verification.serviceCount >= 6 && verification.chainCount >= 8;
}

async function verifySchema(query) {
  const result = await query({
    sql: `SELECT
      (SELECT COUNT(*) FROM status_services) AS serviceCount,
      (SELECT COUNT(*) FROM chains) AS chainCount,
      (SELECT COUNT(*) FROM status_services
       WHERE slug = 'payment-verification') AS paymentVerificationServiceCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'index' AND name IN (
         'review_stablecoin_intents_asset_amount_unique',
         'review_stablecoin_intents_active_phase_unique',
         'review_stablecoin_intents_order_created_idx',
         'review_stablecoin_intents_state_expiry_idx',
         'review_stablecoin_claims_tx_hash_unique',
         'review_stablecoin_claims_active_intent_unique',
         'review_stablecoin_claims_state_next_check_idx',
         'review_stablecoin_claims_intent_created_idx'
       )) AS stablecoinCriticalIndexCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'trigger' AND name IN (
         'review_stablecoin_intents_immutable',
         'review_stablecoin_claims_identity_immutable'
       )) AS stablecoinCriticalTriggerCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'review_deliverables',
         'review_stablecoin_reconciliation_cases',
         'review_stablecoin_payment_confirmations'
       )) AS currentReviewTableCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'review_payments',
         'payment_webhook_events'
       )) AS retiredPaymentTableCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'index' AND name IN (
         'review_deliverables_object_key_unique',
         'review_deliverables_active_kind_unique',
         'review_deliverables_order_state_idx'
       )) AS deliveryCriticalIndexCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'trigger' AND name IN (
         'review_deliverables_identity_immutable',
         'review_deliverables_progression_guard'
       )) AS deliveryCriticalTriggerCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'index' AND name IN (
         'review_stablecoin_reconciliation_claim_unique',
         'review_stablecoin_reconciliation_transaction_unique',
         'review_stablecoin_reconciliation_resolution_idempotency_unique',
         'review_stablecoin_reconciliation_state_opened_idx',
         'review_stablecoin_reconciliation_order_opened_idx',
         'review_stablecoin_reconciliation_intent_opened_idx',
         'review_stablecoin_confirmations_order_phase_unique',
         'review_stablecoin_confirmations_intent_unique',
         'review_stablecoin_confirmations_claim_unique',
         'review_stablecoin_confirmations_transaction_unique',
         'review_stablecoin_confirmations_reconciliation_unique',
         'review_stablecoin_confirmations_public_record_unique',
         'review_stablecoin_confirmations_receipt_reference_unique',
         'review_stablecoin_confirmations_order_confirmed_idx',
         'review_stablecoin_confirmations_block_log_idx'
       )) AS reconciliationCriticalIndexCount,
      (SELECT COUNT(*) FROM sqlite_master
       WHERE type = 'trigger' AND name IN (
         'review_stablecoin_reconciliation_identity_immutable',
         'review_stablecoin_reconciliation_relationship_guard',
         'review_stablecoin_reconciliation_progression_guard',
         'review_stablecoin_reconciliation_application_guard',
         'review_stablecoin_reconciliation_no_delete',
         'review_stablecoin_confirmation_relationship_guard',
         'review_stablecoin_confirmations_no_update',
         'review_stablecoin_confirmations_no_delete',
         'review_stablecoin_claims_terminal_evidence_immutable',
         'review_stablecoin_claims_terminal_state_immutable',
         'review_stablecoin_claims_open_reconciliation_case',
         'review_stablecoin_claims_record_confirmation'
       )) AS reconciliationCriticalTriggerCount,
      EXISTS(
        SELECT submitted_by_account_id
        FROM submissions LIMIT 1
      ) AS submissionAccountAccessible,
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
               currency, telegram_username, access_token_hash, created_at,
               updated_at
        FROM review_orders LIMIT 1
      ) AS reviewOrdersAccessible,
      EXISTS(
        SELECT id, review_order_id, phase, state, asset, chain_id, network,
               token_contract, token_decimals, recipient_address,
               obligation_amount, obligation_currency, token_amount_atomic,
               token_amount_display, reference_units, proposal_version,
               terms_accepted_at, expires_at, created_at, updated_at,
               verified_at, cancelled_at
        FROM review_stablecoin_payment_intents LIMIT 1
      ) AS stablecoinPaymentIntentsAccessible,
      EXISTS(
        SELECT id, payment_intent_id, transaction_hash, telegram_username,
               state, failure_code, observed_sender, observed_token_contract,
               observed_recipient_address, observed_amount_atomic,
               block_number, block_hash, log_index, block_timestamp,
               confirmations, evidence_hash, rpc_agreement_count,
               attempt_count, next_check_at, last_checked_at, lease_token,
               lease_expires_at, submitted_at, verified_at, rejected_at,
               created_at, updated_at
        FROM review_stablecoin_payment_claims LIMIT 1
      ) AS stablecoinPaymentClaimsAccessible,
      EXISTS(
        SELECT id, review_order_id, kind, state, object_key, file_name,
               content_type, size_bytes, sha256, storage_version_id,
               created_by_email, created_at, uploaded_at, released_at,
               revoked_at
        FROM review_deliverables LIMIT 1
      ) AS reviewDeliverablesAccessible,
      EXISTS(
        SELECT id, review_order_id, payment_intent_id, payment_claim_id,
               transaction_hash, case_type, state, phase, expected_asset,
               expected_amount_atomic, resolution_code, resolved_at,
               updated_at
        FROM review_stablecoin_reconciliation_cases LIMIT 1
      ) AS reconciliationCasesAccessible,
      EXISTS(
        SELECT id, review_order_id, payment_intent_id, payment_claim_id,
               record_kind, phase, expected_asset, received_asset,
               transaction_hash, public_record_hash, receipt_reference,
               recorded_at
        FROM review_stablecoin_payment_confirmations LIMIT 1
      ) AS paymentConfirmationsAccessible`,
  });
  const row = resultRows(result)[0];
  const serviceCount = Number(row?.serviceCount);
  const chainCount = Number(row?.chainCount);
  if (
    !Number.isSafeInteger(serviceCount) ||
    serviceCount < 6 ||
    !Number.isSafeInteger(chainCount) ||
    chainCount < 8 ||
    Number(row?.paymentVerificationServiceCount) !== 1 ||
    Number(row?.stablecoinCriticalIndexCount) !== 8 ||
    Number(row?.stablecoinCriticalTriggerCount) !== 2 ||
    Number(row?.currentReviewTableCount) !== 3 ||
    Number(row?.retiredPaymentTableCount) !== 0 ||
    Number(row?.deliveryCriticalIndexCount) !== 3 ||
    Number(row?.deliveryCriticalTriggerCount) !== 2 ||
    Number(row?.reconciliationCriticalIndexCount) !== 15 ||
    Number(row?.reconciliationCriticalTriggerCount) !== 12 ||
    ![
      row?.submissionAccountAccessible,
      row?.authUsersAccessible,
      row?.authSessionsAccessible,
      row?.authAccountsAccessible,
      row?.authVerificationsAccessible,
      row?.authRateLimitsAccessible,
      row?.authWalletAddressesAccessible,
      row?.authSolanaWalletsAccessible,
      row?.reviewOrdersAccessible,
      row?.stablecoinPaymentIntentsAccessible,
      row?.stablecoinPaymentClaimsAccessible,
      row?.reviewDeliverablesAccessible,
      row?.reconciliationCasesAccessible,
      row?.paymentConfirmationsAccessible,
    ].every((value) => value === 0 || value === 1)
  ) {
    throw new Error("D1 schema verification failed.");
  }
  return { serviceCount, chainCount };
}

async function verifySeedCatalog(query) {
  const result = await query({
    sql: `SELECT
      (SELECT COUNT(*) FROM status_services) AS serviceCount,
      (SELECT COUNT(*) FROM chains) AS chainCount`,
  });
  const row = resultRows(result)[0];
  const serviceCount = Number(row?.serviceCount);
  const chainCount = Number(row?.chainCount);
  if (
    !Number.isSafeInteger(serviceCount) ||
    serviceCount < 6 ||
    !Number.isSafeInteger(chainCount) ||
    chainCount < 8
  ) {
    throw new Error("D1 seed verification failed.");
  }
  return { serviceCount, chainCount };
}

function resultRows(result) {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first?.results) ? first.results : [];
}

async function main() {
  const result = await migrateD1();
  process.stdout.write(
    `D1 ready: ${result.migrations} migration file(s), ` +
      `${result.services} services, ${result.chains} chains.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Migration failed."}\n`,
    );
    process.exitCode = 1;
  });
}
