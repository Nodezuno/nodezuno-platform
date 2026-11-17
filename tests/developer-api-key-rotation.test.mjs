import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { rotateDeveloperApiKey } from "../lib/server/database.ts";
import { validateDeveloperApiKeyRotationPayload } from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const sourceId = "44444444-4444-4444-8444-444444444444";
const replacementId = "55555555-5555-4555-8555-555555555555";
const now = 1_800_000_000_000;
const idempotencyHash = "c".repeat(64);
const requestHash = "d".repeat(64);
const actor = {
  accountId: ownerId,
  email: "owner@example.com",
};

test("API key rotation input is exact and can preserve the name", () => {
  assert.deepEqual(validateDeveloperApiKeyRotationPayload({}), {
    ok: true,
    value: { name: null },
  });
  assert.deepEqual(
    validateDeveloperApiKeyRotationPayload({
      name: " Replacement production ",
    }),
    {
      ok: true,
      value: { name: "Replacement production" },
    },
  );
  assert.equal(
    validateDeveloperApiKeyRotationPayload({
      name: "Replacement",
      serviceId,
    }).ok,
    false,
  );
});

test("rotation atomically replaces a key at the active-key limit", async () => {
  const sqlite = await createRotationDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const replacement = await rotateDeveloperApiKey({
      actor,
      sourceId,
      id: replacementId,
      name: null,
      prefix: "nzu_live_55555555",
      lastFour: "wxyz",
      secretHash: "b".repeat(64),
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      idempotencyHash,
      requestHash,
      now,
      database,
    });
    assert.ok(replacement);
    assert.equal(replacement.name, "Production RPC");
    assert.equal(replacement.serviceId, serviceId);
    assert.deepEqual(replacement.scopes, ["rpc:invoke"]);
    assert.equal(replacement.revokedAt, null);

    const source = sqlite
      .prepare(
        `SELECT revoked_at AS revokedAt
         FROM developer_api_keys WHERE id = ?`,
      )
      .get(sourceId);
    assert.equal(source.revokedAt, now);
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM developer_api_keys
           WHERE workspace_id = ? AND revoked_at IS NULL
             AND expires_at > ?`,
        )
        .get(workspaceId, now).count,
      10,
    );
    const audit = sqlite
      .prepare(
        `SELECT detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'api_key.rotated'`,
      )
      .get();
    assert.equal(JSON.parse(audit.detailJson).sourceKeyId, sourceId);
    assert.equal(audit.detailJson.includes("secret"), false);
    assert.deepEqual(
      {
        operation: sqlite
          .prepare(
            `SELECT operation FROM developer_mutation_idempotency
             WHERE resource_id = ?`,
          )
          .get(replacementId).operation,
        keys: sqlite
          .prepare(
            `SELECT COUNT(*) AS count FROM developer_api_keys
             WHERE id IN (?, ?)`,
          )
          .get(sourceId, replacementId).count,
      },
      { operation: "api_key.rotate", keys: 2 },
    );

    await assert.rejects(
      () =>
        rotateDeveloperApiKey({
          actor,
          sourceId,
          id: "66666666-6666-4666-8666-666666666666",
          name: null,
          prefix: "nzu_live_66666666",
          lastFour: "zzzz",
          secretHash: "e".repeat(64),
          expiresAt: now + 365 * 24 * 60 * 60 * 1000,
          idempotencyHash,
          requestHash,
          now: now + 1,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "api_key_secret_already_issued",
    );
    await assert.rejects(
      () =>
        rotateDeveloperApiKey({
          actor,
          sourceId,
          id: "77777777-7777-4777-8777-777777777777",
          name: "Changed",
          prefix: "nzu_live_77777777",
          lastFour: "yyyy",
          secretHash: "f".repeat(64),
          expiresAt: now + 365 * 24 * 60 * 60 * 1000,
          idempotencyHash,
          requestHash: "1".repeat(64),
          now: now + 2,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "idempotency_key_reused",
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM developer_audit_events
           WHERE action = 'api_key.rotated'`,
        )
        .get().count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

async function createRotationDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = path.resolve("drizzle");
  const migrations = (await readdir(migrationDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  for (const filename of migrations) {
    const sql = await readFile(
      path.join(migrationDirectory, filename),
      "utf8",
    );
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  sqlite
    .prepare(
      `INSERT INTO auth_users
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Owner', 'owner@example.com', 1, 1, 1)`,
    )
    .run(ownerId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES (?, 'rotation-workspace', 'Rotation workspace',
               'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('88888888-8888-4888-8888-888888888888', ?, ?,
               'owner@example.com', 'owner', 1, 1)`,
    )
    .run(workspaceId, ownerId);
  sqlite
    .prepare(
      `INSERT INTO developer_services
        (id, workspace_id, product, name, environment, network, region,
         status, endpoint_path, configuration_json, created_by_account_id,
         created_at, updated_at, archived_at)
       VALUES (?, ?, 'rpc-api', 'Base production', 'production', 'base',
               'global', 'active', ?, '{}', ?, 1, 1, NULL)`,
    )
    .run(
      serviceId,
      workspaceId,
      `/api/v1/rpc/${serviceId}`,
      ownerId,
    );
  insertKey(sqlite, {
    id: sourceId,
    serviceId,
    name: "Production RPC",
    prefix: "nzu_live_44444444",
    lastFour: "abcd",
    scopes: ["rpc:invoke"],
    hash: "a".repeat(64),
  });
  for (let index = 1; index <= 9; index += 1) {
    const digit = index.toString(16);
    insertKey(sqlite, {
      id: `9000000${digit}-0000-4000-8000-00000000000${digit}`,
      serviceId: null,
      name: `Platform key ${index}`,
      prefix: `nzu_live_9000000${digit}`,
      lastFour: digit.repeat(4),
      scopes: ["platform:identity"],
      hash: index.toString(16).padStart(64, "0"),
    });
  }
  return sqlite;
}

function insertKey(sqlite, key) {
  sqlite
    .prepare(
      `INSERT INTO developer_api_keys
        (id, workspace_id, service_id, name, prefix, last_four,
         scopes_json, secret_hash, created_by_account_id,
         created_by_email, created_at, last_used_at, expires_at,
         revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner@example.com',
               1, NULL, ?, NULL)`,
    )
    .run(
      key.id,
      workspaceId,
      key.serviceId,
      key.name,
      key.prefix,
      key.lastFour,
      JSON.stringify(key.scopes),
      key.hash,
      ownerId,
      now + 365 * 24 * 60 * 60 * 1000,
    );
}

function sqliteD1Database(sqlite) {
  return {
    prepare(sql) {
      return sqliteD1Statement(sqlite, sql);
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => {
          const result = sqlite
            .prepare(statement.sql)
            .run(...statement.bindings);
          return {
            success: true,
            results: [],
            meta: { changes: Number(result.changes) },
          };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function sqliteD1Statement(sqlite, sql) {
  return {
    sql,
    bindings: [],
    bind(...values) {
      this.bindings = values;
      return this;
    },
    async first() {
      return sqlite.prepare(sql).get(...this.bindings) ?? null;
    },
    async all() {
      return {
        success: true,
        results: sqlite.prepare(sql).all(...this.bindings),
      };
    },
    async run() {
      const result = sqlite.prepare(sql).run(...this.bindings);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes) },
      };
    },
  };
}
