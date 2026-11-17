import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { listDeveloperAuditEvents } from "../lib/server/database.ts";
import {
  parseDeveloperAuditCursor,
  parseDeveloperAuditLimit,
  serializeDeveloperAuditEvent,
} from "../lib/server/developer-audit.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const developerId = "33333333-3333-4333-8333-333333333333";
const owner = {
  accountId: ownerId,
  email: "owner@example.com",
};

test("developer audit query inputs are bounded", () => {
  assert.equal(parseDeveloperAuditLimit(null), 25);
  assert.equal(parseDeveloperAuditLimit("100"), 100);
  assert.throws(
    () => parseDeveloperAuditLimit("101"),
    (error) =>
      error instanceof HttpProblem &&
      error.code === "developer_audit_limit_invalid",
  );
  assert.throws(
    () => parseDeveloperAuditCursor("not-a-cursor"),
    (error) =>
      error instanceof HttpProblem &&
      error.code === "developer_audit_cursor_invalid",
  );
});

test("audit pages are stable, tenant-scoped, role-gated, and redacted", async () => {
  const sqlite = await createAuditDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const first = await listDeveloperAuditEvents({
      actor: owner,
      limit: 2,
      cursor: null,
      database,
    });
    assert.deepEqual(
      first.events.map((event) => event.id),
      [
        "99999999-9999-4999-8999-999999999999",
        "88888888-8888-4888-8888-888888888888",
      ],
    );
    assert.ok(first.nextCursor);
    assert.equal(first.events[0].detail.secretHash, undefined);
    assert.deepEqual(first.events[0].detail, {
      prefix: "nzu_live_77777777",
      lastFour: "cdef",
      scopes: ["rpc:invoke"],
      serviceId: "77777777-7777-4777-8777-777777777777",
      expiresAt: 2_000_000_000_000,
    });

    const second = await listDeveloperAuditEvents({
      actor: owner,
      limit: 2,
      cursor: parseDeveloperAuditCursor(first.nextCursor),
      database,
    });
    assert.deepEqual(
      second.events.map((event) => event.id),
      ["66666666-6666-4666-8666-666666666666"],
    );
    assert.equal(second.events[0].action, "future.changed");
    assert.deepEqual(second.events[0].detail, {});
    assert.equal(second.nextCursor, null);

    const serialized = serializeDeveloperAuditEvent(first.events[0]);
    assert.equal(serialized.actor.email, "owner@example.com");
    assert.equal(JSON.stringify(serialized).includes(workspaceId), false);
    assert.equal(JSON.stringify(serialized).includes("secretHash"), false);

    await assert.rejects(
      () =>
        listDeveloperAuditEvents({
          actor: {
            accountId: developerId,
            email: "developer@example.com",
          },
          limit: 25,
          cursor: null,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 403 &&
        error.code === "workspace_access_denied",
    );
  } finally {
    sqlite.close();
  }
});

test("malformed stored audit detail fails closed", async () => {
  const sqlite = await createAuditDatabase();
  try {
    sqlite
      .prepare(
        `UPDATE developer_audit_events
         SET detail_json = '{'
         WHERE id = '99999999-9999-4999-8999-999999999999'`,
      )
      .run();
    await assert.rejects(
      () =>
        listDeveloperAuditEvents({
          actor: owner,
          limit: 25,
          cursor: null,
          database: sqliteD1Database(sqlite),
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 503 &&
        error.code === "developer_audit_unavailable",
    );
  } finally {
    sqlite.close();
  }
});

async function createAuditDatabase() {
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
      `INSERT INTO auth_users
        (id, name, email, email_verified, created_at, updated_at)
       VALUES (?, 'Developer', 'developer@example.com', 1, 1, 1)`,
    )
    .run(developerId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES (?, 'audit-workspace', 'Audit workspace', 'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspaces
        (id, slug, name, status, created_at, updated_at)
       VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
               'separate-workspace', 'Separate workspace', 'active', 1, 1)`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ?, ?,
               'owner@example.com', 'owner', 1, 1)`,
    )
    .run(workspaceId, ownerId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ?, ?,
               'developer@example.com', 'developer', 1, 1)`,
    )
    .run(workspaceId, developerId);

  insertAudit(sqlite, {
    id: "99999999-9999-4999-8999-999999999999",
    workspaceId,
    action: "api_key.created",
    entityType: "api_key",
    entityId: "77777777-7777-4777-8777-777777777777",
    detail: {
      prefix: "nzu_live_77777777",
      lastFour: "cdef",
      scopes: ["rpc:invoke"],
      serviceId: "77777777-7777-4777-8777-777777777777",
      expiresAt: 2_000_000_000_000,
      secretHash: "must-not-escape",
    },
    createdAt: 300,
  });
  insertAudit(sqlite, {
    id: "88888888-8888-4888-8888-888888888888",
    workspaceId,
    action: "service.created",
    entityType: "service",
    entityId: "77777777-7777-4777-8777-777777777777",
    detail: {
      product: "rpc-api",
      environment: "production",
      network: "base",
      region: "global",
      status: "active",
    },
    createdAt: 300,
  });
  insertAudit(sqlite, {
    id: "66666666-6666-4666-8666-666666666666",
    workspaceId,
    action: "future.changed",
    entityType: "service",
    entityId: "77777777-7777-4777-8777-777777777777",
    detail: { secret: "not-for-clients" },
    createdAt: 200,
  });
  insertAudit(sqlite, {
    id: "55555555-5555-4555-8555-555555555555",
    workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    action: "service.created",
    entityType: "service",
    entityId: "44444444-4444-4444-8444-444444444444",
    detail: { product: "rpc-api" },
    createdAt: 400,
  });
  return sqlite;
}

function insertAudit(sqlite, event) {
  sqlite
    .prepare(
      `INSERT INTO developer_audit_events
        (id, workspace_id, actor_account_id, actor_email, api_key_id,
         action, entity_type, entity_id, detail_json, created_at)
       VALUES (?, ?, ?, 'owner@example.com', NULL, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.workspaceId,
      ownerId,
      event.action,
      event.entityType,
      event.entityId,
      JSON.stringify(event.detail),
      event.createdAt,
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
