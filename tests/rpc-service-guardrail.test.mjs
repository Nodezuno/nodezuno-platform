import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  findRpcServiceGuardrailForAdmission,
  getDeveloperRpcServiceGuardrail,
  updateDeveloperRpcServiceGuardrail,
} from "../lib/server/database.ts";
import { HttpProblem } from "../lib/server/http.ts";
import {
  RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT,
  RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
  RPC_GUARDRAIL_MAX_WARNING_PERCENT,
  RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
  RPC_GUARDRAIL_MIN_WARNING_PERCENT,
  effectiveRpcServiceHourlyQuota,
  serializeRpcServiceGuardrail,
  validateRpcServiceGuardrailUpdate,
} from "../lib/server/rpc-guardrail.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId =
  "22222222-2222-4222-8222-222222222222";
const ownerAccountId = "33333333-3333-4333-8333-333333333333";
const adminAccountId = "44444444-4444-4444-8444-444444444444";
const developerAccountId =
  "55555555-5555-4555-8555-555555555555";
const viewerAccountId = "66666666-6666-4666-8666-666666666666";
const otherAccountId = "77777777-7777-4777-8777-777777777777";
const rpcServiceId = "88888888-8888-4888-8888-888888888888";
const grpcServiceId = "99999999-9999-4999-8999-999999999999";
const nonRpcServiceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const archivedServiceId =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const managementKeyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const boundKeyId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const wrongScopeKeyId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const expiredKeyId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const now = 1_800_000_000_000;

const owner = {
  accountId: ownerAccountId,
  email: "owner@example.com",
};
const admin = {
  accountId: adminAccountId,
  email: "admin@example.com",
};
const developer = {
  accountId: developerAccountId,
  email: "developer@example.com",
};
const viewer = {
  accountId: viewerAccountId,
  email: "viewer@example.com",
};
const otherOwner = {
  accountId: otherAccountId,
  email: "other@example.com",
};

test("guardrail payload validation is exact and enforces every boundary", () => {
  for (const input of [
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent:
        RPC_GUARDRAIL_MIN_WARNING_PERCENT,
      revision: 0,
    },
    {
      hourlyQuotaLimit: RPC_GUARDRAIL_MIN_HOURLY_QUOTA,
      warningThresholdPercent:
        RPC_GUARDRAIL_MAX_WARNING_PERCENT,
      revision: Number.MAX_SAFE_INTEGER,
    },
    {
      hourlyQuotaLimit: RPC_GUARDRAIL_MAX_HOURLY_QUOTA,
      warningThresholdPercent:
        RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT,
      revision: 1,
    },
  ]) {
    assert.deepEqual(validateRpcServiceGuardrailUpdate(input), {
      ok: true,
      value: input,
    });
  }

  for (const input of [
    null,
    [],
    Object.assign(Object.create(null), {
      hourlyQuotaLimit: null,
      warningThresholdPercent: 80,
      revision: 0,
    }),
    {
      hourlyQuotaLimit: RPC_GUARDRAIL_MIN_HOURLY_QUOTA - 1,
      warningThresholdPercent: 80,
      revision: 0,
    },
    {
      hourlyQuotaLimit: RPC_GUARDRAIL_MAX_HOURLY_QUOTA + 1,
      warningThresholdPercent: 80,
      revision: 0,
    },
    {
      hourlyQuotaLimit: 100.5,
      warningThresholdPercent: 80,
      revision: 0,
    },
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent:
        RPC_GUARDRAIL_MIN_WARNING_PERCENT - 1,
      revision: 0,
    },
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent:
        RPC_GUARDRAIL_MAX_WARNING_PERCENT + 1,
      revision: 0,
    },
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent: 80,
      revision: -1,
    },
    {
      hourlyQuotaLimit: null,
      warningThresholdPercent: 80,
      revision: 0,
      workspaceId,
    },
  ]) {
    assert.equal(
      validateRpcServiceGuardrailUpdate(input).ok,
      false,
      JSON.stringify(input),
    );
  }
});

test("effective quota and serialization never widen the platform limit", () => {
  const inherited = serializeRpcServiceGuardrail({
    guardrail: null,
    platformWorkspaceHourlyQuotaLimit: 10_000,
  });
  assert.deepEqual(inherited, {
    hourlyQuotaLimit: null,
    effectiveHourlyQuotaLimit: 10_000,
    platformWorkspaceHourlyQuotaLimit: 10_000,
    warningThresholdPercent:
      RPC_GUARDRAIL_DEFAULT_WARNING_PERCENT,
    revision: 0,
    inherited: true,
    updatedAt: null,
  });

  const record = {
    serviceId: rpcServiceId,
    workspaceId,
    hourlyQuotaLimit: 2_000,
    warningThresholdPercent: 75,
    revision: 4,
    createdAt: now - 1_000,
    updatedAt: now,
  };
  assert.equal(
    effectiveRpcServiceHourlyQuota({
      guardrail: record,
      platformWorkspaceHourlyQuotaLimit: 1_000,
    }),
    1_000,
  );
  assert.deepEqual(
    serializeRpcServiceGuardrail({
      guardrail: { ...record, hourlyQuotaLimit: null },
      platformWorkspaceHourlyQuotaLimit: 1_000,
    }),
    {
      hourlyQuotaLimit: null,
      effectiveHourlyQuotaLimit: 1_000,
      platformWorkspaceHourlyQuotaLimit: 1_000,
      warningThresholdPercent: 75,
      revision: 4,
      inherited: true,
      updatedAt: new Date(now).toISOString(),
    },
  );

  for (const platformWorkspaceHourlyQuotaLimit of [
    99,
    10_000_001,
    100.5,
    Number.NaN,
  ]) {
    assert.throws(
      () =>
        effectiveRpcServiceHourlyQuota({
          guardrail: null,
          platformWorkspaceHourlyQuotaLimit,
        }),
      TypeError,
    );
  }
});

test("guardrail reads are tenant scoped and honor application roles", async () => {
  const sqlite = await createGuardrailDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    for (const actor of [owner, admin, developer]) {
      const state = await getDeveloperRpcServiceGuardrail({
        actor,
        serviceId: rpcServiceId,
        database,
      });
      assert.equal(state?.service.id, rpcServiceId);
      assert.equal(state?.guardrail, null);
    }
    await assert.rejects(
      () =>
        getDeveloperRpcServiceGuardrail({
          actor: viewer,
          serviceId: rpcServiceId,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "workspace_required",
    );
    assert.equal(
      await getDeveloperRpcServiceGuardrail({
        actor: otherOwner,
        serviceId: rpcServiceId,
        database,
      }),
      null,
    );
    assert.equal(
      await getDeveloperRpcServiceGuardrail({
        actor: owner,
        serviceId: nonRpcServiceId,
        database,
      }),
      null,
    );
    assert.equal(
      await getDeveloperRpcServiceGuardrail({
        actor: owner,
        serviceId: archivedServiceId,
        database,
      }),
      null,
    );
  } finally {
    sqlite.close();
  }
});

test("owners and admins update guardrails with optimistic audit revisions", async () => {
  const sqlite = await createGuardrailDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const first = await updateDeveloperRpcServiceGuardrail({
      actor: owner,
      serviceId: rpcServiceId,
      guardrail: {
        hourlyQuotaLimit: 5_000,
        warningThresholdPercent: 70,
        revision: 0,
      },
      now,
      database,
    });
    assert.deepEqual({ ...first?.guardrail }, {
      serviceId: rpcServiceId,
      workspaceId,
      hourlyQuotaLimit: 5_000,
      warningThresholdPercent: 70,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    const second = await updateDeveloperRpcServiceGuardrail({
      actor: admin,
      serviceId: rpcServiceId,
      guardrail: {
        hourlyQuotaLimit: null,
        warningThresholdPercent: 85,
        revision: 1,
      },
      now: now + 1,
      database,
    });
    assert.equal(second?.guardrail?.revision, 2);
    assert.equal(second?.guardrail?.hourlyQuotaLimit, null);

    await assert.rejects(
      () =>
        updateDeveloperRpcServiceGuardrail({
          actor: owner,
          serviceId: rpcServiceId,
          guardrail: {
            hourlyQuotaLimit: 1_000,
            warningThresholdPercent: 80,
            revision: 1,
          },
          now: now + 2,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "rpc_service_guardrail_conflict",
    );
    await assert.rejects(
      () =>
        updateDeveloperRpcServiceGuardrail({
          actor: developer,
          serviceId: rpcServiceId,
          guardrail: {
            hourlyQuotaLimit: 1_000,
            warningThresholdPercent: 80,
            revision: 2,
          },
          now: now + 2,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 403 &&
        error.code === "workspace_access_denied",
    );

    const audits = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId,
                detail_json AS detailJson
         FROM developer_audit_events
         WHERE action = 'rpc_service_guardrail.updated'
         ORDER BY created_at`,
      )
      .all();
    assert.equal(audits.length, 2);
    assert.deepEqual(
      audits.map((audit) => ({
        actorAccountId: audit.actorAccountId,
        actorEmail: audit.actorEmail,
        apiKeyId: audit.apiKeyId,
        detail: JSON.parse(audit.detailJson),
      })),
      [
        {
          actorAccountId: ownerAccountId,
          actorEmail: owner.email,
          apiKeyId: null,
          detail: {
            revision: 1,
            hourlyQuotaLimit: 5_000,
            warningThresholdPercent: 70,
            inherited: false,
          },
        },
        {
          actorAccountId: adminAccountId,
          actorEmail: admin.email,
          apiKeyId: null,
          detail: {
            revision: 2,
            hourlyQuotaLimit: null,
            warningThresholdPercent: 85,
            inherited: true,
          },
        },
      ],
    );

    sqlite
      .prepare(
        `UPDATE developer_rpc_service_guardrails
         SET revision = 2147483647
         WHERE service_id = ?`,
      )
      .run(rpcServiceId);
    await assert.rejects(
      () =>
        updateDeveloperRpcServiceGuardrail({
          actor: owner,
          serviceId: rpcServiceId,
          guardrail: {
            hourlyQuotaLimit: 1_000,
            warningThresholdPercent: 80,
            revision: 2_147_483_647,
          },
          now: now + 3,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "rpc_service_guardrail_revision_exhausted",
    );
  } finally {
    sqlite.close();
  }
});

test("only active unbound services:manage keys control guardrails", async () => {
  const sqlite = await createGuardrailDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const initial = await getDeveloperRpcServiceGuardrail({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId: grpcServiceId,
      now,
      database,
    });
    assert.equal(initial?.service.product, "grpc-api");
    const saved = await updateDeveloperRpcServiceGuardrail({
      workspaceId,
      authorizationApiKeyId: managementKeyId,
      serviceId: grpcServiceId,
      guardrail: {
        hourlyQuotaLimit: 2_500,
        warningThresholdPercent: 75,
        revision: 0,
      },
      now,
      database,
    });
    assert.equal(saved?.guardrail?.revision, 1);
    const audit = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId
         FROM developer_audit_events
         WHERE action = 'rpc_service_guardrail.updated'`,
      )
      .get();
    assert.deepEqual({ ...audit }, {
      actorAccountId: null,
      actorEmail: null,
      apiKeyId: managementKeyId,
    });

    for (const authorizationApiKeyId of [
      boundKeyId,
      wrongScopeKeyId,
    ]) {
      await assert.rejects(
        () =>
          getDeveloperRpcServiceGuardrail({
            workspaceId,
            authorizationApiKeyId,
            serviceId: rpcServiceId,
            now,
            database,
          }),
        (error) =>
          error instanceof HttpProblem &&
          error.status === 403 &&
          error.code === "api_key_scope_denied",
      );
    }
    await assert.rejects(
      () =>
        getDeveloperRpcServiceGuardrail({
          workspaceId,
          authorizationApiKeyId: expiredKeyId,
          serviceId: rpcServiceId,
          now,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 401 &&
        error.code === "api_key_invalid",
    );
    await assert.rejects(
      () =>
        getDeveloperRpcServiceGuardrail({
          workspaceId: otherWorkspaceId,
          authorizationApiKeyId: managementKeyId,
          serviceId: rpcServiceId,
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

test("semantically invalid stored guardrails fail closed", async () => {
  const database = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return {
            serviceId: rpcServiceId,
            workspaceId,
            hourlyQuotaLimit: 99,
            warningThresholdPercent: 80,
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          };
        },
      };
    },
  };
  await assert.rejects(
    () =>
      findRpcServiceGuardrailForAdmission({
        serviceId: rpcServiceId,
        workspaceId,
        database,
      }),
    (error) =>
      error instanceof HttpProblem &&
      error.status === 503 &&
      error.code === "rpc_service_guardrail_unavailable",
  );
});

test("HTTP RPC and native gRPC apply the same durable service ceiling", async () => {
  const [httpRoute, grpcAuthorization, cors] = await Promise.all([
    readFile(
      new URL(
        "../app/api/v1/rpc/[serviceId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/grpc-authorization.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/rpc-cors.ts", import.meta.url),
      "utf8",
    ),
  ]);
  for (const source of [httpRoute, grpcAuthorization]) {
    const service = source.indexOf(
      "const guardrail = await findRpcServiceGuardrailForAdmission",
    );
    const effective = source.indexOf(
      "effectiveRpcServiceHourlyQuota",
      service,
    );
    const admission = source.indexOf("await consumeRpcQuota", effective);
    assert.ok(service >= 0);
    assert.ok(effective > service);
    assert.ok(admission > effective);
    assert.match(
      source.slice(effective, admission + 800),
      /serviceLimit/,
    );
  }
  for (const header of [
    "X-Nodezuno-Service-RateLimit-Limit",
    "X-Nodezuno-Service-RateLimit-Remaining",
    "X-Nodezuno-Service-Quota-Warning-Threshold",
    "X-Nodezuno-Service-Quota-Warning",
  ]) {
    assert.match(httpRoute, new RegExp(header));
    assert.match(cors, new RegExp(header));
  }
});

test("guardrail migration and snapshot add only the two intended tables", async () => {
  const previous = JSON.parse(
    await readFile(
      new URL("../drizzle/meta/0012_snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const current = JSON.parse(
    await readFile(
      new URL("../drizzle/meta/0013_snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(current.prevId, previous.id);
  assert.deepEqual(
    Object.keys(current.tables)
      .filter((name) => !(name in previous.tables))
      .sort(),
    [
      "developer_rpc_service_guardrails",
      "ethereum_rpc_service_quota_buckets",
    ],
  );
  assert.deepEqual(
    Object.keys(previous.tables).filter(
      (name) => !(name in current.tables),
    ),
    [],
  );
  for (const [name, table] of Object.entries(previous.tables)) {
    assert.deepEqual(current.tables[name], table, name);
  }
  assert.equal(
    current.tables.developer_rpc_service_guardrails.columns
      .hourly_quota_limit.notNull,
    false,
  );
  assert.equal(
    current.tables.admin_audit_events.columns.id.notNull,
    true,
  );

  const sqlite = await createGuardrailDatabase();
  try {
    assert.equal(
      sqlite.prepare("PRAGMA quick_check").get().quick_check,
      "ok",
    );
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    const quotaColumn = sqlite
      .prepare(
        "PRAGMA table_info(developer_rpc_service_guardrails)",
      )
      .all()
      .find((column) => column.name === "hourly_quota_limit");
    assert.equal(quotaColumn.notnull, 0);
    for (const name of [
      "developer_rpc_service_guardrails_workspace_service_unique",
      "developer_rpc_service_guardrails_update_id_unique",
      "developer_rpc_service_guardrails_workspace_updated_idx",
      "ethereum_rpc_service_quota_service_bucket_unique",
      "ethereum_rpc_service_quota_workspace_service_bucket_idx",
      "ethereum_rpc_service_quota_expiry_idx",
    ]) {
      assert.ok(
        sqlite
          .prepare(
            "SELECT 1 AS present FROM sqlite_master WHERE name = ?",
          )
          .get(name),
        name,
      );
    }
  } finally {
    sqlite.close();
  }
});

async function createGuardrailDatabase() {
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

  for (const [id, name, email] of [
    [ownerAccountId, "Owner", owner.email],
    [adminAccountId, "Admin", admin.email],
    [developerAccountId, "Developer", developer.email],
    [viewerAccountId, "Viewer", viewer.email],
    [otherAccountId, "Other", otherOwner.email],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO auth_users
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, 1, 1, 1)`,
      )
      .run(id, name, email);
  }
  sqlite.exec(`
    INSERT INTO developer_workspaces
      (id, slug, name, status, created_at, updated_at)
    VALUES
      ('${workspaceId}', 'guardrail-workspace', 'Guardrail workspace',
       'active', 1, 1),
      ('${otherWorkspaceId}', 'other-workspace', 'Other workspace',
       'active', 1, 1);
  `);
  for (const [id, targetWorkspaceId, accountId, email, role] of [
    [
      "10101010-1010-4010-8010-101010101010",
      workspaceId,
      ownerAccountId,
      owner.email,
      "owner",
    ],
    [
      "20202020-2020-4020-8020-202020202020",
      workspaceId,
      adminAccountId,
      admin.email,
      "admin",
    ],
    [
      "30303030-3030-4030-8030-303030303030",
      workspaceId,
      developerAccountId,
      developer.email,
      "developer",
    ],
    [
      "50505050-5050-4050-8050-505050505050",
      otherWorkspaceId,
      otherAccountId,
      otherOwner.email,
      "owner",
    ],
  ]) {
    sqlite
      .prepare(
        `INSERT INTO developer_workspace_members
          (id, workspace_id, account_id, email, role, created_at,
           updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
      )
      .run(id, targetWorkspaceId, accountId, email, role);
  }
  for (const service of [
    {
      id: rpcServiceId,
      product: "rpc-api",
      name: "Base RPC",
      network: "base",
      archivedAt: null,
    },
    {
      id: grpcServiceId,
      product: "grpc-api",
      name: "Ethereum gRPC",
      network: "ethereum",
      archivedAt: null,
    },
    {
      id: nonRpcServiceId,
      product: "webhooks",
      name: "Webhooks",
      network: "ethereum",
      archivedAt: null,
    },
    {
      id: archivedServiceId,
      product: "rpc-api",
      name: "Archived RPC",
      network: "ethereum",
      archivedAt: 2,
    },
  ]) {
    sqlite
      .prepare(
        `INSERT INTO developer_services
          (id, workspace_id, product, name, environment, network, region,
           status, endpoint_path, configuration_json,
           created_by_account_id, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, 'production', ?, 'global', 'active', ?,
                 '{}', ?, 1, 1, ?)`,
      )
      .run(
        service.id,
        workspaceId,
        service.product,
        service.name,
        service.network,
        `/api/v1/rpc/${service.id}`,
        ownerAccountId,
        service.archivedAt,
      );
  }
  for (const key of [
    {
      id: managementKeyId,
      serviceId: null,
      scopes: '["services:manage"]',
      expiresAt: now + 10_000,
    },
    {
      id: boundKeyId,
      serviceId: rpcServiceId,
      scopes: '["services:manage"]',
      expiresAt: now + 10_000,
    },
    {
      id: wrongScopeKeyId,
      serviceId: null,
      scopes: '["rpc:read"]',
      expiresAt: now + 10_000,
    },
    {
      id: expiredKeyId,
      serviceId: null,
      scopes: '["services:manage"]',
      expiresAt: now - 1,
    },
  ]) {
    sqlite
      .prepare(
        `INSERT INTO developer_api_keys
          (id, workspace_id, service_id, name, prefix, last_four,
           scopes_json, secret_hash, created_by_account_id,
           created_by_email, created_at, last_used_at, expires_at,
           revoked_at)
         VALUES (?, ?, ?, 'Automation', ?, 'beef', ?, ?, ?,
                 'owner@example.com', 1, NULL, ?, NULL)`,
      )
      .run(
        key.id,
        workspaceId,
        key.serviceId,
        `nzu_live_${key.id.slice(0, 8)}`,
        key.scopes,
        key.id.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
        ownerAccountId,
        key.expiresAt,
      );
  }
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
          const prepared = sqlite.prepare(statement.sql);
          if (/\bRETURNING\b/i.test(statement.sql)) {
            const rows = prepared.all(...statement.bindings);
            return {
              success: true,
              results: rows,
              meta: { changes: rows.length },
            };
          }
          const result = prepared.run(...statement.bindings);
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
