import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  findPublicRpcAccessPolicy,
  getDeveloperRpcAccessPolicy,
  updateDeveloperRpcAccessPolicy,
} from "../lib/server/database.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const serviceId = "33333333-3333-4333-8333-333333333333";
const managementKeyId = "55555555-5555-4555-8555-555555555555";
const actor = {
  accountId,
  email: "owner@example.com",
};

test("RPC policies persist with optimistic revisions and redacted audit detail", async () => {
  const sqlite = await createPolicyDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const initial = await getDeveloperRpcAccessPolicy({
      actor,
      serviceId,
      database,
    });
    assert.deepEqual(initial, {
      serviceId,
      workspaceId,
      network: "base",
      revision: 0,
      policy: {
        allowedOrigins: [],
        allowedIpCidrs: [],
        allowedMethods: [],
      },
      updatedAt: null,
    });

    const saved = await updateDeveloperRpcAccessPolicy({
      actor,
      serviceId,
      expectedRevision: 0,
      policy: {
        allowedOrigins: ["https://app.example.com"],
        allowedIpCidrs: ["203.0.113.0/24"],
        allowedMethods: ["eth_chainId", "eth_getBalance"],
      },
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(saved?.revision, 1);
    assert.deepEqual(saved?.policy.allowedMethods, [
      "eth_chainId",
      "eth_getBalance",
    ]);

    await assert.rejects(
      () =>
        updateDeveloperRpcAccessPolicy({
          actor,
          serviceId,
          expectedRevision: 0,
          policy: {
            allowedOrigins: [],
            allowedIpCidrs: [],
            allowedMethods: [],
          },
          now: 1_800_000_000_001,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "rpc_access_policy_conflict",
    );

    const publicPolicy = await findPublicRpcAccessPolicy({
      serviceId,
      database,
    });
    assert.equal(publicPolicy?.revision, 1);
    const audit = sqlite
      .prepare(
        `SELECT detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'rpc_access_policy.updated'`,
      )
      .get();
    assert.deepEqual(JSON.parse(audit.detailJson), {
      revision: 1,
      allowedOriginsCount: 1,
      allowedIpCidrsCount: 1,
      allowedMethodsCount: 2,
    });
    assert.equal(audit.detailJson.includes("app.example.com"), false);
    assert.equal(audit.detailJson.includes("203.0.113.0"), false);
    assert.equal(audit.detailJson.includes("eth_chainId"), false);
  } finally {
    sqlite.close();
  }
});

test("RPC policy updates cannot widen the platform method policy", async () => {
  const sqlite = await createPolicyDatabase();
  try {
    await assert.rejects(
      () =>
        updateDeveloperRpcAccessPolicy({
          actor,
          serviceId,
          expectedRevision: 0,
          policy: {
            allowedOrigins: [],
            allowedIpCidrs: [],
            allowedMethods: ["admin_nodeInfo"],
          },
          database: sqliteD1Database(sqlite),
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 422 &&
        error.code === "rpc_access_policy_method_invalid",
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM developer_rpc_access_policies",
        )
        .get().count,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("service management keys update policy with key-attributed audit", async () => {
  const sqlite = await createPolicyDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const initial = await getDeveloperRpcAccessPolicy({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId,
      now: 1_800_000_000_000,
      database,
    });
    assert.equal(initial?.revision, 0);

    const saved = await updateDeveloperRpcAccessPolicy({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId,
      expectedRevision: 0,
      policy: {
        allowedOrigins: ["https://automation.example.com"],
        allowedIpCidrs: [],
        allowedMethods: ["eth_chainId"],
      },
      now: 1_800_000_000_001,
      database,
    });
    assert.equal(saved?.revision, 1);
    const audit = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId,
                detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'rpc_access_policy.updated'`,
      )
      .get();
    assert.deepEqual(
      {
        actorAccountId: audit.actorAccountId,
        actorEmail: audit.actorEmail,
        apiKeyId: audit.apiKeyId,
      },
      {
        actorAccountId: null,
        actorEmail: null,
        apiKeyId: managementKeyId,
      },
    );
    assert.equal(
      audit.detailJson.includes("automation.example.com"),
      false,
    );
  } finally {
    sqlite.close();
  }
});

test("semantically corrupt stored policies fail closed", async () => {
  const sqlite = await createPolicyDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    await updateDeveloperRpcAccessPolicy({
      actor,
      serviceId,
      expectedRevision: 0,
      policy: {
        allowedOrigins: [],
        allowedIpCidrs: [],
        allowedMethods: ["eth_chainId"],
      },
      database,
    });
    sqlite
      .prepare(
        `UPDATE developer_rpc_access_policies
         SET allowed_origins_json = '["https://*.example.com"]'
         WHERE service_id = ?`,
      )
      .run(serviceId);
    await assert.rejects(
      () => findPublicRpcAccessPolicy({ serviceId, database }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 503 &&
        error.code === "rpc_access_policy_unavailable",
    );
  } finally {
    sqlite.close();
  }
});

async function createPolicyDatabase() {
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
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES (?, 'policy-workspace', 'Policy workspace', 'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('44444444-4444-4444-8444-444444444444', ?, ?,
               'owner@example.com', 'owner', 1, 1)`,
    )
    .run(workspaceId, accountId);
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
       VALUES (?, ?, NULL, 'Service automation', 'nzu_live_55555555',
               'beef', '["services:manage"]', ?, ?,
               'owner@example.com', 1, NULL, ?, NULL)`,
    )
    .run(
      managementKeyId,
      workspaceId,
      "e".repeat(64),
      accountId,
      1_900_000_000_000,
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
