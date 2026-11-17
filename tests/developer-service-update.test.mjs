import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  getDeveloperService,
  updateDeveloperService,
} from "../lib/server/database.ts";
import { validateDeveloperServiceUpdatePayload } from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const managementKeyId = "44444444-4444-4444-8444-444444444444";
const separateWorkspaceId =
  "55555555-5555-4555-8555-555555555555";
const separateAccountId =
  "66666666-6666-4666-8666-666666666666";
const adminAccountId =
  "77777777-7777-4777-8777-777777777777";
const developerAccountId =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = {
  accountId,
  email: "owner@example.com",
};

test("service rename payloads require an exact name and timestamp", () => {
  assert.deepEqual(
    validateDeveloperServiceUpdatePayload({
      name: "Ethereum primary",
      updatedAt: "1970-01-01T00:00:01.000Z",
    }),
    {
      ok: true,
      value: {
        name: "Ethereum primary",
        updatedAt: 1_000,
      },
    },
  );
  for (const payload of [
    { name: "Ethereum primary" },
    {
      name: "Ethereum primary",
      updatedAt: "1970-01-01T00:00:01Z",
    },
    {
      name: "Ethereum primary",
      updatedAt: "1970-01-01T00:00:01.000Z",
      network: "base",
    },
    {
      name: " ",
      updatedAt: "1970-01-01T00:00:01.000Z",
    },
  ]) {
    assert.equal(validateDeveloperServiceUpdatePayload(payload).ok, false);
  }
});

test("workspace members rename active services with optimistic concurrency", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const renamed = await updateDeveloperService({
      actor,
      id: serviceId,
      input: {
        name: "Ethereum primary",
        updatedAt: 1_000,
      },
      now: 1_000,
      database,
    });
    assert.equal(renamed?.name, "Ethereum primary");
    assert.equal(renamed?.updatedAt, 1_001);

    const audit = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId,
                detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'service.updated'`,
      )
      .get();
    assert.deepEqual(
      {
        actorAccountId: audit.actorAccountId,
        actorEmail: audit.actorEmail,
        apiKeyId: audit.apiKeyId,
        detail: JSON.parse(audit.detailJson),
      },
      {
        actorAccountId: accountId,
        actorEmail: "owner@example.com",
        apiKeyId: null,
        detail: { field: "name" },
      },
    );
    assert.equal(audit.detailJson.includes("Ethereum"), false);

    const noOp = await updateDeveloperService({
      actor,
      id: serviceId,
      input: {
        name: "Ethereum primary",
        updatedAt: 1_001,
      },
      now: 1_002,
      database,
    });
    assert.equal(noOp?.updatedAt, 1_001);
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM developer_audit_events
           WHERE action = 'service.updated'`,
        )
        .get().count,
      1,
    );

    await assert.rejects(
      () =>
        updateDeveloperService({
          actor,
          id: serviceId,
          input: {
            name: "Stale rename",
            updatedAt: 1_000,
          },
          now: 1_003,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "service_update_conflict",
    );
  } finally {
    sqlite.close();
  }
});

test("management keys rename only their tenant and receive redacted attribution", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const renamed = await updateDeveloperService({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      id: serviceId,
      input: {
        name: "Ethereum automation",
        updatedAt: 1_000,
      },
      now: 1_100,
      database,
    });
    assert.equal(renamed?.name, "Ethereum automation");
    const audit = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId,
                detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'service.updated'`,
      )
      .get();
    assert.deepEqual(
      {
        actorAccountId: audit.actorAccountId,
        actorEmail: audit.actorEmail,
        apiKeyId: audit.apiKeyId,
        detail: JSON.parse(audit.detailJson),
      },
      {
        actorAccountId: null,
        actorEmail: null,
        apiKeyId: managementKeyId,
        detail: { field: "name" },
      },
    );

    const hidden = await updateDeveloperService({
      actor: {
        accountId: separateAccountId,
        email: "separate@example.com",
      },
      id: serviceId,
      input: {
        name: "Cross tenant",
        updatedAt: 1_100,
      },
      now: 1_200,
      database,
    });
    assert.equal(hidden, null);
  } finally {
    sqlite.close();
  }
});

test("concurrent renames commit one mutation and one audit event", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const results = await Promise.allSettled([
      updateDeveloperService({
        actor,
        id: serviceId,
        input: { name: "First contender", updatedAt: 1_000 },
        now: 1_300,
        database,
      }),
      updateDeveloperService({
        actor,
        id: serviceId,
        input: { name: "Second contender", updatedAt: 1_000 },
        now: 1_300,
        database,
      }),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof HttpProblem &&
          result.reason.code === "service_update_conflict",
      ).length,
      1,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM developer_audit_events
           WHERE action = 'service.updated'`,
        )
        .get().count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("missing and archived services are indistinguishable", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    sqlite
      .prepare(
        `UPDATE developer_services
         SET status = 'archived', archived_at = 1_100, updated_at = 1_100
         WHERE id = ?`,
      )
      .run(serviceId);
    for (const id of [
      serviceId,
      "77777777-7777-4777-8777-777777777777",
    ]) {
      assert.equal(
        await updateDeveloperService({
          actor,
          id,
          input: {
            name: "Unavailable",
            updatedAt: 1_100,
          },
          now: 1_200,
          database,
        }),
        null,
      );
    }
  } finally {
    sqlite.close();
  }
});

test("single-service reads allow all workspace roles and aggregate only current tenant telemetry", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    sqlite
      .prepare(
        `INSERT INTO ethereum_rpc_usage_buckets
          (id, workspace_id, service_id, api_key_id, bucket_start,
           quota_units, quota_limit, request_count, rpc_call_count,
           error_count, upstream_failure_count, latency_ms_total,
           bytes_in, bytes_out, last_request_at, updated_at, expires_at)
         VALUES ('read-usage', ?, ?, ?, 100, 3, 100, 2, 3, 1, 0,
                 100, 20, 30, 900, 900, 2_000)`,
      )
      .run(workspaceId, serviceId, managementKeyId);

    for (const currentActor of [
      actor,
      { accountId: adminAccountId, email: "admin@example.com" },
      {
        accountId: developerAccountId,
        email: "developer@example.com",
      },
    ]) {
      const service = await getDeveloperService({
        actor: currentActor,
        serviceId,
        now: 1_000,
        database,
      });
      assert.equal(service?.id, serviceId);
      assert.deepEqual(service?.telemetry, {
        requests: 2,
        calls: 3,
        errors: 1,
        upstreamFailures: 0,
        averageLatencyMs: 50,
        windowStartedAt: 100,
        updatedAt: 900,
      });
    }

    const hidden = await getDeveloperService({
      actor: {
        accountId: separateAccountId,
        email: "separate@example.com",
      },
      serviceId,
      now: 1_000,
      database,
    });
    assert.equal(hidden, null);
  } finally {
    sqlite.close();
  }
});

test("single-service automation reads recheck an active unbound management key", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const service = await getDeveloperService({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId,
      now: 1_000,
      database,
    });
    assert.equal(service?.workspaceId, workspaceId);

    await assert.rejects(
      () =>
        getDeveloperService({
          workspaceId: separateWorkspaceId,
          authorizationApiKeyId: managementKeyId,
          serviceId,
          now: 1_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 401 &&
        error.code === "api_key_invalid",
    );

    sqlite
      .prepare(
        `UPDATE developer_api_keys SET service_id = ? WHERE id = ?`,
      )
      .run(serviceId, managementKeyId);
    await assert.rejects(
      () =>
        getDeveloperService({
          workspaceId,
          authorizationApiKeyId: managementKeyId,
          serviceId,
          now: 1_000,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 403 &&
        error.code === "api_key_scope_denied",
    );
  } finally {
    sqlite.close();
  }
});

test("single-service reads accept exactly one authorization principal", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    for (const options of [
      { serviceId },
      {
        actor,
        workspaceId,
        authorizationApiKeyId: managementKeyId,
        serviceId,
      },
      {
        workspaceId,
        serviceId,
      },
    ]) {
      await assert.rejects(
        () => getDeveloperService({ ...options, database }),
        (error) =>
          error instanceof TypeError &&
          error.message ===
            "Provide exactly one developer service authorization principal.",
      );
    }
  } finally {
    sqlite.close();
  }
});

test("single-service reads hide archived and missing records identically", async () => {
  const sqlite = await createServiceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    sqlite
      .prepare(
        `UPDATE developer_services
         SET status = 'archived', archived_at = 1_100, updated_at = 1_100
         WHERE id = ?`,
      )
      .run(serviceId);
    for (const id of [
      serviceId,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ]) {
      assert.equal(
        await getDeveloperService({
          actor,
          serviceId: id,
          now: 1_200,
          database,
        }),
        null,
      );
    }
  } finally {
    sqlite.close();
  }
});

async function createServiceDatabase() {
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
       VALUES (?, 'Owner', 'owner@example.com', 1, 1, 1),
              (?, 'Separate', 'separate@example.com', 1, 1, 1),
              (?, 'Admin', 'admin@example.com', 1, 1, 1),
              (?, 'Developer', 'developer@example.com', 1, 1, 1)`,
    )
    .run(
      accountId,
      separateAccountId,
      adminAccountId,
      developerAccountId,
    );
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES (?, 'service-workspace', 'Service workspace', 'active', 1, 1),
              (?, 'separate-workspace', 'Separate workspace', 'active', 1, 1)`,
    )
    .run(workspaceId, separateWorkspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('88888888-8888-4888-8888-888888888888', ?, ?,
               'owner@example.com', 'owner', 1, 1),
              ('99999999-9999-4999-8999-999999999999', ?, ?,
               'separate@example.com', 'owner', 1, 1),
              ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ?, ?,
               'admin@example.com', 'admin', 1, 1),
              ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ?, ?,
               'developer@example.com', 'developer', 1, 1)`,
    )
    .run(
      workspaceId,
      accountId,
      separateWorkspaceId,
      separateAccountId,
      workspaceId,
      adminAccountId,
      workspaceId,
      developerAccountId,
    );
  sqlite
    .prepare(
      `INSERT INTO developer_services
        (id, workspace_id, product, name, environment, network, region,
         status, endpoint_path, configuration_json, created_by_account_id,
         created_at, updated_at, archived_at)
       VALUES (?, ?, 'rpc-api', 'Ethereum production', 'production',
               'ethereum', 'global', 'active', ?, '{}', ?, 1, 1000, NULL)`,
    )
    .run(
      serviceId,
      workspaceId,
      `/api/v1/rpc/${serviceId}`,
      accountId,
    );
  sqlite
    .prepare(
      `INSERT INTO developer_api_keys
        (id, workspace_id, service_id, name, prefix, last_four,
         scopes_json, secret_hash, created_by_account_id,
         created_by_email, created_at, last_used_at, expires_at,
         revoked_at)
       VALUES (?, ?, NULL, 'Service automation', 'nzu_live_44444444',
               'beef', '["services:manage"]', ?, ?,
               'owner@example.com', 1, NULL, ?, NULL)`,
    )
    .run(
      managementKeyId,
      workspaceId,
      "e".repeat(64),
      accountId,
      2_000_000_000_000,
    );
  return sqlite;
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
