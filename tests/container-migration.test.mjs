import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BASELINE_SCHEMA_REQUIREMENTS,
  migrateD1,
} from "../scripts/migrate-d1-rest.mjs";

const migrationDirectory = path.resolve("drizzle");
const migrationFileCount = (await readdir(migrationDirectory)).filter((file) =>
  /^\d+.*\.sql$/.test(file),
).length;
const requiredTables = [
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
const requiredIndexes = [
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
const environment = {
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
  CLOUDFLARE_D1_API_TOKEN: "t".repeat(48),
  NODEZUNO_ALLOW_SCHEMA_BASELINE: "true",
};

test("container migration rejects applied history missing from the repository", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-missing-migration-"),
  );
  try {
    await writeFile(
      path.join(directory, "0000_initial_schema.sql"),
      "SELECT 1;",
      "utf8",
    );
    const query = async (body) => {
      if (body.sql?.includes("SELECT filename, checksum")) {
        return [
          {
            success: true,
            results: [
              {
                filename: "0001_removed_from_repository.sql",
                checksum: "a".repeat(64),
              },
            ],
          },
        ];
      }
      return [{ success: true, results: [] }];
    };

    await assert.rejects(
      migrateD1({
        environment,
        migrationDirectory: directory,
        query,
      }),
      /Applied migration files are missing from the repository: 0001_removed_from_repository\.sql/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("container migration rejects a non-contiguous migration sequence", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-migration-gap-"),
  );
  try {
    await Promise.all([
      writeFile(
        path.join(directory, "0000_initial_schema.sql"),
        "SELECT 1;",
        "utf8",
      ),
      writeFile(
        path.join(directory, "0002_skipped_sequence.sql"),
        "SELECT 2;",
        "utf8",
      ),
    ]);

    await assert.rejects(
      migrateD1({
        environment,
        migrationDirectory: directory,
        query: async () => [{ success: true, results: [] }],
      }),
      /Migration sequence is not contiguous between 0000_initial_schema\.sql and 0002_skipped_sequence\.sql/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("contract migration requires an explicit maintenance cutover on an existing database", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-contract-migration-"),
  );
  const existingFilename = "0023_existing_schema.sql";
  const contractFilename = "0024_remove_legacy_provider_payments.sql";
  const existingSql = "SELECT 1;";
  try {
    await writeFile(path.join(directory, existingFilename), existingSql, "utf8");
    await writeFile(path.join(directory, contractFilename), "SELECT 2;", "utf8");
    const existingChecksum = createHash("sha256")
      .update(existingSql)
      .digest("hex");
    const query = async (body) => {
      if (body.sql?.includes("SELECT filename, checksum")) {
        return [{
          success: true,
          results: [{ filename: existingFilename, checksum: existingChecksum }],
        }];
      }
      if (body.batch) {
        return body.batch.map(() => ({ success: true, results: [] }));
      }
      if (body.sql?.includes("serviceCount")) {
        return [{ success: true, results: [schemaVerificationRow(6, 8)] }];
      }
      return [{ success: true, results: [] }];
    };

    await assert.rejects(
      migrateD1({ environment, migrationDirectory: directory, query }),
      /requires an approved maintenance cutover/,
    );

    const result = await migrateD1({
      environment: {
        ...environment,
        NODEZUNO_ALLOW_CONTRACT_MIGRATIONS: "true",
      },
      migrationDirectory: directory,
      query,
    });
    assert.equal(result.migrations, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fresh SQLite applies every migration sequentially", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((filename) => /^\d+_.+\.sql$/.test(filename))
      .sort();
    for (const filename of migrationFiles) {
      const sql = await readFile(
        path.join(migrationDirectory, filename),
        "utf8",
      );
      const statements = sql
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of statements) sqlite.exec(statement);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw new Error(`Fresh migration failed at ${filename}.`, {
          cause: error,
        });
      }
    }

    const apiKeyColumns = new Set(
      sqlite
        .prepare("PRAGMA table_info(developer_api_keys)")
        .all()
        .map((column) => column.name),
    );
    assert.equal(apiKeyColumns.has("service_id"), true);
    const serviceForeignKey = sqlite
      .prepare("PRAGMA foreign_key_list(developer_api_keys)")
      .all()
      .find((foreignKey) => foreignKey.from === "service_id");
    assert.equal(serviceForeignKey?.table, "developer_services");
    assert.equal(serviceForeignKey?.on_delete, "CASCADE");
    const serviceTableSql = sqlite
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'developer_services'`,
      )
      .get()?.sql;
    assert.match(serviceTableSql, /'grpc-api'/);
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'index'
             AND name = 'developer_services_rpc_network_active_idx'`,
        )
        .get().count,
      1,
    );
    sqlite
      .prepare(
        `INSERT INTO developer_workspaces
          (id, slug, name, status, created_at, updated_at)
         VALUES ('11111111-1111-4111-8111-111111111111',
                 'multichain-migration', 'Multichain migration',
                 'active', 1, 1)`,
      )
      .run();
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO developer_services
              (id, workspace_id, product, name, environment, network,
               region, status, configuration_json, created_at, updated_at)
             VALUES ('22222222-2222-4222-8222-222222222222',
                     '11111111-1111-4111-8111-111111111111',
                     'rpc-api', 'Wrong chain', 'production', 'polygon',
                     'global', 'configuration_saved', '{}', 1, 1)`,
          )
          .run(),
      /developer_services_rpc_network_check/,
    );
    for (const [id, network] of [
      ["33333333-3333-4333-8333-333333333333", "base"],
      ["44444444-4444-4444-8444-444444444444", "solana"],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO developer_services
            (id, workspace_id, product, name, environment, network,
             region, status, configuration_json, created_at, updated_at)
           VALUES (?, '11111111-1111-4111-8111-111111111111',
                   'rpc-api', ?, 'production', ?, 'global',
                   'configuration_saved', '{}', 1, 1)`,
        )
        .run(id, `${network} RPC`, network);
    }
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sqlite_master
           WHERE type = 'table' AND name LIKE '__old_%'`,
        )
        .get().count,
      0,
    );
    const reviewOrderColumns = new Set(
      sqlite
        .prepare("PRAGMA table_info(review_orders)")
        .all()
        .map((column) => column.name),
    );
    assert.equal(reviewOrderColumns.has("telegram_username"), true);
    for (const table of [
      "review_stablecoin_payment_intents",
      "review_stablecoin_payment_claims",
    ]) {
      assert.equal(
        sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master
             WHERE type = 'table' AND name = ?`,
          )
          .get(table).count,
        1,
      );
    }
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM status_services WHERE slug = 'payment-verification'",
        )
        .get().count,
      1,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("Ethereum stablecoin migration is additive and keeps payment evidence constrained", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((filename) => /^\d+_.+\.sql$/.test(filename))
      .sort();
    for (const filename of migrationFiles.filter(
      (name) => name < "0019_",
    )) {
      await applySQLiteMigration(sqlite, filename);
    }

    const orderId = "11111111-1111-4111-8111-111111111111";
    sqlite
      .prepare(
        `INSERT INTO review_orders
          (id, reference, status, contact_name, work_email, email_hash,
           company, team_type, target_chain, audited_baseline,
           proposed_release, change_summary, affected_contracts,
           source_path, proposal_version, proposal_accepted_at,
           access_token_hash, idempotency_key, request_hash, ip_hash,
           consent_version, consented_at, created_at, updated_at, expires_at)
         VALUES (?, 'NZ-0019', 'deposit_pending', 'Sanjay Sudagani',
                 'sanjay@example.test', ?, 'Nodezuno', 'protocol',
                 'ethereum', 'v1', 'v2', 'Payment migration assurance', 1,
                 '/review/start', 1, 1000, ?, 'migration-0019', ?, ?,
                 'review-v1', 1000, 1000, 1000, 9999999999999)`,
      )
      .run(orderId, "a".repeat(64), "b".repeat(64), "c".repeat(64), "d".repeat(64));

    await applySQLiteMigration(
      sqlite,
      "0019_ethereum_stablecoin_payments.sql",
    );

    const migratedOrder = sqlite
      .prepare(
        "SELECT reference, telegram_username AS telegramUsername FROM review_orders WHERE id = ?",
      )
      .get(orderId);
    assert.equal(migratedOrder.reference, "NZ-0019");
    assert.equal(migratedOrder.telegramUsername, null);
    const recipient = "0x07218C8E2B01fbff950Af65A0f36D3305520aC3b";
    const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    sqlite
      .prepare(
        `INSERT INTO review_stablecoin_payment_intents
          (id, review_order_id, phase, asset, token_contract,
           recipient_address, obligation_amount, token_amount_atomic,
           token_amount_display, reference_units, proposal_version,
           terms_accepted_at, expires_at, created_at, updated_at)
         VALUES ('intent-1', ?, 'deposit', 'USDC', ?, ?, 375000,
                 '3750000123', '3750.000123', 123, 1, 1000, 2000,
                 1000, 1000)`,
      )
      .run(orderId, usdc, recipient);

    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_intents
              (id, review_order_id, phase, asset, token_contract,
               recipient_address, obligation_amount, token_amount_atomic,
               token_amount_display, reference_units, proposal_version,
               terms_accepted_at, expires_at, created_at, updated_at)
             VALUES ('intent-bad-recipient', ?, 'balance', 'USDC', ?,
                     '0x0000000000000000000000000000000000000000',
                     375000, '3750000456', '3750.000456', 456, 1,
                     1000, 2000, 1000, 1000)`,
          )
          .run(orderId, usdc),
      /review_stablecoin_intents_recipient_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_intents
              (id, review_order_id, phase, asset, token_contract,
               recipient_address, obligation_amount, token_amount_atomic,
               token_amount_display, reference_units, proposal_version,
               terms_accepted_at, expires_at, created_at, updated_at)
             VALUES ('intent-bad-token', ?, 'balance', 'USDT', ?, ?,
                     375000, '3750000457', '3750.000457', 457, 1,
                     1000, 2000, 1000, 1000)`,
          )
          .run(orderId, usdc, recipient),
      /review_stablecoin_intents_token_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_intents
              (id, review_order_id, phase, asset, token_contract,
               recipient_address, obligation_amount, token_amount_atomic,
               token_amount_display, reference_units, proposal_version,
               terms_accepted_at, expires_at, created_at, updated_at)
             VALUES ('intent-bad-amount', ?, 'balance', 'USDT', ?, ?,
                     375000, '3750000999', '3750.000458', 458, 1,
                     1000, 2000, 1000, 1000)`,
          )
          .run(
            orderId,
            "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            recipient,
          ),
      /review_stablecoin_intents_amount_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `UPDATE review_stablecoin_payment_intents
             SET token_amount_display = 'tampered', updated_at = 1001
             WHERE id = 'intent-1'`,
          )
          .run(),
      /stablecoin payment instruction facts are immutable/,
    );

    const transactionHash = `0x${"a".repeat(64)}`;
    sqlite
      .prepare(
        `INSERT INTO review_stablecoin_payment_claims
          (id, payment_intent_id, transaction_hash, telegram_username,
           next_check_at, submitted_at, created_at, updated_at)
         VALUES ('claim-1', 'intent-1', ?, '@sanjay', 1000, 1000,
                 1000, 1000)`,
      )
      .run(transactionHash);
    assert.equal(
      sqlite
        .prepare(
          "SELECT state FROM review_stablecoin_payment_claims WHERE id = 'claim-1'",
        )
        .get().state,
      "submitted",
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_claims
              (id, payment_intent_id, transaction_hash, telegram_username,
               next_check_at, submitted_at, created_at, updated_at)
             VALUES ('claim-uppercase', 'intent-1', ?, '@sanjay', 1000,
                     1000, 1000, 1000)`,
          )
          .run(`0x${"A".repeat(64)}`),
      /review_stablecoin_claims_tx_hash_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_claims
              (id, payment_intent_id, transaction_hash, telegram_username,
               next_check_at, submitted_at, created_at, updated_at)
             VALUES ('claim-no-telegram', 'intent-1', ?, 'sanjay', 1000,
                     1000, 1000, 1000)`,
          )
          .run(`0x${"b".repeat(64)}`),
      /review_stablecoin_claims_telegram_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `INSERT INTO review_stablecoin_payment_claims
              (id, payment_intent_id, transaction_hash, telegram_username,
               next_check_at, submitted_at, created_at, updated_at)
             VALUES ('claim-uppercase-telegram', 'intent-1', ?, '@Sanjay',
                     1000, 1000, 1000, 1000)`,
          )
          .run(`0x${"c".repeat(64)}`),
      /review_stablecoin_claims_telegram_check/,
    );
    assert.throws(
      () =>
        sqlite
          .prepare(
            `UPDATE review_stablecoin_payment_claims
             SET telegram_username = '@other', updated_at = 1001
             WHERE id = 'claim-1'`,
          )
          .run(),
      /stablecoin payment claim identity is immutable/,
    );
    sqlite
      .prepare(
        `UPDATE review_stablecoin_payment_claims
         SET state = 'confirming', confirmations = 6, updated_at = 1001
         WHERE id = 'claim-1'`,
      )
      .run();
    assert.equal(
      sqlite
        .prepare(
          "SELECT state FROM review_stablecoin_payment_claims WHERE id = 'claim-1'",
        )
        .get().state,
      "confirming",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("gRPC product migration preserves service-bound keys and RPC usage", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    const migrationFiles = (await readdir(migrationDirectory))
      .filter((filename) => /^\d+_.+\.sql$/.test(filename))
      .sort();
    for (const filename of migrationFiles.filter(
      (name) => name < "0007_",
    )) {
      await applySQLiteMigration(sqlite, filename);
    }

    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const serviceId = "22222222-2222-4222-8222-222222222222";
    const apiKeyId = "33333333-3333-4333-8333-333333333333";
    sqlite
      .prepare(
        `INSERT INTO developer_workspaces
          (id, slug, name, status, created_at, updated_at)
         VALUES (?, 'migration-workspace', 'Migration workspace',
                 'active', 1, 1)`,
      )
      .run(workspaceId);
    sqlite
      .prepare(
        `INSERT INTO developer_services
          (id, workspace_id, product, name, environment, network, region,
           status, endpoint_path, configuration_json, created_at,
           updated_at, archived_at)
         VALUES (?, ?, 'rpc-api', 'Ethereum RPC', 'production',
                 'ethereum', 'global', 'active', '/api/v1/rpc/test',
                 '{}', 1, 1, NULL)`,
      )
      .run(serviceId, workspaceId);
    sqlite
      .prepare(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four,
           scopes_json, secret_hash, created_at, expires_at)
         VALUES (?, ?, ?, 'Migration key', 'nzu_live_33333333', 'abcd',
                 '["rpc:invoke"]', ?, 1, 9999999999999)`,
      )
      .run(apiKeyId, workspaceId, serviceId, "a".repeat(64));
    sqlite
      .prepare(
        `INSERT INTO ethereum_rpc_usage_buckets
          (id, workspace_id, service_id, api_key_id, bucket_start,
           quota_units, quota_limit, request_count, rpc_call_count,
           updated_at, expires_at)
         VALUES ('usage-1', ?, ?, ?, 1, 1, 100, 1, 1, 1,
                 9999999999999)`,
      )
      .run(workspaceId, serviceId, apiKeyId);

    await applySQLiteMigration(sqlite, "0007_shared_grpc.sql");

    assert.equal(
      sqlite
        .prepare("SELECT product FROM developer_services WHERE id = ?")
        .get(serviceId).product,
      "rpc-api",
    );
    assert.equal(
      sqlite
        .prepare("SELECT service_id FROM developer_api_keys WHERE id = ?")
        .get(apiKeyId).service_id,
      serviceId,
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT quota_units FROM ethereum_rpc_usage_buckets WHERE id = 'usage-1'",
        )
        .get().quota_units,
      1,
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }
});

test("container migration accepts only the reviewed workspace-check correction", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-reviewed-migration-"),
  );
  const filename = "0002_next_guardsmen.sql";
  const legacyChecksum =
    "2d4cfdd2863c6365fd8d31e90ae2069284dbecb95a648a543b5430d117470429";
  try {
    await writeFile(
      path.join(directory, filename),
      await readFile(path.join(migrationDirectory, filename), "utf8"),
      "utf8",
    );
    const updates = [];
    const query = async (body) => {
      if (body.sql?.includes("SELECT filename, checksum")) {
        return [
          {
            success: true,
            results: [{ filename, checksum: legacyChecksum }],
          },
        ];
      }
      if (body.sql?.includes("UPDATE nodezuno_schema_migrations")) {
        updates.push(body);
        return [{ success: true, results: [] }];
      }
      if (body.sql?.includes("serviceCount")) {
        return [
          {
            success: true,
            results: [schemaVerificationRow(6, 8)],
          },
        ];
      }
      return [{ success: true, results: [] }];
    };

    await migrateD1({
      environment,
      migrationDirectory: directory,
      query,
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].params[1], filename);
    assert.equal(updates[0].params[2], legacyChecksum);
    assert.equal(updates[0].params[0].length, 64);
    assert.notEqual(updates[0].params[0], legacyChecksum);

    await assert.rejects(
      migrateD1({
        environment,
        migrationDirectory: directory,
        query: async (body) => {
          if (body.sql?.includes("SELECT filename, checksum")) {
            return [
              {
                success: true,
                results: [
                  { filename, checksum: "f".repeat(64) },
                ],
              },
            ];
          }
          return [{ success: true, results: [] }];
        },
      }),
      /changed since it was applied/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("container migration baselines a verified existing Sites schema", async () => {
  const calls = [];
  const query = async (body) => {
    calls.push(body);
    if (body.sql?.includes("SELECT filename, checksum")) {
      return [{ success: true, results: [] }];
    }
    if (body.sql?.includes("SELECT name FROM sqlite_master")) {
      if (body.sql.includes("type = 'index'")) {
        return [
          {
            success: true,
            results: requiredIndexes.map((name) => ({ name })),
          },
        ];
      }
      return [
        {
          success: true,
          results: requiredTables.map((name) => ({ name })),
        },
      ];
    }
    if (body.sql?.startsWith("PRAGMA table_info")) {
      return completeTableInfo(body.sql);
    }
    if (body.sql?.includes("serviceCount")) {
      return [
        {
          success: true,
          results: [schemaVerificationRow(6, 8)],
        },
      ];
    }
    return [{ success: true, results: [] }];
  };

  const result = await migrateD1({
    environment: {
      ...environment,
      NODEZUNO_ALLOW_CONTRACT_MIGRATIONS: "true",
    },
    migrationDirectory,
    query,
  });
  assert.equal(result.services, 6);
  assert.equal(result.chains, 8);
  assert.equal(
    calls.some(
      (call) =>
        call.sql?.includes("INSERT INTO nodezuno_schema_migrations") &&
        call.params?.at(-1) === "baseline",
    ),
    true,
  );
  const migrationBatch = calls.find((call) => Array.isArray(call.batch));
  assert.ok(migrationBatch);
  assert.equal(
    migrationBatch.batch.some((statement) =>
      statement.sql.includes("developer_api_keys"),
    ),
    true,
  );
});

test("container migration applies every file as a tracked batch", async () => {
  const calls = [];
  let migrated = false;
  const query = async (body) => {
    calls.push(body);
    if (body.sql?.includes("SELECT filename, checksum")) {
      return [{ success: true, results: [] }];
    }
    if (body.sql?.includes("SELECT name FROM sqlite_master")) {
      return [{ success: true, results: [] }];
    }
    if (body.batch) {
      migrated = true;
      return body.batch.map(() => ({ success: true, results: [] }));
    }
    if (body.sql?.includes("serviceCount")) {
      return [
        {
          success: true,
          results: migrated
            ? [schemaVerificationRow(6, 8)]
            : [{ serviceCount: 0, chainCount: 0 }],
        },
      ];
    }
    return [{ success: true, results: [] }];
  };

  const result = await migrateD1({
    environment,
    migrationDirectory,
    query,
  });
  assert.equal(result.migrations, migrationFileCount);
  const batches = calls
    .filter((call) => Array.isArray(call.batch))
    .map((call) => call.batch);
  assert.equal(batches.length, migrationFileCount);
  const batch = batches[0];
  assert.ok(batch.length > 20);
  assert.match(
    batch.at(-1).sql,
    /INSERT INTO nodezuno_schema_migrations/,
  );
  assert.equal(batch.at(-1).params.at(-1), "migration");
  assert.equal(
    batches[1].some((statement) =>
      statement.sql.includes("developer_workspace_members"),
    ),
    true,
  );
  assert.equal(
    batches[2].some(
      (statement) =>
        statement.sql.toLowerCase() === "pragma defer_foreign_keys=on;",
    ),
    true,
  );
  assert.equal(
    batches[2].some((statement) =>
      /pragma\s+foreign_keys\s*=\s*off/i.test(statement.sql),
    ),
    false,
  );
  assert.equal(
    batches[5].some((statement) =>
      statement.sql.includes("ethereum_rpc_usage_buckets"),
    ),
    true,
  );
  assert.equal(
    batches[5].some((statement) =>
      statement.sql.includes("ethereum_rpc_workspace_quota_buckets"),
    ),
    true,
  );
  assert.equal(
    batches[6].some(
      (statement) =>
        statement.sql.includes("developer_api_keys") &&
        statement.sql.includes("service_id"),
    ),
    true,
  );
  assert.equal(
    batches[6].some((statement) =>
      statement.sql.includes(
        "developer_api_keys_service_revoked_created_idx",
      ),
    ),
    true,
  );
  const stablecoinBatch = batches.find((batch) =>
    batch.some((statement) =>
      statement.sql.includes("CREATE TABLE `review_stablecoin_payment_intents`"),
    ),
  );
  assert.ok(stablecoinBatch, "the stablecoin payment migration must be present");
  assert.equal(
    stablecoinBatch.some((statement) =>
      statement.sql.includes("review_stablecoin_payment_intents"),
    ),
    true,
  );
  assert.equal(
    stablecoinBatch.some((statement) =>
      statement.sql.includes("review_stablecoin_payment_claims"),
    ),
    true,
  );
  assert.equal(
    stablecoinBatch.some((statement) =>
      statement.sql.includes("payment-verification"),
    ),
    true,
  );
  assert.equal(
    stablecoinBatch.some((statement) =>
      statement.sql.includes("0x07218C8E2B01fbff950Af65A0f36D3305520aC3b"),
    ),
    true,
  );
});

test("container migration never baselines a later schema change", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-migrations-"),
  );
  try {
    await writeFile(
      path.join(directory, "0000_initial.sql"),
      "CREATE TABLE example (id TEXT PRIMARY KEY);",
      "utf8",
    );
    await writeFile(
      path.join(directory, "0001_add_label.sql"),
      "ALTER TABLE example ADD COLUMN label TEXT;",
      "utf8",
    );

    const calls = [];
    const query = async (body) => {
      calls.push(body);
      if (body.sql?.includes("SELECT filename, checksum")) {
        return [{ success: true, results: [] }];
      }
      if (body.sql?.includes("SELECT name FROM sqlite_master")) {
        if (body.sql.includes("type = 'index'")) {
          return [
            {
              success: true,
              results: requiredIndexes.map((name) => ({ name })),
            },
          ];
        }
        return [
          {
            success: true,
            results: requiredTables.map((name) => ({ name })),
          },
        ];
      }
      if (body.sql?.startsWith("PRAGMA table_info")) {
        return completeTableInfo(body.sql);
      }
      if (body.sql?.includes("serviceCount")) {
        return [
          {
            success: true,
            results: [schemaVerificationRow(6, 8)],
          },
        ];
      }
      if (body.batch) {
        return body.batch.map(() => ({ success: true, results: [] }));
      }
      return [{ success: true, results: [] }];
    };

    await migrateD1({
      environment,
      migrationDirectory: directory,
      query,
    });

    const baseline = calls.find(
      (call) =>
        call.sql?.includes("nodezuno_schema_migrations") &&
        call.params?.at(-1) === "baseline",
    );
    assert.equal(baseline?.params?.[0], "0000_initial.sql");
    const migrationBatch = calls.find(
      (call) =>
        Array.isArray(call.batch) &&
        call.batch.some((statement) =>
          statement.sql.includes("ALTER TABLE example"),
        ),
    );
    assert.ok(migrationBatch);
    assert.equal(migrationBatch.batch.at(-1).params.at(-1), "migration");
    assert.equal(
      migrationBatch.batch.at(-1).params[0],
      "0001_add_label.sql",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("container migration requires an explicit existing-schema baseline", async () => {
  const query = async (body) => {
    if (body.sql?.includes("SELECT filename, checksum")) {
      return [{ success: true, results: [] }];
    }
    if (body.sql?.includes("SELECT name FROM sqlite_master")) {
      if (body.sql.includes("type = 'index'")) {
        return [
          {
            success: true,
            results: requiredIndexes.map((name) => ({ name })),
          },
        ];
      }
      return [
        {
          success: true,
          results: requiredTables.map((name) => ({ name })),
        },
      ];
    }
    if (body.sql?.startsWith("PRAGMA table_info")) {
      return completeTableInfo(body.sql);
    }
    if (body.sql?.includes("serviceCount")) {
      return [
        {
          success: true,
          results: [schemaVerificationRow(6, 8)],
        },
      ];
    }
    return [{ success: true, results: [] }];
  };

  await assert.rejects(
    migrateD1({
      environment: {
        ...environment,
        NODEZUNO_ALLOW_SCHEMA_BASELINE: "false",
      },
      migrationDirectory,
      query,
    }),
    /NODEZUNO_ALLOW_SCHEMA_BASELINE=true/,
  );
});

test("container migration refuses to baseline an incomplete schema", async () => {
  const calls = [];
  const query = async (body) => {
    calls.push(body);
    if (body.sql?.includes("SELECT filename, checksum")) {
      return [{ success: true, results: [] }];
    }
    if (body.sql?.includes("SELECT name FROM sqlite_master")) {
      if (body.sql.includes("type = 'index'")) {
        return [
          {
            success: true,
            results: requiredIndexes.map((name) => ({ name })),
          },
        ];
      }
      return [
        {
          success: true,
          results: requiredTables.map((name) => ({ name })),
        },
      ];
    }
    if (body.sql?.startsWith("PRAGMA table_info")) {
      const result = completeTableInfo(body.sql);
      if (body.sql.includes('"submissions"')) {
        result[0].results = result[0].results.filter(
          (column) => column.name !== "submitted_by_email",
        );
      }
      return result;
    }
    if (body.batch) {
      return body.batch.map(() => ({ success: true, results: [] }));
    }
    if (body.sql?.includes("serviceCount")) {
      return [
        {
          success: true,
          results: [schemaVerificationRow(6, 8)],
        },
      ];
    }
    return [{ success: true, results: [] }];
  };

  await migrateD1({
    environment,
    migrationDirectory,
    query,
  });

  assert.equal(
    calls.some((call) => call.params?.at(-1) === "baseline"),
    false,
  );
  assert.equal(calls.some((call) => Array.isArray(call.batch)), true);
});

test("container migration verification requires the stablecoin payment schema", async () => {
  for (const invalid of [
    { paymentVerificationServiceCount: 0 },
    { stablecoinCriticalIndexCount: 7 },
    { stablecoinCriticalTriggerCount: 1 },
    { currentReviewTableCount: 2 },
    { retiredPaymentTableCount: 1 },
    { deliveryCriticalIndexCount: 2 },
    { deliveryCriticalTriggerCount: 1 },
    { reconciliationCriticalIndexCount: 14 },
    { reconciliationCriticalTriggerCount: 11 },
    { reviewOrdersAccessible: 2 },
    { stablecoinPaymentIntentsAccessible: 2 },
    { stablecoinPaymentClaimsAccessible: 2 },
    { reviewDeliverablesAccessible: 2 },
    { reconciliationCasesAccessible: 2 },
    { paymentConfirmationsAccessible: 2 },
  ]) {
    const query = async (body) => {
      if (body.sql?.includes("SELECT filename, checksum")) {
        return [{ success: true, results: [] }];
      }
      if (body.sql?.includes("SELECT name FROM sqlite_master")) {
        return [{ success: true, results: [] }];
      }
      if (body.batch) {
        return body.batch.map(() => ({ success: true, results: [] }));
      }
      if (body.sql?.includes("serviceCount")) {
        return [
          {
            success: true,
            results: [{ ...schemaVerificationRow(6, 8), ...invalid }],
          },
        ];
      }
      return [{ success: true, results: [] }];
    };

    await assert.rejects(
      migrateD1({ environment, migrationDirectory, query }),
      /schema verification failed/,
    );
  }
});

function completeTableInfo(sql) {
  const table = sql.match(/PRAGMA table_info\("([^"]+)"\)/)?.[1];
  const columns = BASELINE_SCHEMA_REQUIREMENTS[table] ?? [];
  return [
    {
      success: true,
      results: columns.map((name) => ({ name })),
    },
  ];
}

function schemaVerificationRow(serviceCount, chainCount) {
  return {
    serviceCount,
    chainCount,
    paymentVerificationServiceCount: 1,
    stablecoinCriticalIndexCount: 8,
    stablecoinCriticalTriggerCount: 2,
    currentReviewTableCount: 3,
    retiredPaymentTableCount: 0,
    deliveryCriticalIndexCount: 3,
    deliveryCriticalTriggerCount: 2,
    reconciliationCriticalIndexCount: 15,
    reconciliationCriticalTriggerCount: 12,
    submissionAccountAccessible: 0,
    developerWorkspacesAccessible: 0,
    developerMembersAccessible: 0,
    developerApiKeysAccessible: 0,
    developerAuditAccessible: 0,
    authUsersAccessible: 0,
    authSessionsAccessible: 0,
    authAccountsAccessible: 0,
    authVerificationsAccessible: 0,
    authRateLimitsAccessible: 0,
    authWalletAddressesAccessible: 0,
    authSolanaWalletsAccessible: 0,
    developerServicesAccessible: 0,
    developerRpcAccessPoliciesAccessible: 0,
    developerMutationIdempotencyAccessible: 0,
    ethereumRpcUsageAccessible: 0,
    ethereumRpcWorkspaceQuotaAccessible: 0,
    reviewOrdersAccessible: 0,
    stablecoinPaymentIntentsAccessible: 0,
    stablecoinPaymentClaimsAccessible: 0,
    reviewDeliverablesAccessible: 0,
    reconciliationCasesAccessible: 0,
    paymentConfirmationsAccessible: 0,
  };
}

async function applySQLiteMigration(sqlite, filename) {
  const sql = await readFile(
    path.join(migrationDirectory, filename),
    "utf8",
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of statements) sqlite.exec(statement);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw new Error(`Migration failed at ${filename}.`, { cause: error });
  }
}
