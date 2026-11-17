import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  createDeveloperApiKey,
  listDeveloperApiKeysForApiKey,
  revokeDeveloperApiKey,
  rotateDeveloperApiKey,
} from "../lib/server/database.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceA = "11111111-1111-4111-8111-111111111111";
const workspaceB = "22222222-2222-4222-8222-222222222222";
const managementKeyId = "33333333-3333-4333-8333-333333333333";
const serviceId = "44444444-4444-4444-8444-444444444444";
const tenantBKeyId = "55555555-5555-4555-8555-555555555555";
const now = 1_800_000_000_000;

test("control-plane API-key lifecycle stays tenant-bound and attributes automation", async () => {
  const sqlite = await createLifecycleDatabase();
  const database = sqliteD1Database(sqlite);
  const createdId = "66666666-6666-4666-8666-666666666666";
  try {
    const initial = await listDeveloperApiKeysForApiKey({
      workspaceId: workspaceA,
      authorizationApiKeyId: managementKeyId,
      now,
      database,
    });
    assert.equal(initial.some((key) => key.id === managementKeyId), true);
    assert.equal(initial.some((key) => key.id === tenantBKeyId), false);

    const created = await createDeveloperApiKey({
      workspaceId: workspaceA,
      authorizationApiKeyId: managementKeyId,
      id: createdId,
      name: "Base production callable",
      prefix: "nzu_live_66666666",
      lastFour: "abcd",
      secretHash: "6".repeat(64),
      serviceId,
      scopes: ["rpc:invoke"],
      idempotencyHash: "a".repeat(64),
      requestHash: "b".repeat(64),
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      now,
      database,
    });
    assert.equal(created.serviceId, serviceId);
    assert.deepEqual(created.scopes, ["rpc:invoke"]);
    const stored = sqlite
      .prepare(
        `SELECT created_by_account_id AS accountId,
                created_by_email AS email
         FROM developer_api_keys WHERE id = ?`,
      )
      .get(createdId);
    assert.equal(stored.accountId, null);
    assert.equal(stored.email, null);
    const createdAudit = sqlite
      .prepare(
        `SELECT api_key_id AS apiKeyId, entity_id AS entityId,
                detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'api_key.created' AND entity_id = ?`,
      )
      .get(createdId);
    assert.equal(createdAudit.apiKeyId, managementKeyId);
    assert.equal(createdAudit.entityId, createdId);
    assert.equal(createdAudit.detailJson.includes("secret"), false);

    await assert.rejects(
      () =>
        createDeveloperApiKey({
          workspaceId: workspaceA,
          authorizationApiKeyId: managementKeyId,
          id: "77777777-7777-4777-8777-777777777777",
          name: "Retry callable",
          prefix: "nzu_live_77777777",
          lastFour: "efgh",
          secretHash: "7".repeat(64),
          serviceId,
          scopes: ["rpc:invoke"],
          idempotencyHash: "a".repeat(64),
          requestHash: "b".repeat(64),
          expiresAt: now + 365 * 24 * 60 * 60 * 1000,
          now: now + 1,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.code === "api_key_secret_already_issued",
    );

    const crossTenant = await revokeDeveloperApiKey({
      workspaceId: workspaceA,
      authorizationApiKeyId: managementKeyId,
      id: tenantBKeyId,
      now: now + 2,
      database,
    });
    assert.equal(crossTenant, null);
    assert.equal(
      sqlite
        .prepare("SELECT revoked_at AS revokedAt FROM developer_api_keys WHERE id = ?")
        .get(tenantBKeyId).revokedAt,
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("management key can rotate and then revoke itself without losing atomicity", async () => {
  const sqlite = await createLifecycleDatabase();
  const database = sqliteD1Database(sqlite);
  const replacementId = "88888888-8888-4888-8888-888888888888";
  try {
    const replacement = await rotateDeveloperApiKey({
      workspaceId: workspaceA,
      authorizationApiKeyId: managementKeyId,
      sourceId: managementKeyId,
      id: replacementId,
      name: "Replacement automation",
      prefix: "nzu_live_88888888",
      lastFour: "wxyz",
      secretHash: "8".repeat(64),
      expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      idempotencyHash: "c".repeat(64),
      requestHash: "d".repeat(64),
      now,
      database,
    });
    assert.ok(replacement);
    assert.equal(replacement.serviceId, null);
    assert.deepEqual(replacement.scopes, ["services:manage"]);
    const source = sqlite
      .prepare("SELECT revoked_at AS revokedAt FROM developer_api_keys WHERE id = ?")
      .get(managementKeyId);
    assert.equal(source.revokedAt, now);
    const rotationAudit = sqlite
      .prepare(
        `SELECT api_key_id AS apiKeyId, entity_id AS entityId
         FROM developer_audit_events WHERE action = 'api_key.rotated'`,
      )
      .get();
    assert.equal(rotationAudit.apiKeyId, managementKeyId);
    assert.equal(rotationAudit.entityId, replacementId);

    const revoked = await revokeDeveloperApiKey({
      workspaceId: workspaceA,
      authorizationApiKeyId: replacementId,
      id: replacementId,
      now: now + 1,
      database,
    });
    assert.equal(revoked?.revokedAt, now + 1);
    const revokeAudit = sqlite
      .prepare(
        `SELECT api_key_id AS apiKeyId, entity_id AS entityId
         FROM developer_audit_events
         WHERE action = 'api_key.revoked'`,
      )
      .get();
    assert.equal(revokeAudit.apiKeyId, replacementId);
    assert.equal(revokeAudit.entityId, replacementId);
  } finally {
    sqlite.close();
  }
});

test("control-plane lifecycle rejects ambiguous, expired, bound, wrong-scope, and cross-tenant principals", async () => {
  const sqlite = await createLifecycleDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    await assert.rejects(
      () =>
        createDeveloperApiKey({
          actorEmail: "owner@example.com",
          workspaceId: workspaceA,
          authorizationApiKeyId: managementKeyId,
          id: "99999999-9999-4999-8999-999999999999",
          name: "Ambiguous principal",
          prefix: "nzu_live_99999999",
          lastFour: "ijkl",
          secretHash: "9".repeat(64),
          expiresAt: now + 1_000,
          now,
          database,
        }),
      (error) =>
        error instanceof TypeError &&
        /exactly one developer API key authorization principal/.test(
          error.message,
        ),
    );

    for (const [apiKeyId, code] of [
      ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "api_key_invalid"],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "api_key_scope_denied"],
      ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "api_key_scope_denied"],
    ]) {
      await assert.rejects(
        () =>
          listDeveloperApiKeysForApiKey({
            workspaceId: workspaceA,
            authorizationApiKeyId: apiKeyId,
            now,
            database,
          }),
        (error) =>
          error instanceof HttpProblem && error.code === code,
      );
    }

    await assert.rejects(
      () =>
        listDeveloperApiKeysForApiKey({
          workspaceId: workspaceB,
          authorizationApiKeyId: managementKeyId,
          now,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 401 &&
        error.code === "api_key_invalid",
    );
  } finally {
    sqlite.close();
  }
});

async function createLifecycleDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = (await readdir(path.resolve("drizzle")))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  for (const filename of migrations) {
    const sql = await readFile(path.join("drizzle", filename), "utf8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  for (const [id, slug] of [
    [workspaceA, "workspace-a"],
    [workspaceB, "workspace-b"],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO developer_workspaces
          (id, slug, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', 1, 1)`,
      )
      .run(id, slug, slug);
  }
  sqlite
    .prepare(
      `INSERT INTO developer_services
        (id, workspace_id, product, name, environment, network, region,
         status, endpoint_path, configuration_json,
         created_by_account_id, created_at, updated_at, archived_at)
       VALUES (?, ?, 'rpc-api', 'Base RPC', 'production', 'base',
               'global', 'active', ?, '{}', NULL, 1, 1, NULL)`,
    )
    .run(serviceId, workspaceA, `/api/v1/rpc/${serviceId}`);
  insertKey(sqlite, {
    id: managementKeyId,
    workspaceId: workspaceA,
    serviceId: null,
    scopes: ["services:manage"],
    expiresAt: now + 10_000,
  });
  insertKey(sqlite, {
    id: tenantBKeyId,
    workspaceId: workspaceB,
    serviceId: null,
    scopes: ["services:manage"],
    expiresAt: now + 10_000,
  });
  insertKey(sqlite, {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspaceId: workspaceA,
    serviceId: null,
    scopes: ["services:manage"],
    expiresAt: now,
  });
  insertKey(sqlite, {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workspaceId: workspaceA,
    serviceId,
    scopes: ["services:manage"],
    expiresAt: now + 10_000,
  });
  insertKey(sqlite, {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    workspaceId: workspaceA,
    serviceId: null,
    scopes: ["platform:identity"],
    expiresAt: now + 10_000,
  });
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
       VALUES (?, ?, ?, 'Fixture key', ?, 'test', ?, ?, NULL, NULL,
               1, NULL, ?, NULL)`,
    )
    .run(
      key.id,
      key.workspaceId,
      key.serviceId,
      `nzu_live_${key.id.slice(0, 8)}`,
      JSON.stringify(key.scopes),
      key.id.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      key.expiresAt,
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
