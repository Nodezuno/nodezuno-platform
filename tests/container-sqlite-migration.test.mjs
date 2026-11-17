import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createNodezunoAuth } from "../lib/server/auth.ts";
import { checkDatabase } from "../lib/server/database.ts";
import {
  closeSqliteDatabase,
  createSqliteDatabase,
} from "../lib/server/sqlite-database.ts";
import {
  createSqliteMigrationQuery,
  migrateSqlite,
} from "../scripts/migrate-sqlite.mjs";
import { migrateContainer } from "../scripts/migrate-container.mjs";

test("SQLite migrations are complete, repeatable, and application-readable", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-migration-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = {
    runtime: process.env.NODEZUNO_RUNTIME,
    driver: process.env.NODEZUNO_DATABASE_DRIVER,
    pathname: process.env.NODEZUNO_SQLITE_PATH,
  };
  try {
    await writeFile(pathname, "", { mode: 0o644 });
    await chmod(pathname, 0o644);
    const first = await migrateSqlite({ pathname });
    assert.equal((await stat(pathname)).mode & 0o777, 0o600);
    const second = await migrateContainer({
      environment: {
        NODEZUNO_DATABASE_DRIVER: "sqlite",
        NODEZUNO_SQLITE_PATH: pathname,
      },
      pathname,
    });
    assert.equal(second.driver, "sqlite");
    assert.deepEqual(
      {
        migrations: first.migrations,
        services: first.services,
        chains: first.chains,
      },
      {
        migrations: second.migrations,
        services: second.services,
        chains: second.chains,
      },
    );
    assert.ok(first.migrations >= 19);
    assert.ok(first.services >= 6);
    assert.ok(first.chains >= 8);

    const sqlite = new DatabaseSync(pathname);
    try {
      const migrationCount = sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM nodezuno_schema_migrations",
        )
        .get().count;
      assert.equal(migrationCount, first.migrations);
      const columns = sqlite
        .prepare("PRAGMA table_info(developer_services)")
        .all()
        .map((column) => column.name);
      assert.ok(columns.includes("last_mutation_id"));
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
        "review_stablecoin_reconciliation_cases",
        "review_stablecoin_payment_confirmations",
        "payment_verifier_health",
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
      const stablecoinIndexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name LIKE 'review_stablecoin_%'`,
        )
        .all()
        .map((row) => row.name);
      assert.deepEqual(
        stablecoinIndexes.sort(),
        [
          "review_stablecoin_claims_active_intent_unique",
          "review_stablecoin_claims_intent_created_idx",
          "review_stablecoin_claims_state_next_check_idx",
          "review_stablecoin_claims_tx_hash_unique",
          "review_stablecoin_confirmations_block_log_idx",
          "review_stablecoin_confirmations_claim_unique",
          "review_stablecoin_confirmations_intent_unique",
          "review_stablecoin_confirmations_order_confirmed_idx",
          "review_stablecoin_confirmations_order_phase_unique",
          "review_stablecoin_confirmations_public_record_unique",
          "review_stablecoin_confirmations_receipt_reference_unique",
          "review_stablecoin_confirmations_reconciliation_unique",
          "review_stablecoin_confirmations_transaction_unique",
          "review_stablecoin_intents_active_phase_unique",
          "review_stablecoin_intents_asset_amount_unique",
          "review_stablecoin_intents_creation_idempotency_unique",
          "review_stablecoin_intents_order_created_idx",
          "review_stablecoin_intents_state_expiry_idx",
          "review_stablecoin_reconciliation_claim_unique",
          "review_stablecoin_reconciliation_intent_opened_idx",
          "review_stablecoin_reconciliation_order_opened_idx",
          "review_stablecoin_reconciliation_resolution_idempotency_unique",
          "review_stablecoin_reconciliation_state_opened_idx",
          "review_stablecoin_reconciliation_transaction_unique",
        ],
      );
      assert.deepEqual(
        sqlite
          .prepare(
            `SELECT name FROM sqlite_master
             WHERE type = 'trigger' AND name LIKE 'review_stablecoin_%'`,
          )
          .all()
          .map((row) => row.name)
          .sort(),
        [
          "review_stablecoin_claims_identity_immutable",
          "review_stablecoin_claims_open_reconciliation_case",
          "review_stablecoin_claims_record_confirmation",
          "review_stablecoin_claims_terminal_evidence_immutable",
          "review_stablecoin_claims_terminal_state_immutable",
          "review_stablecoin_confirmation_relationship_guard",
          "review_stablecoin_confirmations_no_delete",
          "review_stablecoin_confirmations_no_update",
          "review_stablecoin_intents_immutable",
          "review_stablecoin_intents_policy_immutable",
          "review_stablecoin_intents_policy_valid",
          "review_stablecoin_reconciliation_application_guard",
          "review_stablecoin_reconciliation_identity_immutable",
          "review_stablecoin_reconciliation_no_delete",
          "review_stablecoin_reconciliation_progression_guard",
          "review_stablecoin_reconciliation_relationship_guard",
        ],
      );
      assert.equal(
        sqlite
          .prepare(
            "SELECT name FROM status_services WHERE slug = 'payment-verification'",
          )
          .get()?.name,
        "Ethereum payment verification",
      );
      assert.equal(
        sqlite.prepare("PRAGMA quick_check").get().quick_check,
        "ok",
      );
    } finally {
      sqlite.close();
    }

    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    assert.equal(await checkDatabase(), true);
  } finally {
    closeSqliteDatabase(pathname);
    restoreEnvironment("NODEZUNO_RUNTIME", previous.runtime);
    restoreEnvironment(
      "NODEZUNO_DATABASE_DRIVER",
      previous.driver,
    );
    restoreEnvironment("NODEZUNO_SQLITE_PATH", previous.pathname);
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite migration batches roll back as one transaction", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(
      "CREATE TABLE records (id TEXT PRIMARY KEY NOT NULL)",
    );
    const query = createSqliteMigrationQuery(sqlite);
    await assert.rejects(
      query({
        batch: [
          {
            sql: "INSERT INTO records (id) VALUES (?)",
            params: ["one"],
          },
          {
            sql: "INSERT INTO records (id) VALUES (?)",
            params: ["one"],
          },
        ],
      }),
    );
    assert.equal(
      sqlite
        .prepare("SELECT COUNT(*) AS count FROM records")
        .get().count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("SQLite migration rejects unsafe database paths", async () => {
  await assert.rejects(
    migrateSqlite({ pathname: "../nodezuno.sqlite" }),
    /absolute/,
  );
});

test("SQLite migration refuses a symbolic database file", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-migration-link-"),
  );
  const target = path.join(directory, "target.sqlite");
  const pathname = path.join(directory, "nodezuno.sqlite");
  try {
    await writeFile(target, "not a database", { mode: 0o600 });
    await symlink(target, pathname);
    await assert.rejects(
      migrateSqlite({ pathname }),
      /unsafe (?:file|link)/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SQLite pre-0024 upgrade requires an explicit contract cutover", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-sqlite-contract-cutover-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  const sqlite = new DatabaseSync(pathname);
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    await applyMigrationsThrough(sqlite, "0023_");
    await recordMigrationHistoryThrough(sqlite, "0023_");
  } finally {
    sqlite.close();
  }

  try {
    await assert.rejects(
      migrateSqlite({
        environment: {
          NODEZUNO_ALLOW_CONTRACT_MIGRATIONS: "false",
        },
        pathname,
      }),
      /Contract migration 0024_remove_legacy_provider_payments\.sql requires an approved maintenance cutover/,
    );

    const beforeCutover = new DatabaseSync(pathname);
    try {
      assert.equal(
        beforeCutover
          .prepare(
            `SELECT COUNT(*) AS count FROM nodezuno_schema_migrations
             WHERE filename = '0024_remove_legacy_provider_payments.sql'`,
          )
          .get().count,
        0,
      );
      for (const table of ["review_payments", "payment_webhook_events"]) {
        assert.equal(
          beforeCutover
            .prepare(
              `SELECT COUNT(*) AS count FROM sqlite_master
               WHERE type = 'table' AND name = ?`,
            )
            .get(table).count,
          1,
        );
      }
    } finally {
      beforeCutover.close();
    }

    const result = await migrateSqlite({
      environment: {
        NODEZUNO_ALLOW_CONTRACT_MIGRATIONS: "true",
      },
      pathname,
    });
    assert.ok(result.migrations >= 25);

    const afterCutover = new DatabaseSync(pathname);
    try {
      assert.equal(
        afterCutover
          .prepare(
            `SELECT mode FROM nodezuno_schema_migrations
             WHERE filename = '0024_remove_legacy_provider_payments.sql'`,
          )
          .get()?.mode,
        "migration",
      );
      for (const table of ["review_payments", "payment_webhook_events"]) {
        assert.equal(
          afterCutover
            .prepare(
              `SELECT COUNT(*) AS count FROM sqlite_master
               WHERE type = 'table' AND name = ?`,
            )
            .get(table).count,
          0,
        );
      }
      assert.deepEqual(
        afterCutover.prepare("PRAGMA foreign_key_check").all(),
        [],
      );
    } finally {
      afterCutover.close();
    }
  } finally {
    closeSqliteDatabase(pathname);
    await rm(directory, { recursive: true, force: true });
  }
});

test("readiness rejects a SQLite schema before review-order tables exist", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-stale-schema-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  const previous = {
    runtime: process.env.NODEZUNO_RUNTIME,
    driver: process.env.NODEZUNO_DATABASE_DRIVER,
    pathname: process.env.NODEZUNO_SQLITE_PATH,
  };
  const sqlite = new DatabaseSync(pathname);
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    await applyMigrationsThrough(sqlite, "0014_");
    sqlite.close();

    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_DATABASE_DRIVER = "sqlite";
    process.env.NODEZUNO_SQLITE_PATH = pathname;
    await assert.rejects(
      checkDatabase(),
      /no such table: review_orders/i,
    );
  } finally {
    try {
      sqlite.close();
    } catch {
      // The database was already closed before the runtime probe.
    }
    closeSqliteDatabase(pathname);
    restoreEnvironment("NODEZUNO_RUNTIME", previous.runtime);
    restoreEnvironment(
      "NODEZUNO_DATABASE_DRIVER",
      previous.driver,
    );
    restoreEnvironment("NODEZUNO_SQLITE_PATH", previous.pathname);
    await rm(directory, { recursive: true, force: true });
  }
});

test("Better Auth persists an email signup and session through the SQLite adapter", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "nodezuno-sqlite-auth-"),
  );
  const pathname = path.join(directory, "nodezuno.sqlite");
  const origin = "http://localhost:3000";
  const environmentNames = [
    "NODEZUNO_RUNTIME",
    "NODEZUNO_LOCAL_PREVIEW",
    "PUBLIC_ORIGIN",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "ZOHO_SMTP_PASSWORD",
    "ZOHO_SMTP_HOST",
  ];
  const previous = Object.fromEntries(
    environmentNames.map((name) => [name, process.env[name]]),
  );
  try {
    await migrateSqlite({ pathname });
    process.env.NODEZUNO_RUNTIME = "container";
    process.env.NODEZUNO_LOCAL_PREVIEW = "true";
    process.env.PUBLIC_ORIGIN = origin;
    process.env.BETTER_AUTH_URL = origin;
    process.env.BETTER_AUTH_SECRET =
      "sqlite-adapter-auth-secret-1234567890-abcdefgh";
    for (const name of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "ZOHO_SMTP_PASSWORD",
      "ZOHO_SMTP_HOST",
    ]) {
      delete process.env[name];
    }

    const database = createSqliteDatabase(pathname);
    const auth = await createNodezunoAuth(
      new Request(`${origin}/api/auth/get-session`),
      database,
    );
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: origin,
          "cf-connecting-ip": "127.0.0.1",
        },
        body: JSON.stringify({
          callbackURL: "/console",
          email: "sqlite-adapter@example.com",
          name: "SQLite Adapter",
          password: "correct horse battery staple",
        }),
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    assert.match(cookie, /nodezuno\.session_token=/);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    assert.equal(session?.user.email, "sqlite-adapter@example.com");
    assert.equal(
      await database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM auth_sessions
           WHERE user_id = ?`,
        )
        .bind(session?.user.id)
        .first("count"),
      1,
    );
  } finally {
    closeSqliteDatabase(pathname);
    for (const [name, value] of Object.entries(previous)) {
      restoreEnvironment(name, value);
    }
    await rm(directory, { recursive: true, force: true });
  }
});

async function applyMigrationsThrough(sqlite, finalPrefix) {
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = await readdir(migrationDirectory);
  for (const filename of migrationFiles
    .filter(
      (value) =>
        /^\d+_.+\.sql$/.test(value) &&
        value.slice(0, 5) <= finalPrefix,
    )
    .sort()) {
    const source = await readFile(
      path.join(migrationDirectory, filename),
      "utf8",
    );
    for (const statement of source
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean)) {
      sqlite.exec(statement);
    }
  }
}

async function recordMigrationHistoryThrough(sqlite, finalPrefix) {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS nodezuno_schema_migrations (
      filename TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      mode TEXT NOT NULL
    )`,
  );
  const migrationDirectory = path.resolve("drizzle");
  const migrationFiles = await readdir(migrationDirectory);
  const insert = sqlite.prepare(
    `INSERT INTO nodezuno_schema_migrations
      (filename, checksum, applied_at, mode)
     VALUES (?, ?, ?, 'migration')`,
  );
  for (const filename of migrationFiles
    .filter(
      (value) =>
        /^\d+_.+\.sql$/.test(value) &&
        value.slice(0, 5) <= finalPrefix,
    )
    .sort()) {
    const source = await readFile(
      path.join(migrationDirectory, filename),
      "utf8",
    );
    insert.run(
      filename,
      createHash("sha256").update(source).digest("hex"),
      Date.now(),
    );
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
