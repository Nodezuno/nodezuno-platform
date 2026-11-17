import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createD1RestDatabase } from "../lib/server/d1-rest-database.ts";
import { migrateD1 } from "../scripts/migrate-d1-rest.mjs";

const integrationEnabled =
  process.env.NODEZUNO_D1_INTEGRATION === "true";

test(
  "isolated Cloudflare D1 REST integration",
  {
    skip: integrationEnabled
      ? false
      : "Set NODEZUNO_D1_INTEGRATION=true to use an isolated D1 database.",
    timeout: 60_000,
  },
  async () => {
    assert.equal(
      process.env.NODEZUNO_D1_INTEGRATION_ACK,
      "isolated-disposable-database",
      "Integration tests can mutate only an isolated disposable D1 database.",
    );

    const configuration = {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID ?? "",
      apiToken: process.env.CLOUDFLARE_D1_API_TOKEN ?? "",
    };
    const migration = await migrateD1({
      environment: {
        ...process.env,
        NODEZUNO_ALLOW_SCHEMA_BASELINE: "false",
        NODEZUNO_ALLOW_CONTRACT_MIGRATIONS: "false",
      },
      migrationDirectory: path.resolve("drizzle"),
    });
    assert.ok(migration.services >= 6);
    assert.ok(migration.chains >= 8);

    const database = createD1RestDatabase(configuration);
    const table =
      `nodezuno_integration_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await database
        .prepare(
          `CREATE TABLE "${table}" (
            id TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          )`,
        )
        .run();

      await database.batch([
        database
          .prepare(`INSERT INTO "${table}" (id, value) VALUES (?, ?)`)
          .bind("one", "first"),
        database
          .prepare(`INSERT INTO "${table}" (id, value) VALUES (?, ?)`)
          .bind("two", "second"),
      ]);
      const inserted = await database
        .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
        .first();
      assert.equal(Number(inserted?.count), 2);

      await assert.rejects(
        database.batch([
          database
            .prepare(`INSERT INTO "${table}" (id, value) VALUES (?, ?)`)
            .bind("rollback", "before-conflict"),
          database
            .prepare(`INSERT INTO "${table}" (id, value) VALUES (?, ?)`)
            .bind("rollback", "conflict"),
        ]),
      );
      const rolledBack = await database
        .prepare(
          `SELECT COUNT(*) AS count FROM "${table}" WHERE id = ?`,
        )
        .bind("rollback")
        .first();
      assert.equal(Number(rolledBack?.count), 0);
    } finally {
      await database.prepare(`DROP TABLE IF EXISTS "${table}"`).run();
    }
  },
);
