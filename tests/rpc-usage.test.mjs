import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { getDeveloperRpcUsage } from "../lib/server/database.ts";
import { HttpProblem } from "../lib/server/http.ts";
import {
  parseDeveloperRpcUsageWindow,
  serializeDeveloperRpcUsage,
} from "../lib/server/rpc-usage.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const apiKeyId = "44444444-4444-4444-8444-444444444444";
const managementKeyId = "55555555-5555-4555-8555-555555555555";
const actor = {
  accountId,
  email: "owner@example.com",
};
const now = 1_800_000_000_000;
const hourMs = 60 * 60 * 1000;
const currentHourStart = Math.floor(now / hourMs) * hourMs;

test("RPC usage windows are exact and bounded", () => {
  assert.equal(parseDeveloperRpcUsageWindow(null), "24h");
  assert.equal(parseDeveloperRpcUsageWindow("7d"), "7d");
  assert.throws(
    () => parseDeveloperRpcUsageWindow("90d"),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 400 &&
      error.code === "rpc_usage_window_invalid",
  );
});

test("RPC usage is tenant-scoped, zero-filled, and secret-free", async () => {
  const sqlite = await createUsageDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const report = await getDeveloperRpcUsage({
      actor,
      serviceId,
      window: "24h",
      now,
      database,
    });
    assert.ok(report);
    assert.equal(report.series.length, 24);
    assert.deepEqual(
      {
        quotaUnits: report.summary.quotaUnits,
        requests: report.summary.requests,
        calls: report.summary.calls,
        errors: report.summary.errors,
        upstreamFailures: report.summary.upstreamFailures,
        latencyMsTotal: report.summary.latencyMsTotal,
        bytesIn: report.summary.bytesIn,
        bytesOut: report.summary.bytesOut,
      },
      {
        quotaUnits: 15,
        requests: 3,
        calls: 5,
        errors: 1,
        upstreamFailures: 1,
        latencyMsTotal: 70,
        bytesIn: 140,
        bytesOut: 280,
      },
    );
    assert.deepEqual(report.currentHourQuota, {
      serviceUnits: 10,
      workspaceUnits: 12,
      workspaceLimit: 100,
      workspaceRemaining: 88,
      resetAt: currentHourStart + hourMs,
    });
    assert.equal(report.apiKeys.length, 1);
    assert.equal(report.apiKeys[0].id, apiKeyId);

    const serialized = serializeDeveloperRpcUsage(report);
    assert.equal(serialized.summary.averageLatencyMs, 23.33);
    assert.equal(serialized.summary.successRate, 0.8);
    assert.equal(serialized.series.length, 24);
    assert.equal(serialized.apiKeys[0].lastFour, "cdef");
    assert.equal(JSON.stringify(serialized).includes("secretHash"), false);
    assert.equal(JSON.stringify(serialized).includes(workspaceId), false);

    const otherWorkspace = await getDeveloperRpcUsage({
      actor: {
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "other@example.com",
      },
      serviceId,
      window: "24h",
      now,
      database,
    });
    assert.equal(otherWorkspace, null);
  } finally {
    sqlite.close();
  }
});

test("30 day RPC usage always returns 30 daily points", async () => {
  const sqlite = await createUsageDatabase();
  try {
    const report = await getDeveloperRpcUsage({
      actor,
      serviceId,
      window: "30d",
      now,
      database: sqliteD1Database(sqlite),
    });
    assert.equal(report?.resolution, "1d");
    assert.equal(report?.series.length, 30);
  } finally {
    sqlite.close();
  }
});

test("service management keys read usage only inside their workspace", async () => {
  const sqlite = await createUsageDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const report = await getDeveloperRpcUsage({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId,
      window: "7d",
      now,
      database,
    });
    assert.equal(report?.service.id, serviceId);
    assert.equal(report?.series.length, 28);

    await assert.rejects(
      () =>
        getDeveloperRpcUsage({
          workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          authorizationApiKeyId: managementKeyId,
          serviceId,
          window: "24h",
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

async function createUsageDatabase() {
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
    .run(accountId);
  sqlite
    .prepare(
      `INSERT INTO auth_users
        (id, name, email, email_verified, created_at, updated_at)
       VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Other',
               'other@example.com', 1, 1, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES (?, 'usage-workspace', 'Usage workspace', 'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
               'other-workspace', 'Other workspace', 'active', 1, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ?, ?,
               'owner@example.com', 'owner', 1, 1)`,
    )
    .run(workspaceId, accountId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
               'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
               'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               'other@example.com', 'owner', 1, 1)`,
    )
    .run();
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
      accountId,
    );
  sqlite
    .prepare(
      `INSERT INTO developer_api_keys
        (id, workspace_id, service_id, name, prefix, last_four,
         scopes_json, secret_hash, created_by_account_id,
         created_by_email, created_at, last_used_at, expires_at,
         revoked_at)
       VALUES (?, ?, ?, 'Production key', 'nzu_live_44444444', 'cdef',
               '["rpc:invoke"]', ?, ?, 'owner@example.com',
               1, ?, ?, NULL)`,
    )
    .run(
      apiKeyId,
      workspaceId,
      serviceId,
      "f".repeat(64),
      accountId,
      now - 100,
      now + 365 * 24 * hourMs,
    );
  sqlite
    .prepare(
      `INSERT INTO developer_api_keys
        (id, workspace_id, service_id, name, prefix, last_four,
         scopes_json, secret_hash, created_by_account_id,
         created_by_email, created_at, last_used_at, expires_at,
         revoked_at)
       VALUES (?, ?, NULL, 'Service automation', 'nzu_live_55555555',
               'beef', '["services:manage"]', ?, ?,
               'owner@example.com', 1, NULL, ?, NULL)`,
    )
    .run(
      managementKeyId,
      workspaceId,
      "e".repeat(64),
      accountId,
      now + 365 * 24 * hourMs,
    );
  insertUsageBucket(sqlite, {
    id: `${serviceId}:${apiKeyId}:${currentHourStart}`,
    bucketStart: currentHourStart,
    quotaUnits: 10,
    requests: 2,
    calls: 3,
    errors: 1,
    upstreamFailures: 1,
    latencyMsTotal: 50,
    bytesIn: 100,
    bytesOut: 200,
    lastRequestAt: now - 100,
  });
  insertUsageBucket(sqlite, {
    id: `${serviceId}:${apiKeyId}:${currentHourStart - hourMs}`,
    bucketStart: currentHourStart - hourMs,
    quotaUnits: 5,
    requests: 1,
    calls: 2,
    errors: 0,
    upstreamFailures: 0,
    latencyMsTotal: 20,
    bytesIn: 40,
    bytesOut: 80,
    lastRequestAt: currentHourStart - 100,
  });
  sqlite
    .prepare(
      `INSERT INTO ethereum_rpc_workspace_quota_buckets
        (id, workspace_id, bucket_start, quota_units, quota_limit,
         updated_at, expires_at)
       VALUES (?, ?, ?, 12, 100, ?, ?)`,
    )
    .run(
      `${workspaceId}:${currentHourStart}`,
      workspaceId,
      currentHourStart,
      now,
      now + 35 * 24 * hourMs,
    );
  return sqlite;
}

function insertUsageBucket(sqlite, metrics) {
  sqlite
    .prepare(
      `INSERT INTO ethereum_rpc_usage_buckets
        (id, workspace_id, service_id, api_key_id, bucket_start,
         quota_units, quota_limit, request_count, rpc_call_count,
         error_count, upstream_failure_count, latency_ms_total,
         bytes_in, bytes_out, last_request_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      metrics.id,
      workspaceId,
      serviceId,
      apiKeyId,
      metrics.bucketStart,
      metrics.quotaUnits,
      metrics.requests,
      metrics.calls,
      metrics.errors,
      metrics.upstreamFailures,
      metrics.latencyMsTotal,
      metrics.bytesIn,
      metrics.bytesOut,
      metrics.lastRequestAt,
      now,
      now + 35 * 24 * hourMs,
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
