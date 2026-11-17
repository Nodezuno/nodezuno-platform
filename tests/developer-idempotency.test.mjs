import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  archiveDeveloperService,
  createDeveloperApiKey,
  createDeveloperService,
  listDeveloperServicesForApiKey,
} from "../lib/server/database.ts";
import { createDeveloperApiKeyMaterial } from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const actor = {
  accountId: ownerId,
  email: "owner@example.com",
};
const idempotencyHash = "a".repeat(64);
const requestHash = "b".repeat(64);

test("service creation replays one durable resource for the same request", async () => {
  const sqlite = await createDeveloperDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const options = {
      actor,
      input: {
        product: "platform-api",
        name: "Production identity",
        environment: "production",
        network: "global",
        region: "global",
      },
      idempotencyHash,
      requestHash,
      now: 1_800_000_000_000,
      database,
    };
    const first = await createDeveloperService(options);
    const replay = await createDeveloperService({
      ...options,
      now: 1_800_000_000_001,
    });
    assert.equal(replay.id, first.id);
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM developer_services WHERE workspace_id = ?",
        )
        .get(workspaceId).count,
      1,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM developer_audit_events
           WHERE action = 'service.created'`,
        )
        .get().count,
      1,
    );

    await assert.rejects(
      () =>
        createDeveloperService({
          ...options,
          input: { ...options.input, name: "Changed input" },
          requestHash: "c".repeat(64),
          now: 1_800_000_000_002,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "idempotency_key_reused",
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM developer_services WHERE workspace_id = ?",
        )
        .get(workspaceId).count,
      1,
    );
  } finally {
    sqlite.close();
  }
});

test("API key replay never mints or stores a second plaintext secret", async () => {
  const sqlite = await createDeveloperDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const firstMaterial = createDeveloperApiKeyMaterial();
    const base = {
      actorAccountId: ownerId,
      actorEmail: actor.email,
      name: "CI identity",
      serviceId: null,
      scopes: ["platform:identity"],
      expiresAt: 1_900_000_000_000,
      idempotencyHash,
      requestHash,
      now: 1_800_000_000_000,
      database,
    };
    const first = await createDeveloperApiKey({
      ...base,
      id: firstMaterial.id,
      prefix: firstMaterial.prefix,
      lastFour: firstMaterial.lastFour,
      secretHash: "d".repeat(64),
    });
    assert.equal(first.id, firstMaterial.id);

    const retryMaterial = createDeveloperApiKeyMaterial();
    await assert.rejects(
      () =>
        createDeveloperApiKey({
          ...base,
          id: retryMaterial.id,
          prefix: retryMaterial.prefix,
          lastFour: retryMaterial.lastFour,
          secretHash: "e".repeat(64),
          now: 1_800_000_000_001,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 409 &&
        error.code === "api_key_secret_already_issued",
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM developer_api_keys WHERE workspace_id = ?",
        )
        .get(workspaceId).count,
      1,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM developer_audit_events
           WHERE action = 'api_key.created'`,
        )
        .get().count,
      1,
    );
    const idempotency = sqlite
      .prepare(
        `SELECT idempotency_hash AS idempotencyHash,
                request_hash AS requestHash, resource_id AS resourceId
         FROM developer_mutation_idempotency
         WHERE operation = 'api_key.create'`,
      )
      .get();
    assert.deepEqual({ ...idempotency }, {
      idempotencyHash,
      requestHash,
      resourceId: first.id,
    });
    assert.equal(
      JSON.stringify(idempotency).includes(firstMaterial.secret),
      false,
    );
    assert.equal(
      JSON.stringify(idempotency).includes(retryMaterial.secret),
      false,
    );
  } finally {
    sqlite.close();
  }
});

test("service management keys automate only their own workspace", async () => {
  const sqlite = await createDeveloperDatabase();
  const database = sqliteD1Database(sqlite);
  const now = 1_800_000_000_000;
  try {
    const material = createDeveloperApiKeyMaterial();
    await createDeveloperApiKey({
      actorAccountId: ownerId,
      actorEmail: actor.email,
      id: material.id,
      name: "Service automation",
      prefix: material.prefix,
      lastFour: material.lastFour,
      secretHash: "f".repeat(64),
      serviceId: null,
      scopes: ["services:manage"],
      expiresAt: 1_900_000_000_000,
      idempotencyHash: "1".repeat(64),
      requestHash: "2".repeat(64),
      now,
      database,
    });

    const created = await createDeveloperService({
      workspaceId,
      authorizationApiKeyId: material.id,
      input: {
        product: "rpc-api",
        name: "Base automation",
        environment: "production",
        network: "base",
        region: "global",
      },
      rpcProvisioning: {
        network: "base",
        available: false,
        upstreamCount: 0,
        reason: "not_configured",
      },
      idempotencyHash: "3".repeat(64),
      requestHash: "4".repeat(64),
      now: now + 1,
      database,
    });
    assert.equal(created.workspaceId, workspaceId);
    assert.equal(created.status, "configuration_saved");

    const listed = await listDeveloperServicesForApiKey({
      workspaceId,
      apiKeyId: material.id,
      now: now + 2,
      database,
    });
    assert.deepEqual(listed.map((service) => service.id), [created.id]);

    const audit = sqlite
      .prepare(
        `SELECT actor_account_id AS actorAccountId,
                actor_email AS actorEmail, api_key_id AS apiKeyId
         FROM developer_audit_events
         WHERE action = 'service.created' AND entity_id = ?`,
      )
      .get(created.id);
    assert.deepEqual({ ...audit }, {
      actorAccountId: null,
      actorEmail: null,
      apiKeyId: material.id,
    });

    const archived = await archiveDeveloperService({
      workspaceId,
      authorizationApiKeyId: material.id,
      id: created.id,
      now: now + 3,
      database,
    });
    assert.equal(archived?.archivedAt, now + 3);

    await assert.rejects(
      () =>
        listDeveloperServicesForApiKey({
          workspaceId: "99999999-9999-4999-8999-999999999999",
          apiKeyId: material.id,
          now: now + 4,
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

async function createDeveloperDatabase() {
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
       VALUES (?, 'idempotency-workspace', 'Idempotency workspace',
               'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('33333333-3333-4333-8333-333333333333', ?, ?,
               'owner@example.com', 'owner', 1, 1)`,
    )
    .run(workspaceId, ownerId);
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
