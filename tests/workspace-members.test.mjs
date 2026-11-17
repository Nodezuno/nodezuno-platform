import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import {
  findDeveloperWorkspaceForIdentity,
  inviteDeveloperWorkspaceMember,
  listDeveloperWorkspaceMembers,
  removeDeveloperWorkspaceMember,
  updateDeveloperWorkspaceMemberRole,
} from "../lib/server/database.ts";
import {
  serializeDeveloperWorkspaceMember,
  validateDeveloperWorkspaceMemberInvitePayload,
  validateDeveloperWorkspaceMemberRolePayload,
} from "../lib/server/developer-platform.ts";
import { HttpProblem } from "../lib/server/http.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const invitedUserId = "33333333-3333-4333-8333-333333333333";
const owner = {
  accountId: ownerId,
  email: "owner@example.com",
};

test("workspace member payloads are exact and normalized", () => {
  assert.deepEqual(
    validateDeveloperWorkspaceMemberInvitePayload({
      email: " Dev@Example.org ",
      role: "developer",
    }),
    {
      ok: true,
      value: { email: "dev@example.org", role: "developer" },
    },
  );
  assert.equal(
    validateDeveloperWorkspaceMemberInvitePayload({
      email: "dev@example.org",
      role: "owner",
    }).ok,
    false,
  );
  assert.equal(
    validateDeveloperWorkspaceMemberInvitePayload({
      email: "dev@example.org",
      role: "developer",
      trusted: true,
    }).ok,
    false,
  );
  assert.deepEqual(
    validateDeveloperWorkspaceMemberRolePayload({ role: "admin" }),
    { ok: true, value: { role: "admin" } },
  );
});

test("owners can add, promote, list, and remove redacted-audit members", async () => {
  const sqlite = await createWorkspaceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    const invited = await inviteDeveloperWorkspaceMember({
      actor: owner,
      email: "dev@example.org",
      role: "developer",
      now: 100,
      database,
    });
    assert.equal(invited.created, true);
    assert.equal(invited.member.state, "pending");
    assert.equal(invited.member.accountId, null);

    const duplicate = await inviteDeveloperWorkspaceMember({
      actor: owner,
      email: "dev@example.org",
      role: "developer",
      now: 101,
      database,
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.member.id, invited.member.id);

    const promoted = await updateDeveloperWorkspaceMemberRole({
      actor: owner,
      memberId: invited.member.id,
      role: "admin",
      now: 102,
      database,
    });
    assert.equal(promoted?.role, "admin");

    sqlite
      .prepare(
        `INSERT INTO auth_users
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, 'Developer', 'dev@example.org', 1, 103, 103)`,
      )
      .run(invitedUserId);
    const workspace = await findDeveloperWorkspaceForIdentity(
      { accountId: invitedUserId, email: "dev@example.org" },
      database,
    );
    assert.equal(workspace?.id, workspaceId);
    assert.equal(workspace?.role, "admin");

    const members = await listDeveloperWorkspaceMembers(owner, database);
    const active = members.find((member) => member.id === invited.member.id);
    assert.equal(active?.state, "active");
    assert.equal(active?.accountId, invitedUserId);
    assert.deepEqual(
      Object.keys(serializeDeveloperWorkspaceMember(active)).sort(),
      ["createdAt", "email", "id", "role", "state", "updatedAt"],
    );

    const removed = await removeDeveloperWorkspaceMember({
      actor: owner,
      memberId: invited.member.id,
      now: 104,
      database,
    });
    assert.equal(removed?.role, "admin");
    assert.equal(
      (await listDeveloperWorkspaceMembers(owner, database)).length,
      1,
    );

    const auditDetails = sqlite
      .prepare(
        `SELECT detail_json AS detailJson
         FROM developer_audit_events
         WHERE entity_type = 'workspace_member'
         ORDER BY created_at ASC`,
      )
      .all()
      .map((row) => row.detailJson);
    assert.equal(auditDetails.length, 3);
    assert.equal(
      auditDetails.some((detail) => detail.includes("dev@example.org")),
      false,
    );
  } finally {
    sqlite.close();
  }
});

test("administrators cannot grant admin or remove administrators", async () => {
  const sqlite = await createWorkspaceDatabase();
  const database = sqliteD1Database(sqlite);
  try {
    sqlite
      .prepare(
        `INSERT INTO auth_users
          (id, name, email, email_verified, created_at, updated_at)
         VALUES (?, 'Admin', 'admin@example.org', 1, 10, 10)`,
      )
      .run(invitedUserId);
    const admin = await inviteDeveloperWorkspaceMember({
      actor: owner,
      email: "admin@example.org",
      role: "admin",
      database,
    });
    const adminActor = {
      accountId: invitedUserId,
      email: "admin@example.org",
    };
    await assert.rejects(
      () =>
        inviteDeveloperWorkspaceMember({
          actor: adminActor,
          email: "second@example.org",
          role: "admin",
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        error.status === 403 &&
        error.code === "workspace_member_role_denied",
    );
    await assert.rejects(
      () =>
        removeDeveloperWorkspaceMember({
          actor: adminActor,
          memberId: admin.member.id,
          database,
        }),
      (error) =>
        error instanceof HttpProblem &&
        (error.code === "workspace_member_remove_denied" ||
          error.code === "workspace_member_self_remove"),
    );
  } finally {
    sqlite.close();
  }
});

async function createWorkspaceDatabase() {
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
       VALUES (?, 'team-workspace', 'Team workspace', 'active', 1, 1)`,
    )
    .run(workspaceId);
  sqlite
    .prepare(
      `INSERT INTO developer_workspace_members
        (id, workspace_id, account_id, email, role, created_at, updated_at)
       VALUES ('44444444-4444-4444-8444-444444444444', ?, ?,
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
